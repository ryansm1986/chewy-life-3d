# Toybox Pan (pan-toy): Blender source

Pan, the sleepy panda of Blossom Hollow (`public/rigs/pan_toy.*`), built by an Opus agent under Claude's direction (ROADMAP VL-1,
the toybox-character skill). The blueprint is `sheet.png`, the Toybox sheet the owner approved on 2026-10-02 for the
procedural kit; no new concepts were drawn. The shared briefs are `../villager-toy-common.md` (model) and
`../villager-rig-common.md` (rig); `brief.md` is Pan's own, `direction/feedback-*.md` every director round.

- `build_pan-toy.py`: the deterministic model build (it writes `public/models/pan-toy.glb` and the atlas; a rebuild
  reproduces the same bytes). `measure.md` has the measured sheet targets and the model's numbers per round.
- `rig_pan-toy.py`: runs the build in rig mode, then adds the 37-bone hero rig, the lid shells on tilted hinges, the
  mouth cut, cavity and tongue, and the weights. `rig_tests.py` renders the pose, face and toon sheets.
- History: 3 model rounds, 1 rig round; the kemari ball is a separate prop (build_pan-kemari.py, public/models/pan-kemari.glb, not used yet).

Rebuild (from a copy of this folder, so the outputs don't land in git):
```bash
cp -r tools/blender/codex/assets/pan-toy tools/blender/work/codex/pan-rebuild && cd tools/blender/work/codex/pan-rebuild
blender --background --factory-startup --python rig_pan-toy.py
blender --background pan-toy_rig.blend --python ../../../codex/hero_export.py -- --out export --name pan_toy --height 1.095
python ../../../codex/install_rig.py export pan_toy
```
(The scripts carry absolute paths to their original work folder; point them at the copy first.)

**In the game** (`HERO_MODELS.pan` in `src/actors/heroModels.js`; game.js hands Pan's Villager this rig when it's
loaded, else the Toybox kit builds Pan as before): lidTilt 0.541, squint [0.26, -0.26], darkGrade [1, -4, 14, -9]. His sleepy lid is a static ledge on the head and the rig's eye hole is cut to that opening, so the game must never drive his lidU below 0; `wave: 'out'` (big heads on short arms hide the paws when
they wave inward). Judge lids in the game, not only in Blender: `tools/qa/villager-face.mjs` (`ID=pan`) renders the
face states through the game's Animator at the game camera's pitch.
