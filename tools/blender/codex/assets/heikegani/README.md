# heikegani (enemy series, ROADMAP EN-1)

Shiokaze Tidepools' Heike-gani, built in Blender by an Opus agent from the owner's pick, Option A "Samurai Shell"
(`concepts/sheet-A.png`; the concept brief is `concepts/concept-brief.md`). Approved by Claude at 9/10 after 2 rounds (the
dark claw tips, the pincer read from above, fatter mitts, the slam and walk clearances), 2026-10-20.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them).
- Parts: body, claws (one axle at (0, −0.20, 0.40) Blender; the game pitches it −1.45 … +0.6), leg_L1…L4 (+X) and
  leg_R1…R4 (−X), each with its origin at its hip. The game merges them into one mesh and bends them on the GPU
  (`CRAB_HOOK` in `src/regions/monsters/tidepool.js`: the claws turn about the `claws` node's translation; each leg is
  weighted 0 at its hip … 1 at its farthest point).
- GLBs: `public/models/{heikegani, heikegani_genji, heikegani_shogun}.glb`, loaded by `src/regions/monsters/enemyModels.js`;
  the builder is `heikeganiGlb` in `tidepool.js`.
- Rebuild: copy this folder to `tools/blender/work/codex/heikegani/` (the script writes its .blend and previews there) and
  run `blender --background --factory-startup --python build_heikegani.py`. The script is deterministic.
- **Captain Brineclaw** (the Tidepools' siege captain, 2026-10-21, approved 9/10 on the first round): `heikegani_brineclaw.glb`
  (variant key 3), built by `build_heikegani_brineclaw.py` on the soldier builder (brief `brief-brineclaw.md`): a wider,
  higher coral shell with a rolled lip, three thick legs a side, 1.5× claws on his own axle (tidepool.js crabGlbHook keys
  his hook by variant), long eye stalks, a scar. The soldiers' GLBs are byte-identical.
