# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Wisnuverse/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Wisnuverse/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed snapshot of every protocol DefiLlama tracks, finds the ones that record no token, and ranks them by what their launch would be worth — priced off the snapshot's own 128 live tokens. 198 native pre-token rows, 40/40 watchlist coverage, a value band and three named live comparables per row, seven-step mechanism-specific farm plans with costs, times and an economics summary, and a sortable, filterable dashboard with a per-protocol model breakdown and a research note.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

Node 22 or later, standard library only, no network. The program writes `board.json`, `data.js`, the dashboard, the screenshots and `dossier.json` into the output directory. Two runs write identical bytes.

## How it works

- **Value model** — each protocol's implied value comes from the snapshot's own live tokens: a per-category median mcap/TVL multiple (shrunk toward the global median, clamped to the live range) blended geometrically with a log-log size curve fitted to the same 128 tokens, then adjusted for 7-day growth, age and chain count. A category with fewer than 3 traded peers does not price itself — it falls back to the snapshot-wide median, and the detail view says so. Every row carries a value band (±1 median leave-one-out error) and its three nearest live comparables by name. Validation is a leave-one-out backtest over the 128 live tokens: median error ×3.75, 25% of predictions within 2× of the real market cap (in-sample: 27%).
- **Coverage** — 342 records with no token were reviewed: 289 rankable → 198 ranked (40 watchlist protocols, 138 early ones below the $50M floor, 20 more above it), 91 wrapped, staked, bridged or exchange products set aside in their own view with the reason, 53 excluded (exchange category or versioned names).
- **Farm plans** — seven mechanism-specific steps per protocol (the category's action, a category-specific weekly action, a second-market position, the hold, the exit, the safe claim), each with an explicit cost and time, plus a risk step where the category calls for one and an economics summary (capital, est. gas, hold, setup time).
- **Screenshots** — the four dashboard screenshots are stored here as base64 text (`screenshots/*.jpg.b64`) and decoded to JPEG by `main.ts` at run time, so the repository stays text-only.

---

<sub>Entered on [make.fun](https://make.fun/?ref=56ecrj42&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
