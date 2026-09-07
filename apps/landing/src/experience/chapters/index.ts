import type { Chapter } from '../Chapter';
import { Sky } from './Sky';
import { Beams } from './Beams';
import { Roots } from './Roots';
import { Handshake, HandPose } from './Handshake';
import { Thief } from './Thief';
import { Rewards } from './Rewards';
import { Fish } from './Fish';

/** Assets loaded by Experience.preload before chapters are built. */
export const manifest = {
  glb: {
    clasp: '/assets/models/handshake.glb',
  },
  textures: {
    olive: '/assets/scenes/olive.webp',
    oliveBloom: '/assets/scenes/olive_bloom.webp',
    library: '/assets/scenes/library.webp',
    ocean: '/assets/scenes/ocean.webp',
    bowl: '/assets/scenes/bowl.webp',
    fish0: '/assets/cutouts/fish0.webp',
    fish1: '/assets/cutouts/fish1.webp',
    fish2: '/assets/cutouts/fish2.webp',
    fish3: '/assets/cutouts/fish3.webp',
    fish4: '/assets/cutouts/fish4.webp',
    fish5: '/assets/cutouts/fish5.webp',
    fish6: '/assets/cutouts/fish6.webp',
    fish7: '/assets/cutouts/fish7.webp',
    plane: '/assets/textures/plane.webp',
    bill100f: '/assets/textures/bill100_f.webp',
    bill100b: '/assets/textures/bill100_b.webp',
    bill1f: '/assets/textures/bill1_f.webp',
    bill1b: '/assets/textures/bill1_b.webp',
    // the three books, as flat texture scans: front and back covers, spine, and a spread of pages
    cover0: '/assets/books/cover0.webp',
    cover1: '/assets/books/cover1.webp',
    cover2: '/assets/books/cover2.webp',
    back0: '/assets/books/back0.webp',
    back1: '/assets/books/back1.webp',
    back2: '/assets/books/back2.webp',
    spine0: '/assets/books/spine0.webp',
    spine1: '/assets/books/spine1.webp',
    spine2: '/assets/books/spine2.webp',
    pages0: '/assets/books/pages0.webp',
    pages1: '/assets/books/pages1.webp',
    pages2: '/assets/books/pages2.webp',
    foreEdge: '/assets/books/fore_edge.webp',
    thief0: '/assets/cutouts/thief0.webp',
    thief1: '/assets/cutouts/thief1.webp',
    thief2: '/assets/cutouts/thief2.webp',
    thief3: '/assets/cutouts/thief3.webp',
    thief4: '/assets/cutouts/thief4.webp',
    thief5: '/assets/cutouts/thief5.webp',
    crowbar: '/assets/cutouts/crowbar.webp',
    rope: '/assets/cutouts/rope.webp',
    backpack: '/assets/cutouts/backpack.webp',
    flashlight: '/assets/cutouts/flashlight.webp',
    cutters: '/assets/cutouts/cutters.webp',
  },
};

/** Looping background plates (streamed, not part of the preload). */
export const videos = {
  ocean: '/assets/video/ocean.mp4',
};

/** Non-GLTF assets (nothing extra at the moment). */
export async function extraAssets(_assets: Map<string, unknown>) {}

/**
 * Placement of the clasped-hands model. The GLB is oriented as photographed,
 * side-on, human on the left (-x) and robot on the right (+x); tune here if
 * the asset is regenerated.
 */
export const claspPose: HandPose = { rotation: [0, 0, 0], length: 9.6, offset: [0, 0, 0] };

export function buildChapters(): Chapter[] {
  return [new Sky(), new Beams(), new Roots(), new Handshake(claspPose), new Thief(), new Rewards(videos.ocean), new Fish()];
}
