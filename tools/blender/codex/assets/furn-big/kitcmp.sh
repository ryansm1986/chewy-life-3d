#!/bin/sh
# The kit-vs-Blender comparison in the game's own furnsheet (toon materials, same camera): the kit row on top, then the
# GLBs (injected into FURN_GLB_IDS at runtime, no src edits; the page's own module URLs, ?t= and all) below.   sh kitcmp.sh <ids> <out-name> [size]
IDS=${1:-futonBed,pupBasket,treasureChest}; OUT=${2:-sheet-kitcmp}; S=${3:-400}
N=$(echo "$IDS" | tr ',' '\n' | wc -l); W=$((N * S)); H=$((2 * (S + 34)))
LIST=$(echo "$IDS" | sed "s/,/','/g")
cd D:/projects/chewy-life-3d
SHOT_DIR=D:/projects/chewy-life-3d/tools/blender/work/codex/furn-big/preview timeout 150 node tools/shot.mjs \
  --url "/?test=furnsheet&ids=$IDS&cols=$N&size=$S" --w $W --h $H --wait 300 \
  --eval "(async () => { const u = n => performance.getEntriesByType('resource').map(e => e.name).find(x => x.includes(n)); const m = await import(u('/src/home/furnitureMesh.js')); m.FURN_GLB_IDS.push('$LIST'); await m.loadFurnitureGlbs(); const t = await import(u('/src/tests/furnsheet.js')); t.default(); return JSON.stringify(window.__info); })()" \
  --sleep 1500 --snap "$OUT"
