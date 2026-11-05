# Old Captain Kaizo (sk-kaizo-toy): Blender source (ROADMAP VL-2)

Shiokaze Port's elder, a grey dog with a red bandana. Codex drew `sheet.png` and Claude picked it (the owner delegated the
pick). An Opus agent modelled and rigged him on Takumi's machinery (2026-11-02). The working folder
`tools/blender/work/codex/sk-kaizo-toy/` is git-ignored.

- `build_sk-kaizo-toy.py`: the folded triangular dog ears (a thick flap with a 140° soft fold, turned 28° out), the
  kerchief petals.
- `rig_sk-kaizo-toy.py` (with `rig_lids.py`): the 37-bone rig. The lids are hinged on the eyes' 23° upward axis, so
  `lidClose` 0.80 and `lidTilt` 0.15. The folded flap rides `earTip`. 33,810 triangles.
- **In the game**: `HERO_MODELS.sk_kaizo` (`squint [0.10, -0.30]`, `earGain` 0.2, `shutLash`), in `ZONE_TOY.tidepool`.
