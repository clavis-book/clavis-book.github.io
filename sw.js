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
const VERSION = '63807306faf812c4';
const FILES = {
  'content/ekzamen.js': 'uaClcJayDjd/8MEwJl2ePwZSaekqiKz/nvkrMgEIVOY=',
  'content/kk/r11-prosto.js': 'qWo4kHlty/pN7I/FmY2xAJjd7NzuiXYUF92l93j0TD0=',
  'content/missions/r11-m01/byuro.js': 'YZUGzdHNSUtfcfo8g6FGH7rddLBs2MDM/sNYeQ67giI=',
  'content/missions/r11-m01/common.js': 'c1aiTzJs6je/t5VDjAM3iEQDtjvoDkN5c6/+sL1cV+0=',
  'content/ru/r11-doma.js': 'mhb3e5vuKRb1z8EJWFcFbvwSL1XCZJA/135Kl5mPHLQ=',
  'content/ru/r11-poprobuy.js': 'FKD7/RSAXymcASori0xfULuYJ306ARr7zsasFh7DZ0k=',
  'content/ru/r11-prepod.js': 'oT3idH34mAlZmGEcRfmAn5j5PU4dqsxF0Xe66qNofxc=',
  'content/ru/r11-prosto.js': 'f2nDDEL2PlZ2WJx9pFhpHUUARBXKRo/u4SMmtipltbk=',
  'content/ru/r11-proverka.js': 'GzlcE5yly5vV6UG78bYYGq92eNCKZ8kqZ0siheeiGow=',
  'content/ru/r13-poprobuy.js': 'UgboHgpz6QdcXmC11M3sHOiuCfAlb0gHxLJDevfYviw=',
  'content/ru/r13-prosto.js': 'HTOQZCXoYNW379lgC0+dSkmIOrJMVR3qp7QzRpjSCR8=',
  'content/ru/r13-proverka.js': 'hu4nCLpmZwpsG3X+Apf3jyotCuRurJr9f1fmnFyUemk=',
  'content/sections.js': 'm87psLJB/dMAjK+NffHEzF8qBNJuPS/6wM3w9fupL0U=',
  'content/ui/en.js': 'Fy1cvaQR3mWoEUTEcHqSe7B+RxioqIbM9yGyGVmdi24=',
  'content/ui/kk.js': 'lv4JW7AtZnmltNgjTeVM1j+2Es9pscDa6rNrJ4dH8z4=',
  'content/ui/ru.js': 'WbxiF8QHqE4nxnfrQUo1eArcE1l7t/N6nf91gRR5T6M=',
  'css/base.css': 'bxRodxUZumOKpi+NaerGQ17YxYmjQKOYPRY+sC2qIC0=',
  'css/mission.css': '6+g8Y53rkSeXtxc2CD8n+5uYHTx7+Rb2205aqfLL7jg=',
  'data/sources.js': 'W0e+1pZ0wK3Ds7Kx1SqecTmG3KnbbrSPvVXpL0f107Q=',
  'docs/lab/Лабораторная_WiFi.docx': '0T7BbzogByKhU5B/NbrcMUxA0O73DZJ/6T2hiFyRgj4=',
  'docs/lab/Лабораторная_WiFi.md': 'HHHBMulzCHbJcK78ecFBJsWUH1382jHc8NjY1YfSR6Q=',
  'fonts/Lora-Italic.ttf': 'ItjYhUtTgHqmZMo08gMantV6HQ3qKWuLls3Tqtk3orM=',
  'fonts/Lora.ttf': 'gipmIcy+jZfSCsiMHEH1YVycLCAuqnXycs1FKqxkdac=',
  'fonts/PTMono-Regular.ttf': 'y+cys7j9IR/Zhuvfybhw3eyk+qsLtUJfxQmzf5tKyAQ=',
  'fonts/PTSans-Bold.ttf': 'MSi9Xs8BgW5Zoj1UxXp6axRhWwfbU/8nfHc3YBAmWwU=',
  'fonts/PTSans-Regular.ttf': 'nMgxSQUyAJuuKzzg05xirfyIkGC+tCFZO/2dI5bQ8Qo=',
  'icons/apple-touch-icon.png': 'B0K4X0HKGtGs6dsH6VywdRluTwJoRSw4aIgy83mV3po=',
  'icons/icon-192.png': '07tk0KEQ10GkBVzYlXcAkRuCdDg1ErvgIpOQiUh3UpM=',
  'icons/icon-512.png': 'pY7auwxsbkmHxyR7w9IkzE5RWzuLqCIB8mW9Yut7LBY=',
  'icons/icon-dark.svg': 'mqNNccfjiXjuGlwp9MQ5dNrvvNStzr/kb5axo5gXBKQ=',
  'icons/icon.svg': 'ODfbHMHf/K7hOxjSQHqLwo0nlZ/yEsmvscYwb50MAdY=',
  'icons/maskable-512.png': '1Kl5epjrMcWpPS/w5aVS6g5AiV4kBglWNDrUuvL7wzg=',
  'index.html': 'UvguWR/u514VV1WKImerToQRgatY31gi0Dth9Bq5RTc=',
  'js/app.js': 'KoSAcyUvW8UdlOCEi/W1RqBh1qwyyCHvrRi3+i/h6mc=',
  'js/content-model.js': 'ATZ6XVd3Oh9Ot8qBiSfFqz5oQqXcUd1/bMF8NXvTLGk=',
  'js/interactives.js': 'aTZQKIYACrPN8nR2et41t4ZEzr8NWo0yEI+9f67DjNI=',
  'js/markup.js': 'qmzLcHccvttFAko1XukJe4w3F3veSVlweoFw+dW8YbI=',
  'js/mission-text.js': 'kO5DirKTKWkHQLBugBDl2ttDrzmiY8bmA45DJ6Tcj7E=',
  'js/mission.js': 'rXX7pD7NIPw7O4kNGB1ObwXFqx2jVsoJ2dlpmdT642s=',
  'js/offline.js': 'GoXw4PrxMy9TyGp/53rcKo0+DKywmWLNnbFpLwBziY0=',
  'js/qr.js': 'hXEBpldJg4ptFrImc/NV5JvpUcoZ/+I5Yo+0wEhcVrA=',
  'js/settings.js': 'tRLDBGZGMt1awah1rK/rTafaCo+4qAMGK7PpJDcN7+I=',
  'js/store.js': 'yVVH9RuGT7ldVlFlQN/UdkTMicPIRI/w3oFdTADjIB4=',
  'js/ui.js': 'AkwZjmmKx4QSE4UXM0z3QtEqCFVOv+GyP06veZZGdeE=',
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
