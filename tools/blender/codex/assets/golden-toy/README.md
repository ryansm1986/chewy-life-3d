# Toybox Golden Retriever Dragoon (golden-toy): Blender source

The Golden Retriever dragoon (male, name TBD; ROADMAP H-5) is `public/rigs/golden_toy.*`. His props are
`public/models/golden-lance.glb` and `golden-javelin.glb`. An Opus agent built him under Claude's direction with the
toybox-character skill.
- **The concepts** were drawn by Codex. The owner picked **C "Emberleaf Dragon Guard"**: a red-gold coat and emerald scale
  armour.
- **The work folder** `tools/blender/work/codex/golden-toy/` is git-ignored.

**What's here:**
- `sheet-C.png`: the approved concept sheet, the blueprint. The scripts read it as `refs/sheet.png`.
- `concepts/`: the concept brief and Codex's notes and prompts.
- `brief.md` and `measurements.json` (from `measure_sheet.py`), and `direction/feedback-2.md`: the cast head size, the
  sheet's face, the fluffy ears and tail, a deeper emerald. Later rounds went to the agent as messages.
- `build_golden-toy.py`: the deterministic model build. It exports:
  - `public/models/golden-toy.glb`;
  - the lance and the javelin. `prop_mount.json` has their pivots (the grips) and axes.
- `rig_golden-toy.py`: the 37-bone hero rig, the lid shells, the mouth cavity and the weights.
- `rig_tests.py`, `pose_check.py` and `validate.py`: the pose, face and toon renders, the poke-through counts and the
  export validation. `run_rig_round.sh` runs the rig round; `run_reviews.sh` runs the model-round previews.

**The game's values:** `earGain: 0.5`.

**Known residuals** (accepted):
- small armour contacts in run (2) and roll (9);
- the ears dip 9 to 14 mm under the neck guard.

**Rebuild** (from a copy of this folder; the build writes straight to `public/models/`):
```bash
cp -r tools/blender/codex/assets/golden-toy tools/blender/work/codex/golden-rebuild && cd tools/blender/work/codex/golden-rebuild
mkdir -p scratch preview export refs && cp sheet-C.png refs/sheet.png
blender --background --factory-startup --python rig_golden-toy.py
blender --background golden-toy_rig.blend --python ../../../codex/hero_export.py -- --out export --name golden_toy --height 1.2
python ../../../codex/install_rig.py export golden_toy
```
