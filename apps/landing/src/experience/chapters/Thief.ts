import * as THREE from 'three';
import { Chapter, ChapterFrame, TextBeat, GLSL_NOISE, hash, smooth, lerp, easeOut } from '../Chapter';

interface Loot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  /** where it sits on the body while he still has it (thief-local, height = 1) */
  anchor: THREE.Vector3;
  /** scroll position at which it comes loose */
  release: number;
  /** -1 left, +1 right */
  side: number;
  /** resting place, laid out per frame so the stacks never overlap or clip */
  restX: number;
  restY: number;
  restScale: number;
  spin: number;
  seed: number;
  size: number;
  /** half extents of the cutout at scale 1 */
  hw: number;
  hh: number;
}

/**
 * Chapter 05 — pure white. A burglar drops out of the sky towards you with
 * everything he came with: flashlight and crowbar in his hands, rope in his
 * pocket, backpack on, bolt cutters strapped to it. As you scroll he loses
 * them one by one; each drifts off to the side and hangs there, and the
 * photo of him is swapped for one where he no longer holds it. By the end
 * he has nothing. There is nothing here to take.
 */
export class Thief extends Chapter {
  readonly id = 'thief';
  readonly label = 'Privacy';
  readonly dark = false;
  readonly flash = new THREE.Color('#ffffff');
  readonly clear = new THREE.Color('#fbfbfc');
  grain = 0.035;
  vignette = 0.08;
  readonly beats: TextBeat[] = [
    {
      from: 0.06,
      to: 0.46,
      eyebrow: '04 \u2014 Privacy',
      html: 'Your data<br />stays <em>yours.</em>',
      size: 'l',
      y: 0.86,
    },
    {
      from: 0.56,
      to: 0.9,
      html: 'Nothing to <em>take.</em>',
      body: 'Root never touches your browsing, files or passwords. Only public pages are ever fetched, never your own traffic.',
      size: 'm',
      y: 0.86,
    },
  ];

  private bgMat!: THREE.ShaderMaterial;
  private thief!: THREE.Mesh;
  private thiefMat!: THREE.ShaderMaterial;
  private stages: (THREE.Texture | null)[] = [];
  private thiefH = 6.6;
  private thiefAR = 2 / 3;
  private loot: Loot[] = [];
  private tmp = new THREE.Vector3();
  private zAxis = new THREE.Vector3(0, 0, 1);

  init(ctx: Parameters<Chapter['init']>[0]) {
    super.init(ctx);

    // ---- background: white with a whisper of a radial shade and rising speed streaks
    this.bgMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAspect: { value: 1 }, uFall: { value: 0 } },
      depthWrite: false,
      depthTest: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float; varying vec2 vUv; uniform float uTime; uniform float uAspect; uniform float uFall;
        ${GLSL_NOISE}
        void main(){
          vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
          float r = length(p);
          vec3 col = mix(vec3(1.0), vec3(0.93, 0.935, 0.945), smoothstep(0.25, 0.95, r));
          // faint vertical streaks rushing upward: the air going past a falling body
          float sx = vUv.x * 60.0 * uAspect;
          float lane = floor(sx);
          float within = fract(sx);
          float speed = 0.6 + hash21(vec2(lane, 1.7)) * 0.9;
          float ph = fract(vUv.y * 0.5 + uTime * speed * 0.12 + hash21(vec2(lane * 3.1, 1.7)));
          float streak = smoothstep(0.0, 0.1, ph) * smoothstep(0.55, 0.15, ph);
          streak *= smoothstep(0.42, 0.5, within) * smoothstep(0.58, 0.5, within);
          streak *= step(0.72, hash21(vec2(lane * 7.7, 1.7))) * smoothstep(0.15, 0.6, r);
          col -= streak * 0.045 * uFall;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat);
    bg.frustumCulled = false;
    bg.renderOrder = -10;
    this.scene.add(bg);

    const tex = (key: string) => {
      const t = ctx.assets.get(key) as THREE.Texture | undefined;
      if (t) {
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.anisotropy = 4;
      }
      return t ?? null;
    };

