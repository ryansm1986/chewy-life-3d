// Minimap providers for the HUD (village: painted island map; dungeon: fog-of-war explored cells).
import { T, WORLD } from './terrain.js';
import { CELL } from '../dungeon/gen.js';
import { BUILDINGS } from './buildings/index.js';

// canvas rotation that puts the camera's forward direction at the top of the map
const mapRot = yaw => -Math.PI / 2 - Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
const TILE_COL = { [T.GRASS]: '#8fd070', [T.PATH]: '#f0dcc0', [T.PLAZA]: '#fff0dc', [T.FIELD]: '#b08058', [T.SAND]: '#f6e2b0', [T.ROCK]: '#b8aec0', [T.WATER]: '#6ac8e8' };
const CAT_COL = { home: '#ff9ab0', shop: '#8fc8ff', craft: '#ffc870', service: '#b8a0ff', decor: '#a8e090', special: '#ff7a5a' };

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
    const dot = (x, z, r, fill, stroke = '#4a2c2a') => { ctx.beginPath(); ctx.arc((x - cx) * k, (z - cz) * k, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = stroke; ctx.stroke(); };
    for (const n of G.npcs || []) if (n.visible) dot(n.pos.x, n.pos.z, n.id === 'rosie' ? 4 : 2.6, n.id === 'rosie' ? '#ff6a9a' : '#fff6e8');
    const L = G.village.world.landmarks;
    dot(L.dungeon.x, L.dungeon.z, 5, '#b89aff');
    // quest-giver sparkle
    const q = G.state.quests.active?.[0];
    const giver = q && G.npcs?.find(n => n.id === (G.story?.def(q.id)?.giver));
    if (giver) { const t = (o.time || 0) * 4; dot(giver.pos.x, giver.pos.z, 5 + Math.sin(t), '#ffd84a'); }
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
    ctx.save(); ctx.translate((p.x - cx) * k, (p.z - cz) * k); ctx.rotate(Math.atan2(Math.cos(G.player.facing), Math.sin(G.player.facing)) + Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5); ctx.closePath();
    ctx.fillStyle = '#ff8a3a'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    ctx.restore();
  }
}
