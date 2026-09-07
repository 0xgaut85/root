/**
 * Virtual scroll. The page itself never scrolls: wheel, touch, keyboard and
 * drag all move a target value which is eased every frame. One "unit" equals
 * one chapter of the experience.
 */
export interface ScrollerOptions {
  chapters: number;
  /** pixels of wheel delta per chapter */
  pixelsPerChapter?: number;
  lerp?: number;
}

export class Scroller {
  target = 0;
  value = 0;
  velocity = 0;
  enabled = false;
  max: number;
  private ppc: number;
  private lerp: number;
  private lastTouchY = 0;
  private touchActive = false;
  private dragging = false;
  private lastMouseY = 0;
  private lastInputAt = 0;
  private listeners = new Set<(v: number) => void>();
  private el: HTMLElement;

  constructor(el: HTMLElement, opts: ScrollerOptions) {
    this.el = el;
    // the last chapter plays out fully, so the range is [0, chapters]
    this.max = opts.chapters;
    this.ppc = opts.pixelsPerChapter ?? 1900;
    this.lerp = opts.lerp ?? 0.08;

    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('touchstart', this.onTouchStart, { passive: true });
    el.addEventListener('touchmove', this.onTouchMove, { passive: false });
    el.addEventListener('touchend', this.onTouchEnd, { passive: true });
    el.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('keydown', this.onKey);
  }

  get idleMs() {
    return performance.now() - this.lastInputAt;
  }

  onChange(fn: (v: number) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Jump (animated via lerp) to a chapter start. */
  goTo(chapter: number) {
    this.target = Math.max(0, Math.min(this.max, chapter));
    this.lastInputAt = performance.now();
  }

  private add(px: number) {
    if (!this.enabled) return;
    this.target = Math.max(0, Math.min(this.max, this.target + px / this.ppc));
    this.lastInputAt = performance.now();
  }

  private onWheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    let d = e.deltaY;
    if (e.deltaMode === 1) d *= 16;
    else if (e.deltaMode === 2) d *= window.innerHeight;
    // tame very fast trackpad flicks and mouse wheel steps alike
    d = Math.max(-140, Math.min(140, d));
    this.add(d);
  };

  private onTouchStart = (e: TouchEvent) => {
    this.touchActive = true;
    this.lastTouchY = e.touches[0].clientY;
  };
  private onTouchMove = (e: TouchEvent) => {
    if (!this.touchActive || !this.enabled) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    this.add((this.lastTouchY - y) * 2.2);
    this.lastTouchY = y;
  };
  private onTouchEnd = () => {
    this.touchActive = false;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('a,button')) return;
    this.dragging = true;
    this.lastMouseY = e.clientY;
  };
  private onMouseMove = (e: MouseEvent) => {
    if (!this.dragging) return;
    this.add((this.lastMouseY - e.clientY) * 1.6);
    this.lastMouseY = e.clientY;
  };
  private onMouseUp = () => {
    this.dragging = false;
  };

  private onKey = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault();
      this.add(e.key === ' ' || e.key === 'PageDown' ? this.ppc * 0.5 : 120);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      this.add(e.key === 'PageUp' ? -this.ppc * 0.5 : -120);
    } else if (e.key === 'End') {
      this.goTo(this.max);
    } else if (e.key === 'Home') {
      this.goTo(0);
    }
  };

  /** Advance easing. Returns true while still moving. */
  update(dt: number) {
    // frame-rate independent lerp
    const k = 1 - Math.pow(1 - this.lerp, dt * 60);
    const prev = this.value;
    this.value += (this.target - this.value) * k;
    if (Math.abs(this.target - this.value) < 0.0004) this.value = this.target;
    this.velocity = (this.value - prev) / Math.max(dt, 1e-4);
    if (this.value !== prev) for (const l of this.listeners) l(this.value);
    return this.value !== this.target;
  }

  dispose() {
    this.el.removeEventListener('wheel', this.onWheel);
    this.el.removeEventListener('touchstart', this.onTouchStart);
    this.el.removeEventListener('touchmove', this.onTouchMove);
    this.el.removeEventListener('touchend', this.onTouchEnd);
    this.el.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('keydown', this.onKey);
  }
}
