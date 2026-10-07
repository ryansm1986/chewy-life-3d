// Cute hand-drawn canvas icons (64×64 logical, rendered at ICON_RES× for crisp HiDPI — set the <img> CSS size to 64px or less).
// Everything is drawn with 2D canvas paths: soft volume gradients (light from top-left), warm ink outlines (#4a2c2a),
// glossy highlights and a cream "sticker" rim. Rarity tints a soft background glow. Results are cached as data URLs.
// API: itemIcon(item), skillIcon(id), potionIcon(key), materialIcon(key), gemIcon(type, tier), clearIconCache(), setIconResolution(n)
// No DOM access happens at import time (safe to import from node for tests).
import { mixHex } from '../core/util.js';
import { drawFuma, drawPoeSkill, POE_SKILL_TREE, POE_SKILL_BG, POE_PASSIVE } from './iconsPoe.js'; // Poe's fūma + skill art (docs/POE.md)
import { drawFlail, drawShihtzuSkill, STZ_SKILL_TREE, STZ_SKILL_BG, STZ_PASSIVE } from './iconsShihtzu.js'; // the Shih Tzu's flail + skill art (docs/SHIHTZU.md)
import { drawLance, drawGoldenSkill, GLD_SKILL_TREE, GLD_SKILL_BG, GLD_PASSIVE } from './iconsGolden.js'; // the dragoon's lance + skill art (docs/GOLDEN.md)
import { drawSamuraiSkill, drawKatanaItem } from './samuraiIcons.js'; // (Chewy the samurai: the Bone Katana, the Bone Blade / Pack Spirit art)

const INK = '#4a2c2a';
const TAU = Math.PI * 2;
export const ICON_SIZE = 64;
export let ICON_RES = 2;
const cache = new Map();
export function setIconResolution(r) { ICON_RES = Math.max(1, r); cache.clear(); }
export function clearIconCache() { cache.clear(); }

// ================================================================== primitives
const L = (c, t = 0.4) => mixHex(c, '#ffffff', t);
const D = (c, t = 0.3) => mixHex(c, '#3a1c22', t);
function newCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = ICON_SIZE * ICON_RES;
  // (a CPU-backed canvas: every icon ends in toDataURL, and on a GPU-backed one that read-back waits for the GPU, busy
  //  with the game: 20-70 ms an icon instead of a few — ROADMAP R-8)
  const g = c.getContext('2d', { willReadFrequently: true });
  g.scale(ICON_RES, ICON_RES);
  g.lineJoin = 'round'; g.lineCap = 'round';
  return { c, g };
}
function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const circ = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); };
const ell = (g, x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); };
function lin(g, x0, y0, x1, y1, stops) { const gr = g.createLinearGradient(x0, y0, x1, y1); for (const [t, c] of stops) gr.addColorStop(t, c); return gr; }
function rad(g, x, y, r, stops, fx, fy) { const gr = g.createRadialGradient(fx ?? x, fy ?? y, 0, x, y, r); for (const [t, c] of stops) gr.addColorStop(t, c); return gr; }
/** Volume gradient: highlight top-left → base → shade bottom-right, within a bounding box. */
const vol = (g, base, x0, y0, x1, y1, hi = 0.45, lo = 0.3) => lin(g, x0, y0, x1, y1, [[0, L(base, hi)], [0.45, base], [1, D(base, lo)]]);
const volR = (g, base, x, y, r, hi = 0.5, lo = 0.35) => rad(g, x, y, r * 1.05, [[0, L(base, hi)], [0.55, base], [1, D(base, lo)]], x - r * 0.4, y - r * 0.45);
function paint(g, fill, lw = 2, ink = INK) { g.fillStyle = fill; g.fill(); if (lw) { g.strokeStyle = ink; g.lineWidth = lw; g.stroke(); } }
function stroke(g, col, lw) { g.strokeStyle = col; g.lineWidth = lw; g.stroke(); }
function shine(g, x, y, rx, ry, rot = -0.5, a = 0.75) { g.save(); g.fillStyle = `rgba(255,255,255,${a})`; ell(g, x, y, rx, ry, rot); g.fill(); g.restore(); }
function sparkle(g, x, y, r, col = '#ffffff', a = 1) {
  g.save(); g.globalAlpha *= a; g.fillStyle = col; g.beginPath();
  g.moveTo(x, y - r); g.quadraticCurveTo(x + r * 0.18, y - r * 0.18, x + r, y); g.quadraticCurveTo(x + r * 0.18, y + r * 0.18, x, y + r);
  g.quadraticCurveTo(x - r * 0.18, y + r * 0.18, x - r, y); g.quadraticCurveTo(x - r * 0.18, y - r * 0.18, x, y - r); g.fill(); g.restore();
}
function starPath(g, x, y, r, ri = r * 0.48, n = 5, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, rr2 = i % 2 ? ri : r; const px = x + Math.cos(a) * rr2, py = y + Math.sin(a) * rr2; i ? g.lineTo(px, py) : g.moveTo(px, py); }
  g.closePath();
}
function roundStar(g, x, y, r, ri, n = 5, rot = -Math.PI / 2) {
  g.beginPath();
  const pts = [];
  for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, q = i % 2 ? ri : r; pts.push([x + Math.cos(a) * q, y + Math.sin(a) * q]); }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let m = mid(pts[pts.length - 1], pts[0]); g.moveTo(m[0], m[1]);
  for (let i = 0; i < pts.length; i++) { const p = pts[i], nx = mid(p, pts[(i + 1) % pts.length]); g.quadraticCurveTo(p[0], p[1], nx[0], nx[1]); }
  g.closePath();
}
function heartPath(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.9);
  g.bezierCurveTo(x - s * 1.25, y + s * 0.05, x - s * 1.0, y - s * 1.05, x, y - s * 0.4);
  g.bezierCurveTo(x + s * 1.0, y - s * 1.05, x + s * 1.25, y + s * 0.05, x, y + s * 0.9);
  g.closePath();
}
// Soft effects (glows, trails, ground shadows) go to a separate FX layer while composing so the sticker rim ignores them.
let FX = null;
function fxg(g) { if (!FX) return g; FX.setTransform(g.getTransform()); return FX; }
function glow(g, x, y, r, col, a = 0.6) { const f = fxg(g); f.save(); f.fillStyle = rad(f, x, y, r, [[0, hexA(col, a)], [0.5, hexA(col, a * 0.35)], [1, hexA(col, 0)]]); circ(f, x, y, r); f.fill(); f.restore(); }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function shadow(g, y = 25, rx = 17, ry = 3.6) { const f = fxg(g); f.save(); f.fillStyle = rad(f, 0, y, rx, [[0, 'rgba(40,20,30,0.30)'], [0.7, 'rgba(40,20,30,0.16)'], [1, 'rgba(40,20,30,0)']]); ell(f, 0, y, rx, ry); f.fill(); f.restore(); }
function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
/** Cartoon bone (horizontal, centered) with knobby ends. */
function bonePath(g, x0, x1, hw, kr) {
  // shaft [x0..x1] × [-hw..hw] with two overlapping knobs (radius kr) at each end; one clean outer contour.
  const d = kr * 0.72;
  hw = Math.min(hw, d * 0.95);
  const s = Math.sqrt(kr * kr - (d - hw) * (d - hw)), s2 = Math.sqrt(Math.max(0, kr * kr - d * d));
  g.beginPath();
  g.moveTo(x0 + s, -hw); g.lineTo(x1 - s, -hw);
  g.arc(x1, -d, kr, Math.atan2(d - hw, -s), Math.atan2(d, s2) + TAU);
  g.arc(x1, d, kr, -Math.atan2(d, s2), Math.atan2(hw - d, -s) + TAU);
  g.lineTo(x0 + s, hw);
  g.arc(x0, d, kr, Math.atan2(hw - d, s), Math.atan2(-d, -s2) + TAU);
  g.arc(x0, -d, kr, Math.atan2(d, -s2), Math.atan2(d - hw, s) + TAU);
  g.closePath();
}
function drawBone(g, x, y, len, hw, kr, rot, col = '#fff6e0', lw = 1.8) {
  g.save(); g.translate(x, y); g.rotate(rot);
  bonePath(g, -len / 2, len / 2, hw, kr);
  paint(g, vol(g, col, -len / 2, -hw - kr, len / 2, hw + kr, 0.5, 0.22), lw);
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = Math.max(0.8, hw * 0.35);
  g.beginPath(); g.moveTo(-len / 2 + kr * 0.4, -hw * 0.35); g.lineTo(len / 2 - kr * 0.4, -hw * 0.35); g.stroke();
  g.restore();
}

// ------------------------------------------------------------------ rarity & sticker compositing
const RARITY_GLOW = { magic: '#6ea8ff', rare: '#ffd84a', unique: '#ff9a3c', set: '#5ee07a' };
function rarityBack(g, rarity) {
  const col = RARITY_GLOW[rarity];
  if (!col) return;
  g.save();
  g.fillStyle = rad(g, 32, 34, 30, [[0, hexA(col, 0.55)], [0.55, hexA(col, 0.22)], [1, hexA(col, 0)]]);
  g.fillRect(0, 0, 64, 64);
  g.restore();
}
function rarityFront(g, rarity) {
  if (rarity === 'unique' || rarity === 'set') {
    const col = rarity === 'unique' ? '#fff0b0' : '#e0ffe8';
    sparkle(g, 53, 11, 4.2, col); sparkle(g, 9, 50, 3, col, 0.9); sparkle(g, 56, 52, 2.2, col, 0.8);
  } else if (rarity === 'rare') { sparkle(g, 54, 10, 3.4, '#fff6c0'); sparkle(g, 9, 52, 2.2, '#fff6c0', 0.8); }
}
/** Render art (drawn around 0,0 in a 64 box) with a cream sticker rim; returns canvas. */
function compose(draw, { rarity, bg } = {}) {
  const art = newCanvas();
  const fx = newCanvas();
  FX = fx.g;
  try { art.g.save(); art.g.translate(32, 32); draw(art.g); art.g.restore(); } finally { FX = null; }
  const out = newCanvas();
  const g = out.g;
  if (bg) bg(g);
  rarityBack(g, rarity);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(fx.c, 0, 0); g.restore();
  // sticker rim: dilate the art silhouette in cream
  const rim = newCanvas();
  rim.g.setTransform(1, 0, 0, 1, 0, 0);
  const R = 1.6 * ICON_RES;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; rim.g.drawImage(art.c, Math.cos(a) * R, Math.sin(a) * R); }
  rim.g.globalCompositeOperation = 'source-in';
  rim.g.fillStyle = 'rgba(255,250,240,0.92)';
  rim.g.fillRect(0, 0, rim.c.width, rim.c.height);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(rim.c, 0, 0);
  g.drawImage(art.c, 0, 0);
  g.restore();
  rarityFront(g, rarity);
  return out.c;
}
function cached(key, make) {
  if (cache.has(key)) return cache.get(key);
  if (typeof document === 'undefined') return '';
  const url = make().toDataURL('image/png');
  cache.set(key, url);
  return url;
}

