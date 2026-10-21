# Model brief: chochin (enemy series EN-1, the Burrow)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly, with the
**one-piece note** below, and the **glow note**. The pick is **Option A "Paper Lantern"**: `refs/sheet.png`. Build that design (ignore its
boss callout for now: the boss is a later task). `refs/current-chochin-in-game.png` is today's procedural model (size and
read only). `refs/approved-bamboo-trio-in-game.jpg` and `refs/approved-tidepool-trio-in-game.jpg` show approved Blender
enemies of earlier regions in the game (the AFTER half): match their finish.

## One-piece note
The Burrow's monsters are drawn by the hundred as **one rigid mesh each**: the game bobs, squashes, tilts and spins the
whole model about its origin, and nothing on it moves on its own. So export **a single object named `body`** with its
origin at (0, 0, 0), the ground centre (you may build it from several objects, but join them before export). It's
the friendliest, simplest kind of the series: a toy figure, solid and chunky.

## Glow note
The game gives this kind a warm self-glow on every colour with a strong red channel (red above about #c0): the
lantern paper, the tongue, the eye white and blush glow; the dark lacquer caps and the iris don't. Use the sheet's colours.

## What it is
A floating fire caster (packs of 2–6): a one-eyed haunted paper lantern that spits fireballs. The game bobs it; the
model itself hangs in the air: its bottom cap about 0.15–0.25 m above the origin.

## Size and look
About **1.25 m** from the origin to the top cap: a ribbed paper lantern (paper #ff8a4a with darker rib grooves), dark
lacquer caps top and bottom (#2c2430), one big eye (white #fff4db, iris #503023, catchlights, a lash line), the long
lolling tongue (#f46b91) out of a split in the paper, blush #e98c91.

## Variants
1. `chochin.glb`: orange #ff8a4a. 2. `chochin_pink.glb`: pink #ff6a8a.

## Budget
≤ 3500 triangles per variant.

## Done when
- Matches the sheet's front, 3/4, side and back (measured); the face reads at 45° from 16 m.
- 2 GLBs (`chochin, chochin_pink`), one `body` object each, ≤ 3500 tris, front −Y, origin at the ground centre.
