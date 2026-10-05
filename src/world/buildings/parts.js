// Architectural kit parts: stone foundations, plaster + timber walls, shoji / round windows, sliding
// doors, noren curtains, engawa porches, chimneys, steps and fences. All take a Builder `B` and build
// in its current local frame (front = +z).
import * as THREE from 'three';
import { puff, tube } from '../../gfx/geom.js';
import { G, V, C, PI, bar, shade, mixc } from './kit.js';
import { shapeGeo, flatSymbol } from './symbols.js';
import { wallSpan, streak, plasterPatch, sudare, grille, shutterBox } from './trim.js';

export const STONES = ['#d9d0c8', '#c9bfc6', '#b8adb8', '#e4dcd2', '#cfc4b8', '#bdb4c4'];

// Push a frame on a wall face. blk = {w, d, cx, cz}; side f/r/b/l; u = offset to the right seen from outside
export function onFace(B, blk, side, u, y, fn) {
  const { w, d, cx = 0, cz = 0 } = blk;
  const T = {
    f: [[cx + u, y, cz + d / 2], 0], r: [[cx + w / 2, y, cz - u], PI / 2],
    b: [[cx - u, y, cz - d / 2], PI], l: [[cx - w / 2, y, cz + u], -PI / 2],
  }[side];
  B.at(T[0], T[1], fn);
}

// rectangular ring of beams around a block
export function ring(B, cx, cz, w, d, y, hgt, thick, color, r = 0.02) {
  const a = G.box(w, hgt, thick, r); a.translate(cx, y, cz + d / 2 - thick / 2); B.add(a, color);
  const b = G.box(w, hgt, thick, r); b.translate(cx, y, cz - d / 2 + thick / 2); B.add(b, color);
  const c = G.box(thick, hgt, d - thick * 2 + 0.002, r); c.translate(cx + w / 2 - thick / 2, y, cz); B.add(c, color);
  const e = G.box(thick, hgt, d - thick * 2 + 0.002, r); e.translate(cx - w / 2 + thick / 2, y, cz); B.add(e, color);
}

// Chunky stone plinth ringed with rounded stones
export function foundation(B, { w, d, h = 0.3, cx = 0, cz = 0, color = C.stoneDark, stones = true, pad = 0.14 }) {
  const base = G.box(w + pad, h, d + pad, 0.07); base.translate(cx, h / 2, cz);
  B.add(base, { grad: [shade(color, 0.85), color] });
  if (!stones) return;
  const W = w + pad, D = d + pad, per = 2 * (W + D);
  const n = Math.max(8, Math.round(per / 0.4));
  for (let i = 0; i < n; i++) {
    let u = (i + B.rand(0.1, 0.4)) / n * per, x, z, nx = 0, nz = 0;
    if (u < W) { x = -W / 2 + u; z = D / 2; nz = 1; } else if ((u -= W) < D) { x = W / 2; z = D / 2 - u; nx = 1; }
    else if ((u -= D) < W) { x = W / 2 - u; z = -D / 2; nz = -1; } else { u -= W; x = -W / 2; z = -D / 2 + u; nx = -1; }
    const r = B.rand(0.14, 0.19);
    const g = puff(V(0, 0, 0), r, { detail: 1, noise: 0.28, squash: 0.72, seed: i * 7 + B.seed });
    g.scale(nx ? 0.5 : 1.2, h / (r * 1.7) * B.rand(0.65, 0.9), nz ? 0.5 : 1.2);
    g.translate(cx + x - nx * 0.01, h * B.rand(0.38, 0.5), cz + z - nz * 0.01);
    const st = B.pick(STONES);
    // older foundations: moss on the tops of some stones
    if (B.dchance(B.richness === 0 ? 0.4 : B.richness === 1 ? 0.18 : 0)) { const sc = new THREE.Color(st), mc = new THREE.Color(B.dpick(['#7cae5a', '#8cbc62', '#6e9e52'])); B.add(g, (p, n, o) => o.copy(sc).lerp(mc, Math.min(1, Math.max(0, (n.y - 0.35) * 1.6)) * 0.85)); }
    else B.add(g, st);
  }
}

// Plaster walls with a timber frame (posts, top beam, sill, mid rail, optional koshi plank wainscot)
export function walls(B, o) {
  const { w, d, h, y0 = 0.3, cx = 0, cz = 0 } = o;
  const plaster = o.plaster || C.plaster, frame = o.frame || C.timber;
  if (o.planks) {
    // full wooden plank walls (workshops, huts)
    const body = G.box(w, h, d, 0.05); body.translate(cx, y0 + h / 2, cz); B.add(body, { grad: [shade(o.planks, 0.85), o.planks] });
    for (const side of ['f', 'b', 'r', 'l']) {
      const L = side === 'f' || side === 'b' ? w : d;
      const n = Math.max(2, Math.round(h / 0.22));
      for (let i = 1; i < n; i++) onFace(B, { w, d, cx, cz }, side, 0, y0 + i * h / n, () => {
        const g = G.box(L - 0.12, 0.025, 0.02, 0); g.translate(0, 0, 0.005); B.add(g, shade(o.planks, 0.72));
      });
    }
  } else {
    const body = G.box(w, h, d, 0.05); body.translate(cx, y0 + h / 2, cz);
    B.add(body, { grad: [shade(plaster, 0.93), plaster] });
  }
  // corner posts, head beam, sill plate (planed timber: bevelled beams, far cheaper than rounded boxes)
  const pt = 0.13;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const g = G.beam(pt, h + 0.04, pt, 0.025); g.translate(cx + sx * (w / 2 - pt * 0.25), y0 + h / 2, cz + sz * (d / 2 - pt * 0.25)); B.add(g, frame);
  }
  ring(B, cx, cz, w + 0.05, d + 0.05, y0 + h - 0.06, 0.12, 0.09, frame, 0);
  ring(B, cx, cz, w + 0.06, d + 0.06, y0 + 0.05, 0.1, 0.09, shade(frame, 0.92), 0);
  if (o.rail !== false && !o.planks && !o.koshi) ring(B, cx, cz, w + 0.03, d + 0.03, y0 + h * (o.railAt ?? 0.36), 0.05, 0.05, frame, 0);
  if (o.koshi) {
    const kh = o.koshiH ?? 0.44;
    for (const side of ['f', 'r', 'b', 'l']) {
      const L = side === 'f' || side === 'b' ? w : d;
      if (o.koshiSkip?.includes(side)) continue;
      onFace(B, { w, d, cx, cz }, side, 0, y0 + 0.12 + kh / 2, () => {
        const p = G.box(L - 0.16, kh, 0.05, 0.015); p.translate(0, 0, 0.01); B.add(p, o.koshi);
        const cap = G.beam(L - 0.12, 0.05, 0.08, 0.015); cap.translate(0, kh / 2, 0.02); B.add(cap, shade(o.koshi, 0.8));
        const n = Math.round((L - 0.16) / 0.15);
        for (let i = 1; i < n; i++) { const g = G.box(0.018, kh - 0.04, 0.012, 0); g.translate(-(L - 0.16) / 2 + i * (L - 0.16) / n, -0.01, 0.037); B.add(g, shade(o.koshi, 0.8)); }
      });
    }
  }
  // extra posts on long faces
  if (o.posts) for (const [side, us] of Object.entries(o.posts)) for (const u of us) onFace(B, { w, d, cx, cz }, side, u, y0 + h / 2, () => {
    const g = G.box(0.13, h, 0.06, 0.02); g.translate(0, 0, 0.01); B.add(g, frame);
  });
  // remembered so windows / doors placed next can frame themselves to this wall (trim.wallSpan)
  B._wall = { m: B.m.clone(), y0, h, w, d, cx, cz, plaster, frame, planks: !!o.planks, koshiTop: o.koshi ? y0 + 0.12 + (o.koshiH ?? 0.44) : null };
  if (o.weather !== false) weatherWalls(B, { w, d, h, y0, cx, cz, planks: o.planks, koshi: o.koshi });
}

