// Pantry icons (docs/HOMESTEAD.md §1): a painted canvas icon for every seed, crop, fish, forage item and dish, in the
// rpg/icons.js look (64×64 logical, soft volume gradients lit from the top-left, warm ink outlines, glossy shines and
// the cream sticker rim). pantryIcon(id) → cached data URL. No DOM access at import time.
import { ICON_KIT as K } from '../rpg/icons.js';
import { PANTRY, CROPS } from './pantry.js';

const { INK, TAU, L, D, rr, circ, ell, lin, rad, vol, volR, paint, stroke, shine, sparkle, roundStar, glow, hexA, shadow, seeded, compose, cached } = K;

// ================================================================== small parts
function leafPath(g, len, wid) { g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(len * 0.3, -wid, len * 0.75, -wid * 0.9, len, 0); g.bezierCurveTo(len * 0.75, wid * 0.9, len * 0.3, wid, 0, 0); g.closePath(); }
/** A pointed leaf from (x, y) pointing along rot (0 = +x), with a midrib. */
function leaf(g, x, y, len, wid, rot, col = '#6ab84e', lw = 1.6) {
  g.save(); g.translate(x, y); g.rotate(rot);
  leafPath(g, len, wid); paint(g, vol(g, col, 0, -wid, len, wid, 0.35, 0.25), lw);
  g.beginPath(); g.moveTo(len * 0.12, 0); g.quadraticCurveTo(len * 0.5, -wid * 0.18, len * 0.86, 0); stroke(g, hexA(D(col, 0.3), 0.6), 0.9);
  g.restore();
}
function steam(g, x, y, n = 3, h = 12) {
  g.save(); g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const sx = x + (i - (n - 1) / 2) * 6;
    g.beginPath(); g.moveTo(sx, y); g.bezierCurveTo(sx - 3, y - h * 0.35, sx + 3, y - h * 0.6, sx, y - h);
    stroke(g, 'rgba(255,255,255,0.75)', 2.2);
  }
  g.restore();
}
const dots = (g, pts, r, col) => { g.fillStyle = col; for (const [x, y] of pts) { circ(g, x, y, r); g.fill(); } };
/** A crescent moon (opening to the upper right). */
function crescent(g, x, y, r, col) {
  g.beginPath(); g.arc(x, y, r, 0.35 * Math.PI, 1.85 * Math.PI, false);
  g.arc(x + r * 0.42, y - r * 0.3, r * 0.78, 1.72 * Math.PI, 0.47 * Math.PI, true); g.closePath();
  paint(g, volR(g, col, x - r * 0.3, y, r, 0.5, 0.2), 1.5);
}

// ================================================================== crops
function turnip(g) {
  leaf(g, -2, -8, 17, 5, -2.0, '#6ab84e'); leaf(g, 2, -8, 17, 5, -1.1, '#5aa84a'); leaf(g, 0, -9, 20, 5.5, -1.55, '#7cc45a');
  g.beginPath(); g.moveTo(0, 16); g.bezierCurveTo(-4, 13, -15, 9, -14, 0); g.bezierCurveTo(-13, -8, -6, -10, 0, -10); g.bezierCurveTo(6, -10, 13, -8, 14, 0); g.bezierCurveTo(15, 9, 4, 13, 0, 16); g.closePath();
  paint(g, lin(g, 0, -10, 0, 15, [[0, '#d070b4'], [0.32, '#f2c2e2'], [0.6, '#fffaf6'], [1, '#eadcd2']]), 2);
  g.beginPath(); g.moveTo(0, 15); g.quadraticCurveTo(-1, 20, 2, 24); stroke(g, INK, 2.6); g.beginPath(); g.moveTo(0, 15); g.quadraticCurveTo(-1, 20, 2, 24); stroke(g, '#eadcd2', 1.2);
  shine(g, -7, -3, 3.5, 2, -0.6, 0.8);
}
function carrot(g) {
  g.save(); g.rotate(0.38);
  leaf(g, 0, -10, 15, 4.2, -2.05, '#5ab04a'); leaf(g, 0, -10, 15, 4.2, -1.1, '#4f9a40'); leaf(g, 0, -11, 18, 4.5, -1.57, '#7cc45a');
  g.beginPath(); g.moveTo(-8, -9); g.quadraticCurveTo(0, -13, 8, -9); g.quadraticCurveTo(7, 6, 1, 21); g.quadraticCurveTo(0, 22.5, -1, 21); g.quadraticCurveTo(-7, 6, -8, -9); g.closePath();
  paint(g, vol(g, '#ff8a3a', -8, -12, 8, 21, 0.42, 0.25), 2);
  g.strokeStyle = hexA('#b8501a', 0.6); g.lineWidth = 1.2;
  for (const [y, s] of [[-3, 1], [3, -1], [9, 1]]) { g.beginPath(); g.moveTo(s * -5 + (s > 0 ? -1 : 2), y); g.quadraticCurveTo(s * -2, y + 1.6, s * 1.5, y + 0.6); g.stroke(); }
  shine(g, -4, -3, 1.8, 5, 0.1, 0.7);
  g.restore();
}
function cabbage(g) {
  for (const [a, c] of [[-0.95, '#5aa84a'], [0.95, '#5aa84a'], [0, '#4f9a40']]) { g.save(); g.rotate(a); ell(g, 0, 8, 15, 10); paint(g, vol(g, c, -15, -2, 15, 18, 0.3, 0.25), 1.8); g.restore(); }
  circ(g, 0, -1, 14); paint(g, volR(g, '#b0e47e', 0, -1, 14, 0.5, 0.25), 2);
  g.save(); circ(g, 0, -1, 13.5); g.clip(); g.strokeStyle = 'rgba(240,252,214,0.85)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(2, 13); g.quadraticCurveTo(-3, 0, 1, -14); g.stroke();
  for (const [y, s] of [[-6, -1], [-1, 1], [4, -1], [8, 1]]) { g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(s * 5, y - 2, s * 9, y - 6); g.stroke(); }
  g.restore();
  g.beginPath(); g.moveTo(-14, 1); g.quadraticCurveTo(-11, 14, 7, 13); g.quadraticCurveTo(-3, 8, -5, -5); g.quadraticCurveTo(-11, -4, -14, 1); g.closePath(); paint(g, vol(g, '#8fd068', -14, -5, 7, 14, 0.3, 0.2), 1.6);
  shine(g, -5, -8, 4, 2.2, -0.5, 0.75);
}
function daikon(g) {
  g.save(); g.rotate(0.5); g.scale(0.86, 0.86);
  for (const [r, c, l] of [[-2.15, '#5aa84a', 18], [-1.05, '#4f9a40', 18], [-1.85, '#7cc45a', 22], [-1.3, '#6ab84e', 22]]) leaf(g, 0, -9, l, 4.6, r, c);
  g.beginPath(); g.moveTo(-7, -9); g.quadraticCurveTo(0, -12, 7, -9); g.quadraticCurveTo(8, 12, 2, 25); g.quadraticCurveTo(0, 27, -2, 25); g.quadraticCurveTo(-8, 12, -7, -9); g.closePath();
  paint(g, lin(g, 0, -11, 0, 26, [[0, '#b8e08a'], [0.22, '#eef8dc'], [0.4, '#fffcf6'], [1, '#ece4d8']]), 2);
  g.strokeStyle = hexA('#b8a890', 0.55); g.lineWidth = 1; for (const y of [2, 8, 14, 19]) { g.beginPath(); g.moveTo(-5, y); g.quadraticCurveTo(-2, y + 1.2, 1, y + 0.4); g.stroke(); }
  shine(g, -3.5, 1, 1.6, 6, 0.05, 0.75);
  g.restore();
}
function berry(g, x, y, r, rot) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.beginPath(); g.moveTo(0, r * 1.15); g.bezierCurveTo(-r * 1.12, r * 0.42, -r * 1.06, -r * 0.78, 0, -r * 0.72); g.bezierCurveTo(r * 1.06, -r * 0.78, r * 1.12, r * 0.42, 0, r * 1.15); g.closePath();
  paint(g, volR(g, '#ff4a5e', 0, 0, r * 1.1, 0.5, 0.3), 2);
  g.fillStyle = '#ffe070'; for (const [sx, sy] of [[-0.45, -0.2], [0.05, -0.3], [0.5, -0.15], [-0.25, 0.2], [0.3, 0.25], [0, 0.65], [-0.6, 0.3]]) { ell(g, sx * r, sy * r, r * 0.07, r * 0.11); g.fill(); }
  roundStar(g, 0, -r * 0.75, r * 0.6, r * 0.25, 5); paint(g, '#5aa84a', 1.4);
  shine(g, -r * 0.4, -r * 0.25, r * 0.22, r * 0.13, -0.5, 0.8);
  g.restore();
}
function strawberry(g) {
  leaf(g, 2, -6, 15, 6, -0.55, '#5aa84a');
  berry(g, 7, -2, 9, 0.35);
  berry(g, -4, 4, 12, -0.2);
}
function rice(g) {
  g.save(); g.rotate(-0.15);
  const tops = [];
  for (let i = -3; i <= 3; i++) {
    const x0 = i * 1.5, y0 = 19, x1 = i * 3.4, y1 = -7 - (3 - Math.abs(i)) * 1.6;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + (x1 - x0) * 0.3, 6, x1, y1); stroke(g, INK, 3.4);
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + (x1 - x0) * 0.3, 6, x1, y1); stroke(g, i % 2 ? '#d8b850' : '#e8c860', 1.8);
    tops.push([x1, y1, i]);
  }
  for (const [x, y, i] of tops) { // drooping heads of grain
    const dir = i === 0 ? 1 : Math.sign(i);
    for (let k = 0; k < 5; k++) { const t = k / 4, gx = x + dir * (2 + t * 6), gy = y + t * t * 7 - 1; ell(g, gx, gy, 2.4, 1.6, dir * (0.5 + t)); paint(g, vol(g, '#f4d27a', gx - 2, gy - 2, gx + 2, gy + 2, 0.4, 0.2), 1.1); }
  }
  ell(g, 0, 19, 7, 2.6); paint(g, vol(g, '#f0dca0', -7, 17, 7, 21), 1.6);
  rr(g, -6.5, 6, 13, 4.5, 2); paint(g, vol(g, '#e8503a', -6, 6, 6, 10, 0.35, 0.2), 1.6);
  g.restore();
}
function pumpkin(g) {
  ell(g, 0, 4, 19, 14); paint(g, volR(g, '#ff9a3a', 0, 4, 19, 0.45, 0.3), 2);
  g.strokeStyle = hexA('#c8601a', 0.75); g.lineWidth = 1.4;
  for (const k of [-1, 1]) { ell(g, k * 6.5, 4, 6.5, 13.6); g.stroke(); }
  g.beginPath(); g.moveTo(0, -9.5); g.lineTo(0, 17.5); g.stroke();
  rr(g, -2.6, -15, 5.2, 7.5, 2); paint(g, vol(g, '#7a9a3a', -3, -15, 3, -8), 1.6);
  g.beginPath(); g.moveTo(2, -12); g.bezierCurveTo(8, -18, 12, -10, 7, -9); stroke(g, INK, 2.4); g.beginPath(); g.moveTo(2, -12); g.bezierCurveTo(8, -18, 12, -10, 7, -9); stroke(g, '#8fbf4a', 1.1);
  leaf(g, -2, -11, 13, 5, -2.6, '#6aa84a');
  shine(g, -10, -1, 4.5, 2.4, -0.6, 0.75);
}
function melon(g) {
  circ(g, 0, 3, 17); paint(g, volR(g, '#bfe384', 0, 3, 17, 0.45, 0.3), 2);
  g.save(); circ(g, 0, 3, 16.4); g.clip();
  const r = seeded(7); g.strokeStyle = 'rgba(248,252,232,0.9)'; g.lineWidth = 1.15;
  for (let i = -3; i <= 3; i++) for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-20, 3 + i * 6 + s * 2); for (let x = -20; x <= 20; x += 5) g.lineTo(x, 3 + i * 6 + s * (x * 0.35) + (r() - 0.5) * 2.2); g.stroke(); }
  g.restore();
  rr(g, -1.6, -18.5, 3.2, 7, 1.2); paint(g, '#8a7a3a', 1.4); rr(g, -6, -19.5, 12, 3, 1.4); paint(g, '#8a7a3a', 1.4);
  leaf(g, 3, -14, 13, 5, -0.5, '#5a9a4a');
  shine(g, -7, -4, 4.5, 2.4, -0.6, 0.8);
}
const CROP_ART = { turnip, carrot, cabbage, daikon, strawberry, rice, pumpkin, melon };

