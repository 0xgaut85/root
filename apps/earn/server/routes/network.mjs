import { Router } from 'express';
import { q } from '../db.mjs';
import { getStartedAt } from '../worker.mjs';
import { REGIONS, CONTINENTS, apportion, snapshot, noise, HISTORY_DAYS, GROWTH_DAYS, CONTRIBUTOR_SHARE, ARPU_PER_DAY } from '../growth.mjs';
import { TREASURY_ADDRESS, publicRails } from '../rails.mjs';
import { payerEnabled, recentTreasuryTxs, treasuryTotals } from '../payer.mjs';

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

network.get('/', async (_req, res) => {
  const startedAt = getStartedAt();
  if (!startedAt) return res.status(503).json({ error: 'warming up' });
  const now = Date.now();
  const s = snapshot(startedAt, now);

  // Treasury feed: only real on-chain transfers (see payer.mjs), never synthetic.
  const [txs, tot] = await Promise.all([recentTreasuryTxs(10), treasuryTotals()]);

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
  // Regional lab rates are relative to the *blended* rate: their share-weighted mean is exactly
  // labRatePerGb, so Σ region.gb × region.ratePerGb reproduces grossUsd (cheap regions sit below
  // $1.25, hard-to-reach ones above).
  const blend = REGIONS.reduce((a, r) => a + r.share * r.mult, 0);
  const regions = REGIONS.map((r, i) => ({
    code: r.code,
    name: r.name,
    continent: r.continent,
    share: r.share,
    nodes: counts[i],
    gb: s.gbTotal * r.share,
    ratePerGb: Number(((s.labRatePerGb * r.mult) / blend).toFixed(2)),
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
      live: payerEnabled,
      paidOutUsd: tot.paidOutUsd,
      count: tot.count,
      payouts: txs,
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
