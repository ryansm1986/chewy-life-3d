#!/bin/bash
# run one headless Blender job with a timeout, recording its PID (ours only):  bash bl.sh <log> <script> [args...]
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
cd "$(dirname "$0")"; LOG=$1; shift; S=$1; shift
timeout 900 "$BL" --background --factory-startup --python "$S" -- "$@" > "$LOG" 2>&1 &
P=$!; echo "$P $(date +%T) $S $*" >> logs/pids.txt; wait $P
