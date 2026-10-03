// Minimap providers for the HUD (village: painted island map; dungeon: fog-of-war explored cells).
import { T, WORLD } from './terrain.js';
import { CELL } from '../dungeon/gen.js';
import { BUILDINGS } from './buildings/index.js';
import { PATHS } from './layout.js';
import { DISTRICTS } from './plots.js';

// canvas rotation that puts the camera's forward direction at the top of the map
const mapRot = yaw => -Math.PI / 2 - Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
const TILE_COL = { [T.GRASS]: '#8fd070', [T.PATH]: '#f0dcc0', [T.PLAZA]: '#fff0dc', [T.FIELD]: '#b08058', [T.SAND]: '#f6e2b0', [T.ROCK]: '#b8aec0', [T.WATER]: '#6ac8e8' };
const RGB = {};
const CAT_COL = { home: '#ff9ab0', shop: '#8fc8ff', craft: '#ffc870', service: '#b8a0ff', decor: '#a8e090', special: '#ff7a5a' };

// current quest objective (G.questTarget) as a pulsing gold pin; on the small disc it sticks to the rim when out of range
function questPin(ctx, G, cx, cz, k, t, rimR) {
  let tgt = null;
  try { tgt = typeof G.questTarget === 'function' ? G.questTarget() : null; } catch (e) { tgt = null; }
  if (!tgt?.pos || (G.mode === 'dungeon' && tgt.kind === 'npc')) return false;
  let x = (tgt.pos.x - cx) * k, y = (tgt.pos.z - cz) * k;
  const d = Math.hypot(x, y), out = rimR && d > rimR;
  if (out) { x *= rimR / d; y *= rimR / d; }
  const pulse = 1 + Math.sin(t * 5) * 0.14;
  ctx.save(); ctx.translate(x, y);
  ctx.lineJoin = 'round'; ctx.strokeStyle = '#4a2c2a'; ctx.lineWidth = 1.8; ctx.fillStyle = '#ffd84a';
  if (out) { ctx.rotate(Math.atan2(y, x)); ctx.beginPath(); ctx.moveTo(6.5 * pulse, 0); ctx.lineTo(-4, -5.5); ctx.lineTo(-1.5, 0); ctx.lineTo(-4, 5.5); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  else {
    ctx.beginPath(); ctx.arc(0, 0, 9 * pulse, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255, 216, 74, .28)'; ctx.fill();
    ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = (i % 2 ? 2.6 : 6) * pulse; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath();
    ctx.fillStyle = '#ffd84a'; ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  return true;
}

export class VillageMinimap {
  constructor(G) { this.G = G; this.base = null; this.dirty = true; this.scale = 2; }
  rebuild() {
    const G = this.G, tr = G.village.world.terrain, S = WORLD * this.scale;
    const c = this.base || (this.base = document.createElement('canvas')); c.width = c.height = S;
    const g = c.getContext('2d');
    // the ground: one pixel per tile written into an ImageData (a fillRect per tile is slow on the 224 m island),
    // scaled up without smoothing
    const gc = this.ground || (this.ground = document.createElement('canvas')); gc.width = gc.height = WORLD;
    const gg = gc.getContext('2d'), img = gg.createImageData(WORLD, WORLD), D = img.data;
    for (let z = 0; z < WORLD; z++) for (let x = 0; x < WORLD; x++) {
      const h = tr.heightAt(x + 0.5, z + 0.5);
      let col = h < 0.02 ? (h < -1 ? '#4aa8d8' : '#6ac8e8') : TILE_COL[tr.tile(x, z)] || '#8fd070';
      if (h > 2.5 && col === '#8fd070') col = h > 5 ? '#6aa860' : '#7abc68';
      const rgb = RGB[col] || (RGB[col] = [parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16)]);
      const k = (z * WORLD + x) * 4; D[k] = rgb[0]; D[k + 1] = rgb[1]; D[k + 2] = rgb[2]; D[k + 3] = 255;
    }
    gg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false; g.drawImage(gc, 0, 0, S, S); g.imageSmoothingEnabled = true;
    for (const b of G.state.village.buildings || []) {
      const [w, d] = G.sim.dims(b.type, b.rot, b.level);
      g.fillStyle = CAT_COL[BUILDINGS[b.type]?.cat] || '#ffffff';
      g.strokeStyle = '#4a2c2a'; g.lineWidth = 1;
      g.beginPath(); g.roundRect(b.x * this.scale + 0.5, b.z * this.scale + 0.5, w * this.scale - 1, d * this.scale - 1, 2); g.fill(); g.stroke();
    }
    // night version: navy wash over the land, water a deep teal, every building a warm lit window
    const n = this.night || (this.night = document.createElement('canvas')); n.width = n.height = S;
    const ng = n.getContext('2d');
    ng.drawImage(c, 0, 0);
    ng.globalCompositeOperation = 'multiply'; ng.fillStyle = '#6c78c0'; ng.fillRect(0, 0, S, S);
    ng.globalCompositeOperation = 'source-over'; ng.fillStyle = 'rgba(30, 34, 84, .26)'; ng.fillRect(0, 0, S, S);
    for (const b of G.state.village.buildings || []) {
      const [w, d] = G.sim.dims(b.type, b.rot, b.level), cat = BUILDINGS[b.type]?.cat;
      ng.fillStyle = cat === 'decor' ? '#e8d890' : '#ffe6a0'; ng.strokeStyle = '#2a2248'; ng.lineWidth = 1;
      ng.beginPath(); ng.roundRect(b.x * this.scale + 0.5, b.z * this.scale + 0.5, w * this.scale - 1, d * this.scale - 1, 2); ng.fill(); ng.stroke();
    }
    this.dirty = false;
  }
  // o.big: the Map panel (the whole island at zoom 1; the wheel zooms in toward Chewy, never past the coast)
  draw(ctx, size, pp, o = {}) {
    if (this.dirty || !this.base) this.rebuild();
    const G = this.G, p = G.player.pos, zoom = o.big ? Math.max(0.5, o.zoom || 1) : 1, span = o.big ? WORLD / zoom : 40, k = size / span;
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    // rotate so the map matches the camera (camera yaw 45°: screen-up = world -x-z)
    ctx.translate(size / 2, size / 2);
    const rot = mapRot(G.engine.rig.yaw);
    ctx.rotate(rot);
    let cx = p.x, cz = p.z;
    if (o.big) { // centre: the island's at zoom <= 1, sliding toward Chewy as it zooms in (kept inside the map)
      const t = Math.min(1, Math.max(0, (zoom - 1) / 1.5)), half = span / 2;
      cx = WORLD / 2 + (p.x - WORLD / 2) * t; cz = WORLD / 2 + (p.z - WORLD / 2) * t;
      if (zoom > 1) { cx = Math.min(WORLD - half, Math.max(half, cx)); cz = Math.min(WORLD - half, Math.max(half, cz)); }
    }
    ctx.drawImage(this.base, (-cx) * k, (-cz) * k, WORLD * k, WORLD * k);
    const night = Math.max(0, Math.min(1, G.day?.out?.night ?? 0));
    if (night > 0.02 && this.night) { ctx.globalAlpha = night; ctx.drawImage(this.night, (-cx) * k, (-cz) * k, WORLD * k, WORLD * k); ctx.globalAlpha = 1; }
    const dot = (x, z, r, fill, stroke = '#4a2c2a') => { ctx.beginPath(); ctx.arc((x - cx) * k, (z - cz) * k, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = stroke; ctx.stroke(); };
    for (const n of G.npcs || []) if (n.visible) dot(n.pos.x, n.pos.z, n.id === 'rosie' ? 4 : 2.6, n.id === 'rosie' ? '#ff6a9a' : '#fff6e8', night > 0.5 ? '#1e1830' : '#4a2c2a');
    const L = G.village.world.landmarks;
    dot(L.dungeon.x, L.dungeon.z, 5, '#b89aff');
    // the big map: the expansion rings' stub streets (dashed until their rank opens them) and the district names
    const ring = G.sim?.ringRank?.() || 1;
    if (o.big) {
      ctx.save(); ctx.setLineDash([4, 4]); ctx.lineCap = 'round';
      for (const P of PATHS) {
        if (P.rank <= ring) continue;
        ctx.strokeStyle = 'rgba(120, 110, 130, .75)'; ctx.lineWidth = Math.max(1.5, P.w * k);
        ctx.beginPath(); P.pts.forEach(([x, z], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (x - cx) * k, (z - cz) * k)); ctx.stroke();
      }
      ctx.restore();
    }
    // quest objective pin (falls back to a sparkle on the quest giver)
    if (!questPin(ctx, G, cx, cz, k, o.time ?? performance.now() / 1000, o.big ? 0 : size / 2 - 22)) {
      const q = G.state.quests.active?.[0];
      const giver = q && G.npcs?.find(n => n.id === (G.story?.def(q.id)?.giver));
      if (giver) { const t = (o.time || 0) * 4; dot(giver.pos.x, giver.pos.z, 5 + Math.sin(t), '#ffd84a'); }
    }
    // player arrow
    ctx.save(); ctx.translate((p.x - cx) * k, (p.z - cz) * k); ctx.rotate(Math.atan2(Math.cos(G.player.facing), Math.sin(G.player.facing)) + Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5); ctx.closePath();
    ctx.fillStyle = '#ff8a3a'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    ctx.restore();
    if (o.big) this.labels(ctx, size, rot, cx, cz, k, zoom, ring);
  }
  // district names, upright (drawn after the rotated map, placed through the same rotation); a ring not yet opened says
  // which rank opens it
  labels(ctx, size, rot, cx, cz, k, zoom, ring) {
    const c = Math.cos(rot), s = Math.sin(rot);
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const fs = Math.round(Math.min(17, 11 + zoom * 2.2));
    for (const D of Object.values(DISTRICTS)) {
      if (!D.label) continue;
      const dx = (D.label[0] - cx) * k, dz = (D.label[1] - cz) * k;
      const x = size / 2 + dx * c - dz * s, y = size / 2 + dx * s + dz * c;
      if (x < -40 || y < -20 || x > size + 40 || y > size + 20) continue;
      const locked = D.ring && D.ring > ring;
      ctx.font = `800 ${fs}px Fredoka, "M PLUS Rounded 1c", system-ui, sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255, 250, 240, .9)'; ctx.fillStyle = locked ? '#7a7088' : '#5a3440';
      ctx.strokeText(D.name, x, y); ctx.fillText(D.name, x, y);
      if (locked) { ctx.font = `700 ${fs - 3}px Fredoka, "M PLUS Rounded 1c", system-ui, sans-serif`; ctx.strokeText(`opens at rank ${D.ring}`, x, y + fs); ctx.fillText(`opens at rank ${D.ring}`, x, y + fs); }
    }
    ctx.restore();
  }
}

export class DungeonMinimap {
  constructor(G, mode) {
    this.G = G; this.mode = mode; const L = mode.layout;
    this.seen = new Uint8Array(L.W * L.H);
    this.c = document.createElement('canvas'); this.c.width = L.W * 4; this.c.height = L.H * 4;
    this.g = this.c.getContext('2d');
    this.lastCell = -1;
    this.box = [1e9, 1e9, -1e9, -1e9]; // explored cells' bounds (x0, y0, x1, y1) so the big map can fit what has been seen
  }
  reveal() {
    const L = this.mode.layout, p = this.G.player.pos, cx = Math.floor(p.x / CELL), cy = Math.floor(p.z / CELL), R = 7;
    const key = cy * L.W + cx; if (key === this.lastCell) return; this.lastCell = key;
    const g = this.g;
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (x < 0 || y < 0 || x >= L.W || y >= L.H || (x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
      const i = y * L.W + x; if (this.seen[i]) continue; this.seen[i] = 1;
      const b = this.box; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
      if (L.at(x, y)) { g.fillStyle = '#f4e4d0'; g.fillRect(x * 4, y * 4, 4, 4); }
      else if (L.at(x + 1, y) || L.at(x - 1, y) || L.at(x, y + 1) || L.at(x, y - 1)) { g.fillStyle = '#8a6a8a'; g.fillRect(x * 4, y * 4, 4, 4); }
    }
  }
  draw(ctx, size, pp, o = {}) {
    this.reveal();
    const G = this.G, L = this.mode.layout, p = G.player.pos, b = this.box;
    // big map: fit the explored area (plus a margin, at least ~40 m) instead of the whole, mostly unknown floor; wheel zooms
    const fit = o.big && b[2] >= b[0];
    const span = fit ? Math.max(40, (Math.max(b[2] - b[0], b[3] - b[1]) + 6) * CELL) / (o.zoom || 1) : o.big ? L.W * CELL : 44, k = size / span;
    ctx.save(); ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = this.bg || '#2a2038'; ctx.fillRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2); ctx.rotate(mapRot(G.engine.rig.yaw));
    const cx = fit ? (b[0] + b[2] + 1) / 2 * CELL : o.big ? L.W * CELL / 2 : p.x, cz = fit ? (b[1] + b[3] + 1) / 2 * CELL : o.big ? L.H * CELL / 2 : p.z;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.c, -cx * k, -cz * k, L.W * CELL * k, L.H * CELL * k);
    const dot = (x, z, r, fill) => { ctx.beginPath(); ctx.arc((x - cx) * k, (z - cz) * k, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = '#2a1a24'; ctx.lineWidth = 1.2; ctx.stroke(); };
    const seen = (x, z) => this.seen[Math.floor(z / CELL) * L.W + Math.floor(x / CELL)];
    for (const m of this.mode.monsters) if (m.alive && seen(m.pos.x, m.pos.z) && m.pos.distanceTo(p) < 16) dot(m.pos.x, m.pos.z, m.rank === 'boss' ? 5 : m.rank !== 'normal' ? 3.5 : 2.4, m.rank === 'boss' ? '#ff3a6a' : m.rank === 'unique' ? '#ffb030' : m.rank === 'champion' ? '#6aa8ff' : '#ff7a7a');
    if (this.mode.stairsPos && seen(this.mode.stairsPos.x, this.mode.stairsPos.z)) dot(this.mode.stairsPos.x, this.mode.stairsPos.z, 5, '#8fd0ff');
    if (this.mode.startPos) dot(this.mode.startPos.x - 1.6, this.mode.startPos.z - 1.6, 4.5, '#b89aff');
    this.extra?.(ctx, dot, seen, cx, cz, k, o);
    questPin(ctx, G, cx, cz, k, o.time ?? performance.now() / 1000, o.big ? 0 : size / 2 - 22);
    // waypoint (diamond) once its room has been seen
    const wp = L.waypoint;
    if (wp && this.seen[wp.y * L.W + wp.x]) {
      const wx = (wp.x + 0.5) * CELL, wz = (wp.y + 0.5) * CELL, r = o.big ? 6 : 4.5;
      ctx.save(); ctx.translate((wx - cx) * k, (wz - cz) * k); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#7ce8c8'; ctx.strokeStyle = '#2a1a24'; ctx.lineWidth = 1.2; ctx.fillRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5); ctx.strokeRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5); ctx.restore();
    }
    ctx.save(); ctx.translate((p.x - cx) * k, (p.z - cz) * k); ctx.rotate(Math.atan2(Math.cos(G.player.facing), Math.sin(G.player.facing)) + Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5); ctx.closePath();
    ctx.fillStyle = '#ff8a3a'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    ctx.restore();
  }
}

// Outdoor regions (docs/REGIONS.md): the land in its own colours (world.mapColor), a wider view (you can see farther
// outside than in a burrow), the trail and — once seen — the boss arena.
export class RegionMinimap extends DungeonMinimap {
  constructor(G, mode) { super(G, mode); this.bg = mode.region?.mood?.fog?.color || '#3a4a3a'; this.R = 10; }
  reveal() {
    const L = this.mode.layout, W = this.mode.world, p = this.G.player.pos, cx = Math.floor(p.x / CELL), cy = Math.floor(p.z / CELL), R = this.R;
    const key = cy * L.W + cx; if (key === this.lastCell) return; this.lastCell = key;
    const g = this.g;
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (x < 0 || y < 0 || x >= L.W || y >= L.H || (x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
      const i = y * L.W + x; if (this.seen[i]) continue; this.seen[i] = 1;
      const b = this.box; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
      const wx = (x + 0.5) * CELL, wz = (y + 0.5) * CELL;
      g.fillStyle = W.mapColor?.(wx, wz) || this.mode.region?.color || '#8ac070'; g.fillRect(x * 4, y * 4, 4, 4);
      if (!L.at(x, y)) { g.fillStyle = 'rgba(20,16,30,.38)'; g.fillRect(x * 4, y * 4, 4, 4); } // not walkable: shaded
    }
  }
  extra(ctx, dot, seen, cx, cz, k, o) {
    const A = this.mode.layout.arena; if (!A || !seen(A.x, A.z)) return;
    ctx.save(); ctx.strokeStyle = 'rgba(255,74,106,.8)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc((A.x - cx) * k, (A.z - cz) * k, A.r * k, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
}
