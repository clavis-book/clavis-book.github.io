"""Модуль 1: сравнительный справочник WEP — WPA — WPA2 — WPA3."""

from wifi.common import DATA_DIR, SCREEN_WIDTH, cite, format_card, format_table, load_json

PROTOCOLS_PATH = DATA_DIR / "protocols.json"

EXPECTED_IDS = ("wep", "wpa", "wpa2", "wpa3")

# Порядок полей в карточке. modes есть только у WPA3, поэтому его нет в REQUIRED_FIELDS.
CARD_FIELDS = [
    ("name", "Название"),
    ("year", "Год и история"),
    ("encryption", "Шифрование"),
    ("authentication", "Аутентификация"),
    ("integrity", "Контроль целостности"),
    ("key_management", "Управление ключами"),
    ("nonce", "Одноразовые значения"),
    ("modes", "Режимы"),
    ("status", "Текущий статус"),
    ("lecture_note", "Дополнение к лекции 14–15"),
]

REQUIRED_FIELDS = [key for key, _ in CARD_FIELDS if key != "modes"] + ["id", "sources"]

# Поля, по которым можно сравнить все четыре протокола (меню 1).
COMPARE_FIELDS = [
    ("encryption", "Шифрование"),
    ("authentication", "Аутентификация"),
    ("integrity", "Контроль целостности"),
    ("key_management", "Управление ключами"),
    ("nonce", "Одноразовые значения"),
    ("year", "Год и история"),
    ("status", "Текущий статус"),
]

MIN_PRIMARY_SOURCES = 2


def load_protocols(path=PROTOCOLS_PATH):
    """Загрузить справочник протоколов (список карточек)."""
    return load_json(path)


def validate_protocols(protocols, sources):
    """Проверить справочник. Возвращает список ошибок; пустой список — всё в порядке.

    Проверяется: ровно четыре протокола wep, wpa, wpa2, wpa3; все обязательные поля
    непустые; каждый id источника есть в sources.json; у карточки не меньше двух
    первичных источников (IEEE, Wi-Fi Alliance, NIST и т. п.).
    """
    errors = []
    ids = [p.get("id") for p in protocols]
    if sorted(ids) != sorted(EXPECTED_IDS):
        errors.append(f"Ожидались протоколы {', '.join(EXPECTED_IDS)}, а в файле: {ids}")

    for protocol in protocols:
        pid = protocol.get("id", "?")
        for field in REQUIRED_FIELDS:
            value = protocol.get(field)
            if not value or (isinstance(value, str) and not value.strip()):
                errors.append(f"{pid}: поле «{field}» пустое или отсутствует")

        source_ids = protocol.get("sources") or []
        unknown = [sid for sid in source_ids if sid not in sources]
        for sid in unknown:
            errors.append(f"{pid}: источника «{sid}» нет в sources.json")

        primary = [sid for sid in source_ids if sources.get(sid, {}).get("primary")]
        if len(primary) < MIN_PRIMARY_SOURCES:
            errors.append(
                f"{pid}: первичных источников {len(primary)}, нужно не меньше {MIN_PRIMARY_SOURCES}"
            )
    return errors


def get_protocol(protocols, pid):
    """Карточка одного протокола по id ("wpa2"); регистр не важен.

    Если такого протокола нет — KeyError с перечнем допустимых id.
    """
    wanted = pid.strip().lower()
    for protocol in protocols:
        if protocol["id"] == wanted:
            return protocol
    known = ", ".join(p["id"] for p in protocols)
    raise KeyError(f"Протокола «{pid}» нет в справочнике. Есть: {known}")


def compare_field(protocols, field):
    """Сравнение всех протоколов по одному полю: строки {"protocol": "WPA2", "value": ...}.

    Порядок строк — как в файле (от WEP к WPA3), чтобы было видно развитие.
    """
    allowed = [key for key, _ in COMPARE_FIELDS]
    if field not in allowed:
        raise ValueError(f"Поле «{field}» нельзя сравнить. Допустимые: {', '.join(allowed)}")
    return [{"protocol": p["id"].upper(), "value": p[field]} for p in protocols]


def field_label(field):
    """Русская подпись поля ("integrity" → «Контроль целостности»)."""
    return dict(CARD_FIELDS).get(field, field)


def format_protocol(protocol, sources, width=SCREEN_WIDTH):
    """Текст карточки протокола для консоли: поля и строка источников."""
    return format_card(protocol, CARD_FIELDS, width) + "\n" + cite(protocol["sources"], sources, width)


def format_comparison(protocols, field, width=SCREEN_WIDTH):
    """Текст таблицы сравнения протоколов по одному полю."""
    rows = compare_field(protocols, field)
    return format_table(rows, [("protocol", "Протокол"), ("value", field_label(field))], width)
