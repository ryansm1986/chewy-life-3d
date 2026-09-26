// Reusable props: chochin & stone lanterns, barrels, crates, planters, bushes, little trees, bamboo,
// signboards, mailbox, benches, bells, torii, rocks, log piles... Local frame, ground at y=0.
import * as THREE from 'three';
import { puff, branch, tube } from '../../gfx/geom.js';
import { G, V, C, PI, shade, mixc, col } from './kit.js';
import { roof, roundRoof } from './roofs.js';
import { symbol } from './symbols.js';
import { STONES, FLOWERS, flowerBox } from './parts.js';
import { clamp, TAU } from '../../core/util.js';

// Paper chochin lantern hanging with its top at local y=0 (so place it at the hook). Returns paper centre y.
export function chochin(B, { r = 0.17, h = 0.36, color = C.red, band = true, cord = 0 } = {}) {
  if (cord > 0) { const c = G.cyl(0.012, 0.012, cord, 4); c.translate(0, -cord / 2, 0); B.add(c, C.ink); }
  const y0 = -cord;
  const cap = G.cyl(r * 0.5, r * 0.56, 0.05, 10); cap.translate(0, y0 - 0.025, 0); B.add(cap, '#2a2226');
  const pts = [];
  const N = 10;
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    const rr = r * (0.45 + 0.55 * Math.sin(t * PI)) * (1 + (k % 2 ? 0.035 : 0));
    pts.push([Math.max(0.001, rr), -t * h]);
  }
  const paper = G.lathe(pts, 12); paper.translate(0, y0 - 0.05, 0);
  const cc = col(color), dark = cc.clone().multiplyScalar(0.72), light = cc.clone().lerp(col('#fff0d0'), 0.25);
  const g = paper.index ? paper.toNonIndexed() : paper;
  const pp = g.attributes.position, cols = new Float32Array(pp.count * 3);
  for (let i = 0; i < pp.count; i++) {
    const t = (y0 - 0.05 - pp.getY(i)) / h;
    const c = (band && t > 0.42 && t < 0.58) ? light : dark.clone().lerp(cc, Math.sin(t * PI));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  B.glow(g, null, { flicker: 1, tint: 0.55 });
  const bot = G.cyl(r * 0.56, r * 0.5, 0.05, 10); bot.translate(0, y0 - 0.05 - h - 0.02, 0); B.add(bot, '#2a2226');
  const tas = G.cyl(0.015, 0.03, 0.12, 5); tas.translate(0, y0 - 0.05 - h - 0.1, 0); B.add(tas, C.gold);
  return y0 - 0.05 - h / 2;
}

