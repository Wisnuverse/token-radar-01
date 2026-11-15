// The token radar's model, v3: one sealed snapshot in, one ranked board out.
//
// Board: every protocol the snapshot's watchlist names (the floor, never the ceiling) plus every
// other native pre-token protocol the snapshot carries. A protocol is pre-token when its record
// carries no token (no market cap, no CoinGecko id, no symbol). Wrapped, staked and bridged
// products are set aside, not ranked: they are a token that already trades in another form, not a
// launch of their own. The set-aside rule is the house's own watchlist rule, applied to the whole
// rankable set: a Bridge / Canonical Bridge / Liquid Staking / Liquid Restaking / Restaked BTC /
// CEX category, a name carrying a whole word wrapped / staked / staking, a name beginning with an
// exchange's name, or a versioned name (a V2 pool of another protocol).
//
// v3 prices the set-aside rows anyway — demoted, never ranked. A demoted row is valued off its
// size neighbours alone (the median mcap/TVL of the five live tokens nearest by TVL, times the
// same growth / maturity / chain factors): no category premium, no blend, no rank. The audit
// funnel is then complete — all 342 pre-token records are either ranked, demoted with a value and
// a reason, or excluded — and the demotion is visible in the dashboard's Set aside view.
//
// Implied value is fitted from the snapshot's own live tokens, never from a hardcoded list:
//
//   categoryMultiple  median mcap/TVL of the live tokens in the protocol's category, shrunk
//                     toward the global median (k = 5), clamped to the live [p10, p90] band.
//                     A category with fewer than 3 traded peers does not get its own median at
//                     all: it falls back to the snapshot-wide median, and the detail view says
//                     so. (v1 let one token — Api3, n = 1 — price the whole top of the board.)
//   sizeCurveMultiple a log-log regression of mcap on TVL, fitted at runtime from the live
//                     tokens. Its R-squared is weak (about 0.19): it is one blended signal,
//                     never the value on its own.
//   blendedMultiple   the geometric mean of the two (both are ratios; the blend is geometric).
//   growthMultiplier  1 + clamp(change_7d, -60, 120) / 100 x 0.5.
//   maturityMultiplier 0.6 + min(age_days, 1095) / 1095 x 0.4 (unknown age: 365 days).
//   chainMultiplier   1 + 0.05 x min(max(chains - 1, 0), 4): a small durability signal, 1.00-1.20.
//   implied = max(1, round(tvl_usd x blended x growth x maturity x chain))
//
// Every row also carries a value band: the point estimate divided and multiplied by one median
// leave-one-out error, so the board states its own uncertainty instead of hiding it. And every
// row names its three nearest live comparables (same category first, by TVL proximity), so the
// evidence behind a number is checkable in one glance.
//
// v3 nets every farm plan at the band's low end: the farmer's expected gross is FARMER_SHARE
// (10%) of the launch value at the low end, pro-rata by the farmer's capital share of the
// protocol's TVL, minus the plan's own gas. The 10% is an assumption and is stated wherever the
// net appears; the break-even capital beside it needs no assumption at all — it is the capital
// at which the same arithmetic turns positive. Most rows net negative at small capital, and the
// dashboard says so: a farm that cannot pay its own gas at the low end is a fact, not a failure
// of the plan.
//
// Validation is three out-of-sample reads, all computed here at runtime from the same snapshot:
// backtestLOO (leave-one-out, the headline), backtestCV (5-fold cross-validation, deterministic
// folds by slug — a second, independent out-of-sample read), and backtestTimeSplit (a blind
// time-split: fit on the oldest half of the dated live tokens, test on the newest half). An
// in-sample backtest is kept beside them, labelled as such, because a model that grades its own
// homework is not evidence.
//
// Everything is deterministic: no Date.now, no randomness, every sort breaks ties by slug.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted model: every number the dashboard states, all derived from the snapshot. */
export interface ModelFit {
  /** Live tokens with mcap > 0 and TVL > 0 that calibrate the model. */
  live_n: number;
  /** Median mcap/TVL across the live tokens. */
  global_median: number;
  /** 10th and 90th percentile of the live mcap/TVL multiples: the clamp band — and the spread the hero context quotes (min/max are single outliers, not the spread). */
  p10: number;
  p90: number;
  /** Shrinkage strength toward the global median. */
  shrink_k: number;
  /** Minimum traded peers for a category to price itself; fewer fall back to the global median. */
  min_peers: number;
  /** Log-log size curve: log(mcap) = intercept + slope x log(tvl). */
  size_intercept: number;
  size_slope: number;
  /** The size curve's R-squared (weak by design: one signal among several). */
  size_r2: number;
  /** Per-category live medians and counts, for the detail view. */
  categories: Record<string, { median: number; n: number }>;
}

/** A backtest of the model against the live tokens: median error and share within 2x. */
export interface Backtest {
  n: number;
  /** Median |ln(predicted / actual)| across the live tokens. */
  median_abs_log_error: number;
  /** Share of predictions within 2x of the real market cap (0.5 <= pred/actual <= 2). */
  within_2x_share: number;
}

/** The blind time-split backtest: fitted on the oldest half, tested on the newest half. */
export interface TimeSplitBacktest extends Backtest {
  /** Live tokens held out of both sides for want of a listing date. */
  excluded_no_date: number;
  /** Live tokens the training fit saw (the oldest half by listing date). */
  train_n: number;
}

