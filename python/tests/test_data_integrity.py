"""Общая проверка данных: все JSON читаются, все ссылки на источники существуют."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from wifi.common import DATA_DIR, PROJECT_DIR, load_json, load_sources
from wifi.variants import BANK_FILE_NAME, QUESTIONS_PATH, TEACHER_DATA_DIR

LECTURE_IDS = ["lecture_14_15_wlan", "lecture_14_15_ap", "lecture_14_15_transfer", "lecture_14_15_site"]


def collect_source_ids(node, path="", found=None):
    """Все id из списков "sources" на любой глубине JSON: [(где, id), ...].

    Обход рекурсивный, чтобы тест не пришлось менять, когда появятся principles.json,
    audit_rules.json и questions.json со своей структурой.
    """
    if found is None:
        found = []
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "sources" and isinstance(value, list):
                found.extend((path, sid) for sid in value)
            else:
                collect_source_ids(value, f"{path}/{key}", found)
    elif isinstance(node, list):
        for i, item in enumerate(node):
            label = item.get("id", i) if isinstance(item, dict) else i
            collect_source_ids(item, f"{path}[{label}]", found)
    return found


class DataIntegrityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources = load_sources()
        # teacher_data/ — демо-банк вопросов с ответами: он тоже ссылается на источники.
        cls.data_files = sorted(DATA_DIR.glob("*.json")) + sorted(TEACHER_DATA_DIR.glob("*.json"))

    def test_student_data_has_no_answers(self):
        # data/ уходит на учебные ПК — ответов там быть не должно.
        for path in sorted(DATA_DIR.glob("*.json")):
            with self.subTest(file=path.name):
                self.assertNotIn('"answer"', path.read_text(encoding="utf-8-sig"))
        self.assertTrue(QUESTIONS_PATH.exists())

    def test_no_closed_bank_in_project(self):
        # Закрытый банк с ответами — только в папке преподавателя: в проекте его копировали бы
        # в репозиторий. Здесь — только демо-банк.
        self.assertFalse((TEACHER_DATA_DIR / BANK_FILE_NAME).exists())
        self.assertFalse((DATA_DIR / BANK_FILE_NAME).exists())

    def test_all_json_files_load(self):
        self.assertTrue(self.data_files)
        for path in self.data_files:
            with self.subTest(file=path.name):
                load_json(path)

    def test_every_source_reference_exists(self):
        for path in self.data_files:
            if path.name == "sources.json":
                continue
            for where, sid in collect_source_ids(load_json(path)):
                with self.subTest(file=path.name, where=where):
                    self.assertIn(sid, self.sources)

    def test_source_records_are_complete(self):
        for sid, source in self.sources.items():
            with self.subTest(source=sid):
                for field in ("label", "title", "section"):
                    self.assertTrue(source.get(field), f"нет поля {field}")
                self.assertIsInstance(source.get("primary"), bool)
                self.assertIsInstance(source.get("verified"), bool)
                if source.get("kind") == "lecture":
                    self.assertTrue(source.get("file", "").endswith(".docx"))
                else:
                    self.assertTrue(source.get("url", "").startswith("https://"))

    def test_unverified_sources_explain_what_to_check(self):
        # verified: false — это пометка [проверить]; без пояснения её не снять.
        for sid, source in self.sources.items():
            if not source["verified"]:
                with self.subTest(source=sid):
                    self.assertIn("[проверить]", source.get("note", ""))

    def test_lecture_sources_exist(self):
        for sid in LECTURE_IDS:
            self.assertIn(sid, self.sources)

    def test_wikipedia_is_only_secondary(self):
        for sid, source in self.sources.items():
            if "wikipedia.org" in source.get("url", ""):
                with self.subTest(source=sid):
                    self.assertFalse(source["primary"])

    def test_bat_files_are_ascii_with_crlf(self):
        # cmd с переводами строк LF разбирает bat-файл неверно,
        # а кириллицу читает в системной кодировке до chcp.
        for path in sorted(PROJECT_DIR.glob("*.bat")):
            with self.subTest(file=path.name):
                raw = path.read_bytes()
                self.assertTrue(raw.isascii())
                self.assertEqual(raw.count(b"\n"), raw.count(b"\r\n"))

    def test_collect_source_ids_walks_nested_data(self):
        data = [{"id": "a", "sources": ["x"], "options": [{"sources": ["y"]}]}]
        self.assertEqual([sid for _, sid in collect_source_ids(data)], ["x", "y"])


if __name__ == "__main__":
    unittest.main()
