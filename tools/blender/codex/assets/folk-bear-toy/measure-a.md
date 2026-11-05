# Hana (folk-bear-a-toy): sheet measurements vs the model, round 1

Measured on `refs/sheet.png` pixels with the scripts in `measure/`: row scans of the background mask (`m2.py`, `m4.py`),
colour-class row extents (`m7.py`), dark / cream / blush blob boxes (`m5.py`), least-squares circle fits for the ears
(`m6.py`), and ruled crops at 4-6x with 5-10 px grids (`ruled.py`, `r_*.png`) where the masks bleed. Model numbers come
from `measurements-a.json` (written by the build from the SDF and the meshes).

**Anchors**
- Front views share one scale: ground y 491; A's ear tops y 131 = **1.05 m**, so **342.9 px / m**. Body midline x 143.
- Front view: cheeks widest at y 236-248, 195 px, so **W = 0.569 m**; chin y 295 (**0.572 m**); crown y 145 (0.77 W).
- Head close-up (x 290-500): W = 192 px at y 666, chin y 724.5, crown y 568 (**0.8125 W**), features' midline x 395.
- The two drawings disagree on the crown (0.77 vs 0.81 W). The fit uses **0.80 W**: within 4% of both.
- Side and back views are reduced: ground y 751, ear tops y 524, so 216 px / m.

## Face (head close-up, fractions of W; x from the midline, z above the chin)
| feature | sheet | model | note |
|---|---|---|---|
| head height (crown) | 0.8125 (close-up), 0.77 (front) | 0.80 | see above |
| head widths z 0.06 / 0.10 / 0.20 / 0.30 / 0.42 / 0.51 | 0.67 / 0.81 / 0.955 / 1.00 / 0.95 / 0.88 | 0.665 / 0.805 / 0.96 / 0.99 / 0.95 / 0.875 | widest at z 0.30 (rounder chin than Takumi) |
| head widths z 0.60 / 0.70 / 0.76 (behind the ears, estimated) | ~0.79 / 0.64 / 0.47 | 0.785 / 0.64 / 0.46 | |
| profile: forehead z 0.40 / 0.53 / 0.63 ahead of the centre | 0.401 / 0.376 / 0.317 | 0.425 / 0.374 / 0.311 | side view, W 119 px |
| profile: back z 0.10 / 0.30 / 0.50 / 0.70 | 0.33 / 0.397 / 0.355 / 0.20 | 0.333 / 0.389 / 0.349 / 0.209 | |
| nose tip ahead of the head centre | 0.494 | 0.490 | |
| eye centres x / z | ±0.212 / 0.390 | ±0.212 / 0.392 | opening centres |
| eye opening w × h (interior) | 0.172 × 0.172 (outer contour 0.193 × 0.203) | lid hole 0.173 × 0.176, + rim and lash | |
| iris w × h; toward the nose | 0.12 × 0.165; 0.17 of the opening | 0.70 × 1.0 of the hole; 0.165 | white crescent on the outer side |
| muzzle w × h, centre z | 0.391 × 0.303, 0.206 | 0.391 × 0.303, 0.206 (painted oval, gentle swell) | |
| nose w × h, centre z | 0.113 × 0.061, 0.314 | 0.113 × 0.061, 0.314 | glossy oval button, 17 mm proud |
| mouth width; corners / bottom z | 0.184; 0.237 / 0.186 | 0.184; 0.237 / 0.186 | one U, curled ends, no philtrum (as the sheet) |
| blush centre; w × h | (±0.315, 0.245); 0.13 × 0.10 | (±0.315, 0.245); 0.13 × 0.10 (soft) | |
| brows centre; length; thickness | (±0.208, 0.628); 0.125; 0.026 | the same | soft arcs |
| ears: centre x / z, ⌀ | close-up ±0.3125 / 0.664, 0.47; front ±0.328 / 0.62, 0.44 | ±0.322 / 0.645, 0.456 | between the two drawings (note 1) |
| inner ear ⌀, offset | ~0.20, up and out | 0.21, up 0.12 r, out 0.14 r | |
| flower centre x / z, ⌀ (her left ear) | +0.27 / 0.77, 0.32 (centre ⌀ 0.10) | +0.26 / 0.76, 0.30 (centre ⌀ 0.11) | five fat petals, faces forward-up-out |

## Body (front view, metres)
| feature | sheet | model | note |
|---|---|---|---|
| ear tops (total height) | 1.05 | 1.068 | +1.7% (note 1); flower top 1.081 |
| crown / chin | 1.009 / 0.572 | 1.028 / 0.572 | |
| overalls widest (z 0.25) | 0.484 | 0.482 | the pear: torso width 0.37 at z 0.50 |
| body depth (side, belly) | ~0.39 | 0.41 | |
| bib top z, top width | 0.499, 0.277 | 0.500, 0.278 | |
| straps width, centre x | 0.066, ±0.105 | 0.064, ±0.107 | straight up front, straight down the back (no cross) |
| buttons ⌀, z | 0.067, 0.47 | 0.067, 0.47 | accent green, painted ring |
| pocket w × h, z | 0.213 × 0.12, 0.295-0.414 | 0.213 × 0.119, 0.295-0.414 | accent green, rolled top hem |
| overalls back top | ~0.45-0.47 (side / back views) | 0.452 + rolled hem | |
| shorts hem z, cuff seam z | 0.114, 0.157 | 0.113, 0.157 | turned-up cuff |
| fur legs width, centre x | 0.166, ±0.105 | 0.164, ±0.110 | |
| feet width, length, height; outer span | 0.20, ~0.26, 0.073; 0.449 | 0.20, 0.264, 0.078; 0.451 | |
| arms: angle, paw bottom z | ~34°, 0.286 | 34°, 0.27 | |
| tail ⌀, z | ~0.12, ~0.29 | 0.124, 0.288 | |

Note 1: the front view puts the ear tops at 1.05 m (0.85 W above the chin); the close-up puts them at 0.90 W. The ears are
set between the two (0.87 W), so the ear tops land at 1.068 m.
