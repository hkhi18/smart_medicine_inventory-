// Demand forecasting: 9 models + rolling-origin backtest + model selection.
// Pure JavaScript (no external ML library) so every formula is visible and explainable.
// Input series: daily demand array `y` (oldest -> newest) and matching weekdays `dow` (0=Sun..6=Sat).

export const MODELS = [
  { key: 'naive', name: 'Naive (baseline)', params: 'last observed value' },
  { key: 'snaive', name: 'Seasonal naive (7d)', params: 'same weekday last week' },
  { key: 'ses', name: 'SES (alpha 0.3)', params: 'alpha=0.3' },
  { key: 'ma28', name: 'Moving average (28d)', params: 'window=28' },
  { key: 'arima', name: 'ARIMA(1,0,1) + weekday', params: 'weekday factors + ARMA(1,1), CSS grid search' },
  { key: 'ets', name: 'ETS (Holt-Winters, weekly)', params: 'additive, season=7, grid alpha/gamma' },
  { key: 'rf', name: 'Random forest', params: '15 trees, depth 6, lags 7/14/28 + weekday' },
  { key: 'hybrid', name: 'Hybrid ARIMA + RF', params: 'mean of ARIMA and RF' },
  { key: 'croston', name: 'Croston (SBA, intermittent)', params: 'alpha=0.1, SBA bias correction' }
];

export const MIN_HISTORY_DAYS = 120;   // fewer days -> insufficient_history
export const TRAIN_WINDOW = 365;       // models train on the last 365 days
export const FOLDS = 3;
export const HORIZON = 28;

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

// ---------------- Simple models ----------------

function naive(y, h) {
  return Array(h).fill(y[y.length - 1]);
}

function seasonalNaive(y, h) {
  const n = y.length;
  return Array.from({ length: h }, (_, i) => y[n - 7 + (i % 7)]);
}

function ses(y, h, alpha = 0.3) {
  let level = y[0];
  for (let t = 1; t < y.length; t++) level = alpha * y[t] + (1 - alpha) * level;
  return Array(h).fill(level);
}

function movingAverage(y, h, w = 28) {
  return Array(h).fill(mean(y.slice(-w)));
}

// ---------------- Weekday factors (shared) ----------------

function weekdayFactors(y, dow) {
  const sums = Array(7).fill(0);
  const counts = Array(7).fill(0);
  y.forEach((v, i) => { sums[dow[i]] += v; counts[dow[i]]++; });
  const overall = mean(y) || 1;
  return sums.map((s, d) => (counts[d] ? s / counts[d] / overall : 1) || 1);
}

// ---------------- ARIMA(1,0,1) on weekday-adjusted series ----------------

function armaResiduals(x, phi, theta) {
  const e = new Array(x.length).fill(0);
  let sse = 0;
  for (let t = 1; t < x.length; t++) {
    const pred = phi * x[t - 1] + theta * e[t - 1];
    e[t] = x[t] - pred;
    sse += e[t] * e[t];
  }
  return { e, sse };
}

function arima(y, h, dow, futureDow) {
  const f = weekdayFactors(y, dow);
  const z = y.map((v, i) => v / f[dow[i]]);
  const mu = mean(z);
  const x = z.map((v) => v - mu);
  let best = { sse: Infinity, phi: 0, theta: 0, e: [] };
  for (let phi = -0.9; phi <= 0.951; phi += 0.1) {
    for (let theta = -0.8; theta <= 0.81; theta += 0.2) {
      const r = armaResiduals(x, phi, theta);
      if (r.sse < best.sse) best = { ...r, phi, theta };
    }
  }
  const n = x.length;
  const out = [];
  let prev = best.phi * x[n - 1] + best.theta * best.e[n - 1];
  for (let k = 0; k < h; k++) {
    if (k > 0) prev = best.phi * prev;
    out.push(Math.max(0, (mu + prev) * f[futureDow[k]]));
  }
  return out;
}

// ---------------- ETS: additive Holt-Winters, weekly season ----------------

