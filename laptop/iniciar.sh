#!/usr/bin/env bash
# Mac / Linux: bash iniciar.sh
cd "$(dirname "$0")"
command -v python3 >/dev/null || { echo "Instala Python 3 (https://www.python.org/downloads/)"; exit 1; }
[ -d .venv ] || python3 -m venv .venv
. .venv/bin/activate
pip install -q yfinance
python serve.py
