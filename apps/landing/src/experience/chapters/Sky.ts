import * as THREE from 'three';
import { Chapter, ChapterFrame, TextBeat, GLSL_NOISE, hash, smooth } from '../Chapter';

/**
 * Chapter 01 — inside the clouds. The camera flies forward through a
 * field of soft volumetric puffs at cloud level, with blue sky above and
 * a low sun. As you scroll the picture degrades into a pixelated
 * black-and-white surveillance feed: this is your connection, watched, idle.
 */
export class Sky extends Chapter {
  readonly id = 'sky';
  readonly label = 'Welcome';
  readonly dark = false;
  readonly flash = new THREE.Color('#0a0a0a');
  readonly clear = new THREE.Color('#9fbde0');
  grain = 0.05;
  vignette = 0.18;
  readonly beats: TextBeat[] = [
    {
      from: -0.3,
      to: 0.32,
      eyebrow: 'Root Network',
      html: 'Welcome to<br />Root Network',
      body: 'Get rewarded for the internet you don\u2019t use.',
      size: 'xl',
    },
    {
      from: 0.5,
      to: 0.86,
      eyebrow: '00 \u2014 Idle',
      html: 'Most of your internet<br />just sits <em>idle.</em>',
      body: 'A typical home uses under 5% of the bandwidth it pays for. The rest is watched, metered, and wasted.',
      size: 'l',
      light: true,
    },
    // surveillance chrome
    { from: 0.42, to: 0.92, html: '<i class="rec"></i>REC &nbsp; CAM 01 &nbsp; 03:14:07', size: 'm', x: 0.5, y: 0.1, className: 'beat--cctv', light: true },
    { from: 0.46, to: 0.92, html: 'LINE 0417 \u00b7 IDLE \u00b7 4.2% UTIL', size: 'm', x: 0.5, y: 0.9, className: 'beat--cctv', light: true },
  ];

  private skyMat!: THREE.ShaderMaterial;
  private cloudMat!: THREE.ShaderMaterial;
  private clouds: { mesh: THREE.Mesh; seed: number }[] = [];
  private post!: THREE.ShaderMaterial;
  private postScene = new THREE.Scene();
  private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private rt!: THREE.WebGLRenderTarget;
  private camZ = 0;
  private readonly depth = 150; // length of the cloud corridor

