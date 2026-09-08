import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Me, type Network } from './api';
import { useAuth } from './auth';

/** Poll a fetcher on an interval; pauses when the tab is hidden. */
export function usePoll<T>(fetcher: () => Promise<T>, intervalMs: number, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number>(0);
  const alive = useRef(true);

  const run = useCallback(async () => {
    try {
      const d = await fetcher();
      if (alive.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    }
  }, [fetcher]);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === 'visible') run();
      timer.current = window.setTimeout(tick, intervalMs);
    };
    run();
    timer.current = window.setTimeout(tick, intervalMs);
    const onVis = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [run, intervalMs, enabled]);

  return { data, error, refresh: run, setData };
}

export function useNetwork(intervalMs = 5000) {
  return usePoll<Network>(api.network, intervalMs);
}

export function useMe(intervalMs = 6000) {
  const { authenticated } = useAuth();
  return usePoll<Me>(api.me, intervalMs, authenticated);
}

/** Smoothly animate a number toward its target (for live counters). */
export function useSmooth(target: number, speed = 0.18) {
  const [v, setV] = useState(target);
  const ref = useRef(target);
  useEffect(() => {
    let raf = 0;
    const step = () => {
      const cur = ref.current;
      const next = cur + (target - cur) * speed;
      ref.current = Math.abs(target - next) < Math.abs(target) * 1e-5 + 1e-6 ? target : next;
      setV(ref.current);
      if (ref.current !== target) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, speed]);
  return v;
}

/** Local mirror of a server value that updates optimistically and debounces writes. */
export function useDebouncedSetting<T>(server: T | undefined, write: (v: T) => Promise<unknown>, delay = 350) {
  const [local, setLocal] = useState<T | undefined>(server);
  const dirty = useRef(false);
  const t = useRef<number>(0);
  useEffect(() => {
    if (!dirty.current) setLocal(server);
  }, [server]);
  const set = useCallback(
    (v: T) => {
      dirty.current = true;
      setLocal(v);
      clearTimeout(t.current);
      t.current = window.setTimeout(async () => {
        try {
          await write(v);
        } finally {
          dirty.current = false;
        }
      }, delay);
    },
    [write, delay],
  );
  return [local, set] as const;
}

/** Extension presence + pairing bridge (content script on this origin). */
export type ExtState = { present: boolean; paired: boolean; version: string | null; deviceId: string | null };
export function useExtension() {
  const [st, setSt] = useState<ExtState>({ present: false, paired: false, version: null, deviceId: null });
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const m = ev.data;
      if (ev.source !== window || !m || m.source !== 'root-extension') return;
      if (m.type === 'ROOT_EXT_PRESENT') setSt({ present: true, paired: Boolean(m.paired), version: m.version || null, deviceId: m.deviceId || null });
    };
    window.addEventListener('message', onMsg);
    const ping = () => window.postMessage({ source: 'root-dashboard', type: 'ROOT_EXT_PING' }, window.location.origin);
    ping();
    const id = window.setInterval(ping, 4000);
    return () => {
      window.removeEventListener('message', onMsg);
      clearInterval(id);
    };
  }, []);
  const pair = useCallback(
    (code: string) =>
      new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const onMsg = (ev: MessageEvent) => {
          const m = ev.data;
          if (ev.source !== window || !m || m.source !== 'root-extension' || m.type !== 'ROOT_PAIR_RESULT') return;
          window.removeEventListener('message', onMsg);
          if (m.ok) setSt((s) => ({ ...s, present: true, paired: true, deviceId: m.deviceId || s.deviceId }));
          resolve({ ok: Boolean(m.ok), error: m.error || undefined });
        };
        window.addEventListener('message', onMsg);
        window.postMessage({ source: 'root-dashboard', type: 'ROOT_PAIR', code }, window.location.origin);
        setTimeout(() => {
          window.removeEventListener('message', onMsg);
          resolve({ ok: false, error: 'No response from the extension' });
        }, 8000);
      }),
    [],
  );
  return { ...st, pair };
}
