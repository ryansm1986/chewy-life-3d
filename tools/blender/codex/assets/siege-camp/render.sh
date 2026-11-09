#!/bin/bash
# bash render.sh <name> [kit] : gamecam + close renders of prop-siege-<name>.glb, with the kit side by side when kit is given
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
HERE="D:/projects/chewy-life-3d/tools/blender/work/codex/siege-camp"
N=$1; KIT=$2; KARG=""; [ -n "$KIT" ] && KARG="--kit $HERE/kitdump/kit-$KIT.obj"
timeout 600 "$BL" --background --factory-startup --python "$HERE/render_views.py" -- --in "D:/projects/chewy-life-3d/public/models/prop-siege-$N.glb" --out "$HERE/preview" --tag "$N" $KARG --ground '#6e8c58' --ty ${3:-0.5} --closedist ${4:-7} --refdist ${4:-7} --cap 1.2,1.0 > "$HERE/render-$N.log" 2>&1 &
P=$!; echo "render $N $P" >> "$HERE/pids.log"; wait $P
grep -E "Traceback|Error:" "$HERE/render-$N.log" | head -5
