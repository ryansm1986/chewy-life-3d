# Toybox Kero (kero-toy): Blender source

Kero, the earnest frog who guards the koi pond of Blossom Hollow (`public/rigs/kero_toy.*`), built by an Opus agent under Claude's direction (ROADMAP VL-1,
the toybox-character skill). The blueprint is `sheet.png`, the Toybox sheet the owner approved on 2026-10-02 for the
procedural kit; no new concepts were drawn. The shared briefs are `../villager-toy-common.md` (model) and
`../villager-rig-common.md` (rig); `brief.md` is Kero's own, `direction/feedback-*.md` every director round.

- `build_kero-toy.py`: the deterministic model build (it writes `public/models/kero-toy.glb` and the atlas; a rebuild
  reproduces the same bytes). `measure.md` has the measured sheet targets and the model's numbers per round.
- `rig_kero-toy.py`: runs the build in rig mode, then adds the 37-bone hero rig, the lid shells on tilted hinges, the
  mouth cut, cavity and tongue, and the weights. `rig_tests.py` renders the pose, face and toon sheets.
- History: 2 model rounds (the eye domes and skull one smooth implicit with no crease), 4 rig rounds: a rigid lid can't sweep his tall, slightly concave eye to the usual 1.22, so the game gained `lidClose` (animator.js) and his lids close at 1.10 as a soft, puffy lid. Faint specks remain at extreme close-up; they don't read at game distance.

Rebuild (from a copy of this folder, so the outputs don't land in git):
```bash
cp -r tools/blender/codex/assets/kero-toy tools/blender/work/codex/kero-rebuild && cd tools/blender/work/codex/kero-rebuild
blender --background --factory-startup --python rig_kero-toy.py
blender --background kero-toy_rig.blend --python ../../../codex/hero_export.py -- --out export --name kero_toy --height 1.103
python ../../../codex/install_rig.py export kero_toy
```
(The scripts carry absolute paths to their original work folder; point them at the copy first.)

**In the game** (`HERO_MODELS.kero` in `src/actors/heroModels.js`; game.js hands Kero's Villager this rig when it's
loaded, else the Toybox kit builds Kero as before): lidTilt 0.485, lidClose 1.10, squint [0.30, -0.34]; no ears or tail (their bones are unweighted); `wave: 'out'` (big heads on short arms hide the paws when
they wave inward). Judge lids in the game, not only in Blender: `tools/qa/villager-face.mjs` (`ID=kero`) renders the
face states through the game's Animator at the game camera's pitch.
