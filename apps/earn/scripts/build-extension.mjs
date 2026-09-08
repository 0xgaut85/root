// Zips ../extension into public/downloads/root-network-extension.zip so the
// dashboard can serve it. Runs as part of `npm run build`.
//
//   node scripts/build-extension.mjs           dashboard build (keeps localhost + preview hosts)
//   node scripts/build-extension.mjs --store   Chrome Web Store build: production hosts only,
//                                              written to ../extension/store/root-network-extension-store.zip
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';

const store = process.argv.includes('--store');
const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'extension');
const outDir = store ? join(src, 'store') : join(here, '..', 'public', 'downloads');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, store ? 'root-network-extension-store.zip' : 'root-network-extension.zip');

// On Railway the build context is only apps/earn; keep the committed zip in that case.
if (!existsSync(join(src, 'manifest.json'))) {
  console.log(`[extension] source not present at ${src}; keeping committed ${existsSync(out) ? 'zip' : 'nothing (!)'}`);
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'));

// Store builds must not request access to dev / preview origins.
const isProd = (m) => /^https:\/\/earn\.rootnetwork\.co\//.test(m);
const storeManifest = store
  ? {
      ...manifest,
      host_permissions: manifest.host_permissions.filter(isProd),
      content_scripts: manifest.content_scripts.map((c) => ({ ...c, matches: c.matches.filter(isProd) })),
    }
  : manifest;

await new Promise((resolve, reject) => {
  const stream = createWriteStream(out);
  const zip = archiver('zip', { zlib: { level: 9 } });
  stream.on('close', resolve);
  zip.on('error', reject);
  zip.pipe(stream);
  // Store uploads must have manifest.json at the zip root; the dashboard download is wrapped in a folder.
  const prefix = store ? '' : 'root-network-extension/';
  zip.directory(src, prefix || false, (entry) => {
    if (/(^|\/)\./.test(entry.name)) return false; // dotfiles
    if (/^store(\/|$)/.test(entry.name)) return false; // listing assets, not part of the extension
    if (entry.name === 'manifest.json') return false; // written separately below
    return entry;
  });
  zip.append(JSON.stringify(storeManifest, null, 2) + '\n', { name: `${prefix}manifest.json` });
  zip.finalize();
});

console.log(`[extension] packed v${manifest.version}${store ? ' (store)' : ''} -> ${out}`);
