#!/bin/sh
# re-export the rig and shoot the in-game face rows (front, 45l, 45r): happy at $SQ, blink; montage -> scratch/game/round.png
cd D:/projects/chewy-life-3d/tools/blender/work/codex/kuma-toy
timeout 900 python run_blender.py scratch/exp.log 880 -- --background kuma-toy_rig.blend --python D:/projects/chewy-life-3d/tools/blender/codex/hero_export.py -- --out D:/projects/chewy-life-3d/tools/blender/work/codex/kuma-toy/export --name kuma_toy --height 1.407 >/dev/null
grep HERO_EXPORT scratch/exp.log
cd D:/projects/chewy-life-3d
rm -rf tools/blender/work/codex/kuma-toy/scratch/game/r
RIG_DIR=D:/projects/chewy-life-3d/tools/blender/work/codex/kuma-toy/export SQ=${SQ:-0.30,-0.30} CX=420 CY=330 timeout 300 node tools/blender/work/codex/kuma-toy/scratch/game-face.mjs tools/blender/work/codex/kuma-toy/scratch/game/r front,45l,45r happy,blink >/dev/null 2>&1
cd tools/blender/work/codex/kuma-toy/scratch/game && python -c "
from PIL import Image
ims=[[Image.open(f'r/{v}-{s}.png') for v in ('front','45l','45r')] for s in ('happy','blink')]
w,h=ims[0][0].size; c=Image.new('RGB',(3*w,2*h))
for i,r in enumerate(ims):
    for j,a in enumerate(r): c.paste(a,(j*w,i*h))
c.save('round.png'); c.crop((0,0,w,2*h)).save('round_front.png')"
