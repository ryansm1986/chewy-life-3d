// Momiji Hollow props (docs/REGIONS.md §2), kit pieces { body, glow, leaf, cloth, water, lights } for Placer.piece,
// cached per (kind, seed); ground at y = 0.
//  taikobashi   the arched red drum bridge: vermilion rails with bronze giboshi finials (deck along local z, .deckAt(z))
//  lookout      a timber viewing deck with a railing, a bench, a coin telescope and a signboard (open side +z)
//  bench        a slatted bench with a red felt cushion and a lantern post
//  jizo         a stone jizo in a red bib and knitted cap with a pinwheel and offerings; jizoTrio = three in a row
//  hasa         a rice-drying rack: crossed poles and a rail hung with sheaves (along local x)
//  sheaf        a standing rice stook; warabocchi: a conical straw stack with a little cap; bale: a round straw bale
//  kakashi      a cheerful scarecrow in a sugegasa hat with a crow on its arm
//  tanuki       a shigaraki tanuki statue with a straw hat and a sake flask
//  komodaru     a straw-wrapped sake barrel; lanternLine: red chochin on a sagging rope between two posts
//  stubble      a row of cut rice stubble (d:grass)
//  waterfall    { geo } a curved falling-water sheet (uv.y = 0 at the lip) for M('fall'), plus foam()
import * as THREE from 'three';
import { Builder, G, C, PI, shade, bar } from '../../world/buildings/kit.js';
import { toro, chochin, barrel, bench as kitBench, lanternPost, rock as kitRock, mossStone, lrng, leafGeo } from '../../world/buildings/props.js';
import { pinwheel, sack } from '../../world/buildings/props2.js';
import { STONES } from '../../world/buildings/parts.js';
import { DETAIL_SHOWCASE } from '../../world/details.js';
import { tube, puff, paint, merge } from '../../gfx/geom.js';
import { mulberry32, TAU, clamp } from '../../core/util.js';
import { V, col, nz } from './bambooKit.js';
import { kit } from './bambooProps.js';

const cache = new Map();
const cached = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
const STRAW = '#e2c070', STRAW_D = '#b8904a';
const strawPaint = (base = STRAW) => { const c = col(base); return (p, n, o) => o.copy(c).multiplyScalar(0.82 + 0.2 * clamp(n.y + 0.4) + 0.08 * Math.sin(Math.atan2(p.z, p.x) * 23 + p.y * 9)); };

