# kamaitachi (enemy series, ROADMAP EN-1)

The Whispering Bamboo Grove's kamaitachi, built in Blender by an Opus agent from the owner's pick, Option A "Wind Ronin"
(`concepts/sheet-*.png`; the concept brief is `concepts/concept-brief.md`). Approved by Claude at 9/10 after 4 rounds (the last three on the tail)
(`direction/`), 2026-10-20.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them).
- Parts: body (origin), tail (pivot at the tail root, (0, 0.42, 0.262)).
- GLBs: `public/models/{kamaitachi, kamaitachi_yuki, kamaitachi_storm}.glb`, one per variant key, loaded by `src/regions/monsters/enemyModels.js`.
- Rebuild: copy this folder to `tools/blender/work/codex/kamaitachi/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_kamaitachi.py`. The script is deterministic.
