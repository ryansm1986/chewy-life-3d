#!/bin/bash
# build:  bash run.sh <piece>   Every Blender PID goes to logs/pids.txt
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
cd "$(dirname "$0")"; mkdir -p preview logs
P=$1
timeout 900 "$BL" --background --factory-startup --python build_poi-north.py -- --piece $P > logs/build-$P.log 2>&1 &
echo "build $P $!" >> logs/pids.txt; wait
grep "^POI .*\(tris\|info\|check\|bounds\|wrote\|tree\|leaves\)\|Error\|Traceback\|^  File" logs/build-$P.log | cut -c1-500
rm -f *.blend1
