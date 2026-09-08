import { createHash, randomBytes } from 'node:crypto';
import { PrivyClient } from '@privy-io/server-auth';
import { q } from './db.mjs';

const PRIVY_APP_ID = process.env.PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID || '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || '';
const PRIVY_VERIFICATION_KEY = process.env.PRIVY_VERIFICATION_KEY || undefined;

export const privyConfigured = Boolean(PRIVY_APP_ID && (PRIVY_APP_SECRET || PRIVY_VERIFICATION_KEY));
/** Local development only: accepts `dev:<name>` bearer tokens when Privy is not configured. */
export const devAuthEnabled = !privyConfigured && process.env.ALLOW_DEV_AUTH === '1';

const privy = privyConfigured ? new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET || 'unused') : null;

if (privyConfigured) console.log('[auth] Privy verification enabled for app', PRIVY_APP_ID);
else if (devAuthEnabled) console.warn('[auth] Privy not configured; DEV auth enabled (ALLOW_DEV_AUTH=1)');
else console.warn('[auth] Privy not configured and dev auth disabled; sign-in will fail');

// Verified-token cache to avoid re-verifying on every poll.
const cache = new Map(); // token -> { userId, exp }
function remember(token, userId, expMs) {
  if (cache.size > 5000) cache.clear();
  cache.set(token, { userId, exp: expMs });
}

export async function verifyBearer(token) {
  const hit = cache.get(token);
  if (hit && hit.exp > Date.now()) return hit.userId;

  if (privy) {
    const claims = await privy.verifyAuthToken(token, PRIVY_VERIFICATION_KEY);
    const expMs = Math.min(claims.expiration * 1000, Date.now() + 5 * 60_000);
    remember(token, claims.userId, expMs);
    return claims.userId;
  }
  if (devAuthEnabled && token.startsWith('dev:')) {
    const name = token.slice(4).replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'guest';
    const userId = `did:privy:dev-${name}`;
    remember(token, userId, Date.now() + 60 * 60_000);
    return userId;
  }
  throw new Error('invalid token');
}

export function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

function referralCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[b[i] % alphabet.length];
  return out;
}

/** Express middleware: requires a valid Privy access token; upserts the user row. */
export async function requireUser(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'missing token' });
    const userId = await verifyBearer(token);

    let { rows } = await q('SELECT * FROM users WHERE id = $1', [userId]);
    if (!rows[0]) {
      // Try a few times in the unlikely event of a referral code collision.
      for (let i = 0; i < 5 && !rows[0]; i++) {
        try {
          ({ rows } = await q(
            `INSERT INTO users (id, referral_code) VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET last_seen_at = now()
             RETURNING *`,
            [userId, referralCode()],
          ));
        } catch (e) {
          if (!/referral_code/.test(e.message)) throw e;
        }
      }
    } else {
      q('UPDATE users SET last_seen_at = now() WHERE id = $1', [userId]).catch(() => {});
    }
    req.user = rows[0];
    next();
  } catch (e) {
    res.status(401).json({ error: 'unauthorized' });
  }
}

/** Express middleware for the extension: X-Device-Token header. */
export async function requireDevice(req, res, next) {
  try {
    const token = req.headers['x-device-token'];
    if (!token || typeof token !== 'string') return res.status(401).json({ error: 'missing device token' });
    const { rows } = await q('SELECT * FROM devices WHERE token_hash = $1', [sha256(token)]);
    if (!rows[0]) return res.status(401).json({ error: 'unknown device' });
    req.device = rows[0];
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}
