import * as THREE from 'three';
import { Chapter, ChapterFrame, TextBeat, GLSL_NOISE, smooth } from '../Chapter';

/**
 * Chapter 03 — an olive tree in a meadow that comes into blossom as you scroll,
 * branch by branch; then the picture lifts away on a clean cut and underneath
 * is the network seen through a thermal camera: a slow, heavily grained field
 * of heat, blue through crimson to hot yellow, its colours always on the move.
 */
export class Roots extends Chapter {
  readonly id = 'roots';
  readonly label = 'Protocol';
  readonly dark = true;
  readonly flash = new THREE.Color('#12040a');
  readonly clear = new THREE.Color('#060304');
  grain = 0.085;
  vignette = 0.5;
  readonly beats: TextBeat[] = [
    {
      from: 0.02,
      to: 0.3,
      eyebrow: '02 \u2014 Protocol',
      html: 'Above ground,<br />one <em>tree.</em>',
      size: 'l',
      y: 0.78,
    },
    {
      from: 0.5,
      to: 0.7,
      html: 'Below it, one protocol.<br />Ten thousand <em>roots.</em>',
      size: 'l',
    },
    {
      from: 0.74,
      to: 0.94,
      html: 'Every home becomes<br />a <em>node.</em>',
      body: 'No servers to run. Install Root, keep browsing, and your idle capacity joins the network.',
      size: 'l',
    },
  ];

  private treeMat!: THREE.ShaderMaterial;
  private heatMat!: THREE.ShaderMaterial;
  init(ctx: Parameters<Chapter['init']>[0]) {
    super.init(ctx);

    // ---- the tree: a photograph laid over everything. Scrolling lifts the picture up and out of
    // frame on a hard edge, and what is underneath shows. Two plates of the same tree, bare and in
    // blossom: the scroll dissolves one into the other along the branches, from a few points
    // outward, so the crown blooms branch by branch.
    const olive = ctx.assets.get('olive') as THREE.Texture | undefined;
    const bloom = ctx.assets.get('oliveBloom') as THREE.Texture | undefined;
    let plateAspect = 16 / 9;
    for (const tex of [olive, bloom]) {
      if (!tex) continue;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = 4;
    }
    if (olive) {
      const img = olive.image as { width?: number; height?: number } | undefined;
      if (img?.width && img?.height) plateAspect = img.width / img.height;
    }
    this.treeMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: olive ?? null },
        uBloom: { value: bloom ?? olive ?? null },
        uBloomT: { value: 0 },
        uPan: { value: 0 },
        uShift: { value: 0 },
        uZoom: { value: 1 },
        uAspect: { value: 1 },
        uPlateAspect: { value: plateAspect },
        uTime: { value: 0 },
        uPointer: { value: new THREE.Vector2() },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float; varying vec2 vUv;
        uniform sampler2D uMap, uBloom; uniform float uBloomT, uShift, uZoom, uPan, uAspect, uPlateAspect, uTime; uniform vec2 uPointer;
        ${GLSL_NOISE}
        // distance to the nearest of the points where the blossom starts on the crown (plate uv):
        // the ends of a few branches
        float nearSeed(vec2 p){
          float d = length(p - vec2(0.34, 0.66));
          d = min(d, length(p - vec2(0.62, 0.74)));
          d = min(d, length(p - vec2(0.48, 0.86)));
          d = min(d, length(p - vec2(0.7, 0.5)));
          d = min(d, length(p - vec2(0.4, 0.47)));
          return d;
        }
        void main(){
          // cover-fit the photograph, then a slow push in and a little parallax against the pointer
          vec2 uv = vUv - 0.5;
          if (uAspect > uPlateAspect) uv.y *= uPlateAspect / uAspect; else uv.x *= uAspect / uPlateAspect;
          uv = uv / uZoom + 0.5 - uPointer * 0.012;
          uv.x += uPan;
          // the lift: the whole picture travels up and out of frame; below its bottom edge there is
          // only what lies underneath. A clean cut.
          uv.y -= uShift;
          float below = -uv.y; // >0 once we are under the picture
          vec2 suv = clamp(uv, 0.0, 1.0);
          vec3 bare = texture2D(uMap, suv).rgb;
          vec3 flower = texture2D(uBloom, suv).rgb;
          // the bloom: a front that spreads out from each seed along the crown, its edge broken up by
          // noise at the scale of the blossom clusters so it opens in clumps, not as a wipe
          float near = nearSeed(suv * vec2(uPlateAspect, 1.0)) ;
          float clump = vnoise(suv * vec2(uPlateAspect, 1.0) * 28.0) * 0.6 + vnoise(suv * vec2(uPlateAspect, 1.0) * 90.0) * 0.4;
          float front = uBloomT * 0.9 - near - (clump - 0.5) * 0.22;
          float open = smoothstep(-0.03, 0.03, front);
          vec3 pic = mix(bare, flower, open);
          // the picture dims a little as it leaves so the eye is already on what is underneath
          vec3 col = pic * (1.0 - smoothstep(0.0, 1.0, uShift) * 0.35);
          // the cut: one hard, anti-aliased edge
          float alpha = 1.0 - smoothstep(-0.002, 0.002, below);
          // and a soft frame so the photo never reads as a flat rectangle
          float vig = smoothstep(1.15, 0.45, length((vUv - 0.5) * vec2(1.15, 1.0)) * 1.3);
          col *= mix(0.72, 1.0, vig);
          // the meadow is pale; settle it down so the headline sitting on it stays legible
          col *= 1.0 - smoothstep(0.5, 0.0, vUv.y) * 0.38 * (1.0 - uShift);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    const tree = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.treeMat);
    tree.frustumCulled = false;
    tree.renderOrder = 50;
    this.scene.add(tree);

