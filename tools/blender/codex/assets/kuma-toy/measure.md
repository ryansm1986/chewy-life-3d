# Kuma (kuma-toy): sheet measurements vs the model, round 1

Measured on `refs/sheet.png` pixels: palette segmentation (`scratch/seg.py`, `scratch/m1.py`, `scratch/m2.py`) and ruled
crops (`scratch/ruled.py`, 3-10x zoom, 4-5 px grid; `scratch/r_*.png`). The model numbers come from
`measurements-model.json` (written by the build) and from the same-scale comparisons in `preview/cmp-*.png`.

**Anchors**
- Head close-up (HEAD FRONT): W = 332 px at the cheeks (x 54..386, rows y 768..780). The head outline is centred at
  x 220 and the features' midline at x 223 (nose, muzzle and eye midpoints). The chin (the head's lower outline at the
  scarf) is at y 847. W = 0.676 m, so the close-up is 491 px/m.
- Turnaround: ground y 499, hat top y 54, so 1.40 m = 445 px (318 px/m). Body centre x: front 231.5, 3/4 578, back
  1266.5. In the side view the leg axis is x 920 (model y = 0).
- Heights are metres above the ground. Face values are fractions of W: x from the midline, z above the chin.

## Face (HEAD FRONT close-up)
| feature | sheet (px) | sheet (W) | director | model | note |
|---|---|---|---|---|---|
| eye centres x | 149.25 / 298 | ±0.224 | ±0.23 | ±0.224 | |
| eye centre z | 742 | 0.316 | ~0.33 | 0.316 | |
| eye opening w × h (outer dark contour) | 64 × 64.5 | 0.193 × 0.194 | 0.21 × 0.22 | 0.190 × 0.194 | the director's 0.21 includes the lash wing (69 px = 0.21 W); the height differs by 12% (see note 1) |
| iris w × h (of the opening) | 44 × 53 | 0.69 × 0.83 | 68% w | 0.71 × 0.93 (paint) | the iris is taller in paint because the top lash covers its top |
| iris offset toward the nose | 8.75 px | 0.14 of the opening | | 0.155 | white crescent on the outer side |
| catchlight | ⌀ ~10 px, upper | 0.155 of the opening | 2 | 1 big upper + 1 small lower | the sheet shows one; the shared brief asks for two |
| muzzle w × h | 122 × 88 | 0.367 × 0.265 | 0.37 × 0.25 | 0.367 × 0.265 (painted oval) | |
| muzzle centre z | 792 | 0.166 | 0.14 | 0.166 | the director's 0.14 is 16% lower; I measured from the oval's top 748 and bottom 836 |
| nose w × h | 36 × 20 | 0.108 × 0.060 | 0.11 | 0.103 × 0.060 | |
| nose top / bottom z | 754 / 774 | 0.280 / 0.220 | top of the muzzle | 0.281 / 0.221 | |
| mouth width | 54.5 | 0.164 | 0.15 | 0.166 | "w" with dips at z 0.169 and corner ticks at 0.19 |
| blush w × h | 41 × 29 | 0.124 × 0.087 | 0.12 × 0.07 | 0.124 × 0.087 | |
| blush centre | x ±0.34, y 779.5 | (±0.34, 0.203) | ±0.36, level with the muzzle top | (±0.34, 0.203) | the blush centre is 0.095 W below the muzzle top (0.298), not level with it (note 2) |
| brows | centres x ±68 px, y 680; 32 × 7 px | (±0.204, 0.503); length 0.096, thickness 0.020 | | (±0.204, 0.503); 0.096 long, 0.026 thick at the middle | |
| ear disc | ⌀ 82-85 px, centre (99, 651) | ⌀ 0.25, centre (±0.364, 0.59) | ⌀ 0.28 at ±0.36 | ⌀ 0.262 at (±0.368, 0.63) | the side view puts the ear centre at 0.63 W; I used 0.63 so the ears sit high at the corners, as in the back view |
| inner ear disc | ⌀ 40 px | 0.12 | | 0.126 | |
| ear facing | side-view width 0.148 m | about 40° outward | | 40° outward, 8° up | |
| toque band, lower edge at the front centre | y 638 | 0.63 | | 0.633 (1.0835 m) | |
| toque band width (close-up / turnaround) | 163 px / 116 px | 0.49 / 0.54 | | 0.51 (0.344 m) | |

**Head front widths (W), z above the chin.** The sheet is the head outline per row below the ears; the model is the
SDF's front silhouette (`head_width_W_at_z`).

| z | 0.02 | 0.057 | 0.093 | 0.20 | 0.24 | 0.31 | 0.35 | 0.38 | 0.42 | 0.455 |
|---|---|---|---|---|---|---|---|---|---|---|
| sheet | 0.69 | 0.84 | 0.925 | 1.00 | 0.997 | 0.95 | 0.92 | 0.895 | 0.86 | 0.82 |
| model | 0.565 | 0.82 | 0.92 | 0.985 | 0.99 | 0.965 | 0.93 | 0.90 | 0.855 | 0.815 |

