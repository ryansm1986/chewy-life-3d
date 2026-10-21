# tsurara (enemy series, ROADMAP EN-1)

Built in Blender by an Opus agent from the pick, Option A "Icicle Wisp" (`concepts/sheet-A.png`; the concept brief is
`concepts/concept-brief.md`). Approved by Claude at 9/10 after 3 round(s) (flat hair slabs with cream blotches and a cap seam, a bald head top, flipper then blade arms, a stalk neck), 2026-10-21.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them). The model brief: `brief.md`.
- Parts: body (bottom at z 0; the game floats it 0.42 m), crown (hair + crystals, pivot the head centre (0, 0.026, 0.497) Blender), arms (shoulder line (0, −0.02, 0.285)), tail (curl root). Glow by colour: the cyan eyes and crystals (onsen.js TS_GLOW); the hair is kept out of the glow range.
- GLBs in `public/models/`, loaded by `src/regions/monsters/enemyModels.js` (`ENEMY_MODELS`); the builder: `src/regions/monsters/onsen.js (buildTsurara)`.
- Rebuild: copy this folder to `tools/blender/work/codex/tsurara/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_tsurara.py`. The script is deterministic.
