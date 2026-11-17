// Работа без интернета и установка: список файлов в sw.js, сам сервис-воркер, запуск со страницы, манифест
// и значки. Запуск из корня репозитория: node --test tests/offline.test.js
//
// Что здесь проверяется:
//  1. список в sw.js свежий (совпадает с файлами на диске) и полный: каждый файл, который нужен странице,
//     в нём есть, а лишнего — тестов, инструментов, консольной версии — нет;
//  2. сервис-воркер обращается только к своему сайту и только за файлами из списка, каждый сверяет с отпечатком;
//     чужие хранилища не трогает; на запросы мимо списка не отвечает. Проверяется и по исходному тексту, и в
//     работе — на подставных хранилище и сети, без браузера;
//  3. страница запускает его только на сайте (не из папки и не на localhost) и только файлом sw.js;
//  4. манифест и значки на месте, размеры картинок совпадают с заявленными.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { ROOT, read } = require('./load.js');
const tool = require('../tools/offline.js');

const bytes = rel => fs.readFileSync(path.join(ROOT, rel));
const sha = buf => crypto.createHash('sha256').update(buf).digest('base64');
const listed = tool.current();

// ---------- 1. Список ----------
test('список в sw.js совпадает с файлами учебника (после правки любого файла — «node tools/offline.js»)', () => {
  assert.ok(listed, 'в sw.js нет блока со списком');
  const fresh = tool.build();
  const stale = Object.keys(fresh.files).filter(f => fresh.files[f] !== listed.files[f]);
  const gone = Object.keys(listed.files).filter(f => !(f in fresh.files));
  assert.deepEqual({ изменились: stale, лишние: gone }, { изменились: [], лишние: [] },
    'список в sw.js устарел: запустите «node tools/offline.js» и добавьте sw.js в коммит');
  assert.equal(listed.version, fresh.version, 'версия в sw.js устарела: запустите «node tools/offline.js»');
  assert.match(listed.version, /^[0-9a-f]{16}$/);
});

