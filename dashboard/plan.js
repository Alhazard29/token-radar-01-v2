/* Token Radar v2: the farm planner and the board builder.
   Loaded after model.js, by main.ts in Node and by the page in the browser. farmPlan turns one snapshot
   row into costed, timed steps; buildBoard fits the model, tests it held-out and ranks the rows.
   The snapshot carries no gas price and no yield, so GAS and CARRY below are the planner's stated
   assumptions; everything else (stake, weeks, chain, stop rule) is computed from the row itself. */
(function (root) {
  'use strict';
  var T = root.TokenRadar;

  /* assumed network fee per transaction, in dollars, by chain class */
  var GAS = { l1: 4, btc: 2.5, bnb: 0.1, fast: 0.01, l2: 0.05, other: 0.1 };
  var FAST = ['Solana', 'Sui', 'Stellar', 'Ripple', 'Sei', 'Aptos', 'Monad', 'Hyperliquid L1'];
  var L2 = ['Base', 'Arbitrum', 'Optimism', 'Unichain', 'Linea', 'Scroll', 'Ink', 'Mantle', 'World Chain',
    'Katana', 'BOB', 'Starknet', 'Polygon', 'Hemi', 'Plasma', 'Robinhood Chain', 'Arc', 'TAC', 'Etherlink'];
  var CARRY = 0.045; // what the stake would earn parked in T-bills, per year: the cost of tying it up

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

  /* one playbook per family of categories: what to open, what to repeat, how many transactions */
  var FAMILY = {
    vault: { cats: ['Risk Curators', 'Onchain Capital Allocator', 'Yield Aggregator', 'Liquidity Manager', 'Yield', 'Leveraged Farming', 'Farm'],
      open: 'Deposit {stake} of stablecoins into the largest vault {name} runs on {chain}, in two tranches a week apart so a snapshot taken on either date finds a balance',
      keep: 'Every 2 weeks claim and re-deposit the vault yield and move 20% of the position into a second {name} vault, so the address shows several strategies rather than one idle deposit', txWeek: 1 },
    dex: { cats: ['Dexs'],
      open: 'Add {stake} as liquidity to the deepest stable or blue-chip pair on {name} on {chain}, split evenly between the two assets, and keep the position in range',
      keep: 'Swap about {tenth} through {name} twice a week, alternating direction, and re-centre the liquidity range whenever price leaves it: volume and fees paid are what a DEX usually counts', txWeek: 3 },
    lend: { cats: ['Lending', 'CDP', 'CDP Manager', 'Collateral Markets', 'Uncollateralized Lending', 'Dual-Token Stablecoin', 'Stablecoin Wrapper'],
      open: 'Supply {stake} of collateral to {name} on {chain} and borrow against it at no more than 35% loan-to-value, far from liquidation, so the address counts as both lender and borrower',
      keep: 'Each week repay about {tenth} of the debt and re-borrow it a day later, and top up collateral if the health factor drops below 2.0: steady two-sided use, never a looped position', txWeek: 2 },
    perp: { cats: ['Derivatives', 'Options', 'Prediction Market', 'Interest Rate Derivatives'],
      open: 'Fund a {name} account on {chain} with {stake} and open a first position of about {tenth} at 2x leverage or less, with a stop set, closed inside 48 hours',
      keep: 'Trade 3 times a week in sizes near {tenth}, on different markets, holding at least an hour each: aim for traded volume of roughly 10x the stake over the plan while keeping fees and losses under 3% of it', txWeek: 6 },
    rwa: { cats: ['RWA', 'Basis Trading', 'CeDeFi', 'Anchor BTC', 'Decentralized BTC', 'OTC Marketplace', 'Payments', 'Crypto Card Issuer'],
      open: 'Complete any onboarding {name} asks for (allow 1 to 3 days if it checks identity), then mint or buy {stake} of its yield-bearing asset on {chain} and hold it in your own wallet',
      keep: 'Once a month put half of the holding to work in a market that accepts the {name} asset as collateral or liquidity, and bring it back two weeks later: holding counts, but use counts for more', txWeek: 0.5 },
    stake: { cats: ['Staking Pool', 'Restaking', 'Insurance', 'Governance Incentives', 'Indexes'],
      open: 'Stake or deposit {stake} with {name} on {chain}, choosing the longest term that still lets you leave within the plan, and keep the receipt token in the same wallet',
      keep: 'Every 2 weeks claim what has accrued and add it back, and vote or delegate whenever {name} opens a proposal: an address that only deposits once is the easiest one to filter out', txWeek: 0.5 },
    chain: { cats: ['Chain', 'Cross Chain Bridge'],
      open: 'Bridge {stake} to {name} through its own bridge from {chain}, and spread it over a DEX position, a lending deposit and one native app so the address is active in three places',
      keep: 'Make 4 transactions a week across those apps, on at least 2 different days, and bridge a small amount in or out once a month: activity in distinct weeks is the usual yardstick for a chain', txWeek: 4 }
  };
  function familyOf(p) {
    for (var k in FAMILY) if (FAMILY[k].cats.indexOf(p.category) >= 0) return k;
    return 'vault';
  }
  function money(n) { // cents below $10, so a 28-cent fee bill is not shown as $0
    return n < 10 ? '$' + n.toFixed(2) : '$' + Math.round(n).toLocaleString('en-US');
  }
  function fill(s, v) { return s.replace(/\{(\w+)\}/g, function (_, k) { return v[k]; }); }

  /* farmPlan: stake, weeks and cost follow from the row.
     stake  = 0.002% of TVL, held between $250 and $5,000: a small fish in a big pool, a careful one in a small pool
     weeks  = 26 less 4 per year tracked, between 8 and 26: the longer it has run with no token, the shorter the wait budgeted */
  function farmPlan(p, score) {
    var fam = familyOf(p), book = FAMILY[fam], chain = cheapestChain(p), gas = gasOf(chain);
    var stake = Math.round(Math.min(5000, Math.max(250, p.tvl_usd * 2e-5)) / 50) * 50;
    var age = score.age == null ? null : score.age;
    var weeks = Math.round(Math.min(26, Math.max(8, 26 - 4 * (age == null ? 2 : age))));
    var txs = Math.ceil(4 + book.txWeek * weeks + (p.chains.length > 1 ? 4 : 0));
    var gasTotal = txs * gas, carry = stake * CARRY * weeks / 52, cost = gasTotal + carry;
    var chg = p.change_7d == null ? null : p.change_7d;
    var v = { name: p.name, chain: chain, stake: money(stake), tenth: money(stake / 10) };
    var second = p.chains.filter(function (c) { return c !== chain; })[0];
    var steps = [
      'Set up (day 1, about 30 minutes): use a fresh wallet on ' + chain + ' and fund it with ' + money(stake) + ' of working capital plus ' + money(Math.max(5, gasTotal * 1.5)) + ' for fees. ' + p.name + ' records no token in this snapshot, so nothing is promised: size the stake as money you can leave for ' + weeks + ' weeks.',
      fill(book.open, v) + '. Cost: about ' + money(gas * 2) + ' in fees at ~$' + gas + ' per transaction on ' + chain + '. Time: week 1.',
      fill(book.keep, v) + '. Budget ' + Math.ceil(book.txWeek * weeks) + ' transactions over weeks 2 to ' + weeks + ', about ' + money(Math.ceil(book.txWeek * weeks) * gas) + ' in fees.',
      second
        ? 'Weeks 3 to 4: repeat a quarter-size position (' + money(stake / 4) + ') on ' + second + ', one of the ' + p.chains.length + ' chains ' + p.name + ' counts TVL on, about ' + money(4 * gasOf(second)) + ' for 4 transactions: activity on more than one deployment is cheap to add and often scored separately.'
        : 'Weeks 3 to 4: ' + p.name + ' counts TVL on ' + chain + ' alone, so add depth instead of breadth: split the position across 2 products or pools there (2 extra transactions, about ' + money(2 * gas) + ') and keep both alive to the end.',
      'Check every Monday (10 minutes): TVL was ' + T.usd(p.tvl_usd) + (chg == null ? ' with no 7-day change reported' : ' and moved ' + (chg >= 0 ? '+' : '') + chg.toFixed(1) + '% over the last 7 days') + '. Stop rule: if TVL falls more than 30% from that figure, or withdrawals are paused, pull the whole stake out that day and write the plan off at its fees.',
      'Exit at week ' + weeks + ' or at a token announcement, whichever comes first. Whole-plan cost: ' + money(gasTotal) + ' fees (' + txs + ' transactions) + ' + money(carry) + ' of yield forgone on ' + money(stake) + ' at ' + (CARRY * 100).toFixed(1) + '% a year = ' + money(cost) + ', against a model-implied value of ' + T.usd(score.implied) + ' for the whole protocol.'
    ];
    return { family: fam, chain: chain, gas: gas, stake: stake, weeks: weeks, txs: txs, gasTotal: gasTotal, carry: carry, cost: cost, steps: steps };
  }

  /* buildBoard: the one function both readers call. Trading protocols calibrate and are set aside;
     pre-token protocols (the whole watchlist, plus every other own-standing one below the floor) are ranked. */
  function buildBoard(snap) {
    var asOf = snap.as_of, wl = {}, i;
    for (i = 0; i < snap.watchlist.length; i++) wl[snap.watchlist[i]] = true;
    var trading = snap.protocols.filter(T.isTrading);
    var model = T.fitModel(trading, asOf);
    var rows = snap.protocols.filter(function (p) {
      return wl[p.slug] || (T.recordsNoToken(p) && T.isOwnProtocol(p));
    }).map(function (p) {
      var s = T.scoreProtocol(p, model, asOf);
      return { p: p, watch: !!wl[p.slug], score: s, plan: farmPlan(p, s) };
    });
    rows.sort(function (a, b) { // value first; slug settles a tie so two runs agree byte for byte
      return b.score.implied - a.score.implied || (a.p.slug < b.p.slug ? -1 : 1);
    });
    for (i = 0; i < rows.length; i++) rows[i].rank = i + 1;
    var ablation = T.TERMS.concat('category').map(function (t) {
      return { term: t, without: T.kFold(trading, asOf, t).model };
    });
    var calibration = trading.map(function (p) {
      var s = T.scoreProtocol(p, model, asOf);
      return { p: p, fitted: s.implied, ratio: s.implied / p.mcap_usd };
    }).sort(function (a, b) { return b.p.mcap_usd - a.p.mcap_usd; });
    return {
      asOf: asOf, rows: rows, model: model, calibration: calibration,
      tests: { kfold: T.kFold(trading, asOf), walk: T.walkForward(trading, asOf), ablation: ablation },
      counts: { protocols: snap.protocols.length, trading: trading.length, watchlist: snap.watchlist.length,
        early: rows.filter(function (r) { return !r.watch; }).length,
        tokenNoCap: snap.protocols.filter(function (p) { return !T.recordsNoToken(p) && !T.isTrading(p); }).length }
    };
  }

  T.farmPlan = farmPlan; T.buildBoard = buildBoard; T.gasOf = gasOf; T.CARRY = CARRY;
})(typeof globalThis !== 'undefined' ? globalThis : this);
