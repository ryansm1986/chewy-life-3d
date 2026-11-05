# Blossom Hollow's plaza centrepieces in Blender (ROADMAP Z-D6)

Built by an Opus agent under Claude's direction (2026-11-02), on the dungeon gates' and the Guild's kits. Each one
rebuilds its kit design (`src/world/buildings/special.js` and `decor.js`) in the same frame.

- **The GLBs** (`public/models/`):
  - `burrowGate.glb` (catalog `dungeonGate`), 11,971 triangles. The game keeps its own purple portal and spinning arcs
    (`glbKeep: ['hot', 'anim']`).
  - `fountain.glb`, 5,976. The game keeps its jets (`glbKeep: ['jet', 'anim']`), and the `water` object takes the kit's
    animated water material.
  - `chewyStatue.glb`, 5,742: the Toybox Chewy carved in stone, seated, holding the gilded bone.
  - `villageShrine.glb` (catalog `shrine`), 11,980.
- **Game side**: `catalog.js` `glb` / `glbKeep`, through `buildings/index.js`. The buildings test page
  (`/?test=buildings`) now shows the Blender models; `&kit` shows the kit's.
- `build_plaza-pieces.py --piece <name|all>`: deterministic. It needs `plaza_guildkit.py` (the Guild's roof and wall kit)
  beside it.
- **Rounds**:
  - the statue took 4 (the charm: big head, carved eyes with no goggle rims);
  - the shrine took 2 (the tile scale);
  - the Burrow took 2 (the torii moved out of the portal).
