# Brief: rg-extras: the regions' remaining signature props in Blender

## Why
The first region pass (`rg-*`) built the biggest landmarks. These fixed-shape pieces are still procedural beside them.

| GLB(s) (`public/models/`) | Kit function (read-only) | Notes |
|---|---|---|
| `rg-maple-taikobashi.glb` | `src/regions/assets/mapleProps.js taikobashi` | Momiji Hollow's arched red drum bridge. The biome calls it with `{ L: 7.6, w: 1.8, rise: 0.85 }`: **the deck's walking height must follow the piece's `deckAt(z)` exactly**. <= 9,000 triangles |
| `rg-maple-bench.glb` | `bench` | seeds 0, 1, 2: one design. <= 2,500 |
| `rg-maple-sheaf-v0.glb`, `-v1.glb` | `sheaf` | rice sheaves, placed many times (variant = seed % 2). <= 1,500 each |
| `rg-maple-bale-v0.glb`, `-v1.glb` | `bale` | straw bales, placed many times. <= 1,500 each |
| `rg-onsen-snowTorii.glb` | `src/regions/assets/onsenProps.js snowTorii` | the trail torii under snow. `src/regions/biomes/onsen.js` calls it at `{ w: plan.trailW * 2 + 1.2, h: 3.0 }` and once at `{ w: 3.2, h: 3.4 }`: colliders sit at w / 2, so read the real width. One model must fit both: if the two widths differ by more than about 10%, use `-v0` / `-v1` and tell me which seed needs which. <= 5,000 |

## How the game uses your GLBs
`src/regions/assets/glbPieces.js withGlb` swaps a kit piece's **geometry only** for your meshes, sorted into buckets by material name (`body`, `glow`, `leaf`, `cloth`, `water`, `stone`), and keeps the kit piece's lights, colliders and every other field such as `deckAt`. Build in the kit piece's own local frame: same origin, facing, ground and size. Dump it for reference (`tools/blender/work/codex/dg-bamboo/kitdump/dump_kit.mjs` shows how).

## Registering, and the only `src/` edit allowed
List each finished GLB under its region in `REGION_GLB` in `src/regions/assets/glbPieces.js`: `taikobashi: '/models/rg-maple-taikobashi.glb'`, or an array of urls for variants picked by seed. The file is shared: re-read it before every edit, and make small Edit-tool changes. Note: `Pr.taikobashi` and friends must go through `withGlb` where the biome imports them; if one doesn't, report it rather than editing.

Technique templates in `D:/projects/chewy-life-3d/tools/blender/codex/assets/`: rg-maple/, rg-onsen/, hollow-misc/ (the village's arched bridge, its deck on a curve), zv-maple/, zv-onsen/. `refs/style-C-*.png` are the owner's picks.

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
`build_rg-extras.py --piece <name|all>`. The dev server is on port 5173.

## Deliverables
The GLBs, `preview/<name>-gamecam.png` beside the kit version, and in-game shots at the game camera. `tools/blender/work/codex/dg-maple/game/find_pieces.mjs`
hooks placement in the page and shoots a listed model where it landed: copy and adapt it. Run `node tools/test-rpg.mjs` from the repo root after
listing. End with a report: per GLB the triangles, size and origin against the kit's, the materials, known issues. **Do all of it in one round**, then stop.
