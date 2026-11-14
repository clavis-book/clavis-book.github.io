// QR-код для адреса страницы: преподаватель показывает его на экране, студенты открывают учебник с телефона.
//
// Небольшой генератор по стандарту ISO/IEC 18004, без сети: текст → байты UTF-8 → кодовые слова с кодом
// Рида — Соломона → матрица модулей. Только то, что нужно для ссылки: байтовый режим, уровень коррекции M
// (код читается, даже если испорчено около 15 %), версии 1–20 (до 666 байт). Тест tests/qr.test.js сравнивает
// наши матрицы с эталонными (tests/vectors/qr.json) модуль в модуль.
//
// Сокращённое переложение библиотеки QR Code generator проекта Nayuki
// (https://www.nayuki.io/page/qr-code-generator-library): формулы ёмкости, построение матрицы, код
// Рида — Соломона и штраф масок повторяют её. Её лицензия:
//
//   Copyright (c) Project Nayuki. (MIT License)
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
//   associated documentation files (the "Software"), to deal in the Software without restriction, including
//   without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
//   following conditions:
//   - The above copyright notice and this permission notice shall be included in all copies or substantial
//     portions of the Software.
//   - The Software is provided "as is", without warranty of any kind, express or implied, including but not
//     limited to the warranties of merchantability, fitness for a particular purpose and noninfringement. In no
//     event shall the authors or copyright holders be liable for any claim, damages or other liability, whether
//     in an action of contract, tort or otherwise, arising from, out of or in connection with the Software or
//     the use or other dealings in the Software.
//
// Классический скрипт: на странице объявляет одно имя QR, в node --test отдаёт его через module.exports.
const QR = (function () {
  'use strict';

  // Уровень M, версии 1–20: кодовых слов коррекции в блоке и число блоков (таблицы 9 стандарта).
  const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
  const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
  const MAX_VERSION = 20;
  const FORMAT_M = 0;                 // два бита уровня M в строке формата

  // Сколько модулей матрицы остаётся под данные и коррекцию (без узоров поиска, синхронизации и служебных полос).
  function rawModules(ver) {
    let n = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const align = Math.floor(ver / 7) + 2;
      n -= (25 * align - 10) * align - 55;
      if (ver >= 7) n -= 36;
    }
    return n;
  }
  const dataCodewords = ver => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * BLOCKS[ver];

  // ---------- Код Рида — Соломона над полем GF(256), многочлен 0x11D ----------
  function mul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function divisor(degree) {
    const r = new Array(degree).fill(0);
    r[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < r.length; j++) {
        r[j] = mul(r[j], root);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      root = mul(root, 0x02);
    }
    return r;
  }
  function remainder(data, div) {
    const r = div.map(() => 0);
    for (const b of data) {
      const factor = b ^ r.shift();
      r.push(0);
      div.forEach((c, i) => { r[i] ^= mul(c, factor); });
    }
    return r;
  }

  // ---------- Текст → кодовые слова ----------
  function utf8(text) {
    if (typeof text !== 'string') throw new TypeError('QR: нужен текст');
    return Array.from(new TextEncoder().encode(text));
  }
  function chooseVersion(len) {
    for (let v = 1; v <= MAX_VERSION; v++) {
      const bits = 4 + (v <= 9 ? 8 : 16) + 8 * len;
      if (bits <= dataCodewords(v) * 8) return v;
    }
    throw new RangeError('QR: текст длиннее ' + MAX_VERSION + '-й версии');
  }
  function codewords(bytes, ver) {
    const bits = [];
    const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(0b0100, 4);                                   // байтовый режим
    put(bytes.length, ver <= 9 ? 8 : 16);             // длина
    bytes.forEach(b => put(b, 8));
    const cap = dataCodewords(ver) * 8;
    put(0, Math.min(4, cap - bits.length));           // завершитель
    put(0, (8 - bits.length % 8) % 8);                // до целого байта
    for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const out = [];
    for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    return out;
  }
  // Делим данные на блоки, к каждому — коррекция, затем слова блоков чередуем.
  function interleave(data, ver) {
    const nBlocks = BLOCKS[ver], eccLen = ECC_PER_BLOCK[ver];
    const raw = Math.floor(rawModules(ver) / 8);
    const short = nBlocks - raw % nBlocks, shortLen = Math.floor(raw / nBlocks);
    const div = divisor(eccLen), blocks = [];
    for (let i = 0, k = 0; i < nBlocks; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < short ? 0 : 1));
      k += dat.length;
      const ecc = remainder(dat, div);
      if (i < short) dat.push(0);                     // выравниваем короткий блок, слово потом пропустим
      blocks.push(dat.concat(ecc));
    }
    const out = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= short) out.push(b[i]); });
    }
    return out;
  }

  // ---------- Матрица ----------
  function alignPositions(ver, size) {
    if (ver === 1) return [];
    const n = Math.floor(ver / 7) + 2;
    const step = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
    const out = [6];
    for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
    return out;
  }

  function build(bytes) {
    const ver = chooseVersion(bytes.length);
    const size = ver * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => { mod[y][x] = dark; fixed[y][x] = true; };

    // Полосы синхронизации, три узора поиска, узоры выравнивания.
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const pos = alignPositions(ver, size), last = pos.length - 1;
    pos.forEach((ay, i) => pos.forEach((ax, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));

    // Строка формата: уровень коррекции и номер маски, код БЧХ, две копии.
    const format = mask => {
      const data = (FORMAT_M << 3) | mask;
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((data << 10) | rem) ^ 0x5412;
      const bit = i => ((bits >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);                         // всегда тёмный модуль
    };
    format(0);
    // Номер версии (с 7-й): код Голея, две копии у верхнего правого и нижнего левого узоров.
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const bits = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) !== 0, a = size - 11 + i % 3, b = Math.floor(i / 3);
        set(a, b, dark); set(b, a, dark);
      }
    }

    // Данные — змейкой по парам столбцов снизу вверх и сверху вниз, мимо служебных модулей.
    const words = interleave(codewords(bytes, ver), ver);
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
        if (!fixed[y][x] && i < words.length * 8) { mod[y][x] = ((words[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
      }
    }

    // Маска: из восьми берём ту, после которой меньше всего «штрафа» (длинные полосы, квадраты 2×2,
    // ложные узоры поиска, перекос тёмного и светлого) — так код легче читается камерой.
    const MASKS = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
      (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
    const applyMask = m => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x];
    };
    let best = 0, bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m); format(m);
      const score = penalty(mod, size);
      if (score < bestScore) { best = m; bestScore = score; }
      applyMask(m);                                   // маска обратима: второй раз снимает её
    }
    applyMask(best); format(best);
    return { version: ver, mask: best, size, modules: mod };
  }

  // Штраф по правилам стандарта (раздел 7.8.3): N1 = 3, N2 = 3, N3 = 40, N4 = 10.
  function penalty(mod, size) {
    let score = 0;
    const addRun = (run, hist) => { if (hist[0] === 0) run += size; hist.pop(); hist.unshift(run); };
    const count = h => {
      const n = h[1], core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
      return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
    };
    const line = get => {
      let color = false, run = 0;
      const hist = [0, 0, 0, 0, 0, 0, 0];
      for (let k = 0; k < size; k++) {
        if (get(k) === color) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
        else { addRun(run, hist); if (!color) score += count(hist) * 40; color = get(k); run = 1; }
      }
      if (color) { addRun(run, hist); run = 0; }
      addRun(run + size, hist);
      score += count(hist) * 40;
    };
    for (let y = 0; y < size; y++) line(x => mod[y][x]);
    for (let x = 0; x < size; x++) line(y => mod[y][x]);
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const c = mod[y][x];
      if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) score += 3;
    }
    const dark = mod.reduce((s, row) => s + row.filter(Boolean).length, 0), total = size * size;
    score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return score;
  }

  return Object.freeze({ encode: text => build(utf8(text)), MAX_VERSION });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = QR;
