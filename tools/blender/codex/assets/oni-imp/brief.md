# Model brief: oni-imp (enemy series EN-1, the Burrow)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly, with the
**one-piece note** below. The pick is **Option A "Club Imp"**: `refs/sheet.png`. Build that design (ignore its
boss callout for now: the boss is a later task). `refs/current-oni-imp-in-game.png` is today's procedural model (size and
read only). `refs/approved-bamboo-trio-in-game.jpg` and `refs/approved-tidepool-trio-in-game.jpg` show approved Blender
enemies of earlier regions in the game (the AFTER half): match their finish.

## One-piece note
The Burrow's monsters are drawn by the hundred as **one rigid mesh each**: the game bobs, squashes, tilts and spins the
whole model about its origin, and nothing on it moves on its own. So export **a single object named `body`** with its
origin at (0, 0, 0), the ground centre (you may build it from several objects, but join them before export). It's
the friendliest, simplest kind of the series: a toy figure, solid and chunky.

## What it is
The Burrow's heavy hitter (packs of 1–4): a chubby oni that waddles and swings a big club. The club is part of the one
piece (the whole model tilts for the swing), held on its shoulder like the sheet.

## Size and look
About **1.35 m** tall to the horn tips: a round chubby oni (skin #ff6a5a), cream horns and toy fangs #ffe8b0, the
tiger-stripe loincloth (#f4c542 with dark stripes #30232b), a grumpy brave face (brows and eyes #30232b, eye whites
#fff9ef), blush #f59b98, the kanabō club (#66536b with rounded studs #b6a6bb) on its shoulder.

## Variants
1. `oni-imp.glb`: red #ff6a5a. 2. `oni-imp_blue.glb` ("Blue"): blue #5a8aff.

## Budget
≤ 4500 triangles per variant.

## Done when
- Matches the sheet's front, 3/4, side and back (measured); the face reads at 45° from 16 m.
- 2 GLBs (`oni-imp, oni-imp_blue`), one `body` object each, ≤ 4500 tris, front −Y, origin at the ground centre.
