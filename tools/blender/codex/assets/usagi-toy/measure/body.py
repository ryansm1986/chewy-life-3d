"""colour masks on a full-body panel: python measure/body.py x0 x1 [ground cx pxm]"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage
im = np.asarray(Image.open('D:/projects/chewy-life-3d/tools/blender/work/codex/usagi-toy/refs/sheet.png').convert('RGB')).astype(float)
x0, x1 = map(int, sys.argv[1:3]); G, CX, PXM = map(float, sys.argv[3:6])
sub = im[40:516, x0:x1]; R, Gc, B = sub[..., 0], sub[..., 1], sub[..., 2]
cls = {'overall_blue': (B > 200) & (R < 180) & (B - R > 60) & (Gc > 150),
       'strap_blue': (B > 150) & (R < 120) & (B - R > 90) & (Gc < 160),
       'shirt_yellow': (R > 230) & (Gc > 215) & (B < 190) & (R - B > 50),
       'hat_pink': (R > 230) & (Gc < 200) & (B > 170) & (R - Gc > 45),
       'handle_brown': (R > 120) & (R < 220) & (Gc < 160) & (B < 120) & (R - B > 60)}
def m_(px, ax): return (px - CX) / PXM if ax == 'x' else (G - px) / PXM
for name, m in cls.items():
    lab, n = ndimage.label(m); sizes = ndimage.sum(m, lab, range(1, n + 1))
    for i in np.argsort(-sizes)[:4]:
        if sizes[i] < 25: continue
        ys, xs = np.where(lab == i + 1); X0, X1, Y0, Y1 = xs.min() + x0, xs.max() + x0, ys.min() + 40, ys.max() + 40
        print('%-14s px x %4d-%4d y %3d-%3d n %5d | m: x %.3f..%.3f (w %.3f)  z %.3f..%.3f (h %.3f)' % (name, X0, X1, Y0, Y1, sizes[i],
              m_(X0, 'x'), m_(X1, 'x'), (X1 - X0) / PXM, m_(Y1, 'z'), m_(Y0, 'z'), (Y1 - Y0) / PXM))
