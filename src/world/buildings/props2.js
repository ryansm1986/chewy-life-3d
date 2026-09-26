// More props for shops, landmarks and workshops: banners, awnings, parasols, sweets, anvil, crops,
// scarecrow, nets, boats, buckets, stone dogs, shimenawa rope, pottery...
import * as THREE from 'three';
import { puff, tube } from '../../gfx/geom.js';
import { G, V, C, PI, shade, col } from './kit.js';
import { STONES } from './parts.js';
import { flatSymbol } from './symbols.js';
import { clamp, TAU } from '../../core/util.js';

// Nobori banner: pole with a tall cloth flag hanging from a top bar
export function nobori(B, { h = 2.4, w = 0.42, color = C.indigo, sym = null, symColor = '#fff6ea', hem = '#fff6ea' } = {}) {
  const pole = G.cyl(0.03, 0.035, h, 6); pole.translate(0, h / 2, 0); B.add(pole, C.woodDark);
  const bar = G.cyl(0.018, 0.018, w + 0.08, 5); bar.rotateZ(PI / 2); bar.translate(w / 2, h - 0.08, 0); B.add(bar, C.woodDark);
  const top = G.sph(0.05, 6, 4); top.translate(0, h + 0.03, 0); B.add(top, C.gold);
  const fh = h * 0.72, yTop = h - 0.1, cl = { x0: 0.02, x1: w + 0.02, yTop, yBot: yTop - fh };
  const g = G.plane(w, fh - 0.1, 2, 6); g.translate(0.02 + w / 2, yTop - (fh - 0.1) / 2, 0); B.cloth(g, color, cl);
  const hg = G.plane(w, 0.1, 2, 1); hg.translate(0.02 + w / 2, yTop - fh + 0.05, 0); B.cloth(hg, hem, cl);
  const side = G.plane(0.05, fh, 1, 6); side.translate(0.045, yTop - fh / 2, 0.003); B.cloth(side, hem, cl);
  if (sym) { const sg = flatSymbol(sym); sg.scale(w * 0.62, w * 0.62, 1); sg.translate(0.02 + w / 2, yTop - fh * 0.3, 0.005); B.cloth(sg, symColor, cl); }
  const base = G.cyl(0.1, 0.13, 0.14, 8); base.translate(0, 0.07, 0); B.add(base, STONES[1]);
}

// Candy-striped awning (local face frame, attached at height y, projecting d with a scalloped valance)
export function awning(B, { w = 2, d = 0.6, y = 1.6, drop = 0.34, colors = ['#ff8fb0', '#fff6f0'], n = 10, valance = true } = {}) {
  const sw = w / n, L = Math.hypot(d, drop), ang = Math.atan2(drop, d);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * sw;
    const g = G.box(sw + 0.004, 0.035, L, 0); g.rotateX(ang); g.translate(x, y - drop / 2, d / 2);
    B.add(g, colors[i % 2]);
  }
  const bar = G.cyl(0.025, 0.025, w + 0.08, 6); bar.rotateZ(PI / 2); bar.translate(0, y - drop - 0.01, d); B.add(bar, C.white);
  if (valance) {
    const cl = { x0: -w / 2, x1: w / 2, yTop: y - drop, yBot: y - drop - 0.2 };
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (i + 0.5) * sw;
      const s = new THREE.Shape(); s.moveTo(-sw / 2, 0); s.lineTo(-sw / 2, -0.1); s.absarc(0, -0.1, sw / 2, PI, 0, false); s.lineTo(sw / 2, 0); s.lineTo(-sw / 2, 0);
      const g = new THREE.ShapeGeometry(s, 5); g.translate(x, y - drop, d + 0.012);
      B.cloth(g, colors[i % 2], cl);
    }
  }
  for (const s of [-1, 1]) { const arm = G.box(0.03, 0.03, L * 1.05, 0); arm.rotateX(-ang * 0.8); arm.translate(s * (w / 2 - 0.04), y - drop * 0.9, d / 2); B.add(arm, C.iron); }
}

