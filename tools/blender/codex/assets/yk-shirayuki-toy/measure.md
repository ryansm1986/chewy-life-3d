# Granny Shirayuki (yk-shirayuki-toy): Step 0, the sheet measured on pixels, and the model against it

Source: `refs/sheet.png` (1536 x 1024). Scripts in `measure/`:
- `sil.py`: the silhouette mask (distance from the warm background, plus a "cool" test for the near-white fur);
- `body.py`, `parts.py`: row extents and costume colour classes per turnaround panel;
- `feat.py`: feature blobs on the head close-up;
- `grid.py`: ruled 8x crops in W units (`grid_eL.png`, `grid_nose.png`, `grid_brow.png`), where the eye, lash, nose, mouth and
  brows were read.

The model column comes from `measurements.json` (written by the build) and from the same-scale comparisons in `preview/cmp-*.png`.

## Anchors
- **Turnaround**: ground y 516, ear tips y 64.5, so 0.95 m = 451.5 px and **475 px / m**.
  - Crown at the centre column y 153 (0.764 m); chin y 297 (0.461 m).
  - Front W = 192 px = **0.404 m**.
  - Body centres x: 239.5 (front), 572 (3/4), 857 (side, body axis), 1161.5 (back).
  - The side view shows her **left** side (`body_side`); the 3/4 view shows her right side (`*_34R`).
- **HEAD CLOSE-UP (FRONT)**: widest y 752-764, so **W = 246 px**; chin y 826.5; crown y 638, so the head is **0.766 W** tall.
  - The features are centred on x 217.5, 3 px right of the outline's centre (214.5): the painting leans slightly.

## Head front (fractions of W; z above the chin)
| Feature | Sheet | Model | Note |
|---|---|---|---|
| Head height | 0.766 (close-up), 0.75 (body) | 0.765 (crown 0.770 m) | |
| Widths at z 0.04 / 0.08 / 0.14 / 0.18 / 0.22 | 0.654 / 0.805 / 0.919 / 0.959 / 0.988 | 0.644 / 0.800 / 0.924 / 0.964 / 0.988 | |
| Widths at z 0.26-0.30 / 0.34 / 0.38 / 0.42 / 0.46 | 1.00 / 0.992 / 0.980 / 0.959 / 0.935 | 0.996 / 0.992 / 0.980 / 0.960 / 0.936 | mochi bun: widest 0.26-0.30 |
| Widths at z 0.50 / 0.54 / 0.58 / 0.62 / 0.66 / 0.70 | 0.907 / 0.870 / 0.821 / 0.764 / 0.683 / 0.626 | 0.900 / 0.860 / 0.816 / 0.764 / 0.696 / 0.596 | the 0.70 row is under the ears' roots |
| Eye opening centre | (±0.226, 0.385-0.397) | (±0.226, 0.388) | |
| Eye opening w × h | 0.21 × 0.18 on the grid; 1.2× the model's first height on `cmp-eyes` | 0.214 × 0.196 | note 2 |
| Iris | about 58-69 % of the opening's width, a little toward the nose, touching the bottom | 0.60 × 0.90 eye radii, 0.20 toward the nose | |
| Pupil | big dark oval, high and nasal in the iris | 0.36 × 0.54 eye radii | |
| Catchlight | one, about 0.045 W, upper nasal | the same, plus a faint small one lower and outer | the brief asks for two |
| Upper lash | about 0.022-0.025 W thick on top; wraps the outer side down to z 0.33; two flicks, tips at (0.345, 0.478) and (0.375, 0.45) | a **separate roll**, 0.32-0.35 eye radii on top, outer wrap to −0.62 radii, two flicks (tips at (1.22, 1.10) and (1.58, 0.70) radii) | flicks about 1.3× longer than drawn, so they read |
| Brows | from (0.168, 0.636) peaking at (0.19, 0.643) to (0.297, 0.580); about 0.018 W thick at the inner end | the same path, 0.024 W thick inside, tapered | |
| Nose | 0.095 × 0.06, centre z 0.30 | 0.096 wide, centre z 0.298 | |
| Muzzle puffs | two, x −0.10..+0.125 (each about 0.11 wide), z 0.18-0.29 | centres ±0.056 at z 0.236, radii 0.060 × 0.046 × 0.056, 0.060 W proud of the jaw | sculpted, not painted |
| Mouth | a 'w' along the puffs' bottoms: corners (±0.105, 0.215), the dips 0.180, the centre notch 0.203 | the same points | |
| Blush | centre (±0.322, 0.20), core 0.10 × 0.085 | (±0.322, 0.200), 0.124 × 0.104 with a soft edge | |
| Ears, front | 0.35-0.38 W wide; centres ±0.20 at z 0.84 → ±0.24 at z 1.08; tips 1.19-1.21 | 0.36 projected; base ±0.150, splay 10°; tips 1.192 W (0.943 m) | |
| Pink panel | about 0.19-0.20 W wide; top about 0.11 W under the tip | rim 0.080 (0.20 wide); top 0.125 under the tip | |

