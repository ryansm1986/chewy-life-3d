# Kitsune (kitsune-toy): Step 0, the sheet measured

All sheet numbers come from pixel classification of `refs/sheet.png` (`measure/classes.py`: HSV colour classes; `measure/measure_all.py`
-> `measure/sheet.json`; ruler crops in `scratch/ruler_*.png`). Model numbers come from the build (`measurements-model.json`).

- **W** = head width at the cheeks, the soft tufts included, ears excluded. HEAD FRONT close-up: W = 316 px, crown y 601, chin y 822
  (the chin/collar shade line on the centre column), centre x 212. Full-body FRONT: W = 246 px, crown y 110, chin 284, ground 502.
- **Scale**: 1.10 m to the crown (the brief) -> 2.806 mm / px on the turnarounds -> **W = 0.690 m**, chin at 0.612 m.
- Heights are "above the chin" (z) in W unless marked m; x is from the face centre line.

## Head front (W units)

| Item | Sheet (px) | Sheet (W) | Director's brief | Model | Note |
|---|---|---|---|---|---|
| Head height, crown to chin | 601 -> 822 | 0.699 | 0.70 | 0.706 | |
| Widest outline (cheeks + tufts) | 316 px at y 753 | 1.00 at z 0.20 | | 0.996 at z 0.17-0.20 | |
| Outline half-width z 0.07 / 0.13 / 0.26 / 0.32 / 0.39 | | 0.41 / 0.48 / 0.49 / 0.46 / 0.43 | | 0.38 / 0.49 / 0.48 / 0.46 / 0.45 | |
| Eye centres | x 141 / 287.5, y 720 | x +-0.232, z 0.321 | +-0.225, 0.40 | +-0.232, 0.320 | **z differs from the brief by 20%** (see below) |
| Eye opening (lash outline incl.) | 74 x 71 px | 0.234 x 0.225 | 0.22 x 0.25 | | |
| Eye opening (inside the lash) | ~69 x 67 px | 0.218 x 0.212 | | 0.221 x 0.218 (front proj.) | round, a little flatter on top |
| Iris | 45 x 62 px (x 133-178, y 694-756) | 0.142 x 0.196 | | 0.142 x 0.196 | tall oval, tucked to the nose |
| Iris width / opening width | | 0.63 | ~0.68 (lessons) | 0.62 | |
| Iris centre offset toward the nose | 13 px | 0.041 | | 0.040 | white crescent on the outer side |
| Pupil | 29 x 43 px | 0.092 x 0.136 | | 0.092 x 0.136 | |
| Big catchlight | 11 x 14 px, upper-left on screen | 0.035 x 0.044 | | 0.038 x 0.044 | + a small second one, lower right |
| Upper lash thickness (top) | ~6 px | 0.019 | | ~0.018 | wing at the outer corner |
| Nose | 37 x 21 px, x 195-232, y 745-766 | 0.120 x 0.070, centre z 0.210 | 0.09 wide | 0.120 x 0.070, z 0.212 | **width differs from the brief by 33%**: the sheet's nose is 0.12 W |
| Mouth width (corner to corner) | x 176-252 | 0.241 | 0.22 | 0.240 | the "w": cusp z 0.146, low points z 0.127, corners z 0.177 |
| Brows | 35 x 15 px each, centres x 150.5 / 279.5, y 658 | 0.111 x 0.044 at x +-0.205, z 0.519 | | same (painted arcs) | |
| Blush | soft; centroids x +-103 px, y 770 | ~0.15 x 0.10 at x +-0.326, z 0.16 | 0.13 x 0.08 at +-0.33 | 0.16 x 0.10 (soft edge) at +-0.322, z 0.160 | soft-edged; size is threshold dependent |
| White lower face, top edge x 0 / 0.10 / 0.20 | | 0.266 / 0.244 / 0.199 | | 0.272 / 0.248 / 0.208 | its sides at x +-0.30..0.36 with a white point at z ~0.10 |
| Ear tip | (83, 536) / (343, 537) | x +-0.41, z 0.905 (0.206 above the crown) | "0.50 W above the crown" | z 0.909 (1.240 m), x up to 0.499 | **the sheet's tips are 0.21 W above the crown, not 0.50** |
| Ear base (along the head outline) | inner (160, 598), outer (57, 690) | inner (0.158, 0.709), outer (0.490, 0.418): 0.44 W along the slant, 0.33 W across | ~0.30 W wide | same layout | |
| Ear dark part (both faces) | | from z 0.64 (outer edge) to 0.73 (inner edge) up | "upper third" | same border | the dark covers a bit over the upper half of the visible ear |
| Inner ear (#FFBEAC) | x 77-127, y 574-671 | x 0.27-0.43, z 0.48-0.79 | | | pointed top inside the dark cap |

## Full body (metres)

| Item | Sheet | Model | Note |
|---|---|---|---|
| Crown | 1.10 (brief) | 1.099 | |
| Ear tips | 1.252 (front), 1.313 (side) | 1.240 | the sheet's side ear stands higher; the front is followed |
| Chin | 0.612 | 0.612 | |
| Heads (crown-to-ground / crown-to-chin) | 2.25 (the caption says 2.4) | 2.25 | the drawing is followed |
| Head depth, nose tip to back of head (side) | 0.682 (0.99 W) | 0.683 | the face front at eye level 0.36 W in front of the body axis, the nose 0.49 W |
| Muzzle projection past the face (profile) | 0.13 W | 0.12 W | "short" |
| Kimono + sleeves across | 0.707, z 0.351-0.612 | 0.766, z 0.330-0.612 | |
| Sleeve: top / opening / bottom | top from the shoulder (z 0.58) to x 0.37, z 0.48; bottom z 0.335 at x 0.29 | same layout | short, wide, slanted opening |
| Sash | z 0.376-0.471, 0.387 wide | z 0.376-0.471, 0.414 wide | |
| Bell | 0.118 x 0.112, centre z 0.379, front 0.256 m in front of the body axis | 0.116 x 0.117, centre z 0.380, front 0.262 | keyhole slot (painted) |
| Hakama | z 0.112-0.387, 0.46 wide at z 0.34 -> 0.60 at z 0.17; 0.466 deep | z 0.110-0.40 (top under the sash), 0.628 wide, 0.49 deep | 14 big soft pleats |
| Paws | x +-(0.26..0.44), z 0.27-0.47 | x +-(0.23..0.40), z 0.25-0.43 | mittens |
| Feet | x centres +-0.19, 0.20 wide, 0.135 tall; ~0.27 long | x centres +-0.19, 0.20 wide, 0.165 tall (ankle incl.), 0.28 long | two toe lines each |
| Tail (side) | 0.18 .. 0.53 m behind the body axis, z 0.13 .. 0.63 | 0.12 (root, in the hakama) .. 0.615, z 0.12 .. 0.70 (~15% too big) | teardrop, tip up and back |
| Tail (back) | 0.32 wide, z 0.10 .. 0.55, centred | 0.365 wide, centred | white upper ~55% with a flame edge |

## Where I differ from the director's rough numbers (>10%)
- **Eye height**: the sheet's eye centres are 0.32 W above the chin, not 0.40 (the chin is the shade line on the collar at y 822; the eyes'
  centres are at y 720). I model 0.320 to the sheet. The sheet's iris bottom (z 0.21) is a little below the nose top (z 0.244); the
  shared lesson asks for it at or above. I kept the sheet's layout (it is the approved blueprint) and flag it for the director.
- **Eye opening height**: 0.212-0.225 W on the sheet (round), not 0.25.
- **Nose width**: 0.120 W on the sheet, not 0.09.
- **Ear height**: the tips stand 0.21 W above the crown on the sheet (0.35 W from the middle of the slanted base to the tip), not 0.50.
