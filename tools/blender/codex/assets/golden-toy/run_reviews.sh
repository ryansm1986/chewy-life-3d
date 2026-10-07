#!/bin/sh
# the full review render set for one round (each Blender run PID-logged with a 900 s cap by run_blender.py)
cd "$(dirname "$0")"
python run_blender.py scratch/log_pv.txt 900 -- --background --factory-startup --python D:/projects/chewy-life-3d/tools/blender/codex/preview.py -- --in D:/projects/chewy-life-3d/public/models/golden-toy.glb --out D:/projects/chewy-life-3d/tools/blender/work/codex/golden-toy/preview --character | tail -1
python run_blender.py scratch/log_rv.txt 900 -- --background --factory-startup --python render_views.py -- --only head_front,head_34R,head_34,head_side,head_back,head_top,body_front,body_34R,body_34,body_side,body_back,portrait,g45,g45h | tail -1
python run_blender.py scratch/log_cast.txt 900 -- --background --factory-startup --python render_views.py -- --only cast --extra "D:/projects/chewy-life-3d/public/models/chewy-b.glb@-1.15;D:/projects/chewy-life-3d/public/models/poe-toy.glb@1.25" | tail -1
python run_blender.py scratch/log_toon.txt 900 -- --background --factory-startup --python render_views.py -- --toon | tail -1
python measure_sheet.py > scratch/measure.txt 2>&1; python make_compare.py > scratch/compare.txt 2>&1
echo REVIEWS_DONE
