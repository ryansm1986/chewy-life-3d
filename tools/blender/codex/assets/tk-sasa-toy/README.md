# Grandma Sasa (tk-sasa-toy): Blender source (ROADMAP VL-2)

Takemori Village's elder, a giant panda. Codex drew `sheet.png` (2026-11-02) and Claude picked it; the owner delegated the
pick. An Opus agent modelled and rigged her by script under Claude's measured feedback, on Pan's machinery (the other
panda). The working folder `tools/blender/work/codex/tk-sasa-toy/` is git-ignored.

- `build_tk-sasa-toy.py`: the deterministic model build. It exports `public/models/tk-sasa-toy.glb`; the game doesn't
  load it, only the rig.
- `rig_tk-sasa-toy.py` (with `rig_lids.py`): runs the build in rig mode, then adds:
  - the 37-bone hero rig;
  - the lid shells on hinges tilted 31.5° (`lidTilt` 0.55);
  - the lash ribbons on `lidU`;
  - the mouth cut, cavity and tongue;
  - the weights.
  It saves `tk-sasa-toy_rig.blend`. `rig_tests.py` renders the poses, face and toon sheets.
- `brief.md`, `measure.md`, `joints*.json`: the brief, the sheet measurements and the joints.

**In the game**: `HERO_MODELS.tk_sasa` (`src/actors/heroModels.js`), in `ZONE_TOY.bamboo`. `ZoneVillager` takes the rig
when it's loaded; otherwise it falls back to the Toybox kit.
- `darkGrade [1, -4, 14, -9]`: Pan's, so her black patches stay neutral rather than violet in the grade.
- `squint [0.12, -0.30]`: judged in the game. Higher values read grumpy with this lid.
- `lidTilt 0.55`, `earGain 0` (stiff panda ears), `wave: 'out'`, `noNightcap`.

**Review rounds**:
- **Model, 2**: the skirt was lightened, because dark moss crushes to black in the grade; the nose, brows and eye patches
  were softened.
- **Rig, 2, lids judged in the game** (`tools/qa/villager-face.mjs`, `ID=tk_sasa`): the shut eye's light lilac ∪ crease
  is needed on the dark patch; the lash rides on `lidU` so there's no double line at the squint.

Export: `blender --background tk-sasa-toy_rig.blend --python ../../hero_export.py -- --out export --name tk_sasa_toy --height 1.0`,
then `python tools/blender/codex/install_rig.py <dir>/export tk_sasa_toy`. 33,904 triangles.
