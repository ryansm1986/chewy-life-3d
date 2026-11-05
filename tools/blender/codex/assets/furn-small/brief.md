# Brief: furn-small: the housing furniture's wall pieces and tabletop things in Blender

## Why
The player furnishes their home with these catalog items (docs/HOUSING.md). They're kit-built; rebuild each at the game's 9/10 bar in the owner's chunky toy-diorama style, seen up close in the interiors.

| GLB (`public/models/`) | Name | Category / mount | Footprint | The catalog's description |
|---|---|---|---|---|
| `furn-wallShelf.glb` | Little Wall Shelf | wall / wall | 1 x 0.5 m, h 0.4 m | A small shelf of jam jars and a trailing plant. |
| `furn-plateRack.glb` | Plate Rack | wall / wall | 1 x 0.5 m, h 0.42 m | Painted plates and a row of mugs on hooks. |
| `furn-cuckooClock.glb` | Cuckoo Clock | wall / wall | 0.5 x 1 m, h 0.9 m | A little house-shaped clock with pine-cone weights. |
| `furn-packPhoto.glb` | Pack Photo | wall / wall | 0.5 x 0.5 m, h 0.42 m | A crayon portrait of Chewy and Shadow in a wobbly frame. |
| `furn-hangingScroll.glb` | Hanging Scroll | wall / wall | 0.5 x 1 m, h 0.95 m | A crane flying past a full moon, in ink and gold. |
| `furn-kamidana.glb` | Kamidana | wall / wall | 1 x 0.5 m, h 0.5 m | A little wall shrine with a paper rope and two sakaki branches. |
| `furn-mapleWreath.glb` | Maple Wreath | wall / wall | 0.5 x 0.5 m, h 0.45 m | Red and gold leaves woven into a ring with a little bow. |
| `furn-glassFloats.glb` | Glass Floats | wall / wall | 1 x 0.5 m, h 0.45 m | A fisher's net with three glass floats caught in it. |
| `furn-onsenNoren.glb` | Onsen Noren | wall / wall | 1 x 1 m, h 0.95 m | A curtain with the hot-spring mark. Smells faintly of cypress. |
| `furn-teaSet.glb` | Tea Set | tabletop / table | 0.5 x 0.5 m, h 0.18 m | A round teapot and two cups on a lacquer tray. |
| `furn-flowerVase.glb` | Flower Vase | tabletop / table | 0.5 x 0.5 m, h 0.42 m | A sky-blue vase of pink tulips. |
| `furn-bookStack.glb` | Book Stack | tabletop / table | 0.5 x 0.5 m, h 0.22 m | A wobbly pile of well-loved books. |
| `furn-fruitBowl.glb` | Fruit Bowl | tabletop / table | 0.5 x 0.5 m, h 0.2 m | Apples, a persimmon and a bunch of grapes. |
| `furn-succulent.glb` | Little Succulent | tabletop / table | 0.5 x 0.5 m, h 0.24 m | A chubby rosette in a polka-dot pot. |
| `furn-paintPots.glb` | Paint Pots | tabletop / table | 0.5 x 0.5 m, h 0.2 m | Little jars of every colour, with brushes standing in a cup. |
| `furn-incenseBurner.glb` | Incense Burner | tabletop / table | 0.5 x 0.5 m, h 0.22 m | A three-legged bronze burner. A thread of smoke curls up. |
| `furn-pandaPlush.glb` | Panda Plush | tabletop / table | 0.5 x 0.5 m, h 0.3 m | A squishy panda hugging a bamboo shoot. Smells like naps. |
| `furn-frogFountain.glb` | Frog Fountain | tabletop / table | 0.5 x 0.5 m, h 0.3 m | A little stone frog spouting water into a shell. |
| `furn-daruma.glb` | Daruma | tabletop / table | 0.5 x 0.5 m, h 0.3 m | Paint in one eye when you make a wish. |
| `furn-goldfishBowl.glb` | Goldfish Bowl | tabletop / table | 0.5 x 0.5 m, h 0.3 m | A frilly glass bowl with one very proud goldfish. |
| `furn-luckyCat.glb` | Lucky Cat | tabletop / table | 0.5 x 0.5 m, h 0.32 m | A maneki-neko waving one paw. Brings coins. Probably. |

## Read first
- The catalog: `src/home/furniture.js` (FURNITURE: each item's `size` in cells of 0.5 m, `h` height, `mount`, `cat`,
  `set`, `desc`), and each item's kit builder (`src/home/furnitureModels.js`, `furnitureModels2.js`, `trophyModels.js`:
  read-only). Keep each item's design, footprint, height and front. `docs/HOUSING.md` explains the interiors.
- **The local frame** (`src/home/furnitureMesh.js`, its header comment): x right, z up in Blender (y up in the game),
  front = Blender -Y. Per mount: `table`: sits on a table top: z = 0 at its base, centred; `wall`: hangs on a wall: its back flat on the wall plane at Blender y = 0, front toward -Y, bottom centre at the origin.
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

**Round 1: `furn-wallShelf.glb`, `furn-plateRack.glb`, `furn-cuckooClock.glb`.** Then report and stop.
