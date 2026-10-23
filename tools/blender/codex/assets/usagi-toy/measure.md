# Usagi (usagi-toy): Step 0, measurements on refs/sheet.png

Measured on pixels with PIL (`measure/sil.py`, `measure/face.py`, `measure/body.py`, `measure/rows.py`, `measure/brim.py`).
The sheet is 1536 x 1024.

## Anchors
- **Full-body panels**: ground at y 515.
  - Front ear tips at y 56, so 459 px = 1.10 m (417 px/m).
  - Body centres x: 234 (front), 590 (3/4), 925 (side), 1305 (back).
  - The title text overlaps the front ear tips at x 100-275. The tip row was read on the right ear (y 56-58) and cross-checked on the back view (y 47-48).
- **HEAD FRONT panel**:
  - W = 253 px, the cheek width (widest at y 780, 0.26 W above the chin; ears and brim excluded).
  - Chin at y 846; centre x 198.5.
  - On the front body view the same head is W = 222 px = 0.532 m, with the chin at 0.424 m.

## Head front (fractions of W; z is height above the chin)
| feature | sheet (mine) | director | model | note |
|---|---|---|---|---|
| head widths at z 0.04 / 0.08 / 0.14 / 0.20 / 0.26 | 0.72 / 0.83 / 0.94 / 0.98 / 1.00 | | 0.72 / 0.85 / 0.95 / 0.99 / 1.00 | |
| head height (skull crown, under the hat) | hidden by the hat; about 0.70-0.72 from "2.4 heads" | | 0.719 | |
| hat dome top | 0.866 (close-up) / 0.883 (body view) | | 0.867 | |
| eye opening centre x | ±0.241 | ±0.21 | ±0.241 | +15 %: see note 1 |
| eye opening centre z | 0.336 | 0.36 | 0.336 | -7 % |
| eye opening w × h | 0.241 × 0.237 | 0.22 × 0.25 | 0.241 × 0.237 | |
| iris w × h, centre x | 0.182 × 0.210, x 0.212 (75 % of the opening, tucked to the nose) | | 0.182 × 0.210 (painted) | |
| pupil w × h | 0.107 × 0.150 | | 0.12 × 0.156 | |
| upper lash thickness | about 0.026 (top) | | 0.024 | plus two wing flicks |
| nose w × h, centre z | 0.072 × 0.052, z 0.263 (top just under the eye bottoms, 0.217) | 0.06 | 0.072, z 0.263 | |
| mouth w, z range | 0.166, z 0.17-0.233 (the "w" with up-curled corners and a philtrum) | 0.12 | 0.166 | +38 %: see note 2 |
| blush centre, size | x ±0.32, z 0.16; 0.142 × 0.117 (soft edge) | ±0.33, 0.13 × 0.08 | ±0.32, z 0.16; 0.148 × 0.108 | |
| brows | x 0.185-0.294, z 0.506-0.549 (soft arch, thick inner end) | | same | |
| hat brim width | 1.26 (close-up) / 1.27 (body view) | 1.3 | 1.27 (±0.633) | |
| brim lower edge (front / x ±0.4 / ±0.5 / ±0.6) | 0.617 / 0.54 / 0.36 / 0.40 | | 0.626 / 0.548 / 0.354 / 0.368 | |
| ear width | 0.34 front-projected; pink panel 0.19 | 0.30 | 0.36 front-projected (0.335 across, 0.13 thick) | |
| ear tips above the chin | 1.27 (body view) / 1.205 (close-up) | | 1.271 | |
| ear tips above the hat-dome top | 0.40 (0.55 above the brim top, 0.47 visible from the dome) | 0.65 | 0.40 | see note 3 |
| ear splay from vertical (front view) | 11-15° | | 13° | |

Notes:
1. The director's ±0.21 W is the iris centre. The opening includes the white crescent on the outer side, so its centre is at ±0.241.
2. The mouth's stroke ends curl up, which widens it to 0.166. The lobes alone span ±0.06.
3. I read "rising 0.65 W above the hat top" as above the brim. From the dome top they rise 0.40 W; total height is 1.10 m either way.