// ================================================================== weapons: bone swords
// All swords are drawn along +x then rotated -45° (handle bottom-left, tip top-right).
function bladeShape(g, x0, x1, hwFn, cFn, n = 28, serr = 0) {
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, c = cFn(t), h = hwFn(t);
    top.push([x, c - h]);
    const s = serr && t > 0.08 && t < 0.92 ? (i % 2 ? serr : -serr * 0.2) : 0;
    bot.push([x, c + h + s]);
  }
  g.beginPath(); g.moveTo(top[0][0], top[0][1]);
  for (const p of top) g.lineTo(p[0], p[1]);
  for (let i = bot.length - 1; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]);
  g.closePath();
  return { top, bot };
}
function grip(g, x0, x1, hw, col, wrap = true, diamond = false) {
  rr(g, x0, -hw, x1 - x0, hw * 2, hw * 0.9);
  paint(g, lin(g, 0, -hw, 0, hw, [[0, L(col, 0.35)], [0.5, col], [1, D(col, 0.3)]]), 1.6);
  if (wrap) {
    g.save(); rr(g, x0, -hw, x1 - x0, hw * 2, hw * 0.9); g.clip();
    g.strokeStyle = diamond ? 'rgba(255,255,255,0.8)' : L(col, 0.45); g.lineWidth = diamond ? 1 : 1.2;
    for (let x = x0 + 1; x < x1 + hw; x += 3.2) { g.beginPath(); g.moveTo(x, -hw); g.lineTo(x - hw * 1.4, hw); g.stroke(); if (diamond) { g.beginPath(); g.moveTo(x - hw * 1.4, -hw); g.lineTo(x, hw); g.stroke(); } }
    g.restore();
  }
}
function knob(g, x, y, r, col, lw = 1.5) { circ(g, x, y, r); paint(g, volR(g, col, x, y, r, 0.5, 0.25), lw); }
function guard(g, type, x, hw, acc, blade) {
  if (type === 'knobs') {
    rr(g, x - 2, -hw - 3.2, 4, (hw + 3.2) * 2, 2); paint(g, vol(g, blade, x - 2, -hw, x + 2, hw), 1.5);
    knob(g, x, -hw - 3.4, 3, blade); knob(g, x, hw + 3.4, 3, blade);
  } else if (type === 'bar') {
    rr(g, x - 2.2, -hw - 4.5, 4.4, (hw + 4.5) * 2, 2.2); paint(g, vol(g, acc, x - 2, -hw - 4, x + 2, hw + 4), 1.6);
  } else if (type === 'round') {
    ell(g, x, 0, 2.6, hw + 5); paint(g, vol(g, acc, x - 3, -hw - 5, x + 3, hw + 5, 0.5, 0.35), 1.6);
    ell(g, x, 0, 1, hw + 2.2); stroke(g, D(acc, 0.35), 0.8);
  } else if (type === 'wings') {
    g.beginPath(); g.moveTo(x + 1, -2); g.quadraticCurveTo(x - 1, -hw - 6, x + 5, -hw - 8); g.quadraticCurveTo(x + 2, -hw - 2, x + 3, -2);
    g.lineTo(x + 3, 2); g.quadraticCurveTo(x + 2, hw + 2, x + 5, hw + 8); g.quadraticCurveTo(x - 1, hw + 6, x + 1, 2); g.closePath();
    paint(g, vol(g, acc, x - 3, -hw - 8, x + 5, hw + 8, 0.55, 0.3), 1.5);
  } else if (type === 'star') {
    roundStar(g, x, 0, hw + 6, (hw + 6) * 0.5, 5, 0); paint(g, volR(g, acc, x, 0, hw + 6, 0.55, 0.3), 1.5);
  }
}
const SWORD = {
  stick: { len: 50, grip: 0, hw: t => 2.6 + Math.sin(t * 9) * 0.35 + (1 - t) * 0.6, tip: 'round', guard: 'none' },
  bone: { len: 44, grip: 11, hw: t => 3.6 - Math.sin(t * Math.PI) * 0.9 + t * 0.4, tip: 'knobs', guard: 'knobs' },
  sabre: { len: 48, grip: 11, hw: t => 3.4 - t * 1.2, curve: -5, tip: 'knobs', guard: 'bar' },
  club: { sc: 0.9, len: 40, grip: 10, hw: t => 4.6 - Math.sin(t * Math.PI) * 1.4 + t * 0.8, tip: 'knobs2', guard: 'knobs' },
  cleaver: { len: 44, grip: 12, hw: t => (t < 0.08 ? 3 + t * 50 : 7.2) - Math.max(0, t - 0.85) * 12, off: 2.5, tip: 'none', guard: 'bar', rawhide: true },
  dino: { len: 45, grip: 11, hw: t => 4.2 - t * 0.8, tip: 'knobs', guard: 'knobs', plates: true },
  shark: { len: 48, grip: 11, hw: t => 3.8 - t * 2.4, curve: -3, tip: 'point', guard: 'round', serr: 1.8 },
  tusk: { len: 50, grip: 10, hw: t => 4.6 * (1 - t * 0.85), curve: -9, tip: 'point', guard: 'bar', bands: true },
  trex: { len: 46, grip: 11, hw: t => (t < 0.1 ? 3.5 + t * 45 : 8) - Math.max(0, t - 0.8) * 14, off: 2.5, tip: 'none', guard: 'knobs', teeth: true },
  katana: { len: 54, grip: 13, hw: t => 2.5 - t * 0.9, curve: -5, tip: 'point', guard: 'round', diamond: true, glow: true, hamon: true },
  dragon: { len: 50, grip: 11, hw: t => 3.8 - t * 1.2, tip: 'point', guard: 'wings', spikes: true, gem: true },
  kaiju: { sc: 0.88, len: 43, grip: 10, hw: t => 5.2 - Math.sin(t * Math.PI) * 1.6 + t, tip: 'knobs2', guard: 'knobs', crystals: true, glow: true },
  odachi: { len: 56, grip: 12, hw: t => 2.4 - t * 0.8, curve: -3, tip: 'point', guard: 'star', glow: true, stars: true },
};
function drawSword(g, v, cols, noShadow) {
  if (v === 'bone') return drawKatanaItem(g, cols, noShadow, ICON_KIT); // (the Bone Katana: samuraiIcons.js)
  const [blade, gripC, acc] = cols;
  const S = SWORD[v] || SWORD.bone;
  if (!noShadow) shadow(g, 25, 15, 3.2);
  g.save();
  g.rotate(-Math.PI / 4);
  g.translate(-2.5, 0);
  g.scale(1.04 * (S.sc || 1), 1.04 * (S.sc || 1));
  const hw = t => S.hw(t) * 1.3;
  const total = S.len + S.grip;
  const hx0 = -total / 2 + 1, gx = hx0 + S.grip, x1 = total / 2 - 3;
  const curve = S.curve || 0;
  const cF = t => curve * t * t + (S.off ? -S.off * Math.min(1, t * 8) : 0);
  // back decorations
  if (S.plates) for (let i = 0; i < 4; i++) { const t = 0.18 + i * 0.2, x = gx + (x1 - gx) * t, h = hw(t); g.beginPath(); g.moveTo(x - 4, cF(t) - h + 1); g.quadraticCurveTo(x - 1, cF(t) - h - 7, x + 3.5, cF(t) - h + 1); g.closePath(); paint(g, vol(g, acc, x - 4, -h - 7, x + 4, -h), 1.4); }
  if (S.spikes) for (let i = 0; i < 3; i++) { const t = 0.25 + i * 0.22, x = gx + (x1 - gx) * t, h = hw(t); g.beginPath(); g.moveTo(x - 3, cF(t) - h + 1); g.lineTo(x + 1.5, cF(t) - h - 4.5); g.lineTo(x + 2.5, cF(t) - h + 1); g.closePath(); paint(g, D(blade, 0.15), 1.3); }
  if (S.crystals) for (let i = 0; i < 3; i++) { const t = 0.3 + i * 0.22, x = gx + (x1 - gx) * t, h = hw(t); g.beginPath(); g.moveTo(x - 2.5, -h + 1); g.lineTo(x, -h - 6 - i); g.lineTo(x + 2.5, -h + 1); g.closePath(); paint(g, vol(g, acc, x - 2, -h - 7, x + 2, -h, 0.6, 0.2), 1.3); }
  // knobs & rounded ends sit BEHIND the blade; the blade fill hides their inner outlines (classic cartoon bone)
  const th = hw(1), tc = cF(1);
  const kr = Math.min(th + 1.9, th * 0.8 + 2.4);
  const x1b = x1 + (S.tip === 'point' ? 5 : 0);
  const hwF = t => (S.tip === 'point' && t > 0.8 ? hw(t) * (1 - ((t - 0.8) / 0.2) * 0.92) : hw(t));
  if (S.tip === 'knobs' || S.tip === 'knobs2') { knob(g, x1 + 0.5, tc - th - 0.4, kr, blade, 1.8); knob(g, x1 + 0.5, tc + th + 0.4, kr, blade, 1.8); }
  if (S.tip === 'knobs2') { const h0 = hw(0.12); knob(g, gx + 6, -h0 - 0.6, h0 * 0.85 + 1.2, blade, 1.7); knob(g, gx + 6, h0 + 0.6, h0 * 0.85 + 1.2, blade, 1.7); }
  if (S.tip === 'round') knob(g, x1, tc, th + 0.2, blade, 1.8);
  if (v === 'stick') knob(g, gx + 1.5, cF(0), hw(0) + 0.1, blade, 1.8);
  if (S.glow) { const fx = fxg(g); fx.save(); fx.shadowColor = hexA(acc, 1); fx.shadowBlur = 9 * ICON_RES; fx.fillStyle = hexA(L(acc, 0.3), 0.85); bladeShape(fx, gx + 1, x1b, t => hwF(t) + 1.5, cF, 28); fx.fill(); fx.fill(); fx.restore(); }
  // blade: fill, then stroke only the long edges (+ end cap for flat/pointed tips)
  const pts = bladeShape(g, gx + 1, x1b, hwF, cF, 28, S.serr || 0);
  g.fillStyle = lin(g, 0, -6, 0, 6, [[0, L(blade, 0.6)], [0.42, blade], [1, D(blade, 0.25)]]);
  g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.9;
  const edge = (arr, from, to) => { g.beginPath(); for (let i = from; i <= to; i++) i === from ? g.moveTo(arr[i][0], arr[i][1]) : g.lineTo(arr[i][0], arr[i][1]); g.stroke(); };
  const lastI = pts.top.length - 1;
  const capped = S.tip === 'none' || S.tip === 'point';
  const trim = capped ? 0 : 1;
  edge(pts.top, 0, lastI - trim); edge(pts.bot, 0, lastI - trim);
  if (capped) { g.beginPath(); g.moveTo(pts.top[lastI][0], pts.top[lastI][1]); g.lineTo(pts.bot[lastI][0], pts.bot[lastI][1]); g.stroke(); }
  if (S.tip === 'knobs' || S.tip === 'knobs2') { shine(g, x1 + 0.2, tc - th - 1.6, 1.4, 0.8, 0, 0.9); shine(g, x1 + 0.2, tc + th - 0.8, 1.1, 0.6, 0, 0.7); }
  // details
  g.save(); bladeShape(g, gx + 1, x1b, hwF, cF, 28, S.serr || 0); g.clip();
  if (S.rawhide) { g.strokeStyle = D(blade, 0.25); g.lineWidth = 1; for (let x = gx - 4; x < x1 + 8; x += 4.5) { g.beginPath(); g.moveTo(x, -9); g.quadraticCurveTo(x + 3, -2, x - 1, 9); g.stroke(); } }
  if (S.hamon) { g.strokeStyle = hexA(acc, 0.9); g.lineWidth = 1.2; g.beginPath(); for (let i = 0; i <= 20; i++) { const t = i / 20, x = gx + 2 + (x1 - gx) * t, y = cF(t) + hw(t) * 0.35 + Math.sin(i * 1.7) * 0.5; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  if (S.bands) { g.fillStyle = hexA(D(gripC, 0.1), 0.85); for (const t of [0.12, 0.2]) { const x = gx + (x1 - gx) * t; g.fillRect(x, -9, 2.2, 18); } }
  if (S.teeth) { g.fillStyle = '#fffaf0'; g.strokeStyle = INK; g.lineWidth = 1; for (let i = 0; i < 4; i++) { const x = gx + 10 + i * 6.5; g.beginPath(); g.moveTo(x, 9); g.lineTo(x + 2.2, 4.2); g.lineTo(x + 4.4, 9); g.fill(); g.stroke(); } }
  g.restore();
  // edge highlight
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.2;
  g.beginPath(); for (let i = 2; i <= 22; i++) { const p = pts.top[i]; i === 2 ? g.moveTo(p[0], p[1] + 1.3) : g.lineTo(p[0], p[1] + 1.3); } g.stroke();
  if (v === 'stick') {
    // knots, bite marks and a little sprout
    g.fillStyle = D(blade, 0.3); ell(g, gx + 12, 0.5, 1.4, 1, 0); g.fill(); ell(g, gx + 28, -0.5, 1.2, 0.9, 0); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1.2; for (const x of [gx + 18, gx + 21]) { g.beginPath(); g.moveTo(x, -3); g.lineTo(x + 1, -1.4); g.stroke(); }
    g.beginPath(); g.moveTo(gx + 33, -2.4); g.quadraticCurveTo(gx + 35, -7, gx + 38, -8); stroke(g, INK, 2.6); g.beginPath(); g.moveTo(gx + 33, -2.4); g.quadraticCurveTo(gx + 35, -7, gx + 38, -8); stroke(g, D(blade, 0.1), 1.2);
    g.save(); g.translate(gx + 38, -8.5); g.rotate(-0.5); ell(g, 3.2, 0, 4, 2.3); paint(g, vol(g, acc, -1, -3, 7, 3, 0.5, 0.25), 1.4); g.beginPath(); g.moveTo(0, 0); g.lineTo(6, 0); stroke(g, D(acc, 0.3), 0.8); g.restore();
  }
  if (S.gem) { ell(g, gx + 6, 0, 2.4, 2.4); paint(g, volR(g, '#e8364a', gx + 6, 0, 2.4), 1.2); shine(g, gx + 5.3, -0.8, 0.8, 0.5, 0, 0.9); }
  if (S.stars) { sparkle(g, gx + 20, -1, 2.2, '#fff6c0'); sparkle(g, gx + 34, 0.5, 1.6, '#fff6c0'); }
  if (S.glow && v === 'katana') { sparkle(g, x1 + 3, tc - 3, 3, '#ffffff'); }
  // guard & grip
  if (S.grip) {
    grip(g, hx0 + 2.5, gx, 3.1, gripC, true, !!S.diamond);
    guard(g, S.guard, gx, hw(0), acc, blade);
    // pommel
    if (S.guard === 'knobs' || v === 'bone' || v === 'club') { knob(g, hx0 + 1.5, -2.7, 2.7, blade, 1.5); knob(g, hx0 + 1.5, 2.7, 2.7, blade, 1.5); }
    else { knob(g, hx0 + 1.8, 0, 3.2, acc, 1.5); }
  }
  g.restore();
}

// ================================================================== weapons: balls
const BR = 16.5;
function ballBody(g, main, r = BR, x = 0, y = 0) { circ(g, x, y, r); paint(g, volR(g, main, x, y, r, 0.55, 0.38), 2); }
function ballShine(g, r = BR, x = 0, y = 0) { shine(g, x - r * 0.38, y - r * 0.45, r * 0.3, r * 0.17, -0.6, 0.8); circ(g, x - r * 0.05, y - r * 0.62, r * 0.07); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill(); }
function ballClip(g, r = BR, x = 0, y = 0) { g.save(); circ(g, x, y, r - 0.6); g.clip(); }
function drawBall(g, v, cols) {
  const [main, seam, acc] = cols;
  shadow(g, 23, 15, 3.4);
  if (v === 'lantern' || v === 'nova') glow(g, 0, 0, 27, v === 'nova' ? '#e0a0ff' : acc, 0.75);
  if (v === 'comet' || v === 'meteor') {
    // flame trail toward bottom-left
    const f = fxg(g);
    f.save(); f.rotate(Math.PI * 0.75);
    for (const [w, len, c, a] of [[14, 32, v === 'meteor' ? '#ff6a2a' : acc, 0.95], [9.5, 27, seam, 0.95], [4.5, 21, '#ffffff', 0.95]]) {
      f.beginPath(); f.moveTo(-w, 4); f.quadraticCurveTo(-w * 0.5, len * 0.8, 0, len + 8); f.quadraticCurveTo(w * 0.5, len * 0.8, w, 4); f.closePath();
      f.fillStyle = lin(f, 0, 0, 0, len + 8, [[0, hexA(c, a)], [1, hexA(c, 0)]]); f.fill();
    }
    f.restore();
  }
  if (v === 'nova') { roundStar(g, 0, 0, 29, 12, 8, 0.2); g.fillStyle = lin(g, -20, -20, 20, 20, [[0, hexA('#fff6c0', 0.95)], [1, hexA(acc, 0.8)]]); g.fill(); }
  if (v === 'spiky') {
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + 0.2, x = Math.cos(a) * (BR + 0.5), y = Math.sin(a) * (BR + 0.5); circ(g, x, y, 4.3); paint(g, volR(g, L(main, 0.1), x, y, 4.3, 0.5, 0.3), 1.6); }
  }
  if (v === 'planet') { g.save(); g.rotate(-0.35); g.beginPath(); g.ellipse(0, 0, 27, 7.5, 0, Math.PI, TAU); g.lineWidth = 6.5; g.strokeStyle = INK; g.stroke(); g.lineWidth = 4; g.strokeStyle = seam; g.stroke(); g.restore(); }
  if (v === 'yarn') { g.beginPath(); g.moveTo(10, 12); g.bezierCurveTo(20, 18, 24, 8, 20, 20); g.bezierCurveTo(17, 27, 25, 28, 27, 24); stroke(g, INK, 3.2); g.beginPath(); g.moveTo(10, 12); g.bezierCurveTo(20, 18, 24, 8, 20, 20); g.bezierCurveTo(17, 27, 25, 28, 27, 24); stroke(g, main, 1.6); }
  ballBody(g, v === 'meteor' ? main : main);
  ballClip(g);
  const rnd = seeded(v.length * 97 + main.charCodeAt(2));
  switch (v) {
    case 'tennis': {
      for (let i = 0; i < 40; i++) { const a = rnd() * TAU, r = rnd() * BR; g.fillStyle = hexA(L(main, 0.5), 0.35); circ(g, Math.cos(a) * r, Math.sin(a) * r, 0.6); g.fill(); }
      for (const s of [-1, 1]) {
        g.beginPath(); g.arc(s * BR * 1.18, 0, BR * 0.86, s < 0 ? -1.05 : Math.PI - 1.05, s < 0 ? 1.05 : Math.PI + 1.05); stroke(g, D(main, 0.35), 4.2);
        g.beginPath(); g.arc(s * BR * 1.18, 0, BR * 0.86, s < 0 ? -1.05 : Math.PI - 1.05, s < 0 ? 1.05 : Math.PI + 1.05); stroke(g, seam, 2.6);
      }
      break;
    }
    case 'squeaky': {
      for (const [x, y, r] of [[-7, 6, 3.4], [6, -6, 3], [8, 8, 2.6], [-4, -9, 2.2], [-12, -2, 1.8], [1, 12, 2]]) { starPath(g, x, y, r + 1.2, (r + 1.2) * 0.5); g.fillStyle = seam; g.fill(); }
      break;
    }
    case 'bouncy': {
      g.save(); g.rotate(-0.4);
      g.beginPath(); g.ellipse(0, 0, BR + 2, 6.5, 0, 0, TAU); g.fillStyle = seam; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke();
      g.beginPath(); g.ellipse(0, 0, BR + 2, 2.8, 0, 0, TAU); g.strokeStyle = acc; g.lineWidth = 1.2; g.stroke();
      g.restore();
      break;
    }
    case 'yarn': {
      g.strokeStyle = seam; g.lineWidth = 1.6;
      for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(0, 0, BR * (0.4 + i * 0.1), BR * 1.1, i * 0.45, 0, TAU); g.stroke(); }
      g.strokeStyle = hexA(L(main, 0.5), 0.8); g.lineWidth = 1; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(0, 0, BR * 1.05, BR * (0.3 + i * 0.12), 0.9, 0, TAU); g.stroke(); }
      break;
    }
    case 'spiky': { for (let i = 0; i < 8; i++) { const a = rnd() * TAU, r = rnd() * BR * 0.7; circ(g, Math.cos(a) * r, Math.sin(a) * r, 1.8); g.fillStyle = hexA(seam, 0.55); g.fill(); } break; }
    case 'kemari': {
      g.save(); g.rotate(0.25);
      g.fillStyle = seam; g.fillRect(-BR, -4.2, BR * 2, 8.4);
      g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-BR, -4.2); g.lineTo(BR, -4.2); g.moveTo(-BR, 4.2); g.lineTo(BR, 4.2); g.stroke();
      g.strokeStyle = acc; g.lineWidth = 1.2; for (let x = -BR; x < BR; x += 3.4) { g.beginPath(); g.moveTo(x, -6.8); g.lineTo(x + 1.5, -5.2); g.moveTo(x, 6.8); g.lineTo(x + 1.5, 5.2); g.stroke(); }
      g.restore(); break;
    }
    case 'lantern': {
      g.fillStyle = rad(g, 0, 2, BR, [[0, '#fff8d0'], [0.6, hexA(acc, 0.4)], [1, hexA(acc, 0)]]); circ(g, 0, 0, BR); g.fill();
      g.strokeStyle = hexA(D(main, 0.35), 0.8); g.lineWidth = 1.2; for (const rx of [4, 9, 13.5]) { g.beginPath(); g.ellipse(0, 0, rx, BR, 0, 0, TAU); g.stroke(); }
      g.fillStyle = D(seam, 0.4); g.fillRect(-7, -BR - 1, 14, 4); g.fillRect(-7, BR - 3, 14, 4);
      break;
    }
    case 'comet': { g.strokeStyle = hexA(seam, 0.9); g.lineWidth = 2.2; g.beginPath(); g.arc(3, 3, 10, 2.6, 5.4); g.stroke(); g.beginPath(); g.arc(4, 4, 5, 2.4, 5.6); g.stroke(); break; }
    case 'meteor': {
      for (let i = 0; i < 6; i++) { const a = rnd() * TAU, r = rnd() * BR * 0.75, cr = 1.5 + rnd() * 2.5; circ(g, Math.cos(a) * r, Math.sin(a) * r, cr); g.fillStyle = D(main, 0.35); g.fill(); }
      const cracks = () => { g.beginPath(); g.moveTo(-11, -7); g.lineTo(-6, -4); g.lineTo(-7, 1); g.lineTo(-2, 4); g.moveTo(2, -11); g.lineTo(4, -5); g.lineTo(10, -3); g.moveTo(3, 7); g.lineTo(7, 9); g.lineTo(6, 13); };
      cracks(); stroke(g, hexA(acc, 0.45), 4); cracks(); stroke(g, seam, 1.6);
      for (const [x, y] of [[-6, -4], [4, -5], [7, 9]]) { circ(g, x, y, 1.3); g.fillStyle = '#fff3a0'; g.fill(); }
      break;
    }
    case 'planet': { g.fillStyle = hexA(seam, 0.55); for (const y of [-8, -1, 7]) { g.save(); g.rotate(-0.35); g.fillRect(-BR, y, BR * 2, 3); g.restore(); } break; }
    case 'nova': {
      g.fillStyle = rad(g, 4, 4, BR, [[0, hexA('#ffe0ff', 0.9)], [1, hexA('#ffe0ff', 0)]]); circ(g, 0, 0, BR); g.fill();
      g.strokeStyle = hexA(seam, 0.8); g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 9, 0.3, 3.5); g.stroke(); g.beginPath(); g.arc(1, 1, 4.5, 3, 6); g.stroke();
      break;
    }
    default: break;
  }
  g.restore();
  circ(g, 0, 0, BR); stroke(g, INK, 2);
  ballShine(g);
  if (v === 'squeaky') { rr(g, 9.5, -17, 6, 5, 2); paint(g, vol(g, acc, 9, -17, 15, -12), 1.4); circ(g, 12.5, -14.5, 1); g.fillStyle = INK; g.fill(); }
  if (v === 'planet') { g.save(); g.rotate(-0.35); g.beginPath(); g.ellipse(0, 0, 27, 7.5, 0, 0, Math.PI); g.lineWidth = 6.5; g.strokeStyle = INK; g.stroke(); g.lineWidth = 4; g.strokeStyle = seam; g.stroke(); g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(0, -0.6, 27, 7.5, 0, 0.3, 1.4); g.stroke(); g.restore(); }
  if (v === 'nova') { sparkle(g, -15, -14, 3.5, '#ffffff'); sparkle(g, 16, 12, 2.6, '#fff6c0'); }
  if (v === 'lantern') { sparkle(g, 14, -14, 3, '#fff6c0'); }
  if (v === 'comet') sparkle(g, 15, -13, 3, '#fff6c0');
}

