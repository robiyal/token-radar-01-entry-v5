// Token radar, model v5 (spec radar5-spec v1) — fresh rewrite from the spec.
//
// The value model, in full: for a pre-token protocol,
//   implied = TVL x M x G x A, capped at 20 x TVL
//   M = 0.2459877056611089, the median market-cap/TVL of the snapshot's own
//       live tokens (fitted on the 119 that record a market cap outside the
//       CEX and DOR categories; see fitMultiple below).
//   G = 1 + 0.5 x clamp(g, -0.8, 2.0), clamped into [0.2, 2.0], where g is
//       the 7-day TVL change as a fraction.
//   A = 0.75 + 0.25 x min(d / 365, 1), where d is the days the protocol has
//       run with no token (listed_at to the snapshot's as_of date).
// Every displayed value in the dashboard is computed by this file, so the
// strip, the hero cards, the table and the detail view all agree to the
// dollar. The multiple is shown as 0.246x, never 0.25x.

export const MODEL_VERSION = 'v5';
export const MODEL_LABEL = 'model v5 — growth + age';
export const SPEC_VERSION = 'radar5-spec v1';
export const FORMULA_TEXT = 'TVL x multiple x growth x maturity';
export const MULTIPLE = 0.2459877056611089;
export const MULTIPLE_DISPLAY = '0.246x';
export const CAP_MULTIPLE = 20;

export interface Protocol {
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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  tvl_usd: number;
  category: string | null;
  chains: string[];
  change_7d_pct: number | null;
  age_days: number | null;
  growth_factor: number;
  maturity_factor: number;
  multiple: number;
  formula: string;
  conformal_low_usd: number;
  conformal_high_usd: number;
  launch_odds: number;
  watchlist: boolean;
  status: string;
}

export interface SetAside {
  slug: string;
  name: string;
  reason: string;
}

export interface Validation {
  multiple: number;
  multiple_fit_n: number;
  multiple_fit_note: string;
  loo_median_abs_pct: number;
  loo_median_signed_pct: number;
  loo_within_2x_pct: number;
  loo_n: number;
  conformal_low_mult: number;
  conformal_high_mult: number;
  conformal_n: number;
  variants: { variant: string; test_median_abs_log_err: number }[];
  variant_winner: string;
  ablation: { model: string; median_abs_log_err: number; median_abs_pct: number }[];
  walk_forward: { fold: string; n: number; median_abs_pct: number }[];
  launch_odds: { category: string; protocols: number; with_token: number; odds: number }[];
}

export interface Radar {
  model_version: string;
  model_label: string;
  spec_version: string;
  formula: string;
  multiple: number;
  multiple_display: string;
  cap_multiple: number;
  as_of: string;
  source: string;
  floor_usd: number;
  rows: BoardRow[];
  validation: Validation;
  accounting: {
    total_protocols: number;
    ranked: number;
    live_token_set_aside: number;
    pre_token_set_aside: number;
    watchlist: number;
    watchlist_ranked: number;
    recorded: number;
  };
  set_aside: SetAside[];
}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return raw;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  if (v.length === 0) throw new Error('median of empty list');
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) throw new Error('quantile of empty list');
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Whole days from an ISO date string to the snapshot date; null when unknown. */
export function ageDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

/** G = 1 + 0.5 x clamp(g, -0.8, 2.0), clamped into [0.2, 2.0]. Null change counts as flat (g = 0). */
export function growthFactor(change7dPct: number | null): number {
  const g = change7dPct === null ? 0 : change7dPct / 100;
  return clamp(1 + 0.5 * clamp(g, -0.8, 2.0), 0.2, 2.0);
}

/** A = 0.75 + 0.25 x min(d / 365, 1). Unknown age is scored at d = 0 (A = 0.75), the conservative end. */
export function maturityFactor(age: number | null): number {
  const d = age === null ? 0 : age;
  return 0.75 + 0.25 * Math.min(d / 365, 1);
}

export interface Implied {
  implied: number;
  growth: number;
  maturity: number;
  ageDays: number | null;
  capped: boolean;
}