/** One live token named as evidence for a row's value. */
export interface Comparable {
  slug: string;
  name: string;
  /** Its own mcap/TVL multiple. */
  multiple: number;
  /** Whether it shares the row's category (false: the nearest live token overall). */
  same_category: boolean;
}

/** One protocol's full model breakdown, as the detail view shows it. */
export interface ModelBreakdown {
  category_multiple: number;
  category_n: number;
  /** True when the category had fewer than MIN_CATEGORY_PEERS live tokens and the global median priced it. */
  category_fallback: boolean;
  /** The category's raw live median before any fallback or shrinkage (the global median when n = 0). */
  category_raw_median: number;
  size_multiple: number;
  blended_multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  age_days: number | null;
  /** The value band: the point estimate / and x one median leave-one-out error. */
  value_low_usd: number;
  value_high_usd: number;
  /** The three nearest live comparables, same category first. */
  comparables: Comparable[];
}

/** A farm plan's economics, summed from its own steps — and netted at the band's low end. */
export interface FarmSummary {
  /** Capital across the main position and the second-market position, in whole dollars. */
  capital_usd: number;
  /** Estimated gas across setup, weekly actions, exit and claim, in whole dollars. */
  gas_usd: number;
  /** The hold window in days. */
  hold_days: number;
  /** One-off setup time in minutes. */
  setup_minutes: number;
  /** The farmer's expected gross at the band's low end: FARMER_SHARE of the launch value, pro-rata by the farmer's capital share of the protocol's TVL. */
  gross_low_usd: number;
  /** The farm netted at the band's low end: gross minus gas. Negative when gas swamps the expected gross — the honest read for small capital in a large protocol. */
  net_low_usd: number;
  /** The capital at which the farm breaks even at the band's low end, under the same farmer-share assumption. */
  breakeven_capital_usd: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm_summary: FarmSummary;
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm_summary: FarmSummary;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

/** A set-aside protocol: pre-token, but a wrapped / staked / bridged product, with its reason — and a demoted value, priced off its size neighbours, never ranked. */
export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  reason: string;
  /** The demoted value: TVL x the median multiple of the SIZE_NEIGHBOURS nearest live tokens by TVL, times the same growth / maturity / chain factors — no category premium, no blend. */
  demoted_value_usd: number;
  /** The size-neighbour median multiple behind the demoted value. */
  size_multiple: number;
  /** The nearest live tokens by TVL, each with its own multiple. */
  neighbours: { slug: string; multiple: number }[];
}

/** The audit funnel: every pre-token record accounted for, from the snapshot's own counts. */
export interface AuditFunnel {
  /** Records with no token at all. */
  pre_token: number;
  /** Pre-token records the board may rank (not an exchange, not a versioned pool). */
  rankable: number;
  /** Rankable records on the board. */
  board: number;
  /** Rankable records set aside as wrapped / staked / bridged products. */
  set_aside: number;
  /** Pre-token records excluded from ranking (an exchange category or a versioned name). */
  excluded: number;
}

/** One of the research note's top picks, with its reason derived from its own figures. */
export interface TopPick {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  reason: string;
}