// Humble walls show their age: a patch or two of flaked plaster (lath showing) low on a side wall.
// Richer walls stay clean. Planks get a couple of darker replaced boards instead.
function weatherWalls(B, { w, d, h, y0, cx, cz, planks, koshi }) {
  const rich = B.richness;
  if (planks) {
    const n = rich === 0 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const side = B.dpick(['r', 'l', 'b']), L = side === 'b' ? w : d;
      onFace(B, { w, d, cx, cz }, side, B.drand(-L / 2 + 0.3, L / 2 - 0.3), y0 + B.drand(0.15, h - 0.35), () => {
        const g = G.box(B.drand(0.25, 0.45), 0.16, 0.008, 0); g.translate(0, 0, 0.004); B.add(g, B.dpick(['#c8a070', '#8a6a52', '#b89878']));
        for (const s of [-1, 1]) { const nail = G.box(0.02, 0.02, 0.01, 0); nail.translate(s * 0.08, 0, 0.01); B.add(nail, C.iron); }
      });
    }
    return;
  }
  if (rich >= 2 || !B.dchance(rich === 0 ? 0.9 : 0.4)) return;
  const n = rich === 0 ? B.dpick([1, 2, 2]) : 1;
  const yLow = koshi ? y0 + 0.12 + 0.44 + 0.2 : y0 + 0.3;
  for (let i = 0; i < n; i++) {
    const side = B.dpick(['r', 'l', 'b']), L = side === 'b' ? w : d;
    if (L < 1) continue;
    const u = (B.dchance(0.5) ? 1 : -1) * (L / 2 - B.drand(0.2, 0.3));
    onFace(B, { w, d, cx, cz }, side, u, 0, () => plasterPatch(B, 0, Math.min(yLow + B.drand(0, 0.25), y0 + h - 0.3), B.drand(0.75, 1.05)));
  }
}

// rectangle frame in local face space (z out)
export function frameRect(B, w, h, t, dz, color) {
  const top = G.box(w + t * 0.4, t, dz, 0.02); top.translate(0, h / 2 - t / 2, dz / 2); B.add(top, color);
  const bot = G.box(w, t, dz, 0.02); bot.translate(0, -h / 2 + t / 2, dz / 2); B.add(bot, color);
  const l = G.box(t, h - t * 1.6, dz, 0.02); l.translate(-w / 2 + t / 2, 0, dz / 2); B.add(l, color);
  const r = G.box(t, h - t * 1.6, dz, 0.02); r.translate(w / 2 - t / 2, 0, dz / 2); B.add(r, color);
}

// Shoji window (local face frame, centred). opts: w, h, frame, box (flower box), hood (roof colour), lattice
export function shoji(B, o = {}) {
  const w = o.w ?? 0.7, h = o.h ?? 0.62, frame = o.frame || C.timber;
  const pane = G.box(w - 0.08, h - 0.08, 0.04, 0); pane.translate(0, 0, 0.02);
  B.glow(pane, o.paper || C.paper);
  frameRect(B, w, h, 0.065, 0.07, frame);
  const nx = Math.max(1, Math.round(w / (o.cell ?? 0.24)) - 1), ny = Math.max(1, Math.round(h / (o.cellY ?? 0.24)) - 1);
  for (let i = 1; i <= nx; i++) { const g = G.box(0.02, h - 0.1, 0.02, 0); g.translate(-w / 2 + i * w / (nx + 1), 0, 0.05); B.add(g, frame); }
  for (let j = 1; j <= ny; j++) { const g = G.box(w - 0.1, 0.02, 0.02, 0); g.translate(0, -h / 2 + j * h / (ny + 1), 0.05); B.add(g, frame); }
  if (o.sill !== false) { const s = G.box(w + 0.16, 0.06, 0.13, 0.02); s.translate(0, -h / 2 - 0.02, 0.07); B.add(s, frame); }
  if (o.box) B.at([0, -h / 2 - 0.16, 0.14], 0, () => flowerBox(B, { w: w + 0.08, colors: o.flowers, wood: o.boxWood }));
  if (o.hood) hood(B, w + 0.3, h / 2 + 0.12, o.hood);
  if (o.trim !== false) openingTrim(B, w, h, { frame, box: o.box, hood: o.hood, dress: o.dress, kind: 'window' });
}

