# Folk bunny A (Hana, the gardener): Step 0, measurements on refs/sheet.png

Measured on pixels with PIL/scipy: `measure/sil.py` (silhouette mask: paper distance or neutral chroma, for the white fur),
`measure/rows.py` (row extents), `measure/face.py` (dark / pink / coral feature blobs), `measure/parts.py` (costume colour
classes), `measure/grid.py` (zoomed crops with a pixel grid, read for the small parts). The sheet is 1536 x 1024.

## Anchors
- **Upper-row front view**: ground y 547, centre x 150; crown (head top between the ears) y 203 = 1.05 m, so **327.6 px/m**.
  Ear tips y 107 (1.343 m). Head W 197 px = **0.601 m** (widest at y 298-304); chin y 355 (0.586 m).
- **Head close-up**: W 182 px, chin y 843, face centre x 407 (the outline's centre is 403.5; the face sits 3.5 px right).
- **Lower row** is drawn at its own, smaller scales (side 211.5 px/m from ground 861 to the ear tip 577; back 207 px/m from the
  cuffs' width). Its head is squashed (side head 119 x ~82 px): used for depth ratios only, not sizes.
- The sheet's side view shows her **left** side (the flower is on the near ear), so it pairs with `body_side`.

## Head front (fractions of W; z = height above the chin)
| feature | sheet | model | note |
|---|---|---|---|
| widths at z 0.04 / 0.08 / 0.14 / 0.20 / 0.26 | 0.63 / 0.80 / 0.91 / 0.97 / 0.995 | 0.63 / 0.78 / 0.91 / 0.97 / 0.99 | close-up rows |
| widths at z 0.31 / 0.40 / 0.45 / 0.50 / 0.55 / 0.60 | 1.00 / 0.98 / 0.96 / 0.92 / 0.87 / 0.81 | 1.00 / 0.98 / 0.96 / 0.92 / 0.88 / 0.81 | widest 0.31 (the body view's 0.60 row) |
| head height (crown) | 0.786 close-up / 0.772 body | 0.777 (crown 1.053 m) | the mean |
| head depth | the side view is squashed (unusable) | 0.825 W (bf 0.405 / bb 0.42) | between Chiku 0.76 and Usagi 0.85 |
| eye opening centre x, z | +-0.212, 0.376 (body view 0.365) | +-0.212, 0.376 | |
| eye opening w x h | 0.198 x 0.192 | 0.198 x 0.192 | |
| iris w x h, offset | 0.137 x 0.165 (69 % x 86 %), 0.25 radii nasal, 0.17 down | the same | |
| pupil | barely darker than the iris | 0.42 x 0.54 radii, 80 % | |
| catchlight | one, 0.033 W, 0.19 radii nasal / 0.31 up | the same (+ a faint tiny lower one) | |
| upper lash | ~0.017 W thick, wing tip (1.47, 0.54) radii, a flick to (1.03, 0.94) | ribbon 0.011-0.030 W, wing (1.45, 0.52), flick (1.06, 0.99) | |
| brows | inner (0.176, 0.597) to outer (0.280, 0.563), thick inner end | the same path, 0.020 W at the inner end | |
| nose (#49332D) | 0.088 x 0.060, centre z 0.286 | 0.088 wide, z 0.286 | dark brown button |
| mouth | smile 0.159 W, z 0.181-0.220, up-turned ends; tan philtrum | 0.160, z 0.182-0.223 | |
| blush | (+-0.30, 0.217), 0.14 W round | (+-0.30, 0.217), 0.144 x 0.132 (soft edge) | |
| ears: width, centres | 0.29-0.35 W each, centres ~+-0.22, ~3-4 deg splay | 0.32 W, base +-0.218, splay 3.4 deg, 12 deg face-out | |
| ear tips | 1.264 W close-up / 1.259 body | 1.263 W (1.345 m) | |
| pink panel | 0.203 W wide, top 0.09 W under the tip | 0.20 W (0.06 rim), tip margin 0.09 | |
| flower | 0.29 W across, centre (+0.245, 0.72) | 0.30 W, centre (+0.275, 0.717) | 5 petals + cream button |

## Body (sheet vs model, metres)
| part | sheet | model |
|---|---|---|
| total / crown / chin | 1.343 / 1.05 / 0.586 | 1.345 / 1.053 / 0.586 |
| sleeves | z 0.433-0.577, to x +-0.273 | z 0.39-0.59, to +-0.28 |
| bib top, width | z 0.485, +-0.153 | 0.493 (with its rim), +-0.153 at the top |
| straps | 0.049 wide at x +-0.123 | 0.050 wide at +-0.123 |
| buttons | 0.067 across at (+-0.116, 0.47) | 0.080 across at (+-0.116, 0.468) (round 2 bump, they read small) |
| pocket | 0.269 x 0.15, z 0.259-0.409 | 0.268 x 0.150, z 0.259-0.409 |
| trousers | +-0.232 at z 0.25-0.30 | +-0.242 |
| cuffs | +-0.244, z 0.153-0.235 | +-0.248, z 0.154-0.234 |
| feet | each 0.27 wide, 0.143 visible high | 0.265 wide, 0.148 high |
| hands | outer x +-0.354, arms ~45 deg out | +-0.40 (arms 38 deg: the director's Usagi / Chiku rig angle, so hands sit lower) |
| tail | ~0.15-0.16 across, z ~0.33-0.34 | 0.150 x 0.145, centre z 0.33 |

Notes:
1. The brief's numbers (crown 1.05 m, head 0.44 m, ears +0.30 m) agree with the sheet within 5 % except the head height,
   which measures 0.464 m on the sheet (0.775 W); I modelled the sheet.
2. The side view's head is drawn squashed (depth 1.5 x its height); I did not copy that depth.
