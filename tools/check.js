// Все проверки проекта одной командой — перед коммитом и перед выкладкой на сайт.
// Запуск из корня репозитория:  node tools/check.js
// Что делает по очереди:
//   1. тесты веб-версии — node --test по всем *.test.js из tests/ и models/tests/;
//   2. три сверки «копия совпадает с источником»: список файлов в sw.js (tools/offline.js --check),
//      копия источников для страницы (tools/web_data.py --check), эталонные числа модели (tools/make_vectors.py --check);
//   3. тесты консольной версии и данных — unittest в папке python/.
// На экран — по строке на проверку и в конце итог; у упавших — имена тестов и хвост вывода. Код выхода 0 — всё
// прошло, 1 — что-то упало. Python ищется как «py -3» на Windows и «python3» на остальных системах; другую команду
// можно задать переменной окружения PYTHON (например, PYTHON=python).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PYTHON = process.env.PYTHON ? process.env.PYTHON.split(' ') : process.platform === 'win32' ? ['py', '-3'] : ['python3'];

// Файлы тестов веб-версии — все, а не список из README: новый файл тестов не потеряется.
const testFiles = () => ['models/tests', 'tests']
  .flatMap(dir => fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.test.js')).map(f => dir + '/' + f))
  .sort();

// Запуск программы; вывод — одной строкой текста (stdout и stderr вместе), время — в секундах.
function run(cmd, args, cwd = ROOT) {
  const t = Date.now();
  const r = spawnSync(cmd, args, {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' }
  });
  const out = (r.stdout || '') + (r.stderr || '') + (r.error ? '\n' + r.error.message : '');
  return { code: r.error ? -1 : r.status, out, sec: ((Date.now() - t) / 1000).toFixed(1) };
}

const tail = (text, n = 15) => text.trim().split('\n').slice(-n).map(s => '      ' + s).join('\n');
const results = [];
function report(name, ok, summary, details = '') {
  results.push({ name, ok });
  console.log((ok ? '  ok    ' : '  FAIL  ') + name + ' — ' + summary);
  if (!ok && details) console.log(details);
}

// 1. Тесты веб-версии. Формат вывода — TAP (задан явно: иначе node выбирает его сам по терминалу): итог —
// строки «# pass N» и «# fail N», упавшие тесты — «not ok N - имя».
{
  const files = testFiles();
  const r = run(process.execPath, ['--test', '--test-reporter=tap', ...files]);
  const num = key => Number((r.out.match(new RegExp('^# ' + key + ' (\\d+)$', 'm')) || [])[1]);
  const pass = num('pass'), fail = num('fail');
  const failed = [...r.out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map(m => '      ✗ ' + m[1]);
  const ok = r.code === 0 && fail === 0 && pass > 0;
  report('тесты веб-версии', ok, Number.isNaN(pass + fail) ? 'нет итога (код ' + r.code + ')' : `${pass} из ${pass + fail} (${files.length} файлов, ${r.sec} с)`,
    failed.length ? [...new Set(failed)].join('\n') : tail(r.out));
}

// 2. Сверки копий с источниками: код 0 — совпадает.
for (const [name, cmd, args] of [
  ['список файлов в sw.js', process.execPath, ['tools/offline.js', '--check']],
  ['копия источников data/sources.js', PYTHON[0], [...PYTHON.slice(1), '-X', 'utf8', 'tools/web_data.py', '--check']],
  ['эталонные числа модели', PYTHON[0], [...PYTHON.slice(1), '-X', 'utf8', 'tools/make_vectors.py', '--check']]
]) {
  const r = run(cmd, args);
  const last = r.out.trim().split('\n').pop() || '';
  report(name, r.code === 0, r.code === 0 ? last : r.code < 0 ? 'не запустилось' : 'не совпадает (код ' + r.code + ')', tail(r.out));
}

// 3. Тесты консольной версии. Итог unittest: «Ran N tests» и «OK» или «FAILED (failures=…, errors=…)».
{
  const r = run(PYTHON[0], [...PYTHON.slice(1), '-X', 'utf8', '-B', '-m', 'unittest', 'discover', '-s', 'tests'], path.join(ROOT, 'python'));
  const ran = Number((r.out.match(/^Ran (\d+) tests?/m) || [])[1]);
  const verdict = (r.out.match(/^(OK.*|FAILED.*)$/m) || ['нет итога'])[0];
  const failed = [...r.out.matchAll(/^(?:FAIL|ERROR): (.+)$/gm)].map(m => '      ✗ ' + m[1]);
  report('тесты консольной версии', r.code === 0 && ran > 0, r.code < 0 ? 'не запустилось' : `${ran || 0} — ${verdict} (${r.sec} с)`,
    failed.length ? failed.join('\n') : tail(r.out));
}

const bad = results.filter(r => !r.ok);
console.log('\n' + (bad.length ? `Итог: упало ${bad.length} из ${results.length} — ${bad.map(r => r.name).join(', ')}.`
  : `Итог: все ${results.length} проверок прошли.`));
process.exitCode = bad.length ? 1 : 0;
