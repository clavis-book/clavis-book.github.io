"""Меню студента практикума «Wi-Fi под защитой: от WEP к WPA3».

Запуск: start.bat (меню) или start.bat audit examples/profile_bad.json (сразу отчёт аудита).
Программа не работает с сетью: все данные — из папки data/ и с клавиатуры.
"""

import sys

# Проверка версии стоит до импорта пакета wifi: в старом Python импорт упал бы
# с непонятной ошибкой, а так студент сразу видит, что установить.
if sys.version_info < (3, 10):
    print("Нужен Python 3.10 или новее (рекомендуется 3.12+): https://www.python.org/downloads/")
    sys.exit(1)

import argparse
import json
import textwrap
from pathlib import Path

from wifi.auditor import audit, format_report, load_rules, range_limits, rule_applies, validate_profile
from wifi.common import (
    PROJECT_DIR,
    SCREEN_WIDTH,
    cite,
    format_card,
    load_json,
    load_sources,
    parse_number,
    setup_console,
)
from wifi.principles import (
    approx_probability,
    collision_probability_bits,
    count_for_probability,
    crc32_hex,
    add_channel_noise,
    changed_position,
    crc32_manual,
    format_experiment_table,
    hmac_sha256_hex,
    integrity_experiment,
    load_principles,
)
from wifi.reference import COMPARE_FIELDS, format_comparison, format_protocol, load_protocols
from wifi.variants import blank_answers, blank_name, format_variant, load_variant, normalize_student_id

# Варианты раздаёт преподаватель (папка variants/), бланк создаётся рядом с программой.
VARIANTS_DIR = PROJECT_DIR / "variants"
BLANK_DIR = PROJECT_DIR

# Учебные слова для задания 3, пока не открыт свой вариант (пункт 4 меню).
DEFAULT_PHRASE = "uchebnaya fraza dlya zadaniya"
DEFAULT_KEY1 = "klyuch-odin"
DEFAULT_KEY2 = "klyuch-dva"

PRINCIPLE_FIELDS = [
    ("title", "Принцип"),
    ("wep", "Как было в WEP"),
    ("fixed", "Как стало в WPA2/WPA3"),
    ("why", "Почему это важно"),
]

PRIVACY_WARNING = ("Не вводите сам пароль, имя сети, IP- и MAC-адреса: программа спрашивает только "
                   "характеристики настроек.")
KEY_WARNING = "Ключ — любое учебное слово, НЕ ваш пароль; введённое нигде не сохраняется."


# ---------- Ввод с проверкой ----------

def to_int(text):
    """Целое число из строки или None, если это не целое число.

    isdigit() для проверки не подходит: «²» он считает цифрой, а int("²") — ошибка,
    и программа упала бы. Поэтому пробуем int() и ловим ошибку.
    """
    try:
        return int(text)
    except ValueError:
        return None


def ask_choice(prompt, count):
    """Спросить номер от 0 до count, пока не будет введено верное число."""
    while True:
        number = to_int(input(prompt).strip())
        if number is not None and 0 <= number <= count:
            return number
        print(f"Введите число от 0 до {count}.")


def ask_int(prompt, low, high):
    """Спросить целое число в диапазоне [low; high]; буквы и дроби — переспросить."""
    while True:
        number = to_int(input(prompt).strip().replace(" ", ""))
        if number is not None and low <= number <= high:
            return number
        print(f"Нужно целое число от {low} до {high}.")


def ask_float(prompt, low, high):
    """Спросить дробное число (с запятой или точкой) в диапазоне [low; high]."""
    while True:
        try:
            value = parse_number(input(prompt))
        except ValueError as error:
            print(error)
            continue
        if low <= value <= high:
            return value
        # Границы — с запятой, как пишут дроби в русской раскладке.
        print(f"Нужно число от {low:g} до {high:g}".replace(".", ",") + ".")


