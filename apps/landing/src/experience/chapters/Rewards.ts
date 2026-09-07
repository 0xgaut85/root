import * as THREE from 'three';
import { Chapter, ChapterFrame, TextBeat, hash, smooth, lerp, easeOut } from '../Chapter';
import { VideoPlate } from '../VideoPlate';

interface Bill {
  group: THREE.Group;
  seed: number;
  start: number;
  dur: number;
  size: number;
  /** landing spot near the camera */
  end: THREE.Vector3;
  spin: THREE.Vector3;
  mats: THREE.MeshStandardMaterial[];
}

/**
 * Chapter 06 — open ocean, bright day. A small cargo plane crosses the sky
 * far away and drops banknotes from its ramp; the notes tumble toward the
 * camera, growing huge as they pass. Rewards, raining down.
 */
export class Rewards extends Chapter {
  readonly id = 'rewards';
  readonly label = 'Rewards';
  readonly dark = false;
  readonly flash = new THREE.Color('#dff0ff');
  readonly clear = new THREE.Color('#5a93d6');
  grain = 0.05;
  vignette = 0.2;
  readonly beats: TextBeat[] = [
    {
      from: 0.08,
      to: 0.5,
      eyebrow: '05 \u2014 Rewards',
      html: 'Get rewarded.<br />Own the <em>network.</em>',
      body: 'Earn Root points for every gigabyte you share. The people who power the network are the people who own it.',
      size: 'l',
      y: 0.62,
      light: true,
    },
    {
      from: 0.58,
      to: 0.9,
      html: 'Paid for what you<br />already <em>have.</em>',
      size: 'xl',
      y: 0.6,
      light: true,
    },
  ];

  private backdrop!: THREE.Mesh;
  private plate: VideoPlate | null = null;
  private plane!: THREE.Sprite;
  private bills: Bill[] = [];
  private readonly plateZ = -90;
  private planePos = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(private videoSrc: string | null = null) {
    super();
  }

  init(ctx: Parameters<Chapter['init']>[0]) {
    super.init(ctx);
    this.scene.add(new THREE.HemisphereLight('#dbe9ff', '#2e5a92', 1.5));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.6);
    sun.position.set(-8, 14, 6);
    this.scene.add(sun);

    // ---- ocean plate: a looping film of the swell, poster until it streams in
    const ocean = ctx.assets.get('ocean') as THREE.Texture | undefined;
    let mat: THREE.MeshBasicMaterial;
    if (this.videoSrc) {
      this.plate = new VideoPlate(this.videoSrc, ocean);
      mat = this.plate.material;
    } else {
      if (ocean) ocean.wrapS = ocean.wrapT = THREE.ClampToEdgeWrapping;
      mat = new THREE.MeshBasicMaterial({ map: ocean ?? null, color: ocean ? '#ffffff' : '#4a86c8' });
    }
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.backdrop.position.set(0, 0, this.plateZ);
    this.scene.add(this.backdrop);

    // ---- the plane: a tiny cut-out far away
    const planeTex = ctx.assets.get('plane') as THREE.Texture | undefined;
    this.plane = new THREE.Sprite(new THREE.SpriteMaterial({ map: planeTex ?? null, color: planeTex ? '#ffffff' : '#dddddd', transparent: true, depthWrite: false }));
    const img = planeTex?.image as { width?: number; height?: number } | undefined;
    const ar = img?.width && img?.height ? img.height / img.width : 0.66;
    this.plane.scale.set(7.5, 7.5 * ar, 1);
    this.scene.add(this.plane);

    // ---- the notes
    const texKeys = ['bill100f', 'bill100b', 'bill1f', 'bill1b'];
    const texs = texKeys.map((k) => ctx.assets.get(k) as THREE.Texture | undefined);
    for (const t of texs) if (t) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    const n = ctx.mobile ? 8 : 14;
    const geo = new THREE.PlaneGeometry(2.36, 1, 12, 4);
    // resting places near the camera, packed so no two notes ever overlap on screen
    const ends: { end: THREE.Vector3; size: number }[] = [];
    const camZ = 13;
    let tries = 0;
    while (ends.length < n && tries < 4000) {
      const j = tries++;
      const size = 0.7 + hash(j * 5.7 + 0.3) * 0.9;
      const end = new THREE.Vector3((hash(j * 2.1 + 0.1) - 0.5) * 26, (hash(j * 4.4 + 0.7) - 0.55) * 14, 1 + hash(j * 6.6 + 0.9) * 6);
      const d = camZ - end.z;
      const r = (size * 1.35) / d; // projected half-diagonal
      let ok = true;
      for (const o of ends) {
        const od = camZ - o.end.z;
        const or = (o.size * 1.35) / od;
        const dx = end.x / d - o.end.x / od;
        const dy = end.y / d - o.end.y / od;
        if (Math.hypot(dx, dy) < r + or + 0.03) {
          ok = false;
          break;
        }
      }
      if (ok) ends.push({ end, size });
    }
    for (let i = 0; i < ends.length; i++) {
      const seed = hash(i * 3.3 + 0.2);
      const hundred = hash(i * 7.1) > 0.35;
      const front = texs[hundred ? 0 : 2];
      const back = texs[hundred ? 1 : 3];
      const group = new THREE.Group();
      const mats: THREE.MeshStandardMaterial[] = [];
      const make = (tex: THREE.Texture | undefined, flip: boolean) => {
        // paper in full sun: lift the shadow side so the print stays readable while tumbling
        const m = new THREE.MeshStandardMaterial({
          map: tex ?? null,
          color: tex ? '#ffffff' : '#c9d3b8',
          emissive: '#ffffff',
          emissiveMap: tex ?? null,
          emissiveIntensity: 0.42,
          roughness: 0.8,
          metalness: 0,
          side: THREE.FrontSide,
        });
        this.addFlutter(m, seed + (flip ? 0.5 : 0));
        const mesh = new THREE.Mesh(geo, m);
        if (flip) mesh.rotation.y = Math.PI;
        group.add(mesh);
        mats.push(m);
      };
      make(front, false);
      make(back, true);
      const { end, size } = ends[i];
      group.scale.setScalar(size);
      // gentle tumble
      const spin = new THREE.Vector3((hash(i * 8.8) - 0.5) * 1.1, (hash(i * 9.9) - 0.5) * 1.4, (hash(i * 1.9) - 0.5) * 0.8);
      this.scene.add(group);
      this.bills.push({ group, seed, start: 0.02 + hash(i * 11.3) * 0.62, dur: 0.34 + hash(i * 12.7) * 0.22, size, end, spin, mats });
    }

