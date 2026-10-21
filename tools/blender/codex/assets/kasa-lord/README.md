# kasa-lord (enemy series, ROADMAP EN-1)

Lord Karakasa, the Fox Shrine's boss, built in Blender by the Opus agent who built the approved kasa-obake, from the
Lord Karakasa callout on the kasa-obake's sheet (`../kasa-obake/concepts/sheet-A.png`). Approved by Claude at 9/10 on the
first round, 2026-10-21.

- One rigid part, `body` (dungeon/monsters.js glbGeo merges it on BUILD.kasa's lord material: the tongue self-lights,
  LUM_CAP). The game scales it ×2.6 and spins it whole for his spin attack. Brief: `brief-lord.md`.
- GLB: `public/models/kasa-lord.glb` (`ENEMY_MODELS.kasaLord`).
- Rebuild: `build_kasa-lord.py` imports `build_kasa-obake.py` (copy both into `tools/blender/work/codex/kasa-obake/`), then
  `blender --background --factory-startup --python build_kasa-lord.py`.
