# Tetsu (yk-tetsu-toy): sheet measurements vs the model, round 1

Measured on `refs/sheet.png` pixels:
- background masks and row scans: `measure/m1.py` (head close-up), `m2.py` (turnaround, `m2.txt`), `m5.py` (side head),
  `m6.py` (turnaround silhouettes in metres, all three views);
- colour masks for the band, eyes, nose, muzzle, blush, brows and mouth (`measure/m3.py`), least-squares circle fits for the ears
  (`measure/m4.py`, which also prints the head widths);
- ruled crops at 2-5x with 10 px grids (`measure/r_*.png`, `measure/ruled.py`) for the eyes, muzzle, nose, mouth, apron and body.

The model column comes from `measurements-model.json` (the build writes it from the SDF and the meshes) and from the
same-scale comparisons (`make_compare.py` -> `preview/cmp-*.png`).

**Anchors**
- **HEAD FRONT close-up.** The outline is widest at y 704-720 (x 47..391): **W = 345 px**. The features' midline (nose, mouth,
  muzzle) is x 222 (the silhouette's is 219). The crown (fur above the band, centre column) is y 541. The chin is hidden by the
  scarf; I put it at **y 795**, which gives the head **0.736 W** tall. Cross-checks: the turnaround front gives 0.729 W (crown y 87,
  head bottom at the scarf y 254, W 229 px), the side view 0.72 W; the muzzle's bottom is y 790 (so the muzzle reaches down to the
  chin, as the side view shows).
- **Turnaround.** The ground line is y 484 (the feet stand on it, bottom row 482); the front view's ear tops y 77. The note's
  1.13 m is taken to the ear tops: **360.2 px / m** in the front view. The side view is drawn 3% bigger (ear tops y 65:
  370.8 px / m), the back 1% (ear tops y 73: 363.7 px / m).
  - The front head is 229 px wide at the cheeks (y 194-200): **W = 0.636 m**.
  - Crown y 87 -> 1.102 m; **CHIN = 1.102 - 0.736 W = 0.634 m** (the side view: chin y 250 -> 0.631 m).
  - Body centre x: front 225 (the feet), side (the leg axis, model y = 0) 916, back 1272. The head's depth centre in the side
    view (face 821 / back of the skull 1015 at z 0.34 W) is x 918, so **HY = +0.005 m**.
- Face values are fractions of W: x from the midline, z above the chin. Body values are metres.

## Face (HEAD FRONT close-up)
| feature | sheet (px) | sheet (W) | model | note |
|---|---|---|---|---|
| head height (crown) | 795-541 | 0.736 | 0.736 (skull crown 1.105 m) | |
| eye centres x / z | 140.5, 303.5 / 681 | ±0.236 / 0.330 | ±0.236 / 0.330 | below the director's "iris above the nose top" rule: the sheet's iris bottom (z 0.23) is under the nose top (0.296); I followed the sheet |
| eye opening (white + iris) w × h | 70 × 73 | 0.203 × 0.212 | lid hole 0.202 × 0.212 (+ rolled rim and lash) | |
| eye with the dark contour / lash | 73 × 81 | 0.212 × 0.235 | ≈ 0.215 × 0.235 | lash flick out at mid-height on the outer side |
| iris w × h; offset toward the nose | 46 × 66 | 0.133 × 0.191; touches the nose-side rim | 0.66 × 0.90 of the opening, touching the nose-side rim | white crescent on the outer side |
| pupil w × h | 28 × 45 | 0.61 × 0.68 of the iris, toward the nose and up | 0.70 × 0.75 of the iris radii, offset 0.22 / 0.10 eye radii | the sheet's big dark pupil (round 1 review: enlarged) |
| catchlight | 15 px circle, upper, nose side | 0.32 of the iris | 0.32 of the iris + a small lower outer one | the brief's two catchlights |
| muzzle w × h, centre z | 135 × 103; y 687..790 | 0.391 × 0.299; 0.164 | 0.392 × 0.285; 0.166 | squarer top (superellipse n 3.2), round jaw (n 2.3), widest a little low |
| muzzle in the side view (front, W ahead of the head centre) | z 0.10 / 0.15 / 0.20: 0.471 / 0.49 / 0.505 (nose bottom) | | 0.472 / 0.483 / 0.489 | a displacement of the ball (0.078 W) |
| nose w × h, centre z | 42 × 27; y 695..722 | 0.119 × 0.078; 0.252 | 0.119 × 0.072; 0.252 | broad rounded inverted triangle, 19 mm proud |
| nose tip (side view) | x 795 | 0.513 | 0.516 | |
| mouth: width; corners / bottoms / centre z | 64 px; y 732 / 742 / 736 | 0.186; 0.183 / 0.154 / 0.171 | the same | a 'w' (two bowls) under a short philtrum from the nose (z 0.212 -> 0.171) |
| blush centre; w × h (core) | (±113, 726) | (±0.33, 0.20); 0.13 × 0.087 | (±0.33, 0.20); 0.14 × 0.092 (soft edge) | |
| brows centre; length; thickness | (±76, 613); 50 × 8 px | (±0.22, 0.526); 0.145; 0.023 | (±0.22, 0.498); 0.145; 0.026 | lowered 0.028 W so the band's lower edge doesn't cover them (see note 3) |
| ear disc (circle fit): centre, ⌀ | (120, 579) r 57.8; (323.4, 575.8) r 54.6 | (±0.295, 0.63); 0.325 | (±0.295, 0.625); 0.316, 18° outward | outer edge 0.449 W (sheet 0.458) |
| ear depth (side view) | x 926..985 | 0.03-0.28 W behind the head centre | centre 0.13 W behind | well back on the crown |
| light inner ear | ⌀ ~50 px, up 0.22 r, out 0.14 r | ⌀ 0.15 | ⌀ 0.14, up 0.24 r, out 0.13 r | muted tan |
| headband at the centre (lower / upper edge) | y 604 / 566 | 0.554 / 0.664 | 0.571 / 0.661 (front surface) | |
| headband tilt (side view) | top 850,100 -> 1015,150; bottom 840,122 -> 1013,172 | 16-17° back | 18° + a 0.025 W sag at the sides | note 2 |
| headband width (front) | 312 px | 0.904 | 0.942 | 16.5 mm thick, rounded section |