// Wagasa parasol on a pole
export function parasol(B, { r = 0.8, h = 1.7, color = '#e84a4a', ribs = 10 } = {}) {
  const pole = G.cyl(0.025, 0.03, h, 6); pole.translate(0, h / 2, 0); B.add(pole, C.woodMid);
  const pts = []; for (let k = 5; k >= 0; k--) { const t = k / 5; pts.push([Math.max(0.001, r * (1 - t)), h + 0.3 * Math.sin(t * PI / 2)]); }
  const can = G.lathe(pts, ribs * 2);
  B.add(can, (p, n, o) => { const a = Math.atan2(p.z, p.x); o.set(color).multiplyScalar(0.86 + 0.14 * Math.cos(a * ribs)); if (Math.abs(Math.hypot(p.x, p.z) - r * 0.55) < 0.03) o.set('#fff6ea'); });
  const under = G.lathe(pts.map(([x, y]) => [x * 0.99, y - 0.02]).reverse(), ribs * 2); B.add(under, shade(color, 0.72));
  const tip = G.sph(0.05, 6, 4); tip.translate(0, h + 0.31, 0); B.add(tip, C.woodDark);
}

// Low tea bench with red felt (mosen)
export function teaBench(B, { w = 1.0, felt = '#d84848' } = {}) {
  const top = G.box(w, 0.07, 0.42, 0.02); top.translate(0, 0.38, 0); B.add(top, C.woodLight);
  const cloth = G.box(w * 0.92, 0.02, 0.5, 0); cloth.translate(0, 0.425, 0); B.add(cloth, felt);
  for (const s of [-1, 1]) { const fl = G.box(w * 0.92, 0.14, 0.02, 0); fl.translate(0, 0.36, s * 0.25); B.add(fl, felt); }
  for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) for (const z of [-0.14, 0.14]) { const l = G.box(0.06, 0.36, 0.06, 0); l.translate(x, 0.18, z); B.add(l, C.woodMid); }
}

export function stool(B, color = C.woodLight) {
  const top = G.cyl(0.14, 0.14, 0.06, 10); top.translate(0, 0.4, 0); B.add(top, color);
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; const l = G.cyl(0.02, 0.025, 0.4, 4); l.translate(Math.cos(a) * 0.08, 0.2, Math.sin(a) * 0.08); B.add(l, C.woodDark); }
}

export function cafeTable(B, { cloth = '#fff6ea', umbrella = null } = {}) {
  const top = G.cyl(0.3, 0.3, 0.05, 14); top.translate(0, 0.6, 0); B.add(top, cloth);
  const leg = G.cyl(0.03, 0.03, 0.58, 6); leg.translate(0, 0.3, 0); B.add(leg, C.iron);
  const foot = G.cyl(0.15, 0.17, 0.03, 10); foot.translate(0, 0.015, 0); B.add(foot, C.iron);
  const cup = G.cyl(0.04, 0.03, 0.06, 8); cup.translate(0.1, 0.66, 0.05); B.add(cup, C.white);
  const cake2 = G.cyl(0.05, 0.05, 0.05, 8); cake2.translate(-0.08, 0.65, -0.04); B.add(cake2, '#ffb0cc');
  if (umbrella) parasol(B, { r: 0.62, h: 1.5, color: umbrella, ribs: 8 });
  for (const a of [0.5, 0.5 + PI]) B.at([Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5], 0, () => stool(B, '#e8c898'));
}

// Sweets
export function cake(B, { r = 0.16, layers = 2, colors = ['#fff0d8', '#ffb0cc'], cherry = true } = {}) {
  let y = 0;
  for (let i = 0; i < layers; i++) {
    const lr = r * (1 - i * 0.28), lh = r * 0.55;
    const g = G.cyl(lr, lr, lh, 14); g.translate(0, y + lh / 2, 0); B.add(g, colors[i % colors.length]);
    const icing = G.torus(lr * 0.97, lh * 0.2, 4, 14); icing.rotateX(PI / 2); icing.translate(0, y + lh, 0); B.add(icing, '#fff8fa');
    y += lh;
  }
  if (cherry) { const c = G.sph(r * 0.2, 8, 6); c.translate(0, y + r * 0.16, 0); B.add(c, '#e8323a'); }
  return y;
}
export function cupcake(B, { r = 0.07, color = '#ff9ec0' } = {}) {
  const cup = G.cyl(r, r * 0.75, r * 1.1, 8); cup.translate(0, r * 0.55, 0); B.add(cup, '#f4c890');
  const top = G.sph(r * 1.1, 8, 6); top.scale(1, 0.85, 1); top.translate(0, r * 1.25, 0); B.add(top, color);
  const c = G.sph(r * 0.28, 6, 4); c.translate(0, r * 2.1, 0); B.add(c, '#e8323a');
}
export function donut(B, { r = 0.07, color = '#ff9ec0' } = {}) {
  const d = G.torus(r, r * 0.5, 6, 12); d.rotateX(PI / 2); d.translate(0, r * 0.5, 0); B.add(d, '#e8b070');
  const ic = G.torus(r, r * 0.42, 5, 12); ic.rotateX(PI / 2); ic.scale(1, 1, 0.6); ic.translate(0, r * 0.72, 0); B.add(ic, color);
}

