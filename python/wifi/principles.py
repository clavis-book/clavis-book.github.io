"""Модуль 2: принципы безопасного протокола и расчётные задания.

Задание «Повтор одноразовых значений» — вероятность совпадения (парадокс дней рождения).
Задание «CRC-32 и HMAC-SHA256» — сравнение свойств на своих данных.
В модуле нет функций, которые подгоняют данные под заданную CRC, ищут повторы в чужих
данных или что-то восстанавливают: только расчёт и сравнение свойств.
"""

import hashlib
import hmac
import math
import secrets
import zlib

from wifi.common import DATA_DIR, SCREEN_WIDTH, format_table, load_json

PRINCIPLES_PATH = DATA_DIR / "principles.json"

# До этого n произведение считается напрямую: 10**6 слагаемых — около 0,1 с.
DIRECT_LIMIT = 10**6
# Если n/N не больше этого, ряд из трёх членов (см. _log_no_collision_series) ошибается
# примерно на 10⁻¹⁰ от результата; если больше и n > DIRECT_LIMIT — совпадение почти наверняка.
SERIES_MAX_RATIO = 1e-3

CRC32_POLY_REFLECTED = 0xEDB88320
SHA256_BLOCK_SIZE = 64


# ---------- Задание «Повтор одноразовых значений» ----------

def _log_no_collision_direct(n, space):
    """ln ∏(1 − k/N) для k = 1..n−1 — сумма log1p(−k/N), прямо по определению.

    log1p и сумма логарифмов вместо произведения: произведение тысяч чисел чуть меньше
    единицы теряет точность, а сумма логарифмов — нет.
    """
    return math.fsum(math.log1p(-k / space) for k in range(1, n))


def _log_no_collision_series(n, space):
    """То же через ряд ln(1 − x) = −x − x²/2 − x³/3 − … при малом x = k/N.

    Суммы степеней известны точно: Σk = n(n−1)/2, Σk² = (n−1)n(2n−1)/6, Σk³ = (Σk)².
    При n/N ≤ 10⁻³ отброшенные члены (x⁴/4 и дальше) меняют результат примерно на
    (n/N)³/10 ≈ 10⁻¹⁰ от его величины — на три знака после запятой это не влияет.
    Работает мгновенно даже для n = 10⁹.
    """
    s1 = n * (n - 1) // 2
    s2 = (n - 1) * n * (2 * n - 1) // 6
    s3 = s1 * s1
    return -(s1 / space + s2 / (2 * space**2) + s3 / (3 * space**3))


def collision_probability(n, space):
    """Вероятность хотя бы одного совпадения среди n случайных значений из space равновероятных.

    Точная формула: P = 1 − ∏(1 − k/N), k = 1..n−1. Результат — в [0; 1].
    """
    if n < 0 or space < 1:
        raise ValueError("Нужно n ≥ 0 и N ≥ 1")
    if n <= 1:
        return 0.0
    if n > space:
        return 1.0  # значений больше, чем вариантов: совпадение обязательно
    if n <= DIRECT_LIMIT:
        log_none = _log_no_collision_direct(n, space)
    elif n / space <= SERIES_MAX_RATIO:
        log_none = _log_no_collision_series(n, space)
    else:
        # n > 10⁶ и n/N > 10⁻³: ln(1 − P) < −n²/(2N) < −500, то есть P = 1 в пределах double.
        return 1.0
    # −expm1(x) = 1 − eˣ без потери точности при малой вероятности.
    return -math.expm1(log_none)


def collision_probability_bits(n, bits):
    """То же для значений длиной bits бит (N = 2^bits)."""
    return collision_probability(n, 2**bits)


def approx_probability(n, space):
    """Приближение 1 − exp(−n(n−1)/(2N)) — для сравнения и для расчёта в Excel."""
    return -math.expm1(-n * (n - 1) / (2 * space))