// ------------------------------------------------------------------ taikobashi
export function taikobashi(seed = 0, { L = 6.4, w = 1.7, rise = 0.95, deck = 0.3 } = {}) {
  return cached(`taiko:${seed}:${L}:${w}:${rise}`, () => {
    const yAt = z => deck + rise * Math.cos(clamp(z / (L / 2), -1, 1) * PI / 2);
    const red = '#e0482e', redD = '#b8382a';
    const pc = kit(seed * 7 + 3, B => {
      const n = Math.round(L / 0.2);
      for (let i = 0; i < n; i++) { // curved plank deck
        const z = -L / 2 + (i + 0.5) * L / n, y = yAt(z), t = Math.atan2(yAt(z + 0.05) - yAt(z - 0.05), 0.1);
        B.at([0, y - 0.04, z], 0, () => { const g = G.box(w, 0.08, L / n - 0.02, 0.01); const c = B.pick([C.woodMid, '#a07a5a', '#8a6a52']); B.add(g, (p, nn, o) => o.set(c).multiplyScalar(nn.y > 0.5 ? 1 : 0.78)); }, 1, -t);
      }
      // side beams: thick vermilion stringers that follow the arch, a darker underside
      for (const sx of [-1, 1]) {
        const pts = []; for (let k = 0; k <= 16; k++) { const z = -L / 2 + k / 16 * L; pts.push({ p: V(sx * (w / 2 + 0.04), yAt(z) - 0.14, z), r: 0.1 }); }
        B.add(tube(pts, 6, false), (p, nn, o) => o.set(nn.y < -0.3 ? redD : red));
      }
      // arch piers and cross beams underneath
      for (const z of [-L * 0.28, L * 0.28]) for (const sx of [-1, 1]) { const y = yAt(z); const g = G.cyl(0.09, 0.1, y + 0.9, 8); g.translate(sx * (w / 2 - 0.1), (y - 0.9) / 2, z); B.add(g, (p, nn, o) => { o.set(red); if (p.y < 0.05) o.set('#5a4a40'); }); }
      // railings: posts with giboshi finials, a top rail and a mid rail, following the arch
      const posts = [-0.47, -0.3, -0.13, 0.04, 0.2, 0.36, 0.5].map(f => f * L);
      for (const sx of [-1, 1]) {
        const x = sx * (w / 2 + 0.02);
        for (const z of posts) {
          const zc = clamp(z, -L / 2 + 0.08, L / 2 - 0.08), y = yAt(zc);
          const p = G.box(0.1, 0.72, 0.1, 0.02); p.translate(x, y + 0.34, zc); B.add(p, red);
          const gb = G.lathe([[0.001, 0], [0.07, 0.02], [0.075, 0.07], [0.05, 0.1], [0.08, 0.15], [0.03, 0.24], [0.001, 0.29]], 8); gb.translate(x, y + 0.7, zc);
          B.add(gb, (pp, nn, o) => o.set('#c89a4a').lerp(col('#ffe0a0'), clamp(nn.y) * 0.35)); // bronze giboshi
        }
        for (const hy of [0.62, 0.3]) {
          const pts = []; for (let k = 0; k <= 16; k++) { const z = -L * 0.47 + k / 16 * L * 0.97; pts.push({ p: V(x, yAt(z) + hy, z), r: hy > 0.5 ? 0.05 : 0.035 }); }
          B.add(tube(pts, 6, false), red);
        }
      }
    }, 0.01);
    return { ...pc, deckAt: yAt, L, w };
  });
}

