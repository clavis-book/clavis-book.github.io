// Правильность модели «Повтор одноразового числа».
// Запуск из корня репозитория: node --test models/tests/nonce-reuse.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const M = require(path.join(__dirname, '..', 'nonce-reuse.js'));
// Эталонные значения из Python-версии практикума (python/wifi/principles.py), их пишет tools/make_vectors.py.
// Модель сверяется с ними: расчёты на JavaScript должны совпадать с консольной версией.
const VECTORS = JSON.parse(require('node:fs').readFileSync(path.join(__dirname, '..', '..', 'tests', 'vectors', 'nonce-reuse.json'), 'utf8'));

const BYURO = {
  lang: 'ru', key: 'ЛЕВЫЙБЕРЕГ', seed: 7, greetingAt: 3,
  greeting: 'ДОБРОЕ УТРО ГОВОРИТ РАЦИЯ НАШЕГО БЮРО',
  secret: 'ТОРТ ДЛЯ САУЛЕ В ШКАФУ ТОЛЬКО ТИХО',
  filler: ['ЧАЙ ЗАКОНЧИЛСЯ', 'КОТ СНОВА НА СЕРВЕРЕ', 'ОТЧЁТ К ПЯТНИЦЕ', 'КТО ВЗЯЛ МОЙ СТЕПЛЕР',
    'ДОЖДЬ НАД ЕСИЛЕМ', 'ПРИНТЕР ЖУЁТ БУМАГУ', 'ВСТРЕЧА В ДВА', 'ОБЕД ПЕРЕНОСИТСЯ']
};

test('шифрование и расшифрование обратны друг другу во всех алфавитах', () => {
  const samples = { ru: 'СЪЕШЬ ЖЕ ЕЩЁ ЭТИХ МЯГКИХ БУЛОК', kk: 'ӘРІПТЕР ҒАЖАЙЫП ҚҰЛЫП ҮЙ ҺӨҢ', en: 'THE QUICK BROWN FOX' };
  const keys = { ru: 'КЛЮЧ', kk: 'ҚҰЛЫП', en: 'KEY' };
  for (const [lang, text] of Object.entries(samples)) {
    for (let iv = 0; iv < 100; iv += 7) {
      const c = M.encrypt(text, keys[lang], iv, lang);
      assert.equal(c.length, text.length);
      assert.equal(M.decrypt(c, keys[lang], iv, lang), text, lang + ' iv ' + iv);
    }
  }
});

test('ключ полигона — слово из букв того же алфавита, до 12 букв', () => {
  for (const [key, lang] of [['ЛЕВЫЙБЕРЕГ', 'ru'], ['МЕДНЫЙЗАМОК', 'ru'], ['ТЯНЬШАНЬ', 'ru'], ['ҚҰЛЫП', 'kk'], ['KEY', 'en']]) {
    assert.equal(M.checkKey(key, lang), key);
  }
  for (const [key, lang] of [['KEY', 'ru'], ['КЛЮЧ', 'en'], ['ЛЕВЫЙ БЕРЕГ', 'ru'], ['ключ', 'ru'], ['КЛЮЧ1', 'ru'], ['К'.repeat(13), 'ru']]) {
    assert.throws(() => M.checkKey(key, lang), RangeError, key + ' (' + lang + ')');
  }
});

test('одна и та же пара «ключ + число» даёт одну и ту же гамму, другое число — другую', () => {
  assert.deepEqual(M.gamma('К', 5, 20, 'ru'), M.gamma('К', 5, 20, 'ru'));
  let differ = 0;
  for (let iv = 0; iv < 99; iv++) if (M.gamma('К', iv, 20, 'ru').join() !== M.gamma('К', iv + 1, 20, 'ru').join()) differ++;
  assert.equal(differ, 99);
});

test('сдвиги: буква, шаг вперёд и назад, переход через конец алфавита', () => {
  assert.equal(M.shiftLetter('А', 3, 'ru'), 'Г');
  assert.equal(M.shiftLetter('Г', -3, 'ru'), 'А');
  assert.equal(M.shiftLetter(' ', 1, 'ru'), 'А');           // пробел — последний знак алфавита
  assert.equal(M.shiftBetween('Д', 'К', 'ru'), 7);              // в алфавите есть Ё
  assert.equal(M.shiftBetween('К', 'Д', 'ru'), 34 - 7);
  assert.equal(M.ALPHABETS.ru.length, 34);
  assert.equal(M.ALPHABETS.kk.length, 43);
  assert.equal(M.ALPHABETS.en.length, 27);
  for (const abc of Object.values(M.ALPHABETS)) assert.equal(new Set(abc).size, abc.length, 'буквы не повторяются');
});

