@echo off
REM PAYLOAD SYNTHESIS -- one-click local server.
REM Requires Python 3 on PATH (as "python" or the "py" launcher).
setlocal
cd /d "%~dp0"
set PORT=8123
where python >nul 2>nul
if %errorlevel%==0 (set PY=python) else (set PY=py)
echo Serving %CD%
echo Open http://127.0.0.1:%PORT%/
start "" "http://127.0.0.1:%PORT%/"
%PY% -m http.server %PORT%
