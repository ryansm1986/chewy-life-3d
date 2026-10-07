# Toybox Shih Tzu Knight (shihtzu-toy): Blender source

The Shih Tzu dark knight (male, name TBD; ROADMAP H-4) is `public/rigs/shihtzu_toy.*`, with his dog-toy flail
`public/models/shihtzu-flail.glb`. An Opus agent built him under Claude's direction with the toybox-character skill.
- **The concepts** were drawn by Codex. The owner picked **B "Gloomhowl Warlock-Knight"**: a black-and-white coat, a plum
  tabard and a teal ghostlight.
- **The work folder** `tools/blender/work/codex/shihtzu-toy/` is git-ignored.

**What's here:**
- `sheet-B.png`: the approved concept sheet, the blueprint. The scripts read it as `refs/sheet.png`.
- `concepts/`: the concept brief and Codex's notes and prompts.
- `brief.md` (with measured targets) and `direction/feedback-2.md`. Later rounds went to the agent as messages:
  - 3–4: the cast head size, then a **sculpted mouth** in place of the painted line (the owner's call);
  - 5, 5b, 5c: the rig. The eyes face about 31° outward, so the lids hinge on a tilted axis.
- `build_shihtzu-toy.py`: the deterministic model build. It exports `public/models/shihtzu-toy.glb` and the flail,
  `public/models/shihtzu-flail.glb` (plus `prop_mount.json`: the one-handed grip on `hand_R`).
- `rig_shihtzu-toy.py`: the rig. It runs the build in rig mode, then adds:
  - the 37-bone hero rig;
  - the tilted lid shells. Round 5c capped each over-eye row at 3 mm in front of the eyeball at the squint and blink
    angles, and pulled the corner rows under the skin at the squint;
  - the sculpted mouth cavity;
  - the weights.
- `rig_tests.py`, `pose_check.py`, `verify_mouth.py` and `validate.py`: the pose, face and toon renders, the
  through-lid and through-mouth ray counts, and the export validation. `rig_all.sh` runs the rig round.

**The game's values** (for the `HERO_MODELS` entry):
- `lidTilt: 0.5507`: the hinges are (0.852, 0, ∓0.523) in game axes (animator.js `lidTurn`);
- `squint: [0.74, -0.36]`: it reads as a content, half-lidded smile. [0.70, −0.44] reads as a glare from 45°;
- `earGain: 0.5`.

**Known residuals:**
- 189 inward-wound triangles, mostly in the tail ball's folded core;
- 43 of 3,000 rays reach the head interior through the open mouth at the 45° cameras, and 28 from below.

**Rebuild** (from a copy of this folder; the build writes straight to `public/models/`):
```bash
cp -r tools/blender/codex/assets/shihtzu-toy tools/blender/work/codex/shihtzu-rebuild && cd tools/blender/work/codex/shihtzu-rebuild
mkdir -p scratch preview export refs && cp sheet-B.png refs/sheet.png
blender --background --factory-startup --python rig_shihtzu-toy.py
blender --background shihtzu-toy_rig.blend --python ../../../codex/hero_export.py -- --out export --name shihtzu_toy --height 1.2
python ../../../codex/install_rig.py export shihtzu_toy
```
