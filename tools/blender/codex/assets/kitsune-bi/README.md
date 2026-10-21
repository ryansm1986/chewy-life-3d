# kitsune-bi (enemy series, ROADMAP EN-1)

Built in Blender by an Opus agent from the pick, Option A "Foxfire Drop" (`concepts/sheet-A.png`; the concept brief is
`concepts/concept-brief.md`). Approved by Claude at 9/10 after 1 round(s) (approved on the first round), 2026-10-21.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them). The model brief: `brief.md`.
- One rigid part, body (it floats: 0.65–1.45 m above its origin). The game draws it nearly unlit with a 1.2 cm outline (BUILD.wisp's material). The game kind id is wisp.
- GLBs in `public/models/`, loaded by `src/regions/monsters/enemyModels.js` (`ENEMY_MODELS`); the builder: `src/dungeon/monsters.js (BUILD.wisp, buildMonster)`.
- Rebuild: copy this folder to `tools/blender/work/codex/kitsune-bi/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_kitsune-bi.py`. The script is deterministic.
