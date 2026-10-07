#!/bin/sh
# the rig round: rig -> hero export -> validation -> test sheets -> pose check -> ear table (each Blender run PID-logged, capped)
cd "$(dirname "$0")"
python run_blender.py scratch/log_rig.txt 1500 -- --background --factory-startup --python rig_golden-toy.py | tail -1
python run_blender.py scratch/log_exp.txt 900 -- --background golden-toy_rig.blend --python D:/projects/chewy-life-3d/tools/blender/codex/hero_export.py -- --out D:/projects/chewy-life-3d/tools/blender/work/codex/golden-toy/export --name golden_toy --height 1.2 | tail -1
python run_blender.py scratch/log_val.txt 900 -- --background --factory-startup --python validate.py | tail -1
python run_blender.py scratch/log_rt.txt 2400 -- --background --factory-startup --python rig_tests.py | tail -1
python run_blender.py scratch/log_pc.txt 3000 -- --background --factory-startup --python pose_check.py | tail -1
EAR_CFGS='[{"name":"final"}]' python run_blender.py scratch/log_eo2.txt 1200 -- --background --factory-startup --python scratch/ear_opt2.py | tail -1
echo RIG_ROUND_DONE
