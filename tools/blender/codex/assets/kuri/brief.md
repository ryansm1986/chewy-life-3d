# Model brief: kuri (enemy series EN-1, Momiji Hollow)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly, **except the
body pivot (below)**. The owner picked **Option A "Spiky Bruiser"**: `refs/sheet.png`. Build that design.
`refs/current-kuri-in-game.png` is today's procedural model (size and read only). `refs/approved-bamboo-trio-in-game.png`
shows the first region's approved Blender enemies in the game: match their finish.

## What it is
The common melee enemy of the autumn maple region (packs of 8–16): a feisty chestnut. It hops with its spiky burr open
behind its face like a collar; it **curls up** (the two burr halves swing shut round the nut into a spiky ball) and
**rolls** at you, the whole ball spinning; then it uncurls dizzy and snaps.

## Size (Blender units = m; the game scales the whole model ×0.9)
- The **ball**: when shut, a sphere of **radius 0.44 m** centred **0.46 m** above the ground.
- The **nut**: an onion/chestnut shape (#9a4c22 glossy, a pale cream base patch #f0dcb0 on the bottom third, a small
  pointed tip on top), about 0.62 m wide and 0.86 m tall, fitting inside the shut burr; the face on its front (eyes about
  0.42 m up, each ≈ 0.12 m tall; the angry brows; a tiny white fang in a smirk; blush). Two stubby cream nub hands at the
  sides and two dark little feet (#6a3418) under it at the ground.
- The **burr halves**: two hemispherical shells (outside #8cc43e, slightly darker underneath; inside the cream lining
  #f4e6c0), radius 0.44, ≈ 4 cm thick, with **≈ 20–26 chunky toy spikes per half** (rounded cones ≈ 9–12 cm long,
  ≈ 7 cm at the base, tips #eef6a8 like the sheet). Each half is hinged on a **vertical axis at the back** of the ball.

## Parts
| name | what | pivot (origin) | how the game moves it |
|---|---|---|---|
| `body` | nut, face, hands, feet | **the ball centre (0, 0, 0.46)** (not the ground: the whole ball rolls about it) | the roll spins it about the X axis (forward roll, fast); hops 0.12 m; squash ±12 %; lean ±0.28 rad |
| `br` | the half on the **+X** side | the hinge: **(0, +0.40, 0.46)** (the back of the ball) | rotates about Z (vertical): 0 = shut (a closed ball), **+0.5 rad** = open like the sheet, up to +0.9 rad when dizzy |
| `bl` | the half on the **−X** side | the same hinge (0, +0.40, 0.46) | the mirror: **−0.5 rad** to open, −0.9 dizzy |

At rotation 0 the two halves meet at the front seam and close the ball (as the sheet's "closed ball" callout); model
them **shut** and the game opens them. Check both: shut (0) and open (±0.5 and ±0.9).

## Variants
1. `kuri.glb` (base): burr #8cc43e / tips #eef6a8, nut #9a4c22, lining #f4e6c0.
2. `kuri_roasted.glb` ("Roasted", fire): burr #6a4428 with **glowing orange tips #ffae3a** (put the tips on the `glow`
   material), nut #6a3216, lining #b88a58.
3. `kuri_momiji.glb` ("Momiji"): burr #c2d45a with red-orange tips #ff6a3a, nut #a85a2a, plus one chunky red maple leaf
   (#e8482e) stuck on top of the nut (in `body`).

## Budget
≤ 5,000 triangles for all three parts, per variant (the spikes are the cost: keep them low-poly but round-tipped).

## Done when
- Open: matches the sheet's front, 3/4, side and back (measured); shut: a clean spiky ball with a neat seam.
- From the 45° game camera the face reads inside the open collar; the shut ball reads as a spiky chestnut burr.
- The hinge rotations open no gaps or interpenetrations with the nut; the roll about the body pivot looks right.
- Three GLBs, ≤ 5k tris each, front −Y, feet on z = 0 at rest.
