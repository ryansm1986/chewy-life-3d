# Kero (kero-toy): Step 0, the sheet measured on pixels, and the model against it

Source: `refs/sheet.png` (1536 x 1024). Numbers come from PIL masks (background distance > 14; green = G > R+8 and
G > B+25; dark = max channel < 75-80; light = min channel > 200; belly = R > 150), per-row / per-column scans and
run-length classification of single rows (`measure/m1.py` .. `m8.py`, ruled 2x grids `measure/grid_front|side|back.png`).
The model column comes from the build's `measurements-model.json`, the fitter (`scratch/fit_head.py`, the head
implicit's exact outlines) and the same row classifier run on `preview/head_front.png` (`measure/mf.py`).

**Anchors**
- HEAD FRONT close-up: widest row y 717-725, x 38..390, so **W = 353 px**; features centred on x 215. Dome tops y 575.
  The chin is hidden by the scarf: a superellipse fit of the lower outline (y 729-789, n = 2.26, rms 0.75 px) puts it at
  **y 809**, so the head is **0.663 W** tall, chin to the dome tops.
- Turnaround: dome tops y 105, feet y 513 -> 1.10 m = **370.9 px / m**. Full-body front W = 296 px = **0.798 m** (model
  W = 0.800 m); chin z = 1.10 - 0.663 W = **0.571 m**. Body centre x: front 225.5, 3/4 588, side 948 (the leg / hip axis,
  model y = 0), back 1302. The side view's head sits 0.012 m higher than the front's; side heights are corrected by that.
- Face values: fractions of W, x from the midline, z above the chin, y from the head centre (y_m = -0.062) in the side.

