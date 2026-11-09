# Brief: homestead-props: the crops, fish, tools, campfire camp and Seed Stall in Blender

## Why
Farming, fishing and cooking (docs/HOMESTEAD.md) are things players do by hand, close to the camera, and their models are still the
procedural kit. Rebuild them at the game's 9/10 bar in the owner's chunky toy style.

## How the game uses your GLBs (read this first)
Read `src/life/gardenModels.js`, `fishModels.js`, `kitchenModels.js` (read-only). Each now looks for a Blender model first:

| GLB (`public/models/`) | Replaces | Rules |
|---|---|---|
| `prop-crop-<crop>-young.glb`, `prop-crop-<crop>-ripe.glb` for turnip, carrot, cabbage, daikon, strawberry, rice, pumpkin, melon | `cropGeo(crop, 'young' or 'ripe')` | parts by material: `body` and `leaf` only; origin on the tile centre at the soil top (y = 0), inside the tile's +/-0.5; <= 900 triangles (a bed holds many). The ripe look must read as harvestable at a glance. Seed and sprout stay the kit's. |
| `prop-fish-<id>.glb` for every id in `FISH_IDS` (`src/life/fishing.js` or `pantry.js`; grep it) | `fishGeo(id)` | head toward +z, about 0.5 m long; <= 1,500 triangles; each species distinct, including the octopus, pufferfish and flounder |
| `prop-rod-1.glb`, `prop-rod-2.glb` | `rodGeo(tier)` | grip at the origin, rod along +z, **tip exactly at `ROD_TIP` (0, 0, 1.08)**: the line attaches there. Rod 2 is the Moonlit Rod. <= 1,000 triangles |
| `prop-tool-hoe.glb`, `prop-tool-seedBag.glb` | `hoeGeo()`, `seedBagGeo()` | the same frame as the kit's, so the hero's hand still fits; <= 800 triangles |
| `prop-campfire.glb` | `campfireGeo()` | stone ring, log teepee, tripod and pot, log seat, crate. **`flameGeos()` stays the kit's**, so keep room for the flames where the kit has them. <= 6,000 triangles. Seen at every Burrow and region arrival |
| `poi-seedStall-0.glb` | `seedStallTemplate()` | stands in for the template (`glbStandIn`): front +z, base at the origin, about 2.6 x 1.6 x 2.4 m. Keep the template's door and footprint. Materials `body`, `leaf`, `cloth`, `window_glow`. <= 9,000 triangles. List it in `src/world/poiGlb.js` as `seedStall: [0]` |

Except the crops and the stall, your parts are merged into one geometry and drawn with the kit's material, so all the look comes from
vertex colours. Same size and frame as the kit: dump it for reference. Review pages: `http://localhost:5173/?test=homesteadCrops`
(crops, fish, rods, the stall) and `node tools/qa/homestead-perf.mjs`; the QA suite `tools/qa/s15-homestead.mjs` must still pass.

## Exporter rule (it cost two dungeons a rebuild)
The glTF exporter flips UV V. Anything the game reads from UVs (glow flicker and tint, cloth sway) must be written as
`(u, 1 - v)`. Use the fixed exporter in `D:/projects/chewy-life-3d/tools/blender/work/codex/dg-onsen/` (`dg_common.py`,
`glbinfo.py` reads a GLB back). Read your glow and cloth UVs back and check them.

## Technique templates (finished, in the game, the owner's chunky toy-diorama style)
`D:/projects/chewy-life-3d/tools/blender/codex/assets/`: hollow-craft/, hollow-decor/, furn-*/, zv-bamboo/. Reuse their kit code. `refs/style-C-*.png` are the owner's
picks. Moss and snow: 40-55% cover, irregular rounded edges, light tops, darker undersides, never flat neon pancakes. Stones
have some cut planes, not only smooth eggs. Leaves as cards and clusters, never a smooth blob. Chunky: nothing thinner than
about 3 cm. **No text anywhere** (emblems instead; the owner's rule: no Japanese text).

## Technical
- 1 unit = 1 m, vertex colours (`Col`) with painted shading, smooth normals, no NaNs or zero-area faces.
- Deterministic `build_homestead-props.py --piece <name|all>`.
- Judge colours **in the game**, not in Blender: dungeon and evening light shift them, and moss has come out neon before.

## Registering, and the only `src/` edit allowed
Add each finished key to the `PROP_GLB` array in `src/world/treeGlb.js`, for example `'campfire'`.
That file is shared with other builders: re-read it before every edit and make small Edit-tool changes that touch only your
entries. Then run `node tools/test-rpg.mjs` from `D:/projects/chewy-life-3d`: it asserts that every listed GLB exists.

## Deliverables
The GLBs, `preview/<name>-gamecam.png` (45 deg down at about 18 m and 10 m, both 45 deg yaws, beside the kit version) and
in-game shots at the game camera. End with a report: per GLB the triangles, size and origin against the kit's, the materials,
and known issues. **Do all of it in one round** (one piece fully first, then the rest). Then stop.
