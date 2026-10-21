# Model brief: takenoko (enemy series EN-1, Whispering Bamboo Grove)

Follow `tools/blender/work/codex/enemy-model-contract.md` exactly. The owner picked **Option A "Husk Helmet"**:
`refs/sheet.png`. Build that design. `refs/current-takenoko-in-game.png` is today's procedural model (for size and
read only; the sheet wins). `refs/heroes-in-game.png` shows the heroes it fights.

## What it is
The most common fodder enemy of the first region (packs of 8–16). A squat, determined bamboo-shoot sprite. It waddles
on root toes, burrows (only a dirt mound with its tip sliding along), pops up and spin-slashes with its leaf arms.

## Size and proportions (Blender units = m)
- **Overall height 1.05 m** to the top of the curled tip; the husk "helmet" body about **0.72 m wide** and 0.62 m deep;
  with the leaf arms about **1.0 m wide**.
- From the sheet's front view: the body is an onion/teardrop: widest at about 0.3 m up, the pointed husk top at about
  0.85 m, the curl rising above it to 1.05 m and hooking over to one side exactly as on the sheet's front view (toward
  the viewer's right).
- The **cream face patch** fills the lower front: about 0.46 m wide, from 0.1 m to 0.45 m up, framed by the lowest husk
  row like a helmet's rim. Eyes centred about 0.3 m up, each about 0.11 m tall; the angry brows (#6a4424) tight above
  them; a small frown; blush ovals below the outer eye corners.
- **Husks**: 3 rows of 5–6 pointed overlapping leaves, each with one dark teardrop marking (#6a4424) in the middle, tips
  slightly lifted off the body (thick, ≥ 3 cm, rounded tips: no paper-thin edges). The husk rows must keep the face
  clear from 45° above (the rim sits above the eyes, not over them).
- **Leaf arms**: two broad leaves (#9ac050 with a lighter midrib #b8dc6a) at the sides about 0.3 m up, each on a small
  green ball shoulder (the sheet's knob), angled down-and-out about 35°. 0.32 m long, 0.12 m wide, ≥ 3 cm thick.
- **Root toes**: 4–5 cream nubs (#ecd6a8) peeking out under the front and sides.

## Parts
| name | what | pivot (origin) | how the game moves it |
|---|---|---|---|
| `body` | everything above: husks, face, curl, arms, toes | (0, 0, 0) | the whole model spins about Z (fast, the spin-slash), squashes (scale z 0.8–1.35, x/y the inverse), tilts ±0.18 rad, hops 0.14 m, and sinks 1.05 m into the ground when digging |
| `mound` | the burrow mound: a lumpy soil mound **0.9 m wide, 0.25 m tall** (#7a5a38 with lighter clods #a88459 and 3–4 grey pebbles #b8b0a4), with a hole in the top that a **short stub of husk and the green curl** (about 0.18 m above the soil) poke out of | (0, 0, 0) | shown instead of the body while burrowed: wobbles (scale 0.94–1.12, rotation about the forward axis ±0.1 rad) and grows to 1.3× before the pop |

Keep the arms in `body` (they don't move on their own).

## Variants (same shape)
1. `takenoko.glb` (base): husk #a8743c, marks #6a4424, face #fff0c8, curl #b8cc5a, arms #9ac050, toes #ecd6a8, iris
   #292125, blush #e98c91.
2. `takenoko_aotake.glb` ("Aotake", young green): husk #86b04a, marks #557a2a, curl #dcec7a, face #f8f6d4, arms
   #b8dc6a; soil #7a5a38.
3. `takenoko_golden.glb` (rare): husk #e0a830, marks #a8601c, curl #ff7a4a, face #fff6d8, arms #ffc04a, plus **three
   small cyan gems** (#5ad8e0 with a white glint) set in the husks (front and both sides), as on the sheet.

## Budget
≤ 5,000 triangles for `body` + `mound` together, per variant (the mound ≤ 900).

## Done when
- Front, 3/4, side and back match the sheet (silhouette, husk rows, face size and position), measured with compare.py.
- At the 45° game camera from 20 m it reads instantly as a grumpy little bamboo shoot with a big face.
- The face holds crisp, toy-like eyes with catchlights and the angry brows, no floating decals.
- The spin, squash and the mound wobble don't open gaps; the mound reads as soil with the tip peeking out.
- Three variant GLBs, each ≤ 5k tris, standing on z = 0, front −Y.
