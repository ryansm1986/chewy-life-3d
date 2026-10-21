# tesso (enemy series, ROADMAP EN-1)

Built in Blender by an Opus agent from the pick, Option A "Iron-Tooth Rat" (`concepts/sheet-A.png`; the concept brief is
`concepts/concept-brief.md`). Approved by Claude at 9/10 after 1 round(s) (approved on the first round), 2026-10-21.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them). The model brief: `brief.md`.
- Parts: body (with the upper arms, tail, juzu), head (the neck ball's centre (0, −0.05, 0.50) Blender), paws (the elbow axle (0, −0.20, 0.38): split at the elbow so the shoulders never open), mound (the dirt mound on root: shown while it tunnels).
- GLBs in `public/models/`, loaded by `src/regions/monsters/enemyModels.js` (`ENEMY_MODELS`); the builder: `src/dungeon/zoneMonsters/maple.js (buildTesso)`.
- Rebuild: copy this folder to `tools/blender/work/codex/tesso/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_tesso.py`. The script is deterministic.
