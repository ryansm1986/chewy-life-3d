Round 2 review: **7.5/10**. The owner's eye fix works: the eyes now sit mid-face, clearly above the muzzle, and the face reads much
cuter. The amber iris gradient, the bigger paws, the lifted brim (both eyes clear from the game camera), the glasses and the fill and
band fixes are all good.

**Approved and locked**:
- the face: the eyes at z 0.46 and ±0.265, the iris, lashes, brows, blush, muzzle, nose and mouth;
- the head construction;
- the hat (the lifted brim, the cone, the glasses, the moon);
- the costume, satchel, duck, tail, limbs, paws and feet;
- the ear **envelope**: the outer x values you measured, the column top tucked under the brim, the widest point just above the
  ribbon;
- the **ribbon height at z −0.195**, following the sheet (you were right).

**Colour**: in the game's warm light her fur reads maroon (`game/game.png`). I'll grade that in the game, as I did for Rosie's hair,
so **don't change any colours**.

## 1. Ears: lumpy curl clusters, not springs (the main item)
- **What's wrong.** The columns are now the right shape, but they read as **coiled springs or stacked donut rings**: every coil is the
  same size, horizontal and evenly spaced, so the ears look ribbed, like a caterpillar or a phone cord.
- **What the sheet has**: each ear is a **loose cluster of big, irregular curl lumps**, like Rosie's hair curls. Across the column's
  width there are **2–3 lumps side by side, in staggered rows**, overlapping by about 25%.
  - **Size**: lumps vary between 0.14 and 0.24 W. They're bigger and rounder in the lower half and smaller near the brim.
  - **Variation**: each lump is tilted and offset a little differently (deterministic, from a fixed seed or a hand-written table).
  - **Grooves**: each lump carries a soft sculpted **C or spiral groove** on its outward face, like the sheet's curl lines. These are
    not bands across the column.
  - **Count**: roughly 12–16 lumps per ear above the ribbon, plus the 2–3-lump tuft below it.
- Use Rosie's curl machinery (`rosie-opus/build_rosie-opus.py`: merged clay lobes, analytic normals). Keep the same envelope, depth
  (≥ 0.24 W) and piece separation, and keep the ears clear of the brim.
- **Measure** the outer x at z 0.4 / 0.2 / 0.0 / −0.2 again, and keep them within ±0.03 W of round 2.

## 2. Ribbon ties: a soft bow, not a dumbbell
- **What's wrong.** Each tie reads as a **thick teal cylinder** wrapped round the column, with a bow that **sticks straight out
  sideways** like a handle (front view, `cmp-head.png`). Together they make dumbbell shapes at the shoulders.
- **What the sheet has**:
  - a **soft ribbon band**, about 0.06 W tall, sitting nearly flush in the curls, squeezing them a little;
  - a **bow on the front-outer side**: two rounded loops about 0.12 W each, with a small knot and two short tails hanging down
    (about 0.10 W).
  - Total bow width about 0.30 W, facing **front-outward** (about 40° from the front), so it reads from the front and the 3/4.
  - It protrudes **at most about 0.06 W** beyond the column's outer edge.
- Keep #4fc4b4 and the z −0.195 height.

## 3. Topknot: the sheet's C-curl
- With the brim lifted there's room (brows at z 0.755, the brim front at 0.928). Replace the low flat roll with a **fat C-curl lock**:
  - it comes from under the brim, rolls forward and down, and its tip curls back toward the forehead;
  - about 0.24 W wide, standing about 0.10 W proud;
  - its bottom at z ≥ 0.79;
  - a groove along the roll.
- Make it the same clay and colour as the ears. Check that it doesn't block the eyes from the 45° camera.

Rebuild every comparison, `portrait.png`, `game-45.png` and `cmp-family.png`. Report as before (with the ear outer-x table and the
visible-iris percentages), then stop. If these three land, the next step is showing the owner.
