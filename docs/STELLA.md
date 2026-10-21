# Stella: the Sun Oracle (the sixth hero)

Status: **checkpoint 1, the design, redone for the Sun Oracle** (ROADMAP H-6). The owner's first picks (2026-10-12): a
sixth hero from Shiokaze Port (the Tide Pool), a **female Weimaraner named Stella** (she / her, blue eyes), sheet C2. The
owner's review (2026-10-13) **changed her direction**:
- the class title is just **"Oracle"**;
- **two fire attack trees and one support tree**, styled around a **sun oracle**;
- a **sun-themed basic attack**;
- her home stays Shiokaze Port: she is the oracle of the port's little **sunrise shrine**, who greets the sun over the sea
  each dawn; Kaizo's rowboat arrival stays, re-themed;
- her look: the parasol and robe colours change ("parasol and robe colours"): the Blender builder recolours the robe
  to sunrise colours with sun motifs (Codex is drawing three palette options for the owner) and replaces the jellyfish
  parasol with a **sun wagasa** (a sunburst canopy, a gold sun-disc finial, chunky tassels, about the same size and grip).
  The shapes and the rig don't change.

**Checkpoint 2 built (2026-10-15)**: the class, the 21 skills and their 15 charged releases with every perk, the effects,
sounds and poses, the `ally` aim, the sun shells and Shadow's 6 s wake, her arrival and quest, the six-hero roster, the
guide and the debug actions, the balance (§7), `tools/qa/s48-stella.mjs`. The Midday rig (`stella_toy`, 17,653 vertices)
and the sun wagasa are installed (§8). The id is `stella`. What changed from the plan is marked **(CP2)** below.

## 1. Who she is
- A silver-grey Weimaraner (she/her): a smooth short coat, long floppy ears with a fold at the root, blue eyes with a
  darker rim, a mauve-brown nose, a slender wagging tail; 1.24 m to the top of her head.
- **The Oracle of the sunrise shrine**: Shiokaze Port's little shrine on the point (a weathered torii on the rocks,
  facing east over the sea). Every dawn she greets the sun as it rises out of the sea, with a solemn bow and the parasol
  raised. "The sun has never once been late. I like to think that's partly me."
- **Her look**: the owner's pick, Option B **"Midday"**: a saffron `#F0C24E` robe with sun motifs over a warm-white
  `#FFF9EC` petticoat, a sunset-red `#D9573E` obi and big back bow, amber `#DFA23C` beads; the **sun wagasa** over her right
  shoulder: a red-and-gold sunburst canopy, a gold sun disc on its finial, chunky amber tassels.
- **Her magic**: sunlight. Soft golden rays, beams and flares of white-gold light, sun discs, the warmth of morning:
  **the game's fire element**, but sunlight, never flames.
