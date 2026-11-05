#!/bin/sh
# render the 3/4 review views: sh render.sh id [id...]
B="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
cd "$(dirname "$0")"
for id in "$@"; do
  timeout 600 "$B" --background --factory-startup --python render_furn.py -- --in ../../../../../public/models/furn-$id.glb --out preview/$id.png --res 700 2>&1 | grep -E "RF pid|RF wrote|Error"
done
