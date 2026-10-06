# Poe: the black pug ninja (the third hero)

Status: **phases 1–3 built**. Phase 1: the class, her fūma and its bases, every skill's numbers, the kit model,
three-hero switching with the Tab wheel, the basic attack + Fūma Throw, Smoke Bomb and Shadow Step. Phase 2: the other
18 skills (moves, effects, sounds, icons), all 18 charge tables with their perks and charged releases, in the DPS band
(§3b), Shadow Step raised to a single-target tree starter (§4), the Fūma Throw read in flight and the Smoke Bomb's cap
(§3c). Phase 3: her joining scene in the Bamboo Grove and Shadow's rumour in town (§5), the "Meet Poe" guide (§6),
the phase-2 review fixes (Kunai Storm grows, capped Puff Ball and Thunder Paw glows, the Smoke Dragon redrawn: §3d) and
`tools/qa/s20-poe.mjs`. Her baked model is in (§8): the Toybox rig `poe_toy` and the Blender fūma `poe-fuma.glb`, with
the samurai shader's gated grade on her coat. Play her at once from `/?hero=poe` (she counts as joined).
QA: `tools/qa/s20-poe.mjs` (her scenario: the joining scene, a reset mid-scene, an old save and the rumour, the Meet
Poe guide, every skill tapped, the baked model and its fūma, a real charge, perf), `tools/qa/s12-heroes.mjs` §i (three heroes),
`tools/qa/s19-charge.mjs` §d (every active skill of all three heroes charge-casts), `tools/qa/prod-smoke.mjs` (the `poe`
case), `tools/test-rpg.mjs` ("POE", "CHARGED ABILITIES"); look tools `/?test=poe`, `node tools/qa/poe-shots.mjs` and
`charge-shots.mjs` (§9).

## 1. Who is Poe
- A black pug (she/her): stocky, round-headed, short-muzzled, honey eyes, a curled tail, wrinkly forehead, little
  rose-flap ears. A Bamboo Grove shinobi: swift, light, hidden. Ninjutsu (hand seals, smoke, clones, shadow-steps),
  kunai and shuriken, and her main weapon, a **giant folding bone fūma shuriken** strapped to her back.
- Earnest and a little dramatic; completely sure she is perfectly stealthy; comically un-stealthy (she snorts, and
  smoke makes her sneeze: ACHOO!). The opposite of Chewy's formal samurai (docs/HEROES.md §8): **no samurai cues**
  (no katana, no hakama, no kabuto, no formal stances).
- Look (approved sheet `tools/blender/work/codex/pug-concept/concepts/option-D.png`): black fur, a moss-green top with
  cream trim and a mustard sash, dark-moss puffy shorts, cream shin wraps, a fox festival mask pushed up on her head,
  a jutsu scroll at her hip, a kunai pouch, the fūma on her back.

| colour | sheet | in game (`src/actors/poeKit.js` `POE_PAL`) |
|---|---|---|
| fur | `#2E2A30` | the baked model: the sheet's `#2E2A30` in its texture, graded at runtime (§8: lit fur reads `#333036`–`#37333a` in the village); the kit fallback: `#33322c` coat, `#1e1d1a` mask/ears, `#605f5c` sheen |
| eyes | `#C88A3A` honey | `#c88a3a` |
| top / trim / sash | `#5A8A4A` / `#F4EAD2` / `#D8B040` | same |
| shorts | `#3D6038` dark moss | same |

## 2. The class (`src/rpg/classes.js` `CLASSES.poe`)
- Title "Bamboo Shinobi" (`ポー`, "Shinobi of the Bamboo Grove"). Base Str 8 · Dex 16 · Vit 10 · Ene 12.
- Life `36 + Vit·3.8 + lvl·5.5` (between Moka and Chewy), zoom `24 + Ene·2.8 + lvl·2.3`, **class dodge 5%**.
- Weapon: the **fūma** (`wtype: 'fuma'`, class-bound like staves: `WEAPON_CLASS.fuma = 'poe'`). It scales with
  **Dexterity** (+1% damage per point, `dmgStat.fuma`). Ninjutsu swaps that for **Energy** (`derived.jutsuMul`, §3).
- Starter kit: the Bone Fūma; skills `{ fumaThrow: 1 }`; both mouse sets `['attack', 'fumaThrow']`.
- Basic attack (`attack` with a fūma, free): a three-hit combo of quick slashes with the fūma in one paw (slash,
  backhand, a buzz-saw twirl that hits round her), 80% weapon damage (+ Shuriken Mastery), 1.9 m, 130°. While the
  fūma is out on a throw, the attack is a quick paw strike.
- Fragile but evasive: less life than Chewy, the dodge (Swift as Wind adds up to +25%; cap 40%: `combat.js` asks
  `poeDodge()`), smoke that blinds (blinded monsters miss: "Miss!"), Smoke Bomb / Vanish make monsters lose her,
  Shadow Step and her dashes are briefly untouchable.

### Fūma bases (`src/rpg/items.js`, three tiers, icon shape `fuma`)
| base | lvl | dmg | aspd | req |
|---|---|---|---|---|
| Bone Fūma | 1 | 3–7 | 1.25 | — |
| Squeaky Fūma | 5 | 4–10 | 1.3 | — |
| Bamboo Fūma | 9 | 6–14 | 1.2 | Dex 20 |
| Rawhide Pinwheel | 13 | 7–17 | 1.3 | Dex 26 |
| Kage Fūma | 20 | 12–27 | 1.25 | Dex 38 |
| Kitsune Pinwheel | 24 | 13–29 | 1.3 | Dex 44 |
| Crescent Fūma | 28 | 17–35 | 1.2 | Dex 52 |
| Raijin Fūma | 33 | 19–41 | 1.25 | Dex 60 |
| Dragonbone Fūma | 40 | 25–50 | 1.25 | Dex 72 |
| Smoke-Veil Fūma | 45 | 31–62 | 1.3 | Dex 82 |
| Thousand-Star Fūma | 50 | 38–76 | 1.2 | Dex 95 |
| Great Pug's Fūma | 55 | 36–72 | 1.35 | Dex 104 |

