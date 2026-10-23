# Mochi (mochi-toy): Step 0, the sheet measured on pixels

Source: `refs/sheet.png` (1536 x 1024). Every number comes from PIL colour masks, connected components and row/column
scans (`scratch/meas*.py`, `scratch/patch.py`), not by eye.

## HEAD FRONT panel (W = head width at the cheeks, ears excluded)
- Panel head outline: x 45..345 px, so **W = 300 px**, outline centre x = 195. Chin y = 829, crown (centre column) y = 600.
- Face features are centred on x = 199 (nose, mouth and the eye pair all agree). The panel's face is turned about 4 px
  to the viewer's right, so features are measured from x = 199 and the outline from x = 195.
- z = height above the chin, x = lateral (the viewer's left = her right = Blender -X), both in W.

| Feature | Sheet (mine) | Director's rough | Diff | Note |
|---|---|---|---|---|
| Head height, crown to chin | 0.767 W (panel), 0.746 W (full-body front) | 0.77 W | ok | modelled 0.755 W |
| Widest point | z 0.27-0.33 | | | |
| Width at z 0.013 / 0.033 / 0.073 / 0.153 / 0.433 / 0.49 | 0.46 / 0.64 / 0.81 / 0.95 / 0.96 / 0.92 W | | | a broad, flat-ish bottom |
| Eye centres | x ±0.238 W, z 0.285 W | x ±0.21, z 0.33 | x +13 %, z -14 % | see below |
| Eye opening (white + iris, inside the lash) | 0.220 W wide x 0.212 W tall | 0.23 x 0.25 | w -4 %, h -15 % | |
| Iris | 0.157 W wide (71 % of the opening), 97 % of its height, tucked to the nose (centre 0.29 of the half-opening toward the nose) | | | |
| Pupil | about 64 % x 65 % of the iris, a touch nasal | | | |
| Catchlights | big: r 0.023 W at (0.53 nasal, 0.47 up) of the half-opening; small: r 0.010 W at (0.35 nasal, -0.34) | | | |
| Upper lash line | 0.033 W thick on top, about 0.018 W down the outer side to ~45 deg below the eye's middle; one outward wing at the outer top corner, ~0.04 W long | | | |
| Brows | centres x ±0.216 W, z 0.53 W; 0.107 W long x 0.037 W thick; soft arcs | | | |
| Nose | z 0.213 W (painted shape centre), 0.053 W wide x ~0.035 W tall; in profile the tip is at z 0.19-0.20 and 0.049 W proud of the face | 0.05 W just under the eye line | ok | |
| Mouth ("w") | 0.147 W wide, corners z 0.15-0.16, the two dips at z 0.13; a short line up to the nose | 0.10 W | +47 % | the "w" plus its curled corners measures 44-45 px on both the panel and the 3x crop |
| Blush | centres x ±0.32 W, z 0.167 W; ~0.11-0.13 x 0.075 W (soft edge) | 0.13 x 0.08 at x ±0.31 | ok | |
| Ear tips | x ±0.39-0.40 W, z 0.897 W (0.14 W above the crown) | 0.15 W above the crown | ok | |
| Ear base | from the inner corner (±0.13, z 0.755) to the outer corner (±0.48, z 0.53): chord 0.42 W, ear width about 0.40 W | about 0.33 W | +20 % | the outer edge runs down onto the head outline |
| Ear lean | axis about 20 deg outward in front view, slightly forward in side view | | | |

**Differences over 10 %:**
- **Eye x (0.238 vs 0.21) and eye z (0.285 vs 0.33).** Both eyes measured inside their lash outlines (white + iris
  extents): opening x 95..161 and 238..304 px, y 712..776. Relative to the face midline x = 199 the centres are -71 and
  +72 px = ±0.238 W. The centre height is (829 - 744) / 300 = 0.285 W; the full-body front gives 0.26-0.29 W. I
  modelled the sheet's numbers (0.238, 0.285). On the sheet the iris bottom (z 0.18) is a little below the nose top
  (z 0.22), so the "iris bottom at or above the nose top" lesson doesn't strictly hold on this design; I kept the sheet.
- **Eye opening height (0.212 vs 0.25).** Inside the lash band the opening is 63-64 px tall; the 0.25 probably includes
  the lash thickness (the outer lash outline is 0.25 W tall).
- **Mouth (0.147 vs 0.10).** Modelled at the sheet's 0.147 W.
- **Ear base (0.40 vs 0.33).** Measured along the ear's base on the head; modelled at 0.40 W.

## The calico patches (W, measured with an orange mask)
- **Face patch** (her right, Blender -X): the inner border runs from x -0.08 at the crown, down along the bridge
  (x -0.017 at z 0.45-0.48, -0.03 at 0.37, -0.06 at 0.29), passes under the eye at z 0.20-0.23, and meets the head
  outline at z 0.25-0.30. The eye's top, outer and inner sides are on orange, its lower rim sits on the orange / cream
  border. (The brief says "the eye itself on cream"; on the sheet only the area below the eye is cream. I followed the
  sheet.)
- **Back patch** (back view, her right): x from +0.05 (her left of the midline) to -0.46 W, z 0.07 to 0.62 W, a rounded
  kidney with a notch at the lower inner corner (its polygon is in the build, `PATCH_BACK`).
- **Ears**: on the sheet **both** ears are orange outside with pink inner ears (front, side and back views). The brief
  says "the left ear cream with an orange rim"; I followed the sheet and flag it.

## Full body (FRONT, SIDE, BACK views): scale 415 px = 1.08 m (ear tips y 82 to ground y 497) = 2.602 mm/px
| Feature | Sheet | Modelled |
|---|---|---|
| Total height (ear tips) | 1.08 m | 1.08 m |
| Crown | 0.99-1.00 m | 0.996 m |
| Chin | 0.513 m | 0.513 m |
| W | 246 px = 0.640 m | 0.640 m |
| Head : body | head (crown-chin) 0.48 m of 1.00 m to the crown, about 2.1 heads to the crown, 2.3 with the ears | same |
| Head depth (side, face front to back) | 0.84 W (0.54 m); nose 0.05 W proud | 0.84 W |
| Kimono sleeves | outer edges x ±0.30 m, bottom z 0.30 m, top z 0.47 m | opening centre x ±0.22 m, outer edge ±0.29 m |
| Obi | x ±0.168 m, z 0.276-0.385 m (0.11 m tall), depth 0.30 m; back knot 0.18 x 0.12 m, 0.065 m proud | ±0.175, z 0.268-0.399 (tucked ends), knot 0.18 x 0.12 x 0.08 |
| Skirt | top z 0.286 m, hem z 0.099 m, hem width 0.468 m, hem depth 0.39 m | hem z 0.096, ±0.234 x ±0.197 m |
| Paws | 0.125 m mittens, centres x ±0.315 m, z 0.31 m | 0.116 m, centres x ±0.27 m, z 0.26 m (arms 35 deg out, see note) |
| Feet | 0.17 m wide, ~0.20 m long, 0.065 m tall, centres x ±0.105 m | 0.168 x 0.194 x 0.092 m (rounded, toe lines) |
| Brush | at x +0.11 m (her left front), z 0.23-0.44 m, handle ~0.018 m, bristles ~0.026 m, leaning back ~14 deg | z 0.226-0.446 m, handle 0.025 m, bristles 0.034 m (the 3 cm rule), leans back 10 deg |
| Tail | root under the obi at the back (z ~0.26-0.29), dips to z ~0.09 at 0.36 m behind, rises to the tip at ~0.45 m behind and 0.17 m to her right, tip top z 0.32 m; ~0.07 m thick, the club tip ~0.13 m | path from the measured points; 0.080 m root, 0.070 m mid, 0.128 m club |

**Arms**: on the sheet the arms are about 50 deg out from vertical (paws at x ±0.315); the shared brief asks for a
25-30 deg A-pose. I used 35 deg as a compromise (the wide sleeves still read); say if you want either end.
