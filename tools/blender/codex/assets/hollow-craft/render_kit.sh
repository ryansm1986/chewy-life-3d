#!/bin/bash
# render a kit dump alone at the game camera: bash render_kit.sh farm-1 [door x,z]
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
cd "$(dirname "$0")"; mkdir -p preview logs
P=$1; DOOR=${2:-0,1.45}
timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in kitdump/kit-$P.obj --out preview --tag kit-$P --door $DOOR --only gamecam > logs/rvk-$P.log 2>&1 &
timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in kitdump/kit-$P.obj --out preview --tag kit-$P --door $DOOR --only close > logs/rvkc-$P.log 2>&1 &
wait
grep -h "RV pid\|Error\|Traceback" logs/rvk-$P.log logs/rvkc-$P.log
