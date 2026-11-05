# Mikan (yk-mikan-toy): Step 0, the sheet measured

All sheet numbers come from pixels of `refs/sheet.png` (1536 x 1024): colour classes (`measure/classes.py`, overlay
`scratch/classes.png`), silhouettes (`measure/explore.py` -> `scratch/mask_*.npy`, `measure/bbox.json`), head rows
(`measure/head.py` -> `scratch/head_rows.txt`), face features (`measure/feat.py` -> `measure/feat.json`), body rows
(`measure/body.py` -> `measure/body.json`, `scratch/body_rows2.txt`), and gridded 3-6x zooms read pixel by pixel
(`measure/grid.py` -> `scratch/grid_*.png`, 10 px cells) for the eye opening, the lash, the cheek and the side head.

## Anchors
- **Ground** y 496 (the feet's lowest pixel 495, the line at 496-497).
- **Front turnaround**: head 222 px wide at the cheeks (x 107..329 at y 213-231, centre x 218), the chin (the head / scarf line on the
  centre column) at y 276.
- **Scale**: the sheet's note "1.05 m, 2.4 heads". The crown is hidden under the beret, so I took the note to the **skull crown**
  (Inaho's convention for his hat, Kaede's for her 0.99 m): 2.4 heads from the ground puts the crown at y 119 (496 - 2.4 (276 - 119) = 119),
  which sits under the beret's middle in the front, side and back views. 377 px = 1.05 m -> **2.785 mm / px**; **W = 0.618 m**; the chin at
  **0.613 m**; head 157 px = **0.707 W** chin to crown. The ear tips (y 66) then stand at 1.198 m, the beret's stalk (y 72) at 1.18 m.
  (If the director reads 1.05 m as the overall height to the ear tips, the whole model scales by 0.876.)
- **Head close-up (hf)**: W = 294 px (x 62..356 at y 718-734), centre x 209 (the eye pair's midpoint is x 210), chin y 801.
- **Side**: the body axis = the feet's centre, x 883.5; the side chin y ~273.
- Body centres: front 218, 3/4 551, side 883.5, back 1259.

## Head front (W units, z above the chin; hf unless marked)

| Item | Sheet (px, hf) | Sheet (W) | Note |
|---|---|---|---|
| Head height, crown to chin | (hidden) | 0.707 (2.4 heads) | |
| Half-width z 0.01 / 0.037 / 0.065 / 0.092 / 0.119 / 0.146 / 0.173 | rows of `mask_hf` | 0.30 / 0.349 / 0.40 / 0.432 / 0.459 / 0.475 / 0.486 | a rounder jaw than Kaede's; no cheek tufts |
| Half-width z 0.214 / 0.241-0.282 / 0.31 / 0.337 / 0.364 / 0.391 / 0.418 / 0.446 | | 0.497 / 0.50 / 0.495 / 0.488 / 0.481 / 0.471 / 0.461 / 0.449 | widest at z 0.24-0.28; above z 0.45 the outline is the ears' outer flanks (0.466 at 0.51, 0.478 at 0.58, 0.48 at 0.65, 0.475 at 0.72, 0.463 at 0.79) |
| Eye opening (inside the lash) | x 115..172 / 248..305, y 667..728 | 0.195 x 0.207, centres x +-0.226, z 0.352 | round, a touch taller than wide |
| Iris | x 130..173, y 669..726 | 0.148 x 0.197, centre 0.027 toward the nose | fills the height; iris / opening width 0.76 |
| Iris bottom / nose top | y 726 / 719 | 0.255 / 0.279 | the iris bottom sits a little below the nose top (kept, as Kaede) |
| Pupil | 25 x 35 px | 0.088 x 0.122, ~0.007 toward the nose | a tall dark oval |
| Catchlights | big 14 x 16 px; small ~5 px | big 0.05 x 0.055 at (-0.026, +0.043) from the pupil centre (screen-left, up), small 0.017 at (+0.036, -0.036) | the same light in both eyes |
| Upper lash | 8 px thick over the top; the wing tip (104, 680) | 0.027 W; wing tip at (1.39, 0.58) opening half-axes from the centre | the line runs down the inner side to mid-height and the outer side into the wing; none under the eye |
| Brows | 31 x 12 px boxes, centres (142.5, 640) / (278, 640) | 0.104 long, ~0.018 thick, centres x +-0.23, z 0.548 | soft arcs |
| Nose | x 199..225, y 719..735 | 0.092 x 0.058, centre z 0.252 | a rounded inverted triangle |
| Mouth | x 183..240; corners y ~743, low points y 751 at x +-0.045, the cusp y 747 | 0.197 wide; corners z 0.197-0.20, low z 0.167 (line bottom) / 0.172 (centre), cusp 0.182 | a small "w" with gently curled corners; a short philtrum from the nose (0.221) down to the cusp (0.184) |
| Blush | 35 x 30 px, centres (113, 738) / (308, 738) | 0.12 x 0.10, centres x +-0.332, z 0.215 | soft edged, over the cream / fur border |
| Cream muzzle | per column (`S < 0.36, V > 0.8`) | x +-0.31; top 0.279 (the nose top) at the centre, 0.255 at x 0.14, 0.245 at 0.18-0.22, 0.235 at 0.26; bottom ~0.08 across the middle, 0.095 at 0.26, 0.12-0.15 at 0.30 | under it the orange fur continues down to the chin (a darker band, z 0..0.08) |
| Ear tips | (105, 522) / (314, 526) | x +-0.355, z 0.947 (fb: +-0.336, 0.944) | |
| Ear inner edge | x 158 at y 554, 150 at 546, 141 at 538, 129 at 530 | x 0.173 at z 0.84, 0.20 at 0.867, 0.231 at 0.895, 0.272 at 0.92 | below z 0.84 it runs behind the beret |
| Inner ear (peach) | x 93..144, y 552..640 | x 0.22..0.40, z 0.545..0.845 | a triangle on the front face |
| Dark ear cap | x 73..150, y 524..580 | lower edge from (0.463, 0.752) on the outer rim up to (0.20, 0.86) on the inner edge | |
| Beret (as drawn) | x 142..291, y 532..623 | x -0.228..0.279 (0.51 W, shifted 0.025 to her left); lower edge z 0.62 at the centre, 0.70 at the sides; dome top 0.84; stalk 0.11 W across to z 0.915 | drawn in FRONT of the ears' inner edges and tipped forward; see "Differences" |

## Profile (side turnaround, W = 222 px, body axis x 883.5, chin y ~273)

| z (W) | 0.54 | 0.49 | 0.43 | 0.38 | 0.34 | 0.31 | nose tip ~0.25 | 0.20 | 0.15 | 0.095 | 0.068 | 0.04 | 0.014 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| front y (W from the axis) | -0.277 | -0.304 | -0.322 | -0.331 | -0.34 | -0.345 | -0.453 | -0.435 | -0.412 | -0.376 | -0.349 | -0.304 | -0.25 |
| back y | 0.457 (0.55) | 0.48 | 0.50 | 0.516 | 0.525 | 0.529 | 0.529 | 0.52 | 0.498 | 0.471 | 0.439 | 0.412 | 0.354 |

**Head depth 0.87 W** at eye level (without the muzzle) and its centre sits **0.094 W behind the body axis** (HY). The muzzle projects
~0.11 W past the face. Ears in the side view: the tip at 0.25 W behind the axis (0.16 behind the head centre), z 0.96.

## Full body (metres, front turnaround unless marked; z above the ground; `measure/body.json`)

| Item | Sheet |
|---|---|
| Crown / chin / ear tips | 1.05 / 0.613 / 1.198 |
| Scarf | a plump ring round the neck: +-0.20 at z 0.60, band z 0.55..0.62; side -0.17 .. 0.205; back a smooth band +-0.195. The knot under the chin 0.09 m wide at z ~0.55; two fat egg loops below it, each ~0.085 wide, bottoms at z 0.44, x -0.09..0 and 0.01..0.10; side: the bow stands out to y -0.196 |
| Shirt | shoulders +-0.217 at z 0.585 (under the scarf); the puffed sleeves to +-0.292 at z 0.518, their cuffs round the arm at z ~0.45-0.49; the body +-0.21 at z 0.43, +-0.23 at 0.384, +-0.25 at 0.34, +-0.256 at 0.30 (a peplum flare); the hem at z 0.284, a notch at the front centre (the two panels' rounded corners) up to z 0.318; side: the front -0.118 at z 0.45 sloping to -0.188 at the hem, the back 0.23 at z 0.45 flaring to 0.283 at z 0.35, the back hem ~0.30 |
| Front seam | a straight line down the middle from under the bow (z ~0.45) to the notch |
| Bloomers | z 0.106..0.284 (the top under the shirt), +-0.245 at z 0.22; the legs part from z 0.14; the gathered cuffs at z 0.106-0.117, each leg x 0.02..0.20; side -0.146..0.191 at z 0.25, -0.08..0.135 at the cuff |
| Arms | from under the sleeve at (+-0.28, 0.44) hanging ~33-36 deg out; ~0.12 m thick (side 0.16 deep with the paw); paws x 0.27..0.41, z 0.284..0.40 |
| Feet | x 0.033..0.228 each (centres +-0.13, 0.195 wide), 0.106 tall; side 0.28 long, centred under the axis; 3 toes (two creases) |
| Tail (side) | y 0.17..0.494 behind the axis, z 0.14..0.48; the cream tip the upper back part (y 0.30..0.49, z 0.28..0.43) |
| Tail (front / back) | front: peeking out at her left, x 0.24..0.37, z 0.11..0.31; back: a big oval x -0.15..0.19 (her left positive), z 0.11..0.46, the cream tip up on her left |

## Differences from the sheet, and from the director's numbers (>10%)
The brief gives only the total height (about 1.05 m) and the palette. Notes:
- **1.05 m to the skull crown**, not to the ear tips (see Scale). Flagged for the director.
- **The beret** follows the director's note, not the sheet's side view: the sheet draws it tipped forward on the forehead, in front
  of the ears' inner edges (the side view puts it wholly in front of the ear). The model sets it back on the crown, tilted back,
  between and behind the ears, so the ears stand in front of it and its front edge clears the brows. In the front view its lower
  edge therefore sits higher than the sheet's 0.62 W, and the ears hide its outer edges.
- **The tail**: the sheet's front view (peeking out to x 0.37 m) and back view (centred, x -0.15..0.19) disagree; the model takes
  the middle (the plume sweeps out to her left to ~0.30 m and back), as Kaede did.
- **Catchlights**: as the sheet (a big one upper left, a small one lower right in both eyes).
- **Trousers #4A3A5A** paint as #5C4A6A (the dark-cloth lesson: dark plums go near-black in the game's grade).
- **Scarf #FFFFFF** paints as #FAF0E8 (the colour rule's lightest is about #fff6ea).
