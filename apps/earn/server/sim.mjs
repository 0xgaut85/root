/**
 * Per-node traffic model. The extension reports its allocation and measured
 * capacity on every heartbeat; the router "assigns" traffic for the interval
 * since the previous heartbeat. Traffic is bursty (deliveries arrive in
 * clusters) and bounded by a per-node daily demand cap so that the slider
 * matters and earnings stay in the range the network can actually pay.
 */
import { CONTRIBUTOR_RATE_PER_GB, diurnal, noise } from './growth.mjs';

const GB = 1e9;

/**
 * Base daily demand per node at 100% allocation, before regional/seed variation.
 * Halved after the pilot batch of lab jobs finished (growth.mjs TAPER_AT): demand
 * per node is now ≈2–3 GB/day. A node that stays online all day at a generous
 * allocation earns ≈$1.75–2.75 (2–3.1 GB × $0.875); at the default 25% allocation
 * ≈$1.1–1.7. Only affects traffic assigned from now on; hours already credited in
 * `earnings` keep their value.
 */
const BASE_DAILY_CAP_GB = 2.5;
/**
 * Per-account daily cap across all of its devices: $10/day, i.e. ≈11.4 GB at the
 * contributor rate (roughly four devices' worth). The device cap alone was gameable:
 * unpair + re-pair mints a fresh device id with a fresh daily budget, and some accounts
 * cycled through 30–50 device ids a day. The account cap is computed from `earnings`,
 * which keeps rows for deleted devices.
 */
export const USER_DAILY_CAP_USD = 10;
export const USER_DAILY_CAP_GB = USER_DAILY_CAP_USD / CONTRIBUTOR_RATE_PER_GB;

export function dailyCapBytes(device, allocation) {
  const seedMult = 0.8 + device.seed * 0.45; // 0.8x .. 1.25x per device
  const allocMult = Math.min(1, Math.max(0.05, allocation / 100) / 0.4); // full demand from 40% up
  return BASE_DAILY_CAP_GB * GB * seedMult * allocMult;
}

/**
 * Compute bytes relayed over `seconds` for a device.
 * @returns {{ bytes: number, mbps: number, usd: number, burst: boolean }}
 */
export function assign({ device, seconds, allocation, capacityMbps, todayBytes, userTodayBytes = 0, nowMs }) {
  if (device.paused || allocation <= 0 || seconds <= 0) return { bytes: 0, mbps: 0, usd: 0, burst: false };

  const cap = Math.max(5, Math.min(1000, capacityMbps || 40));
  const ceilingMbps = cap * (allocation / 100);

  // Burst schedule: deterministic per (device, 30s bucket) so refreshes agree.
  const bucket = Math.floor(nowMs / 30_000);
  const salt = Math.floor(device.seed * 1e6);
  const r = noise(bucket, salt);
  const demand = 0.55 + 0.45 * diurnal(nowMs);
  const burst = r < 0.22 * demand;

  let util = burst ? 0.25 + 0.4 * noise(bucket, salt + 1) : 0.01 + 0.03 * noise(bucket, salt + 2);

  // Approach the daily cap smoothly, then trickle.
  const capBytes = dailyCapBytes(device, allocation);
  const remaining = Math.min(Math.max(0, 1 - todayBytes / capBytes), Math.max(0, 1 - userTodayBytes / (USER_DAILY_CAP_GB * GB)));
  util *= remaining < 0.15 ? Math.max(0.05, remaining / 0.15) : 1;

  const mbps = ceilingMbps * util;
  let bytes = Math.round((mbps / 8) * 1e6 * seconds);
  // Hard stop at the account cap (the trickle above only slows down; this closes the door).
  bytes = Math.min(bytes, Math.max(0, Math.round(USER_DAILY_CAP_GB * GB - userTodayBytes)));
  const usd = (bytes / GB) * CONTRIBUTOR_RATE_PER_GB;
  return { bytes, mbps, usd, burst };
}
