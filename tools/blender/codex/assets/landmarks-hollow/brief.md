# Brief: landmarks-hollow: Blossom Hollow's four landmark buildings in Blender

## Why
Blossom Hollow is the player's home village and its four landmarks are on screen all the time. They're kit-built
(`src/world/buildings/models.js` and the parts it uses). The Adventurers' Guild was just rebuilt in Blender in the same
village (`D:/projects/chewy-life-3d/tools/blender/codex/assets/guild-model/`, its build script and README). **Use it as your
technique template**: the roof maths ported from `roofs.js`, crisp tile courses, chamfered timber, painted shading, the
buried skirt, `window_glow`. Bring these four to the same 9/10 bar.

| GLB(s) (`public/models/`) | Catalog id | Footprint | Notes |
|---|---|---|---|
| `townHall.glb` | `townHall` | 6 × 4 | the grand two-storey hall with the blue-grey tiled roofs |
| `rosieShop.glb` | `rosieShop` | 4 × 3 | Rosie's pink bakery: the parasol, the café table, the sign |
| `chewyHouse-1.glb`, `chewyHouse-2.glb`, `chewyHouse-3.glb` | `chewyHouse` (3 levels) | 3 × 3 | the hero's home; each level grows as the kit's does |
| `boneSmith.glb` | `boneSmith` | 3 × 3 | the smithy: the forge glow, the anvil, the chimney |

**Read each kit model first** (read-only): `src/world/buildings/models.js` (`MODELS.townHall` and the others) and
`catalog.js`. Keep each design, its footprint, its door position (the kit template's `door`) and its front.
`refs/kit-<id>-a.png` and `-b.png` show the kit versions at the game camera from both yaws.

## Technical (as the Guild)
- 1 unit = 1 m. Front = Blender −Y (game +z, the door side). Ground z = 0, centred on the kit footprint's origin. A buried
  skirt to −0.3.
- Vertex colours (a `Col` attribute) with painted shading and AO-like darkening. Materials: `body`, plus `window_glow` for
  windows, lanterns and the forge mouth. The game drives the night glow.
- **No text**: emblems in place of words (Rosie's shop: a bun or heart; the town hall: the paw crest; the smithy: a bone
  and hammer).
- ≤ 15,000 triangles per GLB (the town hall up to 18,000).
- Smooth normals, closed shells. Deterministic `build_landmarks-hollow.py --piece <name|all>`.
- Leave animated bits out (the kit's swinging signs, chimney smoke): the game adds smoke from the kit template's emitters.

## Deliverables
- The GLBs.
- `preview/<piece>-gamecam.png` (45° down at about 22 m and 12 m, ±45° yaws, a 1 m capsule).
- `preview/<piece>-kitcmp.png` beside `refs/kit-<id>-a.png`.
- A report: triangles, sizes, the footprint and door against the kit's.

**Round 1: `rosieShop.glb` and `chewyHouse-1.glb`.** Then report and stop.
