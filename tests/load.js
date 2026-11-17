// Загрузка учебника для тестов — так же, как на странице: скрипты из index.html подряд, в одном окружении.
// Как в браузере, файл с ошибкой просто не выполняется, а остальные загружаются. Части страницы, которым
// нужен настоящий документ (js/ui.js, js/interactives.js, js/mission.js, js/offline.js, js/app.js), здесь не запускаются.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const PAGE_ONLY = ['js/ui.js', 'js/interactives.js', 'js/mission.js', 'js/offline.js', 'js/settings.js', 'js/app.js'];
const pageScripts = (html = 'index.html') => [...read(html).matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);

// replace — подмена текста отдельных файлов: { 'content/ru/r11-prosto.js': 'новый текст' }.
function loadApp(replace) {
  const ctx = { console };
  ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  const errors = [];
  for (const rel of pageScripts().filter(s => !PAGE_ONLY.includes(s))) {
    ctx.document = { currentScript: { src: 'file:///C:/kl/' + rel } };
    const text = (replace && rel in replace) ? replace[rel] : read(rel);
    try { vm.runInContext(text, ctx, { filename: rel }); } catch (e) { errors.push(rel + ': ' + e.message); }
  }
  delete ctx.document;
  const App = ctx.App;
  App.NonceReuse = vm.runInContext('typeof NonceReuse === "undefined" ? null : NonceReuse', ctx);
  App.loadErrors = errors;
  return App;
}
// Значения из окружения vm сравниваем после копирования в наше.
const local = x => JSON.parse(JSON.stringify(x));

module.exports = { ROOT, read, loadApp, local, pageScripts, PAGE_ONLY };