  init(ctx: Parameters<Chapter['init']>[0]) {
    super.init(ctx);
    this.fov = 52;
    this.camera.fov = this.fov;
    this.camera.far = 400;
    this.camera.updateProjectionMatrix();

    // --- sky dome: fullscreen gradient behind everything
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPitch: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float; varying vec2 vUv; uniform float uTime; uniform float uPitch;
        ${GLSL_NOISE}
        void main(){
          float y = vUv.y + uPitch;
          vec3 top = vec3(0.24, 0.46, 0.80);
          vec3 mid = vec3(0.62, 0.76, 0.92);
          vec3 low = vec3(0.86, 0.90, 0.95);
          vec3 col = mix(mid, top, smoothstep(0.55, 1.05, y));
          col = mix(low, col, smoothstep(0.0, 0.5, y));
          // low sun, upper right
          float sun = pow(max(0.0, 1.0 - length((vUv - vec2(0.78, 0.86)) * vec2(1.0, 1.5))), 3.0);
          col += vec3(1.0, 0.92, 0.78) * sun * 0.55;
          // faint haze bands
          col += (fbm(vec2(vUv.x * 3.0, y * 9.0 + uTime * 0.01)) - 0.5) * 0.03;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.scene.add(sky);

    // --- cloud puffs: camera-facing cards with a noise-carved soft body
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        varying vec2 vUv; varying float vSeed; varying float vFade;
        void main(){
          vUv = uv; vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = -mv.z;
          // fade in from the far haze, fade out just before passing the camera
          vFade = smoothstep(150.0, 90.0, d) * smoothstep(1.5, 9.0, d);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv; varying float vSeed; varying float vFade;
        uniform float uTime;
        ${GLSL_NOISE}
        void main(){
          vec2 p = vUv - 0.5;
          float r = length(p * vec2(1.0, 1.45));
          float mask = smoothstep(0.5, 0.12, r);
          vec2 o = vec2(vSeed * 17.3, vSeed * 9.1);
          float n = fbm(vUv * 2.6 + o + vec2(uTime * 0.012, 0.0));
          float n2 = fbm(vUv * 6.5 + o * 2.0 - vec2(0.0, uTime * 0.008));
          float body = n * 0.7 + n2 * 0.3 + mask * 0.4;
          float dens = smoothstep(0.6, 0.9, body) * mask;
          // lit from above: bright crowns, blue-grey bellies
          float light = clamp(0.35 + (vUv.y - 0.2) * 0.9 + (n - 0.5) * 0.5, 0.0, 1.0);
          vec3 col = mix(vec3(0.60, 0.68, 0.84), vec3(1.0, 0.995, 0.98), light);
          // warm sun catch on the upper right shoulder
          col += vec3(0.12, 0.08, 0.02) * smoothstep(0.2, 0.9, vUv.y) * smoothstep(0.3, 0.9, vUv.x) * light;
          gl_FragColor = vec4(col, dens * vFade * 0.9);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    const count = ctx.mobile ? 42 : 80;
    for (let i = 0; i < count; i++) {
      const g = geo.clone();
      const seed = hash(i * 3.7 + 0.3);
      g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(4).fill(seed), 1));
      const mesh = new THREE.Mesh(g, this.cloudMat);
      mesh.frustumCulled = false;
      this.placeCloud(mesh, seed, -hash(i * 5.1) * this.depth);
      this.scene.add(mesh);
      this.clouds.push({ mesh, seed });
    }

    // --- post: pixelated black & white surveillance feed
    this.rt = new THREE.WebGLRenderTarget(ctx.width * ctx.dpr, ctx.height * ctx.dpr, { depthBuffer: false, stencilBuffer: false, type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace });
    this.post = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: this.rt.texture }, uTime: { value: 0 }, uCctv: { value: 0 }, uRes: { value: new THREE.Vector2(ctx.width, ctx.height) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv; uniform sampler2D tScene; uniform float uTime, uCctv; uniform vec2 uRes;
        ${GLSL_NOISE}
        float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
        void main(){
          vec2 uv = vUv; float c = uCctv;
          float cells = mix(2000.0, 96.0, smoothstep(0.0, 1.0, c));
          vec2 cell = vec2(cells, cells * uRes.y / uRes.x);
          vec2 q = (floor(uv * cell) + 0.5) / cell;
          vec2 suv = mix(uv, q, step(0.02, c));
          float row = floor(suv.y * cell.y);
          float tear = step(0.985, hash21(vec2(row, floor(uTime*12.0)))) * c;
          suv.x += tear * (hash21(vec2(row, uTime)) - 0.5) * 0.08;
          vec3 col = texture2D(tScene, suv).rgb;

          float lum = dot(col, vec3(0.299, 0.587, 0.114));
          lum = pow(lum, 2.4) * 0.72;
          lum = (lum - 0.5) * (1.0 + c*0.6) + 0.5;
          vec3 bw = vec3(lum) * vec3(0.92, 0.96, 1.0);
          bw = floor(bw * mix(256.0, 10.0, c)) / mix(256.0, 10.0, c);
          float scan = 0.85 + 0.15 * sin(uv.y * uRes.y * 1.6);
          float bar = smoothstep(0.0, 0.08, abs(fract(uv.y - uTime*0.12) - 0.5));
          float nz = hash13(vec3(q * 700.0, floor(uTime*24.0))) - 0.5;
          bw = bw * mix(1.0, scan * (0.8 + 0.2*bar), c) + nz * 0.28 * c;
          bw *= mix(1.0, smoothstep(0.9, 0.3, length(uv - 0.5)), c*0.8);
          col = mix(col, max(bw, 0.0), smoothstep(0.05, 0.75, c));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    quad.frustumCulled = false;
    this.postScene.add(quad);
  }

  private placeCloud(mesh: THREE.Mesh, seed: number, z: number) {
    const a = hash(seed * 91.7) * Math.PI * 2;
    // a corridor: clouds ring the flight path, thinner right in the middle so the text stays legible
    const rad = 9 + Math.pow(hash(seed * 13.1), 0.6) * 32;
    mesh.position.set(Math.cos(a) * rad * 1.5, Math.sin(a) * rad * 0.7 - 3, z);
    const s = 12 + hash(seed * 7.7) * 24;
    mesh.scale.set(s * (0.9 + hash(seed * 3.3) * 0.7), s * 0.62, 1);
    mesh.rotation.z = (hash(seed * 5.5) - 0.5) * 0.3;
  }

  resize(w: number, h: number) {
    super.resize(w, h);
    if (this.rt) {
      this.rt.setSize(w * this.ctx.dpr, h * this.ctx.dpr);
      (this.post.uniforms.uRes.value as THREE.Vector2).set(w, h);
    }
  }

  update(f: ChapterFrame) {
    const t = f.t;
    // fly forward; scrolling pushes you deeper, faster
    const speed = 6 + smooth(-0.3, 1.0, t) * 10 + Math.min(Math.abs(f.velocity), 1.5) * 26;
    this.camZ -= f.dt * speed;
    const px = this.ctx.pointer.x;
    const py = this.ctx.pointer.y;
    this.camera.position.set(px * 1.6 + Math.sin(f.time * 0.21) * 0.8, py * 1.0 + Math.sin(f.time * 0.17) * 0.5, this.camZ);
    this.camera.rotation.set(py * 0.03 + Math.sin(f.time * 0.13) * 0.01, -px * 0.04, Math.sin(f.time * 0.11) * 0.02 + px * 0.03);
    this.skyMat.uniforms.uTime.value = f.time;
    this.skyMat.uniforms.uPitch.value = -py * 0.04;
    this.cloudMat.uniforms.uTime.value = f.time;

    // recycle clouds that fell behind the camera to the far end of the corridor
    for (const c of this.clouds) {
      const m = c.mesh;
      if (m.position.z > this.camZ + 6) {
        this.placeCloud(m, hash(c.seed * 41.3 + m.position.z), this.camZ - this.depth - hash(m.position.z) * 20);
        c.seed = hash(c.seed + 0.37);
      }
      // gentle drift
      m.position.x += Math.sin(f.time * 0.15 + c.seed * 30) * f.dt * 0.4;
      m.quaternion.copy(this.camera.quaternion);
    }

    this.post.uniforms.uTime.value = f.time;
    this.post.uniforms.uCctv.value = smooth(0.34, 0.62, t);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null) {
    renderer.setRenderTarget(this.rt);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(target);
    renderer.render(this.postScene, this.ortho);
  }

  dispose() {
    super.dispose();
    this.rt?.dispose();
  }
}
