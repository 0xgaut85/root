import * as THREE from 'three';

export interface TextBeat {
  /** local chapter progress window in which the beat is visible */
  from: number;
  to: number;
  /** inner HTML; <em> renders in the serif */
  html: string;
  /** optional mono eyebrow above the headline */
  eyebrow?: string;
  /** optional body copy below */
  body?: string;
  /** position as fraction of viewport (0..1), default centre */
  x?: number;
  y?: number;
  align?: 'left' | 'center' | 'right';
  /** size class: 'xl' | 'l' | 'm' */
  size?: 'xl' | 'l' | 'm';
  /** use light text (for dark chapters) - default derived from chapter */
  light?: boolean;
  /** extra HTML appended (e.g. buttons) */
  extra?: string;
  /** extra class on the beat element */
  className?: string;
  /** full custom markup: replaces eyebrow/title/body/extra entirely */
  raw?: string;
  /** full-viewport beat: no centring transform, no zoom/drift, only the fade */
  fixed?: boolean;
}

export interface ChapterContext {
  renderer: THREE.WebGLRenderer;
  width: number;
  height: number;
  dpr: number;
  /** viewport-normalised pointer, -1..1 (y up), eased */
  pointer: THREE.Vector2;
  reduceMotion: boolean;
  mobile: boolean;
  assets: Map<string, unknown>;
}

export interface ChapterFrame {
  /** local progress 0..1 (may slightly exceed during transitions) */
  t: number;
  /** seconds since start */
  time: number;
  dt: number;
  /** scroll velocity in chapters/second */
  velocity: number;
}

export abstract class Chapter {
  abstract readonly id: string;
  abstract readonly label: string;
  /** dark chapters flip UI to light text */
  abstract readonly dark: boolean;
  /** colour the transition flashes through when entering this chapter */
  abstract readonly flash: THREE.Color;
  abstract readonly beats: TextBeat[];
  /** average colour, for background/clear while assets load */
  abstract readonly clear: THREE.Color;
  /** film grain strength for the composite pass (0..~0.4) */
  grain = 0.06;
  vignette = 0.3;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  /** base fov, chapters may animate camera.fov from this */
  fov = 40;
  protected ctx!: ChapterContext;

  init(ctx: ChapterContext) {
    this.ctx = ctx;
    this.camera.fov = this.fov;
    this.resize(ctx.width, ctx.height);
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  abstract update(f: ChapterFrame): void;

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null) {
    renderer.setRenderTarget(target);
    renderer.setClearColor(this.clear, 1);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  /** called when the chapter becomes visible (for videos etc.) */
  enter() {}
  leave() {}
  /** called when the previous chapter becomes active: start streaming heavy media */
  prefetch() {}

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }
}

/* ---------- small helpers shared by chapters ---------- */

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Simple 3D value noise-ish hash for CPU side jitter */
export function hash(n: number) {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export const GLSL_NOISE = /* glsl */ `
  float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){
    vec2 i = floor(p); vec2 f = fract(p);
    float a = hash21(i), b = hash21(i+vec2(1.,0.)), c = hash21(i+vec2(0.,1.)), d = hash21(i+vec2(1.,1.));
    vec2 u = f*f*(3.-2.*f);
    return mix(a,b,u.x) + (c-a)*u.y*(1.-u.x) + (d-b)*u.x*u.y;
  }
  float fbm(vec2 p){
    float v = 0.; float a = .5;
    for(int i=0;i<5;i++){ v += a*vnoise(p); p = p*2.03 + vec2(1.7, 9.2); a *= .5; }
    return v;
  }
`;
