#!/bin/bash
# build + review renders:  PIECE=hokora bash run.sh hokora   (PIECE empty: renders only; KITONLY=1: render the kit dumps)
# Records every Blender PID in logs/pids.txt
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
cd "$(dirname "$0")"; mkdir -p preview logs
if [ -n "$PIECE" ]; then
  timeout 900 "$BL" --background --factory-startup --python build_dg-maple.py -- --piece $PIECE > logs/build-$PIECE.log 2>&1 &
  echo "build $PIECE $!" >> logs/pids.txt; wait
  grep "^DGB .* \(tris\|info\|check\|bounds\|wrote\)\|Error\|Traceback" logs/build-$PIECE.log
fi
for P in "$@"; do
  case $P in
    hokora) TY=0.7; KIT=kitdump/kit-hokora-0.obj; CAP=1.7,0.5; RD=8; G=hokora;;
    rootTangle-v0) TY=0.3; KIT=kitdump/kit-rootTangle-0.obj; CAP=1.5,1.3; RD=7; G=rootTangle-v0;;
    rootTangle-v1) TY=0.3; KIT=kitdump/kit-rootTangle-1.obj; CAP=1.5,1.3; RD=7; G=rootTangle-v1;;
    fallenBranch-v0) TY=0.15; KIT=kitdump/kit-fallenBranch-0.obj; CAP=1.8,1.2; RD=7; G=fallenBranch-v0;;
    fallenBranch-v1) TY=0.15; KIT=kitdump/kit-fallenBranch-1.obj; CAP=1.8,1.2; RD=7; G=fallenBranch-v1;;
    stump) TY=0.3; KIT=kitdump/kit-stump-0.obj; CAP=1.2,0.6; RD=5; G=stump;;
    hoshigakiRack) TY=0.9; KIT=kitdump/kit-hoshigakiRack-0.obj; CAP=1.4,0.7; RD=7; G=hoshigakiRack;;
    sakeTable) TY=0.3; KIT=kitdump/kit-sakeTable-0.obj; CAP=1.0,0.9; RD=5; G=sakeTable;;
  esac
  if [ -n "$KITONLY" ]; then
    timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $KIT --out preview/kit --tag kit-$P --ty $TY --cap $CAP --only close --closedist $RD > logs/rvkit-$P.log 2>&1 &
    echo "rvkit $P $!" >> logs/pids.txt; continue
  fi
  GLB=../../../../../public/models/dg-maple-$G.glb
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
