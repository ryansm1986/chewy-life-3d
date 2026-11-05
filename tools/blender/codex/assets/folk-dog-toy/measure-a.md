# Folk dog A (Mugi, the patient gardener): Step 0, measurements on refs/sheet.png

Tools: `measure/grid.py` (zoomed crops with a labelled pixel grid), `measure/rows.py` / `measure/sil.py` (silhouette rows),
`measure/dog.py` (palette classes per row). The sheet is 1536 x 1024; row A is the top row.

## Anchors
- **Upper-row front view** (panel x 75-277): ground y 307, skull crown y 75 (the leaf top y 71) -> **221 px/m** for the brief's
  1.05 m crown. Centre x 177. Head W (cheek points, y ~158) 114.5-240 = **125 px = 0.566 m**. Chin y 185.5 = **0.550 m**.
  Head height 110.5 px = **0.89 W**.
- **Head close-up** (x 912-1233): crown y 85, chin y 283.3, W 205 px, centre x 1075.8. It draws the head taller (0.966 W): its
  x positions are used in W, its heights as fractions of the head height x the body view's 0.89 W.
- Side view (x 519-666) and back view (x 695-890) share the front view's ground and scale; side body axis x 588.
- The brief's "skull height ~0.44 m" measures 0.50 m on the body view (0.89 W); the model follows the sheet.

## Head front (fractions of W, z above the chin)
| feature | sheet | model |
|---|---|---|
| head height | 0.89 (body) / 0.966 (close-up) | 0.889 (crown 1.053 m) |
| widest | 1.00 at z ~0.21 | 0.996 at 0.20-0.26 |
| eye opening centre x, z | +-0.25 (L -0.245, R +0.26), 0.42 (0.39 body, 0.474 H close-up) | +-0.250, 0.415 |
| eye opening w x h | 0.233 x 0.243 | 0.226 x 0.240 |
| eye facing | (outward) | 26 deg out, 8 deg up |
| brows | arch x 0.17-0.29, peak z 0.69, ~0.04 W thick mid | the same path, 0.038 W thick mid |
| nose | 0.130 W wide, z 0.324, h 0.078 | 0.132, z 0.325, 0.082 |
| mouth (omega) | 0.240 W, z 0.199-0.254, dark philtrum | 0.240, z 0.200-0.254 |
| cream muzzle pad | 0.49 W wide, z 0.06-0.33 | 0.49 x z 0.055-0.335 (painted), ~0.03 W proud |
| blush | (+-0.366, 0.265), 0.155 x 0.10 W | (+-0.366, 0.262), 0.156 x 0.104 |
| ears: roots | head top corners, x 0.29-0.40, z 0.82 | root along the skull corner, top z 0.84 |
| ears: outer edge | +-0.79 W at z 0.21 | +-0.761 W (-3.7 %) |
| ears: bottoms | z 0.05 at x +-0.61 | z 0.02 |
| ears: fore-aft (side view) | 0.32 m = 0.57 W, over the back half of the head | 0.48 W section (0.27 m) |
| leaf | centre (+0.39, 0.79), 0.39 x 0.19 W, tip out-down | centre on the corner, 0.42 x 0.25 x 0.064 W, groove |

## Body (sheet vs model, metres)
| part | sheet | model |
|---|---|---|
| total (leaf top) / crown / chin | 1.068 / 1.05 / 0.550 | 1.070 / 1.053 / 0.550 |
| overalls: width / hem / top edge | +-0.257 at z 0.23 / 0.122-0.136 / bib line 0.446 | +-0.259 / 0.125 (+ rolled hem to 0.15) / 0.446 all round |
| straps | 0.077 wide, centres x +-0.13 | 0.072 wide, x +-0.128 |
| buttons | 0.079 dia at (+-0.135, 0.41) | 0.086 at (+-0.133, 0.41) |
| pocket | 0.27 wide, z 0.197-0.348, U bottom | 0.269, z 0.197-0.348 |
| arms (hands) | hand centre (+-0.335, 0.31), ~0.10 wide | (+-0.33, 0.30), 0.13 mitten |
| feet | 0.23 wide, 0.12 visible, 0.31 long | 0.229 wide, 0.31 long |
| tail | base z ~0.20-0.26, tip (y +0.30, z 0.40), cream tip ~40 % | z 0.18-0.41, tip y +0.37, cream past 0.6 of its length |

Notes: the sheet's arms read a little shorter than a 38-deg rig arm; the model's are 36 deg, scaled 0.88.
