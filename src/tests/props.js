// Prop showcase (/?test=props): the reusable village props (buildings/props.js, props2.js), the land-detail pieces
// (details.js) and the vegetation (trees, bushes, rocks) in a labelled grid, each drawn with its in-game materials
// (kit props through the building kit, details / vegetation through their BatchedMesh batches).
// Params: &only=name[,name2]  &focus=i (centre on the i-th shown item)  &dist= &pitch= &yaw=  &labels=0  &hour=21
//         &cols=N (items per row)  &gap=m
// window.__info = { count, per: { name: tris } }.
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { Builder, instantiate, C } from '../world/buildings/kit.js';
import { setNightAll } from '../world/buildings/index.js';
import * as P1 from '../world/buildings/props.js';
import * as P2 from '../world/buildings/props2.js';
import { DETAIL_SHOWCASE, detailMats } from '../world/details.js';
import { VEG_MATS, VEG_BUILD, Batch } from '../world/vegetation.js';

const KIT = {
  toro: B => P1.toro(B, { s: 1 }),
  chochin: B => B.at([0, 1.1, 0], 0, () => P1.chochin(B, { cord: 0.1 })),
  lanternPost: B => P1.lanternPost(B, {}),
  barrel: B => P1.barrel(B, {}),
  barrelDark: B => P1.barrel(B, { r: 0.24, h: 0.5, wood: C.woodMid }),
  crate: B => P1.crate(B, {}),
  produce: B => P1.produce(B, { kind: 'apple' }),
  produceVeg: B => P1.produce(B, { kind: 'veg' }),
  pot: B => P1.pot(B, {}),
  potFlowers: B => P1.pot(B, { plant: 'flowers' }),
  potPine: B => P1.pot(B, { plant: 'pine' }),
  bush: B => P1.bush(B, {}),
  bushFlowers: B => P1.bush(B, { flowers: ['#ff8fb0', '#ffffff'] }),
  kitSakura: B => P1.tree(B, { kind: 'sakura', s: 0.7 }),
  kitRound: B => P1.tree(B, { kind: 'round', s: 0.7 }),
  kitMaple: B => P1.tree(B, { kind: 'maple', s: 0.7 }),
  kitPine: B => P1.tree(B, { kind: 'pine', s: 0.7 }),
  bamboo: B => P1.bamboo(B, { n: 3, h: 1.6 }),
  rock: B => P1.rock(B, {}),
  bench: B => P1.bench(B, { w: 1.1 }),
  logPile: B => P1.logPile(B, {}),
  woodStack: B => P1.woodStack(B, {}),
  flowerPatch: B => P1.flowerPatch(B, {}),
  mailbox: B => P1.mailbox(B),
  bell: B => B.at([0, 0.9, 0], 0, () => P1.bell(B, {})),
  offeringBox: B => P1.offeringBox(B),
  nobori: B => P2.nobori(B, { h: 2.0, sym: 'sakura' }),
  parasol: B => P2.parasol(B, {}),
  teaBench: B => P2.teaBench(B, {}),
  cafeTable: B => P2.cafeTable(B, {}),
  wheel: B => B.at([0, 0.34, 0], 0, () => P2.wheel(B, {})),
  boat: B => P2.boat(B, {}),
  bucket: B => P2.bucket(B, { r: 0.12, h: 0.18 }),
  bucketWater: B => P2.bucket(B, { r: 0.12, h: 0.18, water: true }),
  stoneDog: B => P2.stoneDog(B, {}),
  pottery: B => P2.pottery(B, {}),
  choppingBlock: B => P2.choppingBlock(B),
  firewood: B => P2.firewood(B, {}),
  hedge: B => P2.hedge(B, -0.5, 0.5, { flowers: ['#ff8fb0'] }),
  veggieBed: B => P2.veggieBed(B, {}),
  sack: B => P2.sack(B, {}),
  anvil: B => P2.anvil(B),
  scarecrow: B => P2.scarecrow(B),
  pinwheel: B => P2.pinwheel(B, {}),
  wateringCan: B => P2.wateringCan(B),
};
const VEG = {};
for (const kind of ['sakura', 'momiji', 'pine', 'round', 'ginkgo']) for (const v of [1, 2]) VEG[`tree:${kind}${v}`] = { kind, v };
for (const k of ['hydrangea', 'azalea', 'box']) VEG['bush:' + k] = { bush: k };
VEG['veg:rock'] = { rock: true }; VEG['veg:susuki'] = { susuki: true }; VEG['veg:bamboo'] = { bamboo: true };

