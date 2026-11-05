# Okami Shinju (sk-shinju-toy): Blender source (ROADMAP VL-2)

Shiokaze Port's innkeeper, a cream duck in a blue kimono. Codex drew `sheet.png` and Claude picked it (the owner
delegated the pick). An Opus agent modelled and rigged her (2026-11-02). The working folder
`tools/blender/work/codex/sk-shinju-toy/` is git-ignored.

- `build_sk-shinju-toy.py`: the model, with the plump fan tail (three scallops) and a deeper lash roll.
- `rig_sk-shinju-toy.py` (with `rig_lids.py`): the 37-bone rig, `lidTilt` 0.393. The lower bill is rigid on `jaw` (its
  hidden faces painted as the palate and mouth floor, a tongue on the jaw); `lip_*` and the ear bones are unweighted (no
  ears). The shut lid takes the skin's paint and shut-pose normals and overlaps the rim from 0.45 rad. 33,934 triangles.
- **In the game**: `HERO_MODELS.sk_shinju` (`earGain 0`), in `ZONE_TOY.tidepool`; `squint [0.15, -0.28]`; the
  `shutLash` ∪.
- **Known**: a pale lid disc at mid-blink (b85): a rigid lid on a 7 cm hinge can't match a 25 cm face curve at both 0.85
  and shut; a deep hinge with `lidClose` (as Fuku) would fix it.
