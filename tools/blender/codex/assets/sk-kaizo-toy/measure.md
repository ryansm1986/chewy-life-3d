# Old Captain Kaizo (sk-kaizo-toy): sheet measurements vs the model, model round 2

Measured on `refs/sheet.png` pixels:
- a colour-label map (`measure/labels.py` -> `labels.npy`, `labels.png`: grey fur, red band, dark, cream, pink, blue);
- connected components and row / column run scans on it (`measure/m1.py`-`m4.py`, `m2.txt`, `rows.txt`);
- ruled crops at 5-8x with 10 px grids where the masks bleed (`measure/r_eyeL.png`, `r_earL.png`, `r_ear34.png`, `r_knotF.png`, `r_knotS.png`).

The model column comes from `measurements-model.json` (written by the build from the SDF and the meshes).

**Anchors**
- **Turnaround.** Ground line y 500, ear tops y 70. The sheet's 1.03 m is taken to the ear tops: **417.5 px / m**.
  - Front-view head 243 px wide at the cheeks: **W = 0.582 m**. Chin y 285 (**0.515 m**), crown y 86 (0.992 m).
  - Body centre x: front 232, 3/4 577, back 1271. Side view: leg axis x 904 (model y = 0); the head's depth centre
    (face front 812 at the eye line, back 1011) is x 911.5, so **HY = +0.018 m**.
- **HEAD FRONT close-up.** Widest at y 730-745 (x 46..382): **W = 337 px**; outline midline x 214, features' midline x 218.5
  (eyes and nose; the drawing is turned ~4 px). Chin y 824, crown y 550: head height **0.813 W** (turnaround 0.819).
- Face values are fractions of W: x from the midline, z above the chin. Body values are metres.

