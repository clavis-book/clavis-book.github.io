// Приложение: адреса страниц и экраны — вход, карта разделов, карта к экзамену, ступень раздела, миссия,
// страница преподавателя (материалы к паре по разделам), проектор (пока «скоро»), модель содержания с проверкой всех текстов.
// Подключается последним: к этому моменту загружены содержание, модели и общие части страницы.
(function () {
  'use strict';
  const App = window.App, V = App.view, MK = App.markup, CM = App.model;
  const { h, t, S } = V;
  const app = document.getElementById('app');
  const CORE_STEPS = ['prosto', 'poprobuy', 'glubzhe', 'proverka'];   // отметки на карте (коды ступеней)

  // Проверка содержания при запуске: ошибка в тексте видна сразу, а не превращается в пустой экран.
  const expected = Array.from(document.querySelectorAll('script[src^="content/"], script[src^="data/"]'), s => s.getAttribute('src'));
  const check = CM.validate({ expected, model: typeof NonceReuse !== 'undefined' ? NonceReuse : null });
  const errors = check.issues.filter(i => i.level === 'ошибка');

  const page = (...kids) => { app.replaceChildren(h('div', { class: 'page' }, kids)); window.scrollTo(0, 0); V.focusTitle(app); };
  const errorBanner = () => errors.length
    ? h('p', { class: 'banner bad', role: 'status' }, t('ошибки.баннер', { n: errors.length }), ' ', h('a', { href: '#model' }, t('ошибки.смотреть')))
    : null;
  const stepInfo = slug => CM.STEPS.find(s => s.slug === slug);
  const done = (sec, slug) => !!(S.progress[sec] || {})[slug];      // прогресс хранится по кодам раздела и ступени
  const hasStep = (sec, step) => !!App.find(sec, step, 'ru');
  function lectures(l) {
    if (/^\d+$/.test(l)) return t('раздел.лекция', { n: l });
    if (/^[\d,\s–-]+$/.test(l)) return t('раздел.лекции', { n: l });
    return l === 'все' ? t('раздел.все-лекции') : l;
  }

  // ---------- Вход ----------
  function entryScreen() {
    const tile = (href, title, text, soon) => h('a', { class: 'tile' + (soon ? ' soon' : ''), href: '#' + href },
      h('span', { class: 't' }, title), h('span', { class: 'a' }, text), soon ? h('span', { class: 'chip' }, t('скоро')) : null);
    page(h('div', { class: 'reading stack' },
      h('h1', {}, t('вход.заголовок')),
      h('p', { class: 'lead' }, t('вход.текст')),
      errorBanner()),
      h('div', { class: 'map entry' },
        tile('karta', t('вход.студенту'), t('вход.студенту-текст')),
        tile('prepodavatelyu', t('вход.преподавателю'), t('вход.преподавателю-текст')),
        tile('proektor', t('вход.проектор'), t('вход.проектор-текст'), true)),
      h('p', { class: 'reading small muted' }, t('вход.устройство'), ' ', h('a', { href: '#model' }, t('вход.модель'))));
  }

  // ---------- Карта разделов ----------
  function mapScreen() {
    const wipe = h('button', { type: 'button', class: 'btn ghost', onclick: () => {
      if (wipe.dataset.sure !== '1') { wipe.dataset.sure = '1'; wipe.textContent = t('карта.стереть-точно'); return; }
      S.progress = {}; S.quiz = {}; S.collection = { cards: [], badges: [] }; V.store.save(); mapScreen();
    } }, t('карта.стереть'));
    page(h('div', { class: 'reading stack' },
      h('h1', {}, t('карта.заголовок')),
      h('p', { class: 'muted' }, t('карта.текст')),
      errorBanner(),
      h('p', { class: 'legend' }, h('span', {}, h('span', { class: 'tick done' }), t('карта.пройдено')), ' ',
        h('span', {}, h('span', { class: 'tick' }), t('карта.впереди')), ' ', h('span', {}, t('карта.отметки'))),
      examLink()),
      h('ul', { class: 'map', role: 'list' }, App.sectionList.map(sec => {
        const live = CM.STEPS.some(st => hasStep(sec.id, st.name));
        const ticks = CORE_STEPS.map(st => done(sec.id, st));
        return h('li', {}, h('a', { class: 'tile' + (sec.flagship ? ' flag' : '') + (live ? '' : ' soon'), href: '#' + sec.id + '-prosto',
          'aria-label': t('карта.плитка', { n: sec.no, название: sec.title, отмечено: ticks.filter(Boolean).length }) + (live ? '' : ', ' + t('скоро')) },
        h('span', { class: 'no', 'aria-hidden': 'true' }, sec.no), h('span', { class: 't' }, sec.title),
        h('span', { class: 'a' }, sec.analogy),
        sec.flagship ? h('span', { class: 'chip' }, t('карта.флагман')) : null,
        live ? null : h('span', { class: 'chip' }, t('скоро')),
        h('span', { class: 'ticks', 'aria-hidden': 'true' }, ticks.map(d => h('span', { class: 'tick' + (d ? ' done' : '') })))));
      })),
      h('section', { class: 'reading sheet stack', 'aria-labelledby': 'coll-h' },
        h('h2', { id: 'coll-h' }, t('карта.коллекция')),
        h('p', {}, t('карта.коллекция-текст', { карточек: V.collection.count('cards'), наград: V.collection.count('badges') })),
        h('div', { class: 'row' }, wipe)));
  }

  // ---------- Карта к экзамену ----------
  // Контрольные вопросы лекций (content/ekzamen.js) и где каждый разобран. «Разобран» считает модель
  // содержания по меткам [[экзамен: код]] в текстах ступеней, а не автор вручную.
  const placeLabel = (secId, step) => {
    const sec = App.sectionList.find(s => s.id === secId), st = CM.STEPS.find(s => s.name === step);
    return (sec ? t('раздел.номер', { n: sec.no }) + ' «' + sec.title + '»' : secId) + ' · ' + (st ? t('ступень.' + st.slug) : step);
  };
  const placeLink = (secId, step) => {
    const st = CM.STEPS.find(s => s.name === step);
    return h('a', { href: '#' + secId + '-' + (st ? st.slug : '') }, placeLabel(secId, step), hasStep(secId, step) ? null : ' (' + t('скоро') + ')');
  };
  function examLink() {
    if (!App.examMap) return null;
    const cov = CM.examCoverage();
    return h('p', { class: 'exam-link' }, h('a', { href: '#ekzamen' }, t('экзамен.заголовок')), ' — ',
      t('экзамен.счётчик', { n: cov.covered, всего: cov.total }));
  }
  function examScreen() {
    const E = App.examMap;
    if (!E) return notFound();
    const cov = CM.examCoverage();
    const counter = t('экзамен.счётчик', { n: cov.covered, всего: cov.total });
    // Раскрыть или свернуть все лекции разом (по одной — щелчком по заголовку лекции).
    const toggle = h('button', { type: 'button', class: 'btn ghost', onclick: () => {
      const open = toggle.dataset.open !== '1';
      document.querySelectorAll('details.exam-lec').forEach(d => { d.open = open; });
      toggle.dataset.open = open ? '1' : '';
      toggle.textContent = t(open ? 'экзамен.свернуть' : 'экзамен.раскрыть');
    } }, t('экзамен.раскрыть'));
    page(h('div', { class: 'reading stack' },
      h('nav', { class: 'crumbs', 'aria-label': t('путь') }, h('a', { href: '#karta' }, t('карта.заголовок'))),
      h('h1', {}, t('экзамен.заголовок')),
      h('p', { class: 'lead' }, t('экзамен.текст')),
      errorBanner(),
      h('div', { class: 'exam-total' }, h('p', { class: 'out-big' }, counter),
        cov.total ? h('progress', { max: cov.total, value: cov.covered, 'aria-label': counter }) : null),
      h('p', { class: 'note' }, t('экзамен.как-считается')),
      h('div', { class: 'row' }, toggle)),
      h('div', { class: 'reading stack' }, E.lectures.map(l => {
        const done = l.questions.filter(q => cov.where[q.id]).length;
        return h('details', { class: 'sheet exam-lec' },
          h('summary', {}, h('span', { class: 't' }, t('экзамен.лекция', { n: l.lecture }), ' · ', h('span', { lang: 'ru' }, l.topic)),
            h('span', { class: 'chip' + (done ? ' ok' : '') }, t('экзамен.в-лекции', { n: done, всего: l.questions.length }))),
          h('ol', { class: 'exam-list' }, l.questions.map(q => {
            // Разобран не там, где намечено в карте, — показываем и намеченное место: там будет основной разбор.
            const at = cov.where[q.id];
            const planned = !at || !at.some(p => p.section === q.section && p.step === q.step);
            return h('li', {}, h('span', { class: 'eq', lang: 'ru' }, q.text),
              h('span', { class: 'where small' },
                h('span', { class: 'chip' + (at ? ' ok' : '') }, t(at ? 'экзамен.разобрано' : 'экзамен.впереди')), ' ',
                at ? at.map((p, i) => [i ? ', ' : '', placeLink(p.section, p.step)]) : null,
                planned ? [at ? '; ' : '', t(at ? 'экзамен.будет-также' : 'экзамен.будет'), ' ', placeLink(q.section, q.step)] : null));
          })));
      })));
  }

  // ---------- Ступень раздела ----------
  let forceRu = null;                        // «Читать по-русски» для одной страницы, без смены языка
  function stepScreen(secId, slug) {
    const sec = App.sectionList.find(x => x.id === secId);
    const info = stepInfo(slug);
    if (!sec || !info) return notFound();
    const key = secId + '-' + slug;
    const ru = App.find(secId, info.name, 'ru');
    const own = V.lang() !== 'ru' && forceRu !== key ? App.find(secId, info.name, V.lang()) : null;
    const file = own || ru;
    const head = h('header', { class: 'section-head reading' },
      h('nav', { class: 'crumbs', 'aria-label': t('путь') }, h('a', { href: '#karta' }, t('карта.заголовок'))),
      h('div', { class: 'section-id' }, h('span', { class: 'section-no', 'aria-hidden': 'true' }, sec.no),
        h('div', {}, h('p', { class: 'small muted' }, t('раздел.номер', { n: sec.no }) + ' · ' + lectures(sec.lectures)),
          h('p', { class: 'section-title' }, sec.title))));
    const steps = h('nav', { class: 'steps reading', 'aria-label': t('ступени.меню') }, h('ol', {}, CM.STEPS.map((st, i) =>
      h('li', {}, h('a', { href: '#' + secId + '-' + st.slug, class: hasStep(secId, st.name) ? null : 'off', 'aria-current': st.slug === slug ? 'page' : null },
        h('span', { class: 'n', 'aria-hidden': 'true' }, i + 1), t('ступень.' + st.slug), hasStep(secId, st.name) ? null : h('span', { class: 'visually-hidden' }, ' (' + t('скоро') + ')'), done(secId, st.slug) ? h('span', { class: 'tick done', 'aria-label': t('карта.пройдено') }) : null)))));
    const ctx = V.newCtx();
    const body = h('article', { class: 'sheet reading prose', lang: file ? (file.meta['язык'] || 'ru') : null });
    if (!file) {
      body.append(h('h1', {}, t('ступень.' + slug)), h('p', { class: 'chip' }, t('скоро')),
        h('p', {}, sec.plans[info.name] || t('ступень.нет-плана')));
      return page(head, steps, body);
    }
    const ml = h('p', { class: 'meta-line' });
    if (file.meta['минут']) ml.append(h('span', {}, t('ступень.минут', { n: file.meta['минут'] })));
    if (file.meta['статус']) ml.append(h('span', { class: 'chip' + (file.meta['статус'] === 'готово' ? '' : ' warn') }, file.meta['статус']));
    if (own && ru && CM.dateKey(ru.meta['редакция']) > CM.dateKey(own.meta['перевод с'])) ml.append(h('span', { class: 'chip warn' }, t('ступень.перевод-устарел')));
    if (V.lang() !== 'ru' && !own) ml.append(h('span', { class: 'chip warn' }, t('ступень.нет-перевода')));
    body.append(ml);
    if (file.kind === 'questions') body.append(h('h1', {}, t('ступень.proverka')), ...V.renderProse(file.items, ctx).filter(Boolean), App.quiz(file, ctx, secId));
    else {
      body.append(...V.renderProse(file.items, ctx, { file, mission: missionCard }).filter(Boolean));
      if (file.kind === 'cases') { const box = h('div', { class: 'ia' }); App.interactives.sort.render(box, ctx, file); body.append(box); }
    }
    if (own) body.append(h('p', { class: 'banner' }, t('ступень.перевод-черновой'), ' ',
      h('button', { type: 'button', class: 'btn ghost', onclick: () => { forceRu = key; route(); } }, t('ступень.читать-по-русски'))));
    if (forceRu === key) body.append(h('p', { class: 'banner' }, h('button', { type: 'button', class: 'btn ghost', onclick: () => { forceRu = null; route(); } }, t('ступень.вернуть-перевод'))));
    const next = CM.STEPS[CM.STEPS.indexOf(info) + 1];
    if (file.kind !== 'questions' && next) {
      body.append(h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: () => {
        App.markDone(secId, info.slug); location.hash = secId + '-' + next.slug;
      } }, t('ступень.готово-дальше', { ступень: t('ступень.' + next.slug) }))));
    }
    body.append(V.sourcesSlot(ctx));
    page(head, steps, body);
  }

  // Карточка миссии внутри ступени: [[миссия: r11-m01]].
  function missionCard(missionId) {
    const C = App.missionText.commonOf(App.missions, missionId), W = App.missionText.worldsOf(App.missions, missionId)[0];
    if (!C || !W) return null;
    const f = (m, b, k) => ((m.fields[b] || {})[k]) || '';
    const passed = V.collection.has('badges', missionId + ':world:' + W.meta['мир']);
    // Тексты миссии — русские; подписи и кнопка — на языке интерфейса, поэтому язык указан у каждой части.
    // «Пройти ещё раз» начинает миссию сначала, а не открывает прежнее заключение.
    return h('aside', { class: 'mission-card', lang: V.lang(), 'aria-labelledby': 'mc-' + missionId },
      h('p', { class: 'small muted' }, t('миссии.карточка-метка'), ' · ', t('ступень.минут', { n: f(C, 'миссия', 'минут') })),
      h('h2', { id: 'mc-' + missionId, lang: 'ru' }, f(C, 'миссия', 'название')),
      h('p', { lang: 'ru' }, h('strong', {}, f(W, 'мир', 'название')), ' — ', f(W, 'мир', 'кратко')),
      V.lang() !== 'ru' ? h('p', { class: 'small' }, t('миссии.только-русский')) : null,
      h('p', { class: 'row' }, h('a', { class: 'btn', href: '#missiya-' + missionId, onclick: passed ? App.missionView.reset : null }, t(passed ? 'миссии.снова' : 'миссии.начать')),
        passed ? h('span', { class: 'chip ok' }, t('миссии.пройдена')) : null));
  }

  // ---------- Преподавателю: готовые материалы к паре по разделам; кабинет — пока «скоро» ----------
  // Плитка появляется сама, когда у раздела есть ступень «Преподавателю» (файл content/ru/…-prepod.js).
  function teacherScreen() {
    const ready = App.sectionList.filter(sec => hasStep(sec.id, 'преподавателю'));
    page(h('div', { class: 'reading stack' },
      h('h1', {}, t('преподавателю.заголовок')),
      h('p', { class: 'lead' }, t('преподавателю.текст')),
      errorBanner()),
      h('ul', { class: 'map entry', role: 'list' }, ready.map(sec => h('li', {},
        h('a', { class: 'tile' + (sec.flagship ? ' flag' : ''), href: '#' + sec.id + '-prepod' },
          h('span', { class: 't' }, t('раздел.номер', { n: sec.no }) + ' · ' + sec.title),
          h('span', { class: 'a' }, t('преподавателю.к-паре'))))),
        h('li', {}, h('div', { class: 'tile soon' },
          h('span', { class: 't' }, t('преподавателю.кабинет')), h('span', { class: 'a' }, t('преподавателю.кабинет-текст')),
          h('span', { class: 'chip' }, t('скоро'))))),
      h('p', { class: 'reading' }, h('a', { href: '#karta' }, t('вход.к-карте'))));
  }

  // ---------- Проектор — пока «скоро» ----------
  function soonScreen(key) {
    page(h('div', { class: 'reading stack' }, h('h1', {}, t(key + '.заголовок')), h('p', { class: 'chip' }, t('скоро')),
      h('p', {}, t(key + '.текст')), h('p', {}, h('a', { href: '#karta' }, t('вход.к-карте')))));
  }

  // ---------- Модель содержания: что лежит в файлах и что в них не так ----------
  function modelScreen() {
    const { issues, stats } = check;
    const qf = App.find('r11', 'проверка', 'ru');
    const cut = (txt, marker, n) => txt.split(marker).slice(0, n + 1).join(marker).trim();
    const stat = (key, v) => h('div', {}, t('модель.' + key), h('b', {}, V.num(v)));
    page(h('div', { class: 'reading stack' }, h('h1', {}, t('модель.заголовок')),
      h('p', {}, t('модель.текст')),
      h('div', { class: 'kv sheet' }, stat('файлов', stats.files), stat('вопросов', stats.questions), stat('случаев', stats.cases),
        stat('ссылок', stats.cited), stat('проверить', stats.unverified), stat('аналогий', stats.analogies), stat('слов', stats.words),
        stat('без-перевода', stats.untranslated), stat('миссий', App.missions.filter(m => m.meta['мир'] === 'общий').length))),
      h('section', { class: 'sheet reading stack', 'aria-labelledby': 'chk-h' }, h('h2', { id: 'chk-h' }, t('модель.проверка')),
        issues.length ? h('div', { class: 'tbl-wrap', tabindex: '0', role: 'region', 'aria-labelledby': 'chk-h' }, h('table', {},
          h('thead', {}, h('tr', {}, ['уровень', 'файл', 'где', 'что'].map(k => h('th', { scope: 'col' }, t('модель.' + k))))),
          h('tbody', {}, issues.map(i => h('tr', {}, h('td', {}, h('span', { class: 'chip ' + (i.level === 'ошибка' ? 'bad' : 'warn') }, i.level)),
            h('td', { class: 'small' }, MK.shortName(i.file)), h('td', { class: 'small' }, i.where), h('td', { lang: 'ru' }, i.text))))))
          : h('p', {}, t('модель.ошибок-нет'))),
      h('section', { class: 'sheet reading stack' }, h('h2', {}, t('модель.пример')),
        h('p', { class: 'note' }, t('модель.пример-текст')),
        qf ? h('pre', { class: 'src', tabindex: '0', lang: 'ru' }, cut(qf.raw, '## Вопрос', 1)) : null,
        h('p', { class: 'note' }, t('модель.правила'))));
  }

  function notFound() {
    page(h('div', { class: 'reading stack' }, h('h1', {}, t('нет.заголовок')), h('p', {}, h('a', { href: '#' }, t('нет.на-вход')))));
  }

  // ---------- Маршруты ----------
  function route() {
    const r = CM.parseRoute(location.hash);
    if (r.page === 'step' && forceRu && forceRu !== r.section + '-' + r.step) forceRu = null;
    // Ступень «Преподавателю» — в разделе преподавателя верхней полосы, остальные ступени — в разделе студента.
    const area = r.page === 'step' && r.step === 'prepod' ? 'prepodavatelyu' : r.page;
    V.renderTop({ vhod: '', karta: 'karta', ekzamen: 'karta', step: 'karta', mission: 'karta', prepodavatelyu: 'prepodavatelyu', proektor: 'proektor', model: 'model' }[area] ?? '');
    document.title = t('название');
    if (r.page === 'vhod') return entryScreen();
    if (r.page === 'karta') return mapScreen();
    if (r.page === 'ekzamen') return examScreen();
    if (r.page === 'step') return stepScreen(r.section, r.step);
    if (r.page === 'mission') return CM.isRoute(location.hash) ? App.missionView.open(r.mission) : notFound();
    if (r.page === 'prepodavatelyu') return teacherScreen();
    if (r.page === 'proektor') return soonScreen('проектор');
    if (r.page === 'model') return modelScreen();
    return notFound();
  }
  // Тема и «Группой» меняют только оформление; язык — тексты, поэтому страница строится заново.
  // Миссия идёт только на русском: смена языка меняет шапку, а миссию не начинает сначала.
  V.onChange = k => { if (k === 'lang' && CM.parseRoute(location.hash).page !== 'mission') route(); };
  V.applyPrefs();
  window.addEventListener('hashchange', route);
  route();
})();
