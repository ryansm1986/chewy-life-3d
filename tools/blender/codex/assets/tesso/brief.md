# Model brief: tesso (enemy series EN-1, Maple Roots)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly. The pick is
**Option A "Iron-Tooth Rat"**: `refs/sheet.png`. Build that design. `refs/current-tesso-in-game.png` is today's procedural model
(size and read only). `refs/approved-bamboo-trio-in-game.jpg` and `refs/approved-tidepool-trio-in-game.jpg` show approved
Blender enemies of earlier regions in the game (the AFTER half): match their finish.

## What it is
The burrowing tank of the dungeon under Momiji Hollow (packs of 1–3): the iron-rat yōkai. It digs into the earth (the
body tips forward and sinks below the floor) and a **dirt mound** races after you under the floor, then it bursts up out
of it; up close it rears back and gnaws with its iron buck teeth. The game scales it ×1.15.

## Size (Blender units = m; at ×1.15 in the game)
- About **0.87 m** tall to the tops of the ears, sat on its haunches; follow the sheet: fur #7c808e / light #a8aebc,
  belly #dcd4cc, ear insides, nose and blush #f2a0aa, the long curling tail #d8a8a8, two big iron teeth (steel grey with
  a highlight), the juzu of beads #6a4030 with a red tassel #d8402e, whiskers as thick short soft spikes (≥ 1.5 cm).

## Parts
| name | what | pivot (origin) | how the game moves it |
|---|---|---|---|
| `body` | torso, haunches, feet, tail, juzu | (0, 0, 0) | leans ±0.75 rad (tips forward to dig), sinks 0.62 m (into the floor), squash ±18 % |
| `head` | head, ears, face, teeth, whiskers | the neck, about (0, −0.05, 0.50) | pitch ±0.4, turn ±0.35 about Z, roll ±0.3 (the gnaw flurry chatters it fast) |
| `paws` | both front paws, one object | the chest, about (0, −0.21, 0.44) | about X from +0.3 to **−1.4** (paws raised high, the gnaw wind-up); scrabble fast while digging |
| `mound` | the dirt mound: a low lumpy mound of earth (#7a5a38) with a few maple leaves (#ec7a30, #f2c040) and clods, about 0.9 m across and 0.3 m high | the ground centre (0, 0, 0) | shown while it tunnels; scaled 0 → 1.2 and wobbled ±22 % per axis |

## Variants
1. `tesso.glb` (base): as above.
2. `tesso_sutra.glb` ("Sutra"): fur #8a6e5c / #b89c86, belly #ecdcc8, beads #3e2a20, tassel #e8a03a, a gnawed sutra scroll
   held in its paws (in `paws`).
3. `tesso_elder.glb` ("Elder", the monk Raigō): fur #cfc8c4 / #f4f0ec, belly #fffaf4, beads #7a4a2e, tassel #d8302e, a
   saffron kesa sash (#e8a02a) across the chest, bushy white brows, a bigger juzu.

Rotation signs are Blender's with the creature facing −Y: about X, negative = a part's lower end swings forward and up.
Check every motion above with a parts render (no gaps at the joints, nothing passing through the body).

## Budget
≤ 5,000 triangles for all parts, per variant.

## Done when
- Matches the sheet's front, 3/4, side and back (measured); the face reads at 45° from 16 m.
- 3 GLBs, ≤ 5k tris each, front −Y, feet on z = 0, the same parts and pivots in every variant.
