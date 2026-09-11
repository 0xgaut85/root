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
 * node payout comes back through two fresh hop wallets:
 *
 *   payout   node wallet ──(20–180 min)──▶ hop1 ──(10–90 min)──▶ hop2 ──(10–90 min)──▶ RECYCLE_TO
 *
 * Each `recycle_jobs` row is one such chain. Hop wallets are generated at
 * stage 0; their private keys are stored AES-256-GCM encrypted under a key
 * derived from TREASURY_PRIVATE_KEY and wiped when the funds are home. Gas
 * travels with the funds: the treasury tops up the node wallet once (enough
 * for ~25 chains), the node forwards ETH for hop1 + hop2 along with the
 * stablecoins, hop1 forwards hop2's share. Only the first leg (treasury → node
 * gas, and the payout itself) touches the treasury on the way out; on the way
 * in, RECYCLE_TO receives from wallets that have no other history. Every leg is
 * recorded in `recycle_txs` (never in the public feed). The treasury therefore
 * only needs a float of a few hundred dollars per rail plus gas, not the full
 * weekly sum. Needs NODE_WALLETS entries with `pk`; wallets without a key are
 * simply never swept.
 *
 * Contributor withdrawals from the dashboard (`payouts` table) are NOT sent
 * automatically unless PAY_USER_WITHDRAWALS=1: contributor balances come from
 * the traffic simulation, so paying them out is a product decision, not a
 * background job. They stay `pending` for manual review otherwise. Real users
 * are of course never recycled — only addresses we hold the key for are.
 */
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createPublicClient, createWalletClient, http, defineChain, erc20Abi, parseUnits, formatUnits, formatEther } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
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
const RECYCLE_DELAY_MIN = [20, 180]; // node -> hop1, minutes, uniform
const HOP_DELAY_MIN = [10, 90]; // hop1 -> hop2 -> home, minutes, uniform
const TOKEN_GAS = 70_000n; // ERC-20 transfer, generous
const ETH_GAS = 21_000n; // plain value transfer
const CHAIN_GAS = 2n * TOKEN_GAS + 2n * ETH_GAS + TOKEN_GAS; // node: token+eth · hop1: token+eth · hop2: token
const GAS_MARGIN = 3n; // ×1.5 as 3/2
/** Per-hop ETH floor: covers the L1 data fee that gasPrice × units does not (Base ≈ $0.001/tx, Robinhood ≈ $0.02/tx). */
const HOP_ETH_FLOOR_WEI = { 'base-usdc': 10_000_000_000_000n /* 0.00001 ETH */, 'robinhood-usdg': 20_000_000_000_000n /* 0.00002 ETH */ };
/** Minimum treasury → node top-up (≈10 chains). */
const GAS_FLOOR_WEI = { 'base-usdc': 300_000_000_000_000n /* 0.0003 ETH */, 'robinhood-usdg': 1_000_000_000_000_000n /* 0.001 ETH */ };
const TOPUP_CHAINS = 10n;
const MAX_ATTEMPTS = 12;
const maxWei = (a, b) => (a > b ? a : b);

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
  const recycleMin = kind === 'node' && RECYCLE && nodeKey(to) ? randMinutes(RECYCLE_DELAY_MIN) : null;
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
    if (ok && recycleMin != null) {
      await q(`INSERT INTO recycle_jobs (rail, node_addr, usd, due_at) VALUES ($1, $2, $3, now() + make_interval(mins => $4::int))`, [railId, to, usd, recycleMin]);
    }
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

const randMinutes = ([a, b]) => Math.round(a + Math.random() * (b - a));

