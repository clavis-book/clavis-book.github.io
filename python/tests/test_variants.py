"""Тесты вариантов: варианты, бланк, автопроверка, генерация группы, results.csv.

Группа — 30 вымышленных студентов, секрет — b"test". Временные папки создаются вне папки
проекта (иначе make_group откажется писать ключ — и правильно).
"""

import csv
import hashlib
import hmac
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from wifi.auditor import audit, check_consistency, serious_rule_numbers, validate_profile
from wifi.common import DATA_DIR, PROJECT_DIR, ROOT_DIR, SCREEN_WIDTH, load_json
from wifi.principles import collision_probability_bits, count_for_probability, crc32_hex, hmac_sha256_hex
from wifi.variants import (
    AUTO_POINTS,
    BANK_FILE_NAME,
    BITS_CHOICES,
    BLANK_LINES,
    GRADE_NAMES,
    K_TENTHS,
    KEY_FILE_NAME,
    NOT_A_MISTAKE,
    PROBABILITY_CHOICES,
    QUESTIONS_PATH,
    RESULT_COLUMNS,
    SECRET_FILE_NAME,
    TABLE_ERROR_COUNT,
    VARIANT_FIELDS,
    answers_from_key,
    bank_path,
    blank_answers,
    blank_name,
    check_answers,
    check_folder,
    check_group,
    create_secret,
    derive,
    format_variant,
    free_path,
    load_key,
    load_variant,
    load_variant_data,
    make_group,
    make_student_copy,
    make_table_task,
    make_variant,
    normalize_student_id,
    parse_answers,
    pick_distinct,
    read_secret,
    read_students,
    secret_fingerprint,
    variant_text,
)

GOLDEN_PATH = Path(__file__).resolve().parent / "golden_variant.json"
SECRET = b"test"
GROUP = [(f"is23_{i:02d}", f"Тестовый Студент {i}") for i in range(1, 31)]  # вымышленные ФИО
MAX_AUTO = sum(AUTO_POINTS.values())

# Тот же список, что в tests/test_principles.py: рамки проекта.
FORBIDDEN_WORDS = ["взлом", "атак", "перебор", "подбор", "поддел", "перехват", "инъекц",
                   "aircrack", "chopchop", "krack", "fms"]

DATA = None
GROUP_VARIANTS = None


def setUpModule():
    """Данные и 30 вариантов строятся один раз на весь файл: так тесты идут быстро."""
    global DATA, GROUP_VARIANTS
    DATA = load_variant_data()
    GROUP_VARIANTS = [make_variant(SECRET, student_id, DATA) for student_id, _ in GROUP]


def scalar_values(node):
    """Все строки и числа в JSON на любой глубине."""
    if isinstance(node, dict):
        return [v for value in node.values() for v in scalar_values(value)]
    if isinstance(node, list):
        return [v for item in node for v in scalar_values(item)]
    return [node]


def filled_blank(variant, key):
    return blank_answers(variant, answers_from_key(key))


