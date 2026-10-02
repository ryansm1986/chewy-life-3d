# Rig review: approved, with one fix (the happy squint)

The rig is in the game. The export loads, the companion and portrait use it, and the director checked it there:
- **rest**, with the lids hidden;
- **blink**, which closes fully at 1.22;
- **walk**;
- **sit**: it reads right, with the front legs planted and the chest up;
- **bark / pant** with the tongue, which is cute.

The game also grades the dark fur in the atlas on its side (the purple cast), so **don't change any colours**.

**Approved and locked**: everything except the item below. Keep the bones, the weights, the mouth, the blink and the rest look.

## The one fix: the happy squint reads sad
- **My brief had the wrong number.** The game drives the upper lids at **0.4 × 1.22 = +0.488 X** for the happy squint, not +0.4.
  The lower lids stay at **−0.24 X** (and −0.10 otherwise). Please re-test at these exact values. My in-game shot is
  `D:/projects/chewy-life-3d/tools/blender/work/codex/shadow-face/lids.png`, the "happy" tile.
- **What's wrong there**:
  - the upper lid's edge **slopes down toward the outer corners** and covers almost half the eye, so he looks sleepy or sad
    (heavy-lidded puppy-dog eyes);
  - the lower lid barely shows;
  - a white sliver shows at the outer corner (your known issue 3).
- **What happy should look like**: bright **crescent eyes**, the look of a dog grinning while you scratch his ears:
  - **Upper lid at +0.488**: covers the **top ~25–30%** of the opening. Its edge is **level or slightly higher at the outer corner**,
    a gentle convex-down arc, **never** sloping down toward the outside.
  - **Lower lid at −0.24**: rises to cover the **bottom ~30–35%** with a clearly **upward-arched** (convex-up) top edge carrying
    the dark lash line. The visible eye then becomes a smiling crescent, iris and catchlight still showing in the middle band.
  - It must read this way from the **front and both 45° game yaws**, which matter most, and from the 3/4. No white slivers at
    the corners.
- **How**:
  - Reshape and refit the lid shells' edges and their fitting targets for these two poses, and move the lid pivots if you need to.
  - Keep the hard constraints you already meet: hidden at rest (0 / −0.10), fully closed at +1.22 (a ∪ lash curve), no
    poke-through.
  - If the lower lid can't cover that much on a −0.14 step from neutral, a longer arm or a different pivot is fine.
- **Re-render**:
  - `preview/face.png` with: rest; blink; **happy (+0.488 / −0.24)**; jaw 0.42; jaw 0.42 + happy;
  - add a **happy close-up row** at the front and both game yaws.
  Look at each one, then re-export (same command, no warnings) and report the `HERO_EXPORT` line.

Also confirm `public/models/shadow-toy.glb` is still untouched, then stop.
