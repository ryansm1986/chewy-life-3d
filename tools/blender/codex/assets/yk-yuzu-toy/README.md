# Yuzu (yk-yuzu-toy): Blender source (ROADMAP VL-2)

Yukimi Spa Village's bathkeeper, a tanuki in a yellow kimono and a white headband. Codex drew `sheet.png` and Claude
picked it (the owner delegated the pick). An Opus agent modelled and rigged her on Fuku's skeleton and Kome's lash-roll
lids (2026-11-02). The working folder `tools/blender/work/codex/yk-yuzu-toy/` is git-ignored.

- `build_yk-yuzu-toy.py`: the model.
- `rig_yk-yuzu-toy.py` (with `rig_lids.py`, a shut-angle parameter added): the 37-bone rig, `lidTilt` 0.253,
  `lidClose` 0.65 (her tall opening on a flat face: scanned 0.30-1.0 for the lash roll's worst lift). The wing flicks
  blend to 80% `head` at the tip. 32,402 triangles.
- **In the game**: `HERO_MODELS.yk_yuzu`, in `ZONE_TOY.onsen`.
  - `squint [0.13, -0.30]`.
  - A light `shutLash` crease on the dark mask.
  - `darkGrade [0.3, 8, 4, -10]` (Fuku's and Benji's: the mask stays brown).
- **Known**: in the squint the lid surface above the lash stands up to 4 mm proud (faint).
