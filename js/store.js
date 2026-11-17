// Данные на устройстве: что лежит в хранилище браузера под ключом clavis:v1 и как это приводится в порядок
// при чтении. Хранятся только настройки, прогресс, ответы самопроверки и коллекция карточек и наград —
// без имени. Само хранилище передаёт сюда js/ui.js (единственный файл, которому можно его трогать); здесь —
// только перенос со старого ключа и проверка прочитанного, поэтому модуль работает и в браузере, и в node --test.
(function (root) {
  'use strict';
  const App = root.App = root.App || {};

  const KEY = 'clavis:v1';
  // Прежние ключи с теми же данными: до 17.11.2026 учебник хранил всё под kilt:v1. Схема у записи та же —
  // меняется только имя ключа, поэтому запись переносится как есть, без пересборки.
  const OLD_KEYS = ['kilt:v1'];
  // Версия схемы данных. Растёт, когда меняется вид или смысл хранимого; тогда же в read появляется
  // перенос старых данных. Данные более новой версии не трогаем (см. read).
  const SCHEMA = 1;
  const THEMES = ['auto', 'light', 'dark'];
  // Размер текста (окно «Настройки»): обычный, крупнее, ещё крупнее. Добавлен 17.11.2026 без смены схемы: у старой
  // записи его нет — читается как обычный; прежняя версия учебника незнакомое поле просто отбрасывает.
  const SIZES = ['m', 'l', 'xl'];
  const RESULTS = ['right', 'retry', 'hint', 'wrong'];   // ответ в «Самопроверке»: сразу, не сразу, с подсказкой, неверно
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
        size: SIZES.includes(s.size) ? s.size : 'm',
        progress: nested(s.progress, x => x === true),
        quiz: nested(s.quiz, x => RESULTS.includes(x)),
        collection: { cards: codes(col.cards), badges: codes(col.badges) }
      }
    };
  }

  // Текст записи из хранилища st (в браузере его передаёт js/ui.js, в тестах — подделка с getItem, setItem,
  // removeItem). Записи под новым ключом нет, а под прежним есть — разовый перенос: копия под новым ключом,
  // и только когда она прочиталась обратно буква в букву, старая запись удаляется. Не вышло записать
  // (хранилище переполнено или запрещено) — страница всё равно получает старую запись, а перенос
  // повторится при следующем заходе: прогресс не теряется ни на каком шаге.
  // Если запись под новым ключом уже есть, старые ключи не трогаем: их мог записать другой открытый
  // экземпляр прежней версии, и решать за студента, какая запись главнее, не нужно.
  function load(st) {
    const text = st.getItem(KEY);
    if (text !== null) return text;
    for (const old of OLD_KEYS) {
      const prev = st.getItem(old);
      if (prev === null) continue;
      try {
        st.setItem(KEY, prev);
        if (st.getItem(KEY) === prev) st.removeItem(old);
      } catch (e) { /* перенесём в следующий раз */ }
      return prev;
    }
    return null;
  }

  App.storage = { KEY, OLD_KEYS, SCHEMA, THEMES, SIZES, RESULTS, CODE, read, load };
  if (typeof module !== 'undefined' && module.exports) module.exports = App;
})(typeof self !== 'undefined' ? self : globalThis);