// ------------------------------------------------------------------ lookout, bench, jizo
export function lookout(seed = 0, { W = 3.2, D = 2.2, h = 0.45 } = {}) {
  return cached(`lookout:${seed}:${W}:${D}`, () => kit(seed * 11 + 5, B => {
    const n = Math.round(W / 0.22);
    for (let i = 0; i < n; i++) { const x = -W / 2 + (i + 0.5) * W / n, g = G.box(W / n - 0.025, 0.07, D, 0.01); g.translate(x, h, 0); const c = B.pick([C.woodLight, '#b8845a', C.woodMid]); B.add(g, (p, nn, o) => o.set(c).multiplyScalar(nn.y > 0.5 ? 1 : 0.8)); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const g = G.box(0.12, h + 1.2, 0.12, 0.02); g.translate(sx * (W / 2 - 0.08), (h - 1.2) / 2 + 0.4, sz * (D / 2 - 0.08)); B.add(g, C.woodDark); }
    for (const sz of [-1, 1]) { const g = G.box(W, 0.1, 0.1, 0.02); g.translate(0, h - 0.1, sz * (D / 2 - 0.08)); B.add(g, C.timber); }
    // railing on the three open sides (the back, -z, is the approach)
    const rail = (a, b) => { B.add(bar(a, b, 0.07, 0.015), C.woodDark); };
    const y1 = h + 0.95, y2 = h + 0.5;
    for (const y of [y1, y2]) { rail(V(-W / 2 + 0.08, y, D / 2 - 0.08), V(W / 2 - 0.08, y, D / 2 - 0.08)); for (const sx of [-1, 1]) rail(V(sx * (W / 2 - 0.08), y, -D / 2 + 0.08), V(sx * (W / 2 - 0.08), y, D / 2 - 0.08)); }
    for (let i = 1; i < 6; i++) { const x = -W / 2 + i * W / 6, g = G.box(0.06, 0.95, 0.06, 0.01); g.translate(x, h + 0.48, D / 2 - 0.08); B.add(g, C.woodDark); }
    // coin telescope on a post, looking out over the valley
    B.at([0.7, h, D / 2 - 0.45], 0, () => {
      const post = G.cyl(0.05, 0.07, 0.95, 8); post.translate(0, 0.48, 0); B.add(post, '#4a5a6a');
      const box = G.box(0.16, 0.14, 0.14, 0.03); box.translate(0, 1.0, 0); B.add(box, '#5a8ac8');
      B.at([0, 1.1, 0], 0, () => { const tb = G.cyl(0.06, 0.08, 0.42, 10); tb.rotateX(PI / 2 - 0.2); tb.translate(0, 0.02, 0.12); B.add(tb, '#4a7ab8'); const lens = G.cyl(0.085, 0.085, 0.04, 10); lens.rotateX(PI / 2 - 0.2); lens.translate(0, 0.06, 0.32); B.add(lens, C.gold); });
    });
    B.at([-0.55, h, -0.2], 0, () => kitBench(B, { w: 1.2 }));
    B.at([-W / 2 - 0.35, 0, -D / 2 - 0.2], 0.3, () => {
      const p = G.box(0.1, 1.3, 0.1, 0.02); p.translate(0, 0.65, 0); B.add(p, C.woodDark);
      const bd = G.box(0.62, 0.36, 0.06, 0.03); bd.translate(0, 1.15, 0.06); B.add(bd, C.woodPale);
      const sym = G.cone(0.1, 0.16, 3); sym.rotateZ(0); sym.translate(-0.12, 1.14, 0.1); B.add(sym, '#6a9a5a');
      const sym2 = G.cone(0.12, 0.2, 3); sym2.translate(0.08, 1.16, 0.1); B.add(sym2, '#e8703a');
      const sun = G.disc(0.05, 10); sun.translate(0.2, 1.24, 0.095); B.add(sun, C.gold);
    });
    B.at([W / 2 + 0.3, 0, -D / 2 + 0.1], 0, () => toro(B, { s: 0.7 }));
    B.light([W / 2 + 0.3, 0.62, -D / 2 + 0.1], { color: '#ffb468', intensity: 2, radius: 5, flicker: 0.6, nightOnly: false });
  }, 0.015));
}
export function bench(seed = 0) {
  return cached('mbench:' + seed, () => kit(seed * 13 + 2, B => {
    kitBench(B, { w: 1.3, wood: '#b8845a' });
    const cushion = G.box(0.5, 0.06, 0.34, 0.03); cushion.translate(-0.25, 0.48, 0); B.add(cushion, '#d84848');
    B.at([0.95, 0, -0.15], 0, () => lanternPost(B, { h: 1.4, color: C.red }));
    B.light([0.95, 1.2, 0.2], { color: '#ffb468', intensity: 1.6, radius: 4, flicker: 0.6, nightOnly: false });
  }, 0.012));
}
export function jizo(seed = 0) {
  return cached('jizo:' + seed, () => kit(seed * 5 + 1, B => {
    const st = '#c8c0c4';
    const base = G.box(0.62, 0.22, 0.52, 0.05); base.translate(0, 0.11, 0); B.add(base, mossStone(STONES[1], 0.45));
    const body = G.lathe([[0.001, 0], [0.24, 0], [0.25, 0.2], [0.21, 0.46], [0.13, 0.56], [0.001, 0.56]], 12); body.translate(0, 0.22, 0);
    B.add(body, (p, nn, o) => { o.set(st); if (nn.y > 0.65) o.lerp(col(C.moss), 0.35); });
    const head = G.sph(0.19, 12, 9); head.translate(0, 0.94, 0); B.add(head, st);
    for (const sx of [-1, 1]) {
      const eye = G.box(0.06, 0.014, 0.012, 0); eye.rotateZ(sx * 0.22); eye.translate(sx * 0.068, 0.95, 0.182); B.add(eye, '#5a4a50');
      const ck = G.disc(0.03, 8); ck.lookAt(V(sx * 0.6, 0, 1)); ck.translate(sx * 0.105, 0.9, 0.158); B.add(ck, '#f0a0a8');
    }
    const smile = G.torus(0.03, 0.008, 3, 8, PI); smile.rotateZ(PI); smile.translate(0, 0.88, 0.183); B.add(smile, '#5a4a50');
    const bib = G.cone(0.27, 0.3, 12); bib.rotateX(PI); bib.scale(1, 1, 0.72); bib.translate(0, 0.62, 0.07); B.add(bib, (p, nn, o) => o.set(C.red).multiplyScalar(nn.z > 0 ? 1 : 0.8));
    const hem = G.torus(0.2, 0.018, 4, 12); hem.rotateX(PI / 2); hem.scale(1, 0.72, 1); hem.translate(0, 0.47, 0.06); B.add(hem, '#fff6ea');
    const hat = G.sph(0.2, 10, 6, 0, TAU, 0, PI / 2); hat.scale(1, 0.9, 1); hat.translate(0, 0.99, -0.01); B.add(hat, (p, nn, o) => o.set(C.red).multiplyScalar(0.9 + 0.12 * Math.sin(p.y * 90)));
    const pom = G.sph(0.05, 7, 5); pom.translate(0, 1.19, -0.02); B.add(pom, '#fff6ea');
    // offerings: tea cups, a little rice ball, persimmons, a pinwheel stuck in the ground
    for (const x of [-0.2, 0.2]) { const c = G.cyl(0.04, 0.032, 0.06, 8); c.translate(x, 0.25, 0.2); B.add(c, '#fff6ea'); }
    for (let k = 0; k < 2; k++) { const f = G.sph(0.05, 8, 6); f.scale(1, 0.8, 1); f.translate(0.08 * (k ? 1 : -1) + 0.02, 0.26, 0.23); B.add(f, '#ff8a26'); }
    B.at([0.42, 0, 0.3], 0, () => pinwheel(B, { h: 0.75 }));
  }, 0.012));
}
export function jizoTrio() { return cached('jizo3', () => DETAIL_SHOWCASE.jizo().pc); }

