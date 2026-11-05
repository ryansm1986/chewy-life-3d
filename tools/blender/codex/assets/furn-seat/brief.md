# Brief: furn-seat: the housing furniture's tables and seating in Blender

## Why
The player furnishes their home with these catalog items (docs/HOUSING.md). They're kit-built; rebuild each at the game's 9/10 bar in the owner's chunky toy-diorama style, seen up close in the interiors.

| GLB (`public/models/`) | Name | Category / mount | Footprint | The catalog's description |
|---|---|---|---|---|
| `furn-chabudai.glb` | Round Chabudai | table / floor | 1 x 1 m, h 0.36 m | A low round table for tea, snacks and board games. |
| `furn-zabutonPink.glb` | Pink Cushion | seating / floor | 0.5 x 0.5 m, h 0.13 m | A plump floor cushion with a tufted button. |
| `furn-zabutonBlue.glb` | Indigo Cushion | seating / floor | 0.5 x 0.5 m, h 0.13 m | A floor cushion in deep indigo with white stitching. |
| `furn-woodTable.glb` | Farmhouse Table | table / floor | 1.5 x 1 m, h 0.72 m | A chunky plank table for big breakfasts. |
| `furn-sideTable.glb` | Round Side Table | table / floor | 0.5 x 0.5 m, h 0.55 m | Just the right height for a lamp or a cup of cocoa. |
| `furn-woodChair.glb` | Wooden Chair | seating / floor | 0.5 x 0.5 m, h 0.86 m | A rounded chair with a heart cut into the back. |
| `furn-armchair.glb` | Puffy Armchair | seating / floor | 1 x 1 m, h 0.86 m | So squishy you sink right in. Mind the crumbs. |
| `furn-workbench.glb` | Workbench | table / floor | 1.5 x 0.5 m, h 1.3 m | A sturdy bench with a vice and a pegboard of tools. Craft furniture here. |
| `furn-melonStool.glb` | Melon Stool | seating / floor | 0.5 x 0.5 m, h 0.42 m | A round stool shaped like a slice of melon. Do not eat. |
| `furn-napPillow.glb` | Nap Pillow | seating / floor | 1 x 1 m, h 0.42 m | A huge squashy pillow made for very serious naps. |
| `furn-bambooBench.glb` | Bamboo Bench | seating / floor | 1.5 x 0.5 m, h 0.46 m | Lashed-together bamboo with a striped cushion. |
| `furn-acornStool.glb` | Acorn Stool | seating / floor | 0.5 x 0.5 m, h 0.44 m | A stool shaped like a very large acorn, cap and all. |

## Read first
- The catalog: `src/home/furniture.js` (FURNITURE: each item's `size` in cells of 0.5 m, `h` height, `mount`, `cat`,
  `set`, `desc`), and each item's kit builder (`src/home/furnitureModels.js`, `furnitureModels2.js`, `trophyModels.js`:
  read-only). Keep each item's design, footprint, height and front. `docs/HOUSING.md` explains the interiors.
- **The local frame** (`src/home/furnitureMesh.js`, its header comment): x right, z up in Blender (y up in the game),
  front = Blender -Y. Per mount: `floor`: stands on the floor, centred on its footprint, z = 0 at its base.
- **Look at the kit**: `http://localhost:5173/?test=furnsheet&ids=<id,id,...>` (each item alone, 3/4 view, the game's
  toon materials) and `&vignette=<set>` (a set staged in a real room). The dev server is on port 5173.
- **Technique templates**: `D:/projects/chewy-life-3d/tools/blender/codex/assets/plaza-pieces/`, `village-pieces/`,
  `landmarks-hollow/` (painted vertex colours, chamfers, soft AO, the toy-diorama finish). Reuse their kit code.
  `refs/style-C-*.png` are the owner's style picks.

## Technical
- 1 unit = 1 m. Vertex colours (a `Col` attribute) with painted shading. Material names choose the game's material per
  part: `body` (most things), `cloth` (fabric that should look soft: futons, cushions, noren, scrolls), `leaf` (plants),
  `glow` (lamp paper, candle flames, glowing jars: drawn unlit and lit at night), `water` (fish tanks, tubs, fountains).
- **Small and light**: these are drawn instanced in rooms; <= 1,500 triangles for tabletop and wall pieces, <= 3,000 for
  furniture, <= 5,000 for the biggest (beds, the kitchen, the fish tank, the irori). Chunky, nothing thinner than 1 cm.
- **No text** anywhere (the owner's rule; emblems instead).
- Deterministic `build_<TASK>.py --piece <id|all>` writing `D:/projects/chewy-life-3d/public/models/furn-<id>.glb`.

## Deliverables
- The GLBs `public/models/furn-<id>.glb`.
- `preview/<id>.png` (a 3/4 view like the furnsheet's) and `preview/sheet-kitcmp.png` (yours beside the kit's furnsheet
  cells, the same scale and angle).
- A report: per item the triangles, size against its footprint and `h`, and the materials used.

**Round 1: `furn-chabudai.glb`, `furn-zabutonPink.glb`, `furn-zabutonBlue.glb`.** Then report and stop.