// Stone lantern (toro) — ground at 0; returns light height
export function toro(B, { s = 1, moss = true } = {}) {
  let y = 0;
  B.push([0, 0, 0], B.wob(0.1), s);
  const stone = () => B.pick(STONES);
  const mossy = base => (p, n, o) => { o.set(base); if (moss && n.y > 0.55) o.lerp(col(C.moss), 0.55); };
  const g1 = G.cyl(0.26, 0.3, 0.14, 6); g1.translate(0, 0.07, 0); B.add(g1, mossy(stone()));
  const g2 = G.cyl(0.1, 0.13, 0.62, 8); g2.translate(0, 0.14 + 0.31, 0); B.add(g2, stone());
  const g3 = G.cyl(0.26, 0.2, 0.11, 6); g3.translate(0, 0.8, 0); B.add(g3, mossy(stone()));
  // fire box
  const fb = G.box(0.28, 0.26, 0.28, 0.03); fb.translate(0, 0.98, 0);
  const inner = G.box(0.2, 0.2, 0.3, 0); inner.translate(0, 0.98, 0); B.glow(inner, '#fff0c0', { flicker: 0.6 });
  const inner2 = G.box(0.3, 0.2, 0.2, 0); inner2.translate(0, 0.98, 0); B.glow(inner2, '#fff0c0', { flicker: 0.6 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = G.box(0.07, 0.26, 0.07, 0.015); p.translate(sx * 0.12, 0.98, sz * 0.12); B.add(p, stone()); }
  roof(B, { type: 'hip', w: 0.26, d: 0.26, y0: 1.1, over: 0.14, H: 0.22, curve: 0.5, lift: 0.1, liftW: 0.12, thick: 0.07, ribW: 0, course: 0, color: STONES[2], edge: STONES[0], under: STONES[4], cap: STONES[1], finial: 'stone', moss: moss ? 0.7 : 0 });
  B.pop();
  y = 0.98 * s;
  return y;
}

export function barrel(B, { r = 0.2, h = 0.42, wood = C.woodLight, lid = true } = {}) {
  const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push([r * (0.86 + 0.14 * Math.sin(t * PI)), t * h]); }
  const g = G.lathe(pts, 10); B.add(g, (p, n, o) => o.set(wood).multiplyScalar(0.9 + 0.1 * Math.sin(Math.atan2(p.z, p.x) * 10)));
  for (const y of [0.18, 0.82]) { const band = G.torus(r * (0.87 + 0.13 * Math.sin(y * PI)) + 0.005, 0.018, 4, 12); band.rotateX(PI / 2); band.translate(0, y * h, 0); B.add(band, C.iron); }
  if (lid) { const l = G.cyl(r * 0.86, r * 0.86, 0.03, 10); l.translate(0, h, 0); B.add(l, shade(wood, 0.85)); }
}

export function crate(B, { s = 0.36, wood = C.woodPale } = {}) {
  const g = G.box(s, s * 0.85, s, 0.02); g.translate(0, s * 0.425, 0); B.add(g, wood);
  for (const sz of [-1, 1]) for (const y of [0.2, 0.65]) { const b = G.box(s + 0.01, 0.05, 0.02, 0.005); b.translate(0, s * 0.85 * y, sz * s / 2); B.add(b, shade(wood, 0.8)); }
  for (const sx of [-1, 1]) { const b = G.box(0.02, 0.05, s + 0.01, 0.005); b.translate(sx * s / 2, s * 0.6, 0); B.add(b, shade(wood, 0.8)); }
}

// produce crate (fruit / veg / fish on top)
export function produce(B, { kind = 'apple', s = 0.36 } = {}) {
  crate(B, { s });
  const pal = { apple: ['#e8403a', '#ff6a50', '#f4c04a'], veg: ['#ff8a3a', '#6ab04c', '#fff0d0'], fish: ['#8ab8e0', '#c0d8f0'], bread: ['#d89050', '#e8b070'], flower: FLOWERS }[kind] || ['#e8403a'];
  for (let i = 0; i < 7; i++) {
    const r = kind === 'fish' ? 0.05 : 0.06;
    const g = kind === 'fish' ? G.sph(r, 8, 5) : G.ico(r, 1);
    if (kind === 'fish') g.scale(2.2, 0.6, 0.9);
    g.translate(B.rand(-s * 0.3, s * 0.3), s * 0.85 + r * 0.6 + B.rand(0, 0.04), B.rand(-s * 0.3, s * 0.3));
    B.add(g, B.pick(pal));
  }
}