/** The research note's numbers: strongest and weakest categories, and the top picks. */
export interface ResearchNote {
  /** The three categories with the highest live median multiple (n >= 3). */
  strongest: { category: string; median: number; n: number }[];
  /** The three categories with the lowest live median multiple (n >= 3). */
  weakest: { category: string; median: number; n: number }[];
  /** The board's top five rows, each with a one-line reason from its own figures. */
  top_picks: TopPick[];
  /** Total TVL of the board's rows, in whole dollars. */
  board_tvl_usd: number;
  /** Total TVL of the watchlist rows, in whole dollars. */
  watchlist_tvl_usd: number;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  fit: ModelFit;
  /** The in-sample backtest (kept, labelled as such). */
  backtest: Backtest;
  /** The leave-one-out backtest: the validation number the dashboard leads with. */
  backtest_loo: Backtest;
  /** The 5-fold cross-validation: a second, independent out-of-sample read. */
  backtest_cv: Backtest;
  /** The blind time-split backtest: fitted on the oldest half, tested on the newest half. */
  backtest_time_split: TimeSplitBacktest;
  audit: AuditFunnel;
  research: ResearchNote;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  set_aside_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  set_aside: SetAsideRow[];
}

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-4-comps';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Shrinkage strength for category multiples. */
export const SHRINK_K = 5;
/** A category needs this many traded peers to price itself; fewer fall back to the global median. */
export const MIN_CATEGORY_PEERS = 3;
/** Growth clamp, in per cent, and its weight. */
export const GROWTH_FLOOR = -60;
export const GROWTH_CAP = 120;
export const GROWTH_WEIGHT = 0.5;
/** Maturity curve: floor + range over MATURITY_DAYS; unknown age falls back to UNKNOWN_AGE_DAYS. */
export const MATURITY_FLOOR = 0.6;
export const MATURITY_RANGE = 0.4;
export const MATURITY_DAYS = 1095;
export const UNKNOWN_AGE_DAYS = 365;
/** Chain multiplier: 0.05 per extra chain, capped at 4 extra chains. */
export const CHAIN_STEP = 0.05;
export const CHAIN_MAX_EXTRA = 4;
/** How many comparables a row names. */
export const COMPARABLES = 3;
/** How many top picks the research note names. */
export const TOP_PICKS = 5;
/** The farmer's share of launch value the netted farm assumes (10%), pro-rata by capital. Stated wherever the net appears. */
export const FARMER_SHARE = 0.1;
/** How many nearest live tokens by TVL price a demoted row. */
export const SIZE_NEIGHBOURS = 5;
/** Cross-validation folds for the second out-of-sample check. */
export const CV_FOLDS = 5;

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted array, or `fallback` when empty. */
function medianOf(sorted: number[], fallback: number): number {
  const n = sorted.length;
  if (n === 0) return fallback;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A percentile of a sorted array by linear interpolation (p in [0, 1]). */
function percentileOf(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0]!;
  const at = p * (n - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word wrapped / staked / staking in a name, any case. */
const WRAP_WORD = /\b(wrapped|staked|staking)\b/i;
/** A name beginning with an exchange's name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
/** Categories that are wrapped, staked or bridged products by definition. */
const WRAP_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/**
 * Why a rankable protocol is set aside as a wrapped / staked / bridged product, or null when it is
 * native. This is the house's own watchlist rule, applied to the whole rankable set.
 */
export function setAsideReason(p: SnapshotProtocol): string | null {
  if (p.category !== null && WRAP_CATEGORIES.has(p.category)) return `category ${p.category}: a wrapped, staked or bridged product`;
  if (WRAP_WORD.test(p.name)) return 'name carries wrapped, staked or staking: a receipt for a token that already trades';
  if (EXCHANGE_PREFIX.test(p.name)) return 'name begins with an exchange: a product of a token that already trades';
  return null;
}

/** Whether a rankable protocol is native: rankable and not set aside. */
export function isNative(p: SnapshotProtocol): boolean {
  return isRankable(p) && setAsideReason(p) === null;
}

/** The live tokens that calibrate the model: a market cap and a TVL, both positive. */
export function liveTokens(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

// ---------------------------------------------------------------- fit + scoring

/**
 * Fit the model from the snapshot's own live tokens: the global and per-category mcap/TVL medians,
 * the [p10, p90] clamp band, and the log-log size curve (slope, intercept, R-squared).
 */
export function fitModel(protocols: SnapshotProtocol[]): ModelFit {
  const live = liveTokens(protocols);
  const multiples = live.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const globalMedian = medianOf(multiples, 0);
  const p10 = percentileOf(multiples, 0.1);
  const p90 = percentileOf(multiples, 0.9);

  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? '(no category)';
    const arr = byCategory.get(key) ?? [];
    arr.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(key, arr);
  }
  const categories: Record<string, { median: number; n: number }> = {};
  for (const [key, arr] of [...byCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    arr.sort((a, b) => a - b);
    categories[key] = { median: medianOf(arr, globalMedian), n: arr.length };
  }

  // Log-log OLS of mcap on TVL over the live tokens.
  const xs = live.map((p) => Math.log(p.tvl_usd));
  const ys = live.map((p) => Math.log(p.mcap_usd!));
  const n = live.length;
  const xMean = xs.reduce((s, x) => s + x, 0) / n;
  const yMean = ys.reduce((s, y) => s + y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - xMean) * (xs[i]! - xMean);
    sxy += (xs[i]! - xMean) * (ys[i]! - yMean);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = yMean - slope * xMean;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const fitted = intercept + slope * xs[i]!;
    ssTot += (ys[i]! - yMean) * (ys[i]! - yMean);
    ssRes += (ys[i]! - fitted) * (ys[i]! - fitted);
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return {
    live_n: n,
    global_median: globalMedian,
    p10,
    p90,
    shrink_k: SHRINK_K,
    min_peers: MIN_CATEGORY_PEERS,
    size_intercept: intercept,
    size_slope: slope,
    size_r2: r2,
    categories,
  };
}

/**
 * The category multiple. A category with at least MIN_CATEGORY_PEERS live tokens gets its live
 * median, shrunk toward the global median with strength k, then clamped to the live [p10, p90]
 * band. A category with fewer peers — or none — falls back to the snapshot-wide median, and the
 * caller is told: one token must never price a whole category.
 */
export function categoryMultiple(
  category: string | null,
  fit: ModelFit,
): { multiple: number; n: number; fallback: boolean; raw_median: number } {
  const entry = category === null ? undefined : fit.categories[category];
  const n = entry === undefined ? 0 : entry.n;
  const raw = entry === undefined ? fit.global_median : entry.median;
  if (n < fit.min_peers) {
    return { multiple: fit.global_median, n, fallback: true, raw_median: raw };
  }
  const shrunk = (n * raw + fit.shrink_k * fit.global_median) / (n + fit.shrink_k);
  return { multiple: Math.min(fit.p90, Math.max(fit.p10, shrunk)), n, fallback: false, raw_median: raw };
}

/** The size-curve multiple at a TVL: the fitted mcap over the TVL. */
export function sizeCurveMultiple(tvlUsd: number, fit: ModelFit): number {
  if (tvlUsd <= 0) return fit.global_median;
  return Math.exp(fit.size_intercept + fit.size_slope * Math.log(tvlUsd)) / tvlUsd;
}

/** The growth multiplier: 1 + the clamped 7-day change, weighted. */
export function growthMultiplier(change7d: number | null): { pct: number; multiplier: number } {
  const pct = Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, finite(change7d, 0)));
  return { pct, multiplier: 1 + (pct / 100) * GROWTH_WEIGHT };
}

/** The maturity multiplier: older protocols with no token score closer to 1. */
export function maturityMultiplier(age: number | null): number {
  const days = age ?? UNKNOWN_AGE_DAYS;
  return MATURITY_FLOOR + (Math.min(Math.max(days, 0), MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
}

/** The chain multiplier: a small durability signal for multi-chain protocols, 1.00-1.20. */
export function chainMultiplier(chains: string[]): number {
  return 1 + CHAIN_STEP * Math.min(Math.max(chains.length - 1, 0), CHAIN_MAX_EXTRA);
}

/**
 * The value band around a point estimate: one median leave-one-out error each way, in log space.
 * `bandFactor` is exp(median |ln(predicted / actual)|) from the leave-one-out backtest; without
 * it the band collapses to the point itself (the backtest path, where no band is shown).
 */
export function valueBand(implied: number, bandFactor?: number): { low: number; high: number } {
  if (bandFactor === undefined || !(bandFactor > 1)) return { low: implied, high: implied };
  return { low: Math.max(1, Math.round(implied / bandFactor)), high: Math.round(implied * bandFactor) };
}

/**
 * The nearest live comparables for a protocol: same-category tokens first, ordered by TVL
 * proximity in log space, then the nearest live tokens overall to fill the list. Ties break by
 * slug, so the list is deterministic.
 */
export function comparablesFor(p: SnapshotProtocol, live: SnapshotProtocol[]): Comparable[] {
  const logTvl = Math.log(Math.max(1, p.tvl_usd));
  const byProximity = (a: SnapshotProtocol, b: SnapshotProtocol): number => {
    const da = Math.abs(Math.log(Math.max(1, a.tvl_usd)) - logTvl);
    const db = Math.abs(Math.log(Math.max(1, b.tvl_usd)) - logTvl);
    return da - db || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  };
  const same = live.filter((q) => q.category === p.category && q.slug !== p.slug).sort(byProximity);
  const rest = live.filter((q) => q.category !== p.category && q.slug !== p.slug).sort(byProximity);
  const picked: Comparable[] = [];
  for (const q of same) {
    if (picked.length >= COMPARABLES) break;
    picked.push({ slug: q.slug, name: q.name, multiple: q.mcap_usd! / q.tvl_usd, same_category: true });
  }
  for (const q of rest) {
    if (picked.length >= COMPARABLES) break;
    picked.push({ slug: q.slug, name: q.name, multiple: q.mcap_usd! / q.tvl_usd, same_category: false });
  }
  return picked;
}

/** The full model breakdown and implied value for one protocol. */
export function scoreProtocol(
  p: SnapshotProtocol,
  asOf: string,
  fit: ModelFit,
  opts?: { bandFactor?: number; live?: SnapshotProtocol[] },
): { implied: number; breakdown: ModelBreakdown } {
  const age = ageDays(asOf, p.listed_at);
  const { multiple: catMult, n: catN, fallback, raw_median: catRaw } = categoryMultiple(p.category, fit);
  const sizeMult = sizeCurveMultiple(p.tvl_usd, fit);
  const blended = Math.sqrt(catMult * sizeMult);
  const { pct, multiplier: growthMult } = growthMultiplier(p.change_7d);
  const maturityMult = maturityMultiplier(age);
  const chainMult = chainMultiplier(p.chains);
  const implied = Math.max(1, Math.round(p.tvl_usd * blended * growthMult * maturityMult * chainMult));
  const band = valueBand(implied, opts?.bandFactor);
  return {
    implied,
    breakdown: {
      category_multiple: catMult,
      category_n: catN,
      category_fallback: fallback,
      category_raw_median: catRaw,
      size_multiple: sizeMult,
      blended_multiple: blended,
      growth_pct: pct,
      growth_multiplier: growthMult,
      maturity_multiplier: maturityMult,
      chain_multiplier: chainMult,
      age_days: age,
      value_low_usd: band.low,
      value_high_usd: band.high,
      comparables: opts?.live === undefined ? [] : comparablesFor(p, opts.live),
    },
  };
}

/**
 * Backtest the fitted model on the live tokens: the median absolute log-error and the share of
 * predictions within 2x of the real market cap. In-sample by construction (the same tokens fit the
 * model); the dashboard labels it as such.
 */
export function backtestModel(protocols: SnapshotProtocol[], asOf: string, fit: ModelFit): Backtest {
  const live = liveTokens(protocols);
  const errors: number[] = [];
  let within = 0;
  for (const p of live) {
    const { implied } = scoreProtocol(p, asOf, fit);
    const actual = p.mcap_usd!;
    const ratio = implied / actual;
    errors.push(Math.abs(Math.log(ratio)));
    if (ratio >= 0.5 && ratio <= 2) within++;
  }
  errors.sort((a, b) => a - b);
  return {
    n: live.length,
    median_abs_log_error: medianOf(errors, 0),
    within_2x_share: live.length === 0 ? 0 : within / live.length,
  };
}

/**
 * The leave-one-out backtest: each live token is scored by a model fitted without it — the
 * medians, the clamp band and the size curve are all rebuilt with the token held out — so the
 * error is an honest out-of-sample read, not the model grading its own homework. 128 refits of a
 * cheap fit; still well inside the program's time budget.
 */
export function backtestLOO(protocols: SnapshotProtocol[], asOf: string): Backtest {
  const live = liveTokens(protocols);
  const errors: number[] = [];
  let within = 0;
  for (const p of live) {
    const heldOut = protocols.filter((q) => q.slug !== p.slug);
    const fitMinus = fitModel(heldOut);
    const { implied } = scoreProtocol(p, asOf, fitMinus);
    const actual = p.mcap_usd!;
    const ratio = implied / actual;
    errors.push(Math.abs(Math.log(ratio)));
    if (ratio >= 0.5 && ratio <= 2) within++;
  }
  errors.sort((a, b) => a - b);
  return {
    n: live.length,
    median_abs_log_error: medianOf(errors, 0),
    within_2x_share: live.length === 0 ? 0 : within / live.length,
  };
}

/**
 * The 5-fold cross-validation: the live tokens are dealt into five deterministic folds by slug
 * order, and each fold is scored by a model fitted on the other four. A second, independent
 * out-of-sample read beside leave-one-out — if the two disagree, the model is less stable than
 * either number alone suggests.
 */
export function backtestCV(protocols: SnapshotProtocol[], asOf: string, folds: number = CV_FOLDS): Backtest {
  const live = liveTokens(protocols);
  const ordered = [...live].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const errors: number[] = [];
  let within = 0;
  for (let fold = 0; fold < folds; fold++) {
    const test = ordered.filter((_, i) => i % folds === fold);
    const testSlugs = new Set(test.map((p) => p.slug));
    const train = protocols.filter((q) => !testSlugs.has(q.slug));
    const fit = fitModel(train);
    for (const p of test) {
      const { implied } = scoreProtocol(p, asOf, fit);
      const ratio = implied / p.mcap_usd!;
      errors.push(Math.abs(Math.log(ratio)));
      if (ratio >= 0.5 && ratio <= 2) within++;
    }
  }
  errors.sort((a, b) => a - b);
  return {
    n: live.length,
    median_abs_log_error: medianOf(errors, 0),
    within_2x_share: live.length === 0 ? 0 : within / live.length,
  };
}

/**
 * The blind time-split backtest: the model is fitted on the oldest half of the dated live tokens
 * and tested on the newest half — the fit never sees the tokens it is graded on, and the test
 * tokens are the ones that listed most recently, so this is the closest the snapshot gets to
 * "predict the future". Tokens without a listing date are held out of both sides, and counted.
 */
export function backtestTimeSplit(protocols: SnapshotProtocol[], asOf: string): TimeSplitBacktest {
  const live = liveTokens(protocols);
  const dated = live
    .filter((p) => p.listed_at !== null)
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const cut = Math.floor(dated.length / 2);
  const trainSlugs = new Set(dated.slice(0, cut).map((p) => p.slug));
  const test = dated.slice(cut);
  const liveSlugs = new Set(live.map((p) => p.slug));
  // The training fit sees the old live tokens plus every non-live protocol (they carry no
  // market cap, so they cannot leak the test tokens' values).
  const train = protocols.filter((q) => trainSlugs.has(q.slug) || !liveSlugs.has(q.slug));
  const fit = fitModel(train);
  const errors: number[] = [];
  let within = 0;
  for (const p of test) {
    const { implied } = scoreProtocol(p, asOf, fit);
    const ratio = implied / p.mcap_usd!;
    errors.push(Math.abs(Math.log(ratio)));
    if (ratio >= 0.5 && ratio <= 2) within++;
  }
  errors.sort((a, b) => a - b);
  return {
    n: test.length,
    median_abs_log_error: medianOf(errors, 0),
    within_2x_share: test.length === 0 ? 0 : within / test.length,
    excluded_no_date: live.length - dated.length,
    train_n: cut,
  };
}

// ---------------------------------------------------------------- farm plans

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 597)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page for the next step.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** A realistic gas figure for one transaction on a chain. */
function gasFor(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 'about $8 of gas';
  if (c === 'solana') return 'under $1 of gas';
  if (c === 'bitcoin') return 'about $3 of network fees';
  return 'about $2 of gas';
}

/** The same gas figure as a whole-dollar number, for the farm economics summary. */
function gasUsdFor(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 8;
  if (c === 'solana') return 1;
  if (c === 'bitcoin') return 3;
  return 2;
}

/**
 * The category's one action, in words a farmer can follow. Every branch is derived from the
 * protocol's own category and chains, never from a hand-written list of names.
 */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('leveraged')) return `Open a $${capital} leveraged position on ${name} on ${chain} at low leverage and keep it open.`;
  if (c.includes('lending') || c.includes('uncollateralized')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('cdp')) return `Lock $${capital} of collateral in ${name} on ${chain}, mint a small amount against it and keep the vault healthy.`;
  if (c.includes('collateral')) return `Supply $${capital} of collateral to ${name} on ${chain} and keep the position open.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('restak')) return `Restake $${capital} of the staking asset through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('staking')) return `Stake $${capital} of the chain's asset through ${name} and keep the receipt.`;
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s delta-neutral strategy on ${chain} and keep the position open.`;
  if (c.includes('yield')) return `Deposit $${capital} into ${name}'s highest-TVL yield vault on ${chain} and keep the shares.`;
  if (c.includes('dex')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('liquidity manager')) return `Deposit $${capital} into a ${name} managed pool on ${chain} and keep the position open.`;
  if (c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('stablecoin')) return `Mint or hold $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('governance')) return `Stake $${capital} for governance on ${name} and vote in the next proposal.`;
  if (c.includes('indexes') || c.includes('index')) return `Buy $${capital} of the ${name} index on ${chain} and hold it.`;
  if (c.includes('payments')) return `Route $${capital} of payments through ${name} on ${chain} over the next weeks.`;
  if (c.includes('card')) return `Use ${name}'s card for $${capital} of spending and keep the account funded.`;
  if (c.includes('otc')) return `Complete one $${capital} trade on ${name}'s OTC desk and keep the receipt.`;
  if (c.includes('farm')) return `Deposit $${capital} into ${name}'s main farm on ${chain} and keep the position open.`;
  if (c.includes('btc') || c.includes('bitcoin')) return `Deposit $${capital} of the BTC asset into ${name} on ${chain} and keep the position open.`;
  if (c.includes('chain')) return `Bridge $${capital} to the chain ${name} runs on, transact there weekly and keep the balance.`;
  if (c.includes('cedefi')) return `Deposit $${capital} into ${name} on ${chain} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * The weekly qualifying action, specific to the category — the same branches as the opening
 * action, phrased as upkeep. A weekly step that just says "deposit, borrow, swap or vote" is a
 * template, not a plan.
 */
function weeklyActionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('leveraged')) return `Add a small amount to the leveraged position on ${name} or rebalance it, and check the health factor.`;
  if (c.includes('lending') || c.includes('uncollateralized')) return `Supply a small extra amount to ${name} or repay a little of any borrow, and check utilization.`;
  if (c.includes('cdp')) return `Top up the ${name} vault's collateral a little and check the collateral ratio.`;
  if (c.includes('collateral')) return `Add a small amount of collateral to ${name} and check the position's health.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit a small extra amount into the ${name} vault and check its reported yield.`;
  if (c.includes('bridge')) return `Bridge a small amount again through ${name} and use the funds in the destination app.`;
  if (c.includes('restak')) return `Check the restaked position's rewards on ${name} and add a small amount if the terms still suit you.`;
  if (c.includes('staking')) return `Check the stake's rewards on ${name} and compound a small amount.`;
  if (c.includes('basis')) return `Check ${name}'s strategy funding rate and add a small deposit while it stays positive.`;
  if (c.includes('yield')) return `Deposit a small amount into the same ${name} vault and check its yield.`;
  if (c.includes('dex')) return `Add a little liquidity to the same ${name} pool and check the fees earned.`;
  if (c.includes('liquidity manager')) return `Check the ${name} pool's range and add a small deposit.`;
  if (c.includes('derivative')) return `Check the position's margin and funding on ${name}, and adjust the hedge if needed.`;
  if (c.includes('rwa')) return `Check the asset's backing report on ${name} and add a small amount if the yield holds.`;
  if (c.includes('insurance')) return `Check the ${name} policy's coverage and renew or top up if it is close to expiring.`;
  if (c.includes('stablecoin')) return `Hold the stable asset and check its peg and backing on ${name}.`;
  if (c.includes('prediction')) return `Check ${name}'s open markets and place one small position on a market you follow.`;
  if (c.includes('governance')) return `Vote in any open ${name} proposal and check when the next one opens.`;
  if (c.includes('indexes') || c.includes('index')) return `Check the ${name} index's composition and add a small amount.`;
  if (c.includes('payments')) return `Route one small payment through ${name} on ${chain}.`;
  if (c.includes('card')) return `Use the ${name} card for one small purchase.`;
  if (c.includes('otc')) return `Check ${name}'s desk quotes; no trade is needed every week.`;
  if (c.includes('farm')) return `Harvest or compound a small amount from the ${name} farm.`;
  if (c.includes('btc') || c.includes('bitcoin')) return `Check the BTC position's yield on ${name} and add a small amount.`;
  if (c.includes('chain')) return `Make one transaction on the chain ${name} runs on and keep the balance.`;
  if (c.includes('cedefi')) return `Check the ${name} position and add a small amount.`;
  return `Make one small qualifying action in ${name}'s app — a deposit, a swap or a vote.`;
}