From z 0.057 up, the widths match to within 2.5%. At z 0.02 the model is 18% narrower: the sheet's lowest rows are
the jaw shadow merging into the scarf, so that edge is uncertain (note 3).

## Body and costume (turnaround, metres)
| feature | sheet | model | note |
|---|---|---|---|
| total height (hat top) | 1.40 | 1.407 | |
| crown (skull top, under the band) | 1.15 (annotation) | 1.141 | the band covers it |
| chin | 0.654 (y 291) | 0.654 | |
| head : height | 2.4 heads (annotation); crown to chin 0.496 m = 2.32 | 0.487 m = 2.36 | |
| toque band, front top / visible bottom | 1.19 / 1.082 | 1.19 / 1.0835 | |
| toque band height / tilt | 0.10 m / about 9° back (side view: back edge 20 px lower) | 0.10 / 9° | |
| cloud width / depth | 0.58 (0.62 in the close-up) / 0.49 | 0.616 / 0.534 (the band and the cloud together) | |
| cloud tops: front puff / side and back puffs | 1.40 / 1.34-1.35 | 1.407 / sides 1.36, back 1.38 | 4 puffs on a small base, the front puff the tallest; I raised the back puff so the band shows from behind |
| head depth (side): nose tip / forehead / back, from the leg axis | -0.336 / -0.236 / +0.289 | -0.318 / -0.233 / +0.308 | the nose tip is 5% shy, the back of the head 7% deep |
| body width (max, hips) | 0.63-0.66 | 0.638 | |
| belly front / back (side, z 0.33) | -0.283 / +0.26 | -0.28 / +0.27 | |
| arm span | 1.08 | 1.00 | the arms are at 38° (note 4) |
| paw diameter | 0.176 | 0.172 | |
| legs: width each / centres | 0.25 / ±0.171 | 0.236 / ±0.17 | |
| feet: width × length × height | 0.264 × 0.343 × 0.094 | 0.264 × 0.344 × 0.098 | 2 toe grooves (geometry and paint) |
| tail: ⌀ / centre z / proud of the back | 0.14 / 0.256 (back view), 0.336 (side view) / 0.08 | 0.144 / 0.272 / 0.09 | the sheet's two views disagree; I used the back view |
| waist tie, z | 0.36-0.42 | 0.374-0.426 | |
| buckle w × h | 0.113 × 0.094 | 0.112 × 0.094 | |
| apron bib: top / half-width | 0.61 (under the scarf) / 0.215 at the top, 0.24 at the waist | 0.628 (hidden) / 0.214, 0.238 | |
| apron skirt: top / bottom (centre) / half-width | 0.47 / 0.167 / 0.31 | 0.474 / 0.165 / 0.31 (front view) | 0.085 m corner rounding |
| the bib's arch cut-out (belly shows) | top 0.575, 0.24 wide at the waist | top 0.574, 0.236 wide | |
| neckerchief: front band z / back band z | 0.61-0.65 / 0.59-0.665 | 0.60-0.66 / 0.59-0.69 | |
| knot ⌀ / leaf ends | ~0.10 / ~0.13 long | 0.10 × 0.088 / 0.122 long, 0.06 wide, 0.024 thick | |

## Notes
1. **Eye opening.** The sheet's eye is nearly round (64 × 64.5 px). The director's 0.22 W height doesn't match my
   pixel count: from the lash top (710) to the lower rim (774) is 0.193 W. I modelled the measured 0.19 W.
2. **Blush height.** The sheet's blush ovals span y 765..794, centre 779.5, which is z 0.203 W. That's below the
   muzzle top (0.298 W) and level with the muzzle's upper third. I modelled what the sheet shows.
3. **The chin's lowest rows.** Below z 0.05 W the sheet's outline is the jaw's contact shadow on the scarf. A wider
   flat jaw (0.69 W at z 0.02) turned the head into a box in round-1 tests, so I kept the rounder bottom. It's
   adjustable (`CK` lower-half exponent and radius).
4. **Arm angle.** The sheet's arms hang about 50° out (paws at ±0.455 m). The shared brief asks for a 25-30° A-pose
   for the rig. At 30° the paws sink into Kuma's 0.64 m belly and the apron's side edges, so I used 38° as the
   compromise. `ARM_DEG` in the build changes it.

## Round 2 (director feedback-1)
Head front widths (W), z above the chin; the model values are from `measurements-model.json` (`head_width_W_at_z`).

