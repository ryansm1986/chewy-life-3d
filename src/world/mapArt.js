// The maps' painted art (ROADMAP UX-1, docs/MAP.md): what the HUD minimap and the big map draw, in the game's look.
//  - VillageArt: Blossom Hollow painted once into cached canvases. The terrain layer (water by depth, a foam line at
//    every shore, grass with soft relief, sand, cliffs, fields, the districts' tints) is painted per pixel at 2 samples a
//    metre and only again when the land itself changes; the composite on top of it (paths and plazas, the stub streets
//    of rings not yet open, bridges, trees as soft clusters, every building's footprint with its own roof colour) is
//    drawn again on 'village:changed'. Nothing static is drawn per frame.
//  - Badges, pips and pins: the moving and upright marks (place icons from the game's own glyphs, people as coloured
//    pips with an initial, the map pin, the quest star, the player's arrow, Shadow), each pre-rendered once into a small
//    canvas, so a frame is a handful of drawImage calls.
import { WORLD, T, PATHS, CHEWY_GARDEN } from './layout.js';
import { DISTRICTS, PLOTS } from './plots.js';
import { BUILDINGS, variantOf } from './buildings/index.js';
import { ROOFS, ROOF_LIST } from './buildings/kit.js';
import { styleOf } from './buildings/styles.js';
import { glyph } from '../ui/glyphs.js';
import { cozyIcon } from '../ui/cozyIcons.js';

export const INK = '#4a2c2a', CREAM = '#fff6e8';
const FONT = 'Fredoka, "M PLUS Rounded 1c", system-ui, sans-serif';
export const font = (w, px) => `${w} ${px}px ${FONT}`;
export const DPR = () => Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const shadeHex = (h, k) => { const [r, g, b] = rgb(h), f = v => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)))); return `rgb(${f(r)},${f(g)},${f(b)})`; };
const canvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

// ------------------------------------------------------------------ roof colours (the buildings' own: world/buildings/*)
const STALL_ROOF = [ROOFS.moss, ROOFS.slate, ROOFS.terracotta], SHOP2_ROOF = [ROOFS.terracotta, ROOFS.teal, ROOFS.moss, ROOFS.plum];
const FIXED_ROOF = {
  townHall: ROOFS.slate, rosieShop: '#e07a98', boneSmith: ROOFS.slate, guild: '#2f8076', clinic: '#6aaea4', school: ROOFS.terracotta,
  farm: ROOFS.terracotta, lumber: ROOFS.moss, kiln: ROOFS.terracotta, fishingHut: ROOFS.teal, shrine: ROOFS.moss, onsen: ROOFS.teal,
  well: ROOFS.teal, waterTower: ROOFS.slate, bulletinBoard: '#a0704a', dungeonGate: '#d8483a',
};
/** a building's roof colour as its model paints it (its variant's own, or the player's remodel) */
export function roofColor(b) {
  const v = variantOf(b.seed || 0), lv = Math.max(1, b.level || 1);
  let own = FIXED_ROOF[b.type] || ROOFS.slate;
  if (b.type === 'home') own = ROOF_LIST[[(v * 3 + 1) % 5, (v * 2 + 3) % 5, (v * 4 + 2) % 5][Math.min(2, lv - 1)]];
  else if (b.type === 'chewyHouse') own = '#d8604a';
  else if (b.type === 'shop') {
    if (lv === 1) own = v >= 3 ? [ROOFS.plum, ROOFS.teal, ROOFS.slate, ROOFS.moss, ROOFS.terracotta][v % 5] : STALL_ROOF[v % 3];
    else if (lv === 2) own = v >= 4 ? [ROOFS.slate, ROOFS.plum, ROOFS.terracotta, ROOFS.teal][v % 4] : SHOP2_ROOF[v % 4];
    else own = v % 2 === 0 ? [ROOFS.slate, ROOFS.plum, ROOFS.moss, ROOFS.terracotta][(v >> 1) % 4] : [ROOFS.teal, ROOFS.terracotta, ROOFS.slate, ROOFS.plum][(v >> 1) % 4];
  }
  try { return styleOf(b).roof(own); } catch (e) { return own; }
}
/** the shop's own name by its variant ('Tea Stand', 'Bakery', 'Teahouse'…) */
export function variantName(b) {
  const V = BUILDINGS[b.type]?.variants; if (!V) return BUILDINGS[b.type]?.name || b.type;
  if (Array.isArray(V)) return V[Math.min(V.length - 1, Math.max(0, (b.level || 1) - 1))];
  const L = V[b.level || 1] || V[1]; return L[variantOf(b.seed || 0) % L.length];
}

