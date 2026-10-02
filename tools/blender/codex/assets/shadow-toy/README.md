# Toybox Shadow (shadow-toy): Blender source

The game's Shadow, Chewy's companion (`public/rigs/shadow_toy.*`), was built by an Opus agent under Claude's direction,
using the toybox-character skill. Codex (GPT-6.1-Sol) drew the concept sheets; the owner picked "A · Faithful Buddy" and
signed off on the model before it was rigged. This folder archives what's needed to rebuild it. The working folder
`tools/blender/work/codex/shadow-toy/` is git-ignored.

- `sheet-A.png`: the approved concept sheet, the blueprint. `concepts/` holds the concept brief, all three options
  (`lineup.png`) and Codex's notes.
- `brief.md`, `direction/opus-prompt.md` and `direction/feedback-*.md`:
  - the modelling brief and the builder prompt;
  - every director round: 2–3 for the model, 4 for the rig, 5 for the happy-squint fix.
  The measured targets and the game's joint values are in there.
- `build_shadow-toy.py`: the deterministic model build. It paints the atlas, saves `shadow-toy.blend`, writes
  `joints.json` and exports `public/models/shadow-toy.glb` (an absolute path; a rebuild rewrites the same bytes).
- `rig_shadow-toy.py`: runs `build_shadow-toy.py` unchanged (minus its save and export), then adds:
  - the 21-bone quad rig;
  - the lid shells, including the happy-squint filler shells;
  - the smile cut, the mouth pocket and the tongue;
  - the weights.
  It saves `shadow-toy_rig.blend` and writes `joints-rig.json`.
- `pose_shadow.py` and `montage_poses.py`: the pose and face test renders (game-axis rotations about the bone heads)
  behind `preview/poses.png` and `preview/face.png`.

Rebuild (from a copy of this folder, so the outputs don't land in git):
```bash
cp -r tools/blender/codex/assets/shadow-toy tools/blender/work/codex/shadow-toy-rebuild && cd tools/blender/work/codex/shadow-toy-rebuild
mkdir -p scratch   # the rig writes scratch/open_pts.json
blender --background --factory-startup --python rig_shadow-toy.py
blender --background shadow-toy_rig.blend --python ../../../codex/hero_export.py -- --contract quad --out export --name shadow_toy --height 0.62
python ../../../codex/install_rig.py export shadow_toy
```

**In the game:**
- `HERO_MODELS.shadow` in `src/actors/heroModels.js` sets `sitDrop` 0.08 and `darkGrade` [1, -4, 14, -9].
  The grade pass (`uLift` in gfx/post.js) turns a near-black coat violet. `darkGrade` counters it in the hero shader,
  and portraits zero it because they render without the grade.
- The game drives the happy squint at lidU +0.488 (0.4 × 1.22) with lidD −0.24.
- Without these files the game falls back to the kit Boston (`buildBoston` in charKit.js).
