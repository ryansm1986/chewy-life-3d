# Okami Fuku (tk-fuku-toy): Blender source (ROADMAP VL-2)

The innkeeper of the Sasanoha Inn in Takemori Village, a tanuki. Codex drew `sheet.png` (2026-11-02) and Claude picked it;
the owner delegated the pick. An Opus agent modelled and rigged her by script on Tanu's machinery. The working folder
`tools/blender/work/codex/tk-fuku-toy/` is git-ignored.

- `build_tk-fuku-toy.py`: the deterministic model build, with the rig-mode skin paint (no upper lash on the skin).
- `rig_tk-fuku-toy.py`:
  - the 37-bone rig;
  - the mouth;
  - the weights: the skirt and apron follow the thighs, the tail pivots behind the obi bow;
  - the lids. **The upper lid is built to shut at 0.479 rad (`lidClose`)**, hinged at the eyeball's centre of curvature
    (0.21 m behind it), so it hugs her upward-facing eyes. The lash and its flicks ride the lid's rows. A light shut crease
    fades in past 0.62 of `lidClose`.

**In the game**: `HERO_MODELS.tk_fuku`, in `ZONE_TOY.bamboo`.
- `lidTilt 0.255`, `lidClose 0.479`, `squint [0.11, -0.24]`.
- Tanu's `darkGrade [0.3, 8, 4, -10]`.

**Review rounds**:
- **Model, 2**: the crown kept free of orange; the muzzle a soft bean.
- **Rig, 2, lids judged in the game** (`tools/qa/villager-face.mjs`, `ID=tk_fuku CLOSE=0.479`): the pale squint line, and
  the flicks left on the mask.

33,880 triangles.
