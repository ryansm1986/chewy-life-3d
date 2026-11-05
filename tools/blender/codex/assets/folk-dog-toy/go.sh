#!/bin/sh
# build + preview + compare one design: sh go.sh a|c  (each Blender run is PID-logged and time-capped by run_blender.py)
cd "$(dirname "$0")"
d=$1; hz=.80; [ "$d" = c ] && hz=.75
python run_blender.py logs/build_$d.log 850 -- --background --factory-startup --python build_folk-dog-toy.py -- --design $d > /dev/null || { echo BUILD_FAIL $d; grep -A12 Traceback logs/build_$d.log | head -20; exit 1; }
grep -o '"triangles": [0-9]*' logs/build_$d.log | tail -1
python run_blender.py logs/rv_$d.log 800 -- --background --factory-startup --python render_views.py -- --in D:/projects/chewy-life-3d/public/models/folk-dog-$d-toy.glb --out preview/$d --hz $hz > /dev/null || echo RENDER_FAIL $d
python make_compare.py $d > /dev/null && echo DONE $d
