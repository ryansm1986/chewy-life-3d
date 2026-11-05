# Hokuto (yk-hokuto-toy): Blender source (ROADMAP VL-2)

Yukimi Spa Village's smith's apprentice (Tetsu's), a panda in a red headband and blue overalls. Codex drew `sheet.png`
and Claude picked it (the owner delegated the pick). An Opus agent modelled and rigged him on Funaki's build and Sasa's
patches (2026-11-02). The working folder `tools/blender/work/codex/yk-hokuto-toy/` is git-ignored.

- `build_yk-hokuto-toy.py`: the model; `EYE_MASK` (on in rig mode) keeps the muzzle's swell out of the eye openings so
  a rigid lid can sweep them; `REFINE_ADD` 520 in rig mode for clean toon bands.
- `rig_yk-hokuto-toy.py` (with `rig_lids.py`): the 37-bone rig, `lidTilt` 0.251, `lidClose` 0.42 (as Fuku and Yuzu); the
  lid takes the patch's dark paint per point; the lash rides `lidU` fully. 33,730 triangles.
- **In the game**: `HERO_MODELS.yk_hokuto`, in `ZONE_TOY.onsen`.
  - `squint [0.12, -0.28]`.
  - A light `shutLash` crease on the dark patches.
  - `darkGrade [1, -4, 14, -9]` (Sasa's).
- **Known**: the shut lash keeps its arch, so two small dark ticks show at the patch's lower corners; a raised arm past
  about 2.4 hides behind his big head.
