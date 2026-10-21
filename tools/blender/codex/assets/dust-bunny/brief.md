# Model brief: dust-bunny (enemy series EN-1, the Burrow)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly, with the
**one-piece note** below. The pick is **Option A "Fluff Ball"**: `refs/sheet.png`. Build that design (ignore its
boss callout for now: the boss is a later task). `refs/current-dust-bunny-in-game.png` is today's procedural model (size and
read only). `refs/approved-bamboo-trio-in-game.jpg` and `refs/approved-tidepool-trio-in-game.jpg` show approved Blender
enemies of earlier regions in the game (the AFTER half): match their finish.

## One-piece note
The Burrow's monsters are drawn by the hundred as **one rigid mesh each**: the game bobs, squashes, tilts and spins the
whole model about its origin, and nothing on it moves on its own. So export **a single object named `body`** with its
origin at (0, 0, 0), the ground centre (you may build it from several objects, but join them before export). It's
the friendliest, simplest kind of the series: a toy figure, solid and chunky.

## What it is
Fast fodder (packs of 8–16) that scurries in swarms and nips. The game uses it at ×1.0.

## Size and look
About **0.65 m** tall to the ear tips, a round ball of chunky soft puffs (fur #d0c8dc, the recesses between puffs
#aaa0b8, inner ears #eee7f2), two big bunny ears of fluff, big eyes (#292125 with white catchlights) peeking out, a tiny
nose #786375, blush #e98c91. The puffs are chunky rounded lumps (≥ 6 cm), never strands.

## Variants
1. `dust-bunny.glb`: lavender grey #d0c8dc. 2. `dust-bunny_blue.glb`: blue grey #c4ccd8. 3. `dust-bunny_warm.glb`: warm grey
#dccabc (recesses and inner ears shift with them).

## Budget
≤ 3500 triangles per variant.

## Done when
- Matches the sheet's front, 3/4, side and back (measured); the face reads at 45° from 16 m.
- 3 GLBs (`dust-bunny, dust-bunny_blue, dust-bunny_warm`), one `body` object each, ≤ 3500 tris, front −Y, origin at the ground centre.
