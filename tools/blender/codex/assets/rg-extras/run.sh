#!/bin/bash
# build + review renders:  PIECE=bale bash run.sh bale-v0 bale-v1  (PIECE empty: renders only). Records every Blender PID in logs/pids.txt
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
cd "$(dirname "$0")"; mkdir -p preview logs
if [ -n "$PIECE" ]; then
  timeout 900 "$BL" --background --factory-startup --python build_rg-extras.py -- --piece $PIECE > logs/build-$PIECE.log 2>&1 &
  echo "build $PIECE $!" >> logs/pids.txt; wait
  grep "^DGO .* \(tris\|check\|bounds\|wrote\)\|Error\|Traceback\|^  File" logs/build-$PIECE.log
fi
for P in "$@"; do
  case $P in
    taikobashi) M=rg-maple-taikobashi; TY=0.5; KIT=kitdump/kit-taikobashi-0.obj; CAP=0.0,0.0; RD=15; GR='#6fa6b8';;
    bench) M=rg-maple-bench; TY=0.6; KIT=kitdump/kit-bench-0.obj; CAP=-0.2,1.0; RD=6; GR='#7d9a58';;
    sheaf-v0) M=rg-maple-sheaf-v0; TY=0.5; KIT=kitdump/kit-sheaf-0.obj; CAP=0.8,0.5; RD=4.5; GR='#9c8a58';;
    sheaf-v1) M=rg-maple-sheaf-v1; TY=0.5; KIT=kitdump/kit-sheaf-1.obj; CAP=0.8,0.5; RD=4.5; GR='#9c8a58';;
    bale-v0) M=rg-maple-bale-v0; TY=0.5; KIT=kitdump/kit-bale-0.obj; CAP=1.0,0.6; RD=5; GR='#9c8a58';;
    bale-v1) M=rg-maple-bale-v1; TY=0.5; KIT=kitdump/kit-bale-1.obj; CAP=1.0,0.6; RD=5; GR='#9c8a58';;
    snowTorii-v0) M=rg-onsen-snowTorii-v0; TY=1.7; KIT=kitdump/kit-snowTorii-0.obj; CAP=0.0,1.0; RD=13; GR='#c8d4e8';;
    snowTorii-v1) M=rg-onsen-snowTorii-v1; TY=1.9; KIT=kitdump/kit-snowTorii-9.obj; CAP=0.0,1.0; RD=13; GR='#c8d4e8';;
  esac
  GLB=../../../../../public/models/$M.glb
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $GLB --out preview --tag $P --ty $TY --cap $CAP --only gamecam --ground "$GR" > logs/rvg-$P.log 2>&1 &
  echo "rvg $P $!" >> logs/pids.txt
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $GLB --out preview --tag $P --ty $TY --cap $CAP --kit $KIT --refdist $RD --only kitcmp --ground "$GR" > logs/rvk-$P.log 2>&1 &
  echo "rvk $P $!" >> logs/pids.txt
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $GLB --out preview --tag $P --ty $TY --cap $CAP --only close --closedist $RD --ground "$GR" > logs/rvc-$P.log 2>&1 &
  echo "rvc $P $!" >> logs/pids.txt
  wait
done
wait
grep -l "Error\|Traceback" logs/rv*.log 2>/dev/null
rm -f *.blend1
echo RUN DONE
