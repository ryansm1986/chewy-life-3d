# The dungeon floors' chests, pots and shrines in Blender (ROADMAP Z-D6)

Built by an Opus agent under Claude's direction (2026-11-02), in the owner's toy-diorama style, from the kit designs in
`src/dungeon/lootModels.js` and `dungeonMode.js makeShrine`. The working folder
`tools/blender/work/codex/dungeon-props/` is git-ignored.

**The GLBs** (`public/models/`), all vertex colours only:
- `chest-wood`, `chest-gold`: nodes `body` + `lid`, the lid's node at its hinge (0, 0.5, −0.31). Under 2,500 triangles.
- `pot-burrow`, `pot-shrine`, `pot-moon`, `pot-kitchen`, `pot-crystal`: node `pot`. Under 1,200 triangles.
- `shrine-zoomies`, `shrine-goodboy`, `shrine-lucky`, `shrine-sparkle`, `shrine-snack`: nodes `base` + `orb`, each in
  its type's colour and emblem. Under 3,500 triangles. The game uses `base` and keeps its own emissive orb and light.

**Game side**: `src/dungeon/propModels.js` (`PROP_GLBS`, `loadDungeonProps()` at boot, `propGeo(name, node)`).
`lootModels.js chestGeometry` / `potGeometry` and `dungeonMode.js makeShrine` take the Blender geometry when it's loaded,
else the kit's.

- `build_dungeon-props.py --piece <name|all>`: deterministic.
- Two rounds.
