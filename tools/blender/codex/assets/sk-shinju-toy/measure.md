# Okami Shinju (sk-shinju-toy): sheet measurements vs the model, round 1

Measured on `refs/sheet.png` pixels with:
- a background mask (`|rgb - (252,241,232)|` summed > 22) and row and column scans (`measure/m2.py`, `m3.py`, `m6.py`);
- colour masks per feature (`measure/m4.py`, `m5.py`, plus the orange-bill and dark-line scans);
- ruled crops at 3-9x (`measure/r_*.png`, made by `measure/ruled.py`) for the eyes and the costume.

The model column comes from `measurements-model.json`, which the build writes from the SDFs and the meshes.

**Anchors**
- **Turnaround.** Ground line y 517, crown y 73.5, so 1.05 m = **422.4 px / m**.
  - The front-view head is 234 px wide at the cheeks (y 192-198), so **W = 0.554 m**.
  - The chin (centre column, shadow line) is y 257, so **CHIN = 0.616 m**.
  - Body centre x: front 234, back 1273. Side view: the leg axis is x 936 (model y = 0). The head's depth centre is x 938, so HY = 0.
- **HEAD FRONT close-up.**
  - The outline is widest at y 698-710 (x 45..339), so **W = 294 px**. Chin y 781, crown y 549.5: a head height of 0.787 W (turnaround: 0.784 W).
  - The outline centre is x 192, but the features are centred on x 196 (the eye midpoint 194.5, the nostrils 196.75, the bill 196). Face x values are measured from 196.
- Face values are fractions of W: x from the midline, z above the chin. Body values are in metres.

## Face (HEAD FRONT close-up)
| feature | sheet (px) | sheet (W) | model (W) | note |
|---|---|---|---|---|
| head height (crown) | 781-549.5 | 0.787 (turnaround 0.784) | 0.782 | |
| eye centres x / z | 133.5 and 257.5 / 667 | ±0.211 / 0.388 | ±0.211 / 0.388 | |
| eye opening w × h (inside the lash) | 56-57 × 60 | 0.190 × 0.204 | 0.190 × 0.204 (lid hole) | taller than wide |
| upper lash line thickness (top) | ~9.5 px | ~0.032 | roll 0.032-0.036, two wing flicks | separate objects `Shinju_lash_L/R` |
| iris w × h, offset | 37.5 × 55; 8.25 px toward the nose | 0.128 × 0.187 (0.67 of the opening); 0.29 of the half-width | 0.67 × 0.93 of the opening, offset 0.29 | white crescent on the outer side |
| pupil | only a darker hint in the iris | n/a | a soft 55% darker oval | |
| catchlight | ⌀ 12.5 px, (−11.5, +15) px from the opening centre, toward the nose | ⌀ 0.043 | ⌀ 0.21 × 0.19 opening units, at X 0.42 toward the nose, Z +0.45 | one big light, mirrored between the eyes as on the sheet, plus a faint small one low |
| brows: centre, length, thickness | x 107..148 / 244..283, y 595..614 | (±0.233, ~0.606), 0.14, ~0.024 | the same | an arch, the outer end lower (z 0.573) |
| blush centre, w × h | (±0.335, 0.245) | 0.122 × 0.078 | the same | |
| nostrils | (181.5, 703) and (212, 703), ⌀ ~5 px | (±0.052, 0.266), ~0.018 | (±0.052, 0.266), 0.021 × 0.017 | painted on the upper bill |

**Head front widths (W) against z above the chin.** Sheet: the turnaround outline per row. Model: the SDF silhouette.

| z | 0.021 | 0.047 | 0.073 | 0.124 | 0.175 | 0.226 | 0.265 | 0.303 | 0.355 | 0.406 | 0.457 | 0.509 | 0.560 | 0.611 | 0.662 | 0.714 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet | 0.637 | 0.752 | 0.829 | 0.919 | 0.970 | 0.996 | 1.000 | 0.996 | 0.974 | 0.940 | 0.906 | 0.863 | 0.816 | 0.752 | 0.667 | 0.538 |
| model | 0.625 | 0.770 | 0.840 | 0.920 | 0.960 | 0.985 | 0.995 | 0.995 | 0.975 | 0.935 | 0.900 | 0.860 | 0.805 | 0.740 | 0.645 | 0.505 |

The fit is `scratch/fit_head.py` (least squares on 25 parameters, `scratch/fit_head.log`, rms 0.0165 W).

**Head profile (side view, W from the head centre)**

| z | 0.021 | 0.047 | 0.073 | 0.355 | 0.406 | 0.457 | 0.509 | 0.560 | 0.611 | 0.662 | 0.714 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet front | 0.342 | 0.385 | 0.415 | 0.432 | 0.432 | 0.423 | 0.410 | 0.389 | 0.359 | 0.316 | 0.252 |
| model front | 0.315 | 0.357 | 0.379 | 0.434 | 0.427 | 0.417 | 0.401 | 0.378 | 0.348 | 0.306 | 0.243 |

| z | 0.047 | 0.098 | 0.150 | 0.201 | 0.252 | 0.303 | 0.406 | 0.509 | 0.611 | 0.714 |
|---|---|---|---|---|---|---|---|---|---|---|
| sheet back | 0.308 | 0.363 | 0.397 | 0.419 | 0.427 | 0.432 | 0.423 | 0.393 | 0.342 | 0.235 |
| model back | 0.339 | 0.389 | 0.410 | 0.422 | 0.432 | 0.434 | 0.426 | 0.399 | 0.347 | 0.243 |

