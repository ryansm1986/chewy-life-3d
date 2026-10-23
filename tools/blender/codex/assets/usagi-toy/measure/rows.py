"""row widths (m) sheet front vs model body_front at heights z (m): python measure/rows.py [front|side|back]"""
import sys, numpy as np
from PIL import Image
R = 'D:/projects/chewy-life-3d/tools/blender/work/codex/usagi-toy/'
def mask(p, thr):
    im = np.asarray(Image.open(p).convert('RGB')).astype(int); return np.abs(im - im[3, 3]).sum(-1) > thr
mode = sys.argv[1] if len(sys.argv) > 1 else 'front'
S = mask(R + 'refs/sheet.png', 16)
panel = {'front': ((90, 385), 234, 'body_front'), 'side': ((800, 1080), 925, 'body_side'), 'back': ((1150, 1470), 1305, 'body_back')}[mode]
M = mask(R + 'preview/%s.png' % panel[2], 16)
print('z_m   sheet[l, r, w]          model[l, r, w]')
for z in (.02, .05, .08, .10, .13, .16, .20, .24, .28, .32, .36, .40, .44, .50, .56, .62, .66, .70, .74, .78, .82, .86, .90, .95, 1.0, 1.05, 1.08):
    ys = int(round(515 - z * 417)); ym = int(round(940 - z * 800))
    a = np.where(S[ys, panel[0][0]:panel[0][1]])[0]; b = np.where(M[ym])[0]
    fa = (round((a.min() + panel[0][0] - panel[1]) / 417, 3), round((a.max() + panel[0][0] - panel[1]) / 417, 3), round((a.max() - a.min()) / 417, 3)) if len(a) else None
    fb = (round((b.min() - 450) / 800, 3), round((b.max() - 450) / 800, 3), round((b.max() - b.min()) / 800, 3)) if len(b) else None
    print('%.2f  %-24s %s' % (z, fa, fb))