export function impliedValue(p: Protocol, asOf: string): Implied {
  const age = ageDays(p.listed_at, asOf);
  const growth = growthFactor(p.change_7d);
  const maturity = maturityFactor(age);
  const raw = p.tvl_usd * MULTIPLE * growth * maturity;
  const cap = CAP_MULTIPLE * p.tvl_usd;
  const implied = Math.max(1, Math.floor(Math.min(raw, cap)));
  return { implied, growth, maturity, ageDays: age, capped: raw > cap };
}

// ---------------------------------------------------------------------------
// Eligibility: which protocols are ranked, and why each other one is set aside.
// ---------------------------------------------------------------------------

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Null when the protocol belongs on the ranked board; otherwise the stated reason it is set aside. */
export function setAsideReason(p: Protocol): string | null {
  if (p.gecko_id !== null || p.symbol !== null) {
    const token = p.symbol ?? p.gecko_id ?? 'a token';
    return `Records a token (${token}) that already trades — the ranked board is for protocols whose token does not exist yet.`;
  }
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) {
    return `Category ${p.category}: a wrapped, bridged, staked or exchange product of a token that already trades, not a protocol awaiting its own launch.`;
  }
  if (WRAPPED_WORD.test(p.name)) {
    return 'Name marks it a wrapped or staked product of a token that already trades.';
  }
  if (EXCHANGE_PREFIXES.some((prefix) => p.name.startsWith(prefix))) {
    return 'Exchange-branded product: a token that already trades, not a protocol awaiting its own launch.';
  }
  if (VERSION_SUFFIX.test(p.name)) {
    return 'Versioned name (for example V2): a later version of a protocol whose token already trades.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Farm plans: concrete, category-specific steps with dollar costs and times.
// Each step is one action a reader can do; amounts are sized for a single
// wallet farming one protocol, and every step names its cost and its time.
// ---------------------------------------------------------------------------

function stepsFor(p: Protocol): string[] {
  const name = p.name;
  const chain = p.chains[0] ?? 'its main chain';
  const chain2 = p.chains[1] ?? chain;
  const cat = p.category ?? 'General';
  const base: Record<string, string[]> = {
    Dexs: [
      `Swap $250 of stablecoins for another asset on ${name} on ${chain}, in 2 trades of about $125 each; about $2 in gas and 10 minutes total.`,
      `Add $250 of liquidity to ${name}'s largest ${chain} pool (stablecoin pair first), holding the LP tokens; about $3 in gas and 15 minutes.`,
      `Leave the position open for at least 14 days and collect any trading fees weekly; withdrawing costs about $3 and takes 5 minutes.`,
      `Repeat a $100 swap on ${name} once a week for 4 weeks to build a regular-user pattern; about $1 in gas per swap and 5 minutes each.`,
      `Bridge $100 of stablecoins to ${chain2} and repeat one $100 swap there if ${name} runs on it; about $4 in bridge fees and 20 minutes.`,
    ],
    Lending: [
      `Deposit $300 of stablecoins as collateral into ${name} on ${chain}; about $3 in gas and 10 minutes, funds stay withdrawable.`,
      `Borrow $100 against that collateral on ${name} (keep the loan under 40% of the collateral so it cannot liquidate); about $3 in gas and 10 minutes.`,
      `Repay the $100 loan after 7 days and re-borrow $100, repeating the cycle 3 times over 3 weeks; about $3 in gas per cycle and 10 minutes each.`,
      `Supply $100 of a second asset on ${name} for 14 days to show two-sided use; about $3 in gas and 10 minutes to deposit.`,
      `Withdraw everything after 30 days, keeping the deposit receipts; the final withdrawal costs about $4 in gas and takes 10 minutes.`,
    ],
    Yield: [
      `Deposit $250 of stablecoins into ${name}'s main vault on ${chain}; about $3 in gas and 10 minutes, funds stay withdrawable.`,
      `Leave the vault position open for 21 days so it accrues a full yield cycle; checking it costs nothing and takes 2 minutes.`,
      `Add a second $100 deposit into a different ${name} vault after 7 days to show repeat use; about $3 in gas and 10 minutes.`,
      `Claim any rewards ${name} pays after 21 days (about $2 in gas, 5 minutes) and immediately redeposit them into the same vault.`,
      `Withdraw half the position after 30 days and keep the rest running; the withdrawal costs about $4 in gas and takes 10 minutes.`,
    ],
    RWA: [
      `Buy $200 of ${name}'s tokenised real-world asset on ${chain} through its primary market; about $5 in gas and fees and 15 minutes.`,
      `Hold the position for at least 30 days to cover one full yield or coupon cycle; holding costs nothing beyond the $200.`,
      `Deposit the $200 position into ${name}'s vault or staking contract if one exists, earning the stated yield; about $4 in gas and 10 minutes.`,
      `Make a second $100 purchase after 14 days to show repeat demand; about $5 in gas and fees and 15 minutes.`,
      `Keep the purchase receipts and wallet history: ${name} rewards documented, long-held positions first, so export the history (free, 5 minutes).`,
    ],
    Derivatives: [
      `Open a $100 leveraged position (2x at most) on ${name} on ${chain} with $50 of margin; about $4 in gas and trading fees and 15 minutes.`,
      `Close the position after 2 days and open a $100 position in the opposite direction; about $4 in fees and 10 minutes per round trip.`,
      `Place 3 limit orders of $50 each on ${name} over one week, cancelling any that do not fill; placing an order costs about $1 and takes 3 minutes.`,
      `Provide $150 of liquidity to ${name}'s market-maker vault for 14 days if it offers one; about $4 in gas and 10 minutes.`,
      `Close all positions after 21 days and keep total losses under $25 by sizing every trade at $100 or less; closing costs about $4 and takes 10 minutes.`,
    ],
    CDP: [
      `Lock $300 of collateral (ETH or a liquid staking token) in a ${name} vault on ${chain}; about $4 in gas and 10 minutes.`,
      `Mint $100 of ${name}'s stablecoin against that collateral, keeping the ratio above 200% so it cannot liquidate; about $4 in gas and 10 minutes.`,
      `Use the $100 minted stablecoin in a ${name}-listed pool for 14 days, then return it and repay the debt; about $5 in gas and 15 minutes.`,
      `Mint a second $100 after 14 days and repay it after another 7 days, showing two full mint-repay cycles; about $4 in gas per cycle.`,
      `Close the vault after 30 days and withdraw the $300 collateral; the final close costs about $5 in gas and takes 10 minutes.`,
    ],
    'Risk Curators': [
      `Deposit $250 of stablecoins into a ${name}-curated vault on ${chain}; about $3 in gas and 10 minutes, funds stay withdrawable.`,
      `Leave the deposit for 21 days so it covers a full curator allocation cycle; checking the vault costs nothing and takes 2 minutes.`,
      `Allocate a second $100 into a different ${name}-curated vault after 7 days to show breadth across curators; about $3 in gas and 10 minutes.`,
      `Vote on any ${name} curator or allocation proposal that opens while you hold a deposit; voting is free except about $1 in gas and takes 5 minutes.`,
      `Withdraw half after 30 days and keep the rest allocated; the withdrawal costs about $4 in gas and takes 10 minutes.`,
    ],
    'Onchain Capital Allocator': [
      `Allocate $250 of stablecoins through ${name} on ${chain} into its flagship allocation; about $4 in gas and 10 minutes.`,
      `Hold the allocation for 30 days to cover one full rebalancing cycle; monitoring it costs nothing and takes 2 minutes a week.`,
      `Add $100 to a second ${name} allocation after 14 days to show repeat allocation; about $4 in gas and 10 minutes.`,
      `Claim any allocation rewards after 30 days and redeposit them; claiming costs about $3 in gas and takes 5 minutes.`,
      `Withdraw the $250 after 45 days, keeping the allocation receipts; the withdrawal costs about $5 in gas and takes 10 minutes.`,
    ],
    'Yield Aggregator': [
      `Deposit $250 of stablecoins into ${name}'s top auto-compounding vault on ${chain}; about $3 in gas and 10 minutes.`,
      `Leave the vault compounding for 21 days without touching it; checking the balance costs nothing and takes 2 minutes.`,
      `Deposit a further $100 into a second ${name} vault after 7 days; about $3 in gas and 10 minutes.`,
      `Harvest and redeposit any vault rewards after 21 days; about $3 in gas and 5 minutes.`,
      `Withdraw everything after 30 days; the final withdrawal costs about $4 in gas and takes 10 minutes.`,
    ],
    'Basis Trading': [
      `Deposit $200 of stablecoins into ${name}'s basis vault on ${chain}; about $4 in gas and 10 minutes, funds stay withdrawable.`,
      `Hold the vault position for 30 days to cover a full funding cycle; checking it costs nothing and takes 2 minutes a week.`,
      `Add a second $100 deposit after 14 days to show repeat use; about $4 in gas and 10 minutes.`,
      `Claim any funding rewards after 30 days and redeposit them into the vault; about $3 in gas and 5 minutes.`,
      `Withdraw half after 45 days and keep the rest running; the withdrawal costs about $5 in gas and takes 10 minutes.`,
    ],
    Chain: [
      `Bridge $150 of stablecoins to ${name} on ${chain} using its official bridge; about $5 in bridge fees and 20 minutes.`,
      `Swap $100 on ${name}'s native decentralised exchange for its gas token; about $2 in gas and 10 minutes.`,
      `Stake or delegate $100 of the gas token through ${name}'s staking page for 21 days; about $3 in gas and 10 minutes.`,
      `Use one ${name} application (lending or trading) with $50 once a week for 3 weeks; about $2 in gas per use and 10 minutes each.`,
      `Keep at least $50 of activity on ${name} every week for a month; a weekly check costs nothing and takes 5 minutes.`,
    ],
    'Staking Pool': [
      `Stake $250 of the pool's asset through ${name} on ${chain}; about $3 in gas and 10 minutes, funds stay withdrawable after any lock.`,
      `Leave the stake for 21 days to cover a full reward epoch; checking it costs nothing and takes 2 minutes.`,
      `Add a second $100 stake after 7 days to show repeat staking; about $3 in gas and 10 minutes.`,
      `Claim staking rewards after 21 days and restake them; about $2 in gas and 5 minutes.`,
      `Unstake half after 30 days and keep the rest staked; unstaking costs about $3 in gas and takes 10 minutes.`,
    ],
  };
  const picked = base[cat] ?? [
    `Use ${name} on ${chain} with $250 of stablecoins in its main product; about $3 in gas and 10 minutes, funds stay withdrawable.`,
    `Repeat the same action with $100 once a week for 4 weeks to build a regular-user pattern; about $2 in gas per use and 5 minutes each.`,
    `Hold a $250 position on ${name} for at least 21 days so it covers a full cycle; checking it costs nothing and takes 2 minutes.`,
    `Claim any rewards ${name} pays after 21 days and redeposit them; about $3 in gas and 5 minutes.`,
    `Withdraw half after 30 days and keep the rest running; the withdrawal costs about $4 in gas and takes 10 minutes.`,
  ];
  return picked;
}

// ---------------------------------------------------------------------------
// Validation, recomputed from the snapshot for the fixed model (v5).
// Live tokens used for fitting are the protocols that record a market cap,
// excluding the CEX and DOR categories, whose ratios are exchange and
// derivative artefacts rather than protocol valuations.
// ---------------------------------------------------------------------------

const FIT_EXCLUDED_CATEGORIES = new Set(['CEX', 'DOR']);

export function fitLive(snapshot: Snapshot): Protocol[] {
  // The multiple's median is taken over the live tokens exactly as recorded:
  // a market cap recorded as 0 means "no market cap", but one protocol
  // (autofinance) records -1, a DefiLlama artefact that the median below
  // includes as recorded. Log-based validation below uses positive caps only.
  return snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd !== 0 && p.tvl_usd > 0 && (p.category === null || !FIT_EXCLUDED_CATEGORIES.has(p.category)),
  );
}

