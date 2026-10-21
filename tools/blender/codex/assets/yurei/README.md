# yurei (enemy series, ROADMAP EN-1)

Built in Blender by an Opus agent from the pick, Option A "Sheet Ghost" (`concepts/sheet-A.png`; the concept brief is
`concepts/concept-brief.md`). Approved by Claude at 9/10 after 2 round(s) (the brow triangle standing up like a horn, a boxy dome, bigger eyes), 2026-10-21.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them). The model brief: `brief.md`.
- Parts: body, armL (+X) / armR (−X) sleeves at the shoulders, flame (its centre: the game orbits it). Glow: the flame's very pale cyan vertex colours (spirit.js YUREI_MAT).
- GLBs in `public/models/`, loaded by `src/regions/monsters/enemyModels.js` (`ENEMY_MODELS`); the builder: `src/dungeon/zoneMonsters/spirit.js (buildYurei)`.
- Rebuild: copy this folder to `tools/blender/work/codex/yurei/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_yurei.py`. The script is deterministic.
