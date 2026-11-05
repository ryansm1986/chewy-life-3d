# Nami (sk-nami-toy): Blender source (ROADMAP VL-2)

Shiokaze Port's shopkeeper, a white bunny with a pink flower. Codex drew `sheet.png` and Claude picked it (the owner
delegated the pick). An Opus agent modelled and rigged her (2026-11-02). The working folder
`tools/blender/work/codex/sk-nami-toy/` is git-ignored.

- `build_sk-nami-toy.py`: the model; in rig mode the eye-hole rim roll takes the skin's colour and normals and the
  contact shade under the lash is dropped (no grey ring on white fur).
- `rig_sk-nami-toy.py` (with `rig_lids.py`): the 37-bone rig, `lidTilt` 0.3697. The shut upper lid overlaps the skin
  0.2 eye radii past the rim, painted and shaded as the skin at the shut pose; the outer lash blends up to 55% to `head`.
  33,022 triangles.
- **In the game**: `HERO_MODELS.sk_nami`, in `ZONE_TOY.tidepool`; `squint [0.20, -0.24]`; the `shutLash` ∪, laid on
  the shut lid by `hugSkin`.
- **Known**: a faint lid disc can show mid-blink (b85) on her right eye.
