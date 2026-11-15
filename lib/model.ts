// The token radar's model, v4: one sealed snapshot in, one ranked board out.
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
// v4 prices the set-aside rows anyway — demoted, never ranked. A demoted row is valued off its
// size neighbours alone (the median mcap/TVL of the five live tokens nearest by TVL): no category
// premium, no factors, no rank. The audit funnel is then complete — all 342 pre-token records
// are either ranked, demoted with a value and a reason, or excluded — and the demotion is visible
// in the dashboard's Set aside view.
//
// Implied value is fitted from the snapshot's own live tokens, never from a hardcoded list. v4
// replaces v3's geometric blend with a single joint fit:
//
//   log10(mcap) = a + b x log10(TVL) + dummy(category)
//
// The size curve (a, b) is an OLS fit over all 128 live tokens; each category's dummy is the mean
// residual of its live tokens, shrunk toward zero with 4 pseudo-observations, and set to zero
// when the category has fewer than 2 traded tokens — so a category with one peer cannot price a
// whole board, and a category with no evidence is priced by the size curve alone, openly.
//
// Three further terms were fitted as candidates and DROPPED, because none improved the blind
// time-split: a growth tilt on the 7-day change, a maturity term on log age, and a chain-count
// term. The fit reports each term's coefficient and its time-split result, and the research note
// states them — a term that was tested and rejected is evidence, not a gap.
//
// Every row also carries a value band: the point estimate divided and multiplied by one median
// leave-one-out error, so the board states its own uncertainty instead of hiding it. And every
// row names its three nearest live comparables (same category first, by TVL proximity), so the
// evidence behind a number is checkable in one glance.
//
// Every farm plan is netted at a $1,000 ticket: the farmer's expected gross is FARMER_SHARE (10%)
// of the launch value, pro-rata by the ticket's share of the protocol's TVL, minus the plan's gas
// (setup + exit + claim only — the weekly checks are off-chain) and minus a 4% T-bill opportunity
// cost on the ticket for the hold. The 10% is an assumption and is stated wherever the net
// appears. Each plan carries a verdict on a four-tier ladder: ROBUST pays even at the band's low
// end, FARM pays at the point value, THIN covers its gas but not the T-bill, SKIP covers neither.
// The break-even capital beside it needs no assumption about the ticket at all.
//
// Validation is a ladder of out-of-sample reads, all computed here at runtime from the same
// snapshot: a flat median multiple, the size curve alone, and the full joint model, each graded
// by leave-one-out — plus 5-fold cross-validation and a blind time-split (fit on the oldest half
// of the dated live tokens, test on the newest half), each against the same flat baseline. An
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

/** One category's evidence in the joint fit: its traded peers and its shrunk dummy. */
export interface CategoryFit {
  /** Live tokens in the category. */
  n: number;
  /** The shrunk category dummy in log10 units (0 when n < MIN_CATEGORY_PEERS). */
  dummy: number;
  /** The category's raw mean residual before shrinkage (0 when n = 0). */
  raw_mean_residual: number;
}

/** The fitted model: every number the dashboard states, all derived from the snapshot. */
export interface ModelFit {
  /** Live tokens with mcap > 0 and TVL > 0 that calibrate the model. */
  live_n: number;
  /** Median mcap/TVL across the live tokens (the flat baseline's multiple). */
  global_median: number;
  /** 10th and 90th percentile of the live mcap/TVL multiples: the spread the hero context quotes. */
  p10: number;
  p90: number;
  /** Shrinkage strength for the category dummies (pseudo-observations). */
  shrink_k: number;
  /** Minimum traded peers for a category to carry a dummy; fewer get exactly zero. */
  min_peers: number;
  /** Log-log size curve: log10(mcap) = intercept + slope x log10(TVL). */
  size_intercept: number;
  size_slope: number;
  /** The size curve's R-squared on its own. */
  size_r2: number;
  /** The joint fit's R-squared (curve + dummies), in-sample. */
  joint_r2: number;
  /** Per-category live counts and shrunk dummies, for the detail view. */
  categories: Record<string, CategoryFit>;
}

