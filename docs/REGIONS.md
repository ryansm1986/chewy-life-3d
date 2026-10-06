# Regions: outdoor biomes beyond Blossom Hollow

Status: **built** (all four regions, 12 monsters, 4 bosses, themes, boss music and ambiences; see §5). Four open-air regions you travel to from the village, each with its own art direction,
effects, vegetation, critters, audio, three new monsters and a boss. Quality bar: 9/10, the same cute Disney/Pokopia
toon look as the village and the Burrow (see ARCHITECTURE.md "Visual style guide"), readable at the game camera
(22 m, 45° pitch), and 144 fps on the RTX 5080 target (p95 ≤ 7 ms in a 40-monster fight).

## 1. Player flow
- **Travel post**: a "Wayfarer's Post" at the west end of the village path (by the bamboo, `LANDMARKS.travel`). Its
  interaction opens the **Travel Map**: a painted map with Blossom Hollow in the middle and the four regions around it.
  Each card shows a vignette, the name (with Japanese), the level range, locked/unlocked, visits and a boss-defeated
  stamp. Pick one and an iris transition carries you there.
- **Unlocks**: a region opens when the active hero reaches `unlock.level`, or when the previous region's boss is
  defeated (whichever comes first). Order: Bamboo Grove → Momiji Hollow → Shiokaze Tidepools → Yukimi Onsen.
- **In a region**: you arrive at the **Wayfarer's Stone** (a return portal; also opens the Travel Map to jump to
  another unlocked region). A winding main trail links 6–8 **camps** (monster packs, champions and uniques as in the
  Burrow), 2–4 **points of interest** (chest caches, a buff shrine, a biome feature such as a hot spring that heals,
  a tide pool full of loot, a leaf pile, a lookout with a vista), and the **boss arena** at the far end.
- **Boss**: an intro (camera + title card + music) the first time you enter the arena, 2–3 phases, a victory, a return
  portal where it fell, a guaranteed rare and the region's boss unique. The boss is back on the next visit.
- **Revisits**: terrain, vegetation and landmarks are fixed per region (seeded by the region id). Monster camps,
  chests and shrines reroll per visit. Monster level = the region's range, scaled by the hero's level within it
  (`clamp(heroLvl, min, max)`), camps nearer the boss +1…+3.
- **Save**: since the zones rework, `state.zones[id]` (`src/rpg/zones.js`, docs/ZONES.md §8.1). `state.regions = { unlocked: { bamboo: true, … },
  cleared: { bamboo: 2 }, visits: { bamboo: 3 } }` is a live, unsaved view of it (cleared = `zones[id].regionBoss`), and
  older saves migrate.
- Death in a region: the usual "Shadow drags you home" (to the village).

