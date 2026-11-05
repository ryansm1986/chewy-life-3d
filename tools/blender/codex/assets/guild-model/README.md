# The Adventurers' Guild in Blender (ROADMAP Z-D6 / CZ-7)

Built by an Opus agent under Claude's direction (2026-11-02): the kit design (`src/world/buildings/guild.js`, the roof
maths from `roofs.js`) rebuilt at the 9/10 bar, in the owner's toy-diorama finish. The working folder
`tools/blender/work/codex/guild-model/` is git-ignored.

- **The models**: `public/models/guild-1.glb`, `guild-2.glb`, `guild-3.glb`.
  - The kit's footprint (4 × 3) and door (−0.38, 0, 1.41) on every level.
  - Shared parts are identical across levels. Level 3 adds the lookout tower.
  - Materials: `body` (vertex colours) plus `window_glow` (the paper windows and lanterns).
  - 13.4k / 14.2k / 15.0k triangles.
- **Game side**: `catalog.js BUILDINGS.guild.glb` (a URL per level) and `buildings/index.js`:
  - `loadBuildingGlbs()` is awaited at boot.
  - `buildModel` swaps the GLB in for the kit meshes of an unstyled building; the kit template still gives the door,
    lights, footprint and height.
  - `window_glow` takes the kit's shared night glow (`setNight`).
  The same slot works for any catalog building.
- `build_guild-model.py --level <1|2|3|all>`: deterministic. Two rounds (the roof tile courses made crisp).