// Koshi lattice window (the Kyoto machiya look): a chunky timber frame round a glowing paper pane behind close
// vertical slats, a kumiko band of little squares under the head rail and a deep sill. bay: the lattice stands out
// from the wall on side boards under a little tiled cap (degoshi). Local face frame, centred on the opening.
// opts: w, h, frame, slat (slat colour, default frame), bay, roof (cap tile colour), wood (cap brackets), box, flowers,
// boxWood, paper
export function latticeWindow(B, o = {}) {
  const w = o.w ?? 0.7, h = o.h ?? 0.6, frame = o.frame || C.timber, slat = o.slat || frame, bay = o.bay ? 0.11 : 0;
  const pane = G.box(w - 0.08, h - 0.08, 0.04, 0); pane.translate(0, 0, 0.02); B.glow(pane, o.paper || C.paper);
  if (bay) for (const s of [-1, 1]) { const sd = G.box(0.07, h - 0.02, bay + 0.02, 0.015); sd.translate(s * (w / 2 - 0.035), 0, (bay + 0.02) / 2); B.add(sd, shade(frame, 0.9)); }
  B.at([0, 0, bay], 0, () => frameRect(B, w, h, 0.072, 0.072, frame));
  const iw = w - 0.13, n = Math.max(4, Math.round(iw / 0.058)), z = bay + 0.05;
  for (let i = 1; i < n; i++) { const s = G.box(0.032, h - 0.12, 0.03, 0); s.translate(-iw / 2 + i * iw / n, -0.01, z); B.add(s, i % 2 ? slat : shade(slat, 0.88)); }
  // kumiko band: a second head rail with a mid bar crossing the slats (a row of little squares)
  const yb = h / 2 - 0.072 - 0.1;
  const r1 = G.box(iw + 0.02, 0.034, 0.036, 0); r1.translate(0, yb, z + 0.006); B.add(r1, shade(frame, 0.94));
  const r2 = G.box(iw, 0.02, 0.026, 0); r2.translate(0, yb + 0.05, z + 0.008); B.add(r2, shade(slat, 0.94));
  const r3 = G.box(iw, 0.03, 0.034, 0); r3.translate(0, -h / 2 + 0.11, z + 0.006); B.add(r3, shade(frame, 0.94));
  const s = G.box(w + 0.16, 0.07, 0.14 + bay, 0.025); s.translate(0, -h / 2 - 0.025, (0.14 + bay) / 2); B.add(s, frame);
  const lip = G.box(w + 0.18, 0.025, 0.03, 0); lip.translate(0, -h / 2 - 0.065, 0.13 + bay); B.add(lip, shade(frame, 0.8));
  if (o.box) B.at([0, -h / 2 - 0.17, 0.15 + bay], 0, () => flowerBox(B, { w: w + 0.06, colors: o.flowers, wood: o.boxWood }));
  if (bay) hood(B, w + 0.18, h / 2 + 0.1, o.roof || shade(frame, 1.15), 0.17 + bay, o.wood);
  if (o.trim !== false) openingTrim(B, w, h, { frame, box: o.box, hood: !!bay, dress: 'none', kind: 'window' });
}

// Framing + dressing around an opening in the current face frame (opening centred at local 0, size w x h):
// flanking posts from the sill plate to the head beam (so the wall reads as timber-framed panels), a head
// beam (kamoi), a rain stain under the sill, and per-building window dressing chosen once per model:
// humble → storm-shutter box or a rolled blind, middling → bamboo blinds, rich → lattice grilles.
export function openingTrim(B, w, h, { frame = C.timber, box = false, hood: hasHood = false, dress, kind = 'window', round = false } = {}) {
  const ws = wallSpan(B);
  const rich = B.richness;
  if (ws && ws.yb < -h / 2 && ws.yt > h / 2) {
    // flanking posts on the bigger (level 2+) walls, only where they leave a real plaster panel before the corner
    const px = (round ? w / 2 + 0.06 : w / 2 + 0.07);
    for (const s of [-1, 1]) {
      if (rich < 1 || ws.planks || Math.abs(ws.u + s * px) > ws.L / 2 - 0.34) continue;
      const g = G.beam(0.075, ws.yt - ws.yb - 0.16, 0.05, 0.012); g.translate(s * px, (ws.yt + ws.yb) / 2, 0.018); B.add(g, frame);
    }
    if (!hasHood && ws.yt - h / 2 > 0.16) { const k = G.beam(Math.min(w + 0.3, ws.L - 0.2), 0.06, 0.06, 0.012); k.translate(0, h / 2 + 0.06, 0.03); B.add(k, frame); }
    if (!box && !ws.planks && kind === 'window') streak(B, B.dwob(0.05), -h / 2 - 0.06, Math.max(ws.koshiTop ?? ws.yb + 0.12, -h / 2 - 0.62), 0.32);
  }
  if (kind !== 'window' || round) return;
  const style = dress ?? (B._dress ??= pickDress(B));
  if (style === 'sudare') sudare(B, w - 0.02, h / 2 + 0.01, { drop: B.dchance(0.5) ? h * B.drand(0.3, 0.5) : 0, z: 0.09 });
  else if (style === 'grille') grille(B, w - 0.06, h - 0.08, { color: shade(frame, 1.05) });
  else if (style === 'shutter' && !box && ws) {
    // storm-shutter box on whichever side has room before the corner post
    const need = w / 2 + 0.34, right = ws.L / 2 - ws.u, left = ws.L / 2 + ws.u;
    const s = right > need && (left <= need || B.dchance(0.5)) ? 1 : left > need ? -1 : 0;
    if (s) shutterBox(B, s * (w / 2 + 0.2), h, { color: shade(frame, 1.12) });
  }
  void rich;
}
function pickDress(B) {
  const r = B.richness;
  return r === 0 ? B.dpick(['shutter', 'sudare', 'none']) : r === 1 ? B.dpick(['sudare', 'sudare', 'shutter', 'grille']) : B.dpick(['grille', 'grille', 'sudare']);
}

// small tiled hood (hisashi) above a window / door, local face frame (wood: the bracket colour)
export function hood(B, w, y, color, depth = 0.34, wood = C.woodDark) {
  B.at([0, y, 0], 0, () => {
    const slab = G.box(w, 0.07, depth, 0.03); slab.rotateX(0.42); slab.translate(0, 0.02, depth / 2 - 0.02);
    B.add(slab, color);
    const edge = G.box(w + 0.04, 0.06, 0.07, 0.025); edge.translate(0, -0.05, depth - 0.02); B.add(edge, mixc(color, '#fff6ea', 0.42));
    const n = Math.max(2, Math.round(w / 0.16));
    for (let i = 0; i <= n; i++) { const r = G.cyl(0.03, 0.03, depth * 0.95, 5); r.rotateX(PI / 2 + 0.42); r.translate(-w / 2 + 0.04 + i * (w - 0.08) / n, 0.07, depth / 2 - 0.02); B.add(r, shade(color, 1.12)); }
    for (const s of [-1, 1]) { const b = G.box(0.05, 0.05, depth * 0.7, 0.015); b.rotateX(-0.6); b.translate(s * (w / 2 - 0.1), -0.12, 0.12); B.add(b, wood); }
  });
}

