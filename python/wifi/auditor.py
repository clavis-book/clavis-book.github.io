"""Модуль 3: аудитор настроек собственной точки доступа.

Вход — описание настроек (профиль): номера вариантов и числа, без паролей, имён сетей
и адресов. Выход — балл, оценка, находки с рекомендациями и источниками.
"""

import textwrap
from dataclasses import dataclass, field

from wifi.common import DATA_DIR, SCREEN_WIDTH, cite, load_json

RULES_PATH = DATA_DIR / "audit_rules.json"

# Штрафы по уровням. Величины — решение автора.
PENALTIES = {"ok": 0, "info": 0, "low": 5, "medium": 10, "high": 20, "critical": 40}
# Порядок важности: в отчёте сначала самое серьёзное.
LEVEL_ORDER = ["critical", "high", "medium", "low", "info", "ok"]
LEVEL_NAMES = {
    "critical": "критично", "high": "высокий риск", "medium": "средний риск",
    "low": "низкий риск", "info": "к сведению", "ok": "в порядке",
}
GRADES = [(90, "отлично"), (75, "хорошо"), (60, "удовлетворительно"), (0, "неудовлетворительно")]
WORST_GRADE = "неудовлетворительно"

# Протоколы, где пароль Wi-Fi — это парольная фраза WPA/WPA2 длиной 8–63 символа (или 64 hex).
WPA_PASSPHRASE_PROTOCOLS = ("wpa", "wpa_wpa2", "wpa2", "wpa2_wpa3")


@dataclass
class Finding:
    """Одна находка аудита: какое правило, что введено, насколько серьёзно, что делать."""
    rule_no: int
    param: str
    title: str
    value: object
    level: str
    penalty: int
    text: str
    recommendation: str
    basis: str
    sources: list[str]


@dataclass
class AuditResult:
    """Итог аудита: балл 0–100, оценка, находки по убыванию важности, предупреждения."""
    score: int
    grade: str
    findings: list[Finding] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def load_rules(path=RULES_PATH):
    """Загрузить правила аудитора (список, номера 1–12)."""
    return load_json(path)


def rule_applies(rule, profile):
    """Нужно ли правило для этого профиля.

    Для открытой сети и Enhanced Open пароля Wi-Fi нет, поэтому вопросы о его длине
    и виде не задаются и не штрафуются: иначе открытая сеть получила бы штраф дважды.
    """
    return profile.get("protocol") not in rule.get("skip_if_protocol", [])


def range_limits(rule):
    """Наименьшее и наибольшее допустимое число для правила вида range."""
    return min(b["min"] for b in rule["bands"]), max(b["max"] for b in rule["bands"])


def choose_option(rule, value):
    """Вариант (choice) или полоса (range), подходящие под значение; None, если не подходит ничто."""
    if rule["kind"] == "choice":
        for option in rule["options"]:
            if option["value"] == value:
                return option
        return None
    for band in rule["bands"]:
        if band["min"] <= value <= band["max"]:
            return band
    return None


def validate_profile(profile, rules):
    """Проверить профиль: все нужные параметры есть, значения допустимы. Возвращает список ошибок."""
    errors = []
    known = {rule["param"] for rule in rules}
    for param in profile:
        if param not in known:
            errors.append(f"Неизвестный параметр «{param}»")

    for rule in rules:
        param = rule["param"]
        if not rule_applies(rule, profile):
            continue
        if param not in profile:
            errors.append(f"Нет параметра «{param}» (правило {rule['no']})")
            continue
        value = profile[param]
        if rule["kind"] == "range":
            low, high = range_limits(rule)
            # bool — подкласс int в Python, но True вместо длины пароля — ошибка ввода.
            if not isinstance(value, int) or isinstance(value, bool) or not low <= value <= high:
                errors.append(f"«{param}»: нужно целое число от {low} до {high}, а введено {value!r}")
        elif choose_option(rule, value) is None:
            allowed = ", ".join(o["value"] for o in rule["options"])
            errors.append(f"«{param}»: значение {value!r} не из списка ({allowed})")
    return errors


