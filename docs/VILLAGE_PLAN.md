# Blossom Hollow 2.0: a 2× village with planned districts and plots

Status: **built** (2026-10-02), in three phases (§10-12):
- the 224 m island, the streets, `layout.js` as the single source of the plan, vegetation, set pieces and the
  performance work;
- plots in the sim, the starter village on plots, yards, the streetscape, rank rings, the Build-mode plot overlay and
  the big map;
- the save migration (`layoutVersion: 2`), `tools/qa/s14-village-plan.mjs` and the QA and docs updates.
The owner asked for "the town to be larger and have more space between buildings, better village
planning and space for expansion", and chose:
- **2×**;
- **planned districts with plots**;
- **migrate old saves onto the new plan**.

## 1. Why today's town is cramped (the code map)
- **The size is set by the land shape, not by `WORLD`.**
  - `WORLD = 112` (`src/world/terrain.js:6`).
  - `rawHeight` (`terrain.js:44-82`) hard-codes everything:
    - an island centre at (56,58) and an edge 39–50 m out;
    - a **flat plateau only 20 m in radius** around (56,60), blending out by 30 m;
    - the north cliffs at z < 27;
    - the shrine hill at (88,42) and the bamboo rise at (18,52);
    - the river (`RIVER`, about 24 m west of the plaza), the pond (`POND`, at (71,73), radius 5.2) and the waterfall basin
      at (50,16).
- **Buildings have no plots.**
  - `VillageSim` (`src/world/village.js`) keeps per-tile `occ` and `zone` arrays.
  - `autoPlace` (`:368-388`) leaves a 1-tile gap.
  - `findLot` (`:420-438`), which places zone growth, **has no gap rule and no distance preference**, so painted zones pack solid.
  - Level-ups grow the footprint only toward −x/−z (`:466-497`).
- **The starter village** (`seedStarterVillage`, `:113-133`) puts everything 5–28 m from the plaza, at random.
- **About 25 coordinates are duplicated outside `LANDMARKS`** (`src/world/layout.js:4-17`):
  - the fountain (55,59) and bridge (28,57) (`village.js:120-121`);
  - the fountain-ring paving (`terrain.js:38-39, 156`);
  - the waterfall z (`waterfall.js:26`), and its update gated on z < 40 (`game.js:725`);
  - the sea centre (`water.js:5`) and the seabed ring (`terrain.js:176`);
  - the build-pan clamp 10..102 (`game.js:465`);
  - the sky lanterns ±14 (`ambient.js:229-230`);
  - the shadow texel snap typed as 68 (`villageWorld.js:76`);
  - in `details.js`: the signpost (52.3,62.9) and its arm angles (`:1151-1157`), the hopscotch (55.95,62.05) (`:1195`), the dock
    z 70.9 (`:1008-1013`), the shrine lanterns x ≥ 76.5 (`:1223`) and the beach-shell exclusion (56,58) (`:1289`);
  - in `vegetation.js`: biome centres (56,60), pines z < 30, maples (88,42), bamboo (17,52) and susuki z 60–108
    (`:944-998`);
  - in `layout.js`: the plant and tree keep-out discs 11.5/12.5 m (`:67-102`).
- **Distances tuned to today's size**:
  - in `details.js`: decoration radii 38/44 m;
  - in `villageLife.js`: fishing ±30 m (`:342-368`) and the path-search cap of 5,000 steps (`:90`);
  - in `npc.js`: the claim range 19/24 m (`:219`), stroll 13 m (`:214`) and bed teleport >12 m (`:546`);
  - in `nav.js`: the player nav cap of 30,000 steps (`:80-122, 321`);
  - in `engine.js`: the light-pool cut-off 40 m;
  - in `minimap.js`: the minimap disc 40 m.
- **Saves store absolute tile coordinates** for buildings, zones and paths (`village.js:173, 198, 204`). There's no layout version
  and no placement check on load (`:104-108`).
- **Costs that scale with area**:
  - grass: one instanced mesh per 16 m chunk (`vegetation.js:1083-1121`);
  - plant try counts (2,600 trees … 9,000 flowers, `:923-1020`);
  - the terrain mesh at 2 samples/m (`terrain.js:32-35, 140-150`);
  - whole-grid scans: zone growth, overlays, the villager walk grid (`villageLife.js:59-85`) and plant clearing per placement
    (`vegetation.js:898-920`);
  - the boot prewarm.

