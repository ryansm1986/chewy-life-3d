# Charged abilities: hold to charge, per-skill charge perks

Status: **built** (2026-10-05): every active skill of both heroes charges (34 charged releases with all their perks,
the channel wind-ups and the empowered summons, wind-up poses); the K-panel Charge drawer; the "Hold to power up!"
guide; `tools/qa/s19-charge.mjs`; unit tests and the DPS-band sim in `tools/test-rpg.mjs`; the balance pass (§3, §9). The owner asked for:
- abilities with a charge effect when holding down the ability button;
- ways to boost the charge and to shorten it;
- skill-tree points that, for example, add projectiles to the boosted ability or make the boost charge faster;
- other interesting effects unique to each skill.

They chose:
- **start with one charge stage, with ways to add more stages for bigger boosts**;
- **per-skill charge perks**;
- **all active skills for both heroes**;
- **more energy per stage**.

## 1. Feel (how it plays)
- **Tap is the same as today.** Pressing and releasing an active skill's button (LMB, RMB, 1–4) quickly casts the normal version.
- **Hold to charge.** Holding past a short grace (about 0.18 s, so taps never charge by accident) starts charging, aimed at the
  cursor.
  - A **charge ring** fills around the hero's feet, and around the hotbar slot.
  - At each **stage threshold** there's a chime, a glow pulse on the hero (in the skill's element colour), a small screen-space
    sparkle, and a stage pip (Ⅰ, Ⅱ, Ⅲ) on the ring.
  - The hero plays a skill-appropriate **wind-up pose**: a sword drawn back, a ball cocked, a staff raised with gathering water, a
    crouch before the dash, a breath before the Woof.
- **Release fires the charged version** for the highest stage reached. Releasing before stage Ⅰ casts the normal version. Holding
  past the last stage keeps it **held at full** (no overcharge penalty by default; a perk may add one).
- **While charging**:
  - movement slows to about 45% (the hero can still reposition), and the aim follows the cursor;
  - getting hit does **not** cancel the charge;
  - dodge or roll (Space) **cancels** it and refunds nothing;
  - switching hotbar skill or opening a modal cancels it;
  - cooldowns tick normally;
  - you can't start a second charge.
- **Stages**:
  - Every active skill starts with **one charge stage** (Ⅰ), at about **0.9 s** base charge time.
  - Perks add **Stage Ⅱ** and **Stage Ⅲ**. Each later stage takes about 0.7× the previous stage's time on top. Each stage's
    payoff grows (see §3).
- **Cost**: the charged release costs the normal energy (zoom or mana) **+50% per stage reached** (Ⅲ: ×2.5; the balance pass
  raised it from +25%, the owner's "more energy per stage", so the release can be big while sustained DPS stays in the band).
  Efficient Focus reduces it.
  - If the hero can't afford the stage they're holding, the ring caps at the highest affordable stage. The pip for an unaffordable
    stage shows greyed, with a "Not enough zoom" hint.
- **Controller and keyboard parity**: hold works the same on mouse buttons and number keys. The game's Settings get **"Charge on
  hold: On / Off / Toggle"** (Toggle: press once to start charging, press again to release), for accessibility.

## 2. What charging does: base Stage Ⅰ payoffs (every active skill)
Each skill gets a **charged variant** with a signature payoff at Ⅰ, with bigger numbers at Ⅱ and Ⅲ. The payoff is skill-flavoured,
not just "more damage". Examples to set the tone (the builder designs all of them; §5):
- **Crescent Chomp**: a charged draw-cut is a **wider, heavier cut** whose crescent flies on that travels about 3 m.
- **Power Throw**: a **piercing fastball** that passes through enemies, with a trail.
- **Kiai!**: a **shout cone** that knocks back further and briefly stuns.
- **Flash Draw**: a **longer draw-dash** whose cut lingers along the path, still cutting.
- **Splash Bolt** (Moka): a **bigger orb** with a larger splash ring that slows.
- **Channel skills** (Whirlwind Stance): the charge is a **wind-up**. A charged spin lasts longer and pulls enemies in.
- **Summons** (Pack Call, Squeaky Decoy, Spirit Retriever): a charged cast **summons an empowered version** (bigger, tougher, or an
  extra companion).

Base scaling per stage (a guide; tune per skill): Ⅰ ×1.5 effect, Ⅱ ×2.0, Ⅲ ×2.75, on the skill's main number (damage, radius,
duration or count), plus the signature payoff growing with the stage.

## 3. Charge perks (per skill, bought with skill points)
- **Where**: on each active skill's card in the skill tree (the K panel). A **Charge** sub-panel with 3–4 perk nodes beside the
  skill, drawn as small linked nodes, so the tree reads "skill → its charge perks".
- **Cost**: perks are bought with the **same skill points**.
  - Each perk has **1–3 ranks** (most have 1; numeric ones have up to 3).
  - A perk needs the parent skill at a **minimum level**: the first perks at skill level 1, Stage Ⅱ at level 5, Stage Ⅲ at
    level 10, unique capstones at 8–12.
  - Respec follows the existing respec rules if there are any; otherwise refunds work like skill points.
- **The perk families each skill draws from** (3–4 per skill: usually one or two common perks plus one or two unique ones):
  - **Quick Wind-up** (common): −15% charge time per rank, up to 3 ranks.
  - **Second Stage / Third Stage** (common, gated by level): add Stage Ⅱ, then Ⅲ. Every skill can reach Ⅲ.
  - **Efficient Focus** (common, the big-cost skills): −15% extra energy per stage, per rank (2 ranks).
  - **Projectile and area perks** (where they fit):
    - **Split Shot**: +1/+2 extra projectiles on a charged release, fanned (50% each);
    - **Wide Arc**: +area or arc;
    - **Echo**: the charged release repeats once at 50%.
  - **Unique perks**, one or two per skill, that change the behaviour. Examples:
    - **Power Throw**, "Boomerang Fetch": a charged ball returns to Chewy, hitting again on the way back.
    - **Ricochet**, "Pinball Wizard": a charged ricochet chains to +3 targets and speeds up per bounce.
    - **Helmet Splitter**, "Aftershock": a second slam ring erupts 0.6 s later.
    - **Onigiri Toss**, "Hanami Picnic": a charged toss drops a healing picnic blanket zone for allies.
    - **Moonlit Blades**, "Lunar Eclipse": at Stage Ⅲ, the area becomes night for 4 s (holy damage ticks, enemies are blinded).
    - **Splash Bolt**, "Rain Shower": a charged bolt bursts into a rain of mini bolts over the target area.
    - **Great Wave**, "Tsunami": Stage Ⅲ waves travel twice as far and carry enemies.
    - **Fetch! (leash)**, "Double Leash": a charged leash grabs two targets.
    - Overcharge risk-reward perks are welcome as optional uniques, e.g. "Hold at full for 1 s for a Perfect Release, with a crit
      flash".
- **Balance**: a fully charged, fully perked cast should feel great but cost real time and energy. Target a DPS gain from charging of
  about +10–30% over tapping for a skill-focused build. Burst is much higher, but charge time and energy keep sustained DPS sane.
  Bosses and champions get no special resistance to charges.
  - **As balanced** (`node tools/charge-sim.mjs`; asserted by `tools/test-rpg.mjs`): every damage skill's full charge (Stage Ⅲ,
    every perk) is **+21–30% sustained** over tapping in a 60 s skill-build fight (70% against packs of 5, 30% against single
    targets), median +22%; Stages Ⅰ and Ⅱ land at −3% to +30%; bursts are ×1.3–4.3 a tap. Against a lone boss the AoE skills
    charge at a loss (Ricochet ×0.5, Splash ×0.56, Blaze ×0.6, Crescent Chomp ×0.65): tap those on bosses and charge them into packs. Summons and buffs
    are reported, not banded (the decoys and the Spirit Retriever ×1.2; Pack Call ×0.9: its pups last a minute; Howl ×1.2;
    Onigiri Toss / Bubble ×1.1).

## 4. UI and feedback
- **Hotbar**: the slot shows a radial charge fill and stage pips; skills with charge perks get a small ⚡ corner badge.
- **World**: the ring at the hero's feet, the wind-up pose, element-coloured particles gathering, the stage chimes, and a release
  burst (bigger per stage).
- **Tooltips**: each skill shows "Hold to charge: Ⅰ …". Perks show their exact numbers at their next rank, as the skill tooltips do
  (`info()`).
- **Skill tree panel** (`ui/skills.js`):
  - each active skill has its Charge perks sub-row;
  - learned perks glow; locked ones show the level they need;
  - **a preview**: hovering a perk animates a tiny diagram (Split Shot shows 3 fanned arrows, and so on), or at least gives a clear
    icon and text.
- **First-time guide**: a short `tutorials.js` guide, "Hold to power up!", the first time the hero gains a level or first uses a
  skill in the Burrow: hold, watch the ring, release, then "Spend points on Charge perks in the K panel".

## 5. Implementation notes (verify in code)
- **Code**:
  - skills are in `src/rpg/skills.js` (Chewy) and `src/rpg/skillsMoka.js` (Moka), each with `params(l, d)`, `info()`, `cost`, `cd`,
    `kind`, `syn`;
  - runtime is in `src/combat/skillRunner.js`, `combat.js`, `mokaSpells.js` and `projectile.js`;
  - input is in `game.js` (`skillInput.holding`, `SLOT_KEYS`, hotbar), plus `player.js`;
  - poses are in `actors/animator.js` (ACTIONS);
  - the skill tree UI is `ui/skills.js`; the hotbar is `ui/hud.js`;
  - stats are `rpg/stats.js` (`computeStats`, `effectiveLevel`, `skillRuntime`).
- **Data**: add `charge: { base: 0.9, stages: [...payoff per stage...], perks: { id: { name, ranks, req, desc, info(), apply } } }`
  to each active skill def. A pure helper `chargeRuntime(id, state, derived, stage)` returns the charged params, so it's
  node-testable and the runner stays simple.
- **State**: `state.player.chargePerks = { [skillId]: { [perkId]: rank } }`, **per hero** (it lives on `player`, so `normalizeHeroes`
  keeps it; HOMESTEAD.md learned that `heroes[id].meal` beside `player` gets dropped). Lazy-init; old saves get an empty object.
- **Skill points**: perks spend `state.player.skillPts`. `canLearn`-style rules live in a pure `canLearnPerk`.
- **The runner**: casting a skill takes an optional `charge = { stage, t }`. A tap passes no charge. The charged path calls the same
  skill code with `chargeRuntime` params plus the variant flags (pierce, return, extra projectiles, and so on).
- **The mode rule**: skills are cast in the Burrow and regions only (the village has no combat); check how `usable()` gates this.
- **Perf**: the charge ring and particles are pooled or instanced; nothing is allocated per frame.

## 6. QA
- **`tools/qa/s19-charge.mjs`**, through real inputs:
  - a tap casts normal;
  - holding reaches Ⅰ and fires charged; Ⅱ and Ⅲ with perks;
  - the energy cost per stage; the cap when energy is short;
  - cancel on roll and on a modal;
  - the slow walk while charging, and no cancel on hit;
  - Toggle mode;
  - each hero's every active skill charge-casts at least once without errors in a Burrow fight;
  - buying perks in the K panel (points spent, level gates);
  - perks survive save/load and a hero switch (per hero);
  - the guide.
- **`tools/test-rpg.mjs`**: unit tests for `chargeRuntime`, stage times with Quick Wind-up, costs with Efficient Focus, perk gating,
  and a sim comparing DPS against tapping (the balance band).
- Existing QA: s2 (combat), s3 (bosses), s12 (heroes), the rest of run-all, and prod-smoke.
- **Look**: every new VFX and wind-up pose at the 9/10 bar (cozy, readable, element-coloured); review shots of each skill's charged
  release.

