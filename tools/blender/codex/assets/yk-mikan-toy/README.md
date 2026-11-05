# Mikan (yk-mikan-toy): Blender source (ROADMAP VL-2)

Yukimi Spa Village's shopkeeper, an orange fox in a red beret and a bow scarf. Codex drew `sheet.png` and Claude picked
it (the owner delegated the pick). An Opus agent modelled and rigged her on Kaede's machinery (2026-11-02). The working
folder `tools/blender/work/codex/yk-mikan-toy/` is git-ignored.

- `build_yk-mikan-toy.py`: the model; the beret sits forward on the crown as on the sheet, the scarf loops are flat
  teardrops. 29,924 triangles.
- `rig_yk-mikan-toy.py` (with `rig_lids.py`; `rigall.sh` runs it all): the 37-bone rig, `lidTilt` 0.5236, the lid hinge
  at 0.108 m and 1.8 cm low for her tall opening; the wing flick a uniform 50% `head` past its first 30%. 33,554
  triangles.
- **In the game**: `HERO_MODELS.yk_mikan`, in `ZONE_TOY.onsen`; `squint [0.14, -0.24]`; the `shutLash` ∪ lowered
  (y -0.07) onto her shut lash.
- **Known**: faint vertical streaks on the shut lid and corner slivers at mid-blink, as on Kaede.
