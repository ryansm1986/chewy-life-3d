// Trim & dressing: the small things that make a building look lived-in at 10-30 m — rain stains under sills,
// patched plaster, bamboo blinds, lattice grilles, storm-shutter boxes, eave charms (wind chimes, teru teru
// bozu, drying persimmons, garlic, shop bells), rain chains with their basin stones. All in the Builder's local
// frame (front = +z), low-poly, painted with vertex colours. Randomness uses the Builder's detail stream (B.dr)
// so the main stream (props, trees, stones) is untouched.
import * as THREE from 'three';
import { puff, tube } from '../../gfx/geom.js';
import { G, V, C, PI, col, shade, mixc } from './kit.js';
import { clamp } from '../../core/util.js';
import { symbol } from './symbols.js';

// grid quad (nx x ny cells) in the local xy plane at z, painted by fn(u, v) → Color (u,v 0..1)
function gridQuad(w, h, nx, ny, fn) {
  const pos = [], cols = [], c = new THREE.Color();
  const push = (u, v) => { pos.push((u - 0.5) * w, (v - 0.5) * h, 0); fn(u, v, c); cols.push(c.r, c.g, c.b); };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const u0 = i / nx, u1 = (i + 1) / nx, v0 = j / ny, v1 = (j + 1) / ny;
    push(u0, v0); push(u1, v0); push(u1, v1); push(u0, v0); push(u1, v1); push(u0, v1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

// the wall (walls() records it) behind the current face frame: local y of its base / top, and its plaster colour
const _inv = new THREE.Matrix4();
export function wallSpan(B) {
  const W = B._wall; if (!W) return null;
  const O = B.pt(0, 0, 0), oy = O.y, base = new THREE.Vector3(0, W.y0, 0).applyMatrix4(W.m).y;
  // where this frame sits along the face: u (offset from the face centre, +x of the frame) and the face length
  _inv.copy(W.m).invert();
  const Ow = O.clone().applyMatrix4(_inv), Xw = B.pt(1, 0, 0).applyMatrix4(_inv).sub(Ow), Zw = B.pt(0, 0, 1).applyMatrix4(_inv).sub(Ow);
  const front = Math.abs(Zw.z) > 0.5, L = front ? W.w : W.d;
  const u = (Ow.x - W.cx) * Xw.x + (Ow.z - W.cz) * Xw.z;
  return { yb: base - oy, yt: base - oy + W.h, plaster: W.plaster, frame: W.frame, planks: W.planks, y0: W.y0, h: W.h, u, L, koshiTop: W.koshiTop != null ? W.koshiTop - W.y0 + base - oy : null };
}
// plaster colour at local height y (matches walls()'s gradient, so stains fade into the wall with no seam)
function plasterAt(ws, y) { return col(shade(ws.plaster, 0.93)).lerp(col(ws.plaster), clamp((y - ws.yb) / ws.h)); }

// Soft rain stain running down from a sill (local face frame, x centre, from y0 down to y1): a V of darker
// plaster that fades into the wall colour at its edges and bottom.
export function streak(B, x, y0, y1, w = 0.3, k = 0.86) {
  const ws = wallSpan(B); if (!ws || ws.planks || y0 - y1 < 0.08) return;
  const top = col(mixc(ws.plaster, '#b8a898', 0.5)), tmp = new THREE.Color();
  const g = gridQuad(w, y0 - y1, 2, 1, (u, v, c) => {
    const y = y1 + v * (y0 - y1);
    c.copy(plasterAt(ws, y));
    if (Math.abs(u - 0.5) < 0.01 && v > 0.5) c.lerp(tmp.copy(top), 1 - k + 0.35);
  });
  g.translate(x, (y0 + y1) / 2, 0.004); B.add(g, null);
}

// A patch where the plaster has flaked off, showing the bamboo lath / mud underneath (humble homes)
export function plasterPatch(B, x, y, s = 1) {
  const ws = wallSpan(B); if (!ws || ws.planks) return;
  const g = puff(V(0, 0, 0), 0.13 * s, { detail: 0, noise: 0.35, squash: 1, seed: B.seed + Math.round(x * 50) });
  g.scale(1.25, 0.85, 0.08); g.rotateZ(B.drand(-0.4, 0.4)); g.translate(x, y, 0.006); B.add(g, '#c8a47e');
  for (let i = 0; i < 3; i++) { const l = G.box(0.2 * s * (i === 1 ? 1.1 : 0.8), 0.018, 0.012, 0); l.rotateZ(B.dwob(0.08)); l.translate(x + B.dwob(0.02), y - 0.05 * s + i * 0.05 * s, 0.018); B.add(l, '#a07c58'); }
  const rim = puff(V(0, 0, 0), 0.15 * s, { detail: 0, noise: 0.3, seed: B.seed + 3 + Math.round(y * 40) });
  rim.scale(1.25, 0.85, 0.04); rim.translate(x, y, 0.0035); B.add(rim, shade(ws.plaster, 0.9));
}

// Rolled (or half-lowered) sudare bamboo blind above an opening, local face frame; y = top of the opening
export function sudare(B, w, y, { drop = 0, color = '#dcc088', z = 0.08 } = {}) {
  const roll = G.cyl(0.042, 0.042, w + 0.08, 6); roll.rotateZ(PI / 2); roll.translate(0, y + 0.02, z); B.add(roll, color);
  for (const s of [-1, 1]) {
    const tie = G.box(0.02, 0.14, 0.012, 0); tie.translate(s * w * 0.32, y - 0.02, z + 0.045); B.add(tie, '#c83a3a');
  }
  if (drop > 0) {
    const g = gridQuad(w, drop, 1, Math.max(3, Math.round(drop / 0.035)), (u, v, c) => c.set(color).multiplyScalar(0.84 + 0.16 * ((Math.round(v * drop / 0.035) & 1) ? 1 : 0.55)));
    g.translate(0, y - drop / 2, z - 0.01); B.add(g, null);
    const hem = G.box(w + 0.02, 0.025, 0.02, 0); hem.translate(0, y - drop, z - 0.008); B.add(hem, shade(color, 0.7));
  }
}

// Koshi lattice grille (vertical slats) in front of an opening, local face frame centred on the opening
export function grille(B, w, h, { color = C.woodMid, z = 0.09, pitch = 0.075 } = {}) {
  const n = Math.max(3, Math.round(w / pitch));
  for (let i = 0; i <= n; i++) { const s = G.box(0.024, h, 0.024, 0); s.translate(-w / 2 + i * w / n, 0, z); B.add(s, color); }
  for (const yy of [-h / 2 + 0.03, h / 2 - 0.03]) { const r = G.box(w + 0.05, 0.04, 0.036, 0); r.translate(0, yy, z - 0.005); B.add(r, shade(color, 0.85)); }
}

// Amado storm-shutter box (tobukuro) beside an opening: a plank box the shutters slide into (local face frame)
export function shutterBox(B, x, h, { color = C.woodMid, w = 0.2 } = {}) {
  const box = G.box(w, h + 0.1, 0.09, 0); box.translate(x, 0, 0.045); B.add(box, color);
  for (let i = 1; i < 4; i++) { const l = G.box(w + 0.004, 0.016, 0.004, 0); l.translate(x, -h / 2 - 0.05 + i * (h + 0.1) / 4, 0.091); B.add(l, shade(color, 0.78)); }
  const cap = G.box(w + 0.05, 0.04, 0.12, 0); cap.translate(x, h / 2 + 0.07, 0.05); B.add(cap, shade(color, 0.8));
}

// Hanging charms from a point (local), top at y=0. kind: furin | teru | persimmon | garlic | bell | gourd | fishFlag
export function charm(B, kind, { color } = {}) {
  const cord = (L, c = C.ink) => { const g = G.box(0.012, L, 0.012, 0); g.translate(0, -L / 2, 0); B.add(g, c); };
  if (kind === 'furin') { // glass wind chime: dome, clapper, a paper strip that flutters in the wind
    cord(0.08);
    const dome = new THREE.SphereGeometry(0.06, 8, 4, 0, PI * 2, 0, PI * 0.58); dome.translate(0, -0.13, 0); B.add(dome, (p, n, o) => o.set(color || '#bfe6ff').lerp(col('#ffffff'), clamp(n.y * 0.4 + 0.1)));
    const dots = G.box(0.1, 0.012, 0.1, 0); dots.translate(0, -0.12, 0); B.add(dots, '#ff7a8a');
    const clap = G.box(0.01, 0.07, 0.01, 0); clap.translate(0, -0.2, 0); B.add(clap, C.ink);
    const strip = G.plane(0.06, 0.16, 1, 3); strip.translate(0, -0.3, 0);
    B.cloth(strip, color ? shade(color, 1.1) : '#fff6ea', { x0: -0.03, x1: 0.03, yTop: -0.22, yBot: -0.38 });
    const strip2 = G.plane(0.06, 0.16, 1, 3); strip2.rotateY(PI / 2); strip2.translate(0, -0.3, 0);
    B.cloth(strip2, color ? shade(color, 1.1) : '#fff6ea', { x0: -0.03, x1: 0.03, yTop: -0.22, yBot: -0.38 });
  } else if (kind === 'teru') { // teru teru bozu: little white rain charm with a happy face
    cord(0.07);
    const head = G.sph(0.065, 8, 6); head.translate(0, -0.13, 0); B.add(head, '#fffaf2');
    const sk = G.cone(0.09, 0.15, 7); sk.translate(0, -0.265, 0); B.add(sk, '#fff6ea');
    const neck = G.torus(0.045, 0.012, 3, 8); neck.rotateX(PI / 2); neck.translate(0, -0.19, 0); B.add(neck, color || '#ff7a8a');
    for (const s of [-1, 1]) { const e = G.box(0.012, 0.018, 0.012, 0); e.translate(s * 0.022, -0.125, 0.06); B.add(e, C.ink); }
    const sm = G.box(0.03, 0.008, 0.01, 0); sm.translate(0, -0.15, 0.062); B.add(sm, C.ink);
  } else if (kind === 'persimmon' || kind === 'garlic') { // a drying string of hoshigaki / garlic bulbs
    const n = kind === 'persimmon' ? 5 : 4, gap = kind === 'persimmon' ? 0.085 : 0.075;
    cord(0.06 + n * gap, '#c8a060');
    for (let i = 0; i < n; i++) {
      const y = -0.08 - i * gap;
      const g = G.ico(kind === 'persimmon' ? 0.042 : 0.036, 0); g.scale(1, kind === 'persimmon' ? 0.85 : 1.1, 1); g.rotateY(i * 1.3); g.translate(B.dwob(0.006), y, 0);
      B.add(g, kind === 'persimmon' ? B.dpick(['#f08a3a', '#e8782e', '#f49a48']) : B.dpick(['#fff4e4', '#f6e8dc']));
      if (kind === 'persimmon') { const cap = G.box(0.04, 0.012, 0.04, 0); cap.translate(0, y + 0.034, 0); B.add(cap, '#5a7a3a'); }
    }
  } else if (kind === 'teruDog') { // Chewy's own rain charm: a teru teru bozu with floppy brown ears
    cord(0.07);
    const head = G.sph(0.07, 8, 6); head.translate(0, -0.135, 0); B.add(head, '#fffaf2');
    for (const s of [-1, 1]) { const ear = G.sph(0.04, 6, 4); ear.scale(0.6, 1.3, 0.8); ear.rotateZ(s * 0.5); ear.translate(s * 0.07, -0.14, 0); B.add(ear, '#8a4a2c'); }
    const sk = G.cone(0.095, 0.15, 7); sk.translate(0, -0.275, 0); B.add(sk, '#fff6ea');
    const neck = G.torus(0.048, 0.013, 3, 8); neck.rotateX(PI / 2); neck.translate(0, -0.2, 0); B.add(neck, '#e8403a');
    for (const s of [-1, 1]) { const e = G.box(0.013, 0.02, 0.012, 0); e.translate(s * 0.024, -0.128, 0.066); B.add(e, C.ink); }
    const nose = G.box(0.024, 0.016, 0.012, 0); nose.translate(0, -0.15, 0.07); B.add(nose, C.ink);
  } else if (kind === 'fishes') { // a string of little fish drying (himono)
    cord(0.34, '#c8a060');
    for (let i = 0; i < 3; i++) {
      const y = -0.1 - i * 0.1;
      const b = G.sph(0.05, 6, 4); b.scale(0.45, 1, 0.22); b.translate(0, y, 0); B.add(b, B.dpick(['#a8b8c8', '#b8c4cc', '#98aabb']));
      const t = G.cone(0.035, 0.05, 4); t.scale(1, 1, 0.3); t.translate(0, y + 0.065, 0); B.add(t, '#8898a8');
    }
  } else if (kind === 'bell') { // shop bell with a red cord and tassel
    cord(0.06, '#c83a3a');
    const b = G.lathe([[0.001, 0], [0.03, -0.005], [0.045, -0.05], [0.055, -0.08], [0.001, -0.08]], 8); b.translate(0, -0.06, 0); B.add(b, C.gold);
    const t = G.cyl(0.006, 0.018, 0.08, 5); t.translate(0, -0.18, 0); B.add(t, '#e8403a');
  } else if (kind === 'gourd') { // hyotan gourd charm
    cord(0.05, '#c83a3a');
    const a = G.sph(0.04, 7, 5); a.translate(0, -0.09, 0); B.add(a, '#e8c060');
    const b = G.sph(0.055, 7, 5); b.translate(0, -0.165, 0); B.add(b, '#e8c060');
    const tie = G.torus(0.026, 0.01, 3, 7); tie.rotateX(PI / 2); tie.translate(0, -0.12, 0); B.add(tie, '#c83a3a');
  } else if (kind === 'fishFlag') { // tiny koinobori streamer (cloth)
    cord(0.04);
    const g = G.plane(0.22, 0.08, 3, 1); g.translate(0.11, -0.08, 0); B.cloth(g, color || '#ff7a6a', { x0: 0, x1: 0.22, yTop: -0.04, yBot: -0.12 });
  }
}

// Kusari-doi rain chain from an eave point (local) down to a pebble basin on the ground at groundY
export function rainChain(B, x, yTop, z, groundY = 0, { color = C.bronze } = {}) {
  const L = yTop - groundY - 0.12; if (L < 0.4) return;
  const hook = G.box(0.03, 0.06, 0.06, 0); hook.translate(x, yTop + 0.02, z); B.add(hook, shade(color, 0.8));
  const n = Math.max(4, Math.round(L / 0.11));
  for (let i = 0; i < n; i++) { // little cups stacked on a thin chain
    const y = yTop - 0.02 - (i + 0.5) * L / n;
    const cup = G.cyl(0.032, 0.02, 0.05, 6, true); cup.translate(x, y, z); B.add(cup, i % 2 ? color : shade(color, 1.12));
  }
  const rod = G.box(0.008, L, 0.008, 0); rod.translate(x, yTop - L / 2, z); B.add(rod, shade(color, 0.7));
  // basin: a ring of pebbles holding a little puddle
  const s = G.cyl(0.14, 0.16, 0.06, 8); s.translate(x, groundY + 0.03, z); B.add(s, '#b8adb8');
  const w = G.cyl(0.1, 0.1, 0.02, 8); w.translate(x, groundY + 0.055, z); B.add(w, '#6ab8d8');
  for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2 + B.dr(); const p = G.ico(0.035, 0); p.translate(x + Math.cos(a) * 0.17, groundY + 0.02, z + Math.sin(a) * 0.17); B.add(p, B.dpick(['#d9d0c8', '#c9bfc6', '#e4dcd2'])); }
}

// Half-round gutter (toi) along x from x0..x1 at (y, z) (local), with end caps
export function gutter(B, x0, x1, y, z, { color = C.bronze } = {}) {
  const L = x1 - x0;
  const g = G.cyl(0.045, 0.045, L, 6, true); g.rotateZ(PI / 2); g.translate((x0 + x1) / 2, y, z);
  // keep the lower half only: squash the top so it reads as an open trough
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > y) p.setY(i, y + (p.getY(i) - y) * 0.25);
  g.computeVertexNormals(); B.add(g, color);
  for (const x of [x0, x1]) { const c = G.cyl(0.046, 0.046, 0.012, 6); c.rotateZ(PI / 2); c.translate(x, y, z); B.add(c, shade(color, 0.85)); }
  for (let i = 0; i <= Math.floor(L / 0.7); i++) { const h = G.box(0.016, 0.07, 0.016, 0); h.translate(x0 + 0.1 + i * 0.7, y + 0.02, z - 0.04); B.add(h, C.iron); }
}