## 7. The perk table (every active skill, every hero)
All numbers at skill level 10 with no gear, read from `src/rpg/charge.js` (regenerate with `node tools/charge-table.mjs`). Common rules: a press under 0.18 s is a tap; charging walks at 45% speed; each stage costs +50% of the skill's zoom; each table's curves (the main number ×1.5 / ×2 / ×2.75 unless it names its own) then pass through its balance tune (§9), so the numbers below are the tuned ones; a perk's bonus damage is 50% / 75% / 100% of its listed value at Ⅰ / Ⅱ / Ⅲ. Stage times are Ⅰ / Ⅱ / Ⅲ (cumulative; Quick Wind-up trims them by 15% per rank).

**Common perk families** (each skill carries its own copies; ranks are bought with skill points, gated by the skill's hard level):
- **Deeper Charge** (every skill, 2 ranks, Lv 5 / 10): rank 1 adds Stage Ⅱ, rank 2 adds Stage Ⅲ.
- **Quick Wind-up** (every skill, 3 ranks, Lv 1 / 3 / 6): −15% charge time per rank.
- **Efficient Focus** (the big-cost skills, 2 ranks, Lv 3 / 8): the per-stage surcharge drops from +50% to +35% to +20%.
- **Split Shot** / **Wide Arc** / **Echo** (where they fit): +1 / +2 fanned projectiles at 50%; +15–20% charged area per rank; the release repeats once 0.45 s later at 50%.

#### Bone Blade (Chewy)

| Skill → charged release | Stage payoff (normal → Ⅰ / Ⅱ / Ⅲ) | Charge, cost | Perks (ranks · skill level) |
|---|---|---|---|
| **Crescent Chomp** → *Grand Crescent* (iai stance, paw on the hilt)<br>Hold the iai stance for a wider, heavier draw-cut, and its crescent flies on ahead as a rolling wave. | damage 312 → 314 / 318 / 403%; arc 190 → 196 / 250 / 280°; radius 2 → 2.03 / 2.4 / 2.6 m; knockback 0.6 → 0.9 / 1.2 / 1.5; stun 0 / 0.25 / 0.5 s; crescent flies 3 / 3.6 / 4.2 m; crescent 60%; crescent width 0.75 m | 0.8 / 1.36 / 1.75 s<br>4.4 → 6.6 / 8.8 / 11 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.36 s, then Ⅲ at 1.75 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.68 / 0.56 / 0.44 s<br>**Wide Arc** (2 · Lv 2 / 6): +15% / +30% charged cut reach<br>★ **Second Draw** (1 · Lv 8): After a charged Crescent Chomp, your next one within 2s is a Stage Ⅰ Grand Crescent without holding (normal zoom cost). |
| **Whirlwind Stance** → *Gale Stance* (settling into the stance)<br>Hold to settle into the stance: at Stage Ⅰ a bigger whirlwind that pulls foes in starts by itself and quickens while held; let go and it spins on alone, then a dizzy burst. | damage 151 → 151 / 151 / 153%; radius 2 → 2 / 2.09 / 2.5 m; pull 1.5 / 2 / 2.6 m/s; spin-out 0.5 / 1 / 1.6 s; dizzy 0.4 s | 0.9 / 1.53 / 1.97 s<br>11.6 → 17.4 / 23.2 / 29 zoom per second | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>★ **Twister** (1 · Lv 4): The spin-out drifts after your cursor at 2.5 m/s: a tiny tornado.<br>★ **Dizzy Finale** (1 · Lv 10): The spin-out ends by flinging everything nearby away: 120% damage and 1.2s dizzy. |
| **Helmet Splitter** → *Mountain Splitter* (crouched, blade low behind)<br>A longer leap and a bigger, stunning crack in the ground. | damage 436 → 451 / 462 / 528%; radius 2.7 → 2.7 / 4.05 / 4.73 m; leap 6 → 8 / 9 / 10 m; stun 1.3 → 1.6 / 1.8 / 2.1 s; knockback 1.2 → 1.8 | 0.9 / 1.53 / 1.97 s<br>14.5 → 21.8 / 29 / 36.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>**Wide Arc** (2 · Lv 2 / 6): +20% / +40% charged crack<br>★ **Aftershock** (1 · Lv 8): The ground cracks open again 0.6s later: 60% damage in a 40% wider ring. |
| **Sakura Storm** → *Sakura Tempest* (the blade raised in salute)<br>More spectral blades and petals in a wider storm. | count 7 → 8; damage 132 → 132 / 132 / 133%; radius 2.2 → 2.23 / 2.33 / 2.4 m; lasts 9 → 9 / 9.1 / 9.18 s | 1 / 1.7 / 2.19 s<br>34 → 51 / 68 / 85 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.7 s, then Ⅲ at 2.19 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.85 / 0.7 / 0.55 s<br>★ **Blade Volley** (1 · Lv 6): When a charged storm ends, every blade shoots at the nearest foe within 8 m for 50%.<br>★ **Blade Wall** (1 · Lv 12): While a charged storm spins, each blade blocks one hit aimed at Chewy (and shatters into petals). |

#### Fetch Mastery (Chewy)

| Skill → charged release | Stage payoff (normal → Ⅰ / Ⅱ / Ⅲ) | Charge, cost | Perks (ranks · skill level) |
|---|---|---|---|
| **Power Throw** → *Fastball* (ball cocked)<br>A piercing fastball that passes through every foe in its path, with a streak trail. | damage 284 → 285 / 301 / 336%; speed 16 → 21.6 m/s; range 12 → 16 / 18 / 20 m; pierce 3 → 99; knockback 0.5 / 0.7 / 1; size 1.3 / 1.5 / 1.7× | 0.75 / 1.27 / 1.64 s<br>2.9 → 4.4 / 5.8 / 7.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.27 s, then Ⅲ at 1.64 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.64 / 0.52 / 0.41 s<br>**Split Shot** (2 · Lv 2 / 6): +1 / 2 extra fastballs (50% each), fanned<br>★ **Boomerang Fetch** (1 · Lv 8): The charged ball flies back to Chewy, hitting everything again on the way (60% damage). |
| **Ricochet** → *Static Overload* (ball cocked)<br>Extra bounces, and every bounce arcs a spark to one more foe nearby. | damage 218 → 218 / 220 / 222%; bounces 6 → 7 / 7 / 9; bounce range 6 → 7 / 7.5 / 8 m; spark arc 35% | 0.85 / 1.44 / 1.86 s<br>7.3 → 11 / 14.6 / 18.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.44 s, then Ⅲ at 1.86 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.72 / 0.6 / 0.47 s<br>★ **Static Cling** (1 · Lv 4): Every foe the charged ball hits is zapped again 1s later for 30%.<br>★ **Pinball Wizard** (1 · Lv 8): A charged ricochet chains to +3 more foes and speeds up with each bounce: +12% speed and +10% damage per bounce. |
| **Multi-Fetch** → *Ball Pit Barrage* (ball cocked)<br>A much bigger, tighter fan of balls. | count 8 → 9 / 10 / 12; fan 70 → 56°; damage 166 → 166 / 166 / 172% | 0.9 / 1.53 / 1.97 s<br>11.6 → 17.4 / 23.2 / 29 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>**Encore** (1 · Lv 8): The charged release repeats once 0.45s later at 50% power<br>★ **Bouncy Castle** (1 · Lv 10): Charged balls bounce off walls twice and hop on to one more foe after a hit. |
| **Squeaky Decoy** → *Giant Squeaker* (ball cocked)<br>An empowered rubber chicken: bigger, tougher, louder and stinkier. | lasts 12 → 12 / 13.65 / 16 s; lure 6 → 8 / 9 / 10 m; stink cloud 2.6 → 2.6 / 3.17 / 4.16 m; damage 94 → 94 / 95 / 107%; life 270 → 405 / 540 / 743; size 1.6 / 2 / 2.4× | 0.9 / 1.53 / 1.97 s<br>19.4 → 29.1 / 38.8 / 48.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>★ **Double Trouble** (1 · Lv 6): A charged toss throws a second decoy beside the first (60% life).<br>★ **Big Squeak Finale** (1 · Lv 10): A charged decoy bursts in a stink nova when it pops: 150% in 3 m and a 1s stun. |
| **Blazing Ball** → *Bonfire Ball* (ball cocked)<br>A bigger blast and a larger, longer-burning fire. | damage 398 → 400 / 414 / 493%; radius 2.3 → 2.65 / 3.45 / 4.02 m; burn 61 → 49 / 44 / 44%/s; burning ground 3 → 3.75 / 5.5 / 7 s | 0.9 / 1.53 / 1.97 s<br>17.4 → 26.1 / 34.8 / 43.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>★ **Hot Potato** (1 · Lv 4): The charged ball skips twice along the ground before the big blast; each skip is a small 50% blast.<br>★ **Campfire** (1 · Lv 10): The charged fire warms the pack: you, Shadow and the pups heal 3% life per second while standing in it. |
| **Fetch Storm** → *Monsoon of Balls* (paws to the sky)<br>Far more balls over a wider area. | count 38 → 49 / 61 / 76; radius 4.5 → 5.18 / 5.85 / 6.75 m; damage 180 → 200 / 220 / 241% | 1.1 / 1.87 / 2.41 s<br>39 → 58.5 / 78 / 97.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.87 s, then Ⅲ at 2.41 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.94 / 0.77 / 0.61 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **The Big One** (1 · Lv 12): The storm ends with a giant beach ball crashing into the middle: 80% in 3.5 m and a big knockback. |

#### Pack Spirit (Chewy)

| Skill → charged release | Stage payoff (normal → Ⅰ / Ⅱ / Ⅲ) | Charge, cost | Perks (ranks · skill level) |
|---|---|---|---|
| **Kiai!** → *Thunder Kiai* (a big breath, blade up)<br>Draw a deep breath for a forward cone of shout that reaches twice as far, knocks back further and stuns longer. | damage 150 → 151 / 153 / 173%; stun 1 → 1.5 / 2 / 2.75 s; knockback 2.5 → 4 / 5 / 6.25; cone 90 / 100 / 110°; reach 8.6 m | 0.9 / 1.53 / 1.97 s<br>8.7 → 13.1 / 17.4 / 21.8 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>**Echoing Kiai** (1 · Lv 8): The charged release repeats once 0.45s later at 50% power<br>★ **Big Bad Kiai** (1 · Lv 10): Foes hit by a charged kiai are scared stiff for 2.5s: they flee and take +25% damage. |
| **Flash Draw** → *Lightning Draw* (coiled in the draw stance)<br>Coil low in the draw stance for a much longer draw-dash; its cut lingers along the path, still cutting. | damage 188 → 188 / 200 / 218%; dash 6.5 → 6.5 / 13 / 17.88 m; lingering cut 6 / 10 / 15% / 0.5 s; trail 1 / 1.5 / 2 s | 0.85 / 1.44 / 1.86 s<br>7.8 → 11.7 / 15.6 / 19.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.44 s, then Ⅲ at 1.86 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.72 / 0.6 / 0.47 s<br>★ **Return Stroke** (1 · Lv 4): At the end of a charged dash Chewy cuts his way halfway back, hitting everything again.<br>★ **Afterimage** (1 · Lv 10): A charged dash leaves a ghostly Chewy at the start that taunts foes for 3s, then pops for 40%. |
| **Pack Call** → *Shogun Pup* (a deep breath before the call)<br>Calls an empowered shogun pup in a grand helmet: bigger and tougher, with more pups at higher stages. | pups 3 → 3 / 4 / 5; shogun pup 1.6 / 2.2 / 3× | 0.9 / 1.53 / 1.97 s<br>19.5 → 29.3 / 39 / 48.8 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>★ **Pack Leader** (1 · Lv 4): A charged call sends Shadow into a 6s frenzy: +30% attack speed.<br>★ **Spirit Wolf** (1 · Lv 10, needs Stage Ⅲ): At Stage Ⅲ the shogun pup arrives as a Spirit Wolf: much bigger, with a pouncing leap. |
| **Onigiri Toss** → *Giant Onigiri* (ball cocked)<br>A huge glowing rice ball: much more healing in a wider burst. | heal 30 → 45 / 60 / 83% life; heal 60 → 90 / 120 / 165 flat; radius 3.2 → 4 / 4.48 / 5.12 m; damage 104 → 156 / 208 / 286% | 0.9 / 1.53 / 1.97 s<br>16.5 → 24.8 / 33 / 41.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>★ **Hanami Picnic** (1 · Lv 6): A charged toss lays a blossom-viewing picnic blanket (3 m) for 4 / 5 / 6s by stage: allies heal 3% life per second, foes on it take 25% holy per second.<br>★ **Rice Ball Shower** (1 · Lv 10): The giant onigiri bursts into 6 mini rice balls that scatter 3 m; each heals or zaps where it lands (25%). |
| **War Banner Howl** → *Rallying Banner* (a deep breath before the call)<br>A longer, stronger rally under a bigger banner, with a wider fear. | lasts 10 → 13 / 16 / 20 s; damage buff 90 → 103 / 117 / 135%; fear 2 → 2.6 / 3.2 / 4 s; radius 6 → 8 / 9 / 10 m | 1 / 1.7 / 2.19 s<br>24.5 → 36.8 / 49 / 61.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.7 s, then Ⅲ at 2.19 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.85 / 0.7 / 0.55 s<br>★ **Second Wind** (1 · Lv 4): A charged howl heals you, Shadow and the pups for 10 / 15 / 20% life by stage.<br>★ **Moonlit Rally** (1 · Lv 10): While a charged howl lasts, all your charges fill 25% faster. |
| **Moonlit Blades** → *Moonfall* (a deep breath before the call)<br>More moonlit blades with wider strikes. | moon blades 8 → 9; damage 568 → 573 / 573 / 570%; strike radius 1.4 → 1.41 / 1.42 / 1.43 m | 1.1 / 1.87 / 2.41 s<br>44 → 66 / 88 / 110 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.87 s, then Ⅲ at 2.41 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.94 / 0.77 / 0.61 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Lunar Eclipse** (1 · Lv 12, needs Stage Ⅲ): At Stage Ⅲ the area turns to night for 4s: 8% holy every 0.5s, and foes are blinded (they can’t attack and stumble about, −40% speed). |

#### Tidewater (Moka)

| Skill → charged release | Stage payoff (normal → Ⅰ / Ⅱ / Ⅲ) | Charge, cost | Perks (ranks · skill level) |
|---|---|---|---|
| **Splash Bolt** → *Big Splash* (staff raised)<br>A bigger orb with a much larger splash ring that slows. | damage 303 → 305 / 303 / 308%; splash 55 → 75%; splash radius 1.5 → 1.5 / 1.62 / 1.86 m; slow −30% → −45% / −50% / −55%; chill 1.7 → 2.7 / 3.4 / 4.1 s; speed 17 → 15.3 m/s; size 1.6 / 1.9 / 2.2× | 0.75 / 1.27 / 1.64 s<br>3.6 → 5.4 / 7.2 / 9 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.27 s, then Ⅲ at 1.64 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.64 / 0.52 / 0.41 s<br>**Split Shot** (2 · Lv 2 / 6): +1 / 2 extra orbs (50% each), fanned<br>★ **Rain Shower** (1 · Lv 8): A charged bolt bursts into a rain of mini bolts over 2.5 m: 5 / 7 / 9 by stage, 12% each with a little splash. |
| **Bubble Barrier** → *Mega Bubble* (blowing a bubble)<br>A much bigger bubble that soaks far more and pops harder. | absorb 230 → 345 / 460 / 633; damage 189 → 284 / 378 / 520%; radius 3.2 → 4.16 / 4.8 / 5.6 m; knockback 2.2 → 3.08 | 0.9 / 1.53 / 1.97 s<br>14.5 → 21.8 / 29 / 36.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>★ **Bubble Wrap** (1 · Lv 4): A charged bubble also wraps Shadow and the Spirit Retriever (40% as strong).<br>★ **Bounce House** (1 · Lv 10): Foes that touch a charged bubble boing back 2 m and are chilled (once per second each). |
| **Wet Dog Shake** → *Big Shake* (braced to shake)<br>A bigger, colder shake; at Stage Ⅲ it freezes foes solid for a moment. | damage 246 → 336 / 448 / 534%; radius 3.8 → 4.94 / 5.7 / 6.65 m; chill 2.8 → 4.2 / 5.6 / 7.7 s; freeze 0 / 0 / 0.8 s | 0.9 / 1.53 / 1.97 s<br>13.1 → 19.7 / 26.2 / 32.8 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>**Second Shake** (1 · Lv 8): The charged release repeats once 0.45s later at 50% power<br>★ **Puddle Party** (1 · Lv 10): A charged shake leaves 3 / 4 / 5 chilly puddles around Moka for 5s (−40% speed to foes in them). |
| **Puddle Hop** → *Cannonball* (crouch)<br>A longer hop and a much bigger arrival splash. | range 9 → 11.7 / 13.5 / 15.8 m; damage 170 → 171 / 177 / 201%; radius 2.2 → 2.64 / 3.74 / 4.4 m; knockback 1.4 → 2.1 | 0.85 / 1.44 / 1.86 s<br>10.3 → 15.5 / 20.6 / 25.8 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.44 s, then Ⅲ at 1.86 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.72 / 0.6 / 0.47 s<br>★ **Return Trip** (1 · Lv 4): The dive puddle stays for 4s: Puddle Hop again in that time to hop back to it for free.<br>★ **Hopscotch** (1 · Lv 10): A charged hop bounces on to 2 more foes within 5 m, splashing each for 60%. |
| **Whirlpool** → *Maelstrom* (staff raised)<br>A bigger, longer whirlpool with a much stronger pull. | radius 3.5 → 3.5 / 3.66 / 3.87 m; lasts 4 → 4 / 4.4 / 5.05 s; pull 3.2 → 4.48 / 5.44 / 6.4 m/s; damage 85 → 85 / 86 / 86% | 1 / 1.7 / 2.19 s<br>21.4 → 32.1 / 42.8 / 53.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.7 s, then Ⅲ at 2.19 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.85 / 0.7 / 0.55 s<br>★ **Riptide** (1 · Lv 6): A charged whirlpool drifts after your cursor at 1.5 m/s.<br>★ **Geyser** (1 · Lv 10): A charged whirlpool ends in a geyser: 250% in its radius, and foes are launched (1s stun). |
| **Great Wave** → *Rogue Wave* (staff raised)<br>A wider, harder-hitting wave with a longer chill and a longer surf. | damage 588 → 741 / 788 / 792%; width 6 → 7.5 / 8.7 / 10.2 m; chill 3 → 3.9 / 4.8 / 6 s; surf 2.4 → 3.1 s | 1.1 / 1.87 / 2.41 s<br>47 → 70.5 / 94 / 117.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.87 s, then Ⅲ at 2.41 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.94 / 0.77 / 0.61 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Tsunami** (1 · Lv 12, needs Stage Ⅲ): Stage Ⅲ waves travel twice as far and carry foes all the way (even bosses, a little). |

#### Starlight Kibble (Moka)

| Skill → charged release | Stage payoff (normal → Ⅰ / Ⅱ / Ⅲ) | Charge, cost | Perks (ranks · skill level) |
|---|---|---|---|
| **Kibble Missiles** → *Kibble Swarm* (staff raised)<br>A bigger handful of kibble that homes in harder. | count 4 → 5 / 6 / 7; damage 81 → 89 / 90 / 90%; homing 5 → 8 | 0.75 / 1.27 / 1.64 s<br>4.4 → 6.6 / 8.8 / 11 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.27 s, then Ⅲ at 1.64 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.64 / 0.52 / 0.41 s<br>**Encore** (1 · Lv 8): The charged release repeats once 0.45s later at 50% power<br>★ **Twinkle Twinkle** (1 · Lv 8): Each charged kibble that hits leaves a twinkle that bursts 0.8s later: 30% in 1.2 m. |
| **Squeaky Nova** → *Mega Squeak* (paws to the sky)<br>A bigger, louder squeak that stuns far longer. | damage 151 → 154 / 175 / 183%; radius 4.6 → 5.98 / 6.9 / 8.05 m; stun 1.4 → 2.1 / 2.8 / 3.85 s | 0.9 / 1.53 / 1.97 s<br>11.2 → 16.8 / 22.4 / 28 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>★ **Squeak Squeak** (1 · Lv 4): The charged nova squeaks again 1 / 2 / 3 more times by stage (25% each).<br>★ **Seeing Stars** (1 · Lv 10): Foes stunned by a charged squeak shower their neighbours with stars: 12% every 0.5s while stunned. |
| **Paw Rune** → *Grand Paw* (staff raised)<br>A bigger rune that arms instantly and tugs nearby foes toward it. | damage 388 → 390 / 450 / 501%; radius 2.7 → 3.39 / 4.05 / 4.73 m; arms in 0.6 → 0 s; stun 0.4 → 0.6 s; tug 4 m | 0.9 / 1.53 / 1.97 s<br>14.5 → 21.8 / 29 / 36.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>**Paw Prints** (2 · Lv 2 / 6): +1 / 2 extra runes (50% each), fanned<br>★ **Paw Parade** (1 · Lv 10): A charged rune’s eruption stamps 2 small runes (50%) where it flung foes. |
| **Moonbeam** → *Full Moon* (paws to the sky)<br>Hold to gather the moon: at Stage Ⅰ a bigger beam comes down and keeps growing while held; let go and it lingers on its own, then bursts. | damage 123 → 123 / 124 / 127%; radius 1.5 → 1.5 / 1.5 / 1.56 m; lingers 0.6 / 0.9 / 1.2 s; burst 70% | 0.9 / 1.53 / 1.97 s<br>10.2 → 15.3 / 20.4 / 25.5 zoom per second | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>★ **Twin Moons** (1 · Lv 6, needs Stage Ⅱ): From Stage Ⅱ a second, smaller beam (30%) circles the first.<br>★ **Crescent Cut** (1 · Lv 10): The lingering beam ends in a crescent wave that sweeps 5 m: 70%. |
| **Constellation Link** → *Great Constellation* (staff raised)<br>More stars over longer links, and a brighter second twinkle. | damage 275 → 364 / 440 / 528%; links 6 → 8 / 9 / 11; link range 7 → 9.1 m; twinkle 40 → 60 / 80 / 100% | 0.9 / 1.53 / 1.97 s<br>19.4 → 29.1 / 38.8 / 48.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>★ **Star Chart** (1 · Lv 4): The lines stay for 3s as starlight threads: 30% zap every 0.5s to foes touching them.<br>★ **Big Dipper** (1 · Lv 10): When 7 or more stars link, a giant ladle of starlight scoops down on the middle: 250% in 3 m. |
| **Treat Meteor** → *Mega Meteor* (paws to the sky)<br>A bigger biscuit, a bigger crater, more crumbs. | damage 816 → 991 / 1028 / 1032%; radius 3.9 → 5.07 / 5.85 / 6.83 m; stun 1 → 1.5 s; burn 66 → 80 / 62 / 46%/s; size 1.1 / 1.2 / 1.3× | 1.1 / 1.87 / 2.41 s<br>49 → 73.5 / 98 / 122.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.87 s, then Ⅲ at 2.41 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.94 / 0.77 / 0.61 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Meteor Shower** (1 · Lv 12, needs Stage Ⅲ): A Stage Ⅲ meteor is followed by 4 smaller biscuits around the crater (25% each). |

#### Duck Hunt (Moka)

| Skill → charged release | Stage payoff (normal → Ⅰ / Ⅱ / Ⅲ) | Charge, cost | Perks (ranks · skill level) |
|---|---|---|---|
| **Decoy Duck** → *Mother Duck* (staff twirl)<br>An empowered rubber duck: bigger, tougher, with a wider lure and a bigger pop. | life 270 → 405 / 540 / 743; lure 7 → 9 / 10 / 11 m; damage 198 → 199 / 234 / 289%; pop radius 2.4 → 2.79 / 3.36 / 3.84 m; size 1.3 / 1.5 / 1.7× | 0.9 / 1.53 / 1.97 s<br>14.5 → 21.8 / 29 / 36.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>★ **Ducklings** (1 · Lv 4): The Mother Duck brings 2 / 3 / 4 ducklings by stage; each pops for 30% when bitten.<br>★ **Quack Attack** (1 · Lv 10): The Mother Duck’s pop is a quack shockwave: everything within 4 m is dazed for 1.5s. |
| **Fetch!** → *Long Leash* (staff raised)<br>A much longer leash, and the yank slams the foe down at Moka’s paws with a splash. | damage 189 → 190 / 189 / 192%; range 11 → 15.4 / 18.7 / 22 m; stun 1.5 → 2.25 / 3 / 4.13 s; slam splash 10 / 18 / 25%; grabs 1 | 0.85 / 1.44 / 1.86 s<br>8.7 → 13.1 / 17.4 / 21.8 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.44 s, then Ⅲ at 1.86 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.72 / 0.6 / 0.47 s<br>★ **Double Leash** (1 · Lv 6): From Stage Ⅱ a charged leash grabs two foes.<br>★ **Fling** (1 · Lv 10): Yanked foes sail over Moka and land behind her: 50% to every foe where they land. |
| **Feather Flurry** → *Feather Storm* (staff raised)<br>A huge fan of feathers that pierce deeper and fly further. | count 10 → 11 / 12 / 15; damage 109 → 109 / 110 / 110%; range 8 → 9.6 m; pierce 1 → 2 / 3 / 4 | 0.8 / 1.36 / 1.75 s<br>10.2 → 15.3 / 20.4 / 25.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.36 s, then Ⅲ at 1.75 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.68 / 0.56 / 0.44 s<br>**Second Flurry** (1 · Lv 8): The charged release repeats once 0.45s later at 50% power<br>★ **Pillow Fight** (1 · Lv 8): Charged feathers stick; a foe with 3 in it puffs into fluff: 60% damage and a 1s stun. |
| **Duck Call** → *Big Honk* (call to the lips)<br>A louder call over a wider area, with a much longer daze. | radius 6 → 7.8 / 9 / 10.5 m; stun 1.6 → 2.4 / 3.2 / 4.4 s; damage 132 → 168 / 169 / 171% | 0.9 / 1.53 / 1.97 s<br>18.5 → 27.8 / 37 / 46.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>★ **Bread Crumbs** (1 · Lv 4): Gathered foes linger at the lure 2s longer, slowed by 50%.<br>★ **Goose!** (1 · Lv 10, needs Stage Ⅲ): A Stage Ⅲ call brings an angry spectral goose that honks and bites the crowd 3 times (60% each). |
| **Spirit Retriever** → *Golden Retriever* (staff twirl)<br>An empowered, golden spirit retriever: bigger, tougher and harder-biting. | life 420 → 630 / 840 / 1155; damage 189 → 189 / 255 / 255%; bark daze 0.6 → 0.9 s; size 1.15 / 1.3 / 1.45× | 1 / 1.7 / 2.19 s<br>31 → 46.5 / 62 / 77.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.7 s, then Ⅲ at 2.19 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.85 / 0.7 / 0.55 s<br>★ **Good Girl!** (1 · Lv 6): A charged summon heals the retriever fully and sends it into a 6s frenzy (+40% bite speed), even if it is already out.<br>★ **Puppy Pal** (1 · Lv 12, needs Stage Ⅲ): At Stage Ⅲ a spirit puppy comes along too (40% of the retriever). |
| **Mallard Squadron** → *Great V* (paws to the sky)<br>A bigger squadron over a wider area. | count 7 → 8 / 8 / 13; damage 341 → 344 / 344 / 383%; area 4.3 → 4.3 / 4.3 / 6.45 m | 1.1 / 1.87 / 2.41 s<br>45 → 67.5 / 90 / 112.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.87 s, then Ⅲ at 2.41 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.94 / 0.77 / 0.61 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Loop-de-Loop** (1 · Lv 12, needs Stage Ⅲ): After diving, the squadron loops round and dives again at 50%. |

#### Shuriken Arts (Poe)

| Skill → charged release | Stage payoff (normal → Ⅰ / Ⅱ / Ⅲ) | Charge, cost | Perks (ranks · skill level) |
|---|---|---|---|
| **Fūma Throw** → *Great Fūma* (the fūma coiled back in both paws)<br>Coil the giant fūma back in both paws: it flies out bigger and further, hits harder on both passes, and spins up so fast it whistles. | damage 192 → 228 / 246 / 248%; range 7.7 → 9.6 / 10.8 / 12.3 m; speed 22.1 → 27.6 / 30.9 / 35.4 m/s; radius 0.62 → 0.78 / 0.87 / 0.99 m; knockback 0.35 → 0.56; size 1.2 / 1.32 / 1.45× | 0.8 / 1.36 / 1.75 s<br>4.4 → 6.6 / 8.8 / 11 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.36 s, then Ⅲ at 1.75 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.68 / 0.56 / 0.44 s<br>**Twin Fūma** (2 · Lv 2 / 6): +1 / 2 extra smokys (50% each), fanned<br>★ **Orbiting Fūma** (1 · Lv 10): At the end of its flight the charged fūma circles there for 0.6 / 0.9 / 1.2s by stage, cutting everything within 1.6 m every 0.3s (50%). |
| **Kunai Fan** → *Kunai Storm* (kunai fanned at the chest)<br>A much bigger pawful of kunai, fanned tighter and flung harder: up to twice as many at Stage Ⅲ. | fan 60 → 51°; speed 20 → 24 m/s; extra 2 / 4 / 6 | 0.75 / 1.27 / 1.64 s<br>8.7 → 13.1 / 17.4 / 21.8 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.27 s, then Ⅲ at 1.64 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.64 / 0.52 / 0.41 s<br>**Bigger Pawful** (2 · Lv 2 / 6): +1 kunai per stage reached (+3 at Stage Ⅲ)<br>★ **Exploding Tags** (1 · Lv 10): Every charged kunai carries a paper tag that pops 0.5s after it lands: 25% fire in 1.2 m. |
| **Shadow Stitch** → *Grand Stitch* (kunai fanned at the chest)<br>The kunai go in deeper: a wider patch of shadows is stitched down, and for much longer. | damage 237 → 245 / 322 / 417%; root 2 → 3 / 4 / 5.5; radius 2 → 2.6 / 3 / 3.5 m | 0.85 / 1.44 / 1.86 s<br>11.6 → 17.4 / 23.2 / 29 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.44 s, then Ⅲ at 1.86 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.72 / 0.6 / 0.47 s<br>**Wide Arc** (2 · Lv 2 / 6): +15% / +30% charged stitch<br>★ **Needle and Thread** (1 · Lv 8): The thread pulls the stitched foes together toward the middle while they’re pinned (1.5 m/s). |
| **Whirling Fūma** → *Buzz-saw Fūma* (the fūma coiled back in both paws)<br>A bigger spare fūma, planted with a flourish: it spins longer, reaches wider and tugs much harder. | damage 87 → 87 / 88 / 88%; radius 2 → 2.2 / 2.39 / 2.6 m; lasts 5.5 → 6.05 / 6.71 / 7.48 s; pull 1.2 → 1.8 / 2.4 / 3.12 m/s; size 1.15 / 1.25 / 1.35× | 0.9 / 1.53 / 1.97 s<br>16.5 → 24.8 / 33 / 41.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>★ **Wandering Saw** (1 · Lv 6): The charged saw drifts toward the nearest foe at 1.5 m/s.<br>★ **Bone Shrapnel** (1 · Lv 10): When the charged saw stops it bursts into 8 bone shards that fly out and pierce one foe each (120% of a bite). |
| **Shuriken Rain** → *Shuriken Monsoon* (a low ninja crouch)<br>Crouch low for a bigger leap: far more shuriken hail down over a wider patch. | count 20 → 26 / 32 / 40; damage 144 → 181 / 204 / 204%; radius 3.5 → 4.02 / 4.55 / 5.25 m | 1 / 1.7 / 2.19 s<br>25.2 → 37.8 / 50.4 / 63 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.7 s, then Ⅲ at 2.19 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.85 / 0.7 / 0.55 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Falling Star** (1 · Lv 12, needs Stage Ⅲ): A Stage Ⅲ rain ends with one giant bone shuriken slamming the middle: 80% in 2.5 m, and a big knockback. |
| **Thousand Star Flurry** → *Galaxy Flurry* (arms crossed, winding up)<br>Wind up the spin: the galaxy of shuriken spreads wider and whirls longer. | damage 74 → 74 / 75 / 75%; radius 5 → 5.49 / 5.98 / 6.46 m; lasts 2.1 → 2.36 / 2.62 / 2.95 s; pull 0.8 → 1.12 m/s | 1.1 / 1.87 / 2.41 s<br>43 → 64.5 / 86 / 107.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.87 s, then Ⅲ at 2.41 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.94 / 0.77 / 0.61 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Supernova** (1 · Lv 12, needs Stage Ⅲ): A Stage Ⅲ flurry ends with every star going off at once: 150% of a tick to every foe in reach. |

#### Ninjutsu (Poe)

| Skill → charged release | Stage payoff (normal → Ⅰ / Ⅱ / Ⅲ) | Charge, cost | Perks (ranks · skill level) |
|---|---|---|---|
| **Smoke Bomb** → *Smoke Screen* (a hand seal, eyes closed)<br>Hold the seal for a much bigger pepper cloud: it blinds longer and hides her for longer. | damage 99 → 110 / 123 / 133%; radius 3.1 → 4.03 / 4.65 / 5.43 m; blind 4 → 6 / 8 / 11; miss 50 → 55 / 60 / 65; vanish 1.7 → 2.4 / 3.1 / 4.1 | 0.8 / 1.36 / 1.75 s<br>9.7 → 14.6 / 19.4 / 24.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.36 s, then Ⅲ at 1.75 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.68 / 0.56 / 0.44 s<br>★ **Extra Pepper** (1 · Lv 4): Foes inside a charged cloud cough and sneeze: 30% every second while they’re in it (3s).<br>★ **Perfect Stealth** (1 · Lv 10): A charged smoke bomb never makes her sneeze, and her first hit out of it is a double crit. |
| **Fire Release: Puff Ball** → *Great Fireball* (cheeks puffing up)<br>Puff those cheeks right out: a much bigger fireball with a wider, hotter burst. | damage 227 → 228 / 227 / 231%; splash 60 → 75%; radius 1.8 → 1.8 / 2.3 / 2.7 m; burn 41 → 33 / 28 / 24%/s; size 1.35 / 1.6 / 1.9× | 0.75 / 1.27 / 1.64 s<br>7.3 → 11 / 14.6 / 18.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.27 s, then Ⅲ at 1.64 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.64 / 0.52 / 0.41 s<br>**Ember Spit** (2 · Lv 2 / 6): +1 / 2 extra fireballs (50% each), fanned<br>★ **Bouncing Ember** (1 · Lv 8): After its burst the charged fireball hops on to 2 more foes nearby, bursting on each (50%). |
| **Shadow Clone** → *Clone Army* (a hand seal, eyes closed)<br>A longer seal for more copies: tougher clones that copy her harder, and a third one from Stage Ⅱ. | clones 2 → 2 / 3 / 3; clonePct 57 → 63 / 68 / 74; lasts 17 → 20.4 s; lifeMul 1.5 / 2 / 2.75 | 0.9 / 1.53 / 1.97 s<br>18.5 → 27.8 / 37 / 46.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>★ **Look Over Here!** (1 · Lv 4): Charged clones wave their arms: foes within 5 m go for them first.<br>★ **Clone Pop** (1 · Lv 10): Charged clones burst in pepper smoke when they go: 80% stink in 2 m and a 2s blind. |
| **Substitution** → *Log Fort* (a hand seal, eyes closed)<br>A longer blink, and a sturdier log that lures for longer and goes off bigger. | range 9 → 11.7 / 13.5 / 15.8 m; logLife 2.5 → 3.3 / 4 / 5; damage 151 → 152 / 151 / 154%; pop radius 2.2 → 2.2 / 2.2 / 2.33 m; blind 1.5 → 2.3 | 0.75 / 1.27 / 1.64 s<br>10.7 → 16 / 21.4 / 26.8 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.27 s, then Ⅲ at 1.64 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.64 / 0.52 / 0.41 s<br>★ **Two Logs** (1 · Lv 6): A charged substitution leaves a second log beside the first.<br>★ **Splinters** (1 · Lv 10): The charged log pops into 6 splinters that fly out (40% each). |
| **Lightning Release: Thunder Paw** → *Thunder God Paw* (a crackling paw held high)<br>Hold the crackling paw high: the bolt leaps to far more foes and loses less on every jump. | damage 294 → 318 / 401 / 437%; chains 5 → 7 / 8 / 10; chainRange 6 → 7.2; falloff 10 → 8 / 6 / 4; stun 0.35 → 0.52 s | 0.85 / 1.44 / 1.86 s<br>21.4 → 32.1 / 42.8 / 53.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.44 s, then Ⅲ at 1.86 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.72 / 0.6 / 0.47 s<br>**Rolling Thunder** (1 · Lv 8): The charged release repeats once 0.45s later at 50% power<br>★ **Thunderhead** (1 · Lv 10): A charged bolt leaves a little storm cloud over the target for 3s: it zaps a foe beneath it every 0.5s (30%). |
| **Smoke Dragon** → *Great Smoke Dragon* (three seals, faster and faster)<br>Three slow seals instead of a quick one: a bigger, longer dragon that sweeps a wider path. | damage 588 → 591 / 588 / 598%; length 15 → 18 / 20.3 / 22.5 m; width 3.6 → 3.81 / 3.99 / 4.14 m; blind 3 → 3.9 | 1.1 / 1.87 / 2.41 s<br>47 → 70.5 / 94 / 117.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.87 s, then Ⅲ at 2.41 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.94 / 0.77 / 0.61 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Twin Dragons** (1 · Lv 12, needs Stage Ⅲ): A Stage Ⅲ seal sends a second dragon sweeping back the other way (30%). |

#### Shadow Step (Poe)

| Skill → charged release | Stage payoff (normal → Ⅰ / Ⅱ / Ⅲ) | Charge, cost | Perks (ranks · skill level) |
|---|---|---|---|
| **Shadow Step** → *Shadow Ambush* (a low ninja crouch)<br>Crouch into the dark: a longer step, and she comes out of it in a much harder, surer cut. | damage 538 → 549 / 646 / 681%; range 10 → 13 / 15 / 17.5 m; critBonus 38 → 48 / 58 / 68 | 0.7 / 1.19 / 1.53 s<br>4.1 → 6.1 / 8.2 / 10.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.19 s, then Ⅲ at 1.53 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.6 / 0.49 / 0.39 s<br>**Second Shadow** (1 · Lv 8): The charged release repeats once 0.45s later at 50% power<br>★ **Sure Kill** (1 · Lv 8): The strike out of a charged step is always a critical hit. |
| **Afterimage Dash** → *Mirage Dash* (a low ninja crouch)<br>Crouch for a much longer dash that leaves more afterimages — and they burst bigger. | damage 165 → 165 / 174 / 196%; dash 7.5 → 7.5 / 15 / 20.63 m; images 3 → 4 / 5 / 6; burst 71 → 71 / 75 / 84%; burstRadius 1.5 → 1.8 / 2.03 / 2.25 | 0.75 / 1.27 / 1.64 s<br>7.8 → 11.7 / 15.6 / 19.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.27 s, then Ⅲ at 1.64 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.64 / 0.52 / 0.41 s<br>★ **Rewind** (1 · Lv 4): At the end of a charged dash she dashes straight back through the line, hitting everything again.<br>★ **Mirage** (1 · Lv 10): The charged afterimages linger 2s as decoys (foes within 5 m go for them) before they burst. |
| **Vanish** → *Deep Vanish* (a hand seal, eyes closed)<br>Think very, very invisible thoughts: she stays gone longer and the strike that ends it lands much harder. | lasts 6 → 7.8 / 9.6 / 12 s; moveBuff 20 → 25 / 30 / 35; bonusPct 94 → 141 / 188 / 259 | 0.9 / 1.53 / 1.97 s<br>13.6 → 20.4 / 27.2 / 34 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>★ **Smoke Exit** (1 · Lv 6): Leaving a charged Vanish (with that first strike) puffs a pepper cloud at her feet: foes within 2.5 m are blinded for 2s.<br>★ **Assassin** (1 · Lv 10): The strike out of a charged Vanish is a TRIPLE crit, and it hits everything within 1.8 m of its target too. |
| **Caltrop Flip** → *Caltrop Carpet* (a low ninja crouch)<br>A bigger flip and a whole carpet of caltrops that lasts longer and slows harder. | damage 60 → 62 / 67 / 67%; radius 2.8 → 3.64 / 4.2 / 4.9 m; lasts 5.5 → 6.6 / 7.7 / 8.8 s; slow 0.5 → 0.55 / 0.6 / 0.65; flip 3.2 → 4 | 0.75 / 1.27 / 1.64 s<br>11.2 → 16.8 / 22.4 / 28 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.27 s, then Ⅲ at 1.64 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.64 / 0.52 / 0.41 s<br>**Wide Arc** (2 · Lv 2 / 6): +15% / +30% charged carpet<br>★ **Extra Spiky** (1 · Lv 8): Charged caltrops trip foes up the first time they step on them: a 0.6s stun. |
| **Bullseye Mark** → *Big Target* (the brush up, taking aim)<br>Take careful aim: paint more foes at once, each a juicier target that bursts harder. | stackPct 70 → 81 / 84 / 98; burstRadius 2.2 → 2.64; vuln 15 → 18 / 18.8 / 21.8; marks 1 / 2 / 2 | 0.8 / 1.36 / 1.75 s<br>13.6 → 20.4 / 27.2 / 34 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.36 s, then Ⅲ at 1.75 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.68 / 0.56 / 0.44 s<br>★ **Spreading Paint** (1 · Lv 6): A bursting mark paints the nearest unmarked foe, starting it at 3 stacks.<br>★ **Jackpot** (1 · Lv 10): A charged mark that bursts at 10 stacks bursts for double. |
| **Phantom Barrage** → *Phantom Storm* (a low ninja crouch)<br>A deeper breath before the barrage: she blinks to more foes, faster, and every strike lands harder. | targets 6 → 8 / 9 / 11; damage 455 → 573 / 580 / 580%; range 10 → 12 m; interval 0.13 → 0.11 | 1.1 / 1.87 / 2.41 s<br>41 → 61.5 / 82 / 102.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.87 s, then Ⅲ at 2.41 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.94 / 0.77 / 0.61 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Grand Finale** (1 · Lv 12, needs Stage Ⅲ): A Stage Ⅲ barrage ends with one last cut on every foe she struck, all at once (25%) — and no sneeze. |

#### Flail Arts (Shih Tzu)

| Skill → charged release | Stage payoff (normal → Ⅰ / Ⅱ / Ⅲ) | Charge, cost | Perks (ranks · skill level) |
|---|---|---|---|
| **Woeful Wallop** → *Grand Wallop* (the flail wound round behind him)<br>Wind the flail round and round behind you, sighing ever more deeply: the wallop sweeps wider and further, hits much harder, and knocks the wind out of everything it catches. | damage 275 → 359 / 424 / 514%; arc 190 → 230 / 270 / 330°; radius 2.3 → 2.64 / 2.99 / 3.33 m; knockback 0.9 → 1.35 / 1.8 / 2.25; stun 0 / 0.3 / 0.6 s | 0.85 / 1.44 / 1.86 s<br>5 → 7.5 / 10 / 12.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.44 s, then Ⅲ at 1.86 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.72 / 0.6 / 0.47 s<br>★ **Aftershock** (1 · Lv 6): At the end of a charged sweep the ball slams the floor: 60% in 2 m.<br>★ **Wallop of Woe** (1 · Lv 10): Everything a charged wallop hits is hexed: one Dripping Paw stack (60% gloom a second for 5s). |
| **Tug of Woe** → *The Big Haul* (the ball whirled overhead)<br>Whirl the ball up overhead first: it flies further, wraps more foes at once, and hauls them in harder. | damage 189 → 207 / 238 / 265%; range 9.5 → 11.4 / 12.8 / 14.3 m; grab 1.6 → 2 m; hauled foes 4 → 5 / 6 / 7; daze 0.9 → 1.35 s | 0.8 / 1.36 / 1.75 s<br>8.7 → 13.1 / 17.4 / 21.8 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.36 s, then Ⅲ at 1.75 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.68 / 0.56 / 0.44 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Bonk Together** (1 · Lv 8): The charged haul knocks the foes’ heads together where they land: 70% in 1.8 m. |
| **Melancholy Maelstrom** → *Gloom Maelstrom* (the ball whirled overhead)<br>Hold to work up the whirl: at Stage Ⅰ a wider maelstrom that drags much harder starts by itself and grows while held; let go and it keeps whirling on its own for a moment. | damage 102 → 102 / 102 / 113%; radius 2.5 → 2.5 / 2.5 / 3.63 m; pull 1.6 → 2.2 / 2.9 / 3.7 m/s; spin-out 0.5 / 1 / 1.6 s | 0.9 / 1.53 / 1.97 s<br>10.2 → 15.3 / 20.4 / 25.5 zoom per second | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>★ **Drifting Gloom** (1 · Lv 4): The whirl-out drifts after your cursor at 2.5 m/s.<br>★ **Last Bonk** (1 · Lv 10): The whirl-out ends with the ball slammed down all round you: 120% and a 1s daze. |
| **Steadfast Sulk** → *The Grand Sulk* (hunkered behind the flail)<br>Sulk in advance. The guard is sturdier and lasts longer, the sulk starts already offended (the blows count from the stage), and the spin that ends it is much bigger. | guard 1.2 → 1.32 / 1.44 / 1.56 s; block 68 → 73 / 78 / 83%; damage 294 → 295 / 300 / 307%; radius 2.5 → 2.54 / 2.58 / 2.61 m; starts blows up 1 / 2 / 3 | 0.8 / 1.36 / 1.75 s<br>11.2 → 16.8 / 22.4 / 28 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.36 s, then Ⅲ at 1.75 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.68 / 0.56 / 0.44 s<br>**Wide Arc** (2 · Lv 2 / 6): +15% / +30% charged spin<br>★ **Stubborn** (1 · Lv 8): A charged sulk counts up to 2 more blows. |
| **The Heaviest Sigh** → *The Deepest Sigh* (the deepest breath)<br>Hold that breath. The sigh comes out even heavier: the shockwaves roll further, hit much harder and stun longer. | damage 332 → 423 / 471 / 475%; radius 5.5 → 6.32 / 7.15 / 7.98 m; stun 1.2 → 1.56 s; extra shockwaves 0 | 1.1 / 1.87 / 2.41 s<br>39 → 58.5 / 78 / 97.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.87 s, then Ⅲ at 2.41 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.94 / 0.77 / 0.61 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Rolling Thunder** (1 · Lv 12, needs Stage Ⅲ): A Stage Ⅲ sigh rolls 2 more shockwaves out past the last, each 25% harder than the one before. |

#### Gloom Hexes (Shih Tzu)

| Skill → charged release | Stage payoff (normal → Ⅰ / Ⅱ / Ⅲ) | Charge, cost | Perks (ranks · skill level) |
|---|---|---|---|
| **Dripping Paw** → *Great Dripping Paw* (a hex gathering on his paw)<br>Let the ghostlight pool in your paw: a bigger splat that lands harder and leaves a deeper hex: two stacks in one go, three at Stage Ⅲ. | damage 71 → 71 / 71 / 72%; radius 1.6 → 1.64 / 1.78 / 1.88 m; stacks at once 2 / 2 / 3 | 0.75 / 1.27 / 1.64 s<br>5.8 → 8.7 / 11.6 / 14.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.27 s, then Ⅲ at 1.64 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.64 / 0.52 / 0.41 s<br>**Paw Prints** (2 · Lv 2 / 6): +1 / 2 extra paws (50% each), fanned<br>★ **Gloom Puddle** (1 · Lv 8): The charged splat leaves a puddle of gloom for 3s: foes standing in it are hexed again every second. |
| **Grumble Cloud** → *Great Grumble* (both paws up, gathering gloom)<br>Work up a proper mood first: a bigger, crosser cloud that rains harder and sulks over the spot for much longer. | damage 56 → 56 / 56 / 56%; radius 2.3 → 2.51 / 2.66 / 2.82 m; lasts 7 → 7.63 / 8.26 / 8.89 s; slow 0.33 → 0.38 / 0.43 / 0.48 | 0.9 / 1.53 / 1.97 s<br>12.6 → 18.9 / 25.2 / 31.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>★ **Brooding Drift** (1 · Lv 6): The charged cloud drifts after the nearest foe at 2 m/s.<br>★ **Grumble Grumble** (1 · Lv 10): Every 1.5s the charged cloud grumbles a bolt onto one foe beneath it: 150% gloom and a 0.5s stun. |
| **Case of the Mopes** → *A Terrible Case of the Mopes* (a hex gathering on his paw)<br>A longer, heavier sigh: the mopes spread wider, last longer, and sap even more of their will to fight. | radius 3.5 → 4.2 / 4.73 / 5.25 m; lasts 7.5 → 9 / 10.5 / 12 s; weaken 35 → 40 / 45 / 50%; vulnerable 16 → 21 / 26 / 31% | 0.8 / 1.36 / 1.75 s<br>13.6 → 20.4 / 27.2 / 34 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.36 s, then Ⅲ at 1.75 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.68 / 0.56 / 0.44 s<br>**Wide Arc** (2 · Lv 2 / 6): +15% / +30% charged gloom<br>★ **Contagious Mopes** (1 · Lv 8): A moping foe that drops passes the mopes on to the nearest foe within 5 m. |
| **Mournful Awoo** → *The Grand Awoo* (head tipping back for the awoo)<br>A long breath for a longer howl: it carries further, stings harder and spreads more hex stacks. | damage 104 → 105 / 108 / 114%; radius 7 → 7 / 9.1 / 10.2 m; fan 2 → 2 / 3 / 4°; fear 0.6 → 0.9 s | 0.9 / 1.53 / 1.97 s<br>19.4 → 29.1 / 38.8 / 48.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>**Encore** (1 · Lv 8): The charged release repeats once 0.6s later at 50% power<br>★ **Chorus** (1 · Lv 10): Your ghost pups and Grandpaw howl along: each one’s howl stings everything within 2.5 m (30%). |
| **Everlasting Gloom** → *Endless Gloom* (both paws up, gathering gloom)<br>Raise the gloom higher: the great hex falls wider and deeper, its bursts are bigger, and it jumps on many more times. | hex 90 → 109 / 121 / 103%/s; radius 3.5 → 4.02 / 4.55 / 5.08 m; burst 228 → 301 / 358 / 321%; burst radius 2.4 → 2.76 m; jumps 5 → 6 / 7 / 8 | 1.1 / 1.87 / 2.41 s<br>41 → 61.5 / 82 / 102.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.87 s, then Ⅲ at 2.41 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.94 / 0.77 / 0.61 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Deep Gloom** (1 · Lv 12, needs Stage Ⅲ): A Stage Ⅲ hex lands with 2 stacks at once. |

#### Ghostlight Tome (Shih Tzu)

| Skill → charged release | Stage payoff (normal → Ⅰ / Ⅱ / Ⅲ) | Charge, cost | Perks (ranks · skill level) |
|---|---|---|---|
| **Ghost Pups** → *A Whole Litter* (reading from the tome)<br>Read a longer page: more pups tumble out, sturdier and nippier, and they stay out longer. | pups 3 → 4 / 4 / 5; nip 53 → 56 / 58 / 61%; ghost life 40 → 52 / 60 / 68% of yours; lasts 40 → 48 s | 0.9 / 1.53 / 1.97 s<br>14.5 → 21.8 / 29 / 36.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>★ **Haunting Nips** (1 · Lv 6): Charged pups’ nips hex too: one Dripping Paw stack (50% gloom a second for 4s).<br>★ **The Runt** (1 · Lv 10, needs Stage Ⅲ): A Stage Ⅲ litter has one extra-big pup that nips twice as hard. |
| **Borrowed Warmth** → *A Warm Embrace* (a hex gathering on his paw)<br>Reach out further: more threads, each draining harder, and more of the warmth comes back to you. | damage 49 → 49 / 49 / 49%; lasts 4 → 4 / 4 / 4.45 s; threads 2 → 3 / 4 / 5; heals 35 → 40 / 45 / 50% of drain; range 8 → 9.6 m | 0.8 / 1.36 / 1.75 s<br>11.2 → 16.8 / 22.4 / 28 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.36 s, then Ⅲ at 1.75 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.68 / 0.56 / 0.44 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Shared Warmth** (1 · Lv 8): Your ghosts are warmed too: they heal 50% of what the threads drain. |
| **Bone Ward** → *Bone Fortress* (reading from the tome)<br>Read the whole chapter: a much sturdier ward of more bones, and they fly harder when it breaks. | ward 24 → 28.8 / 33.6 / 38.4% life; bones 6 → 8 / 9 / 10; damage 142 → 156 / 170 / 192% | 0.85 / 1.44 / 1.86 s<br>16.5 → 24.8 / 33 / 41.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.44 s, then Ⅲ at 1.86 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.72 / 0.6 / 0.47 s<br>★ **Bone Broth** (1 · Lv 4): While a charged ward holds you mend 1% of your life a second.<br>★ **Marrow Shards** (1 · Lv 8): Charged bones fly 50% harder when the ward breaks. |
| **Wayhome Lantern** → *Beacon Home* (reading from the tome)<br>Trim the wick first: a brighter lantern with a wider pool of light that mends faster and burns longer. | lasts 12 → 14.4 / 16.8 / 19.2 s; radius 5 → 5.8 / 6.5 / 7.3 m; mends 3 → 3.6 / 4.2 / 4.8% life/s; damage 43 → 47 / 51 / 57%; rekindles at 45 → 50 / 55 / 60% life | 0.9 / 1.53 / 1.97 s<br>21.4 → 32.1 / 42.8 / 53.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Calming Light** (1 · Lv 8): Foes in the charged lantern’s light are slowed 30%. |
| **Grandpaw's Ghost** → *Great-Grandpaw* (reading from the tome)<br>Read the very last page slowly: a bigger, sturdier Grandpaw who stays longer and stomps harder. | lasts 17.5 → 21 / 24.5 / 28 s; damage 256 → 282 / 307 / 346%; radius 2.8 → 3.02 / 3.25 / 3.5 m; howl hex 85 → 94 / 102 / 115%/s; ghost life 250 → 325 / 400 / 500% of yours; size 1.08 / 1.16 / 1.25× | 1.1 / 1.87 / 2.41 s<br>44 → 66 / 88 / 110 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.87 s, then Ⅲ at 2.41 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.94 / 0.77 / 0.61 s<br>★ **Old Stories** (1 · Lv 6): A charged Grandpaw howls twice as often.<br>★ **Grandpaw’s Lantern** (1 · Lv 10): A charged Grandpaw’s lantern mends you: 1% life a second while you’re within 5 m of him. |

#### Lance Arts (Foosy)

| Skill → charged release | Stage payoff (normal → Ⅰ / Ⅱ / Ⅲ) | Charge, cost | Perks (ranks · skill level) |
|---|---|---|---|
| **Sunbeam Thrust** → *Noonday Thrust* (crouched over the lance drawn right back)<br>Crouch lower and draw the lance further back while the sunbeam gathers: the thrust flashes further and wider down its line, hits much harder and staggers what it pokes. | damage 299 → 323 / 359 / 411%; length 4.2 → 5.04 / 5.67 / 6.3 m; width 0.6 → 0.72 / 0.81 / 0.9 m; knockback 0.6 → 0.84 / 1.08 / 1.32; stun 0 / 0.2 / 0.4 s | 0.8 / 1.36 / 1.75 s<br>5 → 7.5 / 10 / 12.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.36 s, then Ⅲ at 1.75 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.68 / 0.56 / 0.44 s<br>**Wide Beam** (2 · Lv 2 / 6): +15% / +30% charged sunbeam<br>★ **Second Sun** (1 · Lv 8): A second sunbeam flashes down the same line 0.25s later: 50%. |
| **Sunfall Jump** → *High Noon* (coiled for the Jump)<br>Coil up like a spring: the Jump goes higher, hangs longer against the sun, and the crash is wider, harder and stuns for longer. | damage 398 → 472 / 573 / 668%; radius 2.8 → 3.22 / 3.64 / 4.06 m; stun 0.8 → 1 / 1.2 / 1.4 s; knockback 1.2 → 1.56 / 1.92 / 2.28; leap height 1.1 / 1.2 / 1.3× | 0.9 / 1.53 / 1.97 s<br>13.1 → 19.7 / 26.2 / 32.8 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>**Wide Arc** (2 · Lv 2 / 6): +15% / +30% charged crash<br>★ **Embers Below** (1 · Lv 8): The crater of a charged Jump smoulders for 3s: foes in it burn for 40% a second. |
| **Pinwheel Sweep** → *Whirling Pinwheel* (the lance wound round behind him)<br>Wind the lance further round behind you: it sweeps further and harder, and from Stage Ⅱ it comes round a second time (60%). | damage 237 → 284 / 284 / 345%; radius 3.2 → 3.52 / 3.78 / 4 m; knockback 1.1 → 1.38 / 1.65 / 1.93; turns 1 / 2 / 2; second turn 60% | 0.8 / 1.36 / 1.75 s<br>8.7 → 13.1 / 17.4 / 21.8 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.36 s, then Ⅲ at 1.75 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.68 / 0.56 / 0.44 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Leaf Gust** (1 · Lv 8): The last turn throws out a ring of leaves that blows foes away: 40% in 1.5 m past the lance. |
| **Gallant Charge** → *Thundering Charge* (the lance couched, pawing the ground)<br>Paw the ground and lower the lance: the charge runs further and wider and hits much harder; from Stage Ⅱ it carries the foes it catches along on the lance and drops them, dizzy, where it stops. | damage 313 → 338 / 351 / 370%; dash 7.5 → 9 / 10.5 / 12 m; width 1.2 → 1.32 / 1.44 / 1.56 m; speed 16 → 17.6 / 19.2 / 20.8 m/s | 0.85 / 1.44 / 1.86 s<br>13.6 → 20.4 / 27.2 / 34 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.44 s, then Ⅲ at 1.86 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.72 / 0.6 / 0.47 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Grand Skid** (1 · Lv 8): A charged charge ends in a skidding stop that bonks everything round him: 60% in 2 m. |
| **Starfall Lance** → *Shooting Star* (the lance wound back overhead)<br>Rise up onto your toes and throw with everything: the star falls wider and harder, stuns longer, and its crater smoulders hotter. | damage 626 → 789 / 801 / 809%; radius 3.6 → 4.14 / 4.68 / 5.22 m; stun 1 → 1.2 / 1.4 / 1.6 s; burn 57 → 72 / 73 / 74%/s | 1.1 / 1.87 / 2.41 s<br>41 → 61.5 / 82 / 102.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.87 s, then Ⅲ at 2.41 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.94 / 0.77 / 0.61 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Constellation** (1 · Lv 12, needs Stage Ⅲ): A Stage Ⅲ throw brings two small stars down first, either side of the spot: 50% each in 1.6 m. |

#### Javelins (Foosy)

| Skill → charged release | Stage payoff (normal → Ⅰ / Ⅱ / Ⅲ) | Charge, cost | Perks (ranks · skill level) |
|---|---|---|---|
| **Bonk Dart** → *Big Bonk* (a javelin cocked behind his ear)<br>Pick a heavier javelin: it bonks much harder, splashes wider round its foe and leaves everyone it bonks seeing stars. | damage 275 → 326 / 330 / 333%; splash 50 → 60 / 65 / 70%; splash radius 1.3 → 1.5 / 1.69 / 1.89 m; daze 0.3 / 0.5 / 0.7 s | 0.75 / 1.27 / 1.64 s<br>3.7 → 5.6 / 7.4 / 9.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.27 s, then Ⅲ at 1.64 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.64 / 0.52 / 0.41 s<br>**Twin Darts** (2 · Lv 2 / 6): +1 / 2 extra javelins (50% each), fanned<br>★ **Wobbly Bonk** (1 · Lv 6): A charged dart bonks off its foe onto the nearest other foe within 4 m: 50%. |
| **Tailwag Volley** → *Full Wag* (a pawful of javelins wound back)<br>A proper wind-up wag: more javelins in a wider fan, each one thrown harder. | count 6 → 8 / 9 / 10; fan 60 → 70 / 80 / 90°; damage 177 → 189 / 222 / 236% | 0.8 / 1.36 / 1.75 s<br>7.2 → 10.8 / 14.4 / 18 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.36 s, then Ⅲ at 1.75 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.68 / 0.56 / 0.44 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>**Second Wag** (1 · Lv 8): The charged release repeats once 0.45s later at 50% power |
| **True Flight** → *Truest Flight* (a deep turn, the javelin drawn right back)<br>Take a longer breath and a deeper turn: the javelin flies further and wider and bonks much harder all along the line. | damage 294 → 304 / 318 / 348%; range 16 → 18.4 / 20.8 / 23.2 m; width 0.55 → 0.66 / 0.77 / 0.88 m | 0.85 / 1.44 / 1.86 s<br>11.6 → 17.4 / 23.2 / 29 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.44 s, then Ⅲ at 1.86 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.72 / 0.6 / 0.47 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Twin Flight** (1 · Lv 8): A second javelin follows the first 0.25s later: 50%. |
| **Emberleaf Javelin** → *Bonfire Javelin* (a javelin cocked behind his ear)<br>Let the emberleaf catch properly before you throw: a bigger burst, hotter embers, and a smoulder that lasts longer. | damage 436 → 451 / 558 / 671%; radius 2.6 → 2.99 / 3.38 / 3.77 m; burn 55 → 57 / 70 / 85%/s; smoulder 3 → 3.9 s | 0.9 / 1.53 / 1.97 s<br>16.5 → 24.8 / 33 / 41.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.53 s, then Ⅲ at 1.97 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.77 / 0.63 / 0.5 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Kindling** (1 · Lv 8): The burst throws two little embers onto foes nearby: 40% fire in 1.2 m each. |
| **Sunshower** → *Cloudburst* (both paws in the quiver)<br>Reach right down to the bottom of the quiver: many more javelins, a wider rain, and they fall harder. | count 24 → 28 / 31 / 34; radius 4 → 4.4 / 4.8 / 5.2 m; damage 218 → 307 / 314 / 315% | 1.1 / 1.87 / 2.41 s<br>39 → 58.5 / 78 / 97.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.87 s, then Ⅲ at 2.41 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.94 / 0.77 / 0.61 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Rainbow** (1 · Lv 12, needs Stage Ⅲ): A Stage Ⅲ sunshower ends with 6 javelins landing together on the middle: 60% each in 1.5 m. |

#### Whelp Bond (Foosy)

| Skill → charged release | Stage payoff (normal → Ⅰ / Ⅱ / Ⅲ) | Charge, cost | Perks (ranks · skill level) |
|---|---|---|---|
| **Ember Breath** → *Big Breath* (a paw up, calling Shadow)<br>Let Shadow take a really big breath: a longer, wider cone of embers, more puffs of it, and hotter smoulders. | damage 69 → 69 / 77 / 77%; puffs 3 → 4 / 4 / 5; range 4.5 → 5.2 / 5.9 / 6.5 m; arc 50 → 57.5 / 65 / 70°; burn 30 → 30 / 33 / 33%/s | 0.75 / 1.27 / 1.64 s<br>7.3 → 11 / 14.6 / 18.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.27 s, then Ⅲ at 1.64 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.64 / 0.52 / 0.41 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>**Wide Arc** (2 · Lv 2 / 6): +15% / +30% charged cone |
| **Divebomb Swoop** → *Loop-the-Loop* (a paw up, calling Shadow)<br>Shadow climbs even higher first: a harder, wider splash, and at Stage Ⅲ he loops round and divebombs a second time (25%). | damage 332 → 334 / 339 / 347%; radius 2.1 → 2.44 / 2.6 / 2.6 m; burn 40 → 40 / 41 / 42%/s; loops 0 / 0 / 1; loop 25% | 0.8 / 1.36 / 1.75 s<br>11.6 → 17.4 / 23.2 / 29 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.36 s, then Ⅲ at 1.75 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.68 / 0.56 / 0.44 s<br>**Efficient Focus** (2 · Lv 3 / 8): +35 / 20% zoom per stage<br>★ **Scorched Earth** (1 · Lv 8): Each charged swoop leaves a scorch: foes standing in it burn for 30% a second for 2s. |
| **Wing Shield** → *Great Wings* (a paw up, calling Shadow)<br>Shadow stretches his wings out further than ever: a much sturdier shield that holds longer, and a bigger gust when it goes. | ward 27 → 40.5 / 54 / 70.2% life; lasts 6 → 7 / 8 / 9 s; gust 161 → 209 / 258 / 322%; gust radius 2.5 → 2.75 / 3 / 3.25 m | 0.85 / 1.44 / 1.86 s<br>16.5 → 24.8 / 33 / 41.3 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.44 s, then Ⅲ at 1.86 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.72 / 0.6 / 0.47 s<br>★ **Warm Felt** (1 · Lv 6): While a charged shield holds you mend 1% of your life a second.<br>★ **Ember Felt** (1 · Lv 10): A foe that strikes a charged shield is singed: 40% fire. |
| **Mighty Little Roar** → *Mightier Roar* (a paw up, calling Shadow)<br>A deeper breath for a bigger squeak: the pack stays brave for longer, and it carries further. | lasts 8 → 9.2 / 10.4 / 12 s; damage buff 33 → 36 / 39 / 42%; radius 6 → 6.9 / 7.8 / 8.7 m | 0.8 / 1.36 / 1.75 s<br>19.4 → 29.1 / 38.8 / 48.5 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.36 s, then Ⅲ at 1.75 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.68 / 0.56 / 0.44 s<br>★ **Pep Talk** (1 · Lv 5): A charged roar also puts a spring in the pack’s step: +15% move speed while it lasts.<br>★ **Echoing Squeak** (1 · Lv 8): Foes in a charged roar are scared off for 1s instead of flinching. |
| **Dragon Heart** → *Elder Heart* (a paw up, calling Shadow)<br>Let Shadow's heart swell for longer: an even bigger, sturdier dragon who stays longer and sweeps harder. | lasts 12 → 14.4 / 17.4 / 20.4 s; damage 294 → 338 / 397 / 456%; burn 48 → 55 / 64 / 74%/s; Shadow's life 100 → 125 / 150 / 175+%; size 1.05 / 1.1 / 1.15× | 1.1 / 1.87 / 2.41 s<br>44 → 66 / 88 / 110 zoom | **Deeper Charge** (2 · Lv 5 / 10): Ⅱ at 1.87 s, then Ⅲ at 2.41 s<br>**Quick Wind-up** (3 · Lv 1 / 3 / 6): Stage Ⅰ in 0.94 / 0.77 / 0.61 s<br>★ **Hearth Heart** (1 · Lv 6): While Shadow is dragon-sized, you and he mend 1% of your life a second.<br>★ **Dragon's Jump** (1 · Lv 12, needs Stage Ⅲ): A Stage Ⅲ Dragon Heart ends with the two of you coming down on the nearest foe together: 250% fire in 3 m. |

## 8. Delivery
- **Phase 1 (done)**: this table; the core system (§9); the charged releases of **Crescent Chomp** (Grand Crescent + the rolling
  shockwave crescent), **Power Throw** (Fastball: pierces everything, speed lines, sonic ring) and **Splash Bolt** (Big
  Splash: a big orb, a wide slowing splash ring) with all their perks (Wide Arc, Second Draw, Split Shot, Boomerang
  Fetch, Rain Shower, plus Deeper Charge and Quick Wind-up); and the **channel wind-up** for **Whirlwind Stance** and
  **Moonbeam** (hold, wind up to Stage Ⅰ, then the charged spin / beam starts and revs up while held; let go and it
  spins on / lingers, then a dizzy burst / a moonlight burst; Whirlwind Stance's charged spin pulls foes in). These five are
  `ready` (charge on hold); every other skill keeps today's hold-to-repeat until its charged release lands. The channels'
  unique perks (Twister, Dizzy Finale, Twin Moons, Crescent Cut) come in phase 2.
- **Phase 2 (done)**: the charged releases of the other 29 skills (Chewy: Helmet Splitter, Sakura Storm, Ricochet, Multi-Fetch,
  Squeaky Decoy, Blazing Ball, Fetch Storm, Kiai!, Flash Draw, Pack Call, Onigiri Toss, War Banner Howl, Moonlit Blades; Moka: Bubble
  Barrier, Shake Off, Puddle Hop, Whirlpool, Great Wave, Kibble Volley, Squeaky Nova, Paw Rune, Constellation Link,
  Meteor, Duck Decoy, Fetch!, Feather Flurry, Duck Call, Spirit Retriever, Mallard Squadron) with all their perks, the
  channels' unique perks (Twister, Dizzy Finale, Twin Moons, Crescent Cut), the empowered summons (Giant Squeaker, the
  alpha pup, Mega Duck, the golden Spirit Retriever), the wind-up poses, and the K-panel Charge drawer. All 34 tables
  are `ready`. Look review: every release shot with `tools/qa/charge-shots.mjs` (sheets in
  `tools/blender/work/charge/shots/sheets`), fixed until the foes stay readable through it.
- **Phase 3 (done)**: the "Hold to power up!" guide (`world/guides.js`, Shadow); `tools/qa/s19-charge.mjs` (in run-all);
  unit tests and the DPS-band sim in `tools/test-rpg.mjs` (`tools/charge-sim.mjs`); the balance pass; perf (a held charge
  allocates nothing per frame; a burst of fully charged Ⅲ releases frames like the tapped burst); the phase-2 review notes
  (a tighter Moonbeam, charged dashes held to the walkable floor, bolder Moka wind-ups); full QA + prod-smoke; docs.
- **The Shih Tzu (H-4 checkpoint 2)**: his 15 tables in `src/rpg/chargeShihtzu.js` (merged as Poe's are), the releases in
  `src/combat/chargedShihtzu.js`, his models in `tools/charge-sim-shihtzu.mjs` (merged into `charge-sim.mjs`, with a channel:
  the Maelstrom), his wind-ups in `actors/shihtzuPoses.js`; solved, every damage table ×1.21–1.22 at Ⅲ; s19 sweeps him.
  His hex tables floor their dot at the tap's, so a charged hex is never weaker (`Math.max(1, curve × tune)`).

## 9. As built (where the code took a better path than the plan)
- **Code map**: data + pure rules `src/rpg/charge.js` (the CHARGE table, `chargeRuntime`, `stageTimes`, `chargeCost`,
  `canLearnPerk` / `learnPerk`, `chargeInfo`); the hold state machine `src/combat/charge.js` (`G.skills.charge`); charged
  releases `src/combat/chargedSkills.js` (`charged_<id>`, mixed into SkillRunner like Moka's spells); looks
  `src/gfx/chargeFx.js` (a VFX extension like SpellFX); wind-up poses `src/actors/chargePoses.js` (animator ACTION
  `charge`); the hotbar ring + pips + ⚡ badge `src/ui/chargeHud.js` + `charge.css`; sounds `src/audio/charge.sfx.js`;
  the table generator `tools/charge-table.mjs`; the look-review driver `tools/qa/charge-shots.mjs`.
- **The charge tables live in `src/rpg/charge.js`**, not inline in `skills.js` / `skillsMoka.js`: 34 tables with perks would
  double those files. Each is attached to its def at import (`SKILLS.chomp.charge`). A table's `ready` flag turns
  charging on for that skill once its charged release exists.
- **Four perk nodes per skill**: Deeper Charge (one 2-rank node: Ⅱ at skill level 5, Ⅲ at 10, so "Second / Third Stage"
  read as one row), Quick Wind-up (3 ranks, levels 1 / 3 / 6), one common (Efficient Focus, Split Shot, Wide Arc or
  Echo) or a mid unique, and a capstone unique at 8–12. Gates use the skill's hard points (like synergies). Respec
  refunds perks. **Efficient Focus has 2 ranks** (+50% → +35% → +20% per stage), so a charged release never costs less
  zoom than a tap.
- **Tap timing**: a press can only be known to be a tap when it ends, so the tap casts on release, at most 0.18 s after the
  press. Holding a chargeable skill no longer auto-repeats it. Settings > Charge on hold: **Off** brings back
  hold-to-repeat. The basic Attack and skills that aren't `ready` always repeat as held.
- **Charging needs the skill ready**: held through a cooldown, the charge starts the moment it comes off cooldown, so
  charging can't hide inside a cooldown, which keeps the DPS band honest.
- **The release starts from the wound-back frame** (`playFrom`: swing at 0.3, throw at 0.36, staffCast at 0.45). The
  wind-up pose holds that frame, so the strike lands about 0.05 s after release and reads as one motion.
- **Charged melee doesn't walk up**: a charged Crescent Chomp at a far monster swings where it is (the crescent reaches), and a
  charged swing whose target slips away during the wind-up still lands. The tap still walks up and lunges as before.
- **Zoom is spent once, on release**: cancels (a roll, a panel, a hotbar or weapon change, death, a hero switch, a floor
  change) cost nothing but the time. The ring caps at the highest affordable stage. Zoom regenerates while holding, so
  the cap lifts as it refills. Pips that can't be afforded are greyed, and "Not enough zoom!" floats up once.
- **Toggle** starts on the press (no grace); the next press of the same key releases (before Ⅰ: the normal cast).
- **Channels** (director's call): the charge is a **wind-up before the channel**. Hold: the wind-up pose and ring fill
  to Stage Ⅰ, then the charged spin / beam starts by itself and keeps going while the key is held (or, in Toggle, until
  the next press); Stages Ⅱ and Ⅲ keep filling while it runs and rev it up (bigger, stronger, and each stage +50% zoom
  per second). Let go: a charged channel spins on / lingers on its own for `spinOut` / `linger` s, then ends in a dizzy
  burst / a moonlight burst; casting another skill ends a spin-out. Releasing before Ⅰ gives the normal (tap) channel. A
  press held through another action waits for it, then winds up and spins. Short of Stage Ⅰ's zoom, the wind-up gives
  way to the normal channel, so a held channel key always ends in a channel. A grown Moonbeam keeps its total light
  constant (the column thickens only 30% as much as the ground pool) so it doesn't bloom the screen.
- **Readability fixes from the look review**: the ring is a bold ink-outlined cream-and-colour candy tube with a dark
  dotted groove for the empty part, a round head at the fill's front, and 4-point star pips (the first take, a thin
  cream ring, vanished on sandy floors). The release burst is a clean pooled ring (Squeaky Nova's striped shock ring
  flooded the screen). Crescent Chomp's Wide Arc is +15% reach per rank (the crescent reached 10 m at +20% / +20%). The paw glow
  is small for Chewy and big only for Moka's staff orb.
- **Hit-on-return** (`o.hitOnReturn` in projectile.js) is how Boomerang Fetch hits on the way back; each foe once per
  pass.
- Events: `charge:start`, `charge:stage`, `charge:release`, `charge:cancel`, `perk:learned`. Actions: `learnPerk(id, perkId)`.
- **Charged releases ride on the real cast** (`src/combat/chargedChewy.js`, `chargedMoka.js`, installed by
  `chargedSkills.js`): `fromFrame(u0, fn, hook)` runs the skill's own `cast_<id>` with its first action started from the
  wound-back frame and `hook(ev)` called after each of that action's events, so the charged version keeps every base
  behaviour (synergies, sounds, hit rules) and only adds its extras (18 skills). The 14 whose release changes shape
  (Crescent Chomp, the five ball skills, Splash Bolt, Kiai!, Flash Draw, Onigiri Toss, Kibble Volley, Feather Flurry, Constellation Link, Fetch!)
  are written out in full, starting their action from the wound-back frame with `playFrom`.
- **Readability guard** (`tame()` in chargedSkills.js): while a charged replay runs, the base cast's screen flashes are
  capped at 2.6 m, its rings at 7 m and Moka's water crowns at 1.6 m tall and 68% opaque; flocks created then dive with
  soft crowns. `ChargeFX.burst` caps its ring at 6.5 m and its band at half a metre. In combat.js, repeat hits on one foe
  within 0.09 s get the soft hit burst, so barrages and ricochets don't white a foe out. The look review also brought:
  a dimmer, cooler Moonbeam (gain 0.15 / 0.12, alpha 0.24 / 0.3, the twin at 70%); Splash crowns ≤ 1.6 m at 62%; a lighter
  ball for the Multi-Fetch barrage (`pitball`); soft eruptions for Paw Rune's extra runes; a charged Meteor biscuit at
  ×1.1 / 1.2 / 1.3 that crumbles after 0.4 s; a visibly giant Squeaker (×1.6 / 2 / 2.4); and a smaller stage / release pop
  at the paw so the hero stays readable while charging.
- **K panel** (`src/ui/chargePanel.js`): a Charge drawer docked to the tree's right edge shows one active skill: its
  charged title and blurb, the stage strip (times; locked stages greyed with a lock), its four perks as linked nodes with
  rank pips and level gates, and a detail box. With no perk hovered, the box lists each stage's main line, time and zoom
  (a locked stage shows its real numbers, marked "needs Deeper Charge"). Hovering a perk shows its Now / Next numbers,
  why it can't be bought yet, and a small animated preview of its family. Click buys a rank. Each active node in the
  tree carries a ⚡ chip (points spent; it pulses when a perk can be bought; ringed when shown); clicking the chip picks
  the skill without learning it. The skill tooltip gains a "Hold to charge" section. Respec (Rosie's tea) refunds perks.
- `tools/qa/charge-shots.mjs --pose` shoots each wind-up and the held Stage Ⅲ with a tight camera for the pose review.
- **The balance pass** (phase 3): `tools/charge-sim.mjs` models a 60 s skill-build fight per skill (real costs, cooldowns,
  zoom regen, charge times; the basic Attack fills idle time, so waiting for zoom isn't free; 70% packs, 30% single targets).
  It found the first-pass numbers at ×2–9 sustained. The fixes: (1) **+50% zoom per stage** (was +25%); (2) **perk bonus
  damage grows with the charge** (`perkAt`: 50% / 75% / 100% of the listed pct at Ⅰ / Ⅱ / Ⅲ), so a fully perked Stage Ⅰ
  can't out-damage a full charge — the K panel says so on each perk; (3) **a balance layer per table**, `tune: { dmg: [Ⅰ, Ⅱ,
  Ⅲ], shape: [Ⅰ, Ⅱ, Ⅲ] }` (`retune` in `src/rpg/charge.js`): `dmg` scales the charged damage numbers, `shape` keeps that share
  of the table's growth in area, count and length (a non-decreasing share, so sizes still grow stage by stage). The tunes are
  solved by `node tools/charge-sim.mjs --solve` under two rules: a charged hit never hits softer than a tap's or the stage
  before's, and the growth is trimmed before the hit. (4) Hand retunes where one perk outweighed the whole cast: Split Shot
  70 → 50%, The Big One 300 → 80%, Lunar Eclipse 40 → 8% a tick (it's a blind), Rain Shower 30 → 12%, Squeak Squeak 40 → 25%,
  Seeing Stars 25 → 12%, Twin Moons 60 → 30%, Crescent Cut 200 → 70%, the Moonbeam burst 150 → 70% and its linger 0.6 / 0.9
  / 1.2 s, Blade Volley 120 → 50% (and the storm's time growth moved into bones), Fetch! (slam 10 / 18 / 25%, Double Leash from
  Ⅱ and 2 foes, Fling 120 → 50%), Flash Draw's lingering cut by stage (6 / 10 / 15% for 1 / 1.5 / 2 s), Afterimage 80 → 40%, Meteor
  Shower 50 → 25%, Puppy Pal 60 → 40%, Howl's duration ×1.3 / 1.6 / 2, Pack Call's alpha ×1.6 / 2.2 / 3 with +0 / 1 / 2
  pups, Whirlwind Stance's spin-out 0.5 / 1 / 1.6 s. The Giant Squeaker keeps its ×1.6 / 2 / 2.4 size and the charged Meteor its
  ×1.1 / 1.2 / 1.3 biscuit (looks, not damage: the sim counts the Squeaker's toughness).
- **Charged dashes stay on the floor**: the Flash Draw dash (and Return Stroke's rebound, the Twister drift) moves through
  `slideHero` — 0.25 m sub-steps through the same collision as walking, never ending off the walkable floor — so a long
  frame can't step it past a thin wall, a closed door, a cliff or a region's edge; Hopscotch only hops to a foe in plain
  line (`lineClear`). s19 dashes into an edge in the Burrow and in a region, and replays the dash in 0.3 s steps.
- **A charged Whirlwind Stance catches what it pulls**: its hits reach 0.35 m past the blades (big bodies park just outside).
- **The Moonbeam column** fades out by ~6 m up (`uTop`) and stays inside its own footprint (×0.8), with a tight ground pool
  and a short-range light: a moonlit column, not a fog over the fight.
- **Wind-ups that read past Moka's hat**: Duck Call (call at the lips, the other arm flung wide, up on her toes; notes and
  feathers fly from the call), Bubble Barrier (the staff held high, bubbles streaming from its orb), Shake Off (a wide
  stance, arms out, droplets flicked off a shiver) — `gatherStyle` in chargeFx.js, allocation-free like the rest of the
  charging path (one reused spawn spec).
- **The guide**: "Hold to power up!" (Shadow) starts the first time you're back in town after the Burrow (offered once to
  older saves): hold right-click to Stage Ⅰ and let go (a tap is gently corrected), then K → the Charge card, then tap vs
  hold. With Charge on hold set to Off it says where to turn it back on.
- **s12's "Tab starts the switch… invulnerable"** failure under load was a one-frame gap, not charging: the hand-off swaps the
  rig after the player's update, and `replaceRig` reset `invuln`; it now keeps it through a switch (and s12 waits on the
  switch's state, not the clock).
- **Poe's 18** (docs/POE.md §3b): the tables are `src/rpg/chargePoe.js` (built with these perk families: charge.js passes them in, so no import cycle), her releases `src/combat/chargedPoe.js` ride on her casts' `o` extras, her wind-ups are registered families (`poeFuma`, `poeSeal`, `poeCrouch` …: `chargePoses.js addChargePoses`), and the sim's models are `tools/charge-sim-poe.mjs`. Her tables scale their own damage keys (stackPct, burstPct, clonePct) with the tune (`retune` only knows dmgPct / burnPct). Shadow Step charges for a harder single-target cut (Sure Kill, Second Shadow), so it gains on bosses as on packs.
