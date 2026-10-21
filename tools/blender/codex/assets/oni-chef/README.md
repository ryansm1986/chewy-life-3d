# oni-chef (enemy series, ROADMAP EN-1)

Oni Chef Gorobei, the Oni Kitchen's boss, built in Blender by the Opus agent who built the approved oni-imp, from the
Oni Chef callout on the oni-imp's sheet (`../oni-imp/concepts/sheet-A.png`). Approved by Claude at 9/10 after 2 rounds
(the moustache read as a beard band: now a parted handlebar; the apron read as a nappy: now a bib apron), 2026-10-21.

- One rigid part, `body` (dungeon/monsters.js glbGeo merges it on BUILD.oniChef's material, LUM_CAP). The game scales it
  ×2.4. Brief: `brief-chef.md`.
- GLB: `public/models/oni-chef.glb` (`ENEMY_MODELS.oniChef`).
- Rebuild: copy this folder to `tools/blender/work/codex/oni-imp/` and run
  `blender --background --factory-startup --python build_oni-chef.py`. The script is deterministic.
