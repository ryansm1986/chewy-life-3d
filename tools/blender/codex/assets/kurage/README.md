# kurage (enemy series, ROADMAP EN-1)

Shiokaze Tidepools' kurage, built in Blender by an Opus agent from the owner's pick, Option B "Wind Chime"
(`concepts/sheet-B.png`; the concept brief is `concepts/concept-brief.md`). Approved by Claude at 9/10 after 4 rounds (the
tentacles reading as legs, the busy inside of the bell, the frill, the ink patches on the ribbons), 2026-10-20.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md`, with one exception:
  it floats, so every part's origin is (0, 0, 0) = **the centre of the bell's rim** (the game lifts it ~0.95 m).
- Parts: body (cap, loop, rim band, membrane, face), bell (the glass shell: drawn separately, see-through), core (the bulb
  on `glow` + its stem on `toon`; no ink hull), frill, arms, tentacles (tips on `glow`). The game merges all but the bell
  into one mesh and sways it on the GPU (`JELLY_HOOK` in `src/regions/monsters/tidepool.js`: weight = depth below the
  rim; glow on the `glow` faces and fading in down the tentacles).
- GLBs: `public/models/{kurage, kurage_ao, kurage_sakura}.glb`, loaded by `src/regions/monsters/enemyModels.js`; the
  builder is `kurageGlb` / `bellGeo` in `tidepool.js`.
- Rebuild: copy this folder to `tools/blender/work/codex/kurage/` (the script writes its .blend and previews there) and
  run `blender --background --factory-startup --python build_kurage.py`. The script is deterministic.
