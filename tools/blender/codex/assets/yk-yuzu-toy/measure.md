# Yuzu (yk-yuzu-toy): sheet measurements vs the model, round 1

Measured on `refs/sheet.png` pixels with background masks, row and column scans, colour masks and circle fits
(`measure/m1.py` to `m7.py`), plus ruled crops at 2-8x with 5-10 px grids (`measure/g_*.png`) where the masks bled.
The model column comes from `measurements-model.json`, which the build writes from the SDF and the meshes.

## Anchors
- **Turnaround.** The ground line is at y 513.5 and the ear tops at y 93, so 1.12 m = **375.4 px / m**.
  - The front head is 229 px wide at the cheeks (y 214-226), so **W = 0.610 m**.
  - Chin y 273 → **CHIN = 0.641 m**; crown (the skull between the ears) y 114.5 → 1.063 m, i.e. **0.692 W** above the chin.
    That matches the note "1.05 m excl. ears".
  - Body centre x: front 226.5, back 1272.5. Side: leg axis x 889 (model y = 0), head centre x 910 → **HY = +0.056 m**.
- **HEAD FRONT close-up.** W = 284 px at y 727-735. The outline is centred on x 196 and the features on x 201 (eye
  midpoint 201, nose 200, blush 199.5). The chin is at y 794, the crown at y 584.
- **The two head drawings disagree.** The close-up head is 0.739 W tall; the turnaround's is 0.692 W, about 7 % shorter.
  - The two match in fractions of the head height (mask top over the bridge 0.50 / 0.52, nose top 0.386 / 0.36, mouth
    0.229 / 0.234, band bottom 0.79 / 0.795).
  - The model follows the turnaround's head height, because it fixes the 1.12 m total.
  - So close-up x values are in W, and close-up heights are scaled by 0.692 / 0.739 = **0.936**.
    `make_compare.py` squashes the close-up the same way for `cmp-head` / `cmp-eyes`; `cmp-head-turn.png` compares
    against the turnaround's own head, unsquashed.
- **The eye spacing also differs between the drawings.**
  - The close-up has the eye centres at ±0.194 W; the turnaround has ±0.165 W.
  - I followed the close-up, as the shared brief asks. That is a >10 % difference from the turnaround, flagged for the
    director.

## Face (close-up; z above the chin, heights ×0.936)
| feature | sheet (px) | sheet (W) | model (W) | note |
|---|---|---|---|---|
| head height (crown) | 794-584 | 0.739 raw → 0.692 | 0.697 (skull crown 1.0656 m) | turnaround value used |
| eye centres x / z | 146 and 256 / 702.5 | ±0.194 / 0.302 | ±0.194 / 0.302 | |
| eye opening w × h | 52 × 54 | 0.183 × 0.178 | 0.183 × 0.178 | nearly round |
| iris | 34 × 42, against the nose corner | 0.65 of the opening, centre 0.40 of the half-width toward the nose | the same (painted) | a white crescent above and on the outer side |
| pupil | 26 × 35, high in the iris | 0.77 of the iris wide | 0.77 | the gold ring shows below and on the nose side |
| catchlight | ONE, ⌀ 11 px, upper nose side of the pupil, mirrored in the two eyes | X ∓0.60, Z 0.46 (eye units) | the same | the sheet shows one, not two |
| upper lash | ~8 px thick over the top, one broad wing up and out at the outer corner | ~0.03 W | roll 0.034 W wide, 0.0085 W proud, + 2 overlapping wing flicks | **its own object** (`Yuzu_lash_L/R`), nothing painted |
| mask: over the bridge, top / bottom | x 201 | 0.349 / meets the nose and muzzle | 0.349 | per-column table: `MASK_R` in the build |
| mask: top over the eyes / outer tip / lowest edge | | 0.428 / ±0.41 at z 0.22 / 0.125 at x ±0.29 | the same | it wraps down round the blush |
| muzzle (cream oval) | 93 px wide; y 717-781 | 0.326 wide (z 0.15-0.17), top 0.250 under the nose, bottom 0.045 | the same (`MUZ_R`) | a round oval, not Fuku's flat-topped one |
| nose w × h, centre | 25 × 16, y 713-729 | 0.088 × 0.053, z 0.240 | 0.081 × 0.053 outline, z 0.240; button 22 mm proud | round 1 shrank it from a too-big, too-dark ball |
| mouth | corners x 185 / 221 at y 738; bottom y 749 | a "u": 0.130 wide, corners 0.182, bottom 0.150, ~0.011 thick | the same, ends turned up a little | no philtrum on this sheet |
| blush centre, w × h | (110 / 288.5, 738.5), 29 × 18 | (±0.313, 0.183), 0.102 × 0.059 | the same | over the mask |
| brows | centres 149 / 255.5, y ~646, 32 px long, ~6.5 px thick | (±0.187, 0.488), 0.113 long, 0.021 thick | the same | soft arcs just under the band |
| ears (circle fit) | c (125.5, 604) r 45.8; (265.5, 607.7) r 48.8 | (±0.246, 0.619), r 0.166; top 0.776 (turnaround 0.784) | (±0.246, 0.619), r 0.166; top 0.784 (1.119 m); outer ±0.406 | 18° out; roots tucked under the band |
| pink inner | ~40 px | 0.43 of the disc, a touch high | 0.43 | |
| headband at the front centre | y 598-628 | z 0.557-0.643 visible (turnaround 0.563-0.646) | centre line 1.010 m front, 0.915 m back, 0.068 tall, 0.022 proud | tilt from the side view (front y 137, back y ~178) and the back view (y 155-180) |

