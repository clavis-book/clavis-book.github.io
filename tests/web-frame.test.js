// Рамки веб-версии для всего кода страницы (рамки 1 и 2 проекта): ни одного обращения в сеть (копию учебника
// для работы без интернета скачивает с того же сайта сервис-воркер sw.js — его рамки в tests/offline.test.js), никакой
// вставки HTML-строк и выполнения строк как кода, данные — только на устройстве и только через js/ui.js,
// строгая политика безопасности (CSP) в каждой странице, шрифты свои и с лицензиями.
// Запуск из корня репозитория: node --test tests/web-frame.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, read } = require('./load.js');

// Весь JavaScript, который попадает на страницу: код, модели, содержание, копия источников и всё, что
// подключено к страницам тегом script, где бы оно ни лежало. Не входят только тесты моделей (models/tests).
function siteJs() {
  const out = [];
  const walk = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach(d => {
    const rel = dir + '/' + d.name;
    if (d.isDirectory()) { if (rel !== 'models/tests') walk(rel); } else if (d.name.endsWith('.js')) out.push(rel);
  });
  ['js', 'models', 'content'].forEach(walk);
  out.push('data/sources.js');
  for (const page of fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))) {
    for (const m of read(page).matchAll(/<script\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi)) if (!out.includes(m[1])) out.push(m[1]);
  }
  return out.sort();
}
const htmlPages = () => fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));

// Что запрещено в коде страницы. Ищем по всему тексту файла, вместе с комментариями: вырезание комментариев
// можно обмануть (строка 'a//b' спрятала бы всё, что стоит после неё), поэтому и в пояснениях эти слова
// не пишем — говорим по-русски («сеть», «вставка HTML-строк»). Сам этот файл в проверку не входит.
const FORBIDDEN = [
  ['fetch(', 'сеть'], ['XMLHttpRequest', 'сеть'], ['WebSocket', 'сеть'], ['EventSource', 'сеть'], ['sendBeacon', 'сеть'],
  ['RTCPeerConnection', 'сеть'], ['import(', 'загрузка кода'], ['importScripts', 'загрузка кода'], ['Worker(', 'загрузка кода'],
  ['serviceWorker', 'сервис-воркер — только в функции startOfflineCopy'], ['createPolicy', 'политика Trusted Types — только в функции startOfflineCopy'],
  ['trustedTypes', 'политика Trusted Types — только в функции startOfflineCopy'], ['eval(', 'строка как код'],
  ['new Function', 'строка как код'], ['innerHTML', 'вставка HTML'], ['outerHTML', 'вставка HTML'],
  ['insertAdjacentHTML', 'вставка HTML'], ['document.write', 'вставка HTML'], ['srcdoc', 'вставка HTML'],
  ['createContextualFragment', 'вставка HTML'], ['DOMParser', 'вставка HTML'], ['javascript:', 'код в адресе'],
  ['window.open(', 'новое окно из кода'], ['postMessage', 'обмен с другими окнами'], ['document.cookie', 'cookie'],
  ['navigator', 'доступ к устройству'], ['setAttribute(\'on', 'обработчик строкой'], ['setAttribute("on', 'обработчик строкой'],
  ['setAttribute(\'style', 'стиль строкой'], ['.cssText', 'стиль строкой'],
  // Страница не читает файлы и не принимает вставку и перетаскивание: модели получают только ввод полигона.
  ['FileReader', 'чтение файлов'], ['launchQueue', 'файлы из системы'], ['getFile', 'чтение файлов'], ['getAsFile', 'чтение файлов'],
  ['webkitGetAsEntry', 'чтение файлов'], ['webkitdirectory', 'чтение файлов'], ['showOpenFilePicker', 'чтение файлов'], ['showDirectoryPicker', 'чтение файлов'],
  ["type: 'file'", 'загрузка файлов'], ['type="file"', 'загрузка файлов'], ['dataTransfer', 'перетаскивание файлов'],
  ["'drop'", 'перетаскивание файлов'], ['ondrop', 'перетаскивание файлов'], ['clipboardData', 'вставка из буфера'],
  ["'paste'", 'вставка из буфера'], ['onpaste', 'вставка из буфера']
];
const STORAGE = ['localStorage', 'sessionStorage', 'indexedDB'];