test('журнал эфира: ровно одна пара с одинаковым числом — приветствие и секрет', () => {
  const sc = M.scenario(BYURO);
  assert.equal(sc.entries.length, 10);
  const ivs = sc.entries.map(e => e.iv);
  assert.equal(new Set(ivs).size, 9, 'ровно один повтор');
  const [g, s] = sc.pair.map(no => sc.entries[no - 1]);
  assert.equal(g.role, 'greeting'); assert.equal(s.role, 'secret');
  assert.equal(g.iv, s.iv); assert.equal(g.no, 3);
  assert.ok(s.no - g.no >= 3, 'пара не стоит рядом');
  assert.ok(sc.firstShift >= 3 && sc.firstShift <= 15);
  assert.deepEqual(M.scenario(BYURO), sc, 'журнал зависит только от seed');
});

test('ход на полигоне: по известному приветствию читается секрет — только при общем числе', () => {
  const sc = M.scenario(BYURO);
  const [g, s] = sc.pair.map(no => sc.entries[no - 1]);
  assert.equal(M.readWithKnown(g.cipher, sc.greeting, s.cipher, 'ru').join(''), sc.secret);
  // С любым другим сообщением журнала (другое число) выходит бессмыслица.
  for (const other of sc.entries.filter(e => e.role === 'other')) {
    const len = Math.min(other.cipher.length, sc.greeting.length);
    const guess = M.readWithKnown(g.cipher.slice(0, len), sc.greeting.slice(0, len), other.cipher.slice(0, len), 'ru').join('');
    assert.notEqual(guess, sc.secret.slice(0, len));
  }
  // Известна только часть приветствия — читается только часть секрета.
  const part = M.readWithKnown(g.cipher.slice(0, 6), sc.greeting.slice(0, 6), s.cipher, 'ru');
  assert.equal(part.slice(0, 6).join(''), sc.secret.slice(0, 6));
  assert.ok(part.slice(6).every(x => x === null));
});

test('первый шаг гаммы совпадает в обоих сообщениях пары и считается по буквам', () => {
  const sc = M.scenario(BYURO);
  const [g, s] = sc.pair.map(no => sc.entries[no - 1]);
  assert.equal(M.shiftBetween(sc.greeting[0], g.cipher[0], 'ru'), sc.firstShift);
  assert.equal(M.shiftBetween(sc.secret[0], s.cipher[0], 'ru'), sc.firstShift);
});

test('сторона защиты: повторы есть у случайных правил и у сброса счётчика, нет у счётчика с новым ключом', () => {
  const r = Object.fromEntries(M.RULES.map(rule => [rule, M.simulate(rule)]));
  assert.equal(r.random100.repeats, 20000 - 100);
  assert.ok(r.random24.repeats > 0 && r.random24.repeats < 40, 'около n²/2N ≈ 12 повторов');
  assert.equal(r.counter.repeats, 0);
  assert.equal(r.counter.firstRepeat, null);
  assert.equal(r.counterReset.repeats, 20000 - 500);
  assert.equal(r.counterReset.firstRepeat, 501, 'первый повтор — сразу после переподключения');
  assert.deepEqual(M.simulate('random24'), r.random24, 'результат зависит только от seed');
});

test('вероятность повтора и «половина шансов» совпадают с эталоном из Python (wifi.principles)', () => {
  assert.ok(VECTORS.chance.length >= 15 && VECTORS.half.length >= 6, 'эталонов слишком мало');
  for (const { n, space, p } of VECTORS.chance) {
    assert.ok(Math.abs(M.chanceOfRepeat(n, space) - p) < 1e-12, n + ' из ' + space + ': ' + M.chanceOfRepeat(n, space) + ' ≠ ' + p);
  }
  for (const { space, n } of VECTORS.half) assert.equal(M.halfChanceAt(space), n, 'половина шансов при ' + space);
  assert.equal(M.halfChanceAt(365), 23);                   // классический парадокс дней рождения
  assert.equal(M.halfChanceAt(2 ** 24), 4823);             // «около 2^12 кадров» у NIST SP 800-97 §3.2.2
  assert.ok(M.halfChanceAt(2 ** 24) < 2 ** 13);
  // При ровно 2^12 = 4096 сообщениях вероятность ещё меньше половины (около 39 %): 2^12 — оценка порядка.
  assert.ok(Math.abs(M.chanceOfRepeat(4096, 2 ** 24) - 0.39) < 0.01);
});

test('стенд показывает один прогон: в среднем повторов столько, сколько даёт формула', () => {
  const e24 = M.expectedRepeats(20000, 2 ** 24);
  assert.ok(e24 > 11.9 && e24 < 12, 'около n²/2N ≈ 11,9');
  assert.ok(Math.abs(M.expectedRepeats(20000, 100) - 19900) < 1e-6, 'все числа заняты почти сразу');
  assert.equal(M.expectedRepeats(1, 100), 0);
  let sum = 0;
  for (let seed = 1; seed <= 40; seed++) sum += M.simulate('random24', { seed }).repeats;
  assert.ok(Math.abs(sum / 40 - e24) < 2.5, 'среднее по 40 прогонам ' + sum / 40);
});
