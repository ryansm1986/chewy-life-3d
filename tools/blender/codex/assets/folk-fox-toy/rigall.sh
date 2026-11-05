#!/bin/sh
# the rig, its test sheets, the checks and the game export for one design (each Blender run PID-logged and time-capped).   sh rigall.sh a|c
cd "$(dirname "$0")"
D=${1:-a}; ID=folk_fox_$D
python src/assemble.py | tail -1
python run_blender.py scratch/log_rig_$D.txt 1700 -- --background --factory-startup --python rig_folk-fox-toy.py -- --design $D | tail -1
grep -E "Traceback|Error|LID_TILT|LID_R |TRI_TOTAL|REST_VS|DEFAULTED|HIDDEN|LASH_PUSH|TONGUE|REST_TUCK|FOX_RIG" scratch/log_rig_$D.txt | cut -c1-1200
grep -q FOX_RIG scratch/log_rig_$D.txt || exit 1
python run_blender.py scratch/log_tests_$D.txt 1500 -- --background --factory-startup --python rig_tests.py -- --design $D --squint 0.14,-0.26 | tail -1
python run_blender.py scratch/log_checks_$D.txt 900 -- --background --factory-startup --python rig_checks.py -- --design $D | tail -1
grep RIG_CHECKS scratch/log_checks_$D.txt | cut -c1-1500
H=$(python -c "import json; print(json.load(open('measurements-model-$D.json'))['bounds_m']['max'][2])")
python run_blender.py scratch/log_export_$D.txt 900 -- --background folk-fox-$D-toy_rig.blend --python D:/projects/chewy-life-3d/tools/blender/codex/hero_export.py -- --out D:/projects/chewy-life-3d/tools/blender/work/codex/folk-fox-toy/export/$D --name ${ID}_toy --height $H --no-outline eye,tongue,mouth,lid,lash | tail -1
grep -E "HERO_EXPORT|WARNING" scratch/log_export_$D.txt | cut -c1-800
echo RIGALL_DONE $D
