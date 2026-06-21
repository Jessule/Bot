// ══════════════════════════════════════════
// APP.JS — UI utils, chart, init
// (state, save/load en storage.js)
// ══════════════════════════════════════════

// ── Utils ──────────────────────────────────
function fmt$(n) {
  const s = Math.abs(n).toFixed(2);
  return (n < 0 ? '-$' : '$') + parseFloat(s).toLocaleString('en-US', {minimumFractionDigits:2});
}
function fmtPct(n) {
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
}
function now() {
  return new Date().toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
function log(msg, type='info') {
  const el = document.getElementById('log-content');
  if (!el) return;
  const d = document.createElement('div');
  d.className = 'log-entry';
  d.innerHTML = `<span class="time">[${now()}]</span> <span class="event-${type}">${msg}</span>`;
  el.insertBefore(d, el.firstChild);
  if (el.children.length > 100) el.removeChild(el.lastChild);
}

// ── Chart views ───────────────────────────
function switchChartView(view) {
  document.getElementById('chart-tradingview-view').style.display = view === 'tradingview' ? 'flex' : 'none';
  document.getElementById('chart-realtime-view').style.display    = view === 'realtime'    ? 'flex' : 'none';
  document.getElementById('tab-tradingview').classList.toggle('active', view === 'tradingview');
  document.getElementById('tab-realtime').classList.toggle('active', view === 'realtime');
  if (view === 'realtime' && state.current_ticker) setTimeout(() => drawRealtimeChart(), 100);
}

function updateRealtimeChart() {
  if (document.getElementById('chart-realtime-view').style.display !== 'none') drawRealtimeChart();
}

function drawRealtimeChart() {
  const canvas = document.getElementById('realtime-canvas');
  if (!canvas || state._priceHistory.length === 0) return;
  const ctx = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  const data = state._priceHistory;
  const min  = Math.min(...data.map(d => d.low));
  const max  = Math.max(...data.map(d => d.high));
  const range = max - min || 1;
  const w = canvas.width, h = canvas.height, padding = 40;
  const chartW = w - 2*padding, chartH = h - 2*padding;
  const barW = Math.max(1, chartW / data.length);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 5; i++) {
    const y = padding + (chartH / 5) * i;
    ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(w - padding, y); ctx.stroke();
  }
  data.forEach((d, i) => {
    const x      = padding + i * barW;
    const openY  = padding + (1 - (d.open  - min) / range) * chartH;
    const closeY = padding + (1 - (d.close - min) / range) * chartH;
    const highY  = padding + (1 - (d.high  - min) / range) * chartH;
    const lowY   = padding + (1 - (d.low   - min) / range) * chartH;
    const color  = d.close >= d.open ? '#00d4a0' : '#ff4d6a';
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + barW/2, highY); ctx.lineTo(x + barW/2, lowY); ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, Math.min(openY, closeY), barW - 4, Math.abs(closeY - openY) || 1);
  });
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text2').trim();
  ctx.font = '12px monospace'; ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const price = min + (range / 5) * (5 - i);
    ctx.fillText('$' + price.toFixed(2), padding - 10, padding + (chartH/5)*i + 4);
  }
}

// ── Misc ──────────────────────────────────
function setTicker(t) {
  const inp = document.getElementById('ticker-input');
  if (inp) inp.value = t;
}

function setLeverage(x, el) {
  state.leverage = x;
  document.querySelectorAll('.lev-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  log(`Apalancamiento: x${x}`, 'info');
  if (state.current_signal && typeof updateExecInfo === 'function') updateExecInfo();
}

function syncQtySlider() {
  const slider = document.getElementById('qty-pct-slider');
  const input  = document.getElementById('qty-pct-input');
  if (slider && input) { input.value = parseFloat(slider.value).toFixed(1); }
  if (typeof updateExecInfo === 'function') updateExecInfo();
}
function syncQtyInput() {
  const input  = document.getElementById('qty-pct-input');
  const slider = document.getElementById('qty-pct-slider');
  if (input) {
    let val = Math.max(0.1, Math.min(100, parseFloat(input.value) || 0.1));
    input.value = val.toFixed(1);
    if (slider) slider.value = val;
  }
  if (typeof updateExecInfo === 'function') updateExecInfo();
}

// ── Init ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('ticker-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') analyzeWithAI();
  });

  document.getElementById('capital-input')?.addEventListener('change', () => {
    const cap = parseFloat(document.getElementById('capital-input').value) || INITIAL_CAPITAL;
    state.capital = cap; state.initial_capital = cap;
    updatePortfolio(); markUnsaved();
  });

  document.getElementById('qty-pct-slider')?.addEventListener('input', syncQtySlider);
  document.getElementById('qty-pct-input')?.addEventListener('change', syncQtyInput);

  loadState();
  if (typeof loadChartSettings === 'function') loadChartSettings();
  updatePortfolio();
  renderPositions();
  // Restore last ticker
  if (state.current_ticker) {
    const inp = document.getElementById('ticker-input');
    if (inp) inp.value = state.current_ticker;
  }
  setTimeout(() => { if (typeof enableExecuteButtons === 'function') enableExecuteButtons(); }, 200);
  log('TradeBot AI iniciado ✅', 'info');
});

setInterval(() => saveState(true), 5000);
