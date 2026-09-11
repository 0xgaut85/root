import express from 'express';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from './db.mjs';
import { startWorker } from './worker.mjs';
import { network } from './routes/network.mjs';
import { me } from './routes/me.mjs';
import { ext } from './routes/ext.mjs';
import { privyConfigured, devAuthEnabled } from './auth.mjs';
import { TREASURY_ADDRESS, publicRails } from './rails.mjs';
import { publicExtension, isAllowedExtensionOrigin, STORE_URL } from './extension.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = join(here, '..', 'dist');
const port = Number(process.env.PORT || 3000);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '64kb' }));

// Canonical host: requests on a default *.up.railway.app host go to PUBLIC_URL (earn.rootnetwork.co).
const canonicalHost = (() => {
  try {
    return process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).host : null;
  } catch {
    return null;
  }
})();
app.use((req, res, next) => {
  const host = String(req.headers.host || '').split(':')[0];
  if (canonicalHost && /\.up\.railway\.app$/i.test(host) && host !== canonicalHost) {
    return res.redirect(301, `https://${canonicalHost}${req.originalUrl}`);
  }
  next();
});

// CORS for the extension on the API only. Production trusts the published store
// build; unpacked dev builds are accepted while dev auth is enabled (or via EXTENSION_IDS).
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin || '';
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (isAllowedExtensionOrigin(origin, { allowAny: devAuthEnabled }) || (devAuthEnabled && isLocal)) {
    res.set({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Token',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    });
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, privy: privyConfigured, devAuth: devAuthEnabled }));
app.get('/api/config', (_req, res) =>
  res.json({
    privyAppId: process.env.VITE_PRIVY_APP_ID || process.env.PRIVY_APP_ID || null,
    devAuth: devAuthEnabled,
    publicUrl: process.env.PUBLIC_URL || null,
    treasury: TREASURY_ADDRESS,
    rails: publicRails(),
    extension: publicExtension(),
  }),
);
// Stable short link for the store listing (used in docs, emails, the landing page).
app.get('/extension/install', (_req, res) => res.redirect(302, STORE_URL));
app.use('/api/network', network);
app.use('/api/me', me);
app.use('/api/ext', ext);

app.use('/api', (err, _req, res, _next) => {
  console.error('[api]', err);
  res.status(500).json({ error: 'internal error' });
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

// ---- Static client (dist) with SPA fallback ----
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};
app.get('*', (req, res) => {
  if (!existsSync(distDir)) return res.status(503).send('client not built');
  let pathname = decodeURIComponent(req.path);
  if (pathname.endsWith('/')) pathname += 'index.html';
  let file = normalize(join(distDir, pathname));
  if (!file.startsWith(distDir)) return res.sendStatus(403);
  let st = null;
  try {
    st = statSync(file);
    if (st.isDirectory()) throw new Error('dir');
  } catch {
    file = join(distDir, 'index.html');
    st = statSync(file);
  }
  const ext = extname(file).toLowerCase();
  const immutable = pathname.startsWith('/assets/') || pathname.startsWith('/fonts/');
  res.set({
    'Content-Type': types[ext] || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (ext === '.zip') res.set('Content-Disposition', 'attachment; filename="root-network-extension.zip"');
  createReadStream(file).pipe(res);
});

async function main() {
  await migrate();
  await startWorker();
  app.listen(port, '0.0.0.0', () => console.log(`root network earn listening on :${port}`));
}

main().catch((e) => {
  console.error('fatal', e);
  process.exit(1);
});