/**
 * The second-market step: the same position on the protocol's second chain, or, for a
 * single-chain protocol, a smaller position in its other pool, market or vault. Activity in two
 * places reads as a user, not a single deposit.
 */
function secondMarketFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const name = p.name;
  const half = Math.max(25, Math.floor(capital / 2));
  if (p.chains.length > 1) {
    return `Open the same position on ${p.chains[1]} with a smaller $${half} so the activity spans two chains.`;
  }
  return `Open a second, smaller $${half} position in ${name}'s other pool, market or vault on ${chain} so the activity is not a single deposit.`;
}

/** A risk line for the categories where the farm can lose money beyond the capital at stake. */
function riskFor(p: SnapshotProtocol): string | null {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('leveraged')) return 'Leverage can liquidate the position: keep leverage low and watch the health factor weekly.';
  if (c.includes('derivative')) return 'Perpetual positions can be liquidated: size the position small and set a stop.';
  if (c.includes('cdp')) return 'A collateral vault can be liquidated if the collateral falls: keep the ratio well above the minimum.';
  if (c.includes('restak')) return 'Restaking adds slashing risk on top of the base stake: read the slashing terms first.';
  if (c.includes('lending') || c.includes('uncollateralized')) return 'Lending carries borrower-default and bad-debt risk: spread the deposit and check utilization.';
  if (c.includes('rwa')) return 'The yield-bearing asset depends on its issuer and custodian: check who holds the backing and what happens if the issuer fails.';
  if (c.includes('prediction')) return 'Market outcomes are decided by the protocol\u2019s resolution rules: read how a market resolves before staking on one.';
  if (c.includes('bridge')) return 'Bridged funds depend on the bridge\u2019s security: bridge only what you can afford to have delayed or stuck.';
  if (c.includes('stablecoin')) return 'A stable asset can depeg: check the backing and the peg history before holding a large amount.';
  return null;
}