Damage tracks the staves tier for tier (aspd a touch higher). Rares get fūma names (`RARE_B.fuma`); the shop stocks two
fūma while she's the active hero; the tooltip reads "Slash Damage" and "Quick slashes · Fūma Throw sends it out and back
· scales with Dexterity". The fūma's shape changes by variant (bamboo nodes, crescent bends, star tips…) and is tinted by
the item's colours, on her back, in her paw, in flight and in the icons.

## 3. Skills (3 trees × 7, the D2 framework: rows 0–5 gated at levels 1/6/12/18/24/30, prerequisites, synergies)
`src/rpg/skillsPoe.js`; numbers are at skill level `l`; `lin(a, b)` = a + b·(l − 1); `dim(l, max, half)` =
max·l/(l + half). Damage is % of her rolled fūma damage, synergies folded in. **Shuriken Arts** multiply by Shuriken
Mastery; **Ninjutsu** by Ninjutsu Mastery and `jutsuMul` = (100 + %dmg + Energy) / (100 + %dmg + Dexterity);
**Shadow Step** has no damage mastery: it hits through crits (backstabs, Vanish's double crit). Elements map onto the
existing ones: phys, fire, zap, frost, holy, stink.

**Shuriken Arts** (`shuriken`, Dex, bone `#f6ecd0` / mustard `#d8b040`)
| skill | row | what | numbers |
|---|---|---|---|
| `fumaThrow` Fūma Throw | 0 | the fūma whirls out on a curve, swings round and comes home: hits every foe on the way out AND back (once per pass); the next throw waits for the catch | lin(75, 13)% per pass · range 6.5 + 0.12l m · speed scales with range (round trip ≈ 0.95 s at every level) · cost 3 + 0.15(l−1) · syn Kunai Fan 5%, Whirling Fūma 4% |
| `shurikenMastery` Shuriken Mastery | 1 | passive | +30 + 12(l−1)% Shuriken Arts and slash damage · +2 + 0.5(l−1)% crit |
| `kunaiFan` Kunai Fan | 1 | a fan of kunai | min(11, 4 + ⌊l/2⌋) kunai in min(75°, 45 + 1.5l°) · lin(55, 6)% each · cost 6 + 0.3(l−1) |
| `shadowStitch` Shadow Stitch | 2 | three kunai pin a foe's shadow: roots it and its neighbours | lin(120, 13)% · root 1.4 + 0.06l s in 1.6 + 0.04l m · cost 8 + 0.4(l−1) · cd max(0.6, 1.6 − 0.04l) |
| `whirlingFuma` Whirling Fūma | 3 | a spare fūma planted as a spinning buzz-saw that tugs foes in | lin(42, 5)% every 0.3 s · r 1.7 m · 4 + 0.15l s · 1 + ⌊l/8⌋ at once · cost 12 + 0.5(l−1) · cd max(1.2, 3 − 0.08l) |
| `shurikenRain` Shuriken Rain | 4 | a leap; bone shuriken hail over the area | 10 + l shuriken over 1.2 s · lin(72, 8)% each · r 3 m · cost 18 + 0.8(l−1) · cd 4 |
| `thousandStars` Thousand Star Flurry | 5 | ultimate: a spiral galaxy of tiny shuriken round her | lin(38, 4)% every 0.3 s to all in 4.5 m for 2.1 s · cost 34 + (l−1) · cd 9 |

**Ninjutsu** (`jutsu`, Energy, smoke lavender `#7a6aa8`)
| skill | row | what | numbers |
|---|---|---|---|
| `smokeBomb` Smoke Bomb | 0 | a hand seal and POOF: pepper smoke; foes inside are blinded (miss), she vanishes (monsters lose her); she may sneeze when it clears (35%), which gives her away | lin(45, 6)% phys in 2.6 + 0.05l m · blind 3 + 0.1l s, 35 + dim(l, 30, 10)% miss · vanish 1.2 + 0.05l s · cost 7 + 0.3(l−1) · cd max(2, 4.5 − 0.12l) |
| `ninjutsuMastery` Ninjutsu Mastery | 1 | passive | +30 + 10(l−1)% Ninjutsu damage · −dim(l, 30, 8)% jutsu zoom cost |
| `puffBall` Fire Release: Puff Ball | 1 | cheeks puffed, a bouncing fireball | lin(110, 13)% fire · 60% burst in 1.4 m · burn lin(18, 2.5)%/s for 2.5 s · cost 5 + 0.25(l−1) |
| `shadowClone` Shadow Clone | 2 | two smoky copies that mirror her attacks | 2 clones · min(80, 30 + 3(l−1))% damage · 12 + 0.5l s · life (30 + 3l)% of hers · cost 14 + 0.5(l−1) · cd 2 |
| `substitution` Substitution | 3 | the chew-toy log: blink to the cursor; foes bite the log; it pops in smoke | blink 7 + 0.2l m · log lures 2.5 s · pop lin(70, 9)% stink in 2.2 m, blind 1.5 s · cost 8 + 0.3(l−1) · cd max(1.5, 4 − 0.12l) |
| `thunderPaw` Lightning Release: Thunder Paw | 4 | a bolt drops on the target and leaps foe to foe | lin(150, 16)% zap · 2 + ⌊l/3⌋ chains, −10% per jump · stun 0.35 s · cost 16 + 0.6(l−1) · cd 0.8 |
| `smokeDragon` Smoke Dragon | 5 | ultimate: a great smoke dragon sweeps the field | lin(300, 32)% stink · 14 + 0.1l m × 3.2 + 0.04l m at 6.5 m/s (≈ 2.2 s to watch it pass) · blind 3 s · knockback · cost 38 + (l−1) · cd 8 |

**Shadow Step** (`shadow`, Dex, moss `#3d6038`)
| skill | row | what | numbers |
|---|---|---|---|
| `shadowStep` Shadow Step | 0 | she sinks into an ink puddle, pops out behind a foe and strikes | lin(250, 32)% · range 8 + 0.2l m · +25 + dim(l, 25, 10)% crit from behind · 1.6 m, 150° · untouchable in the blink · cost 3 + 0.12(l−1) · cd max(0.4, 0.9 − 0.02l) · syn Afterimage Dash 10%, Vanish 8% (this tree has no damage mastery: its synergies are bigger) |
| `swiftWind` Swift as Wind | 1 | passive | +10 + dim(l, 30, 10)% move speed · +3 + dim(l, 22, 10)% dodge |
| `afterimageDash` Afterimage Dash | 1 | a dash through the crowd leaving copies that burst into blinding smoke | lin(75, 10)% · 6 + 0.15l m · 3 images burst lin(35, 4)% in 1.5 m, blind 1.5 s · untouchable · cost 6 + 0.2(l−1) · cd max(0.8, 2.5 − 0.08l) |
| `vanish` Vanish | 2 | invisible; the next hit is a double crit and breaks it | 4 + 0.2l s · +20% speed · next hit ×2 crit, +lin(40, 6)% · cost 10 + 0.4(l−1) · cd max(4, 10 − 0.25l) |
| `caltropFlip` Caltrop Flip | 3 | a back-flip away, scattering bone caltrops | lin(28, 3.5)% every 0.5 s in 2.4 m · slow 40 + dim(l, 20, 10)% · 4 + 0.15l s · 3.2 m flip · cost 8 + 0.35(l−1) · cd max(1.2, 3 − 0.08l) |
| `bullseyeMark` Bullseye Mark | 4 | marks a foe: +damage taken from her; each hit stacks; bursts at ten or on expiry | 8 s · +10 + 0.5l% damage · lin(34, 4)% per stack (10) in 2.2 m · cost 10 + 0.4(l−1) · cd 1 |
| `phantomBarrage` Phantom Barrage | 5 | ultimate: blink foe to foe striking each from behind, back to the start, then a sneeze | min(8, 4 + ⌊l/4⌋) foes in 9 m · lin(230, 25)% each, +30% crit · untouchable · cost 32 + (l−1) · cd 8 |

Synergies stay inside a tree (as Chewy's and Moka's). Every skill has its own move (`actors/poePoses.js`), effects
(`gfx/poeFx.js`, `gfx/poeFxArts.js`), sounds (`audio/poe.sfx.js`) and painted icon (`rpg/iconsPoe.js`):
- **Kunai Fan**: paws crossed at the chest, then flung wide; kunai (grey leaf blades, cream-wrapped grips, mustard
  rings) streak out and thunk into the floor where they land. Her shadow clones fan theirs too.
- **Shadow Stitch**: an overhand whip; three kunai land round the foe's feet, a thread zips tight, and every foe in reach
  gets a stitched ink shadow under it (rooted: slow 100%, bosses 50%; it can still swing).
- **Whirling Fūma**: a spare fūma pulled from behind her back skims out and bites into the floor, a buzz-saw at knee
  height inside a dashed reach ring, tugging foes in and trimming them every 0.3 s.
- **Shuriken Rain**: a crouch, a 1.25 m leap, both paws fling at the top; tiny bone shuriken hail into a dashed ring and
  tink as they land; a landing with a pose.
- **Thousand Star Flurry**: she spins on the spot (rooted) for 2.1 s; a three-armed spiral galaxy of tiny shuriken
  streams out round her, pulling foes in; a "ta-da" at the end.
- **Fire Release: Puff Ball**: a seal, a big inhale with very round cheeks, the spit; a cartoon fireball bounces along
  the floor (scorch puffs at each hop) and bursts on the first foe (flame puffs, embers, a scorch) and burns.
- **Shadow Clone**: paws crossed in front of her face, POOF; two smoke copies (an ink-violet fresnel body with drifting
  smoke bands, drawn after a depth pass so only the outer surface shows) keep slots beside her, mirror her pose every
  frame and copy her slashes, throws and kunai fans at clonePct; monsters can pick on them.
- **Substitution**: a tiny seal and she's gone: a chew-toy log (bark rings, a leaf sprig, a pink squeaker) takes her
  place and lures every foe within 6 m (they cancel their swings at her); she lands at the cursor; the log pops in stink
  smoke (blind) after 2.5 s.
- **Lightning Release: Thunder Paw**: a paw raised high, crackling, slapped onto the floor; a bolt drops on the target and
  leaps foe to foe (an arc between each), leaving cooling gold paw prints.
- **Smoke Dragon**: three quick seals and a thrust; a cloud-dragon weaves forward along the aim at a walking-pace 6.5
  m/s: a puffy smoke head (horns, honey eyes, whiskers, a determined grin) drawn with a dark ink outline so it reads on
  grass and sand, a body of ten chained smoke puffs following the head's path and tapering to the tail, lingering puffs
  where it passed and an ink shadow on the floor; it bowls foes aside and blinds them, then fades out over 0.45 s.
- **Afterimage Dash**: a low sprint (untouchable) that drops frozen smoke copies of her along the path; each bursts into
  blinding smoke a moment later.
- **Vanish**: paws pressed, eyes squeezed shut, the ghost shimmer; +20% speed while unseen (`player.js` poeSpeed); the
  strike that breaks it is a ×2 crit.
- **Caltrop Flip**: a back-flip away from the aim (untouchable) scattering bone caltrops on the spot she left, inside a
  dashed ring: they tick and slow ("ow!").
- **Bullseye Mark**: a dainty brush flick; a red-and-cream target on the floor under the foe and a badge over its head
  that lights a pip per hit she lands (+vuln% damage from her); at ten or when it runs out: a paint splash, BULLSEYE!
- **Phantom Barrage**: she blinks foe to foe (ink puddles, streaks) striking each from behind, untouchable, then pops
  back where she started… and sneezes.
- **The "In training" lock** (`skillsPoe.js` POE_TRAINING, `skills.js` canLearn / usable, the K panel greys the node with
  a note) held back the skills whose cast wasn't built; it is empty now and stays for any skill added later.

### 3b. Charged abilities (docs/CHARGE.md §7: the generated table; tables `src/rpg/chargePoe.js`)
All 18 actives charge with the shared rules (hold past 0.18 s, Stage Ⅰ, Deeper Charge for Ⅱ/Ⅲ, +50% zoom per stage).
Her wind-up families (`actors/poePoses.js` POE_CHARGE_POSES, registered into `chargePoses.js`): `poeFuma` (the fūma
coiled back across her body), `poeKunai` (kunai fanned at the chest), `poeSeal` (a hand seal, eyes closed, rising on
the smoke), `poePuff` (cheeks filling), `poeThunder` (a crackling paw held high), `poeDragon` (three seals cycling
faster), `poeCrouch` (a low ninja crouch), `poeStars`, `poeBrush`; motes of each one's element gather on her while
charging (`poeFxArts.gather`). The releases (`combat/chargedPoe.js`) ride on her real casts from the wound-back frame.

| skill → release | the payoff | perks beyond Deeper Charge / Quick Wind-up |
|---|---|---|
| Fūma Throw → Great Fūma | bigger, further, faster, wider cut | Twin Fūma (smoky fūma on wider curves, 50%); ★ Orbiting Fūma (circles at the far end 0.6 / 0.9 / 1.2 s) |
| Kunai Fan → Kunai Storm | +2 / 4 / 6 kunai (up to twice the fan at Ⅲ), tighter, faster | Bigger Pawful (+1 / +2 kunai per stage reached); ★ Exploding Tags (25% fire pops) |
| Shadow Stitch → Grand Stitch | longer roots, a wider patch | Wide Arc; ★ Needle and Thread (pulls the pinned together) |
| Whirling Fūma → Buzz-saw Fūma | bigger, longer, stronger pull | ★ Wandering Saw (drifts after foes); ★ Bone Shrapnel (8 shards) |
| Shuriken Rain → Shuriken Monsoon | more shuriken over a wider patch | Efficient Focus; ★ Falling Star (Ⅲ: a giant one, 80% in 2.5 m) |
| Thousand Star Flurry → Galaxy Flurry | wider, longer | Efficient Focus; ★ Supernova (Ⅲ: 150% of a tick to all) |
| Smoke Bomb → Smoke Screen | bigger cloud, longer blind and hide | ★ Extra Pepper (30%/s inside, 3 s); ★ Perfect Stealth (no sneeze, a ×2 crit out) |
| Puff Ball → Great Fireball | bigger ball and burst, hotter | Ember Spit (extra fireballs); ★ Bouncing Ember (hops to 2 more) |
| Shadow Clone → Clone Army | a third clone from Ⅱ, tougher, harder-hitting | ★ Look Over Here! (they lure); ★ Clone Pop (smoke burst on expiry) |
| Substitution → Log Fort | longer blink, longer lure, bigger pop | ★ Two Logs; ★ Splinters (6 × 40%) |
| Thunder Paw → Thunder God Paw | more chains, less falloff, longer stun | Rolling Thunder (echo); ★ Thunderhead (a zapping cloud, 3 s) |
| Smoke Dragon → Great Smoke Dragon | longer, wider | Efficient Focus; ★ Twin Dragons (Ⅲ: a second one back, 30%) |
| Shadow Step → Shadow Ambush | longer step, a much harder, surer cut (a single-target charge) | Second Shadow (echo on the same foe); ★ Sure Kill (always crits) |
| Afterimage Dash → Mirage Dash | much longer dash, more images, bigger bursts | ★ Rewind (dash back through); ★ Mirage (images lure 2 s first) |
| Vanish → Deep Vanish | longer, a much bigger opening strike | ★ Smoke Exit (a blinding puff); ★ Assassin (×3 crit, hits round its target) |
| Caltrop Flip → Caltrop Carpet | a wider, longer, slower carpet | Wide Arc; ★ Extra Spiky (a 0.6 s trip) |
| Bullseye Mark → Big Target | 2 marks from Ⅱ, juicier targets | ★ Spreading Paint (a burst paints the next at 3 stacks); ★ Jackpot (×2 at 10) |
| Phantom Barrage → Phantom Storm | more targets, faster, harder | Efficient Focus; ★ Grand Finale (Ⅲ: one last cut on all, 25%, no sneeze) |

**The band** (`node tools/charge-sim.mjs`, models `tools/charge-sim-poe.mjs`, tunes solved with `--solve`): every damage
skill's full charge is +21–24% sustained (Ⅲ, every perk; Ⅰ / Ⅱ at ×0.95–1.24), bursts ×1.6–4.1 a tap. Shadow Step's
charge pays on single targets as on packs (×1.20 / ×1.21), and so does Kunai Fan's now (×1.17 / ×1.17 / ×1.21; pack
×1.23, single ×1.15: the extra kunai land on a lone foe too, no tune needed); the other AoE ones charge at a loss against
a lone foe (Puff Ball ×0.36, Shadow Stitch ×0.79): tap those on bosses. Her summon and buffs are reported, not banded:
Shadow Clone ×1.04 / 1.5 / 1.39, Vanish ×1.21 / 1.17 / 1.28, Bullseye Mark ×0.95 / 1.48 / 1.38.

