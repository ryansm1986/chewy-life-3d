# Brief: plaza-pieces: Blossom Hollow's plaza centrepieces in Blender

## Why
Four placeable village pieces sit at the heart of Blossom Hollow and are kit-built (`src/world/buildings/models.js` and
`decor.js`). Rebuild each at the game's 9/10 bar in the owner's chunky toy-diorama style (`refs/style-C-owner-pick-*.png`).

**Technique templates**:
- `D:/projects/chewy-life-3d/tools/blender/codex/assets/village-pieces/` (the Waypoint Shrine, the shishi-odoshi);
- `dungeon-gates/` (boulders, moss icing, the torii);
- `guild-model/` (roofs).

| GLB (`public/models/`) | Catalog id | Footprint | Notes |
|---|---|---|---|
| `fountain.glb` | `fountain` | 2 × 2 | the plaza's tiered fountain. The water surfaces are a separate object `water` (a material named `water_glow` is fine for a soft sheen). Keep the kit's jet position (the game draws its own jets and spray) |
| `chewyStatue.glb` | `chewyStatue` | 2 × 2 | Chewy the dog hero as a stone statue on a plinth. Use the Toybox Chewy's proportions (`tools/blender/codex/assets/chewy-b/sheet-B.png`): chunky, stone-grey with soft moss, a gold plaque with a paw emblem |
| `burrowGate.glb` | `dungeonGate` | 4 × 4 | the entrance to the Burrow dungeon: today a lumpy boulder mound with a torii and a purple portal. Rebuild it as a proper mossy burrow mouth in the dungeon gates' style (`assets/dungeon-gates/`, the bamboo gate): candy-smooth boulders with moss icing round a dark round hole, the vermilion torii, stone lanterns, little flowers. Keep the kit's mouth position and size (the game draws the purple portal in it) |
| `villageShrine.glb` | `shrine` | 3 × 3 | the village shrine: the green-roofed hall, its torii, the lanterns and bamboo |

**Read each kit model first** (read-only) in `models.js` and `catalog.js`. Keep each design, its footprint, its door or
interaction spot and its front. `refs/kit-<id>-a.png` and `-b.png` are the kit versions at the game camera.

## Technical
- 1 unit = 1 m. Front = Blender −Y (game +z). Ground z = 0, centred on the kit footprint's origin. A buried skirt to −0.3
  for grounded masses.
- Vertex colours (a `Col` attribute) with painted shading. Materials: `body`, plus `window_glow` for lanterns and windows.
- No text.
- ≤ 6,000 triangles each (the Burrow gate and the shrine up to 12,000).
- Deterministic `build_plaza-pieces.py --piece <name|all>`.

## Deliverables
- The GLBs.
- `preview/<piece>-gamecam.png` (45° down, ±45° yaws, a 1 m capsule).
- `preview/<piece>-kitcmp.png`.
- A report: triangles, sizes, the footprint and spots against the kit's.

**Round 1: `burrowGate.glb` and `fountain.glb`.** Then report and stop.
