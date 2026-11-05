# Folk bunny B (Momo, the baker's helper): Step 0, measurements on refs/sheet.png

Same tools as `measure-a.md` (`measure/*.py`). The sheet is 1536 x 1024.

## Anchors
- **Upper-row front view**: ground y 545, centre x 648.5, the same 327.6 px/m as A (the two rows share the ground line, and
  B's eyes, nose and mouth sit within 4 px of A's: eyes y 278.5 vs 281.5, chin y 352 vs 355).
  Beret nub top y 145 = **1.221 m**; chin 0.589 m.
- **Head W**: the face's sides are hidden by the lop ears in every view. The visible face between the ears' inner edges is
  165 px at z 0.16 W (A's full width there: 190 px). With the ears covering ~12 px a side, the face is about as wide as A's;
  the brief asks for the broadest cheeks, so I took **W = 0.615 m** (+2 % on A) and a fuller jaw (exponent 2.85 vs 2.55).
- **Head close-up**: chin y 817, centre x 918; its eye spacing (72 px) against the body view's (78.6 px) gives the close-up's
  W = 184.6 px.
- Lower row: side 226 px/m (ground 859, nub 583), back 224 px/m.

## Head front (fractions of W)
| feature | sheet | model | note |
|---|---|---|---|
| head height (crown, under the beret) | hidden; A's family | 0.751 W (crown 1.051 m) | |
| eye opening centre x, z | +-0.195, 0.366 (close-up) / 0.365 (body) | +-0.195, 0.366 | |
| eye opening w x h | 0.216 x 0.184 incl. flicks -> ~0.180 x 0.175 | 0.180 x 0.175 | |
| brows | inner (0.163, 0.58) to outer (0.258, 0.55); body view z 0.546 | the same path | |
| nose | 0.081 W wide, z 0.271 (close-up) / 0.278 (body) | 0.082, z 0.275 | |
| mouth | 0.152 W, z 0.173-0.211 | 0.152, z 0.174-0.214 | |
| blush | (+-0.27, 0.21), 0.14 W | (+-0.272, 0.21) | |
| beret: band lower edge front / sides / back | 0.64 (front view) - 0.71 (side view) / 0.46 / 0.42 (side view) | ~0.69 / ~0.53 / ~0.49 (axis tipped 15 deg back, 4.5 deg to her right) | the band is laid on the skull |
| beret width | 0.94 W (body) / 0.90 (close-up) | 0.92 W (dome radius 0.462) | |
| beret dome top / nub top | 0.93 / 1.03 W | 0.90 / 0.99 W | |
| beret tilt | left side 17 px lower (5 deg) | 4.5 deg | |
| ears: outer edges | +-0.66 W at the chin line | +-0.707 W | +7 %: the fat lop section |
| ears: inner edges | +-0.41 W at z 0.16 | ~+-0.42 | |
| ear tips | 0.13 W below the chin | 0.10 W below | |
| ear section | ~0.29 W across (front), wide fore-aft (side) | 0.29 x 0.30 W, rounded tip | |

## Body (sheet vs model, metres)
| part | sheet | model |
|---|---|---|
| total / crown / chin | 1.221 / ~1.05 / 0.589 | 1.200 / 1.051 / 0.589 |
| smock hem | +-0.293 at z 0.128 | +-0.291, rolled under to z 0.11 |
| sleeves | z 0.43-0.52 (top 0.57), to +-0.293 | z 0.38-0.58, to +-0.27 |
| apron bib band | z 0.406-0.479, +-0.198 | z 0.393-0.488, +-0.20 |
| apron skirt | z 0.177-0.406, +-0.19-0.215, rounded bottom corners | z 0.169-0.419, +-0.192-0.22, 0.045 corner radius |
| pocket (U) | 0.253 x 0.137, z 0.229-0.366 | 0.252 x 0.137, z 0.229-0.366 |
| straps | 0.07 wide at x +-0.113 | 0.070 at +-0.113 |
| rear fastening panel | z ~0.37-0.48, ~0.37 wide | z 0.361-0.493, 0.39 wide, plus a waist band all round at z 0.41-0.45 |
| feet | each 0.253 wide, 0.12 visible | 0.248 wide, 0.12 visible below the hem |
| tail | ~0.15 across, z ~0.22 | 0.150 x 0.145, centre z 0.225 |

Notes:
1. The beret's measured front edge differs between the front (0.64 W) and side (0.71 W) views; the tilted band sits between.
2. The brief's "beret adds ~0.12 m" measures 0.17 m on the sheet (1.221 - 1.05); the model gives 0.15 m.
