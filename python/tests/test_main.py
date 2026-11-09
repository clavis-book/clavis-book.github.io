"""Тесты меню main.py: ввод подменяется заготовленными ответами, вывод перехватывается.

Каждый сценарий должен израсходовать все ответы и выйти через «0» — если сценарий «съехал»
(ответ попал не в тот вопрос), тест падает, а не проходит случайно.
"""

import contextlib
import hmac
import io
import sys
import tempfile
import unittest
import zlib
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import main
from wifi.auditor import audit, format_report, load_rules, rule_applies
from wifi.common import DATA_DIR, PROJECT_DIR, SCREEN_WIDTH, load_json, load_sources
from wifi.reference import COMPARE_FIELDS, format_comparison, format_protocol, load_protocols
from wifi.variants import blank_answers, format_variant, load_variant_data, make_variant, variant_text

EXAMPLES = PROJECT_DIR / "examples"
CTRL_C = object()  # особый «ответ»: вместо строки нажимается Ctrl+C


class FakeConsole:
    """Подмена input(): печатает приглашение и ответ, как настоящая консоль."""

    def __init__(self, answers):
        self.answers = list(answers)
        self.typed = []      # строки «приглашение + ответ» — их длину проверять не нужно
        self.entered = []    # сами ответы: путь из ответа программа может повторить в сообщении
        self.eof = False     # ввод закончился раньше, чем программа вышла сама

    def input(self, prompt=""):
        if not self.answers:
            self.eof = True
            raise EOFError
        answer = self.answers.pop(0)
        if answer is CTRL_C:
            print(prompt)
            raise KeyboardInterrupt
        print(prompt + answer)
        self.typed.append(prompt + answer)
        self.entered.append(answer)
        return answer


def run(answers, argv=()):
    """Запустить main.main. Возвращает (код выхода, весь вывод, консоль)."""
    console = FakeConsole(answers)
    out = io.StringIO()
    with mock.patch("builtins.input", console.input), contextlib.redirect_stdout(out):
        code = main.main(list(argv))
    return code, out.getvalue(), console


def answers_for_profile(profile, rules):
    """Ответы пошагового ввода, которые дают этот профиль; неприменимые вопросы пропускаются, как в меню."""
    answers, entered = [], {}
    for rule in rules:
        if not rule_applies(rule, entered):
            continue
        value = profile[rule["param"]]
        entered[rule["param"]] = value
        if rule["kind"] == "range":
            answers.append(str(value))
        else:
            values = [option["value"] for option in rule["options"]]
            answers.append(str(values.index(value) + 1))
    return answers, entered


class MenuTestCase(unittest.TestCase):
    def run_script(self, answers, argv=()):
        """Сценарий целиком: все ответы израсходованы, выход штатный, строки ≤ ширины экрана."""
        code, out, console = run(answers, argv)
        self.assertEqual(code, 0)
        self.assertEqual(console.answers, [], "остались неиспользованные ответы — сценарий съехал")
        self.assertFalse(console.eof, "программа ждала ещё ввода — сценарий съехал")
        self.assertTrue(out.rstrip().endswith("До свидания!"))
        long_lines = [line for line in out.splitlines()
                      if line not in console.typed
                      and len(without_typed(line, console.entered)) > SCREEN_WIDTH]
        self.assertEqual(long_lines, [], "строки длиннее 100 символов")
        return out


def without_typed(line, entered):
    """Строка без того, что ввёл пользователь (путей к файлам).

    Программа повторяет введённый путь в сообщении об ошибке; длинной строку делает путь к папке
    проекта, а не текст программы. Без этого тест падал, если путь длиннее ~70 символов (проверка
    README на чистой копии). Короткие ответы («0», «2») не вычитаются — иначе проверка ослабла бы.
    """
    for text in entered:
        text = text.strip().strip('"')
        if len(text) >= 10:
            line = line.replace(text, "")
    return line


class MainMenuTests(MenuTestCase):
    def test_exit(self):
        self.run_script(["0"])

    def test_bad_menu_input_is_asked_again(self):
        # «²» и «--5»: isdigit() считает «²» цифрой, а int() на нём падает.
        out = self.run_script(["abc", "9", "-1", "", "1.5", "²", "--5", "0"])
        self.assertEqual(out.count("Введите число от 0 до 4."), 7)

    def test_end_of_input_exits_quietly(self):
        # Окно закрыли или ввод из файла кончился посреди подменю — без трассировки ошибки.
        code, out, console = run(["1"])
        self.assertEqual(code, 0)
        self.assertTrue(console.eof)
        self.assertIn("До свидания!", out)