## 2. The new island (WORLD = 224, 1 tile = 1 m)
Scale the island **2× about the origin**, so every old coordinate maps to 2× itself, then re-plan the town on the bigger plateau.
**Buildings, props, characters and the plaza furniture keep their size.** That's where the space comes from.

| Feature | Old | New (target) |
|---|---|---|
| World | 112 | **224** |
| Island centre / edge | (56,58), 39–50 m | (112,116), 78–100 m |
| Flat village plateau | flat r 20, blend to 30 | **flat r ≈ 52, blend to 66**, with gentle terraces allowed beyond |
| Plaza centre | (56,60.5) | **(112,121)** |
| Plaza size | about 11 × 10 m | **about 18 × 15 m**, a bigger civic square, not 2× |
| River (west) | about 24 m west | about 50 m west, with the bridge (`bridgeW`) on the west road |
| North cliffs | z < 27 | z < 54 |
| Shrine hill | (88,42), r 7–13 | (176,84), r 14–24 |
| Burrow gate (`dungeon`) | (90,38.5) | at the foot of the shrine hill, about (178,78), on a path |
| Pond | (71,73), r 5.2 | (142,146), r about 9, plus a park lawn |
| Waterfall | (50,12.5) | (100,25), basin (100,32) |
| Beach | (48,98) | (96,196) |
| Travel post | (21.4,53.2) | (43,106), the end of the west road past the bridge |
| Bamboo rise | (18,52) | (36,104) |

## 3. The town plan: districts, streets and plots
Plots are the new unit. A **plot** is a rectangle with a frontage, a door edge facing a street, a district, the building types it
allows, a max size (2×2, 3×3 or 4×4), and an unlock rank. Lots are sized so a building **at its max level** still leaves
**≥ 3 m to the next lot**, plus a small garden or yard.

**Streets** (`PATHS` re-planned; widths 2–3 m main, 1.5–2 m lanes):
- the **Main Street** east–west through the plaza, from the west bridge to the market;
- the **North Avenue** from the plaza up to the Town Hall forecourt;
- the **Shrine Road** north-east to the shrine stairs and the Burrow;
- the **Pond Walk** south-east to the pond park;
- the **Beach Lane** south;
- the **Waterfall Trail** north-west;
- **residential loops** branching off them.
Streets come first; every plot faces one.

**Districts** (around the plaza at (112,121)):
1. **Civic core**:
   - the plaza with the fountain at its centre, the signpost, bunting and hopscotch, all placed relative to the plaza;
   - the **Town Hall** north, at about (112,103), with a forecourt;
   - 2–3 decoration plots (park, well) on the plaza edges.
2. **Market Street** (east, along Main Street from x 124 to x 158):
   - **Rosie's bakery** first at about (130,115);
   - 8–10 shop plots on both sides of the street (2×2–3×3);
   - a market-stall square at the far end.
3. **West Lanes** (residential, west and south-west of the plaza):
   - **Chewy's house** at about (90,128), with a yard;
   - 12–14 home plots on two lanes (3×3 max, 6×7 m lots), with gardens and wells between them.
4. **South Meadows** (residential, between the plaza and the beach): 8–10 home plots on a crescent lane, plus a park.
5. **Pond Park** (south-east): the pond, the dock, benches, the fishing spots and 1–2 decoration plots.
6. **Workshop & Farm Quarter** (north-west, toward the river and the waterfall trail): workshop plots (lumber and so on) and 2–3 farm
   fields (4×4–6×6).
7. **Shrine Hill** (north-east):
   - the Blossom Shrine plot at the top;
   - the **Hot Spring (onsen) plot** reserved beside it (rank 3);
   - the Burrow gate at its foot.
8. **Expansion rings**: reserved, marked plots that unlock by village rank.
   - Rank 2: the outer South Meadows.
   - Rank 3: the East Hamlet past the market, toward the shrine.
   - Rank 4: the North-West Terraces above the farms.
   - Each is a block of plots on a stub street that's drawn but greyed until unlocked.

