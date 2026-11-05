# Elder Kaede (ak-kaede-toy): Blender source (ROADMAP VL-2)

Akane Hamlet's elder, a fox. Codex drew `sheet.png` and Claude picked it (the owner delegated the pick). An Opus agent
modelled and rigged her on Kazemaru's machinery (2026-11-02). The working folder `tools/blender/work/codex/ak-kaede-toy/`
is git-ignored.

- `build_ak-kaede-toy.py` (assembled from `src/p*.py`): the ears are thick pyramids with a big pink triangle; the cheek
  tufts.
- `rig_ak-kaede-toy.py`: the 37-bone rig, `lidTilt` 0.5236, a lid hinge radius of 0.08 m (her smaller opening), the lash
  rolls on `lidU`, the per-side lid paint. 33,462 triangles.
- **Fixed in the source**: the ear loop overwrote the head's radial origin `O` (shared with Kazemaru's build), which
  painted the closed lids cream.
- **In the game**: `HERO_MODELS.ak_kaede` (`squint [0.12, -0.24]`, `shutLash`), in `ZONE_TOY.maple`.