### 3c. The phase-1 review fixes
- **Fūma Throw reads in flight**: the thrown fūma flies at the size it is on her back (`fumaScale()`: it used to shrink
  to 70%), inside a spin disc as wide as it is (cream swept wedges in a thin ink rim, so it shows on sand and on grass), a
  flat cream ribbon trailing ~2 m of its path, and a soft shadow with a dashed ring on the floor under it, on both
  passes. `poe-shots.mjs fumaThrow --follow` frames the throw (sheet-follow.png).
- **Smoke Bomb's dome**: the additive floor ring (3 m, 75%) and the flood light are gone; a soft normal-blend ring that
  ends inside the cloud (≤ 0.7 r, 30%) and a small, short light remain, with the puffs and the POOF.

### 3d. The phase-2 review fixes (the readability rule: an effect never washes the screen; each is capped where it's made)
- **Kunai Storm grows**: the echo perk (Second Flick) and the pierce from Ⅱ are gone; the charge adds 2 / 4 / 6 kunai
  and the new **Bigger Pawful** perk (2 ranks, Lv 2 / 6) +1 / +2 more per stage reached, so a full Stage Ⅲ fan is about
  twice a tap (`chargePoe.js` `more`, `poeArts.js` `poeKunaiVolley` reads `p.extra`).
