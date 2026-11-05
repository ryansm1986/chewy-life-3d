# Kinako (design B, folk_cat_b): Step 0, the sheet measured on pixels

Source: `refs/sheet.png` (1536 x 1024), row B. PIL colour masks, connected components and row/column scans
(`measure/m1_head.py B`, `m2_feat.py B`, `m4_body.py`, `m5_cls.py` with the blue / teal / yellow classes), checked on
zoomed crops (`measure/grid_B_*.png`, `zB_eyeR.png`, `zB_mouth.png`, `zB_legs.png`, `zB_chest.png`).

## HEAD FRONT panel (W = head width at the cheeks, ears and band excluded)
- Outline (`measure/mask_head_B.png`): widest at y 581-587, x 1128..1464, so **W = 337 px**; features centre on x 1300.
- Crown (centre column, between the ears above the band) y 433; chin y 660 (the muzzle's lower edge).

| Feature | Sheet | Model | Note |
|---|---|---|---|
| Head height, crown to chin | 0.674 W (broader and flatter than A's 0.712) | 0.674 | |
| Half-width at z 0.021 / 0.056 / 0.092 / 0.145 / 0.225 / 0.288 | 0.329 / 0.408 / 0.448 / 0.482 / 0.499 / 0.491 | 0.311 / 0.412 / 0.460 / 0.491 / 0.499 / 0.497 | rms 0.009 W |
| Head depth (side view, no nose) | ~0.78-0.82 W | 0.86 incl. the nose (0.059 W proud) | |
| Ear tips | x -0.30 / +0.28 W (mean 0.29), 0.11 W above the crown | ±0.289, 0.110 W above the crown (round 2 wedge ears) | ears rise from behind / above the band |
| Ear base | inner notch x ±0.10 W; the outer edges go down behind the band | traced wedge outline, roots tucked under the band | |
| Eye centres | x ±0.197 W, z 0.282 W | ±0.197, 0.282 | |
| Eye opening | 69 x 56 px = 0.205 x 0.166 W | 0.205 x 0.166 | |
| Iris | 42 x 54 px: 61 % of the opening's width, ~ the full height; centre 0.30 of the half-width toward the nose | 0.62, 0.98, 0.30 | |
| Pupil | 20 x 39 px: 47 % x 72 % of the iris | same | |
| Catchlight | one, 0.033 x 0.042 W at (+0.53 nasal, +0.52 up) | same + a tiny faint low one | |
| Upper lash line | top z 0.392 W, one wing flick, tip (±0.326, 0.347) | wing tip (1.27, 0.78) eye units | |
| Brows | centres x ±0.199 W, z 0.455 W; 0.089 x 0.045 W, just under the band | same | |
| Nose | 0.074 W wide x 0.042 W tall, top z 0.249, tip z 0.208 | painted | |
| Mouth | corners x ±0.079 W, z 0.175; dips to z 0.142 at x ±0.047; centre join z 0.160 | painted | |
| Blush | centres x ±0.304 W, z 0.172; ~0.11 x 0.065 W | ±0.304, 0.172 | |
| Muzzle (cream #FFF4EA) | a bell from the nose bridge (z 0.265, half-width 0.053 at z 0.252) widening to half 0.233 at z 0.089, its lower edge at the chin; half-widths 0.08 / 0.122 / 0.166 / 0.202 / 0.223 / 0.233 at z 0.237 / 0.208 / 0.178 / 0.148 / 0.119 / 0.089 | the same polygon, painted, carried under the chin | |
| Bandana (head panel) | centre column y 441..487 (0.137 W tall), its ends curving down to y ~490-538 at the outline (the ring tilts back) | see below | |

## Full body (FRONT, SIDE, BACK): ground y 651, ear tips (front) y 393 -> 1.05 m = **245.7 px / m**
Front centre x 214.5, side body centre x 682, back centre x 947.

| Feature | Sheet | Model |
|---|---|---|
| Total height (ear tips) | 1.05 m (the notes) | 1.049 |
| Crown / chin | 0.976 / 0.529 m | 0.976 / 0.529 |
| W | 163 px = 0.663 m (the widest head of the three) | 0.663 |
| Bandana | front: top z 0.956, bottom 0.863 m (0.093 m tall), centre 0.91; back centre ~0.80 m (side view: ~11.5 deg tilt); ~0.025 m thick | 0.910 / 0.800, 0.092 tall, 0.0135 m proud (round 2) |
| Knot | back centre z ~0.81, ~0.09 m wide, standing ~0.035 m off the band | 0.092 x 0.08 x 0.06 |
| Tabs | two broad rounded leaves, ~0.14 m long, ~0.09-0.11 m wide, tips at z ~0.65 and x ±0.08 m, close to the head | 0.11 wide, tips z ~0.65, x ±0.10 |
| Wrap top | the V of fur at the neck (V point z 0.472, 0.12 m wide at z 0.505); her left panel's edge runs from the neck's left down across to her right hip under the sash | the same, collar bands as rounded strips |
| Sleeves | z 0.34-0.50 m, outer edge ±0.326 m | opening ±0.324 |
| Sash (teal) | z 0.236-0.326 m (0.09 m tall), 0.48 m wide in front, side depth ±0.224, continuous round the back | 0.236-0.326, ±0.246 x ±0.225 |
| Top below the sash | flares to 0.52 m wide at the hem z 0.159 | hem 0.157, ±0.266 |
| Legs | very short: visible z 0.094-0.159, 0.187 m wide each, centres ±0.13 | r 0.092 at ±0.13 |
| Feet | 0.216 m wide, 0.094 m tall, centres ±0.147 | 0.216 x 0.25 x 0.094 |
| Paws | ~0.12-0.13 m, centres ±0.344 m, z 0.309 (arms ~49 deg out: her wide pear body) | centres ±0.335, z 0.27; arms 38 deg out |
| Tail (side) | from under the hem's back, dipping to ~0.106 (outline), rear-most +0.42 at z 0.31, the top of the hook z 0.40 (outline), the cream tip ~0.1 m long wrapping the whole end | path from these points; cream from 75.5 % of its length |
| Tail (back) | the tip ~0.03 m to her right, the low bend ~0.07 m to her left | tip -0.02, bend +0.066 |

**Arms**: at 30 deg the paws sink into her wide sash and hem; 38 deg with the shoulders at ±0.19 m keeps ~3.7 cm clear.
**Differences from the brief's notes**: 2.2 heads, not 2.4 (the drawing). One catchlight on the sheet; I kept a tiny
faint second one.
