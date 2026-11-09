"""Тест рамок проекта: программа не работает с сетью и не запускает внешние программы.

Все .py проекта разбираются через ast — сам код при этом не выполняется. Проверяется:
- импорты только из белого списка (стандартные модули; из os — только os.path);
- нет вызовов eval, exec, __import__ и функций os, кроме os.path.*;
- в модулях wifi/* нет print() и input();
- в .bat-файлах нет сетевых и системных утилит.
Запрещённые имена в этом файле — строки, а не вызовы, поэтому тест проверяет и сам себя.
"""

import ast
import re
import unittest
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent

# Разрешено во всём проекте: стандартные модули из списка ниже и скрипты самого проекта.
# Из os разрешён только os.path: в os есть system, popen, startfile, spawn* — запуск программ.
ALLOWED_MODULES = {
    "__future__", "argparse", "csv", "dataclasses", "hashlib", "hmac", "json", "math", "os.path",
    "pathlib", "re", "secrets", "sys", "textwrap", "typing", "zlib",
    "wifi", "main", "teacher",
}
# Только в tests/: ast разбирает код, random даёт случайные данные с фиксированным зерном,
# остальное — подмена ввода, перехват вывода, временные папки и замер времени.
ALLOWED_IN_TESTS = {"ast", "contextlib", "io", "random", "shutil", "tempfile", "time", "unittest"}

FORBIDDEN_CALLS = {"eval", "exec", "__import__"}
# Вывод и ввод — только в main.py и teacher.py; модули wifi/* — «данные на входе → данные на выходе».
CONSOLE_CALLS = {"print", "input"}

# Утилиты, которые в .bat-файле означали бы работу с сетью или запуск чужих программ.
FORBIDDEN_BAT_WORDS = (
    "curl", "wget", "powershell", "bitsadmin", "certutil", "netsh", "ftp", "tftp", "ping",
    "http://", "https://", "net use", "mshta", "rundll32",
)

SKIP_DIRS = {".git", "__pycache__", ".venv", "venv"}


def project_files(pattern):
    """Файлы проекта по шаблону, кроме служебных папок."""
    return sorted(p for p in PROJECT_DIR.rglob(pattern)
                  if not SKIP_DIRS & set(p.relative_to(PROJECT_DIR).parts))


def is_test_file(path):
    return path.relative_to(PROJECT_DIR).parts[0] == "tests"


def parse(path):
    return ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))


