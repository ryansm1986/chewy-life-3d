# Model brief: iwabozu (enemy series EN-1, Bamboo Depths)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly, plus the **glow note**. The pick is
**Option A "Mossy Monk"**: `refs/sheet.png`. Build that design. `refs/current-iwabozu-in-game.png` is today's procedural model
(size and read only). `refs/approved-bamboo-trio-in-game.jpg` and `refs/approved-tidepool-trio-in-game.jpg` show approved
Blender enemies of earlier regions in the game (the AFTER half): match their finish.

## Glow note
Only the Lantern variant glows, by colour: a warm bright yellow (red and green high, blue low, like **#ffd27a**) glows.
Use that colour only for the lantern's light (the window of the little stone lantern); nothing else that bright and warm.

## What it is
The slow armoured tank of the dungeon under the Bamboo Grove (packs of 1–2): a sleepy rock monk. It dozes like a plain
boulder (eyelids shut) until you come close, wakes with a hop, trundles after you, slams with both arms overhead, or
tucks its arms in and **rolls** along a lane (the whole body tumbles about its centre). The game scales it ×1.25.

## Size (Blender units = m; at ×1.25 in the game)
- About **0.96 m** tall to the tips of the shoots (≈ 1.2 m in the game); the boulder about 0.88 m across, its centre
  about **0.44 m** up (the roll turns about that point, so keep the boulder round).
- Follow the sheet: stone #a0968a / light #cbbfae / underside and feet #6e665c, the moss cap #6a9a3c / light #a6c860 with
  two little takenoko shoots (#c7a15a), the straw shimenawa rope with white shide, the kind sleepy face (eyes #292125).

## Parts
| name | what | pivot (origin) | how the game moves it |
|---|---|---|---|
| `body` | boulder, face (open eyes), moss cap, shoots, rope, feet | (0, 0, 0) | squash ±16 %, lean, and the **roll**: spun about X round the boulder's centre |
| `lids` | the closed eyelids (the sheet's "asleep" face), sitting over the open eyes | (0, 0, 0) | shown only while it sleeps (no ink outline is drawn on it) |
| `armL` | the +X stone arm | the +X shoulder, about (+0.42, −0.06, 0.50) | about X from +0.5 (resting) to **−2.6** (overhead: the slam), splays ±0.6 about the forward axis; scaled to 0.3 while rolling |
| `armR` | the −X stone arm | about (−0.42, −0.06, 0.50) | the mirror |

## Variants
1. `iwabozu.glb` (base): as above.
2. `iwabozu_lantern.glb` ("Lantern"): stone #a89c8e / #d2c6b2, moss #729e42 / #b0cc68, feet #766c60, a little stone lantern in
   the moss cap with a glowing window (#ffd27a).
3. `iwabozu_elder.glb` ("Elder"): stone #968e86 / #c4bab0, moss #5a8a3a / #98c05c, feet #665e56, a long white lichen beard
   (#f0efe6) and a bigger moss cap.

Rotation signs are Blender's with the creature facing −Y: about X, negative = a part's lower end swings forward and up.
Check every motion above with a parts render (no gaps at the joints, nothing passing through the body).

## Budget
≤ 5,000 triangles for all parts, per variant.

## Done when
- Matches the sheet's front, 3/4, side and back (measured); the face reads at 45° from 16 m.
- 3 GLBs, ≤ 5k tris each, front −Y, feet on z = 0, the same parts and pivots in every variant.
