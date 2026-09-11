import type { RailId } from './api';

export type RailMeta = {
  id: RailId;
  asset: string;
  assetName: string;
  chain: string;
  assetLogo: string;
  chainLogo: string;
  explorerAddr: (addr: string) => string;
  explorerTx: (hash: string) => string;
  note: string;
};

/** Official marks: USDC (Circle), USDG (Paxos Global Dollar), Base square, Robinhood feather symbol. */
export const RAILS: Record<RailId, RailMeta> = {
  'base-usdc': {
    id: 'base-usdc',
    asset: 'USDC',
    assetName: 'USD Coin',
    chain: 'Base',
    assetLogo: '/rails/usdc.png',
    chainLogo: '/rails/base.svg',
    explorerAddr: (a) => `https://basescan.org/address/${a}`,
    explorerTx: (h) => `https://basescan.org/tx/${h}`,
    note: 'Circle’s dollar stablecoin on Base, Coinbase’s Ethereum L2. Works with any EVM wallet.',
  },
  'robinhood-usdg': {
    id: 'robinhood-usdg',
    asset: 'USDG',
    assetName: 'Global Dollar',
    chain: 'Robinhood Chain',
    assetLogo: '/rails/usdg.png',
    chainLogo: '/rails/robinhood-feather-white.svg',
    explorerAddr: (a) => `https://robinhoodchain.blockscout.com/address/${a}`,
    explorerTx: (h) => `https://robinhoodchain.blockscout.com/tx/${h}`,
    note: 'Paxos’ Global Dollar on Robinhood Chain (chain ID 4663). Use your Robinhood wallet address or any EVM wallet.',
  },
};

export const RAIL_IDS: RailId[] = ['base-usdc', 'robinhood-usdg'];

export function railLabel(id: RailId) {
  const r = RAILS[id] ?? RAILS['base-usdc'];
  return `${r.asset} on ${r.chain}`;
}

/** Asset coin with the chain badge in the corner. */
export function RailMark({ id, size = 28 }: { id: RailId; size?: number }) {
  const r = RAILS[id] ?? RAILS['base-usdc'];
  const badge = Math.round(size * 0.46);
  return (
    <span className="railmark" style={{ width: size, height: size }} aria-hidden>
      <img src={r.assetLogo} alt="" width={size} height={size} style={{ borderRadius: '50%' }} />
      <span className={`railmark__badge ${r.id === 'robinhood-usdg' ? 'rh' : 'base'}`} style={{ width: badge, height: badge }}>
        <img src={r.chainLogo} alt="" />
      </span>
    </span>
  );
}
