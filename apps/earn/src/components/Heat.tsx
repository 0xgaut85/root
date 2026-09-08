import { useEffect, useRef } from 'react';

/** Slow, grainy thermal gradient — the same family as the landing's Roots chapter. */
export function Heat({ className = 'heat' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    let raf = 0;
    let w = 0;
    let h = 0;
    const blobs = Array.from({ length: 6 }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.35 + Math.random() * 0.3,
      s: 0.00004 + Math.random() * 0.00005,
      p: i * 1.3,
      hue: i % 3,
    }));
    const palette = ['rgba(216,64,40,', 'rgba(232,160,48,', 'rgba(36,72,196,'];
    const resize = () => {
      const r = c.getBoundingClientRect();
      w = c.width = Math.max(1, Math.floor(r.width / 2));
      h = c.height = Math.max(1, Math.floor(r.height / 2));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    const gc = document.createElement('canvas');
    const gctx = gc.getContext('2d')!;
    let frame = 0;
    const refreshGrain = () => {
      gc.width = w;
      gc.height = h;
      const img = gctx.createImageData(w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() * 255) | 0;
        d[i] = d[i + 1] = d[i + 2] = n;
        d[i + 3] = 255;
      }
      gctx.putImageData(img, 0, 0);
    };
    const draw = (t: number) => {
      ctx.fillStyle = '#05040a';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const b of blobs) {
        const x = (0.5 + 0.45 * Math.sin(t * b.s + b.p)) * w;
        const y = (0.5 + 0.45 * Math.cos(t * b.s * 0.8 + b.p * 1.7)) * h;
        const r = b.r * Math.max(w, h);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `${palette[b.hue]}0.55)`);
        g.addColorStop(0.5, `${palette[b.hue]}0.18)`);
        g.addColorStop(1, `${palette[b.hue]}0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = 'source-over';
      // grain (refreshed every 3rd frame, blended over the field)
      if (frame++ % 3 === 0 || gc.width !== w || gc.height !== h) refreshGrain();
      ctx.globalAlpha = 0.12;
      ctx.drawImage(gc, 0, 0);
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);
  return <canvas ref={ref} className={className} style={{ width: '100%', height: '100%' }} aria-hidden />;
}
