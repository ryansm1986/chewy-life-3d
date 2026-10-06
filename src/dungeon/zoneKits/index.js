// Zone dungeon kits (docs/ZONES.md §4, §8.2; ROADMAP Z-C1): the look of each zone dungeon. A kit is registered here by
// its theme key (gen.js THEMES[theme].kit, dungeon/zoneKits/themes.js) and DungeonWorld / roomDressing hand their
// per-biome builders to it (the small `this.kit` hooks there). The Burrow's own kits (burrow / shrine / kitchen /
// crystal) stay inside dungeonWorld.js.
//
// A kit = {
//   floorGLSL, floorPars?, floorUniforms?(W), bossGLSL?   the floor shader's theme block (FLOOR_THEME's inputs: p, m, wd,
//                                                         rid, ori, nA, nB, dc, c, fG) and the arena sigil block
//   profile(h, D, j), roles, wallH, ds?, brush?, flat?, jitter?(s, j), wallGLSL   the wall ribbon (dungeonWorld PROFILES)
//   deco { lush, crack, acc, path }, decoMap?(W, { disc, curve, cellsOf }), sig, cap
//   init?(W), dressWalls(W, addLight), buildProps(W), buildLights(W), buildCenterpieces(W), buildArena(W),
//   buildLandmarks?(W), buildDressing(W), finish?(W) → extra meshes, update?(W, dt, t, vfx, focus), dispose?(W)
//   purposes, dupes, rooms { [purpose](D, A) }, extras?(D, A), arrival?(D, A), hoard?(D, A), corridor?(D, x, z, face, q)
// }
import { BAMBOO_KIT } from './bamboo.js';
import { MAPLE_KIT } from './maple.js';
import { TIDEPOOL_KIT } from './tidepool.js';
import { ONSEN_KIT } from './onsen.js';

export const ZONE_KITS = { bambooCave: BAMBOO_KIT, mapleHalls: MAPLE_KIT, seaCave: TIDEPOOL_KIT, iceCavern: ONSEN_KIT };
/** the kit for a DungeonWorld theme kit key, or null (the Burrow's built-in kits) */
export const zoneKit = th => ZONE_KITS[th] || null;
