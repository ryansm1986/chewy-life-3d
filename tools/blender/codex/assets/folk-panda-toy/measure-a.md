# Design A (Hana, `folk_panda_a`): Step 0, the sheet measured on pixels, and the model against it (round 1)

Source: `refs/sheet.png` (1536 x 1024), row A (x 0-511). Scripts in `measure/`:
- `m1.py`: per-row extents of every view (front, 3/4, side, back, head close-up);
- `classes.py`: colour classes (fur, dark, shirt, overalls, accent) -> `class_a.png`;
- `m2.py a` / `m2.py af`: the head close-up / the turnaround front head: midline, chin, W, half-widths per z (the left half,
  away from the flower), crown, ear circle fits;
- `m3.py a` / `m3.py af`: the face features (patch outline -> `patch_a.json`, eye opening, iris, pupil, catchlights, brows,
  nose, mouth, blush) in W;
- `m4.py a`: the turnaround front's class extents per height, in metres;
- `m5.py a`: the side view's head profile.
The model column comes from `measurements-model-a.json` (written by the build) and the same-scale comparisons in
`preview/a/cmp-*.png` (`make_compare.py a`).

**Anchors**
- **Turnaround front**: ground line y 487, the ear tops y 138 -> **1.05 m** (the notes: heights exclude the flower), so
  **332.4 px / m**. Centre x 142.6 (the nose). The front head is 203 px wide (0.611 m) and its chin y 309 (0.535 m).
- **Head close-up**: W = 188.2 px at the cheeks (rows 672-688), midline x 402.1 (the nose), chin y 738.
- The bottom row's side and back views are drawn smaller and with smaller heads (the back head is 121 px wide, the body
  to the chin 125 px: the head : body ratio differs from the front view by 20%); the notes say not to take scale from
  them, so they give only shapes and depth ratios.
- Face values are fractions of W: x from the midline (her left +), z above the chin. Body values are metres.

## Note 1: the head's height
The close-up draws the head 10% taller than the turnaround: crown 0.818 W and ear tops 0.925 W in the close-up, against
0.743 / 0.832 W in the front turnaround and ~0.72 W in the side view; every face feature sits lower by the same factor
(the eye centre 0.388 W in the close-up, 0.342 W in the turnaround). I modelled the close-up's layout with its z x 0.93,
which lands between the two (crown 0.761 W: +2.4% on the turnaround, -7% on the close-up). The close-up crop in
`cmp-head.png` is stretched by the same 0.93 so the features compare one to one. The model's W is 0.600 m (the
turnaround's 0.611, -1.8%) so the ear tops reach 1.05 m with the chin at 0.534 m (the turnaround's 0.535).