// ================================================================== hats
function drawHat(g, v, cols) {
  const [main, band, acc] = cols;
  shadow(g, 22, 19, 3.6);
  switch (v) {
    case 'straw': {
      ell(g, 0, 8, 27, 9); paint(g, vol(g, main, -26, 0, 26, 16, 0.4, 0.3), 2);
      g.save(); ell(g, 0, 8, 27, 9); g.clip(); g.strokeStyle = hexA(D(main, 0.3), 0.5); g.lineWidth = 1; for (let r = 12; r < 28; r += 4) { ell(g, 0, 8, r, r * 0.33); g.stroke(); } g.restore();
      g.beginPath(); g.moveTo(-14, 7); g.bezierCurveTo(-15, -14, 15, -14, 14, 7); g.closePath(); paint(g, vol(g, main, -14, -12, 14, 8), 2);
      g.beginPath(); g.moveTo(-14.2, 5); g.bezierCurveTo(-14, 0, 14, 0, 14.2, 5); g.lineTo(14, 9); g.bezierCurveTo(10, 11, -10, 11, -14, 9); g.closePath(); paint(g, vol(g, band, -14, 0, 14, 10), 1.6);
      g.save(); g.translate(11, 5); ell(g, -2, 0, 4, 2.6, -0.6); paint(g, band, 1.3); ell(g, 3, 1, 4, 2.6, 0.6); paint(g, band, 1.3); circ(g, 0.5, 0.6, 1.8); paint(g, D(band, 0.2), 1.2); g.restore();
      shine(g, -6, -5, 4, 2, -0.5, 0.6);
      break;
    }
    case 'bandana': {
      g.beginPath(); g.moveTo(-22, -6); g.quadraticCurveTo(0, -18, 22, -6); g.quadraticCurveTo(12, 6, 0, 18); g.quadraticCurveTo(-12, 6, -22, -6); g.closePath();
      paint(g, vol(g, main, -22, -16, 22, 18), 2);
      g.save(); g.clip(); for (const [x, y] of [[-10, -4], [2, -8], [11, -2], [-2, 4], [6, 9], [-12, 5], [0, 13]]) { circ(g, x, y, 1.8); g.fillStyle = band; g.fill(); }
      g.strokeStyle = hexA(L(main, 0.5), 0.8); g.lineWidth = 1.2; g.beginPath(); g.moveTo(-18, -5); g.quadraticCurveTo(0, -14, 18, -5); g.stroke(); g.restore();
      g.beginPath(); g.moveTo(20, -7); g.quadraticCurveTo(28, -14, 27, -3); g.quadraticCurveTo(24, -4, 21, -4); g.closePath(); paint(g, vol(g, main, 20, -14, 28, -2), 1.6);
      g.beginPath(); g.moveTo(21, -5); g.quadraticCurveTo(29, -2, 25, 6); g.quadraticCurveTo(23, 1, 20, -2); g.closePath(); paint(g, vol(g, acc, 20, -5, 29, 6), 1.6);
      circ(g, 21, -5, 2.8); paint(g, vol(g, acc, 18, -8, 24, -2), 1.4);
      break;
    }
    case 'ribbon': {
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(s * 8, -18, s * 26, -14, s * 22, 0); g.bezierCurveTo(s * 26, 12, s * 8, 14, 0, 0); g.closePath();
        paint(g, vol(g, main, s * 2, -16, s * 24, 12), 2);
        g.beginPath(); g.moveTo(s * 5, -2); g.quadraticCurveTo(s * 14, -8, s * 18, -2); stroke(g, hexA(D(main, 0.35), 0.7), 1.4);
        g.beginPath(); g.moveTo(s * 2, 3); g.quadraticCurveTo(s * 8, 14, s * 12, 22); g.lineTo(s * 6, 20); g.quadraticCurveTo(s * 3, 12, 0, 4); g.closePath(); paint(g, vol(g, band === '#ffffff' ? main : band, 0, 4, 12, 22), 1.6);
      }
      rr(g, -5, -6, 10, 12, 4); paint(g, vol(g, acc, -5, -6, 5, 6), 1.8);
      shine(g, -12, -6, 4, 2, -0.6, 0.7); shine(g, 11, -8, 3, 1.6, 0.5, 0.6); shine(g, -1.5, -3, 1.6, 1, 0, 0.8);
      break;
    }
    case 'beanie': case 'batears': case 'party': {
      if (v === 'batears') for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(s * 5, -6); g.quadraticCurveTo(s * 12, -30, s * 22, -24); g.quadraticCurveTo(s * 22, -10, s * 16, 0); g.closePath();
        paint(g, vol(g, main, s * 5, -28, s * 22, 0, 0.3, 0.3), 2);
        g.beginPath(); g.moveTo(s * 8, -7); g.quadraticCurveTo(s * 13, -23, s * 19, -21); g.quadraticCurveTo(s * 18, -11, s * 14, -4); g.closePath(); g.fillStyle = '#ffb0c0'; g.fill();
      }
      if (v === 'party') {
        g.beginPath(); g.moveTo(-15, 10); g.lineTo(0, -24); g.lineTo(15, 10); g.closePath(); paint(g, vol(g, main, -15, -24, 15, 10), 2);
        g.save(); g.clip(); g.strokeStyle = band; g.lineWidth = 3.2; for (let y = -20; y < 12; y += 7.5) { g.beginPath(); g.moveTo(-20, y + 8); g.lineTo(20, y - 2); g.stroke(); } for (const [x, y] of [[-4, -8], [5, 2], [-7, 5], [2, -15]]) { circ(g, x, y, 1.6); g.fillStyle = acc; g.fill(); } g.restore();
        g.beginPath(); g.moveTo(-15, 10); g.lineTo(0, -24); g.lineTo(15, 10); g.closePath(); stroke(g, INK, 2);
        ell(g, 0, 11, 17, 5); paint(g, vol(g, acc, -17, 6, 17, 16), 1.8);
        for (let i = 0; i < 7; i++) { circ(g, Math.cos(i) * 3.2, -25 + Math.sin(i * 2) * 3, 3.2); g.fillStyle = i % 2 ? band : '#fffaf0'; g.fill(); }
        circ(g, 0, -25, 5); paint(g, rad(g, 0, -25, 5, [[0, '#ffffff'], [1, band]], -1.5, -27), 1.6);
        shine(g, -5, -4, 2.5, 5, 0.4, 0.5);
        break;
      }
      g.beginPath(); g.moveTo(-18, 8); g.bezierCurveTo(-19, -22, 19, -22, 18, 8); g.closePath(); paint(g, vol(g, main, -18, -18, 18, 8), 2);
      g.save(); g.clip(); g.strokeStyle = hexA(D(main, 0.25), 0.6); g.lineWidth = 1.2; for (let x = -16; x <= 16; x += 4.5) { g.beginPath(); g.moveTo(x, 8); g.quadraticCurveTo(x * 0.6, -8, x * 0.2, -18); g.stroke(); } g.restore();
      rr(g, -20, 3, 40, 11, 5); paint(g, vol(g, v === 'batears' ? band : acc, -20, 3, 20, 14), 2);
      g.save(); rr(g, -20, 3, 40, 11, 5); g.clip(); g.strokeStyle = hexA('#000000', 0.12); g.lineWidth = 1.4; for (let x = -18; x < 20; x += 3.2) { g.beginPath(); g.moveTo(x, 3); g.lineTo(x, 14); g.stroke(); } g.restore();
      if (v === 'beanie') { for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; circ(g, Math.cos(a) * 3.5, -19 + Math.sin(a) * 3, 3.6); g.fillStyle = band; g.fill(); } circ(g, 0, -19, 6); paint(g, rad(g, 0, -19, 6.5, [[0, '#ffffff'], [0.7, band], [1, D(band, 0.12)]], -2, -21), 1.8); }
      shine(g, -8, -8, 4, 2.2, -0.6, 0.55);
      break;
    }
    case 'kasa': case 'cone': {
      if (v === 'cone') {
        g.beginPath(); g.moveTo(-10, -12); g.lineTo(10, -12); g.lineTo(24, 16); g.quadraticCurveTo(0, 24, -24, 16); g.closePath();
        g.fillStyle = lin(g, -24, -12, 24, 16, [[0, hexA('#ffffff', 0.95)], [0.5, hexA(main, 0.85)], [1, hexA(band, 0.9)]]); g.fill(); stroke(g, INK, 2);
        ell(g, 0, -12, 10, 3); paint(g, hexA(band, 0.8), 1.6);
        g.strokeStyle = hexA(acc, 0.6); g.lineWidth = 1.2; for (const x of [-12, -4, 4, 12]) { g.beginPath(); g.moveTo(x * 0.45, -11); g.lineTo(x * 1.25, 18); g.stroke(); }
        g.beginPath(); g.moveTo(-23, 15); g.quadraticCurveTo(0, 23, 23, 15); stroke(g, acc, 2.4);
        shine(g, -10, 0, 2.5, 8, 0.4, 0.6);
        break;
      }
      g.beginPath(); g.moveTo(0, -18); g.quadraticCurveTo(14, -6, 28, 8); g.quadraticCurveTo(0, 16, -28, 8); g.quadraticCurveTo(-14, -6, 0, -18); g.closePath();
      paint(g, vol(g, main, -28, -18, 28, 14), 2);
      g.save(); g.clip(); g.strokeStyle = hexA(D(main, 0.35), 0.55); g.lineWidth = 1; for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(0, -18); g.lineTo(i * 5, 14); g.stroke(); } g.restore();
      circ(g, 0, -17, 2.4); paint(g, band, 1.3);
      g.beginPath(); g.moveTo(-12, 10); g.quadraticCurveTo(0, 26, 12, 10); stroke(g, INK, 2.8); g.beginPath(); g.moveTo(-12, 10); g.quadraticCurveTo(0, 26, 12, 10); stroke(g, band, 1.4);
      shine(g, -9, -3, 5, 2, -0.6, 0.5);
      break;
    }
    case 'kitsune': {
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 5, -12); g.quadraticCurveTo(s * 15, -30, s * 19, -26); g.quadraticCurveTo(s * 20, -14, s * 16, -4); g.closePath(); paint(g, vol(g, main, s * 5, -28, s * 19, -4), 2); g.beginPath(); g.moveTo(s * 8, -12); g.quadraticCurveTo(s * 15, -24, s * 17, -22); g.quadraticCurveTo(s * 17, -14, s * 14, -8); g.closePath(); g.fillStyle = band; g.fill(); }
      g.beginPath(); g.moveTo(-18, -8); g.bezierCurveTo(-20, -20, 20, -20, 18, -8); g.bezierCurveTo(19, 4, 8, 12, 0, 20); g.bezierCurveTo(-8, 12, -19, 4, -18, -8); g.closePath();
      paint(g, vol(g, main, -18, -18, 18, 20, 0.3, 0.2), 2);
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 13, -4); g.quadraticCurveTo(s * 8, -8, s * 4, -3); g.quadraticCurveTo(s * 9, -2, s * 13, -4); g.fillStyle = INK; g.fill(); g.beginPath(); g.moveTo(s * 15, -9); g.quadraticCurveTo(s * 10, -13, s * 5, -8); stroke(g, band, 2.2); g.beginPath(); g.moveTo(s * 12, 3); g.lineTo(s * 16, 6); stroke(g, band, 1.8); }
      ell(g, 0, 14, 2.6, 1.8); paint(g, INK, 0);
      g.beginPath(); g.moveTo(0, -16); g.lineTo(-2.4, -11); g.lineTo(0, -8); g.lineTo(2.4, -11); g.closePath(); g.fillStyle = acc; g.fill();
      shine(g, -9, -12, 3.5, 1.8, -0.4, 0.8);
      break;
    }
    case 'kabuto': case 'shogun': {
      const isS = v === 'shogun';
      g.translate(0, 4); g.scale(0.94, 0.94);
      for (let i = 0; i < 3; i++) { const y = 2 + i * 5, w = 22 + i * 3; rr(g, -w, y, w * 2, 6, 3); paint(g, vol(g, i % 2 ? D(main, 0.1) : main, -w, y, w, y + 6), 1.6); g.fillStyle = band; for (let x = -w + 4; x < w - 2; x += 7) { circ(g, x, y + 3, 0.9); g.fill(); } }
      g.beginPath(); g.moveTo(-17, 4); g.bezierCurveTo(-18, -20, 18, -20, 17, 4); g.closePath(); paint(g, vol(g, main, -17, -16, 17, 4, 0.5, 0.3), 2);
      g.save(); g.clip(); g.strokeStyle = hexA(L(main, 0.4), 0.6); g.lineWidth = 1.2; for (let x = -12; x <= 12; x += 6) { g.beginPath(); g.moveTo(x, 4); g.quadraticCurveTo(x * 0.7, -10, 0, -16); g.stroke(); } g.restore();
      rr(g, -18, 1, 36, 5, 2.5); paint(g, vol(g, band, -18, 1, 18, 6), 1.6);
      if (isS) { g.beginPath(); g.moveTo(-3, -8); g.bezierCurveTo(-26, -16, -24, -31, -15, -30); g.bezierCurveTo(-20, -23, -12, -15, 0, -12); g.bezierCurveTo(12, -15, 20, -23, 15, -30); g.bezierCurveTo(24, -31, 26, -16, 3, -8); g.closePath(); paint(g, vol(g, band, -24, -34, 24, -8, 0.6, 0.25), 1.8); }
      else for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 3, -10); g.quadraticCurveTo(s * 10, -18, s * 16, -30); g.quadraticCurveTo(s * 13, -18, s * 7, -8); g.closePath(); paint(g, vol(g, band, s * 3, -30, s * 16, -8, 0.6, 0.25), 1.6); }
      circ(g, 0, -9, 3.8); paint(g, volR(g, acc, 0, -9, 3.8), 1.5);
      shine(g, -8, -9, 4, 2, -0.6, 0.55);
      break;
    }
    case 'tengu': {
      g.beginPath(); g.moveTo(-17, -6); g.bezierCurveTo(-19, -22, 19, -22, 17, -6); g.bezierCurveTo(18, 10, 8, 18, 0, 18); g.bezierCurveTo(-8, 18, -18, 10, -17, -6); g.closePath();
      paint(g, vol(g, main, -17, -20, 17, 18), 2);
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 14, -12); g.quadraticCurveTo(s * 8, -16, s * 3, -10); g.lineTo(s * 5, -8); g.quadraticCurveTo(s * 9, -12, s * 14, -9); g.closePath(); paint(g, band, 1); ell(g, s * 7, -4, 2.8, 2.2); paint(g, '#fffaf0', 1.2); circ(g, s * 7, -4, 1.2); g.fillStyle = INK; g.fill(); }
      g.beginPath(); g.moveTo(-3, -2); g.quadraticCurveTo(10, 0, 25, 10); g.quadraticCurveTo(24, 14, 20, 13); g.quadraticCurveTo(8, 8, -3, 6); g.closePath(); paint(g, vol(g, main, -3, -2, 25, 14, 0.4, 0.25), 1.8);
      g.beginPath(); g.moveTo(-8, 11); g.quadraticCurveTo(0, 15, 6, 12); stroke(g, INK, 1.6);
      circ(g, 0, -16, 3); paint(g, acc, 1.4);
      shine(g, -9, -12, 3.5, 1.8, -0.4, 0.6); shine(g, 12, 5, 4, 1.2, 0.5, 0.6);
      break;
    }
    case 'crown': {
      g.beginPath(); g.moveTo(-20, 12); g.lineTo(-22, -8); g.lineTo(-11, 0); g.lineTo(0, -16); g.lineTo(11, 0); g.lineTo(22, -8); g.lineTo(20, 12); g.quadraticCurveTo(0, 17, -20, 12); g.closePath();
      paint(g, vol(g, main, -22, -16, 22, 14, 0.55, 0.3), 2);
      for (const [x, y] of [[-22, -9], [0, -17], [22, -9]]) {
        // paw-shaped points
        circ(g, x, y - 1, 3.4); paint(g, volR(g, main, x, y - 1, 3.4), 1.4);
        for (const [dx, dy] of [[-3.5, -3.8], [0, -5.2], [3.5, -3.8]]) { circ(g, x + dx, y + dy - 1, 1.5); paint(g, main, 1); }
      }
      rr(g, -20, 5, 40, 6, 3); paint(g, vol(g, D(main, 0.1), -20, 5, 20, 11), 1.5);
      for (const [x, c] of [[-11, acc], [0, band], [11, acc]]) { ell(g, x, 8, 2.8, 2.4); paint(g, volR(g, c, x, 8, 2.8), 1.2); shine(g, x - 0.8, 7.2, 0.9, 0.6, 0, 0.9); }
      shine(g, -12, -2, 3, 1.5, -0.8, 0.6);
      break;
    }
    default: drawHat(g, 'straw', cols);
  }
}

// ================================================================== outfits
function garmentPath(g, o = {}) {
  const sh = o.sh ?? 13, sw = o.sw ?? 27, hem = o.hem ?? 22, bw = o.bw ?? 15, sl = o.sl ?? 12;
  g.beginPath();
  g.moveTo(-6, -19);
  g.lineTo(-sh, -17); g.quadraticCurveTo(-sw + 2, -14, -sw, -2); g.lineTo(-sw + 1, sl - 8);
  g.quadraticCurveTo(-sw + 6, sl - 6, -bw - 2, sl - 8);
  g.lineTo(-bw, hem); g.quadraticCurveTo(0, hem + 3, bw, hem);
  g.lineTo(bw + 2, sl - 8); g.quadraticCurveTo(sw - 6, sl - 6, sw - 1, sl - 8);
  g.lineTo(sw, -2); g.quadraticCurveTo(sw - 2, -14, sh, -17); g.lineTo(6, -19);
  g.quadraticCurveTo(0, -14, -6, -19); g.closePath();
}
function drawOutfit(g, v, cols) {
  const [main, trim, acc] = cols;
  shadow(g, 26, 18, 3.4);
  const fillG = vol(g, main, -26, -20, 26, 24, 0.4, 0.3);
  if (v === 'poncho') {
    g.beginPath(); g.moveTo(0, -24); g.bezierCurveTo(-10, -24, -12, -16, -10, -12); g.quadraticCurveTo(-26, 4, -26, 18); g.quadraticCurveTo(0, 26, 26, 18); g.quadraticCurveTo(26, 4, 10, -12); g.bezierCurveTo(12, -16, 10, -24, 0, -24); g.closePath();
    paint(g, fillG, 2);
    ell(g, 0, -13, 7, 6); paint(g, vol(g, D(main, 0.2), -7, -19, 7, -7), 1.6); ell(g, 0, -12, 4.5, 4); g.fillStyle = D(main, 0.45); g.fill();
    g.strokeStyle = hexA(D(main, 0.3), 0.7); g.lineWidth = 1.2; for (const x of [-12, 12]) { g.beginPath(); g.moveTo(x * 0.6, -6); g.quadraticCurveTo(x, 8, x * 1.3, 20); g.stroke(); }
    for (const y of [-2, 6, 14]) { circ(g, 0, y, 1.8); paint(g, trim, 1.1); }
    shine(g, -12, 0, 3, 7, 0.5, 0.45);
    return;
  }
  const armorish = v === 'samurai' || v === 'oni';
  garmentPath(g, v === 'sweater' ? { hem: 20, sl: 14 } : v === 'happi' ? { hem: 17, sl: 10 } : v === 'kimono' || v === 'yukata' ? { hem: 24, sl: 18, sw: 29 } : {});
  paint(g, fillG, 2);
  g.save(); g.clip();
  switch (v) {
    case 'sweater': {
      g.strokeStyle = hexA(D(main, 0.25), 0.55); g.lineWidth = 1.2;
      for (let x = -24; x <= 24; x += 4) { g.beginPath(); g.moveTo(x, -18); g.lineTo(x, 26); g.stroke(); }
      g.fillStyle = trim; g.fillRect(-30, 15, 60, 8); g.fillRect(-30, 0, 9, 8); g.fillRect(21, 0, 9, 8);
      heartPath(g, 0, 2, 6); paint(g, volR(g, acc, 0, 1, 7), 1.4);
      break;
    }
    case 'happi': case 'haori': case 'gi': case 'ninja': case 'kimono': case 'yukata': {
      if (v === 'kimono') { g.strokeStyle = hexA(trim, 0.6); g.lineWidth = 1.4; for (const [x, y] of [[-14, 10], [12, 0], [-4, -6], [16, 16]]) { g.beginPath(); g.arc(x, y, 4, 0, 4.5); g.stroke(); g.beginPath(); g.arc(x + 2, y + 1, 1.8, 3, 7); g.stroke(); } }
      if (v === 'yukata') { for (const [x, y, r] of [[-15, 8, 2.6], [13, -2, 2], [-6, -8, 1.6], [10, 16, 2.4], [-20, -5, 1.6], [20, 8, 1.8]]) { starPath(g, x, y, r + 1, (r + 1) * 0.45); g.fillStyle = trim; g.fill(); } }
      if (v === 'haori') { g.fillStyle = hexA(D(main, 0.2), 0.35); for (let x = -26; x < 26; x += 6) for (let y = -20; y < 26; y += 6) { g.beginPath(); g.moveTo(x, y + 3); g.lineTo(x + 3, y); g.lineTo(x + 6, y + 3); g.lineTo(x + 3, y + 6); g.fill(); } }
      if (v === 'ninja') { g.fillStyle = hexA(L(main, 0.3), 0.25); g.fillRect(-30, -2, 60, 3); }
      // overlapping collar
      g.beginPath(); g.moveTo(-6, -19); g.lineTo(5, 6); g.lineTo(9, 6); g.lineTo(-2, -19); g.closePath(); g.fillStyle = trim; g.fill(); stroke(g, INK, 1.3);
      g.beginPath(); g.moveTo(6, -19); g.lineTo(-3, 2); g.lineTo(1, 4); g.lineTo(10, -19); g.closePath(); g.fillStyle = trim; g.fill(); stroke(g, INK, 1.3);
      if (v === 'happi') { g.fillStyle = trim; g.fillRect(-30, 14, 60, 3); circ(g, 12, -4, 4.2); paint(g, acc, 1.2); circ(g, 12, -4, 2); g.fillStyle = trim; g.fill(); }
      // belt / obi
      const beltC = v === 'gi' ? trim : v === 'ninja' ? acc : v === 'kimono' || v === 'yukata' ? trim : v === 'haori' ? acc : trim;
      if (v !== 'happi') { g.fillStyle = vol(g, beltC, -20, 6, 20, 13); g.fillRect(-30, 6, 60, v === 'kimono' || v === 'yukata' ? 8 : 5); g.strokeStyle = INK; g.lineWidth = 1.3; g.strokeRect(-30, 6, 60, v === 'kimono' || v === 'yukata' ? 8 : 5); }
      break;
    }
    case 'samurai': case 'oni': {
      for (let i = 0; i < 4; i++) { const y = 4 + i * 5; g.fillStyle = vol(g, i % 2 ? D(main, 0.12) : main, -20, y, 20, y + 5); g.fillRect(-30, y, 60, 5); g.strokeStyle = INK; g.lineWidth = 1.1; g.strokeRect(-30, y, 60, 5); g.fillStyle = trim; for (let x = -18; x < 20; x += 6) { circ(g, x, y + 2.5, 0.9); g.fill(); } }
      g.fillStyle = vol(g, trim, -12, -18, 12, 4); rr(g, -12, -16, 24, 18, 5); g.fill(); stroke(g, INK, 1.4);
      if (v === 'oni') { for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 3, -10); g.quadraticCurveTo(s * 7, -16, s * 8, -12); g.lineTo(s * 5, -7); g.closePath(); paint(g, acc, 1.1); } circ(g, 0, -4, 3.5); paint(g, volR(g, acc, 0, -4, 3.5), 1.2); }
      else { roundStar(g, 0, -7, 5, 2.8, 5); paint(g, volR(g, acc, 0, -7, 5), 1.1); }
      // shoulder plates
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 12, -18); g.quadraticCurveTo(s * 28, -16, s * 29, 0); g.lineTo(s * 20, 2); g.quadraticCurveTo(s * 20, -10, s * 10, -14); g.closePath(); paint(g, vol(g, main, s * 10, -18, s * 29, 2), 1.5); }
      break;
    }
    default: break;
  }
  g.restore();
  garmentPath(g, v === 'sweater' ? { hem: 20, sl: 14 } : v === 'happi' ? { hem: 17, sl: 10 } : v === 'kimono' || v === 'yukata' ? { hem: 24, sl: 18, sw: 29 } : {});
  stroke(g, INK, 2);
  if (v === 'ninja') { g.beginPath(); g.moveTo(-10, -18); g.quadraticCurveTo(0, -12, 10, -18); g.quadraticCurveTo(12, -13, 16, -8); g.lineTo(19, 4); g.lineTo(13, 2); g.lineTo(11, -10); g.quadraticCurveTo(0, -6, -10, -12); g.closePath(); paint(g, vol(g, trim, -10, -18, 19, 4), 1.5); }
  if (v === 'gi' || v === 'kimono' || v === 'yukata') { g.save(); g.translate(8, 10); ell(g, -2, 0, 4, 2.4, -0.4); paint(g, trim, 1.2); ell(g, 3, 5, 2, 5, 0.3); paint(g, trim, 1.2); g.restore(); }
  shine(g, -14, -8, 3, 6, 0.6, armorish ? 0.55 : 0.4);
}

// ================================================================== collars
function drawCollar(g, v, cols) {
  const [bandC, tag, acc] = cols;
  shadow(g, 25, 16, 3.2);
  // back half of the ring
  g.save(); g.translate(0, -6);
  const RX = 20, RY = 10;
  if (v === 'rope') {
    g.beginPath(); g.ellipse(0, 0, RX, RY, 0, Math.PI, TAU); stroke(g, INK, 8); g.beginPath(); g.ellipse(0, 0, RX, RY, 0, Math.PI, TAU); stroke(g, D(bandC, 0.15), 5.5);
  } else {
    g.beginPath(); g.ellipse(0, 0, RX, RY, 0, Math.PI, TAU); stroke(g, INK, 8.5); g.beginPath(); g.ellipse(0, 0, RX, RY, 0, Math.PI, TAU); stroke(g, D(bandC, 0.25), 5.5);
  }
  // front half
  g.beginPath(); g.ellipse(0, 0, RX, RY, 0, 0, Math.PI); stroke(g, INK, 9.5);
  g.beginPath(); g.ellipse(0, 0, RX, RY, 0, 0, Math.PI); stroke(g, bandC, 6.5);
  g.beginPath(); g.ellipse(0, -1.4, RX, RY, 0, 0.3, Math.PI - 0.3); stroke(g, hexA(L(bandC, 0.5), 0.9), 1.5);
  if (v === 'rope') {
    g.strokeStyle = hexA(D(bandC, 0.4), 0.8); g.lineWidth = 1.2;
    for (let a = 0.15; a < Math.PI; a += 0.32) { const x = Math.cos(a) * RX, y = Math.sin(a) * RY; g.beginPath(); g.moveTo(x - 2, y - 3); g.lineTo(x + 2, y + 3); g.stroke(); }
  }
  if (v === 'bone' || v === 'star' || v === 'moon') { g.fillStyle = hexA(L(bandC, 0.3), 0.9); for (const a of [0.5, 1.1, 2.0, 2.6]) { circ(g, Math.cos(a) * RX, Math.sin(a) * RY, 1.1); g.fill(); } }
  if (v === 'jewel') for (const a of [0.45, 1.0, 2.1, 2.7]) { const x = Math.cos(a) * RX, y = Math.sin(a) * RY; ell(g, x, y, 2.2, 2); paint(g, volR(g, a < 1.5 ? acc : tag, x, y, 2.2), 1); }
  g.restore();
  // tag / charm hanging at bottom
  const ty = 11;
  circ(g, 0, ty - 5.5, 2.2); stroke(g, INK, 2.4); circ(g, 0, ty - 5.5, 2.2); stroke(g, '#d8b060', 1.2);
  switch (v) {
    case 'bone': drawBone(g, 0, ty + 3, 14, 2.6, 3.2, 0, tag, 1.6); break;
    case 'bell': {
      circ(g, 0, ty + 4, 7); paint(g, volR(g, tag, 0, ty + 4, 7, 0.6, 0.3), 1.8);
      g.beginPath(); g.moveTo(-6.6, ty + 2.4); g.lineTo(6.6, ty + 2.4); stroke(g, D(tag, 0.35), 1.3);
      circ(g, 0, ty + 7, 1.5); g.fillStyle = INK; g.fill(); g.beginPath(); g.moveTo(0, ty + 7.5); g.lineTo(0, ty + 10.5); stroke(g, INK, 1.4);
      shine(g, -2.5, ty + 1, 2, 1.2, -0.5, 0.9); break;
    }
    case 'jewel': heartPath(g, 0, ty + 3, 6.5); paint(g, vol(g, tag, -6, ty - 3, 6, ty + 9, 0.6, 0.3), 1.7); shine(g, -2.5, ty + 1, 1.8, 1, -0.6, 0.9); sparkle(g, 3, ty + 1, 2, '#ffffff'); break;
    case 'rope': {
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 2, ty - 4); g.lineTo(s * 7, ty); g.lineTo(s * 3, ty + 2); g.lineTo(s * 8, ty + 7); g.lineTo(s * 4, ty + 8); g.lineTo(s * 8, ty + 13); g.lineTo(s * 2.5, ty + 10); g.lineTo(s * 1, ty + 2); g.closePath(); paint(g, lin(g, 0, ty - 4, 0, ty + 13, [[0, '#ffffff'], [1, '#e8e0d0']]), 1.3); }
      circ(g, 0, ty - 3, 2.6); paint(g, acc, 1.3); break;
    }
    case 'star': roundStar(g, 0, ty + 3.5, 8.5, 4.2, 5); paint(g, volR(g, tag, 0, ty + 3, 8.5, 0.6, 0.3), 1.8); shine(g, -2.5, ty + 1, 1.6, 1, -0.5, 0.9); break;
    case 'moon': {
      glow(g, 0, ty + 3, 13, acc, 0.6);
      g.beginPath(); g.arc(0, ty + 3, 7.5, 0.9, TAU - 0.9); g.arc(3.8, ty + 1, 6.2, TAU - 1.25, 1.25, true); g.closePath(); paint(g, vol(g, tag, -7, ty - 4, 7, ty + 10, 0.5, 0.2), 1.7);
      sparkle(g, 6, ty + 6, 2.2, '#ffffff'); break;
    }
    default: circ(g, 0, ty + 3, 5); paint(g, tag, 1.5);
  }
}

