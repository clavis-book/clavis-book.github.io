// Общие части страницы: хранилище на устройстве, строки интерфейса, построение страницы из узлов
// (без вставки HTML-строк), строчная разметка и источники, выноски, верхняя полоса, тема и режим «Группой»
// (сами окна «Настройки» и «Об учебнике» — js/settings.js).
// Тексты учебника — недоверенные данные: они попадают на страницу только как текст узлов.
(function () {
  'use strict';
  const App = window.App, MK = App.markup, ST = App.storage;
  const LOCALES = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' };

  // ---------- Хранилище на устройстве ----------
  // Что хранится, как переносится со старого ключа и как проверяется прочитанное — js/store.js. Если
  // хранилище недоступно (приватный режим, запрет браузера) или в нём запись более новой версии учебника,
  // всё работает без сохранения.
  const store = (() => {
    let text = null;
    try { text = ST.load(localStorage); } catch (e) { /* хранилище недоступно */ }
    const { state: s, newer } = ST.read(text, MK.LANGS);
    return { s, save() { if (newer) return; try { localStorage.setItem(ST.KEY, JSON.stringify(s)); } catch (e) { /* хранилище недоступно */ } } };
  })();
  const S = store.s;

  // ---------- Узлы страницы ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  }
  // Заменить содержимое элемента: пустое (null, false) пропускается, вложенные списки раскрываются.
  // Обычный replaceChildren превратил бы null в текст «null», а список — в строку.
  const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false));
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, ...kids) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
    for (const kid of kids.flat(Infinity)) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }

  // ---------- Строки интерфейса ----------
  const lang = () => S.lang;
  function raw(key) {
    const own = App.uiStrings[lang()], ru = App.uiStrings.ru;
    if (own && key in own.strings) return own.strings[key];
    if (ru && key in ru.strings) return ru.strings[key];
    return null;
  }
  // t('ключ', { имя: значение }) — строка на выбранном языке; если перевода нет — русская.
  function t(key, params) {
    const s = raw(key);
    if (s == null) return '[' + key + ']';
    return s.replace(/\{([^}]+)\}/g, (m, k) => (params && k in params ? String(params[k]) : m));
  }
  // Формы слова через черту: по-русски «слово|слова|слов», по-казахски и по-английски «форма|формы».
  function plural(key, n) {
    const forms = t(key).split('|').map(x => x.trim());
    const cat = new Intl.PluralRules(LOCALES[lang()]).select(n);
    const i = forms.length >= 3 ? ({ one: 0, few: 1 }[cat] ?? 2) : (cat === 'one' ? 0 : 1);
    return forms[Math.min(i, forms.length - 1)];
  }
  // Строка с выделенными местами: {имя} заменяется значением жирным шрифтом.
  function rich(key, params) {
    return t(key).split(/(\{[^}]+\})/).map(part => {
      const m = part.match(/^\{([^}]+)\}$/);
      return m && params && m[1] in params ? h('strong', {}, String(params[m[1]])) : part;
    });
  }
  const num = (n, l) => new Intl.NumberFormat(LOCALES[l || lang()]).format(n);
  const locale = () => LOCALES[lang()];

  // ---------- Строчная разметка и источники ----------
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ctxCount = 0;
  // Контекст ссылок одного экрана: номера источников и место для их списка.
  const newCtx = () => ({ cites: [], prefix: 'src' + (++ctxCount) + '-', slot: null });

  function inline(text, ctx) {
    return MK.inlineTokens(text).map(tok => {
      if (tok.t === 'text') return tok.text;
      if (tok.t === 'b') return h('strong', {}, tok.text);
      if (tok.t === 'i') return h('em', {}, tok.text);
      if (tok.t === 'cite') return cite(tok.id, tok.loc, ctx);
      if (tok.t === 'check') return h('span', { class: 'check', title: tok.what ? t('ист.что-сверить', { что: tok.what }) : t('ист.не-сверено') }, t('ист.проверить'));
      if (tok.t === 'exam') return tok.ids.map(examMark);
      if (tok.href[0] === '#') return h('a', { href: tok.href }, tok.text);
      // Файл из папки docs/ учебника: открывается или скачивается браузером, интернет не нужен.
      // Ссылка, которую не пропускает проверка (выход из папки, чужое расширение), остаётся простым текстом.
      if (tok.href.startsWith('docs/') && !MK.isDocLink(tok.href)) return tok.text;
      if (tok.href.startsWith('docs/')) return h('a', { href: tok.href }, tok.text, h('span', { class: 'ext', 'aria-hidden': 'true' }, '⤓'), h('span', { class: 'visually-hidden' }, ' ' + t('ссылка.файл')));
      return h('a', { href: tok.href, target: '_blank', rel: 'noopener noreferrer' }, tok.text, h('span', { class: 'ext', 'aria-hidden': 'true' }, '↗'), h('span', { class: 'visually-hidden' }, ' ' + t('ссылка.наружу')));
    });
  }
  // Метка «здесь разобран контрольный вопрос»: ссылка на карту к экзамену, «лекция 14–15, вопрос 7».
  function examMark(id) {
    const q = App.examMap && App.examMap.questions.find(x => x.id === id);
    if (!q) return '';
    return [' ', h('a', { class: 'exam-mark', href: '#ekzamen' }, t('экзамен.метка', { лекция: q.lectureNo, n: Number(id.slice(-2)) }))];
  }
  function cite(id, loc, ctx) {
    if (!ctx) return '';
    let n = ctx.cites.findIndex(c => c.id === id);
    if (n < 0) { ctx.cites.push({ id, locs: [] }); n = ctx.cites.length - 1; }
    if (loc && !ctx.cites[n].locs.includes(loc)) ctx.cites[n].locs.push(loc);
    const src = App.sourceList[id], no = n + 1;
    return h('sup', { class: 'cite' },
      h('button', { type: 'button', 'aria-label': t('ист.номер', { n: no }) + (src ? ': ' + src.label : ''), onclick: () => {
        const li = document.getElementById(ctx.prefix + no);
        if (!li) return;
        li.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
        li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash');
      } }, String(no)),
      src && !src.verified ? h('span', { class: 'check' }, t('ист.проверить')) : null);
  }
  // Список источников экрана: название (ссылкой, если есть адрес https://), места, дата сверки; по нажатию —
  // что именно сверено.
  function sourcesBlock(ctx, title) {
    if (!ctx || !ctx.cites.length) return null;
    return h('section', { class: 'sources', 'aria-label': title || t('ист.заголовок') },
      h('h2', { class: 'sources-h' }, title || t('ист.заголовок')),
      h('ol', {}, ctx.cites.map((c, i) => {
        const s = App.sourceList[c.id];
        if (!s) return h('li', { id: ctx.prefix + (i + 1) }, t('ист.нет', { код: c.id }));
        const name = s.title || s.label;
        const what = [s.section, s.note].filter(Boolean).join(' ');
        return h('li', { id: ctx.prefix + (i + 1), lang: 'ru' },
          /^https:\/\//.test(s.url || '') ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, name) : name,
          s.file ? h('span', { class: 'src-note' }, ' (' + s.file + ')') : '',
          c.locs.length ? ', ' + c.locs.join('; ') : '',
          // «Сверено» — только у сверенного источника; у остальных дата не показывается, стоит пометка «[проверить]».
          s.checked && s.verified ? h('span', { class: 'src-note' }, ' — ' + t('ист.сверено', { когда: s.checked })) : '',
          s.verified ? '' : h('span', { class: 'check' }, t('ист.проверить')),
          what ? h('details', { class: 'src-more' }, h('summary', {}, t('ист.что-сверено')), h('p', { class: 'src-note' }, what)) : null);
      })));
  }
  // Место для списка источников, который пополняется по ходу (вопросы, интерактивы).
  function sourcesSlot(ctx, title) {
    ctx.slot = h('div', { class: 'sources-slot' });
    ctx.slotTitle = title;
    refreshSources(ctx);
    return ctx.slot;
  }
  function refreshSources(ctx) { if (ctx && ctx.slot) ctx.slot.replaceChildren(sourcesBlock(ctx, ctx.slotTitle) || ''); }

  // ---------- Выноски и обычный текст ----------
  function callout(kind, label, kids) {
    return h('aside', { class: 'callout ' + kind }, h('span', { class: 'lab' }, label || t('выноска.заметка')), h('div', { class: 'txt' }, kids));
  }
  // opts.say(элемент) — реплика героя (в миссиях); opts.mission(код) — карточка миссии;
  // opts.file — файл ступени (для интерактивов, которые наполняет текст); opts.ulClass — класс списка.
  function renderProse(items, ctx, opts) {
    const o = opts || {};
    return items.map(it => {
      if (it.type === 'h1' || it.type === 'h2' || it.type === 'h3') return h(it.type, {}, inline(it.text, ctx));
      if (it.type === 'p') return h('p', {}, inline(it.text, ctx));
      if (it.type === 'ul') return h('ul', { class: o.ulClass || null }, it.items.map(x => h('li', {}, inline(x, ctx))));
      // Метка выноски стоит отдельно («Важно», «Аналогия»), поэтому текст после неё начинается с заглавной буквы.
      if (it.type === 'callout') return callout(it.kind, it.label, h('p', {}, inline(it.text.replace(/^([*«"(]*)(\p{Ll})/u, (m, a, b) => a + b.toLocaleUpperCase('ru')), ctx)));
      if (it.type === 'say') return o.say ? o.say(it, ctx) : h('p', {}, it.who + ': ', inline(it.text, ctx));
      if (it.type === 'mission') return o.mission ? o.mission(it.id) : null;
      if (it.type === 'interactive') {
        const box = h('div', { class: 'ia' });
        const ia = App.interactives && App.interactives[it.id];
        if (ia) ia.render(box, ctx, o.file); else box.append(t('интерактив.нет', { имя: it.id }));
        return box;
      }
      return null;
    });
  }

  // ---------- Тема, язык, «Группой» ----------
  function applyPrefs() {
    const root = document.documentElement;
    if (S.theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', S.theme);
    root.classList.toggle('group', S.group);
    root.lang = lang();
  }
  const view = { onChange: null };
  // Шапка строится заново, поэтому фокус клавиатуры возвращается на ту же кнопку (data-focus), а не теряется.
  function keepTopFocus(rebuild) {
    const was = document.activeElement && document.activeElement.closest('#top') ? document.activeElement.getAttribute('data-focus') : null;
    rebuild();
    const again = was && [...document.querySelectorAll('#top [data-focus]')].find(el => el.getAttribute('data-focus') === was);
    if (again) again.focus();
  }
  function setPref(k, v) {
    keepTopFocus(() => { S[k] = v; store.save(); applyPrefs(); renderTop(); if (view.onChange) view.onChange(k); });
  }

  // Верхняя полоса — одна строка на любой ширине: название (нажатие открывает карточку «Об учебнике»), разделы
  // приложения и кнопка «Настройки» (язык, оформление, «Группой» и остальное — в окне, js/settings.js).
  // Под полосой, без закрепления, — пометки: черновой перевод интерфейса, новая версия учебника.
  // keepFocus — шапка меняется сама, не по действию человека (пришла новая версия): фокус остаётся, где был.
  function renderTop(current, keepFocus) {
    if (keepFocus) return keepTopFocus(() => renderTop(current));
    if (current !== undefined) view.area = current;
    const area = view.area;
    const link = (href, key, cls) => h('a', { href: '#' + href, class: cls || null, 'aria-current': area === href ? 'page' : null }, t(key));
    const panels = () => App.panels;   // окна подключаются позже (js/settings.js), к нажатию они уже есть
    fill(document.getElementById('top'),
      h('a', { class: 'skip', href: '#app', onclick: ev => { ev.preventDefault(); const m = document.getElementById('app'); m.focus(); m.scrollIntoView(); } }, t('шапка.к-содержанию')),
      h('div', { class: 'top-in' },
        // Видимое «Clavis» входит в имя кнопки для программ чтения с экрана: «Clavis — об учебнике».
        h('button', { type: 'button', class: 'brand', 'data-focus': 'brand', 'aria-haspopup': 'dialog', 'aria-label': t('шапка.об-учебнике'), onclick: () => panels().about() }, t('название')),
        // «Проектор» на узком экране не показывается: проектор подключают к компьютеру, а не к телефону.
        h('nav', { class: 'nav', 'aria-label': t('шапка.меню') },
          link('karta', 'шапка.студенту'), link('prepodavatelyu', 'шапка.преподавателю'), link('proektor', 'шапка.проектор', 'wide-only')),
        h('button', { type: 'button', class: 'tool set-btn', 'data-focus': 'settings', 'aria-haspopup': 'dialog', onclick: () => panels().settings() },
          gear(), h('span', { class: 'lbl' }, t('шапка.настройки')))));
    fadeRow(document.getElementById('top').querySelector('.nav'));
    fill(document.getElementById('top-notes'),
      lang() !== 'ru' ? h('p', { class: 'draft-lang' }, t('шапка.черновой-перевод')) : null,
      // Пришла новая версия учебника (js/offline.js): она уже на устройстве и откроется по ссылке или при следующем запуске.
      App.offline && App.offline.state === 'updated' ? h('p', { class: 'top-note', role: 'status' }, t('офлайн.обновлён'), ' ', h('a', { href: 'index.html' }, t('офлайн.открыть'))) : null);
    measureTop();
  }
  // Строка, которая прокручивается вбок (разделы в полосе, ступени раздела): у края, за которым есть ещё пункты,
  // она плавно гаснет (классы more-l и more-r). center — поставить текущий пункт (aria-current) в середину.
  const edges = row => {
    row.classList.toggle('more-l', row.scrollLeft > 2);
    row.classList.toggle('more-r', row.scrollLeft + row.clientWidth < row.scrollWidth - 2);
  };
  function fadeRow(row, center) {
    if (!row) return;
    row.classList.add('fade-row');
    const cur = center && row.querySelector('[aria-current]');
    if (cur) { const li = cur.closest('li') || cur; row.scrollLeft = li.offsetLeft - (row.clientWidth - li.offsetWidth) / 2; }
    edges(row);
    row.addEventListener('scroll', () => edges(row), { passive: true });
  }
  // Ширина окна изменилась (поворот телефона) — края пересчитываются у всех таких строк на странице.
  window.addEventListener('resize', () => document.querySelectorAll('.fade-row').forEach(edges));
  // Значок настроек — три ползунка (как у регуляторов громкости): рисуется линиями, цвет — цвет текста.
  function gear() {
    return svg('svg', { class: 'ico', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
      [[5, 15], [12, 7], [19, 12]].map(([y, x]) => [
        svg('line', { x1: 3, y1: y, x2: 21, y2: y }),
        svg('circle', { cx: x, cy: y, r: 2.4 })]));
  }
  // Высота верхней полосы — в переменную --top-h. Полоса закреплена, и стили по этой переменной оставляют под неё
  // место при прокрутке к ответу или заголовку, а окна настроек и «Об учебнике» открываются сразу под ней.
  function measureTop() {
    document.documentElement.style.setProperty('--top-h', document.getElementById('top').offsetHeight + 'px');
  }
  window.addEventListener('resize', measureTop);

  // Фокус на заголовок нового экрана: читалка экрана объявит, куда перешли.
  function focusTitle(container) {
    const el = (container || document).querySelector('h1');
    if (el) { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); }
  }

  // ---------- Коллекция карточек и наград (общая для всего учебника, только на устройстве) ----------
  const collection = {
    add(kind, id) { const list = S.collection[kind]; if (list && !list.includes(id)) { list.push(id); store.save(); return true; } return false; },
    has: (kind, id) => (S.collection[kind] || []).includes(id),
    count: kind => (S.collection[kind] || []).length
  };

  Object.assign(view, { S, store, h, fill, svg, t, rich, plural, num, locale, lang, newCtx, inline, cite, sourcesBlock, sourcesSlot, refreshSources, fadeRow,
    callout, renderProse, applyPrefs, renderTop, setPref, focusTitle, collection, reduceMotion });
  App.view = view;
})();
