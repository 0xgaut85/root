// Generates the node payout wallets, stores them locally (git-ignored) and pushes
// them to the Railway `earn` service as NODE_WALLETS.
//
//   node scripts/gen-wallets.mjs                 generate 100 (or reuse the local file), push to Railway
//   node scripts/gen-wallets.mjs --count 100     explicit count (only used when the file does not exist yet)
//   node scripts/gen-wallets.mjs --no-push       write the file only
//   node scripts/gen-wallets.mjs --force         regenerate even if the file exists (old keys are lost!)
//
// Private keys never leave this machine except to the Railway variable. Never commit the file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);

const here = dirname(fileURLToPath(import.meta.url));
const secretsDir = join(here, '..', '..', '..', 'secrets');
const file = join(secretsDir, 'node-wallets.json');
const count = Number(opt('--count', 100));

let wallets;
if (existsSync(file) && !flag('--force')) {
  wallets = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`[wallets] reusing ${wallets.length} wallets from ${file}`);
} else {
  wallets = Array.from({ length: count }, (_, i) => {
    const pk = generatePrivateKey();
    return { i, address: privateKeyToAccount(pk).address, pk };
  });
  mkdirSync(secretsDir, { recursive: true });
  writeFileSync(file, JSON.stringify(wallets, null, 2) + '\n');
  console.log(`[wallets] generated ${wallets.length} EVM wallets -> ${file}`);
}

// Addresses-only companion file, safe to share.
writeFileSync(join(secretsDir, 'node-wallets.addresses.json'), JSON.stringify(wallets.map((w) => w.address), null, 2) + '\n');

if (flag('--no-push')) process.exit(0);

// Push to Railway. The server only reads `address`, but the keys travel with it so the
// variable is the single source of truth for operating the wallets later.
const value = JSON.stringify(wallets.map(({ address, pk }) => ({ address, pk })));
const service = opt('--service', 'earn');

// Resolve the native binary so the JSON argument is never re-parsed by a shell (cmd.exe mangles quotes).
function railwayBin() {
  if (process.platform !== 'win32') return 'railway';
  try {
    const cmd = execFileSync('where', ['railway.cmd'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
    const exe = join(dirname(cmd), 'node_modules', '@railway', 'cli', 'bin', 'railway.exe');
    if (existsSync(exe)) return exe;
  } catch {}
  return 'railway.exe';
}

try {
  execFileSync(railwayBin(), ['variables', '--service', service, '--skip-deploys', '--set', `NODE_WALLETS=${value}`], {
    stdio: ['ignore', 'inherit', 'inherit'],
    cwd: join(here, '..'),
  });
  console.log(`[wallets] NODE_WALLETS set on Railway service "${service}" (${(value.length / 1024).toFixed(1)} KB)`);
} catch (e) {
  console.error('[wallets] railway CLI failed:', e.message);
  console.error('          run `railway login` / `railway link` in apps/earn and retry, or paste the variable manually.');
  process.exit(1);
}
