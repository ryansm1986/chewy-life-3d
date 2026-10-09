# Housing: interiors, decorating, home ratings, upgrades and exteriors

Status: **built** (2026-10-03: interiors and decorating; 2026-10-04: getting furniture, the villagers' homes, the Home
Rating, decorate requests; upgrades and exteriors; the guides, QA, perf and docs; see §9 "As built"). The owner asked: "I want to be able to enter houses and be able to place decorations and other
typical house stuff in the house. This should be used to help decorate houses for others and houses the player characters live in.
We also need to be able to upgrade houses and change the outside look." They chose:
- **separate interior room scenes**;
- furniture from **a shop + workbench crafting + dungeon/region finds**;
- villager **requests + hearts + a Home Rating**;
- exteriors with **paint + parts + style sets**.

## 0. What exists (code map, 2026-10-03)
Paths are relative to the repo. A full report is in the session; these are the load-bearing facts.

- **No interiors.**
  - Chewy's cottage is a dialogue menu (`G.openHome`, `world/services.js:33`: stash / cook / sleep / leave).
  - Villagers "go inside" by turning invisible (`npc.js:559-589`, `villageLife.js:503-527`).
- **Buildings**:
  - Cached templates per `type:level:variant` (`world/buildings/index.js:30-48`), with `variant = seed % 8`.
  - Built with the kit `Builder` (`kit.js:156-250`): buckets `body|glow|hot|cloth|leaf|water|jet`; colours baked into vertex
    colours with HSL jitter.
  - `instantiate` makes one mesh per bucket; there's no instancing.
  - House models (`homes.js` `homeL1-3`) pick roof, wall, door style and so on from the variant. The parts they use are already
    parameterized:
    - `parts.js`: walls, shoji/round windows, door styles, noren, hood, fence styles, foundation;
    - `roofs.js:51`: roof type and colour.
  - Chewy's cottage (`special.js:78-142`) and Rosie's shop (`:145-208`) are hard-coded.
- **Upgrades are organic only**: `grow()` (`village.js:577`) → `levelUp` (`:756-770`), which **re-rolls `b.seed`**, so the look
  changes. `catalog.levelCost` exists but nothing reads it. There's no player-triggered upgrade. The plot `max` caps the level.
- **Modes**:
  - `G.mode` is `'village'` or `'dungeon'` (regions are `'dungeon'` plus `isRegion`).
  - Worlds swap with `swapWorld` (`game.js:249`) inside `G.ui.transition` (iris). `enterCombatWorld` (`:270-311`) and
    `returnToVillage` (`:337-362`) are the templates to follow.
  - About 66 `G.mode` checks gate the clock (`day.update` village-only, `:717`), NPC updates, interact, build, footsteps,
    darkness, markers, tutorials (`tutorials.js:150`), sword sheathing (`player.js:209`), the companion, fishing and the garden.
- **The world interface** an interior must provide (`villageWorld.js:15-99`, `dungeonWorld.js:1031-1096`):
  - `scene` with fog and background; `hemi`, plus a `sun` with castShadow;
  - `lightPool = new LightPool(scene, 8)`, keeping the light rig identical or every shader recompiles;
  - `collision = new Collision(4)`, `interactables[]`, `heightAt`, `walkable`, `decks?`;
  - `updateSun(focus)`, `update(dt, t)`, `onSky()`;
  - for nav (`core/nav.js:87-98`): `L.W/H` plus `cellToWorld`, in positive coordinates.
- **Reusable**:
  - `dungeon/roomDressing.js` furniture builders: chabudai, tea set, byobu, ikebana, desk, tansu, books, taiko, cushion, bonsai,
    incense, kitchen pieces. They're bound to `this.B/CL/...`, so they need a shim.
  - Build mode ghost, rotate and validity (`buildMode.js`), the palette panel (`ui/build.js`), `engine.mouseGround`.
  - The shop panel `goods/pantry/sellKinds/buyer` options (`ui/shop.js`).
  - The Cook-panel crafting pattern (`life/cooking.js` `STATIONS/RECIPES`, `kitchen.js`, `ui/cook.js`).
  - The Pantry store pattern (`state.pantry` lazy init, a pickup case, an inventory tab).
  - Loot layered outside `rollDrops` (`pantry.js:127-146`, `dungeonMode.js:339`).
  - Guides (`world/guides.js`, `tutorials.js`).
- **Villagers**:
  - Named cast homes come from `HOME_PREF`/`homeFor` (`villageLife.js:29, 432-454`), resolved per session and not saved.
  - Townsfolk are random and not saved.
  - Happiness: `b.happy` (`village.js:563`) feeds demand, rent (`:776`) and the joy bubbles.
  - Hearts and gifts: `story.js:238-337`. Requests (`:354-371`): **append only** (s8 forces template 0).
- **Saves**: building records `{id, idx, type, x, z, rot, level, seed, residents, built, plot?}`; the migration mutates in place,
  so extra fields survive. Use lazy-init subtrees.

## 1. Interiors: a separate room scene
- **Enter**:
  - **F at the door** of an enterable house, then an iris (`shape: 'circle'`) into its `InteriorWorld`.
  - Inside, the door mat is an interactable that leads out to the same door outside.
  - Esc does nothing special.
- **`G.mode = 'interior'`**: audit every `G.mode` check and decide each one.
  - **Runs**: the clock (`day.update`), so time passes inside; the village sim and economy keep ticking.
  - **Hidden**: outdoor NPCs, except the hosted ones.
  - **Paused**: tutorials stay paused unless a step allows interiors.
  - **Turned off**: Build mode (B) does nothing; footsteps are wood; darkness and night grade are interior lighting (lamps), not the
    outdoor night; the sword stays sheathed; no fishing or garden prompts.
  - Keep the village world **alive** (not disposed): swap scenes, and swap back on exit. The interior is built on entry and
    disposed on exit with **only its own** geometry and materials. Never `disposeScene` shared resources (MATS, template caches,
    rigs; ARCHITECTURE.md:278).
- **`InteriorWorld`** (`src/home/interiorWorld.js`):
  - **Room shells by house level**:
    - L1: one room about 6 × 5 m;
    - L2: about 7.5 × 6 m plus an alcove;
    - L3: a main room plus a second room through an open doorway (side by side, no stairs).
    The cottage gets its own layout with the kitchen corner.
  - **Shell parts**: floor, 3 walls plus a low front wall (the camera side is cut down or faded so you always see in), skirting, a
    window with daylight, a ceiling beam suggestion and the door.
  - **Swappable surfaces**: wallpaper and floor types, chosen by the player.
  - **Light rig**: the same rig. The sun is a soft window key light; lamps are light-pool sources.
  - **Camera**: tuned for small rooms (distance about 12–14, the same pitch), clamped inside the room bounds. Set tilt-shift and
    the grade for indoors.
  - **Nav**: a 0.25–0.5 m grid with furniture colliders, so the player and Shadow walk around furniture.
