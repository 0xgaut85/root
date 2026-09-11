import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardHead, Icon, Pill, Toggle, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useConfig, useExtension, useMe } from '../lib/hooks';
import { ago, bytes, mbps } from '../lib/format';

const ZIP = '/downloads/root-network-extension.zip';
/** Published listing; /api/config overrides these so the server stays the source of truth. */
const FALLBACK_EXT = { id: 'jlgmdngjhimpgjeceddehokdjcbglebg', version: '0.1.0', storeUrl: 'https://chromewebstore.google.com/detail/jlgmdngjhimpgjeceddehokdjcbglebg', browsers: ['Chrome', 'Brave', 'Edge', 'Arc'] };
const PROD_HOST = 'earn.rootnetwork.co';

export function Extension() {
  const { data: me, setData, refresh } = useMe(4000);
  const ext = useExtension();
  const toast = useToast();
  const cfg = useConfig();
  const info = cfg?.extension ?? FALLBACK_EXT;
  const [manual, setManual] = useState(false);
  // The store build only injects its pairing bridge on the production host.
  const host = window.location.hostname;
  const offHost = host !== PROD_HOST && host !== 'localhost' && host !== '127.0.0.1';
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [pairing, setPairing] = useState<'idle' | 'working' | 'ok' | 'fail'>('idle');
  const autoTried = useRef(false);

  const newCode = useCallback(async () => {
    const c = await api.pairCode();
    setCode(c);
    return c;
  }, []);

  useEffect(() => {
    newCode().catch(() => {});
  }, [newCode]);

  // One-click pairing: extension present + not paired -> hand it a fresh code.
  const pairNow = useCallback(async () => {
    setPairing('working');
    try {
      const c = await newCode();
      const r = await ext.pair(c.code);
      if (!r.ok) throw new Error(r.error || 'Pairing failed');
      setPairing('ok');
      toast('Extension paired');
      await refresh();
      // The first heartbeat lands a few seconds after pairing; pull once more so the device shows live.
      setTimeout(() => refresh(), 4000);
    } catch (e) {
      setPairing('fail');
      toast((e as Error).message, 'err');
    }
  }, [ext, newCode, refresh, toast]);

  useEffect(() => {
    if (ext.present && !ext.paired && !autoTried.current && me) {
      autoTried.current = true;
      pairNow();
    }
  }, [ext.present, ext.paired, me, pairNow]);

  const rename = async (id: string, current: string) => {
    const name = window.prompt('Device name', current);
    if (!name || name === current) return;
    setData(await api.updateDevice(id, { name }));
  };
  const remove = async (id: string) => {
    if (!window.confirm('Remove this device? It will stop earning until paired again.')) return;
    setData(await api.removeDevice(id));
    toast('Device removed');
  };

  const mins = code ? Math.max(0, Math.round((code.expiresAt - Date.now()) / 60_000)) : 0;

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Extension</h1>
          <p className="page__sub">Your node runs inside the browser. Install once, pair once, forget about it.</p>
        </div>
        <Pill state={ext.paired ? 'on' : ext.present ? 'paused' : 'off'}>{ext.paired ? 'Paired here' : ext.present ? 'Detected' : 'Not detected'}</Pill>
      </div>

      <div className="grid grid--main">
        <Card dark>
          <div className="eyebrow">Root extension · v{info.version} · Chrome Web Store</div>
          <h2 style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '10px 0 10px' }}>
            Add to Chrome, Brave,
            <br />
            Edge and Arc.
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.55, margin: '0 0 20px', maxWidth: 480 }}>
            The extension relays sealed traffic through your connection and reports verified bytes to your dashboard. It can't read your browsing and never exceeds your allocation. Updates arrive through the store.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a className="btn btn--light" href={info.storeUrl} target="_blank" rel="noopener">
              <Icon name="download" /> Add to Chrome
            </a>
            <a className="btn btn--ghost-inv" href="https://read.rootnetwork.co/architecture/root-node">
              How a node works <Icon name="out" />
            </a>
          </div>
          <div style={{ marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
            One listing for every Chromium browser · ID <code style={{ fontSize: 11 }}>{info.id}</code> ·{' '}
            <button
              className="link"
              style={{ background: 'none', border: 0, padding: 0, color: 'rgba(255,255,255,0.6)', textDecoration: 'underline', font: 'inherit' }}
              onClick={() => setManual((m) => !m)}
            >
              {manual ? 'hide manual install' : 'manual install (zip)'}
            </button>
          </div>
        </Card>

        <Card>
          <CardHead title="Pairing" hint="Links this browser's extension to your account." />
          <AnimatePresence mode="wait">
            {ext.paired ? (
              <motion.div key="paired" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="device__icon" style={{ background: 'rgba(23,178,106,0.12)', color: '#0f8a50' }}>
                  <Icon name="check" />
                </div>
                <div>
                  <div style={{ fontWeight: 500 }}>This browser is paired</div>
                  <div className="card__hint">Extension v{ext.version}. Your node shows up in the list below.</div>
                </div>
              </motion.div>
            ) : ext.present ? (
              <motion.div key="present" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <p className="card__hint" style={{ marginBottom: 12 }}>
                  Extension detected. Pair it with one click.
                </p>
                <button className="btn btn--primary" onClick={pairNow} disabled={pairing === 'working'}>
                  {pairing === 'working' ? 'Pairing…' : 'Pair this browser'}
                </button>
              </motion.div>
            ) : (
              <motion.div key="code" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {offHost && (
                  <p className="card__hint" style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(192,57,43,0.08)', color: 'var(--ink-1)' }}>
                    The store extension pairs with <b>{PROD_HOST}</b> only.{' '}
                    <a className="link" href={`https://${PROD_HOST}/extension`} style={{ textDecoration: 'underline' }}>
                      Open this page there
                    </a>{' '}
                    for one-click pairing.
                  </p>
                )}
                <p className="card__hint" style={{ marginBottom: 12 }}>
                  Install the extension, click its icon and enter this code. If you open this page with the extension installed, pairing is automatic.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span className="code">{code?.code ?? '···-···'}</span>
                  <button className="btn btn--ghost btn--sm" onClick={() => code && navigator.clipboard.writeText(code.code).then(() => toast('Code copied'))}>
                    <Icon name="copy" /> Copy
                  </button>
                </div>
                <div className="card__hint" style={{ marginTop: 10 }}>
                  Expires in {mins} min ·{' '}
                  <button className="link" style={{ background: 'none', border: 0, padding: 0, textDecoration: 'underline', color: 'var(--ink-2)' }} onClick={() => newCode()}>
                    new code
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </div>

      <div className="grid grid--main">
        <Card>
          {manual ? (
            <>
              <CardHead title="Manual install" hint="For developers, or browsers that block the store. Manual builds don't auto-update." />
              <div className="steps">
                <div className="step">
                  <div className="step__n">1</div>
                  <div>
                    <div className="step__t">Download and unzip</div>
                    <div className="step__d">
                      <a className="link" href={ZIP} download style={{ textDecoration: 'underline' }}>
                        Download the zip
                      </a>{' '}
                      and unzip it. You'll get a folder called <code>root-network-extension</code>.
                    </div>
                  </div>
                </div>
                <div className="step">
                  <div className="step__n">2</div>
                  <div>
                    <div className="step__t">Open your browser's extensions page</div>
                    <div className="step__d">
                      Go to <code>chrome://extensions</code> (or <code>brave://extensions</code>, <code>edge://extensions</code>) and turn on <b>Developer mode</b> in the top right.
                    </div>
                  </div>
                </div>
                <div className="step">
                  <div className="step__n">3</div>
                  <div>
                    <div className="step__t">Load unpacked</div>
                    <div className="step__d">
                      Click <b>Load unpacked</b> and choose the unzipped folder. Pin the Root icon to your toolbar.
                    </div>
                  </div>
                </div>
                <div className="step">
                  <div className="step__n">4</div>
                  <div>
                    <div className="step__t">Come back here</div>
                    <div className="step__d">Reload this page. The extension is detected and paired automatically, or enter the pairing code in the popup.</div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <CardHead title="Install in 3 steps" hint="About a minute. Works in Chrome, Brave, Edge, Arc and other Chromium browsers." />
              <div className="steps">
                <div className="step">
                  <div className="step__n">1</div>
                  <div>
                    <div className="step__t">Add it from the Chrome Web Store</div>
                    <div className="step__d">
                      Click <b>Add to Chrome</b> above, then <b>Add extension</b> in the browser prompt. The only site it asks for is <code>{PROD_HOST}</code>, so it can pair with this dashboard.
                    </div>
                  </div>
                </div>
                <div className="step">
                  <div className="step__n">2</div>
                  <div>
                    <div className="step__t">Pin the Root icon</div>
                    <div className="step__d">
                      Open the extensions menu (the puzzle piece next to the address bar) and pin <b>Root Network</b> so your node's status is always one click away.
                    </div>
                  </div>
                </div>
                <div className="step">
                  <div className="step__n">3</div>
                  <div>
                    <div className="step__t">Come back here</div>
                    <div className="step__d">
                      Reload this page. The extension is detected and paired to your account automatically; the first heartbeat lands within a few seconds. Not detected? Click the Root icon and type the code shown above.
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>

        <Card>
          <CardHead title="Your devices" hint="Every paired browser is its own node." />
          {me && me.devices.length === 0 && <p className="card__hint">No devices paired yet.</p>}
          <div className="list">
            {me?.devices.map((d) => (
              <div key={d.id} className="row" style={{ alignItems: 'flex-start' }}>
                <div className="device" style={{ flex: 1 }}>
                  <div className="device__icon">
                    <Icon name="laptop" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="device__name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {d.name}
                    </div>
                    <div className="device__meta" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className={`pill ${d.online ? (d.paused ? 'paused' : 'on') : ''}`} style={{ height: 20, fontSize: 9.5 }}>
                        <i />
                        {d.online ? (d.paused ? 'Paused' : 'Online') : 'Offline'}
                      </span>
                      <span>
                        {d.online ? `${mbps(d.mbps)} now` : `Seen ${ago(d.lastSeenAt)}`} · {d.allocation}% of {d.capacityMbps ? `${Math.round(d.capacityMbps)} Mbps` : '—'}
                      </span>
                    </div>
                    <div className="device__meta">{bytes(d.totalBytes)} relayed lifetime</div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12.5 }}>
                      <button className="link" style={{ background: 'none', border: 0, padding: 0, color: 'var(--ink-2)' }} onClick={() => rename(d.id, d.name)}>
                        Rename
                      </button>
                      <button className="link" style={{ background: 'none', border: 0, padding: 0, color: 'var(--red)' }} onClick={() => remove(d.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
                <Toggle on={!d.paused} onChange={async (on) => setData(await api.updateDevice(d.id, { paused: !on }))} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
