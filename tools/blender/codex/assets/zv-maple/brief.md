# Brief: zv-maple: Akane Hamlet (the maple village)'s buildings in Blender

## Why
Akane Hamlet (the maple village) now has Blender villagers, a Blender Waypoint Shrine, set pieces and a Blender dungeon gate, but its buildings are still the kit. Rebuild them at the game's 9/10 bar so the village matches its people.

| GLB (`public/models/`) | Kit function in `artMaple.js` |
|---|---|
| `zv-maple-elder.glb` | `elder` |
| `zv-maple-inn.glb` | `inn` |
| `zv-maple-shop.glb` | `shop` |
| `zv-maple-teaHouse.glb` | `teaHouse` |
| `zv-maple-gate.glb` | `gate` |
| `zv-maple-lanternPost.glb` | `lanternPost` |

(`gate` is the village entrance gate from `gate(B, ...)`; `lanternPost` from `lanternPost(B)`.)

## Technique templates (finished, in the game)
- `D:/projects/chewy-life-3d/tools/blender/codex/assets/landmarks-hollow/` (buildings at the 9/10 bar: roof maths ported
  from `src/world/buildings/roofs.js`, tile courses, chamfered timber, painted shading, buried skirt, `window_glow`),
  `village-pieces/` (this zone's Waypoint Shrine and set pieces), `dungeon-gates/` (this zone's dungeon gate: match its
  palette and finish so the zone reads as one place). Reuse their kit code freely. `refs/style-C-*.png` are the owner's
  style picks.
- **Read the kit first** (read-only): `src/regions/village/artMaple.js` (each building's function: its walls, roof, sign,
  trims, its `info` with the footprint `fp`, the `door`, the `lamps` and a `saved()` overlay), `src/regions/village/art.js`
  (shared helpers) and the zone's entry in `src/regions/village/data.js` (VILLAGES.maple: which buildings stand where).
- **Look at it in the game**: `SHOT_DIR=<TASK_DIR>/refs node tools/qa/village-shots.mjs --zone maple --both` shoots the
  village besieged and saved from both game yaws, plus close views of every building (the dev server is on port 5173).
- Keep each building's design, footprint (`fp`), door, lamp positions (the game lights the kit's `lamps` points) and its
  front (+z in the kit's local frame = Blender -Y).
- **The saved dressing**: what the kit's `saved()` overlay adds when the village is saved (banners, flowers, lanterns lit)
  goes in a separate object named `saved` in the same GLB (the game shows it only when the village is saved). Anything
  the kit shows only while besieged, the same in an object named `siege`.

## Technical
- 1 unit = 1 m, ground z = 0 at the building's local origin, front = Blender -Y. A buried skirt to -0.3.
- Vertex colours (`Col`) with painted shading. Materials: `body`, `window_glow` (windows, lanterns: the game drives the
  night glow), `water` if a building has water.
- **No text**: emblems instead of words (the owner's rule: no Japanese text; a symbol on a noren is fine).
- <= 15,000 triangles per building (the elder's house and the inn up to 18,000), <= 4,000 for the gate and lantern post.
- Smooth normals, closed shells. Deterministic `build_<TASK>.py --piece <name|all>`.

## Deliverables
- The GLBs in `D:/projects/chewy-life-3d/public/models/` named `zv-maple-<kind>.glb`.
- `preview/<piece>-gamecam.png` (45 deg down at about 22 m and 12 m, +/-45 deg yaws, a 1 m capsule) and
  `preview/<piece>-kitcmp.png`.
- A report: per GLB the triangles, size, footprint / door / lamps against the kit's info, and what went into `saved`/`siege`.

**Round 1: `zv-maple-elder.glb` and `zv-maple-shop.glb`.** Then report and stop.
