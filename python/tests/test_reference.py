"""Тесты модуля 1 (справочник протоколов) и функций вывода из common.py."""

import sys
import unittest
from pathlib import Path

# Чтобы тесты запускались и из папки проекта, и из IDE с другой текущей папкой.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from wifi.common import SCREEN_WIDTH, cite, format_card, format_table, load_sources, parse_number
from wifi.reference import (
    CARD_FIELDS,
    COMPARE_FIELDS,
    compare_field,
    format_comparison,
    format_protocol,
    get_protocol,
    load_protocols,
    validate_protocols,
)


class ReferenceDataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.protocols = load_protocols()
        cls.sources = load_sources()

    def test_four_protocols_in_order(self):
        self.assertEqual([p["id"] for p in self.protocols], ["wep", "wpa", "wpa2", "wpa3"])

    def test_validate_protocols_has_no_errors(self):
        self.assertEqual(validate_protocols(self.protocols, self.sources), [])

    def test_control_values(self):
        # Контрольные факты из плана (раздел 2.1): если их случайно сотрут, тест упадёт.
        self.assertIn("CRC-32", get_protocol(self.protocols, "wep")["integrity"])
        self.assertIn("CCMP", get_protocol(self.protocols, "wpa2")["encryption"])
        self.assertIn("SAE", get_protocol(self.protocols, "wpa3")["authentication"])
        self.assertIn("TKIP", get_protocol(self.protocols, "wpa")["encryption"])

    def test_wpa3_has_modes(self):
        self.assertTrue(get_protocol(self.protocols, "wpa3").get("modes"))

    def test_get_protocol_ignores_case_and_rejects_unknown(self):
        self.assertEqual(get_protocol(self.protocols, " WPA2 ")["id"], "wpa2")
        with self.assertRaises(KeyError):
            get_protocol(self.protocols, "wpa4")

    def test_compare_field_returns_four_rows(self):
        rows = compare_field(self.protocols, "integrity")
        self.assertEqual(len(rows), 4)
        self.assertEqual([r["protocol"] for r in rows], ["WEP", "WPA", "WPA2", "WPA3"])

    def test_compare_field_rejects_unknown_field(self):
        with self.assertRaises(ValueError):
            compare_field(self.protocols, "password")

    def test_validate_catches_broken_data(self):
        broken = [dict(p) for p in self.protocols]
        broken[0]["integrity"] = ""
        broken[1]["sources"] = ["no_such_source", "wiki_wpa"]
        errors = validate_protocols(broken, self.sources)
        self.assertTrue(any("wep" in e and "integrity" in e for e in errors))
        self.assertTrue(any("no_such_source" in e for e in errors))
        self.assertTrue(any("wpa:" in e and "первичных" in e for e in errors))

    def test_validate_catches_missing_protocol(self):
        errors = validate_protocols(self.protocols[:3], self.sources)
        self.assertTrue(errors)


class LineWidthTest(unittest.TestCase):
    """Критерий готовности 2.1: ни одна строка вывода меню 1 не длиннее 100 символов."""

    @classmethod
    def setUpClass(cls):
        cls.protocols = load_protocols()
        cls.sources = load_sources()

    def assert_width(self, text):
        for line in text.splitlines():
            self.assertLessEqual(len(line), SCREEN_WIDTH, line)

    def test_cards_fit_width(self):
        for protocol in self.protocols:
            self.assert_width(format_protocol(protocol, self.sources))

    def test_comparisons_fit_width(self):
        for field, _ in COMPARE_FIELDS:
            self.assert_width(format_comparison(self.protocols, field))

    def test_card_contains_all_filled_fields(self):
        text = format_protocol(get_protocol(self.protocols, "wpa3"), self.sources)
        for _, label in CARD_FIELDS:
            self.assertIn(label + ":", text)
        self.assertIn("Источники:", text)


class CommonFormatTest(unittest.TestCase):
    def test_format_table_wraps_long_cells(self):
        rows = [{"a": "x", "b": "слово " * 60}]
        text = format_table(rows, [("a", "A"), ("b", "B")], width=40)
        lines = text.splitlines()
        self.assertGreater(len(lines), 3)
        self.assertTrue(all(len(line) <= 40 for line in lines))

    def test_format_table_breaks_very_long_word(self):
        rows = [{"a": "a" * 300}]
        text = format_table(rows, [("a", "A")], width=50)
        self.assertTrue(all(len(line) <= 50 for line in text.splitlines()))

    def test_format_card_skips_empty_and_joins_lists(self):
        text = format_card({"x": "", "y": ["один", "два"]}, [("x", "Икс"), ("y", "Игрек")])
        self.assertEqual(text, "Игрек: один; два")

    def test_cite_marks_unverified_secondary_and_unknown(self):
        sources = {
            "p": {"label": "P", "primary": True, "verified": True},
            "s": {"label": "S", "primary": False, "verified": True},
            "u": {"label": "U", "primary": True, "verified": False},
            "l": {"label": "L", "primary": False, "verified": True, "kind": "lecture"},
        }
        text = cite(["p", "s", "u", "l", "zzz"], sources)
        self.assertEqual(text, "Источники: P; S (втор.); U [проверить]; L; zzz [нет в sources.json]")

    def test_parse_number(self):
        self.assertEqual(parse_number("0,525"), 0.525)
        self.assertEqual(parse_number(" 0.525 "), 0.525)
        self.assertEqual(parse_number("1 000"), 1000.0)
        for bad in ["", "abc", "1,2,3", "nan", "inf"]:
            with self.assertRaises(ValueError):
                parse_number(bad)


if __name__ == "__main__":
    unittest.main()