// ------------------------------------------------------------------ small value noise (the painted grass)
const hashN = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
export function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hashN(ix, iy), b = hashN(ix + 1, iy), c = hashN(ix, iy + 1), d = hashN(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ------------------------------------------------------------------ the village
// [crown, its light side, its shade side]
const TREE_COL = { sakura: ['#efb6c8', '#fbd9e4', '#d0939f'], momiji: ['#e09066', '#f9bb93', '#c07450'], pine: ['#3f8758', '#5aa271', '#2f6a46'], round: ['#62ad5c', '#86c770', '#4a9050'],
  ginkgo: ['#e8c454', '#fbe08e', '#c8a03e'], bamboo: ['#88c460', '#acd980', '#6aa64c'], bush: ['#5ea659', '#7fc26b', '#4a8c4a'], shrub: ['#62aa5c', '#86c672', '#4c8e4c'] };
// the far copy's: each crown halfway to the grass under it (a gentle wash of colour, not a scatter of dots)
const mixHex = (a, b, t) => { const A = rgb(a), B = rgb(b), h = v => Math.round(v).toString(16).padStart(2, '0'); return '#' + [0, 1, 2].map(i => h(A[i] + (B[i] - A[i]) * t)).join(''); };
const SOFT_COL = Object.fromEntries(Object.entries(TREE_COL).map(([k, c]) => [k, [mixHex(c[0], '#86c06a', 0.32), c[1], mixHex(c[2], '#78b462', 0.32)]]));
const TREE_R = { sakura: 1.6, momiji: 1.6, pine: 1.25, round: 1.7, ginkgo: 1.5, bamboo: 1.0, bush: 0.85, shrub: 0.7 };
export class VillageArt {
  /** K: canvas pixels per metre (5; 4 on the Mobile and Low presets) */
  constructor(G, K = 5) { this.G = G; this.K = K; this.terrain = null; this.base = null; this.tHash = -1; this.stats = { terrainMs: 0, compositeMs: 0, builds: 0 }; }
  get size() { return WORLD * this.K; }
  /** the land's hash (every tile but paths and plazas, which the composite draws): the terrain layer only when it changes */
  landHash() {
    const t = this.G.village.world.terrain.tiles; let h = 0;
    for (let i = 0; i < t.length; i++) { const v = t[i] === T.PATH || t[i] === T.PLAZA ? 0 : t[i]; h = (h * 31 + v) | 0; }
    return h;
  }
  build() {
    const h = this.landHash();
    if (!this.terrain || h !== this.tHash) { const t0 = performance.now(); this.paintTerrain(); this.tHash = h; this.stats.terrainMs = +(performance.now() - t0).toFixed(1); }
    const t1 = performance.now(); this.composite(); this.stats.compositeMs = +(performance.now() - t1).toFixed(1); this.stats.builds++;
    return this.base;
  }
  // ---- the terrain layer
  paintTerrain() {
    const W = this.G.village.world, tr = W.terrain, Hh = tr.h, S = tr.S, R = tr.RES, N = WORLD * R, tiles = tr.tiles;
    const water = new ImageData(N, N), land = new ImageData(N, N), Dw = water.data, Dl = land.data;
    const H = (i, j) => Hh[Math.max(0, Math.min(S - 1, j)) * S + Math.max(0, Math.min(S - 1, i))];
    const DEEP = [52, 132, 200], MID = [86, 182, 226], SHAL = [146, 220, 236], GR = [146, 208, 114], GR2 = [124, 192, 98], GRL = [170, 220, 128], HI = [108, 172, 98];
    const SAND = [246, 226, 178], ROCK = [198, 184, 170], SOIL = [178, 128, 88], SOIL2 = [150, 104, 70];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const h = H(i, j), k = (j * N + i) * 4, x = (i + 0.5) / R, z = (j + 0.5) / R;
      // water under everything (the land covers it), by depth, with a soft ripple
      const d = clamp01(-h / 3.2), rip = (vnoise(x * 0.35, z * 0.35) - 0.5) * 10;
      const a = d < 0.35 ? d / 0.35 : 1, b = d < 0.35 ? 0 : (d - 0.35) / 0.65;
      Dw[k] = (SHAL[0] + (MID[0] - SHAL[0]) * a + (DEEP[0] - MID[0]) * b) + rip; Dw[k + 1] = (SHAL[1] + (MID[1] - SHAL[1]) * a + (DEEP[1] - MID[1]) * b) + rip; Dw[k + 2] = (SHAL[2] + (MID[2] - SHAL[2]) * a + (DEEP[2] - MID[2]) * b) + rip * 0.6; Dw[k + 3] = 255;
      if (h < 0.02) { Dl[k + 3] = 0; continue; }
      // the light from the north-west (the top of the map at the default camera): soft relief, never black
      const hx = (H(i + 1, j) - H(i - 1, j)) * R / 2, hz = (H(i, j + 1) - H(i, j - 1)) * R / 2;
      const shade = Math.max(-0.5, Math.min(0.5, (-hx - hz) * 0.42)), slope = Math.hypot(hx, hz);
      const t = tiles[(j >> 1) * WORLD + (i >> 1)];
      let c;
      if (t === T.SAND || (h < 0.45 && t !== T.FIELD)) { const n = vnoise(x * 0.6, z * 0.6) * 10 - 5; c = [SAND[0] + n, SAND[1] + n, SAND[2] + n * 0.6]; }
      else if (t === T.ROCK || slope > 1.15) { const n = vnoise(x * 0.5, z * 0.5) * 16 - 8; c = [ROCK[0] + n, ROCK[1] + n, ROCK[2] + n]; }
      else if (t === T.FIELD) { const row = ((x + z * 0.15) % 1) < 0.5; c = row ? SOIL : SOIL2; }
      else {
        // meadow patches (two scales of noise) and a cooler, deeper green up the hills
        const n1 = vnoise(x * 0.08, z * 0.08), n2 = vnoise(x * 0.31 + 7, z * 0.31 + 3), m = n1 * 0.7 + n2 * 0.3;
        const lift = clamp01((h - 2.2) / 7);
        const g0 = m < 0.45 ? GR2 : m > 0.62 ? GRL : GR, w = m < 0.45 ? (0.45 - m) * 3 : m > 0.62 ? (m - 0.62) * 3 : 0;
        c = [GR[0] + (g0[0] - GR[0]) * clamp01(w), GR[1] + (g0[1] - GR[1]) * clamp01(w), GR[2] + (g0[2] - GR[2]) * clamp01(w)];
        c = [c[0] + (HI[0] - c[0]) * lift, c[1] + (HI[1] - c[1]) * lift, c[2] + (HI[2] - c[2]) * lift];
      }
      // relief: lit faces warm and lighter, shaded faces cooler (lavender), as the game's toon shading
      const s = shade;
      Dl[k] = c[0] * (1 + s * 0.34) + (s < 0 ? -s * 10 : s * 6); Dl[k + 1] = c[1] * (1 + s * 0.3); Dl[k + 2] = c[2] * (1 + s * 0.22) + (s < 0 ? -s * 34 : 0); Dl[k + 3] = 255;
      // a darker lip where the ground drops (cliff tops and terrace edges read as steps)
      if (slope > 0.55) { const e = Math.min(0.22, (slope - 0.55) * 0.22); Dl[k] *= 1 - e; Dl[k + 1] *= 1 - e * 0.9; Dl[k + 2] *= 1 - e * 0.8; }
    }
    const wc = canvas(N), lc = canvas(N);
    wc.getContext('2d').putImageData(water, 0, 0); lc.getContext('2d').putImageData(land, 0, 0);
    const Kp = this.size, c = this.terrain || (this.terrain = canvas(Kp)); c.width = c.height = Kp;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(wc, 0, 0, Kp, Kp);
    // the water's shine: soft light streaks
    g.save(); g.globalAlpha = 0.16; g.strokeStyle = '#ffffff'; g.lineCap = 'round';
    for (let n = 0; n < 160; n++) { const x = hashN(n, 3) * WORLD, z = hashN(n, 7) * WORLD, l = 2 + hashN(n, 9) * 4; if (tr.heightAt(x, z) > -0.8) continue; g.lineWidth = this.K * 0.35; g.beginPath(); g.moveTo((x - l / 2) * this.K, z * this.K); g.lineTo((x + l / 2) * this.K, z * this.K); g.stroke(); }
    g.restore();
    // the foam at every shore: the land's own silhouette cast twice as a white glow into the water (wide and faint,
    // then tight and bright), before the land is drawn over its own glow
    g.save();
    g.shadowColor = 'rgba(255, 255, 255, .55)'; g.shadowBlur = this.K * 2.6; g.drawImage(lc, 0, 0, Kp, Kp);
    g.shadowColor = 'rgba(255, 255, 255, .95)'; g.shadowBlur = this.K * 0.7; g.drawImage(lc, 0, 0, Kp, Kp);
    g.restore();
    g.drawImage(lc, 0, 0, Kp, Kp);
    // the districts' soft tints (opened rings bright, the rest a faint lilac with "opens at rank" labels: the big map)
    // (half a pixel a metre and drawn up smooth: each district a soft wash, not a set of boxes)
    const ring = this.G.sim?.ringRank?.() || 1, tc = canvas(WORLD / 2), tg = tc.getContext('2d');
    for (const p of PLOTS) {
      const D = DISTRICTS[p.district]; if (!D) continue;
      tg.fillStyle = D.ring && D.ring > ring ? '#b8a8d0' : D.color;
      tg.beginPath(); tg.roundRect((p.x - 2) / 2, (p.z - 2) / 2, (p.w + 4) / 2, (p.d + 4) / 2, 2); tg.fill();
    }
    g.save(); g.globalAlpha = 0.17; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(tc, 0, 0, Kp, Kp); g.restore();
    this.ringAtPaint = ring;
  }
  // ---- the composite: paths, plazas, bridges, trees, buildings
  composite() {
    const G = this.G, W = G.village.world, K = this.K, Kp = this.size, tiles = W.terrain.tiles;
    if (this.ringAtPaint !== (G.sim?.ringRank?.() || 1)) this.paintTerrain(); // (a ring opened: its tint brightens)
    const c = this.base || (this.base = canvas(Kp)); c.width = c.height = Kp;
    const g = c.getContext('2d');
    g.drawImage(this.terrain, 0, 0);
    // paths and plazas: a smooth field over their tiles (blurred, then cut at two levels: a warm edge, then the paving),
    // so the streets come out as clean strokes with round corners at any zoom
    g.drawImage(this.paving(tiles), 0, 0);
    // the plaza's paving joints and the fountain's ring are part of the buildings below; a faint grid here
    g.save(); g.globalAlpha = 0.09; g.strokeStyle = '#a08060'; g.lineWidth = 1; g.beginPath();
    for (let z = 0; z < WORLD; z += 2) for (let x = 0; x < WORLD; x += 2) if (tiles[z * WORLD + x] === T.PLAZA) { g.rect(x * K, z * K, 2 * K, 2 * K); }
    g.stroke(); g.restore();
    // the stub streets of the rings not opened yet: dashed, faint
    const ring = G.sim?.ringRank?.() || 1;
    g.save(); g.setLineDash([K * 1.2, K * 1.1]); g.lineCap = 'round'; g.strokeStyle = 'rgba(120, 104, 140, .55)';
    for (const P of PATHS) { if (P.rank <= ring) continue; g.lineWidth = Math.max(2, P.w * K * 0.7); g.beginPath(); P.pts.forEach(([x, z], i) => (i ? g.lineTo(x * K, z * K) : g.moveTo(x * K, z * K))); g.stroke(); }
    g.restore();
    // Chewy's garden bed (tilled: soil rows; else a lawn the size of the bed)
    // (the tiles paint it in the terrain layer; its fence here)
    g.save(); g.strokeStyle = 'rgba(122, 82, 52, .8)'; g.lineWidth = Math.max(1, K * 0.18); g.setLineDash([K * 0.5, K * 0.3]);
    g.strokeRect(CHEWY_GARDEN.x * K, CHEWY_GARDEN.z * K, CHEWY_GARDEN.w * K, CHEWY_GARDEN.d * K); g.restore();
    // the far copy (the big map zoomed out: fewer, softer trees, so the buildings and the marks stand out) shares the
    // ground; each then gets its trees and the buildings over them
    const f = this.baseFar || (this.baseFar = canvas(Kp)); f.width = f.height = Kp;
    const gf = f.getContext('2d'); gf.drawImage(c, 0, 0);
    this.drawTrees(g);
    this.drawBuildings(g);
    this.drawTrees(gf, true);
    this.drawBuildings(gf);
  }
  /** the paving layer (a canvas the size of the base): paths and plazas from their tiles, anti-aliased */
  paving(tiles) {
    const K = this.K, N = WORLD, Kp = this.size;
    const fp = new Float32Array(N * N), fz = new Float32Array(N * N), bp = new Float32Array(N * N), bz = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) { const t = tiles[i]; if (t === T.PATH) fp[i] = 1; else if (t === T.PLAZA) fz[i] = 1; }
    // a [1 2 1] blur each way (the field is 1 inside a wide street, ½ on a 1-tile path's line, ¼ just off a street)
    const blur = (src, dst) => {
      const tmp = new Float32Array(N * N);
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const i = z * N + x; tmp[i] = (src[i] * 2 + (x > 0 ? src[i - 1] : 0) + (x < N - 1 ? src[i + 1] : 0)) / 4; }
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const i = z * N + x; dst[i] = (tmp[i] * 2 + (z > 0 ? tmp[i - N] : 0) + (z < N - 1 ? tmp[i + N] : 0)) / 4; }
    };
    blur(fp, bp); blur(fz, bz);
    const c = this.pave || (this.pave = canvas(Kp)); c.width = c.height = Kp;
    const g = c.getContext('2d'), img = g.createImageData(Kp, Kp), D = img.data;
    const at = (f, u, v) => { const x = Math.max(0, Math.min(N - 1.001, u)), z = Math.max(0, Math.min(N - 1.001, v)), i = Math.floor(x), j = Math.floor(z), tx = x - i, tz = z - j, k = j * N + i;
      return (f[k] * (1 - tx) + f[k + 1] * tx) * (1 - tz) + (f[k + N] * (1 - tx) + f[k + N + 1] * tx) * tz; };
    const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    const EDGE = [214, 176, 137], PATH = [246, 230, 200], PLAZA = [255, 241, 220];
    for (let tz = 0; tz < N; tz++) for (let tx = 0; tx < N; tx++) {
      // a tile's block, only where the field reaches it
      let any = false;
      for (let dz = -1; dz <= 1 && !any; dz++) for (let dx = -1; dx <= 1; dx++) { const x = tx + dx, z = tz + dz; if (x >= 0 && z >= 0 && x < N && z < N && (bp[z * N + x] > 0.05 || bz[z * N + x] > 0.05)) { any = true; break; } }
      if (!any) continue;
      for (let py = tz * K; py < (tz + 1) * K; py++) for (let px = tx * K; px < (tx + 1) * K; px++) {
        const u = (px + 0.5) / K - 0.5, v = (py + 0.5) / K - 0.5, p = at(bp, u, v), q = at(bz, u, v), f = Math.max(p, q);
        const e = ss(0.2, 0.27, f); if (e <= 0) continue;
        const fill = ss(0.4, 0.47, f), plaza = q >= p ? 1 : ss(0.3, 0.6, q / (p + 1e-3));
        const n = (hashN(Math.floor(px / (K * 0.7)), Math.floor(py / (K * 0.7))) - 0.5) * 9; // (a cobble's worth of variation)
        const k = (py * Kp + px) * 4;
        for (let ch = 0; ch < 3; ch++) { const top = PATH[ch] + (PLAZA[ch] - PATH[ch]) * plaza + n * fill; D[k + ch] = EDGE[ch] + (top - EDGE[ch]) * fill; }
        D[k + 3] = 255 * e;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  /** soft: the far copy's (a woodland wash, three crowns in four, smaller and nearer the grass, no lit side) */
  drawTrees(g, soft = false) {
    const K = this.K, veg = this.G.village.world.veg; if (!veg) return;
    const sh = new Path2D(), body = {}, hi = {}, lily = new Path2D();
    const list = [];
    for (const r of veg.instances) {
      if (!r.alive) continue;
      if (r.kind === 'lilies') { lily.moveTo((r.x + 0.5) * K, r.z * K); lily.arc(r.x * K, r.z * K, K * 0.5, 0, Math.PI * 2); continue; }
      const col = TREE_COL[r.kind]; if (!col) continue;
      if (soft && (r.kind === 'bush' || r.kind === 'shrub' || hashN(Math.round(r.x * 7), Math.round(r.z * 7)) < 0.26)) continue;
      list.push(r);
    }
    list.sort((a, b) => (a.x + a.z) - (b.x + b.z)); // (the far ones first: nearer crowns overlap them, as on screen)
    // the woodland floor: every tree's shade on a metre-a-pixel canvas, drawn up soft, so trees that stand together read
    // as a wood (darker the denser), not a scatter of dots
    const wc = canvas(WORLD), wg = wc.getContext('2d'); wg.fillStyle = soft ? 'rgba(52, 104, 62, .2)' : 'rgba(44, 96, 60, .15)';
    for (const r of list) { if (r.kind === 'bush' || r.kind === 'shrub') continue; wg.beginPath(); wg.arc(r.x, r.z, (TREE_R[r.kind] || 1.4) * (soft ? 2.6 : 2.1), 0, Math.PI * 2); wg.fill(); }
    g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(wc, 0, 0, this.size, this.size); g.restore();
    const dark = {};
    for (const r of list) {
      const rad = (TREE_R[r.kind] || 1.4) * Math.min(1.35, Math.max(0.6, r.s || 1)) * K * (soft ? 0.84 : 1), x = r.x * K, z = r.z * K;
      sh.moveTo(x + rad * 0.3 + rad, z + rad * 0.38); sh.arc(x + rad * 0.3, z + rad * 0.38, rad, 0, Math.PI * 2);
      const c = soft ? SOFT_COL[r.kind] : TREE_COL[r.kind];
      (dark[c[2]] ||= new Path2D()).moveTo(x + rad * 0.1 + rad, z + rad * 0.12); dark[c[2]].arc(x + rad * 0.1, z + rad * 0.12, rad, 0, Math.PI * 2);
      (body[c[0]] ||= new Path2D()).moveTo(x - rad * 0.04 + rad * 0.9, z - rad * 0.04); body[c[0]].arc(x - rad * 0.04, z - rad * 0.04, rad * 0.9, 0, Math.PI * 2);
      const hr = rad * 0.46; (hi[c[1]] ||= new Path2D()).moveTo(x - rad * 0.3 + hr, z - rad * 0.32); hi[c[1]].arc(x - rad * 0.3, z - rad * 0.32, hr, 0, Math.PI * 2);
    }
    g.fillStyle = soft ? 'rgba(30, 60, 44, .12)' : 'rgba(30, 60, 44, .24)'; g.fill(sh);
    for (const [col, p] of Object.entries(dark)) { g.fillStyle = col; g.fill(p); }
    for (const [col, p] of Object.entries(body)) { g.fillStyle = col; g.fill(p); }
    if (!soft) { g.save(); g.globalAlpha = 0.85; for (const [col, p] of Object.entries(hi)) { g.fillStyle = col; g.fill(p); } g.restore(); }
    g.fillStyle = '#5fae6a'; g.fill(lily);
  }
  /** every building (or those in a box: the big map zoomed in draws them again, crisp, over the cached ones) */
  drawBuildings(g, box = null) {
    const G = this.G, K = this.K, sim = G.sim;
    const roundRect = (x, z, w, d, r) => { g.beginPath(); g.roundRect(x * K, z * K, w * K, d * K, r * K); };
    for (const r of sim.list) {
      const b = r.data, def = BUILDINGS[b.type]; if (!def) continue;
      const [w, d] = sim.dims(b.type, b.rot, b.level), x = b.x, z = b.z;
      if (box && (x + w < box.x0 || x > box.x1 || z + d < box.z0 || z > box.z1)) continue;
      const small = def.cat === 'decor' && w * d <= 2 && b.type !== 'fountain';
      if (b.type === 'bridge') { this.bridge(g, x, z, w, d); continue; }
      if (small) { this.decor(g, b, x, z, w, d); continue; }
      if (b.type === 'fountain') {
        g.fillStyle = '#d9d0c8'; g.beginPath(); g.arc((x + w / 2) * K, (z + d / 2) * K, Math.min(w, d) * 0.55 * K, 0, Math.PI * 2); g.fill(); g.lineWidth = 1; g.strokeStyle = INK; g.stroke();
        g.fillStyle = '#7ad0ee'; g.beginPath(); g.arc((x + w / 2) * K, (z + d / 2) * K, Math.min(w, d) * 0.38 * K, 0, Math.PI * 2); g.fill();
        continue;
      }
      if (b.type === 'park') {
        g.fillStyle = '#a6dc84'; roundRect(x + 0.15, z + 0.15, w - 0.3, d - 0.3, 0.8); g.fill(); g.strokeStyle = 'rgba(74,44,42,.35)'; g.lineWidth = 1; g.stroke();
        g.fillStyle = '#7ad0ee'; g.beginPath(); g.ellipse((x + w * 0.66) * K, (z + d * 0.62) * K, w * 0.2 * K, d * 0.15 * K, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f2a6c6'; g.beginPath(); g.arc((x + w * 0.32) * K, (z + d * 0.35) * K, w * 0.24 * K, 0, Math.PI * 2); g.fill();
        continue;
      }
      if (b.type === 'farm') {
        g.fillStyle = '#b07a52'; roundRect(x + 0.1, z + 0.1, w - 0.2, d - 0.2, 0.4); g.fill(); g.strokeStyle = 'rgba(74,44,42,.5)'; g.lineWidth = 1; g.stroke();
        g.fillStyle = '#6cbf5a'; for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) { g.beginPath(); g.arc((x + 0.5 + i * (w - 1) / 2) * K, (z + 0.45 + k * (d - 0.9) / 3) * K, K * 0.28, 0, Math.PI * 2); g.fill(); }
        continue;
      }
      if (b.type === 'dungeonGate') { this.gate(g, x, z, w, d); continue; }
      // a roofed building: its shadow on the camera side, the roof in two planes (lit / shaded) about the ridge, an ink line
      const roof = roofColor(b), inset = def.cat === 'decor' ? 0.25 : 0.12, along = w >= d;
      g.fillStyle = 'rgba(40, 30, 50, .26)'; roundRect(x + inset + 0.35, z + inset + 0.4, w - inset * 2, d - inset * 2, 0.45); g.fill();
      roundRect(x + inset, z + inset, w - inset * 2, d - inset * 2, 0.45); g.fillStyle = shadeHex(roof, -0.08); g.fill();
      g.save(); g.clip();
      g.fillStyle = shadeHex(roof, 0.16);
      if (along) g.fillRect(x * K, z * K, w * K, d / 2 * K); else g.fillRect(x * K, z * K, w / 2 * K, d * K);
      g.strokeStyle = shadeHex(roof, -0.32); g.lineWidth = Math.max(1, K * 0.16); g.beginPath();
      if (along) { g.moveTo((x + 0.3) * K, (z + d / 2) * K); g.lineTo((x + w - 0.3) * K, (z + d / 2) * K); } else { g.moveTo((x + w / 2) * K, (z + 0.3) * K); g.lineTo((x + w / 2) * K, (z + d - 0.3) * K); }
      g.stroke(); g.restore();
      roundRect(x + inset, z + inset, w - inset * 2, d - inset * 2, 0.45); g.lineWidth = Math.max(1, K * 0.2); g.strokeStyle = INK; g.stroke();
    }
  }
  bridge(g, x, z, w, d) {
    const K = this.K, along = d > w;
    g.save(); g.fillStyle = 'rgba(40,30,50,.25)'; g.fillRect((x + 0.3) * K, (z + 0.35) * K, w * K, d * K);
    g.fillStyle = '#d8573f'; g.beginPath(); g.roundRect(x * K, z * K, w * K, d * K, K * 0.5); g.fill(); g.lineWidth = Math.max(1, K * 0.2); g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#c98f5e'; g.beginPath(); g.roundRect((x + (along ? 0.45 : 0.1)) * K, (z + (along ? 0.1 : 0.45)) * K, (along ? w - 0.9 : w - 0.2) * K, (along ? d - 0.2 : d - 0.9) * K, K * 0.3); g.fill();
    g.strokeStyle = 'rgba(107,74,58,.55)'; g.lineWidth = 1; g.beginPath();
    if (along) for (let k = z + 0.7; k < z + d - 0.4; k += 0.7) { g.moveTo((x + 0.45) * K, k * K); g.lineTo((x + w - 0.45) * K, k * K); }
    else for (let k = x + 0.7; k < x + w - 0.4; k += 0.7) { g.moveTo(k * K, (z + 0.45) * K); g.lineTo(k * K, (z + d - 0.45) * K); }
    g.stroke(); g.restore();
  }
  gate(g, x, z, w, d) {
    const K = this.K, cx = (x + w / 2) * K, cz = (z + d / 2) * K;
    g.save();
    g.fillStyle = '#6a8a5a'; g.beginPath(); g.ellipse(cx, cz - K * 0.4, w * 0.55 * K, d * 0.45 * K, 0, 0, Math.PI * 2); g.fill(); // (the mossy hill)
    g.fillStyle = '#3a2c4a'; g.beginPath(); g.ellipse(cx, cz - K * 0.2, w * 0.24 * K, d * 0.2 * K, 0, 0, Math.PI * 2); g.fill(); // (the burrow)
    g.fillStyle = '#b48aff'; g.globalAlpha = 0.7; g.beginPath(); g.ellipse(cx, cz - K * 0.2, w * 0.12 * K, d * 0.1 * K, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    g.strokeStyle = INK; g.lineWidth = Math.max(1.5, K * 0.5); g.lineCap = 'round'; // the torii: two posts and the beam (the ink under the red)
    for (const [lw, col] of [[K * 0.62, INK], [K * 0.38, '#e8503a']]) { g.lineWidth = lw; g.strokeStyle = col; g.beginPath(); g.moveTo(cx - w * 0.36 * K, cz + d * 0.36 * K); g.lineTo(cx + w * 0.36 * K, cz + d * 0.36 * K); g.moveTo(cx - w * 0.3 * K, cz + d * 0.36 * K - K * 0.05); g.lineTo(cx - w * 0.3 * K, cz + d * 0.44 * K); g.moveTo(cx + w * 0.3 * K, cz + d * 0.36 * K - K * 0.05); g.lineTo(cx + w * 0.3 * K, cz + d * 0.44 * K); g.stroke(); }
    g.restore();
  }
  decor(g, b, x, z, w, d) {
    const K = this.K, cx = (x + w / 2) * K, cz = (z + d / 2) * K;
    const dot = (px, pz, r, fill, stroke = 'rgba(74,44,42,.55)') => { g.beginPath(); g.arc(px, pz, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); if (stroke) { g.lineWidth = 1; g.strokeStyle = stroke; g.stroke(); } };
    switch (b.type) {
      case 'bench': g.fillStyle = '#b07a4e'; g.beginPath(); g.roundRect(cx - K * 0.42, cz - K * 0.2, K * 0.84, K * 0.4, K * 0.12); g.fill(); break;
      case 'flowerBed': for (let i = 0; i < 4; i++) dot(cx + Math.cos(i * 1.7) * K * 0.28, cz + Math.sin(i * 1.7) * K * 0.24, K * 0.18, ['#ff8fb0', '#ffd24a', '#c8a0ff', '#ff9a6a'][i], null); break;
      case 'stoneLantern': case 'streetLamp': dot(cx, cz, K * 0.26, '#fff3c0'); break;
      case 'sakuraPlanter': dot(cx, cz, K * 0.42, '#f6b0cc'); break;
      case 'miniTorii': g.fillStyle = '#e8503a'; g.fillRect(cx - K * 0.4, cz - K * 0.1, K * 0.8, K * 0.2); break;
      case 'koiStatue': case 'chewyStatue': dot(cx, cz, K * 0.36, '#d9d0c8'); dot(cx, cz, K * 0.14, '#f4c04a', null); break;
      case 'well': dot(cx, cz, K * 0.42, '#c8bcb4'); dot(cx, cz, K * 0.24, '#5cb8e0', null); break;
      case 'lanternString': for (let i = -1; i <= 1; i++) dot(cx + i * K * 0.5, cz, K * 0.16, '#e8503a', null); break;
      case 'bulletinBoard': g.fillStyle = '#a0704a'; g.beginPath(); g.roundRect(cx - K * 0.45, cz - K * 0.18, K * 0.9, K * 0.36, K * 0.08); g.fill(); g.lineWidth = 1; g.strokeStyle = INK; g.stroke(); break;
      case 'fence': g.strokeStyle = '#c98f5e'; g.lineWidth = Math.max(1, K * 0.15); g.beginPath(); if (w >= d) { g.moveTo(x * K, cz); g.lineTo((x + w) * K, cz); } else { g.moveTo(cx, z * K); g.lineTo(cx, (z + d) * K); } g.stroke(); break;
      case 'sprinkler': dot(cx, cz, K * 0.18, '#8fd0ff', null); break;
      default: dot(cx, cz, K * 0.25, '#e8d8c0');
    }
  }
}

// ------------------------------------------------------------------ glyph rasterising (the map's icons are the game's own glyphs)
const GLYPH_IMG = new Map();
let markV = 0;
/** bumps whenever a glyph has loaded (what was drawn before it showed a dot: the Key draws itself again) */
export const markVersion = () => markV;
/** an icon's SVG markup: a glyph (ui/glyphs.js), or 'cozy:<key>' for the cozy path's icons (ui/cozyIcons.js) */
const DRAWN_SVG = { // (the hand-drawn icons for the DOM: the directory's rows)
  stairs: '<svg class="gl" viewBox="0 0 32 32" aria-hidden="true"><path d="M5 27V19h7v-7h7V5h8v22z" fill="#8fd0ff" stroke="#4a2c2a" stroke-width="2.6" stroke-linejoin="round"/></svg>',
  claw: '<svg class="gl" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="#8a56d8" stroke="#4a2c2a" stroke-width="2.2"/><path d="M9.5 9.5l4 13M15 9l4 13.5M20.5 9.5l3.5 12" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>',
  portal: '<svg class="gl" viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="16" rx="8.5" ry="11.5" fill="#d8c4ff" stroke="#4a2c2a" stroke-width="5"/><ellipse cx="16" cy="16" rx="8.5" ry="11.5" fill="none" stroke="#b48aff" stroke-width="2.8"/></svg>',
};
export const iconSVG = name => (name?.startsWith('cozy:') ? cozyIcon(name.slice(5)) : name?.startsWith('draw:') ? DRAWN_SVG[name.slice(5)] || glyph('sparkle') : glyph(name));
/** the glyph as an <img> (async: null until it has loaded once) */
export function glyphImage(name, svg = null) {
  let e = GLYPH_IMG.get(name);
  if (!e) {
    const src = (svg || iconSVG(name)).replace('<svg ', '<svg width="64" height="64" ');
    const img = new Image(); e = { img, ok: false }; GLYPH_IMG.set(name, e);
    img.onload = () => { e.ok = true; BADGES.clear(); markV++; }; // (badges drawn before it loaded had a dot: draw them again)
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  }
  return e.ok ? e.img : null;
}

// ------------------------------------------------------------------ pre-rendered marks
const BADGES = new Map();
if (typeof document !== 'undefined') document.fonts?.addEventListener?.('loadingdone', () => BADGES.clear());
function cached(key, w, h, draw) {
  let c = BADGES.get(key); if (c) return c;
  const s = Math.max(2, DPR()); c = canvas(w * s, h * s); const g = c.getContext('2d'); g.scale(s, s); draw(g); c.cssW = w; c.cssH = h; BADGES.set(key, c);
  return c;
}
/** a place's badge: a cream token ringed in its colour with the glyph inside (r: the radius in CSS px) */
export function badge(icon, color, r = 8, o = {}) {
  const key = `b|${icon}|${color}|${r}|${o.dim ? 1 : 0}|${o.svg ? 1 : 0}`, pad = 2, S = (r + pad) * 2;
  return cached(key, S, S, g => {
    const c = S / 2;
    g.beginPath(); g.arc(c, c + 0.8, r, 0, Math.PI * 2); g.fillStyle = 'rgba(74,44,42,.35)'; g.fill(); // (a little drop)
    g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fillStyle = o.dim ? '#e6ddd2' : CREAM; g.fill();
    if (o.dim) g.globalAlpha = 0.5; // (an opened chest, a used shrine: its ring and glyph faded)
    g.lineWidth = Math.max(1.6, r * 0.24); g.strokeStyle = color; g.stroke();
    g.beginPath(); g.arc(c, c, r + g.lineWidth / 2, 0, Math.PI * 2); g.lineWidth = 1; g.strokeStyle = INK; g.stroke();
    const hand = icon.startsWith('draw:') ? DRAWN[icon.slice(5)] : null, img = hand ? null : glyphImage(icon, o.svg || null);
    if (hand) hand(g, c, r * 0.55);
    else if (img) { const gs = r * 1.42; g.drawImage(img, c - gs / 2, c - gs / 2, gs, gs); }
    else { g.beginPath(); g.arc(c, c, r * 0.42, 0, Math.PI * 2); g.fillStyle = color; g.fill(); }
    g.globalAlpha = 1;
  });
}
/** a person's pip: their colour, a white rim, an ink line and their initial (r: CSS px; tiny ones have no letter) */
export function pip(color, letter, r = 6, o = {}) {
  const key = `p|${color}|${letter}|${r}|${o.ring || ''}`, pad = 2, S = (r + pad) * 2;
  return cached(key, S, S, g => {
    const c = S / 2;
    g.beginPath(); g.arc(c, c + 0.7, r, 0, Math.PI * 2); g.fillStyle = 'rgba(74,44,42,.32)'; g.fill();
    g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fillStyle = color; g.fill();
    g.lineWidth = r > 4 ? 1.6 : 1.1; g.strokeStyle = o.ring || '#fff'; g.stroke();
    g.beginPath(); g.arc(c, c, r + g.lineWidth / 2 + 0.3, 0, Math.PI * 2); g.lineWidth = 0.9; g.strokeStyle = INK; g.stroke();
    if (letter && r >= 5) {
      g.font = font(700, Math.round(r * 1.3)); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = 2.2; g.strokeStyle = 'rgba(74,44,42,.75)'; g.strokeText(letter, c, c + r * 0.08);
      g.fillStyle = '#fff'; g.fillText(letter, c, c + r * 0.08);
    }
  });
}
/** the little badge on a pip: '!' (something for you), '?' (their quest is on), a gift (a friendship reward) */
export function flag(kind, r = 4.6) {
  const key = `f|${kind}|${r}`, S = (r + 2) * 2;
  return cached(key, S, S, g => {
    const c = S / 2;
    g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fillStyle = kind === 'gift' ? '#ff8fb0' : kind === '?' ? '#8fd0ff' : '#ffd84a'; g.fill();
    g.lineWidth = 1.2; g.strokeStyle = INK; g.stroke();
    g.font = font(800, Math.round(r * 1.7)); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK;
    g.fillText(kind === 'gift' ? '♥' : kind, c, c + r * 0.1);
  });
}
/** Shadow: the black Boston terrier's head (bat ears, a white blaze) */
export function shadowMark(r = 6) {
  const key = `sh|${r}`, S = (r + 4) * 2;
  return cached(key, S, S, g => {
    const c = S / 2;
    g.lineJoin = 'round';
    const ears = () => { g.beginPath(); g.moveTo(c - r * 0.95, c - r * 0.15); g.lineTo(c - r * 0.85, c - r * 1.35); g.lineTo(c - r * 0.2, c - r * 0.7); g.closePath(); g.moveTo(c + r * 0.95, c - r * 0.15); g.lineTo(c + r * 0.85, c - r * 1.35); g.lineTo(c + r * 0.2, c - r * 0.7); g.closePath(); };
    ears(); g.lineWidth = 2.4; g.strokeStyle = '#fff'; g.stroke(); g.fillStyle = '#26232c'; g.fill();
    g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fillStyle = '#26232c'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = '#fff'; g.stroke();
    g.beginPath(); g.arc(c, c, r + 1.1, 0, Math.PI * 2); g.lineWidth = 0.9; g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(c, c + r * 0.25, r * 0.42, r * 0.5, 0, 0, Math.PI * 2); g.fill(); // the muzzle
    g.fillRect(c - r * 0.1, c - r * 0.75, r * 0.2, r * 0.8); // the blaze
    g.fillStyle = '#26232c'; g.beginPath(); g.arc(c, c + r * 0.05, r * 0.16, 0, Math.PI * 2); g.fill(); // the nose
  });
}
/** the player's arrow (the HUD's pink, a white rim) pointing up; the caller rotates */
export function drawArrow(g, x, y, ang, s = 1) {
  g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
  g.beginPath(); g.moveTo(0, -9); g.lineTo(7, 7); g.lineTo(0, 3.5); g.lineTo(-7, 7); g.closePath();
  g.lineJoin = 'round'; g.fillStyle = '#ff5c8a'; g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.3; g.stroke();
  g.restore();
}
/** the map pin: a pink teardrop with a white heart-dot, its tip at (x, y), a pulse ring round its foot */
export function drawPin(g, x, y, t = 0, s = 1, color = '#ff5c8a') {
  const p = 1 + Math.sin(t * 4.5) * 0.12;
  g.save(); g.translate(x, y);
  g.beginPath(); g.ellipse(0, 0, 7 * s * p, 3.2 * s * p, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(255, 92, 138, .3)'; g.fill();
  g.scale(s, s);
  g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-3, -5, -7.5, -8.5, -7.5, -13); g.arc(0, -13, 7.5, Math.PI, 0); g.bezierCurveTo(7.5, -8.5, 3, -5, 0, 0); g.closePath();
  g.lineJoin = 'round'; g.fillStyle = color; g.fill(); g.lineWidth = 2.4; g.strokeStyle = '#fff'; g.stroke(); g.lineWidth = 1; g.strokeStyle = INK; g.stroke();
  g.beginPath(); g.arc(0, -13, 3, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
  g.restore();
}
/** the quest objective's gold star (a soft halo, pulsing) */
export function drawStar(g, x, y, t = 0, s = 1) {
  const p = 1 + Math.sin(t * 5) * 0.14;
  g.save(); g.translate(x, y);
  g.beginPath(); g.arc(0, 0, 9 * s * p, 0, Math.PI * 2); g.fillStyle = 'rgba(255, 216, 74, .3)'; g.fill();
  g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = (i % 2 ? 2.7 : 6.3) * p * s; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath();
  g.lineJoin = 'round'; g.fillStyle = '#ffd84a'; g.fill(); g.lineWidth = 1.7; g.strokeStyle = INK; g.stroke();
  g.restore();
}
/** an arrow on a disc's rim pointing out toward something off the map, with its distance in a cream pill */
export function drawEdge(g, x, y, ang, label, color = '#ff5c8a', t = 0) {
  const b = Math.abs(Math.sin(t * 4)) * 1.5;
  g.save(); g.translate(x + Math.cos(ang) * b, y + Math.sin(ang) * b); g.rotate(ang);
  g.beginPath(); g.moveTo(8, 0); g.lineTo(-4, -6.5); g.lineTo(-1.5, 0); g.lineTo(-4, 6.5); g.closePath();
  g.lineJoin = 'round'; g.fillStyle = color; g.fill(); g.lineWidth = 2.2; g.strokeStyle = '#fff'; g.stroke(); g.lineWidth = 1; g.strokeStyle = INK; g.stroke();
  g.restore();
  if (!label) return;
  g.save(); g.font = font(700, 10); const w = g.measureText(label).width + 9, lx = x - Math.cos(ang) * 17, ly = y - Math.sin(ang) * 13;
  g.beginPath(); g.roundRect(lx - w / 2, ly - 7, w, 14, 7); g.fillStyle = 'rgba(255, 246, 232, .95)'; g.fill(); g.lineWidth = 1.2; g.strokeStyle = INK; g.stroke();
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, lx, ly + 0.5);
  g.restore();
}
/** a name under a mark: ink text in a cream halo */
export function drawLabel(g, text, x, y, px = 11, o = {}) {
  g.save(); g.font = font(o.w || 700, px); g.textAlign = o.align || 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  if (o.alpha != null) g.globalAlpha = o.alpha;
  g.lineWidth = o.halo || 3.4; g.strokeStyle = o.haloColor || 'rgba(255, 250, 240, .92)'; g.strokeText(text, x, y);
  g.fillStyle = o.color || INK; g.fillText(text, x, y);
  g.restore();
}

// ------------------------------------------------------------------ a zone (an outdoor region: docs/REGIONS.md)
// The region painted once on entry: its own colours (RegionWorld.mapColor: grass, moss, litter, sand, snow, rock, ice,
// water by depth) at two samples a metre with soft relief, the foam at every shore, the thickets the trail winds round (the
// cells the monsters can't walk) as darker masses, the glades as sunny clearings, the trail as a smooth path, the zone
// village (its square, every house's roof in the village's own map colour, its lanterns) and the dungeon's gate.
// 5 pixels a metre (4 on the light presets); nothing of it is drawn again during the visit.
export class RegionArt {
  constructor(G, mode, K = 5) { this.G = G; this.mode = mode; this.K = K; this.base = null; this.stats = { ms: 0 }; }
  get world() { return this.mode.world; }
  get N() { return this.world?.terrain?.N || 112; }
  build() {
    const t0 = performance.now(), W = this.world, L = this.mode.layout, N = this.N, K = this.K, Kp = N * K, SR = K >= 5 ? 2 : 1, NS = N * SR;
    // the ground, two samples a metre (one on the light presets): the region's own map colour, lit from the north-west
    const img = new ImageData(NS, NS), D = img.data, land = new ImageData(NS, NS), Dl = land.data;
    const hAt = (x, z) => W.heightAt(x, z);
    for (let j = 0; j < NS; j++) for (let i = 0; i < NS; i++) {
      const x = (i + 0.5) / SR, z = (j + 0.5) / SR, k = (j * NS + i) * 4;
      let c; try { c = rgb(W.mapColor(x, z) || '#8ac070'); } catch (e) { c = [138, 192, 112]; }
      const wet = (W.waterAt?.(x, z) || 0) > 0.04;
      if (!wet) {
        const hx = hAt(x + 0.7, z) - hAt(x - 0.7, z), hz = hAt(x, z + 0.7) - hAt(x, z - 0.7), s = Math.max(-0.5, Math.min(0.5, (-hx - hz) * 0.35));
        const n = (vnoise(x * 0.3, z * 0.3) - 0.5) * 10;
        c = [c[0] * (1 + s * 0.3) + n + (s < 0 ? -s * 8 : 0), c[1] * (1 + s * 0.26) + n, c[2] * (1 + s * 0.2) + n * 0.6 + (s < 0 ? -s * 30 : 0)];
        Dl[k] = c[0]; Dl[k + 1] = c[1]; Dl[k + 2] = c[2]; Dl[k + 3] = 255;
      } else Dl[k + 3] = 0;
      D[k] = c[0]; D[k + 1] = c[1]; D[k + 2] = c[2]; D[k + 3] = 255;
    }
    const wc = canvas(NS), lc = canvas(NS); wc.getContext('2d').putImageData(img, 0, 0); lc.getContext('2d').putImageData(land, 0, 0);
    const c = this.base || (this.base = canvas(Kp)); c.width = c.height = Kp;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(wc, 0, 0, Kp, Kp);
    // the foam at the shores (the land's silhouette glowing white into the water, then the land over its own glow)
    g.save(); g.shadowColor = 'rgba(255,255,255,.5)'; g.shadowBlur = K * 2.2; g.drawImage(lc, 0, 0, Kp, Kp); g.shadowColor = 'rgba(255,255,255,.9)'; g.shadowBlur = K * 0.6; g.drawImage(lc, 0, 0, Kp, Kp); g.restore();
    g.drawImage(lc, 0, 0, Kp, Kp);
    // the thickets: the cells nobody walks (not water), darker and drawn up soft
    const CELL = 2, tc = canvas(L.W, L.H), tg = tc.getContext('2d');
    tg.fillStyle = 'rgba(40, 76, 50, .3)';
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) if (!L.at(x, y) && (W.waterAt?.((x + 0.5) * CELL, (y + 0.5) * CELL) || 0) <= 0.04) tg.fillRect(x, y, 1, 1);
    g.save(); g.imageSmoothingEnabled = true; g.drawImage(tc, 0, 0, L.W * CELL * K, L.H * CELL * K); g.restore();
    // the glades: sunny clearings with a few flowers
    for (const gl of L.glades || []) {
      const gr = g.createRadialGradient(gl.x * K, gl.z * K, 0, gl.x * K, gl.z * K, gl.r * K);
      gr.addColorStop(0, 'rgba(232, 248, 170, .42)'); gr.addColorStop(1, 'rgba(232, 248, 170, 0)');
      g.fillStyle = gr; g.beginPath(); g.arc(gl.x * K, gl.z * K, gl.r * K, 0, Math.PI * 2); g.fill();
      for (let n = 0; n < 7; n++) { const a = hashN(n, gl.x) * Math.PI * 2, d = hashN(n, gl.z) * gl.r * 0.7; g.fillStyle = ['#ff9ac0', '#fff0a0', '#ffffff', '#c8a8ff'][n % 4]; g.beginPath(); g.arc((gl.x + Math.cos(a) * d) * K, (gl.z + Math.sin(a) * d) * K, K * 0.3, 0, Math.PI * 2); g.fill(); }
    }
    // the trail: a warm edge, then the trail's own stone (the region's palette)
    let trail = '#e8dcc0';
    const mid = L.paths?.[0]?.[Math.floor((L.paths?.[0]?.length || 1) / 2)];
    try { if (mid) trail = W.mapColor(mid[0], mid[1]) || trail; } catch (e) { /* */ }
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [lw, col] of [[2.9, 'rgba(120, 92, 64, .55)'], [2.1, trail]]) {
      g.lineWidth = lw * K; g.strokeStyle = col;
      for (const P of L.paths || []) { if (P.length < 2) continue; g.beginPath(); P.forEach(([x, z], i) => (i ? g.lineTo(x * K, z * K) : g.moveTo(x * K, z * K))); g.stroke(); }
    }
    g.restore();
    this.drawVillage(g);
    this.drawGate(g);
    this.stats.ms = +(performance.now() - t0).toFixed(1);
    return c;
  }
  drawVillage(g) {
    const V = this.mode.village, K = this.K; if (!V?.site) return;
    const S = V.site, sq = V.def?.square?.r || 5.2;
    g.fillStyle = 'rgba(230, 220, 198, .9)'; g.beginPath(); g.arc(S.x * K, S.z * K, sq * K, 0, Math.PI * 2); g.fill();
    g.lineWidth = Math.max(1, K * 0.25); g.strokeStyle = 'rgba(160, 128, 96, .7)'; g.stroke();
    const MAP = V.theme?.MAP || {};
    for (const b of V.buildings || []) {
      const f = b.info?.fp; if (!f) continue;
      const c = Math.cos(b.rot), s = Math.sin(b.rot), pt = (lx, lz) => [(b.x + lx * c + lz * s) * K, (b.z - lx * s + lz * c) * K];
      const quad = (x0, z0, x1, z1) => { g.beginPath(); [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].forEach(([lx, lz], i) => { const [x, y] = pt(lx, lz); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); };
      const roof = MAP[b.kind] || '#c8ac78';
      g.save(); g.translate(K * 0.35, K * 0.4); quad(f[0], f[1], f[2], f[3]); g.fillStyle = 'rgba(40,30,50,.26)'; g.fill(); g.restore();
      quad(f[0], f[1], f[2], f[3]); g.fillStyle = shadeHex(roof, -0.06); g.fill();
      const along = f[2] - f[0] >= f[3] - f[1], mx = (f[0] + f[2]) / 2, mz = (f[1] + f[3]) / 2;
      if (along) quad(f[0], f[1], f[2], mz); else quad(f[0], f[1], mx, f[3]);
      g.fillStyle = shadeHex(roof, 0.16); g.fill();
      const [ax, ay] = along ? pt(f[0] + 0.3, mz) : pt(mx, f[1] + 0.3), [bx, by] = along ? pt(f[2] - 0.3, mz) : pt(mx, f[3] - 0.3);
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineWidth = Math.max(1, K * 0.16); g.strokeStyle = shadeHex(roof, -0.32); g.stroke();
      quad(f[0], f[1], f[2], f[3]); g.lineWidth = Math.max(1, K * 0.2); g.strokeStyle = INK; g.stroke();
    }
    for (const l of V.lamps || []) { g.fillStyle = '#fff1b0'; g.beginPath(); g.arc(l.x * K, l.z * K, K * 0.22, 0, Math.PI * 2); g.fill(); }
  }
  drawGate(g) {
    const K = this.K, P = this.mode.gatePos; if (!P) return;
    g.save(); g.fillStyle = '#4a3a5a'; g.beginPath(); g.ellipse(P.x * K, P.z * K, K * 2.2, K * 1.6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(184, 138, 255, .7)'; g.beginPath(); g.ellipse(P.x * K, P.z * K, K * 1.1, K * 0.8, 0, 0, Math.PI * 2); g.fill(); g.restore();
  }
}

// ------------------------------------------------------------------ a dungeon floor (the Burrow's, a zone dungeon's)
// The floor painted once from its cells: a blurred walkable field cut at three levels (the floor, a wall rim inked in the
// theme's wall colour, its mossy or icy top, then the dark rock). The floor is one clean warm tone (the theme's own) with
// a soft, very low-frequency tone drift and the rooms' tints washed in from a blurred cell field (the start warm, a
// treasure room gold, a shrine lilac, the boss's red), so there are no seams; the lights add warm pools. Its flagstones
// are not in the bitmap: the provider fills the floor's own outline (`path`, marching squares on the same field, in
// metres) with a 64-pixels-a-metre stone pattern (`tile()`), so the stones stay crisp at any zoom. The fog over it is the
// provider's.
const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const FLOOR_ISO = 0.44;
export class DungeonArt {
  constructor(G, mode, K = 5) { this.G = G; this.mode = mode; this.K = K; this.base = null; this.path = null; this.stats = { ms: 0 }; }
  build() {
    const t0 = performance.now(), L = this.mode.layout, T = this.mode.theme || {}, CELL = 2, K = this.K, W = L.W, H = L.H;
    const P = Math.round(CELL * K), Pw = W * P, Ph = H * P;
    const fl = (T.floor || ['#d2bc9e', '#c4ac8c', '#dcc8aa']).map(rgb), wl = (T.wall || ['#9a7658', '#8a684c', '#a88464']).map(rgb), tp = (T.top || ['#8aac6a', '#7a9c5e', '#a0bc7c']).map(rgb);
    const fogc = rgb(typeof T.fog === 'string' ? T.fog : '#2c2230'), ROCK = [fogc[0] + 26, fogc[1] + 22, fogc[2] + 28];
    this.rock = hex(ROCK);
    // the walkable field, blurred [1 2 1] each way (the iso-line at FLOOR_ISO is the floor's edge)
    const f0 = new Float32Array(W * H), f = new Float32Array(W * H), tmp = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f0[y * W + x] = L.at(x, y) ? 1 : 0;
    const blur = (src, dst, n = 1) => { let a = src; for (let p = 0; p < n; p++) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; tmp[i] = (a[i] * 2 + (x > 0 ? a[i - 1] : a[i]) + (x < W - 1 ? a[i + 1] : a[i])) / 4; }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; dst[i] = (tmp[i] * 2 + (y > 0 ? tmp[i - W] : tmp[i]) + (y < H - 1 ? tmp[i + W] : tmp[i])) / 4; } a = dst; } };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; tmp[i] = (f0[i] * 2 + (x > 0 ? f0[i - 1] : 0) + (x < W - 1 ? f0[i + 1] : 0)) / 4; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; f[i] = (tmp[i] * 2 + (y > 0 ? tmp[i - W] : 0) + (y < H - 1 ? tmp[i + W] : 0)) / 4; }
    this.field = f;
    // the rooms' tints as a soft field: each room's cells in its kind's colour, blurred three times (no seams)
    const RT = { start: [238, 196, 150], treasure: [255, 214, 120], shrine: [206, 186, 250], boss: [250, 150, 140], stairs: [196, 222, 246], objective: [242, 208, 160] };
    const tr = new Float32Array(W * H), tg = new Float32Array(W * H), tb = new Float32Array(W * H), ta = new Float32Array(W * H);
    if (L.roomId) for (let i = 0; i < W * H; i++) { const r = L.rooms[(L.roomId[i] || 0) - 1], c = r && RT[r.kind]; if (c) { tr[i] = c[0]; tg[i] = c[1]; tb[i] = c[2]; ta[i] = 1; } }
    const sm = a => { const o = new Float32Array(W * H); blur(a, o, 3); return o; };
    const TR = sm(tr), TG = sm(tg), TB = sm(tb), TA = sm(ta);
    const at = (F, u, v) => { const x = Math.max(0, Math.min(W - 1.001, u)), z = Math.max(0, Math.min(H - 1.001, v)), i = Math.floor(x), j = Math.floor(z), tx = x - i, tz = z - j, k = j * W + i;
      return (F[k] * (1 - tx) + F[k + 1] * tx) * (1 - tz) + (F[k + W] * (1 - tx) + F[k + W + 1] * tx) * tz; };
    const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    // the tone drift: value noise at ~6 m and ~2 m, sampled per cell corner and drawn up smooth (no blocks)
    const nw = W + 2, N1 = new Float32Array(nw * (H + 2));
    for (let j = 0; j < H + 2; j++) for (let i = 0; i < nw; i++) N1[j * nw + i] = vnoise(i * CELL / 6, j * CELL / 6) * 0.65 + vnoise(i * CELL / 2.2 + 11, j * CELL / 2.2) * 0.35;
    const nAt = (u, v) => { const x = Math.max(0, u + 0.5), z = Math.max(0, v + 0.5), i = Math.min(nw - 2, Math.floor(x)), j = Math.min(H, Math.floor(z)), tx = x - i, tz = z - j, k = j * nw + i;
      return (N1[k] * (1 - tx) + N1[k + 1] * tx) * (1 - tz) + (N1[k + nw] * (1 - tx) + N1[k + nw + 1] * tx) * tz; };
    const c = this.base || (this.base = canvas(Pw, Ph)); c.width = Pw; c.height = Ph;
    const g = c.getContext('2d'), img = g.createImageData(Pw, Ph), D = img.data;
    const F0 = fl[0], E = 0.035, mix = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
    // the bands: the floor (its one tone, a gentle drift, the room's wash, darker toward the wall), the wall, its top, the rock
    const floorC = (fv, u, v, n) => {
      const d = (n - 0.5) * 0.09, ta2 = at(TA, u, v); let col = [F0[0] * (1 + d), F0[1] * (1 + d), F0[2] * (1 + d * 0.9)];
      if (ta2 > 0.02) { const w = Math.min(1, ta2) * 0.2, r0 = at(TR, u, v) / ta2, g0 = at(TG, u, v) / ta2, b0 = at(TB, u, v) / ta2; col = [col[0] + (r0 - col[0]) * w, col[1] + (g0 - col[1]) * w, col[2] + (b0 - col[2]) * w]; }
      return mix(wl[0], col, 0.62 + ss(FLOOR_ISO, 0.66, fv) * 0.38);
    };
    const wallC = fv => { const w = wl[1], t = ss(0.3, FLOOR_ISO, fv); return [w[0] * (0.8 + t * 0.2), w[1] * (0.8 + t * 0.2), w[2] * (0.82 + t * 0.18)]; };
    const topC = (fv, n) => { const t = tp[0], d = (n - 0.5) * 0.12; return mix(ROCK, [t[0] * (1 + d), t[1] * (1 + d), t[2] * (1 + d)], ss(0.18, 0.3, fv)); };
    for (let py = 0; py < Ph; py++) for (let px = 0; px < Pw; px++) {
      const u = (px + 0.5) / P - 0.5, v = (py + 0.5) / P - 0.5, fv = at(f, u, v), k = (py * Pw + px) * 4, n = nAt(u, v);
      let col; // (each edge between two bands blended over about a pixel, so drawn up at full zoom it stays smooth: no steps)
      if (fv > FLOOR_ISO + E) col = floorC(fv, u, v, n);
      else if (fv > FLOOR_ISO - E) col = mix(wallC(fv), floorC(fv, u, v, n), ss(FLOOR_ISO - E, FLOOR_ISO + E, fv));
      else if (fv > 0.3 + E) col = wallC(fv);
      else if (fv > 0.3 - E) col = mix(topC(fv, n), wallC(fv), ss(0.3 - E, 0.3 + E, fv));
      else if (fv > 0.18) col = topC(fv, n);
      else { const d = (n - 0.5) * 10; col = [ROCK[0] + d, ROCK[1] + d, ROCK[2] + d * 1.2]; }
      D[k] = col[0]; D[k + 1] = col[1]; D[k + 2] = col[2]; D[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // the lights' warm pools: a wash of amber over the floor (never lighter: a pale floor stays a floor, not a glare)
    g.save();
    for (const l of L.lights || []) { const x = ((l.x ?? 0) + 0.5) * P, y = ((l.y ?? l.z ?? 0) + 0.5) * P, R2 = P * 2.8, gr = g.createRadialGradient(x, y, 0, x, y, R2); gr.addColorStop(0, 'rgba(255, 178, 96, .16)'); gr.addColorStop(1, 'rgba(255, 178, 96, 0)'); g.fillStyle = gr; g.fillRect(x - R2, y - R2, R2 * 2, R2 * 2); }
    g.restore();
    this.path = floorPath(f, W, H, CELL);
    this.stats.ms = +(performance.now() - t0).toFixed(1);
    return c;
  }
}
/** the floor's outline in metres: marching squares on the field at FLOOR_ISO, each cell's inside polygon one subpath of
 *  one Path2D (filled or clipped nonzero, they make the floor's shape with its edge interpolated) */
