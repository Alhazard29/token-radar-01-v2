# token-radar-01-v2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Alhazard29/token-radar-01-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Alhazard29/token-radar-01-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar whose value model is fitted, not asserted. It takes the 128 protocols in the sealed DefiLlama snapshot whose token already trades, regresses their market cap on TVL, 7-day growth, years tracked and chain count with a shrunken per-category offset, tests that fit held-out twice (5-fold and walk-forward) against a naive TVL multiple, and only then applies it to the 198 protocols that record no token: all 40 on the watchlist plus 158 early ones below the floor. Every row gets a six-step farm plan with a stake, a fee bill, the yield forgone and a duration computed from its own figures. The dashboard is a static page with a KPI strip, a sortable and filterable board, a detail view per protocol, and a panel where the radar checks itself, including that the page's recomputed ranking equals the `board.json` handed in.

- `main.ts` reads the snapshot and writes `board.json`, `data.js`, the dashboard, the screenshots and `dossier.json`.
- `dashboard/model.js` is the value model and its held-out tests; `dashboard/plan.js` is the farm planner and the board builder. Node and the browser run the same two files.
- `dashboard/app.js`, `app.css`, `index.html` are the page. No framework, no network.
- `vendor/makefun-board.ts` is make.fun's dossier library, unchanged.

Implied value is this entry's own model claim. It does not say a token will be issued. Gas per transaction and the 4.5% carry rate in the farm plans are stated planner assumptions; every other figure comes from the snapshot.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
```

Then open `out/dashboard/index.html`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=4zhb3zrh&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
