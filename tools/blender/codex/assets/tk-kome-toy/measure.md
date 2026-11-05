# Kome (tk-kome-toy): Step 0, the sheet measured on pixels

Source: `refs/sheet.png` (1536 x 1024). Every number comes from PIL colour masks, connected components and row/column
scans (`measure/m1_head.py` .. `m6_front.py`, `scratch/headfit.py`), not by eye. Zoomed crops with pixel ticks:
`measure/eyeR_x6.png`, `measure/mouth_x8.png`, `measure/grid_side.png`, `measure/grid_back.png`, `measure/crop_front_body.png`.

## HEAD FRONT panel (W = head width at the cheeks, ears and band excluded)
- Outline (mask `measure/mask_headfront.png`): widest at sheet y 761-765, x 34..389, so **W = 356 px**, centre x 211.5.
  The feature pairs (irises, brows, blush) all centre on x 211.2-211.5, so the face is not turned.
- **Chin**: hidden behind the collar. A superellipse fitted to the lower outline (8 rows, y 781-841, residual < 0.008)
  puts it at y 851; I use y 850. Crown (centre column, top of the cream above the band) y 581.
- z = height above the chin, x = lateral (the viewer's right = her LEFT = Blender +X), both in W.

| Feature | Sheet (mine) | Model (round 1) | Note |
|---|---|---|---|
| Head height, crown to chin | 0.756 W | 0.756 | |
| Widest | z 0.24 W | 0.24 | |
| Half-width at z 0.025 / 0.07 / 0.138 / 0.205 / 0.306 / 0.407 | 0.278 / 0.398 / 0.468 / 0.496 / 0.492 / 0.465 | 0.277 / 0.397 / 0.473 / 0.498 / 0.495 / 0.470 | (scratch/headfit.py) |
| Head depth (side view, no nose) | 0.81 W at the eyes, 0.86 W at the mouth zone | 0.81 / 0.86 | the mouth zone stands 0.04 W ahead of the eyes |
| Eye centres | x ±0.218 W, z 0.324 W | ±0.218, 0.324 | inside the lash: white + iris + pupil, holes filled |
| Eye opening | 0.198 W wide x 0.176 W tall (mask 0.185-0.194 x 0.171-0.174; the shaded white at the outer edge is missed by the mask, the 6x crop gives 0.20 x 0.18) | 0.198 x 0.176 (rim) |
| Iris | 0.140 W wide (71 % of the opening) x 0.171 W (97 %), tucked to the nose: centre x ±0.194 (0.24 of the half-width nasal) | 0.141 x 0.168 (render mask), centre ±0.193 |
| Pupil | 0.084 x 0.112 W (60 % x 66 % of the iris; from the 6x crop, the mask merges the dark iris rim) | | |
| Catchlights | big d 0.034 W at (+0.023 nasal, +0.043 up) of the iris centre; small d 0.017 W at (-0.018 outer, -0.028 down) | | |
| Upper lash line | top z 0.445 W; 0.028-0.031 W thick over the top, 0.039 W at the outer upper corner; runs down the outer side to z ~0.275 (0.55 of the half-height below the centre); two small flicks at the outer top, tips at (±0.341, 0.407) and (±0.360, 0.385) | | built as its own ribbon object |
| Brows | centres x ±0.208 W, z 0.507 W; 0.087 W long x 0.037 W tall (with the arc); soft arcs | ±0.208, 0.498-0.527, 0.088 x 0.030 (render) |
| Nose | rounded inverted triangle 0.079 W wide (top) x 0.046 W tall, top z 0.283, tip z 0.237, centre z 0.262; side view: ~0.035 W proud | | |
| Mouth ("w") | 0.170 W wide (corners x ±0.085, z 0.205), the arcs dip to z 0.180 at x ±0.043; the line up to the nose from z 0.208 to 0.237; line ~0.007 W thick | | painted at 0.011 W (0.007 W disappears at game distance) |
| Blush | centres x ±0.313 W, z 0.208 W; 0.117 x 0.087 W (soft edge) | | |
| Ear tips | x -0.331 / +0.361 W (mean ±0.346), z 0.871 W (0.115 W above the crown) | ±0.333, 0.123 W above the crown |
| Ear base | inner corner (±0.13, z 0.745); the outer edge runs down onto the head outline to the band at z ~0.58 (±0.45) | | |
| Inner ear (pink) | her left ear: centre (0.356, 0.699), 0.132 x 0.152 W | | |
| Headband | centre column: z 0.598-0.705 W (0.107 W tall); at x ±0.39: 0.525-0.615; at ±0.445: 0.494-0.562; its ends stand ~0.02-0.03 W proud of the outline at z 0.45-0.48 | | |

**Differences from the brief**: the brief gives no face numbers, only colours; nothing to cross-check beyond them.

### The calico patch (W, orange mask, `measure/m4_patch.py`)
- Her LEFT side (the viewer's right), as the brief says (use the front view).
- Inner border (below the band) runs down the bridge: x 0.069 at z 0.573, 0.044 at 0.506, 0.037-0.038 at z 0.44-0.47,
  0.049 at 0.371, 0.081 at 0.320, 0.097 at 0.303, then it meets the eye's inner lower corner.
- The eye's top, outer and inner sides are on orange; its lower rim is the border (under the eye is cream). The border
  leaves the eye at its outer lower corner and runs down to the jaw: (0.322, 0.270), (0.344, 0.250), (0.367, 0.230),
  (0.389, 0.205), (0.412, 0.194), (0.434, 0.188), (0.456, 0.194), (0.479, 0.222), then the outline.
- Above the band the crown is orange from x 0.077 outward, up to and including her left ear. The side view shows the
  patch reaching back to about the head's mid-depth (y ~0.015 W behind the centre) and, above the band, back past the
  ear; the back view shows only a little orange by her left ear's base.
- **Back patch (back view)**: on the nape, inside the kimono's scooped back neckline: x ±0.10 m, z 0.447-0.516 m, a
  rounded lens with its lower edge on the neckline; the neckline runs from the shoulders (±0.155 m, z 0.52) down to
  z 0.447 at the centre.
- **Ears**: both orange outside, pink inside (front, side and back views agree with the brief).

## Full body (FRONT, SIDE, BACK views): ground line y 508 (sheet), ear tips (front) y 63 -> 1.03 m = **432 px / m**
(The side view's ear reaches y 50 = 1.06 m; the drawn side ear leans forward. The obi, hem and feet heights agree
between the front and side views within 1-2 %, so all three views share the scale.)

| Feature | Sheet | Modelled (target) |
|---|---|---|
| Total height (ear tips) | 1.03 m (the sheet's note; front view 445 px) | 1.03 m |
| Crown | 0.962 m (front view band edges 0.866-0.930 m, matched to the head panel's band) | 0.962 |
| Chin | 0.505 m (from the head panel's fitted chin) | 0.505 |
| W | 262 px = 0.606 m (front view at z 0.64-0.66) | 0.606 |
| Head : body | head (chin-crown) 0.458 m; 2.1 heads to the crown, 2.25 to the ear tips (the sheet's note says 2.4) | same |
| Head centre (side) | face front y -0.225 m, back +0.278 m about the body centre: head centre y +0.027 m | HY 0.027 |
| Headband (side, back) | centre line z 0.89-0.90 m at the front, 0.774-0.79 m at the back: tilted ~13 deg (front higher); 0.065 m tall, ~0.016 m proud; back: a small flat tab 0.058 m wide x ~0.085 m tall at the centre | 0.900 / 0.782 m, 0.065 x 0.0165 m |
| Kimono chest | front y -0.167, back +0.169 at z 0.45; collar V point z 0.447 m (white under-collar at the neck, pink lapel edge below, her left panel over) | |
| Sleeves | outer edge ±0.33 m, lower edge z 0.27 m (front and back), ~0.17 m deep in the side view | |
| Obi | white, z 0.302-0.377 m (front; side 0.308-0.389), width ±0.18 m, depth 0.37 m; two layers with a crease at z 0.342; **no back knot** (back view) | z 0.294-0.392, ±0.186 x ±0.191 |
| Apron | cream, from under the obi (z 0.30) to z 0.117 m; 0.33 m wide at the top, 0.37 m at the bottom, rounded lower corners; stands a little off the skirt in the side view | top hidden at 0.322, hem 0.117, ±0.163..0.184, corner r 0.046, 0.011 thick |
| Skirt | plum, from the obi to the hem at z 0.088 m; hem width 0.54 m (front), depth 0.42 m (side) | hem 0.088, ±0.263 x ±0.210 |
| Paws | 0.134 m wide x 0.14 m tall mittens, centres x ±0.317 m, z 0.308 m (arms ~49 deg out) | 0.126 x 0.138, arms 32 deg out (the brief's A-pose) |
| Feet | 0.157-0.168 m wide, ~0.20 m long, ~0.075 m tall, centres x ±0.132 m; two toe lines | 0.148 x 0.188 x 0.078, centres ±0.129 |
| Rice paddle | at her right hip (the viewer's left): bowl centre x -0.149 m, z 0.384, 0.086 x 0.116 m; handle ~0.035 m wide down to z 0.185 at x -0.20 (leans ~13 deg, bottom out); a white cord at the obi's lower edge | bowl 0.086 x 0.116 x 0.025, handle 0.035 x 0.023, yawed 28 deg to sit on the body's front corner |
| Tail (side) | root at the skirt's back (y 0.215 m, z 0.25), dips to z ~0.14 (centre line) at 0.27 m behind, rises in an S to a big round club (d ~0.16 m) centred ~(0.33 m behind, z 0.30), its top at z ~0.37; ~0.085-0.10 m thick | path from these points; root 0.092, dip 0.084, club 0.160 m |
| Tail (back) | the club ~0.065 m to her right of the spine, the dip near the centre | club centre x -0.06 |

**Arms**: on the sheet the arms are about 49 deg out; the shared brief asks for a 25-30 deg A-pose. I used 32 deg: at
30 deg the paws touch the wide skirt (clearance in `measurements-model.json`, `paw_clear_skirt_*`).

**The tail's colours (a conflict, flagged)**: the brief says "the tail orange with a cream tip". On the sheet the side
view shows the root and the dip **cream** and the rising part and the club **orange**; the back view agrees once its
geometry is read with the side view (the orange club sits high, overlapping the root, the cream dip shows below it).
So the sheet's tail is cream at the root with an orange club. I followed the sheet; it is one line to swap
(`paint('tail')`) if the director prefers the brief's reading.
