/* Token Radar v3: the page. It draws what model.js and plan.js return for the snapshot in data.js and
   holds no number of its own. State lives in the URL hash (seg, q, cat, chain, sort, dir, p), so any
   view can be linked and shot. */
(function () {
  'use strict';
  var T = window.TokenRadar, snap = window.RADAR_SNAPSHOT, B = T.buildBoard(snap, window.RADAR_TESTS), tests = B.tests;
  var $ = (id) => document.getElementById(id);
  var esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  var usd = T.usd, money = T.money, pct = T.pct;
  var times = (n) => '×' + (n >= 10 ? n.toFixed(0) : n.toFixed(n >= 1 ? 1 : 2));
  var signed = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
  var cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- the row sets ---------- */
  var asideRows = B.aside.map((a) => ({ p: a.p, why: a.why })).sort((a, b) => b.p.tvl_usd - a.p.tvl_usd);
  var SEGS = [
    ['pre', 'All pre-token', B.rows],
    ['watch', 'Watchlist', B.rows.filter((r) => r.watch)],
    ['early', 'Early finds', B.rows.filter((r) => !r.watch)],
    ['farm', 'Worth farming', B.rows.filter((r) => r.plan.pick.verdict !== 'watch')],
    ['trading', 'Already trading', B.calibration.map((c, i) => ({ p: c.p, rank: i + 1, fitted: c.fitted, ratio: c.ratio }))],
    ['aside', 'Set aside', asideRows]
  ];
  var lo = Math.log10(Math.min.apply(null, B.rows.map((r) => r.score.lo80))), hi = Math.log10(Math.max.apply(null, B.rows.map((r) => r.score.hi80)));
  var at = (v) => ((Math.log10(v) - lo) / (hi - lo) * 100).toFixed(1);
  var yrs = (r) => r.score.age == null ? '<span class="dim">no date</span>' : r.score.age.toFixed(1);
  var chg = (p) => p.change_7d == null ? '<span class="dim">n/a</span>' : '<span class="' + (p.change_7d >= 0 ? 'up' : 'down') + '">' + signed(p.change_7d / 100) + '</span>';
  var badge = (v) => '<b class="v ' + v + '">' + T.VERDICT[v] + '</b>';
  var nameCell = (r) => '<b>' + esc(r.p.name) + '</b>' + (r.watch ? '<em class="wl" title="On the house watchlist">WL</em>' : '');

  /* a column is [key, heading, sort value, cell html, tooltip]; text columns have no cell function */
  var PRE = [
    ['rank', '#', (r) => r.rank],
    ['name', 'Protocol', (r) => r.p.name.toLowerCase(), nameCell],
    ['cat', 'Category', (r) => r.p.category || ''],
    ['tvl', 'TVL', (r) => r.p.tvl_usd, (r) => usd(r.p.tvl_usd)],
    ['chg', '7d', (r) => r.p.change_7d == null ? -1e9 : r.p.change_7d, (r) => chg(r.p)],
    ['age', 'Yrs no token', (r) => r.score.age == null ? -1 : r.score.age, yrs, 'Years tracked while recording no token'],
    ['implied', 'Implied value', (r) => r.score.implied, (r) => '<b class="val">' + usd(r.score.implied) + '</b>', 'What the market would pay for its token, by the fitted model'],
    ['range', '50% · 80% range', (r) => r.score.hi50, (r) => '<span class="rng" title="50%: ' + usd(r.score.lo50) + ' to ' + usd(r.score.hi50) + ' · 80%: ' + usd(r.score.lo80) + ' to ' + usd(r.score.hi80) + '"><i class="w80" style="left:' + at(r.score.lo80) + '%;right:' + (100 - at(r.score.hi80)) + '%"></i><i class="w50" style="left:' + at(r.score.lo50) + '%;right:' + (100 - at(r.score.hi50)) + '%"></i><i class="pt" style="left:' + at(r.score.implied) + '%"></i></span>', 'Conformal band from the leave-one-out misses, log scale'],
    ['odds', 'Token odds', (r) => r.score.odds, (r) => '<span class="odds"><i style="width:' + Math.round(r.score.odds * 100) + '%"></i></span>' + Math.round(r.score.odds * 100) + '%', 'Share of comparable peers that already record a token'],
    ['weighted', 'Odds × value', (r) => r.score.weighted, (r) => usd(r.score.weighted), 'Token odds times implied value'],
    ['farm', 'Farm · stake · cost · weeks', (r) => -r.plan.pick.breakEven, (r) => badge(r.plan.pick.verdict) + ' <span class="dim">' + money(r.plan.pick.stake) + ' · $' + Math.round(r.plan.pick.cost) + ' · ' + r.plan.weeks + 'w</span>', 'Verdict at the recommended stake, its whole-plan cost and its length']
  ];
  var COLS = {
    pre: PRE, watch: PRE, early: PRE, farm: PRE,
    trading: [
      ['rank', '#', (r) => r.rank],
      ['name', 'Protocol (token trades)', (r) => r.p.name.toLowerCase(), (r) => '<b>' + esc(r.p.name) + '</b> <span class="dim">' + esc(r.p.symbol || '') + '</span>'],
      ['cat', 'Category', (r) => r.p.category || ''],
      ['tvl', 'TVL', (r) => r.p.tvl_usd, (r) => usd(r.p.tvl_usd)],
      ['mcap', 'Market cap', (r) => r.p.mcap_usd, (r) => '<b class="val">' + usd(r.p.mcap_usd) + '</b>'],
      ['fitted', 'Model says', (r) => r.fitted, (r) => usd(r.fitted)],
      ['ratio', 'Model ÷ actual', (r) => r.ratio, (r) => times(r.ratio)]
    ],
    aside: [
      ['name', 'Protocol', (r) => r.p.name.toLowerCase(), (r) => '<b>' + esc(r.p.name) + '</b>'],
      ['cat', 'Category', (r) => r.p.category || ''],
      ['tvl', 'TVL', (r) => r.p.tvl_usd, (r) => usd(r.p.tvl_usd)],
      ['token', 'Token', (r) => T.recordsNoToken(r.p) ? 0 : 1, (r) => T.recordsNoToken(r.p) ? 'records no token' : 'records a token' + (r.p.symbol ? ' (' + esc(r.p.symbol) + ')' : '')],
      ['why', 'Why it is not ranked', (r) => r.why]
    ]
  };

  /* ---------- state ---------- */
  var DEF = { seg: 'pre', q: '', cat: '', chain: '', sort: '', dir: '', p: '' }, S;
  function load() {
    var h = new URLSearchParams(location.hash.slice(1));
    S = {};
    for (var k in DEF) S[k] = h.get(k) || DEF[k];
    if (!COLS[S.seg]) S.seg = 'pre';
  }
  function save() {
    var h = new URLSearchParams();
    for (var k in DEF) if (S[k] !== DEF[k]) h.set(k, S[k]);
    history.replaceState(null, '', '#' + h.toString());
    draw();
  }
  var segRows = () => SEGS.filter((s) => s[0] === S.seg)[0][2];
  function visible() {
    var q = S.q.trim().toLowerCase(), cols = COLS[S.seg], col = cols.filter((c) => c[0] === S.sort)[0] || cols[S.seg === 'aside' ? 2 : 0];
    var dir = S.dir ? +S.dir : (col[0] === 'rank' || col[0] === 'name' || col[0] === 'cat' ? 1 : -1);
    var rows = segRows().filter((r) => (!q || (r.p.name + ' ' + r.p.slug).toLowerCase().indexOf(q) >= 0) && (!S.cat || r.p.category === S.cat) && (!S.chain || r.p.chains.indexOf(S.chain) >= 0));
    rows.sort((a, b) => { var x = col[2](a), y = col[2](b); return (x < y ? -1 : x > y ? 1 : a.p.slug < b.p.slug ? -1 : 1) * dir; });
    return { rows: rows, col: col, dir: dir };
  }

  /* ---------- header: tagline, integrity strip, key figures ---------- */
  function drawHeader() {
    var same = window.RADAR_BOARD.length === B.rows.length && B.rows.every((r, i) => window.RADAR_BOARD[i][0] === r.p.slug && window.RADAR_BOARD[i][1] === r.score.implied);
    $('tagline').textContent = 'Snapshot of ' + B.asOf + ' · ' + B.counts.protocols + ' protocols · ' + B.rows.length + ' that record no token, ranked by a value fitted on the ' + B.counts.trading + ' whose token already trades';
    $('audit').innerHTML = B.audit.concat({ label: 'Page = board.json', ok: same, detail: 'this page re-ran the model and compared all ' + B.rows.length + ' rows' })
      .map((a) => '<span class="' + (a.ok ? 'ok' : 'bad') + '" title="' + esc(a.detail) + '">' + (a.ok ? '✓ ' : '✗ ') + esc(a.label) + '</span>').join('');
    var top = B.rows[0], o = tests.odds, v = B.verdicts;
    $('kpis').innerHTML = [
      ['Ranked, pre-token', B.rows.length, B.counts.watchlist + ' watchlist + ' + B.counts.early + ' early finds; each records no token'],
      ['Top implied value', usd(top.score.implied), esc(top.p.name) + ', 50% range ' + usd(top.score.lo50) + '–' + usd(top.score.hi50)],
      ['Held-out miss', times(tests.loo.factor), 'median, leave-one-out; TVL × a constant misses by ' + times(tests.loo.naiveFactor)],
      ['Token odds skill', signed(o.skill).slice(1), 'Brier ' + o.brier.toFixed(3) + ' vs ' + o.baseBrier.toFixed(3) + ' base rate, 5-fold, ' + o.n + ' peers'],
      ['Worth farming', v.farm + ' + ' + v.marginal, v.farm + ' FARM, ' + v.marginal + ' marginal, ' + v.watch + ' watch only at stated costs']
    ].map((k) => '<div class="kpi"><span>' + k[0] + '</span><b>' + k[1] + '</b><small>' + k[2] + '</small></div>').join('');
  }

  /* ---------- controls and table ---------- */
  function options(el, label, key, values) {
    var n = {};
    segRows().forEach((r) => values(r).forEach((x) => { n[x] = (n[x] || 0) + 1; }));
    el.innerHTML = '<option value="">' + label + '</option>' + Object.keys(n).sort().map((x) => '<option' + (x === S[key] ? ' selected' : '') + ' value="' + esc(x) + '">' + esc(x) + ' (' + n[x] + ')</option>').join('');
  }
  function drawTable() {
    var v = visible(), cols = COLS[S.seg], total = segRows().length;
    $('segments').innerHTML = SEGS.map((s) => '<button data-seg="' + s[0] + '"' + (s[0] === S.seg ? ' class="on"' : '') + '>' + s[1] + ' <i>' + s[2].length + '</i></button>').join('');
    options($('cat'), 'All categories', 'cat', (r) => [r.p.category || '']);
    options($('chain'), 'All chains', 'chain', (r) => r.p.chains);
    if ($('q').value !== S.q) $('q').value = S.q;
    var chips = [['q', 'search'], ['cat', 'category'], ['chain', 'chain']].filter((f) => S[f[0]]).map((f) => '<button class="chip" data-clear="' + f[0] + '">' + f[1] + ': ' + esc(S[f[0]]) + ' ✕</button>').join('');
    $('count').innerHTML = '<b>' + v.rows.length + '</b> of ' + total + ' shown, sorted by ' + v.col[1].toLowerCase() + (v.dir > 0 ? ' ↑' : ' ↓') + chips;
    var head = '<thead><tr>' + cols.map((c) => '<th data-sort="' + c[0] + '"' + (c[4] ? ' title="' + c[4] + '"' : '') + ' class="c-' + c[0] + (c === v.col ? ' on' : '') + '">' + c[1] + (c === v.col ? (v.dir > 0 ? ' ↑' : ' ↓') : '') + '</th>').join('') + '</tr></thead>';
    var body = v.rows.map((r) => '<tr' + (r.score ? ' data-p="' + r.p.slug + '" tabindex="0"' : '') + (r.p.slug === S.p ? ' class="sel"' : '') + '>' +
      cols.map((c) => '<td class="c-' + c[0] + '">' + (c[3] ? c[3](r) : esc(c[2](r))) + '</td>').join('') + '</tr>').join('');
    if (!v.rows.length) body = '<tr><td class="empty" colspan="' + cols.length + '"><b>No protocol matches these filters.</b><br>' + total + ' rows are in “' + SEGS.filter((s) => s[0] === S.seg)[0][1] + '”; the search, category or chain filter excludes them all.<br><button data-clear="all">Clear filters</button></td></tr>';
    $('table').innerHTML = head + '<tbody>' + body + '</tbody>';
  }

  /* ---------- side panel: how the board is made ---------- */
  function table(head, rows) {
    return '<table class="mini"><tr>' + head.map((h) => '<th>' + h + '</th>').join('') + '</tr>' + rows.map((r) => '<tr>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</table>';
  }
  var FIGURE = { size: 'TVL', growth: '7-day TVL change', maturity: 'years it has run', breadth: 'chains', category: 'category family' };
  function modelPanel() {
    var m = B.model, b = tests.band, c = tests.coverage, o = tests.odds, n = B.counts;
    var terms = tests.ablation.map((a) => {
      var j = T.TERMS.indexOf(a.term), kept = a.kfold > 0.01;
      return [cap(a.term), FIGURE[a.term], j < 0 ? 'n/(n+20)' : m.lam[j], a.term === 'size' ? 'base' : '±' + pct(B.swing[a.term]), signed(a.kfold), signed(a.loo),
        '<b class="' + (kept ? 'up">kept' : 'dim">shrunk') + '</b>'];
    });
    return '<h2>How a value is made</h2>' +
      '<p><b>implied value = base(TVL) × family × growth × maturity × breadth</b>, a robust ridge regression of market cap fitted on the ' + n.trading + ' protocols whose token trades (<code>fitValueModel</code>, model.js). They calibrate and are never ranked.</p>' +
      '<h3>Each term must earn its weight held-out</h3>' +
      table(['Term', 'Snapshot figure', 'Penalty λ', 'Moves a row', 'Error without it, 5-fold', 'leave-one-out', ''], terms) +
      '<p class="note">λ is chosen per term by an inner 5-fold test (<code>chooseShrinkage</code>). Growth, maturity and breadth stay in the formula but the held-out rows do not support them, so they are shrunk until they barely move a value: TVL and the family carry it.</p>' +
      '<h3>Three held-out tests of the value</h3>' +
      table(['Test', 'n', 'Median miss', 'TVL × constant', 'Error cut'], [['Leave-one-out', tests.loo], ['5-fold', tests.kfold], ['Walk-forward, newest 40%', tests.walk]].map((t) => [t[0], t[1].n, '<b>' + times(t[1].factor) + '</b>', times(t[1].naiveFactor), signed(-t[1].gain)])) +
      '<p class="note">A miss of ' + times(tests.loo.factor) + ' is large, and the board says so: every row carries a range read off the leave-one-out misses (<code>conformalBand</code>): 50% band ' + times(Math.pow(10, b.lo50)) + ' to ' + times(Math.pow(10, b.hi50)) + ', 80% band ' + times(Math.pow(10, b.lo80)) + ' to ' + times(Math.pow(10, b.hi80)) + '. Built from one half of the misses, the 80% band held ' + pct(c.c80) + ' of the other half and the 50% band ' + pct(c.c50) + '.</p>' +
      '<h3>Token odds, checked against the peers</h3>' +
      '<p>Of ' + n.peers + ' stand-alone protocols, ' + pct(B.oddsModel.base) + ' already record a token. <code>fitOdds</code> is a logistic regression of that on years run, TVL, growth, chains and the category\'s token rate. Held-out (5-fold), sorted into thirds:</p>' +
      table(['Third', 'Odds given', 'Actually record a token', 'n'], o.thirds.map((t, i) => [['Lowest', 'Middle', 'Highest'][i], pct(t.predicted), '<b>' + pct(t.actual) + '</b>', t.n])) +
      '<h3>All ' + n.protocols + ' protocols accounted for</h3>' +
      table(['Group', 'Count', 'Role'], [['Ranked', B.rows.length, 'record no token, stand alone'], ['Already trading', n.trading, 'calibrate the model'], ['Token, no market cap', n.noCap, 'set aside: not pre-token, nothing to fit'], ['Wrapped, staked, bridged, versions', B.aside.length - n.noCap, 'set aside: no token of their own to come']]) +
      '<p class="note">Click a row for its value build-up, odds and a costed farm plan at three stake sizes.</p>';
  }

  /* ---------- side panel: one protocol ---------- */
  function detailPanel(r) {
    var p = r.p, s = r.score, f = r.plan, mult = s.mult;
    var parts = [['base from TVL ' + usd(p.tvl_usd), usd(s.base)], ['family: ' + f.family, times(mult.category)], ['7d ' + (p.change_7d == null ? 'n/a' : signed(p.change_7d / 100)), times(mult.growth)],
      [s.ageFilled ? 'no date: median age' : s.age.toFixed(1) + ' yrs run', times(mult.maturity)], [p.chains.length + ' chain' + (p.chains.length > 1 ? 's' : ''), times(mult.breadth)]];
    return '<button id="close" type="button">✕ Close</button>' +
      '<div class="dhead"><span class="rank">#' + r.rank + '</span><div><h2>' + esc(p.name) + (r.watch ? '<em class="wl">watchlist</em>' : '<em class="early">early find</em>') + '</h2>' +
      '<p><b>Records no token</b> in this snapshot · ' + esc(p.category) + ' · ' + esc(p.chains.slice(0, 4).join(', ')) + (p.chains.length > 4 ? ' +' + (p.chains.length - 4) : '') + '</p></div></div>' +
      '<div class="cards"><div><span>Implied value</span><b class="val">' + usd(s.implied) + '</b><small>50% range ' + usd(s.lo50) + '–' + usd(s.hi50) + '<br>80% range ' + usd(s.lo80) + '–' + usd(s.hi80) + '</small></div>' +
      '<div><span>Token odds</span><b>' + pct(s.odds) + '</b><small>of peers this old, this size, in this category already record one</small></div>' +
      '<div><span>Odds × value</span><b>' + usd(s.weighted) + '</b><small>rank #' + r.rank + '; between #' + r.rankBest + ' and #' + r.rankWorst + ' across its 50% range</small></div></div>' +
      '<div class="build">' + parts.map((x) => '<span><small>' + esc(x[0]) + '</small><b>' + x[1] + '</b></span>').join('<i>×</i>') + '<i>=</i><span><small>implied value</small><b class="val">' + usd(s.implied) + '</b></span></div>' +
      '<h3>Farm plan: ' + f.weeks + ' weeks · ' + f.txs + ' transactions · ' + f.hours.toFixed(1) + ' hours · ' + esc(f.chain) + ' at ~$' + f.gas + ' a transaction</h3>' +
      table(['Stake', 'Fees', 'Yield forgone', 'Total cost', 'Expected take', 'Net per hour', 'Breaks even at', 'Verdict'], f.tiers.map((t) => [
        (t === f.pick ? '<b>▸ ' + money(t.stake) + '</b>' : money(t.stake)) + (t.allowed ? '' : ' <span class="dim">&gt;0.1% of TVL</span>'), money(t.gasTotal), money(t.carry), money(t.cost), money(t.take), money(t.perHour),
        (t.breakEven > 1 ? '&gt;100%' : pct(t.breakEven)) + ' share', badge(t.verdict)])) +
      '<p class="note">Expected take = odds × implied value × ' + pct(T.SHARE) + ' assumed to reach depositors × the stake\'s slice of TVL. The break-even share needs no such assumption: FARM if a ' + pct(T.SHARE) + ' share covers the cost, MARGINAL up to ' + pct(3 * T.SHARE) + ', else WATCH ONLY.</p>' +
      '<ol class="steps">' + f.steps.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ol>';
  }

  function draw() {
    drawTable();
    var r = S.p && B.rows.filter((x) => x.p.slug === S.p)[0];
    document.body.classList.toggle('detail', !!r);
    $('side').innerHTML = r ? detailPanel(r) : modelPanel();
    $('side').scrollTop = 0;
    var sel = r && document.querySelector('tr.sel');
    if (sel) sel.scrollIntoView({ block: 'center' });
  }

  /* ---------- events ---------- */
  document.addEventListener('click', (e) => {
    var t = e.target.closest('[data-seg],[data-sort],[data-clear],[data-p],#close,#reset');
    if (!t) return;
    if (t.dataset.seg) { S.seg = t.dataset.seg; S.sort = S.dir = S.cat = S.chain = ''; }
    else if (t.dataset.sort) { var v = visible(); S.dir = String(t.dataset.sort === v.col[0] ? -v.dir : ''); S.sort = t.dataset.sort; }
    else if (t.dataset.clear) { if (t.dataset.clear === 'all') S.q = S.cat = S.chain = ''; else S[t.dataset.clear] = ''; }
    else if (t.dataset.p) S.p = S.p === t.dataset.p ? '' : t.dataset.p;
    else if (t.id === 'close') S.p = '';
    else { for (var k in DEF) S[k] = DEF[k]; }
    save();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && S.p) { S.p = ''; save(); }
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.p) { S.p = e.target.dataset.p; save(); }
  });
  $('q').addEventListener('input', (e) => { S.q = e.target.value; save(); });
  $('cat').addEventListener('change', (e) => { S.cat = e.target.value; save(); });
  $('chain').addEventListener('change', (e) => { S.chain = e.target.value; save(); });
  window.addEventListener('hashchange', () => { load(); draw(); });

  load(); drawHeader(); draw();
})();
