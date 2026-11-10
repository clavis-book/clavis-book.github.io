// Тексты игровых миссий: разбор файлов content/missions/<миссия>/<файл>.js и их проверка.
// Правила разметки общие для всего учебника (js/markup.js, описаны в content/README.md);
// здесь — только устройство миссии: какие блоки нужны и что в них.
//
// Файл миссии: шапка (миссия, мир, язык, статус) и блоки «## имя».
//   блоки мир, полигон, миссия, правила, правила.итог — строки «ключ: значение»;
//   блок загадка — вопрос с вариантами, как в «Проверь себя»;
//   остальные блоки — реплики «Имя: текст» (имя — из строк «персонаж:»), пункты, выноски, абзацы.
// Общий файл (мир: общий) хранит факты и разбор, файл мира — героев, реплики и данные полигона.
// Работает в браузере (классический скрипт, в том числе из file://) и в node --test.
(function (root) {
  'use strict';
  const App = root.App = root.App || {};
  const MK = App.markup;
  App.missions = App.missions || [];

  const FIELD_BLOCKS = ['мир', 'полигон', 'миссия', 'правила', 'правила.итог'];
  const QUESTION_BLOCKS = ['загадка'];

  // Блоки, без которых миссия не соберётся. Мир — характер и реплики, общий файл — факты.
  const REQUIRED_WORLD = ['мир', 'полигон', 'титул', 'брифинг', 'журнал.задание', 'журнал.мимо',
    'журнал.подсказка', 'журнал.есть', 'гамма.задание', 'гамма.сдвиг-верно', 'гамма.сдвиг-мимо',
    'гамма.буква-верно', 'гамма.буква-мимо', 'гамма.слово-мимо', 'гамма.слово-готово', 'секрет.прочитан',
    'почему.коротко', 'защита.задание', 'защита.random100', 'защита.random24', 'защита.counter',
    'защита.counterreset', 'загадка.верно', 'загадка.мимо', 'финал'];
  const REQUIRED_COMMON = ['миссия', 'устройство', 'правила', 'правила.итог', 'загадка', 'почему', 'в мире',
    'сильнее', 'упрощение', 'карточки', 'дальше'];
  const WORLD_FIELDS = ['название', 'жанр', 'кратко', 'игрок', 'этапы', 'значок', 'пометка'];
  const COMMON_FIELDS = ['название', 'раздел', 'минут', 'модель'];
  // Первое слово секрета игрок дочитывает сам (так задумано автором): 2–6 букв.
  const FIRST_WORD = { min: 2, max: 6 };

  function parseMission(text, src) {
    const { meta, body, problems } = MK.parseHeader(text);
    const { intro, blocks } = MK.splitBlocks(body);
    const stray = intro.find(l => l.text.trim());
    if (stray) problems.push({ line: stray.line, text: 'текст до первого заголовка «## …»' });
    const raw = {}, order = [];
    for (const b of blocks) {
      const key = b.name.toLowerCase();
      if (raw[key]) problems.push({ line: b.line, text: 'блок «' + key + '» встречается дважды' });
      raw[key] = b.lines; order.push(key);
    }
    const fields = {};
    for (const key of order) if (FIELD_BLOCKS.includes(key)) fields[key] = MK.parseFields(raw[key], problems, key, ['персонаж']);
    const cast = ((fields['мир'] || {})['персонаж'] || []).map(v => {
      const [name, about] = v.split('|').map(s => s.trim());
      return { name, about: about || '' };
    });
    const names = cast.map(c => c.name);
    const scenes = {};
    for (const key of order) {
      if (FIELD_BLOCKS.includes(key)) continue;
      scenes[key] = QUESTION_BLOCKS.includes(key) ? MK.parseQuestion(raw[key]) : MK.parseProse(raw[key], { names, problems, noHeadings: true });
    }
    return { src, meta, fields, cast, scenes, problems, raw: String(text) };
  }

  const list = v => String(v || '').split('|').map(s => s.trim()).filter(Boolean);

  // Полигон мира → параметры для модели (scenario).
  function polygonOf(m) {
    const p = m.fields['полигон'] || {};
    return {
      lang: m.meta['язык'] || 'ru', key: p['ключ'], greeting: p['приветствие'], secret: p['секрет'],
      filler: list(p['шум']), seed: parseInt(p['зерно'], 10), greetingAt: parseInt(p['номер приветствия'], 10),
      marks: list(p['метки']), marksTitle: p['метки-заголовок'] || ''
    };
  }

  // Сколько букв первого слова секрета (до пробела) игрок дочитывает сам, считая первую.
  const firstWordLength = secret => String(secret || '').split(' ')[0].length;

  // Общий файл миссии и её мир. Миров у миссии может быть несколько; сейчас в учебнике один —
  // берётся первый загруженный (порядок задаёт index.html).
  const commonOf = (missions, id) => missions.find(m => m.meta['мир'] === 'общий' && m.meta['миссия'] === id);
  const worldsOf = (missions, id) => missions.filter(m => m.meta['мир'] !== 'общий' && m.meta['миссия'] === id);

  // ---------- Проверка: ошибки (миссия не соберётся или нарушает правила) и предупреждения ----------
  // ctx.isRoute — для ссылок внутри учебника, ctx.sections — карта разделов.
  function validate(missions, Model, sourceList, ctx) {
    const issues = [];
    const c = ctx || {};
    const sources = sourceList || App.sourceList || {};
    for (const m of missions) {
      const add = (level, where, text) => issues.push({ level, file: m.src, where, text });
      m.problems.forEach(p => add(p.level || 'ошибка', 'строка ' + p.line, p.text));
      if (!m.meta['миссия']) add('ошибка', 'шапка', 'нет строки «миссия:»');
      else if (!/^r\d{1,2}-m\d{2}$/.test(m.meta['миссия'])) add('ошибка', 'шапка', 'код миссии — как r11-m01 (раздел и номер миссии)');
      if (!m.meta['мир']) add('ошибка', 'шапка', 'нет строки «мир:»');
      if ((m.meta['язык'] || 'ru') !== 'ru') add('ошибка', 'шапка', 'миссии пока только на русском (язык: ru)');
      MK.checkText(m.raw, add, { sources, isRoute: c.isRoute });
      const isCommon = m.meta['мир'] === 'общий';
      for (const key of isCommon ? REQUIRED_COMMON : REQUIRED_WORLD) {
        const s = FIELD_BLOCKS.includes(key) ? m.fields[key] : m.scenes[key];
        const empty = !s || (Array.isArray(s) ? !s.length : (key === 'загадка' ? !s.options : !Object.keys(s).length));
        if (empty) add('ошибка', 'блок «' + key + '»', 'блока нет или он пуст');
      }
      if (isCommon) {
        const info = m.fields['миссия'] || {};
        for (const f of COMMON_FIELDS) if (!info[f]) add('ошибка', 'блок «миссия»', 'нет строки «' + f + ':»');
        if (c.sections && info['раздел'] && !c.sections.some(s => s.id === info['раздел'])) add('ошибка', 'блок «миссия»', 'нет раздела «' + info['раздел'] + '» в карте разделов');
        if (m.meta['миссия'] && info['раздел'] && !m.meta['миссия'].startsWith(info['раздел'] + '-')) add('ошибка', 'блок «миссия»', 'код миссии должен начинаться с кода раздела');
        if (!worldsOf(missions, m.meta['миссия']).length) add('ошибка', 'шапка', 'у миссии нет ни одного мира');
        const rules = m.fields['правила'] || {}, sums = m.fields['правила.итог'] || {};
        for (const r of (Model && Model.RULES) || []) {
          if (!rules[r.toLowerCase()]) add('ошибка', 'блок «правила»', 'нет строки «' + r + ':»');
          if (!sums[r.toLowerCase()]) add('ошибка', 'блок «правила.итог»', 'нет строки «' + r + ':»');
        }
        const q = m.scenes['загадка'];
        if (q && q.options) MK.questionProblems(q).forEach(p => add('ошибка', 'загадка', p));
        (m.scenes['карточки'] || []).forEach(it => {
          if (it.type !== 'ul') { add('ошибка', 'карточки', 'карточки — пунктами «- Термин | определение»'); return; }
          it.items.forEach((x, n) => { if (list(x).length !== 2) add('ошибка', 'карточки', 'карточка ' + (n + 1) + ': нужно «- Термин | определение»'); });
        });
        continue;
      }
      // Мир
      if (!commonOf(missions, m.meta['миссия'])) add('ошибка', 'шапка', 'нет общего файла разбора для миссии «' + m.meta['миссия'] + '»');
      const w = m.fields['мир'] || {};
      for (const f of WORLD_FIELDS) if (!w[f]) add('ошибка', 'блок «мир»', 'нет строки «' + f + ':»');
      if (w['этапы'] && list(w['этапы']).length !== 5) add('ошибка', 'блок «мир»', 'в «этапы:» нужно 5 названий через черту |');
      if (w['пометка'] && !/вымышлен/i.test(w['пометка'])) add('ошибка', 'блок «мир»', 'в «пометка:» мир должен быть назван вымышленным (рамка 3)');
      if (!m.cast.length) add('ошибка', 'блок «мир»', 'нет ни одной строки «персонаж: Имя | кто это»');
      const p = polygonOf(m);
      const fw = firstWordLength(p.secret);
      if (p.secret && (fw < FIRST_WORD.min || fw > FIRST_WORD.max)) {
        add('ошибка', 'блок «полигон»', 'первое слово секрета — от ' + FIRST_WORD.min + ' до ' + FIRST_WORD.max + ' букв: его игрок дочитывает сам');
      }
      // До ответа на телефоне видно только первое слово ленты (слово приветствия): буквы, которые игрок
      // дочитывает сам, должны быть в нём.
      if (p.secret && p.greeting && fw > firstWordLength(p.greeting)) {
        add('ошибка', 'блок «полигон»', 'первое слово секрета длиннее первого слова приветствия: его не будет видно на ленте');
      }
      if (Model) {
        try {
          const sc = Model.scenario(p);
          if (p.marks.length && p.marks.length !== sc.entries.length) add('ошибка', 'блок «полигон»', 'меток ' + p.marks.length + ', а сообщений ' + sc.entries.length);
        } catch (e) { add('ошибка', 'блок «полигон»', e.message); }
      }
    }
    return issues;
  }

  App.mission = function (text) { const m = parseMission(text, MK.currentScript()); App.missions.push(m); return m; };
  App.missionText = { parseMission, validate, polygonOf, firstWordLength, commonOf, worldsOf, list, FIRST_WORD, REQUIRED_WORLD, REQUIRED_COMMON };
  if (typeof module !== 'undefined' && module.exports) module.exports = App;
})(typeof self !== 'undefined' ? self : globalThis);
