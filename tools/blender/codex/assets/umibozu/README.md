# umibozu (boss, ROADMAP EN-1)

Umibōzu, the Shiokaze Tidepools' boss, built in Blender by an Opus agent from the pick, Option A "Sleepy Sea Monk"
(`concepts/sheet-A.png`). Approved by Claude at 9/10 after 1 round plus a colour pass (the body read navy in the game:
lifted to sea-teal #1f7480), 2026-10-21.

- Contract: `.claude/skills/codex-blender/templates/boss-model-contract.md` on top of the enemy contract (flat rigid named parts, origins at
  the pivots, model units; z 0 = the waterline).
- Parts: body (body, juzu, gold bead, kelp sprout), eyeL / eyeR (on the game's unlit glow material, whites boosted),
  pupilL / pupilR (the game slides them), mouthSmile / mouthOpen / cheeks. Wired in `buildUmibozuGlb`
  (`src/regions/bosses/umibozu.js`); the water sheet uses the GLB body.
- The hand: `public/models/umibozu-hand.glb` (metres, wrist at the origin, fingers +z, palm −y, thumb +x), mirrored for
  the other hand by `handGlb` in `fx_umibozu.js`; the rubber-hose arms stay procedural.
- Rebuild: copy this folder to `tools/blender/work/codex/umibozu/` and run
  `blender --background --factory-startup --python build_umibozu.py`. The script is deterministic.
