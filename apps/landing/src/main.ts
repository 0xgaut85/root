import './styles/main.css';
import gsap from 'gsap';
import type { Experience } from './experience/Experience';
import type { Chapter } from './experience/Chapter';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const canvas = $<HTMLCanvasElement>('#webgl');
const loaderUi = $('#loader-ui');
const counter = $('[data-counter]');
const brand = $('.loader-brand');
const hint = $('[data-hint]');
const hintText = $('[data-hint-text]');
const skipBtn = $<HTMLButtonElement>('[data-skip]');
const nav = $('[data-nav]');
const stage = $('[data-stage]');
const hud = $('[data-hud]');
const rail = $('[data-rail]');
const hudIndex = $('[data-hud-index]');
const hudLabel = $('[data-hud-label]');
const pill = $('[data-scroll-pill]');

/* ---------------- "Coming soon" for the app / protocol links ---------------- */

const soon = $('[data-soon]');
const showSoon = () => {
  soon.hidden = false;
  requestAnimationFrame(() => soon.classList.add('is-open'));
  $('[data-soon-close]').focus();
};
const hideSoon = () => {
  soon.classList.remove('is-open');
  setTimeout(() => (soon.hidden = true), 260);
};
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.closest('[data-soon-close]') || (target.closest('[data-soon]') && !target.closest('.soon__card'))) {
    e.preventDefault();
    hideSoon();
    return;
  }
  const a = target.closest<HTMLElement>('a[href], [data-soon-trigger]');
  if (!a) return;
  const href = a.getAttribute('href') || '';
  if (a.hasAttribute('data-soon-trigger') || /use\.rootnetwork\.co|read\.rootnetwork\.co/.test(href)) {
    e.preventDefault();
    showSoon();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !soon.hidden) hideSoon();
});

/* ---------------- Experience (after the loader) ---------------- */

let xpPromise: Promise<Experience> | null = null;

function loadExperience(): Promise<Experience> {
  if (xpPromise) return xpPromise;
  xpPromise = (async () => {
    const [{ Experience }, { buildChapters, manifest, extraAssets }] = await Promise.all([import('./experience/Experience'), import('./experience/chapters')]);
    const xp = new Experience({
      canvas: $<HTMLCanvasElement>('#xp'),
      overlay: $('[data-overlay]'),
      chapters: buildChapters(),
      onChapter: onChapter,
      onProgress: onProgress,
      onFirstScroll: () => pill.classList.remove('is-visible'),
    });
    await Promise.all([xp.preload(manifest), extraAssets(xp.ctx.assets)]);
    if (import.meta.env.DEV) (window as unknown as { __xp: Experience }).__xp = xp;
    return xp;
  })();
  return xpPromise;
}

const TICKS = 31;
const ticks: HTMLElement[] = [];
function buildRail(chapters: Chapter[]) {
  rail.innerHTML = '';
  ticks.length = 0;
  const per = (TICKS - 1) / chapters.length;
  for (let i = 0; i < TICKS; i++) {
    const t = document.createElement('i');
    if (Math.abs((i % per) - 0) < 1e-6) t.classList.add('is-major');
    rail.appendChild(t);
    ticks.push(t);
  }
}

let currentTick = -1;
function onProgress(p: number, max: number) {
  const k = Math.round((p / max) * (TICKS - 1));
  if (k === currentTick) return;
  if (currentTick >= 0) ticks[currentTick]?.classList.remove('is-current');
  currentTick = k;
  ticks[k]?.classList.add('is-current');
}

function onChapter(index: number, chapter: Chapter) {
  document.body.classList.toggle('is-dark', chapter.dark);
  hudIndex.textContent = String(index).padStart(2, '0');
  hudLabel.textContent = chapter.label;
}