def imported_names(tree):
    """Полные имена импортов: import a.b → a.b; from a import b, c → a.b, a.c.

    Для from-импорта берутся имена «модуль.имя», чтобы `from os import path` разрешался,
    а `from os import system` — нет. Относительные импорты (from . import x) — внутри пакета wifi.
    """
    names = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names += [(alias.name, node.lineno) for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and node.level == 0:
            names += [(f"{node.module}.{alias.name}", node.lineno) for alias in node.names]
    return names


def is_allowed(name, allowed):
    """Имя разрешено, если оно само или его начало («wifi» для «wifi.common.X») есть в списке."""
    parts = name.split(".")
    return any(".".join(parts[:i]) in allowed for i in range(1, len(parts) + 1))


def dotted_name(node):
    """Имя в виде строки: os.path.join → "os.path.join"; если это не имя (например, f()()) — ""."""
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if not isinstance(node, ast.Name):
        return ""
    parts.append(node.id)
    return ".".join(reversed(parts))


def calls(tree):
    """Все вызовы в коде: список (имя вызываемого, строка)."""
    return [(dotted_name(node.func), node.lineno) for node in ast.walk(tree) if isinstance(node, ast.Call)]


def forbidden_calls(tree):
    """Опасные вызовы: eval, exec, __import__ и любые функции os, кроме os.path.*.

    Мало запретить os.system и os.popen: `import os.path` делает доступным всё имя os,
    а в нём есть и startfile, spawn*, exec* — другие способы запустить программу.
    getattr(os, "...") — обходной путь к тем же функциям, он тоже запрещён.
    """
    found = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = dotted_name(node.func)
        if name in FORBIDDEN_CALLS or (name.startswith("os.") and not name.startswith("os.path.")):
            found.append((name, node.lineno))
        elif name == "getattr" and node.args and dotted_name(node.args[0]) == "os":
            found.append(("getattr(os, ...)", node.lineno))
    return found


def import_problems(path):
    """Список нарушений белого списка в одном файле."""
    allowed = ALLOWED_MODULES | (ALLOWED_IN_TESTS if is_test_file(path) else set())
    return [f"{path.relative_to(PROJECT_DIR)}:{line} импортирует {name}"
            for name, line in imported_names(parse(path)) if not is_allowed(name, allowed)]


class NoNetworkTests(unittest.TestCase):
    def test_all_project_files_are_checked(self):
        names = {p.name for p in project_files("*.py")}
        for expected in ("main.py", "common.py", "reference.py", "principles.py", "auditor.py",
                         "test_no_network.py"):
            self.assertIn(expected, names)

    def test_imports_are_whitelisted(self):
        problems = [p for path in project_files("*.py") for p in import_problems(path)]
        self.assertEqual(problems, [], "\n".join(problems))

    def test_test_only_modules_are_not_used_by_program(self):
        """random, unittest, ast и прочие «тестовые» модули в коде программы не нужны."""
        for path in project_files("*.py"):
            if is_test_file(path):
                continue
            used = {name for name, _ in imported_names(parse(path)) if is_allowed(name, ALLOWED_IN_TESTS)}
            self.assertEqual(used, set(), path.name)

    def test_no_dangerous_calls(self):
        problems = [f"{path.relative_to(PROJECT_DIR)}:{line} вызывает {what}"
                    for path in project_files("*.py") for what, line in forbidden_calls(parse(path))]
        self.assertEqual(problems, [], "\n".join(problems))

    def test_wifi_modules_do_not_print_or_ask(self):
        """В wifi/* нет print() и input(), иначе модуль не проверить тестами."""
        modules = [p for p in project_files("*.py") if p.relative_to(PROJECT_DIR).parts[0] == "wifi"]
        self.assertGreaterEqual(len(modules), 4)
        problems = [f"{path.name}:{line} вызывает {name}"
                    for path in modules for name, line in calls(parse(path)) if name in CONSOLE_CALLS]
        self.assertEqual(problems, [], "\n".join(problems))

    def test_bat_files_do_not_use_network_tools(self):
        bat_files = project_files("*.bat")
        self.assertTrue(bat_files, "нет ни одного .bat — проверять нечего")
        for path in bat_files:
            text = path.read_text(encoding="ascii").lower()
            for word in FORBIDDEN_BAT_WORDS:
                # Целым словом: «ping» не должно срабатывать на «typing» в комментарии.
                pattern = rf"(?<![a-z]){re.escape(word)}(?![a-z])"
                self.assertIsNone(re.search(pattern, text), f"{path.name}: «{word}»")

    def test_checker_catches_forbidden_imports(self):
        """Проверка проверяющего: на плохом коде белый список должен срабатывать."""
        bad = ("import socket\nimport urllib.request\nfrom http import client\nimport ssl\n"
               "import subprocess\nimport asyncio\nimport webbrowser\nimport importlib\nimport ctypes\n"
               "import ftplib\nimport smtplib\nimport os\nfrom os import system\n")
        names = [name for name, _ in imported_names(ast.parse(bad))]
        self.assertEqual(len(names), 13)
        for name in names:
            self.assertFalse(is_allowed(name, ALLOWED_MODULES | ALLOWED_IN_TESTS), name)

    def test_checker_allows_whitelisted_imports(self):
        good = ("import os.path\nfrom os import path\nfrom os.path import join\nimport json\n"
                "from wifi.common import load_json\nfrom pathlib import Path\n")
        for name, _ in imported_names(ast.parse(good)):
            self.assertTrue(is_allowed(name, ALLOWED_MODULES), name)
        # Начало имени должно совпадать целиком: «wifinet» — не пакет wifi.
        self.assertFalse(is_allowed("wifinet", ALLOWED_MODULES))

    def test_checker_catches_forbidden_calls(self):
        bad = ast.parse("os.system('x')\neval('1')\nexec('1')\n__import__('os')\nos.popen('x')\n"
                        "os.startfile('x')\nos.spawnl(0, 'x')\nos.execv('x', [])\n"
                        "getattr(os, 'system')('x')\n")
        self.assertEqual({what for what, _ in forbidden_calls(bad)},
                         {"os.system", "eval", "exec", "__import__", "os.popen", "os.startfile",
                          "os.spawnl", "os.execv", "getattr(os, ...)"})
        harmless = ast.parse("x = 'eval'\nprint('os.system')\ndata.evaluate()\nos.path.join('a', 'b')\n"
                             "getattr(record, 'system')\nitems()[0]()\n")
        self.assertEqual(forbidden_calls(harmless), [])

    def test_checker_finds_print_and_input(self):
        tree = ast.parse("print('x')\nvalue = input('?')\nself.print_report()\n")
        self.assertEqual([name for name, _ in calls(tree) if name in CONSOLE_CALLS], ["print", "input"])

    def test_checker_passes_this_file(self):
        """Этот файл перечисляет запрещённые имена, но только как строки — сам он проходит проверку."""
        this = Path(__file__)
        self.assertEqual(forbidden_calls(parse(this)), [])
        self.assertEqual(import_problems(this), [])


if __name__ == "__main__":
    unittest.main()
