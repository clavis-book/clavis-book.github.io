"""Модуль 4: варианты для преподавателя — задания, бланк ответов, ключ и автопроверка.

Каждый «случайный» выбор делается функцией derive — это HMAC от секрета преподавателя. Поэтому:
- один и тот же секрет и ID студента всегда дают один и тот же вариант — на любом ПК и в любой
  версии Python;
- без секрета нельзя узнать чужой вариант и его ответы.
Модуль random и множества (set) здесь не используются: порядок их результатов меняется от запуска
к запуску и между версиями Python, и варианты перестали бы совпадать.
"""

import csv
import hashlib
import hmac
import json
import re
import secrets
import textwrap
from pathlib import Path

from wifi.auditor import GRADES, audit, load_rules, rule_applies, serious_rule_numbers
from wifi.common import DATA_DIR, PROJECT_DIR, ROOT_DIR, SCREEN_WIDTH, format_table, load_json, parse_number
from wifi.principles import (
    collision_probability_bits,
    count_for_probability,
    crc32_hex,
    hmac_sha256_hex,
    load_principles,
)
from wifi.reference import field_label, load_protocols

# Банк вопросов с ответами. Закрытый банк — только у преподавателя: файл questions.json в его
# папке, рядом с секретом. В проекте — демо-банк для тестов и пробы: он в teacher_data/, а не
# в data/, потому что data/ уходит на учебные ПК, а копия для студентов teacher_data/ не берёт.
TEACHER_DATA_DIR = PROJECT_DIR / "teacher_data"
QUESTIONS_PATH = TEACHER_DATA_DIR / "questions_demo.json"
BANK_FILE_NAME = "questions.json"

VARIANT_VERSION = 1
VARIANT_FIELDS = ("student_id", "group", "version", "profile", "tasks")
KEY_FILE_NAME = "_KEY_answers.json"
SECRET_FILE_NAME = "secret.txt"

# ID — латиница в нижнем регистре, цифры и «_»: кириллица путается с латиницей (С/C)
# и портится в архивах Проводника.
STUDENT_ID_RE = re.compile(r"[a-z][a-z0-9_]{1,31}")

# Задание 1: поля таблицы с ошибками. Год не берём: подмену года видно без справочника.
TABLE_FIELDS = ["authentication", "encryption", "integrity", "key_management", "nonce", "status"]
# Подмены, которые не были бы ошибкой: текст другого протокола верен и для этого.
# (поле, протокол) → чьё значение подставлять нельзя. Например, «48-битный счётчик PN» из WPA2
# верно и для WPA3, а в строке WPA2 текст WPA3 начинался бы со слов «Как в WPA2».
NOT_A_MISTAKE = {
    ("encryption", "wpa2"): ["wpa3"],
    ("encryption", "wpa3"): ["wpa2"],       # AES-CCMP 128 — это и есть WPA3-Personal
    ("integrity", "wpa3"): ["wpa2"],        # MIC на основе AES (CCMP) есть и в WPA3
    ("key_management", "wpa"): ["wpa2"],    # 4-шаговое рукопожатие было уже в WPA
    ("key_management", "wpa3"): ["wpa2"],   # после SAE в WPA3 то же 4-шаговое рукопожатие
    ("nonce", "wpa2"): ["wpa3"],
    ("nonce", "wpa3"): ["wpa2"],
}
TABLE_FIELD_COUNT = 3
TABLE_ERROR_COUNT = 4
BANK_QUESTION_COUNT = 2
WRITTEN_QUESTION_COUNT = 2

# Задание 2: b из списка, n = round(k·√(2^b)), k = 0,5…2,5 с шагом 0,1.
# k = 1,0 пропущено: тогда n = √N — ровно ответ на «оценку на глаз», он был бы виден в варианте.
BITS_CHOICES = [16, 20, 24, 28, 32]
K_TENTHS = [k for k in range(5, 26) if k != 10]
PROBABILITY_CHOICES = [0.1, 0.25, 0.5, 0.75, 0.9, 0.99]

# Задание 3: учебный словарь. Только латиница — чтобы байты фразы были одинаковы у всех.
PHRASE_WORDS = ["alma", "aral", "baiterek", "dala", "dombra", "esil", "kobyz", "kumis",
                "nomad", "orda", "saka", "shanyrak", "steppe", "tulpar", "yurta", "zhailau"]
KEY_WORDS = ["altyn", "aspan", "bulak", "kokpar", "kunes", "samruk", "tau", "zhuldyz"]

# Задание 4: профиль роутера под целевую оценку. Начало — хорошо настроенный роутер,
# затем подменяются настройки нужных уровней.
GRADE_NAMES = [grade for _, grade in GRADES]  # отлично, хорошо, удовлетворительно, неудовлетворительно
GRADE_RECIPES = {
    "отлично": [["low"], ["low", "low"], ["info", "low"]],
    "хорошо": [["medium", "low"], ["medium", "low", "low"]],
    "удовлетворительно": [["high", "medium"], ["high", "medium", "low"]],
    "неудовлетворительно": [["critical"], ["critical", "medium"], ["high", "high", "medium"]],
}
BASE_PROFILE = {
    "protocol": "wpa3", "cipher": "aes", "password_length": 24, "password_kind": "random",
    "wps": "off", "pmf": "required", "firmware": "recent", "guest": "separate", "ssid": "neutral",
    "remote_admin": "off", "admin_password": "changed", "hidden_ssid_mac": "off",
}
# Правило 12 всегда «к сведению» без штрафа — как проблема для задания оно ничего не даёт.
RULES_NOT_USED_AS_PROBLEMS = [12]
PROFILE_ATTEMPTS = 100

# Автопроверка: 55 баллов. Ключ — поле ответа, значение — максимум баллов.
AUTO_POINTS = {
    "t1_errors": 12, "t1_q1": 4, "t1_q2": 4,
    "t2_estimate": 2, "t2_probability": 5, "t2_count": 5,
    "t3_crc": 5, "t3_hmac16": 5,
    "t4_grade": 5, "t4_serious": 8,
}
POINTS_PER_TABLE_ERROR = 3
PROBABILITY_TOLERANCE = 0.005
COUNT_TOLERANCE = 0.01      # ± 1 %
ESTIMATE_FACTOR = 2         # оценка «на глаз» — в пределах 2 раз от √N
NO_SERIOUS_WORDS = ["нет", "no", "none"]
# Слова, которые можно писать рядом с номерами правил: «правила 1 и 5».
NUMBER_LIST_WORDS = ["и", "правила", "правило", "номера"]

