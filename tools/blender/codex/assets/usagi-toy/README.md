# Toybox Usagi (usagi-toy): Blender source

Usagi, the bouncy gardener bunny of Blossom Hollow (`public/rigs/usagi_toy.*`), built by an Opus agent under Claude's direction (ROADMAP VL-1,
the toybox-character skill). The blueprint is `sheet.png`, the Toybox sheet the owner approved on 2026-10-02 for the
procedural kit; no new concepts were drawn. The shared briefs are `../villager-toy-common.md` (model) and
`../villager-rig-common.md` (rig); `brief.md` is Usagi's own, `direction/feedback-*.md` every director round.

- `build_usagi-toy.py`: the deterministic model build (it writes `public/models/usagi-toy.glb` and the atlas; a rebuild
  reproduces the same bytes). `measure.md` has the measured sheet targets and the model's numbers per round.
- `rig_usagi-toy.py`: runs the build in rig mode, then adds the 37-bone hero rig, the lid shells on tilted hinges, the
  mouth cut, cavity and tongue, and the weights. `rig_tests.py` renders the pose, face and toon sheets.
- History: 3 model rounds (the petal hat read as hair from the game camera), 3 rig rounds.

Rebuild (from a copy of this folder, so the outputs don't land in git):
```bash
cp -r tools/blender/codex/assets/usagi-toy tools/blender/work/codex/usagi-rebuild && cd tools/blender/work/codex/usagi-rebuild
blender --background --factory-startup --python rig_usagi-toy.py
blender --background usagi-toy_rig.blend --python ../../../codex/hero_export.py -- --out export --name usagi_toy --height 1.10
python ../../../codex/install_rig.py export usagi_toy
```
(The scripts carry absolute paths to their original work folder; point them at the copy first.)

**In the game** (`HERO_MODELS.usagi` in `src/actors/heroModels.js`; game.js hands Usagi's Villager this rig when it's
loaded, else the Toybox kit builds Usagi as before): lidTilt 0.4467, squint [0.488, -0.30]: the lower lid makes the crescent; `wave: 'out'` (big heads on short arms hide the paws when
they wave inward). Judge lids in the game, not only in Blender: `tools/qa/villager-face.mjs` (`ID=usagi`) renders the
face states through the game's Animator at the game camera's pitch.
