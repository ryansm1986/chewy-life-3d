#!/bin/bash
# build_siege-camp.py run + per-piece renders. Records the PID of each Blender it starts in pids.log; timeouts on every run.
#   bash run.sh tent          builds, then renders tent-v0..v2
#   bash run.sh all
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
HERE="D:/projects/chewy-life-3d/tools/blender/work/codex/siege-camp"
PIECE=${1:-all}
timeout 900 "$BL" --background --factory-startup --python "$HERE/build_siege-camp.py" -- --piece "$PIECE" > "$HERE/build-$PIECE.log" 2>&1 &
P=$!; echo "build $PIECE $P" >> "$HERE/pids.log"; wait $P
grep -E "^SC |^DGO .* (tris|bounds|check)|Traceback|Error|^  File" "$HERE/build-$PIECE.log" | cut -c1-260
