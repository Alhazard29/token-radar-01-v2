/* Token Radar v2: the value model and the farm planner.
   One file, two readers: main.ts runs it in Node to write board.json, and the page runs the very same
   functions on the very same snapshot rows, so the board on screen is the board that was handed in.
   Nothing here names a protocol: every number is fitted from the snapshot's own figures. */
(function (root) {
  'use strict';

  var DAY = 864e5;
  var OFF_LIST = ['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'];
  var VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
  var DERIVED = /\b(wrapped|staked|staking)\b/i;
  var EXCHANGE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/;
  var TERMS = ['size', 'growth', 'maturity', 'breadth'];
  var RIDGE = 0.5, HUBER = 0.6, SHRINK = 4;

  /* ---------- small numeric helpers ---------- */
  function median(xs) {
    if (!xs.length) return 0;
    var s = xs.slice().sort(function (a, b) { return a - b; }), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function hashSlug(s) { // FNV-1a, only used to deal protocols into folds
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function usd(n) {
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
    if (a >= 1e4) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  /* ---------- who is who ---------- */
  function recordsNoToken(p) { return p.gecko_id == null && p.symbol == null; }
  function isTrading(p) { return !recordsNoToken(p) && p.mcap_usd > 0; }
  function isOwnProtocol(p) {
    return OFF_LIST.indexOf(p.category) < 0 && !VERSIONED.test(p.name) && !DERIVED.test(p.name) && !EXCHANGE.test(p.name);
  }
  function ageYears(p, asOf) {
    if (!p.listed_at) return null;
    return Math.max(0, (Date.parse(asOf) - Date.parse(p.listed_at)) / DAY / 365.25);
  }

  /* ---------- the features: all four come straight from a snapshot row ---------- */
  function featuresOf(p, asOf, fillAge) {
    var age = ageYears(p, asOf);
    return [
      1,
      Math.log10(p.tvl_usd) - 8,                                   // size: TVL, centred on $100M
      clamp(p.change_7d == null ? 0 : p.change_7d, -30, 60) / 100, // growth: 7-day TVL change, capped
      Math.log10(1 + Math.min(age == null ? fillAge : age, 6)),    // maturity: years tracked
      Math.log10(p.chains.length || 1)                             // breadth: chains it runs on
    ];
  }

  function solve(A, b) { // Gaussian elimination with partial pivoting, 5x5
    var n = b.length, i, j, k, M = A.map(function (r, x) { return r.concat(b[x]); });
    for (i = 0; i < n; i++) {
      var piv = i;
      for (j = i + 1; j < n; j++) if (Math.abs(M[j][i]) > Math.abs(M[piv][i])) piv = j;
      var t = M[i]; M[i] = M[piv]; M[piv] = t;
      if (Math.abs(M[i][i]) < 1e-12) continue;
      for (j = i + 1; j < n; j++) {
        var f = M[j][i] / M[i][i];
        for (k = i; k <= n; k++) M[j][k] -= f * M[i][k];
      }
    }
    var x = new Array(n).fill(0);
    for (i = n - 1; i >= 0; i--) {
      var s = M[i][n];
      for (j = i + 1; j < n; j++) s -= M[i][j] * x[j];
      x[i] = Math.abs(M[i][i]) < 1e-12 ? 0 : s / M[i][i];
    }
    return x;
  }

  /* fitModel: robust ridge regression of log10(market cap) on the four features over the protocols
     whose token already trades, then a shrunken per-category offset from the residuals.
     `drop` switches one term off (used by the ablation test). */
  function fitModel(train, asOf, drop) {
    var fillAge = median(train.map(function (p) { return ageYears(p, asOf); }).filter(function (a) { return a != null; }));
    var X = train.map(function (p) {
      var f = featuresOf(p, asOf, fillAge);
      if (drop) f[TERMS.indexOf(drop) + 1] = 0;
      return f;
    });
    var y = train.map(function (p) { return Math.log10(p.mcap_usd); });
    var w = y.map(function () { return 1; }), beta = [0, 0, 0, 0, 0], d = 5, pass, i, a, b;
    for (pass = 0; pass < 4; pass++) { // iteratively reweighted: Huber weights tame the outliers
      var A = [], v = [];
      for (a = 0; a < d; a++) {
        A.push(new Array(d).fill(0)); v.push(0);
        for (i = 0; i < X.length; i++) {
          v[a] += w[i] * X[i][a] * y[i];
          for (b = 0; b < d; b++) A[a][b] += w[i] * X[i][a] * X[i][b];
        }
        if (a > 0) A[a][a] += RIDGE;
      }
      beta = solve(A, v);
      for (i = 0; i < X.length; i++) {
        var r = Math.abs(y[i] - dot(beta, X[i]));
        w[i] = r <= HUBER ? 1 : HUBER / r;
      }
    }
    var byCat = {}, offsets = {};
    for (i = 0; i < train.length; i++) {
      var c = train[i].category || 'Uncategorised';
      (byCat[c] = byCat[c] || []).push(y[i] - dot(beta, X[i]));
    }
    if (drop !== 'category') Object.keys(byCat).forEach(function (c) {
      var n = byCat[c].length;
      offsets[c] = median(byCat[c]) * n / (n + SHRINK); // few peers -> pulled toward zero
    });
    return { beta: beta, offsets: offsets, fillAge: fillAge, n: train.length, drop: drop || null };
  }
  function dot(a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

  /* scoreProtocol: the implied value of one row, with each term's share kept for the detail view. */
  function scoreProtocol(p, model, asOf) {
    var f = featuresOf(p, asOf, model.fillAge), b = model.beta;
    if (model.drop) f[TERMS.indexOf(model.drop) + 1] = 0;
    var off = model.offsets[p.category || 'Uncategorised'] || 0;
    var log = dot(b, f) + off;
    return {
      log: log,
      implied: Math.max(1, Math.round(Math.pow(10, log))),
      base: Math.pow(10, b[0] + b[1] * f[1]),
      mult: {
        category: Math.pow(10, off), growth: Math.pow(10, b[2] * f[2]),
        maturity: Math.pow(10, b[3] * f[3]), breadth: Math.pow(10, b[4] * f[4])
      },
      age: ageYears(p, asOf), ageFilled: p.listed_at == null
    };
  }

  /* ---------- held-out tests ---------- */
  function errorsOf(test, model, asOf) {
    return test.map(function (p) { return Math.abs(scoreProtocol(p, model, asOf).log - Math.log10(p.mcap_usd)); });
  }
  function naiveErrors(train, test) { // the baseline every term must beat: TVL times one constant
    var k = median(train.map(function (p) { return Math.log10(p.mcap_usd / p.tvl_usd); }));
    return test.map(function (p) { return Math.abs(Math.log10(p.tvl_usd) + k - Math.log10(p.mcap_usd)); });
  }
  function summary(model, naive) {
    var m = median(model), n = median(naive);
    return { n: model.length, model: m, naive: n, factor: Math.pow(10, m), naiveFactor: Math.pow(10, n), gain: 1 - m / n };
  }
  /* kFold: five folds dealt by slug hash; every protocol is predicted by a model that never saw it. */
  function kFold(trading, asOf, drop) {
    var mine = [], naive = [];
    for (var k = 0; k < 5; k++) {
      var test = trading.filter(function (p) { return hashSlug(p.slug) % 5 === k; });
      var train = trading.filter(function (p) { return hashSlug(p.slug) % 5 !== k; });
      mine = mine.concat(errorsOf(test, fitModel(train, asOf, drop), asOf));
      naive = naive.concat(naiveErrors(train, test));
    }
    return summary(mine, naive);
  }
  /* walkForward: fit on the protocols tracked longest, test on the newest 40%: the direction a
     pre-token protocol sits in, since it is young next to the ones that already trade. */
  function walkForward(trading, asOf) {
    var dated = trading.filter(function (p) { return p.listed_at; }).sort(function (a, b) {
      return a.listed_at < b.listed_at ? -1 : a.listed_at > b.listed_at ? 1 : a.slug < b.slug ? -1 : 1;
    });
    var cut = Math.floor(dated.length * 0.6), train = dated.slice(0, cut), test = dated.slice(cut);
    var s = summary(errorsOf(test, fitModel(train, asOf), asOf), naiveErrors(train, test));
    s.cutoff = test[0].listed_at;
    return s;
  }

  root.TokenRadar = {
    TERMS: TERMS, usd: usd, median: median, recordsNoToken: recordsNoToken, isTrading: isTrading,
    isOwnProtocol: isOwnProtocol, fitModel: fitModel, scoreProtocol: scoreProtocol, kFold: kFold, walkForward: walkForward
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
