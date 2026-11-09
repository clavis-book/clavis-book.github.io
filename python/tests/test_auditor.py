"""Тесты модуля 3: правила аудитора, подсчёт баллов, противоречия, примеры профилей."""

import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from wifi.auditor import (
    PENALTIES,
    audit,
    check_consistency,
    choose_option,
    format_report,
    grade_for,
    load_rules,
    serious_rule_numbers,
    validate_profile,
)
from wifi.common import PROJECT_DIR, SCREEN_WIDTH, load_json, load_sources

EXAMPLES = PROJECT_DIR / "examples"


def good_profile():
    return load_json(EXAMPLES / "profile_good.json")


def finding_for(result, rule_no):
    return next(f for f in result.findings if f.rule_no == rule_no)


class RulesDataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rules = load_rules()

    def test_twelve_numbered_rules(self):
        self.assertEqual([r["no"] for r in self.rules], list(range(1, 13)))
        self.assertEqual(len({r["param"] for r in self.rules}), 12)

    def test_options_are_complete(self):
        for rule in self.rules:
            options = rule["options"] if rule["kind"] == "choice" else rule["bands"]
            rule_sources = set()
            for option in options:
                with self.subTest(rule=rule["no"], option=option.get("value", option.get("min"))):
                    self.assertIn(option["level"], PENALTIES)
                    self.assertEqual(option["penalty"], PENALTIES[option["level"]])
                    self.assertIn(option["basis"], ("источник", "решение автора"))
                    self.assertTrue(option["text"].strip())
                    self.assertTrue(option["recommendation"].strip())
                    if option["basis"] == "источник":
                        self.assertTrue(option["sources"], "основание «источник» без источника")
                    rule_sources.update(option["sources"])
            with self.subTest(rule=rule["no"]):
                self.assertTrue(rule_sources, "у правила нет ни одного источника")

    def test_no_free_text_questions(self):
        # Аудитор не просит ввести пароль или имя сети текстом: только выбор из списка и число.
        for rule in self.rules:
            self.assertIn(rule["kind"], ("choice", "range"))
        for param in ("password_length", "password_kind", "ssid", "admin_password"):
            rule = next(r for r in self.rules if r["param"] == param)
            self.assertIn("не вводите", rule["question"])

    def test_range_bands_cover_0_to_128_without_gaps(self):
        rule = next(r for r in self.rules if r["param"] == "password_length")
        covered = []
        for band in rule["bands"]:
            covered.extend(range(band["min"], band["max"] + 1))
        self.assertEqual(covered, list(range(0, 129)))


class AuditTableTest(unittest.TestCase):
    """Табличные тесты: каждое значение каждого правила даёт свои level и penalty из JSON."""

    @classmethod
    def setUpClass(cls):
        cls.rules = load_rules()

    def test_every_option_from_json(self):
        for rule in self.rules:
            if rule["kind"] == "choice":
                values = [(o["value"], o) for o in rule["options"]]
            else:
                values = [(b["min"], b) for b in rule["bands"]] + [(b["max"], b) for b in rule["bands"]]
            for value, expected in values:
                profile = good_profile()
                profile[rule["param"]] = value
                if rule["param"] == "protocol" and value in ("open", "owe"):
                    for skipped in ("cipher", "password_length", "password_kind"):
                        profile.pop(skipped)
                with self.subTest(rule=rule["no"], value=value):
                    found = finding_for(audit(profile, self.rules), rule["no"])
                    self.assertEqual((found.level, found.penalty), (expected["level"], expected["penalty"]))

    def test_manual_cases(self):
        # Ручные случаи — записаны явно, а не взяты из JSON, чтобы поймать ошибку в самих данных.
        cases = [
            ("protocol", "wep", "critical", 40),
            ("protocol", "wpa2", "low", 5),
            ("wps", "pin", "high", 20),
            ("password_length", 15, "medium", 10),
            ("pmf", "optional", "low", 5),
            ("hidden_ssid_mac", "on", "info", 0),
            ("guest", "owe", "low", 5),
            ("admin_password", "default", "critical", 40),
        ]
        rule_no = {r["param"]: r["no"] for r in self.rules}
        for param, value, level, penalty in cases:
            profile = good_profile()
            profile[param] = value
            with self.subTest(param=param, value=value):
                found = finding_for(audit(profile, self.rules), rule_no[param])
                self.assertEqual((found.level, found.penalty), (level, penalty))

    def test_password_length_bands(self):
        expected = {7: "critical", 8: "high", 11: "high", 12: "medium", 19: "medium",
                    20: "ok", 63: "ok", 64: "ok", 128: "ok", 0: "critical"}
        for length, level in expected.items():
            profile = good_profile()
            profile["password_length"] = length
            with self.subTest(length=length):
                self.assertEqual(finding_for(audit(profile, self.rules), 3).level, level)


class ScoreAndGradeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rules = load_rules()

    def test_grade_thresholds(self):
        for score, grade in [(100, "отлично"), (90, "отлично"), (89, "хорошо"), (75, "хорошо"),
                             (74, "удовлетворительно"), (60, "удовлетворительно"),
                             (59, "неудовлетворительно"), (0, "неудовлетворительно")]:
            self.assertEqual(grade_for(score, has_critical=False), grade)

    def test_critical_caps_grade(self):
        # Всё идеально, кроме открытой сети: по баллу вышло бы «удовлетворительно».
        profile = good_profile()
        profile["protocol"] = "open"
        for skipped in ("cipher", "password_length", "password_kind"):
            profile.pop(skipped)
        result = audit(profile, self.rules)
        self.assertEqual(result.score, 60)
        self.assertEqual(result.grade, "неудовлетворительно")

    def test_score_always_in_range(self):
        rng = random.Random(500)
        for _ in range(500):
            profile = {}
            for rule in self.rules:
                if rule["kind"] == "choice":
                    profile[rule["param"]] = rng.choice(rule["options"])["value"]
                else:
                    profile[rule["param"]] = rng.randint(0, 128)
            if profile["protocol"] in ("open", "owe"):
                for skipped in ("cipher", "password_length", "password_kind"):
                    profile.pop(skipped)
            result = audit(profile, self.rules)
            self.assertTrue(0 <= result.score <= 100)

    def test_findings_sorted_by_importance(self):
        result = audit(load_json(EXAMPLES / "profile_bad.json"), self.rules)
        order = ["critical", "high", "medium", "low", "info", "ok"]
        ranks = [order.index(f.level) for f in result.findings]
        self.assertEqual(ranks, sorted(ranks))


class ValidationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rules = load_rules()

    def test_good_profile_valid(self):
        self.assertEqual(validate_profile(good_profile(), self.rules), [])

    def test_length_out_of_range(self):
        for bad in (129, -1, 12.5, "12", True):
            profile = good_profile()
            profile["password_length"] = bad
            with self.subTest(value=bad):
                self.assertTrue(validate_profile(profile, self.rules))
                with self.assertRaises(ValueError):
                    audit(profile, self.rules)

    def test_unknown_value_missing_and_extra_params(self):
        profile = good_profile()
        profile["wps"] = "maybe"
        self.assertTrue(any("wps" in e for e in validate_profile(profile, self.rules)))
        profile = good_profile()
        del profile["pmf"]
        self.assertTrue(any("pmf" in e for e in validate_profile(profile, self.rules)))
        profile = good_profile()
        profile["password"] = "secret"
        self.assertTrue(any("password" in e for e in validate_profile(profile, self.rules)))

    def test_open_network_needs_no_password_params(self):
        profile = good_profile()
        profile["protocol"] = "open"
        for skipped in ("cipher", "password_length", "password_kind"):
            profile.pop(skipped)
        self.assertEqual(validate_profile(profile, self.rules), [])

    def test_choose_option(self):
        rule = next(r for r in self.rules if r["param"] == "password_length")
        self.assertEqual(choose_option(rule, 12)["level"], "medium")
        self.assertIsNone(choose_option(rule, 500))


