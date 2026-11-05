#!/bin/sh
# Rebuild every piece, then render each GLB: the furnsheet-angle review render (preview/<id>.png) and the standard
# preview sheet + stats (preview/<id>/). Every Blender run prints its own PID (logged to pids.log).
B="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
D=D:/projects/chewy-life-3d/tools/blender/work/codex/furn-seat
M=D:/projects/chewy-life-3d/public/models
cd $D
timeout 900 "$B" --background --factory-startup --python build_furn-seat.py -- --piece all > build.log 2>&1
grep "pid" build.log >> pids.log
for id in chabudai zabutonPink zabutonBlue woodTable sideTable woodChair armchair workbench melonStool napPillow bambooBench acornStool; do
  timeout 300 "$B" --background --factory-startup --python render_furn.py -- --in $M/furn-$id.glb --out $D/preview/$id.png --res 800 > preview/$id.log 2>&1
  timeout 300 "$B" --background --factory-startup --python D:/projects/chewy-life-3d/tools/blender/codex/preview.py -- --in $M/furn-$id.glb --out $D/preview/$id >> preview/$id.log 2>&1
  grep -i "pid" preview/$id.log >> pids.log
done
echo done