- **Charged Puff Ball**: the fireball's glow is capped at 1.1 m and 30% (normal blend), its trail puffs at a fixed size
  whatever the charge, the burst at 2.6 m with a 1.8 m, 30% ring and a small light (1.1 intensity, ≤ 2 m): a bigger,
  hotter ball, not a bigger orange screen.
- **Charged Thunder Paw**: the shared 7 m lightning flash (and its light per chain) is gone; her own bolt (a thin core of
  additive motes with a normal-blend glow on every third, 40%), a small strike light (2, 2.2 m), fewer, smaller paw
  prints (60%, fading to ink, none from the Rolling Thunder echo): no yellow haze at Stage Ⅲ.
- **Smoke Dragon**: redrawn (§3) and slowed to 6.5 m/s so it sweeps by long enough to see; started 1.4 m ahead
  of her paws. `poe-shots.mjs smokeDragon` and `--charge 3` (sheet-fix3.png).

## 4. Balance (`node tools/hero-balance.mjs`, asserted in `tools/test-rpg.mjs` "POE")
Same level, same gear rule (the best normal base of each hero's weapon the level allows), a skill build each (the
bread-and-butter skill, then its mastery, then a synergy), stat points 50% damage stat / 30% Vit / 20% Energy.
Clear speed = sustained damage over a 60 s fight, 70% against a pack of five within 3 m, 30% one target, zoom
regenerating, the basic attack filling any wait; survivability = eHP = life / ((1 − dodge)(1 − block)(1 − armour)).

