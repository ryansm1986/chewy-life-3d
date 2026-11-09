# Brief: scav-nodes: the scavenging nodes in Blender

## Why
The gather nodes (docs/COZY.md section 7) sit all over the village and the four regions, and players walk up to every one of them.
They are still the procedural kit. Rebuild each at the game's 9/10 bar in the owner's chunky toy-diorama style.

## How the game uses your GLBs (read this first)
`src/cozy/scavengeModels.js` (read-only) has `MODELS`: 21 models, each with a **full** look (ready to gather) and a **taken** look (just
gathered): driftwood, riverStone, petalDrift, mulberry, culms, mossRubble, cocoons, shoots, branches, terrace, mapleLeaves, honeyLog,
seaDrift, seaStones, netScraps, seaGlass, seaweed, pine, sinter, iceCrystal, snowForage. `nodeGeos(model)` now uses
`public/models/prop-scav-<model>-full.glb` and `prop-scav-<model>-taken.glb` when they are listed.
- **All your meshes are merged into one geometry and drawn with one material** (`scavMaterial`, vertex colours, no texture), one
  BatchedMesh per area: every look comes from your vertex colours, and no part can glow, sway or use another material.
- Same origin, ground and size as the kit's: the player gathers within about a metre, and the camera must see the node. Dump the kit
  with a small script for reference (`nodeGeos` in the page) and compare.
- **A taken look must clearly read as gathered, and stay the same object**: the same place, footprint and character, with the goods gone.
- Budget: <= 1,500 triangles for a full look, <= 900 for a taken look: nodes are placed by the dozen.
- See them in the game with `node tools/qa/scavenge-shots.mjs` (read its header). The dev server is on port 5173.

## Exporter rule (it cost two dungeons a rebuild)
The glTF exporter flips UV V. Anything the game reads from UVs (glow flicker and tint, cloth sway) must be written as
`(u, 1 - v)`. Use the fixed exporter in `D:/projects/chewy-life-3d/tools/blender/work/codex/dg-onsen/` (`dg_common.py`,
`glbinfo.py` reads a GLB back). Read your glow and cloth UVs back and check them.

## Technique templates (finished, in the game, the owner's chunky toy-diorama style)
`D:/projects/chewy-life-3d/tools/blender/codex/assets/`: rocks-village/, dg-bamboo/, rg-maple/, rg-onsen/, rg-tidepool/. Reuse their kit code. `refs/style-C-*.png` are the owner's
picks. Moss and snow: 40-55% cover, irregular rounded edges, light tops, darker undersides, never flat neon pancakes. Stones
have some cut planes, not only smooth eggs. Leaves as cards and clusters, never a smooth blob. Chunky: nothing thinner than
about 3 cm. **No text anywhere** (emblems instead; the owner's rule: no Japanese text).

## Technical
- 1 unit = 1 m, vertex colours (`Col`) with painted shading, smooth normals, no NaNs or zero-area faces.
- Deterministic `build_scav-nodes.py --piece <name|all>`.
- Judge colours **in the game**, not in Blender: dungeon and evening light shift them, and moss has come out neon before.

## Registering, and the only `src/` edit allowed
Add each finished key to the `PROP_GLB` array in `src/world/treeGlb.js`, for example `'campfire'`.
That file is shared with other builders: re-read it before every edit and make small Edit-tool changes that touch only your
entries. Then run `node tools/test-rpg.mjs` from `D:/projects/chewy-life-3d`: it asserts that every listed GLB exists.

## Deliverables
The GLBs, `preview/<name>-gamecam.png` (45 deg down at about 18 m and 10 m, both 45 deg yaws, beside the kit version) and
in-game shots at the game camera. End with a report: per GLB the triangles, size and origin against the kit's, the materials,
and known issues. **Do all of it in one round** (one piece fully first, then the rest). Then stop.
