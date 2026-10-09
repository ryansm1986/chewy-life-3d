// The Adventurers' Guild (docs/COZY.md §5.1; ROADMAP CZ-7): an adventurers' lodge in the village's toy style, 4x3,
// levels 1-3. Kit-built (the owner's pick); BUILDINGS.guild.glb keeps a slot for a later Blender centrepiece.
//   L1: a two-storey timber lodge: plaster over a plank wainscot, a deep pent eave, an irimoya roof with the Guild's
//       crest (a paw on a round plaque) in both gables and a paw pennant on the ridge; the kanban standing on the pent
//       roof (the crest with a bone crossed behind it, a little lantern at its corner); the double door with a paw noren
//       between two red posts hung with paper lanterns; a rack of toy weapons left of the door; crossed toy swords behind
//       a pot-lid shield on the upper storey's side; a route map, a straw hat and a gourd on the back wall; a lean-to on
//       the right over a rack of walking staffs and packs; a yard notice board, a supply cart, a lantern post, a training
//       dummy and a woodpile.
//   L2: + banners at the front corners, bunting along the porch beam, a hanging sign on the lean-to.
//   L3: + a lookout tower behind the lean-to (a ladder, a railed platform, its own roof, the Guild's flag), the crests
//       gilded, a third banner.
// The footprint stays 4x3 on every level and the door stays at its centre front (the Guild's interaction, Old Hachi's
// spot). Front = +z.
import * as THREE from 'three';
import { C, G, V, PI, shade, bar } from './kit.js';
import { roof } from './roofs.js';
import { foundation, walls, onFace, shoji, roundWindow, door, noren, engawa, posts, stepStones, bunting, STONES } from './parts.js';
import { chochin, crate, flowerPatch, lanternPost, pot, woodStack } from './props.js';
import { nobori, wheel, sack } from './props2.js';
import { symbol, flatSymbol } from './symbols.js';
import { LAMP } from './homes.js';
import { charm, rainChain, hangSign } from './trim.js';

const PAL = {
  roof: '#2f8076', wall: '#fff6e6', frame: '#9a7452', koshi: '#c89868', door: '#c48c5a',
  red: '#c8473a', indigo: '#2f4a7a', gold: '#f2c04a', brass: '#c8a050', leather: '#8a5a3a', canvas: '#efe2c4',
};

/** the round crest: a plaque, a rim and the paw (local: facing +z, centred) */
function crest(B, r = 0.28, { gold = false } = {}) {
  const back = G.cyl(r, r, 0.07, 28); back.rotateX(PI / 2); B.add(back, '#fff3dc');
  const rim = G.torus(r, 0.045, 6, 28); rim.translate(0, 0, 0.02); B.add(rim, gold ? PAL.gold : PAL.red);
  const inner = G.torus(r * 0.82, 0.012, 4, 28); inner.translate(0, 0, 0.04); B.add(inner, gold ? PAL.brass : '#e8a080');
  B.at([0, -r * 0.03, 0.04], 0, () => symbol(B, 'paw', r * 1.6, { depth: 0.035, colors: [gold ? '#8a4a1a' : '#a8382c'] }));
}
/** the big signboard on the upper storey: a dark-framed plank, the crest in the middle with a bone crossed behind it,
 *  "rope" ends, a little paper lantern hung at its right corner */
