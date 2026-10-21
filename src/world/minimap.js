// Minimap providers for the HUD and the big map: one shared renderer (ArtMap) over each area's painted art (the village,
// a zone, a dungeon floor; a room's in home/interiorMap.js), its people and places (world/mapData.js); docs/MAP.md,
// ROADMAP UX-1.
import { WORLD } from './terrain.js';
import { CELL } from '../dungeon/gen.js';
import { BUILDINGS } from './buildings/index.js';
import { DISTRICTS } from './plots.js';
import { VillageArt, RegionArt, DungeonArt, floorTile, vnoise, badge, pip, flag, shadowMark, drawArrow, drawPin, drawStar, drawEdge, drawLabel, font } from './mapArt.js';
import { people, places, zonePeople, herePlaces, areaKey } from './mapData.js';

// canvas rotation that puts the camera's forward direction at the top of the map
export const mapRot = yaw => -Math.PI / 2 - Math.atan2(-Math.cos(yaw), -Math.sin(yaw));

// scavenging marks (phase C, cozy/scavengeWorld.js mapMarks()): Shadow's dig spots as little paws, a quest dig as a
// gold pin, gather nodes as tiny green dots (the big map only: on the small disc they'd clutter)
function scavMarks(ctx, G, cx, cz, k, big, lay = null) {
  let L = null; try { L = G.cozy?.scav?.mapMarks?.(); } catch (e) { L = null; }
  if (!L?.length) return;
  const gather = !(lay && lay.gather === false), quests = !(lay && lay.quests === false); // (the filter chips)
  ctx.save(); ctx.lineWidth = 1.2; ctx.strokeStyle = '#4a2c2a';
  for (const m of L) {
    const x = (m.x - cx) * k, y = (m.z - cz) * k;
    if (m.kind === 'node') { if (!big || !gather) continue; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fillStyle = '#7ad890'; ctx.fill(); continue; }
    if (m.kind === 'quest') { if (!quests) continue; ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2); ctx.fillStyle = '#ffd84a'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fillStyle = '#4a2c2a'; ctx.fill(); continue; }
    if (gather) pawMark(ctx, x, y, big ? 1.15 : 1);
  }
  ctx.restore();
}
/** a little paw (a pad and three toes), centred at (x, y) */
export function pawMark(ctx, x, y, s = 1, fill = '#c08452') {
  ctx.fillStyle = fill; ctx.strokeStyle = '#4a2c2a'; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.ellipse(x, y + 0.8 * s, 2.6 * s, 2.1 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  for (const [dx, dy] of [[-2.4, -1.9], [0, -3.1], [2.4, -1.9]]) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, 1.15 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
}
/** a wild area on a map: a dashed violet ring and a claw badge in its middle (docs/COZY.md §6.2) */
export function wildMark(ctx, x, y, r, s = 1) {
  ctx.save();
  ctx.setLineDash([5 * s, 4 * s]); ctx.lineWidth = 2.2 * s; ctx.strokeStyle = 'rgba(170, 110, 240, .95)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(160, 100, 230, .14)'; ctx.fill();
  clawBadge(ctx, x, y, s);
  ctx.restore();
}
/** the claw badge: a violet disc with three slashes */
export function clawBadge(ctx, x, y, s = 1) {
  ctx.beginPath(); ctx.arc(x, y, 6.5 * s, 0, Math.PI * 2); ctx.fillStyle = '#8a56d8'; ctx.fill(); ctx.lineWidth = 1.6 * s; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * s; ctx.lineCap = 'round';
  for (const d of [-2.6, 0, 2.6]) { ctx.beginPath(); ctx.moveTo(x + (d - 2) * s, y - 3.4 * s); ctx.lineTo(x + (d + 1.6) * s, y + 3.4 * s); ctx.stroke(); }
}
/** a sighting's red pin (a red disc with a white rim and a dark heart) */
export function sightingPin(ctx, x, y, s = 1, t = 0) {
  const p = 1 + Math.sin(t * 4) * 0.12;
  ctx.beginPath(); ctx.arc(x, y, 9 * s * p, 0, Math.PI * 2); ctx.fillStyle = 'rgba(232, 60, 70, .22)'; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, 5.2 * s, 0, Math.PI * 2); ctx.fillStyle = '#e8343c'; ctx.fill(); ctx.lineWidth = 1.8 * s; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, 1.8 * s, 0, Math.PI * 2); ctx.fillStyle = '#4a1620'; ctx.fill();
}

