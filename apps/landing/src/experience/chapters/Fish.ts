import * as THREE from 'three';
import { Chapter, ChapterFrame, TextBeat, GLSL_NOISE, smooth, lerp } from '../Chapter';

/**
 * the fish, cut out at eight points of its lap, in order: at the back (facing left), turning toward us
 * on the left, head on, turning right, at the front glass (facing right), turning away on the right,
 * tail on, turning back toward the left
 */
export const FISH_VIEWS = ['fish0', 'fish1', 'fish2', 'fish3', 'fish4', 'fish5', 'fish6', 'fish7'] as const;

/** the lap, in plate uv: centre of the bowl's water, and the half-axes of the fish's path */
const LAP_CENTRE: [number, number] = [0.498, 0.49];
const LAP_RX = 0.062;
const LAP_RY = 0.02;
/** the water inside the glass, in plate uv: centre and half-axes (the refraction and caustics live here) */
const WATER: [number, number, number, number] = [0.498, 0.453, 0.125, 0.19];
/** the fish's length at the middle of the bowl, as a fraction of the plate height */
const FISH_LEN = 0.28;
/** the cutouts were all taken at one scale: this many pixels is the fish's full length in profile */
const FISH_REF_PX = 860;

/**
 * Chapter 07 — the end. A clownfish in a bowl on a kitchen island, the camera at bowl level. The
 * fish swims a lap of its bowl as you scroll (and keeps drifting when you stop): a cutout carried
 * round an ellipse, growing as it comes to the front glass and shrinking at the back, dissolving
 * between four photographed views as it turns. The call to action sits beside the bowl.
 */
export class Fish extends Chapter {
  readonly id = 'fish';
  readonly label = 'Start';
  readonly dark = false;
  readonly flash = new THREE.Color('#ffffff');
  readonly clear = new THREE.Color('#e9e4dc');
  grain = 0.05;
  vignette = 0.2;
  readonly beats: TextBeat[] = [
    {
      from: 0.08,
      to: 1.6, // never fades out: this is the end of the page
      eyebrow: '06 \u2014 Start',
      html: 'Put your idle internet<br />to <em>work.</em>',
      size: 'xl',
      className: 'beat--fish',
      x: 0.25,
      y: 0.5,
      extra: `
        <div class="beat__actions">
          <a class="btn btn--primary" href="https://earn.rootnetwork.co">Start earning</a>
          <a class="btn btn--ghost" href="https://read.rootnetwork.co">Read the protocol</a>
        </div>
        <nav class="beat__footer" aria-label="Footer">
          <a href="https://read.rootnetwork.co">Protocol</a>
          <a href="https://earn.rootnetwork.co">App</a>
          <a href="https://x.com/rootnetworkco" rel="noopener" target="_blank">X</a>
          <a href="mailto:hello@rootnetwork.co">Contact</a>
          <span>\u00a9 ${new Date().getFullYear()} Root Network</span>
        </nav>`,
    },
  ];

  private mat!: THREE.ShaderMaterial;
  private views: THREE.Texture[] = [];
  /** each view's footprint relative to the fish's full length (a turned fish is shorter on screen) */
  private viewSize: THREE.Vector2[] = [];
  private plateAspect = 21 / 9;
  private prevLap = NaN;
  private speed = 0;

