import type { Chapter, TextBeat } from './Chapter';

interface BeatEl {
  el: HTMLElement;
  beat: TextBeat;
  chapter: number;
  visible: boolean;
}

/**
 * DOM typography layered over the WebGL canvas. Each beat lives in a window
 * of its chapter's local progress and is scrubbed by scroll: it dissolves in,
 * drifts/zooms slightly while on screen, and dissolves out.
 */
export class Overlay {
  private beats: BeatEl[] = [];
  private root: HTMLElement;

  constructor(root: HTMLElement, chapters: Chapter[]) {
    this.root = root;
    chapters.forEach((c, ci) => {
      c.beats.forEach((b) => {
        const el = document.createElement('div');
        const light = b.light ?? c.dark;
        el.className = `beat beat--${b.size || 'l'} beat--${b.align || 'center'}${light ? ' beat--light' : ''}${b.className ? ' ' + b.className : ''}`;
        if (b.fixed) {
          el.classList.add('beat--fixed');
        } else {
          el.style.left = `${(b.x ?? 0.5) * 100}%`;
          el.style.top = `${(b.y ?? 0.5) * 100}%`;
        }
        el.innerHTML =
          b.raw ??
          `
          ${b.eyebrow ? `<p class="beat__eyebrow">${b.eyebrow}</p>` : ''}
          <h2 class="beat__title">${b.html}</h2>
          ${b.body ? `<p class="beat__body">${b.body}</p>` : ''}
          ${b.extra ? `<div class="beat__extra">${b.extra}</div>` : ''}
        `;
        el.style.opacity = '0';
        el.style.visibility = 'hidden';
        root.appendChild(el);
        this.beats.push({ el, beat: b, chapter: ci, visible: false });
      });
    });
  }

  resize() {
    /* positions are percentage based; nothing to do */
  }

  update(p: number, _time: number) {
    for (const b of this.beats) {
      const t = p - b.chapter;
      const { from, to } = b.beat;
      const len = to - from;
      if (t < from - 0.02 || t > to + 0.02) {
        if (b.visible) {
          b.visible = false;
          b.el.style.opacity = '0';
          b.el.style.visibility = 'hidden';
          b.el.style.pointerEvents = 'none';
        }
        continue;
      }
      const u = Math.max(0, Math.min(1, (t - from) / len)); // 0..1 through the window
      const fadeIn = Math.min(1, u / 0.2);
      const fadeOut = Math.min(1, (1 - u) / 0.2);
      const a = ease(fadeIn) * ease(fadeOut);
      const scale = 0.94 + u * 0.12; // slow zoom-in while on screen
      const y = (1 - ease(fadeIn)) * 26 - (1 - ease(fadeOut)) * 18;
      const blur = (1 - ease(fadeIn)) * 14 + (1 - ease(fadeOut)) * 10;
      const el = b.el;
      if (!b.visible) {
        b.visible = true;
        el.style.visibility = 'visible';
      }
      el.style.opacity = a.toFixed(3);
      if (b.beat.fixed) {
        el.style.transform = `translate3d(0, ${(y * 0.6).toFixed(2)}px, 0)`;
        el.style.filter = 'none';
      } else {
        el.style.transform = `translate(-50%, -50%) translate3d(0, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
        el.style.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : 'none';
      }
      el.style.pointerEvents = a > 0.6 ? 'auto' : 'none';
    }
  }

  dispose() {
    this.root.innerHTML = '';
    this.beats = [];
  }
}

function ease(t: number) {
  return t * t * (3 - 2 * t);
}