def count_for_probability(p, bits):
    """Наименьшее n, при котором точная вероятность совпадения ≥ p. Возвращает (n, приближённо?).

    Сначала оценка n0 = ⌈√(2N·ln(1/(1−p)))⌉. Она выведена из n² вместо n(n−1), поэтому
    точный ответ отличается от неё на единицы — бывает и чуть больше (32 бита, p = 0,5:
    n0 = 77 163, точно 77 164). Но он намного больше n0/2, поэтому ищем от n0/2 вверх,
    добавляя к сумме по одному слагаемому log1p(−k/N), без пересчёта всего произведения.
    При n0 > 10⁶ точный поиск слишком долгий — возвращаем n0 с признаком «приближённо».
    """
    if not 0 < p < 1:
        raise ValueError("Вероятность должна быть строго между 0 и 1")
    space = 2**bits
    n0 = math.ceil(math.sqrt(2 * space * math.log(1 / (1 - p))))
    if n0 > DIRECT_LIMIT:
        return n0, True

    target = math.log1p(-p)  # условие P(n) ≥ p равносильно ln(1 − P(n)) ≤ ln(1 − p)
    # Не больше N: для n > N сумма дошла бы до log1p(−1), а это ошибка, а не −∞.
    start = min(max(1, n0 // 2), space)
    log_none = _log_no_collision_direct(start, space)
    if log_none <= target:
        # При очень малых N уже n0/2 может дать вероятность ≥ p — тогда ищем с самого начала.
        start, log_none = 1, 0.0

    n = start
    while log_none > target:
        if n >= space:
            # Значений уже N, следующее обязательно совпадёт. Считать дальше нельзя:
            # math.log1p(-1) не даёт −∞, а выбрасывает ошибку.
            return n + 1, False
        log_none += math.log1p(-n / space)  # переход от P(n) к P(n + 1)
        n += 1
    return n, False


# ---------- Задание «CRC-32 и HMAC-SHA256» ----------

def crc32_manual(data):
    """CRC-32 (IEEE 802.3) своей реализацией — для понимания, как она устроена.

    Деление многочленов по модулю 2, побитно, младший бит первым: поэтому полином
    0x04C11DB7 записан в отражённой форме 0xEDB88320. Начальное значение 0xFFFFFFFF
    и финальный XOR — часть стандарта: без них CRC не замечала бы нулевые байты в начале.
    """
    crc = 0xFFFFFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ CRC32_POLY_REFLECTED
            else:
                crc >>= 1
    return crc ^ 0xFFFFFFFF


def crc32_hex(data):
    """CRC-32 в виде 8 hex-символов (рабочая версия через zlib)."""
    return f"{zlib.crc32(data) & 0xFFFFFFFF:08X}"


def hmac_sha256_manual(key, msg):
    """HMAC-SHA256 по RFC 2104 своей реализацией: H((K ⊕ opad) ‖ H((K ⊕ ipad) ‖ msg)).

    Ключ длиннее блока SHA-256 (64 байта) сначала хешируется, короче — дополняется нулями.
    Два хеширования с разными масками нужны, чтобы результат нельзя было продолжить,
    дописав данные к сообщению: внешний хеш «запечатывает» внутренний.
    """
    if len(key) > SHA256_BLOCK_SIZE:
        key = hashlib.sha256(key).digest()
    key = key.ljust(SHA256_BLOCK_SIZE, b"\x00")
    inner_key = bytes(b ^ 0x36 for b in key)  # ipad
    outer_key = bytes(b ^ 0x5C for b in key)  # opad
    inner = hashlib.sha256(inner_key + msg).digest()
    return hashlib.sha256(outer_key + inner).digest()


def hmac_sha256_hex(key, msg):
    """HMAC-SHA256 в hex (рабочая версия через модуль hmac)."""
    return hmac.new(key, msg, hashlib.sha256).hexdigest()


def add_channel_noise(msg, position=None, new_value=None):
    """Случайная ошибка передачи: один байт сообщения заменён другим, как помеха в канале.

    Без аргументов позиция и новое значение выбираются случайно (модуль secrets);
    тесты передают их явно, чтобы результат был повторяемым.
    """
    if not msg:
        raise ValueError("Сообщение не должно быть пустым")
    if position is None:
        position = secrets.randbelow(len(msg))
    old = msg[position]
    if new_value is None:
        new_value = (old + 1 + secrets.randbelow(255)) % 256  # всегда не равно старому
    if new_value == old:
        raise ValueError("Новое значение байта должно отличаться от старого")
    return msg[:position] + bytes([new_value]) + msg[position + 1:]


def changed_position(msg, noisy):
    """Номер (с 1) первого байта, которым noisy отличается от msg; None, если они равны."""
    for i, (a, b) in enumerate(zip(msg, noisy), start=1):
        if a != b:
            return i
    return None


def integrity_experiment(msg, key1, key2, noisy=None):
    """Результаты опыта для задания 3: значения CRC-32 и HMAC-SHA256, без выводов.

    Строки: CRC-32 (вход — только сообщение), HMAC с key1, HMAC с key2. Для каждой — значение
    для исходного сообщения и для сообщения со случайной ошибкой передачи (noisy; если не задано —
    add_channel_noise). Замечает ли проверка ошибку, нужен ли ключ, зависит ли значение от ключа —
    студент выводит сам по этим числам: за таблицу свойств и вывод даются баллы по рубрике, и
    готовые ответы программа не печатает (журнал плана, версия 7).
    """
    if noisy is None:
        noisy = add_channel_noise(msg)
    return [
        {"check": "CRC-32 (только фраза)", "original": crc32_hex(msg), "noisy": crc32_hex(noisy)},
        {"check": "HMAC-SHA256, ключ 1", "original": hmac_sha256_hex(key1, msg),
         "noisy": hmac_sha256_hex(key1, noisy)},
        {"check": "HMAC-SHA256, ключ 2", "original": hmac_sha256_hex(key2, msg),
         "noisy": hmac_sha256_hex(key2, noisy)},
    ]


def format_experiment_table(rows, width=SCREEN_WIDTH):
    """Таблица опыта для консоли. HMAC сокращён до первых 16 hex-символов, как в задании."""
    short = []
    for row in rows:
        shown = dict(row)
        for field in ("original", "noisy"):
            if len(shown[field]) > 16:
                shown[field] = shown[field][:16] + "…"
        short.append(shown)
    columns = [
        ("check", "Проверка"),
        ("original", "Исходная фраза"),
        ("noisy", "С ошибкой передачи"),
    ]
    return format_table(short, columns, width)


# ---------- Принципы ----------

def load_principles(path=PRINCIPLES_PATH):
    """Четыре принципа «как было в WEP — как стало — почему важно»."""
    return load_json(path)