// Hang a charm under a roof's eave: info = roof() result (yAt, thick), at (x, z) in the roof's frame
export function eaveCharm(B, info, x, z, kind, opts) {
  const y = (info.underAt ? info.underAt(x, z) : info.yAt(x, z) - (info.thick ?? 0.14)) - 0.01;
  B.at([x, y, z], B.drand(-0.4, 0.4), () => charm(B, kind, opts));
}

// Row of wooden menu plaques (fuda) hanging from a rail, local face frame; y = rail height
export function fudaRow(B, w, y, { n, z = 0.12, wood = '#f4e2c0', ink = '#4a2c2a', rail = C.woodDark, colors } = {}) {
  n = n ?? Math.max(3, Math.round(w / 0.16));
  const r = G.box(w + 0.06, 0.03, 0.03, 0); r.translate(0, y, z); B.add(r, rail);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * w / n, hh = 0.2 + B.dwob(0.02);
    const pc = colors ? colors[i % colors.length] : wood, inkC = col(pc).getHSL({}).l < 0.45 ? '#fff6ea' : ink;
    const p = G.box(0.1, hh, 0.018, 0); p.rotateZ(B.dwob(0.05)); p.translate(x, y - 0.03 - hh / 2, z + 0.005); B.add(p, pc);
    for (let k = 0; k < 3; k++) { const l = G.box(0.02, 0.035, 0.006, 0); l.translate(x, y - 0.07 - k * 0.05, z + 0.016); B.add(l, inkC); }
  }
}

