import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { fullscreenVert, trailFrag, frostFrag } from './shaders';
import { HandController } from './HandController';
import { RGesture } from './RGesture';

export interface LoaderOptions {
  canvas: HTMLCanvasElement;
  handUrl: string;
  frostUrl: string;
  frostNormalUrl: string;
  /** extra URLs to warm the browser cache with (scene images) */
  preload?: string[];
  onProgress?: (p: number) => void;
  onReadyToDraw?: () => void;
  onNearComplete?: () => void;
  onAttemptFailed?: (n: number) => void;
  onComplete?: () => void;
  onWhite?: () => void;
}

const TRAIL_SCALE = 0.5;

export class Loader {
  private opts: LoaderOptions;
  private renderer: THREE.WebGLRenderer;
  private w = 1;
  private h = 1;
  private dpr = 1;

  // fullscreen passes
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private trailMat: THREE.ShaderMaterial;
  private frostMat: THREE.ShaderMaterial;
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;

  // hand
  private handScene = new THREE.Scene();
  private handCam = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  private hand: HandController | null = null;

  // guide
  private guideCanvas = document.createElement('canvas');
  private guideTex: THREE.CanvasTexture;

  gesture = new RGesture();

  private cursor = new THREE.Vector2(0.5, 0.5);
  private prevCursor = new THREE.Vector2(0.5, 0.5);
  private cursorActive = 0;
  private pointerDown = false;
  private hasPointer = false;
  private lastMoveX = 0;
  private lastMoveT = 0;
  private velX = 0;
  private isTouch = false;
  private fadeBoostUntil = 0;

  private raf = 0;
  private clock = new THREE.Clock();
  private state: 'loading' | 'ready' | 'complete' | 'done' = 'loading';
  private disposed = false;

  private progressShown = { value: 0 };
  private progressTarget = 0;
  private progressTween: gsap.core.Tween | null = null;

