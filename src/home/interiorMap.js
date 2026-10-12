// The minimap indoors (docs/HOUSING.md §1; the maps: docs/MAP.md, ROADMAP UX-1): the room drawn as a little painted floor
// plan (InteriorArt: the floor in its own surface, honey planks, walnut, tatami, checker tiles or river stones; the rugs;
// every piece of furniture as a soft rounded shape in its kind's colour with a shadow and a lit top, the bed with its
// pillow, the stove's fire, the chest's gold band; the back walls thick in the wallpaper's colour, the cut-down front
// walls thin), redrawn only when the room or its furniture change. The shared renderer (world/minimap.js ArtMap) puts
// the marks over it: the bed, the stash, the kitchen, the workbench and the door as badges, the guests as pips, Shadow
// and you.
import { FURNITURE, footprint } from './furniture.js';
import { CELL, isBack } from './rooms.js';
import { ORIGIN } from './interiorWorld.js';
import { ArtMap, MM_SPANS } from '../world/minimap.js';
import { people, herePlaces, areaKey } from '../world/mapData.js';
import { INK, shadeHex } from '../world/mapArt.js';

const CAT = { seating: '#ffb0c8', table: '#e2b988', bed: '#ffc8a8', storage: '#c98f5e', kitchen: '#f0a080', decor: '#8fe0c0', light: '#ffe08a', rug: '#ffbcd6', tabletop: '#ffcf4a' };
const FLOOR = { fl_planks: ['#e9c48e', '#d8ae76'], fl_walnut: ['#a8774f', '#93653f'], fl_tatami: ['#d9d59c', '#c8c286'], fl_checker: ['#ffd6e0', '#fff4ea'], fl_stone: ['#c8c2bc', '#b0a8a2'] };
const WALL = { wp_plaster: '#fff1dc', wp_stripes: '#ffc6d6', wp_dots: '#bfeedd', wp_sakura: '#ffe0ea', wp_asanoha: '#d8ecc8', wp_wood: '#c9925e', wp_waves: '#a8d4f0', wp_maple: '#ffd2b0' };

