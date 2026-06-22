// ══════════════════════════════════════════
// TRADING.JS — TradeBot AI v6
// ══════════════════════════════════════════

const CONF_PCT = { 'ALTA': 82, 'MEDIA': 55, 'BAJA': 30 };
const BOT_MIN_CONFIDENCE = 60;
const BOT_INTERVAL_SEC   = 10;

// Bot mode: 'combined' (RSI+MACD+BB+MA) or 'macd' (solo MACD crossover)
state.bot_mode = state.bot_mode || 'combined';

function setBotMode(mode) {
  state.bot_mode = mode;
  log(`🤖 Modo bot: ${mode === 'macd' ? 'Solo MACD' : 'Combinado'}`, 'bot');
}

function toggleBotInfoPanel() {
  const panel = document.getElementById('bot-info-panel');
  if (!panel) return;
  const isVisible = panel.style.display !== 'none';
  panel.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) updateBotInfoPanel();
}

function updateBotInfoPanel() {
  const panel = document.getElementById('bot-info-panel');
  if (!panel || panel.style.display === 'none') return;
  const content = document.getElementById('bot-info-content');
  if (!content) return;

  const s = state.current_signal;
  if (!s) {
    content.innerHTML = '<div style="color:var(--text3);text-align:center;padding:10px;">Analiza un ticker primero para ver el análisis del bot.</div>';
    return;
  }

  const confPct  = getConfidencePct(s);
  const confColor = confPct >= 75 ? 'var(--accent)' : confPct >= 55 ? 'var(--yellow)' : 'var(--red)';
  const willAct  = s.signal !== 'WAIT' && confPct >= BOT_MIN_CONFIDENCE;

  // MACD-only confidence — use pre-calculated from signal if available
  let macdOnlyPct = s.macd_conf_pct ?? 0;
  if (!macdOnlyPct) {
    if (s.macd_cross_up || s.macd_cross_down) macdOnlyPct = 65;
    else if (s.macd_signal === 'BULLISH' || s.macd_signal === 'BEARISH') {
      macdOnlyPct = (s.macd_hist !== undefined && Math.abs(s.macd_hist) > 0) ? 45 : 22;
    }
  }
  const macdOnlyColor = macdOnlyPct >= 60 ? 'var(--accent)' : macdOnlyPct >= 40 ? 'var(--yellow)' : 'var(--red)';

  // MACD why-text
  let macdWhyText = '';
  if (s.macd_cross_up) macdWhyText = 'Cruce alcista → +65 (señal máxima)';
  else if (s.macd_cross_down) macdWhyText = 'Cruce bajista → +65 (señal máxima)';
  else if (s.macd_signal === 'BULLISH') {
    const accel = s.macd_accel;
    if (accel > 0.3) macdWhyText = `Bullish + ⚡aceleración ${(accel*100).toFixed(0)}% → +55`;
    else if (s.macd_hist > (s.macd_hist - (s.macd_hist_delta||0))) macdWhyText = `Bullish momentum creciendo → +45`;
    else macdWhyText = `Bullish momentum debilitando → +22`;
  } else if (s.macd_signal === 'BEARISH') {
    const accel = s.macd_accel;
    if (accel > 0.3) macdWhyText = `Bearish + ⚡aceleración ${(accel*100).toFixed(0)}% → +55`;
    else macdWhyText = `Bearish momentum → +22 a +45`;
  } else {
    macdWhyText = 'Sin dirección MACD → +0';
  }
  const tfLabel  = getTFLabel();

  // Build MACD-primary confidence reasons
  const reasons = [];

  // 1. MACD (primary — up to 60pts)
  if (s.macd_cross_up)        reasons.push(`✅ MACD cruce ALCISTA → +60 confianza (señal principal)`);
  else if (s.macd_cross_down) reasons.push(`✅ MACD cruce BAJISTA → +60 confianza (señal principal)`);
  else if (s.macd_signal === 'BULLISH') {
    const histTxt = s.macd_hist !== undefined ? ` (hist:${s.macd_hist.toFixed(4)})` : '';
    reasons.push(`✅ MACD sobre señal${histTxt} → tendencia alcista (+25-45)`);
  } else if (s.macd_signal === 'BEARISH') {
    const histTxt = s.macd_hist !== undefined ? ` (hist:${s.macd_hist.toFixed(4)})` : '';
    reasons.push(`✅ MACD bajo señal${histTxt} → tendencia bajista (+25-45)`);
  } else {
    reasons.push(`⚠️ MACD neutral → sin dirección clara (+0)`);
  }

  // 2. RSI confirmation (+0 to +20)
  if (s.rsi < 30)       reasons.push(`✅ RSI sobrevendido (${s.rsi}) → confirma compra (+20)`);
  else if (s.rsi > 70)  reasons.push(`✅ RSI sobrecomprado (${s.rsi}) → confirma venta (+20)`);
  else if (s.rsi < 45)  reasons.push(`✅ RSI bajo (${s.rsi}) → confirmación parcial (+12)`);
  else if (s.rsi > 55)  reasons.push(`✅ RSI alto (${s.rsi}) → confirmación parcial (+12)`);
  else                  reasons.push(`⚠️ RSI neutral (${s.rsi}) → sin confirmación (+5)`);

  // 3. MA confirmation (+0 to +10)
  if (s.ma_signal === 'ABOVE')  reasons.push(`✅ Precio sobre MA → tendencia alcista (+5-10)`);
  else if (s.ma_signal === 'BELOW') reasons.push(`✅ Precio bajo MA → tendencia bajista (+5-10)`);
  else reasons.push(`⚠️ MA neutral (+0)`);

  // 4. BB confirmation (+0 to +10)
  if (s.bb_signal === 'LOWER')  reasons.push(`✅ BB banda inferior → rebote posible (+10)`);
  else if (s.bb_signal === 'UPPER') reasons.push(`✅ BB banda superior → corrección posible (+10)`);
  else reasons.push(`⚠️ BB zona media → sin señal extra (+0)`);

  const botDecision = willAct
    ? `<span style="color:var(--accent);font-weight:700;">⚡ EJECUTARÁ ${s.signal === 'BUY' ? '▲ LONG' : '▼ SHORT'}</span>`
    : `<span style="color:var(--yellow);">⏸ NO EJECUTA — confianza insuficiente (${confPct}% < ${BOT_MIN_CONFIDENCE}% mínimo)</span>`;

  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border);">
      <span style="color:var(--text);font-weight:600;">${s.ticker} <span style="color:var(--text2);font-size:0.65rem;">[${tfLabel}]</span></span>
      <span style="color:${confColor};font-weight:800;font-size:1.1rem;">${confPct}%</span>
    </div>
    <div style="margin-bottom:8px;">${botDecision}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
      <div style="background:var(--surface2);border-radius:6px;padding:6px;text-align:center;">
        <div style="font-size:0.55rem;color:var(--text3);text-transform:uppercase;">Entrada</div>
        <div style="color:var(--text);font-family:var(--mono);font-size:0.8rem;font-weight:700;">$${s.entry.toFixed(2)}</div>
      </div>
      <div style="background:var(--surface2);border-radius:6px;padding:6px;text-align:center;">
        <div style="font-size:0.55rem;color:var(--text3);text-transform:uppercase;">Take Profit</div>
        <div style="color:var(--accent);font-family:var(--mono);font-size:0.8rem;font-weight:700;">$${s.take_profit.toFixed(2)}</div>
        <div style="font-size:0.5rem;color:var(--text3);">${s.tp_source||''}</div>
      </div>
      <div style="background:var(--surface2);border-radius:6px;padding:6px;text-align:center;">
        <div style="font-size:0.55rem;color:var(--text3);text-transform:uppercase;">Stop Loss</div>
        <div style="color:var(--red);font-family:var(--mono);font-size:0.8rem;font-weight:700;">$${s.stop_loss.toFixed(2)}</div>
        <div style="font-size:0.5rem;color:var(--text3);">${s.sl_source||''}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
      <div style="background:var(--surface2);border-radius:6px;padding:8px;text-align:center;">
        <div style="font-size:0.55rem;color:var(--text3);text-transform:uppercase;margin-bottom:3px;">Confianza Total</div>
        <div style="color:${confColor};font-weight:800;font-size:1.1rem;">${confPct}%</div>
        <div style="font-size:0.55rem;color:var(--text3);">RSI+MACD+MA+BB</div>
      </div>
      <div style="background:var(--surface2);border-radius:6px;padding:8px;text-align:center;">
        <div style="font-size:0.55rem;color:var(--text3);text-transform:uppercase;margin-bottom:3px;">Solo MACD</div>
        <div style="color:${macdOnlyColor};font-weight:800;font-size:1.1rem;">${macdOnlyPct}%</div>
        <div style="font-size:0.55rem;color:var(--text3);margin-top:2px;">${macdWhyText}</div>
      </div>
    </div>
    <div style="font-size:0.68rem;color:var(--text2);margin-bottom:6px;font-weight:600;">¿Por qué ${confPct}% de confianza?</div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      ${reasons.map(r => `<div style="font-size:0.68rem;color:var(--text2);">${r}</div>`).join('')}
    </div>
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:0.63rem;color:var(--text3);">
      El bot ejecuta cuando confianza ≥ ${BOT_MIN_CONFIDENCE}% y señal ≠ WAIT
    </div>
  `;
}

function getConfidencePct(signal) {
  if (!signal) return 0;
  if (typeof signal.confidence_pct === 'number') return signal.confidence_pct;
  return CONF_PCT[signal.confidence] || 30;
}

const CRYPTO_ID_MAP = {
  'BTC-USD':'bitcoin',     'BTC':'bitcoin',
  'BTC-USDT':'bitcoin',    'BTCUSDT':'bitcoin',
  'ETH-USD':'ethereum',    'ETH':'ethereum',
  'ETH-USDT':'ethereum',   'ETHUSDT':'ethereum',
  'SOL-USD':'solana',      'SOL':'solana',
  'SOL-USDT':'solana',     'SOLUSDT':'solana',
  'DOGE-USD':'dogecoin',   'DOGE':'dogecoin',
  'XRP-USD':'ripple',      'XRP':'ripple',
  'ADA-USD':'cardano',     'ADA':'cardano',
  'BNB-USD':'binancecoin', 'BNB':'binancecoin',
  'ZEC-USD':'zcash',       'ZEC':'zcash',
  'ZEC-USDT':'zcash',      'ZECUSDT':'zcash',   'ZEC-USDT':'zcash',
  'LTC-USD':'litecoin',    'LTC':'litecoin',
  'DOT-USD':'polkadot',    'DOT':'polkadot',
  'LINK-USD':'chainlink',  'LINK':'chainlink',
  'AVAX-USD':'avalanche-2','AVAX':'avalanche-2',
  'MATIC-USD':'matic-network','MATIC':'matic-network',
};

const COMPANY_NAMES = {
  'AAPL': 'Apple',
  'MSFT': 'Microsoft',
  'TSLA': 'Tesla',
  'NVDA': 'NVIDIA',
  'AMZN': 'Amazon',
  'META': 'Meta',
  'SPY': 'S&P 500',
  'MU': 'Micron',
  'BTC-USD': 'Bitcoin',
  'BTC-USDT': 'Bitcoin',
  'ETH-USD': 'Ethereum',
  'ETH-USDT': 'Ethereum',
  'SOL-USD': 'Solana',
  'SOL-USDT': 'Solana',
  'ZEC-USD': 'Zcash',
  'ZEC-USDT': 'Zcash',
  'ZECUSDT': 'Zcash',
  'DOGE-USD': 'Dogecoin',
  'XRP-USD': 'Ripple',
  'ADA-USD': 'Cardano',
  'LINK-USD': 'Chainlink',
  'AVAX-USD': 'Avalanche',
  'MATIC-USD': 'Polygon',
  'LTC-USD': 'Litecoin',
  'DOT-USD': 'Polkadot',
};

// ── Timeframe helpers ──────────────────────────────────────────
// Returns a human label for the active chart timeframe
function getTFLabel() {
  const tf = state.chart_tf;
  const MAP = { '1':'1m', '5':'5m', '15':'15m', '30':'30m', '60':'1H', '240':'4H', 'D':'1D', 'W':'1W' };
  return MAP[tf] || tf;
}

// Returns CoinGecko interval param that best fits the active chart TF
function getCGInterval() {
  const tf = state.chart_tf;
  if (tf === '1')              return { days: 2, interval: 'minutely' };
  if (['5','15','30'].includes(tf)) return { days: 1, interval: 'minutely' };
  if (tf === '60' || tf === '240') return { days: 14, interval: 'hourly' };
  return { days: 90, interval: 'daily' };
}

// Returns Yahoo Finance range/interval params for the active TF
function getYFParams() {
  const tf = state.chart_tf;
  if (tf === '1')   return { interval: '1m',  range: '1d' };
  if (tf === '5')   return { interval: '5m',  range: '5d' };
  if (tf === '15')  return { interval: '15m', range: '5d' };
  if (tf === '30')  return { interval: '30m', range: '5d' };
  if (tf === '60')  return { interval: '60m', range: '1mo' };
  if (tf === '240') return { interval: '60m', range: '3mo' };
  if (tf === 'W')   return { interval: '1wk', range: '2y' };
  return { interval: '1d', range: '90d' };  // default D
}

function isCrypto(ticker) {
  return !!(CRYPTO_ID_MAP[ticker] || CRYPTO_ID_MAP[(ticker||'').toUpperCase()]);
}

function isDST(date) {
  const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
  return Math.max(jan, jul) !== date.getTimezoneOffset();
}
function getETTime() {
  const now = new Date();
  const etOffset = isDST(now) ? -4 : -5;
  return new Date(now.getTime() + (etOffset + now.getTimezoneOffset() / 60) * 3600000);
}
function isUSMarketOpen() {
  const et = getETTime(); const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const hm = et.getHours() * 100 + et.getMinutes();
  return hm >= 930 && hm < 1600;
}
function isUSExtendedHours() {
  const et = getETTime(); const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const hm = et.getHours() * 100 + et.getMinutes();
  return (hm >= 400 && hm < 930) || (hm >= 1600 && hm < 2000);
}
function canTrade(ticker) {
  if (isCrypto(ticker)) return { ok: true, reason: '24/7 crypto' };
  if (isUSMarketOpen())      return { ok: true, reason: 'mercado abierto' };
  if (isUSExtendedHours())   return { ok: true, reason: 'horario extendido' };
  return { ok: false, reason: 'mercado cerrado' };
}
function getMarketStatusLabel(ticker) {
  if (isCrypto(ticker))    return { label: '24/7', color: 'var(--accent)' };
  if (isUSMarketOpen())    return { label: 'OPEN',   color: 'var(--accent)' };
  if (isUSExtendedHours()) return { label: 'EXT',    color: 'var(--yellow)' };
  return { label: 'CLOSED', color: 'var(--red)' };
}

function updateChartPriceBar(ticker, price, dailyChangePct) {
  const priceEl  = document.getElementById('chart-price');
  const changeEl = document.getElementById('chart-change');
  const badgeEl  = document.getElementById('data-badge');
  const nameEl   = document.getElementById('chart-name');

  // Always show name immediately
  if (nameEl && ticker) {
    const name = COMPANY_NAMES[ticker] || ticker;
    nameEl.textContent = name;
    nameEl.style.display = 'inline';
  }

  if (priceEl && price != null) {
    const decimals = price >= 100 ? 2 : price >= 1 ? 4 : 6;
    priceEl.textContent = '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: decimals });
    priceEl.style.color = 'var(--text)';
  }

  if (changeEl) {
    if (typeof dailyChangePct === 'number' && isFinite(dailyChangePct)) {
      const sign  = dailyChangePct >= 0 ? '+' : '';
      const color = dailyChangePct >= 0 ? 'var(--accent)' : 'var(--red)';
      changeEl.innerHTML = `<span style="color:${color};font-weight:700;">${sign}${dailyChangePct.toFixed(2)}%</span>`;
    }
  }

  if (badgeEl && ticker) {
    const ms = getMarketStatusLabel(ticker);
    badgeEl.textContent       = ms.label;
    badgeEl.style.color       = ms.color;
    badgeEl.style.borderColor = ms.color;
    badgeEl.style.background  = ms.color + '22';
  }
}

function updateBotConfidenceDisplay() {
  const statusEl = document.getElementById('bot-status');
  if (!statusEl) return;
  if (!state.bot_enabled) {
    statusEl.textContent = 'OFF';
    statusEl.className   = 'bot-status off';
    return;
  }
  const s = state.current_signal;
  if (s) {
    const pct   = getConfidencePct(s);
    const color = pct >= 75 ? 'var(--accent)' : pct >= 60 ? 'var(--yellow)' : 'var(--red)';
    statusEl.innerHTML = `<span style="color:${color};font-weight:800;">${pct}%</span>`;
    statusEl.className = 'bot-status on';
  } else {
    statusEl.textContent = 'ON —%';
    statusEl.className   = 'bot-status on';
  }
}

function setQtyMode(mode) {
  state.qty_mode = mode;
  document.getElementById('qty-pct-row').style.display    = mode === 'pct'    ? '' : 'none';
  document.getElementById('qty-usd-row').style.display    = mode === 'usd'    ? '' : 'none';
  document.getElementById('qty-shares-row').style.display = mode === 'shares' ? '' : 'none';
  updateExecInfo();
}

function getEffectiveQty(s) {
  if (!s) return 1;
  const mode = state.qty_mode;
  // Acciones fraccionarias permitidas para todo (cripto y acciones) → ej. 1.3 acciones
  const round = (v) => Math.round(v * 100) / 100;
  const minQ  = 0.01;

  if (mode === 'usd') {
    const usd     = parseFloat(document.getElementById('qty-usd-input')?.value) || state.capital;
    const limited = Math.min(usd, state.capital);
    return Math.max(minQ, round(limited / s.entry));
  } else if (mode === 'shares') {
    const raw    = parseFloat(document.getElementById('qty-shares-input')?.value) || 1;
    const shares = round(raw); // acepta decimales (fraccionarias)
    const cost   = shares * s.entry;
    if (cost > state.capital) return Math.max(minQ, round(state.capital / s.entry));
    return Math.max(minQ, shares);
  } else {
    // pct mode
    const pct = parseFloat(document.getElementById('qty-pct-input')?.value) || 10;
    const allocated = state.capital * (pct / 100);
    return Math.max(minQ, round(allocated / s.entry));
  }
}

// ══════════════════════════════════════════
// EXECUTE BUTTONS — fully reset, no single-attempt limit
// ══════════════════════════════════════════
function buyNow() {
  if (!state.current_signal) {
    log('❌ Analiza primero un ticker', 'info');
    return;
  }
  executeTrade('BUY', false);
}

function sellNow() {
  if (!state.current_signal) {
    log('❌ Analiza primero un ticker', 'info');
    return;
  }
  executeTrade('SELL', false);
}

function executeTrade(side, fromBot = false) {
  const s = state.current_signal;
  if (!s) {
    log('❌ Sin señal activa. Analiza primero.', 'info');
    return;
  }

  const lev  = state.leverage;
  let qty    = getEffectiveQty(s);
  let cost   = qty * s.entry;

  const minQty = 0.01; // acciones fraccionarias permitidas
  if (cost > state.capital) {
    qty  = Math.max(0.01, Math.round((state.capital / s.entry) * 100) / 100);
    cost = qty * s.entry;
    if (qty < minQty || cost > state.capital * 1.001) {
      log(`❌ Capital insuficiente ($${state.capital.toFixed(2)}) para abrir posición`, 'info');
      return;
    }
    log(`⚠️ Cantidad ajustada a ${qty} por capital disponible`, 'info');
  }

  const tfLabel = getTFLabel();

  const pos = {
    id:        Date.now(),
    ticker:    s.ticker,
    side,
    leverage:  lev,
    entry:     s.entry,
    current:   s.entry,
    qty,
    sl:        s.stop_loss,
    tp:        s.take_profit,
    value:     cost,
    pnl:       0,
    fromBot,
    timeframe: tfLabel,
    confidence: getConfidencePct(s),
    open_time: new Date().toISOString()
  };

  state.capital -= cost;
  state.positions.push(pos);
  state.trades_total++;

  // Registrar movimiento de apertura en el historial
  // LONG = acciones compradas · SHORT = acciones vendidas (en corto)
  addMovement({
    kind:    'OPEN',
    action:  side === 'BUY' ? 'compradas' : 'vendidas',
    ticker:  s.ticker,
    price:   s.entry,
    qty,
    side,
    fromBot,
    posId:   pos.id
  });

  const label = fromBot ? '🤖 BOT' : '👤 MANUAL';
  const qtyDisp = (typeof qty === 'number' && qty % 1 !== 0) ? qty.toFixed(2) : qty;
  const slSrc = s.sl_source ? ` [${s.sl_source}]` : '';
  const tpSrc = s.tp_source ? ` [${s.tp_source}]` : '';
  log(
    `${label} ${side === 'BUY' ? '▲ LONG' : '▼ SHORT'}: ${s.ticker} [${tfLabel}] ×${qtyDisp}${lev > 1 ? ` x${lev}` : ''} @ $${s.entry.toFixed(4)} | SL:$${s.stop_loss.toFixed(4)}${slSrc} | TP:$${s.take_profit.toFixed(4)}${tpSrc} | Conf:${getConfidencePct(s)}%`,
    side === 'BUY' ? 'buy' : 'sell'
  );

  // Always keep buttons enabled for next manual click
  enableExecuteButtons();
  renderPositions();
  updatePortfolio();
  simulatePriceUpdates();
  markUnsaved();
}

function closePosition(id) {
  const idx = state.positions.findIndex(p => p.id === id);
  if (idx < 0) return;
  const p   = state.positions[idx];
  const lev = p.leverage || 1;
  const pnl = p.side === 'BUY'
    ? (p.current - p.entry) * p.qty * lev
    : (p.entry  - p.current) * p.qty * lev;

  state.capital      += p.value + pnl;
  state.realized_pnl += pnl;
  state.day_pnl      += pnl;
  if (pnl > 0) state.trades_won++;

  state.closed_trades.push({ ...p, pnl, close_price: p.current });
  state.positions.splice(idx, 1);

  // Registrar movimiento de cierre con PyG realizado
  // Cerrar LONG = vender · Cerrar SHORT = comprar
  addMovement({
    kind:    'CLOSE',
    action:  p.side === 'BUY' ? 'vendidas' : 'compradas',
    ticker:  p.ticker,
    price:   p.current,
    qty:     p.qty,
    side:    p.side,
    fromBot: p.fromBot,
    pnl,
    posId:   p.id
  });

  const pct    = (pnl / p.value * 100).toFixed(2);
  const result = pnl >= 0 ? '✅ Ganancia' : '❌ Pérdida';
  const who    = p.fromBot ? ' [BOT]' : '';
  log(
    `${result}${who}: ${p.ticker} (${p.side === 'BUY' ? 'LONG' : 'SHORT'}) cerrado @ $${p.current.toFixed(4)} | PyG: ${fmt$(pnl)} (${pct}%)`,
    pnl >= 0 ? 'close' : 'sell'
  );

  renderPositions();
  updatePortfolio();
  markUnsaved();
}

// ══════════════════════════════════════════
// HISTORIAL DE MOVIMIENTOS
// ══════════════════════════════════════════
function addMovement(m) {
  if (!state.movements) state.movements = [];
  state.movements.unshift({
    id:   Date.now() + Math.random(),
    time: new Date().toISOString(),
    ...m
  });
  if (state.movements.length > 300) state.movements.length = 300;
  renderMovements();
  markUnsaved();
}

function deleteMovement(id) {
  if (!state.movements) return;
  state.movements = state.movements.filter(m => String(m.id) !== String(id));
  renderMovements();
  markUnsaved();
}

function clearMovements() {
  if (!state.movements || state.movements.length === 0) return;
  if (!confirm('¿Vaciar todo el historial de movimientos?')) return;
  state.movements = [];
  renderMovements();
  markUnsaved();
  log('🗑️ Historial de movimientos vaciado', 'info');
}

function renderMovements() {
  const body  = document.getElementById('movements-body');
  const countEl = document.getElementById('movements-count');
  if (!body) return;

  const movs = state.movements || [];
  if (countEl) countEl.textContent = `${movs.length} mov.`;

  if (movs.length === 0) {
    body.innerHTML = '<div style="text-align:center;color:var(--text3);padding:14px;font-size:0.7rem;">Sin movimientos todavía</div>';
    return;
  }

  body.innerHTML = movs.map(m => {
    const t      = new Date(m.time).toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'});
    const qtyStr = (typeof m.qty === 'number' && m.qty % 1 !== 0) ? m.qty.toFixed(2) : m.qty;
    const price  = '$' + Number(m.price).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4});
    const botTag = m.fromBot
      ? '<span style="color:#60a5fa;font-size:0.6rem;">(bot)</span>'
      : '';
    const actColor = m.action === 'compradas' ? 'var(--accent)' : 'var(--red)';
    // Línea principal: TICKER (bot) — $precio × N compradas/vendidas
    let line = `<span style="color:var(--text);font-weight:600;">${m.ticker}</span> ${botTag} `
             + `<span style="color:var(--text2);">— ${price} × ${qtyStr} `
             + `<span style="color:${actColor};font-weight:600;">${m.action}</span></span>`;
    // PyG solo en cierres
    let pnlStr = '';
    if (m.kind === 'CLOSE' && typeof m.pnl === 'number') {
      const pc = m.pnl >= 0 ? 'var(--accent)' : 'var(--red)';
      pnlStr = ` · <span style="color:${pc};font-weight:700;">PyG ${fmt$(m.pnl)}</span>`;
    }
    return `<div class="mov-row">
      <div class="mov-text"><span class="mov-time">${t}</span> ${line}${pnlStr}</div>
      <button class="mov-del" title="Quitar del historial" onclick="deleteMovement('${m.id}')">✕</button>
    </div>`;
  }).join('');
}

function simulatePriceUpdates() {
  if (state._priceInterval) clearInterval(state._priceInterval);
  if (state.positions.length === 0) return;
  state._priceInterval = setInterval(() => {
    if (state.positions.length === 0) { clearInterval(state._priceInterval); return; }
    const toClose = [];
    state.positions.forEach(p => {
      const vol   = p.current * 0.0018;
      const drift = (Math.random() - 0.47) * vol;
      p.current   = Math.max(p.current + drift, p.current * 0.96);
      p.current   = parseFloat(p.current.toFixed(4));

      // Track peak profit for trailing protection
      const lev = p.leverage || 1;
      const currentPnl = p.side === 'BUY'
        ? (p.current - p.entry) * p.qty * lev
        : (p.entry - p.current) * p.qty * lev;

      if (!p._peakPnl) p._peakPnl = 0;
      if (currentPnl > p._peakPnl) p._peakPnl = currentPnl;

      // Trailing protection: if we had significant gains and now dropped 40% from peak, close to protect profit
      const peakPnlPct = p.value > 0 ? (p._peakPnl / p.value) * 100 : 0;
      if (peakPnlPct >= 1.5) { // only activate if we reached +1.5% profit
        const dropFromPeak = p._peakPnl - currentPnl;
        const dropPct = p._peakPnl > 0 ? (dropFromPeak / p._peakPnl) * 100 : 0;
        if (dropPct >= 40 && currentPnl > 0) {
          log(`🛡️ Trailing: ${p.ticker} asegurando +${fmt$(currentPnl)} (cayó ${dropPct.toFixed(0)}% desde máximo)`, 'buy');
          toClose.push(p.id);
          return;
        }
      }

      if (p.side === 'BUY') {
        if (p.current <= p.sl) { log(`🛑 Stop Loss: ${p.ticker} @ $${p.current}`, 'sell'); toClose.push(p.id); return; }
        if (p.current >= p.tp) { log(`🎯 Take Profit: ${p.ticker} @ $${p.current}`, 'buy'); toClose.push(p.id); return; }
      } else {
        if (p.current >= p.sl) { log(`🛑 Stop Loss: ${p.ticker} @ $${p.current}`, 'sell'); toClose.push(p.id); return; }
        if (p.current <= p.tp) { log(`🎯 Take Profit: ${p.ticker} @ $${p.current}`, 'buy'); toClose.push(p.id); return; }
      }
    });
    toClose.forEach(id => closePosition(id));
    renderPositions();
    updatePortfolio();
  }, 1000);
}

// ══════════════════════════════════════════
// RENDER POSITIONS — shows all open trades
// ══════════════════════════════════════════
function renderPositions() {
  const tbody   = document.getElementById('positions-body');
  const countEl = document.getElementById('open-count');
  if (!tbody) return;

  const n = state.positions.length;
  if (countEl) countEl.textContent = `${n} posición${n !== 1 ? 'es' : ''}`;

  if (n === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--text3);padding:14px;font-size:0.7rem;">No hay posiciones abiertas</td></tr>';
    return;
  }

  tbody.innerHTML = state.positions.map(p => {
    const lev    = p.leverage || 1;
    const pnl    = p.side === 'BUY'
      ? (p.current - p.entry) * p.qty * lev
      : (p.entry  - p.current) * p.qty * lev;
    p.pnl        = pnl;
    const pnlPct = p.value > 0 ? (pnl / p.value) * 100 : 0;
    const cls    = pnl >= 0 ? 'td-pnl-pos' : 'td-pnl-neg';
    const color  = p.side === 'BUY' ? 'var(--accent)' : 'var(--red)';
    const label  = p.side === 'BUY' ? 'LONG' : 'SHORT';
    const tf     = p.timeframe || '—';
    const conf   = p.confidence !== undefined ? p.confidence + '%' : '—';
    const botTag = p.fromBot ? ' <span style="color:#60a5fa;font-size:0.62rem;font-weight:700;">(bot)</span>' : '';
    return `<tr>
      <td class="td-ticker">${p.ticker}${botTag}<br><span style="font-size:0.6rem;color:var(--text3);">${tf} · ${conf}</span></td>
      <td style="color:${color};font-weight:600">${label}</td>
      <td style="color:var(--yellow)">x${lev}</td>
      <td>$${p.entry.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}</td>
      <td>$${p.current.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}</td>
      <td>${(typeof p.qty === 'number' && p.qty % 1 !== 0) ? p.qty.toFixed(2) : p.qty}</td>
      <td style="color:var(--red)">$${p.sl.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}</td>
      <td style="color:var(--accent)">$${p.tp.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}</td>
      <td class="${cls}">${fmt$(pnl)}</td>
      <td class="${cls}">${fmtPct(pnlPct)}</td>
      <td><button class="close-btn" onclick="closePosition(${p.id})">Cerrar</button></td>
    </tr>`;
  }).join('');
}

function updatePortfolio() {
  const unrealized = state.positions.reduce((sum, p) => {
    const lev = p.leverage || 1;
    const pnl = p.side === 'BUY'
      ? (p.current - p.entry) * p.qty * lev
      : (p.entry  - p.current) * p.qty * lev;
    return sum + pnl;
  }, 0);

  // Valor total de cuenta = capital disponible + valor de mercado de posiciones abiertas
  // (coste invertido + PyG no realizado)
  const positionsValue = state.positions.reduce((sum, p) => {
    const lev = p.leverage || 1;
    const pnl = p.side === 'BUY'
      ? (p.current - p.entry) * p.qty * lev
      : (p.entry  - p.current) * p.qty * lev;
    return sum + p.value + pnl;
  }, 0);
  const accountValue = state.capital + positionsValue;

  const totalPnl    = state.realized_pnl + unrealized;
  const totalPct    = (totalPnl  / state.initial_capital) * 100;
  const dayPct      = (state.day_pnl / state.initial_capital) * 100;
  const realPct     = (state.realized_pnl / state.initial_capital) * 100;
  const unrPct      = (unrealized / state.initial_capital) * 100;
  const closedCount = state.closed_trades.length;
  const winRate     = closedCount > 0 ? ((state.trades_won / closedCount) * 100).toFixed(0) + '%' : '—';

  const $   = id => document.getElementById(id);
  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };

  set('hdr-capital', fmt$(state.capital));

  const accEl = $('stat-account-value');
  if (accEl) {
    accEl.textContent = fmt$(accountValue);
    accEl.style.color = accountValue >= state.initial_capital ? 'var(--accent)' : 'var(--red)';
  }
  const accPctEl = $('stat-account-value-pct');
  if (accPctEl) accPctEl.textContent = fmtPct(((accountValue - state.initial_capital) / state.initial_capital) * 100);
  set('hdr-account-value', fmt$(accountValue));

  const pnlEl = $('hdr-pnl');
  if (pnlEl) { pnlEl.textContent = fmt$(totalPnl); pnlEl.className = 'portfolio-value ' + (totalPnl >= 0 ? 'green' : 'red'); }
  set('hdr-pnl-pct', fmtPct(totalPct));
  const pnlPctEl = $('hdr-pnl-pct'); if (pnlPctEl) pnlPctEl.style.color = totalPnl >= 0 ? 'var(--accent)' : 'var(--red)';

  const dayEl = $('hdr-pnl-day');
  if (dayEl) { dayEl.textContent = fmt$(state.day_pnl); dayEl.className = 'portfolio-value ' + (state.day_pnl >= 0 ? 'green' : 'red'); }
  set('hdr-pnl-day-pct', fmtPct(dayPct));
  const dayPctEl = $('hdr-pnl-day-pct'); if (dayPctEl) dayPctEl.style.color = state.day_pnl >= 0 ? 'var(--accent)' : 'var(--red)';

  set('hdr-trades', state.trades_total);
  set('hdr-winrate', winRate);
  set('stat-capital', fmt$(state.capital));

  const realEl = $('stat-realized');
  if (realEl) { realEl.textContent = fmt$(state.realized_pnl); realEl.style.color = state.realized_pnl >= 0 ? 'var(--accent)' : 'var(--red)'; }
  set('stat-realized-pct', fmtPct(realPct));

  const unrEl = $('stat-unrealized');
  if (unrEl) { unrEl.textContent = fmt$(unrealized); unrEl.style.color = unrealized >= 0 ? 'var(--accent)' : 'var(--red)'; }
  set('stat-unrealized-pct', fmtPct(unrPct));

  set('stat-closed', closedCount);
}

function setTicker(t) {
  const inp = document.getElementById('ticker-input');
  if (inp) inp.value = t;
}

function setLeverage(x, el) {
  state.leverage = x;
  document.querySelectorAll('.lev-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  log(`Apalancamiento: x${x}`, 'info');
  if (state.current_signal) updateExecInfo();
}

function updateExecInfo() {
  const s    = state.current_signal;
  const info = document.getElementById('exec-info');
  if (!info) return;

  if (!s) {
    info.innerHTML = '<span style="color:var(--text3)">Analiza un ticker para operar</span>';
    return;
  }

  const qty     = getEffectiveQty(s);
  const value   = qty * s.entry;
  const lev     = state.leverage;
  const confPct = getConfidencePct(s);
  const tfLabel = getTFLabel();

  const qtyStr = (typeof qty === 'number' && qty % 1 !== 0) ? qty.toFixed(2) : qty;
  info.innerHTML = `${s.signal} @ $${s.price.toFixed(4)} | TF: <b>${tfLabel}</b> | Confianza: <b style="color:${confPct>=75?'var(--accent)':confPct>=55?'var(--yellow)':'var(--red)'}">${confPct}%</b> | ${qtyStr} acc${lev > 1 ? ` ×${lev}` : ''} = $${value.toFixed(2)}`;
}

// ══════════════════════════════════════════
// BOT — uses active chart timeframe
// ══════════════════════════════════════════
function toggleBot() {
  state.bot_enabled = document.getElementById('bot-toggle').checked;
  const barEl = document.getElementById('auto-bar');
  const dotEl = document.getElementById('live-dot');

  updateBotConfidenceDisplay();

  if (state.bot_enabled) {
    if (barEl) barEl.classList.add('visible');
    if (dotEl) { dotEl.style.animation = 'pulse 1s infinite'; dotEl.style.boxShadow = '0 0 12px var(--accent)'; }
    log(`🤖 Bot ACTIVADO [${getTFLabel()}] — Riesgo: ${document.getElementById('risk-pct')?.value || 2}%`, 'bot');
    startBotLoop();
  } else {
    if (barEl) barEl.classList.remove('visible');
    if (dotEl) { dotEl.style.animation = ''; dotEl.style.boxShadow = '0 0 8px var(--accent)'; }
    stopBotLoop();
    log('🤖 Bot DESACTIVADO', 'bot');
  }
}

function startBotLoop() {
  stopBotLoop();
  state.bot_timer = BOT_INTERVAL_SEC;
  updateBotBar();
  const ticker = document.getElementById('ticker-input').value.trim();
  if (ticker) analyzeWithAI(true);
  state.bot_countdown = setInterval(() => {
    state.bot_timer--;
    updateBotBar();
    if (state.bot_timer <= 0) {
      state.bot_timer = BOT_INTERVAL_SEC;
      const t = document.getElementById('ticker-input').value.trim();
      if (t && state.bot_enabled) analyzeWithAI(true);
    }
  }, 1000);
}

function stopBotLoop() {
  if (state.bot_countdown) { clearInterval(state.bot_countdown); state.bot_countdown = null; }
}

function updateBotBar() {
  const ticker  = document.getElementById('ticker-input').value.trim() || '...';
  const pct     = ((BOT_INTERVAL_SEC - state.bot_timer) / BOT_INTERVAL_SEC) * 100;
  const fillEl  = document.getElementById('auto-fill');
  const countEl = document.getElementById('auto-countdown');
  const msgEl   = document.getElementById('auto-bar-msg');
  const s       = state.current_signal;
  const tfLabel = getTFLabel();

  if (fillEl)  fillEl.style.width  = pct + '%';
  if (countEl) countEl.textContent = `${state.bot_timer}s`;

  if (msgEl) {
    if (s) {
      const confPct = getConfidencePct(s);
      const willAct = s.signal !== 'WAIT' && confPct >= BOT_MIN_CONFIDENCE;
      const color   = willAct ? 'var(--accent)' : 'var(--yellow)';
      msgEl.innerHTML = `${ticker} [${tfLabel}] | Confianza: <span style="color:${color};font-weight:700;">${confPct}%</span> ${willAct ? '⚡' : ''}`;
    } else {
      msgEl.textContent = `Analizando ${ticker} [${tfLabel}]...`;
    }
  }
}

function botDecide(signal) {
  if (!state.bot_enabled) return;

  const confPct = getConfidencePct(signal);
  const ticker  = signal.ticker;

  if (signal.signal === 'WAIT' || confPct < BOT_MIN_CONFIDENCE) return;

  // Allow multiple positions per ticker — but limit to 3 simultaneous bot positions total
  const botPositions = state.positions.filter(p => p.fromBot);
  if (botPositions.length >= 3) {
    log(`🤖 Límite de 3 posiciones bot activas alcanzado`, 'bot');
    return;
  }

  // Don't open same side + same ticker + same timeframe duplicate within 30s
  const recentDupe = state.positions.some(p =>
    p.fromBot && p.ticker === ticker && p.side === signal.signal &&
    p.timeframe === getTFLabel() && (Date.now() - p.id) < 30000
  );
  if (recentDupe) return;

  const side = signal.signal === 'BUY' ? 'BUY' : 'SELL';
  log(`🤖 ${side === 'BUY' ? '▲' : '▼'} ${ticker} [${getTFLabel()}] (${confPct}%)`, 'bot');
  setTimeout(() => executeTrade(side, true), 500);
}