function seedPacket(g, crop) {
  const C = CROPS[crop] || { color: '#8fcf6a', accent: '#5aa84a' };
  shadow(g, 24, 16, 3.4);
  g.save(); g.rotate(-0.1);
  rr(g, -15, -21, 30, 42, 4); paint(g, lin(g, -15, -21, 15, 21, [[0, '#fffaf0'], [1, '#efd9b2']]), 2);
  const band = crop === 'turnip' || crop === 'daikon' ? C.accent : C.color;
  g.save(); rr(g, -15, -21, 30, 42, 4); g.clip();
  g.fillStyle = band; g.fillRect(-16, -22, 32, 9.5);
  g.fillStyle = hexA('#ffffff', 0.35); for (let x = -14; x < 16; x += 4) { g.beginPath(); g.arc(x, -12.4, 1.6, 0, TAU); g.fill(); }
  g.fillStyle = hexA(D(band, 0.2), 0.9); g.fillRect(-16, 16, 32, 6);
  g.restore();
  g.beginPath(); g.moveTo(-15, -12.4); g.lineTo(15, -12.4); stroke(g, hexA(INK, 0.5), 1.1);
  rr(g, -11, -9, 22, 23, 6); paint(g, '#fffdf8', 1.5);
  g.save(); rr(g, -10.4, -8.4, 20.8, 21.8, 5.5); g.clip(); g.translate(0, 2.5); g.scale(0.42, 0.42); CROP_ART[crop]?.(g); g.restore();
  g.restore();
  for (const [x, y, rot] of [[14, 19, 0.5], [18, 15, -0.3], [11, 22, 1.2]]) { ell(g, x, y, 2.2, 1.5, rot); paint(g, vol(g, '#c89a68', x - 2, y - 2, x + 2, y + 2), 1.1); }
  sparkle(g, -14, -18, 3, '#ffffff');
}