def ask_text(prompt, default):
    """Спросить учебное слово. Enter — значение по умолчанию; одни пробелы — переспросить."""
    while True:
        answer = input(f"{prompt} (Enter — «{default}»): ")
        if answer == "":
            return default
        if answer.strip():
            return answer.strip()
        print("Пустая строка не подходит.")


def wrap_print(text):
    """Напечатать длинный текст с переносом по словам на ширину экрана."""
    print("\n".join(textwrap.wrap(text, width=SCREEN_WIDTH)))


# ---------- Пункт 1: справочник ----------

def menu_reference(protocols, sources):
    """Карточка протокола или сравнение всех протоколов по одному полю."""
    while True:
        print("\nСправочник протоколов")
        for i, protocol in enumerate(protocols, start=1):
            print(f"  {i}) Карточка {protocol['id'].upper()}")
        print(f"  {len(protocols) + 1}) Сравнить все протоколы по одному полю")
        print("  0) Назад")
        choice = ask_choice("Ваш выбор: ", len(protocols) + 1)
        if choice == 0:
            return
        if choice <= len(protocols):
            print()
            print(format_protocol(protocols[choice - 1], sources))
            continue

        print("\nПо какому полю сравнить?")
        for i, (_, label) in enumerate(COMPARE_FIELDS, start=1):
            print(f"  {i}) {label}")
        print("  0) Назад")
        field_no = ask_choice("Ваш выбор: ", len(COMPARE_FIELDS))
        if field_no:
            print()
            print(format_comparison(protocols, COMPARE_FIELDS[field_no - 1][0]))


# ---------- Пункт 2: принципы и расчёты ----------

def show_principle(principle, sources):
    """Карточка принципа «было — стало — почему» с вопросами лекции и источниками."""
    print()
    print(f"Принцип {principle['no']}")
    print(format_card(principle, PRINCIPLE_FIELDS))
    questions = ", ".join(str(q) for q in principle.get("lecture_questions", []))
    if questions:
        print(f"Контрольные вопросы лекции 14–15: {questions}")
    print(cite(principle["sources"], sources))


def task_collision(variant=None):
    """Задание «Повтор одноразовых значений»: сначала оценка на глаз, потом точный расчёт."""
    print("\nЗадание: повтор одноразовых значений (парадокс дней рождения)")
    if variant:
        t2 = variant["tasks"]["t2"]
        print(f"Ваш вариант {variant['student_id']}: b = {t2['bits']}, n = {t2['n']}, "
              f"p = {t2['p']:g}".replace(".", ","))
    bits = ask_int("Длина значения в битах (1–128), например 24 — как IV в WEP: ", 1, 128)
    space = 2**bits
    ask_float("Оцените на глаз: после скольких значений повтор станет вероятным? ", 0, 10**40)
    root_text = f"{space ** 0.5:,.0f}".replace(",", " ")  # разряды через пробел: 4 096
    print(f"Подсказка: порядок величины — √N = √(2^{bits}) ≈ {root_text}")

    n = ask_int("Сколько значений выбрано случайно (1–1 000 000 000)? ", 1, 10**9)
    exact = collision_probability_bits(n, bits)
    approx = approx_probability(n, space)
    print(f"Вероятность хотя бы одного совпадения: точно {exact:.3f}, "
          f"приближённо 1 − exp(−n(n−1)/2N) = {approx:.3f}".replace(".", ","))

    p = ask_float("Для какой вероятности найти наименьшее число значений (0,01–0,99)? ", 0.01, 0.99)
    count, is_approx = count_for_probability(p, bits)
    mark = " (приближённо: число слишком большое для точного поиска)" if is_approx else ""
    # Замены — только в числах: замена по всей строке съедала запятую текста («значений  при котором»).
    count_text = f"{count:,}".replace(",", " ")
    p_text = f"{p:g}".replace(".", ",")
    print(f"Наименьшее число значений, при котором вероятность ≥ {p_text}: {count_text}{mark}")
    # Вывод — о числах, которые ввёл студент; что из этого следует для WEP и WPA2, он пишет сам
    # (вывод делает студент), а ответ есть в карточке принципа 1.
    wrap_print(f"Для b = {bits} бит повтор становится вероятным уже при числе значений порядка √N ≈ {root_text}, "
               f"а не N = 2^{bits}. Для вывода: что это значит для 24-битного IV в WEP "
               "и что для этого изменили в WPA2? Подсказка — принцип 1 в этом меню.")