// small round bush (leaf bucket, sways) with optional flowers
export function bush(B, { r = 0.35, color = '#5a9a48', flowers = null, n = 3, sway = true } = {}) {
  const crown = V(0, r * 0.9, 0);
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + B.rand(0, 1), d = n > 1 ? r * 0.35 : 0;
    const g = puff(V(Math.cos(a) * d, r * (0.7 + B.rand(0, 0.25)), Math.sin(a) * d), r * B.rand(0.7, 0.9), { detail: 1, noise: 0.22, crown, crownMix: 0.5, seed: B.seed + i * 3 });
    const base = col(color), hi = col(mixc(color, '#d8f08a', 0.45));
    B.add(g, (p, nn, o) => o.copy(base).lerp(hi, clamp(nn.y * 0.6 + 0.1) * 0.8), sway ? 'leaf' : 'body');
  }
  if (flowers) for (let i = 0; i < 7; i++) {
    const a = B.rand(0, TAU), u = B.rand(0.2, 0.9);
    const f = G.sph(0.05 * (r / 0.35), 6, 4); f.scale(1, 0.75, 1);
    f.translate(Math.cos(a) * r * 0.8 * Math.sqrt(1 - u * u), r * (0.8 + u * 0.7), Math.sin(a) * r * 0.8 * Math.sqrt(1 - u * u));
    B.add(f, B.pick(flowers), sway ? 'leaf' : 'body');
  }
}

export function pot(B, { r = 0.17, h = 0.24, color = C.terracotta, plant = 'bush', flowers } = {}) {
  const g = G.lathe([[0.001, 0], [r * 0.7, 0], [r * 0.85, h * 0.2], [r, h * 0.9], [r * 1.08, h], [r * 0.92, h * 1.02], [0.001, h * 0.92]], 10);
  B.add(g, col(color));
  const soil = G.cyl(r * 0.9, r * 0.9, 0.02, 10); soil.translate(0, h * 0.95, 0); B.add(soil, C.soil);
  B.push([0, h * 0.8, 0]);
  if (plant === 'bush') bush(B, { r: r * 1.35, flowers, n: 2 });
  else if (plant === 'pine') bonsai(B, r * 3);
  else if (plant === 'bamboo') bamboo(B, { n: 3, h: 1.2, spread: r * 0.5 });
  else if (plant === 'flowers') bush(B, { r: r * 1.1, flowers: flowers || [B.pick(FLOWERS), B.pick(FLOWERS)], n: 2, color: '#6aae50' });
  B.pop();
}

export function bonsai(B, s = 0.6) {
  const t = branch(V(0, 0, 0), V(s * 0.25, s * 0.55, 0), 0.05 * s / 0.6, 0.03, V(-0.08, 0, 0.05), 4, 5); B.add(t, '#6e4a3a');
  for (const [x, y, z, r] of [[s * 0.28, s * 0.62, 0, 0.22], [-s * 0.05, s * 0.45, 0.1, 0.16], [s * 0.4, s * 0.4, -0.08, 0.14]]) {
    const g = puff(V(x, y, z), r * s, { detail: 1, noise: 0.2, squash: 0.45, seed: B.seed + x * 10 });
    B.add(g, (p, n, o) => o.set('#3f8f5e').lerp(col('#7cc070'), clamp(n.y)), 'leaf');
  }
}