/**
 * A protocol's farm plan: seven steps — wallet, the category's action, a category-specific
 * weekly action, a second-market position, the hold, the exit, and the safe claim — plus a risk
 * step where the category calls for one. Derived from the protocol's own record, never from a
 * list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const steps: FarmStep[] = [
    {
      text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
      cost: 'nothing to set up',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyActionFor(p, chain),
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: secondMarketFor(p, capital, chain),
      cost: `$${Math.max(25, Math.floor(capital / 2))} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: `Hold the positions for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the capital stays in the positions`,
      time: `${hold} days`,
    },
    {
      text: `Unwind in stages once the positions have run ${hold} days: close any open position first, withdraw half, keep the rest until any rewards window closes, then withdraw the remainder.`,
      cost: gas,
      time: '15 minutes',
    },
    {
      text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes — and log the wallet, the dates and every transaction so the position can be repeated or audited.",
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
  const risk = riskFor(p);
  if (risk !== null) {
    steps.push({
      text: risk,
      cost: 'no extra cost, only attention',
      time: '5 minutes a week',
    });
  }
  return steps;
}

/**
 * A farm plan's economics, summed from its own steps: the capital in both positions, the gas
 * across setup (two positions), one weekly action per week of the hold, the exit and the claim,
 * the hold window, and the one-off setup time — and the plan netted at the band's low end.
 * The net assumes farmers collectively receive FARMER_SHARE of the launch value, split pro-rata
 * by capital: gross = FARMER_SHARE x valueLow x (capital / TVL), net = gross - gas. The
 * break-even capital is the capital at which that arithmetic turns positive, so a farmer can
 * read off the smallest position that pays its own gas at the low end.
 */