function bigSign(B, { w = 1.32, h = 0.5, gold = false } = {}) {
  const fr = G.box(w + 0.1, h + 0.1, 0.06, 0.03); fr.translate(0, 0, -0.02); B.add(fr, '#3a2618');
  const pl = G.box(w, h, 0.07, 0.03); B.add(pl, { grad: ['#7a4e30', '#9a6640'] });
  for (const y of [-h * 0.18, h * 0.18]) { const seam = G.box(w - 0.06, 0.014, 0.01, 0); seam.translate(0, y, 0.037); B.add(seam, '#6a4228'); }
  for (const s of [-1, 1]) { const k = G.cyl(0.03, 0.03, 0.03, 8); k.rotateX(PI / 2); k.translate(s * (w / 2 - 0.08), h / 2 - 0.08, 0.04); B.add(k, PAL.brass); }
  // the bone, crossed behind the crest
  B.at([0, 0, 0.04], 0.0, () => B.at([0, 0, 0], 0, () => symbol(B, 'bone', 0.62, { depth: 0.04 }), 1, 0, 0.62));
  B.at([0, 0, 0.04], 0.0, () => B.at([0, 0, 0], 0, () => symbol(B, 'bone', 0.62, { depth: 0.04, colors: ['#fff4e0'] }), 1, 0, -0.62));
  B.at([0, 0, 0.07], 0, () => crest(B, 0.22, { gold }));
  // the lantern at the corner
  B.at([w / 2 + 0.02, -h / 2 - 0.02, 0.08], 0, () => chochin(B, { r: 0.08, h: 0.16, color: PAL.red, cord: 0.05 }));
}
/** two crossed toy swords (bokken: a round tsuba, a wrapped grip) behind a pot-lid shield with a paw (local face frame) */
function crossedArms(B, { shield = '#9a9aa8' } = {}) {
  for (const s of [-1, 1]) B.at([0, 0, 0.05], 0, () => {
    B.push([0, 0, 0], 0, 1, 0, s * 0.72);
    const blade = G.box(0.07, 0.86, 0.035, 0.02); blade.translate(0, 0.1, 0); B.add(blade, '#e8cfa0');
    const tip = G.cone(0.036, 0.08, 6); tip.scale(1, 1, 0.5); tip.translate(0, 0.57, 0); B.add(tip, '#e8cfa0');
    const ts = G.cyl(0.075, 0.075, 0.03, 12); ts.translate(0, -0.34, 0); B.add(ts, '#4a3a3a');
    const grip = G.cyl(0.032, 0.032, 0.22, 8); grip.translate(0, -0.46, 0); B.add(grip, s > 0 ? '#e86a7a' : '#5a8ad8');
    for (let i = 0; i < 4; i++) { const wr = G.torus(0.034, 0.008, 3, 8); wr.rotateX(PI / 2); wr.translate(0, -0.39 - i * 0.05, 0); B.add(wr, '#fff0e0'); }
    const pom = G.sph(0.035, 8, 6); pom.translate(0, -0.59, 0); B.add(pom, PAL.gold);
    B.pop();
  });
  // the pot-lid shield: a shallow dome, a rolled rim, a knob, a paw painted on
  B.at([0, 0.04, 0.1], 0, () => {
    const dome = G.sph(0.25, 18, 8, 0); dome.scale(1, 1, 0.32); B.add(dome, shield);
    const rim = G.torus(0.245, 0.028, 5, 22); B.add(rim, shade(shield, 0.78));
    const band = G.torus(0.17, 0.01, 3, 20); band.translate(0, 0, 0.055); B.add(band, shade(shield, 1.12));
    B.at([0, -0.03, 0.07], 0, () => symbol(B, 'paw', 0.2, { depth: 0.012, colors: [PAL.red] }));
    const knob = G.sph(0.04, 8, 6); knob.scale(1, 1, 0.7); knob.translate(0, 0.1, 0.085); B.add(knob, PAL.leather);
  });
}
/** a straw training dummy on a post: a straw-bundle body with rope bands, cross-bar arms, a painted target face with a
 *  toy arrow stuck in it, a little headband */
function trainingDummy(B) {
  const post = G.cyl(0.04, 0.05, 1.2, 7); post.translate(0, 0.6, 0); B.add(post, '#8a5e3e');
  const foot = G.cyl(0.16, 0.2, 0.08, 8); foot.translate(0, 0.04, 0); B.add(foot, '#9a6a48');
  const body = G.cyl(0.15, 0.17, 0.5, 10); body.translate(0, 0.78, 0); B.add(body, (p, n, o) => o.set('#e6c46a').multiplyScalar(0.86 + 0.14 * Math.abs(Math.sin(Math.atan2(n.z, n.x) * 9))));
  for (const y of [0.6, 0.96]) { const r = G.torus(0.165, 0.02, 4, 12); r.rotateX(PI / 2); r.translate(0, y, 0); B.add(r, '#a8784e'); }
  const arms = G.cyl(0.035, 0.035, 0.7, 6); arms.rotateZ(PI / 2); arms.translate(0, 0.9, 0); B.add(arms, '#8a5e3e');
  for (const s of [-1, 1]) { const tuft = G.cone(0.06, 0.12, 6); tuft.rotateZ(-s * PI / 2); tuft.translate(s * 0.4, 0.9, 0); B.add(tuft, '#e6c46a'); }
  const head = G.sph(0.13, 10, 8); head.translate(0, 1.15, 0); B.add(head, '#efd488');
  const band = G.torus(0.125, 0.022, 4, 14); band.rotateX(PI / 2 - 0.15); band.translate(0, 1.19, 0); B.add(band, PAL.red);
  for (const [r, c] of [[0.13, '#fffaf0'], [0.09, PAL.red], [0.045, '#fffaf0']]) { const t = G.cyl(r, r, 0.02, 16); t.rotateX(PI / 2); t.translate(0, 0.8, 0.16 + (0.13 - r) * 0.1); B.add(t, c); }
  const shaft = G.cyl(0.01, 0.01, 0.26, 5); shaft.rotateX(PI / 2 - 0.25); shaft.translate(0.03, 0.83, 0.28); B.add(shaft, '#c8904a');
  for (const s of [-1, 1]) { const f = G.box(0.004, 0.05, 0.06, 0); f.rotateY(s * 0.6); f.translate(0.03 + s * 0.012, 0.87, 0.4); B.add(f, '#ff8fb0'); }
}
/** the Guild's own notice board in the yard: a small red gable over a plank board pinned with notes (the Expedition
 *  Board inside hangs by the door: this one says so to the street) */
