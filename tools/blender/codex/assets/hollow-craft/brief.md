# Brief: hollow-craft: Blossom Hollow's craft buildings in Blender

## Why
Four craft buildings the player builds in Blossom Hollow, each with two levels, are kit-built. Rebuild each at the game's 9/10 bar in the owner's chunky toy-diorama style, matching the Blender landmarks already standing in the same village.

| GLB(s) (`public/models/`) | Catalog id | Footprint | Notes |
|---|---|---|---|
| `farm-1.glb, farm-2.glb` | `farm (2 levels)` | 3 x 3 | the farmhouse and its plots; level 2 grows as the kit does |
| `lumber-1.glb, lumber-2.glb` | `lumber (2 levels)` | 3 x 3 | the lumber yard: log piles, saw, shed |
| `kiln-1.glb, kiln-2.glb` | `kiln (2 levels)` | 3 x 3 | the pottery kiln: the fire mouth glows (keep the kit's fire layer live) |
| `fishingHut-1.glb, fishingHut-2.glb` | `fishingHut (2 levels)` | 2 x 3 | the fishing hut on its little jetty |

<= 12,000 triangles per GLB.

## Technique templates (finished, in the game, the owner's chunky toy-diorama style)
- `D:/projects/chewy-life-3d/tools/blender/codex/assets/landmarks-hollow/` (the Town Hall, Rosie's Shop, Chewy's House,
  the Bone Smith: roof maths ported from `src/world/buildings/roofs.js`, crisp tile courses, chamfered timber, painted
  shading, the buried skirt, `window_glow`), `guild-model/`, `plaza-pieces/`, `village-pieces/`, `dungeon-gates/`.
  Reuse their kit code freely. `refs/style-C-*.png` are the owner's style picks.
- **Read each kit model first** (read-only): `src/world/buildings/models.js` (`MODELS.<id>`) and the module it calls
  (`workshops.js` for farm / lumber / kiln / fishingHut, `services.js`, `decor.js`, `special.js` for the bulletin board,
  `stashChest.js`, `src/life/gardenModels.js` for the sprinkler), plus `catalog.js` for the footprint. Keep each design, its footprint, its
  door (the template's `B.door`), its lights (`B.light(...)` positions: the game keeps the kit's lights, so lanterns and
  windows must sit where the kit's do) and its front. Dump the kit for reference with
  `node tools/blender/work/codex/landmarks-hollow/kitdump/dump_kit.mjs <id>:<level>` (copy it into your folder and adjust
  its DETAIL table if needed), and look at the kit in the game: `http://localhost:5173/?test=buildings&kit`.
- **Animated or live parts stay the game's**: the kit tags them with materials/layers such as `hot` (fire glow), `anim`
  (spinning or swinging parts), `jet` (water jets), `water`. Leave those out of the GLB and list in your report which
  kit layers the game should keep for each model (the catalog's `glbKeep`), e.g. a kiln's fire or a sprinkler's jet.
  Smoke comes from the kit template's emitters.

## Technical
- 1 unit = 1 m. Front = Blender -Y (game +z, the door side). Ground z = 0, centred on the kit footprint's origin. A buried
  skirt to -0.3 for grounded masses.
- Vertex colours (a `Col` attribute) with painted shading and AO-like darkening. Materials: `body`, plus `window_glow` for
  windows, lanterns and fire mouths (the game drives the night glow), and `water` for water surfaces.
- **No text** anywhere: emblems instead of words.
- Smooth normals, closed shells. Deterministic `build_<TASK>.py --piece <name|all>`.

## Deliverables
- The GLBs in `D:/projects/chewy-life-3d/public/models/`.
- `preview/<piece>-gamecam.png` (45 deg down at about 22 m and 12 m, +/-45 deg yaws, a 1 m capsule for scale) and
  `preview/<piece>-kitcmp.png` beside the kit at the same camera.
- A report: per GLB the triangles, size, footprint and door against the kit's, and the `glbKeep` layers it needs.

**Round 1: `farm-1.glb` and `kiln-1.glb`.** Then report and stop.
