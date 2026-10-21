# Model brief: heikegani (enemy series EN-1, Shiokaze Tidepools)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly, plus the
**Tide Pool note** below. The owner picked **Option A "Samurai Shell"**: `refs/sheet.png`. Build that design.
`refs/current-heikegani-in-game.png` is today's procedural model (size and read only). `refs/approved-bamboo-trio-in-game.jpg`
and `refs/approved-maple-trio-in-game.jpg` show the approved Blender enemies of the first two regions in the game (the
AFTER half): match their finish.

## Tide Pool note (how this kind is animated)
This kind's parts are moved **on the GPU** (`CRAB_HOOK` in `src/regions/monsters/tidepool.js`, read-only): the game
merges your parts into one mesh and tags each part's vertices. The **claws** turn together about one fixed axle; each
**leg** is bent by the shader, weighted from 0 at its hip to 1 at its tip (the tip lifts up to 12 cm and reaches a few cm
while it walks). So: **the pivots must be identical in all three variants**, each leg is its own object with its origin
at its hip, and a leg's tip is its farthest point from the hip.

## What it is
The armoured tank of the beach region (packs of 3–6): the samurai crab. It scuttles sideways in zig-zags with its two big
claws held up in front as a shield (hits from the front clank off them), dashes sideways at you when you flank it, and
**slams**: both claws raised high, smashed down, then stuck in the sand for a moment.

## Size (Blender units = m; the game uses it at ×1.0)
- About **0.85 m** to the top of the crest, **1.10 m** wide with the legs and claws out (the sheet's numbers), the shell
  about 0.80 m wide, 0.65 m deep, its rim about 0.25–0.30 m off the ground.
- The **shell** #c4473a with the cream belly #f2d6b0 underneath; the **samurai face on the front-top of the shell** as on
  the sheet (heavy brows and the big curly moustache #2a1418, glaring eyes with #fff6e6 whites and dark pupils, a
  frown), readable from 45° above at 16 m. The golden **crescent crest** #ffc83a with the round red **mon** #e8403a at
  its base, standing on top of the shell (a chunky crescent, ≥ 6 cm thick at its thinnest). The two little **stalk eyes**
  low at the front, under the samurai face, cute and cross, with a blush.
- **Eight legs** #b2402f with dark tips #3a1c1c, chunky and segmented like the sheet, four a side, fanned fore and aft,
  never spidery.
- **Two claws** #d44a3a lacquered like gauntlets: a gold studded cuff #ffd257, dark pincer tips #3a1c1c, a real gap
  between the fingers. Held up at the front corners as on the sheet's front view.

## Parts
| name | what | pivot (origin) | how the game moves it |
|---|---|---|---|
| `body` | shell, belly, face, crest, mon, stalk eyes | (0, 0, 0) | sway roll ±0.16 rad, lean ±0.2, squash ±10 % |
| `claws` | both claws, their arms and cuffs, one object | **one shoulder axle on the X axis** where the claws meet the shell (about (0, −0.24, 0.40); choose and report) | pitch about X: rest −0.2; **−1.45** (raised high over the shell: the slam wind-up), **+0.6** (smashed down into the sand), roll ±0.07 |
| `leg_L1` … `leg_L4` | the crab's left legs (**+X** side), 1 = front … 4 = back | each leg's **hip** on the shell's side | bent by the shader: the tip lifts 0–12 cm and reaches ±4.5 cm out and ±3.5 cm fore-aft, the hip stays put |
| `leg_R1` … `leg_R4` | the right legs (**−X** side) | each leg's hip | the same |

Claw rotation signs are Blender's about the X axis with the crab facing −Y (negative = the claws' front swings up). Check
with the parts render: claws at −0.2, −1.45 and +0.6 (no gap at the shoulders, the raised claws clear the crest and the
face), and a "walking" leg check (move each leg's far end up 12 cm, weighted by distance from the hip; it must stay a
clean leg). The legs must not overlap each other or the claws.

## Variants
1. `heikegani.glb` (base): as above.
2. `heikegani_genji.glb` ("Genji", the white clan): shell #aebfd6, belly #f4f0e8, legs #8c9cb8, claws #c4d2e6, tips
   #232a4a, cuffs/studs #e8f0ff, face lines #232a5a, eye whites #ffffff, crest #e2e8f2, mon #3a5ab8.
3. `heikegani_shogun.glb` ("Shogun", black lacquer): shell #3e3548, belly #8a7a8a, legs #4a3c54, claws #352c40, tips
   #ff5a3a, cuffs/studs #ffcf4a, face lines #ffcf4a, eye whites #fff0c0, crest #ff5a3a, mon #ffcf4a. (Gold face lines
   on a dark shell: the face must still read.)

## Budget
≤ 5,000 triangles for all ten parts, per variant (the legs are the cost: low-poly, smooth).

## Done when
- Matches the sheet's front, 3/4, side and back (measured); from 45° above, the samurai face, the crest and the raised
  claws read at 16 m.
- The claw axle holds at the rotations above; the legs walk cleanly under the weighted lift.
- Three GLBs, ≤ 5k tris each, front −Y, feet on z = 0, the same pivots in all three.
