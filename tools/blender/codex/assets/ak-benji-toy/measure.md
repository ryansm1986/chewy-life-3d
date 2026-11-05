# Benji (ak-benji-toy): sheet measurements vs the model, round 1

Measured on `refs/sheet.png` pixels (1536 x 1024):
- background masks and row scans (`measure/m1.py`, `m2.py`, `m6.py`, `m7.py`, `m10.py`);
- colour masks per feature (`measure/m3.py`, `m4.py`, `m5.py`, `m8.py`, `m9.py`, `m11.py`);
- a circle fit for the ears (`m8.py`);
- ruled crops with 5-10 px grids (`measure/r_*.png`), used for the mask's outer edge, the body parts and the leaf.

The model column comes from `measurements-model.json`, which the build writes from the SDF and the meshes.

**Anchors**
- **HEAD FRONT close-up.** The outline is widest at y 755 (x 23..342), so **W = 320 px**. The outline centre is x 182.5, but
  the features (eyes, nose) are centred on x 186.7, so face x values are measured from 186.7. The chin (the head's lower edge,
  centre column, the fur-to-shirt line) is at **y 836**.
- **Turnaround.** Ground line y 521. The leaf stem tip is at y 68, which the sheet's note calls TOTAL 1.10 m, so **410 px/m**
  (the ear tops then land at 1.035-1.04 m, the note's HEIGHT 1.05).
  - The front-view head is 236 px wide at the cheeks (y 226) -> **W = 0.5756 m**; the chin is at y 285.7 -> **CHIN = 0.574 m**.
  - Body centre x: front 229, 3/4 580, back 1272.5. Side view: the leg axis at x 910 (model y = 0), the head centre at x 924.5,
    so **HY = +0.035 m**.
  - The sheet's 3/4 and side views show his **left** side (pair with the `34` and `side` renders).
- The crown is hidden under the leaf in every view. The back view shows fur at y 116 between the leaf's rear lobes, so the
  crown is at least 0.72 W; I used **0.725 W**.

## Face (HEAD FRONT close-up, fractions of W, z above the chin)
| feature | sheet (px) | sheet (W) | model | note |
|---|---|---|---|---|
| eye centres x / z | 124.5 and 249.4 / 724.5 | ±0.195 / 0.348 | ±0.195 / 0.348 | |
| eye opening w × h | 59 × 62 | 0.184 × 0.194 | 0.184 × 0.194 (lid hole) | nearly round |
| iris width, offset toward the nose | 43 px, 8 px | 0.134 (0.73 of the opening); 0.27 of the half-width | 0.73, 0.27 | white crescent on the outer side; the top under the lash |
| pupil w × h, centre | 27.5 × 48.5, +14 px toward the nose | 0.64 × 0.80 of the iris | 0.64 × 0.80 | amber shows below it |
| catchlight | ⌀ ~12 px at (+13.5, +13.5) px from the eye centre | ⌀ 0.036, toward the nose and up | the same, mirrored per eye | the sheet has ONE per eye (mirrored); I followed it |
| upper lash | 0.027-0.03 thick over the top, one wing to (0.324, 0.42) | wing tip (1.40, 0.74) eye units | rolls 0.04 W wide over the top, wing tip (1.42, 0.76) | own objects `Benji_lash_L/R` |
| mask band: top over the bridge / peak / outer tip | | 0.416 / 0.497 at x 0.175-0.2 / (0.418, 0.285) | the same (`MASK_R`, per column) | its lower edge under the blush at 0.183-0.19 |
| muzzle (cream bell): top, widest, bottom | | 0.31; 0.37 at z 0.15-0.17; 0.03 | the same (`MUZ_R`) | |
| nose w × h, centre | 31 × 19 px | 0.097 × 0.060, z 0.265 | 0.097 × 0.060, z 0.265 | a soft oval, 22 mm proud |
| mouth: width; ends / bottom | 47 px | 0.15; z 0.200 / 0.167 | the same | one smile arc, no philtrum (the sheet has none) |
| blush centre, w × h | (±0.314, 0.22) | 0.106 × 0.070 | the same | |
| brows: centre x, length, peak / inner / outer z, thickness | | 0.21, 0.13, 0.586 / 0.577 / 0.548, 0.024 | 0.21, 0.128, 0.588 / 0.577 / 0.549, 0.024 | |
| ear disc (circle fit): centre, ⌀ | (88, 641) r 62 | (±0.30, 0.608), 0.388 | (±0.30, 0.608), 0.388 | top 0.80 W (model 0.801), outer edge 0.49 (model 0.485) |
| pink inner (visible) | 44 × 53 px | 0.14 × 0.166, centre (±0.345, 0.635) | 0.15 oval set out and up in the disc | |
| leaf (front view) | | x -0.26..+0.28, z 0.584 (main lobe tip)..0.89, stem tip (0.15, 0.92) | x -0.27..+0.29, z 0.55 (mesh bottom)..~0.9, stem tip (0.12, 0.93) | |

**Head front widths (W) against z above the chin** (sheet: the outline per row; model: the SDF silhouette)

| z | 0.015 | 0.045 | 0.06 | 0.104 | 0.134 | 0.164 | 0.193 | 0.223 | 0.253 | 0.283 | 0.313 | 0.342 | 0.372 | 0.402 | 0.432 | 0.461 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet | 0.597 | 0.738 | 0.791 | 0.888 | 0.931 | 0.962 | 0.981 | 0.994 | 1.000 | 0.994 | 0.988 | 0.969 | 0.950 | 0.925 | 0.900 | 0.872 |
| model | 0.600 | 0.750 | 0.795 | 0.885 | 0.930 | 0.960 | 0.980 | 0.990 | 1.000 | 0.995 | 0.985 | 0.965 | 0.945 | 0.920 | 0.895 | 0.870 |

Above z 0.49 the outline is hidden by the ears and the leaf. Benji's upper head is fuller than Fuku's (0.90 W at z 0.43, Fuku
0.845). The fit is `scratch/fit_head.py` (`scratch/fit_head2.log`).

**Head profile (side view, W from the head centre)**

| z | 0.037 | 0.086 | 0.135 | 0.184 | 0.209 | 0.357 | 0.406 | 0.455 | 0.504 | 0.553 | 0.602 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet front | 0.37 | 0.44 | 0.477 | 0.494 | 0.506 | 0.439 | 0.430 | 0.422 | 0.413 | 0.39 | 0.375 |
| model front | 0.366 | 0.437 | 0.479 | 0.505 | 0.505 | 0.442 | 0.432 | 0.422 | 0.410 | 0.397 | 0.372 |

| z | 0.037 | 0.086 | 0.135 | 0.184 | 0.233 | 0.283 | 0.332 | 0.381 | 0.43 | 0.48 | 0.529 | 0.578 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet back | 0.26 | 0.35 | 0.39 | 0.415 | 0.43 | 0.44 | 0.44 | 0.435 | 0.43 | 0.42 | 0.405 | 0.384 |
| model back | 0.265 | 0.357 | 0.397 | 0.418 | 0.43 | 0.436 | 0.436 | 0.434 | 0.428 | 0.416 | 0.404 | 0.385 |

Nose tip: sheet 0.532 W ahead of the head centre, model 0.536. The head is deep (0.88 W front to back, Fuku 0.81).

## Body and costume (turnaround, metres)
| feature | sheet | model | note |
|---|---|---|---|
| total height (leaf stem tip) | 1.105 | 1.109 (mesh top 1.116: the stem's curl) | |
| ear tops / crown / chin | 1.035-1.04 / ≥0.99 / 0.574 | 1.035 / 0.990 / 0.574 | |
| shirt (orange): shoulders, round U-neck | under the sleeves ±0.18; the cream chest ±0.074, its bottom z 0.523 | ±0.18; the same (painted chart) | |
| apron band (round the body) | z 0.37-0.42, ±0.185 (back view) | z 0.372-0.424, ±0.19-0.21 | |
| apron bib | top z 0.498, ±0.125 at the top | top z 0.50, ±0.126 → ±0.15 | |
| apron straps | ~0.05 wide, over the shoulders, straight down the back | 0.05 × 0.012 | |
| apron skirt | z 0.42 → 0.169, ±0.18 at the top, ±0.205 at the hem | z 0.41 (under the band) → 0.17, ±0.175 → ±0.205, rounded corners | flares to the front 0.20 at the hem (side view) |
| pocket | 0.187 × 0.118, z 0.23-0.35 | 0.188 × 0.116, z 0.232-0.348 | a raised patch |
| fur hips under the shirt | ±0.23-0.245 at z 0.2-0.3, hem z ~0.17 | ±0.236, hem z 0.165 | note 1 |
| trousers (legs) | each 0.21-0.216 wide, centres ±0.113, z 0.198 → 0.076 | ⌀ 0.206 (0.22 deep), ±0.113, down to z ~0.08 | |
| feet | 0.18-0.187 wide × 0.256 long × 0.076, centres ±0.126 | 0.184 × 0.256 × 0.079, ±0.122 | 2 toe grooves |
| arms: angle / paw tips | ~60° / x ±0.36 at z 0.345 | 50° / ±0.38 at z ~0.30 | note 2 |
| sleeves | short, the hem at the upper arm, ~0.126 wide | 0.14-0.15 wide, 0.155 long | rolled hem, the inside shown |
| tail | y 0.175..0.38, z 0.154..0.388, 0.237 across | y ..0.353, z 0.134..0.389, 0.24 across | the outer 36 % dark |
| bag (front view) | x 0.103..0.29, z 0.19..0.385 | x 0.092..0.30, z 0.193..0.398 | note 3 |
| bag strap | ~0.037-0.04 wide, his right shoulder → the bag at his left hip, front and back | 0.042 × 0.013 | |
| leaf | 0.31 wide; side view tilted ~38° (front z 0.94 → back 1.08) | 0.32 wide, tilted 40°, z 0.89..1.11 | note 4 |

## Notes
1. **The hips.** The brief's words say "a skirt or trousers #5a4a3a". The sheet's back and side views show a fur-coloured
   (161,108,81, the same as the arms' fur) flared hip piece under the shirt, with the dark trousers only on the legs. I followed
   the sheet: fur hips, dark trouser legs. `HIPS_RAMP = 'trousers'` flips the hips to cloth.
2. **Arm angle.** The sheet's arms hang ~60° out. As on Fuku, I used 50° (`ARM_DEG`), a rig compromise.
3. **The bag.** The front view puts it on his left hip facing front-left (x 0.10-0.29); the side view draws it facing the side,
   further back. The front view wins (the brief). It faces 36° from the front, curved round the hip (`BAG_BEND_R`).
4. **The leaf.** The front view sees its face (it would need ~50° of tilt), the side view shows ~38°. 40° plus a cap-like curl
   (it rests on the forehead and the crown and stands free behind) matches the front view's extent within ~0.02 W.
5. **Catchlights.** The sheet shows one per eye, mirrored toward the nose (not the toy line's usual two). I followed the sheet.
6. **Trousers colour.** #5A4A3A painted a touch lighter (#665443) for the game's dark grade (the Takemori lesson).
