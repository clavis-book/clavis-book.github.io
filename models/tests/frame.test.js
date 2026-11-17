// Тест рамок для игровых моделей атак (рамка 1 проекта).
// Запуск из корня репозитория: node --test models/tests/frame.test.js
//
// Что проверяется для каждой модели в папке models/:
//  1. модель ничего не берёт из окружения: по всему исходнику (вместе с комментариями) нет
//     глобального объекта, сети, файлов, страницы, хранилищ, выполнения строк как кода и байтов,
//     нет обращений по строке в скобках и escape-последовательностей — так не обойти проверку
//     склейкой имён вроде root['fe' + 'tch'];
//  2. в отдельном окружении, где выполнение строк как кода запрещено, а сетевые функции —
//     ловушки, вызываются все функции модели на примерах полигона; ни одна ловушка не срабатывает;
//  3. модель работает только с форматом полигона и отвергает всё остальное (байты, длинные
//     строки, чужие знаки, похожие на адреса и пароли строки, неверные числа и ключи);
//  4. у модели есть паспорт: цели — только из белого списка признанных устаревшими или
//     исправленных протоколов, источники есть и сверены, у модели есть миссия с разбором;
//  5. тексты полигона во всех мирах — только буквы полигона, без адресов, названий настоящих
//     программ для атак и форматов пакетов (с учётом похожих кириллических букв и \u-записи).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MODELS = path.join(__dirname, '..');
const ROOT = path.join(MODELS, '..');
const modelFiles = fs.readdirSync(MODELS).filter(f => f.endsWith('.js')).sort();
const read = f => fs.readFileSync(f, 'utf8');

// Цели моделей по исключению из рамки 1. Новую цель добавляет автор проекта после отдельной проверки по рамке 1.
const ALLOWED_TARGETS = ['WEP', 'WPA2-KRACK-2017'];

// ---------- 1. Исходник модели: ничего из окружения ----------
// Ищем целые слова по всему тексту файла, включая комментарии: в пояснениях эти слова тоже не
// нужны, а вырезание комментариев само можно обмануть.
const FORBIDDEN_IDENTIFIERS = [
  // глобальный объект и обходы через него
  'self', 'this', 'globalThis', 'global', 'window', 'frames', 'parent', 'top', 'opener', 'document', 'location',
  'navigator', 'Reflect', 'Proxy', 'constructor', 'prototype', '__proto__', '__defineGetter__', '__lookupGetter__',
  // выполнение строк как кода и загрузка кода
  'eval', 'Function', 'setTimeout', 'setInterval', 'setImmediate', 'import', 'require', 'importScripts', 'Worker',
  'SharedWorker', 'WebAssembly',
  // сеть
  'fetch', 'XMLHttpRequest', 'WebSocket', 'WebTransport', 'EventSource', 'sendBeacon', 'RTCPeerConnection', 'Image',
  'Audio', 'postMessage', 'BroadcastChannel', 'MessageChannel', 'Request', 'Response', 'Headers', 'URL', 'caches',
  // файлы и хранилища
  'FileReader', 'File', 'Blob', 'showOpenFilePicker', 'showSaveFilePicker', 'localStorage', 'sessionStorage',
  'indexedDB', 'cookie',
  // система и байты
  'process', 'Buffer', 'Deno', 'Bun', 'ArrayBuffer', 'SharedArrayBuffer', 'DataView', 'Uint8Array', 'Uint8ClampedArray',
  'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array', 'Int32Array', 'Float32Array', 'Float64Array',
  'BigInt64Array', 'BigUint64Array', 'TextEncoder', 'TextDecoder', 'atob', 'btoa', 'parseInt'
];
const word = w => new RegExp('(?<![\\w$])' + w.replace(/\$/g, '\\$') + '(?![\\w$])');

test('в папке models — только модели .js и папка tests', () => {
  const extra = fs.readdirSync(MODELS, { withFileTypes: true })
    .filter(d => (d.isDirectory() ? d.name !== 'tests' : !d.name.endsWith('.js'))).map(d => d.name);
  assert.deepEqual(extra, [], 'посторонние файлы (.mjs, .json, .wasm и др.) в models/');
  assert.ok(modelFiles.length >= 1, 'нет ни одной модели');
});

