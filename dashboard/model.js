/* Token Radar v3: the value model, the token odds and the held-out tests of both.
   One file, two readers: main.ts runs it in Node to write board.json, and the page runs the very same
   functions on the very same snapshot rows, so the board on screen is the board that was handed in.
   Nothing here names a protocol: every weight is fitted from the snapshot's own figures, and every
   term has to earn its weight on protocols the fit never saw. */
(function (root) {
  'use strict';

  var DAY = 864e5;
  var OFF_LIST = ['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'];
  var VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
  var DERIVED = /\b(wrapped|staked|staking)\b/i;
  var EXCHANGE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/;
  var TERMS = ['size', 'growth', 'maturity', 'breadth'];
  var GRID = [1024, 128, 16, 2]; // ridge penalties a term may be given, heaviest first
  var HUBER = 0.6, FAMILY_SHRINK = 20; // a family's offset is its median residual times n / (n + 20)

  /* categories grouped by what the protocol does; the value model fits one offset per family */
  var FAMILY = {
    vault: ['Risk Curators', 'Onchain Capital Allocator', 'Yield Aggregator', 'Liquidity Manager', 'Yield', 'Leveraged Farming', 'Farm', 'Options Vault', 'Indexes'],
    dex: ['Dexs', 'Launchpad', 'NFT Marketplace', 'Token Locker'],
    lend: ['Lending', 'CDP', 'CDP Manager', 'Collateral Markets', 'Collateral Management', 'Uncollateralized Lending', 'Dual-Token Stablecoin', 'Stablecoin Wrapper', 'Stablecoin Issuer', 'Algo-Stables', 'Synthetics', 'Reserve Currency'],
    perp: ['Derivatives', 'Options', 'Prediction Market', 'Interest Rate Derivatives'],
    rwa: ['RWA', 'Basis Trading', 'CeDeFi', 'Anchor BTC', 'Decentralized BTC', 'OTC Marketplace', 'Payments', 'Crypto Card Issuer', 'Privacy'],
    stake: ['Staking Pool', 'Restaking', 'Insurance', 'Governance Incentives', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC'],
    chain: ['Chain', 'Cross Chain Bridge', 'Bridge', 'Canonical Bridge', 'CEX', 'AI Agents', 'Decentralized AI', 'DOR']
  };
  function familyOf(category) {
    for (var k in FAMILY) if (FAMILY[k].indexOf(category) >= 0) return k;
    return 'vault';
  }

  /* ---------- small numeric helpers ---------- */
  function byNumber(a, b) { return a - b; }
  function mean(xs) { var s = 0; for (var i = 0; i < xs.length; i++) s += xs[i]; return xs.length ? s / xs.length : 0; }
  function quantile(xs, q) { // linear interpolation between order statistics
    if (!xs.length) return 0;
    var s = xs.slice().sort(byNumber), at = (s.length - 1) * q, lo = Math.floor(at), hi = Math.ceil(at);
    return s[lo] + (s[hi] - s[lo]) * (at - lo);
  }
  function median(xs) { return quantile(xs, 0.5); }
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function dot(a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
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
  function solve(A, b) { // Gaussian elimination with partial pivoting
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

  /* ---------- who is who ---------- */
  function recordsNoToken(p) { return p.gecko_id == null && p.symbol == null; }
  function isTrading(p) { return !recordsNoToken(p) && p.mcap_usd > 0; }
  /* asideReason: '' when the protocol stands on its own, else why the radar sets it aside (the house's own watchlist rule) */
  function asideReason(p) {
    if (OFF_LIST.indexOf(p.category) >= 0) return 'bridge, staking or exchange category';
    if (VERSIONED.test(p.name)) return 'a later version of a protocol';
    if (DERIVED.test(p.name)) return 'wrapped or staked product';
    if (EXCHANGE.test(p.name)) return 'an exchange\'s product';
    return '';
  }
  function ageYears(p, asOf) {
    if (!p.listed_at) return null;
    return Math.max(0, (Date.parse(asOf) - Date.parse(p.listed_at)) / DAY / 365.25);
  }

  /* ---------- the value model ---------- */
  /* featuresOf: the four terms, each straight from one snapshot row */
  function featuresOf(p, asOf, fillAge) {
    var age = ageYears(p, asOf);
    return [
      Math.log10(p.tvl_usd),                                       // size: TVL
      clamp(p.change_7d == null ? 0 : p.change_7d, -30, 60) / 100, // growth: 7-day TVL change, capped
      Math.log10(1 + Math.min(age == null ? fillAge : age, 6)),    // maturity: years it has run
      Math.log10(p.chains.length || 1)                             // breadth: chains it runs on
    ];
  }
  function standardise(raw, m) {
    return raw.map(function (x, j) { return TERMS[j] === m.drop ? 0 : (x - m.mu[j]) / m.sd[j]; });
  }

  /* fitRidge: robust ridge regression of log10(market cap) on the standardised terms over protocols whose
     token trades, each term under its own penalty `lam`; then one offset per category family from the
     residuals, pulled toward zero when the family has few trading peers. `drop` removes one term (ablation). */
  function fitRidge(train, asOf, lam, drop) {
    var ages = train.map(function (p) { return ageYears(p, asOf); }).filter(function (a) { return a != null; });
    var m = { mu: [], sd: [], lam: lam, drop: drop || null, fillAge: ages.length ? median(ages) : 2, n: train.length, family: {} };
    var raw = train.map(function (p) { return featuresOf(p, asOf, m.fillAge); }), d = TERMS.length + 1, i, a, b, j;
    for (j = 0; j < TERMS.length; j++) {
      var col = raw.map(function (r) { return r[j]; }), mu = mean(col);
      m.mu.push(mu);
      m.sd.push(Math.sqrt(mean(col.map(function (x) { return (x - mu) * (x - mu); }))) || 1);
    }
    var X = raw.map(function (r) { return [1].concat(standardise(r, m)); });
    var y = train.map(function (p) { return Math.log10(p.mcap_usd); }), w = y.map(function () { return 1; });
    for (var pass = 0; pass < 4; pass++) { // iteratively reweighted: Huber weights tame the outliers
      var A = [], v = [];
      for (a = 0; a < d; a++) {
        A.push(new Array(d).fill(0)); v.push(0);
        for (i = 0; i < X.length; i++) {
          v[a] += w[i] * X[i][a] * y[i];
          for (b = 0; b < d; b++) A[a][b] += w[i] * X[i][a] * X[i][b];
        }
        if (a > 0) A[a][a] += lam[a - 1];
      }
      m.beta = solve(A, v);
      for (i = 0; i < X.length; i++) {
        var r = Math.abs(y[i] - dot(m.beta, X[i]));
        w[i] = r <= HUBER ? 1 : HUBER / r;
      }
    }
    if (drop === 'category') return m;
    var byFamily = {};
    for (i = 0; i < train.length; i++) (byFamily[familyOf(train[i].category)] = byFamily[familyOf(train[i].category)] || []).push(y[i] - dot(m.beta, X[i]));
    Object.keys(byFamily).forEach(function (f) {
      var n = byFamily[f].length;
      m.family[f] = median(byFamily[f]) * n / (n + FAMILY_SHRINK);
    });
    return m;
  }
  /* a per-category offset under the family one was tried and dropped: it made all three held-out tests worse */
  function offsetOf(category, m) { return m.family[familyOf(category)] || 0; }
  function logValue(p, m, asOf) {
    return m.beta[0] + dot(m.beta.slice(1), standardise(featuresOf(p, asOf, m.fillAge), m)) + offsetOf(p.category, m);
  }
  function foldOf(p) { return hashSlug(p.slug) % 5; }

  /* chooseShrinkage: how hard each of growth, maturity and breadth is shrunk is not asserted, it is picked
     by an inner 5-fold test on the training rows alone: a term the held-out rows do not support ends at the
     heaviest penalty, where it can move a value by a few per cent at most. Size keeps a light penalty. */
  function chooseShrinkage(train, asOf, drop) {
    var lam = [2, 16, 16, 16];
    function innerError() {
      var errs = [];
      for (var k = 0; k < 5; k++) {
        var m = fitRidge(train.filter(function (p) { return foldOf(p) !== k; }), asOf, lam, drop);
        train.forEach(function (p) { if (foldOf(p) === k) errs.push(Math.abs(Math.log10(p.mcap_usd) - logValue(p, m, asOf))); });
      }
      return mean(errs);
    }
    var best = innerError();
    for (var j = 1; j < TERMS.length; j++) { // one pass, term by term; a tie keeps the heavier penalty
      if (TERMS[j] === drop) continue;
      var keep = lam[j];
      for (var g = 0; g < GRID.length; g++) {
        lam[j] = GRID[g];
        var e = innerError();
        if (e < best - 1e-9) { best = e; keep = GRID[g]; }
      }
      lam[j] = keep;
    }
    return lam;
  }
  /* fitValueModel: the whole recipe, shrinkage choice included, so every test below repeats all of it */
  function fitValueModel(train, asOf, drop) {
    return fitRidge(train, asOf, chooseShrinkage(train, asOf, drop), drop);
  }

  /* valueOf: the implied value of one row, with each term's factor kept for the detail view.
     `base` is what the average trading protocol of this TVL is worth; each factor moves it from there. */
  function valueOf(p, m, asOf) {
    var z = standardise(featuresOf(p, asOf, m.fillAge), m), b = m.beta, off = offsetOf(p.category, m);
    var log = b[0] + dot(b.slice(1), z) + off;
    return {
      log: log, implied: Math.max(1, Math.round(Math.pow(10, log))), base: Math.pow(10, b[0] + b[1] * z[0]),
      mult: { category: Math.pow(10, off), growth: Math.pow(10, b[2] * z[1]), maturity: Math.pow(10, b[3] * z[2]), breadth: Math.pow(10, b[4] * z[3]) },
      age: ageYears(p, asOf), ageFilled: p.listed_at == null
    };
  }

  /* ---------- held-out tests of the value model ---------- */
  function looFolds(trading) { // leave-one-out: every protocol predicted by a fit that never saw it
    return trading.map(function (p, i) { return { train: trading.filter(function (_, j) { return j !== i; }), test: [p] }; });
  }
  function kFolds(trading) { // five folds dealt by slug hash
    return [0, 1, 2, 3, 4].map(function (k) {
      return { train: trading.filter(function (p) { return foldOf(p) !== k; }), test: trading.filter(function (p) { return foldOf(p) === k; }) };
    });
  }
  function walkFolds(trading) { // fit on the 60% tracked longest, test on the newest 40%: the side a pre-token protocol sits on
    var dated = trading.filter(function (p) { return p.listed_at; }).sort(function (a, b) {
      return a.listed_at < b.listed_at ? -1 : a.listed_at > b.listed_at ? 1 : a.slug < b.slug ? -1 : 1;
    });
    var cut = Math.floor(dated.length * 0.6);
    return [{ train: dated.slice(0, cut), test: dated.slice(cut), cutoff: dated[cut].listed_at }];
  }
  /* heldOut: run the full recipe on each fold's training rows and score its test rows.
     `res` is log10(actual / predicted) per test row; naive is TVL times one fitted constant. */
  function heldOut(folds, asOf, drop) {
    var res = [], naive = [];
    folds.forEach(function (f) {
      var m = fitValueModel(f.train, asOf, drop);
      var k = median(f.train.map(function (p) { return Math.log10(p.mcap_usd / p.tvl_usd); }));
      f.test.forEach(function (p) {
        res.push(Math.log10(p.mcap_usd) - logValue(p, m, asOf));
        naive.push(Math.abs(Math.log10(p.mcap_usd) - Math.log10(p.tvl_usd) - k));
      });
    });
    var abs = res.map(Math.abs);
    return { n: res.length, res: res, mean: mean(abs), naiveMean: mean(naive), factor: Math.pow(10, median(abs)), naiveFactor: Math.pow(10, median(naive)),
      gain: 1 - mean(abs) / mean(naive), cutoff: folds[0].cutoff || null };
  }

  /* conformalBand: the range around a value is read off the leave-one-out misses themselves. The 80% band
     is the 10th to 90th percentile of log10(actual / predicted), the 50% band the quartiles. */
  function conformalBand(res) {
    return { lo80: quantile(res, 0.1), hi80: quantile(res, 0.9), lo50: quantile(res, 0.25), hi50: quantile(res, 0.75) };
  }
  /* bandCoverage: build the band from one half of the held-out misses and count how many of the other
     half it holds, both ways round. An honest 80% band should hold about 80%. */
  function bandCoverage(trading, res) {
    var inside = { c80: 0, c50: 0 }, n = 0;
    [0, 1].forEach(function (side) {
      var mine = [], theirs = [];
      trading.forEach(function (p, i) { (hashSlug(p.slug) % 2 === side ? mine : theirs).push(res[i]); });
      var band = conformalBand(mine);
      theirs.forEach(function (r) {
        n++;
        if (r >= band.lo80 && r <= band.hi80) inside.c80++;
        if (r >= band.lo50 && r <= band.hi50) inside.c50++;
      });
    });
    return { n: n, c80: inside.c80 / n, c50: inside.c50 / n };
  }

  /* ---------- token odds ---------- */
  /* Of the protocols that stand on their own, some record a token and some do not. fitOdds is a ridge
     logistic regression of "records a token" on how long the protocol has run, its TVL, its 7-day growth,
     its chain count and the token rate of its category. It is the peers' record, not a forecast of a date. */
  function oddsFeatures(p, m, asOf, isTrainRow) {
    var age = ageYears(p, asOf), c = p.category || 'Uncategorised';
    var n = (m.catAll[c] || 0) - (isTrainRow ? 1 : 0), t = (m.catToken[c] || 0) - (isTrainRow && !recordsNoToken(p) ? 1 : 0);
    var rate = (t + 4 * m.base) / (n + 4); // its category's token rate, itself left out, smoothed toward the base rate
    return [
      1,
      age == null ? 0 : Math.min(age, 6) - 2,                      // years it has run
      age == null ? 1 : 0,                                         // no listing date reported
      Math.log10(p.tvl_usd) - 7.5,
      Math.log(rate / (1 - rate)) - Math.log(m.base / (1 - m.base)),
      Math.log10(p.chains.length || 1),
      clamp(p.change_7d == null ? 0 : p.change_7d, -30, 60) / 100
    ];
  }
  function fitOdds(peers, asOf) {
    var m = { catAll: {}, catToken: {}, n: peers.length, b: [0, 0, 0, 0, 0, 0, 0] }, tokens = 0, d = 7, i, a, c;
    peers.forEach(function (p) {
      var k = p.category || 'Uncategorised';
      m.catAll[k] = (m.catAll[k] || 0) + 1;
      if (!recordsNoToken(p)) { m.catToken[k] = (m.catToken[k] || 0) + 1; tokens++; }
    });
    m.base = tokens / peers.length;
    var X = peers.map(function (p) { return oddsFeatures(p, m, asOf, true); });
    var y = peers.map(function (p) { return recordsNoToken(p) ? 0 : 1; });
    for (var it = 0; it < 25; it++) { // Newton steps on the penalised log-likelihood
      var g = new Array(d).fill(0), H = [];
      for (a = 0; a < d; a++) H.push(new Array(d).fill(0));
      for (i = 0; i < X.length; i++) {
        var pr = 1 / (1 + Math.exp(-dot(m.b, X[i])));
        for (a = 0; a < d; a++) {
          g[a] += (y[i] - pr) * X[i][a];
          for (c = 0; c < d; c++) H[a][c] += pr * (1 - pr) * X[i][a] * X[i][c];
        }
      }
      for (a = 1; a < d; a++) { g[a] -= m.b[a]; H[a][a] += 1; }
      var step = solve(H, g);
      for (a = 0; a < d; a++) m.b[a] += step[a];
    }
    return m;
  }
  function oddsOf(p, m, asOf) { return 1 / (1 + Math.exp(-dot(m.b, oddsFeatures(p, m, asOf, false)))); }
  /* oddsTest: five folds; Brier score against the plain base rate, and the held-out odds cut into thirds
     so the page can show predicted against what the peers actually record. */
  function oddsTest(peers, asOf) {
    var out = [];
    for (var k = 0; k < 5; k++) {
      var m = fitOdds(peers.filter(function (p) { return foldOf(p) !== k; }), asOf);
      peers.forEach(function (p) { if (foldOf(p) === k) out.push({ pr: oddsOf(p, m, asOf), base: m.base, y: recordsNoToken(p) ? 0 : 1, slug: p.slug }); });
    }
    out.sort(function (a, b) { return a.pr - b.pr || (a.slug < b.slug ? -1 : 1); });
    var third = Math.floor(out.length / 3), sq = function (key) { return mean(out.map(function (o) { return (o[key] - o.y) * (o[key] - o.y); })); };
    return {
      n: out.length, brier: sq('pr'), baseBrier: sq('base'), skill: 1 - sq('pr') / sq('base'),
      thirds: [out.slice(0, third), out.slice(third, 2 * third), out.slice(2 * third)].map(function (part) {
        return { n: part.length, predicted: mean(part.map(function (o) { return o.pr; })), actual: mean(part.map(function (o) { return o.y; })) };
      })
    };
  }

  root.TokenRadar = {
    TERMS: TERMS, FAMILY: FAMILY, usd: usd, median: median, quantile: quantile, mean: mean, familyOf: familyOf,
    recordsNoToken: recordsNoToken, isTrading: isTrading, asideReason: asideReason,
    fitValueModel: fitValueModel, valueOf: valueOf, looFolds: looFolds, kFolds: kFolds, walkFolds: walkFolds, heldOut: heldOut,
    conformalBand: conformalBand, bandCoverage: bandCoverage, fitOdds: fitOdds, oddsOf: oddsOf, oddsTest: oddsTest
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