// ================================================================== charms
function cord(g, x, y0, y1, col) { g.beginPath(); g.moveTo(x, y0); g.bezierCurveTo(x - 6, y0 - 8, x + 6, y0 - 12, x, y1); stroke(g, INK, 3); g.beginPath(); g.moveTo(x, y0); g.bezierCurveTo(x - 6, y0 - 8, x + 6, y0 - 12, x, y1); stroke(g, col, 1.6); }
function drawCharm(g, v, cols) {
  const [main, cordC, acc] = cols;
  shadow(g, 25, 14, 3);
  switch (v) {
    case 'omamori': case 'onigiri': {
      if (v === 'onigiri') {
        cord(g, 0, -12, -26, cordC === '#2c3a2a' ? acc : cordC);
        g.beginPath(); g.moveTo(0, -16); g.bezierCurveTo(8, -16, 20, 8, 17, 14); g.bezierCurveTo(14, 20, -14, 20, -17, 14); g.bezierCurveTo(-20, 8, -8, -16, 0, -16); g.closePath();
        paint(g, vol(g, main, -18, -16, 18, 20, 0.3, 0.12), 2);
        rr(g, -9, 5, 18, 14, 3); paint(g, vol(g, cordC, -9, 5, 9, 19, 0.3, 0.2), 1.6);
        for (const s of [-1, 1]) { circ(g, s * 5, -1, 1.2); g.fillStyle = INK; g.fill(); ell(g, s * 8.5, 2, 2.2, 1.3); g.fillStyle = '#ffb0c0'; g.fill(); }
        g.beginPath(); g.arc(0, 0.5, 2, 0.3, Math.PI - 0.3); stroke(g, INK, 1.2);
        shine(g, -7, -8, 3, 1.6, -0.8, 0.8);
        return;
      }
      cord(g, 0, -15, -27, cordC);
      g.beginPath(); g.moveTo(-11, -12); g.quadraticCurveTo(0, -18, 11, -12); g.lineTo(13, 16); g.quadraticCurveTo(0, 21, -13, 16); g.closePath();
      paint(g, vol(g, main, -13, -16, 13, 20, 0.45, 0.3), 2);
      g.save(); g.clip(); g.strokeStyle = hexA(L(main, 0.35), 0.6); g.lineWidth = 1; for (let i = -3; i <= 3; i++) { g.beginPath(); g.arc(i * 7, 16, 5, Math.PI, TAU); g.stroke(); g.beginPath(); g.arc(i * 7 + 3.5, 10, 5, Math.PI, TAU); g.stroke(); } g.restore();
      rr(g, -7, -8, 14, 16, 2.5); paint(g, vol(g, acc, -7, -8, 7, 8, 0.3, 0.12), 1.4);
      g.strokeStyle = cordC; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-3, -4); g.lineTo(3, -4); g.moveTo(0, -5); g.lineTo(0, 5); g.moveTo(-3, 1); g.lineTo(3, 1); g.stroke();
      // knot
      for (const s of [-1, 1]) { ell(g, s * 4, -14, 4, 2.5, s * 0.4); paint(g, cordC, 1.3); }
      circ(g, 0, -14, 2.4); paint(g, D(cordC, 0.1), 1.2);
      shine(g, -8, -3, 2, 5, 0.2, 0.45);
      break;
    }
    case 'paw': {
      circ(g, 0, -20, 3.2); stroke(g, INK, 3.2); circ(g, 0, -20, 3.2); stroke(g, cordC, 1.6);
      ell(g, 0, 6, 11, 9.5); paint(g, volR(g, main, 0, 6, 11), 2);
      for (const [x, y, r] of [[-12, -6, 4.4], [-4.5, -12, 4.6], [4.5, -12, 4.6], [12, -6, 4.4]]) { ell(g, x, y, r, r * 1.12); paint(g, volR(g, main, x, y, r), 1.8); shine(g, x - 1.2, y - 1.6, 1.3, 0.8, -0.5, 0.8); }
      shine(g, -4, 2, 4, 2.2, -0.4, 0.7);
      heartPath(g, 0, 7, 3.4); g.fillStyle = hexA(acc, 0.9); g.fill();
      break;
    }
    case 'cat': {
      // maneki-neko
      g.save(); g.translate(0, 3);
      ell(g, 0, 10, 14, 11); paint(g, volR(g, main, 0, 8, 14, 0.2, 0.18), 2);
      g.beginPath(); g.moveTo(9, 2); g.quadraticCurveTo(16, -6, 13, -16); g.quadraticCurveTo(18, -18, 19, -13); g.quadraticCurveTo(21, -2, 13, 6); g.closePath(); paint(g, vol(g, main, 9, -18, 21, 6, 0.2, 0.2), 1.8);
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 5, -14); g.lineTo(s * 12, -24); g.lineTo(s * 13, -10); g.closePath(); paint(g, main, 1.8); g.beginPath(); g.moveTo(s * 7, -14); g.lineTo(s * 11.5, -20.5); g.lineTo(s * 11.5, -12); g.closePath(); g.fillStyle = '#ffb0c0'; g.fill(); }
      ell(g, 0, -8, 13, 11); paint(g, volR(g, main, 0, -9, 13, 0.25, 0.15), 2);
      for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 5, -9, 2.2, Math.PI * 1.1, Math.PI * 1.9); stroke(g, INK, 1.5); ell(g, s * 8.5, -5, 2.4, 1.4); g.fillStyle = '#ffb0c0'; g.fill(); }
      g.beginPath(); g.moveTo(-1.5, -5); g.quadraticCurveTo(0, -3.4, 1.5, -5); stroke(g, INK, 1.1);
      g.beginPath(); g.moveTo(-9, 1); g.quadraticCurveTo(0, 5, 9, 1); stroke(g, INK, 3.6); g.beginPath(); g.moveTo(-9, 1); g.quadraticCurveTo(0, 5, 9, 1); stroke(g, cordC, 2.4);
      circ(g, 0, 5.5, 3); paint(g, volR(g, acc, 0, 5.5, 3), 1.3);
      ell(g, -6, 12, 4, 3); paint(g, main, 1.4);
      g.restore();
      break;
    }
    case 'daruma': {
      g.beginPath(); g.moveTo(0, -20); g.bezierCurveTo(18, -20, 19, 18, 0, 20); g.bezierCurveTo(-19, 18, -18, -20, 0, -20); g.closePath();
      paint(g, volR(g, main, 0, 0, 20, 0.45, 0.3), 2);
      ell(g, 0, -4, 10, 8.5); paint(g, vol(g, cordC, -10, -12, 10, 4, 0.3, 0.12), 1.6);
      for (const s of [-1, 1]) { circ(g, s * 4.4, -5, 2.8); paint(g, '#ffffff', 1.2); if (s < 0) { circ(g, s * 4.4, -5, 1.4); g.fillStyle = INK; g.fill(); } g.beginPath(); g.moveTo(s * 2, -10.5); g.quadraticCurveTo(s * 5, -12.5, s * 8, -10); stroke(g, INK, 1.8); }
      g.beginPath(); g.moveTo(-3, 0); g.quadraticCurveTo(0, 1.6, 3, 0); stroke(g, INK, 1.2);
      g.strokeStyle = acc; g.lineWidth = 1.8; g.beginPath(); g.moveTo(-6, 9); g.quadraticCurveTo(-2, 6, 0, 10); g.quadraticCurveTo(2, 14, 6, 10); g.stroke();
      shine(g, -10, -10, 2.4, 5, 0.4, 0.55);
      break;
    }
    case 'magatama': {
      glow(g, 0, 0, 24, acc, 0.4);
      cord(g, 4, -12, -26, cordC);
      g.beginPath(); g.moveTo(-11, 21);
      g.quadraticCurveTo(-17, 6, -7, -4);
      g.arc(3, -4, 10, Math.PI, Math.PI * 2.5);
      g.quadraticCurveTo(-4, 8, -11, 21);
      g.closePath();
      paint(g, vol(g, main, -14, -14, 13, 20, 0.5, 0.3), 2);
      circ(g, 4, -6, 3.2); paint(g, '#fffaf0', 1.4);
      shine(g, -2, -9, 3.5, 2, -0.6, 0.8); sparkle(g, 9, 1, 2.2, '#ffffff');
      break;
    }
    case 'moon': {
      glow(g, 0, 0, 26, acc, 0.55);
      cord(g, 6, -15, -27, cordC);
      g.beginPath(); g.arc(0, 2, 17, 0.75, TAU - 0.75); g.arc(9, -3, 14, TAU - 1.05, 1.05, true); g.closePath();
      paint(g, vol(g, main, -17, -15, 12, 19, 0.5, 0.25), 2);
      for (const [x, y, r] of [[-8, -2, 2.4], [-4, 9, 1.6], [-11, 6, 1.2]]) { circ(g, x, y, r); g.fillStyle = hexA(D(main, 0.25), 0.6); g.fill(); }
      sparkle(g, 12, 8, 3, '#ffffff'); sparkle(g, 15, -5, 2, '#fff6c0');
      break;
    }
    default: drawCharm(g, 'omamori', cols);
  }
}

// ================================================================== boots & paws (drawn as a cute pair)
function pair(g, draw) {
  g.save(); g.translate(-8, -1); g.rotate(-0.12); g.scale(0.92, 0.92); draw(g, true); g.restore();
  g.save(); g.translate(7, 3); g.rotate(0.06); draw(g, false); g.restore();
}
function bootShape(g, h = 14, toe = 10) {
  g.beginPath();
  g.moveTo(-8, -h); g.lineTo(6, -h); g.lineTo(6, 2); g.quadraticCurveTo(6 + toe, 1, 6 + toe, 8); g.quadraticCurveTo(6 + toe, 12, 2, 12);
  g.lineTo(-7, 12); g.quadraticCurveTo(-10, 12, -10, 8); g.closePath();
}
function drawBoots(g, v, cols) {
  const [main, sole, acc] = cols;
  shadow(g, 21, 21, 3.4);
  pair(g, (g, back) => {
    switch (v) {
      case 'booties': {
        bootShape(g, 8, 9); paint(g, vol(g, main, -10, -8, 15, 12), 2);
        rr(g, -11, -12, 18, 7, 3.5); paint(g, vol(g, sole, -11, -12, 7, -5, 0.2, 0.15), 1.8);
        for (const x of [-8, -4, 0, 4]) { circ(g, x, -12, 2); g.fillStyle = sole; g.fill(); }
        heartPath(g, 3, 3, 3); g.fillStyle = acc; g.fill();
        break;
      }
      case 'rain': case 'sneaker': case 'tabi': {
        bootShape(g, v === 'sneaker' ? 5 : 14, v === 'sneaker' ? 10 : 9); paint(g, vol(g, main, -10, -14, 15, 12), 2);
        rr(g, -10.5, 8.5, 26, 4.5, 2.2); paint(g, vol(g, sole, -10, 8, 16, 13, 0.3, 0.25), 1.6);
        if (v === 'rain') { g.beginPath(); g.moveTo(6, 2.5); g.quadraticCurveTo(15, 2, 15.5, 8.5); g.lineTo(6, 8.5); g.closePath(); paint(g, acc, 1.3); rr(g, -9, -15, 16, 4, 2); paint(g, vol(g, sole, -9, -15, 7, -11), 1.5); }
        if (v === 'sneaker') { g.beginPath(); g.moveTo(-8, 4); g.quadraticCurveTo(0, -2, 10, 5); stroke(g, acc, 2.6); starPath(g, -3, 1, 2.8, 1.3); g.fillStyle = '#ffcf4a'; g.fill(); g.strokeStyle = '#fffaf0'; g.lineWidth = 1.2; for (const x of [-4, 0, 4]) { g.beginPath(); g.moveTo(x - 1.5, -4); g.lineTo(x + 1.5, -2); g.stroke(); } }
        if (v === 'tabi') { g.beginPath(); g.moveTo(9, 3); g.lineTo(9, 9); stroke(g, INK, 1.4); g.strokeStyle = acc; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-9, -8); g.lineTo(5, -8); g.stroke(); for (let y = -12; y < 2; y += 3.5) { circ(g, 5.5, y, 0.8); g.fillStyle = '#d9d0c8'; g.fill(); } }
        break;
      }
      case 'waraji': case 'geta': case 'cloud': {
        // sole + straps, seen at 3/4
        if (v === 'cloud') {
          for (const [x, y, r] of [[-8, 6, 5], [0, 7, 6], [9, 6, 5], [15, 7, 3.6], [-13, 7, 3.6]]) { circ(g, x, y, r); paint(g, volR(g, main, x, y, r, 0.1, 0.12), 1.6); }
          for (const [x, y, r] of [[-8, 6, 5], [0, 7, 6], [9, 6, 5]]) { circ(g, x, y, r - 1.6); g.fillStyle = main; g.fill(); }
          ell(g, 1, 0.5, 15, 4.5); paint(g, vol(g, sole, -14, -4, 16, 5, 0.4, 0.2), 1.6);
        } else if (v === 'geta') {
          for (const x of [-8, 7]) { rr(g, x - 2.5, 2, 5, 9, 1.5); paint(g, vol(g, D(main, 0.15), x - 2, 2, x + 2, 11), 1.5); }
          rr(g, -14, -3, 29, 6.5, 3); paint(g, vol(g, main, -14, -3, 15, 3.5, 0.45, 0.25), 1.8);
        } else {
          ell(g, 1, 3, 16, 5.5); paint(g, vol(g, main, -15, -2, 17, 8, 0.4, 0.25), 1.8);
          g.save(); ell(g, 1, 3, 16, 5.5); g.clip(); g.strokeStyle = hexA(D(main, 0.35), 0.6); g.lineWidth = 0.9; for (let x = -16; x < 18; x += 2.6) { g.beginPath(); g.moveTo(x, -3); g.lineTo(x + 1, 9); g.stroke(); } g.restore();
        }
        const strap = v === 'cloud' ? acc : v === 'geta' ? acc : acc;
        g.beginPath(); g.moveTo(-8, 0); g.quadraticCurveTo(2, -12, 12, 0); stroke(g, INK, 4.4); g.beginPath(); g.moveTo(-8, 0); g.quadraticCurveTo(2, -12, 12, 0); stroke(g, strap, 2.6);
        g.beginPath(); g.moveTo(2, -6); g.lineTo(5, 1); stroke(g, INK, 3.6); g.beginPath(); g.moveTo(2, -6); g.lineTo(5, 1); stroke(g, strap, 1.8);
        if (v === 'cloud' && !back) sparkle(g, 14, -8, 3, '#fff6c0');
        break;
      }
      default: bootShape(g); paint(g, main, 2);
    }
    if (v !== 'waraji' && v !== 'geta' && v !== 'cloud') shine(g, -4, -5, 1.8, 4, 0.2, 0.55);
  });
}
function mittenShape(g, big = 1) {
  g.beginPath();
  g.moveTo(-8 * big, 8); g.lineTo(-9 * big, -4);
  g.bezierCurveTo(-10 * big, -16, 8 * big, -18, 8.5 * big, -4);
  g.lineTo(8.5 * big, 2);
  g.bezierCurveTo(14 * big, 0, 15 * big, 6, 9 * big, 8);
  g.closePath();
}
function drawPaws(g, v, cols) {
  const [main, cuff, acc] = cols;
  shadow(g, 23, 20, 3.4);
  pair(g, (g) => {
    const big = v === 'boxing' ? 1.12 : v === 'oven' ? 1.08 : 1;
    if (v === 'claw' || v === 'gauntlet' || v === 'tekko') {
      mittenShape(g, 1); paint(g, vol(g, main, -10, -16, 14, 8), 2);
      if (v === 'tekko') {
        g.save(); mittenShape(g, 1); g.clip(); for (let i = 0; i < 3; i++) { rr(g, -10, -14 + i * 6, 20, 5.5, 2); paint(g, vol(g, i % 2 ? D(main, 0.12) : main, -10, -14, 10, 4), 1.2); } g.restore();
        mittenShape(g, 1); stroke(g, INK, 2);
        g.strokeStyle = cuff; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-6, -2); g.lineTo(6, 4); g.moveTo(6, -2); g.lineTo(-6, 4); g.stroke();
      }
      if (v === 'claw') for (let i = 0; i < 3; i++) { const x = -5 + i * 5; g.beginPath(); g.moveTo(x - 1.8, -12); g.quadraticCurveTo(x, -20, x + 3, -21); g.quadraticCurveTo(x + 1.5, -16, x + 1.8, -12); g.closePath(); paint(g, vol(g, cuff, x - 2, -21, x + 3, -12, 0.6, 0.2), 1.3); }
      if (v === 'gauntlet') { g.strokeStyle = cuff; g.lineWidth = 2; g.beginPath(); g.moveTo(-6, -8); g.quadraticCurveTo(-2, -4, -6, 0); g.moveTo(5, -9); g.quadraticCurveTo(1, -5, 5, -1); g.stroke(); circ(g, 0, -2, 2.4); paint(g, volR(g, acc, 0, -2, 2.4), 1.1); }
    } else {
      mittenShape(g, big); paint(g, vol(g, main, -10, -16, 14, 8), 2);
      if (v === 'oven') { g.save(); mittenShape(g, big); g.clip(); g.fillStyle = hexA(cuff, 0.35); for (let x = -12; x < 16; x += 5) for (let y = -18; y < 10; y += 5) if (((x + y) / 5) % 2 === 0) g.fillRect(x, y, 5, 5); g.restore(); mittenShape(g, big); stroke(g, INK, 2); }
      if (v === 'mitten') { heartPath(g, -0.5, -4, 3.6); g.fillStyle = hexA(cuff, 0.95); g.fill(); }
      if (v === 'glove') { g.strokeStyle = hexA(D(main, 0.3), 0.7); g.lineWidth = 1.1; for (const x of [-4, 0, 4]) { g.beginPath(); g.moveTo(x, -15); g.lineTo(x, -7); g.stroke(); } for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; circ(g, -1 + Math.cos(a) * 2.4, -1 + Math.sin(a) * 2.4, 1.7); g.fillStyle = '#fffaf0'; g.fill(); } circ(g, -1, -1, 1.3); g.fillStyle = acc; g.fill(); }
      if (v === 'boxing') { g.beginPath(); g.moveTo(-8, -6); g.quadraticCurveTo(0, -3, 8, -7); stroke(g, D(main, 0.3), 1.3); }
    }
    rr(g, -10, 6, 20, 7.5, 3); paint(g, vol(g, cuff, -10, 6, 10, 13, 0.3, 0.2), 1.8);
    if (v === 'mitten' || v === 'boxing') { g.strokeStyle = hexA('#000000', 0.1); g.lineWidth = 1.2; for (let x = -8; x < 10; x += 3) { g.beginPath(); g.moveTo(x, 6.5); g.lineTo(x, 13); g.stroke(); } }
    shine(g, -5, -9, 2.2, 3.6, 0.3, 0.6);
  });
}

