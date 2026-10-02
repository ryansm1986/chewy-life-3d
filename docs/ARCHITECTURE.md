# Chewy Life 3D — Architecture & Contracts

A cozy, hand-painted, isometric 3D village life-sim (Hello Kitty Island Adventure vibes) with
SimCity-style village planning and a Diablo-2-style dungeon ("The Burrow"). Three.js r186 + Vite, plain ES modules (no TS).
Quality bar: **8.5/10 polish** — every screen should feel finished, animated and cute.

## Cast
- **Chewy** — main character. Humanoid chibi chocolate-brown dog (#8a4a2c), lighter muzzle, **white chest blaze**,
  amber eyes, semi-floppy rose ears. Wears a navy gi (#2c3a6a) with red scarf + red sash. Weapons: **Bone Sword** (melee)
  or **Red Tennis Ball** (thrown, returns). `X` swaps weapons.
- **Moka** — second playable hero (docs/HEROES.md): Boykin Spaniel mage, chocolate wavy coat, long pendant ears, amber
  eyes; seafoam capelet, lavender robe, floppy seafoam wizard hat; a **staff** (Energy scales its damage). Water /
  starlight / duck-hunt spells. `Tab` switches heroes; the hero you're not playing lives in town as a villager.
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
- Post debug: `&off=ao,tilt,main,smaa` disables passes, `&raw` renders without post, `&q=0|1|2` quality, `&hour=13` time of day.
- QA: `node tools/qa/run-all.mjs [s1 s5 ...]` (11 browser scenarios). Profilers: `tools/qa/profile-boot.mjs` (boot → ready),
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
- `makeToon` hooks: `vertexPars`, `vertexWorld`, `fragPars`, `fragColor` (after color_fragment), `fragNormal` (perturb the
  view-space `normal`), `fragOut` (modify `outgoingLight`). Every hook string is part of the program cache key.
- Canopies (`vegetation.js` `LEAF_EDGE`): grazing-angle leaf-lobe discard for ragged silhouettes + a cellular floret texture
  (`floretTexture()`) used as a dome bump so crowns read as clusters, not balls.
- Additive glows must fade their **alpha** to 0 at the quad edge (texture or analytic falloff); a flat-alpha additive quad shows
  as a box through the post chain. Dungeon halos use an alpha-preserving additive blend.

## Core modules (owned by the lead — read, don't rewrite)
- `src/core/util.js` math, RNG (`RNG`, `mulberry32`), `Noise`, easing, colors. `src/core/events.js` event bus `Events.on/emit`.
- `src/core/input.js` `Input.down(k)/hit(k)/mouseDown(b)/mouseHit(b)`, `Input.mouse.{x,y,nx,ny,overUI,wheel}`. Keys are lowercase letters, digits, `space`, `shift`, `escape`, `tab`, `alt`…
- `src/core/engine.js` `Engine` (renderer, `rig` camera, `post`, `tick()`, `render()`, `mouseGround()`), `LightPool`.
- `src/gfx/*` materials, post, sky (DayNight), water, textures, geom. `src/world/terrain.js`, `vegetation.js`, `layout.js`, `villageWorld.js`.

## Characters (src/actors/charKit.js)
- `buildHumanoid(spec)` / `buildBoston(spec)` assemble part meshes under animated groups, then `Rig.bake()` merges every part
  into ONE rigidly skinned mesh + one outline (the groups become the skeleton's bones; the mouth becomes a bone that the
  animator scales). ~3 draw calls per character. The `Animator` keeps driving `rig.parts.*` groups exactly as before.
- Summons/repeats: `cloneRig(template)` shares the baked geometry, with its own bones, skeleton and materials (spirit pups).
- `rig.dispose()` frees a throwaway rig (skips shared geometry). Don't store Object3Ds in `userData` (clone deep-copies it via JSON).
- `enableXray(rig)` adds skinned silhouette twins bound to the same skeleton.
- **Disney style (default; Settings > Disney style, saved, applied on reload; `?kit=classic` / `?chewy=classic`)**:
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
  village buildings); the x-ray pass draws only over stencil 2.

## Village life (src/actors/villageLife.js, npc.js, lifePoses.js)
- `G.villageLife` (created by the first villager update) owns activity slots derived from `G.sim.list` (benches,
  fountain rim, shop counters, farm, flower beds, fishing spots, statues, notice board, well, lanterns, hot spring),
  claims (one villager per slot), a path grid that prefers paths, props (broom, watering can, rod) and chat pairing.
- Villagers pick activities by `G.day.hour` and personality; talking to one (`talking = true`) drops everything.
  `G.villageLife.force(villager, kind)` is a debug hook. Poses in lifePoses.js only move `rig.parts` groups.
- Villagers have homes (`VillageLife.homeFor` / `doorInfo`, doorstep outside the collider) and bedtimes (`BED` in
  npc.js); at night they step in through the door, Chewy can knock, and quest-targeted villagers wait on the doorstep.
- Small props (not occluders) use material clones with the cutaway off; only buildings/trees write the x-ray stencil.

## Navigation (src/core/nav.js)
- Shared `GridAStar` + per-world 0.5 m clearance grid (`navFor(world)`, exposed as `player.nav` for tests) and
  `PathFollow`. Click-to-move, melee approach, interact targets, loot pickup and Shadow's catch-up route through it;
  WASD stays direct. Collider changes are detected lazily (collision objects carry a `_nid`).
- Input: a press released before the next frame stays down for exactly one frame, so every poller sees taps.

## Combat notes
- `player.mouseSets` = [[LMB, RMB] sword set, [LMB, RMB] ball set]; the active pair is mirrored in `hotbar[0..1]`.
  `swapWeapons()` swaps pairs and emits `hotbar:changed {swap, set}`; actions `mouseSet`, `ensureMouseSets`, `setWeaponType`.
- Melee assist in skillRunner (`approachTo`, lunge, hit-frame re-check). `G.vfx.dampers` / `vfx.undamped()` tone down
  effects on a live boss (its own telegraphs are exempt).

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
- Chewy's default baked model is the **Toybox Chewy** (`public/rigs/chewy_b.*`, built and rigged in Blender by the codex-blender
  skill from tools/blender/work/codex/chewy-b, exported with `tools/blender/codex/hero_export.py`). `chewyModel()` picks
  toy | disney (`?chewymodel=`, Settings > Toybox Chewy), and a missing file falls back to the Storybook model. `HERO_MODELS.chewyToy`
  holds its tint, ear gain and palm / back attach points. prod-smoke requires it whenever chewy_b.json ships.
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
  - `cfgFor` loads `mokaToy` first and falls back to the Storybook `moka_disney`, like Chewy. The Settings toggle is
    "Toybox heroes".
  - Her entry sets `wave: 'front'`, `darkGrade` and `palm`.
  - prod-smoke requires `moka_toy` when playing Moka whenever it ships.
