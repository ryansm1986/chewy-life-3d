// The minimap indoors (docs/HOUSING.md §1): a little floor plan of the room — the floor in its own colour, the
// walls, furniture footprints, the door, the guests and the player — rotated to the camera like the village map.
import { FURNITURE, footprint } from './furniture.js';
import { CELL, isBack } from './rooms.js';
import { ORIGIN } from './interiorWorld.js';

const mapRot = yaw => -Math.PI / 2 - Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
const CAT = { seating: '#ffb0c8', table: '#e2b988', bed: '#ffc8a8', storage: '#c98f5e', kitchen: '#f0a080', decor: '#8fe0c0', light: '#ffe08a', rug: 'rgba(255,188,214,.55)', tabletop: '#ffcf4a' };

export class InteriorMinimap {
  constructor(G, housing) { this.G = G; this.H = housing; }
  draw(ctx, size, pp, o = {}) {
    const G = this.G, W = this.H.world, S = W?.S; if (!S) return;
    const p = G.player.pos, roomW = S.W * CELL, roomD = S.D * CELL;
    const span = o.big ? Math.max(roomW, roomD) * 1.5 / (o.zoom || 1) : Math.max(9, Math.max(roomW, roomD) * 1.25), k = size / span;
    const cx = o.big ? ORIGIN + roomW / 2 : p.x, cz = o.big ? ORIGIN + roomD / 2 : p.z;
    ctx.save(); ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#3a2c40'; ctx.fillRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2); ctx.rotate(mapRot(G.engine.rig.yaw));
    const X = x => (ORIGIN + x - cx) * k, Z = z => (ORIGIN + z - cz) * k;
    // floor
    ctx.fillStyle = '#f2d4a4'; ctx.strokeStyle = '#4a2c2a';
    for (const r of W.layout.rooms) ctx.fillRect(X(r.x * CELL), Z(r.z * CELL), r.w * CELL * k, r.d * CELL * k);
    // rugs, then furniture
    for (const pass of ['rug', 'floor']) for (const it of W.items) {
      if ((pass === 'rug') !== (it.mount === 'rug') || (it.mount !== 'rug' && it.mount !== 'floor')) continue;
      const d = FURNITURE[it.id], [w, dd] = footprint(d, it.rot || 0);
      ctx.fillStyle = CAT[d.cat] || '#fff6e8';
      ctx.beginPath(); ctx.roundRect(X(it.x * CELL) + 1, Z(it.z * CELL) + 1, w * CELL * k - 2, dd * CELL * k - 2, 3); ctx.fill();
      if (pass === 'floor') { ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(74,44,42,.55)'; ctx.stroke(); }
    }
    // walls (back walls thick, front walls thin), partitions
    ctx.lineCap = 'round';
    for (const run of S.walls) { ctx.lineWidth = isBack(run) ? 7 : 4.5; ctx.strokeStyle = isBack(run) ? '#6b4a3a' : '#a07858'; ctx.beginPath(); ctx.moveTo(X(run.x0 * CELL), Z(run.z0 * CELL)); ctx.lineTo(X(run.x1 * CELL), Z(run.z1 * CELL)); ctx.stroke(); }
    for (const run of S.partitions) { ctx.lineWidth = 2.5; ctx.strokeStyle = '#7a5a4a'; ctx.beginPath(); ctx.moveTo(X(run.x0 * CELL), Z(run.z0 * CELL)); ctx.lineTo(X(run.x1 * CELL), Z(run.z1 * CELL)); ctx.stroke(); }
    // the door: a pink arrow out
    if (W.doorMatPos) {
      const m = W.doorMatPos, o2 = W.doorOut;
      ctx.save(); ctx.translate((m.x - cx) * k, (m.z - cz) * k); ctx.rotate(Math.atan2(o2.z, o2.x));
      ctx.fillStyle = '#ff8fb0'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(1, -6); ctx.lineTo(1, -2.5); ctx.lineTo(-6, -2.5); ctx.lineTo(-6, 2.5); ctx.lineTo(1, 2.5); ctx.lineTo(1, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // guests and Shadow
    const dot = (x, z, r, fill) => { ctx.beginPath(); ctx.arc((x - cx) * k, (z - cz) * k, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = '#4a2c2a'; ctx.stroke(); };
    for (const v of this.H.hosts) dot(v.pos.x, v.pos.z, 4, '#fff6e8');
    const sh = G.companion; if (sh) dot(sh.pos.x, sh.pos.z, 3, '#8ab8ff');
    // the player arrow
    ctx.save(); ctx.translate((p.x - cx) * k, (p.z - cz) * k); ctx.rotate(Math.atan2(Math.cos(G.player.facing), Math.sin(G.player.facing)) + Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5); ctx.closePath();
    ctx.fillStyle = '#ff8a3a'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    ctx.restore();
  }
}
