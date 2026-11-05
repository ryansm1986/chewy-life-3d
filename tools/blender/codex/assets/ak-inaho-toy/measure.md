# Inaho (ak-inaho-toy): Step 0, measurements on refs/sheet.png

Measured on pixels with PIL/scipy: `measure/sil.py` (silhouette mask), `measure/body.py` (row extents per panel),
`measure/face.py` + `measure/feat.py` (head close-up rows and feature blobs), `measure/parts.py` (costume colour classes).
The sheet is 1536 x 1024. The model's own numbers come from `measurements.json` (written by every build).

## Anchors
- **Full-body panels**: ground line at y 471.
  - The front view's ear tips are at y 67: 404 px = 1.35 m (the sheet's note), so **299 px/m**. The note's 1.05 m (excluding
    the ears and the hat) puts the hidden skull crown at y 157.
  - The chin is at y 305 (front) / 302 (side): **0.56 m**.
  - Body centres x: 267.5 (front), ~590 (3/4), 888 (side, body axis), 1205.5 (back).
  - The sheet's side and 3/4 views face the viewer's left (her left side), so they pair with my `*_side` / `*_34` renders.
- **HEAD FRONT close-up**: W = 257 px (cheeks, widest at y 746-764), chin y 815, face centre x 202 (the eyes, the nose and
  the mouth sit 0.014 W right of the silhouette's centre 198.5).
- On the body front view the same head is 187 px = **W 0.625 m**.

## Head front (fractions of W; z = height above the chin)
| feature | sheet | model | note |
|---|---|---|---|
| widths at z 0.04 / 0.08 / 0.14 / 0.20 / 0.26 | 0.72 / 0.87 / 0.95 / 0.99 / 1.00 | 0.72 / 0.86 / 0.96 / 0.99 / 1.00 | fuller jaw than Chiku's (nl 2.70) |
| head height (crown, under the hat) | 0.79 (1.05 m note) | 0.757 (1.034 m) | hidden by the hat; kept low so the crown clears the hat |
| head depth, nose tip to the back (side) | 0.93 W | 0.89 W (nose 0.43 ahead of the centre, back 0.44 behind) | deeper than Chiku (0.82) |
| face ahead of the nose tip at eye level (side) | 0.088 W behind the tip | 0.052-0.061 behind | |
| eye opening centre x, z | +-0.2185, 0.371 | +-0.2185, 0.371 | |
| eye opening w x h | 0.187 x 0.167 | 0.187 x 0.167 | |
| iris w x h, centre | 0.123 x 0.148 (66 %), (0.186, 0.366): touches the nasal edge | 0.66 x 0.89 eye radii, offset -0.35 / -0.07 | deep, near-even brown, the pupil barely shows |
| catchlight | one, 0.029 across at (0.160, 0.400) | one at (0.60, 0.36) eye radii, 0.031 W across; a faint tiny second one | |
| upper lash | ~0.025 W thick on top; a thick wing, tip at (0.350, 0.425) = (1.42, 0.65) eye radii | separate roll, 1.35x Chiku's width, wing tip (1.42, 0.65) | |
| brows | inner (0.144, 0.556), peak (0.212, 0.586), outer (0.276, 0.552), ~0.021 thick | the same path, 0.021 W at the peak | |
| nose | 0.115 x 0.065, z 0.255-0.320 (centre 0.287), a rounded inverted triangle | 0.112 x 0.064, z 0.287 | |
| mouth | corners +-0.091 at z 0.212, lobes' bottoms +-0.043 at 0.183, centre 0.204; philtrum to 0.250 | the same | |
| blush | centres +-0.318, z 0.23; 0.14 x 0.113 | +-0.318, 0.23; 0.14 x 0.114 (soft edge) | |
| muzzle (lighter oval) | x +-0.19, z 0.075-0.325 | superellipse +-0.19, z 0.075-0.325, a 3 mm border | |
| ears: width (front) | 0.343 W | 0.343 W (hw 0.172) | thick paddles turned 12 deg out |
| ears: centres, splay | +-0.205 at z 0.93, +-0.223 at z 1.05 (8.5 deg) | base +-0.143 at z 0.52, splay 8.5 deg, 0.095 W behind the centre | |
| ear tips | 1.28 W (close-up), 1.264 W (1.35 m body) | 1.272 W (1.355 m) | |
| pink panel | 0.16 W wide (0.09 rim), top 0.14 W under the tip | rim 0.090, tip margin 0.14 | |

## The straw hat (W above the chin, y from the head centre)
The sheet's views disagree on the hat's tilt: the side view draws it tipped back about 17 deg (rim front 0.60-0.64, back
0.21), the back view puts the back rim at 0.30, and the front view draws the band nearly level (as if seen from a little
above). I took the side view's tilt, softened to 16 deg, with the back rim between the two readings.
| feature | sheet | model |
|---|---|---|
| brim diameter | 1.28-1.31 W (0.80-0.82 m) | 1.30 W (0.812 m) |
| rim front / side / back height | 0.61-0.64 / 0.45 / 0.21-0.30 | 0.643 / 0.464 / 0.285 |
| brim front ahead of the head centre (side) | 0.52 W | 0.528 W |
| tilt back | ~17 deg (side) | 16 deg |
| brim fall from the crown to the rim | ~32 deg (front and side) | 36 deg at the root easing to 27 deg; a rolled rim 0.060 W thick, brim 0.044 W |
| crown base ring (the band's lower edge) | r 0.39-0.40 W, front 0.71, back 0.47 | r 0.40, front 0.73, back 0.51 |
| band height | 0.09 W (front 0.72-0.81) | 0.08 W |
| crown top | 0.87-0.90 W | 0.900 W |
| ears through the crown | from its top, toward the back | the same; a painted contact shade round each |

## Body (sheet vs model, metres)
| part | sheet | model |
|---|---|---|
| total / crown / chin | 1.35 / 1.05 / 0.56 | 1.355 / 1.034 (skull, under the hat; hat top 1.144) / 0.56 |
| shorts width, depth, z | +-0.25 (z 0.25-0.27), 0.42 deep (-0.227..+0.197), z 0.11-0.39 | 0.509 wide, 0.419 deep (-0.222..+0.198), z 0.112-0.426 (waist under the waistband) |
| cuffs | rolled bands z 0.11-0.17, each leg 0.214 wide | z 0.113-0.167 |
| leg split | up to z 0.17 | up to ~0.16 |
| bib | top z 0.463, +-0.157 at the top | z 0.344-0.471, +-0.157-0.166 (+rim) |
| buttons | gold, 6-7 cm, at (+-0.115, 0.44) | 6.2 cm, at (+-0.115, 0.44-0.46) |
| straps | 6.3 cm wide; front x +-0.115, back x +-0.097 to the waist (z 0.37) | 6.2 x 1.5 cm rounded bands, the same path |
| pocket | x -0.117..0.134 (0.25), z 0.237-0.388 | 0.249 x 0.152, z 0.236-0.388, with a flap seam and a centre stitch |
| sleeves | to z ~0.40, x +-0.29 | z 0.379-0.601, to +-0.305 |
| hands | to x +-0.41, lowest z 0.27 | to +-0.417, lowest 0.224 (arms 38 deg, the rig angle) |
| feet | each 0.26 wide, 0.33 long, 0.10 high | 0.257 wide, 0.328 long |
| tail | 0.16 across, centre z 0.26 | 0.161 x 0.157, centre z 0.262 |

## Colours
The brief's data colours match the sheet's labels; the sheet's painted swatches differ for the fur (#E9C6A7 against the
label #E8D0B8) and the shirt (#F7E2C0 against #F4E8D0). The labels read grey-taupe next to the sheet in my renders, so I
used colours between the two: fur #E9C8AA, shirt #F6E5C8 (one hue each, shaded by value only). The straps and the band are
#56683A, a little lighter than #4A5A2A (dark cloth goes near-black in the game's grade). The rest are the brief's colours.

## Notes
1. The brief has no director's rough numbers for Inaho, so there's nothing to cross-check against.
2. Arms: the sheet draws them about 45 deg out; I used 38 deg, the rig angle locked for Usagi and Chiku, so the hands land
   about 5 cm lower than on the sheet.
3. The crown under the hat is 0.757 W, not 0.79 W: it's hidden, and the lower skull leaves the hat's crown clear (the
   build's conform check pushes the crown out wherever the skull would come within 0.034 W; it found nothing to push).
