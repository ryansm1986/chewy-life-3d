# Okami Yae (ak-yae-toy): sheet measurements vs the model, round 1

Measured on `refs/sheet.png` pixels:
- background masks and row scans (`measure/m1.py` head close-up, `measure/m2.py` turnaround, `m2_*.txt`);
- nearest-swatch colour classes (`measure/cls.py`, `m3.py`, `m6.py`) for the obi, apron, kimono, trousers and fur;
- colour masks with connected components for the face (`measure/m4.py`), least-squares circle fits for the ears and
  sclera / iris masks for the eyes (`measure/m5.py`);
- 4-8x crops for the shapes (`measure/r_*.png`, `front2x.png`, `side2x.png`, `back2x.png`, `q2x.png`).

The model column comes from `measurements-model.json` (the build writes it from the SDF and the meshes).

**Anchors**
- **HEAD FRONT close-up.** The head outline is widest at y 714-720 (x 49..343): **W = 295 px**. The features' midline is
  x 198 (nose, mouth and the eye pair agree within 1 px). The chin (the head's lower edge over the collar, centre column)
  is at **y 791**; the crown at y 577 -> **0.725 W** (the turnaround gives 0.744; the model has 0.743, between them).
- **Turnaround.** Ground line y 526, ear tops y 87.5 (front view). The sheet's "HEIGHT 1.07 m" is taken to the ear tops
  (as Takumi's): **410 px / m**.
  - The front-view head is 227 px at the cheeks -> **W = 0.554 m**; the chin y 278 -> **CHIN = 0.605 m**.
  - Body centre x: front 233.5, 3/4 599, back 1284.5. Side view: the trouser legs' axis x 921.5 (model y = 0); the head's
    depth centre (face 831 / back 1041) is x 936 -> **HY = +0.035 m** (the head sits a little behind the belly).
- Face values are fractions of W: x from the midline, z above the chin. Body values are metres.

## Face (HEAD FRONT close-up)
| feature | sheet (px) | sheet (W) | model | note |
|---|---|---|---|---|
| head height (crown) | 791-577 | 0.725 (turnaround 0.744) | 0.743 | |
| eye centres x / z | 140.5 and 256.5 / 679 | ±0.197 / 0.380 | ±0.197 / 0.382 | centre of the opening (sclera + iris) |
| eye opening w × h (inside the dark rim) | 57 × 57 | 0.193 × 0.193 | lid hole 0.192 × 0.194 | the outer dark contour with the lash is 0.207 tall |
| iris w × h; offset toward the nose | 38 × ~50; 8 px | 0.129 × 0.17; 0.14 of the opening | paint irx 0.76, irz 1.02 (eye radii); 0.125 | white crescent on the outer side, the iris reaches the lower rim |
| catchlight | ⌀ 13.5 px, at +14 px toward the nose, 13 px up | 0.046 W, 0.35 of the iris | ⌀ 0.245 eye radii (0.047 W) at (0.45, 0.43) | one big round catchlight (the sheet shows one) |
| upper lash: thickness top; wing | ~4-5 px; tip 14 px out of the outer corner | 0.015; 0.047 | 0.020 at the top, wing 0.036 W | its own roll (`Yae_lash_L/R`), the wing a teardrop curling up |
| muzzle: width; top / widest / bottom z | 108; y 691 / 734 / 768 | 0.370; 0.338 / 0.19 / 0.077 | 0.370; 0.338 / 0.19 / 0.077 | painted bean, two half-ellipses (up 0.148, down 0.113), soft edge |
| nose w × h, centre z | 25 × 17; y 704 | 0.085 × 0.058; 0.295 | 0.084 × 0.054; 0.295 | 14 mm glossy button |
| mouth: width; corners / bottom z | 42; y 726 / 736 (centre line) | 0.142; 0.222 / 0.187 | 0.142; 0.222 / 0.187 | one soft U, corners curl up; no philtrum line (the sheet has none) |
| blush centre; w × h | (±96, 718) | (±0.326, 0.247); 0.142 × 0.078 | the same; soft edge 0.80-1.05 of 0.152 × 0.086 | |
| brows centre; length; thickness | (±59, 620); 39 px; ~5 px | (±0.200, 0.578 bbox); 0.13; 0.017 | ends z 0.562, top 0.590; 0.12 + round tips; 0.016 | |
| ear disc (circle fit): centre, ⌀ | (116.7, 597.1) r 50.8; (275.6, 597.8) r 50.7 | (±0.27, 0.656); 0.344 | (±0.268, 0.656); 0.344 disc, 18° outward | outer edge ±0.44 W (model 0.435) |
| light inner ear | 54 × 46 px, 5.6 px above the disc centre | 0.18 × 0.156 | 0.52 × 0.46 of the disc radius, +0.11 r up | |

**Head front widths (W), z above the chin.** Sheet: the outline per row (`m1.py`); above z 0.5 the head's outline
between and under the ears (columns at x ±0.30-0.40 W; z 0.65-0.70 interpolated along the dome's arc to the flat top,
±0.11 W at z 0.72). Model: the SDF silhouette.

| z | 0.02 | 0.064 | 0.092 | 0.132 | 0.166 | 0.20 | 0.241 | 0.303 | 0.338 | 0.372 | 0.407 | 0.441 | 0.476 | 0.50 | 0.55 | 0.60 | 0.65 | 0.70 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet | 0.645 | 0.824 | 0.885 | 0.946 | 0.975 | 0.990 | 1.000 | 0.988 | 0.973 | 0.952 | 0.928 | 0.900 | 0.866 | 0.835 | 0.765 | 0.645 | 0.52 | 0.34 |
| model | 0.61 | 0.84 | 0.915 | 0.96 | 0.975 | 0.98 | 0.98 | 0.975 | 0.965 | 0.95 | 0.93 | 0.90 | 0.86 | 0.83 | 0.755 | 0.655 | 0.52 | 0.335 |

**Head profile (side view, W from the head centre).**

| z | 0.035 | 0.10 | 0.147 | 0.20 | 0.27 | 0.366 | 0.454 | 0.498 | 0.542 | 0.586 | 0.63 | 0.674 | 0.718 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet front | 0.423 | 0.493 | 0.515 | 0.52 | 0.53 | 0.449 | 0.436 | 0.423 | 0.405 | 0.383 | 0.352 | 0.30 | 0.225 |
| model front | 0.376 | 0.495 | 0.519 | 0.525 | 0.524 | 0.467 | 0.446 | 0.428 | 0.405 | 0.375 | 0.338 | 0.286 | 0.202 |

| z | 0.035 | 0.101 | 0.145 | 0.189 | 0.256 | 0.30 | 0.366 | 0.41 | 0.476 | 0.542 | 0.586 | 0.63 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet back | 0.317 | 0.405 | 0.436 | 0.449 | 0.463 | 0.463 | 0.454 | 0.441 | 0.423 | 0.392 | 0.37 | 0.335 |
| model back | 0.341 | 0.432 | 0.45 | 0.456 | 0.46 | 0.462 | 0.458 | 0.452 | 0.432 | 0.399 | 0.371 | 0.333 |

The nose tip (side view): sheet 0.533 W ahead of the head centre; model 0.543 W.

The head fit is `scratch/fit_head.py` (Nelder-Mead on 19 parameters, Takumi's construction; plan exponents capped at 2.7 so
the head is round in plan), started from Takumi's head. Yae's head is a dome: much narrower above the cheeks than
Takumi's (0.73 W at z 0.566, 0.49 at 0.66, the ears perched on its shoulders) and deeper front to back (0.91 W vs his
0.80). After the fit the cheek mass was moved 0.015 W back (the fit put the face above the muzzle at 0.48 W; the sheet has
0.45) and the muzzle relief raised to 0.060 W, so the muzzle reads as a bump in profile. Residuals: the widest width is
0.98 W (-2%), the lower cheeks (z 0.06-0.13) are 1.5-3% wide, the face above the muzzle is 2-4% forward.

## Body and costume (turnaround, metres)
| feature | sheet | model | note |
|---|---|---|---|
| total height (ear tops) | 1.07 | 1.063 | |
| crown | 1.012 (turnaround) | 1.017 | |
| chin | 0.605 | 0.605 | |
| kimono shoulders with the sleeves, front width (z 0.52) | 0.59 | 0.63 (sleeve tops) | |
| kimono under the obi: half-width at z 0.376 / 0.332 / 0.288 (hem 0.266) | 0.217 / 0.244 / 0.254 | 0.214 / 0.244 / 0.254 | lathe table = the sheet rows |
| kimono back depth at the hem | +0.228 | +0.228 | |
| obi: width (front), z, front / back depth | 0.379; 0.388-0.457; -0.196 / +0.194 | 0.378; 0.386-0.458; -0.197 / +0.195 | |
| obi knot (back): width, z, proud | 0.19; 0.385-0.478; 0.044 | 0.19; 0.385-0.478; 0.045 | flat rounded cushion |
| apron: half-width under the obi / at z 0.307 / widest; hem | 0.168 / 0.194 / 0.205 (z 0.22); 0.181 | the same table; 0.181 (corners r 0.040) | |
| apron depth (side): z 0.375 / 0.30 / hem; side edges | -0.218 / -0.233 / -0.243; -0.137 | ~-0.21 / ~-0.22 / -0.231; -0.116 | note 2 |
| sleeve cuff centre (front) | x 0.252, z 0.444 | x 0.257, z 0.435 | short wide sleeves, rolled cuff |
| arm angle; arm span; paw bottom | ~50°; 0.739; 0.334 | 50°; 0.756; 0.323 | note 3 |
| arm (fur) thickness | ~0.12 | 0.112-0.132 (mitten swell) | |
| trousers: total width; depth (side) | 0.510 (z 0.17); 0.376 | 0.507; 0.367 | balloon legs, LEG_SQ 1.40 |
| crotch; cuff band z; cuff width each | 0.117; 0.083-0.110; 0.22 | ~0.12; 0.078-0.112; 0.217 | gathered cuff with a crease above |
| feet: width × length × height; centres x | 0.171 × 0.271 × 0.078; ±0.115 | 0.172 × 0.272 × 0.080; ±0.116 | two toe grooves; painted a lighter tan (the sheet's feet) |
| tail: ⌀; centre z; back | 0.10 (x) × 0.083; 0.259 (back view); +0.265 | 0.10 × 0.092; 0.262; +0.258 | sits on the kimono hem |
| collar band width / crossing z | ~0.049 / 0.515 | 0.046 / 0.515 | left over right; fur in the V |

## Notes
1. **Height.** "1.07 m" is taken to the ear tops, like Takumi's; the crown is 1.017 m. If the director means the crown,
   everything scales by 1.052.
2. **The apron's stand-off.** The side view hangs the apron 0.035-0.04 m off the kimono (front -0.243 at the hem); at that
   depth the 3/4 view read as a stiff box, so round 1 hangs it about 0.025 m off (-0.231, 5% short). The sheet's back view
   also shows the apron's side edges peeking out beyond the kimono; the front and side views don't allow that (the kimono
   is visible beside the apron in front), so I followed the front and side views.
3. **Arm angle.** The sheet's fur forearms hang about 50° out of the short sleeves (the paws clear the obi and kimono);
   the brief's 25-30° would bury the paws in the 0.43-0.51 m kimono, so 50° (Fuku's choice for the same outfit).
4. **Colours.** The swatches are used as the base of every ramp (value-only light and shade). The trousers #5A3424 are
   painted #6C3F2C (+20%, same hue) for the game's dark grade; the feet are a lighter tan #BC8A62 (the sheet's feet are
   visibly lighter than the fur); the collar is the apron cream (the sheet's swatch "Apron / collar").