def task_crc_hmac(variant=None):
    """Задание «CRC-32 и HMAC-SHA256»: опыт на учебных данных, свойства и вывод студент делает сам.

    Если открыт свой вариант (пункт 4), по Enter подставляются его фраза и ключи.
    """
    print("\nЗадание: CRC-32 и HMAC-SHA256")
    phrase, key1, key2 = DEFAULT_PHRASE, DEFAULT_KEY1, DEFAULT_KEY2
    if variant:
        t3 = variant["tasks"]["t3"]
        phrase, key1, key2 = t3["phrase"], t3["key"], t3["key2"]
        print(f"По Enter подставляются фраза и ключи варианта {variant['student_id']}.")
    # Предупреждение — до ввода, а не после: иначе студент узнал бы о нём, уже введя пароль.
    print(KEY_WARNING)
    phrase = ask_text("Учебная фраза латиницей", phrase)
    key1 = ask_text("Ключ 1", key1)
    key2 = ask_text("Ключ 2 (другой)", key2)
    if key1 == key2:
        print("Ключи совпадают — для сравнения лучше взять разные. Ключ 2 изменён: добавлена «2».")
        key2 += "2"

    msg = phrase.encode("utf-8")
    k1, k2 = key1.encode("utf-8"), key2.encode("utf-8")
    manual = f"{crc32_manual(msg):08X}"
    print(f"CRC-32: {crc32_hex(msg)} (своя реализация: {manual} — "
          f"{'совпадает' if manual == crc32_hex(msg) else 'НЕ совпадает'})")
    print(f"HMAC-SHA256 с ключом 1: {hmac_sha256_hex(k1, msg)}")
    print(f"Первые 16 hex-символов HMAC: {hmac_sha256_hex(k1, msg)[:16]}")
    noisy = add_channel_noise(msg)
    print(f"\nОпыт: в фразе заменён байт № {changed_position(msg, noisy)} из {len(msg)} — "
          "случайная ошибка передачи, как помеха в канале.")
    print(format_experiment_table(integrity_experiment(msg, k1, k2, noisy)))
    # Свойства и вывод — баллы рубрики (таблица 4, вывод 6), поэтому программа их не печатает:
    # студент выводит их сам из чисел опыта, как и вывод задания 5.
    wrap_print("Сравните значения: какие проверки заметили ошибку передачи, какие значения зависят от ключа, "
               "какие может вычислить любой, кто знает фразу. Таблицу свойств и вывод составьте сами "
               "(t3_table и t3_conclusion в бланке). Подсказка — принцип 2 в этом меню.")


def menu_principles(principles, sources, variant=None):
    """Четыре принципа и два расчётных задания (с числами и словами варианта, если он открыт)."""
    while True:
        print("\nПринципы безопасного протокола")
        for p in principles:
            print(f"  {p['no']}) {p['title']}")
        print("  5) Задание: повтор одноразовых значений")
        print("  6) Задание: CRC-32 и HMAC-SHA256")
        print("  0) Назад")
        choice = ask_choice("Ваш выбор: ", 6)
        if choice == 0:
            return
        if choice <= 4:
            show_principle(principles[choice - 1], sources)
        elif choice == 5:
            task_collision(variant)
        else:
            task_crc_hmac(variant)


# ---------- Пункт 3: аудит ----------