// Ribbon bow (Rosie's motif), facing +z
export function bow(B, { s = 0.3, color = '#e8323a' } = {}) {
  B.push([0, 0, 0], 0, s);
  for (const sx of [-1, 1]) { const l = G.sph(0.5, 10, 7); l.scale(0.55, 0.42, 0.22); l.rotateZ(sx * 0.35); l.translate(sx * 0.3, 0.04, 0); B.add(l, color); }
  for (const sx of [-1, 1]) { const t = G.box(0.14, 0.5, 0.06, 0.03); t.rotateZ(sx * 0.35); t.translate(sx * 0.14, -0.3, 0); B.add(t, shade(color, 0.9)); }
  const k = G.sph(0.14, 8, 6); k.scale(1, 1, 0.7); k.translate(0, 0, 0.04); B.add(k, shade(color, 0.85));
  B.pop();
}

export function anvil(B) {
  const stump = G.cyl(0.2, 0.24, 0.38, 10); stump.translate(0, 0.19, 0); B.add(stump, (p, n, o) => { o.set(n.y > 0.8 ? '#e8c08a' : '#8a5e44'); });
  const base = G.box(0.22, 0.1, 0.17, 0.02); base.translate(0, 0.43, 0); B.add(base, C.iron);
  const waist = G.box(0.12, 0.12, 0.1, 0); waist.translate(0, 0.53, 0); B.add(waist, C.iron);
  const top = G.box(0.36, 0.1, 0.16, 0.025); top.translate(0.02, 0.63, 0); B.add(top, '#5a5664');
  const horn = G.cone(0.07, 0.2, 8); horn.rotateZ(-PI / 2); horn.translate(0.29, 0.635, 0); B.add(horn, '#5a5664');
  const hammer = G.box(0.07, 0.07, 0.17, 0); hammer.translate(-0.05, 0.72, 0.02); B.add(hammer, '#6a6878');
  const handle = G.cyl(0.016, 0.016, 0.26, 4); handle.rotateZ(PI / 2); handle.translate(-0.18, 0.72, 0.02); B.add(handle, C.woodLight);
}

export function wheel(B, { r = 0.32, color = C.woodMid } = {}) {
  const rim = G.torus(r, 0.035, 5, 16); B.add(rim, color);
  const hub = G.cyl(0.06, 0.06, 0.08, 8); hub.rotateX(PI / 2); B.add(hub, C.woodDark);
  for (let i = 0; i < 3; i++) { const sp = G.box(0.025, r * 2 - 0.04, 0.025, 0); sp.rotateZ(i / 3 * PI); B.add(sp, color); }
}

// Crops
export function cabbage(B, s = 1) {
  const g = puff(V(0, 0.1 * s, 0), 0.13 * s, { detail: 1, noise: 0.18, squash: 0.85, seed: B.int(0, 99) });
  B.add(g, (p, n, o) => o.set('#9ad872').lerp(col('#e0f4b0'), clamp(n.y * 0.7)));
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + B.rand(0, 1); const l = G.sph(0.09 * s, 6, 4); l.scale(1, 0.3, 0.8); l.rotateY(-a); l.rotateZ(0.4); l.translate(Math.cos(a) * 0.1 * s, 0.05 * s, Math.sin(a) * 0.1 * s); B.add(l, '#5aa84a'); }
}
export function carrot(B, s = 1) {
  const top = G.cone(0.05 * s, 0.1 * s, 6); top.rotateX(PI); top.translate(0, 0.03 * s, 0); B.add(top, '#ff8a3a');
  for (let i = 0; i < 3; i++) { const l = G.cone(0.03 * s, 0.18 * s, 4); l.rotateZ((i - 1) * 0.45); l.translate((i - 1) * 0.035 * s, 0.14 * s, 0); B.add(l, '#5ab04a', 'leaf'); }
}
export function pumpkin(B, s = 1) {
  const g = G.sph(0.15 * s, 12, 8); g.scale(1, 0.72, 1); g.translate(0, 0.1 * s, 0);
  B.add(g, (p, n, o) => { const a = Math.atan2(p.z, p.x); o.set('#ff9a3a').multiplyScalar(0.85 + 0.15 * Math.cos(a * 8)); });
  const st = G.cyl(0.015 * s, 0.025 * s, 0.06 * s, 5); st.translate(0, 0.2 * s, 0); B.add(st, '#6a8a3a');
}