// ================================================================== fish (facing left: head at -x, tail at +x)
const FISH = {
  crucian: { body: '#d0a858', back: '#8a6a30', belly: '#f6e4a8', fin: '#b88a40', len: 19, h: 11 },
  koi: { body: '#fff8f2', back: '#fff4ec', belly: '#ffffff', fin: '#ffe2d8', len: 21, h: 8.5, pat: 'koi', pc: '#ff5a3a' },
  goldKoi: { body: '#ffd84a', back: '#f4ac2a', belly: '#fff4b8', fin: '#ffe680', len: 21, h: 8.5, pat: 'scales', pc: '#fff6c0', glow: '#ffe070', sparkle: true },
  ayu: { body: '#cfd09a', back: '#7a8a50', belly: '#f6f6ea', fin: '#e8e2a8', len: 22, h: 6.5, pat: 'ayu', pc: '#ffd84a' },
  trout: { body: '#cfcfb6', back: '#6a7a5a', belly: '#fff8f0', fin: '#c8c0a0', len: 21, h: 7.5, pat: 'parr', pc: '#5a6870' },
  char: { body: '#8a9a8c', back: '#48585a', belly: '#f4c890', fin: '#f0a870', len: 21, h: 7.5, pat: 'spots', pc: '#f6f2e0' },
  seaBream: { body: '#ff8a9a', back: '#e05568', belly: '#ffe2e6', fin: '#ff9aaa', len: 19, h: 11, pat: 'dots', pc: '#8ad0ff' },
  mackerel: { body: '#9ccad8', back: '#2a6a8a', belly: '#f6fafa', fin: '#8ab8c8', len: 22, h: 6.6, pat: 'waves', pc: '#1a3a5a' },
  salmon: { body: '#dccad2', back: '#6a7a9a', belly: '#ffd8d0', fin: '#c8b0b8', len: 22, h: 8, pat: 'blush', pc: '#ff9a8a' },
  loach: { body: '#bca474', back: '#7a6040', belly: '#efe0bc', fin: '#a88a5a', len: 23, h: 4.6, pat: 'spots', pc: '#6a5030', whiskers: true },
  rainbowTrout: { body: '#dbe2ea', back: '#7a8a7a', belly: '#ffffff', fin: '#c8d0c8', len: 22, h: 7.5, pat: 'rainbow', pc: '#ff8aa8' },
  moonKoi: { body: '#f6f9ff', back: '#e2eaff', belly: '#ffffff', fin: '#eef2ff', len: 21, h: 8.5, pat: 'koi', pc: '#a8c4ff', glow: '#b8d0ff', moon: true, sparkle: true },
};
function fishBody(g, len, h) {
  g.beginPath(); g.moveTo(-len, 0); g.bezierCurveTo(-len * 0.82, -h * 1.12, len * 0.38, -h * 1.15, len * 0.72, -h * 0.24); g.lineTo(len * 0.72, h * 0.24);
  g.bezierCurveTo(len * 0.38, h * 1.15, -len * 0.82, h * 1.12, -len, 0); g.closePath();
}
function fish(g, id, o = FISH[id]) {
  const len = o.len, h = o.h * 1.12;
  if (o.glow) glow(g, 0, 0, 30, o.glow, 0.55);
  shadow(g, 22, 20, 3.2);
  g.save(); g.rotate(-0.22); g.scale(1.14, 1.14);
  // tail and fins (behind the body)
  g.beginPath(); g.moveTo(len * 0.62, 0); g.quadraticCurveTo(len * 0.95, -h * 0.9, len * 1.18, -h * 1.05); g.quadraticCurveTo(len * 1.02, 0, len * 1.18, h * 1.05); g.quadraticCurveTo(len * 0.95, h * 0.9, len * 0.62, 0); g.closePath();
  paint(g, vol(g, o.fin, len * 0.6, -h, len * 1.2, h, 0.3, 0.25), 1.8);
  g.strokeStyle = hexA(D(o.fin, 0.35), 0.5); g.lineWidth = 0.9; for (const k of [-0.55, 0, 0.55]) { g.beginPath(); g.moveTo(len * 0.75, k * h * 0.3); g.lineTo(len * 1.1, k * h); g.stroke(); }
  g.beginPath(); g.moveTo(-len * 0.2, -h * 0.92); g.quadraticCurveTo(len * 0.05, -h * 1.75, len * 0.38, -h * 0.78); g.closePath(); paint(g, vol(g, o.fin, -len * 0.2, -h * 1.7, len * 0.4, -h * 0.7), 1.6);
  g.beginPath(); g.moveTo(-len * 0.18, h * 0.85); g.quadraticCurveTo(-len * 0.02, h * 1.5, len * 0.14, h * 0.82); g.closePath(); paint(g, o.fin, 1.4);
  // body
  fishBody(g, len, h); paint(g, lin(g, 0, -h, 0, h, [[0, o.back], [0.45, o.body], [1, o.belly]]), 2);
  g.save(); fishBody(g, len, h); g.clip();
  const r = seeded(id.length * 31 + len);
  if (o.pat === 'koi') { g.fillStyle = o.pc; for (const [x, y, rx, ry, rot] of [[-len * 0.55, -h * 0.55, 6, 5, 0.3], [-len * 0.05, -h * 0.75, 7.5, 5, -0.2], [len * 0.42, -h * 0.35, 4.5, 4, 0.4], [len * 0.1, h * 0.35, 3, 2.4, 0]]) { ell(g, x, y, rx, ry, rot); g.fill(); } }
  else if (o.pat === 'scales') { g.strokeStyle = hexA(o.pc, 0.75); g.lineWidth = 1; for (let x = -len * 0.5; x < len * 0.7; x += 4.5) for (let y = -h; y < h; y += 4) { g.beginPath(); g.arc(x + ((y / 4) & 1) * 2.2, y, 2.4, 0.3, Math.PI - 0.3); g.stroke(); } }
  else if (o.pat === 'ayu') { ell(g, -len * 0.38, -h * 0.05, 3.2, 2.2); g.fillStyle = o.pc; g.fill(); }
  else if (o.pat === 'parr') { g.fillStyle = hexA(o.pc, 0.55); for (let k = 0; k < 6; k++) { ell(g, -len * 0.45 + k * len * 0.22, -h * 0.05, 2.2, 3.6); g.fill(); } dots(g, Array.from({ length: 10 }, () => [-len * 0.5 + r() * len * 1.1, -h * 0.85 + r() * h * 0.6]), 0.8, hexA('#2a3030', 0.7)); }
  else if (o.pat === 'spots') { dots(g, Array.from({ length: 16 }, () => [-len * 0.6 + r() * len * 1.25, -h * 0.9 + r() * h * 1.3]), 1.05, hexA(o.pc, 0.9)); }
  else if (o.pat === 'dots') { dots(g, Array.from({ length: 12 }, () => [-len * 0.45 + r() * len * 1.0, -h * 0.85 + r() * h * 0.9]), 1.1, o.pc); }
  else if (o.pat === 'waves') { g.strokeStyle = o.pc; g.lineWidth = 1.5; for (let k = 0; k < 6; k++) { const x = -len * 0.35 + k * len * 0.18; g.beginPath(); g.moveTo(x, -h); g.quadraticCurveTo(x + 3, -h * 0.65, x, -h * 0.25); g.stroke(); } }
  else if (o.pat === 'blush') { g.fillStyle = hexA(o.pc, 0.45); ell(g, 0, h * 0.1, len * 0.7, h * 0.32); g.fill(); dots(g, Array.from({ length: 9 }, () => [-len * 0.2 + r() * len * 0.8, -h * 0.9 + r() * h * 0.5]), 0.9, hexA('#2a3040', 0.75)); }
  else if (o.pat === 'rainbow') { g.fillStyle = hexA(o.pc, 0.75); ell(g, 0, 0, len * 0.75, h * 0.2); g.fill(); dots(g, Array.from({ length: 14 }, () => [-len * 0.5 + r() * len * 1.15, -h + r() * h * 1.8]), 0.8, hexA('#3a3a40', 0.7)); }
  if (o.moon) { g.fillStyle = '#ffe070'; g.beginPath(); g.arc(-len * 0.05, -h * 0.25, 3.6, 0, TAU); g.fill(); g.fillStyle = o.body; g.beginPath(); g.arc(-len * 0.05 + 1.6, -h * 0.25 - 1, 3.2, 0, TAU); g.fill(); }
  g.restore();
  // gill, eye, mouth
  g.beginPath(); g.arc(-len * 0.42, 0, h * 0.62, -1.1, 1.1); stroke(g, hexA(INK, 0.45), 1.2);
  circ(g, -len * 0.7, -h * 0.18, 2.6); paint(g, '#ffffff', 1.2); circ(g, -len * 0.72, -h * 0.18, 1.4); g.fillStyle = INK; g.fill(); circ(g, -len * 0.74, -h * 0.26, 0.55); g.fillStyle = '#fff'; g.fill();
  g.beginPath(); g.moveTo(-len * 0.99, h * 0.05); g.quadraticCurveTo(-len * 0.93, h * 0.22, -len * 0.86, h * 0.14); stroke(g, INK, 1.1);
  if (o.whiskers) { for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-len * 0.97, h * 0.15); g.quadraticCurveTo(-len * 1.12, h * (0.3 + s * 0.2), -len * 1.2, h * (0.9 + s * 0.5)); stroke(g, INK, 1); } }
  shine(g, -len * 0.25, -h * 0.55, len * 0.18, h * 0.16, -0.15, 0.6);
  g.restore();
  if (o.sparkle) { sparkle(g, 18, -16, 3.6, '#ffffff'); sparkle(g, -20, 15, 2.6, '#ffffff', 0.9); }
}
function flounder(g) {
  shadow(g, 21, 19, 3);
  g.save(); g.rotate(-0.25);
  ell(g, -1, 0, 22, 14); paint(g, vol(g, '#d8b88a', -22, -14, 22, 14, 0.3, 0.2), 1.8); // fringe fin
  g.strokeStyle = hexA('#a88a5a', 0.6); g.lineWidth = 0.9; for (let a = 0; a < TAU; a += 0.32) { g.beginPath(); g.moveTo(Math.cos(a) * 16 - 1, Math.sin(a) * 9.5); g.lineTo(Math.cos(a) * 21 - 1, Math.sin(a) * 13); g.stroke(); }
  g.beginPath(); g.moveTo(16, 0); g.quadraticCurveTo(24, -8, 27, -7); g.quadraticCurveTo(24, 0, 27, 7); g.quadraticCurveTo(24, 8, 16, 0); paint(g, '#c8a070', 1.6);
  ell(g, -2, 0, 17, 9.5); paint(g, vol(g, '#b8946a', -18, -10, 16, 10, 0.35, 0.25), 2);
  const r = seeded(4); dots(g, Array.from({ length: 12 }, () => [-14 + r() * 26, -7 + r() * 13]), 1.5, hexA('#7a5a3a', 0.6)); dots(g, Array.from({ length: 6 }, () => [-12 + r() * 22, -6 + r() * 11]), 1.1, hexA('#fff4e0', 0.7));
  for (const [x, y] of [[-12, -5], [-7, -6.5]]) { circ(g, x, y, 2.4); paint(g, '#fff', 1.1); circ(g, x - 0.4, y, 1.3); g.fillStyle = INK; g.fill(); }
  g.beginPath(); g.moveTo(-17, 2); g.quadraticCurveTo(-15, 4, -13, 3); stroke(g, INK, 1.1);
  shine(g, -4, -4, 6, 2, -0.2, 0.45);
  g.restore();
}
function octopus(g) {
  shadow(g, 22, 17, 3.2);
  const arm = (x0, y0, x1, y1, curl) => { g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + curl, (y0 + y1) / 2 + 6, x1, y1); g.quadraticCurveTo(x1 + curl * 0.4, y1 - 4, x1 - curl * 0.3, y1 - 5); };
  for (const [x0, x1, c] of [[-7, -19, -5], [-3, -10, 5], [2, 4, -5], [6, 15, 5], [9, 21, -4]]) { arm(x0, 4, x1, 19, c); stroke(g, INK, 7.2); arm(x0, 4, x1, 19, c); stroke(g, '#ff7a6a', 4.8); }
  dots(g, [[-15, 15], [-8, 17], [5, 17], [13, 15], [19, 16]], 1.1, '#ffd8c8');
  g.beginPath(); g.moveTo(-14, 6); g.bezierCurveTo(-18, -14, 18, -14, 14, 6); g.quadraticCurveTo(0, 10, -14, 6); g.closePath(); paint(g, volR(g, '#ff7a6a', 0, -4, 16, 0.45, 0.3), 2);
  for (const s of [-1, 1]) { circ(g, s * 5, -1, 2.6); paint(g, '#fff', 1.2); circ(g, s * 5, -0.6, 1.4); g.fillStyle = INK; g.fill(); }
  ell(g, 0, 4, 2.4, 1.8); paint(g, '#e8505a', 1.2);
  for (const s of [-1, 1]) { ell(g, s * 9, 2.4, 2.2, 1.2); g.fillStyle = hexA('#ff4a6a', 0.5); g.fill(); }
  shine(g, -6, -8, 4, 2.2, -0.5, 0.8);
}
function pufferfish(g) {
  shadow(g, 22, 15, 3);
  g.beginPath(); g.moveTo(14, 0); g.quadraticCurveTo(22, -7, 24, -6); g.quadraticCurveTo(21, 0, 24, 6); g.quadraticCurveTo(22, 7, 14, 0); paint(g, '#f0d070', 1.6);
  for (let a = 0; a < TAU; a += TAU / 16) { const x = Math.cos(a) * 15, y = Math.sin(a) * 14; g.beginPath(); g.moveTo(x * 0.9, y * 0.9); g.lineTo(x * 1.22, y * 1.22); stroke(g, INK, 2.6); g.beginPath(); g.moveTo(x * 0.9, y * 0.9); g.lineTo(x * 1.18, y * 1.18); stroke(g, '#fff6d0', 1.2); }
  circ(g, -1, 0, 15); paint(g, lin(g, 0, -15, 0, 15, [[0, '#e8c04a'], [0.5, '#ffe080'], [0.62, '#fff8e8'], [1, '#ffffff']]), 2);
  dots(g, [[-5, -9], [3, -11], [8, -6], [-9, -4], [1, -5]], 1.4, hexA('#8a6a2a', 0.6));
  for (const s of [-1, 1]) { circ(g, -7 + s * 4.5, -1, 2.8); paint(g, '#fff', 1.2); circ(g, -7.5 + s * 4.5, -0.6, 1.5); g.fillStyle = INK; g.fill(); }
  ell(g, -13, 4, 2.2, 2.6); paint(g, '#ff9aa0', 1.2);
  shine(g, -6, -9, 4, 2, -0.5, 0.8);
}

