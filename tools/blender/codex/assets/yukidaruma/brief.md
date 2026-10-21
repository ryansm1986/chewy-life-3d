# Model brief: yukidaruma (enemy series EN-1, Yukimi Onsen)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly. The pick is
**Option A "Bucket Brute"**: `refs/sheet.png`. Build that design. `refs/current-yukidaruma-in-game.png` is today's
procedural model (size and read only). `refs/approved-bamboo-trio-in-game.jpg` and `refs/approved-tidepool-trio-in-game.jpg`
show approved Blender enemies of earlier regions in the game (the AFTER half): match their finish.

## What it is
The heavy brute of the snowy hot-spring region (packs of 2–5): a two-ball snowman. It lumbers after you; from range it
**curls up into a giant rolling snowball** and bowls through you (the snowman is hidden and the separate `ball` part is
shown and spun), then pops out dizzy; up close it raises both mitten fists overhead and frost-slams. It is also the base
of a siege captain (Captain Frostbelly, the Grand variant at ×1.75 with banners on its back).

## Size (Blender units = m; the game uses it at ×1.0)
- About **1.65 m** to the top of the bucket; the bottom ball about 1.1 m across, the head about 0.72 m.
- Follow the sheet: lumpy snow (#f6faff, cool shade #c2d4ee underneath), coal eyes with sparkles under thick charcoal
  brows (#2c2934), a carrot nose, a coal-bead grin and coal buttons, blush, the tipped red bucket (#d8453a, top rim
  #b8352c, two grey bands), the green striped scarf (#44a468, stripes #fff6e4) in the neck groove with a fringed tail
  down the front, twig arms (#7a5236) and big green knitted mitten fists.
- Snow is never pure white: the game's bloom would make it glow. Keep it at the hex above.

## Parts
| name | what | pivot (origin) | how the game moves it |
|---|---|---|---|
| `body` | both snowballs, face, bucket, scarf, buttons | (0, 0, 0) | waddle roll ±0.13 rad, squash ±16 %, lean ±0.26; hidden while rolling |
| `armR` | the +X twig arm + mitten | the +X shoulder on the bottom ball, about (+0.47, −0.02, 0.78) | raises about the forward axis from 0.3 rad (rest, angled down-out) to **1.65** (fist overhead: the slam wind-up), then smashes down to about −0.45; pitches about X ±0.3 … +1.2 |
| `armL` | the −X twig arm + mitten | about (−0.47, −0.02, 0.78) | the mirror |
| `ball` | the rolled-up snowball: a big round lumpy snowball (radius **0.72**) with the striped scarf wrapped round it, a twig and a mitten poking out, a bit of the red bucket showing (the sheet's "rolling form") | **the ball's centre, (0, 0, 0.72)** | shown instead of the snowman while it rolls; scaled 0 → 1 as it curls up; spun fast about X (rolling forward) |

Raise sign: positive = the +X arm's fist goes up (rotation about the forward/Y axis); check both arms at 0.3, 1.0, 1.65
and −0.45 (no gap at the shoulders, the fists clear the head and bucket overhead), and the ball at a few spin angles.

## Variants
1. `yukidaruma.glb` (base): as above.
2. `yukidaruma_dusk.glb` ("Dusk"): blue bucket #4a6ad8 / top #3a54b0, red scarf #e8503a with cream stripes #fff2d8, red
   mittens #e8503a.
3. `yukidaruma_grand.glb` ("Grand", also Captain Frostbelly): gold bucket #e8b83a / top #c8942a, purple scarf #8a4ab8 with
   gold stripes #ffe8a0, purple mittens, whiter snow #fbf8ff with a lilac shade #cfc6ee.
The `ball` takes each variant's scarf, mitten and bucket colours.

## Budget
≤ 5,000 triangles for all four parts, per variant.

## Done when
- Matches the sheet's front, 3/4, side and back (measured); the face reads at 45° from 16 m; the ball reads as the
  same snowman rolled up.
- Three GLBs, ≤ 5k tris each, front −Y, the bottom of the body on z = 0, the same parts and pivots in all three.