def ask_profile(rules):
    """Пошаговый ввод профиля: ответы номерами из списка или числом."""
    print()
    wrap_print(PRIVACY_WARNING)
    profile = {}
    for rule in rules:
        if not rule_applies(rule, profile):
            continue
        print()
        wrap_print(f"{rule['no']}. {rule['question']}")
        if rule["kind"] == "range":
            low, high = range_limits(rule)
            profile[rule["param"]] = ask_int("Число: ", low, high)
            continue
        for i, option in enumerate(rule["options"], start=1):
            print(f"  {i}) {option['label']}")
        number = 0
        while number == 0:
            number = ask_choice("Номер ответа: ", len(rule["options"]))
            if number == 0:
                print("Выберите один из вариантов (0 здесь нет).")
        profile[rule["param"]] = rule["options"][number - 1]["value"]
    return profile


def load_profile_file(path, rules):
    """Профиль из JSON-файла. Возвращает (профиль, ошибки)."""
    if not path.exists():
        return None, [f"Файл не найден: {path}"]
    if not path.is_file():
        # Сюда попадает и пустой путь: Path("") — это текущая папка.
        return None, [f"Это папка, а не файл: {path}"]
    try:
        profile = load_json(path)
    except OSError as error:
        # Например, нет прав на чтение или файл занят другой программой.
        return None, [f"Не удалось открыть файл {path}: {error.strerror or error}"]
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        return None, [f"Файл не похож на JSON в UTF-8: {error}"]
    if not isinstance(profile, dict):
        return None, ["В файле должен быть словарь «параметр: значение»"]
    return profile, validate_profile(profile, rules)


def print_audit(profile, rules, sources):
    print()
    print(format_report(audit(profile, rules), sources))


def menu_audit(rules, sources):
    """Аудит: ввод с клавиатуры или загрузка профиля из файла."""
    while True:
        print("\nАудит своей точки доступа")
        print("  1) Ввести настройки по шагам")
        print("  2) Загрузить профиль из файла (например, examples/profile_bad.json)")
        print("  0) Назад")
        choice = ask_choice("Ваш выбор: ", 2)
        if choice == 0:
            return
        if choice == 1:
            print_audit(ask_profile(rules), rules, sources)
            continue
        path = input("Путь к файлу: ").strip().strip('"')
        if not path:
            print("Путь не указан.")
            continue
        profile, errors = load_profile_file(Path(path), rules)
        if errors:
            print("Профиль не принят:")
            for error in errors:
                print("  - " + error)
        else:
            print_audit(profile, rules, sources)


# ---------- Пункт 4: мой вариант ----------

def ask_student_id(current):
    """Спросить ID латиницей. Enter — уже открытый вариант (current) или назад, если его нет."""
    hint = f"Enter — {current}" if current else "Enter — назад"
    while True:
        text = input(f"Ваш ID, например is23_07 ({hint}): ").strip()
        if not text:
            return current
        try:
            return normalize_student_id(text)
        except ValueError as error:
            wrap_print(str(error))


def open_variant(student_id):
    """Вариант из variants/<ID>.json или None, если его нет или он повреждён (с объяснением)."""
    path = VARIANTS_DIR / f"{student_id}.json"
    if not path.is_file():
        wrap_print(f"Файл варианта не найден: variants/{student_id}.json. Проверьте ID (латиница) "
                   "или спросите преподавателя, раздал ли он папку variants.")
        return None
    try:
        return load_variant(path, student_id)
    except (ValueError, OSError) as error:
        wrap_print(str(error))
        return None


def create_blank(variant):
    """Создать бланк answers_<ID>.txt рядом с программой. Уже начатый бланк не перезаписывается."""
    path = BLANK_DIR / blank_name(variant["student_id"])
    if path.exists():
        print("Бланк уже есть, он не перезаписан — откройте его в Блокноте и продолжайте:")
        print(f"  {path}")
        return
    try:
        # UTF-8 с BOM и переводы строк Windows: старый Блокнот так точно не испортит кириллицу.
        with open(path, "w", encoding="utf-8-sig", newline="\r\n") as f:
            f.write(blank_answers(variant))
    except OSError as error:
        print("Не удалось создать бланк ответов:")
        print(f"  {path}: {error.strerror or error}")
        return
    print("Создан бланк ответов — откройте его в Блокноте и заполняйте по ходу работы:")
    print(f"  {path}")


