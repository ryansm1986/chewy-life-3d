# kuri (enemy series, ROADMAP EN-1)

Momiji Hollow's kuri, built in Blender by an Opus agent from the owner's pick, Option A "Spiky Bruiser"
(`concepts/sheet-*.png`; the concept brief is `concepts/concept-brief.md`). Approved by Claude at 9/10 after 3 rounds (the open angle, the closed roll, the nut colour, the lining),
2026-10-20.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them).
- Parts: body (pivot at the ball centre, (0, 0, 0.46): it rolls about it), br and bl (the burr halves, hinges at (±0.03, 0.40, 0.46); the game opens them 1.0 rad, 1.5 dizzy).
- GLBs: `public/models/{kuri, kuri_roasted, kuri_momiji}.glb`, loaded by `src/regions/monsters/enemyModels.js`; the builder in `src/regions/monsters/maple.js`.
- Rebuild: copy this folder to `tools/blender/work/codex/kuri/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_kuri.py`. The script is deterministic.
