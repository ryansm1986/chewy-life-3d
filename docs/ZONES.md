# Zones: rescue the village, clear its dungeon, then push tiers (design)

Status: **phases A–D built** (designed 2026-10-05; sprint and the foundations §8.1, §9.1; the dungeons §8.2; the villages §2.1, §2.2); **phase E built: tiers, modifiers, the Spirit Lantern, the Spirit endgame and its pinnacle** (§5.1, §5.2, §5.3). The work is tracked in [ROADMAP.md](ROADMAP.md); this file is the design.

The owner's direction (2026-10-05):
- Every zone has **a village to save** from monsters.
- Saving it **reopens that village's buildings** and **opens the zone's dungeon**.
- The dungeon holds **quest objectives for the villagers' quests**, with **2 floors and a boss**.
- After completion it has **tiered versions** and an **endgame version**.
- Tiered and endgame runs take **zone modifiers** (pack size and more), like Path of Exile maps, but **the player picks
  them** rather than finding map items.
- The game should feel **fast, with large packs**, with a **sprint** on Shift (free) and **better areas with elevation
  and depth**.

The owner's picks:
- The 4 existing regions (Bamboo, Maple, Tidepool, Onsen) are **reworked** into zones.
- **The Burrow stays** as the starter dungeon.
- "Town building" means **the zone village's own buildings**: they reopen when the village is saved.
- Modifiers are **chosen by the player**.
- Sprint is **hold Shift, free**.

## 1. The zone loop
```
Travel Map → Zone (outdoor, with elevation) → the besieged village
   → break the siege (clear the camps in and around it, then defeat the siege captain)
   → the village is SAVED: its buildings reopen, the villagers come out, the waypoint lights up
   → the villagers give quests whose objectives are in the zone's dungeon
   → the zone dungeon: floor 1 → floor 2 → the boss (first clear = the story clear)
   → the next zone unlocks; the dungeon's Tier 1 unlocks
   → tiers T1…T5 (choose modifiers, harder, better rewards)
   → the endgame version (Spirit tiers, uncapped)
```
- The **outdoor zone** keeps what's good about today's regions: the trail, camps, POIs, critters, weather and vistas. It
  gets real elevation (§6) and the village set in it.
- **The current region bosses move into the zone dungeons** as their floor-2 bosses (Master Tengu, …). The outdoor zone's
  climax becomes the **siege captain**: a unique elite with a small arena in the village square.
- **Unlock order** is unchanged (Bamboo → Maple → Tidepool → Onsen). The next zone unlocks on the first clear of the
  previous zone's dungeon boss, or by hero level, as now.

## 2. The zone village
- Each zone has a small themed village of **5–7 buildings** on a terrace or plateau along the trail.
- **Besieged state:**
  - The buildings are boarded up, damaged and dark, with monster banners and 2–3 monster camps inside the village
    bounds.
  - The villagers hide, shown as "!" captives in cages or behind barricades, freed as camps fall.
  - The siege captain holds the square.
- **Saved state**, which persists:
  - The repairs show: lanterns lit, banners down, flowers.
  - The villagers walk their routines (a reduced VillageLife).
  - The buildings reopen.
- **Buildings per village**: the 4 standard ones plus 1–2 that belong to the zone.

  | Building | What it does |
  |---|---|
  | Elder's House | The quest giver, and the zone story |
  | Shop | Zone-themed gear, potions, and the zone's materials |
  | Inn or healer | Rest to heal; sets your respawn point inside the zone |
  | Waypoint shrine | Travel in and out, and to the dungeon gate |
  | Zone specials (examples) | Bamboo: a ninja dojo (Poe's trainer and the bamboo crafts). Maple: a tea house (buff meals). Tidepool: a fishmonger and boatwright. Onsen: a bathhouse (a long-lasting buff) and a smith using snow ore |
- **The dungeon gate** sits near the village: a cave, a ruined shrine or a sea cave. It's sealed (with a barrier and a
  "!") until the village is saved.
- **Tech**: a village is a **hub section of the zone's RegionWorld**, not a second VillageWorld.
  - It's made of authored buildings (the `world/buildings` kits), its own NPC set (3–5 named villagers plus a few
    townsfolk) and a lightweight VillageLife.
  - It has no SimCity sim. The main town stays the only planned town.

### 2.1 As built: Takemori Village (bamboo), 2026-10-06 (ROADMAP Z-D1 to Z-D5; code map: ARCHITECTURE.md "Zone villages")
- **Names** (data: `src/regions/village/data.js`, the owner may rename them there):

  | Zone | Village | Specials | Captain |
  |---|---|---|---|
  | Bamboo | **Takemori Village** (竹守村) | Kaze Ninja Dojo, Bamboo Craftshop | Captain Galeclaw (a storm Kamaitachi) |
  | Maple | **Akane Hamlet** (茜の里) | Momiji Tea House | Captain Strawgrin (an oni Kakashi) |
  | Tidepool | **Shiokaze Port** (潮風港) | Saba's Fish Market, Funaki Boatyard | Captain Brineclaw (a Shogun-gani) |
  | Onsen | **Yukimi Spa Village** (雪見の湯) | Yukimi Bathhouse, Tetsu's Snow Forge | Captain Frostbelly (a Grand Daruma) |

  The other three villages are written up in §2.2.

