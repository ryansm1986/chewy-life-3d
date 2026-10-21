# yukidaruma (enemy series, ROADMAP EN-1)

Built in Blender by an Opus agent from the pick, Option A "Bucket Brute" (`concepts/sheet-A.png`; the concept brief is
`concepts/concept-brief.md`). Approved by Claude at 9/10 after 2 round(s) (the rolling ball read as a jar with a lid: now packed lumpy snow with the tipped bucket, a fat mitten, coal lumps; a slightly bigger bucket), 2026-10-21.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them). The model brief: `brief.md`.
- Parts: body, armR (+X) / armL (−X) at the shoulders (±0.366, −0.02, 0.785) Blender, ball (its centre (0, 0, 0.72), hung on pivot: shown and spun while it rolls). The Grand variant is also Captain Frostbelly. Material: the luminance knee (onsen.js DARUMA_KNEE).
- GLBs in `public/models/`, loaded by `src/regions/monsters/enemyModels.js` (`ENEMY_MODELS`); the builder: `src/regions/monsters/onsen.js (buildDaruma)`.
- Rebuild: copy this folder to `tools/blender/work/codex/yukidaruma/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_yukidaruma.py`. The script is deterministic.
