// Wallpapers and floors (docs/HOUSING.md §2): painted Canvas2D tiles, cached per surface for the session (an
// interior's teardown never disposes them). `tile` = how many metres one repeat of the texture covers.
import * as THREE from 'three';
import { SURFACES } from './furniture.js';

const PX = 256; // pixels per metre
const cache = new Map(), swatches = new Map();
const rng = seed => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

// soft painterly mottling over the whole tile (brush blobs, a touch of paper grain)
function mottle(g, W, H, r, color, n = 80, a = 0.05, size = [8, 30]) {
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * H, s = size[0] + r() * (size[1] - size[0]);
    const gr = g.createRadialGradient(x, y, 0, x, y, s);
    gr.addColorStop(0, color.replace('A', (a * (0.5 + r())).toFixed(3))); gr.addColorStop(1, color.replace('A', '0'));
    g.fillStyle = gr; for (const [ox, oy] of [[0, 0], [W, 0], [-W, 0], [0, H], [0, -H]]) { g.save(); g.translate(ox, oy); g.fillRect(x - s, y - s, s * 2, s * 2); g.restore(); }
  }
}
function grain(g, W, H, r, n = 900, a = 0.035) { for (let i = 0; i < n; i++) { g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(74,44,42,${a})`; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1); } }
function blossom(g, x, y, R, fill, eye = '#ffd84a', rot = 0) {
  g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = fill;
  for (let k = 0; k < 5; k++) { g.rotate(Math.PI * 2 / 5); g.beginPath(); g.ellipse(0, -R * 0.55, R * 0.42, R * 0.55, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = eye; g.beginPath(); g.arc(0, 0, R * 0.2, 0, Math.PI * 2); g.fill(); g.restore();
}
function mapleLeaf(g, x, y, R, fill, rot) {
  g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = fill; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.45 : R * (i === 0 ? 1 : 0.85); g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  g.closePath(); g.fill(); g.strokeStyle = 'rgba(120,40,20,.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, R * 0.9); g.lineTo(0, -R * 0.6); g.stroke(); g.restore();
}
// planks running along x: n boards per metre, staggered seams, grain streaks
function planks(g, W, H, r, base, dark, n = 4, seams = 1) {
  const bh = H / n;
  for (let i = 0; i < n; i++) {
    const y = i * bh, tone = (r() - 0.5) * 0.12;
    g.fillStyle = shadeHex(base, 1 + tone); g.fillRect(0, y, W, bh);
    for (let k = 0; k < 9; k++) { g.strokeStyle = `rgba(${dark},${0.05 + r() * 0.08})`; g.lineWidth = 0.8 + r() * 1.2; g.beginPath(); const yy = y + 3 + r() * (bh - 6); g.moveTo(0, yy); g.bezierCurveTo(W * 0.3, yy + (r() - 0.5) * 6, W * 0.7, yy + (r() - 0.5) * 6, W, yy); g.stroke(); }
    if (r() < 0.6) { g.fillStyle = `rgba(${dark},0.18)`; g.beginPath(); g.ellipse(r() * W, y + bh * (0.3 + r() * 0.4), 4 + r() * 4, 2 + r() * 2, 0, 0, Math.PI * 2); g.fill(); } // a knot
    g.fillStyle = `rgba(${dark},0.5)`; g.fillRect(0, y, W, 2); // the gap between boards
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, y + 2, W, 1.5);
    const sx = ((i * 0.37 + 0.15) % 1) * W; for (let s = 0; s < seams; s++) { const x = (sx + s * W / seams) % W; g.fillStyle = `rgba(${dark},0.45)`; g.fillRect(x, y, 2, bh); }
  }
}
function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16), c = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

const PAINT = {
  wp_plaster: (g, W, H, r) => { g.fillStyle = '#fff1dc'; g.fillRect(0, 0, W, H); mottle(g, W, H, r, 'rgba(232,196,150,A)', 60, 0.12, [10, 40]); mottle(g, W, H, r, 'rgba(255,255,255,A)', 40, 0.25, [8, 26]); grain(g, W, H, r); },
  wp_stripes: (g, W, H, r) => {
    g.fillStyle = '#fff4ec'; g.fillRect(0, 0, W, H);
    const n = 6, sw = W / n;
    for (let i = 0; i < n; i += 2) { g.fillStyle = '#ffc6d6'; g.fillRect(i * sw + 2, 0, sw - 4, H); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(i * sw + sw * 0.5 - 1, 0, 2, H); }
    for (let i = 1; i < n; i += 2) for (let y = 12; y < H; y += 32) { g.fillStyle = '#ff9ab8'; g.beginPath(); g.arc(i * sw + sw / 2, y + (i % 4 ? 16 : 0), 2.6, 0, Math.PI * 2); g.fill(); }
    mottle(g, W, H, r, 'rgba(200,120,140,A)', 40, 0.05); grain(g, W, H, r);
  },
  wp_dots: (g, W, H, r) => {
    g.fillStyle = '#bdf0dc'; g.fillRect(0, 0, W, H);
    const s = W / 6;
    for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) { const x = i * s + (j % 2 ? s / 2 : 0) + s / 4, y = j * s + s / 2; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x % W, y, 7.5, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(80,160,130,.25)'; g.beginPath(); g.arc(x % W + 1.5, y + 2, 7.5, 0, Math.PI * 2); g.globalCompositeOperation = 'destination-over'; g.fill(); g.globalCompositeOperation = 'source-over'; }
    mottle(g, W, H, r, 'rgba(255,255,255,A)', 40, 0.2); grain(g, W, H, r);
  },
  wp_sakura: (g, W, H, r) => {
    g.fillStyle = '#ffeef2'; g.fillRect(0, 0, W, H); mottle(g, W, H, r, 'rgba(255,190,210,A)', 50, 0.12, [10, 34]);
    for (let i = 0; i < 16; i++) { const x = r() * W, y = r() * H, R = 7 + r() * 8; for (const [ox, oy] of [[0, 0], [W, 0], [-W, 0], [0, H], [0, -H]]) blossom(g, x + ox, y + oy, R, r() < 0.5 ? '#ffb3cb' : '#ff9ec0', '#ffe07a', r() * 6); }
    for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(255,170,200,.7)'; g.beginPath(); g.ellipse(r() * W, r() * H, 3, 2, r() * 3, 0, Math.PI * 2); g.fill(); }
    grain(g, W, H, r);
  },
  wp_asanoha: (g, W, H, r) => {
    g.fillStyle = '#e4f2d8'; g.fillRect(0, 0, W, H); mottle(g, W, H, r, 'rgba(255,255,255,A)', 40, 0.25);
    g.strokeStyle = 'rgba(110,150,100,.55)'; g.lineWidth = 1.6;
    const s = W / 4, h = s * Math.sqrt(3) / 2;
    for (let j = -1; j <= Math.ceil(H / h); j++) for (let i = -1; i <= 4; i++) {
      const cx = i * s + (j % 2 ? s / 2 : 0), cy = j * h;
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * s / 2, cy + Math.sin(a) * s / 2 * 1.0); g.stroke(); }
    }
    grain(g, W, H, r);
  },
  wp_wood: (g, W, H, r) => {
    g.save(); g.translate(W, 0); g.rotate(Math.PI / 2); planks(g, H, W, r, '#d89a64', '110,60,30', 5, 0); g.restore();
    mottle(g, W, H, r, 'rgba(255,230,190,A)', 30, 0.1);
  },
  wp_waves: (g, W, H, r) => {
    g.fillStyle = '#d6efff'; g.fillRect(0, 0, W, H);
    const R = W / 6, cols = ['#7ac2ec', '#ffffff', '#a8daf6', '#ffffff', '#5aa8dc'];
    for (let j = -1; j <= Math.ceil(H / (R * 0.5)) + 1; j++) for (let i = -1; i <= 7; i++) {
      const cx = i * R * 2 * 0.5 * 2 + (j % 2 ? R : 0), cy = j * R * 0.5;
      for (let k = 0; k < 5; k++) { g.fillStyle = cols[k]; g.beginPath(); g.arc(cx, cy + R * 0.5, R * (1 - k * 0.19), Math.PI, 0); g.fill(); }
    }
    grain(g, W, H, r);
  },
  wp_maple: (g, W, H, r) => {
    g.fillStyle = '#fff4e6'; g.fillRect(0, 0, W, H); mottle(g, W, H, r, 'rgba(240,190,140,A)', 50, 0.1);
    for (let i = 0; i < 14; i++) { const x = r() * W, y = r() * H, R = 10 + r() * 8, c = ['#e8603a', '#f4a03a', '#d8402e', '#f0c040'][Math.floor(r() * 4)], rot = r() * 6; for (const [ox, oy] of [[0, 0], [W, 0], [-W, 0], [0, H], [0, -H]]) mapleLeaf(g, x + ox, y + oy, R, c, rot); }
    grain(g, W, H, r);
  },
  fl_planks: (g, W, H, r) => { planks(g, W, H, r, '#e9c592', '120,70,36', 4, 1); mottle(g, W, H, r, 'rgba(255,240,200,A)', 30, 0.08); },
  fl_walnut: (g, W, H, r) => { planks(g, W, H, r, '#9a6444', '50,24,12', 4, 1); mottle(g, W, H, r, 'rgba(255,220,180,A)', 30, 0.06); },
  fl_tatami: (g, W, H, r) => {
    // two mats per 2 x 2 m tile: a woven field, dark cloth borders on the long sides
    const mats = [[0, 0, W / 2, H], [W / 2, 0, W / 2, H / 2], [W / 2, H / 2, W / 2, H / 2]];
    for (const [x, y, w, h] of mats) {
      g.fillStyle = '#d8d48c'; g.fillRect(x, y, w, h);
      const vert = h > w;
      for (let k = 0; k < (vert ? w : h); k += 3) { g.fillStyle = `rgba(120,130,60,${0.08 + r() * 0.08})`; if (vert) g.fillRect(x + k, y, 1.2, h); else g.fillRect(x, y + k, w, 1.2); }
      g.fillStyle = '#3a4a3a'; if (vert) { g.fillRect(x, y, 7, h); g.fillRect(x + w - 7, y, 7, h); } else { g.fillRect(x, y, w, 7); g.fillRect(x, y + h - 7, w, 7); }
      g.strokeStyle = 'rgba(60,50,30,.5)'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
    mottle(g, W, H, r, 'rgba(255,255,220,A)', 40, 0.12);
  },
  fl_checker: (g, W, H, r) => {
    const n = 4, s = W / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { g.fillStyle = (i + j) % 2 ? '#ffb4c4' : '#fff6ec'; g.fillRect(i * s, j * s, s, s); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(i * s + 4, j * s + 4, s * 0.4, 3); }
    g.strokeStyle = 'rgba(160,110,110,.45)'; g.lineWidth = 2; for (let k = 0; k <= n; k++) { g.beginPath(); g.moveTo(k * s, 0); g.lineTo(k * s, H); g.stroke(); g.beginPath(); g.moveTo(0, k * s); g.lineTo(W, k * s); g.stroke(); }
    grain(g, W, H, r);
  },
  fl_stone: (g, W, H, r) => {
    // river stones set in warm mortar: a jittered grid of rounded pebbles (no overlaps), each with a soft shadow on its
    // lower edge, a highlight on its upper one and its own warm grey; every stone is drawn with its wrap copies
    g.fillStyle = '#8e8580'; g.fillRect(0, 0, W, H);
    mottle(g, W, H, r, 'rgba(60,50,46,A)', 40, 0.12);
    const N = 6, cw = W / N, tones = ['#d8d0c6', '#cfc6be', '#e2dad0', '#c4bcb8', '#d6cabc', '#bfb8b8', '#e6ddd2'];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5 + (r() - 0.5) * 0.3 + (j % 2) * 0.5) * cw, y = (j + 0.5 + (r() - 0.5) * 0.3) * cw;
      const rx = cw * (0.36 + r() * 0.08), ry = cw * (0.3 + r() * 0.08), rot = r() * Math.PI, c = tones[Math.floor(r() * tones.length)];
      for (const [ox, oy] of [[0, 0], [W, 0], [-W, 0], [0, H], [0, -H], [W, H], [-W, -H], [W, -H], [-W, H]]) {
        const X = x + ox, Y = y + oy; if (X < -cw || X > W + cw || Y < -cw || Y > H + cw) continue;
        g.fillStyle = 'rgba(50,40,36,.35)'; g.beginPath(); g.ellipse(X + 2, Y + 3, rx, ry, rot, 0, Math.PI * 2); g.fill();
        g.fillStyle = c; g.beginPath(); g.ellipse(X, Y, rx, ry, rot, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,250,240,.32)'; g.beginPath(); g.ellipse(X - rx * 0.22, Y - ry * 0.28, rx * 0.55, ry * 0.4, rot, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(90,76,70,.12)'; g.beginPath(); g.ellipse(X + rx * 0.2, Y + ry * 0.3, rx * 0.6, ry * 0.42, rot, 0, Math.PI * 2); g.fill();
      }
    }
    grain(g, W, H, r);
  },
};
const TILE = { fl_tatami: 2, wp_waves: 1 };

function canvasOf(id) {
  const t = TILE[id] || 1, S = PX * t, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), r = rng([...id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  (PAINT[id] || PAINT[SURFACES[id]?.kind === 'floor' ? 'fl_planks' : 'wp_plaster'])(g, S, S, r);
  return c;
}
/** the repeating texture of a surface → { tex, tile (metres per repeat) } (cached for the session) */
export function surfaceTexture(id) {
  let e = cache.get(id);
  if (e) return e;
  const tex = new THREE.CanvasTexture(canvasOf(id));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  e = { tex, tile: TILE[id] || 1 };
  cache.set(id, e);
  return e;
}
/** a small swatch image of a surface for the palette (data URL, cached) */
export function surfaceSwatch(id) {
  let u = swatches.get(id); if (u) return u;
  const c = canvasOf(id), s = document.createElement('canvas'); s.width = s.height = 96;
  const g = s.getContext('2d'); g.drawImage(c, 0, 0, c.width / (TILE[id] || 1), c.height / (TILE[id] || 1), 0, 0, 96, 96);
  u = s.toDataURL('image/png'); swatches.set(id, u);
  return u;
}
