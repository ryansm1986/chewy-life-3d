# Multiplayer plan: online co-op for Chewy Life 3D

Status: **plan**. Nothing here is built yet except the Phase 0 seams from the hero update (docs/HEROES.md). This
document fixes the architecture before any networking code is written, so every feature added from now on stays
co-op-ready.

## 1. What we are building
- **2–4 player online co-op**, drop-in / drop-out, played with friends (no matchmaking, no PvP).
- Every player controls **one hero** (Chewy, Moka, future heroes). A hero nobody controls stays in Blossom Hollow as a
  villager, exactly like the benched hero today.
- **The host's world**: village, buildings, quests, day/night and the Burrow run are the host's save. A guest brings
  **their own hero** (level, skills, equipment, bag) from their own save, like an "open character" in Diablo 2, and
  takes that progress home.
- One pad of rules for coziness: **no friendly fire**, **personal loot** (each player sees and picks up their own
  drops: no loot races), a **downed teammate can be revived**, and XP is shared by everyone nearby.

## 2. Topology: host-authoritative, peer-hosted
- One player's browser is the **host** and runs the whole simulation, as the game does today: combat, monsters,
  skills, loot rolls, villagers, the village sim. Guests are **thin clients**: they send input and render the
  host's state. There are no servers to pay for, apart from signalling and an optional TURN relay.
- Why not deterministic lockstep: the simulation uses float physics, a variable `dt`, and `Math.random` in combat,
  loot and AI (hundreds of call sites). Making it bit-exact across browsers is not worth it. Host authority tolerates
  all of that.
