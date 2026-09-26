// Architectural kit parts: stone foundations, plaster + timber walls, shoji / round windows, sliding
// doors, noren curtains, engawa porches, chimneys, steps and fences. All take a Builder `B` and build
// in its current local frame (front = +z).
import * as THREE from 'three';
import { puff, tube } from '../../gfx/geom.js';
import { G, V, C, PI, bar, shade, mixc } from './kit.js';
import { shapeGeo } from './symbols.js';

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
    B.add(g, B.pick(STONES));
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
  const pt = 0.13;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const g = G.box(pt, h + 0.04, pt, 0.03); g.translate(cx + sx * (w / 2 - pt * 0.25), y0 + h / 2, cz + sz * (d / 2 - pt * 0.25)); B.add(g, frame);
  }
  ring(B, cx, cz, w + 0.05, d + 0.05, y0 + h - 0.06, 0.12, 0.09, frame);
  ring(B, cx, cz, w + 0.06, d + 0.06, y0 + 0.05, 0.1, 0.09, shade(frame, 0.92));
  if (o.rail !== false && !o.planks && !o.koshi) ring(B, cx, cz, w + 0.03, d + 0.03, y0 + h * (o.railAt ?? 0.36), 0.05, 0.05, frame);
  if (o.koshi) {
    const kh = o.koshiH ?? 0.44;
    for (const side of ['f', 'r', 'b', 'l']) {
      const L = side === 'f' || side === 'b' ? w : d;
      if (o.koshiSkip?.includes(side)) continue;
      onFace(B, { w, d, cx, cz }, side, 0, y0 + 0.12 + kh / 2, () => {
        const p = G.box(L - 0.16, kh, 0.05, 0.015); p.translate(0, 0, 0.01); B.add(p, o.koshi);
        const cap = G.box(L - 0.12, 0.05, 0.08, 0.015); cap.translate(0, kh / 2, 0.02); B.add(cap, shade(o.koshi, 0.8));
        const n = Math.round((L - 0.16) / 0.15);
        for (let i = 1; i < n; i++) { const g = G.box(0.018, kh - 0.04, 0.012, 0); g.translate(-(L - 0.16) / 2 + i * (L - 0.16) / n, -0.01, 0.037); B.add(g, shade(o.koshi, 0.8)); }
      });
    }
  }
  // extra posts on long faces
  if (o.posts) for (const [side, us] of Object.entries(o.posts)) for (const u of us) onFace(B, { w, d, cx, cz }, side, u, y0 + h / 2, () => {
    const g = G.box(0.13, h, 0.06, 0.02); g.translate(0, 0, 0.01); B.add(g, frame);
  });
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
  if (o.box) B.at([0, -h / 2 - 0.16, 0.14], 0, () => flowerBox(B, { w: w + 0.08, colors: o.flowers }));
  if (o.hood) hood(B, w + 0.3, h / 2 + 0.12, o.hood);
}

