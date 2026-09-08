import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Bars, Card, CardHead, Icon, Num, Pill, Sheet, Slider, Stat, Toggle, useToast } from '../components/ui';
import { api, type Me } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDebouncedSetting, useMe, useNetwork } from '../lib/hooks';
import { ago, bytes, mbps, timeLabel, usd } from '../lib/format';
import { RAILS, RailMark } from '../lib/rails';

export function Overview() {
  const { data: me, setData, refresh } = useMe(5000);
  const { data: net } = useNetwork(8000);
  const { email } = useAuth();
  const toast = useToast();
  const [payoutOpen, setPayoutOpen] = useState(false);

  const writeAlloc = useCallback(
    async (v: number) => {
      const m = await api.updateMe({ allocation: v });
      setData(m);
    },
    [setData],
  );
  const [alloc, setAlloc] = useDebouncedSetting<number>(me?.user.allocation, writeAlloc);

  const online = me?.devices.filter((d) => d.online) ?? [];
  const relaying = online.filter((d) => !d.paused);
  const liveMbps = relaying.reduce((a, d) => a + d.mbps, 0);
  const anyPaused = online.length > 0 && relaying.length === 0;
  const state: 'on' | 'off' | 'paused' = online.length === 0 ? 'off' : anyPaused ? 'paused' : 'on';

  const hours = useMemo(() => {
    if (!me) return [];
    const now = Date.now();
    const start = Math.floor(now / 3_600_000) * 3_600_000 - 23 * 3_600_000;
    const map = new Map(me.hours.map((h) => [h.t, h.usd]));
    return Array.from({ length: 24 }, (_, i) => {
      const t = start + i * 3_600_000;
      return { t, v: map.get(t) ?? 0 };
    });
  }, [me]);

  const cumulative = useMemo(() => {
    if (!me) return [];
    let acc = 0;
    const pts = me.hours.map((h) => ({ t: h.t, v: (acc += h.usd) }));
    if (!pts.length) return [];
    return pts;
  }, [me]);

  const togglePause = async (id: string, paused: boolean) => {
    const m = await api.updateDevice(id, { paused });
    setData(m);
    toast(paused ? 'Sharing paused' : 'Sharing resumed');
  };

  const firstName = me?.user.displayName || (email ? email.split('@')[0] : null);

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">{firstName ? `Hey ${firstName}` : 'Overview'}</h1>
          <p className="page__sub">
            {state === 'on'
              ? `${relaying.length} node${relaying.length > 1 ? 's' : ''} relaying · ${mbps(liveMbps)}`
              : state === 'paused'
                ? 'Sharing is paused'
                : me && me.devices.length === 0
                  ? 'Install the extension to start earning'
                  : 'No node online right now'}
          </p>
        </div>
        <Pill state={state}>{state === 'on' ? 'Live' : state === 'paused' ? 'Paused' : 'Offline'}</Pill>
      </div>

      <div className="grid grid--main">
        <Card dark className="balance">
          <div>
            <div className="eyebrow">Available balance</div>
            <div className="balance__num" style={{ marginTop: 10 }}>
              {me ? <Num value={me.balance.availableUsd} fmt={(v) => usd(v, v > 0 && v < 1 ? 4 : 2)} /> : <span className="sk">$0.00</span>}
              <small>USD</small>
            </div>
          </div>
          <div className="balance__row">
            <div>
              <div className="eyebrow">Today</div>
              <b>{me ? <Num value={me.balance.todayUsd} fmt={(v) => usd(v, v > 0 && v < 1 ? 4 : 2)} /> : '—'}</b>
            </div>
            <div>
              <div className="eyebrow">Shared today</div>
              <b>{me ? <Num value={me.balance.todayBytes} fmt={(v) => bytes(v)} /> : '—'}</b>
            </div>
            <div>
              <div className="eyebrow">Lifetime</div>
              <b>{me ? <Num value={me.balance.earnedUsd} fmt={(v) => usd(v, v > 0 && v < 1 ? 4 : 2)} /> : '—'}</b>
            </div>
          </div>
          <div className="balance__actions">
            <button className="btn btn--light btn--sm" onClick={() => setPayoutOpen(true)} disabled={!me || me.balance.availableUsd < me.balance.minPayoutUsd}>
              Withdraw
            </button>
            <Link className="btn btn--ghost-inv btn--sm" to="/settings">
              Payout settings
            </Link>
          </div>
          <div className="balance__chart">
            {cumulative.length >= 2 ? (
              <AreaChart points={cumulative} height={92} color="#ffffff" showAxis={false} padTop={8} grid={0} />
            ) : (
              <div style={{ height: 92, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 12.5 }}>Earnings appear here as your node relays traffic</div>
            )}
          </div>
        </Card>

        <div className="grid" style={{ gridTemplateColumns: '1fr', alignContent: 'start' }}>
          <Card>
            <CardHead title="Allocation" hint="Share of your connection the network may use." />
            <Slider value={alloc ?? 25} onChange={setAlloc} label="Max share" marks={['5%', '25%', '50%', '75%', '100%']} />
          </Card>
          <Card tight>
            <CardHead
              title="Network"
              right={
                <Link to="/data" className="btn btn--ghost btn--sm">
                  Data
                </Link>
              }
            />
            <div className="grid grid--2" style={{ gap: 10 }}>
              <div>
                <div className="eyebrow">Nodes online</div>
                <div className="stat__v" style={{ fontSize: 24, marginTop: 6 }}>
                  {net ? <Num value={net.now.activeNodes} fmt={(v) => Math.round(v).toLocaleString()} /> : '—'}
                </div>
              </div>
              <div>
                <div className="eyebrow">Throughput</div>
                <div className="stat__v" style={{ fontSize: 24, marginTop: 6 }}>
                  {net ? <Num value={net.now.throughputMbps} fmt={mbps} /> : '—'}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid--3">
        <Stat label="Live throughput" value={mbps(liveMbps)} loading={!me} deltaLabel={relaying.length ? 'Deliveries arrive in bursts' : 'Waiting for a node'} />
        <Stat label="Lifetime shared" value={bytes(me?.balance.totalBytes)} loading={!me} deltaLabel="Verified bytes relayed" />
        <Stat label="Rate" value={usd(net?.now.contributorRatePerGb ?? 1)} unit="/ GB" loading={!net} deltaLabel="80% of what labs pay" />
      </div>

      <div className="grid grid--main">
        <Card>
          <CardHead title="Last 24 hours" hint="Hourly earnings. Verified at the end of each hour." />
          <Bars points={hours} height={120} fmt={(v) => usd(v)} />
          <div className="slider__marks" style={{ marginTop: 8 }}>
            <span>{hours.length ? timeLabel(hours[0].t) : ''}</span>
            <span>now</span>
          </div>
        </Card>

        <Card>
          <CardHead
            title="Your nodes"
            right={
              <Link to="/extension" className="btn btn--ghost btn--sm">
                Add device
              </Link>
            }
          />
          {me && me.devices.length === 0 && (
            <div style={{ padding: '18px 0 6px', textAlign: 'center' }}>
              <div className="device__icon" style={{ margin: '0 auto 12px' }}>
                <Icon name="puzzle" />
              </div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>No node yet</div>
              <p className="card__hint" style={{ marginBottom: 14 }}>
                Install the Root extension and pair it with this account in one click.
              </p>
              <Link to="/extension" className="btn btn--primary btn--sm">
                <Icon name="download" /> Get the extension
              </Link>
            </div>
          )}
          <div className="list">
            {me?.devices.map((d) => (
              <div key={d.id} className="row">
                <div className="device" style={{ flex: 1 }}>
                  <div className="device__icon">
                    <Icon name="laptop" />
                  </div>
                  <div>
                    <div className="device__name">{d.name}</div>
                    <div className="device__meta">
                      {d.online ? (d.paused ? 'Paused' : `${mbps(d.mbps)} · ${d.allocation}%`) : `Offline · seen ${ago(d.lastSeenAt)}`}
                    </div>
                  </div>
                </div>
                <Toggle on={!d.paused} onChange={(on) => togglePause(d.id, !on)} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <PayoutSheet open={payoutOpen} onClose={() => setPayoutOpen(false)} me={me} onDone={(m) => { setData(m); refresh(); }} />
    </div>
  );
}

export function PayoutSheet({ open, onClose, me, onDone }: { open: boolean; onClose: () => void; me: Me | null; onDone: (m: Me) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!me) return;
    setBusy(true);
    try {
      const m = await api.payout();
      onDone(m);
      toast(`Withdrawal of ${usd(me.balance.availableUsd)} requested`);
      onClose();
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  };
  const rail = RAILS[me?.user.payoutRail ?? 'base-usdc'];
  return (
    <Sheet open={open} onClose={onClose}>
      <h3>Withdraw</h3>
      <p>Your available balance is sent from the Root Network treasury to your payout address. Gas is covered by the network.</p>
      <div className="list" style={{ marginBottom: 18 }}>
        <div className="row">
          <div className="row__main">
            <div className="row__t">Amount</div>
          </div>
          <div className="row__r" style={{ color: 'var(--ink)', fontWeight: 500 }}>
            {usd(me?.balance.availableUsd)}
          </div>
        </div>
        <div className="row">
          <div className="row__main">
            <div className="row__t">Paid in</div>
          </div>
          <div className="row__r" style={{ color: 'var(--ink)', gap: 8 }}>
            <RailMark id={rail.id} size={22} />
            {rail.asset} <span style={{ color: 'var(--ink-3)' }}>on {rail.chain}</span>
          </div>
        </div>
        <div className="row">
          <div className="row__main">
            <div className="row__t">To</div>
          </div>
          <div className="row__r mono" style={{ fontSize: 12.5 }}>
            {me?.user.wallet ? `${me.user.wallet.slice(0, 8)}…${me.user.wallet.slice(-6)}` : 'No address set'}
          </div>
        </div>
        <div className="row">
          <div className="row__main">
            <div className="row__t">From</div>
          </div>
          <div className="row__r mono" style={{ fontSize: 12.5 }}>
            {me?.treasury ? `${me.treasury.slice(0, 8)}…${me.treasury.slice(-6)}` : '—'}
          </div>
        </div>
      </div>
      {me?.user.wallet ? (
        <button className="btn btn--primary btn--block btn--lg" onClick={go} disabled={busy}>
          {busy ? 'Requesting…' : 'Confirm withdrawal'}
        </button>
      ) : (
        <Link to="/settings" className="btn btn--primary btn--block btn--lg" onClick={onClose}>
          Add a payout address
        </Link>
      )}
    </Sheet>
  );
}
