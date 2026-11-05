# Ochiyo (ak-ochiyo-toy): Blender source (ROADMAP VL-2)

Akane Hamlet's tea master, a calico cat. Codex drew `sheet.png` and Claude picked it (the owner delegated the pick). An
Opus agent modelled and rigged her on Kome's machinery (2026-11-02). The working folder
`tools/blender/work/codex/ak-ochiyo-toy/` is git-ignored.

- `build_ak-ochiyo-toy.py`: the model; the ear rims are densified for the rig round.
- `rig_ak-ochiyo-toy.py` (with `rig_lids.py`): the 37-bone rig, `lidTilt` 0.515, the lash rolls on `lidU`. The apron and
  skirt share one hips-to-thigh field (0.86 at the hem). 33,528 triangles.
- **In the game**: `HERO_MODELS.ak_ochiyo`, in `ZONE_TOY.maple`.
  - `squint [0.08, -0.30]`.
  - `shutLashColor ['#2a1a1a', '#d8ccd4']`: a light ∪ crease on her dark-patch eye.
  - `darkGrade` for the patch.
