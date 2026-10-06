# Round 3 feedback (poe-toy): about 8.3/10; the ears are the last big thing

## Approved and locked
- The fuller cheeks and jowls (keep the width profile).
- The nose: size, highlight and nostrils. It reads now.
- The face sheen highlights.
- The festival mask placement on the side corner. Its edge-on read from yaw −45 and the bit past the outline from behind are
  accepted.
- The shin wraps, collar folds and scroll.
- Everything locked in round 2: the eyes, roll, mouth, body, outfit, palette, tail, fūma at 0.80 m, arms at 40°, and
  determinism.
- A second texture for nose roughness isn't needed: the painted highlight carries it. Keep one atlas.

## Fixes
1. **Ears.** From the 45° game cameras (`game-45.png`, left image) and in `portrait.png`, the near ear reads as a **long thin
   dark hook or crescent** arching up over the head. Its fold top rises above the crown (fold top 0.736 W against crown
   0.703 W), so the fold reads as a raised arc and the flap as a thin band.
   - **Keep the whole ear inside or under the head's silhouette line at the top**: the fold top at or just below the crown
     outline, never above it.
   - **Shape**: each ear is a **compact, soft, rounded triangle**, like a folded dumpling.
     - It has a **wide base**, about 0.34–0.38 W along the head's top-front corner, and is short: from the fold to the tip
       about 0.30–0.34 W.
     - It folds forward at the corner and hangs to about the outer top of the eye, tip slightly curled under.
     - Its outer edge continues the head's top-corner outline, as on the sheet's front and 3/4 close-ups.
   - **From both 45° cameras** it should read as a soft rounded flap sitting on the corner of the head, not an arc. The
     front-view look of round 2 is close; keep that, but lose the tall rolled fold and the long thin band.
   - Keep the thickness (at least 0.07 W), the darker underside and the sheen on the fold top.
2. **A rounder head silhouette.** From the front, the head now reads boxy: straight vertical sides from the ears to the jowls,
   a flat top and squared top corners. The sheet's head is a soft "bun":
   - the top is a gentle dome;
   - the top corners have a **large radius**;
   - the sides bulge slightly outward, a convex curve all the way into the full cheeks.
   Keep W : H ≈ 1.49 and the cheek width profile, and keep the eyes, nose and mouth fixed in absolute terms. Only round
   off the corners and add a slight convexity to the sides and top. Compare the outline directly against the sheet's front
   head close-up in `cmp-head.png`.

## Deliver
The same set as round 2:
- `cmp-head`, `cmp-front`, `cmp-side` and `cmp-back`;
- `game-45` and `game-45-head` from both yaws;
- `portrait.png` and `toon-check`;
- the report.
Keep the process rules: PID-only kills and timeouts. Then stop, before the rig.
