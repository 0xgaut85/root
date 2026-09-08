// Bridge between the Root dashboard (earn.rootnetwork.co) and the extension.
// The page and this script share `window`, so they talk with postMessage.
(() => {
  const VERSION = chrome.runtime.getManifest().version;

  const announce = (extra = {}) => {
    window.postMessage({ source: 'root-extension', type: 'ROOT_EXT_PRESENT', version: VERSION, ...extra }, window.location.origin);
  };

  const withStatus = async () => {
    try {
      const st = await chrome.runtime.sendMessage({ type: 'get-state' });
      announce({ paired: Boolean(st?.deviceToken), deviceId: st?.deviceId || null, apiBase: st?.apiBase || null });
    } catch {
      announce({ paired: false });
    }
  };

  window.addEventListener('message', async (ev) => {
    if (ev.source !== window || ev.origin !== window.location.origin) return;
    const msg = ev.data;
    if (!msg || msg.source !== 'root-dashboard') return;

    if (msg.type === 'ROOT_EXT_PING') return withStatus();

    if (msg.type === 'ROOT_PAIR' && typeof msg.code === 'string') {
      try {
        const res = await chrome.runtime.sendMessage({ type: 'pair', code: msg.code, apiBase: window.location.origin });
        window.postMessage({ source: 'root-extension', type: 'ROOT_PAIR_RESULT', ok: Boolean(res?.ok), error: res?.error || null, deviceId: res?.deviceId || null }, window.location.origin);
      } catch (e) {
        window.postMessage({ source: 'root-extension', type: 'ROOT_PAIR_RESULT', ok: false, error: String(e?.message || e) }, window.location.origin);
      }
    }
  });

  // Announce as soon as the DOM exists so the dashboard can render "extension detected".
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => withStatus(), { once: true });
  else withStatus();
})();
