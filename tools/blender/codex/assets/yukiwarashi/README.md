# yukiwarashi (enemy series, ROADMAP EN-1)

Built in Blender by an Opus agent from the pick, Option A "Straw Snow Child" (`concepts/sheet-A.png`; the concept brief is
`concepts/concept-brief.md`). Approved by Claude at 9/10 after 2 round(s) (the face read as a rectangle between the fringe and the side locks: now round cheeks and jaw), 2026-10-21.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them). The model brief: `brief.md`.
- Parts: body, face (its own thin 6 mm outline, no shadow), armR (+X) / armL (−X) at the shoulders (±0.17, −0.06, 0.47) Blender, ballR / ballL (the snowballs, hung on the arms, scaled in for a volley). The game throws from the mittens' height (onsen.js M.throwAt).
- GLBs in `public/models/`, loaded by `src/regions/monsters/enemyModels.js` (`ENEMY_MODELS`); the builder: `src/regions/monsters/onsen.js (buildWarashi)`.
- Rebuild: copy this folder to `tools/blender/work/codex/yukiwarashi/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_yukiwarashi.py`. The script is deterministic.