for (const name of modelFiles) {
  const file = path.join(MODELS, name);

  test(name + ': исходник ничего не берёт из окружения', () => {
    const src = read(file);
    const found = FORBIDDEN_IDENTIFIERS.filter(w => word(w).test(src));
    // Обращение к свойству по строке: x['…'], f()['…'], a[0]['…'] (список ['a', 'b'] — не обращение).
    if (/[\w$)\]]\s*\[\s*['"`]/.test(src)) found.push("обращение по строке в скобках ['…']");
    if (/\\u[0-9a-fA-F{]|\\x[0-9a-fA-F]/.test(src)) found.push('escape-последовательности \\u или \\x');
    assert.deepEqual(found, []);
  });

  test(name + ': в исходнике нет адресов и внешних ссылок', () => {
    const problems = addressProblems(read(file));
    if (/https?:\/\//.test(read(file))) problems.push('ссылка');
    assert.deepEqual(problems, []);
  });
}

// ---------- 2. Работа в отдельном окружении ----------
// Выполнение строк как кода в этом окружении запрещено (как CSP без 'unsafe-eval' на странице);
// сетевые функции — ловушки, которые записывают обращения.
function loadIsolated(file) {
  const touched = [];
  const trap = nm => function () { touched.push(nm); throw new Error('обращение к ' + nm); };
  const sandbox = {
    module: { exports: {} }, console,
    fetch: trap('fetch'), XMLHttpRequest: trap('XMLHttpRequest'), WebSocket: trap('WebSocket'),
    EventSource: trap('EventSource'), FileReader: trap('FileReader'), importScripts: trap('importScripts'),
    setTimeout: trap('setTimeout'), setInterval: trap('setInterval'), Image: trap('Image'),
    navigator: new Proxy({}, { get: (_, k) => { touched.push('navigator.' + String(k)); return undefined; } })
  };
  vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(read(file), sandbox, { filename: file });
  return { api: sandbox.module.exports, touched };
}

// Примеры вызова всех функций каждой модели. Новая модель без своего списка или функция без
// примера — ошибка теста: так ни одна функция не остаётся непроверенной.
const SAMPLES = {
  'nonce-reuse.js': {
    alphabet: a => a.alphabet('kk'),
    checkText: a => a.checkText('ДОБРОЕ УТРО', 'ru'),
    checkKey: a => a.checkKey('КЛЮЧ', 'ru'),
    gamma: a => a.gamma('КЛЮЧ', 7, 10, 'ru'),
    shiftLetter: a => a.shiftLetter('Д', 7, 'ru'),
    shiftBetween: a => a.shiftBetween('Д', 'К', 'ru'),
    encrypt: a => a.encrypt('THE FOX', 'KEY', 3, 'en'),
    decrypt: a => a.decrypt('АБВ', 'КЛЮЧ', 3, 'ru'),
    readWithKnown: a => {
      const sc = a.scenario({ lang: 'ru', key: 'ПОЛИГОН', greeting: 'ДОБРОЕ УТРО', secret: 'ВСЁ ТИХО', filler: ['А', 'Б', 'В', 'Г'], seed: 3, greetingAt: 1 });
      const [g, s] = sc.pair.map(no => sc.entries[no - 1]);
      return a.readWithKnown(g.cipher, sc.greeting, s.cipher, 'ru');
    },
    scenario: a => a.scenario({ lang: 'kk', key: 'ҚҰЛЫП', greeting: 'ҚАЙЫРЛЫ ТАҢ', secret: 'ӘНІ ДАЙЫН', filler: ['А', 'Ә', 'Б', 'В'], seed: 5, greetingAt: 1 }),
    simulate: a => a.RULES.map(r => a.simulate(r, { messages: 3000 })),
    chanceOfRepeat: a => a.chanceOfRepeat(23, 365),
    expectedRepeats: a => a.expectedRepeats(20000, 2 ** 24),
    halfChanceAt: a => a.halfChanceAt(2 ** 24)
  }
};

for (const name of modelFiles) {
  test(name + ': все функции работают в окружении без сети и без выполнения строк', () => {
    const { api, touched } = loadIsolated(path.join(MODELS, name));
    const samples = SAMPLES[name];
    assert.ok(samples, 'для модели нет примеров вызова в SAMPLES');
    const fns = Object.keys(api).filter(k => typeof api[k] === 'function').sort();
    assert.deepEqual(fns, Object.keys(samples).sort(), 'у каждой функции модели должен быть пример вызова');
    for (const k of fns) assert.doesNotThrow(() => samples[k](api), k);
    assert.deepEqual(touched, []);
  });

  test(name + ': паспорт — цели из белого списка, источники сверены, есть миссия с разбором', () => {
    const { api } = loadIsolated(path.join(MODELS, name));
    const A = api.ABOUT;
    assert.ok(A && A.id, 'нет паспорта ABOUT');
    assert.equal(A.fixed, true, 'модель допустима только для исправленных или признанных устаревшими протоколов');
    assert.ok(A.principle && A.weakness, 'в паспорте нет принципа или слабости');
    assert.ok(Array.isArray(A.targets) && A.targets.length >= 1, 'в паспорте нет целей');
    for (const t of A.targets) assert.ok(ALLOWED_TARGETS.includes(t), 'цель не из белого списка: ' + t);
    const sources = loadSources();
    assert.ok(A.sources.length >= 2, 'нужно не меньше двух источников');
    for (const id of A.sources) {
      assert.ok(sources[id], 'нет источника ' + id + ' в data/sources.json (копия — data/sources.js)');
      assert.equal(sources[id].verified, true, 'источник ' + id + ' не сверен');
    }
    const missions = missionFiles().filter(f => /common\.js$/.test(f) && new RegExp('^модель:\\s*' + A.id + '\\s*$', 'm').test(read(f)));
    assert.ok(missions.length >= 1, 'у модели ' + A.id + ' нет миссии с разбором (строка «модель: ' + A.id + '» в common.js)');
  });
}

// ---------- 3. Модель «Повтор одноразового числа»: только формат полигона ----------
const NR = path.join(MODELS, 'nonce-reuse.js');

test('nonce-reuse: отвергает всё, что не формат полигона', () => {
  const M = require(NR);
  const bad = [
    new Uint8Array([1, 2, 3]), Buffer.from('ДОБРО'), ['Д', 'О'], { text: 'ДОБРО' }, null, undefined, 42,
    'Д'.repeat(41), '', 'DEADBEEF00', '00-00-5E-00-53-01', '192.0.2.1', 'ДОБРО\n', 'добро', 'ДОБРО!', 'fe80::1'
  ];
  for (const x of bad) {
    assert.throws(() => M.encrypt(x, 'К', 1, 'ru'), undefined, 'encrypt принял ' + String(x));
    assert.throws(() => M.decrypt(x, 'К', 1, 'ru'), undefined, 'decrypt принял ' + String(x));
    assert.throws(() => M.readWithKnown(x, 'АБ', 'АБ', 'ru'), undefined, 'readWithKnown принял ' + String(x));
  }
  for (const iv of [-1, 100, 1.5, '07', 2 ** 24, NaN]) assert.throws(() => M.encrypt('АБ', 'К', iv, 'ru'), undefined, 'iv ' + iv);
  const badKeys = ['', 'К'.repeat(13), 7, new Uint8Array(4), 'vydumka1234', 'AABBCCDDEEFF', 'MyWiFi-pass1',
    'КЛЮЧ ПРОБЕЛ', 'КЛ\u0007Ч', 'ключ', 'KEY'];
  for (const key of badKeys) assert.throws(() => M.encrypt('АБ', key, 1, 'ru'), undefined, 'ключ ' + String(key));
  assert.throws(() => M.scenario({ lang: 'ru', key: 'vydumka1234', greeting: 'ДОБРОЕ УТРО', secret: 'ТИХО', filler: ['А', 'Б', 'В', 'Г'] }));
  for (const lang of ['de', 'hex', '', null, '__proto__', 'constructor', 'toString']) assert.throws(() => M.encrypt('AB', 'К', 1, lang), undefined, 'алфавит ' + lang);
  assert.throws(() => M.simulate('random100', { messages: 100001 }));
  assert.throws(() => M.simulate('wpa2-real'));
  assert.throws(() => M.chanceOfRepeat(1e6, 100));
});

test('nonce-reuse: ограничения полигона маленькие (короткие ключи и тексты, 100 одноразовых чисел)', () => {
  const M = require(NR);
  assert.ok(M.LIMITS.maxText <= 40 && M.LIMITS.maxKey <= 12 && M.LIMITS.ivSpace <= 100);
  assert.ok(Object.isFrozen(M) && Object.isFrozen(M.ALPHABETS) && Object.isFrozen(M.LIMITS) && Object.isFrozen(M.ABOUT));
});

// ---------- 4. Тексты миссий, источники и страницы ----------
function loadSources() {
  const list = {};
  vm.runInNewContext(read(path.join(ROOT, 'data', 'sources.js')), { App: { sources: obj => Object.assign(list, obj) } });
  return list;
}

const MISSIONS = path.join(ROOT, 'content', 'missions');
function missionFiles() {
  const out = [];
  for (const dir of fs.readdirSync(MISSIONS)) for (const f of fs.readdirSync(path.join(MISSIONS, dir))) if (f.endsWith('.js')) out.push(path.join(MISSIONS, dir, f));
  return out;
}

// Адреса и сетевые данные, которых не должно быть в материалах (рамка 2).
function addressProblems(raw) {
  // Полноширинные цифры и невидимые знаки (мягкий перенос, пробел нулевой ширины) адрес не прячут.
  const text = raw.normalize('NFKC').replace(/\p{Cf}/gu, '');
  const out = [];
  const checks = [
    [/\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/, 'похоже на MAC-адрес'],
    [/\b[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}\b/, 'похоже на MAC-адрес с точками'],
    [/\b(?:[0-9A-Fa-f]{2} ){5}[0-9A-Fa-f]{2}\b/, 'похоже на MAC-адрес через пробелы'],
    [/\b[0-9A-Fa-f]{12}\b/, '12 шестнадцатеричных знаков подряд (MAC без разделителей)'],
    [/\b(?:\d{1,3}\.){3}\d{1,3}\b/, 'похоже на IP-адрес'],
    [/\b[0-9A-Fa-f]{1,4}::[0-9A-Fa-f]{0,4}\b|\b(?:[0-9A-Fa-f]{1,4}:){3,7}[0-9A-Fa-f]{1,4}\b/, 'похоже на IPv6-адрес'],
    [/\b(?:ssid|psk|passphrase)\b/i, 'имя сети или пароль']
  ];
  for (const [re, why] of checks) if (re.test(text)) out.push(why + ': «' + text.match(re)[0] + '»');
  return out;
}

// Названия настоящих программ для атак и форматов пакетов (рамка 1). «WEP», «WPA2», «IEEE 802.11»
// и название уязвимости KRACK — названия протоколов, стандартов и исследования, они разрешены.
const FORBIDDEN_WORDS = [
  'aircrack', 'airodump', 'aireplay', 'airmon', 'airgeddon', 'besside', 'kismet', 'wireshark', 'tshark', 'tcpdump',
  'hashcat', 'john the ripper', 'chopchop', 'korek', 'reaver', 'pixiewps', 'wifite', 'wifiphisher', 'fluxion', 'bettercap', 'ettercap',
  'mdk3', 'mdk4', 'hostapd', 'scapy', 'metasploit', 'hcxdumptool', 'hcxtools', 'cowpatty', 'macchanger',
  'pcap', 'radiotap', 'eapol', 'llc/snap', 'ethertype', 'aa aa 03', 'deauth', 'monitor mode',
  'режим монитор', 'деаутентифик', 'аиркрак', 'айркрак', 'эйркрак', 'вайршарк', 'ваиршарк', 'хэшкэт', 'хешкэт',
  'хэшкет', 'метасплоит', 'беттеркап', 'перехват рукопожат', 'capture handshake'
];
// Кириллические буквы, похожие на латинские: название из списка, набранное с русской «а», тоже должно ловиться.
const HOMOGLYPHS = { 'а': 'a', 'в': 'b', 'е': 'e', 'ё': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c',
  'т': 't', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'һ': 'h', 'ԁ': 'd', 'ԛ': 'q', 'ԝ': 'w' };
function normalized(text) {
  const plain = text.normalize('NFKC').replace(/\p{Cf}/gu, '')        // невидимые знаки слово не разрывают
    .replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/g, (_, a, b, c) => String.fromCodePoint(parseInt(a || b || c, 16)))
    .toLowerCase();
  return [plain, plain.replace(/[а-яёіјѕһԁԛԝ]/g, ch => HOMOGLYPHS[ch] || ch)];
}

// Всё содержание учебника (ступени на всех языках, карта, строки интерфейса, правила разметки) —
// без миссий, их список отдельно.
function contentFiles() {
  const out = [];
  const walk = dir => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, d.name);
      if (d.isDirectory()) { if (f !== MISSIONS) walk(f); } else if (/\.(js|md)$/.test(d.name)) out.push(f);
    }
  };
  walk(path.join(ROOT, 'content'));
  return out;
}
const rootPages = () => fs.readdirSync(ROOT).filter(f => /\.(html|md)$/.test(f)).map(f => path.join(ROOT, f));
const PAGE_FILES = () => [
  ...missionFiles(), ...contentFiles(), ...modelFiles.map(f => path.join(MODELS, f)),
  ...fs.readdirSync(path.join(ROOT, 'js')).map(f => path.join(ROOT, 'js', f)),
  ...fs.readdirSync(path.join(ROOT, 'css')).map(f => path.join(ROOT, 'css', f)),
  ...rootPages(), path.join(ROOT, 'data', 'sources.js')
];

