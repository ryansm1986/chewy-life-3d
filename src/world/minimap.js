// Minimap providers for the HUD (village: painted island map; dungeon: fog-of-war explored cells).
import { T, WORLD } from './terrain.js';
import { CELL } from '../dungeon/gen.js';
import { BUILDINGS } from './buildings/index.js';

// canvas rotation that puts the camera's forward direction at the top of the map
const mapRot = yaw => -Math.PI / 2 - Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
const TILE_COL = { [T.GRASS]: '#8fd070', [T.PATH]: '#f0dcc0', [T.PLAZA]: '#fff0dc', [T.FIELD]: '#b08058', [T.SAND]: '#f6e2b0', [T.ROCK]: '#b8aec0', [T.WATER]: '#6ac8e8' };
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
    for (let z = 0; z < WORLD; z++) for (let x = 0; x < WORLD; x++) {
      const h = tr.heightAt(x + 0.5, z + 0.5);
      let col = h < 0.02 ? (h < -1 ? '#4aa8d8' : '#6ac8e8') : TILE_COL[tr.tile(x, z)] || '#8fd070';
      if (h > 2.5 && col === '#8fd070') col = h > 5 ? '#6aa860' : '#7abc68';
      g.fillStyle = col; g.fillRect(x * this.scale, z * this.scale, this.scale, this.scale);
    }
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
  draw(ctx, size, pp, o = {}) {
    if (this.dirty || !this.base) this.rebuild();
    const G = this.G, p = G.player.pos, span = o.big ? WORLD : 40, k = size / span;
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    // rotate so the map matches the camera (camera yaw 45°: screen-up = world -x-z)
    ctx.translate(size / 2, size / 2);
    ctx.rotate(mapRot(G.engine.rig.yaw));
    const cx = o.big ? WORLD / 2 : p.x, cz = o.big ? WORLD / 2 : p.z;
    ctx.drawImage(this.base, (-cx) * k, (-cz) * k, WORLD * k, WORLD * k);
    const night = Math.max(0, Math.min(1, G.day?.out?.night ?? 0));
    if (night > 0.02 && this.night) { ctx.globalAlpha = night; ctx.drawImage(this.night, (-cx) * k, (-cz) * k, WORLD * k, WORLD * k); ctx.globalAlpha = 1; }
    const dot = (x, z, r, fill, stroke = '#4a2c2a') => { ctx.beginPath(); ctx.arc((x - cx) * k, (z - cz) * k, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = stroke; ctx.stroke(); };
    for (const n of G.npcs || []) if (n.visible) dot(n.pos.x, n.pos.z, n.id === 'rosie' ? 4 : 2.6, n.id === 'rosie' ? '#ff6a9a' : '#fff6e8', night > 0.5 ? '#1e1830' : '#4a2c2a');
    const L = G.village.world.landmarks;
    dot(L.dungeon.x, L.dungeon.z, 5, '#b89aff');
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
  }
}

export class DungeonMinimap {
  constructor(G, mode) {
    this.G = G; this.mode = mode; const L = mode.layout;
    this.seen = new Uint8Array(L.W * L.H);
    this.c = document.createElement('canvas'); this.c.width = L.W * 4; this.c.height = L.H * 4;
    this.g = this.c.getContext('2d');
    this.lastCell = -1;
  }
  reveal() {
    const L = this.mode.layout, p = this.G.player.pos, cx = Math.floor(p.x / CELL), cy = Math.floor(p.z / CELL), R = 7;
    const key = cy * L.W + cx; if (key === this.lastCell) return; this.lastCell = key;
    const g = this.g;
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (x < 0 || y < 0 || x >= L.W || y >= L.H || (x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
      const i = y * L.W + x; if (this.seen[i]) continue; this.seen[i] = 1;
      if (L.at(x, y)) { g.fillStyle = '#f4e4d0'; g.fillRect(x * 4, y * 4, 4, 4); }
      else if (L.at(x + 1, y) || L.at(x - 1, y) || L.at(x, y + 1) || L.at(x, y - 1)) { g.fillStyle = '#8a6a8a'; g.fillRect(x * 4, y * 4, 4, 4); }
    }
  }
  draw(ctx, size, pp, o = {}) {
    this.reveal();
    const G = this.G, L = this.mode.layout, p = G.player.pos, span = o.big ? L.W * CELL : 44, k = size / span;
    ctx.save(); ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#2a2038'; ctx.fillRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2); ctx.rotate(mapRot(G.engine.rig.yaw));
    const cx = o.big ? L.W * CELL / 2 : p.x, cz = o.big ? L.H * CELL / 2 : p.z;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.c, -cx * k, -cz * k, L.W * CELL * k, L.H * CELL * k);
    const dot = (x, z, r, fill) => { ctx.beginPath(); ctx.arc((x - cx) * k, (z - cz) * k, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = '#2a1a24'; ctx.lineWidth = 1.2; ctx.stroke(); };
    const seen = (x, z) => this.seen[Math.floor(z / CELL) * L.W + Math.floor(x / CELL)];
    for (const m of this.mode.monsters) if (m.alive && seen(m.pos.x, m.pos.z) && m.pos.distanceTo(p) < 16) dot(m.pos.x, m.pos.z, m.rank === 'boss' ? 5 : m.rank !== 'normal' ? 3.5 : 2.4, m.rank === 'boss' ? '#ff3a6a' : m.rank === 'unique' ? '#ffb030' : m.rank === 'champion' ? '#6aa8ff' : '#ff7a7a');
    if (this.mode.stairsPos && seen(this.mode.stairsPos.x, this.mode.stairsPos.z)) dot(this.mode.stairsPos.x, this.mode.stairsPos.z, 5, '#8fd0ff');
    if (this.mode.startPos) dot(this.mode.startPos.x - 1.6, this.mode.startPos.z - 1.6, 4.5, '#b89aff');
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
