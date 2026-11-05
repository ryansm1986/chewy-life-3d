# Brief: hollow-ext: Tanu's trinket stall and the home mailbox in Blender

## Why
Two kit-built pieces the player sees every day in Blossom Hollow: Tanu's Trinkets, the market stall (docs/HOUSING.md
§finds, `src/home/sources.js`), and the little post mailbox that stands outside each home (`src/home/exteriors.js`).
Rebuild both at the game's 9/10 bar in the owner's chunky toy-diorama style, matching the Blender landmarks around them.

| GLB (`public/models/`) | Kit function (read-only) | Notes |
|---|---|---|
| `ext-trinketStall.glb` | `trinketStallTemplate()` in `src/home/stallModel.js` | the market stall: deck, posts, awning, the wares, the sign (no text: an emblem) |
| `ext-mailbox.glb` | `mailboxTemplate()` in `src/home/exteriorModels.js` | a chunky post mailbox: mossy stone foot, post with knee braces, the box |

## How the game will use them
Both kit functions return a Builder template (`Builder.finish()`: geometry per material key in `geos`, plus `lights`, and
`anims` for any moving parts). The game will swap the template's **geometry** for your GLB's meshes, sorted into the same
keys by your **material names** (`body`, `glow`, `cloth`, `leaf`, `water`), and keep the kit's lights and any `anims`
(moving parts stay the game's: leave them out and list them in your report). So build each in the kit template's own local
frame: the same origin, facing (front = Blender -Y = game +z), ground level and size, and put glowing parts where the kit's
`lights` are. Dump the kit for reference with a small node script (see
`tools/blender/work/codex/landmarks-hollow/kitdump/dump_kit.mjs` for writing OBJ with vertex colours), and see the stall in
the game at `http://localhost:5173/?test=stall` (dev server on port 5173).

## Technique templates
`D:/projects/chewy-life-3d/tools/blender/codex/assets/landmarks-hollow/`, `plaza-pieces/`, `village-pieces/`, and the
furniture builders in `tools/blender/work/codex/furn-*` (for small painted props). `refs/style-C-*.png` are the owner's
style picks. Cloth parts that hang (an awning valance, a noren) need a UV map: uv.y = 1 at the hanging top (see
`furn-small/build_furn-small.py`), so the game's cloth wind bends them from the top; still cloth uses the "attached"
UV value (see `furn-big`).

## Technical
- 1 unit = 1 m; vertex colours (`Col`) with painted shading; no text anywhere.
- <= 9,000 triangles for the stall, <= 2,500 for the mailbox.
- Deterministic `build_hollow-ext.py --piece trinketStall|mailbox|all`.

## Deliverables
- The two GLBs; `preview/<piece>-gamecam.png` (35 and 45 deg down, +/-45 deg yaws, a 1 m capsule) and `preview/<piece>-kitcmp.png`.
- A report: triangles, size and origin against the kit's, the materials, and any kit `anims` the game should keep.

**Do both in one round.** Then report and stop.
