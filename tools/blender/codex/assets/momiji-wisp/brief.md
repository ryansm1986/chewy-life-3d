# Model brief: momiji-wisp (enemy series EN-1, Momiji Hollow)

Follow `D:/projects/chewy-life-3d/.claude/skills/codex-blender/templates/enemy-model-contract.md` exactly. The owner
picked **Option A "Leaf Lantern"**: `refs/sheet.png`. Build that design. `refs/current-momiji-wisp-in-game.png` is
today's procedural model (size and read only). `refs/approved-bamboo-trio-in-game.png` shows the first region's approved
Blender enemies in the game: match their finish.

## What it is
The floating caster of the autumn maple region: a giggly glowing leaf spirit. It drifts (the game lifts it 0.55 m and
bobs it), blinks about, and flings fans of maple-leaf darts; its tell is the **ring of orbiting leaves** spinning up,
tightening, then flinging out wide.

## Size (m; the game scales the whole model ×1.15)
- The **core**: a glowing sphere of **diameter 0.40 m**, centred **0.36 m** above the model's origin. The face on its
  front: big glossy dark eyes (brown iris #8a582f darkening to #4a2a1c on top, catchlights), a small open happy mouth
  with a pink tongue, blush. Core colour #ffe07a on the front fading to #ffb050 at the back and bottom.
- The **mane**: a sunburst of **8–9 big chunky maple leaves** (#e2482e and #f47034 alternating, 5–7 rounded points each,
  ≥ 3 cm thick, a lighter vein) fanned round the back and sides of the core, about **0.85 m** across, two taller leaves
  on top as **ears**; it frames the face (none in front of it).
- The **spiral tail**: a curly glowing tail (#ffb050 → #f47034) curling under the core down to the origin (z ≈ 0), with
  1–2 little leaves.
- The **orbit ring**: **7 maple leaves** (≈ 0.17 m each, alternating colours) lying almost flat in a circle of
  **radius 0.52 m** round the core, tips leading round the circle.

## Parts
| name | what | pivot (origin) | how the game moves it |
|---|---|---|---|
| `body` | core, face, mane, ears, tail | (0, 0, 0) (the tail tip at the bottom) | floats and bobs; leans ±0.35 rad; squash ±9 %; shrinks to 0 and back on the blink |
| `orbit` | the 7 ring leaves | **the core centre (0, 0, 0.36)** | spins about Z (fast during the tell), its radius scales 0.68–2.6× (the leaves fling out) |

## Glow
The core and the tail should read as glowing: give their faces the `glow` material (the colours stay in the vertex
colours; keep the core's front #ffe07a: the game's glow keys on that warm yellow).

## Variants
1. `momiji-wisp.glb` (base): leaves #e2482e / #f47034, core #ffe07a / #ffb050.
2. `momiji-wisp_ginkgo.glb` ("Ginkgo"): **fan-shaped ginkgo leaves** everywhere (mane, ears, tail, orbit: #ffd23a /
   #eeb028), core #fff2b8 / #ffd070.
3. `momiji-wisp_ember.glb` ("Ember", fire): leaves #b81e2a / #ff6a2a, core #ffb24a / #ff6a2a, 4–5 small glowing ember
   specks (#ffd870) set in the mane.

## Budget
≤ 4,500 triangles for `body` + `orbit`, per variant.

## Done when
- Matches the sheet's front, 3/4, side and back (measured): the core size, the sunburst mane, the ears, the tail.
- From the 45° game camera the glowing face reads inside a ring of leaves, not lost in the mane.
- The orbit's spin and radius scaling look right about the core; nothing pokes through the face.
- Three GLBs, ≤ 4.5k tris each, front −Y, the tail tip at z = 0.
