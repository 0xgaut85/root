/**
 * Public network trajectory.
 *
 * T0 = first boot of the worker (persisted once in network_state.started_at).
 * The chart is backdated HISTORY_DAYS before T0 and the network is scheduled to
 * reach the ceiling GROWTH_DAYS after T0, then keeps compounding slowly.
 *
 *            history start        T0 (boot)            ceiling
 *   users        12       →        100        →          760
 *   gross USD    40       →      1,000        →       11,000
 *
 * Cumulative figures (users, gross, GB) are pure functions of time so that
 * restarts never move them. Only instantaneous figures (active nodes, live
 * throughput) carry a diurnal rhythm and noise.
 */

export const HISTORY_DAYS = 2;
export const GROWTH_DAYS = 4;
export const DAY_MS = 86_400_000;

export const USERS = { start: 12, boot: 100, ceiling: 760 };
export const GROSS = { start: 40, boot: 1_000, ceiling: 11_000 };

/** Labs pay per GB (blended). Contributors receive 80% of it. */
export const LAB_RATE_PER_GB = 1.25;
export const CONTRIBUTOR_SHARE = 0.8;
export const CONTRIBUTOR_RATE_PER_GB = LAB_RATE_PER_GB * CONTRIBUTOR_SHARE;

/** Devices per user and the share of them online at a given hour. */
export const NODES_PER_USER = 1.28;

/** After the ceiling, daily compounding of the cumulative figures. */
const POST_CEILING_DAILY_GROWTH = 0.022;

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * Power curve through three points: value(0)=a, value(k)=b, value(1)=c where
 * k is the normalised position of T0 in the window (HISTORY / (HISTORY+GROWTH)).
 */
function powerCurve(a, b, c) {
  const k = HISTORY_DAYS / (HISTORY_DAYS + GROWTH_DAYS);
  const f = (b - a) / (c - a);
  const exp = Math.log(f) / Math.log(k);
  return (p) => a + (c - a) * Math.pow(clamp01(p), exp);
}

const usersCurve = powerCurve(USERS.start, USERS.boot, USERS.ceiling);
const grossCurve = powerCurve(GROSS.start, GROSS.boot, GROSS.ceiling);

/** Normalised progress through the growth window for a given time. */
export function progress(startedAtMs, nowMs) {
  const windowStart = startedAtMs - HISTORY_DAYS * DAY_MS;
  const span = (HISTORY_DAYS + GROWTH_DAYS) * DAY_MS;
  return (nowMs - windowStart) / span; // may exceed 1 after the ceiling
}

function postCeiling(value, p) {
  if (p <= 1) return value;
  const daysPast = (p - 1) * (HISTORY_DAYS + GROWTH_DAYS);
  return value * Math.pow(1 + POST_CEILING_DAILY_GROWTH, daysPast);
}

export function usersAt(startedAtMs, nowMs) {
  const p = progress(startedAtMs, nowMs);
  return Math.round(postCeiling(usersCurve(p), p));
}

export function grossAt(startedAtMs, nowMs) {
  const p = progress(startedAtMs, nowMs);
  return postCeiling(grossCurve(p), p);
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

/** Aggregate live throughput of the network in Mbps. */
export function throughputMbpsAt(startedAtMs, nowMs) {
  const active = activeNodesAt(startedAtMs, nowMs);
  const bucket = Math.floor(nowMs / 20_000);
  const perNode = 1.4 + 1.2 * diurnal(nowMs) + (noise(bucket, 11) - 0.5) * 0.9;
  return active * perNode;
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

/** Country mix used by the Data page. Shares sum to 1. */
export const REGIONS = [
  { code: 'US', name: 'United States', share: 0.27, mult: 1.0 },
  { code: 'DE', name: 'Germany', share: 0.11, mult: 1.1 },
  { code: 'GB', name: 'United Kingdom', share: 0.09, mult: 1.1 },
  { code: 'FR', name: 'France', share: 0.08, mult: 1.1 },
  { code: 'BR', name: 'Brazil', share: 0.07, mult: 1.3 },
  { code: 'IN', name: 'India', share: 0.06, mult: 1.2 },
  { code: 'CA', name: 'Canada', share: 0.05, mult: 1.0 },
  { code: 'NL', name: 'Netherlands', share: 0.04, mult: 1.1 },
  { code: 'ES', name: 'Spain', share: 0.04, mult: 1.1 },
  { code: 'JP', name: 'Japan', share: 0.04, mult: 1.4 },
  { code: 'AU', name: 'Australia', share: 0.03, mult: 1.3 },
  { code: 'PL', name: 'Poland', share: 0.03, mult: 1.0 },
  { code: 'IT', name: 'Italy', share: 0.03, mult: 1.1 },
  { code: 'OTHER', name: 'Other', share: 0.06, mult: 1.0 },
];
