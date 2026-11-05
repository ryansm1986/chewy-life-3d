# Pip, the daydreaming schoolkid (folk_frog_c): Step 0, the sheet measured on pixels

Source: `refs/sheet.png` (1536 x 1024), row C. Panels segmented by `measure/seg.py`; the head close-up by `measure/m_head.py` (outline widths, colour components) and `measure/m_eye.py` (column scans through the eyes); the full-body views by `measure/m_body.py` and `measure/m_cls.py` (colour-class runs per row). Zoomed checks: `measure/z_*.png`.

## HEAD FRONT (W = head width at the jowls, 191 px; z above the chin y 769; x from the centre x 1426)

| Feature | Sheet | Model | Note |
|---|---|---|---|
| Dome tops above the chin | 0.801 W at x +-0.22 | 0.799 | |
| Valley between the domes | .639 | fit | |
| Half-width at z .29 / .50 / .60 / .70 | 0.500 / 0.440 / 0.424 / 0.377 | 0.493 / 0.430 / 0.420 / 0.388 | the head implicit fitted to the close-up outline, its top outline and the side profile: rms front 0.0015, top 0.0103, side 0.0043 / 0.0075 W |
| Head depth | depth .74 W at the jowls (side view, 296.7 px / m) | 0.745 W | |
| Eye centre | (+-0.257, 0.481) | (+-0.257, 0.481) | |
| Eye opening (w x h) | 0.241 x 0.240 | 0.242 x 0.240 | the model rim, measured on the hole |
| Iris | 0.163 W wide (~69 % of the opening), z 0.387..0.565, tucked 0.30 of the half-width toward the nose | 70 %, 0.30 | painted on the lens |
| Pupil | faint (B clearer): a deep brown oval | 46-50 %% x 60-64 %% of the iris, #33231A at 85 %% | |
| Catchlights | one big, d ~.045 W at (.44 nasal, .42 up) of the half-sizes | same + a faint low one | |
| Upper lash | ~.02 W over the top, ~.025 at the outer top, down the outer side; one short wing, tip ~(+-.418, .545) | ribbon 0.0220 W thick at the top, wing tip (1.25, .58) eye units | |
| Brows | centre (+-0.238, 0.715), 0.133 W long, ~.01 W thick, outer end drooping | same, .0124 W at the middle | painted |
| Nostrils | two dots at (+-0.060, 0.362), d 0.028 | same | painted, no nose button |
| Smile | corners x +-0.118 at z 0.270, bottom z 0.225, line ~.017 W | same | painted; 3 edge loops follow it |
| Blush | (+-0.343, 0.284), 0.144 x 0.115 | same (soft edge) | |
| Cream lower face | boundary z 0.346 at the centre (just under the nostrils), falling round the jowls to ~.16-.20 at the outline, wrapping under the chin | same table by azimuth | crisp border |

## Full body

| Feature | Sheet |
|---|---|
| Total height | 0.90 m to the dome tops (the brief) |
| Front-view scale | 395.0 px / m (sole y 528, dome tops y 172.5 = 0.90 m) |
| Chin (front view) | z ~.55 m (the close-up ratio gives .503) |
| Collar | two rounded cream lobes z .50-.545, +-.15, parted at the front; continuous round the back |
| Smock | neck z ~.53, hem z .165, half-width .21 at z .20 (A-line); sleeves to +-.227 at z .44, hem z .42 |
| Button | d .055 at (0, .45) |
| Satchel | her RIGHT hip: front view x -.21..-.02, z .18-.34; back view x (model) -.07..-.22; side view at the front |
| Band | front: x .018 at z .337 -> .14 at z .50 (.055 wide); back: from her left shoulder to the bag |
| Legs | z .09-.165, .138 wide at x +-.096 |
| Feet | .185 wide x .25 long x .08 tall, centres x +-.112, y -.026 |
| Hands | ~.09 wide, centre (+-.233, .33) |

| Model | |
|---|---|
| Total height | 0.9000 m (incl. the cap stem for A) |
| W | 0.485 m (body view 0.496) |
| Head height (chin to dome tops) | 0.3871 m (body view 0.350, brief 0.375, close-up ratio 0.397) |
| Chin | z 0.5126 m |
| Width x depth | 0.563 x 0.438 m |
| Hand clearance from the body side | -0.002 m |
| Triangles | 17410 |

## Differences from the brief and the sheet

- **Head size**: the sheet disagrees with itself (the close-up is taller per W than the body views). I kept the close-up's shape exactly (the face blueprint) and set W 0.485 m, between the two: W is 2.2 % under the body view, the head height 3.2 % over the brief.
- So the chin sits ~2-4 cm lower than in the body views; the neckline pieces (shirt top, neckerchief, collar) moved down with it.
- Heads: 2.32 heads to the dome tops (the notes say ~2.4; the drawing is ~2.3-2.4).
