#!/bin/bash
# review renders: bash render_all.sh bridge fence-1-v0 ...   (each Blender run logs its pid: "RV pid" / the preview's)
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
cd "$(dirname "$0")"; mkdir -p preview logs
one() {
  P=$1; GR='#86c060'; CAP='0.85,-0.75'
  case $P in
    bridge) TY=1.0; CL=24; GR='#6aaed0'; CAP='2.3,-2.6';;
    fence*) TY=0.35; CL=3.6;;
    flowerBed*) TY=0.2; CL=3.0;;
  esac
  G=../../../../../public/models/$P.glb; K=kitdump/kit-${P%%-1-v*}-1-v${P##*-v}.obj; [ "$P" = bridge ] && K=kitdump/kit-bridge-1-v0.obj
  timeout 900 "$BL" --background --factory-startup --python ../../../codex/preview.py -- --in $G --out preview/$P > logs/pv-$P.log 2>&1
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --tag $P --ty $TY --close $CL --kit $K --ground "$GR" --cap $CAP > logs/rv-$P.log 2>&1
  case $P in fence*) timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --tag $P --ty $TY --close 4.4 --only run > logs/rr-$P.log 2>&1;; esac
}
# three lanes
L1=(); L2=(); L3=(); i=0
for P in "$@"; do case $((i % 3)) in 0) L1+=($P);; 1) L2+=($P);; 2) L3+=($P);; esac; i=$((i+1)); done
( for P in "${L1[@]}"; do one $P; done ) & ( for P in "${L2[@]}"; do one $P; done ) & ( for P in "${L3[@]}"; do one $P; done ) &
wait
grep -h "RV pid" logs/rv-*.log logs/rr-*.log 2>/dev/null
grep -l "Error\|Traceback" logs/rv*.log logs/rr*.log logs/pv*.log 2>/dev/null
rm -f *.blend1
echo RENDERS DONE
