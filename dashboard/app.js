/* Token Radar v2: the page. It draws what model.js and plan.js return for the snapshot in data.js.
   State lives in the URL hash (seg, q, cat, chain, sort, dir, p) so any view can be linked and shot. */
(function () {
  'use strict';
  var T = window.TokenRadar, SNAP = window.RADAR_SNAPSHOT, $ = function (id) { return document.getElementById(id); };
  if (!T || !SNAP) { document.body.innerHTML = '<p class="empty">data.js is missing: run main.ts first.</p>'; return; }

  var B = T.buildBoard(SNAP), usd = T.usd;
  var SEGS = [['all', 'Pre-token board'], ['watch', 'Watchlist'], ['early', 'Early, below the floor'], ['trading', 'Already trading']];
  var state = { seg: 'all', q: '', cat: '', chain: '', sort: 'rank', dir: 1, p: '' };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pct(x) { return x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(1) + '%'; }
  function times(x) { return '×' + x.toFixed(2); }
  function dollars(n) { return n < 10 ? '$' + n.toFixed(2) : '$' + Math.round(n).toLocaleString('en-US'); }
  function years(a) { return a == null ? '—' : a.toFixed(1) + ' yr'; }

  /* ---------- hash <-> state ---------- */
  function readHash() {
    var h = new URLSearchParams(location.hash.slice(1)), k;
    for (k in state) if (h.has(k)) state[k] = k === 'dir' ? (h.get(k) === '-1' ? -1 : 1) : h.get(k);
  }
  function writeHash() {
    var h = new URLSearchParams(), k;
    for (k in state) if (state[k] !== '' && !(k === 'seg' && state.seg === 'all') && !(k === 'sort' && state.sort === 'rank') && !(k === 'dir' && state.dir === 1)) h.set(k, state[k]);
    history.replaceState(null, '', '#' + h.toString());
  }

  /* ---------- the columns: one list drives the header, the sort and the cells ---------- */
  var COLS = [
    { k: 'rank', t: '#', v: function (r) { return r.rank; }, c: function (r) { return r.rank; }, num: 1 },
    { k: 'name', t: 'Protocol', v: function (r) { return r.p.name.toLowerCase(); }, c: function (r) { return '<b>' + esc(r.p.name) + '</b>' + (r.watch ? '<i class="tag w">watch</i>' : '<i class="tag e">early</i>'); } },
    { x: 1, k: 'cat', t: 'Category', v: function (r) { return r.p.category || ''; }, c: function (r) { return esc(r.p.category || 'Uncategorised'); } },
    { x: 1, k: 'chains', t: 'Chains', v: function (r) { return r.p.chains.length; }, c: function (r) { return esc(r.p.chains[0] || '—') + (r.p.chains.length > 1 ? ' <small>+' + (r.p.chains.length - 1) + '</small>' : ''); } },
    { k: 'tvl', t: 'TVL', v: function (r) { return r.p.tvl_usd; }, c: function (r) { return usd(r.p.tvl_usd); }, num: 1 },
    { x: 1, k: 'chg', t: '7d', v: function (r) { return r.p.change_7d == null ? -1e9 : r.p.change_7d; }, c: function (r) { var x = r.p.change_7d; return '<span class="' + (x == null ? '' : x < 0 ? 'neg' : 'pos') + '">' + pct(x) + '</span>'; }, num: 1 },
    { x: 1, k: 'age', t: 'Yrs, no token', v: function (r) { return r.score.age == null ? -1 : r.score.age; }, c: function (r) { return years(r.score.age); }, num: 1 },
    { k: 'implied', t: 'Implied value', v: function (r) { return r.score.implied; }, c: function (r) { return '<span class="bar" style="--w:' + (100 * Math.sqrt(r.score.implied / B.rows[0].score.implied)).toFixed(1) + '%"></span><b class="val">' + usd(r.score.implied) + '</b>'; }, num: 1 },
    { x: 1, k: 'ratio', t: '÷ TVL', v: function (r) { return r.score.implied / r.p.tvl_usd; }, c: function (r) { return (r.score.implied / r.p.tvl_usd).toFixed(2); }, num: 1 },
    { k: 'cost', t: 'Farm cost', v: function (r) { return r.plan.cost; }, c: function (r) { return dollars(r.plan.cost); }, num: 1 },
    { k: 'weeks', t: 'Weeks', v: function (r) { return r.plan.weeks; }, c: function (r) { return r.plan.weeks; }, num: 1 }
  ];
  var TRADE_COLS = [
    { k: 'name', t: 'Protocol', v: function (r) { return r.p.name.toLowerCase(); }, c: function (r) { return '<b>' + esc(r.p.name) + '</b><i class="tag t">' + esc(r.p.symbol || 'token') + '</i>'; } },
    { k: 'cat', t: 'Category', v: function (r) { return r.p.category || ''; }, c: function (r) { return esc(r.p.category || 'Uncategorised'); } },
    { k: 'tvl', t: 'TVL', v: function (r) { return r.p.tvl_usd; }, c: function (r) { return usd(r.p.tvl_usd); }, num: 1 },
    { k: 'mcap', t: 'Market cap (actual)', v: function (r) { return r.p.mcap_usd; }, c: function (r) { return usd(r.p.mcap_usd); }, num: 1 },
    { k: 'fitted', t: 'Model says', v: function (r) { return r.fitted; }, c: function (r) { return usd(r.fitted); }, num: 1 },
    { k: 'miss', t: 'Model ÷ actual', v: function (r) { return r.ratio; }, c: function (r) { return '<span class="' + (r.ratio > 3 || r.ratio < 1 / 3 ? 'neg' : 'pos') + '">' + times(r.ratio) + '</span>'; }, num: 1 }
  ];

  function visible() {
    var trading = state.seg === 'trading', rows = trading ? B.calibration : B.rows, q = state.q.trim().toLowerCase();
    var cols = trading ? TRADE_COLS : COLS, col = cols.filter(function (c) { return c.k === state.sort; })[0] || cols[trading ? 3 : 0];
    rows = rows.filter(function (r) {
      if (state.seg === 'watch' && !r.watch) return false;
      if (state.seg === 'early' && r.watch) return false;
      if (state.cat && (r.p.category || 'Uncategorised') !== state.cat) return false;
      if (state.chain && r.p.chains.indexOf(state.chain) < 0) return false;
      return !q || r.p.name.toLowerCase().indexOf(q) >= 0 || r.p.slug.indexOf(q) >= 0;
    });
    var dir = trading && !cols.some(function (c) { return c.k === state.sort; }) ? -1 : state.dir;
    return { cols: cols, sortKey: col.k, dir: dir, rows: rows.slice().sort(function (a, b) {
      var x = col.v(a), y = col.v(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir || (a.p.slug < b.p.slug ? -1 : 1);
    }) };
  }

  /* ---------- drawing ---------- */
  function drawKpis() {
    var k = B.tests.kfold, w = B.tests.walk, sum = 0, ratios = [];
    B.rows.forEach(function (r) { sum += r.score.implied; ratios.push(r.score.implied / r.p.tvl_usd); });
    var covered = B.rows.filter(function (r) { return r.watch; }).length;
    var tiles = [
      ['Protocols ranked', B.rows.length, B.counts.early + ' early + ' + covered + ' watchlist'],
      ['Watchlist covered', covered + ' / ' + B.counts.watchlist, covered === B.counts.watchlist ? 'every slug on the board' : 'MISSING ROWS'],
      ['Implied value, whole board', usd(sum), 'median ' + T.median(ratios).toFixed(2) + ' × TVL'],
      ['Calibrated on', B.counts.trading + ' trading', 'set aside, never ranked'],
      ['Held-out miss, 5-fold', times(k.factor), 'naive TVL multiple ' + times(k.naiveFactor)],
      ['Held-out miss, walk-forward', times(w.factor), 'naive ' + times(w.naiveFactor) + ' · newest ' + w.n]
    ];
    $('kpis').innerHTML = tiles.map(function (t) { return '<div class="kpi"><span>' + t[0] + '</span><strong>' + t[1] + '</strong><em>' + t[2] + '</em></div>'; }).join('');
    $('tagline').textContent = 'Protocols that record no token, ranked by what this snapshot’s trading protocols imply they are worth · DefiLlama, ' + B.asOf;
  }
  function drawSelfCheck() { // does the page's own ranking equal the board.json main.ts wrote?
    var file = window.RADAR_BOARD, ok = !!file && file.length === B.rows.length, i;
    for (i = 0; ok && i < file.length; i++) ok = file[i][0] === B.rows[i].p.slug && file[i][1] === B.rows[i].score.implied;
    $('selfcheck').className = 'check ' + (ok ? 'ok' : 'bad');
    $('selfcheck').innerHTML = ok ? '<b>✓ page = board.json</b> all ' + B.rows.length + ' ranks and values recomputed here equal the file' : '<b>✗ page ≠ board.json</b> the file and this page disagree';
  }
  function drawControls() {
    var cats = {}, chains = {};
    B.rows.forEach(function (r) { cats[r.p.category || 'Uncategorised'] = 1; r.p.chains.forEach(function (c) { chains[c] = (chains[c] || 0) + 1; }); });
    $('segments').innerHTML = SEGS.map(function (s) { return '<button type="button" role="tab" data-seg="' + s[0] + '" aria-selected="' + (state.seg === s[0]) + '">' + s[1] + '</button>'; }).join('');
    $('cat').innerHTML = '<option value="">All categories</option>' + Object.keys(cats).sort().map(function (c) { return '<option' + (c === state.cat ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    $('chain').innerHTML = '<option value="">All chains</option>' + Object.keys(chains).sort(function (a, b) { return chains[b] - chains[a] || (a < b ? -1 : 1); }).map(function (c) { return '<option value="' + esc(c) + '"' + (c === state.chain ? ' selected' : '') + '>' + esc(c) + ' (' + chains[c] + ')</option>'; }).join('');
    $('q').value = state.q;
  }
  function drawTable() {
    var v = visible();
    var head = '<thead><tr>' + v.cols.map(function (c) {
      var on = c.k === v.sortKey;
      return '<th class="' + (c.num ? 'n' : '') + (c.x ? ' x' : '') + '" aria-sort="' + (on ? (v.dir > 0 ? 'ascending' : 'descending') : 'none') + '"><button type="button" data-sort="' + c.k + '">' + c.t + (on ? (v.dir > 0 ? ' ▲' : ' ▼') : '') + '</button></th>';
    }).join('') + '</tr></thead>';
    var body = v.rows.map(function (r) {
      return '<tr data-slug="' + r.p.slug + '" class="' + (r.p.slug === state.p ? 'on' : '') + '" tabindex="0">' + v.cols.map(function (c) { return '<td class="' + (c.num ? 'n' : '') + (c.x ? ' x' : '') + '">' + c.c(r) + '</td>'; }).join('') + '</tr>';
    }).join('');
    $('table').innerHTML = head + '<tbody>' + (body || '<tr><td class="empty" colspan="' + v.cols.length + '">No protocol matches these filters.</td></tr>') + '</tbody>';
    var what = state.seg === 'trading' ? ' trading protocols (calibration set, not ranked)' : ' pre-token protocols';
    $('count').textContent = v.rows.length + ' of ' + (state.seg === 'trading' ? B.calibration.length : B.rows.length) + what;
  }

  function modelPanel() {
    var m = B.model, k = B.tests.kfold, w = B.tests.walk, b = m.beta, abl = {};
    B.tests.ablation.forEach(function (a) { abl[a.term] = (a.without - k.model) / k.model * 100; });
    var terms = [['size', 'log₁₀ TVL, centred on $100M'], ['growth', '7-day TVL change, capped −30% / +60%'], ['maturity', 'log of years tracked with no token, capped at 6'],
      ['breadth', 'log of chains counted'], ['category', 'median residual of its trading peers, shrunk to 0 when peers are few']];
    var checks = [
      ['Every watchlist slug is on the board', B.rows.filter(function (r) { return r.watch; }).length === B.counts.watchlist],
      ['Ranks run 1 to ' + B.rows.length + ' and value never rises with rank', B.rows.every(function (r, i) { return r.rank === i + 1 && (i === 0 || r.score.implied <= B.rows[i - 1].score.implied); })],
      ['No ranked row records a token; no trading row is ranked', B.rows.every(function (r) { return T.recordsNoToken(r.p); })],
      ['Beats the naive TVL multiple held-out, both tests', k.model < k.naive && w.model < w.naive],
      ['Every row has 6 costed farm steps of 20 to 600 characters', B.rows.every(function (r) { return r.plan.steps.length === 6 && r.plan.steps.every(function (s) { return s.length >= 20 && s.length <= 600; }); })]
    ];
    return '<h2>The value model</h2>' +
      '<p class="lead">Fitted on the <b>' + m.n + '</b> protocols in this snapshot whose token already trades, then applied to the ones that record none. No protocol is named anywhere in the code.</p>' +
      '<p class="formula">log₁₀ value = ' + b[0].toFixed(2) + ' + ' + b[1].toFixed(2) + '·size ' + sign(b[2]) + '·growth ' + sign(b[3]) + '·maturity ' + sign(b[4]) + '·breadth + category</p>' +
      '<dl class="terms">' + terms.map(function (t) {
        return '<dt>' + t[0] + '</dt><dd>' + t[1] + '</dd><dd class="n ' + (abl[t[0]] > 0 ? 'pos' : 'neg') + '" title="5-fold miss without this term">' + (abl[t[0]] >= 0 ? '+' : '') + abl[t[0]].toFixed(1) + '%</dd>';
      }).join('') + '</dl><p class="note">Right column: how much worse the 5-fold miss gets when that term is switched off and the model refitted.</p>' +
      '<h3>Tested held-out, twice</h3><table class="mini"><tr><th>Test</th><th class="n">Model</th><th class="n">Naive</th><th class="n">Gain</th></tr>' +
      '<tr><td>5-fold, folds dealt by slug hash (n=' + k.n + ')</td><td class="n">' + times(k.factor) + '</td><td class="n">' + times(k.naiveFactor) + '</td><td class="n pos">' + (k.gain * 100).toFixed(0) + '%</td></tr>' +
      '<tr><td>Walk-forward: fit on older, test on those listed since ' + w.cutoff + ' (n=' + w.n + ')</td><td class="n">' + times(w.factor) + '</td><td class="n">' + times(w.naiveFactor) + '</td><td class="n pos">' + (w.gain * 100).toFixed(0) + '%</td></tr></table>' +
      '<p class="note">The figure is the median miss as a multiple of the real market cap. Naive is TVL times one fitted constant.</p>' +
      '<h3>The radar checks itself</h3><ul class="checks">' + checks.map(function (c) { return '<li class="' + (c[1] ? 'ok' : 'bad') + '">' + (c[1] ? '✓' : '✗') + ' ' + c[0] + '</li>'; }).join('') + '</ul>' +
      '<p class="note">' + B.counts.tokenNoCap + ' protocols record a token but no market cap: they neither calibrate nor rank. Select any row for its value breakdown and costed farm plan.</p>';
  }
  function sign(x) { return (x < 0 ? '− ' : '+ ') + Math.abs(x).toFixed(2); }

  function detailPanel(r) {
    var s = r.score, p = r.p, pl = r.plan, band = B.tests.kfold.factor, peers = B.calibration.filter(function (c) { return c.p.category === p.category; }).length;
    var steps = [
      ['Size', 'TVL ' + usd(p.tvl_usd), usd(s.base)],
      ['Category', esc(p.category || 'Uncategorised') + ' · ' + peers + ' trading peer' + (peers === 1 ? '' : 's'), times(s.mult.category)],
      ['Growth', '7-day TVL change ' + pct(p.change_7d), times(s.mult.growth)],
      ['Maturity', s.ageFilled ? 'no listing date: median age used' : years(s.age) + ' tracked, no token recorded', times(s.mult.maturity)],
      ['Breadth', p.chains.length + ' chain' + (p.chains.length === 1 ? '' : 's'), times(s.mult.breadth)]
    ];
    return '<button type="button" class="close" data-close="1" aria-label="Close detail">← model</button>' +
      '<h2>' + esc(p.name) + '</h2><p class="lead">Rank <b>#' + r.rank + '</b> of ' + B.rows.length + ' · ' + (r.watch ? '<i class="tag w">watchlist</i>' : '<i class="tag e">early</i>') + ' · records no token · listed ' + (p.listed_at || 'date not reported') + '</p>' +
      '<div class="two"><div><div class="big"><strong>' + usd(s.implied) + '</strong><span>implied value · held-out range ' + usd(s.implied / band) + ' to ' + usd(s.implied * band) + '</span></div>' +
      '<h3>How the figure is built</h3><table class="mini">' + steps.map(function (x, i) { return '<tr><td>' + (i ? '× ' : '') + x[0] + '</td><td class="dim">' + x[1] + '</td><td class="n">' + x[2] + '</td></tr>'; }).join('') +
      '<tr class="total"><td>= Implied value</td><td class="dim">' + (s.implied / p.tvl_usd).toFixed(2) + ' × TVL</td><td class="n">' + usd(s.implied) + '</td></tr></table>' +
      '<h3>What the plan costs</h3>' +
      '<div class="costs"><div><span>Stake</span><b>' + dollars(pl.stake) + '</b></div><div><span>Fees, ' + pl.txs + ' tx</span><b>' + dollars(pl.gasTotal) + '</b></div><div><span>Yield forgone</span><b>' + dollars(pl.carry) + '</b></div><div class="sum"><span>Plan cost</span><b>' + dollars(pl.cost) + '</b></div></div>' +
      '<p class="note">Chains: ' + esc(p.chains.join(', ')) + '. Fees assume ~$' + pl.gas + ' per transaction on ' + esc(pl.chain) + '; yield forgone is the stake at ' + (T.CARRY * 100).toFixed(1) + '% a year for ' + pl.weeks + ' weeks.</p></div>' +
      '<div><h3 class="first">Farm plan · ' + pl.weeks + ' weeks on ' + esc(pl.chain) + '</h3><ol class="steps">' + pl.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol></div></div>';
  }

  function drawSide() {
    var r = state.p && B.rows.filter(function (x) { return x.p.slug === state.p; })[0];
    $('side').innerHTML = r ? detailPanel(r) : modelPanel();
    document.body.classList.toggle('detail', !!r); // the panel widens and the table drops its secondary columns
    $('side').scrollTop = 0;
  }
  function draw() { drawControls(); drawTable(); drawSide(); writeHash(); }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-seg],[data-sort],[data-slug],[data-close],#reset');
    if (!t) return;
    if (t.dataset.seg) { state.seg = t.dataset.seg; state.sort = 'rank'; state.dir = 1; if (state.seg === 'trading') state.p = ''; }
    else if (t.dataset.sort) { if (state.sort === t.dataset.sort) state.dir = -state.dir; else { state.sort = t.dataset.sort; state.dir = t.dataset.sort === 'name' || t.dataset.sort === 'cat' || t.dataset.sort === 'rank' ? 1 : -1; } }
    else if (t.dataset.slug) { if (state.seg !== 'trading') state.p = state.p === t.dataset.slug ? '' : t.dataset.slug; }
    else if (t.dataset.close) state.p = '';
    else state = { seg: 'all', q: '', cat: '', chain: '', sort: 'rank', dir: 1, p: '' };
    draw();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.slug) e.target.click();
    if (e.key === 'Escape' && state.p) { state.p = ''; draw(); }
  });
  $('q').addEventListener('input', function () { state.q = this.value; drawTable(); writeHash(); });
  $('cat').addEventListener('change', function () { state.cat = this.value; draw(); });
  $('chain').addEventListener('change', function () { state.chain = this.value; draw(); });
  window.addEventListener('hashchange', function () { readHash(); draw(); });

  readHash(); drawKpis(); drawSelfCheck(); draw();
})();
