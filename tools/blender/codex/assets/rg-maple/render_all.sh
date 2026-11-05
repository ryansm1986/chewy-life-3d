#!/bin/bash
# build (optional) + review renders:  PIECE=lookout,jizo bash render_all.sh lookout jizo
# Each Blender run prints its own pid ("RG build pid", "RV pid"); timeouts stop only the runs started here.
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
cd "$(dirname "$0")"; mkdir -p preview logs
if [ -n "$PIECE" ]; then
  timeout 900 "$BL" --background --factory-startup --python build_rg-maple.py -- --piece $PIECE > logs/build.log 2>&1
  grep "^VP .* \(tris\|parts\|bounds\|check\)\|Error\|Traceback" logs/build.log
fi
for P in "$@"; do
  TX=0
  case $P in
    lookout) KITO=kit-lookout-0; TY=0.7; CAP=-0.4,-1.7; KD=14; FAR=18; NEAR=10; GY=22; CL=7;;
    jizo) KITO=kit-jizo-9; TY=0.6; CAP=0.9,0.2; KD=6; FAR=18; NEAR=10; GY=40; CL=2.6;;
    jizoTrio) KITO=kit-jizoTrio-0; TY=0.35; CAP=1.2,0.3; KD=6; FAR=18; NEAR=10; GY=45; CL=2.6;;
    kakashi) KITO=kit-kakashi-0; TY=1.0; CAP=1.1,0.2; KD=8; FAR=18; NEAR=10; GY=80; CL=3.8;;
    tanuki) KITO=kit-tanuki-1; TY=0.6; CAP=0.95,0.2; KD=6; FAR=18; NEAR=10; GY=0; CL=2.8;;
    warabocchi) KITO=kit-warabocchi-0; TY=1.0; CAP=1.2,0.2; KD=8; FAR=18; NEAR=10; GY=30; CL=4.5;;
    hasa) KITO=kit-hasa-1; TY=0.8; TX=1.7; CAP=1.7,-0.9; KD=10; FAR=18; NEAR=10; GY=20; CL=6;;
    komodaru) KITO=kit-komodaru-0; TY=0.3; CAP=0.7,0.2; KD=5; FAR=18; NEAR=10; GY=0; CL=2.0;;
  esac
  G=../../../../../public/models/rg-maple-$P.glb
  timeout 900 "$BL" --background --factory-startup --python ../../../codex/preview.py -- --in $G --out preview/$P > logs/pv-$P.log 2>&1 &
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --piece $P --kit kitdump/$KITO.obj --ty $TY --tx $TX --cap $CAP --far $FAR --near $NEAR --kd $KD --gameyaw $GY --close $CL --only gamecam > logs/rvg-$P.log 2>&1 &
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --piece $P --kit kitdump/$KITO.obj --ty $TY --tx $TX --cap $CAP --far $FAR --near $NEAR --kd $KD --gameyaw $GY --close $CL --only kitcmp > logs/rvk-$P.log 2>&1 &
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --piece $P --kit kitdump/$KITO.obj --ty $TY --tx $TX --cap $CAP --far $FAR --near $NEAR --kd $KD --gameyaw $GY --close $CL --only close > logs/rvc-$P.log 2>&1 &
  wait
done
grep -h "RV pid\|RG build pid" logs/*.log
grep -l "Error\|Traceback" logs/rv*.log logs/pv*.log 2>/dev/null
rm -f *.blend1
