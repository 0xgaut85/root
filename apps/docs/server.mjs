// Minimal static server for Railway (serves .vitepress/dist). No dependencies.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), '.vitepress', 'dist');
const port = Number(process.env.PORT || 3000);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function tryStat(p) {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}

// Canonical host: anything arriving on a default *.up.railway.app host is sent to the real domain.
const canonical = (process.env.CANONICAL_HOST || 'read.rootnetwork.co').trim();

createServer((req, res) => {
  const host = String(req.headers.host || '').split(':')[0];
  if (/\.up\.railway\.app$/i.test(host) && host !== canonical) {
    res.writeHead(301, { Location: `https://${canonical}${req.url || '/'}`, 'Cache-Control': 'no-cache' }).end();
    return;
  }
  const url = new URL(req.url || '/', 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  let file = normalize(join(root, pathname));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  let st = tryStat(file);
  if (st && st.isDirectory()) {
    file = join(file, 'index.html');
    st = tryStat(file);
  }
  // cleanUrls: /guide/set-up -> /guide/set-up.html
  if (!st && !extname(file)) {
    file = `${file}.html`;
    st = tryStat(file);
  }
  if (!st) {
    file = join(root, '404.html');
    st = tryStat(file);
    if (!st) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.statusCode = 404;
  }
  const ext = extname(file).toLowerCase();
  const immutable = pathname.startsWith('/assets/') || pathname.startsWith('/fonts/');
  res.writeHead(res.statusCode === 404 ? 404 : 200, {
    'Content-Type': types[ext] || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}).listen(port, '0.0.0.0', () => {
  console.log(`root network docs listening on :${port}`);
});
