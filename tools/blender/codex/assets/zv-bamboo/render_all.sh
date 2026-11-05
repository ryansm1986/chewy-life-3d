#!/bin/bash
# build + review renders:  PIECE=elder bash render_all.sh elder shop   (PIECE empty: renders only)
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
cd "$(dirname "$0")"; mkdir -p preview logs
if [ -n "$PIECE" ]; then
  timeout 900 "$BL" --background --factory-startup --python build_zv-bamboo.py -- --piece $PIECE > logs/build-$PIECE.log 2>&1
  grep "^ZV .* \(tris\|info\|check\|bounds\)\|Error\|Traceback" logs/build-$PIECE.log
fi
for P in "$@"; do
  TY=1.6; RD=15.5
  case $P in
    elder) DOOR=0,2.28; YA=0; REF=refs/bamboo-besieged-elder-a.png;;
    shop) DOOR=0,1.97; YA=39; REF=refs/bamboo-besieged-shop-a.png;;
    inn) DOOR=0,1.85; YA=-40; REF=refs/bamboo-besieged-inn-a.png; TY=2.0;;
    dojo) DOOR=0,2.35; YA=78; REF=refs/bamboo-besieged-dojo-a.png;;
    craft) DOOR=0,1.65; YA=-73; REF=refs/bamboo-besieged-craft-a.png;;
    gate) DOOR=0,1.2; YA=0; REF=""; TY=1.2; RD=10;;
    lanternPost) DOOR=0.6,0.6; YA=0; REF=""; TY=0.9; RD=7;;
  esac
  G=../../../../../public/models/zv-bamboo-$P.glb
  timeout 900 "$BL" --background --factory-startup --python ../../../codex/preview.py -- --in $G --out preview/$P > logs/pv-$P.log 2>&1 &
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --tag $P --door $DOOR --ty $TY --refdist $RD ${REF:+--ref $REF} --refyaw $YA --kit kitdump/kit-$P.obj --hide saved --only kitcmp > logs/rvk-$P.log 2>&1 &
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --tag $P --door $DOOR --ty $TY --hide saved --only gamecam > logs/rvg-$P.log 2>&1 &
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --tag $P-saved --door $DOOR --ty $TY --hide siege --only gamecam > logs/rvs-$P.log 2>&1 &
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --tag $P --door $DOOR --ty $TY --hide siege --only close > logs/rvc-$P.log 2>&1 &
  wait
done
grep -l "Error\|Traceback" logs/rv*.log logs/pv*.log 2>/dev/null
rm -f *.blend1
