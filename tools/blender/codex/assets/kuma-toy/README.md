# Toybox Kuma (kuma-toy): Blender source

Kuma, the gentle baker bear of Blossom Hollow (`public/rigs/kuma_toy.*`), built by an Opus agent under Claude's direction (ROADMAP VL-1,
the toybox-character skill). The blueprint is `sheet.png`, the Toybox sheet the owner approved on 2026-10-02 for the
procedural kit; no new concepts were drawn. The shared briefs are `../villager-toy-common.md` (model) and
`../villager-rig-common.md` (rig); `brief.md` is Kuma's own, `direction/feedback-*.md` every director round.

- `build_kuma-toy.py`: the deterministic model build (it writes `public/models/kuma-toy.glb` and the atlas; a rebuild
  reproduces the same bytes). `measure.md` has the measured sheet targets and the model's numbers per round.
- `rig_kuma-toy.py`: runs the build in rig mode, then adds the 37-bone hero rig, the lid shells on tilted hinges, the
  mouth cut, cavity and tongue, and the weights. `rig_tests.py` renders the pose, face and toon sheets.
- History: 4 model rounds (a bell head, then a box, then the squircle round in plan), 2 rig rounds.

Rebuild (from a copy of this folder, so the outputs don't land in git):
```bash
cp -r tools/blender/codex/assets/kuma-toy tools/blender/work/codex/kuma-rebuild && cd tools/blender/work/codex/kuma-rebuild
blender --background --factory-startup --python rig_kuma-toy.py
blender --background kuma-toy_rig.blend --python ../../../codex/hero_export.py -- --out export --name kuma_toy --height 1.407
python ../../../codex/install_rig.py export kuma_toy
```
(The scripts carry absolute paths to their original work folder; point them at the copy first.)

**In the game** (`HERO_MODELS.kuma` in `src/actors/heroModels.js`; game.js hands Kuma's Villager this rig when it's
loaded, else the Toybox kit builds Kuma as before): lidTilt 0.328, squint [0.30, -0.30]; `wave: 'out'` (big heads on short arms hide the paws when
they wave inward). Judge lids in the game, not only in Blender: `tools/qa/villager-face.mjs` (`ID=kuma`) renders the
face states through the game's Animator at the game camera's pitch.
