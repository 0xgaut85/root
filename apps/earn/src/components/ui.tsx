import { AnimatePresence, motion } from 'framer-motion';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/* ---------------- Card ---------------- */
export function Card({ children, className = '', dark = false, tight = false, flush = false, style }: { children: ReactNode; className?: string; dark?: boolean; tight?: boolean; flush?: boolean; style?: React.CSSProperties }) {
  return (
    <div className={`card ${dark ? 'card--dark' : ''} ${tight ? 'card--tight' : ''} ${flush ? 'card--flush' : ''} ${className}`} style={style}>
      {children}
    </div>
  );
}

export function CardHead({ title, hint, right }: { title: string; hint?: string; right?: ReactNode }) {
  return (
    <div className="card__head">
      <div>
        <h3 className="card__title">{title}</h3>
        {hint && <p className="card__hint">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

/* ---------------- Stat ---------------- */
export function Stat({ label, value, unit, delta, deltaLabel, loading }: { label: string; value: string; unit?: string; delta?: number | null; deltaLabel?: string; loading?: boolean }) {
  return (
    <Card className="stat" tight>
      <div className="eyebrow">{label}</div>
      <div className={`stat__v ${loading ? 'sk' : ''}`}>
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {(delta !== undefined || deltaLabel) && (
        <div className="stat__d">
          {delta !== undefined && delta !== null && <Delta v={delta} />}
          {deltaLabel && <span>{deltaLabel}</span>}
        </div>
      )}
    </Card>
  );
}

export function Delta({ v, fmt }: { v: number; fmt?: (n: number) => string }) {
  const cls = v > 0 ? '' : v < 0 ? 'neg' : 'flat';
  const f = fmt ?? ((n: number) => Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 }));
  return (
    <span className={`delta ${cls}`}>
      {v > 0 ? '↑' : v < 0 ? '↓' : '·'} {f(v)}
    </span>
  );
}

/* ---------------- Pill ---------------- */
export function Pill({ state, children }: { state: 'on' | 'off' | 'paused' | 'err'; children: ReactNode }) {
  return (
    <span className={`pill ${state}`}>
      <i />
      {children}
    </span>
  );
}

/* ---------------- Toggle ---------------- */
export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} className={`toggle ${on ? 'on' : ''}`} disabled={disabled} onClick={() => onChange(!on)} />;
}

