# Zones: rescue the village, clear its dungeon, then push tiers (design)

Status: **phase A built** (designed 2026-10-05; sprint and the foundations: §8.1, §9.1). The work is tracked in [ROADMAP.md](ROADMAP.md); this file is the design.

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
- **Tiers**:
  - After the first clear, the gate's **Spirit Lantern** (the modifier device) offers **Tier 1**. Clearing a tier unlocks the next, up to **T5**.
  - Monster level: T0 is the zone band; each tier adds about +4 (capped at 60).
  - Each tier also raises the base pack size, the rare chance and the reward multipliers.
- **Endgame: Spirit tiers.**
  - Once **all four zone dungeons are cleared at T5**, every zone dungeon offers **Spirit Tier 1…∞**.
  - Monster level is pinned at 60. Difficulty grows with stacking multipliers (life, damage, pack size).
  - **Spirit Tier 10** has a pinnacle boss variant.
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
  | Spirit | 4–6 |

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
  | Elemental (fire, frost or zap) | monsters deal +X% as that element | +8% rarity |
  | Warded | monsters +20% resist | +8% quantity |
  | Haunted | spirit ghosts rise from fallen monsters | +12% quantity |
  | Night March | darker, monsters more aggressive | +10% XP |
  | Hard Ground | −30% life and zoom regen for the hero | +10% rarity |
  | Boss's Wrath | the boss has +50% life, +20% damage and a new phase | +20% boss loot |
  | Treasure Trove | +2 chests per floor | — |
  | Cursed Shrines | shrines also curse you | +10% rarity |

  - The total reward shows on the Lantern before entering.
  - Modifiers are **data** (`src/rpg/zoneMods.js`) applied through hooks: the pack count and size in the generator,
    spawn-time stat changes, and run-wide flags.
  - Costs: a tier run costs a **Spirit Wick**, a cheap token from tier clears and drops, so runs feel like PoE maps
    without item juggling. Optional, and tunable.

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
  The `wick` count is shared across zones.
- **Events**: `monster:killed` gains `{ zone, dungeon, floor, tier }`. New events: `village:saved`, `dungeon:cleared`
  `{ id, tier }`, `tier:unlocked`.
- **Quest steps**:
  - `kill` with `zone`/`dungeon` filters;
  - new steps: `find`, `rescue`, `dungeonFloor`, `tier` and `villageSaved`;
  - the quest pointer learns about zone, gate and floor targets.
- **The Lantern UI**: tier select, modifier slots, a reward summary, and the wick cost.
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
  - The shared Spirit Wick count is left for phase E.
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
- Whether the **Burrow** also gets tiers and modifiers, or stays the story and starter dungeon only.
- The tier count (5 proposed) and whether Spirit Wicks gate runs, or tiers are free to run.
- The endgame pinnacle boss: a new boss, or a remixed "all four" fight.