# Строки бланка: (поле, подсказка над ним). Подсказки — отдельными строками-комментариями,
# чтобы студент писал ответ сразу после двоеточия и не задевал подсказку.
BLANK_LINES = [
    ("t1_err1", "Задание 1. Четыре ошибки в таблице: протокол.поле, например wpa2.integrity"),
    ("t1_err2", None), ("t1_err3", None), ("t1_err4", None),
    ("t1_q1", "Вопросы 1 и 2 задания 1: номер варианта ответа"),
    ("t1_q2", None),
    ("t2_estimate", "Задание 2. Оценка «на глаз» ДО расчёта: после скольких значений повтор станет вероятным"),
    ("t2_probability", "Вероятность хотя бы одного совпадения для n из варианта, 3 знака после запятой"),
    ("t2_count", "Наименьшее число значений для вероятности p из варианта"),
    ("t2_conclusion", "Вывод: 3–4 предложения в одну строку"),
    ("t3_crc", "Задание 3. CRC-32 фразы варианта (8 шестнадцатеричных символов)"),
    ("t3_hmac16", "Первые 16 шестнадцатеричных символов HMAC-SHA256 с ключом 1"),
    ("t3_table", "Таблица свойств по результатам опыта, в одну строку: замечает ли каждая проверка "
                 "случайную ошибку, нужен ли ей секретный ключ, меняется ли значение при смене ключа"),
    ("t3_conclusion", "Вывод: почему для целостности нужен код с ключом и почему зашифрованная CRC его не заменяет"),
    ("t4_grade", "Задание 4. Оценка аудита: отлично / хорошо / удовлетворительно / неудовлетворительно"),
    ("t4_serious", "Номера правил с находками «высокий риск» и «критично» через запятую; если таких нет — «нет»"),
    ("t4_problem1", "Три строки: проблема — принцип или риск — исправление — источник. "
                    "Если находок со штрафом меньше трёх — настройка из «В порядке» — от какого риска "
                    "защищает — почему её не менять — источник"),
    ("t4_problem2", None), ("t4_problem3", None),
    ("w1", "Письменные вопросы варианта"),
    ("w2", None),
    ("ethics", "Правила этики соблюдены: не вводила (не вводил) реальные пароли и имена сетей — да / нет"),
]
ANSWER_FIELDS = ["student_id"] + [field for field, _ in BLANK_LINES]

# Столбцы results.csv: (ключ, заголовок). Ручные — пустые, их заполняет преподаватель.
RESULT_COLUMNS = [
    ("student_id", "ID"), ("name", "ФИО"),
    ("t1_errors", "З1 ошибки таблицы (12)"), ("t1_q", "З1 вопросы (8)"),
    ("t2_estimate", "З2 оценка на глаз (2)"), ("t2_probability", "З2 вероятность (5)"),
    ("t2_count", "З2 число значений (5)"),
    ("t3_crc", "З3 CRC-32 (5)"), ("t3_hmac16", "З3 HMAC (5)"),
    ("t4_grade", "З4 оценка (5)"), ("t4_serious", "З4 номера правил (8)"),
    ("auto_total", "Автобаллы (55)"),
    ("m_t2", "З2 вывод (8)"), ("m_t3_table", "З3 таблица (4)"), ("m_t3", "З3 вывод (6)"),
    ("m_t4", "З4 проблемы (12)"), ("m_w1", "Вопрос 1 (6)"), ("m_w2", "Вопрос 2 (6)"),
    ("m_ethics", "Этика (3)"), ("total", "Итог (100)"), ("notes", "Замечания"),
]


# ---------- Детерминированный выбор ----------

def derive(secret, student_id, field, n):
    """Число из [0; n), которое зависит только от секрета, ID и названия поля.

    int.from_bytes(HMAC-SHA256(secret, "ID|поле")[:8], "big") % n. Без секрета значение
    не предсказать, а с тем же секретом оно всегда одно и то же.
    """
    if n < 1:
        raise ValueError("Выбирать не из чего: список пуст")
    digest = hmac.new(secret, f"{student_id}|{field}".encode("utf-8"), hashlib.sha256).digest()
    return int.from_bytes(digest[:8], "big") % n


def pick(secret, student_id, field, items):
    """Один элемент списка, выбранный через derive."""
    return items[derive(secret, student_id, field, len(items))]


def pick_distinct(secret, student_id, field, items, count):
    """count разных элементов списка: каждый следующий — из оставшихся (поля field1, field2, …)."""
    remaining = list(items)
    chosen = []
    for i in range(1, count + 1):
        chosen.append(remaining.pop(derive(secret, student_id, f"{field}{i}", len(remaining))))
    return chosen


def secret_fingerprint(secret):
    """Короткий «отпечаток» секрета для ключа ответов: по нему видно, что секрет сменился.

    Сам секрет по отпечатку не восстановить — это HMAC с постоянной строкой.
    """
    return hmac.new(secret, b"wifi_practicum fingerprint", hashlib.sha256).hexdigest()[:16]


# ---------- Данные для вариантов ----------

def load_questions(path=None):
    """Банк вопросов: {"questions": [...], "written": [...]}. Только для преподавателя.

    Путь по умолчанию берётся при вызове, а не при загрузке модуля: так тест может подменить
    QUESTIONS_PATH и убедиться, что меню студента без банка работает.
    """
    return load_json(path or QUESTIONS_PATH)


def bank_path(key_dir):
    """Закрытый банк из папки преподавателя, если он там есть; иначе — демо-банк проекта."""
    path = Path(key_dir) / BANK_FILE_NAME
    return path if path.is_file() else QUESTIONS_PATH


def load_variant_data(questions_path=None):
    """Всё, из чего строится вариант: справочник, правила, принципы, банк вопросов."""
    return {"protocols": load_protocols(), "rules": load_rules(),
            "principles": load_principles(), "questions": load_questions(questions_path)}


def normalize_student_id(text):
    """ID студента: без пробелов по краям, в нижнем регистре. Неверный ID — ValueError."""
    student_id = text.strip().lower()
    if not STUDENT_ID_RE.fullmatch(student_id):
        raise ValueError(f"ID «{text.strip()}» не подходит: нужны латинские буквы, цифры и «_», "
                         "первая — буква, например is23_07 (кириллица не допускается)")
    return student_id


