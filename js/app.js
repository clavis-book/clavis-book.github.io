// Приложение: адреса страниц и экраны — вход, карта разделов, ступень раздела, миссия, разделы
// преподавателя и проектора (пока «скоро»), модель содержания с проверкой всех текстов.
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
        tile('prepodavatelyu', t('вход.преподавателю'), t('вход.преподавателю-текст'), true),
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
        h('span', {}, h('span', { class: 'tick' }), t('карта.впереди')), ' ', h('span', {}, t('карта.отметки')))),
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

  // ---------- Преподавателю и проектор — пока «скоро» ----------
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
    V.renderTop({ vhod: '', karta: 'karta', step: 'karta', mission: 'karta', prepodavatelyu: 'prepodavatelyu', proektor: 'proektor', model: 'model' }[r.page] ?? '');
    document.title = t('название');
    if (r.page === 'vhod') return entryScreen();
    if (r.page === 'karta') return mapScreen();
    if (r.page === 'step') return stepScreen(r.section, r.step);
    if (r.page === 'mission') return CM.isRoute(location.hash) ? App.missionView.open(r.mission) : notFound();
    if (r.page === 'prepodavatelyu') return soonScreen('преподавателю');
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
