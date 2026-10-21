# kakashi (enemy series, ROADMAP EN-1)

Momiji Hollow's kakashi, built in Blender by an Opus agent from the owner's pick, Option C "Ronin Scarecrow"
(`concepts/sheet-*.png`; the concept brief is `concepts/concept-brief.md`). Approved by Claude at 9/10 after 2 rounds (the hat sat down on the head, a warmer burlap head),
2026-10-20.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them).
- Parts: body (origin), crowA / crowB / crowC (the perched crows, each at its feet); `kakashi_crow.glb` is the flying crow (body, wing_L, wing_R at the shoulders).
- GLBs: `public/models/{kakashi, kakashi_hoshigaki, kakashi_oni, kakashi_crow}.glb`, loaded by `src/regions/monsters/enemyModels.js`; the builder in `src/regions/monsters/maple.js`.
- Rebuild: copy this folder to `tools/blender/work/codex/kakashi/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_kakashi.py`. The script is deterministic.
