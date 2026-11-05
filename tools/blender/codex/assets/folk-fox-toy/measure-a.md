# Design A, Hana the sunny gardener: Step 0, the sheet measured

All numbers come from pixels of `refs/sheet.png` (1536 x 1024), row A: silhouettes (`measure/seg.py` -> `scratch/mask_a_*.npy`,
`measure/bbox.json`), row extents (`measure/rows.py`, `measure/classrows.py`), face features on the head close-up (`measure/feat.py`
-> `measure/feat.json`), and a gridded 4x zoom read pixel by pixel (`scratch/grid_a_hf.png`, 10 px cells).

## Anchors and scale
- **Front turnaround**: bbox x 37..260, y 109..461; the ground at y 462 (the feet's lowest pixels 461); the ear tips at y 109.
- **The notes: "1.05 m tall ... overall game heights include ear tips"** -> 353 px = 1.05 m, **2.975 mm / px**.
- The head's full width at the cheek tufts (y 229-237): x 37..260 = 223 px -> **W = 0.663 m** (W, in this family, includes the tufts;
  Mikan's W did not, she had none). The centre x 148.5.
- **Chin** (the head / neck line on the centre column, the narrowest neck row 293-297): y 295 -> **0.497 m**.
- **Crown** (between the ears, x 156): y 151 -> 0.925 m = **0.646 W** above the chin (the close-up reads 0.69 W; I use 0.66 W).
- Head : height. 0.428 m chin to crown against 0.925 m to the crown = **2.16 heads**, not the notes' "about 2.4" (the notes call their
  numbers modelling targets "not measurements extracted from the raster"). I follow the pixels.
- Head close-up (hf): bbox x 305..507, y 508..687; W = 203 px, centre x 406, chin y 687.
- Side view: ground 694, ear tips 483 (211 px = 1.05 m, 4.976 mm / px); the body axis = the feet's centre x 74.5. W in side px = 133.3.

## Head front (W units, z above the chin; close-up unless marked)

| Item | Sheet | Note |
|---|---|---|
| Head height, chin to crown | 0.646 (turnaround) / 0.69 (close-up) | modelled 0.66 |
| Half-width z 0.034 / 0.054 / 0.074 / 0.094 / 0.113 / 0.133 / 0.153 / 0.172 / 0.192 / 0.212 / 0.232 / 0.251 | 0.285 / 0.32 / 0.355 / 0.38 / 0.405 / 0.425 / 0.44 / 0.45 / 0.465 / 0.475 / 0.483 / 0.49 | the jaw rounds broadly into the ruff |
| Half-width z 0.27-0.31 (the tuft points) / 0.33 / 0.35 / 0.37 / 0.39 / 0.41 / 0.43 / 0.45-0.55 | 0.497 / 0.488 / 0.455 / 0.436 / 0.421 / 0.41 / 0.40 / 0.41-0.42 | above ~0.47 the outline is the ears' outer flanks |
| Eye opening (inside the lash) | x 0.105..0.255, z 0.228..0.39 -> **0.15 x 0.16 W, centres x +-0.18, z 0.31** | round, a touch taller than wide |
| Iris | 0.113 x 0.153 W, centre x 0.163, z 0.305 | iris / opening width 0.75; tucked 0.017 W toward the nose |
| Iris bottom / nose top | 0.232 / 0.276 | the iris bottom sits below the nose top (kept, as on the sheet) |
| Pupil | 0.074 x 0.118 W, centre 0.005 further toward the nose, z 0.30 | dark brown |
| Catchlight | one round light 0.03 W at (x 0.135, z 0.342): up and toward the nose in both eyes | (+ a tiny second one, lower outer, my addition after the shared brief, faint) |
| Upper lash | thick over the top, three short flicks down the outer side at psi ~0.74 / 0.41 / 0.10 rad, tips ~1.3 opening radii out | a thin dark contour round the bottom |
| Brows | centres x +-0.19, z 0.50; 0.115 W long; ~0.022 W thick | soft arcs |
| Nose | x 400..417, y 631..642 -> 0.089 x 0.059 W, centre z 0.249 (top 0.276, bottom 0.222) | a rounded inverted triangle |
| Mouth | 0.148 W wide, the corners +-0.072 at z 0.181, the line's middle 0.150 (bottom 0.143) | a simple U, curled corners, **no philtrum** |
| Blush | centres x +-0.28, z 0.18; ~0.135 x 0.12 W | soft, on the cream |
| Cream lower face (top) | x 0: 0.29, 0.08: 0.265, 0.12: 0.245, 0.16-0.22: ~0.23 (right under the eyes), 0.28: 0.255, 0.32-0.36: 0.26, 0.40: 0.25 | it reaches the outline under the tufts |
| Cream lower face (bottom) | x 0: 0.105, 0.12: 0.115, 0.20: 0.135, 0.28: 0.17, 0.36: 0.20, 0.40: 0.21 | orange round the jaw below |
| Ear tips | (-0.30, 0.877) / (0.27, 0.872) close-up; front turnaround 0.834 W | modelled +-0.285 at 0.835 (the turnaround, so the height is 1.05 m) |
| Ear outline | outer x 0.42 at z 0.47-0.60, 0.40 at 0.70, 0.38 at 0.76, 0.36 at 0.80, 0.33 at 0.86; inner from (0.13, 0.70) up to (0.25, 0.87) | |
| Inner ear (cream) | x 0.21..0.36, z 0.557..0.77 | a triangle |
| Dark cap | down the outer rim to z ~0.60, on the inner edge to ~0.75 | a strongly tilted lower edge |
| Flower | ~0.27 W across (x -0.27..0, z 0.55..0.80), centre (-0.135, 0.675); centre disc 0.07 W | at her right ear's inner front |