/** A backtest of the model against the live tokens: median error and share within 2x. */
export interface Backtest {
  n: number;
  /** Median |ln(predicted / actual)| across the live tokens. */
  median_abs_log_error: number;
  /** Share of predictions within 2x of the real market cap (0.5 <= pred/actual <= 2). */
  within_2x_share: number;
  /** Share of predictions within 3x of the real market cap. */
  within_3x_share: number;
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

/** A fitted term that was tested against the blind time-split and kept or dropped. */
export interface TestedTerm {
  /** The term's name: growth, maturity, or chains. */
  term: string;
  /** The fitted coefficient, in log10 units per unit of the term. */
  coefficient: number;
  /** The blind time-split median error WITH the term (as a multiple, e.g. 3.13). */
  time_split_with: number;
  /** The blind time-split median error WITHOUT the term (the joint model's own). */
  time_split_without: number;
  /** True only when the term improved the time-split. */
  kept: boolean;
}

/** One protocol's full model breakdown, as the detail view shows it. */
export interface ModelBreakdown {
  /** The size curve's value at this TVL, before any category adjustment. */
  curve_value_usd: number;
  /** The category's shrunk dummy, in log10 units (0 when the category has < 2 peers). */
  category_dummy: number;
  /** The category's live-token count. */
  category_n: number;
  /** The category's multiplier: 10^dummy (exactly 1 when the dummy is 0). */
  category_multiplier: number;
  age_days: number | null;
  /** The value band: the point estimate / and x one median leave-one-out error. */
  value_low_usd: number;
  value_high_usd: number;
  /** The three nearest live comparables, same category first. */
  comparables: Comparable[];
}

/** A farm plan's verdict, on a four-tier ladder defined by single inequalities. */
export type FarmVerdict = 'ROBUST' | 'FARM' | 'THIN' | 'SKIP';

/** A farm plan's economics at a $1,000 ticket, netted at the point value. */
export interface FarmSummary {
  /** The ticket: $1,000 across the main position and the second-market position. */
  capital_usd: number;
  /** Estimated gas across setup (two positions), exit and claim, in whole dollars. */
  gas_usd: number;
  /** The T-bill opportunity cost: 4% a year on the ticket for the hold, in dollars. */
  tbill_usd: number;
  /** The hold window in days. */
  hold_days: number;
  /** One-off setup time in minutes. */
  setup_minutes: number;
  /** Hands-on work across the whole plan (setup + weekly checks + exit + claim), in minutes. */
  work_minutes: number;
  /** The farmer's expected gross at the point value: FARMER_SHARE of the launch value, pro-rata by the ticket's share of the protocol's TVL. */
  gross_usd: number;
  /** The same gross at the band's low end. */
  gross_low_usd: number;
  /** The farm netted at the point value: gross minus gas minus the T-bill cost. */
  net_usd: number;
  /** The farm netted at the band's low end. */
  net_low_usd: number;
  /** The net per hands-on hour, in dollars. */
  net_per_hour_usd: number;
  /** The capital at which the farm breaks even at the point value; null when no ticket pays (the gross rate never beats the T-bill rate). */
  breakeven_capital_usd: number | null;
  /** The plan's verdict: ROBUST pays even at the low end, FARM pays at the point, THIN covers gas but not the T-bill, SKIP covers neither. */
  verdict: FarmVerdict;
}

/** A parent link: a live token whose name shares a distinctive word with this protocol's. */
export interface SiblingLink {
  linked: boolean;
  /** The live token's slug, or null when unlinked. */
  token_slug: string | null;
  /** The live token's name, or null when unlinked. */
  token_name: string | null;
  /** The shared distinctive word, or null when unlinked. */
  shared_word: string | null;
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
  sibling: SiblingLink;
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
  sibling: SiblingLink;
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
  /** The demoted value: TVL x the median multiple of the SIZE_NEIGHBOURS nearest live tokens by TVL — no category premium, no factors. */
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
  /** The three categories with the highest shrunk dummy (n >= 2): the market pays above the size curve here. */
  strongest: { category: string; dummy: number; n: number }[];
  /** The three categories with the lowest shrunk dummy (n >= 2). */
  weakest: { category: string; dummy: number; n: number }[];
  /** The board's top five rows, each with a one-line reason from its own figures. */
  top_picks: TopPick[];
  /** Total TVL of the board's rows, in whole dollars. */
  board_tvl_usd: number;
  /** Total TVL of the watchlist rows, in whole dollars. */
  watchlist_tvl_usd: number;
  /** The fitted terms that were tested and kept or dropped. */
  tested_terms: TestedTerm[];
}

/** The farm verdict counts across the board, at the $1,000 ticket. */
export interface VerdictCounts {
  ROBUST: number;
  FARM: number;
  THIN: number;
  SKIP: number;
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
  /** The leave-one-out backtest of the flat median multiple: the baseline everything is measured against. */
  backtest_flat: Backtest;
  /** The leave-one-out backtest of the size curve alone: the ladder's middle rung. */
  backtest_size: Backtest;
  /** The leave-one-out backtest of the joint model: the validation number the dashboard leads with. */
  backtest_loo: Backtest;
  /** The 5-fold cross-validation of the joint model: a second, independent out-of-sample read. */
  backtest_cv: Backtest;
  /** The blind time-split backtest of the joint model: fitted on the oldest half, tested on the newest half. */
  backtest_time_split: TimeSplitBacktest;
  /** The blind time-split backtest of the flat multiple, on the same split. */
  backtest_time_split_flat: TimeSplitBacktest;
  audit: AuditFunnel;
  research: ResearchNote;
  verdict_counts: VerdictCounts;
  /** The board's best farm by net per hands-on hour. */
  best_per_hour: { slug: string; name: string; net_per_hour_usd: number; net_usd: number };
  /** The board's total implied value, in whole dollars. */
  board_total_implied_usd: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  set_aside_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  set_aside: SetAsideRow[];
  /** Every live token's (TVL, market cap), for the hero chart: the full calibration set, not the 24 shown in the Live view. */
  live_points: [number, number][];
}

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-4-joint';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;
/** Shrinkage strength for category dummies (pseudo-observations toward zero). */
export const SHRINK_K = 4;
/** A category needs this many traded peers to carry a dummy; fewer get exactly zero. */
export const MIN_CATEGORY_PEERS = 2;
/** Growth clamp, in per cent, for the fitted growth term's test. */
export const GROWTH_FLOOR = -60;
export const GROWTH_CAP = 120;
/** Maturity curve: unknown age falls back to UNKNOWN_AGE_DAYS (used by the hold window and the fitted maturity term's test). */
export const UNKNOWN_AGE_DAYS = 365;
/** Chain count cap for the fitted chain term's test. */
export const CHAIN_MAX_EXTRA = 4;
/** How many comparables a row names. */
export const COMPARABLES = 3;
/** How many top picks the research note names. */
export const TOP_PICKS = 5;
/** The farmer's share of launch value the netted farm assumes (10%), pro-rata by capital. Stated wherever the net appears. */
export const FARMER_SHARE = 0.1;
/** The farm ticket: $1,000 across the main position and the second-market position. */
export const FARM_TICKET_USD = 1000;
/** The main position's share of the ticket; the second-market position takes the rest. */
export const FARM_MAIN_USD = 700;
/** The T-bill rate used as the opportunity cost on the ticket. */
export const TBILL_RATE = 0.04;
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
 * Fit the joint model from the snapshot's own live tokens: the log-log size curve (slope,
 * intercept, R-squared), the per-category shrunk dummies (k = 4, min n = 2), the joint R-squared,
 * and the flat baseline's median multiple with its [p10, p90] spread.
 */
