// Root Network node — background service worker.
// Pairs with the dashboard, measures capacity, heartbeats to the router.

const DEFAULT_API = 'https://earn.rootnetwork.co';
const HEARTBEAT_ALARM = 'root-heartbeat';
const PROBE_ALARM = 'root-probe';
const VERSION = chrome.runtime.getManifest().version;

const store = {
  async get() {
    const s = await chrome.storage.local.get(null);
    return {
      apiBase: s.apiBase || DEFAULT_API,
      deviceToken: s.deviceToken || null,
      deviceId: s.deviceId || null,
      deviceName: s.deviceName || null,
      allocation: Number.isFinite(s.allocation) ? s.allocation : null,
      paused: Boolean(s.paused),
      capacityMbps: Number.isFinite(s.capacityMbps) ? s.capacityMbps : null,
      lastProbeAt: s.lastProbeAt || 0,
      status: s.status || null, // last heartbeat payload
      lastError: s.lastError || null,
      history: Array.isArray(s.history) ? s.history : [], // recent mbps samples for the popup sparkline
    };
  },
  async set(patch) {
    await chrome.storage.local.set(patch);
  },
};

async function api(path, { method = 'GET', body, token } = {}) {
  const st = await store.get();
  const headers = { 'Content-Type': 'application/json' };
  const t = token || st.deviceToken;
  if (t) headers['X-Device-Token'] = t;
  const res = await fetch(`${st.apiBase}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** Download a 2 MB probe and estimate capacity in Mbps (capped). */
async function probeCapacity() {
  const st = await store.get();
  try {
    const t0 = performance.now();
    const res = await fetch(`${st.apiBase}/api/ext/probe?x=${Date.now()}`, { cache: 'no-store' });
    const buf = await res.arrayBuffer();
    const secs = Math.max(0.05, (performance.now() - t0) / 1000);
    const mbps = Math.min(1000, Math.max(3, (buf.byteLength * 8) / 1e6 / secs));
    // Smooth against previous measurements.
    const prev = st.capacityMbps;
    const smoothed = prev ? prev * 0.6 + mbps * 0.4 : mbps;
    await store.set({ capacityMbps: Math.round(smoothed * 10) / 10, lastProbeAt: Date.now() });
    return smoothed;
  } catch (e) {
    return st.capacityMbps;
  }
}

async function heartbeat() {
  const st = await store.get();
  if (!st.deviceToken) {
    await setBadge('off');
    return { ok: false, error: 'not paired' };
  }
  try {
    if (!st.capacityMbps || Date.now() - st.lastProbeAt > 6 * 3600_000) await probeCapacity();
    const fresh = await store.get();
    const status = await api('/api/ext/heartbeat', {
      method: 'POST',
      body: { capacityMbps: fresh.capacityMbps, allocation: fresh.allocation, paused: fresh.paused, version: VERSION },
    });
    const history = [...fresh.history, { t: Date.now(), mbps: status.mbps || 0 }].slice(-40);
    await store.set({ status, lastError: null, history, allocation: status.allocation, paused: status.paused });
    await setBadge(status.paused ? 'paused' : 'on');
    return { ok: true, status };
  } catch (e) {
    const msg = String(e?.message || e);
    await store.set({ lastError: msg });
    if (/unknown device/i.test(msg)) {
      await store.set({ deviceToken: null, deviceId: null, status: null });
      await setBadge('off');
    } else {
      await setBadge('error');
    }
    return { ok: false, error: msg };
  }
}

async function setBadge(state) {
  const map = {
    on: { text: '', color: '#0a0a0a' },
    paused: { text: 'II', color: '#8a8a8a' },
    off: { text: '', color: '#8a8a8a' },
    error: { text: '!', color: '#c0392b' },
  };
  const b = map[state] || map.off;
  try {
    await chrome.action.setBadgeText({ text: b.text });
    await chrome.action.setBadgeBackgroundColor({ color: b.color });
    await chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
  } catch {}
}

async function pair(code, apiBase) {
  if (apiBase) await store.set({ apiBase });
  const res = await api('/api/ext/pair', {
    method: 'POST',
    body: { code, userAgent: navigator.userAgent, version: VERSION },
    token: '',
  });
  await store.set({ deviceToken: res.deviceToken, deviceId: res.deviceId, deviceName: res.name, allocation: res.allocation, paused: false, status: null, lastError: null });
  await ensureAlarms();
  // Answer the dashboard right away; measure + first heartbeat in the background.
  (async () => {
    await probeCapacity();
    await heartbeat();
  })().catch(() => {});
  return { ok: true, deviceId: res.deviceId };
}

async function unpair() {
  try {
    await api('/api/ext/unpair', { method: 'POST' });
  } catch {}
  await store.set({ deviceToken: null, deviceId: null, deviceName: null, status: null, history: [], lastError: null });
  await setBadge('off');
}

async function ensureAlarms() {
  const hb = await chrome.alarms.get(HEARTBEAT_ALARM);
  if (!hb) chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 0.5 });
  const pr = await chrome.alarms.get(PROBE_ALARM);
  if (!pr) chrome.alarms.create(PROBE_ALARM, { periodInMinutes: 360 });
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureAlarms();
  await heartbeat();
});
chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarms();
  await heartbeat();
});
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) await heartbeat();
  if (alarm.name === PROBE_ALARM) await probeCapacity();
});

// Messages from the popup and the content script.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case 'get-state':
        return store.get();
      case 'pair':
        return pair(String(msg.code || ''), msg.apiBase);
      case 'unpair':
        await unpair();
        return { ok: true };
      case 'heartbeat':
        return heartbeat();
      case 'set-allocation': {
        const a = Math.max(5, Math.min(100, Math.round(Number(msg.allocation))));
        await store.set({ allocation: a });
        return heartbeat();
      }
      case 'set-paused':
        await store.set({ paused: Boolean(msg.paused) });
        return heartbeat();
      case 'probe':
        return { capacityMbps: await probeCapacity() };
      default:
        return { error: 'unknown message' };
    }
  })()
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
  return true;
});

// While the popup is open it keeps a port; heartbeat faster so the UI feels live.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'popup') return;
  const id = setInterval(heartbeat, 10_000);
  heartbeat();
  port.onDisconnect.addListener(() => clearInterval(id));
});
