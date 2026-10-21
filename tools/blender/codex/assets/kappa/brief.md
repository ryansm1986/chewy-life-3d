# Model brief: kappa (enemy series EN-1, Shiokaze Tidepools)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly, plus the
**Tide Pool note** below. The owner picked **Option A "Pond Rascal"**: `refs/sheet.png`. Build that design.
`refs/current-kappa-in-game.png` is today's procedural model (size and read only). `refs/approved-bamboo-trio-in-game.jpg`
and `refs/approved-maple-trio-in-game.jpg` show the approved Blender enemies of the first two regions in the game (the
AFTER half): match their finish.

## Tide Pool note (how this kind is animated)
This kind's parts are moved **on the GPU** (`KAPPA_HOOK` in `src/regions/monsters/tidepool.js`, read-only): the game
merges your parts into one mesh and tags each part's vertices, then the vertex shader turns the head and the arms about
**fixed pivots** and shrinks the dish water. For you that changes nothing, except: **the pivots must be identical in all
three variants** (one shader serves them all), and the parts are exactly the four below.

## What it is
The common melee enemy of the beach region (packs of 6–12): a chubby river imp. It waddles, does a **lunging grab** (both
arms shoot forward together, it hugs you, then splashes you off), and a **head-flick splash** (it tips its head back,
then flicks it forward so the water in its dish sloshes out). **The dish water is its strength**: the level drops as it
is hurt; when low it runs to water and sits in it to refill.

## Size (Blender units = m; the game scales the whole model ×1.12, so build it about 0.9 m tall)
- Overall about **0.90 m** to the dish rim, about 0.62 m wide across the hands.
- Head: a big round head about 0.54 m wide, its lower edge about 0.55 m up, a short visible neck joint (the sheet's dark
  ring) at about **0.56 m**. Face per the sheet: big dark eyes with catchlights and cross brows, the yellow duck beak
  #ffc53a, blush. The **dish** (#f6f1e2, a thick rounded rim) on top, about 0.30–0.32 m across, with the water
  #5fe0ee inside it (the `water` part), ringed by the dark-green hair #2e5a3a in chunky rounded lobes (a thick volume,
  not cards); the forehead clear.
- Body: torso #6ec452 with the cream belly #f6e6a0; the shell on its back (#4e7a3c, lighter scutes #94b858, cream rim
  #e6d69c) as on the sheet's back view; stubby legs with webbed paddle feet #a8d86a on z = 0.
- Arms: from shoulders at about 0.45 m, hanging slightly forward and away from the body as on the sheet, three-fingered
  webbed hands #a8d86a.

## Parts
| name | what | pivot (origin) | how the game moves it |
|---|---|---|---|
| `body` | torso, belly, shell, legs, feet | (0, 0, 0) | waddle roll ±0.14 rad, lean forward up to +0.55 rad (lunge) and +1.15 (stumble), squash ±12 % |
| `head` | head, face, beak, dish, hair | **the neck joint** ≈ (0, ~0, 0.56) | pitch about X from **−0.75** (tipped back) to **+0.85** (flicked forward, the splash), roll ±0.15 |
| `arms` | both arms and hands, one object | **the shoulder axle** ≈ (0, ~0, 0.445) on the X axis | pitch about X: rest −0.15; **−1.55** (straight forward: the grab), **−2.5** (overhead: the flee), +0.9 (back); roll ±0.4 |
| `water` | the flat water disc in the dish (and its glint) | **the centre of the water surface** | turns with the head; the game shrinks it toward its centre (down to ~12 % across) and sinks it ~2 cm as the kappa is hurt |

Rotation signs are Blender's about the X axis with the creature facing −Y (negative = the part's lower end swings
forward, toward −Y). Check with the parts render: head at −0.75 / +0.85, arms at −1.55 / −2.5 / +0.9, and the water
scaled to 30 % and 12 %. The water sits on the dish floor, a little below the rim, and must never poke through the dish
when shrunk or turned; when shrunk to 12 % the dish floor (pale #dcecee) shows round it.

## Variants
1. `kappa.glb` (base): as above.
2. `kappa_umi.glb` ("Umi", sea): skin #5ab8c4, belly #f0f4e0, shell #35598a / scutes #6c9cc8 / rim #ece2c8, beak #ffb14a,
   hands/feet #8ad8e0, hair #1f3f66, dish #fff8ee, water #a8f4ff, plus a little chunky orange **starfish** (#ff8a4a,
   centre #ffa25a) on its shell (in `body`).
3. `kappa_kyuri.glb` ("Kyuri", cucumber): skin #a2cc48, belly #fff0b8, shell #7a6434 / scutes #bca060 / rim #f2e2aa,
   beak #ffd24a, hands/feet #c8e070, hair #5a4428, water #62e6d8, plus a chunky **cucumber** (#3e8a2a with pale stripes
   #6ab83a, a yellow flower nub at one end) held in its right hand (−X side; in `arms`, so it swings with them).

## Budget
≤ 5,000 triangles for all four parts, per variant.

## Done when
- Matches the sheet's front, 3/4, side and back (measured); the dish reads as a big open bowl of water from 45° above.
- The neck and shoulder joints hold at the rotations above: no gaps, the hair and dish clear the shell when the head tips
  back, the arms clear the belly when straight forward.
- Three GLBs, ≤ 5k tris each, front −Y, feet on z = 0, the same pivots in all three.