export function fitModel(protocols: SnapshotProtocol[]): ModelFit {
  const live = liveTokens(protocols);
  const multiples = live.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const globalMedian = medianOf(multiples, 0);
  const p10 = percentileOf(multiples, 0.1);
  const p90 = percentileOf(multiples, 0.9);

  // Log-log OLS of mcap on TVL over the live tokens (log10 throughout: the dashboard
  // quotes the curve as 10^intercept x TVL^slope).
  const xs = live.map((p) => Math.log10(p.tvl_usd));
  const ys = live.map((p) => Math.log10(p.mcap_usd!));
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
  const sizeR2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  // Category mean residuals, shrunk toward zero with SHRINK_K pseudo-observations; a
  // category with fewer than MIN_CATEGORY_PEERS peers carries exactly zero.
  const residuals = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const key = live[i]!.category ?? '(no category)';
    const arr = residuals.get(key) ?? [];
    arr.push(ys[i]! - (intercept + slope * xs[i]!));
    residuals.set(key, arr);
  }
  const categories: Record<string, CategoryFit> = {};
  for (const [key, arr] of [...residuals.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const raw = arr.reduce((s, v) => s + v, 0) / arr.length;
    categories[key] = {
      n: arr.length,
      dummy: arr.length < MIN_CATEGORY_PEERS ? 0 : (arr.length / (arr.length + SHRINK_K)) * raw,
      raw_mean_residual: raw,
    };
  }

  // Joint R-squared: curve + dummies, in-sample.
  let ssResJoint = 0;
  for (let i = 0; i < n; i++) {
    const key = live[i]!.category ?? '(no category)';
    const fitted = intercept + slope * xs[i]! + (categories[key]?.dummy ?? 0);
    ssResJoint += (ys[i]! - fitted) * (ys[i]! - fitted);
  }
  const jointR2 = ssTot === 0 ? 0 : 1 - ssResJoint / ssTot;

  return {
    live_n: n,
    global_median: globalMedian,
    p10,
    p90,
    shrink_k: SHRINK_K,
    min_peers: MIN_CATEGORY_PEERS,
    size_intercept: intercept,
    size_slope: slope,
    size_r2: sizeR2,
    joint_r2: jointR2,
    categories,
  };
}

/** The size curve's value at a TVL, before any category adjustment. */
export function curveValue(tvlUsd: number, fit: ModelFit): number {
  if (tvlUsd <= 0) return 0;
  return 10 ** (fit.size_intercept + fit.size_slope * Math.log10(tvlUsd));
}

/** A category's shrunk dummy and peer count (zero dummy when the category has < 2 peers). */
export function categoryDummy(
  category: string | null,
  fit: ModelFit,
): { dummy: number; n: number; raw_mean_residual: number } {
  const entry = category === null ? undefined : fit.categories[category];
  if (entry === undefined) return { dummy: 0, n: 0, raw_mean_residual: 0 };
  return { dummy: entry.dummy, n: entry.n, raw_mean_residual: entry.raw_mean_residual };
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
  const curve = curveValue(p.tvl_usd, fit);
  const { dummy, n: catN } = categoryDummy(p.category, fit);
  const multiplier = 10 ** dummy;
  const implied = Math.max(1, Math.round(curve * multiplier));
  const band = valueBand(implied, opts?.bandFactor);
  return {
    implied,
    breakdown: {
      // Unrounded on purpose: the dashboard recomputes implied = round(curve x multiplier)
      // in-page, and a rounded curve would shift the recompute by a dollar on some rows.
      curve_value_usd: Math.max(1, curve),
      category_dummy: dummy,
      category_n: catN,
      category_multiplier: multiplier,
      age_days: age,
      value_low_usd: band.low,
      value_high_usd: band.high,
      comparables: opts?.live === undefined ? [] : comparablesFor(p, opts.live),
    },
  };
}