function holtWinters(y, h, alpha, beta, gamma) {
  const m = 7;
  let level = mean(y.slice(0, m));
  let trend = 0;
  const season = y.slice(0, m).map((v) => v - level);
  let sse = 0;
  for (let t = m; t < y.length; t++) {
    const s = season[t % m];
    const pred = level + trend + s;
    sse += (y[t] - pred) ** 2;
    const newLevel = alpha * (y[t] - s) + (1 - alpha) * (level + trend);
    trend = beta * (newLevel - level) + (1 - beta) * trend;
    season[t % m] = gamma * (y[t] - newLevel) + (1 - gamma) * s;
    level = newLevel;
  }
  const n = y.length;
  const fc = Array.from({ length: h }, (_, k) => Math.max(0, level + (k + 1) * trend + season[(n + k) % m]));
  return { fc, sse };
}

function ets(y, h) {
  let best = null;
  for (const alpha of [0.05, 0.15, 0.3]) {
    for (const gamma of [0.05, 0.2]) {
      const r = holtWinters(y, h, alpha, 0.01, gamma);
      if (!best || r.sse < best.sse) best = r;
    }
  }
  return best.fc;
}

// ---------------- Random forest (regression trees, bagging) ----------------

function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function buildTree(X, Y, idx, depth, rng, opts) {
  const vals = idx.map((i) => Y[i]);
  const nodeMean = mean(vals);
  if (depth >= opts.maxDepth || idx.length < opts.minLeaf * 2) return { leaf: nodeMean };

  const nFeat = X[0].length;
  const feats = [];
  while (feats.length < opts.mtry) {
    const f = Math.floor(rng() * nFeat);
    if (!feats.includes(f)) feats.push(f);
  }

  let best = null;
  const total = vals.reduce((s, v) => s + v, 0);
  for (const f of feats) {
    const sorted = [...idx].sort((a, b) => X[a][f] - X[b][f]);
    let leftSum = 0;
    for (let k = 0; k < sorted.length - 1; k++) {
      leftSum += Y[sorted[k]];
      const nl = k + 1;
      const nr = sorted.length - nl;
      if (nl < opts.minLeaf || nr < opts.minLeaf) continue;
      if (X[sorted[k]][f] === X[sorted[k + 1]][f]) continue;
      // Maximise between-group variance (equivalent to minimising SSE)
      const score = (leftSum * leftSum) / nl + ((total - leftSum) ** 2) / nr;
      if (!best || score > best.score) {
        best = { score, f, thr: (X[sorted[k]][f] + X[sorted[k + 1]][f]) / 2 };
      }
    }
  }
  if (!best) return { leaf: nodeMean };
  const left = idx.filter((i) => X[i][best.f] <= best.thr);
  const right = idx.filter((i) => X[i][best.f] > best.thr);
  return {
    f: best.f,
    thr: best.thr,
    l: buildTree(X, Y, left, depth + 1, rng, opts),
    r: buildTree(X, Y, right, depth + 1, rng, opts)
  };
}

function predictTree(node, x) {
  while (node.leaf === undefined) node = x[node.f] <= node.thr ? node.l : node.r;
  return node.leaf;
}

// Features for day t: weekday, lag 7, lag 14, lag 28, mean of lags 7..13
function features(series, t, d) {
  const lag = (k) => series[t - k];
  const avgWeek = (lag(7) + lag(8) + lag(9) + lag(10) + lag(11) + lag(12) + lag(13)) / 7;
  return [d, lag(7), lag(14), lag(28), avgWeek];
}

function randomForest(y, h, dow, futureDow, seed = 7) {
  const X = [];
  const Y = [];
  for (let t = 28; t < y.length; t++) {
    X.push(features(y, t, dow[t]));
    Y.push(y[t]);
  }
  const rng = makeRng(seed);
  const opts = { maxDepth: 6, minLeaf: 5, mtry: 3 };
  const trees = [];
  for (let b = 0; b < 15; b++) {
    const idx = Array.from({ length: X.length }, () => Math.floor(rng() * X.length));
    trees.push(buildTree(X, Y, idx, 0, rng, opts));
  }
  // Recursive multi-step forecast: predictions become lags for later days
  const series = [...y];
  const out = [];
  for (let k = 0; k < h; k++) {
    const x = features(series, series.length, futureDow[k]);
    const p = Math.max(0, mean(trees.map((tr) => predictTree(tr, x))));
    out.push(p);
    series.push(p);
  }
  return out;
}

// ---------------- Croston SBA (intermittent demand) ----------------