// Round window (maru-mado)
export function roundWindow(B, o = {}) {
  const r = o.r ?? 0.3, frame = o.frame || C.timber;
  const pane = G.disc(r * 0.96, 18); pane.translate(0, 0, 0.03); B.glow(pane, o.paper || C.paper);
  const ring = G.torus(r, 0.06, 6, 20); ring.translate(0, 0, 0.05); B.add(ring, frame);
  if (o.lattice !== false) {
    const v = G.box(0.022, r * 1.9, 0.02, 0); v.translate(0, 0, 0.05); B.add(v, frame);
    const hbar = G.box(r * 1.9, 0.022, 0.02, 0); hbar.translate(0, 0, 0.05); B.add(hbar, frame);
    if (o.lattice === 'fine') for (const s of [-1, 1]) {
      const v2 = G.box(0.022, r * 1.6, 0.02, 0); v2.translate(s * r * 0.48, 0, 0.055); B.add(v2, frame);
      const h2 = G.box(r * 1.6, 0.022, 0.02, 0); h2.translate(0, s * r * 0.48, 0.055); B.add(h2, frame);
    }
  }
  if (o.box) B.at([0, -r - 0.12, 0.14], 0, () => flowerBox(B, { w: r * 2 + 0.1, colors: o.flowers, wood: o.boxWood }));
  if (o.trim !== false) openingTrim(B, r * 2, r * 2, { frame, box: o.box, round: true });
}

// Sliding door (local face frame, bottom at y=0). style: 'shoji' | 'wood' | 'lattice' | 'round'
export function door(B, o = {}) {
  const w = o.w ?? 0.9, h = o.h ?? 1.42, frame = o.frame || C.timber, wood = o.wood || C.woodLight;
  const style = o.style || 'shoji';
  // (the parts below keep their count and order: each coloured part draws on the Builder's random stream, which also
  // places everything built after the door)
  if (style === 'round') {
    // arched cottage door: a dark arched recess, the door slab (front face at z = 0.12), plank seams running up into
    // the arch and a porthole standing proud of it, a brass knob, and the timber arch + posts framing it in front
    const yc = h - w / 2, R = w / 2 - 0.06, arc = r => { const s = new THREE.Shape(); s.moveTo(-r, 0); s.lineTo(-r, yc); s.absarc(0, yc, r, PI, 0, true); s.lineTo(r, 0); return s; };
    const back = shapeGeo([arc(w / 2 - 0.03)], 0.02, 0); B.add(back, shade(frame, 0.7));
    const g = shapeGeo([arc(R)], 0.06, 0.02); g.translate(0, 0, 0.02); B.add(g, wood);
    for (const x of [-1, 1].map(s => s * Math.min(0.14, R * 0.56))) { const top = yc + Math.sqrt(R * R - x * x) - 0.05; const pl = G.box(0.022, top - 0.05, 0.012, 0); pl.translate(x, 0.05 + (top - 0.05) / 2, 0.122); B.add(pl, shade(wood, 0.72)); }
    const pr = Math.min(0.13, R * 0.5);
    const win = G.disc(pr, 14); win.translate(0, yc, 0.124); B.glow(win, C.paper);
    const wr = G.torus(pr, 0.03, 5, 14); wr.translate(0, yc, 0.128); B.add(wr, frame);
    const knob = G.sph(0.045, 8, 6); knob.translate(w / 2 - 0.2, h * 0.45, 0.155); B.add(knob, C.gold);
    const arch = G.torus(w / 2 - 0.02, 0.06, 5, 14, PI); arch.translate(0, yc, 0.09); B.add(arch, frame);
    for (const s of [-1, 1]) { const p = G.box(0.1, yc, 0.12, 0.02); p.translate(s * (w / 2 - 0.02), yc / 2, 0.09); B.add(p, frame); }
    return;
  }
  // recess + panels
  const back = G.box(w, h, 0.04, 0); back.translate(0, h / 2, 0.01); B.add(back, shade(frame, 0.7));
  const pw = w / 2 + 0.02;
  for (const s of [-1, 1]) {
    B.at([s * (w / 4 - 0.005), 0, 0.03 + (s > 0 ? 0.025 : 0)], 0, () => {
      const kick = G.box(pw - 0.04, 0.42, 0.04, 0.01); kick.translate(0, 0.25, 0); B.add(kick, wood);
      if (style === 'wood') {
        const up = G.box(pw - 0.04, h - 0.5, 0.04, 0.01); up.translate(0, 0.46 + (h - 0.5) / 2, 0); B.add(up, shade(wood, 0.94));
        for (let i = 1; i < 3; i++) { const pl = G.box(0.02, h - 0.1, 0.02, 0); pl.translate(-pw / 2 + i * pw / 3, h / 2, 0.025); B.add(pl, shade(wood, 0.75)); }
        const win = G.box(pw * 0.55, 0.26, 0.03, 0); win.translate(0, h - 0.32, 0.015); B.glow(win, C.paper);
      } else {
        const pane = G.box(pw - 0.06, h - 0.56, 0.03, 0); pane.translate(0, 0.46 + (h - 0.56) / 2, 0); B.glow(pane, C.paper);
        const cells = style === 'lattice' ? 5 : 3;
        for (let i = 1; i < cells; i++) { const g = G.box(0.022, h - 0.56, 0.02, 0); g.translate(-pw / 2 + i * pw / cells, 0.46 + (h - 0.56) / 2, 0.02); B.add(g, frame); }
        for (let j = 1; j < 4; j++) { const g = G.box(pw - 0.06, 0.022, 0.02, 0); g.translate(0, 0.46 + j * (h - 0.56) / 4, 0.02); B.add(g, frame); }
      }
      B.at([0, 0.02 + (h - 0.04) / 2, 0], 0, () => frameRect(B, pw, h - 0.04, 0.06, 0.05, frame)); // panel frame (frameRect is centred)
    }, 1);
  }
  // lintel + posts
  const lin = G.box(w + 0.24, 0.13, 0.12, 0.03); lin.translate(0, h + 0.06, 0.05); B.add(lin, frame);
  for (const s of [-1, 1]) { const p = G.box(0.11, h, 0.1, 0.025); p.translate(s * (w / 2 + 0.03), h / 2, 0.05); B.add(p, frame); }
  const th = G.box(w + 0.2, 0.05, 0.14, 0.02); th.translate(0, 0.02, 0.06); B.add(th, shade(frame, 0.9));
  if (o.trim !== false) doorTrim(B, w, h, frame, style);
}

