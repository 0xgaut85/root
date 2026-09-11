import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { Chapter, ChapterContext } from './Chapter';
import { Scroller } from './Scroller';
import { Overlay } from './Overlay';

const TRANSITION = 0.16; // fraction of a chapter used to zoom through to the next one

const compositeVert = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`;

const compositeFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tA;
  uniform sampler2D tB;
  uniform float uMix;       // 0..1 transition progress
  uniform vec3 uFlash;      // colour to flash through
  uniform float uTime;
  uniform vec2 uRes;
  uniform float uGrain;
  uniform float uVignette;
  uniform float uEnter;     // 0..1 overall fade-in from white at start

  float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

  vec3 zoomBlur(sampler2D t, vec2 uv, float zoom, float strength){
    vec2 c = vec2(0.5);
    vec2 d = (uv - c);
    vec2 base = c + d / zoom;
    vec3 acc = vec3(0.);
    float w = 0.;
    for(int i=0;i<10;i++){
      float f = float(i)/9.0;
      float s = 1.0 - strength*f;
      vec2 p = c + (base - c)*s;
      float wt = 1.0 - f*0.6;
      acc += texture2D(t, p).rgb*wt; w += wt;
    }
    return acc/w;
  }

  void main(){
    vec2 uv = vUv;
    float m = uMix;
    float e = smoothstep(0., 1., m);

    // outgoing frame pushes forward (grows) and streaks; incoming frame arrives slightly smaller and settles
    float zoomA = 1.0 + e*0.65;
    float blurA = e*(1.0-e)*0.9 + e*0.25;
    vec3 a = zoomBlur(tA, uv, zoomA, blurA*0.35);
    float zoomB = 0.90 + e*0.10;
    float blurB = (1.0-e)*0.35;
    vec3 b = zoomBlur(tB, uv, zoomB, blurB*0.35);

    // dissolve with a soft radial front so the centre changes first (feels like passing through)
    float r = length(uv - 0.5);
    float front = smoothstep(0.0, 1.0, (e*1.6 - r*0.9));
    vec3 col = mix(a, b, front);

    // flash through the chapter's colour around the midpoint
    float flash = pow(sin(clamp(m, 0., 1.)*3.14159), 3.0) * 0.72;
    col = mix(col, uFlash, flash);

    // film grain (animated, luminance-aware, applied in linear light so it stays subtle on white)
    float g = hash(uv*uRes + fract(uTime*7.13)*100.0) - 0.5;
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col += g * uGrain * (0.35 + 0.65*(1.0 - abs(lum*2.0-1.0))) * (0.4 + 0.6*lum);

    // vignette
    float vig = smoothstep(0.95, 0.35, r);
    col = mix(col, col*vig, uVignette);

    // initial reveal from white
    col = mix(vec3(1.0), col, uEnter);

    // linear -> sRGB (render targets hold linear light)
    col = clamp(col, 0.0, 1.0);
    col = mix(1.055*pow(col, vec3(1.0/2.4)) - 0.055, col*12.92, step(col, vec3(0.0031308)));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export interface ExperienceOptions {
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  chapters: Chapter[];
  onChapter?: (index: number, chapter: Chapter) => void;
  onProgress?: (p: number, max: number) => void;
  onFirstScroll?: () => void;
}

export class Experience {
  renderer: THREE.WebGLRenderer;
  scroller: Scroller;
  overlay: Overlay;
  chapters: Chapter[];
  ctx: ChapterContext;
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private compScene = new THREE.Scene();
  private compCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private compMat: THREE.ShaderMaterial;
  private raf = 0;
  private clock = new THREE.Clock();
  private time = 0;
  private active = -1;
  private running = false;
  private enter = 0;
  private pointerTarget = new THREE.Vector2();
  private opts: ExperienceOptions;
  private firstScrollFired = false;
  private prepared = false;

  constructor(opts: ExperienceOptions) {
    this.opts = opts;
    this.chapters = opts.chapters;
    const renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping; // colour handled in the composite pass
    renderer.autoClear = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(dpr);
    this.renderer = renderer;

    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    const rtOpts: THREE.RenderTargetOptions = {
      depthBuffer: true,
      stencilBuffer: false,
      samples: 4,
      type: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
    };
    this.rtA = new THREE.WebGLRenderTarget(w * dpr, h * dpr, rtOpts);
    this.rtB = new THREE.WebGLRenderTarget(w * dpr, h * dpr, rtOpts);

    this.compMat = new THREE.ShaderMaterial({
      vertexShader: compositeVert,
      fragmentShader: compositeFrag,
      uniforms: {
        tA: { value: this.rtA.texture },
        tB: { value: this.rtB.texture },
        uMix: { value: 0 },
        uFlash: { value: new THREE.Color('#ffffff') },
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(w * dpr, h * dpr) },
        uGrain: { value: 0.06 },
        uVignette: { value: 0.35 },
        uEnter: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.compScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compMat));

    this.ctx = {
      renderer,
      width: w,
      height: h,
      dpr,
      pointer: new THREE.Vector2(),
      reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      mobile: w < 768,
      assets: new Map(),
    };

    this.scroller = new Scroller(opts.canvas.parentElement || document.body, { chapters: this.chapters.length, pixelsPerChapter: this.ctx.mobile ? 1500 : 2000 });
    this.overlay = new Overlay(opts.overlay, this.chapters);

    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointermove', this.onPointer, { passive: true });
  }

  /** Load heavy assets before starting. Safe to call early (during the loader). */
  async preload(manifest: { glb?: Record<string, string>; textures?: Record<string, string> }) {
    const draco = new DRACOLoader();
    draco.setDecoderPath('/draco/');
    const gltf = new GLTFLoader();
    gltf.setDRACOLoader(draco);
    const tex = new THREE.TextureLoader();
    const jobs: Promise<void>[] = [];
    for (const [k, url] of Object.entries(manifest.glb || {})) {
      jobs.push(
        gltf
          .loadAsync(url)
          .then((g) => void this.ctx.assets.set(k, g.scene))
          .catch((e) => console.warn('glb failed', url, e)),
      );
    }
    for (const [k, url] of Object.entries(manifest.textures || {})) {
      jobs.push(
        tex
          .loadAsync(url)
          .then((t) => {
            t.colorSpace = THREE.SRGBColorSpace;
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            this.ctx.assets.set(k, t);
          })
          .catch((e) => console.warn('texture failed', url, e)),
      );
    }
    await Promise.all(jobs);
  }

  /** Build all chapters (needs assets). */
  prepare() {
    if (this.prepared) return;
    this.prepared = true;
    for (const c of this.chapters) c.init(this.ctx);
    // compile shaders up-front to avoid hitches on first transition
    for (const c of this.chapters) this.renderer.compile(c.scene, c.camera);

    // Upload every texture to the GPU now. compile() only builds programs; textures are
    // otherwise uploaded lazily on the first frame they are sampled, and the 4K plates
    // (olive, olive_bloom, library) each take tens of ms plus mipmap generation. That
    // upload used to land on the first frame of a transition — the hitch between chapters.
    const seen = new Set<THREE.Texture>();
    const upload = (v: unknown) => {
      const t = v as THREE.Texture | undefined;
      if (!t || !t.isTexture || seen.has(t)) return;
      if ((t as THREE.VideoTexture).isVideoTexture || !t.image) return; // streamed later, nothing to upload yet
      seen.add(t);
      this.renderer.initTexture(t);
    };
    for (const a of this.ctx.assets.values()) upload(a);
    const mapKeys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'envMap'];
    for (const c of this.chapters) {
      c.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
          const sm = mat as THREE.ShaderMaterial;
          if (sm.uniforms) for (const u of Object.values(sm.uniforms)) upload(u.value);
          for (const k of mapKeys) upload((mat as unknown as Record<string, unknown>)[k]);
        }
      });
    }
    // One warm-up frame per chapter into the off-screen target: creates the vertex arrays and
    // uploads the GLB buffers while the loader is still on screen instead of mid-scroll.
    for (const c of this.chapters) c.render(this.renderer, this.rtA);
    this.renderer.setRenderTarget(null);
  }

  start() {
    this.prepare();
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.scroller.enabled = true;
    this.loop();
  }

  /** Fade in from white (called once the loader hands over). */
  reveal(duration = 1.2) {
    const t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / (duration * 1000));
      this.enter = k * k * (3 - 2 * k);
      if (k < 1) requestAnimationFrame(tick);
    };
    tick();
  }

  private onPointer = (e: PointerEvent) => {
    this.pointerTarget.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
  };

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.rtA.setSize(w * dpr, h * dpr);
    this.rtB.setSize(w * dpr, h * dpr);
    (this.compMat.uniforms.uRes.value as THREE.Vector2).set(w * dpr, h * dpr);
    this.ctx.width = w;
    this.ctx.height = h;
    this.ctx.dpr = dpr;
    this.ctx.mobile = w < 768;
    for (const c of this.chapters) c.resize(w, h);
    this.overlay.resize();
  };

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.time += dt;

    this.scroller.update(dt);
    const p = this.scroller.value;
    if (!this.firstScrollFired && p > 0.02) {
      this.firstScrollFired = true;
      this.opts.onFirstScroll?.();
    }
    this.opts.onProgress?.(p, this.scroller.max);

    // eased pointer
    this.ctx.pointer.lerp(this.pointerTarget, 1 - Math.pow(0.9, dt * 60));

    const i = Math.min(this.chapters.length - 1, Math.floor(p));
    const t = p - i;
    const A = this.chapters[i];
    const hasNext = i < this.chapters.length - 1;
    const inTransition = hasNext && t > 1 - TRANSITION;
    const mix = inTransition ? (t - (1 - TRANSITION)) / TRANSITION : 0;
    const B = hasNext ? this.chapters[i + 1] : null;

    // active chapter bookkeeping (for videos, UI colour)
    const visibleIndex = mix > 0.5 && B ? i + 1 : i;
    if (visibleIndex !== this.active) {
      if (this.active >= 0) this.chapters[this.active].leave();
      this.active = visibleIndex;
      this.chapters[this.active].enter();
      this.chapters[this.active + 1]?.prefetch();
      this.opts.onChapter?.(this.active, this.chapters[this.active]);
    }

    const velocity = this.scroller.velocity;
    A.update({ t, time: this.time, dt, velocity });
    A.render(this.renderer, this.rtA);
    if (inTransition && B) {
      B.update({ t: t - 1, time: this.time, dt, velocity });
      B.render(this.renderer, this.rtB);
      (this.compMat.uniforms.uFlash.value as THREE.Color).copy(B.flash);
    }
    // also keep the previous chapter's transition symmetric when scrolling back:
    // (handled naturally since mix is a pure function of p)

    const u = this.compMat.uniforms;
    u.tA.value = this.rtA.texture;
    u.tB.value = inTransition ? this.rtB.texture : this.rtA.texture;
    u.uMix.value = mix;
    u.uTime.value = this.time;
    u.uEnter.value = this.enter;
    // grain / vignette blend across the transition
    const G = inTransition && B ? B : A;
    const gm = inTransition ? mix : 0;
    u.uGrain.value = A.grain + (G.grain - A.grain) * gm;
    u.uVignette.value = A.vignette + (G.vignette - A.vignette) * gm;

    this.renderer.setRenderTarget(null);
    this.renderer.render(this.compScene, this.compCam);

    this.overlay.update(p, this.time);
  };

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointer);
    this.scroller.dispose();
    for (const c of this.chapters) c.dispose();
    this.rtA.dispose();
    this.rtB.dispose();
    this.renderer.dispose();
  }
}
