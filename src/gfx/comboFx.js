// Combo-chain looks (docs/COMBO.md §1): the finisher reads clearly but small, in the skill's colour. Built on the Charge
// looks' pooled pieces (gfx/chargeFx.js: the ground ring; SpellFX's additive sparkle atlas), so nothing new is allocated
// per finisher and the same readability caps hold: no screen flashes, a ring that stays under 1.5 m.
//   finisher(at, color): as the finisher goes, a pop of sparkles at the weapon paw;
//   land(at, color, r):  where it lands (the first foe it hits), a thin ground ring and a small star burst at chest height.
import * as THREE from 'three';
import { chargeFx } from './chargeFx.js';
import { F } from './spellFx.js';

const _c = new THREE.Color(), _p = new THREE.Vector3();
const WHITE = new THREE.Color('#ffffff');

export const comboFx = G => ({
  /** the finisher leaves the paw: a few sparkles in its colour (no flash: the skill's own swing is the star) */
  finisher(at, color) {
    if (!G?.vfx) return;
    const sp = chargeFx(G).spell; _c.set(color);
    sp.sparkBurst(at, { n: 7, color: _c, speed: 2.6, size: 0.24, life: 0.4, frame: F.STAR, up: 1.1 });
    sp.sparkBurst(at, { n: 3, color: WHITE, speed: 3.2, size: 0.15, life: 0.28, frame: F.SPARK });
  },
  /** the finisher lands on a foe: a ring at its feet and a star burst at its middle (r: the foe's body radius) */
  land(at, color, r = 0.5, h = 1) {
    if (!G?.vfx) return;
    const cf = chargeFx(G), sp = cf.spell; _c.set(color);
    const gy = G.world?.heightAt ? G.world.heightAt(at.x, at.z) : at.y || 0; // (the ground under the foe: its feet may sit on a rise)
    _p.set(at.x, gy, at.z);
    cf.burst(_p, { r: Math.min(1.6, 0.9 + r), life: 0.34, color: _c, w: 0.12, a: 0.9 });
    _p.y = gy + Math.min(1.2, h * 0.55);
    sp.sparkBurst(_p, { n: 12, color: _c, speed: 3.6, size: 0.34, life: 0.45, frame: F.GLOWSTAR, up: 1.1 });
    sp.sparkBurst(_p, { n: 5, color: WHITE, speed: 4.2, size: 0.18, life: 0.32, frame: F.SPARK });
  },
});
