// The pinnacle, "The Four Seasons" (docs/ZONES.md §5.3 as built; ROADMAP Z-E4): the data and the floor's layout. Pure (no
// three.js): gen.js generate calls pinnacleLayout on a pinnacle run's boss floor, and tools/test-rpg.mjs checks it.
// On every 10th Spirit tier (rpg/tiers.js spiritInfo().pinnacle) the last boss of any tier dungeon is replaced by the four
// zone bosses in turn, one season each, in the floor's round arena; the fight itself is dungeon/pinnacle.js.
//   - a zone dungeon's floor 2 already ends in a round arena (zoneGen.js, r 17 m);
//   - the Deep Burrow's boss room (gen.js, a rounded 15 × 15-cell room, 30 m across) is its ring: L.arena = { x, z, r: 12.5 }
//     round its centre (world metres; under 15 m, so each boss fights it with its outdoor tuning), cleared of packs.

const CELL = 2; // (gen.js CELL)
/** the four seasons in order: each one's boss (its own fight, retuned in the ring: regions/bosses/*), colour and card */
export const SEASONS = [
  { key: 'spring', name: 'Spring', jp: '春', boss: 'tenguMaster', color: '#ffb0cc', glow: '#ffd6e6', sub: 'The mountain wind carries the first petals.' },
  { key: 'summer', name: 'Summer', jp: '夏', boss: 'umibozu', color: '#4ec8e0', glow: '#bff4ff', sub: 'The tide comes in, warm and enormous.' },
  { key: 'autumn', name: 'Autumn', jp: '秋', boss: 'danzaburo', color: '#ff9446', glow: '#ffd6a8', sub: 'The leaves turn, and so does a very round tanuki.' },
  { key: 'winter', name: 'Winter', jp: '冬', boss: 'yukiOnna', color: '#a8dcff', glow: '#eef8ff', sub: 'The snow falls, and the Frost Princess waits.' },
];
export const PINNACLE_BOSSES = SEASONS.map(s => s.boss);
/** each season's share of its boss's life (on top of the Spirit tier's life multiplier): four fights, one pinnacle */
export const SEASON_LIFE = [0.45, 0.45, 0.45, 0.6];
/** the pinnacle's own unique (rpg/items.js, tagged pinnacle): only from the Four Seasons' Lantern chest */
export const PINNACLE_UNIQUE = 'shikiLantern';
/** the Deep Burrow's ring: its half-width (cells) and the arena radius the fights read (metres) */
export const DEEP_RING = { cells: 7, r: 12.5 };

/** A pinnacle run's boss floor → the first season's boss, and a round arena where the floor has none. */
export function pinnacleLayout(L) {
  if (!L?.boss) return L;
  L.pinnacle = true; L.boss = SEASONS[0].boss;
  for (const s of L.spawns || []) if (s.boss) s.boss = L.boss;
  const b = L.bossRoom;
  if (!L.arena && b) { // (the Deep Burrow: its square boss room, cleared of the packs that stood in it)
    L.spawns = (L.spawns || []).filter(s => s.boss || Math.hypot(s.x - b.cx, s.y - b.cy) > DEEP_RING.cells + 2);
    L.arena = { x: (b.cx + 0.5) * CELL, z: (b.cy + 0.5) * CELL, r: DEEP_RING.r };
  }
  return L;
}
