/**
 * Payout rails and the treasury that funds them.
 * Both rails are EVM chains, so a single 0x address works for either.
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
  },
  'robinhood-usdg': {
    id: 'robinhood-usdg',
    asset: 'USDG',
    assetName: 'Global Dollar',
    chain: 'Robinhood Chain',
    chainId: null,
    explorer: null,
    token: null,
  },
};

export const DEFAULT_RAIL = 'base-usdc';
export const isRail = (id) => Object.prototype.hasOwnProperty.call(RAILS, id);
export const isEvmAddress = (s) => /^0x[0-9a-fA-F]{40}$/.test(String(s || ''));

/** Public description of the rails (no secrets involved, but keep the shape stable for the client). */
export const publicRails = () =>
  Object.values(RAILS).map((r) => ({ id: r.id, asset: r.asset, assetName: r.assetName, chain: r.chain, chainId: r.chainId, explorer: r.explorer, token: r.token }));
