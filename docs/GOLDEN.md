# Foosy: the Emberleaf Dragoon (the fifth hero)

Status: **built, checkpoint 3** (ROADMAP H-5). This design; the class and its twelve lance bases (each tinted on the prop);
**all 21 skills built** (`src/rpg/skillsGolden.js`) with their moves, effects, sounds and icons, the Whelp Bond driving
Shadow; **all 15 charge tables**, perks and releases, solved by the sim (§3b, CHARGE.md §7); the balance pass with three
builds asserted (§4); the baked model `golden_toy` with the Blender lance and javelin props, the coat graded to the sheet,
the kit fallback's crest helm; **Shadow as a flying dragon whelp** while Foosy is played (the outfit swap with a poof, the
flight, the landing, indoors); five-hero switching. Play him at once from `/?hero=golden` (he counts as joined).
His name is **Foosy** (the owner's pick), in one place: `CLASSES.golden.name` (`src/rpg/classes.js`; `HERO_TEXT.golden`
holds the kana, フージー). Everything else reads it. The id stays `golden`.
Checkpoint 3 added the Onsen joining scene (§5), the rumour, the "Meet Foosy" guide with Shadow's take-off, `s29-golden`,
and the floor loot drawn instanced (his draw calls at Poe's level, §11).

## 1. Who he is
- A male Golden Retriever (he/him): a deep red-gold coat with lighter feathering, long feathered floppy ears, a cream
  chest ruff, a big plumed tail, warm brown eyes, a big happy open smile. Sheet **C "Emberleaf Dragon Guard"**
  (`tools/blender/codex/assets/golden-toy/sheet-C.png`): emerald scale armour with brass trim, a round brass belt medallion,
  a layered emerald tabard with a leaf-dragon emblem, an open-face emerald crest helm carrying a chunky little dragon head,
  and a quiver of toy javelins up the middle of his spine.
- His weapon: a **toy lance**, 1.6 m: a braided-rope shaft in cream and tan bands, a tennis-ball pommel, a brass collar, a
  plush felt dragon-wing guard and an emerald rubber dragon-flame head. And **blunt toy javelins** from the quiver: a rope
  shaft, a gold rubber ball for a tip, emerald felt fletching. They bonk; they never stab.
- **Tone: cozy and heroic.** A golden retriever's earnest, sunny loyalty in a knightly dragon-guard role. He takes his vows
  very seriously and is very easily distracted by a ball. Ember and leaf magic: warm sparks, glowing leaves, sunbeams,
  never fire that frightens. Effects follow the readability rule (docs/POE.md §3d): none washes the screen; each is capped
  where it's made.
- **Shadow is his dragon.** While Foosy is played, Shadow wears an emerald dragon whelp costume (a hood with brass horns,
  felt wings, a spiky tail cover, a cream bib) and flies beside him like a little dragon pet (§6). The Whelp Bond tree
  drives him (§3).

| colour | sheet | in game |
|---|---|---|
| red-gold fur | `#C47A3A` | the baked texture with the warm grade (§8): `#c57c3d` measured in the village at 11:00 |
| light fur (muzzle, ruff, feathering) | `#E0A868` | the texture, in the warm grade's band |
| emerald armour, quiver, the lance's head | `#3A9A6A` | the texture, ungraded; the class accent `#3a9a6a` |
| brass trim, javelin tips | `#C8A050` | the texture (kept out of the warm grade by its hue) |
| cream ruff, rope | `#F4E8D0` | the texture |
| eyes, nose | `#603B27` | the texture |
| tennis ball | `#D6C85C` | the lance's pommel |
| UI colour | | `#d8903a` (the class colour), `#3a9a6a` (the accent) |

## 2. The class (`src/rpg/classes.js` `CLASSES.golden`)
- Title "Emberleaf Dragoon" (フージー, "Dragoon of the Emberleaf Guard"). Base Str 13 · Dex 11 · Vit 13 · Ene 9.
- Life `44 + Vit·4.2 + lvl·6.2` (solid: below the Shih Tzu's, above the other three), zoom `22 + Ene·2.6 + lvl·2.1`.
- **The pet hero**: Shadow fights at his best beside him: the class gives Shadow **+20% life and +20% damage** (`shadow`,
  folded into `derived.shadowLife` / `shadowDmg` by `goldenPassives`); Best Friends and Warm Heart scale him further.
- **Reach is his identity**: the longest melee reach of the five (the reach combo's thrusts hit a line 2.75 m long; Sunbeam
  Thrust's line is 3.8–4.6 m), narrow and deep: the thrusts hit a line, not an arc. Mid mobility: the Jump and the charge
  are his gap-closers.
- Weapon: the **toy lance** (`wtype: 'lance'`, class-bound: `WEAPON_CLASS.lance = 'golden'`). It scales with **Strength**
  (+1% damage per point, `dmgStat.lance`). The **Javelins** swap that for **Dexterity** (`derived.javMul` = (100 + %dmg +
  Dex) / (100 + %dmg + Str)), the **Whelp Bond** for **Energy** (`derived.whelpMul`), like Poe's jutsuMul and the Shih
  Tzu's hexMul. Javelins are conjured from the quiver: no ammo item, no charges; skills have zoom costs and some cooldowns.
- Ember damage is the game's **fire** element (Blazing Ball's): monsters' fire resistance applies; the burns are fire
  damage over time (checkpoint 2).
- Starter kit: the Toy Lance; skills `{ sunbeamThrust: 1, bonkDart: 1 }`; hotbar LMB attack, RMB Sunbeam Thrust, key 1
  Bonk Dart; the second weapon set's right click is Bonk Dart.
- **Basic attack** (`attack` with a lance, free): **the reach combo**: a thrust, a second thrust, then a sweeping swat.
  100% weapon damage (+ A Knight's Vow). The thrusts hit everything in a line 2.75 m long, 0.5 m either side (a body's
  radius on top); the swat ×1.15 on a 150° arc at 2.55 m with harder knockback. A pause over 1.3 s starts it over; each move
  takes one attack at his attack speed (the swat a touch longer). The reach assist walks him up to a far target and lunges
  (≤ 1.2 m) at a near one, as for the others' melee.

### Lance bases (`src/rpg/items.js`, three tiers, icon shape `lance`, colours [head, shaft, pommel])
| base | lvl | dmg | aspd | req | head |
|---|---|---|---|---|---|
| Toy Lance | 1 | 3–8 | 1.1 | — | flame |
| Squeaky Pike | 5 | 4–11 | 1.15 | — | squeak |
| Rope-Toy Lance | 9 | 7–15 | 1.05 | Str 20 | rope |
| Rawhide Spear | 13 | 8–19 | 1.1 | Str 26 | rawhide |
| Leafblade Lance | 20 | 13–29 | 1.1 | Str 38 | leaf |
| Ember Glaive | 24 | 14–31 | 1.15 | Str 44 | flame |
| Wyvern Lance | 28 | 17–38 | 1.05 | Str 52 | wing |
| Tennis Comet Lance | 33 | 20–44 | 1.1 | Str 60 | comet |
| Sunspear | 40 | 26–54 | 1.1 | Str 72 | sun |
| Dragon Guard Lance | 45 | 32–66 | 1.1 | Str 82 | flame |
| Starfall Pike | 50 | 40–80 | 1.05 | Str 95 | star |
| Emberleaf Lance | 55 | 38–76 | 1.2 | Str 104 | leaf |

About a sword's damage at a touch slower; the reach is the lance's own. Rares get lance names (`RARE_B.lance`: Lance,
Pike, Poker, Glaive, Spear, Wingtip, Fetcher, Sunbeam); the shop stocks two lances while he's the active hero; the tooltip
reads "Thrust Damage" and "Long thrusts · the longest reach · scales with Strength". Every base is the same Blender prop.
Checkpoint 2 tints it per base like the flail (`goldenGear.js setLanceLook`): the emerald rubber head and felt guard to
[head], the rope's tan bands to [shaft], the tennis ball to [pommel], by hue on the prop's one texture (the painted shading
kept); the Toy Lance is the texture as painted.

## 3. Skills (3 trees × 7, the D2 framework: rows 0–5 gated at levels 1/6/12/18/24/30, prerequisites, synergies)
`src/rpg/skillsGolden.js`; numbers at skill level `l`; `lin(a, b)` = a + b·(l − 1); `dim(l, max, half)` = max·l/(l + half).
Damage is % of his rolled lance damage with synergies folded in. **Lance Arts** multiply by A Knight's Vow; **Javelins** by
Keen Nose and `javMul`; the **Whelp Bond** by Best Friends and `whelpMul`. The **Whelp Bond's actives drive Shadow**: they
wait while he's knocked out ("Shadow is resting!": `WHELP_ACTIVES`, `castBlocked` → `gldWhelpBlocked`), and Swoop, Wing
Shield and Dragon Heart wait while he's dragon-sized. The lance moves (and the lance combo) wait while the lance is up in
the air (Starfall Lance). All 21 are built (`GOLDEN_TRAINING` is empty).

**Lance Arts** (`lance`, Strength, emerald `#2f8a5c` / brass)
| skill | row | what | numbers | charge (checkpoint 2) |
|---|---|---|---|---|
| `sunbeamThrust` Sunbeam Thrust | 0 | both paws on the lance, one big earnest step and a lunge: the thrust flashes down a long line like a sunbeam | lin(155, 16)% to everything in a line 3.8 + 0.04l m long, 0.6 m either side · knockback 0.6 · cost 3.5 + 0.17(l−1) · syn A Knight's Vow 2%, Pinwheel Sweep 3% | *Noonday Thrust*: a longer, wider line, a sunbeam that lingers a beat; ★ Second Sun (a second beam 0.25 s later) |
| `knightsVow` A Knight's Vow | 1 | passive: he promised, very solemnly | +25 + 9(l−1)% Lance Arts and lance attack damage · +1.5 + 0.4(l−1)% crit | — |
| `sunfallJump` Sunfall Jump | 1 | **the dragoon's Jump**: a leap so high he's a speck against the sun, a hang, then a dive lance-first onto the spot, a shockwave | lin(200, 22)% in 2.4 + 0.04l m · leap ≤ 7 m · stun 0.5 + 0.03l s · untouchable in the air · cost 9 + 0.45(l−1) · cd max(1.5, 4 − 0.1l) · syn Sunbeam Thrust 5%, Starfall Lance 4% | *High Noon*: higher, longer hang, wider crash; ★ Embers Below (the crater smoulders) |
| `pinwheelSweep` Pinwheel Sweep | 2 | a paw planted and the lance swung all the way round at full reach | lin(120, 13)% all round, reach 2.9 + 0.03l m · knockback 1.1 · cost 6 + 0.3(l−1) · syn Sunbeam Thrust 4%, Gallant Charge 4% | *Whirling Pinwheel*: wider, harder, a second turn (60%) from Ⅱ; ★ Leaf Gust (a ring of leaves pushes foes out) |
| `steadyPaws` Steady Paws | 3 | passive: **the brace**: he plants the pommel and lowers the point, and a foe that runs at him runs onto it | 15 + dim(l, 25, 10)% chance to impale a foe that hits him up close: lin(120, 14)% (once per 0.6 s) · +15 + 6(l−1)% defense | — |
| `gallantCharge` Gallant Charge | 4 | lance levelled, ears streaming, a charge straight down the line: foes in the way poked and flung aside | lin(160, 17)% to everything in the path, 1.2 m wide · 6 + 0.15l m at 16 m/s · untouchable while charging · cost 10 + 0.4(l−1) · cd max(1.5, 4 − 0.1l) · syn Sunfall Jump 5%, Pinwheel Sweep 4% | *Thundering Charge*: further, wider, carries foes along and drops them at the end |
| `starfallLance` Starfall Lance | 5 | ultimate: he throws the lance as high as he can; it comes down as a falling star wreathed in embers and leaves; he catches it on the bounce | impact lin(320, 34)% in 3.2 + 0.04l m · stun 1 s · then embers lin(30, 3)% fire per second for 4 s · lands 0.9 s after the throw, ≤ 12 m · cost 32 + (l−1) · cd 8 · syn Sunfall Jump 5%, A Knight's Vow 3% | *Shooting Star*: bigger; ★ Constellation (Ⅲ: two small stars first) |

**Javelins** (`javelin`, Dexterity, brass `#b8862e`)
| skill | row | what | numbers | charge |
|---|---|---|---|---|
| `bonkDart` Bonk Dart | 0 | a toy javelin from the quiver, tossed on a cheerful arc; the gold tip bonks, and whoever stands beside gets a little bonk too | lin(140, 15)% · 50% to foes within 1.3 m of it · 19 m/s, ≤ 13 m · cost 2.5 + 0.13(l−1) · syn Keen Nose 3%, Tailwag Volley 4% | *Big Bonk*: a heavier javelin, a bigger splash, a short daze |
| `keenNose` Keen Nose | 1 | passive: he can smell a yokai at fifty paces | +25 + 9(l−1)% Javelins damage · +1.5 + 0.4(l−1)% crit | — |
| `tailwagVolley` Tailwag Volley | 1 | a pawful of javelins fanned as wide as a happy wag | min(9, 3 + ⌊l/3⌋) javelins in a min(80, 40 + 2l)° fan · lin(96, 9)% each · cost 4.2 + 0.33(l−1) · syn Bonk Dart 3%, Sunshower 4% | *Full Wag*: +2/+3/+4 javelins, a wider fan |
| `trueFlight` True Flight | 2 | one long, honest throw: flat, fast, through every foe in the line | lin(150, 16)% to every foe in a 15 + 0.1l m line · 30 m/s · cost 8 + 0.4(l−1) · syn Bonk Dart 5%, Emberleaf Javelin 4% | *Truest Flight*: further, harder; ★ Twin Flight (a second javelin a beat later) |
| `goodRetriever` Good Retriever | 3 | passive: **mark and retrieve**: a landed javelin stays 5 s; trot over it to scoop it up; a foe with one stuck in it is marked for the lance | scoop: +2 + 0.2l zoom and +15% attack speed for 3 s · marked foes take +10 + dim(l, 20, 10)% from the lance (4 s) | — |
| `emberleafJavelin` Emberleaf Javelin | 4 | a javelin wrapped in emberleaf: it sticks in the first foe, glows brighter, then bursts in embers and leaves | burst lin(220, 24)% fire in 2.2 + 0.04l m after 1.2 s · smoulder lin(28, 3)% fire per second for 3 s · cost 12 + 0.5(l−1) · cd 1 · syn Tailwag Volley 4%, True Flight 4% | *Bonfire Javelin*: a bigger burst, a longer smoulder; ★ Kindling (the burst throws two little embers) |
| `sunshower` Sunshower | 5 | ultimate: the whole quiver straight up; a moment later it rains javelins on the spot, glittering like a sunshower | 14 + l javelins over 2 s in 3.5 + 0.05l m · lin(110, 12)% each in 1 m · ≤ 14 m · cost 30 + (l−1) · cd 8 · syn Tailwag Volley 5%, Bonk Dart 3% | *Cloudburst*: more javelins, a wider rain; ★ Rainbow (the last volley lands together) |

**Whelp Bond** (`whelp`, Energy, ember `#d8603a`) — Shadow the dragon whelp
| skill | row | what | numbers | charge |
|---|---|---|---|---|
| `emberBreath` Ember Breath | 0 | "Shadow, breathe!" Shadow flutters to his side, takes a big breath and puffs a cone of warm embers | lin(44, 2.8)% fire 3 times in a 50° cone 4 + 0.05l m long · smoulder lin(18, 1.3)% per second for 3 s · a call while he's still breathing adds its puffs to his · cost 5 + 0.25(l−1) · cd 0.6 · syn Best Friends 3%, Divebomb Swoop 4% | *Big Breath*: a longer, wider cone, more puffs |
| `bestFriends` Best Friends | 1 | passive: a dragoon and his dragon | +25 + 8(l−1)% Whelp Bond damage · Shadow +20 + 6(l−1)% life and +15 + 5(l−1)% damage | — |
| `divebombSwoop` Divebomb Swoop | 1 | "Swoop, Shadow!" he climbs as high as his little wings allow and divebombs the spot | lin(170, 18)% fire in 1.8 + 0.03l m · smoulder lin(20, 2.2)%/s, 3 s · knockback 0.8 · ≤ 11 m · cost 8 + 0.4(l−1) · cd max(1.5, 3.5 − 0.08l) · syn Ember Breath 5%, Mighty Little Roar 3% | *Loop-the-Loop*: harder, wider, a second swoop (25%) at Ⅲ; ★ Scorched Earth |
| `wingShield` Wing Shield | 2 | Shadow hovers before him and spreads his wings: blows and spit caught on the felt; a big flap when it gives way | absorbs (14 + 1.3l)% of his life for 6 s · then a gust lin(80, 9)% in 2.5 m, knockback 1.6 · cost 12 + 0.5(l−1) · cd 8 · syn Best Friends 4%, Warm Heart 3% | *Great Wings*: a bigger barrier, a bigger gust |
| `warmHeart` Warm Heart | 3 | passive: a little ember in Shadow that never goes out | Shadow wakes after max(3, 10 − dim(l, 7, 8)) s (10 untrained), mends 1 + dim(l, 3, 10)% life/s · embers smoulder dim(l, 60, 10)% longer · the Whelp Bond costs dim(l, 25, 8)% less | — |
| `mightyRoar` Mighty Little Roar | 4 | Shadow puffs out his chest and roars. It comes out as a squeak. The pack feels braver anyway | the pack +15 + dim(l, 35, 10)% damage and +15% attack speed for 8 s · foes within 6 m flinch 0.4 s · cost 14 + 0.6(l−1) · cd 12 | *Mightier Roar*: longer, wider |
| `dragonHeart` Dragon Heart | 5 | ultimate: for a few seconds Shadow's heart is as big as a real dragon's, and so is the rest of him: he grows huge, sweeps ember breath, stomps proudly, then poof, small again | 10 + 0.2l s at 2.4× · +100% life (heals fully) · an ember sweep every 1 s: lin(150, 16)% in 2.8 m, smouldering lin(25, 2.5)%/s · nearby foes go for him · cost 35 + (l−1) · cd 25 · syn Ember Breath 5%, Best Friends 4% | *Elder Heart*: bigger, longer; ★ the two do a combined Jump at the end (Foosy rides the dive) |

The charge column is the release's idea; the tables as built are §3b.

### What's built: the moves (checkpoints 1 and 2)
- **The reach combo** (`goldenPoses.js` `lanceThrust1`, `lanceThrust2`, `lanceSwat`): every lance move starts and ends on
  the **guard**, the stance he holds while the lance is drawn: standing guard, the lance upright at his right side in his
  right paw, a touch forward and out. (A two-handed guard doesn't read from the game's high camera: with chibi arms the
  shaft has to cross in front of him and its head lands over his face. The moves are two-handed.) A thrust takes it
  two-handed (the left paw onto the shaft), draws it back level at the foe, then lunges: the body
  drives in, the front foot steps out, and the lance **slides through his paws** along its own axis (`A.lanceSlide`:
  chibi arms can't push it far, so the shaft runs out through the grip, up to 0.3 m). The swat winds the lance back over
  his right shoulder and sweeps it level across the front (the samurai's blade arc draws its sweep). Each thrust flashes a
  **sunbeam streak** down its line (`gfx/goldenFx.js streak`: a warm cream band, ≤ 0.7 alpha, a thin capped additive core,
  0.2 s) and a small bonk on what it hits; the reach assist lunges like Chewy's.
- **Sunbeam Thrust** (`sunbeamThrust`): a deep crouch with the lance drawn right back (eyes shut, ears pinned), then the
  biggest lunge he has: a wider, longer streak with its core, bonks on up to four foes, a hit-stop and a shake.
- **Bonk Dart** (`javToss`): the lance goes to his left paw, upright like a standard; a javelin drawn from the quiver over
  his right shoulder appears in his paw, is cocked up and back past his ear drape, then hurled overhand with a step. It
  flies on a readable arc (gravity 16 m/s²: about a 1 m apex over 10 m), trailing soft cream motes, bonks the first foe it
  reaches (and splashes 50% beside it), pops back off tumbling end over end and lies a moment; a miss sticks in the ground
  at the angle it came down. Every javelin in flight, tumbling or stuck is a slot in **one instanced batch** of the Blender
  prop (`JavelinBatch`, 96 slots, one draw).

- **Sunfall Jump** (`sunfallJump`, goldenArts.js): a coil, the spring (the lance up overhead in both paws), a hang at the top
  with the sun's glint on him and the body turning lance-down, a dive with the point first and the ears streaming up, the
  crash with the lance planted. 2.8 m up (×1.1–1.3 charged: high, and still in the picture at the game camera); his own
  leap (`P.leap = { own }`: skillRunner leaves it alone, Player.update stands aside; untouchable from the spring to the
  crash); the landing is the furthest open floor along the way (≤ 7 m, short of a wall or an edge), shown by a soft gold
  ring while he's up. The crash (`goldenFx.crash`): a ring rolling out to the radius round a clear middle, short sunbeams
  flashing out along the ground, dust, leaves, a small scorch; the foes stunned (dizzy stars).
- **Pinwheel Sweep** (`pinwheel`): the lance out level on his right at full reach and his whole facing turned once round to
  his left (so the lance leads through his front), a warm blade arc round the full circle, leaves thrown out; a hit per turn.
- **Gallant Charge** (`gallantCharge`): the lance couched under his arm, a crouch, then his own dash (`P.dash = { own }`,
  through the same collision as walking; untouchable) at 16 m/s with the Animator's own gallop; foes along the lance's
  width are poked and flung aside (knocked from a point on his path behind them), a charged one carries them along on the
  point and drops them dizzy; dust and a faint streak of sunlight behind; a skid.
- **Starfall Lance** (`starfallThrow`, `lanceCatch`): wound back overhead, heaved straight up (on his toes, watching it go);
  the held lance hides (`P.lanceThrown`) and a second lance (one per world, dressed as his) climbs out of sight, then falls
  as a star from ~7.5 m onto the spot (a pulsing ember ring marks it), wreathed in embers and leaves; the crash, the stun,
  a smouldering crater (`gldSmoulder`: a scorch, embers, a burn on foes inside); the lance bounces home end over end into
  his raised paw.
- **Tailwag Volley** (`javVolley`): the throw sweeps across, right to left, and the fan leaves together (one sound);
  **True Flight** (`javTrue`): a deeper turn and a long flat throw that pierces the whole line with a sunbeam streak down
  it; **Emberleaf Javelin** (`javToss`, embers catching in his paw): it sticks in the first foe (riding along) or the
  ground, glows brighter on a fuse, bursts in an ember ring, embers, leaves and smoke; **Sunshower** (`sunshowerThrow`):
  both paws in the quiver, the javelins flung straight up, then a rain on the spot (a gold ring, glitter falling) — each
  rain javelin bonks round where it lands and sticks.
- **Good Retriever**: a javelin that comes down (a miss, or one that bonked off a foe) lies for 5 s (up to 12 at once);
  walking over it scoops it up (zoom, the attack-speed buff `combat.buffs.retrieve`, a sparkle); a foe a javelin bonks is
  marked (`e.gldMark`, a gold glint over it) and the lance hits it harder (`gldHit`).
- **Steady Paws**: a foe that hits him up close may run onto the braced lance (`goldenGuard`, from `combat.hitPlayer`): a
  quick jab (when he's free), a streak, a bonk, "Braced!".
- **The Whelp Bond** (`combat/goldenWhelp.js`; Shadow does the work, Foosy calls: the `whelpCall` pose keeps his guard):
  Ember Breath (Shadow flies to a spot a step out from Foosy toward the foes and to the side that keeps him most beside
  Foosy on screen, inhales, puffs embers down a cone; the foes smoulder); Divebomb Swoop (a climb to ~3 m short of the
  spot, a tucked dive, an ember splash: an ember ring, embers, leaves); Wing Shield (an absorb on Foosy: blows caught on
  the felt with a "Fwump!" and a wing flutter; Shadow hovers before him with his wings spread, turned off the camera's line
  to him; an emerald ring at Foosy's feet; when it gives way, a big flap's gust); Mighty Little Roar (Shadow rears up and
  squeaks: rings out of his mouth, the pack's buff `combat.buffs.roar` with motes rising off Foosy, the foes round them
  flinch); Dragon Heart (a poof and Shadow grows 2.4× over half a second, `anim.grow`; his life doubles; he walks into the
  fight on the ground beside the nearest foe, on its far side from the camera, sweeps ember breath every second
  (edge-weighted embers), stomps, draws the foes near him (`Companion.tauntFor`); he fades where he'd cover Foosy
  (`coversHero`); a poof back down and a "zzz").
- **Warm Heart**: Shadow's revive time and regeneration come from `derived.shadowRevive` / `shadowRegen` (companion.js;
  10 s and 1 %/s for every other hero).
- **The kit fallback** (`?chewy=classic`, the Storybook kit): the crest helm built on the skull at dress time (an emerald
  cap as wide as the skull, a brass rim, two horns, the little dragon), and on the classic kit the coat's vertex colours
  lean greyer and bluer (`#ce926c`, `#f2cc96`) so it renders the sheet's `#C47A3A` / `#E0A868` (measured: `#c67945`
  game camera, `#c97a41` close; the feathering `#cba05e`).
- **Lance tints** (`goldenGear.js setLanceLook`): the Toy Lance keeps the texture; every other base recolours it by hue
  before lighting (the emerald head and guard → the head colour, the cream rope → the shaft colour, the tan bands → a
  darker head colour, the tennis ball → the pommel colour; brass stays), keeping the texture's own shading; one material
  per look, one shader program.

### 3b. Charged (docs/CHARGE.md §7 has every number)
Every active charges (`rpg/chargeGolden.js`; releases `combat/chargedGolden.js`, each starting its real move from the
wound-back frame its wind-up held: `goldenPoses.js GOLDEN_CHARGE_POSES`; the javelin wind-ups hold the javelin, the lance
in the left paw). Solved by `node tools/charge-sim.mjs --solve` (models `tools/charge-sim-golden.mjs`): every damage skill's
full charge is ×1.20–1.27 sustained (Ⅰ / Ⅱ ×1.01–1.14), the buffs and Dragon Heart ×1.09–1.28 value per zoom.
| skill → release | wind-up | the charge | perks (besides Deeper Charge, Quick Wind-up) |
|---|---|---|---|
| Sunbeam Thrust → *Noonday Thrust* | crouched over the lance drawn right back | a longer, wider line, a stagger | Wide Beam; ★ Second Sun (a second beam 0.25 s later) |
| Sunfall Jump → *High Noon* | coiled for the Jump | higher, a wider crash, longer stun; the star's crash from Ⅱ | Wide Arc; ★ Embers Below (the crater smoulders) |
| Pinwheel Sweep → *Whirling Pinwheel* | the lance wound round behind him | wider, harder; a second turn (60%) from Ⅱ | Efficient Focus; ★ Leaf Gust |
| Gallant Charge → *Thundering Charge* | the lance couched, pawing the ground | further, wider, faster; carries the foes from Ⅱ | Efficient Focus; ★ Grand Skid |
| Starfall Lance → *Shooting Star* | the lance wound back overhead | wider, harder, longer stun, hotter crater | Efficient Focus; ★ Constellation (Ⅲ: two small stars first) |
| Bonk Dart → *Big Bonk* | a javelin cocked behind his ear | harder, a wider splash, a daze | Twin Darts; ★ Wobbly Bonk |
| Tailwag Volley → *Full Wag* | a pawful of javelins wound back | +2/+3/+4 javelins, a wider fan, harder | Efficient Focus; Second Wag (echo) |
| True Flight → *Truest Flight* | a deep turn | further, wider, harder | Efficient Focus; ★ Twin Flight |
| Emberleaf Javelin → *Bonfire Javelin* | a javelin cocked behind his ear | a bigger burst, hotter and longer smoulder | Efficient Focus; ★ Kindling |
| Sunshower → *Cloudburst* | both paws in the quiver | more javelins, a wider rain, harder | Efficient Focus; ★ Rainbow (Ⅲ) |
| Ember Breath → *Big Breath* | a paw up, calling Shadow | longer, wider (edge-weighted embers), more puffs | Efficient Focus; Wide Arc |
| Divebomb Swoop → *Loop-the-Loop* | (the call) | harder, wider; a second swoop (25%) at Ⅲ | Efficient Focus; ★ Scorched Earth |
| Wing Shield → *Great Wings* | (the call) | a much sturdier, longer shield, a bigger gust | ★ Warm Felt; ★ Ember Felt |
| Mighty Little Roar → *Mightier Roar* | (the call) | longer, wider, braver | ★ Pep Talk; ★ Echoing Squeak |
| Dragon Heart → *Elder Heart* | (the call) | bigger, sturdier, longer, harder | ★ Hearth Heart; ★ Dragon's Jump (Ⅲ: the two come down together) |

Charged areas read by their edge: rings rolling out round a clear middle, the breath's embers weighted to the cone's rims.

## 4. Balance (`node tools/hero-balance.mjs`; asserted in `tools/test-rpg.mjs`)
Same rules as docs/POE.md §4 (the best normal base the level allows, a skill build, stat points 50% damage stat / 30% Vit /
20% Energy, a 60 s fight, 70% packs of five / 30% single). His thrusts hit a line, not an arc: `lineArea` counts the foes
a line catches in a pack (its area over the pack's, with the same crowding near the hero as the arcs' model).

| level | the lance build vs the Chewy–Moka–Poe–Shih Tzu mean | eHP (×the Shih Tzu's) | the javelin build: clear (single) |
|---|---|---|---|
| 6 | dps ×0.98 | ×1.09 (×0.90) | ×0.85 (×1.27) |
| 15 | dps ×0.90 | ×1.07 (×0.90) | ×1.03 (×0.96) |
| 30 | dps ×0.98 | ×1.05 (×0.91) | ×0.88 (×0.75) |
| 45 | dps ×0.95 | ×1.05 (×0.91) | ×1.05 (×0.89) |

Asserted: the lance build at **dps ×0.85–1.05 of the mean, eHP over the mean and under the Shih Tzu's**; the javelin build
and the Whelp Bond build at **clear ×0.85–1.05**.
- **The lance build**: Sunbeam Thrust, A Knight's Vow, then Pinwheel Sweep, Sunfall Jump and Gallant Charge; Sunbeam Thrust
  on repeat at one attack's time, the reach combo filling the waits for zoom.
- **The javelin build** (`golden·jav`, a Dexterity build: 50% of the points in Dexterity, so `javMul` > 1): Bonk Dart's
  point, then Tailwag Volley, Keen Nose, Bonk Dart, True Flight, Sunshower (`plan`); whichever of Bonk Dart and Tailwag
  Volley fights better at the level is on repeat (`alt`: Bonk Dart early). A fan's javelins each bonk the first foe they
  reach: in a pack about three in four find one, a lone foe takes the middle one or two.
- **The Whelp Bond build** (`golden·whelp`, an Energy build: `whelpMul` > 1): Ember Breath on repeat (paced by its
  cooldown, the call and the puffs: a call while Shadow is still breathing adds its puffs to his), Best Friends, then
  Divebomb Swoop, Warm Heart, Mighty Little Roar, Dragon Heart. The cone catches ~arc/120 of a pack, a lone foe whole.
  Clear ×0.98 / 0.92 / 0.92 / 0.99 (single ×0.91 / 0.90 / 0.94 / 1.02) at levels 6 / 15 / 30 / 45; asserted ×0.85–1.05.
  Checkpoint 2's pass: Ember Breath lin(45, 5) → lin(44, 2.8)% a puff, its smoulder lin(20, 2.2) → lin(18, 1.3)% (it grew
  ×1.29 → ×1.72 of the mean over the levels).
- Checkpoint 1's pass: Sunbeam Thrust 165 + 18 → 155 + 16 per level, its synergies 3/4 → 2/3%, its cost 4 → 3.5; the combo
  95 → 100%; Tailwag Volley 85 + 9 → 96 + 9, cost 7 + 0.35 → 4.2 + 0.33 (it was starved of zoom); Bonk Dart 130 → 140%,
  cost 3 → 2.5, its splash 40% in 1.1 m → 50% in 1.3 m.

## 5. Joining (built in checkpoint 3: `src/actors/goldenJoin.js`, owned by HeroManager like the others: `G.heroes.gldJoin`)
- **The scene** runs in the **Onsen** zone (`JOIN_AT.golden = 'onsen'`, at Yukimi's big hot spring, `onsen.js SPRINGS[0]`),
  on any visit while he hasn't joined. Until then he isn't in town and the wheel's card says "Standing guard by the hot
  springs…". The scene's actor is a `SceneGolden` (an Actor with his gear: the lance in his paw, `gldAttention` and the
  other scene poses in `goldenPoses.js`); it is built hidden on arrival and shown two seconds in, once the field is calm.
  - **Staging** (`stage`, worked out once as he takes his post): his post on the big spring's rim; your mark beside him
    on screen (2.7 m across, a step toward the camera); Shadow's mark between you, in front; where the ball lands (his
    other side or behind him). Every spot is dry, level and **in plain view of the game camera**: rays from each actor's
    middle and head up the camera's line against the scenery (`screened`). The scenery near the spring is gathered a
    few milliseconds a frame while he waits (`prepStep` / `occBuild`: the big merged batches cut to their triangles in
    a box round the spring above knee height, sorted into half-metre strips across the screen so a ray meets a few
    thousand triangles; the trees' batched and instanced meshes and the small props as they are; no actors, ground or
    see-through things), so taking the post costs ~15–25 ms once. Pairs that leave the spring and its steam in front of
    them are scored down.
  - *guard*: at his post, facing the camera, standing very straight, the lance upright (`gldAttention`). Within 16 m
    Shadow notices him once (a "?" and the hint `gldGuard`: "…Is he a statue?").
  - *vow* (within 5 m, the field calm): controls lock, you walk to your mark (`moveTarget`; on it after 4 s if the way
    is blocked) and Shadow trots to his and sits watching. The scene's camera (`frameTick`, every frame of the scene) frames the beat's actors with a margin and
    keeps the group in the middle of the screen: him and you, Shadow once he's called, the ball during the fetch, the
    loop's circle during the loop; the distance from the group's size on screen (the 20° lens), 14–26 m. He turns, salutes
    (`gldSalute`) and begins: "Halt! Who approaches the springs of Yukimi? …A traveller. Then bear witness: I, Foosy of
    the Emberleaf Guard, do solemnly swear upon my lance to guard these springs against all—". A tennis ball (a
    procedural one, with a seam) arcs out of the old bathhouse (the zone's `feature` POI) and bounces past him ("Fetch!").
    He startles (`gldStartle`, a "!"), the lance falls and lies on the ground, he bounds after the ball, picks it up
    (it rides in his jaw, following the head), trots back to his post, sits with it, very pleased (`gldSitProud`, a
    heart), drops it at your feet and finishes: "—against all comers. … Is this yours? It was very well thrown."
  - *talk*: two answers ("That ball is the bathhouse's." / "Good catch!"), then the gift: Shadow is called to his mark,
    he offers a little emerald bundle (`gldOffer`): "Every dragoon needs a dragon. Would you like to be mine?" Shadow
    barks, the bundle goes, and **Shadow wears the whelp outfit though Foosy isn't the one played** (`Whelp.forced`
    overrides `wanted()`; the swap's poof): a wobbly first flap (up, a bump back down, up for real), a tiny roar that
    comes out as a squeak (`whelp_roar`), then a happy twelve-point loop round you both at 1.3 m. "…Magnificent. He is a
    natural. A little squeaky."
  - `prepareJoin`; "May I join your pack? I promise to guard it with my whole heart." ("Welcome to the pack! ♡" / "Only
    if you bring the ball."); he picks up his lance, bows (`gldBow`), trots off and is gone in a poof; `joinGolden()`
    (banner, `flags.goldenJoined`, the save; near the pack's level). `Whelp.forced` clears (the outfit comes off with a
    poof) and Shadow's hint `gldWings` says he wears his wings whenever Foosy is played. He lives at Chewy's house from the
    next town visit, the lance on his back.
  - Leaving the zone, dying or a hero switch mid-scene resets it all (the actor, the ball, the bundle, the lance on the
    ground, `forced`, Shadow's hold); it plays again on the next visit.
- **The rumour**: in town, once the Shih Tzu has joined and Foosy hasn't, Shadow passes it on once (`gldRumour`): a very
  polite dog in emerald armour is guarding the hot springs at Yukimi Onsen and won't let anyone in without the password
  ("…Is the password 'ball'?"), with the Wayfarer's Post, or the unlock the zone still needs.
- **The guide** "Meet Foosy" (`world/guides.js meetGolden`, narrated by him, the class colour; the title and lines read
  `CLASSES.golden.name`): *hold* Tab, the wheel with five, pick him; *lance* (left-click the reach combo, right-click
  Sunbeam Thrust); *javelin* (1: Bonk Dart); **whelp**: Shadow flies beside him while he's played; done when Shadow is
  airborne and lifted (`whelp.air > 0.9`, `lift > 0.6`: walk a few steps and he takes off), after 3 s on the step; *wrap*
  (his trees, K).
- `?hero=golden` (debug) and `G.heroes.joinGolden()` (QA) join him at once.
- QA: `tools/qa/s29-golden.mjs` (a: the scene beat by beat, b: a reset mid-scene and the rumour, c: the guide, d: every
  skill tapped in a Burrow fight and a real Sunbeam Thrust hold, e: a charged burst's frames; `SHOTS=1` saves the beats to
  `tools/qa/tmp/s29/`); `prod-smoke.mjs` checks his guard at the Onsen in the built bundle.

## 6. Shadow the dragon whelp (`src/actors/whelp.js`; Companion.update calls it)
- **The rule**: Shadow wears the whelp outfit **only while Foosy is the active hero** (`Whelp.wanted()`: `activeHero ===
  'golden'`). A switch to any other hero, or Foosy benched in town as a villager, and Shadow is his normal self. Each swap
  rebuilds Shadow's rig in place (the same spot, facing, life, level, combat registration, sit or knock-out) with a **poof**
  (a soft cream cloud, a few emerald or gold sparkles, a heart, `whelp_poof`); at boot (`?hero=golden`, an old save) it's
  quiet. He keeps his name, his life and his companion state: only the rig changes. `whelp:swap` lets the HUD re-render his
  face.
- **The assets**: `public/rigs/shadow_whelp.*` (`HERO_MODELS.shadowWhelp`: the same quad skeleton, face and coat as
  shadow_toy, with the hood, the bib, the back spikes and the tail cover; `earDamp: 0.6`, his ears coming up through the
  hood's slits) and the wing prop `public/models/shadow-whelp-wing.glb` (the LEFT wing; the right is its x-mirror),
  mounted on the body bone at wing_mount.json's spots (`WING_MOUNT`: (±0.1322, 0.0553, −0.0854) in the body bone's frame;
  the prop's +X spans outward, +Z forward, +Y up, flat at flap 0). A flap turns a wing about its root's +Z (+ raises the
  tip), clamped to **−30°..+60°** (`FLAP_RANGE`, where the clearances were checked). Without the whelp rig (missing files)
  the wings go on whichever Shadow there is, so he still flies; without the wing prop he wears the outfit and walks.
- **Flight** (how he's drawn over the ground; his AI still walks the ground plane: paths, doors, collision, the bites):
  - he hovers with his root ~1.05 m up (his body ~1.3 m, by Foosy's head), bobbing a little (`flyLift`);
  - the Animator's quad pose (`animator.js poseQuad`, the `fly` 0..1 blend): the front legs fold under the chest and the
    hind legs trail, paddling a little; the whole rig pitches **nose-down with speed** (up to ~24°) and nose-up as he
    climbs, banks into turns (`flyPitch`, `flyBank`, through a 'YXZ' root); the head counters the pitch to look ahead;
    the tail streams back; his ears swing at most 0.45 of a dog's (`earDamp` × the flight's 0.75);
  - the wings: folded up along his back on the ground (52°); in the air a sine beat inside the flap range: about 2.3 Hz
    and ±26° hovering, faster and wider with speed (to ~4.3 Hz, ±44°), faster still climbing (to ~7 Hz), and a **glide**
    (held out at ~20°, a little flutter) as he slows; banking drops the inside wing; a soft felt "fwump" on downstrokes
    (`whelp_flap`, quiet, every other beat);
  - in the air he keeps to Foosy's side **across the camera's view**, a little further from the camera than Foosy
    (`airFollow`): he's always in the picture and never in front of the hero; he keeps up when Foosy runs; when there's
    no room on one side he takes the other. In a fight he drops to ~0.55 m and bites as ever.
- **Landing**: when Foosy and he have both been still ~6 s with nothing to fight, he comes down beside him and sits
  (`landed`); he takes off the moment Foosy moves (or drifts 2.4 m off, or a fight starts). He walks on the ground, wings
  folded, **indoors** (the interiors), in **tight Burrow corridors** (walls close on both sides within ~0.75 m: checked
  twice a second with some hysteresis), in **cut-scenes and conversations** (a dialogue, the intro's staging `hold`, a join
  scene's focus), and when **knocked out** (he drops, quickly). A new world starts him on the ground where he can't fly.
- **Everything else keeps working**: the companion AI (follow, sniffing in town when grounded, staying in view), his barks
  and tips, the sit and bark actions (the bark plays in the air), knock-out and revive (he falls, then takes off), the
  HUD's companion card and his tips' portrait (**the whelp portrait** while Foosy is played: `G.portrait('shadow')` and
  `PORTRAITS.shadow` follow the outfit; the bust renders the wings too: `portraits.dresser`).
- No allocation per frame; the wing mesh and its material are shared by every wing.

## 7. Five heroes
- `HERO_IDS` follows `CLASSES` (Chewy, Moka, Poe, the Shih Tzu, Foosy). `state.heroes.golden` is created by
  `normalizeHeroes` for every save (no version bump). His villager lives at Chewy's house (`HOME_OFS`), patrols (very
  seriously), fishes and chats (`npc.js` ROUTINE); his chat is `HERO_CHAT.golden`.
- The wheel (any number of heroes: a card each, keys 1–9) and the HUD's bench minis take five as they took four; the
  touch wheel's row (CT-5) already shows five. The HUD's kana now come from `HERO_TEXT` (`hud.js` HERO_JP).

## 8. The baked model (`HERO_MODELS.goldenToy`, the props, the coat)
Built by an Opus agent with the toybox-character skill (sources archived in `tools/blender/codex/assets/golden-toy/`;
the README has the rebuild). Installed: `public/rigs/golden_toy.{json,bin,png}` + `golden_toy_n.png` (37 bones, 17,403
vertices, 1.2 m with the crest) and `public/models/golden-lance.glb` (5,996 triangles), `golden-javelin.glb` (2,472).
The game uses him (`cfgFor`: goldenToy; the hero choice in Settings is gone since CT-7); `?chewymodel=disney` (the QA's
Storybook set) has none, so he stays the kit there (`CAST.golden`), as he does if the files are missing.
- **The entry**: `earGain: 0.5`, the default squint (his lids are sized for +0.488 / −0.24), `outline: '#3a2212'`, `wave:
  'out'`, `palm: [−0.0405, −0.0288, 0.0029]` (the right mitten's grip centre off `hand_R`: prop_mount.rig.json's palms;
  the left mirrors it), `back: [0, 0.1, −0.3]`, `lanceMount` (below).
- **The lance** (`actors/goldenGear.js`): one mesh, one textured material (a toon with the white cap, so the cream rope and
  the tennis ball don't bloom under a warm key light), the pivot at the main grip, the shaft along +Y (the off-hand grip
  at +0.44, the tip at +1.24, the pommel's end at −0.36). A procedural lance of the same layout stands in until the GLB
  loads. **Drawn** (any lance move; in the Burrow and the zones it stays out; in town it goes back ~3 s after the last
  poke, or when a homestead tool is out): the holder sits at the right palm and is aimed in his frame each frame
  (`aimLance`: the pose's `A.lanceDir` / `A.lanceUp` at `A.lanceW`, else the guard's), slid along its axis
  (`A.lanceSlide`), and the **left paw is drawn onto the shaft** (armIK `reach`, weight `A.lanceTwo`) at the point nearest
  where the pose put that paw, kept 0.2–0.62 m up the shaft from the right paw (the moves; the guard is one-pawed). The
  **guard** is a stance the Animator holds while no action plays (`animator.js` `stance`: `goldenPoses.js LANCE_GUARD`; a lance move with `guard: true` carries
  the guard in its own first and last keys, so the hand-over is a cut, not a dip through the rest pose). One-handed on
  the Jump's dive (checkpoint 2). On a **javelin throw** the lance moves to his left paw, aimed upright like a standard.
  **On his back** (`lanceMount`: model space (0.17, 0.63, −0.43), about 45° across the back): the pommel out past his
  left hip (his plumed tail is at the right), the shaft over the ear drapes and behind the quiver's caps, the head up past
  his right shoulder, clear of the crest from the game's yaws. A villager's lance stays there.
- **The javelin**: the same kind of prop; one in his right paw from the draw to the release (`A.javW`, aimed by
  `A.javDir`), the thrown ones in the instanced batch (§3).
- **The coat**: under the village's warm key light, the toon's shadow tint and the grade's saturation and warm gain
  (post.js), the sheet's `#C47A3A` rendered a flat, blue-less orange (`#cb7100`). The model gets a **warm grade**
  (`warmGrade: [0.15, 6, 8, 18, 18, 36]`, heroModels.js `WARM_GRADE`): texels in the coat's hue band (18°–36°: his fur at
  28°, the feathering at 32°; not the brass at 40° or the blush at 10°) and saturated enough blend 15% toward their grey
  and take (+6, +8, +18)/255, before lighting. And a **warm cap** (`warmCap: 1.05`, `WARM_CAP`): under a strong warm key
  light (the Burrow's, the Onsen's mist) the same texels keep their hue and never pass 1.05 × their albedo (they blew out
  to a pale glowing peach). Measured in game on his ear drapes (`tools/qa/tmp/golden-coat.mjs`: skinned vertices facing
  the camera, projected and sampled; the 35th / 60th / 85th percentile):

  | light | p35 | p60 | p85 | ungraded p60 |
  |---|---|---|---|---|
  | village 11:00 | `#bb713d` | `#c57c3d` | `#c78042` | `#cb7200` |
  | the Burrow, floor 1 | `#c5844b` | `#d0915b` | `#d3975e` | `#fcaa5c` |
  | the Onsen (the zone) | `#be8a76` | `#d19874` | `#d09880` | `#f69a63` |

  The village reads the sheet's `#C47A3A`; the Burrow and the Onsen warm and brighten every hero (their key light and
  mist), not the coat. The emerald armour is untouched by the grade (its hue is outside the band). The light muzzle is in
  the band, so the cap holds it too.
- **Portraits** render ungraded (`portraits.js` zeroes the warm grade like the dark ones) and frame his big head with the
  crest (`golden_toy`: ×1.32, +0.27 m). The whelp's bust (`shadowWhelp`) wears his wings.
- **The kit fallback** (`CAST.golden`; `?chewy=classic`, and while his model loads): a red-gold dog in an emerald gi with
  brass trim; the Toybox kit adds the long feathered ear drapes, the emerald crest helm with its brass horns and little
  dragon, the cream ruff and the quiver (`goldenKit.js`). Its fur is the sheet's a little desaturated (the kits have no
  warm grade). The lance rides on the kit's `back`. The classic and Storybook kits get the crest helm at dress time
  (`goldenGear.js kitHelm`, fitted to the skull's own vertices), and the classic kit's coat its corrected vertex colours
  (`kitCoat`, §3).

## 9. Look tools
- `/?test=golden` — his look page: the baked model with the lance on his back (`hand=1`: drawn, in the guard), Chewy for
  scale (`solo` drops him, `stz` adds the Shih Tzu, `withkit` the kit); `views=1` the turnaround (`faces=a,b,c` and `sp=`
  pick the facings); `act=<action>` loops an action, `at=0..1` freezes it there; `combo=1` loops the reach combo; `walk=1`;
  `props=1` the lance and the javelin alone; `portrait=1` his, the whelp's and Shadow's busts; `ak={"armR":[…]}` holds a
  key pose (a pose explorer); `gk={…}` overrides the guard; `lm=x,y,z,ex,ey,ez` moves the lance's back mount (model space,
  Euler, logging its quaternion); `tint=` a mat colour.
- `/?test=golden&whelp=hover|flap|fly|sit|walk|cmp|flaps` — Shadow the whelp: hovering, the wings frozen at `flap=<deg>`,
  flying a circle, sitting, Shadow beside the whelp (`cmp`), the wings at −30, 0, 30, 60 in a row (`flaps`); `golden=1` adds
  Foosy.
- `node tools/qa/golden-shots.mjs [look] [idle] [walk] [attack] [<any active>] [whelp] [poof] [indoors] [wheel] [coat]
  [strip] [pack [--stage 3] [--only a,b,all]]` — the review shots: the village round him at the game camera; the whelp
  hovering, at both ends of a beat, following a walk, landed and sitting; a hero switch away and back (the poof); Chewy's
  house; the Burrow idle, walking and each move frozen through; `strip`: each move at 8 moments, front and side; `pack`:
  real fights in Bamboo Depths (18 foes closing in), each of his 15 actives frozen at its moment (charged with `--stage 3`)
  and everything at once (`pack-all`); the wheel and the HUD with five; `coat`: the fur measured. Output
  `tools/qa/tmp/golden-shots/` (gitignored).
- `node tools/qa/tmp/golden-kit.mjs [--kit classic|disney] [--coat r,g,b;r,g,b|…] [--match fur;light]` — the kit
  fallback's coat measured (and candidate vertex colours tried live).
- `node tools/qa/tmp/golden-coat.mjs [--scenes …] [--grades "cur;0.15,6,8,18,1.05"] [--hero id]` — the coat in several lights.
- `node tools/hero-balance.mjs` (the comparison, his band, the javelin and the Whelp Bond builds).

## 10. Code map
- Class and items: `src/rpg/classes.js` (`CLASSES.golden`, `HERO_TEXT.golden`, `WEAPON_CLASS.lance`), `src/rpg/items.js`
  (the lance bases, `starterLance`, `CLASS_WTYPES`, the shop, `RARE_B.lance`, tooltips), `src/rpg/actions.js` (the starter
  kit, the weapon set type, `defaultRmb`).
- Skills: `src/rpg/skillsGolden.js` (GOLDEN_TREES, GOLDEN_SKILLS, `GOLDEN_TRAINING`, `WHELP_ACTIVES`, `goldenPassives`),
  merged by `src/rpg/skills.js` (and the lance `ATTACK` params); `src/rpg/stats.js` (his tree keys, `goldenPassives`).
- Casting: `src/combat/goldenSkills.js` (`installGoldenSkills(SkillRunner.prototype)`: `lineHit`, `cast_lancePoke` and its
  lunge, `cast_sunbeamThrust`, `cast_bonkDart`, the javelins `gldThrow` / `updateGldJavelins` / `gldJavHit` (the rain, the
  fling, the Emberleaf's stick and fuse, Good Retriever's scoop), `updateGolden` / `clearGolden`, the `castBlocked` wrapper;
  Sunbeam Thrust joins the melee reach assist with its line as its reach); `src/combat/goldenArts.js` (the other Lance
  Arts and Javelins, `gldHit` (the mark), `gldBurn`, `gldSmoulder`, `goldenGuard` (Steady Paws), Good Retriever);
  `src/combat/goldenWhelp.js` (the Whelp Bond: Shadow's moves through `Whelp.act`, the shield's soak, Dragon Heart);
  `src/combat/chargedGolden.js` (the charged releases); `skillRunner.js` routes the lance attack, calls update / clear and
  leaves an own leap / dash alone; `combat.js` (`goldenGuard` in hitPlayer; the roar in `playerBonusPct` / `atkMul` /
  `moveMul`, Good Retriever's pep in `atkMul`).
- Charge: `src/rpg/chargeGolden.js` (merged by `rpg/charge.js`), `tools/charge-sim-golden.mjs` (merged by
  `tools/charge-sim.mjs`), `tools/charge-table.mjs` (his labels and wind-up names).
- Looks: `src/actors/goldenGear.js` (the lance and javelin props or their stand-ins, `dressGolden`, `mountLance`,
  `aimLance`, the Player mixin `holdLance` / `dropLance` / `carryLance`, `javelinGeo` / `javelinMat`),
  `src/actors/goldenPoses.js` (his actions and Shadow's whelp moves, `GOLDEN_ROOTED`, the guard `LANCE_GUARD`,
  `GOLDEN_CHARGE_POSES`, the key-pose helpers, `jumpY`), `src/gfx/goldenFx.js` (the streak, bonks, dust, the javelin batch,
  embers, leaves, smoke, the glint, a ground ring, the crashes, the ember burst, the breath, the roar's rings, the gust),
  `src/audio/golden.sfx.js` (37 sounds), `src/rpg/iconsGolden.js`
  (the lance item art, all 21 skill icons and the combo's), `src/ui/glyphs.js` (`lance`, `javelin`, `whelp`), `src/ui/rpg.js`
  (his trees), `src/actors/goldenKit.js` + `CAST.golden` (charKit.js: the kit fallback).
- Shadow the whelp: `src/actors/whelp.js` (the wings, `buildWhelpRig`, the `Whelp` mode: the swap, `airFollow`, the flight
  state, `act` / `steer` for the Bond's moves, the wing `kick` and `burst`); `companion.js` (one call a frame, the air
  follow, `steer`, Warm Heart's revive and regen, the roar on his bite, `tauntFor`); `animator.js` (`poseQuad`'s flight,
  `earDamp` and `grow`; the `stance` hook); `heroModels.js` (`HERO_MODELS.shadowWhelp`, `earDamp`); `game.js` (the whelp's load, `G.portrait`).
- Heroes: `src/actors/heroes.js` (JOIN_AT, JOIN_HINT, HOME_OFS, HERO_CHAT, `joinGolden`), `src/actors/heroModels.js`
  (`HERO_MODELS.goldenToy`, `lanceMount`, `warmGrade` / `warmCap`), `src/gfx/portraits.js` (his framing, `dresser`),
  `src/game.js` (his model and portrait), `src/ui/hud.js` (the weapon badge's glyph; the kana from HERO_TEXT).
- Joining: `src/actors/goldenJoin.js` (`GoldenJoin`: the Onsen scene, its `SceneGolden` actor, the ball and the bundle, the
  rumour; HeroManager owns it as `gldJoin` and ticks it after `stzJoin`), the scene poses in `goldenPoses.js`
  (`gldAttention`, `gldSalute`, `gldStartle`, `gldSitProud`, `gldOffer`, `gldBow`), `Whelp.forced` in `whelp.js` (the gift's
  try-on), `world/guides.js meetGolden`, `tools/qa/s29-golden.mjs`.
- Floor loot (shared, `src/combat/groundLoot.js`): coins, potions, materials, pantry, gems, quest items and items are
  drawn in the Horde's instanced batches in a fight (`lookIn`), released on pickup (§11).

## 11. Performance (checkpoints 2 and 3; `tools/qa/profile-horde.mjs`, ROT.golden: his full kit with the whelp breathing and swooping)
The rotation casts every 160 ms: Dragon Heart, Ember Breath ×4, Divebomb Swoop ×3, the lance moves, the javelins (a volley,
the rain, an Emberleaf), the roar, the shield. Measured on a **busy machine** (WardogsClient using 38% of the 3D engine,
the CPU at 76–82%, other Chrome sessions; the tool's verdict BUSY), Poe, Floofy and Foosy back to back under the same load
(CPU ms per frame, p50 / p95):

| world, horde | Poe | Floofy | Foosy |
|---|---|---|---|
| Burrow, 150 | 10.3 / 15.5 | 10.3 / 17.8 | 9.5 / 16.3 |
| Burrow, 250 | 15.7 / 20.1 | 13.7 / 18.2 | 15.1 / 19.7 |
| zone (Bamboo Depths), 150 | 12.4 / 18.7 | 16.9 / 30.7 | 11.5 / 16.6 |
| zone, 250 | 20.7 / 27.7 | 21.9 / 34.4 | 19.2 / 28.9 |

(first tries; the retries swung with the load: Poe's zone 150 went to 20.2 / 50.3.) Nothing of his costs more CPU than the
others'.

**Draw calls at 250 (checkpoint 3).** They ran higher than Poe's (the zone ~1,000 against ~650; the Burrow ~800 against
~500). `profile-horde.mjs DRAWCAT=1` (a per-category option: hide one kind of object at a time over a few frames and
average the harness's per-frame `renderer.info` count) pinned it: **the floor's loot**. His kill rate leaves ~270 drops
on the floor by the end of the 250 window against Poe's ~77, and each drop was a mesh plus an outline plus a shadow (the
loot's share: ~510–700 draws against Poe's ~200). Before that, a bonk's ring was a mesh and a material per javelin (now a
particle) and the bright middle stars are budgeted to three a frame. **The fix** (`src/combat/groundLoot.js`): in a fight,
coins, potions, materials, pantry goods, gems, quest items and items are drawn in the Horde's instanced batches
(`dungeon/horde.js lookIn`, the toon body and its ink on cached geometry: one draw per kind, however many lie there) and
released from them on pickup; furniture (its geometry may not be cached) and textured drops stay plain meshes. After it,
the same run (`DRAWCAT=1 WORLDS=zone,burrow HEROES=golden,poe`, two passes each, a BUSY machine: WardogsClient at up to
89% of the 3D engine, the CPU at 88–100%):

| draws per frame at 250 | Foosy | Poe |
|---|---|---|
| zone (Bamboo Depths) | 491 / 487 | 560 / 564 |
| Burrow | 420 / 480 | 438 / 429 |

His loot now costs ~40–70 draws for ~180–260 drops; he sits at or under Poe's count (the Burrow's second pass +12%,
within the 10–15% target). The CPU gate needs a quiet machine.
