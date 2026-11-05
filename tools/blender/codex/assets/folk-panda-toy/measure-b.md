# Design B (Momo, `folk_panda_b`): Step 0, the sheet measured on pixels, and the model against it (round 1)

Source: `refs/sheet.png`, row B (x 511-1023). The same scripts as A (`measure/m1.py b`, `m2.py b|bf`, `m3.py b|bf`,
`m4.py b`, `m5.py b`, `classes.py` -> `class_b.png`); see `measure-a.md` for the method and its note 1 (the close-up's
head is drawn 10% taller than the turnaround's, so its vertical layout is used x 0.93). The model column comes from
`measurements-model-b.json` and `preview/b/cmp-*.png` (`make_compare.py b`).

**Anchors**
- **Turnaround front**: ground y 487, the sheet's common scale 332.4 px / m (A's ear tops = 1.05 m). B is drawn at the
  same scale as A: her chin is at y 310 (A 309), her head 205 px wide (A 203). Her smaller, lower ears put her ear tops at
  y 155 (1.0 m) and the beret's nub at y 120 (1.105 m). I kept the sheet's relative scale (the two side by side), so B's
  ear tops are 0.99 m, not 1.05 m (note 1).
- **Head close-up**: W = 191.1 px, midline x 913.5, chin y 741. The beret hides the crown; the patch on her right was
  merged with its surroundings by the classifier, so the face numbers are her left side's (A's two sides agree to 0.005 W).

## Face (head close-up, z x 0.93)
| Feature | Sheet | Model | Note |
|---|---|---|---|
| Head height, crown to chin | hidden by the beret (the turnaround's top at x +-0.2 W: 0.83 under the band) | 0.756 W (A's family crown) | |
| Front widths at z 0.06 / 0.10 / 0.20 / 0.30 / 0.40 / 0.50 / 0.60 / 0.65 | 0.74 / 0.86 / 0.97 / 1.00 / 0.96 / 0.885 / 0.74 / 0.65 (close-up, fuller low than A) | 0.745 / 0.845 / 0.97 / 1.00 / 0.96 / 0.885 / 0.74 / 0.64 | the fullest cheeks; the top tapers more than A's |
| Side: the muzzle 0.45 W ahead at z 0.30 | 0.40-0.45 (side view) | 0.453 | B's cheeks 0.012 W fuller front and back |
| Eye opening | centre (+-0.185, 0.354); 0.153 x 0.167 W | (+-0.185, 0.354); 0.158 x 0.172 W | shared eye with A |
| Iris / pupil / catchlights | 0.106 x 0.142 W, nasal; one catchlight up and toward the nose | as A | |
| Eye patch | x 0.091..0.391, z 0.222..0.513; long axis falling outward 50 deg; "short broad" | her measured outline (smoothed), 1.6 mm borders | 0.012 W shorter than A's |
| Brows | x 0.140..0.256, z 0.541..0.591 | A's arc (x 0.138..0.234, z 0.574..0.598) | within 0.01-0.02 W; shared |
| Nose | x +-0.048, z 0.266..0.320 | 0.091 x 0.061 W, z 0.268..0.329 | shared |
| Mouth | +-0.077, corners z 0.214, bottom 0.192 | +-0.078, corners 0.242, bottom 0.204 | A's (B's sits 0.01-0.025 W lower; see note 3) |
| Blush | centre (+-0.333, 0.175), 0.15 x 0.11 W | (+-0.336, 0.174) | |
| Ears (circle fit) | close-up c (+-0.372, 0.670), r 0.127; turnaround c (+-0.36, 0.619), r 0.125 | c (+-0.365, 0.628), r 0.126, 0.112 W thick; top 0.989 m, outer x 0.491 W | smaller round ears, lower and wider apart than A's |
| Beret | the turnaround: the dome 0.52 W wide at z 0.77-0.79 W, a short band under it, the nub to 0.93 W; the close-up ~0.56 W wide | dome 0.556 W wide (centre 0.772, 0.18 W tall), band r 0.232 W at z 0.672-0.752, nub ball 0.092 W at 0.880; top 0.923 W (1.091 m) | `PandaB_acc`; x +-0.278 W |

## Body (turnaround front, metres)
| Feature | Sheet | Model |
|---|---|---|
| Total height (ear tops / beret nub) | 1.00 / 1.105 | 0.989 / 1.091 |
| Chin | 0.533 | 0.532 |
| Tunic barrel half-width z 0.15-0.25 | 0.27 (the widest belly and hips) | 0.267 (body width with the apron 0.533) |
| Tunic bottom / dark legs from | z 0.13 | 0.114 at the middle, ~0.12 over the legs; dark from 0.12 |
| Sleeves | out to +-0.31 at z 0.44 | ~+-0.31 |
| Arms | outer +-0.375 at z 0.30 | span 0.767 (+-0.383) |
| Apron band (all round, a back buckle) | z ~0.375-0.41 | z 0.376-0.414, 14 mm proud; buckle 0.062 x 0.05 |
| Apron bib | top z 0.45, +-0.13 | top 0.451, +-0.133 at the top |
| Apron skirt | z 0.135-0.40, +-0.255, following the belly, rounded bottom corners | z 0.139-0.39, +-0.256, draped off the belly (no tuck), corner r 0.06 |
| Pocket | x +-0.125, z 0.20-0.33, rounded U bottom | +-0.125, z 0.201-0.330 |
| Straps | +-0.09..0.155 at z 0.49 (front); straight down the back at ~+-0.14 | 0.054 wide, centres +-0.118 at the bib corners, +-0.136 down the back |
| Legs / feet | each 0.19 wide, centres +-0.11, z 0-0.13 | r 0.088, centres +-0.111; feet 0.186 x 0.23 |
| Tail | round, cream | 0.128 across, z 0.212 |

## Notes
1. **Scale**: the notes give 1.05 m for both, but the sheet draws B at A's scale with smaller ears, so her ear tops stand
   5% lower. I kept the sheet (the two read as one family side by side, `preview/family.png`). Scaling B up to 1.05 m ear
   tops would make her head 6% bigger than A's; one line in the build (CHIN, W) if the director prefers it.
2. **The head's upper widths** above z 0.5 are hidden by the ears and the beret on the sheet; B's taper (0.885 at z 0.50,
   0.74 at 0.60) is the close-up's left outline; A's flatter top was kept for A only.
3. **The face is shared with A** (eyes, brows, nose, mouth, blush; the patches are each design's own outline): B's
   measured features differ from A's by <= 0.01 W except the mouth, which the close-up draws 0.02 W lower; with the beret
   and the fuller cheeks the shared mouth read better in the portrait. Easy to split if wanted.
4. As A: the lash roll is added (the sheet has none on the dark patch), the arms hang at 40 deg (span +2%).
