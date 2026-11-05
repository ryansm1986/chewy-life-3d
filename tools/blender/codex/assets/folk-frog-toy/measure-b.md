# Dango, the welcoming baker's helper (folk_frog_b): Step 0, the sheet measured on pixels

Source: `refs/sheet.png` (1536 x 1024), row B. Panels segmented by `measure/seg.py`; the head close-up by `measure/m_head.py` (outline widths, colour components) and `measure/m_eye.py` (column scans through the eyes); the full-body views by `measure/m_body.py` and `measure/m_cls.py` (colour-class runs per row). Zoomed checks: `measure/z_*.png`.

## HEAD FRONT (W = head width at the jowls, 201 px; z above the chin y 769; x from the centre x 917)

| Feature | Sheet | Model | Note |
|---|---|---|---|
| Dome tops above the chin | 0.751 W at x +-0.21 | 0.752 | |
| Valley between the domes | .622 | fit | |
| Half-width at z .29 / .50 / .60 / .70 | 0.500 / 0.438 / 0.415 / 0.348 | 0.488 / 0.439 / 0.410 / 0.348 | the head implicit fitted to the close-up outline, its top outline and the side profile: rms front 0.0019, top 0.0044, side 0.0039 / 0.0057 W |
| Head depth | depth .67 W at the jowls (side view, 260 px / m) | 0.673 W | |
| Eye centre | (+-0.261, 0.471) | (+-0.261, 0.471) | |
| Eye opening (w x h) | 0.224 x 0.242 | 0.228 x 0.240 | the model rim, measured on the hole |
| Iris | 0.149 W wide (~69 % of the opening), z 0.375..0.560, tucked 0.30 of the half-width toward the nose | 70 %, 0.30 | painted on the lens |
| Pupil | faint (B clearer): a deep brown oval | 46-50 %% x 60-64 %% of the iris, #33231A at 85 %% | |
| Catchlights | one big, d ~.045 W at (.44 nasal, .42 up) of the half-sizes | same + a faint low one | |
| Upper lash | ~.02 W over the top, ~.025 at the outer top, down the outer side; one short wing, tip ~(+-.418, .545) | ribbon 0.0227 W thick at the top, wing tip (1.25, .58) eye units | |
| Brows | centre (+-0.232, 0.690), 0.124 W long, ~.01 W thick, outer end drooping | same, .0124 W at the middle | painted |
| Nostrils | two dots at (+-0.057, 0.354), d 0.028 | same | painted, no nose button |
| Smile | corners x +-0.117 at z 0.262, bottom z 0.214, line ~.017 W | same | painted; 3 edge loops follow it |
| Blush | (+-0.341, 0.274), 0.144 x 0.114 | same (soft edge) | |
| Cream lower face | boundary z 0.338 at the centre (just under the nostrils), falling round the jowls to ~.16-.20 at the outline, wrapping under the chin | same table by azimuth | crisp border |

## Full body

| Feature | Sheet |
|---|---|
| Total height | 1.05 m to the dome tops (the brief) |
| Front-view scale | 367.6 px / m (sole y 530, dome tops y 144) |
| Chin (front view) | z .634 m behind the neckerchief (the close-up ratio gives .582) |
| Neckerchief | roll z .585-.64, +-.20 wide; knot at the front, two short ends to z ~.50, spread +-.10 |
| Top | hem z .175-.19, half-width .286 at z .21-.26; sleeves to x +-.31 at z .50, hem z .46 |
| Apron | waistband z .37-.425 all round, clasp at the back (.16 x .065); front panel z .165-.37, half-width .245, rounded lower corners; shoulder bands .05 wide at x +-.15 |
| Legs | z .10-.17 visible, .19 wide at x +-.13 |
| Feet | .24 wide x .31 long, centres x +-.15, y -.02 |
| Hands | .105 wide, centre (+-.30, .38) |

| Model | |
|---|---|
| Total height | 1.0498 m (incl. the cap stem for A) |
| W | 0.610 m (body view 0.623) |
| Head height (chin to dome tops) | 0.4585 m (body view 0.416, brief 0.440, close-up ratio 0.468) |
| Chin | z 0.5913 m |
| Width x depth | 0.788 x 0.496 m |
| Hand clearance from the body side | 0.017 m |
| Triangles | 19398 |

## Differences from the brief and the sheet

- **Head size**: the sheet disagrees with itself (the close-up is taller per W than the body views). I kept the close-up's shape exactly (the face blueprint) and set W 0.610 m, between the two: W is 2.1 % under the body view, the head height 4.2 % over the brief.
- So the chin sits ~2-4 cm lower than in the body views; the neckline pieces (shirt top, neckerchief, collar) moved down with it.
- Heads: 2.29 heads to the dome tops (the notes say ~2.4; the drawing is ~2.3-2.4).
