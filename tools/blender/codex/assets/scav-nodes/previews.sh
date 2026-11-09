#!/bin/bash
# the standard preview of every GLB, one Blender at a time, each PID recorded: bash previews.sh [model ...]
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
cd "$(dirname "$0")"; mkdir -p logs preview
MODELS="${*:-driftwood riverStone petalDrift mulberry culms mossRubble cocoons shoots branches terrace mapleLeaves honeyLog seaDrift seaStones netScraps seaGlass seaweed pine sinter iceCrystal snowForage}"
for M in $MODELS; do for L in full taken; do
  N=prop-scav-$M-$L
  timeout 300 "$BL" --background --factory-startup --python ../../../codex/preview.py -- --in ../../../../../public/models/$N.glb --out preview/$N > logs/pv-$N.log 2>&1 &
  PID=$!; echo "pv $N $PID" >> logs/pids.txt; wait $PID || echo "FAILED $N"
done; done
grep -l "Traceback" logs/pv-*.log 2>/dev/null
echo PREVIEWS DONE
