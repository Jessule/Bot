# ⚡ Grok Bot — paper trading multi-agente (100 % local y gratis)

Dashboard oscuro estilo app de trading con Scout, News, Sentiment, Charts, Skeptic y Chief.
LLM local con **Ollama + llama3.2**; datos con **yfinance** (+ order book público de Binance para crypto).

```bash
pip install -r requirements.txt
ollama pull llama3.2 && ollama serve     # opcional: sin Ollama usa heurísticas
streamlit run app.py
```

- **Activos**: AAPL, MSFT, NOW, SHOP, MU, AAOI (1x) · BTC, SOL, XRP (1-10x) · GOLD, SILVER (hasta 5x).
- **Paper trading**: $10.000 virtuales, leverage, precio de liquidación, stop-loss/take-profit, comisión 0,05 %. Estado en `data/portfolio.json`.
- **Modo automático** (barra lateral): el Scout escanea cada ~60 s; si un activo supera su umbral en la ventana elegida lanza News → Sentiment → Charts → Skeptic → Chief y, si el Chief decide LONG/SHORT, abre la posición (enfriamiento de 10 min por activo).
- Sin red, la app usa datos simulados (se indica en el portfolio).

## Trading 212 (solo lectura) y secretos
Copia `.env.example` a `.env` (está en `.gitignore`) y rellena `T212_API_KEY` / `T212_API_SECRET`
(`T212_ENV=demo|live`). Las credenciales solo se leen del entorno, no se escriben a disco ni al log,
y solo se usan para mostrar saldo/posiciones reales; las órdenes del bot son siempre paper.
**No pegues las claves en el chat ni las subas al repo.**

> La web anterior (`index.html`, `js/`) no se ha tocado.
