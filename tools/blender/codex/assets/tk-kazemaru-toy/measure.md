# Master Kazemaru (tk-kazemaru-toy): Step 0, the sheet measured

All sheet numbers come from pixels of `refs/sheet.png`: colour classes (`measure/classes.py`, overlay `scratch/classes.png`), silhouettes
(`measure/explore.py`), face features (`measure/feat.py` -> `measure/feat.json`), outlines (`measure/outline.py` -> `measure/outline.json`),
body (`measure/body.py` -> `measure/body.json`), plus gridded 3-4x zooms read pixel by pixel (`scratch/grid_*.png`, 10 px cells) where the
classes merge (the iris top under the lash, the lash wing, the knot ends).

- **W** = head width at the cheeks, ears excluded.
  - HEAD FRONT close-up (hf): W = 355 px (x 34..389 at y 785..797), centre x 211.5, crown y 621, chin y 869 (the chin/collar shade line on
    the centre column): **0.699 W** crown to chin.
  - Front turnaround (fb): W = 262 px (x 84..346 at y 244..256), centre x 215, crown y 118, chin shade line y 312, ground y 532:
    **0.740 W** crown to chin.
- **Scale**: 1.10 m to the crown (the sheet's note) over 414 px -> 2.657 mm / px -> **W = 0.696 m**.
- The two views disagree on the head height by 5.7% (the same ratio for every face feature measured from the crown: the turnaround is
  vertically stretched relative to the close-up). **The model takes 0.72 W** (3% from each), and the close-up's face numbers x 1.03 in z.
  Heights below are "above the chin" in W of that 0.72-W head unless marked (hf) or m.

## Head front (W units)

| Item | Sheet (px, hf) | Sheet (W, hf) | Target (x1.03 z) | Note |
|---|---|---|---|---|
| Head height, crown to chin | 621 -> 869 | 0.699 (fb 0.740) | 0.720 | |
| Outline half-width z 0.06 / 0.10 / 0.14 / 0.18 / 0.22 / 0.26 / 0.30 / 0.34 / 0.38 | | 0.396 / 0.447 / 0.479 / 0.495 / 0.499 / 0.498 / 0.489 / 0.476 / 0.460 | same at z x1.03 | widest 0.50 at z 0.22-0.26; fb within 0.01 |
| Outline above the band | the dome between the ears | (0.215, 0.673), crown flat over +-0.10 | (0.215, 0.693) | the sides above z 0.5 are hidden by the ears |
| Eye centre (the opening without the lash) | x 126.5 / 294.5, y 763.5 | x +-0.236, z 0.297 | z 0.306 | |
| Eye opening, inside the lash | 73 x 67 px | 0.206 x 0.189 | 0.206 x 0.195 | |
| Eye incl. the lash | 81 x 79 px | 0.228 x 0.223 | | |
| Iris | x 111..162, y ~730..796 (top under the lash) | 0.144 x 0.186 | 0.144 x 0.192 | nearly the full height |
| Iris width / opening width | | 0.70 | | (lessons: ~0.68) |
| Iris centre offset toward the nose | 10 px | 0.028 | | white crescent on the outer side |
| Iris bottom / nose top | y 796 / 783 | 0.206 / 0.242 | 0.212 / 0.249 | the iris bottom sits below the nose top, as on Kitsune's sheet: kept |
| Pupil | 31 x ~46 px | 0.087 x 0.130 | | 0.008 toward the nose, 0.01 above the iris centre |
| Big catchlight | 16 x 17 px | 0.046 x 0.049 | | upper left on screen (both eyes), centre (-0.025, +0.034) from the pupil's |
| Small catchlight | 5 x 7 px (his left eye) | 0.014 x 0.020 | | lower right of the pupil |
| Upper lash thickness (top) | ~11-12 px | 0.031-0.034 | | thick; a short wing out at 0.55 of the half-height, the outer side lined down to mid-height |
| Brows | 36 x 13 px, centres x 133 / 289, y 697 | 0.101 x 0.037 at x +-0.220, z 0.484 | z 0.499 | arcs just under the band |
| Nose | x 194..225, y 784..800 (+ philtrum to 807) | 0.086 x 0.046, centre z 0.217 | 0.086 x 0.05, z 0.224 | a rounded inverted triangle |
| Mouth | x 179.5..239.5, corners y 808, low points y 818, cusp y 814 | 0.169 wide; corners z 0.172, low z 0.144, cusp 0.155 | corners 0.177, low 0.148, cusp 0.160 | a small "w" |
| Blush | 47 x 33 px, centres x 87.5 / 331, y 805 | 0.13 x 0.093 at x +-0.342, z 0.179 | z 0.184 | soft edged |
| White lower face, top edge | | 0.25 at the centre, ~0.215 at |x| 0.12..0.30 | 0.257 / 0.22 | b-g colour map (`outline.json`) |
| White lower face, sides | | |x| 0.30 down to z 0.11; 0.26 at z 0.08, 0.20 at z 0.05 | | the lower jaw corners are lavender |
| Headband (front) | centre column y 651..685 | z 0.521..0.614; at x 0.2: 0.513..0.600; x 0.3: 0.493..0.575; x 0.4: 0.454..0.530 | x1.03 | the band bows down to the sides (a tilted ring) |
| Ear tip | (78.5, 557) / (352, 557) | x +-0.385, z 0.873 (0.174 above the crown) | | fb: 0.229 W above the crown; the model takes 0.20 |
| Ear inner edge meets the dome | (173, 623) | x 0.108, z 0.693 | 0.71 | |
| Ear outer edge | from the tip down nearly vertically to the band | x 0.452..0.46, down to z ~0.50 | | |
| Ear slate tip | | z from 0.72 (outer edge) / 0.81 (inner edge) to the tip | | border parallel to the ear base |
| Inner ear (mauve) | x 75..129 / 297..351, y 593..675 | x 0.24..0.39, z 0.55..0.78 | | a triangle inset from the edges |

## Profile (side turnaround, fb scale, body axis = the hakama's centre x 914; z scaled x0.973 to the 0.72-W head)

| z (W) | 0.66 | 0.60 | 0.525 | 0.43 | 0.33 | 0.29 | nose tip ~0.21 | 0.136 | 0.097 | 0.058 | 0.019 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| front y (W) | -0.15 | -0.26 | -0.317 | -0.344 | -0.359 | -0.359 | -0.462 | -0.439 | -0.408 | -0.370 | -0.282 |

Back: z 0.51: 0.34, 0.195: 0.359, 0.136: 0.328, 0.078: 0.271, 0.039: 0.183. **Head depth 0.71 W** (a wide, shallow mochi; Kitsune's was 0.86).
The muzzle projects 0.10 W past the face.

## Full body (metres, front turnaround unless marked; z above the ground)

| Item | Sheet |
|---|---|
| Crown / chin | 1.10 / 0.585 (fb); 0.599 with the 0.72-W head |
| Ear tips | 1.259 (front), 1.286 (side) |
| Headband | front centre z 1.00 (0.966..1.033), back centre 0.93 (0.898..0.962), 0.066 tall; back knot at z ~0.88..0.93; the tails down to 0.763, x +-0.03..+-0.12, 0.13 m behind the head (side) |
| Gi top | collar z 0.59; 0.44 m across under the sleeves; side: chest -0.205 .. +0.167 |
| White chest V | from +-0.078 at z 0.585 to its point at z 0.457; navy lapels ~0.05 wide, crossing at z 0.385 |
| Sleeves | top from the shoulder to the outer corner (+-0.346, z 0.478); the opening slants from that corner to the armpit (+-0.208, 0.377), i.e. square to a 31-35 deg arm |
| Belt | z 0.315..0.386, 0.46 wide; knot 0.088 x 0.072 at z 0.351, 0.05 proud (side); ends down to z 0.236 / 0.244, splayed |
| Gi skirt | under the belt +-0.25 -> hem +-0.278 at z 0.205 (sides) / 0.18 (front); side -0.205..+0.21; panel edge at x +0.08 (his right panel on top) |
| Hakama | z 0.077..~0.20 visible, +-0.29 wide, the leg gap from z 0.138 to +-0.02 at the hem; side -0.19..+0.20 |
| Paws | x +-(0.245..0.412), z 0.245..0.44 |
| Feet | 0.25 wide, centres +-0.173, 0.085 tall; side 0.33 long (toes 0.20 in front of the axis); 3 toes |
| Tail (back) | from x 0 out to -0.50 (his right), z 0.14..0.59, bulk at (-0.25, 0.30), the tip at the top right |
| Tail (side) | 0.20..0.54 behind the axis, z 0.17..0.59 |

## Where I differ from the director's numbers (>10%)
The brief gives only the total height (1.10 m) and the palette. Other notes:
- **Head height**: the close-up and the turnaround differ by 5.7%; the model takes the middle (0.72 W).
- **Ear tips**: 0.17 W (close-up) vs 0.23 W (turnaround) above the crown; the model takes 0.20 W.
- **"A white collar line"** (brief): on the sheet the lapels are navy and the white is the chest fur in the V. The model follows the sheet
  (navy lapels, a white V).
- **White #FFFFFF** (brief): painted #FFF8F2 (the sheet's lit white is (254, 241, 232)), inside the contract's #fff6ea ceiling-ish and
  so the toon light can't blow it out.
