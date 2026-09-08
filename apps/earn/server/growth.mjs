/**
 * Public network trajectory.
 *
 * T0 = first boot of the worker (persisted once in network_state.started_at).
 * The chart is backdated HISTORY_DAYS before T0 and the network is scheduled to
 * reach the ceiling GROWTH_DAYS after T0, then keeps compounding slowly.
 *
 *            history start        T0 (boot)            ceiling
 *   users        48       →        100        →          760
 *   gross USD   (derived) →      1,000        →       11,000
 *
 * The history window is the closed pilot (invited contributors) that preceded
 * the public opening at T0.
 *
 * Revenue is not an independent curve: it is the integral of contributors ×
 * a constant revenue per contributor-day (ARPU). ARPU is solved so that gross
 * passes through $1,000 at T0 and $11,000 at the ceiling. This keeps every
 * derived figure coherent by construction: daily revenue, GB per day and live
 * throughput are all proportional to how many contributors exist at that
 * moment, and there is no kink when the growth window ends.
 *
 * Cumulative figures (users, gross, GB) are pure functions of time so that
 * restarts never move them. Only instantaneous figures (active nodes, live
 * throughput) carry a diurnal rhythm and noise.
 *
 * Bump CURVE_VERSION whenever the curve constants change; the worker then
 * discards stored samples and re-backfills so the chart has no kink.
 */

export const CURVE_VERSION = 2;
export const HISTORY_DAYS = 2;
export const GROWTH_DAYS = 4;
export const DAY_MS = 86_400_000;

export const USERS = { start: 48, boot: 100, ceiling: 760 };
export const GROSS = { boot: 1_000, ceiling: 11_000 };

/** Labs pay per GB (blended). Contributors receive 80% of it. */
export const LAB_RATE_PER_GB = 1.25;
export const CONTRIBUTOR_SHARE = 0.8;
export const CONTRIBUTOR_RATE_PER_GB = LAB_RATE_PER_GB * CONTRIBUTOR_SHARE;

/** Devices per user and the share of them online at a given hour. */
export const NODES_PER_USER = 1.28;

/** After the ceiling, daily compounding of the contributor count. */
const POST_CEILING_DAILY_GROWTH = 0.022;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const SPAN_DAYS = HISTORY_DAYS + GROWTH_DAYS;
const K = HISTORY_DAYS / SPAN_DAYS; // normalised position of T0

/**
 * Power curve through three points: value(0)=a, value(k)=b, value(1)=c where
 * k is the normalised position of T0 in the window (HISTORY / (HISTORY+GROWTH)).
 */
function powerCurve(a, b, c) {
  const f = (b - a) / (c - a);
  const exp = Math.log(f) / Math.log(K);
  return (p) => a + (c - a) * Math.pow(clamp01(p), exp);
}

const usersCurve = powerCurve(USERS.start, USERS.boot, USERS.ceiling);

/** Contributors as a continuous function of normalised progress (post-ceiling compounding included). */
function usersRaw(p) {
  if (p <= 1) return usersCurve(p);
  return USERS.ceiling * Math.pow(1 + POST_CEILING_DAILY_GROWTH, (p - 1) * SPAN_DAYS);
}

/** ∫ users dp over [0, p], in contributor-days (p is in units of the window; ×SPAN_DAYS converts). */
const STEPS = 1200;
const usersCum = new Float64Array(STEPS + 1);
for (let i = 1; i <= STEPS; i++) {
  const a = usersRaw((i - 1) / STEPS);
  const b = usersRaw(i / STEPS);
  usersCum[i] = usersCum[i - 1] + ((a + b) / 2) * (SPAN_DAYS / STEPS);
}
function userDays(p) {
  if (p <= 0) return 0;
  if (p <= 1) {
    const x = p * STEPS;
    const i = Math.min(STEPS - 1, Math.floor(x));
    return usersCum[i] + (usersCum[i + 1] - usersCum[i]) * (x - i);
  }
  const days = (p - 1) * SPAN_DAYS;
  const g = Math.log(1 + POST_CEILING_DAILY_GROWTH);
  return usersCum[STEPS] + (USERS.ceiling * (Math.exp(g * days) - 1)) / g;
}

