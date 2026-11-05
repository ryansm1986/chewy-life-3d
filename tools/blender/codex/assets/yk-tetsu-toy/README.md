# Tetsu (yk-tetsu-toy): Blender source (ROADMAP VL-2)

Yukimi Spa Village's smith, a big dark-brown bear in a leather apron. Codex drew `sheet.png` and Claude picked it (the
owner delegated the pick). An Opus agent modelled and rigged him on Funaki's machinery (2026-11-02). The working folder
`tools/blender/work/codex/yk-tetsu-toy/` is git-ignored.

- `build_yk-tetsu-toy.py`: the lit lower muzzle, the flatter scarf knot, the clean bib edge.
- `rig_yk-tetsu-toy.py` (with `rig_lids.py`): the 37-bone rig, `lidTilt` 0.326, `LID_B` 0.115 for his bigger eyes, the lash
  rolls on `lidU`. 33,930 triangles.
- **In the game**: `HERO_MODELS.yk_tetsu`, in `ZONE_TOY.onsen`.
  - `squint [0.12, -0.26]`.
  - A light `shutLash` crease (dark fur).
  - `darkGrade [0.55, 5, 8, -7]`: it keeps the fur dark brown, not maroon.
