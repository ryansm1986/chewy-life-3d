# Toybox Tanu (tanu-toy): Blender source

Tanu, the cheeky trinket merchant of Blossom Hollow (`public/rigs/tanu_toy.*`), built by an Opus agent under Claude's direction (ROADMAP VL-1,
the toybox-character skill). The blueprint is `sheet.png`, the Toybox sheet the owner approved on 2026-10-02 for the
procedural kit; no new concepts were drawn. The shared briefs are `../villager-toy-common.md` (model) and
`../villager-rig-common.md` (rig); `brief.md` is Tanu's own, `direction/feedback-*.md` every director round.

- `build_tanu-toy.py`: the deterministic model build (it writes `public/models/tanu-toy.glb` and the atlas; a rebuild
  reproduces the same bytes). `measure.md` has the measured sheet targets and the model's numbers per round.
- `rig_tanu-toy.py`: runs the build in rig mode, then adds the 37-bone hero rig, the lid shells on tilted hinges, the
  mouth cut, cavity and tongue, and the weights. `rig_tests.py` renders the pose, face and toon sheets.
- History: 2 model rounds (the leaf read as a beret; flattened and cupped), 2 rig rounds (the satchel moved 3 cm up and 9° forward round the hip in rig mode only, so the walk clears it; a few frames at a full run still touch it).

Rebuild (from a copy of this folder, so the outputs don't land in git):
```bash
cp -r tools/blender/codex/assets/tanu-toy tools/blender/work/codex/tanu-rebuild && cd tools/blender/work/codex/tanu-rebuild
blender --background --factory-startup --python rig_tanu-toy.py
blender --background tanu-toy_rig.blend --python ../../../codex/hero_export.py -- --out export --name tanu_toy --height 1.087
python ../../../codex/install_rig.py export tanu_toy
```
(The scripts carry absolute paths to their original work folder; point them at the copy first.)

**In the game** (`HERO_MODELS.tanu` in `src/actors/heroModels.js`; game.js hands Tanu's Villager this rig when it's
loaded, else the Toybox kit builds Tanu as before): lidTilt 0.361, squint [0.26, -0.30], darkGrade [0.3, 8, 4, -10] (the grade turned his brown mask purple); `wave: 'out'` (big heads on short arms hide the paws when
they wave inward). Judge lids in the game, not only in Blender: `tools/qa/villager-face.mjs` (`ID=tanu`) renders the
face states through the game's Animator at the game camera's pitch.
