#!/bin/bash
# build + review renders:  PIECE=iwakura bash run.sh iwakura   (PIECE empty: renders only). Records every Blender PID in logs/pids.txt
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
cd "$(dirname "$0")"; mkdir -p preview logs
if [ -n "$PIECE" ]; then
  timeout 900 "$BL" --background --factory-startup --python build_rg-bamboo.py -- --piece $PIECE > logs/build-$PIECE.log 2>&1 &
  echo "build $PIECE $!" >> logs/pids.txt; wait
  grep "^RG .* \(tris\|info\|check\|bounds\|wrote\)\|Error\|Traceback" logs/build-$PIECE.log
fi
for P in "$@"; do
  case $P in
    ruinedShrine) TY=0.8; KIT=kitdump/kit-ruinedShrine-0.obj; CAP=0.6,1.9; RD=14;;
    iwakura) TY=0.7; KIT=kitdump/kit-iwakura-1.obj; CAP=1.9,0.4; RD=10;;
    torii) TY=1.8; KIT=kitdump/kit-torii-2.obj; CAP=0.0,1.0; RD=13;;
    lantern) TY=0.6; KIT=kitdump/kit-lantern-11.obj; CAP=0.8,0.4; RD=6;;
    chimes) TY=1.4; KIT=kitdump/kit-chimes-0.obj; CAP=2.1,0.8; RD=10;;
    bambooBench) TY=0.4; KIT=kitdump/kit-bambooBench-0.obj; CAP=1.0,0.5; RD=5;;
  esac
  G=../../../../../public/models/rg-bamboo-$P.glb
  timeout 900 "$BL" --background --factory-startup --python ../../../codex/preview.py -- --in $G --out preview/$P > logs/pv-$P.log 2>&1 &
  echo "pv $P $!" >> logs/pids.txt
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --tag $P --ty $TY --cap $CAP --only gamecam > logs/rvg-$P.log 2>&1 &
  echo "rvg $P $!" >> logs/pids.txt
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --tag $P --ty $TY --cap $CAP --kit $KIT --refdist $RD --only kitcmp > logs/rvk-$P.log 2>&1 &
  echo "rvk $P $!" >> logs/pids.txt
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --tag $P --ty $TY --cap $CAP --only close > logs/rvc-$P.log 2>&1 &
  echo "rvc $P $!" >> logs/pids.txt
  wait
done
grep -l "Error\|Traceback" logs/rv*.log logs/pv*.log 2>/dev/null
rm -f *.blend1
echo RUN DONE