test('миссии, модели, источники и страницы: нет названий программ для атак и форматов пакетов', () => {
  const found = [];
  for (const f of PAGE_FILES()) {
    for (const text of normalized(read(f))) for (const w of FORBIDDEN_WORDS) {
      if (text.includes(w)) found.push(path.relative(ROOT, f) + ': ' + w);
    }
  }
  assert.deepEqual([...new Set(found)], []);
});

// Стоп-списки названий лежат в тестах рамок: там слова стоят нарочно. Из этих файлов вырезается только сам
// список — остальной их текст проверяется, как и всё остальное.
const STOP_LISTS = ['models/tests/frame.test.js', 'python/tests/test_principles.py', 'python/tests/test_variants.py'];
const STOP_LIST_BODY = /^(?:const )?(?:FORBIDDEN_WORDS|FORBIDDEN_IN_PRINCIPLES) = \[[\s\S]*?\];?$/m;
const withoutStopList = (f, text) => (STOP_LISTS.includes(f) ? text.replace(STOP_LIST_BODY, '') : text);
// Не читаются только двоичные файлы (шрифты, документы Word, картинки) и папка шрифтов в корне.
const BINARY_FILE = /\.(ttf|otf|woff2?|png|jpe?g|gif|ico|docx|xlsx|pptx|pdf|zip|pyc)$/i;
const relative = f => path.relative(ROOT, f).split(path.sep).join('/');
// Все файлы репозитория с текстом: тесты, данные, документы, инструменты, консольная версия.
function repoTextFiles() {
  const out = [];
  const walk = dir => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, d.name);
      if (d.isDirectory()) { if (!['.git', '__pycache__'].includes(d.name) && relative(f) !== 'fonts') walk(f); } else if (!BINARY_FILE.test(d.name)) out.push(f);
    }
  };
  walk(ROOT);
  return out.map(relative);
}