// ================================================================== forage
function honey(g) {
  shadow(g, 23, 15, 3.2);
  rr(g, -13, -8, 26, 30, 9); paint(g, lin(g, -13, -8, 13, 22, [[0, '#ffe08a'], [0.5, '#ffb830'], [1, '#e88a10']]), 2);
  rr(g, -9, 2, 18, 12, 3); paint(g, '#fff6e0', 1.4); g.save(); g.translate(0, 8); g.scale(0.5, 0.5); hexCell(g, 0, 0, 7, '#ffcf4a'); g.restore();
  g.beginPath(); g.moveTo(-14, -10); g.quadraticCurveTo(0, -16, 14, -10); g.lineTo(13, -5); g.quadraticCurveTo(0, -9, -13, -5); g.closePath(); paint(g, vol(g, '#ff8a9a', -14, -16, 14, -5), 1.8);
  g.beginPath(); g.moveTo(-12, -6); g.quadraticCurveTo(0, -3, 12, -6); stroke(g, INK, 2.2); g.beginPath(); g.moveTo(-12, -6); g.quadraticCurveTo(0, -3, 12, -6); stroke(g, '#e8503a', 1.2);
  g.beginPath(); g.moveTo(-7, -4); g.quadraticCurveTo(-8, 3, -6, 5); g.quadraticCurveTo(-4, 3, -5, -4); paint(g, '#ffc83a', 1.2);
  g.save(); g.translate(11, -14); g.rotate(0.6); rr(g, -1.6, -12, 3.2, 20, 1.6); paint(g, '#c98f5e', 1.4); ell(g, 0, 9, 4, 3); paint(g, vol(g, '#c98f5e', -4, 6, 4, 12), 1.4); g.restore();
  shine(g, -8, -1, 2.2, 6, 0.1, 0.65);
}
function hexCell(g, x, y, r, col) { g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); paint(g, col, 1.6); }
function bamboo(g) {
  shadow(g, 22, 15, 3.2);
  g.save(); g.rotate(-0.14);
  ell(g, 0, 17, 13, 4.6); paint(g, vol(g, '#fff2cc', -13, 12, 13, 22), 1.8); // the cut base
  g.strokeStyle = hexA('#d8b878', 0.8); g.lineWidth = 1; ell(g, 0, 17, 8, 2.6); g.stroke();
  // overlapping husk sheaths, darker and speckled toward their pointed tips, a fresh green tip on top
  const husk = (side, y0, y1, w, c) => {
    g.beginPath(); g.moveTo(side * w * 0.15, y0); g.quadraticCurveTo(side * w * 1.1, y0 - 4, side * w * 0.9, (y0 + y1) / 2); g.quadraticCurveTo(side * w * 0.5, y1 + 4, side * 1.5, y1); g.quadraticCurveTo(side * -w * 0.3, (y0 + y1) / 2, side * w * 0.15, y0); g.closePath();
    paint(g, lin(g, 0, y0, 0, y1, [[0, L(c, 0.25)], [0.6, c], [1, D(c, 0.35)]]), 1.6);
    const r = seeded(Math.round(y1 * 7 + side * 3)); dots(g, Array.from({ length: 4 }, () => [side * (1 + r() * w * 0.5), y1 + 4 + r() * 6]), 0.7, hexA('#5a3a1a', 0.6));
  };
  husk(-1, 17, -6, 13, '#c89a58'); husk(1, 17, -9, 13, '#b8884a'); husk(-1, 16, -16, 10, '#d0a868'); husk(1, 15, -20, 9, '#bc8c4c'); husk(-1, 12, -24, 7, '#c89a58');
  g.beginPath(); g.moveTo(-1.5, -22); g.quadraticCurveTo(0.5, -30, 3, -26); g.quadraticCurveTo(1.5, -22, -1.5, -22); paint(g, '#c8e070', 1.4);
  shine(g, -6, 2, 1.6, 5, 0.25, 0.55);
  g.restore();
}
function shiitake(g) {
  shadow(g, 22, 17, 3.2);
  const shroom = (x, y, s, rot) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
    rr(g, -3.6, -2, 7.2, 15, 3.4); paint(g, vol(g, '#f4e8d0', -4, -2, 4, 13), 1.8);
    g.beginPath(); g.moveTo(-14, 2); g.bezierCurveTo(-14, -14, 14, -14, 14, 2); g.quadraticCurveTo(0, 6, -14, 2); g.closePath(); paint(g, volR(g, '#9a6038', 0, -5, 14, 0.4, 0.3), 2);
    g.strokeStyle = 'rgba(255,240,215,0.9)'; g.lineWidth = 1.3; for (const [a, b] of [[-0.9, 0.3], [0.2, 0.9], [-0.2, -0.95]]) { g.beginPath(); g.moveTo(Math.cos(a) * 3 - 1, -6 + Math.sin(a) * 2); g.lineTo(Math.cos(b) * 8, -6 + Math.sin(b) * 4); g.stroke(); }
    g.beginPath(); g.moveTo(-12, 2); g.quadraticCurveTo(0, 5, 12, 2); stroke(g, hexA('#f4e0c0', 0.8), 1.2);
    shine(g, -6, -8, 3.6, 1.8, -0.4, 0.7);
    g.restore();
  };
  shroom(8, -3, 0.72, 0.3); shroom(-4, 4, 1, -0.15);
}
function seaweed(g) {
  shadow(g, 22, 16, 3);
  const frond = (x, c, sway, h) => { g.beginPath(); g.moveTo(x - 3, 20); for (let y = 20; y > 20 - h; y -= 4) g.lineTo(x - 3 + Math.sin(y * 0.35 + sway) * 3, y); g.lineTo(x + Math.sin((20 - h) * 0.35 + sway) * 3, 20 - h - 3); for (let y = 20 - h; y < 20; y += 4) g.lineTo(x + 3 + Math.sin(y * 0.35 + sway) * 3, y); g.lineTo(x + 3, 20); g.closePath(); paint(g, vol(g, c, x - 6, 20 - h, x + 6, 20, 0.35, 0.3), 1.8); };
  frond(-9, '#3a8a5a', 0, 34); frond(8, '#2f7a50', 1.6, 30); frond(0, '#4aa06a', 0.8, 40);
  rr(g, -15, 9, 30, 13, 2.5); paint(g, vol(g, '#24463a', -15, 9, 15, 22, 0.25, 0.2), 1.8);
  g.strokeStyle = 'rgba(160,210,170,0.4)'; g.lineWidth = 0.9; for (let x = -12; x < 14; x += 4) { g.beginPath(); g.moveTo(x, 11); g.lineTo(x + 2, 20); g.stroke(); }
  sparkle(g, 15, -14, 2.8, '#ffffff');
}