| level | Chewy (Chomp) dps / eHP | Moka (Splash) dps / eHP | Poe (Fūma Throw) dps / eHP | Poe vs the mean |
|---|---|---|---|---|
| 6 | 34 / 159 | 45 / 132 | 45 / 151 | dps ×1.14 · eHP ×1.04 |
| 15 | 150 / 265 | 191 / 223 | 169 / 260 | ×0.99 · ×1.07 |
| 30 | 1396 / 447 | 1584 / 380 | 1403 / 446 | ×0.94 · ×1.08 |
| 45 | 6071 / 625 | 6653 / 535 | 5879 / 629 | ×0.92 · ×1.08 |

Her raw life is ~2% under the Chewy–Moka mean (and ~10% under Chewy); the class dodge brings her eHP level with
Chewy's. Swift as Wind is her survivability passive: at 20 it is +17.7% dodge (22.7% in all, eHP ×1.23).

**Shadow Step as a tree starter** (the director's ask: as a main skill, about ×0.6 the mean clear and ×1.2 the mean
single target, still a single-target opener). The `poe·step` build (Shadow Step, then Afterimage Dash and Vanish for
their synergies, then Swift as Wind): lin(140, 16)% → **lin(250, 32)%**, cost 5 + 0.25(l−1) → **3 + 0.12(l−1)** (it's a
spammable opener, zoom-bound before), synergies 5% / 4% → **10% / 8%** (the tree has no damage mastery).

