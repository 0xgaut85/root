/**
 * "Draw an R" detection.
 *
 * Two independent detectors, either one completes the gesture:
 *  1. Guide tracing: coverage of the on-screen ghost "R" polyline by the
 *     user's strokes (robust when people trace the ghost letter).
 *  2. $P point-cloud recognizer (Vatavu, Anthony & Wobbrock 2012) against
 *     R templates plus a set of negative templates (freehand R anywhere).
 *
 * Coordinates: viewport pixels divided by viewport height (so shapes are not
 * distorted by aspect ratio). Strokes are kept for a short idle window so an
 * R can be drawn in 1, 2 or 3 strokes.
 */

export interface Pt {
  x: number;
  y: number;
  id: number; // stroke id
}

interface Template {
  name: string;
  points: Pt[];
}

const N = 32;
const STROKE_TIMEOUT_MS = 4500;

/* ---------------- Guide geometry (unit box: width 0.72, height 1) ---------------- */

/** Polyline strokes of the guide R in a unit box (x 0..0.72, y 0..1, y down). */
export function guideStrokesUnit(): Pt[][] {
  const stem: Pt[] = [
    { x: 0, y: 1, id: 0 },
    { x: 0, y: 0, id: 0 },
  ];
  const bowl: Pt[] = [{ x: 0, y: 0, id: 1 }, { x: 0.36, y: 0, id: 1 }];
  // half circle from (0.36,0) to (0.36,0.5), bulging right, centre (0.36,0.25), r 0.25
  const cx = 0.36;
  const cy = 0.25;
  const r = 0.25;
  for (let i = 1; i <= 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI;
    bowl.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, id: 1 });
  }
  bowl.push({ x: 0, y: 0.5, id: 1 });
  const leg: Pt[] = [
    { x: 0.16, y: 0.5, id: 2 },
    { x: 0.7, y: 1, id: 2 },
  ];
  return [stem, bowl, leg];
}

/* ---------------- $P recognizer ---------------- */

function pathLength(points: Pt[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].id === points[i - 1].id) d += dist(points[i - 1], points[i]);
  }
  return d;
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function resample(input: Pt[], n: number): Pt[] {
  const points = input.map((p) => ({ ...p }));
  const I = pathLength(points) / (n - 1);
  if (I <= 0) {
    const out = points.slice(0, n);
    while (out.length < n) out.push({ ...points[points.length - 1] });
    return out;
  }
  let D = 0;
  const out: Pt[] = [{ ...points[0] }];
  for (let i = 1; i < points.length; i++) {
    if (points[i].id === points[i - 1].id) {
      const d = dist(points[i - 1], points[i]);
      if (D + d >= I) {
        const t = (I - D) / d;
        const q: Pt = {
          x: points[i - 1].x + t * (points[i].x - points[i - 1].x),
          y: points[i - 1].y + t * (points[i].y - points[i - 1].y),
          id: points[i].id,
        };
        out.push(q);
        points.splice(i, 0, q); // q becomes points[i-1] on the next iteration
        D = 0;
      } else {
        D += d;
      }
    }
  }
  while (out.length < n) out.push({ ...points[points.length - 1] });
  return out.slice(0, n);
}

function scale(points: Pt[]): Pt[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  return points.map((p) => ({ x: (p.x - minX) / size, y: (p.y - minY) / size, id: p.id }));
}

function translateToOrigin(points: Pt[]): Pt[] {
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;
  return points.map((p) => ({ x: p.x - cx, y: p.y - cy, id: p.id }));
}

function normalize(points: Pt[]): Pt[] {
  return translateToOrigin(scale(resample(points, N)));
}

function cloudDistance(a: Pt[], b: Pt[], start: number): number {
  const n = a.length;
  const matched = new Array<boolean>(n).fill(false);
  let sum = 0;
  let i = start;
  do {
    let index = -1;
    let min = Infinity;
    for (let j = 0; j < n; j++) {
      if (!matched[j]) {
        const d = dist(a[i], b[j]);
        if (d < min) {
          min = d;
          index = j;
        }
      }
    }
    matched[index] = true;
    const weight = 1 - ((i - start + n) % n) / n;
    sum += weight * min;
    i = (i + 1) % n;
  } while (i !== start);
  return sum;
}

