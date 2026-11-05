# Tobi (ak-tobi-toy): Blender source (ROADMAP VL-2)

Akane Hamlet's apprentice, a young floppy-eared dog. Codex drew `sheet.png` and Claude picked it (the owner delegated the
pick). An Opus agent modelled and rigged him on Kazemaru's machinery (2026-11-02). The working folder
`tools/blender/work/codex/ak-tobi-toy/` is git-ignored.

- `build_ak-tobi-toy.py` (assembled from `src/p*.py` by `src/assemble.py`): the floppy ears are thick lofted paddles hanging
  over the headband.
- `rig_ak-tobi-toy.py`: the 37-bone rig, `lidTilt` 0.5236, the lash rolls on `lidU`, the ears on `ear_` → `earTip_` over
  the lobe half, the gi and the trousers. 32,922 triangles.
- **In the game**: `HERO_MODELS.ak_tobi` (`squint [0.12, -0.24]`, `earGain` 0.5, since an inward ear swing has no room;
  `shutLash`), in `ZONE_TOY.maple`.
- **Known**: in a blink, the far eye's lash flicks poke past the cheek edge from the 45° views (a passing frame).
