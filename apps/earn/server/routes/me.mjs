import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { q } from '../db.mjs';
import { requireUser } from '../auth.mjs';
import { DEVICE_STALE_MS } from '../worker.mjs';
import { dailyCapBytes } from '../sim.mjs';
import { DEFAULT_RAIL, TREASURY_ADDRESS, isEvmAddress, isRail } from '../rails.mjs';

export const me = Router();
me.use(requireUser);

const MIN_PAYOUT_USD = 5;

function pairCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = randomBytes(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[b[i] % alphabet.length];
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}

function publicDevice(d, userAllocation) {
  const lastSeen = d.last_seen_at ? new Date(d.last_seen_at).getTime() : 0;
  const online = Date.now() - lastSeen < DEVICE_STALE_MS;
  const allocation = d.allocation ?? userAllocation;
  return {
    id: d.id,
    name: d.name,
    online,
    paused: d.paused,
    allocation,
    capacityMbps: d.capacity_mbps,
    mbps: online && !d.paused ? d.last_mbps : 0,
    totalBytes: Number(d.total_bytes),
    dailyCapBytes: dailyCapBytes(d, allocation),
    version: d.version,
    createdAt: d.created_at,
    lastSeenAt: d.last_seen_at,
  };
}

async function summary(user) {
  const [devices, totals, today, hours, payouts] = await Promise.all([
    q('SELECT * FROM devices WHERE user_id = $1 ORDER BY created_at ASC', [user.id]),
    q('SELECT coalesce(sum(usd),0) AS usd, coalesce(sum(bytes),0) AS bytes FROM earnings WHERE user_id = $1', [user.id]),
    q(
      `SELECT coalesce(sum(usd),0) AS usd, coalesce(sum(bytes),0) AS bytes
       FROM earnings WHERE user_id = $1 AND hour >= date_trunc('day', now())`,
      [user.id],
    ),
    q(
      `SELECT hour, sum(usd) AS usd, sum(bytes) AS bytes
       FROM earnings WHERE user_id = $1 AND hour >= now() - interval '7 days'
       GROUP BY hour ORDER BY hour ASC`,
      [user.id],
    ),
    q(`SELECT id, usd, wallet, rail, tx_hash, status, created_at FROM payouts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [user.id]),
  ]);
  const paidOut = payouts.rows.filter((p) => p.status !== 'failed').reduce((a, p) => a + Number(p.usd), 0);
  const earned = Number(totals.rows[0].usd);
  return {
    user: {
      id: user.id,
      email: user.email,
      wallet: user.wallet,
      payoutRail: user.payout_rail || DEFAULT_RAIL,
      displayName: user.display_name,
      referralCode: user.referral_code,
      allocation: user.allocation,
      monthlyBudgetGb: user.monthly_budget_gb,
      autoPayoutUsd: user.auto_payout_usd,
      createdAt: user.created_at,
    },
    balance: {
      earnedUsd: earned,
      paidOutUsd: paidOut,
      availableUsd: Math.max(0, earned - paidOut),
      minPayoutUsd: MIN_PAYOUT_USD,
      totalBytes: Number(totals.rows[0].bytes),
      todayUsd: Number(today.rows[0].usd),
      todayBytes: Number(today.rows[0].bytes),
    },
    treasury: TREASURY_ADDRESS,
    devices: devices.rows.map((d) => publicDevice(d, user.allocation)),
    hours: hours.rows.map((h) => ({ t: new Date(h.hour).getTime(), usd: Number(h.usd), bytes: Number(h.bytes) })),
    payouts: payouts.rows.map((p) => ({
      id: p.id,
      usd: Number(p.usd),
      wallet: p.wallet,
      rail: p.rail || DEFAULT_RAIL,
      txHash: p.tx_hash,
      status: p.status,
      createdAt: p.created_at,
    })),
  };
}

me.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await summary(req.user));
});

me.patch('/', async (req, res) => {
  const b = req.body || {};
  const sets = [];
  const vals = [];
  const add = (col, v) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  if (b.allocation !== undefined) {
    const a = Math.round(Number(b.allocation));
    if (!Number.isFinite(a) || a < 5 || a > 100) return res.status(400).json({ error: 'allocation must be 5..100' });
    add('allocation', a);
  }
  if (b.monthlyBudgetGb !== undefined) {
    const g = b.monthlyBudgetGb === null ? null : Math.round(Number(b.monthlyBudgetGb));
    if (g !== null && (!Number.isFinite(g) || g < 1 || g > 100000)) return res.status(400).json({ error: 'bad budget' });
    add('monthly_budget_gb', g);
  }
  if (b.autoPayoutUsd !== undefined) {
    const v = b.autoPayoutUsd === null ? null : Math.round(Number(b.autoPayoutUsd));
    if (v !== null && ![10, 25, 50, 100].includes(v)) return res.status(400).json({ error: 'bad threshold' });
    add('auto_payout_usd', v);
  }
  if (b.wallet !== undefined) {
    const w = b.wallet === null ? null : String(b.wallet).trim();
    if (w !== null && !isEvmAddress(w)) return res.status(400).json({ error: 'Enter a valid EVM address (0x… 40 hex characters)' });
    add('wallet', w);
  }
  if (b.payoutRail !== undefined) {
    if (!isRail(b.payoutRail)) return res.status(400).json({ error: 'unknown payout rail' });
    add('payout_rail', b.payoutRail);
  }
  if (b.email !== undefined) add('email', b.email === null ? null : String(b.email).slice(0, 200));
  if (b.displayName !== undefined) add('display_name', b.displayName === null ? null : String(b.displayName).slice(0, 60));
  if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
  vals.push(req.user.id);
  const { rows } = await q(`UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
  res.json(await summary(rows[0]));
});

me.post('/pair', async (req, res) => {
  const code = pairCode();
  const expires = new Date(Date.now() + 10 * 60_000);
  await q('INSERT INTO pair_codes (code, user_id, expires_at) VALUES ($1, $2, $3)', [code, req.user.id, expires]);
  res.json({ code, expiresAt: expires.getTime() });
});

me.patch('/devices/:id', async (req, res) => {
  const b = req.body || {};
  const sets = [];
  const vals = [];
  const add = (col, v) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  if (b.name !== undefined) add('name', String(b.name).slice(0, 60) || 'Device');
  if (b.paused !== undefined) add('paused', Boolean(b.paused));
  if (b.allocation !== undefined) {
    const a = b.allocation === null ? null : Math.round(Number(b.allocation));
    if (a !== null && (!Number.isFinite(a) || a < 5 || a > 100)) return res.status(400).json({ error: 'allocation must be 5..100' });
    add('allocation', a);
  }
  if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
  vals.push(req.params.id, req.user.id);
  const { rowCount } = await q(`UPDATE devices SET ${sets.join(', ')} WHERE id = $${vals.length - 1} AND user_id = $${vals.length}`, vals);
  if (!rowCount) return res.status(404).json({ error: 'not found' });
  res.json(await summary(req.user));
});

me.delete('/devices/:id', async (req, res) => {
  await q('DELETE FROM devices WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  res.json(await summary(req.user));
});

me.post('/payouts', async (req, res) => {
  const s = await summary(req.user);
  const usd = Math.floor(Number(req.body?.usd ?? s.balance.availableUsd) * 100) / 100;
  if (!req.user.wallet) return res.status(400).json({ error: 'Add a payout wallet first' });
  if (!Number.isFinite(usd) || usd < MIN_PAYOUT_USD) return res.status(400).json({ error: `Minimum payout is $${MIN_PAYOUT_USD}` });
  if (usd > s.balance.availableUsd + 1e-9) return res.status(400).json({ error: 'Insufficient balance' });
  await q('INSERT INTO payouts (user_id, usd, wallet, rail, status) VALUES ($1, $2, $3, $4, $5)', [
    req.user.id,
    usd,
    req.user.wallet,
    req.user.payout_rail || DEFAULT_RAIL,
    'pending',
  ]);
  res.json(await summary(req.user));
});
