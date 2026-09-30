Round 1 review: **5/10**. The foundation is good: clean build, on budget, one atlas, correct conventions, a sensible
palette and costume layout, and joints.json is done. But next to sheet-B.png it doesn't read as the same character
yet, mostly because of the face. Attached is the game renderer (toon light, 45° camera; the old Chewy is on the
left). Fix in this priority order. Measurements use **W = the head's width**; keep the head crown at 1.20 m.

## The face (most important)
1. **Add a real muzzle.** Right now the nose sits on a flat face; in the side view there's barely a bump. The sheet
   has a clear, soft, rounded muzzle volume:
   - It's a flattened sphere centred on the vertical midline, its centre about 70% of the way down from the crown to
     the chin.
   - Width about 0.42 W, height about 0.26 W. It protrudes about 0.16 W in front of the cheek plane, and in the side
     view the nose tip is the frontmost point of the head.
   - Blend it into the cheeks smoothly: no crease except a soft fold under the eyes.
   - The nose sits on the upper front of the muzzle, slightly overhanging.
   - The smile line runs along the **lower front** of the muzzle, with a short vertical philtrum line from nose to
     mouth.
   - Match the sheet's side view: a small rounded snout profile, a slight stop at the eyes, and a soft chin under it.
2. **The chin marking reads as a row of teeth.** It's a flat white bar directly under the smile line. In the sheet it's
   a soft, rounded U-shaped cream patch on the **underside of the muzzle and the chin**:
   - Keep a band of brown lip, about 0.03 W, between the smile line and the cream.
   - Give it rounded, organic edges, never a straight top edge.
   - It continues down the throat into the narrow blaze V between the collar edges.
   - Also add a subtle lighter tone (#8a5236 → #a4683f) on the upper muzzle around the nose, like the sheet's soft
     highlight.
3. **The eyes are googly.** They're full white rings, and in 3/4 view the far eye bulges out past the head outline.
   Fix:
   - **The iris fills about 85% of the eye opening.** Only a thin crescent of white shows, mainly at the lower
     outer edge, as in the sheet.
   - A **thick dark upper lid/lash line** (#2a1812) arches over the top quarter of the eye, thicker at the outer
     corner, with a tiny flick.
   - Set the eyes **into** the head: the eyeball surface sits no more than about 0.02 W proud of the face and follows
     the head's curvature, so in 3/4 view the far eye is foreshortened inside the silhouette, never sticking out.
   - Opening: a tall rounded oval, about 0.19 W wide and 0.22 W tall. Centres at ±0.23 W from the midline, about 55%
     down from the crown, with the lower edges nearly touching the top of the muzzle. They're slightly closer and
     lower than now.
   - Keep the two catchlights and the amber-to-darker-top gradient; they look great.
4. **The head shape** is currently a gumdrop: widest at the bottom, with a flat base, like a bear or a mouse. The sheet's
   head is a **soft rounded ball, widest at eye/cheek level**, with full rounded cheeks, tapering gently to a rounded
   jaw that tucks into the collar. The crown is a smooth dome. Keep it slightly wider than tall (W : H ≈ 1.1 : 1,
   excluding the ears).

## Ears
5. **They're thin stalks, like antennae** (look at the attached game shot from above). The sheet's ears are **big,
   thick, triangular flaps**:
   - The base is broad (about 0.30 W front to back along the skull, and about 0.05 W thick), rising from the upper
     sides of the head at about ±0.33 W.
   - They taper up to a rounded point, standing up for about 55% of their length.
   - Then the **top 45% folds forward and down** over the front, the tip pointing toward the face at about 45°.
   - The inner ear (#a8604a) shows on the front face below the fold.
   - The total ear height from the base, unfolded, is about 0.55 W.
   - Keep his left ear (+X) a bit perkier, with less fold.
   - The fold is a soft, thick bend, not a pinched hinge.

## Body and costume
6. **Coat colour for the game**: under the game's toon light the chocolate turns **maroon** (compare the attached shot
   with the sheet). Bake the coat lighter and slightly more golden:
   - base #8a5634, sheen #b87a4c on top planes, deepest shade #5e3a26;
   - inner ear #b06850;
   - keep the cloth colours as they are.
   The portrait under your studio light will look a little light; that's expected.
7. **Arms and paws**: the arms are thin tubes and the paws are small.
   - The sheet has **chubby arms**, about 0.20 W thick at the shoulder and 0.17 W at the wrap.
   - **Big mitten paws**, about 0.26 W long × 0.22 W wide, with two soft finger grooves and a short thumb bump.
   - The white wraps are thick bands, 0.02 W proud of the arm, with 2 band lines.
8. **Sleeves and gi**: the sleeves are puffy "princess" sleeves. Make them **straight, short, wide gi sleeves**: a
   cylinder flaring slightly at the elbow-length hem, with an open cuff.
   - The **gi is too short**: it should reach well below the sash and **flare over the top of the pants**, with the
     hem about 0.18 W below the sash.
   - Show the crossing lapels clearly: two white collar bands (#F4ECE0, about 0.05 W wide) forming the V, with his
     right lapel over the left.
9. **Pants and feet**:
   - The pants are two big rounded masses (good), but they should reach down to a **gathered cuff just above the
     ankle**.
   - The **feet are too small**. Make broad, rounded dog feet, about 0.30 W long × 0.20 W wide × 0.12 W tall, pointing
     slightly outward, with 3 toe grooves on top and a soft pad shape underneath.
10. **Neckerchief**: it's a thin cord now. The sheet has a proper **red triangle kerchief**: a soft band about 0.08 W
    thick around the neck, a chunky knot at the throat, and two short triangular tails hanging 0.15 W below the knot.
11. **Sash**: make the band **wider**, about 0.14 W tall, and fuller around the waist. The knot at his **left** hip is a
    fat bow-knot about 0.16 W across, with two tails hanging down to mid-thigh that flare slightly at the ends.
12. **Tail**: a thick, tapered tail, about 0.12 W thick at the root, **curling up** in a soft arc behind the pants, as
    in the sheet's side and back views. The current one is a thin tube.

## Process
- Compare `turnaround.png` against the sheet **per view**, then check `head.png` front and 3/4 against the sheet's
  head close-ups. The muzzle, the eyes set into the head and the thick folded ears are what make it "B".
- Keep ≤ 30k triangles. Spend the budget on the muzzle blend, the eyelids and the ear folds.
- Update `joints.json` if the proportions move, and keep the single-atlas export.
