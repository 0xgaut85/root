import { Router } from 'express';
import { q } from '../db.mjs';
import { getStartedAt } from '../worker.mjs';
import { REGIONS, CONTINENTS, apportion, snapshot, noise, HISTORY_DAYS, GROWTH_DAYS, CONTRIBUTOR_SHARE, ARPU_PER_DAY } from '../growth.mjs';
import { TREASURY_ADDRESS, publicRails } from '../rails.mjs';
import { nodeAddress, NODE_ADDRESSES } from '../wallets.mjs';

export const network = Router();

function pickRegion(r) {
  let acc = 0;
  for (const reg of REGIONS) {
    acc += reg.share;
    if (r <= acc) return reg;
  }
  return REGIONS[REGIONS.length - 1];
}

/** Synthetic live delivery feed, deterministic per 4-second bucket. */
function activity(nowMs, count = 14) {
  const out = [];
  let t = nowMs - 800;
  const base = Math.floor(nowMs / 4000);
  for (let i = 0; i < count; i++) {
    const b = base - i;
    const gap = 1800 + noise(b, 3) * 7000;
    const region = pickRegion(noise(b, 5));
    const bytes = Math.round((0.15 + Math.pow(noise(b, 9), 2.2) * 6.5) * 1e6);
    const ms = Math.round(220 + noise(b, 13) * 1400);
    const id = (noise(b, 17) * 0xffff) | 0;
    out.push({
      t,
      region: region.code,
      bytes,
      ms,
      node: `node_${id.toString(16).padStart(4, '0')}`,
      verified: noise(b, 19) > 0.03,
    });
    t -= gap;
  }
  return out;
}

/**
 * Settlement payouts leaving the treasury. Deterministic per 12-minute bucket
 * so every client sees the same list. Sized so that the sum over a day is a
 * plausible fraction of what contributors earned that day (people withdraw
 * a bit less than they earn, and not all at once).
 */
const PAYOUT_BUCKET_MS = 6 * 60_000;
const MIN_PAYOUT = 5;
/** Withdrawal size: $5 minimum, long tail up to ~$60, mean ≈ $14. */
const payoutSize = (r) => MIN_PAYOUT + 55 * Math.pow(r, 2.6);
const MEAN_PAYOUT = MIN_PAYOUT + 55 / 3.6;

function treasuryPayouts(s, nowMs, count = 12) {
  const out = [];
  const base = Math.floor(nowMs / PAYOUT_BUCKET_MS);
  const dailyPool = ARPU_PER_DAY * CONTRIBUTOR_SHARE * s.users; // $/day earned by contributors right now
  const withdrawnPerDay = dailyPool * 0.7; // people leave ~30% sitting in their balance
  const lambda = withdrawnPerDay / MEAN_PAYOUT / (86_400_000 / PAYOUT_BUCKET_MS); // expected payouts per bucket
  // Walk back until we have `count` payouts (or 48h, whichever first).
  for (let i = 0; out.length < count && i < (48 * 60) / 6; i++) {
    const b = base - i;
    const n = Math.floor(lambda) + (noise(b, 23) < lambda - Math.floor(lambda) ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const idx = Math.floor(noise(b, 31 + k) * (NODE_ADDRESSES.length || 100));
      const rail = noise(b, 37 + k) < 0.72 ? 'base-usdc' : 'robinhood-usdg';
      out.push({
        t: b * PAYOUT_BUCKET_MS + Math.floor(noise(b, 41 + k) * PAYOUT_BUCKET_MS),
        to: nodeAddress(idx),
        usd: Math.round(payoutSize(noise(b, 29 + k)) * 100) / 100,
        rail,
      });
    }
  }
  return out.filter((p) => p.t <= nowMs).sort((a, b) => b.t - a.t).slice(0, count);
}

network.get('/', async (_req, res) => {
  const startedAt = getStartedAt();
  if (!startedAt) return res.status(503).json({ error: 'warming up' });
  const now = Date.now();
  const s = snapshot(startedAt, now);

  const { rows } = await q(
    `SELECT date_trunc('hour', ts) AS h,
            max(users)::int AS users, max(nodes)::int AS nodes,
            round(avg(active_nodes))::int AS active_nodes,
            max(gb_total) AS gb_total, max(gross_usd) AS gross_usd
     FROM network_samples
     GROUP BY 1 ORDER BY 1 ASC`,
  );
  const series = rows.map((r) => ({
    t: new Date(r.h).getTime(),
    users: r.users,
    nodes: r.nodes,
    activeNodes: r.active_nodes,
    gbTotal: Number(r.gb_total),
    grossUsd: Number(r.gross_usd),
  }));
  // Always end the series with the live point.
  series.push({ t: now, users: s.users, nodes: s.nodes, activeNodes: s.activeNodes, gbTotal: s.gbTotal, grossUsd: s.grossUsd });

  const counts = apportion(s.nodes);
  const regions = REGIONS.map((r, i) => ({
    code: r.code,
    name: r.name,
    continent: r.continent,
    share: r.share,
    nodes: counts[i],
    gb: s.gbTotal * r.share,
    ratePerGb: Number((s.labRatePerGb * r.mult).toFixed(2)),
  }));
  const continents = CONTINENTS.map((c) => ({
    id: c.id,
    name: c.name,
    share: c.share,
    nodes: regions.filter((r) => r.continent === c.id).reduce((a, r) => a + r.nodes, 0),
  }));

  const dayAgo = series.filter((p) => p.t <= now - 86_400_000).pop();
  const delta24h = dayAgo
    ? {
        users: s.users - dayAgo.users,
        nodes: s.nodes - dayAgo.nodes,
        gbTotal: s.gbTotal - dayAgo.gbTotal,
        grossUsd: s.grossUsd - dayAgo.grossUsd,
      }
    : null;

  res.set('Cache-Control', 'no-store');
  res.json({
    now: s,
    delta24h,
    series,
    regions,
    continents,
    activity: activity(now),
    treasury: {
      address: TREASURY_ADDRESS,
      // Withdrawn so far: what contributors earned, less the part still sitting as dashboard balances.
      paidOutUsd: s.paidToContributorsUsd * 0.7,
      payouts: treasuryPayouts(s, now),
    },
    rails: publicRails(),
    meta: {
      startedAt,
      historyDays: HISTORY_DAYS,
      growthDays: GROWTH_DAYS,
      contributorShare: CONTRIBUTOR_SHARE,
      arpuPerDay: ARPU_PER_DAY,
    },
  });
});
