"""Копия списка источников для веб-версии: data/sources.json → data/sources.js.

Страница учебника открывается и двойным щелчком (file://), а так браузер не даёт прочитать JSON —
поэтому источники лежат рядом ещё и в виде скрипта. Список правят только в data/sources.json,
потом запускают:

    py -3 tools/web_data.py          — обновить data/sources.js
    py -3 tools/web_data.py --check  — только проверить, что копия совпадает со списком

Копия для учебных ПК (python/teacher.py) берёт из data/ только .py и .json, поэтому .js туда не попадает.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES_JSON = ROOT / "data" / "sources.json"
SOURCES_JS = ROOT / "data" / "sources.js"

HEADER = ("// Список источников для страницы учебника. Создан скриптом tools/web_data.py из data/sources.json —\n"
          "// здесь не править: правьте data/sources.json и запустите скрипт ещё раз.\n")


def render(sources):
    """Текст data/sources.js для словаря источников."""
    body = json.dumps(sources, ensure_ascii=False, indent=1)
    return HEADER + "App.sources(" + body + ");\n"


def build():
    return render(json.loads(SOURCES_JSON.read_text(encoding="utf-8")))


def main(argv):
    text = build()
    if "--check" in argv:
        same = SOURCES_JS.is_file() and SOURCES_JS.read_text(encoding="utf-8") == text
        print("data/sources.js совпадает с data/sources.json" if same else
              "data/sources.js устарел: запустите py -3 tools/web_data.py")
        return 0 if same else 1
    SOURCES_JS.write_text(text, encoding="utf-8", newline="\n")
    print("Записано: data/sources.js")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
