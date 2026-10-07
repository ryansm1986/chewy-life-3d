#!/bin/bash
# the round-5 deliverables after a rig build: test sheets, the hero export (0 warnings), validation, pose checks.
# Every Blender run goes through the PID-logging launcher with a timeout.
cd D:/projects/chewy-life-3d/tools/blender/work/codex/shihtzu-toy
B="--background --factory-startup --python"
for part in poses face toon crops; do
  python run_blender.py scratch/rt_$part.log 1800 -- $B rig_tests.py -- --only $part; grep -E "RIG_TESTS_DONE|Traceback" scratch/rt_$part.log | head -2
done
python run_blender.py scratch/export.log 900 -- --background shihtzu-toy_rig.blend --python D:/projects/chewy-life-3d/tools/blender/codex/hero_export.py -- --out D:/projects/chewy-life-3d/tools/blender/work/codex/shihtzu-toy/export --name shihtzu_toy --height 1.2
grep -E "HERO_EXPORT|WARNING|Traceback|Error" scratch/export.log | cut -c1-400
python run_blender.py scratch/validate.log 900 -- $B validate.py; grep -E "VALIDATION|Traceback" scratch/validate.log | cut -c1-900
python run_blender.py scratch/pc.log 3600 -- $B pose_check.py; grep -E "^POSE |EARPOSE|EARGAIN|SPECKS|HOLES|SAFE_EARGAIN|Traceback|Error" scratch/pc.log | cut -c1-420
