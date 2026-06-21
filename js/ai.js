// ══════════════════════════════════════════
// TECHNICAL ANALYSIS — timeframe-aware v7
// ══════════════════════════════════════════

// ── MACD history for crossover detection ──
let _macdHistory = { fast: [], slow: [], signal: [] };

// ── Price source proxies ──
const YF_PROXIES = [
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://thingproxy.freeboard.io/fetch/${u}`,
  u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`
];

// Build both v8 and v7 Yahoo URLs to try
function getYFUrls(ticker, interval, range) {
  const t = encodeURIComponent(ticker);
  return [
    `https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=${interval}&range=${range}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${t}?interval=${interval}&range=${range}`,
    `https://query1.finance.yahoo.com/v7/finance/chart/${t}?interval=${interval}&range=${range}`,
  ];
}

// ── Binance symbol map (crypto 24/7 real OHLCV) ──
const BINANCE_SYMBOL_MAP = {
  'BTC-USD':'BTCUSDT',    'BTC':'BTCUSDT',       'BTCUSDT':'BTCUSDT',
  'ETH-USD':'ETHUSDT',    'ETH':'ETHUSDT',       'ETHUSDT':'ETHUSDT',
  'SOL-USD':'SOLUSDT',    'SOL':'SOLUSDT',       'SOLUSDT':'SOLUSDT',
  'ZEC-USD':'ZECUSDT',    'ZEC':'ZECUSDT',       'ZECUSDT':'ZECUSDT',
  'DOGE-USD':'DOGEUSDT',  'DOGE':'DOGEUSDT',
  'XRP-USD':'XRPUSDT',    'XRP':'XRPUSDT',
  'ADA-USD':'ADAUSDT',    'ADA':'ADAUSDT',
  'BNB-USD':'BNBUSDT',    'BNB':'BNBUSDT',
  'LTC-USD':'LTCUSDT',    'LTC':'LTCUSDT',
  'DOT-USD':'DOTUSDT',    'DOT':'DOTUSDT',
  'LINK-USD':'LINKUSDT',  'LINK':'LINKUSDT',
  'AVAX-USD':'AVAXUSDT',  'AVAX':'AVAXUSDT',
  'MATIC-USD':'MATICUSDT','MATIC':'MATICUSDT',
};

function getBinanceSymbol(ticker) {
  return BINANCE_SYMBOL_MAP[ticker] || BINANCE_SYMBOL_MAP[(ticker||'').toUpperCase()] || null;
}

// Binance interval from chart TF
function getBinanceInterval(tf) {
  const map = { '1':'1m','5':'5m','15':'15m','30':'30m','60':'1h','240':'4h','D':'1d','W':'1w' };
  return map[tf] || '1d';
}

// How many candles to fetch per TF for indicators
function getBinanceCandleCount(tf) {
  if (tf === '1')  return 120;  // 2h of 1m
  if (tf === '5')  return 120;  // 10h
  if (tf === '15') return 100;
  if (tf === '30') return 100;
  if (tf === '60') return 100;
  if (tf === '240')return 90;
  return 90; // daily/weekly
}

