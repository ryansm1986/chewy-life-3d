# chochin (enemy series, ROADMAP EN-1)

Built in Blender by an Opus agent from the pick, Option A "Paper Lantern" (`concepts/sheet-A.png`; the concept brief is
`concepts/concept-brief.md`). Approved by Claude at 9/10 after 1 round(s) (approved on the first round; a deeper tongue on the pink one), 2026-10-21.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them). The model brief: `brief.md`.
- One rigid part, body (it hangs 0.14–1.41 m above its origin: the lantern floats). Glow: the game's lantern shader lights every red-heavy colour (paper, tongue, eye white). The game kind id is lantern.
- GLBs in `public/models/`, loaded by `src/regions/monsters/enemyModels.js` (`ENEMY_MODELS`); the builder: `src/dungeon/monsters.js (BUILD.lantern, buildMonster)`.
- Rebuild: copy this folder to `tools/blender/work/codex/chochin/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_chochin.py`. The script is deterministic.