// ================================================================== dishes
function plate(g, w = 24, h = 10, y = 9, rim = '#7ab8ff') {
  ell(g, 0, y + 2, w, h); paint(g, vol(g, '#e8e0d6', -w, y - h, w, y + h + 2, 0.2, 0.2), 2);
  ell(g, 0, y, w, h); paint(g, lin(g, 0, y - h, 0, y + h, [[0, '#ffffff'], [1, '#f2ece2']]), 1.8);
  ell(g, 0, y, w - 3, h - 2.4); stroke(g, hexA(rim, 0.8), 1.4);
}
function bowl(g, { r = 17, y = 0, outer = '#c83a3a', inner = '#2a1a1a', fill = '#d8a060', band = null } = {}) {
  g.beginPath(); g.moveTo(-r, y); g.bezierCurveTo(-r, y + r * 1.0, r, y + r * 1.0, r, y); g.closePath(); paint(g, vol(g, outer, -r, y, r, y + r, 0.4, 0.3), 2);
  rr(g, -r * 0.42, y + r * 0.72, r * 0.84, r * 0.22, 2); paint(g, D(outer, 0.15), 1.6);
  if (band) { g.save(); g.beginPath(); g.moveTo(-r, y); g.bezierCurveTo(-r, y + r * 1.0, r, y + r * 1.0, r, y); g.closePath(); g.clip(); g.fillStyle = band; g.fillRect(-r, y + r * 0.28, r * 2, r * 0.12); g.restore(); }
  ell(g, 0, y, r, r * 0.36); paint(g, inner, 2);
  ell(g, 0, y + 0.6, r - 2, r * 0.36 - 1.8); g.fillStyle = lin(g, 0, y - r * 0.3, 0, y + r * 0.3, [[0, L(fill, 0.2)], [1, D(fill, 0.08)]]); g.fill();
}
function onigiriShape(g, x, y, s, face = true, top = null) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.beginPath(); g.moveTo(0, -17); g.bezierCurveTo(5, -17, 17, 4, 15, 11); g.bezierCurveTo(13, 16, -13, 16, -15, 11); g.bezierCurveTo(-17, 4, -5, -17, 0, -17); g.closePath();
  paint(g, volR(g, '#ffffff', 0, -2, 17, 0.3, 0.12), 2);
  const r = seeded(11); g.fillStyle = 'rgba(214,206,196,0.7)'; for (let i = 0; i < 18; i++) { ell(g, -10 + r() * 20, -10 + r() * 20, 1.4, 0.8, r() * 3); g.fill(); }
  rr(g, -9, 3, 18, 13, 2); paint(g, vol(g, '#24463a', -9, 3, 9, 16, 0.25, 0.2), 1.8);
  if (top) top(g);
  if (face) { for (const s2 of [-1, 1]) { circ(g, s2 * 4.5, -3, 1.4); g.fillStyle = INK; g.fill(); ell(g, s2 * 8, 0, 2.2, 1.2); g.fillStyle = hexA('#ff8fb0', 0.6); g.fill(); } g.beginPath(); g.moveTo(-1.4, -0.6); g.quadraticCurveTo(0, 0.8, 1.4, -0.6); stroke(g, INK, 1.1); }
  shine(g, -6, -9, 3, 1.6, -0.8, 0.8);
  g.restore();
}
function grilledFishArt(g, x, y, s, skewer = false) {
  g.save(); g.translate(x, y); g.scale(s, s);
  const o = { body: '#e0b070', back: '#a8703a', belly: '#f4dcb0', fin: '#c8904a', len: 20, h: 7.5 };
  if (skewer) { g.beginPath(); g.moveTo(-30, 2); g.lineTo(30, -2); stroke(g, INK, 4); g.beginPath(); g.moveTo(-30, 2); g.lineTo(30, -2); stroke(g, '#e8c890', 2); }
  g.beginPath(); g.moveTo(o.len * 0.62, 0); g.quadraticCurveTo(o.len * 0.95, -o.h * 0.9, o.len * 1.18, -o.h * 1.05); g.quadraticCurveTo(o.len * 1.02, 0, o.len * 1.18, o.h * 1.05); g.quadraticCurveTo(o.len * 0.95, o.h * 0.9, o.len * 0.62, 0); paint(g, '#b8783a', 1.6);
  fishBody(g, o.len, o.h);
  paint(g, lin(g, 0, -o.h, 0, o.h, [[0, o.back], [0.5, o.body], [1, o.belly]]), 2);
  g.save(); fishBody(g, o.len, o.h); g.clip(); g.strokeStyle = 'rgba(90,50,20,0.7)'; g.lineWidth = 1.8; for (const k of [-0.3, 0.05, 0.4]) { g.beginPath(); g.moveTo(o.len * k - 3, -o.h); g.lineTo(o.len * k + 3, o.h); g.stroke(); }
  dots(g, Array.from({ length: 10 }, (_, i) => [-o.len * 0.6 + i * 3.6, -o.h * 0.5 + (i % 3) * 2.5]), 0.7, 'rgba(255,255,255,0.9)'); g.restore();
  circ(g, -o.len * 0.7, -o.h * 0.18, 2); paint(g, '#fff', 1); circ(g, -o.len * 0.71, -o.h * 0.18, 1); g.fillStyle = INK; g.fill();
  g.restore();
}
function chunk(g, x, y, r, col, rot = 0, rind = null) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.beginPath(); g.moveTo(-r, r * 0.6); g.quadraticCurveTo(-r * 1.1, -r * 0.7, 0, -r * 0.9); g.quadraticCurveTo(r * 1.1, -r * 0.7, r, r * 0.6); g.quadraticCurveTo(0, r * 1.0, -r, r * 0.6); g.closePath();
  paint(g, volR(g, col, 0, 0, r * 1.1, 0.4, 0.3), 1.6);
  if (rind) { g.beginPath(); g.moveTo(-r, r * 0.6); g.quadraticCurveTo(0, r * 1.0, r, r * 0.6); stroke(g, rind, 2.4); }
  g.restore();
}
const DISH = {
  grilledFish(g) { shadow(g, 22, 22, 3); plate(g, 25, 10, 8); grilledFishArt(g, -1, 2, 0.95); g.save(); g.translate(16, 9); g.rotate(-0.3); g.beginPath(); g.moveTo(-5, 0); g.arc(0, 0, 5, Math.PI, 0); g.closePath(); paint(g, '#ffe060', 1.4); g.restore(); leaf(g, 9, 12, 9, 3.5, 0.2, '#6ab84e'); },
  roastedVeggies(g) { shadow(g, 22, 22, 3); plate(g, 24, 10, 9); chunk(g, -10, 5, 6, '#ffa040', -0.3, '#c8601a'); chunk(g, 1, 2, 7, '#ff9a3a', 0.2, '#5a8a3a'); chunk(g, 11, 6, 5.5, '#f4e4f0', 0.4, '#c070a8'); circ(g, -2, 10, 3.8); paint(g, volR(g, '#ff8a3a', -2, 10, 4), 1.4); circ(g, 7, 12, 3.4); paint(g, volR(g, '#ffb050', 7, 12, 3.4), 1.4); dots(g, [[-6, 1], [4, -2], [9, 3], [-12, 8]], 0.9, '#3a7a2a'); steam(g, 0, -6, 2, 10); },
  misoSoup(g) { shadow(g, 23, 18, 3.2); bowl(g, { r: 17, y: 0, outer: '#c8343a', inner: '#2a1416', fill: '#d8a060', band: '#2a1416' }); g.fillStyle = '#fffaf2'; for (const [x, y] of [[-7, -1], [3, 1], [-1, -3]]) { rr(g, x - 2, y - 1.6, 4, 3.2, 0.8); g.fill(); g.strokeStyle = hexA(INK, 0.4); g.lineWidth = 0.8; g.stroke(); } for (const [x, y] of [[7, -2], [-10, 1], [2, -4]]) { circ(g, x, y, 1.5); paint(g, '#7cc45a', 0.8); } ell(g, -3, 2, 3.4, 1.2, 0.3); g.fillStyle = '#2f6a3a'; g.fill(); steam(g, 0, -9, 3, 12); },
  carrotSoup(g) { shadow(g, 23, 18, 3.2); bowl(g, { r: 17, y: 0, outer: '#fff6e8', inner: '#e8dccc', fill: '#ffa040', band: '#7ab8ff' }); g.beginPath(); g.moveTo(-8, 0); g.bezierCurveTo(-4, -3, 0, 3, 4, 0); stroke(g, 'rgba(255,248,230,0.95)', 1.6); g.save(); g.translate(5, -1.5); g.scale(0.45, 0.45); g.beginPath(); g.moveTo(0, 4); g.bezierCurveTo(-6, 0, -5, -6, 0, -3); g.bezierCurveTo(5, -6, 6, 0, 0, 4); paint(g, '#ff7a2a', 2.2); g.restore(); leaf(g, -6, -2, 6, 2.4, -0.4, '#5ab04a'); steam(g, 0, -9, 3, 12); },
  onigiri(g) { shadow(g, 23, 15, 3); onigiriShape(g, 0, 2, 1.05); },
  salmonOnigiri(g) { shadow(g, 23, 15, 3); onigiriShape(g, 0, 2, 1.05, false, gg => { gg.beginPath(); gg.moveTo(-6, -9); gg.quadraticCurveTo(0, -16, 6, -9); gg.quadraticCurveTo(0, -6, -6, -9); paint(gg, vol(gg, '#ff9a7a', -6, -14, 6, -7, 0.4, 0.2), 1.4); dots(gg, [[-3, -10], [2, -11], [0, -8.5]], 0.8, '#fff6e8'); }); },
  cabbageRolls(g) { shadow(g, 23, 20, 3); bowl(g, { r: 19, y: 1, outer: '#7ab8e8', inner: '#5a8ab8', fill: '#f4d27a' }); for (const [x, rot] of [[-6, -0.3], [6, 0.25]]) { g.save(); g.translate(x, -1); g.rotate(rot); rr(g, -6, -5, 12, 9, 4.5); paint(g, vol(g, '#a8d880', -6, -5, 6, 4, 0.4, 0.25), 1.6); g.beginPath(); g.moveTo(-4, -1); g.quadraticCurveTo(0, -3, 4, -1); stroke(g, hexA('#f0fadc', 0.9), 1.1); rr(g, -1.2, -5.5, 2.4, 10, 1); paint(g, '#d8b070', 1); g.restore(); } steam(g, 0, -8, 2, 10); },
  pumpkinStew(g) { shadow(g, 23, 18, 3.2); bowl(g, { r: 17, y: 0, outer: '#3a4a7a', inner: '#1e2440', fill: '#e8a040', band: '#e8c860' }); chunk(g, -7, -1, 4.5, '#ffa83a', -0.4, '#4a7a3a'); chunk(g, 3, -2, 5, '#ff9a30', 0.3, '#4a7a3a'); chunk(g, 9, 1, 3.6, '#ffb048', 0.6, '#4a7a3a'); steam(g, 0, -9, 3, 12); },
  strawberryMochi(g) {
    shadow(g, 23, 20, 3.2); ell(g, 0, 14, 21, 6.5); paint(g, vol(g, '#8ac070', -21, 8, 21, 21, 0.3, 0.2), 1.8);
    g.strokeStyle = hexA('#5a8a4a', 0.6); g.lineWidth = 1; g.beginPath(); g.moveTo(-18, 14); g.lineTo(18, 14); g.stroke();
    // a whole daifuku behind, with its strawberry peeking out of the top
    g.beginPath(); g.moveTo(-3, 11); g.bezierCurveTo(-4, -10, 20, -10, 19, 11); g.quadraticCurveTo(8, 14, -3, 11); g.closePath(); paint(g, volR(g, '#fffaf6', 8, 2, 12, 0.25, 0.14), 2);
    berry(g, 8, -6, 5, 0.1);
    dots(g, [[2, 0], [12, -1], [15, 5], [5, 6]], 0.8, 'rgba(225,215,205,0.9)');
    // a halved one in front: soft mochi, a ring of anko, the strawberry's heart
    g.beginPath(); g.moveTo(-19, 12); g.bezierCurveTo(-20, -6, 1, -6, 0, 12); g.quadraticCurveTo(-10, 14, -19, 12); g.closePath(); paint(g, volR(g, '#fffaf6', -10, 4, 12, 0.25, 0.12), 2);
    g.beginPath(); g.moveTo(-16.5, 11.5); g.bezierCurveTo(-17, -2.5, -2, -2.5, -2.5, 11.5); g.closePath(); paint(g, '#7a3a3e', 1.2);
    g.beginPath(); g.moveTo(-14.6, 11.2); g.bezierCurveTo(-14.6, 0.5, -4.4, 0.5, -4.4, 11.2); g.closePath(); paint(g, lin(g, -9, 1, -9, 11, [[0, '#ff4a5e'], [1, '#ff7a8a']]), 1.2);
    ell(g, -9.5, 7.5, 1.8, 3); g.fillStyle = '#fff0f2'; g.fill();
    shine(g, 3, -1, 3, 1.4, -0.5, 0.7); shine(g, -14, 0, 2.4, 1.2, -0.6, 0.6);
  },
  honeyCake(g) {
    shadow(g, 23, 19, 3.2);
    g.beginPath(); g.moveTo(-17, -2); g.lineTo(-17, 12); g.bezierCurveTo(-17, 20, 17, 20, 17, 12); g.lineTo(17, -2); g.closePath(); paint(g, lin(g, -17, 0, 17, 0, [[0, '#f8d898'], [0.5, '#f0c070'], [1, '#d89a48']]), 2);
    g.strokeStyle = hexA('#fff4d8', 0.7); g.lineWidth = 1.4; g.beginPath(); g.moveTo(-16, 7); g.bezierCurveTo(-10, 12, 10, 12, 16, 7); g.stroke();
    ell(g, 0, -2, 17, 6.5); paint(g, vol(g, '#ffc83a', -17, -8, 17, 4, 0.35, 0.2), 2);
    for (const [x, h] of [[-12, 7], [-4, 10], [6, 6], [13, 8]]) { g.beginPath(); g.moveTo(x - 2.2, 2); g.lineTo(x - 2, 2 + h); g.arc(x, 2 + h, 2, Math.PI, 0, true); g.lineTo(x + 2.2, 2); g.closePath(); paint(g, '#ffc83a', 1.3); }
    g.save(); g.translate(2, -6); hexCell(g, 0, 0, 5.4, '#ffe070'); hexCell(g, 8.6, 1, 4.4, '#ffd04a'); g.restore();
    shine(g, -8, -4, 4, 1.6, -0.2, 0.8);
  },
  grilledTrout(g) { shadow(g, 23, 20, 3); g.save(); g.rotate(-0.35); grilledFishArt(g, 0, 0, 1.05, true); g.restore(); dots(g, [[-12, 0], [-2, -4], [8, -6]], 0.9, '#ffffff'); },
  melonBread(g) {
    shadow(g, 23, 20, 3.4);
    g.beginPath(); g.moveTo(-19, 10); g.bezierCurveTo(-21, -16, 21, -16, 19, 10); g.quadraticCurveTo(0, 15, -19, 10); g.closePath();
    paint(g, lin(g, 0, -12, 0, 13, [[0, '#fff0a8'], [0.55, '#f2d070'], [1, '#d8a048']]), 2);
    g.save(); g.clip(); g.strokeStyle = hexA('#b8883a', 0.75); g.lineWidth = 1.4; for (let k = -24; k < 24; k += 6.5) { g.beginPath(); g.moveTo(k, -14); g.lineTo(k + 18, 14); g.stroke(); g.beginPath(); g.moveTo(k, -14); g.lineTo(k - 18, 14); g.stroke(); } g.restore();
    g.beginPath(); g.moveTo(-19, 10); g.quadraticCurveTo(0, 15, 19, 10); stroke(g, INK, 2);
    dots(g, [[-9, -5], [-2, -8], [6, -4], [11, -8], [-13, 1], [3, 1]], 0.9, '#ffffff');
    shine(g, -9, -7, 5, 2.2, -0.4, 0.75);
  },
  sushiPlatter(g) {
    shadow(g, 24, 24, 3);
    rr(g, -25, 4, 50, 11, 3); paint(g, vol(g, '#c98f5e', -25, 4, 25, 15, 0.3, 0.25), 2); for (const x of [-18, 16]) { rr(g, x, 14, 4, 5, 1); paint(g, '#8a5a3a', 1.4); }
    g.strokeStyle = hexA('#8a5a3a', 0.5); g.lineWidth = 1; g.beginPath(); g.moveTo(-23, 9); g.lineTo(23, 9); g.stroke();
    const nigiri = (x, top, stripes) => { rr(g, x - 7, -3, 14, 9, 4); paint(g, '#fffaf2', 1.6); g.beginPath(); g.moveTo(x - 8, -1); g.bezierCurveTo(x - 7, -10, x + 7, -10, x + 8, -1); g.quadraticCurveTo(x, 1, x - 8, -1); g.closePath(); paint(g, vol(g, top, x - 8, -9, x + 8, 0, 0.4, 0.2), 1.6); if (stripes) { g.strokeStyle = 'rgba(255,240,230,0.85)'; g.lineWidth = 1; for (const k of [-3, 0, 3]) { g.beginPath(); g.moveTo(x + k - 1.5, -7); g.lineTo(x + k + 1.5, -1); g.stroke(); } } };
    nigiri(-14, '#ff9a6a', true); nigiri(0, '#e84a5a', false); nigiri(14, '#ffd84a', false); rr(g, 11, -4, 6, 3, 1); paint(g, '#24463a', 1);
    circ(g, 21, 1, 3); paint(g, '#9ad06a', 1.2); ell(g, -22, 1, 3, 2); paint(g, '#ffb8c0', 1.1);
  },
  fishermansFeast(g) {
    shadow(g, 24, 25, 3.2);
    rr(g, -26, -4, 52, 24, 4); paint(g, vol(g, '#c8343a', -26, -4, 26, 20, 0.3, 0.25), 2); rr(g, -23, -1.5, 46, 19, 3); paint(g, '#2a1416', 1.2);
    g.save(); g.translate(-11, 3); g.scale(0.5, 0.5); bowl(g, { r: 15, y: 0, outer: '#fff6e8', inner: '#e8dccc', fill: '#fffaf2', band: '#7ab8ff' }); g.restore();
    circ(g, -11, 1.5, 6); paint(g, volR(g, '#ffffff', -11, 1, 6, 0.2, 0.1), 1.2);
    g.save(); g.translate(-11, 12); g.scale(0.42, 0.42); bowl(g, { r: 15, y: 0, outer: '#c8343a', inner: '#2a1416', fill: '#d8a060' }); g.restore();
    g.save(); g.translate(8, 7); g.scale(0.62, 0.62); plate(g, 20, 9, 2); grilledFishArt(g, -1, -3, 0.75); g.restore();
    circ(g, 19, 13, 2.4); paint(g, '#ffd84a', 1); circ(g, 15, 14, 2); paint(g, '#ff9ab0', 1);
    steam(g, -11, -6, 2, 9);
  },
  moonKoiBento(g) {
    glow(g, 0, 0, 30, '#b8d0ff', 0.6);
    shadow(g, 24, 24, 3.2);
    rr(g, -24, -12, 48, 32, 5); paint(g, vol(g, '#2a2030', -24, -12, 24, 20, 0.25, 0.2), 2); rr(g, -21, -9, 42, 26, 3); paint(g, '#c8343a', 1.4);
    rr(g, -20, -8, 19, 24, 2.5); paint(g, '#fffaf2', 1.2); circ(g, -10.5, 4, 3); paint(g, volR(g, '#e8506a', -10.5, 4, 3), 1.1); dots(g, [[-15, -3], [-6, 10], [-16, 11]], 0.7, '#3a3a3a');
    rr(g, 1, -8, 19, 11, 2.5); paint(g, '#ffe680', 1.2); g.strokeStyle = hexA('#e8b830', 0.8); g.lineWidth = 1; for (const x of [6, 11, 16]) { g.beginPath(); g.moveTo(x, -8); g.lineTo(x, 3); g.stroke(); }
    rr(g, 1, 5, 19, 11, 2.5); paint(g, '#7cc45a', 1.2);
    g.save(); g.translate(10.5, 10.5); g.scale(0.32, 0.32); fish(g, 'moonKoi', { ...FISH.moonKoi, glow: null, sparkle: false }); g.restore();
    crescent(g, -16, -17, 5.6, '#ffe070');
    sparkle(g, 18, -17, 3.6, '#ffffff'); sparkle(g, 23, 14, 2.6, '#fff6c0');
  },
};