class ConsistencyTest(unittest.TestCase):
    """Все проверки противоречий между ответами."""

    def warnings_for(self, **changes):
        profile = good_profile()
        profile.update(changes)
        return check_consistency(profile)

    def test_good_profile_has_no_warnings(self):
        self.assertEqual(check_consistency(good_profile()), [])

    def test_wpa3_only_requires_pmf(self):
        self.assertTrue(self.warnings_for(protocol="wpa3", pmf="optional"))
        self.assertTrue(self.warnings_for(protocol="wpa3", pmf="off"))
        self.assertFalse(self.warnings_for(protocol="wpa3", pmf="required"))

    def test_transition_mode_pmf_off(self):
        self.assertTrue(self.warnings_for(protocol="wpa2_wpa3", pmf="off"))
        self.assertFalse(self.warnings_for(protocol="wpa2_wpa3", pmf="optional"))

    def test_cipher_mismatch(self):
        self.assertTrue(self.warnings_for(protocol="wpa3", cipher="tkip"))
        self.assertTrue(self.warnings_for(protocol="wpa2_wpa3", cipher="tkip"))
        self.assertTrue(self.warnings_for(protocol="wep", cipher="aes"))
        self.assertTrue(self.warnings_for(protocol="wpa", cipher="aes"))
        self.assertFalse(self.warnings_for(protocol="wpa2", cipher="aes"))

    def test_password_length_over_64(self):
        self.assertTrue(self.warnings_for(protocol="wpa2", password_length=70))
        self.assertFalse(self.warnings_for(protocol="wpa3", password_length=70))
        reminder = self.warnings_for(protocol="wpa2", password_length=64)
        self.assertEqual(len(reminder), 1)
        self.assertIn("64 шестнадцатеричных", reminder[0])


class ExampleProfilesTest(unittest.TestCase):
    """Критерии готовности 2.3 для трёх примеров."""

    @classmethod
    def setUpClass(cls):
        cls.rules = load_rules()
        cls.sources = load_sources()

    def result(self, name):
        return audit(load_json(EXAMPLES / f"profile_{name}.json"), self.rules)

    def test_good_and_fixed_are_excellent(self):
        for name in ("good", "fixed"):
            with self.subTest(profile=name):
                result = self.result(name)
                self.assertEqual(result.grade, "отлично")
                self.assertEqual(serious_rule_numbers(result), [])

    def test_bad_is_unsatisfactory(self):
        result = self.result("bad")
        self.assertEqual(result.grade, "неудовлетворительно")
        self.assertGreaterEqual(len(serious_rule_numbers(result)), 3)

    def test_reports_fit(self):
        for name in ("good", "bad", "fixed"):
            text = format_report(self.result(name), self.sources)
            lines = text.splitlines()
            with self.subTest(profile=name):
                self.assertLessEqual(len(lines), 40)
                self.assertTrue(all(len(line) <= SCREEN_WIDTH for line in lines))

    def test_report_mentions_author_decision(self):
        text = format_report(self.result("bad"), self.sources)
        self.assertIn("решение автора", text)
        self.assertIn("Источники:", text)

    def test_info_notes_have_sources(self):
        # «К сведению» — тоже рекомендация (правило 12 — дополнение к лекции), ей нужно основание.
        # Абзацы склеиваются: ссылки могут уйти на следующую строку.
        for name in ("good", "bad", "fixed"):
            result = self.result(name)
            text = format_report(result, self.sources).replace("\n   ", " ")
            notes = [line for line in text.splitlines() if line.startswith("К сведению")]
            infos = [f for f in result.findings if f.level == "info"]
            with self.subTest(profile=name):
                self.assertEqual(len(notes), len(infos))
                for note, finding in zip(notes, infos):
                    self.assertIn("Источники:", note)
                    for sid in finding.sources:
                        self.assertIn(self.sources[sid]["label"], note)


if __name__ == "__main__":
    unittest.main()