export function farmSummary(p: SnapshotProtocol, age: number | null, valueLowUsd: number): FarmSummary {
  const capital = capitalFor(p);
  const second = Math.max(25, Math.floor(capital / 2));
  const hold = holdDaysFor(age);
  const gas = gasUsdFor(chainOf(p));
  const weeklyTx = Math.ceil(hold / 7);
  const gasUsd = gas * (2 + weeklyTx + 1 + 1);
  const totalCapital = capital + second;
  const grossLow = Math.round(FARMER_SHARE * valueLowUsd * (totalCapital / Math.max(1, p.tvl_usd)));
  const lowMultiple = valueLowUsd / Math.max(1, p.tvl_usd);
  const breakeven = lowMultiple > 0 ? Math.ceil(gasUsd / (FARMER_SHARE * lowMultiple)) : 0;
  return {
    capital_usd: totalCapital,
    gas_usd: gasUsd,
    hold_days: hold,
    setup_minutes: 5 + 15 + 15,
    gross_low_usd: grossLow,
    net_low_usd: grossLow - gasUsd,
    breakeven_capital_usd: breakeven,
  };
}

// ---------------------------------------------------------------- board

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  fit: ModelFit,
  opts: { bandFactor: number; live: SnapshotProtocol[] },
): BoardRow[] {
  const chosen = snapshot.protocols.filter(isNative);
  const scored = chosen.map((p) => {
    const { implied, breakdown } = scoreProtocol(p, snapshot.as_of, fit, {
      bandFactor: opts.bandFactor,
      live: opts.live,
    });
    return { p, implied, breakdown };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const onWatchlist = new Set(snapshot.watchlist);
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    on_watchlist: onWatchlist.has(s.p.slug),
    age_days: s.breakdown.age_days,
    implied_value_usd: s.implied,
    model: s.breakdown,
    farm_summary: farmSummary(s.p, s.breakdown.age_days, s.breakdown.value_low_usd),
    farm_steps: farmSteps(s.p, s.breakdown.age_days).map(stepText),
  }));
}