// ---------------------------------------------------------------- backtests

/** Summarise absolute log-errors into a Backtest. */
function summarise(errors: number[]): Backtest {
  const sorted = [...errors].sort((a, b) => a - b);
  const within2 = errors.filter((e) => e <= Math.log(2)).length;
  const within3 = errors.filter((e) => e <= Math.log(3)).length;
  return {
    n: errors.length,
    median_abs_log_error: medianOf(sorted, 0),
    within_2x_share: errors.length === 0 ? 0 : within2 / errors.length,
    within_3x_share: errors.length === 0 ? 0 : within3 / errors.length,
  };
}

/** A scorer: one protocol + one fit -> one predicted market cap. */
type Scorer = (p: SnapshotProtocol, fit: ModelFit) => number;
/** A fit function: the protocols a fit may see -> the fit. */
type FitFn = (protocols: SnapshotProtocol[]) => ModelFit;

const jointScorer: Scorer = (p, fit) => scoreProtocol(p, '', fit).implied;
const sizeScorer: Scorer = (p, fit) => Math.max(1, Math.round(curveValue(p.tvl_usd, fit)));
const flatScorer: Scorer = (p, fit) => Math.max(1, Math.round(p.tvl_usd * fit.global_median));

/**
 * Backtest the fitted model on the live tokens, in-sample by construction (the same tokens fit
 * the model); the dashboard labels it as such.
 */
export function backtestModel(protocols: SnapshotProtocol[], asOf: string, fit: ModelFit): Backtest {
  const live = liveTokens(protocols);
  const errors = live.map((p) => Math.abs(Math.log(scoreProtocol(p, asOf, fit).implied / p.mcap_usd!)));
  return summarise(errors);
}

/**
 * The leave-one-out backtest of any (fit, scorer) pair: each live token is scored by a model
 * fitted without it, so the error is an honest out-of-sample read. 128 refits of a cheap fit;
 * still well inside the program's time budget.
 */
export function backtestLOOGeneric(protocols: SnapshotProtocol[], fitFn: FitFn, scorer: Scorer): Backtest {
  const live = liveTokens(protocols);
  const errors: number[] = [];
  for (const p of live) {
    const heldOut = protocols.filter((q) => q.slug !== p.slug);
    const fitMinus = fitFn(heldOut);
    errors.push(Math.abs(Math.log(scorer(p, fitMinus) / p.mcap_usd!)));
  }
  return summarise(errors);
}

/** The leave-one-out backtest of the joint model. */
export function backtestLOO(protocols: SnapshotProtocol[]): Backtest {
  return backtestLOOGeneric(protocols, fitModel, jointScorer);
}

/** The leave-one-out backtest of the flat median multiple: the baseline. */
export function backtestLOOFlat(protocols: SnapshotProtocol[]): Backtest {
  return backtestLOOGeneric(protocols, fitModel, flatScorer);
}

/** The leave-one-out backtest of the size curve alone: the ladder's middle rung. */
export function backtestLOOSize(protocols: SnapshotProtocol[]): Backtest {
  return backtestLOOGeneric(protocols, fitModel, sizeScorer);
}

/**
 * The 5-fold cross-validation of the joint model: the live tokens are dealt into five
 * deterministic folds by slug order, and each fold is scored by a model fitted on the other four.
 */
export function backtestCV(protocols: SnapshotProtocol[], folds: number = CV_FOLDS): Backtest {
  const live = liveTokens(protocols);
  const ordered = [...live].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const errors: number[] = [];
  for (let fold = 0; fold < folds; fold++) {
    const test = ordered.filter((_, i) => i % folds === fold);
    const testSlugs = new Set(test.map((p) => p.slug));
    const train = protocols.filter((q) => !testSlugs.has(q.slug));
    const fit = fitModel(train);
    for (const p of test) errors.push(Math.abs(Math.log(jointScorer(p, fit) / p.mcap_usd!)));
  }
  return summarise(errors);
}

/**
 * The blind time-split backtest of any (fit, scorer) pair: the model is fitted on the oldest
 * half of the dated live tokens and tested on the newest half — the fit never sees the tokens it
 * is graded on, and the test tokens are the ones that listed most recently, so this is the
 * closest the snapshot gets to "predict the future". Tokens without a listing date are held out
 * of both sides, and counted.
 */
export function backtestTimeSplitGeneric(protocols: SnapshotProtocol[], fitFn: FitFn, scorer: Scorer): TimeSplitBacktest {
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
  const fit = fitFn(train);
  const errors = test.map((p) => Math.abs(Math.log(scorer(p, fit) / p.mcap_usd!)));
  return {
    ...summarise(errors),
    excluded_no_date: live.length - dated.length,
    train_n: cut,
  };
}

