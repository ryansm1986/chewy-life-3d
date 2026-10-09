// The peaceful overworld and its wild areas (docs/COZY.md §6; ROADMAP CZ-3). Pure (no three.js, no DOM): node-tested in
// tools/test-rpg.mjs "COZY: PEACEFUL".
//
// The rule (§6.1): while a zone's village is besieged (the first time), everything spawns as before: the trail camps,
// the siege camps and the captain, and the wild areas' packs. Once zones[z].village === 'saved', the zone turns
// peaceful: only the packs inside its two wild areas spawn (peacefulFilter). The emptied trail camp sites become
// wildlife glades (RegionMode: layout.glades), and the scavenging phase (CZ-5) can put its clusters there.
//
// Wild areas (§6.2) are recipe data, so the terrain rework (Z-F) carries them like the village's site:
//   layout.wild: [{ id, name, jp, at: [x, z], r, packs, spur? }]
//     name   display name with its article ("the Kamaitachi Thicket"; titled() capitalises it for a toast)
//     r      the disc's radius (12–16 m)
//     packs  monster packs per visit (2–3)
//     spur   optional control points [[x, z]…] for the side path from the main trail (it bends round a stream / a pond)
// layoutGen puts them in the plan (plan.wild, `wild` discs, a spur each), checks the trail clearance (wildIssues: every
// main-trail point at least r + WILD.trailGap from each disc, so the walk from the Wayfarer's Stone to the village and
// the dungeon gate never crosses one) and drops an area that fails. Their packs are the zone's kinds a step above the
// highest hero (wildLevel) with hotter ranks, leashed to the disc (cozy/wildWorld.js); a wild cache chest in each.
//
// The interface for other phases (CZ-5 scavenging places nodes in the same zones):
//   wildAreas(defOrLayout)          → the normalised areas of a recipe (def.layout.wild) or of a plan / layout (.wild)
//   wildAt(areas, x, z, pad = 0)    → the area whose disc (grown by pad) holds (x, z), or null
//   inWild(areas, x, z, pad = 0)    → boolean
//   isPeaceful(state, zone)         → the zone spawns only its wild packs (its village saved, or the debug override)
// At runtime the same is on the region: G.dungeon.layout.wild / .glades / .peaceful, G.dungeon.wildAt(x, z), and in
// populate ctx.inWild(x, z, pad) / ctx.wildAt(x, z, pad) / ctx.peaceful / ctx.glades.

/** the wild areas' tuning (COZY §6.2) */
export const WILD = {
  r: [12, 16],          // a disc's radius
  packs: [2, 3],        // packs per visit
  lvlAbove: 2,          // monster level: the highest hero's + 2 (always a step above you) …
  lvlFloor: 2,          // … never below the band's low + 2 …
  lvlUp: 1,             // … never above the band's top + 1 (the director's call at CZ-3: band top + 1 flat was a trap)
  ranks: { unique: 0.18, champion: 0.30 }, // hotter than a trail camp (unique 12%, champion 20%)
  count: [3, 5],        // monsters in a pack (before the kind's pack multiplier)
  leash: 6,             // a wild monster chases no further than r + leash from the disc's centre, then walks home
  trailGap: 3,          // every main-trail point stays at least r + trailGap from a disc
};

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** "the Kamaitachi Thicket" → "The Kamaitachi Thicket" (a toast, a heading) */
export const titled = s => (s ? s[0].toUpperCase() + s.slice(1) : '');

/** one recipe entry → { id, name, jp, x, z, r, packs, spur } (or null when it isn't usable) */
export function normArea(w, i = 0) {
  if (!w || typeof w !== 'object') return null;
  const at = Array.isArray(w.at) ? w.at : [w.x, w.z];
  const x = num(at[0], NaN), z = num(at[1], NaN);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return {
    id: typeof w.id === 'string' && w.id ? w.id : `wild${i + 1}`,
    name: typeof w.name === 'string' && w.name ? w.name : 'the wild',
    jp: typeof w.jp === 'string' ? w.jp : '',
    x, z, r: clamp(num(w.r, 13), WILD.r[0], WILD.r[1]),
    packs: clamp(Math.round(num(w.packs, 3)), WILD.packs[0], WILD.packs[1]),
    spur: Array.isArray(w.spur) ? w.spur.filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).map(p => [p[0], p[1]]) : [],
  };
}
/** a recipe (def.layout.wild), a plan or a layout (.wild, already normalised) → the areas */
export function wildAreas(src) {
  if (!src) return [];
  if (Array.isArray(src)) return src.map(normArea).filter(Boolean);
  if (Array.isArray(src.wild)) return src.wild.every(w => typeof w.x === 'number') ? src.wild : src.wild.map(normArea).filter(Boolean);
  if (src.layout) return wildAreas(src.layout.wild || []);
  return [];
}
/** the area whose disc (grown by pad metres) holds (x, z), or null */
export function wildAt(areas, x, z, pad = 0) {
  for (const a of areas || []) if (Math.hypot(x - a.x, z - a.z) < a.r + pad) return a;
  return null;
}
export const inWild = (areas, x, z, pad = 0) => !!wildAt(areas, x, z, pad);

