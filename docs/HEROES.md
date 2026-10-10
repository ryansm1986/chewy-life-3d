# Heroes: Chewy & Moka (playable roster, switching, NPC mode)

Status: **shipped** (Moka update; QA: tools/qa/s12-heroes.mjs, spell perf: tools/qa/profile-moka.mjs, test pages
`/?test=moka`, `/?test=spells&cast=<id>`). Chewy is the Bone-Katana samurai with a tennis ball (§8); **Moka** is a Boykin Spaniel mage
(dog-themed water, starlight and duck-hunt magic). The player controls one hero at a time and can switch on demand;
the other hero lives in Blossom Hollow as a villager. The same seams are the base for co-op multiplayer
(see docs/MULTIPLAYER.md). The third hero, **Poe** (a black pug ninja with a giant bone fūma), has her own doc:
docs/POE.md (class, skills, charge, joining in the Bamboo Grove, the hero wheel; QA tools/qa/s20-poe.mjs). The fourth,
**the Shih Tzu** (a black-and-white dark knight with a toy flail and dark dog magic; name TBD), has docs/SHIHTZU.md
(class, skills, charge, joining in Momiji Hollow; QA tools/qa/s28-shihtzu.mjs). The fifth, **Foosy** (a Golden Retriever
dragoon with a toy lance and javelins; Shadow flies beside him as a dragon whelp), has docs/GOLDEN.md (class, skills,
charge, the whelp, joining at the Onsen; QA tools/qa/s29-golden.mjs).

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
- **Three heroes** (once Poe joins, docs/POE.md §6): a **tap** of Tab switches to the next joined hero (Chewy → Moka →
  Poe); **holding** Tab (≥ 0.26 s) opens the **hero wheel** (`src/ui/heroWheel.js`: a card per hero; point the mouse
  or press 1–9, let go to confirm, Esc closes; a wider ring past four). The HUD shows a mini portrait per benched hero
  (a click switches). Poe's "Meet Poe" guide teaches both; the Shih Tzu's "Meet <name>" guide the wheel with four.

## 5. The inactive hero as a villager
- A `Villager` built with the hero's rig (`opts.rig`) and `hero: true`: daily routines through VillageLife (benches,
  fishing, chatting, flower beds, shops…), home = Chewy's house (they share it), bedtimes.
- Talking to them: context lines (level, what the other hero is doing, the Burrow) and a **"Let's switch!"** choice.
- Excluded from friendship hearts, gifts and quest targeting.

## 6. Moka joining (story)
- New game: after Rosie's welcome, Moka arrives at the plaza (a bookish spaniel mage who read about the Burrow) and
  joins; a banner + tip teach Tab.
- Existing saves: Moka waits by the fountain with a "!" marker; talking to her plays the same scene.
- Poe joins later, in the Whispering Bamboo Grove: she tails you (badly), sneezes, gets caught and joins; once Moka has
  joined, Shadow passes on a rumour in town that points there (`src/actors/poeJoin.js`, docs/POE.md §5).
- The Shih Tzu joins in Momiji Hollow (the Maple zone): kneeling by the trail, lighting ghostlight lanterns; he rises to
  proclaim and a ghost pup licks his face mid-word; once Poe has joined, Shadow passes on the rumour in town
  (`src/actors/shihtzuJoin.js`, docs/SHIHTZU.md §5).
- Foosy joins at the hot springs of Yukimi Onsen: standing guard, he begins a solemn vow and a tennis ball from the
  bathhouse undoes it; he gives Shadow a dragon whelp costume; once the Shih Tzu has joined, Shadow passes on the rumour
  in town (`src/actors/goldenJoin.js`, docs/GOLDEN.md §5).

## 7. Code map
- `src/rpg/classes.js` — class table. `src/rpg/skillsMoka.js` — Moka's skill defs (merged into SKILLS).
- `src/actors/heroes.js` — HeroManager: roster, state linking, switching + transition, NPC-mode heroes, Shadow;
  tap / hold Tab (`tabInput`) and the hero wheel (`src/ui/heroWheel.js`); Poe's joining scene (`poeJoin.js`) and the
  Shih Tzu's (`shihtzuJoin.js`), Foosy's (`goldenJoin.js`).
