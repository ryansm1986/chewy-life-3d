"""colour-class bounding boxes on a sheet face panel: python measure/face.py x0 x1 y0 y1 cx chin W"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage
im = np.asarray(Image.open('D:/projects/chewy-life-3d/tools/blender/work/codex/usagi-toy/refs/sheet.png').convert('RGB')).astype(float)
x0, x1, y0, y1 = map(int, sys.argv[1:5]); cx, chin, W = map(float, sys.argv[5:8])
sub = im[y0:y1, x0:x1]; R, G, B = sub[..., 0], sub[..., 1], sub[..., 2]
lum = (R + G + B) / 3
cls = {
 'dark(lash/pupil/brow/mouth)': lum < 70,
 'iris_brown': (lum >= 50) & (lum < 160) & (R - B > 40) & (R > G),
 'eye_any': (lum < 160) & ~((R > 200) & (G < 190)),
 'pink_nose': (R > 200) & (G < 150) & (B > 130) & (R - G > 80),
 'blush': (R > 230) & (G > 150) & (G < 205) & (B > 150) & (B < 210) & (R - G > 40),
 'white_cl': (lum > 235),
}
def W_(v, ax): return (v - cx) / W if ax == 'x' else (chin - v) / W
for name, m in cls.items():
    lab, n = ndimage.label(m)
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    for i in np.argsort(-sizes)[:6]:
        if sizes[i] < 15: continue
        ys, xs = np.where(lab == i + 1); X0, X1, Y0, Y1 = xs.min() + x0, xs.max() + x0, ys.min() + y0, ys.max() + y0
        print('%-30s px x %d-%d y %d-%d (n %d) | W: x %.3f..%.3f (c %.3f, w %.3f)  z %.3f..%.3f (c %.3f, h %.3f)' % (
            name, X0, X1, Y0, Y1, sizes[i], W_(X0, 'x'), W_(X1, 'x'), W_((X0 + X1) / 2, 'x'), (X1 - X0 + 1) / W,
            W_(Y1, 'z'), W_(Y0, 'z'), W_((Y0 + Y1) / 2, 'z'), (Y1 - Y0 + 1) / W))
