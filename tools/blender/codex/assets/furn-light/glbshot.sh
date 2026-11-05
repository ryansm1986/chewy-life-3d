#!/bin/sh
# GLB-only furnsheet cells (the game's toon materials and camera), via the runtime injection in glbsheet.js (no src edits).
#   sh glbshot.sh <ids> <out-name> [size] [cols] [extra url params, e.g. &night]
IDS=$1; OUT=$2; S=${3:-600}; C=${4:-$(echo "$IDS" | tr ',' '\n' | wc -l)}; EX=$5
N=$(echo "$IDS" | tr ',' '\n' | wc -l); ROWS=$(( (N + C - 1) / C ))
cd D:/projects/chewy-life-3d
SHOT_DIR=${SHOT_DIR:-D:/projects/chewy-life-3d/tools/blender/work/codex/furn-light/preview} timeout 150 node tools/shot.mjs \
  --url "/?test=furnsheet&ids=$IDS&cols=$C&size=$S$EX" --w $((C * S)) --h $((ROWS * (S + 34))) --wait 300 \
  --eval "$(cat tools/blender/work/codex/furn-light/glbsheet.js)" --sleep 1200 --snap "$OUT"
