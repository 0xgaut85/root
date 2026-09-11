export type NetworkSnapshot = {
  t: number;
  users: number;
  nodes: number;
  activeNodes: number;
  gbTotal: number;
  grossUsd: number;
  paidToContributorsUsd: number;
  networkFeeUsd: number;
  labRatePerGb: number;
  contributorRatePerGb: number;
  throughputMbps: number;
  progress: number;
};
export type NetworkPoint = { t: number; users: number; nodes: number; activeNodes: number; gbTotal: number; grossUsd: number };
export type Continent = 'americas' | 'europe' | 'asia' | 'africa';
export type NetworkRegion = { code: string; name: string; continent: Continent; share: number; nodes: number; gb: number; ratePerGb: number };
export type NetworkContinent = { id: Continent; name: string; share: number; nodes: number };
export type NetworkActivity = { t: number; region: string; bytes: number; ms: number; node: string; verified: boolean };
export type RailId = 'base-usdc' | 'robinhood-usdg';
export type Rail = { id: RailId; asset: string; assetName: string; chain: string; chainId: number | null; explorer: string | null; token: string | null };
export type TreasuryPayout = { t: number; to: string; usd: number; rail: RailId };
export type ExtensionInfo = { id: string; version: string; storeUrl: string; browsers: string[] };
export type AppConfig = { privyAppId: string | null; devAuth: boolean; publicUrl: string | null; treasury: string; rails: Rail[]; extension: ExtensionInfo };
export type Network = {
  now: NetworkSnapshot;
  delta24h: { users: number; nodes: number; gbTotal: number; grossUsd: number } | null;
  series: NetworkPoint[];
  regions: NetworkRegion[];
  continents: NetworkContinent[];
  activity: NetworkActivity[];
  treasury: { address: string; paidOutUsd: number; payouts: TreasuryPayout[] };
  rails: Rail[];
  meta: { startedAt: number; historyDays: number; growthDays: number; contributorShare: number; arpuPerDay: number };
};

export type Device = {
  id: string;
  name: string;
  online: boolean;
  paused: boolean;
  allocation: number;
  capacityMbps: number | null;
  mbps: number;
  totalBytes: number;
  dailyCapBytes: number;
  version: string | null;
  createdAt: string;
  lastSeenAt: string | null;
};
export type Me = {
  user: {
    id: string;
    email: string | null;
    wallet: string | null;
    payoutRail: RailId;
    displayName: string | null;
    referralCode: string;
    allocation: number;
    monthlyBudgetGb: number | null;
    autoPayoutUsd: number | null;
    createdAt: string;
  };
  balance: {
    earnedUsd: number;
    paidOutUsd: number;
    availableUsd: number;
    minPayoutUsd: number;
    totalBytes: number;
    todayUsd: number;
    todayBytes: number;
  };
  treasury: string;
  devices: Device[];
  hours: { t: number; usd: number; bytes: number }[];
  payouts: { id: number; usd: number; wallet: string; rail: RailId; txHash: string | null; status: string; createdAt: string }[];
};

let tokenGetter: () => Promise<string | null> = async () => null;
export function setTokenGetter(fn: () => Promise<string | null>) {
  tokenGetter = fn;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) };
  if (auth) {
    const t = await tokenGetter();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  config: () => request<AppConfig>('/api/config', {}, false),
  network: () => request<Network>('/api/network', {}, false),
  me: () => request<Me>('/api/me'),
  updateMe: (
    patch: Partial<{ allocation: number; monthlyBudgetGb: number | null; autoPayoutUsd: number | null; wallet: string | null; payoutRail: RailId; email: string | null; displayName: string | null }>,
  ) =>
    request<Me>('/api/me', { method: 'PATCH', body: JSON.stringify(patch) }),
  pairCode: () => request<{ code: string; expiresAt: number }>('/api/me/pair', { method: 'POST' }),
  updateDevice: (id: string, patch: Partial<{ name: string; paused: boolean; allocation: number | null }>) =>
    request<Me>(`/api/me/devices/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  removeDevice: (id: string) => request<Me>(`/api/me/devices/${id}`, { method: 'DELETE' }),
  payout: (usd?: number) => request<Me>('/api/me/payouts', { method: 'POST', body: JSON.stringify({ usd }) }),
};
