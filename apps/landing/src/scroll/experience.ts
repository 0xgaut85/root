import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;

export function initSmoothScroll() {
  if (lenis) return lenis;
  lenis = new Lenis({
    lerp: 0.085,
    smoothWheel: true,
    syncTouch: false,
    wheelMultiplier: 0.9,
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

export function stopScroll() {
  lenis?.stop();
}
export function startScroll() {
  lenis?.start();
}

/** Scroll-driven frames: each pinned scene zooms slowly while the next slides over it. */
export function initFrames(root: HTMLElement) {
  const frames = Array.from(root.querySelectorAll<HTMLElement>('[data-frame]'));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  frames.forEach((frame) => {
    const media = frame.querySelector<HTMLElement>('[data-media]')!;
    const content = frame.querySelector<HTMLElement>('[data-content]')!;
    const items = Array.from(content.children) as HTMLElement[];
    const progress = frame.querySelector<HTMLElement>('[data-progress]')!;
    const video = frame.querySelector<HTMLVideoElement>('[data-video]');

    // slow zoom across the whole pinned range
    gsap.fromTo(
      media,
      { scale: 1 },
      {
        scale: reduce ? 1 : 1.16,
        ease: 'none',
        scrollTrigger: {
          trigger: frame,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      },
    );

    // content reveal once the frame is settled
    gsap.fromTo(
      items,
      { opacity: 0, y: 28 },
      {
        opacity: 1,
        y: 0,
        stagger: 0.08,
        ease: 'power3.out',
        duration: 1,
        scrollTrigger: {
          trigger: frame,
          start: 'top 45%',
          toggleActions: 'play none none reverse',
        },
      },
    );

    // progress hairline + video playback management
    ScrollTrigger.create({
      trigger: frame,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => progress.style.setProperty('--p', self.progress.toFixed(3)),
    });

    if (video) {
      ScrollTrigger.create({
        trigger: frame,
        start: 'top bottom',
        end: 'bottom top',
        onEnter: () => void video.play().catch(() => {}),
        onEnterBack: () => void video.play().catch(() => {}),
        onLeave: () => video.pause(),
        onLeaveBack: () => video.pause(),
      });
    }
  });

  // Nav background once we leave the welcome section
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  if (nav) {
    ScrollTrigger.create({
      start: 40,
      onUpdate: (self) => nav.classList.toggle('is-scrolled', self.scroll() > 40),
    });
  }

  // CTA reveal
  const cta = document.querySelector<HTMLElement>('[data-cta] .cta__inner');
  if (cta) {
    gsap.fromTo(
      Array.from(cta.children),
      { opacity: 0, y: 30 },
      {
        opacity: 1,
        y: 0,
        stagger: 0.1,
        duration: 1.1,
        ease: 'power3.out',
        scrollTrigger: { trigger: cta, start: 'top 75%' },
      },
    );
  }

  ScrollTrigger.refresh();
}