| level | single target dps vs the mean | clear vs the mean |
|---|---|---|
| 6 | 38 vs 31 → ×1.21 | ×1.27 |
| 15 | 159 vs 121 → ×1.32 | ×1.23 |
| 30 | 1373 vs 982 → ×1.40 | ×1.19 |
| 45 | 5119 → ×1.22 | ×1.04 |

(Its clear stays above ×0.6 because her basic slash fills the gaps between steps; the step itself still hits one foe.)
test-rpg asserts dps ×0.85–1.2 and eHP ×0.9–1.15 of the mean at levels 6/15/30/45, the Shadow Step build's clear ≥ ×0.6
and single target ×1.15–1.6, and that a throw's round trip stays under ~1 s. Fūma Throw's out-and-back flight is
integrated by `fumaFlight()` (the same equations as `poeSkills.js updateFuma`).

## 5. Joining (`src/actors/poeJoin.js`, owned by HeroManager: `heroes.poeJoin`, updated every frame)
- **The scene** runs on any visit to the **Whispering Bamboo Grove** while `flags.poeJoined` is false, so a new game and
  an old save meet her the same way (the grove opens at level 4, the Wayfarer's Post). It has four beats:
  - *wait*: her rig is built hidden as you arrive (no hitch later); she starts once you've been there 7 s, walked 6 m
    and nothing is chasing you (no aggro within 13 m, no dialogue, no boss fight, no modal).
  - *tail*: she "stealthily" follows up to 7 m behind, along **your path** (a point every 0.5 m, so she comes round the
    bamboo, not through it), crouched on tiptoe (`sneakWalk`), and always **on screen** (clear of the HUD): walking
    up-screen the path behind you runs off the bottom of the screen within a few metres, so she sneaks along beside you
    instead, 3.5–5.5 m off to one side (`behindPoint`). Look her way (within ~50°, under 11 m) and she freezes
    stiff as a bamboo stalk, eyes shut (`ninjaFreeze`, a sweat drop). Every 4–6.5 s a little pug snort (`poe_snort`, a
    puff at her nose) and Shadow pricks up his ears ("?"); after 2.5 s his hint: "Something is following us…". If she
    falls more than 16 m behind (round a corner) she catches up.
  - *caught*: after 16 s of it, or the moment you walk up to her (under 2.6 m): ah… ah… **ACHOO!** (the sneeze, the
    ACHOO! word, "!" over you and Shadow); controls lock, the camera pulls in to frame you both (`G.introFocus`), she
    trots up, embarrassed.
  - *talk*: "Ahem. You saw nothing… just a very short bamboo." (two choices); she insists it was a TEST and you passed;
    `prepareJoin('poe')` (she arrives near the pack's level, with points to spend); "Can I join?" (two choices);
    `joinPoe()` (banner "Poe joined the pack!", `flags.poeJoined`, the save) and she vanishes in a puff of smoke ("POOF!",
    and a faint achoo from somewhere in the bamboo a moment later). Controls come back.
- **Resets**: leaving the grove, a hero switch or dying before she's caught drops the scene (and her actor); the next
  visit starts over. Once caught it always finishes. Events: `poe:joinScene { phase: 'tail' | 'caught' | 'done' }`.
- **The rumour**: in town, once Moka has joined and Poe hasn't, Shadow passes on a rumour after 10 s (once,
  `flags.hints.poeRumour`): somebody's been tiptoeing round the Bamboo Grove, very loudly — "take the Wayfarer's Post" if
  the grove is open, "it opens at level 4" if not.
- After the scene she's a villager at the cottage (`spawnBench` on the return to town). `?hero=poe` (debug) and
  `G.heroes.joinPoe()` (QA) join her at once.

## 6. Three heroes: switching and the Tab wheel (`src/actors/heroes.js`, `src/ui/heroWheel.js`)
- `state.heroes.poe` is a full hero (`player`, `equipment`), created fresh by `normalizeHeroes` for every save, so
  old saves migrate without a version bump. Her villager lives at Chewy's house with the others.
- **Tap Tab** = the next joined hero (roster order Chewy → Moka → Poe, skipping heroes not yet joined). **Hold Tab**
  (≥ 0.26 s) = the **hero wheel**: a card per hero round a ring (portrait, name, class, level; a silhouette and a
  hint for heroes not yet joined; the cooldown or why a hero can't be picked). Point the mouse toward a card (or
  hover / click it) and let go of Tab to confirm; the number keys 1–3 pick and confirm; Esc closes it. It isn't a
  modal (the world keeps running), but the skill keys are skipped while it's up.
- The HUD's hero portrait, plus a mini portrait for each other joined hero (the Tab one, and a smaller one for the
  third); a click on a mini portrait switches to that hero.
- The rest is HEROES.md §4–5 (the transition, the villager mode, "Let's switch!"); Poe's villager lines are
  `HERO_CHAT.poe`.
- **The "Meet Poe" guide** (`src/world/guides.js` `meetPoe`, docs/TUTORIALS.md; narrated by Poe, moss green): it
  starts in town once she has joined, while you play someone else. 1. *tap*: "Tap Tab" (the switch button spotlit) →
  the next hero. 2. *hold*: "Hold Tab: the hero wheel" (her wheel card spotlit while it's open, or the ring if you're
  her already) → any pick through the wheel (mouse or number key). 3. *fuma*: her binds (left-click slashes, right-click
  Fūma Throw: stay put and catch it) and her three trees. 4. *wrap*: the mini portraits, tap / hold Tab. Old saves past
  her join get the usual one-time "New guide available" offer; it replays from the guide list.

