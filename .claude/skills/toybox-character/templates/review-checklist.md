# Director's review checklist (every model round)

Score out of 10 against the approved sheet. Ship at 9.

## Build the evidence (don't judge from the builder's own renders alone)
- [ ] `report.md` and `preview/stats.json`: triangles, size, warnings, one atlas.
- [ ] Same-scale comparisons (`scripts/compare.py`): head front, head 3/4, side, back and eyes-only, with the sheet on the
      left and the render on the right, at equal head heights.
- [ ] In the game: `/?test=glb&url=/models/<id>-toy.glb&dist=5`, and the same with `&yaw=-0.8`, next to the current
      Chewy for scale and style.
- [ ] Play distance: `&dist=14`. Does the silhouette read, and do the signature colours?
- [ ] `portrait.png` at full resolution: appeal and surface quality (no crumples, dents or faceting).

## Check, in this order
1. **Silhouette and proportions**: head W : H, head-to-body ratio, limb chubbiness, feet, total height.
2. **Face**:
   - eye placement, size and height-to-width ratio;
   - iris and pupil proportions, white crescents, lash weight;
   - nose size, mouth width and height, chin or cheek shapes;
   - brows.
   - **Side view**: the head is a ball and the face wraps round it. The profile from forehead to cheek to chin is one
     convex arc, and only the nose pokes out. The eyes face about 30° outward on the ball's surface and are set back from
     the front, and the far eye is hidden. A flat face plate with forward-facing eyes reads as a mask pointing sideways
     in profile, and it's also why a far eye sticks out in 3/4. (The owner caught this on Rosie, round 8.)
3. **Signature masses**: hair, ears, tail and hat. Are they volumes, not cards? Check them from both 45° yaws, since thin
   edge-on parts read as spikes or horns.
4. **Costume**: every piece is where the sheet has it, with the right lengths (hems below the sash, and so on) and
   chunky, rounded forms.
5. **Colour**: palette against the sheet under studio light, then in the game. A warm-grade maroon shift gets fixed
   later with a runtime `tint`, not a repaint.
6. **Finish**: smooth surfaces and crisp colour borders. Painted patches with rounded shapes, never rectangles (a chin
   patch with square corners reads as teeth).

## Writing the feedback
- Start with what's **approved and locked**.
- Give numbered fixes in priority order, each as a measured target (fractions of W and H, px on the comparison image,
  hex colours).
- For every change, say **what stays fixed** (e.g. "the top edge moves down; the bottom stays where it is").
- Attach the comparison crops and the in-game screenshot.
- Don't give prose-only directions like "make it rounder" or "a real muzzle".
