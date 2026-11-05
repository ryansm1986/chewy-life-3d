# Mugi (design A, folk_duck_a): Step 0, the sheet measured on pixels

Source: `refs/sheet.png` (1536 x 1024), row A. Numbers from PIL colour masks, connected components and row / column
scans (`measure/m1_head.py`, `m2_feat.py`, `m4_body.py`, `rows.py`), checked on zoomed crops with pixel ticks
(`measure/zA_head.png`, `zA_front.png`, `zA_side.png`, `zA_back.png`). Model numbers: `measurements-model-a.json`.

## Scales
- Main row (front, 3/4): ground y 476. A's scalp is under the hat, so the scale comes from B (same row, same ground,
  same 1.05 m): B's dome crown (extrapolated under the tuft) y 137 -> **323 px / m**.
- Small row (side, back): ground y 757, **217 px / m** (0.672 x the main row: feet, trousers and total height agree).
- Head close-up: outline W = 179 px (cheeks, y 667-691), chin y 729.5; the features centre on x 405 (the outline on 402).

## HEAD FRONT (W = head width at the cheeks)
| Feature | Sheet | Model | Note |
|---|---|---|---|
| W | 180 px in the front view = 0.557 m | 0.557 m | |
| Chin | front view y 303 -> 0.535 m | 0.540 m | |
| Head height | under the hat (B's close-up 0.875 W, B's front view 0.79 W) | 0.85 W (crown 1.013 m) | shared base, see B |
| Half-width at z 0.02 / 0.05 / 0.08 / 0.12 / 0.17 / 0.22 / 0.27-0.37 | 0.21 / 0.32 / 0.38 / 0.43 / 0.47 / 0.49 / 0.50 | 0.235 / 0.33 / 0.385 / 0.432 / 0.47 / 0.49 / 0.497 | |
| Eye centres | x +-0.244 W, z 0.402 | +-0.244, 0.402 | |
| Eye opening | 39 x 35 px = 0.218 x 0.196 W | rim 0.214 x 0.198 | |
| Iris | ~64 % of the opening width, ~94 % of its height, centre 0.28 of the half-width toward the bill | 0.66, 0.94, 0.27 | |
| Lash line | ~0.03 W over the top; three short flicks at the outer upper corner | roll 0.027 W at the top, 3 flicks | |
| Brows | centres x +-0.237 W, z 0.631; 0.134 W long; ~0.03 W thick | +-0.237, 0.622, 0.124 long, 0.021 thick | lowered 0.009 W to clear the brim |
| Bill (front) | 0.49 W wide (half 0.246 at z 0.23-0.25); top 0.36; half-widths 0.18 @ 0.28, 0.14 @ 0.30, 0.115 @ 0.316, 0.10 @ 0.33, 0.07 @ 0.35; seam 0.168 in the middle, 0.20 at x +-0.20; bottom 0.115 | half 0.242 @ 0.26; top 0.361; 0.216 @ 0.28, 0.16 @ 0.30, 0.117 @ 0.32, 0.081 @ 0.34; bottom 0.112 | the arch is ~10 % fuller at z 0.28-0.30 |
| Bill (side) | tip ~0.18 W ahead of the face | tip 0.562 W ahead of the head centre (face ~0.41) | |
| Nostrils | x +-0.06 W, z 0.295 | painted, +-0.06, 0.296 | |
| Blush | centres x +-0.363 W, z 0.243; 0.14 x 0.128 W | +-0.36, 0.243; 0.132 x 0.116 (soft edge) | |

## Body (main front 323 px / m, small views 217 px / m)
| Feature | Sheet | Model |
|---|---|---|
| Hat | brim 0.746 m (front) / 0.64 (back) across; top z 1.105; dome 0.42 m wide at the band; band ~0.05 m; tilted back (side: front edge z 1.00, back 0.77) | brim 0.744, top 1.126, dome 0.41, band 0.052, tilt 19 deg, brim drooping 0.11 at the rim |
| Straps | 0.057 m wide, centres +-0.103 | 0.058, +-0.103 |
| Buttons | d 0.062 m, front z 0.446 (x +-0.11), back z 0.44 (x +-0.10) | d 0.062, 0.446 / 0.440, +-0.103 |
| Bib | top z 0.449, 0.31 m wide, one green front down over the belly | top 0.449, 0.31; melts into the trousers below 0.31 |
| Pocket | x +-0.124, z 0.243-0.382 | same |
| Trousers | 0.35 m wide at z 0.38, 0.42 at 0.29, 0.45 at 0.22; 0.39 m deep (side); legs split z 0.12-0.19, hems z 0.12, centres +-0.118 | 0.355 / 0.44 / 0.452; 0.39 deep; cuffs +-0.118, hem 0.119 |
| Back panel | x +-0.115, z 0.26-0.40 | x +-0.118, z 0.262-0.418 |
| Tail | white teardrop, 0.12 m wide, 0.11 tall, z ~0.27 (back) / 0.31-0.40 (side), tip up and back | 0.122 x 0.113, z 0.244-0.357 |
| Feet | 0.232 m wide, 0.286 long, 0.11 tall, centres +-0.143 | 0.228 x 0.29, centres +-0.14 |
| Arms / mittens | ~40 deg out; arm 0.118 m thick at the shoulder; hand centres +-0.31, z 0.32 | 36 deg; r 0.062 -> 0.056; span 0.726 m, hands z ~0.22-0.33 |

**Differences**: the head height is a compromise (B's close-up 0.875 W, B's front view 0.79 W; 0.85 W used for both);
arms 36 deg (the brief asks 25-30; at 30 the mittens sink into the trousers). The brief's 1.05 m to the scalp: A's crown
is at 1.013 m (the front view's chin height + the shared head), 1.126 m with the hat.
