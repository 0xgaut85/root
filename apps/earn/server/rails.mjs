/**
 * Payout rails and the treasury that funds them.
 * Both rails are EVM chains, so a single 0x address works for either.
 *
 * Both stablecoins use 6 decimals. RPC endpoints can be overridden with
 * BASE_RPC_URL / ROBINHOOD_RPC_URL (e.g. an Alchemy key) for reliability.
 */
export const TREASURY_ADDRESS = (process.env.TREASURY_ADDRESS || '0x3e32A1b643A81927802E7Fa202709395Ce8D1821').trim();

export const RAILS = {
  'base-usdc': {
    id: 'base-usdc',
    asset: 'USDC',
    assetName: 'USD Coin',
    chain: 'Base',
    chainId: 8453,
    explorer: 'https://basescan.org',
    token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
    rpc: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    /** Probability that a given payout goes out on this rail (server-side only, not published). */
    share: 0.3,
  },
  'robinhood-usdg': {
    id: 'robinhood-usdg',
    asset: 'USDG',
    assetName: 'Global Dollar',
    chain: 'Robinhood Chain',
    chainId: 4663,
    explorer: 'https://robinhoodchain.blockscout.com',
    token: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    decimals: 6,
    rpc: process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com',
    share: 0.7,
  },
};

export const DEFAULT_RAIL = 'base-usdc';
export const RAIL_IDS = Object.keys(RAILS);
export const isRail = (id) => Object.prototype.hasOwnProperty.call(RAILS, id);
export const isEvmAddress = (s) => /^0x[0-9a-fA-F]{40}$/.test(String(s || ''));

export const txUrl = (railId, hash) => (RAILS[railId] && hash ? `${RAILS[railId].explorer}/tx/${hash}` : null);
export const addressUrl = (railId, addr) => (RAILS[railId] && addr ? `${RAILS[railId].explorer}/address/${addr}` : null);

/** Public description of the rails (no secrets involved, but keep the shape stable for the client). */
export const publicRails = () =>
  Object.values(RAILS).map((r) => ({
    id: r.id,
    asset: r.asset,
    assetName: r.assetName,
    chain: r.chain,
    chainId: r.chainId,
    explorer: r.explorer,
    token: r.token,
  }));
