# Nami (sk-nami-toy): Step 0, measurements on refs/sheet.png

Measured on pixels with PIL/scipy:
- `measure/sil.py`: the silhouette mask (difference from the warm background, closed, holes filled);
- `measure/body.py`: row extents per full-body panel;
- `measure/parts.py`: costume colour classes per row (teal, dark teal, apron, pink), in metres;
- `measure/feat.py` + `measure/eye.py`: feature blobs and per-row eye extents on the HEAD FRONT close-up;
- `measure/fit_head.py`: an offline fit of the build's head field to the width rows and the side profile.

The sheet is 1536 x 1024.

## Anchors
- **Full-body panels**: ground line at y 512. The ear tips are at y 66-68 in every view: 445 px = **1.05 m** (the sheet's
  "height incl. ears"), so **424 px/m**.
  - Front: centre x 271. Crown between the ears y 152 (**0.849 m**); chin y 294 (**0.514 m**); head W 194 px = **0.458 m**.
    Head height 0.73 W; the crown is 2.53 head heights (the note says 2.4).
  - Side and 3/4 views show her **left** side (the flower), so they pair with my `body_side` / `body_34` renders.
  - Side view: the head centre (x 893.5) sits **0.035 m behind** the body axis (dress, underskirt and feet centre at
    x 878.7), so the model's head centre is at y = +0.035.
- **HEAD FRONT close-up**: W = 235 px (cheeks, widest at y 723-729), chin y 785, centre x 201, crown y 616 (0.719 W).

## Head front (fractions of W; z = height above the chin)
| feature | sheet | model | note |
|---|---|---|---|
| widths at z 0.03 / 0.09 / 0.14 / 0.19 / 0.25 | 0.69 / 0.85 / 0.93 / 0.98 / 1.00 | 0.71 (0.04) / 0.85 (0.08) / 0.95 / 0.99 (0.20) / 1.00 | |
| widths at z 0.32 / 0.37 / 0.39 / 0.44 / 0.49 / 0.55 | 0.98 / 0.95 / 0.93 / 0.89 / 0.84 / 0.78 | 0.99 / 0.96 (0.36) / 0.93 (0.40) / 0.88 (0.45) / 0.82 (0.50) / 0.78 | broad, fairly flat crown |
| head height (crown) | 0.719 close-up / 0.732 body | 0.729 | |
| head depth (side, from the head centre) | front 0.425 at eye level, back 0.43; 0.86 W in all | bf 0.430 / bb 0.435 | a deep, round head |
| side profile ahead of the centre: z 0.10 / 0.14 / 0.19 / eye level 0.35 / 0.43 / 0.52 / 0.60 | 0.448 / 0.467 / 0.477 / 0.425 / 0.415 / 0.389 / 0.338 | 0.455 / 0.471 / 0.476 / 0.426 / 0.410 / 0.381 / 0.315 | |
| nose tip ahead of the centre | 0.497 | 0.497 | |
| eye opening centre x, z | ±0.210, 0.350 | ±0.210, 0.350 | |
| eye opening w × h | 0.190 × 0.200 (sclera + iris inside the lash) | 0.190 × 0.200 | |
| iris w, centre | 0.12 W (63 %), x 0.183 (tucked to the nose, touching the nasal edge and the bottom) | 0.64 × 0.86 eye radii, offset −0.31 / −0.15 | painted, teal #3A7A9A |
| pupil | big, upper-nasal in the iris: about 0.085 × 0.12 W, centre (0.165, 0.355) | 0.49 × 0.64 radii, centre (−0.47, +0.07) radii | |
| catchlights | big Ø 0.05 W at (0.159, 0.386); small Ø 0.026 at (0.207, 0.337) | big r 0.24 radii at (−0.54, 0.36); small r 0.075 at (−0.03, −0.13) | |
| upper lash | about 0.03 W thick on top (z 0.434-0.464), wraps to the outer corner, one wing flick up-out to (0.336, 0.425) | separate roll, 1.12 × Chiku's thickness (0.028 W on top), wing tip (1.33, 0.70) eye radii = (0.336, 0.420) | |
| brows | thin arches, x 0.153-0.243, z 0.540-0.566, centre (0.20, 0.556) | the same path, 0.013 W thick at the middle | |
| nose | 0.085 × 0.055, centre z 0.262 (a rounded inverted triangle) | 0.085 wide, z 0.262 | |
| philtrum | a pink line from the nose down to the smile (z 0.18-0.23) | pink #E8A2AE, 0.0084 W wide | |
| mouth | one smile, x ±0.080, bottom z 0.162-0.170, corners up at z 0.20-0.21 | the same path, 0.009 W thick | |
| blush | centre ±0.315, z 0.193; 0.13 × 0.12 (soft) | ±0.315, 0.193; 0.134 × 0.12 core, soft edge | |
| ears: width (front projected) | 0.387 W | 0.376 W | 12° out, 0.17 W deep at the base |
| ears: centres, splay | ±0.20-0.22 low → ±0.23-0.25 high (7-9°; the flower side splays a little more) | base ±0.165, splay 7°, symmetric | |
| ear tips | 1.165 W (body view) = 1.05 m | 1.167 W (1.048 m) | the close-up reads 1.08 W |
| pink panel | 0.22 W wide, its top 0.07-0.10 W under the tip | rim 0.078 (0.22 wide), tip margin 0.10 | |
| flower, front extent | x 0.088-0.464, z 0.546-0.861 (0.37 × 0.31 W) | x 0.124-0.465, z 0.587-0.862 (0.34 × 0.28 W) | 5 petals + a darker domed centre; slid out along its normal until its back sits on the skull |
| flower, side extent | 0.11 m ahead of the head centre to 0.03 m behind; z 0.755-0.91 m | y −0.091..+0.038 m (body axis), centre normal (0.34, −0.66, 0.67) | |

