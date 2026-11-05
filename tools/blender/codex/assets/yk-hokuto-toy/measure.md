# Hokuto (yk-hokuto-toy): Step 0, the sheet measured on pixels, and the model against it (round 1)

Source: `refs/sheet.png` (1536 x 1024). Scripts in `measure/`:
- `m1.py`, `m4.py`: the head close-up's outline per row (distance to the local background), the ear circle fits, the band
  edges, the crown columns;
- `m2.py`, `m6.py`: the turnaround per row: extents and colour classes (dark fur, overalls, strap, buckle, shirt, band);
- `m3.py`, `m3b.py`, `m3c.py`, `classes.py`: colour masks and class maps of the face (sclera, iris, pupil, lash, patch,
  nose, mouth, blush, brows); `m3c.py` writes the patch outline (`patch_outline.json`, both patches mirrored and averaged);
- crops `c_*.png`, `mask_*.png`, `patch_*.png` for checking the masks.
- The head is fitted by `scratch/fit_head2.py` (cranium + cheek mass + a soft muzzle displacement, Nelder-Mead), the torso
  by `scratch/fit_torso.py`.

The model column comes from `measurements-model.json` (written by the build from the SDF and the meshes) and the
same-scale comparisons in `preview/cmp-*.png` (`make_compare.py`).

**Anchors**
- **Turnaround**: the ground line y 519, the front view's ear tops y 83; the note's 0.92 m is to the ear tops, so
  **473.9 px / m**. The side and back views share the scale (same chin y ~306, same feet). Body centres x: front 252,
  side 918 (the leg axis = model y 0), back 1271.
  - Front head: 256 px wide at the cheeks (y 240-250), so **W = 0.5402 m**; the chin y 306.5, so **CHIN = 0.4484 m**.
  - The side view's head depth centre (brow 818 / back 1038 px) is x 928, so **HY = +0.021 m** (behind the leg axis).
- **Head close-up (front)**: widest rows y 740-752, x 47..349, **W = 303 px**; the chin y 821 (the dark crease under it),
  the crown y 581.5, so the head is **0.790 W** tall. The features' midline (irises, nose, patches) is x 203; the outline's
  centre is x 198.5 (the painting leans a little).
- Face values are fractions of W: x from the midline, z above the chin. Body values are metres.

## Face (HEAD CLOSE-UP FRONT; model = `measurements-model.json` and the paint parameters)
| Feature | Sheet | Model | Note |
|---|---|---|---|
| Head height, crown to chin | 0.790 W | 0.787 W | |
| Front widths at z 0.05 / 0.08 / 0.12 / 0.16 / 0.20 / 0.24-0.28 / 0.32 / 0.36 / 0.40 / 0.48 / 0.56 | 0.749 / 0.838 / 0.914 / 0.960 / 0.987 / 1.000 / 0.987 / 0.967 / 0.953 / ~0.93 / ~0.91 | 0.738 / 0.843 / 0.922 / 0.963 / 0.985 / 0.999 / 0.984 / 0.970 / 0.957 / 0.935 / 0.906 | above 0.40 the band covers the outline (estimated) |
| Eye opening (sclera + iris, inside the patch) | centre (±0.195, 0.320); 0.198 x 0.196 W | (±0.195, 0.320); lid hole 0.197 x 0.195 W | eyes face ~14° out (the skin normal) |
| Iris | 0.137 x 0.172 W, 0.030 W toward the nose, touching the nasal rim | 0.69 x 0.88 of the opening, 0.30 half-widths nasal | white crescent outside |
| Pupil | 0.104 x 0.124 W (0.76 x 0.72 of the iris), a touch nasal and high | 0.76 x 0.72 of the iris, 0.16 nasal, 0.10 up | |
| Catchlight | one, 0.036 W, up and to the viewer's right in BOTH eyes | 0.036 W, same, not mirrored; + a small faint low one | the shared brief asks for two |
| Lash line | 0.013-0.020 W thick over the top, ~0.03 at the outer corner; two flicks to x 0.33 | roll 0.012-0.02 W wide, ≤ 0.007 W proud; wing 0.042 W + flick 0.025 W, tips x ~0.33 | own objects `Hokuto_lash_L/R` |
| Eye patch | x 0.089..0.411, z 0.180..0.492, centroid (±0.249, 0.333); axes 0.357 x 0.270 W, long axis 39° down outward | the measured outline (40 pts, both sides averaged), painted with 1.6 mm soft borders | sides agree within 0.014 W |
| Brows | x 0.149..0.274; inner end z 0.566 (round, 0.026 W thick), peak 0.570, outer end 0.534 (tapered) | the same arc, 0.025 W max | |
| Nose | 0.092 x 0.056 W, z 0.234..0.290; tip 0.525 W ahead of the head centre (side) | 0.088 x 0.053 W, z 0.236..0.289; tip 0.515 W ahead | rounded inverted triangle, 8.5 mm proud |
| Mouth (centreline) | ±0.0745 W wide; corners z 0.201-0.205, bottom 0.173, flat-bottomed U; 0.008 W line | the same (exponent 2.2), 0.0096 W line, round ends | no philtrum |
| Blush | centre (±0.274, 0.160), core 0.09 x 0.047 W | (±0.274, 0.160), soft 0.12 x 0.068 W, kept off the patches | |
| Ears (circle fit) | centres (±0.308, 0.693), ⌀ 0.353 W, top z 0.870 (= 0.92 m), outer x 0.48 | centres (±0.300, 0.703) (note 2), ⌀ 0.344 W, 0.172 W deep half (near-ball), top 0.9217 m, outer x 0.473 | 16° outward |
| Headband (front view, x 0) | z 0.647..0.749 | 0.645..0.737 (render) | |
| Headband at x ±0.396 (front view) | z 0.50..0.61 | ~0.55..0.64 (note 3) | |
| Headband tilt / height (side) | 19.5° back; 0.112 W across | 19.5°; 0.112 W; 0.013 m thick | |
| Back knot | 0.22 W wide, 0.19 W tall, three lobes | 0.22 x 0.19 W, three tightly unioned lobes | |