// A futon airing over a balcony rail (local: rail along x at height y, z = rail line)
export function futon(B, x, y, z, { w = 0.62, color = '#ff9ec0', pattern = '#ffffff' } = {}) {
  B.at([x, y, z], 0, () => {
    const top = G.box(w, 0.07, 0.16, 0.025); top.translate(0, 0.045, 0); B.add(top, color);
    for (const s of [-1, 1]) {
      const hang = G.box(w, s > 0 ? 0.42 : 0.3, 0.06, 0.025); hang.translate(0, -(s > 0 ? 0.21 : 0.15) + 0.03, s * 0.09); B.add(hang, color);
    }
    for (let i = 0; i < 3; i++) { const dot = G.box(0.06, 0.06, 0.008, 0); dot.rotateZ(PI / 4); dot.translate(-w / 3 + i * w / 3, -0.14, 0.123); B.add(dot, pattern); }
    const hem = G.box(w + 0.01, 0.03, 0.065, 0); hem.translate(0, -0.37, 0.09); B.add(hem, shade(color, 0.85));
  });
}

// Straw broom leaning on a wall (local: foot at origin, leaning toward -z)
export function broom(B) {
  B.at([0, 0, 0], 0, () => {
    const stick = G.cyl(0.014, 0.016, 1.0, 5); stick.rotateX(-0.2); stick.translate(0, 0.6, -0.1); B.add(stick, '#c8a068');
    const head = G.cone(0.1, 0.32, 6); head.scale(1, 1, 0.45); head.rotateX(-0.2); head.translate(0, 0.14, -0.02); B.add(head, '#e2c46a');
    const tie = G.torus(0.045, 0.012, 3, 7); tie.rotateX(PI / 2 - 0.2); tie.translate(0, 0.28, -0.05); B.add(tie, '#c83a3a');
  });
}

