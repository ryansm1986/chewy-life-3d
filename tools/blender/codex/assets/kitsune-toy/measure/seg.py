"""colour segmentation helpers for refs/sheet.png (Kitsune). python measure/seg.py  -> prints head-front row profile"""
import numpy as np
from PIL import Image
IM = np.array(Image.open('refs/sheet.png').convert('RGB')).astype(int)
BG = np.array([246, 242, 233])
def cls(im):
    R, G, B = im[..., 0], im[..., 1], im[..., 2]
    d_bg = np.abs(im - BG).sum(-1)
    fur = (R > 200) & (G > 95) & (G < 200) & (B < 125) & (R - B > 110)
    dark = (R < 130) & (G < 95) & (B < 110) & (R + G + B < 300)
    amber = (R > 120) & (B < 90) & (R - B > 90) & (G < 190) & ~fur
    pink = (R > 230) & (G > 140) & (G < 205) & (B > 120) & (B < 185) & (R - B > 60)
    white = (R > 235) & (G > 200) & (B > 175) & (d_bg > 16) & ~pink
    kimono = (B > 150) & (B - R > 40)
    skirt = (R < 90) & (G < 80) & (B > 70) & (B - R > 15)
    sil = d_bg > 16
    return dict(fur=fur, dark=dark, amber=amber, pink=pink, white=white, kimono=kimono, skirt=skirt, sil=sil)
def bbox(m, x0, y0, x1, y1):
    sub = m[y0:y1, x0:x1]; ys, xs = np.nonzero(sub)
    if not len(xs): return None
    return (int(xs.min() + x0), int(ys.min() + y0), int(xs.max() + x0), int(ys.max() + y0))
if __name__ == '__main__':
    C = cls(IM)
    x0, x1 = 20, 410
    for y in range(530, 880, 5):
        row = C['sil'][y, x0:x1]; xs = np.nonzero(row)[0]
        fr = C['fur'][y, x0:x1]; fx = np.nonzero(fr)[0]
        print(y, (xs.min() + x0, xs.max() + x0, xs.max() - xs.min()) if len(xs) else None, 'fur', (fx.min() + x0, fx.max() + x0) if len(fx) else None)
