/* Token Radar v3: the farm planner, the test runner and the board builder.
   Loaded after model.js, by main.ts in Node and by the page in the browser. farmPlan turns one snapshot
   row into costed, timed steps and a verdict at three sizes of capital; runTests is the slow part (every
   held-out test, about 10 seconds) and runs once, in main.ts, which hands its figures to the page in
   data.js; buildBoard fits the value model and the token odds, ranks the rows and audits the result.
   The snapshot carries no gas price, no yield and no airdrop terms, so GAS, CARRY and SHARE below are the
   planner's stated assumptions; every other figure is computed from the row itself. */
(function (root) {
  'use strict';
  var T = root.TokenRadar;

  var GAS = { l1: 4, btc: 2.5, bnb: 0.1, fast: 0.01, l2: 0.05, other: 0.1 }; // assumed fee per transaction, in dollars
  var FAST = ['Solana', 'Sui', 'Stellar', 'Ripple', 'Sei', 'Aptos', 'Monad', 'Hyperliquid L1'];
  var L2 = ['Base', 'Arbitrum', 'Optimism', 'Unichain', 'Linea', 'Scroll', 'Ink', 'Mantle', 'World Chain',
    'Katana', 'BOB', 'Starknet', 'Polygon', 'Hemi', 'Plasma', 'Robinhood Chain', 'Arc', 'TAC', 'Etherlink'];
  var CARRY = 0.045;           // what the stake would earn parked in T-bills, per year: the cost of tying it up
  var SHARE = 0.05;            // share of a new token assumed to reach depositors, pro rata to deposits
  var TIERS = [500, 2500, 10000];
  var MAX_SLICE = 0.001;       // never plan a stake above 0.1% of the protocol's TVL

  function gasOf(chain) {
    if (chain === 'Ethereum') return GAS.l1;
    if (chain === 'Bitcoin') return GAS.btc;
    if (chain === 'Binance') return GAS.bnb;
    if (FAST.indexOf(chain) >= 0) return GAS.fast;
    if (L2.indexOf(chain) >= 0) return GAS.l2;
    return GAS.other;
  }
  function cheapestChain(p) { // first listed wins a tie, so the choice is stable
    var best = p.chains[0] || 'its home chain', i;
    for (i = 1; i < p.chains.length; i++) if (gasOf(p.chains[i]) < gasOf(best)) best = p.chains[i];
    return best;
  }

  /* one playbook per family of categories: what to open, what to repeat, how many transactions a week */
  var PLAYBOOK = {
    vault: { open: 'Deposit {stake} of stablecoins into the largest vault {name} runs on {chain}, in two tranches a week apart so a snapshot taken on either date finds a balance',
      keep: 'Every 2 weeks claim and re-deposit the vault yield and move 20% of the position into a second {name} vault, so the address shows several strategies rather than one idle deposit', txWeek: 1 },
    dex: { open: 'Add {stake} as liquidity to the deepest stable or blue-chip pair on {name} on {chain}, split evenly between the two assets, and keep the position in range',
      keep: 'Swap about {tenth} through {name} twice a week, alternating direction, and re-centre the liquidity range whenever price leaves it: volume and fees paid are what a DEX usually counts', txWeek: 3 },
    lend: { open: 'Supply {stake} of collateral to {name} on {chain} and borrow against it at no more than 35% loan-to-value, far from liquidation, so the address counts as both lender and borrower',
      keep: 'Each week repay about {tenth} of the debt and re-borrow it a day later, and top up collateral if the health factor drops below 2.0: steady two-sided use, never a looped position', txWeek: 2 },
    perp: { open: 'Fund a trading account on {name} ({chain}) with {stake} and open a first position of about {tenth} at 2x leverage or less, with a stop set, closed inside 48 hours',
      keep: 'Trade 3 times a week in sizes near {tenth}, on different markets, holding at least an hour each: aim for traded volume of roughly 10x the stake over the plan while keeping fees and losses under 3% of it', txWeek: 6 },
    rwa: { open: 'Complete any onboarding {name} asks for (allow 1 to 3 days if it checks identity), then mint or buy {stake} of its yield-bearing asset on {chain} and hold it in your own wallet',
      keep: 'Once a month put half of the holding to work in a market that accepts the {name} asset as collateral or liquidity, and bring it back two weeks later: holding counts, but use counts for more', txWeek: 0.5 },
    stake: { open: 'Stake or deposit {stake} with {name} on {chain}, choosing the longest term that still lets you leave within the plan, and keep the receipt token in the same wallet',
      keep: 'Every 2 weeks claim what has accrued and add it back, and vote or delegate whenever {name} opens a proposal: an address that only deposits once is the easiest one to filter out', txWeek: 0.5 },
    chain: { open: 'Bridge {stake} to {name} through its own bridge from {chain}, and spread it over a DEX position, a lending deposit and one native app so the address is active in three places',
      keep: 'Make 4 transactions a week across those apps, on at least 2 different days, and bridge a small amount in or out once a month: activity in distinct weeks is the usual yardstick for a chain', txWeek: 4 }
  };
  var VERDICT = { farm: 'FARM', marginal: 'MARGINAL', watch: 'WATCH ONLY' };
  function money(n) { // cents below $10, so a 28-cent fee bill is not shown as $0
    return (n < 0 ? '-' : '') + (Math.abs(n) < 10 ? '$' + Math.abs(n).toFixed(2) : '$' + Math.round(Math.abs(n)).toLocaleString('en-US'));
  }
  function pct(x) { return (x * 100).toFixed(x < 0.1 ? 1 : 0) + '%'; }
  function fill(s, v) { return s.replace(/\{(\w+)\}/g, function (_, k) { return v[k]; }); }

  /* economics: what one size of stake costs and what it could bring. take = odds x implied value x SHARE x
     the stake's slice of TVL. breakEven is the depositor share at which take equals cost, so a reader who
     doubts SHARE can judge the plan against a share of their own. */
  function economics(p, score, stake, weeks, txs, gas, hours) {
    var gasTotal = txs * gas, carry = stake * CARRY * weeks / 52, cost = gasTotal + carry;
    var slice = stake / (p.tvl_usd + stake), pot = score.odds * score.implied * slice;
    var breakEven = cost / pot, take = pot * SHARE;
    return { stake: stake, gasTotal: gasTotal, carry: carry, cost: cost, take: take, net: take - cost, perHour: (take - cost) / hours,
      breakEven: breakEven, verdict: breakEven <= SHARE ? 'farm' : breakEven <= 3 * SHARE ? 'marginal' : 'watch', allowed: stake <= p.tvl_usd * MAX_SLICE };
  }

  /* farmPlan: weeks, transactions and hours follow from the row; the stake is the tier the verdict supports.
     weeks = 26 less 4 per year it has run, between 8 and 26: the longer with no token, the shorter the wait budgeted */
  function farmPlan(p, score) {
    var fam = T.familyOf(p.category), book = PLAYBOOK[fam], chain = cheapestChain(p), gas = gasOf(chain);
    var weeks = Math.round(Math.min(26, Math.max(8, 26 - 4 * (score.age == null ? 2 : score.age))));
    var txs = Math.ceil(4 + book.txWeek * weeks + (p.chains.length > 1 ? 4 : 0));
    var hours = 0.5 + txs * 5 / 60 + weeks * 10 / 60; // set-up, 5 minutes a transaction, 10 minutes each Monday
    var tiers = TIERS.map(function (s) { return economics(p, score, s, weeks, txs, gas, hours); });
    var ok = tiers.filter(function (t) { return t.allowed; });
    var farms = ok.filter(function (t) { return t.verdict === 'farm'; }), marginal = ok.filter(function (t) { return t.verdict === 'marginal'; });
    var pick = farms.length ? farms[farms.length - 1] : marginal.length ? marginal[0] : tiers[0]; // go large only where it pays
    var chg = p.change_7d, second = p.chains.filter(function (c) { return c !== chain; })[0];
    var v = { name: p.name, chain: chain, stake: money(pick.stake), tenth: money(pick.stake / 10) };
    var steps = [
      'Set up (day 1, about 30 minutes): use a fresh wallet on ' + chain + ' and fund it with ' + money(pick.stake) + ' of working capital plus ' + money(Math.max(5, pick.gasTotal * 1.5)) + ' for fees. ' + p.name + ' records no token in this snapshot, so nothing is promised: size the stake as money you can leave for ' + weeks + ' weeks.',
      fill(book.open, v) + '. Cost: about ' + money(gas * 2) + ' in fees at ~$' + gas + ' per transaction on ' + chain + '. Time: week 1.',
      fill(book.keep, v) + '. Budget ' + Math.ceil(book.txWeek * weeks) + ' transactions over weeks 2 to ' + weeks + ', about ' + money(Math.ceil(book.txWeek * weeks) * gas) + ' in fees.',
      second
        ? 'Weeks 3 to 4: repeat a quarter-size position (' + money(pick.stake / 4) + ') on ' + second + ', one of the ' + p.chains.length + ' chains ' + p.name + ' counts TVL on, about ' + money(4 * gasOf(second)) + ' for 4 transactions: activity on more than one deployment is cheap to add and often scored separately.'
        : 'Weeks 3 to 4: ' + p.name + ' counts TVL on ' + chain + ' alone, so add depth instead of breadth: split the position across 2 products or pools there (2 extra transactions, about ' + money(2 * gas) + ') and keep both alive to the end.',
      'Check every Monday (10 minutes): TVL was ' + T.usd(p.tvl_usd) + (chg == null ? ' with no 7-day change reported' : ' and moved ' + (chg >= 0 ? '+' : '') + chg.toFixed(1) + '% over the last 7 days') + '. Stop rule: if TVL falls more than 30% from that figure, or withdrawals are paused, pull the whole stake out that day and write the plan off at its fees.',
      'Exit at week ' + weeks + ' or at a token announcement, whichever comes first. Whole-plan cost: ' + money(pick.gasTotal) + ' fees (' + txs + ' transactions) + ' + money(pick.carry) + ' of yield forgone on ' + money(pick.stake) + ' at ' + (CARRY * 100).toFixed(1) + '% a year = ' + money(pick.cost) + ', and about ' + hours.toFixed(1) + ' hours of your time.',
      'Verdict at ' + money(pick.stake) + ': ' + VERDICT[pick.verdict] + '. Peers like it record a token ' + pct(score.odds) + ' of the time. If one arrives at the model\'s ' + T.usd(score.implied) + ' and ' + pct(SHARE) + ' of it reaches depositors pro rata, this stake takes about ' + money(pick.take) + ' against ' + money(pick.cost) + ' of cost (' + money(pick.perHour) + ' an hour); it breaks even at a ' + pct(pick.breakEven) + ' depositor share. ' +
        tiers.filter(function (t) { return t !== pick; }).map(function (t) { return 'At ' + money(t.stake) + ': take ' + money(t.take) + ', cost ' + money(t.cost) + ', ' + VERDICT[t.verdict] + (t.allowed ? '' : ' (over 0.1% of TVL, not advised)'); }).join('. ') + '.'
    ];
    return { family: fam, chain: chain, gas: gas, weeks: weeks, txs: txs, hours: hours, tiers: tiers, pick: pick, steps: steps };
  }

  function groups(snap) {
    var trading = snap.protocols.filter(T.isTrading);
    return { trading: trading, peers: snap.protocols.filter(function (p) { return T.asideReason(p) === ''; }) };
  }
  function brief(h) { return { n: h.n, mean: h.mean, naiveMean: h.naiveMean, factor: h.factor, naiveFactor: h.naiveFactor, gain: h.gain, cutoff: h.cutoff }; }

  /* runTests: every held-out figure the page shows. Leave-one-out, 5-fold and walk-forward for the value
     model; each term switched off in turn and the 5-fold and leave-one-out tests repeated; the band read
     off the leave-one-out misses and its coverage on misses it was not built from; the odds model's 5-fold test. */
  function runTests(snap) {
    var g = groups(snap), asOf = snap.as_of;
    var loo = T.heldOut(T.looFolds(g.trading), asOf), kfold = T.heldOut(T.kFolds(g.trading), asOf), walk = T.heldOut(T.walkFolds(g.trading), asOf);
    return {
      loo: brief(loo), kfold: brief(kfold), walk: brief(walk),
      ablation: T.TERMS.concat('category').map(function (term) {
        return { term: term, kfold: T.heldOut(T.kFolds(g.trading), asOf, term).mean / kfold.mean - 1, loo: T.heldOut(T.looFolds(g.trading), asOf, term).mean / loo.mean - 1 };
      }),
      band: T.conformalBand(loo.res), coverage: T.bandCoverage(g.trading, loo.res), odds: T.oddsTest(g.peers, asOf)
    };
  }

  /* buildBoard: the one function both readers call. Trading protocols calibrate and are set aside;
     pre-token protocols (the whole watchlist, plus every other one that stands on its own) are ranked. */
  function buildBoard(snap, tests) {
    var asOf = snap.as_of, wl = {}, i, g = groups(snap);
    for (i = 0; i < snap.watchlist.length; i++) wl[snap.watchlist[i]] = true;
    var model = T.fitValueModel(g.trading, asOf), oddsModel = T.fitOdds(g.peers, asOf), band = tests.band;
    var rows = [], aside = [];
    snap.protocols.forEach(function (p) {
      if (T.isTrading(p)) return;
      var why = T.recordsNoToken(p) ? T.asideReason(p) : 'records a token, but no market cap';
      if (!wl[p.slug] && why) { aside.push({ p: p, why: why }); return; }
      var s = T.valueOf(p, model, asOf);
      s.odds = T.oddsOf(p, oddsModel, asOf);
      s.weighted = Math.round(s.odds * s.implied); // odds-weighted value: what the row is worth before anyone knows if a token comes
      s.lo50 = s.implied * Math.pow(10, band.lo50); s.hi50 = s.implied * Math.pow(10, band.hi50);
      s.lo80 = s.implied * Math.pow(10, band.lo80); s.hi80 = s.implied * Math.pow(10, band.hi80);
      rows.push({ p: p, watch: !!wl[p.slug], score: s, plan: farmPlan(p, s) });
    });
    rows.sort(function (a, b) { // value first; slug settles a tie so two runs agree byte for byte
      return b.score.implied - a.score.implied || (a.p.slug < b.p.slug ? -1 : 1);
    });
    var swing = { growth: 0, maturity: 0, breadth: 0, category: 0, size: 0 };
    rows.forEach(function (r, n) {
      r.rank = n + 1;
      r.rankBest = 1 + rows.filter(function (o) { return o !== r && o.score.implied > r.score.hi50; }).length; // where it would sit at either end of its own 50% band
      r.rankWorst = 1 + rows.filter(function (o) { return o !== r && o.score.implied > r.score.lo50; }).length;
      for (var k in r.score.mult) swing[k] = Math.max(swing[k], Math.abs(r.score.mult[k] - 1));
    });
    var calibration = g.trading.map(function (p) {
      var s = T.valueOf(p, model, asOf);
      return { p: p, fitted: s.implied, ratio: s.implied / p.mcap_usd };
    }).sort(function (a, b) { return b.p.mcap_usd - a.p.mcap_usd || (a.p.slug < b.p.slug ? -1 : 1); });
    var watch = rows.filter(function (r) { return r.watch; }).length, verdicts = { farm: 0, marginal: 0, watch: 0 };
    rows.forEach(function (r) { verdicts[r.plan.pick.verdict]++; });
    var noCap = aside.filter(function (a) { return !T.recordsNoToken(a.p); }).length, total = rows.length + g.trading.length + aside.length;
    /* audit: the integrity strip on the cover. Each line is recomputed wherever buildBoard runs. */
    var audit = [
      [total + '/' + snap.protocols.length + ' accounted for', total === snap.protocols.length, rows.length + ' ranked + ' + g.trading.length + ' trading + ' + noCap + ' token, no cap + ' + (aside.length - noCap) + ' wrapped, staked or bridged'],
      ['Watchlist ' + watch + '/' + snap.watchlist.length, watch === snap.watchlist.length, 'every slug the house lists is ranked'],
      ['Ranks 1–' + rows.length + ' by value', rows.every(function (r, n) { return n === 0 || r.score.implied <= rows[n - 1].score.implied; }), 'the gate\'s order'],
      ['0 ranked record a token', rows.every(function (r) { return T.recordsNoToken(r.p); }), 'trading protocols only calibrate'],
      ['Value beats naive, 3 tests', tests.loo.mean < tests.loo.naiveMean && tests.kfold.mean < tests.kfold.naiveMean && tests.walk.mean < tests.walk.naiveMean, 'leave-one-out, 5-fold and walk-forward'],
      ['Odds beat base rate', tests.odds.brier < tests.odds.baseBrier, 'Brier score, 5-fold'],
      ['80% band holds ' + Math.round(tests.coverage.c80 * 100) + '%', Math.abs(tests.coverage.c80 - 0.8) <= 0.08, 'on misses it was not built from'],
      ['7 costed steps a row', rows.every(function (r) { return r.plan.steps.length === 7 && r.plan.steps.every(function (s) { return s.length >= 20 && s.length <= 600; }); }), 'each 20 to 600 characters']
    ].map(function (a) { return { label: a[0], ok: a[1], detail: a[2] }; });
    return {
      asOf: asOf, rows: rows, aside: aside, model: model, oddsModel: oddsModel, calibration: calibration, tests: tests, swing: swing, audit: audit, verdicts: verdicts,
      counts: { protocols: snap.protocols.length, trading: g.trading.length, peers: g.peers.length, watchlist: snap.watchlist.length, early: rows.length - watch, noCap: noCap }
    };
  }

  T.farmPlan = farmPlan; T.runTests = runTests; T.buildBoard = buildBoard; T.money = money; T.pct = pct;
  T.CARRY = CARRY; T.SHARE = SHARE; T.VERDICT = VERDICT;
})(typeof globalThis !== 'undefined' ? globalThis : this);