test('весь репозиторий (тесты, данные, документы, инструменты): нет названий программ для атак', () => {
  const files = repoTextFiles();
  for (const dir of ['tests/', 'tools/', 'python/', 'docs/', 'data/', 'models/tests/']) {
    assert.ok(files.some(f => f.startsWith(dir)), 'не проверяется папка ' + dir);
  }
  const found = [];
  for (const f of [...STOP_LISTS, 'tools/make_vectors.py', '.gitattributes']) assert.ok(files.includes(f), 'не проверяется ' + f);
  for (const f of files) for (const text of normalized(withoutStopList(f, read(path.join(ROOT, f))))) for (const w of FORBIDDEN_WORDS) {
    if (text.includes(w)) found.push(f + ': ' + w);
  }
  assert.deepEqual([...new Set(found)], []);
});

// В описании источника (поля title, label и section файла data/sources.js) разрешены только номера пунктов из
// явного списка — сразу после знака § — и три термина из названий стандартов, целыми словами и именно в таком
// написании. В список попадает номер, который по виду не отличить от IP-адреса (четыре части); короткие
// номера вроде «§3.2.2» тест и так не трогает. Новый источник с таким номером тест остановит («похоже на
// IP-адрес»): тогда номер дописывают сюда, сверив его с публикацией. Номер с продолжением («§3.1.1.2.192…»)
// под исключение не попадает. Термин со знаком «=» или «:» после него — уже не название, а запись
// «имя сети = …». Всё остальное в этих полях, адрес публикации (url), прочие поля источников и все тексты
// учебника и миссий проверяются целиком. Номер в конце предложения с точкой («§3.1.1.2.») под исключение тоже не
// попадает — ошибка в безопасную сторону: тест остановит, и точку убирают.
const SECTION_NUMBERS = ['3.1.1.2'];   // NIST SP 800-63B, § 3.1.1.2 — требования к паролям
const SECTION_NUMBER = new RegExp('§\\s?(?:' + SECTION_NUMBERS.map(n => n.replace(/\./g, '\\.')).join('|') + ')(?![.\\d])', 'g');
const SOURCE_TERMS = /\b(?:SSID|PSK|Passphrase)\b(?!\s*[=:])/g;
const SOURCE_FIELDS = ['title', 'label', 'section'];
const asText = v => (typeof v === 'string' ? v : JSON.stringify(v));
const sourceFieldText = (key, value) => (SOURCE_FIELDS.includes(key)
  ? asText(value).replace(SECTION_NUMBER, '§').replace(SOURCE_TERMS, '') : asText(value));
