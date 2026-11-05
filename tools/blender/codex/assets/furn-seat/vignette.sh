#!/bin/sh
# A furnsheet vignette (a set staged in a real room) with this task's GLBs injected at runtime (no src edits).
#   sh vignette.sh <set> [extra url params]
SET=$1; EXTRA=$2
IDS="'chabudai','zabutonPink','zabutonBlue','woodTable','sideTable','woodChair','armchair','workbench','melonStool','napPillow','bambooBench','acornStool'"
cd D:/projects/chewy-life-3d
SHOT_DIR=D:/projects/chewy-life-3d/tools/blender/work/codex/furn-seat/preview timeout 150 node tools/shot.mjs \
  --url "/?test=furnsheet&vignette=$SET$EXTRA" --w 1400 --h 900 --wait 300 \
  --eval "(async () => { const u = n => performance.getEntriesByType('resource').map(e => e.name).find(x => x.includes(n)); const m = await import(u('/src/home/furnitureMesh.js')); for (const id of [$IDS]) if (!m.FURN_GLB_IDS.includes(id)) m.FURN_GLB_IDS.push(id); await m.loadFurnitureGlbs(); document.querySelectorAll('canvas').forEach(c => c.remove()); const t = await import(u('/src/tests/furnsheet.js')); t.default(); return JSON.stringify(window.__info); })()" \
  --sleep 2500 --snap "vignette-$SET"
