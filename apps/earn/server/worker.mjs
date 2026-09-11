/**
 * In-process network worker.
 *  - Persists T0 once (network_state.started_at) so restarts never move the curve.
 *  - Backfills 5-minute samples from T0 (minus HISTORY_DAYS) to now on first boot.
 *  - Writes a 5-minute sample of the public trajectory every tick.
 *  - Marks stale devices offline and trims old node samples.
 */
import { q } from './db.mjs';
import { HISTORY_DAYS, DAY_MS, CURVE_VERSION, snapshot } from './growth.mjs';

const TICK_MS = Number(process.env.WORKER_TICK_MS) || 60_000;
const SAMPLE_MS = 5 * 60_000;
export const DEVICE_STALE_MS = 75_000;

let startedAtMs = null;

export function getStartedAt() {
  return startedAtMs;
}

/** T0 for a fresh curve: NETWORK_STARTED_AT if set and valid, else now. */
function t0Override() {
  const raw = process.env.NETWORK_STARTED_AT;
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d : new Date();
}

async function ensureState() {
  const { rows } = await q('SELECT started_at, version FROM network_state WHERE id = 1');
  if (rows[0]) {
    if (rows[0].version !== CURVE_VERSION) {
      // Curve constants changed: the trajectory restarts at a new T0 and the stored samples are regenerated.
      const t0 = t0Override();
      await q('DELETE FROM network_samples');
      await q('UPDATE network_state SET version = $1, started_at = $2 WHERE id = 1', [CURVE_VERSION, t0]);
      console.log(`[worker] curve v${rows[0].version} -> v${CURVE_VERSION}; T0 reset to ${t0.toISOString()}, samples regenerated`);
    }
    const again = await q('SELECT started_at FROM network_state WHERE id = 1');
    startedAtMs = new Date(again.rows[0].started_at).getTime();
    return false;
  }
  const override = t0Override();
  await q('INSERT INTO network_state (id, started_at, version) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING', [override, CURVE_VERSION]);
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

/**
 * Make the stored samples agree with the curve: drop rows that another process
 * (e.g. the previous deployment during a rollout) wrote with a different T0 or
 * curve, and fill every 5-minute bucket from the window start to now.
 */
async function backfill() {
  const from = Math.floor((startedAtMs - HISTORY_DAYS * DAY_MS) / SAMPLE_MS) * SAMPLE_MS;
  const now = Date.now();

  const { rows } = await q('SELECT ts, users, gross_usd FROM network_samples');
  const bad = [];
  const have = new Set();
  for (const r of rows) {
    const t = new Date(r.ts).getTime();
    const s = snapshot(startedAtMs, t);
    if (t < from || Math.abs(r.users - s.users) > 1 || Math.abs(Number(r.gross_usd) - s.grossUsd) > 1) bad.push(r.ts);
    else have.add(t);
  }
  if (bad.length) {
    await q('DELETE FROM network_samples WHERE ts = ANY($1::timestamptz[])', [bad]);
    console.log(`[worker] removed ${bad.length} samples that disagree with the curve`);
  }

  const values = [];
  const params = [];
  for (let t = from; t <= now; t += SAMPLE_MS) {
    if (have.has(t)) continue;
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
    console.log(`[worker] backfilled ${values.length} samples (window from ${new Date(from).toISOString()})`);
  }
}

async function tick() {
  const now = Date.now();
  // A previous deployment may still be running for a minute during a rollout; undo anything it wrote off-curve.
  const recent = await q(`SELECT ts, users FROM network_samples WHERE ts > now() - interval '1 hour'`);
  const bad = recent.rows.filter((r) => Math.abs(r.users - snapshot(startedAtMs, new Date(r.ts).getTime()).users) > 1).map((r) => r.ts);
  if (bad.length) await q('DELETE FROM network_samples WHERE ts = ANY($1::timestamptz[])', [bad]);
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
