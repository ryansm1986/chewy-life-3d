# The Shih Tzu: the Gloomhowl Knight (the fourth hero)

Status: **checkpoint 3 built** (ROADMAP H-4: all three checkpoints). Checkpoint 1: this design; the class, the twelve flail bases; the baked
model `shihtzu_toy` and the Blender flail with its rope and ball on a verlet chain; the coat grade and the white cap; the
three-swing flail combo, Woeful Wallop and Dripping Paw (the hexes); the class damage reduction and the Gloom Blanket;
four-hero switching (the N-hero wheel and HUD minis). Checkpoint 2: **all 21 skills** (the other 13 casts, their moves,
effects, sounds and painted icons; the ghost pups and Grandpaw), **all 15 charge tables** with their releases and tunes,
the hex build's balance pass, per-base flail tints, the kit fallback's topknot and coat, the slam kept over his head.
Play him at once from `/?hero=shihtzu` (he counts as joined).
**His name is Floofy** (the owner's pick, 2026-10-07; kana フルーフィ). It lives in `CLASSES.shihtzu.name`
(`src/rpg/classes.js`; `HERO_TEXT.shihtzu` holds the kana), and everything else reads it. The code id stays `shihtzu`.
Checkpoint 3: the Momiji Hollow joining scene, the rumour, the "Meet <name>" guide, `tools/qa/s28-shihtzu.mjs` (§5).

## 1. Who he is
- A black-and-white Shih Tzu (he/him): a white blaze, muzzle, beard and topknot (tied with a plum band), big black ear
  drapes, amber eyes, a plumed tail. Sheet **B "Gloomhowl Warlock-Knight"**
  (`tools/blender/codex/assets/shihtzu-toy/sheet-B.png`): a split plum tabard over light-charcoal armour with silver trim,
  moon-and-paw motifs, the hood down behind his shoulders, a chunky closed spell-tome on his left hip.
- His weapon: a **large flail made of dog toys**: a chew-bone handle, a thick braided plum rope and a black rubber-nub
  ball with a ghostlight paw print. His magic: **teal-green ghostlight** (#5CE0C0), dark *dog* magic.
- Solemn, a little dramatic, and very soft underneath. He takes his gloom very seriously (as Poe takes her stealth):
  he announces "The darkness…", keeps a ledger of grudges in the tome (alphabetically), and tends ghostlights at
  roadside shrines so that lost pups can find their way home. Ghost pups adore him and lick his face mid-speech.
- **Tone: spooky-cute, never grim.** Friendly ghost pups, dog bones (never human ones), gloom puffs, grumpy little
  storm clouds, dripping paw prints, lanterns. No skulls, gore, blood or demonic imagery. Effects follow Poe's
  readability rule (docs/POE.md §3d): none washes the screen, each is capped where it's made.

| colour | sheet | in game |
|---|---|---|
| black fur / nose | `#2C2A30` | the baked texture, graded at runtime (§8): `#3a383a`–`#3e3c3e` in the village |
| white fur / bone | `#F4F0EA` | held under its own colour by the white cap (§8) |
| plum cloth / rope | `#4A2A4A` | the texture; the class colour `#8a4a8a` (UI) |
| light armour / silver | `#34303E` / `#C8CCD8` | the texture |
| ghostlight | `#5CE0C0` | the gloom element (damage numbers, hexes, the flail's paw glow) |
| eyes | `#C88A3A` | the texture |

## 2. The class (`src/rpg/classes.js` `CLASSES.shihtzu`)
- Title "Gloomhowl Knight" (`シーズー`, "Warlock-Knight of the Gloomhowl"). Base Str 14 · Dex 8 · Vit 14 · Ene 10.
- Life `46 + Vit·4.4 + lvl·6.4` (the most of the four), zoom `22 + Ene·2.6 + lvl·2.1`.
- **The tank**: a class damage reduction of **5%** (`dr`, stats.js `d.dmgReduce`; Iron Topknot adds more, cap 40%), the
  **Gloom Blanket** (each hexed foe within 5 m takes 2% off every blow he takes, up to 5 foes), Steadfast Sulk's guard,
  Bone Ward's barrier and the Wayhome Lantern's rekindle. A little slow on his paws: **−6% move speed** (`speed`).
  The reduction is applied in `combat.hitPlayer` through `G.skills.shihtzuGuard(dmg, src)` (combat/shihtzuSkills.js),
  after defence and resistances, capped at 60% in all.
- Weapon: the **toy flail** (`wtype: 'flail'`, class-bound: `WEAPON_CLASS.flail = 'shihtzu'`). It scales with
  **Strength** (+1% damage per point, `dmgStat.flail`). The dark arts (Gloom Hexes and the Ghostlight Tome) swap that
  for **Energy** (`derived.hexMul` = (100 + %dmg + Energy) / (100 + %dmg + Strength), like Poe's jutsuMul).
- A new element, **gloom** (stats.js `ELEMENTS`, teal numbers): monsters have no resistance to it unless their kind says.
- Starter kit: the Toy Flail; skills `{ woefulWallop: 1, drippingPaw: 1 }`; hotbar LMB attack, RMB Woeful Wallop,
  key 1 Dripping Paw; the second weapon set's right click is Dripping Paw.
- Basic attack (`attack` with a flail, free): a **three-swing combo**: a forehand from over his right shoulder across the
  front, a backhand back across at waist height, then the ball whirled 1¼ times round above his topknot (the circle leans
  back, so it never passes in front of his face) and **slammed** down in front along his facing, toward the target (×1.35
  on a 110° arc, more knockback, a short stun; the dust ring and the thud land under the ball). 95% weapon damage (+ Weight of the World),
  2.2 m, 150°. A pause over 1.4 s starts it over; each swing takes one attack at his attack speed (the slam a touch
  longer). The reach assist lunges (≤ 1.2 m) or walks him up, as for Chewy's cuts.

### Flail bases (`src/rpg/items.js`, three tiers, icon shape `flail`, colours [ball, rope, handle])
| base | lvl | dmg | aspd | req |
|---|---|---|---|---|
| Toy Flail | 1 | 3–8 | 1.05 | — |
| Squeaky Morningstar | 5 | 5–11 | 1.1 | — |
| Rope-Knot Flail | 9 | 7–16 | 1.0 | Str 20 |
| Rawhide Thumper | 13 | 8–19 | 1.05 | Str 26 |
| Gloomrope Flail | 20 | 13–30 | 1.05 | Str 38 |
| Ghostlight Flail | 24 | 14–32 | 1.1 | Str 44 |
| Moonknot Flail | 28 | 18–39 | 1.0 | Str 52 |
| Bramble Ball Flail | 33 | 21–45 | 1.05 | Str 60 |
| Rubber Comet Flail | 40 | 27–55 | 1.05 | Str 72 |
| Lantern-Wick Flail | 45 | 33–68 | 1.1 | Str 82 |
| Gloomhowl Flail | 50 | 41–83 | 1.0 | Str 95 |
| Grand Squeaker | 55 | 39–79 | 1.15 | Str 104 |

Heavier than swords: a little more damage per hit, a little slower. Rares get flail names (`RARE_B.flail`: Thumper,
Squeaker, Wallop…); the shop stocks two flails while he's the active hero; the tooltip reads "Wallop Damage" and "Heavy
swings · long reach · scales with Strength". Every base is the same Blender prop, **tinted by the item's colours**
(`shihtzuGear.js setFlailLook`, from the icon's [ball, rope]): the ball's rubber and the rope are recoloured by luminance
(tint × texel / the part's median: 0.179 ball, 0.229 rope), so the painted shading, braid and speckle stay; the bone handle
and the ghostlight paw keep their paint; the Toy Flail is the texture as painted. One material per part and colour, shared.

## 3. Skills (3 trees × 7, the D2 framework: rows 0–5 gated at levels 1/6/12/18/24/30, prerequisites, synergies)
`src/rpg/skillsShihtzu.js`; numbers at skill level `l`; `lin(a, b)` = a + b·(l − 1); `dim(l, max, half)` = max·l/(l + half).
Damage is % of his rolled flail damage with synergies folded in. **Flail Arts** multiply by Weight of the World;
**Gloom Hexes** by Lingering Gloom (+ Grudge Ledger) and `hexMul`; the **Ghostlight Tome** by Very Good Ghosts and
`hexMul`. Hex durations stretch with Lingering Gloom (`d.hexDur`), the stack cap is 3 (+ Grudge Ledger: `d.hexStacks`).
A hex is gloom damage over time: each stack ticks its dps every 0.5 s (no crits), a new stack refreshes the timer. One hex
record per foe (`stzHex`): its dps is the strongest hex put on it, its stacks add up to the cap.
All 21 are built (`SHIHTZU_TRAINING` is empty; it stays as the hook for a future skill held back).

**Flail Arts** (`flail`, Strength, plum `#7a4a7a` / silver)
| skill | row | what | numbers |
|---|---|---|---|
| `woefulWallop` Woeful Wallop | 0 | a deep sigh, the flail wound all the way back, one huge level sweep that sends foes tumbling | lin(140, 15)% · arc min(220, 160 + 3l)° · 2.3 m · knockback 0.9 · cost 3.5 + 0.17(l−1) · syn Weight of the World 3%, Melancholy Maelstrom 3% |
| `weightOfWorld` Weight of the World | 1 | passive | +25 + 9(l−1)% Flail Arts and swing damage · +1.5 + 0.4(l−1)% crit |
| `tugOfWoe` Tug of Woe | 1 | the ball flung out on its rope wraps the first foe and hauls it (and those beside it) up to him, dizzy | lin(90, 11)% · reach 8 + 0.15l m · +min(5, 2 + ⌊l/5⌋) foes within 1.6 m of it · daze 0.6 + 0.03l s (bosses flinch, aren't moved) · cost 6 + 0.3(l−1) · cd max(1, 3 − 0.08l) · syn Woeful Wallop 5%, Steadfast Sulk 4% |
| `maelstrom` Melancholy Maelstrom | 2 | channel: the flail whirled round over his head, foes dragged in and bonked | lin(48, 6)% 3×/s in 2.2 + 0.03l m · pull 1.3 + 0.03l m/s · walk at 60% · 7 + 0.35(l−1) zoom/s · syn Woeful Wallop 5%, The Heaviest Sigh 5% |
| `ironTopknot` Iron Topknot | 3 | passive: nothing disturbs the topknot | +8 + dim(l, 32, 10)% life · +3 + dim(l, 12, 10)% less damage taken |
| `steadfastSulk` Steadfast Sulk | 4 | the guard counter: plants his paws and sulks behind the flail, blows mostly bounce off, then a great spin | guard 1 + 0.02l s, hits 55 + dim(l, 25, 10)% softer · spin lin(150, 16)% in 2.5 m, +25% per blow taken (4 at most) · cost 8 + 0.35(l−1) · cd max(2, 5 − 0.12l) · syn Woeful Wallop 4%, Iron Topknot 6% |
| `heaviestSigh` The Heaviest Sigh | 5 | ultimate: the heaviest sigh in the world, a hop, the ball slammed down; a bone-shaped crack, three shockwaves | lin(170, 18)% per wave, 3 waves out to 5 + 0.05l m · stun 0.9 + 0.03l s · cost 30 + (l−1) · cd 7 · syn Woeful Wallop 5%, Melancholy Maelstrom 4% |

**Gloom Hexes** (`hex`, Energy, gloom: teal `#5ce0c0`)
| skill | row | what | numbers |
|---|---|---|---|
| `drippingPaw` Dripping Paw | 0 | a ghostlight paw print flicked at a foe; it splats and drips gloom on everyone it splashed | splat lin(35, 4)% in 1.6 m · hex lin(27, 3)% per second for 5 s, stacking · 14 m/s, 11 m · cost 4 + 0.2(l−1) · syn Grumble Cloud 4%, Mournful Awoo 4% |
| `lingeringGloom` Lingering Gloom | 1 | passive | +28 + 9.5(l−1)% Gloom Hexes damage · hexes last dim(l, 60, 10)% longer |
| `grumbleCloud` Grumble Cloud | 1 | a small, very grumpy storm cloud parks on the spot and rains gloom; everyone under it slows down to sulk | lin(26, 3.3)% every 0.5 s in 2 + 0.03l m · slow 25 + dim(l, 15, 10)% · 6 + 0.1l s · up to 1 + ⌊l/10⌋ · cost 9 + 0.4(l−1) · cd 1.5 · syn Dripping Paw 4%, Everlasting Gloom 3% |
| `caseOfMopes` Case of the Mopes | 2 | a sigh of gloom over a crowd: the mopes (they slump, shuffle, hit softer and take more) | 3 + 0.05l m · 6 + 0.15l s · −(25 + dim(l, 20, 10))% damage dealt · −30% speed · +10 + 0.6l% damage taken · cost 10 + 0.4(l−1) · cd 2 |
| `grudgeLedger` Grudge Ledger | 3 | passive: every slight written down in the tome | hexes stack 1 + ⌊l/10⌋ higher · +dim(l, 40, 10)% hex damage |
| `mournfulAwoo` Mournful Awoo | 4 | a long, mournful awoo: it stings everyone who hears it, and every hex nearby spreads to them | lin(50, 6)% in 6 + 0.1l m · spreads 1 + ⌊l/8⌋ stacks of the strongest hex nearby · fear 0.6 s · cost 14 + 0.6(l−1) · cd 3 · syn Dripping Paw 5%, Grumble Cloud 4% |
| `everlastingGloom` Everlasting Gloom | 5 | ultimate: the gloom goes on. A great hex over the crowd; a hexed foe that drops bursts, and the hex jumps on | lin(45, 5)%/s for 8 s in 3.5 m · burst lin(120, 12)% in 2.4 m · 3 + ⌊l/4⌋ jumps within 7 m · cost 32 + (l−1) · cd 6 · syn Dripping Paw 3%, Case of the Mopes 4% |

**Ghostlight Tome** (`tome`, Energy, gloom: ghostlight on silver-blue)
| skill | row | what | numbers |
|---|---|---|---|
| `ghostPups` Ghost Pups | 0 | summon: friendly floppy-eared ghost pups tumble out of the tome; their nips keep hexes going | min(6, 2 + ⌊l/6⌋) pups (+ Very Good Ghosts) · 30 + l s · nip lin(26, 3)% every 0.8 s · life (20 + 2l)% of his · cost 10 + 0.5(l−1) · cd 1 · syn Borrowed Warmth 4%, Grandpaw's Ghost 4% |
| `veryGoodGhosts` Very Good Ghosts | 1 | passive: they are all very good ghosts | +25 + 8(l−1)% Tome damage · +20 + 6(l−1)% ghost life · +⌊l/10⌋ pups |
| `borrowedWarmth` Borrowed Warmth | 1 | a ghostlight thread to a foe: he borrows a little of its warmth (a life-leech tether) | min(4, 1 + ⌊l/6⌋) tethers within 8 m for 4 s · lin(22, 3)% every 0.5 s, 35% of it heals him · snaps past 10 m · cost 8 + 0.35(l−1) · cd 2.5 · syn Ghost Pups 4%, Wayhome Lantern 4% |
| `boneWard` Bone Ward | 2 | six spectral chew-bones circle him and catch blows; when the ward breaks they fly at foes | absorbs (12 + 1.2l)% of his life for 10 s · then 6 bones, lin(70, 8)% each · cost 12 + 0.5(l−1) · cd 6 · syn Ghost Pups 3%, Very Good Ghosts 4% |
| `midnightReading` Midnight Reading | 3 | passive: he reads by ghostlight until very late | +15 + dim(l, 60, 10)% zoom regen · the dark arts cost dim(l, 30, 8)% less |
| `wayhomeLantern` Wayhome Lantern | 4 | a ghostlight lantern, the kind he tends for lost pups: mending light; if he falls while it burns, it lights him home | 12 s, 5 m · +2 + 0.1l% life/s for him and his ghosts · foes in it lin(20, 2.5)%/s · rekindles him at min(70, 35 + l)% life once · cost 16 + 0.6(l−1) · cd max(10, 20 − 0.4l) · syn Borrowed Warmth 4%, Bone Ward 3% |
| `grandpawsGhost` Grandpaw's Ghost | 5 | ultimate summon: the very last page. Grandpaw rises, an enormous, ancient, extremely fluffy ghost Shih Tzu: he stomps, howls hexes over the crowd, and licks his face | 15 + 0.25l s · stomp every 1.5 s, lin(130, 14)% in 2.8 m · a howl every 5 s hexes every foe in 6 m (lin(40, 5)%/s, 5 s) · life (150 + 10l)% of his · taunts · cost 35 + (l−1) · cd 20 · syn Ghost Pups 5%, Very Good Ghosts 4% |

Every skill has its own move (`actors/shihtzuPoses.js`), effects (`gfx/shihtzuFx.js`, `gfx/shihtzuFxArts.js`,
`gfx/shihtzuGhosts.js`), sounds (`audio/shihtzu.sfx.js`) and painted icon (`rpg/iconsShihtzu.js`):
- **The combo**: `flailSwing1`, `flailSwing2`, `flailSlam`. A pose moves only the paw and *pulls* the ball toward a
  direction (`A.flailDir` in his frame, weight `A.flailW`); the chain keeps its own momentum (§8), so the ball lags the
  wind-up, whips through the strike and swings on after the pull lets go. The slam's `whirl` leans its circle back
  (`back` 0.26, up 0.92) so the ball stays over the topknot, then comes over the top and down in front. The trail is a
  ribbon following the real ball, sampled every 0.11 m of its path, cream with a ghostlight edge.
- **Woeful Wallop**: `wallop` (eyes closed for the sigh, wound back, one level sweep, a follow-through that turns him half
  round); `fx.sweep`: a bright leading edge (cream to ghostlight) runs round the arc in 0.14 s along a thin band near the
  rim, a short smear behind it, the interior clear, gone by 0.25 s (a shader on a ring sector; the charged near-full circle
  6 m across leaves the fight readable).
- **Tug of Woe**: `tugThrow` flings the ball (the real one hides; a clone flies on a braided rope ribbon, `fx.tug`); the first
  foe it meets is wrapped (a plum ring, a squeak), `tugHaul` heaves, and it and up to `extra` foes within 1.6 m slide in to
  1.3 m in front of him over 0.3 s (collision-safe; bosses only flinch), dazed; the ball reels home.
- **Melancholy Maelstrom**: a channel (`this.channel.update`: skillRunner's hook) on `stzWhirl` (held: the paw overhead,
  the ball whirled ≈ 2 turns a second above the topknot; he walks at 75%). A gloom swirl decal on the floor, a motion-smear
  ring of the ball's path overhead, puffs drawn in; foes within r + 2.5 m dragged in (`pullFoe`), a hit 3× a second.
- **Steadfast Sulk**: `sulk` (hunkered behind the flail, ears flat) for the guard; a tiny grumpy rain cloud drizzles on his
  topknot; each blow taken is softened (`block`) and counted with an offended "hmph"; then `sulkSpin`, a full turn with the
  ball swung out level, +25% per blow. Another move breaks the sulk off (no spin).
- **The Heaviest Sigh**: `sigh` (the deepest breath, eyes shut, the flail up, a hop of up to 3 m toward the aim, the slam):
  a bone-shaped crack in the floor along his facing, chunks of earth, then three shockwave rings 0.16 s apart, each foe hit
  once, stunned with dizzy stars.
- **Dripping Paw**: `hexFlick` (the free left paw raised by his face, then thrust: the sheet's CAST pose). The curse is a
  ghostlight paw print trailing drips; the splat a paw-print puddle; a hexed foe carries a dripping paw badge with a pip per
  stack and ticks teal numbers.
- **Grumble Cloud**: `hexFlick`; a grumpy storm cloud (an ink-outlined sprite with a frown, puffs round it) parks 2 m over the
  spot, rains ghostlight drops and lays a soft shadow on the floor (the area); ticks and slows whoever's under it.
- **Case of the Mopes**: `hexFlick`; a heavy sigh of gloom rolls out; each moping foe gets a tiny drooping rain cloud
  (capped at 14 at once), moves slower, hits softer (`shihtzuGuard` reads `stzMopes`) and takes more (`cursedMul`).
- **Mournful Awoo**: `awoo` (head thrown back, eyes shut); notes rise and a howl rolls out (`fx.howlWave`: ghostlight rings at
  chest height and on the floor, sparks riding out with them, 0.5 s); it stings and scares (`fear`), and the strongest hex
  nearby **hops** from the foe carrying it to every foe in earshot as the ring reaches them (`fx.hexHop`: an arc of wisps,
  a glint and drips on arrival; at most 14 hops a howl), `spread` stacks each.
- **Everlasting Gloom**: `hexRaise` (both paws up, then flung down): a great ghostlight paw falls on the crowd; the hex it
  leaves (`h.ever`) bursts when its foe drops and jumps on (a wisp arcs to the next foe) up to `jumps` times.
- **Ghost Pups / Grandpaw's Ghost** (`combat/shihtzuAllies.js`): `tomeRead` with the spectral tome open in his paw (pages
  fly). The pups are slots in one instanced batch (8 at most, one fill + one outline draw for all): translucent mint, a solid
  dark-teal outline hull, ink eyes, a pink blep, darker ears, the plum-banded topknot; they float with a rippling hem, flop
  their ears, wag, and nod in for a nip (a nip on a hexed foe stretches its hex). Grandpaw is 2.4× a pup with round silver
  spectacles, bushy brows, slim droopy moustache strands and a long beard tuft; his right paw holds his lantern out at his
  side (it swings; its flame the soft round mote, no square halo) and his left paw rests on a little plum tome on his belly:
  he rises out of the tome's light, floats over to lick the hero's face (hearts), then stomps (a thud ring) and howls hexes
  over the crowd; monsters within 6 m prefer him a little (`tauntFor`). All of it in shared geometry and three materials.
  **The hero always reads**: a summon whose screen footprint overlaps the hero's while nearer the camera fades to 35%
  (`coversHero`: four projections a summon a frame, eased); no summon, ward bone, lantern or tug ball casts a shadow.
- **Borrowed Warmth**: `hexFlick`; wavy ghostlight threads from each tethered foe to him, warm motes running along them; the
  drain heals him (a green number every 0.6 s, a heart).
- **Bone Ward**: `tomeRead`; spectral chew-bones (an instanced batch) orbit him at chest height, fading as the barrier is
  spent ("Bonk!" on a soaked blow); when it breaks or runs out they fly off at the nearest foes.
- **Wayhome Lantern**: `lanternSet` (a crouch, the left paw sets it down): a plum-framed lantern with a ghostlight flame, a
  soft pool of light with a dashed paw-print edge (the area), a small pool light, motes; it mends him and his ghosts, ticks
  foes, and once rekindles him from a fatal blow ("Rekindled!", a bell chord, the lantern flares and gutters out).

### 3b. Charged abilities (`src/rpg/chargeShihtzu.js`, releases `src/combat/chargedShihtzu.js`)
All 15 actives charge with the shared rules (docs/CHARGE.md §1–3): hold past 0.18 s, Stage Ⅰ, Deeper Charge for Ⅱ/Ⅲ,
Quick Wind-up, +50% zoom per stage, a balance tune solved by `node tools/charge-sim.mjs --solve` (his models:
`tools/charge-sim-shihtzu.mjs`). Each release rides on the real cast through `fromFrame` (the cast's first action starts
from the frame the wind-up pose held) with its perks as the cast's extras. The wind-ups (`SHIHTZU_CHARGE_POSES`):
`stzWallop` (the flail wound round behind him, the ball circling low, faster as it fills), `stzWhirlUp` (the ball whirled
overhead), `stzSulk`, `stzSigh` (the held breath), `stzHex` (ghostlight gathering on the raised paw, trembling), `stzHexUp`
(both paws up), `stzAwoo`, `stzTome`. The full table with every number is docs/CHARGE.md §7 (Flail Arts, Gloom Hexes,
Ghostlight Tome).

| skill → release | the payoff | perks beyond Deeper Charge / Quick Wind-up |
|---|---|---|
| Woeful Wallop → *Grand Wallop* | a wider (up to 330°), longer sweep, harder knockback, a wind at Ⅱ/Ⅲ | ★ Aftershock (the ball slams the floor after the sweep, 60%); ★ Wallop of Woe (everything hit is hexed) |
| Tug of Woe → *The Big Haul* | further, more foes wrapped and hauled, longer daze | Efficient Focus; ★ Bonk Together (the hauled foes knock heads, 70%) |
| Melancholy Maelstrom → *Gloom Maelstrom* (channel) | wider, a harder drag, whirls on after you let go | ★ Drifting Gloom (the whirl-out follows the cursor); ★ Last Bonk (a closing slam all round, 120% + daze) |
| Steadfast Sulk → *The Grand Sulk* | a sturdier, longer guard; starts the stage's blows up; a bigger spin | Wide Arc (the spin); ★ Stubborn (+2 blows counted) |
| The Heaviest Sigh → *The Deepest Sigh* | waves further and harder, longer stun | Efficient Focus; ★ Rolling Thunder (Ⅲ: 2 more waves past the last, each 25% harder) |
| Dripping Paw → *Great Dripping Paw* | 2 / 2 / 3 stacks at once, a bigger splat | Paw Prints (+1 / +2 paws, 50%); ★ Gloom Puddle (re-hexes for 3 s) |
| Grumble Cloud → *Great Grumble* | bigger, longer, harder rain, more slow | ★ Brooding Drift (follows the nearest foe); ★ Grumble Grumble (a bolt every 1.5 s, 150% + stun) |
| Case of the Mopes → *A Terrible Case of the Mopes* | wider, longer, weaker and more vulnerable foes | Wide Arc; ★ Contagious Mopes (passed on when a moping foe drops) |
| Mournful Awoo → *The Grand Awoo* | further, harder, +0/+1/+2 stacks spread, longer fear | Encore (Echo: again 0.6 s later at 50%); ★ Chorus (the ghosts howl along, 30%) |
| Everlasting Gloom → *Endless Gloom* | wider, a deeper hex, bigger bursts, +1/+2/+3 jumps | Efficient Focus; ★ Deep Gloom (Ⅲ: lands 2 stacks) |
| Ghost Pups → *A Whole Litter* (summon) | +1/+1/+2 pups, sturdier, nippier, longer | ★ Haunting Nips (nips hex); ★ The Runt (Ⅲ: one big pup, double nips) |
| Borrowed Warmth → *A Warm Embrace* | more threads, harder drain, more healing | Efficient Focus; ★ Shared Warmth (the ghosts heal too) |
| Bone Ward → *Bone Fortress* | a bigger barrier, more bones, harder bones | ★ Bone Broth (1% life a second while it holds); ★ Marrow Shards (+50% bones) |
| Wayhome Lantern → *Beacon Home* | wider, longer, faster mending, a higher rekindle | Efficient Focus; ★ Calming Light (foes in it slowed 30%) |
| Grandpaw's Ghost → *Great-Grandpaw* (summon) | bigger, longer, tougher, harder stomps and hexes | ★ Old Stories (howls twice as often); ★ Grandpaw's Lantern (1% life a second near him) |

The solved band (Stage Ⅲ, every perk, 70% packs / 30% single, sustained over tapping): every damage table ×1.21–1.22 at
Ⅲ (Ⅰ ×0.95–1.32, Ⅱ ×1.02–1.16); the summons and buffs report a value ratio of ×1.0–1.4 (not tuned). A charged hit never
lands softer than a tap's: the hex tables floor their dot at the tap's (`Math.max(1, …)`), and Dripping Paw pays its charge
in stacks at once rather than a stronger hex.

## 4. Balance (`node tools/hero-balance.mjs`; asserted in `tools/test-rpg.mjs`)
Same rules as docs/POE.md §4 (the best normal base the level allows, a skill build, stat points 50% damage stat / 30% Vit /
20% Energy, a 60 s fight, 70% packs of five / 30% single). eHP counts the damage reduction:
life / ((1 − dodge)(1 − block)(1 − armour)(1 − dr)).

| level | the tank (Woeful Wallop) vs the Chewy–Moka–Poe mean | the hex build: clear (single) |
|---|---|---|
| 6 | dps ×0.97 · eHP ×1.31 · life ×1.29 | ×0.90 (×0.79) |
| 15 | dps ×0.91 · eHP ×1.26 · life ×1.24 | ×0.93 (×0.99) |
| 30 | dps ×0.95 · eHP ×1.23 · life ×1.20 | ×1.04 (×0.53) |
| 45 | dps ×1.02 · eHP ×1.21 · life ×1.19 | ×0.88 (×0.47) |

Both are asserted: the tank at **dps ×0.85–1.05, eHP ×1.15–1.4**, the hex build at **clear ×0.85–1.05**.
- **The tank**: Woeful Wallop, Weight of the World, then Melancholy Maelstrom and The Heaviest Sigh, on repeat.
- **The hex build** (`shihtzu·hex`, an Energy build: 50% of the points in Energy, so `hexMul` > 1): one point in each
  rotation skill first (and Case of the Mopes, the prerequisite), then Dripping Paw, Lingering Gloom, Grumble Cloud,
  Everlasting Gloom, Mournful Awoo, Grudge Ledger (`plan` in the tool). Its fight is a rotation, not one skill on repeat
  (`hexRotation`): per second, zoom and cast time go to keeping Everlasting Gloom up, one Grumble Cloud up, the Awoo on its
  cooldown, then Dripping Paw with what's left, and any free time swings the flail. Every hexed foe carries min(cap,
  stacks applied over a hex's run) stacks at the strongest hex's dps; the Awoo and the great hex reach the whole pack.
  The hexes are its damage (about two thirds of it in a pack); it is weaker against one foe, the trade for a tank who
  spreads gloom.
- The checkpoint-2 pass: Dripping Paw's hex 55 + 6.5 → 27 + 3 per level, Everlasting Gloom's 90 + 10 → 45 + 5 (and its
  Dripping Paw synergy 5 → 3%), Grumble Cloud 30 + 4 → 26 + 3.3 (its Dripping Paw synergy 5 → 4%), Mournful Awoo 60 + 7 →
  50 + 6, Lingering Gloom 30 + 10 → 28 + 9.5. (Checkpoint 1: Woeful Wallop 190 → 140%, its synergies on the mastery and the
  Maelstrom; Weight of the World 30 + 11 → 25 + 9 per level.)

## 5. Joining (`src/actors/shihtzuJoin.js`, owned by HeroManager like Poe's: `G.heroes.stzJoin`)
- **The scene** runs in **Momiji Hollow** (the Maple zone, `JOIN_AT.shihtzu = 'maple'`) in its golden-hour light, on any
  visit while he hasn't joined, so a new game and an old save meet him the same way. Event `shihtzu:joinScene` (phases
  `kneel`, `proclaim`, `done`).
  - *wait*: his rig (`Player.buildRig(…, 'shihtzu')`: the baked model, the flail on his back) is built hidden as you
    arrive. Once you've been there 5 s, walked 5 m and nothing is chasing you, he appears.
  - *kneel*: beside the trail ahead of you, on screen (by the jizo shrine when you're within 16 m of it), kneeling by
    three little plum paper lanterns (`fx.shrineLantern`), lighting them one by one every 1.6 s with a reach of his left
    paw (`stzKneel`, `a.reach`), a ghost pup (a slot in the pup batch) bobbing at his shoulder. Shadow notices (a "?"
    and a tip: "Ghostlights, by the road!").
  - *proclaim*: walk within 4.5 m (or stand about for 18 s: the ghost pup zooms over, yips at you and leads you back). He
    rises (`stzRise`), walks over to a dignified distance, the camera frames you both (13 m), and, paw raised
    (`stzProclaim`): "Halt, traveller. You stand at the edge of the gloom. Few return fr—" The ghost pup zooms to his face:
    *slurp* (`stzLicked`: head yanked back, eyes shut, ears flung up; hearts; `gp_lick`). The sweat drop; Shadow's heart.
  - *talk*: "…That was part of the ritual." His name (`CLASSES.shihtzu.name`), Knight of the Gloomhowl, keeper of the
    ghostlights along the Maple road; the ghost pup ("He followed me home from the old shrine. They all do."); why he lights
    the lanterns (so lost pups can find their way home); `prepareJoin`; "The gloom needs a pack. May I join yours?" (two
    answers); `joinShihtzu()` (banner, `flags.shihtzuJoined`, the save).
  - The end: he holds up the tome (`stzTomeHold`) and each lantern's flame flies into it as a ghostlight wisp; pages flutter;
    he fades away in ghostlight "to meet you at the cottage". He lives at Chewy's house from the next town visit.
  - Leaving the zone, dying or a hero switch before he speaks resets it (no knight, lanterns or pup left behind).
- **The rumour**: in town, once Poe has joined and he hasn't (12 s in, nothing else talking), Shadow passes it on once
  (`flags.hints.stzRumour`): a very serious little knight has been lighting lanterns along the road in Momiji Hollow every
  sunset; "Let's take the Wayfarer's Post and see!", or the unlock it still needs (`regionUnlocked`).
- **The guide** "Meet <name>" (`world/guides.js meetShihtzu`, narrated by him, plum; the title and lines read
  `CLASSES.shihtzu.name`): *hold* Tab, the wheel with four, pick him (his card highlighted; a number key works); *flail*
  (left-click the three swings, right-click Woeful Wallop); *hex* (1: Dripping Paw, stacks); *blanket* (the Gloom
  Blanket); *wrap* (his trees, K; "Grandpaw sends his regards").
- `?hero=shihtzu` (debug) and `G.heroes.joinShihtzu()` (QA) join him at once. Until then the wheel's card says "Somewhere in
  the maples, at dusk…".
- QA: `tools/qa/s28-shihtzu.mjs` (`SHOTS=1` saves the scene beats and the guide steps to `tools/qa/tmp/s28/`).

## 6. Four heroes (and more): switching, the wheel, the HUD
- `HERO_IDS` follows `CLASSES` (Chewy, Moka, Poe, the Shih Tzu; H-5 adds the dragoon). `state.heroes.shihtzu` is created
  by `normalizeHeroes` for every save (no version bump). His villager lives at Chewy's house (`HOME_OFS`), tends the
  town's lanterns, reads on benches (`npc.js` ROUTINE); his chat is `HERO_CHAT.shihtzu`.
- **The wheel** (`ui/heroWheel.js`) takes any number of heroes: a card per hero round the ring (a wider ring past four), the
  number keys **1–9** in roster order, the mouse or the pad's right stick by angle. A card's name stays on one line.
- **The HUD** (`ui/hud.js` benchTick): the Tab mini portrait (the next hero) at the portrait's lower left, and a row of
  small minis for every other benched hero under the name and companion card (`heroWheel.css` `.hsw-b`, `--k`), right of
  the level badge and above the quest tracker; a click switches to that hero.

## 7. Code map
- Class and items: `src/rpg/classes.js` (`CLASSES.shihtzu`, `HERO_TEXT`, `WEAPON_CLASS.flail`), `src/rpg/items.js` (the
  flail bases, `starterFlail`, `CLASS_WTYPES`, the shop, tooltips), `src/rpg/actions.js` (the starter kit, the weapon set
  type, `defaultRmb`).
- Skills: `src/rpg/skillsShihtzu.js` (SHIHTZU_TREES, SHIHTZU_SKILLS, `SHIHTZU_TRAINING`, `shihtzuPassives`, `BLANKET`),
  merged by `src/rpg/skills.js` (and the flail `ATTACK` params); `src/rpg/stats.js` (the gloom element, his tree keys,
  `d.dmgReduce`, `shihtzuPassives`).
- Casting: `src/combat/shihtzuSkills.js` (`installShihtzuSkills(SkillRunner.prototype)`: `cast_flailSwing`, the lunge,
  `cast_woefulWallop`, `cast_drippingPaw`, the flying curse, the hexes `stzHex` / `updateStzHexes`, `shihtzuGuard`,
  `updateShihtzu` / `clearShihtzu`; Woeful Wallop joins the melee reach assist); `skillRunner.js` routes the flail attack
  and calls update / clear; `combat.js hitPlayer` calls `shihtzuGuard`.
- Looks: `src/actors/shihtzuGear.js` (the flail: the GLB or a procedural stand-in, `FlailChain`, `dressShihtzu`,
  `mountFlail`, `stepFlail`, the Player mixin `holdFlail` / `carryFlail`), `src/actors/shihtzuPoses.js` (his actions,
  `SHIHTZU_ROOTED`, the guide helpers), `src/gfx/shihtzuFx.js` (the trail, thuds, the paw curse, the hex badge, gloom
  puffs), `src/audio/shihtzu.sfx.js`, `src/rpg/iconsShihtzu.js` (flail item art, skill icons), `src/ui/glyphs.js`
  (`flail`, `hex`, `tome`), `src/ui/rpg.js` (his trees), `CAST.shihtzu` (charKit.js: the kit fallback).
- Heroes: `src/actors/heroes.js` (JOIN_AT, JOIN_HINT, HOME_OFS, HERO_CHAT, `joinShihtzu`), `src/actors/heroModels.js`
  (`HERO_MODELS.shihtzuToy`, `flailMount`, `whiteCap`), `src/gfx/portraits.js` (his framing), `src/game.js` (his model and
  portrait load).
- Checkpoint 2: `src/combat/shihtzuArts.js` (the other 13 casts and their per-frame state, the guard pieces
  `stzGuardArts`), `src/combat/shihtzuAllies.js` (`GhostPup`, `Grandpaw`), `src/gfx/shihtzuFxArts.js` (their effects),
  `src/gfx/shihtzuGhosts.js` (the ghosts' geometry, materials and the instanced `GhostBatch`), `src/rpg/chargeShihtzu.js`
  (merged by `charge.js`), `src/combat/chargedShihtzu.js`, `tools/charge-sim-shihtzu.mjs` (merged by `charge-sim.mjs`).
  Shared edits: `skillRunner.js` (a channel may bring its own `update`), `combat.js` (`hitPlayer` returns 0 when the guard
  soaks a blow whole), `charge.js` / `charge-sim.mjs` / `charge-table.mjs` (his tables, models and labels).
- Checkpoint 3: `src/actors/shihtzuJoin.js` (the scene, the rumour), `world/guides.js meetShihtzu`, his scene poses
  (`stzKneel`, `stzRise`, `stzProclaim`, `stzLicked`, `stzTomeHold`), `fx.shrineLantern`, `tools/qa/s28-shihtzu.mjs`
  (in run-all).

## 8. The baked model (`HERO_MODELS.shihtzuToy`, the flail prop and its chain, the coat)
Built by an Opus agent with the toybox-character skill (sources archived in `tools/blender/codex/assets/shihtzu-toy/`;
the README has the rebuild). Installed: `public/rigs/shihtzu_toy.{json,bin,png}` + `shihtzu_toy_n.png` (37 bones,
16,608 vertices, 1.2 m with the topknot) and `public/models/shihtzu-flail.glb` (5,488 triangles). The game uses him
(`cfgFor`: shihtzuToy; the hero choice in Settings is gone since CT-7); the QA's `?chewymodel=disney` has none, so he
stays the kit there (`CAST.shihtzu`), as he does if the files are missing.
- **The entry**: `lidTilt: 0.5507` (his eyes face ~31° outward: the lids hinge on tilted axes), `squint: [0.74, −0.36]`
  (a content, half-lidded smile), `earGain: 0.5`, `outline: '#1c181e'`, `wave: 'out'`, `palm: [−0.040, −0.054, 0.004]`
  (the right mitten's grip centre off `hand_R`, from prop_mount.json; the left mirrors it), `back: [0, 0.06, −0.27]`.
- **The flail** (`actors/shihtzuGear.js`): the GLB's nodes `flail_handle` → `flail_link_0..5` → `flail_head` (pivots
  along the prop's +Y: the knot at 0.12, a link every 0.095, the head at 0.69, the ball's centre at 0.79; the ball 0.22 m
  across, the rope 0.57 m, the glow material on the paw prints). Every link and the head become children of the handle,
  posed each frame from the chain. In his paw the holder sits at the palm with prop_mount.json's `one_handed` quaternion
  (the handle forward through the fist; raising the arm stands it up). A procedural flail of the same layout stands in
  until the GLB loads.
- **The chain** (`FlailChain`): eight particles (the knot, pinned to the handle; six joints; the ball's centre), Verlet
  with gravity and air drag (1.4/s), the ball heavier (inverse mass 0.22), the link lengths relaxed 5 times then made
  inextensible by a pass out from the knot (a 25 m/s whip outran the relaxation and the links parted), a little bending
  stiffness (neighbours-but-one keep 70% of their span), pushed out of three body spheres (hips, chest, head), a ground
  clamp with friction (the ball rests and drags on the floor when he stands or walks with it drawn), fixed 1/120 s steps
  with the knot interpolated through each frame's sub-steps (at most 5). A swing pose's guide nudges each particle
  toward a straight line along its direction (more toward the ball). No allocation per frame.
- **Drawn or put away**: any swing or Flail Arts move draws it; in the Burrow and the zones it stays drawn; in town it goes
  back ~3 s after the last swing (and when a homestead tool is out). **On his back** it hangs like a baldric: the handle up
  his right shoulder blade, the pommel between the ears, the rope slung down across the cape to the ball, hooked at his left
  hip behind the tome (`flailMount` on the chest, `BACK_HOOK` on the hips); the chain still runs, so the sash sways as he
  walks. (His ears drape over everything above y 0.64 past |x| 0.18, and his tail sits at the right hip: the layout avoids
  both.) A villager's flail is settled once and hangs still.
- **The coat**: the texture's black is the sheet's `#2C2A30`. It uses the samurai's gated tools (as Poe):
  `darkGrade: [1, 12, 7, −3, 0.1]`, `darkNeutral: 0.9`, `darkFur: 1` — a slightly warmer lift than Poe's, so the fur
  reads a neutral warm charcoal rather than a faint violet. Measured in game on his ear drapes
  (`tools/qa/tmp/shihtzu-coat.mjs`: vertices facing the camera projected to the screen; the 35th / 60th percentile):

  | light | p35 | p60 |
  |---|---|---|
  | village 11:00 | `#3a383a` | `#3e3c3e` |
  | village 17:48 | `#373335` | `#3b3639` |
  | the Burrow, floor 1 | `#312b2a` | `#393230` |
  | Maple (the zone) | `#362a29` | `#483d3c` |

  (Poe's earlier grade `[1, 7, 4, −2]` read `#373438` / `#3b383d` in the village: a touch violet.) The Burrow and Maple
  warm him toward brown: their warm key light and grade (ROADMAP H-3), not the coat.
- **The white cap** (`whiteCap: 1`, heroModels.js `WHITE_CAP`): under the Burrow's warm key light and the bloom his cream
  blaze, muzzle and topknot blew out to a glowing peach. On bright, near-neutral texels the lit colour now keeps the fur's
  own hue and never passes 1 × its albedo (the katana's bone trick). The blush and the eyes are untouched (their
  saturation is over the gate).
- **Portraits** render ungraded (`portraits.js` zeroes the grade and the lift) and frame his big head with the topknot
  (`shihtzu_toy`: ×1.2, +0.2 m).
- The kit fallback (`CAST.shihtzu`; `?chewy=classic`, and while his model loads): a black-and-white dog in the plum tabard,
  with **the white topknot and its plum band and the long drooping black ear locks**. The Toybox kit builds them in
  `shihtzuKit.js` (`spec.toy.extras`: the topknot's three puffs, the band and a silver bead, the blaze, the ear drapes,
  the tome on his hip; its own `darkGrade [0.45, 13, 6, −9]`); the classic and Storybook kits get a topknot tuft on the
  crown from `shihtzuGear.js topknot()` (measured before the flail goes on), and the classic kit's coat leans green-gold in
  its vertex colour (`classicCoat`), so the grade's violet lift renders it a neutral charcoal. Its name reads
  `CLASSES.shihtzu.name`.

## 9. Look tools
- `/?test=shihtzu` — his look page: the baked model with the flail (on his back; `hand=1` in his paw), the kit beside him
  with `kit=1`, Chewy for scale (`solo` drops him, `poe` adds Poe); `views=1` the turnaround; `act=<action>` loops an action;
  `swing=1` loops the combo; `walk=1`; `flails=1` the prop alone; `portrait=1`; `dg=` / `dn=` live grade values; `face=`.
- `/?test=shihtzu&tints=1` the twelve flail bases' tinted props with their item icons; `&ghosts=1` four pups, Grandpaw and
  the ward's bones on grass and on snow (`fx=` / `fz=` / `fy=` move the camera's focus, `howl` tips Grandpaw's head back).
- `/?test=rpg&sec=skills&cls=shihtzu` his 21 skill icons.
- `node tools/qa/shihtzu-shots.mjs [look] [baldric] [idle] [walk] [attack] [woefulWallop] [drippingPaw] [strip] [pack] [wheel]`
  — the review shots: the village round him at the game camera; `baldric`: the flail on his back walking and sprinting across
  the plaza, the camera at both rear and both front 45° yaws; the Burrow idle, walking, each move frozen through; `strip`:
  each swing frozen at ten moments (`--view game|front`, `--only swing1,slam,…`), then `python tools/qa/sheet.py
  tools/qa/tmp/shihtzu-shots/strip-<name>.txt <out.png> 5 320`; **`pack`**: real fights in Bamboo Depths B1F (a room away
  from the entrance, a crowd of 18 of its kinds closing in), each of his 15 actives cast into the crowd and frozen at its
  moment (`--stage 3`: the charged releases, every perk; `--only id,…`), and **`all`**: the pups, Grandpaw, the ward, the
  lantern, the cloud, the mopes, the great hex, a paw, the threads and the awoo up at once; the wheel and HUD with four heroes.
  Output `tools/qa/tmp/shihtzu-shots/` (gitignored).
- `node tools/qa/tmp/shihtzu-coat.mjs [--scenes …] [--grades "cur;1,12,7,-3,0.9,1"]` — the coat in several lights.
- `node tools/hero-balance.mjs` (the comparison, his band and the hex build).
- `node tools/charge-sim.mjs <his ids>` (the charge band), `--solve` (the tunes); `node tools/charge-table.mjs` (CHARGE.md §7).
- `WORLDS=burrow,zone HEROES=poe,shihtzu node tools/qa/profile-horde.mjs` (the horde perf with his full kit: §10).

## 10. Perf (the horde gate with his full kit: `tools/qa/profile-horde.mjs`)
His rotation there (`ROT.shihtzu`): the ghost pups and Grandpaw out (the rotation waits for a tome read's last word),
Dripping Paw, Everlasting Gloom, the Awoo, a Grumble Cloud, the mopes, Woeful Wallop, Borrowed Warmth, Bone Ward, the
Sigh, the lantern and the **Maelstrom held 1.5 s** at a time; three hex stacks kept on the **70 horde monsters nearest
him** (the run reports 92–111 hexed at 150, ghosts 5). Poe on the same pages for comparison. Run 2026-10-07 on a
**busy machine** (CPU 85–97%, WardogsClient 77–85% of the 3D engine; every baseline over 5 ms), so read it relative:

| world | hero | N | baseline p95 | cpu p50 | p95 | draws |
|---|---|---|---|---|---|---|
| Burrow B12F | Poe | 150 | 17.3 | 13.2 | 24.6 | 376 |
| Burrow B12F | Shih Tzu | 150 | 14.9 | 8.2 | 14.1 (PASS) | 347 |
| Burrow B12F | Poe | 250 | 17.3 | 20.7 | 28.7 | 524 |
| Burrow B12F | Shih Tzu | 250 | 14.9 | 17.4 | 34.4 | 570 |
| Bamboo Depths B1F | Poe | 150 | 12.2 | 14.8 | 24.5 | 503 |
| Bamboo Depths B1F | Shih Tzu | 150 | 15.5 | 15.7 | 32.4 (first try 25.7) | 514 |
| Bamboo Depths B1F | Poe | 250 | 12.2 | 17.3 | 23.3 | 637 |
| Bamboo Depths B1F | Shih Tzu | 250 | 15.5 | 19.9 | 26.7 | 743 |

He frames like Poe within the noise. The CPU phases (`PHASES=1`, ms per frame, Burrow 150 / 250) say the same: his
skills 0.44 / 0.52 (Poe 0.46–0.50 / 0.71–0.82), vfx 0.82 / 1.23 (Poe 0.76–0.93 / 1.43–1.47), ui 0.82 / 0.79 (Poe 0.64–0.68 /
0.81–0.84: his gloom ticks' numbers), player 0.22 / 0.14 (Poe 0.1: the flail's chain). The first run (before the fix below) drew **644** calls at 150 in the Burrow
against Poe's 347: every hex badge was its own sprite. The badge is now an atlas cell drawn as one particle a frame in
the normal layer (one draw for all of them), and its pips and drips share a per-frame budget (`hexMark`), so 100 marked
foes cost about what 20 do: 347 draws. The ghosts are two instanced draws (fill + outline) for every pup, two for
Grandpaw, two for the ward's bones; their shaders, the tome's and the lantern's are compiled at each combat world's entry
(`ShihtzuFX.prewarm`).

The CP2 review asked whether anything of his costs more in a zone (Bamboo Depths 150 read p95 32.4 against Poe's 24.5).
Re-run with the CPU phases on the same busy machine (WardogsClient 88–91% of the 3D engine), two tries each:

| Bamboo Depths B1F, 150 | cpu p50 | p95 | skills | vfx | ui | render (ms/frame) |
|---|---|---|---|---|---|---|
| Poe | 15.5 / 17.2 | 25.9 / 29.7 | 0.68 / 0.71 | 0.94 / 0.86 | 0.73 / 0.94 | 10.0 / 11.1 |
| Shih Tzu | 16.7 / 14.4 | 27.5 / 27.8 | 0.71 / 0.39 | 1.01 / 0.85 | 0.80 / 0.61 | 11.0 / 10.1 |

Nothing of his costs more in a zone: the 32.4 was the machine. His summons, the ward's bones, the lantern, the tome and the
tug's flying ball cast no shadows; the Wayhome Lantern adds one pooled light while it burns. **To do**: the gate on a
quiet machine (the owner's apps closed).
