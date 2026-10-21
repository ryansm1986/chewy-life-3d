# oni-imp (enemy series, ROADMAP EN-1)

Built in Blender by an Opus agent from the pick, Option A "Club Imp" (`concepts/sheet-A.png`; the concept brief is
`concepts/concept-brief.md`). Approved by Claude at 9/10 after 2 round(s) (smeary raised tiger stripes and needle ear tips: now flush bold wedges, ball-tipped ears, bigger eyes), 2026-10-21.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them). The model brief: `brief.md`.
- One rigid part, body, the club included (dungeon/monsters.js glbGeo merges it on BUILD.oni's material). The game kind id is oni; Oni Chef (oniChef) is a separate model.
- GLBs in `public/models/`, loaded by `src/regions/monsters/enemyModels.js` (`ENEMY_MODELS`); the builder: `src/dungeon/monsters.js (BUILD.oni, buildMonster)`.
- Rebuild: copy this folder to `tools/blender/work/codex/oni-imp/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_oni-imp.py`. The script is deterministic.