/* ---------------- Slider ---------------- */
export function Slider({ value, onChange, min = 5, max = 100, step = 5, label, unit = '%', marks }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label?: string; unit?: string; marks?: string[] }) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider">
      <div className="slider__top">
        <span className="eyebrow">{label}</span>
        <span className="slider__val">
          {value}
          <small>{unit}</small>
        </span>
      </div>
      <input className="range" type="range" min={min} max={max} step={step} value={value} style={{ ['--p' as string]: `${p}%` }} onChange={(e) => onChange(Number(e.target.value))} />
      {marks && (
        <div className="slider__marks">
          {marks.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Segmented ---------------- */
export function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={String(o.v)} type="button" className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.v === value && <motion.span layoutId="seg-pill" className="seg__pill" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Sheet (bottom sheet / modal) ---------------- */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  const desktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 720px)').matches;
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="sheet__bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} />
          <motion.div
            className="sheet"
            role="dialog"
            aria-modal="true"
            initial={desktop ? { opacity: 0, scale: 0.96, x: '-50%', y: '-48%' } : { y: '100%', x: '-50%' }}
            animate={desktop ? { opacity: 1, scale: 1, x: '-50%', y: '-50%' } : { y: 0, x: '-50%' }}
            exit={desktop ? { opacity: 0, scale: 0.98, x: '-50%', y: '-48%' } : { y: '100%', x: '-50%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <div className="sheet__grab" />
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ---------------- Toasts ---------------- */
type Toast = { id: number; text: string; kind?: 'ok' | 'err' };
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'err') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const id = useRef(0);
  const push = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    const t = { id: ++id.current, text, kind };
    setItems((s) => [...s, t]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), 2600);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} className={`toast ${t.kind === 'err' ? 'err' : ''}`} initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
              {t.kind === 'err' ? <Icon name="alert" /> : <Icon name="check" />}
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------- Icons ---------------- */
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'home':
      return (
        <svg {...p}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case 'data':
      return (
        <svg {...p}>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M8 15v-4M12 15V8M16 15v-6" />
        </svg>
      );
    case 'puzzle':
      return (
        <svg {...p}>
          <path d="M9 4.5a2 2 0 1 1 4 0V6h3a2 2 0 0 1 2 2v3h-1.5a2 2 0 1 0 0 4H18v3a2 2 0 0 1-2 2h-3v-1.5a2 2 0 1 0-4 0V20H6a2 2 0 0 1-2-2v-3h1.5a2 2 0 1 0 0-4H4V8a2 2 0 0 1 2-2h3V4.5Z" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
      );
    case 'download':
      return (
        <svg {...p}>
          <path d="M12 4v11" />
          <path d="m7 10 5 5 5-5" />
          <path d="M4 19h16" />
        </svg>
      );
    case 'check':
      return (
        <svg {...p}>
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      );
    case 'alert':
      return (
        <svg {...p}>
          <path d="M12 8v5" />
          <path d="M12 16.5h.01" />
          <path d="M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
      );
    case 'chev':
      return (
        <svg {...p}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case 'laptop':
      return (
        <svg {...p}>
          <rect x="4" y="5" width="16" height="11" rx="2" />
          <path d="M2 19h20" />
        </svg>
      );
    case 'copy':
      return (
        <svg {...p}>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V6a2 2 0 0 1 2-2h9" />
        </svg>
      );
    case 'out':
      return (
        <svg {...p}>
          <path d="M14 4h6v6" />
          <path d="M20 4 10 14" />
          <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
        </svg>
      );
    case 'wallet':
      return (
        <svg {...p}>
          <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
          <rect x="3" y="8" width="18" height="11" rx="2" />
          <path d="M16 13.5h.01" />
        </svg>
      );
    case 'logout':
      return (
        <svg {...p}>
          <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
          <path d="m15 8 5 4-5 4" />
          <path d="M20 12H10" />
        </svg>
      );
    case 'x':
      return (
        <svg {...p}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      );
    case 'bolt':
      return (
        <svg {...p}>
          <path d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z" />
        </svg>
      );
    default:
      return null;
  }
}

/* ---------------- Charts (SVG) ---------------- */
export function AreaChart({
  points,
  height = 160,
  color = '#0a0a0a',
  fill = true,
  stroke = 1.6,
  yFmt,
  xFmt,
  grid = 3,
  padTop = 12,
  showAxis = true,
  smooth = true,
  fromZero = false,
}: {
  points: { t: number; v: number }[];
  height?: number;
  color?: string;
  fill?: boolean;
  stroke?: number;
  yFmt?: (v: number) => string;
  xFmt?: (t: number) => string;
  grid?: number;
  padTop?: number;
  showAxis?: boolean;
  smooth?: boolean;
  fromZero?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const id = useMemo(() => `g${Math.random().toString(36).slice(2, 8)}`, []);
  if (points.length < 2) return <div ref={ref} style={{ height }} className="sk" />;

  const padL = showAxis ? 44 : 0;
  const padB = showAxis ? 22 : 0;
  const W = w;
  const H = height;
  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.v);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const yMin = fromZero ? 0 : Math.min(...ys);
  const yMax = Math.max(...ys);
  const span = yMax - yMin || 1;
  const yLo = fromZero ? 0 : yMin - span * 0.08;
  const yHi = yMax + span * 0.12;
  const X = (t: number) => padL + ((t - x0) / (x1 - x0 || 1)) * (W - padL - 4);
  const Y = (v: number) => padTop + (1 - (v - yLo) / (yHi - yLo || 1)) * (H - padTop - padB);

  let d = '';
  if (smooth) {
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (i === 0) d += `M${X(p.t)},${Y(p.v)}`;
      else {
        const prev = points[i - 1];
        const cx = (X(prev.t) + X(p.t)) / 2;
        d += ` C${cx},${Y(prev.v)} ${cx},${Y(p.v)} ${X(p.t)},${Y(p.v)}`;
      }
    }
  } else {
    d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.t)},${Y(p.v)}`).join(' ');
  }
  const area = `${d} L${X(x1)},${H - padB} L${X(x0)},${H - padB} Z`;

  const gridLines = Array.from({ length: grid }, (_, i) => yLo + ((yHi - yLo) * (i + 1)) / (grid + 1));
  const hi = hover !== null ? points[hover] : null;

  const onMove = (e: React.MouseEvent | React.TouchEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const cx = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const px = cx - rect.left;
    let best = 0;
    let bd = Infinity;
    points.forEach((p, i) => {
      const dd = Math.abs(X(p.t) - px);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    setHover(best);
  };

  return (
    <div ref={ref} style={{ position: 'relative', height, width: '100%' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchMove={onMove} onTouchEnd={() => setHover(null)}>
      <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.16" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {showAxis &&
          gridLines.map((g, i) => (
            <g key={i}>
              <line x1={padL} x2={W} y1={Y(g)} y2={Y(g)} stroke="rgba(10,10,10,0.06)" />
              <text x={0} y={Y(g) + 3.5} fontSize="10" fontFamily="DM Mono, monospace" fill="#8c8c8c">
                {yFmt ? yFmt(g) : Math.round(g).toLocaleString()}
              </text>
            </g>
          ))}
        {fill && <motion.path d={area} fill={`url(#${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} />}
        <motion.path d={d} fill="none" stroke={color} strokeWidth={stroke} strokeLinejoin="round" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} />
        {showAxis && xFmt && (
          <>
            <text x={padL} y={H - 6} fontSize="10" fontFamily="DM Mono, monospace" fill="#8c8c8c">
              {xFmt(x0)}
            </text>
            <text x={W - 4} y={H - 6} fontSize="10" fontFamily="DM Mono, monospace" fill="#8c8c8c" textAnchor="end">
              {xFmt(x1)}
            </text>
          </>
        )}
        {hi && (
          <g>
            <line x1={X(hi.t)} x2={X(hi.t)} y1={padTop} y2={H - padB} stroke="rgba(10,10,10,0.18)" strokeDasharray="2 3" />
            <circle cx={X(hi.t)} cy={Y(hi.v)} r="4.5" fill="#fff" stroke={color} strokeWidth="2" />
          </g>
        )}
        {!hi && (
          <g>
            <circle cx={X(x1)} cy={Y(ys[ys.length - 1])} r="4" fill={color}>
              <animate attributeName="r" values="4;5.5;4" dur="2s" repeatCount="indefinite" />
            </circle>
          </g>
        )}
      </svg>
      {hi && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(Math.max(X(hi.t) - 60, 0), W - 124),
            top: 0,
            background: '#0a0a0a',
            color: '#fff',
            borderRadius: 10,
            padding: '6px 10px',
            fontSize: 12,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: 'var(--shadow-pop)',
          }}
        >
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, opacity: 0.6, letterSpacing: '0.08em' }}>{xFmt ? xFmt(hi.t) : new Date(hi.t).toLocaleString()}</div>
          <div style={{ fontWeight: 500 }}>{yFmt ? yFmt(hi.v) : hi.v.toLocaleString()}</div>
        </div>
      )}
    </div>
  );
}

