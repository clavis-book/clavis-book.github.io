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
  const newCtx = () => ({ cites: [], notes: 0, prefix: 'src' + (++ctxCount) + '-', slot: null });

  function inline(text, ctx, inNote) {
    const out = [];
    for (const tok of MK.inlineTokens(text, inNote)) {
      // Номер заметки — кнопка, а перед кнопкой браузер может перенести строку. Последнее слово перед номером и
      // сам номер стоят в одной неразрывной группе, чтобы номер не оказался один в начале строки.
      if (tok.t === 'note') {
        const [mark, note] = sideNote(tok.text, ctx);
        const prev = out.length && typeof out[out.length - 1] === 'string' ? out[out.length - 1].match(/^([\s\S]*?)(\S+)$/) : null;
        if (prev) { out[out.length - 1] = prev[1]; out.push(h('span', { class: 'nobr' }, prev[2], mark), note); } else out.push(mark, note);
        continue;
      }
      out.push(inlineToken(tok, ctx));
    }
    return out;
  }
  function inlineToken(tok, ctx) {
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
  }
  // Метка «здесь разобран контрольный вопрос»: ссылка на карту к экзамену, «лекция 14–15, вопрос 7».
  function examMark(id) {
    const q = App.examMap && App.examMap.questions.find(x => x.id === id);
    if (!q) return '';
    return [' ', h('a', { class: 'exam-mark', href: '#ekzamen' }, t('экзамен.метка', { лекция: q.lectureNo, n: Number(id.slice(-2)) }))];
  }
  // Боковая заметка ^[…] (образец — заметки на полях Tufte CSS): номер в строке и текст заметки сразу за ним.
  // На широком экране (поля есть, css/base.css) заметка стоит на полях рядом со своей строкой, кнопка номера только
  // подсвечивает её; на узком заметка свёрнута и раскрывается по нажатию под строкой, второе нажатие сворачивает.
  // Читалка экрана слышит у кнопки «Примечание 1» и состояние «развёрнуто» или «свёрнуто».
  function sideNote(text, ctx) {
    const no = ctx ? ++ctx.notes : 0, id = (ctx ? ctx.prefix : 'sn-' + (++ctxCount) + '-') + 'n' + no;
    const mark = String(no || '*');
    const note = h('span', { class: 'sn', id, role: 'note' }, h('span', { class: 'sn-no', 'aria-hidden': 'true' }, mark), ' ', inline(text, ctx, true));
    const btn = h('button', { type: 'button', class: 'sn-ref', 'aria-controls': id, 'aria-expanded': 'false', 'aria-label': t('заметка.номер', { n: mark }),
      onclick: () => {
        if (onMargin(note)) return flash(note);
        note.classList.toggle('open');
        syncNote(btn, note);
      } }, mark);
    // Заметка на полях видна всегда; состояние кнопки сверяется, когда заметка попала на страницу (экран строится
    // не сразу — ждём до 2 секунд), при фокусе на кнопке и при смене ширины.
    let tries = 0;
    const first = () => { if (btn.isConnected) layoutSoon(); else if (++tries < 40) setTimeout(first, 50); };
    setTimeout(first, 0);
    btn.addEventListener('focus', () => syncNote(btn, note));
    return [h('sup', { class: 'sn-mark' }, btn), note];
  }
  const onMargin = note => getComputedStyle(note).position === 'absolute';
  // Заметки на полях стоят по высоте своих строк; если две строки рядом, нижняя заметка сдвигается вниз, чтобы
  // не наползать на верхнюю.
  function layoutNotes() {
    let prev = null;
    document.querySelectorAll('.sn-ref').forEach(b => syncNote(b, document.getElementById(b.getAttribute('aria-controls'))));
    for (const note of document.querySelectorAll('.prose .sn')) {
      note.style.removeProperty('translate');
      if (!onMargin(note)) continue;
      const r = note.getBoundingClientRect();
      if (prev && prev.box === note.offsetParent && r.top < prev.bottom + 8) note.style.setProperty('translate', '0 ' + Math.ceil(prev.bottom + 8 - r.top) + 'px');
      prev = { box: note.offsetParent, bottom: note.getBoundingClientRect().bottom };
    }
  }
  function syncNote(btn, note) {
    if (btn.isConnected && note) btn.setAttribute('aria-expanded', String(onMargin(note) || note.classList.contains('open')));
  }
  let layoutQueued = false;
  function layoutSoon() { if (!layoutQueued) { layoutQueued = true; setTimeout(() => { layoutQueued = false; layoutNotes(); }, 0); } }
  // Ширина окна, стили и шрифты (они подгружаются после первого показа и меняют высоту строк) — заметки встают
  // заново, состояние кнопок сверяется.
  window.addEventListener('resize', layoutSoon);
  window.addEventListener('load', layoutSoon);
  if (document.fonts) document.fonts.addEventListener('loadingdone', layoutSoon);
  function flash(el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }

  // Ссылка на источник [n] — как сноска Википедии. Нажатие открывает карточку источника (как на мобильной Википедии):
  // название, место, сверен ли он, что сверено и переход к списку источников экрана. Браузер без popover
  // (старые версии) по-прежнему прокручивает к записи в списке.
  function cite(id, loc, ctx) {
    if (!ctx) return '';
    let n = ctx.cites.findIndex(c => c.id === id);
    if (n < 0) { ctx.cites.push({ id, locs: [] }); n = ctx.cites.length - 1; }
    if (loc && !ctx.cites[n].locs.includes(loc)) ctx.cites[n].locs.push(loc);
    const src = App.sourceList[id], no = n + 1;
    return h('sup', { class: 'cite' },
      h('button', { type: 'button', 'aria-haspopup': HAS_POPOVER ? 'dialog' : null, 'aria-label': t('ист.номер', { n: no }) + (src ? ': ' + src.label : ''),
        onclick: ev => (HAS_POPOVER ? openCard(ev.currentTarget, ctx, no, loc) : toSource(ctx, no)) }, '[' + no + ']'),
      src && !src.verified ? h('span', { class: 'check' }, t('ист.проверить')) : null);
  }
  const HAS_POPOVER = typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype;
  // Перейти к записи n в списке источников экрана: список раскрывается, запись — по центру и подсвечена.
  function toSource(ctx, no) {
    const li = document.getElementById(ctx.prefix + no);
    if (!li) return;
    const box = li.closest('details');
    if (box) box.open = true;
    li.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
    li.setAttribute('tabindex', '-1');
    li.focus({ preventScroll: true });
    flash(li);
  }
  // Сведения об источнике — одни для карточки и для списка: название (ссылкой, если есть адрес https://), места
  // в тексте, «сверено» или «[проверить]», по нажатию — что именно сверено. Имя файла лекции студенту не нужно:
  // название лекции и её раздела уже стоят в названии источника.
  function sourceParts(s, locs) {
    const name = s.title || s.label;
    const what = [s.section, s.note].filter(Boolean).join(' ');
    return [
      /^https:\/\//.test(s.url || '') ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, name, h('span', { class: 'ext', 'aria-hidden': 'true' }, '↗'), h('span', { class: 'visually-hidden' }, ' ' + t('ссылка.наружу'))) : name,
      locs.length ? ', ' + locs.join('; ') : '',
      // «Сверено» — только у сверенного источника; у остальных дата не показывается, стоит пометка «[проверить]».
      s.checked && s.verified ? h('span', { class: 'src-note' }, ' — ' + t('ист.сверено', { когда: s.checked })) : '',
      s.verified ? '' : [' ', h('span', { class: 'check' }, t('ист.проверить'))],
      what ? h('details', { class: 'src-more' }, h('summary', {}, t('ист.что-сверено')), h('p', { class: 'src-note' }, what)) : null];
  }

  // Карточка источника — одна на страницу, всплывающая (popover): закрывается крестиком, Esc и нажатием мимо неё,
  // фокус возвращается на номер, с которого её открыли. На телефоне выезжает снизу, на широком экране — под номером.
  let card = null, cardFrom = null;
  function openCard(btn, ctx, no, loc) {
    const c = ctx.cites[no - 1], s = App.sourceList[c.id];
    if (!card) {
      card = h('div', { id: 'cite-card', class: 'cite-card', popover: 'auto', role: 'dialog', tabindex: '-1', 'aria-labelledby': 'cite-card-h' });
      card.addEventListener('toggle', ev => {
        if (ev.newState !== 'closed') return;
        const from = cardFrom; cardFrom = null;
        const lost = !document.activeElement || document.activeElement === document.body || card.contains(document.activeElement);
        if (from && from.isConnected && lost) from.focus();
      });
      document.body.append(card);
    }
    // Второе нажатие на тот же номер закрывает карточку; на другой номер — показывает его источник.
    if (card.matches(':popover-open')) {
      const same = cardFrom === btn;
      card.hidePopover();
      if (same) return;
    }
    const listed = ctx.slot || document.getElementById(ctx.prefix + no);
    fill(card,
      h('div', { class: 'cc-top' },
        h('p', { class: 'cc-h', id: 'cite-card-h' }, t('ист.номер', { n: no })),
        h('button', { type: 'button', class: 'cc-x', 'aria-label': t('окно.закрыть'), onclick: () => card.hidePopover() }, '×')),
      s ? h('p', { class: 'cc-src', lang: 'ru' }, sourceParts(s, loc ? [loc] : [])) : h('p', {}, t('ист.нет', { код: c.id })),
      listed ? h('button', { type: 'button', class: 'btn ghost cc-all', onclick: () => { cardFrom = null; card.hidePopover(); toSource(ctx, no); } }, t('ист.к-списку')) : null);
    cardFrom = btn;
    card.showPopover();
    placeCard(btn);
    card.focus({ preventScroll: true });
  }
  // На широком экране карточка стоит под номером (или над ним, если внизу нет места) и не выходит за края окна.
  // На узком её место — низ экрана, это задают стили.
  function placeCard(btn) {
    card.style.removeProperty('left'); card.style.removeProperty('top');
    if (!window.matchMedia('(min-width: 40.01rem)').matches) return;
    const r = btn.getBoundingClientRect(), w = card.offsetWidth, ht = card.offsetHeight, gap = 8;
    const x = Math.min(Math.max(gap, r.left - 24), window.innerWidth - w - gap);
    const below = r.bottom + gap, above = r.top - ht - gap;
    const y = below + ht <= window.innerHeight - gap || above < gap ? Math.min(below, Math.max(gap, window.innerHeight - ht - gap)) : above;
    card.style.setProperty('left', x + 'px'); card.style.setProperty('top', y + 'px');
  }
  window.addEventListener('resize', () => { if (card && card.matches(':popover-open')) placeCard(cardFrom || card); });

  // Список источников экрана — свёрнут: «Источники (n)»; номера те же, что у ссылок [n] в тексте.
  function sourcesBlock(ctx, title, open) {
    if (!ctx || !ctx.cites.length) return null;
    return h('details', { class: 'sources', open: open || null },
      h('summary', {}, h('h2', { class: 'sources-h' }, title || t('ист.заголовок'), ' ', h('span', { class: 'sources-n' }, '(' + num(ctx.cites.length) + ')'))),
      h('ol', {}, ctx.cites.map((c, i) => {
        const s = App.sourceList[c.id];
        if (!s) return h('li', { id: ctx.prefix + (i + 1) }, t('ист.нет', { код: c.id }));
        return h('li', { id: ctx.prefix + (i + 1), lang: 'ru' }, sourceParts(s, c.locs));
      })));
  }
  // Место для списка источников, который пополняется по ходу (вопросы, интерактивы). Раскрытый список при
  // пополнении остаётся раскрытым.
  function sourcesSlot(ctx, title) {
    ctx.slot = h('div', { class: 'sources-slot' });
    ctx.slotTitle = title;
    refreshSources(ctx);
    return ctx.slot;
  }
  function refreshSources(ctx) {
    if (!ctx || !ctx.slot) return;
    const was = ctx.slot.querySelector('details.sources');
    ctx.slot.replaceChildren(sourcesBlock(ctx, ctx.slotTitle, was && was.open) || '');
  }

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
