# folk-tanuki-a-toy (Momo, the gardener): measured targets vs model (round 1)

Measured on `refs/sheet.png` (row A) with PIL masks (`measure/mext.py`: foreground row extents of each view;
`measure/mface.py` + `measure/grid.py`: the close-up's widths and features on a 0.05 W grid, `measure/grid_a.png`).
Model numbers from `measurements-model-a.json` (written by the build).

## Scale
- Turnaround front: ground y 317.5, skull crown (midline) y 83 -> **1.05 m crown-to-sole = 223.3 px / m**. Ear tops y 72
  (1.099 m). The side and back views share the scale (head 157 / 160 px wide, ground 316-317).
- Head: W (cheek width) 157 px = **0.703 m**; chin y 185 = **0.593 m**; crown-to-chin 102 px = 0.457 m (the notes' target
  0.4375 m: +4%; 2.30 heads, the notes say ~2.4; the drawing wins).
- **Note 1**: the close-up draws the head taller than the turnaround (crown 0.723 W vs 0.650 W), so every close-up
  vertical number is used x 0.90.

## Head (W units, z above the chin)
| item | sheet | model |
|---|---|---|
| crown at midline / x 0.1 / 0.2 / 0.3 W | 0.650 / 0.640 / 0.610 / 0.565 | 0.654 / 0.643 / 0.616 / 0.570 |
| widths z .02/.06/.10/.14 (turnaround + close-up blend) | .65/.82/.915/.96 | .56/.80/.90/.96 |
| widths z .30/.38/.46/.54/.62 | .995/.935/.84/.69/.39 | 1.01/.945/.84/.69/.38 |
| max width | 1.00 | 1.025 (z 0.23-0.27) |
| front profile (side view) at z .18 (muzzle) / .39 / .55 | .48 / .39 / .315 | .473 / .395 / .30 |
| back profile at z .24 / .39 / .55 | .41 / .38 / .29 | .427 / .392 / .302 |
| eye opening centre (x, z) | (0.180, 0.310) | (0.180, 0.310) |
| eye opening w x h | 0.150 x 0.162 | 0.150 x 0.162 |
| iris (of the opening) | 0.73 w, 0.86 h, tucked 0.27 toward the nose | same (painted) |
| big catchlight | up and toward the nose, ~0.03 W | same + a small low outer one |
| muzzle (cream) w x h, centre z | 0.33 x 0.246, 0.177 (top narrower) | 0.332 x 0.248, 0.177 (taper 0.20) |
| nose w x h, centre z | 0.080 x 0.034, 0.275 | 0.085 x 0.039, 0.275 |
| nose tip ahead of the head centre | ~0.50 (side view) | 0.457 |
| smile: width, corners z, bottom z | 0.13, 0.225, 0.194 | 0.132, 0.226, 0.194 |
| blush centre, size | (0.30, 0.211), 0.09 x 0.055 | (0.30, 0.211), ~0.09 x 0.06 |
| brows: x span, peak z | 0.11-0.23, 0.53 | 0.11-0.23, 0.53 |
| mask: x extent, z extent, bridge z | +-0.42, 0.147-0.415, 0.358-0.41 | traced polygon (`_MASK_HALF`), same |
| ears: front x span, apex z | 0.14-0.41, 0.72 | -0.42 outer, apex 0.725 (1.104 m) |
| flower: centre, diameter | (0.33, 0.56), 0.25 | x 0.17-0.41, z 0.43-0.66 (0.24) |

The 0.02-0.06 W widths (the jaw corners) sit 5-14% under the turnaround: the crease-free head fit (the cheek mass's
lower exponent held near its upper one) traded them for a smooth side; the close-up's rounder jaw (0.47 / 0.70) lies
between, so it reads as drawn in the front views.

## Body (metres)
| item | sheet | model |
|---|---|---|
| crown / ear top | 1.050 / 1.099 | 1.053 / 1.104 |
| overalls width (hips, no arms) | 0.58-0.60 | 0.605 |
| body depth (side) | 0.497 | 0.480 |
| arm span (front) | 0.864 | 0.875 |
| overalls top edge (all round) / waist seam | 0.481 / 0.374 | 0.480 / 0.374 |
| shorts hem | 0.132 | ~0.135 (the flat seat) |
| feet outer x / foot width | 0.26 / 0.246 | 0.260 / 0.249 |
| tail: back extent / z span | 0.43 / 0.11-0.365 | 0.418 / 0.09-0.378 |
| strap: centre x, width | 0.13, 0.08 | 0.129, 0.078 |
