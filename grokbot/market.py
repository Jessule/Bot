"""Datos de mercado gratis: yfinance (+ Binance público para order book crypto).
Si no hay red, cae a un generador simulado para que la app siga funcionando."""
import time
import numpy as np
import pandas as pd
import requests
import yfinance as yf

from .config import ASSETS

_BASE_SIM = {"AAPL": 230, "MSFT": 430, "NOW": 900, "SHOP": 110, "MU": 110, "AAOI": 30,
             "BTC": 95000, "SOL": 180, "XRP": 2.4, "GOLD": 2700, "SILVER": 32}
_cache = {"t": 0.0, "df": None, "sim": False}
TTL = 25


def _simulate() -> pd.DataFrame:
    idx = pd.date_range(end=pd.Timestamp.now().floor("min"), periods=240, freq="min")
    out = {}
    for s, base in _BASE_SIM.items():
        rng = np.random.default_rng(abs(hash((s, int(time.time() // 60)))) % 2**32)
        vol = 0.0015 if s in ("BTC", "SOL", "XRP") else 0.0006
        out[s] = base * np.exp(np.cumsum(rng.normal(0, vol, len(idx))))
    return pd.DataFrame(out, index=idx)


def history() -> tuple[pd.DataFrame, bool]:
    """DataFrame de cierres a 1 min (columnas = símbolos). Devuelve (df, es_simulado)."""
    now = time.time()
    if _cache["df"] is not None and now - _cache["t"] < TTL:
        return _cache["df"], _cache["sim"]
    try:
        tick = {v["yf"]: k for k, v in ASSETS.items()}
        raw = yf.download(list(tick), period="1d", interval="1m", progress=False,
                          auto_adjust=True, threads=True)["Close"]
        df = raw.rename(columns=tick).ffill().dropna(how="all")
        if df.empty or len(df) < 5:
            raise ValueError("sin datos")
        _cache.update(t=now, df=df, sim=False)
    except Exception:
        _cache.update(t=now, df=_simulate(), sim=True)
    return _cache["df"], _cache["sim"]


def prices() -> dict[str, float]:
    df, _ = history()
    return {s: float(df[s].dropna().iloc[-1]) for s in df.columns if df[s].notna().any()}


def moves(window_min: int = 15) -> pd.DataFrame:
    """% de cambio en la ventana, para el Scout."""
    df, _ = history()
    rows = []
    for s in df.columns:
        c = df[s].dropna()
        if len(c) < 3:
            continue
        ref = c.iloc[max(0, len(c) - 1 - window_min)]
        rows.append(dict(symbol=s, price=float(c.iloc[-1]), change=float((c.iloc[-1] / ref - 1) * 100),
                         spark=c.tail(60).tolist()))
    return pd.DataFrame(rows)


def candles(symbol: str, period="5d", interval="15m") -> pd.DataFrame:
    try:
        d = yf.Ticker(ASSETS[symbol]["yf"]).history(period=period, interval=interval, auto_adjust=True)
        if len(d):
            return d
    except Exception:
        pass
    df, _ = history()
    s = df[symbol].dropna()
    return pd.DataFrame({"Open": s, "High": s, "Low": s, "Close": s})


def headlines(symbol: str, n: int = 6) -> list[str]:
    try:
        out = []
        for it in yf.Ticker(ASSETS[symbol]["yf"]).news[:n]:
            c = it.get("content", it)
            t = c.get("title")
            if t:
                out.append(t)
        return out
    except Exception:
        return []


def orderbook(symbol: str, price: float, levels: int = 10):
    """(bids, asks, real). Binance real para crypto; si no, libro sintético alrededor del precio."""
    bn = ASSETS[symbol].get("bn")
    if bn:
        try:
            r = requests.get("https://api.binance.com/api/v3/depth", params={"symbol": bn, "limit": levels},
                             timeout=3).json()
            return ([(float(p), float(q)) for p, q in r["bids"]],
                    [(float(p), float(q)) for p, q in r["asks"]], True)
        except Exception:
            pass
    rng = np.random.default_rng(int(price * 100) % 2**32)
    step = price * 0.0004
    bids = [(price - step * (i + 1), float(rng.uniform(1, 10) * (1 + i * .15))) for i in range(levels)]
    asks = [(price + step * (i + 1), float(rng.uniform(1, 10) * (1 + i * .15))) for i in range(levels)]
    return bids, asks, False