function floorPath(f, W, H, CELL) {
  const p = new Path2D(), iso = FLOOR_ISO, cx = x => (x + 0.5) * CELL; // (the field's samples sit at cell centres)
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const v = [f[y * W + x], f[y * W + x + 1], f[(y + 1) * W + x + 1], f[(y + 1) * W + x]], pts = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
    if (v.every(a => a <= iso)) continue;
    let first = true;
    for (let e = 0; e < 4; e++) {
      const a = v[e], b = v[(e + 1) % 4], A = pts[e], B = pts[(e + 1) % 4];
      if (a > iso) { if (first) { p.moveTo(cx(A[0]), cx(A[1])); first = false; } else p.lineTo(cx(A[0]), cx(A[1])); }
      if ((a > iso) !== (b > iso)) { const t = (iso - a) / (b - a), X = cx(A[0] + (B[0] - A[0]) * t), Y = cx(A[1] + (B[1] - A[1]) * t); if (first) { p.moveTo(X, Y); first = false; } else p.lineTo(X, Y); }
    }
    p.closePath();
  }
  return p;
}
let TILE = null;
/** the flagstones: a 2 m tile at 64 pixels a metre (three rows of stones, offset, each its own faint tone, the mortar
 *  between and a lit top edge), transparent so the floor's own tone shows through */
