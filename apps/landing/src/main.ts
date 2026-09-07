import './styles/main.css';
import gsap from 'gsap';
import { scenes, renderScenes } from './scroll/scenes';
import { initSmoothScroll, initFrames, startScroll, stopScroll } from './scroll/experience';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const canvas = $<HTMLCanvasElement>('#webgl');
const loaderUi = $('#loader-ui');
const counter = $('[data-counter]');
const brand = $('.loader-brand');
const hint = $('[data-hint]');
const hintText = $('[data-hint-text]');
const skipBtn = $<HTMLButtonElement>('[data-skip]');
const nav = $('[data-nav]');
const page = $('[data-page]');
const framesRoot = $('[data-frames]');

$('[data-year]').textContent = String(new Date().getFullYear());

/* ---------------- Page (welcome + frames) ---------------- */

async function probeVideos(): Promise<Set<string>> {
  const ok = new Set<string>();
  const urls = scenes.map((s) => s.video).filter(Boolean) as string[];
  await Promise.all(
    urls.map(async (u) => {
      try {
        const r = await fetch(u, { method: 'HEAD' });
        if (r.ok && (r.headers.get('content-type') || '').startsWith('video')) ok.add(u);
      } catch {
        /* ignore */
      }
    }),
  );
  return ok;
}

function splitWords(el: HTMLElement) {
  const html = el.innerHTML;
  const parts = html.split(/<br\s*\/?>/i);
  el.innerHTML = parts
    .map((line) =>
      line
        .trim()
        .split(/\s+/)
        .map((w) => `<span class="word"><span>${w}</span></span>`)
        .join(' '),
    )
    .join('<br />');
  return Array.from(el.querySelectorAll<HTMLElement>('.word > span'));
}

let pageReady: Promise<void> | null = null;
function preparePage() {
  if (pageReady) return pageReady;
  pageReady = probeVideos().then((videos) => {
    renderScenes(framesRoot, videos);
  });
  return pageReady;
}

async function revealWelcome() {
  await preparePage();
  document.body.classList.remove('is-loading');
  page.classList.add('is-visible');
  window.scrollTo(0, 0);

  const title = $('[data-welcome-title]');
  const words = splitWords(title);
  const sub = $('[data-welcome-sub]');
  const eyebrow = $('[data-welcome-eyebrow]');
  const cue = $('[data-scroll-cue]');

  initSmoothScroll();
  stopScroll();

  const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
  tl.fromTo(eyebrow, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.8 }, 0.1);
  tl.to(words, { y: 0, duration: 1.2, stagger: 0.07 }, 0.15);
  tl.to(sub, { opacity: 1, y: 0, duration: 1 }, 0.7);
  tl.add(() => nav.classList.add('is-visible'), 0.9);
  tl.to(cue, { opacity: 1, duration: 0.8 }, 1.3);
  tl.add(() => {
    initFrames(framesRoot);
    startScroll();
  }, 1.1);
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

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const skipLoader = new URLSearchParams(location.search).has('skip') || reduceMotion || !supportsWebGL();

if (skipLoader) {
  canvas.classList.add('is-removed');
  loaderUi.classList.add('is-removed');
  revealWelcome();
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
      preload: [scenes[0].image, scenes[1].image],
      onProgress: (p) => {
        const n = Math.max(99 - Math.floor(p * 33) * 3, 0);
        if (n !== shownNumber) {
          shownNumber = n;
          counter.textContent = String(n).padStart(2, '0');
        }
      },
      onReadyToDraw: () => {
        readyAt = performance.now();
        // counter -> brand swap
        const tl = gsap.timeline();
        tl.to(counter, { yPercent: -110, opacity: 0, duration: 0.7, ease: 'power3.inOut' });
        tl.to(brand, { opacity: 1, x: 0, duration: 0.7, ease: 'power3.out' }, 0.3);
        // hint under the ghost R
        positionHint();
        setHint('DRAW AN R');
        tl.to(hint, { opacity: 1, duration: 0.8, ease: 'power2.out' }, 0.6);
        skipTimer = window.setTimeout(showSkip, 9000);
        // start preparing the page in the background
        preparePage();
      },
      onNearComplete: () => setHint('KEEP GOING'),
      onAttemptFailed: (n) => {
        loader.clearTrail();
        setHint(n === 1 ? 'TRACE THE R' : 'ALMOST — TRACE THE R');
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
        revealWelcome();
        window.setTimeout(() => {
          canvas.classList.add('is-removed');
          loaderUi.classList.add('is-removed');
          loader.dispose();
        }, 1000);
      },
    });

    function positionHint() {
      // guide is centred at (0.5, cy) with height hFrac of the viewport; place hint under it
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

    // Safety valve: if nothing happens 45s after ready, offer skip more prominently
    window.setInterval(() => {
      if (!done && readyAt && performance.now() - readyAt > 45000) showSkip();
    }, 5000);
  });
}
