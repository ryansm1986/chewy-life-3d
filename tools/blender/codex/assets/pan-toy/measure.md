# Pan (pan-toy): Step 0, the sheet measured on pixels, and the model against it

Source: `refs/sheet.png` (1536 x 1024). The numbers come from PIL masks (background distance > 9, black = RGB sum < 200,
amber and pink colour masks), connected components, per-row scans, a least-squares circle fit for the ears and polar
outlines for the patches (`measure/m1.py` .. `m9.py`, 8x ruled crops `measure/grid_eR.png`, `grid_eL.png`). The model
column comes from the build's `measurements-model.json` and from the same masks run on the model's ortho renders
(`measure/mf.py` on `preview/head_front.png`, `measure/mm.py` on `preview/body_front.png` / `body_sideR.png`).

**Anchors**
- HEAD CLOSE-UP (FRONT): head outline x 32..336 at its widest row (y 758-764), so **W = 305 px**, outline centre x 184;
  features centred on x 185. Crown y 602. The chin is hidden by the scarf: the outline narrows 0.79 -> 0.74 W over the
  last visible rows (y 818-824); continuing that curve puts the chin at **y 838**. So the head is **0.774 W** tall.
- Turnaround: ground y 535, ear tops y 83 -> 1.08 m = **418.5 px / m**. Full-body front W = 252 px = 0.602 m.
  Body centre x: front 201, 3/4 599, side 940.5 (the leg axis = the head's depth centre), back 1335.
- Face values: fractions of W, x from the midline (+ = his left), z above the chin.

## Face (HEAD CLOSE-UP FRONT)
| Feature | Sheet (mine) | Director's rough | Model | Note |
|---|---|---|---|---|
| Head height, crown to chin | 0.774 W (close-up); 0.746 W (full-body front) | 0.80 | 0.774 | chin hidden; see anchors |
| Head front widths at z 0.06 / 0.10 / 0.14 / 0.18 / 0.26 / 0.34 / 0.42 / 0.50 | 0.767 / 0.89 / 0.944 / 0.98 / 1.00 / 0.98 / 0.94 / 0.885 | | 0.760 / 0.878 / 0.944 / 0.980 / 1.000 / 0.987 / 0.958 / 0.895 | all within 1.8% |
| Head top (between the ears) z 0.741 / 0.761 | 0.387 / 0.256 W wide | | 0.37 / 0.25 (fit) | an elliptic top (exponent 2.1) |
| Eye centre (the full opening) | x ±0.234, z 0.315 | x ±0.22, z 0.37 | ±0.234, 0.315 | see note 1 |
| Eye opening, visible under the lid | 0.19 W wide x 0.10-0.11 W tall, z 0.236..0.343 | 0.21 x 0.14 | 0.183 x 0.098 (render), z 0.240..0.337 | the 0.14 includes the lash ledge |
| Eye hole (the full opening the rig can open to) | (iris 0.138 + margins) | | 0.194 x 0.160 | |
| Upper lid edge (rest) | inner z 0.349, middle 0.343, outer 0.332 (droops outward ~6 deg) | covers top third | Z = .30 - .08X - .04X^2 eye units: covers 30% of the iris | |
| Iris | 0.138 W round, centre 0.25 of the half-width toward the nose, bottom z 0.243 | 68% of the opening | 0.138 W (render), bottom 0.244, 0.25 nasal | 73% of the opening |
| Pupil | 0.10 W, 0.74-0.77 of the iris | big | 0.77 of the iris | |
| Catchlight | one, 0.026 W, at the pupil's upper nasal edge under the lid | two | 0.026 W at (0.62 nasal, +0.10) + a small one low | the sheet shows one; the brief asks two |
| Eye patch | 0.31 W x 0.30 W, centroid (±0.251, 0.345), long axis tilted 27-37 deg (outer end down), x 0.101..0.408, z 0.193..0.491 | 0.33 x 0.27, a little below and outside the eye | 0.300 x 0.291, centroid (±0.253, 0.347) (render) | the patch rises well above the eye (the heavy lid is part of it); note 2 |
| Brows | centres (±0.207, 0.546), 0.105 W long, ~0.03 W thick, inner ends higher | high on the white | (±0.213, 0.553), 0.104 x 0.045 (incl. tilt) | |
| Nose | 0.098 x 0.062 W, centre z 0.264 (front); tip 0.067 W ahead of the face (side) | 0.07 W | 0.092 x 0.068 (render, incl. the philtrum's top), tip 0.068 W proud | the brief's 0.07 W is 29% smaller than the sheet; I followed the sheet |
| Mouth "w" | 0.187 W, corners z 0.198, dips z 0.175, centre point 0.185; a line up to the nose | 0.10 W | 0.180 W | the 0.10 is the "w" without its curled corners |
| Blush | centre (±0.354, 0.171), 0.19 x 0.12 W soft | | (±0.354, 0.171), 0.17 x 0.10 W core + soft edge | |
| Ears (circle fit) | centre (±0.374, 0.68) close-up / (±0.41, 0.67) full body; diameter 0.26-0.28 W | 0.30 W at ±0.42 | centre (±0.380, 0.688), disc 0.272 W, outer edge 0.511 W | note 3 |

## Head profile (SIDE, W from the head centre; the side view sits ~0.02 W lower than the front, corrected)
| z | 0.10 | 0.18 | 0.26 (nose) | 0.34 | 0.42 | 0.50 | 0.58 | 0.66 |
|---|---|---|---|---|---|---|---|---|
| sheet front / back | 0.407 / 0.315 | 0.458 / 0.371 | 0.482 / 0.403 | 0.411 / 0.411 | 0.411 / 0.407 | 0.399 / 0.383 | 0.371 / 0.339 | 0.315 / 0.284 |
| model front / back | 0.419 / 0.313 | 0.431 / 0.396 | 0.483 / 0.350* | 0.42 / 0.41 | 0.40 / 0.40 | 0.392 / 0.366 | 0.369 / 0.345 | 0.32 / 0.29 |

\* a mesh-band sampling artefact at the back pole cap; the SDF fit gives 0.414. Head depth 0.83 W (0.90 with the nose).

## Body (turnaround, metres)
| Feature | Sheet | Model |
|---|---|---|
| Total height (ear tops) | 1.08 | 1.081 |
| Crown | 1.047 (front) | 1.050 |
| Chin | 0.586-0.597 | 0.586 |
| Head : height | 2.35 heads (0.46 m head) | 2.35 |
| Torso half-width at z 0.227 / 0.263 / 0.30 / 0.35 / 0.40 / 0.45 / 0.50 | 0.21 / 0.222 / 0.232 / 0.225 / 0.205 / 0.185 / 0.165 | 0.206 / 0.223 / 0.229 / 0.222 / 0.204 / 0.183 / 0.162 |
| Torso front / back at z 0.30 / 0.35 / 0.40 | -0.203 / -0.208, +0.191 / -0.206, +0.189 | -0.209 / -0.214, +0.184 / -0.210, +0.177 |
| Crotch (white bottom at the centre) | 0.167 | 0.150-0.16 |
| Scarf band | z 0.561-0.609, 0.40 m wide, ~0.05 m roll | z 0.546-0.606, 0.41 m, 0.06 m roll |
| Scarf knot | ~0.10 m wide at z ~0.575 | 0.10 x 0.072 x 0.086 m at z 0.560 |
| Scarf ends | 2 x ~0.09 m wide, down to z 0.442 | 0.08-0.10 m wide (flared), down to z 0.44 |
| Arms | ~30 deg out, 0.09-0.10 m thick (front), 0.12-0.14 m (side); paw bottom z 0.275, outer x 0.40 | 30 deg, 0.108 x 0.134 m, mitten 0.128 m; paw tip z 0.262, outer x 0.35 |
| Legs | centres x ±0.115, 0.177 m wide | ±0.115-0.121, 0.172 x 0.184 m |
| Feet | ~0.22-0.24 m wide, ~0.26-0.30 m long, 0.096 m tall, centres x ±0.134 | 0.224 x 0.268 x 0.104 m, centres ±0.132 |
| Tail | white ball ~0.10-0.11 m, centre z 0.24 (back) - 0.28 (side), ~0.04 m proud | 0.108 m ball, centre z 0.262, 0.05 m proud |

## Notes on differences over 10%
1. **Eye height (0.315 vs 0.37).** My 0.315 is the centre of the full eye (the iris circle's centre, z 0.31; the visible
   opening's centre is 0.29). The director's 0.37 matches the **patch** centre (0.345) measured from a lower chin; I
   modelled the eye from the iris and the patch from its own outline, so both sit where the sheet has them.
2. **Patch size and position.** The sheet's patch is 0.31 x 0.30 W and its centroid is 0.03 W *above* the eye centre (the
   lid and the area above the eye are black). Modelled to the sheet's outline (symmetrised: the two sides differ by up
   to 0.036 W in radius).
3. **Ears.** The close-up and the full-body front disagree (±0.374 vs ±0.41 W); I used ±0.38 W, a 0.272 W disc, and
   0.104 W half-thickness so the side view reads as the sheet's rounded lump (0.148 m deep on the sheet).
4. **Nose (0.098 vs 0.07) and mouth (0.187 vs 0.10).** Measured on the close-up; modelled to the sheet.

## Round 2: the head's top (feedback-1 fix 1)
Sheet, HEAD CLOSE-UP FRONT, measured again (`measure/overlay.py`, a column scan of the crown between the ears):
- From z 0.52 (outer side) to z 0.73 (inner side) the head's front outline is **hidden by the ears**. The only visible
  points above z 0.50 are the outline meeting the ears' undersides and the crown between them: z 0.774 at x 0, 0.766
  at ±0.10, 0.755 at ±0.15, 0.73 at ±0.20 (where it meets the ears).
- With z 0.895 W at z 0.50 (kept), a fully convex outline can't reach 0.86 W at z 0.60, so the side runs nearly
  vertical from z 0.50 to 0.60 (a squircle side; the inward bend is under 0.005 W, mostly behind the ears' undersides).

| z | 0.50 | 0.60 | 0.70 | 0.74 | crown at x ±0.10 / ±0.20 / ±0.25 |
|---|---|---|---|---|---|
| Director's target | keep (0.895) | 0.86 | 0.72 | | flat across the middle 0.5 W |
| Round 1 model | 0.895 | 0.767 | 0.545 | 0.396 | 0.766 / 0.736 / 0.71 |
| **Round 2 model** | **0.897** | **0.850** | **0.739** | 0.598 | 0.773 / 0.764 / 0.754 |

Ears (round 2): centre (±0.380, z 0.718), raised 0.03 W, turned 20 deg out (was 30), disc 0.26 W (the close-up's
diameter); total height 1.095 m (ear tops), crown 1.050 m.

## Round 3: the head's top settled between rounds 1 and 2
| z | 0.50 | 0.60 | 0.70 | 0.74 | crown z at x ±0.10 / ±0.20 / ±0.25 |
|---|---|---|---|---|---|
| Target | keep | 0.83 | 0.70 | | keep |
| Round 2 | 0.897 | 0.850 | 0.739 | 0.598 | 0.773 / 0.764 / 0.754 |
| **Round 3** | **0.894** | **0.825** | **0.712** | 0.586 | 0.772 / 0.762 / 0.751 |
(width exponent above z 0.50 ramps 2.1 -> 3.0 by v 0.95; mesh widths, `measurements-model.json`)

3/4 silhouette, the head's far (back-side) edge, measured on `cmp-head` lower row (`measure/sil34.py`), lean-in from its
z 0.30 position: sheet +0.016 / +0.030 / +0.049 W at z 0.40 / 0.45 / 0.50, model +0.014 / +0.026 / +0.045; above z 0.52
the sheet's near ear covers that edge. Plan sections stay ellipses at every height (`preview/plan-sections.png`); a
plan-exponent pinch (2.0 -> 1.75 above z 0.50) was tried and dropped: it made the upper sections lemon-pointed at the
sides.
