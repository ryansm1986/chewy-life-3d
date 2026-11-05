# Takumi (tk-takumi-toy): sheet measurements vs the model, round 1

Measured on `refs/sheet.png` pixels:
- background masks and row scans (`measure/m1.py` head close-up, `measure/m2.py` turnaround, `m2.txt`);
- colour masks for the band, nose and mouth (`measure/m3.py`), least-squares circle fits for the ears (`measure/m4.py`);
- ruled crops at 2-5x with 5-10 px grids (`measure/r_*.png`, `measure/ruled.py`) where the colour masks bleed (the eyes,
  the muzzle outline, the blush, the brows, the pouch, the body).

The model column comes from `measurements-model.json` (the build writes it from the SDF and the meshes) and from pixel
scans of the renders (`preview/body_side.png` against the sheet's side view).

**Anchors**
- **HEAD FRONT close-up.** The head outline is widest at y 740-755 (x 29..318): **W = 290 px**. The features' midline is
  x 173.7 (eye midpoint and nose). The chin (the head's lower edge over the shirt, centre column) is at **y 818**; the
  crown at y 601, so the head is **0.748 W** tall.
- **Turnaround.** The ground line is y 563 and the ear tops y 83. The brief's total height 1.15 m is taken to the ear tops,
  so **417.4 px / m** (note 1).
  - The front-view head is 273 px wide at the cheeks (y 236), so **W = 0.654 m**.
  - The chin is at y 300, so **CHIN = 0.630 m**; the crown (y 96) is at 1.119 m.
  - Body centre x: front 218, 3/4 585, back 1311.5. In the side view the leg axis is x 934 (model y = 0); the head's
    depth centre (forehead 827 / back 1046) is x 936.5, so **HY = +0.006 m**.
- Face values are fractions of W: x from the midline, z above the chin. Body values are metres.

## Face (HEAD FRONT close-up)
| feature | sheet (px) | sheet (W) | model | note |
|---|---|---|---|---|
| head height (crown) | 818-601 | 0.748 | 0.748 | |
| eye centres x / z | 114 and 233.7 / 725.5 | ±0.207 / 0.319 | ±0.207 / 0.319 | |
| eye opening w × h (outer dark contour, lash top to lower rim) | 49 × 51 | 0.169 × 0.176 | lid hole 0.158 × 0.163, + rolled rim and lash ≈ 0.17 × 0.18 | 0.19 W with the wing |
| iris w × h; offset toward the nose | 33 × 40; 7.5 px | 0.114 × 0.138; 0.15 of the opening | 0.75 × ~0.95 of the opening (paint); 0.14 | the iris nearly fills the opening; white crescent on the outer side |
| catchlight | ⌀ 7 px, upper, nose side | 0.21 of the iris | 0.19 of the iris + a small lower one | mirrored on the two eyes |
| muzzle w × h, centre z | 103.5 × 80; y 724.5..804.5 | 0.357 × 0.276; 0.184 | 0.357 × 0.276; 0.184 (painted oval, soft 2-3 mm edge) | widest a little below its middle |
| nose w × h, centre z | 30 × 18.4; y 731..749 | 0.103 × 0.063; 0.269 | 0.103 × 0.063; 0.262 (the button's dome lifts its visible top ~0.007 W) | |
| mouth width; corners / dips / cusp z | 40.6 | 0.140; 0.204 / 0.179 / 0.186 | 0.140; 0.207 / 0.175 / 0.186 | round lobes, the corners curl up |
| blush centre; w × h | (±96, 753) | (±0.33, 0.224); ~0.13 × 0.075 (soft) | (±0.335, 0.224); 0.144 × 0.088 (soft edge) | |
| brows centre; length; thickness | (115, 677); 27 × 6 px | (±0.202, 0.486); 0.092; 0.020 | the same | soft arcs |
| ear disc (circle fit): centre, ⌀ | (93.2, 627.7) r 40.3; (254.1, 627) r 39.7 | (±0.278, 0.657); 0.276 | (±0.282, 0.660); 0.288 disc, 28° outward | outer edge ±0.416 W (model 0.418) |
| light inner ear | ⌀ ~33 px, up and out of the disc centre | ⌀ 0.114 | ⌀ 0.12, offset up 0.13 r and out 0.10 r | |
| headband at the centre (lower / upper edge) | y 651 / 623 | 0.576 / 0.672 (0.097 tall) | 0.582 / 0.663 (front surface) | |
| headband at x ±0.39 W | y 673 / 651 | 0.50 / 0.576 | follows the skull | |
| headband width (front) | 259 px | 0.893 | 0.918 | 17 mm thick, rounded section |
| headband tilt (side view) | front centre z 0.62 W, back 0.425 W over 198 px | 15° back | 15° | |

**Head front widths (W), z above the chin.** Sheet: the outline per row (`m1.py`). Model: the SDF silhouette.

| z | 0.062 | 0.097 | 0.131 | 0.166 | 0.20 | 0.234 | 0.269 | 0.303 | 0.338 | 0.372 | 0.407 | 0.441 | 0.476 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet | 0.845 | 0.907 | 0.952 | 0.979 | 0.993 | 1.000 | 0.997 | 0.986 | 0.966 | 0.945 | 0.917 | 0.893 | 0.883 |
| model | 0.825 | 0.915 | 0.955 | 0.975 | 0.985 | 0.99 | 0.99 | 0.98 | 0.965 | 0.945 | 0.92 | 0.895 | 0.875 |

**Head profile (side view, W from the head centre).**

| z | 0.015 | 0.037 | 0.36 | 0.454 | 0.498 | 0.542 | 0.586 | 0.63 | 0.718 |
|---|---|---|---|---|---|---|---|---|---|
| sheet front | 0.308 | 0.348 | 0.40 | 0.39 | 0.376 | 0.354 | 0.335 | 0.306 | 0.178 |
| model front | 0.263 | 0.347 | 0.425 | 0.38 | 0.364 | 0.352 | 0.338 | 0.312 | 0.171 |

| z | 0.015 | 0.059 | 0.103 | 0.19 | 0.25 | 0.366 | 0.476 | 0.542 | 0.63 | 0.696 |
|---|---|---|---|---|---|---|---|---|---|---|
| sheet back | 0.216 | 0.30 | 0.35 | 0.394 | 0.401 | 0.397 | 0.379 | 0.346 | 0.29 | 0.214 |
| model back | 0.195 | 0.315 | 0.361 | 0.389 | 0.395 | 0.385 | 0.357 | 0.345 | 0.307 | 0.223 |

The nose tip (side view): sheet 0.489 W ahead of the head centre; model 0.511 W.

The head fit is `scratch/fit_head2.py` (Nelder-Mead on 19 parameters). An unconstrained fit (`fit_head.py`) matched every
target within 1.5% but made the cheek mass a rounded box in plan (exponents 4.2); Kuma's round-2 feedback asked for a
head that is round in plan, so the plan exponents are capped at 2.7. That costs 6% at the forehead (z 0.36) and 6% at the
upper back (z 0.476), and the widest width is 0.99 W.

## Body and costume (turnaround, metres)
| feature | sheet | model | note |
|---|---|---|---|
| total height (ear tops) | 1.15 | 1.155 | |
| crown | 1.119 | 1.116 | |
| chin | 0.630 | 0.630 | |
| shoulders (shirt), front width at z 0.60 | ~0.52 (with the sleeve tops) | | |
| overalls width (front, z 0.20-0.27) | 0.606 | 0.611 | |
| body front / back (side, z 0.35-0.40) | -0.254..-0.259 / +0.228 | -0.269 / +0.238 | front includes the bib and the pocket |
| bib top z / top width / straps width | 0.534 / 0.347 / 0.055 (front), 0.048 (back) | 0.534 / 0.348 / 0.054, 0.046 | |
| buttons | x ±0.141, z 0.51, ⌀ 0.040 | the same, ⌀ 0.041 | gold domes on the strap ends |
| pocket | x ±0.158, z 0.254..0.438, U bottom | the same | rolled top hem |
| waistband (back) | z 0.345..0.405 | 0.345..0.405, 9 mm proud | all round; the bib covers it in front |
| strap cross (back) | z 0.529, ends at x ∓0.065 on the waistband | 0.529, ∓0.063 | |
| arm angle; arm span | ~37°; 0.93 | 36°; 0.963 | note 3 |
| sleeve hem | 0.115 m below the shoulder | 0.115 | puffed, rolled hem |
| paw bottom | z 0.27 | ~0.26 | |
| shorts legs: width each × depth; cuff | 0.25 × 0.34; z 0.079..0.139 | 0.25 × 0.32 (elliptical); 0.079..0.139 | |
| crotch | z 0.17 | 0.16 | |
| feet: width × length × height; centres | 0.264 × 0.36 × ~0.09; ±0.175 | 0.268 × 0.364 × 0.104; ±0.174 | two toe grooves |
| tail: ⌀; centre z | 0.105-0.115; 0.278 (back view) / 0.323 (side view) | 0.11; 0.30 | note 4 |
| pouch: x / y / z | 0.19..0.31 / -0.17..-0.02 / 0.17..0.35 | 0.21..0.31 / -0.24..-0.14 / 0.17..0.34 (tools to 0.41) | note 2 |
| bamboo tube ⌀; top z | 0.047; 0.39 | 0.047; 0.41 | |

## Notes
1. **Height.** The brief's "total height 1.15 m" is taken to the ear tops, so the crown is 1.119 m. If the director means the
   crown, everything scales by 1.028.
2. **The pouch side.** The brief says "on his right hip", but all four sheet views put it on his **left** hip (the
   viewer's right in the front and 3/4 views, visible in the side view, which shows his left side, and on the viewer's
   left in the back view). I followed the sheet (+X). The sheet's front and side views disagree a little on where it sits
   (front: x 0.19-0.31, which would be inside the 0.60 m body at the side view's depth); the model hangs it on the
   overalls' surface between the two.
3. **Arm angle.** The sheet's arms hang about 37° out. At the brief's 25-30° the paws would sink into the 0.61 m barrel, so I
   used 36° (Kuma's 38° was accepted for the same reason).
4. **Tail height.** The back view puts it at z 0.278, the side view at 0.323; I used 0.30.
