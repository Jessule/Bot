"""Baja velas de 1 min de Yahoo (yfinance) y escribe prices.json. Lo ejecuta .github/workflows/prices.yml."""
import json
import time

import yfinance as yf

TICKERS = {"AAPL": "AAPL", "MSFT": "MSFT", "NOW": "NOW", "SHOP": "SHOP", "MU": "MU", "AAOI": "AAOI",
           "BTC": "BTC-USD", "SOL": "SOL-USD", "XRP": "XRP-USD", "GOLD": "GC=F", "SILVER": "SI=F"}

out = {}
for sym, t in TICKERS.items():
    try:
        c = yf.Ticker(t).history(period="5d", interval="1m")["Close"].dropna()
        if len(c) >= 5:
            out[sym] = {"closes": [round(float(x), 4) for x in c.tail(120)], "last_ts": int(c.index[-1].timestamp())}
    except Exception as e:  # un activo caído no debe tumbar al resto
        print("fallo", sym, type(e).__name__, e)

if not out:
    raise SystemExit("Yahoo no devolvió datos")
with open("prices.json", "w") as f:
    json.dump({"updated": int(time.time()), "data": out}, f, separators=(",", ":"))
print("ok", len(out), "activos")
