# Benji (ak-benji-toy): Blender source (ROADMAP VL-2)

Akane Hamlet's shopkeeper, a tanuki with a maple leaf on his head. Codex drew `sheet.png` and Claude picked it (the owner
delegated the pick). An Opus agent modelled and rigged him on Fuku's machinery (2026-11-02). The working folder
`tools/blender/work/codex/ak-benji-toy/` is git-ignored.

- `build_ak-benji-toy.py`: the model, with the rig-round fixes (the tail's dark cap on the outer 20%, a thicker cupped leaf,
  black lash rolls).
- `rig_ak-benji-toy.py`: the 37-bone rig, `lidTilt` 0.318. **The lids shut at `lidClose` 0.544** (Fuku's hinge at the eye's
  centre of curvature). The lash wing rides 40% on `lidU`. The bag and leaf are rigid. 33,862 triangles.
- **In the game**: `HERO_MODELS.ak_benji`, in `ZONE_TOY.maple`.
  - `squint [0.14, -0.24]`.
  - `shutLash` with a light crease (`shutLashColor`), since the closed eye sits on the dark mask.
  - Tanu's `darkGrade`.
