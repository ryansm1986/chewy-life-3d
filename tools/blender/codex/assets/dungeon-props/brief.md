# Brief: dungeon-props: treasure chests, breakable pots and buff shrines in Blender

## Why
Every dungeon floor (the Burrow dens and the four zone dungeons) is dressed with **treasure chests**, **breakable pots**
and **buff shrines**. They're built today by the code kit and read as primitive next to the Blender monsters and gates:
- the shrine is a rounded box with a cone roof and a floating orb;
- the chests and pots are better, but faceted and low-detail.
Your Blender versions replace them at the game's **9/10** bar.

**The look**: the owner's "chunky toy diorama" style (`refs/style-C-owner-pick-*.png`): candy-smooth rounded forms,
chunky timber with rounded edges, glossy painted lacquer and metal, soft painted gradients, nothing thinner than about
2 cm. `refs/game-dungeon-floor.png` is a zone dungeon floor at the game camera (45° down, about 25 m).

## Read the kit versions first (read-only)
- `src/dungeon/lootModels.js`: `buildChest` (wood and gold) and `buildPot` (the five themes). Their header comment
  describes each design: keep the designs, rebuild them beautifully.
- `src/dungeon/dungeonMode.js`: `makeChest` (how the lid pivots open), `makePot`, `makeShrine` (the five shrine types
  and their colours).

## The pieces (one GLB each, `public/models/`)
| GLB | Nodes (exact names) | Size, frame | Notes |
|---|---|---|---|
| `chest-wood.glb` | `body`, `lid` | the kit's: x −0.45..0.45, y 0..0.5 (body), z ±0.3, front = +z (Blender −Y) | `lid` origin = the hinge (the kit's: back top edge); `makeChest` rotates it about x to open. Inside the body: a heap of gold coins and gems. |
| `chest-gold.glb` | `body`, `lid` | the same frame | wine-red lacquer, gold fittings, a pink gem crest on the lid |
| `pot-burrow.glb` … `pot-crystal.glb` | `pot` | about 0.6 m tall, r 0.3, base at y 0 | the five themes as the kit draws them: acorn-capped terracotta (burrow), porcelain ginger jar (shrine), the moon jar (moon), cloth-covered crock (kitchen), frost-iced jar with a crystal knob (crystal) |
| `shrine-<type>.glb` × 5 (`zoomies`, `goodboy`, `lucky`, `sparkle`, `snack`) | `base`, `orb` | about 0.9 × 0.9 footprint, 1.4–1.6 m tall; the orb's origin at its centre, about 0.8 m up and 0.42 forward as in the kit | one shared design: a little stone shrine (a hokora under a tiled roof) with an offering niche where the glowing `orb` floats. Each type gets its own emblem and accents (zoomies a running paw, goodboy a heart, lucky a lucky-cat coin, sparkle a star, snack a bone treat) in its colour from `makeShrine`. `orb` has a `glow` material (emission in that colour). |

## Technical
- The contract `.claude/skills/codex-blender/templates/codex-preamble.md`: 1 unit = 1 m, front = Blender −Y, ground
  z = 0, apply transforms.
- **Vertex colours only** (a `Col` attribute), soft painted gradients and AO-like darkening, no textures, so they merge
  into the dungeon's vertex-coloured batches. One `body` material per object, plus `glow` where it shines.
- **Budgets**: chest ≤ 2,500 triangles (body plus lid), pot ≤ 1,200, shrine ≤ 3,500 (the orb included). There are
  dozens per floor.
- Smooth normals, closed shells, no zero-area faces or NaNs.
- One deterministic script: `build_dungeon-props.py --piece <name|all>`.

## Deliverables each round
- The GLBs.
- `preview.py` sheets per piece.
- One `preview/lineup-gamecam.png`: every piece in a row at the game camera (45° down, about 12 m, both ±45° yaws),
  beside a 1 m capsule.
- `preview/chest-open.png`: each chest shut and with the lid opened 1.9 rad.
- A report table: triangles, sizes and node names.

## Order
1. **Round 1**: `chest-wood.glb`, `chest-gold.glb`, `pot-burrow.glb` and `shrine-zoomies.glb`, which set the shared kit
   and the finish. Report and stop.
2. Then the other four pots and four shrines.

## Done when
At the game camera each piece reads at a glance as the same object as the kit's, clearly richer, in the toy-diorama style;
the frames, node names, pivots and budgets are exact; the build is deterministic.
