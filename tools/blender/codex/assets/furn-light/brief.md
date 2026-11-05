# Brief: furn-light: the housing furniture's lights and rugs in Blender

## Why
The player furnishes their home with these catalog items (docs/HOUSING.md). They're kit-built; rebuild each at the game's 9/10 bar in the owner's chunky toy-diorama style, seen up close in the interiors.

| GLB (`public/models/`) | Name | Category / mount | Footprint | The catalog's description |
|---|---|---|---|---|
| `furn-andonLamp.glb` | Andon Lamp | light / floor | 0.5 x 0.5 m, h 0.86 m | A paper floor lamp in a wooden frame. Glows like a little moon. |
| `furn-paperPendant.glb` | Paper Pendant | light / ceiling | 0.5 x 0.5 m, h 0.7 m | A round washi globe that hangs from the ceiling. |
| `furn-mushroomLamp.glb` | Mushroom Lamp | tabletop / table | 0.5 x 0.5 m, h 0.38 m | A spotty toadstool that glows from the inside. |
| `furn-bambooLantern.glb` | Bamboo Lantern | light / floor | 0.5 x 0.5 m, h 1 m | A bamboo tube carved with little leaves that let the light out. |
| `furn-pumpkinLamp.glb` | Pumpkin Lamp | light / floor | 0.5 x 0.5 m, h 0.5 m | A carved pumpkin with a happy face and a candle inside. |
| `furn-festivalLantern.glb` | Festival Chochin | light / ceiling | 0.5 x 0.5 m, h 0.7 m | A red paper lantern straight from the summer festival. |
| `furn-yokaiLantern.glb` | Yokai Lantern | light / floor | 0.5 x 0.5 m, h 1.2 m | A paper lantern yokai on a stand. It winks when no one is looking. |
| `furn-shellLamp.glb` | Shell Lamp | tabletop / table | 0.5 x 0.5 m, h 0.34 m | A pink scallop shell glowing softly. |
| `furn-ragRug.glb` | Rag Rug | rug / rug | 2 x 2 m, h 0.03 m | A round braided rug in sunset stripes. |
| `furn-tileMat.glb` | Kitchen Tiles | rug / rug | 2 x 1.5 m, h 0.02 m | A patch of mint and cream checker tiles for the kitchen corner. |
| `furn-tatamiMat.glb` | Tatami Mat | rug / rug | 2 x 1 m, h 0.04 m | A fresh-smelling woven mat with cloth borders. |
| `furn-mapleRug.glb` | Maple Leaf Rug | rug / rug | 1.5 x 1.5 m, h 0.03 m | A big red maple leaf to wiggle your toes on. |
| `furn-waveRug.glb` | Wave Rug | rug / rug | 2 x 1.5 m, h 0.03 m | Blue seigaiha waves, like standing in the sea. |

## Read first
- The catalog: `src/home/furniture.js` (FURNITURE: each item's `size` in cells of 0.5 m, `h` height, `mount`, `cat`,
  `set`, `desc`), and each item's kit builder (`src/home/furnitureModels.js`, `furnitureModels2.js`, `trophyModels.js`:
  read-only). Keep each item's design, footprint, height and front. `docs/HOUSING.md` explains the interiors.
- **The local frame** (`src/home/furnitureMesh.js`, its header comment): x right, z up in Blender (y up in the game),
  front = Blender -Y. Per mount: `ceiling`: hangs from the ceiling: its cord top at z = h, the lamp down to z = 0; `floor`: stands on the floor, centred on its footprint, z = 0 at its base; `rug`: lies on the floor: a few cm thick at most, centred on its footprint; `table`: sits on a table top: z = 0 at its base, centred.
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

**Round 1: `furn-andonLamp.glb`, `furn-paperPendant.glb`, `furn-mushroomLamp.glb`.** Then report and stop.
