"""full-body turnaround rows (sheet px): silhouette and class extents per row. python measure/body.py VIEW x0 x1"""
import numpy as np, sys
from PIL import Image
from scipy import ndimage as ndi
IM = np.array(Image.open('refs/sheet.png').convert('RGB')).astype(int); R, G, B = IM[..., 0], IM[..., 1], IM[..., 2]
BG = np.array([246, 242, 233]); dbg = np.abs(IM - BG).sum(-1)
x0, x1 = int(sys.argv[1]), int(sys.argv[2]); Y0, Y1 = 40, 503
sil = dbg > 18; m = np.zeros_like(sil); m[Y0:Y1, x0:x1] = sil[Y0:Y1, x0:x1]
m = ndi.binary_fill_holes(ndi.binary_closing(m, iterations=2)); lab, n = ndi.label(m); s = np.bincount(lab.ravel()); s[0] = 0; m = lab == np.argmax(s)
fur = (R > 200) & (G > 95) & (G < 200) & (B < 125) & (R - B > 110)
kim = (B > 140) & (B - R > 25) & (R < 170)
skirt = (B > 50) & (B - R > 12) & (R < 110) & (G < 90)
sash = (R > 200) & (G < 120) & (B > 60) & (B < 130)
bell = (R > 200) & (G > 150) & (B < 110) & (G < 225) & ~fur
whitec = (R > 225) & (G > 205) & (B > 185) & (dbg > 18)
ys, xs = np.nonzero(m); print('silhouette', xs.min(), ys.min(), xs.max(), ys.max())
def ext(mask, y):
    xx = np.nonzero(mask[y, x0:x1] & m[y, x0:x1])[0]
    return '%3d-%3d' % (xx.min() + x0, xx.max() + x0) if len(xx) > 1 else '   -   '
for y in range(Y0, Y1, 6):
    xx = np.nonzero(m[y])[0]
    if not len(xx): continue
    print(y, 'sil %3d-%3d w%3d' % (xx.min(), xx.max(), xx.max() - xx.min()), 'fur', ext(fur, y), 'kim', ext(kim, y), 'skirt', ext(skirt, y), 'sash', ext(sash, y), 'bell', ext(bell, y), 'white', ext(whitec, y))