// small tiled hood (hisashi) above a window / door, local face frame
export function hood(B, w, y, color, depth = 0.34) {
  B.at([0, y, 0], 0, () => {
    const slab = G.box(w, 0.07, depth, 0.03); slab.rotateX(0.42); slab.translate(0, 0.02, depth / 2 - 0.02);
    B.add(slab, color);
    const edge = G.box(w + 0.04, 0.06, 0.07, 0.025); edge.translate(0, -0.05, depth - 0.02); B.add(edge, mixc(color, '#fff6ea', 0.42));
    const n = Math.max(2, Math.round(w / 0.16));
    for (let i = 0; i <= n; i++) { const r = G.cyl(0.03, 0.03, depth * 0.95, 5); r.rotateX(PI / 2 + 0.42); r.translate(-w / 2 + 0.04 + i * (w - 0.08) / n, 0.07, depth / 2 - 0.02); B.add(r, shade(color, 1.12)); }
    for (const s of [-1, 1]) { const b = G.box(0.05, 0.05, depth * 0.7, 0.015); b.rotateX(-0.6); b.translate(s * (w / 2 - 0.1), -0.12, 0.12); B.add(b, C.woodDark); }
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
  if (o.box) B.at([0, -r - 0.12, 0.14], 0, () => flowerBox(B, { w: r * 2 + 0.1, colors: o.flowers }));
}

// Sliding door (local face frame, bottom at y=0). style: 'shoji' | 'wood' | 'lattice' | 'round'
export function door(B, o = {}) {
  const w = o.w ?? 0.9, h = o.h ?? 1.42, frame = o.frame || C.timber, wood = o.wood || C.woodLight;
  const style = o.style || 'shoji';
  // recess + panels
  const back = G.box(w, h, 0.04, 0); back.translate(0, h / 2, 0.01); B.add(back, shade(frame, 0.7));
  if (style === 'round') {
    // arched cottage door
    const shp = new THREE.Shape();
    shp.moveTo(-w / 2 + 0.06, 0); shp.lineTo(-w / 2 + 0.06, h - w / 2); shp.absarc(0, h - w / 2, w / 2 - 0.06, PI, 0, true); shp.lineTo(w / 2 - 0.06, 0);
    const g = shapeGeo([shp], 0.06, 0.02); g.translate(0, 0, 0.02); B.add(g, wood);
    for (const x of [-0.14, 0.14]) { const pl = G.box(0.02, h - w / 2, 0.02, 0); pl.translate(x, (h - w / 2) / 2, 0.1); B.add(pl, shade(wood, 0.78)); }
    const win = G.disc(0.13, 12); win.translate(0, h - w / 2, 0.095); B.glow(win, C.paper);
    const wr = G.torus(0.13, 0.03, 5, 12); wr.translate(0, h - w / 2, 0.1); B.add(wr, frame);
    const knob = G.sph(0.045, 8, 6); knob.translate(w / 2 - 0.2, h * 0.45, 0.12); B.add(knob, C.gold);
    const arch = G.torus(w / 2 - 0.02, 0.06, 5, 14, PI); arch.translate(0, h - w / 2, 0.06); B.add(arch, frame);
    for (const s of [-1, 1]) { const p = G.box(0.1, h - w / 2, 0.1, 0.02); p.translate(s * (w / 2 - 0.02), (h - w / 2) / 2, 0.06); B.add(p, frame); }
    return;
  }
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
      frameRect(B, pw, h - 0.04, 0.06, 0.05, frame); // panel frame
    }, 1);
  }
  // lintel + posts
  const lin = G.box(w + 0.24, 0.13, 0.12, 0.03); lin.translate(0, h + 0.06, 0.05); B.add(lin, frame);
  for (const s of [-1, 1]) { const p = G.box(0.11, h, 0.1, 0.025); p.translate(s * (w / 2 + 0.03), h / 2, 0.05); B.add(p, frame); }
  const th = G.box(w + 0.2, 0.05, 0.14, 0.02); th.translate(0, 0.02, 0.06); B.add(th, shade(frame, 0.9));
}

// Noren curtain hanging from y (top) in local face frame. strips of cloth with a white hem & optional symbol
export function noren(B, o = {}) {
  const w = o.w ?? 0.9, h = o.h ?? 0.55, y = o.y ?? 1.5, z = o.z ?? 0.2, color = o.color || C.indigo;
  const n = o.strips ?? 3, gap = 0.035, sw = (w - gap * (n - 1)) / n;
  const rod = G.cyl(0.025, 0.025, w + 0.16, 6); rod.rotateZ(PI / 2); rod.translate(0, y + 0.02, z); B.add(rod, C.woodDark);
  for (const s of [-1, 1]) { const b = G.box(0.04, 0.05, z + 0.02, 0.01); b.translate(s * (w / 2 + 0.05), y + 0.02, z / 2); B.add(b, C.woodDark); }
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

// Engawa porch deck along the front of a block. x0..x1 along x at z front edge; depth; deck height y
export function engawa(B, { x0, x1, z, depth = 0.7, y = 0.32, posts = true, step = true, wood = C.woodLight }) {
  const w = x1 - x0, cx = (x0 + x1) / 2;
  const n = Math.max(3, Math.round(depth / 0.14));
  for (let i = 0; i < n; i++) {
    const g = G.box(w, 0.07, depth / n - 0.012, 0.012); g.translate(cx, y - 0.035, z + (i + 0.5) * depth / n);
    B.add(g, B.pick([wood, shade(wood, 0.94), shade(wood, 1.05)]));
  }
  const beam = G.box(w, 0.1, 0.08, 0.02); beam.translate(cx, y - 0.1, z + depth - 0.04); B.add(beam, C.woodDark);
  const legs = Math.max(2, Math.round(w / 1.2) + 1);
  for (let i = 0; i < legs; i++) { const l = G.box(0.1, y - 0.06, 0.1, 0.02); l.translate(x0 + 0.08 + i * (w - 0.16) / (legs - 1), (y - 0.06) / 2, z + depth - 0.08); B.add(l, C.woodDark); }
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
    B.add(g, B.pick(STONES));
  }
  const cap = G.box(W + 0.12, 0.08, W + 0.12, 0.035); cap.translate(x, yTop + 0.04, z); B.add(cap, C.stoneDark);
  const pot = G.cyl(0.08 * s, 0.1 * s, 0.16 * s, 8); pot.translate(x, yTop + 0.08 + 0.08 * s, z); B.add(pot, C.terracotta);
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
