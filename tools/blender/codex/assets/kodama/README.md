# kodama (enemy series, ROADMAP EN-1)

The Whispering Bamboo Grove's kodama, built in Blender by an Opus agent from the owner's pick, Option B "Birch Bud"
(`concepts/sheet-*.png`; the concept brief is `concepts/concept-brief.md`). Approved by Claude at 9/10 after 3 rounds
(`direction/`), 2026-10-20.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them).
- Parts: body (origin), head (pivot at the neck, (0, 0, 0.31)).
- GLBs: `public/models/{kodama, kodama_moss, kodama_elder}.glb`, one per variant key, loaded by `src/regions/monsters/enemyModels.js`.
- Rebuild: copy this folder to `tools/blender/work/codex/kodama/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_kodama.py`. The script is deterministic.
