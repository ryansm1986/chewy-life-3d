#!/bin/bash
# build pieces in the background of this shell, recording the PID:  bash bl.sh driftwood,riverStone
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
cd "$(dirname "$0")"; mkdir -p logs
LOG=logs/build-$$.log
timeout 900 "$BL" --background --factory-startup --python build_scav-nodes.py -- --piece "$1" > "$LOG" 2>&1 &
PID=$!; echo "build $1 $PID" >> logs/pids.txt; wait $PID; echo "exit $?"
grep -E "^SCV |Error|Traceback|^  File|line [0-9]+" "$LOG" | grep -v "^SCV pid" | head -60
