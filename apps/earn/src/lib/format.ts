export const usd = (n: number | null | undefined, digits = 2) =>
  `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const usdCompact = (n: number) => {
  const v = Number(n) || 0;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e4) return `$${(v / 1e3).toFixed(1)}k`;
  return usd(v, v >= 1000 ? 0 : 2);
};

export const int = (n: number | null | undefined) => Math.round(Number(n) || 0).toLocaleString('en-US');

export const bytes = (b: number | null | undefined, digits?: number) => {
  const v = Number(b) || 0;
  if (v >= 1e12) return `${(v / 1e12).toFixed(digits ?? 2)} TB`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(digits ?? 2)} GB`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(digits ?? 0)} MB`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)} KB`;
  return `${v.toFixed(0)} B`;
};

export const gb = (g: number | null | undefined, digits = 1) => {
  const v = Number(g) || 0;
  if (v >= 1000) return `${(v / 1000).toFixed(2)} TB`;
  return `${v.toFixed(digits)} GB`;
};

export const mbps = (m: number | null | undefined) => {
  const v = Number(m) || 0;
  if (v >= 1000) return `${(v / 1000).toFixed(2)} Gbps`;
  return `${v.toFixed(v >= 10 ? 1 : 2)} Mbps`;
};

export const ago = (t: number | string | null | undefined) => {
  if (!t) return 'never';
  const ms = Date.now() - new Date(t).getTime();
  if (ms < 15_000) return 'just now';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
};

export const shortAddr = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

export const dayLabel = (t: number) =>
  new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export const timeLabel = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
