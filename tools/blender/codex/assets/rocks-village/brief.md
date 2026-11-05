# Brief: rocks-village: the village and regions' scattered rocks in Blender

## Why
The owner picked trees for the Blender pass (2026-11-04). Rebuild each species as hand-made variants at the game's 9/10 bar, keeping the leaf-card look they tuned.

| GLBs (`public/models/`) | The species | Cards |
|---|---|---|
| `tree-village-rock-v0..v3.glb` | the mossy boulder: welded, round-shaded stone with a moss cushion growing out of its top and a few pebbles round its foot (one part, material `rock`, vertex-coloured, no cards); about 1.2 m across, 0.7 m tall | no cards |

## How the game uses them (read first)
Each tree is drawn through instanced batches with the game's own materials, so a Blender tree must be built **as the kit's
own parts**, which the game picks by **material name** (a `_` stands for the game's `:`):
- (bushes: `foliage` = the bush's leaf masses, shadow-only like a crown; `cards_round` / `cards_sakura` = leaf and bloom cards;
  `berries` = the box bush's berries. Rocks: one part, `rock`.)
- `bark`: the trunk and branches (vertex-coloured bark; it sways with the tree wind from its height above the base).
- `foliage`: the crown's soft masses. **They render only into the sun's shadow map** (the owner's call: crowns are leaf
  and blossom cards only, never a smooth blob), so they only shape the shadow and where the cards sit: keep them simple.
- `cards_<atlas>`: the leaf / blossom **cards**, quads textured from the game's greyscale + alpha card atlas and tinted by
  vertex colour. **Use the atlas exactly as the kit does**: `D:/projects/chewy-life-3d/tools/blender/work/codex/trees-common/atlas/`
  has each atlas as a PNG (512 px). Layout (`src/world/vegetation.js` RECTS / UVR): cluster cards C1 = [0, 0, 256, 256] px
  and C2 = [0, 256, 256, 512]; hanging sprays S1 = [256, 0, 384, 512] and S2 = [384, 0, 512, 512], each inset 2 px. A spray
  card runs uv.y = 0 at its attachment (the top) to 1 at its tip; the wind shader tells sprays by uv.x > 0.5. **The UVs the
  game reads must match the kit's**: `trees-common/kit/*.obj` are the kit trees dumped with the game's own uv (the `vt`
  lines) and vertex colours; read your GLB back (three.js / a glTF reader) and check your card UVs land in the same rects
  the same way up (the glTF exporter flips v: compensate). Cards are double-sided quads with alpha test.
- other kit parts where the kit has them (`d_body`, `culm`, `culmLeaf`): the same names as the kit's.
The kit trees are in `trees-common/kit/` (one OBJ object per part, named with `_` for `:`): **build each variant in the
same frame and about the same size** (base at the origin, y up = Blender z up), and keep the species' silhouette and
character. Read the kit code (read-only): src/world/vegetation.js (rockGeo and mossyStone; the village places rockGeo variants, regionWorld.js rockGeo(v * 11 + 3) for v = 0..3). Kit OBJs: none: dump rockGeo(seed) yourself with trees-common/dump_trees.mjs.

## The goal
The kit trees are procedural (tubes, blobby masses, scattered cards). Make them **hand-crafted 9/10 trees** in the owner's
chunky toy-diorama style (`refs/style-C-*.png`): characterful, gnarly trunks with real branching and root flares, crowns
built as considered clusters of cards (more, better-placed cards, layered inner and outer, darker inside for depth), so
each tree reads full and deep from the game camera (35 deg down, about 20 m away) and charming up close. Each variant
distinct. Leaves only on the crown (no visible smooth blob). No text.

## Technical
- 1 unit = 1 m. Vertex colours (`Col`); paint bark with fissures and light ridges; tint cards like the kit (soft
  variation, deeper inside the crown).
- Budget per tree: <= 6,000 triangles (cards count 2 each); the village species are placed hundreds of times. Bushes
  <= 2,500 each, rocks <= 1,200 each (they are scattered by the hundred).
- Deterministic `build_rocks-village.py --piece <key>:<k>|all` writing `D:/projects/chewy-life-3d/public/models/tree-<key>-v<k>.glb`.
- See them in the game once the files exist (the game loads `tree-<key>-v<k>.glb` for every key the coordinator lists;
  until then use your own renders with the atlas applied): the dev server is on port 5173.

## Deliverables
The GLBs; `preview/<key>-sheet.png` (all variants at the game camera, both 45 deg yaws, with the atlas applied and alpha
tested, beside the kit tree); a report: per GLB the triangles, size and the parts (material names), and the UV check.
**Do all of it in one round** (one variant fully first, then the rest). Then report and stop.