- **The procedural NPCs (villagers, townsfolk, humanoid monsters) are Toybox-style** by default: `src/actors/toyKit.js`, through
  `makeToyHumanoid` in charKit.js. The targets are the 7 approved sheets in tools/blender/work/codex/npc-kit/sheets.
  - **Style:** `kitStyle()` follows the "Toybox heroes" setting (off gives the Disney kit), and "Disney style" off gives the
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
- `G.mode === 'dungeon'` means "a combat world"; `G.dungeon.isRegion` tells an outdoor region from a Burrow floor
  (no stairs / waypoints / floor quests there). `layout.theme` = the region id, so audio resolves biome music through
  BIOME_TRACKS / BOSS_TRACKS / BIOME_AMBIENCES.
- Monsters stand on terrain: `Monster.pos.y` = ground height, `m.lift(k)` for effect origins. Region monsters and bosses
  register through `src/regions/monsters/index.js` (`registerMonsters`; per-def hooks `ai`, `update`, `onSpawn`,
  `onDeath`, `damageTaken`, `subtitle`); their sounds are pure-data `*.sfx.js` merged by `src/regions/sfx/index.js`.
- `state.regions = { unlocked, cleared, visits }`; a region opens at its level or when the previous boss falls.
- Biome recipes (`src/regions/biomes/<id>.js`): the terrain functions plus populate / effects / interactables (the API
  is in REGIONS.md §3.6). Shared placement rules live in `src/regions/biomeKit.js`: the camera-side / lens / landmark
  view guards, bridge decks and trail spots. Landmark POIs are fixed with `layout.poiAt`.