export function scarecrow(B) {
  const post = G.cyl(0.035, 0.04, 1.5, 6); post.translate(0, 0.75, 0); B.add(post, C.woodMid);
  const arm = G.cyl(0.03, 0.03, 1.0, 6); arm.rotateZ(PI / 2); arm.translate(0, 1.15, 0); B.add(arm, C.woodMid);
  const head = G.sph(0.17, 10, 8); head.translate(0, 1.5, 0); B.add(head, '#f4e8d0');
  for (const s of [-1, 1]) {
    const e = G.sph(0.024, 5, 4); e.translate(s * 0.06, 1.52, 0.155); B.add(e, C.ink);
    const ch = G.sph(0.032, 5, 4); ch.scale(1, 0.6, 0.5); ch.translate(s * 0.1, 1.46, 0.14); B.add(ch, '#ff9eb0');
  }
  const smile = G.torus(0.035, 0.01, 3, 8, PI); smile.rotateZ(PI); smile.translate(0, 1.47, 0.165); B.add(smile, C.ink);
  const hat = G.cone(0.34, 0.2, 12); hat.translate(0, 1.72, 0); B.add(hat, C.straw);
  const brim = G.cyl(0.36, 0.36, 0.02, 12); brim.translate(0, 1.62, 0); B.add(brim, shade(C.straw, 0.9));
  const band = G.cyl(0.2, 0.22, 0.05, 12); band.translate(0, 1.67, 0); B.add(band, C.red);
  const cl = { x0: -0.35, x1: 0.35, yTop: 1.2, yBot: 0.62 };
  const shirt = G.plane(0.52, 0.56, 3, 4); shirt.translate(0, 0.92, 0.05); B.cloth(shirt, '#6a8ad0', cl);
  const shirtB = G.plane(0.52, 0.56, 3, 4); shirtB.rotateY(PI); shirtB.translate(0, 0.92, -0.05); B.cloth(shirtB, '#6a8ad0', cl);
  for (const s of [-1, 1]) { const sl = G.plane(0.3, 0.16, 2, 1); sl.translate(s * 0.38, 1.12, 0.04); B.cloth(sl, '#e8a040', { x0: -0.55, x1: 0.55, yTop: 1.2, yBot: 1.04 }); }
  for (const s of [-1, 1]) { const straw = G.cone(0.05, 0.14, 5); straw.rotateZ(s * PI / 2); straw.translate(s * 0.55, 1.15, 0); B.add(straw, C.straw); }
  const patch = G.box(0.1, 0.1, 0.01, 0); patch.translate(0.1, 0.85, 0.06); B.add(patch, '#ff9eb0');
}

// Fishing net (cloth lattice) hanging from yTop in the local face frame
export function net(B, { w = 1, h = 0.8, yTop = 1.5, color = '#e0d0a0' } = {}) {
  const cl = { x0: -w / 2, x1: w / 2, yTop, yBot: yTop - h };
  const nx = Math.round(w / 0.13), ny = Math.round(h / 0.13);
  for (let i = 0; i <= nx; i++) {
    const x = -w / 2 + i * w / nx, hh = h * (1 - Math.abs(i / nx - 0.5) * 0.35);
    const g = G.plane(0.02, hh, 1, 4); g.translate(x, yTop - hh / 2, 0); B.cloth(g, color, cl);
  }
  for (let j = 1; j <= ny; j++) { const y = yTop - j * h / ny; const g = G.plane(w * (1 - (j / ny) * 0.3), 0.02, 6, 1); g.translate(0, y, 0.003); B.cloth(g, shade(color, 0.9), cl); }
  for (let k = 0; k < 4; k++) { const f = G.sph(0.035, 5, 4); f.translate(-w / 2 + (k + 0.5) * w / 4, yTop - h * 0.85, 0.01); B.cloth(f, k % 2 ? '#ff7a5a' : '#fff6ea', cl); }
}

