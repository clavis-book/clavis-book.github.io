"""Общие функции: чтение JSON, текстовые таблицы и карточки, ссылки на источники, числа, консоль."""

import json
import math
import sys
import textwrap
from pathlib import Path

# Папка программы: python/ в репозитории «Ключ и замок» или папка на учебном ПК.
PROJECT_DIR = Path(__file__).resolve().parent.parent
# Общие данные (справочник, принципы, правила, источники). В репозитории они лежат уровнем выше,
# в data/: их читает и веб-версия. В копию для учебного ПК data/ кладётся рядом с программой.
DATA_DIR = PROJECT_DIR / "data" if (PROJECT_DIR / "data").is_dir() else PROJECT_DIR.parent / "data"
# Корень проекта: всё, что внутри, может попасть в репозиторий или на учебный ПК.
ROOT_DIR = DATA_DIR.parent
SOURCES_PATH = DATA_DIR / "sources.json"

# Ширина вывода в консоли: окно cmd по умолчанию — 120 символов, берём с запасом.
SCREEN_WIDTH = 100
COLUMN_SEPARATOR = " | "


def load_json(path):
    """Прочитать JSON-файл в UTF-8.

    Кодировка "utf-8-sig" читает файл и с BOM, и без него: Блокнот Windows иногда
    добавляет BOM, и обычный "utf-8" тогда выдаёт ошибку разбора.
    """
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def load_sources(path=SOURCES_PATH):
    """Справочник источников: id → {title, url, section, primary, verified, ...}."""
    return load_json(path)


def _as_text(value):
    """Значение ячейки как строка; список склеивается через «; »."""
    if value is None:
        return ""
    if isinstance(value, list):
        return "; ".join(str(item) for item in value)
    return str(value)


def _wrap(text, width):
    """Перенос текста по словам. Пустая строка даёт одну пустую строку, а не ноль строк."""
    return textwrap.wrap(text, width=width) or [""]


def _column_widths(natural, available):
    """Ширины столбцов, которые в сумме не больше available.

    Узкие столбцы получают свою естественную ширину, а остаток места делится поровну
    между широкими. Так короткий столбец «Протокол» не съедает место у длинного текста.
    """
    widths = [0] * len(natural)
    remaining = list(range(len(natural)))
    left = available
    while remaining:
        share = max(1, left // len(remaining))
        narrow = [i for i in remaining if natural[i] <= share]
        if not narrow:
            for i in remaining:
                widths[i] = share
            break
        for i in narrow:
            widths[i] = natural[i]
            left -= natural[i]
            remaining.remove(i)
    return widths


def format_table(rows, columns, width=SCREEN_WIDTH):
    """Текстовая таблица для консоли; длинные ячейки переносятся по словам.

    rows — список словарей, columns — список пар (ключ, заголовок).
    Ни одна строка результата не длиннее width.
    """
    headers = [header for _, header in columns]
    cells = [[_as_text(row.get(key)) for key, _ in columns] for row in rows]
    natural = [max([len(headers[i])] + [len(r[i]) for r in cells]) for i in range(len(columns))]
    available = width - len(COLUMN_SEPARATOR) * (len(columns) - 1)
    widths = _column_widths(natural, available)

    def render(values):
        wrapped = [_wrap(value, widths[i]) for i, value in enumerate(values)]
        height = max(len(lines) for lines in wrapped)
        result = []
        for n in range(height):
            parts = []
            for i, lines in enumerate(wrapped):
                part = lines[n] if n < len(lines) else ""
                parts.append(part.ljust(widths[i]))
            result.append(COLUMN_SEPARATOR.join(parts).rstrip())
        return result

    lines = render(headers)
    lines.append("-+-".join("-" * w for w in widths))
    for values in cells:
        lines.extend(render(values))
    return "\n".join(lines)


def format_card(record, fields, width=SCREEN_WIDTH):
    """Вертикальная карточка «поле: значение» (fields — пары (ключ, подпись)).

    Пустые поля пропускаются. Продолжение длинного значения печатается с отступом,
    чтобы было видно, где начинается следующее поле.
    """
    lines = []
    for key, label in fields:
        value = _as_text(record.get(key))
        if not value:
            continue
        lines.extend(textwrap.wrap(f"{label}: {value}", width=width, subsequent_indent="    "))
    return "\n".join(lines)


def cite(source_ids, sources, width=SCREEN_WIDTH):
    """Строка «Источники: …» с короткими подписями источников.

    Неподтверждённые (verified: false) помечаются [проверить], вторичные — «(втор.)»,
    неизвестные id — «[нет в sources.json]», чтобы ошибку в данных было видно сразу.
    Лекция курса не первичный источник о протоколах, но и не «вторичный обзор», поэтому
    её подпись выводится без пометки.
    """
    parts = []
    for sid in source_ids:
        source = sources.get(sid)
        if source is None:
            parts.append(f"{sid} [нет в sources.json]")
            continue
        text = source.get("label", sid)
        if not source.get("primary", False) and source.get("kind") != "lecture":
            text += " (втор.)"
        if not source.get("verified", False):
            text += " [проверить]"
        parts.append(text)
    line = "Источники: " + "; ".join(parts)
    return "\n".join(textwrap.wrap(line, width=width, subsequent_indent="    "))


def parse_number(text):
    """Число из строки пользователя: «0,525», «0.525», « 1 000 » → float.

    Запятая допускается, потому что в русской раскладке дробные числа пишут с запятой.
    При неверном вводе — ValueError с понятным текстом.
    """
    cleaned = text.strip().replace(" ", "").replace(" ", "").replace(",", ".")
    try:
        value = float(cleaned)
    except ValueError:
        raise ValueError(f"«{text.strip()}» — не число. Пример: 0,5 или 0.5") from None
    if not math.isfinite(value):
        raise ValueError("Нужно обычное конечное число")
    return value


def setup_console():
    """Включить вывод в UTF-8 в консоли Windows.

    Без этого на ПК с другой кодовой страницей (cp866, GBK) кириллица и знаки «—», «≈»
    печатаются кракозябрами или вызывают UnicodeEncodeError.
    """
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError, OSError):
            # Поток подменён (IDE, тесты) — оставляем как есть.
            pass
