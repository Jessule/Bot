"""Pipeline multi-agente local (Ollama + llama3.2). Si Ollama no responde, cada agente usa
una heurística propia para que el pipeline nunca se rompa."""
import json
import re
import time

import numpy as np
import requests

from . import market
from .config import ASSETS, OLLAMA_MODEL, OLLAMA_URL


def ollama_ok() -> bool:
    try:
        r = requests.get(f"{OLLAMA_URL}/api/tags", timeout=1.5)
        return r.ok and any(OLLAMA_MODEL.split(":")[0] in m["name"] for m in r.json().get("models", []))
    except Exception:
        return False


def llm(system: str, prompt: str, as_json=False) -> str | None:
    try:
        r = requests.post(f"{OLLAMA_URL}/api/chat", timeout=90, json=dict(
            model=OLLAMA_MODEL, stream=False, format="json" if as_json else "",
            options=dict(temperature=0.2),
            messages=[dict(role="system", content=system), dict(role="user", content=prompt)]))
        return r.json()["message"]["content"].strip()
    except Exception:
        return None


def _json(txt):
    try:
        return json.loads(re.search(r"\{.*\}", txt, re.S).group(0))
    except Exception:
        return None


def _rsi(c, n=14):
    d = np.diff(c)
    if len(d) < n:
        return 50.0
    up, dn = d[-n:].clip(min=0).mean(), (-d[-n:]).clip(min=0).mean()
    return 100.0 if dn == 0 else float(100 - 100 / (1 + up / dn))


# ───────────── agentes: cada uno devuelve dict(summary, score∈[-1,1]) ─────────────
def news_agent(sym, ctx):
    hl = market.headlines(sym)
    if not hl:
        return dict(summary="Sin titulares disponibles.", score=0.0)
    out = llm("Eres analista de noticias financieras. Responde SOLO JSON: "
              '{"summary":"1-2 frases en español","score":-1..1 impacto esperado en precio}',
              f"Activo {sym}, movimiento {ctx['change']:+.2f}%.\nTitulares:\n- " + "\n- ".join(hl), True)
    j = _json(out or "")
    return dict(summary=j.get("summary", "") if j else hl[0], score=float(j.get("score", 0)) if j else 0.0)


def sentiment_agent(sym, ctx):
    hl = market.headlines(sym)
    out = llm("Eres analista de sentimiento. Responde SOLO JSON: "
              '{"summary":"1 frase en español","score":-1 (muy bajista)..1 (muy alcista)}',
              f"{sym} cambió {ctx['change']:+.2f}% en 15 min. Titulares: {hl[:5]}", True)
    j = _json(out or "")
    if j:
        return dict(summary=j.get("summary", ""), score=float(j.get("score", 0)))
    s = float(np.tanh(ctx["change"] / 2))
    return dict(summary=f"Sentimiento heurístico {'alcista' if s > 0 else 'bajista'} por momentum.", score=s)


def charts_agent(sym, ctx):
    c = market.candles(sym)["Close"].dropna().to_numpy()
    if len(c) < 30:
        return dict(summary="Pocos datos.", score=0.0)
    rsi, sma20, sma50 = _rsi(c), c[-20:].mean(), c[-min(50, len(c)):].mean()
    trend = 1 if c[-1] > sma20 > sma50 else -1 if c[-1] < sma20 < sma50 else 0
    score = float(np.clip(trend * 0.6 + (50 - rsi) / 100 * (0.4 if abs(trend) == 0 else -0.2), -1, 1))
    txt = f"RSI {rsi:.0f}, precio {'>' if c[-1] > sma20 else '<'} SMA20, tendencia {['lateral','alcista','bajista'][trend]}."
    return dict(summary=txt, score=score, rsi=rsi)


def skeptic_agent(sym, ctx, prior):
    sc = np.mean([p["score"] for p in prior.values()])
    out = llm("Eres el escéptico del equipo: argumenta brevemente (2 frases, español) por qué NO operar. "
              'Responde SOLO JSON: {"summary":"...","risk":0..1}',
              f"{sym} {ctx['change']:+.2f}%. Informes: " + json.dumps({k: v["summary"] for k, v in prior.items()}), True)
    j = _json(out or "")
    risk = float(j.get("risk", .5)) if j else (0.7 if abs(ctx["change"]) > 4 else 0.4)
    return dict(summary=j.get("summary", "Movimiento brusco: riesgo de reversión.") if j else
                "Movimiento brusco: riesgo de reversión y spreads amplios.", score=-risk * np.sign(sc or 1) * 0.5, risk=risk)


def chief_agent(sym, ctx, reports):
    max_lev = ASSETS[sym]["max_lev"]
    base = float(np.mean([reports[k]["score"] for k in ("News", "Sentiment", "Charts")]))
    skept = reports["Skeptic"].get("risk", .5)
    out = llm("Eres el Chief de un fondo de paper trading. Decide con los informes. Responde SOLO JSON: "
              '{"action":"LONG|SHORT|NO TRADE","confidence":0..1,"leverage":entero,"reason":"1-2 frases español"}',
              f"{sym} {ctx['change']:+.2f}% máx leverage {max_lev}x. Informes: " + json.dumps(reports, default=float), True)
    j = _json(out or "")
    if j and j.get("action") in ("LONG", "SHORT", "NO TRADE"):
        d = dict(action=j["action"], confidence=float(j.get("confidence", .5)),
                 leverage=int(j.get("leverage", 1) or 1), reason=j.get("reason", ""))
    else:
        act = "LONG" if base > 0.25 else "SHORT" if base < -0.25 else "NO TRADE"
        d = dict(action=act, confidence=min(1, abs(base)), leverage=2, reason="Decisión por consenso de scores.")
    # el Chief respeta al Skeptic y los límites de leverage
    if skept > 0.8 or d["confidence"] < 0.4:
        d["action"] = "NO TRADE"
    d["leverage"] = max(1, min(d["leverage"], max_lev))
    return d


PIPELINE = [("News", news_agent), ("Sentiment", sentiment_agent), ("Charts", charts_agent)]


def run_pipeline(sym, ctx, on_step=None):
    """Ejecuta News→Sentiment→Charts→Skeptic→Chief. on_step(nombre, estado, texto)."""
    reports, t0 = {}, time.time()
    for name, fn in PIPELINE:
        on_step and on_step(name, "running", "")
        reports[name] = fn(sym, ctx)
        on_step and on_step(name, "done", reports[name]["summary"])
    on_step and on_step("Skeptic", "running", "")
    reports["Skeptic"] = skeptic_agent(sym, ctx, reports)
    on_step and on_step("Skeptic", "done", reports["Skeptic"]["summary"])
    on_step and on_step("Chief", "running", "")
    decision = chief_agent(sym, ctx, reports)
    on_step and on_step("Chief", "done", f"{decision['action']} · {decision['reason']}")
    return dict(symbol=sym, ctx=ctx, reports=reports, decision=decision, ts=time.time(), secs=time.time() - t0)