- **Personality**: calm, kind and quietly confident, with a dry, playful streak ("I'll keep you warm. And a little bit
  on fire, if anyone's rude."). Solemn about the sun; and then, when something delights her (a dog, mostly), the
  **Weimaraner zoomies**, and afterwards a very composed "…Ahem."
- **Her place**: Captain Kaizo, the port's old captain, is her friend; he rows her to Blossom Hollow (§6).
- **Tone**: cozy and bright. Sunrise, dawn and dusk, sun discs, golden hour, light motes in a sunbeam, a little sun with
  a smile. No scorched bodies, no screaming fire. Effects follow the readability rule (docs/POE.md §3d), and here
  especially **the bloom** (§4.1): none washes the screen out.

| colour | the sheet / the plan | use |
|---|---|---|
| fur | `#A9A6A2` | the baked texture; lit `#989395`–`#aba8a7` in the village (§8) |
| nose | `#8F7474` | the builder's new export repaints it (§8) |
| eyes | `#7FB2E0`, rim `#3F6F9F` | unchanged |
| robe | saffron `#F0C24E` | the owner's pick, Option B "Midday" (`tools/blender/work/codex/stella-sun-concept/concepts/option-B.png`) |
| petticoat | warm white `#FFF9EC` | Midday |
| obi and back bow | sunset red `#D9573E` | Midday; the class accent |
| beads | amber `#DFA23C` | Midday |
| the wagasa | a red-and-gold sunburst, amber tassels | Midday; the Paper Wagasa is the prop as painted |
| sunlight core | `#fffaf0` | the thin hot middles of beams and flares (tiny, budgeted) |
| sun gold | `#ffd36a` | her light, her damage numbers, the sun discs |
| pale gold | `#fff1b8` | the soft rays and falloffs |
| dawn rose | `#f7b8a8` | the Dawn tree (heals, shells, buffs) and the Corona's rims |
| (not hers) fire orange | `#ff9a3c` | Chewy's Blazing Ball, the game's fire numbers: she never uses it |

## 2. The class (`src/rpg/classes.js` `CLASSES.stella`, checkpoint 2)
- Title **"Oracle"**; `HERO_TEXT.stella`: `{ jp: 'ステラ', motto: 'Oracle of the Sunrise Shrine' }`. Colour saffron `#e6b422`
  (her robe's; apart from Foosy's ember orange on the wheel), accent sunset red `#d9573e`; `garment: 'robe'`; trees
  `['ray', 'flare', 'dawn']`; weapons `['parasol']`.
- **Base** Str 8 · Dex 9 · Vit 13 · Ene 16 (46, as the others since Poe).
- **Life** `40 + Vit·4.0 + lvl·5.8` (about the five-hero mean), **zoom** `26 + Ene·3 + lvl·2.6` (Moka's: a caster's pool).
- **The class trait, "Sunrise Blessing"** (`sun: { shell: 20, shellT: 8, shadowRevive: 6 }`):
  - **Sun shells**: healing past an ally's full life becomes a **sun shell**, a thin golden shield, up to 20% of that
    ally's life, lasting 8 s (fading over the last 2). Her heals are never wasted on a full pack.
  - **Shadow under her care** wakes 6 s after fainting instead of 10, while she's the hero played.
- **The element**: her damage is the game's **fire** (stats.js `ELEMENTS`): fire resistance, fire gear, fire-enchanted and
  fire-resistant monsters all work as they do for Chewy's Blazing Ball and Foosy's embers. Her burns are called
  **sunburn** (the game's fire damage over time). Her light **looks** nothing like their flames (§4.1), and her fire
  numbers float in sun gold rather than fire orange (a per-hit colour: `hitMonster`'s float takes her `tint`).
- **The weapon**: the **sun wagasa** (`wtype: 'parasol'`, class-bound: `WEAPON_CLASS.parasol = 'stella'`). It scales with
  **Energy** (+1% damage per point, `dmgStat.parasol = 'ene'`), like Moka's staff. Every tree uses Energy; Vitality grows
  her life and so her shields (a share of the life they protect).
- **Heals and shields** are a **share of the target's own life**, times her healing bonus (`derived.healMul`: Sunny
  Disposition, healing affixes) or shield bonus (`derived.shieldMul`). They're worth the same on any ally, in solo or in
  co-op (§5).
- **Starter kit**: the Paper Wagasa; skills `{ goldenRay: 1, morningLight: 1 }` (a fire skill and a heal); hotbar LMB
  attack, RMB Golden Ray, key 1 Morning Light; the second weapon set's right click is Morning Light.
- **The basic attack** (`attack` with a parasol, free): **the Sunsweep combo**, short range:
  - two **sweeps** of the open wagasa, each throwing a crescent arc of sunlight 2.6 m out on a 90° arc: 100% weapon
    damage (fire) to every foe in it;
  - then a **twirl**: the wagasa spun open over her head and a ring of light flashes out round her: ×1.1 to every foe
    within 2.2 m, a small push (0.6);
  - a pause over 1.3 s starts it over; each move takes one attack at her attack speed (the twirl a touch longer); the
    reach assist lunges (≤ 1.0 m) or walks her up, as for the others' melee.
  Short range, not a bolt: Moka is the ranged caster; Stella fights at a few metres, where her sweeps, her flares and her
  shields all reach the pack. (Auto-targeting: `melee`.)

### The wagasa bases (`src/rpg/items.js`, three tiers, icon shape `parasol`, colours [canopy, rays, finial])
| base | lvl | dmg | aspd | req |
|---|---|---|---|---|
| Paper Wagasa | 1 | 3–6 | 1.15 | — |
| Morning Wagasa | 5 | 4–9 | 1.2 | — |
| Marigold Wagasa | 9 | 5–13 | 1.1 | Ene 20 |
| Lantern Wagasa | 13 | 6–16 | 1.15 | Ene 26 |
| Festival Wagasa | 20 | 11–25 | 1.15 | Ene 38 |
| Golden Hour Wagasa | 24 | 12–27 | 1.2 | Ene 44 |
| Shrine Wagasa | 28 | 16–32 | 1.1 | Ene 52 |
| Sunburst Wagasa | 33 | 17–38 | 1.15 | Ene 60 |
| Daystar Wagasa | 40 | 23–46 | 1.2 | Ene 72 |
| Corona Wagasa | 45 | 29–57 | 1.15 | Ene 82 |
| Solstice Wagasa | 50 | 35–70 | 1.05 | Ene 95 |
| Dawnbringer | 55 | 33–66 | 1.25 | Ene 104 |

About 0.92 of a staff's damage at the same tier, a touch quicker.
- **Item size** (docs/INVENTORY.md): **2 × 2**, like Poe's fūma: the open canopy is round and wide (a 1 × 3 tile would
  squeeze it to a stick). `WEAPON_SIZE.parasol = [2, 2]` in `rpg/grid.js`.
- Rares get wagasa names (`RARE_B.parasol`: Wagasa, Parasol, Canopy, Sunshade, Halo, Daystar, Dawn, Ray); the shop stocks
  two while she's the active hero; the tooltip reads "Sunlight Damage" and "Sweeps and a twirl of sunlight · scales with
  Energy". Weapon drops favour her class (75%) while she's played (`CLASS_WTYPES.stella = ['parasol']`).
- **Every base is the same Blender prop, tinted** by the item's colours (`stellaGear.js setParasolLook`, as the lance's
  and the flail's), by hue on the prop's one texture; the Paper Wagasa is the texture as painted.

## 3. Skills (3 trees × 7, the D2 framework: rows 0–5 gated at levels 1/6/12/18/24/30, prerequisites, synergies)
`src/rpg/skillsStella.js` (checkpoint 2); numbers at skill level `l`; `lin(a, b)` = a + b·(l − 1); `dim(l, max, half)` =
max·l/(l + half). Damage is % of her rolled wagasa damage with synergies folded in, × the tree's mastery. Heals and shields
are % of the target's life × `healMul` / `shieldMul`. The tree ids `ray`, `flare`, `dawn` and every skill, release and
perk name below were checked against every existing skill and against docs/CHARGE.md §7 (Foosy's Sunbeam Thrust,
Sunfall Jump, Sunshower, High Noon, Second Sun, Shooting Star and Poe's Supernova are taken; nothing here repeats them).

**Two marks run through her fire trees**:
- **Sunlit** (the Radiance tree's): her rays **gild** foes, up to 3 stacks for 6 s (a gold glint, a pip a stack). With the
  Sunlit passive each stack makes the foe take more of her fire, and a full gilding **flares** on her next hit.
- **Sunburn** (the Corona tree's): her flares leave a sunburn, the game's fire damage over time; with the Sunburn passive
  every hit of hers burns a little, and sunburnt foes take more from the Corona.
They're independent (each tree stands alone), and they stack well together.

**Radiance** (`ray`, sun gold `#ffd36a` on white `#fffaf0`) — beams, a glint, a prism, a focused solar ray
| skill | row | what | numbers |
|---|---|---|---|
| `goldenRay` Golden Ray | 0 | she points the wagasa's sun-disc finial and a ray of golden light lances out through every foe in its line | lin(82, 7)% fire to every foe in a 10 m line, 0.35 m either side · gilds each (Sunlit +1) · cost 3.2 + 0.12(l−1) **(CP2)** · syn Inner Light 3%, Prism 4% |
| `innerLight` Inner Light | 1 | passive (the mastery) | +18 + 5.5(l−1)% Radiance damage **(CP2: gentler than the others' masteries: her rays pierce whole lines)** · +1.5 + 0.4(l−1)% crit |
| `glint` Glint | 1 | the finial catches the sun like a mirror and flashes it into the foes' eyes | lin(60, 6.5)% fire in a 70° cone 6 m long · dazzled 1.5 + 0.03l s (they miss 35% of their attacks) · gilds · cost 6 + 0.3(l−1) · cd max(1.5, 3 − 0.06l) · syn Golden Ray 4%, Sunlit 3% |
| `prism` Prism | 2 | she lifts a sun-glass to the light and the ray splits into a fan | min(7, 3 + ⌊l/5⌋) rays in a min(70, 40 + 1.5l)° fan, 9 m, each piercing · lin(58, 6)% each · each gilds · cost 5 + 0.28(l−1) · syn Golden Ray 4%, Solar Ray 3% |
| `sunlit` Sunlit | 3 | passive: her light gilds what it touches, and gilded foes are easy to burn | each Sunlit stack: +4 + dim(l, 6, 10)% fire damage taken from her and her little sun · at 3 stacks her next fire hit **flares** it: lin(60, 7)% fire in 1.8 m (the stacks spent; once a foe every 2 s) |
| `solarRay` Solar Ray | 4 | channel: a focused solar ray, sunlight through a burning glass: a thin white-gold beam from the finial to her target that grows hotter while it holds | lin(120, 12)% **(CP2)** fire a second to the target (and the first foe in the way), +25% a second while it holds, ×2 at most (a new target starts it over) · 12 m · gilds · she walks at 50% · 6 + 0.3(l−1) zoom a second · syn Golden Ray 4%, Inner Light 3% |
| `sundial` Sundial | 5 | ultimate: she plants the wagasa like a sundial's gnomon and the hours go round: twelve columns of sunlight fall round her in a clockwise sweep | 12 columns over 2.4 s at 3–5 m from her · lin(160, 17)% fire in 1.5 m each · gilds to full · cost 32 + (l−1) · cd 10 · syn Golden Ray 4%, Sunlit 3% |

**Corona** (`flare`, white-gold with a dawn-rose rim) — bursts, a skipping sun disc, a burning sunspot, a little sun
| skill | row | what | numbers |
|---|---|---|---|
| `solarFlare` Solar Flare | 0 | a flare of sunlight bursts on the spot: a white core, a ring of soft rays | lin(120, 5)% fire in 2.1 + 0.03l m · sunburn lin(20, 0.85)% a second for 2 s · ≤ 12 m · cost 4 + 0.12(l−1) **(CP2)** · syn Sun-Kissed 3%, Sunspot 4% |
| `sunKissed` Sun-Kissed | 1 | passive (the mastery) | +18 + 5.5(l−1)% Corona damage **(CP2)** · sunburns last dim(l, 60, 10)% longer |
| `skippingSun` Skipping Sun | 1 | a golden sun disc, skimmed low and side-on like a stone across the sea at dawn: it skips along the ground, flaring at every skip | min(6, 3 + ⌊l/5⌋) skips along a 12 m line, ~2 m apart · lin(55, 6)% fire in 1.3 m at each · cost 6 + 0.3(l−1) · syn Solar Flare 4%, Little Sun 3% |
| `sunspot` Sunspot | 2 | a spot of fierce sunlight lands on the ground and stays: everything in it is sunburnt | 2.4 + 0.03l m for 5 s · lin(26, 3)% fire every 0.5 s · sunburnt · up to 1 + ⌊l/10⌋ · cost 9 + 0.4(l−1) · cd 1.5 · syn Solar Flare 4%, Rising Sun 3% |
| `sunburn` Sunburn | 3 | passive: a little sunburn on everything she hits, and sunburnt foes are easier to flare | every hit of her fire sunburns: 20 + dim(l, 30, 10)% of it over 3 s (the flares' and the sunspot's own burns are stronger) · sunburnt foes take +8 + dim(l, 17, 10)% from the Corona |
| `littleSun` Little Sun | 4 | summon: **Hinata**, a cheerful little sun with a smile and soft rays, floats at her shoulder, pinging sunbolts at foes and warming the pack | 30 + l s · a sunbolt every 0.9 s at the nearest foe within 9 m: lin(48, 5.5)% fire, sunburns · a warm pulse every 3 s: the pack mends 1% life within 4 m · life (40 + 3l)% of hers; foes leave it be unless it hits them · cost 16 + 0.6(l−1) · cd 2 · syn Sun-Kissed 3%, Rising Sun 4% |
| `risingSun` Rising Sun | 5 | ultimate: a great sun rises out of the ground on the spot, swells for a breath, then bursts in a crown of rays | lin(320, 34)% fire in 3.5 + 0.04l m · knockback 1.4 · sunburn lin(40, 4)% a second for 4 s · ≤ 12 m, 1 s to rise · cost 34 + (l−1) · cd 9 · syn Solar Flare 5%, Sunspot 4% |

**Dawn** (`dawn`, dawn rose `#f7b8a8` on pale gold) — the support tree: heals, shields, buffs for her and Shadow
| skill | row | what | numbers |
|---|---|---|---|
| `morningLight` Morning Light | 0 | she lifts the wagasa and the first light of morning washes over the pack | lin(12, 0.8)% life (40% at once, the rest over 2 s) to her, Shadow, Hinata (and co-op allies) within 6 m · overheal: sun shells · cost 8 + 0.4(l−1) · cd max(2, 3 − 0.05l) · syn Sunny Disposition 3%, Halo 3% |
| `sunnyDisposition` Sunny Disposition | 1 | passive (the mastery): it's very hard to stay grumpy around her | +20 + 7(l−1)% healing and shielding · +20 + 7(l−1)% Dawn damage · +5 + dim(l, 25, 10)% zoom regen |
| `kindLight` Kind Light | 1 | a soft ray of sunlight finds whoever needs it most; if nobody does, it finds a foe who deserves it | heals lin(16, 1.1)% (overheal: a shell) · with every ally over 90%: a ray at the target instead, lin(75, 7.5)% × the Dawn mastery, gilding (never more per zoom than Golden Ray: test-rpg) **(CP2)** · cost 4 + 0.2(l−1) · syn Sunny Disposition 3%, Daybreak 4% |
| `halo` Halo | 2 | a ring of golden light settles over an ally; when it gives way, it flares | absorbs (12 + 1.1l)% of their life for 8 s · the flare (broken or spent): lin(100, 10)% **(CP2)** fire in 2.2 m, sunburns (20% of it a second) · one an ally (a recast tops it up) · cost 6 + 0.3(l−1) · cd 1 · syn Sunny Disposition 3%, Sun Dog 3% |
| `stlZoomies` Zoomies! | 3 | passive: a rescue gives her the zoomies | heals on an ally under 35% life land +25 + dim(l, 50, 10)% harder · then: +35% move speed, +15 + dim(l, 20, 10)% dodge for 2.5 s, a trail of light motes (once every max(5, 10 − 0.25l) s) |
| `sunDog` Sun Dog | 4 | **Shadow's own**: he becomes a sun dog (the bright halo spots that sit beside the sun): he glows, bites hotter, and can't be knocked out while it lasts | 12 s · Shadow +25 + dim(l, 35, 10)% damage, his bites sear (+lin(30, 3)% fire) · a blow that would knock him out leaves him at 1 and heals him 30% instead (once) · on a fainted Shadow: wakes him at once at 50% · cost 12 + 0.5(l−1) · cd max(10, 20 − 0.4l) |
| `daybreak` Daybreak | 5 | ultimate: dawn breaks over the pack | 7 m round her · the pack heals 25%, shells fill to their cap, slows, curses and burns cleansed · for 8 s: the pack +20 + dim(l, 20, 10)% damage and +10% speed, foes in it dazzled (25% miss) · cost 30 + (l−1) · cd 30 · syn Morning Light 4%, Kind Light 3% |

**The builds** (§7): a **Radiance** build (Golden Ray on repeat, gilding, Solar Ray for one big foe, Sundial), a
**Corona** build (Solar Flare and the sunspots, Hinata, Rising Sun), and a **Dawn** build (the support: Kind Light, Halo,
Sun Dog, Daybreak, a little fire from the misses and the flares). The fire builds want a few Dawn points for survival
(Morning Light is a starter skill); the Dawn build fights with Kind Light's misses, Halo's flares and Hinata.

### 3a. The charged releases (`src/rpg/chargeStella.js`, releases `src/combat/chargedStella.js`, checkpoint 2)
All 15 actives charge with the shared rules (docs/CHARGE.md §1–3): hold past 0.18 s, Stage Ⅰ, Deeper Charge for Ⅱ / Ⅲ,
Quick Wind-up, +50% zoom per stage, a balance tune solved by `node tools/charge-sim.mjs --solve` (her models:
`tools/charge-sim-stella.mjs`; the heals, shields and buffs report a value ratio, as the summons and buffs do). Each
release rides on the real cast through `fromFrame`. Four perk nodes each: Deeper Charge, Quick Wind-up, one common or mid
unique, one capstone. The wind-ups (`STELLA_CHARGE_POSES`): `stlSunUp` (the wagasa raised to the sky, light gathering
on the finial's sun disc, the canopy turning slowly), `stlAim` (the wagasa drawn back, the finial aimed, a bead of light
growing on it), `stlSkim` (crouched side-on, the disc held low for the throw), `stlGnomon` (the wagasa's tip set to the
ground, rays creeping round it).

| skill → release | wind-up | the payoff | perks beyond Deeper Charge / Quick Wind-up |
|---|---|---|---|
| Golden Ray → *Searing Ray* | `stlAim` | a wider, longer ray (10 → 12 / 14 / 16 m), harder, 2 Sunlit stacks a hit from Ⅱ | Split Shot (+1 / +2 rays fanned, 50%); ★ Afterglow (Lv 8: the ray's line stays lit 1.5 s: 30% a second to foes in it) |
| Glint → *Blinding Glint* | `stlAim` | a wider, longer cone, a longer dazzle | Wide Arc; ★ Mirror Flash (Lv 8: dazzled foes take +20% from her for 3 s) |
| Prism → *Grand Prism* | `stlAim` | +2 / +3 / +4 rays, a wider fan | ★ Refraction (Lv 6: a ray that downs its foe splits in two, 50%); ★ Focal Point (Lv 10: rays crossing the same foe add a stack each) |
| Solar Ray → *Burning Glass* (channel) | `stlAim` | the charge is the wind-up: a thicker beam that starts warmer (+2 / 3 / 25%) and ramps a touch faster **(CP2: the linger cut to 0.05 s, the band)** | ★ Magnifier (Lv 4: the ramp goes to ×2.5); ★ Lens Flare (Lv 10: let go and the beam's end bursts: 120% in 2.5 m) |
| Sundial → *Midsummer* | `stlGnomon` | 12 → 13 / 14 / 15 columns **(CP2)**, wider, harder | Efficient Focus; ★ Longest Day (Lv 12, Ⅲ: the sweep goes round twice, the second time at 50% **(CP2)**) |
| Solar Flare → *Great Flare* | `stlSunUp` | a bigger, harder flare, a longer sunburn | ★ Prominence (Lv 6: a loop of sunlight arcs from the flare to the nearest foe within 5 m: 60%); ★ Coronal Wave (Lv 10: the flare rings outward and pushes foes 1.5 m) |
| Skipping Sun → *Ducks and Drakes* | `stlSkim` | +1 / +1 / +2 skips **(CP2)**, bigger flares | Split Shot (+1 / +2 discs, 50%); ★ Sea Skimmer (Lv 8: each skip leaves a small sunspot for 2 s) |
| Sunspot → *Solar Maximum* | `stlSunUp` | bigger, longer, hotter | ★ Wandering Spot (Lv 4: it drifts after your target at 1.2 m/s); ★ Sunspot Cycle (Lv 10: every 2 s it flares: 120% in its radius) |
| Little Sun → *Bright Little Sun* (summon) | `stlSunUp` | a bigger, sturdier Hinata, faster sunbolts, longer | ★ Sunny Spell (Lv 6: her warm pulse every 1.5 s, 1.5%); ★ Twin Suns (Lv 12, Ⅲ: a second little sun, Hikari, her sunbolts at 50% **(CP2)**) |
| Rising Sun → *Great Sunrise* | `stlSunUp` | a bigger sun, a wider crown, a deeper sunburn | Efficient Focus; ★ Red Sky (Lv 12, Ⅲ: the risen sun hangs 4 s, scorching 40% a second, before it bursts) |
| Morning Light → *First Light* | `stlSunUp` | more healing, 6 → 7 / 8 / 9 m; the light lingers 2 / 3 / 4 s as a warm patch that keeps mending | ★ Dawn Chorus (Lv 4: birdsong: the pack +10% move speed for 4 s); ★ Clear Morning (Lv 10, Ⅲ: cleanses every ally in it and fills their shells) |
| Kind Light → *Gentle Rays* | `stlAim` | 2 / 2 / 3 rays **(CP2)** at 82 / 95 / 95% each, each to the next neediest ally (or a foe) | ★ Golden Coat (Lv 6: each ray leaves a 6% sun shell, even on a full ally); ★ Bright Side (Lv 10: a ray that lands on a foe bounces to the neediest ally with half its heal) |
| Halo → *Great Halo* | `stlSunUp` | a much sturdier halo, a wider, harder flare | ★ Halo Ring (Lv 6: from Ⅱ every ally within 6 m gets one at 50%); ★ Solar Halo (Lv 10: foes that strike a charged halo are seared for 40%) |
| Sun Dog → *Parhelion* | `stlSunUp` | longer, a bigger boost, a sturdier catch | ★ Heel! (Lv 5: his bites taunt for 1 s, drawing foes off her); ★ Twin Sun Dogs (Lv 10, Ⅲ: two bright mock suns orbit him and ping his foes, 35%) |
| Daybreak → *New Day* | `stlSunUp` | wider, longer, a bigger boost | Efficient Focus; ★ Hope Springs (Lv 12, Ⅲ: anyone in it who would fall is caught once at 30%) |

## 4. Fire that isn't flames
### 4.1 Her light against Chewy's and Foosy's fire (and the bloom)
Chewy's Blazing Ball is an orange ball of flame with burning ground; Foosy's embers are warm sparks and glowing leaves
round an ember breath, and his thrusts flash a cream sunbeam streak. Stella's must never be mistaken for either:
- **Sunlight, not fire**: white-gold light with soft rays. No flame tongues, no embers, no smoke, no leaves, no orange.
- **Her signs**: the **sun disc** (a ring with twelve short rays) where her light leaves the finial and where it lands; the
  **soft rays** (low fans of light, like sunbeams through a window); **motes** rising slowly, like dust in a sunbeam;
  **dawn rose** on the Corona's rims and in all the Dawn tree.
- **Her numbers** float in sun gold `#ffd36a`, and her sunburn reads as a faint golden shimmer on the foe (a heat-haze
  sparkle), not flames on it.
- **The bloom and the screen**: everything wider than a hand is **normal blended**; **additive** only for the thin cores of
  the beams, the crescent's inner glow and the motes, under a per-frame budget (`CORE_BUDGET`, 10 cores a frame); the
  colours kept mid-light (sun gold, never white) so the bloom picks out only the cores; a size cap where each effect is
  made (`CAP` 6.5 m); no screen-space flashes and no full-screen tint (Glint is a cone of rays, Daybreak lights the ground
  round her, never the screen). Each is checked at the game camera by day and at night, where a bright light reads brightest.
  **(CP2, as built)**: at the first plan's alphas (rays ≤ 0.35, areas ≤ 0.45, pale gold) her light vanished on the game's
  pale floors (the screenshots: a ray was a faint smear, a sweep invisible). So the rays and crescents bake their colours
  into their textures (a white-gold heart, sun gold, a soft **amber edge** for definition) and draw at 0.8 (narrow strips,
  ~0.5 m); the ground rings and flares 0.6–0.7 rim-weighted, clear in the middle; the wide areas stay low (Daybreak's ground
  0.24–0.26, a sunspot 0.45, a Morning Light wash 0.42); the sun shells' rim 0.3–0.6, clear inside. Her whole kit at once
  (the s48 / `stella-fx-shots.mjs all` frame) warms the ground round her without whiting it out.

### 4.2 The effects (`src/gfx/stellaFx.js`, pooled, checkpoint 2)
- **Sunsweep**: crescents of light thrown off the canopy's rim, a ring of rays for the twirl.
- **Golden Ray**: a thin white core with a soft gold falloff and faint rays, a sun disc at the finial and on each foe hit;
  the gilding: a gold glint over the foe, a pip a stack (atlas cells drawn as one particle a frame, as Floofy's hex badges).
- **Glint**: a quick fan of rays from the finial (0.25 s), little stars of glare on the dazzled foes.
- **Prism**: the rays fanned out of a small sun-glass, each a narrower golden ray.
- **Solar Ray**: a held thin beam, thicker and whiter as it ramps, a small sun disc where it lands and a ring of heat shimmer.
- **Sundial**: the planted wagasa's shadow sweeping round like a sundial's, twelve columns of light falling at the hours, each
  a soft column with a sun disc on the ground.
- **Solar Flare**: a white core and a ring of soft rays rolling out, rose at the rim (clear in the middle); its sunburn the
  gold shimmer.
- **Skipping Sun**: a spinning gold disc skimming low, a flare and a ring of light at each skip, like a stone's rings on
  water.
- **Sunspot**: a patch of bright warm light on the ground with a rose rim and slow rays turning in it.
- **Hinata**: a little round sun with a happy face and soft rays (0.5 m), bobbing at her shoulder; her sunbolts small gold
  sparks; her warm pulse a rose ring. She casts no shadow and fades where she'd cover the hero (`coversHero`).
- **Rising Sun**: a great disc rising out of the ground, swelling, then a crown of rays (capped at 6.5 m).
- **Morning Light**: a wash of rose and gold light rising round the pack, motes floating up; a rose ripple on each healed
  ally; the **sun shell**: a thin golden film, the rim only (≤ 0.25 alpha, clear inside), a slow shimmer; a pop is a ring
  of motes.
- **Kind Light**: a soft rose-gold ray to the ally; a small sun disc on their chest.
- **Halo**: a golden ring hovering over the ally with a faint dome of light beneath (rim-only); its flare a ring of rays.
- **Sun Dog**: Shadow glows softly with two little bright spots either side of him (the sun dogs), motes off his bites.
- **Daybreak**: the ground round her brightens from the middle outward like a sunrise (a rose-to-gold gradient decal, ≤ 0.4
  alpha), rays rising, birds' silhouettes far off; never a screen tint.
- **Zoomies!**: a trail of light motes and sunny paw prints.

### 4.3 Sounds (`src/audio/stella.sfx.js`, synthesized; quiet; no fire crackle)
`stl_bell` (shrine suzu bells: her heals), `stl_chime` (glassy: Prism, the gilding), `stl_ray` (a soft choir "aah" with a
shimmer), `stl_beam` (Solar Ray's hum, rising in pitch as it ramps), `stl_glint` (a bright "ting"), `stl_flare` (a low warm
"thoom", no crackle), `stl_skip` (a "plip" like a stone on water, and a chime), `stl_spot` (a warm drone), `stl_rise` (a
swelling drone into a gong-like bloom: Rising Sun), `stl_hour` (Sundial: a tick and a bell for each hour), `stl_hinata`
(a cheerful little "pew" and a chirp), `stl_shell` (a thin glassy shimmer), `stl_halo` (a soft ring), `stl_sundog` (a happy
bark with a shimmer), `stl_daybreak` (a sunrise chord: soft taiko and bells), `stl_parasol` (the canopy opening: a paper
"fwump"), `stl_zoomies` (pitter-patter and a happy yip). The bells are pentatonic so overlapping heals harmonise.

### 4.4 Her moves (`src/actors/stellaPoses.js`, checkpoint 2)
The combo `parasolSweep1`, `parasolSweep2`, `parasolTwirl`; `parasolAim` (Golden Ray, Prism, Kind Light: the finial at the
foe; 0.56 s **(CP2: 0.5 → 0.56, the band)**); `parasolGlint` (Glint); `solarChannel` (Solar Ray: braced, the wagasa held out level in both paws, ears blown back); `skimThrow`
(Skipping Sun: low and side-on, the disc skimmed off the canopy's rim); `parasolRaise` (Morning Light, the flares, the sunspot, Rising Sun,
Halo: the wagasa up to the sky; 0.7 s **(CP2: 0.62 → 0.7)**); `gnomonPlant` (Sundial: the tip set to the ground, she steps back); `sunCall` (Little Sun,
Daybreak: both paws up, the canopy turning); the zoomies run; the scene poses `stlFloat`, `stlGreet` (the dawn greeting:
the wagasa raised in both paws, then a deep bow), `stlPeek`, `stlComposed`, `stlKneel`, `stlWave`. The charge wind-ups
of §3a. **The canopy never covers her face from the game camera**: checked from both 45° yaws in every pose (the
checkpoint 1 shots found the cast grip covering it from the right yaw, §8). **2026-10-17:** the idle fight hold
(`HOLD`, `HOLD_DIR`: the wagasa in her paw between moves) covered her near eye at the game camera from the right yaw;
the paw now sits out at her side and the canopy leans out to her right (`dir [-0.3, 0.82, -0.6]`, `armR [-0.1, 0, -0.42]`).

## 5. Support in a one-hero game, and co-op later
The game plays one hero at a time, with Shadow beside them. She is now **a fire damage dealer with a support tree**, so
the support has to pay in solo play without being the point of her.
- **The pack in solo play** is her, Shadow and Hinata. Morning Light, Daybreak and Hinata's pulses cover all of them; Kind
  Light and Halo go to **whoever needs it most** (§5.1); Sun Dog is Shadow's.
- **Nothing is wasted** on a full pack: overheal becomes a sun shell; Kind Light with nobody hurt is a Golden Ray; Halo
  flares when it ends; Daybreak's buff is damage.
- **What a few Dawn points buy a fire build**: Morning Light every few seconds and a Halo kept on her roughly double how
  long she lasts under pressure (§7), for about a tenth of her clear.
- **Shadow matters more with her**: he wakes in 6 s instead of 10 (the trait); Sun Dog wakes him at once and makes him a
  real damage dealer for its 12 s; Morning Light, Hinata and Daybreak mend and buff him; Halo can go on him.
- **The limits**: every heal costs zoom; shells cap at 20% and fade in 8 s; Sun Dog catches one blow; Daybreak's cooldown
  is long. Potions still matter.
- **Feedback**: a healed ally gets a rose ripple and a small "+N" (one number per ally per heal, a heal over time's ticks
  summed every 0.6 s); a shell floats "Shell +N" in pale gold; Shadow wags and hops when she mends him (a heart, at most
  every 4 s).

**Co-op** (docs/MULTIPLAYER.md):
- **Written against an ally list**: `stellaAllies(pos, r)` (combat/stellaSkills.js) returns her body, Shadow (awake),
  Hinata, and, once co-op exists, every hero body and their summons in range; nothing in her kit reads `G.player` for
  "the ally".
- **Per target, not per party**: heals and shields are a share of each target's own life, the shell cap is per target,
  the area heals reach as many as stand in them. Her support grows with the party through coverage, never by
  double-dipping. Daybreak's buff is the party's.
- **Class synergies** (MULTIPLAYER §5): Glint and Daybreak dazzle what attacks the party; Sunlit and Sunburn soften foes
  for everyone's fire; Halo goes on the tank.
- **No threat system**: monsters keep picking the nearest hero or ally, so healing never draws aggro.
- **The net layer later**: a heal is an `ev` like a hit (`heal`: target, amount), shells are per-hero snapshot state.

### 5.1 Auto-targeting her heals (docs/CONTROLS.md §13)
A new aim kind, **`ally`** (`combat/autoTarget.js` `AIM`, `aimSpec`; test-rpg's table check covers it):
- **Who needs it most**: among allies within the skill's range (her, Shadow, Hinata; co-op heroes), the lowest life
  fraction after shells, × 0.85 if hit in the last 1.5 s, × 0.7 under 35%. Hinata counts only when no hero or Shadow is
  under 95%.
- **Per skill**: Kind Light to the neediest; with every ally over 90% it **falls back to a foe** (the `line` rule: the
  lock's line, or the line through the most foes) and fires as a Golden Ray. Halo to an ally without one, the one under
  attack first (foes within 2.5 m going for them), else to her. Sun Dog is always Shadow (a fainted Shadow too: it wakes him).
- **The other kinds**: Golden Ray, Skipping Sun `line`; Glint, Prism `cone`; Solar Ray `target` (the beam follows the
  lock, as Moonbeam follows the cluster); Solar Flare, Sunspot, Rising Sun `ground` (the best cluster); Sundial, Little
  Sun, Morning Light, Daybreak `self`; the basic `melee`.
- **Manual picks**: the mouse in any mode: a heal cast with an ally under the cursor (Shadow, herself) goes to them.
  Touch: a tap on Shadow (or his HUD card) picks him for her heals for 5 s. The pad: heals are smart in solo; co-op adds
  an ally ring (R3 cycles allies while a heal is held).
- **Feedback**: while an `ally` skill is held or charging, a soft rose-gold ring under the ally it will go to (the lock
  ring's style, normal blended); a ground skill's AoE marker is gold where the others' are cream.
- **The words**: `aimWords` says "the ally who needs it most (you or Shadow)"; the tooltip's line "Targeting Auto: the
  ally who needs it most, or a foe when nobody does".

## 6. Her arrival in Blossom Hollow (replacing Captain Kaizo's stand-in; ROADMAP Z-H3, docs/ZONES.md §3.1)
**Kaizo rows her over; she floats down onto the beach under her wagasa; then the dawn greeting, Shadow's bow, and the
zoomies.** It keeps Kaizo's staging (the beach at the foot of Beach Lane: `kaizoArrive.js`'s shore search, marks and
camera, already in plain view and on the sand), keeps Kaizo in the port's story, and gives the wagasa its moment.
`world/heroQuests.js` `ARRIVALS`: `{ zone: 'tidepool', who: 'stella', scene: 'stella', quest: 'hq_shiokaze', hero: true }`;
the scene `actors/stellaJoin.js` (`StellaJoin`, registered with `Arrivals.register('stella', …)`; Kaizo's rig, boat and
row home reused from `kaizoArrive.js`, which becomes the shared boat-and-captain staging). Event `stella:joinScene`
(phases `land`, `float`, `talk`, `greet`, `zoomies`, `leave`, `done`).

- **When**: the Tide Pool open (level 18, or Momiji Hollow's dungeon cleared by you or a crew), Floofy joined, a calm
  moment in town. Foosy's arrival now waits for her (he came after Kaizo).
- **The beats**:
  - *land*: Kaizo's rowboat pulled up on the sand, Kaizo beside it looking out to sea; **Stella sits in the bow under her
    open wagasa, very upright, eyes closed, facing the sun.** Shadow's tip once it can show: "*Sniff sniff…* Salt, tar
    and old rope… and something warm, like a sunny windowsill. A boat just landed on the beach!" On the maps: a person
    ("???", "Just landed on the beach", a `!`); the pointer: "A boat on the beach".
  - *float* (within 6 m): she opens her eyes, steps onto the bow and off it, and the wagasa catches the air: she drifts
    down onto the sand (`stlFloat`, a few light motes, a soft paper "fwump"). Kaizo: "Careful now— …she always does that."
  - *talk* (controls lock; your marks on the sand as Kaizo's scene stages them; Shadow on his mark): "Good morning. You
    must be {hero}." … "It isn't morning? The sun doesn't mind. It's very forgiving." ("Who are you?" → "Stella. I keep
    the sunrise shrine at Shiokaze Port. Every dawn I greet the sun over the sea." / "Nice parasol!" → "It's a wagasa.
    It keeps the sun off, which is silly, because I'm on the sun's side.")
  - *greet* (the gag): "Excuse me. I haven't greeted the sun yet today." She turns to the sun, raises the wagasa in both
    paws and bows, very deep and very solemn (`stlGreet`); beside her, **Shadow copies her: a perfect dog's play-bow,
    tail wagging.** She peeks sideways mid-bow (`stlPeek`) and sees it. A play-bow is an invitation. Her composure
    breaks: **the zoomies**: two big bounding loops round you and Shadow across the sand, the wagasa held high, ears
    flying, a trail of light motes, Shadow chasing her joyfully; she skids to a stop on her mark, smooths her robe, ears
    askew (`stlComposed`): "…Ahem. The sun is greeted." Kaizo: "She does that." (a sweat drop on her, Shadow's heart).
  - *the warmth* (her support, shown once): Shadow is panting; she touches his nose with the wagasa's tip and a little
    morning light washes over him (the Morning Light effect, small): "There. Thank you for bowing with me. Your form was
    better than mine."
  - *the plea* (`prepareJoin` first): "I'm the oracle of Shiokaze's little sunrise shrine. It's a very important job. The
    sun has never once been late." / "But the port is under siege. Crabs on the shrine steps, kappa on the roofs, and a
    crab the size of a boathouse in the square. Captain Brineclaw. With so many yokai about, the sun comes up grey." /
    "An oracle should be patient. I've been patient for weeks. …May I join your pack? And will you come and give
    Shiokaze its sunrise back?" ("Welcome to the pack! ♡" → "Thank you. I'll keep you warm. And a little bit on fire, if
    anyone's rude." / "Only if you teach me that bow." → "Shadow will teach you. He's better at it than me.")
  - *leave*: Kaizo: "I'll row on ahead and put the kettle on, matey. You'll find me at my lookout." He rows home as before
    (`goHome`), Stella waving him off with the wagasa; she opens it, a soft burst of light, and she's gone to the cottage:
    `joinStella()` (the banner, `flags.stellaJoined`, her villager at the cottage); `Arrivals.finished`: the record and
    **her quest**, "Trouble at Shiokaze Port", with her card (it waits until the boat has gone, as Kaizo's did).
- **The village saved before she came** (a crew, an old save): the plea is a thank-you: "…but my gulls tell me your crew
  already chased the crabs back to sea. The sun came up gold this morning, and I wondered why." (or "…It was you,
  wasn't it? You've got sunshine on your nose."), "So I came to say thank you. And to join, if you'll have me."; she
  joins, no quest starts.
- **Resets**: leaving town, a hero switch or a knock-out before she speaks drops it (the boat, Kaizo, her, the marks); the
  arrival is due again 10 s later. Once Kaizo is rowing home, it just ends.
- **The rumour** (Shadow, once, in town after Floofy joined and before the Tide Pool opens): "Captain Kaizo's gulls say
  Shiokaze Port has an oracle who bows to the sun every morning, and the sun bows back. Once the Wayfarer's Post opens
  the Tidepools, I bet she'll come to us!" The wheel's card: "Will arrive when the Tide Pool opens", "Will arrive after
  Floofy joins", "On the way to Blossom Hollow…".
- **The guide** "Meet Stella" (`world/guides.js meetStella`, narrated by her, sun gold): *hold* Tab, the wheel with six,
  pick her; *combo* (left-click: the sweeps and the twirl; right-click Golden Ray); *light* (1: Morning Light, "you and
  Shadow both"); *shell* (overheal becomes a sun shell: she shows it on herself); *wrap* (her trees, K: "Kind Light finds
  whoever needs it. If nobody does, it finds someone who deserves it.").

### 6.1 Her quest ("Trouble at Shiokaze Port", `hq_shiokaze`: the giver becomes Stella)
| | the line |
|---|---|
| hook (the card) | "Shiokaze Port is under siege, and the sun comes up grey. I'd like my sunrise back. Will you come?" |
| desc | "Stella, the oracle of Shiokaze Port's sunrise shrine, came to Blossom Hollow in Captain Kaizo's rowboat: crabs and kappa have the harbour under siege, and the shrine's steps with it. Take the Wayfarer's Post to the Tidepools and break the siege." |
| hand-in | "Tell Stella the port is safe" |
| thanks | "The port is safe, and tomorrow the sun will come up gold over the shrine. I'll greet it twice, once for you. Take this lantern. It hung on Captain Kaizo's ship; he says you've earned it." |
| selfThanks (you play her) | "We did it, Shadow. Tomorrow's sunrise will be a good one. …Bow with me? Good boy. Perfect form." |
| crew | "{crew} sailed in and chased the siege back to sea. The shrine steps are clear. I bowed to them. They seemed embarrassed." |
| crewSelf | "{others} and I chased the siege back to sea. I kept everyone warm. Thank you for sending us." |
| Shadow: arrive / home | "I can smell the sea! Shiokaze Port is just down the shore. Let's give Stella her sunrise back!" / "The port is safe! Let's tell Stella. Maybe she'll bow again. I'll bow too!" |

The reward stays (1,800 coins, 7,000 XP, a skill point, the Festival Chochin). Kaizo at his lookout afterwards: "Stella
told me everything. Twice. The second time with zoomies."

### 6.2 Old saves (where Kaizo has been)
Kaizo's visit is recorded (`flags.arrivals.tidepool = { how: 'scene', … }`), but Stella isn't joined, so **her arrival
is still due** and plays (Kaizo rows her over). What changes is the wording and the quest:
- **Kaizo's quest running** (`hq_shiokaze` active with no `by` on its record: before H-6 only he gave it): it **stays his**:
  her arrival writes `q.giver = 'sk_kaizo'` on it, so the hand-in, the tracker's "Tell Captain Kaizo the port is safe",
  his thanks and crew lines are kept (`HERO_QUESTS.hq_shiokaze.kaizo`, the old lines; `Story` reads `q.giver || d.giver`).
  Her plea: "Captain Kaizo told me he'd already found you, and that you'd said yes. So I came too. The sun shouldn't have
  to wait." No second quest, no second card.
- **Kaizo's quest done**: a thank-you: "You gave Shiokaze its sunrise back before I'd even met you. Captain Kaizo told me.
  Twice. …So I came to say thank you. And to join, if you'll have me."
- **Saved by a crew before anyone came**: the thank-you of §6.
- **Foosy already joined** (his old Onsen scene): Stella still arrives; nothing about him changes.
- **Foosy due but not yet come**: he now waits for her (`prevOf`), so she comes first and he follows on the next calm
  moment, as the zones' order says.
- **A save from before Z-H3** (no arrivals at all): she comes as on a new save once the Tide Pool is open.
- The record she writes keeps Kaizo's: `arrivals.tidepool = { how: 'scene', quest, day, by: 'stella', kaizo: {…} }`.
- `?hero=stella` (debug) and `G.heroes.joinStella()` (QA) join her at once; her quest then starts quietly with its card
  while Shiokaze needs saving (`questsOwed`).

### 6.3 As built (checkpoint 2, 2026-10-15)
- **Code**: `actors/stellaJoin.js` (`StellaJoin`, `heroes.stlJoin`); `actors/kaizoArrive.js` is now the shared
  boat-and-captain staging (`KaizoBoat`: his rig, the boat, the shore search, `land`, `watch`, `goHome`); `world/heroQuests.js`
  (`ARRIVALS`, `hq_shiokaze` hers with `.kaizo` his old lines, `heroQuestGiver` / `heroQuestDef`); `world/story.js`
  (`def` reads `q.giver || d.giver`; the hand-in step cached per giver); `actors/arrivals.js` (records carry `by`;
  `finished(who, extra)`); `heroes.js` (`joinStella`, her chat); `regions/village/talk.js` (Kaizo's line afterwards);
  `world/guides.js` (`meetStella`); `debug/debugActions.js`. QA: s47 m) o) p) q) r), test-rpg "HERO ARRIVALS",
  `arrival-shots.mjs stella [kaizo]`.
- **Calls made while building** (the owner may want to look):
  - *Where she lands*: the shore search's spot beside the boat (Kaizo's old talk spot) is her mark; Kaizo steps back to
    his boat's far side as she floats down (`kaizoMark`), so the three of you aren't crowded on the narrow beach.
  - *The bow*: she turns across the screen, her left toward the camera, so the deep bow reads in profile and her peek
    shows her face; Shadow takes his mark at her left, a step toward the camera.
  - *Two scene-only poses* in `stellaJoin.js` (none were added to `stellaPoses.js`): `stlSeat` (her `stlKneel` with the
    eyes shut, upright in the bow) and Shadow's `shdPlayBow` (the front down, the head low, the tail up and going; his
    front legs laid forward on the sand after his own pose).
  - *The canopy and the camera*: `stlZoom` and `stlFloat` hold the wagasa straight up, and running toward the camera the
    canopy covered her face from up here; in the scene the wagasa leans up and back, away from the camera, for the
    float, the zoomies and the wave (`SceneStella.tilted`).
  - *The warmth*: Shadow comes to her side across the screen (between you two) so she touches his nose in profile.
  - "…It isn't morning?" is only said from noon to 5 am. With Kaizo's quest running her plea ends "…May I join your
    pack?"; saved by you (not a crew): "…It was you, wasn't it? You've got sunshine on your nose."
  - The rumour adds the unlock rule in brackets, as Poe's, Floofy's and Foosy's do.
  - The guide's *shell* step: playing her, she fills her own shell (`G.skills.stlFillShell`) to show it.
  - A reset once Kaizo is rowing home completes the arrival (she joins, the record and quest), as "it just ends" asks.
  - Her record on Kaizo's old save: `{ how: 'scene', quest: 'had', day, by: 'stella', kaizo: {…} }`.

## 7. Balance (`node tools/hero-balance.mjs`; asserted in `tools/test-rpg.mjs`, checkpoint 2)
The same rules as docs/POE.md §4 (the best normal base the level allows, a skill build, stat points 50% damage stat / 30%
Vit / 20% Energy, a 60 s fight, 70% packs of five / 30% single). Her damage stat is Energy, so 70% of her points go to
Energy (as Moka's). Her fights are rotations (as the hex build's, docs/SHIHTZU.md §4) when they carry a heal budget.
**Survival** is also measured over time: **the time to fall under a standard pressure** (incoming damage of 5% of the
five-hero mean life a second, after defence: the mean hero falls in about 20 s), her heals and shells counted.

**As built (CP2, `node tools/hero-balance.mjs`, asserted in test-rpg's STELLA section)**: her builds are rotations
(`stlRotation`: each second's zoom and cast time by priority, the Sunsweep in the time left). Skill points are scarce (one
a level), so each build is its skill at 20, then its mastery. Golden Ray's 10 m pierce reaches ~4 of a pack of 5, and the
first numbers ran away once she was cast-time bound (level 30+: ×1.35, ×1.60 at 45), so CP2 slowed her two main casts a
touch (`parasolAim` 0.56 s, `parasolRaise` 0.7 s), gave her masteries a gentler curve (+18 + 5.5(l − 1)%) and re-based
Golden Ray, Solar Flare and Solar Ray (§3; a grid search over base, growth, cost slope, cast and mastery: `tools/qa/tmp/stl/grid.mjs`).

| level | Radiance clear (single) | Corona clear | with a Morning Light every 8 s: clear / falls | the Dawn: clear / falls | Solar Ray build, single |
|---|---|---|---|---|---|
| 6 | ×1.00 (×0.53) | ×0.91 | ×0.81 / ×1.39 | ×0.51 / ×2.90 | — |
| 15 | ×0.96 (×0.53) | ×0.90 | ×0.83 / ×1.42 | ×0.56 / ×2.91 | — |
| 30 | ×0.97 (×0.56) | ×0.94 | ×0.89 / ×1.39 | ×0.47 / ×2.91 | ×1.00 |
| 45 | ×1.02 (×0.61) | ×0.97 | ×0.94 / ×1.40 | ×0.48 / ×2.91 | ×1.06 |

(clear and single × the five-hero mean's dps; falls × the mean's time to fall under the standard pressure, 20.7–20.9 s; the
Dawn's ×2.9 is the 60 s fight's cap: she outlasts it. Her life ×1.00–1.02 of the mean.)
- **The Dawn's damage (CP2, a design call)**: the first estimate (×0.7–0.85) assumed Hinata in the support build, but its
  points can't reach the Corona's row 4 as well as its own tree. Its parts were raised as far as the rule allows (Kind
  Light's fallback ray never beats Golden Ray per zoom; Halo's flare lin(100, 10)%): it clears at ×0.47–0.56 and outlasts
  the fight. The asserted band is ×0.42–0.7 with falls ≥ ×2.5; the support's job is the pack's survival.

**The bands (as planned at checkpoint 1; see As built above for the asserted ones)**:
| build | on repeat | clear (blend dps) vs the five-hero mean | survival |
|---|---|---|---|
| `stella` (Radiance, the main band) | Golden Ray, Inner Light, Prism; Solar Ray for a lone foe | **×0.95–1.05** | about the mean's (no heals beyond the starter) |
| `stella·flare` (Corona) | Solar Flare, Sun-Kissed, Sunspot, Hinata | **×0.9–1.05** | about the mean's |
| `stella·dawn` (the support) | Kind Light (half its presses fall back to a foe), Halo kept on her, Hinata, Morning Light | ×0.7–0.85 | outlasts the 60 s fight |
| a fire build with a heal budget | a Morning Light every 8 s | ×0.8–0.95 | falls ≥ ×1.3 later than the mean; ×2 or more with a Halo kept on her |

**A first estimate** (`tools/qa/tmp/stella-sun-balance.mjs`, a scratch model: Moka's derived stats re-based to hers, a
wagasa at 0.92 of a staff; the real numbers come from the class at checkpoint 2): Golden Ray at lin(74, 8)% in a 10 m line,
cost 3.2 + 0.16(l − 1); Solar Flare at lin(88, 7.5)% in 2.1 m with a sunburn of lin(15, 1.3)% a second for 2 s, cost 4 +
0.22(l − 1).

| level | Radiance clear ×mean (single) | Corona clear (single) | with a Morning Light every 8 s | falls: the mean / a fire build / with the heal budget |
|---|---|---|---|---|
| 6 | ×0.97 (×0.61) | ×0.85 (×0.69) | ×0.81 | 20.9 / 20.6 / 29.8 s |
| 15 | ×0.97 (×0.59) | ×0.90 (×0.62) | ×0.85 | 20.8 / 20.3 / 29.2 s |
| 30 | ×1.02 (×0.60) | ×1.01 (×0.61) | ×0.94 | 20.7 / 20.2 / 28.9 s |
| 45 | ×0.98 (×0.57) | ×1.09 (×0.65) | ×0.92 | 20.7 / 20.1 / 28.8 s |

- **The fire builds clear at the mean's pace**: a pierce on a 10 m line is a pack skill; against a lone foe Golden Ray is
  weak (×0.6), which is what **Solar Ray** (the channel that ramps to ×2) and the Sunlit flare are for: checkpoint 2 adds
  a single-target band for a Solar Ray build (≥ ×0.9 single).
- **The Corona** grows with its area and its sunburn at the high levels (×1.09 at 45): checkpoint 2's solve holds it under
  ×1.05.
- **Horde fights**: a 150-monster floor at the mean's pace, the rays piercing whole lines, the flares and Rising Sun on the
  clusters; Glint and Daybreak's dazzle cut what reaches her.
- **The charge band** (docs/CHARGE.md §3): her damage tables solved to ×1.2–1.3 sustained at Stage Ⅲ like the others';
  the heals, shields and buffs report their value per zoom (×1.0–1.4, not banded).
- **Guard rails the sim checks**: a charged heal never heals less than a tap; Kind Light's fallback ray never beats Golden
  Ray per zoom; the Sunlit flare can't fire on the same foe more than once every 2 s; the shell cap holds at 20%.

## 8. The baked model (`HERO_MODELS.stellaToy`, the wagasa, the colour)
Built and rigged by an Opus agent with the toybox-character skill (`tools/blender/work/codex/stella-toy/`; the archive in
`tools/blender/codex/assets/stella-toy/`). Installed at checkpoint 1: `public/rigs/stella_toy.{json,bin,png}` +
`stella_toy_n.png` (the 37-bone hero contract, 17,652 vertices, 33,610 triangles, 1.24 m; no export warnings) and the
jellyfish `public/models/stella-parasol.glb`.

### 8.1 What changes with the Sun Oracle (the builder's work, routed by the director)
- **The robe**: recoloured to the owner's pick, Option B **"Midday"** (`stella-sun-concept/concepts/option-B.png`): a
  saffron `#F0C24E` robe with sun motifs, a warm-white `#FFF9EC` petticoat, a sunset-red `#D9573E` obi and bow, amber
  `#DFA23C` beads. Same shapes, same rig.
- **The parasol becomes a sun wagasa** (Midday: a red-and-gold sunburst canopy, amber tassels): a gold sun-disc finial,
  chunky tassels instead of tentacles;
  about the same size, the same grip and origin. For the drop-in (§8.3), please:
  - keep the grip at the origin and the shaft along +Y, and update `prop_mount.rig.json` (the grips, the carry);
  - put an **empty named `finial`** at the sun disc's centre: her light leaves the wagasa there;
  - give the sun disc a material named `*_glow`, and keep its colour under pure white (a value of about 0.9) so the bloom
    keeps to a glint;
  - make each **tassel its own mesh** (named `tassel_*`), its origin where it hangs from, so the game can sway them;
  - keep the canopy's colours in the palette's mid-light range: a pure white or pale yellow sunburst blooms under the
    Burrow's warm light.
- **Installed (2026-10-15, CP2)**: the Midday export (`python tools/blender/codex/install_rig.py
  tools/blender/work/codex/stella-toy/export stella_toy`: 17,653 vertices, 33,610 triangles; the robe saffron, the nose
  `#8F7474`, the mid-blink clean) and the sun wagasa `public/models/stella-parasol.glb` (5,730 triangles, a 0.80 m canopy and
  a 0.81 m shaft; `sun_disc_glow` in `Stella_wagasa_sun_glow` #E8B44A; a `finial` empty at y 0.63; `tassel_0..7` at their
  hang points). **The new mounts** (`prop_mount.rig.json`, the old carry and cast cut through her head): `GRIP.cast`
  `[0.831517, -0.078793, 0.117034, 0.537283]`, `GRIP.shoulder` `[0.264693, -0.141442, 0.392361, 0.869474]`, the chest carry
  `parasolMount` quat `[-0.421275, 0.170075, 0.333494, 0.826065]` (pos and the palm offset unchanged). The carry now leans
  back and out past her right shoulder: an open sun parasol held out at her side (it clears her head by 184 mm and her right
  ear by 88 mm at rest), and it reads naturally walking and running at the game camera.
- **The mid-blink lids, rebuilt (2026-10-17)**: in the game the half-closed lids still showed a pale flap at the outer
  corner, a torn lash edge and the iris at the inner corner (the earlier fix was checked from 45° down only; the look
  camera sits at about 20°). The cause was the lid mesh, not `lidTilt`: a rigid shell has to stay in a band about 6 mm wide
  (in front of her inset eye lens, under the skin above it) all through the sweep, and its rows were solved only shut and
  in the squint; the hinge also sat 2 cm low. The rig script (`MID_FIX`, on by default) raises the hinge 2 cm (the same
  0.12 m behind the eye, so the squint and `lidTilt` are unchanged), holds every lid vertex to that band at 14 angles of
  the blink, and paints the closed lash down to the lid's real edge. 17,656 vertices, 33,610 triangles. The happy squint
  now covers 30% of the eye (was 27%). Left: a hairline of white at the outer end from the right yaw at 0.6–0.85, mostly
  under the painted lashes. The previous install: `tools/blender/work/codex/stella-toy/installed-cp2-backup/`.

### 8.2 The entry (`src/actors/heroModels.js`, checkpoint 1)
`stellaToy: { file: 'stella_toy', name: 'Stella', outline: '#2c2f3a', earGain: 0.8, lidTilt: 0.5585, wave: 'front',
anim: { sitThigh: -1.0 }, palm: [-0.03976, -0.03183, 0.0025], back: [0, 0.05, -0.17], darkGrade: [0, 0, 0, 0, 0.04],
darkFur: 1, whiteCap: 1, parasolMount: { … } }` and `stella: 'stellaToy'` in the Toybox table (`TOY`). Nothing in the
game loads her yet: `game.js`'s `loadHeroModels([…])` list gets `'stella'` with her class at checkpoint 2.
- `lidTilt: 0.5585` (her eyes face 32° outward: the lids hinge about each eye's own axis); the default squint;
  `earGain 0.8`; `wave: 'front'`; `sitThigh −1.0` (the hems don't flare in the sit).
- `palm` from `prop_mount.rig.json`; `back` between her shoulder blades above the bow; `parasolMount` the over-the-
  shoulder carry (`carry_over_shoulder.or_on_chest`, model space, game axes).
- `darkFur` (a small shared change: it now works without `darkNeutral`; every existing entry has both): the grade's lift
  turned her shaded fur plum and her nose wine; the counter keeps the shade a neutral grey.
- `whiteCap: 1` (as Floofy's): under the Burrow's warm key light her pale robe parts and the lit fur blew out; it holds
  them under their own colour.

### 8.3 The wagasa (`src/actors/stellaGear.js`)
Ready for the new GLB: every mesh of the file becomes a part of the prop with its own material (a textured toon with the
white cap; a lit toon with a soft emission for a glow or finial part, normal blended); the extents are measured from the
file (`PARASOL.top`, `across`, `hook`), the `finial` empty becomes `finialPoint()` (the origin of her rays and flares),
`tassel_*` meshes keep their pivots (`R.tassels`, for a sway at checkpoint 2); a procedural sunburst wagasa stands in
until it loads. The mounts (`carry`, `hand`, `shoulder`, `cast`), the grips (`GRIP`, from the mount file) and
`parasolStance` are as before. **The jellyfish's glow share is gone** (it lifted the jelly bell's shaded side); the
colour is re-measured when the new atlas lands.

### 8.4 Colour, checked at checkpoint 1 (`node tools/qa/stella-shots.mjs coat`; re-run with the new atlas)
| light | fur (sheet `#A9A6A2`) | nose | the inner ears, lit |
|---|---|---|---|
| village 11:00, no grade | `#90898a` / `#a29194` / `#a49fa4` | `#59094a` (wine-magenta) | — |
| village 11:00, as set | `#989395` / `#a09d9d` / `#aba8a7` | `#5b3f42` (brown) | `#a79a9e` / `#beb1b2` |
| the Burrow, floor 1, as set | `#a08f8b` / `#c6aca1` / `#e2bea8` | `#82463f` | `#cab5b3` |

**Re-measured with the Midday atlas (CP2, `stella-shots.mjs coat`)**: at 11:00 in the village the fur reads
`#96918b` / `#9d9a9a` / `#a7a3a3` (a neutral grey: no tint, no `darkGrade` change), the saffron robe (albedo `#eebf51`)
`#a98400` / `#dfa600` (a deep saffron gold), the obi `#d33b00` (sunset red), the inner ears `#b0a1a7`–`#c3b2b5`; at 22:30 the
fur `#4c4965` / `#81737c` (the night's blue); on the Burrow's floor 1 `#b99374` / `#cdac97` (warmed toward cream like every
hero).

(The 35th / 60th / 85th percentile of the lit texels picked by their albedo.) The coat needed no tint; the Burrow warms
her toward cream like every hero (ROADMAP H-3). The portraits render ungraded and read the sheet. **To re-check with the
new export**: the robe in its sunrise colours (village, Burrow, golden hour, night), the wagasa's canopy and disc against
the bloom, the nose, the portrait.

### 8.5 The checkpoint 1 checks (the model and rig, unchanged by the recolour)
- **The face** (`face-check.mjs --id stella --cy 0.95`; `/?test=chars&only=stella`): rest (nothing showing, from the front
  and both 45° yaws), talk, the happy squint, the bark at its peak, the blink held closed (clean); mid-blink the outer lid
  corner poked out (fixed in the waiting export).
- **In the game** (`tools/qa/stella-shots.mjs`): standing at the game camera (22 m) and close, both 45° yaws and behind;
  walking and sprinting toward both diagonals; the wagasa in her paw over the shoulder; raised over her head; the sit.
  Desktop 1920×1080 and a phone 844×390; the village at 11:00, 19:00 and 22:30 and the Burrow. She reads at the game camera.
- **Fixed at checkpoint 2**: the old cast grip covered her face from the right 45° yaw, and the jellyfish's tentacles hung
  across it on the shoulder mount. The new mounts fix both: s48 (f) checks every cast pose of hers (the sweeps, the twirl,
  the aims, the glint, the skim, the raise, the gnomon, the call, standing) from both 45° yaws at the game camera, and the
  canopy covers her face in none. The in-paw carry holds her right arm out of the walk swing (`armLockR`).

## 9. Look tools
- `/?test=stella` — her look page: the baked model with the wagasa (`hold=carry|hand|shoulder|cast`), Chewy for scale
  (`solo` drops him, `moka=1` adds Moka); `views=1` the turnaround; `act=<action>`, `at=`; `walk=1` / `run=1`; `sit=1`;
  `talk=1`; `blink=0..1`; `props=1` the wagasa alone; `portrait=1`; `tint=`; `face=`.
- `node tools/qa/stella-look.mjs [views] [scale] [props] [carry] [shoulder] [cast] [walk] [run] [sit] [portrait] [bark]
  [happy] [wave] [talk] [blink] [blink60]` → `tools/qa/tmp/stella-look/`.
- `node tools/qa/stella-shots.mjs [look] [walk] [run] [cast] [carry] [sit] [coat] [--dev desktop|deck|phone|ipad]
  [--hour 11] [--world village|burrow] [--grade '{…}']` → `tools/qa/tmp/stella-shots/` (the real game).
- `node .claude/skills/toybox-character/scripts/face-check.mjs --id stella --cy 0.95`.

## 10. The rest (checkpoint 2)
- **Six heroes**: `HERO_IDS` follows `CLASSES`: she's added **last** (key 6 on the wheel; Foosy keeps 5); the wheel, the
  HUD's bench minis and the touch wheel take six. Her villager lives at the cottage, greets the sun on the beach at dawn,
  sits by the fountain, twirls her wagasa on the benches (`npc.js` ROUTINE); her chat `HERO_CHAT.stella`.
- **Icons** (`src/rpg/iconsStella.js`): the wagasa item art in the item's colours, all 21 skill icons and the combo's;
  `ui/glyphs.js` `parasol`, `ray`, `flare`, `dawn`.
- **The debug menu** (`registerDebug`): Heroes › *Unlock Stella*, *Play her arrival*, *Her arrival with Kaizo's quest
  running* (the old-save case); Combat › *Gild everything* and *Fill the shells* (QA).
- **Perf**: the gilding pips one particle a frame; the rays and flares pooled; Hinata a small mesh; the shells and halos
  share one geometry each; her shaders compiled at each combat world's entry (`StellaFX.prewarm`). The horde gate with her
  full kit (`ROT.stella` in `profile-horde.mjs`), against Foosy's.
- **QA** `tools/qa/s48-stella.mjs` (in run-all): her arrival beat by beat (the greeting, the bow, the zoomies) and the old
  saves (Kaizo's quest running and done, a reload); playing her in the village, a zone, a dungeon and a horde fight;
  every active tapped and every charge perk landing; heals and shields on her and on Shadow (Sun Dog waking him); the
  `ally` auto-targeting and its fallback; the gilding and the sunburn; the wagasa's carry and cast; the pad and touch;
  saving and reloading. Waits key on the game's state. prod-smoke gets a `stella` case.

## 11. Code map
Checkpoint 1:
- `src/actors/heroModels.js` — `HERO_MODELS.stellaToy`, `TOY.stella`, `parts.parasolMount`, `darkFur` alone.
- `src/actors/stellaGear.js` — the wagasa (any parts from the file, the finial, the tassels' pivots), the mounts, the grips.
- `src/tests/stella.js` — her look page; `src/tests/chars.js` — `&only=<hero>` builds any baked hero (the face check).
- `tools/qa/stella-look.mjs`, `tools/qa/stella-shots.mjs` — the look and in-game review shots.

Checkpoint 2 (as built, 2026-10-15):
- **Data**: `rpg/classes.js` (`CLASSES.stella`, `parasol` in `WEAPON_CLASS`), `rpg/items.js` (the 12 wagasa bases,
  `starterParasol`), `rpg/grid.js` (2 × 2), `rpg/skillsStella.js` (the 21 skills, `stellaPassives`), `rpg/skills.js`,
  `rpg/stats.js`, `rpg/chargeStella.js` (the 15 tables), `rpg/charge.js`, `rpg/iconsStella.js`, `rpg/icons.js`,
  `rpg/actions.js`.
- **Combat**: `combat/stellaSkills.js` (`stlHit`, the marks, the Sunsweep, Radiance, `stellaGuard`), `combat/stellaArts.js`
  (the Corona, the Dawn, `stlHeal` and the sun shells, halos, Sun Dog, Daybreak, the Zoomies, `stlAllyFor` and the ally
  ring), `combat/stellaAllies.js` (`stellaAllies`, `neediest`, `LittleSun`), `combat/chargedStella.js`,
  `combat/skillRunner.js` (the parasol attack, `updateStella` / `clearStella`), `combat/combat.js` (`look: 'sun'`: gold
  numbers and sparks, the gold sunburn ticks, `stellaGuard`, Daybreak's and Dawn Chorus' buffs), `combat/autoTarget.js`
  (the `ally` kind and its words, the gold AoE marker), `actors/companion.js` (Shadow's soak, Sun Dog's bite and catch,
  Heel!; the 6 s wake reads `derived.shadowRevive`), `game.js` (a touch tap on Shadow picks him for her heals).
  `combat/padAim.js` is untouched: in solo her heals are smart; the pad's ally ring waits for co-op.
- **Looks and sound**: `gfx/stellaFx.js` (the effects pass, §4.1–4.2), `actors/stellaPoses.js`, `actors/stellaGear.js`,
  `audio/stella.sfx.js`.
- **Her arrival, quest, roster and guide** (the arrival agent and the roster agent): `actors/stellaJoin.js`,
  `actors/kaizoArrive.js` (the shared boat staging), `actors/arrivals.js`, `actors/heroes.js`, `actors/goldenJoin.js`
  (Foosy's rumour now waits for her), `world/heroQuests.js`, `world/story.js` (`q.giver`), `world/guides.js`
  (`meetStella`), `regions/village/talk.js`, `debug/debugActions.js`; `ui/heroWheel.js`, `ui/hud.js`, `ui/rpg.js`,
  `ui/glyphs.js`, `ui/tutorial.js`, `ui/prewarm.js`, `gfx/portraits.js`, `actors/npc.js`, `world/mapData.js`,
  `cozy/expeditions.js`.
- **Tools**: `tools/hero-balance.mjs` (`stlRotation`, `stlBand`, `STL_CAST`), `tools/charge-sim-stella.mjs`,
  `tools/charge-sim.mjs`, `tools/charge-table.mjs`, `tools/test-rpg.mjs` (her section), `tools/qa/s48-stella.mjs` (in
  run-all), `tools/qa/stella-fx-shots.mjs` (her effects in a real fight at the game camera), `tools/qa/prod-smoke.mjs` (the
  `stella` case), `tools/qa/profile-horde.mjs` (her rotation), `tools/qa/s47-hero-arrivals.mjs`, `tools/qa/arrival-shots.mjs`.

## 12. Questions for the owner
- The tree names: **Radiance / Corona / Dawn**.
- The two marks: **Sunlit** (the rays gild, a full gilding flares) and **Sunburn** (the Corona's burn).
- **Hinata**, the little sun, as the Corona's summon (and **Sun Dog** as Shadow's buff, after the real halo spots).
- The arrival: **Kaizo's rowboat, the float down, the dawn greeting with Shadow's play-bow, then the zoomies** (§6).
- The basic attack: **short-range sweeps that throw crescents of sunlight, and a twirl**, rather than a bolt.
- The wagasa as a **2 × 2** item, and its base names.

**Calls made at checkpoint 2** (STELLA.md didn't answer them; each fits the doc):
- **The bloom rule's numbers** (§4.1): the first alphas made her light invisible on pale floors; rays and crescents now
  draw at 0.8 with an amber edge baked in, the wide areas stay low, additive only for the budgeted cores.
- **The balance** (§7): slightly slower casts (0.56 s / 0.7 s), gentler masteries (+18 + 5.5 per level), re-based Golden
  Ray, Solar Flare and Solar Ray; the Dawn build's band at ×0.42–0.7 (it outlasts the fight) instead of the estimate's ×0.7–0.85.
- **Charged payoffs pared** where the retune can't reach (skips, extra hours, Longest Day's second round at 50%, Hikari at
  50%, Kind Light's rays) (§3a, CHARGE.md §8).
- **First Light's lingering patch** mends 5% of the heal a second (charged Morning Light).
- **Halo's flare sunburns** at 20% of the flare a second for its burn time.
- **Hinata's sunbolts sunburn** at 40% of the bolt a second; she floats, so foes aren't pushed off her (`noBody`), and they
  leave her be unless she has hit them in the last 3 s (`tauntFor`).
- **A heal aimed at a foe** (a click on it, the Auto lock) never takes the ally standing next to it by hand: the neediest
  rule decides; Kind Light's hand pick is an ally under its 90% mark.
- **Her wheel colour** is saffron `#e6b422` (apart from Foosy's ember orange).
- **A touch tap on Shadow** in a fight picks him for her heals for 5 s ("Heals: Shadow" floats); the pad's ally ring waits
  for co-op.