// ================================================================== gems
function drawGem(g, type, tier, cols) {
  const [main, hi, lo] = cols;
  const s = [0.72, 0.9, 1.06][tier] || 0.9;
  shadow(g, 20 * s + 4, 14 * s, 3);
  if (tier === 2) glow(g, 0, 0, 28, main, 0.5);
  g.save(); g.scale(s, s);
  switch (type) {
    case 'ruby': {
      // faceted jerky strip
      g.save(); g.rotate(-0.35);
      g.beginPath(); g.moveTo(-18, -7); g.quadraticCurveTo(-9, -12, 0, -7); g.quadraticCurveTo(9, -2, 18, -7); g.lineTo(19, 6); g.quadraticCurveTo(9, 11, 0, 6); g.quadraticCurveTo(-9, 1, -18, 6); g.closePath();
      paint(g, vol(g, main, -18, -10, 18, 8, 0.45, 0.35), 2);
      g.strokeStyle = hexA(hi, 0.8); g.lineWidth = 1.1; g.beginPath(); g.moveTo(-18, -1); g.quadraticCurveTo(-9, -6, 0, -1); g.quadraticCurveTo(9, 4, 18, -1); g.stroke();
      g.strokeStyle = hexA(lo, 0.6); for (const x of [-10, 0, 10]) { g.beginPath(); g.moveTo(x, -8 + Math.sin(x) * 2); g.lineTo(x + 3, 6); g.stroke(); }
      shine(g, -9, -6, 4, 1.4, -0.3, 0.85);
      g.restore(); break;
    }
    case 'blueberry': {
      circ(g, 0, 2, 16); paint(g, volR(g, main, 0, 2, 16, 0.45, 0.4), 2);
      g.fillStyle = hexA(hi, 0.25); for (const [x, y] of [[-6, 6], [6, 8], [2, -2], [-8, -3]]) { circ(g, x, y, 3); g.fill(); }
      roundStar(g, 0, -12, 6.5, 3, 5); paint(g, vol(g, lo, -6, -18, 6, -6, 0.25, 0.2), 1.6);
      circ(g, 0, -12, 1.8); g.fillStyle = D(lo, 0.4); g.fill();
      shine(g, -6, -3, 4.5, 2.4, -0.6, 0.85); circ(g, 4, -4, 1); g.fillStyle = '#fff'; g.fill();
      break;
    }
    case 'lemon': {
      g.beginPath(); g.moveTo(-19, 0); g.quadraticCurveTo(-16, -14, 0, -14); g.quadraticCurveTo(16, -14, 19, 0); g.quadraticCurveTo(16, 14, 0, 14); g.quadraticCurveTo(-16, 14, -19, 0); g.closePath();
      paint(g, volR(g, main, 0, 0, 18, 0.55, 0.3), 2);
      circ(g, -20, 0, 2.6); paint(g, main, 1.5); circ(g, 20, 0, 2.6); paint(g, main, 1.5);
      g.fillStyle = hexA('#ffffff', 0.8); for (const [x, y] of [[-6, 5], [5, -6], [9, 5], [-2, -8], [-11, -2], [13, -1]]) { g.fillRect(x, y, 1.6, 1.6); }
      g.fillStyle = rad(g, 2, 2, 10, [[0, hexA(hi, 0.7)], [1, hexA(hi, 0)]]); circ(g, 2, 2, 10); g.fill();
      shine(g, -7, -6, 5, 2.2, -0.3, 0.85);
      break;
    }
    case 'cheese': {
      g.save(); for (const [x, y, r, a] of [[-10, -14, 5, 0.55], [-3, -19, 6, 0.5], [6, -15, 4.5, 0.45]]) { circ(g, x, y, r); g.fillStyle = hexA('#9ee05a', a); g.fill(); } g.restore();
      g.strokeStyle = hexA('#7ac04a', 0.9); g.lineWidth = 1.6; for (const x of [-10, -2, 6]) { g.beginPath(); g.moveTo(x, -8); g.bezierCurveTo(x - 4, -12, x + 4, -15, x, -21); g.stroke(); }
      g.beginPath(); g.moveTo(-19, 4); g.lineTo(15, -8); g.lineTo(19, 10); g.lineTo(-17, 14); g.closePath(); paint(g, vol(g, main, -19, -8, 19, 14, 0.35, 0.25), 2);
      g.beginPath(); g.moveTo(-19, 4); g.lineTo(15, -8); g.lineTo(17, 0); g.lineTo(-17, 8); g.closePath(); paint(g, vol(g, hi, -19, -8, 17, 8, 0.2, 0.1), 1.6);
      for (const [x, y, r] of [[-6, 11, 2.2], [6, 7, 1.8], [12, 12, 1.5], [-2, 2, 1.6], [7, -3, 1.3]]) { ell(g, x, y, r, r * 0.8); g.fillStyle = D(main, 0.25); g.fill(); }
      break;
    }
    case 'diamond': {
      glow(g, 0, 0, 22, '#bfe0ff', 0.5);
      g.save(); g.rotate(-0.4);
      bonePath(g, -11, 11, 5, 5.5);
      paint(g, lin(g, -16, -10, 16, 10, [[0, '#ffffff'], [0.35, main], [0.6, '#cfe6ff'], [1, lo]]), 2);
      g.save(); bonePath(g, -11, 11, 5, 5.5); g.clip(); g.strokeStyle = hexA('#ffffff', 0.9); g.lineWidth = 1; for (let x = -18; x < 20; x += 6) { g.beginPath(); g.moveTo(x, -12); g.lineTo(x + 8, 12); g.stroke(); } g.strokeStyle = hexA(lo, 0.5); for (let x = -16; x < 20; x += 6) { g.beginPath(); g.moveTo(x, 12); g.lineTo(x + 8, -12); g.stroke(); } g.restore();
      g.restore();
      sparkle(g, 9, -8, 4, '#ffffff'); sparkle(g, -12, 6, 2.6, '#ffffff');
      break;
    }
    case 'topaz': {
      const hexP = (r, x = 0, y = 0) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); };
      hexP(17); paint(g, vol(g, main, -17, -17, 17, 17, 0.5, 0.35), 2);
      g.save(); hexP(17); g.clip(); g.strokeStyle = hexA(lo, 0.55); g.lineWidth = 1.1;
      for (let row = -3; row <= 3; row++) for (let col = -3; col <= 3; col++) { hexP(3.4, col * 6 + (row % 2 ? 3 : 0), row * 5.2); g.stroke(); }
      g.restore();
      g.beginPath(); g.moveTo(-6, 12); g.quadraticCurveTo(-6, 20, -3, 21); g.quadraticCurveTo(0, 20, 0, 13); g.fillStyle = main; g.fill(); stroke(g, INK, 1.4);
      shine(g, -7, -8, 5, 2.4, -0.6, 0.8);
      break;
    }
    default: circ(g, 0, 0, 14); paint(g, main, 2);
  }
  if (tier === 0) { g.beginPath(); g.moveTo(6, -10); g.lineTo(2, -3); g.lineTo(6, 1); stroke(g, hexA(INK, 0.55), 1.2); }
  g.restore();
  if (tier === 2) { sparkle(g, -17, -14, 3.6, '#ffffff'); sparkle(g, 18, 14, 2.6, '#fff6c0'); }
}

// ================================================================== potions & materials
function drawPotion(g, key) {
  shadow(g, 23, 15, 3.2);
  if (key === 'heart') {
    g.save(); g.rotate(-0.12);
    heartPath(g, 0, 2, 17); paint(g, volR(g, '#e8a060', 0, 0, 20, 0.35, 0.3), 2);
    heartPath(g, 0, 1, 13.5); paint(g, vol(g, '#ff8fb0', -14, -12, 14, 14, 0.4, 0.2), 1.4);
    g.save(); heartPath(g, 0, 1, 13.5); g.clip(); g.strokeStyle = '#fff4f8'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-14, -2); for (let x = -14; x <= 14; x += 4) g.quadraticCurveTo(x + 1, x % 8 ? 2 : -4, x + 2, -1); g.stroke(); g.restore();
    for (const [x, y, c, r] of [[-6, -5, '#ffe070', 0.3], [5, -6, '#8fd0ff', -0.5], [-1, 7, '#8fe0c0', 0.8], [7, 3, '#ffffff', 0.2], [-8, 3, '#ffffff', 1.2]]) { g.save(); g.translate(x, y); g.rotate(r); rr(g, -1.8, -0.8, 3.6, 1.6, 0.8); g.fillStyle = c; g.fill(); g.restore(); }
    shine(g, -8, -8, 3.5, 1.8, -0.7, 0.8);
    g.restore();
    return;
  }
  if (key === 'rejuv') {
    ell(g, 0, 15, 19, 5.5); paint(g, vol(g, '#fffaf0', -19, 10, 19, 20, 0.2, 0.15), 1.8);
    g.beginPath(); g.moveTo(-15, 13); g.bezierCurveTo(-17, -6, -11, -18, 0, -18); g.bezierCurveTo(11, -18, 17, -6, 15, 13); g.quadraticCurveTo(0, 18, -15, 13); g.closePath();
    g.fillStyle = lin(g, -15, -18, 15, 15, [[0, 'rgba(230,200,255,0.95)'], [0.5, 'rgba(184,138,255,0.95)'], [1, 'rgba(110,60,190,0.95)']]); g.fill(); stroke(g, INK, 2);
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.2; for (const y of [-6, 2, 9]) { g.beginPath(); g.moveTo(-13, y); g.quadraticCurveTo(0, y + 3, 13, y); g.stroke(); }
    roundStar(g, 0, -1, 5.5, 2.6, 5); paint(g, '#fff6c0', 1.2);
    shine(g, -7, -9, 3, 5, 0.3, 0.8); circ(g, 6, -11, 1.4); g.fillStyle = '#fff'; g.fill();
    sparkle(g, 15, -15, 3.2, '#ffffff');
    return;
  }
  // zoom juice
  rr(g, -5, -24, 10, 7, 2.5); paint(g, vol(g, '#c98f5e', -5, -24, 5, -17), 1.6);
  g.beginPath(); g.moveTo(-5, -18); g.lineTo(5, -18); g.lineTo(5, -11); g.bezierCurveTo(16, -8, 17, 5, 15, 10); g.bezierCurveTo(12, 21, -12, 21, -15, 10); g.bezierCurveTo(-17, 5, -16, -8, -5, -11); g.closePath();
  g.fillStyle = 'rgba(230,246,255,0.9)'; g.fill();
  g.save(); g.clip(); g.fillStyle = lin(g, -15, -4, 15, 20, [[0, '#9ae4ff'], [0.6, '#3a9aff'], [1, '#2a5ad8']]); g.fillRect(-18, -3, 36, 26);
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-16, -3); g.quadraticCurveTo(-8, -6, 0, -3); g.quadraticCurveTo(8, 0, 16, -3); g.stroke();
  for (const [x, y, r] of [[-7, 8, 1.6], [5, 12, 1.2], [8, 3, 1], [-3, 14, 0.9]]) { circ(g, x, y, r); stroke(g, 'rgba(255,255,255,0.8)', 0.9); }
  g.restore();
  g.beginPath(); g.moveTo(-5, -18); g.lineTo(5, -18); g.lineTo(5, -11); g.bezierCurveTo(16, -8, 17, 5, 15, 10); g.bezierCurveTo(12, 21, -12, 21, -15, 10); g.bezierCurveTo(-17, 5, -16, -8, -5, -11); g.closePath(); stroke(g, INK, 2);
  g.beginPath(); g.moveTo(2, 0); g.lineTo(-3, 7); g.lineTo(1, 7); g.lineTo(-2, 14); g.lineTo(5, 5); g.lineTo(1, 5); g.lineTo(4, 0); g.closePath(); paint(g, '#ffe44a', 1.2);
  shine(g, -9, -2, 2.2, 6, 0.3, 0.75);
}
function drawMaterial(g, key) {
  shadow(g, 22, 17, 3.4);
  switch (key) {
    case 'wood': {
      g.save(); g.rotate(-0.25);
      rr(g, -20, -9, 32, 18, 7); paint(g, vol(g, '#b87a4a', -20, -9, 12, 9, 0.35, 0.3), 2);
      g.strokeStyle = hexA('#6b4a3a', 0.6); g.lineWidth = 1.1; for (const y of [-4, 1, 5]) { g.beginPath(); g.moveTo(-17, y); g.quadraticCurveTo(-4, y - 2, 8, y + 0.5); g.stroke(); }
      ell(g, 13, 0, 7, 9); paint(g, vol(g, '#f2d2a0', 6, -9, 20, 9, 0.3, 0.15), 2);
      g.strokeStyle = hexA('#b87a4a', 0.8); g.lineWidth = 1; for (const r of [2, 4, 6]) { ell(g, 13, 0, r * 0.75, r); g.stroke(); }
      g.restore();
      g.save(); g.translate(-8, -12); g.rotate(-0.8); ell(g, 3.6, 0, 5, 2.8); paint(g, vol(g, '#7cc45a', -1, -3, 8, 3), 1.4); g.beginPath(); g.moveTo(-1, 0); g.lineTo(7, 0); stroke(g, '#4f8f3a', 0.9); g.restore();
      break;
    }
    case 'stone': {
      ell(g, -6, 8, 13, 9); paint(g, volR(g, '#a89ca8', -6, 8, 13, 0.4, 0.3), 2);
      ell(g, 9, 10, 10, 7); paint(g, volR(g, '#d9d0c8', 9, 10, 10, 0.4, 0.3), 2);
      ell(g, 1, -6, 11, 8.5); paint(g, volR(g, '#c0b6c4', 1, -6, 11, 0.45, 0.3), 2);
      shine(g, -3, -10, 4, 1.8, -0.4, 0.7); shine(g, -10, 4, 3, 1.4, -0.4, 0.55);
      break;
    }
    case 'petal': {
      const petal = (x, y, rot, s, c) => { g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s); g.beginPath(); g.moveTo(0, 12); g.bezierCurveTo(-11, 4, -9, -10, -2, -12); g.lineTo(0, -8); g.lineTo(2, -12); g.bezierCurveTo(9, -10, 11, 4, 0, 12); g.closePath(); paint(g, vol(g, c, -9, -12, 9, 12, 0.5, 0.2), 1.8 / s); g.beginPath(); g.moveTo(0, 9); g.lineTo(0, -4); stroke(g, hexA('#e87aa0', 0.6), 1 / s); g.restore(); };
      petal(-9, 4, -0.7, 0.95, '#ffbcd6'); petal(9, 2, 0.6, 0.9, '#ffc8de'); petal(0, -6, 0.05, 1.05, '#ffb0cc');
      sparkle(g, 14, -13, 2.6, '#ffffff');
      break;
    }
    case 'crystal': {
      glow(g, 0, 0, 26, '#b8a0ff', 0.45);
      const cr = (x, y, w, h, rot, c) => { g.save(); g.translate(x, y); g.rotate(rot); g.beginPath(); g.moveTo(-w, 0); g.lineTo(-w, -h); g.lineTo(0, -h - w * 1.3); g.lineTo(w, -h); g.lineTo(w, 0); g.closePath(); paint(g, lin(g, -w, 0, w, 0, [[0, L(c, 0.5)], [0.5, c], [1, D(c, 0.3)]]), 1.8); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -h - w * 1.2); stroke(g, hexA('#ffffff', 0.6), 1); g.restore(); };
      cr(-9, 16, 4.5, 14, -0.4, '#a890ff'); cr(10, 16, 4.5, 12, 0.45, '#8fd0ff'); cr(0, 17, 6, 22, 0, '#c9a8ff');
      ell(g, 0, 17, 15, 3.5); paint(g, vol(g, '#a89ca8', -15, 14, 15, 21), 1.6);
      sparkle(g, 6, -12, 3.2, '#ffffff');
      break;
    }
    case 'bone': drawBone(g, 0, 2, 26, 4.2, 5.4, -0.45, '#fff6e0', 2); break;
    case 'mochi': {
      g.beginPath(); g.moveTo(-22, 18); g.lineTo(22, -18); stroke(g, INK, 4); g.beginPath(); g.moveTo(-22, 18); g.lineTo(22, -18); stroke(g, '#e0c080', 2.2);
      for (const [x, y, c] of [[-10, 8, '#8fe0a0'], [0, 0, '#fffaf0'], [10, -8, '#ffb0c8']]) { circ(g, x, y, 8.5); paint(g, volR(g, c, x, y, 8.5, 0.5, 0.2), 1.9); shine(g, x - 3, y - 3.5, 2.6, 1.4, -0.6, 0.85); }
      for (const s of [-1, 1]) { circ(g, s * 2.6, 0, 0.9); g.fillStyle = INK; g.fill(); } ell(g, 0, 2.4, 1.4, 0.9); g.fillStyle = '#ffb0c0'; g.fill();
      break;
    }
    case 'silk': {
      rr(g, -13, -16, 26, 6, 2.5); paint(g, vol(g, '#c98f5e', -13, -16, 13, -10), 1.8);
      rr(g, -13, 12, 26, 6, 2.5); paint(g, vol(g, '#c98f5e', -13, 12, 13, 18), 1.8);
      rr(g, -10, -11, 20, 24, 3); paint(g, vol(g, '#e8e0ff', -10, -11, 10, 13, 0.5, 0.25), 1.8);
      g.save(); rr(g, -10, -11, 20, 24, 3); g.clip(); g.strokeStyle = hexA('#b8a8e8', 0.7); g.lineWidth = 1; for (let y = -10; y < 14; y += 2.4) { g.beginPath(); g.moveTo(-10, y); g.lineTo(10, y + 1); g.stroke(); } g.restore();
      g.beginPath(); g.moveTo(10, 4); g.bezierCurveTo(20, 6, 16, 18, 24, 20); stroke(g, INK, 2.8); g.beginPath(); g.moveTo(10, 4); g.bezierCurveTo(20, 6, 16, 18, 24, 20); stroke(g, '#e8e0ff', 1.4);
      shine(g, -5, -4, 2, 6, 0.1, 0.7);
      break;
    }
    case 'lantern': {
      glow(g, 0, 2, 28, '#ffb04a', 0.7);
      g.beginPath(); g.moveTo(0, -24); g.lineTo(0, -18); stroke(g, INK, 1.6);
      rr(g, -7, -19, 14, 4, 1.5); paint(g, '#3a3a4a', 1.4); rr(g, -7, 15, 14, 4, 1.5); paint(g, '#3a3a4a', 1.4);
      ell(g, 0, -1, 15, 16.5); paint(g, rad(g, 0, 1, 17, [[0, '#fff8d0'], [0.45, '#ffc060'], [1, '#e8503a']]), 2);
      g.strokeStyle = hexA('#b8364a', 0.6); g.lineWidth = 1.1; for (const rx of [5, 10.5]) { ell(g, 0, -1, rx, 16.5); g.stroke(); } for (const y of [-9, -1, 7]) { g.beginPath(); g.moveTo(-14, y); g.quadraticCurveTo(0, y + 2, 14, y); g.stroke(); }
      g.beginPath(); g.moveTo(-2, 19); g.lineTo(-3, 25); g.moveTo(2, 19); g.lineTo(3, 25); g.moveTo(0, 19); g.lineTo(0, 26); stroke(g, '#e8503a', 1.5);
      sparkle(g, 15, -15, 3, '#fff6c0');
      break;
    }
    default: circ(g, 0, 0, 12); paint(g, '#cccccc', 2);
  }
}

