# Model brief: kinoko (enemy series EN-1, the Burrow)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly, with the
**one-piece note** below. The pick is **Option A "Toadstool Tot"**: `refs/sheet.png`. Build that design (ignore its
boss callout for now: the boss is a later task). `refs/current-kinoko-in-game.png` is today's procedural model (size and
read only). `refs/approved-bamboo-trio-in-game.jpg` and `refs/approved-tidepool-trio-in-game.jpg` show approved Blender
enemies of earlier regions in the game (the AFTER half): match their finish.

## One-piece note
The Burrow's monsters are drawn by the hundred as **one rigid mesh each**: the game bobs, squashes, tilts and spins the
whole model about its origin, and nothing on it moves on its own. So export **a single object named `body`** with its
origin at (0, 0, 0), the ground centre (you may build it from several objects, but join them before export). It's
the friendliest, simplest kind of the series: a toy figure, solid and chunky.

## What it is
A slow spore-caster (packs of 2–6): it waddles, then puffs a cloud of spores round itself. The game scales it ×0.8.

## Size and look (Blender units = m; at ×0.8 in the game)
About **0.75 m** tall (≈ 0.6 m in the game): a big round spotted cap (#ff5a5a with cream spots #fff7e8, the underside
#e4ceb0) over a short pale stem body (#f6ecd8) with the face under the cap's rim (eyes #292125 with a warm-brown lower
iris #654126 and catchlights, blush #e98c91), tiny feet. The face must show from 45° above: keep it low enough under the
cap's rim and the rim short enough at the front.

## Variants
1. `kinoko.glb`: red #ff5a5a. 2. `kinoko_dream.glb` ("Dream"): purple #8a6aff with pale lilac spots. 3. `kinoko_orange.glb`:
orange #ffae3a with cream spots.

## Budget
≤ 4000 triangles per variant.

## Done when
- Matches the sheet's front, 3/4, side and back (measured); the face reads at 45° from 16 m.
- 3 GLBs (`kinoko, kinoko_dream, kinoko_orange`), one `body` object each, ≤ 4000 tris, front −Y, origin at the ground centre.
