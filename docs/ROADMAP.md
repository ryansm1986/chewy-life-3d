# Roadmap and objective tracker

**This is the single place that tracks what's in flight and what's next.** Any agent or new thread picking up work:
1. read this file, then the linked design doc;
2. take an objective (set it to `in progress` with your thread and agent);
3. keep its row updated;
4. add a dated line to the log at the bottom when you finish or hand off.

Keep entries short; details belong in the design docs.

Statuses: `todo` · `in progress` · `review` (built, waiting for the director or owner) · `done` · `blocked`
(say on what).

House rules for every objective:
- **Quality**: the 9/10 bar. Look at screenshots yourself, and judge them in the game camera, not just close-ups.
- **QA**: `node tools/test-rpg.mjs`, the relevant `tools/qa/s*.mjs` (add one for new systems), and
  `node tools/qa/prod-smoke.mjs`, with a full `tools/qa/run-all.mjs` at phase ends.
- **Line endings**: preserve CRLF and LF exactly; new files are LF.
- **Git**: commit only when the owner asks.
- **Blender**: all Blender work is done by an Opus agent (the `toybox-character` and `codex-blender` skills); Codex only
  draws concept sheets.
- **Processes**: kill only processes you started (PIDs), never by image name.

---

## 1. Zones: rescue the village, dungeon, tiers (design: [ZONES.md](ZONES.md))

