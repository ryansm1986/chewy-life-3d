#!/bin/sh
# run.sh <piece|all>  : build, then render the furnsheet-camera review views for each built piece
cd D:/projects/chewy-life-3d/tools/blender/work/codex/furn-trophy
B="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
timeout 900 "$B" -b --factory-startup --python build_furn-trophy.py -- --piece "$1" > build.log 2>&1
grep -E "^FT |Error|Traceback|line [0-9]+" build.log | grep -v "INFO"