- **Who comes in**:
  - The player and Shadow.
  - The host villager, when visiting, is hosted as frozen plus a scripted idle and walk (the guide's `claimKero` pattern), and
    restored on exit.
  - The benched hero lives at the cottage and appears inside it.
- **Which houses**:
  - **Chewy's cottage** (both heroes' home): always enterable.
  - **The named villagers' homes**:
    - Mochi, Usagi, Kuma, Kitsune, Pan, Tanu and Kero; Rosie's shop has a back room.
    - Enterable when the owner is home and awake and has ≥ 1 heart, or by invitation (requests).
    - Give homes **saved owners** (`b.owner = 'kuma'`), assigned once and migrated for old saves, so their interiors persist.
  - **Townsfolk homes**: knock only, not enterable. Exterior customization still applies.
- **Door interactables** must not break the night **knock** prompts (`villageLife.js:504` returns early when `rec.inter` exists).
  Fold them together into one door interactable with a context label: "Enter", "Visit Kuma", "Knock", "Kuma is asleep". Keep s1
  and s5's interactable checks consistent.
- **The cottage menu moves inside** as objects:
  - **the bed** (Sleep);
  - **the chest** (Stash);
  - **the stove or kitchen** (Cook);
  - **a wardrobe/mirror** (the hero swap, if useful), plus the **workbench** corner.
  The door now enters instead of opening the menu. **Update** s8, s15 and s16 and the house guide (`guides.js` "Home, sweet home")
  to match.

## 2. Furniture and decorating
- **Store**: `state.furniture = { [id]: qty }` (shared household, lazy). Placed items are stored per house, and moving one back to
  storage returns it.
- **The catalog** (`src/home/furniture.js`, pure data plus a builder per item): about 70 items in categories:
  - floor: seating, tables, beds, storage, kitchen, appliances;
  - wall: scrolls, shelves, clocks, windows, frames;
  - rug;
  - tabletop: vases, lamps, books, tea sets, plants;
  - ceiling and lights: paper lanterns, pendants;
  - surfaces: wallpaper and floor sets.
  Each item has:
  - `{ id, name, jp, cat, size [w, d] in 0.5 m cells, h, mount: 'floor'|'wall'|'table'|'rug', surface? (a tabletop height), tags,
    set, price, craft?, drop?, light? }`;
  - `tags` such as cozy, warm, nature, water, lantern, bookish, sweet, music, retro, festive, elegant, cute;
  - a **set**: Cottage Basics, Tea House, Bamboo Grove, Maple Hollow, Tidepool, Onsen Lodge or Festival.
  Models are built in the **Toybox-cozy style** with the kit Builder, reusing or porting the `roomDressing` builders. They're cached
  per item and drawn **batched/instanced** inside the interior (one draw per item type, not per placement).
