# Chiku (tk-chiku-toy): Step 0, measurements on refs/sheet.png

Measured on pixels with PIL/scipy: `measure/sil.py` (silhouette mask), `measure/body.py` (row extents per panel),
`measure/face.py` + `measure/feat.py` (head close-up rows and feature blobs), `measure/parts.py` (costume colour classes).
The sheet is 1536 x 1024.

## Anchors
- **Full-body panels**: ground line at y 521.
  - The front view's crown, between the ears, is at y 148: 373 px = 1.05 m, so **355 px/m**. The chin is at y 310 (0.594 m).
  - The front view's ear tips are at y 65 (1.284 m). The side and 3/4 views draw them at y 40 (1.355 m). The brief says
    1.30 m, so I modelled 1.30.
  - Body centres x: 218.5 (front), ~575 (3/4), 901 (side, head centre), 1252 (back).
  - The sheet's 3/4 and side views show her **right** side, so they pair with my `*_34R` / `*_sideR` renders.
- **HEAD FRONT close-up**:
  - W = 317 px (cheeks, widest at y 758-776).
  - Chin at y 842; centre x 204; crown (head top between the ears) at y 599, so the head is 0.767 W tall.
  - On the front body view the same head is W = 220 px = **0.620 m**, 0.736 W tall. I modelled 0.756 W, crown 1.054 m,
    chin 0.585 m.

## Head front (fractions of W; z = height above the chin)
| feature | sheet | model | note |
|---|---|---|---|
| widths at z 0.04 / 0.08 / 0.14 / 0.20 / 0.26 | 0.69 / 0.82 / 0.94 / 0.99 / 1.00 | 0.70 / 0.84 / 0.95 / 0.99 / 1.00 | widest 0.24-0.27 |
| widths at z 0.30-0.32 / 0.35-0.36 / 0.40 / 0.45 | 0.98 / 0.95 / 0.90 / 0.85 | 0.98 / 0.94 / 0.91 / 0.86 | bun-shaped dome (NU 1.62 → 2.3 at the crown) |
| head height (crown) | 0.767 close-up / 0.736 body | 0.756 | the mean |
| head depth (side) | 0.76 W (±0.38) | bf 0.385 / bb 0.372 | |
| eye opening centre x, z | ±0.237, 0.338 | ±0.237, 0.338 | |
| eye opening w × h | 0.194 × 0.195 | 0.194 × 0.195 | |
| iris w × h, centre | 0.132 × 0.174 (68 %), (0.206, 0.327): touches the nasal edge and the bottom | 0.68 × 0.89 eye radii, offset −0.32 / −0.11 | |
| pupil w × h, centre | 0.076 × 0.100, (0.192, 0.326) | 0.39 × 0.51 radii, 0.14 nasal of the iris | |
| catchlight | one, Ø 0.035 at (0.185, 0.379) | the same, plus a tiny lower-outer one | |
| upper lash | 0.022 W thick on top; one wing, tip at (0.361, 0.386) = (1.30, 0.52) eye radii | **separate ribbon**: 0.022-0.026 W wide on top, wing tip (1.30, 0.52), ≤ 0.0075 W proud | |
| brows | centre ±0.229, z 0.508-0.549, 0.093 wide | the same path, 0.019 W thick | |
| nose | 0.091 × 0.054, centre z 0.246 | 0.092 wide, z 0.246 | |
| mouth | x ±0.082, z 0.164-0.218 ('w' with a philtrum) | the same | |
| blush | centre ±0.353, z 0.18; core 0.10 × 0.08 | ±0.353, 0.18; 0.144 × 0.11 (soft edge) | |
| muzzle (#FFFAF4) | soft lighter area x ±0.16, z 0.08-0.30 | superellipse ±0.165, z 0.07-0.31, soft border | |
| nose tip ahead of the head centre (side view) | 0.45 W | 0.436 W | |
| lower face / muzzle ahead (z 0.10-0.15) | 0.40-0.43 W | 0.40-0.42 W | |
| face at eye level | 0.38 W | 0.381 W | |
| ears: width (front projected) | 0.34 W | 0.35 W | thick: 0.13 W deep, turned 32° outward |
| ears: centres, splay | ±0.223 at the band → ±0.255 at the top (6.6°); 0.06 W behind | base ±0.20, splay 9.4° (the front view reads 8-10°), 0.06 behind | |
| ear tips | 1.145 W (1.30 m) | 1.143 W (1.293 m) | |
| pink panel | 0.18 W wide, top 0.14 W under the tip | rim 0.075 W (0.18 wide), tip margin 0.14 | |
| bandana front band | z 0.605-0.713 | 0.605-0.713 | |
| bandana at the side (side view) | 0.51-0.66 | 0.512-0.662 | |
| bandana at the back (kerchief) | 0.40/0.41-0.69/0.70 | 0.410-0.702 | |
| knot | back centre, z ~0.40 W, Ø ~0.10 W | z 0.405 W, 0.12 × 0.14 × 0.13 W | |
| bandana ends | to ±0.17 W, z 0.20 W | to ±0.18 W (0.114 m), down to z 0.679 m = 0.15 W | |

## Body (sheet vs model, metres)
| part | sheet | model |
|---|---|---|
| total / crown / chin | 1.30 / 1.05 / 0.594 | 1.293 / 1.054 / 0.585 |
| trousers width, depth, z | 0.53, 0.383, 0.087-0.38 (top under the apron) | 0.524, 0.384, 0.087-0.44 (top under the waist tie) |
| apron bib | ±0.12-0.135, z 0.40-0.59 | ±0.118-0.136 (+rim), z 0.387-0.586 |
| apron skirt | ±0.20-0.235, z 0.18-0.40 | ±0.204-0.226 (+rim), z 0.167-0.413 |
| pocket | 0.27 × 0.17, z 0.214-0.383 | 0.263 × 0.164, z 0.216-0.380 |
| waist tie / back knot | z 0.377-0.42; knot 0.105 × 0.07 | z 0.379-0.424; knot 0.104 × 0.068 |
| sleeves | z 0.423-0.597, to x ±0.29 | z 0.404-0.626, to ±0.305 |
| hands | to x ±0.45, lowest z 0.27 (arms ~47° out) | to ±0.417, lowest 0.249 (arms 38°, Usagi's rig angle) |
| bag (front-view extent) | x −0.333..−0.16, z 0.18-0.39 | x −0.407..−0.195, z 0.186-0.394 (yaw 45°: its face reads from the front and the side) |
| bag strap | ~4 cm band | 4.0 cm × 1.5 cm rounded band |
| feet | each 0.24 wide, 0.33 long, 0.10 high | 0.242 wide, 0.328 long |
| tail | Ø 0.14-0.155, centre z 0.28-0.33 | 0.149 × 0.143, centre z 0.30 |

Notes:
1. The brief has no rough director numbers for Chiku, so there's nothing to cross-check against.
2. Arms: the sheet draws them about 47° out. I used 38°, the angle the director locked for Usagi's rig, so the hands land
   about 3 cm lower and 3 cm further in than on the sheet.
3. Bag: the sheet's front view puts it 7 cm further in, overlapping the trousers' outline. The side view puts its centre
   only 0.04 m in front of the axis. Both can't hold for a 0.09 m-thick bag on 0.53 m-wide trousers. I kept it clear of the
   hip (2 cm off the apron) and turned it 45°.
