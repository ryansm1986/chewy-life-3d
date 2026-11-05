// Showcase entries for /?test=biomeA&set=trees (src/tests/biomeA.js): every Blender tree (world/treeGlb.js), drawn the way
// the regions draw them (village species through buildTree, the region species through their flora builders).
// &kit shows the procedural kit trees instead.
import { VEG_BUILD } from '../../world/vegetation.js';
import * as MF from './mapleFlora.js';
import * as OF from './onsenFlora.js';
import * as BF from './bambooFlora.js';

const village = kind => (P, x, z, v) => { const t = VEG_BUILD.tree(kind, v); P.multi({ bark: t.trunkGeo, [t.massKey || 'foliage']: t.foliage, ['cards:' + kind]: t.cardGeo }, x, 0, z); };
const trees = {};
for (const kind of ['sakura', 'momiji', 'pine', 'round', 'ginkgo']) for (const v of [0, 1, 2]) trees[`${kind}${v}`] = { w: 1.6, fy: 2.5, place: (P, x, z) => village(kind)(P, x, z, v) };
for (const st of ['dome', 'weep']) for (const v of [0, 1]) trees[`maple-${st}${v}`] = { w: 1.5, fy: 2.5, place: (P, x, z) => P.multi(MF.maple(st, v, 'crimson'), x, 0, z) };
for (const v of [0, 1]) {
  trees[`persimmon${v}`] = { w: 1.5, fy: 2.5, place: (P, x, z) => P.multi(MF.persimmon(v), x, 0, z) };
  trees[`chestnut${v}`] = { w: 1.5, fy: 2.5, place: (P, x, z) => P.multi(MF.chestnut(v), x, 0, z) };
  trees[`snowFir${v}`] = { w: 1.5, fy: 2.5, place: (P, x, z) => P.multi(OF.snowFir(v), x, 0, z) };
  trees[`birch${v}`] = { w: 1.3, fy: 2.5, place: (P, x, z) => P.multi(OF.birch(v), x, 0, z) };
  for (const k of BF.STAND_KINDS) trees[`stand-${k}${v}`] = { w: k === 'wall' ? 1.6 : 1.2, fy: 3, place: (P, x, z) => P.multi(BF.stand(k, v), x, 0, z) };
}
export const SHOWCASE = { trees };
