# Granny Shirayuki (yk-shirayuki-toy): Blender source (ROADMAP VL-2)

Yukimi Spa Village's elder, a white bunny in a blue haori with a red kerchief. Codex drew `sheet.png` and Claude picked
it (the owner delegated the pick). An Opus agent modelled and rigged her (2026-11-02). The working folder
`tools/blender/work/codex/yk-shirayuki-toy/` is git-ignored.

- `build_yk-shirayuki-toy.py`: the model; in rig mode the eye-hole rim roll takes the skin's colour and normals and the
  contact shade under the lash is dropped (no grey ring on white fur).
- `rig_yk-shirayuki-toy.py` (with `rig_lids.py`): the 37-bone rig, `lidTilt` 0.3888. The shut upper lid overlaps the
  skin about 2 mm past the upper rim on 3 mm rows; the whole lash rides `lidU` (`LASH_MODE` keeps two rejected
  head-blend variants). 32,832 triangles.
- **In the game**: `HERO_MODELS.yk_shirayuki`, in `ZONE_TOY.onsen`; `squint [0.12, -0.26]`; the `shutLash` ∪, laid on
  the shut lid by `hugSkin`.
- **Known**: the eye-hole edge shows faintly at mid-blink (b85).
