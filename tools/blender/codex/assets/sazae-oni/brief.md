# Model brief: sazae-oni (enemy series EN-1, Tide Caves)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly, plus the **glow note**. The pick is
**Option A "Turban Oni"**: `refs/sheet.png`. Build that design. `refs/current-sazae-oni-in-game.png` is today's procedural model
(size and read only). `refs/approved-bamboo-trio-in-game.jpg` and `refs/approved-tidepool-trio-in-game.jpg` show approved
Blender enemies of earlier regions in the game (the AFTER half): match their finish.

## Glow note
Only the Hotaru variant glows, by colour: a pale cyan (high blue, red below about #e0, like **#bff4ff**) glows. Use it for
the plankton spots (and the spine tips if you like); keep every other colour of that variant out of that range.

## What it is
The slow armoured tank of the dungeon under the Tidepools (packs of 1–2): a turban snail grown into an oni. It sits shut
in its shell (the lid closed) like a plain shell until you come close, then pops its head out and glides after you; it
shuts itself in to fire its spines in a star, or to **spin like a top** (the whole body spins about the vertical), then
lolls out dizzy. The game scales it ×1.2.

## Size (Blender units = m; at ×1.2 in the game)
- About **0.96 m** tall (≈ 1.15 m in the game), the spiral shell about 0.85 m long; follow the sheet: shell #5e7a66 with
  the cream band #c8c09a, spines #6e8270 with cream tips #ece4cc (chunky, round-tipped), the snail foot #8a7e72 with
  the frill edge #c8a898, the oni face #e8705e with ivory horns #f6eedc and the seaweed tuft #4a8a4a, the lid #d8c4a4.

## Parts
| name | what | pivot (origin) | how the game moves it |
|---|---|---|---|
| `body` | the shell (without its spines) and the snail foot | (0, 0, 0) | spins about Z (the top spin), squash ±9 %, wobble |
| `spines` | all the shell's spines, one object, sitting on the shell | (0, 0, 0) | scaled ×1.12 (bristle), jittered ±0.04 about Z |
| `head` | the oni face, horns, hair tuft and the stubby arms | **inside the shell's mouth**, about (0, −0.32, 0.30) | scaled from 0.12 (pulled in: hidden in the mouth) to 1 (popped out), rolls ±0.3 about the forward axis when dizzy. At scale 0.12 it must be hidden inside the shell |
| `lid` | the operculum, closing the shell's mouth | (0, 0, 0) | shown while it is shut in |

## Variants
1. `sazae-oni.glb` (base): as above.
2. `sazae-oni_hotaru.glb` ("Hotaru"): shell #34548a, band #7ab8d8, spines #4a64a0 with tips #bff4ff, skin #6aa0d8, horns #f8f2e4,
   hair #3a8a8a, foot #6a7288 / #a8b8d8, lid #c8d0e0, glowing plankton spots #bff4ff on the shell.
3. `sazae-oni_elder.glb` ("Elder"): shell #7a6a80, band #d8c8d4, spines #887a8a / #f2eaee, skin #7ab070, horns #ece4cc,
   hair #5a8a3a, foot #7a7268 / #b8aaa0, lid #d4c8b8, barnacles and hanging weed on the shell, a white beard.

Rotation signs are Blender's with the creature facing −Y: about X, negative = a part's lower end swings forward and up.
Check every motion above with a parts render (no gaps at the joints, nothing passing through the body).

## Budget
≤ 5,000 triangles for all parts, per variant.

## Done when
- Matches the sheet's front, 3/4, side and back (measured); the face reads at 45° from 16 m.
- 3 GLBs, ≤ 5k tris each, front −Y, feet on z = 0, the same parts and pivots in every variant.
