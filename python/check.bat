@echo off
rem Teacher: check answer blanks in answers\ and write results.csv.
rem Run it on the teacher's own laptop, not on a student PC: the secret and the
rem answer key stay in the teacher folder (default: %USERPROFILE%\key_and_lock_teacher).
rem Comments are in Latin on purpose: cmd reads .bat files in the system code page.
chcp 65001 > nul < nul
cd /d "%~dp0"
rem Prefer the py launcher: "python" on Windows 11 may open Microsoft Store.
where py > nul 2> nul
if %errorlevel% equ 0 (
    py -3 -X utf8 teacher.py check %*
) else (
    python -X utf8 teacher.py check %*
)
rem Keep the window open so the summary or the error can be read.
pause
