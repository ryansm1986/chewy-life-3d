# Model brief: mochi-slime (enemy series EN-1, the Burrow)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly, with the
**one-piece note** below. The pick is **Option A "Daifuku Drop"**: `refs/sheet.png`. Build that design (ignore its
King Mochi callout for now: the boss is a later task). `refs/current-mochi-slime-in-game.png` is today's procedural
model (size and read only). `refs/approved-bamboo-trio-in-game.jpg` and `refs/approved-tidepool-trio-in-game.jpg` show
approved Blender enemies of earlier regions in the game (the AFTER half): match their finish.

## One-piece note
The Burrow's monsters are drawn by the hundred as **one rigid mesh each**: the game bobs, squashes, tilts and spins the
whole model about its origin, and nothing on it moves on its own. So export **a single object named `body`** with its
origin at (0, 0, 0), the ground centre (you may build it from several objects, but join them before export). It's
the friendliest, simplest kind of the series: a toy figure, solid and chunky.

## What it is
The most common enemy of the game's first dungeon (packs of 6–12): a squishy rice-cake slime that bounces after you
(the game squashes it flat and stretches it tall as it bounces). The game uses it at ×1.0.

## Size and look
About **0.55 m** tall to the top of the body (plus the topping), **0.85 m** across: a soft daifuku dome (body #ffd6e4,
the lighter top #fff8f4 like the sheet's dusted top, a darker base band #efadc4 where it sits), a cute grumpy face low
on the front (eyes and mouth #292125 with white catchlights, blush #e98c91), and the topping on top: a strawberry
(#d94351) with a leaf (#73a452). Glossy-soft, like a toy daifuku.

## Variants (only the colours and the topping change)
1. `mochi-slime.glb`: pink #ffd6e4, the strawberry topping.
2. `mochi-slime_leaf.glb`: green #d8f0c0 (lighter top, darker base band to match), a sakura-mochi **leaf** wrapped over its
   top instead of the strawberry.
3. `mochi-slime_snow.glb` ("Snow Mochi"): white #fff8f4 with a cool shade #dfe8f6 at the base, a little **snow heap** with a
   snowflake on top, frosty blue blush #9ec4ee.

## Budget
≤ 3,000 triangles per variant.

## Done when
- Matches the sheet's front, 3/4, side and back (measured); the face reads at 45° from 16 m.
- 3 GLBs (`mochi-slime, mochi-slime_leaf, mochi-slime_snow`), one `body` object each, ≤ 3,000 tris, front −Y, origin at
  the ground centre.