// Источники проверяются по разобранным значениям полей, а не по тексту файла: цифру не спрятать записью
// через \u, а исключение не достаётся соседнему полю в той же строке.
const sourcesText = () => Object.values(loadSources())
  .flatMap(s => Object.entries(s).map(([key, value]) => sourceFieldText(key, value))).join('\n');

test('миссии, источники и страницы: нет адресов, имён сетей и паролей', () => {
  const sources = path.join(ROOT, 'data', 'sources.js');
  const files = [...missionFiles(), ...contentFiles(), sources, ...rootPages()];
  const found = [];
  for (const f of files) {
    const text = f === sources ? sourcesText() : read(f);
    for (const p of addressProblems(text)) found.push(relative(f) + ': ' + p);
  }
  assert.deepEqual(found, []);
});

test('проверка проверяющего: в описании источника ловится всё, кроме номера пункта и трёх терминов', () => {
  const inField = s => addressProblems(sourceFieldText('section', s));
  assert.deepEqual(inField('§3.1.1.2: SSID «is not an access control feature»; pass-phrase-to-PSK; Passphrase'), []);
  for (const bad of ['адрес 192.0.2.1', 'п. 3.1.1.2 без знака параграфа', '00-00-5E-00-53-01', 'AABBCCDDEEFF', 'fe80::1',
    'имя сети ssid', 'ключ psk', 'passphrase строчными', '§192.0.2.7', '§10.0.0.1', '§3.1.1.2.192.0.2.1', '§1234.5678.9012',
    '§10.20.30.40', '§3.1.1.3', '§3.1.1.21', '§13.1.1.2',
    'SSID=PRIMER', 'PSK: primer12345', '１９２.０.２.１ полноширинными цифрами', '192.0.​2.1 с невидимым знаком', '00 00 5E 00 53 01']) {
    assert.ok(inField(bad).length, 'не поймано в описании источника: ' + bad);
  }
  // В остальных полях источника исключений нет.
  assert.ok(addressProblems(sourceFieldText('note', 'SSID')).length);
  assert.ok(addressProblems(sourceFieldText('note', '§3.1.1.2')).length);
  assert.ok(addressProblems(sourceFieldText('url', 'https://192.0.2.1/x')).length);
  // Невидимый знак внутри названия программы из стоп-списка его не прячет.
  const hidden = FORBIDDEN_WORDS[0].slice(0, 3) + '­' + FORBIDDEN_WORDS[0].slice(3);
  assert.ok(normalized(hidden).some(text => text.includes(FORBIDDEN_WORDS[0])));
});

