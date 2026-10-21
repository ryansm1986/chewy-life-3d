# kappa (enemy series, ROADMAP EN-1)

Shiokaze Tidepools' kappa, built in Blender by an Opus agent from the owner's pick, Option A "Pond Rascal"
(`concepts/sheet-A.png`; the concept brief is `concepts/concept-brief.md`). Approved by Claude at 9/10 after 3 rounds (the
hair as a full ring, the ball head under a thin dish rim, rounded fingers and toes), 2026-10-20.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them).
- Parts: body, head (the neck at (0, 0.02, 0.45) Blender), arms (the shoulder axle at (0, 0.02, 0.365)), water (the dish
  water's centre, (0, 0.02, 0.866)). The game merges them into one mesh and turns them on the GPU (`KAPPA_HOOK` in
  `src/regions/monsters/tidepool.js`, built from these node translations: the head pitches −0.75 … +0.85, the arms
  −2.5 … +0.9, the water shrinks about its own centre as the kappa is hurt).
- GLBs: `public/models/{kappa, kappa_umi, kappa_kyuri}.glb`, loaded by `src/regions/monsters/enemyModels.js`; the builder
  is `kappaGlb` in `tidepool.js`.
- Rebuild: copy this folder to `tools/blender/work/codex/kappa/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_kappa.py`. The script is deterministic.
