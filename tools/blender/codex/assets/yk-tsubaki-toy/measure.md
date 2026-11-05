# Okami Tsubaki (yk-tsubaki-toy): Step 0, the sheet measured on pixels

Source: `refs/sheet.png` (1536 x 1024). Every number comes from PIL colour masks, connected components and row/column
scans (`measure/m1_head.py`, `m2_face.py`, `m3_eyes.py`, `m4_patch.py`, `m5_body.py`, `m6_parts.py`, `scratch/headfit2.py`),
not by eye. Zoomed crops with pixel ticks: `measure/crop_headfront.png`, `eyes_x4.png`, `eyeR_x8.png`, `chest_x3.png`,
`bow_x4.png`, `crop_front_body.png`, `crop_side.png`, `crop_back.png`. The model's numbers come from the same kind of masks
on its renders (`measure/m10_model_rows.py` -> `body_rows_final.txt`, `m11_head_rows.py` -> `head_rows_final.txt`) and
from `measurements-model.json`.

## Two head heights, one compromise
The head close-up (W = 289 px) is 0.756 W crown-to-chin; the turnaround front (W = 243 px) is 0.728 W. The model uses
**0.742 W** (within 2 % of both). Close-up heights below are given as measured; the model rescales them by
KZ = 0.742 / 0.756 = 0.981.

## HEAD FRONT panel (W = head width at the cheeks, ears excluded)
- Outline: widest x 44..332 at y 725-745, so **W = 289 px** (outline centre x 188). The features centre on x 190
  (nose, eyes); modelled symmetric, features measured about x 190.
- Chin y 819.5, crown (centre columns 170-205, a flat top between the ears) y 601. z = height above the chin, x lateral
  (viewer's right = her LEFT = Blender +X), both in W.

| Feature | Sheet (close-up units) | Model | Note |
|---|---|---|---|
| Head height | 0.756 W (turnaround 0.728) | 0.742 | the compromise |
| Half-width at z .05 / .10 / .15 / .20 / .25 / .30 / .36 / .42 / .48 | .367 / .438 / .474 / .491 / .498 / .500 / .497 / .481 / .455 | fit rms 0.009 W; render rows within 0.017 W (`head_rows_final.txt`) | |
| Head depth (side view) | 0.86 W at the eyes, the lower face 0.05 W ahead of the eye zone | 0.912 incl. the nose; side outline within 1 cm | |
| Eye centres | x +-0.209, z 0.341 | +-0.209, 0.335 (= 0.341 x KZ) | row/column scans through white + iris |
| Eye opening | 0.211 W wide x 0.200 tall | 0.211 x 0.196 | |
| Iris | 0.138 W wide (65 % of the opening), as tall as the opening; centre 0.036 W nasal, 0.007 up | 0.138, same offsets | |
| Pupil | 0.100 x 0.138 W (72 % of the iris both ways), nudged 0.019 nasal, 0.007 up of the iris centre | same | the amber reads as a crescent at the bottom / outer side |
| Catchlight | ONE, 0.038 x 0.048 W, 0.043 W above the iris centre | one, same | |
| Upper lash | top z 0.472; ~0.031 W thick over the top, ~0.017 W down the outer side to 0.28 of the half-height below the middle; a big curled wing (tip (1.49, 1.07) eye radii) and a small flick (1.22, 0.50) | own ribbon object, 0.033 W over the top, wings (1.50, 1.08) and (1.23, 0.50) | `eyeR_x8.png` |
| Brows | slim arches: inner (0.131, 0.570), top (~0.19, 0.580), outer (0.269, 0.540); ~0.02 W thick | same (painted) | dark on both the fur and the cream |
| Nose | rounded inverted triangle 0.080 x 0.055 W, top 0.275, tip 0.223 | 0.080 x 0.051 (x KZ), 3D button 0.072 W proud | |
| Mouth (cat "w") | centre (0, 0.168), dips (+-0.035, 0.157), corners (+-0.088, 0.190) curling up; philtrum to the nose | same (painted, x KZ) | |
| Blush | centres (+-0.321, 0.207), 0.128 x 0.087 W | same | crisp ovals |
| Muzzle (lavender-white) | a bell: z 0.288 just over the nose, +-0.135 at 0.24, +-0.209 at 0.17, +-0.222 at 0.13, round the chin | same polygon (x KZ) | `mask_muzzle.png` |
| Ear tips | x -0.311 / +0.324 (avg +-0.318), z 0.926 (0.170 W over the crown) | x +-0.312 (render), z 0.911 = 0.169 over the crown | |
| Ear shape | tall: apex ~75 deg (outer edge 19 deg, inner 55 deg from vertical), axis leaning ~16 deg out; the outer edge runs down into the head outline at z ~0.48 | tilt 16, r1 0.205 W, r2 0.068 W, yaw 14; outline rows within 0.012 W at z 0.75-0.90 | |
| Inner ear (pink) | x 0.18..0.40, z 0.59..0.85 | painted dish | |

### The cream patch (her RIGHT side = -x; `measure/m4_patch.py`, `mask_patch.png`)
- Inner border: x -0.066 at the crown top, -0.021 at z 0.69, -0.035 (0.63), -0.055 (0.59), -0.076 (0.56), -0.097
  (0.53), -0.125 (0.50), -0.159 (0.476), then on the lash: it hugs the eye's top and outer side (lash top z 0.472-0.476
  for x -0.17..-0.25), leaves the lash at z ~0.37 and runs diagonally down to the outline: (-0.374, 0.351), (-0.394,
  0.330), (-0.415, 0.313), (-0.436, 0.299), (-0.457, 0.289), (-0.478, 0.279), (-0.498, 0.279).
