// The token radar's model: one sealed snapshot in, one ranked board out.
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
// Implied value is fitted from the snapshot's own live tokens, never from a hardcoded list:
//
//   categoryMultiple  median mcap/TVL of the live tokens in the protocol's category, shrunk
//                     toward the global median (k = 5), clamped to the live [p10, p90] band.
//                     Small categories cannot drag the board: Risk Curators has n = 1.
//   sizeCurveMultiple a log-log regression of mcap on TVL, fitted at runtime from the live
//                     tokens. Its R-squared is weak (about 0.19): it is one blended signal,
//                     never the value on its own.
//   blendedMultiple   the geometric mean of the two (both are ratios; the blend is geometric).
//   growthMultiplier  1 + clamp(change_7d, -60, 120) / 100 x 0.5.
//   maturityMultiplier 0.6 + min(age_days, 1095) / 1095 x 0.4 (unknown age: 365 days).
//   chainMultiplier   1 + 0.05 x min(max(chains - 1, 0), 4): a small durability signal, 1.00-1.20.
//   implied = max(1, round(tvl_usd x blended x growth x maturity x chain))
//
// backtestModel runs the same model over the live tokens and reports the median absolute log-error
// and the share of predictions within 2x of the real market cap. It is in-sample (the same tokens
// calibrate the model), and the dashboard says so: it is a sanity check on the fit, not a claim
// the model predicts launches.
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
  /** 10th and 90th percentile of the live mcap/TVL multiples: the clamp band. */
  p10: number;
  p90: number;
  /** Shrinkage strength toward the global median. */
  shrink_k: number;
  /** Log-log size curve: log(mcap) = intercept + slope x log(tvl). */
  size_intercept: number;
  size_slope: number;
  /** The size curve's R-squared (weak by design: one signal among several). */
  size_r2: number;
  /** Per-category live medians and counts, for the detail view. */
  categories: Record<string, { median: number; n: number }>;
}

/** The backtest of the model against the live tokens (in-sample, labelled as such). */
export interface Backtest {
  n: number;
  /** Median |ln(predicted / actual)| across the live tokens. */
  median_abs_log_error: number;
  /** Share of predictions within 2x of the real market cap (0.5 <= pred/actual <= 2). */
  within_2x_share: number;
}

/** One protocol's full model breakdown, as the detail view shows it. */
export interface ModelBreakdown {
  category_multiple: number;
  category_n: number;
  size_multiple: number;
  blended_multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  age_days: number | null;
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

/** A set-aside protocol: pre-token, but a wrapped / staked / bridged product, with its reason. */
export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  reason: string;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  fit: ModelFit;
  backtest: Backtest;
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
export const MODEL_VERSION = 'radar-2-comps';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Shrinkage strength for category multiples. */
export const SHRINK_K = 5;
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
    size_intercept: intercept,
    size_slope: slope,
    size_r2: r2,
    categories,
  };
}

/**
 * The category multiple: the category's live median, shrunk toward the global median with strength
 * k, then clamped to the live [p10, p90] band. A category with no live token scores the global median.
 */
export function categoryMultiple(category: string | null, fit: ModelFit): { multiple: number; n: number } {
  const entry = category === null ? undefined : fit.categories[category];
  const n = entry === undefined ? 0 : entry.n;
  const raw = entry === undefined ? fit.global_median : entry.median;
  const shrunk = (n * raw + fit.shrink_k * fit.global_median) / (n + fit.shrink_k);
  return { multiple: Math.min(fit.p90, Math.max(fit.p10, shrunk)), n };
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

/** The full model breakdown and implied value for one protocol. */
export function scoreProtocol(
  p: SnapshotProtocol,
  asOf: string,
  fit: ModelFit,
): { implied: number; breakdown: ModelBreakdown } {
  const age = ageDays(asOf, p.listed_at);
  const { multiple: catMult, n: catN } = categoryMultiple(p.category, fit);
  const sizeMult = sizeCurveMultiple(p.tvl_usd, fit);
  const blended = Math.sqrt(catMult * sizeMult);
  const { pct, multiplier: growthMult } = growthMultiplier(p.change_7d);
  const maturityMult = maturityMultiplier(age);
  const chainMult = chainMultiplier(p.chains);
  const implied = Math.max(1, Math.round(p.tvl_usd * blended * growthMult * maturityMult * chainMult));
  return {
    implied,
    breakdown: {
      category_multiple: catMult,
      category_n: catN,
      size_multiple: sizeMult,
      blended_multiple: blended,
      growth_pct: pct,
      growth_multiplier: growthMult,
      maturity_multiplier: maturityMult,
      chain_multiplier: chainMult,
      age_days: age,
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

/** A risk line for the categories where the farm can lose money beyond the capital at stake. */
function riskFor(p: SnapshotProtocol): string | null {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('leveraged')) return 'Leverage can liquidate the position: keep leverage low and watch the health factor weekly.';
  if (c.includes('derivative')) return 'Perpetual positions can be liquidated: size the position small and set a stop.';
  if (c.includes('cdp')) return 'A collateral vault can be liquidated if the collateral falls: keep the ratio well above the minimum.';
  if (c.includes('restak')) return 'Restaking adds slashing risk on top of the base stake: read the slashing terms first.';
  if (c.includes('lending') || c.includes('uncollateralized')) return 'Lending carries borrower-default and bad-debt risk: spread the deposit and check utilization.';
  return null;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time, plus a risk step where
 * the category calls for one. Derived from the protocol's own record, never from a list of names.
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
      text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.',
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.",
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.',
      cost: 'nothing but the log',
      time: '5 minutes',
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

// ---------------------------------------------------------------- board

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, fit: ModelFit): BoardRow[] {
  const chosen = snapshot.protocols.filter(isNative);
  const scored = chosen.map((p) => {
    const { implied, breakdown } = scoreProtocol(p, snapshot.as_of, fit);
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
    farm_steps: farmSteps(s.p, s.breakdown.age_days).map(stepText),
  }));
}

/** The set-aside protocols, by TVL, with the reason each was set aside. */
export function setAsideRows(snapshot: Snapshot): SetAsideRow[] {
  return snapshot.protocols
    .filter((p) => isRankable(p) && setAsideReason(p) !== null)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      reason: setAsideReason(p)!,
    }));
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
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const fit = fitModel(snapshot.protocols);
  const board = buildBoard(snapshot, fit);
  const live = liveRows(snapshot);
  const setAside = setAsideRows(snapshot);
  const backtest = backtestModel(snapshot.protocols, snapshot.as_of, fit);
  const early = board.filter((r) => r.tvl_usd < snapshot.floor_usd).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    fit,
    backtest,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    set_aside_size: setAside.length,
    rows: board.map(radarRow),
    live,
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