// Little tree. kind: sakura | round | maple | pine
export function tree(B, { kind = 'sakura', s = 1 } = {}) {
  const pal = {
    sakura: ['#ffc4dc', '#f79cc0', '#e27aa8', '#fff2f8'], round: ['#7cc05a', '#5aa84c', '#4a8a44', '#c4e07a'],
    maple: ['#ff9a5a', '#f0604a', '#d8483a', '#ffd488'], pine: ['#4f9a60', '#3a8052', '#2f6a48', '#7cc07a'],
  }[kind];
  B.push([0, 0, 0], B.rand(0, TAU), s);
  const H = kind === 'pine' ? 1.1 : 1.25;
  const top = V(B.wob(0.15), H, B.wob(0.15));
  B.add(branch(V(0, -0.05, 0), top, 0.13, 0.08, V(B.wob(0.15), 0, B.wob(0.15)), 5, 7), '#6e4a4e');
  const puffs = [];
  const nb = kind === 'pine' ? 3 : 4;
  for (let i = 0; i < nb; i++) {
    const a = i / nb * TAU + B.rand(0, 0.8), d = kind === 'pine' ? 0.55 : 0.6;
    const end = V(top.x + Math.cos(a) * d, H + (kind === 'pine' ? 0.1 + i * 0.25 : 0.35 + B.rand(0, 0.35)), top.z + Math.sin(a) * d);
    B.add(branch(top, end, 0.06, 0.03, V(0, 0.15, 0), 3, 5), '#6e4a4e');
    puffs.push({ c: end.clone().add(V(0, 0.12, 0)), r: kind === 'pine' ? 0.42 : 0.48 + B.rand(0, 0.15), sq: kind === 'pine' ? 0.5 : 0.85 });
  }
  puffs.push({ c: V(top.x, H + (kind === 'pine' ? 1.0 : 0.75), top.z), r: kind === 'pine' ? 0.45 : 0.62, sq: kind === 'pine' ? 0.5 : 0.85 });
  const crown = puffs.reduce((a, q) => a.add(q.c), V()).multiplyScalar(1 / puffs.length);
  const cA = col(pal[0]), cB = col(pal[1]), cC = col(pal[2]), cH = col(pal[3]);
  const small = [];
  for (const q of puffs) {
    small.push({ c: q.c.clone(), r: q.r * 0.74, sq: q.sq });
    for (let k = 0; k < 5; k++) {
      const u = B.rand(-0.3, 1), th = B.rand(0, TAU), sr = Math.sqrt(Math.max(0, 1 - u * u));
      const dir = V(sr * Math.cos(th), u * q.sq, sr * Math.sin(th)).normalize();
      small.push({ c: q.c.clone().addScaledVector(dir, q.r * B.rand(0.5, 0.7)), r: q.r * B.rand(0.4, 0.55), sq: q.sq });
    }
  }
  small.forEach((q, i) => {
    const g = puff(q.c, q.r, { detail: i % 6 === 0 ? 2 : 1, noise: 0.14, squash: q.sq, crown, crownMix: 0.42, seed: B.seed * 3 + i });
    const t = clamp((q.c.y - crown.y + 0.6) / 1.2);
    const base = cC.clone().lerp(cB, clamp(t * 1.4)).lerp(cA, clamp(t * 1.6 - 0.4));
    base.offsetHSL(B.wob(0.012), B.wob(0.04), B.wob(0.03));
    B.add(g, (p, n, o) => { o.copy(base).lerp(cH, clamp((n.y - 0.3) * 0.8) * 0.5); if (n.y < -0.3) o.multiplyScalar(0.88); }, 'leaf');
  });
  B.pop();
  return H * s + 1.3 * s;
}

export function bamboo(B, { n = 5, h = 2.4, spread = 0.4 } = {}) {
  for (let i = 0; i < n; i++) {
    const x = B.wob(spread), z = B.wob(spread), hh = h * B.rand(0.75, 1.1), lx = B.wob(0.2), lz = B.wob(0.2);
    const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push({ p: V(x + lx * t * t, t * hh, z + lz * t * t), r: 0.045 - t * 0.015 }); }
    B.add(tube(pts, 6, false), (p, nn, o) => { o.set('#8fd06a').lerp(col('#c8e890'), clamp(nn.x * 0.3 + 0.3)); if ((p.y % 0.45) < 0.035) o.set('#5a9a48'); }, 'leaf');
    for (let k = 0; k < 5; k++) {
      const t = 0.5 + k * 0.12, a = B.rand(0, TAU);
      const cx = x + lx * t * t, cz = z + lz * t * t;
      const g = G.sph(0.1, 6, 4); g.scale(2.2, 0.35, 0.8); g.rotateZ(-0.35); g.rotateY(a); g.translate(cx + Math.cos(a) * 0.16, t * hh, cz - Math.sin(a) * 0.16);
      B.add(g, (p, nn, o) => o.set('#6ab84c').lerp(col('#b8e888'), clamp(nn.y)), 'leaf');
    }
  }
}