## 7. Code map
- Class and items: `src/rpg/classes.js` (`CLASSES.poe`, `HERO_TEXT`, `WEAPON_CLASS`), `src/rpg/items.js` (fūma bases,
  `starterFuma`), `src/rpg/actions.js` (starter kit, `equipProblem`).
- Skills: `src/rpg/skillsPoe.js` (POE_TREES, POE_SKILLS, `poePassives`), merged by `src/rpg/skills.js` (`skillCost`
  reads the tree cost cut); `src/rpg/stats.js` calls `poePassives` and `rollHit` takes `critAdd` / `critX` / `forceCrit`.
- Casting: `src/combat/poeSkills.js` (`installPoeSkills(SkillRunner.prototype)`: `cast_fumaSlash`, `cast_fumaThrow`
  and the flight, `cast_smokeBomb`, the hide / reveal / sneeze, `cast_shadowStep`, `castBlocked`, `poeDodge`,
  `updatePoe` / `clearPoe`); `combat.js` (dodge, blind ticks), `dungeon/monster.js` (hidden player, blind miss).
  Phase 2: `src/combat/poeArts.js` (Shuriken Arts + her shared machinery: `poeShoot` — her own kunai / shards /
  fireballs, `poeLob`, `poeZone` traps and fields, `poeNova`), `src/combat/poeJutsu.js` (Ninjutsu; the `ShadowClone` and
  `SubLog` allies; `poeCloneEcho`), `src/combat/poeShadow.js` (Shadow Step tree; the Bullseye marks, read by `poeHit`),
  `src/combat/chargedPoe.js` (her 18 charged releases). `player.js` speedMul reads `poeSpeed` (Vanish).
- Charging: `src/rpg/chargePoe.js` (her 18 tables; `charge.js` merges them with its perk families), wind-ups
  `POE_CHARGE_POSES` (`actors/poePoses.js`, registered by `chargePoses.js addChargePoses`), the sim's models
  `tools/charge-sim-poe.mjs` (merged by `charge-sim.mjs`).
- Looks: `src/actors/poeKit.js` (the Toybox kit's extras: hood, cowl, scroll, pouch, sleeves, shorts, wraps, the fox
  mask; the coat sheen), `CAST.poe` in `src/actors/charKit.js` (the `toy` hook: pug head, pug ears, curl tail),
  `src/actors/toyKit.js` (HEADS.pug, `pugEar`, TAILS.curl, `TOY_KIT`), `src/actors/poeGear.js` (the fūma geometry, back /
  paw / thrown, the smoke ghost material), `src/actors/poePoses.js` (her actions), `src/gfx/poeFx.js` (fūma flight,
  smoke, ink puddles, streaks, "POOF!" / "ACHOO!"), `src/gfx/poeFxArts.js` (phase 2: kunai and their thunks, stitched
  shadows, zone rings, falling and spiralling shuriken, the Puff Ball, the log, Thunder Paw's bolt and paw prints, the
  Smoke Dragon, the Bullseye), `src/actors/poeProps.js` (kunai, tiny shuriken, the log, caltrops; `smokeCopy` — the
  clone / afterimage rig copies), `src/audio/poe.sfx.js` (35 synth sounds), `src/rpg/iconsPoe.js` (fūma item art and all
  21 skill icons).
- Joining: `src/actors/poeJoin.js` (the scene and the rumour; `heroes.js` owns it), the `sneakWalk` / `ninjaFreeze`
  holds in `poePoses.js`, the `meetPoe` guide in `src/world/guides.js`.
- UI: `src/ui/heroWheel.js` + `.css`, `src/ui/hud.js` (the second mini portrait, the fūma weapon badge),
  `src/ui/rpg.js` / `character.js` (her trees and text), `src/ui/glyphs.js` (fuma, smoke, kunai).

