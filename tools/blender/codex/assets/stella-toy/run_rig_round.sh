#!/bin/sh
# the rig round: rig -> hero export -> validation -> test sheets -> pose check (each Blender run PID-logged, capped)
cd "$(dirname "$0")"
[ "$1" = "--no-rig" ] || { python run_blender.py scratch/log_rig.txt 1500 -- --background --factory-startup --python rig_stella-toy.py | tail -1; grep -E "Traceback|Error|STELLA_RIG|TRI_TOTAL|LIDS " scratch/log_rig.txt | cut -c1-600; }
python run_blender.py scratch/log_exp.txt 900 -- --background stella-toy_rig.blend --python D:/projects/chewy-life-3d/tools/blender/codex/hero_export.py -- --out export --name stella_toy --height 1.24 | tail -1
grep -E "HERO_EXPORT|WARNING|Traceback|Error" scratch/log_exp.txt | cut -c1-600
python run_blender.py scratch/log_val.txt 900 -- --background --factory-startup --python validate.py | tail -1
grep -E "VALIDATION|Traceback" scratch/log_val.txt | cut -c1-1200
for part in poses face toon crops; do
  python run_blender.py scratch/rt_$part.log 1800 -- --background --factory-startup --python rig_tests.py -- --only $part $SQUINT | tail -1; grep -E "RIG_TESTS_DONE|Traceback|Error" scratch/rt_$part.log | head -3
done
python run_blender.py scratch/log_pc.txt 3000 -- --background --factory-startup --python pose_check.py | tail -1
grep -E "^POSE |FACEPOSE|EARGAIN|SPECKS|HOLES|SAFE_EARGAIN|Traceback|Error" scratch/log_pc.txt | cut -c1-900
echo RIG_ROUND_DONE
