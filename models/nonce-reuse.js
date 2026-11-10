// Модель «Повтор одноразового числа» — учебный полигон миссии Р11-01.
//
// Что показывает: если два сообщения зашифрованы одной и той же гаммой (тот же ключ и то же
// одноразовое число), то по известному тексту одного читается другое. Ключ при этом не узнают.
// Чем это закончилось в настоящем Wi-Fi и как исправили — в разборе миссии (с источниками).
//
// Рамка 1 проекта. Модель работает только с форматом полигона: свои алфавиты, сообщения
// до 40 знаков, одноразовое число 0–99, ключ — до 12 букв полигона. Она не читает файлы, не
// принимает байты и форматы настоящих пакетов, не обращается к сети и к странице и не берёт
// ничего из общего окружения. Это проверяет тест models/tests/frame.test.js.
//
// Классический скрипт: на странице объявляет одно имя NonceReuse, в node --test отдаёт его
// через module.exports.
const NonceReuse = (function () {
  'use strict';

  // Алфавиты полигона. Пробел — тоже знак алфавита, чтобы сообщения читались как фразы.
  const ALPHABETS = Object.freeze({
    ru: 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ ',
    kk: 'АӘБВГҒДЕЁЖЗИЙКҚЛМНҢОӨПРСТУҰҮФХҺЦЧШЩЪЫІЬЭЮЯ ',
    en: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ '
  });
  const LIMITS = Object.freeze({ maxText: 40, ivSpace: 100, maxKey: 12, maxMessages: 100000 });

  // ---------- Проверки входа: только формат полигона ----------
  function alphabet(lang) {
    if (typeof lang !== 'string' || !Object.keys(ALPHABETS).includes(lang)) {
      throw new RangeError('Полигон знает только алфавиты ru, kk и en');
    }
    return ALPHABETS[lang];
  }
  function checkText(text, lang, what) {
    const name = what || 'Сообщение';
    if (typeof text !== 'string') throw new TypeError(name + ': нужна строка из букв полигона');
    if (text.length < 1 || text.length > LIMITS.maxText) {
      throw new RangeError(name + ': от 1 до ' + LIMITS.maxText + ' знаков, сейчас ' + text.length);
    }
    const abc = alphabet(lang);
    for (const ch of text) {
      if (!abc.includes(ch)) throw new RangeError(name + ': знак «' + ch + '» не из алфавита полигона');
    }
    return text;
  }
  function checkIv(iv) {
    if (!Number.isInteger(iv) || iv < 0 || iv >= LIMITS.ivSpace) {
      throw new RangeError('Одноразовое число полигона — целое от 0 до ' + (LIMITS.ivSpace - 1));
    }
    return iv;
  }
  // Ключ полигона — короткое слово из букв того же алфавита, без пробелов и цифр.
  function checkKey(key, lang) {
    if (typeof key !== 'string' || key.length < 1 || key.length > LIMITS.maxKey) {
      throw new RangeError('Ключ полигона — от 1 до ' + LIMITS.maxKey + ' букв');
    }
    const abc = alphabet(lang);
    for (const ch of key) {
      if (ch === ' ' || !abc.includes(ch)) throw new RangeError('Ключ полигона: знак «' + ch + '» не буква полигона');
    }
    return key;
  }
  function checkLetter(ch, lang) {
    if (typeof ch !== 'string' || ch.length !== 1) throw new TypeError('Нужна одна буква полигона');
    return checkText(ch, lang, 'Буква');
  }

  // ---------- Игрушечный генератор гаммы ----------
  // Нарочно простой: FNV-1a от «ключ|число» и xorshift32. Миссия не ломает генератор — она
  // показывает, что даже хороший генератор не спасает, если одноразовое число повторилось.
  function seedFrom(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h || 1;
  }
  function makeRandom(seed) {
    let x = (seed >>> 0) || 1;
    return function next() { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x >>> 0; };
  }

  // Гамма — свой сдвиг для каждой позиции сообщения (0 … размер алфавита − 1).
  function gamma(key, iv, length, lang) {
    checkKey(key, lang); checkIv(iv);
    if (!Number.isInteger(length) || length < 1 || length > LIMITS.maxText) {
      throw new RangeError('Длина гаммы — от 1 до ' + LIMITS.maxText);
    }
    const n = alphabet(lang).length, next = makeRandom(seedFrom(key + '|' + iv));
    return Array.from({ length }, () => next() % n);
  }

  function shiftLetter(ch, shift, lang) {
    checkLetter(ch, lang);
    if (!Number.isInteger(shift)) throw new TypeError('Сдвиг — целое число');
    const abc = alphabet(lang), n = abc.length;
    return abc[(((abc.indexOf(ch) + shift) % n) + n) % n];
  }
  // На сколько шагов вперёд по алфавиту от буквы from до буквы to.
  function shiftBetween(from, to, lang) {
    checkLetter(from, lang); checkLetter(to, lang);
    const abc = alphabet(lang), n = abc.length;
    return (abc.indexOf(to) - abc.indexOf(from) + n) % n;
  }

  // Шифрование: каждая буква сдвигается вперёд на свой шаг гаммы (сложение по модулю размера
  // алфавита — то же гаммирование, что XOR в настоящих шифрах). Расшифрование — назад.
  function encrypt(plain, key, iv, lang) {
    checkText(plain, lang, 'Сообщение');
    const g = gamma(key, iv, plain.length, lang);
    return Array.from(plain, (ch, i) => shiftLetter(ch, g[i], lang)).join('');
  }
  function decrypt(cipher, key, iv, lang) {
    checkText(cipher, lang, 'Шифровка');
    const g = gamma(key, iv, cipher.length, lang);
    return Array.from(cipher, (ch, i) => shiftLetter(ch, -g[i], lang)).join('');
  }

  // Ход на полигоне: две шифровки, известный текст первой. Где текст известен, шаг гаммы
  // восстанавливается (шифровка минус текст) и тем же шагом читается вторая шифровка.
  // Позиции дальше известного текста остаются неизвестными (null).
  // Работает, только если обе шифровки сделаны одной гаммой, иначе получается бессмыслица.
  function readWithKnown(cipherKnown, plainKnown, cipherOther, lang) {
    checkText(cipherKnown, lang, 'Первая шифровка');
    checkText(plainKnown, lang, 'Известный текст');
    checkText(cipherOther, lang, 'Вторая шифровка');
    if (cipherKnown.length !== plainKnown.length) throw new RangeError('Известный текст и первая шифровка — разной длины');
    return Array.from(cipherOther, (ch, i) => (i < plainKnown.length
      ? shiftLetter(ch, -shiftBetween(plainKnown[i], cipherKnown[i], lang), lang)
      : null));
  }

  // ---------- Журнал эфира для миссии ----------
  // Сообщения с одноразовыми числами 0–99; ровно одна пара с одинаковым числом: приветствие,
  // текст которого знают все, и секрет. Остальные числа разные. Всё зависит только от seed.
  function scenario(opts) {
    const o = opts || {};
    const lang = o.lang || 'ru';
    checkKey(o.key, lang);
    checkText(o.greeting, lang, 'Приветствие');
    checkText(o.secret, lang, 'Секрет');
    if (o.secret.length > o.greeting.length) throw new RangeError('Секрет должен быть не длиннее приветствия');
    if (!Array.isArray(o.filler) || o.filler.length < 4 || o.filler.length > 12) throw new RangeError('Шумовых сообщений — от 4 до 12');
    o.filler.forEach((t, i) => checkText(t, lang, 'Шумовое сообщение ' + (i + 1)));
    const next = makeRandom(Number.isInteger(o.seed) ? o.seed : 11);
    const count = o.filler.length + 2;
    const greetingAt = Number.isInteger(o.greetingAt) ? o.greetingAt : 3;   // номер в журнале, с 1
    if (greetingAt < 1 || greetingAt > count - 3) throw new RangeError('Приветствие — не ближе трёх строк к концу журнала');
    const secretAt = greetingAt + 3 + (next() % (count - greetingAt - 2));
    // Общее число пары выбираем так, чтобы первый шаг гаммы был от 3 до 15 вперёд: так его
    // удобно отсчитать по линейке алфавита, и в первой букве обоих сообщений не нужно
    // переходить через конец алфавита.
    const abc = alphabet(lang), n = abc.length;
    const g0 = abc.indexOf(o.greeting[0]), s0 = abc.indexOf(o.secret[0]);
    let shared = -1;
    for (let tries = 0; tries < 400 && shared < 0; tries++) {
      const iv = next() % LIMITS.ivSpace, s = gamma(o.key, iv, 1, lang)[0];
      if (s >= 3 && s <= 15 && g0 + s < n - 1 && s0 + s < n - 1) shared = iv;
    }
    if (shared < 0) throw new Error('Не нашлось удобного общего числа — смените ключ полигона');
    const used = new Set([shared]);
    const freshIv = () => { let iv; do { iv = next() % LIMITS.ivSpace; } while (used.has(iv)); used.add(iv); return iv; };
    const fill = o.filler.slice();
    const entries = [];
    for (let no = 1; no <= count; no++) {
      let role = 'other', plain, iv;
      if (no === greetingAt) { role = 'greeting'; plain = o.greeting; iv = shared; }
      else if (no === secretAt) { role = 'secret'; plain = o.secret; iv = shared; }
      else { plain = fill.shift(); iv = freshIv(); }
      entries.push({ no, iv, role, cipher: encrypt(plain, o.key, iv, lang) });
    }
    return {
      lang, entries, iv: shared, pair: [greetingAt, secretAt],
      greeting: o.greeting, secret: o.secret,
      firstShift: gamma(o.key, shared, 1, lang)[0]
    };
  }

  // ---------- Сторона защиты: правила для одноразового числа ----------
  // random100     — случайное от 0 до 99 (как в журнале миссии);
  // random24      — случайное из 2^24 = 16 777 216 (столько вариантов у 24-битного IV в WEP);
  // counter       — счётчик +1, новый ключ сеанса на каждом сеансе (так устроено в WPA2);
  // counterReset  — счётчик, который после переподключения начинается с нуля, а ключ сеанса прежний.
  const RULES = Object.freeze(['random100', 'random24', 'counter', 'counterReset']);

  function simulate(rule, opts) {
    if (!RULES.includes(rule)) throw new RangeError('Неизвестное правило: ' + rule);
    const o = opts || {};
    const messages = Number.isInteger(o.messages) ? o.messages : 20000;
    const session = Number.isInteger(o.sessionLength) ? o.sessionLength : 500;
    if (messages < 1 || messages > LIMITS.maxMessages) throw new RangeError('Сообщений — от 1 до ' + LIMITS.maxMessages);
    if (session < 1) throw new RangeError('Сеанс — хотя бы одно сообщение');
    const binCount = Number.isInteger(o.bins) ? o.bins : 100;   // для полоски «когда были повторы»
    if (binCount < 1 || binCount > 1000) throw new RangeError('Отрезков — от 1 до 1000');
    const bins = new Array(binCount).fill(0);
    const next = makeRandom(Number.isInteger(o.seed) ? o.seed : 2026);
    const seen = new Set();
    let repeats = 0, firstRepeat = null;
    for (let i = 0; i < messages; i++) {
      let id;
      if (rule === 'random100') id = next() % 100;
      else if (rule === 'random24') id = next() % 16777216;
      else if (rule === 'counter') id = Math.floor(i / session) + ':' + (i % session); // новый ключ — новый счёт
      else id = i % session;                                                      // ключ прежний
      if (seen.has(id)) {
        repeats++; bins[Math.floor(i * binCount / messages)]++;
        if (firstRepeat === null) firstRepeat = i + 1;
      } else seen.add(id);
    }
    return { rule, messages, sessionLength: session, repeats, firstRepeat, bins };
  }

  function checkCount(n, space) {
    if (!Number.isInteger(n) || n < 0 || n > LIMITS.maxMessages) throw new RangeError('n — от 0 до ' + LIMITS.maxMessages);
    if (!Number.isInteger(space) || space < 1 || space > 2 ** 32) throw new RangeError('Вариантов — от 1 до 2^32');
  }
  // Вероятность хотя бы одного повтора среди n случайных чисел из space вариантов
  // (парадокс дней рождения): 1 − (1 − 1/space)(1 − 2/space)…(1 − (n−1)/space).
  function chanceOfRepeat(n, space) {
    checkCount(n, space);
    if (n <= 1) return 0;
    if (n > space) return 1;
    let logNone = 0;
    for (let k = 1; k < n; k++) logNone += Math.log1p(-k / space);
    return -Math.expm1(logNone);
  }
  // Сколько повторов в среднем дают n случайных чисел из space вариантов: n минус ожидаемое
  // число разных значений, space · (1 − (1 − 1/space)^n). Нужно, чтобы честно подписать, что
  // стенд показывает один прогон.
  function expectedRepeats(n, space) {
    checkCount(n, space);
    return n + space * Math.expm1(n * Math.log1p(-1 / space));
  }
  // Сколько случайных чисел нужно, чтобы повтор стал вероятнее, чем его отсутствие.
  function halfChanceAt(space) {
    if (!Number.isInteger(space) || space < 2 || space > 2 ** 32) throw new RangeError('Вариантов — от 2 до 2^32');
    let logNone = 0, n = 1;
    while (-Math.expm1(logNone) < 0.5) { logNone += Math.log1p(-n / space); n++; }
    return n;
  }

  // Паспорт модели для теста рамок: на что модель и почему это допустимо (рамка 1).
  // targets — только из белого списка теста: протоколы, признанные устаревшими или исправленные.
  const ABOUT = Object.freeze({
    id: 'nonce-reuse',
    title: 'Повтор одноразового числа',
    principle: 'одна гамма на два сообщения: по известному тексту одного читается другое',
    weakness: 'WEP: 24-битный IV, правило выбора точно не задано (протокол признан устаревшим); WPA2: ошибка 2017 года, при которой злоумышленник навязывал повторную установку ключа и сброс номера пакета (исправлена обновлениями)',
    targets: Object.freeze(['WEP', 'WPA2-KRACK-2017']),
    fixed: true,
    sources: Object.freeze(['nist_800_97', 'ieee80211_2020', 'krack_2017', 'cert_vu228519', 'wfa_update_2017'])
  });

  return Object.freeze({
    ABOUT, ALPHABETS, LIMITS, RULES,
    alphabet, checkText, checkKey, gamma, shiftLetter, shiftBetween, encrypt, decrypt, readWithKnown,
    scenario, simulate, chanceOfRepeat, expectedRepeats, halfChanceAt
  });
}());

if (typeof module !== 'undefined' && module.exports) module.exports = NonceReuse;