## Face (head close-up, z x 0.93; model = `measurements-model-a.json` and the paint parameters)
| Feature | Sheet (close-up, z x 0.93) | Model | Note |
|---|---|---|---|
| Head height, crown to chin | 0.761 (0.818 raw; turnaround 0.743) | 0.758 W | note 1 |
| Front widths at z 0.06 / 0.10 / 0.20 / 0.30 / 0.40 / 0.50 / 0.60 / 0.70 | 0.70 / 0.82 / 0.95 / 1.00 / 0.98 / 0.93 / 0.83 / 0.60 (blend of close-up and turnaround; above 0.5 the ears cover the outline) | 0.70 / 0.815 / 0.96 / 1.00 / 0.98 / 0.93 / 0.825 / 0.595 | a broad flat-topped dumpling, widest at z 0.30 |
| Crown at x 0 / 0.1 / 0.2 / 0.3 W | 0.762 / 0.753 / 0.711 / ~0.67 | 0.757 / 0.753 / 0.737 / 0.698 | kept flatter (the turnaround's flat top) |
| Side: front / back of the head at z 0.27 | 0.42-0.445 / 0.43 (side view, head-width units) | 0.440 / 0.427 | depth 0.87 W (sheet 0.86) |
| Eye opening (sclera + iris, inside the patch) | centre (+-0.187, 0.361); 0.156 x 0.168 W | (+-0.187, 0.361); lid hole 0.158 x 0.172 W | eyes face 15 deg out (the skin normal) |
| Iris | 0.106 x 0.146 W, 0.025 W toward the nose, touching the nasal rim | 0.67 x 0.85 of the opening, 0.31 half-widths nasal | white crescent outside |
| Pupil | ~0.70 of the iris (the sheet's iris is very dark) | 0.70 x 0.72 of the iris, a touch nasal and high | |
| Catchlight | one, 0.027 W, up and toward the nose in each eye (mirrored) | 0.027 W, the same, mirrored; + a small faint low one outside | the shared brief asks for two |
| Lash line | not separate on the sheet (the patch is dark) | a roll 0.0075 W proud with a wing, its top catching a cool light (lash ramp top #4A4650) | so it reads on the patch |
| Eye patch | x 0.089..0.397, z 0.218..0.525; centroid (0.239, 0.368); 0.358 x 0.260 W, long axis falling outward 52 deg | the measured outline (40 points, both sides averaged, smoothed), 1.6 mm soft borders | sides agree within 0.005 W |
| Brows | x 0.138..0.233, z 0.564..0.608 | the same arc, rising 0.020 W, 0.016 W thick at the middle | |
| Nose | 0.101 x 0.060 W, z 0.267..0.326 | 0.091 x 0.061 W, z 0.267..0.328; a rounded oval-triangle button 9.5 mm proud, tip 0.457 W ahead | |
| Mouth (centreline) | +-0.080 W; corners z 0.237, bottom 0.206; 0.016 W line | +-0.078 W; corners 0.242, bottom 0.204; 0.0176 W line | |
| Blush | centre (+-0.336, 0.174), 0.15 x 0.11 W | (+-0.336, 0.174), soft 0.14 x 0.10 W, kept off the patches | |
| Ears (circle fit) | close-up c (+-0.314, 0.70), r 0.163; turnaround c (+-0.33, 0.67), r 0.155 | c (+-0.322, 0.688), r 0.165, 0.14 W thick; top 1.046 m, outer x 0.487 W | 16 deg outward |
| Flower | centre (0.328, 0.65), 0.27 W across, five round petals, cream centre 0.09 W; leaf at (0.45, 0.55), 0.16 W long | centre on the skin at x 0.32 W, z 0.63 W, 0.27 W across, facing 39 deg out; centre 0.092 W; leaf 0.19 W long, down and out | `PandaA_acc`; spans x 0.24..0.52 W, z 0.54..0.79 W |

## Body (turnaround front, metres)
| Feature | Sheet | Model |
|---|---|---|
| Total height (ear tops) | 1.05 | 1.046 |
| Crown / chin | 0.99 (note 1) / 0.535 | 0.989 / 0.534 |
| Overalls body half-width z 0.13-0.30 | 0.236 | 0.237 (body width 0.475) |
| Shirt under the head, z 0.50 | +-0.22 | +-0.22 |
| Sleeves | out to +-0.29 at z 0.44; hem z ~0.40 at the outside | +-0.29; hem ~0.08 m down the arm |
| Arms | dark from z 0.418, outer +-0.36 at z 0.31, lowest z 0.262 | 40 deg out, span 0.75 (+-0.375), paw lowest ~0.27 |
| Bib | top z 0.45, 0.30 wide at the top | top 0.453, 0.31 wide (the buttons at its corners) |
| Buttons | +-0.12, z 0.427, 0.068 across | +-0.126, z 0.433, 0.068 across, cream domes |
| Pocket | x +-0.128, z 0.225..0.36, a rounded rectangle | +-0.128, z 0.225..0.360 |
| Straps | +-0.083..0.152 (0.068 wide, centres +-0.117) | 0.068 wide, centres +-0.117; straight down the back to the waistband |
| Shorts | the legs split at z 0.165, cuffs z 0.11..0.18 | split ~0.16, rolled cuffs z ~0.115..0.18 |
| Dark legs and feet | z 0..0.117, each 0.18 wide, the inner gap 0.04 | legs r 0.088, centres +-0.111, inner gap ~0.045; feet 0.186 x 0.23, 0.09 tall |
| Tail | round, cream, at the seat | 0.133 across, z 0.226, y +0.198 |

## Notes (differences over 5%, and calls I made)
1. The head's height: see note 1 above (the close-up and the turnaround disagree by 10%; the model sits between).
2. The crown at x 0.2-0.3 W is 0.026 W higher than the close-up's outline: the turnaround's front and 3/4 heads have a
   flatter, squarer top than the close-up, and Pan's round-1 lesson asked for exactly that wide flat squircle.
3. The arm span is 4% over (0.75 vs 0.72): the paws hang at Hokuto's 40 deg so the arms clear the wide hips for the rig.
4. The lash line: the sheet's eyes have no separate lash (it merges with the dark patch); the brief asks for one that
   reads, so the roll's top catches a cool light (Sasa's and Hokuto's approach).
5. The flower: the sheet draws it face-on from the front and from the side alike; it faces between the skin's normal and
   the viewer (39 deg out) so it reads from the front and from both 45 deg game yaws without a petal sinking into the
   head or the ear.
6. The director's own numbers in `brief.md` give only the 1.05 m height and 2.4 heads: the model is 1.046 m to the ear tops,
   0.989 m to the crown, the head 0.455 m (crown to chin): 2.17 heads to the crown and 2.30 to the ear tops, as the
   sheet's front view draws it (2.18 / 2.31). The notes' "2.4 heads" is not what the sheet draws; I followed the sheet.
