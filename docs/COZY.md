# Cozy path: expeditions, the Adventurers' Guild, peaceful zones and scavenging (design)

Status: **designed 2026-10-08; the owner answered §14 the same day** (the decisions are folded in below). Nothing is
built. The work is tracked in
[ROADMAP.md](ROADMAP.md) §1c (CZ-1…CZ-12); this file is the design.

The owner's direction (2026-10-08):
- A nice split between **building and town management** and **dungeon crawling**.
- You can **progress through the story without fighting monsters**.
- **Hire people to clear the next region for you**, then go there yourself once it's safe.
- **Complete quests without fighting**, and **find building materials by scavenging** areas without monsters.
- **Zone maps have monsters only while their village is being saved for the first time.** After that the overworld is
  mostly peaceful, with a few areas that still have monsters.

The owner's picks:
- **Who clears regions: both.** Benched heroes go on expeditions. A new **Adventurers' Guild** building lets you hire
  crews of townsfolk adventurers for coins and supplies. Heroes are stronger; hires cost money.
- **How an expedition works: timed, plus town needs.** You send a crew from a board in town. It's away for a stretch
  of in-game time and comes back with the objective done, plus loot and a story. Harder objectives need a stronger crew
  and some town milestones (buildings, population, supplies).
- **Dungeons:** crews can clear **what the story needs** (village sieges, zone dungeon first clears, the villagers'
  quest objectives). **Tiers, the Spirit endgame and the pinnacle stay hands-on combat.**
- **No mode: always both.** One game. You can build and send crews, fight yourself, or mix freely at any time. The
  intro introduces both paths.
- **The overworld:** monsters only while a zone's village is being saved the first time; then mostly peaceful, with a
  few **marked wild areas**. Peaceful areas offer **scavenging**: building materials and quest items without combat.

The owner's answers to §14 (2026-10-08):
- **Crew prizes**: a trophy and a rare; never uniques or gems.
- **A crew's dungeon clear wakes that dungeon's Spirit Lantern** (Tier 1 opens). The boss unique and gems still wait for
  your own first clear, and the Lantern's tier runs themselves are always hands-on.
- **Real time counts while the game is closed**: an offline catch-up on load, capped at 8 game hours per absence, for
  expeditions, hires' wages and morale, and node refills only; a "While you were away…" card.
- **Wild areas**: 2 per zone plus the Sightings board; no toggle.
- **The Guildmaster**: Old Hachi, kit-built for now (a Blender centrepiece may come later through the toybox pipeline).

## 0. The key design calls
1. **Every combat step in the story gets a crew route.** The data stays the same. A step that needs a fight also names
   an **expedition objective**, and a crew that brings that objective home completes the step. You can still do any
   step yourself. Nothing new is added to the quest list, so both paths share one story (§3).
2. **In-game time is a new world clock that runs everywhere.** The day clock only runs in the village today. A
   **world clock** counts game hours of play in every mode, and sleeping adds the hours it skips. Expeditions and
   scavenge respawns run on it. Time away from the game counts too, capped at 8 game hours per absence (§4.4).
3. **Crews do the story; they don't take the fighter's prizes.** The zone boss uniques, the Burrow boss quests'
   uniques and gems stay with your own first hands-on clear. A crew route pays a **trophy** (decor) and a rare item
   instead, and gives more materials than a fight (§4.6, §8). A crew's clear **does wake the Spirit Lantern** (Tier 1),
   but every tier run is hands-on.
4. **Peaceful means the trail, not the whole map.** Once a zone's village is saved, its trail camps stop spawning.
   **Two named wild areas per zone**, off the main trail and marked in the world, on the minimap and on the Travel Map,
   keep their monsters. A daily **Sightings** board gives fighters bounties there (§6).
5. **Scavenging fills the combat-only materials.** Petal, bone, silk, crystal and lantern come only from loot today.
   Every biome and Blossom Hollow itself get gather nodes and **Shadow's dig spots** (a hold-and-release dig, never a
   fail), so a cozy player can build everything (§7).
6. **Benched heroes level on expeditions.** Today they gain no XP. A crew's heroes earn XP while away, and the zone
   level gates (they read the highest level of any hero) open for a cozy player through their crews (§3.3).

## 1. The two paths, and how they mix
```
                     ┌──────────────── the town: build, farm, fish, cook, decorate ────────────────┐
                     │                                                                              │
  FIGHTING PATH      │   COZY PATH                                                                  │
  walk into the      │   the Expedition Board (Wayfarer's Post) → pick an objective → pick a crew   │
  Burrow, the siege, │   (benched heroes, Guild hires) → pack supplies (dishes, coins) → send       │
  the zone dungeon   │   → the crew is away N game hours → comes back: the objective done           │
  and fight it       │     (or partly done), loot heavy on materials, XP for the crew, a report     │
                     │                                                                              │
                     │   scavenging in peaceful zones and at home: gather nodes, Shadow's dig spots │
                     └──────────────────────────────────────────────────────────────────────────────┘
        both feed the same story steps, the same zone unlocks, the same village saves
```
- **One game, no mode.** Every story step can be done either way, and a step half done by one path is finished by the
  other (a crew relieves the camps you didn't break; you fight the boss the crew didn't reach).
- **What stays fighting-only**: the tier runs themselves (T1–T5; a crew can only wake the Lantern), the Spirit
  endgame, the pinnacle, the wild areas, the Sightings bounties, the Deep Burrow's runs, the Burrow below the story
  floors, and the first hands-on clears that drop the boss uniques.
- **What stays cozy-only**: nothing is locked from a fighter. A fighter can send crews for materials and errands too.
  The cozy path simply never needs a fight.

## 2. The story, beat by beat
Legend: **[F]** fight it yourself · **[C]** send a crew (an expedition) · **[T]** town: build, scavenge, cook, help.
Steps marked [F/C] take either.
```
NEW GAME
 Rosie's welcome ............................................................ [T] talk
  └─ Moka arrives and joins (after the welcome; no requirement) ............ [T] scene
      └─ the house tour (Shadow) ............................................. [T]
          └─ "Something Squishy" (burrow1): 8 yokai + 3 Mochi Jelly ........ [F/C] crew: "Peek into the Burrow"
              │                                                               (Rosie: "Go yourself, or ask Moka?")
              ├─ "A Home for Everyone": 9 homes ............................. [T] build
              ├─ "Lights of Blossom Hollow": 3 lanterns ..................... [T] build
              ├─ "The King of Squish": Burrow 5 + King Mochi ............... [F/C] crew: "The King of Squish"
              ├─ "A Shrine for Wishes" (rank 2) ............................. [T] build   ← the Guild can be built (rank 2)
              ├─ "Umbrella Trouble": Burrow 10 + Lord Karakasa ............. [F/C] crew
              ├─ "Hot Spring Dreams" (rank 3, 30 villagers) ................. [T] build
              ├─ "Oni's Kitchen Nightmare": Burrow 15 + Gorobei ............ [F/C] crew
              └─ "Nine Tails of Moonlight": Burrow 20 + Tamamo ............. [F/C] crew (Deep Burrow T1: own clear only)

ZONES (each zone, in order: Bamboo → Maple → Tidepool → Onsen)
 the zone opens: a hero at its level (any hero, crews level them), or the previous zone's dungeon
   cleared once (by you or by a crew) ....................................... [F/C]
  └─ the besieged village: 3 camps + the captain ............................ [F/C] crew: "Relieve <village>"
      │   (camps you broke stay broken; the crew's objective shrinks with them)
      └─ the village is SAVED → the zone turns peaceful (2 wild areas stay) .. automatic
          ├─ the zone's hero joins in the now-calm zone (Poe / Floofy / Foosy)  [T] visit (scene; no fight)
          ├─ 6 villager quests, objectives in the zone dungeon .............. [F/C] crew per objective; the turn-in
          │                                                                      talk is always yours [T]
          ├─ the zone dungeon's first clear (2 floors + the boss) ........... [F/C] crew: "Clear the <dungeon>"
          │   └─ opens the next zone ......................................... automatic
          │   └─ wakes the Spirit Lantern (Tier 1 opens) ..................... automatic, either path
          │   └─ the boss unique ............................................. [F] own first clear only
          └─ scavenging nodes, dig spots, the zone's shops and specials ..... [T]

ENDGAME
 tier runs T1–T5, the Spirit tiers, the pinnacle (the Four Seasons) ......... [F] only
```

