# Grandma Sasa (tk-sasa-toy): Step 0, the sheet measured on pixels, and the model against it

Source: `refs/sheet.png` (1536 x 1024). Scripts in `measure/`:
- `m1_headfront.py`: per-row outline scans; the fur is nearly the background colour, so the outline comes from the distance to the background (> 7) from outside in.
- `m2_face.py`: the crown columns and the chin fit.
- `m3_eyes.py`: the sclera and patch masks and the patch's polar outline (`patch_outline.json`).
- `m4_head.py`: widths by height, the crown profile and the ear circle fits.
- `m5_body.py`: the turnaround's colour bands per row.
- The ruled 10x / 12x crops (`grid_eR.png`, `grid_eL.png`, `grid_nose.png`, `grid_brows.png`) are where the iris, pupil, catchlight, lash, nose, mouth and brows were read.
- `fit_head.py`: fits the head SDF to these targets with numpy alone.

The model column comes from `measurements-model.json` and from the same masks run on `preview/head_front.png`, `body_front.png` and `body_side.png`.

**Anchors**
- HEAD CLOSE-UP (FRONT): widest row y 749-757, x 43..330, so **W = 287 px**. The features are centred on x 189.3 (the nose); the outline's centre is 186.5, because the painting leans slightly.
  - The crown is at y 599.
  - The chin is hidden by the kerchief. A superellipse fit of the lower outline (n 2.2, residual 0.4 px) puts it at **y 833**, so the head is **0.815 W** tall.