// Wooden name plate beside a door (local face frame, centre)
export function namePlate(B, { w = 0.1, h = 0.24, wood = '#f0dcb8' } = {}) {
  const p = G.box(w, h, 0.02, 0); p.translate(0, 0, 0.012); B.add(p, wood);
  const f = G.box(w + 0.025, h + 0.025, 0.012, 0); f.translate(0, 0, 0.004); B.add(f, C.woodDark);
  for (let k = 0; k < 3; k++) { const l = G.box(0.03, 0.04, 0.005, 0); l.translate(0, h * 0.3 - k * h * 0.28, 0.024); B.add(l, C.ink); }
}

// Tanabata bamboo with coloured wish strips (tanzaku) and a paper chain
export function tanabata(B, { h = 2.1 } = {}) {
  const pts = []; for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push({ p: V(0.12 * t * t, t * h, 0), r: 0.035 - t * 0.012 }); }
  B.add(tube(pts, 5, false), (p, n, o) => { o.set('#8fd06a'); if ((p.y % 0.4) < 0.03) o.set('#5a9a48'); });
  const cols = ['#ff8fb0', '#ffd24a', '#8fd0ff', '#c8a8ff', '#8fe0c0', '#ff9a5a'];
  for (let i = 0; i < 9; i++) {
    const t = 0.45 + i * 0.06, a = i * 2.3, rr = 0.12 + B.drand(0, 0.12);
    const x = 0.12 * t * t + Math.cos(a) * rr, z = Math.sin(a) * rr, y = t * h;
    const leaf = G.sph(0.09, 5, 3); leaf.scale(1.6, 0.3, 0.6); leaf.rotateY(a); leaf.translate(x, y + 0.05, z); B.add(leaf, '#6ab84c', 'leaf');
    const s = G.plane(0.05, 0.16, 1, 2); s.rotateY(a); s.translate(x, y - 0.1, z);
    B.cloth(s, cols[i % cols.length], { x0: -0.03, x1: 0.03, yTop: y - 0.02, yBot: y - 0.18 });
  }
}