// ------------------------------------------------------------------ the harvest: hasa, sheaves, straw stacks, bales
const bundle = (B, p, len = 0.46, r = 0.09, droop = 1) => { // a sheaf of rice straw hanging head-down over a rail
  const g = G.cyl(r * 0.6, r, len, 9, true); g.translate(0, -len / 2, 0);
  B.at([p.x, p.y, p.z], B.rand(0, TAU), () => {
    B.add(g, strawPaint(B.pick([STRAW, '#e8c878', '#d8b060'])));
    const band = G.torus(r * 0.62, 0.015, 3, 9); band.rotateX(PI / 2); band.translate(0, -0.06, 0); B.add(band, STRAW_D);
    const heads = G.cone(r * 1.05, len * 0.5 * droop, 9, true); heads.rotateX(PI); heads.translate(0, -len - len * 0.2 * droop, 0); B.add(heads, strawPaint('#d8a848'));
  });
};
export function hasa(seed = 0, { L = 3.4, h = 1.4 } = {}) {
  return cached(`hasa:${seed}:${L}`, () => kit(seed * 3 + 1, B => {
    for (const x of [0, L]) for (const s of [-1, 1]) B.add(bar(V(x + s * 0.3, -0.05, s * 0.18), V(x - s * 0.08, h + 0.22, -s * 0.05), 0.06, 0.015), C.woodMid); // crossed poles
    const rail = G.cyl(0.04, 0.04, L + 0.4, 7); rail.rotateZ(PI / 2); rail.translate(L / 2, h, 0); B.add(rail, C.woodLight);
    for (let i = 0; i < Math.round(L / 0.22); i++) { const x = 0.15 + i * 0.22; for (const s of [-1, 1]) bundle(B, V(x + B.wob(0.02), h + 0.02, s * 0.07), 0.5 + B.rand(0, 0.08), 0.085); }
    const cap = G.cone(0.08, 0.12, 6); cap.translate(0, h + 0.3, 0); B.add(cap, STRAW_D);
  }, 0.02));
}
export function sheaf(seed = 0) {
  return cached('sheaf:' + seed, () => kit(seed * 9 + 4, B => {
    const n = 5;
    for (let i = 0; i < n; i++) { // bundles leaned together into a tepee, ears up
      const a = i / n * TAU + B.rand(0, 0.4), d = V(Math.cos(a), 0, Math.sin(a));
      B.at([d.x * 0.18, 0, d.z * 0.18], -a + PI / 2, () => {
        const g = G.cyl(0.07, 0.11, 0.8, 8, true); g.translate(0, 0.4, 0); B.add(g, strawPaint());
        const ears = G.cone(0.1, 0.3, 8, true); ears.translate(0, 0.94, 0); B.add(ears, strawPaint('#d8a848'));
      }, 1, -0.22);
    }
    const band = G.torus(0.2, 0.025, 3, 12); band.rotateX(PI / 2); band.translate(0, 0.55, 0); B.add(band, STRAW_D);
  }, 0.015));
}
export function warabocchi(seed = 0, { s = 1 } = {}) {
  return cached(`wara:${seed}:${s}`, () => kit(seed * 5 + 7, B => {
    const g = G.lathe([[0.001, 1.9], [0.12, 1.85], [0.35, 1.55], [0.62, 1.0], [0.72, 0.5], [0.7, 0.12], [0.6, 0], [0.001, 0]].map(([r, y]) => [r * s, y * s]), 16);
    B.add(g, (p, n, o) => { o.set(STRAW).multiplyScalar(0.8 + 0.22 * clamp(n.y + 0.4) + 0.1 * Math.sin(Math.atan2(p.z, p.x) * 31 + p.y * 3)); if (p.y < 0.12 * s) o.multiplyScalar(0.8); });
    const cap = G.cone(0.28 * s, 0.45 * s, 12); cap.translate(0, 1.95 * s, 0); B.add(cap, strawPaint('#c8a050'));
    for (const y of [0.55, 1.1]) { const b = G.torus((y > 1 ? 0.52 : 0.71) * s, 0.025 * s, 3, 16); b.rotateX(PI / 2); b.translate(0, y * s, 0); B.add(b, STRAW_D); }
  }, 0.03));
}
export function bale(seed = 0) {
  return cached('bale:' + seed, () => kit(seed * 7 + 2, B => {
    const g = G.cyl(0.55, 0.55, 0.95, 16); g.rotateZ(PI / 2); g.translate(0, 0.53, 0);
    B.add(g, (p, n, o) => { const side = Math.abs(n.x) > 0.8; o.set(STRAW).multiplyScalar(side ? 0.9 + 0.12 * Math.sin(Math.hypot(p.y - 0.53, p.z) * 40) : 0.85 + 0.2 * clamp(n.y + 0.3) + 0.06 * Math.sin(p.x * 50)); });
    for (const x of [-0.25, 0.25]) { const b = G.torus(0.56, 0.02, 3, 16); b.rotateY(PI / 2); b.translate(x, 0.53, 0); B.add(b, '#8a5a3a'); }
  }, 0.02));
}
export function kakashi(seed = 0) {
  return cached('kakashi:' + seed, () => kit(seed * 3 + 8, B => {
    const post = G.cyl(0.04, 0.05, 1.6, 6); post.translate(0, 0.8, 0); B.add(post, C.woodMid);
    const arm = G.cyl(0.035, 0.035, 1.2, 6); arm.rotateZ(PI / 2); arm.translate(0, 1.2, 0); B.add(arm, C.woodMid);
    const head = G.sph(0.2, 12, 9); head.translate(0, 1.58, 0); B.add(head, '#fff4e0');
    // hemoji face: two dots, round cheeks and a big smile
    for (const s of [-1, 1]) { const e = G.sph(0.028, 6, 4); e.translate(s * 0.07, 1.61, 0.185); B.add(e, C.ink); const ch = G.sph(0.036, 6, 4); ch.scale(1, 0.6, 0.5); ch.translate(s * 0.115, 1.53, 0.16); B.add(ch, '#ff9eb0'); }
    const smile = G.torus(0.045, 0.012, 3, 8, PI); smile.rotateZ(PI); smile.translate(0, 1.54, 0.195); B.add(smile, C.ink);
    // sugegasa (conical sedge hat) with a chin tie
    const hat = G.cone(0.5, 0.26, 16); hat.translate(0, 1.84, 0); B.add(hat, (p, n, o) => o.set(STRAW).multiplyScalar(0.84 + 0.14 * Math.sin(Math.hypot(p.x, p.z) * 70)));
    const tieL = tube([{ p: V(-0.2, 1.72, 0.05), r: 0.008 }, { p: V(-0.08, 1.42, 0.16), r: 0.008 }, { p: V(0.08, 1.42, 0.16), r: 0.008 }, { p: V(0.2, 1.72, 0.05), r: 0.008 }], 3, false); B.add(tieL, C.red);
    const cl = { x0: -0.4, x1: 0.4, yTop: 1.28, yBot: 0.6 };
    const shirt = G.plane(0.6, 0.66, 3, 4); shirt.translate(0, 0.96, 0.05); B.cloth(shirt, '#5a7ab8', cl);
    const shirtB = G.plane(0.6, 0.66, 3, 4); shirtB.rotateY(PI); shirtB.translate(0, 0.96, -0.05); B.cloth(shirtB, '#5a7ab8', cl);
    for (const s of [-1, 1]) { const sl = G.plane(0.36, 0.2, 2, 1); sl.translate(s * 0.42, 1.14, 0.04); B.cloth(sl, '#e8a040', { x0: -0.62, x1: 0.62, yTop: 1.26, yBot: 1.05 }); const straw = G.cone(0.06, 0.16, 5); straw.rotateZ(s * PI / 2); straw.translate(s * 0.66, 1.2, 0); B.add(straw, STRAW); }
    const patch = G.box(0.12, 0.12, 0.01, 0); patch.translate(0.12, 0.88, 0.065); B.add(patch, '#ff9eb0');
    const sash = G.box(0.62, 0.07, 0.12, 0.02); sash.translate(0, 0.72, 0); B.add(sash, C.red);
    // a round crow perched on the left arm, eyeing the rice
    B.at([-0.48, 1.24, 0.02], 0.5, () => {
      const bd = G.sph(0.09, 9, 7); bd.scale(1, 0.9, 1.3); bd.translate(0, 0.08, 0); B.add(bd, '#2a2a36');
      const hd = G.sph(0.06, 8, 6); hd.translate(0, 0.16, 0.08); B.add(hd, '#32323e');
      const bk = G.cone(0.022, 0.07, 5); bk.rotateX(PI / 2); bk.translate(0, 0.15, 0.16); B.add(bk, '#e8b040');
      for (const s of [-1, 1]) { const e = G.sph(0.012, 5, 4); e.translate(s * 0.03, 0.18, 0.12); B.add(e, '#ffffff'); }
      const tail = G.box(0.08, 0.015, 0.12, 0); tail.rotateX(-0.4); tail.translate(0, 0.07, -0.14); B.add(tail, '#22222e');
    });
  }, 0.015));
}
export function tanuki(seed = 0, { s = 1 } = {}) {
  return cached(`tanuki:${seed}:${s}`, () => kit(seed * 17 + 3, B => {
    B.push([0, 0, 0], 0, s);
    const fur = '#8a6a4a', belly = '#e8d4b0';
    const body = G.sph(0.34, 14, 10); body.scale(1, 1.05, 0.95); body.translate(0, 0.42, 0); B.add(body, (p, n, o) => o.set(n.z > 0.35 && p.y < 0.6 ? belly : fur).multiplyScalar(0.9 + 0.12 * clamp(n.y + 0.5)));
    const head = G.sph(0.22, 12, 9); head.translate(0, 0.9, 0.02); B.add(head, fur);
    const mask = G.sph(0.12, 10, 7); mask.scale(1.35, 0.7, 0.7); mask.translate(0, 0.9, 0.14); B.add(mask, '#4a3428');
    const muzzle = G.sph(0.09, 10, 7); muzzle.scale(1.1, 0.8, 0.9); muzzle.translate(0, 0.84, 0.19); B.add(muzzle, belly);
    const nose = G.sph(0.03, 6, 5); nose.translate(0, 0.86, 0.27); B.add(nose, '#2a1e1a');
    for (const sx of [-1, 1]) {
      const eye = G.sph(0.03, 7, 5); eye.translate(sx * 0.075, 0.93, 0.21); B.add(eye, '#fffaf2');
      const pu = G.sph(0.017, 5, 4); pu.translate(sx * 0.078, 0.93, 0.235); B.add(pu, C.ink);
      const ear = G.sph(0.06, 7, 5); ear.scale(1, 0.8, 0.5); ear.translate(sx * 0.15, 1.08, 0); B.add(ear, '#5a4030');
      const arm = G.sph(0.09, 8, 6); arm.scale(0.8, 1.3, 0.8); arm.translate(sx * 0.3, 0.52, 0.12); B.add(arm, fur);
      const foot = G.sph(0.1, 8, 6); foot.scale(1, 0.55, 1.2); foot.translate(sx * 0.16, 0.06, 0.16); B.add(foot, fur);
    }
    const hat = G.cone(0.34, 0.14, 14); hat.translate(0, 1.13, 0); B.add(hat, (p, n, o) => o.set(STRAW).multiplyScalar(0.86 + 0.12 * Math.sin(Math.hypot(p.x, p.z) * 60)));
    // sake flask (tokkuri) in his right paw and a ledger in the left
    const fl = G.lathe([[0.001, 0], [0.07, 0.01], [0.09, 0.08], [0.06, 0.16], [0.03, 0.2], [0.035, 0.24], [0.001, 0.25]], 10); fl.translate(0.36, 0.35, 0.18); B.add(fl, '#f4ece0');
    const cord = G.torus(0.05, 0.01, 3, 8); cord.rotateX(PI / 2); cord.translate(0.36, 0.52, 0.18); B.add(cord, C.red);
    const book = G.box(0.14, 0.18, 0.04, 0.01); book.rotateZ(0.2); book.translate(-0.34, 0.45, 0.2); B.add(book, '#6a8ab8');
    const tail = G.sph(0.14, 8, 6); tail.scale(0.8, 0.7, 1.3); tail.translate(0, 0.22, -0.34); B.add(tail, (p, n, o) => o.set(Math.sin(p.z * 60) > 0.2 ? '#4a3428' : fur));
    B.pop();
    const base = G.cyl(0.46 * s, 0.5 * s, 0.1, 10); base.translate(0, -0.02, 0); B.add(base, mossStone(STONES[1], 0.3));
  }, 0.01));
}
export function komodaru(seed = 0) {
  return cached('komo:' + seed, () => kit(seed * 3 + 5, B => {
    barrel(B, { r: 0.26, h: 0.52, wood: '#c8a878' });
    const wrap = G.cyl(0.285, 0.285, 0.34, 14, true); wrap.translate(0, 0.28, 0); B.add(wrap, (p, n, o) => o.set('#e8d8b0').multiplyScalar(0.9 + 0.08 * Math.sin(Math.atan2(p.z, p.x) * 30)));
    for (const y of [0.13, 0.43]) { const b = G.torus(0.29, 0.015, 3, 14); b.rotateX(PI / 2); b.translate(0, y, 0); B.add(b, C.woodDark); }
    const label = G.box(0.2, 0.24, 0.01, 0); label.translate(0, 0.28, 0.29); B.add(label, C.red);
    const mark = G.disc(0.06, 8); mark.translate(0, 0.28, 0.296); B.add(mark, '#fff6ea');
  }, 0.01));
}
export function lanternLine(seed = 0, { L = 4, h = 2.3 } = {}) {
  return cached(`lline:${seed}:${L}:${h}`, () => kit(seed * 13 + 1, B => {
    for (const x of [0, L]) { const p = G.cyl(0.05, 0.06, h + 0.1, 7); p.translate(x, h / 2, 0); B.add(p, C.woodDark); const cap = G.sph(0.06, 6, 4); cap.translate(x, h + 0.08, 0); B.add(cap, C.gold); }
    const sag = 0.3, at = t => V(t * L, h - 0.08 - Math.sin(t * PI) * sag, 0);
    const pts = []; for (let k = 0; k <= 12; k++) pts.push({ p: at(k / 12), r: 0.012 });
    B.add(tube(pts, 4, false), '#3a2a24');
    const n = Math.max(2, Math.round(L / 0.8));
    for (let i = 0; i < n; i++) { const p = at((i + 0.5) / n); B.at([p.x, p.y, p.z], 0, () => chochin(B, { r: 0.13, h: 0.26, cord: 0.05, color: i % 3 === 1 ? '#fff0d0' : C.red })); B.light([p.x, p.y - 0.22, p.z], { color: '#ffb060', intensity: 1.2, radius: 3.5, flicker: 0.8, nightOnly: false }); }
  }, 0.01));
}
export function stubble(seed = 0, { L = 3 } = {}) {
  return cached(`stubble:${seed}:${L}`, () => {
    const r = mulberry32(seed * 7 + 1), parts = [];
    const n = Math.round(L / 0.3);
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + (i + 0.5) * L / n + (r() - 0.5) * 0.05;
      for (let k = 0; k < 7; k++) { // a hill of cut stalks: short tan tubes splaying a touch
        const a = r() * TAU, d = r() * 0.05, h = 0.08 + r() * 0.07, b = V(x + Math.cos(a) * d, 0, Math.sin(a) * d);
        parts.push(paint(tube([{ p: b, r: 0.012 }, { p: b.clone().add(V(Math.cos(a) * 0.02, h, Math.sin(a) * 0.02)), r: 0.009 }], 3, false), (p, nn, o) => o.set('#c8a860').lerp(col('#e8d090'), clamp(p.y / 0.15))));
      }
    }
    return { 'd:grass': merge(parts) };
  });
}