// The remodel doors (exterior styles, styles.js): door() stays the village's own look; doorway() builds a chosen
// door. style: 'shoji' (paper panes over a kick board) | 'lattice' (koshi-do: close slats over paper) | 'wood'
// (painted board panels with a little paper window) | 'round' (arched storybook door: planks, iron straps, porthole).
// frame: the opening's timber (lintel, posts, threshold); wood: the door colour; panel: the sliding panels' stiles
// and muntins (default frame). Local face frame, bottom at y = 0.
export function doorway(B, o = {}) {
  const w = o.w ?? 0.9, h = o.h ?? 1.42, frame = o.frame || C.timber, wood = o.wood || C.woodLight, panel = o.panel || frame;
  const style = o.style || 'shoji';
  if (style === 'round') return archDoor(B, w, h, frame, wood);
  const back = G.box(w, h, 0.04, 0); back.translate(0, h / 2, 0.01); B.add(back, shade(frame, 0.62));
  const pw = w / 2 + 0.02, ph = h - 0.04, iw = pw - 0.1;
  for (const s of [-1, 1]) {
    B.at([s * (w / 4 - 0.005), 0, 0.03 + (s > 0 ? 0.026 : 0)], 0, () => {
      const kick = G.box(iw + 0.02, 0.34, 0.03, 0.01); kick.translate(0, 0.22, 0); B.add(kick, shade(wood, 0.94));
      const kr = G.box(iw + 0.04, 0.045, 0.045, 0); kr.translate(0, 0.4, 0.005); B.add(kr, panel);
      if (style === 'wood') {
        // horizontal painted boards (each its own tone) under a small paper window
        const yTop = h - 0.42, nb = 4, bh = (yTop - 0.42) / nb;
        for (let i = 0; i < nb; i++) { const b = G.box(iw, bh - 0.016, 0.03, 0.008); b.translate(0, 0.42 + bh * (i + 0.5), 0); B.add(b, shade(wood, [1, 0.93, 1.04, 0.96][i])); }
        const mr = G.box(iw + 0.04, 0.045, 0.045, 0); mr.translate(0, yTop + 0.01, 0.005); B.add(mr, panel);
        const win = G.box(iw - 0.02, h - yTop - 0.14, 0.02, 0); win.translate(0, (yTop + h - 0.1) / 2, -0.004); B.glow(win, C.paper);
        const mv = G.box(0.024, h - yTop - 0.14, 0.024, 0); mv.translate(0, (yTop + h - 0.1) / 2, 0.012); B.add(mv, panel);
        const mh = G.box(iw - 0.02, 0.024, 0.024, 0); mh.translate(0, (yTop + h - 0.1) / 2, 0.012); B.add(mh, panel);
      } else {
        const y0 = 0.42, y1 = h - 0.08, hh = y1 - y0;
        const pane = G.box(iw, hh, 0.02, 0); pane.translate(0, y0 + hh / 2, -0.004); B.glow(pane, C.paper);
        if (style === 'lattice') {
          const n = Math.max(5, Math.round(iw / 0.045));
          for (let i = 1; i < n; i++) { const g = G.box(0.026, hh, 0.028, 0); g.translate(-iw / 2 + i * iw / n, y0 + hh / 2, 0.012); B.add(g, i % 2 ? wood : shade(wood, 0.88)); }
          for (const yy of [y0 + hh * 0.7, y1 - 0.06]) { const g = G.box(iw, 0.03, 0.034, 0); g.translate(0, yy, 0.016); B.add(g, panel); }
        } else {
          for (let i = 1; i < 3; i++) { const g = G.box(0.024, hh, 0.022, 0); g.translate(-iw / 2 + i * iw / 3, y0 + hh / 2, 0.01); B.add(g, panel); }
          for (let j = 1; j < 4; j++) { const g = G.box(iw, 0.024, 0.022, 0); g.translate(0, y0 + j * hh / 4, 0.01); B.add(g, panel); }
        }
      }
      B.at([0, 0.02 + ph / 2, 0], 0, () => frameRect(B, pw, ph, 0.062, 0.05, panel));
    }, 1);
  }
  const lin = G.box(w + 0.24, 0.13, 0.12, 0.03); lin.translate(0, h + 0.06, 0.05); B.add(lin, frame);
  for (const s of [-1, 1]) { const p = G.beam(0.11, h, 0.1, 0.02); p.translate(s * (w / 2 + 0.03), h / 2, 0.05); B.add(p, frame); }
  const th = G.box(w + 0.2, 0.05, 0.14, 0.02); th.translate(0, 0.02, 0.06); B.add(th, shade(frame, 0.88));
  if (o.trim !== false) doorTrim(B, w, h, frame, style);
}

