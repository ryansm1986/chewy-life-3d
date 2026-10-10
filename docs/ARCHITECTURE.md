# Chewy Life 3D — Architecture & Contracts

A cozy, hand-painted, isometric 3D village life-sim (Hello Kitty Island Adventure vibes) with
SimCity-style village planning and a Diablo-2-style dungeon ("The Burrow"). Three.js r186 + Vite, plain ES modules (no TS).
Quality bar: **8.5/10 polish** — every screen should feel finished, animated and cute.

## Cast
- **Chewy** — main character. Humanoid chibi chocolate-brown dog (#8a4a2c), lighter muzzle, **white chest blaze**,
  amber eyes, semi-floppy rose ears. Wears a navy gi (#2c3a6a) with red scarf + red sash. Weapons: **Bone Katana** (melee; Chewy is a samurai, docs/HEROES.md)
  or **Red Tennis Ball** (thrown, returns). `X` swaps weapons.
- **Moka** — second playable hero (docs/HEROES.md): Boykin Spaniel mage, chocolate wavy coat, long pendant ears, amber
  eyes; seafoam capelet, lavender robe, floppy seafoam wizard hat; a **staff** (Energy scales its damage). Water /
  starlight / duck-hunt spells. `Tab` switches heroes; the hero you're not playing lives in town as a villager.
- **Poe** — third playable hero (docs/POE.md): a black pug ninja (she/her), honey eyes, moss-green top, mustard sash, a
  fox festival mask pushed up on her head; a **giant bone fūma shuriken** (Dexterity) she throws out and back. Shuriken
  Arts / Ninjutsu / Shadow Step. Met in the Bamboo Grove (she tails you, sneezes, joins). Tap `Tab` = next hero, hold = the hero wheel.
- **The Shih Tzu** — fourth playable hero (docs/SHIHTZU.md; his name is the owner's to pick: `CLASSES.shihtzu.name`): a
  black-and-white Shih Tzu dark knight (he/him), white topknot with a plum band, plum tabard over light armour, a spell-tome
  on his hip; a **toy flail** (Strength) and dark dog magic (Energy: hexes, gloom over time). Flail Arts / Gloom Hexes /
  Ghostlight Tome. The tank: the most life, a damage reduction and the Gloom Blanket. Met in Momiji Hollow, lighting
  ghostlight lanterns (a ghost pup licks his face mid-proclamation).
- **Foosy** — fifth playable hero (docs/GOLDEN.md; `CLASSES.golden.name`, id `golden`): a red-gold Golden Retriever dragoon
  (he/him) in emerald scale armour with a crest helm carrying a little dragon; a **toy lance** (Strength, the longest reach)
  and blunt **toy javelins** (Dexterity). Lance Arts / Javelins / Whelp Bond. While he's played **Shadow wears a dragon
  whelp outfit and flies** beside him; the Whelp Bond drives Shadow (breath, swoops, a wing shield, a roar, Dragon Heart).
  Met at the hot springs of Yukimi Onsen (a solemn vow undone by a tennis ball; he gives Shadow the costume).
- **Shadow** — sidekick Boston terrier (quadruped, black #1e1c24 + white muzzle/blaze/chest, big bat ears, round eyes, blue collar). Follows and fights (D2 mercenary style).
- **Rosie** — human little girl, curly brown hair, brown eyes, fair skin, rosy cheeks, pink dress + red bow. Runs "Rosie's Treats" shop & gives quests.
- Villagers — humanoid cartoony animals (cat, bunny, bear, fox, panda, tanuki, frog, duck…).
- Monsters — cute Japanese yokai (mochi slimes, dust bunnies, lantern ghosts, umbrella kasa-obake, mushroom kinoko, oni imps, tanuki bandits) + bosses.

## Running / testing
- `npm run dev` (Vite on :5173; it is usually already running in the background).
- Screenshot harness: `node tools/shot.mjs --url "/?test=NAME&..." --out NAME [--wait ms] [--eval "js"] [--snap name] [--key k] [--click x,y]`
  → PNGs saved to the scratchpad `shots/` folder (path printed). Console errors/warnings are printed. ALWAYS check them.
- Isolated dev scenes: `src/tests/NAME.js` exporting `default function()`; open with `/?test=NAME`. Each module owner makes
  their own test page. Set `window.__ready = true` when the scene is ready to screenshot.
- **The debug menu** (docs/DEBUG.md, ROADMAP R-10): `?debug` or seven taps on Settings › About's version, a password,
  then F10 / the backquote key / the bug button / Select + Start. `src/debug/`: `registry.js` (`registerDebug(section, actions)`, the
  hash) and `access.js` always load; the menu is a lazy chunk. QA: `tools/qa/s35-debug.mjs`.
- Post debug: `&off=ao,tilt,main,smaa` disables passes (also `bloom`, `grade`, `guard`: the bloom's NaN guard, and
  `dark`: the hero darkGrade), `&raw` renders without post, `&q=0|1|2|3` the graphics preset (3: the Steam Deck; it wins over Settings), `&deck` /
  `&deck=0` force the Deck-like screen on or off, `&hour=13` time of day. NaN / flash
  probes: `&nanprobe`, `&nanprobe=spread`, `&rh` (see "Render health" below).
- QA: `node tools/qa/run-all.mjs [s1 s5 ...]` (the browser scenarios s1-s21; s15 is the homestead, s16 the guided
  tutorials, which every other scenario keeps off with `?nointro`, s17 housing, s18 getting furniture, s19 charge, s20
  Poe, s21 the zones' phase A: sprint, DungeonDef, seeds, state.zones, quest steps, s25 the gamepad with a virtual pad,
  s28 the Shih Tzu). `lib.mjs boot()` pins dungeon
  layouts with `?dseed=1` (the old fixed floors); `dseed=off` lets them reroll.
  Perf: `village-perf.mjs [runs]` (the village at three camera spots), `homestead-perf.mjs [runs]` (a fully planted,
  ripe garden and a reel in progress, each against the same spot without). Profilers: `tools/qa/profile-boot.mjs` (boot → ready),
  `profile-burst.mjs` / `profile-stress.mjs` (long frames in big fights, `CASTS=a,b` env to bisect skills), `boot-time.mjs`.
- `Play Chewy Life.cmd` builds (`vite build`, ~1 s) and serves the production bundle on :4173.

## Visual style guide
- Look: bright, saturated pastel, **hand-painted**. Soft toon terminator, cool lavender shadows, warm golden rim light,
  painterly brush-noise, drifting cloud shadows, bloom on emissives, subtle tilt-shift, AO.
- **All lit meshes use `makeToon()`** from `src/gfx/materials.js` (never MeshStandardMaterial). Options: `color`, `vertexColors`,
  `map`, `emissive`, `brush` (0-0.35), `rim` (0-0.8), `term:[a,b]`, `wind:'grass'|'tree'|'leaf'|'cloth'|'reed'`, `objectBrush:true` for moving actors,
  `noFlip:true` for double-sided cards, `noShadowCast`. If a material has wind/alphaTest, call `applyDepth(mesh)` so shadows match.
- Prefer **one merged geometry per object with vertex colors** (`src/gfx/geom.js`: `paint`, `solid`, `merge`, `xf`, `tube`, `branch`, `puff`, `RoundedBox`)
  → few draw calls. Unlit glow/VFX: `makeGlow()`. Character outlines: `makeOutline()` (inverted hull) — characters only.
- Shapes: chunky, rounded, slightly wonky/handmade, exaggerated (big roofs & eaves, round windows, thick doors). Nothing razor-sharp.
- Scale: **1 unit = 1 tile ≈ 1 m**. Chewy is ~1.15 tall. Doors ~1.4 high. One story ≈ 1.6 walls + 1.2–2 roof.
- Palette:
  - wood dark `#6b4a3a`, wood light `#c98f5e`, plaster `#fff3e0`, stone `#d9d0c8`/`#a89ca8`, paper `#fffaf0`
  - roofs: slate-blue `#5d6f9e`, teal `#3f8f8a`, terracotta `#d86a4a`, moss `#6e9a5a`, plum `#8a5a8a`
  - accents: lantern red `#e8503a`, gold `#f4c04a`, indigo noren `#2f4a7a`, sakura `#ffbcd6`
  - UI: cream `#fff6e8`, ink brown `#4a2c2a`, pink `#ff8fb0`, gold `#ffcf4a`, mint `#8fe0c0`, sky `#8fd0ff`
- Night: windows/lanterns glow (emissive > 1 so bloom catches them), fireflies, lantern light pools. Light sources are
  registered with the world's `LightPool` (`addSource({pos, color, intensity, radius, flicker, nightOnly})`) — never add raw PointLights.
  The 8 nearest get real point lights; the nearest 32 also feed `U.uPoolPos/uPoolCol`, which ground/grass shaders turn into
  painted light pools via `POOL_GLSL`'s `lightPools(worldPos)` (add `outgoingLight += lightPools(vCWorld) * diffuseColor.rgb`).
  Never toggle a light's `visible` — changing the light count recompiles every shader (seconds of stall).
  Keep a source well clear of the characters: the pool's falloff (decay 1.6) blows out whatever comes within half a metre
  of it. The dungeon's follow lantern hangs 4 m over the hero (`lift`, dungeonMode.js); at 1.8 m it turned the heroes'
  heads and backs mint and peach (ROADMAP R-9).
- `makeToon` hooks: `vertexPars`, `vertexWorld`, `fragPars`, `fragColor` (after color_fragment), `fragNormal` (perturb the
  view-space `normal`), `fragOut` (modify `outgoingLight`). Every hook string is part of the program cache key.
- Canopies (`vegetation.js` `LEAF_EDGE`): grazing-angle leaf-lobe discard for ragged silhouettes + a cellular floret texture
  (`floretTexture()`) used as a dome bump so crowns read as clusters, not balls.
- Additive glows must fade their **alpha** to 0 at the quad edge (texture or analytic falloff); a flat-alpha additive quad shows
  as a box through the post chain. Dungeon halos use an alpha-preserving additive blend.

## Render health: NaN, black flashes, first-open hitches (ROADMAP R-7, R-8)
- **Why one NaN is a black flash**: the scene renders into a half-float buffer; a NaN (or Inf) texel there enters the
  bloom's luminance pass, its 7-level mip chain spreads it to the whole frame, and the grade's clamp turns NaN black. A
  650-texel NaN source poisons all 921,600 texels after the bloom (measured with the guard off).
- **The rules**:
  - a normal must never be zero where a shader normalizes it. `makeToon` uses NaN-safe copies of three's normal chunks
    (materials.js `SAFE_NORMAL_*`: `cSafeN`, and a fragment fallback to the face normal from derivatives), outlines
    too. In a new shader, never `normalize()` a vector that can be zero, never `pow()` a negative base.
  - generated geometry goes through `geom.js merge()` or charKit's bake, which call `repairNormals(g)` (a zero vertex
    normal → its own face normal). The usual source is a fin whose two sides share vertices (it was on the mailboxes,
    the trinket stall, building trims and the villagers' face seams).
  - a transform must not reach zero scale on an axis: that is a singular matrix, and three's normal matrix is then all
    zeros. The Horde's per-instance normal matrix is `geom.js normalMatrixInto()` (the signed, scaled cofactor matrix:
    the inverse-transpose up to scale, finite for a squashed part; a rank ≤ 1 instance is hidden). The monster death
    squash stops at 2 %.
  - the last-resort guard: post.js patches the bloom's luminance shader (`NAN_GUARD`: NaN → 0, +Inf → 64), so a new
    source stays one pixel instead of a black frame. `?off=guard` turns it off for A/B.
- **Probes** (`src/gfx/renderHealth.js`, built only with a flag): `?nanprobe` counts NaN / Inf texels per stage
  (`scene` after the RenderPass, `ao` after N8AO, `tone` after bloom + tone map: the grade then gets its own pass) and
  paints them magenta where they first appear; `?nanprobe=spread` paints them only after the tone map (the poisoned
  area); `?rh` keeps the true image and runs only the flash detector. `window.__rh`: `read` (QA: read every frame
  back), `scanOn` (list the visible meshes, instances and bones with a singular world matrix), `stage`, `flashes`,
  `frameLog`. Bisect with `?off=ao,bloom,grade,dark,guard`, `?noinst`, `?nocull`, `?nogrid`, `?nolod`.
- **Tools**: `tools/qa/flash-hunt.mjs` (the production bundle: Chewy's Cottage at day and night with the interior, Burrow
  and Bamboo Depths fights for each hero; NaN per stage, flash frames with PNGs, the scan; `PROD_ROOT=` builds another
  checkout), `tools/qa/s24-render-health.mjs` (in run-all), `tools/qa/menu-stutter.mjs` (each menu's first and second
  open in the owner's flow: `FLOW=title`, `AB=1` against `?noprewarm`, `B_ROOT=` another checkout interleaved,
  `TRACE=` / `PROF=` breakdowns).
- **Heavy one-off work waits for a moment that hides it**: `G.ui.hidesHitches()` (ui.js) is true on the title screen
  and once a menu or dialogue has finished opening (0.8 s), never on the frame a menu opens. The village's template
  prewarm (`village.js`), the townsfolk rig pool (`game.js`) and the menu prewarm use it.
- **The menu prewarm** (`src/ui/prewarm.js`, started by `UI.init`; `?noprewarm` skips it): in priority order (the active
  hero's icons and the HUD keys' panels first), each panel is built hidden, rendered where that needs no options, and
  painted once for two frames at 0.4 % opacity, inert (its first raster: the GPU shaders of its filters, its images'
  decodes); every skill and carried / stocked item icon is drawn; the hero wheel's cards are built; the build palette's
  thumbnail shaders compile with `compileAsync` and its thumbnails render. Steps run in hidden moments (about 18 ms a
  tick, 40 on the title); only tiny ones use idle slots. `G.ui.prewarm` reports `done`, `left`, `steps`, `longest`,
  `log`. Icons draw on CPU-backed canvases (`willReadFrequently`): their `toDataURL` no longer waits on the GPU. The
  build palette shows cached thumbnails and fills in the missing ones after it opens (`buildMode.fillThumbs`).

## Core modules (owned by the lead — read, don't rewrite)
- `src/core/util.js` math, RNG (`RNG`, `mulberry32`), `Noise`, easing, colors. `src/core/events.js` event bus `Events.on/emit`.
- `src/core/input.js` `Input.down(k)/hit(k)/mouseDown(b)/mouseHit(b)`, `Input.mouse.{x,y,nx,ny,overUI,wheel}`. Keys are lowercase letters, digits, `space`, `shift`, `ctrl`, `escape`, `tab`, `alt`…
  Shift is the sprint (`src/actors/sprint.js`), Alt+LMB attacks in place, a held Z shows the loot labels. A lone Alt and
  Alt + keys never reach the browser, and every key and mouse event resyncs Alt, Shift and Ctrl, so none can stick.
- `src/core/actions.js` **the action layer** over Input and the gamepad (docs/CONTROLS.md §1, as built §8). Gameplay reads
  actions, not raw keys: `Actions.held / pressed / released / consume(action, dev?)`, `move()` (WASD or the left stick:
  dead zone, curve), `aim()` (the right stick), `padAim` (the pad's world aim point), `device` ('kbm' | 'pad', the last
  used: event `input:device`, `body.pad-active`), `binds` / `rebind` / `resetBindings` (Settings › Controls, saved in the
  UI settings' `binds`), `text` / `resolve` (key names for text), `rumble()`. `ACTIONS` holds the defaults (the keyboard
  ones are the old keys). game.js calls `Actions.poll()` at the top of every frame; `G.controls` is it.
- `src/core/touch.js` **the touch device** (CT-5, docs/CONTROLS.md §12): what the on-screen controls (`src/ui/touch.js`)
  hold, in actions (`Touch.hold / release / pulse`), the floating stick (`Touch.stick`), drag-to-aim (`Touch.aim`) and
  the world taps (`Touch.taps`, taken by game.js). Actions reads it as the device `'touch'`: `held / pressed / released
  (a, 'touch')`, `move()` (the stick), `aim()` (the drag, as the right stick); a touch makes it the device
  (`body.touch-active`).
- `src/core/engine.js` `Engine` (renderer, `rig` camera, `post`, `tick()`, `render()`, `mouseGround()`), `LightPool`.
  `engine.preset` is Settings › Graphics (0 Low · 1 Medium · 2 High · 3 Deck), read at boot (ROADMAP R-2);
  `engine.quality` (0..2) is the density tier the worlds build grass, flowers, details and shadow maps with (the Deck
  builds at 1); `engine.deck`; `applyPreset(p)` applies a change live (pixel ratio, AO, tilt, the Deck's shadows), and
  `tuneShadows(world)` (from `setWorld`) gives the Deck preset its smaller sun shadow map over a tighter area, redrawn
  every other frame by `render()`.
- `src/core/deck.js` the Steam Deck profile (docs/CONTROLS.md §10): `deckLike()` (a 1280×800 screen, the desktop app's
  `window.pawhaven.deck`, `?deck`), `bootGraphics()` (the saved preset, `?q=`, or the first start's pick), `DECK` (the
  preset's numbers), `pixelRatioFor()`, `FPS_CAPS`. Also phones and tablets (CT-5, CONTROLS §12.7): `mobileLike()` (a
  coarse pointer and no fine one, `?mobile`), `MOBILE` (the Mobile preset's numbers, `PRESET.MOBILE` = 4), `liteOf(p)`
  (the Deck's or Mobile's numbers, or null), `capTexture(tex)` (the Mobile preset's 1024 cap on hero skins, called by
  `heroModels.js` at load), and the Mobile preset's memory diet (CONTROLS §12.7):
  - `memLite()`: booted on Mobile;
  - `releaseAfterUpload(geo)`: opt-in. A per-instance static geometry drops its JS arrays once uploaded. It is used by a
    dungeon floor's chunks and each pot; never by templates or caches;
  - `releasedGeometries()`: `Engine` saves and reloads on a lost and restored WebGL context once any were released.
  - The building template cache (`world/buildings/index.js`) evicts unused unstyled templates beyond
    `UNUSED_CAP_MOBILE` on Mobile, and the village's prewarm stops at level 1 in two variants.
- `src/gfx/*` materials, post, sky (DayNight), water, textures, geom. `src/world/terrain.js`, `vegetation.js`, `layout.js`, `villageWorld.js`.

## The town plan: Blossom Hollow 2.0 (src/world/layout.js, plots.js, islandShape.js; design: docs/VILLAGE_PLAN.md)
- **One source of truth.** `layout.js` holds `WORLD = 224` (1 tile = 1 m) and the island's features (`ISLAND`,
  `PLATEAU`, `NORTH` cliffs, `HILL`, `BAMBOO`, `POND`, `BASIN`, `RIVER`, `TERRACES`). It also holds the squares (`PLAZA`
  18 × 15 m at (112, 121), the forecourt, the market square), `LANDMARKS`, `STREETS` / `PATHS` (`rank > 1` = a ring's
  stub street, paved when that rank opens), `GREEN_BELTS`, the streetscape (`STREET_LAMPS`, `STREET_TREES`,
  `JUNCTIONS`), the keep-outs (`treeKeepOut`, `doorKeepOut`, `reservedAt`) and the named villagers' `ANCHORS`.
  Terrain, vegetation, details, the sim, the waterfall, the sea, the build camera and the villagers read it, so moving a
  landmark moves everything tied to it. `islandShape.js` is the pure heightfield. `layout.js` imports nothing from
  terrain.
- **Plots** (`plots.js`): `{ id, district, x, z, w, d, door, allows, max, rank, fixed?, starter?, level?, zone? }` in whole
  tiles, plus `DISTRICTS` (10, with map labels; `ring` = the rank that opens it). The helpers:
  - `plotSpot` places a building centred on the frontage, its front on the setback line;
  - `plotReserve` is the box decorations stay out of;
  - `plotLocal` gives yard coordinates;
  - `validatePlots` checks every plot is dry and flat, off the streets, facing one, free of overlaps, with a spot for
    each type. It runs at boot in dev, in `tools/qa/plan-map.mjs` and in s14.
- **VillageSim on plots** (`village.js`):
  - Every `PLOT_TYPES` building stands on a plot (`b.plot`, `sim.plotUse`). `place()` refuses one off its plot's spot.
  - `paintZone` paints whole free, open plots; plotless land paints nothing (`lastZoneHits`).
  - `findLot` picks a zoned plot. `growSpot` / `levelUp` grow inside the plot, toward its back, and stop at its max
    (`atCap`).
  - `checkRings` opens rings by rank, records them in `village.ringRank` (which never goes down), paves the stub streets
    and toasts "New district: …".
  - `paintOverlay('build')` tints plots: free, built (district colour) and locked.
- **New game:** `seedStarterVillage` puts the landmarks on their fixed plots and the starter buildings on their starter
  plots, the same way for each `village.seed`. Then come the plaza furniture, the junction benches and 5 zoned plots.
- **Old saves:** `migrate()` runs when `village.layoutVersion < 2`. It keeps every building's id, type, level, residents
  and seed. It moves the landmarks to their fixed plots and plot buildings to plots by district role, opening the next
  ring if they run out. Decorations keep their arrangement round the plaza. Old zones and paths are dropped, and a
  toast shows once (`village.migrationNote`). The migration is deterministic and idempotent.
- **Yards** (`details.js` `plotYards`, shown per plot by `setPlotBuilt`): fences or hedges, a bed, a small tree, stepping
  stones, a mailbox or a bench, and crop rows on farms. They are drawn in the shared batches; their colliders exist only
  while the plot is built. Build mode adds corner stakes on free plots (`buildMode.refreshStakes`).
- **Perf** (VILLAGE_PLAN.md §8): terrain in 32 m chunks (2 vertices/m in town, 1 outside). Grass density is tiered by
  distance from the town, and `updateGrass` hides chunks past the fog. Many-instance batches are split into 64 m bins.
  The village's batches are `StaticBatchedMesh`: culling spheres are baked once, and a pass whose draw list hasn't changed
  skips re-uploading its indirect texture. Tree spacing and records use spatial
  hashes, and street distance a 16 m segment index.
- Tools: `tools/qa/plan-map.mjs` (the plan drawn from the real code, in Node), `village-plan-shots.mjs` (overhead and
  play shots; `GROW=4` fast-forwards a rank-4 town; `FIXTURE=` shoots a migrated save), `village-perf.mjs` (A/B frame
  times, triangles, memory), `make-v1-fixture.mjs`, and the s14 scenario.

## Characters (src/actors/charKit.js)
- `buildHumanoid(spec)` / `buildBoston(spec)` assemble part meshes under animated groups, then `Rig.bake()` merges every part
  into ONE rigidly skinned mesh + one outline (the groups become the skeleton's bones; the mouth becomes a bone that the
  animator scales). ~3 draw calls per character. The `Animator` keeps driving `rig.parts.*` groups exactly as before.
- Summons/repeats: `cloneRig(template)` shares the baked geometry, with its own bones, skeleton and materials (spirit pups).
- `rig.dispose()` frees a throwaway rig (skips shared geometry). Don't store Object3Ds in `userData` (clone deep-copies it via JSON).
- `enableXray(rig)` adds skinned silhouette twins bound to the same skeleton.
- **Disney style (always, since CT-7 removed the Settings toggle; `?kit=classic` / `?chewy=classic` for the QA)**:
  `makeDisneyHumanoid` / `makeDisneyBoston` (charKit.js) build the same skeleton and part names as the classic kit,
  with parts from `src/actors/disneyKit.js`: per-species heads sculpted at runtime from blended signed-distance forms
  (`src/gfx/sdf.js` surface nets; cached per species, ~30-90 ms the first time, ~12 ms per villager after), eyes with
  iris/pupil caps and lid bones (`parts.lids` / `lidsLow` blink, `parts.jaw` talks and barks), cupped ear plates (the
  dog's rose ear has a tip bone), noses, fingered hands, toed feet, and clothes with collars, cuffs, hems, folds and a
  knotted sash. The mouth: one skull surface slit only along the lip line; the jaw bone pulls the lower face with
  smooth per-vertex weights (`Rig.skinData`, two-bone blends), a dark mouth pocket, tongue and teeth stretch with it.
  No ink outline; `furMaterial()` streaks the coat (uv.x = fur amount). Props held or worn use `rig.propMat`.
  Player Chewy is the Blender-baked model (`src/actors/disneyChewy.js`, `tools/blender/disney/`).
- Refined skins (classic style only) (`src/actors/refinedRigs.js`, pipeline in `tools/blender/README.md`): characters in `REFINED_CAST`
  (Chewy, Shadow) ship a Blender-remeshed skin + colour/AO atlas in `public/rigs/`, bound to the same procedural
  skeleton (`applyRefined` replaces `bake`). Re-run `node tools/blender/build.mjs` after changing their spec or parts.

- Shape language (Pokémon/Pokopia-like): `SPECIES` rows describe a sculpted head (`head` scale, `cheek`, `snout`
  [length, width, height, centre], `tufts`, `eye` [spacing, height]). `sculptor(sp)` deforms a welded unit sphere and
  `at(u, v, lift)` returns a point (+normal) on that surface, so eyes, nose, mouth, blush, brows and ears sit exactly on
  the face. Face details are merged without an ink hull (`faceDetails`); only volumes get outlines.
- Occluders: scenery that can hide Chewy/Shadow stamps stencil 2 (`markOccluder`, applied by `makeToon({occluder})` and
  village buildings); the x-ray pass draws only over stencil 2. The circular cutaway round Chewy (`U.uOccl`, set in
  game.js `updateOcclusion`) is 15% of the screen height at the gameplay distances. It shrinks with the camera
  distance (× 26 / dist), so it stays a person-sized hole in the title, build and overview views and doesn't slice whole
  crowns into wedges.

## Village life (src/actors/villageLife.js, npc.js, lifePoses.js)
- `G.villageLife` (created by the first villager update) owns activity slots derived from `G.sim.list` (benches,
  fountain rim, shop counters, farm, flower beds, fishing spots, statues, notice board, well, lanterns, hot spring),
  claims (one villager per slot), a path grid that prefers paths, props (broom, watering can, rod) and chat pairing.
- Villagers pick activities by `G.day.hour` and personality; talking to one (`talking = true`) drops everything.
  `G.villageLife.force(villager, kind)` is a debug hook. Poses in lifePoses.js only move `rig.parts` groups.
- Villagers have homes (`VillageLife.homeFor` / `doorInfo`, doorstep outside the collider) and bedtimes (`BED` in
  npc.js); at night they step in through the door, Chewy can knock, and quest-targeted villagers wait on the doorstep.
- The 2× town: claim ranges 30 / 38 m (named / townsfolk), strolls 20 m. The tile A* searches up to 24,000 nodes with
  a 1.15-weighted heuristic. Fishing spots are found by landmark (the pond, the river by the bridge), and the named cast's
  anchors are `layout.ANCHORS`. `NavGrid.touchRect` re-costs tiles whose colliders changed (yard fences).
- Small props (not occluders) use material clones with the cutaway off; only buildings/trees write the x-ray stencil.

## Navigation (src/core/nav.js)
- Shared `GridAStar` + per-world 0.5 m clearance grid (`navFor(world)`, exposed as `player.nav` for tests; 448 × 448
  cells in the village, `findPath` capped at 60,000 nodes) and `PathFollow`. Click-to-move, melee approach, interact targets, loot pickup and Shadow's catch-up route through it;
  WASD stays direct. Collider changes are detected lazily (collision objects carry a `_nid`).
- Input: a press released before the next frame stays down for exactly one frame, so every poller sees taps.

## Shadow leads the way (src/actors/shadowLead.js, src/gfx/pawTrail.js, src/ui/leadUI.js — ROADMAP R-17)
- **What he leads to**: `G.questTarget()`, the quest pointer's own objective, so the arrow, the minimap pin and Shadow
  agree. Its result carries where it came from: `Tutorials.target()` adds `{ guide, step, lead }`, `Story.target(only)`
  adds `{ quest, step, lead }` (`only`: that quest's objective). A step says `lead: true` (or `lead(G, q)`) when its text,
  or its giver's line, says Shadow leads: the house tour's door, inside and garden steps, the Board guide's walk, the
  nose guide's sniff, burrow1's first step when you go yourself (Rosie: "Shadow knows the way"), the four zone rescues
  ("Shadow has her scent"). New step type **`reach { at, x, z, r?, floor? }`** (questSteps.js `destOf` / `reachIsHere`,
  `Story.reachPos` / `reachTick`): walk to a spot at home, in a zone or on a dungeon floor; the pointer shows the way there.
- **When**: Settings › *Shadow leads the way* (`ui.settings.shadowLead`): 0 Off (only when asked), 1 Quests (the default:
  the `lead` steps), 2 Always (any objective). Asking works at any setting: **L**, the pad's **R3** on a clean short
  click with no foe within 16 m (in a fight R3 is CT-8's Next target; never the L3 + R3 swap), a tap on the quest
  tracker's quest, the Journal's **Follow Shadow** (that quest; `lead.focus` makes the pointer follow it). Asking again
  stops him for that step (keys are per run of a step: a quest record, a guide run).
- **The route**: one `nav.findPath` from the hero to the objective on the world's clearance grid (the village, a zone,
  a dungeon floor, a house), kept until the objective moves (3 m; 1 m on a short route or with him sat by it), the hero
  strays 6 m off it, or the world changes (`lead.stats.plans`). An objective that's cut off (across water, walled in:
  the start's nav region can't reach within 4 m of it) is **no path**: he stays at heel and now and then turns and
  barks "This way!" toward it; the quest arrow points. A long trek the search gave up on is led as far as it got.
- **Leading** (`Lead.tick`, after his combat AI in `Companion.update`): 3.4 m ahead along the route (4.8 at a sprint),
  his speed from the hero's; at a sharp turn (≥ 49°) he lets the hero close to 2.6 m before going round; the hero 6.4 m
  behind: he stops, looks back, barks "This way!", sits after a while; the hero going another way (12 m, off the
  route): at heel a moment, then a new route from where they are. At the objective he walks onto a spot round it
  (reachable, near the route's end, the camera side, not hidden in the village), paws at it, a heart and a happy bark,
  and sits facing the hero. Nose down to the trail now and then (`groundSniff`, lifePoses.js), tail up (the Animator's
  `tailUp`), standing hidden in the village he steps further on into view. As the whelp he flies the route (no prints).
- **Combat first**: `watch()` keeps a calm clock (his fight, being knocked out, an aggroed foe within 14 m of the hero,
  the hero losing life): any of it drops the lead at once (state `fight`; his own AI fights), and he picks it up after
  2 s of calm. **Packs**: every 0.3 s the route ahead (42 m) is checked against each living monster's notice radius
  (`mode.alertR` or 9, plus 1.4 m) where the pack can see it (`mode.los`): he stops 1.3 m short, faces it and growls
  ("Grrr… yokai ahead!", once a pack; the `growl` sound). A hero who walks on past that point has him at heel.
- **Pauses** (state `off`, `lead.why`): build or decorate mode, dialogue, fishing, a dig, scenes (`controlLocked`,
  `introFocus`, hero switches), a zone's celebration, transitions, his nose or a dig (the nose always comes first), being
  staged, knocked out, or a Whelp Bond move. Indoors only a guide's objective points, so he leads only on the house tour.
- **Readability**: the paw trail (`PawTrail`: ≤ 22 prints, 3.4 s each, an ink pad in a cream rim, one instanced draw a
  world, never additive or bright), "This way!" floats over him (the HUD's `status` float in his blue), the tracker's paw
  on the led quest (`.qt-list[data-lead]`). Debug: Cozy › *Shadow leads the way* (a test walk, the setting, the stats).
- **QA**: `tools/qa/s39-shadow-leads.mjs` (in run-all); test-rpg's reach-step and rescue checks; shots `tools/qa/tmp/r17/`.

## Combat notes
- `player.mouseSets` = [[LMB, RMB] sword set, [LMB, RMB] ball set]; the active pair is mirrored in `hotbar[0..1]`.
  `swapWeapons()` swaps pairs and emits `hotbar:changed {swap, set}`; actions `mouseSet`, `ensureMouseSets`, `setWeaponType`.
- Melee assist in skillRunner (`approachTo`, lunge, hit-frame re-check). `G.vfx.dampers` / `vfx.undamped()` tone down
  effects on a live boss (its own telegraphs are exempt).
- Hero moves that skip walking (dashes, drifts) go through `skills.slideHero(dir, dist)`: 0.25 m sub-steps through the
  walk collision, never ending off the walkable floor. `skills.lineClear(a, b)` tests a straight hop.

## Charged abilities (design, numbers and as-built notes: docs/CHARGE.md)
- Hold an active skill's key to charge it, let go for a boosted release; every active skill of both heroes charges.
  - **Data + rules** `src/rpg/charge.js`: the `CHARGE` tables (one per skill, attached as `SKILLS[id].charge`), `chargeRuntime`
    (the charged params: the table's `apply`, then its balance `tune` via `retune`), `stageTimes`, `chargeCost`, `maxStage`,
    `canLearnPerk` / `learnPerk`, `perkAt` (a perk with its damage scaled to the stage), `chargeInfo` (tooltip lines).
  - **The hold** `src/combat/charge.js` (`G.skills.charge`): fed by game.js for LMB / RMB / 1–4; the 0.18 s grace, the slow
    walk, the stages, the cancels (roll, panel, hotbar or weapon change, death, hero switch, floor change), the zoom cap,
    Toggle / Off (`ui.settings.chargeMode`), the channel wind-up. Events `charge:start|stage|release|spinout|cancel`.
  - **Releases** `src/combat/chargedSkills.js` + `chargedChewy.js` + `chargedMoka.js` + `chargedPoe.js` (her tables:
    `src/rpg/chargePoe.js`, merged into `CHARGE`; her wind-ups via `chargePoses.js addChargePoses`) + `chargedShihtzu.js`
    (his: `src/rpg/chargeShihtzu.js`, the same way; sim models `tools/charge-sim-shihtzu.mjs`): `charged_<id>` methods mixed into
    SkillRunner; most replay the skill's own `cast_<id>` from the wound-back frame (`fromFrame`) and add their extras; `tame()`
    caps the base cast's flashes, rings and crowns so foes stay readable.
  - **Looks** `src/gfx/chargeFx.js` (`G.vfx.charge`, pooled; the charging path allocates nothing per frame), **poses**
    `src/actors/chargePoses.js` (animator action `charge`), **HUD** `src/ui/chargeHud.js`, **K panel** `src/ui/chargePanel.js`
    (the Charge drawer, the ⚡ chips, the tooltip section), **sounds** `src/audio/charge.sfx.js`.
  - State: `player.chargePerks = { [skillId]: { [perkId]: rank } }` (per hero; respec refunds). Action `learnPerk(id, perkId)`,
    event `perk:learned`.
  - Tools: `tools/charge-table.mjs` (CHARGE.md §7), `tools/charge-sim.mjs` (the DPS band; `--solve` writes tunes), QA
    `tools/qa/s19-charge.mjs`, look review `tools/qa/charge-shots.mjs [ids] [--close | --pose]`.

## Game context `G` (src/game.js)
```js
G = { engine, input, events, state /* persistent save */, derived /* computed stats */, actions, ui, audio, vfx,
      mode: 'title'|'village'|'dungeon', world, player, companion, day }
```

## Heroes (src/actors/heroes.js, src/rpg/classes.js — design: docs/HEROES.md, co-op plan: docs/MULTIPLAYER.md)
- One progression per hero in `state.heroes[id] = { player, equipment }`; `state.player` / `state.equipment` are LIVE
  references to the active hero's objects (`state.activeHero`), so every system keeps reading them. The household
  (coins, bag, stash, materials, quests, village, dungeon, day, flags) is shared. The save omits the two aliases
  (`saveableState`); `normalizeHeroes(st)` relinks them on load and migrates v1 saves (the old player becomes Chewy).
- `CLASSES` (classes.js): base stats, life/zoom formulas, weapon types, trees, starter kit. Weapons are class-bound by
  `wtype` (`sword`/`ball` → Chewy, `staff` → Moka; `canWield`); weapon drops favour the active class (`setLootClass`).
  A hero 3+ levels behind the top hero earns double XP; a late joiner starts 2 levels below the pack (`prepareJoin`).
- `HeroManager` (`G.heroes`): `switchTo(id)` (Tab / HUD bubble / "Let's switch!"): locks input, zooms out, swaps
  (`actions.setActiveHero`, `Player.setHero` rebuilds the rig + weapons, per-hero skill cooldowns), glides the camera
  (`G.heroFocus`) to the other hero in the village — or tags them in on the spot in the Burrow while the old hero is
  sent home — and zooms back in. Benched heroes are `Villager`s built with the hero's rig (`opts.rig`, `role:'hero'`:
  fixed home at Chewy's cottage, no hearts/gifts/quests), `retire()`d when played. Moka waits by the fountain
  (`frozen`, story marker '!') until `join('moka')`; new games play `introJoin()` after Rosie's welcome.
- Rigs: `Player.buildRig(style, hero)` → baked film model (`heroModels.js`, public/rigs/<hero>_disney.*) or the kit
  spec `CAST[hero]`; Moka's staff is `heroGear.makeStaff(item.icon)` (six designs by variant).
- Chewy's default baked model is the **samurai Chewy** (`public/rigs/chewy_samurai.*`, sheet E "Black and Gold",
  tools/blender/work/codex/chewy-samurai; docs/HEROES.md §8). Same 37-bone skeleton and face rig as the Toybox Chewy.
  - `chewyModel()` is always 'samurai' (CT-7: Settings no longer offers "Hero models" or "Disney style"; the old saved
    `chewy.model` / `chewy.style` / `chewy.modelV` and the settings' `disneyChewy` / `heroModel` are dropped quietly on
    the first call). `?chewymodel=toy|disney` and `?chewy=classic` stay for the QA only: toy is the Toybox Chewy, disney
    the Storybook heroes.
  - `cfgFor` falls back silently: chewySamurai → chewyToy (the **Toybox Chewy**, `public/rigs/chewy_b.*`) → his kit
    build. The Toybox cast never falls back to a Storybook model (only `?chewymodel=disney` loads those).
  - `HERO_MODELS.chewySamurai` holds its tint, palm / back attach points, the `sayaMount` (the sheathed katana's hilt in
    the saya at his left hip), the cloth and fur grade (`darkGrade` with a chroma gate, `furGrade`, `darkNeutral`,
    `darkFur`: see heroModels.js and docs/HEROES.md §8) and per-model Animator tuning (`anim`: `barkTuck`, `sitThigh`).
  - prod-smoke requires `chewy_samurai` and its saya whenever chewy_samurai.json ships (else chewy_b).
- The companion is the **Toybox Shadow** (`public/rigs/shadow_toy.*`, sources in tools/blender/codex/assets/shadow-toy):
  a quadruped exported with `hero_export.py --contract quad`. That's 21 bones: the legs hang off root, and there are lid,
  jaw and lip joints.
  - `buildHeroModel` builds `poseQuad`'s parts when `meta.contract === 'quad'`, and the Companion and portraits use it
    when it's loaded. Otherwise they fall back to the kit `buildBoston`.
  - `HERO_MODELS.shadow.darkGrade` counters the grade pass's violet lift on his near-black coat, in the hero shader.
    Portraits zero it, because they render ungraded.
  - Install a re-export with `python tools/blender/codex/install_rig.py <export dir> <name>`, which copies all four
    files. prod-smoke requires `shadow_toy` whenever it ships.
- Rosie the baker is the **Toybox Rosie** (`public/rigs/rosie_toy.*`, sources in tools/blender/codex/assets/rosie-toy): a
  villager on the 37-bone hero contract. `game.js` builds her Villager with `buildHeroModel('rosie')` when it's loaded, and
  falls back to the kit `CAST.rosie` otherwise.
  - Her HERO_MODELS entry adds per-model Animator overrides: `wave` ('out' waves and cheers outward; Moka uses 'front') and `squint`
    ([upper, lower] happy lids).
  - It also sets `darkGrade` for her hair and a `hat` anchor for the nightcap.
  - prod-smoke requires `rosie_toy` whenever it ships.
- Moka's default baked model is the **Toybox Moka** (`public/rigs/moka_toy.*`, sources in tools/blender/codex/assets/moka-toy).
  - `cfgFor` loads `mokaToy`; a missing file falls back to her kit build (Toybox style), never the Storybook
    `moka_disney` (that is `?chewymodel=disney` only).
  - Her entry sets `wave: 'front'`, `darkGrade` and `palm`.
  - prod-smoke requires `moka_toy` when playing Moka whenever it ships.
- **Poe** (docs/POE.md): `CLASSES.poe`, the fūma (`wtype: 'fuma'`); skills `src/rpg/skillsPoe.js`, casts installed on
  SkillRunner by `src/combat/poeSkills.js` (+ `poeArts.js`, `poeJutsu.js`, `poeShadow.js`, `chargedPoe.js`), effects
  `src/gfx/poeFx.js` + `poeFxArts.js`, props / smoke copies `src/actors/poeProps.js`, poses `poePoses.js`, sounds
  `src/audio/poe.sfx.js`, icons `src/rpg/iconsPoe.js`. Her look is the baked Toybox Poe
  (`public/rigs/poe_toy.*`, `HERO_MODELS.poeToy`: palm, `fumaMount`, earGain, squint, the samurai's gated coat grade)
  with the Blender fūma (`public/models/poe-fuma.glb`, `poeGear.js FUMA_MODEL`); the kit (`CAST.poe` + `poeKit.js`) is
  the fallback (POE.md §8). prod-smoke requires `poe_toy` and the GLB fūma whenever they ship.
  - Three heroes: tap Tab = `switchTo()` the next joined hero; hold Tab ≥ 0.26 s = the hero wheel (`src/ui/heroWheel.js`,
    `heroes.tabInput`, event `hero:wheel`). `flags.poeJoined` gates her; `G.heroes.poeJoin` (`src/actors/poeJoin.js`) runs
    her Bamboo Grove scene (event `poe:joinScene`) and Shadow's rumour in town; `joinPoe()` joins her.
- **The Shih Tzu** (docs/SHIHTZU.md): `CLASSES.shihtzu`, the flail (`wtype: 'flail'`); skills `src/rpg/skillsShihtzu.js`,
  casts on SkillRunner by `src/combat/shihtzuSkills.js` (the combo, Woeful Wallop, Dripping Paw, the hexes, the guard) +
  `shihtzuArts.js` (the other 13) + `shihtzuAllies.js` (the ghost pups, Grandpaw) + `chargedShihtzu.js`; effects
  `src/gfx/shihtzuFx.js` + `shihtzuFxArts.js` + `shihtzuGhosts.js` (the ghosts: one geometry per kind, instanced pups and
  bones, a solid outline hull); the flail and its verlet chain `src/actors/shihtzuGear.js`; poses `shihtzuPoses.js`; sounds
  `src/audio/shihtzu.sfx.js`; icons `src/rpg/iconsShihtzu.js`. His look is the baked Toybox Shih Tzu
  (`public/rigs/shihtzu_toy.*`, `HERO_MODELS.shihtzuToy`: lidTilt, squint, `flailMount`, the gated coat grade and a white
  cap) with the Blender flail (`public/models/shihtzu-flail.glb`, tinted per base); the kit (`CAST.shihtzu` +
  `shihtzuKit.js`) is the fallback. A new element, **gloom**. `flags.shihtzuJoined` gates him; `G.heroes.stzJoin`
  (`src/actors/shihtzuJoin.js`) runs his Momiji Hollow scene (event `shihtzu:joinScene`) and Shadow's rumour in town;
  `joinShihtzu()` joins him. The hero wheel and the HUD minis take any number of heroes. prod-smoke requires
  `shihtzu_toy` and the GLB flail whenever they ship.
- **Foosy** (docs/GOLDEN.md): `CLASSES.golden`, the lance (`wtype: 'lance'`); skills `src/rpg/skillsGolden.js`, casts on
  SkillRunner by `src/combat/goldenSkills.js` (the reach combo, Sunbeam Thrust, Bonk Dart, the javelins' flight) +
  `goldenArts.js` (the other Lance Arts and Javelins, Steady Paws, Good Retriever) + `goldenWhelp.js` (the Whelp Bond,
  through `Whelp.act`) + `chargedGolden.js` (charge tables `src/rpg/chargeGolden.js`, sim models
  `tools/charge-sim-golden.mjs`); effects `src/gfx/goldenFx.js` (one instanced batch for every javelin); the lance and
  javelin props, the guard and the per-base tints `src/actors/goldenGear.js`; poses `goldenPoses.js`; sounds
  `src/audio/golden.sfx.js`; icons `src/rpg/iconsGolden.js`. His look is the baked `golden_toy` (`HERO_MODELS.goldenToy`:
  a hue-gated warm grade and cap for the coat, `lanceMount`) with the Blender lance and javelin; the kit (`CAST.golden` +
  `goldenKit.js`, the helm built on the classic kits) is the fallback. **Shadow the whelp** (`src/actors/whelp.js`): the
  `shadow_whelp` rig and the mirrored wing prop, worn while `activeHero === 'golden'` (or `Whelp.forced`), a flight mode
  drawn over the companion's ground AI (`poseQuad` fly / grow). `flags.goldenJoined` gates him; `G.heroes.gldJoin`
  (`src/actors/goldenJoin.js`) runs his Onsen scene (event `golden:joinScene`) and Shadow's rumour in town; `joinGolden()`
  joins him. Ground loot is drawn instanced with the monsters (`groundLoot.js` → `horde.js lookIn`).
- **The procedural NPCs (villagers, townsfolk, humanoid monsters) are Toybox-style** by default: `src/actors/toyKit.js`, through
  `makeToyHumanoid` in charKit.js. The targets are the 7 approved sheets in tools/blender/work/codex/npc-kit/sheets.
  - **Style:** `kitStyle()` is the Toybox kit; the QA's `?chewymodel=disney` gives the Disney kit and `?chewy=classic` the
    classic kit. `?kit=toy|disney|classic` overrides both.
  - **Eyes:** oval holes cut into one smooth skull; eye pads creased the face and zigzagged the toon band.
  - **Lids and lashes:** the lid ribbons carry the blink ∪, and the lower lids carry the happy ^ (`rig.squint`). The lash line
    sits on a small bone in `parts.eyes`, so the Animator's eye squash tucks it behind the lids.
  - **Colour and hats:** vertex-colour `darkGrade`, and ear-aware hats per species.
  - **Poses:** `parts.toyArms` makes stretch and yawn raise the arms outward (lifePoses.js).
  - **Test pages:** `/?test=chars&folk=12&seed=N` (townsfolk grid) and `&hats` (species × hat).
- Villager/story lines are written to Chewy: wrap them in `heroText(s, state)` to address whoever is being played.

## Regions (src/regions/ — design, contracts and ownership: docs/REGIONS.md)
- Four outdoor biomes reached from the Wayfarer's Post (village west trail, `LANDMARKS.travel`) through the Travel Map
  (`ui/travel.js`, data from `G.travel.list/go`). `G.enterRegion(id)` shares the Burrow's entry sequence
  (`enterCombatWorld` in game.js). A region is a `RegionMode` (extends DungeonMode: monsters, flow field, bosses, loot
  unchanged) with a `RegionWorld` (terrain, water, mood lighting, the biome's vegetation / effects / critters).
- `G.mode === 'dungeon'` means "a combat world"; `G.dungeon.kind` is 'burrow' | 'zone' | 'region' (`isRegion` is still
  set on a RegionMode). Regions have no stairs, waypoints or floor quests. `layout.theme` = the region id, so audio resolves biome music through
  BIOME_TRACKS / BOSS_TRACKS / BIOME_AMBIENCES.
- Monsters stand on terrain: `Monster.pos.y` = ground height, `m.lift(k)` for effect origins. Region monsters and bosses
  register through `src/regions/monsters/index.js` (`registerMonsters`; per-def hooks `ai`, `update`, `onSpawn`,
  `onDeath`, `damageTaken`, `subtitle`); their sounds are pure-data `*.sfx.js` merged by `src/regions/sfx/index.js`.
- A region opens at its level or when the previous boss falls. Its save state is `state.zones[id]` (`src/rpg/zones.js`);
  `state.regions = { unlocked, cleared, visits }` is a live, unsaved view of it in the old shape (see Zones below).
- Biome recipes (`src/regions/biomes/<id>.js`): the terrain functions plus populate / effects / interactables (the API
  is in REGIONS.md §3.6). Shared placement rules live in `src/regions/biomeKit.js`: the camera-side / lens / landmark
  view guards, bridge decks and trail spots. Landmark POIs are fixed with `layout.poiAt`.
- Water: frozen discs (`terrain.water.frozen`) are walkable ice, and `RegionWorld.heightAt` returns the ice top there.
  Hot springs are `ctx.addPool` bodies with their own level.
- RegionWorld.dispose frees what the scene teardown can't reach (the weather mask texture, batches, the light pool).
  s13 checks round trips for texture/geometry growth.

## Zones, phase A (src/dungeon/defs.js, src/rpg/zones.js, src/rpg/zoneMods.js, src/world/questSteps.js — design: docs/ZONES.md §8.1)
- **DungeonDef** `DUNGEONS` (defs.js, pure): `burrow` (endless, the old rotation) and the four 2-floor zone dungeon
  stubs. `G.enterDungeon({ id, floor, tier, mods })` (or a Burrow floor number) → `DungeonMode.build(arg)` →
  `beginRun` (the def, the clamped floor, the entry's seeds) → `generate({ floor, seed, plan: floorPlan(...) })`. The
  mode has `def`, `kind`, `zoneId`, `tier`, `mods`, `where()`, `nextRun()`, `hasDeeper()`, `exitPos`, `stairsPos`.
- **Seeds** reroll per entry (`state.dungeon.runs`, `state.dungeon.seed`); `?dseed=N` pins them for the tab (`G.dseed`).
- **Hooks**: `zoneMods.packMods` / `monsterMods` in every `spawnPack` (filled in phase E: "Tier runs" below).
- **Save**: `state.zones[id] = { unlocked, visits, regionBoss, village, siegeCamps, dungeon: { cleared, bestFloor, tier:
  { unlocked, cleared }, spirit }, quests }`; `normalizeZones` migrates `state.regions` (boot, `regionState`).
- **Quest steps**: zone filters on `kill` / `boss`, `find`, `rescue`, `dungeonFloor`, `tier`, `villageSaved`
  (questSteps.js); `Story.placeFor` points at the Post, the gate, the stairs, the boss or the way out.
- **Sprint** (`src/actors/sprint.js`, docs/ZONES.md §9.1): Shift, +40%, `player.sprint` → `speedMul`, `anim.sprint`;
  Shadow paces on `player.anim.speed`; Settings › Sprint (`ui.settings.sprintMode`).

## Zone villages (src/regions/village/, src/actors/zoneVillagers.js, src/world/zoneQuests.js, src/rpg/zoneBuffs.js — design and as-built: docs/ZONES.md §2, §2.1, §2.2)
- **Data** `village/data.js` (pure): `VILLAGES[zone]` (names, buildings in screen-polar slots `{ a, d }` round the square,
  camps and their pieces in screen offsets `[u, v, yaw]`, the captain, villagers with Toybox specs, townsfolk seed),
  `ZONE_NPCS`, `slotAt` / `slotOf` / `screenAt` / `screenYaw`; `WAYSTONE` / `WAYSTONE_TINTS` (the shrine's model slot,
  ROADMAP Z-D6). The site is the recipe's `layout.village = { at, r, shore? }` → layoutGen `plan.village` (a flattened
  disc the trail crosses at its level; `shore`: a raw height below which the flattening fades, so a shore village keeps
  its sea; camps / POIs / the wild keep out). Sites: bamboo (55, 58), maple (78, 79), tidepool (20, 66, shore −0.3),
  onsen (60, 76).
- **Runtime** `village/village.js` `ZoneVillage` (one per RegionMode visit): `ZoneVillage.for(mode)` sets
  `layout.hooks.populate` / `mapColor` before the RegionWorld builds; `populate(ctx)` puts the static buildings into the
  region's prop chunks (`ctx.prop`, occluders), colliders (circle grids: buildings turn every way) and nav blocks,
  paints the square and paths, the theme's `decor` (Placer pieces, gates, fences, greenery) and, for a village already
  saved, its saved dressing (`savedDressing(B)`, baked into the chunks: no extra draw calls); `attach(world)` builds,
  while besieged only, the siege overlay and the saved overlay (hidden until the celebration) as region-owned
  meshes (`art.js villageMats / tplGroup`), the cages, lights, villagers, door interactables and `mode.villagePos`;
  a building's siege / saved overlay is built in the building's own frame, seed and warp (`overlayTpl` /
  `withOverlays`; a saved village's overlays ride the building's own prop), so a piece a centimetre off a wall stays on
  it; `start(arrive)` spawns the siege camps (one monster kind and look per camp: one horde batch) and the captain; `update` drives villagers, markers, camp clears, cages,
  the ward, the boss-slot loan, the gloom and the celebration; `captainDefeated` → `saveVillage` + `village:saved`.
- **Art**: `village/art.js` (shared: boards, soot, torn / lit lanterns, war banners, spikes, tents, campfires, debris,
  soft scorch decals, noren, bunting, flower pots, cages, the arena ring, `waystone()` — the one Waypoint Shrine design,
  tinted per zone — and `captainGearTpl({ banner, mark, place })`, the captains' kabuto / sode / sashimono placed per
  base body) and one theme module per village, registered in village.js `THEMES`: `artBamboo.js` (the tiered
  kayabuki `thatch()`; `elder` / `inn` / `shop` / `dojo` / `craft` / `waypoint`), `artMaple.js` (… `teaHouse`),
  `artTidepool.js` (… `fishmonger` / `boatwright`), `artOnsen.js` (… `bathhouse` / `smith`). Each building builder
  returns `{ fp, door, keeper, seat, lamps, siege(B), saved(B) }`; a theme also exports `decor`, `savedDecor`, `MAP`
  (and optionally `gate`, `lanternPost`). Test page `/?test=village&theme=<zone>&state=besieged|saved|plain&focus=i&extras=1`;
  look review `tools/qa/village-shots.mjs --zone <zone> [--both]`.
- **Model slots** (ROADMAP Z-D6): `data.js WAYSTONE.glb` puts a Blender shrine at every village's shrine slot
  (`village.placeShrineGlb`: the kit's footprint, door and rune are kept, its 'tint…' materials take the zone colour);
  `CAPTAINS[id].glb` puts a Blender body under a captain's model (`dressCaptain`: the kit body hidden, the gear, AI and
  hitbox kept). Both are null: the kit versions run.
- **Captains** `village/captains.js`: boss-flagged named variants of a zone monster (`def.captain`, `baseId`), fixed mods,
  their own AI with two signature moves each — Galeclaw (Kamaitachi: Gale Rush, Sickle Storm), Strawgrin (Kakashi:
  Murder of Crows, Harvest Scythe), Brineclaw (Heike-gani: Sidelong Rampage, Tidal Slam's ring wave), Frostbelly
  (Yuki-daruma: Avalanche Roll, Icicle Rain via onsen.js `icicleDrop`); the village wards them (`m.warded`: no aggro, `takeDamage` glances off) until the
  camps fall, then lends them `mode.boss`; RegionMode.onBossDefeated hands a captain to `village.captainDefeated`.
- **Villagers** `actors/zoneVillagers.js` `ZoneVillager` (Actor + a Toybox rig): states caged / hidden / scared / life /
  script, a weighted spot routine routed through the square, seats, greetings; `zoneSpec(id)`, `zoneNpcRig(id)`
  (`G.zoneNpcBuilder`). Their talk and the buildings' services: `village/talk.js` (`villageTalk`, `buildingAction`,
  `wakeLines`; `SERVICES` by building kind: shop, inn, dojo, craft (`craftRun`, also the boatyard's commissions),
  teaHouse (a tea set eaten on the spot: its Well Fed lasts ×1.5), fishmonger (buy; sell the catch ×1.3), boatwright
  (commissions; a row to the sea cave once phase C's gate exists: `mode.gatePos`), bathhouse (heal + Onsen Glow),
  smith (forge a rare piece; re-fold the weapon in hand)).
- **Zone buffs** `rpg/zoneBuffs.js` (pure but for the tick): the bathhouse's Onsen Glow on the hero (`P.soak { left, dur }`,
  saved with the hero; beside, not instead of, the Well Fed meal): `soakAcc` / `soakPost` in `computeStats`, `tickSoak`
  in kitchen.update, `soakChip` in game.js syncBuffs.
- **Quests** `world/zoneQuests.js` (pure): `ZONE_QUESTS`, `QUEST_ITEMS`, `offersFor`, `dungeonObjectives`. story.js reads
  them through `def()`, names zone villagers (`nameOf`), points at them (`zoneTalkTarget`) and exposes phase C's provider
  `G.story.dungeonObjectives({ dungeon, floor, zone, tier })` and `zoneOffers(id, zone)`.
- **Hooks elsewhere**: RegionMode (build / start / update / onBossDefeated / dispose; `campAnchor` keeps the cooking
  campfire at the Wayfarer's Stone), RegionWorld (`isFree` keep-out, `ctx.inVillage`, the populate and mapColor hooks),
  regionTerrain (the trail profile through the clearing), game.js (`G.zoneRespawn`: a knock-out wakes at a saved
  village's inn; `G.registerPortrait`; the Travel Map card's Village row), ui/travel.js.
- Save: `zones[zone].village`, `siegeCamps [{ id, cleared }]`, `quests.{ freed, rescued, met, shop, ninja, trained, innRest }`,
  the hero's `player.soak`.

## Zone dungeons (src/dungeon/zoneGen.js, zoneRun.js, zoneKits/, zoneMonsters/, src/regions/dungeonGate.js, src/rpg/zoneProgress.js — design and as-built: docs/ZONES.md §4, §8.2)
- **Floors** `zoneGen.js` `generateZone({ floor, seed, plan, TH })` (pure; `gen.js generate` delegates for
  `plan.layout === 'zone'`, from `defs.js floorPlan` on `kind: 'zone'`):
  - It returns the Burrow layout shape plus `zone: true`, `slots [{ room, x, y, guard }]`, `arena { x, z, r }`
    (world metres), `arenaMouth { x, z, ux, uz, cx, cy }` and `packTotal`.
  - Spawns can carry `mark` ('champion' | 'unique': quest-drop carriers) and `guard` (the index of the slot they
    guard). Chests can carry `mark`.
  - The arena is the last room (`kind: 'boss'`, `arena: true`). Corridors route round it, so the approach corridor is
    its only way in.
- **Kits** `zoneKits/index.js` `zoneKit(theme)` → a kit object (API documented in that file); DungeonWorld sets
  `this.kit` and asks it at every build step:
  - shaders: `floorGLSL` / `bossGLSL` / `wallGLSL`;
  - walls: `profile` / `roles` / `wallH`;
  - building: `dressWalls`, `buildProps`, `buildLights`, `buildCenterpieces`, `buildArena`, `buildLandmarks`,
    `buildDressing`, `decoMap`;
  - every frame: `update`;
  - lifetime: `init` / `finish` / `dispose`.
  - RoomDresser asks it for the purposes, `arrival`, `hoard`, `extras` and `corridor`.
  - `common.js`: `addPiece` (bakes a region Builder piece into the floor's batches, lights and halos), the Placer
    helpers (`placer` / `finishPlacer` / `disposePlacer`), and the passes every kit shares: `roofShafts` (a few capped
    light shafts through the roof, `kit.buildShafts`; DungeonWorld.buildShafts defers to it), `wallSpots` (mid-scale
    dressing spots along the walls and corners), `kitDecal`, `inStream`, `decoAt`.
  - Themes live in `themes.js` (`ZONE_THEMES`, merged into `gen.js THEMES`), one pure-data file per zone
    (`themeMaple.js`, `themeTidepool.js`, `themeOnsen.js`; bamboo's inline). Kits: `bamboo.js` (`bambooCave`),
    `maple.js` (`mapleHalls`), `tidepool.js` (`seaCave`), `onsen.js` (`iceCavern`).
  - `DungeonWorld.arenaR(b)` gives the arena radius for the floor shader; `DungeonWorld.dispose()` calls the kit's
    dispose.
- **The run** `zoneRun.js` `ZoneRun` (`DungeonMode.zr` on zone dungeons; DungeonMode reaches it through small hooks):
  - **Floor setup** `build()`:
    - asks `G.story.dungeonObjectives`;
    - places the cages, and binds the drop objectives to `sp.quest` or `chest.quest`;
    - warms the boss's adds;
    - builds the arena seal.
  - **Packs and loot**:
    - `spawnPack(sp)`: the formations, champion / unique leaders, fodder pacing (`DENSITY`) and the `def.tank` mix;
      each member's `home` (the camp's disc: `Monster`'s idle wander stays inside it) and `pack.spawnAt` (where the
      formation put each member: s22 measures the widths there; R-14);
    - `xpMul`, `filterDrops` (thinned fodder drops, the carried quest item), `chestDrops`, `onQuestLoot`.
  - **Every frame** `update()`: the cages, the seal, and the arena trigger (`enterArena` → seal, lantern flare,
    `boss.alert()`).
  - **Objectives** `questMark(step)` (exposed as `DungeonMode.questMark`).
  - **The boss and the exit**:
    - `onBossDefeated(b, clear)`: the seal opens; on a first clear, the first-clear chest, the next zone's unlock and
      the banner;
    - `firstClearDrops(chest)`: the zone unique + a rare;
    - `exit()`: the portal's label and destination.
  - **Quest items** fall as ground loot of type `quest` (`combat/groundLoot.js`): a rolled letter with a seal. Picking
    one up emits `quest:find` and adds nothing to the bag.
- **Dungeon-only monsters** `zoneMonsters/<zone>.js` (+ `.sfx.js`): region-monster format (the kit in
  `regions/monsters/bamboo.js`), registered in `regions/monsters/index.js` and `regions/sfx/index.js`. A DungeonDef
  names its monster in `tank`.
- **The gate** `regions/dungeonGate.js`, its looks in `regions/gates/<zone>.js` (`gateLook(zone)`; the format is
  documented in `gates/bamboo.js`; `look.glb` is the Blender gate's slot):
  - `installGate(mode)` (RegionMode.build, after the village attaches; `null` for zones without `def.gate`):
    - drops the region boss spawns;
    - builds the gate at the old arena's far rim from the zone's look (two Placer groups, the gate's own mass apart so
      a loaded `look.glb` model can replace it; colliders and nav blocks; all in `world.disposers`);
    - adds the seal, the interactable and `mode.gatePos`;
    - listens for `village:saved`.
  - `G._zoneArrive.gate` puts the hero in front of the gate (RegionMode.start).
  - `installGateDebug(G, params)`: `G.zoneDebug.saveVillage(zone)` and `?villagesaved=`.
- **Progression** `rpg/zoneProgress.js` (pure): `ZONE_ORDER`, `nextZone` / `prevZone`, `ZONE_UNIQUE`, `openedByPrev`
  (used by `regions/index.js regionUnlocked`), `zoneUnlockOnClear`.
  - Zone boss uniques in `rpg/items.js` carry `zone` and are kept out of the random unique pool.
  - The Travel Map card gets `{ cleared, dungeon: { name, cleared, boss } }` (game.js `zoneCard`).
- **Bosses in arenas**: a region boss reads `mode.layout.arena = { x, z, r }`. A kit-built arena sets r = 17, and the
  boss's own `ARENA_TUNE` applies at r ≥ 15 (tengu.js).
- **The four kits**: `bambooCave`, `mapleHalls`, `seaCave` (its arena's sea edge: `L.arenaSea`, `W.waterAt` /
  `waterLevel` / `inSea`, the sea blocked in `W.walkable`, set by the kit's buildArena), `iceCavern`. A boss lists its
  adds and copies in `def.adds` (zoneRun warms them with floor 2); a theme may tint the boss intro's screen pulse
  (`introPulse`, `introPulseK`); a gate look may set `sealLight`, `sealLightI`, `lanternI`.
- **Audio**: `audio/ambience.js` `BIOME_AMBIENCES[theme]`, `audio/music.js` `BIOME_TRACKS` / `BOSS_TRACKS[theme]`. The cave ambiences: `dungeon_bamboo`, `dungeon_maple`, `dungeon_tidepool`, `dungeon_onsen`.
- **QA**: s22 (the whole loop), gen-fuzz (the zone invariants), test-rpg "ZONE DUNGEONS", prod-smoke
  `zone:bambooDepths`, `profile-horde WORLDS=zone`.
  - Look tools: `tools/qa/zone-shots.mjs` (a game-camera tour of a zone floor: rooms, arena, stairs, treasure, slots,
    streams), and `/?test=regionMonsters&id=iwabozu` (the monster sheet).

## Tier runs (src/rpg/tiers.js, src/rpg/zoneMods.js, src/dungeon/tierRun.js, src/dungeon/zoneMonsters/spirit.js — design and as-built: docs/ZONES.md §5, §5.1)
- **A run** `{ tier 0–5, spirit S, mods }` rides on any `DungeonDef` with tiers: the four zone dungeons and the Deep
  Burrow (`DUNGEONS.burrowDeep`, kind `deep`: two Burrow floors, Crystal Grotto → Moonlit Sanctum and Tamamo).
  `normRun` caps the tier and cleans the mods; `floorPlan` carries `tier`, `spirit`, `mods`; `levelAt` →
  `tiers.runLevel` (+4 a tier, cap 60; Spirit 60).
- **The numbers** (`tiers.js`, pure): `TIERS` (pack, champion chance, quantity / rarity / xp, slots), `spiritInfo(S)`,
  `runInfo`, `slotsFor`, `clearChest` (the Lantern chest's contents), `runLabel`.
- **The modifiers** (`zoneMods.js`, pure): `ZONE_MODS` (17 entries: name, kanji, icon, colour, effect, reward, risk,
  `layout` / `monster` / `boss` / `run` parts), `cleanMods`, `rewardTotals`, `rewardText`, `resolveRun` (everything
  merged once: `mode.runMods`), `layoutMods` (gen.js `generate` calls it on the finished floor with its own seeded RNG:
  pack sizes and caps, Teeming's packs, promotions, chests, shrines, the floor ceiling `FLOOR_CAP`; records `L.modded`),
  `monsterMods` (once per monster: life, damage, speed, attack rate, resistances, `m._el`), `extraItems`,
  `recommendMods`, `surpriseMods`.
- **The run** (`tierRun.js`, `mode.tr` when `runMods.active`): `build()` (Night March's `mode.alertR`, the Elemental
  wrapper over this floor's `combat.hitPlayer`, the ghost warm-up), `start()` (Night March's light and grade, Hard
  Ground's `G.regenMul`, the run toast), `onMonsterDeath` (Haunted's queue → `riseGhost` → `mode.spawnMonster('yurei')`),
  `onDrops` / `onChest` (quantity, boss loot, ghosts' drops, Spirit leaders' uniques), `xpMul`, `mfBonus`, `onShrine`
  (the curse), `startWrath` / `shockwave` (Boss's Wrath), `onBossDefeated` (the Lantern chest, the banner), `dispose`
  (restores the grade, the regen and the hit wrapper). `installTierDebug`: `?run=<id>:<tier>:<mods>[:<spirit>]`,
  `G.tierDebug.run / unlock / clearAll`.
- **DungeonMode** wiring: `runMods` and `tr` in `build`, the banner's run label, `where()` / `nextRun()` carry `spirit`,
  xp / magic find / drops / chests / shrines / the boss through `tr`, `spawnMonster` applies `monsterMods`,
  `clearDungeon` records zone and deep clears (`recordDungeonClear(state, def.id, tier, spirit)`), fires
  `dungeon:cleared` (+ `spirit`, `firstTier`), `tier:unlocked`, `spirit:unlocked`, and Tamamo's story clear opens the
  Deep Burrow's T1. `Monster.update` notices the hero within `mode.alertR || 9`; `actions.tickRegen` scales natural regen
  by `G.regenMul`.
- **Save** (`zones.js`): `tierRecord(state, zone | dungeon id | 'burrowDeep')` → `{ cleared, bestFloor, tier, spirit,
  lantern }` (the Deep Burrow's in `state.dungeon.deep`), `fillTiers` (the migration), `recordDungeonClear`,
  `tierCleared`, `tierOpen`, `spiritOpen`, `spiritBest`, `spiritMax`, `rememberSetup`, `lastSetup`, `TIER_DUNGEONS`.
- **The Yūrei** (`zoneMonsters/spirit.js` + `spirit.sfx.js`, registered with the region monsters): Haunted's ghost.
- **Attack tokens** (`dungeon/tokens.js`, every DungeonMode / RegionMode): `Monster.update` calls `attackToken` when its
  cooldown runs out (beyond melee reach, a pack / kind budget near the hero, WEIGHT for multi-lane attacks) and
  `alertBubble` for its "!"; `releaseToken` on death / vanish / dispose; `tokenStats(mode)` for QA.
- **The Spirit Lantern** (`regions/spiritLantern.js`): `lanternModel`, `placeLantern(G, W, id, { x, y, z, yaw, lightI })`
  (the gate: `installGate`, `look.spirit` / `spiritI`; the village: `installBurrowLantern`, `G.burrowLantern`, updated in
  game.js's village frame), `installLanternApi` → `G.lantern.info / open / enter`. The panel `ui/lantern.js`
  (`LanternPanel`, 'lantern'), icons `ui/lanternIcons.js`, the run chip `ui/runChip.js` (in `.hud-tr`); padNav START and
  HANDLERS entries for `.p-lantern`.
- **The pinnacle, the Four Seasons** (ZONES §5.3): `dungeon/pinnacleLayout.js` (pure: `SEASONS`, `SEASON_LIFE`,
  `PINNACLE_UNIQUE`, `pinnacleLayout(L)` from gen.js `generate` on a pinnacle run's boss floor: the first season's boss,
  `L.pinnacle`, an `L.arena` for the Deep Burrow's room) and `dungeon/pinnacle.js` (`Pinnacle`, owned by `TierRun` as
  `tr.pin`: `share` (a season's life), `seasonFalls(m)` (asked by `DungeonMode.onMonsterDeath` before a boss's death
  counts: true for Spring to Autumn), `spawnNext`, `finale`, the spirits (`raiseStatue`: `buildMonster` of the fallen
  boss with see-through Lambert materials), the echoes (`gale`, `ink`, `roll`, gated by `quiet()` / `bossBusy(b)`, then
  `hold(b, t)` on the boss's own cooldown), the season's air, `onDrops` → `curate` → `dropRing` (the Pinnacle hoard, after the Victory
  banner), `PIN_WHITEOUT` (Yuki-onna's `m.woMul`, read in her `updateWhiteout`)). Also read by `zoneRun.js` (the seal
  stays up until `pin.done`) and `checkFloorClear` (not between seasons); `b.victorySub` sets the Victory line.
- **The endgame uniques**: `rpg/items.js` UNIQUES tagged `spirit` (`zone: 'spirit'` keeps them out of `generateItem`);
  `tierRun.js` `ENDGAME_UNIQUES()` (not the `pinnacle` one) for the chests and leaders, `clearDrops` adds Shiki to the
  pinnacle's chest.
- **QA**: test-rpg "ZONE TIERS", gen-fuzz (three tier setups on every tier dungeon), s30-tiers, `profile-horde`
  `RUN=5:swarming,teeming,rally WORLDS=zone`; look review `tools/qa/tier-shots.mjs`.

## Hordes: big fights (src/dungeon/horde.js, crowd.js, src/combat/grid.js, src/gfx/spriteBatch.js — ZONES.md §7, ROADMAP Z-B)
- **Pooled effect looks and telegraphs** (2026-10-06): `lookIn(mode, root, scene)` (horde.js) draws a pooled effect
  look (a projectile, a crow, a snowball, an icicle: cached geometry, toon / ink materials) instanced with the monsters;
  the region kit's `take()` and the frost effects' pool call it. On flat floors every ground telegraph of a look (the
  region kit's `tele()`, the frost effects' `tele()`) draws in one instanced call (`gfx/teleBatch.js`); outdoors they
  still drape over the hills as meshes.
- **Model cache** (monsters.js `buildMonster`): a Burrow rigid model's merged geometry is built once per kind × variant
  (dust bunnies: 3 random fluff layouts per variant) and region `assemble()` parts are shared, never cloned
  (`geometry.userData.shared`: `Monster.dispose` leaves it; the floor teardown frees the GPU copy, the next floor
  re-uploads). Each spawn still gets its own groups, meshes, materials and animate closure, so everything that writes to
  a model keeps working. Humanoids (tanuki, fox) are one baked template per variant, then `cloneRig` per spawn (own
  bones, skeleton, materials and `spec`).
- **The Horde** (`hordeOf(mode)`, one per combat world) owns:
  - **instanced batches**: a rigid model whose meshes are all toon bodies / ink hulls on shared geometry is *adopted*:
    its root stays out of the scene, and in `scene.onBeforeRender` (main pass only) every visible mesh's world matrix
    goes into one `InstancedMesh` per (geometry, program, render state). Toon bodies carry the hit flash (the
    material's `emissive`) and an exact per-instance normal matrix (squash × turn shears); hulls carry colour and
    width (elite contours); transparent parts (the kurage bell) opacity, back-to-front order; tidepool's GPU-deform
    uniforms (`userData.vhU`, `userData.instU`) become attributes. Batches with the same draw signature share one
    material (no uniform re-upload between them); shadows use one shared depth material. Models outside both the view
    and the sun's shadow frustum are skipped; models whose monster didn't update keep last frame's matrices.
  - **contact rings**: `RingProxy` objects (position / scale / visible / material like the old plane) → one depth-
    sorted instanced quad batch.
  - **the rig pool**: a despawned humanoid's model is reset to its first-build pose and handed to the next spawn;
    `warm(ids)` builds a roster's masters, batches (drawn once below the floor so the driver finishes their programs)
    and a rig per variant at floor load (the theme's kinds + the boss's summons; `DungeonMode.warmMonsters(ids)`).
  - `?noinst`: every model is a scene mesh again (still on the cached geometry), for A/B; `?hordecheck` audits batch
    materials; `?nocull` draws every instance.
- **Crowd grids**: `Combat` keeps allies in their own set (`combat.allies`, insertion order) and enemies in a 4 m grid
  rebuilt on the first query of a frame; `inRadius`, `nearest`, `pickAtScreen` (a cone round the cursor's line, cut
  to the enemies' height slab) and projectile hits read nearby cells and return exactly what the old scans did, in
  the same order (`?gridcheck` compares every answer and fuzzes them; `?nogrid` restores the scans). The floor's
  monster grid (`crowdOf(mode)`, 2 m cells, bosses in a side list) serves `separate`, the chase surround step and
  `alert`; `Monster.sync` keeps both grids current; `pickTarget` reads `combat.allies`.
- **AI LOD** (`updateMonsters`, the monster pass): a monster that isn't aggroed, a boss or within 22 m of the hero or
  an ally, and is off screen, updates every 4th frame with the time it missed; a sleeping humanoid also leaves the
  scene graph. `?nolod` turns it off.
- **Budgets**: damage numbers — 8 plain + 6 crits per frame, the rest of the frame's hits fold into one "+N" total
  (`Combat.dmgFloat` / `flushFloats`); hit sparks — past 32 hits in a frame, plain hits spawn a quarter and no element
  extras (`vfx.hit`). Fast monsters move in sub-steps no longer than their radius (`Monster.move`, knockback).
- **Elsewhere**: `spriteBatch.js` (three's sprite shader, instanced; `?nosprites`) draws projectiles' additive glow
  sprites in one batch per texture, and emote bubbles (render order 20) in depth-sorted runs that keep three's exact
  draw order; additive double-sided VFX render single-pass and share ring / plane geometry (vfx.js); particle layers
  upload only live records and drop the oldest without shifting; N8AO's transparency re-renders skip the redundant
  scene matrix update (post.js); `Collision.resolve` / `solidAt` walk cells without closures; Poe's shots query the
  enemy grid (poeArts.js).
- **Cloning a hero rig**: use `cloneSkinnedSafe` (actors/safeClone.js), not three's `SkeletonUtils.clone`. Hero rig
  nodes keep three objects in `userData` (the ear joints' `tip`, Moka's staff `orb`, Poe's fūma holders' `mat`), and
  `Object3D.copy` deep-copies userData through `JSON.stringify`, which runs their `toJSON` → `Matrix4.toArray()` into
  plain arrays. That one call turns V8's keyed-store feedback in `Matrix4.toArray` generic for the rest of the
  session, and every `Skeleton.update` and `InstancedMesh.setMatrixAt` runs 10–20× slower (25 → 600 ns per matrix,
  ~0.7 ms a frame in a 150 fight). Poe's smoke copies use it (poeProps.js); free copies wait outside the scene graph.
  Still on the old clone: `chargeFx.ghost` (Chewy's charged Afterimage) — the same one-line import swap fixes it.
- **The gate**: `tools/qa/profile-horde.mjs` (in run-all): per world × hero, a floor-alone baseline, then 150 and
  250-monster fights on the same page; a 150 fight passes at p95 ≤ max(8, baseline + 3) ms, with one retry, and a
  machine-load verdict is printed (ZONES §7.1). `tools/qa/horde-shots.mjs` renders frozen lineups for before / after
  pixel diffs and fails on a near-black shot.

## Homestead: farming, fishing, cooking (src/life/ — design and as-built notes: docs/HOMESTEAD.md)
- `installLife(G, village)` (life/index.js, from game.js after the sim, story and services) builds
  `G.life = { tools, garden, fishing, kitchen, update(dt), onNewDay(day), onTalk(npc, say), markerFor(id), teach(recipe),
  onRequestDone(giver) }` and Usagi's Seed Stall. `G.life.update` runs after `player.update`; `village.onNewDay` calls
  `G.life.onNewDay`; `Story.talk` awaits `G.life.onTalk` (Kero's rod and gifts, villagers teaching recipes) and
  `Story.markerFor` asks `G.life.markerFor`.
- **Pure data / math** (node-tested in tools/test-rpg.mjs): `pantry.js` (the 50 goods, prices and buyers, loved and
  liked tastes, seed and forage drops), `cooking.js` (recipes, stations, learning, ingredient planning, mixes),
  `meals.js` (Well Fed), `gardenRules.js` (growth, harvest, sprinklers), `fishData.js` (spots, hours, sizes, the Fish
  Log), `reelSim.js` (the reel minigame's physics).
- **The Pantry**: `state.pantry = { id: n }`, household. Actions: `addPantry`, `hasPantry`, `spendPantry` (all or
  nothing), `sellPantry(id, n, buyer)`, `buyPantry`, `pantryCount`, `eat`, and a `{ type: 'pantry', key, n }` pickup.
  The Pantry view is a tab of the inventory panel (P).
- **Tools** (`tools.js`): props in `rig.parts.handR` (the hoe, the can, the seed pouch, the rods, the ladle) with a short
  posed action, or held (`hold` / `release`). `player.toolOut` keeps the sword sheathed. Moving cancels a chore.
- **Garden** (`garden.js`): Chewy's 4×3 bed plus every Veggie Patch field. ONE interactable follows the tile in front of
  the player (village interactables stay stable, s1). Three BatchedMeshes with one slot per tile. F tills, plants
  (the seed picker), waters and harvests by what the tile needs. Growth happens on `onNewDay`.
- **Fishing** (`fishing.js`, `fishSocial.js`): one interactable per world follows the water ahead. The session runs
  cast → wait → bite → reel (`ui/reel.js` draws a `ReelSim`) → catch. `recordCatch` updates the Fish Log, and the
  `fish:caught` event feeds quests. Kero's quest gives the rod; his Fishing Hut sells rods and buys fish. R-12
  (HOMESTEAD §7): `fishData.reelParams(rod, { relaxed })` (Settings › Fishing, `fishMode`), the cue at the float and
  the card's placement in `ui/reel.js`, the camera's lean (`Fishing.frameFocus`, from game.js), and the balance sim
  `tools/fishing-sim.mjs` (test-rpg; QA helpers in `tools/qa/fish-lib.mjs`).
- **Cooking** (`kitchen.js`, `cookSocial.js`, `ui/cook.js`):
  - Stations: the cottage kitchen, a campfire camp by every Burrow / region arrival point (simple recipes), and
    Rosie's oven (baked goods).
  - The Cook panel's recipes and "Try a mix" go through `kitchen.cookBatch` → `actions.cook`.
  - Eating sets the hero's Well Fed meal (`player.meal`), which `computeStats` folds in (`mealAcc` / `mealPost`) and
    `kitchen.update` ticks down. The HUD shows a chip (game.js syncBuffs) and the G quick-meal belt slot.
- **Villagers**: gifts go through the paged picker (`ui/gift.js`, `ui.pickGift`); loved dishes +16, liked +8, others
  +3. Homestead requests are appended to `requestFlow`'s templates, as `deliver` steps with `pantry: true`.
- **Shops** (ui/shop.js options):
  - `pantry: [{ id, price }]` sells pantry goods;
  - `goods: [{ id, name, icon, price, locked?, once?, onBuy }]` sells one-off wares (rods, cookbook pages);
  - `sellKinds` / `buyer` / `noBagSell` make the Sell tab buy pantry goods at a specialist's price.
- **Quest steps** (story.js): `fish(n)`, `plant(n)`, `harvest(n)`, `cook(n)`, and `deliver` with `pantry: true`.
  Rewards may carry `recipe` and `pantry`.
- **Meshes that visit combat worlds** (the float, line, catch, ice hole, campfire, stove pot) use their own materials,
  never the village's shared `MATS()`, because a combat world's teardown disposes what it finds.

## Guided tutorials (src/world/tutorials.js + guides.js, src/ui/tutorial.js — design: docs/TUTORIALS.md)
- `G.tutorials` runs one guide at a time. A guide is a list of steps (say / objective / target / highlight /
  callouts / flash / waitFor / done / on / allow). The step's world target becomes `G.questTarget` (3D arrow, edge
  arrow, minimap). Progress lives in `state.flags.tutorials` (it resumes after a reload).
- It pauses in dialogue, panels, transitions, switches and build mode, and anywhere outside the village, unless the
  step allows it.
- Old saves past a guide's start get a one-time offer. The Journal's Guides tab replays any guide.
- Guides start on their own only when enabled: off with `?notut`, and with the QA's `?nointro` unless `?tut`
  (remembered per tab), so s1-s15 never meet one; s16 drives them (s17 the housing guides, s19 "Hold to power up!", s20 "Meet Poe", s28
  "Meet <the Shih Tzu>").

## Housing (src/home/ — design and as-built notes: docs/HOUSING.md)
- **Interiors**: `G.mode = 'interior'`. One persistent `InteriorWorld` (home/interiorWorld.js: its scene, the same light
  rig as the village — 1 hemi, 1 shadow sun, the 8-light pool — its own materials and VFX) loads a house per visit and
  frees only that visit's geometry; the village world is swapped out with `G.swapWorld`, never disposed. Rooms are
  pure data (home/rooms.js: home1-3, cottage1-3; two back walls and two cut-down front walls for the 45° camera).
- **Furniture**: home/furniture.js (the catalog, pure: 73 pieces, 13 surfaces, sets, `shop`, `owner`), the models in
  furnitureModels.js / furnitureModels2.js (kit Builder; `KIT` shares the helpers), cached by furnitureMesh.js (never
  disposed) and drawn as one InstancedMesh per piece and bucket. `state.furniture` is the household storage
  (`G.actions.addFurniture/spendFurniture`, 'furniture:changed'); a house's room is `b.interior = { v, layout, wall,
  floor, items }` on its building record. Placement rules are pure (home/placement.js `canPlace`).
- **G.housing** (home/housing.js): enter / exit (the iris), the household jobs, hosting (the benched hero, a villager in
  their own home), decorate mode (home/decorate.js, ui/decorate.js), saved owners (home/owners.js, `b.owner`), the
  merged door prompt (visit / knock), the Home Rating (home/rating.js, pure; `b.homeStars` feeds `b.happy`), the
  owners' reactions, the house card / upgrade / remodel, and `G.housing.ext` (home/exteriors.js: mailboxes, the
  remodelled fences, the scaffold). Getting furniture: home/sources.js (Tanu's stall `G.openTrinkets`, the workbench
  `G.openWorkbench`, finds in `dungeonMode` drops).
- **Exteriors**: `b.style` (world/buildings/styles.js, pure) → `getTemplate(id, level, seed, style)`, a style hash in
  the cache key, the same Builder seed (a remodel changes only the chosen parts); styled templates capped at
  `STYLED_CAP` (24, LRU, only unused ones evicted; unstyled templates are never evicted). `levelUp` keeps the seed and
  the style; interiors grow with the level (home/grow.js `migrateInterior`).
- Story: decorate requests (`story.js decorateRequests`, step type `decorate`, appended after the other templates),
  invitations at three hearts (`friend.invited`). Guides: "Make it home" (Shadow) and "Remodel" (Tanu) in guides.js.
- QA: s17 (interiors, decorating, homes, ratings, requests, upgrades, remodels, the housing guides, leak cycles), s18
  (Tanu, the workbench, finds); `housing-perf.mjs`; test pages `/?test=furniture`, `furnsheet`, `stall`, `upgrade`,
  `buildings&style=`.

## Controls: gamepad and glyphs (design and as-built: docs/CONTROLS.md; ROADMAP CT-1)
- **The action layer** `src/core/actions.js` (see Core modules). Every gameplay read goes through it: game.js
  `handleInput` (the hotbar slots, potions, meal, swap, home, interact, build), the charge machine's `bindKeys` and the
  channels' `holding()` (the slot actions), player.js (the move vector, roll), sprint.js (Shift; the pad's L3 click),
  heroes.js (Tab / LB), fishing.js, tools.js, ui.js `onKey` (the panel keys). Build and decorate modes still read raw
  keys (CT-2).
- **Gamepad aiming** `src/combat/padAim.js` (`G.padAim`): the aim direction (right stick, else left stick, else facing),
  the sticky soft lock in a cone (the combat grid's `inRadius`; Settings › Aim assist scales the cone), the aim point
  (`Actions.padAim`, also read by `charge.cursorGround` and Moonbeam), the target ring (one canvas-textured plane, in the
  scene only while locked), `pickInteract` (in front preferred), `foeNear`, and the rumble hooks.
- **Auto targeting** `src/combat/autoTarget.js` (`G.autoAim`; CONTROLS §13, ROADMAP CT-8): Settings › Controls ›
  Targeting Off / Assist / Auto per device (`targetingOf`, the migration), the `AIM` table (every active skill's aim
  kind) and `aimSpec`, the pure picks (`scoreFoe`, `bestCluster`, `bestLine`, `bestCone`), the all-round lock
  (`pickLock`, `ranked`, `nextAfter`: padAim.js calls them in Auto), `aimFor(id)` (where each skill goes in Auto: game.js
  `padCast` / `slotAim`), `assist()` (the mouse's snap) and the AoE marker (`tick`, from game.js `handleInput`; draped
  on the ground and faded at a drop: `markerGeometry` / `drapeMarker`). The words: `aimWords(text, id)` (a skill's
  "the cursor" per device and Targeting; ui/rpg.js's `desc` getter and the charge perks use it) and `aimLine(id)` (the
  skill tooltip's Targeting line). `steerPoint()` is what Moonbeam and the drift perks steer by after the cast.
- **A** is context-sensitive (game.js): an interactable highlighted and no foe within 5 m → interact; else the basic
  attack at the lock (charge, short melee magnetism).
- **Glyphs** `src/ui/padGlyphs.js` + `pad.css`: `padGlyph(token, style)` (Xbox / PlayStation SVG in the game's ink
  style), `keyCap(action)` (a `data-act` cap that `refreshCaps()` redraws on a device or bindings change), `keyHint` (an
  emphasised key in guide or dialogue text). The HUD tags its caps; the prompt takes `{ act }`.
- **Menus with the pad**: ui.js `padInput` runs in this order:
  1. the dialogue (`padDialogue`: A / D-pad / B) and the title (`padTitle`);
  2. the Controls rebinding capture;
  3. build and decorate mode (`padCursor`);
  4. View (the map, or a guide's "Got it!") and Menu (Esc);
  5. any open panel (`padNav`).
- **Spatial focus** `src/ui/padNav.js` (CT-2, CONTROLS §9.1):
  - the scope is the popover, the guide's offer, or every open blocking panel;
  - it moves cone-first, then by edge gap with a row toll;
  - A clicks, or the element's handler (`HANDLERS`: bag slots pick up / put down, Y equip, X drop / sell / stash; skill
    nodes learn, Y assign, X charge perks; shop wares; Pantry eat);
  - B goes back (`ui.back`), LB / RB switch tabs;
  - tooltips anchor to the focus (synthetic hover events); `.pad-ring` and the `.pad-hints` footer show where it is;
  - each panel remembers its last focus.
- **The virtual cursor** `src/ui/padCursor.js` (CT-2, CONTROLS §9.3): in build and decorate mode the left stick moves a
  paw cursor (`Actions.vcursor`). `Actions.pointer()` is what buildMode.js and decorate.js aim with (the mouse
  otherwise). The D-pad walks and picks the palette; their A / B / X / Y / RB / LB reads are in those modules.
- Settings › Controls lives in menu.js (tabs per device, rebinding, rumble, aim assist, glyph style). While the pad
  plays, the pause menu gets a panel row (plus Build, Decorate and Home where they apply).
- QA `tools/qa/s25-gamepad.mjs` with the virtual pad `tools/qa/pad-lib.mjs`; look review `tools/qa/pad-shots.mjs`;
  test-rpg "CONTROLS".
- **Touch** (CT-5, CONTROLS §12): `src/ui/touch.js` + `touch.css` (`ui.touch`), a layer between the HUD and the panels,
  shown while touch plays. It moves the HUD's own hotbar slots, belt and weapon badge into its buttons (and home again
  for another device), so their icons, cooldowns and charge looks keep working. The floating stick, the attack button
  (game.js treats touch like the pad: A's context interact, `padAim`'s soft lock; `padAim.target(e)` is a tapped,
  manual lock), the skill arc with Auto or Drag aim (a ground mark: `touchAimMark`), roll, the belt, hero / bag / menu;
  canvas taps (`game.js touchTap`: lock a foe, walk to and use, or walk) and pinch (into `Input.mouse.wheel`). The
  quest arrow asks it what to avoid (`avoidArrow`). Settings › Controls › Touch (`touchSize`, `touchOpacity`,
  `touchLeft`, `touchAim`, `haptics`). In build and decorate it becomes the edit buttons (Build / Set down, Turn,
  Cancel, Store, Undo, Done) and the finger is the cursor (`Actions.tcursor`, through `Actions.pointer()`). Fishing
  reels on a held touch (`Touch.hold('reel')`). The hero wheel is fitted to the free play area (`fitWheel`: a ring, or
  a row of cards on a phone).
- **Phones and tablets** (CT-5, CONTROLS §12.3–12.7): `src/ui/mobile.js` + `mobile.css` (`ui.mobile`), everything
  round the play controls:
  - the screen classes `.m-touch`, `.m-phone` and `.m-tablet`, and the safe area (`--sa-*`; `?safe=` for the QA);
  - the menus' scale (`--m-pscale` 0.86 on a phone) and a 12 px text floor (a MutationObserver);
  - phone panels fitted with their bodies scrolling, the title, tabs and close at the bottom, and pairs taking turns (the
    flip chip);
  - the menu gestures (double-tap is the right-click, long press is the tooltip);
  - the rotate overlay (`ui.isPaused` while upright), full screen on the first tap, and the K panel's folding charge
    drawer.
  - The Mobile preset is in `core/deck.js` and the Engine (`postPreset`: SMAA low; `Post.noChroma` keeps the hit aberration pass off).
  - `public/manifest.webmanifest` and `public/icons/` serve Add to Home Screen.
  - QA: `tools/qa/s27-touch.mjs` with `touch-lib.mjs` (CDP multi-touch), `touch-shots.mjs`, `mobile-ui.mjs` (every
    menu at phone size), `mobile-perf.mjs` and `mobile-mem.mjs` (WebGL memory counted at the context; the JS heap
    after a GC), and prod-smoke's `touch` case.
- **The Steam Deck** (CT-3, CONTROLS §10): `src/core/deck.js` (above). On a Deck-like screen's first start: the Deck
  graphics preset and the UI at 1.15; `ui.root.deck-ui` turns on `src/ui/deck.css` (the safe area: the UI layers inset
  12 / 18 px; the text floor: the design's sub-12 px text raised to 12; the toasts above the hotbar). The Deck preset:
  Medium density, pixel ratio ×0.85, AO and tilt-shift off, `Engine.tuneShadows` (1536 over 0.82 of the area),
  `Engine.render` redraws the shadow maps every other frame (only for its own render), the particle cap ×0.6 (`PARTICLE_BUDGET` in gfx/particles.js, set by game.js). Settings › Frame cap (Off / 60 / 40):
  game.js `frame()` skips display frames to the cap. QA: `tools/qa/s26-deck.mjs` (the profile, R-2, the cap, the text
  floor), `tools/qa/deck-ui.mjs` (every panel at 1280×800: text under 11 px, panels cut off, screenshots),
  `tools/qa/deck-perf.mjs` (frame times in four scenes with the CPU throttled).
- **The desktop app** (CT-4; docs/DESKTOP.md, CONTROLS §11): an Electron shell in `tools/desktop/` (`main.cjs`
  serves the build on `app://pawhaven`, one chrome-less window, F11 / Alt+Enter, `window.json`; `preload.cjs` gives
  `window.pawhaven` { desktop, deck, platform, version, isFullscreen, setFullscreen, onFullscreen, quit }). The game's
  side is `src/ui/desktop.js` (Settings › Full screen, the Quit buttons; inert in a browser). `npm run build:desktop`
  (`build-desktop.mjs`: vite `base './'`, electron-builder for Windows zip / portable and `linux-unpacked`, then
  `appimage.mjs`'s own AppImage writer and a tar.gz with exec bits) → `release/desktop/`. Electron and electron-builder
  are devDependencies only. QA: `tools/qa/desktop-smoke.mjs` (the packaged Windows app via Playwright's Electron),
  `tools/desktop/verify-squashfs.py` (the AppImage read back).

## The cozy path, phase A (src/cozy/ — design: docs/COZY.md; ROADMAP CZ-1, CZ-2)
- **Pure modules** (node-tested in tools/test-rpg.mjs "COZY"):
  - `clock.js`: the world clock (`state.cozy.clock = { h, wall }`): world hours in every mode at the day clock's rate
    (`SECS_PER_HOUR` 35), stopped while paused; `sleepHours`; time away (`awayHours`, `catchUp`, `OFFLINE_CAP_H` 8,
    the wall-clock high-water mark `markWall`: a clock set back counts 0, a jump forward only the cap); the board's words
    (`aboutHours`, `backIn`, `backBy`, `realSpan`).
  - `state.js`: `normalizeCozy` (boot, after `normalizeZones`; lazy and idempotent, `v: 1`), `cozyOf`, `heroAway`,
    `tiredLeft`, member keys `hero:<id>` / `hire:<id>`.
  - `objectives.js`: `objective(state, id)` (errands `errand:<day>:<area>:<id>`, rebuilt from the id; the reliefs
    `relief:<zone>`), `errandsFor` (3 a world day per open area), `storyObjectives` (phase A: `STORY_READY`, Takemori),
    `objectivePower` (camps still standing), `RELIEFS` (gates as data).
  - `expeditions.js`: power (`heroPower`, `crewPower`), odds (`oddsOf`, `chance`), `gateCheck`, `canSend`, `resolve`,
    `partialProgress`, `rollLoot` (never uniques or gems), `xpFor`, `startExpedition` / `finishExpedition`,
    `brokenExpeditions` (load audit), `crewLines`.
- **The runtime** `expeditionRun.js` `installCozy(G, village)` (game.js, after housing) → `G.cozy = { clock: { h, day, add },
  exp: { send, cancel, list, reports, objectives, info, read, take, unread, finishAll, … }, guild, scav, tick, pulse,
  heroAway, awayInfo, awayNow, showAway, board }`. game.js calls `G.cozy.tick(dt)` every frame (the clock; the mark each
  frame; a stall over 5 s, a hidden tab, counts as time away); crews come home every 0.5 s of play; a siege relief
  returning while you're in its zone outdoors waits (`hold`); `village:saved` from you brings a relief crew home early
  ("beaten", supplies back); a relief saves the village (`saveVillage(…, 'crew')`, the cages freed, `celebrate` for the
  next arrival's banner). Heroes walk off to the Wayfarer's Post when sent and back in on return. The Cozy debug section
  (`registerDebug('cozy')`). Events: `expedition:sent`, `expedition:back { uid, obj, result }`, `cozy:changed`,
  `hero:away { id, away }`, `hero:levelup { id, lvl, from }` (actions `addXpTo`).
- **The board** `expeditionBoard.js`: the model beside the Post (one merged mesh, its hull, a lantern), colliders, the
  F interaction, a "!" while a report waits.
- **UI**: `ui/expeditions.js` + `.css` (the Expedition Board panel, 'expeditions'), `ui/awayCard.js` ('awayCard'),
  `ui/cozyChip.js` (the crews chip in `.hud-tr`), `ui/cozyIcons.js`, `ui/cozy.css` (the chip, the away badge on the hero
  wheel and the HUD minis, the away card). padNav START / HANDLERS entries (`.p-exp`: Y best crew, X clear).
- **Hooks**: heroes.js (`away`, `bench` / `next` / `spawnBench` / `canSwitch` skip away heroes, `benchShown`, `roster`'s
  `away`), heroWheel.js, hud.js (benchTick), rpg/actions.js (`addXpTo`), rpg/zones.js (`savedBy`, `celebrate`,
  `dungeon.crew`, `saveVillage(state, id, by)`), world/services.js (sleep adds the skipped hours), ui.js, padNav.js.
- **QA**: test-rpg "COZY", `tools/qa/s31-expeditions.mjs` (the cozy route end to end: a fresh game, no fighting, Takemori
  saved; away heroes; the hold rule; time away; pad and phone; shots in `tools/qa/tmp/s31-expeditions/`), prod-smoke
  `cozy`, `tools/expedition-sim.mjs` (the pace).

## The cozy path, phase B: the peaceful overworld (src/cozy/ — design and as built: docs/COZY.md §6, §13.2; ROADMAP CZ-3, CZ-4)
- **Pure modules** (test-rpg "COZY: THE PEACEFUL OVERWORLD", "COZY: THE SIGHTINGS BOARD"):
  - `peaceful.js`: `WILD` (radius, packs, the level rule, ranks, leash 6 m, trail gap 3 m), `normArea` / `wildAreas`
    (recipe `layout.wild` → `{ id, name, jp, x, z, r, packs, spur }`), `wildAt` / `inWild`, `areaIssues` / `wildIssues`
    (the trail check), `isPeaceful` (+ the session `setPeacefulOverride`), `peacefulFilter`, `wildRank`, `wildLevel`
    (clamp(hero + 2, band low + 2, band top + 1)), `pastLeash`, `titled`.
  - `sightings.js`: `rollSightings(day, zones)` (3 a world day, seeded), `bountyFor` / `packCoins`, `sightingsToday`,
    `clearSighting`, `renownTitle` / `nextTitle`, `sightingsOf` (`state.cozy.sightings = { day, list, renown, total }`;
    `normalizeCozy` keeps it).
- **The layout** (`regions/layoutGen.js`): `makePlan` drops a wild area that fails the trail check (`plan.wildIssues`),
  keeps camps and POIs out, adds a side path (`entry`) and a `wild` disc (flattened by regionTerrain like a camp);
  `generateRegion(def, { visit, mlvl, heroLvl })` adds 2–3 packs per area (tagged `wild`) and a golden cache (`wild`),
  with their own RNG. `layout.wild`.
- **The mode** (`regions/regionMode.js`): `build` sets `layout.peaceful`, filters the spawns, sets `layout.glades`, adds
  today's sightings (`G.peaceful.addSightings`), wraps the layout's populate hook with `wildPopulate` (the markers) and
  adds a saved village's notice board (`G.peaceful.zoneBoard`); `start` makes a `WildRuntime` and tags the wild and
  sighting packs; `spawnPack` honours `sp.monster`; `wildAt(x, z, pad)`. RegionWorld's populate ctx: `inWild`, `wildAt`,
  `peaceful`, `glades`; `isFree` keeps a wild disc's floor clear (r − 2.5).
- **The runtime**: `wildWorld.js` (`WildRuntime`: the leash, the entry toast, `wild:enter` / `wild:cleared`, the
  sighting packs' names, pins and the bounty trigger, the debug rings); `wildMarkers.js` (`wildMarker` gateway kit piece,
  `edgeTint`, `wildPopulate`); `wildKit.js` (`farAt`, `tallOk`, `spots`, `gladeGround` for the biomes' dressing);
  `peacefulRun.js` `installPeaceful(G, village)` (game.js, after scavenging) → `G.peaceful = { isPeaceful, wildAreas,
  wildAt, override, sightings, hoursLeft, renown, card, addSightings, claim, board, zoneBoard }` and the Cozy debug
  actions; `sightingsBoard.js` (Blossom Hollow's board beside the Expedition Board). Event: `sighting:cleared`.
- **The biomes**: each recipe's `wildDressing` (bamboo, maple, onsen; Tidepool's in `assets/tidepoolWorld.js`) dresses
  its two areas and, on a peaceful visit, the glades; their effects add glade critters to existing batches.
- **UI**: `ui/sightings.js` + `.css` ('sightings'; also the map legend swatches and the Travel Map's dot), `ui/map.js`
  (`LEGEND_REGION`), `ui/travel.js` (the Trail / Wild / Sighting rows, `.tv-sight`), `world/minimap.js` (`wildMark`,
  `sightingPin`, `pawMark`, phase C's `scavMarks`), padNav (`.p-sight`: A opens the Travel Map).
- **QA**: `tools/qa/s32-peaceful.mjs`, prod-smoke `peaceful`, `tools/qa/wild-shots.mjs`.

## The cozy path, phase C: scavenging (src/cozy/ — design and as built: docs/COZY.md §7, §13.3; ROADMAP CZ-5, CZ-6)
- **Pure** (test-rpg "COZY: SCAVENGING"): `scavenge.js`: `NODE_KINDS` (21: name, verb, mats / pantry / coins ranges,
  model), `AREA_DEFS` (home and the four zones: node counts, the dig table, 2–3 spots a day, the dig mound's ground),
  `scavState` (`state.cozy.scav`), `areaRec` (the world-day refill), `takeNode` / `findSpot` / `digSpot` (the streak),
  `spotCount` / `pickSpots` / `spotId`, `gatherYield` / `digYield` (a Perfect dig's bonus roll), `digResult` (the band,
  `DIG_BAND` 0.7–0.85 of `DIG_SECS` 1.4), `questFind` / `markQuestDig`, `staleAreas` (the away card), `meanGather` /
  `meanDig` (the sim), `SCAV_XP` (CZ-9's numbers).
- **Runtime**: `scavengeWorld.js` `installScavenge(G, village)` (game.js, after installCozy) → `G.cozy.scav = { area,
  view, nodes, spots, busy, session, gather(id), digAt(id, { k }), reveal, refill, mapMarks, setWild, update, ringSpeed,
  screenWhy, homeSites }`; `life/index.js` calls its `update(dt)` every frame. A view per world (the village's lives for
  the session; a zone's is built on `mode:changed` and taken out of the scene by the region's disposers): placement
  (`HOME_SITES` / `HOME_DIG`; `zoneSlots`, `digSlots`), the camera check (`occluders`: a 0.5 m column grid of the opaque
  scenery; `screened`: the heightfield and the grid marched along the camera's line from the game yaw and both 45°
  yaws), one BatchedMesh (`scavengeModels.js scavBatch`), one Points sparkle and one instanced ground-ring cue (`ringMaterial`; 3 draws an area), the interactables (a node each and a
  pool of 4 dig spots, parked at y −50 when hidden or taken, so the village's list never changes length), the gather
  (`tools.run({ anywhere })`), the dig session (control locked; the hold read from interact / attack / reel on every
  device; the stand-beside staging; `ui/digRing.js`), Shadow's nose, the day's refill (`cozy:changed` and every frame),
  the away card's lines, the Cozy debug actions.
- **Models**: `scavengeModels.js` `nodeGeos(model)` → `{ full, taken }`, `digGeos(ground)` → `{ mound, dug }` (Builder
  pieces flattened to position / normal / colour, cached for the session), `scavMaterial()` (one vegToon, never disposed),
  `scavBatch`, `placeAt`, `studioGround` (QA).
- **Hooks**: `actors/companion.js` (`noseTo`, `digWith`, `digDone`, `scavTick` ahead of combat and the whelp),
  `actors/lifePoses.js` (`scavDig`, `pawDig`, `sniff`), `actors/animator.js` (a quadruped's front paws scoop on `dig` /
  `pawDig`), `life/tools.js` (`anywhere`), `life/life.sfx.js` (`sniff`, `dig_perfect`), `life/cooking.js` (`poundMochi`
  with `out: { mat, n }`, `MAKES`, `dishDef`) + `rpg/actions.js cook` + `ui/cook.js` + `life/pantryIcons.js` (Pound Mochi),
  `ui/menu.js` (Settings › Dig with Shadow: `settings.digMode` 0 hold · 1 tap), `ui/awayCard.js` + `expeditionRun.js`
  (`away.refills`), `game.js` (install; Shadow's tips wait while `G.cozy.scav.busy`). Phase B's `world/minimap.js` draws
  `mapMarks()`.
- **QA**: `tools/qa/s33-scavenge.mjs`, `tools/qa/scavenge-shots.mjs`, `tools/scavenge-sim.mjs`, prod-smoke `dig`.

## The cozy path, phase D: the Adventurers' Guild and hires (src/cozy/ — design and as built: docs/COZY.md §5, §13.4; ROADMAP CZ-7, CZ-8)
- **Pure** (test-rpg "COZY: THE ADVENTURERS' GUILD AND HIRES"): `guild.js`: `fillGuild` / `guildState` (`state.cozy.guild`;
  `normalizeCozy` calls it), `HIRE_CLASSES` (Guard, Archer, Scout, Healer, Porter: suits, perk, look, lines), `classSuits`
  / `classBonus` (+15% once a crew) / `crewClasses` / `scoutHours` / `porterMats`, `rollCandidates` / `candidatesToday` /
  `candidateLevel`, `canHire` / `signOn` / `dismiss`, `settleWages` (per world day, back pay first) / `payBack` /
  `dailyWages`, `hireReturn` (XP on `hireXpToNext`, morale, trips), `hirePower`, `hireWhy`, `ROSTER_CAP` / `CREW_CAP` /
  `GUILD_RANK` / `hireLevelCap`, `upgradeCheck` / `levelPerks`, `GUILD_TOOLS`. The expedition core reads it:
  `expeditions.js` `memberInfo` (a hire's card), `crewPower` (the class bonus), `memberWhy` (on a break), `maxCrew`,
  `tripHours(o, crew, state)` (a Scout), `resolve(…, soft)` (a Healer), `crewSoft` / `crewHaul`, `crewLines` (a hire's
  voice).
- **Runtime**: `guildRun.js` `installGuild(G, village)` (game.js, after installPeaceful) → `G.cozy.guild = { level, built,
  rec, open, candidates, hire, dismiss, payBack, roster, hireInfo, upgradeInfo, upgrade, tools, buyTool, nameOf, faceHTML,
  bannerLine, dailyWages, inTown, hachi, newDayIn, talkHachi, talkHire, settle, debugBuild, debugHires, folk }`; it wraps
  `G.cozy.tick` (a crossed world day settles the wages at once; after an absence the lines go to the away card's
  `away.guild`), syncs the level from the building (`village:changed`, `building:levelup`), upgrades through the houses'
  scaffold (`G.housing.ext.construct` → `sim.levelUp`), and registers the Cozy debug section's Guild actions.
  `hires.js` `installHires(G, run)`: `HACHI_SPEC` (+ `hachiExtras`: brows, the walking stick in `handR`, the map case),
  `hireSpec(h)` (the seed's townsfolk + `CLASS_LOOK` extras), the `GuildFolk` villagers (Old Hachi, role `shop`, at the
  door; a Villager per hire, `v.hire`, homed at the Guild; `interacted` overridden to the Guild's talks), `leave` /
  `walkIn` on `expedition:sent` / `expedition:back`, `inTown()`, `prewarm` (the rig built behind the panel).
- **The model** `world/buildings/guild.js` `guild(B, level)` (levels 1–3, the kit's Builder; `crest`, `bigSign`,
  `crossedArms`, `weaponRack`, `trainingDummy`, `yardBoard`, `wallMap`, `staff`, `pack`, `supplyCart`), registered in
  `models.js`, `index.js` DETAIL `[1, 2, 2]`.
- **UI**: `ui/guild.js` + `.css` (`'guild'`: Hire · Roster · Guild, the two boards); `ui/expeditions.js` (hires in the crew
  picker, the class chip and bonus, `at: 'guild'` sends, the crew cap), `ui/awayCard.js` (At the Guild; hire faces and
  names), `ui/cozyChip.js` (hire names), `ui/sightings.js` (`at: 'guild'`); padNav `START.guild`, `.p-guild button`.
- **Hooks**: `world/buildings/catalog.js` (`guild`), `world/plots.js` (`CIVIC`, `PLOT_TYPES`), `world/buildMode.js`
  (`RANK_REQ.guild`, `keepWhy`: the Guild stays while hires live there), `world/village.js` (`interactionFor` 'guild',
  the banner's wages line in `onNewDay`), `game.js` (install; `syncTownsfolk` counts the hires first; unique townsfolk
  ids), `cozy/state.js` (`fillGuild`), `cozy/expeditionRun.js` (`members` lists the hires; a hire's XP and morale on the
  return; the Porter's haul; `tripHours`; `away.guild`), `cozy/scavengeWorld.js` (`redraw`).
- **QA**: `tools/qa/s34-guild.mjs`, prod-smoke `guild`, `tools/qa/guild-shots.mjs`.

## The cozy path, phase E: the story rerouted (src/cozy/ — design and as built: docs/COZY.md §3, §13.5; ROADMAP CZ-9)
- **Pure** (test-rpg "COZY: THE STORY REROUTED"): `cozy/objectives.js` gains the story's crew routes: `BURROW_ROUTES`
  (burrow1, king, umbrella, oni, tails → objective `quest:<id>`, kinds `quest` / `burrowBoss`, their gates, trophies
  and the boss whose quest unique waits), `questRouteStep` / `questLeft` (your kills and floors shrink the need),
  `DUNGEON_ROUTES` + `dungeonRouteOpen` (`dungeon:<zone>`: the zone dungeons' first clears, 2 Heart Treats needed),
  `RELIEFS[z].trophy` (the captains' banners), `STORY_READY` (all four reliefs), and the zone villagers' quests
  (`zq:<quest>:<step>`: a find, a rescue, a kill count, a floor, a boss once the dungeon is cleared; `zoneQuestStep` /
  `villageObjectives`; `o.trail` from a partial), `burrowErrandLevel` (the Burrow's errands go as deep as the story).
  `expeditions.js`: gate kind `quest`, `supplies.freeLunch` (Rosie's lunch counts as fed), `supplies.potionsNeed`, a quest
  partial, the trophy (a success only) and burrow1's Mochi Jelly in `rollLoot`; **the XP model** `XP_SHARE` /
  `xpLevelMul` / `xpFor` (a share of a level, level-matched); `levelGapMul` in `crewPower` (a member far below the
  objective pulls less); `oddsOf` makes a trail found a sure thing at r ≥ 0.9. `guild.js`: `candidateLevel` = the
  strongest hero − 2, at least 3 (`CAND_MIN`). `rpg/zones.js` `recordCrewClear(state, id)`
  (`dungeon.crew`, T0 counted and T1 open, `dungeon.cleared` untouched; `fillTiers` keeps a crew's Lantern awake),
  `rpg/zoneProgress.js` `openedByPrev` reads `dungeon.crew`.
- **The story** (`world/story.js`): `crewObjectives` (= `storyObjectives`), `completeStep(id, i, { crew })` (the step
  done as yours would be; `q.crewSteps` / `q.crewBy`: the Journal says "· done by Moka's crew"), `crewResult(id, result,
  { crew })` (a success does every fight step left; a partial half of burrow1's kills or a boss quest's floor), `owe` /
  `payOwed` (a quest unique whose boss a crew beat is kept in `state.quests.owed` until your own win over that boss:
  `boss:dead`), `homeTalkTarget` (ROADMAP R-4).
- **Runtime** (`cozy/expeditionRun.js`): `complete()` applies a quest route through `G.story.crewResult`, a dungeon
  clear through `crewClear(zone, crew)` (recordCrewClear, `noteFloor`, `zoneUnlockOnClear`, any boss step of that
  dungeon done by the crew, `dungeon:cleared` / `tier:unlocked` with `crew: true`, the gate's Lantern refreshed live),
  Tamamo through `wakeDeep()` (the Deep Burrow's T1); the trophy to storage (`addFurniture(…, { src: 'trophy' })`); the
  report's `quest` / `cleared` / `deep` news; `beatenAll()` ("You beat us to it!" for quest and dungeon routes, on
  `quest:update` / `dungeon:cleared`, a tick later); `relieve()` keeps `zones[z].celebrateCrew`; `zoneQuestResult()` (a
  zone villager's step: the item home, a rescued villager walking home (`villager:rescued` with `crew: true`), a floor
  noted, half a count on a partial; the turn-in talk stays yours); `objectives('village')` (the Board's Villages tab).
- **Homestead XP** (`cozy/homesteadXp.js`, installed from game.js): `HOME_XP`, `homeXp`, `homeXpBase`; the events
  `garden:harvest`, `fish:caught`, `dish:cooked`, `building:placed` (new, `world/village.js place`), `scavenge:gather`,
  `scavenge:dig` pay the hero being played (`actions.addXp`, the "+N xp" float); event `homestead:xp`.
- **The kill-request swap**: `Story.scavengeRequest(npc)` replaces half the "defeat yokai" asks in `requestFlow`.
- **The celebration on arrival**: `regions/village/village.js` `party` (a crew's save not yet seen: the saved look built
  as a growable group), `startParty()` → `cozy/crewParty.js` `crewParty(village, keys)` (the crew as Actors: heroes'
  own rigs, hires' Toybox villagers, either side of you at the Waypoint Shrine; they cheer, then walk off and poof);
  `updateCelebration` plays the crew's banner ("… drove the siege off"). Event `village:celebrate`. The heroes'
  joining scenes wait for it (`calm()` in poeJoin / shihtzuJoin / goldenJoin).
- **Trophies**: `home/furniture.js` set `trophy` (`TROPHY_IDS`: 4 Burrow bosses, 4 zone bosses, 4 captains' banners;
  `trophy: <boss id>`, never sold), the models in `home/trophyModels.js` (`TROPHY_BUILDERS`, registered in
  `furnitureMesh.js`).
- **UI**: `ui/expeditions.js` (the keepsake and story chips, the quest title, the report's ribbons, the Villages tab and
  its icon in `ui/cozyIcons.js`; padNav's X / Y work there too), `ui/travel.js` +
  game.js `zoneCard` (the 救 stamp and "cleared by a crew"), `ui/panels.css` `.tv-stamp.crew`.
- **QA**: test-rpg "COZY: THE STORY REROUTED"; `tools/qa/s37-cozy-story.mjs` (the headline: a fresh game to the Bamboo
  Depths' crew clear with no fights; the keepsakes in a room; all four sieges and their celebrations; the whole story to
  the Onsen Caverns with no fights); prod-smoke `crewclear`; the pace: `tools/expedition-sim.mjs` (Takemori) and
  `tools/story-sim.mjs` (all four zones).

## The cozy path, phase F: UI polish, tutorials, QA (design and as built: docs/COZY.md §10, §11, §13.6; ROADMAP CZ-10…CZ-12)
- **The Board** (`ui/expeditions.js` + `.css`): on the mouse, the pad and tablets the crew cards are compact (a face,
  the name, level and power, the class and the state; three columns, three rows, a full Guild roster scrolls) and the
  odds and *Send off!* share a row, so the panel fits 1600×900, 1280×720 and the Deck (`.deck-ui`: the crew two rows,
  the job's line clamped). An away member's tag is short ("back ~2 h"; the title has it in full). The phone's picker
  counts by key (`current(L)`, `step()`: `list()` builds fresh objects, so `indexOf` said "0 of 2").
- **The Guild** (`ui/guild.css`): the roster's rows are `max-content` (a card's buttons stay inside it), the away pill
  keeps its time on one line.
- **The Journal's Crews tab** (`ui/crewLog.js`, `ui/map.js` QuestPanel, `cozy.css .cl-*`): the crews out (faces, the
  job, a bar, the time left), the totals (reports, successes, out now, keepsakes) and the report log; a row opens that
  report on the board (`at: 'journal'`, read-only). The Journal's five tabs share their row (`panels.css .q-tabs`).
- **The pause menu's Crews** (`ui/menu.js`, the quick row on a pad or touch): opens the board's Reports or Away to read
  (`at: 'menu'`); a "!" or the count on it. The HUD chip does the same on a click or tap; its phone hit area is 44 px.
- **Away heroes**: the HUD minis get a time pill ("~2 h", `ui/cozyChip.js minis()`, refreshed with the chip each second;
  the backpack badge moved to their top left); the wheel's card tag is short ("Away · ~2 h", `ui/heroWheel.js awayTag`);
  on touch's row of cards the tags sit under the cards (`touch.css`), clear of the hub. `ui/touch.js fitWheel` marks the
  text floor dirty (`ui.mobile.floorDirty`): its observer never looked inside the wheel, so a fitted wheel's text could
  draw at 8 px.
- **The tutorials** (`world/guides.js`: `board`, `nose`, `guild`; `cozy/cozyGuide.js`; `world/tutorials.js offer(id)`;
  `ui/tutorial.js` knows Old Hachi): Rosie's welcome line (game.js); her burrow1 question once after the house tour
  (`flags.burrowChoice` 'self' | 'crew'; "Send Moka" starts the Board guide); Shadow's Nose after the answer (after the
  Board guide on the crew path; its last steps wait for Moka's crew, spotlight the report and give Rosie the last
  word); Old Hachi's guide when the Guild stands; the Board guide offered on a fighter's first look at the board; the
  Peaceful paths tip (`G.hint('peaceful')`) and the minimap spotlit for 3 s on the first visit to a saved zone. Every
  line follows the device (`dv(touch, pad, keys)`, *F* through `keyHint`). Event `cozy:burrowChoice { choice }`.
  `G.cozyGuide = { ask(), choiceOpen }`. `ui/tutorial.js` + `tutorial.css .tut.low`: on a phone with a panel up, when the
  spotlit element sits under the dock's place at the top, the objective card moves into the panel's title band (between
  its title and ✕); the Nose's wrap waits for the board to close, so a phone shows Rosie's line. (R-14 replaced `.tut.low`
  with `TutorialUI.place()`: `.tut.band` / `.tight` in the title band's free strip, else `.tut.strip` along the top with
  the panel moved down by the UI root's `.tut-strip` / `--tut-push`; `tools/qa/ui-audit-lib.mjs guideOverlap` checks it
  in `cozy-guide-shots.mjs` and `mobile-ui.mjs`.)
- **Fixes**: `expeditionRun.finishAll` (the debug action) puts a trip a hair past due (`start + hours − h` could round
  to just above 0 and stay out).
- **QA**: `tools/qa/cozy-ui-lib.mjs` (`seedCozy`: something in every cozy surface; `cozyScenes`; `quietUi`), run by
  `mobile-ui.mjs` (phone, `DEVICE=ipad`), `deck-ui.mjs` (now `[view…]` too) and `cozy-ui-shots.mjs` (desktop, 1600×900
  and 1280×720) → `tools/qa/tmp/{mobile-ui,deck-ui,cozy-ui}/cozy-*`; s16 g–j (the cozy guides end to end, the device
  wording, the fighter's offer, Old Hachi, Peaceful paths, old-save offers; `S16_ONLY`); s31 g (a real 0.5.1 save:
  `tools/qa/fixtures/precozy-0.5.1.json`, made by `tools/qa/make-precozy-fixture.mjs` against a 0.5.1 server); s31 e and
  s23 key their waits on the game's state (the pad's board, the soak's length, the leak trend: R-6).

## Persistent state `G.state` (JSON-serialisable, saved to localStorage)
```js
state = {
  version: 2, activeHero: 'chewy', heroes: { chewy: { player, equipment }, moka: { … }, poe: { … }, shihtzu: { … }, golden: { … } }, // (saved)
  // player / equipment below = heroes[activeHero].player / .equipment (live aliases, not saved)
  player: { cls:'chewy', name:'Chewy', lvl:1, xp:0, stats:{str:10,dex:10,vit:12,ene:8}, statPts:0, skillPts:1,
            skills:{ chomp:1 }, hotbar:['attack','chomp',null,null,null,null], // [LMB, RMB, 1, 2, 3, 4]
            chargePerks:{ chomp:{ stages:1 } },                // charge perks bought per skill (docs/CHARGE.md)
            life:null, zoom:null, activeWeapon:0 },           // life/zoom current (null = full)
  coins: 120,
  materials: { wood:20, stone:10, petal:0, crystal:0, bone:0, mochi:0, silk:0, lantern:0 },
  potions: { heart:3, zoom:2, rejuv:0 },                      // belt counters: Q = heart, E = zoom
  inventory: Array(40).fill(null),                            // 10x4 grid, one item per cell (uniform cells)
  equipment: { weapon:null, weaponAlt:null, hat:null, outfit:null, collar:null, charm1:null, charm2:null, boots:null, paws:null },
  stash: Array(60).fill(null),
  quests: { active:[], done:[] }, friends: { /* villagerId: {hearts, talkedDay, gifts} */ },
  village: { layoutVersion:2, ringRank:1, seed, buildings:[{ id, idx, type, x, z, rot, level, seed, residents, built, plot? }],
             zones:[[x,z,t]], paths:[[x,z]], day, income, stats, migrationNote? },   // (owned by the village sim)
  dungeon: { deepest:0, waypoints:[1], seed, runs },          // the Burrow (seed / runs: per-entry rerolls, dungeon/defs.js)
  zones: { bamboo: { unlocked, visits, regionBoss, village, siegeCamps, dungeon: { cleared, bestFloor, tier, spirit }, quests }, … },
  // regions: { unlocked, cleared, visits } = a live view of zones (not saved; rpg/zones.js)
  day: 1, hour: 8.5, flags: {},
  // the homestead (docs/HOMESTEAD.md; household, lazy-init: old saves load with empty ones)
  pantry: { turnip: 3, koi: 1, onigiri: 2 }, pantryFound: { id: day },
  garden: { v, tiles: [{ x, z, till?, crop?, stage?, wet? }], day, seeded: { plotId: true }, lastSeed },
  fishing: { rod: 0|1|2, milestones: [5, ...], gotRod?, pendingMilestone?, lastRecord? },
  fishLog: { id: { n, best, day, spot, time } },
  // flags.tutorials = { active, [guideId]: { step, started, offered, done, skipped } } (docs/TUTORIALS.md)
  // housing (docs/HOUSING.md): furniture: { id: n }, furnitureFound: { id: day }, trinkets: { day, rank, list, sold },
  //   workbench: { known, crafted }; per building record: interior, owner, style, homeStars
  cookbook: { known: { recipe: day }, cooked: { recipe: n }, quick },
  // per hero: heroes[id].player.meal = { dish, buff, tier, left (s of play), dur } (Well Fed)
  cozy: { v, clock: { h, wall }, exp: { active, reports, progress, done, errands, tired, seq }, guild: { level, hires: [{ id, seed, name, cls, lvl, xp, morale, since, owed, unpaid, floor, onBreak, trips, wins }], seq, cand: { day, list }, wages: { day, paid, short, total, banner }, met }, scav: { [area]: { day, taken, found, dug, quest }, tools, stats, cheat }, sightings }, // the cozy path (src/cozy/state.js, scavenge.js)
}
```

## Save flow (src/core/autosave.js, src/ui/saveGlyph.js — ROADMAP R-11)
- **Write**: `G.save()` (game.js `save()`) skips while `G.saveBlocked` (the debug menu's Restore), never stores a
  knocked-out hero (`life: null`), stamps the hour and day, then `writeSave(saveableState(G.state))`: the stored save it
  replaces is copied to `chewy3d.save.prev` first (a rotating backup; only when the stored one is known good, and not when
  it is unchanged), then `chewy3d.save`. A full storage (`QuotaExceededError`) drops `.prev` and retries; still full →
  one toast a session, no exception. The debug menu's slot (`chewy3d.save.debugBackup`) is separate and untouched.
- **Read**: `loadSave()` → `autosave.loadSave(validate)`: parse + `version` + the normalizers (`normalizeHeroes` /
  `normalizeZones` / `normalizeCozy`; idempotent, so boot runs them again harmlessly). A main save that won't parse or
  normalize boots from `.prev` with a gentle toast (and isn't rotated over it). No main save is a new game: `.prev` is
  never used then (New Game removes the main save).
- **When**: mode changes (dungeon / region / village / houses), the menu's Save and Quit, the desktop app's Quit game,
  game events that call `G.save()` themselves, plus the autosave module's:
  - **timed**: Settings › Autosave (`ui.settings.autosave` = index into Off / 1 / 2 / 5 min, default 2 min). Counts play
    time only (page visible, not paused, not the title). Any save restarts it.
  - **events** (≤ 1 per 20 s; a burst folds into one save at the window's end; dropped if the game saved after the event):
    `quest:update`, `player:levelup`, `hero:levelup`, `village:changed`, `building:levelup`, `house:upgraded`,
    `hero:joined`, `village:saved`, `villager:rescued`, `village:campCleared`, `dungeon:cleared`, `region:cleared`,
    `pinnacle:cleared`, `tier:unlocked`, `spirit:unlocked`, `expedition:sent`, `expedition:back`, `item:pickup` of a
    unique / set item, `coins:changed` with `delta ≤ -300` (a big purchase). Off stops only the timed saves.
  - **deferred, never skipped** while `blocker(G)` names something: `saveBlocked`, the title, the hero down, a
    transition (iris, a house door), a hero switch, a cutscene (`introFocus`, `introJoinPending`, `cutscene`), a joining
    scene (`heroes.poeJoin / stzJoin / gldJoin.busy`), a boss fight (alive and aggro / intro / within 14 m), an arena
    seal, a build-mode tool or drag, a decor piece in hand. It goes 4 s after the blocker clears.
  - **page lifecycle** (every platform; was touch-only in ui/mobile.js): `visibilitychange` → hidden, `pagehide`,
    `beforeunload`; one write per burst (600 ms), not on the title.
- **Cost**: the module times every write (`G.autosave.stat`). Over 4 ms (a running average) the autosave waits for
  `requestIdleCallback` (3 s cap). A fat late-game save (5 heroes, every zone / tier / village, 160 stash items, ~210
  buildings, every furniture; 151 KB) stringifies in ~0.7 ms and writes (with the rotation) in ~1.4 ms on the dev PC.
- **Glyph**: a paw pill, "saving…", in the HUD layer's bottom-left (bottom-right on touch, left-handed), so inside the
  safe area / itch inset / Deck margins; ~1.6 s; no toast; `prefers-reduced-motion` drops the paw steps.
- **Test hooks**: `G.autosave` — `manual = true` (the real 1 s clock stops), `advance(s, { play })`, `state()`, `log`,
  `life`, `stat`. QA: `tools/qa/s36-autosave.mjs`.

## Items
```js
Item = {
  uid, kind:'gear'|'gem'|'material'|'gift'|'key',
  base:'boneSword',            // key into ITEM_BASES
  slot:'weapon'|'hat'|'outfit'|'collar'|'charm'|'boots'|'paws', wtype:'sword'|'ball' (weapons only),
  rarity:'normal'|'magic'|'rare'|'unique'|'set', name, ilvl, req:{lvl, str?, dex?},
  dmg:[min,max] (weapons), aspd (attacks/s, weapons), def (armor pieces),
  affixes:[{ id, stat, value, text }],   // stat keys = derived stat keys below
  uniqueId?, setId?, sockets:0, gems:[], qty? (stackables), value (coins), flavor?,
  icon:{ shape, colors:[...] }           // drawn by src/rpg/icons.js (canvas → dataURL, cached)
}
```
Rarity colours: normal `#f4efe6`, magic `#6ea8ff`, rare `#ffd84a`, unique `#ff9a3c`, set `#5ee07a`.

## Derived stats `G.derived` (computeStats(state) in src/rpg/stats.js)
`str dex vit ene lifeMax zoomMax lifeRegen zoomRegen dmgMin dmgMax dmgPct aspd atkSpeed castSpeed moveSpeed crit critDmg def block
 resFire resFrost resZap resStink (cap 75) lifeSteal zoomSteal fireDmg:[a,b] frostDmg zapDmg stinkDmg mf gf thorns
 allSkills treeSkills:{bone,fetch,spirit} xpBonus pierce cdr lifeOnKill shadowDmg shadowLife weaponType:'sword'|'ball'`

## Actions `G.actions` (src/rpg/actions.js) — every mutation of player/inventory goes through these, and they emit events
`equip(invIdx)`, `unequip(slot)`, `swapWeapons()`, `moveItem(from:{c:'inv'|'stash'|'equip', i}, to:{c,i})`, `dropItem(from)`,
`pickup(item)→bool`, `usePotion('heart'|'zoom'|'rejuv')`, `sellItem(from)`, `buyItem(item, price)`, `learnSkill(id)`, `addStat(key)`,
`setHotbar(slot, skillId)`, `learnPerk(skillId, perkId)`, `addXp(n)`, `addCoins(n)`, `spendCoins(n)→bool`, `addMaterial(k,n)`, `hasMaterials(cost)`, `spendMaterials(cost)→bool`, `recompute()`.
Homestead: `addPantry(id,n)`, `hasPantry(req)`, `spendPantry(req)→bool`, `sellPantry(id,n,buyer)→coins`, `buyPantry(id,price,n)`,
`pantryCount(id)`, `eat(id)→{heal,meal}`, `cook(recipe,n,{picks,learn})`, `spendMix(picks)`, `learnRecipe(id)`, `tickMeal(dt)`.

## Events (Events.emit(name, payload))
`inv:changed`, `equip:changed`, `stats:changed`, `coins:changed`, `materials:changed`, `potions:changed`, `player:levelup {lvl}`,
`skill:learned {id,lvl}`, `item:pickup {item}`, `item:drop {item}`, `quest:update`, `toast {text, icon, color}`,
`mode:changed {mode}`, `village:changed`, `friend:changed {id}`, `boss:spawn`, `boss:dead`, `player:dead`.
Homestead: `pantry:changed {id,n,delta,first}`, `garden:till|plant|water|harvest {i,...}`, `garden:newDay`,
`fish:caught {id,size,spot,first,record}`, `fishing:rod`, `dish:cooked {id,n}`, `recipe:learned {id}`, `meal:eaten {id,heal,meal}`,
`meal:expired`, `gift:given {id,key,love,pts}`.
Guides: `fishing:start|cast|nibble|early|bite|reel`, `fishing:end {result}`, `home:menu`, `home:menuClosed {choice}`,
`tutorial:start|step|done|skip|offer`.
Charge: `charge:start {id,slot}`, `charge:stage {id,stage}`, `charge:release {id,stage,ok}`, `charge:spinout {id,stage,t}`,
`charge:cancel {id,reason}`, `perk:learned {id,perk,rank}`.
Zones: `monster:killed {id,rank,floor,zone,dungeon,tier}`, `boss:dead {id,floor,zone,dungeon,tier}`, `mode:changed` (+ zone,
dungeon, tier), `dungeon:cleared {id,kind,tier,floor,zone,boss,first}`, `tier:unlocked {id,zone,tier}`, `region:cleared {id,times}`;
phase D emits `village:saved {zone, village}` (with the "…is saved!" banner), `villager:rescued {npc, zone, dungeon: null}` (a siege cage) and
`village:campCleared {zone, camp, left}`; phase C emits `quest:find {item,n,...}` and `villager:rescued {npc, zone, dungeon, floor}` (a dungeon cage).

## UI (src/ui/) — HTML/CSS overlay above the canvas (`#ui`), lots of spring/bounce animations
`UI.init(G)`, `UI.update(dt)`, `UI.toggle(name)` / `open` / `close` / `isOpen` / `anyModal()` for
`inventory|character|skills|quests|map|build|menu|shop|stash|seeds|cook|gift`, `UI.toast(text,opts)`, `UI.banner(title, sub, {style})`,
`UI.float(worldPos, text, {kind:'dmg'|'crit'|'heal'|'xp'|'coins'|'miss'|'status', color})`,
`UI.dialogue({speaker, portrait, lines, choices})→Promise`, `UI.setTarget(info|null)`, `UI.setBoss(info|null)`,
`UI.setInteract(text|null)`, `UI.transition(fn)`, `UI.lootLabel(add/remove)`.

## Dungeon room dressing (src/dungeon/roomDressing.js)
After DungeonWorld builds walls, wall props, lights and centrepieces, `dressRooms(world)` gives every non-boss room a
purpose from its biome's list (burrow camp / veg patch / mushroom grove / den; shrine tea room / altar / gravel garden /
koi pond / study / dojo; kitchen prep island / range / oven / feast / pantry / scullery; crystal geode / columns /
frozen pool / miners' camp) and places its set pieces in the room interior with a small constraint search: off corridor
mouths, trails, runners, spawns, chests, pots, shrines, stairs, arrival and waypoint (`keepClear`), keeping an open
fighting ring and walking lanes. Only big pieces get round colliders. Everything appends into the existing chunked
batches; flat things (mats, gravel, ponds, snow, flour) are floor decals (`DECAL_PARS`). The later clutter pass keeps
off claimed footprints (`W.noClutterAt`). `globalThis.__noRoomDress = true` skips it (perf comparisons).
Model detail (dungeonWorld.js): wall kits per biome (burrow timber frames with knee braces, plank boards and nail heads,
root shelves; shrine pillars on stone bases with bracket blocks, a tie-beam ridge in the wall profile, hanging scrolls,
noren, ema racks; kitchen tile wainscot + chair rail in the profile/shader, corbelled posts, pan/herb rails, plate
racks, stove niches, serving hatches, menu boards; crystal ribs and geode pockets), `buildLandmarks()` (flagstones,
lamps, a down-arrow sign and an open trapdoor/grate round the stairs; rune plates round the waypoint) and arena pieces
(`toriiGate`, `giantShroom`, `bigCauldron`). The detail pass draws from its own stream (`W.krng`) so older placements
stay put. Chests and pots are built once per look in `src/dungeon/lootModels.js` (cached, cloned per instance so a
floor's teardown / a pot breaking frees only its own buffers); DungeonMode.makeChest / makePot use them.

## Land details (src/world/details.js)
Curb stones, trodden grass, wildflower drifts, forest-edge ferns/logs/mushrooms, the pond dock and reeds, bridge-bank
dressing, plaza bunting/signpost/hopscotch, the forecourt, the market square, Pond Loop benches, terrace walls, street
lanterns, plot yards, the shrine approach, beach shells — built once from VillageWorld and drawn
through vegetation's batches as vegetation records, so buildings/paths/zones that claim the ground clear them (with
their colliders and lights). Big set-pieces reserve their tiles (VillageSim.canPlace refuses them). Details that belong
to a building (firewood, laundry, mailbox, crates, menu boards) live in its template (src/world/buildings/*).
`&nodetails` skips the land details (perf comparisons).

## Buildings (src/world/buildings/)
`BUILDINGS[id] = { name, cat:'home'|'shop'|'craft'|'service'|'decor'|'special', size:[w,d], cost:{coins,wood,stone,…},
 levels, desc, cover?:{kind:'water'|'joy'|'light'|'health'|'learn', r}, zone?:'R'|'C'|'W' }`
`buildModel(id, {level, seed}) → { group, lights:[{pos,color,intensity,radius,nightOnly}], door:Vector3, footprint:[w,d], height, glow:[materials] }`
`setNight(model, t)` → window/lantern emissive.
- Detail level: `B.detail` / `B.richness` (0 humble .. 2 rich, `DETAIL` in index.js per id/level) drives trim — tile-end discs
  (plain / mon dot / gold mon), lichen and moss on roofs, plaster patches, window dressing (shutter box / sudare / koshi grille),
  ranma transoms, onigawara extras. Dressing randomness uses the Builder's second stream (`B.dr/drand/dpick/dchance`) so
  the main stream (props, trees, stones) never shifts when details are added.
- `walls()` records `B._wall`; `shoji/roundWindow/door` frame themselves against it (`trim.wallSpan`: flanking posts,
  head beam, rain stains, handles). `roof()` returns `underAt(x,z)` (eave underside incl. corner upturn) for hanging
  things; `yAt(x,z)` is the top surface. `trim.js`: charms (furin, teru teru bozu, persimmons, bells…), rain chains,
  hanging signs, fuda plaques, futon, asagao, ema rack, omikuji, tanabata, kadomatsu, tool racks. `G.beam()` = bevelled
  timber (28 tris) — prefer it or plain boxes over `RoundedBox` (108 tris) for trim.