    this.camera.position.set(0, 0, 14);
  }

  /** paper flutter: bend the note along its length with a travelling wave */
  private addFlutter(m: THREE.MeshStandardMaterial, phase: number) {
    const u = { uTime: { value: 0 }, uPhase: { value: phase * 20 } };
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = u.uTime;
      shader.uniforms.uPhase = u.uPhase;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uPhase;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float bend = sin(position.x * 2.2 + uTime * 3.1 + uPhase) * 0.09 + sin(position.y * 4.0 - uTime * 2.3 + uPhase) * 0.04;
           transformed.z += bend;`,
        );
    };
    m.userData.u = u;
  }

  prefetch() {
    this.plate?.prefetch();
  }
  enter() {
    this.plate?.play();
  }
  leave() {
    this.plate?.pause();
  }

  update(f: ChapterFrame) {
    const t = f.t;
    const px = this.ctx.pointer.x;
    const py = this.ctx.pointer.y;
    this.plate?.update();

    // ---- plane crosses the sky, upper left to upper right, far away
    const pk = smooth(-0.25, 1.1, t);
    this.planePos.set(lerp(-26, 22, pk), 10.5 + Math.sin(f.time * 0.5) * 0.35 - pk * 1.5, -72);
    this.plane.position.copy(this.planePos);
    this.plane.material.rotation = Math.sin(f.time * 0.4) * 0.03 - 0.06;

    // ---- notes: leave the ramp, tumble toward the camera, hang nearby once arrived
    for (const b of this.bills) {
      const s = smooth(b.start, b.start + b.dur, t);
      const e = easeOut(s);
      const u = b.mats[0].userData.u as { uTime: { value: number } };
      u.uTime.value = f.time + b.seed * 10;
      (b.mats[1].userData.u as { uTime: { value: number } }).uTime.value = f.time + b.seed * 10;
      if (s <= 0) {
        b.group.visible = false;
        continue;
      }
      b.group.visible = true;
      // origin: just behind the plane, where the ramp is
      this.tmp.copy(this.planePos).add(new THREE.Vector3(-3.5, -1.2, 1));
      // path: arc down and toward us with a sideways drift
      // drift fades out as the note arrives so the packed resting spots stay clear of each other
      const settle = 1 - smooth(0.7, 1, e);
      const x = lerp(this.tmp.x, b.end.x, e) + Math.sin(f.time * 0.5 + b.seed * 30) * 0.5 * settle;
      const y = lerp(this.tmp.y, b.end.y, e) - Math.sin(e * Math.PI) * 4 + Math.sin(f.time * 0.6 + b.seed * 20) * 0.3 * settle;
      const z = lerp(this.tmp.z, b.end.z, e);
      b.group.position.set(x, y, z);
      // tumble slows as the note settles near the camera
      const w = 0.3 + (1 - e) * 0.7;
      b.group.rotation.set(f.time * b.spin.x * w + b.seed * 6, f.time * b.spin.y * w + b.seed * 9, f.time * b.spin.z * w + b.seed * 3);
      // a distant note is tiny; scale only conveys perspective here
      b.group.scale.setScalar(b.size);
    }

    // ---- camera: slow push, looking a touch up toward the plane
    const k = smooth(-0.2, 1.05, t);
    this.camera.position.set(px * 0.7, py * 0.5 + 0.4, lerp(15, 12, k));
    this.camera.lookAt(px * 0.3, 1.2 + k * 0.6, -20);
    this.camera.fov = this.fov + 4 - k * 4;
    this.camera.updateProjectionMatrix();

    // ocean plate overfills the view; drifts slightly against the pointer
    const dist = this.camera.position.z - this.plateZ;
    const vh = 2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * 1.3;
    const vw = vh * this.camera.aspect;
    let pw = vw;
    let ph = pw / (16 / 9);
    if (ph < vh) {
      ph = vh;
      pw = ph * (16 / 9);
    }
    this.backdrop.scale.set(pw, ph, 1);
    this.backdrop.position.set(-px * 2 + this.camera.position.x, 4 + this.camera.position.y * 0.5, this.plateZ);
  }

  dispose() {
    super.dispose();
    this.plate?.dispose();
  }
}
