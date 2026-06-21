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
  state.chart_view = view;
  document.getElementById('chart-tradingview-view').style.display = view === 'tradingview' ? 'flex' : 'none';
  document.getElementById('chart-realtime-view').style.display    = view === 'realtime'    ? 'flex' : 'none';
  document.getElementById('tab-tradingview')?.classList.toggle('active', view === 'tradingview');
  document.getElementById('tab-realtime')?.classList.toggle('active', view === 'realtime');
  if (view === 'realtime') setTimeout(() => drawLiveChart(), 60);
}

function updateRealtimeChart() {
  if (document.getElementById('chart-realtime-view').style.display !== 'none') drawLiveChart();
}

// Gráfico EN VIVO — línea construida con ticks reales (sin retraso de 15 min)
function drawLiveChart() {
  const canvas = document.getElementById('realtime-canvas');
  if (!canvas) return;
  if (document.getElementById('chart-realtime-view').style.display === 'none') return;

  const ctx = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  const w = canvas.width, h = canvas.height, padding = 46;
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  ctx.fillStyle = css('--bg');
  ctx.fillRect(0, 0, w, h);

  const ticks = state._liveTicks || [];
  if (ticks.length < 2) {
    ctx.fillStyle = css('--text3');
    ctx.font = '13px monospace'; ctx.textAlign = 'center';
    ctx.fillText('Esperando datos en vivo…', w / 2, h / 2);
    return;
  }

  const prices = ticks.map(t => t.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const range = (max - min) || (min * 0.001) || 1;
  const chartW = w - 2 * padding, chartH = h - 2 * padding;
  const xOf = i => padding + (chartW * i) / (ticks.length - 1);
  const yOf = p => padding + (1 - (p - min) / range) * chartH;

  // Grid + etiquetas de precio
  ctx.strokeStyle = css('--border'); ctx.lineWidth = 0.5;
  ctx.fillStyle = css('--text2'); ctx.font = '11px monospace'; ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const y = padding + (chartH / 5) * i;
    ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(w - padding, y); ctx.stroke();
    const price = min + (range / 5) * (5 - i);
    ctx.fillText('$' + price.toFixed(price >= 100 ? 2 : 4), padding - 8, y + 4);
  }

  const last = prices[prices.length - 1];
  const first = prices[0];
  const up = last >= first;
  const lineColor = up ? '#00d4a0' : '#ff4d6a';

  // Relleno bajo la línea
  ctx.beginPath();
  ctx.moveTo(xOf(0), yOf(prices[0]));
  ticks.forEach((t, i) => ctx.lineTo(xOf(i), yOf(t.price)));
  ctx.lineTo(xOf(ticks.length - 1), h - padding);
  ctx.lineTo(xOf(0), h - padding);
  ctx.closePath();
  ctx.fillStyle = up ? 'rgba(0,212,160,0.08)' : 'rgba(255,77,106,0.08)';
  ctx.fill();

  // Línea de precio
  ctx.beginPath();
  ticks.forEach((t, i) => { const x = xOf(i), y = yOf(t.price); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.strokeStyle = lineColor; ctx.lineWidth = 1.6; ctx.stroke();

  // Punto y etiqueta del último precio
  const lx = xOf(ticks.length - 1), ly = yOf(last);
  ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, Math.PI * 2); ctx.fillStyle = lineColor; ctx.fill();
  ctx.fillStyle = lineColor; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left';
  ctx.fillText('$' + last.toFixed(last >= 100 ? 2 : 4), Math.min(lx + 8, w - 70), ly + 4);
}
// Alias retrocompatible
function drawRealtimeChart() { drawLiveChart(); }

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
  if (typeof renderMovements === 'function') renderMovements();
  window.addEventListener('resize', () => { if (typeof drawLiveChart === 'function') drawLiveChart(); });
  // Restore last ticker
  if (state.current_ticker) {
    const inp = document.getElementById('ticker-input');
    if (inp) inp.value = state.current_ticker;
  }
  setTimeout(() => { if (typeof enableExecuteButtons === 'function') enableExecuteButtons(); }, 200);
  log('TradeBot AI iniciado ✅', 'info');
});

setInterval(() => saveState(true), 5000);
