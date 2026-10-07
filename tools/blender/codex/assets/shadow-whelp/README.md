# Shadow's dragon whelp outfit (shadow-whelp): Blender source

Shadow's dragon whelp outfit is `public/rigs/shadow_whelp.*` (the quad contract). He wears it only while the Golden
Retriever dragoon is played (ROADMAP H-5). The wing prop is `public/models/shadow-whelp-wing.glb`; the right wing is an
x-mirror of the left. An Opus agent built it under Claude's direction with the toybox-character skill.
- **It's a re-dress** of the Toybox Shadow (`../shadow-toy/`) with the base locked:
  - `base/` holds copies of that archive's build and rig scripts;
  - `build_shadow-whelp.py` and `rig_shadow-whelp.py` assert both are byte-identical (MD5) to `../shadow-toy/`
    before running them;
  - `lock_check.py` proves the dog itself is unchanged (`lock-check.json`).
- **The concept** is the dragoon sheet (`../golden-toy/sheet-C.png`), which shows the whelp.
- **The work folder** `tools/blender/work/codex/shadow-whelp/` is git-ignored.

**What's here:**
- `brief.md` and `direction/feedback-2.md`.
- `build_shadow-whelp.py`: the costume on the base build. It exports `public/models/shadow-whelp.glb` and writes:
  - `wing_mount.json`: the wing mounts. `flapRange` runs from −30 to 60;
  - `costume_ref.json` and `measure.json`.
- `build_wing.py`: the wing prop (`wing_measure.json`, `wing_ref.json`).
- `rig_shadow-whelp.py`: the archived Shadow rig, unchanged up to its save, then the costume weights:
  - the tail cover rides body, tail1 and tail2;
  - the tail spikes are rigid at their base's weights.
- `pose_whelp.py`, `montage_poses.py`, `outward_check.py` and `validate_export.py`: the poses (walk, run and fly have 0
  poke-through), the outward-winding check and the export validation.

**Rebuild** (from a copy of this folder; the builds write straight to `public/models/`):
```bash
cp -r tools/blender/codex/assets/shadow-whelp tools/blender/work/codex/whelp-rebuild && cd tools/blender/work/codex/whelp-rebuild
mkdir -p scratch preview export
blender --background --factory-startup --python build_shadow-whelp.py
blender --background --factory-startup --python build_wing.py
blender --background --factory-startup --python rig_shadow-whelp.py
blender --background shadow-whelp_rig.blend --python ../../../codex/hero_export.py -- --contract quad --out export --name shadow_whelp
python ../../../codex/install_rig.py export shadow_whelp
```