## 3. Every place the story needs combat today, and its cozy route
The routes are meant to feel **earned**: each needs a crew strong enough, supplies packed from your own kitchen, and
for the bigger ones a town milestone. None is a free skip.

### 3.1 The Blossom Hollow story (`world/story.js` QUESTS)
| Quest (step) | Today | Cozy route | Gate (town) | Notes |
|---|---|---|---|---|
| `burrow1` "Something Squishy" (kill 8, collect 3 mochi) | Burrow fight | **[C] "Peek into the Burrow"**: Moka (or any benched hero) alone, 2 h, free supplies ("Rosie packs a lunch") | — | The first expedition; the Board guide teaches it (§11). The 3 Mochi Jelly come back with the crew. Rosie asks at the offer: "Go yourself, or ask Moka?" Either works |
| `king` (floor 5, King Mochi) | Burrow fight | **[C] "The King of Squish"**, 6 h | `homes` done (9 homes) | The quest's `unique` → King Mochi's **crown cushion** (trophy) + a rare |
| `umbrella` (floor 10, Lord Karakasa) | Burrow fight | **[C] "Umbrella Trouble"**, 6 h | Blossom Shrine built | Trophy: Karakasa's umbrella stand |
| `oni` (floor 15, Gorobei) | Burrow fight | **[C] "Oni's Kitchen Nightmare"**, 8 h | Hot Spring built, 30 villagers | Trophy: Gorobei's cleaver plaque |
| `tails` (floor 20, "Calm Tamamo") | Burrow fight | **[C] "Nine Tails of Moonlight"**, 10 h (overnight) | Guild level 2, village rank 4 | Trophy: Tamamo's moon lantern. The crew's success **wakes the Burrow door's Lantern** (the Deep Burrow's T1 opens, as for a zone dungeon); its runs are hands-on |
| Villager requests: the "defeat 10–20 yokai" template (`story.js` ~460) | Burrow fight | Half of those rolls become a **scavenge request** ("bring 6 driftwood and a shell"); a kill request can be declined with no loss of hearts | — | Keeps the request rate the same for both paths |
| The quests' `skillPts` rewards | Burrow boss quests | Kept on the crew route | — | Skill points are progression, not a prize |

The `burrow1` combat lesson moves: a player who goes in still gets Shadow's fight tips and the charge guide; a player
who sends Moka gets the Board guide. Both meet the other later (§11).

### 3.2 The zones (`regions/village/*`, `dungeon/zoneRun.js`, `world/zoneQuests.js`)
| Beat | Today | Cozy route | Gate (town + supplies) |
|---|---|---|---|
| **The siege** (3 camps, cages, the captain's ward, the captain) | Fight in the village | **[C] "Relieve <village>"**, 6 h. Its power scales with the camps still standing (each broken camp −25%; the captain is the last 25%). On success: the camps fall, the cages open, the captain is driven off ("Captain Galeclaw flees into the Depths!"), `saveVillage` with `savedBy: 'crew'`, `village:saved` | Takemori: the Guild built, or 2 heroes in the crew. Akane: rank 3. Shiokaze: rank 3 + Guild L2. Yukimi: Guild L3. Each: 1 meal pack per crew member |
| **The celebration** | Plays live when the captain falls | Plays on your **next arrival** in the zone (`zones[z].celebrate`): arriving at the Waypoint Shrine, the crew stands in the square with the villagers, the overlays grow in, everyone cheers. The crew's heroes then go home | — |
| **The zone's hero joining** (Poe in Bamboo, Floofy in Maple, Foosy in Onsen) | Any visit while not joined, once `calm()` (nothing chasing within 13 m) | **No change needed.** The scenes need no fight, only a calm moment. In a saved, peaceful zone they always get one. While besieged, the Travel Map card says "Under siege: yokai on the trail" so a cozy player knows to send the relief first | The zone is open |
| **Villager quests** (6 per zone, objectives in the zone dungeon) | `dungeonFloor`, `find` (champion / unique / chest), `rescue` (behind a guard pack), `kill` N, `boss` | **[C] one objective per step**, 4 h each ("Find Chiku's Ledger", "Bring Kome home", "Teach 12 Kamaitachi manners"). The crew returns with the quest item or the rescued villager (they walk home to the village). **The turn-in talk stays yours** | The village saved (as now), the quest's prereqs |
| **The zone dungeon's first clear** | Both floors + the arena boss | **[C] "Clear the <dungeon>"**, 10 h (overnight). On success: `zones[z].dungeon.crew += 1`, the next zone opens (`openedByPrev` reads `dungeon.cleared > 0 || dungeon.crew > 0`), the Travel Map stamps 救 (relieved) instead of 踏破, and any active quest's `dungeonFloor` / `boss` steps for that dungeon tick | Village saved; Bamboo: rank 2; Maple: Guild L2; Tidepool: rank 4; Onsen: rank 4 + Guild L3. Supplies: 1 meal pack per member + 2 heart potions |
| **The Spirit Lantern** (Tier 1) | The first clear | **A crew's clear wakes it too** (the owner's pick): `recordDungeonClear`'s tier side runs (T0 counts as cleared for the tiers, T1 opens, `tier:unlocked` fires, the Lantern lights live). Every tier run is hands-on | — |
| **The boss unique** (Gale Feather, Trick Leaf, Black Pearl, Frost Cord) | The first clear | **Not on the crew route.** It waits for your own first clear, which still counts as "first" (`dungeon.cleared` stays 0 until you clear it yourself). If that first own clear is a tier run, the existing rule in `tierRun.js` (a tier run that is the dungeon's very first clear also gets the boss unique) already pays it. The crew brings the boss's **trophy** instead (Tengu's fan on a stand, Danzaburō's leaf sake jar, Umibōzu's sea lantern, Yuki-onna's frost mirror) | — |
| **The zone level gates** (Bamboo 4, Maple 11, Tidepool 18, Onsen 26) | Hero level from kills | Crews give their heroes XP (§4.6); the gate reads the highest level of **any** hero (`regions/index.js regionUnlocked`), so it opens on a crew's levels | — |

### 3.3 Levels without fighting
- **Crew XP**: every hero in a returning crew gets the objective's XP (§4.6). The catch-up rule (double XP more than 2
  levels behind) applies to them too.
