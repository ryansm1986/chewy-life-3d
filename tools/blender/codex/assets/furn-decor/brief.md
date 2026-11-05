# Brief: furn-decor: the housing furniture's decor pieces in Blender

## Why
The player furnishes their home with these catalog items (docs/HOUSING.md). They're kit-built; rebuild each at the game's 9/10 bar in the owner's chunky toy-diorama style, seen up close in the interiors.

| GLB (`public/models/`) | Name | Category / mount | Footprint | The catalog's description |
|---|---|---|---|---|
| `furn-pottedFern.glb` | Potted Fern | decor / floor | 0.5 x 0.5 m, h 0.78 m | A leafy fern in a glazed pot. |
| `furn-artEasel.glb` | Art Easel | decor / floor | 0.5 x 0.5 m, h 1.45 m | A wooden easel with a half-finished sunrise. Purple, naturally. |
| `furn-catTower.glb` | Cat Tower | decor / floor | 0.5 x 0.5 m, h 1.5 m | Carpeted platforms, a scratching post and a dangling pom-pom. |
| `furn-flourSacks.glb` | Flour Sacks | decor / floor | 0.5 x 0.5 m, h 0.6 m | Two plump sacks of flour and a wooden scoop. |
| `furn-plantStand.glb` | Plant Stand | decor / floor | 0.5 x 0.5 m, h 1.1 m | Three tiers of little pots: herbs, a strawberry and a tiny cactus. |
| `furn-byobu.glb` | Folding Screen | decor / floor | 1.5 x 0.5 m, h 1.4 m | Four panels of gold clouds and a sakura bough. |
| `furn-ikebana.glb` | Ikebana Stand | decor / floor | 0.5 x 0.5 m, h 0.86 m | A careful arrangement of iris and willow on a black stand. |
| `furn-bonsaiStand.glb` | Bonsai Stand | decor / floor | 0.5 x 0.5 m, h 0.92 m | A tiny old pine, older than the village. |
| `furn-irori.glb` | Irori Hearth | decor / floor | 1 x 1 m, h 1.2 m | A sunken hearth with a kettle on a hook. Toasty. |
| `furn-foxStatue.glb` | Fox Statue | decor / floor | 0.5 x 0.5 m, h 0.8 m | A stone shrine fox with a red bib and a key in its mouth. |
| `furn-bambooPlanter.glb` | Bamboo Planter | decor / floor | 0.5 x 0.5 m, h 1.7 m | Three fat stalks of lucky bamboo in a glazed pot of pebbles, like a tiny grove. |
| `furn-hangingPlanter.glb` | Hanging Planter | decor / ceiling | 0.5 x 0.5 m, h 0.8 m | A woven basket of trailing ivy on a knotted rope. |
| `furn-fishTank.glb` | Fish Tank | decor / floor | 1 x 0.5 m, h 1 m | Two goldfish, a little castle and a lot of bubbles. |
| `furn-lilyTub.glb` | Lily Tub | decor / floor | 1 x 1 m, h 0.55 m | A glazed tub of water lilies with two koi gliding under the pads. |
| `furn-cypressBucket.glb` | Cypress Bucket | decor / floor | 0.5 x 0.5 m, h 0.5 m | A little bath stool with a wooden bucket and a folded towel. |
| `furn-taikoDrum.glb` | Taiko Drum | decor / floor | 1 x 1 m, h 1 m | A big barrel drum on a stand, with two sticks. DON! |
| `furn-tanukiStatue.glb` | Tanuki Statue | decor / floor | 0.5 x 0.5 m, h 0.85 m | A round shigaraki tanuki with a straw hat and a flask. Tanu insists it is a portrait. |

## Read first
- The catalog: `src/home/furniture.js` (FURNITURE: each item's `size` in cells of 0.5 m, `h` height, `mount`, `cat`,
  `set`, `desc`), and each item's kit builder (`src/home/furnitureModels.js`, `furnitureModels2.js`, `trophyModels.js`:
  read-only). Keep each item's design, footprint, height and front. `docs/HOUSING.md` explains the interiors.
- **The local frame** (`src/home/furnitureMesh.js`, its header comment): x right, z up in Blender (y up in the game),
  front = Blender -Y. Per mount: `ceiling`: hangs from the ceiling: its cord top at z = h, the lamp down to z = 0; `floor`: stands on the floor, centred on its footprint, z = 0 at its base.
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

**Round 1: `furn-pottedFern.glb`, `furn-artEasel.glb`, `furn-catTower.glb`.** Then report and stop.