// ── Fetch from Binance (crypto OHLCV, real 24/7) ──
async function fetchBinance(ticker) {
  const sym = getBinanceSymbol(ticker);
  if (!sym) return null;
  const tf = state.chart_tf;
  const interval = getBinanceInterval(tf);
  const limit = getBinanceCandleCount(tf);

  const url = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length < 3) return null;

    const candles = raw.map(k => ({
      open:  parseFloat(k[1]),
      high:  parseFloat(k[2]),
      low:   parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));

    const closes = candles.map(c => c.close);
    const price  = closes[closes.length - 1];

    // Daily % change: compare last close to open of first candle in current day
    // For 1m/5m/15m TF, fetch also daily to get yesterday close
    let dailyChangePct = null;
    try {
      const dailyRes = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=1d&limit=2`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (dailyRes.ok) {
        const dk = await dailyRes.json();
        if (dk.length >= 1) {
          const todayOpen = parseFloat(dk[dk.length - 1][1]);
          if (todayOpen > 0) dailyChangePct = ((price - todayOpen) / todayOpen) * 100;
        }
      }
    } catch(e) {}

    state._priceHistory = candles;
    return { price, history: closes, candles, dailyChangePct, source: 'Binance' };
  } catch(e) { return null; }
}

// ── Fetch from Yahoo Finance (stocks 24/5 + crypto fallback) ──
async function fetchYahoo(ticker, interval, range) {
  const baseUrls = getYFUrls(ticker, interval, range);

  // Try direct first, then all proxy+url combos
  const attempts = [];
  for (const u of baseUrls) attempts.push(u);
  for (const buildProxy of YF_PROXIES) {
    for (const u of baseUrls) attempts.push(buildProxy(u));
  }

  for (const attemptUrl of attempts) {
    try {
      const res = await fetch(attemptUrl, { signal: AbortSignal.timeout(9000) });
      if (!res.ok) continue;
      let payload;
      try { payload = await res.json(); } catch(e) { continue; }
      if (payload && typeof payload.contents === 'string') {
        try { payload = JSON.parse(payload.contents); } catch(e) { continue; }
      }
      const result = payload?.chart?.result?.[0];
      if (!result) continue;

      const meta   = result.meta || {};
      const quote  = result.indicators?.quote?.[0] || {};
      const ts     = result.timestamp || [];
      const closes = (quote.close  || []).filter(v => v != null && isFinite(v));
      const opens  = quote.open  || [];
      const highs  = quote.high  || [];
      const lows   = quote.low   || [];
      const vols   = quote.volume || [];

      if (!closes.length) continue;

      const price = meta.regularMarketPrice || closes[closes.length - 1];
      const prevClose = meta.chartPreviousClose || meta.previousClose || closes[0];
      // Prefer the pre-calculated % from Yahoo meta (most accurate for stocks)
      let dailyChangePct;
      if (typeof meta.regularMarketChangePercent === 'number' && isFinite(meta.regularMarketChangePercent)) {
        dailyChangePct = meta.regularMarketChangePercent;
      } else if (prevClose && prevClose > 0) {
        dailyChangePct = ((price - prevClose) / prevClose) * 100;
      } else {
        dailyChangePct = null;
      }

      const candles = ts.map((_, i) => ({
        open:   opens[i]  ?? closes[i] ?? price,
        high:   highs[i]  ?? closes[i] ?? price,
        low:    lows[i]   ?? closes[i] ?? price,
        close:  quote.close[i] ?? price,
        volume: vols[i] || 0
      })).filter(d => d.close != null && isFinite(d.close));

      state._priceHistory = candles;
      return { price, history: closes, candles, dailyChangePct, source: 'Yahoo Finance', meta };
    } catch(e) { continue; }
  }
  return null;
}

// ── CoinGecko fallback for crypto ──
async function fetchCoinGecko(ticker) {
  const cgId = CRYPTO_ID_MAP[ticker] || CRYPTO_ID_MAP[(ticker||'').toUpperCase()];
  if (!cgId) return null;
  try {
    const cg  = getCGInterval();
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${cgId}/market_chart?vs_currency=usd&days=${cg.days}&interval=${cg.interval}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data   = await res.json();
    const prices = (data.prices || []);
    const closes = prices.map(p => p[1]).filter(v => typeof v === 'number' && isFinite(v));
    if (closes.length < 3) return null;
    const price = closes[closes.length - 1];

    let dailyChangePct = null;
    try {
      const detailRes = await fetch(
        `https://api.coingecko.com/api/v3/coins/${cgId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (detailRes.ok) {
        const detail = await detailRes.json();
        const pct = detail?.market_data?.price_change_percentage_24h;
        if (typeof pct === 'number') dailyChangePct = pct;
      }
    } catch(e) {}

    const candles = closes.map(p => ({ open:p, high:p, low:p, close:p, volume:0 }));
    state._priceHistory = candles;
    return { price, history: closes, candles, dailyChangePct, source: 'CoinGecko' };
  } catch(e) { return null; }
}

// ── Main price data fetcher ──
async function fetchPriceData(ticker) {
  const tf = state.chart_tf;
  const isCr = isCrypto(ticker);

  if (isCr) {
    // 1. Try Binance first (best OHLCV for all TFs including 1m)
    const binance = await fetchBinance(ticker);
    if (binance) return binance;

    // 2. CoinGecko fallback
    const cg = await fetchCoinGecko(ticker);
    if (cg) return cg;

    // 3. Yahoo fallback for crypto
    const yfCrypto = await fetchYahoo(ticker, '1d', '60d');
    if (yfCrypto) return yfCrypto;
  }

  // ── Stocks / ETFs ──
  const yfp = getYFParams();

  if (['1','5','15','30'].includes(tf)) {
    // Fetch intraday + daily for indicators
    const [intradayResult, dailyResult] = await Promise.all([
      fetchYahoo(ticker, yfp.interval, yfp.range),
      fetchYahoo(ticker, '1d', '60d')
    ]);
    if (intradayResult && dailyResult) {
      // Use intraday candles for chart, daily history for indicators
      const intradayCandles = intradayResult.candles || [];
      if (intradayCandles.length > 0) state._priceHistory = intradayCandles;
      return {
        price: intradayResult.price,
        history: dailyResult.history,
        candles: intradayCandles,
        dailyChangePct: intradayResult.dailyChangePct,
        source: intradayResult.source
      };
    }
    if (dailyResult) return dailyResult;
    if (intradayResult) return intradayResult;
  }

  const mainResult = await fetchYahoo(ticker, yfp.interval, yfp.range);
  if (mainResult) return mainResult;

  const fallback = await fetchYahoo(ticker, '1d', '60d');
  if (fallback) return fallback;

  return { price: null, history: [], candles: [], dailyChangePct: null, source: null };
}

