"""Grok-style paper trading bot multi-agente. Ejecuta: streamlit run app.py"""
import time

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from grokbot import agents, broker, market, trading212
from grokbot.config import AGENTS, ASSETS, SCOUT_INTERVAL_S, SCOUT_THRESHOLD, START_CASH, t212_creds

st.set_page_config(page_title="Grok Bot", page_icon="⚡", layout="wide")

GREEN, RED, MUTED = "#00d395", "#ff4d6a", "#8b93a7"
st.markdown(f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
html, body, [class*="css"], .stApp {{ font-family:'Inter',sans-serif; background:#0b0e14; color:#e6e9f0; }}
header[data-testid="stHeader"] {{ background:transparent; }}
section[data-testid="stSidebar"] {{ background:#0f131b; border-right:1px solid #1c2230; }}
.block-container {{ padding-top:1.2rem; max-width:1500px; }}
.card {{ background:#121722; border:1px solid #1c2230; border-radius:16px; padding:16px 18px; margin-bottom:12px; }}
.card h4 {{ margin:0 0 10px; font-size:.72rem; letter-spacing:.12em; color:{MUTED}; text-transform:uppercase; font-weight:600; }}
.hero {{ background:linear-gradient(135deg,#131a28,#0f1420); border:1px solid #1f2840; border-radius:20px; padding:22px 26px; margin-bottom:14px; }}
.eq {{ font-size:3.2rem; font-weight:800; letter-spacing:-.03em; line-height:1.05; }}
.pill {{ display:inline-block; padding:3px 10px; border-radius:999px; font-weight:700; font-size:.85rem; }}
.up {{ color:{GREEN}; }} .down {{ color:{RED}; }} .muted {{ color:{MUTED}; }}
.pill.up {{ background:rgba(0,211,149,.14); }} .pill.down {{ background:rgba(255,77,106,.14); }}
.kpi {{ display:inline-block; margin-right:34px; }} .kpi b {{ display:block; font-size:1.15rem; }}
.kpi span {{ font-size:.7rem; color:{MUTED}; text-transform:uppercase; letter-spacing:.1em; }}
.scout {{ display:flex; align-items:center; justify-content:space-between; padding:9px 0; border-bottom:1px solid #1a2030; }}
.scout:last-child {{ border:0; }} .sym {{ font-weight:700; }} .tag {{ font-size:.62rem; padding:2px 7px; border-radius:6px; margin-left:6px; font-weight:700; }}
.tag.hot {{ background:rgba(255,170,0,.16); color:#ffb020; }} .tag.cls {{ background:#1a2030; color:{MUTED}; }}
.agent {{ display:flex; gap:10px; padding:8px 0; border-bottom:1px solid #1a2030; align-items:flex-start; }}
.agent:last-child {{ border:0; }} .dot {{ width:9px; height:9px; border-radius:50%; margin-top:6px; flex:none; background:#39425a; }}
.dot.running {{ background:#ffb020; animation:p 1s infinite; }} .dot.done {{ background:{GREEN}; }}
@keyframes p {{ 50% {{ opacity:.25; }} }}
.ob {{ display:flex; justify-content:space-between; gap:14px; font-size:.78rem; padding:2px 6px; position:relative; font-variant-numeric:tabular-nums; }}
.ob i {{ position:absolute; right:0; top:0; bottom:0; opacity:.16; z-index:0; }} .ob span {{ position:relative; z-index:1; }}
.stButton>button {{ border-radius:10px; border:1px solid #263049; background:#171d2b; color:#e6e9f0; font-weight:600; }}
.stButton>button:hover {{ border-color:{GREEN}; color:{GREEN}; }}
button[kind="primary"] {{ background:{GREEN}!important; color:#04140e!important; border:0!important; }}
</style>""", unsafe_allow_html=True)

ss = st.session_state
ss.setdefault("pf", broker.load())
ss.setdefault("agent_state", {n: ("idle", d) for n, _, d in AGENTS})
ss.setdefault("last_scan", 0.0)
ss.setdefault("scan_hits", [])
ss.setdefault("runs", [])
ss.setdefault("cooldown", {})
ss.setdefault("sel", "BTC")
ss.setdefault("t212", None)


def refresh():
    try:
        st.rerun(scope="fragment")
    except st.errors.StreamlitAPIException:
        st.rerun()


def fmt(x, d=2):
    return f"{x:,.{d}f}"


def pdec(sym):
    return 4 if sym == "XRP" else 2


def spark(vals, up, w=90, h=26):
    if len(vals) < 2:
        return ""
    lo, hi = min(vals), max(vals)
    r = (hi - lo) or 1
    pts = " ".join(f"{i * w / (len(vals) - 1):.1f},{h - (v - lo) / r * (h - 2) - 1:.1f}" for i, v in enumerate(vals))
    return f'<svg width="{w}" height="{h}"><polyline fill="none" stroke="{GREEN if up else RED}" stroke-width="1.6" points="{pts}"/></svg>'


# ───────────────────────── Sidebar ─────────────────────────
with st.sidebar:
    st.markdown("## ⚡ Grok Bot")
    llm_up = agents.ollama_ok()
    st.markdown(f"**Ollama** · <span class='{'up' if llm_up else 'down'}'>{'● llama3.2 listo' if llm_up else '● apagado (modo heurístico)'}</span>",
                unsafe_allow_html=True)
    if not llm_up:
        st.caption("Arranca con `ollama serve` y `ollama pull llama3.2`.")
    st.divider()
    auto = st.toggle("🤖 Modo automático", value=False, help="El Scout escanea cada ~1 min y lanza el pipeline si hay movimiento fuerte.")
    auto_exec = st.toggle("Ejecutar decisiones del Chief", value=True, disabled=not auto)
    window = st.slider("Ventana Scout (min)", 5, 60, 15)
    mult = st.slider("Sensibilidad (× umbral)", 0.5, 3.0, 1.0, 0.1)
    risk_pct = st.slider("Margen por operación auto (% equity)", 1, 20, 5)
    sl, tp = st.slider("Stop-loss %", 1, 20, 5), st.slider("Take-profit %", 1, 40, 10)
    st.divider()
    with st.expander("🔐 Trading 212 (solo lectura)"):
        k, s, env = t212_creds()
        if k:
            st.caption("Credenciales cargadas desde entorno/.env.")
        else:
            st.caption("Mejor en `.env` (ignorado por git). Aquí solo viven en memoria de esta sesión; nunca se guardan.")
            k = st.text_input("API key / ID", type="password")
            s = st.text_input("API secret", type="password")
            env = st.selectbox("Entorno", ["demo", "live"])
        if st.button("Conectar") and k:
            ss.t212 = trading212.summary((k, s, env))
    st.divider()
    if st.button("♻️ Reiniciar cartera"):
        ss.pf = broker.reset()
        st.rerun()


# ───────────────────────── Pipeline / Scout ─────────────────────────
def execute(decision, sym, price, equity):
    if decision["action"] == "NO TRADE":
        return None
    margin = min(equity * risk_pct / 100, ss.pf["cash"] * 0.95)
    pos, _ = broker.open_position(ss.pf, sym, decision["action"], margin, decision["leverage"], price,
                                  decision["reason"], sl, tp)
    return pos


def launch_pipeline(row, px, equity, execute_trade, box=None):
    sym = row["symbol"]
    ctx = dict(change=row["change"], price=row["price"])

    def step(name, state, text):
        ss.agent_state[name] = (state, text or ("analizando…" if state == "running" else ""))
        if box is not None:
            box.write(f"**{name}** · {state} {('— ' + text) if text else ''}")

    ss.agent_state["Scout"] = ("done", f"{sym} {row['change']:+.2f}% → pipeline")
    run = agents.run_pipeline(sym, ctx, step)
    run["opened"] = bool(execute_trade and execute(run["decision"], sym, px[sym], broker.equity(ss.pf, px)))
    ss.runs.insert(0, run)
    ss.runs = ss.runs[:15]
    ss.cooldown[sym] = time.time()
    return run


def scout_tick(px, auto_on, equity):
    mv = market.moves(window)
    hits = []
    for _, r in mv.iterrows():
        thr = SCOUT_THRESHOLD[ASSETS[r.symbol]["cls"]] * mult
        if abs(r.change) >= thr:
            hits.append(r)
    ss.scout_moves = mv
    ss.scan_hits = [h.symbol for h in hits]
    ss.agent_state["Scout"] = ("done", f"Escaneo {time.strftime('%H:%M:%S')} · {len(hits)} movimientos fuertes")
    if auto_on:
        for h in sorted(hits, key=lambda r: -abs(r.change)):
            if time.time() - ss.cooldown.get(h.symbol, 0) > 600:  # 10 min de enfriamiento por activo
                with st.status(f"Pipeline automático: {h.symbol} {h.change:+.2f}%", expanded=True) as stt:
                    launch_pipeline(h, px, equity, auto_exec, stt)
                    stt.update(state="complete")
                break  # un pipeline por escaneo


# ───────────────────────── Dashboard (se refresca solo) ─────────────────────────
@st.fragment(run_every=15 if auto else None)
def dashboard():
    px = market.prices()
    _, simulated = market.history()
    pf = ss.pf
    broker.check_risk(pf, px)
    eq = broker.equity(pf, px)
    now = time.time()
    if now - ss.last_scan >= SCOUT_INTERVAL_S or "scout_moves" not in ss:
        ss.last_scan = now
        scout_tick(px, auto, eq)
        eq = broker.equity(pf, px)
    broker.snapshot(pf, px)

    tot = eq - START_CASH
    totp = tot / START_CASH * 100
    unreal = sum(broker.pnl(p, px.get(p["symbol"], p["entry"])) for p in pf["positions"])
    used = sum(p["margin"] for p in pf["positions"])
    cls = "up" if tot >= 0 else "down"
    st.markdown(f"""<div class="hero">
      <div class="muted" style="font-size:.75rem;letter-spacing:.14em;font-weight:600">PORTFOLIO · PAPER {'· DATOS SIMULADOS (sin red)' if simulated else ''}</div>
      <div style="display:flex;align-items:baseline;gap:18px;flex-wrap:wrap">
        <div class="eq">${fmt(eq)}</div>
        <span class="pill {cls}">{'▲' if tot >= 0 else '▼'} {tot:+,.2f} ({totp:+.2f}%)</span>
      </div>
      <div style="margin-top:12px">
        <div class="kpi"><span>Efectivo</span><b>${fmt(pf['cash'])}</b></div>
        <div class="kpi"><span>Margen usado</span><b>${fmt(used)}</b></div>
        <div class="kpi"><span>PnL abierto</span><b class="{'up' if unreal >= 0 else 'down'}">{unreal:+,.2f}</b></div>
        <div class="kpi"><span>Posiciones</span><b>{len(pf['positions'])}</b></div>
        <div class="kpi"><span>Modo</span><b>{'AUTO ●' if auto else 'Manual'}</b></div>
      </div></div>""", unsafe_allow_html=True)

    left, mid, right = st.columns([1.15, 1.7, 1.15], gap="medium")

    # ── Scout ──
    with left:
        mv = ss.get("scout_moves", pd.DataFrame())
        html = ""
        for _, r in mv.reindex(mv.change.abs().sort_values(ascending=False).index).iterrows():
            hot = r.symbol in ss.scan_hits
            c = "up" if r.change >= 0 else "down"
            tag = '<span class="tag hot">🔥 FUERTE</span>' if hot else ""
            html += (f"<div class='scout'><div><span class='sym'>{r.symbol}</span>{tag}"
                     f"<span class='tag cls'>{ASSETS[r.symbol]['cls']}</span></div>"
                     f"{spark(r.spark, r.change >= 0)}"
                     f"<div style='text-align:right'><div>${fmt(r.price, pdec(r.symbol))}</div>"
                     f"<div class='{c}' style='font-size:.8rem;font-weight:700'>{r.change:+.2f}%</div></div></div>")
        st.markdown(f"<div class='card'><h4>🔭 Scout · movimientos en vivo</h4>{html}</div>", unsafe_allow_html=True)
        nxt = max(0, int(SCOUT_INTERVAL_S - (time.time() - ss.last_scan)))
        st.caption(f"Próximo escaneo en ~{nxt}s" if auto else "Auto desactivado: pulsa el botón para escanear.")
        if st.button("🔍 Escanear ahora", width="stretch"):
            ss.last_scan = 0
            refresh()

    # ── Gráfico + order book + ticket ──
    with mid:
        syms = list(ASSETS)
        ss.sel = st.selectbox("Activo", syms, index=syms.index(ss.sel), label_visibility="collapsed",
                              format_func=lambda s: f"{s} · {ASSETS[s]['name']}")
        c1, c2 = st.columns([2.2, 1])
        with c1:
            cd = market.candles(ss.sel).tail(120)
            fig = go.Figure(go.Candlestick(x=cd.index, open=cd.Open, high=cd.High, low=cd.Low, close=cd.Close,
                                           increasing_line_color=GREEN, decreasing_line_color=RED))
            for p in pf["positions"]:
                if p["symbol"] == ss.sel:
                    fig.add_hline(y=p["entry"], line_dash="dot", line_color="#6c8cff", annotation_text=f"{p['side']} x{p['lev']}")
            fig.update_layout(height=330, margin=dict(l=0, r=0, t=10, b=0), paper_bgcolor="#121722", plot_bgcolor="#121722",
                              xaxis_rangeslider_visible=False, font_color=MUTED, xaxis_gridcolor="#1a2030", yaxis_gridcolor="#1a2030")
            st.plotly_chart(fig, width="stretch")
        with c2:
            bids, asks, real = market.orderbook(ss.sel, px[ss.sel], 8)
            mx = max(q for _, q in bids + asks)
            row = lambda p, q, col: (f"<div class='ob'><i style='width:{q / mx * 100:.0f}%;background:{col}'></i>"
                                     f"<span style='color:{col}'>{p:,.{pdec(ss.sel)}f}</span><span class='muted'>{q:,.2f}</span></div>")
            html = "".join(row(p, q, RED) for p, q in reversed(asks[:8])) + \
                   f"<div style='text-align:center;font-weight:800;padding:4px;white-space:nowrap;font-size:.9rem'>${fmt(px[ss.sel], pdec(ss.sel))}</div>" + \
                   "".join(row(p, q, GREEN) for p, q in bids[:8])
            st.markdown(f"<div class='card'><h4>Order book {'(Binance)' if real else '(simulado)'}</h4>{html}</div>", unsafe_allow_html=True)

        with st.expander("➕ Nueva operación manual", expanded=False):
            a, b, c = st.columns(3)
            side = a.radio("Lado", ["LONG", "SHORT"], horizontal=True)
            ml = ASSETS[ss.sel]["max_lev"]
            lev = b.slider("Leverage", 1, ml, min(2, ml), disabled=ml == 1)
            margin = c.number_input("Margen $", 10.0, float(max(10.0, pf["cash"])), min(500.0, float(max(10.0, pf["cash"]))), 50.0)
            if st.button("Abrir posición", type="primary", width="stretch"):
                pos, msg = broker.open_position(pf, ss.sel, side, margin, lev, px[ss.sel], "manual", sl, tp)
                st.toast(f"{side} {ss.sel} abierta" if pos else msg)
                refresh()

    # ── Agentes ──
    with right:
        html = "".join(f"<div class='agent'><div class='dot {ss.agent_state[n][0]}'></div><div><b>{ic} {n}</b>"
                       f"<div class='muted' style='font-size:.78rem'>{ss.agent_state[n][1] or d}</div></div></div>"
                       for n, ic, d in AGENTS)
        st.markdown(f"<div class='card'><h4>Agentes</h4>{html}</div>", unsafe_allow_html=True)
        if st.button("▶ Lanzar pipeline en " + ss.sel, width="stretch"):
            mvs = ss.get("scout_moves", market.moves(window))
            row = mvs[mvs.symbol == ss.sel].iloc[0]
            with st.status("Pipeline en curso…", expanded=True) as stt:
                launch_pipeline(row, px, eq, False, stt)
                stt.update(state="complete")
            refresh()
        if ss.runs:
            r = ss.runs[0]
            d = r["decision"]
            col = {"LONG": GREEN, "SHORT": RED}.get(d["action"], MUTED)
            st.markdown(f"<div class='card'><h4>Última decisión del Chief</h4><div style='font-size:1.4rem;font-weight:800;color:{col}'>"
                        f"{d['action']} {r['symbol']}</div><div class='muted' style='font-size:.8rem'>conf {d['confidence']:.0%} · x{d['leverage']}"
                        f"{' · ejecutada' if r.get('opened') else ''}</div><p style='font-size:.85rem'>{d['reason']}</p></div>", unsafe_allow_html=True)
            if d["action"] != "NO TRADE" and not r.get("opened") and st.button("Ejecutar esta decisión", width="stretch"):
                execute(d, r["symbol"], px[r["symbol"]], eq)
                r["opened"] = True
                refresh()

    # ── Posiciones ──
    st.markdown("### Posiciones abiertas")
    if not pf["positions"]:
        st.caption("Sin posiciones abiertas.")
    else:
        h = st.columns([1.1, .8, .7, 1.1, 1.1, 1.1, 1.2, .9])
        for col, t in zip(h, ["Activo", "Lado", "Lev", "Entrada", "Actual", "Liquidación", "PnL", ""]):
            col.markdown(f"<span class='muted' style='font-size:.7rem'>{t.upper()}</span>", unsafe_allow_html=True)
        for p in list(pf["positions"]):
            cur = px.get(p["symbol"], p["entry"])
            pn = broker.pnl(p, cur)
            c = "up" if pn >= 0 else "down"
            cols = st.columns([1.1, .8, .7, 1.1, 1.1, 1.1, 1.2, .9])
            d = pdec(p["symbol"])
            cols[0].markdown(f"**{p['symbol']}**")
            cols[1].markdown(f"<span class='{'up' if p['side'] == 'LONG' else 'down'}'>{p['side']}</span>", unsafe_allow_html=True)
            cols[2].markdown(f"{p['lev']}x")
            cols[3].markdown(fmt(p["entry"], d))
            cols[4].markdown(fmt(cur, d))
            cols[5].markdown(f"<span class='muted'>{fmt(p['liq'], d)}</span>", unsafe_allow_html=True)
            cols[6].markdown(f"<span class='{c}'><b>{pn:+,.2f}</b> ({pn / p['margin'] * 100:+.1f}%)</span>", unsafe_allow_html=True)
            if cols[7].button("Cerrar", key=f"x{p['id']}"):
                broker.close_position(pf, p["id"], cur)
                refresh()

    t1, t2, t3 = st.tabs(["📈 Equity", "🧾 Historial", "🏦 Trading 212"])
    with t1:
        ec = pd.DataFrame(pf["equity_curve"], columns=["t", "eq"])
        if len(ec) > 1:
            ec["t"] = pd.to_datetime(ec.t, unit="s")
            f = go.Figure(go.Scatter(x=ec.t, y=ec["eq"], fill="tozeroy", line_color=GREEN if tot >= 0 else RED,
                                     fillcolor="rgba(0,211,149,.08)" if tot >= 0 else "rgba(255,77,106,.08)"))
            f.update_layout(height=240, margin=dict(l=0, r=0, t=10, b=0), paper_bgcolor="#0b0e14", plot_bgcolor="#0b0e14",
                            font_color=MUTED, yaxis_gridcolor="#1a2030", yaxis_range=[min(ec["eq"]) * .995, max(ec["eq"]) * 1.005])
            st.plotly_chart(f, width="stretch")
    with t2:
        if pf["history"]:
            hd = pd.DataFrame(pf["history"])[["symbol", "side", "lev", "entry", "exit", "pnl", "why"]].iloc[::-1]
            st.dataframe(hd, width="stretch", hide_index=True)
        st.caption("Log: " + " · ".join(pf["log"][-4:]))
        for r in ss.runs[:5]:
            with st.expander(f"{time.strftime('%H:%M:%S', time.localtime(r['ts']))} · {r['symbol']} {r['ctx']['change']:+.2f}% → {r['decision']['action']}"):
                for n, rep in r["reports"].items():
                    st.markdown(f"**{n}** ({rep['score']:+.2f}): {rep['summary']}")
    with t3:
        if ss.t212:
            data, err = ss.t212
            if err:
                st.error(err)
            else:
                st.json(data)
        else:
            st.caption("Conecta desde la barra lateral para ver saldo/posiciones reales (solo lectura). Las órdenes del bot siguen siendo paper.")


dashboard()
