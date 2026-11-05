# Momo (design A, folk_cat_a): Step 0, the sheet measured on pixels

Source: `refs/sheet.png` (1536 x 1024), row A. Every number comes from PIL colour masks, connected components and
row/column scans (`measure/m1_head.py` .. `m5_cls.py`, `scratch/headfit.py`), checked on zoomed crops with pixel ticks
(`measure/grid_A_*.png`, `measure/zA_eyeR.png`, `zA_eyeL.png`, `zA_mouth.png`, `zA_sidelow.png`, `zA_backtail.png`).

## HEAD FRONT panel (W = head width at the cheeks, ears excluded)
- Outline (`measure/mask_head_A.png`): widest at sheet y 244-256, x 1132..1464, so **W = 333 px**; outline centre x 1298,
  the features (eyes, nose, mouth) centre on x 1300.5.
- Crown (centre column) y 100, chin y 337: z = height above the chin, x = lateral (the viewer's right = her LEFT = +X).

| Feature | Sheet | Model | Note |
|---|---|---|---|
| Head height, crown to chin | 0.712 W | 0.712 | |
| Half-width at z 0.027 / 0.081 / 0.117 / 0.171 / 0.26 / 0.35 / 0.46 | 0.329 / 0.426 / 0.455 / 0.483 / 0.500 / 0.489 / 0.452 | 0.314 / 0.430 / 0.465 / 0.491 / 0.499 / 0.492 / 0.458 | scratch/headfit.py, rms 0.008 W |
| Head depth (side view, no nose) | 0.85 W (front 0.43 W at the eyes, back 0.42 W) | 0.90 incl. the nose (0.052 W proud) | the side view's head centre sits 0.029 m behind the body centre |
| Ear tips | x -0.315 / +0.333 W (mean 0.324), 0.108 / 0.126 W above the crown (mean 0.117; the front body view gives 0.128) | ±0.335, 0.128 (round 2 wedge ears) | |
| Ear base | inner notch x ±0.10 W at z 0.70; the outer edge runs down into the head's side at z ~0.5 (x 0.455) | outline traced from the sheet: outer edge continues the head side from z ~0.5, inner notch x 0.09 | round 2: rounded-triangle wedges, 0.115 W thick at the root, 0.042 W at the tip, recessed inner panel 0.016 W deep |
| Inner ears | cream ear's dish 0.19 x 0.22 W, peach #FFD8A8 light; patch ear's dish deeper peach | painted dish, rim 0.04 W | |
| Eye centres | x ±0.203 W, z 0.302 W | ±0.203, 0.302 | |
| Eye opening | 69 x 63 px = 0.207 x 0.189 W | 0.207 x 0.189 (rim) | |
| Iris | 48 px = 0.144 W wide (70 % of the opening) x 62 px (~ the full height); centre 9.5 px = 0.28 of the half-width toward the nose | 0.70, 0.98, 0.275 | |
| Pupil | 19.5 x 43 px: 41 % x 69 % of the iris, a tall oval | 43 % x 70 % | |
| Catchlight | one, d 0.039 x 0.045 W at (+0.46 nasal, +0.55 up) of the opening's half-sizes | same; plus a tiny faint low one (the toy line's second catchlight) | |
| Upper lash line | top z 0.423 W; ~0.021 W thick over the top, ~0.03 W at the outer upper corner; runs down the outer side to z 0.255; ONE chunky wing flick, tip at (±0.345, 0.375) | ribbon; one wing, tip (1.37, 0.77) eye units = (±0.345, 0.375) | |
| Brows | centres x ±0.212 W, z 0.512 W; 0.108 W long x 0.042 W (with the arc); ~0.015 W thick | same, 0.015 W | |
| Nose | rounded inverted triangle 0.093 W wide x 0.048 W tall, top z 0.261, tip z 0.213; ~0.046 W proud (side view) | painted, button 0.046 W proud | |
| Mouth ("w") | corners x ±0.0825 W, z 0.189; the arcs dip to z 0.144 at x ±0.038; centre join z 0.168; the line up to the nose from 0.213; line ~0.015 W | painted 0.0136 W | |
| Blush | centres x ±0.32 W, z 0.168 W; 0.114 x 0.069 W | ±0.32, 0.168; 0.124 x 0.076 (soft edge) | |