export function fishRack(B, { w = 1.1, n = 5 } = {}) {
  for (const s of [-1, 1]) { const p = G.cyl(0.03, 0.035, 1.1, 5); p.translate(s * w / 2, 0.55, 0); B.add(p, C.woodMid); }
  const bar = G.cyl(0.02, 0.02, w + 0.1, 5); bar.rotateZ(PI / 2); bar.translate(0, 1.05, 0); B.add(bar, C.woodMid);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * w / n;
    const f = G.sph(0.06, 8, 5); f.scale(0.5, 1.9, 0.9); f.translate(x, 0.84, 0); B.add(f, B.pick(['#8ab8e0', '#a8c8e8', '#f4a878']));
    const tail = G.cone(0.05, 0.08, 4); tail.rotateX(PI); tail.scale(0.4, 1, 1); tail.translate(x, 0.68, 0); B.add(tail, '#6a98c8');
    const str = G.box(0.01, 0.12, 0.01, 0); str.translate(x, 1.0, 0); B.add(str, C.ink);
  }
}

export function boat(B, { L = 1.4, color = '#f0e8d8', trim = '#4a78b0' } = {}) {
  const hull = new THREE.SphereGeometry(0.5, 14, 5, 0, TAU, PI / 2, PI / 2); hull.scale(L, 0.5, 0.55); hull.translate(0, 0.25, 0);
  B.add(hull, (p, n, o) => o.set(p.y > 0.14 ? trim : color));
  const inner = new THREE.SphereGeometry(0.47, 14, 4, 0, TAU, PI / 2, PI / 2); inner.scale(L, 0.44, 0.52); inner.translate(0, 0.25, 0);
  const inv = inner.index ? inner.toNonIndexed() : inner; // flip to face inward
  const p = inv.attributes.position; for (let i = 0; i < p.count; i += 3) { const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z); }
  inv.computeVertexNormals(); B.add(inv, C.woodLight);
  const rim = G.torus(0.5, 0.03, 4, 16); rim.rotateX(PI / 2); rim.scale(L, 1, 0.55); rim.translate(0, 0.25, 0); B.add(rim, C.woodMid);
  const seat = G.box(0.1, 0.04, 0.5, 0); seat.translate(0, 0.2, 0); B.add(seat, C.woodLight);
}

export function bucket(B, { r = 0.1, h = 0.14, color = C.woodLight, water = false } = {}) {
  const g = G.cyl(r, r * 0.85, h, 10, true); g.translate(0, h / 2, 0); B.add(g, color);
  const bot = G.cyl(r * 0.85, r * 0.85, 0.01, 10); bot.translate(0, 0.005, 0); B.add(bot, shade(color, 0.8));
  for (const y of [0.25, 0.8]) { const b = G.torus(r * (1 - y * 0.15) + 0.004, 0.009, 3, 12); b.rotateX(PI / 2); b.translate(0, h * y, 0); B.add(b, C.iron); }
  if (water) { const wtr = G.disc(r * 0.95, 10); wtr.rotateX(-PI / 2); wtr.translate(0, h * 0.8, 0); B.add(wtr, C.water, 'water'); }
}

