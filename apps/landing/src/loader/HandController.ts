import * as THREE from 'three';
import gsap from 'gsap';

const HISTORY = 8;
const LERP = 0.2;
const ENTRY_Y = -3;
const ENTRY_DURATION = 0.9;

/**
 * Positions a 3D hand so that its index fingertip follows the cursor,
 * with a small history buffer + lerp for a weighty, organic feel.
 * Enters from below the viewport, exits the same way.
 */
export class HandController {
  group = new THREE.Group();
  private camera: THREE.PerspectiveCamera;
  private distance: number;

  private hx = new Float32Array(HISTORY);
  private hy = new Float32Array(HISTORY);
  private head = 0;
  private size = 0;

  private current = new THREE.Vector3();
  private target = new THREE.Vector3();
  private initialized = false;
  private entered = false;
  private exited = false;
  private entryY = ENTRY_Y;
  private tween: gsap.core.Tween | null = null;

  /** offset (in group space, after scale) from group origin to fingertip */
  private tipOffset = new THREE.Vector3();
  private tiltTarget = 0;
  private tilt = 0;

  constructor(model: THREE.Object3D, camera: THREE.PerspectiveCamera, opts: { heightFrac?: number; distance?: number } = {}) {
    this.camera = camera;
    this.distance = opts.distance ?? 2.2;

    // Normalise: center X/Z, fingertip = highest point (+Y).
    const box = new THREE.Box3().setFromObject(model);
    const sizeV = new THREE.Vector3();
    box.getSize(sizeV);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // visible height of the frustum at `distance`
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const viewH = 2 * this.distance * Math.tan(vFov / 2);
    const wantH = viewH * (opts.heightFrac ?? 0.62);
    const s = wantH / (sizeV.y || 1);

    model.position.set(-center.x, -box.min.y, -center.z); // base at origin
    const inner = new THREE.Group();
    inner.add(model);
    inner.scale.setScalar(s);
    this.group.add(inner);
    this.group.traverse((o) => {
      o.frustumCulled = false;
    });

    this.tipOffset.set(0, sizeV.y * s, 0);
    this.group.visible = false;
    // rest low in the frame until the pointer moves, so the ghost letter stays readable
    this.setCursor(0.12, -0.5);
  }

  enter() {
    if (this.entered) return;
    this.entered = true;
    this.group.visible = true;
    this.tween?.kill();
    this.tween = gsap.to(this, { entryY: 0, duration: ENTRY_DURATION, ease: 'power2.out', overwrite: true });
  }

  exit(onDone?: () => void) {
    if (this.exited) return;
    this.exited = true;
    this.tween?.kill();
    this.tween = gsap.to(this, {
      entryY: ENTRY_Y,
      duration: ENTRY_DURATION,
      ease: 'power2.in',
      overwrite: true,
      onComplete: () => {
        this.group.visible = false;
        onDone?.();
      },
    });
  }

  /** NDC coords (-1..1) */
  setCursor(x: number, y: number) {
    this.hx[this.head] = x;
    this.hy[this.head] = y;
    this.head = (this.head + 1) % HISTORY;
    if (this.size < HISTORY) this.size++;
  }

  setVelocityTilt(vx: number) {
    this.tiltTarget = THREE.MathUtils.clamp(-vx * 0.00035, -0.22, 0.22);
  }

  update() {
    if (!this.entered) return;
    let x = 0;
    let y = 0;
    if (this.size > 0) {
      const i = (this.head - 1 + HISTORY) % HISTORY;
      x = this.hx[i];
      y = this.hy[i];
    }
    this.target.set(x, y, 0.5).unproject(this.camera);
    this.target.sub(this.camera.position).normalize().multiplyScalar(this.distance).add(this.camera.position);
    if (this.initialized) this.current.lerp(this.target, LERP);
    else {
      this.current.copy(this.target);
      this.initialized = true;
    }
    this.tilt += (this.tiltTarget - this.tilt) * 0.08;
    this.group.rotation.z = this.tilt;
    this.group.position.copy(this.current).sub(this.tipOffset);
    this.group.position.y += this.entryY;
  }

  dispose() {
    this.tween?.kill();
    this.group.parent?.remove(this.group);
  }
}
