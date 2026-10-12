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

## 📱 Versión móvil (`grok.html`)
Una sola página HTML, sin servidor ni PC: estilo de juego (botones gruesos, filas de colores, líneas onduladas = los 6 agentes, árbol de leverage, barra de iconos).
Los precios los pide el propio navegador del móvil (Binance para crypto; Yahoo vía proxy CORS para acciones/metales). Cartera y ajustes se guardan en el móvil (localStorage).
- Los agentes usan reglas (RSI, medias, titulares); con una clave gratuita de Groq (opcional, se guarda solo en el móvil) Skeptic y Chief redactan con llama.
- `grok.html?demo=1` usa precios simulados (con banner) para probar el diseño.
- Para abrirlo en el móvil: GitHub → Settings → Pages → Deploy from a branch → rama y carpeta `/ (root)`; luego `https://<usuario>.github.io/bot/grok.html`.

### Precios reales de Yahoo
`.github/workflows/prices.yml` baja cada 5 min las velas de Yahoo (yfinance) y las publica en la rama `prices` (`prices.json`);
`grok.html` las lee de ahí (sin proxies ni claves) y usa los proxies solo como respaldo. Crypto va directo a Binance.
Los workflows programados solo corren desde la rama por defecto: haz merge a `main`, luego Actions → prices → Run workflow, y activa Pages.
