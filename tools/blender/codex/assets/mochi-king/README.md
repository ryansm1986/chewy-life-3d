# mochi-king (enemy series, ROADMAP EN-1)

King Mochi the Squishy, the Mossy Burrow's boss, built in Blender by the Opus agent who built the approved mochi slime,
from the King Mochi callout on the mochi slime's sheet (`concepts/sheet-A.png`). Approved by Claude at 9/10 after 2
rounds (the ermine read as two horn-like lumps: now a collar band; the dome read white: warmer pink), 2026-10-21.

- One rigid part, `body` (the Burrow's bosses are single meshes: dungeon/monsters.js glbGeo merges it on BUILD.mochi's
  king material, LUM_CAP). The game scales it ×3. Brief: `brief-king.md`.
- GLB: `public/models/mochi-king.glb` (`ENEMY_MODELS.mochiKing`).
- Rebuild: `build_mochi-king.py` is assembled from the mochi slime's script plus `king_tail.py` by `assemble_king.py`
  (copy this folder and `../mochi-slime/` to `tools/blender/work/codex/mochi-slime/`), then
  `blender --background --factory-startup --python build_mochi-king.py`.
