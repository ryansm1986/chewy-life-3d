"""row silhouette extents on refs/sheet.png: python measure/sil.py x0 x1 y0 y1 step [thr]"""
import sys, numpy as np
from PIL import Image
im = np.asarray(Image.open('D:/projects/chewy-life-3d/tools/blender/work/codex/usagi-toy/refs/sheet.png').convert('RGB')).astype(int)
x0, x1, y0, y1, st = map(int, sys.argv[1:6]); thr = int(sys.argv[6]) if len(sys.argv) > 6 else 30
bg = np.array([252, 249, 242])
m = np.abs(im - bg).sum(-1) > thr
for y in range(y0, y1, st):
    xs = np.where(m[y, x0:x1])[0]
    print(y, (xs.min() + x0, xs.max() + x0, xs.max() - xs.min()) if len(xs) else None)