// ── Price update loop — uses Binance ticker for crypto (fastest) ──
async function fetchLivePrice(ticker) {
  if (isCrypto(ticker)) {
    const sym = getBinanceSymbol(ticker);
    if (sym) {
      try {
        const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`,
          { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const d = await res.json();
          const price = parseFloat(d.lastPrice);
          // Use today's open price for % change (NOT 24h rolling %)
          const openPrice = parseFloat(d.openPrice);
          const dailyChangePct = openPrice > 0 ? ((price - openPrice) / openPrice) * 100 : null;
          return { price, dailyChangePct };
        }
      } catch(e) {}
    }
    // CoinGecko fallback
    const cgId = CRYPTO_ID_MAP[ticker] || CRYPTO_ID_MAP[(ticker||'').toUpperCase()];
    if (cgId) {
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd&include_24hr_change=true`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (res.ok) {
          const d = await res.json();
          const price = d[cgId]?.usd;
          const dailyChangePct = d[cgId]?.usd_24h_change ?? null;
          if (price) return { price, dailyChangePct };
        }
      } catch(e) {}
    }
  }

  // Stocks: Yahoo quick fetch
  const quickResult = await fetchYahoo(ticker, '1m', '1d');
  if (quickResult?.price) {
    // Also try to get the most accurate daily % from a daily fetch
    let changePct = quickResult.dailyChangePct;
    return { price: quickResult.price, dailyChangePct: changePct };
  }

  return null;
}

function startPriceUpdateLoop(ticker) {
  if (state._priceUpdateInterval) clearInterval(state._priceUpdateInterval);
  const interval = isCrypto(ticker) ? 10000 : 15000; // crypto 10s, stocks 15s
  state._priceUpdateInterval = setInterval(async () => {
    try {
      const live = await fetchLivePrice(ticker);
      if (live?.price) {
        updateChartPriceBar(ticker, live.price, live.dailyChangePct);
        // Update open positions with live price
        if (state.positions.some(p => p.ticker === ticker)) {
          state.positions.forEach(p => { if (p.ticker === ticker) p.current = live.price; });
          renderPositions();
          updatePortfolio();
        }
      }
    } catch(e) {}
  }, interval);
}

