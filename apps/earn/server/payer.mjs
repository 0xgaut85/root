/**
 * Treasury payer — real on-chain settlement from the treasury wallet.
 *
 * Enabled when TREASURY_PRIVATE_KEY is set (the key must derive to
 * TREASURY_ADDRESS, otherwise the payer refuses to start). It sends ERC-20
 * transfers (USDC on Base, USDG on Robinhood Chain) from the treasury to node
 * payout wallets and records every transaction in `treasury_txs`; the public
 * feed on the Data page shows only these rows, nothing synthetic.
 *
 * Pacing:
 *  - Bootstrap: until MIN_FEED transactions are confirmed it sends one every
 *    BOOT_MS so the feed fills within minutes.
 *  - Steady state: cumulative payouts follow WITHDRAW_SHARE of what contributors
 *    have earned on the public curve (people leave ~30% in their balance). At
 *    most one transfer per tick, so a long downtime never turns into a burst.
 *  - Rail split: each payout draws its rail with probability RAILS[*].share
 *    (≈70% Robinhood Chain / 30% Base, so the realised mix wanders around
 *    that), falling back to the other rail when one is short of funds.
 *
 * Recycling (RECYCLE_PAYOUTS, default on): the node wallets are ours, so each
 * node payout is scheduled to come back. 20–180 minutes after a payout
 * confirms, the node wallet sends its whole stablecoin balance to RECYCLE_TO
 * (default: the treasury). If the wallet has no ETH for gas the treasury first
 * tops it up with enough for ~25 sweeps. Both legs are recorded in
 * `recycle_txs` (never in the public feed). The treasury therefore only needs
 * a float of a few hundred dollars per rail plus gas, not the full weekly sum.
 * Needs NODE_WALLETS entries with `pk`; wallets without a key are simply never
 * swept.
 *
 * Contributor withdrawals from the dashboard (`payouts` table) are NOT sent
 * automatically unless PAY_USER_WITHDRAWALS=1: contributor balances come from
 * the traffic simulation, so paying them out is a product decision, not a
 * background job. They stay `pending` for manual review otherwise. Real users
 * are of course never recycled — only addresses we hold the key for are.
 */
import { createPublicClient, createWalletClient, http, defineChain, erc20Abi, parseUnits, formatUnits, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { q } from './db.mjs';
import { snapshot } from './growth.mjs';
import { getStartedAt } from './worker.mjs';
import { RAILS, RAIL_IDS, TREASURY_ADDRESS, isEvmAddress } from './rails.mjs';
import { NODE_ADDRESSES, nodeKey, NODE_KEYS_LOADED } from './wallets.mjs';

const MIN_FEED = 10;
const BOOT_MS = 25_000;
const TICK_MS = Number(process.env.PAYER_TICK_MS) || 45_000;
const WITHDRAW_SHARE = 0.7;
const MIN_PAYOUT = 5;
const CONFIRM_TIMEOUT_MS = 150_000;
const PAY_USERS = process.env.PAY_USER_WITHDRAWALS === '1';

const RECYCLE = process.env.RECYCLE_PAYOUTS !== '0';
const RECYCLE_TO = isEvmAddress(process.env.RECYCLE_TO || '') ? process.env.RECYCLE_TO : TREASURY_ADDRESS;
const RECYCLE_DELAY_MIN = [20, 180]; // minutes, uniform
const SWEEP_GAS = 70_000n; // ERC-20 transfer, generous
const GAS_FLOOR_WEI = { 'base-usdc': 50_000_000_000_000n /* 0.00005 ETH */, 'robinhood-usdg': 200_000_000_000_000n /* 0.0002 ETH */ };

const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RAILS['robinhood-usdg'].rpc] } },
  blockExplorers: { default: { name: 'Blockscout', url: RAILS['robinhood-usdg'].explorer } },
});
const CHAINS = { 'base-usdc': base, 'robinhood-usdg': robinhood };

export let payerEnabled = false;
let account = null;
const clients = {};
let backoffUntil = 0;
let sending = false;

