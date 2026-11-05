# Inaho (ak-inaho-toy): Blender source (ROADMAP VL-2)

Akane Hamlet's farmer, a bunny in a straw hat and overalls. Codex drew `sheet.png` and Claude picked it (the owner
delegated the pick). An Opus agent modelled and rigged him on Chiku's machinery (2026-11-02). The working folder
`tools/blender/work/codex/ak-inaho-toy/` is git-ignored.

- `build_ak-inaho-toy.py`: the straw hat is set back 20° with a trimmed brim (1.24 W), so his eyes read under it from the
  45° camera. The skull is trimmed inside the hat.
- `rig_ak-inaho-toy.py`: the 37-bone rig, `lidTilt` 0.3968, the ears rigid below the crown and bending above it, the hat
  rigid on the head. 33,724 triangles.
- **In the game**: `HERO_MODELS.ak_inaho` (`squint [0.20, -0.24]`, `shutLash`), in `ZONE_TOY.maple`.
