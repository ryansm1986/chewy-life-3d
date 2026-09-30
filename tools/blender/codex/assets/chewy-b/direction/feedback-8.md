Round 7 review: **8.7/10**. The muzzle profile is fixed (full, round, blunt, chin filled), and the feet, pants, belly and
arms are right. **Everything is approved except one thing: the far ear from the game camera.**

See the attached `cmp-far-ear.png`: the actual game camera from yaw +45° and −45°. In both, **the ear on the far side reads as
a thin vertical spike**. With the camera 45° above and 45° around, one ear is always seen nearly edge-on, and a thin
flap is a sliver edge-on, however well it's folded. The sheet's ears are **chunky volumes** (toy style), so even the far
ear in the sheet's 3/4 view is a thick rounded triangle.

The fix is **ear volume**, not direction:
- Make each ear a **thick, cupped wedge**: a front-to-back depth of about **0.12 W at the base**, tapering to about 0.05 W
  near the tip. The outer (back) surface is strongly convex and rounded; the inner (front) surface is a gently hollowed
  cup with the pink inner ear.
- **Test**: seen exactly edge-on, the ear's silhouette must be at least **45% as wide** as it is face-on, a rounded
  triangle and never a line.
- Keep the fold (thick, rounded, short, tip forward and down) and the front-view look exactly as approved.
- Keep the current ear orientation, or turn the broad faces slightly more to the front (about 30° outward instead of
  40°), whichever reads better from both 45° game views.
- **Verify in the game camera**: render the head at 45° pitch from **yaw +45° and yaw −45°**, at the same framing as the
  attached crops. Both ears must read as rounded triangles in both renders. Put both renders in `preview/game-ears.png`.

Nothing else changes this round.
