// Тексты миссии Р11-01 «Повтор одноразового числа» (мир «Бюро „Кілт“») и её механика.
// Запуск из корня репозитория: node --test tests/mission.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, read, loadApp, local } = require('./load.js');

const Model = require(path.join(ROOT, 'models', 'nonce-reuse.js'));
const DIR = 'content/missions/r11-m01';
const MISSION_FILES = fs.readdirSync(path.join(ROOT, DIR)).sort().map(f => DIR + '/' + f);
const worldsOf = App => App.missions.filter(m => m.meta['мир'] !== 'общий');

test('миссия r11-m01: один мир «Бюро» и общий разбор; других миров в учебнике нет', () => {
  const App = loadApp();
  assert.deepEqual(MISSION_FILES, [DIR + '/byuro.js', DIR + '/common.js']);
  assert.deepEqual(local(worldsOf(App).map(m => m.meta['мир'])), ['byuro']);
  assert.equal(App.missions.filter(m => m.meta['мир'] === 'общий').length, 1);
  assert.ok(!fs.existsSync(path.join(ROOT, 'artifact.html')), 'обёртку Artifact в репозиторий не кладём');
});

test('в текстах миссии нет ошибок и предупреждений', () => {
  const App = loadApp();
  const issues = App.missionText.validate(App.missions, Model, App.sourceList, { isRoute: App.model.isRoute, sections: App.sectionList });
  assert.deepEqual(local(issues), []);
});

test('полигон собирается, а секрет читается по приветствию', () => {
  const App = loadApp();
  for (const m of worldsOf(App)) {
    const p = App.missionText.polygonOf(m);
    const sc = Model.scenario(p);
    const [g, s] = sc.pair.map(no => sc.entries[no - 1]);
    assert.equal(Model.readWithKnown(g.cipher, sc.greeting, s.cipher, p.lang).join(''), p.secret, m.meta['мир']);
    assert.equal(sc.entries.length, p.marks.length, m.meta['мир'] + ': меток столько же, сколько сообщений');
    assert.ok(sc.firstShift >= 3 && sc.firstShift <= 15, m.meta['мир'] + ': первый шаг удобно считать');
  }
});

test('«Гамма»: первое слово секрета игрок дочитывает сам — каждую букву можно отсчитать по линейке', () => {
  const App = loadApp();
  const T = App.missionText;
  for (const m of worldsOf(App)) {
    const p = T.polygonOf(m), sc = Model.scenario(p);
    const [g, s] = sc.pair.map(no => sc.entries[no - 1]);
    const len = T.firstWordLength(p.secret);
    assert.ok(len >= T.FIRST_WORD.min && len <= T.FIRST_WORD.max, 'первое слово — от 2 до 6 букв, сейчас ' + len);
    assert.ok(len <= T.firstWordLength(p.greeting), 'первое слово секрета видно на ленте до ответа');
    // Буквы со второй по последнюю первого слова: шаг — от буквы приветствия до буквы шифровки,
    // буква секрета — столько же шагов назад от буквы второй шифровки. Ровно так считает игрок.
    for (let i = 1; i < len; i++) {
      const step = Model.shiftBetween(sc.greeting[i], g.cipher[i], p.lang);
      assert.equal(Model.shiftLetter(s.cipher[i], -step, p.lang), p.secret[i], 'буква ' + (i + 1));
      assert.ok(step > 0, 'нулевой шаг выдал бы букву без счёта');
    }
    const blocks = ['гамма.буква-верно', 'гамма.слово-мимо', 'гамма.слово-готово'];
    for (const b of blocks) assert.ok((m.scenes[b] || []).length, 'нет блока «' + b + '»');
  }
});

test('у каждой реплики известный персонаж, в мире не меньше двух героев', () => {
  const App = loadApp();
  for (const m of worldsOf(App)) {
    assert.ok(m.cast.length >= 2, m.meta['мир']);
    const names = new Set(m.cast.map(c => c.name));
    for (const items of Object.values(m.scenes)) for (const it of [items].flat()) if (it && it.type === 'say') assert.ok(names.has(it.who), it.who);
  }
});