// ================================================================== the shared renderer (ROADMAP UX-1, docs/MAP.md)
// Every area's map is one of these: a painted base canvas cached by its art (world/mapArt.js: the village's, a zone's,
// a dungeon floor's, a room's), then per frame the moving and upright marks: places as badges, people as pips with an
// initial (a '!' when they have something for you), the area's own extras (the village's night windows and dig marks, a
// zone's wild areas and sightings, a floor's fog and its monsters), the quest's star, the map pin, Shadow and you. The
// HUD disc follows you (MM_SPANS: the lens chip) and turns with the camera unless Settings › Minimap says North up;
// things off the disc that matter (the pin, the objective) sit on its rim with their distance. Marks are capped by
// priority (the pin, '!', the named cast, hires, then townsfolk) and kept apart so the small disc never clutters; the
// filter chips' layers (Settings' mapLayers: people, shops, services, quests, gather, wild) hide whole kinds on both maps.
// Every mark drawn goes in this.hits (the disc's) or this.bigHits (the big map's: both draw each frame, so each keeps its
// own) ({ x, y, r, e } in that canvas's CSS px) for the tooltips and the big map's clicks.
export const MM_SPANS = [28, 40, 64];
const STONES = new WeakMap(); // (a canvas context's flagstone pattern: DungeonMinimap.under)
/** the filter chips' layers → is this place shown? (homes, landmarks and gates always are) */
const LAYER_OF = { shop: 'shops', service: 'services', board: 'services', gather: 'gather', wild: 'wild' };
const placeOn = (lay, e) => !lay || lay[LAYER_OF[e.cat]] !== false;
export class ArtMap {
  constructor(G) {
    this.G = G; this.dirty = true; this.ownHud = true; this.views = true; this.hits = []; this.bigHits = []; this.edges = [];
    this.bg = '#3f97d0'; this.stats = { draws: 0, ms: 0, maxMs: 0 };
  }
  get lite() { const p = this.G.engine?.preset; return p === 4 || p === 0; }
  get base() { return this.art?.base; }
  /** the world point at the art's canvas (0, 0) */
  get ox() { return 0; }
  get oz() { return 0; }
  rebuild() { this.art.build(); this.dirty = false; }
  /** the people and places to draw and list (each provider's; refreshed at most four times a second) */
  lists() {
    const now = performance.now();
    if (!this._L || now - this._LT > 250) { this._L = this.makeLists(); this._LT = now; }
    return this._L;
  }
  makeLists() { return { people: [], places: [] }; }
  homeView() { const b = this.bounds(); return { cx: (b.x0 + b.x1) / 2, cz: (b.z0 + b.z1) / 2, span: Math.max(b.x1 - b.x0, b.z1 - b.z0) * 0.96 }; }
  bounds() { return { x0: 0, z0: 0, x1: 100, z1: 100 }; }
  /** the map's turn: with the camera (screen-up is the camera's forward), or north up (Settings › Minimap) */
  rot() { return this.G.ui?.settings?.mmNorth ? 0 : mapRot(this.G.engine.rig.yaw); }
  spanMini() { return MM_SPANS[this.G.ui?.settings?.mmZoom ?? 1] || 40; }
  layers(o) { return o.layers || this.G.ui?.settings?.mapLayers || null; }
  /** is a spot known (the fog: a place there shows once seen) */
  seenAt() { return true; }
  // hooks: under (the turned frame, over the base: (x - cx) * k), over (screen space, before the people), labels
  under() {}
  over() {}
  labels() {}
  // the HUD's call (and the old big-map call: o.big with o.zoom)
  draw(ctx, size, pp, o = {}) {
    const p = this.G.player.pos;
    if (o.big) { const h = this.homeView(), z = Math.max(0.5, o.zoom || 1); return this.drawMap(ctx, size, { cx: h.cx, cz: h.cz, span: h.span / z }, o); }
    return this.drawMap(ctx, size, { cx: p.x, cz: p.z, span: this.spanMini() }, { ...o, mini: true });
  }
  /** view { cx, cz, span (metres across), rot? }; o { mini, big, time, sel (a key), hover (a key), layers } */
  drawMap(ctx, size, view, o = {}) {
    const t0 = performance.now();
    if (this.dirty || !this.art?.base) this.rebuild();
    const G = this.G, art = this.art, K = art.K, base = art.base, ox = this.ox, oz = this.oz;
    const { cx, cz, span } = view, rot = view.rot ?? this.rot(), k = size / span, cs = Math.cos(rot), sn = Math.sin(rot), half = size / 2;
    const S = (x, z) => { const dx = (x - cx) * k, dz = (z - cz) * k; return [half + dx * cs - dz * sn, half + dx * sn + dz * cs]; };
    const t = o.time ?? performance.now() / 1000, mini = !!o.mini, zoom = mini ? 1 : this.homeView().span / span, lay = this.layers(o);
    ctx.save();
    ctx.fillStyle = this.bg; ctx.fillRect(0, 0, size, size);
    // the painted base: only the part in view (a square that covers the turned view)
    ctx.save(); ctx.translate(half, half); ctx.rotate(rot);
    const r = span * 0.75, x0 = Math.max(0, Math.floor((cx - r - ox) * K)), z0 = Math.max(0, Math.floor((cz - r - oz) * K)), x1 = Math.min(base.width, Math.ceil((cx + r - ox) * K)), z1 = Math.min(base.height, Math.ceil((cz + r - oz) * K));
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = mini ? 'medium' : 'high';
    const blit = img => { if (x1 > x0 && z1 > z0) ctx.drawImage(img, x0, z0, x1 - x0, z1 - z0, (x0 / K + ox - cx) * k, (z0 / K + oz - cz) * k, (x1 - x0) / K * k, (z1 - z0) / K * k); };
    // (zoomed out, a far copy when the art has one: fewer, softer trees; it gives way to the full detail by zoom 2.2)
    const far = !mini && art.baseFar ? Math.min(1, Math.max(0, (2.2 - zoom) / 0.8)) : 0;
    if (far > 0) { blit(art.baseFar); if (far < 1) { ctx.globalAlpha = 1 - far; blit(base); ctx.globalAlpha = 1; } } else blit(base);
    this.under(ctx, { cx, cz, k, r, K, size, mini, zoom, lay, t });
    ctx.restore();
    // the camera's view cone (the HUD disc)
    if (mini) {
      const fa = G.ui?.settings?.mmNorth ? -Math.PI / 2 - mapRot(G.engine.rig.yaw) : -Math.PI / 2;
      const cone = ctx.createRadialGradient(half, half, 0, half, half, 64);
      cone.addColorStop(0, 'rgba(255,255,255,.3)'); cone.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(half, half); ctx.arc(half, half, 64, fa - 0.5, fa + 0.5); ctx.closePath(); ctx.fill();
    }
    const hits = this._hits = mini ? this.hits : this.bigHits; hits.length = 0; if (mini) this.edges = []; // (edges: what sits on the disc's rim, for the QA)
    const L = this.lists(), disc = size / 2 - 10, here = areaKey(G);
    if (!mini && this._LC !== L) { this._LC = L; this.layerCounts = this.countLayers(L, here); } // (the big map greys a chip with nothing)
    const inside = (sx, sy, m = 0) => (mini ? Math.hypot(sx - half, sy - half) < disc - m : sx > -m && sy > -m && sx < size + m && sy < size + m);
    const pinKey = G.mapPin?.cur?.key || null;
    // ---- places
    const pl = [];
    for (const e of L.places) {
      if (!e.pos || e.node || (e.area && e.area !== here)) continue;
      if (!placeOn(lay, e)) continue;
      if (mini && (e.landmark || (e.cat === 'home' && !e.mine) || e.prio < 3)) continue;
      const [sx, sy] = S(e.pos.x, e.pos.z);
      if (!inside(sx, sy, mini ? 5 : -10)) continue;
      pl.push({ e, sx, sy, w: (e.key === pinKey ? 100 : 0) + (e.key === o.sel ? 90 : 0) + e.prio });
    }
    pl.sort((a, b) => b.w - a.w);
    const kept = [], gap = mini ? 13 : 17 + Math.min(4, zoom), R = mini ? 6.5 : zoom > 3 ? 10.5 : zoom > 2 ? 9.5 : 8.5, labels = [];
    const free = (x0, y0, x1, y1) => labels.every(q => x1 < q[0] || x0 > q[2] || y1 < q[1] || y0 > q[3]);
    for (const m of pl) {
      if (kept.length >= (mini ? 8 : 70)) break;
      if (m.w < 90 && kept.some(q => Math.hypot(q.sx - m.sx, q.sy - m.sy) < (m.e.landmark || q.e.landmark ? gap * 0.6 : gap))) continue;
      kept.push(m);
    }
    // ---- people
    const P = G.player.pos, pe = [];
    for (const e of L.people) {
      if (!e.pos || !e.visible || e.you || e.shadow || (e.area && e.area !== here)) continue;
      if (lay && lay.people === false && !(e.badge && lay.quests !== false)) continue;
      const [sx, sy] = S(e.pos.x, e.pos.z);
      if (!inside(sx, sy, mini ? 4 : -6)) continue;
      const d = Math.hypot(e.pos.x - P.x, e.pos.z - P.z);
      const w = (e.key === pinKey ? 200 : 0) + (e.key === o.sel ? 150 : 0) + (e.badge === '!' ? 60 : e.badge ? 40 : 0) + (e.named ? 30 : e.group === 'hire' ? 15 : 5) - d * 0.1;
      pe.push({ e, sx, sy, w });
    }
    pe.sort((a, b) => b.w - a.w);
    let named = 0, rest = 0; const shown = [];
    for (const m of pe) {
      const big = m.e.named || m.e.badge || m.w >= 150;
      if (mini) { if (big ? ++named > 9 : ++rest > 6) continue; }
      shown.push(m);
    }
    // the names first, in priority order (each kept off the badges, the pips and the names before it), then the badges
    // (the most important on top), then the names over them. The marks drawn after them (you, Shadow, the pin, the
    // objective's star) would cover a name: one whose spot lies under a mark tries above, then right, then left
    const badges = kept.filter(m => !(m.e.landmark && !mini)).map(m => [m.sx - R, m.sy - R, m.sx + R, m.sy + R]).concat(shown.map(m => [m.sx - 7, m.sy - 7, m.sx + 7, m.sy + 7])), names = [];
    let q = null; if (!(lay && lay.quests === false)) { try { q = (G.questTarget?.base || G.questTarget)?.() || null; } catch (e) { q = null; } }
    if (q?.pin) q = null;
    const pt = pinKey ? G.mapPin.target() : null, sh = G.companion, marks = [], nameBoxes = [];
    if (!mini) {
      { const [x, y] = S(P.x, P.z); marks.push([x - 13, y - 13, x + 13, y + 13]); }
      if (sh?.pos && sh.world === G.world) { const [x, y] = S(sh.pos.x, sh.pos.z); marks.push([x - 9, y - 9, x + 9, y + 9]); }
      if (pt?.pos) { const [x, y] = S(pt.pos.x, pt.pos.z); marks.push([x - 11, y - 31, x + 11, y + 4]); }
      if (q?.pos && !(G.mode === 'dungeon' && q.kind === 'npc')) { const [x, y] = S(q.pos.x, q.pos.z); marks.push([x - 12, y - 12, x + 12, y + 12]); }
    }
    const over = (rr, list) => list.some(b => !(rr[2] < b[0] || rr[0] > b[2] || rr[3] < b[1] || rr[1] > b[3]));
    /** a name's spot: the first of cands ([x, y, w, h], its own spot first) clear of the names before it, of the marks and
     *  (strict) of the badges and pips; the others only when its own lies under a mark, or it is picked (sel), so names
     *  never crowd in where there was no room; a picked one keeps its own spot when none is clear */
    const spotOf = (cands, sel, strict) => {
      const bx = c => [c[0] - c[2] / 2, c[1] - c[3] / 2, c[0] + c[2] / 2, c[1] + c[3] / 2], ok = rr => free(...rr) && !over(rr, marks) && !(strict && over(rr, badges));
      const r0 = bx(cands[0]); if (ok(r0)) return [cands[0], r0];
      if (sel || over(r0, marks)) for (let i = 1; i < cands.length; i++) { const rr = bx(cands[i]); if (ok(rr)) return [cands[i], rr]; }
      return sel ? [cands[0], r0] : null;
    };
    const put = (name, at) => { labels.push(at[1]); nameBoxes.push({ name, r: at[1].map(v => Math.round(v)) }); };
    if (!mini) {
      ctx.font = font(700, 11);
      for (const m of kept) {
        const e = m.e, sel = e.key === o.sel || e.key === o.hover || e.key === pinKey;
        if (e.landmark) { // (a named spot: its name on the map, blue for the water)
          const a = Math.min(1, Math.max(0, (zoom - 0.9) / 0.45)); if (a < 0.05) continue;
          const fs = zoom > 2 ? 12.5 : 11, w = ctx.measureText(e.name).width * fs / 11 + 6, at = spotOf([[m.sx, m.sy, w, 16], [m.sx, m.sy - 16, w, 16], [m.sx, m.sy + 16, w, 16]], false, true);
          if (!at) continue;
          put(e.name, at); names.push([e.name, at[0][0], at[0][1], fs, { color: e.icon === 'wave' || e.icon === 'drop' ? '#2a6aa0' : '#6a4a3a', w: 600, alpha: a, halo: 3 }]); hits.push({ x: m.sx, y: m.sy, r: 16, e });
          continue;
        }
        const a = sel ? 1 : Math.min(1, Math.max(0, (zoom - (this.nameZoom ?? 1.3)) / 0.55)); if (a < 0.05) continue;
        const w = ctx.measureText(e.name).width + 6, at = spotOf([[m.sx, m.sy + R + 8, w, 14], [m.sx, m.sy - R - 9, w, 14], [m.sx + R + 5 + w / 2, m.sy, w, 14], [m.sx - R - 5 - w / 2, m.sy, w, 14]], sel, true);
        if (!at) continue;
        put(e.name, at); names.push([e.name, at[0][0], at[0][1], 11, { alpha: a }]);
      }
    }
    for (const m of kept.slice().reverse()) {
      const e = m.e; if (e.landmark && !mini) continue;
      const sel = e.key === o.sel || e.key === o.hover, rr = sel ? R + 1.5 : R, img = badge(e.icon, e.color, rr, { dim: !!e.dim });
      ctx.drawImage(img, m.sx - img.cssW / 2, m.sy - img.cssH / 2, img.cssW, img.cssH);
      hits.push({ x: m.sx, y: m.sy, r: rr + 3, e });
    }
    for (const [tx, x, y, fs, op] of names) drawLabel(ctx, tx, x, y, fs, op);
    this.over(ctx, S, { mini, zoom, lay, t, inside, hits, size });
    const rOf = e => (mini ? (e.named || e.badge ? 5.5 : e.group === 'hire' ? 4.2 : 3.3) : (e.named || e.badge ? 7 : e.group === 'hire' ? 5.6 : zoom > 2.2 ? 5.4 : 4.4));
    const pnames = [];
    if (!mini) { // (their names: the most important placed first, kept off the names, badges and pips before them)
      ctx.font = font(700, 10.5);
      for (const m of shown) {
        const e = m.e, sel = e.key === o.sel || e.key === o.hover || e.key === pinKey;
        if (!(sel || zoom > 2.9 || (e.named && zoom > 2.1))) continue;
        const w = ctx.measureText(e.name).width + 6, r0 = rOf(e), at = spotOf([[m.sx, m.sy + r0 + 7, w, 12], [m.sx, m.sy - r0 - 8, w, 12], [m.sx + r0 + 4 + w / 2, m.sy, w, 12], [m.sx - r0 - 4 - w / 2, m.sy, w, 12]], sel, true);
        if (at) { put(e.name, at); pnames.push([e.name, at[0][0], at[0][1], 10.5, { w: 700, color: '#5a3440', alpha: sel ? 1 : Math.min(1, (zoom - (e.named ? 2.1 : 2.9)) / 0.5) }]); }
      }
    }
    for (const m of shown.slice().reverse()) { // (the most important drawn last, on top)
      const e = m.e, sel = e.key === o.sel || e.key === o.hover || e.key === pinKey, rr = rOf(e);
      const img = pip(e.color, rr >= 5 ? e.initial : '', sel ? rr + 1 : rr);
      ctx.drawImage(img, m.sx - img.cssW / 2, m.sy - img.cssH / 2, img.cssW, img.cssH);
      if (e.badge && !(lay && lay.quests === false)) { const f = flag(e.badge, mini ? 3.8 : 4.6); ctx.drawImage(f, m.sx + rr * 0.55, m.sy - rr * 1.25 - f.cssH / 2 + 2, f.cssW, f.cssH); }
      hits.push({ x: m.sx, y: m.sy, r: rr + 3, e });
    }
    for (const [tx, x, y, fs, op] of pnames) drawLabel(ctx, tx, x, y, fs, op);
    if (!mini) this.nameQA = { names: nameBoxes, marks: marks.map(b => b.map(v => Math.round(v))) }; // (for the QA: where the names went)
    // ---- the objective's star (under the pin; the Quests chip hides it), the pin, the selection's pulse
    if (q?.pos && !(G.mode === 'dungeon' && q.kind === 'npc')) this.mark(ctx, S, q.pos, half, disc, mini, t, 'star', P, q.label);
    if (pt?.pos) this.mark(ctx, S, pt.pos, half, disc, mini, t, 'pin', P, pt.label);
    if (o.sel && o.sel !== pinKey) {
      const e = L.people.find(x => x.key === o.sel) || L.places.find(x => x.key === o.sel);
      const p = e && (!e.area || e.area === here) ? e.pos : null;
      if (p) { const [sx, sy] = S(p.x, p.z); const pr = 13 + Math.sin(t * 5) * 3; ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255, 92, 138, .85)'; ctx.beginPath(); ctx.arc(sx, sy, pr, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy, pr + 2.5, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    }
    // ---- Shadow and you
    if (sh?.pos && sh.world === G.world) { const [sx, sy] = S(sh.pos.x, sh.pos.z); if (inside(sx, sy)) { const img = shadowMark(mini ? 4.6 : 5.6); ctx.drawImage(img, sx - img.cssW / 2, sy - img.cssH / 2, img.cssW, img.cssH); hits.push({ x: sx, y: sy, r: 8, e: L.people.find(e => e.shadow) }); } }
    // couch co-op: players 2-4's heroes, a dot each in their player's colour with their number (off the disc: on its rim)
    if (G.coop?.active) for (const s of G.coop.others) {
      const B = s.body; if (!B?.pos || B.world !== G.world) continue;
      let [sx, sy] = S(B.pos.x, B.pos.z);
      if (mini && Math.hypot(sx - half, sy - half) > disc - 6) { const a = Math.atan2(sy - half, sx - half); sx = half + Math.cos(a) * (disc - 6); sy = half + Math.sin(a) * (disc - 6); }
      else if (!inside(sx, sy, -6)) continue;
      const r = mini ? 6.2 : 7.5, img = pip(s.color, String(s.n), r);
      ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(sx, sy, r + 4, 0, Math.PI * 2); ctx.fill(); ctx.restore(); // (a soft halo: apart from the townsfolk's pips)
      ctx.drawImage(img, sx - img.cssW / 2, sy - img.cssH / 2, img.cssW, img.cssH);
    }
    { const [sx, sy] = S(P.x, P.z), f = G.player.facing; if (inside(sx, sy, -20)) drawArrow(ctx, sx, sy, rot + Math.atan2(Math.cos(f), Math.sin(f)) + Math.PI / 2, mini ? 1 : 1.15); }
    if (!mini) this.labels(ctx, size, S, zoom);
    ctx.restore();
    const ms = performance.now() - t0, st = this.stats; st.draws++; st.ms += ms; if (ms > st.maxMs) st.maxMs = ms;
  }
  /** what each filter chip has on this map: { people, shops, services, quests, gather, wild } */
  countLayers(L, here) {
    const G = this.G, n = { people: 0, shops: 0, services: 0, quests: 0, gather: 0, wild: 0 }, mine = e => !e.area || e.area === here;
    for (const e of L.people) if (mine(e) && e.pos && e.visible && !e.you && !e.shadow) { n.people++; if (e.badge) n.quests++; }
    for (const e of L.places) if (mine(e) && e.pos) { const l = LAYER_OF[e.cat]; if (l) n[l]++; }
    let q = null; try { q = (G.questTarget?.base || G.questTarget)?.(); } catch (e) { q = null; } if (q?.pos && !q.pin) n.quests++;
    let M = null; try { M = G.cozy?.scav?.mapMarks?.(); } catch (e) { M = null; } for (const m of M || []) n[m.kind === 'quest' ? 'quests' : 'gather']++;
    n.wild += this.wildCount?.() || 0;
    return n;
  }
  /** the objective's star or the pin: on the map, or (the HUD disc) on its rim pointing out, with its distance */
  mark(ctx, S, pos, half, disc, mini, t, kind, P, label = '') {
    const [sx, sy] = S(pos.x, pos.z), dx = sx - half, dy = sy - half, d = Math.hypot(dx, dy);
    if (mini && d > disc - 8) {
      const a = Math.atan2(dy, dx), rr = disc - 9, m = Math.round(Math.hypot(pos.x - P.x, pos.z - P.z));
      drawEdge(ctx, half + Math.cos(a) * rr, half + Math.sin(a) * rr, a, kind === 'pin' ? `${m} m` : '', kind === 'pin' ? '#ff5c8a' : '#ffd84a', t);
      this.edges.push({ kind, a: +a.toFixed(3), m, label });
      return;
    }
    if (kind === 'pin') drawPin(ctx, sx, sy, t, mini ? 0.85 : 1.1); else drawStar(ctx, sx, sy, t, mini ? 0.9 : 1.1);
    this._hits.push({ x: sx, y: sy - (kind === 'pin' ? 11 : 0), r: 9, e: kind === 'pin' ? this.G.mapPin?.cur?.entry : { kind: 'quest', name: label || 'Quest objective', sub: 'Your quest' } });
  }
}

// ------------------------------------------------------------------ Blossom Hollow
export class VillageMinimap extends ArtMap {
  constructor(G) { super(G); this.art = new VillageArt(G, this.lite ? 4 : 5); this.bg = '#3f97d0'; }
  makeLists() { return { people: people(this.G), places: places(this.G) }; }
  homeView() { return { cx: WORLD / 2, cz: WORLD / 2 + 3, span: WORLD * 0.96 }; }
  bounds() { return { x0: 0, z0: 0, x1: WORLD, z1: WORLD }; }
  under(ctx, { cx, cz, k, r, K, size, mini, lay }) {
    const G = this.G, art = this.art;
    // zoomed in past the cache's own detail: the buildings again, crisp (the same art, in view only)
    if (!mini && k > K * 1.25) { ctx.save(); ctx.translate(-cx * k, -cz * k); ctx.scale(k / K, k / K); art.drawBuildings(ctx, { x0: cx - r, z0: cz - r, x1: cx + r, z1: cz + r }); ctx.restore(); }
    // night: a navy wash, the windows lit
    const night = Math.max(0, Math.min(1, G.day?.out?.night ?? 0));
    if (night > 0.02) {
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = night * 0.85; ctx.fillStyle = '#5a64b4'; ctx.fillRect(-size, -size, size * 2, size * 2);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = night;
      for (const rec of G.sim?.list || []) {
        const b = rec.data, cat = BUILDINGS[b.type]?.cat; if (!cat || cat === 'decor' || b.type === 'bridge') continue;
        if (Math.abs(b.x - cx) > r + 4 || Math.abs(b.z - cz) > r + 4) continue;
        const [w, d] = G.sim.dims(b.type, b.rot, b.level), bx = (b.x + w / 2 - cx) * k, bz = (b.z + d / 2 - cz) * k;
        ctx.fillStyle = 'rgba(255, 214, 120, .5)'; ctx.beginPath(); ctx.ellipse(bx, bz, w * 0.5 * k, d * 0.5 * k, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe6a0'; ctx.beginPath(); ctx.roundRect(bx - w * 0.18 * k, bz - d * 0.14 * k, w * 0.36 * k, d * 0.28 * k, 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    scavMarks(ctx, G, cx, cz, k, !mini, lay);
  }
  // the district names (fading as you zoom in) and the rings not open yet (which rank opens them)
  labels(ctx, size, S, zoom) {
    const ring = this.G.sim?.ringRank?.() || 1, a = Math.min(1, Math.max(0, (2.7 - zoom) / 1.1));
    if (a < 0.03) return;
    const fs = Math.round(Math.min(17, 12 + zoom * 1.8));
    for (const D of Object.values(DISTRICTS)) {
      if (!D.label) continue;
      const [x, y] = S(D.label[0], D.label[1]);
      if (x < -60 || y < -20 || x > size + 60 || y > size + 20) continue;
      const locked = D.ring && D.ring > ring;
      drawLabel(ctx, D.name, x, y, fs, { w: 800, color: locked ? '#7a7088' : '#5a3440', alpha: a, halo: 4.2 });
      if (locked) drawLabel(ctx, `opens at rank ${D.ring}`, x, y + fs, fs - 4, { w: 700, color: '#7a7088', alpha: a, halo: 3.4 });
    }
  }
}

// ------------------------------------------------------------------ a dungeon floor: the painted cave under a soft fog
// The fog of war: what you've seen is the floor you could walk to within 7 cells of where you've been (a flood over the
// walkable cells, so a passage behind the rock stays hidden), the walls round it and the rock two cells out (so the fog's
// edge lies in the rock, never over the inked rim). The rest lies under a painted cloud (four pixels a cell, blurred
// smooth: no steps), in the floor's own dusk with a soft mottle and a paler mist along its edge. Zoomed in, the floor's
// flagstones are a pattern clipped to its outline (DungeonArt.path), crisp at any zoom. A chest, the stairs, a shrine, the
// boss's room or the waypoint show once their spot is seen (an opened chest or a used shrine dimmed); the portal home
// always. Monsters near you show as before (a boss red, uniques gold, champions blue).
export class DungeonMinimap extends ArtMap {
  constructor(G, mode) {
    super(G); this.mode = mode; const L = mode.layout;
    this.R = 7;
    this.seen = new Uint8Array(L.W * L.H); this.reach = new Int32Array(L.W * L.H); this.reachN = 0;
    this.FS = 4; // (the fog: four pixels a cell)
    this.fog = document.createElement('canvas'); this.fog.width = L.W * this.FS; this.fog.height = L.H * this.FS;
    this.fg = this.fog.getContext('2d');
    this.lastCell = -1;
    this.box = [1e9, 1e9, -1e9, -1e9]; // explored cells' bounds (x0, y0, x1, y1) so the big map can fit what has been seen
    this.art = this.makeArt(G, mode);
    const fc = typeof mode.theme?.fog === 'string' ? mode.theme.fog : '#2a2038'; this.bg = fc; this.fogRGB = [parseInt(fc.slice(1, 3), 16), parseInt(fc.slice(3, 5), 16), parseInt(fc.slice(5, 7), 16)]; this.nameZoom = 0.2; // (a floor's few names: readable from its fitted view out)
    this.paintNow();
    this.paintFog(0, 0, L.W - 1, L.H - 1); // (all cloud to begin with: made behind the iris too)
    this.fitFree = true; // (the big map fits its home view into what the buttons and chips leave free: ui/map.js fitFree)
  }
  /** painted at once: the provider is made mid-transition (game.js enterCombatWorld, behind the iris), where a hitch
   *  hides; the first draw after it would show one */
  paintNow() { try { this.rebuild(); } catch (e) { this.dirty = true; } }
  makeArt(G, mode) { return new DungeonArt(G, mode, this.lite ? 4 : 5); }
  rebuild() { super.rebuild(); }
  makeLists() { const G = this.G; return { people: people(G), places: herePlaces(G, this.mode, (x, z) => this.seenAt(x, z)) }; }
  areaName() { return 'On this floor'; }
  bounds() { const L = this.mode.layout; return { x0: 0, z0: 0, x1: L.W * CELL, z1: L.H * CELL }; }
  /** the big map's home view: what has been seen (at least ~40 m), else the whole floor */
  homeView() { // (fitted to the map's turn: a box turned 45° needs more across)
    const b = this.box, L = this.mode.layout, t = this.rot(), c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
    const fit = (w, h) => Math.max(w * c + h * s, w * s + h * c);
    if (b[2] < b[0]) return { cx: L.W * CELL / 2, cz: L.H * CELL / 2, span: fit(L.W, L.H) * CELL };
    return { cx: (b[0] + b[2] + 1) / 2 * CELL, cz: (b[1] + b[3] + 1) / 2 * CELL, span: Math.max(40, (fit(b[2] - b[0] + 1, b[3] - b[1] + 1) + 4) * CELL) };
  }
  seenAt(x, z) { const L = this.mode.layout, cx = Math.floor(x / CELL), cy = Math.floor(z / CELL); return cx >= 0 && cy >= 0 && cx < L.W && cy < L.H && !!this.seen[cy * L.W + cx]; }
  /** what you've seen from here: the floor you could walk to within R cells (a flood over the walkable cells), every
   *  cell next to it and the rock two out; a floor cell behind the rock waits until you reach it */
  reveal() {
    const L = this.mode.layout, p = this.G.player.pos, cx = Math.floor(p.x / CELL), cy = Math.floor(p.z / CELL), R = this.R, W = L.W, H = L.H;
    const key = cy * W + cx; if (key === this.lastCell) return; this.lastCell = key;
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return;
    const stamp = ++this.reachN, q = [cx, cy], b = this.box; this.reach[key] = stamp;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let h = 0; h < q.length; h += 2) {
      const x = q[h], y = q[h + 1];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const i = ny * W + nx; if (this.seen[i] || ((dx < -1 || dx > 1 || dy < -1 || dy > 1) && L.at(nx, ny))) continue; // (two out: the rock only)
        this.seen[i] = 1;
        if (nx < x0) x0 = nx; if (ny < y0) y0 = ny; if (nx > x1) x1 = nx; if (ny > y1) y1 = ny;
        if (nx < b[0]) b[0] = nx; if (ny < b[1]) b[1] = ny; if (nx > b[2]) b[2] = nx; if (ny > b[3]) b[3] = ny;
      }
      for (let d = 0; d < 4; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0); if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const i = ny * W + nx; if (this.reach[i] === stamp || !L.at(nx, ny) || (nx - cx) ** 2 + (ny - cy) ** 2 > R * R) continue;
        this.reach[i] = stamp; q.push(nx, ny);
      }
    }
    if (x1 >= 0) { this.paintFog(x0, y0, x1, y1); this._LT = 0; } // (the lists again: a chest or the stairs may have come into view)
  }
  /** the fog over cells x0..x1, y0..y1 (and what their blur reaches): the unseen mask at four pixels a cell, box-blurred
   *  twice (round soft edges, no steps) and cut so it is whole by the seen edge (nothing unseen shows through), in the
   *  floor's own dusk with a cloud's mottle and a paler mist where it thins */
  paintFog(x0, y0, x1, y1) {
    const L = this.mode.layout, FS = this.FS, W2 = L.W * FS, H2 = L.H * FS, M = 2, Br = 3, E = Br * 2 + 1;
    const X0 = Math.max(0, (x0 - M) * FS), Y0 = Math.max(0, (y0 - M) * FS), X1 = Math.min(W2, (x1 + M + 1) * FS), Y1 = Math.min(H2, (y1 + M + 1) * FS);
    const ex0 = Math.max(0, X0 - E), ey0 = Math.max(0, Y0 - E), ex1 = Math.min(W2, X1 + E), ey1 = Math.min(H2, Y1 + E), w = ex1 - ex0, h = ey1 - ey0;
    if (X1 <= X0 || Y1 <= Y0) return;
    const a = new Float32Array(w * h), b = new Float32Array(w * h), seen = this.seen, LW = L.W;
    for (let y = 0; y < h; y++) { const row = (((ey0 + y) / FS) | 0) * LW; for (let x = 0; x < w; x++) a[y * w + x] = seen[row + (((ex0 + x) / FS) | 0)] ? 0 : 1; }
    const pass = (src, dst, sx, sy, n) => { // (a box of 2·Br+1 along x or y, its sum slid along)
      for (let o = 0; o < (sx ? h : w); o++) {
        let s = 0, c = 0; const at = i => sx ? o * w + i : i * w + o;
        for (let i = 0; i < Math.min(n, Br); i++) { s += src[at(i)]; c++; }
        for (let i = 0; i < n; i++) {
          if (i + Br < n) { s += src[at(i + Br)]; c++; }
          if (i - Br - 1 >= 0) { s -= src[at(i - Br - 1)]; c--; }
          dst[at(i)] = s / c;
        }
      }
    };
    for (let k = 0; k < 2; k++) { pass(a, b, true, false, w); pass(b, a, false, true, h); }
    const g = this.fg, iw = X1 - X0, img = g.createImageData(iw, Y1 - Y0), D = img.data, [fr, fgc, fb] = this.fogRGB;
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
      const u = x / FS, z = y / FS, cloud = vnoise(u * 0.32, z * 0.32) * 0.65 + vnoise(u * 0.9 + 7, z * 0.9 + 3) * 0.35;
      const v = a[(y - ey0) * w + (x - ex0)] + (cloud - 0.5) * 0.4, t = Math.max(0, Math.min(1, (v - 0.04) / 0.46)), al = t * t * (3 - 2 * t); // (the cloud's puffs billow its edge)
      const mist = Math.max(0, 1 - Math.abs(v - 0.34) * 3.4), lift = (cloud - 0.5) * 22 + mist * 34, k4 = ((y - Y0) * iw + (x - X0)) * 4;
      D[k4] = fr + lift; D[k4 + 1] = fgc + lift * 0.94; D[k4 + 2] = fb + lift * 1.08; D[k4 + 3] = Math.round(al * 255);
    }
    g.putImageData(img, X0, Y0);
  }
  drawMap(ctx, size, view, o = {}) { this.reveal(); return super.drawMap(ctx, size, view, o); }
  under(ctx, { cx, cz, k, r, mini, lay }) {
    const L = this.mode.layout, G = this.G, art = this.art;
    // the flagstones, faded in from 6 px a metre (the big map only): the floor's outline filled with the stone pattern
    const sa = mini ? 0 : Math.min(1, Math.max(0, (k - 6) / 5));
    if (art.path && sa > 0.02) {
      let pat = STONES.get(ctx); if (!pat) { pat = ctx.createPattern(floorTile(), 'repeat'); pat.setTransform(new DOMMatrix([1 / 64, 0, 0, 1 / 64, 0, 0])); STONES.set(ctx, pat); }
      ctx.save(); ctx.translate(-cx * k, -cz * k); ctx.scale(k, k); ctx.clip(art.path); ctx.globalAlpha = sa; ctx.fillStyle = pat; ctx.fillRect(cx - r, cz - r, r * 2, r * 2); ctx.restore();
    }
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.fog, (0 - cx) * k, (0 - cz) * k, L.W * CELL * k, L.H * CELL * k); ctx.restore();
    scavMarks(ctx, G, cx, cz, k, !mini, lay);
  }
  over(ctx, S, { mini, inside }) {
    const G = this.G, p = G.player.pos;
    for (const m of this.mode.monsters || []) {
      if (!m.alive || !this.seenAt(m.pos.x, m.pos.z) || m.pos.distanceTo(p) > (mini ? 16 : 22)) continue;
      const [sx, sy] = S(m.pos.x, m.pos.z); if (!inside(sx, sy)) continue;
      const rr = m.rank === 'boss' ? 5.5 : m.rank !== 'normal' ? 3.8 : 2.6;
      ctx.beginPath(); ctx.arc(sx, sy, rr, 0, Math.PI * 2); ctx.fillStyle = m.rank === 'boss' ? '#ff3a6a' : m.rank === 'unique' ? '#ffb030' : m.rank === 'champion' ? '#6aa8ff' : '#ff7a7a'; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = '#2a1a24'; ctx.stroke();
    }
  }
}