/** The blind time-split backtest of the joint model. */
export function backtestTimeSplit(protocols: SnapshotProtocol[]): TimeSplitBacktest {
  return backtestTimeSplitGeneric(protocols, fitModel, jointScorer);
}

/** The blind time-split backtest of the flat multiple, on the same split. */
export function backtestTimeSplitFlat(protocols: SnapshotProtocol[]): TimeSplitBacktest {
  return backtestTimeSplitGeneric(protocols, fitModel, flatScorer);
}

// ---------------------------------------------------------------- fitted terms, tested and kept or dropped

/** A candidate term's value for one protocol, in the units its coefficient is fitted in. */
export function termValue(kind: 'growth' | 'maturity' | 'chains', p: SnapshotProtocol, asOf: string): number {
  if (kind === 'growth') {
    return Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, finite(p.change_7d, 0))) / 100;
  }
  if (kind === 'maturity') {
    const age = ageDays(asOf, p.listed_at) ?? UNKNOWN_AGE_DAYS;
    return Math.log10(Math.max(30, age));
  }
  return Math.min(Math.max(p.chains.length - 1, 0), CHAIN_MAX_EXTRA);
}

/**
 * Fit a candidate term on top of the joint model: regress the joint residuals on the term
 * (two-stage OLS) and return the coefficient. The term is kept only when it improves the blind
 * time-split — a term that only helps in-sample, or on the same tokens it was fitted on, is not
 * evidence.
 */
export function fitTermCoefficient(
  kind: 'growth' | 'maturity' | 'chains',
  protocols: SnapshotProtocol[],
  asOf: string,
): number {
  const live = liveTokens(protocols);
  const fit = fitModel(protocols);
  const pts = live.map((p) => ({
    x: termValue(kind, p, asOf),
    r: Math.log10(p.mcap_usd!) - (fit.size_intercept + fit.size_slope * Math.log10(p.tvl_usd) + (fit.categories[p.category ?? '(no category)']?.dummy ?? 0)),
  }));
  const xMean = pts.reduce((s, q) => s + q.x, 0) / pts.length;
  const rMean = pts.reduce((s, q) => s + q.r, 0) / pts.length;
  let sxx = 0;
  let sxy = 0;
  for (const q of pts) {
    sxx += (q.x - xMean) * (q.x - xMean);
    sxy += (q.x - xMean) * (q.r - rMean);
  }
  return sxx === 0 ? 0 : sxy / sxx;
}

/**
 * Test the three candidate terms against the blind time-split. Each term is fitted on the
 * training half only (never on the test tokens), then the joint model plus the term is graded on
 * the test half. A term is kept only when its time-split median beats the joint model's own.
 */
export function testTerms(protocols: SnapshotProtocol[], asOf: string): TestedTerm[] {
  const base = backtestTimeSplit(protocols);
  const baseMedian = Math.exp(base.median_abs_log_error);
  const out: TestedTerm[] = [];
  for (const kind of ['growth', 'maturity', 'chains'] as const) {
    const live = liveTokens(protocols);
    const dated = live
      .filter((p) => p.listed_at !== null)
      .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
    const cut = Math.floor(dated.length / 2);
    const trainSlugs = new Set(dated.slice(0, cut).map((p) => p.slug));
    const test = dated.slice(cut);
    const liveSlugs = new Set(live.map((p) => p.slug));
    const train = protocols.filter((q) => trainSlugs.has(q.slug) || !liveSlugs.has(q.slug));
    // The test coefficient is fitted on the training half only (never on the test tokens);
    // the reported coefficient is the full-sample fit, so a reader can reproduce it.
    const coefTest = fitTermCoefficient(kind, train, asOf);
    const coefFull = fitTermCoefficient(kind, protocols, asOf);
    const fit = fitModel(train);
    const errors = test.map((p) => {
      const withTerm = jointScorer(p, fit) * 10 ** (coefTest * termValue(kind, p, asOf));
      return Math.abs(Math.log(withTerm / p.mcap_usd!));
    });
    const withMedian = Math.exp(summarise(errors).median_abs_log_error);
    out.push({
      term: kind,
      coefficient: coefFull,
      time_split_with: withMedian,
      time_split_without: baseMedian,
      kept: withMedian < baseMedian,
    });
  }
  return out;
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
 * The weekly qualifying check, specific to the category — the same branches as the opening
 * action, phrased as upkeep. The checks are off-chain (read the position, the yield, the health):
 * they cost attention, not gas, so the plan's gas is setup + exit + claim only.
 */
function weeklyActionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('leveraged')) return `Check the leveraged position's health factor on ${name} and read any liquidation warnings.`;
  if (c.includes('lending') || c.includes('uncollateralized')) return `Check the ${name} position's utilization and any borrow rate changes.`;
  if (c.includes('cdp')) return `Check the ${name} vault's collateral ratio and the collateral's price.`;
  if (c.includes('collateral')) return `Check the ${name} position's health and the collateral's price.`;
  if (c.includes('curator') || c.includes('allocator')) return `Check the ${name} vault's reported yield and any strategy changes.`;
  if (c.includes('bridge')) return `Check the bridged funds on ${chain} and the destination app's balance.`;
  if (c.includes('restak')) return `Check the restaked position's rewards on ${name} and read any slashing notices.`;
  if (c.includes('staking')) return `Check the stake's rewards on ${name} and the validator's performance.`;
  if (c.includes('basis')) return `Check ${name}'s strategy funding rate and whether it stays positive.`;
  if (c.includes('yield')) return `Check the ${name} vault's yield and whether the strategy changed.`;
  if (c.includes('dex')) return `Check the ${name} pool's fees earned and whether the range still holds.`;
  if (c.includes('liquidity manager')) return `Check the ${name} pool's range and the fees earned.`;
  if (c.includes('derivative')) return `Check the position's margin and funding on ${name}, and read any risk notices.`;
  if (c.includes('rwa')) return `Check the asset's backing report on ${name} and whether the yield holds.`;
  if (c.includes('insurance')) return `Check the ${name} policy's coverage and when it expires.`;
  if (c.includes('stablecoin')) return `Check the stable asset's peg and backing on ${name}.`;
  if (c.includes('prediction')) return `Check ${name}'s open markets and read how your market is resolving.`;
  if (c.includes('governance')) return `Read any open ${name} proposals and note the voting dates.`;
  if (c.includes('indexes') || c.includes('index')) return `Check the ${name} index's composition and performance.`;
  if (c.includes('payments')) return `Check the ${name} payment history and any pending transfers.`;
  if (c.includes('card')) return `Check the ${name} card balance and the account's funding.`;
  if (c.includes('otc')) return `Check ${name}'s desk quotes; no trade is needed every week.`;
  if (c.includes('farm')) return `Check the ${name} farm's rewards and the harvest terms.`;
  if (c.includes('btc') || c.includes('bitcoin')) return `Check the BTC position's yield on ${name}.`;
  if (c.includes('chain')) return `Check the balance on the chain ${name} runs on and read its activity.`;
  if (c.includes('cedefi')) return `Check the ${name} position and its reported yield.`;
  return `Check the position in ${name}'s app and read any points or rewards updates.`;
}

