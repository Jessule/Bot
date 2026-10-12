"""Paper trading con leverage, liquidación y persistencia local en JSON."""
import json
import time
import uuid

from .config import ASSETS, DATA_DIR, START_CASH

FILE = DATA_DIR / "portfolio.json"
FEE = 0.0005  # 0.05 % por operación (sobre el nocional)


def _fresh():
    return dict(cash=START_CASH, positions=[], history=[], equity_curve=[], log=[])


def load():
    try:
        return json.loads(FILE.read_text())
    except Exception:
        return _fresh()


def save(pf):
    FILE.write_text(json.dumps(pf, indent=1))


def reset():
    pf = _fresh()
    save(pf)
    return pf


def pnl(pos, price):
    d = 1 if pos["side"] == "LONG" else -1
    return d * (price / pos["entry"] - 1) * pos["margin"] * pos["lev"]


def equity(pf, px):
    return pf["cash"] + sum(p["margin"] + pnl(p, px.get(p["symbol"], p["entry"])) for p in pf["positions"])


def open_position(pf, symbol, side, margin, lev, price, reason="", sl_pct=None, tp_pct=None):
    a = ASSETS[symbol]
    lev = max(1, min(int(lev), a["max_lev"]))
    margin = float(margin)
    fee = margin * lev * FEE
    if margin <= 0 or margin + fee > pf["cash"]:
        return None, "Margen insuficiente"
    d = 1 if side == "LONG" else -1
    pos = dict(id=uuid.uuid4().hex[:8], symbol=symbol, side=side, entry=price, margin=margin, lev=lev,
               liq=price * (1 - d / lev * 0.9), opened=time.time(), reason=reason,
               sl=price * (1 - d * sl_pct / 100) if sl_pct else None,
               tp=price * (1 + d * tp_pct / 100) if tp_pct else None)
    pf["cash"] -= margin + fee
    pf["positions"].append(pos)
    pf["log"].append(f"{time.strftime('%H:%M:%S')} ABRE {side} {symbol} x{lev} @ {price:,.4f}")
    save(pf)
    return pos, "ok"


def close_position(pf, pid, price, why="manual"):
    pos = next((p for p in pf["positions"] if p["id"] == pid), None)
    if not pos:
        return None
    p = max(pnl(pos, price), -pos["margin"])
    fee = pos["margin"] * pos["lev"] * FEE
    pf["cash"] += pos["margin"] + p - fee
    pf["positions"].remove(pos)
    pf["history"].append({**pos, "exit": price, "pnl": p - fee, "closed": time.time(), "why": why})
    pf["log"].append(f"{time.strftime('%H:%M:%S')} CIERRA {pos['symbol']} ({why}) PnL {p - fee:+.2f}")
    save(pf)
    return p - fee


def check_risk(pf, px):
    """Liquidaciones, stop-loss y take-profit."""
    for pos in list(pf["positions"]):
        price = px.get(pos["symbol"])
        if price is None:
            continue
        long = pos["side"] == "LONG"
        if (long and price <= pos["liq"]) or (not long and price >= pos["liq"]):
            close_position(pf, pos["id"], pos["liq"], "LIQUIDADA")
        elif pos.get("sl") and ((long and price <= pos["sl"]) or (not long and price >= pos["sl"])):
            close_position(pf, pos["id"], price, "stop-loss")
        elif pos.get("tp") and ((long and price >= pos["tp"]) or (not long and price <= pos["tp"])):
            close_position(pf, pos["id"], price, "take-profit")


def snapshot(pf, px):
    pf["equity_curve"].append([time.time(), equity(pf, px)])
    pf["equity_curve"] = pf["equity_curve"][-2000:]
    save(pf)