## Head profile (SIDE, W from the head centre)
| z | 0.05 | 0.12 | 0.20 | 0.24 | 0.36 | 0.44 | 0.52 | 0.60 | 0.68 |
|---|---|---|---|---|---|---|---|---|---|
| sheet front | 0.418 | 0.477 | 0.508 | 0.518 | 0.430 | 0.426 | 0.410 | 0.371 | ~0.30 |
| model front | 0.419 | 0.468 | 0.492 | 0.498 | 0.433 | 0.421 | 0.409 | 0.378 | 0.309 |
| sheet back | 0.301 | 0.371 | 0.414 | 0.422 | 0.432 | ~0.435 | ~0.425 | 0.391 | 0.332 |
| model back | 0.317 | 0.401 | 0.432 | 0.439 | 0.432 | 0.423 | 0.412 | 0.381 | 0.312 |

## Body (turnaround, metres)
| Feature | Sheet | Model |
|---|---|---|
| Total height (ear tops) | 0.92 | 0.9217 |
| Crown / chin | 0.875 / 0.448 | 0.8735 / 0.4484 |
| Torso half-width (front) z 0.336 / 0.26 / 0.19 | 0.194 / 0.19 / 0.198 | 0.192 / 0.195 / 0.197 (SDF fit); silhouette at z 0.19-0.21: 0.196-0.198 |
| Body front / back (side) at z 0.25 | -0.169 (incl. bib) / +0.151 | -0.161 surface, ~-0.178 with bib and pocket / +0.158 |
| Sleeves | outer ±0.232 at z 0.375; hem z ~0.345 | ±0.24; hem ~0.07 m down the arm |
| Bib | top z 0.38, 0.256 wide; flaring to ±0.17 by z 0.285 | the same outline (front projection), 9.5 mm thick, fading below the waistband |
| Buckles | 0.065 x 0.053, centres ±0.09, z 0.372 | 0.065 x 0.053, ±0.092, z 0.372 |
| Pocket | x ±0.1035, z 0.192..0.331, hem line z 0.303 | the same (U bottom r 0.075, hem step 2.8 mm) |
| Straps | 0.053 wide front, ±0.09; back 0.056, ±0.087, to the waistband | 0.053 / 0.056, ±0.09 / ±0.087 |
| Waistband (back) | z ~0.305..0.335, strap colour | z 0.304..0.336 |
| Arms | paws to ±0.31 (outer), lowest z ~0.23 | 40° out; span 0.614 (±0.307); paw lowest ~0.24 |
| Trouser legs | outer x ±0.19, split z ~0.15, bottoms z ~0.075 | centres ±0.105, r 0.083 x 0.105, cuff z 0.075-0.10 |
| Feet | 0.143 wide, centres ±0.104, 0.07 tall, front y -0.13 | 0.146 x 0.192, ±0.104, 0.076 tall, front -0.126 |
| Tail | ⌀ 0.108-0.12, z ~0.16 (back) / 0.22 (side) | ⌀ 0.112, z 0.19, y +0.166 |

## Notes (differences over 5%, and calls I made)
1. **The lower face**: the unconstrained fit reached the sheet's side muzzle (0.52 W) only with a strong, narrow muzzle
   displacement that put a crease round the mouth in the toon band. The final fit (`scratch/fit_head2.py`) holds the muzzle
   to 0.05 W and wide radii: the lower face is 0.02 W (4%) less proud, and smooth.
2. **The ears** sit 0.008 W in and 0.010 W up from the sheet's circle centres, and back to 0.052 m behind the head centre,
   so the band passes in front of their bases from both 45° yaws. The sheet's side view draws them as near-balls, so they
   are 0.17 W thick (half-depth), not discs.
3. **The band's sides**: the sheet's side view and front view disagree about how low the band runs at the sides (the
   side view fits a plane tilted 19.5°; the front view dips 0.06 W lower at x 0.4). I added a 0.035 W sag at the sides,
   half the difference, so both views read.
4. **The eye's iris bottom** (z 0.234) sits at the nose's bottom, not above its top (0.290): the sheet's choice, followed.
5. **The back of the head at z 0.08-0.20** is 0.02-0.03 W fuller than the sheet (the cheek mass wraps round); it sits
   over the shoulders and straps, hidden from the game camera. Left for the director's call.
6. **The tail height** differs between the side (z ~0.22) and back (~0.16) views; I used 0.19.
7. The brief's director numbers give only the 0.92 m height, which matches.
