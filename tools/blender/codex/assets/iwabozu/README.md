# iwabozu (enemy series, ROADMAP EN-1)

Built in Blender by an Opus agent from the pick, Option A "Mossy Monk" (`concepts/sheet-A.png`; the concept brief is
`concepts/concept-brief.md`). Approved by Claude at 9/10 after 1 round(s) (approved on the first round), 2026-10-21.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them). The model brief: `brief.md`.
- Parts: body, lids (the closed eyelids: shown while asleep, no ink outline), armL (+X) / armR (−X) at (±0.415, −0.02, 0.425) Blender. The roll turns about the boulder's centre, 0.405 m (buildIwa's CY). Glow: the Lantern variant's warm window colour (iwaMat).
- GLBs in `public/models/`, loaded by `src/regions/monsters/enemyModels.js` (`ENEMY_MODELS`); the builder: `src/dungeon/zoneMonsters/bamboo.js (buildIwa)`.
- Rebuild: copy this folder to `tools/blender/work/codex/iwabozu/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_iwabozu.py`. The script is deterministic.