export function floorTile() {
  if (TILE) return TILE;
  const PX = 64, M = 2, S = PX * M, c = canvas(S), g = c.getContext('2d');
  const rows = [[0.62, 0.78, 0.6], [0.5, 0.85, 0.65], [0.7, 0.55, 0.75]]; // stone widths (m) per row: each row sums to 2 m
  let y = 0; const rh = M / rows.length;
  rows.forEach((ws, ri) => {
    let x = ri * 0.31; // (each row offset)
    const sum = ws.reduce((a, b) => a + b, 0);
    for (let si = 0; si < ws.length; si++) {
      const w = ws[si] * (M / sum), h = hashN(ri * 7 + si, 3);
      for (const ox of [-M, 0, M]) { // (drawn wrapped so the tile repeats seamlessly)
        const X = (x + ox) * PX, Y = y * PX, Wd = w * PX, Hd = rh * PX, inset = 0.035 * PX, r = 0.09 * PX;
        if (X + Wd < -2 || X > S + 2) continue;
        g.beginPath(); g.roundRect(X + inset, Y + inset, Wd - inset * 2, Hd - inset * 2, r);
        g.fillStyle = h < 0.5 ? `rgba(255, 248, 236, ${(0.05 + h * 0.14).toFixed(3)})` : `rgba(70, 48, 36, ${(0.03 + (h - 0.5) * 0.12).toFixed(3)})`; g.fill();
        g.lineWidth = 0.03 * PX; g.strokeStyle = 'rgba(64, 44, 34, .26)'; g.stroke();
        g.beginPath(); g.moveTo(X + inset + r, Y + inset + 1.5); g.lineTo(X + Wd - inset - r, Y + inset + 1.5); g.lineWidth = 0.02 * PX; g.strokeStyle = 'rgba(255, 252, 244, .2)'; g.stroke();
      }
      x += w;
    }
    y += rh;
  });
  TILE = c; return c;
}