- Turnaround: the ground is y 552.5 and the ear tops y 95.5, so 1.00 m = **457 px / m**. Front W = 249 px = **0.545 m**; the crown is at 0.973 m and the chin at 0.529 m.
  - Body centres: front x 208.5, 3/4 597, side 947 (the head's depth centre), back 1326.
  - The side view sits about 0.02 W lower than the front; corrected.
- Face values are in fractions of W: x from the midline (+ = her left), z above the chin.

## Face (HEAD CLOSE-UP FRONT)
| Feature | Sheet | Model | Note |
|---|---|---|---|
| Head height, crown to chin | 0.815 W | 0.815 | chin fitted (hidden) |
| Front widths at z 0.10 / 0.14 / 0.18 / 0.22 / 0.26 / 0.34 / 0.38 / 0.42 / 0.46 / 0.50 | 0.815 / 0.895 / 0.951 / 0.983 / 1.00 / 0.986 / 0.962 / 0.934 / 0.906 / 0.878 | 0.812 / 0.903 / 0.953 / 0.986 / 0.998 / 0.989 / 0.973 / 0.947 / 0.917 / 0.875 | all within 1.4% |
| Crown z at x 0 / ±0.10 / ±0.15 / ±0.20 | 0.815 / 0.805 / 0.794 / 0.777 | 0.815 / 0.809 / 0.800 / 0.785 (SDF fit) | the ears hide the outline above z 0.56 |
| Eye opening (sclera + iris) | centre (±0.220, 0.389); 0.178 x 0.150 W | (±0.220, 0.389); 0.178 x 0.150 | eyes face 31.5° out |
| Iris | 0.131 x 0.148 W (taller than wide), 0.025 W toward the nose, fills the opening's height | 0.131 x 0.147, 0.28 half-widths nasal | 74% of the opening's width |
| Pupil | 0.087 x 0.101 W (0.66-0.68 of the iris), near black | 0.70 / 0.71 of the iris | |
| Catchlight | one, 0.031 W, upper side of the pupil, toward the viewer's right in **both** eyes (one light) | 0.031 W, same placement, not mirrored, plus a small faint low one | the brief asks for two |
| Lash line | a band ~0.021 W thick over the opening's top, its lower edge on the opening; a wedge wing to x 0.364, z 0.451 | a ribbon 0.017-0.023 W wide, wing root 0.034 W, tip (0.358, 0.454); ≤ 0.008 W proud | |
| Eye patch | x 0.101..0.389, z 0.271..0.566, centroid (±0.240, 0.412); long axis 45° (outer end lower), axes 0.33 x 0.25 W | x 0.104..0.386, z 0.274..0.565, centroid (±0.241, 0.419) | two sides agree within 0.005 W; symmetrised |
| Brows | x 0.148..0.264, z 0.589..0.641; inner end high, round, 0.026 W thick; outer end low and tapered | x 0.139..0.264, z 0.593..0.652 | |
| Nose | 0.110 x 0.070 W, top z 0.340, tip z 0.272; tip 0.534 W ahead of the head centre (side) | 0.106 W wide, top 0.339; tip 0.534 ahead | |
| Mouth | corners (±0.096, 0.252), dip z 0.216, philtrum from z 0.272 | ±0.096, 0.252 / 0.218 | |
| Blush | centre (±0.349, 0.240), core 0.126 x 0.101 W | (±0.349, 0.241), 0.123 x 0.092 + a soft edge | |
| Ears (circle fit) | centre (±0.335, 0.695), diameter 0.33 W, outer x 0.499, top z 0.861 | centre (±0.338, 0.705), disc 0.32 W, outer x 0.496, top 0.865 (1.000 m) | side view: about 0.1 W behind the centre |

## Head profile (SIDE, W from the head centre)
| z | 0.12 | 0.20 | 0.28 | 0.32 (nose) | 0.40 | 0.48 | 0.56 | 0.64 | 0.72 |
|---|---|---|---|---|---|---|---|---|---|
| sheet front / back | -0.434 / 0.333 | -0.494 / 0.386 | -0.526 / 0.422 | -0.534 / 0.430 | -0.434 / 0.434 | -0.430 / 0.426 | -0.414 / 0.406 | -0.382 / 0.365 | -0.313 / 0.305 |
| model (SDF fit) | -0.438 / 0.305 | -0.495 / 0.393 | -0.522 / 0.433 | -0.530 / 0.433 | -0.443 / 0.430 | -0.425 / 0.417 | -0.410 / 0.397 | -0.378 / 0.360 | -0.320 / 0.295 |
Head depth 0.969 W with the nose (sheet 0.968). At the nape (z ≤ 0.12) the model is 0.03 W narrower; the kerchief covers it.

## Body (turnaround, metres)
| Feature | Sheet | Model |
|---|---|---|
| Total height (ear tops) | 1.00 | 1.000 |
| Crown / chin | 0.973 / 0.529 | 0.973 / 0.529 |
| Head : height | 2.25 heads (0.444 m head) | 2.25 |
| Kerchief band | on the shoulders under the chin, z ~0.53-0.56; knot ~0.055 m at z 0.50; leaf ends 0.066 x 0.085 m, tips z 0.41 | band z 0.50-0.58 (higher at the nape); knot 0.062 x 0.058 m at z 0.494; ends 0.074 x 0.10 m, tips z ~0.40 |
| Kimono torso | front -0.173, back +0.199 at z 0.465 | -0.178 / +0.203 |
| Sleeves | outer x ±0.35 at z 0.44; opening ~0.18 x 0.16 m | ±0.358; opening 0.19 x 0.21 m |
| Obi | z 0.296..0.393; half-width 0.233 (lower roll) / 0.216 (upper); half-depth 0.229 | z 0.288..0.398; 0.236 / 0.227; 0.229-0.242 |
| Skirt | 0.444 m wide under the obi; widest 0.613 m at z 0.105; side hem -0.267..+0.287; hem z ~0.06-0.075 | 0.61 m at z 0.105; side -0.268..+0.299; hem z 0.060-0.066; 12 box pleats |
| Arms | ~46° out on the sheet; paw lowest z 0.255, outer x 0.417; paw ~0.13 m | **40° out** (note 1); paw tip z 0.25, outer x 0.393; paw 0.13 m |
| Feet | 0.158 m wide, 0.263 m long, centres x ±0.131, ~0.035 m forward | 0.160 x 0.264 m, ±0.131, 0.036 forward |
| Tail | ball 0.107-0.116 m, centre z 0.276, 0.06 m proud of the skirt | 0.11 m ball, centre z 0.278 |

## Notes (differences over 5%, and calls I made)
1. **The arm angle**: the sheet holds the arms about 46° out; the shared brief asks for 25-30°. At 30° the paws would push into the wide skirt, so I used 40° (Kuma kept 38°). The outer paw reach is 6% short of the sheet's for the same reason.
2. **Eye height vs the nose**: the sheet's iris bottom (z 0.314) sits *below* the nose top (0.340). The shared lesson says to keep the iris above the nose top, but I followed the sheet, the approved blueprint. The eyes still read mid-face because the brows and patch tops are high.
3. **The kerchief ends** are about 10% larger than measured, so they read at game distance.
4. **The director's rough numbers**: the brief gives none beyond the 1.00 m height, which matches.
