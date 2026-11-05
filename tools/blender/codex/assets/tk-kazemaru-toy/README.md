# Master Kazemaru (tk-kazemaru-toy): Blender source (ROADMAP VL-2)

Takemori Village's sensei and Poe's old teacher, an arctic-white fox. Codex drew `sheet.png` (2026-11-02) and Claude picked
it; the owner delegated the pick. An Opus agent modelled and rigged him by script under Claude's measured feedback, on the
Kitsune build's machinery. The working folder `tools/blender/work/codex/tk-kazemaru-toy/` is git-ignored.

- `build_tk-kazemaru-toy.py` is assembled by `python src/assemble.py` from `src/p*.py`; edit those, not the assembled file.
  - `p6_ears.py`: the ears are thick rounded pyramids, a stack of D-shaped rings, rising from behind the headband.
  - `p8_paint.py`: the atlas.
- `rig_tk-kazemaru-toy.py`: runs the build in rig mode, then adds:
  - the 37-bone rig;
  - the lid shells on hinges tilted 30° (`lidTilt` 0.5236);
  - the 3D lash rolls `Kaze_lash_L/R` on `lidU` (the rig paints the skin with no lash);
  - the mouth;
  - the weights.
  `rig_tests.py` / `rig_checks.py` make the test sheets and numbers.

**In the game**: `HERO_MODELS.tk_kazemaru` (`src/actors/heroModels.js`), in `ZONE_TOY.bamboo`.
- `squint [0.12, -0.24]`: judged in the game. At 0.30 the lid showed pale patches.
- `earGain 0.4`, `wave: 'out'`, `noNightcap`.

**Review rounds**:
- **Model, 3, the ears**: a cupped shell read as a scoop and a spike from 45°; a thin wedge read too slim from the side;
  thick pyramids worked.
- **Rig, 4, lids judged in the game** (`tools/qa/villager-face.mjs`, `ID=tk_kazemaru`):
  - an outline painted on the skin left a ring round the closed eye, so the lash was moved onto a 3D roll on `lidU`;
  - the lid paint is now computed per side, blush on;
  - the shut lash is thicker.
- **Known**: a faint pale lid on his right eye at the 0.85 blink frame, as on Rosie, a passing frame.

Export: `blender --background tk-kazemaru-toy_rig.blend --python ../../hero_export.py -- --out export --name tk_kazemaru_toy --height 1.26`,
then `install_rig.py`. 33,932 triangles.