// ------------------------------------------------------------------ icons drawn by hand (no glyph for them)
const DRAWN = {
  /** stairs going down: three steps */
  stairs(g, c, s) {
    g.save(); g.translate(c, c); g.lineJoin = 'round'; g.beginPath();
    g.moveTo(-s, s * 0.8); g.lineTo(-s, s * 0.25); g.lineTo(-s * 0.35, s * 0.25); g.lineTo(-s * 0.35, -s * 0.3); g.lineTo(s * 0.3, -s * 0.3); g.lineTo(s * 0.3, -s * 0.85); g.lineTo(s, -s * 0.85); g.lineTo(s, s * 0.8); g.closePath();
    g.fillStyle = '#8fd0ff'; g.fill(); g.lineWidth = s * 0.28; g.strokeStyle = INK; g.stroke(); g.restore();
  },
  /** a wild area: the violet claw (three white slashes) */
  claw(g, c, s) { g.save(); g.beginPath(); g.arc(c, c, s * 1.15, 0, Math.PI * 2); g.fillStyle = '#8a56d8'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = s * 0.26; g.lineCap = 'round';
    for (const d of [-0.45, 0, 0.45]) { g.beginPath(); g.moveTo(c + (d - 0.35) * s, c - 0.6 * s); g.lineTo(c + (d + 0.28) * s, c + 0.6 * s); g.stroke(); } g.restore(); },
  /** the portal home: a violet ring */
  portal(g, c, s) { g.save(); g.beginPath(); g.ellipse(c, c, s * 0.8, s, 0, 0, Math.PI * 2); g.lineWidth = s * 0.42; g.strokeStyle = INK; g.stroke(); g.lineWidth = s * 0.26; g.strokeStyle = '#b48aff'; g.stroke(); g.fillStyle = 'rgba(200, 170, 255, .55)'; g.fill(); g.restore(); },
};
