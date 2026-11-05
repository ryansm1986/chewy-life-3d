# Okami Tsubaki (yk-tsubaki-toy): Blender source (ROADMAP VL-2)

Yukimi Spa Village's ryokan proprietress, a dark cat with a cream patch over her right eye, in a crimson kimono with a gold
obi and a cream apron. Codex drew `sheet.png` and Claude picked it (the owner delegated the pick). An Opus agent modelled
and rigged her on Ochiyo's (and Kome's) build (2026-11-02). The working folder `tools/blender/work/codex/yk-tsubaki-toy/`
is git-ignored.

- `build_yk-tsubaki-toy.py`: the model. In rig mode the cream patch continues across the hidden eye opening as one
  smooth curve tangent to the face's border (the shut lid takes the skin's colour under it at the shut pose), and the lids
  never take the muzzle's white.
- `rig_yk-tsubaki-toy.py` (with `rig_lids.py`): the 37-bone rig, `lidTilt` 0.532; the lids keep 5 mm clear of the lens
  (tapering to 0.6 mm at the upper rim); the lash rides `lidU` fully; the lid normals come from the skin field averaged
  0.85 to shut. 33,394 triangles.
- **In the game**: `HERO_MODELS.yk_tsubaki`, in `ZONE_TOY.onsen`.
  - `squint [0.08, -0.30]`.
  - A light `shutLash` crease on both eyes.
  - `darkGrade [0.85, -2, 8, -4, 0.12]`, gated by chroma: the plum fur reads charcoal, and the wine skirt keeps its colour.
- **Known**: a faint dark lid disc at mid-blink.
