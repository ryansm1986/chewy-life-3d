// The Burrow's four dens: their save records, which are open, and the migration from the endless Burrow (docs/ZONES.md
// §4.1; ROADMAP Z-H1). Pure (no three.js, no DOM): node-tested in tools/test-rpg.mjs "BURROW DENS".
//
//   state.dungeon.dens[id] = { cleared, crew, bestFloor }
//     cleared    your own wins over the den's boss
//     crew       a crew's wins (the cozy path: docs/COZY.md §3.1); either opens the next den
//     bestFloor  the deepest floor reached (0, 1 or 2)
//   The Mossy Burrow is open from the start; each next den opens once the den before it is cleared (by you or a crew).
//
// Old saves (the endless Burrow, a boss every 5th floor: state.dungeon.deepest) migrate in migrateBurrowDens, once per
// load and idempotent (a max-merge that never takes progress away). A den counts as cleared only when its boss fell:
//   - deepest past its boss floor (≥ 6, 11, 16, 21): the old stairs off a boss floor only appeared where the boss fell,
//     so reaching the next floor proves it;
//   - or its story quest done (king, umbrella, oni, tails), or (the Moonlit Sanctum) the Deep Burrow's record showing
//     Tamamo's story clear: your win if you got to that boss floor and no crew's win left its unique owed to you
//     (state.quests.owed), else a crew's (the cozy path never set deepest);
//   - deepest at the boss floor itself (5, 10, 15, 20) is the den open with floor 2 reached, not cleared: the next den
//     stays sealed until you beat that boss; a den got into (deepest past the den before's boss floor) has floor 1.
// state.dungeon.deepest stays in the save as it was (nothing writes it any more), so the merge gives the same answer on
// every load. The story quests keep their own records (state.quests): their step indexes are unchanged.
import { DUNGEONS, DEN_IDS } from '../dungeon/defs.js';

const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const int = v => Math.max(0, Math.floor(+v || 0));
/** the old Burrow floor that held a den's boss (5, 10, 15, 20) */
export const OLD_BOSS_FLOOR = Object.fromEntries(DEN_IDS.map((id, k) => [id, 5 * (k + 1)]));

/** state.dungeon, made whole enough for the dens */
function dungeonOf(state) { return (state.dungeon = obj(state.dungeon) || { deepest: 0, waypoints: [1] }); }
/** a den's record, made whole (and created when new) → { cleared, crew, bestFloor } | null for an id that isn't a den */
export function denRecord(state, id) {
  if (!state || DUNGEONS[id]?.kind !== 'burrow') return null;
  const D = dungeonOf(state), all = (D.dens = obj(D.dens) || {});
  const r = all[id] = obj(all[id]) || {};
  r.cleared = int(r.cleared); r.crew = int(r.crew); r.bestFloor = Math.min(DUNGEONS[id].floors, int(r.bestFloor));
  if (r.cleared || r.crew) r.bestFloor = DUNGEONS[id].floors; // (a cleared den was walked to its end)
  return r;
}
/** has the den's boss fallen (to you or a crew)? */
export const denCleared = (state, id) => { const r = denRecord(state, id); return !!r && (r.cleared > 0 || r.crew > 0); };
/** the den before this one (null for the first) */
export const prevDen = id => { const i = DEN_IDS.indexOf(id); return i > 0 ? DEN_IDS[i - 1] : null; };
/** the den after this one (null for the last) */
export const nextDen = id => { const i = DEN_IDS.indexOf(id); return i >= 0 && i < DEN_IDS.length - 1 ? DEN_IDS[i + 1] : null; };
/** can you enter this den? The first always; each next one once the den before it is cleared */
export function denOpen(state, id) {
  if (!DEN_IDS.includes(id)) return false;
  const p = prevDen(id);
  return !p || denCleared(state, p);
}
/** the dens open now, in order */
export const openDens = state => DEN_IDS.filter(id => denOpen(state, id));
/** the deepest den open (the one a new player should head for once the one before is done) */
export const deepestOpenDen = state => openDens(state).slice(-1)[0] || DEN_IDS[0];
/** a floor of a den reached (DungeonMode.start) → its best floor */
export function noteDenFloor(state, id, floor) { const r = denRecord(state, id); if (!r) return 0; r.bestFloor = Math.min(DUNGEONS[id].floors, Math.max(r.bestFloor, int(floor))); return r.bestFloor; }
/** Your own win over a den's boss → { first (your first clear of it), cleared, opened: the den it opened | null } */
export function recordDenClear(state, id) {
  const r = denRecord(state, id); if (!r) return null;
  const was = denCleared(state, id), first = r.cleared === 0;
  r.cleared++; r.bestFloor = DUNGEONS[id].floors;
  const n = nextDen(id);
  return { first, cleared: r.cleared, opened: !was && n ? n : null };
}
/** A crew beat the den's boss (cozy/expeditionRun.js) → { crew, opened: the den it opened | null } */
export function recordDenCrewClear(state, id) {
  const r = denRecord(state, id); if (!r) return null;
  const was = denCleared(state, id);
  r.crew++; r.bestFloor = DUNGEONS[id].floors;
  const n = nextDen(id);
  return { crew: r.crew, opened: !was && n ? n : null };
}
/** what the door's picker and the errands read: one row per den → [{ id, open, cleared, crew, bestFloor }] */
export function denSummary(state) {
  return DEN_IDS.map(id => { const r = denRecord(state, id); return { id, open: denOpen(state, id), cleared: r.cleared, crew: r.crew, bestFloor: r.bestFloor }; });
}
/** How deep the old endless Burrow's floors would have been for this save's progress (an old floor number, 0–20): a
 *  cleared den counts its boss floor, a den you got into the floor under the boss before it. For anything that still
 *  thinks in old floors (a stray old quest step). */