function yardBoard(B) {
  for (const s of [-1, 1]) { const p = G.box(0.08, 1.45, 0.08, 0.02); p.translate(s * 0.42, 0.72, 0); B.add(p, '#8a5e3e'); }
  const planks = ['#d2a676', '#c99a68', '#d8ac78'];
  planks.forEach((c, i) => { const g = G.box(0.86, 0.19, 0.05, 0.015); g.translate(0, 0.72 + i * 0.2, 0.01); B.add(g, c); });
  for (const s of [-1, 1]) { const rf = G.box(0.58, 0.04, 0.34, 0.012); rf.rotateZ(-s * 0.48); rf.translate(s * 0.25, 1.48, 0.02); B.add(rf, PAL.red); }
  { const rd = G.box(0.08, 0.07, 0.36, 0.015); rd.translate(0, 1.6, 0.02); B.add(rd, '#7a2a24'); }
  const notes = [[-0.24, 1.02, 0.22, 0.24, '#fffaf0', 0.08, '#e8503a'], [0.04, 1.0, 0.2, 0.22, '#e2f2ff', -0.07, '#ffd24a'], [0.28, 1.04, 0.2, 0.2, '#ffe2ec', 0.05, '#5a8ad8'], [-0.12, 0.78, 0.24, 0.16, '#fff2c4', -0.04, '#8fd0a0'], [0.2, 0.78, 0.18, 0.16, '#e4f6ea', 0.09, '#e8503a']];
  for (const [x, y, w, h, c, t, pin] of notes) {
    const n = G.box(w, h, 0.01, 0); n.rotateZ(t); n.translate(x, y, 0.042); B.add(n, c);
    const p = G.sph(0.02, 6, 4); p.translate(x - Math.sin(t) * h * 0.4, y + h * 0.4, 0.05); B.add(p, pin);
  }
  B.at([0.04, 0.99, 0.05], 0, () => symbol(B, 'paw', 0.1, { depth: 0.008, colors: ['#e8889a'] }));
  for (let i = 0; i < 4; i++) { const dt = G.box(0.026, 0.01, 0.004, 0); dt.translate(-0.3 + i * 0.04, 0.98 + Math.sin(i * 1.5) * 0.03, 0.05); B.add(dt, '#6a9a5a'); }
  B.at([-0.42, 1.36, 0.08], 0, () => chochin(B, { r: 0.07, h: 0.14, color: PAL.gold, cord: 0.02 }));
}
/** the big route map on the back wall: a parchment in a frame, hills and a river, a dotted red trail to a cross */
function wallMap(B, { w = 0.86, h = 0.5 } = {}) {
  const fr = G.box(w + 0.08, h + 0.08, 0.04, 0.015); fr.translate(0, 0, 0.01); B.add(fr, '#5a3a28');
  const pa = G.box(w, h, 0.03, 0.01); pa.translate(0, 0, 0.03); B.add(pa, '#f6e6c0');
  const river = []; for (let i = 0; i <= 8; i++) river.push(V(-w / 2 + 0.04 + i * (w - 0.08) / 8, -0.1 + Math.sin(i * 0.9) * 0.06, 0.05));
  for (let i = 0; i < 8; i++) { const a = river[i], b2 = river[i + 1]; const seg = bar(a, b2, 0.022, 0); B.add(seg, '#8fc8e8'); }
  for (const [x, y, r, c] of [[-0.24, 0.1, 0.07, '#9ac07a'], [-0.1, 0.12, 0.05, '#8ab06a'], [0.22, -0.02, 0.06, '#9ac07a']]) { const m = G.cone(r, r * 1.2, 6); m.rotateX(PI / 2); m.translate(x, y, 0.06); B.add(m, c); }
  for (let i = 0; i < 6; i++) { const d0 = G.box(0.03, 0.012, 0.006, 0); d0.rotateZ(0.4 * Math.sin(i)); d0.translate(-0.32 + i * 0.1, 0.16 - i * 0.05 + Math.sin(i * 1.7) * 0.03, 0.05); B.add(d0, '#d8503a'); }
  for (const s of [-1, 1]) { const x = G.box(0.07, 0.016, 0.006, 0); x.rotateZ(s * 0.78); x.translate(0.32, -0.12, 0.05); B.add(x, '#d8503a'); }
  B.at([-0.36, -0.16, 0.05], 0, () => symbol(B, 'paw', 0.08, { depth: 0.006, colors: ['#8a5a3a'] }));
}
/** a wall rack of toy weapons (local face frame): two pegged rails, a toy sword, a toy bow and a toy spear with a
 *  pennant, a coil of rope on a peg */