## Face (HEAD FRONT)
| Feature | Sheet (mine) | Director's rough | Model | Note |
|---|---|---|---|---|
| Head height, chin to dome tops | 0.663 W | 0.78 | 0.665 (mesh) | see note 1 |
| Dome tops / the valley between them | z 0.663 at x +-0.229..0.263 / z 0.564-0.569, flat over abs(x) < 0.09 | tops 0.18 W above the middle top | tops 0.665; valley 0.570 at x 0, 0.569 at 0.05, 0.582 at 0.09 (mesh) | the domes rise 0.095 W above the valley (note 2) |
| Domes (circle fit) | centres x +-0.25, z 0.49, radius ~0.17 W (0.34 W wide) | 0.36 W wide | implicit domes: centres +-0.249, rx 0.189 | the outline, not the ellipsoid, is the target |
| Eye centre | x +-0.289, z 0.419 | x +-0.29, z 0.55 | +-0.289, 0.419 | note 1 (chin) |
| Eye opening | 0.229 W wide (row z 0.42: x -0.402..-0.173), 0.215-0.221 W tall (z 0.31..0.53) | 0.24 x 0.27 | 0.226 x 0.220 | the 0.24 / 0.27 include the lash line |
| Iris | tall oval ~0.18 x 0.187 W, clipped on the nose side. Row z 0.42: sclera -0.394..-0.320, amber -0.320..-0.289, pupil -0.289..the nasal edge -0.173 | 68% of the width | row z 0.42 (render): sclera -0.388..-0.322, amber -0.322..-0.283, pupil -0.283..-0.178 | within 0.006 W |
| Pupil | 0.116 W wide (merged with the iris's dark-brown top), 0.136-0.144 W tall, reaches the nasal edge | | 0.105 at z 0.42 (render), 0.141 tall (design) | |
| Catchlights | big 0.040 x 0.045 W at (0.061 W nasal, +0.043); small 0.034 W at (0.026 nasal, -0.035) | two | same | |
| Upper lash line | 0.014-0.016 W on top (column x -0.25), ~0.03-0.04 W at the outer top, a small wing flick; thin toward the nose | thick, with a wing | 0.013 at x -0.25 (render), 0.020 at the outer edge row z 0.42 | |
| Brows | arcs, outer end (+-0.336, 0.582), peak (+-0.269, 0.610), inner end (+-0.184, 0.558), ~0.03 W thick | on the domes | round 2 (feedback-1 fix 3): an even arc centred over the eye, x +-0.225..0.353, ends z 0.591, peak 0.608, 0.029 W thick | shorter, flatter, no inner slant |
| Nostrils | x +-0.054, z 0.322, ovals ~0.034 W | 0.40 above the chin, 0.10 apart | +-0.054, 0.322, 0.037 x 0.028 (design) | |
| Smile | corners x +-0.25, z 0.250; dips x +-0.13, z 0.218; centre z 0.231; line 0.007-0.014 W | 0.55 W wide at 0.27 | 0.50 W, same curve, 0.0086 W (0.013 at the corners) | the 0.55 includes the curls |
| Blush | centres x +-0.395, z 0.258; ~0.11 x 0.08 W core, soft | 0.14 x 0.09 at +-0.38 | 0.12 x 0.086 core + soft edge | |
| Eye facing | ~30 deg out (the side view shows the eye well) | forward, a little out | 27.8 deg out, 28 deg up (the dome front) | |

## Head outlines (W; the model's exact implicit outlines from `scratch/fit5.log`, 93 points, rms 0.0051, max 0.017)
| | sheet | model |
|---|---|---|
| half-width z 0.10 / 0.25 / 0.41 / 0.50 / 0.59 | 0.428 / 0.500 / 0.445 / 0.437 / 0.398 | 0.426 / 0.498 / 0.451 / 0.434 / 0.395 |
| top z at x 0 / 0.093 / 0.127 / 0.229 / 0.348 | 0.569 / 0.572 / 0.618 / 0.663 / 0.629 | 0.570 / 0.581 / 0.616 / 0.664 / 0.634 |
| profile front z 0.22 (snout) / 0.42 (eye) / 0.54 | -0.391 / -0.273 / -0.203 | -0.389 / -0.264 / -0.206 |
| profile back z 0.22 / 0.42 / 0.56 (the dome-back notch) | 0.391 / 0.330 / 0.151 | 0.384 / 0.338 / 0.154 |
| forehead between the domes (x 0), z 0.46 / 0.50 | behind the eye column (the eyes make the profile) | -0.216 / -0.174 (eye column -0.231 / -0.213) |
| dome fillet (the valley's inner corner) | soft, no crease | smooth union k 0.033 W, normals checked (`scratch/cu/valley_nrm.png`) |

## Body (turnaround, metres)
| Feature | Sheet | Model |
|---|---|---|
| Total height (dome tops) | 1.10 | 1.103 |
| Head width W | 0.798 | 0.800 |
| Torso half-width z 0.20 / 0.25 / 0.30 / 0.35 | 0.26 / 0.287 / 0.295 / 0.289 | 0.262 / 0.284 / 0.294 / 0.292 (table) |
| Torso front / back (side) z 0.30 | -0.270 / +0.267 | -0.267 / +0.265 |
| Belly (front projection) | centre z 0.33, half-width 0.245 (z 0.31), bottom z 0.135, top under the knot / scarf; half-width 0.17 at z 0.49, 0.205 at 0.44, 0.173 at 0.20 | superellipse: zc 0.33, a 0.245, below 0.195, above 0.21 |
| Scarf band | z 0.53-0.60 (sides), 0.53 m wide, ~0.07 m tall roll, front lower than back | round 2: stands 0.058 m off the body at the front, 0.050 at the back, 0.09 m at the shoulders; 0.092 m tall; centre z 0.509 front / 0.561 back (design) |
| Badge (lily pad) | 0.115 m disc, centre z 0.54, narrow notch at ~1 o'clock | 0.116 m, centre (0, -0.300, 0.515), notch at 80 deg, 19 deg wide (design) |
| Knot ends | two teardrops ~0.12 m wide, z 0.37-0.50, splayed ~30 deg, front edge y -0.313 (side) | 0.13 m wide, z 0.36-0.50, splay 30 deg, tipped 30 deg forward (design) |
| Arms | shoulder z ~0.50, x +-0.24; hands to z 0.245, x +-0.48 (sheet ~43 deg out); 0.11-0.12 m thick | 38 deg (house standard, Kuma / Usagi), 0.12-0.126 m thick, hand 0.13 m with 3 fingers |
| Legs | centres x +-0.16, 0.18 m wide, z 0.09-0.17 visible | +-0.16-0.165, r 0.086-0.089 |
| Feet | each ~0.30 m wide, 0.355 m long (side), 0.09 m tall, three rounded toes in front, centres x +-0.21 | pad 0.27 x 0.28 + toes, 0.096 tall, centres +-0.205, toes splayed 14 deg |

## Notes on differences over 10%
1. **The chin (head height 0.663 vs the director's 0.78 W).** The scarf hides the chin. The superellipse fit of the
   visible lower outline (rms 0.75 px) and the full-body front (the head's bottom meets the scarf at z ~0.59 m) agree on
   0.663 W. The director's eye height (0.55) and nostril / mouth heights (0.40 / 0.27) are consistent with a chin about
   0.12 W lower, i.e. a different chin reading; with my chin, the director's eye height 0.55 becomes 0.43 (mine 0.419).
2. **The domes above the valley (0.095 vs 0.18 W).** Column scan of the top outline: the valley floor is at y 607-610 and
   the dome tops at y 575, 32-35 px = 0.09-0.10 W. I modelled the measured outline.
3. **Eye opening (0.229 x 0.22 vs 0.24 x 0.27).** Measured below the lash line; with the lash line the eye is 0.24 tall.
4. **Arms (38 vs the sheet's ~43 deg).** Kept at the house rig angle (Kuma 38, Usagi 38); the brief asks 25-30, the sheet
   shows ~43.

## Round 2: skin colour samples (feedback-1 fix 1)
| Point | Sheet (rendered) | Atlas (the paint) | Toon check, lit side (game-like) | Studio review render |
|---|---|---|---|---|
| Face front (0, 0.38) | #AEDE78 | #8AD86A | #8AD86A | #BCFF86 |
| Forehead (0, 0.45) | #ADDC75 | ~#8AD86A | #8AD86A | #BDFF86 |
| Cheek (-0.40, 0.33) | #ADDB73 | | #8AD86A | #8ED566 |
| Dome top (-0.25, 0.64) | #B3DD81 | ~#8DDA6C (gentle light) | #8BD86B | #BDFF86 |
| Under the jowls, turned away | #83A554 / #9FB87A | toward #6FBE55 | | |
The paint is the swatch with the sheet's cool shade. The studio review rig's key light has a ~1.36x gain on the face's
front- and up-facing surfaces and clips the green channel, which is the lime cast in `head_front.png`; the cheek, lit
less, renders at the paint's value.