// Адреса — во всём репозитории: в коде страницы, данных, документах, инструментах и консольной версии.
// Не проверяются только этот файл (в нём образцы для проверок выше — условные адреса из частных диапазонов)
// и номер пункта «3.1.1.2» стандарта NIST SP 800-97, который по виду не отличить от IP-адреса.
// Слова «ssid» и «psk» здесь не ищем: в данных и консольной версии это имена полей настроек.
const NIST_CLAUSE = /(?<![\d.])3\.1\.1\.2(?![\d.])/g;
test('весь репозиторий: нет MAC-, IP- и IPv6-адресов', () => {
  const found = [];
  for (const f of repoTextFiles().filter(f => f !== 'models/tests/frame.test.js')) {
    const problems = addressProblems(read(path.join(ROOT, f)).replace(NIST_CLAUSE, '')).filter(p => !p.startsWith('имя сети'));
    for (const p of problems) found.push(f + ': ' + p);
  }
  assert.deepEqual(found, []);
  assert.ok(addressProblems('пункт 3.1.1.21'.replace(NIST_CLAUSE, '')).length, 'похожее на номер пункта, но длиннее — ловится');
  assert.ok(addressProblems('13.1.1.2'.replace(NIST_CLAUSE, '')).length);
});

test('тексты полигона во всех мирах — только буквы полигона, ключ — слово полигона, данные вымышленные', () => {
  const M = require(NR);
  const files = missionFiles().filter(f => !/common\.js$/.test(f));
  assert.ok(files.length >= 1);
  for (const f of files) {
    const src = read(f), base = path.basename(f);
    const block = (src.split(/^## полигон\s*$/m)[1] || '').split(/^## /m)[0];
    assert.ok(block.trim(), base + ': нет блока «## полигон»');
    const field = k => ((block.match(new RegExp('^' + k + ':\\s*(.*)$', 'm')) || [])[1] || '').trim();
    const lang = (src.match(/^язык:\s*(\w+)/m) || [])[1] || 'ru';
    M.checkKey(field('ключ'), lang);
    M.checkText(field('приветствие'), lang, 'приветствие');
    M.checkText(field('секрет'), lang, 'секрет');
    field('шум').split('|').map(s => s.trim()).forEach(t => M.checkText(t, lang, 'шум'));
    for (const mark of field('метки').split('|').map(s => s.trim()).filter(Boolean)) {
      assert.match(mark, /^[0-9:А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІіA-Za-z ]{1,12}$/, base + ': метка «' + mark + '» — только буквы, цифры и двоеточие');
    }
    assert.match(src, /вымышлен/i, base + ': мир должен быть назван вымышленным');
  }
});

test('у миссии есть разбор: почему сработало, что исправили (с источниками), как сделать сильнее', () => {
  const common = missionFiles().filter(f => /common\.js$/.test(f));
  assert.ok(common.length >= 1, 'нет общего файла разбора common.js');
  for (const f of common) {
    const src = read(f);
    for (const scene of ['почему', 'в мире', 'сильнее']) {
      const body = (src.split(new RegExp('^## ' + scene + '\\s*$', 'm'))[1] || '').split(/^## /m)[0];
      assert.ok(body.trim().length > 80, path.basename(path.dirname(f)) + ': раздел разбора «' + scene + '» пуст');
      if (scene === 'в мире') assert.match(body, /\[\[ист:/, 'в «в мире» нет источников');
    }
  }
});