// Ema rack: a little roofed frame hung with wooden wish plaques (pentagon tablets on red strings)
export function emaRack(B, { w = 0.8, h = 0.95 } = {}) {
  for (const s of [-1, 1]) { const p = G.box(0.06, h, 0.06, 0); p.translate(s * w / 2, h / 2, 0); B.add(p, C.woodMid); }
  for (const y of [h * 0.55, h * 0.85]) { const r = G.box(w + 0.06, 0.035, 0.035, 0); r.translate(0, y, 0); B.add(r, C.woodMid); }
  const roofT = G.box(w + 0.3, 0.04, 0.3, 0); roofT.rotateX(0.0); roofT.translate(0, h + 0.03, 0); B.add(roofT, '#5d6f9e');
  const ridgeB = G.box(w + 0.32, 0.05, 0.06, 0); ridgeB.translate(0, h + 0.07, 0); B.add(ridgeB, shade('#5d6f9e', 0.8));
  for (const y of [h * 0.55, h * 0.85]) for (let i = 0; i < 6; i++) {
    const x = -w / 2 + 0.08 + i * (w - 0.16) / 5 + B.dwob(0.015);
    B.at([x, y - 0.03, 0.03 * (i % 2 ? 1 : -1)], B.dwob(0.25), () => {
      const shp = new THREE.Shape(); shp.moveTo(-0.045, -0.07); shp.lineTo(0.045, -0.07); shp.lineTo(0.045, 0.01); shp.lineTo(0, 0.04); shp.lineTo(-0.045, 0.01); shp.closePath();
      const g = new THREE.ExtrudeGeometry(shp, { depth: 0.012, bevelEnabled: false }); g.translate(0, -0.04, -0.006); B.add(g, '#f0d8a8');
      const ink = G.box(0.05, 0.03, 0.004, 0); ink.translate(0, -0.07, 0.008); B.add(ink, B.dpick(['#e8503a', '#3a2a30', '#4a78c8']));
      const str = G.box(0.008, 0.035, 0.008, 0); str.translate(0, 0.015, 0); B.add(str, '#e8403a');
    });
  }
}

