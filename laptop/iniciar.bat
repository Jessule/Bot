@echo off
cd /d "%~dp0"
where python >nul 2>nul || (echo Instala Python desde https://www.python.org/downloads/ ^(marca "Add Python to PATH"^) y vuelve a abrir esto. & pause & exit /b)
if not exist .venv (python -m venv .venv)
call .venv\Scripts\activate.bat
pip install -q yfinance
python serve.py
pause
