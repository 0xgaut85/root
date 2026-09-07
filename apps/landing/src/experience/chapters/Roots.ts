import * as THREE from 'three';
import { Chapter, ChapterFrame, TextBeat, GLSL_NOISE, hash, smooth, lerp } from '../Chapter';

/** the strands start growing one after another across this share of the growth scroll; each takes the rest */
const GROW_SPREAD = 0.64;
/** per-strand growth from the shared scroll progress: 0 = not started, 1 = fully grown, tip lit */
const growth = (grow: number, order: number) => Math.max(0, Math.min(1, (grow - order * GROW_SPREAD) / (1 - GROW_SPREAD)));

/**
 * Chapter 03 — an olive tree in a meadow that comes into blossom as you scroll,
 * branch by branch; then the camera sinks under the grass and the root system
 * is a bundle of red optic fibres growing downward, lighting up one by one.
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

  private rootMat!: THREE.ShaderMaterial;
  private tips!: THREE.Points;
  private curves: THREE.CatmullRomCurve3[] = [];
  private tipOrder: number[] = [];
  private treeMat!: THREE.ShaderMaterial;
  init(ctx: Parameters<Chapter['init']>[0]) {
    super.init(ctx);
    this.scene.fog = new THREE.FogExp2(this.clear.getHex(), 0.045);

    // ---- the tree: a photograph laid over everything. Scrolling takes the camera below the
    // grass; the picture slides up and out through a band of dark soil, and the roots are there.
    // Two plates of the same tree, bare and in blossom: the scroll dissolves one into the other
    // along the branches, from a few points outward, so the crown blooms branch by branch.
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
          // the descent: the camera sinks, so the whole picture travels up and out of frame; below
          // its bottom edge there is nothing but the roots. A clean cut, no earth in between.
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

    const rootCount = ctx.mobile ? 22 : 32;
    const segs = 72;
    // the roots are drawn as optic fibres: a dark sheath with a hair of white light down the middle
    // and packets of light running along it. Additive, so crossings brighten like real strands.
    this.rootMat = new THREE.ShaderMaterial({
      uniforms: {
        uGrow: { value: 0 },
        uTime: { value: 0 },
        uReveal: { value: 0 },
        uFogColor: { value: this.clear.clone() },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aOrder; attribute vec3 aColor;
        varying vec2 vUv; varying float vOrder; varying vec3 vN; varying vec3 vV; varying float vDepth; varying vec3 vColor;
        void main(){
          vUv = uv; vOrder = aOrder; vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv; varying float vOrder; varying vec3 vN; varying vec3 vV; varying float vDepth; varying vec3 vColor;
        uniform float uGrow; uniform float uTime; uniform float uReveal; uniform vec3 uFogColor;
        void main(){
          // each strand grows in its own window of the scroll (see growth() in Roots.ts)
          float g = clamp((uGrow - vOrder * ${GROW_SPREAD.toFixed(3)}) / ${(1 - GROW_SPREAD).toFixed(3)}, 0.0, 1.0);
          if (vUv.x > g) discard;
          // the light at the growing end, which stays on once the strand has arrived
          float tip = smoothstep(g - 0.06, g, vUv.x);
          float vLead = vOrder;
          // clamp: interpolation can push the base a hair below zero, and pow() of a negative is NaN (black speckles)
          float facing = clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
          float rim = pow(1.0 - facing, 2.0);
          // the fibre core: a thin bright line where the tube faces us
          float core = pow(facing, 7.0);
          // each strand has its own colour, a touch paler toward its tip
          vec3 tint = mix(vColor, mix(vColor, vec3(1.0), 0.2), vUv.x);
          // data: bright packets racing down the strand (downward = increasing u), at three speeds,
          // each strand on its own phase so the whole system flickers with traffic
          float ph0 = fract(vUv.x * 1.5 - uTime * 0.55 + vLead * 3.0);
          float ph1 = fract(vUv.x * 4.0 - uTime * 1.1 + vLead * 7.0);
          float ph2 = fract(vUv.x * 9.0 - uTime * 2.4 + vLead * 11.0);
          float pk = exp(-pow((ph0 - 0.5) * 5.0, 2.0)) * 1.0
                   + exp(-pow((ph1 - 0.5) * 9.0, 2.0)) * 0.7
                   + exp(-pow((ph2 - 0.5) * 16.0, 2.0)) * 0.5;
          // a faint glow spills out of the sheath around each packet
          float halo = pk * (0.35 + rim * 0.6);
          vec3 col = tint * (0.1 + rim * 0.34)                       // tinted sheath
                   + mix(tint, vec3(1.0), 0.08) * core * 0.3          // the hair of light
                   + mix(tint, vec3(1.0), 0.28) * (core * pk * 1.25 + halo * 0.4) // packets
                   + mix(vColor, vec3(1.0), 0.45) * tip * (0.45 + core * 0.6); // the glowing end
          float fog = 1.0 - exp(-vDepth*vDepth*0.045*0.045);
          col *= (1.0 - fog) * uReveal;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const group = new THREE.Group();
    // the fibres come in three colours, dealt out in turn so no colour clusters; a branch keeps its
    // parent's colour
    const palette = [new THREE.Color('#2f6bff'), new THREE.Color('#ff2314'), new THREE.Color('#ffd23a')];
    // main roots + two children each, branching off part-way down
    const specs: { pts: THREE.Vector3[]; radius: number; order: number; color: THREE.Color }[] = [];
    for (let i = 0; i < rootCount; i++) {
      const color = palette[(i * 5 + Math.floor(hash(i * 6.1) * 3)) % 3];
      const pts: THREE.Vector3[] = [];
      const a0 = hash(i * 3.7) * Math.PI * 2;
      const r0 = 1.5 + hash(i * 1.9) * 7.5;
      let x = Math.cos(a0) * r0;
      let z = Math.sin(a0) * r0 - 4;
      let y = 9 + hash(i * 0.7) * 4;
      let dx = Math.cos(a0) * 0.25 + (hash(i * 4.4) - 0.5) * 0.5;
      let dz = Math.sin(a0) * 0.25 + (hash(i * 5.4) - 0.5) * 0.5;
      const n = 14;
      for (let j = 0; j <= n; j++) {
        pts.push(new THREE.Vector3(x, y, z));
        dx += (hash(i * 11 + j * 7.1) - 0.5) * 0.9;
        dz += (hash(i * 13 + j * 9.3) - 0.5) * 0.9;
        dx *= 0.8;
        dz *= 0.8;
        x += dx * 1.6;
        z += dz * 1.6;
        y -= 1.9 + hash(i + j * 2.2) * 0.9;
      }
      const radius = 0.055 + hash(i * 8.8) * 0.075;
      // the order in which the strands set off: spread evenly, shuffled
      const order = ((i * 7) % rootCount) / rootCount;
      specs.push({ pts, radius, order, color });
      // one long child branch on roughly half of the roots; no stubby offshoots
      const children = hash(i * 12.1) < 0.5 ? 1 : 0;
      for (let c = 0; c < children; c++) {
        const start = 2 + Math.floor(hash(i * 2.3 + c * 7.7) * 4);
        const base = pts[start];
        // leave the parent sideways so the tubes never share a surface
        const ang = hash(i * 9.9 + c * 3.1) * Math.PI * 2;
        let cdx = Math.cos(ang) * 1.4;
        let cdz = Math.sin(ang) * 1.4;
        const cp: THREE.Vector3[] = [new THREE.Vector3(base.x + Math.cos(ang) * radius * 0.8, base.y - 0.2, base.z + Math.sin(ang) * radius * 0.8)];
        let cx = cp[0].x;
        let cz = cp[0].z;
        let cy = cp[0].y;
        for (let j = 1; j <= 11; j++) {
          cdx += (hash(i * 17 + j * 3.3 + c) - 0.5) * 0.8;
          cdz += (hash(i * 19 + j * 5.3 + c) - 0.5) * 0.8;
          cdx *= 0.8;
          cdz *= 0.8;
          cx += cdx * 1.4;
          cz += cdz * 1.4;
          cy -= 1.6 + hash(i * 3 + j) * 0.8;
          cp.push(new THREE.Vector3(cx, cy, cz));
        }
        // a child sets off a little after its parent has passed the fork
        specs.push({ pts: cp, radius: radius * 0.7, order: Math.min(0.98, order + 0.12 + (start / 14) * 0.2), color });
      }
    }
    const tipColors: number[] = [];
    for (const spec of specs) {
      const curve = new THREE.CatmullRomCurve3(spec.pts, false, 'catmullrom', 0.5);
      this.curves.push(curve);
      const order = spec.order;
      this.tipOrder.push(order);
      tipColors.push(spec.color.r, spec.color.g, spec.color.b);
      const radius = spec.radius;
      const geo = new THREE.TubeGeometry(curve, spec.pts.length > 10 ? segs : 40, radius, 8, false);
      // taper: scale radius along the tube by pushing vertices toward the curve
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const uvs = geo.attributes.uv as THREE.BufferAttribute;
      const tmp = new THREE.Vector3();
      for (let v = 0; v < pos.count; v++) {
        const u = uvs.getX(v);
        const c = curve.getPointAt(Math.min(u, 1));
        tmp.set(pos.getX(v), pos.getY(v), pos.getZ(v)).sub(c);
        const taper = 1 - u * 0.6;
        tmp.multiplyScalar(taper).add(c);
        pos.setXYZ(v, tmp.x, tmp.y, tmp.z);
      }
      pos.needsUpdate = true;
      const orders = new Float32Array(pos.count).fill(order);
      geo.setAttribute('aOrder', new THREE.BufferAttribute(orders, 1));
      const colors = new Float32Array(pos.count * 3);
      for (let v = 0; v < pos.count; v++) colors.set([spec.color.r, spec.color.g, spec.color.b], v * 3);
      geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
      group.add(new THREE.Mesh(geo, this.rootMat));
    }
    this.scene.add(group);

    // glowing tips
    const tp = new Float32Array(this.curves.length * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
    // per tip: 0 = strand not started, ramps to 1 while growing, and 1 + a flash when it arrives
    tg.setAttribute('aOn', new THREE.BufferAttribute(new Float32Array(this.curves.length), 1));
    tg.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(tipColors), 3));
    const tm = new THREE.ShaderMaterial({
      uniforms: { uDpr: { value: ctx.dpr }, uTime: { value: 0 }, uReveal: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aOn; attribute vec3 aColor;
        uniform float uDpr; uniform float uTime; uniform float uReveal; varying float vA; varying vec3 vColor;
        void main(){
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = -mv.z;
          gl_PointSize = (16.0 + 10.0 * aOn) * uDpr * (10.0 / max(d, 1.0));
          vA = smoothstep(46.0, 4.0, d) * 0.8 * uReveal * aOn;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float; varying float vA; varying vec3 vColor;
        void main(){
          float r = length(gl_PointCoord - 0.5);
          // a hot white centre (the cut end of the fibre) inside a soft halo of the strand's colour
          float a = pow(smoothstep(0.5, 0.0, r), 2.4) * vA;
          float hot = smoothstep(0.16, 0.0, r) * vA;
          gl_FragColor = vec4(vColor * a + mix(vColor, vec3(1.0), 0.75) * hot, 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.tips = new THREE.Points(tg, tm);
    this.tips.frustumCulled = false;
    this.scene.add(this.tips);

    this.camera.position.set(0, 8, 12);
  }

  update(f: ChapterFrame) {
    const t = f.t;
    // the crown comes into blossom over the first stretch of the scroll, before the descent
    this.treeMat.uniforms.uBloomT.value = smooth(-0.02, 0.3, t);
    // the tree: hold, then descend. a long, even ease so the ground line drifts away rather than cuts
    const d = smooth(0.2, 0.66, t);
    this.treeMat.uniforms.uShift.value = d * d * (3 - 2 * d);
    this.treeMat.uniforms.uZoom.value = 1.12 + smooth(-0.3, 0.66, t) * 0.14;
    this.treeMat.uniforms.uAspect.value = this.camera.aspect;
    this.treeMat.uniforms.uTime.value = f.time;
    (this.treeMat.uniforms.uPointer.value as THREE.Vector2).set(this.ctx.pointer.x, this.ctx.pointer.y);
    // the strands set off one after another as the soil passes overhead and grow while we dive;
    // each one's tip lights up as it goes and stays lit when it arrives, so the network switches
    // on strand by strand with the scroll rather than all at once
    const grow = smooth(0.1, 0.94, t);
    const reveal = smooth(0.2, 0.36, t);
    this.rootMat.uniforms.uGrow.value = grow;
    this.rootMat.uniforms.uTime.value = f.time;
    this.rootMat.uniforms.uReveal.value = reveal;
    const tipMat = this.tips.material as THREE.ShaderMaterial;
    tipMat.uniforms.uTime.value = f.time;
    tipMat.uniforms.uReveal.value = reveal;
    const tp = this.tips.geometry.attributes.position as THREE.BufferAttribute;
    const on = this.tips.geometry.attributes.aOn as THREE.BufferAttribute;
    for (let i = 0; i < this.curves.length; i++) {
      const g = growth(grow, this.tipOrder[i]);
      const p = this.curves[i].getPointAt(g);
      tp.setXYZ(i, p.x, p.y, p.z);
      // a soft spark while growing, a flash on arrival that settles to a steady light
      const arrival = this.tipOrder[i] * GROW_SPREAD + (1 - GROW_SPREAD); // the grow value at which it arrives
      const flash = Math.exp(-Math.max(0, grow - arrival) * 14) * 0.8 + 0.12 * Math.sin(f.time * 2.2 + i * 1.7);
      on.setX(i, g <= 0 ? 0 : g >= 0.999 ? 1 + flash : 0.55);
    }
    tp.needsUpdate = true;
    on.needsUpdate = true;

    // dive down with the growth
    const k = smooth(-0.2, 1.05, t);
    const y = lerp(13, -22, k);
    const z = lerp(19, 11, k);
    const px = this.ctx.pointer.x * 1.2;
    const py = this.ctx.pointer.y * 0.6;
    this.camera.position.set(px + Math.sin(k * 2.2) * 3, y + py, z);
    this.camera.lookAt(0, y - 6 - k * 3, -4);
    this.camera.fov = this.fov + k * 8;
    this.camera.updateProjectionMatrix();
  }
}