- Water: frozen discs (`terrain.water.frozen`) are walkable ice, and `RegionWorld.heightAt` returns the ice top there.
  Hot springs are `ctx.addPool` bodies with their own level.
- RegionWorld.dispose frees what the scene teardown can't reach (the weather mask texture, batches, the light pool).
  s13 checks round trips for texture/geometry growth.

## Persistent state `G.state` (JSON-serialisable, saved to localStorage)
```js
state = {
  version: 2, activeHero: 'chewy', heroes: { chewy: { player, equipment }, moka: { player, equipment } }, // (saved)
  // player / equipment below = heroes[activeHero].player / .equipment (live aliases, not saved)
  player: { cls:'chewy', name:'Chewy', lvl:1, xp:0, stats:{str:10,dex:10,vit:12,ene:8}, statPts:0, skillPts:1,
            skills:{ chomp:1 }, hotbar:['attack','chomp',null,null,null,null], // [LMB, RMB, 1, 2, 3, 4]
            life:null, zoom:null, activeWeapon:0 },           // life/zoom current (null = full)
  coins: 120,
  materials: { wood:20, stone:10, petal:0, crystal:0, bone:0, mochi:0, silk:0, lantern:0 },
  potions: { heart:3, zoom:2, rejuv:0 },                      // belt counters: Q = heart, E = zoom
  inventory: Array(40).fill(null),                            // 10x4 grid, one item per cell (uniform cells)
  equipment: { weapon:null, weaponAlt:null, hat:null, outfit:null, collar:null, charm1:null, charm2:null, boots:null, paws:null },
  stash: Array(60).fill(null),
  quests: { active:[], done:[] }, friends: { /* villagerId: {hearts, talkedDay, gifts} */ },
  village: { /* owned by the village sim */ },
  dungeon: { deepest:0, waypoints:[1] },
  day: 1, hour: 8.5, flags: {},
}
```

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
`setHotbar(slot, skillId)`, `addXp(n)`, `addCoins(n)`, `spendCoins(n)→bool`, `addMaterial(k,n)`, `hasMaterials(cost)`, `spendMaterials(cost)→bool`, `recompute()`.

## Events (Events.emit(name, payload))
`inv:changed`, `equip:changed`, `stats:changed`, `coins:changed`, `materials:changed`, `potions:changed`, `player:levelup {lvl}`,
`skill:learned {id,lvl}`, `item:pickup {item}`, `item:drop {item}`, `quest:update`, `toast {text, icon, color}`,
`mode:changed {mode}`, `village:changed`, `friend:changed {id}`, `boss:spawn`, `boss:dead`, `player:dead`.

## UI (src/ui/) — HTML/CSS overlay above the canvas (`#ui`), lots of spring/bounce animations
`UI.init(G)`, `UI.update(dt)`, `UI.toggle(name)` / `open` / `close` / `isOpen` / `anyModal()` for
`inventory|character|skills|quests|map|build|menu|shop|stash`, `UI.toast(text,opts)`, `UI.banner(title, sub, {style})`,
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
dressing, plaza bunting/signpost/hopscotch, the shrine approach, beach shells — built once from VillageWorld and drawn
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
