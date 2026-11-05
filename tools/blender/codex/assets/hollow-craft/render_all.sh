#!/bin/bash
# build + review renders for the listed pieces:  PIECE=all bash render_all.sh farm-1 kiln-1
# Every Blender run is capped by timeout 900; their Windows PIDs are logged to logs/pids.txt (stop only those).
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
cd "$(dirname "$0")"; mkdir -p preview logs
if [ -n "$PIECE" ]; then
  timeout 900 "$BL" --background --factory-startup --python build_hollow-craft.py -- --piece $PIECE > logs/build-$PIECE.log 2>&1
  grep "^HC .* \(tris\|info\|check\|pid\)\|Error\|Traceback" logs/build-$PIECE.log
fi
for P in "$@"; do
  TY=0.8; KEEP=""
  case $P in
    farm-1) DOOR=0,1.45; KIT=kit-farm-1; TY=0.5;;
    farm-2) DOOR=0,1.45; KIT=kit-farm-2; TY=0.5;;
    kiln-1|kiln-2) DOOR=0.4,1.45; KIT=kit-$P; KEEP="--keep kit_hot"; TY=0.9;;
    lumber-1) DOOR=0,1.45; KIT=kit-$P; TY=0.8;;
    lumber-2) DOOR=0,1.45; KIT=kit-$P; KEEP="--keep kit_anim"; TY=0.8;;
    fishingHut-1|fishingHut-2) DOOR=-0.25,0.1; KIT=kit-$P; TY=1.0;;
  esac
  G=../../../../../public/models/$P.glb
  timeout 900 "$BL" --background --factory-startup --python ../../../codex/preview.py -- --in $G --out preview/$P > logs/pv-$P.log 2>&1 &
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --tag $P --door $DOOR --ty $TY --refdist 14 --refyaw -45 --kit kitdump/$KIT.obj $KEEP --only kitcmp > logs/rva-$P.log 2>&1 &
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --tag $P-b --door $DOOR --ty $TY --refdist 14 --refyaw 45 --kit kitdump/$KIT.obj $KEEP --only kitcmp > logs/rvb-$P.log 2>&1 &
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --tag $P --door $DOOR --ty $TY --kit kitdump/$KIT.obj $KEEP --only gamecam > logs/rvg-$P.log 2>&1 &
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --tag $P --door $DOOR --ty $TY --kit kitdump/$KIT.obj $KEEP --only close > logs/rvc-$P.log 2>&1 &
  wait
  grep -h "RV pid" logs/rv?-$P.log >> logs/pids.txt
done
grep -l "Error\|Traceback" logs/rv*.log logs/pv*.log 2>/dev/null
rm -f *.blend1
