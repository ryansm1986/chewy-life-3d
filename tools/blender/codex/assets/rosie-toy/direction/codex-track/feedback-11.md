Round 11 review. The temple tips no longer cover the eyes, and the irises are clear from both game yaws. Good. But moving the bangs
exposed problems, and **this round's portrait is less appealing than round 10's**:

1. **Forehead wrinkles.** The newly exposed forehead shows **crease/wrinkle lines** (visible in `portrait.png` and the FRONT view of
   `comparison.png`): thin dark lines across the forehead and above the brows. Toy-vinyl skin must be perfectly smooth. Fix the
   forehead's geometry and normals (a smooth, continuous surface; no faceting, no wrinkles) wherever skin is visible.
2. **Bang coverage.** The centre bang now sits too high, so she shows a big bare forehead and looks older. On the sheet's HEAD FRONT
   the bang's lower edge sits **right above the brows**, with the brow tops tucked just under it:
   - the **centre bang's lower edge at 0.60 W above the chin** (centre; the brows' tops at about 0.58 W);
   - the temple lobes keep their new outward sweep, with their ends at 0.50 W **beside** the outer eye corners (that's right
     now);
   - only a narrow band of forehead skin shows between the bangs and the brows. The face reads young and round.
3. **A gap in the hair.** At her left temple (image right in `portrait.png`) there's a **dark slit** between the temple bang and the
   side curl, through to the dark inside. Close it: the lobes overlap, and no hole or gap is visible from any angle.
4. **The head's top-front corner.** In `cmp-side-head.png` the forehead is a **flat vertical plane** meeting a **flat bang shelf** at a
   sharp corner: the head reads like a box. The sheet's profile is **rounded**:
   - the forehead curves gently back into the crown under the bangs;
   - the front bang is a **rounded rolled lobe**, its front a soft curve and its top flowing into the crown, not a flat shelf;
   - keep the measured profile positions (forehead x 0.06, bang lip x 0.00–0.05 at z 0.66, and the rest), but round the corner
     with a generous radius (about 0.15 W).

Keep everything else locked: the face below the brows, the eyes, the blush, the side and back curls, the bow, the costume and the
limbs. Rebuild `cmp-side-head`, `cmp-head`, `comparison`, `portrait.png` and both 45° shots, and check the forehead at full resolution
for any line or crease.