def group_of(student_id):
    """Группа — часть ID до последнего «_»: is23_07 → is23."""
    return student_id.rsplit("_", 1)[0] if "_" in student_id else ""


# ---------- Задание 1: таблица с ошибками и вопросы ----------

def make_table_task(secret, student_id, protocols):
    """Таблица 4 протоколов по 3 полям, где 4 ячейки взяты у другого протокола.

    Возвращает (таблица {протокол: {поле: текст}}, поля, ответы ["wpa2.integrity", ...]).
    """
    chosen = pick_distinct(secret, student_id, "t1_field", TABLE_FIELDS, TABLE_FIELD_COUNT)
    fields = [f for f in TABLE_FIELDS if f in chosen]  # столбцы — всегда в одном порядке
    table = {p["id"]: {f: p[f] for f in fields} for p in protocols}
    cells = [(p["id"], f) for p in protocols for f in fields]
    errors = pick_distinct(secret, student_id, "t1_cell", cells, TABLE_ERROR_COUNT)
    for pid, f in errors:
        # Донор — другой протокол с другим текстом, и его текст для этого протокола неверен.
        donors = [p for p in protocols if p["id"] != pid and p[f] != table[pid][f]
                  and p["id"] not in NOT_A_MISTAKE.get((f, pid), [])]
        donor = pick(secret, student_id, f"t1_donor_{pid}.{f}", donors)
        table[pid][f] = donor[f]
    answers = sorted(f"{pid}.{f}" for pid, f in errors)
    return table, fields, answers


def make_bank_questions(secret, student_id, questions, principles):
    """2 вопроса банка. У вопросов «выбор» варианты перемешаны, у «принцип» — 4 принципа по порядку.

    Возвращает (вопросы для варианта, номера верных ответов).
    """
    bank = sorted(questions, key=lambda q: q["id"])
    shown, answers = [], []
    for q in pick_distinct(secret, student_id, "t1_question", bank, BANK_QUESTION_COUNT):
        if q["type"] == "principle":
            options = [p["title"] for p in sorted(principles, key=lambda p: p["no"])]
            answer = q["answer"]
        else:
            order = pick_distinct(secret, student_id, f"t1_options_{q['id']}",
                                  list(range(len(q["options"]))), len(q["options"]))
            options = [q["options"][i] for i in order]
            answer = order.index(q["answer"] - 1) + 1
        shown.append({"id": q["id"], "text": q["text"], "options": options})
        answers.append(answer)
    return shown, answers


def make_written_questions(secret, student_id, written, bank_ids, questions):
    """2 письменных вопроса (контрольные вопросы 3–7 лекции), не повторяющих вопросы банка.

    Если вопрос банка уже про контрольный вопрос N лекции, письменный вопрос N не берётся.
    """
    taken = [q.get("lecture_question") for q in questions if q["id"] in bank_ids]
    pool = sorted((w for w in written if w["lecture_question"] not in taken),
                  key=lambda w: w["lecture_question"])
    chosen = pick_distinct(secret, student_id, "written", pool, WRITTEN_QUESTION_COUNT)
    chosen.sort(key=lambda w: w["lecture_question"])
    return [{"lecture_question": w["lecture_question"], "text": w["text"]} for w in chosen]


# ---------- Задания 2 и 3: числа и слова ----------

