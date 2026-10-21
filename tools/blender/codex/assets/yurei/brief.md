# Model brief: yurei (enemy series EN-1, the Haunted modifier)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly, plus the **glow note**. The pick is
**Option A "Sheet Ghost"**: `refs/sheet.png`. Build that design. `refs/current-yurei-in-game.png` is today's procedural model
(size and read only). `refs/approved-bamboo-trio-in-game.jpg` and `refs/approved-tidepool-trio-in-game.jpg` show approved
Blender enemies of earlier regions in the game (the AFTER half): match their finish.

## Glow note
The spirit flame glows by colour: a very pale cyan (green and blue both very high, like **#8af4ff** with a **#d8fcff**
core) glows. Use that only on the `flame`; keep the sheet's lavender whites (#e4e2ef) out of that range.

## What it is
A little sheet ghost that rises from fallen monsters in a Haunted dungeon run (swarms of quick fodder). It floats (the
game lifts it 0.3 m and bobs it), drifts after you and boos (rears back, then lunges with its sleeves flung up). Its
spirit flame circles it. The game scales it ×0.95.

## Size (Blender units = m; at ×0.95 in the game)
- About **0.84 m** tall; follow the sheet: the sheet #e4e2ef with shade #b0b8de and the scalloped hem #8e9cd2, big round
  eyes (#292135, white catchlights), the small "oh" mouth, cheeks #e98c91, the white brow triangle, two drooping sleeves.

## Parts
| name | what | pivot (origin) | how the game moves it |
|---|---|---|---|
| `body` | sheet, hem, face, brow triangle | (0, 0, 0): the bottom of the hem at z = 0 | bobs, leans ±0.3, scales from 0 as it rises |
| `armL` | the +X sleeve | the +X shoulder, about (+0.22, −0.06, 0.47) | about X from +0.3 to **−2.2** (flung up: the boo), splays ±0.5 |
| `armR` | the −X sleeve | about (−0.22, −0.06, 0.47) | the mirror |
| `flame` | the hitodama: a small teardrop spirit flame (about 0.14 m), with a short wispy tail | **the flame's centre** (0, 0, 0) | the game moves it in a circle round the ghost (radius 0.42 m, at 0.72 m up) and pulses it; no ink outline |

## Variants (this kind has two)
1. `yurei.glb` (base): as above.
2. `yurei_sleepy.glb` ("Sleepy"): a floppy blue nightcap with a pompom (#6a8ee0, pompom #e8eefc) and sleepy half-closed eyes.

Rotation signs are Blender's with the creature facing −Y: about X, negative = a part's lower end swings forward and up.
Check every motion above with a parts render (no gaps at the joints, nothing passing through the body).

## Budget
≤ 5,000 triangles for all parts, per variant.

## Done when
- Matches the sheet's front, 3/4, side and back (measured); the face reads at 45° from 16 m.
- 2 GLBs, ≤ 5k tris each, front −Y, feet on z = 0, the same parts and pivots in every variant.
