import { useCallback, useState } from 'react';
import { Card, CardHead, Icon, Segmented, Sheet, Slider, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDebouncedSetting, useMe } from '../lib/hooks';
import { shortAddr, usd } from '../lib/format';
import { PayoutSheet } from './Overview';

export function Settings() {
  const { data: me, setData, refresh } = useMe(8000);
  const { logout, email, wallet: privyWallet } = useAuth();
  const toast = useToast();
  const [walletOpen, setWalletOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [walletInput, setWalletInput] = useState('');
  const [budgetInput, setBudgetInput] = useState('');

  const writeAlloc = useCallback(async (v: number) => setData(await api.updateMe({ allocation: v })), [setData]);
  const [alloc, setAlloc] = useDebouncedSetting<number>(me?.user.allocation, writeAlloc);

  const save = async (patch: Parameters<typeof api.updateMe>[0], msg: string) => {
    try {
      setData(await api.updateMe(patch));
      toast(msg);
      return true;
    } catch (e) {
      toast((e as Error).message, 'err');
      return false;
    }
  };

  const referral = me ? `${window.location.origin}/?ref=${me.user.referralCode}` : '';

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Settings</h1>
          <p className="page__sub">{email ?? me?.user.id}</p>
        </div>
      </div>

      <div className="grid grid--main">
        <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
          <Card>
            <CardHead title="Sharing" hint="Defaults for all your nodes. Each device can override its own allocation from the extension." />
            <Slider value={alloc ?? 25} onChange={setAlloc} label="Default allocation" marks={['5%', '25%', '50%', '75%', '100%']} />
            <div className="list" style={{ marginTop: 18 }}>
              <button className="row row--btn" onClick={() => { setBudgetInput(me?.user.monthlyBudgetGb ? String(me.user.monthlyBudgetGb) : ''); setBudgetOpen(true); }}>
                <div className="row__main">
                  <div className="row__t">Monthly data budget</div>
                  <div className="row__s">Stops sharing when the network has used this much this month.</div>
                </div>
                <div className="row__r">
                  {me?.user.monthlyBudgetGb ? `${me.user.monthlyBudgetGb} GB` : 'Unlimited'} <Icon name="chev" size={16} />
                </div>
              </button>
            </div>
          </Card>

          <Card>
            <CardHead title="Payouts" hint="Earnings are paid in USDC. Minimum withdrawal $5. No fees." />
            <div className="list">
              <button className="row row--btn" style={{ borderTop: 0, paddingTop: 0 }} onClick={() => { setWalletInput(me?.user.wallet ?? privyWallet ?? ''); setWalletOpen(true); }}>
                <div className="row__main">
                  <div className="row__t">Payout wallet</div>
                  <div className="row__s">{me?.user.wallet ? me.user.wallet : privyWallet ? `Use your signed-in wallet ${shortAddr(privyWallet)}` : 'Add an EVM or Solana address'}</div>
                </div>
                <div className="row__r">
                  {me?.user.wallet ? shortAddr(me.user.wallet) : 'Add'} <Icon name="chev" size={16} />
                </div>
              </button>
              <div className="row">
                <div className="row__main">
                  <div className="row__t">Automatic payout</div>
                  <div className="row__s">Send to your wallet when the balance crosses a threshold.</div>
                </div>
                <div className="row__r">
                  <Segmented<number>
                    value={me?.user.autoPayoutUsd ?? 0}
                    onChange={(v) => save({ autoPayoutUsd: v === 0 ? null : v }, v === 0 ? 'Automatic payout off' : `Auto payout at $${v}`)}
                    options={[
                      { v: 0, label: 'Off' },
                      { v: 10, label: '$10' },
                      { v: 25, label: '$25' },
                      { v: 50, label: '$50' },
                      { v: 100, label: '$100' },
                    ]}
                  />
                </div>
              </div>
              <div className="row">
                <div className="row__main">
                  <div className="row__t">Available now</div>
                  <div className="row__s">{me ? `${usd(me.balance.earnedUsd)} earned · ${usd(me.balance.paidOutUsd)} paid out` : ''}</div>
                </div>
                <div className="row__r">
                  <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{usd(me?.balance.availableUsd)}</span>
                  <button className="btn btn--primary btn--sm" disabled={!me || me.balance.availableUsd < me.balance.minPayoutUsd} onClick={() => setPayoutOpen(true)}>
                    Withdraw
                  </button>
                </div>
              </div>
            </div>
            {me && me.payouts.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>
                  History
                </div>
                <div className="list">
                  {me.payouts.map((p) => (
                    <div key={p.id} className="row" style={{ padding: '10px 0' }}>
                      <div className="row__main">
                        <div className="row__t">{usd(p.usd)}</div>
                        <div className="row__s mono">{shortAddr(p.wallet)}</div>
                      </div>
                      <div className="row__r">
                        <span className="pill" style={{ height: 22, fontSize: 9.5 }}>
                          <i style={{ background: p.status === 'paid' ? 'var(--green)' : 'var(--amber)' }} />
                          {p.status}
                        </span>
                        <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr', alignContent: 'start' }}>
          <Card>
            <CardHead title="Referrals" hint="Earn 10% of what people you invite earn for 12 months, paid from the network fee." />
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input input--mono" readOnly value={referral} onFocus={(e) => e.currentTarget.select()} />
              <button className="btn btn--primary" onClick={() => navigator.clipboard.writeText(referral).then(() => toast('Link copied'))}>
                <Icon name="copy" />
              </button>
            </div>
          </Card>

          <Card>
            <CardHead title="Account" />
            <div className="list">
              <div className="row" style={{ borderTop: 0, paddingTop: 0 }}>
                <div className="row__main">
                  <div className="row__t">Signed in as</div>
                  <div className="row__s">{email ?? me?.user.id}</div>
                </div>
              </div>
              <div className="row">
                <div className="row__main">
                  <div className="row__t">Member since</div>
                </div>
                <div className="row__r">{me ? new Date(me.user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</div>
              </div>
              <button className="row row--btn" onClick={() => logout()}>
                <div className="row__main">
                  <div className="row__t" style={{ color: 'var(--red)' }}>
                    Sign out
                  </div>
                </div>
                <div className="row__r">
                  <Icon name="logout" size={16} />
                </div>
              </button>
            </div>
          </Card>

          <Card tight>
            <div className="sidebar__links" style={{ padding: 0, flexWrap: 'wrap' }}>
              <a href="https://read.rootnetwork.co">Protocol docs</a>
              <a href="https://rootnetwork.co/privacy">Privacy</a>
              <a href="https://read.rootnetwork.co/data/acceptable-use">Acceptable use</a>
              <a href="mailto:support@rootnetwork.co">Support</a>
            </div>
          </Card>
        </div>
      </div>

      {/* Wallet sheet */}
      <Sheet open={walletOpen} onClose={() => setWalletOpen(false)}>
        <h3>Payout wallet</h3>
        <p>USDC is sent here when you withdraw. EVM (0x…) and Solana addresses are accepted.</p>
        <input className="input input--mono" placeholder="0x… or Solana address" value={walletInput} onChange={(e) => setWalletInput(e.target.value)} autoFocus />
        {privyWallet && walletInput !== privyWallet && (
          <button className="link" style={{ background: 'none', border: 0, padding: '10px 0 0', color: 'var(--ink-2)', textDecoration: 'underline' }} onClick={() => setWalletInput(privyWallet)}>
            Use my signed-in wallet {shortAddr(privyWallet)}
          </button>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            className="btn btn--primary btn--lg"
            style={{ flex: 1 }}
            onClick={async () => {
              if (await save({ wallet: walletInput.trim() || null }, walletInput.trim() ? 'Wallet saved' : 'Wallet removed')) setWalletOpen(false);
            }}
          >
            Save
          </button>
          <button className="btn btn--ghost btn--lg" onClick={() => setWalletOpen(false)}>
            Cancel
          </button>
        </div>
      </Sheet>

      {/* Budget sheet */}
      <Sheet open={budgetOpen} onClose={() => setBudgetOpen(false)}>
        <h3>Monthly data budget</h3>
        <p>Useful if your internet plan has a data cap. Only traffic relayed by the network counts. Leave empty for unlimited.</p>
        <input className="input" type="number" min={1} placeholder="e.g. 200" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} autoFocus />
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            className="btn btn--primary btn--lg"
            style={{ flex: 1 }}
            onClick={async () => {
              const v = budgetInput.trim() ? Number(budgetInput) : null;
              if (await save({ monthlyBudgetGb: v }, v ? `Budget set to ${v} GB` : 'Budget removed')) setBudgetOpen(false);
            }}
          >
            Save
          </button>
          <button className="btn btn--ghost btn--lg" onClick={() => setBudgetOpen(false)}>
            Cancel
          </button>
        </div>
      </Sheet>

      <PayoutSheet open={payoutOpen} onClose={() => setPayoutOpen(false)} me={me} onDone={(m) => { setData(m); refresh(); }} />
    </div>
  );
}
