import { useEffect, useMemo, useRef, useState } from 'react';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import land110 from 'world-atlas/land-110m.json';
import { CITIES } from '../lib/cities';
import type { Continent, NetworkContinent, NetworkRegion } from '../lib/api';

/* ------------------------------------------------------------------ */
/* Deterministic helpers                                               */
/* ------------------------------------------------------------------ */
function hash(a: number, b = 0) {
  let x = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x27d4eb2f, 0xc2b2ae35);
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12;
  x = Math.imul(x, 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}
/** Roughly normal in [-1, 1]. */
const bell = (a: number, b: number) => (hash(a, b) + hash(a, b + 101) + hash(a, b + 202)) / 1.5 - 1;

const LAT_TOP = 78;
const LAT_BOTTOM = -57;

export type MapNode = {
  i: number;
  id: string;
  lon: number;
  lat: number;
  code: string;
  country: string;
  continent: Continent;
  city: string;
  online: boolean;
  mbps: number;
};

/** Build the node list from region counts. Stable for a given (regions, bucket). */
function buildNodes(regions: NetworkRegion[], activeNodes: number, bucket: number): MapNode[] {
  const nodes: MapNode[] = [];
  let i = 0;
  for (const r of regions) {
    const cities = CITIES[r.code];
    if (!cities) continue;
    const total = cities.reduce((a, c) => a + c[3], 0);
    for (let j = 0; j < r.nodes; j++, i++) {
      // Stable per (country, j): the j-th node of a country always lands in the same place.
      const seed = (r.code.charCodeAt(0) * 31 + r.code.charCodeAt(1)) * 4099 + j;
      let pick = hash(seed, 1) * total;
      let c = cities[cities.length - 1];
      for (const city of cities) {
        pick -= city[3];
        if (pick <= 0) {
          c = city;
          break;
        }
      }
      const spread = 0.22 + Math.min(1.2, c[3] * 0.09); // bigger metros sprawl further
      const lat = c[1] + bell(seed, 2) * spread;
      const lon = c[2] + (bell(seed, 3) * spread) / Math.max(0.35, Math.cos((lat * Math.PI) / 180));
      const id = `node_${Math.floor(hash(seed, 4) * 0xffff)
        .toString(16)
        .padStart(4, '0')}`;
      nodes.push({ i, id, lon, lat, code: r.code, country: r.name, continent: r.continent, city: c[0], online: false, mbps: 0 });
    }
  }

  // Exactly `activeNodes` are online. Score = stable per-node randomness per 5-minute bucket,
  // nudged by local time of day so evenings light up region by region.
  const scored = nodes.map((n) => {
    const localHour = (((bucket * 5) / 60 + n.lon / 15) % 24 + 24) % 24;
    const evening = Math.exp(-Math.pow((localHour - 20.5) / 4.5, 2)); // peak ~20:30 local
    const night = Math.exp(-Math.pow((localHour - 4) / 2.5, 2)); // trough ~04:00
    return { n, s: hash(n.i, bucket) * 0.62 + evening * 0.38 - night * 0.25 };
  });
  scored.sort((a, b) => b.s - a.s);
  const k = Math.min(nodes.length, Math.max(0, activeNodes));
  for (let x = 0; x < scored.length; x++) {
    const n = scored[x].n;
    n.online = x < k;
    n.mbps = n.online ? 0.15 + Math.pow(hash(n.i, bucket + 7), 2.2) * 3.6 : 0;
  }
  return nodes;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
type Props = {
  regions: NetworkRegion[];
  continents: NetworkContinent[];
  activeNodes: number;
  nodes: number;
};

export function NodeMap({ regions, continents, activeNodes, nodes: nodeCount }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<{ node: MapNode; x: number; y: number } | null>(null);
  const [focus, setFocus] = useState<Continent | null>(null);
  const [filter, setFilter] = useState<Continent | null>(null);

  const bucket = Math.floor(Date.now() / 300_000);
  const mapNodes = useMemo(() => buildNodes(regions, activeNodes, bucket), [regions, activeNodes, bucket]);

  const land = useMemo(() => {
    const topo = land110 as unknown as Topology<{ land: GeometryCollection }>;
    return feature(topo, topo.objects.land);
  }, []);

  // Resize observer.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      // Never render narrower than 640px: on phones the wrap scrolls horizontally instead of shrinking the dots.
      const w = Math.max(640, Math.floor(e.contentRect.width));
      setSize({ w, h: Math.round((w * (LAT_TOP - LAT_BOTTOM)) / 360) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const projection = useMemo(() => {
    if (!size.w) return null;
    const s = size.w / (2 * Math.PI);
    const p = geoEquirectangular().scale(s).translate([size.w / 2, 0]);
    // Shift so that LAT_TOP sits at y = 0.
    const yTop = p([0, LAT_TOP])![1];
    return p.translate([size.w / 2, -yTop]);
  }, [size.w]);

  // Land dot-matrix, cached as an offscreen canvas.
  const landLayer = useMemo(() => {
    if (!projection || !size.w) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const mask = document.createElement('canvas');
    mask.width = size.w;
    mask.height = size.h;
    const mctx = mask.getContext('2d')!;
    mctx.fillStyle = '#fff';
    geoPath(projection, mctx)(land as never);
    mctx.fill();
    const px = mctx.getImageData(0, 0, size.w, size.h).data;

    const layer = document.createElement('canvas');
    layer.width = size.w * dpr;
    layer.height = size.h * dpr;
    const ctx = layer.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const step = Math.max(3.2, size.w / 230);
    const r = step * 0.27;
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    for (let y = step / 2; y < size.h; y += step) {
      for (let x = step / 2; x < size.w; x += step) {
        const idx = ((y | 0) * size.w + (x | 0)) * 4 + 3;
        if (px[idx] > 100) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    return layer;
  }, [projection, size.w, size.h, land]);

  // Project nodes once per layout.
  const projected = useMemo(() => {
    if (!projection) return [];
    return mapNodes.map((n) => {
      const p = projection([n.lon, n.lat])!;
      return { n, x: p[0], y: p[1] };
    });
  }, [mapNodes, projection]);

  // Draw loop: static dots (no pulses), hover ring only.
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const focusRef = useRef<Continent | null>(null);
  focusRef.current = filter ?? focus;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !landLayer || !size.w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;

    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(landLayer, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const f = focusRef.current;
      const rDot = Math.max(1.6, size.w / 520);
      // Offline first (underneath), then online.
      for (const pass of [false, true]) {
        for (const p of projected) {
          if (p.n.online !== pass) continue;
          const dim = f && p.n.continent !== f;
          ctx.globalAlpha = dim ? 0.12 : pass ? 0.95 : 0.6;
          ctx.fillStyle = pass ? '#22c55e' : '#e5484d';
          ctx.beginPath();
          ctx.arc(p.x, p.y, pass ? rDot : rDot * 0.85, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      const h = hoverRef.current;
      if (h) {
        const p = projection!([h.node.lon, h.node.lat])!;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p[0], p[1], rDot + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [landLayer, projected, projection, size.w, size.h]);

  const onMove = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best: (typeof projected)[number] | null = null;
    let bd = 12 * 12;
    for (const p of projected) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    setHover(best ? { node: best.n, x: best.x, y: best.y } : null);
  };

  const onlineCount = mapNodes.filter((n) => n.online).length;
  const byContinent = (c: Continent) => {
    const list = mapNodes.filter((n) => n.continent === c);
    return { total: list.length, online: list.filter((n) => n.online).length };
  };

  return (
    <div className="map">
      <div className="map__legend">
        {continents.map((c) => {
          const s = byContinent(c.id);
          const active = (filter ?? focus) === c.id;
          return (
            <button
              key={c.id}
              className={`map__leg ${active ? 'on' : ''} ${filter && filter !== c.id ? 'dim' : ''}`}
              onPointerEnter={() => setFocus(c.id)}
              onPointerLeave={() => setFocus(null)}
              onClick={() => setFilter((f) => (f === c.id ? null : c.id))}
            >
              <span className="map__leg-name">
                {c.name} <em>{Math.round(c.share * 100)}%</em>
              </span>
              <span className="map__leg-v">
                <i style={{ background: '#22c55e' }} /> {s.online.toLocaleString()} <i style={{ background: '#e5484d' }} /> {(s.total - s.online).toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
      <div ref={wrapRef} className="map__wrap" style={{ height: size.h || 240 }}>
        <div className="map__inner" style={{ width: size.w || '100%', height: size.h || 240 }}>
        <canvas
          ref={canvasRef}
          className="map__canvas"
          style={{ width: size.w, height: size.h }}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onPointerDown={onMove}
        />
        {hover && (
          <div className="map__tip" style={{ left: Math.min(size.w - 190, Math.max(0, hover.x - 90)), top: hover.y < 80 ? hover.y + 16 : hover.y - 84 }}>
            <div className="map__tip-h">
              <i style={{ background: hover.node.online ? '#22c55e' : '#e5484d' }} />
              <span className="mono">{hover.node.id}</span>
              <span className="map__tip-st">{hover.node.online ? 'Online' : 'Offline'}</span>
            </div>
            <div className="map__tip-b">
              {hover.node.city}, {hover.node.country}
            </div>
            <div className="map__tip-b">{hover.node.online ? `${hover.node.mbps.toFixed(2)} Mbps · relaying` : 'Last seen today'}</div>
          </div>
        )}
        </div>
      </div>
      <div className="map__foot">
        <span>
          <i style={{ background: '#22c55e' }} /> {onlineCount.toLocaleString()} online
        </span>
        <span>
          <i style={{ background: '#e5484d' }} /> {(nodeCount - onlineCount).toLocaleString()} offline
        </span>
        <span className="map__foot-r">One dot per node · placed by metro area · updates every 5 min</span>
      </div>
    </div>
  );
}