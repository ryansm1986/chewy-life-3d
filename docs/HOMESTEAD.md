# Homestead: farming, fishing and cooking

Status: **built** (all four phases, 2026-10-03: the Pantry and farming; fishing; cooking; QA, perf and docs. See §7 "As
built"). The owner chose:
- **cozy garden plots** for farming (no seasons);
- **a timing + reel minigame** for fishing;
- cooking that does all three: **healing + buff meals**, **gifts + quests**, and **selling for coins**.

The three loops feed each other and the adventure side:
- you grow crops and catch fish;
- you cook them into dishes;
- dishes heal and buff you in the Burrow and the regions, win villagers' hearts, fill requests, and sell for coins.

## 0. What exists (code map, 2026-10-03)
There's no player farming, fishing, cooking, crafting, seasons or weather. Useful pieces:
- **Items** (`src/rpg/items.js`, `actions.js`):
  - Gear and gems live in a 40-slot shared bag.
  - **Materials** are counters (`MATERIALS`, defined in 6 places: items.js, ui/glyphs.js, ui/rpg.js, rpg/icons.js `drawMaterial`,
    combat/groundLoot.js, rpg/loot.js).
  - **Potions** are a belt (`POTIONS`: heart, zoom, rejuv; `POTION_CAP`; keys Q/E/R; `usePotion` with a temporary
    heal-over-time).
  - `inventory.js:224` calls a non-existent `A.useItem` for non-gear items.
- **Buffs**: `G.combat.buffs` resets on every world change (`game.js:273`). `computeStats` (`rpg/stats.js:97`) reads only stats
  and gear. The HUD buff chips are in `BUFF_INFO`/`syncBuffs` (`game.js:209`).
- **Farm scenery and villagers**:
  - the `farm` "Veggie Patch" building (`catalog.js:54`), with cabbage and carrot rows and a scarecrow (`buildings/workshops.js:25`);
  - farm plots `farm-1` (starter) and `farm-2` with `field: true` (`plots.js:79`), and tilled rows that are static instances
    (`details.js:1400`);
  - villagers `tend`/`water` with a watering can (`npc.js:33,43,928`; `lifePoses.js:58`);
  - props: `wateringCan`, `veggieBed`, `sack`, cabbage/carrot/pumpkin (`buildings/props2.js:134-362`).
- **Fishing scenery and villagers**:
  - `VillageLife.fishing()` spots: 3 at the pond and 2 on the river, docks skipped (`villageLife.js:351`);
  - villagers fish with `rod`/`bobber` props, a bite timer, `reel` and splash (`npc.js:460, 895-949`; `lifePoses.js:72`);
  - the pond dock (`details.dock`), koi (`gfx/ambient.js:27`), the `fishingHut` building (`catalog.js:69`);
  - region waters (`regionWorld.waterAt/surfaceAt`);
  - sfx `splash`, `splash_cast`, `water_splash`.
- **Cooking-flavoured pieces**:
  - Chewy's cottage menu (`services.js:33`: stash, sleep, leave);
  - Kuma the baker, Rosie's bakery;
  - the `bigCauldron` and campfire art (dungeon);
  - cake and donut props.
- **The day clock** (`gfx/sky.js`): 14 real minutes per day. It only advances in the village. `VillageSim.onNewDay`
  (`village.js:767`) runs the daily economy at 6:00 or on sleep.
- **Villager likes** (`roster.js`): fish (Mochi, Kero), carrot (Usagi), honey (Kuma), bamboo (Pan). None of these can be gifted
  today, because `giftFlow` (`story.js:256`) lists only the first 6 materials.
- **The interaction framework**:
  - `world.interactables` `{pos, radius, label, onInteract}`, with the F key, the prompt and click-to-move (`game.js:396-417`);
  - `G.ui.dialogue/toast/float/banner/hint`;
  - panels: subclass `ui/panel.js` and register in `ui/ui.js`;
  - free keys: G H L N O P U V Y Z.
- **Saves**: `newGameState` (`actions.js:54`) and `saveableState`. Use lazy init for new subtrees (as `regionState` does). The
  household is shared at the top level; `heroes[id]` is per hero (docs/HEROES.md).

## 1. The Pantry (one home for crops, fish, seeds, forage and dishes)
- `state.pantry = { [id]: qty }` is a shared, unlimited counter map, like materials, but **not** on the HUD strip and **not** in the
  gear bag (the 40 slots stay for gear).
- A definitions table, `src/life/pantry.js`. Each entry:
  `{ id, kind: 'seed'|'crop'|'fish'|'forage'|'dish', name, jp, desc, icon, sell, value, likedBy?, food? }`.
- Actions:
  - `addPantry(id, n)`, `hasPantry(req)`, `spendPantry(req)`, emitting `pantry:changed`;
  - `eat(id)`;
  - `sellPantry(id, n)`.
- **UI**: a **Pantry** tab beside the Bag in the inventory panel, with category tabs, counts, tooltips, an "Eat" button on
  dishes and a "Plant" hint on seeds. It should match the Bag's look.
- **Icons**: canvas icons in `rpg/icons.js` style for every seed, crop, fish and dish (a new `drawPantry(id)`), in the same
  cozy painted look.
- **Pickups**: toast plus the item icon. A first-time discovery gets a little "New!" badge.

## 2. Farming: cozy garden plots
- **Where**:
  - **Chewy's garden**: a 4×3 tile bed in his cottage yard, available from day one;
  - **the farm fields**: the `farm-1`/`farm-2` plots, usable once that plot has a Veggie Patch built. Its tilled area becomes
    plantable tiles, replacing the static crop instances there with player tiles.
  - Optional later: rank-3 unlock of a second home garden bed.
- **Tile states**: wild → **till** (F, `dig` pose) → **plant** (F, then a small seed picker from the pantry; `pickup` pose) →
  **water** (F, `water` pose with the watering can, droplets) → grows over days → **ripe** (a sparkle) → **harvest** (F, `pickup`
  pose, the crop pops out). Re-growing crops (strawberry, tomato) return to a growth stage after harvest.
- **Growth**: one stage per new day (`VillageSim.onNewDay`) **if watered that day**. Sleeping counts as a new day. A dry day just
  pauses growth; crops never die (cozy). Each crop has 2–4 stages.
- **Crops** (8; sell value grows with days):

  | Crop | Days | Notes |
  |---|---|---|
  | turnip | 2 | |
  | carrot | 3 | Usagi likes it |
  | cabbage | 3 | |
  | daikon | 4 | |
  | strawberry | 4 | re-grows every 2 days; rank 2 |
  | rice | 5 | for onigiri; rank 2 |
  | pumpkin | 6 | rank 3 |
  | melon | 6 | rank 3; Pan likes it |

- **Seeds**: sold at a **Seed Stall** run by Usagi (a market stall or her garden), stocked by village rank. Some seeds are found in
  the Burrow, regions and chests (`loot.js`), and Usagi gives a starter pack.
- **Sprinkler** (rank 3, a Build-mode decoration): waters the 8 tiles around it each morning.
- **Visuals**: per-tile dynamic instanced meshes (tilled soil, wet-soil tint, sprout → young → ripe models per crop, Toybox-cozy,
  reusing props2's crops where possible). Crops sway gently in the wind. Watered soil looks darker until morning.
- **Villagers**: the existing `farm` stand spots stay around the Veggie Patch building, not on the player tiles.

## 3. Fishing: cast, bite, reel
- **The rod**: Kero gives Chewy a starter rod in a short intro quest ("Pond Guardian's Apprentice"), unlocked after the first
  village day, or bought at the Fishing Hut. A better rod (an easier reel bar) is sold at rank 3.
- **Where**: any village shoreline (pond, river, beach, the pond dock end) and region waters (tidepool, onsen streams, maple
  ponds, bamboo creeks).
  - When the player stands at the water's edge facing water and has the rod, F prompts **"Fish"**.
  - The player's own spot shouldn't evict villagers; if a villager is already at that bank, prefer another bank tile.
- **Flow**:
  1. **Cast**: the `fish` pose. The rod replaces the hidden sword and ball in the hand; the bobber flies out with
     `splash_cast`.
  2. **Wait**: 2–8 s, with small nibble bobs to tease.
  3. **Bite**: a "!" emote, a splash, the bobber dips. Press **F or LMB within about 0.6 s** (too early or late: "It got
     away!").
  4. **Reel bar**: a short HUD widget (about 4–8 s). A fish icon darts along a vertical bar. Hold F or LMB to raise your catch
     zone, release to let it fall. Keep the fish in the zone to fill the catch meter; empty means it escapes. Each fish has a
     difficulty (speed and darting). Movement keys cancel at any time.
  5. **Catch**: the `reel` pose, the fish arcs out (a `koiMesh`-style fish recoloured per species), a size is rolled, and a toast
     shows name, size and "New record!". Then the clap pose.
- **Fish** (about 15): by spot (pond / river / sea / region), time window (day, evening, night) and rarity. For example:
  crucian carp, koi (pond, rare gold koi at night), sweetfish (ayu), trout and char (river), sea bream (tai), mackerel, flounder
  and octopus (beach), salmon (onsen streams), loach and rainbow trout (maple ponds), pufferfish (tidepool), and a **legendary**
  Moon Koi (pond, night, very rare). Some fish are only for cooking, some are for gifts, some sell high.
- **Fish Log**: a tab in the Journal that lists caught fish with their silhouettes, where and when, best size, and count, with
  "???" for unseen. Completion milestones give gifts from Kero.
- **Villagers**: Kero buys fish at a premium and comments on records. Mochi and Kero like fish gifts.

## 4. Cooking: meals that heal, buff, charm and sell
- **Where**:
  - **"Cook"** in Chewy's cottage menu (`services.js`);
  - a **campfire** at the Burrow camp and each region's entry camp, offering simple recipes only (grilled fish, roasted veg);
  - Rosie's bakery: "Bake with Rosie" for baked recipes.
- **The Cook panel**: the recipe list (known ones, then "???" hints), ingredients with have/need counts, a "Cook ×N" button, a
  little cooking animation and an sfx, and the dish goes to the pantry.
- **Recipes** (about 14, using crops, fish and existing materials such as mochi, petal and honey):

  | Recipe | Ingredients | Notes |
  |---|---|---|
  | Grilled Fish | any fish | |
  | Roasted Veggies | 2 crops | |
  | Miso Soup | daikon + fish | |
  | Carrot Soup | 2 carrot | Usagi ♥ |
  | Onigiri | rice | add fish for Salmon Onigiri |
  | Cabbage Rolls | | |
  | Pumpkin Stew | | |
  | Strawberry Mochi | strawberry + mochi | Rosie ♥ |
  | Honey Cake | honey + strawberry | Kuma ♥ |
  | Grilled Trout | | Kero ♥ |
  | Melon Bread | | Pan ♥ |
  | Sushi Platter | 3 fish + rice | |
  | Fisherman's Feast | | |
  | Moon Koi Bento | | legendary |

  - **Honey**: a new forage item from beehive decorations, or bought from Kuma.
  - **Learning recipes**: from villagers (heart rewards, requests), a cookbook at Rosie's, discovery by cooking a combination
    (sensible fallbacks), and starters known (Grilled Fish, Roasted Veggies, Onigiri).
- **Eating**:
  - From the Pantry ("Eat"), or a **quick-meal slot** on the potion belt (key **G**, showing the last chosen dish).
  - A dish heals instantly (a big chunk), plus one **"Well Fed"** buff at a time. The buff types are:
    - Hearty: max life up and regen;
    - Swift: move and attack speed;
    - Strong: damage;
    - Lucky: drop and gold find;
    - Zen: energy and cooldowns.
  - The buff lasts about 8–15 real minutes. It's stored per hero at `state.heroes[id].meal = {dish, buff, until}` (real-time
    timestamp or play-time seconds), folded into `computeStats`, so it **survives world changes**. It shows as a HUD chip with a
    timer. Eating a new dish replaces it.
- **Gifts and quests**:
  - `giftFlow` offers pantry items (dishes first, then fish and crops) as well as materials, with a paged picker rather than "first
    6".
  - **Loved dishes** give +16 heart points with a special line, **liked** ones +8 (fish for Kero and Mochi, carrot for Usagi, honey
    for Kuma, bamboo for Pan), others +3.
  - Daily requests can ask for crops, fish and dishes. **Append** them after the existing request list, so s8's
    `Math.random=0.01 → 'wood'` stays valid.
  - New short quests:
    - Usagi's "First Sprouts" (plant and harvest);
    - Kero's "Apprentice" (catch 3 fish);
    - Rosie's "Taste Test" (cook 3 dishes).
- **Selling**:
  - The shop Sell tab gets a **Pantry** section: sell crops, fish and dishes for coins.
  - Rosie pays best for dishes and baked goods, Kero (the Fishing Hut) for fish, and Usagi's stall for crops.
  - The Fishing Hut and Veggie Patch daily incomes stay as they are.

## 5. Technical notes
- **Code**:
  - new folder `src/life/`: `pantry.js` (defs), `garden.js` (tiles, growth, meshes), `fishing.js` (spots, flow, reel widget,
    fish defs), `cooking.js` (recipes, cook panel logic), `meals.js` (buff effects);
  - UI: `ui/pantry.js`, `ui/cook.js`, `ui/fishlog.js`, `ui/reel.js`;
  - hooks in `actions.js`, `story.js`, `services.js`, `game.js`, `village.js` (onNewDay), `stats.js`, `hud.js`, `shop.js`,
    `inventory.js`, `loot.js` and the region worlds.
- **Saves**: `state.pantry`, `state.garden` (`{tiles: [{x, z, crop, stage, watered, ...}]}`), `state.fishLog`,
  `state.cookbook`, and `heroes[id].meal`, all lazy-init. Old saves load with empty ones.
- **Player tools**: the rod, watering can and hoe are props on `rig.parts.handR`. Hide the sword and ball while one is out, as
  `carrySword` and `npc.setProp` do. WASD or attack cancels the hold poses (`anim.stop()`).
- **Interactables**: garden tiles get **one** interactable for the whole bed that picks the tile under or in front of the player,
  not one per tile. Keep `villageInteract` stable across round trips (s1).
- **Multiplayer note**: keep the state under the shared household (docs/MULTIPLAYER.md mentions fishing as a shared verb).
- **Performance**: crop meshes are instanced; the reel widget is DOM or canvas; no per-frame allocations.

## 6. QA
- **`tools/qa/s15-homestead.mjs`**:
  - till, plant, water, sleep, grow, harvest, and the dry-day pause;
  - the seed stall;
  - rod, cast, bite, reel success and fail, the fish log and records, and region fishing;
  - cook, eat, heal, the buff surviving a Burrow round trip;
  - gift a loved dish, a request with a crop, selling pantry items;
  - save and load of all the new state, and an old save loading clean.
- **Unit tests** in `tools/test-rpg.mjs` for the pantry and recipe math.
- **The existing QA**: s1, s5, s7, s8, s10, s12, s13, s14, prod-smoke.
- **Docs**: ARCHITECTURE.md, README, this file's status.

## 7. As built
### Phase 1: the Pantry and farming (2026-10-03)
- **Code**: `src/life/` holds `pantry.js` (defs, prices, seed drops; pure data), `pantryIcons.js`, `garden.js`,
  `gardenModels.js`, `tools.js`, `life.sfx.js` and `index.js` (`installLife(G, village)` from game.js builds
  `G.life = { tools, garden, update, onNewDay }` and the Seed Stall). The UI is `ui/pantry.js` (the Pantry view, the
  seed picker, `pantryGain`) and `ui/life.css`.
- **The Pantry**:
  - 50 items: 8 seeds, 8 crops, 15 fish, 4 forage (honey, bamboo shoot, shiitake, nori) and 15 dishes (Salmon Onigiri
    has its own entry).
  - An entry has `value` (its worth) rather than separate `sell` / `value` fields. `sellPrice(id, buyer)` applies the
    buyer premiums: Rosie ×1.25 for dishes, Kero ×1.3 for fish, Usagi ×1.25 for crops.
  - Seeds also carry `crop` and `price`. Dishes carry `food: { heal, buff, tier, mins }` (the buff lands in phase 3).
  - Tastes: `likedBy` (the roster's likes, 'fish' = any fish) and `LOVED` (one signature dish per villager). Mochi ♥
    Sushi Platter and Kitsune ♥ Moon Koi Bento were added to the five in §4.
  - `state.pantryFound = { id: day }` remembers first discoveries for the "New!" badge.
  - Actions (`actions.js`): `addPantry`, `hasPantry`, `spendPantry`, `sellPantry`, `buyPantry`, `eat`, `pantryCount`,
    plus a `{ type: 'pantry', key, n }` drop for `pickup()`. Events: `pantry:changed`, `meal:eaten`.
  - The **P** key (and a Bag / Pantry tab in the inventory header) opens the Pantry view.
- **Farming**:
  - Beds: Chewy's 4×3 bed (`layout.CHEWY_GARDEN`, south of his stepping stones) and the tilled field tiles of every
    farm plot holding a Veggie Patch (`details.fieldTiles(plotId)`).
  - **Static crops removed**: `details.plotYard` no longer places static crops on a field. The garden draws the soil
    and crops there.
  - **Farmers' rows**: the first time a field is farmed, about a third of its tiles start with turnips, cabbages and
    carrots at random stages (`garden.seeded`), so the starter farm looks lived-in and gives a first harvest.
  - Tile rules: field tiles are tilled by default; Chewy's bed starts wild (short, thin grass via `terrain.wear`).
    Tilled home tiles are painted `T.FIELD` on the terrain.
- **Poses and props**:
  - Till uses a new two-chop `till` pose (lifePoses.js) with the hoe, rather than `dig`. The hoe reads as tilling;
    dig is a paw dig.
  - Plant uses `pickup` and the seed pouch. Water uses `water` and the watering can, with spout droplets. Harvest uses
    `pickup`, and the crop's icon pops out of the soil and arcs over the player's head into the pantry.
  - `player.toolOut` keeps the sword sheathed and hides the ball or staff (Player.carrySword).
- **Growth**:
  - `garden.onNewDay(day)` runs from `village.onNewDay` (the 6:00 tick and naps). Each watered crop grows one stage,
    the soil dries, then sprinklers wet their 8 neighbours.
  - **Sleep fix**: `G.sleep` now always advances the day. Napping at 2 am used to replay the same day number, so
    crops wouldn't have grown.
- **Seeds**:
  - Usagi's Seed Stall is a cart on the South Meadows lawn (`layout.SEED_STALL`), with an F interactable, a green
    minimap dot and a "Seeds, please!" choice in Usagi's chat.
  - Its first visit gives the starter pack (5 turnip, 3 carrot).
  - The shop panel takes `pantry: [{ id, price }]` entries; Shift+click buys 5.
  - Stock opens by village rank. Seed drops ride on top of loot.js in dungeonMode (`seedDrops`; kills and chests,
    Burrow and regions), so rollDrops' seeded tests stay put.
- **Sprinkler**:
  - A `sprinkler` decor building (catalog.js, MODELS, RANK_REQ 3) with a spinning head that sprays on mornings.
  - `canPlace` lets it stand on any garden tile, even inside Chewy's fixed plot. A tile under a building is blocked
    (hidden, no actions).
- **Rendering**:
  - `GardenView`: three `BatchedMesh`es (soil, crop bodies, crop leaves) with one fixed instance slot per tile,
    `setGeometryIdAt` for stage changes, and instance colour for wet soil. The leaves use `vegToon` grass wind, so
    they sway and Chewy brushes them aside.
  - One interactable serves every bed: its `pos` and `label` follow the tile in front of the player, so the
    village interactables stay stable (s1).
  - A rounded tile cursor shows in the action's colour.
- **Test page**: `/?test=homestead&view=icons|crops` (every icon; every crop at every stage, the bed, the stall, the
  sprinkler).
- **QA**: `tools/qa/s15-homestead.mjs` covers the phase 1 part of §6 (17 checks: pantry actions and tab, the Seed
  Stall, till / plant / water / harvest through the real keys, growth and the dry-day pause, regrowth, the
  sprinkler, fields, seed drops, save / load and an old save). It's in run-all.

### Phase 1 review fixes (2026-10-03)
- **No district opens on day 1**: a fresh game reaches rank 2 within seconds (a starter population of 10 against a
  threshold of 12), which used to pop "New district: Outer South Meadows!" on the first morning. `village.checkRings()`
  now waits for day 2 and also runs from `onNewDay`, so a district earned on day 1 opens the next morning. s14's ring
  test sets day 2 first and checks "no district opens on day 1".
- **Chewy's bed edging**: a low board edging (0.12 m, `BED_EDGE`) that the player steps over, with stumpy corner posts
  and the sign as small colliders (tag `'garden'`), so every tile stays reachable and nothing clips.
- **Minimap**: `garden:till` marks the village minimap dirty (a 2.7 ms rebuild, only on till).

### Phase 2: fishing (2026-10-03)
- **Code**:
  - `src/life/fishData.js`: spots, times, the 15 fish (spot weights, difficulty, behaviour, sizes), `biters` /
    `rollFish` / `rollSize`, and the Fish Log's `recordCatch`. Pure data.
  - `reelSim.js`: the reel physics, no DOM, node-testable.
  - `fishModels.js`: the two rods, the float, the ice hole, and a toy catch model per fish.
  - `fishing.js`: the session. `fishSocial.js`: Kero (the quest's rod, milestone gifts, record comments, the Fishing
    Hut shop).
  - UI: `ui/reel.js` (the reel bar) and `ui/fishlog.js` (the Fish Log tab).
  - `G.life` gains `fishing`, `onTalk` and `markerFor`.
- **State**: `state.fishing = { rod, milestones, gotRod?, pendingMilestone?, lastRecord? }` and
  `state.fishLog = { id: { n, best, day, spot, time } }`. Both are household and lazy-init, so old saves load with no
  rod and an empty log.
- **The rod**:
  - Kero's quest "Pond Guardian's Apprentice" is offered from day 2: at boot, on arrival in the village, and each new
    morning. Its talk step gives the Bamboo Rod. Its second step is "Catch 3 fish", a new `fish` step type fed by
    `fish:caught`.
  - **Merged quest**: the intro and §4's "Kero's Apprentice" are the same quest, so phase 3 adds two new quests, not
    three.
  - The Fishing Hut sells the Bamboo Rod (150) to anyone who skipped the quest. It sells the Moonlit Rod (650) from
    rank 3; before that it shows a locked card with a lock badge.
  - The Moonlit Rod gives:
    - a bigger catch zone (0.36 against 0.28) and an 18% slower drain;
    - a longer bite window (+0.12 s) and shorter waits;
    - rare fish ×1.6.
  - The 10-kind milestone also gives the Moonlit Rod, or 800 coins if you already have it.
  - While the rod is out (`Tools.hold`), the sword stays sheathed and the ball or staff hides, as with the farm tools.
- **Where**:
  - There is one interactable per world, pushed into the village and into each region world on arrival. Its `pos`
    and label follow the water ahead of the player.
  - `scan()` looks 0.9-4.2 m ahead on five bearings. It wants water at least 0.28 m deep that starts within 2.6 m, and
    casts to about 2.6 m (or the water's far side).
  - **Village**: water is `heightAt < 0`. That covers the koi pond, the river, the waterfall pool, the sea and the
    dock's end; the dock deck itself isn't water. The spot is the pond, the river (`riverDist`, the basin) or the sea.
  - **Regions**: `waterAt` minus pools, so there's no fishing in hot springs. The spot is the region.
  - **Ice fishing** (a deviation): Yukimi Onsen has no open water. Its pond, lake and plunge pool are frozen, and the
    rest is hot springs. So "onsen streams" became the **Frozen Pond**:
    - standing on the ice, F says "Ice fish 🎣 Frozen Pond";
    - a hole opens in the ice 1.15 m ahead (dark water, a jagged snowy rim, chipped chunks) with the float in it;
    - char, salmon and crucian carp bite there; ayu left the onsen list.
  - A villager already fishing keeps their bank: a target within 2 m of their float is skipped for the next bearing.
  - Monsters with aggro within 9 m make it "Too noisy to fish here!".
- **The flow** (`fishing.js`):
  1. **Cast**:
     - a new `rodCast` pose (a wind-up and a flick); the float leaves at its `release` event and arcs out;
     - `splash_cast`, ripples and droplets, then the `fish` hold pose;
     - controls lock while fishing.
  2. **Wait**: 2-8 s (×0.8 with the Moonlit Rod), with nibble dips, small ripples and a `nibble` tick. Pressing early:
     "Too early — it swam off!".
  3. **Bite**:
     - the fish is rolled now (spot, hour, rod);
     - a "!" emote, a splash ring, the float dunks and shakes, `bite_ping`, a small camera shake;
     - the player has 0.62 s to press F / LMB, otherwise "It got away!".
  4. **Reel** (`ReelSim` and `ReelBar`):
     - The bar card sits beside the player. It shows:
       - the fish (a silhouette and "???" until it's in the log);
       - the mint catch zone, lit and glowing while the fish is inside;
       - the catch meter: a rose-to-gold fill, red and shaking below 18%, glowing with a spinning star above 82%.
     - Hold F / LMB to lift the zone.
     - The float tugs left and right with the fish, and the rod bends harder when the fish is out of the zone.
     - The reel clicks while held, its pitch rising with the meter.
     - Easy fish take about 3.5 s and middling ones 4.5-6 s. The Moon Koi is genuinely hard with the Bamboo Rod.
  5. **Catch**:
     - "Caught!" with confetti on the card, and the `reel` pose;
     - the fish model leaps out of the water on the line and arcs over the player's head;
     - the toast: "Koi 46.2 cm New!" or "New record!", with "Koi Pond · 3/15 in your Fish Log";
     - the pantry gain and sparkles, then `fish_catch` (or `pickup_rare` for rare fish), the `fish:caught` event and a
       clap.
  6. **Escape**: plays `fish_escape` and shows "It got away…" on the card.
  - Movement keys or Escape reel in. Getting hurt, a world change, the iris or death end the session quietly.
- **Fish**:
  - 15 kinds over the pond, the river, the sea and the four regions.
  - They bite by day, evening or night; the gold koi and the Moon Koi only at night.
  - Each has a difficulty and a behaviour (smooth, darter, sinker, floater).
  - Each has a size range: mostly small to middling, now and then a whopper.
- **The Fish Log**: a third tab in the Journal ("Fish Log", with a count). It has:
  - a 5×3 grid of cards: silhouettes and "?" until caught, then rarity-tinted with the best size and count;
  - a detail card: best, count, first catch day and spot, and where and when it bites ("Rumoured to bite at…" until
    caught);
  - a progress bar with the 5 / 10 / 15 gift pips, and the rod you hold.
- **Kero**:
  - Milestones (5 / 10 / 15 kinds) put a gift marker on Kero. Talking to him gives:
    - 300 coins and 2 grilled fish;
    - then 600 coins and the Moonlit Rod;
    - then 2000 coins and a Moon Koi Bento.
  - He comments on your newest first catch or record when you next talk.
  - His chat gains "Fishing gear & fish trades 🎣". The `fishingHut` building's interactable opens the Fishing Hut too.
- **Shops** (`ui/shop.js`):
  - `goods: [{ id, name, icon, price, locked?, once?, onBuy }]` entries for one-off wares (the rods).
  - `sellKinds` / `buyer` / `noBagSell`: the Sell tab lists those pantry goods at the buyer's price and no bag items.
    Click sells one; Shift+click sells them all.
  - Kero buys fish (×1.3). Usagi's stall now buys crops (×1.25) the same way.
  - A stall that trades in pantry goods opens the Pantry view beside it instead of the Bag.
- **Sounds** (`life.sfx.js`): `nibble`, `bite_ping`, `reel_start`, `reel_click`, `fish_catch`, `fish_escape`.
- **Test page**: `/?test=homestead&view=fish` (the 15 catch models, both rods, the float, the ice hole).
- **QA**: s15 gains the fishing checks (h-k):
  - Kero's quest and the rod;
  - cast, early press, missed bite, a real reel through synthetic F holds, an escape, WASD;
  - the quest finishing;
  - spots, hours, records and milestones, and Kero's gift;
  - the Fishing Hut: the locked rod, and selling fish at ×1.3;
  - a tide-pool catch and an ice-fishing catch;
  - the Fish Log and the rod through save / load.

### Phase 2 review polish (2026-10-03)
- **The airborne catch**: it arcs at 1.5× its held size, turned side-on to the camera, with an ink contour
  (`makeOutline`, an inverted hull), so the species and its colours read at play distance. It settles to 1.15× over the
  head.
- **Materials**: the fishing meshes use their own materials. They visit region scenes, whose teardown disposes
  whatever it finds, and they must not take the village buildings' `MATS()` with them.

### Phase 3: cooking (2026-10-03)
- **Code**:
  - `src/life/cooking.js`: the recipes, stations and how each is learned, plus the pure helpers: ingredient planning
    (named ingredients are reserved before wildcards; "any fish" takes the cheapest first and never the Moon Koi),
    `maxCook`, `matchMix` / `fallbackMix` ("Try a mix"), `hintFor`, the cookbook state. Pure data.
  - `meals.js`: the Well Fed buffs (`BUFFS`, `mealFor`, and `mealAcc` / `mealPost` for computeStats). Pure.
  - `kitchen.js`: stations, the cooking moment in the world, the campfire camps, eating feedback, the meal tick, the
    G quick meal, the HUD chip.
  - `kitchenModels.js`: the campfire camp, the flames, the stove pot and the ladle.
  - `cookSocial.js`: who teaches what, and Rosie's shop extras.
  - UI: `ui/cook.js` (the Cook panel) and `ui/gift.js` (the paged gift picker).
  - `G.life` gains `kitchen`, `teach(recipe)` and `onRequestDone(giver)`.
- **State** (household unless noted, all lazy-init):
  - `state.cookbook = { known: { recipe: day }, cooked: { recipe: n }, quick }`. `quick` is the G quick meal.
  - **Deviation**: the meal is stored on the hero's own player object, `state.heroes[id].player.meal = { dish, buff,
    tier, left, dur }`, not on `state.heroes[id].meal`. normalizeHeroes rebuilds the hero wrapper object around the
    live player, so anything beside `player` would be dropped. The player object travels with the hero and saves
    with them.
  - `left` counts seconds of play (it ticks while you play that hero, not while the game is closed).
- **Actions** (`actions.js`):
  - `cook(recipe, n, { picks, learn })` emits `dish:cooked`;
  - `spendMix(picks)`;
  - `learnRecipe(id)` emits `recipe:learned`;
  - `tickMeal(dt)` emits `meal:expired`;
  - `eat(id)` now sets the meal, recomputes the stats (so Hearty's bigger max life counts for the heal), heals, and
    makes the dish the quick meal. It emits `meal:eaten` with the meal and the one it replaced.
- **Stations**:
  - **Chewy's kitchen**: "Cook something 🍳" in the cottage menu; everything but baked goods.
  - **Campfire camps**: a stone ring, a log teepee with live flames, a tripod pot, a log seat and a crate. One sits
    3-5 m from the arrival point of every Burrow floor and every outdoor region (clear of the exit stone and other
    interactables, walkable all round, a collider and a light). "Cook at the campfire 🔥" offers Grilled Fish, Roasted
    Veggies and Salt-Grilled Trout.
  - **Rosie's oven**: "Bake with Rosie 🧁" in her chat; Strawberry Mochi, Honey Cake and Melon Bread only.
- **The Cook panel** (left side, 742 px):
  - Tabs **Recipes** (with the count known) and **Try a mix**.
  - The cookbook list, in order:
    - known recipes cookable here (the ones you can make first, with ×N and a mint marker);
    - this station's unknown "???" recipes, with how you might learn them;
    - recipes for other stations (tagged Kitchen / Oven);
    - the rest.
  - The detail card: the dish on a plate, its heal and Well Fed chips with the real numbers, ingredient cards with
    have / need (wildcards say "any"), a −/+/Max stepper and **Cook ×N**. An unknown recipe shows its ingredients as
    "?" with a hint; a recipe for another station says where to cook it.
  - **Try a mix**: up to four ingredients into a pot from your crops, fish, forage and mochi.
    - A known combination cooks its dish.
    - An unknown one is a **discovery**: it's learned, with a "New recipe discovered!" and a star burst.
    - A non-recipe falls back sensibly: fish → Grilled Fish, rice → Onigiri, 2+ crops → Roasted Veggies (the extras
      are spent: a happy accident).
    - Nothing edible is refused without spending anything.
  - **Cooking**:
    - A pot bubbles over the card: the ingredients drop in, steam, bubbles, the flames (pink at the oven) and a
      progress ring.
    - Meanwhile in the world, the hero stirs with a ladle (a new `cook` pose), either at the campfire's pot or at a
      little stove pot set down in front of them, with steam, stir taps, a sizzle and a bubble.
    - Then "ding": the dish pops out on a plate with its name, and flies into the pantry.
  - Keys: F / Enter cook, ↑ ↓ choose, Esc.
- **Recipes** (15; the starters are Grilled Fish, Roasted Veggies and Onigiri). How the rest are learned:

  | Recipe | Learned |
  |---|---|
  | Carrot Soup | Usagi's "First Sprouts", or Usagi at 3 hearts |
  | Strawberry Mochi | Rosie's "Taste Test", or Rosie at 3 hearts |
  | Honey Cake, Melon Bread | Kuma, Pan at 3 hearts |
  | Salt-Grilled Trout | Kero at 3 hearts |
  | Sushi Platter | Mochi at 3 hearts, or her request |
  | Moon Koi Bento | Kitsune at 3 hearts |
  | Miso Soup, Cabbage Rolls, Pumpkin Stew, Salmon Onigiri, Fisherman's Feast | the first homestead request done for Kero, Usagi, Kuma, Mochi, Tanu; or Rosie's cookbook pages (150-600 coins; the Feast from rank 3) |

  Every recipe can also be discovered by mixing its ingredients.
- **Honey** (a deviation): Rosie sells Kuma's honey by the jar (40). It also drops as forage in the regions, alongside
  bamboo shoots (bamboo grove), shiitake (maple, onsen) and nori (tide pools), from kills and chests
  (`forageDrops`, next to `seedDrops`). There are no beehive decorations yet.
- **Eating** (the Pantry's Eat / right-click, or **G**):
  - A `munch` pose with the dish in paw and crumbs, the heal (float and sparkle), a Well Fed shimmer, and the toast
    ("Yum! Grilled Fish +33 ♥ — Well Fed: Strong I · 8 min — +10% damage", noting the buff it replaces).
  - **Well Fed** (one per hero; a new dish replaces it), by tier I-III:

    | Buff | Effect |
    |---|---|
    | Hearty | +8/12/18% max life, +1/1.6/2.4 life/s |
    | Swift | +8/12/18% move, attack and cast speed |
    | Strong | +10/16/25% damage |
    | Lucky | +20/35/60% magic find and coins |
    | Zen | +25/40/60% zoom regen, −5/8/12% cooldowns |

  - computeStats folds it in like gear: `mealAcc` adds into the affix accumulator, and `mealPost` scales max life and
    regen and sets `derived.meal`. It survives Burrow and region trips and save / load.
  - **HUD**:
    - a round **Well Fed chip** (the dish icon, a dashed ring in the buff's colour, minutes left). Buff chips now
      have tooltips: this one names the buff, the dish and its numbers;
    - a **quick-meal slot (G)** on the belt after the potions. It shows the last dish eaten, or else the most filling
      dish in the pantry, and appears once there is one. It's listed in the controls menu.
  - When the meal runs out the stats go back and a toast says "The strong feeling fades…".
- **Gifts**:
  - "Give a gift" opens the **paged gift picker** (12 a page; ◀ ▶ / A D; 1-9 give; Esc never mind). It lists dishes,
    then fish, crops and forage (loved and liked first within each), then materials. Loved items wear a pulsing pink
    heart with "Loves!"; liked ones a small heart.
  - Points: **loved dish +16** with the villager's own line (`LOVED_LINES`), a heart burst and a happy `gift_loved`
    jingle; **liked +8**; anything else +3. A toast shows the points and hearts.
  - `giftFlow(npc, say, pickGift)`: without a picker it falls back to a paged dialogue menu (s8's direct test uses
    that).
- **Requests**:
  - `homesteadRequests(npc)` is **appended** after the three old templates, so s8's `Math.random = 0.01 → 'wood'`
    still holds. It adds a crop the stall sells at this rank, a fish once you have a rod, and a dish you have cooked.
  - They are `deliver` steps with `pantry: true`, handed over from the pantry when you talk to the villager (the
    quest list, the tracker and the pointer count pantry goods).
  - The first one done for a villager teaches their request recipe.
- **Quests**:
  - Usagi's **"First Sprouts"** (plant 3 seeds, harvest 3 crops) starts with the starter pack at the Seed Stall. It
    rewards 120 coins, 50 xp, 10 hearts, 2 strawberry runners and the Carrot Soup recipe, and leads into Rosie's
    **"Taste Test"** (cook 3 dishes, then let her taste them). That rewards 200 coins, 80 xp, 10 hearts, 2 mochi and the
    Strawberry Mochi recipe.
  - New quest step types: `plant`, `harvest`, `cook`. New rewards: `recipe`, `pantry`.
- **Selling**: Rosie's Sell tab lists your dishes first, at ×1.25, with the Bag beside her shop as before. A gear
  shop now always opens the Bag view beside it; the pantry-only stalls open the Pantry. Her Buy tab gains the
  cookbook pages (one-off goods, locked by rank) and honey.
- **Sounds** (`life.sfx.js`): `cook_sizzle`, `cook_bubble`, `cook_stir`, `cook_ding`, `eat_munch`, `meal_buff`,
  `recipe_learn`, `gift_loved`.
- **Test changes**: s8's loop presses 1 in the gift picker, and its cottage check picks "Leave" at its new index (3).
  The request-order check is unchanged and still passes.
- **QA**: s15 gains the cooking checks (l-n):
  - First Sprouts → Taste Test;
  - the cottage Cook panel, Cook ×2 through the button (pot, pose, ladle, cheapest fish);
  - Try a mix: a discovery, a refusal, a fallback;
  - the oven;
  - eating (heal, Strong I, the chip, replacing, G);
  - the Burrow camp and the meal surviving there and back;
  - per hero;
  - expiry;
  - the gift picker (+16 / +8 / +3);
  - a crop request from the pantry teaching Cabbage Rolls (and 'wood' still first);
  - 3-heart teaching;
  - Rosie's cookbook page and her dish premium;
  - the cookbook and meal through save / load, and an old save.

### Phase 4: QA, perf and docs (2026-10-03)
- **`tools/test-rpg.mjs`** (4,903,285 checks, all passing):
  - **The 28 stale checks**, brought up to today's design:
    - two heroes: 42 skills in 6 trees, 21 for each hero;
    - staff skills belong to Moka;
    - staffs are weapons with all three tiers;
    - saves are version 2 with one progression per hero, with live `player` / `equipment` aliases that aren't
      saved, and a v1 save normalises to v2.
  - **New homestead unit tests**:
    - the pantry: its 50 goods, crops, tastes, buyer prices, seed and forage drops;
    - recipes: their stations, ingredients and learning paths;
    - ingredient planning: wildcards take the cheapest first and never the Moon Koi; named goods are reserved;
      `maxCook` and `haveOf`;
    - every recipe's own ingredients mix back into it; the most specific recipe wins; stations; fallbacks;
    - Well Fed in `computeStats` for every buff and tier, per hero, and expired;
    - `eat` / `cook` / `spendMix` / `learnRecipe` / `tickMeal` through `createActions`, with their events;
    - the garden's growth rules: grow, dry pause, ripe, harvest, regrow, sprinkler offsets, and every crop's
      ripening time;
    - fish: the tables, every spot biting at every time of day, roll odds, the Moonlit Rod, sizes, records,
      milestones;
    - the reel sim: an easy fish caught in a few seconds, the Moon Koi hard and easier with the Moonlit Rod,
      letting go escapes, `done` is final, the zone stops at the top, long frames are clamped.
  - For those tests, garden.js's growth rules moved into pure `life/gardenRules.js` (`growNight`, `harvestCrop`,
    `SPRINKLE`) with no change in behaviour.
- **The full QA** (`run-all.mjs`, every scenario): gen-fuzz, s1, s2, s3, s4, s5, s7, s8, s9, s10, s11, s12, s13, s14
  and s15 (49 checks) all pass, and prod-smoke passes.
- **Perf**:
  - `village-perf.mjs 2` against the village plan's last A/B baseline (`tools/blender/work/village-plan/perf/ab-p3.txt`,
    "B new", 3 runs). Each figure is that run set's median; with 2 runs, village-perf's median is the higher one.

    | | baseline | homestead | Δ |
    |---|---|---|---|
    | play p95 (ms) | 15.5 | 16.1 (14.1 / 16.1) | +3.9% |
    | title p95 | 15.9 | 16.6 (15.3 / 16.6) | +4.4% |
    | wide p95 | 28.1 | 29.7 (28.7 / 29.7) | +5.7% |
    | play calls | 318 | 311-325 | ±0 |
    | heap (MB) | 270.6 | 286.6 | +5.9% |
    | boot (ms) | 6746 | 5337-7642 | noise |

  - The new **`tools/qa/homestead-perf.mjs [runs]`** measures each case against the same spot without it, back to
    back in one page. With 4 runs:

    | case | p50 before → after | p95 before → after | Δ p95 |
    |---|---|---|---|
    | Chewy's bed, every tile ripe | 7.8 → 8.1 | 16.6 → 17.1 | +3.0% |
    | all 3 beds (75 tiles, both fields) ripe | 8.8 → 8.6 | 24.0 → 17.0 | noise |
    | koi pond, a reel in progress | 7.3 → 7.3 | 15.0 → 15.6 | +4.0% |

    A fully planted garden adds about 140-250k triangles. Its draw calls move by less than ±30, which is noise: the
    BatchedMeshes don't add a call per tile. The reel adds about 16 calls (the float, the line, the ripples).
  - Nothing is over +10% p95, so there was nothing to fix.
- **Docs**:
  - ARCHITECTURE.md: a Homestead section (modules, hooks, state, actions, events, shop and quest options), the new
    state in the `G.state` block, and the perf tools.
  - README: the homestead features, the controls (P Pantry, G quick meal, F chores and fishing, the Journal's Fish
    Log) and the tests.
- **Line endings**: `git ls-files --eol` shows index = worktree for every modified file. hud.js keeps its mixed
  CRLF / LF lines and its NUL byte, and every new file is LF.