// ══════════════════════════════════════════
// INDICATORS
// ══════════════════════════════════════════
function computeIndicators(history) {
  if (!Array.isArray(history) || history.length < 3) return null;
  const closes = history.map(v => typeof v === 'object' ? v.close : v).filter(v => v != null && isFinite(v));
  const n = closes.length;
  if (n < 3) return null;

  const sma = (period) => {
    const p = Math.min(period, n);
    if (p < 1) return null;
    return closes.slice(n - p).reduce((a,b) => a+b, 0) / p;
  };

  const ema = (period) => {
    const p = Math.min(period, n);
    if (p < 2) return closes[n-1];
    const k = 2 / (p + 1);
    let e = closes[n - p];
    for (let i = n - p + 1; i < n; i++) e = closes[i] * k + e * (1 - k);
    return e;
  };

  // Full EMA series for MACD crossover detection
  const emaFull = (period) => {
    const p = Math.min(period, n);
    const k = 2 / (p + 1);
    const result = [];
    let e = closes[0];
    for (let i = 0; i < n; i++) {
      if (i < p) { e = closes.slice(0, i+1).reduce((a,b) => a+b,0) / (i+1); }
      else { e = closes[i] * k + e * (1 - k); }
      result.push(e);
    }
    return result;
  };

  // RSI
  const rsiPeriod = Math.min(14, n - 1);
  let gains = 0, losses = 0;
  for (let i = Math.max(1, n - rsiPeriod); i < n; i++) {
    const diff = closes[i] - closes[i-1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / Math.max(1, rsiPeriod);
  const avgLoss = losses / Math.max(1, rsiPeriod);
  const rsi = avgLoss === 0 ? 100 : Math.round(100 - (100 / (1 + avgGain / avgLoss)));

  // Support/Resistance — pivot-based
  const recentSlice = closes.slice(Math.max(0, n - 20));
  const high20 = Math.max(...recentSlice);
  const low20  = Math.min(...recentSlice);

  // Find pivot highs/lows from candle data for real S/R levels
  // We'll pass the full candle history and find swing pivots
  const allCloses = closes;
  const pivotWindow = 3;
  const pivotHighs = [], pivotLows = [];
  for (let i = pivotWindow; i < n - pivotWindow; i++) {
    const slice = allCloses.slice(i - pivotWindow, i + pivotWindow + 1);
    const val = allCloses[i];
    if (val === Math.max(...slice)) pivotHighs.push(val);
    if (val === Math.min(...slice))  pivotLows.push(val);
  }
  // Cluster nearby pivots (within 0.5%) into levels
  function clusterLevels(arr, pct = 0.005) {
    const sorted = [...arr].sort((a,b) => a-b);
    const clusters = [];
    sorted.forEach(v => {
      const last = clusters[clusters.length - 1];
      if (!last || Math.abs(v - last.avg) / last.avg > pct) clusters.push({ avg: v, count: 1 });
      else { last.avg = (last.avg * last.count + v) / (last.count + 1); last.count++; }
    });
    return clusters.sort((a,b) => b.count - a.count); // strongest first
  }
  const resistanceLevels = clusterLevels(pivotHighs).map(c => c.avg).filter(v => v > (closes[n-1] || 0));
  const supportLevels    = clusterLevels(pivotLows).map(c => c.avg).filter(v => v < (closes[n-1] || 0));

  // MACD line, signal line, histogram — full series for crossover
  const ema12Series = emaFull(12);
  const ema26Series = emaFull(26);
  const macdSeries  = ema12Series.map((v, i) => v - ema26Series[i]);

  // Signal line = EMA9 of MACD
  const sigPeriod = Math.min(9, macdSeries.length);
  const sigK = 2 / (sigPeriod + 1);
  let sigVal = macdSeries[0];
  const signalSeries = macdSeries.map((v, i) => {
    if (i < sigPeriod) { sigVal = macdSeries.slice(0, i+1).reduce((a,b)=>a+b,0)/(i+1); }
    else { sigVal = v * sigK + sigVal * (1 - sigK); }
    return sigVal;
  });

  const macdLine   = macdSeries[n-1];
  const signalLine = signalSeries[n-1];
  const macdHist   = macdLine - signalLine;
  const prevMacdHist = n >= 2 ? (macdSeries[n-2] - signalSeries[n-2]) : macdHist;

  // Detect crossover (current bar vs previous)
  const macdCrossUp   = prevMacdHist < 0 && macdHist >= 0;
  const macdCrossDown = prevMacdHist > 0 && macdHist <= 0;

  // Bollinger
  const sma20val = sma(20) || closes[n-1];
  const slice20  = closes.slice(Math.max(0, n-20));
  const variance = slice20.reduce((s, v) => s + (v - sma20val)**2, 0) / slice20.length;
  const stddev   = Math.sqrt(variance);
  const bbUpper  = sma20val + 2 * stddev;
  const bbLower  = sma20val - 2 * stddev;

  return {
    sma20: sma(20), sma50: sma(50), rsi,
    high20, low20,
    resistanceLevels, supportLevels,
    ema12: ema12Series[n-1], ema26: ema26Series[n-1],
    macdLine, signalLine, macdHist, prevMacdHist,
    macdCrossUp, macdCrossDown,
    bbUpper, bbLower, bbMid: sma20val
  };
}

// ══════════════════════════════════════════
// SIGNAL GENERATION — MACD-primary + S/R levels + fractional
// ══════════════════════════════════════════
function generateChartSignal(ticker, price, indicators, capital, riskPct, rrMin) {
  if (!price || !indicators) {
    return {
      ticker, price: price || 100, signal: 'WAIT', trend: 'NEUTRAL',
      confidence: 'BAJA', confidence_pct: 30, macd_conf_pct: 0,
      entry: price || 100, stop_loss: (price || 100) * 0.97, take_profit: (price || 100) * 1.03,
      position_size: 1, position_value: price || 100, risk_amount: (price || 100) * 0.03,
      potential_profit: (price || 100) * 0.03, risk_reward: 1, rsi: 50,
      macd_signal: 'NEUTRAL', volume_signal: 'NORMAL', ma_signal: 'NEUTRAL', bb_signal: 'MIDDLE',
      support: (price || 100) * 0.95, resistance: (price || 100) * 1.05,
      sl_source: 'fallback', tp_source: 'fallback',
      analysis: 'Datos insuficientes.', bot_advice: [], timeframe: getTFLabel()
    };
  }

  const sma20   = indicators.sma20  || price;
  const sma50   = indicators.sma50  || price;
  const rsi     = indicators.rsi    || 50;
  const high20  = indicators.high20 || price * 1.05;
  const low20   = indicators.low20  || price * 0.95;
  const macdLine     = indicators.macdLine   ?? 0;
  const signalLine   = indicators.signalLine ?? 0;
  const macdHist     = indicators.macdHist   ?? 0;
  const prevMacdHist = indicators.prevMacdHist ?? macdHist;
  const macdCrossUp  = indicators.macdCrossUp;
  const macdCrossDown= indicators.macdCrossDown;
  const bbUpper   = indicators.bbUpper ?? price * 1.02;
  const bbLower   = indicators.bbLower ?? price * 0.98;
  const resistanceLevels = indicators.resistanceLevels || [];
  const supportLevels    = indicators.supportLevels    || [];
  const tfLabel   = getTFLabel();
  const range     = high20 - low20 || price * 0.1;

  // ── MACD confidence (primary 0-70pts) ──
  let macdConf = 0;
  let macdDirection = 0;

  // Momentum acceleration: is histogram growing fast?
  const histDelta = macdHist - prevMacdHist;
  const histAccel = Math.abs(histDelta) / (Math.abs(prevMacdHist) || 0.0001); // relative acceleration

  if (macdCrossUp) {
    macdConf = 65; macdDirection = 1;
  } else if (macdCrossDown) {
    macdConf = 65; macdDirection = -1;
  } else if (macdLine > signalLine) {
    macdDirection = 1;
    if (macdHist > prevMacdHist) {
      // Momentum growing — scale by acceleration
      macdConf = histAccel > 0.3 ? 55 : 45; // fast acceleration = higher conf
    } else {
      macdConf = 22; // fading momentum
    }
  } else if (macdLine < signalLine) {
    macdDirection = -1;
    if (macdHist < prevMacdHist) {
      macdConf = histAccel > 0.3 ? 55 : 45;
    } else {
      macdConf = 22;
    }
  }

  const macdOnlyConf = macdConf; // store before adding confirmations

  // ── Confirmation indicators (+0 to +35) ──
  let confirmConf = 0;

  // RSI
  if (macdDirection > 0) {
    if (rsi < 30)      confirmConf += 20;
    else if (rsi < 45) confirmConf += 12;
    else if (rsi < 60) confirmConf += 5;
    else if (rsi > 75) confirmConf -= 8;
  } else if (macdDirection < 0) {
    if (rsi > 70)      confirmConf += 20;
    else if (rsi > 55) confirmConf += 12;
    else if (rsi > 40) confirmConf += 5;
    else if (rsi < 25) confirmConf -= 8;
  }

  // MA alignment
  if (macdDirection > 0 && price > sma20 && sma20 > sma50)      confirmConf += 10;
  else if (macdDirection > 0 && price > sma20)                    confirmConf += 5;
  else if (macdDirection < 0 && price < sma20 && sma20 < sma50)  confirmConf += 10;
  else if (macdDirection < 0 && price < sma20)                    confirmConf += 5;

  // Bollinger
  const bbPos = bbUpper > bbLower ? (price - bbLower) / (bbUpper - bbLower) : 0.5;
  let bbSignal = 'MIDDLE';
  if (bbPos < 0.2) bbSignal = 'LOWER';
  else if (bbPos > 0.8) bbSignal = 'UPPER';
  if (macdDirection > 0 && bbSignal === 'LOWER')   confirmConf += 5;
  else if (macdDirection < 0 && bbSignal === 'UPPER') confirmConf += 5;

  const confidencePct = Math.min(100, Math.max(0, macdConf + confirmConf));

  // ── Signal: lower threshold when MACD momentum is strong ──
  const signalThreshold = macdConf >= 55 ? 25 : 35; // fast momentum = easier trigger
  let signal = 'WAIT';
  if (macdDirection > 0 && confidencePct >= signalThreshold) signal = 'BUY';
  else if (macdDirection < 0 && confidencePct >= signalThreshold) signal = 'SELL';

  // ── TP/SL using real S/R pivot levels ──
  let entry = price, stopLoss, takeProfit;
  let slSource = 'range', tpSource = 'range';

  if (signal === 'BUY') {
    // SL: nearest support below price, fallback to BB lower or range
    const nearestSupport = supportLevels.find(v => v < price * 0.999);
    if (nearestSupport && nearestSupport > price * 0.92) {
      stopLoss = nearestSupport * 0.998; // just below pivot support
      slSource = 'soporte pivot';
    } else if (bbLower < price * 0.998) {
      stopLoss = bbLower * 0.999;
      slSource = 'BB inferior';
    } else {
      stopLoss = Math.max(low20 * 0.98, price * 0.94);
      slSource = 'mínimo 20p';
    }
    // TP: nearest resistance above price
    const nearestResistance = resistanceLevels.find(v => v > price * 1.002);
    if (nearestResistance && nearestResistance < price * 1.15) {
      takeProfit = nearestResistance * 0.999;
      tpSource = 'resistencia pivot';
    } else if (bbUpper > price * 1.001) {
      takeProfit = bbUpper * 0.999;
      tpSource = 'BB superior';
    } else {
      takeProfit = entry + (entry - stopLoss) * Math.max(rrMin, 1.5);
      tpSource = 'ratio R:R';
    }
    // Ensure minimum R:R of 1.2 — if not, push TP further
    const rr = (takeProfit - entry) / (entry - stopLoss);
    if (rr < 1.2) takeProfit = entry + (entry - stopLoss) * 1.5;

  } else if (signal === 'SELL') {
    // SL: nearest resistance above price
    const nearestResistance = resistanceLevels.find(v => v > price * 1.001);
    if (nearestResistance && nearestResistance < price * 1.08) {
      stopLoss = nearestResistance * 1.002;
      slSource = 'resistencia pivot';
    } else if (bbUpper > price * 1.001) {
      stopLoss = bbUpper * 1.001;
      slSource = 'BB superior';
    } else {
      stopLoss = Math.min(high20 * 1.02, price * 1.06);
      slSource = 'máximo 20p';
    }
    // TP: nearest support below price
    const nearestSupport = supportLevels.find(v => v < price * 0.999);
    if (nearestSupport && nearestSupport > price * 0.85) {
      takeProfit = nearestSupport * 1.001;
      tpSource = 'soporte pivot';
    } else if (bbLower < price * 0.999) {
      takeProfit = bbLower * 1.001;
      tpSource = 'BB inferior';
    } else {
      takeProfit = entry - (stopLoss - entry) * Math.max(rrMin, 1.5);
      tpSource = 'ratio R:R';
    }
    const rr = (entry - takeProfit) / (stopLoss - entry);
    if (rr < 1.2) takeProfit = entry - (stopLoss - entry) * 1.5;

  } else {
    stopLoss   = price - range * 0.15;
    takeProfit = price + range * 0.15;
  }

  // ── Fractional position sizing ──
  const perShareRisk = Math.abs(entry - stopLoss) || entry * 0.03;
  const riskAmount   = capital * (riskPct / 100);
  // Allow fractional (2 decimal places for crypto, whole for stocks)
  const isCryptoTicker = typeof isCrypto === 'function' ? isCrypto(ticker) : ticker.includes('-');
  let qty;
  if (isCryptoTicker) {
    qty = Math.round((riskAmount / perShareRisk) * 100) / 100; // 2 decimals
    qty = Math.max(0.01, Math.min(qty, Math.floor((capital / entry) * 100) / 100));
  } else {
    qty = Math.floor(riskAmount / perShareRisk);
    qty = Math.max(1, Math.min(qty, Math.floor(capital / entry)));
  }

  const positionValue   = qty * entry;
  const actualRisk      = perShareRisk * qty;
  const potentialProfit = Math.abs(takeProfit - entry) * qty;
  const riskReward      = actualRisk > 0 ? potentialProfit / actualRisk : rrMin;

  let confidence = 'BAJA';
  if (confidencePct >= 75) confidence = 'ALTA';
  else if (confidencePct >= 55) confidence = 'MEDIA';

  const maSignal   = price > sma20 ? 'ABOVE' : price < sma20 ? 'BELOW' : 'NEUTRAL';
  const macdSignal = macdLine > signalLine ? 'BULLISH' : macdLine < signalLine ? 'BEARISH' : 'NEUTRAL';
  const trendScore = (price > sma20 ? 1 : -1) + (rsi < 50 ? 1 : -1) + (macdDirection > 0 ? 1 : -1);
  const trend      = trendScore >= 2 ? 'BULLISH' : trendScore <= -2 ? 'BEARISH' : 'NEUTRAL';

  const crossStr = macdCrossUp ? ' 🟢 Cruce alcista MACD!' : macdCrossDown ? ' 🔴 Cruce bajista MACD!' : '';
  const accelStr = histAccel > 0.3 && macdDirection !== 0 ? ` ⚡aceleración ${(histAccel*100).toFixed(0)}%` : '';
  let analysis = '';
  if (signal === 'BUY')
    analysis = `↗ Alcista [${tfLabel}]: MACD hist:${macdHist.toFixed(4)}${crossStr}${accelStr}. RSI ${rsi}${rsi<40?' (sobrevendido)':''}. SL@${slSource}: $${stopLoss.toFixed(2)}, TP@${tpSource}: $${takeProfit.toFixed(2)} (R:R ${riskReward.toFixed(1)}).`;
  else if (signal === 'SELL')
    analysis = `↘ Bajista [${tfLabel}]: MACD hist:${macdHist.toFixed(4)}${crossStr}${accelStr}. RSI ${rsi}${rsi>60?' (sobrecomprado)':''}. SL@${slSource}: $${stopLoss.toFixed(2)}, TP@${tpSource}: $${takeProfit.toFixed(2)} (R:R ${riskReward.toFixed(1)}).`;
  else
    analysis = `→ Neutral [${tfLabel}]: MACD ${macdLine.toFixed(4)} vs señal ${signalLine.toFixed(4)}${accelStr}. RSI ${rsi}, rango $${low20.toFixed(2)}-$${high20.toFixed(2)}.`;

  return {
    ticker, price, signal, trend,
    confidence, confidence_pct: confidencePct, macd_conf_pct: macdOnlyConf,
    entry, stop_loss: stopLoss, take_profit: takeProfit,
    sl_source: slSource, tp_source: tpSource,
    position_size: qty, position_value: positionValue, risk_amount: actualRisk,
    potential_profit: potentialProfit, risk_reward: riskReward, rsi,
    macd_signal: macdSignal, macd_hist: macdHist, macd_cross_up: macdCrossUp, macd_cross_down: macdCrossDown,
    macd_hist_delta: histDelta, macd_accel: histAccel,
    volume_signal: 'NORMAL', ma_signal: maSignal, bb_signal: bbSignal,
    support: supportLevels[0] || low20, resistance: resistanceLevels[0] || high20,
    analysis, timeframe: tfLabel,
    bot_advice: signal !== 'WAIT' && confidencePct >= 55
      ? [{ action: 'SÍ', text: `${signal} ${confidence}` }]
      : [{ action: 'NO', text: 'Espera' }]
  };
}

// ══════════════════════════════════════════
// ANALYZE
// ══════════════════════════════════════════
async function analyzeWithAI(autoMode = false) {
  const ticker = document.getElementById('ticker-input').value.trim().toUpperCase();
  if (!ticker) return;

  const capital  = parseFloat(document.getElementById('capital-input').value) || INITIAL_CAPITAL;
  const risk_pct = parseFloat(document.getElementById('risk-pct').value) || 2;
  const rr_min   = parseFloat(document.getElementById('rr-min').value) || 2;
  const tfLabel  = getTFLabel();

  if (!autoMode) {
    document.getElementById('analyze-btn').disabled = true;
    document.getElementById('signal-loading').classList.add('active');
  }

  if (state.current_ticker !== ticker) {
    loadTVEmbed(ticker);
    state.current_ticker = ticker;
    // Show name immediately without waiting for price fetch
    updateChartPriceBar(ticker, null, null);
    log(`📊 ${ticker} [${tfLabel}]`, 'info');
  } else {
    log(`🔄 Re-analizando ${ticker} [${tfLabel}]`, 'info');
  }

  const msgs = [
    `Obteniendo datos ${tfLabel}...`,
    'Calculando MACD...',
    'Detectando tendencia...',
    'Generando señal...'
  ];
  let mi = 0;
  const msgInt = setInterval(() => {
    document.getElementById('loading-msg').textContent = msgs[mi++ % msgs.length];
  }, 500);

  let livePrice = null, indicators = null, dailyChangePct = null;
  try {
    const priceData = await fetchPriceData(ticker);
    livePrice = priceData.price;
    // Use candles if available (Binance/Yahoo OHLCV), else close-only history
    const histData = (priceData.candles && priceData.candles.length >= 3)
      ? priceData.candles
      : priceData.history;
    indicators = computeIndicators(histData);
    dailyChangePct = priceData.dailyChangePct;
    if (livePrice) {
      updateChartPriceBar(ticker, livePrice, dailyChangePct);
      startPriceUpdateLoop(ticker);
    } else {
      log(`⚠️ Sin datos para ${ticker}. Verifica el símbolo (ej: AAPL, BTC-USD, TSLA)`, 'info');
    }
  } catch(e) {
    log(`⚠️ Error obteniendo datos: ${e.message}`, 'info');
  }

  try {
    const signal = generateChartSignal(ticker, livePrice, indicators, capital, risk_pct, rr_min);
    if (msgInt) clearInterval(msgInt);
    state.current_signal = signal;
    state.current_price  = signal.price;

    renderSignal(signal);
    updateExecInfo();
    enableExecuteButtons();
    updateHeaderSignalInfo(signal);

    botDecide(signal);
    updateBotConfidenceDisplay();
    if (typeof updateBotInfoPanel === 'function') updateBotInfoPanel();
    saveState(true);
  } catch(e) {
    if (msgInt) clearInterval(msgInt);
    log(`❌ ${e.message}`, 'info');
    renderSignalError(ticker);
  } finally {
    document.getElementById('signal-loading').classList.remove('active');
    if (!autoMode) document.getElementById('analyze-btn').disabled = false;
  }
}

// ══════════════════════════════════════════
// RENDER SIGNAL
// ══════════════════════════════════════════
function enableExecuteButtons() {
  const buyBtn  = document.getElementById('exec-buy-btn');
  const sellBtn = document.getElementById('exec-sell-btn');
  if (buyBtn)  { buyBtn.disabled  = false; buyBtn.style.opacity  = '1'; buyBtn.style.pointerEvents = 'auto'; }
  if (sellBtn) { sellBtn.disabled = false; sellBtn.style.opacity = '1'; sellBtn.style.pointerEvents = 'auto'; }
}

function renderSignal(s) {
  const badgeClass  = s.signal === 'BUY' ? 'badge-buy' : s.signal === 'SELL' ? 'badge-sell' : 'badge-wait';
  const signalLabel = s.signal === 'BUY' ? '▲ LONG' : s.signal === 'SELL' ? '▼ SHORT' : '⏸ ESPERAR';
  const trendIcon   = s.trend === 'BULLISH' ? '↗' : s.trend === 'BEARISH' ? '↘' : '→';
  const rsiColor    = s.rsi > 70 ? 'pill-bear' : s.rsi < 30 ? 'pill-bull' : 'pill-neutral';
  const macdColor   = s.macd_signal === 'BULLISH' ? 'pill-bull' : s.macd_signal === 'BEARISH' ? 'pill-bear' : 'pill-neutral';
  const maColor     = s.ma_signal === 'ABOVE' ? 'pill-bull' : s.ma_signal === 'BELOW' ? 'pill-bear' : 'pill-neutral';
  const bbColor     = s.bb_signal === 'LOWER' ? 'pill-bull' : s.bb_signal === 'UPPER' ? 'pill-bear' : 'pill-neutral';
  const confPct     = getConfidencePct(s);
  const confColor   = confPct >= 75 ? 'var(--accent)' : confPct >= 55 ? 'var(--yellow)' : 'var(--red)';
  const confBg      = confPct >= 75 ? 'rgba(0,212,160,0.15)' : confPct >= 55 ? 'rgba(255,200,0,0.15)' : 'rgba(255,0,0,0.15)';
  const barClass    = s.signal === 'BUY' ? 'bar-bull' : s.signal === 'SELL' ? 'bar-bear' : 'bar-neutral';
  const tfLabel     = s.timeframe || getTFLabel();

  // MACD cross badge
  const crossBadge = s.macd_cross_up
    ? `<span style="background:rgba(0,212,160,0.2);color:var(--accent);border:1px solid var(--accent);border-radius:4px;padding:1px 6px;font-size:0.58rem;font-weight:700;margin-left:6px;">🟢 CRUCE ALCISTA</span>`
    : s.macd_cross_down
    ? `<span style="background:rgba(255,77,106,0.2);color:var(--red);border:1px solid var(--red);border-radius:4px;padding:1px 6px;font-size:0.58rem;font-weight:700;margin-left:6px;">🔴 CRUCE BAJISTA</span>`
    : '';

  document.getElementById('signal-card').innerHTML = `
    <div class="signal-header">
      <div class="signal-ticker">${s.ticker}</div>
      <span style="font-size:0.6rem;color:var(--text2);background:var(--surface2);padding:2px 7px;border-radius:4px;margin-left:6px;">${tfLabel}</span>
      ${crossBadge}
      <div class="signal-badge ${badgeClass}">${signalLabel}</div>
    </div>
    <div style="font-family:var(--mono);font-size:1.2rem;font-weight:700;margin-bottom:7px;">
      <span>$${s.price.toLocaleString('en-US',{minimumFractionDigits:2})}</span>
      <span style="font-size:0.7rem;color:var(--text2);margin-left:10px;">${trendIcon} ${s.trend}</span>
      <span style="color:${confColor};background:${confBg};padding:4px 10px;border-radius:5px;border-left:3px solid ${confColor};margin-left:10px;display:inline-block;">${confPct}%</span>
    </div>
    <div class="signal-levels">
      <div class="level-item"><div class="level-label">ENTRADA</div><div class="level-value level-entry">$${s.entry.toLocaleString('en-US',{minimumFractionDigits:2})}</div></div>
      <div class="level-item">
        <div class="level-label">TP <span style="font-size:0.55rem;opacity:0.7;">${s.tp_source||''}</span></div>
        <div class="level-value level-tp">$${s.take_profit.toLocaleString('en-US',{minimumFractionDigits:2})}</div>
      </div>
      <div class="level-item">
        <div class="level-label">SL <span style="font-size:0.55rem;opacity:0.7;">${s.sl_source||''}</span></div>
        <div class="level-value level-sl">$${s.stop_loss.toLocaleString('en-US',{minimumFractionDigits:2})}</div>
      </div>
    </div>
    <div class="signal-rr">
      <div class="rr-item"><div class="rr-label">R:R</div><div class="rr-value" style="color:var(--accent)">${s.risk_reward.toFixed(1)}:1</div></div>
      <div class="rr-item"><div class="rr-label">ACCIONES</div><div class="rr-value">${typeof s.position_size === 'number' ? (s.position_size % 1 !== 0 ? s.position_size.toFixed(2) : s.position_size) : s.position_size}</div></div>
      <div class="rr-item"><div class="rr-label">RIESGO</div><div class="rr-value" style="color:var(--red)">-$${(s.risk_amount * state.leverage).toFixed(0)}</div></div>
      <div class="rr-item"><div class="rr-label">GANANCIA</div><div class="rr-value" style="color:var(--accent)">+$${(s.potential_profit * state.leverage).toFixed(0)}</div></div>
    </div>
    <div class="confidence-bar">
      <div class="confidence-label"><span>${s.confidence}</span><span style="color:${confColor}">${confPct}%</span></div>
      <div class="bar-track"><div class="bar-fill ${barClass}" style="width:${confPct}%"></div></div>
    </div>
    <div class="signal-analysis">${s.analysis}</div>
    <div class="indicators">
      <div class="indicator-pill ${rsiColor}">RSI ${s.rsi}</div>
      <div class="indicator-pill ${macdColor}">MACD ${s.macd_signal}</div>
      <div class="indicator-pill" style="background:rgba(122,143,168,0.1);color:var(--text2)">VOL</div>
      <div class="indicator-pill ${maColor}">MA ${s.ma_signal}</div>
      <div class="indicator-pill ${bbColor}">BB ${s.bb_signal}</div>
    </div>
    <div style="margin-top:5px;font-size:0.63rem;color:var(--text3);">
      SOPORTE: <span style="color:var(--accent);">$${s.support?.toLocaleString('en-US',{minimumFractionDigits:2})}</span> | RESISTENCIA: <span style="color:var(--red);">$${s.resistance?.toLocaleString('en-US',{minimumFractionDigits:2})}</span>
    </div>
  `;
}

function renderSignalError(ticker) {
  document.getElementById('signal-card').innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <div class="empty-text">Error analizando ${ticker}</div>
    </div>`;
}

function updateHeaderSignalInfo(signal) {
  if (!signal) return;
  const display = document.getElementById('signal-ticker-display');
  if (!display) return;
  display.style.display = 'flex';

  const priceEl = document.getElementById('hdr-price');
  const trendEl = document.getElementById('hdr-trend');
  const confEl  = document.getElementById('hdr-confidence');

  if (priceEl) priceEl.textContent = '$' + signal.price.toLocaleString('en-US',{minimumFractionDigits:2});
  if (trendEl) {
    const icon  = signal.trend === 'BULLISH' ? '↗' : signal.trend === 'BEARISH' ? '↘' : '→';
    const color = signal.trend === 'BULLISH' ? 'var(--accent)' : signal.trend === 'BEARISH' ? 'var(--red)' : 'var(--yellow)';
    trendEl.innerHTML = `<span style="color:${color};">${icon} ${signal.trend}</span>`;
  }
  if (confEl) {
    const pct   = getConfidencePct(signal);
    const color = pct >= 75 ? 'var(--accent)' : pct >= 55 ? 'var(--yellow)' : 'var(--red)';
    confEl.innerHTML = `<span style="color:${color};">${pct}%</span>`;
  }
}