test('проверка ловит типичные ошибки автора миссии', () => {
  const App = loadApp();
  const T = App.missionText;
  const bad = T.parseMission([
    '---', 'миссия: r11-m01', 'мир: proba', 'язык: ru', '---',
    '## мир', 'название: Проба', 'этапы: А | Б', 'персонаж: Аня | героиня', 'пометка: всё настоящее',
    '## полигон', 'ключ: К', 'приветствие: ПРИВЕТ', 'секрет: ОЧЕНЬ ДЛИННЫЙ СЕКРЕТ', 'шум: А | Б | В | Г',
    '## брифинг', 'Аня: Привет!', 'Боря: А меня нет в списке.', 'Текст со ссылкой [[ист: no_such]] ${x}'
  ].join('\n'), 'proba.js');
  const longWord = T.parseMission(read(DIR + '/byuro.js').replace(/String\.raw`|`\);\s*$/g, '').split('\n').filter(l => !l.startsWith('//') && !l.startsWith('App.')).join('\n')
    .replace(/^секрет: .*$/m, 'секрет: ТОРТИЩЕ ДЛЯ САУЛЕ').replace(/^мир: byuro$/m, 'мир: dlinnoe'), 'dlinnoe.js');
  const issues = local(T.validate([...App.missions, bad, longWord], Model, App.sourceList, { isRoute: App.model.isRoute, sections: App.sectionList }));
  const texts = file => issues.filter(i => i.file === file).map(i => i.where + ': ' + i.text);
  const has = (file, re) => assert.ok(texts(file).some(t => re.test(t)), 'нет ошибки: ' + re + '\n' + texts(file).join('\n'));
  has('proba.js', /нет источника с кодом «no_such»/);
  has('proba.js', /знаков \$ и \{/);
  has('proba.js', /Боря/);
  has('proba.js', /5 названий/);
  has('proba.js', /вымышленным/);
  has('proba.js', /не длиннее приветствия/);
  has('proba.js', /блок «журнал\.есть»/);
  has('proba.js', /блок «гамма\.слово-мимо»/);
  has('dlinnoe.js', /первое слово секрета — от 2 до 6 букв/);
});

test('карточки миссии: у каждой свой постоянный код, термин и определение можно править', () => {
  const common = DIR + '/common.js';
  const App = loadApp();
  const cards = local(App.missionText.cardsOf(App.missionText.commonOf(App.missions, 'r11-m01')));
  assert.ok(cards.length >= 4);
  for (const c of cards) assert.ok(/^[a-z0-9-]+$/.test(c.code) && c.term && c.text, JSON.stringify(c));
  assert.equal(new Set(cards.map(c => c.code)).size, cards.length);
  const texts = src => {
    const A = loadApp({ [common]: src });
    return local(A.missionText.validate(A.missions, Model, A.sourceList, { isRoute: A.model.isRoute, sections: A.sectionList })).map(i => i.where + ': ' + i.text);
  };
  // Правка термина (опечатка, перевод) кода не меняет — карточка в коллекции остаётся той же.
  assert.deepEqual(texts(read(common).replace('- gamma | Гамма |', '- gamma | Гамма шифра |')), []);
  assert.ok(texts(read(common).replace('- gamma | Гамма |', '- Гамма |')).some(t => /карточки: карточка 2: (нужно|код)/.test(t)), 'карточка без кода');
  assert.ok(texts(read(common).replace('- gamma | Гамма |', '- nonce | Гамма |')).some(t => /код «nonce» уже есть/.test(t)), 'повтор кода');
  assert.ok(texts(read(common).replace('- gamma | Гамма |', '- Гамма шифра | Гамма |')).some(t => /код — латинские буквы/.test(t)), 'код русским словом');
});

test('файл миссии с обратной кавычкой не пропадает молча: проверка называет файл', () => {
  const byuro = DIR + '/byuro.js';
  const App = loadApp({ [byuro]: read(byuro).replace('Чай налит, дело на столе.', 'Чай `налит`, дело на столе.') });
  assert.equal(worldsOf(App).length, 0, 'файл с ошибкой не должен загрузиться');
  assert.deepEqual(local(App.model.missingFiles([byuro, DIR + '/common.js'])), ['r11-m01/byuro.js']);
  assert.deepEqual(local(loadApp().model.missingFiles(MISSION_FILES)), []);
});

test('экран миссии: проверяет тексты перед запуском, берёт числа из модели и пишет в общую коллекцию', () => {
  const src = read('js/mission.js');
  assert.match(src, /T\.validate\(/, 'миссия должна проверять свои тексты перед запуском');
  assert.match(src, /errorScreen\(/);
  assert.match(src, /V\.collection\.add\('badges'/);
  assert.match(src, /V\.collection\.add\('cards'/);
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/, 'хранилище — только через js/ui.js');
  // Числа на экране — из модели, а не записаны в тексте: 20 000 сообщений и «половина шансов».
  assert.match(src, /M\.chanceOfRepeat\(DAY\.messages, 2 \*\* 24\)/);
  assert.match(src, /M\.halfChanceAt\(2 \*\* 24\)/);
  const ru = loadApp().uiStrings.ru.strings;
  for (const m of src.matchAll(/(?<![\w.])(?:t|pluralRu)\('([^']+)'/g)) assert.ok(('миссия.' + m[1]) in ru, 'нет строки миссия.' + m[1]);
});
