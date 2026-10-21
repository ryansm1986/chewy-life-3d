# Model brief: yukiwarashi (enemy series EN-1, Yukimi Onsen)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly. The pick is
**Option A "Straw Snow Child"**: `refs/sheet.png`. Build that design. `refs/current-yukiwarashi-in-game.png` is today's
procedural model (size and read only). `refs/approved-bamboo-trio-in-game.jpg` and `refs/approved-tidepool-trio-in-game.jpg`
show approved Blender enemies of earlier regions in the game (the AFTER half): match their finish.

## What it is
The common ranged enemy of the snowy hot-spring region (packs of 6–12): a snow child in a straw mino raincoat. It keeps
its distance and lobs volleys of snowballs (both arms swing up overhead with a snowball in each mitten, then it throws
them one by one), hops back when crowded, and scoops up snow for more.

## Size (Blender units = m; the game uses it at ×1.0)
- About **1.05 m** to the top of the snow heap on the hat; the mino bell about 0.6 m across at the hem.
- Follow the sheet: the round face with the dark okappa bob and blunt fringe (#2c2436), the little straw kasa tipped back
  with its snow heap, the red knitted scarf (#e8403c), the three-tier straw mino with a zig-zag fringe (straw #d8b262,
  dark #9a7434, light #f0d890, the inside #6a4c26), boots #b88a4c peeking out under the hem.
- The face must read from 45° above at 16 m (the kasa is tipped back so it doesn't hide the eyes).

## Parts
| name | what | pivot (origin) | how the game moves it |
|---|---|---|---|
| `body` | mino, head, hair, kasa + snow, scarf, boots | (0, 0, 0) | hops 0.34 m, squash ±18 %, lean ±0.3 rad, roll ±0.1 |
| `face` | the face features only (eyes, brows, nose, mouth, blush) | (0, 0, 0) | moves with `body`; the game draws it with a **thinner ink outline** (6 mm) and no shadow, so keep every face feature in this object, sitting on the head's surface |
| `armR` | the +X sleeve + cuff + mitten | the +X shoulder, about (+0.17, −0.06, 0.47) | swings about X from −0.4 (rest, hanging a little forward) to **−2.55** (straight up overhead: the volley); splays out to the side up to ±0.27 (about the forward axis) |
| `armL` | the −X sleeve + cuff + mitten | the −X shoulder, about (−0.17, −0.06, 0.47) | the mirror |
| `ballR` | a snowball (radius ≈ 0.08) held in the +X mitten | the ball's centre, inside the mitten's palm | hung on `armR` (moves with it); the game scales it 0 → 1 when it packs a snowball and back to 0 after the throw |
| `ballL` | the same in the −X mitten | the ball's centre | hung on `armL` |

Rotation signs are Blender's about X with the creature facing −Y (negative = the arm's lower end swings forward and up).
Check with a parts render: both arms at −0.4, −1.3 and −2.55 (no gap at the shoulders, the mittens clear the kasa and the
head overhead), the balls at scale 0 and 1 (sitting in the mittens' palms, visible from the front when the arms are up).

## Variants
1. `yukiwarashi.glb` (base): as above.
2. `yukiwarashi_snowdrift.glb` ("Snowdrift"): paler straw #cdb888 / #8c7a5a / #ece0c0, inside #5a4a36, hair #3a2c2a (a
   lighter #8a7a9a sheen), pink mittens #ff6a98, blue scarf #4a86e8, boots #9a7a5a, frost on the mino's shoulders and a
   bigger snow heap on the hat.
3. `yukiwarashi_camellia.glb` ("Camellia"): straw #c89a52 / #86602c / #e8c880, inside #5a3e22, hair #1e1a2a, mittens
   #d8303a, purple scarf #8a4ab8, boots #a8743c, plus a red camellia flower (yellow centre) tucked in the hat.

## Budget
≤ 5,000 triangles for all six parts, per variant (the mino fringe is the cost: chunky zig-zags, not strands).

## Done when
- Matches the sheet's front, 3/4, side and back (measured); the face reads at 45° from 16 m.
- The arms and balls work at the poses above; three GLBs, ≤ 5k tris each, front −Y, feet on z = 0, the same parts and
  pivots in all three.
