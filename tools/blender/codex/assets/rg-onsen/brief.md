# Brief: rg-onsen: the Onsen Highlands (the snowy region)'s landmark props in Blender

## Why
The outdoor regions are where the game is played, and their signature props are still the kit. Rebuild each at the game's 9/10 bar in the owner's chunky toy-diorama style, to match the Blender dungeon gates, villages and monsters around them.

| GLB (`public/models/`) | Kit function | Notes |
|---|---|---|
| `rg-onsen-yukimiLantern.glb` | `yukimiLantern` | the yukimi lantern (scaled by `{ s }` per spot: build at s = 1) |
| `rg-onsen-inn.glb` | `inn` | the mountain inn |
| `rg-onsen-bathhouse.glb` | `bathhouse` | the bathhouse (no text: the hot-spring symbol as an emblem, as zv-onsen did) |
| `rg-onsen-signpost.glb` | `signpost` | the trail signpost (no text: arrows and emblems) |
| `rg-onsen-bench.glb` | `bench` | the bench (seeds 0 and 1: one design) |
| `rg-onsen-oke.glb` | `oke` | the wooden bath bucket stack |
| `rg-onsen-campRest.glb` | `campRest` | the travellers' rest spot |

## How the game uses your GLBs (read this first)
Each outdoor region builds its props with the kit functions in `src/regions/assets/onsenProps.js` (read-only): `Pr.<name>(seed, opts)` returns a
**piece**: the kit Builder's finished geometry per material (`body`, `glow`, `leaf`, `cloth`, `water`, `stone`) plus
`lights`, which the region's Placer (`src/regions/assets/bambooKit.js` `Placer.piece`) merges into its instanced batches.
The game will swap a piece's **geometry only** for your GLB's meshes, sorted into the same material buckets by your
**material names** (`body`, `glow`, `leaf`, `cloth`, `water`, `stone`). It keeps the kit piece's lights, colliders and
every other field, and places it exactly where the kit piece goes. So:
- **Build each prop in the kit piece's own local frame**: the same origin, the same facing, the same ground level, the
  same size. Read the kit function, and dump its geometry for reference: a small node script can import the props module,
  call `Pr.<name>(seed, opts)` with the biome's arguments (see `src/regions/biomes/onsen.js`) and write each geometry to OBJ (the landmarks'
  `tools/blender/work/codex/landmarks-hollow/kitdump/dump_kit.mjs` shows how to write OBJ with vertex colours).
- **Lights**: lanterns and windows must glow where the kit's `lights` sit (material `glow`).
- **Look at the kit in the game**: `node tools/qa/region-tour.mjs` if it fits, or a small script with `tools/qa/lib.mjs`
  that boots `?fresh&nointro`, unlocks the region and calls `G.enterRegion('onsen')`, then frames each prop at the game
  camera (pitch about 35 deg, the region's yaw). The dev server is on port 5173.

## Technique templates (finished, in the game, the owner's chunky toy-diorama style)
`D:/projects/chewy-life-3d/tools/blender/codex/assets/` (`dungeon-gates/ (gate-onsen), village-pieces/ (the ashiyu), zv-onsen/ (the snow on the onsen village buildings: reuse its snow kit)`), `landmarks-hollow/`, and the region-matched village
builders in `D:/projects/chewy-life-3d/tools/blender/work/codex/zv-*`. Reuse their kit code. Moss / snow icing: 40-55%
cover, irregular rounded drips, light tops, darker drip undersides, never flat neon pancakes. Plants and trees: leaves as
cards and clusters, never a smooth blob (the owner rejected blob trees). `refs/style-C-*.png` are the owner's style picks.

## Technical
- 1 unit = 1 m. Vertex colours (a `Col` attribute) with painted shading. Material names as above.
- **No text** anywhere (emblems instead).
- <= 6,000 triangles per prop (the inn, bathhouse, wreck, grotto mouth and arena gate up to 12,000; small props like
  lanterns, benches, buckets <= 2,500): these merge into batches drawn across a big region.
- Deterministic `build_<TASK>.py --piece <name|all>` writing `D:/projects/chewy-life-3d/public/models/rg-onsen-<name>.glb`.

## Deliverables
- The GLBs `public/models/rg-onsen-<name>.glb`.
- `preview/<name>-gamecam.png` (45 deg and 35 deg down at about 18 m and 10 m, +/-45 deg yaws, a 1 m capsule) and
  `preview/<name>-kitcmp.png` beside the kit dump at the same camera.
- A report: per prop the triangles, size and origin against the kit piece's, and the materials used.

**Round 1: `rg-onsen-yukimiLantern.glb`, `rg-onsen-inn.glb`.** Then report and stop.
