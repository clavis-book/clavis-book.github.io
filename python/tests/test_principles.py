"""Тесты модуля 2: вероятность совпадений, CRC-32 (сверка с zlib), HMAC-SHA256 (RFC 4231)."""

import hashlib
import hmac
import random
import re
import sys
import time
import unittest
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from wifi.common import SCREEN_WIDTH, load_sources
from wifi.principles import (
    _log_no_collision_direct,
    _log_no_collision_series,
    add_channel_noise,
    approx_probability,
    collision_probability,
    collision_probability_bits,
    count_for_probability,
    crc32_hex,
    crc32_manual,
    changed_position,
    format_experiment_table,
    hmac_sha256_hex,
    hmac_sha256_manual,
    integrity_experiment,
    load_principles,
)

# RFC 4231, раздел 4, HMAC-SHA-256. Значения извлечены скриптом из текста
# https://www.rfc-editor.org/rfc/rfc4231.txt (загружен 26.10.2026) и сверены с размерами,
# указанными в RFC. Длинные одинаковые ключи и данные записаны повтором: "aa" * 131 = 131 байт.
RFC4231_SHA256 = [
    # (кейс, ключ hex, данные hex, HMAC-SHA-256 hex)
    (1, "0b" * 20, "4869205468657265",
     "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"),
    (2, "4a656665", "7768617420646f2079612077616e7420666f72206e6f7468696e673f",
     "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"),
    (3, "aa" * 20, "dd" * 50,
     "773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe"),
    (4, "0102030405060708090a0b0c0d0e0f10111213141516171819", "cd" * 50,
     "82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b"),
    # Кейс 5 в RFC дан усечённым до 128 бит (32 hex-символа) — сравниваем начало.
    (5, "0c" * 20, "546573742057697468205472756e636174696f6e",
     "a3b6167473100ee06e0c796c2955552b"),
    (6, "aa" * 131,
     "54657374205573696e67204c6172676572205468616e20426c6f636b2d53697a65204b6579202d2048617368"
     "204b6579204669727374",
     "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54"),
    (7, "aa" * 131,
     "5468697320697320612074657374207573696e672061206c6172676572207468616e20626c6f636b2d73697a"
     "65206b657920616e642061206c6172676572207468616e20626c6f636b2d73697a6520646174612e20546865"
     "206b6579206e6565647320746f20626520686173686564206265666f7265206265696e672075736564206279"
     "20746865"
     "20484d414320616c676f726974686d2e",
     "9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2"),
]

FORBIDDEN_IN_PRINCIPLES = ["взлом", "атак", "перебор", "подбор", "поддел", "перехват", "инъекц",
                           "aircrack", "chopchop", "krack", "fms"]


