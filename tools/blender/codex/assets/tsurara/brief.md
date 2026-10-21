# Model brief: tsurara (enemy series EN-1, Yukimi Onsen)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly, plus the **glow
note** below. The pick is **Option A "Icicle Wisp"**: `refs/sheet.png`. Build that design.
`refs/current-tsurara-in-game.png` is today's procedural model (size and read only). `refs/approved-bamboo-trio-in-game.jpg`
and `refs/approved-tidepool-trio-in-game.jpg` show approved Blender enemies of earlier regions in the game (the AFTER
half): match their finish.

## Glow note
The game makes this kind glow by **colour**: any face whose colour is a clear cyan (like the eyes #7ae6ff and the
crystals #9fe6ff: low red, high green and blue) glows, and the body gets a cool fresnel rim. So use the hex values below
exactly, keep cyan only on the eyes, the crystals and the icicle tips, and keep the body's whites and pale blues out of
the cyan range (they must not glow). No `glow` material is needed for this kind.

## What it is
The caster of the snowy hot-spring region (packs of 3–6): an icicle wraith that floats (the game lifts it 0.42 m and
bobs it), blinks around the fight (it shrinks to nothing, spinning, and pops back elsewhere) and raises its stubby arms
to call icicle rain. The game scales it ×1.15.

## Size (Blender units = m; at ×1.15 in the game)
- About **0.92 m** from the bottom of the body to the top of the crown (so ≈ 1.05 m in the game), the round head about
  0.56 m across; the body tapers to a curling wisp tail.
- Follow the sheet: body #e6f6ff with shade #a6d8f6, big glowing eyes #7ae6ff (dark pupils #183a60, white catchlights),
  a small "o" mouth, blush #f2b8d2; the icicle hair hanging round the back and sides (chunky rounded icicles, #9fe6ff to
  white tips) and the little crystal crown; two stubby icicle arms.

## Parts
| name | what | pivot (origin) | how the game moves it |
|---|---|---|---|
| `body` | head, face, body down to the tail root | (0, 0, 0): the bottom of the body at z = 0 | bobs ±7 cm, leans ±0.22 rad, rolls ±0.06; spins about Z and scales to 0 for the blink |
| `crown` | the crystal crown + the icicle hair, one object | the crown of the head, about (0, 0, 0.72) | jitters ±0.03–0.07 rad about X and Y when it casts |
| `arms` | both stubby arms, one object | the shoulder line, about (0, −0.02, 0.44) | pitches about X: rest ±0.12; **−2.3** = raised overhead (the cast) |
| `tail` | the curling wisp tail | its root at the bottom of the body, about (0, 0, 0.01) | sways: ±0.22 rad about X, ±0.45 about Z |

Check with a parts render: arms at 0 and −2.3 (no gap, they clear the face and crown overhead), the tail at its sway
extremes (no gap at its root), and the crown jitter.

## Variants
1. `tsurara.glb` (base): as above.
2. `tsurara_aurora.glb` ("Aurora"): body #e8fff4 / #9ee0d0, crystals violet #c8a8ff, eyes mint #7affd8, blush #d8b8ff.
3. `tsurara_blackice.glb` ("Black-ice"): body #5a6ca8 / #2a3464, crystals #7ad8ff, eyes #6ef6ff, rim #0e1430, blush #7a9ae8.

## Budget
≤ 5,000 triangles for all four parts, per variant.

## Done when
- Matches the sheet's front, 3/4, side and back (measured); the eyes and crown read at 45° from 16 m.
- Three GLBs, ≤ 5k tris each, front −Y, the same parts and pivots in all three.
