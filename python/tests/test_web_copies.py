"""Копии для веб-версии совпадают со своими источниками и не попадают на учебные ПК.

data/sources.js — копия data/sources.json для страницы (tools/web_data.py);
tests/vectors/nonce-reuse.json — эталонные значения из wifi.principles для JS-модели (tools/make_vectors.py).
"""

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "python"))
sys.path.insert(0, str(ROOT / "tools"))

import make_vectors  # noqa: E402
import web_data  # noqa: E402
from wifi.variants import make_student_copy  # noqa: E402


class WebCopiesTest(unittest.TestCase):
    def test_sources_js_matches_json(self):
        self.assertEqual(web_data.SOURCES_JS.read_text(encoding="utf-8"), web_data.build(),
                         "data/sources.js устарел: запустите py -3 tools/web_data.py")

    def test_vectors_match_python_model(self):
        self.assertEqual(make_vectors.VECTORS.read_text(encoding="utf-8"), make_vectors.build(),
                         "tests/vectors/nonce-reuse.json устарел: запустите py -3 tools/make_vectors.py")

    def test_vectors_cover_mission_numbers(self):
        # Сутки эфира миссии (20 000 сообщений при 2^24) и «половина шансов» для 365 и 2^24 — в векторах.
        text = make_vectors.build()
        for needle in ('"n": 20000', '"space": 365', '"space": 16777216'):
            self.assertIn(needle, text)

    def test_web_files_are_not_in_student_copy(self):
        with tempfile.TemporaryDirectory() as tmp:
            copied = make_student_copy(Path(tmp) / "lab")
        self.assertTrue(copied)
        self.assertEqual([p.name for p in copied if p.suffix not in (".py", ".json", ".bat", ".md", ".txt")], [])
        self.assertNotIn("sources.js", {p.name for p in copied})


if __name__ == "__main__":
    unittest.main()
