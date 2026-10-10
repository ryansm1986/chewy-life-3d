// Quest step rules for the zones (docs/ZONES.md §3, §8; ROADMAP Z-A5). Pure (no three.js): node-tested in
// tools/test-rpg.mjs. story.js calls these from progress(), stepDone(), uiList() and target().
//
//   kill { n, monster?, zone?, dungeon?, floor?, tier? }  a kill counts when every filter given matches the event
//                                                         (monster:killed { id, rank, floor, zone, dungeon, tier })
//   boss { id?, dungeon?, zone? }                         that boss (and, if given, where it fell: boss:dead)
//   find { item, n?, dungeon?, zone?, floor? }            quest items picked up ('quest:find' { item, n, zone, dungeon, floor })
//   rescue { npc, dungeon?, zone?, floor? }               a captive freed ('villager:rescued' { npc, zone, dungeon, floor })
//   dungeonFloor { dungeon, n }                           reach floor n (the Burrow: state.dungeon.deepest; a zone
//                                                         dungeon: zones[zone].dungeon.bestFloor)
//   tier { dungeon, n }                                   clear that dungeon (a zone dungeon or the Deep Burrow) at tier n
//                                                         or higher
//   villageSaved { zone }                                 the zone's village is saved
//   reach { at, x, z, r?, floor?, label? }                walk to a spot (at: 'home' = Blossom Hollow, a zone id = its
//                                                         region, a dungeon id = that floor); polled by Story.reachTick.
//                                                         The pointer shows the spot in its world, the way there elsewhere
//                                                         (ROADMAP R-17: "Follow Shadow to …" steps, lead: true)
// The filters are optional: the old steps (an unfiltered kill, boss { id }) count exactly as before.
import { DUNGEONS } from '../dungeon/defs.js';
import { zoneOf, tierCleared, villageSaved } from '../rpg/zones.js';

export const ZONE_STEP_TYPES = ['find', 'rescue', 'dungeonFloor', 'tier', 'villageSaved'];
/** how near (m) the hero must come to a reach step's spot */
export const REACH_R = 2.6;

/** do the step's where-filters (zone / dungeon / floor / tier) all match the event? */
export function matchesWhere(s, e = {}) {
  return (!s.zone || e.zone === s.zone) && (!s.dungeon || e.dungeon === s.dungeon) && (s.floor == null || e.floor === s.floor) && (!s.tier || (e.tier || 0) >= s.tier);
}
/** How a bus event moves the current step: a number to add to q.prog, 'set' to complete it, 0 for no change.
 *  kind: 'kill' (monster:killed) | 'boss' (boss:dead) | 'find' (quest:find) | 'rescue' (villager:rescued) */
export function stepGain(s, kind, e = {}) {
  if (!s) return 0;
  if (kind === 'kill') return s.type === 'kill' && (!s.monster || s.monster === e.id) && matchesWhere(s, e) ? 1 : 0;
  if (kind === 'boss') return s.type === 'boss' && (!s.id || s.id === e.id) && (s.id || s.dungeon || s.zone) && (!s.dungeon || s.dungeon === e.dungeon) && (!s.zone || s.zone === e.zone) ? 'set' : 0;
  if (kind === 'find') return s.type === 'find' && s.item === e.item && matchesWhere(s, e) ? Math.max(1, e.n || 1) : 0;
  if (kind === 'rescue') return s.type === 'rescue' && (!s.npc || s.npc === e.npc) && matchesWhere(s, e) ? 'set' : 0;
  return 0;
}
/** the deepest floor reached in a dungeon */
export function bestFloorOf(state, id) {
  const def = DUNGEONS[id];
  if (!def || def.kind === 'burrow') return state.dungeon?.deepest || 0;
  return def.zone ? zoneOf(state, def.zone).dungeon.bestFloor : 0;
}
/** the state-derived steps: done? (null: not one of them) */
export function zoneStepDone(s, state) {
  if (s.type === 'dungeonFloor') return bestFloorOf(state, s.dungeon) >= (s.n || 1);
  if (s.type === 'tier') { const id = s.dungeon || s.zone; return !!id && tierCleared(state, id, s.n || 1); } // (a zone dungeon or the Deep Burrow; a Spirit clear counts as T5)
  if (s.type === 'villageSaved') return !!s.zone && villageSaved(state, s.zone);
  return null;
}
/** the tracker's "have" for those steps (null: not one of them) */
export function zoneStepHave(s, state) {
  if (s.type === 'dungeonFloor') return Math.min(s.n || 1, bestFloorOf(state, s.dungeon));
  if (s.type === 'tier' || s.type === 'villageSaved') return zoneStepDone(s, state) ? (s.n || 1) : 0;
  return null;
}
/** Where a step's objective is: { dungeon?, zone?, floor?, boss?, village? } — what the quest pointer heads for (the zone's
 *  gate, the stairs to a floor, the boss…) — or null when it isn't somewhere you travel to. Unfiltered kills, floors and
 *  bosses and the Mochi Jelly are the Burrow's, as before. */
export function destOf(s) {
  if (!s) return null;
  const inD = (id, extra = {}) => { const d = DUNGEONS[id]; return d ? { dungeon: d.id, zone: d.zone || null, ...extra } : null; };
  const last = id => (Number.isFinite(DUNGEONS[id]?.floors) ? DUNGEONS[id].floors : null);
  switch (s.type) {
    case 'kill': return s.dungeon ? inD(s.dungeon, { floor: s.floor ?? null }) : s.zone ? { zone: s.zone } : { dungeon: 'burrow', zone: null };
    case 'floor': return { dungeon: 'burrow', zone: null, floor: s.n };
    case 'boss': return s.dungeon ? inD(s.dungeon, { floor: last(s.dungeon), boss: true }) : s.zone ? { zone: s.zone, boss: true } : { dungeon: 'burrow', zone: null, boss: true };
    case 'collect': return s.mat === 'mochi' ? { dungeon: 'burrow', zone: null } : null;
    case 'find': case 'rescue': return s.dungeon ? inD(s.dungeon, { floor: s.floor ?? null, mark: true }) : s.zone ? { zone: s.zone, mark: true } : null;
    case 'dungeonFloor': return inD(s.dungeon, { floor: s.n || 1 });
    case 'tier': return inD(s.dungeon, { floor: last(s.dungeon), boss: true });
    case 'villageSaved': return s.zone ? { zone: s.zone, village: true } : null;
    case 'reach': return !s.at || s.at === 'home' ? { home: true, reach: true } : DUNGEONS[s.at] ? inD(s.at, { floor: s.floor ?? 1, reach: true }) : { zone: s.at, reach: true };
    default: return null;
  }
}
/** is a reach step's spot in this world? w = { home: in Blossom Hollow, zone, dungeon (a floor's dungeon id, null in a
 *  region), floor } (Story.whereNow) */
export function reachIsHere(s, w) {
  if (!s || s.type !== 'reach' || !w) return false;
  if (!s.at || s.at === 'home') return !!w.home;
  if (DUNGEONS[s.at]) return w.dungeon === s.at && (w.floor ?? 1) === (s.floor ?? 1);
  return !w.dungeon && w.zone === s.at;
}