// Элементы, которые сами что-то загружают или отправляют: страница их не создаёт.
const LOADING_TAGS = 'img|iframe|script|link|object|embed|audio|video|source|track|form|base|meta|picture|image|use';

// Единственная строка кода, которой разрешено читать адрес страницы (js/interactives.js, функция pageBase).
const QR_PAGE_BASE = String.raw`function pageBase() { return location.protocol === 'file:' ? null : { url: location.origin + location.pathname, local: /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) }; }`;

// Единственное место, где страница запускает сервис-воркер, создаёт политику Trusted Types и ещё раз читает адрес
// страницы (js/offline.js, функция startOfflineCopy; 15.11.2026). Сам сервис-воркер — sw.js в корне —
// проверяется отдельно, в tests/offline.test.js: что он скачивает, что хранит и чем отвечает.
const OFFLINE_START = String.raw`  function startOfflineCopy(report) {
    const sw = navigator.serviceWorker, tt = window.trustedTypes;
    if (!sw || location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
    const url = tt ? tt.createPolicy('clavis-offline', { createScriptURL: () => 'sw.js' }).createScriptURL('') : 'sw.js';
    const controlled = !!sw.controller;
    sw.register(url).then(reg => {
      const worker = reg.installing || reg.waiting;
      if (reg.active) report('ready');
      else if (worker) {
        report('saving');
        worker.addEventListener('statechange', () => { if (worker.state === 'activated') report('ready'); else if (worker.state === 'redundant') report('none'); });
      }
    }, () => {});
    sw.addEventListener('controllerchange', () => { if (controlled) report('updated'); });
  }`;