export function rock(B, { r = 0.35, sq = 0.6, moss = 0.5 } = {}) {
  const g = puff(V(0, r * 0.25, 0), r, { detail: 1, noise: 0.32, squash: sq, seed: B.seed + Math.round(r * 100) });
  B.add(g, (p, n, o) => { o.set('#b0a8bc').lerp(col('#d8d0d8'), clamp(n.y * 0.5 + 0.3)); if (n.y > 0.7) o.lerp(col(C.moss), moss); });
}

// Signboard. style: 'hang' (bracket from a wall, local z out), 'stand' (two posts), 'plank' (flat on wall), 'roof' (ridge top)
export function signboard(B, { sym = 'star', w = 0.7, h = 0.45, style = 'plank', color = C.woodPale, frame = C.woodDark, symSize, symColors } = {}) {
  const board = (bw, bh) => {
    const g = G.box(bw, bh, 0.07, 0.035); B.add(g, color);
    const f = G.box(bw + 0.06, bh + 0.06, 0.05, 0.03); f.translate(0, 0, -0.02); B.add(f, frame);
    B.at([0, 0, 0.035], 0, () => symbol(B, sym, symSize ?? Math.min(bw, bh) * 0.82, { colors: symColors }));
  };
  if (style === 'hang') {
    const arm = G.box(0.06, 0.06, 0.62, 0.015); arm.translate(0, 0, 0.31); B.add(arm, frame);
    const br = G.box(0.05, 0.3, 0.05, 0.01); br.rotateX(0.8); br.translate(0, -0.12, 0.1); B.add(br, frame);
    for (const s of [-1, 1]) { const ch = G.cyl(0.01, 0.01, 0.16, 4); ch.translate(0, -0.08, 0.34 + s * w * 0.3); B.add(ch, C.iron); }
    B.at([0, -0.16 - h / 2, 0.34], PI / 2, () => board(w, h));
  } else if (style === 'stand') {
    for (const s of [-1, 1]) { const p = G.box(0.08, 1.0, 0.08, 0.02); p.translate(s * (w / 2 + 0.02), 0.5, 0); B.add(p, frame); }
    B.at([0, 0.72, 0.02], 0, () => board(w, h));
  } else if (style === 'aframe') {
    for (const s of [-1, 1]) B.at([0, 0, s * 0.12], 0, () => { B.push([0, 0.34, 0], s > 0 ? 0 : PI, 1, -0.28); board(w, h); B.pop(); });
  } else board(w, h);
}

// Red post-box
export function mailbox(B, color = '#e8403a') {
  const post = G.cyl(0.04, 0.05, 0.62, 6); post.translate(0, 0.31, 0); B.add(post, C.woodDark);
  const body = G.box(0.3, 0.26, 0.4, 0.06); body.translate(0, 0.72, 0); B.add(body, color);
  const top = G.cyl(0.15, 0.15, 0.4, 10, false); top.rotateX(PI / 2); top.scale(1, 0.6, 1); top.translate(0, 0.84, 0); B.add(top, color);
  const slot = G.box(0.16, 0.03, 0.02, 0); slot.translate(0, 0.76, 0.205); B.add(slot, C.ink);
  const flag = G.box(0.03, 0.18, 0.08, 0.01); flag.translate(0.17, 0.86, 0.06); B.add(flag, C.gold);
  const heart = G.sph(0.035, 6, 4); heart.translate(0, 0.66, 0.205); B.add(heart, '#ffffff');
}