## Face (HEAD FRONT close-up)
| feature | sheet (px) | sheet (W) | model | note |
|---|---|---|---|---|
| head height (crown) | 824-550 | 0.813-0.819 | 0.820 | |
| eye centres x / z | 147.5, 288.5 / 697 | ±0.209 / 0.377 | ±0.209 / 0.377 | |
| eye opening w × h (white, inside the lash) | 70 × 70 | 0.208 × 0.208 | 0.208 × 0.208 (rolled rim) | nearly round |
| upper lash: thickness top / outer / nose side | 9-10 / 8 / 3 px | 0.028 / 0.024 / 0.009 | 0.028 / 0.024 / 0.010 | separate rolls `lash.L/R`, wing + a small lower tick (the sheet's fishtail) |
| iris w × h; offset to the nose | 51 × 62; 8.5 px | 0.151 × 0.184; 0.24 eye radii | 0.73 × 0.89 of the opening; 0.245 | the iris meets the nose-side rim, white crescent outside |
| pupil | 30 × 45, up 3.5, nose-ward 3.5 | 0.59 × 0.72 of the iris | the same | |
| catchlight | ⌀ 21 px, 13.5 px above the iris centre | r 0.30 eye radii | r 0.29-0.31, the same place | one big catchlight; I added a tiny lower one (the line's two-catchlight rule) |
| nose w × h, centre z | 44 × 30; y 713..742 | 0.131 × 0.089; 0.286 | 0.114 × 0.089 outline (+ the dome's rounding reads ~0.125); 0.286 | glossy rounded inverted triangle, 18 mm proud |
| nose tip ahead of the head centre (side view) | x 780 | 0.541 | 0.546 | |
| mouth width; corners / lobe dips / cusp z | 60 px | 0.178; 0.228 / 0.184 / 0.214 | 0.178; 0.228 / 0.184 / 0.214 | painted "w" |
| muzzle (cream) w × h, centre z | 118 × 86; y 708..794 | 0.352 × 0.26; 0.217 | 0.352 × 0.26; 0.217 | painted oval, 2-3 mm soft border, on a 3D snout |
| blush centre; w × h | (±107, 749); 57 × 42 incl. soft rim | (±0.316, 0.223); 0.17 × 0.125 | (±0.316, 0.223); 0.164 × 0.116 soft | |
| brows: inner end / top / outer end | (177, 640) / (143, 607) / (110, 647) | (0.123, 0.546) / (0.22, 0.644) / (0.322, 0.525) | (0.136, 0.572) / (0.234, 0.619 + 0.023 proud) / (0.316, 0.568) | raised cream beans, 0.074 W wide at the inner end tapering to 0.046 |
| band at the centre (lower / upper edge) | y 605 / 573 | 0.650 / 0.745 | 0.650 / 0.733 (front surface) | |
| band at x ±0.35 W (lower / upper) | | 0.561 / 0.656 | ~0.58 / 0.67 | sags at the sides (see note 2) |
| band width (front, with its thickness) | 308 px | 0.914 | 0.909 | 0.028 W thick, rounded section |
| band tilt (side view) | top edge 0.733 -> 0.58 W over 0.535 W | 15° back | 15° | |
| band height front / back | | 0.095 / 0.131 | 0.096 / 0.124 | the bandana widens toward the back |
| ear top (the fold) | (122 / 309, 530) | x ±0.28, z 0.872 (turnaround: 0.89) | ~0.87 | round 2: one folded triangular flap per ear |
| ear inner edge / folded tip outer corner | x 150 / (58, 572) | 0.19 / (0.463, 0.746) | 0.20 / (0.487, 0.737) | 0.30 W base, 0.08 W thick, 140° fold; stays inside the 0.50 W outline |
| pink inner face | x 88..147, y 549..605 | x 0.20..0.37, z 0.65..0.82 | the flap's front face inside a grey rim, from the band top (~0.69) up under the fold | |

**Head front widths (W), z above the chin.** Sheet: the outline per row; z 0.48-0.60 are minus the band's two sides.

| z | 0.062 | 0.10 | 0.13 | 0.166 | 0.20 | 0.234 | 0.269 | 0.303 | 0.338 | 0.372 | 0.407 | 0.441 | 0.50 | 0.55 | 0.60 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet | 0.78 | 0.881 | 0.929 | 0.964 | 0.988 | 1.000 | 1.000 | 0.994 | 0.982 | 0.964 | 0.941 | 0.917 | 0.877 | 0.85 | 0.81 |
| model | 0.775 | 0.88 | 0.93 | 0.965 | 0.98 | 0.99 | 0.995 | 1.000 | 0.985 | 0.965 | 0.935 | 0.91 | 0.875 | 0.85 | 0.805 |

**Head profile (side view, W from the head centre).** Front includes the snout (the nose button adds ~0.03 at z 0.28-0.34).

| z | 0.02 | 0.06 | 0.10 | 0.16 | 0.22 | 0.28 | 0.34 | 0.37 | 0.40 | 0.45 | 0.50 | 0.60 | 0.70 | 0.80 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet front | 0.335 | 0.405 | 0.459 | 0.508 | 0.525 | 0.51* | 0.48* | 0.41 | 0.405 | 0.40 | 0.389 | 0.326 | 0.27 | 0.146 |
| model front | 0.24 | 0.404 | 0.467 | 0.508 | 0.520 | 0.512 | 0.461 | 0.432 | 0.413 | 0.391 | 0.370 | 0.329 | 0.267 | 0.143 |
| sheet back | | 0.286 | 0.331 | 0.377 | 0.401 | 0.409 | 0.409 | 0.409 | 0.405 | 0.389 | 0.368 | 0.319 | 0.27 | 0.163 |
| model back | | 0.289 | 0.339 | 0.379 | 0.395 | 0.406 | 0.406 | 0.399 | 0.391 | 0.377 | 0.363 | 0.329 | 0.271 | 0.149 |

`*` the snout surface under the nose (the sheet's silhouette there is the nose, 0.541).

The head ball is `scratch/fit_head.py` (Nelder-Mead on 19 parameters, plan exponents capped at 2.7 so the head stays round
in plan); every width and profile target is within 0.01 W except the low snout (below).

## Body and costume (turnaround, metres)
| feature | sheet | model | note |
|---|---|---|---|
| total height (ear tops) | 1.03 | 1.022 | -0.8% |
| crown / chin | 0.992 / 0.515 | 0.9925 / 0.515 | |
| kerchief band: width front / back; z at the back | 0.314 / 0.328; 0.474-0.529 | 0.36 overall; 0.47-0.53 | soft lens-section band, dips in a V to the knot |
| knot: ⌀; centre z | 0.077; 0.472 | 0.074 × 0.070; 0.470 | |
| lobes: each w × h; centres; bottom | 0.096 × 0.086; x ±0.047, z 0.407; 0.366 | 0.084 × 0.096; ±0.050, 0.400; 0.353 | round 2: flat leaf petals 3 cm thick, angled 30° out and 14° forward |
| shirt width at z 0.35 / at the hem (z 0.26) | 0.39 / 0.45 | 0.41 / 0.45 (+ the 10 mm rolled hem) | |
| shirt hem z | 0.241 | 0.241 | colour edge under the hem lip |
| torso depth front / back (side view, z 0.30) | -0.213..-0.223 / +0.204 | -0.218 / +0.228 incl. hem lip and tail root | |
| trousers width (z 0.20); depth | 0.453; 0.371 | 0.456; 0.376 | |
| trouser legs: each width; centres; cuff | 0.182; ±0.104; z 0.077-0.10 | 0.192 (×1.1 deep); ±0.104; 0.077-0.10 | rolled cuff |
| feet: width × length; centres; visible height | 0.194 × 0.273; ±0.125; 0.072 | 0.194 × 0.272; ±0.125; 0.077 | two toe grooves (three toes) |
| arm angle; arm outer x; paw bottom | ~38°; 0.369-0.376; 0.206-0.225 | 36°; 0.376; 0.201 | puffed short sleeve, hem ~0.07 m below the shoulder |
| tail: z range; tip back / side | 0.18-0.33 (back view), hooked up | 0.15-0.33; tip y 0.31, leaning 3 cm to his right | thick hook, 0.10 m |

## Notes
1. **Height.** The sheet's 1.03 m is taken to the ear tops (the crown is 0.992 m). The model's ear tops are at 1.022 m.
2. **The band in the front view vs the side view.** In the head close-up the band reaches z 0.47 W at the outline, which a 15°
   plane can't do; the side and back views agree on a 15° plane with the sides at ~0.60 W. I followed the side view and
   added a 0.03 W sag at the sides (the side view's own number), so the front view dips less than the sheet's close-up.
3. **Low snout (round 2).** The snout's lower half is rounder and shorter (exponent 1.9, depth 0.175 W): at z 0.06-0.10 it is
   now within 0.01 W of the sheet; at z 0.02-0.04 it sits behind the sheet's line, where the kerchief covers it.
4. **Eye axis.** The eyes sit on the upper slope of the bottom-heavy head, so their lenses face 23° up and 17° out; the sheet's
   eyes look straight ahead. Judge in the game; the rig's lids follow the lens.
5. **Iris vs nose.** On the sheet the iris bottom (0.288 W) is below the nose top (0.329 W). I followed the sheet.
6. **Ears (round 2).** Each ear is one swept triangular flap: 0.30 W wide at the base, 0.08 W thick, rising 0.17 W, then folded
   forward and down through a 140° bend (radius 0.042 W) into a rounded tip at z 0.74 W, just above the band. The tip drifts
   outward, as on the sheet. The base turns 28° out (the director's call) and rolls 8°.
