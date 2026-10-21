# tengu-master (boss, ROADMAP EN-1) + karasu-kozo (his Crow Disciple)

Master Tengu, the Bamboo Grove's boss, and his crow-tengu disciple add, built in Blender by an Opus agent from the pick,
Option A "Wind Master" (`concepts/sheet-A.png`, the disciple from its callout). Approved by Claude at 9/10 after 2
rounds (more of the cream robe front, a hanging sleeve instead of a sack, the disciple's horn-like tufts), 2026-10-21.

- Contract: `.claude/skills/codex-blender/templates/boss-model-contract.md` (flat rigid named parts on the kit's pivots, model units).
- Master Tengu parts: body, head, jaw, lids, fanArm, wingL, wingR + the `fanTip` marker (an empty: the gust origin).
  `glbTengu` in `src/regions/bosses/tengu.js` swaps each part's geometry onto the kit's group (same pivots) and moves
  the fanTip to the marker. The boss shader (TENGU_OUT + LUM_CAP) gives the dark feathers their indigo sheen.
- Disciple: `karasu-kozo.glb` (cream robe) / `karasu-kozo_blue.glb`, parts body, wingL, wingR (swapped in `buildKozo`).
- Rebuild: copy this folder to `tools/blender/work/codex/tengu-master/` and run
  `blender --background --factory-startup --python build_tengu-master.py -- --what all`.
