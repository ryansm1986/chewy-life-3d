#!/bin/bash
# review renders for the listed pieces:  bash render_all.sh stoneLantern bench sakuraPlanter
# (each Blender run prints its pid to its log: "RV pid" / the preview's own line)
BL="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
cd "$(dirname "$0")"; mkdir -p preview logs
for P in "$@"; do
  case $P in
    stoneLantern) TY=0.8; CL=4.5;;
    bench) TY=0.45; CL=3.6;;
    sakuraPlanter) TY=0.95; CL=5.2;;
    streetLamp) TY=1.2; CL=6;;
    park) TY=0.5; CL=10;;
    miniTorii) TY=0.55; CL=4.5;;
    koiStatue) TY=0.8; CL=5;;
    lanternString) TY=1.1; CL=6.5;;
    sprinkler) TY=0.3; CL=3;;
    *) TY=0.7; CL=5;;
  esac
  G=../../../../../public/models/$P.glb
  timeout 900 "$BL" --background --factory-startup --python ../../../codex/preview.py -- --in $G --out preview/$P > logs/pv-$P.log 2>&1 &
  timeout 900 "$BL" --background --factory-startup --python render_views.py -- --in $G --out preview --tag $P --ty $TY --close $CL --kit kitdump/kit-$P-1.obj > logs/rv-$P.log 2>&1 &
done
wait
grep -h "RV pid" logs/rv-*.log
grep -l "Error\|Traceback" logs/rv*.log logs/pv*.log 2>/dev/null
rm -f *.blend1