export default function () {
  const P = new URLSearchParams(location.search);
  const only = P.get('only')?.split(',');
  const names = [...Object.keys(KIT).map(n => ['kit', n]), ...Object.keys(DETAIL_SHOWCASE).map(n => ['det', n]), ...Object.keys(VEG).map(n => ['veg', n])]
    .filter(([, n]) => !only || only.includes(n));
  if (only) names.sort((a, b) => only.indexOf(a[1]) - only.indexOf(b[1]));
  const big = n => n.startsWith('tree:') || n === 'dock' || n === 'veg:bamboo' || n === 'pole';
  const gap = +(P.get('gap') ?? 2.4), cols = +(P.get('cols') ?? Math.ceil(Math.sqrt(names.length * 1.6)));
  // lay out in rows along the screen-horizontal diagonal of the default camera (yaw 45deg)
  const SQ = Math.SQRT1_2, U = [SQ, -SQ], Vv = [SQ, SQ];
  const cells = []; let u = 0, v = 0, col = 0, rowH = 0;
  for (const [src, n] of names) {
    const w = big(n) ? gap * 2.2 : gap;
    if (col >= cols) { col = 0; u = 0; v += rowH; rowH = 0; }
    const cu = u + w / 2, cv = v + w / 2;
    cells.push({ src, n, x: cu * U[0] + cv * Vv[0], z: cu * U[1] + cv * Vv[1] });
    u += w; rowH = Math.max(rowH, w); col++;
  }
  const xs = cells.map(c => c.x), zs = cells.map(c => c.z);
  let center = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  const focus = P.has('focus') ? cells[Math.min(cells.length - 1, +P.get('focus'))] : null;
  if (focus) center = [focus.x, focus.z];
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + gap;
  const S = makeStage({ ground: Math.max(60, span * 1.6 + 20), center, dist: focus ? 6 : Math.max(10, span * 1.25), hour: 10, groundColor: P.get('ground') || '#8ec46e' });
  if (focus) { S.engine.rig.focus.y = big(focus.n) ? 1.4 : 0.45; S.engine.rig.snap(); }
  if (P.has('fy')) { S.engine.rig.focus.y = +P.get('fy'); S.engine.rig.snap(); }
  const scene = S.scene;
  const dm = detailMats(), vm = { bark: VEG_MATS.bark(), foliage: VEG_MATS.foliage(), bushFol: VEG_MATS.foliage({ occluder: false }), bushLeaves: VEG_MATS.cards('round', { occluder: false }), bushBlooms: VEG_MATS.cards('sakura', { occluder: false }), rock: VEG_MATS.rock(), susuki: VEG_MATS.susuki(), bamboo: VEG_MATS.bamboo(), bambooLeaf: VEG_MATS.bambooLeaf() };
  const batches = new Map();
  const batch = (key, mat, opts) => { let b = batches.get(key); if (!b) { b = new Batch(key, mat, opts); batches.set(key, b); } return b; };
  const m4 = new THREE.Matrix4();
  const tri = g => (g.index ? g.index.count : g.attributes.position.count) / 3;
  const per = {}, labels = [];
  const glowMats = [];
  for (const c of cells) {
    let tris = 0, h = 1;
    const rec = { parts: [] };
    if (c.src === 'kit') {
      const B = new Builder(7 + c.n.length * 13); B.warpAmt = 0.03;
      KIT[c.n](B);
      const tpl = B.finish();
      const inst = instantiate(tpl);
      inst.group.position.set(c.x, 0, c.z); scene.add(inst.group);
      inst.group.updateMatrixWorld(true);
      for (const l of tpl.lights) S.lightPool.addSource({ ...l, pos: l.pos.clone().applyMatrix4(inst.group.matrixWorld) });
      tris = Object.values(tpl.geos).reduce((a, g) => a + tri(g), 0) + tpl.anims.reduce((a, an) => a + Object.values(an.geos).reduce((b, g) => b + tri(g), 0), 0);
      const bb = new THREE.Box3().setFromObject(inst.group); h = bb.max.y;
      if (tpl.anims.length) S.onUpdate((dt, t) => { for (const [i, a] of tpl.anims.entries()) { const node = inst.parts[i].node; const ph = t * a.speed + a.phase; if (a.kind === 'spin') node.quaternion.setFromAxisAngle(a.axis, ph); else if (a.kind === 'swing') node.quaternion.setFromAxisAngle(a.axis, Math.sin(ph) * a.amp); } });
    } else if (c.src === 'det') {
      const d = DETAIL_SHOWCASE[c.n]();
      if (d.pc) {
        m4.makeTranslation(c.x, 0, c.z);
        for (const k of ['body', 'glow', 'leaf', 'cloth', 'water']) if (d.pc[k]) { const kk = k === 'water' ? 'body' : k; batch('d:' + kk, dm[kk]).add(d.pc[k], m4, null, rec); tris += tri(d.pc[k]); d.pc[k].computeBoundingBox(); h = Math.max(h, d.pc[k].boundingBox.max.y); }
        for (const l of d.pc.lights || []) S.lightPool.addSource({ ...l, pos: l.pos.clone().add(new THREE.Vector3(c.x, 0, c.z)) });
      } else {
        d.geos.forEach(([bk, g], i) => {
          const k = d.geos.length, off = (i - (k - 1) / 2) * Math.min(0.75, (gap - 0.4) / k);
          m4.makeTranslation(c.x + off * SQ, 0, c.z - off * SQ);
          batch('d:' + bk, dm[bk]).add(g, m4, null, rec); tris += tri(g);
        });
        h = 0.5;
      }
    } else {
      const it = VEG[c.n];
      m4.makeTranslation(c.x, 0, c.z);
      const add = (key, mat, g, opts) => { batch(key, mat, opts).add(g, m4, null, rec); tris += tri(g); g.computeBoundingBox(); h = Math.max(h, g.boundingBox.max.y); };
      if (it.kind) {
        const t = VEG_BUILD.tree(it.kind, it.v);
        add('bark', vm.bark, t.trunkGeo); add('foliage', vm.foliage, t.foliage);
        add('cards:' + it.kind, batches.get('cards:' + it.kind)?.mat || VEG_MATS.cards(it.kind), t.cardGeo, { castShadow: it.kind === 'momiji' });
      } else if (it.bush) { const b = VEG_BUILD.bush(it.bush, 1 + it.bush.length); add('bushFol', vm.bushFol, b.mass); add('bushLeaves', vm.bushLeaves, b.leaves); if (b.blooms) add('bushBlooms', vm.bushBlooms, b.blooms); }
      else if (it.rock) add('rock', vm.rock, VEG_BUILD.rock(1));
      else if (it.susuki) add('susuki', vm.susuki, VEG_BUILD.susuki(1));
      else if (it.bamboo) { const b = VEG_BUILD.bamboo(1); add('bamboo', vm.bamboo, b.stalks); add('bambooLeaf', vm.bambooLeaf, b.leaves); }
    }
    per[c.n] = Math.round(tris);
    labels.push({ n: c.n, tris: Math.round(tris), pos: new THREE.Vector3(c.x, h + 0.2, c.z) });
  }
  const group = new THREE.Group(); scene.add(group);
  for (const b of batches.values()) b.build(group);
  glowMats.push(dm.glow);
  // labels
  if (P.get('labels') !== '0') {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;font:600 11px system-ui,sans-serif;z-index:5';
    document.body.appendChild(root);
    for (const l of labels) {
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);background:rgba(255,246,232,.85);color:#4a2c2a;padding:1px 6px;border-radius:8px;white-space:nowrap';
      el.textContent = `${l.n} · ${l.tris}`;
      root.appendChild(el); l.el = el;
    }
  }
  const v3 = new THREE.Vector3();
  S.onUpdate(() => {
    const night = S.day.night;
    setNightAll(night);
    dm.glow.emissiveIntensity = 0.06 + (2.1 - 0.06) * night;
    for (const l of labels) if (l.el) {
      v3.copy(l.pos).project(S.engine.camera);
      l.el.style.left = ((v3.x * 0.5 + 0.5) * innerWidth) + 'px'; l.el.style.top = ((-v3.y * 0.5 + 0.5) * innerHeight) + 'px';
      l.el.style.display = v3.z < 1 ? '' : 'none';
    }
  });
  window.__info = { count: cells.length, per };
  S.ready();
}