// ------------------------------------------------------------------ waterfall sheet
// A curved ribbon from the lip (y = H, pushed out by `lip`) down to the pool (y = 0), W wide along local x; the face
// looks toward +z. uv.x across, uv.y = 0 at the lip -> 1 at the pool (the material scrolls streaks along it).
export function waterfallGeo({ W = 3, H = 5, lip = 0.8, segs = 14 } = {}) {
  return cached(`fall:${W}:${H}:${lip}`, () => {
    const pos = [], uv = [], idx = [], cols = [], nx = 8;
    for (let j = 0; j <= segs; j++) {
      const v = j / segs, fall = Math.pow(v, 1.3), y = H * (1 - fall), z = lip * Math.sin(Math.min(1, v * 2.2) * PI / 2) - 0.1 * v;
      for (let i = 0; i <= nx; i++) {
        const u = i / nx, w = W * (1 + v * 0.25), x = (u - 0.5) * w;
        pos.push(x, y, z + Math.sin(u * PI) * 0.18 * (1 - v)); uv.push(u, v);
        const c = col('#bfe6f2').lerp(col('#ffffff'), clamp((v - 0.72) * 3.2) + clamp(0.08 - v) * 6);
        cols.push(c.r, c.g, c.b);
        if (i && j) { const q = j * (nx + 1) + i; idx.push(q - nx - 2, q - 1, q - nx - 1, q - 1, q, q - nx - 1); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  });
}
// foam boil at the foot of the fall: lumpy white cushions (d:body)
export function foam(seed = 0, { W = 3 } = {}) {
  return cached(`foam:${seed}:${W}`, () => {
    const r = mulberry32(seed * 3 + 1), parts = [];
    for (let i = 0; i < 9; i++) { const x = (r() - 0.5) * W * 1.2, z = r() * 0.8 - 0.1, g = puff(V(x, 0.02, z), 0.25 + r() * 0.2, { detail: 1, noise: 0.35, squash: 0.35, seed: seed + i }); paint(g, (p, n, o) => o.set('#ffffff').lerp(col('#cfeaf4'), clamp(-n.y + 0.2))); parts.push(g); }
    return { 'd:body': merge(parts) };
  });
}