// arched storybook door: three planks (each its own tone) cut to the arch, iron strap hinges, a porthole window,
// a brass knob, all inside a chunky timber arch on posts
function archDoor(B, w, h, frame, wood) {
  const r = w / 2 - 0.05, yc = h - w / 2, gap = 0.014;
  const arch = (x0, x1, R, inset = 0) => {
    const sh = new THREE.Shape(), top = x => yc + Math.sqrt(Math.max(0, R * R - x * x));
    sh.moveTo(x0, inset); sh.lineTo(x1, inset);
    for (let k = 0; k <= 6; k++) { const x = x1 + (x0 - x1) * k / 6; sh.lineTo(x, top(x)); }
    sh.closePath(); return sh;
  };
  const back = shapeGeo([arch(-r - 0.02, r + 0.02, r + 0.02)], 0.02, 0); back.translate(0, 0, 0.005); B.add(back, shade(frame, 0.55));
  const pl = (2 * r - 2 * gap) / 3;
  for (let i = 0; i < 3; i++) {
    const x0 = -r + i * (pl + gap), g = shapeGeo([arch(x0, x0 + pl, r, 0.03)], 0.04, 0.012);
    g.translate(0, 0, 0.03); B.add(g, shade(wood, [0.97, 1.04, 0.92][i]));
  }
  const zf = 0.03 + 0.04 + 0.024; // plank front face
  for (const yy of [h * 0.24, yc - 0.02]) { // strap hinges from the hinge side
    const st = G.box(w * 0.56, 0.05, 0.016, 0); st.translate(-r + w * 0.28 - 0.01, yy, zf + 0.008); B.add(st, C.iron);
    const end = G.cyl(0.035, 0.035, 0.016, 8); end.rotateX(PI / 2); end.translate(-r + w * 0.56, yy, zf + 0.008); B.add(end, C.iron);
    for (const x of [-r + 0.06, -r + w * 0.3]) { const n = G.sph(0.014, 5, 3); n.translate(x, yy, zf + 0.018); B.add(n, '#6a6670'); }
  }
  const py = yc + r * 0.32, pr = Math.min(0.11, r * 0.34);
  const pane = G.disc(pr, 14); pane.translate(0, py, zf + 0.004); B.glow(pane, C.paper);
  const ring = G.torus(pr, 0.03, 5, 14); ring.translate(0, py, zf + 0.012); B.add(ring, frame);
  const cv = G.box(0.02, pr * 1.9, 0.02, 0); cv.translate(0, py, zf + 0.012); B.add(cv, frame);
  const ch = G.box(pr * 1.9, 0.02, 0.02, 0); ch.translate(0, py, zf + 0.012); B.add(ch, frame);
  const plate = G.cyl(0.05, 0.05, 0.012, 8); plate.rotateX(PI / 2); plate.translate(r - 0.13, h * 0.44, zf + 0.006); B.add(plate, C.bronze);
  const knob = G.sph(0.042, 8, 6); knob.translate(r - 0.13, h * 0.44, zf + 0.045); B.add(knob, C.gold);
  const at = G.torus(w / 2 - 0.01, 0.066, 6, 16, PI); at.translate(0, yc, 0.07); B.add(at, frame);
  const key = G.box(0.1, 0.13, 0.1, 0.025); key.translate(0, yc + w / 2 + 0.02, 0.085); B.add(key, shade(frame, 1.12));
  for (const s of [-1, 1]) { const p = G.beam(0.12, yc, 0.11, 0.02); p.translate(s * (w / 2 - 0.01), yc / 2, 0.07); B.add(p, frame); }
  const th = G.box(w + 0.14, 0.05, 0.16, 0.02); th.translate(0, 0.02, 0.07); B.add(th, shade(frame, 0.88));
}

// Pull handles on the sliding panels and, on richer buildings, a ranma transom (lattice + glowing paper)
// between the lintel and the wall's head beam.
function doorTrim(B, w, h, frame, style) {
  const pw = w / 2 + 0.02;
  for (const s of [-1, 1]) {
    const hx = s * (w / 4 - 0.005) - s * (pw / 2 - 0.09), hz = 0.03 + (s > 0 ? 0.025 : 0) + 0.03;
    const pull = G.box(0.035, 0.11, 0.012, 0); pull.translate(hx, h * 0.5, hz); B.add(pull, '#3a2a28');
    const ring = G.box(0.05, 0.13, 0.006, 0); ring.translate(hx, h * 0.5, hz - 0.004); B.add(ring, C.bronze);
  }
  const ws = wallSpan(B); if (!ws || B.richness < 1) return;
  const y0 = h + 0.14, y1 = ws.yt - 0.13;
  if (y1 - y0 < 0.13) return;
  const rh = Math.min(0.3, y1 - y0), ry = y0 + rh / 2, rw = w + 0.1;
  const pane = G.box(rw - 0.06, rh - 0.05, 0.02, 0); pane.translate(0, ry, 0.012); B.glow(pane, C.paper);
  const fr = G.box(rw, 0.035, 0.05, 0); fr.translate(0, y0 + rh - 0.018, 0.03); B.add(fr, frame);
  const n = B.richness >= 2 ? 7 : 5;
  for (let i = 1; i < n; i++) { const b = G.box(0.022, rh - 0.04, 0.02, 0); b.translate(-rw / 2 + i * rw / n, ry, 0.03); B.add(b, frame); }
  if (B.richness >= 2) { const m = G.box(rw - 0.06, 0.02, 0.02, 0); m.translate(0, ry, 0.031); B.add(m, frame); }
  void style;
}

// Noren curtain hanging from y (top) in local face frame. strips of cloth with a white hem & optional symbol
export function noren(B, o = {}) {
  const w = o.w ?? 0.9, h = o.h ?? 0.55, y = o.y ?? 1.5, z = o.z ?? 0.2, color = o.color || C.indigo, rodC = o.rod || C.woodDark;
  const n = o.strips ?? 3, gap = 0.035, sw = (w - gap * (n - 1)) / n;
  const rod = G.cyl(0.025, 0.025, w + 0.16, 6); rod.rotateZ(PI / 2); rod.translate(0, y + 0.02, z); B.add(rod, rodC);
  for (const s of [-1, 1]) { const b = G.box(0.04, 0.05, z + 0.02, 0.01); b.translate(s * (w / 2 + 0.05), y + 0.02, z / 2); B.add(b, rodC); }
  const hem = o.hem ?? 0.07, cl = { x0: -w / 2, x1: w / 2, yTop: y, yBot: y - h };
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + sw / 2 + i * (sw + gap);
    const g = G.plane(sw, h - hem, 2, 4); g.translate(x, y - (h - hem) / 2, z);
    B.cloth(g, { grad: [shade(color, 0.88), color] }, cl);
    const hg = G.plane(sw, hem, 2, 1); hg.translate(x, y - h + hem / 2, z);
    B.cloth(hg, o.hemColor || '#f4efe6', cl);
  }
  if (o.symbol) {
    const sg = o.symbol(); // flat shape geometry, unit sized, facing +z
    sg.scale(o.symScale ?? h * 0.45, o.symScale ?? h * 0.45, 1); sg.translate(0, y - h * 0.45, z + 0.006);
    B.cloth(sg, o.symColor || '#fff6ea', cl);
  }
}

