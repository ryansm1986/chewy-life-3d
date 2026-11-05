# Funaki (sk-funaki-toy): Blender source (ROADMAP VL-2)

Shiokaze Port's boatwright, a big brown bear. Codex drew `sheet.png` and Claude picked it (the owner delegated the
pick). An Opus agent modelled and rigged him on Takumi's machinery (2026-11-02). The working folder
`tools/blender/work/codex/sk-funaki-toy/` is git-ignored.

- `build_sk-funaki-toy.py`: the model. The approved round has the cheek corners rounded about 0.02 W, and the pouch on his
  right hip, turned 20° to the front.
- `rig_sk-funaki-toy.py` (with `rig_lids.py`): the 37-bone rig, `lidTilt` 0.292, the 3D lash rolls on `lidU`, the mouth
  (a U smile), the weights. Export with `--no-outline eye,tongue,mouth,lid,lash`. 33,936 triangles.
- **In the game**: `HERO_MODELS.sk_funaki` (`squint [0.20, -0.30]`, the shared `shutLash` ∪), in `ZONE_TOY.tidepool`.
