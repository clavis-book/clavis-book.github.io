// Данные на устройстве: что лежит в хранилище браузера под ключом kilt:v1 и как это приводится в порядок
// при чтении. Хранятся только настройки, прогресс, ответы самопроверки и коллекция карточек и наград —
// без имени. Само хранилище читает и пишет js/ui.js; здесь — только проверка прочитанного, поэтому
// модуль работает и в браузере, и в node --test.
(function (root) {
  'use strict';
  const App = root.App = root.App || {};

  const KEY = 'kilt:v1';
  // Версия схемы данных. Растёт, когда меняется вид или смысл хранимого; тогда же в read появляется
  // перенос старых данных. Данные более новой версии не трогаем (см. read).
  const SCHEMA = 1;
  const THEMES = ['auto', 'light', 'dark'];
  const RESULTS = ['right', 'retry', 'hint', 'wrong'];   // ответ «Проверь себя»: сразу, не сразу, с подсказкой, неверно
  // Постоянные коды разделов, ступеней, вопросов, карточек и наград: r11, prosto, r11-01, r11-m01:nonce.
  const CODE = /^[a-z0-9][a-z0-9:._-]{0,63}$/;

  const plain = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const codes = v => (Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string' && CODE.test(x)))].slice(0, 500) : []);
  // Словарь «код → { код: значение }»: остаются только коды и значения, которые пропускает keep.
  function nested(v, keep) {
    const out = {};
    for (const [k, inner] of Object.entries(plain(v))) {
      if (!CODE.test(k)) continue;
      out[k] = {};
      for (const [k2, x] of Object.entries(plain(inner))) if (CODE.test(k2) && keep(x)) out[k][k2] = x;
    }
    return out;
  }

  // Текст из хранилища → данные, с которыми страница может работать: всё незнакомое или испорченное
  // отбрасывается. newer: true — запись сделала более новая версия учебника: начинаем с чистого листа
  // и ничего не сохраняем, чтобы её не испортить.
  function read(text, langs) {
    let raw = {};
    try { raw = plain(JSON.parse(text || '{}')); } catch (e) { raw = {}; }
    const newer = Number.isInteger(raw.schema) && raw.schema > SCHEMA;
    const s = newer ? {} : raw;
    const col = plain(s.collection);
    return {
      newer,
      state: {
        schema: SCHEMA,
        lang: langs.includes(s.lang) ? s.lang : langs[0],
        theme: THEMES.includes(s.theme) ? s.theme : 'auto',
        group: s.group === true,
        progress: nested(s.progress, x => x === true),
        quiz: nested(s.quiz, x => RESULTS.includes(x)),
        collection: { cards: codes(col.cards), badges: codes(col.badges) }
      }
    };
  }

  App.storage = { KEY, SCHEMA, THEMES, RESULTS, CODE, read };
  if (typeof module !== 'undefined' && module.exports) module.exports = App;
})(typeof self !== 'undefined' ? self : globalThis);
