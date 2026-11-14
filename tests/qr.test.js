// Генератор QR-кода (js/qr.js) против эталона: 13 текстов — латиница, кириллица, адреса, версии 1–12.
// Эталонные матрицы сняты с библиотеки QR Code generator проекта Nayuki (tests/vectors/qr.json).
// Запуск из корня репозитория: node --test tests/qr.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const QR = require('../js/qr.js');

const V = JSON.parse(fs.readFileSync(path.join(__dirname, 'vectors', 'qr.json'), 'utf8'));
const textOf = c => c.text ?? c.repeat[0].repeat(c.repeat[1]);
const hexRows = q => q.modules.map(row => {
  const bits = row.map(d => (d ? '1' : '0')).join('');
  const padded = bits + '0'.repeat((4 - bits.length % 4) % 4);
  return padded.match(/.{4}/g).map(b => parseInt(b, 2).toString(16)).join('');
});

test('QR: матрицы совпадают с эталоном модуль в модуль, версия и маска — тоже', () => {
  assert.equal(V.cases.length, 13);
  for (const c of V.cases) {
    const q = QR.encode(textOf(c));
    const label = textOf(c).slice(0, 30);
    assert.equal(q.version, c.version, label + ': версия');
    assert.equal(q.mask, c.mask, label + ': маска');
    assert.equal(q.size, c.version * 4 + 17, label + ': размер');
    assert.deepEqual(hexRows(q), c.rows, label + ': модули');
  }
});

test('QR: слишком длинный текст и не текст — понятная ошибка, а не испорченный код', () => {
  assert.throws(() => QR.encode('a'.repeat(700)), RangeError);
  assert.throws(() => QR.encode(42), TypeError);
  assert.equal(QR.encode('a'.repeat(666)).version, 20);
});