## Body (sheet vs model, metres; model body axis x = 0, y = 0)
| part | sheet | model |
|---|---|---|
| total / crown / chin | 1.05 / 0.849 / 0.514 | 1.048 / 0.848 / 0.514 |
| bodice | shoulders ±0.15 at z 0.50, chest about ±0.14; side depth −0.12..+0.12 | rx 0.140 / ry 0.118 at z 0.44 |
| sleeves | puff out to ±0.21 at z 0.44, hems z ~0.40 | to ±0.229, z 0.36-0.53 |
| hands | outer edge ±0.295 at z 0.32-0.34, lowest z 0.274 (arms about 39° out) | to ±0.301, lowest 0.256 (38°) |
| waistband (all round) | z 0.370-0.415, ±0.14 | z 0.370-0.415, ±0.151 |
| straps | front x ±0.064-0.106, back ±0.045-0.10 | front centre ±0.085, back ±0.073, 4.2 cm × 1.4 cm |
| dress skirt | ±0.144 at z 0.36 → ±0.224 at z 0.20; hem z 0.17; back +0.165 at z 0.30 | ±0.141 at 0.35 → ±0.224 at 0.185, hem roll to 0.173; back 0.15-0.19 |
| underskirt | ±0.215 at z 0.14-0.15, bottom z 0.12; side −0.18..+0.18 | ±0.215, z 0.120-0.205, ±0.18 deep |
| apron skirt | ±0.125 under the band → ±0.167 at z 0.22; hem z 0.185, rounded corners | ±0.173 overall (±0.158 + rim and the wrap round the skirt), z 0.181-0.40 |
| pocket | 0.19 × 0.097, z 0.226-0.323 | 0.189 × 0.097, z 0.226-0.324 |
| V collar | teal crossover V between the straps, point at z ~0.46 | two thick bands, the wearer's left over the right, crossing at z 0.455 |
| legs | each 0.136 wide (x ±0.017-0.153), visible z 0.07-0.12 | capsules r 0.060-0.064 at x ±0.09 |
| feet | each 0.172 wide (x ±0.017-0.189), 0.25 long (−0.145..+0.107), about 0.07 high | 0.171 wide, 0.243 long (−0.143..+0.100) |
| tail | Ø 0.11-0.12 (back), 0.08-0.09 deep; centre z 0.30 on the skirt's back | 0.117 × 0.092 × 0.113, centre z 0.298 |

Notes:
1. The brief has no rough director numbers for Nami, so there is nothing to cross-check against.
2. **Height**: the sheet says 1.05 m *including the ears*, so her crown is at 0.85 m, under the shared brief's 1.0-1.15 m
   villager range. I followed the sheet (the brief says to); a uniform scale of about 1.24 would put the crown at 1.05 m if
   the director wants her in the usual range.
3. **Eyes vs nose**: the sheet's iris bottoms (z 0.251) sit below the nose top (0.289), against the shared brief's
   "iris bottom at or above the nose top" lesson. I followed the sheet.
4. **Ears**: the sheet turns them far enough out that the side view shows the pink panel. I used Chiku's director recipe
   (12° out, thick paddles), so the side view shows the ear's thick edge with a sliver of pink.
5. **Arms**: 38° (the angle locked for Usagi's and Chiku's rigs) instead of the sheet's ~39°; the hands land 2 cm lower.