async function showExperience() {
  const xp = await loadExperience();
  xp.prepare();
  buildRail(xp.chapters);
  document.body.classList.remove('is-loading');
  stage.classList.add('is-visible');
  xp.start();
  xp.reveal(1.4);
  window.setTimeout(() => {
    nav.classList.add('is-visible');
    hud.classList.add('is-visible');
  }, 700);
  window.setTimeout(() => pill.classList.add('is-visible'), 1800);
  pill.addEventListener('click', () => xp.scroller.goTo(1));
  // if the visitor sits at a chapter start for a while, nudge again
  window.setInterval(() => {
    const atStart = Math.abs(xp.scroller.value - Math.round(xp.scroller.value)) < 0.01 && xp.scroller.value < xp.scroller.max - 0.5;
    if (xp.scroller.idleMs > 9000 && atStart) pill.classList.add('is-visible');
    else if (xp.scroller.idleMs < 200) pill.classList.remove('is-visible');
  }, 1000);
}

/* ---------------- Loader ---------------- */

function supportsWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const params = new URLSearchParams(location.search);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const skipLoader = params.has('skip') || reduceMotion || !supportsWebGL();

if (skipLoader) {
  canvas.classList.add('is-removed');
  loaderUi.classList.add('is-removed');
  showExperience().then(async () => {
    // ?skip=3 jumps straight to a chapter (handy for reviewing)
    const to = Number(params.get('skip'));
    if (to > 0) {
      const xp = await loadExperience();
      xp.scroller.target = to;
      xp.scroller.value = to;
    }
  });
} else {
  import('./loader/Loader').then(({ Loader }) => {
    let shownNumber = -1;
    let readyAt = 0;
    let skipTimer = 0;
    let done = false;

    const showSkip = () => skipBtn.classList.add('is-visible');
    const setHint = (text: string) => {
      if (hintText.textContent === text) return;
      gsap.to(hintText, {
        opacity: 0,
        y: -6,
        duration: 0.25,
        onComplete: () => {
          hintText.textContent = text;
          gsap.fromTo(hintText, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.35 });
        },
      });
    };

    const loader = new Loader({
      canvas,
      handUrl: '/assets/models/hand.glb',
      frostUrl: '/assets/textures/frost.webp',
      frostNormalUrl: '/assets/textures/frost_normal.webp',
      preload: [],
      onProgress: (p) => {
        const n = Math.max(99 - Math.floor(p * 33) * 3, 0);
        if (n !== shownNumber) {
          shownNumber = n;
          counter.textContent = String(n).padStart(2, '0');
        }
      },
      onReadyToDraw: () => {
        readyAt = performance.now();
        const tl = gsap.timeline();
        tl.to(counter, { yPercent: -110, opacity: 0, duration: 0.7, ease: 'power3.inOut' });
        tl.to(brand, { opacity: 1, x: 0, duration: 0.7, ease: 'power3.out' }, 0.3);
        positionHint();
        setHint('DRAW AN R');
        tl.to(hint, { opacity: 1, duration: 0.8, ease: 'power2.out' }, 0.6);
        skipTimer = window.setTimeout(showSkip, 9000);
        // start loading the experience while the visitor draws
        loadExperience();
      },
      onNearComplete: () => setHint('KEEP GOING'),
      onAttemptFailed: (n) => {
        loader.clearTrail();
        setHint(n === 1 ? 'TRACE THE R' : 'ALMOST \u2014 TRACE THE R');
        if (n >= 2) showSkip();
      },
      onComplete: () => {
        done = true;
        window.clearTimeout(skipTimer);
        gsap.to([hint, brand], { opacity: 0, duration: 0.5 });
        skipBtn.classList.remove('is-visible');
      },
      onWhite: () => {
        loaderUi.classList.add('is-hidden');
        canvas.classList.add('is-hidden');
        showExperience();
        window.setTimeout(() => {
          canvas.classList.add('is-removed');
          loaderUi.classList.add('is-removed');
          loader.dispose();
        }, 1000);
      },
    });

    function positionHint() {
      const mobile = window.innerWidth < 768;
      const hFrac = mobile ? 0.34 : 0.42;
      const cy = mobile ? 0.42 : 0.46;
      const top = (cy - hFrac / 2) * window.innerHeight - 44;
      hint.style.top = `${Math.max(top, 24)}px`;
      hint.style.transform = 'translate(-50%, 0)';
    }
    window.addEventListener('resize', positionHint);

    skipBtn.addEventListener('click', () => {
      if (done) return;
      loader.skip();
    });

    window.setInterval(() => {
      if (!done && readyAt && performance.now() - readyAt > 45000) showSkip();
    }, 5000);
  });
}
