# Brief: hollow-misc: Blossom Hollow's bridge, fence and flower bed in Blender

## Why
Three placeable catalog pieces still kit-built. Rebuild them at the game's 9/10 bar in the owner's chunky toy-diorama
style, matching the Blender pieces beside them.

| GLB(s) (`public/models/`) | Catalog id | Kit (read-only, `src/world/buildings/decor.js`) | Notes |
|---|---|---|---|
| `bridge.glb` | `bridge` (3 x 9) | `bridge(B)` | the vermilion taiko bridge over the river. **The deck's walking height must follow `bridgeDeckHeight(z)` exactly** (the same file: the player walks on that curve), and keep the kit's posts, rails, lanterns and flower boxes where they are. One model (the catalog's `glb`). |
| `fence-1-v0.glb` .. `fence-1-v3.glb` | `fence` (1 x 1) | `fence(B)` / `fenceSection` | a model per variant: style `['picket', 'bamboo', 'rail', 'picket'][variant % 4]` (v3 a second picket colourway if the kit's colours differ; otherwise the same as v0). Ends must meet a neighbouring fence piece flush (the kit's `left` / `right` posts). |
| `flowerBed-1-v0.glb`, `flowerBed-1-v1.glb` | `flowerBed` (1 x 1) | `flowerBed(B)` | a model per variant: stone ring (variant % 2 = 0) or planked box (1). Flowers as chunky petal cards and clusters, never blobs. |

The game loads per-variant models from the catalog's `glbVariants` (`<id>-<level>-v<k>.glb`, k = variant % n) and the
bridge from `glb`; it keeps the kit template's door, footprint and lights. Dump the kit for reference with
`tools/blender/work/codex/landmarks-hollow/kitdump/dump_kit.mjs` (set `B.variant`), and see the kit in the game at
`http://localhost:5173/?test=buildings&only=bridge,fence,flowerBed&variants=4&kit` (dev server on 5173).

## Technique templates
`D:/projects/chewy-life-3d/tools/blender/codex/assets/hollow-decor/` (the bench, lanterns, planter: closest), the WB-1
outskirts footbridges and `landmarks-hollow/`. `refs/style-C-*.png` are the owner's picks (the bridge one especially).

## Technical
- 1 unit = 1 m, front = Blender -Y, ground z = 0, vertex colours (`Col`), materials `body`, `window_glow` (the bridge's
  lanterns), `leaf` (flowers). No text. Budgets: bridge <= 12,000 triangles; fence <= 1,500 each; flower bed <= 3,000 each.
- Deterministic `build_hollow-misc.py --piece bridge|fence|flowerBed|all`.

## Deliverables
The GLBs; `preview/<piece>-gamecam.png` and `preview/<piece>-kitcmp.png`; a report (triangles, size, footprint, the deck
curve checked against `bridgeDeckHeight` at a few z, any glbKeep layers). **Do all of it in one round.** Then report and stop.
