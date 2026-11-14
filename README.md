# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Wisnuverse/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Wisnuverse/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed snapshot of every protocol DefiLlama tracks, finds the ones that record no token, and ranks them by what their launch would be worth — priced off the snapshot's own 128 live tokens. 198 native pre-token rows, 40/40 watchlist coverage, mechanism-specific farm plans with costs and times, and a sortable, filterable dashboard with a per-protocol model breakdown.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

Node 22 or later, standard library only, no network. The program writes `board.json`, `data.js`, the dashboard, the screenshots and `dossier.json` into the output directory. Two runs write identical bytes.

## How it works

- **Value model** — each protocol's implied value comes from the snapshot's own live tokens: a per-category median mcap/TVL multiple (shrunk toward the global median, clamped to the live range) blended geometrically with a log-log size curve fitted to the same 128 tokens, then adjusted for 7-day growth, age and chain count. A backtest against the live tokens is reported in the dashboard.
- **Coverage** — 40 watchlist protocols, 138 early ones below the $50M floor, 20 more above it; 91 wrapped, staked, bridged or exchange products are set aside in their own view with the reason.
- **Farm plans** — six mechanism-specific steps per protocol, each with an explicit cost and time.
- **Screenshots** — the three dashboard screenshots are stored here as base64 text (`screenshots/*.jpg.b64`) and decoded to JPEG by `main.ts` at run time, so the repository stays text-only.

---

<sub>Entered on [make.fun](https://make.fun/?ref=56ecrj42&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
