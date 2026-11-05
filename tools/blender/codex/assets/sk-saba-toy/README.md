# Saba (sk-saba-toy): Blender source (ROADMAP VL-2)

Shiokaze Port's fishmonger, a grey tabby cat with a patch over her right eye. Codex drew `sheet.png` and Claude picked it
(the owner delegated the pick). An Opus agent modelled and rigged her on Kome's machinery (2026-11-02). The working folder
`tools/blender/work/codex/sk-saba-toy/` is git-ignored.

- `build_sk-saba-toy.py`: the bandana is thinned and rounded at the front.
- `rig_sk-saba-toy.py` (with `rig_lids.py`): the 37-bone rig, `lidTilt` 0.449.
  - The lower lid takes the cheek's own paint, per side.
  - The lens curls under the rim at the inner-lower corner, so no teal wedge shows when shut.
  - 33,286 triangles.
- **In the game**: `HERO_MODELS.sk_saba`, in `ZONE_TOY.tidepool`.
  - `squint [0.12, -0.20]`, judged in the game.
  - A light ∪ crease on the patch eye.
  - `darkGrade`.
