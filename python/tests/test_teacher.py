"""Тесты команд преподавателя teacher.py: init-secret → generate → check, как на настоящей паре.

Все папки — временные и вне папки проекта; вывод команд перехватывается.
"""

import contextlib
import csv
import io
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import teacher
from wifi.common import load_json
from wifi.variants import KEY_FILE_NAME, SECRET_FILE_NAME, answers_from_key, blank_answers, blank_name


def run(*argv):
    """Запустить teacher.main. Возвращает (код выхода, вывод)."""
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = teacher.main(list(argv))
    return code, out.getvalue()


class TeacherCommandsTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        tmp = Path(self._tmp.name)
        self.keys, self.variants, self.answers = tmp / "teacher_only", tmp / "variants", tmp / "answers"
        self.students, self.results = tmp / "students.csv", tmp / "results.csv"
        lines = ["student_id;ФИО"] + [f"is23_{i:02d};Тестовый Студент {i}" for i in range(1, 31)]
        # Так сохраняет Excel: «CSV UTF-8» — с BOM и переводами строк Windows.
        self.students.write_bytes(("﻿" + "\r\n".join(lines) + "\r\n").encode("utf-8"))

    def key_dir(self):
        return ["--key-dir", str(self.keys)]

    # Аргументы — после названия команды, как их дописывают generate.bat и check.bat.
    def generate(self):
        return run("generate", *self.key_dir(), "--students", str(self.students), "--out", str(self.variants))

    def check(self):
        return run("check", *self.key_dir(), "--answers", str(self.answers), "--out", str(self.results))

    def test_full_cycle(self):
        code, out = run("init-secret", *self.key_dir())
        self.assertEqual(code, 0, out)
        self.assertTrue((self.keys / SECRET_FILE_NAME).exists())

        code, out = self.generate()
        self.assertEqual(code, 0, out)
        self.assertIn("Новых вариантов: 30", out)
        self.assertEqual(len(list(self.variants.glob("*.json"))), 30)

        # Половина группы сдаёт верные ответы, остальные — пустые бланки или ничего.
        key_data = load_json(self.keys / KEY_FILE_NAME)
        self.answers.mkdir()
        for i in range(1, 16):
            student_id = f"is23_{i:02d}"
            variant = load_json(self.variants / f"{student_id}.json")
            text = blank_answers(variant, answers_from_key(key_data["students"][student_id]["key"]))
            (self.answers / blank_name(student_id)).write_text(text, encoding="utf-8")
        for i in range(16, 21):
            variant = load_json(self.variants / f"is23_{i:02d}.json")
            (self.answers / blank_name(f"is23_{i:02d}")).write_text(blank_answers(variant), encoding="utf-8")

        code, out = self.check()
        self.assertEqual(code, 0, out)
        self.assertIn("Проверено бланков: 20 из 30", out)
        self.assertIn("Не сдали бланк: is23_21", out)
        with open(self.results, encoding="utf-8-sig", newline="") as f:
            rows = list(csv.reader(f, delimiter=";"))
        totals = {row[0]: row[11] for row in rows[1:]}
        self.assertEqual([totals[f"is23_{i:02d}"] for i in range(1, 16)], ["55"] * 15)
        self.assertEqual([totals[f"is23_{i:02d}"] for i in range(16, 21)], ["0"] * 5)
        self.assertEqual(totals["is23_30"], "")

        # Повторный generate ничего не меняет.
        code, out = self.generate()
        self.assertIn("Новых вариантов: 0; уже были и не изменены: 30", out)

        # Поздний бланк и повторный check: results.csv с ручными баллами не затирается.
        self.results.write_text("ручные баллы", encoding="utf-8")
        code, out = self.check()
        self.assertEqual(code, 0, out)
        self.assertIn("новый итог записан в results_2.csv", out)
        self.assertEqual(self.results.read_text(encoding="utf-8"), "ручные баллы")
        self.assertTrue((self.results.parent / "results_2.csv").exists())

        # Папка для учебных ПК: варианты есть, банка с ответами и ключа нет.
        lab = self.results.parent / "lab"
        code, out = run("student-copy", "--out", str(lab), "--variants", str(self.variants))
        self.assertEqual(code, 0, out)
        self.assertIn("из них вариантов: 30", out)
        self.assertTrue((lab / "main.py").exists())
        self.assertFalse((lab / "teacher_data").exists())
        self.assertFalse(list(lab.rglob(KEY_FILE_NAME)))

    def test_check_only_this_group(self):
        """В одной папке преподавателя — ключи двух групп; check печатает только свою."""
        run("init-secret", *self.key_dir())
        self.generate()
        other = self.students.parent / "other.csv"
        other.write_text("is24_01;Другая Группа\n", encoding="utf-8")
        run("generate", *self.key_dir(), "--students", str(other), "--out", str(self.variants))
        self.answers.mkdir()
        code, out = run("check", *self.key_dir(), "--answers", str(self.answers), "--out", str(self.results),
                        "--students", str(other))
        self.assertEqual(code, 0, out)
        self.assertIn("Не сдали бланк: is24_01", out)
        self.assertNotIn("is23_01", out)

    def test_second_init_secret_is_refused(self):
        run("init-secret", *self.key_dir())
        before = (self.keys / SECRET_FILE_NAME).read_bytes()
        code, out = run("init-secret", *self.key_dir())
        self.assertEqual(code, 1)
        self.assertIn("Ошибка: Секрет уже есть", out)
        self.assertEqual((self.keys / SECRET_FILE_NAME).read_bytes(), before)

    def test_errors_are_explained_without_traceback(self):
        code, out = self.generate()  # секрета ещё нет
        self.assertEqual(code, 1)
        self.assertIn("Секрета нет", out)
        run("init-secret", *self.key_dir())
        self.students.write_bytes("is23_01;Иванова\n".encode("cp1251"))
        code, out = self.generate()
        self.assertEqual(code, 1)
        self.assertIn("CSV UTF-8", out)
        code, out = run("generate", *self.key_dir(), "--students", str(self.students) + "_нет")
        self.assertEqual(code, 1)
        self.assertIn("Ошибка:", out)
        code, out = self.check()  # ключа ещё нет
        self.assertEqual(code, 1)
        self.assertIn("Ключа нет", out)


if __name__ == "__main__":
    unittest.main()
