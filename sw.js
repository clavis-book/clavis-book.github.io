// Сервис-воркер учебника Clavis: хранит на устройстве копию учебника, чтобы он открывался без
// интернета. Работает только на сайте (https); когда учебник открыт из папки двойным щелчком, он не нужен
// и не запускается.
//
// Что он делает — и только это:
//  1. при установке кладёт в хранилище браузера все файлы учебника из списка FILES. Файл берётся с этого же
//     сайта, и браузер сверяет его с отпечатком из списка: другой файл он не примет;
//  2. на запрос страницы отвечает файлом из хранилища, каждый раз сверяя его с отпечатком; чего в списке
//     нет — браузер загружает как обычно;
//  3. когда выходит новая версия (меняется VERSION), собирает новое хранилище — скачивает только изменившиеся
//     файлы, остальные переносит из прежнего — и удаляет прежнее.
// К другим сайтам не обращается, ничего никуда не отправляет, прогресса и ответов студента не видит и не хранит.
// Список и версию пишет команда «node tools/offline.js»; тесты — tests/offline.test.js.
'use strict';

// ---- список файлов (пишет tools/offline.js; руками не править) ----
const VERSION = '058fa94eb9308433';
const FILES = {
  'content/ekzamen.js': 'uaClcJayDjd/8MEwJl2ePwZSaekqiKz/nvkrMgEIVOY=',
  'content/kk/r11-prosto.js': 'Csm8iakbRK0mc0Z3wCtuOuRFnKY6a8va20tg2x0iSPQ=',
  'content/missions/r11-m01/byuro.js': 'CVNhAuJvoHkFr4soy6Aody3UtjKpWfNm3xc4L2zpuOs=',
  'content/missions/r11-m01/common.js': 'DKAKkc5w3zSGwwubGNnzef4NmR9LUjr/n+7egXemUjg=',
  'content/ru/r11-doma.js': 'bqdUSiFskVmtIyedb1WSVIFy57SFuitNOh66mHw6FXU=',
  'content/ru/r11-poprobuy.js': 'XJckqzvbER2EljYiM+pmKPm5uQWiIYQN4GitvaKoCso=',
  'content/ru/r11-prepod.js': '3IcXq15Wrn++N8v+hcEOY5ZGc4cVSbOUoA8Zq3Gyjjw=',
  'content/ru/r11-prosto.js': 'ZSEhxGiziXgWIAsueWNLCYS2HV8ARetI8mnstRM86Z4=',
  'content/ru/r11-proverka.js': 'T3goyhTbkC19vNIv/QBV9679orNokv4wjD50xuKGG08=',
  'content/ru/r13-poprobuy.js': 'T09ewSHKqn0Ie33Q7NF5uW1eVY5CzXxKH6EYWcfrXW8=',
  'content/ru/r13-prosto.js': 'h+3HWLjyuULddfadUrzH50jEcrbxFs0Fc44zp9RamfQ=',
  'content/ru/r13-proverka.js': 'FhGFtyraIzYBLW1njyU1inMmc2JvZc965VZj87sgXBA=',
  'content/sections.js': '4vbYtTWrpcbk9P8uJnmeuF5W1+empCr7iiSuLhLcdh8=',
  'content/ui/en.js': '9eQ3smqCSifYUz1Q25Zr9vWAc60gscpzoF1L5pJLxRE=',
  'content/ui/kk.js': 'yuwipj2anCTNMz0IE/3KSlVA5aF2u26BOIBqfh9qd4Q=',
  'content/ui/ru.js': 'fhnH+Skm7f1dbOEdMLPEiZ36tYwb4sqWHSRiAMMIZHU=',
  'css/base.css': 'JmfcYF4gw+4Lu5jCq9lgwCIQ/vrKQcCDiV8H8m0ihJo=',
  'css/mission.css': '6+g8Y53rkSeXtxc2CD8n+5uYHTx7+Rb2205aqfLL7jg=',
  'data/sources.js': 'ZnnNEE3gC0gOJqxDEzf9MgedBbM6wNlQO+U/puQWrDA=',
  'docs/lab/Лабораторная_WiFi.docx': '0T7BbzogByKhU5B/NbrcMUxA0O73DZJ/6T2hiFyRgj4=',
  'docs/lab/Лабораторная_WiFi.md': 'HHHBMulzCHbJcK78ecFBJsWUH1382jHc8NjY1YfSR6Q=',
  'fonts/Lora-Italic.ttf': 'ItjYhUtTgHqmZMo08gMantV6HQ3qKWuLls3Tqtk3orM=',
  'fonts/Lora.ttf': 'gipmIcy+jZfSCsiMHEH1YVycLCAuqnXycs1FKqxkdac=',
  'fonts/PTMono-Regular.ttf': 'y+cys7j9IR/Zhuvfybhw3eyk+qsLtUJfxQmzf5tKyAQ=',
  'fonts/PTSans-Bold.ttf': 'MSi9Xs8BgW5Zoj1UxXp6axRhWwfbU/8nfHc3YBAmWwU=',
  'fonts/PTSans-Regular.ttf': 'nMgxSQUyAJuuKzzg05xirfyIkGC+tCFZO/2dI5bQ8Qo=',
  'icons/apple-touch-icon.png': 'NgL5DLhn4Cf9EzLOW5x2F5XaNSF2apNdHEOtVepe7hY=',
  'icons/icon-192.png': 'TavP6LJqKLfpgZ1bp6JzWerZ4b5PIEBZbYcImRfThTk=',
  'icons/icon-512.png': '0Bh+V0l6yW3ZNDoyDmeSMpw2rvBosDM/KR2OCpSkLYE=',
  'icons/icon-dark.svg': 'Q5ckDq5eOO0Sd2D2OeDTRMCF+FhG/ZAaRGU9AmWXXnc=',
  'icons/icon.svg': '5D+UJ/TjmKHYY7gib4NG92peUojEfnoG704ZdDHAQ1g=',
  'icons/maskable-512.png': 'j7NPdNu/B6/kGZY3CaW+X40fY5o1JrKrKxcVmvDYmmk=',
  'index.html': 'gBxXMLK5vB+q3M6/KmWtBtBoy2SJy7lm1USwBPmW32s=',
  'js/app.js': 'mWkRHgFu0MIJ8QhC8lJVuf/CC2x2q7adxRs3JJKizIw=',
  'js/content-model.js': 'jb83PmAXASiH9V/5QOyyJyPPWzo3elc/zZzbJ0f2obM=',
  'js/interactives.js': 'kK2Jymga87x20t5+qFNWottk/iVLyp7Vn/eJ34/O3Ss=',
  'js/markup.js': 'Q80Q1MYAkXRJOYMd0Pnu1N6DZsGGflOenNL7Q1Gk21o=',
  'js/mission-text.js': 'zk/LyGdDDs5QWiKL2vQl5BUSXKZh1u/ZVT1vG7PQzh0=',
  'js/mission.js': 'EGTGU3OGhiqpyftanvz3Amoo3H2LcMP+a/kvNgy22yU=',
  'js/offline.js': 'GoXw4PrxMy9TyGp/53rcKo0+DKywmWLNnbFpLwBziY0=',
  'js/qr.js': 'hXEBpldJg4ptFrImc/NV5JvpUcoZ/+I5Yo+0wEhcVrA=',
  'js/store.js': 'ttZTyvczm/EuJXV0dnqAftEbHouIModh2GXvML5Rpo0=',
  'js/ui.js': 'Pkj71im+R4Vc1jv+LkEVcDwsrzr/fSbh4arcq3AOkOA=',
  'manifest.webmanifest': 'IvoyqleuanSnoQiZceQh8M2jtyJRlWaFvMzqCgLW5ns=',
  'models/nonce-reuse.js': '+r6p61y24VlFpjRoC86m3yde1yvlNwfvett6xDGqMZw='
};
// ---- конец списка ----

