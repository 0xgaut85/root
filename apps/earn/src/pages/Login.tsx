import { motion } from 'framer-motion';
import { Heat } from '../components/Heat';
import { Num } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useNetwork } from '../lib/hooks';
import { gb, int, usdCompact } from '../lib/format';

export function Login() {
  const { login, ready, mode } = useAuth();
  const { data } = useNetwork(8000);
  const n = data?.now;
  return (
    <div className="login">
      <div className="login__left">
        <a className="brand" href="https://rootnetwork.co" style={{ padding: 0 }}>
          <img src="/icons/logo-black.png" alt="" />
          Root Network
        </a>
        <motion.div className="login__hero" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
          <p className="eyebrow" style={{ marginBottom: 18 }}>
            earn.rootnetwork.co
          </p>
          <h1>
            Put your idle
            <br />
            internet <em>to work.</em>
          </h1>
          <p>Share the bandwidth you don't use with AI research. Set a percentage, keep your data, and get paid in dollars. Contributors receive 80% of what labs pay.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn--primary btn--lg" onClick={login} disabled={!ready}>
              {ready ? 'Sign in or create account' : 'Loading…'}
            </button>
            <a className="btn btn--ghost btn--lg" href="https://read.rootnetwork.co">
              Read the protocol
            </a>
          </div>
          {mode === 'dev' && (
            <p style={{ marginTop: 14, fontSize: 12.5, color: 'var(--ink-3)' }}>Development mode: Privy is not configured, a local dev sign-in is used.</p>
          )}
        </motion.div>
        <div className="login__foot">
          <a href="https://read.rootnetwork.co/data/privacy-and-security">Privacy</a>
          <a href="https://read.rootnetwork.co/data/acceptable-use">Terms</a>
          <a href="https://x.com/rootnetworkco" target="_blank" rel="noopener">
            @rootnetworkco
          </a>
        </div>
      </div>
      <div className="login__right">
        <Heat />
        <motion.div className="login__stats" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
          <div className="login__stat">
            <div className="eyebrow">Contributors</div>
            <b>{n ? <Num value={n.users} fmt={int} /> : '—'}</b>
          </div>
          <div className="login__stat">
            <div className="eyebrow">Nodes online</div>
            <b>{n ? <Num value={n.activeNodes} fmt={int} /> : '—'}</b>
          </div>
          <div className="login__stat">
            <div className="eyebrow">Bandwidth shared</div>
            <b>{n ? <Num value={n.gbTotal} fmt={(v) => gb(v, 0)} /> : '—'}</b>
          </div>
          <div className="login__stat">
            <div className="eyebrow">Paid to contributors</div>
            <b>{n ? <Num value={n.paidToContributorsUsd} fmt={usdCompact} /> : '—'}</b>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