// Cute stone guardian dog (komainu) facing +z
export function stoneDog(B, { s = 1, ball = 1 } = {}) {
  B.push([0, 0, 0], 0, s);
  const base = G.box(0.4, 0.2, 0.36, 0.04); base.translate(0, 0.1, 0); B.add(base, STONES[2]);
  const body = G.sph(0.16, 10, 8); body.scale(1, 1.1, 1.15); body.translate(0, 0.36, -0.03); B.add(body, STONES[0]);
  const head = G.sph(0.14, 10, 8); head.translate(0, 0.58, 0.05); B.add(head, STONES[0]);
  for (const sx of [-1, 1]) { const ear = G.sph(0.06, 6, 4); ear.scale(0.6, 1.2, 0.8); ear.rotateZ(sx * 0.7); ear.translate(sx * 0.12, 0.64, 0.02); B.add(ear, STONES[4]); }
  const snout = G.sph(0.07, 8, 6); snout.scale(1.1, 0.8, 1); snout.translate(0, 0.54, 0.17); B.add(snout, STONES[3]);
  const nose = G.sph(0.026, 5, 4); nose.translate(0, 0.565, 0.235); B.add(nose, C.ink);
  for (const sx of [-1, 1]) { const e = G.sph(0.02, 5, 4); e.translate(sx * 0.055, 0.62, 0.17); B.add(e, C.ink); }
  const bib = G.torus(0.11, 0.028, 4, 10); bib.rotateX(PI / 2 - 0.3); bib.translate(0, 0.46, 0.03); B.add(bib, C.red);
  const bl = G.sph(0.065, 8, 6); bl.translate(ball * 0.11, 0.26, 0.15); B.add(bl, C.red);
  const tail = G.sph(0.07, 6, 5); tail.scale(0.8, 1.2, 0.8); tail.translate(0, 0.45, -0.2); B.add(tail, STONES[3]);
  B.pop();
}

// Shimenawa rope with shide paper zigzags (x from -w/2..w/2 at height y)
export function shimenawa(B, { w = 1.2, y = 1.5, sag = 0.15, z = 0, r = 0.045 } = {}) {
  const pts = [];
  for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push({ p: V(-w / 2 + w * t, y - Math.sin(t * PI) * sag, z), r: r * (0.7 + Math.sin(t * PI) * 0.5) }); }
  B.add(tube(pts, 6, false), (p, n, o) => o.set('#ecd8a0').multiplyScalar(0.86 + 0.14 * Math.sin(p.x * 60)));
  for (let k = 1; k < 4; k++) {
    const t = k / 4, x = -w / 2 + w * t, yy = y - Math.sin(t * PI) * sag - r;
    const cl = { x0: x - 0.06, x1: x + 0.06, yTop: yy, yBot: yy - 0.3 };
    for (let j = 0; j < 3; j++) { const g = G.plane(0.08, 0.1, 1, 1); g.translate(x + (j % 2 ? 0.025 : -0.025), yy - 0.05 - j * 0.09, z + r + 0.01); B.cloth(g, '#ffffff', cl); }
  }
}

// cluster of pots / vases
export function pottery(B, { n = 5, spread = 0.3 } = {}) {
  const pal = ['#5a8ac8', '#e8e0d0', '#c86a4a', '#6aa878', '#f4d8a8'];
  for (let i = 0; i < n; i++) {
    const r = B.rand(0.06, 0.1), h = B.rand(0.12, 0.24);
    const g = G.lathe([[0.001, 0], [r * 0.7, 0], [r, h * 0.45], [r * 0.55, h * 0.85], [r * 0.65, h], [0.001, h * 0.95]], 10);
    g.translate(B.wob(spread), 0, B.wob(spread));
    const c = B.pick(pal);
    B.add(g, (p, nn, o) => o.set(c).lerp(col('#ffffff'), Math.abs(p.y - h * 0.5) < 0.015 ? 0.6 : 0));
  }
}

// Pinwheel (spinning, animated) on a stick
export function pinwheel(B, { h = 0.9, colors = ['#ff6f7f', '#ffd24a', '#6ab0ff', '#8fe0c0'] } = {}) {
  const st = G.cyl(0.012, 0.012, h, 4); st.translate(0, h / 2, 0); B.add(st, C.woodLight);
  B.anim({ p: [0, h, 0.03], kind: 'spin', axis: [0, 0, 1], speed: B.rand(2.5, 4) }, () => {
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.13, 0.02); s.quadraticCurveTo(0.14, 0.12, 0.02, 0.13); s.lineTo(0, 0);
      const g = new THREE.ShapeGeometry(s, 4); g.rotateZ(i * PI / 2);
      const back = g.clone(); back.rotateY(PI);
      B.add(g, colors[i % colors.length]); B.add(back, shade(colors[i % colors.length], 0.8));
    }
    const pin = G.sph(0.02, 5, 4); B.add(pin, C.gold);
  });
}
