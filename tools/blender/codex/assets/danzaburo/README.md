# danzaburo (boss, ROADMAP EN-1)

Danzaburō the Leaf-Shifter, Momiji Hollow's boss, with his boulder and kettle forms, built in Blender by an Opus agent from
the pick, Option A "Drum Belly" (`concepts/sheet-A.png`). Approved by Claude at 9/10 after 2 rounds (a bigger leaf
standing up on the hat, the hat's golden straw, the spout straight ahead), 2026-10-21.

- Contract: `.claude/skills/codex-blender/templates/boss-model-contract.md`. Parts: body, belly, tail, armL (the flask), armR, head, jaw,
  blush, hat, leaf; rock, rockLeaf (the boulder form, rock's pivot the boulder centre: it rolls about it); kettle, lid,
  khead, kLeaf (the kettle form); markers bellyTip, spout.
- `glbDanza` in `src/regions/bosses/tanuki.js` moves the kit's groups to these pivots (relative to their parents), clears
  the old rest rotations (baked into the GLB), swaps each group's geometry, re-parents the kettle leaf onto the lid and
  reads both markers; animate counter-rotates the hat (0.8× the head's back tilt) so it doesn't sink into his back.
- Rebuild: copy this folder to `tools/blender/work/codex/danzaburo/` and run
  `blender --background --factory-startup --python build_danzaburo.py`. The script is deterministic.