// Omikuji line: two posts with ropes crowded with white fortune papers tied in knots (local, along x)
export function omikuji(B, { w = 0.9, h = 0.9 } = {}) {
  for (const s of [-1, 1]) { const p = G.box(0.06, h, 0.06, 0); p.translate(s * w / 2, h / 2, 0); B.add(p, C.woodMid); const cap = G.box(0.09, 0.03, 0.09, 0); cap.translate(s * w / 2, h + 0.015, 0); B.add(cap, C.woodDark); }
  for (const y of [h * 0.55, h * 0.85]) {
    const r = G.box(w, 0.02, 0.02, 0); r.translate(0, y, 0); B.add(r, '#e8d8a0');
    const n = Math.round(w / 0.07);
    for (let i = 0; i < n; i++) {
      if (B.dchance(0.2)) continue;
      const k = G.box(0.035, 0.05 + B.drand(0, 0.03), 0.03, 0); k.rotateZ(B.dwob(0.4)); k.translate(-w / 2 + 0.05 + i * (w - 0.1) / (n - 1), y - 0.015, B.dwob(0.012));
      B.add(k, B.dchance(0.15) ? '#ffe8c8' : '#fffaf2');
    }
  }
}

// Glass fishing floats (ukidama) in rope nets, hung on a wall (local face frame, top of the cluster at y=0)
export function glassFloats(B, { n = 3 } = {}) {
  const cols = ['#8fd0ff', '#8fe0c0', '#c8a8ff', '#a8e8ff'];
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.17, y = -0.12 - (i % 2) * 0.08, r = 0.075 + (i % 2) * 0.01;
    const b = G.sph(r, 8, 6); b.translate(x, y, r + 0.02); B.glow(b, cols[i % cols.length], { tint: 0.6 });
    const net = G.torus(r * 1.01, 0.008, 3, 10); net.translate(x, y, r + 0.02); B.add(net, '#c8b078');
    const net2 = G.torus(r * 1.01, 0.008, 3, 10); net2.rotateY(PI / 2); net2.translate(x, y, r + 0.02); B.add(net2, '#c8b078');
    const cord = G.box(0.008, -y - r, 0.008, 0); cord.translate(x, (y + r) / 2, r + 0.02); B.add(cord, '#c8b078');
  }
  const peg = G.box(0.5, 0.03, 0.04, 0); peg.translate(0, 0, 0.02); B.add(peg, C.woodDark);
}

// Tool rack on a wall: a batten with hanging tongs / hammer / saw silhouettes (local face frame, batten at y)
export function toolRack(B, w = 0.7, y = 0, { tools = ['tongs', 'hammer', 'saw', 'hammer'] } = {}) {
  const bat = G.box(w, 0.05, 0.04, 0); bat.translate(0, y, 0.02); B.add(bat, C.woodDark);
  tools.forEach((t, i) => {
    const x = -w / 2 + (i + 0.5) * w / tools.length;
    const peg = G.box(0.02, 0.02, 0.06, 0); peg.translate(x, y, 0.05); B.add(peg, C.iron);
    if (t === 'hammer') { const hd = G.box(0.03, 0.26, 0.02, 0); hd.translate(x, y - 0.14, 0.05); B.add(hd, C.woodLight); const hh = G.box(0.1, 0.045, 0.04, 0); hh.translate(x, y - 0.27, 0.05); B.add(hh, C.iron); }
    else if (t === 'tongs') { for (const s of [-1, 1]) { const a = G.box(0.015, 0.34, 0.015, 0); a.rotateZ(s * 0.08); a.translate(x + s * 0.012, y - 0.17, 0.05); B.add(a, C.iron); } }
    else if (t === 'saw') { const bl = G.box(0.1, 0.26, 0.008, 0); bl.translate(x, y - 0.19, 0.05); B.add(bl, '#c8c8d0'); const hd = G.box(0.04, 0.1, 0.03, 0); hd.translate(x, y - 0.03, 0.05); B.add(hd, C.woodLight); }
    else if (t === 'hat') { const hat = G.cone(0.16, 0.08, 8); hat.rotateX(PI / 2); hat.translate(x, y - 0.1, 0.06); B.add(hat, '#e2c46a'); }
    else if (t === 'basket') { const bk = G.cyl(0.1, 0.07, 0.1, 7, true); bk.rotateX(PI / 2 - 0.3); bk.translate(x, y - 0.12, 0.08); B.add(bk, '#c8a060'); }
  });
}