// ================================================================== public API
// Pound Mochi (docs/COZY.md §7.2: a recipe that makes the building material): the wooden usu, a soft white mound of
// mochi in it, the kine mallet resting across
function poundMochi(g) {
  shadow(g, 24, 19, 3.2);
  // the usu: a fat wooden tub, its rim lighter
  g.beginPath(); g.moveTo(-17, -1); g.lineTo(-15, 15); g.bezierCurveTo(-14, 20, 14, 20, 15, 15); g.lineTo(17, -1); g.closePath();
  paint(g, lin(g, -17, 0, 17, 0, [[0, '#c88a52'], [0.45, '#a86a3c'], [1, '#7a4a2a']]), 2);
  g.strokeStyle = hexA('#5a3420', 0.55); g.lineWidth = 1.1; for (const y of [6, 12]) { g.beginPath(); g.moveTo(-16, y); g.bezierCurveTo(-8, y + 2.5, 8, y + 2.5, 16, y); g.stroke(); }
  ell(g, 0, -1, 17, 5.5); paint(g, lin(g, 0, -6, 0, 4, [[0, '#f2c890'], [1, '#c8935c']]), 2);
  // the mochi: a soft white heap, a little dusting of flour
  g.beginPath(); g.moveTo(-12, 0); g.bezierCurveTo(-12, -13, 12, -14, 12, 0); g.quadraticCurveTo(0, 3, -12, 0); g.closePath(); paint(g, volR(g, '#fffdf8', -2, -6, 13, 0.25, 0.1), 2);
  dots(g, [[-5, -5], [3, -8], [6, -3], [-1, -2]], 0.8, 'rgba(225,215,200,0.9)');
  shine(g, -4, -7, 3.2, 1.6, -0.5, 0.8);
  // the kine: a mallet head on a long handle, resting across the tub
  g.save(); g.translate(8, -12); g.rotate(-0.55);
  rr(g, -1.6, -2, 3.2, 26, 1.4); paint(g, lin(g, -2, 0, 2, 0, [[0, '#e8c088'], [1, '#b88a52']]), 1.6);
  rr(g, -7, -9, 14, 8, 3.5); paint(g, lin(g, -7, -9, 7, -1, [[0, '#d8a060'], [1, '#9a6a3a']]), 1.8);
  g.restore();
}
export function drawPantry(g, id) {
  if (id === 'poundMochi') return poundMochi(g);
  const d = PANTRY[id]; if (!d) { circ(g, 0, 0, 12); paint(g, '#cccccc', 2); return; }
  if (d.kind === 'seed') return seedPacket(g, d.crop);
  if (d.kind === 'crop') { shadow(g, 22, 16, 3.4); return CROP_ART[id]?.(g); }
  if (d.kind === 'fish') return id === 'octopus' ? octopus(g) : id === 'pufferfish' ? pufferfish(g) : id === 'flounder' ? flounder(g) : fish(g, id);
  if (d.kind === 'forage') return ({ honey, bamboo, shiitake, seaweed })[id]?.(g);
  if (d.kind === 'dish') return DISH[id]?.(g);
}
const RARE_FX = { 2: 'rare', 3: 'unique' };
/** Data URL of the item's icon (cached). */
export function pantryIcon(id) {
  return cached(`pantry|${id}`, () => compose(g => drawPantry(g, id), { rarity: RARE_FX[PANTRY[id]?.rare] }));
}
/** Small crop art without the sticker (packets, tabs): the crop drawn alone. */
export const CROP_DRAW = CROP_ART;