export function legacyDepth(state) {
  let d = int(state?.dungeon?.deepest);
  DEN_IDS.forEach((id, k) => { const r = denRecord(state, id); if (!r) return; if (r.cleared || r.crew) d = Math.max(d, 5 * k + 5); else if (r.bestFloor >= 2) d = Math.max(d, 5 * k + 5); else if (r.bestFloor >= 1) d = Math.max(d, 5 * k + 1); });
  return d;
}

/** The migration from the endless Burrow (see the top of this file). Idempotent; normalizeZones runs it at every load
 *  (rpg/zones.js). → state */
export function migrateBurrowDens(state) {
  if (!obj(state)) return state;
  const D = dungeonOf(state), deepest = int(D.deepest), done = new Set(Array.isArray(state.quests?.done) ? state.quests.done : []), owed = obj(state.quests?.owed) || {};
  const deep = obj(D.deep), deepClear = !!deep && (int(deep.cleared) > 0 || int(deep.crew) > 0 || (Array.isArray(obj(deep.tier)?.cleared) && deep.tier.cleared.map(Number).includes(0))); // (the Deep Burrow's record: Tamamo's story clear)
  DEN_IDS.forEach((id, k) => {
    const r = denRecord(state, id), boss = OLD_BOSS_FLOOR[id], def = DUNGEONS[id];
    const won = (def.quest && done.has(def.quest)) || (k === DEN_IDS.length - 1 && deepClear); // (the boss fell: its quest, or Tamamo's Deep Burrow record)
    if (deepest > boss) r.cleared = Math.max(r.cleared, 1); // (past the boss floor: the stairs only came where the boss fell)
    else if (won && deepest >= boss && !owed[def.boss] && !(k === DEN_IDS.length - 1 && int(deep?.crew) > 0)) r.cleared = Math.max(r.cleared, 1); // (at its floor with the quest done: your own win)
    else if (won) r.crew = Math.max(r.crew, 1); // (the story done without getting that deep, or a crew's win still owed: the cozy path)
    if (deepest >= boss) r.bestFloor = Math.max(r.bestFloor, 2); // (the boss floor reached: the den's floor 2)
    else if (deepest > boss - 5) r.bestFloor = Math.max(r.bestFloor, 1);
    denRecord(state, id); // (bestFloor follows a clear)
  });
  return state;
}
