#!/bin/bash
# build + review renders:  PIECE=hokora bash run.sh hokora   (PIECE empty: renders only; KITONLY=1: render the kit dumps)
# Records every Blender PID in logs/pids.txt
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
cd "$(dirname "$0")"; mkdir -p preview logs
if [ -n "$PIECE" ]; then
  timeout 900 "$BL" --background --factory-startup --python build_dg-bamboo.py -- --piece $PIECE > logs/build-$PIECE.log 2>&1 &
  echo "build $PIECE $!" >> logs/pids.txt; wait
  grep "^DGB .* \(tris\|info\|check\|bounds\|wrote\)\|Error\|Traceback" logs/build-$PIECE.log
fi
for P in "$@"; do
  case $P in
    hokora) TY=0.7; KIT=kitdump/kit-hokora-0.obj; CAP=1.7,0.5; RD=8; G=hokora;;
    culmStack) TY=0.4; KIT=kitdump/kit-culmStack-0.obj; CAP=1.3,0.7; RD=6; G=culmStack;;
    shootBasket) TY=0.3; KIT=kitdump/kit-shootBasket-0.obj; CAP=0.8,0.3; RD=4.5; G=shootBasket;;
    stoneMarker-v0) TY=0.45; KIT=kitdump/kit-stoneMarker-0.obj; CAP=0.75,0.35; RD=5; G=stoneMarker-v0;;
    stoneMarker-v1) TY=0.45; KIT=kitdump/kit-stoneMarker-1.obj; CAP=0.75,0.35; RD=5; G=stoneMarker-v1;;
    rockPillar-v0) TY=1.2; KIT=kitdump/kit-rockPillar-0.obj; CAP=1.6,1.0; RD=10; G=rockPillar-v0;;
    rockPillar-v1) TY=1.2; KIT=kitdump/kit-rockPillar-1.obj; CAP=1.6,1.0; RD=10; G=rockPillar-v1;;
    rootTangle-v0) TY=0.25; KIT=kitdump/kit-rootTangle-0.obj; CAP=1.5,1.3; RD=7; G=rootTangle-v0;;
    rootTangle-v1) TY=0.25; KIT=kitdump/kit-rootTangle-1.obj; CAP=1.5,1.3; RD=7; G=rootTangle-v1;;
    fallenBamboo) TY=0.5; KIT=kitdump/kit-fallenBamboo-0.obj; CAP=-1.6,1.4; RD=8; G=fallenBamboo;;
  esac
  if [ -n "$KITONLY" ]; then
    timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $KIT --out preview/kit --tag kit-$P --ty $TY --cap $CAP --only close --closedist $RD > logs/rvkit-$P.log 2>&1 &
    echo "rvkit $P $!" >> logs/pids.txt; continue
  fi
  GLB=../../../../../public/models/dg-bamboo-$G.glb
  timeout 900 "$BL" --background --factory-startup --python ../../../codex/preview.py -- --in $GLB --out preview/$P > logs/pv-$P.log 2>&1 &
  echo "pv $P $!" >> logs/pids.txt
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $GLB --out preview --tag $P --ty $TY --cap $CAP --only gamecam > logs/rvg-$P.log 2>&1 &
  echo "rvg $P $!" >> logs/pids.txt
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $GLB --out preview --tag $P --ty $TY --cap $CAP --kit $KIT --refdist $RD --only kitcmp > logs/rvk-$P.log 2>&1 &
  echo "rvk $P $!" >> logs/pids.txt
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $GLB --out preview --tag $P --ty $TY --cap $CAP --only close --closedist $RD > logs/rvc-$P.log 2>&1 &
  echo "rvc $P $!" >> logs/pids.txt
  wait
done
wait
grep -l "Error\|Traceback" logs/rv*.log logs/pv*.log 2>/dev/null
rm -f *.blend1
echo RUN DONE
