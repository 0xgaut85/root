import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Chapter, ChapterFrame, TextBeat, smooth, lerp, clamp01, hash } from '../Chapter';

/** Placement of a hand model: rotation, target length along x, offset. */
export interface HandPose {
  rotation: [number, number, number];
  length: number;
  offset: [number, number, number];
  mirror?: boolean;
}

interface Book {
  group: THREE.Group;
  /** the two boards of the book, each hinged at the spine; the front one carries the front cover */
  front: THREE.Group;
  back: THREE.Group;
  /** the book's width (cover) and thickness, for a height of 1 */
  w: number;
  d: number;
  /** shelf position on the plate, in plate uv */
  u: number;
  v: number;
  /** height of the spine as a fraction of the plate height */
  spineH: number;
  /** scroll position at which it leaves the shelf */
  start: number;
  /** where it hangs once free, relative to the plate */
  du: number;
  dv: number;
  /** how far it comes toward the camera (world units off the plate) */
  lift: number;
  spin: number;
  seed: number;
}

/**
 * Chapter 04 — a private circular library, a 4K still. Three books leave
 * the curved shelves as you scroll, turn over in the air and open. In front,
 * a human hand and a robotic hand are already clasped; the scroll drives the
 * shake while the camera pushes in on the grip.
 */
export class Handshake extends Chapter {
  readonly id = 'handshake';
  readonly label = 'The deal';
  readonly dark = true;
  readonly flash = new THREE.Color('#1a120b');
  readonly clear = new THREE.Color('#0d0906');
  grain = 0.08;
  vignette = 0.4;
  readonly beats: TextBeat[] = [
    {
      from: 0.04,
      to: 0.42,
      eyebrow: '03 \u2014 The deal',
      html: 'Humans supply.<br />Machines <em>learn.</em>',
      size: 'l',
      y: 0.22,
    },
    {
      from: 0.6,
      to: 0.9,
      html: 'Fair terms. Metered.<br /><em>Auditable.</em>',
      body: 'Every buyer is verified, every request is logged, every gigabyte is paid for.',
      size: 'm',
      y: 0.8,
    },
  ];

  private clasp = new THREE.Group();
  private contactLight!: THREE.PointLight;
  private backdrop!: THREE.Mesh;
  private books: Book[] = [];
  private readonly plateZ = -40;
  private plateAspect = 16 / 9;
  private plateW = 1;
  private plateH = 1;
  private lookTarget = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private rest = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private right = new THREE.Vector3();
  private up = new THREE.Vector3();

  constructor(private claspPose: HandPose) {
    super();
  }