/**
 * The nearest live tokens by TVL, in log space: a demoted row's only evidence. Ties break by
 * slug, so the list is deterministic.
 */
export function sizeNeighbours(p: SnapshotProtocol, live: SnapshotProtocol[], n: number): { slug: string; multiple: number }[] {
  const logTvl = Math.log(Math.max(1, p.tvl_usd));
  return [...live]
    .filter((q) => q.slug !== p.slug)
    .sort((a, b) => {
      const da = Math.abs(Math.log(Math.max(1, a.tvl_usd)) - logTvl);
      const db = Math.abs(Math.log(Math.max(1, b.tvl_usd)) - logTvl);
      return da - db || (a.slug < b.slug ? -1 : 1);
    })
    .slice(0, n)
    .map((q) => ({ slug: q.slug, multiple: q.mcap_usd! / q.tvl_usd }));
}

/**
 * A demoted value for a set-aside protocol: TVL x the median multiple of its size neighbours,
 * times the same growth / maturity / chain factors the ranked rows use. No category premium
 * (a derivative's category is the thing that already trades), no blend, no rank — the
 * demotion is the method, and the detail view says so.
 */
export function demotedValue(
  p: SnapshotProtocol,
  asOf: string,
  live: SnapshotProtocol[],
): { value: number; size_multiple: number; neighbours: { slug: string; multiple: number }[] } {
  const neighbours = sizeNeighbours(p, live, SIZE_NEIGHBOURS);
  const multiples = neighbours.map((n) => n.multiple).sort((a, b) => a - b);
  const sizeMultiple = medianOf(multiples, 0);
  const age = ageDays(asOf, p.listed_at);
  const { multiplier: growthMult } = growthMultiplier(p.change_7d);
  const value = Math.max(
    1,
    Math.round(p.tvl_usd * sizeMultiple * growthMult * maturityMultiplier(age) * chainMultiplier(p.chains)),
  );
  return { value, size_multiple: sizeMultiple, neighbours };
}

