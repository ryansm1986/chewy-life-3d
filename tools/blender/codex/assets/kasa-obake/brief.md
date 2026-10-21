# Model brief: kasa-obake (enemy series EN-1, the Burrow)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly, with the
**one-piece note** below, and the **glow note**. The pick is **Option A "One-Eyed Umbrella"**: `refs/sheet.png`. Build that design (ignore its
boss callout for now: the boss is a later task). `refs/current-kasa-obake-in-game.png` is today's procedural model (size and
read only). `refs/approved-bamboo-trio-in-game.jpg` and `refs/approved-tidepool-trio-in-game.jpg` show approved Blender
enemies of earlier regions in the game (the AFTER half): match their finish.

## One-piece note
The Burrow's monsters are drawn by the hundred as **one rigid mesh each**: the game bobs, squashes, tilts and spins the
whole model about its origin, and nothing on it moves on its own. So export **a single object named `body`** with its
origin at (0, 0, 0), the ground centre (you may build it from several objects, but join them before export). It's
the friendliest, simplest kind of the series: a toy figure, solid and chunky.

## Glow note
The game lets the pink tongue light itself a little (it hangs in the canopy's shade): keep the tongue the sheet's pink
#ef719d; no other colour of that hot pink.

## What it is
A hopping charger (packs of 2–6): a one-eyed haunted paper umbrella on one leg that hops and dashes at you.

## Size and look
About **1.6 m** tall to the finial: the closed-ish pleated canopy (#8a5ad0, pleat valleys #5b3485, a cream rim band
#f5edd8 at the hem), bamboo ribs at the folds, the wooden finial and the single handle leg (#95603b) ending in a geta
sandal, one big eye (#292125 iris with catchlights, a lash line), the long lolling tongue #ef719d, blush #e98c91. The
canopy is a closed shell (no open double-sided paper): give it a thickness and an underside.

## Variants
1. `kasa-obake.glb`: purple #8a5ad0. 2. `kasa-obake_red.glb`: red #e8503a. 3. `kasa-obake_blue.glb`: blue #3a8ad0 (pleat valleys
darker of each).

## Budget
≤ 4500 triangles per variant.

## Done when
- Matches the sheet's front, 3/4, side and back (measured); the face reads at 45° from 16 m.
- 3 GLBs (`kasa-obake, kasa-obake_red, kasa-obake_blue`), one `body` object each, ≤ 4500 tris, front −Y, origin at the ground centre.