    // ---- under the picture: the network as a thermal camera sees it. A slow field of heat, cold
    // blue through crimson and orange to a hot yellow, that drifts and churns with time and with
    // the scroll, under heavy film grain that shifts the colour pixel by pixel.
    this.heatMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uScroll: { value: 0 },
        uAspect: { value: 1 },
        uPointer: { value: new THREE.Vector2() },
        uRes: { value: new THREE.Vector2(1, 1) },
      },
      depthTest: false,
      depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float; varying vec2 vUv;
        uniform float uTime, uScroll, uAspect; uniform vec2 uPointer, uRes;
        ${GLSL_NOISE}
        // the thermal palette, as on the reference: cold blue at the edges, a thin yellow fringe,
        // then orange into a red core (dark enough for the copy to sit on)
        vec3 heat(float t){
          t = clamp(t, 0.0, 1.0);
          vec3 c0 = vec3(0.03, 0.08, 0.42);
          vec3 c1 = vec3(0.12, 0.32, 0.88);
          vec3 c2 = vec3(1.00, 0.82, 0.23);
          vec3 c3 = vec3(1.00, 0.48, 0.10);
          vec3 c4 = vec3(0.91, 0.15, 0.11);
          vec3 c5 = vec3(0.61, 0.06, 0.12);
          vec3 c = mix(c0, c1, smoothstep(0.0, 0.28, t));
          c = mix(c, c2, smoothstep(0.34, 0.48, t));
          c = mix(c, c3, smoothstep(0.48, 0.6, t));
          c = mix(c, c4, smoothstep(0.6, 0.8, t));
          c = mix(c, c5, smoothstep(0.8, 1.0, t));
          return c;
        }
        void main(){
          vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
          p += uPointer * 0.03;
          float t = uTime * 0.045 + uScroll * 1.6;
          // domain warp: two layers of drifting noise bend the field so the colours flow past
          // each other rather than pulse in place
          vec2 q = vec2(fbm(p * 1.3 + vec2(t, -t * 0.7)), fbm(p * 1.3 + vec2(-t * 0.6, t) + 5.2));
          vec2 r = vec2(fbm(p * 2.2 + q * 1.6 + vec2(t * 0.4, 1.7)), fbm(p * 2.2 + q * 1.6 + vec2(8.3, -t * 0.5)));
          float field = fbm(p * 1.1 + r * 1.9 + vec2(0.0, t * 0.3));
          // the heat gathers in long bands that cross the frame, and it is hottest through the
          // middle of the picture, cold at the top and bottom edges
          float band = sin(p.x * 1.8 + r.y * 5.0 - t * 1.2 + p.y * 2.0) * 0.5 + 0.5;
          float belt = 1.0 - smoothstep(0.0, 0.62, abs(p.y + (r.x - 0.5) * 0.5 + sin(p.x * 1.4 + t) * 0.1));
          float v = field * 0.55 + band * 0.25 + belt * 0.45;
          v = smoothstep(0.3, 0.98, v);
          // heavy grain: in the field itself, so it shifts the colour, and in the light
          float g = hash21(vUv * uRes + fract(uTime * 7.3) * 91.7);
          float g2 = hash21(vUv * uRes * 0.5 + fract(uTime * 3.1) * 37.1);
          v += (g - 0.5) * 0.3 + (g2 - 0.5) * 0.12;
          vec3 col = heat(v);
          col *= 0.84 + (g - 0.5) * 0.4;
          // a soft dark frame keeps the copy readable
          float vig = smoothstep(1.3, 0.35, length((vUv - 0.5) * vec2(1.2, 1.0)) * 1.4);
          col *= mix(0.55, 1.0, vig);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const heat = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.heatMat);
    heat.frustumCulled = false;
    heat.renderOrder = 10;
    this.scene.add(heat);

    this.camera.position.set(0, 0, 10);
  }

  update(f: ChapterFrame) {
    const t = f.t;
    // the crown comes into blossom over the first stretch of the scroll, before the lift
    this.treeMat.uniforms.uBloomT.value = smooth(-0.02, 0.3, t);
    // the tree: hold, then lift. a long, even ease so the edge travels rather than jumps
    const d = smooth(0.2, 0.66, t);
    this.treeMat.uniforms.uShift.value = d * d * (3 - 2 * d);
    this.treeMat.uniforms.uZoom.value = 1.12 + smooth(-0.3, 0.66, t) * 0.14;
    this.treeMat.uniforms.uAspect.value = this.camera.aspect;
    this.treeMat.uniforms.uTime.value = f.time;
    (this.treeMat.uniforms.uPointer.value as THREE.Vector2).set(this.ctx.pointer.x, this.ctx.pointer.y);
    // the heat: it churns with time and its colours slide with the scroll
    this.heatMat.uniforms.uTime.value = f.time;
    this.heatMat.uniforms.uScroll.value = smooth(0.2, 1.0, t);
    this.heatMat.uniforms.uAspect.value = this.camera.aspect;
    (this.heatMat.uniforms.uPointer.value as THREE.Vector2).set(this.ctx.pointer.x, this.ctx.pointer.y);
    (this.heatMat.uniforms.uRes.value as THREE.Vector2).set(this.ctx.renderer.domElement.width, this.ctx.renderer.domElement.height);
  }
}