class CollisionProbabilityTest(unittest.TestCase):
    def test_birthday_classic(self):
        self.assertAlmostEqual(collision_probability(23, 365), 0.5073, delta=0.0001)

    def test_edge_cases(self):
        self.assertEqual(collision_probability(0, 100), 0.0)
        self.assertEqual(collision_probability(1, 100), 0.0)
        self.assertEqual(collision_probability(101, 100), 1.0)
        self.assertEqual(collision_probability(2, 2), 0.5)
        with self.assertRaises(ValueError):
            collision_probability(-1, 100)

    def test_control_numbers(self):
        # Контрольные значения вероятности повтора.
        for bits, n, expected in [(24, 1000, 0.029), (24, 5000, 0.525),
                                  (24, 10000, 0.949), (32, 10000, 0.012)]:
            with self.subTest(bits=bits, n=n):
                self.assertAlmostEqual(collision_probability_bits(n, bits), expected, delta=0.0005)

    def test_grows_with_n(self):
        values = [collision_probability_bits(n, 16) for n in range(0, 1000, 7)]
        self.assertEqual(values, sorted(values))

    def test_always_in_unit_interval(self):
        for n, bits in [(10**9, 16), (10**9, 64), (10**9, 128), (3, 1), (5000, 24)]:
            with self.subTest(n=n, bits=bits):
                self.assertTrue(0.0 <= collision_probability_bits(n, bits) <= 1.0)

    def test_exact_vs_approx_close(self):
        n, space = 5000, 2**24
        self.assertLess(abs(collision_probability(n, space) - approx_probability(n, space)), 0.001)

    def test_series_matches_direct_sum(self):
        # Ряд используется при n > 10⁶; проверяем его там, где прямая сумма ещё быстрая.
        for n, space in [(10**5, 2**40), (10**5, 2**32), (3 * 10**5, 2**64)]:
            with self.subTest(n=n, space=space):
                direct = _log_no_collision_direct(n, space)
                series = _log_no_collision_series(n, space)
                self.assertAlmostEqual(direct, series, delta=abs(direct) * 1e-9 + 1e-15)

    def test_count_for_probability_exact(self):
        # Приближение дало бы 4824 и 77163 — тест ловит подмену точного поиска приближением.
        self.assertEqual(count_for_probability(0.5, 16), (302, False))
        self.assertEqual(count_for_probability(0.5, 24), (4823, False))
        self.assertEqual(count_for_probability(0.5, 32), (77164, False))

    def test_count_is_smallest(self):
        for p, bits in [(0.1, 16), (0.75, 20), (0.99, 24), (0.5, 1), (0.99, 2)]:
            with self.subTest(p=p, bits=bits):
                n, approx = count_for_probability(p, bits)
                self.assertFalse(approx)
                self.assertGreaterEqual(collision_probability_bits(n, bits), p)
                self.assertLess(collision_probability_bits(n - 1, bits), p)

    def test_count_tiny_spaces_brute_force(self):
        # Очень малые N: оценка n0/2 может оказаться больше N (так было при p = 0,999,
        # 1 бит падал на log1p(−1)). Сверка с перебором n = 1, 2, 3, … по точной формуле.
        for bits in range(1, 9):
            for p in (0.01, 0.1, 0.5, 0.9, 0.99, 0.999):
                with self.subTest(bits=bits, p=p):
                    expected = 1
                    while collision_probability_bits(expected, bits) < p:
                        expected += 1
                    self.assertEqual(count_for_probability(p, bits), (expected, False))

    def test_count_large_bits_is_marked_approximate(self):
        n, approx = count_for_probability(0.5, 64)
        self.assertTrue(approx)
        self.assertAlmostEqual(approx_probability(n, 2**64), 0.5, delta=0.001)

    def test_count_rejects_bad_probability(self):
        for p in (0, 1, -0.5, 1.5):
            with self.assertRaises(ValueError):
                count_for_probability(p, 24)

    def test_speed(self):
        # Критерий готовности 2.2: каждый расчёт быстрее 1 секунды.
        for func in (lambda: count_for_probability(0.99, 32),
                     lambda: collision_probability_bits(10**6, 24),
                     lambda: collision_probability_bits(10**9, 64)):
            start = time.perf_counter()
            func()
            self.assertLess(time.perf_counter() - start, 1.0)


class Crc32Test(unittest.TestCase):
    def test_check_value(self):
        # Стандартное контрольное значение CRC-32 для «123456789».
        self.assertEqual(crc32_manual(b"123456789"), 0xCBF43926)
        self.assertEqual(crc32_hex(b"123456789"), "CBF43926")

    def test_matches_zlib_on_samples(self):
        samples = [b"", b"a", b"123456789", "Беспроводная сеть".encode("utf-8"), bytes(range(256))]
        for data in samples:
            with self.subTest(data=data[:20]):
                self.assertEqual(crc32_manual(data), zlib.crc32(data) & 0xFFFFFFFF)

    def test_matches_zlib_on_random_strings(self):
        rng = random.Random(20261027)  # фиксированное зерно — тест повторяем
        for _ in range(1000):
            data = rng.randbytes(rng.randint(0, 2000))
            self.assertEqual(crc32_manual(data), zlib.crc32(data) & 0xFFFFFFFF)