// Noren crest (flat, unit size, facing +z, for noren({ symbol })): a symbols.js print, or 'wave' (three rolling
// wave bands, the indigo-noren classic)
export function norenMark(name) {
  if (name !== 'wave') return flatSymbol(name);
  const shapes = [];
  for (let k = 0; k < 3; k++) {
    const yc = 0.25 - k * 0.25, t = 0.085 - k * 0.008, sh = new THREE.Shape(), N = 14;
    const f = x => yc + 0.065 * Math.sin((x + 0.4) / 0.8 * PI * 3 + k * 0.9);
    for (let i = 0; i <= N; i++) { const x = -0.42 + 0.84 * i / N; if (i) sh.lineTo(x, f(x) + t / 2); else sh.moveTo(x, f(x) + t / 2); }
    for (let i = N; i >= 0; i--) { const x = -0.42 + 0.84 * i / N; sh.lineTo(x, f(x) - t / 2); }
    sh.closePath(); shapes.push(sh);
  }
  const g = new THREE.ShapeGeometry(shapes, 4);
  return g.index ? g.toNonIndexed() : g;
}

// Festival bunting: strings of little triangle flags sagging between consecutive points (local [x,y,z] list). The
// flags are cloth (they flutter); colours cycle through `colors` from `phase`.
export const BUNTING = ['#e8503a', '#ffd24a', '#fff6ea', '#5a9ad8', '#ff8fb0', '#6ac08a'];
export function bunting(B, pts, { sag = 0.1, size = 0.11, gap = 0.13, colors = BUNTING, cord = '#5a4038', phase = 0 } = {}) {
  let k = phase;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = V(...pts[i]), b = V(...pts[i + 1]), L = a.distanceTo(b), sg = sag * Math.min(1, L / 1.2);
    const P = t => V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sg * 4 * t * (1 - t), a.z + (b.z - a.z) * t);
    const cp = []; for (let j = 0; j <= 10; j++) cp.push({ p: P(j / 10), r: 0.01 });
    B.add(tube(cp, 4, false), cord);
    for (const e of [a, b]) { const kn = G.sph(0.022, 6, 4); kn.translate(e.x, e.y, e.z); B.add(kn, cord); }
    const n = Math.max(2, Math.round(L / gap));
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n, p = P(t), tan = P(Math.min(1, t + 0.03)).sub(P(Math.max(0, t - 0.03))).normalize();
      const l = p.clone().addScaledVector(tan, -size * 0.48), r = p.clone().addScaledVector(tan, size * 0.48);
      const tip = p.clone(); tip.y -= size * 1.12;
      const ml = l.clone().lerp(tip, 0.55), mr = r.clone().lerp(tip, 0.55);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([l, ml, r, ml, mr, r, ml, tip, mr].flatMap(q => [q.x, q.y, q.z]), 3));
      g.computeVertexNormals();
      const c = colors[k++ % colors.length];
      B.cloth(g, { grad: [shade(c, 0.84), c] }, { x0: -2, x1: 2, yTop: p.y, yBot: tip.y });
    }
  }
}

// Engawa porch deck along the front of a block. x0..x1 along x at z front edge; depth; deck height y
// (wood: the deck planks; beam: the front beam and legs)
export function engawa(B, { x0, x1, z, depth = 0.7, y = 0.32, posts = true, step = true, wood = C.woodLight, beam: beamC = C.woodDark }) {
  const w = x1 - x0, cx = (x0 + x1) / 2;
  const n = Math.max(3, Math.round(depth / 0.14));
  for (let i = 0; i < n; i++) {
    const g = G.box(w, 0.07, depth / n - 0.012, 0.012); g.translate(cx, y - 0.035, z + (i + 0.5) * depth / n);
    B.add(g, B.pick([wood, shade(wood, 0.94), shade(wood, 1.05)]));
  }
  const beam = G.box(w, 0.1, 0.08, 0.02); beam.translate(cx, y - 0.1, z + depth - 0.04); B.add(beam, beamC);
  const legs = Math.max(2, Math.round(w / 1.2) + 1);
  for (let i = 0; i < legs; i++) { const l = G.box(0.1, y - 0.06, 0.1, 0.02); l.translate(x0 + 0.08 + i * (w - 0.16) / (legs - 1), (y - 0.06) / 2, z + depth - 0.08); B.add(l, beamC); }
  if (step) { const s = puff(V(0, 0, 0), 0.3, { detail: 1, noise: 0.2, squash: 0.35, seed: B.seed + 3 }); s.scale(1.5, 1, 0.9); s.translate(cx + B.wob(0.2), 0.08, z + depth + 0.22); B.add(s, STONES[0]); }
  return { top: y, front: z + depth };
}

// Veranda posts holding up an eave line (x list) from ground to y
export function posts(B, xs, z, y, color = C.woodDark, r = 0.07) {
  for (const x of xs) {
    const p = G.cyl(r, r * 1.1, y, 8); p.translate(x, y / 2, z); B.add(p, color);
    const base = G.cyl(r * 1.8, r * 2.1, 0.12, 8); base.translate(x, 0.06, z); B.add(base, STONES[2]);
  }
}

// Stone chimney rising from yBase to yTop at (x,z); registers smoke emitter
export function chimney(B, x, z, yBase, yTop, s = 1) {
  const n = Math.max(2, Math.round((yTop - yBase) / 0.26));
  const W = 0.36 * s;
  for (let i = 0; i < n; i++) {
    const hh = (yTop - yBase) / n;
    const g = G.box(W + B.wob(0.03), hh + 0.02, W + B.wob(0.03), 0.05);
    g.rotateY(B.wob(0.08)); g.translate(x + B.wob(0.015), yBase + hh * (i + 0.5), z + B.wob(0.015));
    const st = B.pick(STONES);
    B.add(g, i === n - 1 ? mixc(st, '#6a6070', 0.38) : st); // soot on the top course
  }
  const cap = G.box(W + 0.12, 0.08, W + 0.12, 0.035); cap.translate(x, yTop + 0.04, z); B.add(cap, C.stoneDark);
  const pot = G.cyl(0.08 * s, 0.1 * s, 0.16 * s, 8); pot.translate(x, yTop + 0.08 + 0.08 * s, z); B.add(pot, C.terracotta);
  const lip = G.cyl(0.092 * s, 0.092 * s, 0.03 * s, 8); lip.translate(x, yTop + 0.08 + 0.15 * s, z); B.add(lip, mixc(C.terracotta, '#4a3a3a', 0.45));
  if (B.dchance(B.richness >= 1 ? 0.55 : 0.35)) { // a little iron rain hat on two stilts
    const y1 = yTop + 0.08 + 0.16 * s + 0.07;
    for (const sx of [-1, 1]) { const p = G.box(0.025, y1 - yTop - 0.08, 0.025, 0); p.translate(x + sx * 0.1 * s, (y1 + yTop + 0.08) / 2, z); B.add(p, C.iron); }
    for (const sx of [-1, 1]) { const sl = G.box(0.17 * s, 0.03, 0.3 * s, 0); sl.rotateZ(-sx * 0.55); sl.translate(x + sx * 0.07 * s, y1 + 0.045 * s, z); B.add(sl, '#5a5864'); }
    const rid = G.box(0.035, 0.035, 0.31 * s, 0); rid.translate(x, y1 + 0.085 * s, z); B.add(rid, '#4a4854');
  }
  B.smokeAt([x, yTop + 0.2 + 0.16 * s, z]);
}