function greedyCloudMatch(a: Pt[], b: Pt[]): number {
  const e = 0.5;
  const step = Math.max(1, Math.floor(Math.pow(a.length, 1 - e)));
  let min = Infinity;
  for (let i = 0; i < a.length; i += step) {
    min = Math.min(min, cloudDistance(a, b, i), cloudDistance(b, a, i));
  }
  return min;
}

function buildTemplates(): Template[] {
  const T: Template[] = [];
  const add = (name: string, strokes: Pt[][]) => {
    const pts: Pt[] = [];
    strokes.forEach((s, id) => s.forEach((p) => pts.push({ x: p.x, y: p.y, id })));
    T.push({ name, points: normalize(pts) });
  };

  const g = guideStrokesUnit();
  const stem = g[0];
  const bowl = g[1];
  const leg = g[2];

  // R variants
  add('R', [stem, bowl, leg]); // 3 strokes
  add('R', [stem, [...bowl, ...leg]]); // 2 strokes (stem, bowl+leg)
  add('R', [[...stem.slice().reverse(), ...bowl, ...leg]]); // 1 stroke from top? (stem reversed: top->bottom then bowl) -> unusual; still an R
  add('R', [[...stem, ...bowl, ...leg]]); // 1 stroke bottom-up stem, bowl, leg
  // R with straighter bowl (more like handwriting)
  add('R', [
    stem,
    [
      { x: 0, y: 0, id: 1 },
      { x: 0.45, y: 0.02, id: 1 },
      { x: 0.55, y: 0.2, id: 1 },
      { x: 0.42, y: 0.45, id: 1 },
      { x: 0.05, y: 0.5, id: 1 },
      { x: 0.35, y: 0.6, id: 1 },
      { x: 0.7, y: 1, id: 1 },
    ],
  ]);
  // R with leg starting from bowl bottom
  add('R', [
    stem,
    bowl,
    [
      { x: 0.3, y: 0.5, id: 2 },
      { x: 0.72, y: 1, id: 2 },
    ],
  ]);

  // Negatives
  const circle: Pt[] = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    circle.push({ x: 0.5 + Math.cos(a) * 0.5, y: 0.5 + Math.sin(a) * 0.5, id: 0 });
  }
  add('O', [circle]);
  add('P', [stem, bowl]);
  add('I', [stem]);
  add('-', [[{ x: 0, y: 0.5, id: 0 }, { x: 1, y: 0.5, id: 0 }]]);
  add('D', [
    stem,
    [
      { x: 0, y: 0, id: 1 },
      { x: 0.4, y: 0, id: 1 },
      { x: 0.72, y: 0.3, id: 1 },
      { x: 0.72, y: 0.7, id: 1 },
      { x: 0.4, y: 1, id: 1 },
      { x: 0, y: 1, id: 1 },
    ],
  ]);
  add('N', [
    [
      { x: 0, y: 1, id: 0 },
      { x: 0, y: 0, id: 0 },
      { x: 0.7, y: 1, id: 0 },
      { x: 0.7, y: 0, id: 0 },
    ],
  ]);
  add('K', [
    stem,
    [
      { x: 0.6, y: 0, id: 1 },
      { x: 0, y: 0.5, id: 1 },
      { x: 0.7, y: 1, id: 1 },
    ],
  ]);
  add('Z', [
    [
      { x: 0, y: 0, id: 0 },
      { x: 0.7, y: 0, id: 0 },
      { x: 0, y: 1, id: 0 },
      { x: 0.7, y: 1, id: 0 },
    ],
  ]);
  add('B', [
    stem,
    [
      { x: 0, y: 0, id: 1 },
      { x: 0.4, y: 0, id: 1 },
      { x: 0.55, y: 0.25, id: 1 },
      { x: 0.05, y: 0.5, id: 1 },
      { x: 0.6, y: 0.7, id: 1 },
      { x: 0.45, y: 1, id: 1 },
      { x: 0, y: 1, id: 1 },
    ],
  ]);
  add('^', [[{ x: 0, y: 1, id: 0 }, { x: 0.5, y: 0, id: 0 }, { x: 1, y: 1, id: 0 }]]);
  add('S', [
    [
      { x: 0.7, y: 0.1, id: 0 },
      { x: 0.35, y: 0, id: 0 },
      { x: 0, y: 0.2, id: 0 },
      { x: 0.35, y: 0.5, id: 0 },
      { x: 0.7, y: 0.8, id: 0 },
      { x: 0.35, y: 1, id: 0 },
      { x: 0, y: 0.9, id: 0 },
    ],
  ]);
  return T;
}

