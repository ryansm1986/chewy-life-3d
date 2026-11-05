#!/bin/bash
# build + review:  bash run.sh build <piece|all>   |   bash run.sh render <mode> [variants] [extra args]
# Every Blender run is capped by timeout 900; its Windows PID is logged to logs/pids.txt (stop only those).
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
cd "$(dirname "$0")"; mkdir -p preview logs
case $1 in
  build) P=${2:-all}; LOG=logs/build-${P//[:,]/_}.log
    timeout 900 "$BL" --background --factory-startup --python build_home-1.py -- --piece $P > $LOG 2>&1
    grep -h "pid" $LOG >> logs/pids.txt
    grep "^H1 .* \(tris\|info\|check\|bounds\)\|Error\|Traceback" $LOG;;
  render) M=$2; V=${3:-0,1,2,3,4,5,6,7}; shift 3; LOG=logs/render-$M-${V//,/}.log
    timeout 900 "$BL" --background --factory-startup --python render_sheet.py -- --level 1 --mode $M --variants $V "$@" > $LOG 2>&1
    grep -h "RS pid" $LOG >> logs/pids.txt
    grep "RS done\|Error\|Traceback" $LOG;;
esac
rm -f blend/*.blend1
