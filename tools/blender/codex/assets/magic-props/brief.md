# Brief: magic-props: the Town Portal moon gate and the Spirit Lantern in Blender

## Why
Two magical devices the player uses on every dungeon run are still built by the code kit:
- **The Town Portal moon gate** (`src/dungeon/portalModel.js`, `frameGeometry`): a stone moon-gate ring about 2 m high
  with a shimenawa rope.
  - The player casts it in a dungeon to go home; its twin stands on Blossom Hollow's plaza.
  - A code-made swirl shader fills the ring's opening. You build only the frame.
- **The Spirit Lantern** (`src/regions/spiritLantern.js`, `geometry` / `lanternModel`): the tier device standing at every
  dungeon gate and at the Burrow door. Its light shows when it's lit.
Rebuild both at the game's **9/10** bar, matching the four new Blender dungeon gates they stand beside
(`refs/approved-gates-in-game.png`) and the owner's toy-diorama style (`refs/style-C-owner-pick-*.png`).

## Read the kit code first (read-only)
The designs, sizes, colours and the parts the game animates or lights are in those two files; also read how they're
placed (`src/dungeon/townPortal.js`, `placeLantern` in `spiritLantern.js`). **Keep each design and its dimensions**:
the portal's opening radius (the swirl disc sits in it) and the lantern's light and flame points.

## The pieces
| GLB (`public/models/`) | Nodes | Notes |
|---|---|---|
| `moon-gate.glb` | `frame` | Origin at the base centre, the ring in the XZ plane facing −Y (game +z). Chunky carved stone with a soft moss or lichen icing on top, a thick twisted shimenawa with zigzag shide across the top, stone feet. The **opening's inner radius must match the kit's** (the swirl disc fills it). ≤ 6,000 triangles. |
| `spirit-lantern.glb` | `lantern` (the body), `flame` (a `glow` material) | Keep the kit's silhouette and height. A carved stone or bronze tōrō-style lantern with a paper or crystal light box, chunky and rounded. The light box (`flame`) is a separate object with a `glow` material: the game shows it lit only when the lantern is lit. Report the light point (x, y, z). ≤ 4,000 triangles. |

## Technical
- The contract `.claude/skills/codex-blender/templates/codex-preamble.md`: 1 unit = 1 m, front −Y, ground z = 0.
- Vertex colours (a `Col` attribute) with soft painted shading, no textures; `glow` materials where they shine.
- Smooth normals, closed shells. A deterministic `build_magic-props.py --piece <name|all>`.

## Deliverables
- The GLBs.
- `preview.py` sheets.
- `preview/<piece>-gamecam.png` (45° down, about 12 m, ±45° yaws, a 1 m capsule).
- `preview/<piece>-kitcmp.png`: beside the kit design. Read the kit code and render a quick stand-in, or describe the
  difference.
- A report: triangles, sizes, node names, the portal's inner radius and the lantern's light point.

Do both pieces in round 1, then report and stop.
