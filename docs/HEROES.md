# Heroes: Chewy & Moka (playable roster, switching, NPC mode)

Status: **shipped** (Moka update; QA: tools/qa/s12-heroes.mjs, spell perf: tools/qa/profile-moka.mjs, test pages
`/?test=moka`, `/?test=spells&cast=<id>`). Chewy is the Bone-Sword/Tennis-Ball fighter; **Moka** is a Boykin Spaniel mage
(dog-themed water, starlight and duck-hunt magic). The player controls one hero at a time and can switch on demand;
the other hero lives in Blossom Hollow as a villager. The same seams are the base for co-op multiplayer
(see docs/MULTIPLAYER.md).

## 1. Who is Moka
- Boykin Spaniel (South Carolina's retriever): rich chocolate/liver wavy-curly coat, long pendant wavy ears, golden
  amber eyes, liver nose, a stubby happy tail. Bright, bookish, a little bossy with Chewy, adores water and ducks.
- Look: seafoam/teal hooded capelet with gold trim and a star clasp over a lavender knee-length robe with star
  embroidery, a violet sash with a tiny rubber-duck charm, a floppy seafoam wizard hat with a paw-print patch and a
  bent tip. Weapon: a staff (driftwood crook cradling a glowing seafoam orb, blue ribbon, a duck charm).
- Model: Blender-built like Chewy (tools/blender/disney, SDF sculpt + groom + rig + game export →
  public/rigs/moka_disney.*), runtime via `src/actors/heroModels.js` (generalised disneyChewy.js). Classic-style fallback
  is the kit spec `CAST.moka`.

## 2. Progression (Diablo-2 style: separate heroes, shared household)
| per hero (`state.heroes[id]`) | shared (top-level state) |
|---|---|
| `player` (lvl, xp, stats, statPts, skillPts, skills, hotbar, mouseSets, life, zoom, activeWeapon) | coins, materials, potions |
| `equipment` (all slots) | inventory (bag), stash |
| | quests, friends, village, dungeon (deepest, waypoints), day/hour, flags |

- `state.player` and `state.equipment` stay the ACTIVE hero's objects (live references into `state.heroes[active]`),
  so every existing system keeps working unchanged. `state.activeHero` names the active hero.
- Saves: `state.heroes` is the source of truth; `player`/`equipment` are re-linked on load. Old saves migrate: the
  existing player/equipment become `heroes.chewy`, Moka is created fresh (not yet joined: `flags.mokaJoined`).
- Catch-up: a hero more than 2 levels below the highest hero gets +100% XP ("Pack spirit: catching up!").
- Classes (`src/rpg/classes.js`): base attributes, life/zoom formulas, weapon types, skill trees, starter kit.
  Chewy: str/dex fighter (sword → Str, ball → Dex). Moka: ene caster (life lower, zoom higher; **staff → Energy adds
  +1% damage per point**, like Str for swords).
- Weapons are class-bound by `wtype`: `sword`/`ball` → Chewy, `staff` → Moka. The bag is shared, so tooltips say
  "Moka's staff" and equipping another class's weapon is refused with a friendly toast. Armour/charms are shared-use.
- Loot: weapon drops favour the active hero's class (75%).

## 3. Moka's skills (3 trees x 7, same D2 framework as Chewy: rows 0-5, prerequisites, synergies)
Element mapping onto the existing damage system: water → `frost` (chill/slow), starlight → `zap`, duck hunt → `phys`.
Spell damage = dmgPct of staff damage (Energy bonus included), exactly like Chewy's skills use weapon damage.

**Tidewater** (`tide`, seafoam `#5ce0d0`) — Boykins love the water
- `splash` Splash Bolt (r0) — water orb projectile that bursts into a small splash ring. Moka's bread and butter.
- `tideMastery` Tidewater Mastery (r1, passive) — +water damage %, +zoom regen.
- `bubble` Bubble Barrier (r1) — bubble shield absorbs damage; when it pops it splashes and knocks foes back.
- `shake` Wet Dog Shake (r2) — the iconic shake: a spinning spray nova, damage + chill.
- `puddleHop` Puddle Hop (r3) — dive into a puddle, pop out at the cursor with a splash (blink).
- `whirlpool` Whirlpool (r4) — ground vortex that drags enemies to its centre and churns them.
- `greatWave` Great Wave (r5, ultimate) — a towering wave (Moka surfing its crest for a beat) rolls forward in a
  line, sweeping enemies back.

**Starlight Kibble** (`star`, gold/violet `#ffd36a`/`#b89aff`) — arcane star magic
- `kibble` Kibble Missiles (r0) — 3+ homing star-kibble bolts with sparkle trails.
- `starMastery` Starlight Mastery (r1, passive) — +starlight damage %, +crit.
- `squeak` Squeaky Nova (r1) — squeaky-toy shockwave ring (SQUEAK!), brief stun.
- `pawRune` Paw Rune (r2) — a glowing paw-print glyph on the ground erupts in a star burst when stepped on.
- `moonbeam` Moonbeam (r3, channel) — a beam of moonlight from the sky that follows the cursor.
- `constellation` Constellation Link (r4) — star chains arc between nearby enemies (chain damage), drawing a
  constellation.
- `meteor` Treat Meteor (r5, ultimate) — a giant bone-biscuit meteor crashes down: huge AoE, crater, screen shake.

**Duck Hunt** (`duck`, orange/green `#ffb04a`/`#8fd068`) — retriever tricks and summons
- `duckDecoy` Decoy Duck (r0) — a wind-up rubber duck waddles out and quacks; monsters target it; it pops in a
  confetti splash.
- `retriever` Retriever's Instinct (r1, passive) — +summon damage/life, +magic find.
- `fetchLeash` Fetch! (r1) — a magic leash yanks the target to Moka and stuns it (or retrieves far loot).
- `feathers` Feather Flurry (r2) — a cone burst of glowing feathers (multi-hit).
- `duckCall` Duck Call (r3) — a quacking lure: enemies in a radius are dragged toward a point and dazed.
- `spiritRetriever` Spirit Retriever (r4) — a spectral golden retriever familiar fights beside Moka.
- `mallards` Mallard Squadron (r5, ultimate) — a V-formation of spectral mallards dive-bombs the target area.

Starter kit: Driftwood Staff; skills `{ splash: 1 }`; mouse set `['attack', 'splash']`; `attack` with a staff is a
free little sparkle bolt. Hotbar hints on first join. Staff bases span tiers like swords/balls
(Driftwood Staff, Duck-Call Staff, Starlight Staff, Moon Crook, …).

## 4. Switching (Tab, the HUD hero button, or talking to the other hero)
- Allowed when not dead, not in dialogue/menus/build mode, not mid-transition; 2 s cooldown. Channels end, the
  queued cast is dropped, the other hero's cooldowns persist per hero.
- **Transition** (~1.6 s, input locked): the camera eases out (distance → ~36, pitch up), a hero card sweeps in
  (portrait, name, class), then:
  - **Village**: the camera glides across town to the other hero wherever they are (their NPC position); the old
    hero stays put and carries on as a villager; zoom back in on the new hero.
  - **Burrow**: the old hero is whisked home (paw-print portal poof; they appear at Chewy's house in the village);
    the new hero drops in on the same spot from a starlight portal (tag-in), then zoom back in.
- Shadow always follows the active hero (teleports beside them under the zoomed-out camera if far).
- The HUD shows the active hero's portrait; the other hero's mini-portrait sits beside it with a Tab hint and a
  cooldown ring. The character, skills and inventory panels always show the active hero.

## 5. The inactive hero as a villager
- A `Villager` built with the hero's rig (`opts.rig`) and `hero: true`: daily routines through VillageLife (benches,
  fishing, chatting, flower beds, shops…), home = Chewy's house (they share it), bedtimes.
- Talking to them: context lines (level, what the other hero is doing, the Burrow) and a **"Let's switch!"** choice.
- Excluded from friendship hearts, gifts and quest targeting.

## 6. Moka joining (story)
- New game: after Rosie's welcome, Moka arrives at the plaza (a bookish spaniel mage who read about the Burrow) and
  joins; a banner + tip teach Tab.
- Existing saves: Moka waits by the fountain with a "!" marker; talking to her plays the same scene.

## 7. Code map
- `src/rpg/classes.js` — class table. `src/rpg/skillsMoka.js` — Moka's skill defs (merged into SKILLS).
- `src/actors/heroes.js` — HeroManager: roster, state linking, switching + transition, NPC-mode heroes, Shadow.
- `src/actors/heroModels.js` — baked hero models (Chewy, Moka, and Shadow on the quad contract); `src/actors/heroGear.js` — staff geometry.
- `src/combat/mokaSpells.js` — SkillRunner cast implementations for Moka; `src/gfx/spellFx.js` — spell VFX.
- Blender: `tools/blender/disney/moka.py` (build.py `char=moka`), export `public/rigs/moka_disney.*` (63.9k tris, the
  same 37 bones as Chewy). Kit fallback: `CAST.moka` + disneyKit's 'spaniel' head and `disneyWizardHat()`.
- Spells plumbing: `installMokaSpells(SkillRunner.prototype)` adds `cast_<id>`, the staff bolt, Moonbeam's channel
  (`updateMoka` / `clearMoka`, the Bubble Barrier's `absorb`); `mokaPassives()` fills `d.treeDmgPct`, crit, zoom
  regen, summon damage/life and magic find; monsters honour a decoy's taunt (`tauntFor`). `G.vfx.heroSwap()` is the
  Burrow tag-in effect; sounds `hero_swap` / `hero_arrive`.