// ================================================================== weapons: staffs (Moka)
// Drawn along +x then rotated −45° like the swords: butt bottom-left, head top-right. Variants: drift (driftwood crook),
// duck (duck-call horn), coral, star, sun, moon. colors = [wood, orb, accent].
function staffOrb(g, x, y, r, col) {
  glow(g, x, y, r * 2.4, col, 0.75);
  circ(g, x, y, r); paint(g, volR(g, col, x, y, r, 0.62, 0.38), 1.6);
  g.save(); circ(g, x, y, r - 0.6); g.clip();
  g.strokeStyle = hexA(L(col, 0.6), 0.7); g.lineWidth = 1; g.beginPath(); g.arc(x + r * 0.2, y + r * 0.3, r * 0.7, 3.6, 5.2); g.stroke();
  g.restore();
  shine(g, x - r * 0.35, y - r * 0.42, r * 0.34, r * 0.2, -0.6, 0.92);
  sparkle(g, x + r * 0.35, y + r * 0.25, r * 0.32, '#ffffff', 0.85);
}
function drawStaff(g, v, cols, noShadow) {
  const [wood = '#b89a74', orbC = '#5ce0d0', acc = '#4a8adf'] = cols || [];
  if (!noShadow) shadow(g, 25, 15, 3.2);
  g.save(); g.rotate(-Math.PI / 4); g.translate(-2, 1);
  const x0 = -27, x1 = 13;
  // shaft (a little wavy, driftwood-ish), knots, butt knob
  g.beginPath(); g.moveTo(x0, -2); g.quadraticCurveTo(-12, -3.6, 2, -2.3); g.quadraticCurveTo(8, -1.8, x1, -2.6); g.lineTo(x1, 2.4); g.quadraticCurveTo(8, 1.9, 2, 2.5); g.quadraticCurveTo(-12, 3.8, x0, 2.4); g.closePath();
  paint(g, lin(g, 0, -3.5, 0, 3.5, [[0, L(wood, 0.4)], [0.5, wood], [1, D(wood, 0.32)]]), 1.7);
  g.fillStyle = hexA(D(wood, 0.35), 0.85); ell(g, -17, 0.4, 1.5, 0.9); g.fill(); ell(g, -4, -0.6, 1.2, 0.8); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-24, -1.1); g.quadraticCurveTo(-12, -2.3, 8, -1.3); g.stroke();
  knob(g, x0 - 0.5, 0.2, 2.9, D(wood, 0.1), 1.5);
  // grip wrap
  g.save(); rr(g, -9, -3.4, 8, 6.8, 2); g.clip(); g.fillStyle = acc; g.fillRect(-10, -4, 10, 8); g.strokeStyle = L(acc, 0.45); g.lineWidth = 1.3; for (let x = -10; x < 2; x += 2.6) { g.beginPath(); g.moveTo(x, -4); g.lineTo(x + 3, 4); g.stroke(); } g.restore();
  rr(g, -9, -3.4, 8, 6.8, 2); stroke(g, INK, 1.4);
  const ox = 20, oy = -0.5;
  switch (v) {
    case 'duck': { // a duck-call horn with a little rubber duck charm
      g.beginPath(); g.moveTo(x1 - 1, -2.6); g.lineTo(24, -5.6); g.quadraticCurveTo(26.5, 0, 24, 5.6); g.lineTo(x1 - 1, 2.6); g.closePath(); paint(g, vol(g, L(wood, 0.1), x1, -6, 25, 6), 1.6);
      rr(g, 15.5, -3.6, 2.4, 7.2, 1); paint(g, acc, 1.2);
      staffOrb(g, 26.5, 0, 4.4, orbC);
      g.beginPath(); g.moveTo(16.5, 3); g.quadraticCurveTo(15, 8, 13.5, 10.5); stroke(g, INK, 1.2);
      circ(g, 13, 12.5, 2.6); paint(g, volR(g, '#ffd84a', 13, 12.5, 2.6), 1.1); circ(g, 13.6, 10.3, 1.6); paint(g, '#ffd84a', 1); g.beginPath(); g.moveTo(15, 10.3); g.lineTo(16.6, 10.8); g.lineTo(15, 11.3); g.fillStyle = '#ff9a3a'; g.fill();
      break;
    }
    case 'coral': { // branching coral cradling the orb
      g.strokeStyle = INK; g.lineCap = 'round';
      const br = [[x1, 0, 18, -6.5], [x1, 0, 18, 6.5], [16, -4.5, 22, -9], [16, 4.5, 22, 9], [18, -6.5, 25, -6], [18, 6.5, 25, 6]];
      for (const [a, b, c, d] of br) { g.lineWidth = 4.6; g.strokeStyle = INK; g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
      for (const [a, b, c, d] of br) { g.lineWidth = 2.6; g.strokeStyle = acc; g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
      staffOrb(g, ox + 1, oy + 0.5, 5.2, orbC);
      for (const [x, y] of [[22, -9], [22, 9], [25, -6], [25, 6]]) { circ(g, x, y, 1.6); paint(g, L(acc, 0.3), 1); }
      break;
    }
    case 'star': { // a golden star frame round the orb
      roundStar(g, ox + 1, oy, 11.5, 6.2, 5, 0); paint(g, volR(g, acc, ox + 1, oy, 11.5, 0.55, 0.3), 1.8);
      roundStar(g, ox + 1, oy, 7.5, 4.2, 5, 0); g.fillStyle = hexA(D(acc, 0.35), 0.9); g.fill();
      staffOrb(g, ox + 1, oy, 4.6, orbC);
      sparkle(g, 30, -8, 2.6, '#fffbe0'); sparkle(g, 12, -11, 2, '#fffbe0');
      break;
    }
    case 'sun': { // sunburst rays
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; g.beginPath(); g.moveTo(ox + 1 + Math.cos(a - 0.2) * 5.5, oy + Math.sin(a - 0.2) * 5.5); g.lineTo(ox + 1 + Math.cos(a) * (i % 2 ? 9.5 : 11.5), oy + Math.sin(a) * (i % 2 ? 9.5 : 11.5)); g.lineTo(ox + 1 + Math.cos(a + 0.2) * 5.5, oy + Math.sin(a + 0.2) * 5.5); g.closePath(); paint(g, vol(g, acc, ox - 10, -11, ox + 12, 11, 0.5, 0.25), 1.3); }
      staffOrb(g, ox + 1, oy, 6, orbC);
      break;
    }
    case 'moon': { // a crescent-moon crook
      g.beginPath(); g.arc(ox + 1, oy, 10, 1.9, TAU - 1.9 + TAU * 0, true); g.arc(ox + 4.5, oy, 7.2, TAU - 1.6, 1.6); g.closePath();
      g.beginPath(); g.arc(ox, oy, 10.5, Math.PI * 0.62, Math.PI * 1.38 + TAU, false); g.arc(ox - 2.8, oy, 8.2, Math.PI * 1.28, Math.PI * 0.72, true); g.closePath();
      paint(g, vol(g, acc, ox - 11, -11, ox + 4, 11, 0.55, 0.25), 1.7);
      staffOrb(g, ox + 3.5, oy, 5, orbC);
      sparkle(g, ox + 10, oy - 8, 2.2, '#ffffff');
      break;
    }
    default: { // drift: a driftwood crook with a blue ribbon
      g.beginPath(); g.moveTo(x1 - 1, 0); g.bezierCurveTo(21, -1, 27, -5, 25, -11); g.bezierCurveTo(23, -16, 15, -15, 14, -10);
      stroke(g, INK, 6.4); g.beginPath(); g.moveTo(x1 - 1, 0); g.bezierCurveTo(21, -1, 27, -5, 25, -11); g.bezierCurveTo(23, -16, 15, -15, 14, -10); stroke(g, wood, 3.8);
      g.beginPath(); g.moveTo(x1 - 1, -0.8); g.bezierCurveTo(20, -2, 25, -5.5, 24, -10.5); stroke(g, L(wood, 0.45), 1);
      staffOrb(g, 19.5, -7, 5.2, orbC);
      g.beginPath(); g.moveTo(13, 1); g.bezierCurveTo(11, 6, 15, 8, 12, 13); stroke(g, INK, 4); g.beginPath(); g.moveTo(13, 1); g.bezierCurveTo(11, 6, 15, 8, 12, 13); stroke(g, acc, 2.4);
      g.beginPath(); g.moveTo(14, 1.5); g.bezierCurveTo(17, 5, 15, 9, 18, 12); stroke(g, INK, 4); g.beginPath(); g.moveTo(14, 1.5); g.bezierCurveTo(17, 5, 15, 9, 18, 12); stroke(g, L(acc, 0.2), 2.4);
    }
  }
  g.restore();
}

// ================================================================== Moka's skill art
function waterOrbArt(g, x, y, r, col = '#5ce0d0') {
  glow(g, x, y, r * 1.9, col, 0.6);
  circ(g, x, y, r); paint(g, rad(g, x, y, r, [[0, L(col, 0.55)], [0.6, col], [1, D(col, 0.35)]], x - r * 0.35, y - r * 0.4), 1.8);
  g.save(); circ(g, x, y, r - 0.8); g.clip(); g.strokeStyle = hexA('#ffffff', 0.55); g.lineWidth = 1.2; g.beginPath(); g.arc(x + r * 0.3, y + r * 0.4, r * 0.8, 3.5, 5.3); g.stroke(); g.restore();
  shine(g, x - r * 0.35, y - r * 0.42, r * 0.34, r * 0.2, -0.6, 0.95); circ(g, x + r * 0.35, y - r * 0.5, r * 0.09); g.fillStyle = '#fff'; g.fill();
}
function drop(g, x, y, s, col = '#8ff0ff', rot = 0) {
  g.save(); g.translate(x, y); g.rotate(rot); g.beginPath(); g.moveTo(0, -s * 1.5); g.bezierCurveTo(s * 0.4, -s * 0.7, s, -0.1 * s, s, s * 0.35); g.arc(0, s * 0.35, s, 0, Math.PI); g.bezierCurveTo(-s, -0.1 * s, -s * 0.4, -s * 0.7, 0, -s * 1.5); g.closePath();
  paint(g, volR(g, col, -s * 0.2, 0, s * 1.2, 0.55, 0.3), Math.max(1, s * 0.4)); shine(g, -s * 0.35, s * 0.1, s * 0.22, s * 0.35, -0.3, 0.9); g.restore();
}
function waveCurl(g, x, y, s, col = '#4fd0d8') {
  g.save(); g.translate(x, y); g.scale(s, s);
  const shape = () => { g.beginPath(); g.moveTo(-24, 18); g.bezierCurveTo(-22, 2, -10, -16, 8, -16); g.bezierCurveTo(20, -16, 26, -6, 20, 1); g.bezierCurveTo(16, -6, 8, -6, 6, 0); g.bezierCurveTo(4, 8, 12, 14, 24, 18); g.closePath(); };
  shape(); paint(g, lin(g, 0, -16, 0, 18, [[0, L(col, 0.45)], [0.55, col], [1, D(col, 0.35)]]), 2.1);
  // foam claws on the lip
  for (const [cx, cy, r] of [[19, -2, 3.2], [15, -8.5, 3.6], [8, -12.5, 3.6], [0, -12, 3.2]]) { circ(g, cx, cy, r); paint(g, CREAM, 1.4); }
  g.strokeStyle = hexA('#ffffff', 0.8); g.lineWidth = 1.6; g.beginPath(); g.moveTo(-17, 12); g.bezierCurveTo(-14, 0, -6, -8, 4, -9); g.stroke();
  g.restore();
}
function starShape(g, x, y, r, col = '#ffd36a', lw = 1.7, rot = 0) { roundStar(g, x, y, r, r * 0.5, 5, -Math.PI / 2 + rot); paint(g, volR(g, col, x, y, r, 0.55, 0.3), lw); shine(g, x - r * 0.3, y - r * 0.28, r * 0.24, r * 0.14, -0.6, 0.85); }
function rubberDuck(g, x, y, s, key = true) {
  g.save(); g.translate(x, y); g.scale(s, s);
  if (key) { g.beginPath(); g.moveTo(-12, -3); g.lineTo(-17, -5); stroke(g, INK, 3.4); g.beginPath(); g.moveTo(-12, -3); g.lineTo(-17, -5); stroke(g, '#e8b848', 1.8); for (const dy of [-3.2, 3.2]) { ell(g, -19.5, -5 + dy, 2.6, 2.2); paint(g, '#e8b848', 1.3); } }
  ell(g, 0, 5, 14, 9.5); paint(g, vol(g, '#ffd84a', -14, -4, 14, 14, 0.45, 0.25), 2);
  g.beginPath(); g.moveTo(-12, 2); g.quadraticCurveTo(-18, -4, -13, -7); g.quadraticCurveTo(-10, -1, -8, 1); g.closePath(); paint(g, '#ffd84a', 1.6);
  ell(g, -2, 5, 6.5, 4, -0.2); paint(g, vol(g, '#ffc234', -8, 1, 4, 9, 0.3, 0.2), 1.4);
  circ(g, 6, -8, 7.5); paint(g, volR(g, '#ffd84a', 6, -8, 7.5), 1.9);
  g.beginPath(); g.moveTo(11.5, -8); g.quadraticCurveTo(19, -8.5, 18.5, -5.5); g.quadraticCurveTo(15, -3.5, 11, -5); g.closePath(); paint(g, '#ff9a3a', 1.4);
  circ(g, 8, -10, 1.6); g.fillStyle = INK; g.fill(); circ(g, 8.5, -10.6, 0.55); g.fillStyle = '#fff'; g.fill();
  ell(g, 5.5, -5.5, 2, 1.2); g.fillStyle = hexA('#ff8aa8', 0.8); g.fill();
  shine(g, -6, -1, 4, 2, -0.4, 0.75); shine(g, 3, -12, 2.2, 1.2, -0.5, 0.8);
  g.restore();
}
function featherArt(g, x, y, len, rot, col = '#fff0d0', tip = '#ffb04a') {
  g.save(); g.translate(x, y); g.rotate(rot);
  const f = () => { g.beginPath(); g.moveTo(-len / 2, 0); g.bezierCurveTo(-len * 0.3, -len * 0.22, len * 0.3, -len * 0.2, len / 2, 0); g.bezierCurveTo(len * 0.3, len * 0.2, -len * 0.3, len * 0.22, -len / 2, 0); g.closePath(); };
  f(); paint(g, lin(g, -len / 2, 0, len / 2, 0, [[0, tip], [0.55, col], [1, '#ffffff']]), 1.6);
  g.strokeStyle = hexA(D(tip, 0.2), 0.6); g.lineWidth = 0.9; for (let i = -3; i <= 3; i++) { const xx = i * len * 0.11; g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx + len * 0.08, -len * 0.14); g.moveTo(xx, 0); g.lineTo(xx + len * 0.08, len * 0.14); g.stroke(); }
  g.beginPath(); g.moveTo(-len * 0.62, 0); g.lineTo(len * 0.46, 0); stroke(g, D(tip, 0.25), 1.4);
  g.restore();
}
function goldenHead(g, x, y, s, a = 1) { // friendly golden retriever face (front)
  g.save(); g.translate(x, y); g.scale(s, s); g.globalAlpha = a;
  for (const k of [-1, 1]) { g.beginPath(); g.moveTo(k * 7, -8); g.bezierCurveTo(k * 16, -9, k * 17, 4, k * 12, 9); g.bezierCurveTo(k * 9, 6, k * 7, 0, k * 6, -4); g.closePath(); paint(g, vol(g, '#e0a040', k * 6, -9, k * 16, 9, 0.3, 0.3), 1.6); }
  g.beginPath(); g.moveTo(-9, -3); g.bezierCurveTo(-10, -14, 10, -14, 9, -3); g.bezierCurveTo(9, 5, 5, 10, 0, 10); g.bezierCurveTo(-5, 10, -9, 5, -9, -3); g.closePath(); paint(g, volR(g, '#ffc868', 0, -2, 11, 0.4, 0.25), 1.8);
  ell(g, 0, 5, 5.5, 4.2); paint(g, '#ffe6ae', 1.2);
  ell(g, 0, 3, 2.6, 1.9); g.fillStyle = INK; g.fill(); shine(g, -0.8, 2.4, 0.9, 0.5, 0, 0.8);
  for (const k of [-1, 1]) { circ(g, k * 3.8, -3, 1.5); g.fillStyle = INK; g.fill(); circ(g, k * 3.8 - 0.4, -3.5, 0.5); g.fillStyle = '#fff'; g.fill(); }
  g.beginPath(); g.moveTo(-1.8, 7); g.quadraticCurveTo(0, 11, 1.8, 7); g.closePath(); paint(g, '#ff8aa0', 1);
  g.restore();
}
function mallardArt(g, x, y, s, rot = 0, a = 1) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s); g.globalAlpha = a;
  g.beginPath(); g.moveTo(-3, -1); g.quadraticCurveTo(-8, -11, -1, -12); g.quadraticCurveTo(2, -6, 3, -1); g.closePath(); paint(g, lin(g, 0, -12, 0, 0, [[0, '#e8fff8'], [1, '#9fe0d8']]), 1.4);
  ell(g, 0, 2, 8.5, 5); paint(g, vol(g, '#b8f0e8', -8, -3, 8, 7, 0.4, 0.25), 1.6);
  circ(g, 7.5, -1.5, 3.8); paint(g, volR(g, '#5ad890', 7.5, -1.5, 3.8), 1.4);
  g.beginPath(); g.moveTo(10.5, -1.5); g.lineTo(14.5, -0.5); g.lineTo(10.5, 0.8); g.closePath(); paint(g, '#ffd23a', 1.1);
  g.beginPath(); g.arc(6.5, 1.8, 3, 0.6, 2.5); stroke(g, '#ffffff', 1.3);
  circ(g, 8.5, -2.4, 0.8); g.fillStyle = INK; g.fill();
  g.restore();
}
function drawMokaSkill(g, id) {
  switch (id) {
    case 'attack_staff': {
      g.save(); g.translate(-5, 5); g.scale(0.8, 0.8); drawStaff(g, 'drift', ['#b89a74', '#5ce0d0', '#4a8adf'], true); g.restore();
      for (let i = 0; i < 3; i++) ribbonStroke(g, () => { g.beginPath(); g.moveTo(4 + i * 3, -6 - i * 3); g.lineTo(12 + i * 3, -13 - i * 3); }, 1.6);
      starShape(g, 18, -17, 6, '#bff6ee', 1.5); sparkle(g, 23, -8, 2.4, '#ffffff');
      return true;
    }
    case 'splash': {
      g.beginPath(); g.moveTo(-22, 20); g.quadraticCurveTo(-18, 8, -14, 14); g.quadraticCurveTo(-11, 4, -7, 13); g.quadraticCurveTo(-3, 6, 0, 20); g.closePath(); paint(g, lin(g, 0, 4, 0, 20, [[0, '#dffcff'], [1, '#5ccfd8']]), 1.6);
      for (const [x, y, s, r] of [[-19, 3, 1.7, -0.5], [-9, 0, 1.5, 0.3], [2, 8, 1.4, 0.8]]) drop(g, x, y, s, '#8ff0ff', r);
      for (let i = 0; i < 3; i++) ribbonStroke(g, () => { g.beginPath(); g.moveTo(-6 + i * 4, -2 - i * 3); g.lineTo(2 + i * 4, -9 - i * 3); }, 2);
      waterOrbArt(g, 11, -11, 11);
      return true;
    }
    case 'tideMastery': {
      waveCurl(g, 0, 4, 0.95);
      starShape(g, 12, -13, 8.5, '#ffcf4a', 1.8);
      drop(g, -16, -14, 2.2, '#8ff0ff', -0.3);
      return true;
    }
    case 'bubble': {
      const f = fxg(g); f.save(); f.fillStyle = rad(f, 0, 0, 24, [[0, 'rgba(200,250,255,0.1)'], [0.8, 'rgba(160,230,255,0.25)'], [1, 'rgba(255,255,255,0)']]); circ(f, 0, 0, 24); f.fill(); f.restore();
      circ(g, 0, 0, 21); g.fillStyle = 'rgba(210,248,255,0.35)'; g.fill();
      g.save(); circ(g, 0, 0, 21); g.clip();
      for (const [c, w] of [['#ff9ad8', 3], ['#ffe07a', 2.4], ['#8ff0d8', 2.4], ['#9ab8ff', 2.2]]) { g.strokeStyle = hexA(c, 0.75); g.lineWidth = w; g.beginPath(); g.arc(0, 0, 19.5 - w * 1.1 * ['#ff9ad8', '#ffe07a', '#8ff0d8', '#9ab8ff'].indexOf(c), Math.PI * 0.1, Math.PI * 0.95); g.stroke(); }
      g.restore();
      circ(g, 0, 0, 21); stroke(g, INK, 2); circ(g, 0, 0, 19.8); stroke(g, 'rgba(255,255,255,0.85)', 1.4);
      g.save(); g.scale(0.62, 0.62); g.fillStyle = '#8a5a3a'; g.beginPath(); g.ellipse(0, 8, 10, 8, 0, 0, TAU); g.fill(); for (const [x, y] of [[-10, -4], [-3.5, -10], [3.5, -10], [10, -4]]) { g.beginPath(); g.ellipse(x, y, 4.2, 5, 0, 0, TAU); g.fill(); } g.restore();
      g.beginPath(); g.arc(0, 0, 15, Math.PI * 1.1, Math.PI * 1.45); stroke(g, '#ffffff', 3.6); circ(g, -5, -15.5, 1.6); g.fillStyle = '#fff'; g.fill();
      return true;
    }
    case 'shake': {
      for (let i = 0; i < 3; i++) ribbonStroke(g, () => { g.beginPath(); g.arc(0, 2, 15 + i * 5.5, -0.9 + i * 2.1, 0.4 + i * 2.1); }, 2.4 - i * 0.4);
      // a wet round dog face, eyes squeezed shut, ears flying
      for (const k of [-1, 1]) { g.beginPath(); g.moveTo(k * 7, -6); g.bezierCurveTo(k * 18, -12, k * 21, -2, k * 16, 3); g.bezierCurveTo(k * 13, 0, k * 10, -2, k * 8, -1); g.closePath(); paint(g, vol(g, '#6a3a24', k * 7, -12, k * 21, 3, 0.3, 0.25), 1.6); }
      circ(g, 0, 1, 11); paint(g, volR(g, '#8a5234', 0, 1, 11, 0.35, 0.25), 1.9);
      ell(g, 0, 5, 6, 4.4); paint(g, '#c08a60', 1.2); ell(g, 0, 3.2, 2.4, 1.7); g.fillStyle = INK; g.fill();
      for (const k of [-1, 1]) { g.beginPath(); g.moveTo(k * 6.2, -2); g.lineTo(k * 3, -0.6); g.lineTo(k * 6.2, 0.8); stroke(g, INK, 1.5); }
      for (const [x, y, s, r] of [[-20, -14, 1.9, -0.8], [19, -15, 1.7, 0.8], [22, 9, 1.8, 2.2], [-22, 11, 1.6, -2.3], [2, -21, 1.6, 0], [-4, 21, 1.4, 3.1]]) drop(g, x, y, s, '#8ff0ff', r);
      return true;
    }
    case 'puddleHop': {
      for (const [x, y, w] of [[-14, 16, 11], [14, 15, 12]]) { ell(g, x, y, w, 4.2); paint(g, lin(g, 0, y - 4, 0, y + 4, [[0, '#b8fbff'], [1, '#4cc4d0']]), 1.6); ell(g, x - 2, y - 1, w * 0.45, 1.2); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fill(); }
      g.save(); g.setLineDash([3, 3.4]); g.beginPath(); g.moveTo(-13, 11); g.quadraticCurveTo(0, -30, 13, 9); stroke(g, INK, 2.2); g.restore();
      g.save(); g.translate(0, -12); g.scale(0.55, 0.55); g.fillStyle = '#8a5a3a'; g.beginPath(); g.ellipse(0, 8, 10, 8, 0, 0, TAU); g.fill(); for (const [x, y] of [[-10, -4], [-3.5, -10], [3.5, -10], [10, -4]]) { g.beginPath(); g.ellipse(x, y, 4.2, 5, 0, 0, TAU); g.fill(); } g.restore();
      for (const [x, y, s, r] of [[9, 6, 1.5, 0.6], [19, 7, 1.4, 1.2], [15, 3, 1.2, 0.2]]) drop(g, x, y, s, '#8ff0ff', r);
      return true;
    }
    case 'whirlpool': {
      glow(g, 0, 2, 26, '#5ce0d0', 0.55);
      ell(g, 0, 3, 23, 16); paint(g, rad(g, 0, 3, 23, [[0, '#0e4a66'], [0.45, '#2a9ab4'], [1, '#8ff0f0']]), 2);
      for (let i = 0; i < 3; i++) { g.save(); g.translate(0, 3); g.scale(1, 0.7); g.rotate(i * TAU / 3); g.beginPath(); for (let k = 0; k <= 24; k++) { const t = k / 24, a = t * 4.2, r = 3 + t * 18; const x = Math.cos(a) * r, y = Math.sin(a) * r; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.strokeStyle = hexA('#f0ffff', 0.95); g.lineWidth = 2.6 - 0 * i; g.stroke(); g.restore(); }
      ell(g, 0, 3, 4.5, 3); g.fillStyle = '#062a3c'; g.fill();
      ell(g, 0, 3, 23, 16); stroke(g, INK, 2);
      drop(g, -18, -14, 1.7, '#8ff0ff', -0.7); drop(g, 17, -15, 1.5, '#8ff0ff', 0.7);
      return true;
    }
    case 'greatWave': {
      waveCurl(g, -1, 3, 1.18, '#35b8d0');
      for (const [x, y] of [[20, -12], [-15, -21], [25, 2]]) sparkle(g, x, y, 2.6, '#ffffff');
      g.beginPath(); g.moveTo(-27, 22); g.quadraticCurveTo(0, 17, 27, 22); stroke(g, CREAM, 2.4);
      return true;
    }
    case 'kibble': {
      for (const [x0, y0, x1, y1] of [[-22, 18, -6, 4], [-18, 22, 4, 12], [-24, 10, -12, -10]]) { g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 - 6, (y0 + y1) / 2 - 6, x1, y1); stroke(g, hexA('#fff6c0', 0.9), 3); g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 - 6, (y0 + y1) / 2 - 6, x1, y1); stroke(g, hexA('#b89aff', 0.7), 1.2); }
      starShape(g, -3, 0, 8, '#ffd36a'); starShape(g, 9, 10, 7, '#ffcf8a', 1.6, 0.4); starShape(g, -9, -14, 6.5, '#ffe08a', 1.5, -0.3);
      sparkle(g, 16, -12, 3.4, '#fff6c0'); sparkle(g, 20, 0, 2.2, '#e0d0ff');
      return true;
    }
    case 'starMastery': {
      glow(g, 0, 0, 24, '#b89aff', 0.6);
      g.beginPath(); g.ellipse(0, 3, 21, 7, -0.25, 0, TAU); stroke(g, INK, 4.4); g.beginPath(); g.ellipse(0, 3, 21, 7, -0.25, 0, TAU); stroke(g, '#b89aff', 2.4);
      starShape(g, 0, 0, 15, '#ffd36a', 2);
      for (const [x, y, r] of [[-17, -14, 3], [18, -12, 2.4], [15, 16, 2]]) sparkle(g, x, y, r, '#fff6c0');
      return true;
    }
    case 'squeak': {
      for (let i = 0; i < 3; i++) ribbonStroke(g, () => { g.beginPath(); g.arc(0, 4, 17 + i * 5, Math.PI * 1.05, Math.PI * 1.95); }, 2.4 - i * 0.5);
      g.save(); g.translate(0, 6); g.rotate(-0.25); bonePath(g, -12, 12, 4.6, 6); paint(g, vol(g, '#ff9ccc', -18, -10, 18, 10, 0.45, 0.25), 2); g.restore();
      g.fillStyle = '#ff5a8a'; ell(g, 0, 6, 3, 2); g.fill();
      for (const [x, y] of [[-18, -8], [18, -10]]) { g.save(); g.translate(x, y); g.beginPath(); g.moveTo(-2, -5); g.lineTo(0, 2); g.lineTo(2, -5); g.closePath(); paint(g, '#ffe07a', 1.2); circ(g, 0, 5, 1.6); paint(g, '#ffe07a', 1); g.restore(); }
      starShape(g, 0, -15, 5, '#fff2a0', 1.4);
      return true;
    }
    case 'pawRune': {
      glow(g, 0, 2, 26, '#ffd36a', 0.65);
      ell(g, 0, 4, 23, 16); stroke(g, INK, 4); ell(g, 0, 4, 23, 16); stroke(g, '#ffe08a', 2.2);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; const x = Math.cos(a) * 19, y = 4 + Math.sin(a) * 12.5; if (i % 2) { circ(g, x, y, 1.4); g.fillStyle = '#fff6c0'; g.fill(); } else sparkle(g, x, y, 2.6, '#fff6c0'); }
      g.save(); g.translate(0, 3); g.scale(1, 0.72); g.shadowColor = '#ffe8a0'; g.shadowBlur = 8;
      g.beginPath(); g.ellipse(0, 5, 8.5, 7, 0, 0, TAU); for (const [x, y] of [[-9, -5], [-3.2, -10], [3.2, -10], [9, -5]]) { g.moveTo(x + 3.6, y); g.ellipse(x, y, 3.6, 4.4, 0, 0, TAU); }
      g.fillStyle = '#ffd36a'; g.fill(); g.shadowBlur = 0; g.lineWidth = 2.2; g.strokeStyle = INK; g.stroke(); g.restore();
      return true;
    }
    case 'moonbeam': {
      g.fillStyle = lin(g, 0, -12, 0, 22, [[0, hexA('#e0e0ff', 0.15)], [0.6, hexA('#e8e8ff', 0.8)], [1, hexA('#ffffff', 0.95)]]);
      g.beginPath(); g.moveTo(-5, -10); g.lineTo(5, -10); g.lineTo(9, 20); g.lineTo(-9, 20); g.closePath(); g.fill();
      ell(g, 0, 20, 13, 3.4); g.fillStyle = hexA('#ffffff', 0.9); g.fill(); ell(g, 0, 20, 13, 3.4); stroke(g, hexA('#9a8ae8', 0.9), 1.3);
      g.beginPath(); g.arc(-2, -15, 10, 0.7, TAU - 0.7); g.arc(4, -18, 8.5, TAU - 1.05, 1.05, true); g.closePath(); paint(g, vol(g, '#fff6c0', -12, -25, 8, -5, 0.4, 0.15), 1.8);
      for (const [x, y, r] of [[14, -8, 2.4], [-14, 4, 1.8], [11, 10, 1.6]]) sparkle(g, x, y, r, '#ffffff');
      return true;
    }
    case 'constellation': {
      const pts = [[-19, 12], [-8, -6], [6, 2], [17, -14], [14, 16]];
      g.save(); g.lineWidth = 2; g.strokeStyle = hexA('#fff2c0', 0.95); g.shadowColor = '#b89aff'; g.shadowBlur = 5;
      g.beginPath(); g.moveTo(...pts[0]); g.lineTo(...pts[1]); g.lineTo(...pts[2]); g.lineTo(...pts[3]); g.moveTo(...pts[2]); g.lineTo(...pts[4]); g.stroke(); g.restore();
      pts.forEach(([x, y], i) => starShape(g, x, y, i === 2 ? 6.5 : 4.8, i % 2 ? '#ffe08a' : '#ffd36a', 1.4, i * 0.3));
      sparkle(g, -2, -18, 2.4, '#e0d0ff');
      return true;
    }
    case 'meteor': {
      const f = fxg(g); f.save(); f.translate(4, 4); f.rotate(Math.PI * 0.75);
      for (const [w, len, c] of [[13, 30, '#ff6a2a'], [8.5, 25, '#ffb04a'], [4, 19, '#fff3a0']]) { f.beginPath(); f.moveTo(-w, 4); f.quadraticCurveTo(-w * 0.5, len * 0.8, 0, len + 8); f.quadraticCurveTo(w * 0.5, len * 0.8, w, 4); f.closePath(); f.fillStyle = lin(f, 0, 0, 0, len + 8, [[0, hexA(c, 0.95)], [1, hexA(c, 0)]]); f.fill(); }
      f.restore();
      g.save(); g.translate(6, 6); g.rotate(-0.8); bonePath(g, -11, 11, 5, 6.2); paint(g, vol(g, '#e8b070', -17, -11, 17, 11, 0.4, 0.3), 2);
      g.fillStyle = hexA('#8a4a28', 0.6); for (const [x, y] of [[-6, -2], [-6, 2], [6, -2], [6, 2]]) { circ(g, x, y, 1); g.fill(); } g.restore();
      for (const [x, y, r] of [[-12, -14, 2.2], [-4, -20, 1.6], [-18, -6, 1.4]]) { circ(g, x, y, r); paint(g, '#c88a4c', 1); }
      return true;
    }
    case 'duckDecoy': {
      for (const [x, y, r] of [[-15, 17, 3], [17, 16, 2.4]]) { ell(g, x, y, r * 2, r * 0.8); g.fillStyle = hexA('#8ff0ff', 0.7); g.fill(); }
      rubberDuck(g, 1, 3, 1.15);
      for (let i = 0; i < 2; i++) ribbonStroke(g, () => { g.beginPath(); g.arc(18, -12, 5 + i * 4.5, -1.3, 0.1); }, 1.6);
      return true;
    }
    case 'retriever': {
      glow(g, 0, 0, 24, '#ffd070', 0.55);
      goldenHead(g, 0, 3, 1.25);
      starShape(g, 15, -15, 6, '#ffcf4a', 1.5);
      return true;
    }
    case 'fetchLeash': {
      g.beginPath(); g.ellipse(9, -6, 11, 8, -0.4, 0, TAU); stroke(g, INK, 6.4); g.beginPath(); g.ellipse(9, -6, 11, 8, -0.4, 0, TAU); stroke(g, '#ffa040', 4); g.beginPath(); g.ellipse(9, -6, 11, 8, -0.4, 3.6, 5.2); stroke(g, '#fff0a0', 1.4);
      g.beginPath(); g.moveTo(-1, 0); g.bezierCurveTo(-8, 8, -16, 6, -21, 18); stroke(g, INK, 5.6); g.beginPath(); g.moveTo(-1, 0); g.bezierCurveTo(-8, 8, -16, 6, -21, 18); stroke(g, '#ffa040', 3.2);
      g.save(); g.setLineDash([2, 3]); g.beginPath(); g.moveTo(-1, 0); g.bezierCurveTo(-8, 8, -16, 6, -21, 18); stroke(g, '#fff0a0', 1.2); g.restore();
      circ(g, -1, 0, 3.2); paint(g, volR(g, '#ffd84a', -1, 0, 3.2), 1.4);
      for (let i = 0; i < 3; i++) ribbonStroke(g, () => { g.beginPath(); g.moveTo(-2 - i * 5, -12 - i * 2); g.lineTo(-9 - i * 5, -9 - i * 2); }, 1.8);
      starShape(g, 9, -6, 4.5, '#ffe08a', 1.2);
      return true;
    }
    case 'feathers': {
      featherArt(g, -4, -8, 30, -0.9); featherArt(g, 4, -2, 32, -0.4, '#fff4d8', '#8fd068'); featherArt(g, 6, 8, 28, 0.15);
      for (const [x, y, r] of [[18, -16, 3], [22, 4, 2.2], [-18, 14, 2]]) sparkle(g, x, y, r, '#fff6c0');
      return true;
    }
    case 'duckCall': {
      g.save(); g.translate(-6, 6); g.rotate(-0.55);
      rr(g, -16, -4, 14, 8, 3); paint(g, vol(g, '#b07a4a', -16, -4, -2, 4), 1.8);
      g.beginPath(); g.moveTo(-3, -4.5); g.lineTo(10, -8); g.quadraticCurveTo(13, 0, 10, 8); g.lineTo(-3, 4.5); g.closePath(); paint(g, vol(g, '#c98f5e', -3, -8, 12, 8), 1.8);
      rr(g, -5, -5, 3, 10, 1); paint(g, '#ffb04a', 1.2);
      g.restore();
      for (let i = 0; i < 3; i++) ribbonStroke(g, () => { g.beginPath(); g.arc(4, -4, 7 + i * 5, -1.3, 0.2); }, 2.2 - i * 0.4);
      for (const [x, y] of [[20, -18], [23, 6]]) { g.save(); g.translate(x, y); g.beginPath(); g.ellipse(0, 3, 3, 2.3, -0.4, 0, TAU); g.rect(1.8, -5, 1.6, 8); paint(g, '#8fd068', 1.1); g.restore(); }
      return true;
    }
    case 'spiritRetriever': {
      glow(g, 0, 0, 26, '#ffe8a0', 0.7);
      goldenHead(g, 0, 0, 1.15, 0.88);
      g.save(); g.globalAlpha = 0.8; g.beginPath(); g.moveTo(-10, 12); g.quadraticCurveTo(-6, 22, -2, 14); g.quadraticCurveTo(2, 22, 6, 14); g.quadraticCurveTo(10, 22, 12, 12); g.lineTo(12, 10); g.lineTo(-10, 10); g.closePath(); paint(g, lin(g, 0, 10, 0, 22, [[0, '#fff4c0'], [1, hexA('#ffd890', 0.2)]]), 1.2); g.restore();
      for (const [x, y, r] of [[-18, -14, 2.8], [18, -16, 2.2], [20, 10, 2]]) sparkle(g, x, y, r, '#ffffff');
      return true;
    }
    case 'mallards': {
      mallardArt(g, -12, -8, 0.95, 0.5, 0.95); mallardArt(g, 12, -10, 0.95, 0.5, 0.95); mallardArt(g, 0, 4, 1.15, 0.6, 1);
      for (const [x, y] of [[-6, 20], [8, 21]]) { g.beginPath(); g.moveTo(x - 6, y); g.quadraticCurveTo(x, y - 7, x + 6, y); stroke(g, hexA('#8ff0ff', 0.9), 2); }
      sparkle(g, 20, 8, 2.4, '#e8fff8');
      return true;
    }
  }
  return false;
}

