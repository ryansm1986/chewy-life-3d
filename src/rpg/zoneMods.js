// Zone modifiers (docs/ZONES.md §5, §8; ROADMAP Z-E2): the player-picked run modifiers for tier runs (Swarming, Stout,
// Haunted…). Phase A only leaves the hook points: DungeonMode calls these where a modifier will act, and every one is a
// no-op until phase E fills ZONE_MODS and the bodies. A run's picked mods are run.mods (dungeon/defs.js beginRun),
// mirrored on the mode as mode.mods.
export const ZONE_MODS = {}; // id → { name, desc, reward: { qty, rarity, xp }, pack?(sp, mode), monster?(m, mode), flags? }

/** DungeonMode.spawnPack, before a pack spawns: its count, size and rank → the spawn record to use (the same one now) */
export function packMods(mode, sp) { return sp; }
/** right after a run's monster is built (bosses and boss adds too): stat multipliers and applied mods (nothing now) */
export function monsterMods(mode, m) { return m; }
