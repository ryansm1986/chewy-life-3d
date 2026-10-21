#!/bin/sh
# the full review render set for one round (each Blender run PID-logged with a 900 s cap by run_blender.py)
cd "$(dirname "$0")"
M=D:/projects/chewy-life-3d/public/models
python run_blender.py scratch/log_pv.txt 900 -- --background --factory-startup --python D:/projects/chewy-life-3d/tools/blender/codex/preview.py -- --in $M/stella-toy.glb --out preview --character | tail -1
python run_blender.py scratch/log_rv.txt 900 -- --background --factory-startup --python render_views.py -- --only head_front,head_34R,head_34,head_side,head_back,head_top,body_front,body_34R,body_34,body_side,body_back,portrait,portrait_front,g45,g45h,widthmask | tail -1
python run_blender.py scratch/log_cast.txt 900 -- --background --factory-startup --python render_views.py -- --only cast --extra "$M/chewy-b.glb@-1.10;$M/moka-toy.glb@1.15" | tail -1
python run_blender.py scratch/log_toon.txt 900 -- --background --factory-startup --python render_views.py -- --toon | tail -1
echo REVIEWS_DONE
