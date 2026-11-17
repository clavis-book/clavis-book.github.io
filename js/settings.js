// Два окна верхней полосы: карточка «Об учебнике» (открывается нажатием на название) и «Настройки» (язык,
// оформление, размер текста, «Группой», учебник на этом устройстве, прогресс, раздел для авторов). Подключается после
// js/offline.js и перед js/app.js.
// Оба окна — модальные <dialog>: браузер сам держит фокус внутри окна, закрывает его клавишей Esc и делает
// страницу под ним недоступной. Окна живут вне верхней полосы: полоса перестраивается при смене языка, а окно
// с выбранной кнопкой — нет, поэтому фокус не теряется. Браузер без <dialog> (Firefox до 98, Safari до 15.4)
// получает простое окно без затемнения: показ и скрытие — атрибутом hidden, Esc и закрытие — здесь же.
(function () {
  'use strict';
  const App = window.App, V = App.view;
  const { h, t, S } = V;
  const canModal = typeof HTMLDialogElement === 'function' && 'showModal' in HTMLDialogElement.prototype;

  // ---------- Окно ----------
  const isOpen = d => (canModal ? d.open : !d.hidden);
  // Закрыть окно. Без <dialog> событие close отправляется вручную, чтобы фокус вернулся так же, как в обычном окне.
  function hide(d, keepFocus) {
    if (keepFocus) d.dataset.back = '';   // фокус ставит новая страница, а не кнопка полосы
    if (!isOpen(d)) return;
    if (canModal) d.close(); else { d.hidden = true; d.removeAttribute('open'); }
    focusBack(d);
  }
  // Фокус — на кнопку полосы, которая открыла окно. Полоса могла перестроиться (сменился язык), поэтому кнопка
  // ищется заново по её метке data-focus.
  function focusBack(d) {
    const back = d.dataset.back;
    const again = back && [...document.querySelectorAll('#top [data-focus]')].find(el => el.getAttribute('data-focus') === back);
    if (again) again.focus();
  }
  function makeDialog(cls, labelId) {
    const d = h('dialog', { class: 'panel ' + cls, 'aria-labelledby': labelId, closedby: 'any', hidden: !canModal });
    // closedby="any" закрывает окно нажатием на затемнение вокруг него. Браузеры, которые его ещё не знают
    // (Safari), получают то же поведение здесь: нажатие пришлось на само окно, но вне его рамки — значит, на затемнение.
    if (canModal && !('closedBy' in HTMLDialogElement.prototype)) d.addEventListener('click', ev => {
      if (ev.target !== d) return;
      const r = d.getBoundingClientRect();
      if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) hide(d);
    });
    // Esc закрывает окно здесь же, чтобы фокус вернулся сразу (событие close браузер присылает с задержкой).
    d.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); hide(d); } });
    // Окно закрыл сам браузер (нажатие мимо окна) — фокус возвращается так же, как после «×».
    d.addEventListener('close', () => focusBack(d));
    document.body.append(d);
    return d;
  }
  function show(d, from, paint) {
    d.dataset.back = from;
    paint();
    if (isOpen(d)) return;
    if (canModal) { d.showModal(); return; }
    d.hidden = false;
    d.setAttribute('open', '');   // браузер, где <dialog> есть, но без showModal, без этого атрибута окно не показывает
    const first = d.querySelector('[data-focus]');
    if (first) first.focus();
  }
  const closeButton = d => h('button', { type: 'button', class: 'panel-x', 'data-focus': 'x', 'aria-label': t('окно.закрыть'), onclick: () => hide(d) },
    h('span', { 'aria-hidden': 'true' }, '×'));
  // Без <dialog> фокус может уйти из окна на страницу, поэтому Esc для открытого окна ловит и сама страница.
  if (!canModal) document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') document.querySelectorAll('dialog.panel').forEach(d => hide(d));
  });
  // Метка кнопки окна, на которой сейчас фокус.
  const focusKey = d => (document.activeElement && d.contains(document.activeElement) ? document.activeElement.getAttribute('data-focus') : null);
  // Окно перерисовывается целиком (сменился язык или настройка); фокус остаётся на той же кнопке. Метку берём
  // до смены настройки: без <dialog> страница под окном доступна, и новая страница забрала бы фокус себе.
  function repaint(d, build, was) {
    V.fill(d, build());
    const again = was && [...d.querySelectorAll('[data-focus]')].find(el => el.getAttribute('data-focus') === was);
    if (again) again.focus();
  }
  const upFirst = s => s.charAt(0).toLocaleUpperCase(V.locale()) + s.slice(1);

  // ---------- Об учебнике: подзаголовок и история названия ----------
  const about = makeDialog('about', 'about-h');
  function aboutBody() {
    return [
      h('div', { class: 'panel-head' },
        h('h2', { id: 'about-h', class: 'about-name' }, h('span', { class: 'mark small', 'aria-hidden': 'true' }), t('название')),
        closeButton(about)),
      h('p', { class: 'lead' }, upFirst(t('подзаголовок'))),
      h('p', {}, t('вход.имя')),
      // Главная страница ставит фокус на свой заголовок, поэтому на кнопку названия он не возвращается.
      h('p', { class: 'row' }, h('a', { class: 'btn ghost', href: '#', 'data-focus': 'home', onclick: () => hide(about, true) }, t('окно.на-главную')))
    ];
  }

  // ---------- Настройки ----------
  const settings = makeDialog('settings', 'set-h');
  let paintOffline = null;   // обновление части «Учебник на этом устройстве», когда меняется её состояние

  function pick(key, value) { const was = focusKey(settings); V.setPref(key, value); repaint(settings, settingsBody, was); }
  // Группа кнопок «выбери одно»: нажатая отмечена aria-pressed, программа чтения с экрана называет и группу.
  const choice = (name, items, current) => h('div', { class: 'seg', role: 'group', 'aria-labelledby': 'set-' + name },
    items.map(([value, label, attrs]) => h('button', Object.assign({ type: 'button', 'data-focus': name + '-' + value,
      'aria-pressed': current === value ? 'true' : 'false', onclick: () => pick(name, value) }, attrs || {}), label)));
  // Часть окна с заголовком title.
  const part = (name, title, ...kids) => h('section', { class: 'set-part', 'aria-labelledby': 'set-' + name }, h('h3', { id: 'set-' + name }, title), kids);

  // Учебник на этом устройстве: работа без интернета и установка (js/offline.js). Часть есть только на сайте:
  // из папки на диске учебник и так открывается без интернета. Когда состояние меняется («сохраняется» →
  // «сохранён»), меняются только текст и видимость частей, поэтому раскрытая подсказка не захлопывается.
  function offlinePart() {
    const O = App.offline;
    if (!O) return null;
    const TEXT = { saving: 'офлайн.сохраняю', ready: 'офлайн.готово', updated: 'офлайн.обновлён' };
    const status = h('p', { class: 'note' });
    const open = h('a', { href: 'index.html' }, t('офлайн.открыть'));
    const box = part('device', t('офлайн.заголовок'), status,
      h('div', { class: 'row install' }, h('button', { type: 'button', class: 'btn', 'data-focus': 'install', onclick: () => {
        // Кнопка исчезает (браузер показывает своё окно установки), поэтому фокус заранее уходит на заголовок части.
        const head = box.querySelector('h3'); head.setAttribute('tabindex', '-1'); head.focus(); O.install();
      } }, t('офлайн.установить'))),
      h('details', { class: 'src-more how' }, h('summary', { 'data-focus': 'how' }, t('офлайн.как')),
        h('ul', { class: 'note' }, ['android', 'iphone', 'компьютер'].map(k => h('li', {}, t('офлайн.' + k)))),
        h('p', { class: 'note' }, t('офлайн.зачем'))));
    const install = box.querySelector('.install'), how = box.querySelector('.how');
    paintOffline = () => {
      const updated = O.state === 'updated';
      box.hidden = O.state === 'none' && !O.prompt;
      status.hidden = !TEXT[O.state];
      if (updated) status.removeAttribute('role'); else status.setAttribute('role', 'status');
      V.fill(status, TEXT[O.state] ? t(TEXT[O.state]) : null, updated ? [' ', open] : null);
      install.hidden = !O.prompt || O.installed();
      how.hidden = O.installed();
    };
    paintOffline();
    return box;
  }

  function progressPart() {
    // Стереть — в два нажатия: первое меняет надпись на «Точно стереть?», второе стирает. Строка состояния под
    // кнопкой есть всегда, пустая: программа чтения с экрана объявляет текст, который в ней появляется.
    const said = h('p', { class: 'note', role: 'status' });
    const wipe = h('button', { type: 'button', class: 'btn ghost', 'data-focus': 'wipe', onclick: () => {
      if (wipe.dataset.sure !== '1') { wipe.dataset.sure = '1'; wipe.textContent = t('карта.стереть-точно'); said.textContent = ''; return; }
      S.progress = {}; S.quiz = {}; S.collection = { cards: [], badges: [] }; V.store.save();
      wipe.dataset.sure = ''; wipe.textContent = t('карта.стереть'); said.textContent = t('настройки.стёрто');
      if (V.onChange) V.onChange('progress');
    } }, t('карта.стереть'));
    return part('progress', t('настройки.прогресс'), h('p', { class: 'note' }, t('вход.устройство')), h('div', { class: 'row' }, wipe), said);
  }

  function settingsBody() {
    const L = V.lang();
    return [
      h('div', { class: 'panel-head' }, h('h2', { id: 'set-h' }, t('настройки.заголовок')), closeButton(settings)),
      // У кнопок языка видимая подпись («RU») входит в имя для программ чтения с экрана («RU — Русский»).
      part('lang', t('настройки.язык'), choice('lang', [['ru', 'RU', { lang: 'ru', 'aria-label': 'RU — Русский' }], ['kk', 'ҚАЗ', { lang: 'kk', 'aria-label': 'ҚАЗ — Қазақша' }],
        ['en', 'EN', { lang: 'en', 'aria-label': 'EN — English' }]], L),
        L !== 'ru' ? h('p', { class: 'note draft' }, t('шапка.черновой-перевод')) : null),
      part('theme', t('настройки.тема'), choice('theme', ['auto', 'light', 'dark'].map(k => [k, t('настройки.тема.' + k)]), S.theme)),
      // Размер текста — как панель «Аа» в читалках: крупнее весь учебник, а не только режим «Группой».
      part('size', t('настройки.размер'), choice('size', App.storage.SIZES.map(k => [k, t('настройки.размер.' + k)]), S.size)),
      // «Группой» — переключатель: флажок, который выглядит как тумблер, а программа чтения с экрана называет его «включено» или «выключено».
      part('group', t('настройки.группой'), h('label', { class: 'switch-row' }, t('шапка.группой'),
        h('input', { type: 'checkbox', role: 'switch', class: 'switch', 'data-focus': 'group', checked: S.group, 'aria-describedby': 'set-group-note', onchange: ev => pick('group', ev.target.checked) })),
        h('p', { class: 'note', id: 'set-group-note' }, t('шапка.группой.пояснение'))),
      offlinePart(),
      progressPart(),
      part('authors', t('настройки.авторам'), h('p', { class: 'note' }, h('a', { href: '#model', 'data-focus': 'model', onclick: () => hide(settings, true) }, t('вход.модель'))))
    ];
  }

  // Новая версия учебника: строка в верхней полосе (один раз) и часть «Учебник на этом устройстве».
  let toldUpdate = false;
  if (App.offline) App.offline.onChange = () => {
    if (App.offline.state === 'updated' && !toldUpdate) { toldUpdate = true; V.renderTop(undefined, true); }
    if (paintOffline) paintOffline();
  };

  // Переход на другую страницу (кнопка «Назад» браузера, ссылка из окна) закрывает окна: новая страница сама
  // ставит фокус на свой заголовок, поэтому на кнопку полосы он не возвращается.
  window.addEventListener('hashchange', () => {
    for (const d of [about, settings]) hide(d, true);
  });

  App.panels = {
    about: () => show(about, 'brand', () => V.fill(about, aboutBody())),
    settings: () => show(settings, 'settings', () => V.fill(settings, settingsBody()))
  };
})();
