// Разметка текстов учебника — одни правила для разделов, миссий, карты разделов и строк интерфейса.
// Как писать тексты, рассказано в content/README.md; здесь — код этих правил, в одном месте.
// Модуль только разбирает текст: страницу из разобранного строит js/ui.js, проверяет —
// js/content-model.js и js/mission-text.js. Работает в браузере (классический скрипт,
// в том числе из file://) и в node --test.
(function (root) {
  'use strict';
  const App = root.App = root.App || {};

  const LANGS = ['ru', 'kk', 'en'];

  // Выноски «> Метка: текст». Метка — на любом из трёх языков; вид выноски задаёт оформление.
  // Строка «>» без известной метки — простая заметка.
  const CALLOUTS = {
    'аналогия': 'analogy', 'ұқсастық': 'analogy', 'analogy': 'analogy',
    'важно': 'important', 'маңызды': 'important', 'important': 'important',
    'дома': 'home', 'үйде': 'home', 'at home': 'home',
    'дополнение к лекции': 'addendum', 'дәріске толықтыру': 'addendum', 'lecture addendum': 'addendum',
    'честное упрощение': 'honest', 'адал жеңілдету': 'honest', 'honest simplification': 'honest'
  };

  // Строчная разметка: **жирный**, *курсив*, [[ист: код §место]], [проверить: что сверить],
  // [текст](https://адрес) — ссылка наружу, [текст](#адрес) — ссылка внутри учебника.
  const INLINE = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[\[ист:\s*(\w+)([^\]]*)\]\]|\[проверить(?::\s*([^\]]+))?\]|\[([^\]]+)\]\(((?:https:\/\/|#)[^)\s]+)\)/g;

  function inlineTokens(text) {
    const out = [], s = String(text == null ? '' : text);
    const re = new RegExp(INLINE.source, 'g');
    let last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) out.push({ t: 'text', text: s.slice(last, m.index) });
      if (m[1]) out.push({ t: 'b', text: m[1] });
      else if (m[2]) out.push({ t: 'i', text: m[2] });
      else if (m[3]) out.push({ t: 'cite', id: m[3], loc: m[4].trim() });
      else if (m[0].startsWith('[проверить')) out.push({ t: 'check', what: (m[5] || '').trim() });
      else out.push({ t: 'link', text: m[6], href: m[7] });
      last = re.lastIndex;
    }
    if (last < s.length) out.push({ t: 'text', text: s.slice(last) });
    return out;
  }

  // Все ссылки на источники в тексте: [{ id, loc }].
  function citedIds(text) {
    return inlineTokens(text).filter(x => x.t === 'cite').map(x => ({ id: x.id, loc: x.loc }));
  }

  // «nist_800_97 §3.2.2, ieee80211i_2004» → [{ id, loc }].
  function parseSourceList(text) {
    return String(text).split(',').map(s => s.trim()).filter(Boolean).map(s => {
      const m = s.match(/^(\w+)\s*(.*)$/);
      return { id: m ? m[1] : s, loc: m ? m[2].trim() : '' };
    });
  }

  // Имя файла для сообщений: две последние части пути, например «ru/r11-prosto.js».
  const shortName = src => decodeURIComponent(String(src).split(/[?#]/)[0].split('/').slice(-2).join('/'));
  function currentScript() {
    const s = typeof document !== 'undefined' && document.currentScript;
    return s ? shortName(s.src) : '(файл)';
  }

  // ---------- Шапка ----------
  // Файл начинается шапкой между двумя линиями «---»: строки «ключ: значение». Номера строк
  // в сообщениях об ошибках считаются от первой линии «---» (это строка 1).
  function parseHeader(text) {
    const all = String(text).replace(/\r\n?/g, '\n').split('\n');
    const meta = {}, problems = [];
    let start = 0;
    while (start < all.length && !all[start].trim()) start++;
    const no = i => i - start + 1;
    let i = start;
    if (all[i] !== undefined && all[i].trim() === '---') {
      for (i++; i < all.length && all[i].trim() !== '---'; i++) {
        if (all[i].trim().startsWith('//')) continue;       // заметка для автора
        const m = all[i].match(/^\s*([^:]+):\s*(.*)$/);
        if (m) meta[m[1].trim().toLowerCase()] = m[2].trim();
        else if (all[i].trim()) problems.push({ line: no(i), text: 'строка шапки без двоеточия: «' + all[i].trim() + '»' });
      }
      if (i >= all.length) problems.push({ line: 1, text: 'шапка не закрыта второй линией ---' });
      i++;
    } else {
      problems.push({ line: 1, text: 'нет шапки между линиями ---' });
      i = start;
    }
    const body = all.slice(i).map((t, k) => ({ text: t, line: no(i + k) }));
    return { meta, body, problems };
  }

  // ---------- Блоки «## имя» ----------
  // isBlock(имя) решает, начинает ли заголовок блок; без неё блок начинает любой «## …».
  function splitBlocks(body, isBlock) {
    const intro = [], blocks = [];
    let cur = null;
    for (const ln of body) {
      const m = ln.text.match(/^##\s+(.+?)\s*$/);
      if (m && (!isBlock || isBlock(m[1]))) {
        cur = { name: m[1].trim(), line: ln.line, lines: [] };
        blocks.push(cur);
        continue;
      }
      (cur ? cur.lines : intro).push(ln);
    }
    return { intro, blocks };
  }

  // ---------- Поля «ключ: значение» ----------
  // repeated — ключи, которые можно повторять (например, «персонаж»): их значения собираются в список.
  function parseFields(lines, problems, where, repeated) {
    const out = {};
    for (const { text, line } of lines) {
      const t = text.trim();
      if (!t || t.startsWith('//')) continue;          // пустая строка или заметка для автора
      const m = t.match(/^([^:]+):\s*(.*)$/);
      if (!m) { problems.push({ line, text: (where ? 'в блоке «' + where + '» ' : '') + 'строка без двоеточия: «' + t + '»' }); continue; }
      const key = m[1].trim().toLowerCase(), val = m[2].trim();
      if (repeated && repeated.includes(key)) (out[key] = out[key] || []).push(val);
      else {
        if (key in out) problems.push({ line, text: (where ? 'в блоке «' + where + '» ' : '') + 'ключ «' + key + '» встречается дважды' });
        out[key] = val;
      }
    }
    return out;
  }

  // ---------- Обычный текст ----------
  // Заголовки «# », «## », «### » (если они не отключены), абзацы (соседние строки склеиваются),
  // списки «- …» (продолжение пункта — с отступом в два пробела), выноски «> Метка: …»,
  // вставки [[интерактив: имя]] и [[миссия: код]] отдельной строкой, реплики «Имя: …» (если даны
  // имена героев). Возвращает список элементов; соседние пункты собираются в один список.
  const LOOKS_LIKE_NAME = /^([А-ЯЁӘҒҚҢӨҰҮҺІA-Z][\wА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі-]{0,20}):\s+\S/;
  function parseProse(lines, opts) {
    const o = opts || {}, names = o.names || null, problems = o.problems || [];
    const items = [];
    let para = null, list = null;
    const endPara = () => { if (para) { items.push(para); para = null; } };
    const endList = () => { if (list) { items.push(list); list = null; } };
    for (let k = 0; k < lines.length; k++) {
      const raw = lines[k].text, line = lines[k].line, t = raw.trim();
      let m;
      if (!t) { endPara(); endList(); continue; }
      if (!o.noHeadings && (m = t.match(/^(#{1,3})\s+(.*)$/))) {
        endPara(); endList(); items.push({ type: 'h' + m[1].length, text: m[2], line }); continue;
      }
      if ((m = t.match(/^\[\[(интерактив|миссия):\s*([\w-]+)\s*\]\]$/))) {
        endPara(); endList(); items.push({ type: m[1] === 'миссия' ? 'mission' : 'interactive', id: m[2], line }); continue;
      }
      if (t.startsWith('>')) {
        endPara(); endList();
        let body = t.replace(/^>\s?/, '');
        while (k + 1 < lines.length && lines[k + 1].text.trim().startsWith('>')) body += ' ' + lines[++k].text.trim().replace(/^>\s?/, '');
        const lm = body.match(/^([^:]{2,40}):\s*(.*)$/);
        const kind = lm && CALLOUTS[lm[1].trim().toLowerCase()];
        items.push({ type: 'callout', kind: kind || 'note', label: kind ? lm[1].trim() : '', text: kind ? lm[2] : body, line });
        continue;
      }
      if ((m = raw.match(/^\s*[-•]\s+(.*)$/))) {
        endPara();
        if (!list) list = { type: 'ul', items: [], line };
        list.items.push(m[1].trim());
        continue;
      }
      if (list && /^\s{2,}\S/.test(raw)) { list.items[list.items.length - 1] += ' ' + t; continue; }
      if (names && (m = t.match(/^([^:]{1,24}):\s+(.*)$/)) && names.includes(m[1].trim())) {
        endPara(); endList(); items.push({ type: 'say', who: m[1].trim(), text: m[2], line }); continue;
      }
      if (names && (m = t.match(LOOKS_LIKE_NAME)) && !CALLOUTS[m[1].toLowerCase()]) {
        problems.push({ line, level: 'предупреждение', text: '«' + m[1] + ':» похоже на реплику, но такого героя нет в блоке «мир»' });
      }
      endList();
      if (para) para.text += ' ' + t; else para = { type: 'p', text: t, line };
    }
    endPara(); endList();
    return items;
  }

  // ---------- Вопрос с вариантами ----------
  // Текст вопроса; варианты «- …», верный — «- (верно) …»; под вариантом с отступом «  разбор: …»;
  // ниже — «подсказка: …» (сколько угодно), «источники: код §место, код» и поля «тип:», «понятие:»,
  // «ответ:», «разбор:» (без отступа — разбор всего случая). Так же устроены вопросы «Проверь себя»,
  // случаи сортировки и загадка миссии.
  const QUESTION_KEYS = ['тип', 'понятие', 'подсказка', 'источники', 'ответ', 'разбор'];
  function parseQuestion(lines) {
    const q = { stem: [], options: [], hints: [], sources: [], fields: {}, line: lines.length ? lines[0].line : 0 };
    for (const { text: raw, line } of lines) {
      const t = raw.trim();
      if (!t) continue;
      const om = raw.match(/^\s*-\s+(\(верно\)\s*)?(.*)$/);
      if (om) { q.options.push({ text: om[2].trim(), correct: !!om[1], why: '', line }); continue; }
      const km = t.match(/^([а-яё]+):\s*(.*)$/i);
      if (km && QUESTION_KEYS.includes(km[1].toLowerCase())) {
        const key = km[1].toLowerCase(), val = km[2].trim();
        if (key === 'разбор' && /^\s{2,}/.test(raw) && q.options.length) q.options[q.options.length - 1].why = val;
        else if (key === 'подсказка') q.hints.push(val);
        else if (key === 'источники') q.sources = parseSourceList(val);
        else q.fields[key] = val;
        continue;
      }
      q.stem.push(t);
    }
    q.stem = q.stem.join(' ');
    return q;
  }

  // Ошибки вопроса с вариантами (общие для «Проверь себя» и загадки миссии).
  function questionProblems(q) {
    const out = [];
    if (!q.stem) out.push('нет текста вопроса');
    if (q.options.length < 2) out.push('меньше двух вариантов ответа');
    const right = q.options.filter(o => o.correct).length;
    if (right !== 1) out.push('отметьте «(верно)» ровно один вариант, сейчас: ' + right);
    q.options.forEach((o, n) => { if (!o.why) out.push('у варианта ' + (n + 1) + ' нет строки «разбор:» с отступом'); });
    return out;
  }

  // ---------- Общие проверки любого текста ----------
  // add(уровень, где, что) — куда складывать замечания; ctx.sources — список источников;
  // ctx.isRoute(адрес) — есть ли такая страница в учебнике (для ссылок [текст](#адрес)).
  function checkText(raw, add, ctx) {
    const c = ctx || {}, stats = { cited: 0, unverified: 0 };
    // До этой проверки дело доходит редко: то, что стоит в ${…}, браузер выполняет как код ещё при загрузке
    // файла, и сюда попадает уже результат. Главный запрет — тест по исходному тексту (tests/content.test.js).
    if (/\$\{/.test(raw)) add('ошибка', 'текст', 'сочетание знаков $ и { в тексте запрещено: то, что стоит в таких скобках, браузер выполняет как код');
    for (const tok of inlineTokens(raw)) {
      if (tok.t === 'cite') {
        stats.cited++;
        const s = c.sources && c.sources[tok.id];
        if (!s) add('ошибка', 'ссылки', 'нет источника с кодом «' + tok.id + '» в data/sources.json');
        else if (!s.verified) add('предупреждение', 'ссылки', 'источник «' + tok.id + '» не сверен — в тексте будет пометка «проверить»');
      } else if (tok.t === 'check') stats.unverified++;
      else if (tok.t === 'link' && tok.href[0] === '#' && c.isRoute && !c.isRoute(tok.href)) {
        add('ошибка', 'ссылки', 'ссылка «' + tok.href + '» ведёт на страницу, которой нет в учебнике');
      }
    }
    return stats;
  }

  App.markup = {
    LANGS, CALLOUTS, QUESTION_KEYS,
    inlineTokens, citedIds, parseSourceList, shortName, currentScript,
    parseHeader, splitBlocks, parseFields, parseProse, parseQuestion, questionProblems, checkText
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = App;
})(typeof self !== 'undefined' ? self : globalThis);
