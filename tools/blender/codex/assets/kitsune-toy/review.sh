#!/bin/sh
# the full review render set for one round (each Blender run PID-logged with a 900 s cap by run_blender.py)
cd "$(dirname "$0")"
M=D:/projects/chewy-life-3d/public/models
PV=D:/projects/chewy-life-3d/tools/blender/codex/preview.py
python run_blender.py scratch/log_pv.txt 900 -- --background --factory-startup --python $PV -- --in $M/kitsune-toy.glb --out preview --character | tail -1
python run_blender.py scratch/log_rv.txt 900 -- --background --factory-startup --python render_views.py -- --only head_front,head_34,head_34R,head_side,head_back,body_front,body_34,body_34R,body_side,body_back,portrait,portrait_front,g45,g45h | tail -1
python make_compare.py | tail -1
grep -h '"warnings"' preview/stats.json
echo REVIEWS_DONE
python run_blender.py scratch/log_ears.txt 600 -- --background --factory-startup --python ears_only.py | tail -1