Keep **green belts**: the tree lines and meadows between districts stay unbuilt, so the town reads as neighbourhoods and not a carpet
of roofs. Keep the camera-side tree keep-out (`treeKeepOut`) working around every plot.

## 4. How the sim uses plots
- **Plot data**: `src/world/plots.js`, hand-authored and deterministic. Each plot has `{ id, district, x, z, w, d, door, allows:
  [types], max, rank }`. Validate it at boot (on the plateau, not on water, fronting a path) and fail loudly in dev.
- **The starter village** (new game): fixed buildings go to their fixed plots. The starter neighbourhood fills specific starter plots
  in each district (deterministic per seed); no ring scan.
- **Zone painting stays** in Build mode, but zone growth (`findLot`) only places buildings **on unlocked plots inside the painted
  zone**, of a type the plot allows, centred on the plot with its door to the street. Painting over plotless land does nothing, and
  the overlay says so.
- **Free placement** (the palette): it snaps to the plot under the cursor. Decorations (lamps, benches, flowers, fences) stay free,
  but keep a minimum distance from building plots' doors.
- **Level-ups** grow within the plot, centred, toward the plot's back, never into the street or the neighbouring lot.
- **Plot overlay**: Build mode shows the plots (free, used, locked by rank, district tint), and the big map shows the districts.
- **Rank unlocks**: when a rank unlocks an expansion ring, toast "New district: South Meadows!" and reveal its street.

## 5. Save migration (`layoutVersion: 2`)
- Add `village.layoutVersion = 2` to the save.
- On loading an old save (no version):
  - re-lay each saved building onto a new plot of the same district role: homes go to home plots nearest the core first, shops to
    Market Street, workshops and farms to their quarter, and decorations to the core and park;
  - keep **type, level, residents, seed and variant**;
  - put the prebuilt landmarks (town hall, houses, shop, gate, fountain, bridge) on their fixed plots;
  - drop old painted zones and paths;
  - toast once: "Blossom Hollow has grown! Everyone moved into the new town plan."
- **The migration must be deterministic and idempotent**, and must never lose a building. If plots run out, unlock the next ring
  for that save.
- Villager homes and residents follow their buildings.

## 6. Distances, nav and people
- **Scale the tuned distances** to the new town:
  - claim ranges about 30/38 m and stroll about 20 m;
  - the bed-teleport threshold kept;
  - fishing spots around the pond and river by landmark, not by a plaza radius;
  - the villager path cap raised, with a coarse grid if needed (long walks must not fail);
  - the player nav cap raised as needed.
- **Named villagers' anchors** move into their district:
  - Kuma at the market bakery row;
  - Mochi by the plaza;
  - Usagi in the South Meadows gardens;
  - Kitsune on the Shrine Road;
  - Pan in the Pond Park;
  - Tanu on Market Street;
  - Kero at the pond.
- **Walking**: villagers walk more; keep the player's walk/run speeds, and check that the quest trips (plaza to Burrow to travel post)
  feel fine.
  - Plaza → Burrow is about 85 m (40 m today).
  - Plaza → travel post is about 72 m.
- **Map and minimap**:
  - the HUD disc stays 40 m around the player;
  - the big map shows the whole island, and **its mouse-wheel zoom must work** (`map.js:19` is ignored by `VillageMinimap.draw`
    today);
  - district labels on the big map.

## 7. Every duplicated constant follows the plan
Move every literal from §1 into `layout.js` (`LANDMARKS`, `POND`, `RIVER` and so on) or derive it from them: the fountain, bridge,
paving ring, waterfall, sea and seabed, build-pan clamp, sky lanterns, shadow snap, `details.js` set pieces and `vegetation.js`
biome centres. After this, moving a landmark moves everything tied to it.

## 8. Performance budget (measure before and after)
**Targets**, on the same machine and quality, with the dev server and the production build:
- the village **p95 frame time within +10%** of today's;
- **boot to ready within +1.0 s**;
- **memory within +25%**.

How:
- **Grass**: keep per-chunk instancing (4× the chunks), with a frustum and **distance cull per chunk** (no grass beyond the fog,
  about 120–140 m) and a lower density on far chunks.
