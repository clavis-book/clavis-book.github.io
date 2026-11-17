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
    for (const step of ['глубже', 'дома', 'преподавателю']) {
      if (!App.find(id, step, 'ru')) assert.ok(s.plans[step], id + ': нет ни текста, ни плана ступени «' + step + '»');
    }
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
  for (const f of ['js/ui.js', 'js/settings.js', 'js/interactives.js', 'js/app.js', 'js/mission.js']) {
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
    ...['auto', 'light', 'dark'].map(s => 'настройки.тема.' + s),
    ...['draft', 'ready', 'unchecked', 'checked'].map(s => 'страница.статус.' + s),
    'офлайн.сохраняю', 'офлайн.готово', 'офлайн.обновлён',
    ...['android', 'iphone', 'компьютер'].map(s => 'офлайн.' + s),
    ...['комната', 'стена', 'парковка', 'квартал'].map(s => 'радио.место.' + s),
    ...['файлов', 'вопросов', 'случаев', 'ссылок', 'проверить', 'аналогий', 'слов', 'без-перевода', 'миссий', 'уровень', 'файл', 'где', 'что'].map(s => 'модель.' + s),
    'повтор.16', 'повтор.24', 'повтор.32', 'радио.схема-в-зоне', 'радио.схема-вне-зоны',
    'вопрос.верно', 'вопрос.верно-не-сразу', 'вопрос.верно-подсказка', 'вопрос.показать-решение', 'вопрос.ещё-подсказка',
    'вопрос.подсказка', 'вопрос.назад', 'вопрос.дальше', 'преподавателю.заголовок', 'преподавателю.текст',
    'проектор.заголовок', 'проектор.текст', 'миссии.начать', 'миссии.снова',
    'миссия.открыть', 'миссия.дальше', 'миссия.защита.опасно', 'миссия.защита.безопасно', 'миссия.награда.получено',
    'миссия.награда.пока-нет', 'миссия.журнал.как', 'миссия.защита.как', 'миссия.группой.голосование',
    'миссия.шаг3.подсказка2', 'миссия.шаг3.подсказка2-круг'
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

test('файл с обратной кавычкой не пропадает молча: проверка называет его', () => {
  const f = 'content/ru/r13-prosto.js';
  const App = loadApp({ [f]: read(f).replace(/\n## /, '\nСлово `в кавычках`\n## ') });
  const issues = local(validate(App).issues);
  assert.ok(issues.some(i => i.file === 'ru/r13-prosto.js' && /не загрузился/.test(i.text)), JSON.stringify(issues));
  assert.deepEqual(local(App.model.missingFiles(CONTENT())), ['ru/r13-prosto.js']);
});

// ---------- Текст — не код ----------
// Файл содержания — это текст в обёртке: заметки «//», одна строка App.<приём>(String.raw с обратной кавычкой,
// текст, закрывающая обратная кавычка и «);». То, что стоит в ${…}, браузер выполнил бы как код ещё при
// загрузке (и проверка страницы увидела бы уже результат), а всё, что вне обёртки, — обычный код. Поэтому
// смотрим исходный текст файла, а не то, что из него получилось.
function wrapperProblems(src) {
  const out = [];
  const lines = src.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  let i = 0;
  while (i < lines.length && (lines[i].startsWith('//') || !lines[i].trim())) i++;
  if (!/^App\.(content|sections|exam|ui|mission)\(String\.raw`$/.test(lines[i] || '')) out.push('первая строка кода — не App.content(String.raw` (или sections, exam, ui, mission)');
  if (lines[lines.length - 1] !== '`);') out.push('последняя строка — не `);');
  if (src.split('`').length - 1 !== 2) out.push('обратных кавычек должно быть ровно две — в первой и последней строке');
  if (src.includes('${')) out.push('в тексте есть сочетание знаков $ и {');
  // Для JavaScript эти два знака — тоже перевод строки: после них в заметке «//» начинался бы код.
  if (/[\u2028\u2029]/.test(src)) out.push('в файле есть разделитель строк U+2028 или U+2029');
  return out;
}

test('файлы содержания — только текст в обёртке: нет ${…}, лишних обратных кавычек и кода вне текста', () => {
  const files = pageScripts().filter(s => s.startsWith('content/'));
  assert.ok(files.length >= 13, 'проверяется слишком мало файлов: ' + files.length);
  for (const f of files) assert.deepEqual(wrapperProblems(read(f)), [], f);
});

test('проверка проверяющего: ${…}, код вне текста и лишняя обратная кавычка в файле содержания ловятся', () => {
  const good = read('content/ru/r13-prosto.js');
  assert.deepEqual(wrapperProblems(good), []);
  const bad = {
    'имя в ${…}': good.replace(/\n## /, '\nСлово ${name}\n## '),
    'выражение в ${…}': good.replace(/\n## /, '\nСлово ${App.loaded.length}\n## '),
    'присваивание в ${…}': good.replace(/\n## /, '\nСлово ${(App.x = 1, "")}\n## '),
    'код после текста': good.replace(/\);\s*$/, '); App.x = 1;\n'),
    'код перед текстом': 'App.x = 1;\n' + good,
    'код в первой строке': good.replace('App.content(String.raw`', 'App.x = 1; App.content(String.raw`'),
    'обратная кавычка в тексте': good.replace(/\n## /, '\nСлово `в кавычках`\n## '),
    'другая обёртка': good.replace('App.content(String.raw`', 'App.content(`'),
    'код в заметке после разделителя строк': '// заметка\u2028App.x = 1;\n' + good
  };
  for (const [name, src] of Object.entries(bad)) assert.ok(wrapperProblems(src).length, 'не поймано: ' + name);
  // Выражение в ${…} страница выполнила бы молча: файл загружается, а проверка страницы ничего не замечает.
  const f = 'content/ru/r13-prosto.js';
  const App = loadApp({ [f]: bad['выражение в ${…}'] });
  assert.deepEqual(App.loadErrors, []);
  assert.deepEqual(local(validate(App).issues), [], 'если проверка страницы научилась это ловить — обновите пояснения');
});

test('копия источников для страницы — только данные: один вызов App.sources с записью JSON, адреса — https', () => {
  const m = read('data/sources.js').replace(/\r\n?/g, '\n').match(/^(?:\/\/[^\n\u2028\u2029]*\n)*App\.sources\(([\s\S]*)\);\n?$/);
  assert.ok(m, 'data/sources.js должен состоять из заметок «//» и одного вызова App.sources(…)');
  const list = JSON.parse(m[1]);                      // всё, что не JSON, здесь упадёт
  assert.deepEqual(list, JSON.parse(read('data/sources.json')));
  for (const [id, s] of Object.entries(list)) if (s.url) assert.match(s.url, /^https:\/\/[^\s"<>]+$/, id + ': адрес источника — только https://');
});

// ---------- Постоянные коды ----------
test('код раздела не зависит от номера: разделы можно переставить, а повтор номера или кода — ошибка', () => {
  const map = 'content/sections.js';
  const swapped = read(map).replace(/^номер: 11$/m, 'номер: 111').replace(/^номер: 12$/m, 'номер: 11').replace(/^номер: 111$/m, 'номер: 12');
  const App = loadApp({ [map]: swapped });
  assert.deepEqual(local(validate(App).issues), [], 'разделы 11 и 12 поменялись номерами — коды и файлы те же');
  assert.equal(local(App.sectionList).find(s => s.id === 'r11').no, 12);
  const texts = src => local(validate(loadApp({ [map]: src })).issues).map(i => i.where + ' | ' + i.text);
  assert.ok(texts(read(map).replace(/^номер: 12$/m, 'номер: 11')).some(t => /номер 11 уже занят/.test(t)));
  assert.ok(texts(read(map).replace(/^номер: 12$/m, 'номер: двенадцать')).some(t => /целое число/.test(t)));
  assert.ok(texts(read(map).replace(/^## r12$/m, '## r11')).some(t => /раздел встречается дважды/.test(t)));
  assert.ok(texts(read(map).replace(/^## r12$/m, '## раздел12')).some(t => /код раздела/.test(t)));
});

test('код вопроса: начинается с кода своего раздела и не повторяется', () => {
  const q = 'content/ru/r11-proverka.js';
  const texts = src => local(validate(loadApp({ [q]: src })).issues).map(i => i.file + ' | ' + i.where + ' | ' + i.text);
  assert.ok(texts(read(q).replace('## Вопрос r11-02', '## Вопрос r11-01')).some(t => /r11-proverka\.js .*код вопроса «r11-01» уже есть/.test(t)), 'повтор кода');
  assert.ok(texts(read(q).replace('## Вопрос r11-02', '## Вопрос r13-02')).some(t => /r11-proverka\.js .*код вопроса — код раздела/.test(t)), 'код чужого раздела');
  assert.ok(texts(read(q).replace('## Вопрос r11-02', '## Вопрос второй')).some(t => /код вопроса — код раздела/.test(t)), 'код не по образцу');
  assert.ok(texts(read(q).replace('## Вопрос r11-02', '## Вопрос')).some(t => /у вопроса нет кода/.test(t)), 'вопрос без кода');
  // Один и тот же код в двух разделах невозможен: код чужого раздела — уже ошибка.
  const codes = local(loadApp().files).filter(f => f.kind === 'questions').flatMap(f => f.records.map(r => f.meta['язык'] + '|' + r.id));
  assert.equal(new Set(codes).size, codes.length);
});

test('заметка «//» в шапке файла — не ключ и не ошибка', () => {
  const f = 'content/ru/r13-prosto.js';
  const App = loadApp({ [f]: read(f).replace('---\nраздел: r13', '---\n// заметка для автора\n// статус: готово\nраздел: r13') });
  assert.deepEqual(local(validate(App).issues), []);
  const file = local(App.files).find(x => x.src === 'ru/r13-prosto.js');
  assert.equal(file.meta['статус'], 'черновик');
  assert.ok(!Object.keys(file.meta).some(k => k.startsWith('//')));
});

// ---------- Данные на устройстве ----------
test('хранилище: у данных есть версия схемы, испорченное и незнакомое отбрасывается', () => {
  const ST = loadApp().storage, LANGS = ['ru', 'kk', 'en'];
  const read1 = v => local(ST.read(typeof v === 'string' ? v : JSON.stringify(v), LANGS));
  const empty = { schema: ST.SCHEMA, lang: 'ru', theme: 'auto', group: false, size: 'm', progress: {}, quiz: {}, collection: { cards: [], badges: [] } };
  for (const junk of [null, '', 'не JSON', '[]', '42', '"строка"', '{"lang":"de","theme":"розовая","group":"да","size":"xxl","progress":7,"quiz":[1],"collection":"x"}']) {
    assert.deepEqual(read1(junk), { newer: false, state: empty }, String(junk));
  }
  // Вложенный мусор не роняет страницу: остаются только коды и допустимые значения.
  const dirty = read1({ lang: 'kk', theme: 'dark', group: true, size: 7,
    progress: { r11: 1, r13: { prosto: true, proverka: 'да', 'Плохой ключ': true }, '__proto__': { x: true } },
    quiz: { r11: 'x', r13: { 'r13-01': 'right', 'r13-02': 'выдумка', 'r13-03': { a: 1 } } },
    collection: { cards: ['r11-m01:nonce', 'r11-m01:nonce', 7, 'Гамма', '<b>'], badges: 'нет' } });
  assert.deepEqual(dirty.state, { schema: ST.SCHEMA, lang: 'kk', theme: 'dark', group: true, size: 'm',
    progress: { r11: {}, r13: { prosto: true } }, quiz: { r11: {}, r13: { 'r13-01': 'right' } },
    collection: { cards: ['r11-m01:nonce'], badges: [] } });
  // То, что страница записала, читается обратно без потерь.
  const saved = { schema: ST.SCHEMA, lang: 'en', theme: 'light', group: false, size: 'xl',
    progress: { r11: { prosto: true, proverka: true, 'missiya-r11-m01': true } }, quiz: { r11: { 'r11-01': 'hint' } },
    collection: { cards: ['r11-m01:gamma'], badges: ['r11-m01:world:byuro', 'r11-m01:clean'] } };
  assert.deepEqual(read1(saved), { newer: false, state: saved });
  // Запись более новой версии учебника не читаем и не перезаписываем.
  assert.deepEqual(read1(Object.assign({}, saved, { schema: ST.SCHEMA + 1 })), { newer: true, state: empty });
  assert.equal(ST.KEY, 'clavis:v1');
  assert.match(read('js/ui.js'), /if \(newer\) return;/, 'запись более новой версии не должна перезаписываться');
});

test('хранилище: прогресс со старого ключа kilt:v1 переносится под clavis:v1 один раз и без потерь', () => {
  const ST = loadApp().storage;
  assert.deepEqual(local(ST.OLD_KEYS), ['kilt:v1']);
  // Подделка хранилища браузера: limit — сколько записей помещается, fail — запись бросает исключение.
  function fake(init, { limit = Infinity, fail = false } = {}) {
    const m = new Map(Object.entries(init));
    return { m, getItem: k => (m.has(k) ? m.get(k) : null),
      setItem(k, v) { if (fail) throw new Error('QuotaExceededError'); if (m.has(k) || m.size < limit) m.set(k, String(v)); },
      removeItem: k => { m.delete(k); } };
  }
  const old = JSON.stringify({ schema: 1, lang: 'ru', theme: 'dark', group: false, progress: { r11: { prosto: true } },
    quiz: { r11: { 'r11-01': 'right' } }, collection: { cards: ['r11-m01:gamma'], badges: [] } });
  // Обычный случай: запись переехала слово в слово, старый ключ удалён, второй заход читает уже новый.
  const a = fake({ 'kilt:v1': old, 'chuzhoe': 'x' });
  assert.equal(ST.load(a), old);
  assert.deepEqual(Object.fromEntries(a.m), { 'clavis:v1': old, 'chuzhoe': 'x' });
  assert.equal(ST.load(a), old);
  assert.deepEqual(Object.fromEntries(a.m), { 'clavis:v1': old, 'chuzhoe': 'x' });
  // Под новым ключом уже есть запись: она главная, старая не трогается.
  const b = fake({ 'clavis:v1': '{"schema":1}', 'kilt:v1': old });
  assert.equal(ST.load(b), '{"schema":1}');
  assert.equal(b.m.get('kilt:v1'), old);
  // Хранилище переполнено (запись молча не легла) или запрещено (исключение): старая запись остаётся,
  // страница её всё равно получает, перенос повторится в следующий раз.
  for (const opts of [{ limit: 1 }, { fail: true }]) {
    const c = fake({ 'kilt:v1': old }, opts);
    assert.equal(ST.load(c), old, JSON.stringify(opts));
    assert.deepEqual(Object.fromEntries(c.m), { 'kilt:v1': old }, JSON.stringify(opts));
  }
  // Пусто — пусто; запись более новой версии переносится как есть и по-прежнему не перезаписывается (read → newer).
  assert.equal(ST.load(fake({})), null);
  const newer = JSON.stringify({ schema: ST.SCHEMA + 1, lang: 'kk' });
  const d = fake({ 'kilt:v1': newer });
  assert.equal(local(ST.read(ST.load(d), ['ru', 'kk', 'en'])).newer, true);
  assert.equal(d.m.get('clavis:v1'), newer);
  // Страница читает хранилище только через перенос, а старый ключ в коде страницы больше нигде не встречается.
  assert.match(read('js/ui.js'), /text = ST\.load\(localStorage\);/);
  assert.doesNotMatch(read('js/ui.js'), /getItem\(/);
  for (const f of ['js/app.js', 'js/ui.js', 'js/interactives.js', 'js/mission.js', 'js/offline.js', 'js/settings.js', 'index.html', 'sw.js']) {
    assert.doesNotMatch(read(f), /kilt:v1/, f);
  }
});

test('прогресс и коллекция хранятся по кодам, а не по текстам', () => {
  const App = loadApp(), CODE = App.storage.CODE;
  for (const s of local(App.model.STEPS)) assert.match(s.slug, CODE);
  for (const s of local(App.sectionList)) assert.match(s.id, CODE);
  for (const f of local(App.files)) for (const q of f.records) if (f.kind === 'questions') assert.match(q.id, CODE, f.src);
  for (const m of App.missions.filter(x => x.meta['мир'] === 'общий')) {
    for (const c of local(App.missionText.cardsOf(m))) assert.match(m.meta['миссия'] + ':' + c.code, CODE);
  }
  // Код страницы отмечает пройденное кодом ступени или миссии — без русских слов.
  for (const f of ['js/app.js', 'js/interactives.js', 'js/mission.js']) {
    for (const m of read(f).matchAll(/markDone\(([^)]*)\)/g)) assert.doesNotMatch(m[1], /[А-Яа-яЁё]/, f + ': ' + m[0]);
  }
  assert.doesNotMatch(read('js/mission.js'), /collection\.add\('cards', [^)]*term/, 'карточка в коллекции — по коду, не по термину');
});

test('ссылки на файлы учебника: только из папки docs/, и каждый файл существует', () => {
  const App = loadApp();
  const links = [];
  for (const f of CONTENT().filter(s => s.startsWith('content/'))) {
    for (const m of read(f).matchAll(/\]\((docs\/[^)\s]+)\)/g)) links.push([f, m[1]]);
  }
  assert.ok(links.length >= 2, 'нет ссылок на лабораторную в docs/lab');
  for (const [f, href] of links) assert.ok(fs.existsSync(path.join(ROOT, href)), f + ': нет файла ' + href);
  // Проверка страницы не пропускает выход из папки, параметры и чужие расширения.
  const step = 'content/ru/r11-prepod.js';
  const bad = read(step).replace('[То же простым текстом](docs/lab/Лабораторная_WiFi.md)',
    '[а](docs/../index.html) [б](docs/lab/run.exe) [в](docs/lab/x.md?y=1) [г](docs/%2e%2e/index.md) ' +
    '[д](docs/a/%2E%2E/%2e%2e/x.md) [е](docs/a\\..\\x.md) [ж](docs/%E0%A4%A.md)');
  const texts = local(validate(loadApp({ [step]: bad })).issues).map(i => i.text).filter(t => /файл учебника/.test(t));
  assert.equal(texts.length, 7, JSON.stringify(texts));
  // Та же проверка решает, станет ли ссылка ссылкой на странице (js/ui.js): закодированные точки не проходят.
  assert.equal(App.markup.isDocLink('docs/%2e%2e/index.md'), false);
  assert.equal(App.markup.isDocLink('docs/lab/Лабораторная_WiFi.docx'), true);
  assert.deepEqual(local(validate(App).issues), []);
});

test('список источников пишет «сверено» только у сверенного источника', () => {
  const line = read('js/ui.js').split('\n').find(l => l.includes("t('ист.сверено'"));
  assert.ok(line, 'в js/ui.js нет строки со словом «сверено»');
  // С 17.11.2026 сверенный источник без даты (лекции) тоже получает «сверено» — без даты; условие то же: verified.
  assert.match(line, /^\s*s\.verified \?/, 'у источника с verified: false не должно быть «сверено»');
  assert.ok(line.includes("t('ист.сверено-без-даты')"), '«сверено» без даты — в той же строке, под тем же условием');
});

test('«Проверь себя» Р11: 8 вопросов, верный ответ — на разных местах, не самый длинный и одной длины с другими', () => {
  const App = loadApp();
  const f = local(App.files.find(x => x.meta['раздел'] === 'r11' && x.meta['ступень'] === 'проверка'));
  assert.equal(f.records.length, 8);
  const places = new Set(), longest = [];
  for (const q of f.records) {
    const len = q.options.map(o => o.text.length), right = q.options.findIndex(o => o.correct);
    places.add(right);
    if (len[right] === Math.max(...len)) longest.push(q.id);
    assert.ok(Math.max(...len) / Math.min(...len) <= 1.35, q.id + ': варианты слишком разной длины: ' + len);
    assert.ok(q.options.every(o => o.why), q.id + ': у каждого варианта — разбор');
    assert.ok(q.hints.length === 2, q.id + ': две подсказки');
    assert.ok(q.hints.some(h => /\]\(#r11-[a-z]+\)/.test(h)), q.id + ': подсказка ведёт на ступень раздела ссылкой');
  }
  assert.equal(places.size, 4, 'верный ответ стоит на всех четырёх местах');
  assert.ok(longest.length <= 2, 'верный — самый длинный слишком часто: ' + longest);
});

test('метки в двойных скобках набраны кириллицей: [[ист: …]], а не [[ist: …]]', () => {
  // Метку латиницей разметка не узнаёт: читатель увидел бы сырой текст в скобках, а факт остался бы без источника.
  for (const s of CONTENT().filter(f => f.startsWith('content/'))) {
    assert.deepEqual([...read(s).matchAll(/\[\[\s*[a-z][^\]]*\]\]/gi)].map(m => m[0]), [], s);
  }
});

test('боковая заметка ^[…]: внутри работает строчная разметка, ошибки автора ловятся', () => {
  const { markup: MK } = loadApp();
  const toks = MK.inlineTokens('Wi-Fi.^[Слово — товарный знак [[ист: wfa_security подвал]] **объединения**.] Дальше.');
  assert.deepEqual([...toks.map(x => x.t)], ['text', 'note', 'text']);
  assert.equal(toks[1].text, 'Слово — товарный знак [[ист: wfa_security подвал]] **объединения**.');
  // Источник внутри заметки учитывается в списке источников и в проверке.
  assert.deepEqual(JSON.parse(JSON.stringify(MK.citedIds('а^[б [[ист: wfa_security]]]'))), [{ id: 'wfa_security', loc: '' }]);
  const problems = raw => { const out = []; MK.checkText(raw, (lvl, where, text) => out.push(where + ': ' + text), {}); return out; };
  assert.deepEqual(problems('Текст^[заметка] и ещё^[вторая].'), []);
  assert.match(problems('Текст^[без конца').join(), /не закрыта/);
  // Пара скобок — в одном абзаце: страница разбирает текст по абзацам (ревью шага 2, 17.11.2026).
  assert.match(problems('Текст^[начало в одном абзаце\n\nа конец] в другом').join(), /не закрыта/);
  assert.deepEqual(problems('Текст^[заметка]\n\nВторой абзац^[вторая].'), []);
  assert.match(problems('Текст^[ ] дальше').join(), /пустая заметка/);
  assert.match(problems('Текст^[внешняя ^[внутренняя]] дальше').join(), /внутри заметки/);
  assert.match(problems('Текст^[источник [[ист: no_such_source]]]').join(), /нет источника/);
});
