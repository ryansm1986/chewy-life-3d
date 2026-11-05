# Kaito (sk-kaito-toy): Blender source (ROADMAP VL-2)

Shiokaze Port's deckhand (Funaki's), an orange fox in a sailor shirt and a blue scarf. Codex drew `sheet.png` and Claude
picked it (the owner delegated the pick). An Opus agent modelled and rigged him on Kaede's machinery (2026-11-02). The
working folder `tools/blender/work/codex/sk-kaito-toy/` is git-ignored.

- `build_sk-kaito-toy.py`: the model (egg tail, dense ears); the rebuilt `public/models/sk-kaito-toy.glb` matches it.
- `rig_sk-kaito-toy.py` (with `rig_lids.py`): the 37-bone rig, `lidTilt` 0.5236 on Kaede's 8 cm hinge; the lash roll and
  wing 100% on `lidU` (the painted wing dropped, so the shut eye is one line); the shut lid overlaps the rim 6 mm, its
  corner columns lowered up to 0.06 rad. 33,526 triangles.
- **In the game**: `HERO_MODELS.sk_kaito`, in `ZONE_TOY.tidepool`; `squint [0.12, -0.24]`; the `shutLash` ∪ lowered
  (y -0.068) onto his shut lash.
- **Known**: tiny white flecks at the shut eye's outer corners and a lid edge at mid-blink (his opening is tall for an 8 cm
  hinge; a longer hinge with `lidClose` would fix it).
