#!/bin/sh
# head-only build + head renders (each Blender run PID-logged with a 900 s cap by run_blender.py)
cd "$(dirname "$0")"
python run_blender.py scratch/log_head.txt 900 -- --background --factory-startup --python build_stella-toy.py -- --head-only | tail -1
grep -E "Error|Traceback|assert" scratch/log_head.txt | head -5
python run_blender.py scratch/log_rv.txt 900 -- --background --factory-startup --python render_views.py -- --in scratch/stella-head-test.glb --out scratch/hv --only head_front,head_34R,head_back,g45h,widthmask | tail -1
python measure/montage.py scratch/m_head.png 450 scratch/hv/head_front.png scratch/hv/head_34R.png scratch/hv/head_side.png scratch/hv/head_back.png