class ReferenceMenuTests(MenuTestCase):
    @classmethod
    def setUpClass(cls):
        cls.protocols = load_protocols()
        cls.sources = load_sources()

    def test_every_card(self):
        out = self.run_script(["1", "1", "2", "3", "4", "0", "0"])
        # Карточка целиком, а не одно слово: «WPA2» есть и в самом пункте меню.
        for protocol in self.protocols:
            self.assertIn(format_protocol(protocol, self.sources), out)

    def test_every_comparison_field(self):
        script = ["1"]
        for field_no in range(1, len(COMPARE_FIELDS) + 1):
            script += ["5", str(field_no)]
        out = self.run_script(script + ["5", "0", "0", "0"])
        for field, _ in COMPARE_FIELDS:
            self.assertIn(format_comparison(self.protocols, field), out)


class PrinciplesMenuTests(MenuTestCase):
    def test_every_principle(self):
        out = self.run_script(["2", "1", "2", "3", "4", "0", "0"])
        self.assertEqual(out.count("Как было в WEP"), 4)
        self.assertGreaterEqual(out.count("Источники"), 4)

    def test_collision_task_values(self):
        out = self.run_script(["2", "5", "24", "4096", "5000", "0,5", "0", "0"])
        self.assertIn("точно 0,525", out)
        self.assertIn("приближённо 1 − exp(−n(n−1)/2N) = 0,525", out)
        self.assertIn("≥ 0,5: 4 823", out)

    def test_collision_task_rejects_bad_input(self):
        script = ["2", "5",
                  "abc", "0", "129", "²", "--5", "24",  # биты: буквы, 0, 129, «²», «--5» — переспросить
                  "x", "-5", "4096",          # оценка на глаз: не число, отрицательное
                  "0", "2,5", "5 000",        # число значений: 0 и дробь — нет, «5 000» с пробелом — да
                  "1", "0", "0.5",            # вероятность вне 0,01–0,99
                  "0", "0"]
        out = self.run_script(script)
        self.assertEqual(out.count("Нужно целое число от 1 до 128."), 5)
        self.assertEqual(out.count("не число"), 1)
        self.assertEqual(out.count("Нужно число от 0 до"), 1)
        self.assertEqual(out.count("Нужно целое число от 1 до 1000000000."), 2)
        self.assertEqual(out.count("Нужно число от 0,01 до 0,99."), 2)
        self.assertIn("точно 0,525", out)

    def test_crc_task_with_default_words(self):
        out = self.run_script(["2", "6", "", "", "", "0", "0"])
        msg, key = main.DEFAULT_PHRASE.encode("utf-8"), main.DEFAULT_KEY1.encode("utf-8")
        crc = f"{zlib.crc32(msg):08X}"
        self.assertIn(f"CRC-32: {crc} (своя реализация: {crc} — совпадает)", out)
        self.assertIn(hmac.new(key, msg, "sha256").hexdigest(), out.lower())

    def test_crc_task_shows_experiment_not_answers(self):
        """Задание 6 показывает значения опыта, а таблицу свойств и вывод студент составляет сам."""
        out = self.run_script(["2", "6", "", "", "", "0", "0"])
        self.assertIn("С ошибкой передачи", out)
        self.assertIn("CRC-32 (только фраза)", out)
        for answer in ("Замечена?", "Без секрета?", "Зависит от ключа?", "шифрование ≠", "Вывод:"):
            self.assertNotIn(answer, out)

    def test_crc_task_warns_before_key_is_typed(self):
        # Предупреждение «НЕ ваш пароль» должно стоять до вопроса о ключе, а не после ввода.
        out = self.run_script(["2", "6", "", "", "", "0", "0"])
        self.assertIn(main.KEY_WARNING, out)
        self.assertLess(out.index(main.KEY_WARNING), out.index("Ключ 1"))

    def test_crc_task_own_words_save_nothing(self):
        before = sorted(p for p in PROJECT_DIR.rglob("*") if "__pycache__" not in p.parts)
        out = self.run_script(["2", "6", "   ", "moya fraza", "slovo", "slovo", "0", "0"])
        after = sorted(p for p in PROJECT_DIR.rglob("*") if "__pycache__" not in p.parts)
        self.assertIn("Пустая строка не подходит", out)
        self.assertIn("Ключи совпадают", out)
        self.assertEqual(before, after, "введённые слова не должны сохраняться в файлы")


