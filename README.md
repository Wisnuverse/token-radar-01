# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Wisnuverse/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Wisnuverse/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed snapshot of every protocol DefiLlama tracks, finds the ones that record no token, and ranks them by what their launch would be worth — priced off the snapshot's own 128 live tokens with one joint fit. 198 native pre-token rows, 40/40 watchlist coverage, a value band and three named live comparables per row, seven-step mechanism-specific farm plans netted at a $1,000 ticket with a four-tier verdict per plan, parent-linked flags for protocols whose launch is tied to a token that already trades, demoted values for the 91 set-aside rows priced off their size neighbours, and a sortable, filterable dashboard with a per-protocol model breakdown, a validation ladder and a research note.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

Node 22 or later, standard library only, no network. The program writes `board.json`, `data.js`, the dashboard, the screenshots and `dossier.json` into the output directory. Two runs write identical bytes.

## How it works

- **Value model** — one joint fit over the snapshot's own 128 live tokens: log10(mcap) = 3.02 + 0.522 × log10(TVL) + a category dummy (the category's mean residual, shrunk toward zero with k = 4, and exactly zero when the category has fewer than 2 traded peers — so a category with one peer cannot price a whole board). Joint R² 0.29; size curve R² 0.19. Every row carries a value band (±1 median leave-one-out error) and its three nearest live comparables by name. Validation is a ladder of out-of-sample reads over the 128 live tokens: leave-one-out flat multiple ×5.07 (28% within 2×) → size curve alone ×3.40 (32%) → joint model ×3.79 (32% within 2×, 43% within 3×); 5-fold cross-validation ×3.59 (31% within 2×); and a blind time-split — fitted on the oldest 47, graded on the newest 48 — joint ×3.11 vs flat ×5.29. The in-sample number (38% within 2×) is shown labelled as such. Three further terms were fitted and dropped because none improved the blind time-split: a growth tilt (−1.96 per 100% weekly change; ×3.13 vs ×3.11), a maturity term (×12.06), and chain count (≈ 0) — the research note states all three.
- **Coverage** — 342 records with no token were reviewed: 289 rankable → 198 ranked (40 watchlist protocols, 138 early ones below the $50M floor, 20 more above it), 91 wrapped, staked, bridged or exchange products set aside in their own view with the reason and a demoted value (TVL × the median multiple of the 5 live tokens nearest by TVL — no category premium, no factors, never ranked), 53 excluded (exchange category or versioned names). Total implied value across the board: $2.16B. Rank 1 is Sentora Curator at $90.2M (band $23.8M–$341.7M), priced by the size curve alone — Risk Curators has one traded peer.
- **Farm plans** — seven mechanism-specific steps per protocol (the category's action, a category-specific weekly check done off-chain, a second-market position, the hold, the exit, the safe claim), each with an explicit cost and time, plus a risk step where the category calls for one. Every plan is netted at a $1,000 ticket: expected gross (10% of launch value, pro-rata by capital — the assumption is stated on the page) minus gas (setup + exit + claim only) minus a 4% T-bill opportunity cost, with a verdict on a four-tier ladder — ROBUST pays even at the band's low end, FARM pays at the point value, THIN covers gas but not the T-bill, SKIP covers neither — and the break-even capital beside it. At $1,000: ROBUST 40 · FARM 97 · THIN 17 · SKIP 44; 137 of 198 farms pay, 40 even at the low end. Best net per hands-on hour: TurboFlow Perps at +$43.33/h.
- **Parent-linked rows** — 2 of 198 rows share a distinctive name word with a live token (MetalX Swap → MetalX Lending; Flying Tulip ftUSD → Flying Tulip Lend), derived from the snapshot alone with generic DeFi words and chain names excluded. The board flags them and the filter hides them.
- **Screenshots** — the four dashboard screenshots are stored here as base64 text (`screenshots/*.jpg.b64`) and decoded to JPEG by `main.ts` at run time, so the repository stays text-only.

---

<sub>Entered on [make.fun](https://make.fun/?ref=56ecrj42&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