### The peach patch (`measure/m3_patch.py`, `measure/mask_patch_A.png`)
- Her LEFT side (the viewer's right) in front, as the notes say.
- Inner border: down the forehead just right of the middle, x 0.005 W at z 0.50-0.56, 0.014 at 0.426, 0.029 at 0.381,
  0.050 at 0.336, 0.077 at 0.291, 0.092 at 0.276; then along the eye's lower rim (under the eye is cream); from the eye's
  outer lower corner down to the jaw: (0.347, 0.261), (0.368, 0.246), (0.389, 0.231), (0.416, 0.216), (0.449, 0.204),
  (0.473, 0.198).
- Side view: her whole left upper skull, the lower border at z ~0.13-0.20 W from the cheek to the back.
- Back view: a diagonal from the crown's middle (x ~0 at z 0.65 W) down to her left side at z ~0.2 W; her left ear peach.

## Full body (FRONT, SIDE, BACK): ground line y 323, ear tips (front) y 67 -> 1.05 m = **243.8 px / m**
Front centre x 216.5, side body centre x 689.5, back centre x 947.5.

| Feature | Sheet | Model |
|---|---|---|
| Total height (ear tips) | 1.05 m (the notes) | 1.049 |
| Crown / chin | 0.972 / 0.527 m (chin from the head panel's ratio) | 0.971 / 0.527 |
| W | 152 px = 0.623 m | 0.623 |
| Head : body | head 0.444 m; 2.19 heads to the crown (the notes say ~2.4; the sheet's drawing is 2.2, like Kome's 2.1) | same |
| Shirt sleeves | z 0.36-0.48 m, outer edge ±0.265 m | opening ±0.263 |
| Bib (front) | top z 0.418 m, 0.27 m wide (between the straps' outer edges) | 0.418, 0.27 |
| Straps | 0.066 m wide, centres ±0.107 m, over the shoulders onto the back bib (back top z 0.414) | same |
| Buttons | cream, d 0.078 m at x ±0.095 (−0.084 / +0.107 measured), z 0.373 | d 0.074, ±0.095, 0.373 |
| Overall body | half-width 0.178 at z 0.336, 0.20 at 0.30, 0.21 at 0.16-0.27; side depth ±0.18 at z 0.3 | 0.186-0.212; ±0.188 |
| Overall legs | split at z 0.14, hems z 0.123, each 0.185 m wide (centres ±0.094) | cuffs ±0.094, 0.19 wide, hem 0.122 |
| Fur legs | 0.172 m wide, centres ±0.10 m, visible z 0.094-0.123 | r 0.084 |
| Feet | 0.20 m wide, ~0.26-0.29 m long (side view; the near and far feet overlap), 0.094 m tall, centres ±0.123 | 0.20 x 0.26 x 0.096, ±0.12 |
| Paws | 0.13 x 0.14 m mittens, centres ±0.281 m, z 0.291 (arms ~41 deg out) | 0.124 x 0.132, centres ±0.28, z 0.27; arms 36 deg out |
| Tail (side) | root at the overalls' back (z ~0.17), dips to ~0.11 (outline) at y +0.24, rises to its rear-most y +0.40 (outline) at z 0.28, the top of the hook z 0.394 (outline), the club curling forward to y +0.26 | path from these points, r 0.050-0.064 |
| Tail (back) | the top ~0.047 m to her right of the spine, the low bend ~0.03 m to her left | top -0.044, bend +0.03 |

**Arms**: the sheet's arms are ~41 deg out; the brief asks for 25-30 deg. At 30 deg the paws sink into the overalls'
sides (0.21 m half-width), so I used 36 deg (paw clearance ~1.9 cm, `measurements-model-a.json`).

**Differences from the brief's notes**: 2.2 heads, not 2.4 (I followed the drawing). The sheet shows one catchlight; I
kept the toy line's tiny second one, faint.
