"""eye, nose, mouth, brow, blush boxes on the sheet's HEAD FRONT (sheet px). python measure/eyes.py"""
import numpy as np, json
from PIL import Image
from scipy import ndimage as ndi
IM = np.array(Image.open('refs/sheet.png').convert('RGB')).astype(int); R, G, B = IM[..., 0], IM[..., 1], IM[..., 2]
lum = IM.mean(-1)
dark = (R + G + B < 300) & (B < 120)
amber = (R > 120) & (B < 90) & (R - B > 90) & (G < 200) & ~((R > 235) & (G < 165) & (B > 55))   # iris (fur is 254,147,67)
iris_any = amber | ((R > 200) & (G > 150) & (G < 200) & (B < 60))
sclera = (B > 234) & (lum > 242)
def comp(mask, box):
    x0, y0, x1, y1 = box; m = np.zeros_like(mask); m[y0:y1, x0:x1] = mask[y0:y1, x0:x1]
    lab, n = ndi.label(m); 
    if n == 0: return None, m
    sizes = np.bincount(lab.ravel()); sizes[0] = 0; k = np.argmax(sizes); mm = lab == k
    ys, xs = np.nonzero(mm); return (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())), mm
res = {}
for side, box in (('screenL', (95, 675, 175, 760)), ('screenR', (250, 675, 330, 760))):
    eye = dark | iris_any | sclera
    eye = ndi.binary_fill_holes(ndi.binary_closing(eye, iterations=1))
    bb, mm = comp(eye, box)
    lash_bb, _ = comp(dark & ~ndi.binary_erosion(mm, iterations=4), box)
    ir_bb, irm = comp(iris_any, box)
    sc_bb, scm = comp(sclera, box)
    pu = dark & ndi.binary_erosion(mm, iterations=6); pu_bb, pum = comp(pu, box)
    res[side] = dict(eye_total=bb, lash_band=lash_bb, iris=ir_bb, sclera=sc_bb, pupil=pu_bb, area_eye=int(mm.sum()))
# nose
nb, _ = comp(dark, (180, 735, 245, 775)); res['nose'] = nb
# mouth: dark thin line under the nose
mb, mm = comp(dark | ((lum < 150) & (R > G)), (150, 760, 275, 800)); res['mouth_with_nose?'] = mb
mm2 = np.zeros_like(dark); mm2[768:800, 150:275] = (dark | ((lum < 170) & (R > G + 20)))[768:800, 150:275]
ys, xs = np.nonzero(mm2); res['mouth'] = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
# brows
for side, box in (('browL', (100, 640, 180, 675)), ('browR', (240, 640, 320, 675))):
    res[side] = comp(dark, box)[0]
# blush: pink relative to the white face: R high, G 165..205, B 130..185, R-G>45
pink = (R > 240) & (G > 160) & (G < 200) & (B > 130) & (B < 180) & (R - G > 50)
for side, box in (('blushL', (60, 740, 160, 800)), ('blushR', (265, 740, 370, 800))):
    res[side] = comp(pink, box)[0]
print(json.dumps(res, indent=0))
json.dump(res, open('measure/eyes_raw.json', 'w'), indent=1)