## Side view (sheet, metres from the body axis; front is -y)
- Head depth at z 0.50 m: -0.223 to +0.228 (0.85 W). Model: -0.235 to +0.214.
- Chin front at z 0.44 m: -0.168. Model: -0.174.
- **Hat**:
  - front brim -0.44 W at 0.59-0.67 W above the chin;
  - back petal down to 0.29 W, at y +0.54..0.68 W;
  - the brim is tilted back about 16-18°.
  - Model: front 0.608 W at y -0.43; back 0.30 W at y +0.54; tilt 18°.
- Ear (side projection) 0.15 m wide, upright, about 0.15 W behind the head centre.
- Tail: a round ball 0.115 m wide (back view), centre z 0.22 m. Model: 0.125 × 0.121 m, centre z 0.225.
- Feet: 0.276 m long (-0.17 to +0.106). Model: 0.288 (-0.185 to +0.10).

## Full body front (sheet vs model, metres)
- Total height 1.10, the same as the model (1.100).
- Head:body: chin at 0.424, so the head (with hat) is 0.46 of the ear-less height (0.894 m to the hat top). Model: chin 0.424, hat top 0.885.
- Overalls 0.372 wide (z 0.13-0.18), z 0.084-0.408 with the bib. Model shorts 0.383, z 0.086-0.33; bib to 0.379.
- Straps about 0.05 wide, buttons where they meet the bib. Model: 0.047.
- Pocket 0.168 × 0.096, z 0.25-0.34. Model: 0.168 × 0.098, z 0.251-0.349.
- Trowel handle 0.041 wide, top at z 0.38 (front) / 0.41 (side). Model: 0.045 wide, top at 0.412.
- Sleeves to x ±0.235, z 0.29-0.41. Model: to ±0.235, z 0.25-0.43.
- Hands centred at about x ±0.32, z 0.23; span ±0.345 at z 0.20-0.28. Model: span ±0.34 at z 0.16-0.24, so the hands sit about 4 cm low. Arms are 48° out from vertical, as the sheet draws them.
- Feet 0.21 wide each, total 0.45, about 0.085 visible height. Model: 0.225 each, 0.46 total.

## Round 2 (director feedback-1): the hat targets replace the sheet's brim numbers
| | target | model r2 |
|---|---|---|
| petal thickness, middle / rim | 0.07 / 0.035 W | 0.070 / 0.035 W (rounded slab, rolled rim) |
| brim lower edge, front (x ±0.1) | 0.626 | 0.633 |
| brim lower edge at x ±0.5 | 0.45 | 0.436 |
| back petal lower edge | 0.40 | 0.409 (tuner) |
| brim width | 1.27 | 1.26 (±0.631) |
| pink below the petal ring | none | none: the dome pulls inside the skull below hat-z 0.08 |
| ear panel white rim | 0.06 W | 0.060 W (an inset of the ear outline) |
| arms | 38° | 38° |
| pocket top-corner radius / trowel handle | 0.02 m / 0.03 m | 0.020 m / 0.029-0.032 m |

## Round 3 (director feedback-2)
| | target | model r3 |
|---|---|---|
| back-side petals (120° / 240°) lower edge | 0.45-0.47 W (+0.04) | 0.468 W (was 0.432); front edge 0.633, front-side front edges, brim ±0.631 and back 0.409 unchanged |
| pink strip at the temples | closed | the strip was the back-side / back petals showing through under the front-side petals' back edges (colour-ID render, `scratch/dbg_parts.png`); the front-side petals' back halves now drop 0.09 W over the temples and the side undersides sit 2 mm off the skull within 0.10 W of it: tiny wedges remain at most |
| pocket | 0.04 m lower, same size | z 0.211-0.309 (was 0.251-0.349), 0.168 × 0.098 m; it follows the bib's curved front (fit rms 1.5 mm); the bib reaches down to z 0.196 under it |