/** Live tokens with a positive market cap: the set log-based validation can use. */
export function positiveLive(snapshot: Snapshot): Protocol[] {
  return fitLive(snapshot).filter((p) => p.mcap_usd! > 0);
}

function logResiduals(live: Protocol[], asOf: string, multiple: number): number[] {
  return live.map((p) => {
    const { growth, maturity } = impliedValue(p, asOf);
    const predicted = p.tvl_usd * multiple * growth * maturity;
    return Math.log(p.mcap_usd! / predicted);
  });
}

function medianAbsPct(live: Protocol[], asOf: string, multiple: number): number {
  const miss = live.map((p) => {
    const { growth, maturity } = impliedValue(p, asOf);
    const predicted = p.tvl_usd * multiple * growth * maturity;
    return Math.abs(p.mcap_usd! - predicted) / p.mcap_usd!;
  });
  return median(miss) * 100;
}

export function computeValidation(snapshot: Snapshot): Validation {
  const live = fitLive(snapshot);
  const ratios = live.map((p) => p.mcap_usd! / p.tvl_usd);
  const fittedMultiple = median(ratios);
  // Log-based statistics (leave-one-out, conformal, ablation, walk-forward,
  // variant selection) run on the positive-cap subset; log(-1) is undefined.
  const pos = positiveLive(snapshot);

  // Leave-one-out: each token is priced by the median of all the others.
  const looMiss: number[] = [];
  const looSigned: number[] = [];
  let within2x = 0;
  for (let i = 0; i < live.length; i++) {
    const others = ratios.filter((_, j) => j !== i);
    const looMultiple = median(others);
    const p = live[i]!;
    const { growth, maturity } = impliedValue(p, snapshot.as_of);
    const predicted = Math.min(p.tvl_usd * looMultiple * growth * maturity, CAP_MULTIPLE * p.tvl_usd);
    const miss = Math.abs(p.mcap_usd! - predicted) / p.mcap_usd!;
    looMiss.push(miss);
    looSigned.push((predicted - p.mcap_usd!) / p.mcap_usd!);
    if (predicted >= p.mcap_usd! / 2 && predicted <= p.mcap_usd! * 2) within2x++;
  }

  // Conformal 90% ranges: 5th and 95th percentiles of the log residuals of
  // the fixed model on the live tokens, turned into multipliers on implied.
  const residuals = logResiduals(pos, snapshot.as_of, fittedMultiple).sort((a, b) => a - b);
  const conformalLow = Math.exp(quantile(residuals, 0.05));
  const conformalHigh = Math.exp(quantile(residuals, 0.95));

  // Launch odds by category: share of the category's protocols that record a token.
  const byCategory = new Map<string, { total: number; withToken: number }>();
  for (const p of snapshot.protocols) {
    const key = p.category ?? 'Uncategorised';
    const entry = byCategory.get(key) ?? { total: 0, withToken: 0 };
    entry.total++;
    if (p.gecko_id !== null || p.symbol !== null) entry.withToken++;
    byCategory.set(key, entry);
  }
  const launchOdds = [...byCategory.entries()]
    .map(([category, v]) => ({ category, protocols: v.total, with_token: v.withToken, odds: v.withToken / v.total }))
    .sort((a, b) => b.odds - a.odds || b.protocols - a.protocols);

  // 32-variant selection: held-out split by slug order (even = train, odd = test).
  // Multiples: median, mean, 10% trimmed mean, median excluding CEX/DOR.
  // Factor sets: bare, growth only, maturity only, growth + maturity.
  // Caps: 20x TVL, none. 4 x 4 x 2 = 32 variants.
  const sortedLive = [...pos].sort((a, b) => a.slug.localeCompare(b.slug));
  const train = sortedLive.filter((_, i) => i % 2 === 0);
  const test = sortedLive.filter((_, i) => i % 2 === 1);
  const trainRatios = train.map((p) => p.mcap_usd! / p.tvl_usd);
  const trimmed = [...trainRatios].sort((a, b) => a - b);
  const trimN = Math.floor(trimmed.length * 0.1);
  const trimmedMean = trimmed.slice(trimN, trimmed.length - trimN).reduce((s, x) => s + x, 0) / (trimmed.length - 2 * trimN);
  const sortedTrain = [...trainRatios].sort((a, b) => a - b);
  const q1 = Math.floor(sortedTrain.length * 0.25);
  const q3 = Math.ceil(sortedTrain.length * 0.75);
  const multiples: Record<string, number> = {
    median: median(trainRatios),
    mean: trainRatios.reduce((s, x) => s + x, 0) / trainRatios.length,
    'trimmed-mean': trimmedMean,
    'iqr-median': median(sortedTrain.slice(q1, q3)),
  };
  const factorSets: Record<string, (p: Protocol) => { g: number; a: number }> = {
    bare: () => ({ g: 1, a: 1 }),
    growth: (p) => ({ g: growthFactor(p.change_7d), a: 1 }),
    maturity: (p) => ({ g: 1, a: maturityFactor(ageDays(p.listed_at, snapshot.as_of)) }),
    'growth+maturity': (p) => ({ g: growthFactor(p.change_7d), a: maturityFactor(ageDays(p.listed_at, snapshot.as_of)) }),
  };
  const variants: { variant: string; test_median_abs_log_err: number }[] = [];
  for (const [multName, mult] of Object.entries(multiples)) {
    for (const [factorName, factorFn] of Object.entries(factorSets)) {
      for (const capName of ['cap-20x', 'no-cap'] as const) {
        const errs = test.map((p) => {
          const { g, a } = factorFn(p);
          let predicted = p.tvl_usd * mult * g * a;
          if (capName === 'cap-20x') predicted = Math.min(predicted, CAP_MULTIPLE * p.tvl_usd);
          return Math.abs(Math.log(p.mcap_usd! / predicted));
        });
        variants.push({
          variant: `${multName} x ${factorName} x ${capName}`,
          test_median_abs_log_err: median(errs),
        });
      }
    }
  }
  variants.sort((a, b) => a.test_median_abs_log_err - b.test_median_abs_log_err);
  const winner = variants[0]!.variant;

  // Ablation on the full live set, fitted multiple held fixed.
  const ablationModels: { model: string; median_abs_log_err: number; median_abs_pct: number }[] = [];
  for (const [model, factorFn] of Object.entries(factorSets)) {
    const errs = pos.map((p) => {
      const { g, a } = factorFn(p);
      const predicted = Math.min(p.tvl_usd * fittedMultiple * g * a, CAP_MULTIPLE * p.tvl_usd);
      return Math.abs(Math.log(p.mcap_usd! / predicted));
    });
    ablationModels.push({
      model,
      median_abs_log_err: median(errs),
      median_abs_pct: median(pos.map((p, i) => Math.abs(p.mcap_usd! - Math.min(p.tvl_usd * fittedMultiple * factorFn(p).g * factorFn(p).a, CAP_MULTIPLE * p.tvl_usd)) / p.mcap_usd!)) * 100,
    });
  }
  ablationModels.sort((a, b) => a.median_abs_log_err - b.median_abs_log_err);

  // Walk-forward: fit the multiple on tokens listed up to a cut-off year,
  // test on tokens listed after it. Listed years come from listed_at.
  const walkForward: { fold: string; n: number; median_abs_pct: number }[] = [];
  for (const cut of [2022, 2023, 2024]) {
    const trainSet = pos.filter((p) => p.listed_at !== null && Number(p.listed_at.slice(0, 4)) <= cut);
    const testSet = pos.filter((p) => p.listed_at !== null && Number(p.listed_at.slice(0, 4)) > cut);
    if (trainSet.length < 5 || testSet.length < 5) continue;
    const fitMult = median(trainSet.map((p) => p.mcap_usd! / p.tvl_usd));
    const miss = testSet.map((p) => {
      const { growth, maturity } = impliedValue(p, snapshot.as_of);
      const predicted = Math.min(p.tvl_usd * fitMult * growth * maturity, CAP_MULTIPLE * p.tvl_usd);
      return Math.abs(p.mcap_usd! - predicted) / p.mcap_usd!;
    });
    walkForward.push({ fold: `listed ≤ ${cut} → listed > ${cut}`, n: testSet.length, median_abs_pct: median(miss) * 100 });
  }

  return {
    multiple: fittedMultiple,
    multiple_fit_n: live.length,
    multiple_fit_note:
      'Median market-cap/TVL over live tokens that record a market cap, excluding CEX and DOR categories; one protocol records a market cap of -1 (autofinance, a DefiLlama artefact) and is included as recorded. The entry uses the full-sample value 0.2459877056611089.',
    loo_median_abs_pct: median(looMiss) * 100,
    loo_median_signed_pct: median(looSigned) * 100,
    loo_within_2x_pct: (within2x / live.length) * 100,
    loo_n: live.length,
    conformal_low_mult: conformalLow,
    conformal_high_mult: conformalHigh,
    conformal_n: pos.length,
    variants,
    variant_winner: winner,
    ablation: ablationModels,
    walk_forward: walkForward,
    launch_odds: launchOdds,
  };
}

