# Brief: furn-big: the housing furniture's beds, storage and kitchen in Blender

## Why
The player furnishes their home with these catalog items (docs/HOUSING.md). They're kit-built; rebuild each at the game's 9/10 bar in the owner's chunky toy-diorama style, seen up close in the interiors.

| GLB (`public/models/`) | Name | Category / mount | Footprint | The catalog's description |
|---|---|---|---|---|
| `furn-futonBed.glb` | Cozy Futon Bed | bed / floor | 2 x 1.5 m, h 0.62 m | A low wooden bed with a puffy patchwork futon. Perfect for naps. |
| `furn-pupBasket.glb` | Pup Basket | bed / floor | 1 x 1 m, h 0.42 m | A round woven basket with a bone-shaped pillow. Shadow's favourite spot. |
| `furn-treasureChest.glb` | Treasure Chest | storage / floor | 1 x 0.5 m, h 0.62 m | Gold-banded and paw-locked. Everything inside is shared by the whole pack. |
| `furn-kitchenStove.glb` | Kitchen Stove | kitchen / floor | 1 x 1 m, h 1.15 m | A chubby brick stove with a bubbling pot. Cook your crops and fish here. |
| `furn-kitchenCounter.glb` | Kitchen Counter | kitchen / floor | 1 x 0.5 m, h 0.86 m | A sturdy counter with cupboard doors and a chopping board. Things can sit on top. |
| `furn-bookshelf.glb` | Bookshelf | storage / floor | 1 x 0.5 m, h 1.6 m | Stuffed with storybooks, a globe and a sleepy plant. |
| `furn-tansu.glb` | Tansu Chest | storage / floor | 1 x 0.5 m, h 0.95 m | A chest of drawers with iron pulls. Its top is a fine shelf. |
| `furn-wardrobe.glb` | Wardrobe | storage / floor | 1 x 0.5 m, h 1.75 m | A tall rounded wardrobe with a heart-shaped mirror. |
| `furn-breadShelf.glb` | Bread Shelf | storage / floor | 1 x 0.5 m, h 1.4 m | Baskets of melon-pan, a long loaf and a jar of honey. |
| `furn-curioCabinet.glb` | Curio Cabinet | storage / floor | 1 x 0.5 m, h 1.55 m | A glass-fronted cabinet of oddities: a ship in a bottle, a geode, a tiny umbrella. |

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

**Round 1: `furn-futonBed.glb`, `furn-pupBasket.glb`, `furn-treasureChest.glb`.** Then report and stop.