function weaponRack(B) {
  for (const y of [0.32, 0.96]) { const r = G.box(0.86, 0.06, 0.06, 0.015); r.translate(0, y, 0.04); B.add(r, '#7a5238'); for (const x of [-0.3, 0, 0.3]) { const pg = G.cyl(0.018, 0.018, 0.08, 5); pg.rotateX(PI / 2); pg.translate(x, y + 0.05, 0.08); B.add(pg, '#5a3a28'); } }
  // the toy sword
  B.at([-0.3, 0.62, 0.11], 0, () => {
    const bl = G.box(0.06, 0.62, 0.03, 0.015); bl.translate(0, 0.08, 0); B.add(bl, '#e8cfa0');
    const tip = G.cone(0.03, 0.07, 6); tip.scale(1, 1, 0.5); tip.translate(0, 0.42, 0); B.add(tip, '#e8cfa0');
    const ts = G.cyl(0.06, 0.06, 0.025, 12); ts.translate(0, -0.24, 0); B.add(ts, '#4a3a3a');
    const gr = G.cyl(0.028, 0.028, 0.16, 8); gr.translate(0, -0.33, 0); B.add(gr, '#e86a7a');
  });
  // the toy bow and its string
  B.at([0.02, 0.62, 0.1], 0, () => {
    const bow = G.torus(0.34, 0.022, 5, 16, PI * 0.8); bow.rotateZ(PI / 2 + PI * 0.1); bow.translate(-0.22, 0, 0); B.add(bow, '#b07a4a');
    const st = G.cyl(0.006, 0.006, 0.62, 4); st.translate(-0.12, 0, 0.0); B.add(st, '#fff6ea');
    for (const y of [-0.3, 0.3]) { const tip = G.sph(0.03, 6, 5); tip.translate(-0.12, y, 0); B.add(tip, PAL.gold); }
  });
  // the toy spear with its pennant
  B.at([0.3, 0.6, 0.11], 0, () => {
    const sh = G.cyl(0.02, 0.02, 0.9, 6); B.add(sh, '#a8784e');
    const hd = G.cone(0.045, 0.14, 6); hd.translate(0, 0.52, 0); B.add(hd, '#b8bccc');
    const pn = G.box(0.16, 0.1, 0.01, 0); pn.translate(0.09, 0.36, 0); B.add(pn, PAL.red);
    const pom = G.sph(0.03, 6, 5); pom.translate(0, -0.47, 0); B.add(pom, PAL.gold);
  });
  const coil = G.torus(0.07, 0.022, 5, 12); coil.translate(0.0, 0.2, 0.1); B.add(coil, '#d8b880');
}
/** a leaning walking staff (a knob, a cloth tie, a little gourd on some) */
function staff(B, x, z, lean, { h = 1.25, gourd = false, tie = PAL.red } = {}) {
  B.at([x, 0, z], 0, () => {
    B.push([0, 0, 0], 0, 1, -lean, lean * 0.25);
    const p = G.cyl(0.022, 0.028, h, 6); p.translate(0, h / 2, 0); B.add(p, '#a8784e');
    const k = G.sph(0.038, 8, 6); k.translate(0, h + 0.01, 0); B.add(k, '#8a5e3e');
    const t = G.torus(0.028, 0.012, 3, 8); t.rotateX(PI / 2); t.translate(0, h - 0.18, 0); B.add(t, tie);
    if (gourd) { const g1 = G.sph(0.06, 10, 8); g1.scale(1, 1.2, 1); g1.translate(0.06, h - 0.34, 0.02); B.add(g1, '#e89a4a'); const g2 = G.sph(0.04, 8, 6); g2.translate(0.06, h - 0.23, 0.02); B.add(g2, '#e89a4a'); }
    B.pop();
  });
}
/** a soft traveller's pack (pillowy), its flap, a rolled bedroll on top */
function pack(B, color, { roll = '#efd8a8', s = 1 } = {}) {
  B.at([0, 0, 0], 0, () => {
    const bag = G.sph(0.5, 12, 9); bag.scale(0.4, 0.46, 0.28); bag.translate(0, 0.23, 0); B.add(bag, color);
    const flap = G.sph(0.5, 12, 8); flap.scale(0.38, 0.18, 0.27); flap.translate(0, 0.4, 0.02); B.add(flap, shade(color, 0.86));
    const pk = G.sph(0.5, 10, 8); pk.scale(0.2, 0.16, 0.08); pk.translate(0, 0.2, 0.13); B.add(pk, shade(color, 1.12));
    const r = G.cyl(0.075, 0.075, 0.42, 12); r.rotateZ(PI / 2); r.translate(0, 0.52, 0); B.add(r, roll);
    for (const d of [-0.12, 0.12]) { const st = G.cyl(0.079, 0.079, 0.03, 12); st.rotateZ(PI / 2); st.translate(d, 0.52, 0); B.add(st, PAL.red); }
  }, s);
}
/** the supply cart: a two-wheeled hand cart with crates, a sack, a coil of rope and a lantern on a pole */
function supplyCart(B) {
  const bed = G.box(0.95, 0.08, 0.6, 0.02); bed.translate(0, 0.42, 0); B.add(bed, '#b08058');
  for (const s of [-1, 1]) { const side = G.box(0.95, 0.16, 0.05, 0.015); side.translate(0, 0.53, s * 0.28); B.add(side, '#9a6a48'); }
  const back = G.box(0.05, 0.16, 0.6, 0.015); back.translate(-0.46, 0.53, 0); B.add(back, '#9a6a48');
  for (const s of [-1, 1]) { const sh = G.box(0.9, 0.05, 0.05, 0.015); sh.rotateZ(-0.16); sh.translate(0.86, 0.36, s * 0.22); B.add(sh, '#8a5e3e'); }
  const xb = G.box(0.05, 0.05, 0.5, 0.015); xb.translate(1.27, 0.29, 0); B.add(xb, '#8a5e3e');
  for (const s of [-1, 1]) B.at([-0.05, 0.3, s * 0.33], 0, () => wheel(B, { r: 0.27, color: '#a8784e' }));
  B.at([-0.22, 0.46, -0.06], 0.3, () => crate(B, { s: 0.3, wood: '#e2b988' }));
  B.at([0.12, 0.46, 0.08], -0.2, () => crate(B, { s: 0.24, wood: '#d8a878' }));
  B.at([0.2, 0.46, -0.15], 0, () => sack(B, { r: 0.12 }));
  const coil = G.torus(0.09, 0.03, 5, 14); coil.rotateX(PI / 2); coil.translate(-0.2, 0.83, 0.12); B.add(coil, '#d8b880');
  const pole = G.cyl(0.018, 0.018, 0.75, 6); pole.translate(-0.42, 0.8, -0.24); B.add(pole, '#6e4a34');
  const arm = G.box(0.03, 0.03, 0.18, 0); arm.translate(-0.42, 1.15, -0.16); B.add(arm, '#6e4a34');
  B.at([-0.42, 1.13, -0.08], 0, () => chochin(B, { r: 0.07, h: 0.14, color: '#f4c04a', cord: 0.03 }));
}

