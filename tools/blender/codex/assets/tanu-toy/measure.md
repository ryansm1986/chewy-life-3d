# Tanu (tanu-toy): sheet measurements vs the model, round 1

Measured on `refs/sheet.png` pixels: a background mask and palette classes (`measure/m1.py`, `measure/cls.py`), row and
column scans, connected components and a least-squares circle fit (`measure/m2.py` .. `m7.py`), and ruled crops at
3-7x (`measure/r_*.png`, 5-10 px grid). The model column comes from the build's `measurements-model.json` (the SDF and
the meshes) and from the same colour masks run on the model's ortho front render (`measure/mf.py` on
`preview/head_front.png`).

**Anchors**
- HEAD FRONT close-up: head outline x 39..340 at its widest rows (y 736-748), so **W = 302 px**; outline centre x 189.5,
  features centred on x 190 (nose 190.5, eye midpoint 191). The chin (the fur rim under the cream muzzle, centre column)
  is at **y 810**.
- Turnaround: ground y 502.5, top of the leaf's stem y 87 -> 1.08 m = **384.7 px / m**. The full-body head is 258 px
  wide at the cheeks, so **W = 0.671 m**; chin y 300 -> **0.524 m**. Body centre x: front 211, 3/4 570, back 1325; side
  view leg axis x 911 (model y = 0), head depth centre x 920 (y = +0.023 m).
- Face values are fractions of W: x from the midline, z above the chin. Body values are metres.

## Face (HEAD FRONT close-up)
| feature | sheet (px) | sheet (W) | director | model | note |
|---|---|---|---|---|---|
| head height (crown, under the leaf) | hidden | ~0.70 (dome fit) | 0.78 | 0.687 | note 1 |
| eye centres x / z | 122.5, 259.5 / 719.5 | ±0.227 / 0.300 | ±0.21 / 0.40 | ±0.227 / 0.300 | note 2 |
| eye opening w × h (white, incl. iris) | 56 × 60 | 0.185 × 0.199 | 0.22 × 0.25 | 0.194 × 0.210 (lid rim) | with the dark lid rim the sheet is 0.205 × 0.222 |
| iris w × h, offset | 41 × 52, 8 px toward the nose | 0.135 × 0.172; 0.72 of the opening width | 68% | 0.136 × 0.176 (paint), 0.27 of the half-width toward the nose | white crescent on the outer side |
| pupil | 37 × 45, a little high | 0.90 × 0.87 of the iris | | 0.84 of the iris, raised 0.10 | the amber is a lower crescent |
| catchlights | ⌀ 13 px upper-nasal; ⌀ 6.5 px mid | 0.043 / 0.021 | two | 0.042 / 0.020 | |
| mask band x extent | 56..323 | ±0.44 | 0.95 wide | ±0.437 | the outer tips stop short of the head outline (0.50) |
| mask top / bottom at x 0.225 | | 0.474 / 0.169 | ~0.30 tall | 0.472 / 0.176 | per-column table below |
| mask over the nose bridge, top / bottom | | 0.361 / 0.288 | | 0.363 / 0.290 | the bridge joins the muzzle top |
| muzzle (cream bell) w, z range | 120 px; y 724..804 | 0.40; 0.02..0.288 | 0.36 × 0.24 | 0.40; 0.02..0.288 (painted to the measured rows) | narrow at the bridge, widest at z 0.13 |
| nose w × h, top / bottom | 30 × 22; 728 / 750 | 0.10 × 0.073; 0.272 / 0.199 | 0.09 | 0.10 × 0.075 outline (0.087 dark in the render) | rounded inverted triangle |
| nose tip in profile, ahead of the head centre | side view | 0.492 | | 0.484 | |
| mouth: width, corners / dips / centre z | 48 px | 0.165; 0.169 / 0.141 / 0.149 | | 0.167; 0.169 / 0.141 / 0.151 | a small sly "w" with corner ticks |
| blush centre, w × h | (±103, 762) | (±0.342, 0.159); 0.111 × 0.075 | | (±0.341, 0.160); 0.113 × 0.076 (render) | on the lower edge of the mask |
| brows centre, length, thickness | 31 × 16 px boxes | (±0.186, 0.522); 0.105; ~0.026 | | (±0.186, 0.512-0.524); 0.10; 0.027 | soft arcs |
| ear disc (circle fit), centre / ⌀ | (100, 625), r 50 px | (±0.30, 0.615) / 0.33 | 0.28 at ±0.40 | (±0.30, 0.615) / 0.32 | outer edge ±0.46 (model 0.448), top 0.778 (model 0.774) |
| pink inner (visible) | ⌀ 39 px | 0.13, centre (±0.326, 0.634) | | 0.155 disc in the cup (part hidden by the head) | |
| ear facing | side view 0.143 m deep | about 25-30° outward | | 28° | |
| leaf, front-view extent | x 126..280, y 561..626 | x -0.21..+0.30, z 0.61..0.82 | 0.75 W long | x -0.27..0.311, z 0.567..0.811 (render) | note 6 |

