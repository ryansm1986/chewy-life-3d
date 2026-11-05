# Brief: shop-3: Blossom Hollow's the level-3 shops in Blender, one model per variant

## Why
The player's village is mostly homes and shops, built again and again as Blossom Hollow grows; they're the last kit-built buildings beside the Blender landmarks, craft and service buildings. Rebuild every variant at the game's 9/10 bar in the owner's chunky toy-diorama style.

GLBs (`public/models/`): `shop-3-v0.glb` .. `shop-3-v7.glb`.

## How the game uses them (read first)
`src/world/buildings/index.js buildModel(id, { level, seed, style })`: the kit builds every building from `MODELS[id]`
with a Builder whose `B.variant = seed % 8` (`variantOf`). For `shop` each seeded variant looks different (roof and wall
colours from `ROOF_LIST` / `WALL_TINTS` indexed by the variant, the roof style, which side the door is on, the yard
props...), so the game now loads **one GLB per variant**: `public/models/<id>-<level>-v<k>.glb` for k = 0..7 (catalog
`glbVariants`), and stands it in for the kit's meshes when the building isn't remodelled (a remodelled building keeps the
kit: its style system swaps kit parts). The kit template still gives the door, the footprint, the height, the lights
(window glow at night) and the smoke emitters, so **each variant GLB must match its kit variant exactly in footprint, door
position, window positions and chimney top**. Kit layers the game should keep (moving parts, `hot`, `jet`): list them.

- **Read the kit** (read-only): `src/world/buildings/shops.js` (`shopL3`: tea house or cafe by variant % 2, colours by variant >> 1), plus `src/world/buildings/kit.js`, `roofs.js`, `parts.js`, `trim.js`,
  `catalog.js`. Dump every variant for reference with
  `tools/blender/work/codex/landmarks-hollow/kitdump/dump_kit.mjs` (copy it into your folder; it sets `B.variant`: loop it
  over 0..7 and your levels), and see them in the game: `http://localhost:5173/?test=buildings&only=shop&level=3&variants=8&kit`
  (`&kit` shows the kit; without it, your GLBs once they exist). The dev server is on port 5173.
- **Build parametrically**: one deterministic `build_<TASK>.py --piece <level>:<variant>|all` that reads the same
  per-variant parameters the kit does (port its colour tables and choices), so the 8 variants are one design family.
- **Technique templates** (finished, in the game, the owner's chunky toy-diorama style): `D:/projects/chewy-life-3d/tools/
  blender/codex/assets/landmarks-hollow/` (Chewy's House is the closest relative: its roofs, timber, shoji, the bendUnder
  roof fix), `hollow-services/`, `hollow-craft/`, `zv-bamboo/`. Reuse their kit code. `refs/style-C-*.png`: the owner's picks.

## Technical
- 1 unit = 1 m, front = Blender -Y (game +z, the door side), ground z = 0 at the footprint origin, a buried skirt to -0.3.
- Vertex colours (`Col`) with painted shading; materials `body` and `window_glow` (windows the game lights at night);
  `water` for water. No text anywhere (emblems instead).
- <= 11,000 triangles per variant (these are placed many times across the village). Smooth normals, closed shells.

## Deliverables
- The GLBs; `preview/<level>-sheet.png` (the 8 variants side by side at the game camera, pitch about 35 deg, both 45 deg
  yaws) and `preview/<level>-kitcmp.png` (yours over the kit's, the same 8).
- A report: per GLB the triangles and size; door, footprint and windows against the kit's; any glbKeep layers.

**Do all of it in one round** (check one variant fully first, then generate the rest). Then report and stop.
