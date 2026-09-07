import * as THREE from 'three';
import { Chapter, ChapterFrame, TextBeat, GLSL_NOISE, hash, smooth, lerp } from '../Chapter';

/**
 * Chapter 02 — deep red. A curtain of volumetric light beams streaming
 * upward out of a very grainy black-to-red gradient. Nothing floats: the
 * only motion is the light climbing, faster when you scroll.
 */
export class Beams extends Chapter {
  readonly id = 'beams';
  readonly label = 'Network';
  readonly dark = true;
  readonly flash = new THREE.Color('#2a0305');
  readonly clear = new THREE.Color('#0a0102');
  grain = 0.3;
  vignette = 0.55;
  readonly beats: TextBeat[] = [
    {
      from: 0.06,
      to: 0.46,
      eyebrow: '01 \u2014 The network',
      html: 'Idle bandwidth becomes<br /><em>infrastructure.</em>',
      body: 'Root routes public web requests from verified AI labs through the homes of the network, so models learn from fresh, open data.',
      size: 'l',
    },
    {
      from: 0.54,
      to: 0.84,
      html: 'Every idle byte,<br />put to <em>work.</em>',
      size: 'xl',
    },
  ];

  private beamMat!: THREE.ShaderMaterial;
  private bgMat!: THREE.ShaderMaterial;
  private flow = 0;

  init(ctx: Parameters<Chapter['init']>[0]) {
    super.init(ctx);

    // --- beams: tall additive planes with scrolling streak noise
    const count = ctx.mobile ? 14 : 26;
    const geo = new THREE.PlaneGeometry(1, 60, 1, 1);
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFlow: { value: 0 },
        uColA: { value: new THREE.Color('#ff2314') },
        uColB: { value: new THREE.Color('#ff9e86') },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        varying vec2 vUv;
        varying float vSeed;
        varying float vDepth;
        void main(){
          vUv = uv; vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv; varying float vSeed; varying float vDepth;
        uniform float uTime; uniform float uFlow; uniform vec3 uColA; uniform vec3 uColB;
        ${GLSL_NOISE}
        void main(){
          float x = abs(vUv.x - 0.5) * 2.0;
          float prof = pow(1.0 - smoothstep(0.0, 1.0, x), 2.4);
          float y = vUv.y * 6.0 - uFlow * (1.4 + fract(vSeed)*0.8);
          float n = fbm(vec2(vSeed*10.0 + vUv.x*3.0, y));
          float streak = smoothstep(0.38, 0.9, n);
          float env = smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.5, 1.0, vUv.y));
          float a = prof * (0.25 + streak*0.95) * env;
          vec3 col = mix(uColA, uColB, pow(prof, 3.0) * streak);
          float depth = smoothstep(44.0, 6.0, vDepth);
          gl_FragColor = vec4(col * a * depth * 0.85, 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < count; i++) {
      const g = geo.clone();
      const seed = hash(i * 2.7 + 1);
      const seeds = new Float32Array(g.attributes.position.count).fill(seed + i);
      g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
      const m = new THREE.Mesh(g, this.beamMat);
      // stratified across the full width (left, centre and right alike), jittered within each slot
      const spread = 30;
      const slot = (i + 0.5) / count + (hash(i * 4.3) - 0.5) * (0.9 / count);
      m.position.set((slot - 0.5) * spread, 8, -hash(i * 6.1) * 22 - 2);
      m.scale.x = 0.35 + hash(i * 8.9) * 2.4;
      m.renderOrder = 2;
      this.scene.add(m);
    }

    // --- background: very grainy black → red gradient, black dominates.
    // Grain is baked in here (film-like, per pixel, animated) on top of the
    // composite grain so the texture reads even on bright displays.
    this.bgMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uRes: { value: new THREE.Vector2(ctx.width, ctx.height) }, uK: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float; varying vec2 vUv; uniform float uTime; uniform vec2 uRes; uniform float uK;
        ${GLSL_NOISE}
        float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
        void main(){
          vec2 uv = vUv;
          // a slow, large-scale drift so the gradient breathes
          float n = fbm(uv*2.2 + vec2(0.0, -uTime*0.02));
          // red lives low and to the centre; the top three quarters are black
          float glow = smoothstep(0.75, -0.15, uv.y + (n - 0.5)*0.35);
          glow *= 0.55 + 0.45 * smoothstep(1.0, 0.1, abs(uv.x - 0.5) * 1.6);
          glow = pow(glow, 1.6 - uK*0.5);
          vec3 red = vec3(0.62, 0.035, 0.05);
          vec3 c = mix(vec3(0.012, 0.004, 0.006), red, glow);
          // heavy film grain: fine + coarse, animated per frame
          vec2 px = uv * uRes;
          float g1 = hash13(vec3(px, floor(uTime*24.0))) - 0.5;
          float g2 = hash13(vec3(floor(px/2.0), floor(uTime*24.0)+7.0)) - 0.5;
          float grain = g1*0.7 + g2*0.5;
          // grain is stronger in the mids (like real stock), and reddish in the red
          float lum = c.r;
          c += grain * (0.10 + 0.22 * smoothstep(0.0, 0.5, lum)) * vec3(1.0, 0.7, 0.7);
          c = max(c, 0.0);
          gl_FragColor = vec4(c, 1.0);
        }
      `,
      depthWrite: false,
      depthTest: false,
    });
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat);
    bg.frustumCulled = false;
    bg.renderOrder = -10;
    this.scene.add(bg);

    this.camera.position.set(0, -1, 16);
  }

  resize(w: number, h: number) {
    super.resize(w, h);
    if (this.bgMat) (this.bgMat.uniforms.uRes.value as THREE.Vector2).set(w, h);
  }

  update(f: ChapterFrame) {
    const t = f.t;
    // continuous flow, boosted by scroll velocity ("beam moving with motion")
    this.flow += f.dt * (0.55 + Math.min(Math.abs(f.velocity), 1.5) * 2.4);
    this.beamMat.uniforms.uTime.value = f.time;
    this.beamMat.uniforms.uFlow.value = this.flow;
    const k = smooth(-0.2, 1.05, t);
    this.bgMat.uniforms.uTime.value = f.time;
    this.bgMat.uniforms.uK.value = k;

    const z = lerp(16, 3.5, k);
    const y = lerp(-1.5, 2.5, k);
    const px = this.ctx.pointer.x * 0.8;
    const py = this.ctx.pointer.y * 0.4;
    this.camera.position.set(px, y + py, z);
    this.camera.lookAt(px * 0.4, y + 3 + k * 8, z - 12);
    this.camera.fov = this.fov + k * 6;
    this.camera.updateProjectionMatrix();
  }
}