## Profile (side view; W units, local y from the head centre HY, which sits 0.075 W behind the body axis)

| z (W) | 0.56 | 0.49 | 0.41 | 0.34 | 0.26 | nose tip 0.225 | 0.19 | 0.15 | 0.11 | 0.075 | 0.04 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| front | -0.20 | -0.25 | -0.29 | -0.31 | -0.33 | -0.41 | -0.39 | -0.385 | -0.365 | -0.34 | -0.29 |
| back | 0.23 | 0.27 | 0.30 | 0.32 | 0.32 | | 0.30 | 0.29 | 0.27 | 0.23 | 0.16 |

**Head depth 0.64 W** at eye level (without the muzzle). The ear tips ~0.09 W behind the head centre.

## Full body (metres; front turnaround unless marked; z above the ground)

| Item | Sheet |
|---|---|
| Ear tips / crown / chin | 1.05 / 0.925 / 0.497 |
| Shirt | the neck +-0.165 at z 0.50; shoulders +-0.21 at 0.46; the sleeves +-0.25 at 0.41-0.43, their openings at z ~0.40 |
| Overalls bib | top edge z 0.42, x +-0.155 with rounded corners; the straps x 0.09..0.125 (centres +-0.105) over the shoulders, straight down the back |
| Pocket | x -0.10..0.11, z 0.24..0.38 (rounded) |
| Overalls body | +-0.21..0.22 at z 0.15-0.23; side: the front -0.17 (pocket incl.), the back ~0.17 |
| Shorts | the legs part at z ~0.17; rolled cuffs at z 0.125..0.15 |
| Arms | from the sleeve at (+-0.25, 0.40) to the paws; the paws widest +-0.32 at z 0.28-0.30, their bottoms 0.24; ~0.12 m thick; hanging ~20 deg out |
| Legs | orange, z 0.07..0.13, each x 0.03..0.18 |
| Feet | x 0.01..0.20 each (0.19 wide), ~0.075 m tall; side 0.25 m long, centred under the axis |
| Tail (side) | up to 0.40 m behind the axis, z 0.15..0.48; a broad teardrop, the cream tip the upper third |
| Tail (back) | a big oval, a little to her left (x -0.12..+0.22) |

## Differences from the sheet and the notes (> 10%)
- **2.16 heads**, not 2.4 (see Anchors).
- **Arms 22 deg out**: the sheet hangs them ~20 deg; the shared brief asks 25-30. A compromise, a touch wider than the sheet.
- **A tiny second catchlight** (the shared brief); the sheet shows one.