/** Revenue per contributor-day, solved from the two anchors. */
export const ARPU_PER_DAY = (GROSS.ceiling - GROSS.boot) / (userDays(1) - userDays(K));
const GROSS_START = GROSS.boot - ARPU_PER_DAY * userDays(K);

/** Normalised progress through the growth window for a given time. */
export function progress(startedAtMs, nowMs) {
  const windowStart = startedAtMs - HISTORY_DAYS * DAY_MS;
  return (nowMs - windowStart) / (SPAN_DAYS * DAY_MS); // may exceed 1 after the ceiling
}

export function usersAt(startedAtMs, nowMs) {
  return Math.round(usersRaw(progress(startedAtMs, nowMs)));
}

export function grossAt(startedAtMs, nowMs) {
  return GROSS_START + ARPU_PER_DAY * userDays(progress(startedAtMs, nowMs));
}

export function gbAt(startedAtMs, nowMs) {
  return grossAt(startedAtMs, nowMs) / LAB_RATE_PER_GB;
}

export function nodesAt(startedAtMs, nowMs) {
  return Math.round(usersAt(startedAtMs, nowMs) * NODES_PER_USER);
}

/** Deterministic hash noise in [0,1) for a time bucket. */
export function noise(bucket, salt = 0) {
  let x = Math.imul((bucket | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 0x27d4eb2f, 0xc2b2ae35);
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12;
  x = Math.imul(x, 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

/** Diurnal share of nodes online. Peaks in the evening (UTC-weighted to EU/US). */
export function diurnal(nowMs) {
  const h = ((nowMs / 3_600_000) % 24 + 24) % 24; // UTC hour, fractional
  // Two humps: EU evening (~19 UTC) and US evening (~02 UTC), trough ~10 UTC.
  const eu = Math.exp(-Math.pow((h - 19) / 4.2, 2));
  const us = Math.exp(-Math.pow((((h + 22) % 24) - 0) / 4.5, 2)) * 0.85;
  return clamp01(0.35 + 0.65 * Math.min(1, eu + us));
}

export function activeNodesAt(startedAtMs, nowMs) {
  const nodes = nodesAt(startedAtMs, nowMs);
  const bucket = Math.floor(nowMs / 300_000);
  const jitter = (noise(bucket, 7) - 0.5) * 0.06;
  const share = clamp01(0.52 + 0.24 * diurnal(nowMs) + jitter);
  return Math.max(1, Math.round(nodes * share));
}

/**
 * Aggregate live throughput of the network in Mbps.
 * Anchored to the derivative of the cumulative GB curve so that the live
 * figure, integrated over a day, reproduces the GB the ledger actually adds.
 * A diurnal modulation (mean ≈ 1) and short-lived jitter sit on top.
 */
export function throughputMbpsAt(startedAtMs, nowMs) {
  const h = 1_800_000; // ±30 min central difference
  const gbPerMs = (gbAt(startedAtMs, nowMs + h) - gbAt(startedAtMs, nowMs - h)) / (2 * h);
  const meanMbps = gbPerMs * 1000 * 8000; // GB/ms → GB/s → Mbit/s
  const bucket = Math.floor(nowMs / 20_000);
  const mod = 0.72 + 0.56 * diurnal(nowMs) + (noise(bucket, 11) - 0.5) * 0.18;
  return Math.max(0.5, meanMbps * mod);
}

export function snapshot(startedAtMs, nowMs = Date.now()) {
  const users = usersAt(startedAtMs, nowMs);
  const nodes = nodesAt(startedAtMs, nowMs);
  const active = activeNodesAt(startedAtMs, nowMs);
  const gross = grossAt(startedAtMs, nowMs);
  const gb = gross / LAB_RATE_PER_GB;
  return {
    t: nowMs,
    users,
    nodes,
    activeNodes: active,
    gbTotal: gb,
    grossUsd: gross,
    paidToContributorsUsd: gross * CONTRIBUTOR_SHARE,
    networkFeeUsd: gross * (1 - CONTRIBUTOR_SHARE),
    labRatePerGb: LAB_RATE_PER_GB,
    contributorRatePerGb: CONTRIBUTOR_RATE_PER_GB,
    throughputMbps: throughputMbpsAt(startedAtMs, nowMs),
    progress: clamp01(progress(startedAtMs, nowMs)),
  };
}

/**
 * Country mix used by the Data page and the node map. Shares sum to 1 and roll
 * up to the continent targets: Americas 50%, Europe 30%, Asia-Pacific 15%,
 * Africa 5%. `mult` is the lab rate for that country relative to the blended
 * rate (harder-to-reach regions bill higher).
 */
export const CONTINENTS = [
  { id: 'americas', name: 'Americas', share: 0.5 },
  { id: 'europe', name: 'Europe', share: 0.3 },
  { id: 'asia', name: 'Asia-Pacific', share: 0.15 },
  { id: 'africa', name: 'Africa', share: 0.05 },
];

export const REGIONS = [
  // Americas · 50
  { code: 'US', name: 'United States', continent: 'americas', share: 0.31, mult: 1.0 },
  { code: 'BR', name: 'Brazil', continent: 'americas', share: 0.07, mult: 1.3 },
  { code: 'CA', name: 'Canada', continent: 'americas', share: 0.05, mult: 1.0 },
  { code: 'MX', name: 'Mexico', continent: 'americas', share: 0.03, mult: 1.2 },
  { code: 'AR', name: 'Argentina', continent: 'americas', share: 0.02, mult: 1.3 },
  { code: 'CO', name: 'Colombia', continent: 'americas', share: 0.01, mult: 1.3 },
  { code: 'CL', name: 'Chile', continent: 'americas', share: 0.01, mult: 1.3 },
  // Europe · 30
  { code: 'DE', name: 'Germany', continent: 'europe', share: 0.07, mult: 1.1 },
  { code: 'GB', name: 'United Kingdom', continent: 'europe', share: 0.06, mult: 1.1 },
  { code: 'FR', name: 'France', continent: 'europe', share: 0.05, mult: 1.1 },
  { code: 'NL', name: 'Netherlands', continent: 'europe', share: 0.03, mult: 1.1 },
  { code: 'ES', name: 'Spain', continent: 'europe', share: 0.03, mult: 1.1 },
  { code: 'IT', name: 'Italy', continent: 'europe', share: 0.02, mult: 1.1 },
  { code: 'PL', name: 'Poland', continent: 'europe', share: 0.02, mult: 1.0 },
  { code: 'SE', name: 'Sweden', continent: 'europe', share: 0.01, mult: 1.2 },
  { code: 'PT', name: 'Portugal', continent: 'europe', share: 0.01, mult: 1.1 },
  // Asia-Pacific · 15
  { code: 'IN', name: 'India', continent: 'asia', share: 0.05, mult: 1.2 },
  { code: 'JP', name: 'Japan', continent: 'asia', share: 0.03, mult: 1.4 },
  { code: 'KR', name: 'South Korea', continent: 'asia', share: 0.02, mult: 1.4 },
  { code: 'PH', name: 'Philippines', continent: 'asia', share: 0.02, mult: 1.2 },
  { code: 'ID', name: 'Indonesia', continent: 'asia', share: 0.01, mult: 1.2 },
  { code: 'VN', name: 'Vietnam', continent: 'asia', share: 0.01, mult: 1.2 },
  { code: 'AU', name: 'Australia', continent: 'asia', share: 0.01, mult: 1.3 },
  // Africa · 5
  { code: 'NG', name: 'Nigeria', continent: 'africa', share: 0.02, mult: 1.5 },
  { code: 'ZA', name: 'South Africa', continent: 'africa', share: 0.02, mult: 1.4 },
  { code: 'KE', name: 'Kenya', continent: 'africa', share: 0.01, mult: 1.5 },
];

/**
 * Integer node counts per region that sum exactly to `nodes` (largest-remainder
 * apportionment), so the map, the region bars and the headline agree.
 */
export function apportion(nodes) {
  const raw = REGIONS.map((r) => nodes * r.share);
  const base = raw.map(Math.floor);
  let left = nodes - base.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - base[i], i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0 && k < order.length; k++, left--) base[order[k][1]]++;
  return base;
}
