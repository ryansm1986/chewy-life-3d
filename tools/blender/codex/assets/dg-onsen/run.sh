#!/bin/bash
# build + review renders:  PIECE=snowHokora bash run.sh snowHokora   (PIECE empty: renders only; KITONLY=1: render the kit dumps)
# Records every Blender PID in logs/pids.txt
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
cd "$(dirname "$0")"; mkdir -p preview logs
if [ -n "$PIECE" ]; then
  timeout 900 "$BL" --background --factory-startup --python build_dg-onsen.py -- --piece $PIECE > logs/build-$PIECE.log 2>&1 &
  echo "build $PIECE $!" >> logs/pids.txt; wait
  grep "^DGO .* \(tris\|info\|check\|bounds\|wrote\)\|Error\|Traceback" logs/build-$PIECE.log
fi
for P in "$@"; do
  GR='#7c8498'
  case $P in
    frozenBarrels) TY=0.3; KIT=kitdump/kit-frozenBarrels-0.obj; CAP=1.1,0.6; RD=5;;
    snowHokora) TY=0.7; KIT=kitdump/kit-snowHokora-0.obj; CAP=1.7,0.5; RD=8;;
    bathDeck) TY=0.2; KIT=kitdump/kit-bathDeck-0.obj; CAP=1.3,0.8; RD=5.5;;
    towelRack) TY=0.7; KIT=kitdump/kit-towelRack-0.obj; CAP=1.0,0.6; RD=5.5;;
    snowMonkey) TY=0.15; KIT=kitdump/kit-snowMonkey-0.obj; CAP=0.7,0.3; RD=3; GR='#5aa8b4';;
    iceSpire-v0) TY=1.1; KIT=kitdump/kit-iceSpire-0.obj; CAP=1.5,1.0; RD=9;;
    iceSpire-v1) TY=1.1; KIT=kitdump/kit-iceSpire-1.obj; CAP=1.5,1.0; RD=9;;
    coldBrazier) TY=0.4; KIT=kitdump/kit-coldBrazier-0.obj; CAP=0.8,0.3; RD=3.5;;
    storePile) TY=0.4; KIT=kitdump/kit-storePile-0.obj; CAP=1.6,1.0; RD=6.5;;
    lanternPost) TY=0.9; KIT=kitdump/kit-lanternPost-0.obj; CAP=0.9,0.5; RD=6;;
  esac
  if [ -n "$KITONLY" ]; then
    timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $KIT --out preview/kit --tag kit-$P --ty $TY --cap $CAP --only close --closedist $RD --ground "$GR" > logs/rvkit-$P.log 2>&1 &
    echo "rvkit $P $!" >> logs/pids.txt; continue
  fi
  GLB=../../../../../public/models/dg-onsen-$P.glb
  timeout 900 "$BL" --background --factory-startup --python ../../../codex/preview.py -- --in $GLB --out preview/$P > logs/pv-$P.log 2>&1 &
  echo "pv $P $!" >> logs/pids.txt
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $GLB --out preview --tag $P --ty $TY --cap $CAP --only gamecam --ground "$GR" > logs/rvg-$P.log 2>&1 &
  echo "rvg $P $!" >> logs/pids.txt
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $GLB --out preview --tag $P --ty $TY --cap $CAP --kit $KIT --refdist $RD --only kitcmp --ground "$GR" > logs/rvk-$P.log 2>&1 &
  echo "rvk $P $!" >> logs/pids.txt
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $GLB --out preview --tag $P --ty $TY --cap $CAP --only close --closedist $RD --ground "$GR" > logs/rvc-$P.log 2>&1 &
  echo "rvc $P $!" >> logs/pids.txt
  wait
done
wait
grep -l "Error\|Traceback" logs/rv*.log logs/pv*.log 2>/dev/null
rm -f *.blend1
echo RUN DONE
