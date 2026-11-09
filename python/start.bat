@echo off
rem Student menu. Comments are in Latin on purpose: cmd reads .bat files in the
rem system code page before chcp runs, and Cyrillic here could break parsing.
rem chcp 65001 switches the console to UTF-8 so Russian text is readable;
rem < nul stops chcp from eating input redirected into this file.
chcp 65001 > nul < nul
cd /d "%~dp0"
rem Prefer the py launcher: "python" on Windows 11 may open Microsoft Store.
where py > nul 2> nul
if %errorlevel% equ 0 (
    py -3 -X utf8 main.py %*
) else (
    python -X utf8 main.py %*
)
rem Keep the window open after an error so the message can be read.
if errorlevel 1 pause
