"""Команды преподавателя практикума «Wi-Fi под защитой: от WEP к WPA3».

  py -3 teacher.py init-secret                 — один раз: создать секрет в папке преподавателя
  py -3 teacher.py generate                    — варианты в variants/, ключ — в папку преподавателя
  py -3 teacher.py student-copy --out D:\\lab   — папка для учебных ПК: программа и варианты, без ответов
  py -3 teacher.py check                       — проверить бланки из answers/, итог — results.csv

Папка преподавателя по умолчанию — ~/key_and_lock_teacher (вне папки проекта). Её не раздают
студентам и не копируют на учебные ПК: там секрет, ключ ответов и закрытый банк вопросов
(questions.json из пакета преподавателя; если его там нет, варианты строятся из демо-банка).
Программа не работает с сетью: всё читается и пишется в локальные файлы.
"""

import sys

# Как и в main.py: проверка версии до импорта пакета wifi, чтобы ошибка была понятной.
if sys.version_info < (3, 10):
    print("Нужен Python 3.10 или новее (рекомендуется 3.12+): https://www.python.org/downloads/")
    sys.exit(1)

import argparse
from pathlib import Path

from wifi.common import PROJECT_DIR, setup_console
from wifi.variants import (
    BANK_FILE_NAME,
    KEY_FILE_NAME,
    QUESTIONS_PATH,
    bank_path,
    check_group,
    create_secret,
    free_path,
    load_key,
    load_variant_data,
    make_group,
    make_student_copy,
    read_secret,
    read_students,
    write_results,
)

DEFAULT_KEY_DIR = Path.home() / "key_and_lock_teacher"
DEFAULT_STUDENTS = PROJECT_DIR / "students.csv"


def cmd_init_secret(args):
    path = create_secret(args.key_dir)
    print(f"Секрет создан: {path}")
    print("Не раздавайте эту папку студентам и не копируйте её на учебные ПК.")
    print("Если секрет потерять, прежние варианты нельзя будет проверить: сделайте копию папки.")


def cmd_generate(args):
    secret = read_secret(args.key_dir)
    if not args.students.is_file():
        raise ValueError(f"Нет списка группы {args.students}: положите students.csv (student_id;ФИО) "
                         "в папку проекта или укажите --students")
    students = read_students(args.students)
    bank = bank_path(args.key_dir)
    if bank == QUESTIONS_PATH:
        print(f"Банк вопросов: демо-банк проекта. Для группы положите закрытый банк {BANK_FILE_NAME} "
              f"из пакета преподавателя в папку {args.key_dir}")
    else:
        print(f"Банк вопросов: {bank}")
    result = make_group(secret, students, load_variant_data(bank), args.out, args.key_dir)
    print(f"Студентов в списке: {len(students)}")
    print(f"Новых вариантов: {len(result['created'])}; уже были и не изменены: {len(result['kept'])}")
    print(f"Варианты: {args.out}")
    print(f"Ключ ответов: {result['key']} — только у преподавателя.")
    print("Папку для учебных ПК соберите командой: "
          "py -3 -X utf8 teacher.py student-copy --out <новая папка вне проекта>")


def cmd_student_copy(args):
    variants = args.variants if args.variants.is_dir() else None
    copied = make_student_copy(args.out, variants)
    count = sum(1 for path in copied if path.parent.name == "variants")
    print(f"Скопировано файлов: {len(copied)}, из них вариантов: {count}")
    if variants is None:
        print(f"Папки с вариантами нет ({args.variants}) — варианты не скопированы.")
    print(f"Папка для учебных ПК: {args.out}")
    print("В ней нет банка вопросов с ответами, тестов и команд преподавателя.")


def cmd_check(args):
    key_path = args.key_dir / KEY_FILE_NAME
    if not key_path.exists():
        raise ValueError(f"Ключа нет: {key_path}. Сначала выполните generate")
    if not args.answers.is_dir():
        raise ValueError(f"Папки с бланками нет: {args.answers}. Сложите туда файлы answers_<ID>.txt")
    # Строки — только для своей группы: в папке преподавателя может быть ключ нескольких групп.
    student_ids = None
    if args.students.exists():
        student_ids = [student_id for student_id, _ in read_students(args.students)]
    rows = check_group(args.answers, load_key(key_path), student_ids)
    out = free_path(args.out)
    write_results(rows, out)

    checked = [row for row in rows if "auto_total" in row]
    # «из 1 строки», «из 21 строки», но «из 3 строк», «из 11 строк».
    lines = "строки" if len(rows) % 10 == 1 and len(rows) % 100 != 11 else "строк"
    print(f"Проверено бланков: {len(checked)} из {len(rows)} {lines}")
    if checked:
        average = sum(row["auto_total"] for row in checked) / len(checked)
        print(f"Средний автобалл: {average:.1f} из 55".replace(".", ","))
    missing = [row["student_id"] for row in rows if "бланк не сдан" in row["notes"]]
    if missing:
        print("Не сдали бланк: " + ", ".join(missing))
    # Строки без баллов, кроме несданных, — файлы не из списка группы и непроверенные бланки.
    other = [row["student_id"] for row in rows if "auto_total" not in row and row["student_id"] not in missing]
    if other:
        print("Требуют внимания (см. «Замечания»): " + ", ".join(other))
    if out != args.out:
        print(f"{args.out.name} уже есть (там могут быть ручные баллы) — новый итог записан в {out.name}.")
    print(f"Итог: {out} — откройте в Excel и допишите баллы за ручные части.")


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Команды преподавателя практикума Wi-Fi")
    # --key-dir — у каждой команды: generate.bat и check.bat дописывают аргументы после
    # названия команды («teacher.py generate --key-dir D:\keys»).
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--key-dir", type=Path, default=DEFAULT_KEY_DIR,
                        help=f"папка преподавателя с секретом и ключом (по умолчанию {DEFAULT_KEY_DIR})")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init-secret", parents=[common], help="создать секрет (один раз)")

    generate = sub.add_parser("generate", parents=[common], help="создать варианты группы")
    generate.add_argument("--students", type=Path, default=DEFAULT_STUDENTS,
                          help="список группы: student_id;ФИО (Excel → «CSV UTF-8»)")
    generate.add_argument("--out", type=Path, default=PROJECT_DIR / "variants",
                          help="папка для вариантов студентов")

    copy = sub.add_parser("student-copy", help="собрать папку для учебных ПК (без ответов)")
    copy.add_argument("--out", type=Path, required=True, help="новая папка вне проекта, например %%USERPROFILE%%\\wifi_lab или на флешке")
    copy.add_argument("--variants", type=Path, default=PROJECT_DIR / "variants",
                      help="папка с вариантами группы")

    check = sub.add_parser("check", parents=[common], help="проверить бланки ответов")
    check.add_argument("--answers", type=Path, default=PROJECT_DIR / "answers",
                       help="папка с файлами answers_<ID>.txt")
    check.add_argument("--students", type=Path, default=DEFAULT_STUDENTS,
                       help="список группы; если файла нет — все студенты из ключа")
    check.add_argument("--out", type=Path, default=PROJECT_DIR / "results.csv",
                       help="куда записать результаты для Excel (существующий файл не затирается)")
    return parser.parse_args(argv)


COMMANDS = {"init-secret": cmd_init_secret, "generate": cmd_generate,
            "student-copy": cmd_student_copy, "check": cmd_check}


def main(argv=None):
    setup_console()
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        COMMANDS[args.command](args)
    except (ValueError, OSError) as error:
        # Ошибки данных и файлов — понятным текстом, без трассировки.
        print(f"Ошибка: {error}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
