// Модель содержания: все файлы учебника загружаются и проходят проверку, проверка ловит ошибки автора,
// строки интерфейса полны, переводы помечены как черновые.
// Запуск из корня репозитория: node --test tests/content.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, read, loadApp, local, pageScripts } = require('./load.js');

const CONTENT = () => pageScripts().filter(s => /^(content|data)\//.test(s));
// Имена интерактивов — те, что регистрирует js/interactives.js.
const INTERACTIVES = [...read('js/interactives.js').matchAll(/App\.interactives(?:\['([\w-]+)'\]|\.(\w+)) = \{/g)].map(m => m[1] || m[2]);
// Код без комментариев: примеры в комментариях — не настоящие вызовы.
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
const validate = (App, extra) => App.model.validate(Object.assign({ expected: CONTENT(), model: App.NonceReuse, interactives: INTERACTIVES }, extra));

test('все файлы содержания загружаются, ошибок и предупреждений нет', () => {
  const App = loadApp();
  assert.deepEqual(App.loadErrors, []);
  const { issues, stats } = validate(App);
  assert.deepEqual(local(issues).map(i => i.file + ', ' + i.where + ': ' + i.text), []);
  assert.ok(stats.files >= 7 && stats.questions >= 5 && stats.cases >= 5, JSON.stringify(local(stats)));
  assert.ok(stats.cited >= 20, 'ссылок на источники слишком мало: ' + stats.cited);
});

test('index.html подключает каждый файл содержания, и каждый подключённый файл существует', () => {
  const listed = pageScripts();
  for (const s of listed) assert.ok(fs.existsSync(path.join(ROOT, s)), 'нет файла ' + s);
  const onDisk = [];
  const walk = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach(d => {
    const rel = dir + '/' + d.name;
    if (d.isDirectory()) walk(rel); else if (d.name.endsWith('.js')) onDisk.push(rel);
  });
  walk('content');
  assert.deepEqual(onDisk.filter(f => !listed.includes(f)), [], 'файлы содержания, которые страница не подключает');
  assert.ok(INTERACTIVES.includes('radio-range') && INTERACTIVES.includes('collision'));
});

test('карта разделов: 16 разделов по порядку, раздел 11 — флагман, у ступеней без текста есть план', () => {
  const App = loadApp();
  const list = local(App.sectionList);
  assert.equal(list.length, 16);
  assert.deepEqual(list.map(s => s.no), Array.from({ length: 16 }, (_, i) => i + 1));
  assert.deepEqual(list.filter(s => s.flagship).map(s => s.id), ['r11']);
  for (const id of ['r11', 'r13']) {
    const s = list.find(x => x.id === id);
    for (const step of ['глубже', 'дома', 'преподавателю']) assert.ok(s.plans[step], id + ': нет плана ступени «' + step + '»');
  }
});

test('источники страницы — копия data/sources.json', () => {
  const App = loadApp();
  const json = JSON.parse(read('data/sources.json'));
  assert.deepEqual(Object.keys(local(App.sourceList)).sort(), Object.keys(json).sort());
  assert.ok(Object.keys(json).length >= 50);
});

test('строки интерфейса: каждый ключ из кода есть в ru.js, переводы помечены как черновые', () => {
  const App = loadApp();
  const ru = local(App.uiStrings.ru.strings);
  const missing = [];
  // Ключи, которые код называет прямо: t('…'), V.t('…'), rich('…'), plural('…'); у миссии — с приставкой «миссия.».
  for (const f of ['js/ui.js', 'js/interactives.js', 'js/app.js', 'js/mission.js']) {
    const src = stripComments(read(f));
    const prefix = f === 'js/mission.js' ? 'миссия.' : '';
    for (const m of src.matchAll(/(?<![\w.])(V\.)?(?:t|rich|plural|pluralRu)\('([^']+)'/g)) {
      const key = (m[1] ? '' : prefix) + m[2];
      if (!key.endsWith('.') && !(key in ru)) missing.push(f + ': ' + key);
    }
  }
  // Ключи, которые код собирает из частей.
  const built = [
    ...['prosto', 'poprobuy', 'glubzhe', 'proverka', 'doma', 'prepod'].map(s => 'ступень.' + s),
    ...['auto', 'light', 'dark'].map(s => 'шапка.тема.' + s),
    ...['комната', 'стена', 'парковка', 'квартал'].map(s => 'радио.место.' + s),
    ...['файлов', 'вопросов', 'случаев', 'ссылок', 'проверить', 'аналогий', 'слов', 'без-перевода', 'миссий', 'уровень', 'файл', 'где', 'что'].map(s => 'модель.' + s),
    'повтор.16', 'повтор.24', 'повтор.32', 'радио.схема-в-зоне', 'радио.схема-вне-зоны',
    'вопрос.верно', 'вопрос.верно-не-сразу', 'вопрос.верно-подсказка', 'вопрос.показать-решение', 'вопрос.ещё-подсказка',
    'вопрос.подсказка', 'вопрос.назад', 'вопрос.дальше', 'преподавателю.заголовок', 'преподавателю.текст',
    'проектор.заголовок', 'проектор.текст', 'миссии.начать', 'миссии.снова',
    'миссия.открыть', 'миссия.дальше', 'миссия.защита.опасно', 'миссия.защита.безопасно', 'миссия.награда.получено',
    'миссия.награда.пока-нет', 'миссия.журнал.как', 'миссия.защита.как', 'миссия.группой.голосование'
  ];
  for (const key of built) if (!(key in ru)) missing.push('собранный ключ: ' + key);
  assert.deepEqual(missing, []);
  for (const lang of ['kk', 'en']) {
    const pack = local(App.uiStrings[lang]);
    assert.ok(pack, 'нет строк интерфейса ' + lang);
    assert.equal(pack.meta['статус'], 'не проверено носителем', lang + ': машинный или черновой перевод нельзя выдавать за готовый');
    assert.ok(pack.meta['перевод с'], lang + ': нет строки «перевод с:»');
    assert.ok(pack.strings['шапка.черновой-перевод'], lang + ': нет пометки о черновом переводе');
    assert.deepEqual(Object.keys(pack.strings).filter(k => k.startsWith('миссия.')), [], lang + ': миссии пока только на русском');
  }
});

test('черновой перевод ступени помечен, миссии и разбор — только на русском', () => {
  const App = loadApp();
  for (const f of local(App.files).filter(x => (x.meta['язык'] || 'ru') !== 'ru')) {
    assert.equal(f.meta['статус'], 'не проверено носителем', f.src);
    assert.ok(f.meta['перевод с'], f.src + ': нет «перевод с:»');
  }
  for (const m of local(App.missions)) assert.equal(m.meta['язык'], 'ru', m.src);
});

test('адреса страниц: разбор и проверка внутренних ссылок', () => {
  const App = loadApp();
  const r = h => local(App.model.parseRoute(h));
  assert.deepEqual(r(''), { page: 'vhod' });
  assert.deepEqual(r('#karta'), { page: 'karta' });
  assert.deepEqual(r('#r11-prosto'), { page: 'step', section: 'r11', step: 'prosto' });
  assert.deepEqual(r('#missiya-r11-m01'), { page: 'mission', mission: 'r11-m01' });
  assert.deepEqual(r('#r11-nichego'), { page: 'none' });
  assert.ok(App.model.isRoute('#r16-glubzhe') && App.model.isRoute('#missiya-r11-m01'));
  assert.ok(!App.model.isRoute('#r17-prosto') && !App.model.isRoute('#missiya-r11-m09'));
});

test('проверка ловит типичные ошибки автора в ступени, карте и строках интерфейса', () => {
  const step = 'content/ru/r11-prosto.js', ui = 'content/ui/kk.js', map = 'content/sections.js', q = 'content/ru/r11-proverka.js';
  const App = loadApp({
    [step]: read(step).replace('[[интерактив: radio-range]]', '[[интерактив: radio-rang]]\n[[ист: no_such]] [ссылка](#r99-prosto) [проверить]'),
    [ui]: read(ui).replace('карта.плитка: {n}-бөлім', 'карта.плитка: {m}-бөлім').replace('нет.на-вход:', 'лишний.ключ: x\nнет.на-вход:'),
    [map]: read(map).replace(/^флагман: да$/m, 'флагман: да\nномер: 99'),
    [q]: read(q).replace(/^(- .*?)\s*\(верно\)/m, '$1')
  });
  const texts = local(validate(App).issues).map(i => i.file + ' | ' + i.where + ' | ' + i.text);
  const has = re => assert.ok(texts.some(t => re.test(t)), 'нет ошибки: ' + re + '\n' + texts.join('\n'));
  has(/r11-prosto\.js .*нет интерактива «radio-rang»/);
  has(/r11-prosto\.js .*no_such/);
  has(/r11-prosto\.js .*#r99-prosto/);
  has(/ui\/kk\.js \| карта\.плитка \| места для чисел/);
  has(/ui\/kk\.js \| лишний\.ключ \| такой строки нет в русском файле/);
  has(/sections\.js .*номер.*дважды/);
  has(/r11-proverka\.js .*(верн|правильн)/);
});

test('файл с обратной кавычкой или ${…} не пропадает молча: проверка называет его', () => {
  const f = 'content/ru/r13-prosto.js';
  const App = loadApp({ [f]: read(f).replace(/\n## /, '\nСлово `в кавычках` и ${x}\n## ') });
  const issues = local(validate(App).issues);
  assert.ok(issues.some(i => i.file === 'ru/r13-prosto.js' && /не загрузился/.test(i.text)), JSON.stringify(issues));
  assert.deepEqual(local(App.model.missingFiles(CONTENT())), ['ru/r13-prosto.js']);
});