// Double-sided hanging sign on little chains from an iron bracket (local face frame, bracket at the origin,
// board perpendicular to the wall so it reads from along the street)
export function hangSign(B, sym, { w = 0.34, h = 0.3, color = '#fff6e8', frame = C.woodDark, symSize } = {}) {
  const arm = G.box(0.035, 0.035, 0.5, 0); arm.translate(0, 0, 0.25); B.add(arm, C.iron);
  const brace = G.box(0.025, 0.025, 0.34, 0); brace.rotateX(0.75); brace.translate(0, -0.11, 0.12); B.add(brace, C.iron);
  const curl = G.torus(0.035, 0.01, 3, 8); curl.rotateY(PI / 2); curl.translate(0, 0.03, 0.47); B.add(curl, C.iron);
  const bz = 0.3;
  for (const s of [-1, 1]) { const ch = G.box(0.01, 0.1, 0.01, 0); ch.translate(0, -0.06, bz + s * w * 0.32); B.add(ch, C.iron); }
  B.at([0, -0.11 - h / 2, bz], PI / 2, () => {
    const bd = G.box(w, h, 0.05, 0.02); B.add(bd, color);
    const fr = G.box(w + 0.05, h + 0.05, 0.035, 0.015); B.add(fr, frame);
    for (const side of [0, PI]) B.at([0, 0, 0], side, () => B.at([0, 0, 0.026], 0, () => symbol(B, sym, symSize ?? Math.min(w, h) * 0.8, { depth: 0.02 })));
  });
}

// Folding shop bench (battari shogi) against a wall, local face frame: bench top at y
export function battari(B, w = 0.8, y = 0.42) {
  const top = G.box(w, 0.05, 0.3, 0); top.translate(0, y, 0.17); B.add(top, C.woodLight);
  for (let i = 1; i < 4; i++) { const l = G.box(0.015, 0.052, 0.3, 0); l.translate(-w / 2 + i * w / 4, y + 0.002, 0.17); B.add(l, shade(C.woodLight, 0.82)); }
  for (const s of [-1, 1]) { const leg = G.box(0.05, y, 0.05, 0); leg.translate(s * (w / 2 - 0.06), y / 2, 0.28); B.add(leg, C.woodMid); }
  const hinge = G.box(w, 0.04, 0.04, 0); hinge.translate(0, y, 0.02); B.add(hinge, C.woodMid);
}

// Towel rack with a couple of cloth towels (local, centred, facing +z)
export function towelRack(B, { colors = ['#ffffff', '#8fd0ff'] } = {}) {
  for (const s of [-1, 1]) { const p = G.box(0.05, 0.75, 0.05, 0); p.translate(s * 0.32, 0.375, 0); B.add(p, C.woodMid); }
  const bar = G.box(0.72, 0.035, 0.035, 0); bar.translate(0, 0.74, 0); B.add(bar, C.woodMid);
  colors.forEach((c, i) => {
    const x = -0.16 + i * 0.3;
    const g = G.plane(0.2, 0.36, 2, 3); g.translate(x, 0.56, 0.022); B.cloth(g, c, { x0: x - 0.1, x1: x + 0.1, yTop: 0.74, yBot: 0.38 });
    const band = G.box(0.2, 0.03, 0.055, 0); band.translate(x, 0.48, 0); B.add(band, shade(c, 0.85));
  });
}