def audit_variant_profile(variant, rules, sources):
    """Отчёт аудита для профиля из задания 4 (если файл варианта испорчен — объяснение)."""
    errors = validate_profile(variant["profile"], rules)
    if errors:
        print("Профиль в файле варианта повреждён — попросите преподавателя выдать вариант заново:")
        for error in errors:
            print("  - " + error)
        return
    print_audit(variant["profile"], rules, sources)


def menu_variant(data):
    """Мой вариант: задания, бланк ответов и аудит профиля задания 4.

    Открытый вариант запоминается в data["variant"]: в пункте 2 по Enter подставляются его
    числа и слова.
    """
    opened = data["variant"]
    student_id = ask_student_id(opened["student_id"] if opened else None)
    if student_id is None:
        return
    if not opened or opened["student_id"] != student_id:
        variant = open_variant(student_id)
        if variant is None:
            return
        data["variant"] = variant
    variant = data["variant"]
    print()
    print(format_variant(variant, data))
    print()
    create_blank(variant)
    while True:
        print(f"\nМой вариант {student_id}")
        print("  1) Показать задания ещё раз")
        print("  2) Аудит профиля задания 4")
        print("  0) Назад")
        choice = ask_choice("Ваш выбор: ", 2)
        if choice == 0:
            return
        if choice == 1:
            print()
            print(format_variant(variant, data))
        else:
            audit_variant_profile(variant, data["rules"], data["sources"])


# ---------- Главное меню ----------

def main_menu(data):
    """Главное меню. data — справочники, загруженные один раз при запуске."""
    while True:
        print("\nWi-Fi под защитой: от WEP к WPA3")
        print("  1) Справочник протоколов")
        print("  2) Принципы и расчёты")
        print("  3) Аудит своей точки доступа")
        print("  4) Мой вариант: задания и бланк ответов")
        print("  0) Выход")
        choice = ask_choice("Ваш выбор: ", 4)
        if choice == 0:
            return
        if choice == 1:
            menu_reference(data["protocols"], data["sources"])
        elif choice == 2:
            menu_principles(data["principles"], data["sources"], data["variant"])
        elif choice == 3:
            menu_audit(data["rules"], data["sources"])
        else:
            menu_variant(data)


def confirm_exit():
    """После Ctrl+C спросить, выйти ли. Ctrl+C часто нажимают, чтобы скопировать хеш."""
    try:
        return input("\nВыйти из программы? д/н: ").strip().lower() in ("д", "да", "y", "yes", "l")
    except (KeyboardInterrupt, EOFError):
        return True


def run_menu(data):
    """Меню с перехватом Ctrl+C и конца ввода: вместо аварийного выхода — вопрос «Выйти?»."""
    while True:
        try:
            main_menu(data)
            return
        except KeyboardInterrupt:
            if confirm_exit():
                return
        except EOFError:
            # Ввод закончился (окно закрыто или ввод из файла) — выходим спокойно.
            return


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Практикум «Wi-Fi под защитой: от WEP к WPA3»")
    sub = parser.add_subparsers(dest="command")
    audit_cmd = sub.add_parser("audit", help="отчёт аудита для профиля из JSON-файла")
    audit_cmd.add_argument("profile", type=Path, help="путь к профилю, например examples/profile_bad.json")
    return parser.parse_args(argv)


def main(argv=None):
    setup_console()
    args = parse_args(sys.argv[1:] if argv is None else argv)
    sources = load_sources()
    rules = load_rules()

    if args.command == "audit":
        profile, errors = load_profile_file(args.profile, rules)
        if errors:
            print("Профиль не принят:")
            for error in errors:
                print("  - " + error)
            return 2
        print_audit(profile, rules, sources)
        return 0

    # variant — вариант студента, открытый в пункте 4 (пока не открыт — None).
    data = {"protocols": load_protocols(), "principles": load_principles(),
            "rules": rules, "sources": sources, "variant": None}
    run_menu(data)
    print("До свидания!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
