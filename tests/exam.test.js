// Карта к экзамену: 117 контрольных вопросов лекций, у каждого — место в учебнике; счётчик «разобрано N из 117»
// совпадает с метками [[экзамен: код]], которые стоят в текстах ступеней.
// Запуск из корня репозитория: node --test tests/exam.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { read, loadApp, local, pageScripts } = require('./load.js');

const MAP = 'content/ekzamen.js';
const CONTENT = () => pageScripts().filter(s => /^(content|data)\//.test(s));
const issuesOf = (App, file) => local(App.model.validate({ expected: CONTENT(), model: App.NonceReuse }).issues)
  .filter(i => !file || i.file === file).map(i => i.where + ': ' + i.text);

// Сколько контрольных вопросов в каждой лекции курса: по 10 в 11 файлах лекций и 7 в лекции 14–15.
const PER_LECTURE = { l01: 10, l02: 10, l03: 10, l04: 10, l05: 10, l06: 10, l07: 10, l08: 10, l09: 10, l10: 10, l12: 10, l14: 7 };

test('карта к экзамену: 117 вопросов в 12 лекциях, коды по порядку, у каждого — раздел и ступень', () => {
  const App = loadApp();
  const E = local(App.examMap);
  assert.ok(E, 'карта к экзамену не загрузилась');
  assert.equal(E.meta['всего'], '117');
  assert.deepEqual(Object.fromEntries(E.lectures.map(l => [l.id, l.questions.length])), PER_LECTURE);
  for (const l of E.lectures) {
    assert.deepEqual(l.questions.map(q => q.id), l.questions.map((q, i) => l.id + '-' + String(i + 1).padStart(2, '0')), l.id + ': коды не по порядку');
  }
  const codes = E.lectures.flatMap(l => l.questions.map(q => q.id));
  assert.equal(codes.length, 117);
  assert.equal(new Set(codes).size, 117);
  assert.deepEqual(issuesOf(App, 'ekzamen.js'), []);
});

test('счётчик «разобрано N из 117» равен числу вопросов карты, для которых в русских текстах есть метка', () => {
  const App = loadApp();
  const cov = local(App.model.examCoverage());
  // Независимый подсчёт: метки ищем прямо в исходном тексте файлов, без разбора страницы.
  const marked = new Set();
  for (const f of pageScripts().filter(s => /^content\/ru\//.test(s))) {
    for (const m of read(f).matchAll(/\[\[экзамен:\s*([^\]]+)\]\]/g)) m[1].split(',').forEach(id => marked.add(id.trim()));
  }
  const codes = new Set(local(App.examMap).lectures.flatMap(l => l.questions.map(q => q.id)));
  assert.deepEqual([...marked].filter(id => !codes.has(id)), [], 'метки с кодами, которых нет в карте');
  assert.equal(cov.total, 117);
  assert.equal(cov.covered, marked.size);
  assert.deepEqual(Object.keys(cov.where).sort(), [...marked].sort());
  // Уже разобраны: «секретен только ключ» (раздел 11, «Просто») и повтор вектора инициализации (миссия).
  assert.deepEqual(cov.where['l10-01'], [{ section: 'r11', step: 'просто' }]);
  assert.deepEqual(cov.where['l14-07'], [{ section: 'r11', step: 'попробуй' }]);
  const { stats } = App.model.validate({ expected: CONTENT(), model: App.NonceReuse });
  assert.equal(stats.examCovered, cov.covered);
  assert.equal(stats.examTotal, 117);
});

test('страница карты к экзамену: адрес #ekzamen существует', () => {
  const App = loadApp();
  assert.deepEqual(local(App.model.parseRoute('#ekzamen')), { page: 'ekzamen' });
  assert.ok(App.model.isRoute('#ekzamen'));
});

test('проверка проверяющего: ошибки в карте к экзамену и в метках ловятся', () => {
  const map = read(MAP);
  const bad = {
    'число в «всего:» не совпадает': [MAP, map.replace('всего: 117', 'всего: 118'), /всего: 118/],
    'код повторяется': [MAP, map.replace('- l01-02 |', '- l01-01 |'), /уже есть у другого вопроса/],
    'код чужой лекции': [MAP, map.replace('- l02-01 |', '- l03-01 |'), /код вопроса — код лекции/],
    'нет такого раздела': [MAP, map.replace('l01-01 | r1 просто', 'l01-01 | r99 просто'), /нет раздела «r99»/],
    'нет такой ступени': [MAP, map.replace('l01-01 | r1 просто', 'l01-01 | r1 легко'), /ступень — одна из/],
    'одна черта вместо двух': [MAP, map.replace('- l01-01 | r1 просто |', '- l01-01 | r1 просто'), /через две черты/],
    'нет темы лекции': [MAP, map.replace('тема: Вводная лекция\n', ''), /нет строки «тема:»/],
    'метка с неизвестным кодом': ['content/ru/r11-prosto.js', read('content/ru/r11-prosto.js').replace('[[экзамен: l10-01]]', '[[экзамен: l10-99]]'), /такого вопроса нет в карте/],
    'коды через точку с запятой': ['content/ru/r11-prosto.js', read('content/ru/r11-prosto.js').replace('[[экзамен: l10-01]]', '[[экзамен: l10-01; l10-02]]'), /записана неверно/],
    'метка внутри жирного': ['content/ru/r11-prosto.js', read('content/ru/r11-prosto.js').replace('[[экзамен: l10-01]]', '**ключ [[экзамен: l10-01]]**'), /записана неверно/],
    'метка в миссии': ['content/missions/r11-m01/common.js', read('content/missions/r11-m01/common.js').replace('[[ист: krack_site]]', '[[ист: krack_site]] [[экзамен: l14-05]]'), /в миссии метку не ставят/],
    'лишнее слово в месте': [MAP, map.replace('l01-01 | r1 просто', 'l01-01 | r1 просто лишнее'), /место — два слова/],
    'вопрос без пробела после дефиса': [MAP, map.replace('- l01-02 |', '-l01-02:'), /неизвестная строка/],
    'код лекции не совпадает с номером': [MAP, map.replace('лекция: 1\n', 'лекция: 2\n'), /код лекции не совпадает/],
    'лекция дважды': [MAP, map.replace('## l02\n', '## l01\n'), /уже есть в карте/]
  };
  for (const [name, [file, text, expect]] of Object.entries(bad)) {
    const App = loadApp({ [file]: text });
    assert.ok(issuesOf(App).some(i => expect.test(i)), 'не поймано: ' + name + '\n' + issuesOf(App).join('\n'));
  }
  // Метка в переводе счётчик не меняет: разобранным вопрос делает русский текст.
  const kk = 'content/kk/r11-prosto.js';
  const App = loadApp({ [kk]: read(kk).replace(/\n`\);\s*$/, '\n[[экзамен: l01-01]]\n`);\n') });
  assert.equal(App.model.examCoverage().where['l01-01'], undefined);
});
