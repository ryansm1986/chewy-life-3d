# Ochiyo (ak-ochiyo-toy): Step 0, the sheet measured on pixels

Source: `refs/sheet.png` (1536 x 1024). Every number comes from PIL colour masks, connected components and row/column
scans (`measure/m1_head.py` .. `m9_rows.py`, `scratch/headfit.py`), not by eye. Zoomed crops with pixel ticks:
`measure/crop_headfront.png`, `eyes_x4.png`, `chin_x4.png`, `crop_front_body.png`, `crop_side.png`, `crop_back.png`,
`crop_34.png`. The model's own numbers come from the same kind of masks on its renders (`measure/m10_model_rows.py`,
`m11_runs.py`, `m12_model_face.py`) and from `measurements-model.json`.

## HEAD FRONT panel (W = head width at the cheeks, ears excluded)
- Outline (`measure/mask_headfront_10.png`): widest at sheet y 721-739, x 49..359, so **W = 311 px**. The feature pairs
  (irises, blush, nose, mouth) centre on x 208; the outline centres on x 204.5 (a 0.011 W turn, ignored: modelled
  symmetric, features measured about x 208).
- **Chin**: visible, a flat bottom at y 812 (`chin_x4.png`). **Crown** (centre column) y 597.
- z = height above the chin, x = lateral (the viewer's right = her LEFT = Blender +X), both in W.

| Feature | Sheet | Model | Note |
|---|---|---|---|
| Head height, crown to chin | 0.691 W | 0.691 | |
| Widest | z 0.25-0.30 W | ZC 0.30 | |
| Half-width at z 0.017 / 0.064 / 0.111 / 0.159 / 0.206 / 0.253 / 0.30 / 0.371 / 0.419 | .325 / .409 / .453 / .478 / .494 / .500 / .498 / .482 / .469 | fit rms 0.008 W, max 0.015 (0.03 at the hidden chin row) | `scratch/headfit.py` |
| Head depth (side view) | front -0.423 / back +0.411 W at the eyes; muzzle zone 0.03 W ahead | side outline within 1 cm at every height (table below) | |
| Eye centres | x +-0.205 W, z 0.327 W | +-0.205, 0.327 | `eyes_x4.png` (opening = white + iris) |
| Eye opening | 0.217 W wide x 0.203 W tall | 0.217 x 0.203 (rim) | larger than Kome's 0.198 x 0.176 |
| Iris | 0.153 x 0.195 W (70 % of the opening's width), centre x +-0.170..0.175 (tucked 0.03 W to the nose) | 0.153 x 0.181-0.188, centre +-0.175, z 0.321-0.325 (render mask) | |
| Pupil | 0.108 x 0.137 W (70 % of the iris both ways), nudged 0.017 W nasal of the iris centre, 0.005 W up | 0.70 x 0.70 of the iris, same offsets | it nearly touches the iris's inner edge |
| Catchlight | ONE, d 0.053 W at (+0.020 nasal, +0.053 up) of the iris centre | one, same | the sheet has no second catchlight |
| Upper lash line | top z 0.465 W, ~0.032 W thick over the top, running down the outer side to z ~0.30; a thick wing curling up at the outer top (tip ~(1.4, 1.0-1.1) eye radii) and a small lower flick (~(1.35, 0.55)) | its own ribbon object; wings tip (1.38, 1.12) and (1.33, 0.62), curled | |
| Brows | thick arches: inner end (0.132, 0.537), top (0.19, 0.565), outer end (0.264, 0.513); 0.129 x 0.055 W; ~0.029 W thick | 0.134 x 0.068 W, centre (0.198, 0.547) (render mask) | on the patch side it is darker than the patch (the sheet) |
| Nose | rounded inverted triangle 0.086 W wide x 0.061 W, top z 0.284, tip 0.223, centre 0.254; ~0.034 W proud (side view) | 0.091 x 0.064 W, centre z 0.258 | the 3D button is a rounded triangle too (two lobes) |
| Mouth ("w") | corners (+-0.088, 0.192), dips (+-0.048, 0.171), centre (0, 0.191); line up to the nose 0.191-0.223 | 0.184 x 0.065 W incl. the philtrum line | |
| Blush | centres x +-0.30 W, z 0.178; 0.122 x 0.082 W | (0.302, 0.178), 0.120 x 0.068 (her left; her right one touches the patch in the mask) | |
| Muzzle (white) | a soft two-lobed puff: x -0.146..+0.159, z 0.08..0.29 (wraps round the nose) | painted, same extent | |
| Ear tips | x -0.312 / +0.318 W, z 0.859 / 0.849 W (0.163 W above the crown) | +-0.314, 0.856 | |
| Ear shape | apex ~90 deg (edges 39 deg outer, 51 deg inner from vertical); tips well rounded (a ~0.07 W tip radius: 0.13 m wide 3 cm under the tip); outer edge running down into the head outline at z ~0.45-0.5 | r1 0.20 W, r2 0.072 W, tilt 5, yaw 14, lean back 4 | |
| Inner ear (pink) | x 0.183..0.376 (her left), z 0.547..0.768; a rounded triangle | x 0.203..0.430, z 0.50..0.68 | ~0.03 W further out (see the report) |

### The calico patch (W, her RIGHT side = -x; `measure/m4_patch.py`, `mask_patch.png`)
- Front: the inner border x -0.05 at the crown, -0.057 (z .66), -0.071 (.58), -0.074 (.46-.54), -0.068 (.36-.42),
  -0.08 (.31), then round the eye's lower rim (the eye sits inside the patch, cream right under it), then from the eye's
  outer-lower corner diagonally down: (-0.334, .260), (-0.373, .241), (-0.412, .228), (-0.450, .205), (-0.489, .167)
  to the outline.
- Back view (dark mask, per row, X = her right): -0.09 (z .65), -0.114 (.59), -0.138 (.525), -0.161 (.46), -0.193 (.40),
  -0.232 (.34), -0.291 (.27), -0.386 (.21), meeting the outline at z ~0.18.
- Between them the whole right side of the head is dark above z ~0.17; both ears dark outside, pink inside; tail dark.

## Full body (FRONT, SIDE, BACK): ground y 509, ear tips y ~59 -> 1.05 m = **428.6 px / m**
Body centres: front x 248, side x 902 (the obi / skirt / feet average), back x 1260.

| Feature | Sheet | Model |
|---|---|---|
| Total height (ear tips) | 1.05 m (the note) | 1.051 |
| Crown / chin | 0.953 / 0.543 m | 0.953 / 0.543 |
| W | 254 px = 0.593 m | 0.593 |
| Head : body | head 0.410 m; 2.32 heads to the crown, 2.56 to the ear tips (the note says 2.4) | same |
| Head centre (side) | 0.036 m behind the body centre | HY 0.036 |
| Side outline (front / back, m) at z .62 / .70 / .78 / .86 / .90 | -.212/.254, -.243/.280, -.210/.278, -.180/.247, -.147/.215 | -.214/.256, -.241/.274, -.209/.271, -.185/.246, -.154/.215 |
| Front outline at z .58 / .66 / .74 / .82 / .90 / .98 | +-.243, .292, .294, .27, .27, .25 | +-.247, .295, .296, .269, .280, .251 |
| Kimono (plum) | torso hidden but for the shoulders; sleeves to +-0.28 m at z 0.43, lower edge z ~0.36; cream rolled cuffs | sleeves to +-0.26 at z 0.43 (arms 37 deg) |
| Collar | cream crossed bands, her left over her right, crossing at z ~0.485 just above the bib | same |
| Apron bib | +-0.117 m, top edge z 0.471 | +-0.116, 0.471 |
| Straps | front: centres +-0.10, 0.047 m wide, from the bib corners over the shoulders; back: straight down, centres +-0.098, 0.055 wide, into the obi | +-0.10 / +-0.098, 0.047 wide |
| Obi | gold, z 0.336-0.397 m, +-0.150 m; side: front -0.152, back +0.140 | z 0.332-0.401, +-0.155, front -0.154, back +0.142 |
| Obi knot (back) | a pillow 0.154 m wide, z 0.324-0.432, ~0.026 m off the obi | 0.154 x 0.108 m, same place |
| Apron panel | under the obi to z 0.145; +-0.150 at the top, +-0.157 at the hem; rounded corners; side: front -0.156 (z .37) to -0.194 (z .16) | 0.145, +-0.150..0.158, r 0.03; front -0.155..-0.205 |
| Skirt | dark plum, hem z 0.107, +-0.24 (front), +-0.19 deep (side); flares right under the obi (+-0.17 at z .32, +-0.205 at .25) | hem 0.107, +-0.241 x +-0.190 |
| Paws | mittens ~0.13 x 0.12 m, centres (+-0.272, z 0.33): arms ~43 deg out | 0.12 x 0.13, centres (+-0.257, 0.31), arms 37 deg (see the report) |
| Feet | 0.175 m wide, ~0.21-0.22 m long, ~0.085 m tall, centres +-0.11 m | 0.176 x 0.214 x 0.086, +-0.110 |
| Legs | ~0.105 m wide, visible 0.03 m between the hem and the feet | r 0.051 |
| Tail (side view) | dark, from the skirt's back (0.16-0.20 m behind, z 0.21-0.29) out to 0.32 m behind and up into a hook, top z ~0.47, the tip back near the knot | out to 0.33, top 0.48, tip 0.21 behind at z 0.42 |
| Tail (back view) | a U sweeping to her right: lowest z ~0.2, the end at x -0.24 m, z 0.33 | drifts 0.07 m to her right (see the report) |

**Differences from the brief**: the brief gives colours only. The rendered sheet's dark colours are lighter than the
swatches (patch #5a4d53 vs #3a3440, kimono #8a4b5e vs #6a3a5a, skirt #583940 vs #3a2434); following the brief's
"paint dark cloth a little lighter", the atlas uses patch #544a55, kimono #80465c, skirt #4e3240 (between the two).