class TempDirTestCase(unittest.TestCase):
    """Временная папка вне проекта; удаляется после теста."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        self.assertNotIn(PROJECT_DIR.resolve(), self.tmp.resolve().parents)


class DeriveTests(unittest.TestCase):
    def test_derive_formula(self):
        # derive = int.from_bytes(HMAC-SHA256(secret, "ID|поле")[:8], "big") % n.
        digest = hmac.new(b"test", b"is00_01|grade", hashlib.sha256).digest()
        self.assertEqual(derive(b"test", "is00_01", "grade", 4), int.from_bytes(digest[:8], "big") % 4)

    def test_range_and_repeatability(self):
        for n in range(1, 60):
            value = derive(SECRET, "is23_01", f"field{n}", n)
            self.assertTrue(0 <= value < n)
            self.assertEqual(value, derive(SECRET, "is23_01", f"field{n}", n))

    def test_depends_on_secret_id_and_field(self):
        base = derive(SECRET, "is23_01", "x", 2**64)
        self.assertNotEqual(base, derive(b"other", "is23_01", "x", 2**64))
        self.assertNotEqual(base, derive(SECRET, "is23_02", "x", 2**64))
        self.assertNotEqual(base, derive(SECRET, "is23_01", "y", 2**64))

    def test_empty_choice_is_an_error(self):
        with self.assertRaises(ValueError):
            derive(SECRET, "is23_01", "x", 0)

    def test_pick_distinct(self):
        items = list(range(10))
        chosen = pick_distinct(SECRET, "is23_01", "f", items, 10)
        self.assertEqual(sorted(chosen), items)  # все разные, ничего не потеряно
        self.assertEqual(chosen, pick_distinct(SECRET, "is23_01", "f", items, 10))
        self.assertEqual(items, list(range(10)))  # исходный список не испорчен


class GoldenVariantTests(unittest.TestCase):
    """Эталон ловит невоспроизводимость между запусками, ПК и версиями Python."""

    def test_variant_matches_golden(self):
        golden = load_json(GOLDEN_PATH)
        variant, key = make_variant(golden["secret"].encode("utf-8"), golden["student_id"], DATA)
        self.assertEqual(variant_text(variant), variant_text(golden["variant"]))
        # Вероятность — дробь от log1p/expm1: на другой платформе последний знак может отличаться.
        key, expected = dict(key), dict(golden["key"])
        self.assertAlmostEqual(key.pop("t2_probability"), expected.pop("t2_probability"), places=12)
        self.assertEqual(key, expected)

    def test_golden_is_for_is00_01(self):
        golden = load_json(GOLDEN_PATH)
        self.assertEqual((golden["secret"], golden["student_id"]), ("test", "is00_01"))
        self.assertEqual(golden["variant"]["student_id"], "is00_01")


class VariantContentTests(unittest.TestCase):
    def test_only_allowed_fields(self):
        for variant, _ in GROUP_VARIANTS:
            self.assertEqual(list(variant), list(VARIANT_FIELDS))
            self.assertEqual(sorted(variant["tasks"]), ["t1", "t2", "t3", "written"])

    def test_no_answer_appears_in_variant(self):
        """Ни одно значение ответа из ключа не встречается среди значений файла варианта."""
        for variant, key in GROUP_VARIANTS:
            text = variant_text(variant).lower()
            values = [str(v).lower() for v in scalar_values(variant)]
            answers = list(key["t1_errors"]) + [key["t3_crc"], key["t3_hmac16"], key["t4_grade"],
                                                key["t2_count"], key["t2_estimate"],
                                                f"{key['t2_probability']:.3f}"]
            with self.subTest(student=variant["student_id"]):
                for answer in answers:
                    self.assertNotIn(str(answer).lower(), values)
                # hex-ответы не должны встречаться даже внутри строк
                self.assertNotIn(key["t3_crc"].lower(), text)
                self.assertNotIn(key["t3_hmac16"].lower(), text)

    def test_key_matches_direct_calls(self):
        for variant, key in GROUP_VARIANTS:
            t2, t3 = variant["tasks"]["t2"], variant["tasks"]["t3"]
            phrase = t3["phrase"].encode("utf-8")
            result = audit(variant["profile"], DATA["rules"])
            with self.subTest(student=variant["student_id"]):
                self.assertEqual(key["t2_estimate"], round((2 ** t2["bits"]) ** 0.5))
                self.assertEqual(key["t2_probability"], collision_probability_bits(t2["n"], t2["bits"]))
                self.assertEqual(key["t2_count"], count_for_probability(t2["p"], t2["bits"])[0])
                self.assertEqual(key["t3_crc"], crc32_hex(phrase))
                self.assertEqual(key["t3_hmac16"], hmac_sha256_hex(t3["key"].encode("utf-8"), phrase)[:16])
                self.assertEqual(key["t4_grade"], result.grade)
                self.assertEqual(key["t4_serious"], serious_rule_numbers(result))

    def test_table_has_exactly_four_swapped_cells(self):
        reference = {p["id"]: p for p in DATA["protocols"]}
        for variant, key in GROUP_VARIANTS:
            t1 = variant["tasks"]["t1"]
            wrong = []
            for pid, values in t1["table"].items():
                for field, value in values.items():
                    if value != reference[pid][field]:
                        wrong.append(f"{pid}.{field}")
                        # подмена — значением того же поля у другого протокола
                        others = [p[field] for other, p in reference.items() if other != pid]
                        self.assertIn(value, others)
            with self.subTest(student=variant["student_id"]):
                self.assertEqual(len(t1["fields"]), 3)
                self.assertEqual(sorted(wrong), key["t1_errors"])
                self.assertEqual(len(wrong), TABLE_ERROR_COUNT)

    def test_swapped_cells_are_real_mistakes(self):
        """Подмена должна быть неверной: «48-битный счётчик PN» из WPA2 верен и для WPA3."""
        texts = {(p["id"], f): p[f] for p in DATA["protocols"] for f in p if isinstance(p[f], str)}
        forbidden = {(f, pid, texts[(donor, f)]) for (f, pid), donors in NOT_A_MISTAKE.items() for donor in donors}
        for i in range(300):  # 300 студентов: каждая ячейка становится ошибкой много раз
            table, _, errors = make_table_task(SECRET, f"is99_{i:03d}", DATA["protocols"])
            for cell in errors:
                pid, field = cell.split(".")
                self.assertNotIn((field, pid, table[pid][field]), forbidden, cell)

    def test_not_a_mistake_list_is_valid(self):
        ids = [p["id"] for p in DATA["protocols"]]
        for (field, pid), donors in NOT_A_MISTAKE.items():
            self.assertIn(field, DATA["protocols"][0])
            self.assertIn(pid, ids)
            self.assertTrue(all(donor in ids and donor != pid for donor in donors))
            # останется хотя бы один допустимый донор
            self.assertLess(len(donors), len(ids) - 1)

    def test_bank_questions_and_answers(self):
        bank = {q["id"]: q for q in DATA["questions"]["questions"]}
        titles = [p["title"] for p in sorted(DATA["principles"], key=lambda p: p["no"])]
        for variant, key in GROUP_VARIANTS:
            shown = variant["tasks"]["t1"]["questions"]
            self.assertEqual(len(shown), 2)
            self.assertNotEqual(shown[0]["id"], shown[1]["id"])
            for q, answer in zip(shown, (key["t1_q1"], key["t1_q2"])):
                original = bank[q["id"]]
                self.assertNotIn("answer", q)
                if original["type"] == "principle":
                    self.assertEqual(q["options"], titles)
                    self.assertEqual(answer, original["answer"])
                else:
                    self.assertEqual(sorted(q["options"]), sorted(original["options"]))
                    self.assertEqual(q["options"][answer - 1], original["options"][original["answer"] - 1])

    def test_options_are_really_shuffled(self):
        # Иначе верный ответ всегда был бы первым (в файле банка он записан первым).
        positions = [key["t1_q1"] for variant, key in GROUP_VARIANTS
                     if variant["tasks"]["t1"]["questions"][0]["id"].startswith("q_")]
        self.assertGreater(len(set(positions)), 1)

    def test_written_questions(self):
        bank = {q["id"]: q for q in DATA["questions"]["questions"]}
        for variant, _ in GROUP_VARIANTS:
            written = variant["tasks"]["written"]
            numbers = [w["lecture_question"] for w in written]
            taken = [bank[q["id"]].get("lecture_question") for q in variant["tasks"]["t1"]["questions"]]
            with self.subTest(student=variant["student_id"]):
                self.assertEqual(len(numbers), 2)
                self.assertEqual(numbers, sorted(set(numbers)))
                self.assertTrue(all(3 <= n <= 7 for n in numbers))
                self.assertFalse([n for n in numbers if n in taken])

    def test_collision_numbers(self):
        for variant, _ in GROUP_VARIANTS:
            t2 = variant["tasks"]["t2"]
            root = 2 ** (t2["bits"] // 2)
            with self.subTest(student=variant["student_id"]):
                self.assertIn(t2["bits"], BITS_CHOICES)
                self.assertIn(t2["p"], PROBABILITY_CHOICES)
                self.assertIn(t2["n"], [round(k * root / 10) for k in K_TENTHS])
                self.assertTrue(0.11 <= collision_probability_bits(t2["n"], t2["bits"]) <= 0.96)

    def test_words_are_latin(self):
        for variant, _ in GROUP_VARIANTS:
            t3 = variant["tasks"]["t3"]
            self.assertTrue(all(t3[k].isascii() for k in ("phrase", "key", "key2")))
            self.assertEqual(len(t3["phrase"].split()), 3)
            self.assertNotEqual(t3["key"], t3["key2"])

    def test_profiles_are_valid_and_consistent(self):
        for variant, key in GROUP_VARIANTS:
            profile = variant["profile"]
            with self.subTest(student=variant["student_id"]):
                self.assertEqual(validate_profile(profile, DATA["rules"]), [])
                self.assertEqual(check_consistency(profile), [])
                self.assertIn(key["t4_grade"], GRADE_NAMES)

    def test_thirty_distinct_variants(self):
        bodies = []
        for variant, _ in GROUP_VARIANTS:
            body = dict(variant, student_id="", group="")
            bodies.append(variant_text(body))
        self.assertEqual(len(set(bodies)), 30)

    def test_every_grade_at_least_three_times(self):
        # Это свойство тестового секрета b"test": оценка выбирается равновероятно, и у случайного
        # секрета в группе из 30 какая-то оценка встречается реже 3 раз примерно в 4 % случаев.
        counts = {grade: 0 for grade in GRADE_NAMES}
        for _, key in GROUP_VARIANTS:
            counts[key["t4_grade"]] += 1
        self.assertTrue(all(count >= 3 for count in counts.values()), counts)

    def test_other_secret_gives_other_variants(self):
        same = 0
        for (student_id, _), (variant, _) in zip(GROUP, GROUP_VARIANTS):
            other, _ = make_variant(b"another secret", student_id, DATA)
            same += variant_text(other) == variant_text(variant)
        self.assertEqual(same, 0)

    def test_variant_text_fits_screen(self):
        for variant, _ in GROUP_VARIANTS:
            lines = format_variant(variant, DATA).splitlines()
            self.assertEqual([line for line in lines if len(line) > SCREEN_WIDTH], [])

    def test_task4_explains_fewer_than_three_problems(self):
        """У многих профилей меньше 3 находок со штрафом — задание и бланк говорят, что писать."""
        counts = [sum(1 for f in audit(v["profile"], DATA["rules"]).findings if f.penalty > 0)
                  for v, _ in GROUP_VARIANTS]
        self.assertTrue(any(n < 3 for n in counts))  # иначе проверка ниже не нужна
        variant, _ = GROUP_VARIANTS[0]
        task4 = " ".join(format_variant(variant, DATA).split("Задание 4.")[1].split())
        self.assertIn("меньше трёх", task4)
        self.assertIn("«В порядке»", task4)
        self.assertIn("«В порядке»", blank_answers(variant))

    def test_student_id_rules(self):
        self.assertEqual(normalize_student_id("  IS23_07 "), "is23_07")
        for bad in ("", "is 23", "ис23_07", "1is", "is23-07", "a" * 40):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                normalize_student_id(bad)


class BlankTests(unittest.TestCase):
    def test_blank_has_every_field(self):
        variant, _ = GROUP_VARIANTS[0]
        answers = parse_answers(blank_answers(variant))
        expected = ["student_id"] + [field for field, _ in BLANK_LINES]
        self.assertEqual(list(answers), expected)
        self.assertEqual(answers["student_id"], variant["student_id"])
        self.assertTrue(all(value == "" for key, value in answers.items() if key != "student_id"))

    def test_filled_blank_round_trip(self):
        for variant, key in GROUP_VARIANTS:
            result = check_answers(parse_answers(filled_blank(variant, key)), key)
            self.assertEqual((result["total"], result["notes"]), (MAX_AUTO, []))

    def test_parse_answers_tolerates_notepad(self):
        text = ("﻿# комментарий\r\n"
                "T2_Probability :  0,525 \r\n"
                "\r\n"
                "t2_count: 4 823\r\n"
                "строка без двоеточия\r\n"
                "t2_conclusion: вывод: повтор начинается при n ≈ √N\r\n"
                "t3_crc: CBF43926\r\n"
                "t3_crc:\r\n")  # пустой повтор не затирает ответ
        answers = parse_answers(text)
        self.assertEqual(answers["t2_probability"], "0,525")
        self.assertEqual(answers["t2_count"], "4 823")
        self.assertEqual(answers["t2_conclusion"], "вывод: повтор начинается при n ≈ √N")
        self.assertEqual(answers["t3_crc"], "CBF43926")
        self.assertNotIn("строка без двоеточия", answers)

    def test_last_non_empty_value_wins(self):
        self.assertEqual(parse_answers("t1_q1: 1\nt1_q1: 3\n")["t1_q1"], "3")


class CheckAnswersTests(unittest.TestCase):
    def setUp(self):
        self.variant, self.key = GROUP_VARIANTS[0]
        self.good = answers_from_key(self.key)

    def points(self, **changes):
        answers = dict(self.good, **changes)
        return check_answers(answers, self.key)["points"]

    def test_full_and_empty(self):
        self.assertEqual(check_answers(self.good, self.key)["total"], MAX_AUTO)
        empty = check_answers({}, self.key)
        self.assertEqual(empty["total"], 0)
        self.assertIn("t3_crc: не заполнено", empty["notes"])

    def test_all_points_are_integers(self):
        for _, key in GROUP_VARIANTS:
            result = check_answers(answers_from_key(key), key)
            self.assertTrue(all(isinstance(p, int) for p in result["points"].values()))
            self.assertIsInstance(result["total"], int)

    def test_probability_tolerance(self):
        exact = self.key["t2_probability"]
        self.assertEqual(self.points(t2_probability=f"{exact + 0.004:.6f}")["t2_probability"], 5)
        self.assertEqual(self.points(t2_probability=f"{exact - 0.004:.6f}".replace(".", ","))["t2_probability"], 5)
        self.assertEqual(self.points(t2_probability=f"{exact + 0.006:.6f}")["t2_probability"], 0)
        self.assertEqual(self.points(t2_probability=f"{exact - 0.006:.6f}")["t2_probability"], 0)
        self.assertEqual(self.points(t2_probability="ноль")["t2_probability"], 0)

    def test_count_tolerance_one_percent(self):
        count = self.key["t2_count"]
        inside = int(count * 1.01)          # ещё в пределах 1 %
        outside = int(count * 1.01) + 2     # уже за пределами
        self.assertEqual(self.points(t2_count=str(inside))["t2_count"], 5)
        self.assertEqual(self.points(t2_count=f"{count:,}".replace(",", " "))["t2_count"], 5)
        self.assertEqual(self.points(t2_count=str(outside))["t2_count"], 0)

    def test_estimate_within_factor_two(self):
        root = self.key["t2_estimate"]
        for value, expected in [(root // 2, 2), (root * 2, 2), (root // 2 - 1, 0), (root * 2 + 1, 0),
                                (f"≈{root}", 2)]:
            with self.subTest(value=value):
                self.assertEqual(self.points(t2_estimate=str(value))["t2_estimate"], expected)

    def test_hex_ignores_case_spaces_and_prefix(self):
        crc, mac = self.key["t3_crc"], self.key["t3_hmac16"]
        self.assertEqual(self.points(t3_crc=crc.lower())["t3_crc"], 5)
        self.assertEqual(self.points(t3_crc="0x" + crc[:4] + " " + crc[4:])["t3_crc"], 5)
        self.assertEqual(self.points(t3_crc=crc[:-1])["t3_crc"], 0)
        self.assertEqual(self.points(t3_hmac16=mac.upper())["t3_hmac16"], 5)
        self.assertEqual(self.points(t3_hmac16=mac[:15])["t3_hmac16"], 0)

    def test_full_hmac_is_accepted(self):
        # Студент вставил все 64 символа вместо первых 16 — вычисление верное, балл засчитывается.
        variant = self.variant["tasks"]["t3"]
        full = hmac_sha256_hex(variant["key"].encode("utf-8"), variant["phrase"].encode("utf-8"))
        self.assertEqual(self.points(t3_hmac16=full)["t3_hmac16"], 5)
        self.assertEqual(self.points(t3_hmac16=full[:20])["t3_hmac16"], 0)

    def test_grade_spelling(self):
        grade = self.key["t4_grade"]
        self.assertEqual(self.points(t4_grade=grade.upper())["t4_grade"], 5)
        self.assertEqual(self.points(t4_grade=" " + grade + " ")["t4_grade"], 5)
        wrong = next(g for g in GRADE_NAMES if g != grade)
        self.assertEqual(self.points(t4_grade=wrong)["t4_grade"], 0)

    def test_serious_numbers(self):
        key = dict(self.key, t4_serious=[1, 5])
        check = lambda text: check_answers(dict(self.good, t4_serious=text), key)["points"]["t4_serious"]
        self.assertEqual(check("1, 5"), 8)
        self.assertEqual(check("5,1"), 8)
        self.assertEqual(check("1 и 5"), 8)
        self.assertEqual(check("1, 1, 5"), 8)
        self.assertEqual(check("1"), 0)
        self.assertEqual(check("1, 5, 7"), 0)
        self.assertEqual(check("правило один"), 0)
        no_serious = dict(self.key, t4_serious=[])
        self.assertEqual(check_answers(dict(self.good, t4_serious="нет"), no_serious)["points"]["t4_serious"], 8)
        self.assertEqual(check_answers(dict(self.good, t4_serious=""), no_serious)["points"]["t4_serious"], 0)

    def test_table_errors(self):
        cells = self.key["t1_errors"]
        wrong = "wep.nonce" if "wep.nonce" not in cells else "wpa.nonce"
        self.assertEqual(self.points()["t1_errors"], 12)
        # лишние (неверные) не штрафуются: 3 верных + 1 неверный = 9
        self.assertEqual(self.points(t1_err4=wrong)["t1_errors"], 9)
        # одна и та же ячейка дважды засчитывается один раз
        self.assertEqual(self.points(t1_err2=cells[0])["t1_errors"], 9)
        # запись свободная: регистр, пробел или дефис вместо точки
        free = cells[0].upper().replace(".", " - ")
        self.assertEqual(self.points(t1_err1=free)["t1_errors"], 12)

    def test_question_number_formats(self):
        right = str(self.key["t1_q1"])
        self.assertEqual(self.points(t1_q1=right + ")")["t1_q1"], 4)
        self.assertEqual(self.points(t1_q1=right + ") текст варианта с цифрой 4 внутри")["t1_q1"], 4)
        self.assertEqual(self.points(t1_q1=str(self.key["t1_q1"] % 4 + 1))["t1_q1"], 0)

    def test_other_students_answers_score_low(self):
        # Критерий 2.4 — на нескольких секретах, а не только на тестовом.
        for secret in (SECRET, b"secret-2", b"secret-3", b"secret-4", b"secret-5"):
            keys = [make_variant(secret, student_id, DATA)[1] for student_id, _ in GROUP]
            totals = [check_answers(answers_from_key(keys[(i + 1) % len(keys)]), key)["total"]
                      for i, key in enumerate(keys)]
            with self.subTest(secret=secret):
                self.assertLessEqual(sum(totals) / len(totals), 0.4 * MAX_AUTO)


class HandwrittenAnswersTests(unittest.TestCase):
    """Ответы так, как их пишут от руки в Блокноте, а не как их записывает answers_from_key."""

    def setUp(self):
        self.variant, self.key = GROUP_VARIANTS[0]

    def score(self, field, text, **key_changes):
        key = dict(self.key, **key_changes)
        answers = dict(answers_from_key(key), **{field: text})
        return check_answers(answers, key)["points"][field]

    def test_no_serious_findings_written_freely(self):
        for text in ("нет", "Нет.", "нет таких", "Таких нет", "—", "-", "0", "НЕТ!"):
            with self.subTest(text=text):
                self.assertEqual(self.score("t4_serious", text, t4_serious=[]), 8)
        self.assertEqual(self.score("t4_serious", "не знаю", t4_serious=[]), 0)

    def test_serious_numbers_written_freely(self):
        for text in ("№1, №5", "правила 1 и 5", "1; 5", "5 1"):
            with self.subTest(text=text):
                self.assertEqual(self.score("t4_serious", text, t4_serious=[1, 5]), 8)
        self.assertEqual(self.score("t4_serious", "1, 5 и ещё 7", t4_serious=[1, 5]), 0)
        self.assertEqual(self.score("t4_serious", "1" * 5000, t4_serious=[1, 5]), 0)  # не падает

    def test_grade_copied_from_report(self):
        for text, grade in [("Неудовлетворительно.", "неудовлетворительно"),
                            ("неудовлетворительно (балл 50 из 100)", "неудовлетворительно"),
                            ("Оценка: хорошо", "хорошо"),
                            ("удовлетворительно", "удовлетворительно")]:
            with self.subTest(text=text):
                self.assertEqual(self.score("t4_grade", text, t4_grade=grade), 5)
        # «удовлетворительно» — часть слова «неудовлетворительно», но это другая оценка
        self.assertEqual(self.score("t4_grade", "неудовлетворительно", t4_grade="удовлетворительно"), 0)
        self.assertEqual(self.score("t4_grade", "хорошо или отлично", t4_grade="хорошо"), 0)

    def test_numbers_written_freely(self):
        exact = self.key["t2_probability"]
        self.assertEqual(self.score("t2_probability", f"{exact * 100:.1f} %".replace(".", ",")), 5)
        root = self.key["t2_estimate"]
        bits = root.bit_length() - 1
        self.assertEqual(self.score("t2_estimate", f"2^{bits}"), 2)
        self.assertEqual(self.score("t2_estimate", f"≈ 2 ^ {bits}"), 2)
        self.assertEqual(self.score("t2_estimate", f"2^{bits + 2}"), 0)
        self.assertEqual(self.score("t1_q1", "9" * 5000), 0)  # не падает на огромном числе

    def test_answer_on_next_line(self):
        text = blank_answers(self.variant).replace(
            "t3_crc:\n", f"t3_crc:\n{self.key['t3_crc']}\n").replace(
            "t2_conclusion:\n", "t2_conclusion:\nвывод: повторы начинаются при n ≈ √N\n")
        answers = parse_answers(text)
        self.assertEqual(answers["t3_crc"], self.key["t3_crc"])
        self.assertEqual(answers["t2_conclusion"], "вывод: повторы начинаются при n ≈ √N")
        self.assertEqual(answers["t3_hmac16"], "")  # следующее поле не задето


class SecretTests(TempDirTestCase):
    def test_create_and_read(self):
        path = create_secret(self.tmp)
        self.assertEqual(path.name, SECRET_FILE_NAME)
        text = path.read_text(encoding="utf-8")
        self.assertRegex(text, r"^[0-9a-f]{64}\n$")
        self.assertEqual(read_secret(self.tmp), text.strip().encode("utf-8"))

    def test_existing_secret_is_not_overwritten(self):
        path = create_secret(self.tmp)
        before = path.read_bytes()
        with self.assertRaises(ValueError):
            create_secret(self.tmp)
        self.assertEqual(path.read_bytes(), before)

    def test_strip_bom_and_newlines(self):
        # Блокнот может добавить BOM и перевод строки — варианты от этого меняться не должны.
        (self.tmp / SECRET_FILE_NAME).write_bytes("﻿  abcdef0123456789abcdef \r\n\r\n".encode("utf-8"))
        self.assertEqual(read_secret(self.tmp), b"abcdef0123456789abcdef")

    def test_secret_cannot_be_created_inside_project(self):
        target = PROJECT_DIR / "variants"
        existed = target.exists()
        with self.assertRaises(ValueError):
            create_secret(target)
        self.assertFalse((target / SECRET_FILE_NAME).exists())
        self.assertEqual(target.exists(), existed)  # и папка не создана

    def test_missing_or_short_secret(self):
        with self.assertRaises(ValueError):
            read_secret(self.tmp)
        (self.tmp / SECRET_FILE_NAME).write_text("short\n", encoding="utf-8")
        with self.assertRaises(ValueError):
            read_secret(self.tmp)


class StudentsCsvTests(TempDirTestCase):
    def write(self, text, encoding="utf-8"):
        path = self.tmp / "students.csv"
        path.write_bytes(text.encode(encoding))
        return path

    def test_excel_csv_utf8_with_header(self):
        path = self.write("﻿student_id;ФИО\r\nis23_01;Иванова Айгерим\r\n\r\nIS23_02;Ким Олег\r\n")
        self.assertEqual(read_students(path), [("is23_01", "Иванова Айгерим"), ("is23_02", "Ким Олег")])

    def test_comma_and_no_header(self):
        path = self.write("is23_01,Иванова Айгерим\nis23_02,Ким Олег\n")
        self.assertEqual([sid for sid, _ in read_students(path)], ["is23_01", "is23_02"])

    def test_bad_ids_are_all_reported_with_file_line_numbers(self):
        # Номера — как в файле: заголовок — строка 1, пустая строка тоже считается.
        path = self.write("student_id;ФИО\nis23_01;А\nис23_02;Б\n\nis23_01;В\n")
        with self.assertRaises(ValueError) as caught:
            read_students(path)
        message = str(caught.exception)
        self.assertIn("строка 3: ID «ис23_02»", message)
        self.assertIn("кириллица", message)
        self.assertIn("строка 5: ID is23_01 повторяется", message)

    def test_not_utf8_gives_hint(self):
        path = self.write("is23_01;Иванова Айгерим\n", encoding="cp1251")
        with self.assertRaises(ValueError) as caught:
            read_students(path)
        self.assertIn("CSV UTF-8", str(caught.exception))

    def test_empty_file(self):
        with self.assertRaises(ValueError):
            read_students(self.write("\n\n"))


class MakeGroupTests(TempDirTestCase):
    def setUp(self):
        super().setUp()
        self.variants = self.tmp / "variants"
        self.keys = self.tmp / "teacher_only"

    def generate(self, students=GROUP, secret=SECRET, variants=None, keys=None):
        return make_group(secret, students, DATA, variants or self.variants, keys or self.keys)

    def snapshot(self, folder):
        return {p.name: p.read_bytes() for p in sorted(folder.iterdir())}

    def test_files_and_key(self):
        result = self.generate()
        self.assertEqual(len(result["created"]), 30)
        self.assertEqual(sorted(p.name for p in self.variants.iterdir()), [f"{sid}.json" for sid, _ in GROUP])
        key_data = load_json(self.keys / KEY_FILE_NAME)
        self.assertEqual(len(key_data["students"]), 30)
        self.assertEqual(key_data["students"]["is23_05"]["name"], "Тестовый Студент 5")
        for student_id, variant in ((sid, load_variant(self.variants / f"{sid}.json", sid)) for sid, _ in GROUP):
            self.assertEqual(variant_text(variant), variant_text(make_variant(SECRET, student_id, DATA)[0]))

    def test_same_input_gives_identical_bytes(self):
        self.generate()
        self.generate(variants=self.tmp / "v2", keys=self.tmp / "k2")
        self.assertEqual(self.snapshot(self.variants), self.snapshot(self.tmp / "v2"))
        self.assertEqual((self.keys / KEY_FILE_NAME).read_bytes(), (self.tmp / "k2" / KEY_FILE_NAME).read_bytes())

    def test_rerun_with_new_student_keeps_old_files(self):
        self.generate(students=GROUP[:29])
        before = self.snapshot(self.variants)
        times = {p.name: p.stat().st_mtime_ns for p in self.variants.iterdir()}
        result = self.generate()
        self.assertEqual([p.name for p in result["created"]], ["is23_30.json"])
        self.assertEqual(len(result["kept"]), 29)
        after = self.snapshot(self.variants)
        for name, content in before.items():
            self.assertEqual(after[name], content)
            self.assertEqual((self.variants / name).stat().st_mtime_ns, times[name])
        self.assertIn("is23_30", load_json(self.keys / KEY_FILE_NAME)["students"])

    def test_stops_if_teacher_files_in_variants_folder(self):
        for name in ("_KEY_answers.json", "secret.txt", "Secret_copy.txt"):
            with self.subTest(name=name):
                folder = self.tmp / f"v_{name}"
                folder.mkdir()
                (folder / name).write_text("x", encoding="utf-8")
                with self.assertRaises(ValueError):
                    self.generate(variants=folder)
                self.assertEqual([p.name for p in folder.iterdir()], [name])  # ничего не дописано

    def test_key_folder_must_be_outside_project_and_variants(self):
        with self.assertRaises(ValueError):
            self.generate(keys=PROJECT_DIR / "teacher_only")
        with self.assertRaises(ValueError):
            self.generate(keys=self.variants / "keys")
        self.assertFalse((PROJECT_DIR / "teacher_only").exists())
        # В репозитории проект — вся папка «Ключ и замок» (с data/ и docs/), а не только python/.
        with self.assertRaises(ValueError):
            self.generate(keys=ROOT_DIR / "teacher_only")
        self.assertFalse((ROOT_DIR / "teacher_only").exists())

    def test_other_secret_is_refused(self):
        self.generate(students=GROUP[:3])
        with self.assertRaises(ValueError):
            self.generate(students=GROUP[:4], secret=b"another secret")
        self.assertEqual(len(list(self.variants.iterdir())), 3)

    def test_changed_variant_file_is_refused(self):
        self.generate(students=GROUP[:3])
        (self.variants / "is23_01.json").write_text("{}", encoding="utf-8")
        with self.assertRaises(ValueError):
            self.generate(students=GROUP[:4])
        self.assertFalse((self.variants / "is23_04.json").exists())  # при ошибке не пишется ничего

    def test_data_change_does_not_block_late_student(self):
        """Правка данных (банк вопросов вырос до 15–20) не мешает дописать опоздавшего."""
        self.generate(students=GROUP[:3])
        before = self.snapshot(self.variants)
        old_keys = load_json(self.keys / KEY_FILE_NAME)["students"]
        questions = DATA["questions"]
        changed = dict(DATA, questions={"questions": questions["questions"][:-2], "written": questions["written"]})
        # Проверка осмысленна, только если с новыми данными старые варианты были бы другими.
        self.assertTrue(any(variant_text(make_variant(SECRET, sid, changed)[0]).encode() != before[f"{sid}.json"]
                            for sid, _ in GROUP[:3]))
        result = make_group(SECRET, GROUP[:4], changed, self.variants, self.keys)
        self.assertEqual((len(result["kept"]), [p.name for p in result["created"]]), (3, ["is23_04.json"]))
        new_keys = load_json(self.keys / KEY_FILE_NAME)["students"]
        for sid, _ in GROUP[:3]:
            self.assertEqual((self.variants / f"{sid}.json").read_bytes(), before[f"{sid}.json"])
            self.assertEqual(new_keys[sid]["key"], old_keys[sid]["key"])  # ключ — к старому файлу
        self.assertEqual(new_keys["is23_04"]["key"], json.loads(json.dumps(make_variant(SECRET, "is23_04", changed)[1])))

    def test_secret_is_not_in_any_file(self):
        secret = b"0123456789abcdef0123456789abcdef"
        self.generate(students=GROUP[:3], secret=secret)
        for path in list(self.variants.iterdir()) + [self.keys / KEY_FILE_NAME]:
            self.assertNotIn(secret, path.read_bytes())
        for path in self.variants.iterdir():
            self.assertNotIn(secret_fingerprint(secret).encode(), path.read_bytes())


class CheckFolderTests(TempDirTestCase):
    def setUp(self):
        super().setUp()
        self.variants, self.keys, self.answers = self.tmp / "variants", self.tmp / "keys", self.tmp / "answers"
        make_group(SECRET, GROUP, DATA, self.variants, self.keys)
        self.answers.mkdir()

    def write_blank(self, student_id, text, encoding="utf-8"):
        (self.answers / blank_name(student_id)).write_bytes(text.encode(encoding))

    def read_csv(self):
        out = self.tmp / "results.csv"
        check_folder(self.answers, self.keys / KEY_FILE_NAME, out)
        with open(out, encoding="utf-8-sig", newline="") as f:
            return list(csv.reader(f, delimiter=";"))

    def test_results_csv(self):
        for i, (variant, key) in enumerate(GROUP_VARIANTS[:10]):
            self.write_blank(variant["student_id"], "﻿" + filled_blank(variant, key).replace("\n", "\r\n"))
        self.write_blank("is23_11", blank_answers(GROUP_VARIANTS[10][0]))           # пустой бланк
        self.write_blank("is23_12", "\x00\x01мусор без полей\nt2_count: много\n")      # битый бланк
        variant, key = GROUP_VARIANTS[12]
        self.write_blank("is23_13", filled_blank(variant, key) + "t2_conclusion: Вывод\n", "cp1251")
        self.write_blank("is23_14", filled_blank(*GROUP_VARIANTS[13]).replace("student_id: is23_14",
                                                                             "student_id: is23_99"))
        (self.answers / "answers_is99_01.txt").write_text("t1_q1: 1\n", encoding="utf-8")

        rows = self.read_csv()
        header, body = rows[0], rows[1:]
        self.assertEqual(header, [title for _, title in RESULT_COLUMNS])
        self.assertEqual(len(body), 31)  # 30 студентов + чужой файл
        by_id = {row[0]: dict(zip([k for k, _ in RESULT_COLUMNS], row)) for row in body}
        auto = [k for k, _ in RESULT_COLUMNS[2:12]]
        manual = [k for k, _ in RESULT_COLUMNS[12:20]]

        for student_id, _ in GROUP[:10]:
            self.assertEqual(by_id[student_id]["auto_total"], str(MAX_AUTO))
            self.assertEqual(by_id[student_id]["notes"], "")
        self.assertEqual(by_id["is23_01"]["name"], "Тестовый Студент 1")  # кириллица на месте
        self.assertEqual(by_id["is23_11"]["auto_total"], "0")
        self.assertIn("не заполнено", by_id["is23_11"]["notes"])
        self.assertEqual(by_id["is23_12"]["auto_total"], "0")
        self.assertIn("t2_count: не удалось разобрать", by_id["is23_12"]["notes"])
        self.assertEqual(by_id["is23_13"]["auto_total"], str(MAX_AUTO))  # числа и hex не пострадали
        self.assertIn("не в UTF-8", by_id["is23_13"]["notes"])
        self.assertIn("ID внутри бланка не совпадает", by_id["is23_14"]["notes"])
        self.assertIn("бланк не сдан", by_id["is23_20"]["notes"])
        self.assertEqual(by_id["is23_20"]["auto_total"], "")
        self.assertIn("не из списка группы", by_id["answers_is99_01.txt"]["notes"])

        for row in by_id.values():
            for column in auto:
                self.assertTrue(row[column] == "" or row[column].isdigit(), (row["student_id"], column))
            for column in manual:
                self.assertEqual(row[column], "")  # ручные части и итог — для преподавателя


class CheckRobustnessTests(TempDirTestCase):
    """Проверка группы не должна останавливаться из-за одного бланка."""

    def setUp(self):
        super().setUp()
        self.keys, self.answers = self.tmp / "keys", self.tmp / "answers"
        make_group(SECRET, GROUP[:5], DATA, self.tmp / "variants", self.keys)
        self.key_data = load_key(self.keys / KEY_FILE_NAME)
        self.answers.mkdir()
        for variant, key in GROUP_VARIANTS[:5]:
            (self.answers / blank_name(variant["student_id"])).write_text(filled_blank(variant, key),
                                                                         encoding="utf-8")

    def rows(self, student_ids=None):
        return {row["student_id"]: row for row in check_group(self.answers, self.key_data, student_ids)}

    def test_unreadable_blank_is_reported_and_others_checked(self):
        path = self.answers / blank_name("is23_02")
        path.unlink()
        path.mkdir()  # вместо файла — папка с тем же именем: прочитать нельзя
        rows = self.rows()
        self.assertIn("бланк не проверен", "; ".join(rows["is23_02"]["notes"]))
        self.assertEqual([rows[f"is23_0{i}"]["auto_total"] for i in (1, 3, 4, 5)], [MAX_AUTO] * 4)

    def test_utf16_blank_from_notepad(self):
        variant, key = GROUP_VARIANTS[2]
        (self.answers / blank_name("is23_03")).write_bytes(filled_blank(variant, key).encode("utf-16"))
        row = self.rows()["is23_03"]
        self.assertEqual((row["auto_total"], row["notes"]), (MAX_AUTO, []))

    def test_only_listed_students(self):
        rows = self.rows(["is23_01", "is23_02", "is23_77"])
        self.assertEqual(rows["is23_01"]["auto_total"], MAX_AUTO)
        self.assertIn("нет в ключе", rows["is23_77"]["notes"][0])
        self.assertIn("не из списка группы", rows[blank_name("is23_03")]["notes"][0])
        self.assertNotIn("is23_03", rows)

    def test_damaged_key_is_explained(self):
        path = self.tmp / "bad_key.json"
        for text in ("{", '{"students": {}}', '{"fingerprint": "x", "students": {"is23_01": {"name": "", "key": {}}}}'):
            path.write_text(text, encoding="utf-8")
            with self.subTest(text=text), self.assertRaises(ValueError) as caught:
                load_key(path)
            self.assertIn("повреждён", str(caught.exception))

    def test_free_path_never_overwrites(self):
        out = self.tmp / "results.csv"
        self.assertEqual(free_path(out), out)
        out.write_text("ручные баллы", encoding="utf-8")
        self.assertEqual(free_path(out).name, "results_2.csv")
        (self.tmp / "results_2.csv").write_text("", encoding="utf-8")
        self.assertEqual(free_path(out).name, "results_3.csv")


class StudentCopyTests(TempDirTestCase):
    """В папку для учебных ПК не должны попасть ответы."""

    def setUp(self):
        super().setUp()
        self.variants = self.tmp / "variants"
        make_group(SECRET, GROUP[:3], DATA, self.variants, self.tmp / "keys")
        self.out = self.tmp / "lab"
        self.copied = make_student_copy(self.out, self.variants)

    def test_only_student_files(self):
        names = sorted(str(p.relative_to(self.out)).replace("\\", "/") for p in self.copied)
        self.assertIn("main.py", names)
        self.assertIn("start.bat", names)
        self.assertIn("wifi/variants.py", names)
        self.assertIn("data/protocols.json", names)
        self.assertIn("variants/is23_01.json", names)
        for forbidden in ("teacher_data", "tests", "teacher.py", "generate.bat", "check.bat", "students.csv",
                          "notes.md", "__pycache__", ".git"):
            self.assertFalse([n for n in names if n == forbidden or n.startswith(forbidden + "/")], forbidden)

    def test_no_answers_in_copy(self):
        for path in self.out.rglob("*.json"):
            data = load_json(path)
            text = json.dumps(data, ensure_ascii=False)
            with self.subTest(file=path.name):
                self.assertNotIn('"answer"', text)
                self.assertNotIn(KEY_FILE_NAME, path.name)
        for _, key in GROUP_VARIANTS[:3]:
            all_text = "".join(p.read_text(encoding="utf-8") for p in self.out.rglob("*.json")).lower()
            self.assertNotIn(key["t3_hmac16"], all_text)

    def test_shared_data_copied_next_to_program(self):
        # В репозитории data/ лежит уровнем выше python/, а в копии — рядом с программой, как в версии 1.
        names = sorted(p.name for p in DATA_DIR.glob("*.json"))
        self.assertTrue(names)
        self.assertEqual(sorted(p.name for p in (self.out / "data").iterdir()), names)
        for name in names:
            self.assertEqual((self.out / "data" / name).read_bytes(), (DATA_DIR / name).read_bytes())

    def test_bat_keeps_crlf(self):
        self.assertEqual((self.out / "start.bat").read_bytes(), (PROJECT_DIR / "start.bat").read_bytes())

    def test_refuses_bad_targets(self):
        with self.assertRaises(ValueError):
            make_student_copy(self.out, self.variants)  # папка уже не пуста
        with self.assertRaises(ValueError):
            make_student_copy(PROJECT_DIR / "lab_copy")
        self.assertFalse((PROJECT_DIR / "lab_copy").exists())
        with self.assertRaises(ValueError):
            make_student_copy(ROOT_DIR / "lab_copy")
        self.assertFalse((ROOT_DIR / "lab_copy").exists())
        (self.variants / "secret.txt").write_text("x", encoding="utf-8")
        with self.assertRaises(ValueError):
            make_student_copy(self.tmp / "lab2", self.variants)


class BankPathTests(TempDirTestCase):
    def test_demo_bank_without_closed_bank(self):
        self.assertEqual(bank_path(self.tmp), QUESTIONS_PATH)
        self.assertEqual(QUESTIONS_PATH.name, "questions_demo.json")

    def test_closed_bank_from_teacher_folder(self):
        closed = self.tmp / BANK_FILE_NAME
        closed.write_bytes(QUESTIONS_PATH.read_bytes())
        self.assertEqual(bank_path(self.tmp), closed)
        # Варианты строятся из того банка, который передан: с тем же банком — те же, что из демо.
        data = load_variant_data(closed)
        self.assertEqual(variant_text(make_variant(SECRET, "is23_01", data)[0]),
                         variant_text(make_variant(SECRET, "is23_01", DATA)[0]))


class QuestionBankTests(unittest.TestCase):
    def test_bank(self):
        questions = DATA["questions"]["questions"]
        ids = [q["id"] for q in questions]
        self.assertEqual(len(ids), len(set(ids)))
        # Демо-банк: 8 вопросов. В закрытом банке преподавателя — 15–20 (план версии 1, раздел 2.4).
        self.assertGreaterEqual(len(questions), 8)
        for q in questions:
            with self.subTest(question=q["id"]):
                self.assertIn(q["type"], ("choice", "principle"))
                self.assertTrue(q["sources"])
                if q["type"] == "choice":
                    self.assertEqual(len(q["options"]), 4)
                    self.assertEqual(len(set(q["options"])), 4)
                    self.assertTrue(1 <= q["answer"] <= 4)
                else:
                    self.assertNotIn("options", q)
                    self.assertIn(q["answer"], [p["no"] for p in DATA["principles"]])
        # Утверждения «к какому принципу» — по всем четырём принципам.
        covered = sorted({q["answer"] for q in questions if q["type"] == "principle"})
        self.assertEqual(covered, sorted(p["no"] for p in DATA["principles"]))

    def test_written_questions_cover_lecture_3_to_7(self):
        written = DATA["questions"]["written"]
        self.assertEqual(sorted(w["lecture_question"] for w in written), [3, 4, 5, 6, 7])
        for w in written:
            with self.subTest(question=w["id"]):
                self.assertTrue(w["sources"])  # эталонный ответ в пакете преподавателя — по ним

    def test_no_attack_descriptions(self):
        texts = []
        for q in DATA["questions"]["questions"]:
            texts += [q["text"]] + q.get("options", [])
        texts += [w["text"] for w in DATA["questions"]["written"]]
        for text in texts:
            for word in FORBIDDEN_WORDS:
                self.assertNotIn(word, text.lower(), text)


if __name__ == "__main__":
    unittest.main()
