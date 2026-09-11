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
 * Coherent with the public trajectory: the network moves ≈3.9 GB per contributor-day
 * (growth.mjs ARPU / lab rate) over ≈0.94 nodes of which ~65% are online at any hour,
 * i.e. ≈6 GB per online node-day at the mix of allocations people pick. A node
 * that stays online all day at a generous allocation earns ≈$3.5–5.5
 * (4–6.3 GB × $0.875); at the default 25% allocation ≈$2.2–3.4.
 */
const BASE_DAILY_CAP_GB = 5;

export function dailyCapBytes(device, allocation) {
  const seedMult = 0.8 + device.seed * 0.45; // 0.8x .. 1.25x per device
  const allocMult = Math.min(1, Math.max(0.05, allocation / 100) / 0.4); // full demand from 40% up
  return BASE_DAILY_CAP_GB * GB * seedMult * allocMult;
}

/**
 * Compute bytes relayed over `seconds` for a device.
 * @returns {{ bytes: number, mbps: number, usd: number, burst: boolean }}
 */
export function assign({ device, seconds, allocation, capacityMbps, todayBytes, nowMs }) {
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
  const remaining = Math.max(0, 1 - todayBytes / capBytes);
  util *= remaining < 0.15 ? Math.max(0.05, remaining / 0.15) : 1;

  const mbps = ceilingMbps * util;
  const bytes = Math.round((mbps / 8) * 1e6 * seconds);
  const usd = (bytes / GB) * CONTRIBUTOR_RATE_PER_GB;
  return { bytes, mbps, usd, burst };
}
