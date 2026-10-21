# momiji-wisp (enemy series, ROADMAP EN-1)

Momiji Hollow's momiji-wisp, built in Blender by an Opus agent from the owner's pick, Option A "Leaf Lantern"
(`concepts/sheet-*.png`; the concept brief is `concepts/concept-brief.md`). Approved by Claude at 9/10 after 3 rounds (the mane turned to face the camera as a sunburst, the ginkgo core),
2026-10-20.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them).
- Parts: body (origin at the tail tip), orbit (the ring of leaves, pivot at the core centre (0, 0, 0.36); the game names it `orb`).
- GLBs: `public/models/{momiji-wisp, momiji-wisp_ginkgo, momiji-wisp_ember}.glb`, loaded by `src/regions/monsters/enemyModels.js`; the builder in `src/regions/monsters/maple.js`.
- Rebuild: copy this folder to `tools/blender/work/codex/momiji-wisp/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_momiji-wisp.py`. The script is deterministic.