- **Plants and details**: scale the try counts to the new area with sensible caps. Thin the dense layers (flowers) outside the town
  and paths. Keep the per-instance CPU culling efficient (spatial bins per chunk, not a full-list scan).
- **Terrain**: about 1 sample/m outside the town, or chunked terrain, at most about 220k triangles in total.
- **Whole-grid scans** (zone growth, overlays, walk-grid rebuilds, plant clearing): make them incremental or local to the edited
  area.
- **Boot**: the tree-spacing check uses a spatial hash; the prewarm stays bounded.
- **Shadows and the light pool** are view-local and stay as they are.

## 9. Verification
- **Overhead shots**: the whole town at distance 140, and each district at 60. The "before" is
  `tools/blender/work/village-plan/before-overview.png`.
- **Play shots** at the normal camera (22) on Main Street, the West Lanes and Market Street. Check that buildings breathe (≥ 3 m
  apart) and that streets read.
- **A new game**: the starter village sits on its plots, the intro plays, Moka's join scene plays, and the quest arrows work.
- **Migration**: load a v1 save made before the change (save one now: `tools/qa` can write one), and confirm every building
  survived, typed and levelled, on plots. Add `tools/qa/s14-village-plan.mjs` for plots, growth, rank unlocks, migration and long
  walks.
- **All QA**: `s1`, `s5` (update its plaza and radii literals), `s8`, `s10`, `s12`, `s13`, `prod-smoke`, `village-idle`, the
  `profile-*` runs. Also `detail-tour.mjs` (update its shot spots).
- **Docs**: ARCHITECTURE.md (the village sections) and this file's status.

## 10. As built (phase 1)
- **Where the plan lives:** `src/world/layout.js` (island features, squares, landmarks, `STREETS`, green belts, keep-outs,
  villager anchors), `src/world/plots.js` (districts and the 66-plot table, `validatePlots`), `src/world/islandShape.js`
  (the heightfield, pure). `tools/qa/plan-map.mjs [out.png] [rank] [crop]` draws the plan from the real code in Node and runs
  the plot checks; `tools/qa/village-plan-shots.mjs` takes the §9 overhead and play shots.
- **Coordinates moved from the §2 table** (the principles held):
  - The beach is at (96,205): the 2× coast runs about 10 m further south than 2× the old one.
  - The bridge sits at (64.5,117.5), on the river at the west end of Main Street, on whole + half tiles for the 3 × 9 model.
  - The Burrow gate stays at (178,78) on the shrine hill's north rim, where the Shrine Road ends. A gate at the hill's foot
    would not give the planned 85 m road from the plaza, and the hill top still holds the shrine and onsen plots.
  - The river and the waterfall basin keep the old channel width (the 9 m bridge must span it). The cliff risers keep their
    old 2 m width, so the north is still cliffs and not ramps.
  - The North-West Terraces are two shaped shelves (+1.1 m, +2.2 m) north of the farms, with dry-stone walls on the risers.
- **Perf (§8):** chunked terrain (2 vertices/m in town, 1 outside; 217k triangles); grass at full density in town, 55% on the
  rim and 30% beyond, with chunks past the fog hidden; flowers concentrated in town; spatial hashes for tree spacing,
  records and street distance; many-instance batches split into 64 m cells; and static batches with baked culling spheres.

## 11. As built (phase 2)
- **Plots in the sim** (`village.js`): every home, shop, workshop, farm, park, water tower, clinic, school, shrine, onsen and
  big statue stands on a plot (`b.plot`). Its spot is centred on the frontage with a front yard (`plotSpot`, `plotSetback`).
  Each plot reserves the box of its biggest building plus the walk to its street, and free decorations keep out of it.
- **Zones** paint whole plots. Painting over plotless land paints nothing, the hint and a toast say so, and growth
  (`findLot`) picks a free, open, zoned plot nearest the plaza.
- **Level-ups** grow toward the back of the lot: the front stays on the setback line. A building that would outgrow its
  plot stops there ("Fully grown for its plot!").
- **The starter village** (deterministic per `village.seed`): 8 homes (2 at level 2) across the West Lanes and the South
  Meadows, 5 shops beside Rosie's (3 at level 2), the lumber workshop and the farm field in the Works Quarter, two parks,
  two wells, the plaza furniture, a bench and flower bed at each street junction, and 5 zoned plots waiting to grow.
