"""probe the sheet: foreground mask and per-row extents of a view region"""
import sys
from PIL import Image; import numpy as np
im = np.array(Image.open('refs/sheet.png').convert('RGB')).astype(float)
bg = np.array([245, 241, 236.])
def fg(x0, y0, x1, y1, thr=28):
    c = im[y0:y1, x0:x1]; d = np.linalg.norm(c - bg, axis=2); return d > thr
def rows(x0, y0, x1, y1, step=5, thr=28):
    m = fg(x0, y0, x1, y1, thr)
    for r in range(0, y1 - y0, step):
        xs = np.where(m[r])[0]
        if len(xs): print(y0 + r, x0 + xs.min(), x0 + xs.max(), xs.max() - xs.min(), 'segments', np.sum(np.diff(xs) > 3) + 1)
        else: print(y0 + r, '-')
if __name__ == '__main__':
    a = [int(v) for v in sys.argv[1:6]]
    rows(*a)