// ================================================================== skills
const SKILL_BG = {
  bone: ['#fff0d2', '#e0a870', '#b8703e'], fetch: ['#ffd4c4', '#f07a5e', '#c23a2e'], spirit: ['#e2eaff', '#8fa4f0', '#4a58c0'], attack: ['#fffaf0', '#d8c8b0', '#a08870'],
  tide: ['#dcfff8', '#6fd8cc', '#2a8f9a'], star: ['#fff4d0', '#b8a0f0', '#5a48b8'], duck: ['#fff0d8', '#f0b060', '#b8702a'],
  ...POE_SKILL_BG,
  ...STZ_SKILL_BG,
  ...GLD_SKILL_BG,
};
const SKILL_TREE = { chomp: 'bone', boneMastery: 'bone', whirl: 'bone', dig: 'bone', guard: 'bone', frenzy: 'bone', bonestorm: 'bone', throw: 'fetch', fetchMastery: 'fetch', ricochet: 'fetch', multi: 'fetch', decoy: 'fetch', blaze: 'fetch', fetchstorm: 'fetch', woof: 'spirit', goodboy: 'spirit', zoom: 'spirit', packcall: 'spirit', treat: 'spirit', howl: 'spirit', moonhowl: 'spirit',
  splash: 'tide', tideMastery: 'tide', bubble: 'tide', shake: 'tide', puddleHop: 'tide', whirlpool: 'tide', greatWave: 'tide',
  kibble: 'star', starMastery: 'star', squeak: 'star', pawRune: 'star', moonbeam: 'star', constellation: 'star', meteor: 'star',
  duckDecoy: 'duck', retriever: 'duck', fetchLeash: 'duck', feathers: 'duck', duckCall: 'duck', spiritRetriever: 'duck', mallards: 'duck', ...POE_SKILL_TREE, ...STZ_SKILL_TREE, ...GLD_SKILL_TREE };
