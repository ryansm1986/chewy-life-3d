#!/bin/bash
# build + review renders:  PIECE=umiHokora bash run.sh umiHokora   (PIECE empty: renders only; KITONLY=1: render the kit dumps)
# Records every Blender PID in logs/pids.txt
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
cd "$(dirname "$0")"; mkdir -p preview logs
if [ -n "$PIECE" ]; then
  timeout 900 "$BL" --background --factory-startup --python build_dg-tidepool.py -- --piece $PIECE > logs/build-$PIECE.log 2>&1 &
  echo "build $PIECE $!" >> logs/pids.txt; wait
  grep "^DGT .* \(tris\|info\|check\|bounds\|wrote\)\|Error\|Traceback" logs/build-$PIECE.log
fi
for P in "$@"; do
  case $P in
    umiHokora) TY=0.7; KIT=kitdump/kit-umiHokora-0.obj; CAP=-1.5,0.6; RD=8;;
    crabHusk) TY=0.2; KIT=kitdump/kit-crabHusk-0.obj; CAP=-1.7,0.2; RD=7;;
    brazier) TY=0.3; KIT=kitdump/kit-brazier-0.obj; CAP=0.9,0.3; RD=4.5;;
    weddedPair) TY=1.2; KIT=kitdump/kit-weddedPair-0.obj; CAP=0.0,1.5; RD=11;;
    planks) TY=0.05; KIT=kitdump/kit-planks-0.obj; CAP=0.3,0.2; RD=6;;
    netPile) TY=0.25; KIT=kitdump/kit-netPile-0.obj; CAP=-1.6,0.6; RD=6;;
  esac
  if [ -n "$KITONLY" ]; then
    timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $KIT --out preview/kit --tag kit-$P --ty $TY --cap $CAP --only close --closedist $RD > logs/rvkit-$P.log 2>&1 &
    echo "rvkit $P $!" >> logs/pids.txt; continue
  fi
  GLB=../../../../../public/models/dg-tidepool-$P.glb
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
