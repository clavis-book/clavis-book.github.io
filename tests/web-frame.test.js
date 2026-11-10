// Рамки веб-версии для всего кода страницы (рамки 1 и 2 проекта): ни одного обращения в сеть, никакой
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
  ['serviceWorker', 'загрузка кода (сервис-воркер — только с отдельной проверкой)'], ['eval(', 'строка как код'],
  ['new Function', 'строка как код'], ['innerHTML', 'вставка HTML'], ['outerHTML', 'вставка HTML'],
  ['insertAdjacentHTML', 'вставка HTML'], ['document.write', 'вставка HTML'], ['srcdoc', 'вставка HTML'],
  ['createContextualFragment', 'вставка HTML'], ['DOMParser', 'вставка HTML'], ['javascript:', 'код в адресе'],
  ['window.open(', 'новое окно из кода'], ['postMessage', 'обмен с другими окнами'], ['document.cookie', 'cookie'],
  ['navigator.', 'доступ к устройству'], ['setAttribute(\'on', 'обработчик строкой'], ['setAttribute("on', 'обработчик строкой'],
  ['setAttribute(\'style', 'стиль строкой'], ['.cssText', 'стиль строкой'],
  // Страница не читает файлы и не принимает вставку и перетаскивание: модели получают только ввод полигона.
  ['FileReader', 'чтение файлов'], ['showOpenFilePicker', 'чтение файлов'], ['showDirectoryPicker', 'чтение файлов'],
  ["type: 'file'", 'загрузка файлов'], ['type="file"', 'загрузка файлов'], ['dataTransfer', 'перетаскивание файлов'],
  ["'drop'", 'перетаскивание файлов'], ['ondrop', 'перетаскивание файлов'], ['clipboardData', 'вставка из буфера'],
  ["'paste'", 'вставка из буфера'], ['onpaste', 'вставка из буфера']
];
const STORAGE = ['localStorage', 'sessionStorage', 'indexedDB'];

// Элементы, которые сами что-то загружают или отправляют: страница их не создаёт.
const LOADING_TAGS = 'img|iframe|script|link|object|embed|audio|video|source|track|form|base|meta|picture|image|use';

function problems(rel, text) {
  const found = [];
  // Запрещённое ищем и в «сплющенном» тексте: без пробелов, без «?.» и с одинаковыми кавычками, —
  // чтобы пробел перед скобкой или двойные кавычки ничего не прятали.
  const flat = text.replace(/\s+/g, '').replace(/\?\./g, '.').replace(/["`]/g, "'");
  for (const [needle, why] of FORBIDDEN) {
    if (text.includes(needle) || flat.includes(needle.replace(/\s+/g, '').replace(/"/g, "'"))) found.push(rel + ': ' + needle + ' (' + why + ')');
  }
  // Код страницы и модели (не тексты содержания): из адреса страницы — только часть после #, никаких новых
  // окон, нажатий из кода, адресов через setAttribute, файлов, перетаскивания и вставки.
  if (/^(?:js|models)\//.test(rel)) {
    if (/\blocation\b(?!\.hash\b)/.test(text)) found.push(rel + ': из адреса страницы разрешён только location.hash');
    if (/(?<![\w$.])(?<!function\s+)open\s*\(|(?:window|self|globalThis|top|parent)\s*\??\.\s*open\b/.test(text)) found.push(rel + ': новое окно из кода');
    if (/\.click\s*\(/.test(text)) found.push(rel + ': нажатие из кода');
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
    "location?.assign(u)", "a.click()", "el.setAttribute('href', u)", 'el.setAttributeNS(ns, "xlink:href", u)'
  ];
  for (const line of bad) assert.ok(problems('js/proba.js', line).length, 'не поймано: ' + line);
  // Разрешённое — не ловится.
  assert.deepEqual(problems('js/proba.js', "// здесь нет сети и вставки HTML-строк\nel.replaceChildren(h('p', {}, text));\nsetTimeout(tick, 55);\nlocation.hash = 'karta';\nif (location.hash === '#x') s('line', { x1: 0 });\nfunction open(id) { return id; }\nApp.missionView.open(r.mission);"), []);
  assert.deepEqual(problems('js/ui.js', "localStorage.getItem('kilt:v1')"), []);
});

test('каждая страница: CSP без unsafe-inline и с Trusted Types, ничего внешнего, без встроенных скриптов и стилей', () => {
  const pages = htmlPages();
  assert.ok(pages.includes('index.html'));
  for (const f of pages) {
    const html = read(f);
    const csp = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
    for (const part of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "font-src 'self'", "connect-src 'none'",
      "object-src 'none'", "base-uri 'none'", "form-action 'none'", "require-trusted-types-for 'script'", "trusted-types 'none'"]) {
      assert.ok(csp.includes(part), f + ': в CSP нет ' + part);
    }
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|unsafe-hashes|https?:|data:|blob:|\*/, f + ': CSP слишком широкая');
    const body = html.replace(/<!--[\s\S]*?-->/g, '');
    assert.doesNotMatch(body, /(src|href)="(https?:)?\/\//, f + ': внешняя загрузка');
    assert.doesNotMatch(body, /<script(?![^>]*\ssrc=)[^>]*>/, f + ': встроенный скрипт');
    assert.doesNotMatch(body, /<style|\sstyle="|\son[a-z]+="/i, f + ': встроенный стиль или обработчик');
    assert.match(html, /<meta charset="utf-8">/);
    assert.match(html, /<meta name="text-scale" content="scale">/, f + ': страница должна учитывать системный размер текста');
    assert.match(html, /<meta name="referrer" content="no-referrer">/);
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

test('ссылки наружу в текстах — только https и открываются отдельно; внутренние — по #', () => {
  const ui = read('js/ui.js');
  assert.match(ui, /target: '_blank', rel: 'noopener noreferrer'/);
  const markup = read('js/markup.js');
  assert.match(markup, /https:\\\/\\\/\|#/, 'ссылки в разметке — только https:// или #');
});