The face front between z 0.10 and 0.31 is hidden by the bill. The lowest front points (under the bill, z < 0.08) sit 0.03 W behind the sheet. That area is the chin, in the bill's shadow; the fit traded it for the widths.

## The bill (front close-up and side view)
| feature | sheet (W) | model (W) | note |
|---|---|---|---|
| top (front view, centre) | 0.330 (first orange row 0.323) | 0.325 | the root's arch |
| bottom (the lower bill) | 0.105-0.109 | 0.105 | |
| the smile line: centre / x 0.12 / x 0.15 / x 0.184 | 0.150 / 0.156 / 0.167 / 0.19 | the lip surface 0.155 at the front centre, rising as (x/0.19)^4 to ~0.20 at the corners | thin dark band on the rounded lip |
| tip: ahead of the head centre / z | 0.598 / ~0.21 | 0.598 / 0.216 | |
| side top line: y −0.547 / −0.513 / −0.462 / −0.427 | z 0.265 / 0.274 / 0.303 / 0.325 | slope 0.45 from 0.325 at y −0.43 | |

Front half-widths per row:

| z | 0.119 | 0.133 | 0.146 | 0.160 | 0.173 | 0.187 | 0.201 | 0.214 | 0.228 | 0.241 | 0.255 | 0.269 | 0.282 | 0.296 | 0.310 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet | 0.088 | 0.122 | 0.150 | 0.170 | 0.186 | 0.200 | 0.210 | 0.214 | 0.214 | 0.207 | 0.190 | 0.148 | 0.118 | 0.097 | 0.077 |
| model | 0.117 | 0.135 | 0.147 | 0.164 | 0.176 | 0.197 | 0.210 | 0.214 | 0.214 | 0.212 | 0.183 | 0.149 | 0.122 | 0.099 | 0.080 |

The lowest row (z 0.119) is 0.03 W wider than the sheet: the lower bill's rounded bottom is a little fuller.

## Body and costume (turnaround, metres)
| feature | sheet | model | note |
|---|---|---|---|
| total height (crown) | 1.050 | 1.049 | |
| chin | 0.616 | 0.616 | |
| head : height | annotated "2.4 heads"; pixels 0.434 m (2.42) | 0.433 m | |
| obi (yellow) | z 0.376..0.486 (front), down to ~0.345 at the back; ±0.163 | z 0.349..0.488, ±0.163 (bell + 18.5 mm) | back view: a yellow strip under the cream band |
| apron waistband (cream) | z 0.376..0.436, ±0.189 front, all round | z 0.374..0.440, ±0.178 | |
| knot (back) | 0.10 × 0.07 m at z ~0.40 | 0.10 × 0.07 at z 0.406 | rounded rectangle cushion |
| apron | z 0.163..0.376, ±0.204, front y −0.27 | z 0.157..(0.40, under the band), ±0.198 → ±0.211, front −0.264 | rounded bottom corners r 0.036 |
| skirt hem | z ~0.125, ±0.286, y −0.25 / +0.19 | z 0.119-0.125, ±0.286, y −0.250 / +0.198 | gathered in under the obi |
| sleeves | outer corner x ±0.298 at z 0.50; cuff bottom z ~0.40 | x ±0.311, cuff bottom z 0.307-0.40 | 4% wide |
| arms: angle / hand-tip span / lowest | ~45° / 0.768 / z 0.305 | 43° / 0.783 / z 0.280 | note 1 |
| wing-hand (side view) | 0.166 deep × 0.175 tall | 0.18 × 0.17 | a flat puffy paddle, two feather scallops |
| legs | x ±0.135, ⌀ ~0.09 | x ±0.130-0.137, ⌀ 0.10, flaring into the foot | orange |
| feet | 0.222 wide × 0.29 long × ~0.07, centres ±0.14 | 0.224 × 0.296 × 0.094 (with the ankle flare), centres ±0.142 | two toe grooves (three webbed toes) |
| tail | back view z 0.225..0.355, ±0.062; side to y 0.232, z 0.27..0.39 | z 0.227..0.387, ±0.066, y to 0.26 | a cream teardrop, point up and back |

## Notes
1. **Arm angle.** The sheet's arms hang about 45° out. I used 43° (`ARM_DEG`), so the hand-tip span is within 2% of the sheet. At that angle the boxy sleeves just clear the obi.
2. **"A lighter muzzle and belly #ffffff".** The brief asks for this, but the sheet's front view shows one even cream over the face and chest, with no white patch. I followed the sheet. The chest in the collar's V uses the feather colour.
3. **Fur colour.** I painted #FAEEDB, a touch warmer than the brief's #FFF8EC, to match the sheet's lit cream (sampled at (253, 238, 220) on the forehead). The preview's key light still blows the crown to white.
4. **Catchlights.** The sheet shows one big catchlight per eye, high on the nose side, mirrored between the eyes. I followed it and added only a faint small low light.
5. **Navy skirt.** Painted #34486E, lighter than the brief's #2A3A5A, because the game's grade darkens dark cloth.
