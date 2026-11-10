"""Эталонные значения для JS-модели «Повтор одноразового числа» из Python-версии практикума.

JS-модель (models/nonce-reuse.js) считает вероятность повтора и число значений до «половины шансов»
по-своему. Тест models/tests/nonce-reuse.test.js сверяет её с этими значениями, которые даёт
проверенный код python/wifi/principles.py. Так расчёты сверяются уже сейчас, без второго ядра на JS.

    py -3 tools/make_vectors.py          — обновить tests/vectors/nonce-reuse.json
    py -3 tools/make_vectors.py --check  — только проверить, что файл совпадает с расчётом
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))

from wifi.principles import collision_probability, count_for_probability  # noqa: E402

VECTORS = ROOT / "tests" / "vectors" / "nonce-reuse.json"

# (n, число вариантов): малые и большие числа, граница n > N, сутки эфира миссии (20 000).
CHANCE_CASES = [
    (0, 100), (1, 100), (2, 100), (10, 100), (13, 100), (50, 100), (100, 100), (101, 100),
    (2, 1), (23, 365), (57, 365), (10, 2**8), (20, 2**8), (1000, 2**20),
    (4823, 2**24), (20000, 2**24), (500, 2**24), (77164, 2**32), (100000, 2**32),
]
HALF_BITS = [8, 16, 20, 24, 32]
HALF_SMALL = [2, 100, 365]


def half_by_search(space):
    """Наименьшее n, при котором вероятность повтора не меньше половины, — перебором (для малых N)."""
    n = 1
    while collision_probability(n, space) < 0.5:
        n += 1
    return n


def build():
    data = {
        "что": "эталонные значения из python/wifi/principles.py; создано tools/make_vectors.py, вручную не править",
        "chance": [{"n": n, "space": space, "p": collision_probability(n, space)} for n, space in CHANCE_CASES],
        "half": ([{"space": space, "n": half_by_search(space)} for space in HALF_SMALL]
                 + [{"space": 2**bits, "n": count_for_probability(0.5, bits)[0]} for bits in HALF_BITS]),
    }
    return json.dumps(data, ensure_ascii=False, indent=1) + "\n"


def main(argv):
    text = build()
    if "--check" in argv:
        same = VECTORS.is_file() and VECTORS.read_text(encoding="utf-8") == text
        print("tests/vectors/nonce-reuse.json совпадает с расчётом" if same else
              "tests/vectors/nonce-reuse.json устарел: запустите py -3 tools/make_vectors.py")
        return 0 if same else 1
    VECTORS.parent.mkdir(parents=True, exist_ok=True)
    VECTORS.write_text(text, encoding="utf-8", newline="\n")
    print("Записано: tests/vectors/nonce-reuse.json")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