/** The set-aside protocols, by TVL, with the reason each was set aside — and a demoted value. */
export function setAsideRows(snapshot: Snapshot, live: SnapshotProtocol[]): SetAsideRow[] {
  return snapshot.protocols
    .filter((p) => isRankable(p) && setAsideReason(p) !== null)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => {
      const d = demotedValue(p, snapshot.as_of, live);
      return {
        slug: p.slug,
        name: p.name,
        category: p.category,
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        reason: setAsideReason(p)!,
        demoted_value_usd: d.value,
        size_multiple: d.size_multiple,
        neighbours: d.neighbours,
      };
    });
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    on_watchlist: row.on_watchlist,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    model: row.model,
    farm_summary: row.farm_summary,
    farm_steps: row.farm_steps,
  };
}

/** A short dollar figure for the research note's reasons. */
function shortUSD(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${Math.round(n / 1e3)}K`;
}

/** One top pick's reason, built from its own figures — never a hand-written opinion. */
function pickReason(row: BoardRow, fit: ModelFit): string {
  const m = row.model;
  const parts: string[] = [];
  if (m.category_fallback) {
    parts.push(
      `only ${m.category_n} traded peer${m.category_n === 1 ? '' : 's'} in ${row.category ?? 'its category'}, so the global median (${fit.global_median.toFixed(3)}) prices it`,
    );
  } else {
    const vs = m.category_multiple / fit.global_median;
    parts.push(
      `${row.category ?? 'Its category'} multiple ${m.category_multiple.toFixed(3)} is ${vs.toFixed(1)}x the global median (${fit.global_median.toFixed(3)}, n = ${m.category_n})`,
    );
  }
  parts.push(`TVL ${shortUSD(row.tvl_usd)}`);
  if (row.on_watchlist) parts.push('on the watchlist');
  return `${parts.join('; ')}.`;
}

/** The research note's numbers, all derived from the fitted model and the ranked board. */
export function researchNote(board: BoardRow[], fit: ModelFit): ResearchNote {
  const withPeers = Object.entries(fit.categories)
    .filter(([, v]) => v.n >= MIN_CATEGORY_PEERS)
    .map(([category, v]) => ({ category, median: v.median, n: v.n }));
  const strongest = [...withPeers].sort((a, b) => b.median - a.median || (a.category < b.category ? -1 : 1)).slice(0, 3);
  const weakest = [...withPeers].sort((a, b) => a.median - b.median || (a.category < b.category ? -1 : 1)).slice(0, 3);
  return {
    strongest,
    weakest,
    top_picks: board.slice(0, TOP_PICKS).map((row) => ({
      slug: row.slug,
      name: row.name,
      rank: row.rank,
      implied_value_usd: row.implied_value_usd,
      reason: pickReason(row, fit),
    })),
    board_tvl_usd: board.reduce((s, r) => s + r.tvl_usd, 0),
    watchlist_tvl_usd: board.filter((r) => r.on_watchlist).reduce((s, r) => s + r.tvl_usd, 0),
  };
}

/** The audit funnel: every pre-token record accounted for. */
export function auditFunnel(snapshot: Snapshot, board: BoardRow[], setAside: SetAsideRow[]): AuditFunnel {
  const preToken = snapshot.protocols.filter(isPreToken).length;
  const rankable = snapshot.protocols.filter(isRankable).length;
  return {
    pre_token: preToken,
    rankable,
    board: board.length,
    set_aside: setAside.length,
    excluded: preToken - rankable,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const fit = fitModel(snapshot.protocols);
  const live = liveTokens(snapshot.protocols);
  const backtest = backtestModel(snapshot.protocols, snapshot.as_of, fit);
  const backtestLoo = backtestLOO(snapshot.protocols, snapshot.as_of);
  const backtestCv = backtestCV(snapshot.protocols, snapshot.as_of);
  const backtestTs = backtestTimeSplit(snapshot.protocols, snapshot.as_of);
  const bandFactor = Math.exp(backtestLoo.median_abs_log_error);
  const board = buildBoard(snapshot, fit, { bandFactor, live });
  const liveShown = liveRows(snapshot);
  const setAside = setAsideRows(snapshot, live);
  const early = board.filter((r) => r.tvl_usd < snapshot.floor_usd).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    fit,
    backtest,
    backtest_loo: backtestLoo,
    backtest_cv: backtestCv,
    backtest_time_split: backtestTs,
    audit: auditFunnel(snapshot, board, setAside),
    research: researchNote(board, fit),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: liveShown.length,
    set_aside_size: setAside.length,
    rows: board.map(radarRow),
    live: liveShown,
    set_aside: setAside,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board repeats a slug';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
