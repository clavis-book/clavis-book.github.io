// Экран игровой миссии. Сейчас в учебнике одна миссия — Р11-01 «Повтор одноразового числа» в мире
// «Бюро „Кілт“». Пять этапов: вводная, журнал эфира, гамма, предписание, заключение.
// Тексты — content/missions/<код>/ (общий файл и мир), модель — models/<модель>.js, надписи —
// строки «миссия.…» в content/ui/ru.js. Миссии пока только на русском.
// Рамка 1: модель работает только с форматом полигона — страница передаёт ей данные из файла мира.
(function () {
  'use strict';
  const App = window.App, V = App.view, T = App.missionText;
  const { h } = V;
  const SPACE = '·';                    // так на экране показан пробел — знак алфавита полигона
  const DAY = { messages: 20000, sessionLength: 500 };
  const STAGES = ['brief', 'log', 'strip', 'fix', 'debrief'];
  const MODELS = { 'nonce-reuse': typeof NonceReuse !== 'undefined' ? NonceReuse : null };

  const t = (key, params) => V.t('миссия.' + key, params);
  const fmt = n => new Intl.NumberFormat('ru-RU').format(n);
  const pluralRu = (key, n) => {
    const forms = t(key).split('|').map(s => s.trim());
    return forms[Math.min({ one: 0, few: 1 }[new Intl.PluralRules('ru-RU').select(n)] ?? 2, forms.length - 1)];
  };
  // Проценты без ложных «100 %»: знаков после запятой столько, чтобы не округлить до ста.
  const pct = x => {
    let d = 0, s;
    do { s = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).format(x * 100); d++; }
    while (d < 7 && x < 1 && s.startsWith('100'));
    return s + ' %';
  };
  const show = c => (c === ' ' ? SPACE : c);
  const pad = iv => String(iv).padStart(2, '0');

  let id = null, W = null, C = null, M = null, run = null;   // миссия, мир, общий файл, модель, прохождение

  // ---------- Сцены: реплики героев, пункты, выноски, абзацы ----------
  const initials = name => name.replace(/[^A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/g, '').slice(0, 1).toUpperCase();
  function say(it, ctx) {
    const i = Math.max(0, W.cast.findIndex(c => c.name === it.who));
    return h('div', { class: 'say who-' + (i % 3) },
      h('span', { class: 'av', 'aria-hidden': 'true' }, initials(it.who)),
      h('p', { class: 'line' }, h('b', { class: 'name' }, it.who + '.'), ' ', V.inline(it.text, ctx)));
  }
  function scene(key, ctx, from) {
    const m = from || W;
    return V.renderProse(m.scenes[key.toLowerCase()] || [], ctx, { say, ulClass: m === C ? 'facts' : 'goals' });
  }
  const field = (block, key, from) => (((from || W).fields[block] || {})[key.toLowerCase()]) || '';
  const firstLine = (m, key) => ((m.scenes[key] || [])[0] || {}).text || '';
  const stageName = i => T.list(field('мир', 'этапы'))[i];
  const section = () => App.sectionList.find(s => s.id === field('миссия', 'раздел', C));

  // ---------- Вход: проверить тексты и начать (или продолжить) прохождение ----------
  function open(missionId) {
    if (missionId !== id || !run) {
      id = missionId;
      C = T.commonOf(App.missions, id);
      W = T.worldsOf(App.missions, id)[0];
      M = C && MODELS[field('миссия', 'модель', C)];
      const own = App.missions.filter(m => m.meta['миссия'] === id);
      const errors = (!C || !W) ? [{ file: id, where: '', text: t('нет-файлов') }]
        : !M ? [{ file: C.src, where: 'блок «миссия»', text: t('нет-модели', { модель: field('миссия', 'модель', C) }) }]
        : T.validate(own, M, App.sourceList, { isRoute: App.model.isRoute, sections: App.sectionList }).filter(i => i.level === 'ошибка');
      if (errors.length) { run = null; id = null; return errorScreen(errors); }
      restart();
    } else render();
  }
  function restart() {
    // place — на каком месте из трёх стоит верный ответ на шагах 1 и 2 «Гаммы»: в каждом прохождении своё,
    // чтобы ответ нужно было отсчитать, а не запомнить по букве варианта.
    const place = () => Math.floor(Math.random() * 3);
    run = { stage: 'brief', sc: M.scenario(T.polygonOf(W)), picked: [], misses: 0, hintShown: false, stripMisses: 0,
      place: [place(), place()], tried: {}, results: {}, current: null, riddleShown: false, riddleMisses: 0, riddleOk: false };
    render();
  }
  // Забыть прохождение: следующий вход в миссию начнёт её сначала («Пройти ещё раз» на карточке миссии).
  function reset() { run = null; }
  function errorScreen(errors) {
    document.getElementById('app').replaceChildren(h('section', { class: 'page' },
      h('h1', {}, t('ошибки.заголовок')),
      h('p', {}, t('ошибки.пояснение')),
      h('ul', {}, errors.map(e => h('li', {}, App.markup.shortName(e.file) + (e.where ? ', ' + e.where : '') + ': ' + e.text))),
      h('p', {}, h('a', { href: '#model' }, t('ошибки.все')))));
    V.focusTitle(document.getElementById('app'));
  }

  function go(stage) { run.stage = stage; render(); }
  function render() {
    const app = document.getElementById('app');
    const names = T.list(field('мир', 'этапы'));
    const idx = STAGES.indexOf(run.stage);
    const sec = section();
    const head = h('header', { class: 'case-head' },
      h('nav', { class: 'crumbs', 'aria-label': V.t('путь') },
        h('a', { href: '#karta', lang: V.lang() }, V.t('карта.заголовок')), ' / ',
        h('a', { href: '#' + sec.id + '-poprobuy' }, V.t('раздел.номер', { n: sec.no }) + '. ' + sec.title)),
      h('p', { class: 'world-name' }, field('мир', 'название'), h('span', {}, ' — ' + field('мир', 'жанр'))),
      h('h1', { tabindex: '-1' }, firstLine(W, 'титул')),
      h('ol', { class: 'track', 'aria-label': t('этапы') }, names.map((n, i) =>
        h('li', { class: i < idx ? 'done' : (i === idx ? 'now' : null), 'aria-current': i === idx ? 'step' : null }, h('span', { class: 'tn' }, n)))));
    const body = { brief: briefStage, log: logStage, strip: stripStage, fix: fixStage, debrief: debriefStage }[run.stage]();
    app.replaceChildren(h('div', { class: 'mission w-' + W.meta['мир'], lang: 'ru' },
      V.lang() !== 'ru' ? h('p', { class: 'draft-lang', lang: V.lang() }, V.t('миссии.только-русский')) : null,
      h('section', { class: 'page play' }, head, body)));
    window.scrollTo(0, 0);
    V.focusTitle(app);
  }
  const nextBtn = (key, stage) => h('button', { type: 'button', class: 'btn next', onclick: () => go(stage) }, t(key, { этап: stageName(STAGES.indexOf(stage)).toLowerCase() }));
  const live = () => h('div', { class: 'feedback', 'aria-live': 'polite' });
  // Задание этапа; в режиме «Группой» — с подсказкой, как голосовать.
  const task = (key, params) => h('p', { class: 'task' }, t(key, params), h('span', { class: 'group-only' }, ' ' + t('группой.голосование')));
  // Части ответа приходят вложенными массивами; пустые (null, false) пропускаются.
  function setFeedback(box, nodes, kind) {
    box.className = 'feedback' + (kind ? ' ' + kind : '');
    box.replaceChildren(...[nodes].flat(Infinity).filter(x => x != null && x !== false));
  }
  // На телефоне ответ может оказаться за краем экрана: тогда прокручиваем к его началу.
  function bringIntoView(el) {
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight * 0.6) el.scrollIntoView({ block: 'start', behavior: V.reduceMotion() ? 'auto' : 'smooth' });
  }

  // ---------- 1. Вводная: брифинг, как шифрует полигон, цели ----------
  function briefStage() {
    const ctx = V.newCtx();
    const ex = { text: 'КОТ', g: [3, 17, 5] };
    const exOut = Array.from(ex.text, (c, i) => M.shiftLetter(c, ex.g[i], 'ru')).join('');
    return h('div', { class: 'stage' },
      h('div', { class: 'dialog' }, scene('брифинг', ctx)),
      h('section', { class: 'device', 'aria-labelledby': 'dev-h' },
        h('h2', { id: 'dev-h' }, t('устройство')),
        scene('устройство', ctx, C),
        h('figure', { class: 'scheme' },
          h('div', { class: 'eq' },
            h('span', { class: 'tag' }, t('схема.ключ')), h('span', { class: 'op' }, '+'), h('span', { class: 'tag' }, t('схема.число')),
            h('span', { class: 'op' }, '='), h('span', { class: 'tag g' }, t('схема.гамма'))),
          h('div', { class: 'cols' }, Array.from(ex.text, (c, i) => h('div', { class: 'excol' },
            h('span', { class: 'p' }, c), h('span', { class: 's' }, '+' + ex.g[i]), h('span', { class: 'c' }, exOut[i])))),
          h('figcaption', {}, t('схема.пример', { слово: ex.text, гамма: ex.g.join(', '), шифр: exOut })))),
      h('p', { class: 'fiction' }, field('мир', 'пометка')),
      V.sourcesBlock(ctx),
      nextBtn('открыть', 'log'));
  }

  // ---------- 2. Журнал эфира: найти два сообщения с одинаковым одноразовым числом ----------
  function logStage() {
    const ctx = V.newCtx();
    const sc = run.sc, p = T.polygonOf(W);
    run.picked = [];                      // этап открыт заново — выбор в журнале начинается с нуля
    const fb = live();
    const counter = h('p', { class: 'picked', 'aria-live': 'polite' }, t('журнал.выбрано', { n: 0 }));
    const rows = sc.entries.map(e => h('button', {
      type: 'button', class: 'msg', 'aria-pressed': 'false',
      'aria-label': t('журнал.сообщение', { номер: e.no, метка: p.marks[e.no - 1] ? ', ' + p.marks[e.no - 1] : '', число: pad(e.iv) }),
      onclick: ev => pick(e, ev.currentTarget)
    },
      h('span', { class: 'no' }, e.no),
      h('span', { class: 'mark' }, p.marks[e.no - 1] || ''),
      h('span', { class: 'iv' }, pad(e.iv)),
      h('span', { class: 'ct', 'aria-hidden': 'true' }, Array.from(e.cipher, show).join(''))));
    const list = h('div', { class: 'log' + (run.hintShown ? ' hint-iv' : '') },
      h('div', { class: 'log-head', 'aria-hidden': 'true' }, h('span', {}, '№'), h('span', {}, p.marksTitle),
        h('span', {}, t('журнал.колонка-число')), h('span', {}, t('журнал.колонка-шифровка'))),
      rows);
    let done = false;
    function pick(e, btn) {
      if (done) return;
      const i = run.picked.indexOf(e.no);
      if (i >= 0) { run.picked.splice(i, 1); btn.setAttribute('aria-pressed', 'false'); }
      else if (run.picked.length < 2) { run.picked.push(e.no); btn.setAttribute('aria-pressed', 'true'); }
      counter.textContent = t('журнал.выбрано', { n: run.picked.length });
      if (run.picked.length < 2) return;
      const [a, b] = run.picked.map(no => sc.entries[no - 1]);
      if (a.iv === b.iv) {
        done = true;
        rows.forEach((r, k) => { r.classList.toggle('pair', sc.entries[k].iv === sc.iv); r.setAttribute('aria-disabled', 'true'); });
        const [x, y] = [a.no, b.no].sort((u, v) => u - v);
        setFeedback(fb, [
          h('p', { class: 'verdict ok' }, t('журнал.пара', { a: x, b: y, число: pad(a.iv) })),
          scene('журнал.есть', ctx),
          h('p', { class: 'fact' }, t('журнал.факт', { n: sc.entries.length, p: pct(M.chanceOfRepeat(sc.entries.length, 100)), класс: M.halfChanceAt(365) })),
          nextBtn('дальше', 'strip')], 'ok');
        fb.querySelector('.next').focus({ preventScroll: true });
        bringIntoView(fb);
      } else {
        run.misses++;
        const nodes = [h('p', { class: 'verdict bad' }, t('журнал.не-пара', { a: a.no, ia: pad(a.iv), b: b.no, ib: pad(b.iv) })), scene('журнал.мимо', ctx)];
        if (run.misses >= 2) { run.hintShown = true; list.classList.add('hint-iv'); nodes.push(scene('журнал.подсказка', ctx)); }
        setFeedback(fb, nodes, 'bad');
        bringIntoView(fb);
        run.picked = [];
        rows.forEach(r => r.setAttribute('aria-pressed', 'false'));
        counter.textContent = t('журнал.выбрано', { n: 0 });
      }
    }
    return h('div', { class: 'stage' },
      h('h2', {}, stageName(1)),
      h('div', { class: 'dialog' }, scene('журнал.задание', ctx)),
      task('журнал.как'),
      counter, fb, list);
  }

  // ---------- 3. Гамма: шаг гаммы, первая буква секрета, остаток первого слова — сам; дальше само ----------
  function stripStage() {
    const ctx = V.newCtx();
    const sc = run.sc, lang = sc.lang, abc = M.ALPHABETS[lang];
    const [g, s] = sc.pair.map(no => sc.entries[no - 1]);
    const known = sc.greeting, shift = sc.firstShift;
    const secretGuess = M.readWithKnown(g.cipher, known, s.cipher, lang).join('');
    const wordLen = T.firstWordLength(sc.secret);
    const stepAt = i => M.shiftBetween(known[i], g.cipher[i], lang);
    // Колонки сгруппированы по словам приветствия, чтобы лента переносилась между словами.
    const cols = Array.from(known, (ch, i) => {
      const cell = (cls, text) => h('span', { class: 'cell ' + cls }, text);
      return h('div', { class: 'col' + (i === 0 ? ' focus' : '') },
        cell('r1', show(g.cipher[i])), cell('r2', show(ch)), cell('r3', '?'),
        cell('r4', i < s.cipher.length ? show(s.cipher[i]) : ''), cell('r5', i < s.cipher.length ? '?' : ''));
    });
    const words = [];
    let cur = null;
    cols.forEach((c, i) => { if (!cur || known[i - 1] === ' ') { cur = h('div', { class: 'word' }); words.push(cur); } cur.append(c); });
    const legend = h('ul', { class: 'legend' },
      h('li', { class: 'r1' }, t('лента.r1', { номер: g.no })), h('li', { class: 'r2' }, t('лента.r2')), h('li', { class: 'r3' }, t('лента.r3')),
      h('li', { class: 'r4' }, t('лента.r4', { номер: s.no })), h('li', { class: 'r5' }, t('лента.r5')));
    // На телефоне до ответа видно только первое слово ленты — вопрос рядом, а не через два экрана.
    const rest = words.length - 1;
    const strip = h('div', { class: 'strip pre', role: 'img', 'aria-label': t('лента.описание') }, words,
      rest > 0 ? h('p', { class: 'strip-more', 'aria-hidden': 'true' }, t('лента.ещё', { n: rest, слов: pluralRu('слово-формы', rest) })) : null);
    // Линейка алфавита. На шаге «дочитай слово» она же — клавиатура: стрелки, буквы с клавиатуры, Enter.
    const keys = Array.from(abc, (ch, i) => h('button', { type: 'button', class: 'rc', 'data-ch': ch, disabled: true, tabindex: '-1',
      'aria-label': t('линейка.буква', { буква: ch === ' ' ? t('линейка.пробел') : ch, номер: i }), onclick: () => onKey && onKey(ch) },
      h('b', {}, show(ch)), h('small', {}, i)));
    const ruler = h('div', { class: 'ruler', role: 'group', 'aria-label': t('линейка.подпись') }, keys);
    const mark = (...chs) => keys.forEach(el => el.classList.toggle('on', chs.includes(el.dataset.ch)));
    let onKey = null;
    function keyboard(on) {
      keys.forEach((k, i) => { k.disabled = !on; k.tabIndex = on && i === 0 ? 0 : -1; });
      ruler.classList.toggle('keys', on);
    }
    // Буквы с клавиатуры принимаются, где бы ни был фокус на этапе; стрелки — внутри линейки.
    const onKeydown = ev => {
      if (!onKey || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const i = keys.indexOf(document.activeElement);
      const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
      let j = null;
      if (move && i >= 0) j = (i + move + keys.length) % keys.length;
      else if (ev.key === 'Home') j = 0;
      else if (ev.key === 'End') j = keys.length - 1;
      else if (ev.key.length === 1 && ev.key !== ' ' && abc.includes(ev.key.toUpperCase())) { ev.preventDefault(); onKey(ev.key.toUpperCase()); return; }
      if (j == null) return;
      ev.preventDefault();
      keys.forEach((k, n) => { k.tabIndex = n === j ? 0 : -1; });
      keys[j].focus();
    };
    const fb = live();
    const qBox = h('div', { class: 'qbox' });
    const setCell = (i, row, text, cls) => { const el = cols[i].querySelector('.' + row); el.textContent = text; if (cls) el.classList.add(cls); };
    const focusOn = i => cols.forEach((c, k) => c.classList.toggle('focus', k === i));
    const focusH3 = () => qBox.querySelector('h3').focus({ preventScroll: true });

    function options(list, correct, onRight, onWrong) {
      const btns = list.map((o, k) => h('button', { type: 'button', class: 'opt', 'data-letter': 'АБВГ'[k], onclick: ev => {
        if (ev.currentTarget.getAttribute('aria-disabled') === 'true') return;
        if (o.value === correct) { btns.forEach(b => b.setAttribute('aria-disabled', 'true')); ev.currentTarget.classList.add('right'); onRight(); }
        else { ev.currentTarget.classList.add('wrong'); ev.currentTarget.setAttribute('aria-disabled', 'true'); onWrong(); }
      } }, o.label));
      return h('div', { class: 'opts' }, btns);
    }

    // Шаг 1. На сколько сдвинута первая буква приветствия.
    function askShift() {
      mark(known[0], g.cipher[0]);
      // Три числа подряд: соседние — типичные ошибки (забыть букву Ё, посчитать первую букву вместе с последней).
      // Верное стоит на месте run.place[0]; меньше единицы варианты не опускаются.
      const first = Math.max(1, shift - run.place[0]);
      const opts = [first, first + 1, first + 2].map(v => ({ value: v, label: t('шаг1.вариант', { n: v }) }));
      V.fill(qBox, 
        h('h3', { tabindex: '-1' }, t('шаг1.заголовок')),
        h('p', {}, t('шаг1.вопрос', { буква: show(known[0]), шифр: show(g.cipher[0]), номер: g.no })),
        options(opts, shift, () => {
          setCell(0, 'r3', '+' + shift, 'got');
          setFeedback(fb, scene('гамма.сдвиг-верно', ctx), 'ok');
          askLetter();
        }, () => {
          run.stripMisses++;
          setFeedback(fb, [scene('гамма.сдвиг-мимо', ctx), h('p', { class: 'hint' }, t('шаг1.подсказка',
            { буква: show(known[0]), nб: abc.indexOf(known[0]), шифр: show(g.cipher[0]), nш: abc.indexOf(g.cipher[0]) }))], 'bad');
        }));
    }
    // Шаг 2. Первая буква секрета — на выбор из трёх.
    function askLetter() {
      const c = s.cipher[0], right = secretGuess[0];
      mark(c);
      // Три буквы подряд: ответ не угадать по виду, его нужно отсчитать. Верная — на месте run.place[1].
      const vals = [0, 1, 2].map(k => M.shiftLetter(right, k - run.place[1], lang));
      V.fill(qBox, 
        h('h3', { tabindex: '-1' }, t('шаг2.заголовок')),
        h('p', {}, t('шаг2.вопрос', { номер: s.no, шифр: show(c), шаг: shift })),
        options(vals.map(v => ({ value: v, label: '«' + show(v) + '»' })), right, () => {
          setCell(0, 'r5', show(right), 'got');
          setFeedback(fb, scene('гамма.буква-верно', ctx), 'ok');
          if (wordLen > 1) askWord(1); else wordDone();
        }, () => {
          run.stripMisses++;
          setFeedback(fb, [scene('гамма.буква-мимо', ctx), h('p', { class: 'hint' }, t('шаг2.подсказка', { шифр: show(c), n: abc.indexOf(c), шаг: shift }))], 'bad');
        }));
      focusH3();
    }
    // Шаг 3. Остаток первого слова игрок дочитывает сам: буква за буквой, на линейке или с клавиатуры.
    // Подсказки на промах — как на других шагах: сначала номера букв, потом шаг, потом номер ответа.
    function askWord(i) {
      const right = secretGuess[i], step = stepAt(i);
      let misses = 0;
      focusOn(i);
      mark(known[i], g.cipher[i], s.cipher[i]);
      keyboard(true);
      const read = h('p', { class: 'word-read', 'aria-live': 'polite' }, t('шаг3.прочитано', { слово: secretGuess.slice(0, i) }));
      onKey = ch => {
        if (ch === right) {
          onKey = null;
          setCell(i, 'r3', '+' + step, 'got'); setCell(i, 'r5', show(right), 'got');
          if (i + 1 < wordLen) { setFeedback(fb, h('p', {}, t('шаг3.верно', { буква: show(right) })), 'ok'); askWord(i + 1); }
          else wordDone();
          return;
        }
        misses++; run.stripMisses++;
        const hints = [h('p', { class: 'hint' }, t('шаг3.подсказка1', { прив: show(known[i]), nп: abc.indexOf(known[i]), г: g.no, с: s.no,
          шифр1: show(g.cipher[i]), n1: abc.indexOf(g.cipher[i]), шифр2: show(s.cipher[i]), n2: abc.indexOf(s.cipher[i]) }))];
        if (misses >= 2) {
          // Шаг выводится из номеров; если буква шифровки на линейке левее — через конец алфавита.
          const nп = abc.indexOf(known[i]), n1 = abc.indexOf(g.cipher[i]);
          hints.push(h('p', { class: 'hint' }, t(n1 >= nп ? 'шаг3.подсказка2' : 'шаг3.подсказка2-круг',
            { nп, n1, шаг: step, n2: abc.indexOf(s.cipher[i]), всего: abc.length })));
        }
        if (misses >= 3) hints.push(h('p', { class: 'hint' }, t('шаг3.подсказка3', { номер: abc.indexOf(right) })));
        setFeedback(fb, [h('p', { class: 'verdict bad' }, t('шаг3.мимо', { буква: show(ch) })), scene('гамма.слово-мимо', ctx), hints], 'bad');
      };
      V.fill(qBox, 
        h('h3', { tabindex: '-1' }, t('шаг3.заголовок', { k: i + 1, всего: wordLen })),
        i === 1 ? h('p', {}, t('шаг3.задание', { номер: s.no, г: g.no, всего: abc.length })) : null,
        h('p', {}, t('шаг3.буква', { прив: show(known[i]), г: g.no, шифр1: show(g.cipher[i]), с: s.no, шифр2: show(s.cipher[i]) })),
        read);
      // Заголовок шага заменён: если фокус был в нём, он ушёл бы со страницы, и буквы с клавиатуры стенд бы не слышал.
      if (i === 1 || !stage.contains(document.activeElement)) focusH3();
    }
    function wordDone() {
      keyboard(false); mark(); onKey = null;
      setFeedback(fb, scene('гамма.слово-готово', ctx), 'ok');
      V.fill(qBox, h('h3', { tabindex: '-1' }, t('шаг3.готово', { слово: secretGuess.slice(0, wordLen) })));
      focusH3();
      reveal();
    }
    // Остальное стенд досчитывает сам; без анимации — если в системе просили меньше движения.
    function reveal() {
      strip.classList.remove('pre');
      focusOn(-1);
      const fill = i => {
        setCell(i, 'r3', '+' + stepAt(i));
        if (i < s.cipher.length) setCell(i, 'r5', show(secretGuess[i]), 'open');
      };
      const finish = () => {
        ruler.hidden = true;
        // Реплики про первое слово прозвучали раньше раскрытия — ставим их над итогом, а не под кнопкой «Дальше».
        qBox.before(fb);
        V.fill(qBox, 
          h('h3', { tabindex: '-1' }, t('секрет.заголовок')),
          h('p', { class: 'secret' }, sc.secret),
          h('div', { class: 'dialog' }, scene('секрет.прочитан', ctx), scene('почему.коротко', ctx)),
          nextBtn('дальше', 'fix'));
        focusH3();
        bringIntoView(qBox);
      };
      if (V.reduceMotion()) { for (let i = wordLen; i < known.length; i++) fill(i); finish(); return; }
      let i = wordLen;
      const tick = () => { if (!document.body.contains(strip)) return; if (i < known.length) { fill(i++); setTimeout(tick, 55); } else finish(); };
      setTimeout(tick, 900);
    }

    const stage = h('div', { class: 'stage' },
      h('h2', {}, stageName(2)),
      h('div', { class: 'dialog' }, scene('гамма.задание', ctx)),
      legend, strip, qBox, fb, ruler);
    stage.addEventListener('keydown', onKeydown);
    askShift();
    return stage;
  }

  // ---------- 4. Предписание: правило для одноразового числа, сутки эфира, загадка ----------
  function fixStage() {
    const ctx = V.newCtx();
    const rules = M.RULES;
    const fb = live();
    const riddleBox = h('div', { class: 'riddle' });
    const card = rule => {
      const r = run.results[rule];
      return h('button', { type: 'button', class: 'rule' + (r ? (r.repeats ? ' bad' : ' ok') : ''), 'data-letter': 'АБВГ'[rules.indexOf(rule)],
        'aria-pressed': run.current === rule ? 'true' : 'false', onclick: () => choose(rule) },
        h('span', { class: 'rl' }, field('правила', rule, C)),
        h('span', { class: 'rs' }, r ? (r.repeats ? t('защита.повторов', { n: fmt(r.repeats) }) : t('защита.без-повторов')) : t('защита.не-проверено')));
    };
    const grid = h('div', { class: 'rules' }, rules.map(card));
    function choose(rule) {
      run.current = rule;
      const r = run.results[rule] || (run.results[rule] = M.simulate(rule, DAY));
      run.tried[rule] = true;
      grid.replaceChildren(...rules.map(card));
      const max = Math.max(...r.bins), binSize = DAY.messages / r.bins.length;
      const rug = h('div', { class: 'rug', role: 'img', 'aria-label': r.repeats ? t('защита.ковёр-есть', { n: r.bins.filter(Boolean).length, всего: r.bins.length }) : t('защита.ковёр-нет') },
        r.bins.map(v => { const c = h('span', { class: v ? 'hit' : null }); if (v) c.style.opacity = String(Math.max(0.4, v / Math.max(1, Math.min(max, binSize)))); return c; }));
      const extra = rule === 'random24' ? h('p', { class: 'fact' }, t('защита.факт24', { p: pct(M.chanceOfRepeat(DAY.messages, 2 ** 24)),
        порог: fmt(M.halfChanceAt(2 ** 24)), среднее: Math.round(M.expectedRepeats(DAY.messages, 2 ** 24)) })) : null;
      setFeedback(fb, [
        h('h3', { tabindex: '-1' }, field('правила', rule, C)),
        h('div', { class: 'stats' },
          h('p', {}, h('b', {}, fmt(r.repeats)), h('span', {}, t('защита.стат-повторов'))),
          h('p', {}, h('b', {}, r.firstRepeat ? '№ ' + fmt(r.firstRepeat) : t('защита.нет')), h('span', {}, t('защита.первый'))),
          h('p', {}, h('b', { class: 'chip ' + (r.repeats ? 'bad' : 'ok') }, t(r.repeats ? 'защита.опасно' : 'защита.безопасно')), h('span', {}, t('защита.итог')))),
        rug,
        h('p', { class: 'rug-axis', 'aria-hidden': 'true' }, h('span', {}, '1'), h('span', {}, fmt(DAY.messages / 2)), h('span', {}, fmt(DAY.messages))),
        h('p', { class: 'note-small' }, t('защита.клетка', { n: fmt(binSize) })),
        h('p', {}, V.inline(field('правила.итог', rule, C), ctx)),
        extra,
        h('div', { class: 'dialog' }, scene('защита.' + rule, ctx)),
        V.sourcesBlock(ctx, t('защита.источники'))], r.repeats ? 'bad' : 'ok');
      ctx.cites = [];
      fb.querySelector('h3').focus({ preventScroll: true });
      bringIntoView(fb);
      if (run.tried.counter && run.tried.counterReset && !run.riddleShown) showRiddle();
      else if (run.tried.counter && !run.tried.counterReset) fb.append(h('p', { class: 'task' }, t('защита.ещё-правило')));
    }
    function showRiddle() {
      run.riddleShown = true;
      const q = C.scenes['загадка'];
      const answer = h('div', { class: 'feedback', 'aria-live': 'polite' });
      const right = q.options.findIndex(o => o.correct);
      // Загадка решена: разбор верного ответа, реплики и кнопка «Дальше». Каждый ответ показывается
      // со своим списком источников.
      function solved() {
        const actx = V.newCtx();
        btns[right].classList.add('right'); btns.forEach(x => x.setAttribute('aria-disabled', 'true'));
        setFeedback(answer, [h('p', {}, V.inline(q.options[right].why, actx)), h('div', { class: 'dialog' }, scene('загадка.верно', actx)),
          V.sourcesBlock(actx), nextBtn('дальше', 'debrief')], 'ok');
      }
      const btns = q.options.map((o, k) => h('button', { type: 'button', class: 'opt', 'data-letter': 'АБВГ'[k], onclick: ev => {
        const b = ev.currentTarget;
        if (b.getAttribute('aria-disabled') === 'true') return;
        if (o.correct) {
          run.riddleOk = true;
          solved();
          answer.querySelector('.next').focus();
        } else {
          const actx = V.newCtx();
          run.riddleMisses++;
          b.classList.add('wrong'); b.setAttribute('aria-disabled', 'true');
          setFeedback(answer, [h('p', {}, V.inline(o.why, actx)), h('div', { class: 'dialog' }, scene('загадка.мимо', actx)), V.sourcesBlock(actx)], 'bad');
        }
      } }, V.inline(o.text, null)));
      V.fill(riddleBox, h('h3', {}, t('загадка.заголовок')), h('p', { class: 'q-stem' }, V.inline(q.stem, null)), h('div', { class: 'opts' }, btns), answer);
      // Игрок решил загадку, ушёл со страницы и вернулся: ответ и кнопка «Дальше» на месте, тупика нет.
      if (run.riddleOk) solved();
    }
    const stage = h('div', { class: 'stage' },
      h('h2', {}, stageName(3)),
      h('div', { class: 'dialog' }, scene('защита.задание', ctx)),
      task('защита.как', { n: fmt(DAY.messages), сеанс: DAY.sessionLength }),
      grid, fb, riddleBox);
    if (run.riddleShown) { run.riddleShown = false; setTimeout(showRiddle); }
    return stage;
  }

  // ---------- 5. Заключение: финал мира, разбор с источниками, карточки и награды ----------
  // Карточки и награды попадают в общую коллекцию учебника — только на этом устройстве и без имени.
  function debriefStage() {
    const ctx = V.newCtx();
    const sec = section();
    const badges = [
      { id: 'world:' + W.meta['мир'], name: field('мир', 'значок'), got: true, how: t('награда.мир-как') },
      { id: 'clean', name: t('награда.чисто'), got: run.misses === 0 && run.stripMisses === 0, how: t('награда.чисто-как') },
      { id: 'tester', name: t('награда.испытатель'), got: M.RULES.every(r => run.tried[r]), how: t('награда.испытатель-как') },
      { id: 'riddle', name: t('награда.сразу'), got: run.riddleMisses === 0, how: t('награда.сразу-как') }
    ];
    // В коллекции и в прогрессе — постоянные коды (r11-m01:nonce, missiya-r11-m01), а не тексты.
    const cards = T.cardsOf(C);
    badges.forEach(b => { if (b.got) V.collection.add('badges', id + ':' + b.id); });
    cards.forEach(c => V.collection.add('cards', id + ':' + c.code));
    App.markDone(sec.id, 'missiya-' + id);
    const part = (title, key) => h('section', { class: 'deb' }, h('h2', {}, title), scene(key, ctx, C));
    return h('div', { class: 'stage' },
      h('h2', {}, stageName(4)),
      h('div', { class: 'dialog' }, scene('финал', ctx)),
      h('div', { class: 'stamp', role: 'img', 'aria-label': t('итог.печать', { значок: field('мир', 'значок') }) }, h('span', {}, field('мир', 'значок'))),
      part(t('итог.почему'), 'почему'),
      h('section', { class: 'deb timeline' }, h('h2', {}, t('итог.в-мире')), scene('в мире', ctx, C)),
      part(t('итог.сильнее'), 'сильнее'),
      V.callout('honest', t('итог.упрощение'), scene('упрощение', ctx, C)),
      h('section', { class: 'deb' }, h('h2', {}, t('итог.карточки')),
        h('div', { class: 'cards' }, cards.map(c => h('article', { class: 'term' }, h('h3', {}, c.term), h('p', {}, V.inline(c.text, ctx)))))),
      h('section', { class: 'deb' }, h('h2', {}, t('итог.награды')),
        h('ul', { class: 'badges' }, badges.map(b => h('li', { class: b.got ? 'got' : null },
          h('b', {}, b.name), h('span', {}, ' — ' + t(b.got ? 'награда.получено' : 'награда.пока-нет', { как: b.how }))))),
        h('p', { class: 'note-small' }, t('итог.награды-пояснение', { карточек: V.collection.count('cards'), наград: V.collection.count('badges') }))),
      h('section', { class: 'deb' }, h('h2', {}, t('итог.дальше', { n: sec.no })), scene('дальше', ctx, C)),
      V.sourcesBlock(ctx),
      h('div', { class: 'row' },
        h('a', { class: 'btn', href: '#' + sec.id + '-poprobuy' }, t('итог.к-разделу', { n: sec.no })),
        h('button', { type: 'button', class: 'btn ghost', onclick: restart }, t('итог.заново'))));
  }

  App.missionView = { open, restart, reset };
})();
