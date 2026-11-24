# token-radar-01-v2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Alhazard29/token-radar-01-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Alhazard29/token-radar-01-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar v3: a token launch radar that states a value, the odds a token comes, how wrong it may be, and what farming costs.

- **Value, fitted not asserted.** The 128 protocols in the sealed DefiLlama snapshot whose token already trades calibrate a robust ridge regression of market cap on TVL, 7-day growth, years run and chain count, with one offset per category family. Each term's penalty is chosen by an inner 5-fold test, so a term the held-out rows do not support is shrunk until it barely moves a value.
- **Tested three ways.** Leave-one-out, 5-fold and walk-forward, each against a naive TVL multiple, plus an ablation of every term. The figures are on the page.
- **Honest ranges.** Every row carries a 50% and an 80% range read off the leave-one-out misses, and the rank range that follows; the band's coverage is checked on misses it was not built from.
- **Token odds.** A logistic regression on the 442 stand-alone protocols of which ones already record a token (years run, TVL, growth, chains, the category's token rate), tested 5-fold against the base rate. The board shows odds and odds × value.
- **Farm plans sized to capital.** Seven steps a row with fees, yield forgone, weeks and hours, costed at $500, $2,500 and $10,000, each with an expected take, a break-even depositor share and a verdict: FARM, MARGINAL or WATCH ONLY.
- **An integrity strip.** All 758 protocols accounted for, 40/40 watchlist, rank order, no ranked row records a token, and that the page's recomputed ranking equals the `board.json` handed in. `main.ts` refuses to write a board that fails one.

The 198 ranked rows are every protocol that records no token and stands on its own: all 40 on the watchlist plus 158 early finds.

## Files

- `main.ts` reads the snapshot and writes `board.json`, `data.js`, the dashboard, the screenshots and `dossier.json`.
- `dashboard/model.js` is the value model, the token odds and their held-out tests; `dashboard/plan.js` is the farm planner, the test runner and the board builder. Node and the browser run the same two files.
- `dashboard/app.js`, `app.css`, `index.html` are the page. No framework, no network.
- `vendor/makefun-board.ts` is make.fun's dossier library, unchanged.

Implied value is this entry's own model claim. It does not say a token will be issued. Fees per transaction, the 4.5% carry rate and the 5% depositor share in the farm plans are stated planner assumptions; every other figure comes from the snapshot.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
```

Then open `out/dashboard/index.html`. A run takes about 15 seconds: most of it is the leave-one-out tests.

---

<sub>Entered on [make.fun](https://make.fun/?ref=4zhb3zrh&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
