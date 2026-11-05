#!/bin/sh
# rv.sh <piece> [views...] : review renders at the furnsheet camera -> preview/<piece>-<view>.png
cd D:/projects/chewy-life-3d/tools/blender/work/codex/furn-trophy
B="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
P=$1; shift; V=${*:-sheet front}
for v in $V; do timeout 300 "$B" -b --factory-startup --python render_furn.py -- --in D:/projects/chewy-life-3d/public/models/furn-$P.glb --out D:/projects/chewy-life-3d/tools/blender/work/codex/furn-trophy/preview/$P-$v.png --res 700 --view $v > preview/rv.log 2>&1; grep "RF pid" preview/rv.log; done