**Head front widths (W) against z above the chin** (turnaround rows; the z 0.44 / 0.50 targets are estimates under the band)

| z | 0.022 | 0.048 | 0.074 | 0.100 | 0.127 | 0.153 | 0.179 | 0.205 | 0.231 | 0.258 | 0.284 | 0.310 | 0.336 | 0.362 | 0.44 | 0.50 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet | .725 | .821 | .878 | .921 | .956 | .978 | .991 | 1.0 | 1.0 | 1.0 | .987 | .974 | .948 | .925 | ~.86 | ~.80 |
| model | .685 | .840 | .905 | .945 | .970 | .980 | .990 | .990 | .990 | .985 | .975 | .960 | .940 | .915 | .840 | .780 |

**Side profile (W from the head centre)**

| z | 0.021 | 0.047 | 0.073 | 0.099 | 0.126 | 0.152 | 0.178 | 0.204 | 0.282 | 0.308 | 0.334 | 0.361 | 0.387 | 0.413 | 0.439 | 0.466 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet front | .371 | .424 | .450 | .467 | .480 | .489 | .498 | .498 | .428 | .419 | .419 | .410 | .406 | .402 | .393 | .384 |
| model front | .320 | .385 | .436 | .472 | .485 | .490 | .493 | .494 | .443 | .429 | .418 | .407 | .398 | .389 | .381 | .372 |
| sheet back | .275 | .319 | .349 | .371 | .389 | .402 | .410 | .419 | .424 | .419 | .419 | | | | | |
| model back | .211 | .297 | .349 | .385 | .408 | .420 | .426 | .428 | .422 | .414 | .406 | | | | | |

- The fit is `scratch/fit_head.py`: two least-squares rounds from Fuku's head, rms 0.019 W.
- The chin's last 3 cm (z < 0.05) stay rounder than the sheet's flat, deep chin, which is mostly hidden by the collar.
- Nose tip: sheet 0.515 W ahead of the centre, model 0.527.

## Body and costume (turnaround, metres)
| feature | sheet | model | note |
|---|---|---|---|
| total height (ear tops) | 1.12 | 1.119 | |
| crown | 1.063 | 1.066 | |
| chin | 0.641 | 0.641 | |
| kimono hem | z 0.28, ±0.262, front -0.216, back +0.26 | z 0.279, ±0.262, -0.215 / +0.261 | rolled inward; the under panel's front corner rises to 0.306 under the over panel's edge |
| over panel edge | leaves the obi at x -0.103, reaches the hem at x +0.02 | the same curve (`FL_EDGE`) | a 9 mm slab; it tucks under the obi and thins out at the left side |
| obi | z 0.392-0.475, ±0.209, front -0.20 | z 0.392-0.475, ±0.213, front -0.205 | plain white, no cord |
| obi knot (back) | 0.133 × 0.104, to y 0.258 | 0.134 × 0.104, to y 0.261 | a flat rounded cushion |
| chest | front -0.178, back +0.225 | -0.181 / +0.224 | |
| collar crossing | x 0, z 0.568 | x 0, z ~0.57 | her left over her right; 36 mm wide band |
| arms | ~40° out; paw tips at x ±0.37, span 0.738 | 40°; span 0.764 | +3.5 % |
| trousers | 0.506 wide at z 0.22, legs touching down to z 0.155, front -0.176 | 0.504 wide, touching at x 0, front -0.171 | two tubes, 15 rings each |
| feet | 0.208 wide × 0.277 long, centres ±0.129 | 0.208 × 0.276, ±0.129 | 2 toe grooves |
| tail | 0.248 wide (back view), y to 0.42, bottom z 0.057, dark tip from z ~0.195 | 0.252 wide, y 0.134-0.423, z 0.055-0.443; dark from t 0.76 | |