function croston(y, h, alpha = 0.1) {
  let z = null;  // demand size
  let p = null;  // interval between demands
  let q = 1;
  for (const v of y) {
    if (v > 0) {
      if (z === null) { z = v; p = q; } else {
        z = alpha * v + (1 - alpha) * z;
        p = alpha * q + (1 - alpha) * p;
      }
      q = 1;
    } else q++;
  }
  const f = z === null ? 0 : (1 - alpha / 2) * (z / p);
  return Array(h).fill(f);
}

// ---------------- Dispatcher ----------------

export function runModel(key, y, h, dow, futureDow) {
  switch (key) {
    case 'naive': return naive(y, h);
    case 'snaive': return seasonalNaive(y, h);
    case 'ses': return ses(y, h);
    case 'ma28': return movingAverage(y, h);
    case 'arima': return arima(y, h, dow, futureDow);
    case 'ets': return ets(y, h);
    case 'rf': return randomForest(y, h, dow, futureDow);
    case 'hybrid': {
      const a = arima(y, h, dow, futureDow);
      const r = randomForest(y, h, dow, futureDow);
      return a.map((v, i) => (v + r[i]) / 2);
    }
    case 'croston': return croston(y, h);
    default: throw new Error('Unknown model ' + key);
  }
}

// ---------------- Error metrics ----------------

export function scores(actual, pred) {
  let ape = 0, apeN = 0, se = 0, ae = 0;
  actual.forEach((a, i) => {
    const e = a - pred[i];
    se += e * e;
    ae += Math.abs(e);
    if (a > 0) { ape += Math.abs(e) / a; apeN++; }
  });
  return {
    mape: apeN ? (ape / apeN) * 100 : null,
    rmse: Math.sqrt(se / actual.length),
    mae: ae / actual.length
  };
}

// Rolling-origin backtest: train up to each origin, forecast 28 days, score, average over folds.
// Then pick the lowest MAPE that beats the naive baseline and produce the final 90-day forecast.
export function forecastItem(yAll, dowAll, futureDow, horizon = 90) {
  if (yAll.length < MIN_HISTORY_DAYS) {
    return { status: 'insufficient_history', results: [], selected: null, forecast: [] };
  }
  const y = yAll.slice(-TRAIN_WINDOW - FOLDS * HORIZON);
  const dow = dowAll.slice(-y.length);
  const n = y.length;

  const results = MODELS.map((m) => {
    try {
      const fold = [];
      for (let k = FOLDS; k >= 1; k--) {
        const origin = n - k * HORIZON;
        const start = Math.max(0, origin - TRAIN_WINDOW);
        const train = y.slice(start, origin);
        const trainDow = dow.slice(start, origin);
        const test = y.slice(origin, origin + HORIZON);
        const testDow = dow.slice(origin, origin + HORIZON);
        fold.push(scores(test, runModel(m.key, train, HORIZON, trainDow, testDow)));
      }
      const avg = (k) => {
        const v = fold.map((f) => f[k]).filter((x) => x !== null && Number.isFinite(x));
        return v.length ? mean(v) : null;
      };
      return { ...m, mape: avg('mape'), rmse: avg('rmse'), mae: avg('mae'), status: 'computed' };
    } catch (err) {
      return { ...m, mape: null, rmse: null, mae: null, status: 'failed' };
    }
  });

  const naiveMape = results.find((r) => r.key === 'naive').mape ?? Infinity;
  const candidates = results.filter((r) => r.status === 'computed' && r.mape !== null && r.mape < naiveMape);
  const selected = (candidates.sort((a, b) => a.mape - b.mape)[0]) || results.find((r) => r.key === 'naive');

  const trainY = y.slice(-TRAIN_WINDOW);
  const trainDow = dow.slice(-TRAIN_WINDOW);
  const forecast = runModel(selected.key, trainY, horizon, trainDow, futureDow).map((v) => Math.max(0, v));

  return { status: 'computed', results, selected, forecast };
}

// z-score for common service levels (inverse normal CDF)
export function zFor(serviceLevel) {
  const table = { 0.9: 1.282, 0.95: 1.645, 0.97: 1.881, 0.98: 2.054, 0.99: 2.326 };
  return table[serviceLevel] ?? 1.645;
}