**Head front widths (W), z above the chin** (sheet: outline per row; model: SDF silhouette / front render).

| z | 0.02 | 0.06 | 0.113 | 0.152 | 0.20 | 0.235 | 0.30 | 0.364 | 0.444 | 0.497 |
|---|---|---|---|---|---|---|---|---|---|---|
| sheet | 0.66 | 0.825 | 0.93 | 0.97 | 0.995 | 1.00 | 0.98 | 0.944 | 0.877 | 0.821 |
| model | 0.555 | 0.82 | 0.95 | 0.985 | 0.995 | 1.0 | 0.97 | 0.93 | 0.885 | 0.84 |

Above z 0.50 the sheet's outline is hidden by the ears; where it shows against them it passes x ±0.23 at z 0.65.
The model's top: z 0.688 at x 0.0, z 0.685 at x 0.1, z 0.669 at x 0.2, z 0.66 at x 0.23, z 0.629 at x 0.3, z 0.594 at x 0.35.

**Head profile (side view, W from the head centre)**

| z | 0.031 | 0.078 | 0.124 | 0.171 | 0.264 | 0.357 | 0.45 | 0.543 |
|---|---|---|---|---|---|---|---|---|
| sheet front | 0.407 | 0.442 | 0.453 | 0.473 | 0.422 | 0.403 | 0.38 | 0.329 |
| model front | 0.388 | 0.452 | 0.466 | 0.466 | 0.407 | 0.408 | 0.396 | 0.353 |
| sheet back | 0.279 | 0.341 | 0.376 | 0.399 | 0.415 | 0.411 | 0.38 | 0.326 |
| model back | 0.221 | 0.311 | 0.349 | 0.381 | 0.391 | 0.402 | 0.393 | 0.351 |

**Mask, per column (W)** (sheet `measure/m4.py`; model `measure/mf.py`)

| x | 0 | 0.066 | 0.119 | 0.172 | 0.225 | 0.278 | 0.331 | 0.384 | 0.411 |
|---|---|---|---|---|---|---|---|---|---|
| sheet top / bottom | .361/.288 | .384/.275 | .447/.242 | .472/.199 | .474/.169 | .457/.166 | .427/.197* | .375/.185* | .335/.172 |
| model top / bottom | 0.363/0.290 | 0.384/0.278 | 0.442/0.244 | 0.470/0.203 | 0.472/0.176 | 0.455/0.166 | 0.426/0.199 | 0.374/0.187 | 0.332/0.186 |

\* the blush covers the mask's lower edge there.

## Body and costume (turnaround, metres)
| feature | sheet | model | note |
|---|---|---|---|
| total height (leaf stem tip) | 1.08 | 1.068 | |
| ear tops | 1.034-1.045 | 1.043 | |
| leaf top (blade) | ~1.06 (front 0.80 W) | 1.068 (blade 0.902..1.068) | |
| crown (under the leaf) | hidden (~0.99) | 0.986 | |
| chin | 0.524 | 0.524 | |
| head : height | "2.4 heads" (annotation); pixels: chin to the leaf top 0.55 m = 1.95 | as the pixels | the annotation doesn't match the drawing; I followed the pixels |
| head depth without / with the nose | 0.56 / 0.61 | 0.535 / 0.591 | |
| torso width (hips, z 0.15-0.2) | 0.51 | 0.503 | |
| belly front / back (side view, z 0.27) | -0.25 / +0.205 | -0.244 / +0.209 | |
| cream belly oval | 0.343 wide, z 0.145..0.522 | 0.344, z 0.145..0.521 | painted, front projection |
| arms: angle / span / thickness | about 52° / 0.87 / 0.12-0.13 | 45° / 0.786 / 0.13 | note 3 |
| dark forearm from | the elbow (about 45% of the arm) | 46% | |
| legs: centres / width / dark from | ±0.138 / 0.21 / z 0.11-0.12 | ±0.135-0.15 / 0.20 / z 0.112 | |
| feet: width × length × height, centres | 0.20 × 0.26 × 0.08, ±0.166 | 0.20 × 0.26 × 0.084, ±0.162 | 2 toe grooves |
| tail: back / side extent | x to +0.33, z 0.03..0.37 (back); y to +0.577, z 0.09..0.48 (side) | x -0.066..0.339, y 0.072..0.523, z 0.081..0.401 | note 4 |
| tail rings | dark root, fur, dark, fur, dark tip (side view) | the same, 5 blocks + fur root | |
| satchel (front view) x, z | -0.31..-0.11, 0.15..0.36 | x -0.297..-0.124, z 0.162..0.362 | |
| satchel strap | his left shoulder to his right hip, ~0.035 wide | 0.036 × 0.011 | note 5 |
| pouch x, z | +0.19..+0.30, 0.18..0.35 | x 0.212..0.311, z 0.178..0.355 | |

## Notes
1. **The crown.** The leaf hides the top of the head in every view. Where the head's outline shows beside the leaf and
   against the ears it passes (±0.41 W, z 0.50) and (±0.23 W, z 0.65); a round dome through those points crowns at about
   0.70 W, which I modelled (0.687). The director's 0.78 W is the leaf's lower edge in the side view; with a 0.78 crown the
   dome would have to be pointed. The leaf (4 cm thick) brings the top to the sheet's height.
