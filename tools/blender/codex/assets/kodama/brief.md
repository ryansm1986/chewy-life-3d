# Model brief: kodama (enemy series EN-1, Whispering Bamboo Grove)

Follow `tools/blender/work/codex/enemy-model-contract.md` exactly. The owner picked **Option B "Birch Bud"**:
`refs/sheet.png`. Build that design. `refs/current-kodama-in-game.png` is today's procedural model (size and read
only; the sheet wins). `refs/heroes-in-game.png` shows the heroes it fights.

## What it is
The ranged fodder enemy of the first region: a little tree spirit that floats (the game lifts it about 0.34 m and bobs
it), keeps its distance and flicks leaf darts. Its tell is a **head rattle**: the head wobbles and twists fast on the
neck before each volley.

## Size and proportions (m)
- **Height at rest 0.98 m** from the feet (z = 0) to the leaf tips; the top of the head about 0.8 m.
- **Head**: a rounded, slightly boxy wood-knot "bun" about **0.56 m wide, 0.44 m tall, 0.48 m deep**, flat-ish bottom,
  softly bulging sides (the sheet's front view). Colour #f3f6ec with **2 soft bark-ring swirls** (#e6d2c0 / #d8bca8,
  shallow carved grooves or painted rounded rings ≥ 3 cm wide) on the upper corners and one on top, as on the sheet.
- **Twig crown**: a short brown twig (#8a5a3a) on top with **5 leaves** (#7ab04a, a lighter #a8d85a midrib) fanning
  out like a little crown, about 0.18 m tall and 0.38 m wide. Leaves ≥ 2.5 cm thick, rounded tips.
- **Face** on the lower half of the head front: eyes centred about 0.12 m below the head's middle, about 0.1 m tall,
  0.22 m apart (centre to centre), brown iris #8a582f with a dark #252333 top and pupil, a big and a small catchlight,
  a lash line flick at the outer corners; a tiny dark nose dot; a small open "o" mouth (#252333 with a pink inside);
  pink blush ovals (#f0a0ad) under the eyes. Match the sheet's front view.
- **Neck**: a short visible peg (#e8e0d0, about 0.07 m wide, 0.05 m tall) between head and body.
- **Leaf collar**: 5–6 leaves (#7ab04a) round the top of the body like a ruff, about 0.26 m across.
- **Body**: a small bean / pear body (#f3f6ec, slightly darker underside) about 0.2 m wide and 0.24 m tall, with
  stubby round-ended arms angled down-out, and two short **root-tendril legs** that taper and curl outward at the tips
  (#e6d2c0 tips), about 0.14 m long. Total body + legs about 0.36 m.

## Parts
| name | what | pivot (origin) | how the game moves it |
|---|---|---|---|
| `body` | body, arms, legs, leaf collar, neck peg | (0, 0, 0) | bobs, leans ±0.16 rad forward, recoils −0.28 rad, squashes ±8 % |
| `head` | head, face, bark rings, twig crown | the **neck joint**: (0, 0, ≈ 0.4), at the top of the neck peg | the rattle: rotates up to ±0.24 rad about the forward axis, ±0.16 rad about Z and ±0.08 rad pitch, fast, and bounces 0.02 m. No gap may open at the neck at those angles (the peg tucks up into the head) |

## Variants (same shape)
1. `kodama.glb` (base): skin #f3f6ec, rings #e6d2c0, leaves #7ab04a, twig #8a5a3a.
2. `kodama_moss.glb` ("Moss Kodama"): skin #e6f0da, a **moss cap** (#7ab04a with a few lighter #a8d85a lumps) over
   the top of the head, its edge drooping in 4–5 soft rounded drips, and a **small red mushroom** (cap #e8503a with 3
   white dots #fff6ee, stem #fff4e4) growing from the cap beside the crown, as on the sheet.
3. `kodama_elder.glb` ("Elder Kodama"): skin #f6eedc, the leaf crown replaced by **3–5 pink sakura blossoms** (#ffb8d8
   petals, #ff9ac4 inner, #fff0a0 centres), and **gold eyes** (iris #ffd870, darker top #d8a040) on the `glow`
   material so they shine.

## Budget
≤ 4,500 triangles for `body` + `head`, per variant.

## Done when
- The front, 3/4, side and back match the sheet (the head's bun shape and width-to-height, the face's size and height,
  the crown, the collar), measured with compare.py.
- From the 45° game camera at 20 m it reads as a cute tree spirit with a big face and a leafy crown; not a mochi blob.
- The head rattle (the angles above) opens no gap at the neck; the face stays crisp.
- Three variant GLBs, ≤ 4.5k tris each, front −Y, feet on z = 0, the `head` origin at the neck.
