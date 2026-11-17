// Список файлов учебника для работы без интернета. Сервис-воркер (sw.js) сохраняет на устройстве ровно
// эти файлы; у каждого — отпечаток содержимого (SHA-256), у списка целиком — версия.
// Запуск из корня репозитория:
//   node tools/offline.js          — обновить список в sw.js (после любой правки файлов учебника)
//   node tools/offline.js --check  — только сверить, ничего не менять
// Что входит в список, решает сама страница, а не человек: страницы .html в корне, всё, что они подключают
// (скрипты, стили, манифест, значки), шрифты из стилей, значки из манифеста и файлы папки docs/, на которые
// ссылаются тексты. Тесты, инструменты, консольная версия и этот файл в список не входят.
// Зачем отпечатки: браузер студента не примет файл, если тот не совпал с отпечатком (обрыв связи, подмена),
// а при обновлении скачает только изменившиеся файлы. Изменился любой файл — меняется версия, и по ней
// браузер узнаёт, что учебник обновился. Список не обновлён — тест tests/offline.test.js это скажет.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const SW = 'sw.js';
const START = '// ---- список файлов (пишет tools/offline.js; руками не править) ----';
const END = '// ---- конец списка ----';

const bytes = rel => fs.readFileSync(path.join(ROOT, rel));
const text = rel => bytes(rel).toString('utf8');
// Адрес из файла (стиля, манифеста) относительно папки этого файла: css/base.css + ../fonts/Lora.ttf → fonts/Lora.ttf.
const near = (file, ref) => path.posix.normalize(path.posix.join(path.posix.dirname(file), ref));

// Все файлы, которые нужны странице, — по алфавиту.
function siteFiles() {
  const files = new Set();
  for (const page of fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))) {
    files.add(page);
    const html = text(page).replace(/<!--[\s\S]*?-->/g, '');
    for (const m of html.matchAll(/<(?:script|link)\b[^>]*?\s(?:src|href)="([^"]+)"/g)) files.add(near(page, m[1]));
  }
  for (const css of [...files].filter(f => f.endsWith('.css'))) {
    for (const m of text(css).matchAll(/url\("([^"]+)"\)/g)) files.add(near(css, m[1]));
  }
  for (const manifest of [...files].filter(f => f.endsWith('.webmanifest'))) {
    for (const icon of JSON.parse(text(manifest)).icons || []) files.add(near(manifest, icon.src));
  }
  const walk = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach(d => {
    if (d.isDirectory()) walk(dir + '/' + d.name); else files.add(dir + '/' + d.name);
  });
  if (fs.existsSync(path.join(ROOT, 'docs'))) walk('docs');
  // Имя файла попадает в sw.js как строка и в адрес как путь: кавычка, обратная черта и знак % их сломали бы.
  const odd = [...files].filter(f => /['\\%]/.test(f));
  if (odd.length) throw new Error('В имени файла нельзя апостроф, обратную черту и знак %: ' + odd.join(', '));
  return [...files].sort();
}

// Отпечаток файла в том виде, в каком его сверяет браузер (integrity: sha256-…).
const digest = rel => crypto.createHash('sha256').update(bytes(rel)).digest('base64');
// Версия списка: меняется, когда меняется хоть один файл или состав списка. 16 знаков, а не 12: строку из
// 12 шестнадцатеричных знаков тест рамок принял бы за MAC-адрес без разделителей.
const version = list => crypto.createHash('sha256').update(JSON.stringify(list)).digest('hex').slice(0, 16);

function build() {
  const list = {};
  for (const file of siteFiles()) list[file] = digest(file);
  return { version: version(list), files: list };
}

// Текст блока со списком для sw.js.
function block({ version: v, files }) {
  const rows = Object.entries(files).map(([file, hash]) => "  '" + file + "': '" + hash + "'");
  return [START, "const VERSION = '" + v + "';", 'const FILES = {', rows.join(',\n'), '};', END].join('\n');
}

// Что записано в sw.js сейчас: { version, files } или null, если блока нет.
function current(source = text(SW)) {
  const a = source.indexOf(START), b = source.indexOf(END);
  if (a < 0 || b < a) return null;
  const body = source.slice(a, b);
  const files = {};
  for (const m of body.matchAll(/^ {2}'([^']+)': '([^']+)',?$/gm)) files[m[1]] = m[2];
  return { version: (body.match(/^const VERSION = '([^']*)';$/m) || [])[1], files };
}

function write() {
  const source = text(SW), a = source.indexOf(START), b = source.indexOf(END);
  if (a < 0 || b < a) throw new Error('в sw.js нет блока со списком файлов');
  fs.writeFileSync(path.join(ROOT, SW), source.slice(0, a) + block(build()) + source.slice(b + END.length));
}

module.exports = { ROOT, START, END, siteFiles, digest, version, build, block, current };

if (require.main === module) {
  const fresh = build(), now = current() || {};
  const same = JSON.stringify(now) === JSON.stringify(fresh);
  const n = Object.keys(fresh.files).length;
  if (process.argv.includes('--check')) {
    console.log(same ? 'Список в sw.js совпадает с файлами учебника: ' + n + ' файлов, версия ' + fresh.version + '.'
      : 'Список в sw.js устарел: запустите «node tools/offline.js».');
    process.exit(same ? 0 : 1);
  }
  if (same) console.log('Список в sw.js уже верный: ' + n + ' файлов, версия ' + fresh.version + '.');
  else { write(); console.log('Список в sw.js обновлён: ' + n + ' файлов, версия ' + fresh.version + '.'); }
}