- `src/actors/heroModels.js` — baked hero models (Chewy, Moka, and Shadow on the quad contract); `src/actors/heroGear.js` — staff geometry.
- `src/combat/mokaSpells.js` — SkillRunner cast implementations for Moka; `src/gfx/spellFx.js` — spell VFX.
- Blender: `tools/blender/disney/moka.py` (build.py `char=moka`), export `public/rigs/moka_disney.*` (63.9k tris, the
  same 37 bones as Chewy). Kit fallback: `CAST.moka` + disneyKit's 'spaniel' head and `disneyWizardHat()`.
- Spells plumbing: `installMokaSpells(SkillRunner.prototype)` adds `cast_<id>`, the staff bolt, Moonbeam's channel
  (`updateMoka` / `clearMoka`, the Bubble Barrier's `absorb`); `mokaPassives()` fills `d.treeDmgPct`, crit, zoom
  regen, summon damage/life and magic find; monsters honour a decoy's taunt (`tauntFor`). `G.vfx.heroSwap()` is the
  Burrow tag-in effect; sounds `hero_swap` / `hero_arrive`.

## 8. Chewy the samurai
Chewy's moves and style are samurai: upright, formal and disciplined, one long blade, quick-draw cuts, stances,
two-handed swings and battle cries (the swift pug ninja Poe is his opposite, docs/POE.md). His outfit is sheet E, "Black
and Gold" (`tools/blender/work/codex/chewy-samurai-concept/concepts/option-E.png`): a black haori with gold paw mon, a
charcoal kimono, black hakama, a red cord and a black saya at his left hip. **Only the looks changed**: every skill id,
number, balance tune and charge perk is as before, so saves keep working. Fetch Mastery (the red tennis ball) is his
dog signature and stays exactly as it was.

| id | Was | Now | The move |
|---|---|---|---|
| chomp | Chomp Slash | **Crescent Chomp** | an iai draw-cut out of the hip, the free paw joining on the hilt; a bone-white crescent |
| boneMastery | Bone Mastery | **Way of the Bone** | passive sword training |
| whirl | Tail Spin | **Whirlwind Stance** | spinning two-handed cuts with cherry petals |
| dig | Dig Slam | **Helmet Splitter** | a leap into an overhead two-handed cut that cracks the ground |
| guard | Stubborn Guard | **Unbending Stance** | passive: a planted, rooted stance |
| frenzy | Zoomies Frenzy | **Flowing Water** | each hit quickens his cuts and his feet |
| bonestorm | Bone Storm | **Sakura Storm** | spectral bone blades and cherry petals orbit him |
| woof | Woof! | **Kiai!** | a battle shout that knocks back and stuns |
| goodboy | Good Boy Aura | **Code of the Good Boy** | the same healing and resistance aura |
| zoom | Zoomies Dash | **Flash Draw** | a draw-dash through foes; he sheathes and the cut flashes along the path |
| packcall | Pack Call | Pack Call | the spirit pups wear tiny kabuto |
| treat | Treat Toss | **Onigiri Toss** | a glowing rice ball that bursts into healing crumbs |
| howl | Howl of the Pack | **War Banner Howl** | he plants a paw-crest nobori for the buff while he howls |
| moonhowl | Moon Howl | **Moonlit Blades** | blades of moonlight fall instead of pillars |

The tree is **Bone Blade** (sub-label "Bone Katana"); the hero title is "Bone Katana Samurai". The charged releases and
the perks that named the old flavour were re-flavoured too (Grand Crescent, Second Draw, Thunder Kiai, Lightning Draw,
Return Stroke…; docs/CHARGE.md §7 is generated from `src/rpg/charge.js`). Item names: the Bone Sword base is the **Bone
Katana**, the Rib Sabre the Rib Wakizashi, the Shark Tooth Saber the Shark Tooth Tachi (ids unchanged; older saves'
items are renamed on load by `renameLegacyItem`, items.js / actions.js `normalizeHeroes`).

**The Bone Katana** (`src/actors/charKit.js` `katanaGeo`): since R-15 (the owner's pick 2026-10-09: "Could the katana
have a bone shape to it?") the blade is **one long, gently curved bone**: a soft lens section with the white edge kept,
narrow in the middle and flaring into a dog-bone knob pair at each end (just above the habaki and at the tip; `boneBladeGeo`
look `b`, swept by `sweepGeo`, the knob pairs by `boneEnd` with a bridge lobe that keeps the notch clean). It keeps the
katana: the sori, a round gold tsuba with a paw print cut through it, a red-wrapped grip over cream diamonds, a bone-knob
pommel, the draw from the saya. The grip origin, `KATANA.leftGrip`, the pommel and the length (the tip at ~0.68 m) are as
before, so the poses, the two-handed IK, the saya mount and the trails line up unchanged.
- **One shape for every sword item**, tinted by the item's icon colours [blade, wrap, accent] (the tsuba and rings always
  gold); the geometry is cached per tint and look (`player.js` `katanaFor`); the loot drop is the same katana
  (`groundLoot.js`), and so are Sakura Storm's spectral blades (`samuraiProps.js spectralBladeGeo`). Moonlit Blades' blades
  of moonlight are the classic pointed blade (`spectralBladeGeo('classic')`), so they still fall point-first.
- **The icons** (`rpg/samuraiIcons.js katanaShape`, `drawKatanaItem`): every sword base's icon is the bone katana in its
  tint (the older per-base shapes went with R-15), the late tiers with a flourish (`icons.js SWORD_FX`: the Moonbone,
  Kaiju and Starbone glow, the Starbone's stars, the Dragonbone's gem); the Bone Blade skill art draws the same bone
  blade, and Moonlit Blades' the pointed one.
- **The noto clip**: the bone blade is 0.626 m from the saya mouth to its tip against a 0.553 m scabbard, and its knobs
  are twice the saya's width, so while the noto slides it home the paw katana's blade is clipped inside a box down the
  saya from its mouth (`player.js sheathClip`, `charKit.js katanaSheathMaterial`: five clipping planes, their
  intersection clipped; the renderer's local clipping is switched on at the first noto).
- **The other looks** stay for the QA: `?katana=a` (bone tip), `c` (chew-toy bone), `classic` (the pre-R-15 blade), or
  the debug menu's Heroes › *Katana look* live (docs/DEBUG.md). Shots: `node tools/qa/katana-shots.mjs` (the studio page
  `?test=katana`; the pick sheet and `--layout final`).
- **Its material** (`katanaMaterial`) keeps a bone-white blade bone-white under the warm grade and the fog: on the bright,
  unsaturated parts it holds the albedo's own hue, never brighter than the albedo (an overexposed cream blooms pink) and
  never darker than 0.78 of it, so it reads at the far camera at rest and mid-swing; tinted blades keep their hue and stay
  light.
- **Triangles**: 7.0k in the paw, 4.0k for the sheathed hilt (the tsuba's curve segments halved in R-15, 14 from 28: the
  bone blade was 9.1k and the hilt 6.0k with the old tsuba; the paw cut-out reads the same at every camera).

**The model in the game**: the samurai Chewy (`public/rigs/chewy_samurai.*`, 41.1k triangles, the 37-bone hero contract;
its face rig is chewy_b's) is the default Chewy: `HERO_MODELS.chewySamurai`, `chewyModel()` 'samurai'.
- **No choice** (CT-7, the owner's call 2026-10-08): the game always plays the samurai Chewy with the Toybox Moka, Poe,
  Floofy and Foosy. Settings' "Hero models" and "Disney style" are gone, and old saved choices (`chewy.model`, `chewy.style`)
  are dropped quietly. `?chewymodel=toy|disney` and `?chewy=classic` remain for the QA and dev.
- **Fallbacks**: a missing file falls back silently to the Toybox Chewy (chewy_b), then to his kit build; never to the
  Storybook model.
- **Attach points**: the katana's paw grip (`palm`) and the back mount are chewy_b's: the same skeleton, checked in close
  shots at rest and mid-cut.
- **Drawn double-sided** (`doubleSided`): in the export, the haori's back panel with the big gold paw crest (306
  triangles) and the small chest mon face inward. Blender's preview draws both sides, but the game culls back faces, so
  the crests vanished and the white kimono showed through. Drop the flag once a re-export flips those faces.
- **The sheathed look**: a model with a saya declares `sayaMount` on its `HERO_MODELS` entry (format documented in
  `src/actors/heroModels.js`: the mouth point, the blade-entry direction and the edge-up vector in model space, from
  Blender's `export/saya_mount.json`, already in game axes; scaled by `meta.scale` like the bones, and the export's
  `--height` needs no extra scaling since it only writes `meta.height`). The samurai's: mouth [0.222, 0.440, 0.214], dir
  [0.2676, −0.4738, −0.8390], up [0.144, 0.881, −0.451] on the hips; the hilt points along −dir and the scabbard is 0.553 m.
  - The rig then carries `parts.saya`, and the sheathed katana is its **hilt** standing out of the saya mouth
    (`katanaGeo({ hilt: true })`): when the ball is the active weapon, in the village after a few idle seconds, and in the
    Burrow after a combo's sheathing flourish (`noto`), until the next cut draws it.
  - The noto ends on the saya's own axis. His paw can't reach his left hip, so over the flourish's last stretch the
    katana slides out of the paw into the saya, and the paw follows as far as it reaches (`player.js` carrySword). At the
    click the sheathed hilt takes over in the same place.
  - Without `sayaMount` (chewy_b, `?chewymodel=toy`) the sheathed katana rides on his back, and the flourish is a blade
    flick (`chiburi`) instead.
- **Colour** (measured in game against sheet E):
  - The grade pass lifts the darks toward violet (post.js `uLift`), and the toon light tints shadows slate. Together they
    turned his black cloth navy or violet and his fur shadows maroon, and a tint can't fix either without colouring his eye
    whites and muzzle.
  - The fix is per texel, in the hero shader. `darkGrade`'s 5th value is a chroma gate that picks out the near-neutral cloth.
  - `darkNeutral` holds that cloth neutral after lighting and counters the current lift (`U.uGradeLift`, the same vector
    as the grade's), so the grade lifts it to an even dark grey. `darkFur` counters the lift on the rest of him.
  - `furGrade` nudges the chocolate fur alone (chroma over the gate and under the red cord's).
  - Result: the cloth reads #2f2c34 in the village (sheet #1E1C22) and near-black in the Burrow; the lit fur reads #895134
    (h20 s0.45, the sheet's light fur #9A5A3A) with brown shadows.
  - The Burrow's strong warm key light still makes all fur read light orange there, as it did with chewy_b.
  - Portraits (the HUD, the hero wheel, the C panel) render ungraded and zero the grade and lift parts.
- **Per-model Animator tuning** (`anim`, read from `parts.anim` in animator.js):
  - `barkTuck: 0.5` halves the bark's inward arm tuck, so his left paw stays out of the saya and the paws out of the
    haori fronts.
  - `sitThigh: -1.0` (rather than −1.4) keeps the hakama hems from flaring into dark rings.
  - The wave and cast poses are unchanged (checked against his rig sheet).
- **Checks**: `node tools/qa/samurai-model-shots.mjs [village fight grip sheath walk ui]` (the review shots),
  `node .claude/skills/toybox-character/scripts/face-check.mjs --id chewy` (rest, talk, blink, bark, happy; the lids are
  hidden at rest), and prod-smoke (the production Chewy must be `chewy_samurai`, with its saya).

**Moves** (`src/actors/samuraiPoses.js`, merged into the Animator's actions): key poses blended in time. The cuts keep
the timing of the swings they replaced (the attack speed and the hit frame are game numbers), and Kiai! keeps the
bark's. A key pose sets the arm / forearm / leg / body offsets, `dir` and `edge` (where the katana points and where its
edge faces, in the hero's frame: `player.js` `aimSword`), and `two` (0..1): the free paw on the hilt, a two-bone reach
(`src/actors/armIK.js`). The Animator now also drives the baked rigs' forearms and wrists, the legs' spread, `armLock`
(no walk swing in a guard) and keeps one pose accumulator per actor (no per-frame garbage).
- Basic attack: a three-cut combo (`cut1` kesa-giri down from hassō, `cut2` a rising one-handed backhand, `cut3` a level
  two-handed sweep), one cut per attack; a pause over ~1.3 s starts it over; ~0.3 s after the last cut, the flourish.
- Crescent Chomp: `iaiCut` (the paw on the hilt at the left hip, the draw across the front at the 'draw' event, the free
  paw slapping onto the hilt). Its charge holds the `iai` stance (`chargePoses.js`), sinking lower as it fills.
- Flash Draw: `flashDraw` (a low stride, the blade trailing) played at the dash's length; when the dash ends, the
  flourish, and on its beat the cut line along the path. Its charge holds `iaiDash`.
- Kiai!: `kiai` (the breath in hassō, then chest out, head up, the katana thrust high, feet planted wide). Its charge
  holds `kiai`.
- Whirlwind Stance: Chewy's own `spin` (`SAMURAI_OVERRIDES`, which replace the generic action for him only; the name
  stays for the channel plumbing and the QA): the planted two-handed stance, the blade level and swept round with the
  turn. Its charge holds `stance` (coiled back against the coming turn).
- Helmet Splitter: Chewy's own `slam` (the same 0.8 s and impact beat): a crouch over the katana held low behind, the
  leap with it raised high in both paws, the cut straight down. Its charge holds `splitter`.
- Sakura Storm: `stormCall` (the katana raised in salute as the spectral blades rise). Its charge holds `storm`.
- Pack Call / War Banner Howl / Moonlit Blades: `command` (the katana thrust forward, "Go!", the free fist at the hip),
  `warCry` (the left paw plants the banner, chest out, head thrown back, the katana raised), `moonCall` (the katana
  pointed straight at the moon, the free paw on his heart); their charges hold `warCry`.
- Unbending Stance: on a block, a quick `parry` (the blade held level across the body, a glint at the edge). Onigiri
  Toss keeps the generic throw.
- The flourishes (`noto`, `chiburi`, `parry`) don't count as busy, so they never delay a move.

**Effects** (`src/gfx/bladeFx.js`, pooled like ChargeFX): the swing trails are bone-white ribbons with a warm gold rim and
a thin ink line, lifted along the arc so a diagonal cut reads as a diagonal from the high camera; Crescent Chomp's
crescent moon and its charged rolling wave; the Kiai! zigzag shout ring, speed lines and comic burst (its charged
cone: zigzag shout fronts); Flash Draw's white-hot cut line; the glint at a draw or a sheath's click; the chiburi
flick. Phase 2 added:
- Whirlwind Stance: tilted bone-white rings that follow the blade round, with cherry petals caught in them and a
  petal trail while he spins; the finish is a wide crescent and a wave.
- Helmet Splitter: the vertical trail of the overhead cut, then the ground cracks (`crack`: a strike star at a fixed
  size plus a strip of constant width that runs out along the cut, so a long split stays a crack rather than a blot;
  the charged one cracks behind and, with Aftershock, to both sides), a dust ring and flung earth.
- Sakura Storm: spectral katanas (`samuraiProps.js` `spectralBladeGeo`, `stormBladeMaterial`, a fresnel glow) orbit
  edge-out in a swirl of petals; the charged Blade Volley throws them as projectiles with a petal trail.
- Flowing Water: water drops and a ripple at his feet while the stacks are up and he's moving (`flow`).
- Pack Call: each spirit pup wears a tiny black-and-gold kabuto (`kabutoGeo`, `combat/allies.js`).
- Onigiri Toss: a glowing rice ball (`onigiriGeo`, the `onigiri` projectile) that bursts into rice crumbs; the charged
  picnic is a red hanami mat with sakura blossoms (`chargeFx.js`).
- War Banner Howl: the black nobori with the gold paw mon (`bannerMesh`, a canvas cloth that flutters without
  allocating) springs up at his left-back, stays while the buff lasts and sinks away (`banner(...).end()`).
- Moonlit Blades: great spectral blades fall point-first from the sky (`moonBlade`) with a faint pillar and a clang.
All normal-blended and see-through toward the inside, with size caps (`CAP`), so they read on any floor and never
white the screen out. The colours that echo the outfit (the war banner, the crest, the trails' accent edge, the cord)
live in one place: `src/gfx/samuraiPalette.js`.

**Hit flashes** (`src/gfx/vfx.js` `hit`, for every hero): the flash scales with the foe (`r`: its body radius, from
`combat.js`), at most 1.2 m and alpha 0.5; at most 4 flashes a frame (`HIT_BUDGET`) and one crit light a frame, so a
multi-hit never washes over more than the foes it hit.

**Icons** (`src/rpg/samuraiIcons.js`): all 14 non-fetch Chewy skills and the sword items (`drawKatanaItem`, the Bone
Katana in the item's colours). **Sounds** (`src/audio/samurai.sfx.js`, synthesized like the rest): `katana_draw` (the
"shing" of a draw), `katana_sheath` (the noto's click) and `katana_clang` (a parry, a moon blade landing).

**Look tools**: `node tools/qa/pose-lab.mjs` (an action frame by frame, or a real cast frozen at game-time
milliseconds, with the blade's direction printed; `--qs chewymodel=toy` plays the Toybox Chewy instead),
`node tools/qa/samurai-shots.mjs [names]` (the review sheets for every move, plain and charged) and
`node tools/qa/charge-shots.mjs <ids> --pose` (the charge wind-ups).