class AuditMenuTests(MenuTestCase):
    @classmethod
    def setUpClass(cls):
        cls.rules = load_rules()
        cls.sources = load_sources()

    def check_steps_equal_file(self, name):
        """Пошаговый ввод профиля даёт тот же отчёт, что и загрузка этого профиля из файла."""
        profile = load_json(EXAMPLES / name)
        answers, entered = answers_for_profile(profile, self.rules)
        out = self.run_script(["3", "1"] + answers + ["0", "0"])
        self.assertIn("Не вводите сам пароль", out)
        self.assertIn(format_report(audit(entered, self.rules), self.sources), out)
        self.assertIn(format_report(audit(profile, self.rules), self.sources), out)

    def test_steps_good_profile(self):
        self.check_steps_equal_file("profile_good.json")

    def test_steps_bad_profile(self):
        self.check_steps_equal_file("profile_bad.json")

    def test_steps_fixed_profile(self):
        self.check_steps_equal_file("profile_fixed.json")

    def test_steps_reject_bad_input(self):
        answers, _ = answers_for_profile(load_json(EXAMPLES / "profile_good.json"), self.rules)
        protocol, cipher, length, *rest = answers
        script = ["3", "1", "0", "abc", "99", protocol, cipher, "-1", "129", "20 символов", length] + rest
        out = self.run_script(script + ["0", "0"])
        self.assertEqual(out.count("Выберите один из вариантов (0 здесь нет)."), 1)
        self.assertGreaterEqual(out.count("Нужно целое число от 0 до 128."), 3)
        self.assertIn("отлично", out)

    def test_open_network_skips_password_questions(self):
        profile = dict(load_json(EXAMPLES / "profile_good.json"), protocol="open")
        answers, entered = answers_for_profile(profile, self.rules)
        out = self.run_script(["3", "1"] + answers + ["0", "0"])
        self.assertNotIn("password_length", entered)
        self.assertNotIn("Сколько символов в пароле", out)
        self.assertIn("неудовлетворительно", out)

    def test_profile_from_file(self):
        out = self.run_script(["3", "2", str(EXAMPLES / "profile_bad.json"), "0", "0"])
        self.assertIn("неудовлетворительно", out)

    def test_profile_file_errors_do_not_crash(self):
        # Пустой путь и путь к папке раньше роняли программу (PermissionError).
        script = ["3",
                  "2", "no_such_file.json",
                  "2", str(PROJECT_DIR / "main.py"),
                  "2", "",
                  "2", str(DATA_DIR),
                  "2", '"' + str(EXAMPLES / "profile_good.json") + '"',  # путь в кавычках, как копирует Проводник
                  "0", "0"]
        out = self.run_script(script)
        self.assertIn("Файл не найден", out)
        self.assertIn("не похож на JSON", out)
        self.assertIn("Путь не указан", out)
        self.assertIn("Это папка, а не файл", out)
        self.assertIn("отлично", out)