// ------------------------------------------------------------------ the trail check (layoutGen)
function distToPolyline(pts, x, z) {
  let best = 1e18;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], vx = pts[i + 1][0] - ax, vz = pts[i + 1][1] - az;
    const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1), 0, 1);
    const dx = x - ax - vx * t, dz = z - az - vz * t; best = Math.min(best, dx * dx + dz * dz);
  }
  return pts.length === 1 ? Math.hypot(x - pts[0][0], z - pts[0][1]) : Math.sqrt(best);
}
/** What's wrong with an area against a plan's skeleton → [{ id, kind, d }] (empty: fine).
 *  kinds: 'trail' (closer than r + trailGap to the main trail: the hard rule), 'village', 'start', 'arena', 'poi',
 *  'wild' (another wild disc), 'edge' (the disc leaves the walkable map). */
export function areaIssues(a, plan, others = []) {
  const out = [], push = (kind, d) => out.push({ id: a.id, kind, d: +d.toFixed(2) });
  if (plan.trail?.length) { const d = distToPolyline(plan.trail, a.x, a.z) - a.r; if (d < WILD.trailGap) push('trail', d); }
  const gap = (o, pad) => Math.hypot(a.x - o.x, a.z - o.z) - a.r - o.r - pad;
  if (plan.village) { const d = gap(plan.village, 3); if (d < 0) push('village', d); }
  if (plan.start) { const d = gap(plan.start, 4); if (d < 0) push('start', d); }
  if (plan.arena) { const d = gap(plan.arena, 4); if (d < 0) push('arena', d); }
  for (const p of plan.pois || []) { const d = gap(p, 2); if (d < 0) push('poi', d); }
  for (const o of others) if (o !== a) { const d = gap(o, 6); if (d < 0) push('wild', d); }
  const e = Math.min(a.x, a.z, 112 - a.x, 112 - a.z) - a.r - 3; if (e < 0) push('edge', e);
  return out;
}
/** every area's issues against the plan → [{ id, kind, d }] */
export function wildIssues(plan, areas = plan.wild || []) { return areas.flatMap(a => areaIssues(a, plan, areas)); }

// ------------------------------------------------------------------ the spawn rule
const OVERRIDE = new Map(); // zone → true (force peaceful) | false (force besieged); session only (the debug menu)
/** the debug override for a zone: true / false, or null to follow the save */
export function setPeacefulOverride(zone, v) { if (v == null) OVERRIDE.delete(zone); else OVERRIDE.set(zone, !!v); return peacefulOverride(zone); }
export const peacefulOverride = zone => (OVERRIDE.has(zone) ? OVERRIDE.get(zone) : null);
/** does the zone spawn only its wild areas' packs? (its village saved the first time: COZY §6.1) */
export function isPeaceful(state, zone) {
  const o = peacefulOverride(zone); if (o != null) return o;
  return state?.zones?.[zone]?.village === 'saved';
}
/** the spawns a visit keeps (COZY §6.1): everything while besieged; once peaceful, only the packs inside a wild area
 *  (a spawn tagged `wild`), anything marked `keep` (a sighting), and a boss spawn (a zone whose boss still lives
 *  outdoors; a gated zone's boss is in its dungeon and installGate drops it anyway) */
export function peacefulFilter(state, zone, layout) {
  const all = layout?.spawns || [];
  if (!isPeaceful(state, zone)) return all.slice();
  return all.filter(sp => sp.wild || sp.keep || sp.boss);
}
/** a wild pack's rank from a roll in [0, 1) (hotter than a trail camp) */
export const wildRank = r => (r < WILD.ranks.unique ? 'unique' : r < WILD.ranks.unique + WILD.ranks.champion ? 'champion' : 'normal');
/** a wild monster's level: clamp(the highest hero's level + 2, the band's low + 2, the band's top + 1) */
export function wildLevel(levels, heroLvl = 1) {
  const lo = (levels?.[0] || 1) + WILD.lvlFloor, hi = (levels?.[1] || 1) + WILD.lvlUp;
  return Math.min(60, Math.max(lo, Math.min(hi, Math.round(heroLvl || 1) + WILD.lvlAbove)));
}
/** is a point outside an area's leash ring? */
export const pastLeash = (a, x, z) => Math.hypot(x - a.x, z - a.z) > a.r + WILD.leash;