  constructor(opts: LoaderOptions) {
    this.opts = opts;
    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0xffffff, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    const geo = new THREE.PlaneGeometry(2, 2);
    this.trailMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: trailFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPrevTrail: { value: null },
        uCursorUV: { value: new THREE.Vector2(0.5, 0.5) },
        uPrevCursorUV: { value: new THREE.Vector2(0.5, 0.5) },
        uCursorActive: { value: 0 },
        uHeadActive: { value: 0 },
        uCursorRadius: { value: 0.03 },
        uAspect: { value: 1 },
        uFade: { value: 0.997 },
        uHeadFade: { value: 0.86 },
        uReset: { value: 0 },
      },
    });
    this.frostMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: frostFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTrail: { value: null },
        uFrostTex: { value: null },
        uFrostNormal: { value: null },
        uGuide: { value: null },
        uHasGuide: { value: 0 },
        uGuideOpacity: { value: 0 },
        uFrostScale: { value: new THREE.Vector2(1, 1) },
        uGuideScale: { value: new THREE.Vector2(1, 1) },
        uAspect: { value: 1 },
        uTime: { value: 0 },
        uLoadProgress: { value: 0 },
        uMelt: { value: 0 },
        uMeltCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uWhiteout: { value: 0 },
      },
    });
    this.quad = new THREE.Mesh(geo, this.trailMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.rtA = new THREE.WebGLRenderTarget(2, 2, rtOpts);
    this.rtB = new THREE.WebGLRenderTarget(2, 2, rtOpts);

    this.guideTex = new THREE.CanvasTexture(this.guideCanvas);
    this.guideTex.colorSpace = THREE.NoColorSpace;
    this.frostMat.uniforms.uGuide.value = this.guideTex;

    // hand lighting
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.handScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-1.5, 2.5, 2.5);
    const fill = new THREE.DirectionalLight(0xfff1e6, 0.5);
    fill.position.set(2, 0.5, 1.5);
    const rim = new THREE.DirectionalLight(0xe8f0ff, 0.6);
    rim.position.set(0.5, 1, -2);
    this.handScene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 0.35));
    this.handCam.position.set(0, 0, 0);

    this.gesture.onNearComplete = () => this.opts.onNearComplete?.();
    this.gesture.onAttemptFailed = (n) => this.opts.onAttemptFailed?.(n);
    this.gesture.onComplete = (c) => this.complete(c);

    this.resize();
    window.addEventListener('resize', this.resize);
    this.bindPointer();
    this.loop();
    this.load();
  }

  /* ---------------- Loading ---------------- */

  private async load() {
    const texLoader = new THREE.TextureLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('/draco/');
    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(draco);
    const total = 3 + (this.opts.preload?.length ?? 0);
    let done = 0;
    const tick = () => {
      done++;
      this.setProgress(0.12 + (done / total) * 0.83);
    };

    this.setProgress(0.12);

    const frostP = texLoader.loadAsync(this.opts.frostUrl).then((t) => {
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.colorSpace = THREE.NoColorSpace;
      this.frostMat.uniforms.uFrostTex.value = t;
      this.updateCoverScale();
      tick();
      return t;
    });
    const normalP = texLoader
      .loadAsync(this.opts.frostNormalUrl)
      .then((t) => {
        t.colorSpace = THREE.NoColorSpace;
        t.generateMipmaps = false;
        t.minFilter = THREE.LinearFilter;
        this.frostMat.uniforms.uFrostNormal.value = t;
        tick();
      })
      .catch(() => {
        // flat normal fallback
        const d = new Uint8Array([128, 128, 255, 255]);
        const t = new THREE.DataTexture(d, 1, 1);
        t.needsUpdate = true;
        this.frostMat.uniforms.uFrostNormal.value = t;
        tick();
      });
    const handP = gltfLoader
      .loadAsync(this.opts.handUrl)
      .then((gltf) => {
        const model = gltf.scene;
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = false;
            m.receiveShadow = false;
            const mat = m.material as THREE.MeshStandardMaterial;
            if (mat && 'roughness' in mat) {
              mat.roughness = Math.min(1, Math.max(0.45, mat.roughness ?? 0.6));
              mat.metalness = 0;
              mat.envMapIntensity = 0.7;
            }
          }
        });
        this.hand = new HandController(model, this.handCam, { heightFrac: 0.66, distance: 2.2 });
        this.handScene.add(this.hand.group);
        tick();
      })
      .catch((e) => {
        console.warn('[loader] hand model failed to load', e);
        tick();
      });

    const preloads = (this.opts.preload ?? []).map(
      (url) =>
        new Promise<void>((res) => {
          const img = new Image();
          img.onload = img.onerror = () => {
            tick();
            res();
          };
          img.src = url;
        }),
    );

    await Promise.all([frostP, normalP, handP, ...preloads]);
    this.setProgress(1);
  }

  private setProgress(p: number) {
    this.progressTarget = Math.max(this.progressTarget, Math.min(1, p));
    const remaining = Math.max(0, 1 - this.progressShown.value);
    const dur = Math.max(remaining * 1.8, 0.6);
    this.progressTween?.kill();
    this.progressTween = gsap.to(this.progressShown, {
      value: this.progressTarget,
      duration: dur,
      ease: 'power1.out',
      overwrite: true,
      onUpdate: () => {
        this.frostMat.uniforms.uLoadProgress.value = this.progressShown.value;
        this.opts.onProgress?.(this.progressShown.value);
      },
      onComplete: () => {
        if (this.progressShown.value >= 0.999 && this.state === 'loading') this.becomeReady();
      },
    });
  }

  private becomeReady() {
    this.state = 'ready';
    this.opts.onReadyToDraw?.();
    this.hand?.enter();
    gsap.to(this.frostMat.uniforms.uGuideOpacity, { value: 1, duration: 1.2, ease: 'power2.out', delay: 0.3 });
    this.gesture.ready = true;
  }

  /* ---------------- Guide ---------------- */

  private drawGuide() {
    const scale = 0.5;
    const cw = Math.max(2, Math.floor(this.w * scale));
    const ch = Math.max(2, Math.floor(this.h * scale));
    this.guideCanvas.width = cw;
    this.guideCanvas.height = ch;
    const ctx = this.guideCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, cw, ch);

    const mobile = this.w < 768;
    const hFrac = mobile ? 0.34 : 0.42;
    const cy = mobile ? 0.42 : 0.46;
    this.gesture.layoutGuide(0.5, cy, hFrac);

    // the guide is stored in (px / H) units
    const H = this.h;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = Math.max(6, hFrac * H * 0.085) * scale;
    ctx.setLineDash([]);
    for (const s of this.gesture.guide) {
      ctx.beginPath();
      s.forEach((p, i) => {
        const x = p.x * H * scale;
        const y = p.y * H * scale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    // canvas y is down; texture uv y is up -> flip via flipY (default true for CanvasTexture)
    this.guideTex.needsUpdate = true;
    this.frostMat.uniforms.uHasGuide.value = 1;
  }

  /* ---------------- Sizing ---------------- */

  private resize = () => {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.w, this.h, false);
    const aspect = this.w / this.h;
    this.trailMat.uniforms.uAspect.value = aspect;
    this.frostMat.uniforms.uAspect.value = aspect;
    this.handCam.aspect = aspect;
    this.handCam.updateProjectionMatrix();
    const tw = Math.max(2, Math.floor(this.w * this.dpr * TRAIL_SCALE));
    const th = Math.max(2, Math.floor(this.h * this.dpr * TRAIL_SCALE));
    this.rtA.setSize(tw, th);
    this.rtB.setSize(tw, th);
    this.trailMat.uniforms.uReset.value = 1; // clear trail on resize
    this.trailMat.uniforms.uCursorRadius.value = this.w < 768 ? 0.05 : 0.032;
    this.gesture.setViewport(this.w, this.h);
    this.updateCoverScale();
    this.drawGuide();
  };

  private updateCoverScale() {
    const t = this.frostMat.uniforms.uFrostTex.value as THREE.Texture | null;
    const img = t?.image as { width?: number; height?: number } | undefined;
    const texAspect = img?.width && img?.height ? img.width / img.height : 16 / 9;
    const viewAspect = this.w / this.h;
    // "cover" fit
    const v = this.frostMat.uniforms.uFrostScale.value as THREE.Vector2;
    if (viewAspect > texAspect) v.set(1, texAspect / viewAspect);
    else v.set(viewAspect / texAspect, 1);
  }

  /* ---------------- Pointer ---------------- */

  private bindPointer() {
    const c = this.opts.canvas;
    c.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove, { passive: true });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Quickly fade the current trail (after a failed attempt). */
  clearTrail() {
    this.fadeBoostUntil = performance.now() + 700;
  }

  private onDown = (e: PointerEvent) => {
    if (this.state !== 'ready') return;
    this.isTouch = e.pointerType === 'touch';
    this.pointerDown = true;
    this.setCursorFromEvent(e, true);
    this.gesture.pointerDown(e.clientX, e.clientY);
  };
  private onMove = (e: PointerEvent) => {
    this.setCursorFromEvent(e, false);
    if (this.pointerDown) this.gesture.pointerMove(e.clientX, e.clientY);
    const t = performance.now();
    if (this.lastMoveT) {
      const dt = Math.max(1, t - this.lastMoveT);
      const v = ((e.clientX - this.lastMoveX) / dt) * 1000;
      this.velX = this.velX * 0.6 + v * 0.4;
    }
    this.lastMoveX = e.clientX;
    this.lastMoveT = t;
  };
  private onUp = () => {
    if (!this.pointerDown) return;
    this.pointerDown = false;
    this.gesture.pointerUp();
  };

  private setCursorFromEvent(e: PointerEvent, snap: boolean) {
    const u = e.clientX / this.w;
    const v = 1 - e.clientY / this.h;
    if (snap || !this.hasPointer) this.prevCursor.set(u, v);
    this.cursor.set(u, v);
    this.hasPointer = true;
    this.hand?.setCursor(u * 2 - 1, v * 2 - 1);
  }

  /* ---------------- Completion ---------------- */

  private complete(center: { x: number; y: number }) {
    if (this.state !== 'ready') return;
    this.state = 'complete';
    this.opts.onComplete?.();
    (this.frostMat.uniforms.uMeltCenter.value as THREE.Vector2).set(center.x, center.y);
    this.hand?.exit();
    gsap.to(this.frostMat.uniforms.uGuideOpacity, { value: 0, duration: 0.5 });
    const tl = gsap.timeline({
      onComplete: () => {
        this.state = 'done';
        this.opts.onWhite?.();
      },
    });
    tl.to(this.frostMat.uniforms.uMelt, { value: 2.2, duration: 1.5, ease: 'power2.inOut' }, 0.15);
    tl.to(this.frostMat.uniforms.uWhiteout, { value: 1, duration: 0.9, ease: 'power2.in' }, 0.9);
  }

  /** Programmatic completion (skip button). */
  skip() {
    if (this.state === 'loading') {
      this.progressTween?.kill();
      this.progressShown.value = 1;
      this.frostMat.uniforms.uLoadProgress.value = 1;
      this.becomeReady();
    }
    this.gesture.isComplete = true;
    this.complete({ x: 0.5, y: 0.5 });
  }

  /* ---------------- Frame ---------------- */

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.frostMat.uniforms.uTime.value += dt;

    // cursor state
    const active = this.state === 'ready' && this.pointerDown ? 1 : 0;
    this.cursorActive += (active - this.cursorActive) * 0.5;

    // trail ping-pong
    const tu = this.trailMat.uniforms;
    tu.uPrevTrail.value = this.rtA.texture;
    (tu.uCursorUV.value as THREE.Vector2).copy(this.cursor);
    (tu.uPrevCursorUV.value as THREE.Vector2).copy(this.prevCursor);
    tu.uCursorActive.value = this.state === 'ready' && this.pointerDown ? 1 : 0;
    tu.uHeadActive.value = this.state === 'ready' && this.hasPointer && !this.isTouch ? 1 : 0;
    if (this.fadeBoostUntil > performance.now()) tu.uFade.value = 0.9;
    else tu.uFade.value = 0.997;
    this.quad.material = this.trailMat;
    this.renderer.setRenderTarget(this.rtB);
    this.renderer.render(this.quadScene, this.quadCam);
    this.renderer.setRenderTarget(null);
    tu.uReset.value = 0;
    // swap
    const tmp = this.rtA;
    this.rtA = this.rtB;
    this.rtB = tmp;
    this.prevCursor.copy(this.cursor);

    // frost composite
    this.frostMat.uniforms.uTrail.value = this.rtA.texture;
    this.quad.material = this.frostMat;
    this.renderer.autoClear = true;
    this.renderer.render(this.quadScene, this.quadCam);

    // hand on top
    if (this.hand) {
      this.hand.setVelocityTilt(this.velX);
      this.velX *= 0.9;
      this.hand.update();
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.handScene, this.handCam);
      this.renderer.autoClear = true;
    }
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    this.opts.canvas.removeEventListener('pointerdown', this.onDown);
    this.hand?.dispose();
    this.rtA.dispose();
    this.rtB.dispose();
    this.trailMat.dispose();
    this.frostMat.dispose();
    this.guideTex.dispose();
    this.renderer.dispose();
  }
}
