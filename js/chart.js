// ══════════════════════════════════════════
// TRADINGVIEW CHART
// ══════════════════════════════════════════

function getTVSymbol(ticker) {
  const map = {
    'BTC-USD': 'BITSTAMP:BTCUSD',
    'ETH-USD': 'BITSTAMP:ETHUSD',
    'ZEC-USD': 'BITSTAMP:ZECUSD',
    'ZEC-USDT':'BITSTAMP:ZECUSD',
    'LTC-USD': 'BITSTAMP:LTCUSD',
    'DOT-USD': 'KRAKEN:DOTUSD',
    'LINK-USD':'COINBASE:LINKUSD',
    'AVAX-USD':'COINBASE:AVAXUSD',
    'MATIC-USD':'COINBASE:MATICUSD',
    'GOLD':    'TVC:GOLD',
    'SPY':     'AMEX:SPY',
    'AAPL':    'NASDAQ:AAPL',
    'TSLA':    'NASDAQ:TSLA',
    'NVDA':    'NASDAQ:NVDA',
    'AMZN':    'NASDAQ:AMZN',
    'MSFT':    'NASDAQ:MSFT',
    'META':    'NASDAQ:META',
  };
  return map[ticker] || ticker;
}

// ── Indicator persistence ──────────────────
const DEFAULT_STUDIES = ['RSI@tv-basicstudies', 'MACD@tv-basicstudies', 'Volume@tv-basicstudies'];

function saveChartSettings() {
  const settings = {
    timeframe: state.chart_tf,
    studies: state.chart_studies || DEFAULT_STUDIES
  };
  localStorage.setItem('chart_settings', JSON.stringify(settings));
}

function loadChartSettings() {
  try {
    const raw = localStorage.getItem('chart_settings');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.timeframe) {
      state.chart_tf = s.timeframe;
      // Sync TF buttons
      document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
      const tfBtnMap = {'1':'tf-1m','5':'tf-5m','15':'tf-15m','30':'tf-30m','60':'tf-1h','240':'tf-4h','D':'tf-1d','W':'tf-1w'};
      const btnId = tfBtnMap[s.timeframe];
      if (btnId) { const btn = document.getElementById(btnId); if (btn) btn.classList.add('active'); }
    }
    if (s.studies) state.chart_studies = s.studies;
    else state.chart_studies = DEFAULT_STUDIES;
  } catch(e) { state.chart_studies = DEFAULT_STUDIES; }
}

function loadTVEmbed(ticker) {
  if (!state.chart_studies) loadChartSettings();
  const container = document.getElementById('tv-widget-container');
  const symbol = getTVSymbol(ticker);
  const interval = state.chart_tf;
  const studies = encodeURIComponent(JSON.stringify(state.chart_studies || DEFAULT_STUDIES));

  container.innerHTML = `
    <iframe
      src="https://s.tradingview.com/widgetembed/?frameElementId=tv-embed&symbol=${encodeURIComponent(symbol)}&interval=${interval}&hidesidetoolbar=0&hidetoptoolbar=0&saveimage=0&toolbarbg=111620&theme=dark&style=1&timezone=Europe%2FMadrid&studies=${studies}&locale=es&withdateranges=1&allow_symbol_change=1"
      style="width:100%;height:100%;border:none;"
      id="tv-embed"
      allow="clipboard-read; clipboard-write"
    ></iframe>
  `;

  const empty = document.getElementById('chart-empty');
  if (empty) empty.style.display = 'none';
}

function setChartTF(tf, el) {
  state.chart_tf = tf;
  document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  saveChartSettings();
  if (state.current_ticker) {
    loadTVEmbed(state.current_ticker);
    setTimeout(() => { if (state.current_ticker && typeof analyzeWithAI === 'function') analyzeWithAI(true); }, 800);
  }
  if (typeof updateExecInfo === 'function') updateExecInfo();
}

function syncTimeframeToChart() {
  const tf = document.getElementById('timeframe-select').value;
  let chartTf = 'D', btnId = 'tf-1d';
  if (tf === 'intraday') { chartTf = '15'; btnId = 'tf-15m'; }
  else if (tf === 'positional') { chartTf = 'W'; btnId = 'tf-1w'; }
  state.chart_tf = chartTf;
  document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(btnId);
  if (btn) btn.classList.add('active');
  saveChartSettings();
  if (state.current_ticker) loadTVEmbed(state.current_ticker);
}