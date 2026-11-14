// Модель содержания: приём файлов содержания (карта разделов, ступени разделов, строки интерфейса,
// источники), адреса страниц и проверка всего содержания. Правила разметки — в js/markup.js.
// Работает в браузере (классический скрипт, в том числе из file://) и в node --test.
(function (root) {
  'use strict';
  const App = root.App = root.App || {};
  const MK = App.markup;

  App.files = [];          // ступени разделов
  App.sectionList = [];    // карта разделов
  App.sourceList = App.sourceList || {};
  App.uiStrings = {};      // строки интерфейса: язык → { strings, meta, src }
  App.loaded = App.loaded || [];  // какие файлы содержания выполнились (для поиска незагрузившихся)
  App.loadProblems = [];   // ошибки разбора файлов, которые не относятся к ступеням
  App.examMap = null;      // карта к экзамену: контрольные вопросы лекций → раздел и ступень

  // Ступени раздела: название в шапке файла и код — часть адреса страницы и ключ прогресса на устройстве.
  const STEPS = [
    { name: 'просто', slug: 'prosto' }, { name: 'попробуй', slug: 'poprobuy' }, { name: 'глубже', slug: 'glubzhe' },
    { name: 'проверка', slug: 'proverka' }, { name: 'дома', slug: 'doma' }, { name: 'преподавателю', slug: 'prepod' }
  ];
  const SECTION_CODE = /^r\d{1,2}$/;
  const STATUSES = ['черновик', 'готово'];                                   // русский текст
  const TR_STATUSES = ['не проверено носителем', 'проверено носителем'];     // перевод

  // ---------- Адреса страниц (часть после #) ----------
  // «» — вход; karta — карта разделов; ekzamen — карта к экзамену; r11-prosto — раздел и ступень;
  // missiya-r11-m01 — миссия; prepodavatelyu, proektor — разделы преподавателя и проектора;
  // model — модель содержания.
  const PLAIN_ROUTES = ['', 'karta', 'ekzamen', 'prepodavatelyu', 'proektor', 'model'];
  function parseRoute(hash) {
    const r = String(hash || '').replace(/^#/, '');
    if (PLAIN_ROUTES.includes(r)) return { page: r || 'vhod' };
    let m = r.match(/^(r\d{1,2})-([a-z]+)$/);
    if (m && STEPS.some(s => s.slug === m[2])) return { page: 'step', section: m[1], step: m[2] };
    m = r.match(/^missiya-(r\d{1,2}-m\d{2})$/);
    if (m) return { page: 'mission', mission: m[1] };
    return { page: 'none' };
  }
  // Есть ли такая страница: раздел — в карте, миссия — среди загруженных миссий.
  function isRoute(hash) {
    const r = parseRoute(hash);
    if (r.page === 'none') return false;
    if (r.page === 'step') return App.sectionList.some(s => s.id === r.section);
    if (r.page === 'mission') return (App.missions || []).some(m => m.meta['миссия'] === r.mission);
    return true;
  }

  // ---------- Даты «дд.мм.гггг» ----------
  function dateKey(s) {
    const m = String(s || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    return m ? Number(m[3] + m[2] + m[1]) : null;
  }

  // ---------- Приём файлов ----------
  App.sources = obj => { Object.assign(App.sourceList, obj); App.loaded.push(MK.currentScript()); };

  // Карта разделов: блоки «## r11» с полями номер, название, лекции, аналогия, флагман,
  // план.глубже, план.дома, план.преподавателю (что будет на ступени, пока её нет).
  App.sections = function (text) {
    const src = MK.currentScript();
    App.loaded.push(src);
    const { meta, body, problems } = MK.parseHeader(text);
    const { intro, blocks } = MK.splitBlocks(body);
    if (intro.some(l => l.text.trim())) problems.push({ line: intro.find(l => l.text.trim()).line, text: 'текст до первого раздела «## r…»' });
    App.sectionList = blocks.map(b => {
      const f = MK.parseFields(b.lines, problems, b.name);
      const plans = {};
      for (const [k, v] of Object.entries(f)) if (k.startsWith('план.')) plans[k.slice(5)] = v;
      return { id: b.name, no: Number(f['номер']), title: f['название'] || '', lectures: f['лекции'] || '',
        analogy: f['аналогия'] || '', flagship: /^да$/i.test(f['флагман'] || ''), plans, line: b.line };
    });
    App.loadProblems.push(...problems.map(p => ({ level: p.level || 'ошибка', file: src, where: 'строка ' + p.line, text: p.text })));
    App.sectionsMeta = meta;
  };

  // Карта к экзамену (content/ekzamen.js): блоки лекций «## l14» со строками «лекция:», «тема:» и вопросами
  // «- код | раздел ступень | вопрос своими словами». Разобран ли вопрос, решает не карта, а метки
  // [[экзамен: код]] в текстах ступеней — их считает examCoverage().
  const EXAM_LECTURE = /^l\d{2}$/, EXAM_CODE = /^l\d{2}-\d{2}$/;
  App.exam = function (text) {
    const src = MK.currentScript();
    App.loaded.push(src);
    const { meta, body, problems } = MK.parseHeader(text);
    const { intro, blocks } = MK.splitBlocks(body);
    const stray = intro.find(l => l.text.trim() && !l.text.trim().startsWith('//'));
    if (stray) problems.push({ line: stray.line, text: 'текст до первой лекции «## l…»' });
    const lectures = blocks.map(b => {
      const fieldLines = [], questions = [];
      for (const ln of b.lines) {
        const t = ln.text.trim();
        if (!t.startsWith('- ')) { fieldLines.push(ln); continue; }
        const parts = t.slice(2).split('|').map(x => x.trim());
        const place = (parts[1] || '').split(/\s+/);
        if (parts.length !== 3) problems.push({ line: ln.line, text: 'вопрос карты — «- код | раздел ступень | вопрос», через две черты |' });
        questions.push({ id: parts[0] || '', section: place[0] || '', step: (place[1] || '').toLowerCase(), text: parts[2] || '', line: ln.line, extra: place.length > 2 });
      }
      const f = MK.parseFields(fieldLines, problems, b.name);
      for (const k of Object.keys(f)) if (!['лекция', 'тема'].includes(k)) {
        problems.push({ line: b.line, text: 'в блоке «' + b.name + '» неизвестная строка «' + k + ':» — вопрос начинается с «- » (дефис и пробел)' });
      }
      return { id: b.name, lecture: f['лекция'] || '', topic: f['тема'] || '', line: b.line, questions };
    });
    App.examMap = { src, meta, lectures, questions: lectures.flatMap(l => l.questions.map(q => Object.assign(q, { lectureId: l.id, lectureNo: l.lecture }))) };
    App.loadProblems.push(...problems.map(p => ({ level: p.level || 'ошибка', file: src, where: 'строка ' + p.line, text: p.text })));
  };

  // Где разобран каждый вопрос карты: код → [{ section, step }] по меткам [[экзамен: код]] в русских
  // текстах ступеней. Счётчик «разобрано N из M» — число кодов карты, у которых есть хотя бы одна метка.
  function examCoverage() {
    const where = {};
    for (const f of App.files) {
      if ((f.meta['язык'] || 'ru') !== 'ru') continue;
      for (const tok of MK.inlineTokens(f.raw)) if (tok.t === 'exam') for (const id of tok.ids) {
        const list = where[id] = where[id] || [];
        const place = { section: f.meta['раздел'], step: (f.meta['ступень'] || '').toLowerCase() };
        if (!list.some(x => x.section === place.section && x.step === place.step)) list.push(place);
      }
    }
    const qs = App.examMap ? App.examMap.questions : [];
    return { where, total: qs.length, covered: qs.filter(q => where[q.id]).length };
  }

  // Ступень раздела: обычный текст, вопросы «## Вопрос <код>» или случаи «## Случай» для сортировки.
  App.content = function (text) {
    const src = MK.currentScript();
    App.loaded.push(src);
    const { meta, body, problems } = MK.parseHeader(text);
    const file = { src, meta, raw: String(text), problems, kind: 'text', records: [], items: [] };
    const step = (meta['ступень'] || '').toLowerCase();
    if (step === 'проверка' || (meta['интерактив'] || '') === 'сортировка') {
      // Конец слова — пробел или конец строки: граница слова в регулярных выражениях JavaScript знает только латиницу.
      const heading = step === 'проверка' ? /^Вопрос(?=\s|$)/i : /^Случай(?=\s|$)/i;
      const { intro, blocks } = MK.splitBlocks(body, name => heading.test(name));
      file.kind = step === 'проверка' ? 'questions' : 'cases';
      file.records = blocks.map(b => Object.assign(MK.parseQuestion(b.lines), {
        id: b.name.replace(heading, '').trim(), line: b.line }));
      file.items = MK.parseProse(intro, { problems });
    } else file.items = MK.parseProse(body, { problems });
    App.files.push(file);
    return file;
  };

  // Строки интерфейса на одном языке: «ключ: значение»; {имя} в значении — место для числа или слова.
  App.ui = function (text) {
    const src = MK.currentScript();
    App.loaded.push(src);
    const { meta, body, problems } = MK.parseHeader(text);
    const strings = MK.parseFields(body, problems, '');
    const lang = meta['язык'] || '';
    App.uiStrings[lang] = { strings, meta, src };
    App.loadProblems.push(...problems.map(p => ({ level: p.level || 'ошибка', file: src, where: 'строка ' + p.line, text: p.text })));
  };

  App.find = (section, step, lang) => App.files.find(f => f.meta['раздел'] === section &&
    (f.meta['ступень'] || '').toLowerCase() === step && (f.meta['язык'] || 'ru') === lang);

  // Файлы, подключённые к странице, но не выполнившиеся (чаще всего из-за обратной кавычки в тексте;
  // сочетание ${…} файл не останавливает — его ловит тест по исходному тексту).
  function missingFiles(expectedSrcs) {
    const loaded = new Set(App.loaded.concat((App.missions || []).map(m => m.src)));
    return expectedSrcs.map(MK.shortName).filter(s => !loaded.has(s));
  }

  // ---------- Проверка всего содержания ----------
  function validate(opts) {
    const o = opts || {};
    const issues = App.loadProblems.slice();
    const stats = { files: 0, questions: 0, cases: 0, cited: 0, unverified: 0, analogies: 0, words: 0, untranslated: 0 };
    const examCodes = App.examMap ? new Set(App.examMap.questions.map(q => q.id)) : null;
    const ctx = { sources: App.sourceList, isRoute, examCodes };
    // Имена интерактивов: на странице — из js/interactives.js, в тестах — переданы списком.
    const known = o.interactives || Object.keys(App.interactives || {});
    const adder = (file) => (level, where, text) => issues.push({ level, file, where, text });

    // Незагрузившиеся файлы
    for (const f of missingFiles(o.expected || [])) {
      issues.push({ level: 'ошибка', file: f, where: 'весь файл', text: 'не загрузился. Чаще всего мешает обратная кавычка в тексте — уберите её.' });
    }

    // Карта разделов. Код раздела (r11) постоянный: по нему раздел находят адреса страниц, файлы ступеней,
    // вопросы, миссии и прогресс на устройстве. Номер — только место в учебнике, его можно менять.
    const ids = new Set(), numbers = new Set();
    for (const s of App.sectionList) {
      const add = adder('content/sections.js');
      const where = 'раздел ' + s.id + ' (строка ' + s.line + ')';
      if (!SECTION_CODE.test(s.id)) add('ошибка', where, 'код раздела — «r» и одна-две цифры, например r11');
      if (ids.has(s.id)) add('ошибка', where, 'раздел встречается дважды');
      ids.add(s.id);
      if (!Number.isInteger(s.no) || s.no < 1) add('ошибка', where, '«номер:» — целое число от 1');
      else if (numbers.has(s.no)) add('ошибка', where, 'номер ' + s.no + ' уже занят другим разделом');
      numbers.add(s.no);
      if (!s.title) add('ошибка', where, 'нет строки «название:»');
      if (!s.lectures) add('предупреждение', where, 'нет строки «лекции:»');
      for (const k of Object.keys(s.plans)) if (!STEPS.some(st => st.name === k)) add('ошибка', where, 'неизвестная ступень в «план.' + k + ':»');
    }
    if (App.sectionList.filter(s => s.flagship).length > 1) adder('content/sections.js')('ошибка', 'флагман', 'флагман может быть только один');

    // Ступени разделов
    const seen = new Set(), questionCodes = new Set();
    for (const file of App.files) {
      stats.files++;
      const add = adder(file.src);
      file.problems.forEach(p => add(p.level || 'ошибка', 'строка ' + p.line, p.text));
      const m = file.meta, lang = m['язык'] || '';
      const step = (m['ступень'] || '').toLowerCase();
      if (!App.sectionList.some(s => s.id === m['раздел'])) add('ошибка', 'шапка', 'неизвестный раздел «' + (m['раздел'] || '') + '»');
      if (!STEPS.some(s => s.name === step)) add('ошибка', 'шапка', 'ступень должна быть одной из: ' + STEPS.map(s => s.name).join(', '));
      if (!MK.LANGS.includes(lang)) add('ошибка', 'шапка', 'язык должен быть ru, kk или en');
      const key = m['раздел'] + '|' + step + '|' + lang;
      if (seen.has(key)) add('ошибка', 'шапка', 'такая ступень на этом языке уже есть в другом файле');
      seen.add(key);
      if (lang === 'ru') {
        if (!STATUSES.includes(m['статус'] || '')) add('ошибка', 'шапка', 'статус русского текста — «черновик» или «готово»');
        if (m['редакция'] && dateKey(m['редакция']) === null) add('ошибка', 'шапка', 'дата в «редакция:» — в виде дд.мм.гггг');
      } else if (lang) {
        if (!TR_STATUSES.includes(m['статус'] || '')) add('ошибка', 'шапка', 'статус перевода — «не проверено носителем» или «проверено носителем»');
        const base = App.find(m['раздел'], step, 'ru');
        if (!base) add('ошибка', 'шапка', 'перевод есть, а русского текста этой ступени нет');
        if (!m['перевод с']) add('ошибка', 'шапка', 'нет строки «перевод с:» — дата русской редакции, с которой сделан перевод');
        else if (dateKey(m['перевод с']) === null) add('ошибка', 'шапка', 'дата в «перевод с:» — в виде дд.мм.гггг');
        else if (base && dateKey(base.meta['редакция']) > dateKey(m['перевод с'])) {
          add('предупреждение', 'шапка', 'перевод устарел: русский текст правился ' + base.meta['редакция'] + ', а перевод сделан с редакции ' + m['перевод с']);
        }
      }
      const st = MK.checkText(file.raw, add, ctx);
      stats.cited += st.cited; stats.unverified += st.unverified;
      stats.words += (file.raw.match(/[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі0-9]+/g) || []).length;
      const walk = items => items.forEach(it => {
        if (it.type === 'callout' && it.kind === 'analogy') stats.analogies++;
        if (it.type === 'interactive' && !known.includes(it.id)) add('ошибка', 'строка ' + it.line, 'нет интерактива «' + it.id + '»');
        if (it.type === 'mission' && !(App.missions || []).some(x => x.meta['миссия'] === it.id && x.meta['мир'] === 'общий')) add('ошибка', 'строка ' + it.line, 'нет миссии «' + it.id + '»');
      });
      walk(file.items);
      if (file.kind === 'questions') file.records.forEach(q => {
        stats.questions++;
        const where = 'вопрос ' + q.id + ' (строка ' + q.line + ')';
        // Код вопроса постоянный: по нему хранится ответ на устройстве и находится перевод. Он начинается
        // с кода своего раздела и не повторяется во всём учебнике (перевод повторяет коды русского текста).
        if (!q.id) add('ошибка', where, 'у вопроса нет кода: «## Вопрос r11-01»');
        else if (!q.id.startsWith(m['раздел'] + '-') || !/^r\d{1,2}-[a-z0-9]{1,12}$/.test(q.id)) {
          add('ошибка', where, 'код вопроса — код раздела, дефис и номер, например ' + (m['раздел'] || 'r11') + '-01');
        }
        if (q.id && questionCodes.has(lang + '|' + q.id)) add('ошибка', where, 'код вопроса «' + q.id + '» уже есть у другого вопроса');
        questionCodes.add(lang + '|' + q.id);
        MK.questionProblems(q).forEach(p => add('ошибка', where, p));
        if (!q.hints.length) add('предупреждение', where, 'нет ни одной подсказки');
        if (!q.sources.length) add('ошибка', where, 'нет строки «источники:»');
        q.sources.forEach(s => { if (!App.sourceList[s.id]) add('ошибка', where, 'нет источника с кодом «' + s.id + '»'); });
      });
      if (file.kind === 'cases') {
        const bins = (m['корзины'] || '').split('|').map(s => s.trim()).filter(Boolean);
        if (bins.length < 2) add('ошибка', 'шапка', 'для сортировки нужны «корзины:» через черту |');
        file.records.forEach((c, n) => {
          stats.cases++;
          const where = 'случай ' + (n + 1) + ' (строка ' + c.line + ')';
          if (!c.stem) add('ошибка', where, 'нет текста случая');
          if (!bins.includes(c.fields['ответ'])) add('ошибка', where, 'ответ «' + (c.fields['ответ'] || '') + '» не совпадает ни с одной корзиной');
          if (!c.fields['разбор']) add('ошибка', where, 'нет строки «разбор:»');
          if (!c.sources.length) add('ошибка', where, 'нет строки «источники:»');
          c.sources.forEach(s => { if (!App.sourceList[s.id]) add('ошибка', where, 'нет источника с кодом «' + s.id + '»'); });
        });
      }
    }
    // Переводы вопросов: те же вопросы и столько же вариантов, что в русском тексте.
    App.files.filter(f => f.kind === 'questions' && f.meta['язык'] !== 'ru').forEach(f => {
      const base = App.find(f.meta['раздел'], 'проверка', 'ru');
      if (!base) return;
      f.records.forEach(q => {
        const b = base.records.find(x => x.id === q.id);
        if (!b) adder(f.src)('ошибка', 'вопрос ' + q.id, 'такого вопроса нет в русском тексте');
        else if (b.options.length !== q.options.length) adder(f.src)('ошибка', 'вопрос ' + q.id, 'число вариантов отличается от русского текста');
      });
    });

    // Карта к экзамену: коды лекций и вопросов, место «раздел ступень», число в «всего:» шапки.
    if (App.examMap) {
      const E = App.examMap, add = adder(E.src), codes = new Set(), lectureCodes = new Set();
      for (const l of E.lectures) {
        const where = 'лекция ' + l.id + ' (строка ' + l.line + ')';
        if (!EXAM_LECTURE.test(l.id)) add('ошибка', where, 'код лекции — «l» и две цифры, например l14');
        if (lectureCodes.has(l.id)) add('ошибка', where, 'лекция ' + l.id + ' уже есть в карте');
        lectureCodes.add(l.id);
        const first = (l.lecture.match(/^\d+/) || [''])[0];
        if (!l.lecture) add('ошибка', where, 'нет строки «лекция:» — номер лекции, например 14–15');
        else if (!first || 'l' + first.padStart(2, '0') !== l.id) add('ошибка', where, 'код лекции не совпадает с номером в «лекция: ' + l.lecture + '»: нужен l' + (first || '??').padStart(2, '0'));
        if (!l.topic) add('ошибка', where, 'нет строки «тема:»');
        if (!l.questions.length) add('ошибка', where, 'в лекции нет ни одного вопроса');
      }
      for (const q of E.questions) {
        const where = 'вопрос ' + (q.id || '?') + ' (строка ' + q.line + ')';
        if (!EXAM_CODE.test(q.id) || !q.id.startsWith(q.lectureId + '-')) add('ошибка', where, 'код вопроса — код лекции, дефис и две цифры, например ' + q.lectureId + '-01');
        if (codes.has(q.id)) add('ошибка', where, 'код «' + q.id + '» уже есть у другого вопроса');
        codes.add(q.id);
        if (!App.sectionList.some(s => s.id === q.section)) add('ошибка', where, 'нет раздела «' + q.section + '» в карте разделов');
        if (!STEPS.some(s => s.name === q.step)) add('ошибка', where, 'ступень — одна из: ' + STEPS.map(s => s.name).join(', '));
        if (q.extra) add('ошибка', where, 'место — два слова: код раздела и ступень, например «r11 просто»');
        if (!q.text) add('ошибка', where, 'нет текста вопроса');
      }
      if (String(E.questions.length) !== E.meta['всего']) add('ошибка', 'шапка', 'в шапке «всего: ' + (E.meta['всего'] || '') + '», а вопросов в карте — ' + E.questions.length);
      const cov = examCoverage();
      stats.examTotal = cov.total; stats.examCovered = cov.covered;
    }

    // Строки интерфейса: русский файл обязателен; в переводе — только ключи русского файла
    // и те же {места} для чисел; недостающие строки показываются по-русски.
    const ru = App.uiStrings.ru;
    if (!ru) issues.push({ level: 'ошибка', file: 'content/ui/ru.js', where: 'весь файл', text: 'нет строк интерфейса на русском' });
    for (const [lang, pack] of Object.entries(App.uiStrings)) {
      const add = adder(pack.src);
      if (!MK.LANGS.includes(lang)) { add('ошибка', 'шапка', 'язык должен быть ru, kk или en'); continue; }
      MK.checkText(Object.values(pack.strings).join('\n'), add, Object.assign({}, ctx, { examForbidden: 'в строках интерфейса меток нет' }));
      if (lang === 'ru' || !ru) continue;
      if (!TR_STATUSES.includes(pack.meta['статус'] || '')) add('ошибка', 'шапка', 'статус перевода — «не проверено носителем» или «проверено носителем»');
      const holes = s => (String(s).match(/\{[^}]+\}/g) || []).sort().join(' ');
      for (const [k, v] of Object.entries(pack.strings)) {
        if (!(k in ru.strings)) add('ошибка', k, 'такой строки нет в русском файле');
        else if (holes(v) !== holes(ru.strings[k])) add('ошибка', k, 'места для чисел {…} не совпадают с русской строкой');
      }
      // Строки «миссия.…» не переводятся: миссии пока только на русском.
      stats.untranslated += Object.keys(ru.strings).filter(k => !k.startsWith('миссия.') && !(k in pack.strings)).length;
    }

    // Миссии — своя проверка (js/mission-text.js), если она подключена.
    if (App.missionText && App.missions) {
      for (const i of App.missionText.validate(App.missions, o.model, App.sourceList, { isRoute, sections: App.sectionList })) issues.push(i);
    }
    return { issues, stats };
  }

  App.model = { STEPS, STATUSES, TR_STATUSES, parseRoute, isRoute, dateKey, missingFiles, validate, examCoverage };
  if (typeof module !== 'undefined' && module.exports) module.exports = App;
})(typeof self !== 'undefined' ? self : globalThis);
