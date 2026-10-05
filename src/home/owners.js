// Saved home owners (docs/HOUSING.md §1): each named villager owns one building (b.owner = 'kuma'), assigned once and
// kept in the save, so their interiors persist. Old saves get their owners the first time they load (assignOwners only
// fills in villagers who own nothing, so it is the migration too). Pure: node-tested in tools/test-rpg.mjs.
//
// Kuma bakes in his shop (a 'shop' on Market Street) and lives there; everyone else gets the nearest free home to their
// anchor (their district in the town plan). Rosie keeps her shop and Moka shares Chewy's cottage.
export const CAST = ['mochi', 'usagi', 'kuma', 'kitsune', 'pan', 'tanu', 'kero'];
export const OWNER_TYPES = { kuma: ['shop', 'home'] };
/** building types a villager's home can be (and so the types that have villager interiors) */
export const HOME_TYPES = ['home', 'shop'];

const centre = b => ({ x: b.x + 1, z: b.z + 1 });

/** Give each cast member without a home the nearest free building of their preferred type (a stable order: the cast
 *  in CAST order, ties by building id). buildings: the village's data records (mutated: b.owner); anchors: { id: {x, z} }.
 *  → [{ id, building }] for the ones assigned now. */
export function assignOwners(buildings, anchors, cast = CAST) {
  const owned = new Map(), out = [];
  for (const b of buildings) if (b.owner) { if (cast.includes(b.owner) && !owned.has(b.owner)) owned.set(b.owner, b); else delete b.owner; } // (one home each)
  for (const id of cast) {
    if (owned.has(id)) continue;
    const a = anchors[id]; if (!a) continue;
    for (const type of OWNER_TYPES[id] || ['home']) {
      let best = null, bd = Infinity;
      for (const b of buildings) {
        if (b.type !== type || b.owner) continue;
        const c = centre(b), d = Math.hypot(c.x - a.x, c.z - a.z);
        if (d < bd - 1e-6 || (Math.abs(d - bd) < 1e-6 && String(b.id) < String(best.id))) { bd = d; best = b; }
      }
      if (best && (type === 'home' || bd < 26)) { best.owner = id; owned.set(id, best); out.push({ id, building: best }); break; }
    }
  }
  return out;
}
/** the building data record a villager owns, or null */
export const homeOf = (buildings, id) => buildings.find(b => b.owner === id) || null;
