# Funaki (sk-funaki-toy): sheet measurements vs the model, round 1

Measured on `refs/sheet.png` pixels:
- background masks and row scans: `measure/m1.py` (head close-up), `m2.py` (turnaround, `m2.txt`), `m5.py` (side head);
- colour masks for the band, eyes, nose, muzzle, blush, brows and mouth (`measure/m3.py`), least-squares circle fits for the ears
  (`measure/m4.py`), colour masks per row for the overalls / shirt / fur / pouch (`measure/m6.py front|side|back`);
- ruled crops at 2-8x with 5-10 px grids (`measure/r_*.png`, `measure/ruled.py`) for the eyes, muzzle, pouch and body.

The model column comes from `measurements-model.json` (the build writes it from the SDF and the meshes) and from pixel scans of
the review renders (`measure/model_px.py` on `preview/body_front.png`, `body_side.png`).

**Anchors**
- **HEAD FRONT close-up.** The outline is widest at y 746-758 (x 48..358): **W = 311 px**. The features' midline (eye midpoint,
  nose, muzzle) is x 208 (the silhouette's is 203.4). The chin is y 838, the crown (fur above the band, centre column) y 596, so
  the head is **0.778 W** tall.
- **Turnaround.** The ground line is y 533; the front view's ear tops y 84. The note's 1.11 m is taken to the ear tops, so
  **404.5 px / m** in the front view (the side view is drawn 2% bigger: its ear tops are y 75, 412.6 px / m; the back view's
  "top y 70" is the "2.4 heads" note, it is at the front's scale).
  - The front head is 249 px wide at the cheeks (y 220-238), so **W = 0.6156 m**.
  - The chin is y 297.5, so **CHIN = 0.582 m**; the crown 1.061 m.
  - Body centre x: front 229.5 (the feet), side (the leg axis, model y = 0) 930, back 1285. The head's depth centre in the
    side view (forehead 840.5 / back of the skull 1039 at z 0.40 W) is x 939.8, so **HY = +0.024 m** (behind the leg axis).
- Face values are fractions of W: x from the midline, z above the chin. Body values are metres.

## Face (HEAD FRONT close-up)
| feature | sheet (px) | sheet (W) | model | note |
|---|---|---|---|---|
| head height (crown) | 838-596 | 0.778 | 0.766 (skull) | the fit trades 1.5% of crown for the side profile |
| eye centres x / z | 149, 265.6 / 710 | ±0.1875 / 0.412 | ±0.1875 / 0.412 | |
| eye opening w × h (outer dark contour, lash top to lower rim) | 56 × 59.6 | 0.180 × 0.192 | lid hole 0.168 × 0.178, + rolled rim and lash ≈ 0.18 × 0.19 | 0.21 W with the wing |
| iris w × h; offset toward the nose | 34.5 × 41.5; 10.7 px | 0.111 × 0.133; 0.19 of the opening | ~0.12 × 0.14 (paint), offset 0.18 | white crescent on the outer side; the iris touches the nose-side rim |
| catchlight | 10.6 × 12 px, upper, nose side | 0.30 of the iris | 0.31 of the iris + a small lower one | the brief's two catchlights |
| muzzle w × h, centre z | 104 × 83; y 722..805 | 0.334 × 0.267; 0.240 | 0.334 × 0.267; 0.240 (painted oval, soft 2-3 mm edge) | round |
| muzzle in the side view | front 0.47 W ahead of the head centre, ~0.1 W proud of the face line | | front 0.471-0.477; a 0.055 W displacement | note 2 |
| nose w × h, centre z | 34 × 22; y 728.6..750.7 | 0.109 × 0.071; 0.316 | 0.10 × 0.071; 0.316 | rounded inverted triangle; tip 0.489 W ahead (side), model 0.506 |
| mouth: width; corners / bottom z | 51.4 px; 761 / 774.5 | 0.165; 0.248 / 0.204 | 0.165; 0.248 / 0.199 (line centre) | a plain U, no philtrum line |
| blush centre; w × h (core) | (±96, 749) | (±0.31, 0.286); 0.135 × 0.09 | (±0.31, 0.286); 0.148 × 0.096 (soft edge) | |
| brows centre; length; thickness | (±59.5, 657.5); 36 × 5.5 px | (±0.193, 0.580); 0.116; 0.018 | the same, outer ends 0.024 W lower | soft arcs |
| ear disc (circle fit): centre, ⌀ | (123.3, 623.9) r 54.1; (288.6, 621) r 51.2 | (±0.266, 0.693); 0.338 | (±0.276, 0.690); 0.352 disc, 16° outward | outer edge 0.448 W (sheet 0.435-0.45) |
| light inner ear | ⌀ ~48 px, up 0.35 r and out 0.08 r | ⌀ 0.154 | ⌀ 0.16, up 0.30 r, out 0.08 r, muted tan | |
| headband at the centre (lower / upper edge) | y 638 / 607 | 0.643 / 0.743 (0.10 tall, foreshortened) | 0.638 / 0.719 (front surface) | |
| headband tilt / height (side view) | top 108→172, bottom 140→205 over 185 px | 19.5° back; 0.12 W tall | 19.5°; 0.114 W | |
| headband width (front) | 283 px | 0.913 | 0.95 | 14 mm thick, rounded section |

**Head front widths (W), z above the chin** (sheet: `m4.py`; model: the SDF silhouette).

| z | 0.02 | 0.062 | 0.097 | 0.131 | 0.166 | 0.20 | 0.234 | 0.269 | 0.303 | 0.338 | 0.372 | 0.407 | 0.441 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet | 0.498 | 0.740 | 0.842 | 0.904 | 0.949 | 0.974 | 0.994 | 1.000 | 0.997 | 0.987 | 0.971 | 0.945 | 0.920 |
| model | 0.470 | 0.755 | 0.860 | 0.915 | 0.945 | 0.960 | 0.970 | 0.985 | 0.985 | 0.975 | 0.965 | 0.950 | 0.940 |

**Head profile (side view, W from the head centre; the band's 0.026 W subtracted where it covers the skull).**

| z | 0.019 | 0.035 | 0.10 | 0.20 | 0.30 | 0.366 | 0.413 | 0.46 | 0.507 | 0.57 | 0.649 | 0.696 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet front | 0.287 | 0.334 | (muzzle) 0.45 | (muzzle) 0.468 | (muzzle) 0.47 | 0.401 | 0.388 | 0.378 | 0.365 | 0.338 | 0.27 | 0.23 |
| model front | 0.24 | 0.31 | 0.409 | 0.471 | 0.477 | 0.444 | ~0.40 | 0.38 | 0.367 | 0.35 | 0.29 | 0.24 |

| z | 0.019 | 0.051 | 0.098 | 0.161 | 0.24 | 0.287 | 0.38 | 0.46 | 0.555 | 0.602 | 0.649 | 0.696 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sheet back | 0.198 | 0.288 | 0.347 | 0.39 | 0.41 | 0.414 | 0.392 | 0.384 | 0.37 | 0.347 | 0.308 | 0.253 |
| model back | 0.20 | 0.30 | 0.35 | 0.37 | 0.385 | 0.389 | 0.383 | 0.367 | 0.345 | 0.325 | 0.289 | 0.231 |

The head fit is `scratch/fit_head4.py` (Nelder-Mead, 19 parameters, the plan exponents capped at 2.7 so the head stays round in
plan, the front profile weighted x2 and a flat face line, 0.38-0.40 W, under the muzzle). See note 1.

## Body and costume (turnaround, metres)
| feature | sheet | model | note |
|---|---|---|---|
| total height (ear tops) | 1.11 | 1.115 | |
| crown / chin | 1.061 / 0.582 | 1.054 / 0.582 | |
| overalls half-width (front, his left side) z 0.45 / 0.40 / 0.30 / 0.25 / 0.20 | 0.226 / 0.266 / 0.290 / 0.293 / 0.290 | 0.234 / 0.263 / 0.289 / 0.287 / 0.270 | |
| body front / back (side) z 0.40 / 0.32 / 0.20 | -0.259 / -0.269 / -0.20; +0.228 / +0.240 / +0.194 | -0.263 / (pouch) / -0.263; +0.215 / +0.241 / +0.225 | the front includes the bib and pocket |
| bib top z; width | 0.541; 0.356 (button to button, outer) | 0.548; ~0.33 | the buttons sit just inside its corners |
| buttons | x ±0.144, z 0.508, ⌀ 0.062 | x ±0.14-0.155, z ~0.51, ⌀ 0.062 | gold lens domes on the strap ends |
| straps (front / back) | 0.069 / 0.072 wide; back: straight, x ±0.127, to the overalls' top edge z 0.456 | 0.066 / 0.070; x ±0.127, to z 0.44 | no cross at the back (the sheet) |
| overalls' back top edge | z 0.456 | 0.450 (a soft rolled hem) | |
| pocket | x -0.10..+0.16 (0.26 wide), z 0.292..0.459 | the same, rounded rectangle, rolled top hem | note 3 |
| arm angle; arm span | ~35-38°; 0.895 | 39°; 0.882 | |
| sleeve hem (outer side) | z 0.47 | ~0.47 | puffed, rolled hem |
| paw bottom | z 0.31 | ~0.30 | |
| trouser legs: width each; centres; crotch | 0.215-0.23; ±0.131; z 0.188 | 0.23-0.25; ±0.132; ~0.17 | full length, baggy |
| cuffs | z 0.089..0.156 | 0.089..0.156 (rolled) | |
| feet: width × length; centres | 0.227 × 0.293; ±0.148 | 0.232 × 0.30; ±0.148 | two toe grooves |
| tail: ⌀; centre z | 0.11-0.12; 0.255 (back) / 0.28 (side) | 0.12; 0.26 | |
| pouch: x / z | -0.313..-0.159 / 0.187..0.348 | -0.337..-0.17 / 0.188..0.348 (back panel) | his right hip (note 4) |
| mallet head: length × ⌀; centre z | 0.126 × 0.092; 0.40 | 0.126 × 0.092; 0.40 (top 0.446) | handle ⌀ 0.043 |

## Notes
1. **Head fit.** Widths are within 2% everywhere except the chin row (0.47 vs 0.50 at z 0.02) and z 0.441 (0.94 vs 0.92). The
   front profile at z 0.36 (the muzzle's top shoulder) is 0.444 vs 0.401: the muzzle displacement reaches up there. Crown 0.766 vs
   0.778.
2. **The muzzle.** The sheet's side view shows a distinct toy snout about 0.1 W proud of the face line. The face stays one
   convex ball plus a smooth displacement (the shared lesson); the displacement is 0.055 W with a flatter top (the plateau starts
   at 0.4 of its radius) on a face line fitted at ~0.41 W, so the front lands at 0.47 W and the nose tip at 0.506 W (sheet
   0.489, +3.5%).
3. **The pocket** sits 0.025-0.03 m to his left of the centre in the sheet's front view; I kept that offset.
4. **The pouch side.** The front and back views put it on his **right** hip (the viewer's left in front, the viewer's right
   from the back); the side view (his left side) also draws it, which can't be. I followed the front view (-X). The 3/4 view
   shows it further round his side than the front view does; the model sits between (azimuth -49°, face turned 38°).
5. **Colours.** Swatches as given, with the brief's "dark cloth a little lighter" rule: overalls #537789 (swatch x1.12),
   straps #374B58 (x1.3). The fur is painted #8A664D (the swatch #7A5A44 x1.13), closer to the sheet's lit fur; the muzzle,
   shirt, band/buttons, pouch, nose and blush are the swatches.