export interface RecognizeResult {
  name: string;
  score: number; // 0..1
}

export class RGesture {
  private templates = buildTemplates();
  private strokes: Pt[][] = [];
  private current: Pt[] | null = null;
  private lastUpAt = 0;
  private strokeId = 0;

  /** viewport height in px (coords are divided by it) */
  viewportH = 1;
  viewportW = 1;

  /** Guide polyline in viewport-normalized coords (x/H, y/H). */
  guide: Pt[][] = [];
  guideCoverRadius = 0.06;

  isComplete = false;
  onNearComplete: (() => void) | null = null;
  onComplete: ((center: { x: number; y: number }) => void) | null = null;
  onAttemptFailed: ((attempt: number) => void) | null = null;

  private nearFired = false;
  private failedAttempts = 0;
  ready = false;

  setViewport(w: number, h: number) {
    this.viewportW = w;
    this.viewportH = h;
  }

  /** Place the guide R centered at (cx, cy) (fractions of viewport) with height `hFrac` of viewport height. */
  layoutGuide(cxFrac: number, cyFrac: number, hFrac: number) {
    const H = this.viewportH;
    const W = this.viewportW;
    const h = hFrac; // in H units
    const w = 0.72 * h;
    const left = (cxFrac * W) / H - w / 2;
    const top = cyFrac - h / 2;
    this.guide = guideStrokesUnit().map((s) => s.map((p) => ({ x: left + p.x * h, y: top + p.y * h, id: p.id })));
    // generous: users do not need to be precise, roughly following the letter is enough
    this.guideCoverRadius = h * 0.14;
  }

  /**
   * "Finished" test: both ends of every guide stroke (stem, bowl, leg) have a
   * user point nearby. Precision is generous; this only makes sure the letter
   * has been drawn to its ends rather than left halfway.
   */
  private strokeEndsTouched(points: Pt[]): boolean {
    const r = this.guideCoverRadius * 1.3;
    const r2 = r * r;
    for (const s of this.guide) {
      for (const e of [s[0], s[s.length - 1]]) {
        let ok = false;
        for (const p of points) {
          const dx = p.x - e.x;
          const dy = p.y - e.y;
          if (dx * dx + dy * dy <= r2) {
            ok = true;
            break;
          }
        }
        if (!ok) return false;
      }
    }
    return true;
  }

  /** Points where a hand-drawn R naturally ends (leg end, stem bottom, stem top). */
  private guideEndPoints(): Pt[] {
    if (this.guide.length < 3) return [];
    const stem = this.guide[0];
    const leg = this.guide[2];
    return [leg[leg.length - 1], stem[0], stem[stem.length - 1]];
  }

  pointerDown(clientX: number, clientY: number) {
    if (!this.ready || this.isComplete) return;
    const now = performance.now();
    if (now - this.lastUpAt > STROKE_TIMEOUT_MS) this.resetStrokes();
    this.current = [];
    this.strokes.push(this.current);
    this.strokeId++;
    this.addPoint(clientX, clientY);
  }

  pointerMove(clientX: number, clientY: number) {
    if (!this.ready || this.isComplete || !this.current) return;
    const last = this.current[this.current.length - 1];
    const p = this.toPt(clientX, clientY);
    if (last && dist(last, p) < 0.004) return;
    this.current.push(p);
    if (this.current.length > 600) this.current.shift();
    this.evaluate(false);
  }

  pointerUp() {
    if (!this.ready || this.isComplete) return;
    if (this.current) {
      this.lastUpAt = performance.now();
      this.current = null;
      this.evaluate(true);
    }
  }

  private toPt(clientX: number, clientY: number): Pt {
    return { x: clientX / this.viewportH, y: clientY / this.viewportH, id: this.strokeId };
  }

  private addPoint(clientX: number, clientY: number) {
    this.current!.push(this.toPt(clientX, clientY));
  }

  private allPoints(): Pt[] {
    const out: Pt[] = [];
    for (const s of this.strokes) for (const p of s) out.push(p);
    return out;
  }

