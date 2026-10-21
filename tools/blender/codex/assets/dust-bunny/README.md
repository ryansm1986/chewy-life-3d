# dust-bunny (enemy series, ROADMAP EN-1)

Built in Blender by an Opus agent from the pick, Option A "Fluff Ball" (`concepts/sheet-A.png`; the concept brief is
`concepts/concept-brief.md`). Approved by Claude at 9/10 after 2 round(s) (a smooth blob with a big forelock: now 14 distinct round puffs, a small fringe, round cheeks, bulb ears), 2026-10-21.

- The contract every enemy follows: `.claude/skills/codex-blender/templates/enemy-model-contract.md` (vertex colours only,
  rigid named parts with their origins at the pivots, no rig; the Horde instances them). The model brief: `brief.md`.
- One rigid part, body (dungeon/monsters.js glbGeo; with a GLB the game uses one model per variant, not the procedural random layouts). The game kind id is dustbunny.
- GLBs in `public/models/`, loaded by `src/regions/monsters/enemyModels.js` (`ENEMY_MODELS`); the builder: `src/dungeon/monsters.js (BUILD.dustbunny, buildMonster)`.
- Rebuild: copy this folder to `tools/blender/work/codex/dust-bunny/` (the script writes its .blend and previews there) and run
  `blender --background --factory-startup --python build_dust-bunny.py`. The script is deterministic.
