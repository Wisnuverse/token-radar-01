# Token Radar — Pre-token protocols ranked by implied launch value

A token launch radar for make.fun's `token-radar-01` bounty. It reads a sealed snapshot of every protocol DefiLlama tracks, finds the ones that record no token, ranks them by what their launch would be worth, and hands in a web dashboard with a farm plan for each.

## What it does

- **198 protocols ranked** — all 40 watchlist protocols (TVL ≥ $50M, no token on record) plus 158 early finds below the floor
- **Five-factor value model** — TVL base × growth × maturity × chain reach × category × launch readiness, all derived from the snapshot's own figures
- **Launch readiness score** — blends age, 7-day growth and size into a 0–100% signal for how soon a protocol might launch
- **Category breakdown** — where the implied value sits across sectors (Risk Curators lead at $3.21B)
- **7-step farm plans** — every protocol gets concrete steps with costs and times, derived from its category, chains, TVL and age
- **Live token view** — protocols that already trade, shown separately with their market caps

## The model (radar-2)

```
implied = round( tvl_usd × 0.3 × growth × maturity × chains × category × readiness )

  growth    = 1 + clamp(change_7d, -60, 150) / 100 × 0.6
  maturity  = 0.6 + min(age_days, 1095) / 1095 × 0.4
  chains    = 1 + min(chain_count, 10) × 0.02
  category  = sector multiplier (Risk Curators 1.25, Chain 1.30, Dexs 1.15, …)
  readiness = 0.85 + launch_readiness × 0.3
```

No protocol name is ever special-cased. The same function scores every row, and the dashboard recomputes each row in the browser and checks it against `board.json`.

## Top 10

| Rank | Protocol | TVL | Implied value | Readiness |
|------|----------|-----|---------------|-----------|
| 1 | Steakhouse Financial | $2.75B | $1.04B | 73% |
| 2 | Sentora Curator | $2.76B | $896M | 69% |
| 3 | Gauntlet | $1.58B | $637M | 79% |
| 4 | Veda | $1.56B | $570M | 73% |
| 5 | USDD | $1.06B | $293M | 76% |
| 6 | Upshift | $499M | $217M | 89% |
| 7 | Nonce Capital | $514M | $112M | 39% |
| 8 | Polymarket International | $320M | $107M | 83% |
| 9 | CIAN Yield Layer | $280M | $94M | 86% |
| 10 | RockawayX | $293M | $90M | 54% |

Total implied value across all 198 protocols: **$6.52B**.

## Run it

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Requires Node.js 22.18+. Standard library only — nothing to install.

## Structure

- `main.ts` — entry point: reads the snapshot, writes `board.json`, `data.js`, `dashboard/`, `screenshots/`, `dossier.json`
- `lib/model.ts` — the value model, farm plan generator, board builder
- `vendor/makefun-board.ts` — make.fun's dossier library (from the kit, unchanged)
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js` (no network, no framework)
- `screenshots/` — the board, a detail view, and a filtered view

## License

MIT