    // ---- the thief: six photographs of the same fall, one per item he still holds
    this.stages = [0, 1, 2, 3, 4, 5].map((i) => tex(`thief${i}`));
    const first = this.stages.find((t) => t) ?? null;
    const img = first?.image as { width?: number; height?: number } | undefined;
    if (img?.width && img?.height) this.thiefAR = img.width / img.height;
    this.thiefMat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: first }, uB: { value: first }, uMix: { value: 0 } },
      transparent: true,
      depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float; varying vec2 vUv; uniform sampler2D uA; uniform sampler2D uB; uniform float uMix;
        void main(){
          vec4 a = texture2D(uA, vUv); vec4 b = texture2D(uB, vUv);
          vec4 c = mix(a, b, uMix);
          if (c.a < 0.01) discard;
          gl_FragColor = c;
        }
      `,
    });
    if (ctx.mobile) this.thiefH = 4.0;
    this.thief = new THREE.Mesh(new THREE.PlaneGeometry(this.thiefAR, 1), this.thiefMat);
    this.thief.scale.setScalar(this.thiefH);
    this.thief.renderOrder = 1;
    this.scene.add(this.thief);

    // ---- what he came with. Anchors in thief-local units (u,v of the photo → centred, height 1).
    const at = (u: number, v: number) => new THREE.Vector3((u - 0.5) * this.thiefAR, 0.5 - v, 0.02);
    const items: [string, THREE.Vector3, number, number, number][] = [
      // key, anchor, release, side, size
      ['flashlight', at(0.17, 0.13), 0.1, -1, 1.5],
      ['crowbar', at(0.8, 0.27), 0.25, 1, 2.6],
      ['cutters', at(0.25, 0.3), 0.4, -1, 2.3],
      ['rope', at(0.3, 0.42), 0.52, -1, 1.6],
      ['backpack', at(0.45, 0.28), 0.64, 1, 2.2],
    ];
    items.forEach(([key, anchor, release, side, size], i) => {
      const t = tex(key);
      const im = t?.image as { width?: number; height?: number } | undefined;
      const ar = im?.width && im?.height ? im.width / im.height : 1;
      const mat = new THREE.MeshBasicMaterial({ map: t, color: t ? '#ffffff' : '#222', transparent: true, alphaTest: 0.02, depthWrite: false, fog: false, opacity: 0 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ar, 1), mat);
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      this.loot.push({
        mesh,
        mat,
        anchor,
        release,
        side,
        restX: 0,
        restY: 0,
        restScale: size,
        spin: (hash(i * 7.7) - 0.5) * 1.6,
        seed: hash(i * 9.1),
        size,
        hw: ar / 2,
        hh: 0.5,
      });
    });

    this.camera.position.set(0, 0, 13);
    this.camera.lookAt(0, 0, 0);
  }

  update(f: ChapterFrame) {
    const t = f.t;
    const px = this.ctx.pointer.x;
    const py = this.ctx.pointer.y;
    const mobile = this.ctx.mobile;
    this.bgMat.uniforms.uTime.value = f.time;
    this.bgMat.uniforms.uAspect.value = this.camera.aspect;
    this.bgMat.uniforms.uFall.value = smooth(-0.1, 0.25, t) * (1 - smooth(0.85, 1.1, t));

    // ---- camera: slow push in, the fall read through the drift of the body
    const k = smooth(-0.2, 1.05, t);
    // (further back on phones so the loot has room either side of him)
    this.camera.position.set(px * 0.5, py * 0.35, lerp(14.5, 11.5, k) + (mobile ? 2.2 : 0));
    this.camera.lookAt(px * 0.2, 0, 0);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();

    // ---- the thief: centred, a touch high so the copy sits below his boots, tumbling gently
    const sway = Math.sin(f.time * 0.55) * 0.05 + Math.sin(f.time * 1.3) * 0.015;
    const bob = Math.sin(f.time * 0.8) * 0.12;
    this.thief.position.set(Math.sin(f.time * 0.35) * 0.18, (mobile ? 1.5 : 1.15) + bob, 0);
    this.thief.rotation.z = sway;
    this.thief.rotation.y = px * 0.08;
    const arrive = easeOut(smooth(-0.05, 0.22, t));
    this.thief.scale.setScalar(this.thiefH * lerp(0.82, 1, arrive));

    // ---- which photograph: crossfade to the next one as each item comes loose
    let stage = 0;
    let mix = 0;
    for (const l of this.loot) {
      const r = smooth(l.release, l.release + 0.1, t);
      if (r >= 1) stage++;
      else if (r > 0) {
        mix = r;
        break;
      }
    }
    const A = this.stages[Math.min(stage, this.stages.length - 1)] ?? this.stages[0];
    const B = this.stages[Math.min(stage + 1, this.stages.length - 1)] ?? A;
    this.thiefMat.uniforms.uA.value = A;
    this.thiefMat.uniforms.uB.value = B;
    this.thiefMat.uniforms.uMix.value = mix;

    // ---- the loot: appears where it was on the body, arcs out and hangs at the side.
    // Resting places are laid out as two vertical stacks (left / right) inside the frame, so no two
    // items ever overlap and nothing is ever clipped, whatever the viewport.
    const tanF = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const restZ = 0.5; // one shared depth: what does not overlap on screen cannot overlap in space either
    const dist = this.camera.position.z - restZ;
    const hh = dist * tanF;
    const hw = hh * this.camera.aspect;
    const margin = mobile ? 0.22 : 0.38;
    const minGap = mobile ? 0.3 : 0.7;
    const maxGap = mobile ? 0.6 : 1.4;
    // the stacks live between the nav bar and the headline that sits at the bottom
    const navFrac = Math.min(0.2, (mobile ? 76 : 92) / Math.max(this.ctx.height, 1));
    const top = hh - 2 * hh * navFrac - margin * 0.5;
    const bottom = -hh * (mobile ? 0.48 : 0.55);
    // the stacks hug the thief: just outside his reach, not out at the edges of the frame
    const reach = this.thiefH * this.thiefAR * 0.5 + (mobile ? 0.25 : 0.55);
    for (const side of [-1, 1]) {
      const stack = this.loot.filter((l) => l.side === side);
      // largest scale at which the whole stack fits between top and bottom with the minimum gap
      const base = mobile ? 0.44 : 1;
      const heights = stack.reduce((s, l) => s + l.size * base * 2 * l.hh, 0);
      let fit = 1;
      if (heights + minGap * (stack.length - 1) > top - bottom) fit = (top - bottom - minGap * (stack.length - 1)) / heights;
      // then spread the items evenly over the available height (same gap between every pair)
      const used = heights * fit;
      const gap = Math.min(maxGap, (top - bottom - used) / Math.max(1, stack.length - 1));
      let cursor = top - (top - bottom - used - gap * (stack.length - 1)) / 2;
      for (const l of stack) {
        const restScale = l.size * base * fit;
        l.restScale = restScale;
        l.restX = side * Math.min(reach + l.hw * restScale, Math.max(0, hw - l.hw * restScale - margin));
        l.restY = cursor - l.hh * restScale;
        cursor -= l.hh * restScale * 2 + gap;
      }
    }
    for (const l of this.loot) {
      const r = easeOut(smooth(l.release, l.release + 0.22, t));
      if (r <= 0) {
        l.mesh.visible = false;
        continue;
      }
      l.mesh.visible = true;
      // fade in over the first moments so the swap in the photo and the sprite read as one motion
      l.mat.opacity = smooth(0, 0.12, r);
      const scale = lerp(l.restScale * 0.5, l.restScale, r);
      // start: on the body
      this.tmp.copy(l.anchor).multiplyScalar(this.thief.scale.x).applyAxisAngle(this.zAxis, this.thief.rotation.z).add(this.thief.position);
      const sx = this.tmp.x;
      const sy = this.tmp.y;
      // a small arc on the way out; the hover is a few centimetres, never enough to reach a neighbour
      const arc = Math.sin(r * Math.PI) * (mobile ? 0.5 : 1.0);
      const hover = Math.sin(f.time * 0.7 + l.seed * 10) * Math.min(0.08, minGap * 0.25) * r;
      const x = lerp(sx, l.restX, r) + Math.sin(f.time * 0.5 + l.seed * 20) * 0.08 * r;
      let y = lerp(sy, l.restY, r) + arc + hover;
      // and never past the top edge, even mid-arc
      y = Math.min(y, hh - l.hh * scale - margin * 0.5);
      const z = lerp(0.05, restZ, r);
      l.mesh.position.set(x, y, z);
      // settle almost flat so the stacks stay compact; the spin lives in the flight
      l.mesh.rotation.z = lerp(this.thief.rotation.z, l.spin * 0.35 + Math.sin(f.time * 0.6 + l.seed * 30) * 0.04, r) + Math.sin(r * Math.PI) * l.spin * 1.5;
      l.mesh.rotation.y = px * 0.1 * r;
      l.mesh.scale.setScalar(scale);
    }
  }
}