2. **Eye height (0.30 vs 0.40 W).** I measured the eye's centre at y 719.5 against the chin at y 810; 0.40 W above the chin
   is the top of the eye (y 689). I modelled the measured 0.30. The opening (0.19 × 0.21 W with the lid rim) is 12-16%
   smaller than the director's 0.22 × 0.25, which matches the dark outer ring of the lid (0.205 × 0.222).
3. **Arm angle.** The sheet's arms hang about 52° out. The shared brief asks for 25-30° for the rig; at 30° the paws sink
   into the round belly and the satchel, so I used 45° (`ARM_DEG`), like Kuma's compromise.
4. **The tail.** The back view and the side view disagree on its height (the back view is lower). It sweeps back 0.37 m
   past the rump and to his left, curling up, 0.17 m thick at the root and 0.30 m at its widest.
5. **Which side is the satchel on?** The brief says "over his right shoulder to his left hip" and a pouch at his right hip.
   The sheet shows the reverse in all four views: in the front view the bag is on the viewer's left (his right hip) and the
   strap rises to the viewer's right (his left shoulder); the back view and the side view (his left side, showing the pouch)
   agree. I followed the sheet: strap over his left shoulder, bag at his right hip, pouch at his left hip. Mirroring is a
   one-line change (`BAG_TH`, `POUCH_TH` and the strap's control points).
6. **The leaf's orientation.** The sheet's views disagree. The front, 3/4 and back views put the stem end at his back-left,
   raised, and the pointed tip at his front-right, draping over his right brow; the 3/4 shows the leaf broadside. The side
   view puts the stem at the front. I followed the three views. The blade's axis runs 40° from the X axis in plan, 0.45 m
   long, 0.26 m wide and 4 cm thick at the midrib. It's a stiff curved blade that clears the crown in its middle and drapes
   onto the head toward the tip. The stem end lifts off the head and the stem curls up. `LEAF_ANG` flips it if the side
   view should win.
7. **Iris bottom vs the nose top.** The shared lessons ask for the iris bottom at or above the nose top. On this sheet the
   iris bottom (0.212 W) is 0.06 W below the nose top (0.272 W), as on Kuma's. I followed the sheet.

## Round 2 (director feedback-1)
**The leaf.**
- Flatter along its length: the curvature is 0.75 /m, half of round 1's.
- Cupped across: the edges rise 25 mm above the midrib, on a shallow V (`|h|^1.3`).
- Thickness: 30 mm at the midrib, with rounded 12 mm rims.
- How it sits: it rests on the crown along the midrib (the lift is solved over the midrib only) and is tilted 0.20 forward,
  so the front view sees its top. The tip lifts off the forehead a little.
- Unchanged: the size (0.45 × 0.26 m), the direction (40° in plan, the stem end at his back-left) and the vein.
- Extent: z 0.908..1.087 m (total height 1.087, sheet 1.08).

**The head's upper sides** (a soft ellipsoid trim, `TR`, fitted by `scratch/fit_round.py`).

| z (W) | 0.06 | 0.113 | 0.20 | 0.30 | 0.364 | 0.444 | 0.497 | 0.55 | 0.60 |
|---|---|---|---|---|---|---|---|---|---|
| sheet | 0.825 | 0.93 | 0.995 | 0.98 | 0.944 | 0.877 | 0.821 | hidden | hidden |
| round 1 | 0.82 | 0.95 | 0.995 | 0.97 | 0.93 | 0.885 | 0.84 | 0.775 | 0.68 |
| round 2 | 0.82 | 0.95 | 0.995 | 0.97 | 0.93 | 0.88 | 0.825 | 0.75 | 0.645 |

- The upper sides come in by 0.005-0.035 W from z 0.44 up, while z 0.06-0.364 is unchanged. The fit predicted 0.875 / 0.82
  at z 0.444 / 0.497; the SDF scan above samples a 0.005 W grid.
- In plan, the sections at z 0.45 and 0.55 went from 1.04 to 1.01 times their ellipse (the squareness the fit measures at
  15° steps), so they're now round.
- Profile depth at z 0.543: front 0.352 -> 0.336 W, back 0.351 -> 0.333 W (sheet 0.329 / 0.326).
- Crown 0.688 W, and the outline at x 0.23 sits at z 0.657 W, both as before.

**The tail.**
- The dark tip is now only the rounded end dome (the cap starts 13° round its arc), so the fur band runs to the tip.
- The centreline is now an even circular arc: 50° of turn, bend radius 0.49 m. Round 1's sharp bend made the thick end
  fold into itself (jagged creases in the back view).
- Extent: x -0.07..0.37, y 0.07..0.54, z 0.10..0.41 m. Round 1 was x ..0.34, y ..0.53, z 0.08..0.39.

**The pouch's tuft**: smoother lobe blends (smooth-union radius 0.010 -> 0.017, the neck 0.018 -> 0.022).