class InteriorArt {
  constructor(G, H, K = 40) { this.G = G; this.H = H; this.K = K; this.base = null; this.sig = ''; this.stats = { ms: 0 }; }
  /** what the drawing depends on (the room, its surfaces, every piece's spot) */
  signature() { const W = this.H.world; return W?.S ? `${W.S.W}x${W.S.D}|${W.floorId}|${W.wallId}|${W.items.map(it => `${it.id}${it.x},${it.z},${it.rot || 0}`).join(';')}` : ''; }
  build() {
    const t0 = performance.now(), W = this.H.world, S = W.S, K = this.K, Wm = S.W * CELL, Dm = S.D * CELL, pad = 0.6;
    const c = this.base || (this.base = document.createElement('canvas')); c.width = Math.ceil((Wm + pad * 2) * K); c.height = Math.ceil((Dm + pad * 2) * K);
    const g = c.getContext('2d'), X = x => (x + pad) * K;
    g.fillStyle = '#3a2c40'; g.fillRect(0, 0, c.width, c.height);
    // the floor, in its surface's own pattern
    const fl = FLOOR[W.floorId] || FLOOR.fl_planks;
    for (const r of W.layout.rooms) {
      const x0 = X(r.x * CELL), z0 = X(r.z * CELL), w = r.w * CELL * K, d = r.d * CELL * K;
      g.fillStyle = fl[0]; g.fillRect(x0, z0, w, d);
      g.save(); g.beginPath(); g.rect(x0, z0, w, d); g.clip();
      if (W.floorId === 'fl_checker') { g.fillStyle = fl[1]; for (let z = 0; z < d; z += K * 0.5) for (let x = (Math.round(z / (K * 0.5)) % 2) * K * 0.5; x < w; x += K) g.fillRect(x0 + x, z0 + z, K * 0.5, K * 0.5); }
      else if (W.floorId === 'fl_tatami') { g.strokeStyle = fl[1]; g.lineWidth = 2; for (let z = 0; z < d; z += K * 0.9) for (let x = 0; x < w; x += K * 1.8) { g.strokeRect(x0 + x + ((z / (K * 0.9)) % 2 ? K * 0.9 : 0), z0 + z, K * 1.8, K * 0.9); } }
      else if (W.floorId === 'fl_stone') { for (let n = 0; n < (w * d) / (K * K) * 9; n++) { g.fillStyle = n % 2 ? fl[1] : shadeHex(fl[0], 0.08); g.beginPath(); g.ellipse(x0 + ((n * 37.1) % w), z0 + ((n * 59.3) % d), K * 0.12, K * 0.09, n, 0, Math.PI * 2); g.fill(); } }
      else { g.strokeStyle = fl[1]; g.lineWidth = 1.5; for (let x = K * 0.25; x < w; x += K * 0.25) { g.beginPath(); g.moveTo(x0 + x, z0); g.lineTo(x0 + x, z0 + d); g.stroke(); } for (let x = 0, i = 0; x < w; x += K * 0.25, i++) for (let z = ((i * 0.37) % 1) * K * 1.2; z < d; z += K * 1.2) { g.beginPath(); g.moveTo(x0 + x, z0 + z); g.lineTo(x0 + x + K * 0.25, z0 + z); g.stroke(); } }
      g.restore();
    }
    // rugs, then furniture on the floor: a soft shadow, the body, a lit top; a few with their tell-tale details
    for (const pass of ['rug', 'floor']) for (const it of W.items) {
      if ((pass === 'rug') !== (it.mount === 'rug') || (it.mount !== 'rug' && it.mount !== 'floor')) continue;
      const d = FURNITURE[it.id]; if (!d) continue;
      const [fw, fd] = footprint(d, it.rot || 0), x = X(it.x * CELL), z = X(it.z * CELL), w = fw * CELL * K, h = fd * CELL * K, col = CAT[d.cat] || '#fff6e8';
      if (pass === 'rug') { g.fillStyle = col; g.globalAlpha = 0.7; g.beginPath(); g.roundRect(x + 3, z + 3, w - 6, h - 6, K * 0.25); g.fill(); g.globalAlpha = 1; g.setLineDash([4, 4]); g.lineWidth = 2; g.strokeStyle = shadeHex(col, -0.18); g.stroke(); g.setLineDash([]); continue; }
      g.fillStyle = 'rgba(40, 24, 34, .28)'; g.beginPath(); g.roundRect(x + 5, z + 7, w - 6, h - 6, K * 0.18); g.fill();
      g.fillStyle = shadeHex(col, -0.08); g.beginPath(); g.roundRect(x + 2, z + 2, w - 4, h - 4, K * 0.18); g.fill();
      g.fillStyle = shadeHex(col, 0.16); g.beginPath(); g.roundRect(x + 5, z + 4, w - 10, (h - 8) * 0.55, K * 0.14); g.fill();
      g.lineWidth = 2; g.strokeStyle = 'rgba(74, 44, 42, .7)'; g.beginPath(); g.roundRect(x + 2, z + 2, w - 4, h - 4, K * 0.18); g.stroke();
      if (d.use === 'sleep' || d.cat === 'bed') { g.fillStyle = '#fffaf2'; g.beginPath(); g.ellipse(x + w * 0.5, z + h * 0.22, w * 0.3, h * 0.12, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(74,44,42,.4)'; g.lineWidth = 1.5; g.stroke(); }
      if (d.use === 'cook') { g.fillStyle = '#ff8a3a'; g.beginPath(); g.arc(x + w / 2, z + h / 2, Math.min(w, h) * 0.18, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(x + w / 2, z + h / 2, Math.min(w, h) * 0.09, 0, Math.PI * 2); g.fill(); }
      if (d.use === 'stash') { g.fillStyle = '#f4c04a'; g.fillRect(x + 4, z + h / 2 - 3, w - 8, 6); }
    }
    // the walls: the back ones thick in the wallpaper's colour on a wood base, the cut-down front ones thin; partitions
    const wc = WALL[W.wallId] || WALL.wp_plaster;
    g.lineCap = 'round';
    for (const run of S.walls) {
      const back = isBack(run), a = [X(run.x0 * CELL), X(run.z0 * CELL)], b = [X(run.x1 * CELL), X(run.z1 * CELL)];
      g.lineWidth = back ? K * 0.32 : K * 0.13; g.strokeStyle = back ? '#6b4a3a' : '#a07858'; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
      if (back) { g.lineWidth = K * 0.16; g.strokeStyle = wc; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
    }
    for (const run of S.partitions) { g.lineWidth = K * 0.11; g.strokeStyle = '#7a5a4a'; g.beginPath(); g.moveTo(X(run.x0 * CELL), X(run.z0 * CELL)); g.lineTo(X(run.x1 * CELL), X(run.z1 * CELL)); g.stroke(); }
    // the door mat
    if (W.doorMatPos) { g.fillStyle = '#ff9ab8'; g.beginPath(); g.roundRect(X(W.doorMatPos.x - ORIGIN) - K * 0.4, X(W.doorMatPos.z - ORIGIN) - K * 0.28, K * 0.8, K * 0.56, K * 0.14); g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke(); }
    this.pad = pad; this.sig = this.signature();
    this.stats.ms = +(performance.now() - t0).toFixed(1);
    return c;
  }
}

export class InteriorMinimap extends ArtMap {
  constructor(G, housing) { super(G); this.H = housing; this.art = new InteriorArt(G, housing); this.bg = '#3a2c40'; this.nameZoom = 0.4; }
  get ox() { return ORIGIN - (this.art.pad ?? 0.6); }
  get oz() { return ORIGIN - (this.art.pad ?? 0.6); }
  rebuild() { if (!this.H.world?.S) return; this.art.build(); this.dirty = false; }
  drawMap(ctx, size, view, o = {}) {
    if (!this.H.world?.S) return;
    if (this.art.sig !== this.art.signature()) this.dirty = true; // (the furniture moved: decorate mode)
    return super.drawMap(ctx, size, view, o);
  }
  room() { const S = this.H.world.S; return { w: S.W * CELL, d: S.D * CELL }; }
  areaName() { return 'In this room'; }
  bounds() { const r = this.room(); return { x0: ORIGIN, z0: ORIGIN, x1: ORIGIN + r.w, z1: ORIGIN + r.d }; }
  homeView() { const r = this.room(); return { cx: ORIGIN + r.w / 2, cz: ORIGIN + r.d / 2, span: Math.max(r.w, r.d) * 1.35 }; }
  spanMini() { const r = this.room(); return Math.max(9, Math.max(r.w, r.d) * 1.25) * [0.7, 1, 1.5][this.G.ui?.settings?.mmZoom ?? 1]; }
  makeLists() {
    const G = this.G, here = areaKey(G), hosts = new Set(this.H.hosts || []);
    // the guests are in the room: their village entries, here (the rest stay in Blossom Hollow's list)
    const ppl = people(G).map(e => (e.npc && hosts.has(e.npc) ? { ...e, area: here, visible: true, pos: e.npc.pos, role: `${e.role} · visiting` } : e));
    return { people: ppl, places: herePlaces(G, null) };
  }
}
export { MM_SPANS };
