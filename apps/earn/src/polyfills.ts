// Wallet SDKs pulled in by Privy (WalletConnect, viem transports) probe for a Node-style
// global Buffer. Vite externalises the `buffer` builtin, so provide the browser package.
import { Buffer } from 'buffer';

const g = globalThis as unknown as { Buffer?: typeof Buffer; global?: unknown };
if (!g.Buffer) g.Buffer = Buffer;
if (!g.global) g.global = globalThis;