def make_collision_task(secret, student_id):
    """b, n = round(k·√(2^b)) и p для задания 2. Всё целыми числами — без ошибок округления."""
    bits = pick(secret, student_id, "t2_bits", BITS_CHOICES)
    k_tenths = pick(secret, student_id, "t2_k", K_TENTHS)
    # √(2^b) = 2^(b/2) — целое, потому что все b чётные; (x + 5) // 10 — округление x/10.
    n = (k_tenths * 2 ** (bits // 2) + 5) // 10
    p = pick(secret, student_id, "t2_p", PROBABILITY_CHOICES)
    return {"bits": bits, "n": n, "p": p}


def make_crc_task(secret, student_id):
    """Фраза из 3 слов и два разных ключа «слово-число» для задания 3."""
    phrase = " ".join(pick_distinct(secret, student_id, "t3_phrase", PHRASE_WORDS, 3))
    word1, word2 = pick_distinct(secret, student_id, "t3_key", KEY_WORDS, 2)
    number = 10 + derive(secret, student_id, "t3_key_number", 90)
    return {"phrase": phrase, "key": f"{word1}-{number}", "key2": f"{word2}-{number}"}


# ---------- Задание 4: профиль под оценку ----------

def problem_candidates(secret, student_id, rules):
    """Возможные «проблемы» по уровням: {уровень: [(номер правила, параметр, значение), ...]}.

    Для правила-диапазона (длина пароля) значение берётся внутри полосы через derive.
    """
    candidates = {}
    for rule in rules:
        if rule["no"] in RULES_NOT_USED_AS_PROBLEMS:
            continue
        variants = rule["options"] if rule["kind"] == "choice" else rule["bands"]
        for option in variants:
            if option["level"] == "ok":
                continue
            if rule["kind"] == "choice":
                value = option["value"]
            else:
                size = option["max"] - option["min"] + 1
                value = option["min"] + derive(secret, student_id, f"t4_length_{option['min']}", size)
            candidates.setdefault(option["level"], []).append((rule["no"], rule["param"], value))
    return candidates


def make_profile(secret, student_id, rules):
    """Профиль роутера, у которого аудит даёт целевую оценку и нет противоречий.

    Целевая оценка — derive(..., "grade", 4). Набор уровней проблем — из GRADE_RECIPES.
    Если профиль получился противоречивым (например, WEP + шифр AES) или с другой оценкой,
    берётся следующая попытка — тоже детерминированная.
    """
    grade = GRADE_NAMES[derive(secret, student_id, "grade", len(GRADE_NAMES))]
    candidates = problem_candidates(secret, student_id, rules)
    for attempt in range(PROFILE_ATTEMPTS):
        tag = f"t4_{attempt}"
        recipe = pick(secret, student_id, f"{tag}_recipe", GRADE_RECIPES[grade])
        draft, used = dict(BASE_PROFILE), []
        for i, level in enumerate(recipe):
            pool = [c for c in candidates[level] if c[0] not in used]
            rule_no, param, value = pick(secret, student_id, f"{tag}_problem{i}", pool)
            draft[param] = value
            used.append(rule_no)
        # Неприменимые вопросы (пароль у открытой сети) в профиль не попадают — как в меню.
        profile = {}
        for rule in rules:
            if rule_applies(rule, profile):
                profile[rule["param"]] = draft[rule["param"]]
        result = audit(profile, rules)
        if result.grade == grade and not result.warnings:
            return profile, result
    raise ValueError(f"Не удалось подобрать профиль для {student_id}: проверьте audit_rules.json")


# ---------- Вариант целиком ----------

def make_variant(secret, student_id, data):
    """Вариант студента и ключ к нему: (variant, key).

    В варианте — только поля VARIANT_FIELDS; ключ вычисляется теми же функциями модулей 1–3,
    что и у студента в меню.
    """
    student_id = normalize_student_id(student_id)
    table, fields, table_answers = make_table_task(secret, student_id, data["protocols"])
    questions = data["questions"]["questions"]
    shown, bank_answers = make_bank_questions(secret, student_id, questions, data["principles"])
    written = make_written_questions(secret, student_id, data["questions"]["written"],
                                     [q["id"] for q in shown], questions)
    t2 = make_collision_task(secret, student_id)
    t3 = make_crc_task(secret, student_id)
    profile, result = make_profile(secret, student_id, data["rules"])

    variant = {
        "student_id": student_id,
        "group": group_of(student_id),
        "version": VARIANT_VERSION,
        "profile": profile,
        "tasks": {
            "t1": {"fields": fields, "table": table, "questions": shown},
            "t2": t2,
            "t3": t3,
            "written": written,
        },
    }
    phrase = t3["phrase"].encode("utf-8")
    key = {
        "t1_errors": table_answers,
        "t1_q1": bank_answers[0],
        "t1_q2": bank_answers[1],
        "t2_estimate": 2 ** (t2["bits"] // 2),
        "t2_probability": collision_probability_bits(t2["n"], t2["bits"]),
        "t2_count": count_for_probability(t2["p"], t2["bits"])[0],
        "t3_crc": crc32_hex(phrase),
        "t3_hmac16": hmac_sha256_hex(t3["key"].encode("utf-8"), phrase)[:16],
        "t4_grade": result.grade,
        "t4_serious": serious_rule_numbers(result),
    }
    return variant, key


def variant_text(variant):
    """Файл варианта как текст. Порядок ключей и отступы постоянны — файлы совпадают побайтно."""
    return json.dumps(variant, ensure_ascii=False, indent=2) + "\n"


def load_variant(path, student_id):
    """Прочитать файл варианта и проверить его. Неверный файл — ValueError с понятным текстом."""
    try:
        variant = load_json(path)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ValueError(f"Файл {path.name} повреждён: попросите преподавателя выдать его заново") from None
    if not isinstance(variant, dict) or sorted(variant) != sorted(VARIANT_FIELDS):
        raise ValueError(f"Файл {path.name} — не файл варианта практикума")
    if variant["student_id"] != student_id:
        raise ValueError(f"В файле {path.name} вариант другого студента ({variant['student_id']})")
    if variant["version"] != VARIANT_VERSION:
        raise ValueError(f"Вариант создан другой версией программы ({variant['version']}), "
                         f"нужна версия {VARIANT_VERSION}")
    return variant


# ---------- Текст заданий для меню 4 ----------

def _wrapped(text, width, indent=""):
    """Абзац с переносом по словам; продолжение — с отступом."""
    return textwrap.wrap(text, width=width, initial_indent=indent,
                         subsequent_indent=indent + "   ") or [""]


def option_label(rule, value):
    """Подпись значения профиля: «WPA2-Personal (AES/CCMP)» вместо «wpa2»; у длины — само число."""
    if rule["kind"] == "range":
        return str(value)
    for option in rule["options"]:
        if option["value"] == value:
            return option["label"]
    return str(value)


def format_variant(variant, data, width=SCREEN_WIDTH):
    """Текст всех заданий варианта для консоли (строки не длиннее width)."""
    tasks = variant["tasks"]
    t1, t2, t3 = tasks["t1"], tasks["t2"], tasks["t3"]
    # Группа — часть ID до «_»; у ID без «_» её нет, и пустые скобки не печатаются.
    group = f" (группа {variant['group']})" if variant["group"] else ""
    lines = [f"Вариант {variant['student_id']}{group}", ""]

    lines += _wrapped("Задание 1. В таблице 4 ячейки содержат значение того же поля от другого протокола. "
                      "Найдите их, сверяясь со справочником (пункт 1 меню). Ответ — протокол.поле, "
                      "например wpa2.integrity.", width)
    for f in t1["fields"]:
        rows = [{"protocol": pid, "value": values[f]} for pid, values in t1["table"].items()]
        lines.append("")
        lines += format_table(rows, [("protocol", "Протокол"), ("value", f"{field_label(f)} ({f})")],
                              width).splitlines()
    for i, q in enumerate(t1["questions"], start=1):
        lines.append("")
        lines += _wrapped(f"Вопрос {i}. {q['text']}", width)
        for j, option in enumerate(q["options"], start=1):
            lines += _wrapped(f"{j}) {option}", width, indent="  ")

    lines.append("")
    p_text = f"{t2['p']:g}".replace(".", ",")  # дробь — с запятой, как в русской раскладке
    n_text = f"{t2['n']:,}".replace(",", " ")  # 144 179: меню 2 принимает число и с пробелами
    lines += _wrapped(f"Задание 2. Значения длиной b = {t2['bits']} бит, N = 2^{t2['bits']}. Сначала оцените "
                      "на глаз, после скольких значений повтор станет вероятным. Затем посчитайте (пункт 2 "
                      f"меню, задание 5): вероятность хотя бы одного совпадения для n = {n_text} значений и "
                      f"наименьшее число значений для вероятности p = {p_text}.", width)
    lines.append("")
    lines += _wrapped(f"Задание 3. Фраза: «{t3['phrase']}», ключ 1: «{t3['key']}», ключ 2: «{t3['key2']}». "
                      "Найдите CRC-32 фразы и первые 16 символов HMAC-SHA256 с ключом 1 (пункт 2 меню, "
                      "задание 6 — фраза и ключи уже подставлены). Затем измените один символ фразы и "
                      "сравните; составьте таблицу свойств и вывод.", width)
    lines.append("")
    lines += _wrapped("Задание 4. Профиль роутера. Проведите аудит (здесь, в пункте «Аудит профиля "
                      "задания 4», или вводом по шагам в пункте 3), запишите оценку и номера правил с "
                      "серьёзными находками; для 3 главных проблем — принцип или риск, исправление и источник. "
                      "Если находок со штрафом меньше трёх, в остальных строках разберите настройки из "
                      "«В порядке»: от какого риска они защищают или какой принцип соблюдают; источники "
                      "правил — в приложении к лабораторной работе.", width)
    for rule in data["rules"]:
        if rule["param"] in variant["profile"]:
            value = option_label(rule, variant["profile"][rule["param"]])
            lines += _wrapped(f"{rule['no']}. {rule['title']}: {value}", width, indent="  ")

    lines.append("")
    lines.append("Письменные вопросы (ответы — w1 и w2 в бланке):")
    for i, w in enumerate(tasks["written"], start=1):
        lines += _wrapped(f"w{i} (контрольный вопрос {w['lecture_question']} лекции). {w['text']}", width,
                          indent="  ")
    return "\n".join(lines)


# ---------- Бланк ответов ----------

def blank_name(student_id):
    return f"answers_{student_id}.txt"


def blank_answers(variant, answers=None):
    """Текст бланка answers_<id>.txt. answers — заполнить значениями (для тестов и демонстрации)."""
    answers = answers or {}
    lines = [
        f"# Бланк ответов. Вариант {variant['student_id']}.",
        "# Пишите ответ после двоеточия в той же строке. Дробные числа — с точкой или запятой.",
        "# Строки с # — подсказки, их можно не трогать. Не вводите реальные пароли и имена сетей.",
        "# Сохраните файл (Ctrl+S) в кодировке UTF-8 и сдайте преподавателю.",
        f"student_id: {variant['student_id']}",
    ]
    for field, hint in BLANK_LINES:
        if hint:
            lines.append(f"# {hint}")
        value = answers.get(field, "")
        lines.append(f"{field}: {value}".rstrip())
    return "\n".join(lines) + "\n"


def answers_from_key(key):
    """Верные ответы в виде полей бланка — так их записал бы студент (для тестов и папки demo/)."""
    answers = {f"t1_err{i}": cell for i, cell in enumerate(key["t1_errors"], start=1)}
    answers.update({
        "t1_q1": str(key["t1_q1"]),
        "t1_q2": str(key["t1_q2"]),
        "t2_estimate": str(key["t2_estimate"]),
        "t2_probability": f"{key['t2_probability']:.3f}".replace(".", ","),
        "t2_count": str(key["t2_count"]),
        "t3_crc": key["t3_crc"],
        "t3_hmac16": key["t3_hmac16"],
        "t4_grade": key["t4_grade"],
        "t4_serious": ", ".join(str(n) for n in key["t4_serious"]) or "нет",
    })
    return answers


def parse_answers(text):
    """Разбор бланка: строки «поле: значение» → словарь {поле: значение}.

    Пропускаются пустые строки и комментарии #; BOM, переводы строк Windows и регистр
    не мешают. Значение — всё после первого двоеточия. Если ответ написан на следующей
    строке под пустым полем, он относится к этому полю. Если поле встречается дважды,
    берётся последнее непустое значение. Строки с неизвестными полями пропускаются.
    """
    answers = {}
    waiting = None  # поле, после двоеточия которого ничего не написано
    for line in text.lstrip("﻿").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, colon, value = line.partition(":")
        name, value = name.strip().lower(), value.strip()
        if colon and name in ANSWER_FIELDS:
            if value or name not in answers:
                answers[name] = value
            waiting = None if value else name
        elif waiting:
            answers[waiting] = line
            waiting = None
    return answers


# ---------- Проверка ответов ----------

def _plain(text):
    """Нижний регистр и «е» вместо «ё»: так «Отлично» и «отлично» — одно и то же."""
    return text.lower().replace("ё", "е")


def _unique_sorted(numbers):
    """Числа по возрастанию без повторов: [5, 1, 1] → [1, 5]."""
    result = []
    for n in sorted(numbers):
        if n not in result:
            result.append(n)
    return result


def _cell(text):
    """«WPA2.integrity», «wpa2 integrity», «wpa2-integrity» → «wpa2.integrity»; иначе None."""
    words = re.findall(r"[a-z0-9_]+", text.lower())
    return f"{words[0]}.{words[1]}" if len(words) == 2 else None


def _hex(text):
    """Шестнадцатеричная строка без пробелов и префикса 0x, в нижнем регистре."""
    cleaned = re.sub(r"\s+", "", text).lower()
    return cleaned[2:] if cleaned.startswith("0x") else cleaned


def _number(text):
    """Число из ответа или None: «0,525», «0.525», «4 823», «≈ 4000», «52,5 %» (→ 0,525)."""
    cleaned = text.replace("≈", "").replace("~", "").strip()
    percent = cleaned.endswith("%")
    if percent:
        cleaned = cleaned[:-1]
    try:
        value = parse_number(cleaned)
    except ValueError:
        return None
    return value / 100 if percent else value


def _estimate(text):
    """Оценка «на глаз»: число или степень двойки — «2^16» (так естественно записать √(2^32))."""
    match = re.fullmatch(r"\s*[≈~]?\s*2\s*\^\s*(\d{1,3})\s*", text)
    if match:
        return 2 ** int(match.group(1))
    return _number(text)


def _option_number(text):
    """Номер варианта ответа: «2», «2)», «2) потоковый шифр RC4» → 2; иначе None.

    Берётся только число в начале: в «2) … RC4» есть и «4», но это часть текста варианта.
    """
    match = re.match(r"\s*(\d{1,3})", text)
    return int(match.group(1)) if match else None


def _grade(text):
    """Оценка из ответа: ровно одна из 4 оценок, целым словом; иначе None.

    Подходят «Хорошо.» и «неудовлетворительно (балл 50 из 100)» — так её копируют из отчёта.
    Ищутся целые слова, потому что «удовлетворительно» — часть «неудовлетворительно».
    """
    words = re.findall(r"[а-я]+", _plain(text))
    found = [grade for grade in GRADE_NAMES if _plain(grade) in words]
    return _plain(found[0]) if len(found) == 1 else None


def _serious(text):
    """Номера правил из ответа или None, если ответ не разобрать.

    «1, 5», «5 и 1», «№1, №5», «правила 1 и 5» → [1, 5]; «нет», «Нет.», «нет таких», «—», «0» → [].
    Число из 4 и больше цифр — мусор (правил всего 12), такой ответ не разбирается.
    """
    plain = _plain(text)
    if re.search(r"\d{4,}", plain):
        return None
    numbers = [int(n) for n in re.findall(r"\d+", plain)]
    words = re.findall(r"[a-zа-я]+", plain)
    if numbers == [0] and not words:
        return []
    if not numbers:
        only_dashes = not re.sub(r"[\s.,;!—–-]", "", plain)
        return [] if only_dashes or any(w in NO_SERIOUS_WORDS for w in words) else None
    if [w for w in words if w not in NUMBER_LIST_WORDS]:
        return None  # кроме номеров есть другие слова — непонятно, что имелось в виду
    return _unique_sorted(numbers)


def _verdict(text, value, is_right):
    """Итог по одному полю: None — верно, иначе замечание для results.csv."""
    if not text.strip():
        return "не заполнено"
    if value is None:
        return "не удалось разобрать"
    return None if is_right else "неверно"


def check_answers(answers, key):
    """Автопроверка одного бланка. Возвращает {"points": {...}, "total": int, "notes": [...]}.

    Допуски: оценка на глаз — в пределах 2 раз от √N; вероятность ± 0,005;
    наименьшее число значений ± 1 %; hex — точно, без учёта регистра и пробелов; аудит —
    оценка и набор номеров правил. Ошибки таблицы: по 3 балла за верную ячейку, учитываются
    первые 4 ответа, лишние не штрафуются. Все баллы целые.
    """
    points = {item: 0 for item in AUTO_POINTS}
    notes = []

    # Задание 1: ячейки с ошибками. Одна и та же ячейка дважды считается один раз.
    found = []
    for i in range(1, TABLE_ERROR_COUNT + 1):
        cell = _cell(answers.get(f"t1_err{i}", ""))
        if cell in key["t1_errors"] and cell not in found:
            found.append(cell)
    points["t1_errors"] = POINTS_PER_TABLE_ERROR * len(found)
    if len(found) < TABLE_ERROR_COUNT:
        notes.append(f"t1_err: верно {len(found)} из {TABLE_ERROR_COUNT}")

    # Остальные поля: сначала для каждого — (разобранное значение, верно ли), потом баллы.
    text = {field: answers.get(field, "") for field in AUTO_POINTS}
    checked = {}
    for field in ("t1_q1", "t1_q2"):
        value = _option_number(text[field])
        checked[field] = (value, value == key[field])

    # Задание 2.
    root = key["t2_estimate"]
    value = _estimate(text["t2_estimate"])
    checked["t2_estimate"] = (value, value is not None
                              and root / ESTIMATE_FACTOR <= value <= root * ESTIMATE_FACTOR)
    value = _number(text["t2_probability"])
    # 1e-9 — запас на двоичную запись дробей: 0,529 − 0,525 должно дать «ровно» 0,004.
    checked["t2_probability"] = (value, value is not None
                                 and abs(value - key["t2_probability"]) <= PROBABILITY_TOLERANCE + 1e-9)
    value = _number(text["t2_count"])
    checked["t2_count"] = (value, value is not None
                           and abs(value - key["t2_count"]) <= COUNT_TOLERANCE * key["t2_count"])

    # Задание 3: CRC — 8 символов; HMAC — первые 16 или все 64 символа.
    value = _hex(text["t3_crc"])
    checked["t3_crc"] = (value, value == key["t3_crc"].lower())
    value = _hex(text["t3_hmac16"])
    checked["t3_hmac16"] = (value, len(value) in (16, 64) and value[:16] == key["t3_hmac16"].lower())

    # Задание 4.
    value = _grade(text["t4_grade"])
    checked["t4_grade"] = (value, value == _plain(key["t4_grade"]))
    value = _serious(text["t4_serious"])
    checked["t4_serious"] = (value, value == key["t4_serious"])

    for field, (value, is_right) in checked.items():
        verdict = _verdict(text[field], value, is_right)
        if verdict is None:
            points[field] = AUTO_POINTS[field]
        else:
            notes.append(f"{field}: {verdict}")
    return {"points": points, "total": sum(points.values()), "notes": notes}


# ---------- Секрет, список группы, генерация ----------

def _is_inside(path, folder):
    """Лежит ли path внутри folder (или совпадает с ней)."""
    path, folder = path.resolve(), folder.resolve()
    return path == folder or folder in path.parents


def check_key_dir(key_dir):
    """Папка преподавателя — только вне папки проекта: проект копируют на учебные ПК и в репозиторий."""
    if _is_inside(key_dir, ROOT_DIR):
        raise ValueError(f"Папка преподавателя {key_dir} внутри папки проекта: её могут скопировать "
                         "студентам. Укажите папку вне проекта, например ~/key_and_lock_teacher")


def check_no_teacher_files(folder):
    """В папке для студентов не должно быть ключа ответов и секрета."""
    if folder.exists():
        for item in sorted(folder.iterdir()):
            name = item.name.lower()
            if name.startswith("_key_") or name.startswith("secret"):
                raise ValueError(f"В папке {folder} лежит {item.name} — это файл преподавателя. "
                                 "Уберите его оттуда, иначе он уйдёт студентам")


def create_secret(key_dir):
    """Создать секрет преподавателя модулем secrets. Существующий секрет не перезаписывается."""
    check_key_dir(key_dir)
    key_dir.mkdir(parents=True, exist_ok=True)
    path = key_dir / SECRET_FILE_NAME
    if path.exists():
        raise ValueError(f"Секрет уже есть: {path}. Новый секрет изменил бы все варианты — "
                         "если это действительно нужно, удалите старый файл вручную.")
    path.write_text(secrets.token_hex(32) + "\n", encoding="utf-8")
    return path


def read_secret(key_dir):
    """Прочитать секрет как байты. .strip() убирает перевод строки: иначе изменились бы все варианты."""
    path = key_dir / SECRET_FILE_NAME
    if not path.exists():
        raise ValueError(f"Секрета нет: {path}. Сначала выполните: py -3 teacher.py init-secret")
    text = path.read_text(encoding="utf-8-sig").strip()
    if len(text) < 16:
        raise ValueError(f"Секрет в {path} слишком короткий: создайте его командой init-secret")
    return text.encode("utf-8")


def read_students(path):
    """Список группы из students.csv («student_id;ФИО», заголовок необязателен) → [(ID, ФИО), ...].

    Файл читается только как UTF-8 (с BOM или без): на ПК с другой кодировкой Excel сохраняет
    обычный CSV не в UTF-8, и ФИО испортились бы без всякой ошибки. Ошибки собираются все сразу;
    номера строк в них — как в самом файле, вместе с заголовком и пустыми строками.
    """
    try:
        text = path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        raise ValueError(f"{path.name} не в кодировке UTF-8. Откройте его в Excel и сохраните как "
                         "«CSV UTF-8 (разделитель — запятая)»") from None
    lines = [(number, line) for number, line in enumerate(text.splitlines(), start=1) if line.strip()]
    if not lines:
        raise ValueError(f"{path.name} пуст")
    # Excel с русскими настройками ставит «;», с английскими — «,».
    delimiter = ";" if ";" in lines[0][1] else ","
    first = next(csv.reader([lines[0][1]], delimiter=delimiter))
    if first and first[0].strip().lower() in ("student_id", "id"):
        lines = lines[1:]

    students, errors, seen = [], [], []
    for number, line in lines:
        row = next(csv.reader([line], delimiter=delimiter))
        if not row or not row[0].strip():
            continue
        try:
            student_id = normalize_student_id(row[0])
        except ValueError as error:
            errors.append(f"строка {number}: {error}")
            continue
        if student_id in seen:
            errors.append(f"строка {number}: ID {student_id} повторяется")
            continue
        seen.append(student_id)
        name = row[1].strip() if len(row) > 1 else ""
        students.append((student_id, name))
    if errors:
        raise ValueError(f"Ошибки в {path.name}:\n  " + "\n  ".join(errors))
    if not students:
        raise ValueError(f"В {path.name} нет ни одного студента")
    return students


def check_folders(variants_dir, key_dir):
    """Ключ и секрет не должны оказаться там, откуда их могут унести студенты."""
    check_key_dir(key_dir)
    if _is_inside(key_dir, variants_dir) or _is_inside(variants_dir, key_dir):
        raise ValueError("Папка ключа и папка вариантов не должны быть вложены друг в друга")
    check_no_teacher_files(variants_dir)


def text_hash(text):
    """SHA-256 текста варианта: по нему generate узнаёт, что файл варианта не менялся."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _key_is_valid(key_data):
    """Есть ли в ключе всё, что нужно для проверки: отпечаток секрета и ответы каждого студента."""
    if not isinstance(key_data, dict) or "fingerprint" not in key_data:
        return False
    if not isinstance(key_data.get("students"), dict):
        return False
    for entry in key_data["students"].values():
        if not isinstance(entry, dict) or "name" not in entry or not isinstance(entry.get("key"), dict):
            return False
        if any(field not in entry["key"] for field in AUTO_POINTS):
            return False
    return True


def load_key(path):
    """Ключ ответов преподавателя. Повреждённый ключ — ValueError с понятным текстом."""
    try:
        key_data = load_json(path)
    except (json.JSONDecodeError, UnicodeDecodeError):
        key_data = None
    if not _key_is_valid(key_data):
        raise ValueError(f"Ключ {path} повреждён: восстановите его из копии папки преподавателя")
    return key_data


def make_group(secret, students, data, variants_dir, key_dir):
    """Варианты всей группы и общий ключ ответов.

    Новые студенты дописываются; готовые файлы вариантов не меняются. Если готовый файл совпадает
    с хешем, записанным в ключе, его ответы в ключе не пересчитываются: так правка данных (новый
    вопрос в банке, исправленный факт) не мешает дописать опоздавшего студента. Сначала всё
    проверяется, потом пишется: при ошибке не появляется ни одного файла.
    Возвращает {"created": [...], "kept": [...], "key": путь к ключу}.
    """
    check_folders(variants_dir, key_dir)
    key_path = key_dir / KEY_FILE_NAME
    fingerprint = secret_fingerprint(secret)
    key_data = {"version": VARIANT_VERSION, "fingerprint": fingerprint, "students": {}}
    if key_path.exists():
        key_data = load_key(key_path)
        if key_data["fingerprint"] != fingerprint:
            raise ValueError(f"Ключ {key_path} создан с другим секретом. Варианты с разными секретами "
                             "смешивать нельзя: верните прежний секрет или начните с пустых папок")

    to_write, kept = [], []
    for student_id, name in students:
        student_id = normalize_student_id(student_id)
        path = variants_dir / f"{student_id}.json"
        entry = key_data["students"].get(student_id)
        if path.exists():
            text = path.read_text(encoding="utf-8")
            if entry and entry.get("sha256") == text_hash(text):
                entry["name"] = name  # файл и ключ — из одной генерации, ответы остаются прежними
                kept.append(path)
                continue
            if entry and entry.get("sha256"):
                raise ValueError(f"{path.name} изменён после генерации (не совпадает с ключом). "
                                 "Не перезаписываю — верните файл из копии или разберитесь с ним")
            variant, key = make_variant(secret, student_id, data)
            if variant_text(variant) != text:
                raise ValueError(f"{path.name} нет в ключе, и он не совпадает с тем, что дают этот секрет "
                                 "и текущие данные. Не перезаписываю — разберитесь с ним")
            kept.append(path)
        else:
            variant, key = make_variant(secret, student_id, data)
            text = variant_text(variant)
            to_write.append((path, text))
        key_data["students"][student_id] = {"name": name, "key": key, "sha256": text_hash(text)}

    variants_dir.mkdir(parents=True, exist_ok=True)
    key_dir.mkdir(parents=True, exist_ok=True)
    for path, text in to_write:
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
    key_data["students"] = dict(sorted(key_data["students"].items()))
    with open(key_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(key_data, ensure_ascii=False, indent=1) + "\n")
    return {"created": [path for path, _ in to_write], "kept": kept, "key": key_path}


# ---------- Копия для учебных ПК ----------

# Что получает студент: программа, справочники, примеры и варианты группы. Банк вопросов
# с ответами (teacher_data/), тесты с эталонным ключом и команды преподавателя — нет.
# Общие данные берутся из DATA_DIR (в репозитории — data/ уровнем выше) и в копии лежат
# в data/ рядом с программой — как в версии 1.
STUDENT_FILES = ["start.bat", "main.py", "README.md"]
STUDENT_FOLDERS = ["wifi", "data", "examples"]


def make_student_copy(out_dir, variants_dir=None):
    """Собрать папку для учебных ПК. Возвращает список скопированных файлов.

    Папка должна быть новой или пустой и лежать вне проекта. Варианты копируются в variants/.
    """
    if _is_inside(out_dir, ROOT_DIR):
        raise ValueError(f"Папку для студентов {out_dir} создайте вне папки проекта")
    if out_dir.anchor and not Path(out_dir.anchor).exists():
        # Иначе — непонятная «[WinError 3] Системе не удается найти указанный путь».
        raise ValueError(f"Диска {out_dir.anchor} нет: подключите флешку или укажите папку на "
                         f"существующем диске, например {Path.home() / 'wifi_lab'}")
    if out_dir.exists() and any(out_dir.iterdir()):
        raise ValueError(f"Папка {out_dir} не пуста: укажите новую, чтобы не смешать файлы")
    copies = [(PROJECT_DIR / name, out_dir / name) for name in STUDENT_FILES]
    for folder in STUDENT_FOLDERS:
        source_dir = DATA_DIR if folder == "data" else PROJECT_DIR / folder
        copies += [(p, out_dir / folder / p.name) for p in sorted(source_dir.iterdir())
                   if p.is_file() and p.suffix in (".py", ".json")]
    if variants_dir is not None:
        check_no_teacher_files(variants_dir)
        copies += [(source, out_dir / "variants" / source.name)
                   for source in sorted(variants_dir.glob("*.json"))]
    for source, target in copies:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())  # побайтно: у .bat сохраняются переводы строк CRLF
    return [target for _, target in copies]


# ---------- Проверка группы и results.csv ----------

def read_blank(path):
    """Текст бланка и замечание о кодировке (или None).

    Бланк создаётся в UTF-8, и Блокнот сохраняет его так же. Если в Блокноте выбрали «UTF-16»,
    файл начинается с меток FF FE или FE FF — читаем как UTF-16. Если файл в другой кодировке
    (создан заново и сохранён как ANSI), читаем как Windows-1251 — это ANSI русской Windows:
    так оценка «хорошо» и другие русские ответы не пропадут. В замечании — просьба проверить.
    """
    raw = path.read_bytes()
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return raw.decode("utf-16"), None
    try:
        return raw.decode("utf-8-sig"), None
    except UnicodeDecodeError:
        return (raw.decode("cp1251", errors="replace"),
                "файл не в UTF-8 (прочитан как Windows-1251): проверьте русский текст")


def check_blank(path, student_id, key):
    """Баллы и замечания по одному бланку: {поле: баллы, ..., "auto_total": ..., "notes": [...]}."""
    text, warning = read_blank(path)
    notes = [warning] if warning else []
    answers = parse_answers(text)
    if answers.get("student_id", student_id).strip().lower() != student_id:
        notes.append("ID внутри бланка не совпадает с именем файла")
    result = check_answers(answers, key)
    row = dict(result["points"])
    row["t1_q"] = row.pop("t1_q1") + row.pop("t1_q2")
    row["auto_total"] = result["total"]
    row["notes"] = notes + result["notes"]
    return row


def check_group(answers_dir, key_data, student_ids=None):
    """Проверить бланки группы. Возвращает строки для results.csv (по одной на студента).

    student_ids — ID из students.csv этой группы; без него — все студенты ключа (в одной папке
    преподавателя могут быть ключи нескольких групп). Ошибка в одном бланке не останавливает
    проверку остальных: она попадает в замечания.
    """
    known = key_data["students"]
    ids = list(known) if student_ids is None else list(student_ids)
    rows = []
    for student_id in ids:
        entry = known.get(student_id)
        if entry is None:
            rows.append({"student_id": student_id, "name": "",
                         "notes": ["нет в ключе ответов: сначала выполните generate"]})
            continue
        row = {"student_id": student_id, "name": entry["name"], "notes": []}
        path = answers_dir / blank_name(student_id)
        if not path.exists():
            row["notes"].append("бланк не сдан")
        else:
            try:
                row.update(check_blank(path, student_id, entry["key"]))
            except (ValueError, OSError) as error:  # UnicodeDecodeError — тоже ValueError
                row["notes"].append(f"бланк не проверен: {error}")
        rows.append(row)

    # Бланки, которых нет в списке: чужая группа, опечатка в имени файла или копия.
    if answers_dir.exists():
        expected = [blank_name(student_id) for student_id in ids]
        for path in sorted(answers_dir.iterdir()):
            if path.is_file() and path.name not in expected:
                rows.append({"student_id": path.name, "name": "",
                             "notes": ["файл не из списка группы или имя не по образцу answers_<ID>.txt"]})
    return rows


def free_path(path):
    """path, если такого файла ещё нет; иначе первый свободный: results_2.csv, results_3.csv, …

    Повторная проверка (пришёл поздний бланк) не должна затирать results.csv, в который
    преподаватель уже вписал ручные баллы.
    """
    number = 2
    candidate = path
    while candidate.exists():
        candidate = path.with_name(f"{path.stem}_{number}{path.suffix}")
        number += 1
    return candidate


def write_results(rows, out_csv):
    """results.csv для Excel: UTF-8 с BOM, разделитель «;», баллы целые, итог формулой не считается."""
    with open(out_csv, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow([header for _, header in RESULT_COLUMNS])
        for row in rows:
            values = []
            for key, _ in RESULT_COLUMNS:
                value = row.get(key, "")
                values.append("; ".join(value) if isinstance(value, list) else value)
            writer.writerow(values)
    return out_csv


def check_folder(answers_dir, key_path, out_csv, student_ids=None):
    """Проверить папку бланков по ключу и записать results.csv. Возвращает путь к CSV."""
    return write_results(check_group(answers_dir, load_key(key_path), student_ids), out_csv)
