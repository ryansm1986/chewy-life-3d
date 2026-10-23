"""lowest pink (hat) pixel per column, in W above the chin: sheet head close-up vs model head_front"""
import numpy as np
from PIL import Image
R = 'D:/projects/chewy-life-3d/tools/blender/work/codex/usagi-toy/'
def pink(p):
    a = np.asarray(Image.open(p).convert('RGB')).astype(int); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (r > 130) & (r - g > 30) & (b > 90) & (b - g > 0)
S = pink(R + 'refs/sheet.png'); M = pink(R + 'preview/head_front.png')
print('xW    sheet_low  sheet_top  model_low  model_top')
for xw in (-.6, -.5, -.4, -.3, -.2, -.1, 0, .1, .2, .3, .4, .5, .6):
    xs = int(198.5 + xw * 253); col = S[600:846, xs]; ys = np.where(col)[0]
    xm = int(500 + xw * 633); colm = M[150:876, xm]; ym = np.where(colm)[0]
    f = lambda y, c, W: round((c - y) / W, 3)
    print('%5.2f  %s  %s' % (xw, (f(ys.max() + 600, 846, 253), f(ys.min() + 600, 846, 253)) if len(ys) else None,
                             (f(ym.max() + 150, 876, 633), f(ym.min() + 150, 876, 633)) if len(ym) else None))