- **Homestead XP for the hero you walk with** (small, so a cozy player isn't stuck at level 1 in town): a harvest 3 ×
  the crop's days, a fish 4–12 by rarity, a dish cooked 4, a building placed 8, a gather node 1, a dig 4, a delivered
  request as now. Each is × (1 + lvl / 10), so it keeps pace slowly. Toasts reuse the existing "+N xp" float.
- **Joining heroes** already arrive at the pack's level − 2 (`prepareJoin`).

## 4. Expeditions
### 4.1 The Expedition Board
- **Where**: a big noticeboard beside the **Wayfarer's Post** at the west end of Blossom Hollow (`world/travelPost.js`;
  the board is a new kit piece there), from the first day. Once the Adventurers' Guild is built, a second board hangs
  inside its door; both open the same panel. F / A / tap.
- **The panel** (`ui/expeditions.js`, centre, about 1010 px like the Spirit Lantern):
  - **Left: the objectives**, in three tabs:
    - **Story**: the crew routes of the current story steps (§3), each with its quest's title and the giver's portrait;
    - **Village quests**: the zone quests' dungeon objectives that are active;
    - **Errands**: 3 short, repeatable jobs a day per open area (§4.7), the cozy way to level a crew and earn materials.
  - Each objective card: the name, the place (with the zone colour), the duration ("about 6 h · back by evening"),
    the **power needed**, the town gates as a checklist (✓ Guild built, ✗ 28 villagers: 21 now), the supplies, and the
    rewards (XP, a material row, "a trophy", the story beat).
  - **Right: the crew**: cards for every benched, joined, rested hero and every rested hire, with their power. Click (A,
    tap) to add or remove. Up to 4 members (5 at Guild level 3). The crew power bar fills against the objective's need,
    with the odds in words (§4.3) and the supplies picker (meal packs from the Pantry, potions, coins for hires).
  - **Send off!** names the crew and the return time. Locked gates and a crew below the minimum grey it out with the
    reason.
  - **Away**: a third view lists the crews out (a progress bar, "back in about 2 h"), and **Reports** the crews back
    (§4.5). Unread reports put a "!" on the board and on the HUD chip.
- Mouse, pad (padNav entries: LB / RB the tabs, A add / remove / send, Y "best crew", X "clear"), touch and phone (two
  columns as the Lantern: the objective on the left, the crew scrolling on the right; 44 px targets, 12 px text).

### 4.2 Crew power against the objective
- **A hero's power** = 10 × level × (1 + 0.02 × gear points), where gear points add up the equipped slots (normal 1,
  magic 2, rare 3, unique or set 4; at most 36, so ×1.72).
- **A hire's power** = 6 × level × morale (0.85–1.15) × (1 + 0.05 × Guild level). Level for level, a hero is about 1.5×
  a hire.
- **Bonuses**: a class that suits the objective +15% (a Guard on a siege, a Scout on a "find", a Healer on a rescue,
  §5.2); fed (every member has a meal pack of tier 2+) +10%; up to 3 heart potions +3% each.
- **An objective's power** = its level × a kind factor: errand 6, quest objective 9, Burrow boss 12, siege 14, dungeon
  clear 18. The level is the content's: the Burrow floor's, or the zone band's low end + 2 (siege) or + 4 (dungeon).
  - A few anchors (to be tuned by `tools/expedition-sim.mjs`):

    | Objective | Level | Power | A crew that makes it "good odds" |
    |---|---|---|---|
    | Peek into the Burrow | 2 | 12 | Moka L1 alone |
    | The King of Squish | 5 | 60 | Moka L4 + one hire L3 |
    | Relieve Takemori | 6 | 84 | Moka L6 + a Guard hire L4 |
    | Clear the Bamboo Depths | 8 | 144 | Moka L8 + Poe L6 |
    | Relieve Akane Hamlet | 13 | 182 | two heroes ~L9 |
    | Clear the Maple Roots | 15 | 270 | three heroes ~L9, or two ~L12 + a hire |
    | Clear the Onsen Caverns | 30 | 540 | three heroes ~L17, fed |

- **The ratio** r = crew ÷ objective:
  - r < 0.6: **"Too risky"**. Can't send ("They'd never make it. A stronger crew, or a few more levels?").
  - 0.6–0.85: **"Risky"**. 0.85–1.1: **"Good odds"**. ≥ 1.1: **"Sure thing"**.
  - Success chance p = clamp((r − 0.5) / 0.6, 0, 1): r 0.6 → 17%, 0.85 → 58%, 1.1 → 100%. The panel shows the word, and
    the percentage on hover / in the tooltip.

### 4.3 Success, partial success and setbacks (cozy: nobody is hurt, nothing is lost)
- **Success**: the objective is done; full rewards.
- **Partial** (a failed roll at r ≥ 0.75): progress is kept and the crew needs **another try**. A siege: camps broken =
  round(3 × r) − 1 (at least 1). A dungeon clear: "made it to floor 2" (the next try needs 30% less power). A find /
  rescue: "found the trail" (the next try is "sure thing" at r ≥ 0.9). Half the loot; full XP.
- **Setback** (a failed roll below 0.75): "came back muddy and tired". No progress, a third of the loot, half the XP.
- **Tired**: after a partial or a setback, the crew rests **6 game hours** (hires and heroes). A tired hero is home in
  town, playable and switchable as usual; only another expedition waits. A meal or a soak at the Hot Spring / the
  Yukimi Bathhouse cures it at once.
- **Supplies** are spent on any outcome (they ate the lunches). Nothing in the bag or on a hero is ever lost. There is
  no permadeath and no injury.

### 4.4 In-game time
- **The world clock** (`src/cozy/clock.js`, `state.cozy.clock.h`): game hours of play, at the day clock's rate (24 h in
  14 real minutes, so **1 game hour ≈ 35 s**), in **every mode**: village, interiors, regions, dungeons. It stops when
  the game is paused (menus, dialogue, the pause card), like the day clock.
- **Sleeping** (`world/services.js`) adds the hours it skips (to 6:30) to the world clock, so "send them in the
  evening, sleep, they're back in the morning" works.
- The village's day clock is left exactly as it is (it still only moves in the village), so the farm, income and shop
  days are untouched. The world clock is separate and only ever goes up.
