// Showcase entries for /?test=biomeA (src/tests/biomeA.js): the Bamboo Grove assets. Each entry places one item (or a
// small group) through the Placer at (x, z); w = cell width multiplier, fy = camera focus height with &focus.
import * as THREE from 'three';
import * as F from './bambooFlora.js';
import * as Pr from './bambooProps.js';
import { M } from './bambooKit.js';

const one = (parts, extra = {}) => ({ place: (P, x, z) => P.multi(parts(), x, 0, z), ...extra });
const piece = (fn, extra = {}) => ({ place: (P, x, z) => P.piece(fn(), x, z, extra.rot ?? 0), ...extra });
const bamboo = {};
for (const k of F.STAND_KINDS) for (const v of [0, 1]) bamboo[`stand:${k}${v}`] = { w: k === 'wall' ? 1.6 : k === 'young' ? 0.8 : 1.3, fy: 3, place: (P, x, z) => P.multi(F.stand(k, v), x, 0, z) };
Object.assign(bamboo, {
  shoots: { w: 0.8, place: (P, x, z) => { for (let i = 0; i < 4; i++) P.multi(F.shoot(i), x + (i % 2) * 0.5 - 0.25, 0, z + (i >> 1) * 0.5 - 0.25); } },
  ferns: { place: (P, x, z) => { P.multi(F.fern(0), x - 0.5, 0, z); P.multi(F.fern(1, { big: 1.4 }), x + 0.6, 0, z + 0.2); } },
  hostaBlue: one(() => F.hosta(0, 'blue'), { w: 0.8 }),
  hostaVar: one(() => F.hosta(1, 'variegated'), { w: 0.8 }),
  hostaGold: one(() => F.hosta(2, 'gold'), { w: 0.8 }),
  moss: { place: (P, x, z) => { P.multi(F.mossMound(0), x - 0.4, 0, z); P.multi(F.mossMound(1), x + 0.6, 0, z + 0.4); } },
  boulders: { place: (P, x, z) => { P.multi(F.mossBoulder(0), x - 0.5, 0, z, { s: 1.3 }); P.multi(F.mossBoulder(1), x + 0.8, 0, z + 0.3, { s: 0.8 }); } },
  litter: { place: (P, x, z) => { P.multi(F.litter(0, 'bamboo'), x, 0, z); P.multi(F.litter(1, 'bamboo'), x + 0.8, 0, z + 0.6); } },
});
const bambooProps = {
  lantern: piece(() => Pr.lantern(0), { w: 0.8 }),
  path: { w: 1.2, place: (P, x, z) => { for (let i = 0; i < 7; i++) for (const s of [-1, 1]) P.put('d:stone', Pr.slab(i * 2 + (s > 0 ? 1 : 0)), x + i * 0.45 - 1.4 + s * 0.06, 0, z + s * 0.36 + (i % 2) * 0.1, { rot: i }); } },
  steps: { w: 1.1, place: (P, x, z) => { for (let i = 0; i < 3; i++) P.put('d:stone', Pr.step(i), x, i * 0.2, z - i * 0.48); } },
  shishiOdoshi: { w: 1.1, fy: 0.5, place: (P, x, z, { anims }) => {
    const s = Pr.shishiOdoshi(0); P.piece(s.pc, x, z, 0);
    const m = P.mesh(new THREE.Mesh(s.rocker.geo, M('d:body'))); m.castShadow = true; m.receiveShadow = true;
    m.position.set(x + s.rocker.pivot.x, s.rocker.pivot.y, z + s.rocker.pivot.z);
    anims.push((dt, t) => { m.rotation.z = Pr.shishiCycle(t).a; });
  } },
  ruinedShrine: piece(() => Pr.ruinedShrine(0), { w: 2.2, fy: 1 }),
  footbridge: piece(() => Pr.footbridge(0), { w: 1.6 }),
  fence: piece(() => Pr.fence(0), { w: 1.2 }),
  chimes: piece(() => Pr.chimes(0), { w: 1.3, fy: 1.8 }),
  torii: piece(() => Pr.torii(0), { w: 1.4, fy: 2 }),
  iwakura: piece(() => Pr.iwakura(0), { w: 1.1 }),
  bench: piece(() => Pr.bambooBench(0), { w: 0.9 }),
};
export const SHOWCASE = { bamboo, bambooProps };