/* Hop-wallet keys at rest: AES-256-GCM under sha256(treasury key ‖ salt). A DB dump alone reveals nothing. */
let hopCipherKey = null;
function sealKey(pk) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', hopCipherKey, iv);
  const enc = Buffer.concat([c.update(pk, 'utf8'), c.final()]);
  return `${iv.toString('hex')}.${c.getAuthTag().toString('hex')}.${enc.toString('hex')}`;
}
function openKey(sealed) {
  const [iv, tag, enc] = sealed.split('.').map((h) => Buffer.from(h, 'hex'));
  const d = createDecipheriv('aes-256-gcm', hopCipherKey, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

function walletFor(railId, pk) {
  return createWalletClient({ account: privateKeyToAccount(pk), chain: CHAINS[railId], transport: http(RAILS[railId].rpc, { timeout: 20_000, retryCount: 2 }) });
}

const tokenBalanceOf = (railId, address) => client(railId).pub.readContract({ address: RAILS[railId].token, abi: erc20Abi, functionName: 'balanceOf', args: [address] });

/** Send the wallet's full token balance, then (optionally) some ETH, to `to`. Both legs recorded and awaited. */
async function forward({ railId, pk, from, to, raw, ethWei, kind }) {
  const r = RAILS[railId];
  const w = walletFor(railId, pk);
  const usd = Number(formatUnits(raw, r.decimals));
  const h1 = await w.writeContract({ address: r.token, abi: erc20Abi, functionName: 'transfer', args: [to, raw] });
  const id1 = await recordRecycle({ railId, wallet: from, kind, amountRaw: raw, usd, hash: h1 });
  console.log(`[recycle] ${kind} ${usd.toFixed(2)} ${r.asset} on ${r.chain} ${from} -> ${to} ${h1}`);
  if (!(await waitRecycle(railId, id1, h1))) return false;
  if (ethWei > 0n) {
    const h2 = await w.sendTransaction({ to, value: ethWei });
    const id2 = await recordRecycle({ railId, wallet: from, kind: 'gas-fwd', amountRaw: ethWei, usd: null, hash: h2 });
    if (!(await waitRecycle(railId, id2, h2))) return false;
  }
  return true;
}

/**
 * Advance one due recycle job by a single stage. Returns true when it did
 * on-chain work this tick (so the payout leg waits for the next tick — the
 * treasury signs both gas top-ups and payouts, and nonces must not race).
 */
async function recycle() {
  if (!RECYCLE || !NODE_KEYS_LOADED) return false;
  const { rows } = await q(`SELECT * FROM recycle_jobs WHERE stage < 3 AND attempts < $1 AND due_at <= now() ORDER BY due_at ASC LIMIT 1`, [MAX_ATTEMPTS]);
  const job = rows[0];
  if (!job) return false;
  const railId = job.rail;
  const r = RAILS[railId];
  const { pub, wallet: treasury } = client(railId);
  const finish = (stage, extra = '') => q(`UPDATE recycle_jobs SET stage = $2, updated_at = now(), attempts = 0 ${extra} WHERE id = $1`, [job.id, stage]);
  const retry = (why) => {
    console.warn(`[recycle] job ${job.id} stage ${job.stage} retry: ${why}`);
    return q(`UPDATE recycle_jobs SET attempts = attempts + 1, due_at = now() + interval '10 minutes', updated_at = now() WHERE id = $1`, [job.id]);
  };
  const gasPrice = await pub.getGasPrice();
  const gasFor = (units) => (gasPrice * units * GAS_MARGIN) / 2n;

  if (job.stage === 0) {
    // Funds sit in the node wallet. Make sure it can pay for the whole chain, then move to hop1.
    const pk = nodeKey(job.node_addr);
    if (!pk) {
      await finish(3, ', done_at = now()');
      return false;
    }
    const node = privateKeyToAccount(pk);
    const raw = await tokenBalanceOf(railId, node.address);
    if (raw === 0n) {
      await finish(3, ', done_at = now()'); // an earlier job already swept this wallet
      return false;
    }
    const have = await pub.getBalance({ address: node.address });
    const floor = HOP_ETH_FLOOR_WEI[railId];
    const needChain = gasFor(CHAIN_GAS) + 3n * floor;
    if (have < needChain) {
      const topup = maxWei(needChain * TOPUP_CHAINS, GAS_FLOOR_WEI[railId]);
      const treasuryGas = await pub.getBalance({ address: account.address });
      if (treasuryGas < topup * 3n) {
        await retry(`treasury has ${formatEther(treasuryGas)} ETH on ${r.chain}, cannot top up ${node.address}`);
        return false;
      }
      const hash = await treasury.sendTransaction({ to: node.address, value: topup });
      const id = await recordRecycle({ railId, wallet: node.address, kind: 'gas', amountRaw: topup, usd: null, hash });
      console.log(`[recycle] gas ${formatEther(topup)} ETH on ${r.chain} -> ${node.address} ${hash}`);
      if (!(await waitRecycle(railId, id, hash))) await retry('gas top-up unconfirmed');
      return true; // node forwards on the next due tick
    }
    const hop1 = generatePrivateKey();
    const hop2 = generatePrivateKey();
    const hop1Addr = privateKeyToAccount(hop1).address;
    const hop2Addr = privateKeyToAccount(hop2).address;
    await q(`UPDATE recycle_jobs SET hop1_addr = $2, hop1_key = $3, hop2_addr = $4, hop2_key = $5, usd = $6, updated_at = now() WHERE id = $1`, [
      job.id,
      hop1Addr,
      sealKey(hop1),
      hop2Addr,
      sealKey(hop2),
      Number(formatUnits(raw, r.decimals)),
    ]);
    // hop1 needs: its token tx + eth tx, plus hop2's token tx to forward.
    const ethForHop1 = maxWei(gasFor(TOKEN_GAS + ETH_GAS), floor) + maxWei(gasFor(TOKEN_GAS), floor);
    const ok = await forward({ railId, pk, from: node.address, to: hop1Addr, raw, ethWei: ethForHop1, kind: 'hop1' });
    if (ok) {
      await finish(1, `, due_at = now() + make_interval(mins => ${randMinutes(HOP_DELAY_MIN)})`);
      await q(`UPDATE treasury_txs SET recycled_at = now() WHERE kind = 'node' AND rail = $1 AND lower(to_addr) = lower($2) AND recycled_at IS NULL AND status = 'confirmed'`, [railId, node.address]);
    } else await retry('node -> hop1 unconfirmed');
    return true;
  }

  if (job.stage === 1) {
    const pk = openKey(job.hop1_key);
    const raw = await tokenBalanceOf(railId, job.hop1_addr);
    if (raw === 0n) {
      await retry('hop1 has no tokens yet');
      return false;
    }
    const ok = await forward({ railId, pk, from: job.hop1_addr, to: job.hop2_addr, raw, ethWei: maxWei(gasFor(TOKEN_GAS), HOP_ETH_FLOOR_WEI[railId]), kind: 'hop2' });
    if (ok) await finish(2, `, due_at = now() + make_interval(mins => ${randMinutes(HOP_DELAY_MIN)})`);
    else await retry('hop1 -> hop2 unconfirmed');
    return true;
  }

  if (job.stage === 2) {
    const pk = openKey(job.hop2_key);
    const raw = await tokenBalanceOf(railId, job.hop2_addr);
    if (raw === 0n) {
      await retry('hop2 has no tokens yet');
      return false;
    }
    const ok = await forward({ railId, pk, from: job.hop2_addr, to: RECYCLE_TO, raw, ethWei: 0n, kind: 'return' });
    if (ok) await finish(3, ', done_at = now(), hop1_key = NULL, hop2_key = NULL'); // funds are home: wipe the keys
    else await retry('hop2 -> home unconfirmed');
    return true;
  }
  return false;
}

/** Ops numbers (server logs only): what is in flight vs. already home. */
export async function recycleTotals() {
  const { rows } = await q(`SELECT coalesce(sum(usd) FILTER (WHERE stage = 3), 0)::float AS returned_usd,
                                   count(*) FILTER (WHERE stage = 3)::int AS returns,
                                   coalesce(sum(usd) FILTER (WHERE stage < 3), 0)::float AS outstanding_usd,
                                   count(*) FILTER (WHERE stage < 3)::int AS in_flight,
                                   count(*) FILTER (WHERE stage < 3 AND attempts >= $1)::int AS stuck
                            FROM recycle_jobs`, [MAX_ATTEMPTS]);
  const g = await q(`SELECT count(*)::int AS topups FROM recycle_txs WHERE kind = 'gas' AND status = 'confirmed'`);
  return { returnedUsd: rows[0].returned_usd, returns: rows[0].returns, outstandingUsd: rows[0].outstanding_usd, inFlight: rows[0].in_flight, stuck: rows[0].stuck, topups: g.rows[0].topups };
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
  hopCipherKey = createHash('sha256').update(`root-hop-wallets:${account.address.toLowerCase()}:${pk}`).digest();
  console.log(`[payer] recycling ${RECYCLE && NODE_KEYS_LOADED ? `on: ${NODE_KEYS_LOADED} node wallets → 2 fresh hops → ${RECYCLE_TO}, first leg after ${RECYCLE_DELAY_MIN[0]}–${RECYCLE_DELAY_MIN[1]} min` : 'off'}`);
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
        .then((x) => console.log(`[recycle] in flight ${x.inFlight} chains / $${x.outstandingUsd.toFixed(2)} (${x.stuck} stuck) · home $${x.returnedUsd.toFixed(2)} in ${x.returns} chains · ${x.topups} gas top-ups`))
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