| ID | Objective | Status | Depends on | Notes |
|---|---|---|---|---|
| Z-A1 | **Sprint**: hold Shift +40%, free; drops while attacking or casting; sprint pose; Shadow follows at the hero's speed; attack-in-place moves to Alt+LMB (the owner's pick 2026-10-06, was Ctrl+LMB); the loot labels to a held Z; Settings hold/toggle; README and tutorial text | done | — | ZONES §9, as built §9.1. `src/actors/sprint.js`; s21; look review `tools/qa/sprint-shots.mjs` |
| Z-A2 | **`DungeonDef`**: parameterise `gen.js` and DungeonMode (id, theme, monsters, boss, level, floors, tier, mods, seed); the Burrow becomes `'burrow'`; `G.enterDungeon({ id, floor, tier, mods })`; replace the `!isRegion` gates with `def.kind` | done | — | ZONES §8.1. `src/dungeon/defs.js` (the 4 zone dungeons are 2-floor stubs on Burrow themes for phase C); hooks `src/rpg/zoneMods.js`. s1–s4 green |
| Z-A3 | **Seeds reroll per run**: write `dungeon.runs` and seed per entry, so floors don't repeat | done | Z-A2 | `beginRun`: `state.dungeon.runs` +1 per entry; `?dseed=N` pins (the QA pins dseed=1 = the old floors) |
| Z-A4 | **`state.zones` save state**, with the migration from `state.regions`; events gain `{ zone, dungeon, floor, tier }`; new events `village:saved`, `dungeon:cleared`, `tier:unlocked` | done | Z-A2 | `src/rpg/zones.js`; `state.regions` is a live unsaved view; the old boss count → `zones[id].regionBoss` (needs a decision: see the log) |
| Z-A5 | **Quest steps**: `kill` with zone and dungeon filters; new `find`, `rescue`, `dungeonFloor`, `tier` and `villageSaved` steps; the quest pointer for zone, gate and floor targets | done | Z-A4 | `src/world/questSteps.js` + `Story.placeFor`; phase D emits `quest:find` / `villager:rescued` and sets `mode.gatePos` / `villagePos` / `questMark()` |
| Z-B1 | **A model cache and spawn pools** per monster kind; no per-spawn geometry builds | done | — | ZONES §7.1. Cached geometry per kind × variant, humanoid templates + `cloneRig`, a rig pool, floor-load warm-up; spawns 1–7 ms → 0.1–0.3 ms per monster |
| Z-B2 | **Instanced rendering** for rigid-part monsters (per-instance transform, tint, hit flash, outline) | done | Z-B1 | `dungeon/horde.js`; rings one batch; `?noinst`; proven pixel-identical by `tools/qa/horde-shots.mjs` (only the dust bunnies' fluff differs: 3 cached layouts per variant) |
| Z-B3 | **A spatial hash** for combat queries and monster targeting, separation and alert; no O(N²) | done | — | `combat/grid.js`, `dungeon/crowd.js`; `?gridcheck` compares every query with the old scans (0 mismatches in ~1M) |
| Z-B4 | **AI LOD**, a flow-field buffer reuse, hit and damage-number budgets, sub-stepped fast movement | done | Z-B3 | Damage numbers past 8 plain + 6 crits a frame fold into one "+N" total (the one visible change) |
| Z-B5 | **The horde perf gate**: `tools/qa/profile-horde.mjs`, 150 and 250-monster fights; target p95 ≤ 8 ms at 150; joins run-all | done | Z-B1–B4 | In run-all. Gates on p95 ≤ max(8, same-page floor baseline + 3) with one retry and a machine-load verdict (ZONES §7.1). 150 p95 13.8–23.1 → 6.9–8.1 ms, every hero passes; Poe's gap fixed (`actors/safeClone.js`) |
| Z-C1 | **Zone dungeon kits**: 4 themes (bamboo shrine caves, maple root halls, tidepool sea caves, onsen ice caverns) | done | Z-A2 | **All four built** (checkpoint 2): `bambooCave` (the cave pass approved), `mapleHalls` (~8.5), `seaCave` (~8), `iceCavern` (~8.5) in `dungeon/zoneKits/` (shared passes in `common.js`); dungeon-only monsters Iwa-bōzu, Tesso, Sazae-oni, Akaname (`dungeon/zoneMonsters/`); ZONES §8.2. Polish follow-ups in Z-G1; gate models in Z-D6 |
| Z-C2 | **Two floors plus a boss arena room** (about 30–36 m, round); move the 4 region bosses in and retune them for the arena | done | Z-C1 | **All four**: `dungeon/zoneGen.js` (2 floors, the 34 m arena with one way in), `dungeon/zoneRun.js` (arena seal, objectives, rewards, `def.adds` prewarm); Master Tengu, Danzaburō, Umibōzu (a sea edge in the cove) and Yuki-onna (the whiteout round the hall's lanterns) moved in, each with its `ARENA_TUNE` |
| Z-C3 | **Density**: about 120–160 monsters per floor, packs of 8–16, in cluster formations | done | Z-B5 | **All four**: 125–152 a floor, packs ≤16 in 4–8 m clusters, 2 champion + 1 unique pack; fodder pacing (`zoneRun.js DENSITY`); two variants of each kind a floor; pooled effect looks and telegraphs instanced (`horde.js lookIn`, `gfx/teleBatch.js`): zone fights ~150–200 draw calls a frame |
| Z-C4 | **Dungeon gates** in each zone (sealed until the village is saved), the first-clear rewards, and the next zone unlocking on a dungeon clear | done | Z-C2, Z-A4 | **All four**: `regions/dungeonGate.js` + a look per zone in `regions/gates/` (each with a Blender-model slot), `rpg/zoneProgress.js`, the four boss uniques (Gale Feather, Trick Leaf, Black Pearl, Frost Cord), Travel Map stamp; s22 covers every gated zone |
| Z-D1 | **Zone village hubs** inside RegionWorld: 5–7 authored buildings per zone (Elder, Shop, Inn, Waypoint shrine, plus 1–2 zone specials), a terrace site | done | Z-A4 | ZONES §2, §2.1, §2.2. **All four built**: Takemori Village (bamboo, approved), Akane Hamlet (maple), Shiokaze Port (tidepool), Yukimi Spa Village (onsen, approved); `src/regions/village/` (data, village.js, art.js with the shared waystone, `art<Theme>.js` ×4); the sites are the recipes' `layout.village` (`shore`, `clear` options) |
| Z-D2 | **The siege**: monster camps in the village, caged villagers, the siege captain in the square; saved-state visuals | done | Z-D1 | **All four built**: 3 camps each (one kind + look per camp), 3 cages, the captains (`village/captains.js`): Galeclaw, Strawgrin (crows, scythe), Brineclaw (a coral crab: rampage, ring-wave slam), Frostbelly (avalanche roll, icicle rain); `village:saved`, the celebration, the overlays warped in each building's own frame |
| Z-D3 | **Villagers**: 3–5 named per village (toybox NPC kit), a light VillageLife, dialogue | done | Z-D1 | **All four built**: 5 named + 1 rescued in the dungeon + 3 townsfolk each; the elders' zone stories; `actors/zoneVillagers.js`, `village/talk.js` (a declined offer falls through to the menu) |
| Z-D4 | **Villager quests**: 4–6 per zone, with objectives in the zone dungeon (the Z-A5 steps) | done | Z-A5, Z-C2 | **All four built**: 6 quests each into bambooDepths / mapleRoots / tideCaves / onsenCaverns (`world/zoneQuests.js`), the provider `G.story.dungeonObjectives`; maple / tidepool / onsen wait on phase C's gates for those dungeons |
| Z-D5 | **Reopened buildings work**: the shop stock, the inn (heal and respawn), the waypoint, the zone specials | done | Z-D1 | **All four built**: shop, inn, waypoint everywhere; Ninja Dojo + Craftshop (bamboo), Momiji Tea House (tea sets: Well Fed ×1.5), Fish Market (sell the catch ×1.3) + Boatyard (commissions, a row to the sea cave once its gate exists), Bathhouse (Onsen Glow: `rpg/zoneBuffs.js`) + Snow-ore Smith (forge, re-fold) |
| Z-D6 | **Blender centrepieces** (Opus Blender agent): the Waypoint Shrine hero model (about 1.8 m guardian stone under a small shrine roof, a rune that lights up, zone tints) for all 4 villages; a **dungeon gate per zone** (bamboo spec in ZONES §8.2: a mossy cliff cave mouth 6.5×4.2×3 m framed by the torii, ≤6k tris, `seal` and lantern empties); optionally bespoke siege captains (e.g. Captain Galeclaw). Candidates the helpers flagged: maple (a persimmon drying frame, a chestnut brazier, a Shigaraki tanuki statue, a red parasol set, the hamlet gate); onsen village (the bathhouse karahafu façade, a snow-laden kawara roof kit, a gasshō thatch module, a yukimi-dōrō lantern, the ashiyu foot bath, a kamakura and snow-lantern set); the onsen dungeon gate (it rates 7.5–8 as kit) | todo | Z-C, Z-D | The kit versions work now, with GLB swap-in slots (`data.js WAYSTONE.glb`, `CAPTAINS[id].glb`). Ask the owner about the captains. Candidates from the village art (ZONES §2.2): Akane — a persimmon drying frame, a chestnut brazier, a Shigaraki tanuki, a red parasol set, the hamlet gate, a hiwada tea-house roof; Shiokaze — Funaki's wasen boat, the hull on shear legs, Kaizo's watchtower, the fish kanban + catch set, the anchor monument, a stone-weighted plank roof kit; Yukimi — the bathhouse karahafu façade, a snow-laden kawara roof kit, the gasshō thatch module, a yukimi-dōrō, the ashiyu, a kamakura + lantern set |
| Z-E1 | **Tiers T1–T5** per zone dungeon: level +4 per tier (cap 60), base density and reward scaling | todo | Z-C2 | ZONES §5 |
| Z-E2 | **Modifiers** (`src/rpg/zoneMods.js`), the first 15, with hooks in spawn, monster and mode | todo | Z-A2, Z-B5 | |
| Z-E3 | **The Spirit Lantern UI**: tier select, modifier slots (1/2/2/3/3, Spirit 4–6), a reward summary, Spirit Wicks | todo | Z-E1, Z-E2 | |
| Z-E4 | **The Spirit endgame**: Spirit Tier 1…∞ after all four T5 clears; a pinnacle boss at Spirit 10 | todo | Z-E3 | The pinnacle boss design is TBD |
| Z-F1 | **Height audit**: route the y = 0 constants (`setY(const)`, `Vector3(x, 0, z)`, `openSpotNear`) through `world.heightAt()` | todo | — | Can start anytime |
| Z-F2 | **Elevation nav**: flow-field cell heights with step rules, height-aware line of sight, the same step rule in the player's A*, a robust `mouseGround` | todo | Z-F1 | |
| Z-F3 | **Bamboo rework** with real elevation: terraces, ramps, stairs, cliffs, a bridge and a waterfall, the village terrace, depth layers; the camera-side-steps-down rule; terrain occlusion | todo | Z-F2, Z-D1 | Do Bamboo first, then reuse the recipe |
| Z-F4 | **Maple, Tidepool and Onsen** elevation reworks | todo | Z-F3 | |
| Z-G1 | **Polish**: balance, rewards, story beats, music stings, docs, the full QA | todo | all | Zone dungeon look follow-ups from Z-C: Maple Roots a slightly brighter floor, moss with soft edges and texture, the arena's root crown framed lower; Tide Caves the dark tide channels / basalt shelves that still read as trenches or a flagstone plaza; Onsen's arena snowflake inlay a touch quieter |

**Open owner questions** (ZONES §11):
- the village names and zone specials;
- whether the Burrow gets tiers too;
- the tier count and the Spirit Wick gate;
- the pinnacle boss.

---

## 2. Heroes (in flight)

| ID | Objective | Status | Notes |
|---|---|---|---|
| H-1 | **The samurai Chewy**: the model, rig and integration (the default Chewy) | done | docs/HEROES.md §8 |
| H-1a | Re-export `chewy_samurai` with the outward haori normals; reinstall (`tools/blender/codex/install_rig.py`); drop `doubleSided` from the `chewySamurai` HERO_MODELS entry | done | Round 5: all outer cloth faces out (the `outward_faces` build check); reinstalled; `doubleSided` removed; crests verified with culling on |
| H-2 | **Poe, the pug ninja**: her class, 21 skills, charge, joining scene, guide, s20 | done | docs/POE.md |
| H-2a | Poe's baked rig: install `poe_toy` (done 2026-10-05: round 4b's closed-eye lash fix); remove `pending` on `HERO_MODELS.poeToy` and `FUMA_MODEL`; set palm, back, `fumaMount`, earGain 0.5 and `squint: [0.58, -0.24]`; tune her coat with the samurai shader's darkGrade gate | done | `pending` is gone on both. The GLB fūma shows at its own 0.8 m on the baked rig. The Animator takes a gain per ear (hers stay equal). The coat uses `darkGrade [1, 7, 4, -2, 0.1]`, `darkNeutral 0.85`, `darkFur 1`: lit fur reads `#333036`–`#37333a` in the village. Checked: the face, 24 poses, portraits and the joining scene; s20 and prod-smoke assert `poe_toy` and the GLB fūma. POE.md §8 |
| H-3 | The Burrow's warm key light makes hero fur read orange: an environment grade tweak | todo | Seen on the samurai Chewy and chewy_b |
| H-4 | **The Shih Tzu dark knight** (male, name TBD): concepts → the owner picks → Opus Blender model and rig → the class (a toy-flail melee tree, a dark-dog-magic DoT tree, a third tree TBD), charge tables, joining, the 4-hero wheel | in progress | The owner picked **B "Gloomhowl Warlock-Knight"** (a black-and-white coat, a plum tabard, a teal ghostlight). Blender model task `tools/blender/work/codex/shihtzu-toy/` (plus the flail prop). The class agent starts after zones C and D |
| H-5 | **The Golden Retriever dragoon** (male, name TBD): concepts → the owner picks → Opus Blender model and rig → the class (spear, javelins, dragon-pet trees), charge; **Shadow's dragon whelp outfit plus flying** (only while the dragoon is active: a Blender outfit on the quad rig, wing flaps, a flying companion mode) | in progress | The owner picked **C "Emberleaf Dragon Guard"** (a red-gold coat, emerald scale armour). Blender tasks: `golden-toy/` (plus the lance and javelin props) and `shadow-whelp/` (a re-dress of shadow_toy, locked, plus a mirrored wing prop; rig `shadow_whelp`). The class agent starts after zones C and D |

## 3. Release and other

| ID | Objective | Status | Notes |
|---|---|---|---|
| R-1 | itch.io build: `npm run build:itch` / `test:itch` | done | docs/ITCH.md |
| R-6 | **A small texture leak** on region ⇄ home trips: about 0.7 GL textures a trip (small quads plus two skinned-mesh depth passes); it reproduces with every village off | todo | Found by the zones-D agent; s23 allows ≤ 4 over two trips meanwhile |
| R-5 | **Rebrand to Pawhaven, plus butler pushes** to holiestdiver/pawhaven:html5 | in progress | The rename is done (logo, page, boot, zip, docs; save keys kept). butler is installed. Waiting on the owner's `butler login`, then the first push from 6d53a3b plus the rename |
| R-2 | The saved quality setting applies at boot (grass and detail density follow Settings, not only `?q=`) | todo | Needed before a public itch release |
| R-3 | The X3595 ANGLE shader warning in the AO pass (Windows) | todo | Warning only |
| R-4 | Bugs: the starting "welcome" quest's pointer targets Rosie even inside a region; the s5 village-save test flakes when the home sim grows a building in the 1.5 s after reload | todo | Found by the zones-D agent |

---

## Log
- 2026-10-05: the zones direction from the owner, recorded in ZONES.md and the tracker above. The samurai Chewy is
  integrated (H-1). Poe's class is done (H-2); her rig is in its final fix round (H-2a).
- 2026-10-05: H-1a done (the samurai rig re-exported with outward normals, reinstalled, `doubleSided` dropped). Zones
  phase A (Z-A1–A5) and phase B (Z-B1–B5) started with two Opus agents in parallel.
- 2026-10-05: zones phase A built, in review (Z-A1 to Z-A5, the zones-A Opus agent): the sprint (Shift, +40%, Hold or
  Toggle, the run pose, Shadow pacing, Ctrl+LMB attack-in-place), `DungeonDef` with the Burrow unchanged and four stub zone
  dungeons, per-entry seed rerolls, `state.zones` with the `state.regions` migration and view, the new events and quest
  steps. QA: test-rpg, gen-fuzz, s1–s5, s9–s21 and prod-smoke green; a new s21. Decisions for the director: the region
  boss count is kept as `zones[id].regionBoss` (not `dungeon.cleared`), and Ctrl+W can't be blocked (a fight asks first).
- 2026-10-05: phase A reviewed and marked done by the director. Open owner question: the Ctrl+LMB attack-in-place binding
  vs the browser's Ctrl shortcuts. Next: phase C (zone dungeons) and phase D (zone villages) once the owner answers
  ZONES §11, and phase B's report lands.
- 2026-10-06: zones phase B built, in review (Z-B1 to Z-B5, the zones-B Opus agent): model cache + rig templates and
  pool, instanced monsters and rings (`dungeon/horde.js`, `?noinst`), the crowd grid (`combat/grid.js`,
  `dungeon/crowd.js`, `?gridcheck`: 0 differences in ~1M queries), AI LOD, damage-number "+N" totals, sub-steps, plus
  sprite / VFX / particle / collision fixes the gate turned up. A 150 fight's p95 went from 13.8–23.1 ms to 6.9–9.4 ms
  (250: 25–46 → 9–18 ms), draw calls ~1,100 → ~360, spawns 1–7 → 0.1–0.3 ms per monster; Chewy and Moka pass the 8 ms
  gate on the bundle, Poe is just over, all measured with a game running on the machine. `tools/qa/profile-horde.mjs`
  joins run-all; `tools/qa/horde-shots.mjs` proves the looks (only the dust bunnies' fluff and particles differ). All 21
  QA scenarios, test-rpg and prod-smoke pass.
- 2026-10-06: zones phase B follow-ups, Z-B1 to Z-B5 done (the zones-B Opus agent). Poe's ~1 ms gap was not her
  effects (her p95 draws were already at Chewy's or below): cloning her rig for smoke copies with three's
  `SkeletonUtils.clone` JSON-serialised three objects kept in rig userData, which made V8's `Matrix4.toArray` slow for
  the session (every `Skeleton.update` and `setMatrixAt` 10–20× slower). `actors/safeClone.js` `cloneSkinnedSafe`
  fixes it (poeProps.js; free copies wait outside the scene); `chargeFx.ghost` (Chewy's charged Afterimage) still has
  the trap: a one-line import swap for the charge files' owner. `profile-horde` now measures a floor-alone baseline on
  the same page and gates at p95 ≤ max(8, baseline + 3) with one retry and a machine-load verdict; `horde-shots` fails
  on a near-black shot (the black Burrow frame was the Poe agent's capture script). Final run-all: all 21 scenarios,
  gen-fuzz and the gate pass (150 p95: Burrow 6.9–7.8, region 7.6–8.1 ms on baselines of 6.7–7.5 with a game sharing
  the GPU); test-rpg (+ safe-clone checks) and prod-smoke green.
- 2026-10-06: Z-A1 rebind (the owner's decision): attack-in-place is Alt+LMB, and the loot labels moved from Alt to a held Z
  (Ctrl+Z is still the decorate undo). The Ctrl workarounds are gone: the fight-time "Leave site?" guard and Ctrl +
  game keys blocked from the browser. `core/input.js` now keeps a lone Alt (keydown and keyup) and Alt + any key but F4
  from reaching the browser, and resyncs Alt, Shift and Ctrl from every key and mouse event, so none sticks. The README,
  the Controls panel, ZONES §9.1 and s21 are updated. QA: s2, s9, s16, s20, s21 and prod-smoke.
- 2026-10-06: the safe rig clone (`src/actors/safeClone.js`) is now also used in `src/gfx/chargeFx.js` (`ghost`, Chewy's
  charged Afterimage) and `src/actors/charKit.js` (`cloneRig`: spirit pups, pooled tanuki and fox). No
  `SkeletonUtils.clone` of hero or kit rigs remains. s2, s12, s19, s20, test-rpg and prod-smoke pass. Next: phase C
  (zone dungeons) can start; phase D waits on the owner's answers to ZONES §11.
- 2026-10-06: committed 6d53a3b (the samurai Chewy, Poe, zones phases A and B, the safe clone, the skills, the tracker).
  **Phases C and D started** with two Opus agents in parallel, Bamboo first end-to-end, then the other three zones:
  - **C** (Z-C1–C4): the zone dungeon kits, 2 floors and a boss arena, the region bosses moved in, density, the gate at
    the trail's end (sealed until the village is saved), first-clear rewards, the unlock rule.
  - **D** (Z-D1–D5): the village hubs mid-trail, the siege and captain, the villagers, quests into the dungeon, the
    reopened buildings.
  - **The C↔D interface**: `G.story.dungeonObjectives({ dungeon, floor, zone, tier })` → cage and drop objectives; C
    places them and emits `villager:rescued` and `quest:find`; `mode.questMark(step)`. New scenarios s22 (dungeons) and
    s23 (villages).
  - **Default village names** (the owner may rename): Takemori Village (bamboo), Akane Hamlet (maple), Shiokaze Port
    (tidepool), Yukimi Spa Village (onsen).
- 2026-10-06: zones phase C, **checkpoint 1: the Bamboo Depths end to end** (Z-C1 to Z-C4 for bamboo, the zones-C Opus
  agent; in review). The zone floor generator has 2 floors (the 34 m arena on floor 2 with one way in), objective
  slots and 120–160 monsters a floor. The `bambooCave` kit is built, and so is the dungeon-only Iwa-bōzu. Master Tengu
  moved into the arena and was retuned. The trail's end has the gate (sealed until the village is saved, unsealed
  live). The first clear gives the Gale Feather unique and a rare, and opens Momiji Hollow; old saves keep their
  unlocks. The objectives API is built as agreed with D. QA: s22 (new), gen-fuzz (zone invariants), test-rpg,
  s13/s21 (updated for the boss in the dungeon), prod-smoke (zone case), profile-horde `WORLDS=zone`. ZONES §8.2 and
  ARCHITECTURE "Zone dungeons". Next, after the director's go: Maple, Tidepool, Onsen.
- 2026-10-06: zones phase D, **checkpoint 1: Takemori Village end to end** (Z-D1 to Z-D5 for bamboo, the zones-D Opus
  agent; in review). The village sits mid-trail in the bamboo (`village: { at, r }` in the recipe; layoutGen keeps it
  clear), six buildings round a paved square: Grandma Sasa's House (the elder), the Sasanoha Inn, Chiku's General Store, the Kaze Ninja
  Dojo, the Bamboo Craftshop and the Waypoint Shrine (`src/regions/village/`). Besieged: 3 camps with a caged villager
  each, Captain Galeclaw warded in the square until the last camp falls (boss bar, Gale Rush, Sickle Storm). His fall
  saves the village (`zones.bamboo.village`, `village:saved`): the siege comes down, the lanterns light, everyone comes
  out. 5 named villagers + Kome (freed in the Depths) + 3 townsfolk (`actors/zoneVillagers.js`), the elder's story,
  6 quests into the Depths (`world/zoneQuests.js`, `G.story.dungeonObjectives`). The shop, the inn (rest, and the
  respawn point once saved: `G.zoneRespawn`), the waystone (Travel Map, arrivals at the shrine), the dojo (respec,
  spar, ninja gear) and the craftshop work. A saved village's dressing is baked into the prop chunks. QA: s23 (new,
  32 checks), test-rpg (a quests section), s20 (its walk follows the new trail). Perf: the saved square with 9
  villagers 416 draw calls, CPU p95 7.5 ms (the arrival stone 6.3 ms). ZONES §2.1 and ARCHITECTURE "Zone villages".
  Next, after the director's go: Akane Hamlet, Shiokaze Port, Yukimi Spa Village.
- 2026-10-06: Z-D checkpoint 1 approved: Takemori Village (bamboo) end-to-end, about 8.5/10; s23 32/32. Notes sent: a
  procedural thatch pass. Go for Akane Hamlet, Shiokaze Port and Yukimi Spa. Added Z-D6 (Blender centrepieces) and R-4
  (bugs).
- 2026-10-06: Z-C checkpoint 1 approved: the Bamboo Depths, about 8.5/10 (s22 16/16; the Iwa-bōzu dungeon monster kept).
  Notes: a cave-feel pass on the bamboo kit (enclosure, light shafts, wall dressing). Go for Maple, Tidepool and Onsen.
  The unlock keeps the hero-level path. Gates added to Z-D6.
- 2026-10-06: **new heroes requested by the owner**: a male **Shih Tzu dark knight** (a dog-toy flail, dark dog magic
  with DoTs, spooky-cute tone) and a male **Golden Retriever dragoon** (a dog-toy spear, javelins, a dragon-pet tree;
  **Shadow wears a dragon whelp outfit and flies, only while the dragoon is played**). Names TBD. Codex concept tasks
  `shihtzu-concept` and `golden-concept` (3 options each, varied coats). Tracked as H-4 and H-5.
- 2026-10-06: the owner picked the Shih Tzu **B** (Gloomhowl Warlock-Knight) and the dragoon **C** (Emberleaf Dragon
  Guard). Three Opus Blender builders started: `shihtzu-toy`, `golden-toy` and `shadow-whelp` (model phase; rigs after
  sign-off).
- 2026-10-06 12:26: all 11 Opus agents hit the session limit at about 12:00 (reset 12:20 CT). Resumed: zones C (plus its
  maple, tidepool and onsen helpers) and zones D (plus its 3 village art helpers), each told to resume its own helpers;
  and the shihtzu-toy, golden-toy and shadow-whelp Blender builders. A lesson for later: 11 parallel Opus agents exhaust
  the session budget in a few hours, so stagger big fan-outs.
- 2026-10-06: **renamed to Pawhaven** and set up butler (`npm run push:itch`, target holiestdiver/pawhaven:html5). The
  first release build is the 6d53a3b worktree plus the rename and fonts, and it passes the itch iframe test. It's pending
  the owner's `butler login`.
- 2026-10-06: zones D correction: the village draw-call numbers were counted over 2 frames. Per frame, every village
  square sits at about 170–380, well inside the 450 budget, and the maple trail end is about 240. Akane Hamlet's art is in
  (about 8.5/10, one polish round). Added R-6 (the texture leak).
- 2026-10-06: zones phase D, **checkpoint 2: all four villages** (Z-D1 to Z-D5, the zones-D Opus agent and three art
  helpers; in review). Akane Hamlet (maple), Shiokaze Port (tidepool) and Yukimi Spa Village (onsen) join Takemori:
  each with its own architecture (`art<Theme>.js`), captain, 5 villagers + 1 rescued + 3 townsfolk, 6 quests into its
  dungeon and its specials (ZONES §2.2). The Takemori thatch was rebuilt as tiered kayabuki (approved); Brineclaw got a
  coral-crab look (approved). **Perf correction**: the village tools counted two frames of draw calls; per frame (the
  unit of the REGIONS §4 budget and profile-horde) every square is 160–380 calls (Takemori saved ~206, not the 416
  logged at checkpoint 1), so the maple trail's "430–484" was ~240 and needs no follow-up. Follow-ups: the region ⇄
  home trip itself leaves ~0.7 GL textures a trip with no village (small quads, skinned depth passes) — for the
  region / mode owner; maple / tidepool / onsen quests wait on phase C's gates.
- 2026-10-06: zones phase C, **checkpoint 2: all four zone dungeons** (Z-C1 to Z-C4, the zones-C Opus agent and three
  helpers; in review). The bamboo cave pass was approved: overhanging brows, a dim cool base, warm pools, capped shafts,
  wall clusters. The Maple Roots, Tide Caves and Onsen Caverns are built on their own kits, each with a dungeon-only
  monster (Tesso, Sazae-oni, Akaname), a gate look and its region boss moved into a retuned arena; each got one look
  round, and Maple's and Tidepool's polish follow-ups went to Z-G1. Every outdoor boss clearing is now a gate. Shared
  passes moved into `zoneKits/common.js` (`roofShafts`, `wallSpots`, `kitDecal`); gate looks into `regions/gates/` with
  a Blender-model slot; per-theme boss-intro pulse, per-look seal light, `def.adds` prewarm. Perf: pooled effect looks
  (projectiles, crows, snowballs, icicles) draw instanced with the monsters and flat-floor telegraphs in one batch
  (`horde.js lookIn`, `gfx/teleBatch.js`): the Onsen fight went from up to 396 to ~200 calls a frame, Maple's crow spike
  from ~460 to ~190. ZONES §8.2 and ARCHITECTURE updated. QA: run-all 22 of 24 green with s1, s12 and s22 green on
  re-run (s1 / s12 transient; s22's one miss was Tide Caves' density, fixed: a kind's pack factor at half strength on
  zone floors), profile-horde PASS (machine BUSY, load-aware gate), prod-smoke PASS (every gated zone dungeon).
- 2026-10-06 17:25: the 2nd session-limit stop (about 16:00, reset 17:20). Resumed staggered: zones C (plus its Tidepool
  helper), zones D, shihtzu-toy round 2, and golden-toy round 2 (feedback: the cast head size, the sheet face, fluffy
  ears and tail, deeper emerald). **Held**: the shadow-whelp rig (approved by the owner) until a slot frees.
  - Pawhaven 0.1.0 was pushed to itch (holiestdiver/pawhaven:html5), but itch's processing was still pending at last
    check.
- 2026-10-06: **phase C (zone dungeons) approved and done by the director.**
  - All 4 dungeons are built (Bamboo, Maple, Tide, Onsen), each with a dungeon-only monster (Iwa-bōzu, Tesso, Sazae-oni,
    Akaname), its boss in a 34 m arena, 120–160 monsters a floor, a gate with a GLB slot, and first-clear rewards and
    unlocks.
  - Batching of pooled effect looks and telegraphs added (`horde.js lookIn`, `gfx/teleBatch.js`).
  - QA: run-all 24/24 after re-runs, profile-horde PASS (load verdict BUSY), prod-smoke covers all 4 zone dungeons.
  - The polish follow-ups are in Z-G1.
- 2026-10-06: **phase D (zone villages) approved and done by the director.**
  - All 4 villages are built: Takemori, Akane Hamlet, Shiokaze Port, Yukimi Spa. Each has a siege, a captain, villagers,
    6 quests into its dungeon, and reopened buildings and specials.
  - Squares run at about 160–330 draw calls a frame. s23 48/48, prod-smoke and test-rpg pass.
  - profile-horde failed only under heavy machine load (another game holding up to 88% of the GPU); re-run it on a quiet
    machine.
  - **Zones A–D are complete**, which makes the full loop playable: village → dungeon → next zone. Next: phase E (tiers and
    modifiers) and phase F (elevation).
