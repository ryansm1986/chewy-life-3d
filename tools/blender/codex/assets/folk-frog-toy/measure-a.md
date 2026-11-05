# Momo, the patient gardener (folk_frog_a): Step 0, the sheet measured on pixels

Source: `refs/sheet.png` (1536 x 1024), row A. Panels segmented by `measure/seg.py`; the head close-up by `measure/m_head.py` (outline widths, colour components) and `measure/m_eye.py` (column scans through the eyes); the full-body views by `measure/m_body.py` and `measure/m_cls.py` (colour-class runs per row). Zoomed checks: `measure/z_*.png`.

## HEAD FRONT (W = head width at the jowls, 193 px; z above the chin y 767; x from the centre x 408)

| Feature | Sheet | Model | Note |
|---|---|---|---|
| Dome tops above the chin | 0.762 W at x +-0.25 | 0.758 | |
| Valley between the domes | hidden by the cap (fit: .613) | fit | |
| Half-width at z .29 / .50 / .60 / .70 | 0.500 / 0.448 / 0.430 / 0.360 | 0.481 / 0.441 / 0.428 / 0.371 | the head implicit fitted to the close-up outline, its top outline and the side profile: rms front 0.0015, top 0.0028, side 0.0023 / 0.0028 W |
| Head depth | depth .72 W at the jowls (side view, 255 px / m) | 0.722 W | |
| Eye centre | (+-0.270, 0.481) | (+-0.270, 0.481) | |
| Eye opening (w x h) | 0.246 x 0.232 | 0.240 x 0.232 | the model rim, measured on the hole |
| Iris | 0.161 W wide (~69 % of the opening), z 0.380..0.575, tucked 0.30 of the half-width toward the nose | 70 %, 0.30 | painted on the lens |
| Pupil | faint (B clearer): a deep brown oval | 46-50 %% x 60-64 %% of the iris, #33231A at 85 %% | |
| Catchlights | one big, d ~.045 W at (.44 nasal, .42 up) of the half-sizes | same + a faint low one | |
| Upper lash | ~.02 W over the top, ~.025 at the outer top, down the outer side; one short wing, tip ~(+-.418, .545) | ribbon 0.0213 W thick at the top, wing tip (1.25, .58) eye units | |
| Brows | centre (+-0.272, 0.697), 0.130 W long, ~.01 W thick, outer end drooping | same, .0124 W at the middle | painted |
| Nostrils | two dots at (+-0.058, 0.358), d 0.028 | same | painted, no nose button |
| Smile | corners x +-0.116 at z 0.267, bottom z 0.221, line ~.017 W | same | painted; 3 edge loops follow it |
| Blush | (+-0.347, 0.284), 0.140 x 0.109 | same (soft edge) | |
| Cream lower face | boundary z 0.338 at the centre (just under the nostrils), falling round the jowls to ~.16-.20 at the outline, wrapping under the chin | same table by azimuth | crisp border |

## Full body

| Feature | Sheet |
|---|---|
| Total height | 1.05 m to the dome tops (the brief) |
| Front-view scale | 366.7 px / m (sole y 530, dome tops y 145 = 1.05 m) |
| Chin (front view) | z .613 m (the close-up ratio gives .581) |
| Shirt | shoulders z .62-.66 under the head; sleeves to x +-.285 at z .51, hem z .45 |
| Straps | x +-.089..+-.165 (centre .127, .076 wide) from the shoulders to the buttons; back: centre +-.085 |
| Bib front | top z .526, half-width .167; buttons d .068 at (+-.12, .495) |
| Bib back | top z .47-.48, half-width .15, two strap-end tabs at z .50 |
| Overall pants | half-width .18 z .43, .21 z .395, .22 z .36, .233 z .30, .24 z .20-.28; crotch z .20; hems z .137, legs .23 wide at x +-.128 |
| Side depth | pants -.208..+.157 at z .37 (centre -.025 ahead of the legs) |
| Legs | z .10-.137 visible, .165 wide at x +-.127 |
| Feet | .22 wide x .28 long x .10 tall, centres x +-.145, y -.033 (side view) |
| Hands | .125 wide, centre (+-.285, .38), z .31-.47 (arms ~30 deg out) |
| Leaf cap | front: .34 W wide, z .60-.80 W above the chin, stem to .86 W; back view .27 m wide; side: a disc tilting back |

| Model | |
|---|---|
| Total height | 1.0867 m (incl. the cap stem for A) |
| W | 0.600 m (body view 0.616) |
| Head height (chin to dome tops) | 0.4550 m (body view 0.436, brief 0.440, close-up ratio 0.469) |
| Chin | z 0.5945 m |
| Width x depth | 0.709 x 0.433 m |
| Hand clearance from the body side | 0.026 m |
| Triangles | 20372 |

## Differences from the brief and the sheet

- **Head size**: the sheet disagrees with itself (the close-up is taller per W than the body views). I kept the close-up's shape exactly (the face blueprint) and set W 0.600 m, between the two: W is 2.6 % under the body view, the head height 3.4 % over the brief.
- So the chin sits ~2-4 cm lower than in the body views; the neckline pieces (shirt top, neckerchief, collar) moved down with it.
- Heads: 2.31 heads to the dome tops (the notes say ~2.4; the drawing is ~2.3-2.4).