// По одному адресу сайта могут жить и другие проекты — и даже вторая копия учебника в соседней папке. Поэтому
// в имени наших хранилищ стоит адрес папки учебника: чужие хранилища мы не трогаем.
const BASE = new URL('./', self.location.href).href;                         // папка учебника на сайте
const PREFIX = 'clavis:' + BASE + ':';
const CACHE = PREFIX + VERSION;
const address = file => new URL(file, BASE).href;                            // полный адрес файла учебника
const key = file => address(file) + '?' + encodeURIComponent(FILES[file]);   // имя файла в хранилище: адрес и отпечаток
const ownCaches = () => caches.keys().then(names => names.filter(name => name.startsWith(PREFIX)));
// Вид содержимого по расширению файла: заголовки ответа воркер пишет сам (см. saved).
const TYPES = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', ttf: 'font/ttf', webmanifest: 'application/manifest+json',
  md: 'text/markdown; charset=utf-8', txt: 'text/plain; charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

// Какой файл учебника просит страница. null — запрос не к учебнику или такого файла нет в списке.
function fileOf(request) {
  if (request.method !== 'GET' || !request.url.startsWith(BASE)) return null;
  const asked = request.url.slice(BASE.length).split(/[?#]/)[0];
  if (/%2f|%5c/i.test(asked)) return null;                                   // закодированная косая черта — не наш адрес
  let file;
  try { file = decodeURIComponent(asked); } catch (e) { return null; }
  if (file === '') file = 'index.html';                                      // адрес папки — это главная страница
  return Object.prototype.hasOwnProperty.call(FILES, file) ? file : null;
}

// Отпечаток содержимого: SHA-256 в том же виде, что в списке.
async function fingerprint(body) {
  const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', body));
  return btoa(String.fromCharCode(...sum));
}

// Файл из хранилища. Хранилище браузера общее для всех проектов по адресу сайта, и положить в него запись мог
// не только этот воркер. Поэтому на слово хранилищу не верим: содержимое сверяется с отпечатком при каждом
// чтении, а заголовки ответа воркер пишет сам. Не совпало — запись удаляется, будто её и не было.
async function saved(cache, file) {
  const entry = await cache.match(key(file));
  if (!entry) return null;
  const body = await entry.arrayBuffer();
  if (await fingerprint(body) !== FILES[file]) { await cache.delete(key(file)); return null; }
  return new Response(body, { headers: { 'Content-Type': TYPES[file.split('.').pop()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' } });
}

// Файл с сайта. integrity — браузер сверит скачанное с отпечатком и другой файл не примет; cache: 'reload' —
// мимо обычного кэша браузера, чтобы не получить вчерашний файл; без куки и без адреса-источника.
async function download(file) {
  const response = await fetch(new Request(address(file), { cache: 'reload', integrity: 'sha256-' + FILES[file], credentials: 'omit', referrerPolicy: 'no-referrer' }));
  if (!response.ok || response.redirected) throw new Error('не удалось скачать ' + file);
  return response;
}

// Собрать хранилище этой версии целиком: чего в нём ещё нет — взять из прежних хранилищ (older; файл с тем же
// отпечатком не изменился) или скачать с сайта.
async function fill(older) {
  const cache = await caches.open(CACHE);
  await Promise.all(Object.keys(FILES).map(async file => {
    if (await saved(cache, file)) return;                                    // уже лежит: прошлая попытка оборвалась
    for (const name of older) {
      const copy = await saved(await caches.open(name), file);
      if (copy) return cache.put(key(file), copy);
    }
    await cache.put(key(file), await download(file));
  }));
}

// Установка. Не получилось (нет связи, файл не совпал с отпечатком) — установка отменяется, работает прежняя
// версия, а при следующем заходе браузер попробует снова. Получилось — новая версия начинает работать сразу,
// не дожидаясь, пока закроют все вкладки. Если в эту секунду страница ещё загружается, часть её файлов придёт
// из прежней версии, часть из новой; страница покажет «вышла новая версия», и следующее открытие всё выровняет.
self.addEventListener('install', event => event.waitUntil((async () => {
  await fill((await ownCaches()).filter(name => name !== CACHE));
  await self.skipWaiting();
})()));

// Новая версия заработала — хранилища прежних версий больше не нужны.
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await ownCaches()) if (name !== CACHE) await caches.delete(name);
})()));

// Запрос страницы: файл учебника — из хранилища. Если его там нет (хранилище стёр браузер или другой проект
// этого сайта, запись оказалась чужой), воркер скачивает файл заново — с той же сверкой отпечатка — и заодно
// восстанавливает всю копию. Нет связи — запрос уходит на сайт как обычно.
let repair = null;
self.addEventListener('fetch', event => {
  const file = fileOf(event.request);
  if (!file) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    let answer = await saved(cache, file);
    if (!answer) {
      try {
        await cache.put(key(file), await download(file));
        answer = await saved(cache, file);
        if (!repair) repair = fill([]).catch(() => {}).then(() => { repair = null; });
        event.waitUntil(repair);
      } catch (e) { /* не скачалось: ниже — обычный запрос */ }
    }
    return answer || fetch(event.request);
  })());
});
