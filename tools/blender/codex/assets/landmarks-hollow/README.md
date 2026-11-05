# Blossom Hollow's landmark buildings in Blender (ROADMAP Z-D6)

Built by an Opus agent under Claude's direction (2026-11-02), on the Guild's technique (`../guild-model`): the roofs
ported from `roofs.js`, crisp tile courses, painted vertex colours, a buried skirt and `window_glow`. Each one rebuilds its
kit design (`src/world/buildings/special.js`), with the same footprint, door and smoke emitters.

- **The GLBs** (`public/models/`):
  - `townHall.glb`: 17,974 triangles;
  - `rosieShop.glb`: 13,434;
  - `chewyHouse-1.glb`, `-2.glb`, `-3.glb`: 9.9k / 12.4k / 14.9k;
  - `boneSmith.glb`: 6,890.
- **Game side**: `catalog.js` `glb: [url per level]`, through `buildings/index.js` (see `../guild-model/README.md`).
  - The Bone Smith keeps the kit's daytime forge glow (`glbKeep: ['hot']`).
  - A remodelled (styled) house keeps the kit model.
- `build_landmarks-hollow.py --piece <name|all>`: deterministic. Two rounds (the tile scale matched to each building; the
  hip seams).
