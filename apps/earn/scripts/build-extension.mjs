// Zips ../extension into public/downloads/root-network-extension.zip so the
// dashboard can serve it. Runs as part of `npm run build`.
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'extension');
const outDir = join(here, '..', 'public', 'downloads');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'root-network-extension.zip');

// On Railway the build context is only apps/earn; keep the committed zip in that case.
if (!existsSync(join(src, 'manifest.json'))) {
  console.log(`[extension] source not present at ${src}; keeping committed ${existsSync(out) ? 'zip' : 'nothing (!)'}`);
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'));

await new Promise((resolve, reject) => {
  const stream = createWriteStream(out);
  const zip = archiver('zip', { zlib: { level: 9 } });
  stream.on('close', resolve);
  zip.on('error', reject);
  zip.pipe(stream);
  zip.directory(src, 'root-network-extension', (entry) => (/(^|\/)\./.test(entry.name) ? false : entry));
  zip.finalize();
});

console.log(`[extension] packed v${manifest.version} -> ${out}`);
