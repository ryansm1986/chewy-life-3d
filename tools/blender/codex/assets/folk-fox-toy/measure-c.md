# Design C, Yume the dreamy schoolkid: Step 0, the sheet measured

All numbers come from pixels of `refs/sheet.png`, row C, with the same tools as `measure-a.md` (`measure/seg.py`, `rows.py`,
`classrows.py`, `feat.py` -> `measure/feat.json`).

## Anchors and scale
- **Front turnaround**: bbox x 1061..1252, y 128..461; the ground at y 461; the ear tips at y 128.
- **The notes: "0.94 m tall"** (to the ear tips) -> 333 px = 0.94 m, **2.823 mm / px**. (C is drawn a touch larger per metre than A.)
- W, the full width at the cheek tufts (y 248): x 1061..1250 = 190 px -> **W = 0.536 m**; centre x 1156.
- **Chin** (the narrowest neck row, y 300; the head / neck line 298): **0.460 m**.
- **Crown** (the gap between the ears closes at y 172): y 170 -> 0.821 m = **0.674 W** above the chin (the close-up 0.70 W).
- **Ear tips** 170 px above the chin = **0.895 W** (close-up 0.905 W): C's ears stand taller than A's, as the notes say.
- Head : height: 0.361 m chin to crown against 0.821 m = **2.27 heads** (the notes say about 2.4).
- Head close-up: bbox x 1322..1521, y 509..690; W = 199 px, centre 1421.5, chin 690.
- Side view: ground 695, ear tips 487 (208 px = 0.94 m, 4.519 mm / px); the body axis = the feet's centre x 1101.

## Head front (W units, z above the chin; close-up)
The close-up matches A's layout within ~0.01 W everywhere (the family shares one face):

| Item | C sheet | A sheet |
|---|---|---|
| Half-widths z 0.045 / 0.085 / 0.126 / 0.166 / 0.206 / 0.246 / 0.286 (tuft) / 0.327 / 0.367 / 0.407 / 0.447 | 0.30 / 0.375 / 0.425 / 0.452 / 0.475 / 0.493 / 0.498 / 0.465 / 0.43 / 0.417 / 0.422 | within 0.01 |
| Eye iris | 0.116 x 0.156 W, centres +-0.158, z 0.307 | 0.113 x 0.153, +-0.163, 0.305 |
| Pupil | 0.075 x 0.121 W, centres +-0.153, z 0.304 | 0.074 x 0.118 |
| Nose | 0.090 x 0.065 W, centre z 0.251 | 0.089 x 0.059, 0.249 |
| Mouth | 0.141 W wide, corners z 0.183, the line's middle 0.151 | 0.148, 0.181, 0.150 |
| Brows | centres +-0.19 (x 1372..1397 / 1446..1471 at y 585-593: centres +-0.19, z 0.50) | same |
| Cream top / bottom | as A (x 0: 0.28 / 0.106; 0.16: 0.40 is the eye; 0.28: 0.26 / 0.25; 0.36: 0.256 / 0.21) | |
| Ear tips | (-0.31, 0.905) / (0.28, 0.91); dark cap down to z 0.59 on the outer rim | A 0.875 |
| Inner ear (cream) | x 0.18..0.37, z 0.558..0.78 | A 0.21..0.36 |

## Profile (side view, W = 190 px x (208 / 333) = 118.7 side px; local y from the head centre, 0.046 W behind the axis)
Head depth at eye level: x 1066..1147 = 81 px = **0.68 W** (A 0.64); the nose tip 45 px ahead of the axis (0.38 W, local -0.43).
The same face profile as A, 6% deeper (modelled with DEPTH 1.06).

## Full body (metres; front turnaround; z above the ground)

| Item | Sheet |
|---|---|
| Ear tips / crown / chin | 0.94 / 0.821 / 0.460 |
| Neck | fawn, +-0.12..0.15 at z 0.45-0.47 (mostly under the chin) |
| Dress | shoulders +-0.14 at z 0.43; the sleeves +-0.18..0.19 at z 0.38-0.40, their openings at ~0.36; an A-line to the hem at z 0.125, +-0.20 there; side: the front -0.118 at z 0.40 sloping to -0.19 at the hem, the back +0.13 |
| Arms (fawn) | from the sleeves at (+-0.20, 0.36); the paws widest +-0.265 at z 0.27, their bottoms 0.235 |
| Legs (fawn) | z 0.06..0.125, each x 0.02..0.135 |
| Feet (fawn) | x 0.01..0.15 each, ~0.06 m tall; side 0.21 m long |
| Satchel | x 0.04..0.22 (her left), z 0.16..0.29; side: its front at -0.19; a thick flap over the top ~55% |
| Band | ~0.045-0.05 m wide, from her right shoulder (x -0.10, z 0.44) across the chest to the bag; the back: from her right shoulder down to her left hip |
| Tail (side) | up to 0.34 m behind the axis, z 0.13..0.375; orange, the cream distal third |

## Differences from the sheet and the notes (> 10%)
- **2.27 heads**, not 2.4.
- **Arms 22 deg out** (sheet ~21 deg; shared brief 25-30).