// ------------------------------------------------------------------ a zone (docs/REGIONS.md): the whole region painted
// The land is known (a zone is a place you travel to, with a trail and a village): no fog over it, but a chest, a shrine
// or the boss's clearing show once seen. Its wild areas (their violet rings) and today's sightings always show (docs/
// COZY.md §6.2, §6.3); monsters near you as on a floor. Its village's people are in People while you're here.
export class RegionMinimap extends DungeonMinimap {
  constructor(G, mode) {
    super(G, mode); this.R = 10;
    this.bg = mode.region?.mood?.fog?.color || '#3a4a3a'; this.nameZoom = 1; this.fitFree = false;
  }
  makeArt(G, mode) { return new RegionArt(G, mode, this.lite ? 4 : 5); }
  rebuild() { this.art.build(); this.dirty = false; }
  paintFog() {} // (no fog over a zone)
  reveal() {
    const L = this.mode.layout, p = this.G.player.pos, cx = Math.floor(p.x / CELL), cy = Math.floor(p.z / CELL), R = this.R;
    const key = cy * L.W + cx; if (key === this.lastCell) return; this.lastCell = key;
    let any = false;
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (x < 0 || y < 0 || x >= L.W || y >= L.H || (x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
      const i = y * L.W + x; if (this.seen[i]) continue; this.seen[i] = 1; any = true;
      const b = this.box; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
    }
    if (any) this._LT = 0;
  }
  wildCount() { return (this.mode.layout.wild?.length || 0) + (this.mode.wild?.pins?.()?.length || 0); }
  makeLists() { const G = this.G; return { people: [...people(G), ...zonePeople(G, this.mode)], places: herePlaces(G, this.mode, (x, z) => this.seenAt(x, z)) }; }
  bounds() { const N = this.art.N; return { x0: 0, z0: 0, x1: N, z1: N }; }
  homeView() { const N = this.art.N; return { cx: N / 2, cz: N / 2, span: N * 0.98 }; }
  areaName() { return this.mode.village?.def?.name || this.mode.region?.name || 'Here'; }
  under(ctx, { cx, cz, k, mini, lay, t }) {
    const G = this.G, L = this.mode.layout, s = mini ? 1 : 1.25;
    if (!(lay && lay.wild === false)) {
      for (const a of L.wild || []) wildMark(ctx, (a.x - cx) * k, (a.z - cz) * k, a.r * k, s);
      for (const p of this.mode.wild?.pins?.() || []) sightingPin(ctx, (p.x - cx) * k, (p.z - cz) * k, s, t);
    }
    const A = L.arena;
    if (A && this.seenAt(A.x, A.z)) { ctx.save(); ctx.strokeStyle = 'rgba(255,74,106,.8)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc((A.x - cx) * k, (A.z - cz) * k, A.r * k, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    scavMarks(ctx, G, cx, cz, k, !mini, lay);
  }
  labels(ctx, size, S, zoom) { // (the wild areas' names by their rings as you zoom in)
    if (zoom < 1.3 || this.layers({})?.wild === false) return;
    const a = Math.min(1, (zoom - 1.3) / 0.5);
    for (const w of this.mode.layout.wild || []) { const [x, y] = S(w.x, w.z); drawLabel(ctx, w.name.replace(/^the /, 'The '), x, y + 14, 11, { color: '#5a3a8a', w: 700, alpha: a }); }
  }
}
