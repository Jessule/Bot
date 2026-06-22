// ══════════════════════════════════════════
// STATE & PERSISTENCE
// ══════════════════════════════════════════
const INITIAL_CAPITAL = 10000;

let state = {
  capital: INITIAL_CAPITAL,
  initial_capital: INITIAL_CAPITAL,
  realized_pnl: 0,
  day_pnl: 0,
  trades_total: 0,
  trades_won: 0,
  positions: [],
  closed_trades: [],
  movements: [],
  current_signal: null,
  current_ticker: null,
  current_price: null,
  chart_tf: 'D',
  leverage: 1,
  bot_enabled: false,
  bot_countdown: null,
  bot_timer: 0,
  bot_mode: 'combined',
  _priceInterval: null,
  _priceUpdateInterval: null,
  _realtimeChart: null,
  _realtimeData: [],
  _priceHistory: [],
  _liveTicks: [],
  chart_view: 'tradingview',
  session_start: new Date().toDateString(),
  qty_mode: 'pct',
  qty_value: 10
};

function saveState(silent = false) {
  try {
    const toSave = {
      capital: state.capital,
      initial_capital: state.initial_capital,
      realized_pnl: state.realized_pnl,
      day_pnl: state.day_pnl,
      trades_total: state.trades_total,
      trades_won: state.trades_won,
      positions: state.positions,
      closed_trades: state.closed_trades,
      movements: state.movements,
      chart_tf: state.chart_tf,
      leverage: state.leverage,
      qty_mode: state.qty_mode,
      current_ticker: state.current_ticker,
      session_start: state.session_start,
      saved_at: new Date().toISOString()
    };
    localStorage.setItem('tradebot_state', JSON.stringify(toSave));
    document.getElementById('save-dot').className = 'save-dot saved';
    document.getElementById('save-text').textContent = 'Guardado ' + new Date().toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'});
    if (!silent) log('💾 Estado guardado correctamente', 'save');
  } catch(e) {
    log('❌ Error al guardar: ' + e.message, 'info');
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem('tradebot_state');
    if (!raw) return false;
    const saved = JSON.parse(raw);
    const today = new Date().toDateString();
    state.capital = saved.capital ?? INITIAL_CAPITAL;
    state.initial_capital = saved.initial_capital ?? INITIAL_CAPITAL;
    state.realized_pnl = saved.realized_pnl ?? 0;
    state.day_pnl = saved.session_start === today ? (saved.day_pnl ?? 0) : 0;
    state.trades_total = saved.trades_total ?? 0;
    state.trades_won = saved.trades_won ?? 0;
    state.positions = saved.positions ?? [];
    state.closed_trades = saved.closed_trades ?? [];
    state.movements = saved.movements ?? [];
    state.chart_tf = saved.chart_tf ?? 'D';
    state.leverage = saved.leverage ?? 1;
    state.qty_mode = saved.qty_mode ?? 'pct';
    state.current_ticker = saved.current_ticker ?? null;
    state.session_start = today;

    document.getElementById('capital-input').value = state.initial_capital;
    document.querySelectorAll('.lev-btn').forEach(b => {
      const lv = parseInt(b.textContent.replace('x',''));
      b.classList.toggle('active', lv === state.leverage);
    });

    const savedAt = saved.saved_at ? new Date(saved.saved_at).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '';
    document.getElementById('save-dot').className = 'save-dot saved';
    document.getElementById('save-text').textContent = 'Cargado ' + savedAt;
    return true;
  } catch(e) {
    return false;
  }
}

function resetState() {
  if (!confirm('¿Resetear todo el portfolio? Se perderán todas las posiciones y operaciones.')) return;
  localStorage.removeItem('tradebot_state');
  if (state._priceInterval) clearInterval(state._priceInterval);
  state.capital = INITIAL_CAPITAL;
  state.initial_capital = INITIAL_CAPITAL;
  state.realized_pnl = 0;
  state.day_pnl = 0;
  state.trades_total = 0;
  state.trades_won = 0;
  state.positions = [];
  state.closed_trades = [];
  state.movements = [];
  state._liveTicks = [];
  state.current_signal = null;
  document.getElementById('capital-input').value = INITIAL_CAPITAL;
  document.getElementById('save-dot').className = 'save-dot';
  document.getElementById('save-text').textContent = 'Sin guardar';
  renderPositions();
  if (typeof renderMovements === 'function') renderMovements();
  updatePortfolio();
  log('↺ Portfolio reseteado a valores iniciales', 'info');
}

function markUnsaved() {
  document.getElementById('save-dot').className = 'save-dot';
  document.getElementById('save-text').textContent = 'Sin guardar';
}