test('в списке есть всё, что нужно странице, и нет ничего лишнего', () => {
  const files = Object.keys(listed.files);
  // Что нужно странице — считаем здесь заново, не доверяя инструменту: скрипты, стили, значки и манифест из
  // index.html, шрифты из стилей, значки из манифеста, файлы docs/, на которые ссылаются тексты.
  const html = read('index.html').replace(/<!--[\s\S]*?-->/g, '');
  const need = new Set(['index.html']);
  for (const m of html.matchAll(/\s(?:src|href)="([^"#]+)"/g)) need.add(m[1]);
  for (const css of fs.readdirSync(path.join(ROOT, 'css'))) {
    for (const m of read('css/' + css).matchAll(/url\(\s*["']?\.\.\/([^"')]+)/g)) need.add(m[1]);
  }
  for (const icon of JSON.parse(read('manifest.webmanifest')).icons) need.add(icon.src);
  const walk = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap(d => (d.isDirectory() ? walk(dir + '/' + d.name) : [dir + '/' + d.name]));
  for (const f of walk('content')) for (const m of read(f).matchAll(/\]\((docs\/[^)\s]+)\)/g)) need.add(m[1]);
  assert.ok(need.size >= 40, 'страница подключает подозрительно мало файлов: ' + need.size);
  assert.deepEqual([...need].filter(f => !files.includes(f)).sort(), [], 'нужные странице файлы, которых нет в списке');
  for (const f of files) assert.ok(fs.existsSync(path.join(ROOT, f)), 'в списке файл, которого нет: ' + f);
  // Лишнее: только то, что нужно странице, и папка docs/ (файлы для скачивания).
  assert.deepEqual(files.filter(f => !need.has(f) && !f.startsWith('docs/')), [], 'в списке файлы, которые странице не нужны');
  for (const f of files) {
    assert.doesNotMatch(f, /^(?:tests|tools|python|models\/tests|\.git)(?:\/|$)|(?:^|\/)\.|\.\.|\\|^sw\.js$|\.md$(?<!^docs\/.*)/, 'не место в списке: ' + f);
  }
});

test('всё, что нужно сайту, добавлено в git: файлы списка, sw.js и .nojekyll', t => {
  // Тесты выше смотрят на папку, а на сайт попадёт только то, что в git. Забытый файл списка — и установка
  // учебника на устройство сорвётся у всех: воркер не найдёт его на сайте.
  if (!fs.existsSync(path.join(ROOT, '.git'))) return t.skip('папка без git (например, архив)');
  const out = require('node:child_process').execFileSync('git', ['-c', 'core.quotepath=off', 'ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  const tracked = new Set(out.split('\0'));
  const missing = [...Object.keys(listed.files), 'sw.js', '.nojekyll'].filter(f => !tracked.has(f));
  assert.deepEqual(missing, [], 'этих файлов нет в git — выполните «git add» для каждого');
});

test('файлы списка одинаковы на любом компьютере: текст — с LF, остальное — двоичное', () => {
  // Отпечаток считается по байтам. Если git на другом компьютере заменит переводы строк, файл на сайте
  // перестанет совпадать с отпечатком и браузер его не примет. Поэтому для каждого расширения из списка
  // в .gitattributes записано «eol=lf» или «binary», а в самих текстовых файлах нет знака CR.
  const rules = Object.fromEntries(read('.gitattributes').split('\n').map(l => l.trim().match(/^\*(\.\w+)\s+(.+)$/)).filter(Boolean).map(m => [m[1], m[2]]));
  for (const f of Object.keys(listed.files)) {
    const rule = rules[path.extname(f)];
    assert.ok(rule, 'в .gitattributes нет правила для ' + path.extname(f) + ' (' + f + ')');
    assert.match(rule, /^(?:text eol=lf|binary)$/, f + ': нужно «text eol=lf» или «binary»');
    if (rule !== 'binary') assert.ok(!bytes(f).includes(13), f + ': в файле есть знак CR — сохраните с переводами строк LF');
  }
});

// ---------- 2. Сервис-воркер: исходный текст ----------
const SW = read('sw.js');
const swCode = SW.slice(0, SW.indexOf(tool.START)) + SW.slice(SW.indexOf(tool.END));   // без списка: там отпечатки
const TYPES_IN_SW = ' ' + (SW.match(/const TYPES = \{([\s\S]*?)\};/) || [])[1].replace(/\s+/g, ' ').replace(/, /g, ',  ');

test('в корне сайта один скрипт — sw.js; на страницу он не подключён', () => {
  assert.deepEqual(fs.readdirSync(ROOT).filter(f => /\.m?js$/.test(f)), ['sw.js']);
  assert.doesNotMatch(read('index.html'), /sw\.js/);
});

test('sw.js: к сети — два обращения, оба к своему сайту; ничего не отправляет и не исполняет чужого', () => {
  // Скачивание файла из списка — с отпечатком; запасной ответ, когда файла вдруг нет в хранилище.
  const calls = [...swCode.matchAll(/\bfetch\s*\([^\n]*/g)].map(m => m[0]);
  assert.equal(calls.length, 2, 'обращений к сети должно быть ровно два: ' + calls.join(' | '));
  assert.ok(SW.includes("await fetch(new Request(address(file), { cache: 'reload', integrity: 'sha256-' + FILES[file], credentials: 'omit', referrerPolicy: 'no-referrer' }));"),
    'скачивание — только адрес из списка, только с отпечатком, без куки и без адреса-источника');
  assert.ok(SW.includes('return answer || fetch(event.request);'), 'запасной ответ — тот же запрос страницы, без изменений');
  // Три слова разрешены ровно по одному разу и только в этих строках: заголовки своего ответа, запрос без куки,
  // отпечаток в виде base64.
  const once = (word, line) => { assert.equal(swCode.split(word).length - 1, 1, word + ' — ровно один раз'); assert.ok(SW.includes(line), word + ': строка изменилась'); };
  once('headers', "return new Response(body, { headers: { 'Content-Type': TYPES[file.split('.').pop()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' } });");
  once('credentials', "credentials: 'omit'");
  once('btoa', 'return btoa(String.fromCharCode(...sum));');
  const flat = swCode.replace(/\s+/g, '').replace(/\?\./g, '.');
  const forbidden = [
    'importScripts', 'eval(', 'newFunction', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'RTCPeerConnection',
    'postMessage', 'BroadcastChannel', 'MessageChannel', 'clients.', 'registration', 'indexedDB', 'localStorage', 'cookie',
    'navigator', 'Notification', "'push'", "'sync'", "'message'", "'notificationclick'", 'http:', 'https:', '.add(', '.addAll(',
    "method:'", 'body:', 'atob', 'import('
  ];
  assert.deepEqual(forbidden.filter(w => flat.includes(w)), []);
  // События — только три: установка, включение, запрос.
  assert.deepEqual([...swCode.matchAll(/addEventListener\(\s*'([^']+)'/g)].map(m => m[1]), ['install', 'activate', 'fetch']);
  // Адреса строятся только от папки самого sw.js.
  assert.deepEqual([...swCode.matchAll(/new URL\([^)]*\)/g)].map(m => m[0]), ["new URL('./', self.location.href)", 'new URL(file, BASE)']);
  // В списке — только относительные имена файлов и отпечатки SHA-256.
  for (const [f, hash] of Object.entries(listed.files)) {
    assert.doesNotMatch(f, /^[a-z]+:|^\/|\/\/|\.\.|[?#\\'%]/i, 'имя в списке: ' + f);
    assert.ok(TYPES_IN_SW.includes(' ' + path.extname(f).slice(1) + ': '), 'в sw.js (TYPES) нет вида содержимого для ' + f);
    assert.match(hash, /^[A-Za-z0-9+/]{43}=$/, 'отпечаток ' + f);
  }
});

// ---------- 2. Сервис-воркер: работа на подставных хранилище и сети ----------
const SITE = 'https://uchebnik.example/kl/';

// Мир для sw.js: хранилища браузера, сеть и события — простые подделки, которые всё записывают.
// served(file) — что «лежит на сайте»: байты файла или null (нет файла).
// Ответ и запись хранилища — как в браузере: содержимое и заголовки. from — пометка теста, откуда запись.
class Response {
  constructor(body, init = {}) { this.body = Buffer.from(body); this.headers = init.headers || {}; this.ok = true; this.status = 200; this.redirected = false; }
  async arrayBuffer() { return this.body; }
}
const entry = (body, from) => Object.assign(new Response(body), { from });
function world({ served = f => bytes(f), stored = {} } = {}) {
  const log = { fetched: [], skipped: false, handlers: {}, jobs: [] };
  const store = new Map(Object.entries(stored).map(([name, entries]) => [name, new Map(Object.entries(entries))]));
  const caches = {
    keys: async () => [...store.keys()],
    open: async name => {
      if (!store.has(name)) store.set(name, new Map());
      const box = store.get(name);
      return { match: async k => box.get(String(k)), put: async (k, r) => { box.set(String(k), r); }, delete: async k => box.delete(String(k)) };
    },
    delete: async name => store.delete(name)
  };
  class Request { constructor(url, init = {}) { this.url = String(url); this.method = 'GET'; Object.assign(this, init); } }
  // Как браузер: файл с отпечатком, который не совпал с содержимым, — ошибка сети.
  const fetch = async req => {
    log.fetched.push(req);
    if (!req.url.startsWith(SITE)) throw new TypeError('чужой адрес: ' + req.url);
    const body = served(decodeURIComponent(req.url.slice(SITE.length)));
    if (body === null) return { ok: false, status: 404, redirected: false };
    if (body === 'redirect') return { ok: true, status: 200, redirected: true };
    if (req.integrity && req.integrity !== 'sha256-' + sha(body)) throw new TypeError('отпечаток не совпал');
    return entry(body, 'сеть');
  };
  const self = {
    location: { href: SITE + 'sw.js' },
    addEventListener: (type, fn) => { log.handlers[type] = fn; },
    skipWaiting: async () => { log.skipped = true; }
  };
  vm.runInNewContext(SW, { self, caches, fetch, Request, Response, URL, crypto: crypto.webcrypto, btoa }, { filename: 'sw.js' });
  const fire = async type => { let job; log.handlers[type]({ waitUntil: p => { job = p; } }); await job; };
  // Запрос страницы: undefined — воркер не вмешался (браузер загрузит сам), иначе — его ответ.
  const ask = async (url, method = 'GET') => {
    let answer;
    log.handlers.fetch({ request: { url, method }, respondWith: p => { answer = p; }, waitUntil: p => { log.jobs.push(p); } });
    return answer;
  };
  return { log, store, fire, ask };
}
const cacheName = 'clavis:' + SITE + ':' + listed.version;
const oldName = 'clavis:' + SITE + ':prezhnyaya';
const keyOf = file => new URL(file, SITE).href + '?' + encodeURIComponent(listed.files[file]);
const allFiles = Object.keys(listed.files);

test('установка: скачивает каждый файл списка один раз, со своего сайта, мимо кэша браузера и с отпечатком', async () => {
  const w = world();
  await w.fire('install');
  assert.equal(w.log.fetched.length, allFiles.length);
  assert.deepEqual(w.log.fetched.map(r => decodeURIComponent(r.url.slice(SITE.length))).sort(), [...allFiles].sort());
  for (const r of w.log.fetched) {
    const file = decodeURIComponent(r.url.slice(SITE.length));
    assert.ok(r.url.startsWith(SITE), 'чужой адрес: ' + r.url);
    assert.equal(r.integrity, 'sha256-' + listed.files[file], file);
    assert.equal(r.cache, 'reload', file);
    assert.equal(r.method, 'GET');
    assert.equal(r.credentials, 'omit', file);
    assert.equal(r.referrerPolicy, 'no-referrer', file);
    assert.deepEqual(Object.keys(r).sort(), ['cache', 'credentials', 'integrity', 'method', 'referrerPolicy', 'url'], 'в запросе нет ничего лишнего');
  }
  assert.deepEqual([...w.store.keys()], [cacheName]);
  assert.deepEqual([...w.store.get(cacheName).keys()].sort(), allFiles.map(keyOf).sort());
  assert.ok(w.log.skipped, 'новая версия должна начинать работать сразу');
});

test('установка отменяется, если файл на сайте не совпал с отпечатком, пропал или пришёл с другого адреса', async () => {
  for (const [bad, why] of [[Buffer.from('подмена'), 'подменённый файл'], [null, 'файла нет'], ['redirect', 'перенаправление']]) {
    const w = world({ served: f => (f === 'js/app.js' ? bad : bytes(f)) });
    await assert.rejects(w.fire('install'), undefined, why);
    assert.equal(w.store.get(cacheName).has(keyOf('js/app.js')), false, why + ': в хранилище не попал');
    assert.equal(w.log.skipped, false, why + ': версия не должна включиться');
  }
});

test('оборванная установка продолжается с того же места: скачивается только недостающее', async () => {
  const half = allFiles.slice(0, 20);
  const w = world({ stored: { [cacheName]: Object.fromEntries(half.map(f => [keyOf(f), entry(bytes(f), 'прошлая попытка')])) } });
  await w.fire('install');
  assert.equal(w.log.fetched.length, allFiles.length - half.length);
  assert.equal(w.store.get(cacheName).size, allFiles.length);
});

test('обновление: неизменившиеся файлы берутся из прежнего хранилища, прежнее удаляется, чужие не трогаются', async () => {
  const changed = ['index.html', 'content/ru/r11-prosto.js'];
  const old = Object.fromEntries(allFiles.filter(f => !changed.includes(f)).map(f => [keyOf(f), entry(bytes(f), 'прежняя версия')]));
  // У изменившихся файлов в прежнем хранилище другой отпечаток — значит, и другое имя.
  for (const f of changed) old[new URL(f, SITE).href + '?' + encodeURIComponent('прежний-отпечаток=')] = entry('старое', 'прежняя версия');
  // Рядом — чужое хранилище и хранилище второй копии учебника из соседней папки того же сайта: их не трогаем.
  const neighbour = 'clavis:https://uchebnik.example/kl-chernovik/:1';
  const w = world({ stored: { [oldName]: old, 'drugoy-proekt:1': { x: entry('чужое') }, [neighbour]: { x: entry('соседнее') } } });
  await w.fire('install');
  assert.deepEqual(w.log.fetched.map(r => r.url.slice(SITE.length)).sort(), [...changed].sort(), 'скачаны только изменившиеся файлы');
  const fresh = w.store.get(cacheName);
  assert.equal(fresh.size, allFiles.length);
  for (const f of allFiles) assert.deepEqual(fresh.get(keyOf(f)).body, bytes(f), f);
  assert.ok(w.store.has(oldName), 'до включения новой версии прежняя ещё работает');
  await w.fire('activate');
  assert.deepEqual([...w.store.keys()].sort(), ['drugoy-proekt:1', neighbour, cacheName].sort(), 'удаляются только свои прежние хранилища');
});

test('запросы: файл учебника — из хранилища; всё остальное воркер не трогает', async () => {
  const w = world();
  await w.fire('install');
  const before = w.log.fetched.length;
  const doc = allFiles.find(f => f.startsWith('docs/') && /[а-яё]/i.test(f));
  assert.ok(doc, 'в списке должен быть файл с русским именем (проверка адресов с кириллицей)');
  for (const [url, file] of [[SITE, 'index.html'], [SITE + 'index.html', 'index.html'], [SITE + '?x=1', 'index.html'],
    [SITE + 'index.html?source=pwa#karta', 'index.html'], [SITE + 'js/app.js', 'js/app.js'], [SITE + 'fonts/Lora.ttf', 'fonts/Lora.ttf'],
    [new URL(doc, SITE).href, doc]]) {
    const answer = await w.ask(url);
    assert.ok(answer, 'нет ответа на ' + url);
    assert.deepEqual(answer.body, bytes(file), url);
    assert.equal(answer.headers['X-Content-Type-Options'], 'nosniff', url);
    assert.match(answer.headers['Content-Type'], /^[a-z]+\/[a-z0-9.+-]+(; charset=utf-8)?$/, url);
  }
  assert.equal(w.log.fetched.length, before, 'ответы из хранилища не должны ходить в сеть');
  // Мимо списка, чужой сайт, не GET, испорченный адрес — воркер не отвечает, браузер работает как без него.
  for (const [url, method] of [[SITE + 'sw.js'], [SITE + 'tests/load.js'], [SITE + 'python/main.py'], [SITE + 'README.md'],
    [SITE + 'js/'], [SITE + 'js/app.js/x'], [SITE + 'js%2Fapp.js'], [SITE + 'js%5capp.js'], [SITE + 'JS/APP.JS'], [SITE + '%E0%A4%A'], [SITE + 'constructor'], [SITE + 'toString'],
    ['https://uchebnik.example/drugoe/index.html'], ['https://uchebnik.example/kl'], ['https://drugoy.example/kl/index.html'],
    ['http://uchebnik.example/kl/index.html'], [SITE + 'index.html', 'POST'], [SITE + 'js/app.js', 'HEAD']]) {
    assert.equal(await w.ask(url, method), undefined, 'воркер ответил на ' + (method || 'GET') + ' ' + url);
  }
  assert.equal(w.log.fetched.length, before);
});

test('хранилище пропало: файл скачивается заново с отпечатком, и вся копия восстанавливается', async () => {
  const w = world();                                   // воркер работает, а хранилища нет: его стёр браузер или сосед
  const answer = await w.ask(SITE + 'css/base.css');
  assert.deepEqual(answer.body, bytes('css/base.css'));
  assert.equal(w.log.fetched[0].integrity, 'sha256-' + listed.files['css/base.css'], 'и запасной путь — с отпечатком');
  await w.ask(SITE + 'js/app.js');                     // второй запрос, пока копия восстанавливается
  await Promise.all(w.log.jobs);
  assert.equal(w.store.get(cacheName).size, allFiles.length, 'копия собрана целиком');
  assert.ok(w.log.fetched.length <= allFiles.length + 2, 'каждый файл скачан по одному разу (плюс два первых запроса)');
});

test('нет ни копии, ни связи: запрос уходит на сайт тем же объектом, каким пришёл', async () => {
  const w = world({ served: () => null });
  const request = { url: SITE + 'css/base.css', method: 'GET' };
  let answer;
  w.log.handlers.fetch({ request, respondWith: p => { answer = p; }, waitUntil: p => { w.log.jobs.push(p); } });
  assert.equal((await answer).ok, false);
  assert.equal(w.log.fetched.at(-1), request);
});

test('запись с верным именем и чужим содержимым не принимается нигде: ни при ответе, ни при установке, ни при переносе', async () => {
  // Хранилище браузера общее для всех проектов сайта: имя записи можно вычислить из sw.js и подложить своё.
  const fake = () => entry('подмена: чужой код', 'подложено');
  // 1. Ответ странице: подмена не отдаётся, файл скачивается заново.
  const w1 = world();
  await w1.fire('install');
  w1.store.get(cacheName).set(keyOf('js/app.js'), fake());
  assert.deepEqual((await w1.ask(SITE + 'js/app.js')).body, bytes('js/app.js'));
  await Promise.all(w1.log.jobs);
  assert.deepEqual(w1.store.get(cacheName).get(keyOf('js/app.js')).body, bytes('js/app.js'), 'запись заменена настоящей');
  // 2. Установка поверх заготовки в хранилище этой версии и 3. перенос из «прежнего» хранилища.
  for (const name of [cacheName, oldName]) {
    const w = world({ stored: { [name]: { [keyOf('index.html')]: fake() } } });
    await w.fire('install');
    assert.deepEqual(w.store.get(cacheName).get(keyOf('index.html')).body, bytes('index.html'), name);
    assert.ok(w.log.fetched.some(r => r.url === SITE + 'index.html'), name + ': настоящий файл скачан с сайта');
  }
  // 4. Подмена есть, а связи нет: лучше ошибка, чем чужой код.
  const w4 = world({ served: () => null, stored: { [cacheName]: { [keyOf('js/app.js')]: fake() } } });
  assert.equal((await w4.ask(SITE + 'js/app.js')).ok, false);
});

// ---------- 3. Запуск со страницы (js/offline.js) ----------
// Страница-подделка: адрес, навигатор и окно — ровно то, что читает js/offline.js.
function pageWorld({ href, sw = true, tt = true, active = false, controlled = false }) {
  const log = { registered: [], policies: [], states: [] };
  const listeners = {}, swListeners = {};
  const worker = { state: 'installing', on: {}, addEventListener(type, fn) { this.on[type] = fn; } };
  const u = new URL(href);
  const serviceWorker = {
    controller: controlled ? {} : null,
    register: url => { log.registered.push(url); return Promise.resolve(active ? { active: {} } : { installing: worker }); },
    addEventListener: (type, fn) => { swListeners[type] = fn; }
  };
  const App = {};
  const window = {
    App,
    trustedTypes: tt ? { createPolicy: (name, rules) => { log.policies.push({ name, rules: Object.keys(rules) }); return { createScriptURL: s => ({ trusted: rules.createScriptURL(s) }) }; } } : undefined,
    addEventListener: (type, fn) => { listeners[type] = fn; },
    matchMedia: () => ({ matches: false })
  };
  vm.runInNewContext(read('js/offline.js'), { window, navigator: sw ? { serviceWorker } : {}, location: { protocol: u.protocol, hostname: u.hostname } }, { filename: 'js/offline.js' });
  App.offline.onChange = () => log.states.push(App.offline.state);
  return { App, log, worker, listeners, swListeners };
}
const tick = () => new Promise(r => setImmediate(r));

test('страница запускает сервис-воркер только на сайте: не из папки и не на своём компьютере', async () => {
  const local = ['file:///C:/uchebnik/index.html', 'http://localhost:8771/', 'http://' + [127, 0, 0, 1].join('.') + ':8771/', 'http://[::1]:8771/'];
  for (const href of local) {
    const p = pageWorld({ href });
    await tick();
    assert.deepEqual(p.log.registered, [], href);
    assert.deepEqual(p.log.policies, [], href + ': политика не создаётся');
    assert.equal(p.App.offline.state, 'none');
  }
  const none = pageWorld({ href: 'https://uchebnik.example/kl/', sw: false });
  await tick();
  assert.equal(none.App.offline.state, 'none', 'браузер без сервис-воркеров: учебник — обычный сайт');
});

test('на сайте: запускается именно sw.js, политика Trusted Types одна и выдаёт только его адрес', async () => {
  const p = pageWorld({ href: 'https://uchebnik.example/kl/#karta' });
  await tick();
  assert.deepEqual(p.log.policies, [{ name: 'clavis-offline', rules: ['createScriptURL'] }]);
  assert.deepEqual(p.log.registered, [{ trusted: 'sw.js' }]);
  const plain = pageWorld({ href: 'https://uchebnik.example/kl/', tt: false });
  await tick();
  assert.deepEqual(plain.log.registered, ['sw.js'], 'браузер без Trusted Types');
  // Состояния для блока «Учебник на этом устройстве».
  assert.deepEqual(p.log.states, ['saving']);
  p.worker.state = 'activated'; p.worker.on.statechange();
  assert.deepEqual(p.log.states, ['saving', 'ready']);
  const failed = pageWorld({ href: 'https://uchebnik.example/kl/' });
  await tick();
  failed.worker.state = 'redundant'; failed.worker.on.statechange();
  assert.equal(failed.App.offline.state, 'none', 'установка не удалась — блок не обещает работу без интернета');
});

test('новая версия: страница узнаёт о ней один раз и больше состояние не меняет; первая установка — не «новая версия»', async () => {
  const p = pageWorld({ href: 'https://uchebnik.example/kl/', active: true, controlled: true });
  await tick();
  assert.equal(p.App.offline.state, 'ready');
  p.swListeners.controllerchange();
  assert.equal(p.App.offline.state, 'updated');
  const first = pageWorld({ href: 'https://uchebnik.example/kl/' });
  await tick();
  first.swListeners.controllerchange();
  assert.equal(first.App.offline.state, 'saving', 'страницу впервые взял под управление воркер — это не обновление');
});

test('кнопка установки: появляется по событию браузера и показывает его окно один раз', () => {
  const p = pageWorld({ href: 'https://uchebnik.example/kl/' });
  let prevented = 0, shown = 0;
  assert.equal(p.App.offline.prompt, null);
  p.listeners.beforeinstallprompt({ preventDefault: () => { prevented++; }, prompt: () => { shown++; } });
  assert.ok(p.App.offline.prompt && prevented === 1);
  p.App.offline.install(); p.App.offline.install();
  assert.equal(shown, 1);
  assert.equal(p.App.offline.prompt, null);
});

// ---------- 4. Манифест и значки ----------
// Размер картинки PNG записан в её заголовке: ширина и высота — по 4 байта с 16-го.
const pngSize = rel => { const b = bytes(rel); assert.equal(b.toString('latin1', 1, 4), 'PNG', rel + ' — не PNG'); return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20); };

test('манифест: название, запуск в своём окне из папки сайта, значки всех нужных размеров', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.name, 'Clavis');
  assert.ok(m.short_name.length <= 12, 'короткое название — до 12 знаков, иначе под значком оно обрежется');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, 'index.html');
  assert.equal(m.scope, './');
  assert.equal(m.lang, 'ru');
  for (const icon of m.icons) {
    assert.doesNotMatch(icon.src, /^[a-z]+:|^\/|\.\./i, 'значок — только из папки учебника: ' + icon.src);
    if (icon.type === 'image/png') assert.equal(pngSize(icon.src), icon.sizes, icon.src);
    else { assert.equal(icon.type, 'image/svg+xml'); assert.match(read(icon.src), /<svg[^>]+viewBox="0 0 512 512"/); }
  }
  const has = (size, purpose) => m.icons.some(i => i.sizes === size && i.purpose === purpose);
  assert.ok(has('192x192', 'any') && has('512x512', 'any') && has('512x512', 'maskable'), 'нужны значки 192 и 512 и «маскируемый» 512');
  // Цвета окна совпадают со светлой темой учебника (css/base.css).
  const css = read('css/base.css');
  assert.ok(css.includes('--paper: ' + m.background_color) && css.includes('--sheet: ' + m.theme_color), 'цвета манифеста — из палитры учебника');
});

test('значки: в картинке SVG нет ни скриптов, ни ссылок наружу; страница подключает манифест и значок для iPhone', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'icons')).filter(f => f.endsWith('.svg'))) {
    const svg = read('icons/' + f);
    assert.doesNotMatch(svg, /<script|<foreignObject|\son\w+=|javascript:|<image|<use[^>]+href="(?!#)|@import|url\(\s*["']?(?!#)/i, 'icons/' + f);
    // Белый список: в значке — только фигуры. Чего здесь нет (ссылки, анимация, стили, текст), то не пройдёт.
    const tags = [...new Set([...svg.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<([a-zA-Z][\w:-]*)/g)].map(m => m[1]))];
    const SHAPES = ['svg', 'defs', 'clipPath', 'pattern', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polygon', 'polyline'];
    assert.deepEqual(tags.filter(tag => !SHAPES.includes(tag)), [], 'icons/' + f + ': лишние элементы');
    assert.doesNotMatch(svg, /\bhref\s*=/i, 'icons/' + f + ': ссылок в значке нет');
    assert.deepEqual([...svg.matchAll(/https?:\/\/[^"'\s<>]+/g)].map(m => m[0]).filter(u => u !== 'http://www.w3.org/2000/svg'), [], 'icons/' + f + ': адреса');
  }
  const html = read('index.html');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/);
  assert.equal(pngSize('icons/apple-touch-icon.png'), '180x180');
  assert.match(html, /<link rel="icon" href="icons\/icon\.svg" type="image\/svg\+xml">/);
});