- **Yards** (`details.js` `plotYards`, deterministic per plot id, all in the shared batches): fences or hedges on 1-3 sides
  (a side shared with a neighbour is drawn once), a garden bed, a small tree (or crates and a woodpile on workshops),
  stepping stones over trodden grass from the door to the street, sometimes a mailbox or a bench. Farm plots get tilled
  rows with crops. A yard shows only while its plot holds a building (`setPlotBuilt`), with its colliders.
- **Streetscape** (`layout.js` `STREET_LAMPS`, `STREET_TREES`, `JUNCTIONS`): paper lanterns about every 16 m along Main
  Street, Market Street, Beach Lane and both sides of the North Avenue; they light their street in the coverage map.
  Young cherries and maples about every 12 m, kept off the lots and every door's camera sightline (`doorKeepOut`).
- **Rank rings:** `village.ringRank` only goes up. Reaching a ring's rank paves its stub streets, unlocks its plots and
  toasts "New district: …!". The boot paves the rings already open.
- **Build mode:** the plot overlay (mown-lawn tint on free plots, the district's tint on built ones, grey on locked plots
  and stub streets), corner stakes on free plots, a hover card for empty plots, and snapping: a plot building drops onto
  the plot under the cursor with its door to the street.
- **The big map:** the wheel zoom works (0.5-3×, sliding toward Chewy), with district labels ("opens at rank N" on locked
  rings) and the locked stub streets dashed.
- **People:** fishing spots by landmark (3 at the pond, 2 on the river by the bridge). The villager path cap is 24,000 with
  a slightly weighted heuristic (a plaza-to-Burrow walk takes 143 expansions, 7 ms). Claim ranges are 30/38 m and strolls
  20 m; the bed teleport is kept. The player nav cap is 60,000.
- **Not done:** the gentle lane curves. The West Lanes' and Meadow Crescent's plots are rectangles fronting straight lanes,
  so curving them means re-authoring about 25 plots and their door frontage.
- **Shots:** `tools/qa/village-plan-shots.mjs` (`GROW=4` fast-forwards a rank-4 town and reloads it from its save).

## 12. As built (phase 3)
- **Migration** (`VillageSim.migrate`, when `village.layoutVersion < 2`): see ARCHITECTURE.md, "The town plan". On the
  v1 fixture (`tools/qa/fixtures/village-v1.json`, made by `tools/qa/make-v1-fixture.mjs` from the old game's own save):
  - all 72 buildings are kept with their id, type, level, residents and seed;
  - 33 stand on plots (every plot type and the landmarks), the rest are decorations round the plaza;
  - ring 3 opens (the save is rank 3), and the old zones and paths are dropped;
  - the toast shows once, and a second load is identical.
- **Fix found in review:** the x-ray cutaway's fixed screen radius sliced a whole cherry into a wedge in the overview and
  title views (Chewy stood behind it). The cutaway now shrinks with the camera distance; at play distance it is
  unchanged.
- **QA:** s14 (23 checks: plots, the starter village, placement, zones and growth, level-ups, rings, long walks, fishing,
  the big map, migration). s5 and `detail-tour.mjs` use the new coordinates, and `run-all.mjs` includes s14.
  - Passing: s1, s5, s8, s10, s11, s12, s13, s14, prod-smoke, village-idle and the seven profile runs.
- **Final perf** (interleaved A/B against the old build, the GPU shared with another game; `perf/ab-p3.txt`):
  - p95 at the play camera 15.1 → 15.5 ms (+3%), title camera 22.5 → 15.9 ms, wide 90 m view 25 → 28 ms (+12%, past the
    66 m zoom limit);
  - p50 at the play camera +2 ms: the roomier town shows about 40% more lawn blades in the view, plus the yards;
  - production boot 3.09 → 3.71 s (+0.62 s);
  - production heap 166 → 198 MB (+20%);
  - idle long frames are level (over 16.7 ms pooled: old 233 / 6,463 frames, new 290 / 6,429 frames);
  - texture uploads per frame 51 → 38.
  - If the p50 needs trimming, the next lever is the in-town grass density (44 blades/m²), a look decision.