function problems(rel, source) {
  const found = [];
  // Исключение для работы без интернета — только функция startOfflineCopy слово в слово и только в js/offline.js:
  // она вырезается целиком, всё остальное в файле проверяется как обычно. Изменили в ней хоть знак — она
  // перестаёт совпадать, и тест остановит: правку функции нужно внести и сюда, то есть показать проверяющему.
  const text = rel === 'js/offline.js' ? source.split(OFFLINE_START).join('') : source;
  // Запрещённое ищем и в «сплющенном» тексте: без пробелов, без «?.» и с одинаковыми кавычками, —
  // чтобы пробел перед скобкой или двойные кавычки ничего не прятали.
  const flat = text.replace(/\s+/g, '').replace(/\?\./g, '.').replace(/["`]/g, "'");
  for (const [needle, why] of FORBIDDEN) {
    if (text.includes(needle) || flat.includes(needle.replace(/\s+/g, '').replace(/"/g, "'"))) found.push(rel + ': ' + needle + ' (' + why + ')');
  }
  // Код страницы и модели (не тексты содержания): из адреса страницы — только часть после #, никаких новых
  // окон, нажатий из кода, адресов через setAttribute, файлов, перетаскивания и вставки.
  if (/^(?:js|models)\//.test(rel)) {
    // Единственное исключение (14.11.2026): QR-код в js/interactives.js кодирует ссылку на
    // учебник для телефонов, поэтому читает адрес страницы до # и проверяет, не файл ли это на диске и не
    // localhost (такой адрес телефон не откроет). С 15.11.2026 — только функция pageBase слово в слово
    // и только в этом файле; менять адрес по-прежнему нельзя — это ловит правило «переход на другой адрес» ниже.
    const reads = rel === 'js/interactives.js' ? text.split(QR_PAGE_BASE).join('') : text;
    if (/\blocation\b(?!\.hash\b)/.test(reads)) found.push(rel + ': из адреса страницы разрешён только location.hash');
    if (/(?<![\w$.])(?<!function\s+)open\s*\(|(?:window|self|globalThis|top|parent)\s*\??\.\s*open\b/.test(text)) found.push(rel + ': новое окно из кода');
    if (/\.click\s*\(/.test(text)) found.push(rel + ': нажатие из кода');
    if (/\[\s*['"`][^'"`\n]*['"`]\s*\+|\+\s*['"`][^'"`\n]*['"`]\s*\]/.test(text)) found.push(rel + ': имя свойства склейкой строк');
    if (/\b(?:parent|opener|frames)\b|(?:window|self|globalThis)\s*\??\.\s*top\b|\btop\s*\??\.\s*\w/.test(text)) found.push(rel + ': обращение к другим окнам');
    if (/["'`](?:file|drop|paste|drag\w*)["'`]/.test(text)) found.push(rel + ': файлы, перетаскивание или вставка');
    if (/setAttribute(?:NS)?\s*\(\s*(?:[\w.]+\s*,\s*)?["'`](?:href|src|srcset|action|formaction|data|poster|ping|xlink:href)["'`]/.test(text)) found.push(rel + ': адрес через setAttribute');
  }
  if (rel !== 'js/ui.js') for (const s of STORAGE) if (text.includes(s)) found.push(rel + ': ' + s + ' (хранилище — только в js/ui.js)');
  // Таймеры и обработчики — только с функцией, не со строкой кода.
  if (/set(?:Timeout|Interval)\(\s*['"`]/.test(text)) found.push(rel + ': setTimeout со строкой');
  if (/\.(?:src|href|action|srcset|data)\s*=(?!=)/.test(text)) found.push(rel + ': адрес задаётся из кода');
  // Переход на другой адрес: из кода меняется только часть адреса после # (location.hash).
  if (/location\s*\.\s*(?:assign|replace|reload)|location\s*(?:\.\s*(?:href|pathname|search|host\w*|protocol|port))?\s*=(?!=)|location\s*\[/.test(text)) {
    found.push(rel + ': переход на другой адрес из кода');
  }
  if (new RegExp('(?:\\bh|\\bs|svg|createElement(?:NS)?)\\s*\\(\\s*(?:[\\w.]+\\s*,\\s*)?[\'"`](?:' + LOADING_TAGS + ')[\'"`]').test(text)) {
    found.push(rel + ': элемент, который загружает или отправляет данные');
  }
  return found;
}

test('код страницы не обращается к сети, не вставляет HTML-строки и не выполняет строки как код', () => {
  const files = siteJs();
  assert.ok(files.length >= 20, 'проверяется слишком мало файлов: ' + files.length);
  for (const must of ['js/app.js', 'js/ui.js', 'js/store.js', 'js/mission.js', 'js/interactives.js', 'js/markup.js', 'models/nonce-reuse.js', 'content/ui/ru.js']) {
    assert.ok(files.includes(must), 'не проверяется ' + must);
  }
  const found = files.flatMap(rel => problems(rel, read(rel)));
  assert.deepEqual(found, []);
});

test('проверка проверяющего: на плохом коде срабатывает каждое правило', () => {
  const bad = [
    "fetch('/x')", 'new XMLHttpRequest()', "new WebSocket('ws://x')", 'navigator.sendBeacon(u, d)', "import('./x.js')",
    "el.innerHTML = s", "el.outerHTML = s", "el.insertAdjacentHTML('beforeend', s)", 'document.write(s)', "eval('1')",
    "new Function('return 1')", "a.href = 'javascript:alert(1)'", "setTimeout('alert(1)', 10)", "img.src = u",
    "localStorage.setItem('k', 'v')", "el.setAttribute('onclick', 'x()')", 'new DOMParser()', "window.open('x')",
    'document.cookie', "el.style.cssText = 'color:red'", "new Worker('w.js')", 'navigator.serviceWorker.register(u)',
    "trustedTypes.createPolicy('x', { createHTML: s => s })", "tt.createPolicy('default', {})",
    'new FileReader()', "h('input', { type: 'file' })", 'ev.dataTransfer.files', "el.addEventListener('paste', f)",
    "ev.clipboardData.getData('text')", "h('div', { ondrop: f })", 'window.showOpenFilePicker()',
    "location.assign('https://example.org')", "location.replace(u)", "location.href = u", "window.location = u",
    "location['href'] = u", "h('img', { src: u })", "s('image', { href: u })", "document.createElement('iframe')",
    "h('form', { action: u })",
    // Комментарий и строка с двумя косыми чертами запрещённое не прячут.
    "const a = 'a//b'; fetch('/x');", "// el.innerHTML = s", "/* eval('1') */",
    // Пробел перед скобкой, двойные кавычки, «?.» и обходные пути к адресу и файлам.
    "fetch (u)", "h ('img', { src: u })", 'h("input", { type: "file" })', "h('input', {type:'file'})", "inp.type = 'file'",
    'el.addEventListener("drop", f)', 'el.addEventListener("paste", f)', "el.addEventListener('dragover', f)",
    "open(u)", "window.open (u)", "window?.open(u)", "Object.assign(location, { href: u })", "const L = location; L.assign(u)",
    "location?.assign(u)", "a.click()", "el.setAttribute('href', u)", 'el.setAttributeNS(ns, "xlink:href", u)',
    // Склейка имён, другие окна, деструктуризация navigator, файлы системы.
    "window['fe' + 'tch'](u)", "window.parent['post' + 'Message'](d, '*')", 'opener.focus()', 'const { connection } = navigator;',
    'window.launchQueue.setConsumer(f)', 'h.getFile()'
  ];
  for (const line of bad) assert.ok(problems('js/proba.js', line).length, 'не поймано: ' + line);
  // Разрешённое — не ловится.
  assert.deepEqual(problems('js/proba.js', "// здесь нет сети и вставки HTML-строк\nel.replaceChildren(h('p', {}, text));\nsetTimeout(tick, 55);\nlocation.hash = 'karta';\nif (location.hash === '#x') s('line', { x1: 0 });\nfunction open(id) { return id; }\nApp.missionView.open(r.mission);"), []);
  assert.deepEqual(problems('js/ui.js', "localStorage.getItem('clavis:v1')"), []);
  // Исключение для QR-кода — только функция pageBase слово в слово и только в js/interactives.js.
  assert.deepEqual(problems('js/interactives.js', '  ' + QR_PAGE_BASE + '\n'), []);
  assert.ok(problems('js/proba.js', QR_PAGE_BASE).length, 'чтение адреса вне js/interactives.js');
  assert.ok(problems('js/interactives.js', QR_PAGE_BASE.replace('location.pathname', 'location.href')).length, 'изменённая pageBase');
  assert.ok(problems('js/interactives.js', QR_PAGE_BASE + "\nconst b = location.href.split('#')[0];").length, 'прежнее чтение адреса');
  for (const line of ['const q = location.search;', 'location.href = u;', "const p = location.pathname;", 'send(location.href);']) {
    assert.ok(problems('js/interactives.js', line).length, 'не поймано в js/interactives.js: ' + line);
  }
  // Исключение для работы без интернета — только функция startOfflineCopy слово в слово и только в js/offline.js.
  assert.deepEqual(problems('js/offline.js', '(function () {\n' + OFFLINE_START + '\n  startOfflineCopy(report);\n})();\n'), []);
  assert.ok(problems('js/proba.js', OFFLINE_START).length, 'запуск сервис-воркера вне js/offline.js');
  assert.ok(problems('js/app.js', OFFLINE_START).length, 'запуск сервис-воркера вне js/offline.js');
  for (const [a, b] of [["() => 'sw.js'", 'u => u'], ["'sw.js' }", "'drugoy.js' }"], [": 'sw.js';", ': location.search;'],
    ["location.protocol === 'file:' || ", ''], ['sw.register(url)', "sw.register(url, { scope: '/' })"]]) {
    assert.ok(OFFLINE_START.includes(a), 'образец для проверки устарел: ' + a);
    assert.ok(problems('js/offline.js', OFFLINE_START.replace(a, b)).length, 'изменённая startOfflineCopy: ' + a + ' → ' + b);
  }
  for (const line of ['navigator.serviceWorker.register(u)', "window.trustedTypes.createPolicy('x', { createHTML: s => s })",
    'const where = location.hostname;', "navigator.serviceWorker.getRegistrations()", "tt.createPolicy('default', {})"]) {
    assert.ok(problems('js/offline.js', OFFLINE_START + '\n' + line).length, 'не поймано в js/offline.js: ' + line);
  }
});

test('каждая страница: CSP без unsafe-inline и с Trusted Types, ничего внешнего, без встроенных скриптов и стилей', () => {
  const pages = htmlPages();
  assert.ok(pages.includes('index.html'));
  for (const f of pages) {
    const html = read(f);
    const csp = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
    for (const part of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "font-src 'self'", "connect-src 'none'",
      "img-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "manifest-src 'self'", "worker-src 'self'",
      "require-trusted-types-for 'script'"]) {
      assert.ok(csp.includes(part), f + ': в CSP нет ' + part);
    }
    // Политика Trusted Types одна, с известным именем: её создаёт только startOfflineCopy, и выдаёт она только адрес sw.js.
    assert.deepEqual(csp.split(';').map(d => d.trim()).filter(d => d.startsWith('trusted-types')), ['trusted-types clavis-offline'], f + ': политика Trusted Types');
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|unsafe-hashes|https?:|data:|blob:|\*/, f + ': CSP слишком широкая');
    const body = html.replace(/<!--[\s\S]*?-->/g, '');
    assert.doesNotMatch(body, /(src|href)="(https?:)?\/\//, f + ': внешняя загрузка');
    assert.doesNotMatch(body, /<script(?![^>]*\ssrc=)[^>]*>/, f + ': встроенный скрипт');
    assert.doesNotMatch(body, /<style|\sstyle="|\son[a-z]+="/i, f + ': встроенный стиль или обработчик');
    assert.match(html, /<meta charset="utf-8">/);
    assert.match(html, /<meta name="text-scale" content="scale">/, f + ': страница должна учитывать системный размер текста');
    assert.match(html, /<meta name="referrer" content="no-referrer">/);
    assert.deepEqual([...body.matchAll(/http-equiv\s*=\s*["']?([^"'\s>]+)/gi)].map(m => m[1].toLowerCase()), ['content-security-policy'], f + ': из http-equiv — только CSP');
  }
});

test('стили: ничего внешнего, шрифты лежат в проекте, у каждого шрифта есть лицензия', () => {
  const css = fs.readdirSync(path.join(ROOT, 'css')).map(f => read('css/' + f)).join('\n');
  assert.doesNotMatch(css, /url\(\s*['"]?(https?:)?\/\//, 'внешний адрес в стилях');
  assert.doesNotMatch(css, /@import/, '@import в стилях');
  const urls = [...css.matchAll(/url\("\.\.\/([^"]+)"\)/g)].map(m => m[1]);
  assert.ok(urls.length >= 5, 'шрифты не подключены');
  for (const u of urls) assert.ok(fs.existsSync(path.join(ROOT, u)), 'нет файла ' + u);
  const fonts = fs.readdirSync(path.join(ROOT, 'fonts'));
  const licence = { Lora: 'OFL-Lora.txt', PTSans: 'OFL-PT.txt', PTMono: 'OFL-PTMono.txt' };
  for (const f of fonts.filter(x => x.endsWith('.ttf'))) {
    const family = Object.keys(licence).find(k => f.startsWith(k));
    assert.ok(family, 'шрифт без известной лицензии: ' + f);
    const text = read('fonts/' + licence[family]);
    assert.match(text, /SIL OPEN FONT LICENSE/i, licence[family]);
  }
  // Размер шрифта на :root и html не задаётся: страница объявляет text-scale.
  assert.doesNotMatch(css, /(?:^|[\s,}])(?::root|html)(?:[.\[][^{]*)?\s*\{[^}]*font-size/m, 'font-size на :root или html');
});

// Сайт раздаёт всё, что лежит в репозитории. Страница или SVG в любой папке — документ того же сайта, с доступом к
// хранилищу учебника, но без проверок выше (CSP, скрипты). Поэтому такие файлы — только из короткого списка.
test('документы, которые браузер выполняет (html, svg, xml), — только страница учебника и значки', () => {
  const ACTIVE = /\.(?:x?html?|shtml|svgz?|xml|xslt?|mht(?:ml)?)$/i;
  const walk = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(d => {
    const rel = dir ? dir + '/' + d.name : d.name;
    return d.isDirectory() ? (['.git', 'node_modules', '__pycache__'].includes(d.name) ? [] : walk(rel)) : [rel];
  });
  assert.deepEqual(walk('').filter(f => ACTIVE.test(f)).sort(), ['icons/icon-dark.svg', 'icons/icon.svg', 'index.html']);
});

// Код для Node — инструменты (tools/) и тесты — на страницу не подключается, но лежит в том же репозитории и на сайте
// и запускается на компьютере автора и преподавателя. Сети в нём тоже нет: модули — только из списка, программы
// запускают только tools/check.js (node и Python) и tests/offline.test.js (git, список файлов репозитория).
const NODE_MODULES = ["'node:test'", "'node:assert/strict'", "'node:fs'", "'node:path'", "'node:vm'", "'node:crypto'", "'node:child_process'",
  "'./load.js'", "'../tools/offline.js'", "'../js/qr.js'", 'NR', "path.join(ROOT, 'models', 'nonce-reuse.js')", "path.join(__dirname, '..', 'nonce-reuse.js')"];
// Кто и чем запускает программы. В tools/check.js программа — только node (process.execPath) или Python (PYTHON[0]):
// первый аргумент каждого run(…) и второй элемент каждой строки списка сверок — из этих двух.
const LAUNCH = {
  'tools/check.js': { fn: 'spawnSync', calls: ['spawnSync(cmd, args, {'] },
  'tests/offline.test.js': { fn: 'execFileSync', calls: ["execFileSync('git', ['-c', 'core.quotepath=off', 'ls-files', '-z'], {"] }
};
function nodeProblems(f, src) {
  const found = [];
  for (const m of src.matchAll(/\brequire\s*\(((?:[^()]|\([^()]*\))*)\)/g)) {
    const arg = m[1].trim();
    if (!NODE_MODULES.includes(arg)) found.push(f + ': модуль ' + arg);
  }
  // Запуск программ: модуль — только в двух файлах, функция — одна своя на файл, вызовы — ровно из списка.
  // Этот файл называет модуль в своих списках как данные, поэтому для него — только по настоящему подключению.
  if (/require\s*\(\s*'node:child_process'\s*\)/.test(src) || (f !== 'tests/web-frame.test.js' && /child_process/.test(src))) {
    const own = LAUNCH[f];
    if (!own) found.push(f + ': запуск программ');
    else {
      const imports = [...src.matchAll(/(?:\{([^}]*)\}\s*=\s*require\s*\(\s*'node:child_process'\s*\)|require\s*\(\s*'node:child_process'\s*\)\s*\.\s*(\w+))/g)];
      const names = imports.flatMap(m => (m[1] || m[2]).split(',').map(s => s.trim()).filter(Boolean));
      const uses = (src.match(/child_process/g) || []).length;
      if (uses !== imports.length || !names.length || names.some(n => n !== own.fn)) found.push(f + ': из child_process — только ' + own.fn + ' и только так: { ' + own.fn + ' } = …');
      // Каждое упоминание функции — либо в самом подключении, либо вызов ровно из списка (не под другим именем).
      const spans = imports.map(m => [m.index, m.index + m[0].length]);
      for (const m of src.matchAll(new RegExp('\\b' + own.fn + '\\b', 'g'))) {
        const inImport = spans.some(([a, b]) => m.index >= a && m.index < b) && !src.startsWith(own.fn + '(', m.index);
        if (!inImport && !own.calls.some(c => src.startsWith(c, m.index))) found.push(f + ': запуск не из списка: ' + src.slice(m.index, m.index + 60));
      }
      if (f === 'tools/check.js') {
        if (/\brun\b(?!\s*\()/.test(src)) found.push(f + ': run под другим именем');
        const progs = [...src.matchAll(/\brun\s*\(\s*([^,)]+)/g)].map(m => m[1].trim()).filter(a => a !== 'cmd');
        const rows = [...src.matchAll(/\[\s*(['"`])[^'"`]*\1\s*,\s*([^,]+?)\s*,\s*\[/g)].map(m => m[2].trim());
        for (const p of [...progs, ...rows]) if (!['process.execPath', 'PYTHON[0]'].includes(p)) found.push(f + ': программа ' + p);
      }
    }
  }
  // Этот файл сам называет слово в правилах, поэтому правило «не как вызов» к нему не применяется.
  if (f !== 'tests/web-frame.test.js' && /(?<![\w$.'"`])require\b(?!\s*\(|\.main\b)/.test(src)) found.push(f + ': модуль под другим именем');
  if (/(?<![\w$'"`])import\s*\(|^\s*import\s|process\s*\.\s*(?:binding|dlopen)/m.test(src)) found.push(f + ': загрузка кода');
  if (/['"`](?:curl|wget|powershell|pwsh|bitsadmin|certutil|netsh|ftp|tftp|ping|ssh|scp|nc|ncat|mshta|rundll32)(?:\.exe)?['"`]/i.test(src)) found.push(f + ': сетевая программа');
  if (f.startsWith('tools/') && /\b(?:fetch|WebSocket|XMLHttpRequest|EventSource|sendBeacon)\b/.test(src)) found.push(f + ': сеть');
  return found;
}

// Каждый .js в репозитории — под одной из трёх проверок: код страницы (выше), sw.js (tests/offline.test.js) или
// правила для Node. Новый файл в любой папке не останется без проверки.
test('инструменты и тесты для Node: модули из списка, без сети и сетевых программ', () => {
  const walk = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(d => {
    const rel = dir ? dir + '/' + d.name : d.name;
    return d.isDirectory() ? (['.git', 'node_modules'].includes(d.name) ? [] : walk(rel)) : [rel];
  });
  const site = siteJs();
  const files = walk('').filter(f => /\.[cm]?js$/.test(f) && f !== 'sw.js' && !site.includes(f)).sort();
  for (const must of ['tools/check.js', 'tools/offline.js', 'tests/load.js', 'tests/web-frame.test.js', 'models/tests/frame.test.js']) assert.ok(files.includes(must), 'не проверяется ' + must);
  assert.deepEqual(files.filter(f => !/^(?:tools|tests|models\/tests)\//.test(f)), [], 'код для Node — только в tools/, tests/, models/tests/');
  assert.deepEqual(files.flatMap(f => nodeProblems(f, read(f))), []);
});

// Проверка проверяющего для правил Node. Образцы собираются из частей (REQ, IMP, PROC, «…» → кавычки), чтобы этот файл
// сам не попадал под правила, которые проверяет.
test('проверка проверяющего: правила для Node ловят сеть, чужие модули и запуск программ', () => {
  const s = x => x.replace(/REQ/g, 'req' + 'uire').replace(/IMP/g, 'imp' + 'ort').replace(/PROC/g, 'pro' + 'cess').replace(/[«»]/g, "'");
  const bad = [
    ['tools/offline.js', "REQ(«node:https»).get(«https://u.example/»)"],
    ['tools/offline.js', "REQ(«https»)"],
    ['tools/offline.js', "const r = REQ; r(«node:net»)"],
    ['tools/offline.js', "IMP(«node:http»)"],
    ['tools/offline.js', "PROC.binding(«tcp_wrap»)"],
    ['tools/offline.js', "fetch(«//u.example/»)"],
    ['tools/offline.js', "const W = WebSocket"],
    ['tests/qr.test.js', "const { spawnSync } = REQ(«node:child_process»)"],
    ['tools/check.js', "const { spawnSync, exec } = REQ(«node:child_process»); exec(«x»)"],
    ['tools/check.js', "const cp = REQ(«node:child_process»); cp.spawnSync(«x»)"],
    ['tools/check.js', "const { spawnSync } = REQ(«node:child_process»); spawnSync(«msiexec», [])"],
    ['tools/check.js', "const { spawnSync } = REQ(«node:child_process»); run(«msiexec», [])"],
    ['tools/check.js', "const { spawnSync } = REQ(«node:child_process»); for (const [n, c, a] of [[«x», «schtasks», []]]) run(c, a);"],
    ['tests/offline.test.js', "REQ(«node:child_process»).execFileSync(«git», [«push»])"],
    ['tests/offline.test.js', "REQ(«node:child_process»).execFileSync(«git», [«-c», «core.quotepath=off», «ls-files», «-z»]); X(«bitsadmin»)"]
  ];
  for (const [f, line] of bad) assert.ok(nodeProblems(f, s(line)).length, 'не поймано: ' + f + ': ' + s(line));
  // Разрешённое — не ловится.
  const good = [
    ['tests/qr.test.js', "const test = REQ(«node:test»); const { ROOT } = REQ(«./load.js»);"],
    ['tools/check.js', "const { spawnSync } = REQ(«node:child_process»);\nfunction run(cmd, args) { return spawnSync(cmd, args, { cwd }); }\nrun(process.execPath, []); run(PYTHON[0], []);"],
    ['tests/offline.test.js', "REQ(«node:child_process»).execFileSync(«git», [«-c», «core.quotepath=off», «ls-files», «-z»], { cwd: ROOT })"]
  ];
  for (const [f, line] of good) assert.deepEqual(nodeProblems(f, s(line)), [], 'ложная тревога: ' + f);
});

test('ссылки наружу в текстах — только https и открываются отдельно; внутренние — по #, файлы — из docs/', () => {
  const ui = read('js/ui.js');
  assert.match(ui, /target: '_blank', rel: 'noopener noreferrer'/);
  const markup = read('js/markup.js');
  assert.ok(markup.includes(String.raw`(?:https:\/\/|#|docs\/)[^)\s]+`), 'ссылки в разметке — только https://, # или docs/');
  assert.ok(markup.includes(String.raw`const DOC_LINK = /^docs\/`), 'файл учебника — только из папки docs/');
});