- **The site** is data: the recipe's `layout.village = { at: [x, z], r }` (bamboo: (55, 58), r 14). layoutGen puts it in
  the plan (`plan.village`, a `village` disc), the terrain flattens it and the trail runs through it at its level,
  camps and POIs keep out of it, and RegionWorld's placement keeps the wild out (`isFree`). Everything else is placed
  relative to the square in **screen-polar slots** (`a` degrees from screen-up, `d` metres) or **screen offsets** (`u`
  right, `v` up), so moving the site (phase F's terraces) moves the village. Tall buildings stand on the far side
  (|a| ≤ 85°); the camera side gets the low camps, the shrine, gardens and fences.
- **The layout**: six buildings round a paved square (r 5.2) — Grandma Sasa's minka (top), the Sasanoha Inn, Chiku's
  General Store, the Kaze Ninja Dojo, the Bamboo Craftshop and the Waypoint Shrine (low, below the road). The road
  crosses the village just below the square, through a gate at each end of the clearing; a shishi-odoshi basin (it
  clacks), benches, stone lanterns, a notice board, lantern posts along the road, bamboo fences round the camera
  side, the village's own bamboo and understorey.
- **The art** (`artBamboo.js`, the buildings kit's Builder): a custom **kayabuki thatch** (rounded sections stacked
  from a thick cut lip, overlapping straw courses, moss, a cedar-bark ridge with umanori saddles; hip or irimoya with a
  lattice gable), dark cedar frames, plaster and paper screens; the dojo has a charcoal-tile irimoya and a training yard;
  the inn a tiled skirt between its floors. The static buildings go into the region's merged prop chunks.
- **Besieged**: the siege overlay (`art.js`) boards every door and window, smears soot, hangs torn dark lanterns, plants
  yokai war banners, and builds three **camps** (a campfire with a red light, a tent, a banner, spiked barricades across
  the road, bones and debris; `data.js camps[].pieces`) whose monsters (5–6 of the zone's kinds, a champion leader) are
  recorded in `zones[zone].siegeCamps` as they fall. Each camp **cages a villager** (Chiku, Takumi, Okami Fuku): once
  its monsters are down, F frees them (`villager:rescued { npc, zone }`, recorded in `zones[zone].quests.freed`); the
  elder and the sensei stay barricaded inside. A **siege gloom** desaturates and darkens the grade inside the village.
- **The captain** (`captains.js`): Captain Galeclaw, a ×2 storm Kamaitachi with Bouncy and Zappy, boss stats ×9 life,
  and two signatures — **Gale Rush** (three telegraphed dashes that leave nicking wind trails, then a breather) and,
  under 60% life, **Sickle Storm** (a spin that hits round it and throws a ring of twelve crescent blades). It waits in
  the square under a **banner ward** (no aggro, blows glance off with a "Warded!" float) until every camp falls; then
  the ward shatters, it wakes with the boss intro (title card, roar, music), borrows the region's boss slot for the bar
  and the framing, and fights inside a ring on the square.
- **Saved**: its fall calls `saveVillage(zone)` and emits `village:saved { zone }` once; the celebration (~9 s): the
  Victory banner, "Takemori Village is saved!", the siege overlay crumples, the saved overlay grows in (lit lanterns
  and their lights, noren, bunting across the square, futons on the inn's rail, the shop's awning and goods, the
  dojo's banner, flower tubs, a vegetable cart, a woodyard, the kitchen garden where the south camp stood), the hidden
  villagers step out, three townsfolk come out, everyone cheers, sparkles and petals. Then two toasts: the Waypoint
  Shrine is lit; the villagers have quests.
- **Persistence**: `zones[zone].village` (saved), `siegeCamps` (cleared camps stay cleared between visits while
  besieged), `quests.freed` / `quests.rescued`. A saved village rebuilds clean on every visit.
- **Villagers** (`src/actors/zoneVillagers.js`): five named (Grandma Sasa, panda, the elder; Okami Fuku, tanuki, the
  inn; Chiku, bunny, the shop; Takumi, bear, the craftshop; Master Kazemaru, silver fox, the dojo — Poe's old teacher)
  plus Kome (cat, the inn's cook: rescued from the Depths, a quest) and three seeded townsfolk, all Toybox kit rigs.
  A light routine: their place (counter / dojo floor / workbench), the square's edge (chat, admire), the basin, the
  notice board, the benches and the elder's engawa (seated), routed door → square → door; they greet the hero.
  Markers: "!" (a quest to offer or turn in), "?" (one in progress).
- **Quests** (`src/world/zoneQuests.js`): six, all with objectives in the Bamboo Depths — Roots of the Grove (reach
  floor 2), The Missing Ledger (a champion's drop on floor 1), The Wind Scroll (12 Kamaitachi, then a unique's drop on
  floor 2; after Roots), The Missing Cook (rescue Kome on floor 2), Heartwood (3 chest drops on floor 2), Wings Over
  the Grove (the dungeon's boss; after Roots). Each ends with a talk step back in the village (the turn-in "!") and
  pays coins, xp, friendship and a furniture find / forage / a unique. Offered only once the village is saved.
- **The phase C interface**: `G.story.dungeonObjectives({ dungeon, floor, zone, tier })` →
  `[{ kind: 'cage', npc, label, quest }, { kind: 'drop', item, n, label, from: 'champion' | 'unique' | 'chest', quest }]`
  for the active quests' current steps on that floor (a step with no floor counts as floor 1); C places them and emits
  `villager:rescued { npc, zone, dungeon, floor }` / `quest:find { item, n, zone, dungeon, floor }`.
  `G.zoneNpcBuilder(npc)` gives C a fresh Toybox rig of the caged villager (the caller disposes it).
- **The buildings** (`talk.js`): the **Shop** (daily zone-band stock, potions, the grove's forage), the **Inn** (rest =
  full heal; meals; the zone's **respawn point** — a knock-out in the zone or its dungeon wakes there once the village is
  saved: `G.zoneRespawn` in game.js), the **Waypoint Shrine** (the Travel Map; travel into a saved zone arrives there),
  the **Kaze Ninja Dojo** (respec for coins, a daily spar for xp, ninja gear — fūma for Poe), the **Bamboo Craftshop**
  (bamboo shoots, wood and coins → bamboo furniture or woven gear). A boarded building says so.
- **Perf** (s23, 1600×900, per frame): the saved square with 9 villagers out is about 206 draw calls and 3.8 M
  triangles including the shadow passes, against 144 at the arrival stone; the CPU frame stays within the arrival
  stone's p95 + 4 ms. (Checkpoint 1 reported 416: that tool counted two frames; corrected 2026-10-06.) The buildings
  and a saved village's dressing are baked into the region's prop chunks; only a village saved during the visit adds
  the saved overlay group (about 9 calls) until the next visit. The village adds ~200 ms to the region build.

### 2.2 As built: Akane Hamlet, Shiokaze Port, Yukimi Spa Village, 2026-10-06 (ROADMAP Z-D1 to Z-D5)
The same runtime as Takemori (§2.1): data in `village/data.js`, one theme module each (`artMaple.js`,
`artTidepool.js`, `artOnsen.js`, built by three helper agents), the captains in `captains.js`, the talk and the
services in `talk.js`, the quests in `world/zoneQuests.js`.
- **Sites** (the recipes' `layout.village`):
  - **Akane Hamlet** (maple): (78, 79), r 12.5, between the persimmon orchard and the rice terraces. The trail climbs the
    screen through the square: in at the camera side, out between the Elder's house and the tea house.
  - **Shiokaze Port** (tidepool): (20, 66), r 12, on the wreck-beach bay, with `shore: −0.3` (the clearing's flattening
    fades at the waterline, so the bay stays sea). The trail crosses the square diagonally. The biome's wreck and net
    rack sit inside the port.
  - **Yukimi Spa Village** (onsen): (60, 76), r 12, just below the hot springs (the trail's via points moved to run
    through the square). The springs read as the bathhouse's outdoor baths.
- **Buildings**:

  | Village | Elder | Inn | Shop | Specials | Waypoint |
  |---|---|---|---|---|---|
  | Akane Hamlet | Elder Kaede's House | Kurikaze Inn | Benji's Sundries | Momiji Tea House | the shared shrine, maple tint |
  | Shiokaze Port | Captain Kaizo's Lookout | Shinju Inn | Nami's Port Store | Saba's Fish Market, Funaki Boatyard | sea tint |
  | Yukimi Spa Village | Granny Shirayuki's Cottage | Ryokan Tsubaki | Mikan's Warm Goods | Yukimi Bathhouse, Tetsu's Snow Forge | snow tint |

- **The Waypoint Shrine** is now one design for all four villages (`art.js waystone()`: the hokora, the standing stone
  with the paw rune, the torii, the lanterns), tinted per zone (roof colour and a moss / leaf / salt / snow crown).
  `data.js WAYSTONE.glb` is the slot for the Blender model (ROADMAP Z-D6).
- **Captains** (each a ×1.75–1.9 named variant of a zone monster, 2 fixed elite mods, warded until the camps fall, then
  a boss with its own bar):
  - **Captain Strawgrin** (oni Kakashi; Multishot, Cursed): *Murder of Crows* (it rattles, then six crows dive one after
    another onto marked circles on and round the hero) and *Harvest Scythe* (in close, a wide marked cone in front,
    heavy knockback).
  - **Captain Brineclaw** (Shogun-gani; Stone Skin, Bouncy): *Sidelong Rampage* (three side-on charges, each on a marked
    lane) and *Tidal Slam* (both claws up, a slam at its feet, then a ring wave that rolls out across the square: roll
    through it).
  - **Captain Frostbelly** (Grand Daruma; Frosty Aura, Extra Strong): *Avalanche Roll* (it curls into a huge snowball
    and bowls down a marked lane, chilling what it hits, then sits dizzy) and *Icicle Rain* (seven icicles crash onto
    marked spots round the hero, one after another).
  - Their gear (`captainGearTpl({ banner, mark, place })`) is placed per body: sode and a sashimono on the scarecrow and
    the snowman, a crested kabuto and a small sashimono on the crab. `CAPTAINS[id].glb` is the Blender model slot.
- **Villagers** (5 named each + 1 rescued from the zone's dungeon + 3 townsfolk; the caged ones are freed camp by camp):
  - Akane: Elder Kaede (fox, the elder), Ochiyo (cat, the tea master; caged), Benji (tanuki, the shop; caged), Okami
    Yae (bear, the inn; caged), Inaho (bunny, Kaede's grandson, a rice farmer); Tobi (dog, Ochiyo's apprentice) is
    rescued in the Maple Roots.
  - Shiokaze: Old Captain Kaizo (dog, the elder), Saba (cat, the fishmonger; caged), Funaki (bear, the boatwright;
    caged), Nami (bunny, the store; caged), Okami Shinju (duck, the inn); Kaito (fox, the deckhand) is rescued in the
    Tide Caves.
  - Yukimi: Granny Shirayuki (bunny, the elder), Yuzu (tanuki, the bath-keeper; caged), Tetsu (bear, the smith; caged),
    Mikan (fox, the shop; caged), Okami Tsubaki (cat, the ryokan); Hokuto (panda, Tetsu's apprentice) is rescued in the
    Onsen Caverns.
  - Each elder tells the zone's story (the fallen maple's roots and Danzaburō; the sea caves and Umibōzu; the ice
    caverns and Yuki-onna). The townsfolk have lines of their own village.
- **Quests** (6 each, all with objectives in the zone's dungeon: `mapleRoots`, `tideCaves`, `onsenCaverns`; each ends
  with a talk back to its giver; rewards scale with the zone's level band):
  - Akane: Under the Red Hills (reach floor 2), The Lost Apprentice (rescue Tobi), Benji's Lucky Charms (3 from floor 1
    champions), Straw Soldiers (15 Kakashi), Golden Chestnuts (5 from floor 2 chests), The Tanuki Lord (the boss).
  - Shiokaze: Where the Tide Breathes (floor 2), Man Overboard (rescue Kaito), The Shining Catch (3 Pearl Scales from
    champions), Sea Glass (5 from floor 2 chests), Crabs Under the Stilts (15 Heike-gani), The Sea Monk (the boss).
  - Yukimi: The Cold Below (floor 2), The Hiccuping Apprentice (rescue Hokuto), Snow Ore (4 from floor 1 chests), The
    Mitten Thieves (3 pairs from champions), Too Many Snowmen (12 Yuki-daruma), The Snow Woman (the boss).
  - Rewards include the zones' furniture (maple wreath, tea set, acorn stool, pumpkin lamp; glass floats, shell lamp,
    wave rug; cypress bucket, noren, lily tub), pantry goods, materials and, for the boss quests, a unique.
  - Phase C's dungeons for these zones are still stubs, so these quests' objectives wait on their gates (the provider
    already answers for them: test-rpg).
- **The specials** (`talk.js SERVICES`):
  - **Momiji Tea House**: a tea set eaten on the spot (matcha and strawberry daifuku, sencha and trout, hōjicha and
    honey castella, genmaicha and pumpkin, gyokuro and melon pan); its Well Fed lasts half as long again. Tea things
    to take home (the tea set and maple furniture).
  - **Saba's Fish Market**: fish, seaweed and seafood dishes to buy; the whole catch sold at ×1.3.
  - **Funaki Boatyard**: commissions (glass floats, shell lamp, wave rug; a sailor's cap, deck boots, an anchor charm),
    and a row round the headland to the sea cave once phase C's gate exists (`mode.gatePos`).
  - **Yukimi Bathhouse**: a soak (40 coins) heals fully and leaves **Onsen Glow** for 20 minutes (+12% max life,
    +2 life/s, +25% frost resist; `rpg/zoneBuffs.js`, on the hero beside the Well Fed meal, with a HUD chip). Bath goods.
  - **Tetsu's Snow Forge**: forge a rare piece (weapon, hat, outfit, boots or paws; stone, a crystal and coins) or
    re-fold the weapon in hand (a magic or rare one keeps its base and gets new magic).
- **The art** (the theme modules; each building has its own siege and saved overlays):
  - **Akane Hamlet** (`artMaple.js`): red-brown sekishu tiles and smoked-silver ibushi tiles, bengara (red-ochre)
    lattices, dark cedar and cream plaster.
    - Elder Kaede's farmhouse has a persimmon curtain on its porch and Inaho's rice rack beside it.
    - The two-storey Kurikaze Inn has chestnut boards, a chestnut-roasting brazier and sake casks.
    - Benji's open shopfront has daruma, a charm rack and the tanuki statue.
    - The Momiji Tea House sits under a cypress-bark roof, with red parasols and a tea garden (stone basin, spout,
      stepping stones).
    - Round the square: red-lacquered gates, tile-capped white walls, a roofed well, and rim maples, persimmons and a
      ginkgo.
    - Saved: a persimmon drying frame, a full rice rack, a chestnut cart and a harvest offering on the square.
  - **Shiokaze Port** (`artTidepool.js`): salt-silvered board walls, tarred timber, blue-teal tiles and
    stone-weighted plank roofs (ishioki-yane).
    - Captain Kaizo's house has a braced watchtower: telescope, bell and pennant.
    - The Shinju Inn stands on barnacled stilts over the shallows.
    - Saba's open fish hall has a carved mackerel on its roof; the catch goes out on ice when saved.
    - The Funaki Boatyard has a hull on keel blocks under shear legs and a slipway, and its walkway runs on as a
      walkable pier (`ctx.addDeck`) to Funaki's moored boat.
    - Round the square: port gates hung with glass floats, rope fences, wind-bent coast pines; the biome's wreck and
      net rack are kept clear.
    - Saved: net racks, a catch handcart, crates, buoy planters.
  - **Yukimi Spa Village** (`artOnsen.js`): snow-blanket roofs with cornices and icicles.
    - Granny Shirayuki's cottage is gasshō (steep thatch).
    - Ryokan Tsubaki and Mikan's Warm Goods.
    - The Yukimi Bathhouse has a karahafu gable, a ゆ noren and a chimney; the springs behind it read as its outdoor
      baths.
    - Tetsu's Snow Forge.
    - Also: an ashiyu foot bath on the square, the snowy gates, steam (the region's `weather.steam()`) and warm pools
      of lantern light on the snow.
    - Saved: a festival — a kamakura, snowmen and candle lanterns.
- **Runtime details added with them**:
  - A building's siege / saved overlay is built in the building's own frame with its own seed and warp
    (`village.overlayTpl` / `withOverlays`; a saved village's overlays ride the building's own prop), so a glow or a
    board a centimetre off a wall stays on it in game exactly as on the test page.
  - `info.seat[3]` is an optional seat height (a veranda bench).
  - The captain's dais banners keep off the trail.
  - Each siege camp is one monster kind and one look, so a camp draws as one batch.
  - Townsfolk cast no shadow-map shadow.
  - A recipe's `village.clear` keeps the wild's trees that many metres off the clearing (maple: 4 m).
  - `village-shots` stubs `combat.hitPlayer` so a tour can't be knocked home.
- **Perf** (per frame, 1600×900, shadow passes included; REGIONS §4's unit). s23 measures the square just after a fight
  (camp monsters awake; saved: 8 villagers out); village-shots measures a quiet square.

  | Village | s23 besieged | s23 saved | village-shots besieged | village-shots saved | Triangles |
  |---|---|---|---|---|---|
  | Takemori | — | 209 | 197–210 | 178–186 | 3.2–3.8 M |
  | Akane | 255 | 299 | 204–207 | 177–183 | 2.5–2.8 M |
  | Shiokaze | 203 | 262 | 187–189 | 157–167 | 1.8–1.9 M |
  | Yukimi | 305 | 327 | 219–235 | 179–183 | 1.8–2.1 M |

  Every square stays well inside the 450-call budget. The CPU frame stays within the arrival stone's p95 + 4 ms.
  A round trip leaves no village GPU memory behind; the base trip's own ~0.7 textures a trip is a ROADMAP follow-up.

## 3. The villagers' quests
- **4–6 quests per zone village**, from 3–5 named villagers. Each has a short dialogue and a reward: coins, a zone item,
  furniture finds, friendship.
- **The objective types**, which need the new quest steps in §8:
  - kill N of a zone monster in this zone's dungeon (`kill` with a `zone`/`dungeon` filter);
  - find a quest item that drops on floor N (a `find` step: a guaranteed drop from a marked pack or chest);
  - rescue a captured villager inside the dungeon (a `rescue` step: an interactable cage on a floor);
  - reach floor 2 (`dungeonFloor`);
  - defeat the zone boss (`boss` with the dungeon id);
  - clear a tier (`tier` n);
  - bring back zone materials (`deliver`).
- The quest pointer guides you to the zone, then to the dungeon gate, then on the floor to the objective.

## 4. The zone dungeon (2 floors + the boss)
- **Per zone**, a `DungeonDef`:
  - an id;
  - a theme or kit: bamboo shrine caves, maple root halls, tidepool sea caves, onsen ice caverns;
  - the monster table (the zone's 3 monsters plus 1–2 dungeon-only ones);
  - the boss;
  - the level band.
- **Floors**:
  - **Floor 1**: about 8 rooms, the quest objectives, a treasure room.
  - **Floor 2**: about 8 rooms, then a **boss arena**: a large, round, authored room big enough for an open-arena boss,
    about 30–36 m.
  - Stairs connect the floors; a portal home appears on the boss kill.
- **Layout**: reuse `gen.js` with the DungeonDef's parameters (§8). Seeds reroll per run: today `seed` and `runs` are
  never written, so floors repeat. Fix that.
- **Density target** (the "fast, large packs" goal): about **120–160 monsters per floor** at Tier 0, in packs of 8–16,
  plus magic and rare packs. That depends on the performance work in §7.
- **Rewards**: the first clear gives the zone unique and a guaranteed rare; repeats give normal loot.

## 5. Tiers, the endgame and modifiers (PoE maps, player-picked)
**The owner's decisions (2026-10-07):**
- **The Burrow gets tiers and modifiers too**, at its own Spirit Lantern by the Burrow door: the **Deep Burrow** tier run
  (§5.1). The Spirit endgame opens when **all four zone dungeons are cleared at T5** (the Burrow is optional for the
  unlock); then Spirit tiers run in all five dungeons.
- **Runs are free**: no Spirit Wicks, no cost. Pick a tier and modifiers and go. (The wick idea is dropped.)
- **5 tiers** (T1–T5), each +4 monster levels (cap 60), with rising base pack size, rare chance and reward multipliers.
  Modifier slots: T1 1, T2 2, T3 2, T4 3, T5 3, Spirit 4–6.
- **The pinnacle boss at Spirit Tier 10** is a **remixed "all four" fight**: Master Tengu, Danzaburō, Umibōzu and
  Yuki-onna return in phases in one arena, their mechanics combined and retuned for the endgame. It reuses their code
  and models: a remix, not new art.

The design:
- **Tiers**:
  - After the first clear, the gate's **Spirit Lantern** (the modifier device) offers **Tier 1**. Clearing a tier unlocks the next, up to **T5**.
  - Monster level: T0 is the zone band; each tier adds +4 (capped at 60).
  - Each tier also raises the base pack size, the rare chance and the reward multipliers.
- **Endgame: Spirit tiers.**
  - Once **all four zone dungeons are cleared at T5**, every tier dungeon (the four and the Deep Burrow) offers
    **Spirit Tier 1…∞**.
  - Monster level is pinned at 60. Difficulty grows with stacking multipliers (life, damage, pack size).
  - **Spirit Tier 10** (and every 10th) has the pinnacle "all four" fight.
  - Rewards scale with the tier: item quantity and rarity, and a chance at endgame uniques.
- **Modifier slots**, filled by the player at the Lantern before entering. Each modifier adds difficulty and a reward
  bonus:

  | Run | Slots |
  |---|---|
  | T1 | 1 |
  | T2 | 2 |
  | T3 | 2 |
  | T4 | 3 |
  | T5 | 3 |
  | Spirit | 4 (S1–4), 5 (S5–9), 6 (S10+) |

- **The modifier catalogue** (the first set):

  | Modifier | Effect | Reward |
  |---|---|---|
  | Swarming | +40% pack size | +15% quantity, +10% XP |
  | Teeming | +1 extra pack per room | +10% quantity |
  | Rally | twice as many champion packs | +10% rarity |
  | Unique Hunt | +2 unique packs per floor | +15% rarity |
  | Fierce | monsters +30% damage | +10% XP |
  | Stout | monsters +40% life | +10% quantity |
  | Quick | monsters +25% move and attack speed | +10% XP |
  | Elemental (fire, frost or zap) | monsters deal +35% as that element | +8% rarity |
  | Warded | monsters +20% resist | +8% quantity |
  | Haunted | spirit ghosts rise from fallen monsters | +12% quantity |
  | Night March | darker, monsters more aggressive | +10% XP |
  | Hard Ground | −30% life and zoom regen for the hero | +10% rarity |
  | Boss's Wrath | the boss has +50% life, +20% damage and a new phase | +20% boss loot |
  | Treasure Trove | +2 chests per floor | — (the chests are the reward) |
  | Cursed Shrines | shrines also curse you | +10% rarity |

  - The total reward shows on the Lantern before entering.
  - Modifiers are **data** (`src/rpg/zoneMods.js`) applied through hooks: the pack count and size in the generator,
    spawn-time stat changes, and run-wide flags.
  - ~~Costs: a Spirit Wick per run.~~ Dropped (the owner, 2026-10-07): runs are free.

### 5.1 The design note, as built (phase E checkpoint 1: Z-E1 tiers, Z-E2 modifiers; 2026-10-07)
Code map: `src/rpg/tiers.js` (the numbers), `src/rpg/zoneMods.js` (the catalogue and the hooks), `src/dungeon/tierRun.js`
(the run-wide effects and the rewards, `mode.tr`), `src/rpg/zones.js` (the records), `src/dungeon/zoneMonsters/spirit.js`
(the Haunted ghost); ARCHITECTURE.md "Tier runs".
- **A run** is `{ tier, spirit, mods }` on top of a `DungeonDef` (`G.enterDungeon({ id, floor, tier, spirit, mods })`).
  A Spirit run carries tier 5 (so quest filters "tier ≥ n" and the events treat it as at least T5). `normRun` caps the
  tier at 5 and cleans the mods (known ids, no repeats, one Elemental, at most the run's slots); the endless Burrow has
  no tiers (its tier runs are the Deep Burrow's).
- **The tier table** (`TIERS`; monster level = the band with the hero clamped to it, +1 a floor, +4 a tier, cap 60):

  | Tier | Levels (Bamboo, hero 8) | Pack size | Champion chance | Quantity | Rarity | XP | Slots |
  |---|---|---|---|---|---|---|---|
  | T0 (story) | 8 / 9 | ×1.00 | — | — | — | — | 0 |
  | T1 | 12 / 13 | ×1.06 | 4% | +10% | +6% | +8% | 1 |
  | T2 | 16 / 17 | ×1.12 | 8% | +20% | +12% | +16% | 2 |
  | T3 | 20 / 21 | ×1.18 | 12% | +30% | +18% | +24% | 2 |
  | T4 | 24 / 25 | ×1.24 | 16% | +40% | +24% | +32% | 3 |
  | T5 | 28 / 29 | ×1.30 | 20% | +50% | +30% | +40% | 3 |

  The champion chance is the chance that a plain room pack (not a slot's guards, not a corridor pack, no quest mark) is
  promoted to a champion pack. The T5 levels per dungeon at the band's top: Bamboo 32, Maple 39, Tide 47, Onsen 55 (+1 on
  floor 2); the Deep Burrow 41.
- **Spirit S** (`spiritInfo`): level 60 everywhere; on every monster life ×(1 + 0.1 S) and damage ×(1 + 0.05 S); pack
  size ×min(1.5, 1.3 + 0.02 S); champion chance min(30%, 20% + 1% S); rewards +50% + 6% S quantity, +30% + 4% S
  rarity, +40% + 3% S xp; an endgame unique in the clear chest at min(25%, 3% + 1% S), and from a unique pack's leader at
  min(3%, 0.5% + 0.1% S); slots 4 / 5 (S5) / 6 (S10). Spirit progress is shared: a Spirit S clear in any dungeon opens
  S + 1 in all five. The pinnacle replaces the last boss on S10, S20…
- **Rewards, summed** (`rewardTotals`: the tier's or the Spirit tier's own bonus plus every modifier's) and applied by
  `tierRun.js`:
  - **XP**: every kill × (1 + xp). A Haunted ghost pays a third.
  - **Rarity**: +N% rarity is +N magic find on every kill and chest (`rollDrops`, `chestDrops`).
  - **Quantity**: each item that drops earns floor(q) extra items plus one more at the remainder's chance (`extraItems`),
    rolled at the same level with the run's magic find; coin piles grow by half the bonus. Chests the same.
  - **Boss loot**: the boss's hoard rolls its extra items at quantity + boss loot.
  - **The clear chest** (the Lantern chest that rises by the last boss of a tier or Spirit run; `clearChest`), on top of
    a golden chest's own contents:

    | Run | Rares | Magic finds | Gem | Coins (× lvl·14 + 40) | Rejuv | First clear of that tier |
    |---|---|---|---|---|---|---|
    | T1 | 1 | 2 | — | ×1.5 | — | +1 rare, coins ×2 |
    | T2 | 2 | 2 | — | ×2 | — | +1 rare, coins ×2 |
    | T3 | 2 | 2 | a chipped gem | ×2.5 | 1 | +1 rare, coins ×2 |
    | T4 | 3 | 2 | a gem | ×3 | 1 | +1 rare, coins ×2 |
    | T5 | 3 | 2 | a gem | ×3.5 | 1 | +1 rare, coins ×2, **the zone's boss unique again** |
    | Spirit S | min(6, 3 + S/5) | 2 | a perfect gem | ×(3.5 + 0.25 S) | 2 | +1 rare; the endgame-unique chance; the pinnacle's own unique |

    (A tier run that is somehow the dungeon's very first clear — only the debug entry can do that — also gets the boss
    unique, so it is never lost.)
- **The Deep Burrow** (`DUNGEONS.burrowDeep`, kind `deep`): the Burrow's tier run, fitted to its many-floor structure.
  Two floors on its deepest themes — floor 1 the **Crystal Grotto**, floor 2 the **Moonlit Fox Sanctum** with **Tamamo**
  in the Burrow's boss room — in the Burrow's own rooms-and-corridors layouts (gen.js), at the band of its floors 16–20
  (levels 17–21, the hero clamped to it) +4 a tier: T5 is 37–41, Spirit 60. Its T0 is the story Burrow: **Tamamo beaten
  on floor 20** opens T1 (live: a toast; old saves: `state.dungeon.deepest` past 20). Tier runs only (no T0 entry from
  its Lantern), no waypoints, no Burrow records; its portals lead home to Blossom Hollow, next to its Lantern by the
  Burrow door. Its record is `state.dungeon.deep`, the same shape as a zone dungeon's.
- **Each modifier's hook and numbers** (`ZONE_MODS`; `layout` = `gen.js generate → layoutMods`, deterministic from the
  floor's seed; `monster` = `monsterMods` as each run monster is built, once; `run` = `tierRun.js`):

  | Modifier | Hook | Exactly |
  |---|---|---|
  | Swarming | layout | every pack's count ×1.4 (with the tier's ×1.06–1.30); a zone pack's cap (16) grows with it; the cluster disc widens (r = 0.62 √(n + 1), 2–4.8 m) |
  | Teeming | layout | one more pack in every room but the arrival and the arena (zone 9–12, Burrow 3–5, then sized), on open floor clear of the arrival (5.5 cells), the stairs, the arena ring, slots, centrepieces, chests and other packs |
  | Rally | layout | champion packs ×2 (promoted from plain room packs; a zone champion pack is 3 champions and its fodder) |
  | Unique Hunt | layout | two plain room packs become unique packs (a named leader and its pack) |
  | Fierce | monster | damage ×1.3 (dmg, the fire-enchant extra, auras) |
  | Stout | monster | life ×1.4 |
  | Quick | monster | move speed ×1.25, attack rate ×1.25 (`stats.atkMul`: every AI's cooldown ticks faster) |
  | Elemental: Fire / Frost / Zap | monster + run | the monster carries the element (`m._el`); this floor's `combat.hitPlayer` folds 35% of each hit in as that element, after the hero's resistance to it (frost also chills 0.9 s); the monsters' ink contour turns the element's deep shade and their footprint ring its colour (elites keep theirs); embers / frost / sparks rise off the awake ones |
  | Warded | monster | +20 to every elemental resistance, +10 physical |
  | Haunted | run | a fallen monster rises as a Yūrei 0.75 s later: 20% of plain ones, every champion and unique (no boss, no boss adds, no ghost from a ghost), at most 24 alive; a ghost pays a third of the xp and drops only coins and potions |
  | Night March | monster + run | attack rate ×1.12, speed ×1.08; monsters notice you from 14 m (`mode.alertR`, was 9); the cave's sky light ×0.52 and key light ×0.42 (cooled), fog and background darker, the grade's gain ×0.92 and saturation ×0.9, a deeper indigo vignette (1.2); the lanterns and the hero's light (×1.2 intensity, ×1.25 radius) keep the floor readable |
  | Hard Ground | run | natural life and zoom regen ×0.7 (`G.regenMul` in `actions.tickRegen`; potions untouched) |
  | Boss's Wrath | monster (boss) + run | the boss's life ×1.5 and damage ×1.2; at 40% life its **wrath**: enraged (attack rate ×1.3, speed ×1.12), a wave of 4 of the dungeon's monsters, and every 8 s a telegraphed shockwave ring (1.1 s, radius 4–6.5 m) |
  | Treasure Trove | layout | two more golden chests a floor |
  | Cursed Shrines | layout + run | one more shrine a floor; touching any shrine also curses you: +25% damage taken for 20 s |

- **The floor ceiling** (`FLOOR_CAP`): a zone floor holds at most 340 monsters, a Deep Burrow floor 210; past that every
  pack shrinks in proportion. T5 + Swarming + Teeming + Rally on the Bamboo Depths lands at ~330 (from ~140 at T0); a
  Spirit 10 kitchen sink at ~300–340.
- **Save** (`zones.js`): every tier dungeon's record is `{ cleared, bestFloor, tier: { unlocked, cleared }, spirit: { best },
  lantern: { tier, spirit, mods } }` (`tierRecord(state, zone | dungeon id | 'burrowDeep')`). **Migration** (`fillTiers`,
  idempotent): a zone dungeon with a clear but no tier record, and a Burrow past floor 20, start with T0 cleared and T1
  open. `recordDungeonClear(state, id, tier, spirit)` → `{ first, cleared, tierUnlocked, firstTier, spirit }`;
  `tierCleared` (a Spirit clear counts as T5), `tierOpen`, `spiritOpen` (all four zone dungeons at T5), `spiritBest`,
  `spiritMax`, `rememberSetup` / `lastSetup` (the Lantern's memory).
- **Events**: `dungeon:cleared { id, kind: 'zone' | 'deep', tier, spirit, floor, zone, boss, first, firstTier }`,
  `tier:unlocked { id, zone, tier }` (also the Deep Burrow's T1 when Tamamo falls on a Burrow floor), and
  `spirit:unlocked { id, zone }` on the clear that opens the endgame. `monster:killed` and the others carry
  `{ zone, dungeon, tier, spirit }`. The quest `tier` step (`{ dungeon, n }`) reads the Deep Burrow too.
- **The debug entry**: `G.enterDungeon({ id, floor, tier, spirit, mods })`, `?run=bambooDepths:5:swarming,teeming,rally`
  (`:spirit` after the mods), and `G.tierDebug` (`run`, `unlock(id, tier)`, `clearAll(tier)`).
- **The Haunted ghost, the Yūrei** (`zoneMonsters/spirit.js`, region monster kit): a little white sheet ghost with a
  scalloped hem, a paper hitaikakushi tied on its brow, drooping "urameshiya" sleeves, big eyes and a small "oh", a cyan
  hitodama circling it; the Sleepy Yūrei wears a floppy blue nightcap. It rises out of the fallen (a swirl of motes, a
  soft "ooo~"), drifts after you, and boos: rears back (a small ring telegraph, 0.55 s), lunges with a chilling "boo!"
  (frost, a 1.1 s chill). Life ×0.5, fragile; 4 parts × 2 variants (8 batches).
- **Perf** (the horde check, `RUN=5:swarming,teeming,rally WORLDS=zone node tools/qa/profile-horde.mjs`; the machine was
  **busy**: WardogsClient held 38% of the GPU's 3D engine and the CPU sat at 60–77%):
  - the floor alone (335 monsters asleep, the hero idle): p95 3.9–10.3 ms, ~115 draw calls;
  - a 150 horde fought on that floor (it wakes the floor's packs round it: ~235 awake): p95 22.7 (Chewy), 19.8 (Moka),
    16.6 ms (Poe); 250: 19.0–22.1 ms;
  - the same check on a T0 floor (146 monsters) in the same session: p95 28.8–32.2 ms (Chewy). The T5 floor is no
    slower than T0 under this load; both miss the 8 ms gate only because of it. To re-run on a quiet machine.
  - Draw calls: a T5 Swarming fight at the game camera ~340 (42 awake), a Haunted fight ~400–430.
- **Look review**: `tools/qa/tier-shots.mjs --run <dungeon>:<tier>:<mods>` (the biggest pack near the arrival, woken, at
  the game camera; `--kill N` fells some for Haunted).
- **QA**: test-rpg "ZONE TIERS" (the tables, the cleaning, the summed rewards, the monster hook, the generator hook on
  every dungeon, the save, the migration, Spirit, the chest, the Lantern's picks); gen-fuzz runs three tier setups on
  every tier dungeon; **s30-tiers** (the migration on a real reload, a T2 run end to end with Boss's Wrath and Treasure
  Trove, the clear's events, chest and banner, a quest's tier step, Haunted / Night March / Hard Ground, Cursed Shrines,
  Elemental: Frost, the Deep Burrow T1 end to end).
- **Readability in big packs** (the checkpoint 1 review, `dungeon/tokens.js`). Nothing is hidden: every telegraph on
  screen is a real attack; monsters wait their turn to start one.
  - **Attack tokens**: when a monster's attack cooldown runs out beyond melee reach of the hero (2.8 m), it needs a token
    first. One pack's tokens may weigh at most 2 (3 from T3 and in Spirit runs), and one kind's near the hero (20 m) at
    most 4 (5 from T3). A token weighs 1, or more for an attack that draws several telegraphs (the kakashi's crows 2, the
    sazae-oni's star of spines 3); a heavy one may always go alone. No token: its cooldown is pushed back 0.25–0.65 s
    (it keeps moving and kiting), so volleys come in staggered waves. The token is held through the wind-up and the
    attack, and given back when the AI resets its cooldown, after 1.4 s unused, or on death. Bosses and their adds are
    never gated. A swarmed T3 scarecrow pack now throws one volley of crows at a time (2–3 lanes), T5 with Teeming two.
  - **Alert bubbles**: one "!" per pack (2.5 s), at most 3 a second across the floor; the rest wake silently.
- **The Yūrei**, after review: a matte cloth (rim 0.3, a faint brush), a slightly greyer sheet, bigger eyes and a bigger,
  ink-edged paper triangle, so its face reads at the game camera.
- **Next**: Z-E4 (§5.3).

### 5.2 As built: the Spirit Lantern (phase E checkpoint 2: Z-E3; 2026-10-08)
- **The lantern** (`regions/spiritLantern.js`): a hexagonal stone tōrō about 2.5 m tall: a stepped plinth with moss,
  a stout octagonal pillar with a shimenawa and two shide, a lotus-petal platform, a firebox of six posts round a paper
  box with a kumiko lattice, a flat-faced hipped roof of dark slate with lighter hip ridges and fern-curl warabite at
  the corners, two violet silk tassels at the front corners and a hōju on top. Asleep (no tier open) its paper is
  dark; lit, the paper glows lavender round a cyan spirit flame, three ofuda circle it, motes rise, and it casts a
  soft violet light (3, 1.6 on snow).
  - **At each zone gate**: `installGate` stands it at gate-local (4.1, 2.7), beside the torii; a gate look may move it
    (`look.spirit`, `look.spiritI`: the onsen gate puts it left of the torii, the hot spring being on the right).
  - **At the Burrow door** in Blossom Hollow (`installBurrowLantern`): the Deep Burrow's, lit when Tamamo has fallen
    (live on `tier:unlocked`).
  - F: lit → the panel; asleep → a toast ("Clear the Bamboo Depths once to wake it" / "Beat Tamamo on Burrow floor 20").
- **`G.lantern`** (`installLanternApi`): `info(id)` (the open tier, tiers cleared, Spirit open / max / best, the last
  setup, the level per run), `open(id)`, `enter(id, run)` (cleans the run to what's open, remembers it per dungeon,
  enters floor 1). The panel never imports world code.
- **The panel** (`ui/lantern.js`, `ui/lantern.css`, icons `ui/lanternIcons.js`), 1010 px:
  - left: the dungeon and its best clear; the tiers as a tab row (T1–T5, locked ones greyed, a ✓ on cleared ones, and
    霊 Spirit with a − / + stepper once open; the pinnacle tiers say so); the run's level, pack size, champion chance (and
    Spirit's life / damage); the modifier slots (click one to take it out); Recommended / Surprise me / Clear; the
    summed reward (quantity, rarity, XP, boss loot; a zero is dashed); Enter, which names the run and says it is free;
  - right: 17 modifier cards in three columns: a hand-drawn icon in the modifier's colour, its name, effect and reward,
    a risk pip row under the icon; picked cards are ringed in their colour with a ✓; with the slots full the rest grey
    out (a click is refused and the slots flash); another Elemental swaps for the picked one;
  - the last setup per dungeon opens again (if still open), else the highest open tier with nothing picked.
  - **Keyboard**: 1–5 the tier, Enter sets off, Esc closes. **Pad**: the focus starts on Enter; LB / RB step the tiers
    (the tab row), A adds / removes / sets off, Y Recommended, X Surprise me (padNav HANDLERS), B back; the footer and
    the hints bar show the glyphs. **Touch / phone** (after review): two columns, as on the desktop. On a landscape
    phone (844 × 390) the left 42% holds the whole run unscrolled: a one-line header (the name and "Best"; on a Spirit
    tier its − / + stepper beside it, the name over "Best"), the tier row, the stats folded into one line ("Lv 24–25 ·
    Packs ×1.18 · Champions +12%"), the slots, Recommended / Surprise me / Clear, the rewards as one row of chips
    ("+45% qty") and Enter; the cards scroll on the right, two to a row, fading out at the bottom. The panel fills the
    safe area's height (`--m-top` / `--m-bot`) and its width inside `--sa-l` / `--sa-r`; every target ≥ 44 px, all text
    ≥ 12 px on screen; the key footer hides on touch. A tablet keeps the desktop layout (at its menu scale).
- **The run chip** (`ui/runChip.js`): in a tier or Spirit run, a pill at the foot of the HUD's top-right stack (under
  the coins and materials, so it follows the HUD's safe area): the lantern, "Tier 4" / "Spirit 7", an icon per
  modifier; hovering lists them with their effects and the summed reward.
- **QA**: s30 g) the lantern lit at the gate, asleep elsewhere, the Burrow door's; the panel (tiers, 17 cards, the slot
  limit, the summed reward, Recommended / Surprise me), Enter → the run with the picks, the memory, the run chip; h) the
  panel on a phone (two columns, the left one unscrolled with Enter in sight, the cards scrolling, the title bar at the
  bottom, 44 px targets, 12 px text), also for a Spirit 10 run's six slots. Look review: `tools/qa/lantern-shots.mjs`
  (the Burrow door, a gate, the panel on desktop, pad, phone and tablet).
- **The run chip on itch** (CT-6's itch inset: `--sa-t` 80, `--sa-r` 100 in an iPad's 1280-wide frame): the chip sits in
  `.hud-tr`, so it follows the inset (measured at x 1031–1167, y 329–360 in the frame: clear of itch's buttons and on
  the page); CT-6's `build-itch --test` iPad check lists `.run-chip` among the HUD pieces it keeps clear.

### 5.3 As built: the Spirit endgame and the pinnacle, "The Four Seasons" (phase E checkpoint 3: Z-E4; 2026-10-08)
Code map: `src/dungeon/pinnacleLayout.js` (the data and the floor), `src/dungeon/pinnacle.js` (the fight: `tr.pin`), the
endgame uniques in `src/rpg/items.js`; ARCHITECTURE.md "Tier runs".
- **The Spirit endgame** (the numbers and the save: §5.1): when all four zone dungeons are cleared at T5, every Spirit
  Lantern (the four gates and the Burrow door) shows the 霊 Spirit tab; a Spirit S clear opens S + 1 in all five. The
  run chip says "Spirit S"; the Lantern's Enter says "the Four Seasons" on a pinnacle tier.
- **The endgame uniques** (`UNIQUES` tagged `spirit`, `zone: 'spirit'`: never rolled at random), level 58, one per
  season, for any hero (a charm, a collar, a hat, paws):

  | Unique | Base | Stats |
  |---|---|---|
  | Harukaze, the Spring Wind Omamori | omamori | move speed, cooldowns, attack speed, zap resistance, +1 all skills |
  | Natsunami, the Summer Tide | jeweled collar | life, energy, frost and fire resistance, life regen |
  | Akiyo, the Autumn Leaf Hat | kasa | defense, magic find, gold find, all resistances, life |
  | Fuyugomori, the Winter Hush | mittens | crit, crit damage, dexterity, frost resistance, attack speed |
  | **Shiki, the Lantern of Four Seasons** (the pinnacle's, level 60) | lucky cat | +2 all skills, all resistances, life, magic find, cooldowns, +10% xp |

  The four drop from a Spirit run's Lantern chest (min(25%, 3% + 1% S)) and its unique packs' leaders (min(3%, 0.5% +
  0.1% S)); Shiki only from the Four Seasons' Lantern chest, every time.
- **The pinnacle** (every 10th Spirit tier, in any of the five dungeons): the last boss floor's boss is the Four Seasons
  (`pinnacleLayout`, from gen.js): **Spring** Master Tengu, **Summer** Umibōzu, **Autumn** Danzaburō, **Winter**
  Yuki-onna, one at a time, in the floor's ring: a zone dungeon's arena (r 17 m), or the Deep Burrow's boss room (30 m
  across; r 12.5 m for the fights, cleared of packs).
  - **Each season is its boss's own fight** (its moves, its add waves, its second phase), retuned for the ring as in its
    own dungeon. Its life is a share of a full boss's (Spring, Summer, Autumn 45%, Winter 60%, on top of Spirit's
    life ×(1 + 0.1 S)): about four boss lives in all at S10.
  - **A season falls**: no clear yet. Its adds vanish and its shots fizzle, the seal stays up, a card names the next
    season ("Summer 夏: The tide comes in, warm and enormous."), and the next boss rises opposite the hero 3.6 s later
    with its own intro. A season leaves only coins and potions where it falls; its items and gems wait for the Pinnacle
    hoard (the ring stays clear of loot labels mid-fight).
  - **The spirits and their echoes** (the remix): a fallen season stays as a spirit at the ring's edge (a translucent
    copy of its boss in its season's colour, bobbing; a quarter of the ring each, none at the mouth) and keeps one of
    its moves going in the later seasons:
    - Spring's **gale**: a lane of wind from its spirit through the hero (1.3 s), half a blow and a shove;
    - Summer's **ink rain**: three circles round the hero (1.15 s), a hit and a chill where the ink lands;
    - Autumn's **rolling leaf-boulder**: a lane from its spirit across the ring (1.45 s), a hit and a sideways knock.

    One echo at a time, every 8.5 / 7.2 / 6.2 s in Summer / Autumn / Winter, only in the boss's quiet moment (no
    telegraph of its own up, `DungeonMode.sigDimT`, and not in one of its moves, `bossBusy`), and the boss holds its next
    move until the echo lands (`hold`: its own cooldown). Every telegraph on screen is one attack, one beat at a time.
  - **The air of the season**: petals (Spring), a few sea-glow motes (Summer), maple leaves (Autumn) and snow (Winter)
    drift round the hero, and a soft light of the season's colour hangs over the ring (intensity 2.4). Nothing else
    tints the screen. **Winter's whiteout** (after review) is her own, thinned here only: at 62% of its strength (her
    haze overlay, the fog's pull-in and its snow colour; `PIN_WHITEOUT`, read by Yuki-onna as `m.woMul`), so with
    Spirit's life making it a long phase the ring keeps most of its colour; the hero's and the lanterns' warm circles
    stay clear. Her own fight in the Onsen Caverns is unchanged.
  - **Winter falls**: the spirits burst into their seasons and fade, the Victory banner says "All four seasons have
    fallen!", the clear is recorded (`dungeon:cleared { spirit }`, `pinnacle:cleared`), and the Lantern chest rises
    (2.5 s) with Shiki on top of the Spirit chest. A toast (not a second banner) says "The Four Seasons are stilled!" and
    which Spirit tier is open.
  - **The Pinnacle hoard** (after review: 63 items had made a wall of labels over the hero, the chest and the banner):
    the four seasons' held items and Winter's whole drop (with the run's quantity extras) become one hoard, curated
    (`curate`): the
    best 15 items by rarity, then worth; for every 6 cut, one of the rest is traded up for a fresh rare (at most 5); the
    best 2 gems; the coins in 4 full piles; 3 potions; Winter's seeds or furniture find as they came. About 20–27 drops,
    15–18 of them items, nearly all rare or better. It rises 4.4 s
    after the kill, once the Victory banner has gone (so no label ever covers it), out of the chest's glow into a wide
    ring (r 2.8–5.4 m, every drop at least 2.3 m from the chest) round a point drawn 3 m from the chest toward the
    ring's middle, so the whole circle lies on open floor and the hero by the chest stays clear (`dropRing`).
  - Events: `pinnacle:season { season, n, from }`, `pinnacle:cleared`.
- **QA**: test-rpg (the pinnacle floor on every tier dungeon at S10 / S20, never at S9 or on floor 1; the endgame
  uniques: built, level 58+, never rolled at random); **s30** i) Spirit 10 in the Bamboo Depths end to end (Spring
  wakes in the ring; its fall is no clear, the seal holds, its spirit rises, its items wait; Summer rises; Spring's gale
  comes in a quiet beat with the boss holding; Autumn, Winter; the clear, Spirit 11, Shiki from the chest; nothing of
  the hoard while the Victory banner is up, then 10–20 items, 4+ rares, in a ring 2.2–5 m and more from the chest);
  **prod-smoke** `pinnacle:bambooDepths` (the Lantern's Spirit tab and 17 cards, the run chip, the four in turn, the
  chest). Look review: `tools/qa/pinnacle-shots.mjs` (each season's fight with its adds called, an echo in flight,
  Winter's whiteout, the Victory banner, the hoard).

## 6. Elevation and depth (outdoor zones)
- **Goal**: zones with **real playable elevation**:
  - terraces and plateaus 2–8 m apart;
  - **ramps and stone stairs** between them;
  - cliffs that are walls;
  - bridges over ravines, and waterfalls;
  - overlooks with long vistas;
  - the village on a terrace.
  - **Depth**: layered background silhouettes, distant ranges, fog banks and parallax foliage, so the zone feels big
    from the game camera.
- **Terrain** (`regionTerrain.js`):
  - widen the playable band from 0–0.8 m to about 0–10 m;
  - author **terrace levels** and **ramp corridors** per biome;
  - cliffs are steep, unwalkable bands, with a rock face mesh.
  - It stays a single-valued heightfield (no caves or overhangs outdoors). Bridges use the deck system (`addDeck`).
- **Navigation**:
  - the monster flow field gets **per-cell heights**, and a move between neighbour cells is allowed only if the height
    step is ≤ about 0.6 m, or along a ramp;
  - line of sight samples the terrain height along the ray (cliffs block it);
  - the player's A* already checks slope, so it needs the same step rule.
- **Camera**:
  - the camera is fixed at 35.5° pitch and 45° yaw. Terrain on the camera side (+x/+z) could hide the hero;
  - **design rule**: higher ground sits north and west of the playable path, and the camera side steps down;
  - the terrain material joins the occlusion cutaway for any remaining cases;
  - `mouseGround` gets a robust ray-march for steep ground.
- **Height audit**: about 74 hard-coded `setY(const)` and 20 `Vector3(x, 0, z)` spots across combat, VFX and spawns
  assume y = 0. Route them through `world.heightAt()`. `openSpotNear` must return the ground height.
- **Dungeons** stay mostly flat for now; there's an option later for split-level rooms with stairs.

## 7. Speed and large packs (performance)
- **Feel**:
  - the hero's base speed goes from 4.4 to about 5.0 m/s, and **sprint** (§9) multiplies it by 1.4;
  - monsters spawn in wider formations (today's 2.2 m rings become pack clusters of 4–8 m);
  - monsters drop loot and XP fast, and the damage numbers are aggregated.
- **Target**: a **150-monster fight at p95 ≤ 8 ms** on the RTX 5080, and spawns without hitches.
- **Work**:
  1. **A model cache per monster kind.** Today Burrow models are rebuilt at every spawn and region models clone their
     geometry. Share geometry and materials, and pre-build a pool at floor load.
  2. **Instanced rendering for rigid-part monsters**: one InstancedMesh per kind and part, with per-instance transforms,
     tint and hit-flash attributes, and outlines as instanced hulls. Skinned humanoids stay per-instance, but pooled.
  3. **A spatial hash** for `Combat.inRadius`, `nearest`, `pickAtScreen` and monster `pickTarget`, `separate` and
     `alert`. That removes the O(N²) loops.
  4. **AI LOD**: monsters that are far away and not aggroed update at 1/4 rate; sleeping packs wake on proximity.
  5. **The flow field**: reuse its buffers (it allocates every 0.4 s), and share one field per target.
  6. **Hit effect budgets**: cap per-frame hit flashes and damage numbers (an aggregated "+N" burst).
  7. **Sub-stepped movement** for fast monsters.
- **The test**: `tools/qa/profile-horde.mjs` runs 150 and 250-monster fights and reports p50, p95 and p99, draw calls,
  geometries and spawn hitches. It joins run-all as a perf gate.

### 7.1 As built (phase B, 2026-10-05; code map: ARCHITECTURE.md "Hordes")
- **Model cache** (Z-B1): cached geometry per kind × variant, region parts shared, humanoids as a baked template +
  `cloneRig`, a rig pool, the roster warmed at floor load. A spawn went from 1–7 ms per monster (a 150-monster burst:
  300–500 ms) to 0.1–0.3 ms (10–40 ms). The one look change: the dust bunny's random fluff is now 3 cached layouts per
  variant (9 bunnies) instead of a new one per spawn.
- **Instancing** (Z-B2): rigid monsters and every contact ring draw from instanced batches with per-instance flash,
  contour colour / width, opacity and GPU-deform values; humanoids stay skinned meshes, pooled. Draw calls at 150:
  ~1,100 → ~360; at 250: ~2,000 → ~550. `?noinst` for A/B.
- **Crowd grid** (Z-B3): Combat queries and the monsters' separation / surround / alert read grid cells; targeting
  reads the allies set. `?gridcheck` compared ~1M queries with the old scans: 0 differences.
- **Z-B4**: AI LOD (asleep: not aggroed, 22 m from everyone, off screen → every 4th frame; a sleeping humanoid leaves
  the scene graph), the flow field's buffers reused, damage numbers past 8 plain + 6 crits a frame fold into one "+N"
  total, hit sparks thinned past 32 hits a frame, sub-stepped moves and knockback for fast monsters.
- **Also** (found with the gate): projectile glows and emote bubbles batched (`gfx/spriteBatch.js`), double-sided
  additive VFX single-pass, cached slash / ring geometry, particle uploads of the live range only and no O(max) drop
  on a full layer, N8AO's transparency re-renders without a second scene matrix update, collision resolve without
  closures, Poe's shots on the grid.
- **Proof the looks didn't change**: `tools/qa/horde-shots.mjs` renders frozen lineups (every kind × variant, champion
  and unique contours, a mid-flash row, humanoids, projectile glows, emotes, a 120 crowd) from both builds and diffs
  them; only particles and the dust-bunny fluff differ.
- **The gate** (CPU frame p95 ms, tick → end of render; RTX 5080, 1600 × 900; measured with a game running on the same
  machine, ~65% CPU load — the empty Burrow floor alone shows p95 5–10 ms there):

  | world / hero | before p95 @150 | after p95 @150 (dev / bundle) | before p95 @250 | after p95 @250 (dev / bundle) |
  |---|---|---|---|---|
  | Burrow / Chewy | 19.8 | 6.9–8.2 / 7.3 | 33.0 | 11.8–12.9 / 13.2 |
  | Burrow / Moka | 20.0 | 7.0–7.8 / 7.4 | 28.3 | 10.2–10.5 / 8.9 |
  | Burrow / Poe | 21.3 | 8.5–9.4 / 8.9 | 46.3 | 13.5–16.8 / 14.0 |
  | Region / Chewy | 17.0 | 7.5–8.1 / 7.4 | 31.7 | 12.6–13.7 / 12.3 |
  | Region / Moka | 13.8 | 7.6–8.1 / 7.5 | 25.3 | 12.1–12.4 / 11.0 |
  | Region / Poe | 23.1 | 8.3–9.4 / 8.4 | 42.6 | 14.7–17.8 / 14.1 |

  p50 at 150 went from 11–17 ms to 5.3–6.9 ms; the worst spawn frame from 33–90 ms to 8–11 ms. Chewy and Moka pass the
  8 ms gate on the bundle; Poe was 0.4–1.4 ms over at first (fixed below). Under that load the same run lands either
  side of 8 ms from one run to the next, hence the baseline-aware gate below.
- **Poe's gap** (the follow-up, 2026-10-06): not her effects. Her draw calls at p95 were already at Chewy's or below
  (424 vs 451 in the Burrow, 388 vs 400 in a region; the 732 peaks were the emote flood, batched since). The ~1 ms was
  `Skeleton.update` running 10–20× slower in her page, for every skeleton including Shadow's and the tanuki's (0.72 vs
  0.07 ms a frame). The cause: her smoke copies cloned her rig with three's `SkeletonUtils.clone`, whose
  `Object3D.copy` deep-copies userData through `JSON.stringify`; the ear joints' `tip` (a Group) and the fūma holders'
  `mat` ran `toJSON` → `Matrix4.toArray()` into plain arrays, and that turned V8's keyed-store feedback in
  `Matrix4.toArray` generic for the whole session (25 → 605 ns per matrix written, also every `setMatrixAt`). Fix:
  `actors/safeClone.js` `cloneSkinnedSafe` lifts three objects out of userData for the clone (poeProps.js uses it; a
  same-page A/B of copies built both ways differs only in floating sparkles), and free smoke copies wait outside the
  scene graph. Chewy's charged Afterimage (`chargeFx.ghost`) still uses the old clone and would trip the same trap
  once cast; it's a one-line import swap in the charge files.

**The gate's logic** (`tools/qa/profile-horde.mjs`, in run-all; since 2026-10-06):
- Per world × hero, one page: enter the floor, measure **the floor alone** for the window (no horde, the hero idle: the
  baseline, this machine right now), then spawn 150 and fight, then +100 to 250.
- **A 150 fight passes when its CPU p95 ≤ 8 ms, or, when the baseline's p95 is over 5 ms, ≤ baseline + 3 ms** — in one
  line, p95 ≤ max(8, baseline + 3), as baseline + 3 only passes 8 when the baseline is over 5. On an idle RTX 5080
  the empty floors run at p95 ~2–3 ms, so the relaxed limit only kicks in when something else holds the machine.
- **A failed 150 run is retried once** (a fresh page, baseline and fight); the retry decides, and both are printed.
- **The machine-load verdict**: BUSY when a baseline p95 was over 5 ms (that run was gated at baseline + 3), or when
  Windows showed other programs loading the machine (CPU ≥ 40%, or one program ≥ 10% of the 3D engine, sampled
  before Chrome starts and after it closes); otherwise idle. The gate itself only relaxes on the measured baseline.
- What the baseline catches: with a game holding ~40% of the GPU's 3D engine, the Burrow floor stays at p95 ~2.2 ms
  but the region floor (more pixels of foliage) rises to ~7 ms — all of it inside `render()`, in back-to-back runs of
  frames where GL calls block on the shared GPU; at a quarter of the pixels the same floor is flat (p95 2.7). So a
  region fight on a shared GPU gets ~10 ms of room and a Burrow fight keeps 8.
- 250 is reported only. Exit 1 on a fail; PASS / FAIL lines feed run-all's summary.
- The final run-all (2026-10-06, dev server, the same game still holding ~40% of the 3D engine; CPU p95 @150 ms,
  baseline → fight / limit):

  | world | Chewy | Moka | Poe |
  |---|---|---|---|
  | Burrow | 2.2 → 7.4 / 8 | 2.2 → 6.9 / 8 | 2.2 → 7.8 / 8 |
  | Region | 6.7 → 8.1 / 9.7 | 7.0 → 7.6 / 10.0 | 7.5 → 7.8 / 10.5 |

  Poe is now within 0.4 ms of Chewy at 150 in the Burrow and level with him in the region (p50 5.9 vs 5.6 and 6.4
  vs 6.0); her p95 draw calls are below his. 250 fights: 10.1–13.6 ms. Verdict BUSY (the region baselines), gate PASS.

## 8. Systems to add or change (the tech plan)
- **`DungeonDef` and parameterised dungeons**:
  - `gen.js` and DungeonMode take `{ id, theme, monsters, boss, levelBase, floors, tier, mods, seed }`, instead of a
    floor number alone;
  - `G.enterDungeon({ id, floor, tier, mods })`;
  - the Burrow is `DungeonDef 'burrow'`, with unlimited floors and the old behaviour;
  - the zone dungeons are `'bambooDepths'` and so on;
  - Burrow-only code gated on `!isRegion` moves to an explicit `def.kind` check.
- **Save state** (with a migration from `state.regions`):
  ```
  state.zones[id] = {
    unlocked, visits,
    village: 'besieged' | 'saved',
    siegeCamps: [...],
    dungeon: { cleared: 0, bestFloor, tier: { unlocked: 0, cleared: [] }, spirit: { best: 0 } },
    quests: {...}
  }
  ```
  (The shared `wick` count is dropped: runs are free, §5.) The Deep Burrow keeps the same dungeon record in
  `state.dungeon.deep` (§5.1).
- **Events**: `monster:killed` gains `{ zone, dungeon, floor, tier }`. New events: `village:saved`, `dungeon:cleared`
  `{ id, tier }`, `tier:unlocked`.
- **Quest steps**:
  - `kill` with `zone`/`dungeon` filters;
  - new steps: `find`, `rescue`, `dungeonFloor`, `tier` and `villageSaved`;
  - the quest pointer learns about zone, gate and floor targets.
- **The Lantern UI**: tier select, modifier slots, a reward summary (no cost: runs are free, §5).
- **Modifier hooks**:
  - `spawnPack` (count, size, rank rolls);
  - the `Monster` constructor (stat multipliers, applied mods);
  - DungeonMode (run flags such as Haunted or Hard Ground);
  - `onMonsterDeath` (quantity, rarity and XP multipliers).

### 8.1 As built: phase A foundations (2026-10-05; ROADMAP Z-A2 to Z-A5)
- **`DungeonDef`** (`src/dungeon/defs.js`, pure): `DUNGEONS[id] = { id, kind, name, zone, theme, monsters, boss, levels,
  floors, waypoints, stub }`.
  - `burrow`: `theme` and `boss` are `null` (the old rotation by floor: `themeFor`, `bossFor`), `floors: Infinity`,
    waypoints on.
  - The four zone dungeons (`bambooDepths`, `mapleRoots`, `tideCaves`, `onsenCaverns`) are **stubs**:
    - 2 floors; the zone's 3 monsters and its region boss on floor 2; the region's level band;
    - Burrow themes stand in for their kits (`TODO(Z-C1)`), and the boss fights in the Burrow's boss room.
  - `ZONE_DUNGEON` maps a zone to its dungeon.
  - `floorPlan(def, floor, { tier, heroLvl })` gives gen.js `{ theme, boss, mlvl, waypoint, depth }`;
    `generate({ floor, seed, plan })` without a plan is the old Burrow floor exactly.
  - Zone levels: the hero clamped to the band, +1 per floor, +4 per tier, capped at 60.
- **Entering**: `G.enterDungeon({ id, floor, tier, mods })`; a number is still the Burrow floor.
  - `DungeonMode.build(arg)` takes either. The mode carries `def`, `kind` ('burrow' | 'zone'; RegionMode is
    'region'), `zoneId`, `tier`, `mods`, `run`, and `where()`, `nextRun()`, `hasDeeper()`.
  - The stairs go to `nextRun()` ("Go deeper" in a zone dungeon). Its last floor has no stairs after the boss.
  - Only the Burrow writes `state.dungeon.deepest` and waypoints. A zone dungeon writes `zones[zone].dungeon.bestFloor`.
  - Region and zone-dungeon kills and chests drop the zone's forage (`mode.zoneId`).
- **Seeds**: `beginRun` rerolls every entry.
  - `state.dungeon.runs` goes up by 1, and `state.dungeon.seed` is a random number set once per save.
  - `?dseed=N` pins the layouts for the tab (sessionStorage; `?dseed=off` unpins). `dseed=1` is exactly the old fixed
    Burrow. `tools/qa/lib.mjs boot()` adds it, so the QA keeps its old floors.
  - An explicit `seed` in the run wins over both.
- **Modifier hooks** (`src/rpg/zoneMods.js`, no-ops until phase E):
  - `packMods(mode, sp)` at the top of both `spawnPack`s;
  - `monsterMods(mode, m)` on every run monster, including bosses and boss adds.
- **Save state** (`src/rpg/zones.js`): the §8 record per zone, plus `regionBoss`.
  - The migration from `state.regions`: `unlocked` → `unlocked`, `cleared` → **`regionBoss`** (the outdoor boss count,
    kept apart from `dungeon.cleared` so the zone dungeon's first clear stays detectable for every save), `visits` →
    `visits`.
  - `state.regions` stays as a **live, unsaved view** of `state.zones` in the old shape, so region code, the Travel Map
    and s13 read and write it unchanged.
  - `normalizeZones` runs at boot. It is idempotent and a max-merge.
  - Helpers: `recordDungeonClear` (a T0 clear opens T1; clearing the highest open tier opens the next, up to T5),
    `tierCleared`, `saveVillage`, `villageSaved`, `noteFloor`.
  - (The shared Spirit Wick count was dropped in phase E: runs are free, §5.)
- **Events**:
  - `monster:killed`, `boss:dead` and `mode:changed` carry `{ zone, dungeon, floor, tier }`;
  - `dungeon:cleared { id, kind, tier, floor, zone, boss, first }` fires on every Burrow boss (`id: 'burrow'`), a zone
    dungeon's last boss, and a region boss (`id` = the zone, `kind: 'region'`);
  - `tier:unlocked { id, zone, tier }` fires on a zone dungeon clear that opens a tier;
  - `village:saved { zone }` is phase D's to emit; the quest steps already listen.
- **Quest steps** (`src/world/questSteps.js`, pure; story.js calls it):
  - `kill` and `boss` take optional `zone`, `dungeon`, `floor` (exact) and `tier` (at least) filters;
  - `find { item, n }` counts the `quest:find` event, and `rescue { npc }` the `villager:rescued` event (phase D emits
    both);
  - `dungeonFloor { dungeon, n }`, `tier { dungeon, n }` and `villageSaved { zone }` are read from the save.
  - Unfiltered old steps count exactly as before.
  - **The pointer** (`Story.placeFor`, `destOf`):
    - from the village, the Burrow's gate or the Wayfarer's Post;
    - outdoors in the step's zone, `mode.gatePos` (phase C) or `mode.villagePos` (phase D);
    - in the right dungeon, the stairs until the floor, then the boss or `mode.questMark(step)` (phase D);
    - elsewhere, the way out (`mode.exitPos`).

### 8.2 As built: phase C, the zone dungeons, Bamboo first (2026-10-06; ROADMAP Z-C1 to Z-C4; code map: ARCHITECTURE.md "Zone dungeons")
Built end to end for all four zones: the **Bamboo Depths** first (checkpoint 1), then the **Maple Roots**, the **Tide
Caves** and the **Onsen Caverns** (checkpoint 2). Every region boss now fights in its dungeon's arena; the outdoor
clearings hold the gates.
- **The floors** (`src/dungeon/zoneGen.js`, pure; `gen.js generate` hands over when `plan.layout === 'zone'`, and
  `floorPlan` adds `{ layout, rooms, size, arenaR: 17, slots: 2, density: [120, 160] }` for `kind: 'zone'`):
  - **Floor 1** has about 9 organic cave chambers: the arrival; a treasure room (in a dead end, with a gold chest and
    its champion guards); a buff shrine; **two objective slots**; camps; and the stairs in the chamber farthest away
    by walking distance.
  - **Floor 2** has about 8 chambers, then the **arena**. The arena is a clean round room of radius 17 m (34 m across)
    in a corner, reached by one straight approach corridor. Its mouth is `L.arenaMouth`. Corridors route round the
    ring, and a wall band seals it, so the approach is the only way in (gen-fuzz checks this). Half the time, floor 2
    also has a second treasure room. It has no stairs.
  - **Density**: 120–160 monsters a floor (the generator aims for 130–150). Room packs hold 8–16 monsters, corridor
    packs 6–10, and no pack is larger than 16. Each pack forms a cluster 4–8 m wide (`spawn.r` 2–4 m). Idle, its
    members mill about inside that disc (`Monster.home`, set by `zoneRun.spawnPack`; R-14): before, each one
    random-walked from wherever it stood, so a floor's packs drifted from about 5 m to 17 m wide in 20 s.
  - **Elites stay rare**: each floor has at most 2 champion packs (the treasure guards first) and exactly 1 unique pack
    (on floor 2, the one at the approach).
  - **Marks for phase D**: a pack that can carry a quest drop has `spawn.mark = 'champion' | 'unique'`, and the
    treasure chest has `chest.mark`. A slot is `{ room, x, y, guard }`, where `guard` is its guard pack's index and
    that pack has `spawn.guard`.
  - The layout also returns `zone: true`, `slots`, `arena { x, z, r }` (world metres), `arenaMouth` and `packTotal`.
- **The kit** (`src/dungeon/zoneKits/`; registered by `zoneKit(theme)`). DungeonWorld and RoomDresser call the kit
  through small hooks, and the Burrow path is unchanged when no kit is set.
  - A kit supplies:
    - the floor, arena and wall shaders, and the wall profile;
    - `dressWalls`, `buildProps`, `buildLights`, `buildCenterpieces`, `buildArena`, `buildLandmarks` and
      `buildDressing`;
    - `decoMap`, the room purposes, `arrival`, `hoard` and `corridor`;
    - `update`, `finish` and `dispose`.
  - **Shared passes** every kit uses (`zoneKits/common.js`): `addPiece` (bakes a Builder piece into the floor's
    chunks), `roofShafts` (a few capped shafts through the roof), `wallSpots` (mid-scale dressing spots along the walls
    and in the corners, off the corridor mouths), `kitDecal`, `inStream`. Each zone's theme is pure data in its own file
    (`zoneKits/theme<Zone>.js`, merged by `themes.js`).
  - **The cave feel** (the owner's 2026-10-06 pass, applied to every kit): the wall face swells into an overhanging
    brow and the rock heaves up behind it into the dark (the walls imply the roof); a dark, cool band along every wall
    foot (the floor shader's `encl`); a dim, cool base light with warm lantern pools and a few bright shafts from cracks
    above; 4–6 mid-scale clusters along the walls and in the corners of every chamber, the middle kept clear.
  - **`bambooCave`** (`zoneKits/bamboo.js`, theme in `zoneKits/themes.js`), the bamboo shrine caves:
    - **floors and walls**: cool jade cave stone; flagstone runs with moss joints; moss cushions; bamboo-leaf litter;
      a stream that crosses camp rooms wall to wall, with stepping stones, banks and soft caustics; round stone plazas
      in the treasure and shrine rooms; bedrock shelves, grit and pebble patches, leaf drifts and small pools along the
      wall foot. The rock walls show strata, seepage streaks, ledge moss and pale bamboo rhizomes, then swell into a
      brow with moss tongues and hanging roots under it; above it, dark wet boulders with moss beds only along the brow.
    - **wall pieces**: culms through the rock (they arc out past the brow), shide ropes, lantern niches, seeps, moss
      curtains and hanging roots.
    - **set pieces and props**: young culms leaning out of the brows, rock pillars, a shishi-odoshi spring, a
      sacred-bamboo island, a hokora with a torii, stone lanterns and goza mats; along the walls and in the corners,
      root tangles, fallen bamboo, moss boulders, lantern groups and leaf drifts.
    - **light**: up to 5 shafts a floor (two narrow planes each, a cool pool and a light under them, dust motes),
      lantern pools on the floor, a dim cool base.
    - **effects**: bamboo blades drifting down from the cracks, fireflies over the moss, drips, faint stream mist.
    - **the arena**: a flagstone ring, a moss lawn with a small mitsudomoe stone inlay, 8 stone lanterns round the
      rim, a torii at the mouth, gohei, an iwakura on the far side, and wind chimes.
    - **audio**: the `dungeon_bamboo` ambience; music `region_bamboo`, and `boss_bamboo` for the boss.
    - The kit reuses the bamboo region's builders (`regions/biomes/bambooProps.js`, `bambooFlora.js`) through a
      Placer.
  - **The dungeon-only monster: the Iwa-bōzu** (`src/dungeon/zoneMonsters/bamboo.js`, with `bamboo.sfx.js`;
    registered with the region monsters; `DungeonDef.tank`).
    - **Look**: a mossy rock monk with a shimenawa belt and shide, in three variants: plain, the Lantern monk and the
      Elder.
    - **Behaviour**: it sleeps like a boulder until woken. Close up it slams the ground, with a ring telegraph and a
      knock-back. From mid range it tucks into a ball and rolls along a lane telegraph, and it is dizzy afterwards (it
      also stops if it hits a wall).
    - **Stats**: life ×1.9, def ×1.6, slow (speed ×0.75); fire and frost resist 20, zap −15.
    - **Model**: 4 parts (body with the eyes and the paper shide, sleeping lids, two arms), so each variant draws 8
      instanced batches.
    - About 10% of normal pack members are Iwa-bōzu (about 15 a floor), mixed into the inner part of the fast packs as
      tanks.
  - **`mapleHalls`** (`zoneKits/maple.js`, theme in `zoneKits/themeMaple.js`), the **Maple Root Halls** under the
    great maple of Momiji Hollow:
    - **floors**: packed umber earth with ochre and rust drifts; root-heaved flagstones; olive moss with glowing fungus
      pinheads; fallen momiji in patches and drifts; a cool root-water channel; round plazas with a maple-leaf mon in
      the shrine and treasure rooms.
    - **walls**: layered clay and earth with roots threading down, a heavy brow with a fringe of hair roots, great roots
      heaped above it.
    - **dressing**: great root buttresses (some girdled in shimenawa), root niches with chochin, shelf fungus, jizō
      alcoves, hanging roots; along the walls, root tangles, fallen branches, leaf drifts, sake-barrel stacks, lantern
      groups and mushroom clusters.
    - **rooms**: the hollow-root shrine, the sake cellar, the tanuki den, the root cellar, a lantern walk, the fungus
      grotto, fallen branches.
    - **the arena**, Danzaburō's hall: great roots pour over the far rim, root knees and stone lanterns on the near rim,
      a torii at the mouth, the sake-barrel shrine, a capped amber shaft.
    - **audio**: the `dungeon_maple` ambience; music `region_maple` / `boss_maple`.
    - **the dungeon-only monster: the Tesso**, the iron-rat yokai (`zoneMonsters/maple.js`). It burrows and travels as
      a dirt mound (it can't be hit underground), stops under the hero, a ring telegraph shows, it bursts out with a
      knock-back and sits dazed; close up it gnaws (a cone telegraph). 4 parts, 3 variants (Tesso, Sutra Tesso, Elder
      Raigō).
    - **the boss**: Danzaburō (`regions/bosses/tanuki.js` `ARENA_TUNE`): his gang in three waves (70 / 45 / 20%), drum
      rings to 14 m, a longer boulder run, the flop clamped inside the ring.
    - **the gate** (`regions/gates/maple.js`): crossed great roots arching over a dark hollow in an earthen bank, a
      torii, chochin, jizō; set 1.2 m in from the standard spot (the region's far-rim dressing stands there).
  - **`seaCave`** (`zoneKits/tidepool.js`, theme in `zoneKits/themeTidepool.js`), the **Tide Sea Caves** under the
    Shiokaze Tidepools:
    - **floors**: wet sand with tide ripples and shell grit; basalt shelves with pools in their hollows; hexagonal
      basalt flags on the trails; wrack banked along the wall foot; glowing tide pools and tide channels (decor b) with
      barnacled rims, caustics, plankton sparks and little fish; a basalt dais in the shrine rooms.
    - **walls**: basalt banded by the tide (a black wet foot, barnacles, mussels, pink crust, weed, a pale high-water
      line), a sea-cut brow hung with kelp, wet boulder tops with glowing algae.
    - **dressing**: kelp curtains, glass-float niches, nets on the rock, anemone ledges; float lanterns on driftwood
      posts; along the walls, rock piles, driftwood heaps, net-and-float piles, kelp drifts with a crab, crab burrows.
    - **rooms**: the Ebisu shrine, the wreck, the net loft, the wedded rocks, the coral garden with a giant clam, the
      driftwood beach, the crab colony; the treasure chest sunk in a glowing pool.
    - **the arena**, Umibōzu's cove: **a sea edge** on the far side from the camera (the kit sets `L.arenaSea`,
      `W.waterAt`, `W.waterLevel`, `W.inSea`, and blocks the sea in `W.walkable`), a sand beach inside a basalt ring, a
      seigaiha shell mosaic, float lanterns round the beach (`W.arenaLanterns`), a red sea torii and a sea stack in the
      water, a moonlight shaft.
    - **audio**: the `dungeon_tidepool` ambience; music `region_tidepool` / `boss_tidepool`.
    - **the dungeon-only monster: the Sazae-oni**, the turban-shell oni (`zoneMonsters/tidepool.js`). Mid range: it
      shuts in, bristles, flashes 8 lane telegraphs and fires a star of spines; close up it spins after you (a ring
      telegraph, a knock-back) and is dizzy afterwards; shut in, it takes half damage. 4 parts, 3 variants (red, Hotaru
      with glowing spots, Elder).
    - **the boss**: Umibōzu (`regions/bosses/umibozu.js` `ARENA_TUNE`) rises from the cove's sea and slides ±5.5 m
      along its shore; adds in three waves from the surf; the phase-2 flood and the wave crests are clipped to the ring
      (`fx_umibozu.js`).
    - **the gate** (`regions/gates/tidepool.js`): a sea-cave mouth in the cliff (the region's grotto arch), a rope
      torii, floats, a tide pool at its foot.
  - **`iceCavern`** (`zoneKits/onsen.js`, theme in `zoneKits/themeOnsen.js`), the **Onsen Ice Caverns** under Yukimi
    Onsen:
    - **floors**: packed snow with wind ripples, frozen slate flags, snow cushions with rime stars, glare-ice patches,
      snow banked at the wall foot, a melt-water rill; **hot-spring pockets** (steaming teal pools with a warm glow, a
      ring of thawed wet stone round each); frosted slate plazas.
    - **walls**: dark slate sheathed in translucent blue ice (cracks, frozen bubbles, frost at the rim), ice flows from
      the brow, an icicle fringe, snow on the rock above.
    - **dressing**: ice crystals bursting from the rock, frozen falls, icicle curtains, lantern niches, steaming vents,
      shide ropes; yukimi lanterns as the room lights; along the walls, ice-crystal clusters, drift heaps, frozen
      barrels, lantern groups, steaming vents.
    - **rooms**: a hot-spring pocket (a snow monkey soaking), the old bath corner, a frozen fall, an ice-crystal grove, a
      lantern walk, a snowed-in shrine, a frozen storeroom.
    - **the arena**, Yuki-onna's frozen hall: yukimi lanterns round the ring (`W.arenaLanterns`: her whiteout's safe
      warmth), a snow torii at the mouth, a frozen fall and a shrine on the far side, a frozen-lake floor inlaid with a
      snowflake. The boss intro's screen pulse is icy (`theme.introPulse`).
    - **audio**: the `dungeon_onsen` ambience; music `region_onsen` / `boss_onsen`.
    - **the dungeon-only monster: the Akaname**, the bath-licking imp (`zoneMonsters/onsen.js`). Mid range: it sucks its
      tongue in (a lane telegraph) and lashes it out up to 6.5 m, slowing you and yanking you into the pack, then pants
      (the moment to hit it); close up it puffs scalding steam (a ring telegraph, fire, a shove). Warm-blooded among the
      snow folk; a grabber, not a wall. 4 parts, 3 variants (Akaname, Yuzu Akaname, Elder).
    - **the boss**: Yuki-onna (`regions/bosses/yukionna.js` `ARENA_TUNE` / `inHall`): her children in two waves, more
      icicles and glare patches, the mirrors in a wider ring, kept 4.6 m inside the rim, the whiteout round the hall's
      lanterns.
    - **the gate** (`regions/gates/onsen.js`): an ice-cave mouth in a snowy bank, icicles, a snow torii, yukimi
      lanterns, a steaming spring at its foot (softer lantern lights on the snow: `look.lanternI`).
- **The packs, the pacing and the arena** (`src/dungeon/zoneRun.js`, `DungeonMode.zr`):
  - **Pack make-up**: each pack has a main kind that rotates through the roster, with 25% of its members from another
    kind. A floor shows two of each kind's three variants (every variant × part is its own instanced batch), so a zone
    fight draws about 180 calls (the Burrow's about 140). Champion and unique packs get a leader, and a champion pack has 3 champion members.
  - **Pacing for fodder** (`DENSITY`):
    - life ×0.7, damage ×0.85, xp ×0.42;
    - only 40% of their drops are kept, and coins come in fewer piles worth ×1.5 each;
    - gems and furniture always drop.
  - **The arena trigger**: when the hero steps into the ring (within r − 2.2), the lanterns flare, a seal (a curtain
    and a rope) closes the mouth, and the boss wakes with his intro. The seal opens when he falls.
  - **After the boss**: a portal labelled "Return to the Whispering Bamboo Grove" takes the hero out to the gate
    (`G._zoneArrive = { zone, gate: true }`). Floor 2 has no stairs.
  - **First clear** (`dungeon:cleared` with `first: true`):
    - a gold chest rises by the boss; it holds the zone boss unique (`ZONE_UNIQUE`; the bamboo one is `tenguGaleFeather`,
      Master Tengu's Gale Feather, an omamori; tagged `zone`, so it never rolls at random) and a guaranteed rare;
    - the next zone opens (`zoneUnlockOnClear`);
    - a "<dungeon> cleared!" banner appears.
- **The boss, retuned for the arena**: Master Tengu fights in the 17 m arena (`regions/bosses/tengu.js` `ARENA_TUNE`,
  which applies when `layout.arena.r >= 15`).
  - **Adds** come in 3 summon waves, at 70%, 42% and 18% life:
    - 4 karasu-kozo;
    - 3 karasu-kozo and 2 kamaitachi;
    - 2 karasu-kozo, 2 kodama and 2 takenoko.
  - **Open-ground attacks**: one extra tornado, and a wider dive.
  - His identity, intro, music and victory are unchanged.
  - The region no longer spawns him: `installGate` filters out the boss spawns and sets `L.boss = null`.
- **The objectives API (with phase D), as agreed**:
  - At each floor build, DungeonMode calls `G.story?.dungeonObjectives?.({ dungeon, floor, zone, tier })`. A missing
    provider counts as `[]`.
  - `{ kind: 'cage', npc, label }`:
    - places a locked bamboo cage with the captured villager in an objective slot (a spare spot if the floor has no
      free slot). The villager is built by `G.zoneNpcBuilder?.(npc)`, or is a kit villager.
    - F refuses while the slot's guard pack stands. Once the guards are down, F frees the villager and emits
      `villager:rescued { npc, zone, dungeon, floor, tier }`.
  - `{ kind: 'drop', item, label, n?, from: 'champion' | 'unique' | 'chest' }`:
    - the marked pack's leader (or its last member) drops a quest scroll, or the marked chest gives it;
    - picking it up emits `quest:find { item, n, zone, dungeon, floor, tier }`. Nothing enters the bag.
  - `mode.questMark(step)` points to:
    - the cage, for a `rescue` step;
    - for a `find` step, the dropped item if it is on the ground, else its carrier, else the chest.
- **The gate** (`src/regions/dungeonGate.js`; `RegionMode` calls `installGate` after the village attaches):
  - **Looks** live in `src/regions/gates/<zone>.js` (`{ build(ctx) → { lanterns, colliders, mouth }, seal, glb }`);
    `glb.url` names a Blender gate (ROADMAP Z-D6) that replaces the kit gate's own mass when it loads.
  - **Where and what**: the old boss clearing at the end of the trail becomes the dungeon's gate: a mossy cave mouth in
    a rock outcrop, with a torii and lanterns. `mode.gatePos` is the quest pointer's target.
  - **Sealed** until `villageSaved(zone)`: a curtain hung with ofuda, a "!" mark, and the label "Bamboo Depths: sealed.
    Save Takemori Village first".
  - **Unsealing**: the `village:saved { zone }` event unseals the gate live, with a burst and a banner.
  - **Entering**: "Enter Bamboo Depths" calls `G.enterDungeon({ id: ZONE_DUNGEON[zone], floor: 1 })`.
  - **Debug**: `?villagesaved=1` (every zone) or `?villagesaved=bamboo,maple` saves villages at boot, and
    `G.zoneDebug.saveVillage(zone)` saves one and emits the event.
- **The unlock rule** (`src/rpg/zoneProgress.js`, pure; `regions/index.js regionUnlocked`): a zone opens when either:
  - the hero reaches its level (as before);
  - the previous zone's dungeon has been cleared once;
  - (old saves) the previous zone's region boss was beaten outdoors before the move (`zones[prev].regionBoss > 0`).
  - Otherwise the reason reads "Reach level N or clear the <dungeon>".
- **The Travel Map**: a dungeon zone's card shows a 踏破 stamp once its dungeon is cleared, a Dungeon row ("cleared
  ×N"), and "deep in the dungeon" on the Boss row.
- **QA**:
  - **s22-zone-dungeons**: the gate sealed, then unsealed live; both floors; the cage and drop objectives with a fake
    provider; kill pacing; the arena trigger and seal; the boss kill; the first-clear rewards; the next zone
    unlocked; the second clear; the unlock rule; and perf on a dense floor.
  - **gen-fuzz**: zone invariants (density, elites, slots with guards, arena reachable with one way in, the boss at
    the centre, no pack in the ring).
  - **test-rpg**: "ZONE DUNGEONS".
  - **prod-smoke**: the `zone:bambooDepths` case.
  - **profile-horde**: `WORLDS=zone`.
  - **s13 and s21**: updated for the boss in the dungeon.

## 9. Sprint
- **Hold Shift while moving** (WASD or click-to-move): **+40% speed**, free.
- Sprint drops while attacking, casting, charging or rolling, and resumes when Shift is still held.
- A sprint run pose: a stronger lean and a longer stride, with the run blend ceiling raised so the cycle matches the speed.
  Add a small dust puff and sound.
- Shadow, and the villager heroes when escorting, scale their follow speed with the hero's speed, so Shadow doesn't
  teleport constantly.
- **Rebind**: attack-in-place moves from **Shift+LMB** to **Alt+LMB**, because Shift is now sprint (the owner's pick,
  2026-10-06; it was Ctrl+LMB first). The loot labels move from Alt to a held **Z**. Update the README controls and the
  tutorial text.
- A Settings choice: sprint as hold or toggle.

### 9.1 As built (2026-10-05; ROADMAP Z-A1)
- **`src/actors/sprint.js`** (`player.sprint`) folds its multiplier into `speedMul`, so WASD and click-to-move both get
  it. It eases in over about 0.3 s and drops in about 0.1 s.
  - It is blocked (`sprint.why`) by a roll, a dash or leap, a charge wind-up (the slow walk wins), a channel or
    move-while-acting cast, and any busy animator action (swings, casts).
  - It stacks with the Zoomies shrine, boots and Poe's Vanish.
  - The push-off: a small dust puff behind the heels, `sprint_start` (a soft whoosh), and heel dust on the footfalls.
- **The pose** (`animator.js`, `anim.sprint` → `sprintAmt`):
  - past the run blend, the stride lengthens (+0.22) so the cadence stays the run's;
  - a deeper lean (+0.22 rad), the head lifted against it, longer leg and arm swings;
  - bent, pumping elbows on the baked heroes (the katana and staff carries cancel the elbow, so they stay upright);
  - the ears streaming back.
  - Quadrupeds stretch into a gallop above 4.5 m/s.
- **Shadow** paces himself on the hero's measured speed (×1 to ×2.2): a 3 s sprint has no catch-up teleports.
- **Controls**:
  - **Alt+LMB** attacks in place in combat worlds (2026-10-06; it was Ctrl+LMB, and its browser workarounds are gone);
  - the loot labels show while **Z** is held (they were on Alt). Z is free outside decorate mode, and Ctrl+Z there
    is still the undo;
  - `core/input.js` keeps a lone Alt (down and up: on Windows it would focus Chrome's menu button) and Alt + any key
    but F4 (the menu on Alt+F / E, the address bar on Alt+D, back and forward on Alt+arrows) from reaching the browser;
  - a held modifier can't stick: a blur clears the keys, and every key and mouse event resyncs Alt, Shift and Ctrl from
    its own flags;
  - the OS keeps Alt+Tab, Alt+F4, Alt+Space and, with two keyboard layouts installed, Left Alt+Shift (the layout
    switch: sprint plus attack-in-place).
- **Settings › Sprint (Shift)**: Hold or Toggle (`ui.settings.sprintMode`). In Toggle, a tap latches it; a second tap,
  or standing still for 0.6 s, ends it.
- **Where it's taught**: Rosie's intro line, the Controls panel and the README. Shadow gives a one-time tip after a long
  walk outdoors.
- **QA**: s21 (the speeds, Toggle, the drop on attack and roll, Shadow's pace, Alt+LMB, Shift+LMB and Ctrl+LMB, the Alt
  key guards and stuck-key resync, the Z loot labels, all three heroes, Vanish and Zoomies). Look review: `tools/qa/sprint-shots.mjs [heroes] [--side]`.

## 10. Phases (the order of work; details and status in ROADMAP.md)
| Phase | What | Notes |
|---|---|---|
| **A** | Sprint, plus the foundations (`DungeonDef`, the `state.zones` migration, event and quest filters, seeds that reroll) | Can start now |
| **B** | Performance for big packs (§7) and the horde perf gate | Can start now, in parallel with A |
| **C** | Zone dungeons: 2 floors + the boss for the 4 zones, the boss arena rooms, the region bosses moved in | Needs A |
| **D** | Zone villages: the siege, the rescue, reopened buildings, villagers and their quests into the dungeon | Needs A; with C |
| **E** | Tiers T1–T5, the Spirit Lantern, the modifiers, the Spirit endgame | Needs C and B |
| **F** | Elevation rework of the outdoor zones (terrain, nav, line of sight, camera, the height audit) | Starts with Bamboo; the height audit can begin anytime |
| **G** | Polish: density tuning, balance, rewards, the zone story beats, music stings, docs and QA | Last |

Every phase ends with screenshots reviewed against the 9/10 quality bar, the relevant QA scenario added to run-all, and
`prod-smoke` passing.

## 11. Open questions for the owner
- The village names, and each zone's special buildings (proposals in §2).
- ~~Whether the **Burrow** also gets tiers and modifiers.~~ Answered 2026-10-07: yes, at its own Spirit Lantern (the Deep
  Burrow, §5.1); the Spirit unlock needs only the four zone dungeons at T5.
- ~~The tier count and whether Spirit Wicks gate runs.~~ Answered 2026-10-07: 5 tiers, runs are free (no wicks).
- ~~The endgame pinnacle boss.~~ Answered 2026-10-07: a remixed "all four" fight at Spirit 10 (Tengu, Danzaburō, Umibōzu,
  Yuki-onna in phases in one arena; their code and models reused).
