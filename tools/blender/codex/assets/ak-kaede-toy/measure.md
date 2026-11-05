# Elder Kaede (ak-kaede-toy): Step 0, the sheet measured

All sheet numbers come from pixels of `refs/sheet.png`: colour classes (`measure/classes.py`, overlay `scratch/classes.png`), silhouettes
(`measure/explore.py` -> `scratch/mask_*.npy`, `measure/bbox.json`), face features (`measure/feat.py` -> `measure/feat.json`), body
(`measure/body.py` -> `measure/body.json`), plus gridded 3-5x zooms read pixel by pixel (`measure/grid.py` -> `scratch/grid_*.png`, 10 px
cells) where the classes merge (the lash, the eye opening's inner edge, the nose, the mouth, the ear edges).

- **W** = head width at the cheeks under the tufts, ears and tufts excluded.
  - HEAD FRONT close-up (hf): W = 264 px (x 84..348 at eye level), centre x 216, crown y 575, chin y 770 (the chin / kerchief shade line on
    the centre column): **0.739 W** crown to chin.
  - Front turnaround (fb): W = 209 px (x 124..332 at y 157..199), centre x 228, crown y 122, chin y 276, ground y 491: **0.737 W**.
- **Scale**: the sheet's note "0.99 m" taken to the **crown** (the same convention as Kazemaru's "1.10 m", and the sheet's "2.4 heads" is
  crown-to-ground over the head: 369 / 154 = 2.40): 0.99 m over 369 px -> 2.683 mm / px -> **W = 0.561 m**, the chin at 0.577 m, the ear tips
  at 1.12 m. (Codex's `notes.md` says "0.99 m including ears"; if the director wants that reading, the whole model scales by 0.883.)
- The two head views agree within 0.3%: the model takes **0.738 W**. Face features from the close-up.

## Head front (W units, z above the chin; hf unless marked)

| Item | Sheet (px, hf) | Sheet (W) | Note |
|---|---|---|---|
| Head height, crown to chin | 575 -> 770 | 0.739 (fb 0.737) | |
| Half-width z 0.023 / 0.045 / 0.068 / 0.091 / 0.114 / 0.136 / 0.159 / 0.182 / 0.205 | rows of `mask_hf` | 0.33 / 0.385 / 0.43 / 0.465 / 0.49 / 0.51 / 0.53 / 0.54 / 0.54 | the broad low cheeks; the chin rounds up |
| Cheek tufts | tips (65, 700) / (369, 700) | x +-0.575, z 0.25-0.27 | soft points; side view: the cream lower half sweeps back to 0.21 W behind the axis |
| Half-width z 0.318 / 0.341 / 0.386 / 0.43 / 0.48-0.66 | | 0.525 / 0.515 / 0.504 / 0.487 / 0.50 | above z 0.48 the outline is the ears' outer flanks |
| Forehead dome (between the ears) | arc from (100, 600) over (216, 575) | half-width 0.44 at z 0.644, 0.38 at 0.68, 0.25 at 0.72, crown 0.739 | |
| Eye centre (the opening inside the lash) | x 163 / 278.5, y 681 | x +-0.219 (pair midpoint x 220.5), z 0.337 | the eyes sit 4.5 px right of the head's centre on the sheet: centred on the model |
| Eye opening, inside the lash | 56 x 48 px | 0.21 x 0.18 | |
| Iris | x 155..191, y 658..705 | 0.136 x 0.178 | fills the height, its top under the lash |
| Iris width / opening width | | 0.65 | |
| Iris centre offset toward the nose | 10 px | 0.038 | white crescent on the outer side |
| Iris bottom / nose top | y 705 / 697 | 0.246 / 0.277 | the iris bottom sits below the nose top (as on Kitsune / Kazemaru): kept |
| Pupil | 21 x 35 px | 0.080 x 0.133 | 0.017 toward the nose and 0.015 above the iris centre; dark brown on the sheet |
| Catchlight | ~10 x 10 px at (176, 669) | 0.038, centred above the pupil centre (+0.032) | one big catchlight on the sheet |
| Upper lash thickness (top) | 8-9 px | 0.032 | thick; the wing flicks out and up to (124, 664): 0.045 W past the opening, 0.065 W above its centre; the outer side lined down to mid-height |
| Brows | 36 x 15 px (incl. the arc), centres x 165 / 273, y 623 | 0.136 long, ~0.03 thick, at x +-0.205, z 0.557 | soft arcs, the outer end lower |
| Nose | x 200..232, y 695..708 | 0.121 x 0.05, centre z 0.259 | a wide rounded inverted triangle |
| Mouth | x 198..243; corners y 716, low points y 724 at x +-0.04, cusp y 719 | 0.17 wide; corners z 0.205, low z 0.174, cusp 0.193 | a small "w", ~0.011 W line; no philtrum line |
| Blush | 31 x 19 px, centres (139, 712) / (296, 712) | 0.12 x 0.07 at x +-0.29, z 0.22 | soft edged |
| Cream lower face, top edge | per column, first saturated fur pixel | 0.312 at the centre, 0.30 at x 0.08, 0.25 under the eyes (x 0.12-0.24), 0.27 at 0.32, 0.288 at 0.40, 0.264 at 0.48, ~0.22 at the tufts | the tufts are orange on top, cream below |
| Ear tip | (130, 513) / (300, 513) | x +-0.32, z 0.977 (0.238 W above the crown) | fb: 0.233 W above the crown |
| Ear outer edge | x 116 at y 518 .. 88 at 578 .. 84 at 608 | x 0.38 at z 0.95, 0.485 at z 0.73, 0.50 at z 0.62 | it continues the head's side line |
| Ear inner edge | (153, 518) .. (186, 548) .. (203, 572) | x 0.24 at z 0.95, 0.11 at 0.84, 0.05 at 0.77 | runs down behind the forehead dome |
| Inner ear (pink) | x 140..215 at y 600, up to ~(148, 540) | a broad triangle, z 0.61..0.87, x 0.14..0.40 at its base | |
| Dark ear cap | outer edge down to y 590, inner edge to ~y 548 | z 0.68 on the outer edge, 0.84 on the inner edge | a tilted lower edge; an orange band below it on the outer rim |

## Profile (side turnaround, W = 209 px, body axis = the feet's centre x 900)

| z (W) | 0.689 | 0.603 | 0.517 | 0.431 | 0.344 | 0.287 | nose tip 0.244 | 0.201 | 0.144 | 0.086 | 0.029 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| front y (W from the axis) | -0.115 | -0.234 | -0.287 | -0.316 | -0.320 | -0.330 | -0.426 | -0.407 | -0.392 | -0.354 | -0.292 |
| back y | 0.43 | 0.474 | 0.526 | 0.555 | 0.574 | 0.565 (z 0.258) | | 0.507 (z 0.172) | 0.45 (z 0.115) | 0.402 | |

**Head depth 0.89 W** (a deep, round mochi; Kazemaru's was 0.71) and its centre sits **0.127 W behind the body axis** (HY). The muzzle projects
~0.10 W past the face. Ears in the side view: the tip at 0.17 W behind the axis, the front edge leaning back from (axis -0.05 W, z 0.72);
the ear's flank reaches back over the head's upper side to 0.48 W behind the axis.

## Full body (metres, front turnaround unless marked; z above the ground; `measure/body.json`)

| Item | Sheet |
|---|---|
| Crown / chin / ear tips | 0.99 / 0.577 / 1.12 |
| Kerchief | a ring round the neck: +-0.19 at z 0.588, its lower edge +-0.158 at 0.545; side 0.36 deep; back: a cream band whose lower edge dips to z 0.50 at the centre (the folded point); the knot under the chin 0.064 x 0.043; two leaf ends down and out to (+-0.075, 0.45), ~0.10 long, ~0.045 wide |
| Kimono top | shoulders +-0.18 at z 0.545; sleeves' outer corners +-0.29 at z 0.43; the torso +-0.16 at the obi, +-0.175 at the chest; side: front -0.10 at z 0.45, back +0.158 |
| Wrap edge | from under the right kerchief leaf (x +0.06, z 0.50) down to (x -0.10, z 0.39) at the obi; below it from x -0.115 to -0.15 at the hem (her left panel over her right) |
| Sleeves | the opening slants from the outer corner (+-0.29, 0.43) to the armpit (+-0.17, 0.335): square to a ~38 deg arm |
| Obi | front z 0.325..0.394, back 0.357..0.421 (higher at the back), +-0.165 wide; back knot 0.10 x 0.064 (z 0.357..0.421) |
| Kimono skirt | under the obi +-0.17 -> hem +-0.215 at z 0.245 (sides) / 0.235 (front); side -0.156..+0.182 |
| Trousers | z 0.07..0.255, +-0.215 barrel; the legs part from z 0.105; the gathered hems at z ~0.075, +-(0.01..0.18); side -0.148..+0.177, 0.24 deep at the hem |
| Paws | x +-(0.212..0.333), z 0.28..0.43 (centre +-0.27, 0.355) |
| Feet | 0.185 wide, centres +-0.105, 0.085 tall; side 0.27 long (toes 0.135 in front of the axis); 3 toes |
| Tail (back) | x 0 .. +0.34 (her left), z 0.09..0.35; the cream tip is the upper outer bulb |
| Tail (side / front) | side 0.16..0.365 behind the axis, z 0.14..0.50 (the tip rising); front: peeks out at x 0.22..0.378, z 0.09..0.405 |

## Where I differ from the director's numbers (>10%)
The brief gives only the total height (about 0.99 m) and the palette. Other notes:
- **0.99 m to the crown**, not to the ear tips (see Scale above). Flagged for the director.
- **The eyes**: on the sheet the pair sits 4.5 px (0.017 W) right of the head's centre; the model centres them.
- **Catchlights**: the sheet shows one big catchlight per eye; the model adds the toy line's small second one, faint.
- **Pupil colour**: the sheet's pupils are dark brown (#5D3F2C); the model paints them darker (#2A1A16) for the toy line's read.
- **Trousers #4A2A26** paint as #5A3630 (the dark-cloth lesson: dark browns go near-black in the game's grade).
