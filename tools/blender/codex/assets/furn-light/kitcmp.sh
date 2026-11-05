#!/bin/sh
# The kit-vs-Blender comparison in the game's own furnsheet (toon materials, same camera): the kit row on top, then the
# GLBs (injected into FURN_GLB_IDS at runtime, no src edits) below.   sh kitcmp.sh <ids> <out-name> [size] [extra params]
# (restores the 'glow' material name that src/gfx/glbAssets.js toonOf() drops, like glbsheet.js)
IDS=${1:-andonLamp,paperPendant,mushroomLamp}; OUT=${2:-sheet-kitcmp}; S=${3:-400}; EX=$4
N=$(echo "$IDS" | tr ',' '\n' | wc -l); W=$((N * S)); H=$((2 * (S + 34)))
LIST=$(echo "$IDS" | sed "s/,/','/g")
cd D:/projects/chewy-life-3d
SHOT_DIR=${SHOT_DIR:-D:/projects/chewy-life-3d/tools/blender/work/codex/furn-light/preview} timeout 150 node tools/shot.mjs \
  --url "/?test=furnsheet&ids=$IDS&cols=$N&size=$S$EX" --w $W --h $H --wait 300 \
  --eval "(async () => { const u = n => performance.getEntriesByType('resource').map(e => e.name).find(x => x.includes(n)); const m = await import(u('/src/home/furnitureMesh.js')); const ga = await import(u('/src/gfx/glbAssets.js')); const L = ['$LIST']; m.FURN_GLB_IDS.push(...L); await m.loadFurnitureGlbs(); for (const id of L) { const t = await ga.loadGlb('/models/furn-' + id + '.glb'); t.traverse(o => { if (o.isMesh && o.material && !o.material.name) o.material.name = 'glow'; }); } const t = await import(u('/src/tests/furnsheet.js')); t.default(); return JSON.stringify(window.__info); })()" \
  --sleep 1500 --snap "$OUT"