| z | 0.31 | 0.38 | 0.42 | 0.45 | 0.50 | 0.55 | 0.60 | 0.63 | 0.65 | 0.70 | 0.75 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| director target | | | | | | | 0.86 | | | | 0.78 |
| round 1 | 0.965 | 0.90 | 0.855 | 0.815 | | 0.70 | 0.66 | 0.545 | | | 0 |
| round 2 | 0.97 | 0.92 | 0.905 | 0.90 | 0.89 | 0.87 | 0.82 | 0.765 | 0.715 | 0.445 | 0 (inside the band) |

- **Crown and band:** the skull crown is at 0.712 W (1.136 m), under the band, and the band's visible front edge is at 0.64 W (1.0865 m; the sheet has 0.63).
- **Why 0.75 W can't be 0.78 W wide with the locked toque:** the band is 0.344 m (0.51 W) across. A head 0.78 W wide at 0.75 W (1.161 m, the band's top) would be 0.53 m across inside the band. In the fit, 0.62 W at 0.75 already moved the band's visible front edge to 0.73 W and buried its sides (`scratch/fit_head.py`).
- **The sheet beside the band:** the head's top line between the band and the ears is at y 640-650 px, which is 0.60-0.62 W.
- **What I built:** a soft squircle across (a superellipsoid cranium, exponents 3.0 across, 2.0 front-to-back, 3.0 vertical), as wide as possible up to 0.60 W, rounding onto a domed top the band sits on.
- **The stiffer squircle I rejected:** 0.86 W at 0.60 W. It read as a box with a flat shelf in front of the band (tested, `scratch/fit_head.py` variants).
- **Muzzle:** it now stands 0.019-0.030 W proud of the face (z 0.10-0.25). It was 0.05-0.076 W.
- **Nose:** it still sits on the muzzle at the same front-view place and size. With the flatter muzzle, its tip is 0.455 W ahead of the head centre (it was 0.51).
- **Eyes:** they still follow the face's surface. With the flatter face across, they now face 15.8° outward (19-20° before).

## Round 3 (director feedback-2)
Head front widths (W), z above the chin, from `measurements-model.json`:

| z | 0.093 | 0.20 | 0.25 | 0.31 | 0.38 | 0.45 | 0.50 | 0.55 | 0.60 | 0.65 | 0.70 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| director target | | | 1.00 | | | 0.94 | | | 0.84 | | |
| round 3 | 0.93 | 0.995 | 1.00 | 0.99 | 0.965 | 0.94 | 0.925 | 0.895 | 0.835 | 0.725 | 0.51 |

- **The fit:** `scratch/opt_head.py`, a random search over the cranium and cheek-mass parameters against these widths, the band edge and the crown.
- **The head masses:** both are near-elliptical across, so the head is round in plan. Cranium exponents 2.5 across and 2.0 front-to-back; cheek mass 2.36 across and 2.1 front-to-back.
- **Crown and band:** the crown is 0.725 W (1.146 m) under the band, and the band's visible front edge is at 0.648 W (1.0915 m).
- **Muzzle:** it's now a smooth displacement of the ball, not a union. It is 0.028 W at its centre and has zero slope at its edge, and its lower half fades into the chin over 0.22 W. There's no union crease and no shading shelf.
- **Apron:** one continuous outline. Each side curves from the bib's top corner (±0.214 m, z 0.628) to the skirt's widest point (±0.36, z 0.31), with 0.06 m bottom corners. The cloth is 15 mm thick, with no ledge or hem line.

## Round 4 (director feedback-3)
Back of the head in profile (y behind the head centre, W; x = 0), from `measurements-model.json`:

| z | 0.05 | 0.10 | 0.20 | 0.30 | 0.40 | 0.50 | 0.60 | 0.65 | 0.70 |
|---|---|---|---|---|---|---|---|---|---|
| round 3 | 0.286 | 0.347 | 0.390 | 0.412 | 0.415 | 0.407 | 0.359 | 0.304 | 0.200 |
| round 4 | 0.159 | 0.267 | 0.365 | 0.404 | 0.412 | 0.395 | 0.321 | 0.243 | 0.063 |

- **The back trim (`BK`):** a large rear ellipsoid, smoothly intersected and acting on the back half only, trims just the lower-back corner (0.08-0.13 W) and the upper-back corner (0.04-0.06 W at z 0.60-0.65). The mid-height depth is kept (0.412 at z 0.40). The chin line is computed from the uncut ball, so the front is unchanged.
- **The upper back-side by the ears (`BK2`):** a second, soft trim rounds it by up to 0.026 W in plan (`scratch/fit_side.py`; z 0.62 at 60° behind the side).
- **Front widths:** 1.00 / 0.94 / 0.83 W at z 0.25 / 0.45 / 0.60; the 0.60 width was 0.835.
- **Nose tip:** 0.508 W ahead of the head centre (round 3: 0.465). The muzzle bump's centre moved up to the nose (z 0.19) with a flatter top: 0.046 W at its centre, 0.039 W proud at the nose height, still zero slope at its edge. The button now stands 38 mm proud. The front look (the painted oval, the nose's outline, no shelf) is unchanged.
