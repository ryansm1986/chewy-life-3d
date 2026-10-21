# Model brief: kitsune-bi (enemy series EN-1, the Burrow)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly, with the
**one-piece note** below, and the **glow note**. The pick is **Option A "Foxfire Drop"**: `refs/sheet.png`. Build that design (ignore its
boss callout for now: the boss is a later task). `refs/current-kitsune-bi-in-game.png` is today's procedural model (size and
read only). `refs/approved-bamboo-trio-in-game.jpg` and `refs/approved-tidepool-trio-in-game.jpg` show approved Blender
enemies of earlier regions in the game (the AFTER half): match their finish.

## One-piece note
The Burrow's monsters are drawn by the hundred as **one rigid mesh each**: the game bobs, squashes, tilts and spins the
whole model about its origin, and nothing on it moves on its own. So export **a single object named `body`** with its
origin at (0, 0, 0), the ground centre (you may build it from several objects, but join them before export). It's
the friendliest, simplest kind of the series: a toy figure, solid and chunky.

## Glow note
The game draws this kind nearly unlit (it is a flame: its colours show almost flat) with a thin ink outline (1.2 cm), so
the form must read from the colour blocks and the silhouette: the pale core/muzzle against the blue body, the dark eyes.

## What it is
A quick floating zap caster (packs of 3–8): a fox-fire wisp that darts and fires foxfire bolts. The model itself floats:
its body centre about **0.9 m** above the origin (the game bobs it).

## Size and look
The flame body about **0.6 m** tall, its top about 1.45 m above the origin: a soft teardrop flame (#7ab8ff) with a
curled tip, little fox-ear flames (accents #4f8ee0), the pale muzzle/core (#dceeff), a sweet sleepy fox face (eyes
#292b46 with catchlights), blush #e98c91, a wisp tail curling behind.

## Variants
1. `kitsune-bi.glb`: blue #7ab8ff. 2. `kitsune-bi_violet.glb`: violet #b88aff (accents and core shift with it).

## Budget
≤ 3000 triangles per variant.

## Done when
- Matches the sheet's front, 3/4, side and back (measured); the face reads at 45° from 16 m.
- 2 GLBs (`kitsune-bi, kitsune-bi_violet`), one `body` object each, ≤ 3000 tris, front −Y, origin at the ground centre.
