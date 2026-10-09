# Cozy path: expeditions, the Adventurers' Guild, peaceful zones and scavenging (design)

Status: **designed 2026-10-08; the owner answered §14 the same day** (the decisions are folded in below). **Phase A
(CZ-1, CZ-2) is built** (§13.1); **phase B (CZ-3, CZ-4) is built, in review** (§13.2); **phase C (CZ-5, CZ-6) is
built** (§13.3); **phase D (CZ-7, CZ-8) is built** (§13.4); **phase E (CZ-9) is built, checkpoint 2 in review** (§13.5). The work is tracked in
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
| **The siege** (3 camps, cages, the captain's ward, the captain) | Fight in the village | **[C] "Relieve <village>"**, 6 h. Its power scales with the camps still standing (each broken camp −25%; the captain is the last 25%). On success: the camps fall, the cages open, the captain is driven off ("Captain Galeclaw flees into the Depths!"), `saveVillage` with `savedBy: 'crew'`, `village:saved` | Takemori: the Guild built, **or a crew of 2, or one hero with packed lunches** (the director's call at phase A: the first relief must be reachable with only Moka benched, since Poe joins in Takemori's own zone and the Guild comes in phase D; gates are data in `cozy/objectives.js RELIEFS`, CZ-9 may retune). Akane: rank 3. Shiokaze: rank 3 + Guild L2. Yukimi: Guild L3. Each: 1 meal pack per crew member |
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
- **Gates are data** (`RELIEFS[zone].gates`, kinds `rank`, `pop`, `built`, `guild`, `heroes`, `crew`, `lunches`, `any`), so a later phase retunes them without code. A lone hero with packed lunches can go where a gate allows it; their power alone sets the (often only Risky) odds.
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
- **Their monsters**: the zone's kinds at **clamp(the highest hero's level + 2, the band's low + 2, the band's top + 1)**
  (the director's call at CZ-3: a flat band top + 1 put level-13 packs in front of a level-4 hero), ranks rolled hotter
  (champion 30%, unique 18%: they carry the danger), 2–3 packs; **leashed** to the disc (they won't chase past r + 6 m and walk back), so the peaceful map stays peaceful. A
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

**For CZ-12** (the director, at phase A's review): a relief pays each crew member about +4,300 XP against an errand's
+360 (§4.6: the 3 camps and the captain, worth ~46 kills of the zone's level). That jump is likely what makes the
expedition-only pace fast (Takemori after ~27 real minutes with Moka alone: §13.1); look at it with the pace targets.

**The balance goal**: neither path is strictly better.
- The fighter keeps everything that makes fighting worth it: uniques, gems, the tiers' loot, the endgame.
- The cozy player gets materials, decor and the story at a similar pace, and pays for it in coins (wages) and food
  (meal packs), which the homestead makes.
- **The pace targets** (`tools/expedition-sim.mjs` checks them, the charge-sim pattern): Takemori saved at about 1.5–2.5
  hours of play on either path; all four villages saved at about 8–12 hours either way; a cozy player is never short of
  a building's materials for more than one world day once its rank opens.
- **The Guild's shortcut is intended** (the director, CZ-9): a cozy player who builds the Adventurers' Guild early and
  signs a hire on relieves Takemori in about 75–95 minutes of expeditions, faster than the 1.5–2.5 h target, because a
  hire adds a crew member's power. That speed is paid for (the Guild's 400 coins and its materials, the sign-on fee, the
  daily wages), so it stays; `tools/expedition-sim.mjs` keeps it as a NOTE, not a failure.

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

### 13.1 Phase A as built (CZ-1, CZ-2; 2026-10-08)
The code map is in [ARCHITECTURE.md](ARCHITECTURE.md) ("The cozy path, phase A").
- **The world clock** (`src/cozy/clock.js`): 35 s a world hour in every mode, `dt` 0 while paused (as the day clock);
  sleep adds the hours to 6:30. **Time away**: as §4.4.1, with one change of mechanism: the wall-clock mark is raised
  every frame while the loop runs (so every save carries it), and a loop that stalls for more than 5 s (a hidden tab,
  a frozen window) counts that gap as time away, whichever of the frame and `visibilitychange` comes first. The card
  (`ui/awayCard.js`) shows after a load or a return when a crew came home or is still out, on the first calm moment (no
  dialogue, banner, panel, transition or guide).
- **The state** (`src/cozy/state.js`): `state.cozy` with `v: 1`; `normalizeCozy` at boot. An old save loads with 0 hours
  away. `zones[z].savedBy` / `celebrate` / `dungeon.crew` in `rpg/zones.js`.
- **Objectives** (`src/cozy/objectives.js`): errands (§4.7) for Blossom Hollow's outskirts (level 2), the Burrow's
  upper floors (level 4) and each saved zone (its band + 1), 4–5 templates each, 3 drawn per world day; the four siege
  reliefs as data, with **only Takemori offered** (`STORY_READY`; CZ-9 opens the rest with the story's reroute).
- **The Takemori gate** (the director's call): *the Guild built, or a crew of 2, or one hero with packed lunches*, so a
  cozy player with only Moka benched can relieve it (Poe joins in Takemori's own zone; the Guild is phase D's). Gates
  are data (§4.2).
- **The expedition core** (`src/cozy/expeditions.js`): §4.2–§4.6 as written: power, odds, `canSend`, `resolve`
  (success / partial / setback; 6 h tired), loot (never uniques or gems; a relief: a magic and a rare), XP to benched
  heroes (`actions.addXpTo`, with the catch-up). Not yet: class bonuses and Scouts (hires, phase D), trophies (CZ-9).
- **The runtime** (`src/cozy/expeditionRun.js`): the return, the hold rule (§4.5), "You beat us to it!" (§4.9), "Call
  them home" (no rewards, supplies back), the load audit (§9). A relief saves the village with `savedBy: 'crew'`, frees
  the cages and leaves `celebrate`. The news is a gold ribbon on the relief's report ("Takemori Village is saved!", the
  freed villagers named); the village's own banner plays only on your next arrival in that zone (CZ-9 makes it the full
  scene). No zone or siege banner fires anywhere else. Heroes walk
  off to the Wayfarer's Post when sent and back in when they return.
- **The Board** (`cozy/expeditionBoard.js`, `ui/expeditions.js`): beside the Wayfarer's Post; Story · Errands · Away ·
  Reports (Village quests come with CZ-9); mouse, pad (Y best crew, X clear), touch and the phone's two columns. The HUD
  chip (`ui/cozyChip.js`) and the away heroes in the wheel and the HUD minis.
- **Debug** (the Cozy tab): world hours +1 / +8 / +24, finish every expedition, an 8 h absence, the clock set back a day,
  reset the mark, a sure-thing crew, show the away card.
- **The pace** (`tools/expedition-sim.mjs`, expeditions only): Takemori is relieved after about 27 real minutes with
  Moka alone (Moka ~L8, 10 trips) and about 17 with Moka and Poe; COZY §8's 1.5–2.5 h counts the whole session (building,
  farming, cooking: the lunch needs a crop). Tuning is CZ-12's.
- **QA**: test-rpg "COZY", s31-expeditions (the cozy route end to end on a fresh game with no fighting and no debug
  unlocks), prod-smoke `cozy`.

### 13.2 Phase B as built (CZ-3, CZ-4; 2026-10-08)
The code map is in [ARCHITECTURE.md](ARCHITECTURE.md) ("The cozy path, phase B").
- **The spawn rule** (`src/cozy/peaceful.js`, pure): `RegionMode.build` keeps every spawn while a zone is besieged and
  only the wild areas' packs (and a sighting, and a boss spawn) once `zones[z].village === 'saved'`. The emptied camp sites
  are `layout.glades`: their camp dirt grows back and each biome puts its own flowers there (hostas, spider lilies,
  camellias, morning glories), and the critters that already lived at the camp sites come in greater numbers (deer,
  sparrows and butterflies, hares, crabs), all in their existing batches. The first visit after a save says "The yokai
  have gone quiet around …, except in the wild places" once. Weather, night, the Burrow and the dungeons are untouched.
  A saved zone fields about half the monsters (22–25 against 49–59) and 10–35% fewer draw calls on the trail.
- **The wild areas** (recipe data `layout.wild`; Tidepool's in `assets/tidepoolTerrain.js`), all eight as proposed:

  | Zone | Wild areas (r) | Dressing (each biome's own kit; tall pieces only on the far half) |
  |---|---|---|
  | Bamboo | the Kamaitachi Thicket (12), the Fallen Shrine (12) | culm clumps closing round the rim, scratched mossy boulders; a ruined shrine, toppled stone lanterns, loose steps |
  | Maple | the Scarecrow Fields (14), Old Root Hollow (12) | a furrowed stubble paddy with scarecrows, a drying rack, straw huts; a great crimson maple over a fairy ring of mushrooms |
  | Tidepool | the Crab Flats (14), the Wreck Shoals (13) | open sand with shells, starfish and pebbles; an older wreck, driftwood, a net rack |
  | Onsen | the Snowman Slope (13), the Frozen Falls (13) | snowmen in drifts; a second frozen cascade with ice-crusted rocks |

  `layoutGen` gives each a flattened `wild` disc and a side path from the trail (`entry`: where it meets the rim; the
  recipe's `spur` points steer it, Maple's round the waterfall). **The trail check is enforced**: an area closer than
  r + 3 m to the main trail, or over the village, the arrival or the arena, is dropped and listed in `plan.wildIssues`
  (test-rpg asserts none). The packs and spurs use their own RNG, so the trail camps roll exactly as before. Each visit:
  2–3 packs per area, a golden wild cache on the far side. **The leash** (`cozy/wildWorld.js`): past r + 6 m a wild
  monster gives up, walks back to its spawn spot (round by the entry if it's stuck, healing a little) and settles; after
  14 s still outside it slips home in a puff. `wild:enter { zone, area }` with a toast on entering
  ("The Kamaitachi Thicket: wild yokai about!", once a minute per area), `wild:cleared` when an area's packs are down.
- **The markers** (`cozy/wildMarkers.js`): at each entry a gateway of two weathered posts strung with a twisted
  shimenawa hung with red ofuda and white shide (cloth: they flutter), a red charm on each post and a little "yokai" sign
  (a red oni face, three claw scratches), merged into the region's static prop chunks (no extra draw calls); a soft dashed
  violet band on the ground round each rim (one transparent mesh a zone, alpha at most 0.42). The minimap and the big map
  draw a dashed violet ring with a claw badge, today's sightings as red pins, and phase C's scavenge marks (dig spots as
  paws, quest digs as gold pins, gather spots on the big map); the map legend has them (`LEGEND_REGION`). The Travel Map
  card adds **Trail** (peaceful / under siege), **Wild** (the areas) and **Sighting** rows, and a red dot on the zone's pin.
- **The Sightings board** (`cozy/sightings.js`, pure; `ui/sightings.js`): three a world day (the world clock's day,
  seeded), each in a different wild area of the open zones: a named **unique** with escorts (renown 3), a **champion pack**
  under a named leader (2) or a **big swarm** (2). The pack spawns in its area on that day's visits (kept, leashed, named,
  a red pin). Beaten: the bounty drops where the last one fell (coins 1.5 × the pack's own average, 5–9 of the zone's
  materials, a gem at 25%), renown and its title (Wanderer, Yokai Spotter at 3, Bounty Hunter 10, Wild Warden 25, Legend of
  the Wilds 50), `sighting:cleared { id, zone, area, kind, name, renown, gained }`, and the card's 討伐 stamp. The board:
  beside the Expedition Board at the Wayfarer's Post (`cozy/sightingsBoard.js`, 2 draw calls), every saved zone village's
  notice board, and the Guild's later (`ui.open('sightings')`). Mouse, pad (A on a card's button opens the Travel Map on its
  zone) and the phone (one column, 44 px targets, the 12 px floor). `state.cozy.sightings = { day, list, renown, total }`.
- **Debug** (the Cozy tab, "Peaceful zones and the wild", "The Sightings board"): show wild areas (rim and leash rings),
  go to a wild area, peaceful on a zone (session only), spawn a sighting here (by kind), refresh the sightings, add renown.
- **The interface for scavenging** (CZ-5): `peaceful.js` `wildAreas`, `wildAt`, `inWild`, `isPeaceful`; in a zone
  `G.dungeon.wildAt`, `layout.wild` / `.glades` / `.peaceful`, populate's `ctx.inWild` / `wildAt` / `peaceful` / `glades`;
  `G.peaceful`; `installPeaceful` calls `G.cozy.scav.setWild`.
- **QA**: test-rpg "COZY: THE PEACEFUL OVERWORLD" and "COZY: THE SIGHTINGS BOARD"; `tools/qa/s32-peaceful.mjs` (in
  run-all); prod-smoke `peaceful`; `tools/qa/wild-shots.mjs` (the look and perf review, `--besieged` to compare; shots in
  `tools/qa/tmp/wild/`). s28's walk now starts from a saved zone's village arrival too.
- **Autosave**: `sighting:cleared` deserves an event autosave (a bounty and renown); recommended to R-11's list, not wired
  here. `wild:cleared` and `wild:enter` change nothing saved.

### 13.3 Phase C as built (CZ-5, CZ-6; 2026-10-08)
The code map is in [ARCHITECTURE.md](ARCHITECTURE.md) ("The cozy path, phase C").
- **The rules** (`src/cozy/scavenge.js`, pure): 21 node kinds and five areas as §7.2 (Blossom Hollow 10 nodes: 3
  driftwood, 3 river-stone cairns, 3 sakura drifts, the old mulberry; each zone 16: 6 wood, 4 stone, 3 specialty (Tidepool
  2 silk + 2 crystal), 3 forage (Tidepool 2)), a dig table per area (one roll; a Perfect dig rolls once more; never two
  furniture finds), 2–3 dig spots a world day (+1 with Shadow's Bandana), `state.cozy.scav = { [area]: { day, taken, found,
  dug, quest }, tools: { basket, bandana }, stats: { gathered, dug, perfect, streak, best }, cheat }`. A record from an
  earlier world day is wiped when next read, so the nodes refill, and the spots move, on the world clock; time away
  counts (a day crossed while the game was closed refills them, and the away card says "The driftwood has washed back
  up…" under **Around the island**). **Deviations from §7.2**: there are no chestnut or shell pantry items, so Maple's
  forage is a hollow log with honeycomb and shiitake, and Tidepool's seaweed node adds a few coins for its shells.
- **Placement** (`scavengeWorld.js`): Blossom Hollow's sites are hand-picked (the beach, the river banks, the sakura belts,
  the farms), each nudged to the nearest open spot; a zone's come from fixed slots on its glades (the camp sites, phase
  B's wildlife glades once saved), the trail's edges, the POIs and the arrival (a lattice near the trail as the fallback),
  picked spread out in a fixed order so ids stay put. Nothing within 2.5 m of a wild area (phase B's `wildAreas`), the
  village, the arena or the trail, and **nothing the camera can't see**: a column grid of the scenery (every batched tree,
  clump, prop and roof by its box, merged chunks by triangle) and the heightfield are marched along the camera's line;
  in a zone a spot must be clear from the game yaw (45°), and spots clear from both 45° yaws are taken first; at home
  from both (build mode turns the camera there). About 30–50 ms an area.
- **The look** (`scavengeModels.js`): toy props in the zone kits' language, about a metre across and 0.45–0.9 m tall so
  they stand out of the grass, each with a small taken remnant: the beribboned driftwood bundle, river-stone cairns, a
  sakura drift with fallen sprigs, the mulberry with silk cocoons; dry culm bundles lashed with straw, mossy rubble, a
  broken culm hung with cocoons and a silk moth, shoots and shiitake; maple branches, terrace stones, a leaf heap, a hollow
  log of honeycomb with a bee; bleached driftwood, a sea-stone cairn with a starfish, a net knotted over a rock with
  floats, a rock pool of sea glass with coral, seaweed and shells; snowy pine boughs, rimstone hot-spring terraces, ice
  crystals, a snow-capped stump with shiitake and a honey pot; the dig mound (a paw print pressed in) and the dug hole in
  four grounds. **3 draw calls an area**: one BatchedMesh holds every node, its taken look and the dig spots
  (setGeometryIdAt swaps them), one Points draw twinkles over the full ones (gold over a quest dig), and one instanced
  draw lays **the "you can take this" cue** under every full node and found dig spot: a soft cream ring on the ground
  that breathes slowly (normal blending, alpha ≤ 0.6, drawn 0.4 m nearer than it is so the grass blades round it don't
  hide it, never over the prop or an actor). The same cue for every kind, so the petal drift reads as a node among the
  meadow's own wildflowers. No lights.
- **Future (a grass-mask hook)**: the GPU grass field still pokes a few blades through the lowest props (the drifts, the
  mounds). A per-spot hole in the grass mask (the village's tile texture alpha, a region's grass `allow`) would clear it;
  that's the grass owner's file, not done here.
- **The interactions**: a gather is F / A / tap / a click (the pickup pose through `life/tools.js run`, which may now run
  in a zone); the dig locks control like fishing: the hero shuffles onto the spot's side as the camera sees it, Shadow
  digs across from them, the ring (`ui/digRing.js`) fills over 1.4 s with the golden band at 70–85%, and letting go in it
  is a **Perfect dig** (the bonus roll, a ring burst, a rumble, a touch buzz, a streak count); holding to the end or
  letting go elsewhere is a good dig. A press let go at once (a tap, the touch prompt, a click that walked there) and
  **Settings › Dig with Shadow › Tap** fill the ring by themselves (a good dig). Moving, a hit or leaving cancels with
  nothing lost. **Shadow's nose**: within 12 m (18 with the Bandana) of a hidden spot he lifts his nose and sniffs, trots
  to it, paws the ground and sits; the mound shows with a sparkle and a bark (`scavenge:found`), and phase B's minimaps
  draw it as a paw (`mapMarks()`). Shadow's tips wait while you dig.
- **Quest digs**: an active zone quest's `find` item from that zone (Takumi's heartwood, Nami's sea glass…) turns up in
  one of the day's spots (gold sparkle), once a world day, and counts through `quest:find` with the step's own place.
- **Pound Mochi** (`life/cooking.js`): a starter recipe, 2 rice → 2 Mochi (a material), at the stove or Rosie's oven, and
  what two rice make in "Try a mix". The Cook panel shows "Makes 2 Mochi" for it.
- **The pace** (`tools/scavenge-sim.mjs`, every target met): a zone sweep gives 18 wood, 12 stone, 4.5–6.4 of its
  specialty, 4.5–5 forage and 2.5 dig finds; Blossom Hollow's round 9 wood, 6 stone, 4.5 petal, a silk. With the routine of
  a world day (home, two zone sweeps, one errand, the farm's mochi and Pound Mochi), no building or upgrade (the Guild's
  three levels included) waits more than 0.8 world days for its combat-only materials once its rank opens (the Hot
  Spring's crystal is the longest). Early lanterns and crystal lean on the errands; scavenging alone gives about 0.3
  lantern and 0.4 crystal a day at home.
- **Not here**: homestead XP for a gather (1) and a dig (4) is CZ-9's (`SCAV_XP`); the Guild sells the Basket and the
  Bandana (phase D: `state.cozy.scav.tools`); the "Shadow's Nose" guide is CZ-11's.
- **Debug** (the Cozy tab, "Scavenging"): refill every node, show every node (today's spots, minimap marks for a minute),
  a perfect-dig streak (5 or 20 digs), walk to the nearest node, the Guild's tools on / off.
- **Events**: `scavenge:gather { node, area, kind, mats, pantry, coins }`, `scavenge:dig { area, spot, perfect, streak,
  mats, coins, find, quest }`, `scavenge:found`, `scavenge:refill`. A dig's furniture find autosaves (`core/autosave.js`).
- **QA**: test-rpg "COZY: SCAVENGING"; `tools/qa/s33-scavenge.mjs` (in run-all: placement, occlusion, the gather, the nose,
  the dig on the keyboard, mouse, pad and touch, Tap mode, a cancel, all four zones, a quest dig, Pound Mochi, the away
  line, the debug actions; shots in `tools/qa/tmp/s33-scavenge/`); `tools/qa/scavenge-shots.mjs` (the look review: a
  studio lineup per area, each area at the game camera from both 45° yaws, the nose and the dig); prod-smoke `dig`.

### 13.4 Phase D as built (CZ-7, CZ-8; 2026-10-08)
The code map is in [ARCHITECTURE.md](ARCHITECTURE.md) ("The cozy path, phase D").
- **The building** (`BUILDINGS.guild`, `world/buildings/guild.js`): the Adventurers' Guild, 冒険者ギルド, `cat: 'special'`,
  unique, 4×3 on every level, the civic plots (`civic-e`, `civic-w`), Build mode's `RANK_REQ` 2, the three costs of §5.1,
  `jobs: [2, 3, 4]`, `glb: null` (the slot for a later Blender centrepiece). Kit-built in the village's toy style:
  - **level 1**: a two-storey timber lodge: plaster over a plank wainscot, a deep teal pent eave round the ground floor,
    an irimoya roof with the Guild's crest (a paw on a round plaque) in both gables and a red paw pennant on the ridge;
    the **kanban** (the big walnut signboard: the crest with a bone crossed behind it, a paper lantern at its corner)
    standing on the pent roof; the double door with an indigo paw noren between two red posts hung with paper
    lanterns, a bell, a deck and a step; a wall rack of toy weapons (a sword, a bow, a spear with a pennant) left of the
    door; **crossed toy swords behind a pot-lid shield** on the upper storey's side; a route map on the back wall, a straw
    hat and a gourd on pegs; a lean-to on the right over a rack of walking staffs and two packs; the Guild's own little
    notice board in the yard; a supply cart; a lantern post; a training dummy; a woodpile;
  - **level 2**: + banners at the front corners, bunting along the porch beam, a hanging paw sign on the lean-to;
  - **level 3**: + the **lookout** (a tall timber tower with a ladder, a railed platform, its own roof and the Guild's
    flag), the crests gilded, a third banner.
  About 41–47 k triangles; night: the windows and lanterns glow, two LightPool lamps (no wash). The door is the
  interaction (`village.js interactionFor`: "Enter the Adventurers' Guild" → the Guild panel). **Deviation**: the
  Expedition Board "inside the door" is the Guild panel's **Expedition Board** button (it opens the same board with
  sending allowed, `at: 'guild'`) rather than a second interactable by the door, so the door's F prompt stays the only one
  there; the yard board is dressing. Upgrades use the houses' scaffold (`home/exteriors.js construct`). Bulldozing the
  Guild is refused while hires live there.
- **Old Hachi** (`cozy/hires.js HACHI_SPEC`, a Toybox villager with `toy.extras`): a retired Akita: a red-fawn coat with
  the white urajiro, upright ears, a curled tail, **white bushy brows**, an indigo haori, a **red knitted scarf**, a
  gnarled **walking stick** upright in his right paw (a red cord and a bell on it) and a leather **map case** on his back.
  He minds the Guild's door like Rosie her shop (role `shop`: he sweeps, stands at the counter spot) and sleeps at the
  Guild. His talk (warm and gruff): his first words once ("Hmph. So you're the one who built this old dog a lodge…"), then
  a line for the moment (wages owed, an empty roster, crews out, a glum hire, a full house, or a grumble) and five
  choices: *Show me the adventurers* (the Hire tab), *The Expedition Board*, *Today's sightings*, *About the Guild* (what
  this level gives, what the next brings, his two tools) and *Just saying hello*. His 3D bust is the panel's and the
  dialogue's portrait.
- **The Guild panel** (`ui/guild.js` + `.css`, 960 px): Old Hachi's word, the level, the roster count and the day's
  wages; the **Expedition Board** and **Sightings** buttons; tabs **Hire** (today's three candidates: class ribbon,
  bust, name, level, power, what they suit, their perk or look, the wage, Sign on with the fee) · **Roster** (each hire:
  bust, class, level and XP, 1–3 morale hearts and a word, power, wage, where they are: in town / away with the trip /
  resting / on a break with the owed sum, Pay back, Dismiss pressed twice; the free bunks; the locked ones up to 9) ·
  **Guild** (the upgrade card: the roster, crew size, hire level cap and power bonus now → next, the cost chips with
  what you have, the rank, Upgrade; and *Hachi's odds and ends*: the two tools). Pad: LB / RB the tabs, A on a card's
  button (padNav `START.guild`, `.p-guild button`); phone: two columns (Hachi, the boards and the tabs on the left, the
  cards scrolling on the right), 52 design px targets, the 14 design px floor.
- **Hires** (`cozy/guild.js`, pure; `cozy/hires.js`, in town): the five classes of §5.2 (**Guard**, **Archer**,
  **Scout**, **Healer**, **Porter**; the brief's example names were not used). The class rule: **+15% once a crew** when
  any hire's class suits the objective (by its kind and tags: Guard `siege`, Archer `dungeon`, Scout `find` and
  `errand`, Healer `rescue`, Porter `errand`); a Scout takes 15% off the trip, a Healer turns a setback into a partial, a
  Porter brings 25% more materials. Power `6 × level × morale × (1 + 0.05 × Guild level)` (expeditions.js `memberInfo`).
  - **Candidates**: three a world day (`rollCandidates`, seeded by the world day; three different classes and names),
    level = the joined heroes' average − 2 (±1), capped at the hire level cap; kept in `cand` for the day.
  - **Sign-on** 40 × level coins; the roster cap 3 / 6 / 9; the level cap 20 / 30 / 40; a crew of 5 at Guild level 3
    (`maxCrew`). No two on the roster share a name.
  - **Wages** 4 × level a world day, **settled on the world clock** (`settleWages`: every crossed world day, back pay
    first, in roster order, from the coins; the first wage the day after signing on), so time away counts. The morning
    banner says "Guild wages −N" (`bannerLine`, the coins paid since the last banner); a settle elsewhere toasts it; after
    an absence the lines go on the away card under **At the Guild**.
  - **Morale** 0.85–1.15 (start 1): a success +0.05, a fed lunch (tier 2+) +0.03, a paid day +0.02, a setback −0.05, an
    unpaid day −0.08. **Three days at the floor unpaid** and they take a **break** (benched, still in town, no new wages)
    until their back pay is paid (the roster's Pay button, or the next pay day with coins). A kind goodbye settles what
    it can.
  - **Leveling**: the expedition's own XP (`xpFor`, as a hero's) on the hero curve × 0.8 (`hireXpToNext`), up to the cap;
    `hire:levelup`; the report and the toast name it.
  - **The Board**: hires are crew cards after the heroes (their bust, a class chip, "+15%" where they suit), the class
    bonus beside the odds, the Scout's shorter trip on the clock fact; the reports give each hire a line in their class's
    voice; the HUD chip and the away card name them.
  - **In town**: a Villager each (the Toybox kit, `randomVillagerSpec(mulberry32(seed))` + the class look through
    `toy.extras`: a Guard's headband and pot-lid shield, an Archer's bow and quiver, a Scout's bandana and brass spyglass,
    a Healer's white satchel with a cross-stitched paw and a pink scarf, a Porter's big backpack and bedroll), living at the
    Guild (they wander, chat, sit, sleep there). **They take the townsfolk slots first**: game.js `syncTownsfolk` asks
    `G.cozy.guild.inTown()`, counts them against the population's want (capped at 16) and moves the newest townsfolk out
    while nobody is looking. Sent, they walk off to the Wayfarer's Post; back, they walk in and wave.
  - **Save** (§9): `state.cozy.guild` (`fillGuild`, idempotent, type-checked; an old save gets level 0, no hires); the
    Guild's level is the building's (synced on `village:changed` / `building:levelup`); a crew whose hire left the roster
    comes home on load (`brokenExpeditions`).
- **The tools** (§7.1), sold in the Guild tab from level 1: the **Forager's Basket** (240 coins, 8 wood, 2 silk) and
  **Shadow's Bandana** (320 coins, 3 silk, 4 petal); COZY gave no prices. They set phase C's `state.cozy.scav.tools`
  flags; the Bandana's extra spot shows at once (`G.cozy.scav.redraw`).
- **Debug** (the Cozy tab, "The Adventurers' Guild"): build the Guild now (free, a free civic plot), +1 Guild level, give
  hires (+1 / +3 / fill), max morale, pay wages (a day, or a day with an empty purse).
- **Events**: `guild:built`, `guild:upgraded`, `guild:hired`, `guild:dismissed`, `guild:wages`, `guild:tool`,
  `hire:levelup`. The runtime saves (`G.save`) on a hire, a goodbye, back pay, a tool and each wage day. **Autosave**
  (R-11's list): `guild:hired` and `guild:tool` (coins spent) and `guild:wages` deserve event autosaves if the direct saves
  are ever removed; `guild:built` / `guild:upgraded` already ride `village:changed` and `building:levelup`.
- **QA**: test-rpg "COZY: THE ADVENTURERS' GUILD AND HIRES"; `tools/qa/s34-guild.mjs` (in run-all; shots in
  `tools/qa/tmp/s34-guild/`); prod-smoke `guild`; the look review `tools/qa/guild-shots.mjs` (each level on either civic
  plot from both 45° yaws, `--night`, `--hires`, `--palette`; shots in `tools/qa/tmp/guild-shots/`).

### 13.5 Phase E as built (CZ-9; checkpoints 1 and 2, 2026-10-09)
The code map is in [ARCHITECTURE.md](ARCHITECTURE.md) ("The cozy path, phase E").
- **The Blossom Hollow story** (§3.1): the Board's Story tab offers the fight of the quest being played, from the quest
  data (nothing new in the quest list): **"Peek into the Burrow"** (burrow1: power 12, 2 h, *Rosie packs the lunch*: a
  free lunch that counts as fed, so Moka at level 1 alone is good odds; the 3 Mochi Jelly come home), **"The King of
  Squish"** (60, 6 h, gate: *A Home for Everyone* done), **"Umbrella Trouble"** (120, 6 h, a Blossom Shrine),
  **"Oni's Kitchen Nightmare"** (180, 8 h, the Hot Spring and 30 villagers), **"Nine Tails of Moonlight"** (240, 10 h,
  Guild L2 and rank 4). A boss route: a lunch each, 2 magic + a rare, 16–30 materials, ~60% of a hands-on run's XP, the
  boss's **trophy**; the quest's coins, XP and skill points are paid as ever. A crew's success completes every fight step
  left (`Story.completeStep`, the Journal says "· done by Moka's crew"); **the quest unique is owed**
  (`state.quests.owed`) and paid on your own first win over that boss. A crew's Tamamo wakes **the Spirit Lantern by the
  Burrow door** (the Deep Burrow's T1; the Burrow's deepest floor is untouched).
- **Partial work carries over both ways** (§4.9): your kills in burrow1 and a boss floor you reached shrink the crew's
  need (the floor reached: −30%); a crew's partial leaves half of burrow1's kills done, or the boss quest's floor step
  done ("They made it down to floor 5"), for you or the next crew. You finishing the step first brings the crew home
  ("You beat us to it!") for quests and dungeon clears as for sieges.
- **All four sieges** are on the Board (`STORY_READY`), each with its gate (§3.2, unchanged) and its captain's **torn
  banner** as the trophy. The camps you broke shrink the relief (as phase A). **The celebration on your next arrival**
  (`regions/village/village.js`): the village builds its saved look as a growable group, the crew (heroes as themselves,
  hires as their Toybox villagers) stands either side of you at the Waypoint Shrine, the banner says "… is saved! ·
  Moka's crew drove the siege off", lanterns, bunting and shop fronts grow in, everyone cheers, the townsfolk step out,
  and the crew waves and heads home. It plays once (a reload mid-scene doesn't replay it). The heroes' joining scenes wait
  until it's over. **Deviation**: there is no `ZoneVillage.crewSave()`; the deferred `zones[z].celebrate` (+
  `celebrateCrew`) is the whole interface (§12 allowed either).
- **The zone dungeons' first clears** (§3.2): **"Clear the <dungeon>"** once its village is saved and it has never been
  cleared by you or a crew: power 144 / 270 / 396 / 540, 10 h, a lunch each **and 2 Heart Treats** (required), the gates
  of §3.2. A success: `dungeon.crew` 1, the next zone opens, the Travel Map stamps **救** (a teal stamp; the card says
  "cleared by a crew"), **Tier 1 opens at its Spirit Lantern** (`recordCrewClear`: T0 counted as cleared, `tier:unlocked`;
  the Lantern lights live if you stand by its gate), the dungeon's floor 2 counts as reached, any active quest's boss
  step for it is done by the crew, and the boss's trophy comes home. `dungeon.cleared` stays 0: **your own first clear
  is still the first** (zoneRun's chest with the boss unique and a rare; a first own clear that is a tier run gets the
  unique in its Lantern chest: `tierRun.js clearDrops`, checked). A partial: "made it to floor 2" (−30% next time,
  and your floor 2 counts the same way).
- **Trophies** (§4.6): 12 keepsakes in a new furniture set, *Keepsakes* (記念品), never sold, placed with the decorate
  mode like any furniture (`home/trophyModels.js`): King Mochi's crown cushion, Karakasa's umbrella stand, Gorobei's
  cleaver plaque (wall), Tamamo's moon lantern (a light); the Tengu's fan stand, Danzaburō's leaf sake jar, Umibōzu's sea
  lantern (a light), Yuki-onna's frost mirror; Galeclaw's, Strawgrin's, Brineclaw's and Frostbelly's torn banners (wall
  pieces with a victory rosette). A trophy comes with a success only.
- **R-4** (the welcome pointer inside a region): Blossom Hollow's villagers are pointed at only in the village; from a
  zone the pointer goes to the Wayfarer's Stone, from a dungeon to the way out.
- **The zone villagers' quests** (§3.2; checkpoint 2): the Board's **Villages** tab (shown when any is on offer) lists one
  route per step in the zone dungeon (`zq:<quest>:<step>`, 4 h, power = (the band + 3) × 9, a lunch each): **"Find
  Chiku's Ledger"**, **"Bring Kome home"**, **"Teach 12 Kamaitachi some manners"**, **"Scout floor 2 of the Bamboo
  Depths"**; a boss step gets its own route ("Drive off the boss of …", dungeon power, 8 h) only once the dungeon's own
  first clear is off the Board (that one covers the boss). A success does the step: the quest item comes home with the
  crew, a rescued villager walks home to the village (they live there from then on), a floor reached is noted; **the
  turn-in talk stays yours**. A partial keeps half a count, or "found the trail" (the next try is a sure thing at r ≥
  0.9, §4.3). A Scout suits the finds, a Healer the rescues.
- **The kill-request swap** (§3.1): half of the villagers' "defeat 10–20 yokai" asks come as a gathering ask instead
  (driftwood, river stones, petals, or Shadow's dug-up bones: Blossom Hollow's own gather nodes and digs). "Maybe later"
  never cost a heart, as before.
- **Homestead XP** (§3.3, its numbers as written): a harvest 3 × the crop's days, a fish 4 / 6 / 9 / 12 by rarity, a dish
  4, a building you pay for 8 (the town's own growth: none), a gather 1, a dig 4; each × (1 + level / 10), to the hero
  you walk with, with the "+N xp" float (`cozy/homesteadXp.js`).
- **The pace** (§8; checkpoint 2). **Deviations, tuned by the sims**:
  - **Crew XP** (§4.6) is now a share of a level, not "~15 kills of its level": an errand 0.15, a quest step 0.35, a
    Burrow boss 0.7, a siege 0.8, a dungeon clear 1.0 of `xpToNext` at the hero's own level (or the objective's, when the
    hero is above it), and above the objective's level it diminishes (1 / (1 + 0.5 × the levels above), at least a
    tenth). The relief no longer pays ~4,300 XP against an errand's 360, and a dungeon clear is about one level, never
    two or three in one trip (checkpoint 1's report: Moka +6,850, Poe +14k).
  - **A member far below the objective pulls less** (§4.2): −4.5% of their power a level below the objective's, at least
    30%, so five level-10 hires can't clear a level-30 dungeon (the story sim cleared the Onsen Caverns with level 8–13
    crews before it).
  - **The Burrow's errands go as deep as the story** (§4.7): level 4 (the upper floors) until King Mochi is gone, then
    the floors below each Burrow boss beaten ("Burrow patrol: floors 4–7"), so a crew levels near its own level.
  - **The Guild's candidates** (§5.2): two below the strongest joined hero (a cozy player's Chewy stays low, so the
    average was too low), and at least level 3: a fresh rank-2 Guild's weakest candidate takes a Burrow errand alone at
    Risky or better, a home errand as a sure thing.
  - **The numbers**: `tools/expedition-sim.mjs` (Takemori): Moka alone about 146 min (in COZY's 90–150), Moka and one
    Guild hire from day 2 about 75–95 min (a hire adds a crew member's power; the relief goes with Moka at level 4–5:
    the intended, paid-for shortcut, §8). `tools/story-sim.mjs` (new; the whole story, the Guild growing with the town, a hire a day): Takemori about
    3.1 h (a busy Guild's hires share Moka's errands), all four villages saved at about 9–11 h (COZY's 8–12), the Onsen
    Caverns at about 12.4 h. `tools/scavenge-sim.mjs`: all targets met (its Guild L3 row now reads rank 4).
  - **s37's whole story** (part d, scripted, not optimal play): all four villages saved and all four zone dungeons
    cleared by crews from a fresh game with 0 kills, in 1,585 world hours (15.4 h of the clock; sleeping skips most of
    it), Moka and Poe at levels 23 and 22, nine hires at 11–20, the walking Chewy at 15 from quests and homestead XP.
- **QA**: test-rpg "COZY: THE STORY REROUTED"; `tools/qa/s37-cozy-story.mjs` (a: the headline, a fresh game to the Bamboo
  Depths' crew clear with no fights and no debug unlocks, homestead XP, the request swap; b: the keepsakes in the
  cottage; c: all four sieges and their celebrations; parts a–c in run-all, ~5–10 min. **d, opt-in** (`S37_FULL=1`,
  `run-all s37-full`, ~1.5 h; or `ONLY=d` to replay it from part a's last save, `after-a.json`): the rest of the story
  with no fights: a zone villager's rescue and find by crews, the Guild built and upgraded, the town grown to rank 4
  with painted zones and the player's home upgrades, the other three zones' reliefs and dungeons by crews; shots in
  `tools/qa/tmp/s37-cozy-story/`); prod-smoke `crewclear`; the sims `tools/expedition-sim.mjs`, `tools/story-sim.mjs`.

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
