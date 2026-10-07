#!/bin/bash
# the standard review renders after a build (each Blender run through the PID-logging launcher, with a timeout)
cd D:/projects/chewy-life-3d/tools/blender/work/codex/shihtzu-toy
B="--background --factory-startup --python"
python run_blender.py scratch/pv.log 900 -- $B D:/projects/chewy-life-3d/tools/blender/codex/preview.py -- --in D:/projects/chewy-life-3d/public/models/shihtzu-toy.glb --out D:/projects/chewy-life-3d/tools/blender/work/codex/shihtzu-toy/preview --character
python run_blender.py scratch/rv.log 900 -- $B render_views.py -- --only head_front,head_34,head_side,head_back,head_top,body_front,body_34,body_side,body_back,body_34R,portrait,g45,g45h
python run_blender.py scratch/rvt.log 900 -- $B render_views.py -- --toon
python run_blender.py scratch/rvc.log 900 -- $B render_views.py -- --only cast --extra D:/projects/chewy-life-3d/public/models/chewy-b.glb@-1.10
python run_blender.py scratch/pvf.log 600 -- $B D:/projects/chewy-life-3d/tools/blender/codex/preview.py -- --in D:/projects/chewy-life-3d/public/models/shihtzu-flail.glb --out D:/projects/chewy-life-3d/tools/blender/work/codex/shihtzu-toy/preview/flail
python make_compare.py
python measure/model_measure.py > scratch/model_measure.txt
python measure/nose_proj.py >> scratch/model_measure.txt
grep -h "PREVIEW" scratch/pv.log | cut -c1-600
