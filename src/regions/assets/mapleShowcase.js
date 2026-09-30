// Showcase entries for /?test=biomeA&set=maple,mapleProps (src/tests/biomeA.js): the Momiji Hollow assets.
import * as THREE from 'three';
import * as F from './mapleFlora.js';
import * as Pr from './mapleProps.js';
import { M } from './bambooKit.js';

const one = (parts, extra = {}) => ({ place: (P, x, z) => P.multi(parts(), x, 0, z), ...extra });
const piece = (fn, extra = {}) => ({ place: (P, x, z) => P.piece(fn(), x, z, extra.rot ?? 0), ...extra });
const maple = {};
for (const st of F.MAPLE_STYLES) for (const dye of F.DYES) maple[`${st}:${dye}`] = { w: st === 'weep' ? 1.1 : 1.4, fy: 2.5, place: (P, x, z) => P.multi(F.maple(st, 1 + dye.length % 3, dye), x, 0, z) };
Object.assign(maple, {
  ginkgo: { w: 1.3, fy: 2.5, place: (P, x, z) => P.multi(F.ginkgo(1), x, 0, z) },
  persimmon: { w: 1.4, fy: 2.5, place: (P, x, z) => P.multi(F.persimmon(0), x, 0, z) },
  chestnut: { w: 1.5, fy: 2.5, place: (P, x, z) => { P.multi(F.chestnut(0), x, 0, z); P.multi(F.burrs(0), x + 1.3, 0, z + 1.1); } },
  susuki: { place: (P, x, z) => { for (let i = 0; i < 3; i++) P.multi(F.susuki(i), x + i * 0.6 - 0.6, 0, z + (i % 2) * 0.4); } },
  higanbana: { place: (P, x, z) => { P.multi(F.higanbana(0), x - 0.3, 0, z); P.multi(F.higanbana(1), x + 0.4, 0, z + 0.3); } },
  leafPile: one(() => F.leafPile(0)),
  mushrooms: { place: (P, x, z) => { P.multi(F.mushrooms(0, 'shiitake'), x - 0.5, 0, z); P.multi(F.mushrooms(1, 'amanita'), x + 0.2, 0, z + 0.3); P.multi(F.mushrooms(2, 'shimeji'), x + 0.6, 0, z - 0.4); } },
});
const mapleProps = {
  taikobashi: piece(() => Pr.taikobashi(0), { w: 2 }),
  lookout: piece(() => Pr.lookout(0), { w: 1.6 }),
  bench: piece(() => Pr.bench(0)),
  jizo: piece(() => Pr.jizo(0), { w: 0.8 }),
  jizoTrio: piece(() => Pr.jizoTrio()),
  hasa: piece(() => Pr.hasa(0), { w: 1.5 }),
  sheaf: piece(() => Pr.sheaf(0), { w: 0.7 }),
  warabocchi: piece(() => Pr.warabocchi(0), { w: 0.9 }),
  bale: piece(() => Pr.bale(0), { w: 0.8 }),
  kakashi: piece(() => Pr.kakashi(0), { w: 0.9 }),
  tanuki: piece(() => Pr.tanuki(0), { w: 0.8 }),
  komodaru: piece(() => Pr.komodaru(0), { w: 0.6 }),
  lanternLine: piece(() => Pr.lanternLine(0), { w: 1.6 }),
  stubble: { place: (P, x, z) => { for (let i = 0; i < 5; i++) P.multi(Pr.stubble(i), x, 0, z + i * 0.35 - 0.7); } },
  waterfall: { w: 1.4, fy: 2, place: (P, x, z) => {
    const m = P.mesh(new THREE.Mesh(Pr.waterfallGeo({ W: 2.4, H: 4 }), M('fall'))); m.position.set(x, 0, z); m.renderOrder = 2;
    P.multi(Pr.foam(0, { W: 2.4 }), x, 0, z + 0.6);
  } },
};
export const SHOWCASE = { maple, mapleProps };