  resetStrokes() {
    this.strokes = [];
    this.current = null;
    this.nearFired = false;
  }

  /** Coverage of the guide polyline by user points, 0..1 (overall) */
  guideCoverage(points: Pt[]): number {
    return this.guideCoverageDetailed(points).total;
  }

  /** Coverage overall and per guide stroke (stem, bowl, leg). */
  guideCoverageDetailed(points: Pt[]): { total: number; perStroke: number[] } {
    if (!this.guide.length || !points.length) return { total: 0, perStroke: this.guide.map(() => 0) };
    const r2 = this.guideCoverRadius * this.guideCoverRadius;
    let total = 0;
    let hit = 0;
    const perStroke: number[] = [];
    for (const s of this.guide) {
      let sTotal = 0;
      let sHit = 0;
      // sample along each segment
      for (let i = 1; i < s.length; i++) {
        const a = s[i - 1];
        const b = s[i];
        const len = dist(a, b);
        const steps = Math.max(1, Math.ceil(len / (this.guideCoverRadius * 0.6)));
        for (let k = 0; k <= steps; k++) {
          const t = k / steps;
          const gx = a.x + (b.x - a.x) * t;
          const gy = a.y + (b.y - a.y) * t;
          sTotal++;
          for (const p of points) {
            const dx = p.x - gx;
            const dy = p.y - gy;
            if (dx * dx + dy * dy <= r2) {
              sHit++;
              break;
            }
          }
        }
      }
      total += sTotal;
      hit += sHit;
      perStroke.push(sTotal ? sHit / sTotal : 0);
    }
    return { total: total ? hit / total : 0, perStroke };
  }

  recognize(points: Pt[]): RecognizeResult {
    if (points.length < 12) return { name: '', score: 0 };
    const c = normalize(points);
    let best = Infinity;
    let name = '';
    for (const t of this.templates) {
      const d = greedyCloudMatch(c, t.points);
      if (d < best) {
        best = d;
        name = t.name;
      }
    }
    return { name, score: Math.max((2 - best) / 2, 0) };
  }

  private evaluate(onUp: boolean) {
    const pts = this.allPoints();
    if (pts.length < 10) return;

    // size gate: gesture must be reasonably big (>= 12% of viewport height)
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const size = Math.max(maxX - minX, maxY - minY);
    if (size < 0.12) return;

    const { total: cov, perStroke } = this.guideCoverageDetailed(pts);
    if (!this.nearFired && cov > 0.5) {
      this.nearFired = true;
      this.onNearComplete?.();
    }

    // Every part of the letter (stem, bowl, leg) must be touched, but nothing
    // needs to be precise. While the pointer is still down we only complete
    // when the pen is at a natural end of the letter, so the gesture never
    // "goes through" halfway along a stroke.
    const traced = cov >= 0.66 && perStroke.every((c) => c >= 0.4) && this.strokeEndsTouched(pts);
    if (traced) {
      if (onUp) {
        this.complete(pts);
        return;
      }
      const pen = pts[pts.length - 1];
      const endR = this.guideCoverRadius * 0.6;
      if (this.guideEndPoints().some((e) => dist(e, pen) <= endR)) {
        this.complete(pts);
        return;
      }
    }

    // $P only on pointer up (cheaper, and avoids premature matches)
    if (onUp) {
      const r = this.recognize(pts);
      if (r.name === 'R' && r.score >= 0.74) {
        this.complete(pts);
        return;
      }
      if (this.strokes.length >= 3 || (this.strokes.length >= 1 && size > 0.3 && r.name !== 'R' && r.name !== 'P' && r.name !== 'I')) {
        // Plausibly a finished attempt that was not an R
        this.failedAttempts++;
        this.onAttemptFailed?.(this.failedAttempts);
        this.resetStrokes();
      }
    }
  }

  private complete(pts: Pt[]) {
    if (this.isComplete) return;
    this.isComplete = true;
    let cx = 0;
    let cy = 0;
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
    }
    cx /= pts.length;
    cy /= pts.length;
    // convert to viewport fractions (uv, y up)
    const H = this.viewportH;
    const W = this.viewportW;
    this.onComplete?.({ x: (cx * H) / W, y: 1 - cy });
  }
}
