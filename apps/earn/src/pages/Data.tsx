import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, useState } from 'react';
import { AreaChart, Card, CardHead, Delta, Icon, Num, Segmented, Stat } from '../components/ui';
import { NodeMap } from '../components/NodeMap';
import { useNetwork } from '../lib/hooks';
import { ago, bytes, dayLabel, gb, int, mbps, shortAddr, timeLabel, usd, usdCompact } from '../lib/format';
import { RAILS, RAIL_IDS, RailMark } from '../lib/rails';

type Metric = 'users' | 'grossUsd' | 'gbTotal' | 'activeNodes';

export function Data() {
  const { data } = useNetwork(4000);
  const [metric, setMetric] = useState<Metric>('users');
  const n = data?.now;

  const series = useMemo(() => (data ? data.series.map((p) => ({ t: p.t, v: p[metric] })) : []), [data, metric]);
  const fmt = (v: number) => (metric === 'grossUsd' ? usdCompact(v) : metric === 'gbTotal' ? gb(v, 0) : int(v));
  const xFmt = (t: number) => `${dayLabel(t)} ${timeLabel(t)}`;

  const maxRegion = data ? Math.max(...data.regions.map((r) => r.nodes)) : 1;
  const topRegions = useMemo(() => (data ? [...data.regions].sort((a, b) => b.nodes - a.nodes).slice(0, 12) : []), [data]);

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Network data</h1>
          <p className="page__sub">Live figures from the contribution ledger. Updated every few seconds.</p>
        </div>
      </div>

      <div className="grid grid--4">
        <Stat label="Contributors" value={n ? int(n.users) : '—'} loading={!n} delta={data?.delta24h?.users ?? null} deltaLabel="24h" />
        <Stat label="Nodes" value={n ? int(n.nodes) : '—'} loading={!n} delta={data?.delta24h?.nodes ?? null} deltaLabel="24h" />
        <Stat label="Nodes online" value={n ? int(n.activeNodes) : '—'} loading={!n} deltaLabel={n ? `${Math.round((n.activeNodes / n.nodes) * 100)}% of nodes` : ''} />
        <Stat label="Bandwidth shared" value={n ? gb(n.gbTotal, 0) : '—'} loading={!n} delta={data?.delta24h?.gbTotal ?? null} deltaLabel="GB · 24h" />
      </div>

      <Card dark className="card--map">
        <CardHead title="Node map" hint={n ? `${int(n.activeNodes)} of ${int(n.nodes)} nodes online · ${mbps(n.throughputMbps)} flowing through the network` : 'Where the network lives right now.'} />
        {data ? <NodeMap regions={data.regions} continents={data.continents} activeNodes={data.now.activeNodes} nodes={data.now.nodes} /> : <div className="sk" style={{ height: 320, borderRadius: 14 }} />}
      </Card>

      <div className="grid grid--main">
        <Card>
          <CardHead
            title="Growth"
            hint="Since the network opened."
            right={
              <Segmented<Metric>
                value={metric}
                onChange={setMetric}
                options={[
                  { v: 'users', label: 'Users' },
                  { v: 'grossUsd', label: 'Revenue' },
                  { v: 'gbTotal', label: 'GB' },
                  { v: 'activeNodes', label: 'Online' },
                ]}
              />
            }
          />
          <AreaChart key={metric} points={series} height={240} yFmt={fmt} xFmt={xFmt} fromZero />
        </Card>

        <Card dark>
          <div className="eyebrow">Paid by AI labs</div>
          <div className="balance__num" style={{ margin: '10px 0 20px', fontSize: 'clamp(36px, 4vw, 48px)' }}>
            {n ? <Num value={n.grossUsd} fmt={(v) => usd(v, 0)} /> : '—'}
          </div>
          <div className="list">
            <div className="row" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <div className="row__main">
                <div className="row__t">To contributors</div>
                <div className="row__s" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  80% of every dollar
                </div>
              </div>
              <div className="row__r" style={{ color: '#fff', fontWeight: 500 }}>
                {n ? <Num value={n.paidToContributorsUsd} fmt={(v) => usd(v, 0)} /> : '—'}
              </div>
            </div>
            <div className="row" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <div className="row__main">
                <div className="row__t">Network fee</div>
                <div className="row__s" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  20% · routers, validators, payouts
                </div>
              </div>
              <div className="row__r" style={{ color: '#fff', fontWeight: 500 }}>
                {n ? <Num value={n.networkFeeUsd} fmt={(v) => usd(v, 0)} /> : '—'}
              </div>
            </div>
            <div className="row" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <div className="row__main">
                <div className="row__t">Blended rate</div>
                <div className="row__s" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Per verified GB
                </div>
              </div>
              <div className="row__r" style={{ color: '#fff', fontWeight: 500 }}>
                {n ? usd(n.labRatePerGb) : '—'}
              </div>
            </div>
            <div className="row" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <div className="row__main">
                <div className="row__t">24h revenue</div>
              </div>
              <div className="row__r" style={{ color: '#fff', fontWeight: 500 }}>
                {data?.delta24h ? <Delta v={data.delta24h.grossUsd} fmt={(v) => usd(v, 0)} /> : '—'}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid--main">
        <Card>
          <CardHead title="Live deliveries" hint={n ? `${mbps(n.throughputMbps)} across the network right now` : undefined} />
          <div className="feed">
            <AnimatePresence initial={false}>
              {data?.activity.map((a) => (
                <motion.div key={a.t} className="feed__row" layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
                  <span className={`feed__dot ${a.verified ? '' : 'bad'}`} />
                  <span className="feed__node">
                    {a.node} <span className="feed__meta">· {a.region}</span>
                  </span>
                  <span className="feed__meta">{a.ms} ms</span>
                  <span className="feed__b">{bytes(a.bytes, 1)}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </Card>

        <Card>
          <CardHead title="Regions" hint="Nodes by country and the lab rate for that region." />
          <div className="bars">
            {topRegions.map((r) => (
              <div key={r.code} className="bar">
                <span className="bar__code">{r.code}</span>
                <div className="bar__track">
                  <motion.div className="bar__fill" initial={{ scaleX: 0 }} animate={{ scaleX: r.nodes / maxRegion }} transition={{ type: 'spring', stiffness: 120, damping: 24 }} />
                </div>
                <span className="bar__v">
                  {int(r.nodes)} · {usd(r.ratePerGb)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid--main">
        <Card>
          <CardHead
            title="Treasury payouts"
            hint={data ? (data.treasury.count ? `${usd(data.treasury.paidOutUsd, 0)} settled on-chain · last 10 transactions` : 'Every payout is an on-chain transfer from the treasury.') : undefined}
          />
          {data && data.treasury.payouts.length === 0 && (
            <p className="card__hint" style={{ padding: '14px 0 6px' }}>
              {data.treasury.live ? 'Waiting for the first withdrawal to settle…' : 'Settlement opens with the network. Transactions will appear here as they confirm.'}
            </p>
          )}
          <div className="feed">
            <AnimatePresence initial={false}>
              {data?.treasury.payouts.map((p) => (
                <motion.a
                  key={p.txHash}
                  className="feed__row feed__row--pay"
                  href={RAILS[p.rail].explorerTx(p.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  title={p.txHash}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                >
                  <RailMark id={p.rail} size={22} />
                  <span className="feed__node">
                    {shortAddr(p.to)} <span className="feed__meta">· {RAILS[p.rail].asset}{p.status === 'sent' ? ' · confirming' : ''}</span>
                  </span>
                  <span className="feed__meta">{ago(p.t)}</span>
                  <span className="feed__b">{usd(p.usd)}</span>
                </motion.a>
              ))}
            </AnimatePresence>
          </div>
        </Card>

        <Card>
          <CardHead title="Payout rails" hint="Contributors choose the dollar they are paid in. Both settle from one treasury." />
          <div className="list">
            {RAIL_IDS.map((id) => {
              const r = RAILS[id];
              return (
                <div key={id} className="row">
                  <div className="row__main" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <RailMark id={id} size={34} />
                    <div style={{ minWidth: 0 }}>
                      <div className="row__t">
                        {r.asset} <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· {r.assetName}</span>
                      </div>
                      <div className="row__s">on {r.chain}</div>
                    </div>
                  </div>
                  <div className="row__r">{data ? `${Math.round((data.rails.find((x) => x.id === id)?.share ?? 0) * 100)}%` : ''}</div>
                </div>
              );
            })}
            <div className="row">
              <div className="row__main">
                <div className="row__t">Treasury</div>
                <div className="row__s mono">{data?.treasury.address ?? '—'}</div>
              </div>
              <div className="row__r" style={{ display: 'flex', gap: 6 }}>
                {data && (
                  <>
                    <a className="btn btn--ghost btn--sm" href={RAILS['base-usdc'].explorerAddr(data.treasury.address)} target="_blank" rel="noreferrer">
                      Base <Icon name="out" size={14} />
                    </a>
                    <a className="btn btn--ghost btn--sm" href={RAILS['robinhood-usdg'].explorerAddr(data.treasury.address)} target="_blank" rel="noreferrer">
                      Robinhood <Icon name="out" size={14} />
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
