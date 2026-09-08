// Zips ../extension into public/downloads/root-network-extension.zip so the
// dashboard can serve it. Runs as part of `npm run build`.
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'extension');
const outDir = join(here, '..', 'public', 'downloads');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'root-network-extension.zip');

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
