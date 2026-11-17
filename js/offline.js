// Учебник на устройстве: работа без интернета и установка как приложения. Нужно только на сайте (https):
// когда учебник открыт из папки двойным щелчком, он и так лежит на устройстве, и эта часть ничего не делает.
// Здесь: запуск сервис-воркера (sw.js хранит копию учебника — что именно он делает, написано в нём самом),
// его состояние для страницы и кнопка установки там, где браузер её даёт. Подключается перед js/app.js.
(function () {
  'use strict';
  const App = window.App;
  // state: 'none' — копии на устройстве нет (или браузер так не умеет), 'saving' — сохраняется,
  // 'ready' — сохранена, 'updated' — пришла новая версия, она откроется при следующем запуске.
  const offline = { state: 'none', prompt: null, onChange: null };
  const changed = () => { if (offline.onChange) offline.onChange(); };

  // startOfflineCopy — единственное место, где страница запускает сервис-воркер, создаёт политику Trusted Types
  // и (кроме pageBase в js/interactives.js) читает адрес страницы. Тест рамок сверяет эту функцию слово в слово.
  // Политика одна, и получить из неё можно только адрес sw.js: вставку HTML-строк и чужие скрипты она не
  // разрешает. На файле с диска и на localhost воркер не запускается: там учебник правят, и копия мешала бы
  // видеть правки (проверить работу без сети на своём компьютере можно по адресу вида clavis.localhost).
  function startOfflineCopy(report) {
    const sw = navigator.serviceWorker, tt = window.trustedTypes;
    if (!sw || location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
    const url = tt ? tt.createPolicy('clavis-offline', { createScriptURL: () => 'sw.js' }).createScriptURL('') : 'sw.js';
    const controlled = !!sw.controller;
    sw.register(url).then(reg => {
      const worker = reg.installing || reg.waiting;
      if (reg.active) report('ready');
      else if (worker) {
        report('saving');
        worker.addEventListener('statechange', () => { if (worker.state === 'activated') report('ready'); else if (worker.state === 'redundant') report('none'); });
      }
    }, () => {});
    sw.addEventListener('controllerchange', () => { if (controlled) report('updated'); });
  }
  // Без сервис-воркера (старый браузер, приватный режим, запрет) учебник работает как обычный сайт.
  try { startOfflineCopy(state => { if (offline.state !== 'updated') { offline.state = state; changed(); } }); } catch (e) { /* не получилось — не страшно */ }

  // Установка. Chrome и Edge сообщают странице, что учебник можно установить, и дают событие, которым она
  // потом — по нажатию кнопки — покажет системное окно установки. В Safari и Firefox такого события нет:
  // там учебник устанавливают через меню браузера, и страница показывает подсказку.
  window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); offline.prompt = ev; changed(); });
  window.addEventListener('appinstalled', () => { offline.prompt = null; changed(); });
  offline.install = () => { const ev = offline.prompt; if (!ev) return; offline.prompt = null; changed(); ev.prompt(); };
  // Открыт ли учебник как установленное приложение — в своём окне, без адресной строки.
  offline.installed = () => !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

  App.offline = offline;
})();
