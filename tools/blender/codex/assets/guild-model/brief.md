# Brief: guild-model: the Adventurers' Guild in Blender (three levels)

## Why
The Adventurers' Guild is a civic building in Blossom Hollow that the player builds and upgrades through three levels.
It's the heart of the cozy path: expeditions, hires, the Board. It's kit-built (`src/world/buildings/guild.js`), and the
game keeps a slot for a Blender centrepiece (`BUILDINGS.guild.glb`). Build it at the game's **9/10** bar.

**Read `src/world/buildings/guild.js` first** (read-only): its design, footprint, door, sign and what changes per level.
- `refs/L1-*.png`, `L2-*`, `L3-*` are the kit Guild at each level at the game camera: `far` is the normal distance and
  `near` closer, from both 45° yaws. Keep its identity and layout.
- The finish is the owner's chunky toy-diorama style (`refs/style-C-owner-pick-*.png`):
  - candy-smooth rounded forms;
  - chunky timber with rounded edges;
  - glossy lacquer;
  - plump tiles;
  - painted shading;
  - flowers and banners as accents.
  It must sit beside Blossom Hollow's kit buildings.

## The pieces
- `public/models/guild-1.glb`, `guild-2.glb`, `guild-3.glb`: one per level, the **same footprint, door position and
  front** as the kit's (read them from `guild.js`).
  - Each level visibly grows: level 2 adds what the kit adds, level 3 is grand.
  - Shared parts (the base, the door) are identical across levels.
- The sign, banners and windows as the kit has them. **No text**: an emblem (crossed paw and sword, or the kit's
  symbol) in place of words.
- Windows that glow at night: a separate material named `window_glow` (emission warm #ffd890).
- ≤ 15,000 triangles per level.

## Technical
- The contract `.claude/skills/codex-blender/templates/codex-preamble.md`: 1 unit = 1 m, front = Blender −Y (game +z,
  the door side), ground z = 0, centred on the kit's footprint origin.
- Vertex colours (a `Col` attribute) with soft painted gradients and baked AO-like darkening, no textures. One `body`
  material plus `window_glow`.
- Smooth normals, closed shells, a buried skirt to z = −0.3 under the foundation.
- A deterministic `build_guild-model.py --level <1|2|3|all>`.

## Deliverables
- The GLBs.
- `preview.py` sheets.
- `preview/L<n>-gamecam.png` (45° down at about 22 m and 12 m, ±45° yaws, a 1 m capsule).
- `preview/L<n>-kitcmp.png` beside `refs/L<n>-a-far.png`.
- A report: triangles, sizes, the footprint and door against the kit's.

**Round 1 is level 2 only**: it sets the finish. Then report and stop.