function client(railId) {
  if (!clients[railId]) {
    const chain = CHAINS[railId];
    const transport = http(RAILS[railId].rpc, { timeout: 20_000, retryCount: 2 });
    clients[railId] = {
      pub: createPublicClient({ chain, transport }),
      wallet: createWalletClient({ account, chain, transport }),
    };
  }
  return clients[railId];
}

/** Withdrawal size: $5 minimum, long tail to ~$60, mean ≈ $14. */
const payoutSize = (r) => MIN_PAYOUT + 55 * Math.pow(r, 2.6);
const round2 = (x) => Math.round(x * 100) / 100;

function pickRail(rand) {
  let acc = 0;
  for (const id of RAIL_IDS) {
    acc += RAILS[id].share;
    if (rand <= acc) return id;
  }
  return RAIL_IDS[0];
}

async function tokenBalance(railId) {
  const { pub } = client(railId);
  const r = RAILS[railId];
  const raw = await pub.readContract({ address: r.token, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
  return Number(formatUnits(raw, r.decimals));
}

async function gasBalance(railId) {
  const { pub } = client(railId);
  return Number(formatUnits(await pub.getBalance({ address: account.address }), 18));
}

/** Send `usd` of the rail's stablecoin to `to`; records the row and waits for the receipt. */
async function transfer({ railId, to, usd, kind, payoutId = null }) {
  const r = RAILS[railId];
  const { pub, wallet } = client(railId);
  const amount = parseUnits(usd.toFixed(2), r.decimals);
  const hash = await wallet.writeContract({ address: r.token, abi: erc20Abi, functionName: 'transfer', args: [to, amount] });
  // Node payouts come back to us after a random delay; user payouts never do.
  const recycleMin = kind === 'node' && nodeKey(to) ? Math.round(RECYCLE_DELAY_MIN[0] + Math.random() * (RECYCLE_DELAY_MIN[1] - RECYCLE_DELAY_MIN[0])) : null;
  const ins = await q(
    `INSERT INTO treasury_txs (rail, to_addr, usd, amount_raw, tx_hash, status, kind, payout_id, recycle_due)
     VALUES ($1, $2, $3, $4, $5, 'sent', $6, $7, now() + make_interval(mins => $8::int)) RETURNING id`,
    [railId, to, usd, amount.toString(), hash, kind, payoutId, recycleMin],
  );
  const id = ins.rows[0].id;
  console.log(`[payer] sent ${usd.toFixed(2)} ${r.asset} on ${r.chain} -> ${to} ${hash}`);
  try {
    const rcpt = await pub.waitForTransactionReceipt({ hash, timeout: CONFIRM_TIMEOUT_MS, confirmations: 1 });
    const ok = rcpt.status === 'success';
    await q(`UPDATE treasury_txs SET status = $2, confirmed_at = now(), block = $3 WHERE id = $1`, [id, ok ? 'confirmed' : 'failed', Number(rcpt.blockNumber)]);
    if (!ok) console.error(`[payer] reverted ${hash}`);
    return ok;
  } catch (e) {
    // Not confirmed within the window; leave it as 'sent' and reconcile on a later tick.
    console.warn(`[payer] receipt pending for ${hash}: ${e.message}`);
    return true;
  }
}

/** Settle any 'sent' rows whose receipts arrived after our wait timed out. */
async function reconcile() {
  const { rows } = await q(`SELECT id, rail, tx_hash FROM treasury_txs WHERE status = 'sent' AND created_at < now() - interval '3 minutes' LIMIT 5`);
  for (const row of rows) {
    try {
      const rcpt = await client(row.rail).pub.getTransactionReceipt({ hash: row.tx_hash });
      await q(`UPDATE treasury_txs SET status = $2, confirmed_at = now(), block = $3 WHERE id = $1`, [row.id, rcpt.status === 'success' ? 'confirmed' : 'failed', Number(rcpt.blockNumber)]);
    } catch {
      // still pending or dropped; if it is older than an hour give up on it
      await q(`UPDATE treasury_txs SET status = 'failed' WHERE id = $1 AND created_at < now() - interval '1 hour'`, [row.id]);
    }
  }
}

async function totals() {
  const { rows } = await q(`SELECT count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
                                   count(*) FILTER (WHERE status <> 'failed')::int AS live,
                                   coalesce(sum(usd) FILTER (WHERE status <> 'failed'), 0)::float AS usd
                            FROM treasury_txs`);
  return rows[0];
}

/** Choose a rail that can cover `usd` (+ gas); preferred first, then the other. */
async function fundedRail(preferred, usd) {
  const order = [preferred, ...RAIL_IDS.filter((x) => x !== preferred)];
  for (const id of order) {
    try {
      const [bal, gas] = await Promise.all([tokenBalance(id), gasBalance(id)]);
      if (bal >= usd && gas > 0.0002) return id;
      console.warn(`[payer] ${RAILS[id].chain}: ${RAILS[id].asset} ${bal.toFixed(2)} / gas ${gas.toFixed(5)} ETH — cannot cover $${usd.toFixed(2)}`);
    } catch (e) {
      console.warn(`[payer] ${RAILS[id].chain} balance check failed: ${e.message}`);
    }
  }
  return null;
}

async function payUserWithdrawal() {
  const { rows } = await q(`SELECT id, usd, wallet, rail FROM payouts WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`);
  const p = rows[0];
  if (!p || !isEvmAddress(p.wallet)) return false;
  const railId = await fundedRail(RAILS[p.rail] ? p.rail : RAIL_IDS[0], Number(p.usd));
  if (!railId) return false;
  await q(`UPDATE payouts SET status = 'processing' WHERE id = $1`, [p.id]);
  const ok = await transfer({ railId, to: p.wallet, usd: Number(p.usd), kind: 'user', payoutId: p.id });
  const tx = await q(`SELECT tx_hash FROM treasury_txs WHERE payout_id = $1 ORDER BY id DESC LIMIT 1`, [p.id]);
  await q(`UPDATE payouts SET status = $2, tx_hash = $3, rail = $4 WHERE id = $1`, [p.id, ok ? 'paid' : 'failed', tx.rows[0]?.tx_hash || null, railId]);
  return true;
}

/* ------------------------------------------------------------------ */
/* Recycling: node wallet -> RECYCLE_TO                                 */
/* ------------------------------------------------------------------ */

async function recordRecycle({ railId, wallet, kind, amountRaw, usd, hash }) {
  const ins = await q(
    `INSERT INTO recycle_txs (rail, wallet, kind, amount_raw, usd, tx_hash) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [railId, wallet, kind, amountRaw.toString(), usd, hash],
  );
  return ins.rows[0].id;
}

async function waitRecycle(railId, id, hash) {
  try {
    const rcpt = await client(railId).pub.waitForTransactionReceipt({ hash, timeout: CONFIRM_TIMEOUT_MS, confirmations: 1 });
    const ok = rcpt.status === 'success';
    await q(`UPDATE recycle_txs SET status = $2, confirmed_at = now() WHERE id = $1`, [id, ok ? 'confirmed' : 'failed']);
    return ok;
  } catch (e) {
    console.warn(`[recycle] receipt pending for ${hash}: ${e.message}`);
    return false;
  }
}

/**
 * Sweep one due node wallet back to RECYCLE_TO. Returns true when it did
 * on-chain work this tick (so the payout leg waits for the next tick — the
 * treasury signs both gas top-ups and payouts, and nonces must not race).
 */
async function recycle() {
  if (!RECYCLE || !NODE_KEYS_LOADED) return false;
  const { rows } = await q(
    `SELECT id, rail, to_addr FROM treasury_txs
     WHERE kind = 'node' AND status = 'confirmed' AND recycled_at IS NULL AND recycle_due IS NOT NULL AND recycle_due <= now()
     ORDER BY recycle_due ASC LIMIT 1`,
  );
  const row = rows[0];
  if (!row) return false;
  const railId = row.rail;
  const r = RAILS[railId];
  const markDone = () => q(`UPDATE treasury_txs SET recycled_at = now() WHERE kind = 'node' AND rail = $1 AND lower(to_addr) = lower($2) AND recycled_at IS NULL AND status = 'confirmed'`, [railId, row.to_addr]);

  const pk = nodeKey(row.to_addr);
  if (!pk) {
    await markDone();
    return false;
  }
  const node = privateKeyToAccount(pk);
  const { pub, wallet: treasury } = client(railId);
  const chain = CHAINS[railId];

  const raw = await pub.readContract({ address: r.token, abi: erc20Abi, functionName: 'balanceOf', args: [node.address] });
  if (raw === 0n) {
    await markDone();
    return false;
  }
  const usd = Number(formatUnits(raw, r.decimals));

  // Gas: make sure the node wallet can pay for the sweep; top it up from the treasury if not.
  const [gasPrice, have] = await Promise.all([pub.getGasPrice(), pub.getBalance({ address: node.address })]);
  const need = gasPrice * SWEEP_GAS * 3n;
  if (have < need) {
    let topup = gasPrice * SWEEP_GAS * 25n;
    if (topup < GAS_FLOOR_WEI[railId]) topup = GAS_FLOOR_WEI[railId];
    const treasuryGas = await pub.getBalance({ address: account.address });
    if (treasuryGas < topup * 3n) {
      console.warn(`[recycle] ${r.chain}: treasury has ${formatEther(treasuryGas)} ETH, cannot top up ${node.address}`);
      return false;
    }
    const hash = await treasury.sendTransaction({ to: node.address, value: topup });
    const id = await recordRecycle({ railId, wallet: node.address, kind: 'gas', amountRaw: topup, usd: null, hash });
    console.log(`[recycle] gas ${formatEther(topup)} ETH on ${r.chain} -> ${node.address} ${hash}`);
    if (!(await waitRecycle(railId, id, hash))) return true;
  }

  const transport = http(r.rpc, { timeout: 20_000, retryCount: 2 });
  const nodeWallet = createWalletClient({ account: node, chain, transport });
  const hash = await nodeWallet.writeContract({ address: r.token, abi: erc20Abi, functionName: 'transfer', args: [RECYCLE_TO, raw] });
  const id = await recordRecycle({ railId, wallet: node.address, kind: 'return', amountRaw: raw, usd, hash });
  console.log(`[recycle] return ${usd.toFixed(2)} ${r.asset} on ${r.chain} ${node.address} -> ${RECYCLE_TO} ${hash}`);
  if (await waitRecycle(railId, id, hash)) await markDone();
  return true;
}

/** Sum of what is currently sitting in node wallets waiting to come back (for logs / ops). */
export async function recycleTotals() {
  const { rows } = await q(`SELECT coalesce(sum(usd) FILTER (WHERE kind = 'return' AND status = 'confirmed'), 0)::float AS returned_usd,
                                   count(*) FILTER (WHERE kind = 'return' AND status = 'confirmed')::int AS returns,
                                   count(*) FILTER (WHERE kind = 'gas' AND status = 'confirmed')::int AS topups
                            FROM recycle_txs`);
  const pending = await q(`SELECT coalesce(sum(usd), 0)::float AS usd FROM treasury_txs WHERE kind = 'node' AND status = 'confirmed' AND recycled_at IS NULL AND recycle_due IS NOT NULL`);
  return { returnedUsd: rows[0].returned_usd, returns: rows[0].returns, topups: rows[0].topups, outstandingUsd: pending.rows[0].usd };
}

let lastWasRecycle = false;

async function tick() {
  if (sending || Date.now() < backoffUntil) return;
  const startedAt = getStartedAt();
  if (!startedAt || !NODE_ADDRESSES.length) return;
  sending = true;
  try {
    await reconcile();
    if (PAY_USERS && (await payUserWithdrawal())) return;

    // Alternate: never two recycles in a row, so payouts keep flowing.
    if (!lastWasRecycle) {
      lastWasRecycle = await recycle().catch((e) => {
        console.error('[recycle] failed:', e.shortMessage || e.message);
        return false;
      });
      if (lastWasRecycle) return;
    } else lastWasRecycle = false;

    const t = await totals();
    const s = snapshot(startedAt);
    const target = s.paidToContributorsUsd * WITHDRAW_SHARE;
    const boot = t.confirmed < MIN_FEED;
    if (!boot && t.usd + MIN_PAYOUT > target) return; // contributors have withdrawn as much as the curve says they would

    const seed = t.live + 1;
    const rnd = (k) => ((Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
    let usd = round2(payoutSize(rnd(1)));
    if (!boot) usd = round2(Math.max(MIN_PAYOUT, Math.min(usd, target - t.usd)));
    const to = NODE_ADDRESSES[Math.floor(rnd(2) * NODE_ADDRESSES.length)];
    const railId = await fundedRail(pickRail(rnd(3)), usd);
    if (!railId) {
      backoffUntil = Date.now() + 5 * 60_000;
      return;
    }
    await transfer({ railId, to, usd, kind: 'node' });
  } catch (e) {
    console.error('[payer] tick failed:', e.shortMessage || e.message);
    backoffUntil = Date.now() + 2 * 60_000;
  } finally {
    sending = false;
  }
}

export async function startPayer() {
  const pk = (process.env.TREASURY_PRIVATE_KEY || '').trim();
  if (!pk) {
    console.warn('[payer] TREASURY_PRIVATE_KEY not set; on-chain payouts disabled (feed stays empty)');
    return;
  }
  try {
    account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
  } catch (e) {
    console.error('[payer] TREASURY_PRIVATE_KEY is not a valid private key; payouts disabled');
    return;
  }
  if (account.address.toLowerCase() !== TREASURY_ADDRESS.toLowerCase()) {
    console.error(`[payer] key derives to ${account.address}, not TREASURY_ADDRESS ${TREASURY_ADDRESS}; payouts disabled`);
    account = null;
    return;
  }
  payerEnabled = true;
  console.log(`[payer] recycling ${RECYCLE && NODE_KEYS_LOADED ? `on: ${NODE_KEYS_LOADED} node wallets return to ${RECYCLE_TO} after ${RECYCLE_DELAY_MIN[0]}–${RECYCLE_DELAY_MIN[1]} min` : 'off'}`);
  for (const id of RAIL_IDS) {
    try {
      const [bal, gas] = await Promise.all([tokenBalance(id), gasBalance(id)]);
      console.log(`[payer] ${RAILS[id].chain}: ${bal.toFixed(2)} ${RAILS[id].asset}, ${gas.toFixed(5)} ETH for gas`);
    } catch (e) {
      console.warn(`[payer] ${RAILS[id].chain} unreachable: ${e.message}`);
    }
  }
  let n = 0;
  const loop = async () => {
    await tick();
    if (RECYCLE && ++n % 40 === 0) {
      // Ops line (server logs only): how much is out in node wallets vs. already back.
      recycleTotals()
        .then((x) => console.log(`[recycle] outstanding $${x.outstandingUsd.toFixed(2)} · returned $${x.returnedUsd.toFixed(2)} in ${x.returns} sweeps · ${x.topups} gas top-ups`))
        .catch(() => {});
    }
    const t = await totals().catch(() => ({ confirmed: MIN_FEED }));
    setTimeout(loop, t.confirmed < MIN_FEED ? BOOT_MS : TICK_MS).unref();
  };
  loop();
}

/** Last `limit` real transactions for the public feed, newest first. */
export async function recentTreasuryTxs(limit = 10) {
  const { rows } = await q(
    `SELECT rail, to_addr, usd, tx_hash, status, kind, created_at, confirmed_at
     FROM treasury_txs WHERE status <> 'failed' ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    t: new Date(r.confirmed_at || r.created_at).getTime(),
    to: r.to_addr,
    usd: Number(r.usd),
    rail: r.rail,
    txHash: r.tx_hash,
    status: r.status,
  }));
}

export async function treasuryTotals() {
  const t = await totals();
  return { paidOutUsd: t.usd, count: t.live };
}
