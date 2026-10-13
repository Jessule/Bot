"""Grok Bot para portátil: sirve la misma interfaz (grok.html) en http://localhost:8765
y le da precios reales de Yahoo bajados desde tu portátil (sin proxies ni claves).

Uso:  python serve.py        (o doble clic en iniciar.bat / iniciar.sh)
"""
import json
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8765
HTML = Path(__file__).resolve().parent.parent / "grok.html"
REFRESH_S = 60
FAKE = "--fake" in sys.argv  # solo para pruebas sin internet

TICKERS = {"AAPL": "AAPL", "MSFT": "MSFT", "NOW": "NOW", "SHOP": "SHOP", "MU": "MU", "AAOI": "AAOI",
           "BTC": "BTC-USD", "SOL": "SOL-USD", "XRP": "XRP-USD", "GOLD": "GC=F", "SILVER": "SI=F"}
feed = {"updated": 0, "data": {}}
status = {"msg": "esperando primera descarga…"}


def fetch_yahoo():
    import yfinance as yf
    out = {}
    for sym, t in TICKERS.items():
        try:
            c = yf.Ticker(t).history(period="5d", interval="1m")["Close"].dropna()
            if len(c) >= 5:
                out[sym] = {"closes": [round(float(x), 4) for x in c.tail(120)], "last_ts": int(c.index[-1].timestamp())}
        except Exception as e:  # un activo caído no tumba al resto
            print("  fallo", sym, type(e).__name__)
    return out


def fetch_fake():
    import random
    base = {"AAPL": 230, "MSFT": 430, "NOW": 900, "SHOP": 110, "MU": 110, "AAOI": 30, "BTC": 96000, "SOL": 180, "XRP": 2.4, "GOLD": 2700, "SILVER": 32}
    out = {}
    for s, b in base.items():
        c, p = [], b
        for _ in range(120):
            p *= 1 + random.uniform(-.0005, .0005)
            c.append(round(p, 4))
        out[s] = {"closes": c, "last_ts": int(time.time())}
    return out


def refresher():
    while True:
        try:
            data = fetch_fake() if FAKE else fetch_yahoo()
            if data:
                feed.update(updated=int(time.time()), data=data)
                status["msg"] = f"{len(data)} activos · {time.strftime('%H:%M:%S')}"
            else:
                status["msg"] = "Yahoo no devolvió datos (¿sin internet?)"
            print("precios:", status["msg"])
        except Exception as e:
            print("error al bajar precios:", e)
        time.sleep(REFRESH_S)


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")  # para la app instalada desde la web
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, b"", "text/plain")

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/grok.html"):
            self._send(200, HTML.read_bytes(), "text/html; charset=utf-8")
        elif path == "/prices.json":
            self._send(200, json.dumps(feed, separators=(",", ":")).encode(), "application/json")
        else:
            self._send(404, b"no encontrado", "text/plain; charset=utf-8")

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    if not HTML.exists():
        sys.exit(f"No encuentro {HTML}")
    threading.Thread(target=refresher, daemon=True).start()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://localhost:{PORT}"
    print(f"\n  Grok Bot en {url}\n  Deja esta ventana abierta mientras quieras que los agentes trabajen (Ctrl+C para parar).\n")
    if "--no-browser" not in sys.argv:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