## 8. The baked model (`HERO_MODELS.poeToy`, the fūma prop, the mount, the coat)
Built by an Opus agent with the toybox-character skill (sources `tools/blender/work/codex/poe-toy`; the approved sheet
`option-D`). Installed 2026-10-05: `public/rigs/poe_toy.{json,bin,png}` + `poe_toy_n.png` (37 bones, 30,072 tris, 1.2 m)
and `public/models/poe-fuma.glb` (1,232 faces). Settings › Hero models › Samurai or Toybox use her (`cfgFor`: poeToy
first); Storybook has no Poe, so she stays the kit there (`CAST.poe`), as she does if the files are missing.
- **The rig**: the 37-bone biped contract, as Chewy and Moka, with **no fūma in it** (the hero exporter merges every
  skinned mesh into one). `HERO_MODELS.poeToy` (`src/actors/heroModels.js`):
  - `palm: [-0.044, -0.054, 0.006]`: the fūma's grip, the right paw's centre off the `hand_R` bone (her paws sit out
    along the A-pose arm). The left paw mirrors its x (`buildHeroModel` now mirrors every palm; the others' x is 0).
  - `back: [0, 0.048, -0.3]` (chest frame): her coat's back is at z −0.30 there. Only the kit uses `back` for the fūma.
  - `earGain: 0.5`: the agent's safe swing. The left ear is damped in the weights (`LEFT_EAR_K` 0.12) so it stays out
    of the festival mask. The Animator also takes a gain per ear (`earGain: [left, right]`, `animator.js secondary`);
    hers stay equal (no clipping seen in the face and pose checks).
  - `squint: [0.58, -0.24]`: the rebuilt lids read a clean happy squint there (the default 0.488 left a ragged sliver).
  - `wave: 'out'`, `outline: '#1c181e'`.
- **The fūma**: `public/models/poe-fuma.glb`, pivot at the hub centre, the bone arms in the model's plane, the spin axis
  Blender +Z (the game's +Y), tip radius 0.4 m (0.8 m across). `actors/poeGear.js` `FUMA_MODEL` (`pending` gone) loads it
  with `loadGlb`. Every fūma in the game is a holder (`fumaObject`: the procedural mesh or the prop, swapped in place
  when it loads): on her back, in her paw, in flight, the spares, the twins, the clones' throws. Each holder fits the prop
  to the procedural fūma's 0.3 m radius (`FUMA_FIT_R`), so the kit rig's mounts and hit radii stay as tuned. On the baked
  rig, the back and paw holders scale by `FUMA_MODEL.radius / FUMA_FIT_R` (4/3), so the prop shows at its own 0.8 m;
  `fumaScale()` reads that, so the thrown one flies at the same size. Other fūma bases tint the prop toward their blade
  colour. Dev: `?fumaglb=<file>` loads another model as a stand-in.
- **The mount**: `export/fuma_mount.json` → `fumaMount: { pos: [0, 0.628, -0.35], quat: [0, 0.741451, 0.671007, 0],
  bone: 'chest', scale: 1 }`. That is the hub centre and the prop's orientation in model space, game axes (the chest
  frame: `[0, 0.048, -0.35]` from the chest head at `[0, 0.58, 0]`). The hub sits 5 cm proud of the coat, the arms an
  X across her back. The loader's `propMount` builds `parts.fumaMount`; `dressPoe` turns the holder into it. `scale` is
  relative to the prop's own size. The back fūma hides while it's in her paw or in flight (`carryFuma`). Seen from the
  front at the game camera, her big head hides it; from the side and behind it reads clearly.
- **The coat**: the texture's coat is the sheet's `#2E2A30`, a near-neutral black (chroma 0.02). Ungraded, the grade
  pass's dark lift turns it violet (`#1a003c` in the village). It uses the samurai's gated tools (see `chewySamurai`
  in heroModels.js): `darkGrade: [1, 7, 4, -2, 0.1]` and `darkNeutral: 0.85`.
  - The darkGrade gate (0.1 chroma) keeps the grade to the coat, the lids, nose and lips. Inside it: a full desaturate
    and a slight warm lift.
  - `darkNeutral` holds those texels neutral after lighting, against the grade pass's violet lift.
  - `darkFur: 1` gives her moss, mustard and brown darks the same lift counter. There is no `furGrade`: she has no
    coloured fur.
- Measured in game (`tools/qa/tmp/poe-coat.mjs` samples coat vertices projected to the screen; face / crown):

  | light | face | crown (the painted sheen) |
  |---|---|---|
  | village 11:00 | `#333036` | `#37333a` |
  | village 17:48 | `#342f35` | `#342e36` |
  | the Burrow, floor 1 | `#3f3026` | `#6d6660` |
  | Crystal Grotto | `#301f18` | `#665e59` |
  | Bamboo Grove | `#211b18` (canopy shade) | `#342f30` |
  | Tidepool | `#433a34` | `#4d4746` |
  | Maple | `#36251a` | `#403431` |
  | Yukimi Onsen | `#423a4a` | `#69626c` |

  The village and dusk sit in the sheet's range (`#2e2b30`–`#3a363c`). The Burrow, Grotto and Maple warm her toward
  brown: that's their warm key light and grade (ROADMAP H-3, the same on the samurai Chewy's fur), not the coat. The
  onsen's lilac light reads through. Portraits render ungraded (`portraits.js` zeroes the grade and the lift counter)
  and frame her round head and mask (`poe_toy`: ×1.1, +0.13 m).
- The kit fallback keeps its warmer `#33322c` under the Toybox kit's own grade (`toyKit.js toyMaterial`).

## 9. Look tools
- `/?test=poe` — her test stage: `views=1` (turnaround), `fumas=1` (the twelve fūma), `furs=` (coat swatches), `act=`
  (an action looped), `hand=` (fūma in paw), `ghost` (the smoke ghost), `portrait=1`, `dg=` (a dark grade), `spec=`.
  Dev colour overrides: `?poefur=&poemask=&poesheen=`.
- `node tools/qa/poe-shots.mjs [ids…] [--charge 1|2|3] [--close] [--follow] [--village] [--out <dir>]` — her skills
  shot in play, one cast each frozen at a few moments (the pack to screen-right, tough and stunned; every skill from the
  same spot); `--charge` casts the charged release with every perk, `--follow` frames the thrown fūma; output
  `tools/qa/tmp/poe-shots/` (gitignored).
- `SHOT_DIR=tools/qa/tmp/charge-shots node tools/qa/charge-shots.mjs <ids> [--pose]` — the shared charge review (real
  RMB hold: the wind-up, each stage, the release) now boots Poe for her skills.
- `node tools/qa/s20-poe.mjs` — her QA scenario (in `run-all.mjs`).
- The baked model: `node .claude/skills/toybox-character/scripts/face-check.mjs --id poe --cy 0.85 --dist 3.6` (rest,
  talk, blink, bark, happy; `/?test=chars&only=poe`); dev probes in `tools/qa/tmp/` (gitignored): `poe-coat.mjs` (the
  coat in eight lights, grades applied live), `poe-poses.mjs` (24 poses), `poe-owner.mjs` (the village at both yaws, the
  Burrow, the throw, her villager mode), `poe-ui.mjs` (the portraits).
- `node tools/hero-balance.mjs` (the hero comparison and the Shadow Step build) · `node tools/charge-sim.mjs <ids>
  [--solve]` (the charge band).
