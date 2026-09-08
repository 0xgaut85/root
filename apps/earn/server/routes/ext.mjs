import { Router } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { q } from '../db.mjs';
import { requireDevice, sha256, randomToken } from '../auth.mjs';
import { assign } from '../sim.mjs';
import { getStartedAt } from '../worker.mjs';
import { snapshot } from '../growth.mjs';

export const ext = Router();

const PROBE = randomBytes(2 * 1024 * 1024);

/** 2 MB of incompressible bytes for the extension's capacity probe. */
ext.get('/probe', (_req, res) => {
  res.set({
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Content-Length': PROBE.length,
    'Access-Control-Allow-Origin': '*',
  });
  res.end(PROBE);
});

function guessName(ua = '') {
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : /Android/.test(ua) ? 'Android' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Brave/.test(ua) ? 'Brave' : /Arc\//.test(ua) ? 'Arc' : /Chrome\//.test(ua) ? 'Chrome' : 'Browser';
  return `${browser} on ${os}`;
}

ext.post('/pair', async (req, res) => {
  const code = String(req.body?.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) return res.status(400).json({ error: 'bad code' });
  const formatted = `${code.slice(0, 3)}-${code.slice(3)}`;
  const { rows } = await q(
    `UPDATE pair_codes SET used_at = now()
     WHERE code = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [formatted],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Code expired or already used' });

  const token = randomToken();
  const id = randomUUID();
  const ua = String(req.body?.userAgent || req.headers['user-agent'] || '');
  const name = String(req.body?.name || guessName(ua)).slice(0, 60);
  await q(
    `INSERT INTO devices (id, user_id, name, token_hash, user_agent, version, seed, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
    [id, rows[0].user_id, name, sha256(token), ua.slice(0, 300), String(req.body?.version || '').slice(0, 20), Math.random()],
  );
  const u = await q('SELECT allocation FROM users WHERE id = $1', [rows[0].user_id]);
  res.json({ deviceToken: token, deviceId: id, name, allocation: u.rows[0]?.allocation ?? 25 });
});

async function deviceStatus(device) {
  const [u, today, total] = await Promise.all([
    q('SELECT allocation, monthly_budget_gb FROM users WHERE id = $1', [device.user_id]),
    q(
      `SELECT coalesce(sum(bytes),0) AS bytes, coalesce(sum(usd),0) AS usd
       FROM earnings WHERE device_id = $1 AND hour >= date_trunc('day', now())`,
      [device.id],
    ),
    q(`SELECT coalesce(sum(usd),0) AS usd FROM earnings WHERE user_id = $1`, [device.user_id]),
  ]);
  const paid = await q(`SELECT coalesce(sum(usd),0) AS usd FROM payouts WHERE user_id = $1 AND status <> 'failed'`, [device.user_id]);
  const allocation = device.allocation ?? u.rows[0]?.allocation ?? 25;
  const started = getStartedAt();
  const net = started ? snapshot(started) : null;
  return {
    deviceId: device.id,
    name: device.name,
    paused: device.paused,
    allocation,
    capacityMbps: device.capacity_mbps,
    mbps: device.last_mbps,
    todayBytes: Number(today.rows[0].bytes),
    todayUsd: Number(today.rows[0].usd),
    totalBytes: Number(device.total_bytes),
    balanceUsd: Math.max(0, Number(total.rows[0].usd) - Number(paid.rows[0].usd)),
    network: net ? { users: net.users, activeNodes: net.activeNodes, throughputMbps: net.throughputMbps } : null,
  };
}

ext.get('/status', requireDevice, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await deviceStatus(req.device));
});

ext.post('/heartbeat', requireDevice, async (req, res) => {
  const d = req.device;
  const b = req.body || {};
  const now = Date.now();
  const last = d.last_seen_at ? new Date(d.last_seen_at).getTime() : now;
  const seconds = Math.max(0, Math.min(60, Math.round((now - last) / 1000)));

  const capacity = Number.isFinite(Number(b.capacityMbps)) && Number(b.capacityMbps) > 0 ? Math.min(2000, Number(b.capacityMbps)) : d.capacity_mbps || 40;

  // The extension may push local overrides (allocation / paused) from its popup.
  let allocation = d.allocation;
  let paused = d.paused;
  if (b.allocation !== undefined && b.allocation !== null) {
    const a = Math.round(Number(b.allocation));
    if (Number.isFinite(a) && a >= 5 && a <= 100) allocation = a;
  }
  if (b.paused !== undefined) paused = Boolean(b.paused);

  const u = await q('SELECT allocation FROM users WHERE id = $1', [d.user_id]);
  const effAlloc = allocation ?? u.rows[0]?.allocation ?? 25;

  const today = await q(
    `SELECT coalesce(sum(bytes),0) AS bytes FROM earnings WHERE device_id = $1 AND hour >= date_trunc('day', now())`,
    [d.id],
  );
  const r = assign({
    device: { ...d, paused },
    seconds,
    allocation: effAlloc,
    capacityMbps: capacity,
    todayBytes: Number(today.rows[0].bytes),
    nowMs: now,
  });

  await q(
    `UPDATE devices SET last_seen_at = now(), capacity_mbps = $2, allocation = $3, paused = $4,
       last_mbps = $5, total_bytes = total_bytes + $6, version = coalesce($7, version)
     WHERE id = $1`,
    [d.id, capacity, allocation, paused, r.mbps, r.bytes, b.version ? String(b.version).slice(0, 20) : null],
  );
  if (r.bytes > 0) {
    await q(
      `INSERT INTO earnings (user_id, device_id, hour, bytes, usd)
       VALUES ($1, $2, date_trunc('hour', now()), $3, $4)
       ON CONFLICT (user_id, device_id, hour) DO UPDATE
         SET bytes = earnings.bytes + EXCLUDED.bytes, usd = earnings.usd + EXCLUDED.usd`,
      [d.user_id, d.id, r.bytes, r.usd],
    );
    await q('INSERT INTO node_samples (device_id, seconds, bytes, mbps) VALUES ($1, $2, $3, $4)', [d.id, seconds, r.bytes, r.mbps]);
  }

  const fresh = await q('SELECT * FROM devices WHERE id = $1', [d.id]);
  res.set('Cache-Control', 'no-store');
  res.json({ ...(await deviceStatus(fresh.rows[0])), burst: r.burst, intervalMs: 10_000 });
});

ext.post('/unpair', requireDevice, async (req, res) => {
  await q('DELETE FROM devices WHERE id = $1', [req.device.id]);
  res.json({ ok: true });
});
