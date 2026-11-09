# Brief: siege-camp: the siege camps' tents, stakes, campfires and cages in Blender

## Why
Every zone village opens under siege, and its camps are still procedural beside the Blender buildings, gates and monsters.

| GLB(s) (`public/models/`) | Kit function (read-only: `src/regions/village/art.js`) | Notes |
|---|---|---|
| `prop-siege-tent-v0.glb` .. `-v2.glb` | `tent` | a patched raider's tent, kit size `L 1.7, w 1.4, h 1.15`, the ridge along local x, the open dark mouth toward +x as the kit's. The kit tints it per camp; yours are 3 fixed colourways of the kit's plum, slate and moss. <= 2,500 each |
| `prop-siege-spikes-v0.glb`, `-v1.glb` | `spikes` | a log barricade with sharpened stakes, kit length 2.4 m along local x; colliders stay. <= 2,000 each |
| `prop-siege-campfire-v0.glb`, `-v1.glb` | `campfire` | the stone ring (radius 0.42), crossed logs and ash bed. **The embers and flames stay the kit's glow**: keep the centre open for them. <= 1,500 each |
| `prop-siege-cage-v0.glb`, `-v1.glb` | `cageTpl` | a captive's bamboo cage, `w 1.1, d 1.0, h 1.2`, thatched lid, stone base. **Its front door stays the kit's swinging part**: leave the front (+z) open between the corner posts, hinge on the left post at (-w / 2, 0, d / 2), so the kit door still fits. The villager stands inside: keep it clear. <= 4,000 each |

The war banners, debris and bones stay the kit's (cloth with wind; radial scatters).

## How the game uses your GLBs
They are added to the camp's Builder at the kit's frame (`glbInto` in `art.js`), so build each in the kit function's local frame: base at y = 0, same size. Parts by material name: `body`, `leaf`, `cloth` (cloth keeps its UVs for the wind: top of a hanging piece at uv.y = 1 as the game reads it; a Builder warp applies, so avoid hairline detail). Dump the kit for reference (`tools/blender/work/codex/dg-bamboo/kitdump/dump_kit.mjs` shows how).
See them with `node tools/qa/village-shots.mjs --zone bamboo` (read its header: the besieged village is its default), and for the other zones. `node tools/qa/s23-zone-villages.mjs` must still pass.

## Registering, and the only `src/` edit allowed
Add each finished key to the `PROP_GLB` array in `src/world/treeGlb.js`, for example `'siege-tent-v0'`. The file is shared: re-read it before every edit and make small Edit-tool changes.

Technique templates in `D:/projects/chewy-life-3d/tools/blender/codex/assets/`: dungeon-gates/, dg-tidepool/ (rope, stone), rg-bamboo/, zv-bamboo/. `refs/style-C-*.png` are the owner's picks.

## Rules the last rounds paid for
- **Exporter:** the glTF exporter flips UV V. Anything the game reads from UVs (glow flicker and tint, cloth sway) must be written as
  `(u, 1 - v)`. Use the fixed exporter in `D:/projects/chewy-life-3d/tools/blender/work/codex/dg-onsen/` (`dg_common.py`; `glbinfo.py` reads a
  GLB back) and check your glow and cloth UVs.
- **Moss and snow** are plump raised cushions with rounded edges and some thickness, light on top and darker at the rim; never flat
  pointed patches (`tools/blender/work/codex/poi-north/game/final_pond.png` is the reference).
- **Plants are layered leaf cards only**: dense clusters, darker cards inside for depth. A solid dark heart with leaves stuck on is the mix the
  owner rejected; use fewer plants before worse ones.
- Stones have some cut planes, not only smooth eggs. Chunky: nothing thinner than about 3 cm. **No text anywhere** (emblems instead).
- Judge colours **in the game**, not in Blender.

## Technical
1 unit = 1 m, vertex colours (`Col`) with painted shading, smooth normals, no NaNs or zero-area faces. Deterministic
`build_siege-camp.py --piece <name|all>`. The dev server is on port 5173.

## Deliverables
The GLBs, `preview/<name>-gamecam.png` beside the kit version, and in-game shots at the game camera. `tools/blender/work/codex/dg-maple/game/find_pieces.mjs`
hooks placement in the page and shoots a listed model where it landed: copy and adapt it. Run `node tools/test-rpg.mjs` from the repo root after
listing. End with a report: per GLB the triangles, size and origin against the kit's, the materials, known issues. **Do all of it in one round**, then stop.