export function bench(B, { w = 1.2, wood = C.woodLight, legs = C.woodDark } = {}) {
  for (let i = 0; i < 3; i++) { const s = G.box(w, 0.05, 0.13, 0.02); s.translate(0, 0.42, -0.14 + i * 0.14); B.add(s, B.pick([wood, shade(wood, 0.93)])); }
  for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) {
    for (const z of [-0.15, 0.15]) { const l = G.box(0.07, 0.42, 0.07, 0.015); l.translate(x, 0.21, z); B.add(l, legs); }
    const bk = G.box(0.07, 0.42, 0.07, 0.015); bk.rotateX(-0.2); bk.translate(x, 0.62, -0.22); B.add(bk, legs);
  }
  for (let i = 0; i < 2; i++) { const b = G.box(w, 0.08, 0.04, 0.015); b.rotateX(-0.2); b.translate(0, 0.62 + i * 0.16, -0.23 - i * 0.03); B.add(b, wood); }
}

export function bell(B, { r = 0.18, color = C.bronze } = {}) {
  const g = G.lathe([[0.001, 0.02], [r * 0.5, 0.02], [r * 0.62, -0.1], [r * 0.72, -0.3 * r / 0.18], [r * 1.0, -0.42 * r / 0.18], [r * 0.9, -0.44 * r / 0.18], [0.001, -0.4 * r / 0.18]], 12);
  B.add(g, (p, n, o) => o.set(color).lerp(col('#ffe0a0'), clamp(n.y * 0.3 + 0.1)));
  const lug = G.torus(0.04, 0.015, 4, 8); lug.translate(0, 0.05, 0); B.add(lug, shade(color, 0.7));
  const band = G.torus(r * 0.75, 0.015, 4, 12); band.rotateX(PI / 2); band.translate(0, -0.3 * r / 0.18, 0); B.add(band, shade(color, 0.75));
}

// Torii gate spanning x (width w between pillar centres), height h
export function torii(B, { w = 2, h = 2.2, color = C.vermilion, s = 1, bases = true } = {}) {
  B.push([0, 0, 0], 0, s);
  const pr = 0.09 * Math.max(1, w / 2);
  for (const sx of [-1, 1]) {
    const p = G.cyl(pr * 0.9, pr * 1.05, h, 10); p.rotateZ(sx * 0.03); p.translate(sx * w / 2, h / 2, 0); B.add(p, color);
    if (bases) { const b = G.cyl(pr * 1.3, pr * 1.45, 0.22, 10); b.translate(sx * w / 2, 0.11, 0); B.add(b, '#3a2e34'); }
  }
  const nuki = G.box(w + pr * 4.5, 0.13 * Math.max(1, w / 2) * 0.8, 0.12, 0.02); nuki.translate(0, h * 0.78, 0); B.add(nuki, color);
  // kasagi: curved top lintel with upturned ends
  const L = w + pr * 8, pts = [];
  for (let k = 0; k <= 12; k++) { const t = k / 12 * 2 - 1; pts.push({ p: V(t * L / 2, h + 0.1 + Math.pow(Math.abs(t), 2.6) * 0.22, 0), r: 0.11 * Math.max(1, w / 2) * 0.85 }); }
  const kg = tube(pts, 6, false); kg.scale(1, 0.8, 1.05); B.add(kg, '#2a2228');
  const pts2 = pts.map(q => ({ p: q.p.clone().add(V(0, -0.14, 0)), r: q.r * 0.95 }));
  B.add(tube(pts2, 6, false), color);
  const gaku = G.box(0.26, 0.34, 0.06, 0.03); gaku.translate(0, h * 0.78 + (h + 0.05 - h * 0.78) / 2, 0.05); B.add(gaku, '#2a2228');
  const plate = G.box(0.19, 0.26, 0.04, 0.02); plate.translate(0, h * 0.78 + (h + 0.05 - h * 0.78) / 2, 0.08); B.add(plate, C.gold);
  const post = G.box(0.08, h + 0.05 - h * 0.78, 0.08, 0.01); post.translate(0, h * 0.78 + (h + 0.05 - h * 0.78) / 2, 0); B.add(post, color);
  B.pop();
}