**Head front widths (W), z above the chin** (sheet: `m4.py`; above z 0.44 the band is on the outline, the targets subtract it).

| z | 0.05 | 0.062 | 0.097 | 0.131 | 0.166 | 0.20 | 0.234 | 0.269 | 0.303 | 0.338 | 0.372 | 0.407 | 0.441 | 0.476 | 0.55 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet | 0.817 | 0.846 | 0.910 | 0.951 | 0.980 | 0.994 | 1.000 | 1.000 | 0.988 | 0.968 | 0.945 | 0.910 | ~0.89 | ~0.86 | ~0.79 |
| model | ~0.75 | 0.790 | 0.895 | 0.945 | 0.970 | 0.980 | 0.985 | 0.985 | 0.980 | 0.960 | 0.940 | 0.920 | 0.895 | 0.865 | 0.760 |

**Head profile (side view, W from the head centre; the band subtracted where it covers the skull).**

| z | 0.037 | 0.10 | 0.20 | 0.36 | 0.454 | 0.498 | 0.542 | 0.586 | 0.63 |
|---|---|---|---|---|---|---|---|---|---|
| sheet front | 0.43 (muzzle) | 0.471 (muzzle) | 0.505 (muzzle) | 0.397 | 0.373 | 0.351 | 0.305 | 0.28 | 0.24 |
| model front | 0.42 | 0.472 | 0.489 | 0.397 | 0.365 | 0.343 | 0.317 | 0.286 | 0.247 |

| z | 0.037 | 0.103 | 0.147 | 0.19 | 0.25 | 0.30 | 0.366 | 0.41 | 0.476 | 0.542 | 0.586 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet back | 0.33 | 0.383 | 0.40 | 0.41 | 0.416 | 0.411 | 0.398 | 0.394 | 0.386 | 0.352 | 0.32 |
| model back | 0.287 | 0.377 | 0.395 | 0.404 | 0.410 | 0.412 | 0.406 | 0.397 | 0.379 | 0.349 | 0.321 |