## 2. The four regions
Each region is a 112 × 112 m map (the village's size), with 56 × 56 grid cells of 2 m for monster pathing.

### Whispering Bamboo Grove (`bamboo`, 竹林, levels 4–12)
- **Mood**: misty morning. Pale green-gold light slanting through tall bamboo, soft white fog in the hollows, dappled
  shadows, cool shade with warm sun shafts.
- **Land**: gentle hills with mossy stone steps and a winding stone path; a stream with stepping stones and a
  shishi-odoshi (bamboo water clapper); a moss-covered ruined shrine; natural walls of dense bamboo.
- **Vegetation**: tall bamboo stands (thick clumps, mixed heights and greens, swaying and creaking), young shoots,
  ferns, hostas, moss carpets, fallen bamboo leaves, mossy stone lanterns.
- **Effects**: god rays, drifting bamboo leaves, dust motes and fireflies in the shade, mist banks, dripping water.
- **Critters**: sparrows, frogs at the stream, a red panda on a log.
- **Monsters**:
  - Takenoko: bamboo-shoot sprites that burrow and pop up under you with a spin-slash.
  - Kodama: rattle-headed tree spirits that float and shoot leaf darts.
  - Kamaitachi: sickle weasels with fast dashes that leave a wind trail.
- **Boss**: Master Tengu (karasu-tengu).
  - A giant feather-fan gust (a cone that pushes you back).
  - Leaf-blade tornadoes that wander the arena.
  - A dive attack from the air.
  - Calls crow-tengu adds.
  - Phase 2: a bamboo-leaf wind storm.

### Momiji Hollow (`maple`, 紅葉谷, levels 11–19)
- **Mood**: golden hour. Warm low sun, long shadows, amber haze, red/orange/gold canopy.
- **Land**: a valley with a river and an arched red bridge; a persimmon orchard and rice-straw fields with sheaves; a
  waterfall; maple-covered slopes.
- **Vegetation**:
  - Momiji maples in red, orange and yellow, plus golden ginkgo.
  - Persimmon trees with fruit, chestnut trees, susuki grass.
  - Carpets of fallen leaves, mushroom clusters.
- **Effects**:
  - Falling leaves that swirl in gusts, and leaf piles that burst when you walk through them.
  - Drifting seeds, red dragonflies, a warm light haze.
- **Critters**: deer, squirrels, akatombo (red dragonflies).
- **Monsters**:
  - Kuri: spiky chestnut-burr imps that roll at you.
  - Kakashi: hopping scarecrows that send crows at you.
  - Momiji Wisps: leaf-swarm sprites that swirl and throw a leaf flurry.
- **Boss**: Danzaburō the Leaf-Shifter, a great tanuki.
  - Belly-drum shockwaves.
  - A leaf on his head turns him into a rolling boulder (charge) or a teakettle that spews steam cones.
  - Calls tanuki adds.
  - Phase 3: a giant form.

### Shiokaze Tidepools (`tidepool`, 潮溜まり, levels 18–27)
- **Mood**: bright coastal day. Turquoise water, white foam, glittering caustics, a salty breeze.
- **Land**:
  - A rocky coast with sea stacks and sandy coves.
  - Tide pools (shallow, walkable water with glints).
  - A sea cave (grotto) with glowing pools.
  - Driftwood and a small wrecked fishing boat; the ocean and cliffs as boundaries.
- **Vegetation**:
  - Bent coastal black pines, dune grass, beach morning glories.
  - In the pools: kelp, coral clusters and anemones, with shells and starfish scattered around.
- **Effects**:
  - Waves washing the shore, sea spray.
  - Bubbles and caustic light in the pools.
  - Glowing plankton and drifting mist in the cave.
  - Gulls overhead.
- **Critters**: crabs scuttling, fish in the pools, gulls.
- **Monsters**:
  - Kappa: water imps that grab and splash, and retreat to water to heal.
  - Heike-gani: samurai crabs with a shielded front (hit them from the side or behind), a sideways dash and a claw slam.
  - Kurage: lantern jellyfish that float and send out zap pulses.
- **Boss**: Umibōzu, a giant sea-monk spirit rising from the sea at the shore arena.
  - Tidal slams and wave rings.
  - Ink-rain zones.
  - Summons jellies.

### Yukimi Onsen (`onsen`, 雪見温泉, levels 26–35)
- **Mood**: snowy blue dusk, lit by warm lanterns from a ruined onsen inn, with rising steam.
- **Land**:
  - Snowy slopes and a frozen pond.
  - Steaming hot springs ringed with rocks, and a snowy torii path.
  - A frozen waterfall and an icicle-hung cave mouth.
  - Snow ridges and cliffs as boundaries.
- **Vegetation**:
  - Snow-laden pines and cedars, bare birches, snowy bushes.
  - Frost-tipped grass, red winter camellias on the snow, icicles.
- **Effects**:
  - Snowfall with gusts, and steam columns from the springs.
  - Sparkling frost and ice glints, footprints in the snow.
  - The lanterns' warm pools of light.
- **Critters**: snow monkeys bathing in a hot spring (friendly), red-crowned cranes, snow hares.
- **Monsters**:
  - Yuki-warashi: snow children with snowball barrages that chill.
  - Yuki-daruma: snowman brutes that roll into a giant snowball charge and frost-slam.
  - Tsurara: icicle wraiths that blink around and drop icicle rain.
- **Boss**: Yuki-onna, the Frost Princess.
  - A blizzard cone.
  - Ice-mirror clones.
  - Icicle-rain circles.
  - An icy floor you slide on.
  - Phase 2: a whiteout (visibility drops, lanterns matter).

## 3. Architecture
A region reuses the Burrow's combat machinery and the village's outdoor rendering.
- **The mode**: `RegionMode` (src/regions/regionMode.js) `extends DungeonMode`, so monsters, the flow field, boss
  intro and framing, loot, chests and shrines all work unchanged. It overrides `build` / `start` / `spawnPack` /
  `buildInteractables` / `onBossDefeated` and the boss subtitle.
- **Game code sees**: `G.mode === 'dungeon'` (it means "a combat world"), `G.dungeon` = the RegionMode, and
  `G.dungeon.isRegion === true` with `G.dungeon.region` = the biome recipe. Burrow-only behaviour (stairs, floor
  badges, floor quest progress, waypoints) checks `!G.dungeon?.isRegion`.
- **The world**: `RegionWorld` (src/regions/regionWorld.js) implements the world contract below. It builds terrain
  (`RegionTerrain`), water, sky/mood, vegetation and props (the biome's `populate`) and weather/critters (the biome's
  `effects`).
- **Audio**: `layout.theme` = the region id, so `music('dungeon')` / `music('boss')` / `ambience('dungeon')` resolve
  through `BIOME_TRACKS[id]` / `BOSS_TRACKS[id]` / `BIOME_AMBIENCES[id]`.

### 3.1 The world contract (what other code calls; see the S12 notes in the architecture map)
`RegionWorld` provides:
- `scene` (with fog and background), `sun` (DirectionalLight with shadows), `hemi`, and `lightPool` (a LightPool; never
  raw lights).
- `heightAt(x, z)` (real terrain height; monsters, loot and VFX sit on it) and `walkable(x, z)`.
- `collision` (a Collision with `blockFn = !walkable`) and `interactables` ([]).
- `L` = the region layout, `cellToWorld(cx, cy)` (a Vector3 at the cell centre, y = terrain height), and
  `terrain = { N: 112, heightAt, slopeAt, … }` (nav.js reads these).
- `updateSun(focus)` (shadow frustum follows the focus, snapped to texels), `update(dt, t, vfx, focus)` (wind, weather,
  critters, water), `applyMood(G)` (sky / fog / lights / U uniforms / grade / bloom, called on entry) and `dispose()`.
- `mapColor(x, z)` (the minimap colour) and `mask` / `decoTex` (textures to dispose, or null).
- The world lies in positive x/z (0…112). `dispose()` must free everything it created: s1-style round trips must not
  grow GPU geometries or textures.

### 3.2 The region layout (`generateRegion(recipe, { visit })` in src/regions/layoutGen.js)
Same shape as a Burrow layout, so DungeonMode code works:
- `W, H` (56), `grid` (Uint8, 1 = walkable cell), `at(x, y)`.
- `rooms` = zones, each `{ x, y, w, h, cx, cy, kind: 'start' | 'camp' | 'poi' | 'boss', lvl }`.
- `start {x, y}`.
- `spawns [{ x, y, rank, count, lvl, boss? }]`.
- `chests [{ x, y, quality }]`, `pots []`, `shrines [{ x, y, type }]`, `props []`, `lights []`.
- `bossRoom`, `boss` (id), `mlvl`, `theme` (= region id), `region` (id).
- `waypoint: null`, `stairs: null`.
- Region extras: `paths [[x, z]…]` (the trail polyline, world metres), `arena { x, z, r }` and
  `pois [{ x, z, kind }]`.

The generator carves the terrain grid from the biome's terrain function. RegionWorld then blocks the cells under
dense obstacles (bamboo clumps, big rocks, pools), so monsters path around them.

### 3.3 The biome recipe (`src/regions/biomes/<id>.js`, default export)
```js
{ id, name, jp, sub, color, levels: [min, max], unlock: { level, after },
  mood: { sky: { top, horizon }, fog: { color, near, far }, sun: { color, intensity, dir: [x, y, z] },
          hemi: { sky, ground, intensity }, rim, night /*0..1*/, grade: { lift, gain, sat, vignette, vigColor },
          bloom: { intensity, threshold }, wind: { dir: [x, z], strength } },
  terrain: { height(x, z, ctx), surface(x, z, h, slope, ctx), palette, grass, water },   // RegionTerrain (engine)
  layout: { start: [x, z], arena: [x, z, r], camps, pois },                                // layoutGen (engine)
  populate(ctx),       // vegetation, props, colliders, lights (ctx API: see §3.5)
  effects(ctx),        // weather, ambient FX, critters → { update(dt, t, focus), dispose() }
  interactables(ctx),  // optional biome POIs: { pos, radius, label, onInteract }
  monsters: [ids], boss: id,
  music: 'region_<id>', bossMusic: 'boss_<id>', ambience: 'region_<id>' }
```

### 3.4 Monsters and bosses (`src/regions/monsters/<id>.js`, `src/regions/bosses/<id>.js`)
Each file exports `MONSTERS` (defs in the monsters.js format, plus the fields below), `BUILD` (model builders) and
`SFX` (procedural sounds in the sfx.js format). `src/regions/monsters/index.js` merges them into `MONSTERS` / `BUILD`
(monsters.js), `MONSTER_KINDS` / `KIND_MAP` (stats) and the sfx table.

Extra def fields:
- `stats`: this monster's `MONSTER_KINDS` entry (`name, life, dmg, def, speed, xp, element, res, ranged`).
- `material`: the building material it favours.
- `ai(m, dt, target, d, slowMul)`: custom aggro behaviour; returns `moving`. It replaces the default
  chase/attack while aggroed. Use `m.move / chase / faceTo / startAttack`, `m.mode.bossTelegraph`,
  `m.mode.combat.spawn / hitPlayer`, and `G.vfx`.
- `update(m, dt)` (every frame while alive: idle visuals), `onSpawn(m)` and `onDeath(m)`.
- Bosses: `boss: true`, `subtitle` (title-card line), and optionally `intro(m, mode)`.

Models use the monsters.js conventions: `{ root, pivot, body, mat, outline }` from `finish(parts)`, or a kit rig.
They are cute, chunky, toon-shaded with ink outlines, readable at 22 m, and have distinct silhouettes.

### 3.5 Files and ownership
| Owner | Files |
|---|---|
| Lead | docs/REGIONS.md; src/regions/regionMode.js, index.js (registry, unlocks), monsters/index.js (merge glue); src/ui/travel.js (Travel Map); the travel post in the village; src/game.js; save; src/dungeon/monster.js / monsters.js hooks; src/rpg/*; minimap; audio routing; tools/qa/s13-regions.mjs |
| Engine | src/regions/regionWorld.js, regionTerrain.js, layoutGen.js, weather.js (weather/FX API), critters.js (framework), src/tests/region.js; additive, village-identical changes to vegetation.js / terrain shaders / materials |
| Biomes A | src/regions/biomes/bamboo.js, maple.js, src/regions/assets/bamboo*.js, maple*.js |
| Biomes B | src/regions/biomes/tidepool.js, onsen.js, src/regions/assets/tidepool*.js, onsen*.js |
| Monsters | src/regions/monsters/bamboo.js, maple.js, tidepool.js, onsen.js (3 monsters each, with their SFX) |
| Bosses A | src/regions/bosses/tengu.js, tanuki.js (+ their fx / sfx) |
| Bosses B | src/regions/bosses/umibozu.js, yukionna.js (+ their fx / sfx) |
| Audio | src/audio/music.js (4 region themes, 4 boss flavours), ambience.js (4 region ambiences), new environment SFX in src/regions/sfx/*.js |

### 3.6 Writing a biome recipe (the engine API as built)
**Layout** (`layout`, read by layoutGen's cached `regionPlan`):
- `start: [x, z]`, `startR`, `arena: [x, z, r]`, and `via: [[x, z]…]` (the trail's Catmull-Rom control points; the
  trail passes through them).
- `lanes` (play-lane half-width), `trailW`, `camps`, `campR`, `campGap` (min spacing, default 14), `pois`, `poiKinds`.
- `poiAt: [[x, z, kind]…]`: fixed landmark POIs, placed first and kept clear of camps; random POIs fill the remaining
  kinds.
- `avoid: [[x, z, r]…]`: no camp or random POI within r plus the site's own radius.
- `open: [[x, z, r]…]`: extra play discs, not flattened.
- `village: { at: [x, z], r }`: the zone village's clearing (docs/ZONES.md §2.1): flattened, the trail crosses it at its
  level, camps / POIs / the wild keep out (`plan.village`, `ctx.inVillage`; the village pieces pass `isFree(..., { village: true })`).
- Everything in `layout` goes into the plan's cache key, so changing it re-rolls the camps.

**Terrain** (`terrain`, RegionTerrain):
- `height(x, z, c)` is the raw heightfield. `c` provides play, fbm, n2, ridge, edge, terrace, lerp, clamp, smoothstep,
  plus the plan's start / arena / camps / pois.
- `after(x, z, h, c)` is the last word, after the band clamp, clearings and trail carve. Use it for rivers under
  bridges, pond and lake beds, and spring basins.
- `surface(x, z, h, slope, c, o)` sets the mask weights: trail, dirt, sand, grass, moss, litter, snow, accent.
- `palette`, `shader: { rockSlope, strata }`, `grass: { colors, density, height, width, tipMul, tipAdd, frost }` (arrays,
  one entry per layer), and `horizon`.
- `water: { level, wade, deep, shallow, foam, frozen: [{ x, z, r }] }`: frozen discs are walkable ice. waterAt() is 0
  there and heightAt() returns the ice top.

**populate(ctx)** (RegionWorld.makeCtx):
- Terrain queries: heightAt, waterAt, surfaceAt, pathDist, openDist, inStart / inCamp / inArena / inPoi.
- Placement: isFree, canPlace(x, z, r, { space, path, clearings }), reserve.
- Blocking and lights: addCollider, addRect, blockCells (monster nav), addLight (LightPool sources).
- Surface paint (before upload): paint(layer, x, z, r, v), paintFx('canopy' | 'shade' | …) for leaf fall and fireflies.
- Scenery: addPool, addDeck({ pts, y, w }), addIce, add / addMesh, prop(B => …) (the buildings Builder), place (the
  village vegetation batches), memo, onDispose, arenaLanterns (push Vector3s: the boss fight lights them).
- Most biome art goes through the bambooKit **Placer**: multi(parts), piece(kitPiece), put and mesh.
- **src/regions/biomeKit.js** holds the shared rules:
  - `viewGuard(ctx)` → `{ camSide, lens, hides(x, z, h, spots) }`. The camera looks from +x/+z: nothing tall on the
    camera side of the trail or in the lens zone, and nothing whose silhouette covers a landmark.
  - `handOver(ctx, PL)`, `trailCrossing` + `bridgeDeck` (a walkable, optionally arched deck that also opens the
    monster grid), `alongTrail` (lantern spots) and `arenaGate`.

**effects(ctx)** — `ctx.fx` is the Weather kit:
- Particle fields: snow, leaves({ kind: maple | ginkgo | mixed | bamboo | petal }), bambooLeaves, petals, fireflies,
  motes, plankton, glints, bubbles.
- Volumes: shafts, mist, steam.
- CPU bursts: spray, drips.
- `ctx.critters.add({ geo, habitat: ground | air | perch | water | bath, homes, … })` with CRITTER_MODELS or your own
  vertex-coloured geometry. It may return `{ update(dt, t) }`.

**interactables(ctx)**: `add({ pos, radius, label, onInteract })`.

**Look tour**: `node tools/qa/region-tour.mjs --region <id> [--only camp,poi,arena] [--pts "x,z;…"] [--dist 36] [--mons] [--uncap]`
screenshots every camp, POI and the arena, with draw calls, triangles and frame time (`--uncap` for real frame times
without vsync).

## 4. Budgets and tests
- **Per region**:
  - Entering builds in under 1.5 s behind the iris, with its shaders prewarmed.
  - Visible triangles at most about 2.5 M, draw calls at most about 450 in a fight.
  - Particles pooled; lights only through the LightPool.
- **Test pages**:
  - `/?region=<id>` boots straight into a region.
  - `/?test=region&id=<id>` gives a free camera, no monsters, with `&fx=0` and `&veg=0` switches.
  - `/?test=monster&id=<id>` shows the monster turntable and its attacks.
- **QA**:
  - `tools/qa/s13-regions.mjs`: travel, every region builds, fight, boss, return, save, round-trip leaks.
  - `tools/qa/prod-smoke.mjs` also boots a region.

## 5. As built (2026-09-29)
| Region | Map | Monsters | Boss |
|---|---|---|---|
| Whispering Bamboo Grove | misty groves, a stream with a footbridge, a pond with a shishi-odoshi (it clacks), the ruined shrine, the Tengu's torii clearing | takenoko, kodama, kamaitachi | Master Tengu |
| Momiji Hollow | golden hour; rice terraces with drying racks and straw huts, a persimmon orchard, a river from a waterfall under an arched taikobashi, the lookout deck, leaf piles that burst, the harvest-clearing arena | kuri, kakashi, momijiWisp | Danzaburō (drum rings, boulder, teakettle, giant form) |
| Shiokaze Tidepools | coves, rock pools, sea stacks, the grotto, a wreck; the shore arena | kappa, heikegani (shielded front), kurage | Umibōzu |
| Yukimi Onsen | snowy dusk; a torii path, a lit ruined ryokan with hot springs and bathing snow monkeys, a frozen pond (walkable ice, cranes), a frozen waterfall, the snowed-in bathhouse, woodcutters' rests at the camps; a frozen-lake arena ringed with lanterns | yukiwarashi, yukidaruma, tsurara | Yuki-onna (blizzard, ice mirrors, icy floor, whiteout) |

- **Measured** (dev build, 1600×900, uncapped): about 2.0–2.6 ms a frame in every region, 2.3–5.1 M triangles
  (including shadow passes) and 200–280 draw calls. No per-visit texture or geometry growth in village ⇄ region trips.
- **Monster grid**: the trail is always open in the monster grid, even over water. The flood fill from the arrival
  used to cut everything beyond the first river off from the flow field.
- **Follow-ups**:
  - a real `Player.traction` (Yuki-onna's slide currently fakes it with slowAmt + knock);
  - `Monster.dispose` could free per-model materials through a `model.dispose` hook;
  - s13 could add a tidepool round trip with a fight;
  - region-specific victory stings;
  - a listening pass on the new music.