export function Bars({ points, height = 120, color = '#0a0a0a', fmt }: { points: { t: number; v: number }[]; height?: number; color?: string; fmt?: (v: number) => string }) {
  const max = Math.max(1e-9, ...points.map((p) => p.v));
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div style={{ position: 'relative', height, display: 'flex', alignItems: 'flex-end', gap: 3 }}>
      {points.map((p, i) => (
        <motion.div
          key={p.t}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
          style={{ flex: 1, borderRadius: 4, background: hover === i ? color : `${color}`, opacity: hover === null || hover === i ? 1 : 0.35, transformOrigin: 'bottom', minHeight: 2 }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1, height: Math.max(2, (p.v / max) * height) }}
          transition={{ type: 'spring', stiffness: 260, damping: 28, delay: i * 0.01 }}
        />
      ))}
      {hover !== null && (
        <div style={{ position: 'absolute', top: -34, left: `${(hover / points.length) * 100}%`, transform: 'translateX(-50%)', background: '#0a0a0a', color: '#fff', borderRadius: 8, padding: '4px 8px', fontSize: 11.5, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {fmt ? fmt(points[hover].v) : points[hover].v} · {new Date(points[hover].t).toLocaleTimeString('en-US', { hour: 'numeric' })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Count-up number ---------------- */
export function Num({ value, fmt, className = '' }: { value: number; fmt: (n: number) => string; className?: string }) {
  const [v, setV] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = value;
    if (from === to) return;
    const t0 = performance.now();
    const dur = 700;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setV(from + (to - from) * e);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={`tnum ${className}`}>{fmt(v)}</span>;
}