The head fit is `scratch/fit_head.py` (Funaki's fit_head4: Nelder-Mead, 19 parameters, plan exponents capped at 2.7), then two
manual corrections from the review renders: the cranium moved 0.022 W back and 0.015 W deeper (the fit's back profile sat 0.02-0.03 W
short), its x exponent eased to 2.05 and a 0.016 W rounding on the dome's upper corners, and the cheek mass's lower exponent eased
from 4.5 to 3.6 (rounder lower cheeks). See note 1.

## Body and costume (turnaround, metres)
| feature | sheet | model | note |
|---|---|---|---|
| total height (ear tops) | 1.13 | 1.1315 | |
| crown / chin | 1.102 / 0.634 | 1.105 / 0.634 | |
| torso half-width (front, between the arms) z 0.24 / 0.30 / 0.34 / 0.40 | 0.289 / 0.283 / 0.275 (with the belt) / 0.258 (with the belt) | 0.288 / 0.283 / 0.268 + belt / 0.242 + belt | SDF values (`scratch/torso_test.py`) |
| body front / back (side) | apron front -0.30 (z 0.24-0.32), back 0.235 (z 0.24), 0.217 (0.40), 0.208 (0.48), 0.18 (0.54) | apron front -0.309; back 0.245 / 0.205 / 0.201 / 0.185 | |
| scarf roll | outer ends ±0.228, z 0.625 front, 0.56-0.64 at the back (a broader collar), ⌀ ~0.06 | ±0.227, z 0.625 front / 0.598 back, ⌀ 0.064 front, 0.082 tall at the back | |
| scarf knot; tails | ⌀ 0.078 at z 0.594; two leaves ~0.10 × 0.065, 34° out, z 0.48-0.57 | 0.092 × 0.082 at z 0.598; leaves 0.107 long, 0.078 wide, z 0.477-0.591 | |
| apron bib | top under the scarf (z ~0.565), 0.316 m across at the top, 0.378 at z 0.45 | top z 0.59 (under the roll), the same widths (s 0.228 -> 0.250 on the torso) | |
| apron skirt | z 0.175-0.45; 0.477 / 0.527 / 0.49 m across (top / mid / hem); front -0.30; wraps to y -0.09 | z 0.171-0.45; 0.56 m bbox across (the sides wrap); front -0.309; wraps to y -0.108 | hangs straight below z 0.30, its top hem lies on the bib |
| belt | z 0.35-0.42, under the skirt in front | z 0.351-0.419, 13 mm thick | |
| back keeper | 0.132 × 0.10, centre z 0.39 | 0.132 × 0.10, curved round the back | |
| arm angle; arm span; paw bottom | ~40°; 0.925; z 0.30 | 40°; 0.923; ~0.30 | |
| legs: width each; centres; crotch | 0.23-0.235; ±0.142 (z 0.12); z 0.15-0.17 | 0.244-0.27 (with the foot); ±0.142-0.155; ~0.16 | |
| feet: width × length; centres | 0.254 × 0.33; ±0.163 | 0.254 × 0.33; ±0.163 | two toe grooves |
| tail: ⌀; centre z | 0.135; 0.32 (side) / 0.21-0.26 (back) | 0.132; 0.228 | note 4 |

## Notes
1. **Head fit.** Widths are within 2% from z 0.097 to 0.47. The two lowest rows (z 0.05-0.062) are 7% narrower: that band is behind
   the scarf on the sheet, and matching it made the lower cheeks read boxy. The back profile is within 2% from z 0.10 up.
2. **The headband.** The side view gives a 16-17° tilt, but the front view shows the band's ends much lower at the sides (z 0.45-0.52
   at x ±0.43 W) than a flat tilted ring can give. I used 18° plus a gentle 0.025 W sag at the sides; a stronger sag (0.05 W) read
   as a wavy band from the 45° game camera.
3. **The brows** are measured at z 0.526 W, touching the band's lower edge; with the band's rounded thickness the model's band
   covered their tops, so they sit 0.028 W lower.
4. **The tail.** The side view draws it at z 0.32 (just under the belt), the back view at 0.21-0.26; the model takes 0.228, clear of
   the belt and its keeper (the back view's reading).
5. **Colours.** The fur is painted #5E4239: lighter than the swatch #4A3A36 (per the director, a darkGrade is expected game-side) and
   toward the sheet's lit fur #604139. Muzzle #B88F6E (the swatch #A88A70, toward the sheet's lit #BE926E); apron #7C5240 (the
   swatch #6A4A3A x1.17, the dark-cloth rule); belt #6C4533 (a touch darker than the apron so it reads); keeper #98624A; scarf
   #D4C6B2; band #EA543C; iris amber #E09A3A family; nose #221816; blush #CC8676. The brief's "lighter belly" isn't visible on the
   sheet (the apron covers it), so there is none.
