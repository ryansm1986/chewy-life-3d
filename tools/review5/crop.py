# usage: python crop.py in.png x y w h scale out_name
import sys, os
from PIL import Image
D = r'C:\Users\there\AppData\Local\Temp\claude\D--projects-chewy-life-3d\8589dfce-d448-4273-9d64-a50029bd572d\scratchpad\review5'
src, x, y, w, h, sc, out = sys.argv[1], *map(int, sys.argv[2:7]), sys.argv[7]
im = Image.open(os.path.join(D, src + '.png')).crop((x, y, x + w, y + h))
im = im.resize((w * sc, h * sc), Image.LANCZOS)
im.save(os.path.join(D, out + '.png'))
print('ok', out)
