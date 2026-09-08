/**
 * In-process network worker.
 *  - Persists T0 once (network_state.started_at) so restarts never move the curve.
 *  - Backfills HISTORY_DAYS of hourly samples before T0 on first boot.
 *  - Writes a 5-minute sample of the public trajectory every tick.
 *  - Marks stale devices offline and trims old node samples.
 */
import { q } from './db.mjs';
import { HISTORY_DAYS, DAY_MS, snapshot } from './growth.mjs';

const TICK_MS = Number(process.env.WORKER_TICK_MS) || 60_000;
const SAMPLE_MS = 5 * 60_000;
export const DEVICE_STALE_MS = 75_000;

let startedAtMs = null;

export function getStartedAt() {
  return startedAtMs;
}

async function ensureState() {
  const { rows } = await q('SELECT started_at FROM network_state WHERE id = 1');
  if (rows[0]) {
    startedAtMs = new Date(rows[0].started_at).getTime();
    return false;
  }
  const override = process.env.NETWORK_STARTED_AT ? new Date(process.env.NETWORK_STARTED_AT) : new Date();
  await q('INSERT INTO network_state (id, started_at) VALUES (1, $1) ON CONFLICT (id) DO NOTHING', [override]);
  const again = await q('SELECT started_at FROM network_state WHERE id = 1');
  startedAtMs = new Date(again.rows[0].started_at).getTime();
  console.log('[worker] T0 written', new Date(startedAtMs).toISOString());
  return true;
}

async function writeSample(tMs) {
  const s = snapshot(startedAtMs, tMs);
  await q(
    `INSERT INTO network_samples (ts, users, nodes, active_nodes, gb_total, gross_usd)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (ts) DO NOTHING`,
    [new Date(tMs), s.users, s.nodes, s.activeNodes, s.gbTotal, s.grossUsd],
  );
}

async function backfill() {
  const { rows } = await q('SELECT count(*)::int AS n FROM network_samples');
  if (rows[0].n > 0) return;
  const from = startedAtMs - HISTORY_DAYS * DAY_MS;
  const now = Date.now();
  const values = [];
  const params = [];
  for (let t = Math.floor(from / SAMPLE_MS) * SAMPLE_MS; t <= now; t += SAMPLE_MS) {
    const s = snapshot(startedAtMs, t);
    const i = params.length;
    values.push(`($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6})`);
    params.push(new Date(t), s.users, s.nodes, s.activeNodes, s.gbTotal, s.grossUsd);
  }
  if (values.length) {
    await q(
      `INSERT INTO network_samples (ts, users, nodes, active_nodes, gb_total, gross_usd)
       VALUES ${values.join(',')} ON CONFLICT (ts) DO NOTHING`,
      params,
    );
  }
  console.log(`[worker] backfilled ${values.length} samples from ${new Date(from).toISOString()}`);
}

async function tick() {
  const now = Date.now();
  // Fill any 5-minute buckets missed while the process was down.
  const { rows } = await q('SELECT max(ts) AS last FROM network_samples');
  const last = rows[0].last ? new Date(rows[0].last).getTime() : now - SAMPLE_MS;
  for (let t = last + SAMPLE_MS; t <= now; t += SAMPLE_MS) await writeSample(t);

  await q(`DELETE FROM node_samples WHERE ts < now() - interval '3 days'`);
  await q(`DELETE FROM pair_codes WHERE expires_at < now() - interval '1 day'`);
}

export async function startWorker() {
  const fresh = await ensureState();
  await backfill();
  if (fresh) console.log('[worker] fresh network; trajectory begins');
  const s = snapshot(startedAtMs);
  console.log(
    `[worker] now users=${s.users} nodes=${s.nodes}/${s.activeNodes} gross=$${s.grossUsd.toFixed(0)} progress=${(s.progress * 100).toFixed(1)}%`,
  );
  const loop = async () => {
    try {
      await tick();
    } catch (e) {
      console.error('[worker] tick failed', e.message);
    }
  };
  setInterval(loop, TICK_MS).unref();
  await loop();
}