export function guild(B, level = B.level ?? 1) {
  const L = Math.max(1, Math.min(3, level | 0)), gold = L >= 3;
  const w = 3.1, d = 1.8, h = 1.6, y0 = 0.32, cx = -0.38, cz = -0.44, front = cz + d / 2;
  // ---------------------------------------------------------------- the hall
  B.push([cx, 0, cz]);
  foundation(B, { w, d, h: y0, pad: 0.12 });
  walls(B, { w, d, h, y0, plaster: PAL.wall, frame: PAL.frame, koshi: PAL.koshi, koshiSkip: ['f'], posts: { f: [-0.56, 0.56] }, weather: false });
  const blk = { w, d };
  onFace(B, blk, 'f', 0, y0, () => {
    door(B, { w: 0.92, h: 1.24, style: 'wood', wood: PAL.door, frame: PAL.frame });
    noren(B, { w: 0.94, h: 0.48, y: 1.33, z: 0.17, color: PAL.indigo, strips: 3, symbol: () => flatSymbol('paw'), symScale: 0.24 });
  });
  onFace(B, blk, 'f', -1.06, y0 + 0.24, () => weaponRack(B));
  onFace(B, blk, 'f', 1.06, y0 + 0.92, () => shoji(B, { w: 0.6, h: 0.56, box: true, frame: PAL.frame, flowers: ['#ff8fb0', '#ffd24a'] }));
  for (const u of [-0.42, 0.42]) onFace(B, blk, 'r', u, y0 + 0.92, () => shoji(B, { w: 0.5, h: 0.5, frame: PAL.frame }));
  onFace(B, blk, 'l', 0, y0 + 0.92, () => roundWindow(B, { r: 0.27, frame: PAL.frame, box: true, flowers: ['#ff8fb0', '#ffd24a'] }));
  onFace(B, blk, 'b', -0.5, y0 + 1.08, () => { const pg = G.cyl(0.018, 0.018, 0.1, 5); pg.rotateX(PI / 2); pg.translate(0, 0.08, 0.05); B.add(pg, '#5a3a28'); B.at([0, 0, 0.1], 0, () => { const k = G.cone(0.24, 0.12, 12); k.rotateX(PI / 2 - 0.2); B.add(k, '#e6c46a'); const t = G.torus(0.05, 0.012, 4, 10); t.translate(0, 0, 0.05); B.add(t, PAL.red); }); });
  onFace(B, blk, 'b', 0.5, y0 + 1.0, () => { const pg = G.cyl(0.018, 0.018, 0.1, 5); pg.rotateX(PI / 2); pg.translate(0, 0.1, 0.05); B.add(pg, '#5a3a28'); const gd = G.sph(0.08, 10, 8); gd.scale(1, 1.25, 0.8); gd.translate(0, -0.06, 0.1); B.add(gd, '#e89a4a'); const g2 = G.sph(0.055, 8, 6); g2.translate(0, 0.07, 0.1); B.add(g2, '#e89a4a'); const cd = G.torus(0.04, 0.008, 3, 8); cd.translate(0, 0.12, 0.1); B.add(cd, PAL.red); const coil = G.torus(0.09, 0.022, 5, 12); coil.translate(0.0, -0.36, 0.08); B.add(coil, '#d8b880'); });
  for (const u of [-1.0, 0, 1.0]) onFace(B, blk, 'b', u, y0 + 0.92, () => shoji(B, { w: 0.56, h: 0.5, frame: PAL.frame }));
  // the pent roof round the ground floor (the machiya's deep hisashi)
  const low = roof(B, { type: 'skirt', w, d, y0: y0 + h, over: 0.42, H: 0.5, curve: 0.36, lift: 0.26, liftW: 0.8, thick: 0.14, ribW: 0.3, color: PAL.roof, tTop: 0.5, pastel: 0.16, moss: 0.1 });
  // the porch: two red posts and a beam at the door, paper lanterns, a deck and a step
  const pz = d / 2 + 0.36;
  engawa(B, { x0: -0.8, x1: 0.8, z: d / 2, depth: 0.48, y: y0 + 0.02, step: true, wood: '#d8a878' });
  posts(B, [-0.72, 0.72], pz, y0 + h - 0.1, PAL.red, 0.06);
  { const bm = G.box(1.62, 0.11, 0.1, 0.02); bm.translate(0, y0 + h - 0.14, pz); B.add(bm, PAL.red); }
  for (const x of [-0.5, 0.5]) B.at([x, y0 + h - 0.21, pz], 0, () => chochin(B, { r: 0.12, h: 0.24, color: PAL.red, cord: 0.02 }));
  B.at([0, y0 + h - 0.18, pz], 0, () => charm(B, 'bell'));
  if (L >= 2) bunting(B, [[-0.72, y0 + h - 0.08, pz + 0.06], [0, y0 + h - 0.04, pz + 0.08], [0.72, y0 + h - 0.08, pz + 0.06]], { sag: 0.06, size: 0.08, gap: 0.11, colors: ['#c8473a', '#f2c04a', '#fff6ea', '#2f4a7a'] });
  // ---------------------------------------------------------------- the upper storey: the signboard, the crossed toy
  // swords over the pot-lid shield on its right side, the Guild's crest in both gables
  const y2 = low.topY, w2 = Math.max(2.3, low.openW + 0.1), d2 = Math.max(1.16, low.openD + 0.08), h2 = 1.06;
  walls(B, { w: w2, d: d2, h: h2, y0: y2, plaster: PAL.wall, frame: PAL.frame, rail: false });
  const blk2 = { w: w2, d: d2 };
  for (const u of [-0.72, 0.72]) onFace(B, blk2, 'f', u, y2 + 0.6, () => shoji(B, { w: 0.46, h: 0.42, frame: PAL.frame }));
  // the kanban: the big signboard standing on the pent roof in front of the upper storey, on two little posts
  B.at([0, y2 + 0.2, d2 / 2 + 0.14], 0, () => {
    for (const s2 of [-1, 1]) { const p = G.box(0.06, 0.4, 0.06, 0.01); p.translate(s2 * 0.42, -0.12, -0.03); B.add(p, '#4a3226'); }
    B.at([0, 0.32, 0], 0, () => bigSign(B, { w: 1.36, h: 0.5, gold }));
  });
  onFace(B, blk2, 'r', 0, y2 + 0.52, () => crossedArms(B));
  onFace(B, blk2, 'l', 0, y2 + 0.58, () => roundWindow(B, { r: 0.24, frame: PAL.frame, lattice: 'fine' }));
  onFace(B, blk2, 'b', 0, y2 + 0.56, () => wallMap(B, { w: Math.min(0.92, w2 - 0.6), h: 0.52 }));
  const tOver = 0.36, tg = 0.46;
  const top = roof(B, { type: 'irimoya', w: w2, d: d2, y0: y2 + h2, over: tOver, H: 0.82, curve: 0.46, lift: 0.4, liftW: 0.85, thick: 0.16, ribW: 0.3, color: PAL.roof, gable: 'ornate', tg, pastel: 0.16 });
  // a pennant with the paw on the ridge (the lookout carries the flag at level 3)
  if (L < 3) B.at([-(w2 / 2 - 0.15), top.ridgeY + 0.08, 0], 0, () => {
    const p = G.cyl(0.02, 0.025, 0.95, 6); p.translate(0, 0.47, 0); B.add(p, PAL.frame);
    const k = G.sph(0.04, 8, 6); k.translate(0, 0.97, 0); B.add(k, PAL.gold);
    const cl = { x0: 0.02, x1: 0.44, yTop: 0.92, yBot: 0.62 };
    const fl = G.plane(0.42, 0.3, 4, 3); fl.translate(0.23, 0.77, 0); B.cloth(fl, PAL.red, cl);
    const sg = flatSymbol('paw'); sg.scale(0.18, 0.18, 1); sg.translate(0.23, 0.77, 0.005); B.cloth(sg, '#fff6ea', cl);
  });
  { const xg = w2 / 2 + tOver - (d2 / 2 + tOver) * tg, yb = top.yAt(xg, 0), gy = yb + (top.ridgeY - yb) * 0.36;
    for (const s of [-1, 1]) B.at([s * (xg + 0.05), gy, 0], s * PI / 2, () => crest(B, 0.15, { gold })); }
  // the hall's dressing: a wind chime and a rain chain at the corners of the pent eave
  { const ex = w / 2 + 0.16, ez = d / 2 + 0.12; rainChain(B, -ex, low.underAt(-ex, ez), ez, y0 * 0.5, { color: C.bronze }); }
  B.at([w / 2 + 0.1, y0 + h - 0.22, d / 2 + 0.3], 0, () => charm(B, 'furin', { color: '#bfe6ff' }));
  B.pop();
  // ---------------------------------------------------------------- the lean-to on the right: staffs and packs
  const lx0 = cx + w / 2, lx1 = 1.94, lzF = 0.4, lzB = L >= 3 ? -0.42 : -1.18, lzc = (lzF + lzB) / 2, ly = 1.48;
  B.push([(lx0 + lx1) / 2, 0, lzc], PI / 2); // (the shed rises from its eave, local +z = world +x, back to the hall's wall)
  roof(B, { type: 'shed', w: lzF - lzB, d: lx1 - lx0, y0: ly - 0.05, over: 0.12, gOver: 0.14, H: 0.28, curve: 0.2, lift: 0.08, liftW: 0.3, thick: 0.08, ribW: 0.24, ribAmp: 0.03, course: 0, color: PAL.roof, pastel: 0.16 });
  B.pop();
  for (const z of [lzF - 0.04, lzB + 0.06]) { const p = G.cyl(0.05, 0.055, ly - 0.32, 8); p.translate(lx1 - 0.1, (ly - 0.32) / 2, z); B.add(p, PAL.frame); const b = G.cyl(0.09, 0.11, 0.1, 8); b.translate(lx1 - 0.1, 0.05, z); B.add(b, STONES[2]); }
  { const bm = G.box(0.08, 0.08, lzF - lzB + 0.06, 0.015); bm.translate(lx1 - 0.1, ly - 0.36, lzc); B.add(bm, PAL.frame); }
  // the staff rack: a rail on two legs, five staffs leaning on it
  { const rz = lzc + 0.02; const rail = G.box(0.06, 0.06, 0.78, 0.015); rail.translate(lx0 + 0.14, 0.86, rz); B.add(rail, '#8a5e3e');
    for (const s of [-1, 1]) { const lg = G.box(0.05, 0.86, 0.05, 0); lg.translate(lx0 + 0.14, 0.43, rz + s * 0.36); B.add(lg, '#8a5e3e'); }
    const ties = [PAL.red, '#5a8ad8', PAL.gold, '#6ac08a', '#e86a7a'];
    for (let i = 0; i < 5; i++) staff(B, lx0 + 0.34, rz - 0.3 + i * 0.15, -0.25, { h: 1.15 + (i % 2) * 0.1, gourd: i === 1 || i === 4, tie: ties[i] }); }
  B.at([lx0 + 0.52, 0, lzF - 0.2], -0.4, () => pack(B, '#4f78c0', { s: 0.82 }));
  B.at([lx0 + 0.54, 0, lzc - 0.12], 0.5, () => pack(B, '#6a9a5a', { roll: '#f0e0c0', s: 0.78 }));
  if (L >= 2) B.at([lx1 - 0.1, ly - 0.42, lzF - 0.04], PI / 2, () => hangSign(B, 'paw', { w: 0.3, h: 0.26, color: '#fff3dc' }));
  // the back half: a woodpile and barrels (the lookout stands there at level 3)
  if (L < 3) {
    B.at([lx0 + 0.36, 0, -1.12], PI / 2, () => woodStack(B, { w: 0.56, h: 0.42, d: 0.3 }));
    B.at([1.6, 0, -0.66], -0.5, () => trainingDummy(B));
  } else {
    // ---------------------------------------------------------------- the lookout (level 3)
    const tx = 1.5, tz = -1.0, tH = 3.75, s = 0.3;
    B.push([tx, 0, tz]);
    const tb = G.box(0.86, 0.22, 0.86, 0.05); tb.translate(0, 0.11, 0); B.add(tb, STONES[2]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = G.beam(0.1, tH, 0.1, 0.02); p.translate(sx * s, 0.22 + tH / 2, sz * s); B.add(p, PAL.frame); }
    for (const y of [0.85, 1.75, 2.6]) for (const [a, b] of [[[-s, -s], [s, -s]], [[s, -s], [s, s]], [[s, s], [-s, s]], [[-s, s], [-s, -s]]]) {
      const g = G.box(Math.abs(b[0] - a[0]) + 0.06, 0.06, Math.abs(b[1] - a[1]) + 0.06, 0); g.translate((a[0] + b[0]) / 2, 0.22 + y, (a[1] + b[1]) / 2); B.add(g, PAL.frame);
    }
    B.add(bar(V(-s, 0.4, s), V(s, 1.6, s), 0.04, 0), PAL.frame); B.add(bar(V(s, 0.4, -s), V(-s, 1.6, -s), 0.04, 0), PAL.frame); // (cross braces)
    // the ladder on the front
    for (const sx of [-1, 1]) { const rl = G.box(0.035, tH - 0.4, 0.035, 0); rl.translate(sx * 0.12, 0.22 + (tH - 0.4) / 2, s + 0.07); B.add(rl, '#a8784e'); }
    for (let i = 0; i < 10; i++) { const rg = G.box(0.26, 0.03, 0.03, 0); rg.translate(0, 0.45 + i * 0.32, s + 0.07); B.add(rg, '#a8784e'); }
    // the platform, its railing, the roof, a flag with the paw
    const py = 0.22 + tH - 0.62;
    const pf = G.box(0.86, 0.08, 0.86, 0.02); pf.translate(0, py, 0); B.add(pf, '#c89a6a');
    for (const sd of [0, PI / 2, PI, -PI / 2]) B.at([0, py + 0.28, 0], sd, () => { const r = G.box(0.84, 0.05, 0.04, 0); r.translate(0, 0, 0.42); B.add(r, PAL.red); const r2 = G.box(0.84, 0.035, 0.03, 0); r2.translate(0, -0.14, 0.42); B.add(r2, PAL.red); });
    roof(B, { type: 'hip', w: 0.78, d: 0.78, y0: 0.22 + tH + 0.02, over: 0.26, H: 0.55, curve: 0.5, lift: 0.2, liftW: 0.3, thick: 0.09, ribW: 0.22, ribAmp: 0.03, course: 0, color: PAL.roof, finial: 'gold' });
    B.at([0, py + 0.5, 0.1], 0, () => chochin(B, { r: 0.08, h: 0.16, color: PAL.gold, cord: 0.03 }));
    B.pop();
    B.at([tx + s + 0.04, 0, tz - s - 0.04], 0, () => {
      const p = G.cyl(0.025, 0.03, 0.9, 6); p.translate(0, 0.22 + tH + 0.5, 0); B.add(p, PAL.frame);
      const fl = G.plane(0.5, 0.32, 4, 3); fl.translate(0.27, 0.22 + tH + 0.78, 0); B.cloth(fl, PAL.indigo, { x0: 0.02, x1: 0.52, yTop: 0.22 + tH + 0.94, yBot: 0.22 + tH + 0.62 });
      const sg = flatSymbol('paw'); sg.scale(0.22, 0.22, 1); sg.translate(0.27, 0.22 + tH + 0.78, 0.005); B.cloth(sg, '#fff6ea', { x0: 0.02, x1: 0.52, yTop: 0.22 + tH + 0.94, yBot: 0.22 + tH + 0.62 });
    });
  }
  // ---------------------------------------------------------------- the yard
  B.at([1.28, 0, 1.0], PI * 0.86, () => supplyCart(B));
  B.at([-1.86, 0, 1.3], 0.4, () => lanternPost(B, { h: 1.45, color: PAL.red }));
  B.at([-1.22, 0, 1.13], 0.12, () => yardBoard(B));
  B.at([0.62, 0, 1.28], 0, () => pot(B, { plant: 'flowers', flowers: ['#ff8fb0', '#ffffff'] }));
  B.at([-0.55, 0, 1.36], 0, () => flowerPatch(B, { w: 0.36, d: 0.2, n: 4, colors: ['#ff8fb0', '#ffd24a', '#ffffff'] }));
  stepStones(B, cx, front + 0.85, cx, 1.42, 2);
  if (L >= 2) for (const [x, c] of [[-1.92, PAL.indigo], [0.5, PAL.red]]) B.at([x, 0, 1.36], x < 0 ? 0 : PI, () => nobori(B, { h: 2.2, w: 0.38, color: c, sym: 'paw' }));
  if (L >= 3) { B.at([1.9, 0, 0.62], PI, () => nobori(B, { h: 2.4, w: 0.4, color: PAL.indigo, sym: 'bone' })); B.at([-1.95, 0, 0.3], 0, () => B.at([0, 0, 0], 0, () => crate(B, { s: 0.26 }))); }
  // ---------------------------------------------------------------- lights, the door, the height
  B.light([cx, 1.7, front + 0.7], { ...LAMP, intensity: 3.6, radius: 6.5 });
  B.light([-1.7, 1.4, 1.5], { ...LAMP, intensity: 2.6, radius: 4.5 });
  B.door.set(cx, 0, front + 0.95);
  B.height = Math.max(top.ridgeY + 0.7, L >= 3 ? 5.3 : 0);
}