- The back view shows no cream at all; the side view (her left) neither. The model ends the patch in a rounded lobe
  just past the widest plane on her right side (only a hairline shows at the back silhouette).

## Full body (FRONT, SIDE, BACK): ground y 514, ear tips y 76 -> 1.05 m = **417.1 px / m**
Body centres: front x 241.5, side x 902, back x 1269.5.

| Feature | Sheet | Model |
|---|---|---|
| Total height (ear tips) | 1.05 m | 1.056 |
| Chin / crown | 0.530 / 0.954 (turnaround) | 0.525 / 0.958 |
| W | 243 px = 0.583 m | 0.583 |
| Head centre (side) | 0.042 m behind the body centre | 0.040 |
| Front outline (m) at z .30 / .38 / .42 / .46 / .62 / .70 / .82 / .90 / .98 | +-.322, .270, .246, .203, .287, .292, .265, .265, .246 | +-.326, .271, .256, .210, .277, .290, .271, .272, .254 |
| Side outline (front / back, m) at z .62 / .70 / .78 / .86 | -.230/.276, -.209/.290, -.194/.285, -.161/.254 | -.234/.279, -.216/.285, -.196/.280, -.166/.255 |
| Kimono (crimson) | visible z 0.345-0.515; sleeves to +-0.25, cream cuffs ~0.03 m | same; sleeves +-0.256 at z .42 |
| Collar | her left over her right: the over band from (x +0.025, z 0.53) to her right waist (x -0.07) under the obi; the under band from (-0.11, 0.53) to the crossing (-0.02, 0.474); fur showing in the V; bands ~0.03 m wide | same, 0.030 m bands |
| Obi | gold, z 0.331-0.393, +-0.142 | z 0.328-0.396, +-0.153 (it must cover the skirt's waist) |
| Bow (back) | two loops 0.228 m across, 0.11 m tall at the ends, pinched at a 0.05 x 0.06 m knot; centre z 0.372; side: out to +0.17 m | 0.23 m, 0.108 tall, knot 0.052 x 0.062, z 0.371, out to +0.165 |
| Apron | under the obi to z 0.146, +-0.16; side: front -0.158 (z .14) | hem 0.146, +-0.152..0.160, r 0.032; front -0.149..-0.174 |
| Skirt | deep wine, hem z 0.105, +-0.236 (front); side back +0.204 at the hem, the front sitting back | hem 0.107, +-0.241; back +0.207 (rows shifted back 0.03 m at the hem) |
| Paws | dark mittens 0.13 x 0.12 m, centre (+-0.264, z 0.293): the arm 36-39 deg out | 0.126 x 0.128, centre (+-0.261, 0.295) |
| Feet | dark, 0.178 m wide, ~0.235 long, 0.09 tall, centres +-0.101; two toe grooves each | 0.178 x 0.236 x 0.090, +-0.101, 4 mm sculpted grooves + painted line |
| Tail (side) | from the skirt's back at z ~0.3, out to 0.33 m behind, the puffy cream tip 0.10 x 0.086 m at 0.23-0.33 m behind, z 0.39-0.48 | out to 0.326, cream tip ball r 0.049, top z 0.47 |
| Tail (back) | from under the bow knot down to z ~0.22 at x -0.05, round to her right and up: the cream tip at x -0.17, z 0.33-0.43 | lowest z ~0.21 (bottom edge) at x -0.06, tip at x -0.16, z 0.38-0.47 |

**Differences from the brief / sheet**:
- Colours: the rendered sheet's darks are lighter than the swatches (fur ~#625462 vs #3a3440, skirt #673238 vs #4a1a2a).
  Following "paint dark a little lighter": fur #564b58, skirt #5e2636. Kimono #b02e40 (between the swatch #b8243a and the
  sheet's #a53a44), obi #ecc488 (between the swatch #f0d8a0 and the sheet's gold #e4b47a; the brief says "gold"), patch
  #fcecdf, muzzle #eee6ee, apron #fcf2e5 (the swatches' near-whites, kept under the #fff6ea cap).
- The 3/4 view puts the tail out to her left; the side and back views agree on a tail to her right. The model follows
  the side + back views, so the 3/4 comparison shows no tail (see the report).
