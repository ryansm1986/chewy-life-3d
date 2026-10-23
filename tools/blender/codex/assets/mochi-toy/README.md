# Toybox Mochi (mochi-toy): Blender source

Mochi, the dreamy calico painter of Blossom Hollow (`public/rigs/mochi_toy.*`), built by an Opus agent under Claude's direction (ROADMAP VL-1,
the toybox-character skill). The blueprint is `sheet.png`, the Toybox sheet the owner approved on 2026-10-02 for the
procedural kit; no new concepts were drawn. The shared briefs are `../villager-toy-common.md` (model) and
`../villager-rig-common.md` (rig); `brief.md` is Mochi's own, `direction/feedback-*.md` every director round.

- `build_mochi-toy.py`: the deterministic model build (it writes `public/models/mochi-toy.glb` and the atlas; a rebuild
  reproduces the same bytes). `measure.md` has the measured sheet targets and the model's numbers per round.
- `rig_mochi-toy.py`: runs the build in rig mode, then adds the 37-bone hero rig, the lid shells on tilted hinges, the
  mouth cut, cavity and tongue, and the weights. `rig_tests.py` renders the pose, face and toon sheets.
- History: 4 model rounds, 4 rig rounds (the world-X lid read sad; tilted hinges; the in-game check found the lid floating off the eyeball and the shut lash too thin).

Rebuild (from a copy of this folder, so the outputs don't land in git):
```bash
cp -r tools/blender/codex/assets/mochi-toy tools/blender/work/codex/mochi-rebuild && cd tools/blender/work/codex/mochi-rebuild
blender --background --factory-startup --python rig_mochi-toy.py
blender --background mochi-toy_rig.blend --python ../../../codex/hero_export.py -- --out export --name mochi_toy --height 1.113
python ../../../codex/install_rig.py export mochi_toy
```
(The scripts carry absolute paths to their original work folder; point them at the copy first.)

**In the game** (`HERO_MODELS.mochi` in `src/actors/heroModels.js`; game.js hands Mochi's Villager this rig when it's
loaded, else the Toybox kit builds Mochi as before): lidTilt 0.534, squint [0.30, -0.24]: the tilted lids (her eyes face 30.6° out); the smaller upper squint reads happiest in the game; `wave: 'out'` (big heads on short arms hide the paws when
they wave inward). Judge lids in the game, not only in Blender: `tools/qa/villager-face.mjs` (`ID=mochi`) renders the
face states through the game's Animator at the game camera's pitch.
