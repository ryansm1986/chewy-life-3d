# sazae-oni (enemy series, ROADMAP EN-1)

Built in Blender by an Opus agent from the pick, Option A "Turban Oni" (`concepts/sheet-A.png`; the concept brief is
`concepts/concept-brief.md`). Approved by Claude at 9/10 after 2 round(s) (octagonal spine collars and a whole-spine glow on the Hotaru: now round collars, glowing tips only), 2026-10-21.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them). The model brief: `brief.md`.
- Parts: body (shell + foot), spines (they bristle ×1.12), head (its pivot in the shell's mouth, (0, −0.32, 0.30) Blender: scaled 0.12 → 1 to pop out; tidepool.js reads it as HP), lid (the operculum, shown while shut). Glow by colour: the Hotaru's pale-cyan tips and plankton (sazaeMat). The game kind id is sazaeOni.
- GLBs in `public/models/`, loaded by `src/regions/monsters/enemyModels.js` (`ENEMY_MODELS`); the builder: `src/dungeon/zoneMonsters/tidepool.js (buildSazae)`.
- Rebuild: copy this folder to `tools/blender/work/codex/sazae-oni/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_sazae-oni.py`. The script is deterministic.