## Head profile (side view, W from the head centre)
| z | 0.03 | 0.07 | 0.11 | 0.15 | 0.19 | 0.235 | 0.28 | 0.32 | 0.36 | 0.44 | 0.53 | 0.61 | 0.69 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet front | −0.36 | −0.41 | −0.445 | −0.46 | −0.48 | −0.49 | −0.49 | −0.47 | −0.42 | −0.39 | −0.37 | −0.34 | −0.24 |
| model front (x = 0) | −0.367 | −0.420 | −0.448 | −0.460 | −0.459 | −0.467 | −0.451 | −0.447 | −0.396 | −0.383 | −0.363 | −0.333 | −0.270 |
| sheet back | | | 0.35 | | 0.40 | 0.41 | | 0.42 | | 0.41 | 0.39 | 0.35 | 0.28 |
| model back | 0.197 | 0.277 | 0.329 | 0.365 | 0.389 | 0.405 | 0.410 | 0.409 | 0.404 | 0.389 | 0.366 | 0.335 | 0.268 |

The model's profile is taken at x = 0, in the valley between the two puffs. The puffs' own fronts (x ±0.056) stand about 0.02 W further forward, so the silhouette matches the sheet's −0.48 to −0.49.

## Body (turnaround, metres)
| Feature | Sheet | Model |
|---|---|---|
| Total / crown / chin | 0.95 / 0.764 / 0.461 | 0.943 / 0.770 / 0.461 |
| Kimono top | hem z 0.19-0.20; ±0.13 at the shoulders, ±0.135-0.14 at the obi, ±0.166 at the hem; depth −0.135 / +0.14 low | hem 0.189; ±0.122 / ±0.138 / ±0.167; −0.138 / +0.142 |
| Lapel band | about 0.04 m wide: a diagonal from under the right leaf to (−0.045, 0.33), then near-vertical at x −0.06 to the hem | the same paths, 0.042-0.044 m wide, 8 mm proud |
| Obi | z 0.269-0.327, ±0.135-0.142 | z 0.262-0.334, ±0.147 (rounded edges) |
| Obi back plate | 0.11 × 0.089 m, z 0.265-0.354 | 0.110 × 0.090, z 0.264-0.354, 3 cm proud |
| Sleeves | out to ±0.22 at z 0.37, bottom edge about z 0.30 | out to ±0.234, z 0.309-0.493 |
| Arms / paws | about 46° out; paw centre (±0.224, 0.31), about 0.10 m across | **44° out** (note 1); paw centre about (±0.225, 0.30), 0.10 × 0.09 m |
| Trousers | ±0.152 (±0.133 at the hems), depth −0.116 / +0.12, hems z 0.085-0.10 | ±0.159, −0.115 / +0.123, hem 0.085 |
| Feet | 0.158 wide, 0.215 long, about 0.10 high, centres ±0.09 | 0.159 × 0.215, centres ±0.090 |
| Tail | ball about 0.072 m, centre z 0.22, 0.053 m proud of the kimono | 0.075 × 0.073 m, centre z 0.222, 0.047 proud |
| Kerchief band | sides z 0.42-0.46 under the chin; back z 0.40-0.467 (U-shaped); ±0.12 wide | z 0.394-0.466, ±0.144 |
| Knot | about 0.047 m, z 0.41 | 0.049 × 0.045 m, centre z 0.410 |
| Leaf ends | tips (±0.08, 0.347), about 0.058 wide, 0.075 long | tips (±0.08, 0.337), 0.068 wide, 0.10 long |

## Notes (differences over 5 %, and calls I made)
1. **The arm angle**: the sheet holds the arms about 46° out. I used 44°, close to the sheet and to the 38-40° the earlier villager rigs locked. The paws land on the sheet's paw centre.
2. **Eye height**: the ruled grid gives an opening 0.18 W tall. The same-scale `cmp-eyes` showed my first model (0.171) about 20 % short, because the lens and lash cover part of the opening. I set the model's opening to 0.196 W so the visible eye matches the sheet's on the comparison.
3. **Ears**: turned 14° outward (Chiku's lesson; the brief allows 12-20°) and 0.23 W deep at the base, tapering 30 %. So both 45° game yaws see a thick oval paddle. The sheet's side view draws the ear turned further, about 0.34 W wide. The model's side view shows it narrower (about 0.24 W).
4. **The leaf ends** are about 15 % larger than measured, so they read at game distance (Sasa's choice too).
5. **The director's rough numbers**: the brief gives only the 0.95 m height, which matches (0.943).
