import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { setTokenGetter } from './api';

export type AuthState = {
  ready: boolean;
  authenticated: boolean;
  login: () => void;
  logout: () => Promise<void>;
  email: string | null;
  wallet: string | null;
  mode: 'privy' | 'dev';
};

const Ctx = createContext<AuthState | null>(null);
export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside provider');
  return v;
};

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;

/* ---------------- Privy-backed ---------------- */
function PrivyBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout, getAccessToken, user } = usePrivy();
  // Set synchronously during render so children's first fetch already carries the token.
  useMemo(() => {
    setTokenGetter(async () => (authenticated ? await getAccessToken() : null));
  }, [authenticated, getAccessToken]);
  const value = useMemo<AuthState>(
    () => ({
      ready,
      authenticated,
      login: () => login(),
      logout,
      email: user?.email?.address ?? user?.google?.email ?? null,
      wallet: user?.wallet?.address ?? null,
      mode: 'privy',
    }),
    [ready, authenticated, login, logout, user],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ---------------- Dev fallback (no Privy configured) ---------------- */
function DevBridge({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('root.devToken'));
  useMemo(() => {
    setTokenGetter(async () => token);
  }, [token]);
  const login = useCallback(() => {
    const name = window.prompt('Dev sign-in — pick a username', 'guest') || 'guest';
    const t = `dev:${name.replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'guest'}`;
    localStorage.setItem('root.devToken', t);
    setToken(t);
  }, []);
  const logout = useCallback(async () => {
    localStorage.removeItem('root.devToken');
    setToken(null);
  }, []);
  const value = useMemo<AuthState>(
    () => ({ ready: true, authenticated: Boolean(token), login, logout, email: token ? `${token.slice(4)}@dev.local` : null, wallet: null, mode: 'dev' }),
    [token, login, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (PRIVY_APP_ID) {
    return (
      <PrivyProvider
        appId={PRIVY_APP_ID}
        config={{
          loginMethods: ['email', 'google', 'wallet'],
          appearance: {
            theme: 'light',
            accentColor: '#0a0a0a',
            logo: `${window.location.origin}/icons/logo-black.png`,
            landingHeader: 'Sign in to Root Network',
            loginMessage: 'Put your idle internet to work.',
            walletChainType: 'ethereum-only',
          },
          embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
          legal: { termsAndConditionsUrl: 'https://read.rootnetwork.co/data/acceptable-use', privacyPolicyUrl: 'https://read.rootnetwork.co/data/privacy-and-security' },
        }}
      >
        <PrivyBridge>{children}</PrivyBridge>
      </PrivyProvider>
    );
  }
  return <DevBridge>{children}</DevBridge>;
}
