# Model brief: kakashi (enemy series EN-1, Momiji Hollow)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly. The owner
picked **Option C "Ronin Scarecrow"**: `refs/sheet.png`. Build that design. `refs/current-kakashi-in-game.png` is
today's procedural model (size and read only). `refs/approved-bamboo-trio-in-game.png` shows the first region's
approved Blender enemies in the game: match their finish.

## What it is
The ranged enemy of the autumn maple region: a cheeky wandering-samurai scarecrow on one wooden leg. It hops about, rattles,
and **sends its crows** (the perched crows fly off at you and come back); it also does a spinning hop-slam.

## Size (m)
- **1.75 m** tall to the top of the hat (the crow on the hat above that). Chibi: the head about 0.48 m wide.
- **One wooden leg** (#8a5a3a) on a small geta-like foot block at the ground; a **straw mino skirt** (#e8c060, shadow
  #c89a40) as 2–3 chunky thatch tiers; a **patched blue kimono** (#3c4c90, orange patches #f08a3a) on the cross-bar
  arms, a rope belt (#8a5a3a), straw tufts at the sleeve ends (chunky, no strands); an **orange scarf** (#f08a3a);
  a **wooden toy sword** (#8a5a3a) at the hip.
- The **burlap head** (#e6d6b4) with the toy-line face: big glossy dark eyes with catchlights (as the sheet), a small
  dark nose, a stitched smile (short thick stitches, ≥ 1.5 cm), blush. **Stitch lines must be chunky enough to read.**
- The **straw sugegasa** (#e8c060 with the red band #d84a3a) tilted back so **the face is clear from 45° above**: check
  this at the game camera; if the brim hides the eyes, tilt it further back or narrow it.

## Parts
| name | what | pivot (origin) | how the game moves it |
|---|---|---|---|
| `body` | everything except the crows | (0, 0, 0) | hops 0.26 m, spins a full turn about Z on the hop-slam, rattles ±0.09 rad, squash ±26 % (the landing) |
| `crowA` | the crow perched on its **right arm** (−X side, the end of the cross-bar) | the crow's feet on the perch | turns its head (pitch ±0.12 rad), flutters 6 cm; is hidden when it flies off |
| `crowB` | the crow on the **hat** (sitting on the crown) | its feet on the hat | the same |
| `crowC` | (oni variant only) a crow on the **left arm** (+X end) | its feet on the perch | the same |

Each **crow** is a round little bird about 0.22 m long (#2e3048 with a lighter #454a78 back, a chunky orange beak
#f0a040, big white eyes with dark pupils, tiny feet), facing forward (−Y), wings folded.

**Also deliver `kakashi_crow.glb`**: the flying crow the game launches, three parts: `body` (origin at the crow's
centre), `wing_L` (+X, origin at its shoulder) and `wing_R` (−X, origin at its shoulder), wings spread flat; the game
flaps them about the forward axis (±0.9 rad). Same colours, ≤ 600 triangles.

## Variants
1. `kakashi.glb` (base): kimono #3c4c90, patches #f08a3a, hat with the red band, crows A and B.
2. `kakashi_hoshigaki.glb` ("Hoshigaki"): kimono #3f8058, patches #f4e2b0, plus a short string of **4 dried
   persimmons** (#f07a2a with dark-green calyx caps) hanging from the left sleeve, crows A and B.
3. `kakashi_oni.glb` ("Oni"): kimono #5a3470, patches #e8503a, **no hat**, a red-orange burlap head (#ff8a66) with two
   short stubby cream horns (#fff4d8) and a white-and-red headband, crows A, B (B on the head) and C.

## Budget
≤ 5,500 triangles per variant, crows included (each perched crow ≤ 450).

## Done when
- Matches the sheet's front, 3/4, side and back (measured): the big head, the hat back off the face, the scarf, the
  sword, the skirt tiers, the one leg.
- From the 45° game camera the face reads (eyes with sparkle, the smile) and the crows read as crows.
- The body spin and squash open no gaps; each crow's origin sits on its perch.
- Three GLBs + `kakashi_crow.glb`, front −Y, the foot on z = 0.