- **Time away counts** (the owner's pick, §14): see §4.4.1.
- **Durations** (game hours → real time): an errand 2–3 h (1–2 min), a quest objective 4 h (~2.5 min), a Burrow boss
  or a siege 6 h (~3.5 min), a big Burrow boss 8 h, a dungeon clear or Tamamo 10 h (~6 min, or one sleep). A Scout in
  the crew takes 15% off.
- **Shown** as "about 6 h" and, in the village, "back by evening" / "back by morning" from the village clock.

#### 4.4.1 Time away (offline catch-up)
- **What it is**: real time while the game is closed (or its tab hidden, when the game loop stops) turns into world
  hours at the in-game rate (1 game hour per 35 real seconds), **capped at `OFFLINE_CAP_H = 8` game hours per absence**
  (a tunable constant in `src/cozy/clock.js`; 8 h is about 4.7 real minutes, so any absence longer than that gives the
  full 8 h).
- **How it's measured**: every save (the 30 s autosave, `pagehide` / hidden, Quit) writes `state.cozy.clock.wall`, the
  wall-clock time in ms, as the **largest value it has seen** (it never goes back). On load, and when a hidden tab
  becomes visible again: `away = now − wall`; `hours = clamp(away / 35 000, 0, OFFLINE_CAP_H)`.
- **Tamper guards**:
  - a clock set **backwards** (now < wall) gives 0 hours, and `wall` stays at its high-water mark, so winding the clock
    back and forward again earns nothing until real time passes that mark;
  - a clock set far **forwards** only ever hits the cap (8 h), and the high-water mark moves to that future time, so
    setting it back afterwards earns nothing until real time catches up;
  - a reload measures only the real time since the last save, so quick reloads give only seconds.
- **What it advances, and nothing else**:
  - **expeditions** (crews out finish and resolve; their results and the hold rule apply as in §4.5);
  - **hires' wages and morale** (wages accrue per 24 world hours, §5.2; tired timers run down; morale drifts back
    toward 1.0 at rest);
  - **node refills and dig spots** (§7.2: a world day crossed refills the nodes).
  - **Not**: the village day clock and hour, the farm, the garden and crops, villager or NPC state, shops, income, meal
    timers, fishing. The world is not simulated while you're gone.
- **The "While you were away…" card** (`ui/awayCard.js`), shown once after load (on the first calm moment back in the
  game) when anything happened: how long you were away and how much game time that counted ("You were away 3 h 12 min.
  8 game hours passed, the most an absence counts."), each crew that came home (its outcome and a "See report" link to
  the board), wages paid and any hire whose morale changed, and "The driftwood has washed back up" for refilled areas.
  One button: "Welcome back!". With nothing to say, no card.

### 4.5 A crew coming home
- **The return**: a toast ("Moka's crew is back from the Bamboo Depths!"), the board's "!", the HUD chip, a stinger.
  In the village, the crew walks in from the Wayfarer's Post and waves (heroes and hires as their villagers).
