# Toybox Kitsune (kitsune-toy): Blender source

Kitsune, the shrine-keeper fox of Blossom Hollow (`public/rigs/kitsune_toy.*`), built by an Opus agent under Claude's direction (ROADMAP VL-1,
the toybox-character skill). The blueprint is `sheet.png`, the Toybox sheet the owner approved on 2026-10-02 for the
procedural kit; no new concepts were drawn. The shared briefs are `../villager-toy-common.md` (model) and
`../villager-rig-common.md` (rig); `brief.md` is Kitsune's own, `direction/feedback-*.md` every director round.

- `build_kitsune-toy.py`: the deterministic model build (it writes `public/models/kitsune-toy.glb` and the atlas; a rebuild
  reproduces the same bytes). `measure.md` has the measured sheet targets and the model's numbers per round.
- `rig_kitsune-toy.py`: runs the build in rig mode, then adds the 37-bone hero rig, the lid shells on tilted hinges, the
  mouth cut, cavity and tongue, and the weights. `rig_tests.py` renders the pose, face and toon sheets.
- History: 4 model rounds (paper ears, then a pear head and a smaller chin), 3 rig rounds; the build is assembled by src/assemble.py from src/p*.py.

Rebuild (from a copy of this folder, so the outputs don't land in git):
```bash
cp -r tools/blender/codex/assets/kitsune-toy tools/blender/work/codex/kitsune-rebuild && cd tools/blender/work/codex/kitsune-rebuild
blender --background --factory-startup --python rig_kitsune-toy.py
blender --background kitsune-toy_rig.blend --python ../../../codex/hero_export.py -- --out export --name kitsune_toy --height 1.254
python ../../../codex/install_rig.py export kitsune_toy
```
(The scripts carry absolute paths to their original work folder; point them at the copy first.)

**In the game** (`HERO_MODELS.kitsune` in `src/actors/heroModels.js`; game.js hands Kitsune's Villager this rig when it's
loaded, else the Toybox kit builds Kitsune as before): lidTilt 0.5236, the default squint (her "knowing" look); `wave: 'out'` (big heads on short arms hide the paws when
they wave inward). Judge lids in the game, not only in Blender: `tools/qa/villager-face.mjs` (`ID=kitsune`) renders the
face states through the game's Animator at the game camera's pitch.
