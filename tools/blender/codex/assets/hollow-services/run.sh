#!/bin/bash
# build + review renders:  bash run.sh <piece|all> [render pieces...]
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
cd "$(dirname "$0")"; mkdir -p preview logs
P=$1; shift
if [ -n "$P" ] && [ "$P" != "none" ]; then
  timeout 900 "$BL" --background --factory-startup --python build_hollow-services.py -- --piece $P > logs/build-$P.log 2>&1
  grep "HS .*pid\|^HS .* \(tris\|info\|check\|bounds\)\|Error\|Traceback" logs/build-$P.log
fi
for Q in "$@"; do [ "$Q" = none ] && continue
  case $Q in
    clinic) DOOR=0.2,1.45; TY=1.4; RD=13;;
    well) DOOR=0,0.6; TY=0.8; RD=7;;
    school) DOOR=-0.35,1.45; TY=1.6; RD=15;;
    onsenHall) DOOR=0.2,1.9; TY=0.8; RD=15;;
    waterTower) DOOR=0,1.2; TY=1.8; RD=12;;
    bulletinBoard) DOOR=0,0.55; TY=0.9; RD=7;;
    stashChest) DOOR=0,0.82; TY=0.8; RD=9;;
  esac
  K=$Q; [ "$Q" = onsenHall ] && K=onsen
  G=../../../../../public/models/$Q.glb
  timeout 900 "$BL" --background --factory-startup --python ../../../codex/preview.py -- --in $G --out preview/$Q > logs/pv-$Q.log 2>&1 &
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --tag $Q-a --door $DOOR --ty $TY --refdist $RD --refyaw 45 --kit kitdump/kit-$K-1.obj --only kitcmp > logs/rva-$Q.log 2>&1 &
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --tag $Q-b --door $DOOR --ty $TY --refdist $RD --refyaw -45 --kit kitdump/kit-$K-1.obj --only kitcmp > logs/rvb-$Q.log 2>&1 &
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --tag $Q --door $DOOR --ty $TY --only gamecam > logs/rvg-$Q.log 2>&1 &
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --tag $Q --door $DOOR --ty $TY --only close > logs/rvc-$Q.log 2>&1 &
  wait
  grep -h "RV pid" logs/rv?-$Q.log
done
grep -l "Error\|Traceback" logs/rv*.log logs/pv*.log 2>/dev/null
rm -f *.blend1
