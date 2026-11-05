# Saba (sk-saba-toy): Step 0, the sheet measured on pixels

Source: `refs/sheet.png` (1536 x 1024). Every number comes from PIL masks, colour classes, row/column scans and char maps
(`measure/m1_head.py`, `m3_eyes.py`, `m4_patch.py`, `m5_body.py`, `m6_classes.py`, `m7_body2.py`, `measure/charmap.py`,
`scratch/headfit.py`), not by eye. Zoomed crops: `measure/eyeR_x6.png`, `eyeL_x6.png`, `mouth_x8.png`, `crop_face3x.png`,
`crop_knot.png`, `crop_backwaist.png`, `crop_head34.png`, the masks `mask_headfront.png`, `mask_patch.png`, `classes_bodies.png`.

## HEAD FRONT panel (W = head width at the cheeks, ears and band excluded)
- Outline: widest at sheet y 725-734, x 37..337, so **W = 301 px**, outline centre x 187. Chin y 803 (the head's bottom
  edge above the collar). z = height above the chin, x = lateral (her LEFT = the viewer's right = Blender +X), in W.
- **The drawn face is turned ~6 deg to her left**: every feature pair centres on x 197-199 (eyes 197, brows 198, nose
  199.5, mouth 199), 11 px (0.037 W) right of the outline's centre, and the eye on the viewer's right is foreshortened
  (53 px vs 63 px). The front-body view shows the same offset (0.027 W). I modelled the face symmetric: feature x values
  below are about the features' centre (x 198), pair values averaged.

| Feature | Sheet | Model (round 1) | Note |
|---|---|---|---|
| Crown (hidden by the bandana in front; back view between the ears) | 0.73 W | 0.730 | |
| Widest | z 0.243 W | 0.24-0.25 | |
| Half-width at z 0.037 / 0.09 / 0.143 / 0.196 / 0.249 / 0.302 / 0.355 / 0.435 / 0.515 | 0.337 / 0.427 / 0.472 / 0.493 / 0.500 / 0.490 / 0.473 / 0.465 / 0.450 (band-corrected above 0.38) | 0.348 / 0.437 / 0.475 / 0.487 / 0.487 / 0.486 / 0.483 / 0.466 / 0.435 | all within 0.013 W (2.6 %) |
| Head depth (side, no nose) | 0.835 W at the mouth zone; face front 0.342 W ahead of the centre at the eyes, 0.404 at the muzzle | 0.841 | |
| Muzzle zone ahead of the eye zone (side) | ~0.06 W | 0.058 | carried by the fuller lower face (no separate bump: it made a ledge) |
| Eye centres | x +-0.193 W (half the 116 px pair spacing), z 0.311 | +-0.193, 0.311 | |
| Eye opening | 0.193 W wide (mean of 63 / 53 px) x 0.186 tall | 0.193 x 0.186 (rim) | |
| Iris | 0.136 W wide (70 % of the opening) x 0.179 (96 %), tucked 0.028 W to the nose | 0.70 / 0.96 of the opening, 0.29 of the half-width nasal | |
| Pupil | 0.105 x 0.146 W (77 x 81 % of the iris), 0.017 W nasal and 0.017 up of the iris centre; it merges with the opening's top | 83 x 85 % (round 1 render read small at 77 %) | |
| Teal | a crescent below and outside the pupil; the iris top is dark | same | |
| Catchlights | big d 0.042 W, 0.055 W above the iris centre, both up-left as seen (R -0.008, L -0.028 W); a small one beside it | same placement | the sheet lights both eyes from the viewer's upper left |
| Upper lash line | top z 0.425 W, ~0.025 W thick over the top (7-8 px), down the outer side to z 0.262 (0.53 of the half-height), one wing flick, tip at eye units (1.36, 0.70) | own ribbon objects, 0.035 W wide incl. the part tucked over the lens edge, one wing at (1.38, 0.72) | |
| Brows | x +-0.198 W, z 0.508; 0.140 x 0.043 W soft arcs, dark grey | +-0.198, 0.508, 0.12 x 0.04 | |
| Nose | rounded inverted triangle 0.093 W wide x 0.050 tall, top z 0.256, tip 0.209; ~0.02 W proud of the muzzle | painted 0.094 x 0.050 on a button, tip z 0.232 | |
| Mouth ("w") | corners x +-0.076 W at z 0.186; arcs dip to 0.155 at +-0.04; middle 0.166; the line up to the nose tip; ~0.012 W thick | same curve, 0.0116 W line | |
| Blush | centres x +-0.310 W, z 0.184; 0.095 x 0.072 W | +-0.310, 0.184, 0.098 x 0.074 | |
| Muzzle (light) | x +-0.21 W at z 0.06-0.16, up to an arch: z 0.279 at the middle, 0.256 at +-0.10, 0.222 at +-0.15 (the eyes' lower inner corners); wraps under the chin | the same polygon, its arch lowered ~0.01 W at +-0.10-0.17 so it stays off the lid roll | |
| Ear tips | x +-0.277 W (close-up) / +-0.305 (front body view), z 0.860 W (0.13 W above the crown) | +-0.285, 0.861 | |
| Inner ear (pink) | 0.19 x 0.20 W, centred z 0.714 | a big pink dish with a 0.046 W grey rim | |
| Bandana (front centre) | z 0.590-0.714 W (0.124 W = 0.076 m tall), proud ~0.02 m; its top edge is the head's top in the front view | z 0.894-0.712 W (0.861-0.956 m) | its front sits ~0.01 m lower than the sheet's: at 0.918 it rode up the crown like a visor in the side and game views |

### The tabby patch (`measure/m4_patch.py`, mask `measure/mask_patch.png`)
- Over her RIGHT eye (the viewer's left on the front view). Inner border from under the bandana down the bridge:
  x -0.020 W at z 0.575, -0.037 at 0.492, -0.064 at 0.409, -0.090 at 0.359, then the eye's upper inner corner. The eye's
  top and outer side are in the patch; its nasal side and its bottom are fur. The lower border leaves the eye's outer lower
  corner: (-0.30, 0.23), (-0.37, 0.20), (-0.45, 0.167), (-0.50, 0.175), then the jaw. The 3/4 head shows it covering the
  side of the head; the back view shows none, so it fades out at the head's mid-depth. Nothing above the bandana.
- **Conflict (flagged)**: the side view (her left side) also draws a dark patch behind the eye; I followed the front view.

## Full body (FRONT, SIDE, BACK): ground y 519, ear tips (front) y 76 -> 1.05 m = **421.9 px / m**
Body centres: front x 227, side x 900 (the legs and feet), back x 1301.5. W (front body, z 0.666 m) = 260 px = 0.616 m,
which ties the head panel to the turnaround (chin 0.517 m, ear tips 0.865 W above it: both panels agree).

| Feature | Sheet | Modelled |
|---|---|---|
| Total height (ear tips) | 1.05 m | 1.047 |
| Chin / crown | 0.517 / 0.967 m | 0.517 / 0.967 |
| Head : body | chin-crown 0.45 m: 2.15 heads to the crown, 2.33 to the ear tips (the sheet's note says 2.4) | same |
| Head centre (side) | y +0.000 (the fit) | HY 0 |
| Bandana | front centre z ~0.905-0.918 m, back 0.778 (side and back views; ~16 deg tilt), 0.076 m tall | 0.902 / 0.778, 0.084 x 0.020 m |
| Bow (back) | knot 0.04 x 0.06 m on the band; two teardrop lobes hanging down-out to z 0.694, out to +-0.10 m | knot 0.040 x 0.056; lobes 0.080 x 0.092 at +-0.050, rolled 40 deg |
| Shirt | cream, shoulders +-0.20 m at z 0.495; torso front -0.13 / back +0.125 at z 0.45 | lathe, same |
| Sleeves | puffy, outer hem at z ~0.43, ~0.10 m long, rolled cuff | 0.15 m incl. the cuff roll, max radius 0.072 |
| Apron bib | top z 0.465, +-0.111; +-0.145 at 0.39, +-0.154 at 0.353 | same outline |
| Apron below the waist | +-0.171 (0.306), +-0.18 (0.258), +-0.19 (0.21), hem z 0.172 with rounded corners; the back view shows its edges at +-0.19-0.22 (it wraps the hips); side: front at -0.145 (0.448), -0.187 (0.35), -0.20 (0.30) | one panel wrapping to 100 deg, hem 0.172, front -0.146 / -0.179 / -0.19 |
| Pocket | +-0.11 m, z 0.225-0.358, rounded U bottom, rolled top hem | same |
| Straps | 0.045 m wide; front x +-0.089 from the bib corners; back vertical at x +-0.080 down to the waist tie | same |
| Waist tie (back) | z 0.341-0.389, darker blue | 0.342-0.388, 0.013 m proud |
| Shirt visible at the back | between the tie and the trousers (z ~0.27-0.34) | same (trousers top 0.29) |
| Trousers | navy, crotch z ~0.165, legs 0.185 m wide (centres +-0.104), 0.24 m deep (side), rolled cuffs to z 0.085 | same, oval legs 0.184 x 0.228 m |
| Feet | 0.177 m wide, 0.24 long, ~0.07 tall, centres x +-0.117 | 0.176 x 0.236 x 0.074, +-0.116 |
| Paws | centres ~(+-0.30, z 0.30), arms ~44 deg out | (+-0.282, 0.276), arms 35 deg out (the brief's A-pose; 1 cm clear of the apron) |
| Tail | striped, ~0.10-0.13 m thick; back view: from the waist just right of centre (her right) dipping to z ~0.17, then up the viewer's left (= her LEFT) to z ~0.45 at x 0.18-0.25; side: 0.17-0.37 m behind, top z 0.50 | path through those points on her left, 0.10-0.106 m thick, top z 0.527, 0.68 m long, 5 dark rings + a dark tip |

**Colours**: from the brief's swatches (which match the sheet). The navy trousers and bandana are painted #38688c
(the swatch is #2e5a7a: the game's grade crushes navies); the patch #5e5c6c (the swatch #4a4a5a reads near-black; the
sheet's rendered patch is ~#645e6b); the muzzle #e0dde5 (the swatch #f4f4f8 read stark white next to the fur).
