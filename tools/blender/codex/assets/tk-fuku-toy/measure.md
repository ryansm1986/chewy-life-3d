# Okami Fuku (tk-fuku-toy): sheet measurements vs the model, round 1

Measured on `refs/sheet.png` pixels:
- a background mask and row/column scans (`measure/m1.py`, `m6.py`, `m7.py`);
- colour masks per feature (`measure/m3.py`, `m5.py`);
- a least-squares circle fit for the ears (`m3.py`);
- ruled crops at 2.2-6x with 5-10 px grids (`measure/r_*.png`), used where the colour masks bled into neighbouring features (the eyes, the muzzle outline, the nose, the brows).

The model column comes from `measurements-model.json`, which the build writes from the SDF and the meshes.

**Anchors**
- **HEAD FRONT close-up.** The head outline is widest at y 705-715 (x 21..356), so **W = 336 px**. The outline centre is x 188.5, but the features are centred on x 191 (eye midpoint 191, nose 191.5), so face x values are measured from 191. The chin (the head's lower edge over the collar, centre column, shadow line) is at **y 785**. The crown is at y 552, which gives a head height of **0.693 W**.
- **Turnaround.** The ground line is at y 495.5 and the ear tops at y 70, so 1.08 m = **394.0 px / m**.
  - The front-view head is 244 px wide at the cheeks (y 205-210), so **W = 0.619 m**.
  - The chin is at y 257, so **CHIN = 0.605 m**, and the crown is at 1.034 m.
  - Body centre x: front 228, back 1306.5.
  - In the side view the leg axis is x 930 (model y = 0). The head's depth centre is x 940, so **HY = +0.025 m**.
- Face values are fractions of W: x from the midline, z above the chin. Body values are in metres.

## Face (HEAD FRONT close-up)
| feature | sheet (px) | sheet (W) | model | note |
|---|---|---|---|---|
| head height (crown) | 785-552 | 0.693 | 0.688 | |
| crown at x ±0.105 (between the ears) | y 555 | 0.685 | 0.682 | |
| eye centres x / z | 124 and 258.5 / 678.5 | ±0.200 / 0.317 | ±0.200 / 0.317 | |
| eye opening w × h (white + iris, inside the lid rim) | 65 × 53 | 0.193 × 0.158 | 0.193 × 0.158 (lid hole) | wider than tall on this sheet |
| upper lash line thickness (top) | ~10 px incl. rim | ~0.03 | ~0.022 + rim | three flicks at the outer corner |
| iris width, offset | 42 px, 10.5 px toward the nose | 0.125, 0.65 of the opening; 0.32 of the half-width | 0.120 (0.62), 0.33 | white crescent on the outer side; top hidden under the lid |
| pupil w × h | 26 × 37 | 0.077 × 0.110 (0.62 × 0.66 of the iris) | 0.085 × 0.101 | 4 px toward the nose |
| catchlights | ⌀ 9 px; a faint second one upper-right | 0.027 / ~0.012 | 0.028 / 0.012 | both on the viewer's right, in both eyes, as on the sheet (not mirrored) |
| mask band: outer tip | x ±131 px, y 680 | ±0.389, z 0.31 | ±0.389 | per-column table below |
| mask over the nose bridge, top / bottom | | 0.417 / 0.283 (meets the muzzle) | 0.418 / 0.281 | |
| muzzle (cream oval): width, top, bottom | 115 px; y 692 .. 768 | 0.34 (at z 0.13-0.18); 0.277; 0.051 | painted to the measured rows | a broad, flat-topped oval, not a bell |
| nose w × h, centre | 29 × 18; y 696-714 | 0.086 × 0.054; z 0.238 | 0.088 × 0.056; z 0.238 | rounded inverted triangle; the button stands 28 mm proud |
| mouth: width; corners / dips / centre cusp | 46 px | 0.137; z 0.176 / 0.161 (x ±0.035) / 0.179 | the same | a small "w"; the philtrum runs to the cusp |
| blush centre, w × h | (±104, 720) | (±0.307, 0.192); 0.11 × 0.07 | the same | over the mask's lower edge |
| brows: centre, length, thickness | 36 × ~6 px | (±0.183, 0.540); 0.11; ~0.018 | the same | arc: inner end 0.539, peak 0.55, outer end 0.525 |
| ear disc (circle fit): centre, ⌀ | (96, 581) r 55; (285.6, 580) r 54 | (±0.283, 0.608), 0.324 | (±0.283, 0.608), 0.32 | top 0.770 (model 0.767), outer edge ±0.44 (model ±0.431) |
| pink inner (visible) | ~51 px | ~0.15, centre (±0.30, 0.626) | 0.15 disc in the cup | |

**Head front widths (W) against z above the chin.** Sheet: the outline per row. Model: the SDF silhouette.

| z | 0.015 | 0.045 | 0.06 | 0.104 | 0.134 | 0.164 | 0.193 | 0.223 | 0.253 | 0.283 | 0.313 | 0.342 | 0.372 | 0.402 | 0.432 | 0.461 | 0.491 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet | 0.667 | 0.765 | 0.812 | 0.908 | 0.949 | 0.973 | 0.988 | 0.997 | 0.991 | 0.979 | 0.961 | 0.938 | 0.908 | 0.878 | 0.845 | 0.81 | 0.786 |
| model | 0.58 | 0.79 | 0.845 | 0.93 | 0.96 | 0.975 | 0.98 | 0.985 | 0.98 | 0.97 | 0.955 | 0.93 | 0.905 | 0.875 | 0.845 | 0.815 | 0.78 |

Fuku's head is more pear-shaped than Tanu's: 0.845 W at z 0.43, where Tanu is 0.877. Above z 0.49 the outline is hidden by the ears. The fit is `scratch/fit_head.py`, two rounds of least squares on 15-16 parameters (`scratch/fit_head*.log`).

**Head profile (side view, W from the head centre)**

| z | 0.037 | 0.086 | 0.135 | 0.184 | 0.209 | 0.307 | 0.357 | 0.406 | 0.455 | 0.504 | 0.553 | 0.602 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet front | 0.369 | 0.43 | 0.455 | 0.48 | 0.48 | 0.402 | 0.393 | 0.381 | 0.365 | 0.34 | 0.307 | 0.254 |
| model front | 0.313 | 0.404 | 0.469 | 0.477 | 0.478 | 0.415 | 0.395 | 0.376 | 0.358 | 0.337 | 0.307 | 0.261 |

| z | 0.037 | 0.086 | 0.135 | 0.184 | 0.233 | 0.283 | 0.332 | 0.381 | 0.43 | 0.48 | 0.529 | 0.578 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet back | 0.287 | 0.344 | 0.381 | 0.398 | 0.406 | 0.406 | 0.398 | 0.385 | 0.369 | 0.344 | 0.311 | 0.262 |
| model back | 0.251 | 0.345 | 0.389 | 0.408 | 0.412 | 0.406 | 0.393 | 0.377 | 0.361 | 0.345 | 0.321 | 0.285 |

Nose tip: sheet 0.492 W ahead of the head centre (x 820), model 0.522. The model is 0.03 W further forward because round 1 raised the muzzle bump.

**Mask, per column (W)** (sheet: `measure/m5.py`)

| x | 0 | 0.03 | 0.06 | 0.089 | 0.119 | 0.149 | 0.179 | 0.208 | 0.238 | 0.268 | 0.298 | 0.327 | 0.357 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet top | .417 | .423 | .44 | .464 | .485 | .497 | .503 | .503 | .494 | .482 | .461 | .433 | .388 |
| sheet bottom | .283 | .28 | .274 | .265 | .25 | .229 | .217 | .211 | .21 | .218* | .229* | .229* | .243 |

The model's mask polygon (`MASK_R`) follows these values. \* The blush covers the mask's lower edge here.

## Body and costume (turnaround, metres)
| feature | sheet | model | note |
|---|---|---|---|
| total height (ear tops) | 1.08 | 1.080 | |
| crown | 1.034 | 1.031 | |
| chin | 0.605 | 0.605 | |
| head : height | annotated "2.4 heads"; pixels: chin to the ear top 0.475 m (2.27) | as the pixels | |
| obi | z 0.382..0.463, ±0.228, front -0.228 | z 0.381..0.464, ±0.229, front -0.229 | cord groove at z 0.42 |
| obi bow (back) | 0.14 × 0.13, z 0.36..0.50, y 0.18..0.25 | 0.14 × 0.128, z 0.368..0.496, y 0.19..0.256 | flat rounded cushion |
| kimono hem (coral / plum border) | z 0.242, ±0.33; back y 0.21 | z 0.238, ±0.325 (with a rolled 11 mm lip); back 0.226 | |
| skirt hem | z 0.103, ±0.329, y -0.261 / +0.277 | z 0.094, ±0.329, y -0.262 / +0.277 | |
| apron | z 0.146..0.382 (under the obi), ±0.228 at the top, ±0.256 at the bottom, front -0.274 | z 0.140..(0.404 under the obi), ±0.196 → ±0.25, front -0.279 | note 2 |
| sleeves (front view) | from the shoulder to x ±0.364 (cuff top), bottom edge z 0.36 | to x ±0.364; the pocket's lowest point is z 0.26, at the cuff (the 50° arm tilts it down) | note 1 |
| arms: angle / span / paw size | ~65° / 0.93 (paw tips) / ~0.14 | 50° / 0.862 / 0.134 | note 1 |
| legs and feet | legs x ±0.135; feet 0.216 wide × 0.28 long × 0.08, centres ±0.154 | the same (feet 0.216 × 0.28 × 0.086) | 2 toe grooves |
| tail extent | x ±0.135 (back), y 0.25..0.47, z 0.146..0.435 (side) | x ±0.137, y 0.085..0.475, z 0.116..0.432 | note 3 |

## Notes
1. **Arm angle.**
   - The sheet's arms are nearly horizontal: about 65° out.
   - The shared brief asks for 25-30° for the rig. At that angle the boxy sleeves sink into the obi and the apron.
   - I used 50° (`ARM_DEG`, one line), a compromise like Tanu's 45°.
   - Because of this, the paws sit a little lower and closer in than on the sheet.
2. **Apron width.**
   - At the sheet's ±0.228 the apron's top corners wrap a full 90° round the cinched waist. From the 45° game camera it then rings the obi like a lifebuoy.
   - I narrowed the top to ±0.196, so it still wraps about 60°. The sheet's side view does show the apron reaching back to y -0.085.
   - `AP_HW0` restores the sheet's value.
3. **Tail colours.**
   - The brief says "a dark band and tip". The sheet's side, back and 3/4 views show a fur-brown root and one dark outer cap, with no fur ring between them.
   - I followed the sheet. `TAIL_BANDS` adds a fur ring if a separate band is wanted.
4. **Iris bottom vs the nose top.** As on Tanu's sheet, the iris bottom (0.241 W) is below the nose top (0.265 W). I followed the sheet.
5. **Catchlights.** On the sheet both are on the viewer's right in both eyes (one light, not mirrored). I followed the sheet.
