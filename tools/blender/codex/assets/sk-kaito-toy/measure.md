# Kaito (sk-kaito-toy): Step 0, the sheet measured

All sheet numbers come from pixels of `refs/sheet.png`: colour classes (`measure/classes.py`, overlay `scratch/classes_crop.png`),
silhouettes (`measure/explore.py` -> `scratch/mask_*.npy`, `measure/bbox.json`), face features (`measure/feat.py` -> `measure/feat.json`),
body (`measure/body.py` -> `measure/body.json`), plus gridded 3-4x zooms read pixel by pixel (`measure/grid.py` -> `scratch/grid_*.png`,
10 px cells) where the classes merge (the lash, the eye opening, the brows, the ear caps, the chin line, the side torso).

- **W** = head width at eye level (the cheek tufts below stand out past it).
  - Front turnaround (fb): W = 229 px (x 128..360 at y 218..226), centre x 244, crown y 137, chin y 307 (the head's lower outline on the
    centre column, just above the collar), soles y 511: **0.742 W** crown to chin.
  - HEAD FRONT close-up (hf): W = 272 px (x 58..330 at y 715), centre x 194, crown y 612, chin y 823: **0.776 W**.
- The two views disagree on the head height by 4.6 %, and the close-up draws its features proportionally higher too. **Normalised by each
  view's own head height, their outlines agree within 0.01 W at every height** (table below), so the close-up is the same head drawn
  slightly from below. The model takes **0.75 W** and puts every face height at the two views' mean fraction of the head height
  (hf within 3.4 %, fb within 1.1 % of the model; the director's cmp-head uses hf, cmp-body uses fb).
- **Scale**: the sheet's "0.99 m" taken to the **crown** (as for Kaede and Kazemaru); 0.99 m over 374 px (crown 137 .. soles 511) ->
  2.647 mm / px -> **W = 0.606 m**, the chin at 0.536 m (fb 0.540), the ear tips at 1.14 m. "2.4 heads" on the sheet: crown-to-ground over
  crown-to-chin is 2.20 on the drawing (2.18 on the model).

## Head front (W units, z above the chin with the head 0.75 W tall)

| Item | Sheet hf (px) | Sheet fb (px) | Model target (W) | Note |
|---|---|---|---|---|
| Head height, crown to chin | 612 -> 823 | 137 -> 307 | 0.750 | hf 0.776, fb 0.742 |
| Half-widths z .02 / .04 / .07 / .10 / .13 / .16 / .19 | rows of `mask_hf` | rows of `mask_front` | .32 / .37 / .46 / .495 / .51 / .515 / .54 | hf and fb within 0.03 |
| Cheek tufts, widest | 0.574 at z .25-.28 | 0.576 at z .25 | 0.575 at z .22-.29 | soft points, cream all over |
| Half-widths z .31 / .34 / .38 / .42 / .46 / .50 | | | .545 / .51 / .50 / .485 / .47 / .49 | a soft waist at z .46 where the orange skull meets the cream cheeks |
| Above z .55 | 0.50-0.507 | 0.50-0.51 | ear flanks | the outline is the ears' outer flanks |
| Eye opening (inside the lash) | x 109..169, y 693..752 | | 0.215 x 0.212, centre x +-0.200, z 0.346 | round |
| Iris | 129..168 x 699..751 (39 x 52) | 32 x 42 | 0.141 x 0.186, centre x +-0.170, z 0.3375 | fills the height; its top just under the lash |
| Iris width / opening width | 0.65 | | 0.66 | white crescent on the outer side, the iris 0.030 W toward the nose |
| Iris bottom / nose top | 751 / 743 | 254 / 246 | 0.244 / 0.278 | the iris bottom sits below the nose top (kept) |
| Pupil | 19 x 38 px | 16 x 30 px | 0.072 x 0.137 | 0.017 W toward the nose, 0.018 W above the iris centre; very dark slate (#23282E) |
| Catchlight | ~11 px round at (154, 710) | | 0.040, 0.034 above the pupil centre | one big catchlight per eye, the light upper left on screen |
| Upper lash | 6 px thick over the top (687..693) | 5 px | 0.022 W | lined down the outer side to just under mid-height (y 735); a small wing tick out to x 104 (0.018 W past the opening) at 0.035 W above its centre |
| Brows | box 121..161 x 649..669, centre line: outer end (123, 668), peak (145, 652), inner end (160, 657) | centres +-0.207, z .563 | centre x +-0.204, z 0.576; 0.146 long; outer end z .545, peak .599, inner end .583; 0.026 thick | arcs, the outer end lower and pointed, the inner end blunt |
| Nose | 184..212 x 743..758 | 234..256 x 246..259 | 0.104 x 0.058, centre z 0.249 | a rounded inverted triangle, dark plum |
| Mouth | 175..221 x 770..782 | 226..263 x 267..277 | 0.17 wide; corners z 0.177, lowest (centre) z 0.139 | a simple "U" smile with small upturned ticks at the corners; no cusp, no philtrum line |
| Blush | 96..134 x 756..781 | 161..192 x 259..278 | 0.137 x 0.088 at x +-0.30, z 0.183 | soft edged, on the cream |
| Cream face, top edge | from the zooms | | 0.29 at the centre (over the nose), 0.265 at x .09, 0.24 under the eyes (x .16-.25), 0.275 at .35, 0.31 at .42, 0.33 at .50 (tufts) | the tufts are cream all over; from the side the cream runs back level to the tuft tips |
| Ear tips | (104, 547) / (285, 547) -> x +-0.33, z 0.98 | (164, 82) / (330, 82) -> x +-0.36, z 0.994 | x +-0.345, z 0.987 (0.237 W above the crown) | |
| Ear outer edge | continues the head side, 0.50 at z .55-.73 | same | 0.505 at z 0.60 | its base reaches down to z ~0.47 behind the forehead dome |
| Ear inner edge | x 0.26 at z .96, 0.16 at .895, 0.09 at .81, 0.06 at .767 | | same | runs down behind the forehead dome |
| Inner ear (pink) | x 0.19..0.42, z 0.58..0.915 (hf) | x 0.20..0.43, z 0.555..0.886 | x 0.19..0.43, z 0.56..0.89 | a big broad triangle |
| Dark ear cap | lower edge: outer rim y 620 (z .72), inner edge y 578 (z .87) | z .72..0.96 | z 0.72 outer .. 0.87 inner | a tilted lower edge |

## Profile (side turnaround; crown y 140, chin y 308; body axis = the feet's centre x 897; y in W from the axis, + = back)

| z (W) | 0.72 | 0.63 | 0.53 | 0.43 | 0.34 | 0.30 | nose tip 0.25 | 0.21 | 0.15 | 0.09 | 0.03 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| front | -0.087 | -0.188 | -0.240 | -0.271 | -0.275 | -0.284 | -0.397 | -0.371 | -0.349 | -0.319 | -0.262 |
| back | 0.454 | 0.498 | 0.550 | 0.585 | 0.590 | 0.581 | 0.576 | 0.568 | 0.537 | 0.489 | 0.406 |

**Head depth 0.865 W** at z 0.34 and its centre sits **0.157 W behind the body axis** (HY). The muzzle projects ~0.12 W past the face
(at the eyes the front is the lash/eye profile). The cheek tufts' cream points sweep back to 0.38 W behind the axis (0.22 W behind the head
centre). The ear in the side view: tip at y +0.21 W (behind the axis), z 0.99.

## Full body (metres, z above the soles; front turnaround unless marked; `measure/body.json`)

| Item | Sheet |
|---|---|
| Crown / chin / ear tips | 0.99 / 0.540 / 1.135 |
| Sailor collar (navy) | front: two lapels from the shoulders (+-0.15, z 0.51) to a V at (0, 0.45) under the knot, ~0.06 m wide; over the shoulders its edge at z ~0.50; back: a square flap +-0.135..0.14, z 0.43..0.53; side: the shoulder top y -0.005..+0.09 at z 0.527, the lapel at y -0.07..-0.11 at z 0.47, the flap at y +0.13..+0.16 down to z 0.43 |
| Inside the V | cream fur above the knot (z 0.49..0.53, +-0.05) |
| Scarf (red) | knot 0.055 x 0.04 at z 0.445..0.484; two broad leaf ends down and out to tips at (+-0.075, 0.35), ~0.07 m wide under the knot; side: forward to y -0.15 |
| Shirt (white) | hem at z 0.31, +-0.175 (a little flared, overhanging the shorts by 0.02); torso +-0.16; side: front y -0.12 at z 0.31..0.44, back +0.15 (a round chunky body) |
| Sleeves | puffy, from the shoulder under the collar out to +-0.246 at z 0.435; the opening from (0.25, 0.415) to the armpit (0.175, 0.375) with a rolled cuff band (~0.03 m) |
| Arms / paws | arms hang ~30 deg out; paws (mittens) x +-(0.172..0.326), z 0.257..0.40, centre (+-0.25, 0.33) |
| Shorts (navy) | +-0.157 at z 0.30, +-0.188 at 0.22, +-0.20 at the cuffs; the legs part from z 0.22 (a thin centre crease); side y -0.106..+0.135 |
| Shorts cuffs | rolled bands z 0.08..0.136, +-0.204 |
| Feet | 0.172 wide, centres +-0.123, 0.085 tall; side 0.225 long (-0.111..+0.114); 3 toes |
| Tail | side: an egg rising behind, y +0.155..+0.405, z 0.145..0.515, widest (0.25) at z ~0.36, the tip at (y 0.32, z 0.515); back: +-0.13; cream on the upper ~40 % (side; ~55 % in the back view) |

## Where I differ from the director's numbers or the sheet (>10%, or a choice)
The brief gives only the total height (about 0.99 m) and the palette.
- **0.99 m to the crown**, not to the ear tips (the Kaede / Kazemaru convention). Flagged for the director; with the ears it is 1.14 m.
- **Head height 0.75 W**: the mean of the turnaround (0.742) and the close-up (0.776); see above.
- **"2.4 heads"**: the drawing itself measures 2.20 (crown to ground over crown to chin); the model follows the drawing.
- **Catchlights**: one big catchlight per eye on the sheet; the model adds the toy line's small second one, faint.
- **The shirt #FFFFFF** paints as #F6F0EC with #FFF6EA highlights (the contract's lightest value); **navy #2E4A6E** paints as #3C5A84
  base (the dark-cloth lesson), #2E4A6E only in the shade.
- **Ear tips / nose #493044**: the nose keeps it; the ear caps paint #553846 (a touch lighter, so the caps don't go black in the grade).
