Round 1 review: **7/10**. The head is a ball again: front, 3/4, back and top all read round, the skin is crease-free, the eyes
are clean, and `cmp-vs-codex.png` shows the gain clearly. **Approved and locked**:
- the skull-as-smooth-blend construction and its exact normals;
- the head's front-view outline and size;
- the eye positions, size and paint in the front view, and the nose, mouth and blush shapes;
- the back view's big centre crown section;
- the body and costume (except item 9).

Fix in this order (the images to compare: your `preview/head_side.png`, `portrait.png`, `cmp-head.png`, `cmp-side-head.png`, `cmp-back.png`
and the sheet).

1. **Profile: the eye is the front of the face again. This is the owner's original complaint ("the whole face and eyes point out to the
   left instead of just the nose"), so it's the top item.**
   - In `preview/head_side.png` the eye white and lash form the face's silhouette from the brow down to the cheek, as far forward as the
     forehead. On the sheet the eye sits clearly *inside* the profile: the forehead above it and the round cheek below it are the
     outline, and only the nose projects.
   - Targets, in exact profile (x behind the nose tip):
     - **no part of the eyeball, lash or flick on the silhouette**;
     - the eye white's front edge at **≥ 0.11 W**;
     - the lower cheek (z 0.12–0.24 W) is the face's front below the nose, at x ≈ 0.04–0.06, a full round bulge;
     - the forehead at the brow (z 0.50–0.58) at x ≈ 0.06–0.07;
     - the nose button about 0.05 W proud of the cheek in front of it.
   - **Build it as volume, inside your blend, not by pushing points.** This is the smooth recess you offered, plus some fullness around it:
     - a gentle socket recess around each eye, about 0.04 W deep with a wide falloff (radius ≈ 0.2 W);
     - the lower-cheek volume fuller forward and a little lower;
     - a soft brow mass above the eye.
     The eyeball moves back with the socket and keeps its 33° facing and its front-view position and size.
   - **Must not change**: the front-view outline and features. **Must not appear**: a ring, a dark socket shadow, a crease or a flat
     plate. Check the front, 3/4 and both game yaws for any of those.
2. **The bang in profile is a visor.**
   - The front bang lobe overhangs the forehead by about 0.05 W and reaches as far forward as the nose tip, with a dark underside and
     bare skin showing under it.
   - On the sheet the bang **lies on** the forehead, about 0.02 W thick past it, and rolls back into the crown. Its front stays at least
     0.04 W behind the nose tip.
3. **Hair outline: one round cloud.**
   - **Front**: there's a **pinch at temple height** between the crown and the two side masses, so the side curls read as two separate
     puffs or bunches. On the sheet the outline grows continuously from the bow to its widest at eye level, then rounds under at the jaw.
     Fill the pinch with the upper side curls and the crown's outer pillows.
   - **Side**: the top is **flat** from the bow back to the nape, so the hair reads as a long loaf. On the sheet the crown is a **dome**,
     highest about 0.6–0.8 W behind the nose tip, falling away in a continuous round arc down the back to the curls at the nape. Keep
     the back of the hair at about 1.6 W, but lower the rear crown and move that volume down into the back curls.
4. **Curls: fewer, bigger, merged.**
   - The sides and back read as **a bunch of grapes**: many separate balls of the same size.
   - The sheet has **10–12 bigger lobes, 0.38–0.48 W**, each overlapping its neighbours by about 25%, so they read as one soft mass.
   - **Back view**: two big central lower curls (≈ 0.5 W) under the crown section, two or three on each side, and pillow sections either
     side of the centre crown. Your bottom row of 5 small curls is the main difference.
   - In profile: about 3 big lobes behind the ear, not 6–8.
5. **Faceting.**
   - At portrait size the crown pillows, the bang lobes and the side curls show **polygon steps and jagged intersection seams**:
     `portrait.png`, the top edge of the crown and the right side mass.
   - Give the hair lobes **analytic normals** as you did for the skin, and enough segments on silhouettes and intersection lines that
     every outline and seam is a smooth curve.
   - **Budget**: up to **32k triangles** in total, with the head and hair up to 18k. To make room:
     - the fewer lobes from item 4 free triangles;
     - so does trimming body geometry that's never visible (the torso and upper legs under the dress and skirt, the inner faces of
       the arm tops);
     - you may drop the brooch leaves to about 250 triangles.
6. **Bangs from the front.**
   - The centre bang is a **flat-bottomed block** with a straight lower edge and square corners, so it reads as a helmet fringe.
   - On the sheet it's a **big round lobe** whose lower edge is a convex arc: lowest at the centre (0.60 W), rising to about 0.66 W where
     the side lobes **overlap** it. Lose the notch (your known issue 2).
   - A slight asymmetry like the sheet is welcome: the part just to her left, so the centre lobe sweeps a little to her right.
   - The temple lobes keep their ends beside the outer eye corners.
7. **Brows**: they're **flat rectangular bars with square ends**. On the sheet they're soft arcs: about 0.035 W thick at the middle,
   tapering to rounded points, with the middle about 0.015 W higher than the ends. Same position and length.
8. **Face paint and colour.**
   - **Remove the soft lower outer lid**: it reads as a grey bruise under each eye in `portrait.png` and the front view. The sheet's
     white is clean all the way round, under only the upper lash line.
   - **Skin**: the face reads **pale yellow-cream** next to her own arms and next to the sheet's warm peach. Use the same base as the
     body skin (#ffdcc4), and keep the lower-face and under-jaw shading **pink-peach**, never yellow. `refs/codex-r12-portrait.png` has
     the right tone.
   - **Blush**: a little more saturated (centre about #ff94a8 at 80%), same size and place.
   - **Hair colour**: it reads orange-tan. Use the sheet's chocolate (#6b3a22) as the base, the gap colour as is, and the sheen only as
     a soft gradient on the top quarter of each lobe, never a flat lighter patch.
9. **Ears and brooch.**
   - **Ears**: flat discs with a cut edge and a lighter colour, so they read as bottle caps. On the sheet they're **soft rounded "C"
     shells** in the face's skin colour, with a shallow pinker hollow and a thick rounded rim, about 0.10 × 0.13 W. They join the head
     smoothly (no seam ring) and their back half tucks under the hair.
   - **Brooch**: in profile (`preview/head_side.png`) the collar's front droops into a **white strap**, and the strawberry hangs on it
     in front of the chest like a pendant. Seat the brooch **flush** on the dress front just below the collar's centre, with the collar
     lying flat on the shoulders and chest, as in the approved front view.
10. **Bow**: it perches on top of the crown. On the sheet its lower third nestles **into** the crown, so no stalk or gap shows. Sink it
    about 0.04 W and make the loops about 10% bigger. Keep its colour and the 25° sweep.

**Renders**:
- Add a **25° 3/4 head view** to `cmp-head.png`, next to the 40° one, so it matches the sheet's angle.
- Rebuild every comparison, `portrait.png` and `game-45.png`.
- Check the exact profile and both game yaws for item 1 especially.
- Run the build twice and confirm the GLB is byte-identical.
- Then report as before (the targets table with the new profile numbers) and stop.
