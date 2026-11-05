# Okami Yae (ak-yae-toy): Blender source (ROADMAP VL-2)

Akane Hamlet's innkeeper, a bear. Codex drew `sheet.png` and Claude picked it (the owner delegated the pick). An Opus
agent modelled and rigged her on Takumi's machinery, with Fuku's apron weights (2026-11-02). The working folder
`tools/blender/work/codex/ak-yae-toy/` is git-ignored.

- `build_ak-yae-toy.py`: the model; the head is fitted to her dome-shaped sheet head.
- `rig_ak-yae-toy.py` (with `rig_lids.py`): the 37-bone rig, `lidTilt` 0.266, the lid hinge 95 mm behind the eye (from a
  hinge search), the lash rolls on `lidU`, the apron and kimono weights. 32,670 triangles.
- **In the game**: `HERO_MODELS.ak_yae` (`squint [0.15, -0.26]`, `shutLash`, `wave: 'out'`), in `ZONE_TOY.maple`.
