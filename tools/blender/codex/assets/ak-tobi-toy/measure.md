# Tobi (ak-tobi-toy): Step 0, the sheet measured

All sheet numbers come from pixels of `refs/sheet.png`: row runs and luminance creases (`measure/rows.py`), colour-class features
(`measure/feat.py` -> `measure/feat.json`), body runs (`measure/body.py`), plus gridded 3-5x zooms read pixel by pixel (`measure/grid.py`,
`scratch/g_*.png`, 10 px cells) for the eyes, the ears, the side and back views.

- **W** = head width at the cheeks, measured just under the ear lobes (higher up the ears hide the head's sides).
  - Head close-up front (hf): W = 275 px (x 74..349 at y 750), centre x 216 (the nose and mouth centre), crown y 549, chin y 784:
    **0.855 W** crown to chin.
  - Front turnaround (fb): W = 213 px (x 117..330 at y 240), centre x 224-225, crown y 87, chin y 266, ground y 496.5: **0.84 W**.
- **Scale**: 0.97 m to the crown (the sheet's note) over 409.5 px -> 2.369 mm / px -> **W = 0.505 m**. The model takes a 0.85 W head
  (chin at 0.541 m). The sheet's "2.4 heads" is 2.26 by crown-to-chin; the model follows the drawing.
- The face numbers below are the close-up's (z above the chin, x from the centre, W units).

## Head front (W units)

| Item | Sheet (px, hf) | Sheet (W) | Model | Note |
|---|---|---|---|---|
| Head height, crown to chin | 549 -> 784 | 0.855 (fb 0.84) | 0.850 | |
| Half-width z 0.015 / 0.051 / 0.088 / 0.124 | runs at y 780 / 770 / 760 / 750 | 0.389 / 0.442 / 0.475 / 0.500 | 0.392 / 0.444 / 0.474 / 0.492 | higher up hidden by the ears; model max 0.512 at z 0.25 |
| Eye centre (the opening inside the lash) | (150, 688) / (281, 688) | x +-0.238, z 0.349 | same | |
| Eye opening | 58 x 56 / 60 x 58 px | 0.214 x 0.207 | 0.220 x 0.212 (front projection) | |
| Iris | 40 x 50 / 39 x 51 px | 0.143 x 0.183 | 0.143 x 0.183 (painted) | 0.67 of the opening's width; its bottom on the opening's bottom |
| Iris offset toward the nose | 9 px | 0.033 | 0.033 | white crescent on the outer side |
| Big catchlight | ~9 x 10 px, on the iris centre line, 15 px above its centre | 0.033 dia, +0.055 | 0.035 x 0.037 at +0.052 | small one low on the outer side |
| Upper lash | ~5.5 px at the top; a small wing at the outer corner, out to 1.2 x the half-width at +0.28 of the half-height | 0.020 | 3D roll `Tobi_lash_L/R`, ~0.02 W, wing | no lash paint on the skin |
| Brows | 33 x 10 px, centres (148, 630) / (279.5, 631) | 0.12 x 0.036 at x +-0.239, z 0.556; outer end lower | same (painted arcs) | |
| Band (front centre column) | y 563..605 | z 0.651..0.804, centre 0.727, 0.153 tall | centre 0.727, 0.154 (0.078 m) | bows down toward the sides (tilted ring) |
| Nose | x 200..232, y 701..722 | 0.12 x 0.08, centre z 0.264 | 0.12 x 0.076, centre 0.266 | a rounded inverted triangle |
| Mouth | x 188..244 | 0.207 wide; corners z 0.193, lows +-0.05 at 0.160, cusp 0.175, philtrum up to the nose | corners +-0.10 at 0.193, lows 0.160, cusp 0.175 | a small "w" |
| Blush | 31 x 16 px visible (hf), fb 0.09 x 0.075 | ~0.11 x 0.065 at x +-0.35, z 0.21 | 0.13 x 0.08 soft at +-0.35, 0.21 | |
| Muzzle (cream patch) | rows (`feat.json`) | half-width 0.21 at z 0.15-0.18; top z 0.32; narrows to +-0.10 at z 0.09; cream to the chin at the centre | egg: half-width 0.212, z 0.032..0.335 | |
| Ear outer extent | x 19..396 at y 720 | +-0.685 (hf), +-0.70 (fb), +-0.72 (back) at z ~0.23 | +-0.728 | |
| Ear inner edge (front view) | creases x 92..102 / 322..333 | ~+-0.41 at z 0.3..0.6 | ~+-0.48 | see "differences" |
| Ear bottom | y 757 (hf), 240-242 (fb), 245 (back) | z 0.10 (0.085 side) | 0.089 | |
| Ear tops | y 548 at x 150 / 290 | level with the crown (z 0.85) at x ~+-0.25 | top 0.88 (0.985 m) | |

## Profile (side turnaround, fb scale, y from the head centre at sheet x 914.5 = 0.039 m behind the body axis x 898)

| z (W) | 0.60 | 0.554 | 0.507 | 0.46 | 0.41 | nose ~0.28 | 0.20 | 0.155 | 0.108 | 0.085 | 0.061 | 0.038 | 0.014 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet front y (W) | -0.40 | -0.42 | -0.434 | -0.448 | -0.453 | -0.589 | -0.575 | -0.56 | -0.549 | -0.535 | -0.516 | -0.488 | -0.446 |
| model | -0.397 | -0.416 | -0.431 | -0.444 | -0.453 | -0.577 (tip -0.596) | -0.573 | -0.573 | -0.558 | -0.544 | -0.522 | -0.492 | -0.45 |

Back: sheet +0.455 at z 0.3..0.5, 0.425 at 0.178, 0.387 at 0.108, 0.345 at 0.061, 0.26 at 0.014; model 0.454 / 0.432 / 0.39 / 0.344 / 0.272.
Head depth (no snout) 0.906 W, the snout 0.13 W more. Ear in the side view: an egg, y -0.143 .. +0.40 at its widest (z 0.3..0.5), z 0.085 ..
0.85; model y -0.134 .. +0.387.

## Full body (metres, z above the ground; front turnaround unless marked)

| Item | Sheet | Model |
|---|---|---|
| Crown / chin | 0.970 / 0.546 | 0.970 / 0.541 (ear tops 0.985) |
| Headband | front centre 0.908, back ~0.826 (back view 0.832, side 0.80), 0.078 tall; back knot pad 0.118 x 0.116 | 0.908 / 0.826, 0.078; knot 0.112 x 0.102 |
| Gi collar | z 0.526 under the chin; cream chest V to its point at z 0.482; lapels cross at 0.395, his left over his right | same |
| Sleeves | outer corner (+-0.244, 0.461), armpit (+-0.175, 0.383) | sleeve x to 0.263, z 0.382..0.558 |
| Obi | z 0.31..0.387, +-0.175 (front), side -0.18..+0.175; back knot 0.11 x 0.097 at z 0.313..0.411 | z 0.31..0.41 (knot), +-0.19; knot 0.11 x 0.098 |
| Gi skirt | hem z 0.235 (sides), 0.225 (front); +-0.206; side -0.177..+0.192; panel edge at x -0.057 | hem 0.215..0.238; +-0.213; -0.19..+0.20 |
| Trousers | +-0.218 at z 0.18; the legs part from z 0.157; cuffs at z 0.105, each 0.152 wide at x +-0.10; side -0.154..+0.178 | +-0.226; cuffs at 0.091..0.10 |
| Paws | outermost x +-0.339, lowest z 0.283 | +-0.331, 0.295 |
| Feet | 0.192 wide, centres +-0.128, ~0.10 tall; side 0.26 long | 0.183 wide, +-0.128; 0.256 long |
| Tail | back view: x 0 .. -0.085 (his right), z 0.22..0.32; side: up to 0.43, 0.10 m behind the gi | x +0.04 .. -0.12, z 0.24..0.39, to 0.32 m behind the axis |
| Arm angle | ~48 deg from vertical (stubby) | 38 deg (A-pose for the rig) |

## Where I differ from the sheet or the brief (>5-10%)
- **Ears over the band**: the brief's lesson says ears rise from behind the band; Tobi's sheet (front, side and back) shows his floppy
  ears rooted on the dome ABOVE the band and hanging OVER it. The model follows the sheet (the band thins to 1 cm where the ears hide it).
- **Ear inner edge** in the front view: the sheet's ears overlap the face's sides to x +-0.41 (a perspective effect plus a forward wrap);
  the model's ears hug the head's real sides, so their inner edge reads at ~+-0.48. The outer extent matches (+-0.73 vs +-0.70..0.72).
- **Arms**: 38 deg out (the sheet ~48 deg); the paws' reach still matches within 3%.
- **Tail**: the side view puts the curl higher (to z 0.43) than the back view (to 0.32); the model takes the middle (0.24..0.39) and curls
  to his right like the back view, below the obi knot.
- **Colours**: the swatches are used, with the fur warmed slightly toward the rendered front view (#E6BC88 vs swatch #E8C89A), the muzzle
  cream #FCEBD8 (swatch #FFF4EA, the sheet renders it warmer), white band #FFF8F2, trousers lightened to #34465A (swatch #2A3A4A) for the
  game's dark grade.
