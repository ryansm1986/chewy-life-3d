# mochi-slime (enemy series, ROADMAP EN-1)

Built in Blender by an Opus agent from the pick, Option A "Daifuku Drop" (`concepts/sheet-A.png`; the concept brief is
`concepts/concept-brief.md`). Approved by Claude at 9/10 after 2 round(s) (the face small and low from 45°, a near-white top: now a bigger, higher face, a pinker top, a lumpy snow heap), 2026-10-21.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them). The model brief: `brief.md`.
- One rigid part, body (the Burrow's monsters are single meshes: dungeon/monsters.js glbGeo merges the GLB and keeps the builder's material). The game kind id is mochi; King Mochi (mochiKing) is a separate later model.
- GLBs in `public/models/`, loaded by `src/regions/monsters/enemyModels.js` (`ENEMY_MODELS`); the builder: `src/dungeon/monsters.js (BUILD.mochi, buildMonster)`.
- Rebuild: copy this folder to `tools/blender/work/codex/mochi-slime/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_mochi-slime.py`. The script is deterministic.
