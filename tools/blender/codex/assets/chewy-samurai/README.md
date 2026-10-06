# Samurai Chewy (chewy-samurai): Blender source

The game's default Chewy since 2026-10-05 (`public/rigs/chewy_samurai.*`) is a **re-dress** of the Toybox Chewy
(`../chewy-b/`). An Opus agent built it under Claude's direction with the toybox-character skill, and Codex (GPT-6.1-Sol)
drew the concept sheets.
- **The concepts**: the owner first picked "B · Haori Captain" (red). They then asked for a black base, and picked
  **"E · Black and Gold"**: Option B's shapes in black and gold.
- **The work folder** `tools/blender/work/codex/chewy-samurai/` is git-ignored.

**What's here:**
- `sheet-E.png`: the approved concept sheet, the blueprint for the clothes.
- `concepts/`: the concept brief, the black-base round (`concept-feedback-1.md`), Codex's notes, and the red Option B for
  reference.
- `brief.md` and `direction/feedback-1..4.md`: every director round:
  - 1: the black-and-gold pick;
  - 2: the box sleeves, the hakama front, the sageo;
  - 3: the rig;
  - 4: the waistband and the knee poke-through;
  - a later normals fix (round 5) re-wound the haori outward, checked by `outward_faces` in the build checks.
- `base/`: an exact copy of `../chewy-b/build_chewy-b.py` and its inputs.
  `build_chewy-samurai.py` runs it unchanged (it checks the MD5) up to the join step, deletes only the old costume pieces
  by name, and builds the haori, kimono, hakama, saya, cord and sageo into the freed atlas regions. Every outfit colour is
  in its `OUTFIT` constants.
- `lock_check.py`: proves the head, eyes, ears, tail, paws and feet are vertex-identical to `chewy-b.glb` (0.0 m), and
  that the locked atlas regions are pixel-identical.
- `rig_chewy-samurai.py`: generated from `base/rig_chewy-b.py`. It keeps chewy-b's 37 bones, face rig and body weights,
  plus the cloth weights. `verify_face.py` proves the face skin matches the installed chewy_b.
- `export_outward.py`: checks the exported winding (no inward cloth faces).
- `pose_check.py` and `render_poses.py`: the pose sheet, plus the fur-through-cloth counts.
- `run_blender.py`: the PID-logging launcher with a timeout.
- `saya_mount.json`: the scabbard mouth and direction. The game's `HERO_MODELS.chewySamurai.sayaMount` uses it.

**Rebuild** (from a copy of this folder, so the outputs don't land in git):
```bash
cp -r tools/blender/codex/assets/chewy-samurai tools/blender/work/codex/chewy-samurai-rebuild && cd tools/blender/work/codex/chewy-samurai-rebuild
blender --background --factory-startup --python rig_chewy-samurai.py
blender --background chewy-samurai_rig.blend --python ../../../codex/hero_export.py -- --out export --name chewy_samurai --height 1.2
python ../../../codex/install_rig.py export chewy_samurai
```
The scripts were written for the work folder layout: some write to `preview/` or `scratch/`, so create those first.