// ================================================================== tools (the rods)
function rodArt(g, tier) {
  const moon = tier >= 2, shaft = moon ? '#3a4a8a' : '#d8b868', ring = moon ? '#ffd24a' : '#a88a40';
  shadow(g, 24, 18, 3);
  // the line falls from the tip to the float
  g.beginPath(); g.moveTo(21, -24); g.bezierCurveTo(27, -10, 22, 4, 14, 10); g.strokeStyle = 'rgba(74,44,42,0.55)'; g.lineWidth = 1.1; g.stroke();
  circ(g, 14, 13, 5); paint(g, lin(g, 0, 8, 0, 18, [[0, '#ff4a52'], [0.5, '#ff4a52'], [0.5, '#fffaf2'], [1, '#f0e6dc']]), 1.6);
  g.beginPath(); g.moveTo(14, 8); g.lineTo(14, 4); stroke(g, INK, 1.4);
  // the shaft, bottom-left to top-right, tapering
  g.save(); g.translate(-20, 20); g.rotate(-0.86);
  g.beginPath(); g.moveTo(0, -2.4); g.lineTo(60, -0.9); g.lineTo(60, 0.9); g.lineTo(0, 2.4); g.closePath(); paint(g, vol(g, shaft, 0, -3, 60, 3, 0.4, 0.25), 1.4);
  for (const x of [16, 28, 40, 51]) { g.beginPath(); g.moveTo(x, -2.2); g.lineTo(x, 2.2); stroke(g, ring, 1.6); }
  rr(g, -4, -4, 14, 8, 3); paint(g, vol(g, moon ? '#3a2a4a' : '#c8865a', -4, -4, 10, 4, 0.35, 0.25), 1.6);
  circ(g, 13, 6, 5.2); paint(g, volR(g, moon ? '#ffd24a' : '#e8503a', 13, 6, 5.2, 0.5, 0.3), 1.6); circ(g, 13, 6, 1.8); g.fillStyle = '#fff6e8'; g.fill();
  g.restore();
  if (moon) { crescent(g, -14, -12, 6, '#ffe070'); sparkle(g, 20, 20, 3, '#ffffff'); sparkle(g, -4, -22, 2.4, '#fff6c0'); }
  else leaf(g, -18, 8, 9, 3.5, -2.4, '#7cc45a');
}
/** Icons for tools that aren't pantry goods: 'rod1', 'rod2'. */
export function toolIcon(kind) { return cached(`tool|${kind}`, () => compose(g => rodArt(g, kind === 'rod2' ? 2 : 1), { rarity: kind === 'rod2' ? 'rare' : undefined })); }

// ================================================================== recipe pages (Rosie's cookbook, recipe toasts)
function recipeArt(g, id) {
  shadow(g, 26, 18, 3);
  g.save(); g.rotate(-0.1);
  rr(g, -21, -26, 42, 52, 6); paint(g, lin(g, 0, -26, 0, 26, [[0, '#fffaf0'], [1, '#f4dfc2']]), 1.8);
  for (const y of [13, 19]) { g.beginPath(); g.moveTo(-11, y); g.lineTo(14, y); stroke(g, 'rgba(74,44,42,0.32)', 1.5); }
  rr(g, -21, -26, 8, 52, 3); paint(g, lin(g, -21, 0, -13, 0, [[0, '#ff7aa0'], [1, '#ffb0c8']]), 1.4);
  g.restore();
  g.save(); g.translate(3, -7); g.scale(0.6, 0.6); drawPantry(g, id); g.restore();
  sparkle(g, 19, -22, 3.2, '#ffe070');
}
/** A recipe page with its dish drawn on it (cached data URL). */
export function recipeIcon(id) { return cached(`recipe|${id}`, () => compose(g => recipeArt(g, id))); }
