# Brief: furn-trophy: the housing furniture's the crews' trophies in Blender

## Why
The player furnishes their home with these catalog items (docs/HOUSING.md). They're kit-built; rebuild each at the game's 9/10 bar in the owner's chunky toy-diorama style, seen up close in the interiors.

| GLB (`public/models/`) | Name | Category / mount | Footprint | The catalog's description |
|---|---|---|---|---|
| `furn-trophyMochiCrown.glb` | King Mochi's Crown Cushion | decor / floor | 1 x 1 m, h 0.62 m | A plump mochi cushion on a lacquer stand, still wearing its little gold crown. It squeaks when you sit near it. |
| `furn-trophyKasaStand.glb` | Karakasa's Umbrella Stand | decor / floor | 0.5 x 0.5 m, h 1.22 m | Lord Karakasa's paper umbrella, folded up in a glazed stand. It winks at guests. Mostly at Shadow. |
| `furn-trophyOniCleaver.glb` | Gorobei's Cleaver Plaque | wall / wall | 1 x 0.5 m, h 0.46 m | Oni Chef Gorobei's toy cleaver and ladle, crossed on a walnut board. Rosie says the dumplings are safe now. |
| `furn-trophyMoonLantern.glb` | Tamamo's Moon Lantern | light / floor | 0.5 x 0.5 m, h 1.16 m | A paper moon hung from a stand of nine silver tails. It glows like a very calm night. |
| `furn-trophyTenguFan.glb` | Tengu's Fan Stand | decor / floor | 1 x 0.5 m, h 1.24 m | Master Tengu's great feather fan on a lacquer stand. A breeze still ruffles it now and then. |
| `furn-trophyLeafJar.glb` | Danzaburō's Leaf Sake Jar | decor / floor | 0.5 x 0.5 m, h 0.7 m | A round sake jar with a maple leaf on its stopper and a straw hat hung on the cord. Smells of chestnuts and mischief. |
| `furn-trophySeaLantern.glb` | Umibōzu's Sea Lantern | light / floor | 0.5 x 0.5 m, h 1.2 m | A glass float in a rope net, hung on a driftwood post. It glows like the bay on a quiet night. |

## Read first
- The catalog: `src/home/furniture.js` (FURNITURE: each item's `size` in cells of 0.5 m, `h` height, `mount`, `cat`,
  `set`, `desc`), and each item's kit builder (`src/home/furnitureModels.js`, `furnitureModels2.js`, `trophyModels.js`:
  read-only). Keep each item's design, footprint, height and front. `docs/HOUSING.md` explains the interiors.
- **The local frame** (`src/home/furnitureMesh.js`, its header comment): x right, z up in Blender (y up in the game),
  front = Blender -Y. Per mount: `floor`: stands on the floor, centred on its footprint, z = 0 at its base; `wall`: hangs on a wall: its back flat on the wall plane at Blender y = 0, front toward -Y, bottom centre at the origin.
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

**Round 1: `furn-trophyMochiCrown.glb`, `furn-trophyKasaStand.glb`, `furn-trophyOniCleaver.glb`.** Then report and stop.