- **Decorate mode** (inside a house you're allowed to decorate):
  - Toggle with **B** (indoors it means decorate) or a HUD button.
  - Shows a 0.5 m floor grid, and wall grid strips.
  - A palette panel lists your furniture storage by category, with counts and Toybox icons rendered by a thumbnail renderer.
  - Pick an item for a ghost preview: R rotates; it's green or red by validity.
    - Wall items snap to walls; tabletop items snap onto surfaces (`surface` height), stacked up to one level; rugs go under
      furniture.
    - Click places it; clicking a placed item picks it up (move or store).
    - Undo the last action (Ctrl+Z).
  - Wallpaper and floor are applied from the palette.
  - Collision and nav update as you go; you can't block the door.
- **Persistence**: `rec.interior = { wall, floor, items: [{ id, x, z, rot, mount, on? }] }` on the building record (it rides the
  village save and MULTIPLAYER deltas). Old saves have none, which gives the default furnishing.
- **Default furnishing**:
  - Chewy's cottage starts with a bed, chest, stove, table, cushions, a rug and a lantern.
  - Each villager's home starts with a **personality layout** that matches their sheet and likes:
    - Kuma: a baker's kitchen, warm;
    - Kitsune: a shrine-like room, elegant;
    - Kero: water and pond things;
    - Usagi: plants;
    - Pan: a nap corner;
    - Tanu: curios;
    - Mochi: an art easel.
  These are deterministic presets.

## 3. Getting furniture
- **The Furniture Shop**: "Tanu's Trinkets", run by Tanu the merchant.
  - It's a market stall on Market Street, or a `shop` variant, with an F prompt and a chat choice.
  - A daily rotating catalog: about 8 items from sets unlocked by village rank, plus always-available basics, wallpaper and floors.
  - It uses the shop panel `goods` options. Tanu buys furniture back at half price.
- **The Workbench**: at the Lumber workshop (`interactionFor` `case 'lumber'`) and in Chewy's cottage (an interior object).
  - Craft recipes from materials (wood, stone, silk, petal, lantern, crystal, bone) plus crops and fish, e.g. a pumpkin lamp, a fish
    tank or a melon stool.
  - It uses the Cook-panel UI pattern, pure recipe data and node tests. Known recipes come from the shop and as rewards.
- **Finds**: themed rare drops, layered outside `rollDrops` like forage (`dungeonMode.js:339`):
  - Bamboo Grove (bamboo region), Maple Hollow (maple), Tidepool (tide pools), Onsen Lodge (onsen);
  - Burrow oddities: a lucky cat, a yokai lantern.
  - Chests and bosses have higher odds. Ground-loot meshes and a pickup toast with a "New!" badge.

## 4. Decorating for others: requests, hearts and the Home Rating
- **The Home Rating**: a pure `homeRating(interior, owner)` in `src/home/rating.js`, node-tested, giving 1–5 stars. Points come
  from:
  - **filled**: furniture count and coverage, with a clutter penalty;
  - **variety**: categories present (seating, table, light, wall, rug, plant);
  - **sets**: 3+ items from one set give a bonus;
  - **lighting**: at least one lamp;
  - **taste**: the owner's liked tags and styles (add `style: [...]`, `likesFurniture: [...]` to `roster.js` per villager);
  - **wall and rug**: their presence.
  The rating shows in decorate mode and as a "Home: ★★★☆☆" chip at the door.
- **The favourite-piece tip** (R-13, 2026-10-09): it names a piece, `a puffy armchair (their favourite)` (`your favourite`
  in your own home, `my favourite` in the owner's words): the next favourite not in the room yet, one in your storage
  first (`homeRating(interior, taste, { have: storage })`, `has.fav`), so it moves on with each one placed. It used to
  say "one of their favourite pieces": it never said which, and it stayed until three were placed. In the palette a
  favourite's card has a heart (`.dc-fav`) and its tooltip says "One of your / their favourites". The cottage's are
  the pack's (`COTTAGE_TASTE`: bookshelf, armchair, fish tank, pack photo; the Pack Photo is in the starter storage).
- **Effects**:
  - The rating adds to that home's `b.happy` (`village.js:563`), so to rent, demand and level-up needs.
  - Raising a villager's rating gives hearts the first time each new star is reached.
  - The owner reacts on exit: "I love it!" with a heart burst, or a gentle comment on what's missing.
- **Requests**: append new templates to `requestFlow` (after the existing ones):
  - a request asks to decorate their home with constraints, e.g. "Kuma: something warm + a rug", "Kero: two water-themed items",
    "Kitsune: reach 3 stars";
  - accepting it unlocks decorate access to their home for the request;
  - completing it checks the constraints and the rating on exit, gives hearts plus a reward (a rare furniture item or a recipe),
    and a thank-you line;
  - a new quest step type `decorate` in `story.js` `stepDone/progress`.
- **Invitations**: at 3+ hearts a villager lets you redecorate their home any time: "Make yourself at home!".
- **Chewy's cottage** has a rating too, just for fun. Five stars gives a small daily joy bonus to the village.

## 5. House upgrades (player-triggered)
- **Where**: the house **mailbox** (an exterior interactable on homes and the cottage), or Build mode by selecting a building
  (`buildMode.js:156`, a click with no tool selects it): an inspect card with **Upgrade / Remodel / Enter**.
- **Upgrading** spends `catalog.levelCost` (wire it up; define it for `chewyHouse`) and requires the plot's `max` and rank. An
  upgrade animation plays (scaffold, dust ring, the house rising) and the **look is kept**: `levelUp` keeps `b.seed` and `b.style`
  instead of re-rolling (`village.js:763`).
  - Organic growth also keeps the look now.
  - Interiors grow with the level: the shell is larger, and existing items are kept and stay in place.
- **Chewy's cottage gets levels 1–3** on the same 3×3 footprint (the garden sits beside it), e.g. L2 adds a dormer and a porch,
  L3 a second storey, with interior L2 and L3 sizes.

## 6. Exterior customization: paint, parts and style sets
- **The Remodel panel** (from the mailbox or the inspect card) shows a **live preview** of the house, with swatches and options:
  - roof colour (about 10) and roof type (hip, gable, where the model supports it);
  - wall plaster (about 8);
  - wood trim (about 5);
  - door style (shoji, round, wood, lattice) and colour;
  - window style (shoji, round, lattice);
  - noren colour and symbol;
  - fence style (picket, bamboo, rail, rope, hedge) and colour;
  - **style sets** that set many at once: **Machiya**, **Cottage**, **Tea House** and **Seaside**, plus a "Festival" bunting option.
  Cost: coins and/or materials per change; some options are locked behind rank or found/bought.
- **Implementation**:
  - `b.style = { set, roof, roofType, wall, trim, door, doorColor, window, noren, fence, fenceColor }`.
  - Pass it as `getTemplate(id, level, seed, style)` with a **style hash in the cache key**, then `B.style` is read by `homeL1-3`,
    `chewyHouse` and the Rosie shop (to the extent sensible) through the already-parameterized parts.
  - Turn off the HSL jitter on user-picked colours (or keep it subtle).
  - Yard fences in the shared batches (`details.js` `plotYard`) follow `b.style.fence` via a per-instance recolour or a fence
    rebuild for that plot.
  - Budget: a few unique templates per house is fine; cap the cache and evict unused templates.
- **Villagers** have exterior tastes too: a liked style set gives a small rating bonus.

## 7. Tutorial
Add a guide: **"Make it home"** with Shadow, triggered the first time the player enters the cottage interior.
1. The bed, chest and stove inside.
2. Press B to decorate and place a cushion from storage.
3. Rotate and move it.
4. Change the wallpaper.
5. The Home Rating chip, and its tip followed: the favourite it names (R-13).
6. "Tanu sells furniture, the workbench makes it, and villagers love help decorating."
A short **"Remodel"** step comes the first time the player opens the mailbox. Use `tutorials.js`.

## 8. QA and performance
- **`tools/qa/s17-housing.mjs`**:
  - enter/exit the cottage; the bed, chest and stove work; s8, s15 and s16 still pass after the menu move;
  - place, rotate, move and store, wall, tabletop and rug items; you can't block the door; save/load of the interior;
  - the shop, the workbench and finds;
  - visiting a villager (hosted and restored), a decorate request, the rating, hearts and happiness;
  - an upgrade keeps the look, and the interior grows with items kept;
  - remodel, the template cache key, and fences;
  - an old save migrates owners;
  - the round trip interior ↔ village ↔ Burrow shows no leaks (geometries, textures, interactables), as s1 does.
- **Unit tests** in `tools/test-rpg.mjs`: the furniture catalog, the rating math, placement validity math, recipes.
- **Perf**:
  - entering an interior under about 300 ms warm;
  - an interior with 60 items draws batched and holds 60 fps headroom;
  - the village frame time unchanged (`village-perf.mjs`);
  - memory stable over 10 enter/exit cycles.
- **Line endings**: preserve them (many files are CRLF).
- **Docs**: ARCHITECTURE.md, README (controls: F enter, B decorate indoors, mailbox) and this file's status.

## 9. As built
### Phase 1: interiors and decorating (2026-10-03)
- **Code** (`src/home/`, new):
  - `furniture.js`: the catalog (pure data, node-safe): 52 items in 10 categories and 7 sets, 13 wallpapers and floors
    (`SURFACES`), the palette tabs, `footprint`, `storageList`, `STARTER_STORAGE`.
  - `furnitureModels.js`: one Toybox-cozy builder per item, with the kit `Builder` (a helper agent modelled them to
    this contract). `furnitureMesh.js`: the cached templates (never disposed) and `furnitureGroup(id)` for the
    thumbnails, the ghost and the test page.
  - `rooms.js`: the room shells (pure): layouts `home1-3` and `cottage1-3`, and `shellOf(layout)` (the floor mask,
    the wall runs, windows, the door, the back-wall slots, the cells kept clear inside the door).
  - `placement.js`: the placement rules (pure): `canPlace`, `poseOf`, `boxOf`, `cellsOf`, `wallSpan`, `frontCell`.
  - `surfaces.js`: the wallpaper and floor textures, painted on a canvas once per surface (a session cache).
  - `interiorWorld.js`: `InteriorWorld`. `housing.js`: `G.housing` (in and out, the household jobs, guests, the
    indoor look). `decorate.js`: decorate mode. `defaults.js`: the default furnishings. `interiorMap.js`: the
    minimap.
  - UI: `ui/decorate.js` (the palette and the HUD's Decorate button), `ui/furniture.js` (the Furniture tab),
    `ui/home.css`.
  - Test page: `/?test=furniture` (`&cat=`, `&set=`, `&id=a,b`, `&hour=21`).
- **`G.mode = 'interior'`: the audit.** Every check was read. What each does indoors:

  | Where | Indoors |
  |---|---|
  | `game.js` frame | the clock runs (`day.tick`: the hour and the 6:00 new day, no outdoor lighting); `G.housing.update` lights the room and ticks the guests and decorate mode; `sim.update` keeps the village and its economy going; the village's NPCs, ambience, loot and markers wait |
  | `game.js` handleInput | B toggles decorate mode, not Build; decorate mode takes the mouse and WASD; no skills (RMB, 1-4); potions, G, X and Tab still work |
  | `game.js` hitchHidden, `village.js` prewarm | an interior is on screen: no townsfolk rig or template builds while you're inside |
  | `game.js` stepSound | wood |
  | `game.js` item:drop | there's no ground loot indoors: the item goes back into the bag |
  | `game.js` updateHero | the hero's glow follows the lamp light (30% of the night) |
  | `game.js` questTarget | indoors only a guide's target (no story pointer to Rosie 168 m away) |
  | `game.js` enterCombatWorld | steps out first (only reachable from debug and tests) |
  | `player.js` carrySword | sheathed, as in the village |
  | `heroes.js` canSwitch / swap | indoors you can switch with the hero who is home: the two swap places in the room; otherwise "out and about — switch outside!" |
  | `village.js` update | growth keeps ticking indoors; its effects go to the village's own VFX (`sim.vfx`) |
  | `tutorials.js` pauseReason / updateArrow | paused unless the step has `allow.interior`; the arrow works in the room |
  | `companion.js`, `skillRunner.js`, `fishing.js`, `garden.js`, `life/index.js`, `kitchen.js`, `minimap.js`, `story.js`, `audio.js`, `ui.js`, `map.js`, `questArrow.js` | unchanged: their village-only and dungeon-only branches are already right indoors (no fishing or garden prompts, no Shadow occlusion hops, a tool chore is cancelled, and cooking at the stove still works because the ladle is a hold, not a chore) |
  | `ui.js` setMode | `'interior'`: the decorate palette closes outside; the HUD hides the floor badge and shows the Decorate button |
- **The world**:
  - One persistent `InteriorWorld` serves the session. Its scene, the light rig (1 hemisphere, 1 shadow sun and the
    8-light pool: the same counts as the village, so nothing recompiles), its own materials and its own VFX live on.
    Each visit `load()`s a house; `unload()` frees that visit's geometry, instance buffers, colliders, light sources
    and interactables. The village world is never disposed: `G.swapWorld` (now exported by game.js) swaps it out and
    back in.
  - Nav: `L = { W: 32, H: 24 }` metres with `cellToWorld`, rebuilt on every load (`navFor(world).build()`). Furniture
    colliders (rects inset 6 cm, so a 0.5 m gap stays walkable) are picked up by the nav's collider signature.
  - Entering costs about 8-20 ms of work inside the iris (`G.housing.enterMs`).
- **The shells** (deviation): the game camera's yaw is 45°, so a room has **two** back walls (north and west: full
  height, wallpapered, with the windows and wall items) and **two** front walls (south and east), cut down to a low
  cap with a timber top. That's the diorama look of a 45° camera, and both back walls can be decorated. A wall
  between two rooms is a low partition with tall posts and a beam over the doorway. A dark wood plinth sits under the
  floor, so the room reads as a toy box. The finish (the owner's 9/10 bar, criterion 6):
  - back walls: two-tone wainscot boards to 0.68 m with a chair rail and a dark skirting, the wallpaper above, a head
    rail at 2 m, a crown band, and ceiling joists every 1.5 m that poke through with a bracket and a lighter end-grain
    cap; the front walls have a skirting inside and a plank skirt outside; corner posts have feet, the low posts a
    collar and a round finial;
  - windows are real openings (the wall is built in slabs round them): a rounded timber frame, a deep sill and an
    apron, pink tie-back curtains on a rod, a flower pot on the sill; round windows have a ring and a lattice, shoji
    windows kumiko and a kick panel. Their own daylight panes (bright by day, night blue) throw a soft patch of sun,
    with the lattice's shadow in it, onto the floor, and dust motes drift in the light;
  - the door is a gap in a front wall: a threshold with the sliding door's two track rails, a woven door mat with a
    pink binding and a paw, a bevelled stone step with red slippers on it, and an umbrella stand with a pink parasol.
- **The indoor look** (`housing.applyLook`, every 0.25 s): the room's own day and night key and fill light, no cloud
  shadows, a gentle wind for leaves and cloth, a warm grade and vignette, a softer tilt-shift. Lamps are pool sources
  (`nightOnly`), lit at 30% by day and fully at night. Everything is put back on the way out (`day.apply()` and the
  saved values). The village's day / night music change carries on indoors.
- **Camera**: distance 15 (10-19), the same yaw and pitch. The focus is biased 0.85 m away from the camera
  (`housing.biasFocus`), so the back walls and what hangs on them stay in frame, and clamped to the room.
- **In and out**:
  - F at the door: `G.openHome` now enters, and the door still says "Enter Chewy's Cottage".
  - A circle iris; the player lands on the door mat facing in, with Shadow a step in beside them.
  - Out: F on the mat ("Go outside"), or walk out through the doorway (with the 45° camera that's S or A on the mat
    of a south door; the doorway itself is walkable). There's a 1.5 s grace after coming in, so keys still held from
    walking up to the door don't take you straight back out. You come out on the doorstep, facing the street.
  - Events: `home:enter`, `home:exit`, `home:use`.
- **The cottage**: its door goes inside. The bed ("Sleep until morning 💤": a new morning, and you stay inside), the
  treasure chest (the stash) and the kitchen stove (the Cook panel's kitchen) are F interactables in front of the
  furniture that has a `use`, so they move with it. The menu dialogue is gone.
- **Guests**: the benched hero lives at the cottage.
  - If they're home (in bed or indoors) when you go in, they're hosted in the room: frozen, with a `hostTick` in
    npc.js. They read by day, are drowsy in their nightcap at night, and wave when you come close. You can talk to
    them and switch.
  - Switching inside swaps the two in the room.
  - On the way out they go back to exactly what they were doing in the village.
- **Furniture**:
  - `state.furniture = { id: n }` (household, lazy) and `furnitureFound`. Actions: `addFurniture`, `hasFurniture`,
    `spendFurniture`, `furnitureCount`. Event: `furniture:changed`.
  - A new household (and an old save on its first boot) gets `STARTER_STORAGE`: a cushion, a fern, a photo, a vase,
    a side table, candy-stripe wallpaper and checker tiles.
  - The interior is `b.interior = { v, layout, wall, floor, items }` on the building's saved data. Records:
    - floor / rug / ceiling: `{ k, id, mount, x, z, rot }`;
    - table: `{ ..., on: hostK }`;
    - wall: `{ k, id, mount: 'wall', side: 'n'|'w', x, z, y }` (deviation: a side and a height instead of a rot).
    Old saves get the default furnishing.
  - Drawing: one InstancedMesh per item type and bucket, with the kit's shared materials. The cottage draws its 16
    placements of 14 types in 15 draws. Ceiling lamps and rugs cast no shadow.
  - A fifth mount, `'ceiling'` (deviation): paper pendants and festival lanterns hang over a floor cell from a little
    ceiling plate at 2.45 m, and never block the floor.
- **Placement rules** (`canPlace`):
  - Everything stays inside the room.
  - Floor pieces never go on the door mat or the row inside it, never overlap, and never cover a wall item or a
    window behind them. The room must stay walkable: a flood from the door must still reach the bed, the chest, the
    stove and the player, who can't be built in or built over.
  - Rugs don't overlap other rugs and keep off the mat.
  - Tabletop items sit on a `surface` (one level: never on another tabletop item), inside its top.
  - Wall items go on back-wall slots, 0.75-2.25 m up (above the wainscot rail) in quarter-metre steps, clear of windows, other wall items and
    tall furniture standing in front of them.
  - Ceiling lamps don't overlap and can't bump tall furniture.
- **Decorate mode**:
  - B indoors, or the Decorate button. The camera pulls back (19), with the room above the palette; WASD pans and
    the wheel zooms while the player stays put. A 0.5 m floor grid, and grid strips on the back walls.
  - The palette, a bottom drawer in the build palette's look:
    - tabs All / Furniture / Decor / Wall / Rugs / Tabletop / Wallpaper & Floors, with counts;
    - cards with 3D thumbnails (rendered a few per frame by `BuildingThumbs.object`) and ×counts;
    - the house's current wallpaper and floor, and Store / Undo / Done.
  - Pick a card: the ghost (the real model, red when it can't go there) follows the mouse over green or red cells,
    and the prompt says why not. R rotates.
  - Click a placed piece to pick it up: things on a table ride along and turn with it. Click to put it down, Store (or
    Delete) to put it away, Esc or right-click to put it back.
  - Ctrl+Z undoes places, moves, stores and surface changes (40 deep, reset for each house).
  - Wallpapers and floors apply at once, and the old one goes back to storage (the free plaster and planks are always
    there).
- **The Furniture tab**: a third view of the inventory panel (Bag / Pantry / Furniture) in the Pantry's look: tabs, a
  detail card (thumbnail, set, size, tags) and a grid with counts.
- **Minimap**: indoors, a floor plan: rugs, furniture by category, thick back walls, the door arrow, guests and Shadow.
- **Guide**: step 3 of "Home, sweet home" is now inside. The arrow hops from the chest to the bed to the stove to the
  door mat (`allow.interior`, waiting for `home:exit`). docs/TUTORIALS.md is updated.
- **Model quality (the owner's bar: every model at least 9/10)**. Review tools:
  - `/?test=furnsheet` (`src/tests/furnsheet.js`): the catalog sheet, each item alone in a ~260 px cell, 3/4 view,
    studio-lit toon, a wall panel behind wall items and a table under tabletop ones, with names and triangle counts
    (`&set=`, `&cat=`, `&ids=a,b`, `&cols=`, `&size=`, `&night`).
  - `/?test=furnsheet&vignette=<set>` (basics, kitchen, tea, bamboo, maple, tide, onsen, festival): the set staged in a
    real `InteriorWorld` corner room with the in-game look; `&close` frames the north-west corner, `&hour=21` is night,
    `&dist`, `&yaw`, `&pitch`, `&fx/&fy/&fz` move the camera.
  - Every item was scored against the six points (chunky rounded silhouettes, 2-4 secondary shapes, a soft painted
    palette with value variation, smooth shading and no gaps, one style across the sets, cozy diorama shells). Pieces
    under 9 were reworked until they scored 9: the paper pendant, festival chochin, tatami mat, maple rug, rag rug,
    tile mat, chabudai, futon bed, wardrobe, bamboo planter (fatter stalks, fuller leaves), bamboo lantern, irori
    (bamboo poles with nodes, a rope lashing, a teardrop fire on crossed logs, a bigger kettle), ikebana, hanging scroll,
    side table (a stout turned pedestal with a gold band) and the noren (soft folds the ゆ follows). The river-stone
    floor was repainted as pebbles set in mortar.
  - The shell's trim is no longer warped: the wallpaper sits 2 mm in front of the plaster, and the warp pushed the
    plaster through it in big triangles.
- **QA**:
  - s8 checks the cottage in and out (the old menu loop is gone).
  - s15's kitchen check goes in through the door and presses F at the stove.
  - s16 checks the inside tour.
  - New `tools/qa/s17-housing.mjs` (the phase 1 part): in and out, the jobs, decorating through the real mouse and
    keys, the door rule, moving a table with a vase on it, store and undo, the surfaces, save and reload, Moka hosted
    at night, 8 enter / exit cycles with no growth (the village's own lazily made props, such as a villager's first
    fishing rod, line and bobber, are set aside), and walking out with S on the mat.
  - prod-smoke has a `home` case: the cottage in the production bundle (items, batches, jobs, the palette's thumbnails).

### Phase 2: getting furniture, the villagers' homes, the Home Rating (2026-10-04)
- **Code** (new in `src/home/`): `owners.js` (saved owners), `rating.js` (the Home Rating and request needs),
  `sources.js` + `trinkets.js` / `recipes.js` / `finds.js` (getting furniture), `furnitureModels2.js` (the second
  batch of models), `stallModel.js` (Tanu's stall). `defaults.js` grew the personality layouts; `housing.js` the
  doors, visits, hosting and reactions; `story.js` the decorate requests and invitations.
- **The catalog** has 73 pieces. New: the workbench (`use: 'craft'`), the villagers' own pieces (`owner` field: an
  easel, paint pots and a cat tower for Mochi, a bread shelf and flour sacks for Kuma, a nap pillow and a panda plush
  for Pan, a plant stand and a hanging planter for Usagi, a curio cabinet, a tanuki statue and a lucky cat for Tanu, a
  kamidana, a fox statue and an incense burner for Kitsune, a lily tub and a frog fountain for Kero), a melon stool, a
  pumpkin lamp and the Burrow's yokai lantern. `shop` (the rank from which Tanu stocks a piece; `false` = crafted or
  found only) with `SHOP_RANK` per set and `shopRank(d)`.
- **Saved owners** (`owners.js` `assignOwners`):
  - each of the seven named villagers owns one building (`b.owner`, in the save): Kuma his bakery (a `shop` on
    Market Street), the others the nearest free home to their anchor, in a fixed order;
  - it only fills in villagers who own nothing, so it is also the migration: an old save gets the same owners on its
    first load. It runs at install and on `village:changed` (a demolished home's owner moves to another);
  - `villageLife.homeFor` prefers the owned building, so villagers sleep where they own.
- **The door** (one interactable per owned home, `housing.doorInter`; village.js `interactionFor` builds it, and
  `syncDoors` adds it to homes that get an owner later):
  - its label is computed: "Knock on Kuma's door" when anyone is tucked in (the night knock now shares this prompt:
    `villageLife.tuckIn` registers the sleepers on it instead of adding a second one), "Visit Kuma ★★★☆☆" when you may
    go in, "Kuma is asleep" on the way to bed, else "Kuma's home" (F explains: chat first, ♥ 1 to visit);
  - you may visit when the owner is awake and not busy, and you have ♥ 1, an invitation, or their decorate request.
  - Deviation: visits don't wait for the owner to be "inside" (villagers spend their days out). They pop home to let
    you in: the owner is hosted in their home (`housing.hostOwner`, near a piece they love) and goes back to exactly
    where they were when you leave.
- **The villagers' homes** (`defaults.js`): a personality layout per owner for L1 (6 x 5 m); L2 and L3 move it into the
  bigger rooms (the bed into the alcove or the second room) with their kind of rug, a seat, a plant and a lamp, and
  `settle` re-seats anything that no longer fits (checked with `canPlace`). Their own pieces are marked `own`: you can
  move them, not take them ("Kuma's — you can move it, not take it"), and their own wallpaper and floor
  (`ownWall`/`ownFloor`) never go into your storage. Their favourite surfaces: Kero's waves and river stones,
  Kitsune's asanoha washi and tatami, and so on. The defaults rate three stars (Kitsune four, Pan two at L2), so
  there's always something to do.
- **The Home Rating** (`rating.js`, pure, node-tested): 100 points — filled 20 (one piece per 7 cells, a clutter
  penalty past 55% floor cover), variety 20 (a seat, a table, a lamp, a wall item, a rug, a plant), sets 15, lighting
  10, taste 25 (pieces in the owner's style tags, `cozy` not counted, and the pieces they love: roster.js `home:
  { style, likesFurniture, dream }`), finish 10. Stars at 25 / 50 / 70 / 88. It also gives the best tips ("a lamp",
  "more warm or sweet things"…). Chewy's cottage is rated for the pack's taste (`COTTAGE_TASTE`) and starts at three.
  - Shown on the door label and in the decorate palette (stars and the best tip; the chip pops when a star is won).
  - `b.homeStars` is kept when you leave; `village.js` adds `(stars − 3) × 0.06` to a home's `b.happy` (four and five
    stars only, so the defaults leave the economy as it was), and a five-star cottage adds +0.03 to the village's
    happiness.
  - The first time each new star is reached in a villager's home: +1 heart per star (`friend.homeBest`).
- **Reactions** (`housing.react`, on the way out of an owner's home): a new star → "I love it!" with a heart burst; a
  change without a new star → a gentle hint from the tips; nothing changed → a wave and a goodbye toast.
- **Decorate requests** (`story.js decorateRequests`, appended after the homestead ones, so s8's template 0 is still
  "bring <mat>"): "2 <their style> things and a rug", "make it a <n+1>-star home", "a <loved piece> in my home". A
  new step type `decorate` (`need: { tag, n, rug, light, stars, ids }`, `rating.meetsNeed`), checked on the way out
  (`story.checkDecorate`; the owner thanks you, then the quest completes). Accepting one opens their home to
  decorating; the reward is the usual coins, xp and hearts plus a piece they love for your storage (`reward.furniture`;
  `reward.craft` teaches a workbench recipe). The quest pointer leads to their door.
- **Invitations**: at three hearts, the next chat ends with "Make yourself at home!" (`friend.invited`): visit and
  redecorate any time.
- **Getting furniture** (`sources.js` installs it; pure parts node-tested in `tools/test-rpg.mjs` "FURNITURE SOURCES"):
  - **Tanu's Trinkets**: a market stall (`stallModel.js` `trinketStallTemplate`: a striped leaf-green awning, the
    たぬき屋 sign, shelves of tiny furniture, a lucky cat on the counter, two paper lanterns that light up at night as
    light-pool sources) on Market Street by the market square (`TRINKET_STALL`), with colliders, an F prompt and a
    minimap dot; Tanu's chat also offers "Furniture, please!". The stock (`trinkets.js`, deterministic per day and
    rank, kept in `state.trinkets` so what's bought stays bought): the always-available basics (both cushions, the side
    table, the pack photo, the basic wallpapers and floors), ~8 rotating pieces Tanu can sell at the village's rank
    (cheaper ones more often, 1-2 of each) and two recipe scrolls. The shop panel (`ui/shop.js` `furniture` goods)
    shows the pieces' thumbnails and tooltips; a Sell tab buys furniture back at half price. The Furniture tab opens
    beside it.
  - **The workbench** (`recipes.js`, `ui/craft.js` + `craft.css`): 14 recipes (5 known from the start, 7 as Tanu's
    scrolls, 2 villagers' thank-yous: Mochi's cat tower and Kero's fish tank, taught by their first decorate request).
    F at the cottage's workbench or at the Lumber workshop's door opens the Workbench panel in the Cook panel's look
    (the recipes, the piece, its materials, ×N and Craft); Chewy hammers away, the materials are spent and the piece
    goes to storage (`furniture:crafted`). `G.teachRecipe(id, { from })` teaches one (a banner).
  - **Finds** (`finds.js`): each region drops its own set (plus its villagers' pieces and a wallpaper or floor); the
    Burrow drops its two oddities (the lucky cat and the yokai lantern, found nowhere else) and now and then any
    piece Tanu could sell. ~1-5% from a monster by rank, 10-15% from a chest, 35% from a boss, never two at once. The
    ground loot is the piece's own model, scaled down and bobbing; picking it up puts it in storage with a toast ("New!"
    the first time: what the household had when phase 2 arrived counts as found).
  - QA: `tools/qa/s18-furniture-sources.mjs` (the stall, buying and selling, the stock across a reload and a new day,
    crafting at home and at the Lumber yard, finds in a region and in the Burrow, no leaks).
- **Models** (the owner's 9/10 bar): the 21 new pieces and Tanu's stall were modelled by two helper agents and
  reviewed on catalog sheets (`/?test=furnsheet&ids=…`) and staged vignettes (`&vignette=kuma|mochi|pan|usagi|tanu|
  kitsune|kero|workshop|finds`, day and night); all score 9 or more. The art director's four fixes from phase 1 are in:
  the bamboo planter (three fat stalks with nodes and layered leaf sprays in a glazed pot of pebbles), the maple rug
  (felt with a rounded edge, a red-to-orange gradient, cream stitched veins, a small yellow leaf), the chochin and
  paper pendant (a wooden ceiling rose with a hook, a knotted cord; lacquered rims on the chochin) and the side table
  (one wood tone, a turned pedestal with rings, a thicker top edge, a carved foot). A few sculpted pieces run to
  5-5.6k triangles and the stall to 13k (accepted). Their first build takes 30-110 ms, so a villager's home pre-builds
  its furniture a few pieces a frame while you stand at the door (`housing.prewarm`).
- **QA** (phase 2): s17 grew sections f-i (owners and the migration, the door, the decorate request, the invitation);
  s18 is new; `tools/test-rpg.mjs` has "HOMES & RATING" (owners, the default homes at every level, the rating and the
  request needs) and "FURNITURE SOURCES"; s15 counts the appended decorate requests; prod-smoke's `home` case expects
  four household jobs (the workbench). Screenshot helper: `tools/qa/tmp/p2_homes.mjs` (every villager's home).

### Phase 3: upgrades and exteriors (2026-10-04)
- **Code**: `src/world/buildings/styles.js` (new: the exterior options and style sets, pure), `src/home/exteriors.js`
  (new: mailboxes, remodelled fences, the upgrade's construction moment), `src/home/grow.js` (new: interiors grow with
  the house, pure), `src/home/exteriorModels.js` (new: the mailbox and the scaffold models), `src/ui/remodel.js` +
  `remodel.css` (new: the house card and the Remodel panel). Changed: `buildings/index.js` (styled templates),
  `homes.js` / `parts.js` / `roofs.js` / `decor.js` / `special.js` (every style field), `village.js`, `details.js`,
  `buildMode.js`, `housing.js`. Test pages: `/?test=buildings&style=all|<set>|roof:plum,…` and `/?test=upgrade`
  (`&style=`, `&frames=1&pair=12|23`: the upgrade storyboard).
- **Styles** (`styles.js`): `b.style = { set?, roof, roofType, wall, trim, door, doorColor, window, noren, norenSym,
  fence, fenceColor, bunting }` on the building record; any missing field keeps the variant's own choice. 10 roof
  colours, hip / gable / irimoya, 8 walls, 5 trims, shoji / round / wooden / lattice doors in 6 colours, shoji / round /
  lattice windows, 5 noren colours or none and 6 marks, picket / bamboo / rail / rope / hedge fences in 5 colours,
  festival bunting; a few options unlock with the village rank (irimoya, red lacquer, the rope fence, bunting). The four
  sets: **Machiya** (charcoal gable, linen walls, dark cedar lattice, an indigo noren with waves, bamboo), **Cottage**
  (terracotta hip, cream, honey trim, a red round door, round windows, white picket), **Tea House** (mossy irimoya,
  butter walls, shoji everywhere, a pine-green leaf noren, a hedge) and **Seaside** (sea-blue gable, sky walls,
  whitewash, a blue wooden door, round windows, a rope fence). Each set adds its own small flourishes while the house is
  wholly in that set (a parasol, a lifebuoy, a rose arch…). Changing one part takes a house off its set; parts that add
  up to a set exactly make it that set again. `remodelCost`: a set costs its price, a part its own.
- **Templates** (`buildings/index.js`): `getTemplate(id, level, seed, style)` keys styled templates by a style hash
  (`home:2:5|door=round,roof=plum`) and builds them with the same Builder seed, so a remodel changes only the chosen
  parts. Unstyled templates are the shared village look: unchanged (bit-identical for every save) and never evicted.
  Styled ones are capped at 24 (`STYLED_CAP`): the least recently used that no live model uses (`buildModel` /
  `releaseModel` count users) are disposed. `templateStats()` for QA.
- **Upgrades** (§5):
  - Every home has a **mailbox** (an instanced model, `mailboxTemplate`, at the spot the yard's random mailbox used;
    the rest of the yard is as it was). Chewy's cottage uses the mailbox on its own model, at local (1.05, 1.2), on
    every level. F at a mailbox, or a click on a house in Build mode with no tool, opens the **house card**: the
    house's picture, name, level, Home Rating and residents, the upgrade's cost (have / need) and Upgrade / Remodel /
    Enter.
  - **Upgrade** spends `catalog.levelCost` (now defined for `chewyHouse` too) and needs the village rank (L2: 1, L3:
    2), the plot's max and room to grow (`growBlock`). The moment (`exteriors.construct`, matching the storyboard):
    the scaffold (`scaffoldTemplate(w, d, h)`, sized for the new footprint and the new house's height) pops up, a dust
    ring, hammering puffs and taps, the old house goes and the new one rises from below the ground, the scaffold drops
    away, petals.
  - `levelUp` **keeps the seed and the style** (organic growth too): a house keeps its look as it grows.
  - **Chewy's cottage has levels 1-3** on its 3×3 plot: L2 adds a dormer and a porch veranda, L3 a second storey with a
    balcony and a bone weathervane; the doghouse entry and bone sign stay. Interior layouts cottage1-3.
- **Interiors grow** (`grow.js` `migrateInterior`): home1 → 2 → 3 and cottage1 → 2 → 3, with per-step offsets
  (L2's main room is L1's moved four cells south; L3's main room is L2's moved ten across and four up, and the L2
  alcove becomes the second room). Furniture keeps its place against the same walls, wall items slide along their
  wall, tabletop pieces ride on their table; anything that doesn't fit tries the cells nearby, and what still doesn't
  fit goes back into storage (a villager's own pieces stay theirs). `interiorOf` runs it when a house's layout no
  longer matches its level.
- **The Remodel panel**: a live preview (its own little renderer: re-rendered on every change, a low front view so
  the door and the noren under a porch show, a turn button), the four set cards and "Its own look", a swatch or chip
  row per part (Auto = the variant's choice; lock badges for rank-gated options), the cost and Remodel. Applying pays,
  rebuilds the house with the style (same seed, same level) and syncs its fence; the door and the mailbox stay.
- **Yard fences follow the style** (`details.js` `setPlotFence`): the plot's own fence runs (the back, and the sides
  it doesn't share with a neighbour) are swapped for a few meshes in the chosen style and colour (pieces cached per
  style and colour), the batched pieces hide; back to the yard's own when the style has no fence. Hedges stay green
  (the colour becomes their flowers).
- **The villagers' homes, fuller** (the art director's polish): L1 homes have 12-14 pieces in two or three clusters
  against the walls and in the corners (a wall item or two, a rug under a cluster, a light) with a clear walkway from
  the door; L2 is laid out by hand with a central anchor cluster in the bigger main room (a rug with a low table and
  cushions, Kitsune's irori on tatami, Tanu's taiko drum); L3 keeps L2's room and turns the bed corner into a little
  bedroom next door. No tatami on tatami floors, no rug on rug. They rate about three stars: the owner's own pieces
  don't count for taste, so the headroom is their style, a favourite piece or a set bonus. A home still on the first,
  barer default (nothing of yours in it) gets the fuller one.
- **QA**: s17 sections j-n (the mailbox and the card; upgrading a home with the scaffold, seed and style kept, the room
  bigger with every piece; remodelling through the panel, the styled template, the fence, the reload; the cottage to
  L2 and L3 with its jobs; the cache cap and remodel cycles); test-rpg "EXTERIORS & GROWTH" (styles, interior
  migration) and "HOMES & RATING"; screenshot helpers `tools/qa/tmp/p3_shots.mjs` (upgrade frames, every set on a home
  and the cottage at the play camera) and `p2_homes.mjs` (`[hour] [level]`).

### Phase 4: the guides, QA, perf and balance (2026-10-04)
- **"Make it home"** (Shadow, `guides.js makeHome`, 8 steps): it starts the next time you're in the cottage after the
  house tour (`indoors: true`: the director may start a guide indoors) — the household jobs (the arrow hops from the
  bed to the chest, the stove and the workbench), B (the Decorate button spotlit), a cushion from storage (its card
  spotlit; a cushion is given if there's none), pick it up / R / put it down, a wallpaper (the tab and the card
  spotlit; one is given if there's none), the Home Rating chip, and the wrap-up (Tanu's Trinkets, the workbench,
  helping villagers). An old save that has been inside the cottage (`flags.homeVisits` or a saved interior) is offered
  it once (`past`).
  - R-13 (2026-10-09, the owner: "'Try one of your favorite pieces' … doesn't seem to be completable"): the rating step
    spotlit the tip, which named no piece and never changed when one was placed. The step now follows the tip (hang the
    Pack Photo, the heart on its card; Got it! stays), every line is in the device's words (touch and the pad reach
    Decorate through the menu), a phone shows the rating as a chip over the palette, and a tap no longer leaves a hover
    tooltip up (`ui/mobile.js`). s17 o) plays it with the real mouse and keys and follows the tip.
- **"Remodel"** (Tanu, `guides.js remodel`, 5 steps): it starts the first time a mailbox is opened (`flags.mailboxOpened`),
  over the house card (`startPanels`): Upgrade / Remodel / Enter (the button row spotlit, a callout on the upgrade
  cost), the set cards, a swatch (the panel emits `remodel:draft`), the cost; Remodel ends it.
- Both are in the Journal's Guides tab. The director changes: a guide may name the panels it can start over
  (`startPanels`) and whether it may start indoors (`indoors`); `past(G)` (when given) decides the old-save offer, and an
  offered guide doesn't wait for its trigger moment.
- **Balance** (the household's money; QA tops coins and materials up and pins `G.housing.testRank` only in its own
  pages — nothing in the game sets them): a new village pays about **110-120 coins a day** (rent of 10 villagers plus
  the farm; `tools/qa/tmp/econ.mjs`), and grows with the village. Upgrades (the player's; the village's own growth is
  still free):

  | | coins | materials | at ~115 a day |
  |---|---|---|---|
  | home L1 → L2 | 320 | 14 wood, 6 stone | ~3 days |
  | home L2 → L3 | 750 | 24 wood, 14 stone, 3 petals | ~6-7 days (and village rank 2) |
  | cottage L1 → L2 | 450 | 20 wood, 8 stone | ~4 days |
  | cottage L2 → L3 | 1000 | 36 wood, 16 stone, 2 lanterns | ~9 days (rank 2) |
  | market shop L2 / L3 | 360 / 800 | | |

  Remodels: a style set 240-320 coins plus a little wood / stone / petals (2-3 days); one part 15-120 coins (a door
  colour 20, the roof colour 60, the roof shape 120). Furniture at Tanu's: 60-700 coins, and he buys it back at half.
- **QA** (s17, 35 checks): sections o and p run both guides end to end with `?tut` (the spotlights checked against
  their buttons and cards, the steps, the Guides tab, the old-save offer); the leak loop is now **10** enter / exit
  cycles and also checks the event listeners (`Events.listenerCount`); the upgrade and remodel round trip survives a
  save and reload (section l).
- **Perf** (`tools/qa/housing-perf.mjs 3`, medians; `village-perf.mjs` A/B against the last commit before housing,
  served from a copy on another port, 3 runs each, alternating):

  | village (village-perf) | before housing | now |
  |---|---|---|
  | play p95 (ms) | 11.9 | 10.6 |
  | title p95 | 11.2 | 9.9 |
  | wide p95 | 12.9 | 14.2 |
  | play draw calls | 323 | 322 |
  | play triangles | 2.61M | 2.62M |
  | boot (ms) | 7070 | 7406 |
  | JS heap (MB) | 268.7 | 298.9 (282-312) |

  Frame times are within run-to-run noise (each figure's own runs vary by 2-5 ms); boot is ~5% longer and the heap
  ~10% larger (the housing modules and the furniture catalog; the furniture models build only when a room needs them).

  | housing (housing-perf) | |
  |---|---|
  | enter the cottage cold (every piece built the first time) | 136 ms (inside the iris) |
  | enter the cottage warm | 23-33 ms |
  | enter a villager's home after its door pre-built it / warm | 37 / 28 ms |
  | the default cottage: draws, p95 | 119 calls, 8-13 ms |
  | a 60-piece room: draws, triangles, p95 | 135 calls (32 batches), 580k, 9.8 ms |
  | a remodel (its styled template's first build + respawn) | 56 ms |
  | the same remodel again (cached) | 1.5 ms |
  | a styled template's build alone | 38-43 ms |
  | 40 different looks in a row | the styled cache holds at 24 (the cap); 7-8 geometries left over (live models) |