// Morning-glory "green curtain" (asagao): a planter trough with vines climbing strings up to a bar, dotted with
// trumpet flowers (local face frame, planter at the wall foot; top bar at height top)
export function asagao(B, w = 0.6, top = 1.2, { flowers = ['#8a6ad8', '#6a8ae8', '#e86ab0', '#ffffff'] } = {}) {
  const box = G.box(w + 0.06, 0.16, 0.18, 0); box.translate(0, 0.08, 0.14); B.add(box, C.woodMid);
  const soil = G.box(w, 0.02, 0.13, 0); soil.translate(0, 0.165, 0.14); B.add(soil, C.soil);
  const bar = G.box(w + 0.1, 0.025, 0.025, 0); bar.translate(0, top, 0.1); B.add(bar, '#c8a868');
  const n = Math.max(3, Math.round(w / 0.14));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * w / n, hh = top - 0.17 - B.drand(0, 0.25);
    const str = G.box(0.008, top - 0.17, 0.008, 0); str.translate(x, 0.17 + (top - 0.17) / 2, 0.12); B.add(str, '#e8d8a8');
    for (let k = 0; k < 4; k++) {
      const y = 0.25 + k * hh / 4 + B.drand(0, 0.08);
      if (y > 0.17 + hh) break;
      const lf = G.sph(0.055, 5, 3); lf.scale(1, 0.9, 0.45); lf.translate(x + B.dwob(0.04), y, 0.13); B.add(lf, B.dpick(['#5aa84a', '#4f9a44', '#6ab854']), 'leaf');
      if (B.dchance(0.45)) { const f = G.cone(0.04, 0.04, 6); f.rotateX(-PI / 2); f.translate(x + B.dwob(0.05), y + 0.03, 0.17); B.add(f, B.dpick(flowers), 'leaf'); }
    }
  }
}

// A few weeds and clover tufts along a wall foot (local face frame, along x over width w), for humble homes
export function weeds(B, w, n = 4) {
  for (let i = 0; i < n; i++) {
    const x = B.drand(-w / 2, w / 2), z = B.drand(0.06, 0.16);
    for (let k = 0; k < 3; k++) {
      const bl = G.cone(0.025, B.drand(0.1, 0.17), 3); bl.rotateZ(B.dwob(0.45)); bl.rotateX(B.dwob(0.3)); bl.translate(x + B.dwob(0.03), 0.05, z + B.dwob(0.02));
      B.add(bl, B.dpick(['#6ab04c', '#5a9a44', '#7cc05a']), 'leaf');
    }
    if (B.dchance(0.4)) { const f = G.ico(0.022, 0); f.translate(x, 0.11, z); B.add(f, B.dpick(['#ffffff', '#ffe066', '#ffb0c8']), 'leaf'); }
  }
}

// Kadomatsu: three slant-cut bamboo stalks and pine sprigs in a straw-bound base (local, ground at 0)
export function kadomatsu(B, s = 1) {
  B.push([0, 0, 0], 0, s);
  const base = G.cyl(0.17, 0.19, 0.3, 9); base.translate(0, 0.15, 0); B.add(base, (p, n, o) => o.set('#d8b870').multiplyScalar(0.88 + 0.12 * Math.sin(p.y * 70)));
  for (const y of [0.07, 0.24]) { const band = G.torus(0.182, 0.018, 3, 10); band.rotateX(PI / 2); band.translate(0, y, 0); B.add(band, '#8a5a3a'); }
  for (const [x, z, hh] of [[0, -0.04, 0.95], [-0.07, 0.05, 0.75], [0.07, 0.05, 0.62]]) {
    const st = G.cyl(0.045, 0.045, hh, 7); // slant cut: tilt the top ring's vertices
    const p = st.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, p.getY(i) + p.getZ(i) * 0.9);
    st.computeVertexNormals(); st.translate(x, hh / 2 + 0.1, z);
    B.add(st, (q, n, o) => o.set(n.y > 0.5 ? '#f0f0c8' : '#7cc05a').multiplyScalar(Math.abs((q.y % 0.3) - 0.15) < 0.012 ? 0.8 : 1));
  }
  for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; const g = G.cone(0.08, 0.16, 5); g.rotateZ(PI / 2 + 0.6); g.rotateY(a); g.translate(Math.cos(a) * 0.13, 0.34, Math.sin(a) * 0.13); B.add(g, '#3f7f4a', 'leaf'); }
  const rope = G.torus(0.19, 0.022, 3, 10); rope.rotateX(PI / 2); rope.translate(0, 0.31, 0); B.add(rope, '#e8d8a0');
  B.pop();
}

// stepping stone (kutsunugi-ishi) in front of a door, local (top at ~y)
export function stoopStone(B, x, y, z, w = 0.5) {
  const g = puff(V(0, 0, 0), 0.3, { detail: 1, noise: 0.18, squash: 0.32, seed: B.seed + 17 });
  g.scale(w / 0.6, 1, 0.8); g.translate(x, y - 0.06, z); B.add(g, '#d6ccc8');
}

export { tube };