/**
 * The second-market step: the same position on the protocol's second chain, or, for a
 * single-chain protocol, a smaller position in its other pool, market or vault. Activity in two
 * places reads as a user, not a single deposit.
 */
function secondMarketFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const name = p.name;
  if (p.chains.length > 1) {
    return `Open the same position on ${p.chains[1]} with a smaller $${capital} so the activity spans two chains.`;
  }
  return `Open a second, smaller $${capital} position in ${name}'s other pool, market or vault on ${chain} so the activity is not a single deposit.`;
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
 * A protocol's farm plan: seven steps — wallet, the category's action ($700), a category-specific
 * weekly check (off-chain), a second-market position ($300), the hold, the exit, and the safe
 * claim — plus a risk step where the category calls for one. Derived from the protocol's own
 * record, never from a list of names. The ticket is $1,000 in total.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const main = FARM_MAIN_USD;
  const second = FARM_TICKET_USD - FARM_MAIN_USD;
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const steps: FarmStep[] = [
    {
      text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
      cost: 'nothing to set up',
      time: '5 minutes',
    },
    {
      text: actionFor(p, main, chain),
      cost: `$${main} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyActionFor(p, chain),
      cost: 'no gas — check off-chain',
      time: '10 minutes a week',
    },
    {
      text: secondMarketFor(p, second, chain),
      cost: `$${second} of capital and ${gas}`,
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
      cost: gas + ' to claim',
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

/** Round a dollar figure to cents. */
function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * A farm plan's economics at a $1,000 ticket: the gas across setup (two positions), exit and
 * claim (the weekly checks are off-chain), the T-bill opportunity cost on the ticket for the
 * hold, and the plan netted at the point value — with the low-end net beside it for the ROBUST
 * tier. The net assumes farmers collectively receive FARMER_SHARE of the launch value, split
 * pro-rata by capital: gross = FARMER_SHARE x value x (ticket / TVL), net = gross - gas - T-bill.
 * The break-even capital is the capital at which that arithmetic turns positive at the point
 * value; when the gross rate never beats the T-bill rate, no ticket pays and it is null.
 */
export function farmSummary(p: SnapshotProtocol, age: number | null, impliedUsd: number, valueLowUsd: number): FarmSummary {
  const hold = holdDaysFor(age);
  const gas = gasUsdFor(chainOf(p)) * 4; // two setups + exit + claim
  const tbill = cents(FARM_TICKET_USD * TBILL_RATE * (hold / 365));
  const gross = cents(FARMER_SHARE * impliedUsd * (FARM_TICKET_USD / Math.max(1, p.tvl_usd)));
  const grossLow = cents(FARMER_SHARE * valueLowUsd * (FARM_TICKET_USD / Math.max(1, p.tvl_usd)));
  const net = cents(gross - gas - tbill);
  const netLow = cents(grossLow - gas - tbill);
  const workMinutes = 5 + 15 + 15 + 10 * Math.ceil(hold / 7) + 15 + 10;
  const netPerHour = cents(net / (workMinutes / 60));
  // net(C) = C x (FARMER_SHARE x implied/TVL - TBILL_RATE x hold/365) - gas; break-even is
  // gas / rate when the rate is positive, null when it never is.
  const rate = FARMER_SHARE * (impliedUsd / Math.max(1, p.tvl_usd)) - TBILL_RATE * (hold / 365);
  const breakeven = rate > 0 ? Math.ceil(gas / rate) : null;
  const verdict: FarmVerdict = netLow > 0 ? 'ROBUST' : net > 0 ? 'FARM' : gross > gas ? 'THIN' : 'SKIP';
  return {
    capital_usd: FARM_TICKET_USD,
    gas_usd: gas,
    tbill_usd: tbill,
    hold_days: hold,
    setup_minutes: 5 + 15 + 15,
    work_minutes: workMinutes,
    gross_usd: gross,
    gross_low_usd: grossLow,
    net_usd: net,
    net_low_usd: netLow,
    net_per_hour_usd: netPerHour,
    breakeven_capital_usd: breakeven,
    verdict,
  };
}

// ---------------------------------------------------------------- sibling links

/**
 * Generic words: DeFi vocabulary and chain/ecosystem names. A shared generic word is not a
 * family link — "basis" would link every basis trader to yield-basis, "stellar" every Stellar
 * app to aquarius-stellar. Only a distinctive word (4+ letters, not generic) counts, and the
 * link names the live token it points at, so it is checkable.
 */
const GENERIC_WORDS = new Set([
  'finance', 'protocol', 'vault', 'vaults', 'token', 'chain', 'swap', 'labs', 'network', 'defi',
  'dao', 'app', 'bridge', 'staking', 'stake', 'exchange', 'market', 'markets', 'fund', 'funds',
  'asset', 'assets', 'yield', 'liquid', 'capital', 'money', 'dollar', 'coin', 'pay', 'payments',
  'card', 'index', 'indexes', 'farm', 'farms', 'pool', 'pools', 'lending', 'lend', 'borrow',
  'credit', 'insurance', 'options', 'perps', 'perpetuals', 'derivatives', 'stablecoin', 'reserve',
  'treasury', 'governance', 'basis', 'earn', 'hub', 'mint', 'cedefi',
  'btc', 'bitcoin', 'eth', 'ethereum', 'solana', 'base', 'arbitrum', 'optimism', 'polygon',
  'avax', 'avalanche', 'sui', 'aptos', 'near', 'cosmos', 'tron', 'bsc', 'bnb', 'ink', 'monad',
  'bera', 'berachain', 'hyperliquid', 'sonic', 'linea', 'scroll', 'zksync', 'starknet', 'stellar',
  'manta', 'kava', 'sei', 'injective', 'fantom', 'cronos', 'harmony', 'moonbeam', 'moonriver',
  'oasis', 'celo', 'algorand', 'hedera', 'flow', 'tezos', 'stacks', 'cardano', 'polkadot',
  'kusama', 'litecoin', 'dogecoin', 'kaspa', 'ton', 'elrond', 'multiversx',
  'the', 'and', 'for', 'with', 'one', 'two',
]);

/** A name's distinctive words: lowercase, 4+ letters, not generic. */
function distinctiveWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w));
}

/**
 * A protocol's parent link: the first live token (by the protocol's own word order, then by
 * slug) whose name shares a distinctive word with this protocol's name. Derived from the
 * snapshot alone — no hardcoded list. A linked protocol's launch value is tied to a token that
 * already trades, so the dashboard flags it.
 */
export function siblingLinkFor(p: SnapshotProtocol, live: SnapshotProtocol[]): SiblingLink {
  const words = distinctiveWords(p.name);
  if (words.length === 0) return { linked: false, token_slug: null, token_name: null, shared_word: null };
  const byWord = new Map<string, SnapshotProtocol[]>();
  for (const q of live) {
    for (const w of distinctiveWords(q.name)) {
      const arr = byWord.get(w) ?? [];
      arr.push(q);
      byWord.set(w, arr);
    }
  }
  for (const w of words) {
    const hits = (byWord.get(w) ?? []).filter((q) => q.slug !== p.slug).sort((a, b) => (a.slug < b.slug ? -1 : 1));
    if (hits.length > 0) {
      const q = hits[0]!;
      return { linked: true, token_slug: q.slug, token_name: q.name, shared_word: w };
    }
  }
  return { linked: false, token_slug: null, token_name: null, shared_word: null };
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
    sibling: siblingLinkFor(s.p, opts.live),
    farm_summary: farmSummary(s.p, s.breakdown.age_days, s.implied, s.breakdown.value_low_usd),
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
 * A demoted value for a set-aside protocol: TVL x the median multiple of its size neighbours.
 * No category premium (a derivative's category is the thing that already trades), no factors —
 * the joint model carries no heuristic factors, so neither does the demotion. No rank: the
 * demotion is the method, and the detail view says so.
 */
export function demotedValue(
  p: SnapshotProtocol,
  live: SnapshotProtocol[],
): { value: number; size_multiple: number; neighbours: { slug: string; multiple: number }[] } {
  const neighbours = sizeNeighbours(p, live, SIZE_NEIGHBOURS);
  const multiples = neighbours.map((n) => n.multiple).sort((a, b) => a - b);
  const sizeMultiple = medianOf(multiples, 0);
  const value = Math.max(1, Math.round(p.tvl_usd * sizeMultiple));
  return { value, size_multiple: sizeMultiple, neighbours };
}

/** The set-aside protocols, by TVL, with the reason each was set aside — and a demoted value. */
export function setAsideRows(snapshot: Snapshot, live: SnapshotProtocol[]): SetAsideRow[] {
  return snapshot.protocols
    .filter((p) => isRankable(p) && setAsideReason(p) !== null)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => {
      const d = demotedValue(p, live);
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
    sibling: row.sibling,
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
  if (m.category_n < fit.min_peers) {
    parts.push(
      `no category evidence (n = ${m.category_n}), so the size curve prices it at ${shortUSD(m.curve_value_usd)}`,
    );
  } else if (m.category_multiplier >= 1) {
    parts.push(
      `${row.category ?? 'Its category'} pays ${m.category_multiplier.toFixed(2)}x the size curve (n = ${m.category_n}), lifting ${shortUSD(m.curve_value_usd)} to ${shortUSD(row.implied_value_usd)}`,
    );
  } else {
    parts.push(
      `${row.category ?? 'Its category'} pays ${m.category_multiplier.toFixed(2)}x the size curve (n = ${m.category_n}), cutting ${shortUSD(m.curve_value_usd)} to ${shortUSD(row.implied_value_usd)}`,
    );
  }
  parts.push(`TVL ${shortUSD(row.tvl_usd)}`);
  if (row.on_watchlist) parts.push('on the watchlist');
  if (row.sibling.linked) parts.push(`parent-linked to ${row.sibling.token_name}`);
  return `${parts.join('; ')}.`;
}

/** The research note's numbers, all derived from the fitted model and the ranked board. */
export function researchNote(board: BoardRow[], fit: ModelFit, testedTerms: TestedTerm[]): ResearchNote {
  const withPeers = Object.entries(fit.categories)
    .filter(([, v]) => v.n >= MIN_CATEGORY_PEERS)
    .map(([category, v]) => ({ category, dummy: v.dummy, n: v.n }));
  const strongest = [...withPeers].sort((a, b) => b.dummy - a.dummy || (a.category < b.category ? -1 : 1)).slice(0, 3);
  const weakest = [...withPeers].sort((a, b) => a.dummy - b.dummy || (a.category < b.category ? -1 : 1)).slice(0, 3);
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
    tested_terms: testedTerms,
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
  const backtestFlat = backtestLOOFlat(snapshot.protocols);
  const backtestSize = backtestLOOSize(snapshot.protocols);
  const backtestLoo = backtestLOO(snapshot.protocols);
  const backtestCv = backtestCV(snapshot.protocols);
  const backtestTs = backtestTimeSplit(snapshot.protocols);
  const backtestTsFlat = backtestTimeSplitFlat(snapshot.protocols);
  const testedTerms = testTerms(snapshot.protocols, snapshot.as_of);
  const bandFactor = Math.exp(backtestLoo.median_abs_log_error);
  const board = buildBoard(snapshot, fit, { bandFactor, live });
  const liveShown = liveRows(snapshot);
  const setAside = setAsideRows(snapshot, live);
  const early = board.filter((r) => r.tvl_usd < snapshot.floor_usd).length;
  const verdictCounts: VerdictCounts = { ROBUST: 0, FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) verdictCounts[r.farm_summary.verdict]++;
  const best = [...board].sort((a, b) => b.farm_summary.net_per_hour_usd - a.farm_summary.net_per_hour_usd || (a.slug < b.slug ? -1 : 1))[0]!;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    fit,
    backtest,
    backtest_flat: backtestFlat,
    backtest_size: backtestSize,
    backtest_loo: backtestLoo,
    backtest_cv: backtestCv,
    backtest_time_split: backtestTs,
    backtest_time_split_flat: backtestTsFlat,
    audit: auditFunnel(snapshot, board, setAside),
    research: researchNote(board, fit, testedTerms),
    verdict_counts: verdictCounts,
    best_per_hour: {
      slug: best.slug,
      name: best.name,
      net_per_hour_usd: best.farm_summary.net_per_hour_usd,
      net_usd: best.farm_summary.net_usd,
    },
    board_total_implied_usd: board.reduce((s, r) => s + r.implied_value_usd, 0),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: liveShown.length,
    set_aside_size: setAside.length,
    rows: board.map(radarRow),
    live: liveShown,
    set_aside: setAside,
    live_points: live
      .map((p) => [p.tvl_usd, p.mcap_usd!] as [number, number])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
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