  init(ctx: Parameters<Chapter['init']>[0]) {
    super.init(ctx);
    const plate = ctx.assets.get('bowl') as THREE.Texture | undefined;
    if (plate) {
      plate.wrapS = plate.wrapT = THREE.ClampToEdgeWrapping;
      plate.anisotropy = 4;
      const img = plate.image as { width?: number; height?: number } | undefined;
      if (img?.width && img?.height) this.plateAspect = img.width / img.height;
    }
    for (const k of FISH_VIEWS) {
      const t = ctx.assets.get(k) as THREE.Texture | undefined;
      if (!t) continue;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.anisotropy = 4;
      const img = t.image as { width?: number; height?: number } | undefined;
      this.views.push(t);
      const w = img?.width ?? FISH_REF_PX;
      const h = img?.height ?? FISH_REF_PX / 2;
      this.viewSize.push(new THREE.Vector2(w / FISH_REF_PX, h / FISH_REF_PX));
    }
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: plate ?? null },
        uFishA: { value: this.views[0] ?? null },
        uFishB: { value: this.views[1] ?? this.views[0] ?? null },
        uFishMix: { value: 0 },
        uFishOn: { value: this.views.length ? 1 : 0 },
        uFishPos: { value: new THREE.Vector2(LAP_CENTRE[0], LAP_CENTRE[1]) },
        uFishSize: { value: new THREE.Vector2(FISH_LEN, FISH_LEN / 1.6) },
        uFishDepth: { value: 0.5 },
        uZoom: { value: 1 },
        uPan: { value: 0 },
        uAspect: { value: 1 },
        uPlateAspect: { value: this.plateAspect },
        uPointer: { value: new THREE.Vector2() },
        uShade: { value: 0 },
        uHazeSide: { value: 0 },
        uTime: { value: 0 },
        uFishVel: { value: new THREE.Vector2() },
        uWaterC: { value: new THREE.Vector2(WATER[0], WATER[1]) },
        uWaterR: { value: new THREE.Vector2(WATER[2], WATER[3]) },
      },
      depthTest: false,
      depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float; varying vec2 vUv;
        uniform sampler2D uMap, uFishA, uFishB;
        uniform float uFishMix, uFishOn, uFishDepth, uZoom, uPan, uAspect, uPlateAspect, uShade, uHazeSide, uTime;
        uniform vec2 uPointer, uFishPos, uFishSize, uFishVel, uWaterC, uWaterR;
        ${GLSL_NOISE}
        vec4 fish(vec2 fuv) {
          if (fuv.x <= 0.0 || fuv.x >= 1.0 || fuv.y <= 0.0 || fuv.y >= 1.0) return vec4(0.0);
          return mix(texture2D(uFishA, fuv), texture2D(uFishB, fuv), smoothstep(0.0, 1.0, uFishMix));
        }
        void main(){
          // cover-fit the wide plate, pan it so the bowl sits where the copy wants it, a slow push in
          vec2 uv = vUv - 0.5;
          if (uAspect > uPlateAspect) uv.y *= uPlateAspect / uAspect; else uv.x *= uAspect / uPlateAspect;
          uv = uv / uZoom + 0.5 - uPointer * 0.006;
          uv.x += uPan;

          // the water: inside the bowl the picture wobbles gently (refraction through moving water)
          // and faint caustic light drifts across; both fade out toward the glass
          vec2 wd = (uv - uWaterC) / uWaterR;
          float inWater = 1.0 - smoothstep(0.86, 1.0, length(wd));
          float t = uTime * 0.35;
          vec2 wob = vec2(vnoise(uv * vec2(18.0, 8.0) + vec2(t, -t * 0.7)), vnoise(uv * vec2(14.0, 9.0) + vec2(-t * 0.6, t * 0.9) + 31.7)) - 0.5;
          uv += wob * 0.0035 * inWater;
          float caustic = vnoise(uv * vec2(26.0, 12.0) + vec2(t * 1.3, t * 0.4)) * vnoise(uv * vec2(19.0, 10.0) - vec2(t * 0.8, t * 1.1) + 7.3);
          caustic = smoothstep(0.2, 0.42, caustic) * inWater;

          // phones pull back a little to fit the whole bowl: mirror the plate past its top and bottom
          vec2 puv = vec2(clamp(uv.x, 0.0, 1.0), uv.y < 0.0 ? -uv.y : (uv.y > 1.0 ? 2.0 - uv.y : uv.y));
          vec3 col = texture2D(uMap, puv).rgb;
          col += caustic * 0.07;

          if (uFishOn > 0.5) {
            // the fish: a sprite in plate space (x scaled by the plate aspect so it keeps its shape),
            // smeared along its direction of travel in proportion to its speed (motion blur)
            vec2 d = (uv - uFishPos) * vec2(uPlateAspect, 1.0);
            vec4 f = vec4(0.0);
            for (int k = 0; k < 7; k++) {
              float s = (float(k) - 3.0) / 3.0;
              f += fish((d - uFishVel * s) / uFishSize + 0.5) * (1.0 - abs(s) * 0.55);
            }
            f /= 4.35;
            if (f.a > 0.002) {
              // deeper in the bowl: a little paler and bluer, like water in the way
              vec3 water = vec3(0.80, 0.86, 0.90);
              f.rgb = mix(f.rgb, f.rgb * 0.9 + water * 0.1 * (1.0 - uFishDepth), (1.0 - uFishDepth) * 0.45);
              col = mix(col, f.rgb, f.a);
              // put the glass back on top: the bowl's highlights and reflections over the fish
              vec3 glass = texture2D(uMap, puv).rgb;
              col += max(glass - 0.72, 0.0) * 0.9 * f.a;
            }
          }
          // a breath of white haze behind the copy (left of the frame on wide screens, the bottom on phones)
          float where = mix(smoothstep(0.62, 0.0, vUv.y), smoothstep(0.58, 0.04, vUv.x), uHazeSide);
          col = mix(col, vec3(1.0), where * uShade);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.camera.position.set(0, 0, 10);
  }

  update(f: ChapterFrame) {
    const t = f.t;
    const u = this.mat.uniforms;
    const aspect = this.camera.aspect;
    u.uAspect.value = aspect;

    // one lap of the bowl over the scroll, plus a slow drift so it never hangs still
    const lap = smooth(0.0, 0.85, t) * Math.PI * 2 + f.time * 0.14;
    // theta 0 = the back of the bowl, pi/2 = coming round the left, pi = the front glass, 3pi/2 = going round the right
    const th = ((lap % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const depth = 0.5 - Math.cos(th) * 0.5; // 0 at the back, 1 at the front
    const bob = Math.sin(f.time * 0.9) * 0.004;
    (u.uFishPos.value as THREE.Vector2).set(LAP_CENTRE[0] - Math.sin(th) * LAP_RX, LAP_CENTRE[1] + Math.cos(th) * LAP_RY + bob);
    // how fast it is going round (smoothed): the blur streaks along the tangent of the lap
    const dl = Number.isFinite(this.prevLap) ? lap - this.prevLap : 0;
    this.prevLap = lap;
    this.speed += (Math.max(-0.2, Math.min(0.2, dl)) - this.speed) * 0.15;
    const tx = -Math.cos(th) * LAP_RX * this.plateAspect; // d(pos)/d(theta), in the sprite's aspect-corrected space
    const ty = -Math.sin(th) * LAP_RY;
    (u.uFishVel.value as THREE.Vector2).set(tx * this.speed * 2.2, ty * this.speed * 2.2);
    u.uTime.value = f.time;
    const n = this.views.length;
    if (n) {
      const seg = (th / (Math.PI * 2)) * n;
      const i = Math.floor(seg) % n;
      const j = (i + 1) % n;
      u.uFishA.value = this.views[i];
      u.uFishB.value = this.views[j];
      // hold each view a little, then dissolve into the next before the lap reaches it
      u.uFishMix.value = smooth(0.4, 1.0, seg - i);
      const len = FISH_LEN * lerp(0.78, 1.22, depth);
      const m = u.uFishMix.value as number;
      const a = this.viewSize[i], b = this.viewSize[j];
      (u.uFishSize.value as THREE.Vector2).set(len * lerp(a.x, b.x, m), len * lerp(a.y, b.y, m));
    }
    u.uFishDepth.value = depth;

    // on wide screens slide the bowl to the right so the copy has the left of the frame
    const visible = Math.min(1, aspect / this.plateAspect);
    const slack = (1 - visible) / 2;
    u.uPan.value = this.ctx.mobile ? 0 : -Math.min(slack, 0.11) * smooth(0.0, 0.25, t);
    u.uZoom.value = (this.ctx.mobile ? 0.84 : 1) + smooth(-0.3, 1.0, t) * 0.08 + Math.sin(f.time * 0.15) * 0.004;
    (u.uPointer.value as THREE.Vector2).set(this.ctx.pointer.x, this.ctx.pointer.y);
    u.uHazeSide.value = this.ctx.mobile ? 0 : 1;
    u.uShade.value = lerp(0.0, this.ctx.mobile ? 0.55 : 0.5, smooth(0.0, 0.2, t));
  }
}
