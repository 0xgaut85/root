import * as THREE from 'three';

/**
 * A looping, muted background video as a texture. Shows the poster until
 * the first frame is decodable, then swaps to the live video texture.
 */
export class VideoPlate {
  readonly material: THREE.MeshBasicMaterial;
  private video: HTMLVideoElement;
  private videoTex: THREE.VideoTexture | null = null;
  private started = false;
  private ready = false;

  constructor(src: string, poster?: THREE.Texture) {
    if (poster) poster.wrapS = poster.wrapT = THREE.ClampToEdgeWrapping;
    this.material = new THREE.MeshBasicMaterial({ map: poster ?? null, color: '#ffffff', fog: false });
    const v = document.createElement('video');
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'none';
    v.crossOrigin = 'anonymous';
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.src = src;
    // kept in the document (off-screen) so every browser keeps decoding it
    v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;';
    v.setAttribute('aria-hidden', 'true');
    document.body.appendChild(v);
    this.video = v;
    v.addEventListener('loadeddata', () => {
      this.videoTex = new THREE.VideoTexture(v);
      this.videoTex.colorSpace = THREE.SRGBColorSpace;
      this.videoTex.minFilter = THREE.LinearFilter;
      this.videoTex.generateMipmaps = false;
    });
    v.addEventListener('playing', () => {
      this.ready = true;
    });
  }

  /** Begin buffering (call one chapter early). */
  prefetch() {
    if (this.video.preload === 'none') {
      this.video.preload = 'auto';
      this.video.load();
    }
  }

  /** Start playback (call when the chapter is about to show). */
  play() {
    this.prefetch();
    if (this.started) return;
    this.started = true;
    this.video.play().catch(() => {
      // autoplay blocked: retry on the next user gesture
      const retry = () => {
        this.video.play().catch(() => {});
        window.removeEventListener('pointerdown', retry);
        window.removeEventListener('wheel', retry);
        window.removeEventListener('touchstart', retry);
      };
      window.addEventListener('pointerdown', retry, { once: true });
      window.addEventListener('wheel', retry, { once: true });
      window.addEventListener('touchstart', retry, { once: true });
    });
  }

  pause() {
    if (!this.video.paused) this.video.pause();
    this.started = false;
  }

  /** Per frame: swap in the video once it is actually rendering frames. */
  update() {
    if (this.ready && this.videoTex && this.material.map !== this.videoTex) {
      this.material.map = this.videoTex;
      this.material.needsUpdate = true;
    }
  }

  dispose() {
    this.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.video.remove();
    this.videoTex?.dispose();
    this.material.dispose();
  }
}
