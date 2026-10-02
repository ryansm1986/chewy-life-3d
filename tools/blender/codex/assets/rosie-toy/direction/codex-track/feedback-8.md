Owner review of round 8: **"The side view looks really bad. The whole face and eyes point out to the left instead of just the nose."**
See the attached `side-problem.png` (the sheet's side view on the left, your model on the right). I agree. Here's the diagnosis and the fix.

## What's wrong
The face is built as a **flat plate on the front of the head**, and **both eyes face straight forward** on that plate and bulge out of
it. So in profile:
- the eye is the **frontmost thing on the head**: a big forward-facing disc sticking out past the forehead and cheek;
- the whole face reads as a mask turned toward the left;
- the head behind it is a separate deep mass of hair.
This is also the real cause of the 3/4 "far eye sticks out" problem in rounds 5–6.

In the sheet the head is a **ball** and the face **wraps around** it. In profile:
- the outline from forehead over the cheek to the chin is **one smooth convex arc**;
- only the small **nose** pokes out of it;
- the eye sits **on the side of the ball, set back from the front**, with brow and cheek skin around it;
- the far eye is hidden behind the curve of the face.

## The fix (a head and eye rebuild; the front view stays)
1. **Skull and face as one rounded volume.**
   - Seen from the side, the face surface is a **convex arc**: the forehead, cheek apex and chin all lie on a smooth curve,
     with the cheek apex its frontmost point apart from the nose. There's no flat front plane.
   - Depth from the nose tip back to the ear front is about **0.55 W**.
   - The nose tip is the **only** projection, about 0.04 W above the arc. The mouth sits on the arc just below and behind
     the nose; the chin is a soft round curve under it, slightly behind the mouth.
   - From above (the 45° game camera), the face front is a rounded curve too: the cheeks wrap back toward the ears.
2. **The eyes wrap onto the ball.** Each eye's centre stays at x = ±0.27 W, 0.34 W above the chin (front view unchanged), but:
   - **its facing direction turns about 30–35° outward** (toward its own side) and about 5° down, following the head's
     surface normal there;
   - it sits **in** the head surface: at most 0.015 W proud of the skin, with the brow ridge and cheek surface continuous
     around it;
   - in the **side view** the near eye appears as a **tall, fairly narrow oval set about 0.18–0.22 W behind the nose tip**,
     with the iris toward its front edge (as in the sheet's side view). The far eye **must not be visible**;
   - in the **3/4 view** the far eye foreshortens naturally inside the face outline.
3. **The front view must look the same as now**, within about 5%: the eye outlines, iris and pupil proportions, white crescents,
   lashes, brows, nose, mouth and blush. To keep the front-view iris placement after turning the eyes outward, re-aim the
   iris and pupil paint (or rotate each eyeball back inward) so the front view is unchanged. The painted gaze should still
   read toward the viewer from the front.
4. Brows, blush and lashes follow the new curved surface (painted or conforming, never floating).
5. **Keep everything else locked**: the hair (bangs, crown, curls), the ears (re-seat them onto the new surface if needed),
   the bow, collar, dress, limbs and shoes.

## Check
- A **side-view head close-up** next to the sheet's side view (`preview/cmp-side-head.png`, same scale, chin aligned). The profile
  arc, the nose as the only projection, the eye set back on the side and no far eye must all match.
- Front `cmp-head.png` must be unchanged against round 8.
- 3/4 `cmp-head.png`, `portrait.png` and both 45° game head shots.
- Look at the side and 3/4 at full resolution for any crumpling: the round-6 socket deepening wrinkled the skin. Build the
  new head as a clean smooth surface rather than deforming the old plate.