const PASSIVE = new Set(['boneMastery', 'guard', 'frenzy', 'fetchMastery', 'goodboy', 'tideMastery', 'starMastery', 'retriever', ...POE_PASSIVE, ...STZ_PASSIVE, ...GLD_PASSIVE]);
const CREAM = '#fffaf0';
function tennis(g, x, y, r, col = '#e8362a') {
  circ(g, x, y, r); paint(g, volR(g, col, x, y, r, 0.5, 0.35), Math.max(1.2, r * 0.14));
  g.save(); circ(g, x, y, r * 0.95); g.clip();
  for (const s of [-1, 1]) { g.beginPath(); g.arc(x + s * r * 1.18, y, r * 0.86, s < 0 ? -1.05 : Math.PI - 1.05, s < 0 ? 1.05 : Math.PI + 1.05); stroke(g, '#fff3e0', Math.max(1, r * 0.16)); }
  g.restore();
  shine(g, x - r * 0.38, y - r * 0.45, r * 0.3, r * 0.17, -0.6, 0.8);
}
function ribbonStroke(g, draw, w = 5, col = CREAM) { draw(); stroke(g, INK, w + 2.6); draw(); stroke(g, col, w); }
function dogHeadProfile(g, x, y, s, col = '#8a4a2c', open = true, up = 0) {
  g.save(); g.translate(x, y); g.rotate(up); g.scale(s, s);
  // ear
  g.beginPath(); g.moveTo(-6, -7); g.quadraticCurveTo(-14, -6, -13, 6); g.quadraticCurveTo(-9, 4, -5, -1); g.closePath(); paint(g, D(col, 0.25), 1.6);
  circ(g, -2, 0, 9); paint(g, volR(g, col, -2, 0, 9, 0.35, 0.25), 1.8);
  // snout
  g.beginPath(); g.moveTo(4, -4); g.quadraticCurveTo(14, -5, 15, 0); g.quadraticCurveTo(15, 3, 6, 3.5); g.closePath(); paint(g, vol(g, '#e8b890', 4, -5, 15, 4, 0.3, 0.2), 1.6);
  if (open) { g.beginPath(); g.moveTo(5, 4); g.quadraticCurveTo(13, 4, 13, 7); g.quadraticCurveTo(8, 11, 3, 7); g.closePath(); paint(g, '#e8b890', 1.5); g.beginPath(); g.moveTo(5, 4.8); g.quadraticCurveTo(10, 5.2, 11.6, 6.6); g.quadraticCurveTo(8, 8.8, 5, 6.5); g.closePath(); g.fillStyle = '#e8506a'; g.fill(); }
  ell(g, 15, -1.5, 2.2, 1.8); g.fillStyle = INK; g.fill();
  circ(g, 1.5, -3, 1.5); g.fillStyle = INK; g.fill(); circ(g, 1.9, -3.5, 0.5); g.fillStyle = '#fff'; g.fill();
  g.restore();
}
function ghostPup(g, x, y, s, a = 0.9) {
  g.save(); g.translate(x, y); g.scale(s, s); g.globalAlpha = a;
  for (const k of [-1, 1]) { g.beginPath(); g.moveTo(k * 4, -8); g.quadraticCurveTo(k * 12, -20, k * 14, -16); g.quadraticCurveTo(k * 14, -8, k * 9, -2); g.closePath(); paint(g, lin(g, 0, -20, 0, 0, [[0, '#e8f0ff'], [1, '#a8c0ff']]), 1.6); }
  g.beginPath(); g.moveTo(-10, -2); g.bezierCurveTo(-11, -13, 11, -13, 10, -2); g.lineTo(10, 8); g.quadraticCurveTo(7, 12, 5, 8); g.quadraticCurveTo(2.5, 12, 0, 8); g.quadraticCurveTo(-2.5, 12, -5, 8); g.quadraticCurveTo(-7, 12, -10, 8); g.closePath();
  paint(g, lin(g, 0, -12, 0, 12, [[0, '#ffffff'], [1, '#b8ccff']]), 1.6);
  for (const k of [-1, 1]) { circ(g, k * 4, -3, 2); g.fillStyle = '#2a2a48'; g.fill(); circ(g, k * 4 - 0.6, -3.6, 0.7); g.fillStyle = '#fff'; g.fill(); }
  ell(g, 0, 1.5, 1.8, 1.2); g.fillStyle = '#2a2a48'; g.fill();
  g.restore();
}
function drawSkill(g, id) {
  if (drawMokaSkill(g, id)) return;
  if (drawPoeSkill(g, id, ICON_KIT)) return;
  if (drawShihtzuSkill(g, id, ICON_KIT)) return;
  if (drawGoldenSkill(g, id, ICON_KIT)) return;
  if (drawSamuraiSkill(g, id, ICON_KIT)) return;
  switch (id) {
    case 'attack': {
      g.save(); g.translate(-3, 3); g.scale(0.78, 0.78); drawSword(g, 'bone', ['#f4e8cf', '#c23b3b', '#f2e4c6'], true); g.restore();
      tennis(g, 12, 11, 8);
      break;
    }
    case 'attack_ball': { // basic attack with the Red Tennis Ball equipped: a big ball on a bouncy throw arc
      g.save(); g.setLineDash([3.2, 3.6]); g.beginPath(); g.moveTo(-24, 20); g.quadraticCurveTo(-18, -18, 2, -8); stroke(g, INK, 2.2); g.restore();
      for (const [x, y, r] of [[-21, 12, 2.6], [-14, -4, 2]]) { circ(g, x, y, r); paint(g, CREAM, 1.2); }
      for (let i = 0; i < 3; i++) ribbonStroke(g, () => { g.beginPath(); g.moveTo(-10 + i * 2, 6 + i * 7); g.lineTo(-1 + i * 2, 4 + i * 7); }, 2.2);
      tennis(g, 8, 4, 15);
      break;
    }
    case 'chomp': {
      g.beginPath(); g.arc(4, 8, 22, Math.PI * 1.05, Math.PI * 1.85); stroke(g, INK, 9); g.beginPath(); g.arc(4, 8, 22, Math.PI * 1.05, Math.PI * 1.85); stroke(g, CREAM, 6);
      g.fillStyle = CREAM; g.strokeStyle = INK; g.lineWidth = 1.3;
      for (let i = 0; i < 5; i++) { const a = Math.PI * (1.12 + i * 0.16), x = 4 + Math.cos(a) * 19, y = 8 + Math.sin(a) * 19; g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2); g.beginPath(); g.moveTo(-2.4, 0); g.lineTo(0, 5); g.lineTo(2.4, 0); g.closePath(); g.fill(); g.stroke(); g.restore(); }
      g.save(); g.translate(-2, 8); g.scale(0.7, 0.7); drawSword(g, 'bone', ['#fff6e0', '#e8475c', '#f2e4c6'], true); g.restore();
      break;
    }
    case 'boneMastery': {
      drawBone(g, 0, 2, 32, 3.6, 5, -0.75); drawBone(g, 0, 2, 32, 3.6, 5, 0.75);
      roundStar(g, 0, 1, 9, 4.6, 5); paint(g, volR(g, '#ffcf4a', 0, 1, 9, 0.5, 0.3), 1.8);
      break;
    }
    case 'whirl': {
      for (let i = 0; i < 3; i++) { const r = 7 + i * 6.5; ribbonStroke(g, () => { g.beginPath(); g.arc(0, 2, r, i * 1.6 + 0.2, i * 1.6 + 3.9); }, 3.8 - i * 0.6); }
      drawBone(g, 17, -12, 12, 2, 2.6, 0.9);
      circ(g, 0, 2, 3.2); paint(g, CREAM, 1.5);
      break;
    }
    case 'dig': {
      roundStar(g, 0, 10, 19, 9, 9, 0.15); paint(g, vol(g, '#ffe070', -19, -9, 19, 29, 0.55, 0.15), 1.8);
      g.beginPath(); g.moveTo(-27, 22); g.quadraticCurveTo(-14, 11, 0, 13); g.quadraticCurveTo(14, 11, 27, 22); g.closePath(); paint(g, vol(g, '#9a6a44', -27, 11, 27, 22), 2);
      g.beginPath(); g.moveTo(-1, 14); g.lineTo(-6, 18); g.lineTo(-4, 21); g.moveTo(3, 14); g.lineTo(9, 18); stroke(g, INK, 1.5);
      for (const [x, y, r] of [[-17, -2, 3.2], [16, -4, 2.8], [-10, -10, 2.2], [21, 6, 2.2], [-22, 8, 1.8]]) { circ(g, x, y, r); paint(g, volR(g, '#b8845a', x, y, r), 1.4); }
      g.save(); g.translate(-3, -9); g.rotate(2.0); g.scale(0.62, 0.62); drawSword(g, 'bone', ['#fff6e0', '#e8475c', '#f2e4c6'], true); g.restore();
      for (const [x, y] of [[-16, -20], [-9, -24]]) ribbonStroke(g, () => { g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y - 6); }, 2);
      break;
    }
    case 'guard': {
      g.beginPath(); g.moveTo(0, -22); g.quadraticCurveTo(12, -16, 20, -16); g.quadraticCurveTo(21, 8, 0, 22); g.quadraticCurveTo(-21, 8, -20, -16); g.quadraticCurveTo(-12, -16, 0, -22); g.closePath();
      paint(g, vol(g, '#e8475c', -20, -22, 20, 22, 0.45, 0.3), 2.2);
      g.beginPath(); g.moveTo(0, -17); g.quadraticCurveTo(9, -12, 15.5, -12.5); g.quadraticCurveTo(16, 5, 0, 16.5); g.quadraticCurveTo(-16, 5, -15.5, -12.5); g.quadraticCurveTo(-9, -12, 0, -17); g.closePath(); paint(g, vol(g, CREAM, -15, -17, 15, 16, 0.2, 0.12), 1.5);
      drawBone(g, 0, 0, 16, 2.4, 3.2, -0.75, '#fff6e0', 1.4); drawBone(g, 0, 0, 16, 2.4, 3.2, 0.75, '#fff6e0', 1.4);
      shine(g, -11, -12, 3, 1.5, -0.5, 0.8);
      break;
    }
    case 'frenzy': {
      for (let i = 0; i < 3; i++) { const x = -16 + i * 11; g.beginPath(); g.moveTo(x, -14); g.lineTo(x + 10, 0); g.lineTo(x, 14); g.lineTo(x + 5, 14); g.lineTo(x + 15, 0); g.lineTo(x + 5, -14); g.closePath(); paint(g, vol(g, i === 2 ? '#ff6a5a' : CREAM, x, -14, x + 15, 14, 0.3, 0.12), 1.8); }
      // anime anger mark
      g.save(); g.translate(15, -15); g.strokeStyle = INK; g.lineWidth = 4.2; for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(1.5, -5); g.quadraticCurveTo(1.5, -1.5, 5, -1.5); g.stroke(); } g.strokeStyle = '#ff4a4a'; g.lineWidth = 2.4; for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(1.5, -5); g.quadraticCurveTo(1.5, -1.5, 5, -1.5); g.stroke(); } g.restore();
      break;
    }
    case 'bonestorm': {
      glow(g, 0, 0, 20, '#fff0b0', 0.8);
      g.strokeStyle = hexA(CREAM, 0.6); g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 17, 0, TAU); g.stroke();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU - 0.3; drawBone(g, Math.cos(a) * 17, Math.sin(a) * 17, 11, 1.9, 2.5, a + Math.PI / 2, '#fff6e0', 1.3); }
      circ(g, 0, 0, 4.5); paint(g, volR(g, '#ffcf4a', 0, 0, 4.5), 1.5);
      break;
    }
    case 'throw': {
      for (let i = 0; i < 3; i++) ribbonStroke(g, () => { g.beginPath(); g.moveTo(-22 + i * 3, -8 + i * 8); g.lineTo(-6 + i * 2, -8 + i * 8); }, 2.6);
      tennis(g, 7, 0, 12);
      break;
    }
    case 'fetchMastery': {
      tennis(g, 0, 5, 14);
      g.beginPath(); g.moveTo(-10, -9); g.lineTo(-11, -20); g.lineTo(-5, -14); g.lineTo(0, -22); g.lineTo(5, -14); g.lineTo(11, -20); g.lineTo(10, -9); g.closePath(); paint(g, vol(g, '#ffcf4a', -11, -22, 11, -9, 0.55, 0.3), 1.8);
      circ(g, 0, -12.5, 1.6); g.fillStyle = '#e8475c'; g.fill();
      break;
    }
    case 'ricochet': {
      g.setLineDash([3.5, 3.5]); ribbonStroke(g, () => { g.beginPath(); g.moveTo(-22, 16); g.lineTo(-8, -12); g.lineTo(4, 12); g.lineTo(14, -10); }, 2.4); g.setLineDash([]);
      for (const [x, y] of [[-8, -12], [4, 12]]) { roundStar(g, x, y, 5, 2.2, 6); paint(g, '#ffe44a', 1.3); }
      tennis(g, 16, -12, 8);
      g.beginPath(); g.moveTo(22, -2); g.lineTo(18, 3); g.lineTo(21, 3); g.lineTo(17, 9); stroke(g, INK, 3.4); g.beginPath(); g.moveTo(22, -2); g.lineTo(18, 3); g.lineTo(21, 3); g.lineTo(17, 9); stroke(g, '#ffe44a', 1.8);
      break;
    }
    case 'multi': {
      const oy = 20;
      for (let i = -2; i <= 2; i++) {
        const a = i * 0.6 - Math.PI / 2, cx = Math.cos(a), cy = Math.sin(a);
        g.beginPath(); g.moveTo(cx * 7, oy + cy * 7); g.lineTo(cx * 17.5, oy + cy * 17.5); g.strokeStyle = lin(g, cx * 7, oy + cy * 7, cx * 17.5, oy + cy * 17.5, [[0, 'rgba(255,250,240,0)'], [1, 'rgba(255,250,240,0.95)']]); g.lineWidth = 3.2; g.stroke();
      }
      for (let i = -2; i <= 2; i++) { const a = i * 0.6 - Math.PI / 2; tennis(g, Math.cos(a) * 25, oy + Math.sin(a) * 25, 6.4); }
      ell(g, 0, oy + 1, 4.5, 3.8); paint(g, volR(g, '#8a4a2c', 0, oy + 1, 4.5), 1.4);
      for (const [x, y] of [[-4.5, oy - 3.5], [-1.5, oy - 5], [1.5, oy - 5], [4.5, oy - 3.5]]) { circ(g, x, y, 1.6); paint(g, '#8a4a2c', 1.1); }
      break;
    }
    case 'decoy': {
      for (const [x, y, r] of [[-14, 12, 6], [-19, 5, 4.5], [-9, 18, 4]]) { circ(g, x, y, r); g.fillStyle = hexA('#9ee05a', 0.85); g.fill(); stroke(g, hexA('#4f8f3a', 0.9), 1.2); }
      g.save(); g.translate(3, 2); g.rotate(0.15);
      ell(g, 2, 8, 12, 8.5); paint(g, vol(g, '#ffe44a', -10, 0, 14, 16, 0.4, 0.25), 2);
      g.beginPath(); g.moveTo(-3, 4); g.quadraticCurveTo(-8, -8, -4, -14); g.lineTo(2, -13); g.quadraticCurveTo(0, -6, 5, 3); g.closePath(); paint(g, vol(g, '#ffe44a', -8, -14, 5, 4), 1.8);
      circ(g, -1, -15, 5.5); paint(g, volR(g, '#ffe44a', -1, -15, 5.5), 1.8);
      g.beginPath(); g.moveTo(-3, -20); g.quadraticCurveTo(-3, -24, 0, -22); g.quadraticCurveTo(2, -25, 3, -20); g.closePath(); paint(g, '#ff4a4a', 1.2);
      g.beginPath(); g.moveTo(4, -16); g.lineTo(10, -14.5); g.lineTo(4, -12.5); g.closePath(); paint(g, '#ff9a3c', 1.2);
      g.beginPath(); g.moveTo(-2.2, -17.5); g.lineTo(0.6, -15); g.moveTo(0.6, -17.5); g.lineTo(-2.2, -15); stroke(g, INK, 1.3);
      g.restore();
      for (let i = 0; i < 3; i++) ribbonStroke(g, () => { g.beginPath(); g.arc(12, -10, 7 + i * 4.5, -1.2, -0.1); }, 1.6);
      break;
    }
    case 'blaze': {
      g.beginPath(); g.moveTo(-14, 6); g.bezierCurveTo(-20, -8, -8, -12, -8, -24); g.bezierCurveTo(-2, -16, 2, -18, 3, -26); g.bezierCurveTo(10, -18, 18, -12, 15, 6); g.closePath();
      paint(g, lin(g, 0, -26, 0, 8, [[0, '#ffe44a'], [0.5, '#ff9a3c'], [1, '#e8362a']]), 2);
      g.beginPath(); g.moveTo(-8, 4); g.bezierCurveTo(-11, -6, -3, -8, -2, -16); g.bezierCurveTo(4, -10, 10, -6, 8, 4); g.closePath(); g.fillStyle = '#fff3a0'; g.fill();
      tennis(g, 0, 8, 11);
      break;
    }
    case 'fetchstorm': {
      for (const [x, y] of [[-14, 0], [0, 6], [14, -2], [-7, 16], [9, 17]]) { ribbonStroke(g, () => { g.beginPath(); g.moveTo(x - 5, y - 10); g.lineTo(x - 1.5, y - 3); }, 1.5); }
      for (const [x, y] of [[-14, 0], [0, 6], [14, -2], [-7, 16], [9, 17]]) tennis(g, x, y, 5.4);
      g.beginPath(); g.moveTo(-18, -12); g.bezierCurveTo(-24, -12, -24, -22, -16, -21); g.bezierCurveTo(-14, -28, -2, -28, 0, -22); g.bezierCurveTo(4, -28, 16, -27, 16, -20); g.bezierCurveTo(24, -21, 24, -12, 17, -12); g.closePath();
      paint(g, vol(g, '#f4f0ff', -24, -28, 24, -12, 0.3, 0.2), 1.8);
      break;
    }
    case 'woof': {
      dogHeadProfile(g, -9, 2, 1.25, '#8a4a2c', true, -0.1);
      for (let i = 0; i < 3; i++) ribbonStroke(g, () => { g.beginPath(); g.arc(4, 4, 10 + i * 6.5, -0.7, 0.7); }, 2.8 - i * 0.4);
      break;
    }
    case 'goodboy': {
      g.beginPath(); g.ellipse(0, -16, 12, 4, 0, 0, TAU); stroke(g, INK, 5.2); g.beginPath(); g.ellipse(0, -16, 12, 4, 0, 0, TAU); stroke(g, '#ffe070', 3);
      heartPath(g, 0, 4, 15); paint(g, vol(g, '#ff5a7a', -15, -10, 15, 18, 0.45, 0.3), 2);
      shine(g, -7, -2, 3.5, 2, -0.6, 0.8);
      sparkle(g, 16, -8, 3, '#fff6c0'); sparkle(g, -17, 10, 2.4, '#fff6c0');
      break;
    }
    case 'zoom': {
      for (let i = 0; i < 4; i++) ribbonStroke(g, () => { g.beginPath(); g.moveTo(-24 + i * 2, -11 + i * 7); g.lineTo(-6 + i * 3, -11 + i * 7); }, 2.2);
      g.save(); g.translate(9, 0); g.rotate(0.35);
      ell(g, 0, 5, 8, 7); paint(g, volR(g, '#8a4a2c', 0, 5, 8, 0.35, 0.25), 1.8);
      for (const [x, y] of [[-8, -4], [-3, -9], [3, -9], [8, -4]]) { ell(g, x, y, 3, 3.4); paint(g, volR(g, '#8a4a2c', x, y, 3.2, 0.35, 0.2), 1.5); }
      ell(g, 0, 6, 4, 3); g.fillStyle = '#e8b890'; g.fill();
      g.restore();
      sparkle(g, 18, -15, 3.4, '#fff6c0');
      break;
    }
    case 'packcall': {
      ghostPup(g, -9, 4, 0.95, 0.85); ghostPup(g, 10, -2, 1.1, 0.95);
      sparkle(g, -16, -14, 2.4, '#ffffff'); sparkle(g, 19, 14, 2.2, '#ffffff');
      break;
    }
    case 'treat': {
      g.save(); g.rotate(-0.3);
      bonePath(g, -9, 9, 5, 5.5); paint(g, vol(g, '#e8a060', -16, -10, 16, 10, 0.4, 0.3), 2);
      g.fillStyle = '#ff8fb0'; heartPath(g, 0, 0.5, 3.8); g.fill();
      g.restore();
      for (const [x, y, s] of [[-14, -14, 3.4], [15, -12, 2.8], [14, 13, 2.2]]) { g.save(); g.translate(x, y); rr(g, -s * 0.35, -s, s * 0.7, s * 2, 1); g.fillStyle = '#8fe0a0'; g.fill(); rr(g, -s, -s * 0.35, s * 2, s * 0.7, 1); g.fill(); g.restore(); }
      sparkle(g, 0, -17, 3, '#fff6c0');
      break;
    }
    case 'howl': {
      circ(g, 10, -10, 15); paint(g, volR(g, '#fff6c0', 10, -10, 15, 0.45, 0.12), 1.8);
      for (const [x, y, r] of [[16, -14, 2.4], [13, -1, 1.8], [20, -5, 1.3]]) { circ(g, x, y, r); g.fillStyle = hexA('#e0c880', 0.7); g.fill(); }
      const hx = -7, hy = -3;
      const cap = (a, d, rx, ry) => { const cx = hx + Math.cos(a) * d, cy = hy + Math.sin(a) * d; g.moveTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * rx); g.ellipse(cx, cy, rx, ry, a, 0, TAU); };
      const dog = () => {
        g.beginPath();
        g.moveTo(-25, 31); g.quadraticCurveTo(-23, 10, -14, 1); g.lineTo(-1, 4); g.quadraticCurveTo(-7, 16, -5, 31); g.closePath();
        g.moveTo(hx + 9, hy); g.arc(hx, hy, 9, 0, TAU);
        cap(-0.98, 11, 10.5, 3.9);
        cap(-0.42, 8.5, 7.5, 2.8);
        g.moveTo(hx - 3, hy - 7); g.lineTo(hx - 9, hy - 19); g.lineTo(hx + 3, hy - 9); g.closePath();
      };
      dog(); stroke(g, INK, 4.2);
      dog(); g.fillStyle = lin(g, -25, -22, 10, 31, [[0, '#57518a'], [1, '#242042']]); g.fill();
      circ(g, hx + 1.5, hy - 3.5, 1.4); g.fillStyle = '#fff6c0'; g.fill();
      ell(g, hx + Math.cos(-0.98) * 20.5, hy + Math.sin(-0.98) * 20.5, 2, 1.6, -0.98); g.fillStyle = '#12101e'; g.fill();
      g.beginPath(); g.moveTo(-18, 2); g.quadraticCurveTo(-19, 14, -20, 26); stroke(g, hexA('#9a94d8', 0.6), 1.3);
      for (let i = 0; i < 3; i++) ribbonStroke(g, () => { g.beginPath(); g.arc(hx + 15, hy - 21, 3 + i * 3.6, -1.2, 0.1); }, 1.4);
      break;
    }
    case 'moonhowl': {
      g.beginPath(); g.arc(-4, -12, 10, 0.75, TAU - 0.75); g.arc(1.5, -15, 8.5, TAU - 1.05, 1.05, true); g.closePath(); paint(g, vol(g, '#fff6c0', -14, -22, 6, -2, 0.4, 0.15), 1.8);
      for (const [x, w] of [[-12, 5], [2, 6], [15, 4.5]]) {
        g.fillStyle = lin(g, 0, -4, 0, 24, [[0, hexA('#fff6c0', 0.1)], [0.5, hexA('#fff6c0', 0.8)], [1, hexA('#ffffff', 0.95)]]);
        g.beginPath(); g.moveTo(x - w * 0.3, -4); g.lineTo(x + w * 0.3, -4); g.lineTo(x + w * 0.5, 20); g.lineTo(x - w * 0.5, 20); g.closePath(); g.fill();
        ell(g, x, 21, w * 1.2, 2.2); g.fillStyle = hexA('#ffffff', 0.9); g.fill();
      }
      sparkle(g, 12, -16, 3.4, '#ffffff'); sparkle(g, 20, -4, 2.2, '#ffffff');
      break;
    }
    default: circ(g, 0, 0, 12); paint(g, CREAM, 2);
  }
}
function skillTile(g, tree, passive) {
  const [a, b, c] = SKILL_BG[tree] || SKILL_BG.attack;
  rr(g, 2.5, 2.5, 59, 59, 14);
  g.fillStyle = lin(g, 4, 4, 60, 60, [[0, a], [0.55, b], [1, c]]); g.fill();
  g.save(); rr(g, 2.5, 2.5, 59, 59, 14); g.clip();
  g.fillStyle = rad(g, 22, 18, 34, [[0, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = -64; i < 64; i += 9) { g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 64, 0); g.lineTo(i + 68, 0); g.lineTo(i + 4, 64); g.fill(); }
  g.restore();
  if (passive) { rr(g, 6, 6, 52, 52, 11); g.setLineDash([3, 3]); stroke(g, 'rgba(255,240,200,0.8)', 1.4); g.setLineDash([]); }
  rr(g, 2.5, 2.5, 59, 59, 14); stroke(g, INK, 2.4);
  rr(g, 4.5, 4.5, 55, 55, 12); stroke(g, 'rgba(255,255,255,0.45)', 1.2);
}

// ================================================================== public API
const SHAPES = { sword: drawSword, ball: drawBall, staff: drawStaff, fuma: (g, v, c, ns) => drawFuma(g, v, c, ns, ICON_KIT), flail: (g, v, c, ns) => drawFlail(g, v, c, ns, ICON_KIT), lance: (g, v, c, ns) => drawLance(g, v, c, ns, ICON_KIT), hat: drawHat, outfit: drawOutfit, collar: drawCollar, charm: drawCharm, boots: drawBoots, paws: drawPaws };
/** Icon for an Item (gear, gem, material item, potion item). Cached by shape+variant+colors+rarity. */
export function itemIcon(item) {
  if (!item) return '';
  if (item.kind === 'gem' || (item.icon && item.icon.shape === 'gem')) return gemIcon(item.gemType || item.icon.variant, item.gemTier ?? item.icon.tier ?? 0);
  if (item.kind === 'material') return materialIcon(item.key || item.base);
  if (item.kind === 'potion') return potionIcon(item.key);
  const ic = item.icon || { shape: 'sword', variant: 'bone', colors: ['#f4e8cf', '#c23b3b', '#f2e4c6'] };
  const draw = SHAPES[ic.shape];
  const rarity = item.rarity || 'normal';
  const key = `i|${ic.shape}|${ic.variant}|${(ic.colors || []).join(',')}|${rarity}`;
  return cached(key, () => compose(g => (draw ? draw(g, ic.variant, ic.colors) : null), { rarity }));
}
export function gemIcon(type, tier = 0) {
  const COLS = { ruby: ['#e8364a', '#ff9aa8', '#8a1a2a'], blueberry: ['#4a6ae8', '#a8c0ff', '#22307a'], lemon: ['#ffd83a', '#fff6b0', '#c89a10'], cheese: ['#ffc83a', '#fff0a0', '#b88a1a'], diamond: ['#e8f4ff', '#ffffff', '#9ab8d8'], topaz: ['#ffa82a', '#ffe08a', '#b86a10'] };
  return cached(`g|${type}|${tier}`, () => compose(g => drawGem(g, type, tier, COLS[type] || COLS.ruby), { rarity: tier === 2 ? 'gemP' : 'normal' }));
}
export function potionIcon(key) { return cached(`p|${key}`, () => compose(g => drawPotion(g, key))); }
export function materialIcon(key) { return cached(`m|${key}`, () => compose(g => drawMaterial(g, key))); }
export function skillIcon(id) {
  return cached(`s|${id}`, () => {
    const { c, g } = newCanvas();
    const tree = id === 'attack' ? 'attack' : SKILL_TREE[id] || 'attack';
    skillTile(g, tree, PASSIVE.has(id));
    const art = compose(gg => drawSkill(gg, id));
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.save(); rr(g, 2.5 * ICON_RES, 2.5 * ICON_RES, 59 * ICON_RES, 59 * ICON_RES, 14 * ICON_RES); g.clip();
    const k = 0.86, off = (1 - k) * 32 * ICON_RES;
    g.drawImage(art, off, off, art.width * k, art.height * k);
    g.restore(); g.restore();
    return c;
  });
}
/** Big list of every icon (for the test sheet). */
export const ICON_SHAPES = SHAPES;
/** The drawing primitives, for other icon sets in the same painted look (life/pantryIcons.js). */
export const ICON_KIT = { INK, TAU, L, D, rr, circ, ell, lin, rad, vol, volR, paint, stroke, shine, sparkle, starPath, roundStar, heartPath, glow, hexA, shadow, seeded, compose, cached, drawBone };
