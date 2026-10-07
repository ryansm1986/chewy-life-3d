// Region monsters + bosses registry (docs/REGIONS.md §3.4): merges every region module's definitions into the Burrow's
// tables — MONSTERS / BUILD (monsters.js), KIND_MAP (monster.js), MONSTER_KINDS (stats), KIND_MATERIAL (loot).
// Imported by src/regions/regionMode.js (and the monster test page) before any region monster is built.
import { registerMonsters } from '../../dungeon/monsters.js';
import { KIND_MAP } from '../../dungeon/monster.js';
import { MONSTER_KINDS } from '../../rpg/stats.js';
import { KIND_MATERIAL } from '../../rpg/loot.js';
import * as bamboo from './bamboo.js';
import * as maple from './maple.js';
import * as tidepool from './tidepool.js';
import * as onsen from './onsen.js';
import * as tengu from '../bosses/tengu.js';
import * as tanuki from '../bosses/tanuki.js';
import * as umibozu from '../bosses/umibozu.js';
import * as yukionna from '../bosses/yukionna.js';
import * as zoneBamboo from '../../dungeon/zoneMonsters/bamboo.js'; // (dungeon-only monsters: docs/ZONES.md §8.2)
import * as zoneMaple from '../../dungeon/zoneMonsters/maple.js';
import * as zoneTide from '../../dungeon/zoneMonsters/tidepool.js';
import * as zoneOnsen from '../../dungeon/zoneMonsters/onsen.js';
import * as zoneSpirit from '../../dungeon/zoneMonsters/spirit.js'; // (the Haunted modifier's ghost: docs/ZONES.md §5.1)

export const REGION_MONSTER_MODULES = { bamboo, maple, tidepool, onsen, tengu, tanuki, umibozu, yukionna, zoneBamboo, zoneMaple, zoneTide, zoneOnsen, zoneSpirit };
for (const mod of Object.values(REGION_MONSTER_MODULES)) {
  registerMonsters(mod.MONSTERS, mod.BUILD);
  for (const [id, def] of Object.entries(mod.MONSTERS || {})) {
    const kind = def.kind || id;
    KIND_MAP[id] = kind;
    if (def.stats && !MONSTER_KINDS[kind]) MONSTER_KINDS[kind] = def.stats;
    if (def.material && !KIND_MATERIAL[kind]) KIND_MATERIAL[kind] = def.material;
  }
}
/** ids of the region monsters that exist right now (the others fall back to Burrow placeholders) */
export const regionMonsterIds = () => Object.values(REGION_MONSTER_MODULES).flatMap(m => Object.keys(m.MONSTERS || {}));