  init(ctx: Parameters<Chapter['init']>[0]) {
    super.init(ctx);

    const pmrem = new THREE.PMREMGenerator(ctx.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environmentIntensity = 0.45;

    // ---- lights: warm lamp key, cool skylight rim
    this.scene.add(new THREE.HemisphereLight('#6b5a48', '#050403', 0.45));
    const key = new THREE.SpotLight('#ffd6a8', 900, 90, Math.PI / 5, 0.6, 1.8);
    key.position.set(6, 13, 9);
    key.target.position.set(0, 0, 0);
    this.scene.add(key, key.target);
    const rim = new THREE.SpotLight('#7ea0e0', 700, 90, Math.PI / 4, 0.7, 1.8);
    rim.position.set(-8, 6, -12);
    rim.target.position.set(0, 0, 0);
    this.scene.add(rim, rim.target);
    const fill = new THREE.PointLight('#ffb070', 120, 50, 1.9);
    fill.position.set(-9, 1, 8);
    this.scene.add(fill);
    this.contactLight = new THREE.PointLight('#ffe2b8', 12, 14, 2);
    this.contactLight.position.set(0, 0.6, 2.5);
    this.scene.add(this.contactLight);

    // ---- backdrop plate (4K still)
    const plate = ctx.assets.get('library') as THREE.Texture | undefined;
    if (plate) {
      plate.wrapS = plate.wrapT = THREE.ClampToEdgeWrapping;
      plate.anisotropy = 8;
      const img = plate.image as { width?: number; height?: number } | undefined;
      if (img?.width && img?.height) this.plateAspect = img.width / img.height;
    }
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: plate ?? null, color: plate ? '#ffffff' : '#241812', fog: false }));
    this.backdrop.position.set(0, 0, this.plateZ);
    this.scene.add(this.backdrop);

    // ---- three books, resting on the shelves of the plate. Each is a real solid: two boards hinged
    // at the spine, a block of pages between them, so it has thickness when it turns and opens.
    const tex = (key: string) => {
      const t = ctx.assets.get(key) as THREE.Texture | undefined;
      if (t) {
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.anisotropy = 4;
      }
      const img = t?.image as { width?: number; height?: number } | undefined;
      return { t, ar: img?.width && img?.height ? img.width / img.height : 1 };
    };
    // materials: worn leather (a hint of clearcoat for the sheen of old calf), soft matte paper. A
    // little emissive so the photographed detail is not lost in the room's low light.
    const leatherMat = (map: THREE.Texture | undefined, tint: string) =>
      new THREE.MeshPhysicalMaterial({
        map: map ?? null,
        color: map ? '#ffffff' : tint,
        roughness: 0.62,
        metalness: 0,
        clearcoat: 0.12,
        clearcoatRoughness: 0.55,
        envMapIntensity: 0.6,
        emissive: '#ffffff',
        emissiveMap: map ?? null,
        emissiveIntensity: map ? 0.16 : 0,
        fog: false,
      });
    const paperMat = (map: THREE.Texture | undefined, tint: string) =>
      new THREE.MeshStandardMaterial({
        map: map ?? null,
        color: map ? '#ffffff' : tint,
        roughness: 0.92,
        metalness: 0,
        envMapIntensity: 0.3,
        emissive: '#ffffff',
        emissiveMap: map ?? null,
        emissiveIntensity: map ? 0.1 : 0,
        fog: false,
      });
    // the fore-edge photograph: pages stacked along its v. On the top and bottom of the block v runs
    // along the thickness already; on the fore-edge it is u, so that copy is turned a quarter
    const edgeTex = tex('foreEdge').t;
    let edgeTurned: THREE.Texture | undefined;
    if (edgeTex) {
      edgeTex.wrapS = edgeTex.wrapT = THREE.RepeatWrapping;
      edgeTurned = edgeTex.clone();
      edgeTurned.center.set(0.5, 0.5);
      edgeTurned.rotation = Math.PI / 2;
      edgeTurned.needsUpdate = true;
    }
    const edgeFlat = paperMat(edgeTex, '#e6dcc4');
    const edgeSide = paperMat(edgeTurned, '#e6dcc4');
    // half a spread: the left page for the front board's block, the right for the back board's
    const half = (spread: THREE.Texture | undefined, right: boolean) => {
      if (!spread) return undefined;
      const t = spread.clone();
      t.repeat.set(0.5, 1);
      t.offset.set(right ? 0.5 : 0, 0);
      t.needsUpdate = true;
      return t;
    };
    // u, v of each spine on the plate and its height as a fraction of the plate (measured on the
    // retouched photograph, see the asset pipeline), then start and where it hangs once free: a
    // screen position in fractions of the visible half-frame, all three at one depth so the gaps
    // between them are exactly equal
    const specs: [number, number, number, number, number, number, number][] = [
      [0.1129, 0.5505, 0.0949, 0.06, -0.6, 0.42, 16], // left bookcase, middle row
      [0.4974, 0.5861, 0.0597, 0.22, 0.0, 0.42, 16], // centre bookcase, middle row: rises above the hands
      [0.8609, 0.5424, 0.088, 0.38, 0.6, 0.42, 16], // right bookcase, middle row
    ];
    specs.forEach(([u, v, spineH, start, du, dv, lift], i) => {
      const spine = tex(`spine${i}`);
      const cover = tex(`cover${i}`);
      const backCover = tex(`back${i}`);
      const spread = tex(`pages${i}`).t;
      // for a height of 1: the cover's width from its photograph, the thickness from the spine's
      const w = Math.max(0.5, Math.min(0.8, cover.ar));
      const d = Math.max(0.15, Math.min(0.26, spine.ar));
      const bt = 0.022; // a board's thickness
      const ov = 0.018; // the boards' overhang beyond the pages (the squares)
      const coverMat = leatherMat(cover.t, '#c9b58f');
      const backMat = leatherMat(backCover.t ?? cover.t, '#c9b58f');
      const plain = leatherMat(undefined, '#b9a47c');
      const pastedown = paperMat(undefined, '#d9cdb3');
      const leftPage = paperMat(half(spread, false), '#efe6d2');
      const rightPage = paperMat(half(spread, true), '#efe6d2');
      // box faces: +x, -x, +y, -y, +z, -z. Each side of the book is a board with half the text block
      // glued to its inside, hinged at x = 0. The block is set in from the board on three sides.
      const side = (isFront: boolean) => {
        const sgn = isFront ? 1 : -1;
        const board = new THREE.BoxGeometry(w, 1, bt);
        board.translate(w / 2, 0, sgn * (d / 2 - bt / 2));
        const outer = isFront ? coverMat : backMat;
        const boardMesh = new THREE.Mesh(board, [plain, plain, plain, plain, isFront ? outer : pastedown, isFront ? pastedown : outer]);
        const half = (d - 2 * bt) / 2;
        const block = new THREE.BoxGeometry(w - ov, 1 - 2 * ov, half);
        block.translate((w - ov) / 2, 0, sgn * (half / 2));
        // the page faces the other side; for the front block that is its -z face, whose u runs from
        // the fore-edge to the hinge, which is how the left page reads (gutter on the right)
        const blockMesh = new THREE.Mesh(block, [edgeSide, pastedown, edgeFlat, edgeFlat, isFront ? pastedown : rightPage, isFront ? leftPage : pastedown]);
        const pivot = new THREE.Group();
        pivot.add(boardMesh, blockMesh);
        return pivot;
      };
      const front = side(true);
      const back = side(false);
      // the spine: a rounded back along the hinge, on the back board (it barely moves when the book
      // opens). A half cylinder facing -x, its u running from the back board round to the front.
      const sg = new THREE.CylinderGeometry(d / 2, d / 2, 1, 24, 1, false, Math.PI, Math.PI);
      const spineMesh = new THREE.Mesh(sg, [leatherMat(spine.t, '#c9b58f'), plain, plain]);
      back.add(spineMesh);
      const group = new THREE.Group();
      group.add(front, back);
      group.visible = false;
      this.scene.add(group);
      this.books.push({ group, front, back, w, d, u, v, spineH, start, du, dv, lift, spin: (hash(i * 4.1 + 0.3) - 0.5) * 1.2, seed: hash(i * 7.3) });
    });

    // ---- the clasped hands
    const clasp = ctx.assets.get('clasp') as THREE.Object3D | undefined;
    if (clasp) this.clasp.add(this.place(clasp.clone(true), this.claspPose));
    this.clasp.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material) (m.material as THREE.MeshStandardMaterial).envMapIntensity = 0.7;
    });
    this.scene.add(this.clasp);

    this.camera.position.set(0, 1.5, 14);
  }

  /** normalise a model: centre it, scale it, orient it via the pose */
  private place(model: THREE.Object3D, pose: HandPose) {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const inner = new THREE.Group();
    model.position.sub(center);
    inner.add(model);
    if (pose.mirror) inner.scale.x = -1;
    const rot = new THREE.Group();
    rot.rotation.set(pose.rotation[0], pose.rotation[1], pose.rotation[2]);
    rot.add(inner);
    rot.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(rot);
    const s2 = b2.getSize(new THREE.Vector3());
    const scale = pose.length / Math.max(s2.x, 1e-3);
    const outer = new THREE.Group();
    outer.scale.setScalar(scale);
    outer.add(rot);
    outer.position.set(pose.offset[0], pose.offset[1], pose.offset[2]);
    return outer;
  }

  update(f: ChapterFrame) {
    const t = f.t;
    const px = this.ctx.pointer.x;
    const py = this.ctx.pointer.y;

    // ---- the shake: hands are clasped from the start; scrolling drives the pumps.
    const pumpPhase = smooth(0.02, 0.78, t);
    const pump = Math.sin(pumpPhase * Math.PI * 6) * (1 - smooth(0.55, 0.85, t)) * (0.4 + 0.6 * (1 - pumpPhase));
    const breathe = Math.sin(f.time * 0.9) * 0.05;
    this.clasp.position.set(0, -0.35 + pump * 0.42 + breathe * 0.2 + py * 0.15, 0);
    this.clasp.rotation.z = pump * 0.085;
    this.clasp.rotation.x = pump * 0.06;
    this.clasp.rotation.y = px * 0.14 + Math.sin(f.time * 0.25) * 0.03 - 0.08;
    this.contactLight.intensity = 14 + Math.max(0, -pump) * 40;

    // ---- camera: three-quarter view, pushing in on the grip
    const k = smooth(-0.2, 1.05, t);
    const z = lerp(17.5, 9.5, k);
    const y = lerp(2.4, 1.0, k);
    const x = lerp(-2.0, 1.4, k) + px * 0.9;
    this.camera.position.set(x, y + py * 0.4, z);
    this.lookTarget.set(0, -0.3 + clamp01(k) * 0.2, 0);
    this.camera.lookAt(this.lookTarget);
    this.camera.fov = this.fov - k * 5;
    this.camera.updateProjectionMatrix();

    // ---- plate: centred where the view axis meets its depth, overfilled so it never shows an edge
    const dir = this.tmp.copy(this.lookTarget).sub(this.camera.position).normalize();
    const s = (this.plateZ - this.camera.position.z) / dir.z;
    const cx = this.camera.position.x + dir.x * s;
    const cy = this.camera.position.y + dir.y * s;
    const dist = this.camera.position.z - this.plateZ;
    // a small overfill only: the room is 3:2, so on any landscape screen the full width is in view
    const vh = 2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * 1.06;
    const vw = vh * this.camera.aspect;
    let pw = vw;
    let ph = pw / this.plateAspect;
    if (ph < vh) {
      ph = vh;
      pw = ph * this.plateAspect;
    }
    this.plateW = pw;
    this.plateH = ph;
    this.backdrop.scale.set(pw, ph, 1);
    // parallax: the room slides a touch against the pointer
    this.backdrop.position.set(cx - px * 0.8, cy - py * 0.5, this.plateZ);

    // ---- books. Each one is a real book of the photograph: the plate has been retouched so its slot
    // is empty, and a solid book wearing that spine sits exactly in the slot until it leaves. It
    // slides out toward the camera, turns to show its cover, then opens and hangs.
    for (const b of this.books) {
      const r = smooth(b.start, b.start + 0.3, t);
      const shelf = this.tmp.set(this.backdrop.position.x + (b.u - 0.5) * this.plateW, this.backdrop.position.y + (b.v - 0.5) * this.plateH, this.plateZ + 0.4);
      if (r <= 0) {
        // resting in its slot: spine to the room, the rest of the book in the shelf
        b.group.visible = true;
        b.group.position.copy(shelf);
        b.group.rotation.set(0, Math.PI / 2, 0);
        b.group.scale.setScalar(this.plateH * b.spineH);
        b.front.rotation.y = b.back.rotation.y = 0;
        b.front.position.x = b.back.position.x = 0;
        continue;
      }
      b.group.visible = true;
      // where it hangs: a fixed spot on the screen at a fixed distance in front of the camera
      // (b.du, b.dv are fractions of the half-frame at that depth; b.lift is the depth)
      const hh = b.lift * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
      const hw = hh * this.camera.aspect;
      const rest = this.rest
        .copy(this.camera.position)
        .addScaledVector(this.fwd.set(0, 0, -1).applyQuaternion(this.camera.quaternion), b.lift)
        .addScaledVector(this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion), b.du * hw)
        .addScaledVector(this.up.set(0, 1, 0).applyQuaternion(this.camera.quaternion), b.dv * hh);
      // it leaves the slot toward the eye first, then swings up to its place: an eased arc
      const e = r * r * (3 - 2 * r);
      const pos = b.group.position.copy(shelf).lerp(rest, e);
      pos.y += Math.sin(r * Math.PI) * hh * 0.06 + Math.sin(f.time * 0.7 + b.seed * 20) * 0.2 * r;
      // starts at the true size of the book on its shelf; a little larger than life once it is free.
      // On narrow screens the three must still fit side by side with the same gap between them.
      const free = Math.min(0.058 * this.plateH, hw * 0.27);
      b.group.scale.setScalar(lerp(this.plateH * b.spineH, free, e));
      // the turn: the book swings round from spine-on to cover-on, and once it faces us the front
      // board opens on its hinge while the back board eases the other way, a shallow V toward the eye
      const turn = smooth(0.04, 0.6, r);
      const open = smooth(0.6, 0.9, r);
      b.group.rotation.y = lerp(Math.PI / 2, -0.1 + px * 0.2, turn);
      b.group.rotation.z = b.spin * r * 0.9 + Math.sin(f.time * 0.5 + b.seed * 10) * 0.06 * r;
      b.group.rotation.x = Math.sin(f.time * 0.4 + b.seed * 30) * 0.08 * r - 0.1 * turn;
      // (a board's free edge is +x; a negative turn about y brings it toward the viewer)
      b.front.rotation.y = -open * Math.PI * 0.8;
      b.back.rotation.y = -open * Math.PI * 0.18;
      // tip it back a little as it opens so we look down onto the pages and see the boards' depth
      b.group.rotation.x -= open * 0.3;
      // on the shelf the spine sits on the group origin (so it fills its slot exactly); in the air
      // the book is centred on the origin, closed ([0, w] from the hinge) and open ([-w, w]) alike
      b.front.position.x = b.back.position.x = (-b.w / 2) * turn + open * b.w * 0.5;
    }
  }
}
