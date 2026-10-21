# akaname (enemy series, ROADMAP EN-1)

Built in Blender by an Opus agent from the pick, Option A "Bathhouse Imp" (`concepts/sheet-A.png`; the concept brief is
`concepts/concept-brief.md`). Approved by Claude at 9/10 after 3 round(s) (the black hair as one helmet: a tighter mop with highlight patches; the Elder's pot-lid hair as a white shock), 2026-10-21.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them). The model brief: `brief.md`.
- Parts: body, tongue (a plain tube along −Y, 0.17 m at rest: the game stretches it ×38 for the lash; open root buried in the mouth; idle droop 0.75 for this model, onsen.js DROOP), armL (+X) / armR (−X, the tawashi) at (±0.192, −0.025, 0.312) Blender.
- GLBs in `public/models/`, loaded by `src/regions/monsters/enemyModels.js` (`ENEMY_MODELS`); the builder: `src/dungeon/zoneMonsters/onsen.js (buildAka)`.
- Rebuild: copy this folder to `tools/blender/work/codex/akaname/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_akaname.py`. The script is deterministic.