- **What the guest still builds locally from seeds and snapshots** (the heavy things are never streamed):
  - Burrow floors: `DungeonMode.build()` generates the layout from `generate({ floor, seed: dungeon.seed + floor*17 +
    runs*101 })`, and the dressing uses `mulberry32` hashes. The same `(seed, floor, runs)` gives the same floor on
    every machine, so the host only sends those three numbers. **Rule from now on: floor geometry and dressing must
    only use seeded RNG, never `Math.random`.** QA will check this by hashing the floor on two contexts.
  - The village: rebuilt from `state.village` (the sim's building list) plus `day/hour`, sent once on join and as
    `village:changed` deltas afterwards.
  - Cosmetic VFX, sounds, particles, grass bending, villager babble: local only, triggered by events.

## 3. The seams (what exists, and what changes)
| Concern | Today | Co-op |
|---|---|---|
| Hero roster | `HeroManager` (src/actors/heroes.js): active hero, benched heroes as `Villager`s (`hero: true`), switch transition | + `claims: heroId → playerId`. Switching may only target an **unclaimed** hero. A player leaving releases the claim and the hero walks back into town |
| Hero data | `state.heroes[id] = { player, equipment }`, with `state.player/equipment` live references to the active hero | Host keeps one `heroes[id]` per connected hero. A guest's hero data arrives in `hello` and is written back to the guest on every change (xp, level, loot, equip) |
| Controlled body | One `Player` actor = `G.player`, rebuilt per hero by `Player.setHero` | `G.players[]`: one `Player` body per claimed hero. `G.player` stays **the local player's body** on every machine (camera, HUD, input) |
| Input | `Player.readMoveInput()` and `game.js handleInput()` read `Input` directly (about 30 call sites) | A `Controller` interface `{ move, aim, held(slot), hit(action) }`. `LocalController` wraps `Input`, `NetController` replays a guest's input packets on the host. `Player` and the cast path read only their controller |
| Skills | One `SkillRunner` (`G.skills`) that reads `G.player` / `G.state` / `G.derived` (about 60 references across skillRunner.js and mokaSpells.js) | **One `SkillRunner` per hero body**, constructed with its caster `{ body, state, derived }`. That's mechanical: `this.G.player` becomes `this.P`, `G.derived` becomes `this.D`. Per-hero cooldowns already live in `runner.cds` (HeroManager stashes them today) |
| Stats | `G.derived = computeStats(G.state)` for the active hero | `derivedFor(heroId)`. `computeStats` already takes any `{ player, equipment }` |
| Monsters | Target `G.player` (monster.js) and Shadow | Target the nearest living hero or ally (a `targets()` list in Combat). Threat is kept per hero |
| Damage to heroes | `combat.hitPlayer()` → `G.actions.damage()` on the active hero | `combat.hitHero(body, …)` → that hero's life. A guest's life / zoom are host values mirrored to the guest |
| Shadow | `G.companion` follows `G.player` | Follows the **host's** hero (one Shadow per world). Later maybe each hero's own pet |
| Dialogue / menus | Pause the Burrow while open (`frame()` sets `dt = 0`) | No global pause online. The Burrow never pauses. A player in a dialogue or menu is **"busy"** (a speech bubble over their head, briefly invulnerable only in the village). The pause menu becomes an overlay |
| Mode changes | `enterDungeon` / `returnToVillage` with the iris transition | Party-wide. See §6 |
| Save | `localStorage['chewy3d.save']`, v2 (heroes + household) | Host: unchanged. Guest: saves **only their hero** into their own save (`heroes[theirHero]`), never the host's world |

The **hero switch** we just built is the rehearsal for all of this: it already re-points one body at another
hero's data, swaps rigs, weapons, cooldowns and loot class, and hands the old hero to the villager AI. In co-op, a
"join" is a switch that happens on a remote player's behalf, and a "leave" is a switch back to NPC mode.

## 4. Net layer (`src/net/`, new)
- `transport.js`: WebRTC `RTCDataChannel`s. Two channels per peer: **unreliable/unordered** for input and snapshots,
  **reliable/ordered** for events. Signalling goes over a tiny WebSocket service (a Cloudflare Worker or similar) using
  5-letter **paw codes** (e.g. `MOCHI`). STUN is public; a TURN relay is optional (about 10% of NATs need it).
- `protocol.js`: message schemas with compact encoding (arrays, not objects; quantised floats). A version handshake
  refuses mismatched builds.
- `host.js` / `client.js`: session state machine (lobby → loading → playing), entity registry with **net ids**, a
  snapshot builder and a snapshot applier.
- `interp.js`: per-entity interpolation buffers (render 100 ms behind the newest snapshot) and prediction for the
  local hero.
- `netsim.js`: a latency / jitter / loss shim for tests.

### Messages
| Channel | Message | Rate / when | Content |
|---|---|---|---|
| reliable | `hello` | join | build version, player name, hero data (player + equipment), wanted hero id |
| reliable | `welcome` | join | player id, claimed hero, world snapshot: `state.village`, day/hour, mode, floor `(seed, floor, runs)`, every entity |
| unreliable | `input` | 30 Hz | seq, move (2 × int8), aim (2 × int16 cm), held-slot bitmask, one-shot actions (roll, interact, potion, swap) |
| unreliable | `snap` | 15–20 Hz | tick, last input seq acked per player, entity deltas: heroes (pos, facing, anim, life, zoom, buffs), monsters (pos, facing, anim, life %, status), villagers (village only: 5 Hz, pos, facing, pose / prop) |
| reliable | `ev` | on demand | `cast` (hero, skill, lvl, aim, target: guests play the VFX), `hit` (target, amount, crit, element: floating numbers), `spawn`/`despawn` (monsters, projectiles with speed and dir so guests simulate the flight locally, zones, summons), `loot` (drop for ONE player: item data), `pickup`, `xp`, `levelup`, `death`/`revive`, `quest`, `toast`, `mode`, `dialogue` (open/close for the busy bubble), `village:changed`, `emote`, `chat` |

Bandwidth estimate: 4 players, 60 monsters in view, 20 Hz is about 25–40 kB/s down per guest. That's fine for
WebRTC.

### Feel
- **Your own hero is predicted**: a guest moves their hero immediately with the same `Player.update` path, and the
  host position corrects it (blend under 0.5 m, snap over 1.5 m).
- **Casts feel instant**: the guest plays the cast animation, sound and VFX at once, but damage, zoom cost and
  cooldown are the host's. A cast the host rejects (zoom, cooldown) plays a soft "fizzle" instead.
- Monsters and other heroes are **interpolated** 100 ms behind. Projectiles are simulated locally from their `spawn`
  event (speed, dir, homing target id), so balls, splash bolts and kibble fly smoothly.

## 5. Gameplay rules online
- **Scaling**: monster life ×(1 + 0.7 × (players − 1)), damage ×(1 + 0.15 × (players − 1)), XP per kill
  ×(1 + 0.3 × (players − 1)), shared by every hero within 25 m. Drops roll **per player** (personal loot) at ×0.8 each,
  so the party finds more overall while each player still finds enough for themselves.
- **Downed, not dead**: at 0 life a hero is downed for 20 s. A teammate holding F nearby for 2 s revives them at 35%
  life. If the whole party is down, or the timer runs out, Shadow drags that hero home (today's death flow, per hero).
- **Class synergies** (the reason to play together): Moka's Bubble Barrier can shield an ally, Duck Call and
  Whirlpool gather monsters for Chewy's Bone Storm, and Good Boy Aura covers the party. These are balanced in the
  single-player pass so they work at all.
- **The village**: every player can walk, chat, shop and fish. **Build mode is host-only** (it's the host's town).
  Villager hearts and quests belong to the host's world. Guests get the XP and coin rewards, and the story flags are
  the host's.
- **Dialogue** is personal: talking to Rosie opens your own dialogue, and others see a speech bubble. Shops are per
  player (their own coins and bag). The **stash** is per player (a guest never touches the host's stash).

## 6. Party-wide transitions
- **Entering the Burrow**: the player at the gate starts a 5 s "Ready?" prompt (everyone sees paw icons fill as
  players arrive or accept). The host then runs `enterDungeon(floor)` and sends `mode {floor, seed, runs}`, and every
  client runs the same iris transition while it builds the floor locally.
- **Stairs / waypoints**: same prompt. Stragglers are carried along (a D3-style party teleport).
- **Going home** (T or waypoint): only the party leader (host) can end the run for everyone. Anyone else going home
  leaves the party's floor and returns to the host's village alone. Their hero is simulated there as a player, not a
  villager.
- **Hero switching online**: allowed in the village for unclaimed heroes, with the same zoom-out / zoom-in
  transition, only on the switching player's screen.

## 7. Phases
0. **Done (hero update)**: per-hero state (`state.heroes`), `HeroManager` roster, heroes living as villagers,
   `Player.setHero`, class-bound items and loot class, per-hero cooldowns, save v2 with migration.
1. **Local refactors, no network** (all verifiable with the existing QA):
   - `Controller` interface. `Player` and the cast path read their controller, not `Input`.
   - `SkillRunner` per caster. `Combat` damage and targeting over a list of heroes. `derivedFor(hero)`.
   - `G.players[]` with `G.player` = the local body. HUD **party frames** (portrait, life, zoom; reusing the hero
     switch bubble's style).
   - **Bot buddy**: a debug mode where the benched hero joins you as a second body driven by a scripted
     `BotController` (follow, attack the nearest monster, use one skill). It exercises every co-op code path
     without a network, and is a fun feature in its own right.
   - The seeded-RNG rule for floor generation, plus a QA check.
2. **Net layer**: transport, signalling, protocol, host/client state machines, entity registry, snapshots,
   interpolation, prediction, `netsim`. Lobby UI: "Play together" in the title screen and pause menu, a paw code to
   share, a join box.
3. **Burrow co-op first** (the heart of it): monsters, projectiles, zones, summons, personal loot, downed and
   revive, party scaling, the ready prompt.
4. **Village co-op**: world snapshot on join, villager replication (5 Hz), per-player dialogue and shops, host-only
   build mode, day/night sync.
5. **Polish**: reconnect (keep the hero claimed for 60 s), emotes and pings ("Over here!" paw marker), a party
   chat log, a host migration prompt ("Host left: continue in your own world?" puts the guest back into their own
   save), and performance passes for 4 heroes' worth of VFX.

## 8. Testing
- **Two browser contexts in one Playwright run** (the QA harness already launches Chromium): host and guest on
  `?net=host` / `?net=join&code=…`, with an in-page loopback transport, so there's no signalling in CI.
- `tools/qa/s13-coop.mjs`: join, claim, move sync, cast sync (the guest sees the host's Splash Bolt and vice versa),
  personal loot, downed/revive, party stairs, leave (the hero returns to town), and rejoin.
- `netsim` profiles: 80 ms ± 20 ms with 2% loss (typical), and 200 ms with 5% loss (bad Wi-Fi). Pass criteria: no
  desync of floor hashes, the guest's hero never rubber-bands more than 1.5 m in normal play, and no stuck states
  after a disconnect in any mode.
- Performance: 4 heroes spamming skills on floor 20 must keep the existing budget (p95 about 7 ms on the RTX 5080
  target).

## 9. Risks and open questions
- **Hidden `G.player` assumptions**: about 130 references across skills, monsters, dungeon, villagers, minimap and
  UI. Phase 1 must remove them before the network exists, or every bug becomes a network bug.
- **Pause semantics**: single player pauses the Burrow during dialogue. Online it can't. This needs a design pass on
  tutorials and boss intros, which currently assume a paused world.
- **NAT traversal**: some players will need TURN. Decide on a hosted relay or a "can't connect" fallback message.
- **Save integrity**: a guest's hero is written back from host messages. Validate item data and XP deltas, and never
  trust them to change the guest's other heroes.
- **Host performance**: the host runs everything, including 4 heroes' skills and VFX. Guests on weak laptops only
  render. Worth a "low effects" setting for other players' VFX.
