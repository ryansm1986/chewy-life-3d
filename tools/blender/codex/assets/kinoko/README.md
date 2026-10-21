# kinoko (enemy series, ROADMAP EN-1)

Built in Blender by an Opus agent from the pick, Option A "Toadstool Tot" (`concepts/sheet-A.png`; the concept brief is
`concepts/concept-brief.md`). Approved by Claude at 9/10 after 1 round(s) (approved on the first round (the cap's front rim raised ~5 cm so the face shows at 45°)), 2026-10-21.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them). The model brief: `brief.md`.
- One rigid part, body (dungeon/monsters.js glbGeo merges it on the builder's material).
- GLBs in `public/models/`, loaded by `src/regions/monsters/enemyModels.js` (`ENEMY_MODELS`); the builder: `src/dungeon/monsters.js (BUILD.kinoko, buildMonster)`.
- Rebuild: copy this folder to `tools/blender/work/codex/kinoko/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_kinoko.py`. The script is deterministic.