class HmacSha256Test(unittest.TestCase):
    def test_rfc4231_vectors(self):
        for case, key_hex, data_hex, expected in RFC4231_SHA256:
            key, data = bytes.fromhex(key_hex), bytes.fromhex(data_hex)
            with self.subTest(case=case):
                self.assertTrue(hmac_sha256_manual(key, data).hex().startswith(expected))
                self.assertTrue(hmac_sha256_hex(key, data).startswith(expected))
                if case != 5:
                    self.assertEqual(len(expected), 64)
                    self.assertEqual(hmac_sha256_hex(key, data), expected)

    def test_rfc4231_sizes(self):
        # Размеры из текста RFC — защита от ошибки при переносе значений.
        sizes = {1: (20, 8), 2: (4, 28), 3: (20, 50), 4: (25, 50), 5: (20, 20), 6: (131, 54), 7: (131, 152)}
        for case, key_hex, data_hex, _ in RFC4231_SHA256:
            with self.subTest(case=case):
                self.assertEqual((len(key_hex) // 2, len(data_hex) // 2), sizes[case])

    def test_manual_matches_stdlib_on_random_pairs(self):
        rng = random.Random(4231)
        for i in range(200):
            # Каждая четвёртая пара — с ключом длиннее блока (64 байта).
            key_len = rng.randint(65, 300) if i % 4 == 0 else rng.randint(0, 64)
            key, msg = rng.randbytes(key_len), rng.randbytes(rng.randint(0, 500))
            self.assertEqual(hmac_sha256_manual(key, msg), hmac.new(key, msg, hashlib.sha256).digest())


class IntegrityExperimentTest(unittest.TestCase):
    def test_experiment_values(self):
        msg, key1, key2 = b"uchebnaya fraza", b"klyuch-odin", b"klyuch-dva"
        noisy = add_channel_noise(msg, position=3, new_value=ord("X"))
        rows = integrity_experiment(msg, key1, key2, noisy)
        crc, h1, h2 = rows
        # Значения опыта — те же, что дают стандартные модули; по ним студент выводит свойства.
        self.assertEqual((crc["original"], crc["noisy"]), (crc32_hex(msg), crc32_hex(noisy)))
        self.assertEqual((h1["original"], h1["noisy"]),
                         (hmac_sha256_hex(key1, msg), hmac_sha256_hex(key1, noisy)))
        self.assertEqual((h2["original"], h2["noisy"]),
                         (hmac_sha256_hex(key2, msg), hmac_sha256_hex(key2, noisy)))
        # Опыт содержателен: ошибку видно по обеим проверкам, смену ключа — по HMAC.
        self.assertNotEqual(crc["original"], crc["noisy"])
        self.assertNotEqual(h1["original"], h1["noisy"])
        self.assertNotEqual(h1["original"], h2["original"])

    def test_no_ready_answers(self):
        """Свойства и вывод — баллы рубрики (З3 таблица 4, вывод 6): в опыте их нет, только значения."""
        rows = integrity_experiment(b"uchebnaya fraza", b"k1", b"k2")
        self.assertTrue(all(sorted(row) == ["check", "noisy", "original"] for row in rows))
        text = format_experiment_table(rows)
        for answer in ("Замечена", "Без секрета", "Зависит от ключа"):
            self.assertNotIn(answer, text)
        # «да» и «нет» — только целыми словами: «да» есть внутри слова «Исходная».
        self.assertEqual(re.findall(r"\b(?:да|нет)\b", text), [])

    def test_changed_position(self):
        msg = b"uchebnaya fraza"
        self.assertEqual(changed_position(msg, add_channel_noise(msg, position=3, new_value=ord("X"))), 4)
        self.assertIsNone(changed_position(msg, msg))

    def test_noise_changes_exactly_one_byte(self):
        msg = b"uchebnaya fraza"
        for _ in range(50):
            noisy = add_channel_noise(msg)
            self.assertEqual(len(noisy), len(msg))
            self.assertEqual(sum(a != b for a, b in zip(msg, noisy)), 1)
        with self.assertRaises(ValueError):
            add_channel_noise(b"")
        with self.assertRaises(ValueError):
            add_channel_noise(b"abc", position=0, new_value=ord("a"))

    def test_table_fits_width(self):
        text = format_experiment_table(integrity_experiment(b"x" * 200, b"k1", b"k2"))
        self.assertTrue(all(len(line) <= SCREEN_WIDTH for line in text.splitlines()))


class PrinciplesDataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.principles = load_principles()
        cls.sources = load_sources()

    def test_four_principles(self):
        self.assertEqual([p["id"] for p in self.principles],
                         ["fresh_nonce", "keyed_integrity", "fresh_keys", "mutual_auth"])
        self.assertEqual([p["no"] for p in self.principles], [1, 2, 3, 4])

    def test_fields_filled(self):
        for p in self.principles:
            with self.subTest(principle=p["id"]):
                for field in ("title", "wep", "fixed", "why"):
                    self.assertTrue(p[field].strip())
                self.assertTrue(p["sources"])
                self.assertTrue(all(sid in self.sources for sid in p["sources"]))

    def test_tasks_linked(self):
        tasks = {p["id"]: p["task"] for p in self.principles}
        self.assertEqual(tasks["fresh_nonce"], "collision")
        self.assertEqual(tasks["keyed_integrity"], "crc_hmac")

    def test_no_attack_descriptions(self):
        # Рамки проекта: тексты принципов — без описаний атак.
        for p in self.principles:
            text = " ".join(p[f] for f in ("title", "wep", "fixed", "why")).lower()
            for word in FORBIDDEN_IN_PRINCIPLES:
                with self.subTest(principle=p["id"], word=word):
                    self.assertNotIn(word, text)


if __name__ == "__main__":
    unittest.main()