def check_consistency(profile):
    """Противоречия между ответами. Это предупреждения, а не штрафы."""
    warnings = []
    protocol = profile.get("protocol")
    pmf = profile.get("pmf")
    cipher = profile.get("cipher")
    length = profile.get("password_length")

    if protocol == "wpa3" and pmf in ("optional", "off"):
        warnings.append("В режиме «только WPA3» PMF всегда обязательна, а указано иное: проверьте ввод "
                        "и обновите прошивку.")
    if protocol == "wpa2_wpa3" and pmf == "off":
        warnings.append("В переходном режиме WPA2/WPA3 PMF не может быть выключена (по спецификации — "
                        "хотя бы «необязательна»): проверьте ввод.")
    if protocol in ("wpa3", "wpa2_wpa3") and cipher == "tkip":
        warnings.append("WPA3 не использует TKIP, а указан шифр TKIP: проверьте ввод.")
    if protocol in ("wep", "wpa") and cipher == "aes":
        warnings.append("В режиме WEP или WPA (TKIP) шифр AES не используется: проверьте ввод протокола.")
    if protocol in WPA_PASSPHRASE_PROTOCOLS and isinstance(length, int):
        if length > 64:
            warnings.append("Для WPA и WPA2 пароль — не длиннее 63 символов (или ключ из 64 hex): "
                            "проверьте ввод длины.")
        elif length == 64:
            warnings.append("Длина 64 допустима, только если это ключ из 64 шестнадцатеричных символов.")
    # «Гостей нет» + отдельные настройки гостевой сети: в профиле гостевая сеть — один выбор
    # из списка, поэтому такое сочетание ввести нельзя и проверять нечего (журнал изменений
    # плана, версия 4).
    return warnings


def grade_for(score, has_critical):
    """Оценка по баллу. Любая критичная находка — не выше «неудовлетворительно»."""
    if has_critical:
        return WORST_GRADE
    for threshold, grade in GRADES:
        if score >= threshold:
            return grade
    return WORST_GRADE


def audit(profile, rules):
    """Оценить профиль. При неверном профиле — ValueError со списком ошибок."""
    errors = validate_profile(profile, rules)
    if errors:
        raise ValueError("; ".join(errors))

    findings = []
    for rule in rules:
        if not rule_applies(rule, profile):
            continue
        value = profile[rule["param"]]
        option = choose_option(rule, value)
        findings.append(Finding(
            rule_no=rule["no"], param=rule["param"], title=rule["title"], value=value,
            level=option["level"], penalty=option["penalty"], text=option["text"],
            recommendation=option["recommendation"], basis=option["basis"],
            sources=list(option.get("sources", [])),
        ))

    findings.sort(key=lambda f: (LEVEL_ORDER.index(f.level), f.rule_no))
    score = max(0, 100 - sum(f.penalty for f in findings))
    has_critical = any(f.level == "critical" for f in findings)
    return AuditResult(score=score, grade=grade_for(score, has_critical),
                       findings=findings, warnings=check_consistency(profile))


def serious_rule_numbers(result):
    """Номера правил с находками high и critical — по возрастанию (ответ t4_serious в бланке)."""
    return sorted(f.rule_no for f in result.findings if f.level in ("high", "critical"))


def _wrap(text, width, indent="   "):
    return textwrap.wrap(text, width=width, initial_indent=indent, subsequent_indent=indent)


def format_report(result, sources, width=SCREEN_WIDTH):
    """Текст отчёта: оценка, проблемы по убыванию важности с рекомендацией и источниками,
    затем коротко — пункты «к сведению» и номера правил, где всё в порядке."""
    head = f"Оценка: {result.grade} (балл {result.score} из 100)"
    if any(f.level == "critical" for f in result.findings):
        head += "; есть критичная находка — итог не выше «неудовлетворительно»"
    lines = textwrap.wrap(head, width=width, subsequent_indent="   ")
    for warning in result.warnings:
        lines.extend(textwrap.wrap("Внимание: " + warning, width=width, subsequent_indent="   "))

    problems = [f for f in result.findings if f.penalty > 0]
    if problems:
        lines.append("Что исправить (сначала самое важное):")
    for i, f in enumerate(problems, start=1):
        head = f"{i}. №{f.rule_no} {f.title} — {LEVEL_NAMES[f.level]} (−{f.penalty}): {f.text}"
        lines.extend(textwrap.wrap(head, width=width, subsequent_indent="   "))
        # Рекомендация, основание и источники — одним абзацем: так отчёт для плохого
        # профиля укладывается в 40 строк (критерий готовности 2.3).
        # Основание печатается, только если это решение автора: «источник» и так видно по ссылкам.
        advice = f"→ {f.recommendation}."
        if f.basis == "решение автора":
            advice += " Оценка — решение автора."
        if f.sources:
            advice += " " + cite(f.sources, sources, width=10**6)
        lines.extend(_wrap(advice, width))

    notes = [f for f in result.findings if f.level == "info"]
    for f in notes:
        # Ссылки нужны и здесь: «к сведению» — это, например, «дополнение к лекции» про
        # скрытое имя сети, и студент должен видеть, на чём оно основано.
        note = f"К сведению, №{f.rule_no} {f.title}: {f.recommendation}."
        if f.sources:
            note += " " + cite(f.sources, sources, width=10**6)
        lines.extend(textwrap.wrap(note, width=width, subsequent_indent="   "))

    good = [str(f.rule_no) for f in result.findings if f.level == "ok"]
    if good:
        lines.append("В порядке: правила № " + ", ".join(good))
    return "\n".join(lines)
