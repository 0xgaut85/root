const $ = (s) => document.querySelector(s);
const send = (msg) => chrome.runtime.sendMessage(msg);

const fmtUsd = (n) => {
  n = Number(n) || 0;
  return `$${n.toFixed(n > 0 && n < 1 ? 4 : 2)}`;
};
const fmtBytes = (b) => {
  b = Number(b) || 0;
  if (b >= 1e12) return `${(b / 1e12).toFixed(2)} TB`;
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`;
  return `${(b / 1e3).toFixed(0)} KB`;
};

let shownMbps = 0;
let targetMbps = 0;
let raf = 0;

function animateNumber() {
  cancelAnimationFrame(raf);
  const step = () => {
    shownMbps += (targetMbps - shownMbps) * 0.12;
    $('#mbps').textContent = shownMbps.toFixed(shownMbps >= 10 ? 1 : 2);
    if (Math.abs(targetMbps - shownMbps) > 0.005) raf = requestAnimationFrame(step);
    else $('#mbps').textContent = targetMbps.toFixed(targetMbps >= 10 ? 1 : 2);
  };
  raf = requestAnimationFrame(step);
}

function drawSpark(history) {
  const c = $('#spark');
  const ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = c.clientWidth || 272;
  const H = 44;
  c.width = W * dpr;
  c.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  const pts = history.slice(-40).map((h) => h.mbps || 0);
  if (pts.length < 2) return;
  const max = Math.max(0.5, ...pts) * 1.15;
  const x = (i) => (i / (pts.length - 1)) * W;
  const y = (v) => H - 3 - (v / max) * (H - 8);

  ctx.beginPath();
  pts.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(10,10,10,0.14)');
  g.addColorStop(1, 'rgba(10,10,10,0)');
  ctx.fillStyle = g;
  ctx.fill();

  ctx.beginPath();
  pts.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
  ctx.strokeStyle = '#0a0a0a';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  const lx = x(pts.length - 1);
  const ly = y(pts[pts.length - 1]);
  ctx.beginPath();
  ctx.arc(lx, ly, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0a0a';
  ctx.fill();
}

function setPill(state, text) {
  const p = $('#pill');
  p.className = `pill ${state}`;
  $('#pillText').textContent = text;
}

function render(st) {
  const paired = Boolean(st.deviceToken);
  $('#pairView').hidden = paired;
  $('#nodeView').hidden = !paired;
  const dash = st.apiBase && !/earn\.rootnetwork\.co/.test(st.apiBase) ? st.apiBase : 'https://earn.rootnetwork.co';
  $('#openDash').href = `${dash}/extension`;
  $('#openDash2').href = dash;

  if (!paired) {
    setPill('', 'Not paired');
    return;
  }
  const s = st.status;
  if (st.lastError && !s) setPill('err', 'Offline');
  else if (s?.paused) setPill('paused', 'Paused');
  else setPill('on', 'Connected');

  targetMbps = s?.paused ? 0 : s?.mbps || 0;
  animateNumber();
  $('#heroSub').textContent = s?.paused
    ? 'Paused. Nothing is being relayed.'
    : targetMbps > 0.3
      ? 'Relaying verified traffic for AI research'
      : 'Standing by. Deliveries arrive in bursts.';
  drawSpark(st.history || []);

  $('#todayUsd').textContent = fmtUsd(s?.todayUsd);
  $('#todayGb').textContent = fmtBytes(s?.todayBytes);
  $('#balance').textContent = fmtUsd(s?.balanceUsd);

  const alloc = s?.allocation ?? st.allocation ?? 25;
  const slider = $('#alloc');
  if (!slider.matches(':active')) {
    slider.value = alloc;
    slider.style.setProperty('--p', `${alloc}%`);
    $('#allocVal').textContent = alloc;
  }
  $('#cap').textContent = st.capacityMbps ? Math.round(st.capacityMbps) : '–';

  const on = !(s?.paused ?? st.paused);
  $('#pause').checked = on;
  $('#pauseHint').textContent = on ? 'Your node is available to the network' : 'Paused. Resume any time.';

  const n = s?.network;
  const tp = n ? (n.throughputMbps >= 1000 ? `${(n.throughputMbps / 1000).toFixed(2)} Gbps` : `${Math.round(n.throughputMbps)} Mbps`) : '';
  $('#net').textContent = n ? `${n.activeNodes.toLocaleString()} nodes online · ${tp} network` : '';
}

async function refresh() {
  render(await send({ type: 'get-state' }));
}

// Pairing
$('#pairCode').addEventListener('input', (e) => {
  let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (v.length > 3) v = `${v.slice(0, 3)}-${v.slice(3)}`;
  e.target.value = v;
});
$('#pairForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#pairErr').hidden = true;
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'Pairing…';
  const res = await send({ type: 'pair', code: $('#pairCode').value });
  btn.disabled = false;
  btn.textContent = 'Pair';
  if (!res?.ok) {
    $('#pairErr').textContent = res?.error || 'Could not pair';
    $('#pairErr').hidden = false;
    return;
  }
  await refresh();
});

// Controls
let allocTimer = 0;
$('#alloc').addEventListener('input', (e) => {
  const v = Number(e.target.value);
  e.target.style.setProperty('--p', `${v}%`);
  $('#allocVal').textContent = v;
  clearTimeout(allocTimer);
  allocTimer = setTimeout(async () => {
    await send({ type: 'set-allocation', allocation: v });
    refresh();
  }, 250);
});
$('#pause').addEventListener('change', async (e) => {
  await send({ type: 'set-paused', paused: !e.target.checked });
  refresh();
});
$('#unpair').addEventListener('click', async () => {
  if (!confirm('Unpair this browser from your Root account?')) return;
  await send({ type: 'unpair' });
  refresh();
});

// Keep the background alive and heartbeating quickly while open.
const port = chrome.runtime.connect({ name: 'popup' });
chrome.storage.onChanged.addListener(() => refresh());
refresh();