class VariantMenuTests(MenuTestCase):
    """Пункт 4: папки variants/ и бланков подменяются временными, чтобы не трогать проект."""

    @classmethod
    def setUpClass(cls):
        cls.data = load_variant_data()
        cls.variant, cls.key = make_variant(b"test", "is23_07", cls.data)
        cls.other, _ = make_variant(b"test", "is23_08", cls.data)

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        self.variants = self.tmp / "variants"
        self.variants.mkdir()
        (self.variants / "is23_07.json").write_text(variant_text(self.variant), encoding="utf-8")
        for name, value in (("VARIANTS_DIR", self.variants), ("BLANK_DIR", self.tmp)):
            patcher = mock.patch.object(main, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.blank = self.tmp / "answers_is23_07.txt"

    def test_shows_tasks_and_creates_blank(self):
        out = self.run_script(["4", "is23_07", "0", "0"])
        self.assertIn(format_variant(self.variant, self.data), out)
        self.assertIn("Создан бланк ответов", out)
        raw = self.blank.read_bytes()
        self.assertTrue(raw.startswith("﻿".encode("utf-8")))  # UTF-8 с BOM
        self.assertEqual(raw.count(b"\n"), raw.count(b"\r\n"))       # переводы строк Windows
        self.assertEqual(raw.decode("utf-8-sig").replace("\r\n", "\n"), blank_answers(self.variant))

    def test_existing_blank_is_not_overwritten(self):
        self.blank.write_text("t1_q1: 3\n", encoding="utf-8")
        out = self.run_script(["4", "IS23_07", "0", "0"])  # регистр ID не важен
        self.assertIn("Бланк уже есть", out)
        self.assertEqual(self.blank.read_text(encoding="utf-8"), "t1_q1: 3\n")

    def test_bad_and_unknown_ids(self):
        out = self.run_script(["4", "ис23_07", "is23 07", "is23_99", "0"])
        self.assertEqual(out.count("кириллица не допускается"), 2)
        self.assertIn("Файл варианта не найден: variants/is23_99.json", out)
        self.assertFalse(self.blank.exists())

    def test_enter_without_variant_goes_back(self):
        self.run_script(["4", "", "0"])

    def test_profile_audit_of_task_4(self):
        out = self.run_script(["4", "is23_07", "2", "0", "0"])
        report = format_report(audit(self.variant["profile"], self.data["rules"]), load_sources())
        self.assertIn(report, out)
        self.assertIn(self.key["t4_grade"], out)

    def test_open_variant_fills_tasks_2_and_3(self):
        t2, t3 = self.variant["tasks"]["t2"], self.variant["tasks"]["t3"]
        script = ["4", "is23_07", "0",
                  "2", "6", "", "", "",                   # задание 3: Enter — слова варианта
                  "5", str(t2["bits"]), "1", str(t2["n"]), "0,5",
                  "0", "0"]
        out = self.run_script(script)
        self.assertIn(f"CRC-32: {self.key['t3_crc']}", out)
        self.assertIn(f"Первые 16 hex-символов HMAC: {self.key['t3_hmac16']}", out)
        self.assertIn(f"«{t3['key']}»", out)
        self.assertIn(f"Ваш вариант is23_07: b = {t2['bits']}, n = {t2['n']}", out)
        self.assertIn(f"точно {self.key['t2_probability']:.3f}".replace(".", ","), out)

    def test_enter_reopens_current_variant(self):
        out = self.run_script(["4", "is23_07", "0", "4", "", "1", "0", "0"])
        self.assertEqual(out.count(f"Вариант is23_07 (группа is23)"), 3)

    def test_works_without_question_bank(self):
        """На учебном ПК банка с ответами нет — меню 1–4 должно работать без него."""
        missing = self.tmp / "no_teacher_data" / "questions.json"
        with mock.patch("wifi.variants.QUESTIONS_PATH", missing):
            with self.assertRaises(FileNotFoundError):
                load_variant_data()  # подмена действует: без банка генератор не работает…
            # …а меню студента работает: пункты 1, 2, 3 и 4 по очереди.
            out = self.run_script(["1", "1", "0", "2", "1", "0", "3", "2", str(EXAMPLES / "profile_good.json"),
                                   "0", "4", "is23_07", "1", "2", "0", "0"])
        self.assertIn("отлично", out)
        self.assertIn("Вариант is23_07", out)
        self.assertFalse(missing.exists())

    def test_damaged_or_foreign_variant_file(self):
        (self.variants / "is23_07.json").write_text("{", encoding="utf-8")
        out = self.run_script(["4", "is23_07", "0"])
        self.assertIn("повреждён", out)
        (self.variants / "is23_07.json").write_text(variant_text(self.other), encoding="utf-8")
        out = self.run_script(["4", "is23_07", "0"])
        self.assertIn("вариант другого студента", out)
        self.assertFalse(self.blank.exists())


class CommandLineTests(unittest.TestCase):
    def test_audit_good_profile(self):
        code, out, _ = run([], ["audit", str(EXAMPLES / "profile_good.json")])
        self.assertEqual(code, 0)
        self.assertIn("отлично", out)

    def test_audit_missing_file(self):
        code, out, _ = run([], ["audit", "no_such_file.json"])
        self.assertEqual(code, 2)
        self.assertIn("Профиль не принят", out)

    def test_audit_folder_instead_of_file(self):
        code, out, _ = run([], ["audit", str(DATA_DIR)])
        self.assertEqual(code, 2)
        self.assertIn("Это папка, а не файл", out)


class CtrlCTests(unittest.TestCase):
    def test_ctrl_c_then_no_returns_to_menu(self):
        code, out, console = run([CTRL_C, "н", "0"])
        self.assertEqual(code, 0)
        self.assertEqual(console.answers, [])
        self.assertIn("Выйти из программы? д/н", out)
        self.assertEqual(out.count("Wi-Fi под защитой: от WEP к WPA3"), 2)  # меню показано снова

    def test_ctrl_c_then_yes_exits(self):
        code, out, console = run([CTRL_C, "д", "0"])
        self.assertEqual(code, 0)
        self.assertEqual(console.answers, ["0"])  # после «д» меню больше не спрашивает
        self.assertIn("До свидания!", out)

    def test_ctrl_c_inside_task(self):
        # Ctrl+C посреди расчёта (часто — попытка скопировать число) не роняет программу.
        code, _, console = run(["2", "5", CTRL_C, "н", "0"])
        self.assertEqual(code, 0)
        self.assertEqual(console.answers, [])

    def test_ctrl_c_twice_exits(self):
        code, out, _ = run([CTRL_C, CTRL_C])
        self.assertEqual(code, 0)
        self.assertIn("До свидания!", out)


if __name__ == "__main__":
    unittest.main()