- **The report** (the board's Reports view): a short card in the giver's or the crew's voice, one line per member
  ("Poe: I was very stealthy. Mostly."), the outcome, the loot row, the XP, and "Read it to Rosie" for the story ones.
  Loot goes straight to the bag / materials / pantry; if the bag is full, the items wait in the report until there's
  room ("Take all").
- **Results that change the world** apply at once: the quest step, `saveVillage`, the zone unlock, the dungeon count.
  **One exception**: if you are inside that zone when its relief crew returns, the result **waits** until you leave
  the zone ("Your crew is camped at the edge of Takemori, they'll move in when you step back"). Any camps you broke in
  the meantime count. The celebration then plays on your next arrival.

### 4.6 Rewards
| Objective | XP to each hero | Coins | Items | Materials | Other |
|---|---|---|---|---|---|
| Errand | as ~15 kills of its level | small | none, 10% a magic | **the main source**: 6–14 of the area's materials (§7.2) | forage, a furniture find at 8% |
| Quest objective | as the quest's step would cost in kills | ×0.6 of a fight | 1 magic | 4–8 | the quest item or the rescued villager |
| Siege relief | as clearing the 3 camps + the captain | ×0.6 | 1 magic + 1 rare | 10–20 incl. the zone's specialty | the village saved |
| Dungeon / Burrow boss clear | ~60% of a hands-on clear | ×0.6 | 2 magic + 1 rare (no uniques, no gems) | 16–30 | the trophy, the zone unlock |

- **Hires** get the same XP against their own (gentler) curve.
- **No uniques, no gems, no endgame drops** ever come from a crew: those are the fighter's.
- **Trophies** are furniture (`home/furniture.js`, decor only, Home Rating tags) and become the cozy path's collection:
  4 Burrow bosses + 4 zone bosses + 4 captains (the relief brings back the captain's banner: "Galeclaw's torn banner").

### 4.7 Errands (the repeatable cozy loop)
- 3 a day per open area (Blossom Hollow's outskirts, the Burrow's upper floors, every saved zone), re-rolled on each
  world day, seeded by the day. Examples: "Driftwood on the far shore" (wood, stone), "Burrow patrol: floors 1–4"
  (bone, mochi), "Silk-moth season in the grove" (silk, bamboo shoots), "Sea-glass hunt at low tide" (crystal),
  "Lantern parts from the old shrine path" (lantern).
- Power 6 × level, no town gates, 2–3 h, supplies optional (a meal makes them "sure thing"). They're how a crew levels
  between story steps and how materials keep flowing while you farm.

### 4.8 A hero who is away
- **Not on the bench**: `HeroManager.bench()` and `next()` skip away heroes; the hero wheel shows their card greyed with
  a backpack badge and "back in about 2 h"; the HUD minis the same. They are not in town (no villager), not in the
  Pantry's meal list, and not in scenes.
- **The active hero can't be sent** (you always have someone to play). To send Chewy, switch to someone else first;
  the panel says so on his card.
- If everyone else is away, you play on alone. Tab says "Everyone else is out on an expedition".
- Their gear and level are frozen while away, except for the XP the return brings.

### 4.9 Doing it yourself while a crew is out
- **Allowed, always.** The objective stays playable.
- If **you finish it first** (you beat King Mochi, you break the last camp, you find the ledger), the crew comes home
  early with "You beat us to it!" and still gets its XP and half its loot. The supplies are refunded.
- If **you leave it half done**, your progress counts (camps broken, a quest's kill count), and the crew's need shrinks
  to what's left.

### 4.10 The data
```js
// src/cozy/objectives.js (pure data)
OBJECTIVES[id] = { id, kind: 'errand' | 'quest' | 'burrowBoss' | 'siege' | 'dungeon', name, place: { zone?, dungeon?, floor? },
  level(state), power(state), hours, gates: [{ kind: 'built' | 'pop' | 'rank' | 'guild' | 'quest' | 'saved', ... }],
  supplies: { meals, potions?, coins? }, binds?: { quest, step } | { village } | { dungeon },   // what it completes
  rewards: { xp, coins, items, mats, pantry?, trophy?, questItem?, rescue? }, tags: ['siege', 'find', ...] }
// state.cozy (lazy; normalizeCozy is idempotent)
state.cozy = {
  clock: { h, wall },   // world hours; the wall-clock high-water mark for time away (§4.4.1)
  exp: { active: [{ uid, obj, crew: ['hero:moka', 'hire:h3'], start, hours, power, need, odds, supplies, hold? }],
         reports: [{ uid, obj, result: 'success' | 'partial' | 'setback', loot, xp, lines, read }],
         progress: { [obj]: { camps?, floor?, trail? } }, done: { [obj]: n }, errands: { day, list } },
  guild: { ... },  scav: { ... },  sightings: { day, list },   // §5, §7, §6
}
// zones[z] (rpg/zones.js fillZone): savedBy: 'hero' | 'crew', celebrate, dungeon.crew
// a quest's step done by a crew: quest.crewSteps = [stepIndex, …] (the Journal says "done by Moka's crew")
```
- `src/cozy/expeditions.js` (pure, node-tested): `crewPower`, `objectivePower`, `odds`, `canSend` (gates, supplies,
  minimum), `resolve(rng)` → `{ result, progress, loot, xp }`, `applyResult(state, ...)` (pure state changes). The
  runtime (`expeditionRun.js`) ticks the clock, fires `expedition:sent`, `expedition:back { uid, obj, result }`, applies
  the story effects through hooks the owners already have (`Story.completeStep(quest, step, { crew })`,
  `saveVillage`, `zoneUnlockOnClear`, `freeCage`'s record), and the hold rule.

## 5. The Adventurers' Guild
### 5.1 The building
- `BUILDINGS.guild` (`world/buildings/catalog.js`): **Adventurers' Guild** (冒険者ギルド), `cat: 'special'`,
  `unique`, size 4×3, **village rank 2** (12 villagers), on a civic plot (`plots.js`: `civic-e` / `civic-w` gain
  `'guild'` in `allows`).
  - Level 1: 400 coins, 30 wood, 16 stone, 4 petal (all reachable without a fight).
  - Level 2: 900 coins, 40 wood, 30 stone, 4 silk, 2 lantern (rank 3).
  - Level 3: 1800 coins, 60 wood, 40 stone, 4 crystal, 4 lantern (rank 4).
- **The look**: a two-storey machiya-style hall with a deep eave, a big wooden signboard (a paw crossed with a bone
  and a lantern), a **board under the eave** (the Expedition Board, §4.1), a rack of walking staffs and packs, a
  supply cart. Levels add a lookout and banners. **It's a kit building** (`buildings/` Builder) like the others (the
  owner's pick). The model keeps a `glb` slot, so a Blender centrepiece can come later through the toybox /
  codex-blender pipeline if the owner asks for one.
- **The Guildmaster: Old Hachi** (the owner's pick), a retired Akita adventurer with a walking staff and a map case, a
  Toybox kit villager. Talk: hire, the roster, upgrade, the Sightings board.
- **The interaction**: the door opens the Guild panel (`ui/guild.js`): the roster, today's candidates, the upgrade
  card, and the board.

### 5.2 Hires
- **Generated townsfolk with a class flavour**, using the Toybox NPC kit (`toyKit.js`, `roster.js
  randomVillagerSpec(mulberry32(seed))`, the pattern `zoneVillagers.js` already uses), saved by seed so they look the
  same forever: `{ id, seed, name, cls, lvl, xp, morale, tiredUntil }`.
- **Classes** (a prop and an outfit accent each, from toyKit's accessories):

  | Class | Look | Suits (+15%) | Perk |
  |---|---|---|---|
  | Guard | a pot-lid shield, a headband | sieges | — |
  | Archer | a toy bow, a quiver | dungeon clears | — |
  | Scout | a bandana, a spyglass | finds, errands | the crew's time −15% |
  | Healer | a satchel with a cross-stitched paw | rescues | partial instead of a setback |
  | Porter | a big backpack | errands | +25% materials |

- **Candidates**: 3 a day at the Guild (re-rolled each world day), level near the crew's average − 2. Hiring costs a
  sign-on fee (40 × level coins).
- **The roster cap**: 3 / 6 / 9 by Guild level. A hire's level cap is 10 + 10 × Guild level (20 / 30 / 40).
- **Wages**: 4 × level coins per world day (24 world hours) each, accrued on the world clock (so time away counts,
  §4.4.1) and paid from your coins as they fall due; listed in the morning day banner ("Guild wages −86") and on the
  "While you were away…" card. If the coins run short, unpaid hires lose morale; nobody leaves angry. A hire with
  morale at the floor for 3 days asks to "take a break" (benched, not gone) until paid.
- **Morale** 0.85–1.15: + a success, + a meal pack of tier 2+, + a paid day, − a setback, − unpaid wages. Shown as 1–3
  hearts on the card.
- **Leveling**: from expeditions only, on the hero XP curve × 0.8.
- **In town**: hires are villagers who live near the Guild (they take townsfolk slots: `syncTownsfolk`'s `FOLK_MAX`
  counts them first), wander, sit at the benches, eat at Rosie's. Away hires leave town like heroes.
- **Dismiss**: a kind goodbye; their wage stops.
- Hires never fight beside the player (keeps combat and perf untouched).

## 6. The peaceful overworld
### 6.1 What spawns where
| Zone state | Trail camps (7 a visit) | Siege camps + captain | Wild areas | Chests, shrines, biome POIs | Critters |
|---|---|---|---|---|---|
| Besieged (first time) | yes (as today) | yes | yes | yes | yes |
| **Saved** | **no** | no (as today) | **yes** | yes | yes, plus wildlife glades |

- **The rule** (`src/cozy/peaceful.js`, pure): `RegionMode.start` spawns only the spawns `peacefulFilter(state, zone,
  layout)` keeps: everything while besieged; once `zones[z].village === 'saved'`, only the packs inside a wild area.
- **The emptied camp sites** become **wildlife glades**: the biome's critters get a home there (deer, snow monkeys,
  crabs, squirrels; Onsen's snow monkeys already use the camp sites), and each holds a scavenge cluster (§7). The
  campfire / tent pieces of the region's camp look are not placed there any more.
- **Weather** is unchanged. **Night**: regions have a fixed mood (`mood.night`), and nothing spawns by time of day, so
  nothing changes. The Burrow and the zone dungeons are untouched.

### 6.2 Wild areas
- **Two per zone**, fixed, named, as recipe data: `layout.wild: [{ id, name, jp, at: [x, z], r, packs: 2–3 }]`.
  Proposed: Bamboo **the Kamaitachi Thicket**, **the Fallen Shrine**; Maple **the Scarecrow Fields**, **Old Root
  Hollow**; Tidepool **the Crab Flats**, **the Wreck Shoals**; Onsen **the Snowman Slope**, **the Frozen Falls**.
- **How they're chosen**: off the main trail, on a spur or a side clearing (layoutGen already makes `spurs`), so the
  walk from the Wayfarer's Stone to the village and to the dungeon gate **never crosses one** (a layoutGen check and a
  test-rpg assertion: every trail segment is at least r + 3 m from each wild disc). Each is a disc of r 12–16 m, its
  packs placed inside it per visit.
- **Their monsters**: the zone's kinds at the band's top + 1, ranks rolled hotter (champion 30%, unique 18%), 2–3
  packs; **leashed** to the disc (they won't chase past r + 6 m and walk back), so the peaceful map stays peaceful. A
  wild cache chest in each.
- **Marking**:
  - **in the world**: posts at the entrances strung with a shimenawa hung with red ofuda and a little wooden "yokai"
    sign (a kit piece, `wildMarker`), and a faint violet tint on the ground at the disc's edge; a toast on entering
    ("The Kamaitachi Thicket: wild yokai about!");
  - **on the minimap**: a dashed violet ring with a claw icon (`RegionMinimap.extra`), and the legend in `ui/map.js`;
  - **on the Travel Map**: the zone card gets a row "Wild: the Kamaitachi Thicket, the Fallen Shrine", and a
    sightings dot when one is posted.
- **Layout data rules** (as the village's): the discs go into the plan's `discs` (`kind: 'wild'`, flattened lightly,
  kept clear of POIs) and `ctx.inWild` for populate; a change re-rolls the camp sites (the plan's cache key), which is
  fine (they're per visit anyway).

### 6.3 What changes for players who like fighting
- **The wild areas**, hotter than the old trail camps.
- **The Sightings board** (at the Guild, the Expedition Board and every saved zone village's notice board): 3 a world
  day. Each is a named pack in a wild area: a unique ("Old Kiba, a unique Kamaitachi, prowls the Thicket"), a
  champion pack, or a big swarm. It spawns in that wild area on visits that day, marked with a red pin. The bounty:
  coins (×1.5 of the pack's own), materials, a gem at 25%, and Guild **renown** (cosmetic: a title on the Guild card,
  bounty-hunter furniture).
- **The dungeons' own runs, the tier runs, the Spirit endgame and the pinnacle** are unchanged and fighting-only. (A
  crew's clear can wake a Lantern, §3.2, but every run it starts is yours to fight.)
- **The Burrow** is unchanged (the story floors can be done by crews, but the Burrow itself never empties).
- **Crews for materials**: a fighter can send crews on errands too, and scavenge on the way.

## 7. Scavenging
### 7.1 The interactions (cozy, never a fail)
- **Gather** (tap): walk up, F / A / tap: a short pickup pose (0.6 s, the existing `pickup` pose through
  `life/tools.js run()`), the items pop up with the pickup toast. Fallen branches and culms, loose stones, petal drifts,
  mushrooms, shoots, shells, cocoons, sea glass.
- **Dig** (hold) at **Shadow's dig spots**: when you're within 12 m of a hidden spot, Shadow lifts his nose, trots over,
  paws the ground and sits; a sparkle and a paw mark show (and a paw dot on the minimap). **Hold** F / A / the touch
  context button: a dig ring fills over 1.4 s (the hero digs, Shadow helps); a golden band sits at 70–85%. **Release
  in the band: "Perfect dig!"** (one bonus roll, a sparkle, a pad rumble). Release anywhere else, or keep holding to
  100%, and it still digs up the normal find. Nothing is lost. Settings › Gameplay › Dig: Hold / Tap (tap = an
  automatic normal dig, for accessibility).
- **Tools**: none needed (nothing like an axe or pickaxe exists, and none is required). Two optional upgrades sold at
  the Guild: the **Forager's Basket** (+1 on gather nodes) and **Shadow's Bandana** (the nose range to 18 m, one more
  dig spot a day per area).
- **Touch**: tap the node or the context button; hold it to dig. **Pad**: A, hold A. **Mouse**: click the node to walk
  and gather; hold F (or hold the left button on the spot) to dig.

### 7.2 Nodes per area
Each area has **14–18 nodes** (Blossom Hollow 10–12), grouped round the glades, the trail's edges and the POIs, plus
**2–3 dig spots** a day. Gather nodes **refill each world day** (24 game hours); dig spots **move each day** (seeded by
the day). `state.cozy.scav[area] = { day, taken: [nodeId] }`.

| Area | Gather nodes → materials | Forage (pantry) | Dig spots (Shadow) |
|---|---|---|---|
| **Blossom Hollow** (home, from day 1) | beach driftwood → wood; river stones → stone; sakura drifts → petal; the mulberry by the farms → silk (1 a day) | — | bone; rarely crystal or a lantern part; coins |
| **Bamboo** | fallen culms → wood; mossy rubble → stone; silk-moth cocoons on culms → silk | bamboo shoots, shiitake | bone, an old kunai (coins), lantern parts at the Fallen Shrine's edge |
| **Maple** | fallen branches → wood; terrace stones → stone; pressed maple leaves → petal | chestnuts, honeycomb (honey), shiitake | bone, a lost charm (coins), a lantern part |
| **Tidepool** | driftwood → wood; sea-smoothed stones → stone; net scraps → silk; sea glass in the pools → crystal | seaweed, shells (sell) | bone (old whale bone), a glass float → lantern |
| **Onsen** | snowy pine branches → wood; spring sinter → stone; ice crystals → crystal | shiitake, honey | a snow lantern → lantern, crystal, bone |

- **Mochi** (a material) gets a cozy source too: a cooking recipe **Pound Mochi** (2 rice → 2 Mochi, at the cottage
  stove or Rosie's), besides the farm's daily trickle.
- **Quest items**: a zone quest's `find` item can also turn up from that zone's dig spots once the quest is active (one
  per day at most, a guaranteed spot marked by Shadow), so a cozy player has a second way besides a crew.
- **Art**: each node is a small kit prop (a twig bundle with a ribbon of light, a stone pile, a petal drift, a cocoon
  cluster on a culm, a glinting pool), instanced per kind, a soft sparkle when full, a flattened "taken" state. Budget:
  ≤ 6 extra draw calls in an area, no lights. The 9/10 bar applies at the game camera.

### 7.3 How it feeds construction
- **The targets**: a 5–6 minute sweep of a saved zone gives about 18 wood, 12 stone, 4–6 of the zone's specialty (silk,
  crystal, lantern…), 5 forage and 2 dig finds; Blossom Hollow's daily round about half that. With lumber, the kiln and
  errands, a cozy player can afford the Guild at rank 2 and every building as it unlocks, at a pace close to a
  fighter's (§8).
- **The building costs stay as they are**; only the Guild's are new (§5.1), and its level 1 needs no
  combat-only material.

## 8. The economy, for both paths
**Sources** (✦ = the main source on that path):

| Resource | Fighting path | Cozy path |
|---|---|---|
| Wood, stone | kills, chests, floor-clear caches; lumber, kiln | ✦ gather nodes, errands; lumber, kiln |
| Petal, bone | kills, chests | ✦ home petal drifts and dig spots; errands |
| Silk, crystal, lantern | kills and chests (level-gated: L10 / L15 / L20) | ✦ zone gather nodes, dig spots, errands (no level gate) |
| Mochi | kills (L4+), the farm | the farm, Pound Mochi |
| Coins | ✦ drops, sales of gear | ✦ crops, fish, dishes sold, rent; crews ×0.6 |
| Items | ✦ drops: magic, rare, **uniques**, set, gems | crews: magic and rare only; the Snow Forge; commissions |
| Furniture | finds (drops), shops, the workbench | ✦ trophies, dig finds, errands' finds, shops, the workbench |
| XP | ✦ kills, quests | ✦ crews (benched heroes), homestead XP, quests |

**Sinks**: buildings and upgrades, house upgrades and remodels, the workbench and commissions, potions, the Snow Forge;
**new**: Guild levels, hire sign-on and wages, meal packs (dishes the kitchen makes), the Guild's two tools.

**The balance goal**: neither path is strictly better.
- The fighter keeps everything that makes fighting worth it: uniques, gems, the tiers' loot, the endgame.
- The cozy player gets materials, decor and the story at a similar pace, and pays for it in coins (wages) and food
  (meal packs), which the homestead makes.
- **The pace targets** (`tools/expedition-sim.mjs` checks them, the charge-sim pattern): Takemori saved at about 1.5–2.5
  hours of play on either path; all four villages saved at about 8–12 hours either way; a cozy player is never short of
  a building's materials for more than one world day once its rank opens.

## 9. Save migration
- **New state is additive and lazy** (no version bump; the homestead pattern): `normalizeCozy(state)` (idempotent, a
  type-checked fill, `src/cozy/state.js`) runs at boot after `normalizeZones`; `zones[z]` gains `savedBy`,
  `celebrate`, `dungeon.crew` in `fillZone` (defaults: `'hero'` if saved, `false`, `0`).
- **Zones already saved**: peaceful from the next visit. A one-time toast on that visit ("The yokai have gone quiet
  around Takemori, except in the wild places"), and the Travel Map card shows its wild areas.
- **Zones still besieged** (with some camps broken): unchanged; the relief objective's power counts only the camps still
  standing (`siegeCamps`).
- **Cleared dungeons**: they're own clears (`dungeon.cleared`), so the uniques and the Lantern are as they were.
- **Time away**: an old save has no `clock.wall`, so its first load counts 0 hours away and sets it.
- **Story quests in progress**: steps already done stay done; the crew route is offered for the rest.
- **Heroes mid-expedition** (from this feature on): an expedition is saved with its world-clock start, so a reload
  resumes it. On load, an expedition whose objective no longer exists, or whose crew includes a hero who isn't joined,
  or the active hero (shouldn't happen), comes home at once as a partial with its supplies refunded and a note. A hire
  whose record is broken is dropped from the crew the same way.
- **Old-save QA**: the s21 pattern (an old save reloaded; its pagehide save put back) in the new scenarios.

## 10. UI and controls
| Surface | Mouse and keyboard | Pad | Touch / phone |
|---|---|---|---|
| **Expedition Board** (§4.1) | F at the board; click to add / remove; Enter sends; Esc | A opens; LB / RB tabs; A add / remove / send; Y best crew; X clear; B back (padNav HANDLERS) | tap; two columns on a phone (the objective unscrolled on the left, the crew cards scrolling on the right) |
| **Guild** (§5) | F at the door: Roster / Hire / Upgrade / Board tabs | as the board | as the board |
| **The HUD chip** (`ui/cozyChip.js`) | in `.hud-tr` under the run chip: a backpack, "2 crews out · next back in ~1 h", a "!" when a report waits; hover lists them | shown; the pause menu's pad row gets "Crews" (a read-only status view) | shown; tap opens the status view |
| **Hero wheel and minis** | away heroes greyed, a backpack badge, "back in ~2 h"; a click toasts that | the same | the same, in the fitted wheel |
| **Scavenging** | the F prompt ("Gather driftwood", "Dig here"); hold F to dig; the dig ring at the hero | A / hold A; rumble on a perfect dig | tap / hold the context button or the node |
| **Wild areas** | minimap dashed violet ring and claw; world posts; entering toast | the same | the same |
| **Sightings** | on the boards; a red pin on the minimap and a dot on the Travel Map card | the same | the same |
| **Reports** | the board's Reports tab; Journal tab "Crews" (the log) | the same | the same |
| **"While you were away…"** (§4.4.1) | a centre card after load; "See report" links; Enter / Esc closes | A / B | tap; fitted to the phone's safe area |

No new global hotkey: the board and the Guild are places. All text ≥ 12 px on a phone, targets ≥ 44 px, safe areas
respected (the CT-5 / CT-6 rules), the itch inset for the chip.

## 11. Tutorials (how a new game introduces both paths)
- **Rosie's welcome** gets one line: "Some folks march into the Burrow with a sword. Others send a friend with a packed
  lunch and keep the kettle on. Both help!"
- **The `burrow1` offer** asks: "Go yourself, or send Moka?" Both start the same quest.
  - **Go yourself**: as today (Shadow's fight tips, then the charge guide after the trip).
  - **Send Moka**: the new guide **"The Expedition Board" (Shadow)**: an arrow to the board; the objective card
    spotlit; Moka's crew card spotlit; Send off; the HUD chip spotlit ("back in about 2 hours, let's dig while we
    wait"); then it hands over to the scavenging guide; when Moka's crew returns, the report is spotlit and Rosie's
    turn-in.
- **"Shadow's Nose" (Shadow)**, after the house tour (or right after the Board guide): a gather node (driftwood), a
  dig spot (hold, the golden band), the HUD materials.
- **"The Adventurers' Guild" (Old Hachi)**, when the Guild is first built: hire a candidate, the roster card (power,
  class, morale, wage), a crew of two, the wages line in the morning banner.
- **"Peaceful paths" (a Shadow tip, not a guide)**, on the first visit to a saved zone: "It's quiet now! The wild
  places are still wild: look for the red ofuda." The minimap legend is spotlit for 3 s.
- **The other path, later**: a cozy player who first enters the Burrow gets the fight tips and the charge guide as
  today; a fighter who first opens the board gets the Board guide as an offer card.
- **Old saves**: each new guide is offered once through the director's `past(G)` (TUTORIALS.md).
- Guides are data in `world/guides.js`; s16's guide count goes up by 3.

## 12. The tech plan and file ownership
New code lives in **`src/cozy/`** (pure modules node-tested in `tools/test-rpg.mjs` "COZY") and new UI files.
Shared files get **small, surgical hooks**, each owned by one phase.

| Module | What | Pure? |
|---|---|---|
| `src/cozy/clock.js` | the world clock, the sleep hook, time away (`OFFLINE_CAP_H`, the high-water mark, `awayHours(state, now)`) | yes |
| `src/ui/awayCard.js` | the "While you were away…" card | no |
| `src/cozy/state.js` | `normalizeCozy`, accessors (`cozyOf`, `heroAway`, `guildOf`, `scavOf`) | yes |
| `src/cozy/objectives.js` | the objective table, story bindings, errands | yes |
| `src/cozy/expeditions.js` | power, odds, gates, `resolve`, `applyResult` | yes |
| `src/cozy/expeditionRun.js` | the runtime: tick, return, hold rule, the world effects, the crew's walk-in | no |
| `src/cozy/peaceful.js` | the spawn filter, wild-area helpers, sightings | yes |
| `src/cozy/scavenge.js` | node tables per area, yields, respawn, dig rolls | yes |
| `src/cozy/scavengeWorld.js`, `scavengeModels.js` | node placement, instanced meshes, the interactions, Shadow's nose, the dig ring | no |
| `src/cozy/guild.js` | hires: generation, wages, morale, leveling, caps | yes |
| `src/cozy/hires.js` | hires as townsfolk villagers | no |
| `src/ui/expeditions.js` + `.css`, `src/ui/guild.js` + `.css`, `src/ui/cozyChip.js` | the panels and the chip | no |
| `src/world/buildings/guild.js` | the Guild's model | no |
| `tools/expedition-sim.mjs` | the pace and balance sim | — |
| `tools/qa/s31-expeditions.mjs`, `s32-peaceful.mjs`, `s33-scavenge.mjs`, `s34-guild.mjs`, `cozy-shots.mjs` | QA and look review | — |

**The hooks in shared files** (one owner each, re-read before every edit):
- `game.js` (install the cozy runtime, tick the clock in every mode, the time-away catch-up on load and on visible,
  `clock.wall` in `save()`), `world/services.js` (sleep → the clock),
  `rpg/actions.js` (`addXpTo(heroId, n)`; homestead XP), `actors/heroes.js` (`bench()` / `next()` / `spawnBench` skip
  away heroes), `ui/heroWheel.js` (the away card), `ui/ui.js` (register the panels), `ui/padNav.js` (their entries),
  `ui/hud.js` (the chip's slot) — **CZ-1 / CZ-2**.
- `regions/regionMode.js` (`peacefulFilter` at `start`), `regions/layoutGen.js` (`layout.wild` discs, the trail
  check), `regions/biomes/*.js` + `assets/tidepoolTerrain.js` (the `wild` data), `world/minimap.js`, `ui/travel.js`,
  `ui/map.js` (legend) — **CZ-3 / CZ-4**.
- `life/tools.js` (a `dig` hold action), `life/cooking.js` (Pound Mochi), `actors/companion.js` (Shadow's nose
  behaviour) — **CZ-5 / CZ-6**.
- `world/buildings/catalog.js`, `models.js`, `index.js` (DETAIL), `world/plots.js`, `world/village.js`
  (`interactionFor` case, wages in `onNewDay`), `world/buildMode.js` (`RANK_REQ`), `game.js` `syncTownsfolk` (hires
  first) — **CZ-7 / CZ-8**.
- `world/story.js` (`completeStep`, the `burrow1` offer choice, the request template swap), `world/questSteps.js`
  (crew steps), `world/zoneQuests.js` (objective bindings), `rpg/zones.js` (`savedBy`, `celebrate`, `dungeon.crew`),
  `rpg/zoneProgress.js` (`openedByPrev`), `regions/village/village.js` (`crewSave()` and the arrival celebration),
  `ui/travel.js` (the 救 stamp), `home/furniture.js` (trophies) — **CZ-9**.
- `world/guides.js`, `tools/qa/s16-tutorials.mjs`, README — **CZ-11**.

**Interfaces agreed up front** (so the phases can run in parallel):
- `G.cozy = { clock: { h, add(h) }, exp: { send, cancel, list, reports }, guild, scav }`;
- events: `expedition:sent`, `expedition:back { uid, obj, result }`, `guild:hired`, `scavenge:gather { node, area }`,
  `scavenge:dig { area, perfect }`, `sighting:cleared`, `wild:enter { zone, area }`;
- the story side's entry points: `G.story.completeStep(questId, stepIndex, { crew })`,
  `ZoneVillage.crewSave(zone)` (or the deferred `zones[z].celebrate`), `G.story.crewObjectives(state)` (what the
  current story wants: the objectives the board lists under Story and Village quests).

## 13. Phases (the order of work; status in ROADMAP.md §1c)
| Phase | What | Notes |
|---|---|---|
| **A** (CZ-1, CZ-2) | The world clock (with time away and its card), `state.cozy` and its migration; the expedition core (objectives, power, odds, resolve, rewards, the away heroes) with a working first Board panel; the sim | Can start now |
| **B** (CZ-3, CZ-4) | The peaceful-overworld spawn rule; wild areas (data, the trail check, the leash, the world markers, the minimap and Travel Map); the Sightings board | Needs A's state; in parallel with C |
| **C** (CZ-5, CZ-6) | Scavenging: nodes, dig spots, Shadow's nose, the interactions; the node art per biome and home; Pound Mochi | Needs A's clock; in parallel with B |
| **D** (CZ-7, CZ-8) | The Adventurers' Guild building and Old Hachi; hires (generation, roster, wages, morale, leveling, in town) | Needs A |
| **E** (CZ-9) | The story rerouted: Burrow quests, sieges (and the arrival celebration), zone quests, dungeon first clears (the next zone and the Lantern's T1), trophies, the uniques kept for your own first clear | Needs A, B, D |
| **F** (CZ-10, CZ-11, CZ-12) | The UI polish (board, Guild, chip, wheel, reports on every device), the tutorials, the QA scenarios, the pace check, run-all and prod-smoke | Last |

Every phase ends with screenshots at the game camera against the 9/10 bar, its QA scenario in run-all, and
`prod-smoke` passing.

**Existing work it touches**:
- **Z-F (elevation)**: the wild discs and the scavenge spots are recipe data placed relative to the terrain, like the
  village's slots, so Z-F3 / Z-F4's terrace reworks must carry `layout.wild` and the node spots (and Z-F1's height audit
  covers the node placement: `heightAt`, never y = 0).
- **Z-G1 (polish)**: the story beats' polish now includes the crew variants (the reports' lines, the arrival
  celebration), and its balance pass includes the expedition sim's pace targets.
- **R-4**: the "welcome" quest pointer bug sits in the same `story.js` the reroute touches; fix it in CZ-9.

## 14. Decisions (the owner, 2026-10-08) and risks
**Decided** (the questions this design asked, with the owner's answers):
1. **The fighter's prizes on the crew route**: as recommended. A crew never brings the boss uniques, the quest uniques
   or gems; it brings a **trophy** (decor) and a rare. The uniques wait for your own first clear (§3, §4.6).
2. **The Spirit Lantern after a crew clear**: **a crew's dungeon clear wakes it** (Tier 1 opens at that dungeon's
   Lantern; the Burrow door's on a crew's Tamamo). The boss unique and gems still wait for your own first clear. The
   tier runs themselves are always hands-on (§3.1, §3.2, §6.3).
3. **Time away**: **real time counts while the game is closed**, converted at the in-game rate and capped at 8 game
   hours per absence (`OFFLINE_CAP_H`, tunable). It advances only expeditions, hires' wages and morale, and node
   refills; a "While you were away…" card sums it up; a backwards clock gives 0 and a big jump hits the cap (§4.4.1).
4. **The Guild and its Guildmaster**: **Old Hachi**, kit-built for now; a Blender centrepiece later through the toybox
   pipeline if the owner wants one (§5.1).
5. **How wild the overworld stays**: as recommended. 2 wild areas per zone and the Sightings board; the trail camps
   never come back after the save; no toggle (§6).

**Risks**:
- **Saved zones feel empty.** Mitigated by the wildlife glades, the scavenging clusters, the wild areas' markers and
  the daily sightings; checked in the look review at the game camera.
- **Pace.** A crew route that's too fast trivialises the story; too slow and the cozy path drags. `expedition-sim`
  gates the targets in §8; the numbers in §4.2 are starting points.
- **Shared files.** `layoutGen.js` and the biome recipes are also Z-F's; `story.js` and `village.js` are hot. The
  phase split in §12 gives each one a single owner per phase; small Edit-tool hooks only.
- **A result arriving while you're in the zone.** The hold rule (§4.5) avoids mutating a live siege; s31 covers it.
- **Time away.** Clock tampering is bounded by the cap and the high-water mark (§4.4.1); s31 checks a backwards clock
  (0), a forward jump (the cap) and a normal absence, with a stubbed `Date.now`.
- **Perf.** Nodes are instanced and light-free (≤ 6 calls an area); hires take existing townsfolk slots, so the town's
  villager count doesn't grow.
