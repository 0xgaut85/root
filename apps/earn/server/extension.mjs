/**
 * The published browser extension.
 *
 * The Chrome Web Store assigns a stable ID at first upload; every update keeps it.
 * The dashboard reads this from /api/config so the install link, the version label
 * and the CORS allow-list all come from one place.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXTENSION_ID = (process.env.EXTENSION_ID || 'jlgmdngjhimpgjeceddehokdjcbglebg').trim();
export const STORE_URL = `https://chromewebstore.google.com/detail/${EXTENSION_ID}`;

/** Version of the extension source in this repo (falls back to the env / a constant when the source is not in the build context). */
function sourceVersion() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const m = JSON.parse(readFileSync(join(here, '..', '..', 'extension', 'manifest.json'), 'utf8'));
    return String(m.version);
  } catch {
    return process.env.EXTENSION_VERSION || '0.1.0';
  }
}
export const EXTENSION_VERSION = sourceVersion();

/**
 * Extension origins allowed to call the API.
 * Production accepts the store build only. Unpacked dev builds get a random ID, so
 * extra IDs can be listed in EXTENSION_IDS (comma separated) or any extension is
 * accepted while dev auth is on.
 */
const extra = (process.env.EXTENSION_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowedIds = new Set([EXTENSION_ID, ...extra]);

export function isAllowedExtensionOrigin(origin, { allowAny = false } = {}) {
  const m = /^(chrome|moz)-extension:\/\/([a-z0-9-]+)$/i.exec(String(origin || ''));
  if (!m) return false;
  return allowAny || allowedIds.has(m[2]);
}

export const publicExtension = () => ({
  id: EXTENSION_ID,
  version: EXTENSION_VERSION,
  storeUrl: STORE_URL,
  browsers: ['Chrome', 'Brave', 'Edge', 'Arc'],
});