// stacked log pile along x
export function logPile(B, { n = 3, L = 1.0, r = 0.12 } = {}) {
  let rows = n, y = r;
  while (rows > 0) {
    for (let i = 0; i < rows; i++) {
      const x0 = (i - (rows - 1) / 2) * r * 2.05;
      const g = G.cyl(r * B.rand(0.9, 1.05), r, L * B.rand(0.9, 1.05), 8); g.rotateX(PI / 2); g.translate(B.wob(0.02), y, x0);
      B.add(g, (p, nn, o) => { if (Math.abs(nn.z) > 0.9) o.set('#e8c08a').lerp(col('#c89868'), clamp(Math.hypot(p.x, p.y - y) / r)); else o.set('#8a5e44'); });
    }
    y += r * 1.75; rows--;
  }
}

export function woodStack(B, { w = 0.8, h = 0.5, d = 0.4 } = {}) {
  for (let y = 0.06; y < h; y += 0.1) {
    for (let x = -w / 2 + 0.05; x < w / 2; x += 0.1) {
      const g = G.cyl(0.045, 0.045, d * B.rand(0.9, 1.05), 5); g.rotateX(PI / 2); g.rotateZ(B.rand(0, 1)); g.translate(x + B.wob(0.01), y, B.wob(0.03));
      B.add(g, (p, nn, o) => { if (Math.abs(nn.z) > 0.9) o.set('#f0cc98'); else o.set(B.pick(['#8a5e44', '#9a6a4a', '#7a5040'])); });
    }
  }
}

// garden stone lantern-like mini shrine / offering box
export function offeringBox(B, w = 0.6) {
  const g = G.box(w, 0.36, w * 0.6, 0.03); g.translate(0, 0.18, 0); B.add(g, C.woodMid);
  for (let i = 0; i < 5; i++) { const s = G.box(w * 0.9, 0.025, 0.035, 0); s.translate(0, 0.365, -w * 0.25 + i * w * 0.12); B.add(s, C.woodDark); }
  const lab = G.box(w * 0.6, 0.12, 0.02, 0.01); lab.translate(0, 0.2, w * 0.3 + 0.005); B.add(lab, C.gold);
}

export function lanternPost(B, { h = 1.6, color = C.red, arm = true } = {}) {
  const p = G.cyl(0.05, 0.06, h, 8); p.translate(0, h / 2, 0); B.add(p, C.woodDark);
  const b = G.cyl(0.14, 0.16, 0.12, 8); b.translate(0, 0.06, 0); B.add(b, STONES[1]);
  if (arm) {
    const a = G.box(0.05, 0.05, 0.4, 0.01); a.translate(0, h - 0.05, 0.18); B.add(a, C.woodDark);
    B.at([0, h - 0.08, 0.34], 0, () => chochin(B, { color, cord: 0.05 }));
  }
}

// flower bed patch (ground level)
export function flowerPatch(B, { w = 0.8, d = 0.8, n = 14, colors = FLOWERS } = {}) {
  const soil = G.sph(0.5, 10, 4); soil.scale(w / 0.95, 0.12, d / 0.95);
  B.add(soil, '#8a6048');
  for (let i = 0; i < n; i++) {
    const x = B.rand(-w * 0.42, w * 0.42), z = B.rand(-d * 0.42, d * 0.42);
    const lf = G.sph(0.09, 6, 4); lf.scale(1, 0.7, 1); lf.translate(x, 0.07, z);
    B.add(lf, B.pick(['#5a9a48', '#6aae50', '#4f8f44']), 'leaf');
    const stem = G.cyl(0.01, 0.012, 0.18, 3, true); stem.translate(x, 0.12, z); B.add(stem, '#4a8a3a', 'leaf');
    const f = G.sph(0.055, 6, 4); f.scale(1, 0.7, 1); f.translate(x + B.wob(0.02), 0.22 + B.rand(0, 0.06), z); B.add(f, B.pick(colors), 'leaf');
  }
}

export { flowerBox, roundRoof };