// Stone steps (local): n slabs rising toward -z, front edge at z=0
export function steps(B, { w = 1, n = 2, rise = 0.14, run = 0.26, color } = {}) {
  for (let i = 0; i < n; i++) {
    const g = G.box(w - i * 0.06 + B.wob(0.03), rise * (i + 1), run + 0.02, 0.04);
    g.translate(B.wob(0.02), rise * (i + 1) / 2, -run * (i + 0.5));
    B.add(g, color || B.pick(STONES));
  }
}

// Stepping stones path from (x0,z0) to (x1,z1)
export function stepStones(B, x0, z0, x1, z1, n = 3) {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const g = puff(V(0, 0, 0), 0.22, { detail: 1, noise: 0.25, squash: 0.3, seed: B.seed + i * 5 });
    g.scale(1.2, 1, 1); g.rotateY(B.rand(0, PI)); g.translate(x0 + (x1 - x0) * t + B.wob(0.08), 0.03, z0 + (z1 - z0) * t + B.wob(0.05));
    B.add(g, B.pick(STONES));
  }
}

// Fence run from a to b ([x,z]); style picket | bamboo | rail | rope
export function fence(B, a, b, { style = 'picket', h = 0.6, color } = {}) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ang = Math.atan2(dx, dz);
  const wood = color || (style === 'bamboo' ? '#b8c870' : C.woodLight);
  B.at([a[0], 0, a[1]], ang, () => {
    // local: runs along +z from 0..L
    if (style === 'bamboo') {
      const n = Math.max(2, Math.round(L / 0.11));
      for (let i = 0; i < n; i++) {
        const hh = h + B.wob(0.04);
        const p = G.cyl(0.045, 0.05, hh, 6); p.translate(B.wob(0.01), hh / 2, (i + 0.5) * L / n);
        B.add(p, B.pick([wood, shade(wood, 0.9), shade(wood, 1.08)]));
      }
      for (const y of [h * 0.3, h * 0.78]) { const r = G.cyl(0.03, 0.03, L, 5); r.rotateX(PI / 2); r.translate(0.06, y, L / 2); B.add(r, C.woodDark); }
      for (let i = 0; i <= Math.round(L / 0.9); i++) { const k = G.cyl(0.06, 0.06, h + 0.1, 6); k.translate(0, (h + 0.1) / 2, i * L / Math.max(1, Math.round(L / 0.9))); B.add(k, '#8a9a50'); }
      return;
    }
    const posts = Math.max(1, Math.round(L / 0.9));
    for (let i = 0; i <= posts; i++) {
      const p = G.box(0.1, h + 0.12, 0.1, 0.025); p.rotateY(B.wob(0.1)); p.translate(0, (h + 0.12) / 2, i * L / posts); B.add(p, shade(wood, 0.8));
      const c = G.cone(0.08, 0.1, 4); c.rotateY(PI / 4); c.translate(0, h + 0.17, i * L / posts); B.add(c, shade(wood, 0.8));
    }
    if (style === 'rope') {
      for (let i = 0; i < posts; i++) {
        const z0 = i * L / posts, z1 = (i + 1) * L / posts, pts = [];
        for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push({ p: V(0, h - 0.05 - Math.sin(t * PI) * 0.12, z0 + (z1 - z0) * t), r: 0.02 }); }
        B.add(tubeOf(pts), '#e8d8a8');
      }
      return;
    }
    for (const y of style === 'rail' ? [h * 0.35, h * 0.8] : [h * 0.3, h * 0.72]) { const r = G.box(0.05, 0.07, L, 0.015); r.translate(0.04, y, L / 2); B.add(r, wood); }
    if (style === 'picket') {
      const n = Math.max(2, Math.round(L / 0.16));
      for (let i = 0; i < n; i++) {
        const hh = h * B.rand(0.85, 1.0);
        const p = G.box(0.035, hh, 0.1, 0.012); p.translate(0.08, hh / 2, (i + 0.5) * L / n); B.add(p, B.pick([C.white, '#fff0e0', '#fff8f0']));
        const tip = G.cone(0.05, 0.07, 4); tip.scale(0.5, 1, 1); tip.translate(0.08, hh + 0.03, (i + 0.5) * L / n); B.add(tip, C.white);
      }
    }
  });
}

export function tubeOf(pts, radial = 5) { return tube(pts, radial, false); }

// Flower box / planter trough (local centre at its top)
export function flowerBox(B, { w = 0.7, d = 0.2, h = 0.16, colors, wood } = {}) {
  const box = G.box(w, h, d, 0.03); box.translate(0, -h / 2, 0); B.add(box, wood || C.woodMid);
  const trim = G.box(w + 0.04, 0.04, d + 0.04, 0.015); trim.translate(0, -0.01, 0); B.add(trim, shade(wood || C.woodMid, 0.8));
  const n = Math.max(3, Math.round(w / 0.1));
  const pal = colors || [B.pick(FLOWERS), B.pick(FLOWERS)];
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * w / n + B.wob(0.02);
    const leaf = G.sph(0.075, 6, 4); leaf.scale(1, 0.75, 0.9); leaf.translate(x, 0.03, B.wob(0.03));
    B.add(leaf, B.pick(['#5a9a48', '#6aae50', '#4f8f44']));
    if (B.chance(0.85)) { const f = G.sph(0.048, 6, 4); f.scale(1, 0.7, 1); f.translate(x + B.wob(0.02), 0.08 + B.rand(0, 0.04), B.wob(0.04) + 0.02); B.add(f, B.pick(pal)); }
  }
}
export const FLOWERS = ['#ff8fb0', '#ffd24a', '#ffffff', '#c8a8ff', '#ff6f7f', '#ffb86a', '#8fc8ff', '#ffbcd6'];

export { bar };
