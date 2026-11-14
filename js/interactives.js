// Интерактивы ступеней и вопросы «Проверь себя». Текст вокруг интерактива — в файле ступени,
// надписи — в строках интерфейса (content/ui/), расчёты — в моделях (models/).
// Интерактив подключается в тексте строкой [[интерактив: имя]]; имя — ключ в App.interactives.
(function () {
  'use strict';
  const App = window.App, V = App.view;
  const { h, svg: s, t } = V;
  let uid = 0;
  const newId = name => 'ia-' + name + '-' + (++uid);
  const p3 = p => new Intl.NumberFormat(V.locale(), { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(p);
  App.interactives = {};

  // ---------- «Просто» Р11: кто принимает сигнал роутера ----------
  App.interactives['radio-range'] = { render(box) {
    const SPOTS = [{ x: 114, y: 132, key: 'комната' }, { x: 184, y: 108, key: 'стена' },
      { x: 262, y: 150, key: 'парковка' }, { x: 340, y: 46, key: 'квартал' }];
    const R = { x: 60, y: 80 }, RADII = [80, 150, 225];
    // Непонятные символы для «зашифрованного» сообщения — случайные, свои для каждого текста.
    // Это иллюстрация, а не шифрование: так и сказано под схемой.
    const noise = new Map();
    const scramble = msg => {
      if (!noise.has(msg)) {
        if (noise.size > 200) noise.clear();
        const b = new Uint8Array(20); crypto.getRandomValues(b);
        noise.set(msg, Array.from(b, x => x.toString(16).padStart(2, '0')).join('').match(/.{4}/g).join(' '));
      }
      return noise.get(msg);
    };
    let spot = 1, encrypted = false, msg = t('радио.пример');
    const ids = { spot: newId('spot'), stops: newId('stops'), enc: newId('enc'), msg: newId('msg') };
    const neighbor = s('g', {}), link = s('line', { stroke: 'var(--green)', 'stroke-width': 2, 'stroke-dasharray': '5 5' });
    const pic = s('svg', { viewBox: '0 0 360 200', role: 'img', class: 'scheme' },
      RADII.map((r, i) => s('circle', { cx: R.x, cy: R.y, r, fill: 'none', stroke: 'var(--green)', 'stroke-opacity': 0.55 - i * 0.15, 'stroke-dasharray': '3 6' })),
      s('rect', { x: 16, y: 44, width: 132, height: 122, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 2, rx: 2 }),
      s('line', { x1: 148, y1: 44, x2: 148, y2: 166, stroke: 'var(--ink)', 'stroke-width': 5 }),
      s('text', { x: 20, y: 38, 'font-size': 11, fill: 'var(--ink-2)' }, t('радио.квартира')),
      s('text', { x: 152, y: 182, 'font-size': 11, fill: 'var(--ink-2)' }, t('радио.подпись-стена')),
      link,
      s('rect', { x: R.x - 14, y: R.y - 7, width: 28, height: 14, rx: 3, fill: 'var(--green)' }),
      s('line', { x1: R.x - 8, y1: R.y - 7, x2: R.x - 12, y2: R.y - 20, stroke: 'var(--green)', 'stroke-width': 2 }),
      s('line', { x1: R.x + 8, y1: R.y - 7, x2: R.x + 12, y2: R.y - 20, stroke: 'var(--green)', 'stroke-width': 2 }),
      s('text', { x: R.x - 18, y: R.y + 24, 'font-size': 11, fill: 'var(--ink)' }, t('радио.роутер')),
      s('rect', { x: 34, y: 122, width: 12, height: 20, rx: 2, fill: 'var(--ink)' }),
      s('text', { x: 34, y: 156, 'font-size': 10, fill: 'var(--ink-2)' }, t('радио.ты')),
      neighbor);
    const slider = h('input', { type: 'range', min: 0, max: 3, step: 1, value: spot, id: ids.spot, 'aria-describedby': ids.stops });
    const toggle = h('input', { type: 'checkbox', id: ids.enc });
    const text = h('input', { type: 'text', id: ids.msg, value: msg, maxlength: 60, autocomplete: 'off' });
    const out = h('div', { class: 'received', 'aria-live': 'polite' });
    const outNote = h('p', { class: 'note' });
    function draw() {
      const p = SPOTS[spot], where = t('радио.место.' + p.key);
      const inRange = Math.hypot(p.x - R.x, p.y - R.y) <= RADII[2];
      slider.setAttribute('aria-valuetext', where);
      neighbor.replaceChildren(
        s('rect', { x: p.x - 7, y: p.y - 11, width: 14, height: 22, rx: 3, fill: inRange ? (encrypted ? 'var(--green)' : 'var(--red)') : 'var(--ink-2)' }),
        s('text', { x: p.x > 300 ? p.x - 42 : p.x + 11, y: p.y + 4, 'font-size': 10, fill: 'var(--ink-2)' }, t('радио.сосед')));
      link.setAttribute('x2', p.x); link.setAttribute('y2', p.y);
      link.setAttribute('x1', R.x); link.setAttribute('y1', R.y);
      link.setAttribute('stroke-opacity', inRange ? 1 : 0);
      pic.setAttribute('aria-label', t(inRange ? 'радио.схема-в-зоне' : 'радио.схема-вне-зоны', { где: where }));
      out.className = 'received';
      if (!inRange) { out.replaceChildren(t('радио.ничего')); outNote.textContent = t('радио.условно'); return; }
      if (!encrypted) { out.classList.add('plain'); out.replaceChildren(h('strong', {}, msg || '…')); outNote.textContent = t('радио.открыто', { где: where }); return; }
      out.classList.add('secret');
      out.replaceChildren(h('span', { class: 'mono' }, scramble(msg)));
      outNote.textContent = t('радио.закрыто', { текст: msg || '…' });
    }
    slider.addEventListener('input', () => { spot = +slider.value; draw(); });
    toggle.addEventListener('change', () => { encrypted = toggle.checked; draw(); });
    text.addEventListener('input', () => { msg = text.value; draw(); });
    box.append(h('h3', { class: 'ia-title' }, t('радио.заголовок')), pic,
      h('label', { for: ids.spot }, t('радио.где')), slider,
      h('div', { class: 'stops', id: ids.stops }, SPOTS.map(p => h('span', {}, t('радио.место.' + p.key)))),
      h('label', { class: 'toggle', for: ids.enc }, toggle, t('радио.включить')),
      h('label', { for: ids.msg }, t('радио.твоё')), text,
      h('p', { class: 'small muted' }, t('радио.принял')), out, outNote);
    draw();
  } };

  // ---------- «Попробуй» Р11: как быстро повторяется случайное одноразовое число ----------
  // Числа — из модели models/nonce-reuse.js (её сверяют с эталонными значениями из Python).
  // Кривая — по известному приближению 1 − e^(−n(n−1)/2N): точный расчёт для каждой точки
  // слишком долог при перетаскивании ползунка, а на глаз они не отличаются.
  App.interactives.collision = { render(box) {
    const M = NonceReuse;
    const W = 600, H = 270, P = { l: 46, r: 14, t: 14, b: 46 };
    let bits = 24, pending = 0;
    const halfCache = {};
    const half = b => (halfCache[b] = halfCache[b] || M.halfChanceAt(2 ** b));
    const ids = { bits: newId('bits'), n: newId('n') };
    const bitsIn = h('input', { type: 'range', min: 8, max: 32, step: 1, value: bits, id: ids.bits });
    const nIn = h('input', { type: 'range', min: 0, max: 1000, step: 1, value: 560, id: ids.n });
    const bitsOut = h('strong'), nOut = h('strong'), pOut = h('p', { class: 'out-big', 'aria-live': 'polite' });
    const spaceOut = h('strong'), rootOut = h('strong'), halfOut = h('strong'), sentence = h('p', {});
    const plot = s('g', {}), hover = s('g', {});
    const caption = h('p', { class: 'note' }, t('повтор.наведи'));
    const pic = s('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', class: 'plot', 'aria-label': t('повтор.график') }, plot, hover);
    const approx = (n, N) => -Math.expm1(-n * (n - 1) / (2 * N));
    const maxN = () => Math.min(2 ** Math.min(bits / 2 + 3, 30), M.LIMITS.maxMessages);
    const nFromPos = pos => Math.max(2, Math.round(10 ** (pos / 1000 * Math.log10(maxN()))));
    const x = n => P.l + (W - P.l - P.r) * Math.log10(Math.max(1, n)) / Math.log10(maxN());
    const y = p => H - P.b - (H - P.t - P.b) * p;
    const bitsText = b => b + ' ' + V.plural('повтор.бит', b);
    function drawPlot(n, p) {
      const N = 2 ** bits, root = Math.sqrt(N), ticks = [];
      for (let k = 1; 10 ** k <= maxN(); k++) ticks.push(10 ** k);
      let d = '';
      for (let i = 0; i <= 120; i++) { const nn = 10 ** (i / 120 * Math.log10(maxN())); d += (i ? 'L' : 'M') + x(nn).toFixed(1) + ' ' + y(approx(nn, N)).toFixed(1); }
      V.fill(plot,
        ...[0, 0.5, 1].map(v => s('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), stroke: 'var(--rule)', 'stroke-width': 1 })),
        ...[0, 0.5, 1].map(v => s('text', { x: P.l - 8, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--ink-2)' }, V.num(v))),
        ...ticks.map(v => s('text', { x: x(v), y: H - P.b + 18, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--ink-2)' }, V.num(v))),
        s('text', { x: W - P.r, y: H - 2, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--ink-2)' }, t('повтор.ось')),
        root <= maxN() ? s('line', { x1: x(root), x2: x(root), y1: P.t, y2: H - P.b, stroke: 'var(--ink-2)', 'stroke-dasharray': '4 4' }) : null,
        root <= maxN() ? s('text', { x: x(root) + 5, y: P.t + 12, 'font-size': 12, fill: 'var(--ink-2)' }, '√N') : null,
        s('path', { d, fill: 'none', stroke: 'var(--green)', 'stroke-width': 2 }),
        s('circle', { cx: x(n), cy: y(p), r: 7, fill: 'var(--green)', stroke: 'var(--sheet)', 'stroke-width': 2 }));
    }
    function update() {
      pending = 0;
      bits = +bitsIn.value;
      const n = nFromPos(+nIn.value), N = 2 ** bits, p = M.chanceOfRepeat(n, N), h50 = half(bits);
      bitsOut.textContent = bitsText(bits); nOut.textContent = V.num(n);
      bitsIn.setAttribute('aria-valuetext', bitsText(bits)); nIn.setAttribute('aria-valuetext', V.num(n));
      spaceOut.textContent = V.num(N); rootOut.textContent = V.num(Math.round(Math.sqrt(N))); halfOut.textContent = V.num(h50);
      pOut.textContent = t('повтор.вероятность', { p: p > 0 && p < 0.0005 ? t('повтор.меньше', { x: p3(0.001) }) : p3(p) });
      sentence.replaceChildren(...V.rich('повтор.вывод', { бит: bitsText(bits), вариантов: V.num(N), порог: V.num(h50) }));
      drawPlot(n, p);
    }
    const schedule = () => { if (!pending) pending = requestAnimationFrame(update); };
    bitsIn.addEventListener('input', schedule); nIn.addEventListener('input', schedule);
    pic.addEventListener('pointermove', e => {
      const r = pic.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W;
      if (px < P.l || px > W - P.r) { hover.replaceChildren(); return; }
      const n = Math.round(10 ** ((px - P.l) / (W - P.l - P.r) * Math.log10(maxN())));
      const p = approx(n, 2 ** bits);
      hover.replaceChildren(s('line', { x1: px, x2: px, y1: P.t, y2: H - P.b, stroke: 'var(--ink-2)', 'stroke-opacity': 0.5 }),
        s('circle', { cx: px, cy: y(p), r: 4, fill: 'var(--sheet)', stroke: 'var(--green)', 'stroke-width': 2 }));
      caption.textContent = t('повтор.точка', { n: V.num(n), p: p3(p) });
    });
    pic.addEventListener('pointerleave', () => hover.replaceChildren());
    const preset = (b, key) => h('button', { type: 'button', class: 'btn ghost', onclick: () => { bitsIn.value = b; nIn.value = 560; update(); } }, t(key));
    box.append(h('h3', { class: 'ia-title' }, t('повтор.заголовок')),
      h('div', { class: 'presets' }, preset(16, 'повтор.16'), preset(24, 'повтор.24'), preset(32, 'повтор.32')),
      h('label', { for: ids.bits }, t('повтор.длина'), ' ', bitsOut), bitsIn,
      h('label', { for: ids.n }, t('повтор.сколько'), ' ', nOut), nIn,
      pOut, sentence, pic, caption,
      h('div', { class: 'kv' }, h('div', {}, t('повтор.всего'), spaceOut), h('div', {}, '√N', rootOut), h('div', {}, t('повтор.половина'), halfOut)),
      h('p', { class: 'note' }, t('повтор.случайно')));
    update();
  } };

  // ---------- QR-код страницы раздела: преподаватель показывает его на экране, студенты открывают с телефона ----------
  // Код строится из адреса, по которому открыт учебник (js/qr.js, без сети). Адрес файла на диске или
  // localhost телефон не откроет — тогда под кодом сказано, что он заработает после публикации учебника.
  App.interactives.qr = { render(box) {
    const TARGETS = [['r11-prosto', 'qr.цель.просто'], ['missiya-r11-m01', 'qr.цель.миссия'], ['r11-proverka', 'qr.цель.проверка']];
    const base = location.href.split('#')[0];
    const local = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    const name = newId('qr');
    let target = TARGETS[0][0], big = false;
    const pic = h('div', { class: 'qr-pic' }), addr = h('p', { class: 'qr-addr', lang: 'en' });
    const bigBtn = h('button', { type: 'button', class: 'btn ghost', 'aria-pressed': 'false', onclick: () => {
      big = !big; bigBtn.setAttribute('aria-pressed', String(big)); pic.classList.toggle('big', big);
    } }, t('qr.крупно'));
    function draw() {
      const url = base + '#' + target;
      const q = QR.encode(url), n = q.size + 8;      // поле по 4 модуля с каждой стороны — его требует стандарт
      let d = '';
      q.modules.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += 'M' + (x + 4) + ' ' + (y + 4) + 'h1v1h-1z'; }));
      const label = TARGETS.find(x => x[0] === target)[1];
      pic.replaceChildren(s('svg', { viewBox: '0 0 ' + n + ' ' + n, role: 'img', 'aria-label': t('qr.подпись', { куда: t(label) }), 'shape-rendering': 'crispEdges' },
        s('rect', { width: n, height: n, fill: '#fff' }), s('path', { d, fill: '#000' })));
      addr.textContent = url;
    }
    const choices = h('div', { class: 'bins', role: 'radiogroup', 'aria-label': t('qr.куда') }, TARGETS.map(([id, key], i) => {
      const input = h('input', { type: 'radio', name, id: name + '-' + i, checked: i === 0, onchange: () => { target = id; draw(); } });
      return h('label', { class: 'opt', for: name + '-' + i }, input, h('span', {}, t(key)));
    }));
    box.append(h('h3', { class: 'ia-title' }, t('qr.заголовок')), choices, pic, addr,
      h('p', { class: local ? 'note warn-note' : 'note' }, t(local ? 'qr.локальный' : 'qr.как')),
      h('div', { class: 'row' }, bigBtn));
    draw();
  } };

  // ---------- Сортировка по корзинам: её целиком наполняет файл ступени («интерактив: сортировка») ----------
  App.interactives.sort = { render(box, ctx, file) {
    if (!file || file.kind !== 'cases') { box.append(t('сортировка.нет')); return; }
    const bins = (file.meta['корзины'] || '').split('|').map(x => x.trim()).filter(Boolean);
    const score = h('p', { class: 'score', 'aria-live': 'polite' });
    const answers = {};
    const upd = () => { score.textContent = t('сортировка.счёт', { верно: file.records.filter((c, i) => answers[i] === c.fields['ответ']).length, всего: file.records.length }); };
    box.append(h('h3', { class: 'ia-title' }, t('сортировка.заголовок', { корзины: bins.join(' · ') })), score);
    file.records.forEach((c, i) => {
      const fb = h('div', { class: 'note', 'aria-live': 'polite' });
      const buttons = bins.map(b => h('button', { type: 'button', 'aria-pressed': 'false', onclick: ev => {
        answers[i] = b;
        buttons.forEach(x => { x.setAttribute('aria-pressed', x === ev.currentTarget ? 'true' : 'false'); x.classList.remove('right', 'wrong'); });
        const ok = b === c.fields['ответ'];
        ev.currentTarget.classList.add(ok ? 'right' : 'wrong');
        V.fill(fb, h('strong', {}, ok ? t('сортировка.верно') : t('сортировка.мимо', { ответ: c.fields['ответ'] })), ' ',
          V.inline(c.fields['разбор'] || '', ctx), ' ', c.sources.map(sv => V.cite(sv.id, sv.loc, ctx)));
        V.refreshSources(ctx); upd();
      } }, b));
      box.append(h('div', { class: 'case' }, h('p', {}, h('strong', {}, (i + 1) + '. '), V.inline(c.stem, ctx)),
        h('div', { class: 'bins', role: 'group', 'aria-label': t('сортировка.ответ', { n: i + 1 }) }, buttons), fb));
    });
    upd();
  } };

  // ---------- Вопросы «Проверь себя»: разбор каждого варианта и лестница подсказок ----------
  // Ответы хранятся только на устройстве: верно сразу (right), не сразу (retry), с подсказкой (hint), неверно (wrong).
  // Отметка «пройдено»: код раздела и код ступени (prosto, proverka) или миссии (missiya-r11-m01).
  function markDone(section, code) {
    const p = V.S.progress[section] = V.S.progress[section] || {};
    p[code] = true; V.store.save();
  }
  function quiz(file, ctx, section) {
    const wrap = h('div', { class: 'q' });
    const res = V.S.quiz[section] = V.S.quiz[section] || {};
    let idx = 0;
    function summary() {
      const v = Object.values(res);
      return t('вопрос.итог', { сразу: v.filter(x => x === 'right').length, несразу: v.filter(x => x === 'retry').length, подсказка: v.filter(x => x === 'hint').length });
    }
    function show(focus) {
      const q = file.records[idx];
      let chosen = -1, hintsUsed = 0, wrongTries = 0, solved = false;
      const qid = newId('q'), sumEl = h('span', { class: 'small muted' }, summary());
      const fb = h('div', { 'aria-live': 'polite' });
      const hintsBox = h('div', { class: 'hints' });
      const maxHints = Math.min(2, q.hints.length);
      const ladder = h('span', { class: 'ladder', 'aria-hidden': 'true' }, [0, 1, 2].map(() => h('span')));
      const labels = q.options.map((o, i) => {
        const input = h('input', { type: 'radio', name: qid, id: qid + '-' + i, onchange: () => { chosen = i; checkBtn.disabled = false; } });
        // В режиме «Группой» у вариантов буквы — группа голосует ими у общего экрана.
        const letter = h('span', { class: 'qletter group-only', 'aria-hidden': 'true' }, (V.lang() === 'en' ? 'ABCDEF' : 'АБВГДЕ')[i]);
        return h('label', { class: 'opt', for: qid + '-' + i }, input, h('span', {}, letter, V.inline(o.text, ctx)));
      });
      function done() {
        sumEl.textContent = summary(); V.refreshSources(ctx);
        if (file.records.every(r => res[r.id] && res[r.id] !== 'wrong')) markDone(section, 'proverka');
      }
      const checkBtn = h('button', { type: 'button', class: 'btn', disabled: true, onclick: () => {
        const o = q.options[chosen];
        labels[chosen].classList.add(o.correct ? 'right' : 'wrong');
        if (!labels[chosen].querySelector('.why')) labels[chosen].append(h('span', { class: 'why' }, V.inline(o.why, ctx)));
        if (o.correct && !solved) { solved = true; res[q.id] = hintsUsed ? 'hint' : wrongTries ? 'retry' : 'right'; done(); }
        if (!o.correct) { wrongTries++; res[q.id] = res[q.id] || 'wrong'; fb.replaceChildren(h('p', { class: 'note' }, t('вопрос.ещё-раз'))); }
        else fb.replaceChildren(h('p', {}, h('strong', {}, t(hintsUsed ? 'вопрос.верно-подсказка' : wrongTries ? 'вопрос.верно-не-сразу' : 'вопрос.верно'))));
        V.store.save();
      } }, t('вопрос.проверить'));
      // Кнопка лестницы: подсказка, ещё подсказка, показать решение. После решения она не отключается
      // (отключённая кнопка теряет фокус клавиатуры), а помечается aria-disabled и нажатия пропускает.
      const hintBtn = h('button', { type: 'button', class: 'btn ghost', onclick: () => {
        if (hintBtn.getAttribute('aria-disabled') === 'true') return;
        if (hintsUsed < maxHints) {
          hintsBox.append(h('p', { class: 'hint' }, h('strong', {}, t('вопрос.подсказка-н', { n: hintsUsed + 1 }) + ' '), V.inline(q.hints[hintsUsed], ctx)));
        } else {
          labels.forEach((l, i) => {
            l.classList.toggle('right', q.options[i].correct);
            const w = l.querySelector('.why'); if (w) w.remove();
            l.append(h('span', { class: 'why' }, V.inline(q.options[i].why, ctx)));
          });
          hintBtn.setAttribute('aria-disabled', 'true');
          // Ответ, данный до подсказок, остаётся как был: «с подсказкой» засчитывается только нерешённый вопрос.
          if (!solved) {
            solved = true; res[q.id] = 'hint'; done(); V.store.save();
            fb.replaceChildren(h('p', {}, h('strong', {}, t('вопрос.решение-показано'))));
          }
        }
        hintsUsed++;
        [...ladder.children].forEach((sp, i) => sp.classList.toggle('used', i < hintsUsed));
        hintBtn.textContent = t(hintsUsed >= maxHints ? 'вопрос.показать-решение' : 'вопрос.ещё-подсказка');
      } }, t(maxHints ? 'вопрос.подсказка' : 'вопрос.показать-решение'));
      const nav = (d, key, off) => h('button', { type: 'button', class: 'btn ghost', disabled: off, onclick: () => { idx += d; show(true); } }, t(key));
      V.fill(wrap,
        h('div', { class: 'meta-line' }, h('span', {}, t('вопрос.номер', { n: idx + 1, всего: file.records.length })),
          q.fields['понятие'] ? h('span', { class: 'chip' }, q.fields['понятие']) : null),
        h('fieldset', { class: 'opts' },
          h('legend', { class: 'q-stem', id: qid + '-stem', tabindex: '-1' }, V.inline(q.stem, ctx)),
          labels),
        h('div', { class: 'row' }, checkBtn, hintBtn, h('span', { class: 'small muted' }, t('вопрос.лестница')), ladder),
        hintsBox, fb,
        q.sources.length ? h('p', { class: 'note' }, t('вопрос.источники'), ' ', q.sources.map(sv => V.cite(sv.id, sv.loc, ctx))) : null,
        h('div', { class: 'row' }, nav(-1, 'вопрос.назад', idx === 0), nav(1, 'вопрос.дальше', idx === file.records.length - 1), sumEl));
      V.refreshSources(ctx);
      if (focus) wrap.querySelector('legend').focus();
    }
    show(false);
    return wrap;
  }

  App.quiz = quiz;
  App.markDone = markDone;
})();
