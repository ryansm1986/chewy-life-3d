# Kamaitachi, feedback round 1 → 2

Thanks: a solid technical base (budget, pivots, the tail root, the open feature shells: approved, keep them; culling
buried faces: approved; the Yuki belly #fbf9f4: fine). In the game it loads and instances. But it's about 6.5/10 against
the sheet. In-game shots: `D:/projects/chewy-life-3d/tools/qa/tmp/enemies/glb-kama-close.png` (45°, 6 m) and
`glb-kama-wind.png` (the rear-up wind-up). The rear-up sinking the hind paws is mine to fix in the game code: ignore it.

## Locked
The overall size and body length, the legs and paws with the wraps, the ears, the nose and "w" mouth, the head size
(follow the sheet's 0.46 m, as you did), the variants' colours, the parts and pivots.

## Fix (in order of importance)
1. **The head outline is faceted and jagged.** In the game the ink outline follows it, so the head reads as a spiky
   polygon (`glb-kama-close.png`, and your own `cmp-face.png`). The sheet's head is a **smooth round bun** with **two
   soft cheek puffs**, not spikes. Re-sample the head surface finer (≈ 1,300–1,500 tris for the head alone is fine:
   take them from the scarf and legs) and make the cheek tufts 2 broad rounded lobes per side, no points. Nothing on the
   silhouette should have a corner sharper than ~3 cm radius.
2. **Eyes**: now an anime eye with a big white and a small iris, slanted down at the outer corner, so it looks sad. The
   sheet's eye (its face close-up) is a **big round dark-brown iris filling almost the whole eye** (#3a2418 top fading
   to a warm #a66c32 lower third, a #2f2834 pupil), a big white catchlight upper-left and a small one lower-right, a
   thick dark upper lash line that flicks out at the outer corner, and only a thin white sliver at the lower edge. The
   eye is round, about 0.12 m tall, set level (no downward slant); the **angry read comes from the brows**, which tilt
   down toward the nose (inner ends lower), thick and short.
3. **The sickles read as straight sticks from the game camera** (both shots: thin pale rods beside the legs). They
   must read as **crescents from 45° above and from the front**. Turn each blade's plane so it faces up-and-out at about
   45° (between the sheet's front and side views), make them chunkier: about 0.36 m tip to tip, ≈ 7 cm wide at the
   belly, ≈ 3 cm thick, with the lighter #f2f6fb edge on the outer curve. The grip sits in the paw as now.
4. **The scarf tails are thin tubes**; on the sheet they're **broad flat ribbons** (≈ 10 cm wide, ≈ 2.5–3 cm thick,
   rounded ends) streaming back and up in a soft S-wave, one above the other, with the lighter top face. The neck wrap
   a little bigger and softer too.
5. **The tail**: from above it reads as a stick with a dark knob, and from the back the cream underside dominates.
   - Thicker along its length: ≈ 0.16 m at the root, swelling to ≈ 0.22 m in the upper third, the S-curve as the sheet.
   - The cream underside only a narrow strip (≈ 30 % of the circumference) along the inner curve, not half the tail.
   - The **brush**: 3–4 **broad, flattened leaf-shaped tufts** (≈ 0.12 m wide each, overlapping, fanning out like the
     sheet's dark-brown brush), not round fingers; the orange-to-brown border as a soft scalloped edge, not a zigzag.
6. The orange in your ortho renders looks muddy brown; in the game it's fine, so only check the bake: keep the
   underside darkening ≤ 10 %.

## Check before reporting
The face against the sheet's close-up (front and 3/4) at the same scale; a 45° game-camera shot from the front and both
sides with the ink outline, where the sickles must read as crescents; the side and back views against the sheet.