// ---------------------------------------------------------------------------
// Board assembly.
// ---------------------------------------------------------------------------

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const validation = computeValidation(snapshot);
  const watch = new Set(snapshot.watchlist);
  const oddsByCategory = new Map(validation.launch_odds.map((o) => [o.category, o.odds]));

  const ranked: { p: Protocol; implied: Implied }[] = [];
  const setAside: SetAside[] = [];
  let liveCount = 0;
  let preTokenSetAside = 0;
  for (const p of snapshot.protocols) {
    const reason = setAsideReason(p);
    if (reason !== null) {
      setAside.push({ slug: p.slug, name: p.name, reason });
      if (p.gecko_id !== null || p.symbol !== null) liveCount++;
      else preTokenSetAside++;
      continue;
    }
    ranked.push({ p, implied: impliedValue(p, snapshot.as_of) });
  }
  ranked.sort((a, b) => b.implied.implied - a.implied.implied || b.p.tvl_usd - a.p.tvl_usd || a.p.slug.localeCompare(b.p.slug));

  const rows: BoardRow[] = ranked.map(({ p, implied }, i) => {
    const low = Math.max(1, Math.floor(implied.implied * validation.conformal_low_mult));
    const high = Math.max(low, Math.floor(implied.implied * validation.conformal_high_mult));
    return {
      slug: p.slug,
      name: p.name,
      rank: i + 1,
      implied_value_usd: implied.implied,
      farm_steps: stepsFor(p),
      tvl_usd: p.tvl_usd,
      category: p.category,
      chains: p.chains,
      change_7d_pct: p.change_7d,
      age_days: implied.ageDays,
      growth_factor: implied.growth,
      maturity_factor: implied.maturity,
      multiple: MULTIPLE,
      formula: FORMULA_TEXT,
      conformal_low_usd: low,
      conformal_high_usd: high,
      launch_odds: oddsByCategory.get(p.category ?? 'Uncategorised') ?? 0,
      watchlist: watch.has(p.slug),
      status: 'pre-token',
    };
  });

  const radar: Radar = {
    model_version: MODEL_VERSION,
    model_label: MODEL_LABEL,
    spec_version: SPEC_VERSION,
    formula: FORMULA_TEXT,
    multiple: MULTIPLE,
    multiple_display: MULTIPLE_DISPLAY,
    cap_multiple: CAP_MULTIPLE,
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    rows,
    validation,
    accounting: {
      total_protocols: snapshot.protocols.length,
      ranked: rows.length,
      live_token_set_aside: liveCount,
      pre_token_set_aside: preTokenSetAside,
      watchlist: snapshot.watchlist.length,
      watchlist_ranked: rows.filter((r) => r.watchlist).length,
      recorded: snapshot.protocols.length,
    },
    set_aside: setAside.sort((a, b) => a.slug.localeCompare(b.slug)),
  };
  return { board: rows, radar };
}

/** The dashboard's data file: one global, no network, same numbers as board.json. */
export function dataScript(radar: Radar): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}

/** Gate-shaped self-checks; null when the board is acceptable. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, gate wants 100 to 4000`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (let i = 0; i < board.length; i++) {
    const row = board[i]!;
    if (!slugs.has(row.slug)) return `row ${i + 1} names ${row.slug}, not in the snapshot`;
    if (seen.has(row.slug)) return `slug ${row.slug} appears twice`;
    seen.add(row.slug);
    if (row.rank !== i + 1) return `row ${i + 1} has rank ${row.rank}, expected ${i + 1}`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `row ${row.slug} has a bad implied value`;
    if (i > 0 && row.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${row.slug} is out of value order`;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `row ${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const step of row.farm_steps) {
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) return `row ${row.slug} has a farm step of ${trimmed.length} characters`;
    }
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  return null;
}
