# Brief: dg-tidepool: the Sea Cave (the tidepool zone dungeon, `seaCave`)'s set pieces in Blender

## Why
The owner picked the dungeon rooms for the Blender pass (2026-11-04). The rooms' gates, monsters and the region props they borrow are already Blender models; the kit's own set pieces are the last procedural props in them. Rebuild each at the game's 9/10 bar in the owner's chunky toy-diorama style.

| GLB(s) (`public/models/`) | Kit function | Notes |
|---|---|---|
| `dg-tidepool-umiHokora.glb` | `umiHokora` | the sea shrine: offering shelf, a glass float hung from the eave (`glow`), a round little stone fisherman god with his rod |
| `dg-tidepool-crabHusk.glb` | `crabHusk` | an empty giant crab shell on the sand with a scowling face pattern on its back, two claws |
| `dg-tidepool-brazier.glb` | `brazier` | a weathered brazier on three stones (its fire: material `hot`, as the kit's) |
| `dg-tidepool-weddedPair.glb` | `weddedPair` | two barnacled basalt stacks tied by a great rope with paper streamers (local x span) |
| `dg-tidepool-planks.glb` | `planks` | a lattice of salvaged planks on the sand (local x along the boards) |
| `dg-tidepool-netPile.glb` | `netPile` | a heap of net with floats, a crate, two buoys, a bucket and a coil of rope (local -z = the wall; the kit has `glow` and `water`) |

## How the game uses your GLBs (read this first)
The zone dungeon's rooms are dressed by the kit `src/dungeon/zoneKits/tidepool.js` (read-only). Its own set pieces (the
functions listed above) each return a **piece**: the kit Builder's geometry per material (`body`, `glow`, `leaf`,
`cloth`, `water`, `stone`, `hot`) plus `lights`, which the dungeon's Placer merges into instanced batches. Each is now
wrapped with `glbFn('dg-tidepool', name, kitFn)` (`src/regions/assets/glbPieces.js`): once the coordinator lists your GLB,
the game swaps the piece's **geometry only** for your model's meshes, sorted into the same buckets by your **material
names**, and keeps the kit piece's lights and every other field, placed exactly where the kit piece goes. For pieces with
2 variants, the game picks `-v0` / `-v1` by the piece's seed (seed % 2). So:
- **Build each piece in the kit piece's own local frame**: the same origin, facing, ground level and size.
- **Dump the kit pieces for reference**: the unwrapped kit functions are exported as `KIT_PIECES` from
  `src/dungeon/zoneKits/tidepool.js`. In node, **import `src/dungeon/zoneKits/index.js` first** (the kits import each other
  through it; importing a kit file directly fails on a cycle), then call `KIT_PIECES.<name>(seed)` and write each
  geometry to OBJ with vertex colours (`tools/blender/work/codex/landmarks-hollow/kitdump/dump_kit.mjs` shows how). Grep
  the kit for the seeds the rooms use.
- **Lights** must sit where the kit's `lights` are (lanterns and fires glow there: material `glow`, or `hot` for flames).
- **See them in the game**: the dungeon is entered from the zone's dungeon gate; `tools/qa/zone-shots.mjs` and
  `tools/qa/dens-shots.mjs` show how to boot into a zone run (read their headers). The dev server is on port 5173.
  Dungeon rooms are lit darker than the outdoors: check your colours there, not only in Blender.

## Technique templates (finished, in the game, the owner's chunky toy-diorama style)
`D:/projects/chewy-life-3d/tools/blender/codex/assets/` (rg-tidepool/, zv-tidepool/, dungeon-gates/ (gate-tidepool), `landmarks-hollow/`, `hollow-decor/`). Reuse their kit
code. Moss and snow icing: 40-55% cover, irregular rounded drips, light tops, darker undersides, never flat neon
pancakes. Leaves as cards and clusters, never a smooth blob. `refs/style-C-*.png` are the owner's style picks.

## Technical
- 1 unit = 1 m. Vertex colours (a `Col` attribute) with painted shading. Material names as above. **No text** anywhere.
- <= 5,000 triangles per piece (the shrines up to 9,000; small props <= 2,500): rooms repeat them.
- Deterministic `build_dg-tidepool.py --piece <name|all>` writing `D:/projects/chewy-life-3d/public/models/dg-tidepool-<name>.glb`
  (2-variant pieces: `dg-tidepool-<name>-v0.glb`, `-v1.glb`, each distinct).

## Deliverables
- The GLBs; `preview/<name>-gamecam.png` (45 deg down at about 18 m and 10 m, +/-45 deg yaws, a 1 m capsule) and
  `preview/<name>-kitcmp.png` beside the kit dump at the same camera.
- A report: per GLB the triangles, size and origin against the kit piece's, and the materials used.

**Do all of it in one round** (one piece fully first, then the rest). Then report and stop.
