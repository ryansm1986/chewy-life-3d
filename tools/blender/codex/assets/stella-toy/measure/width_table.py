"""the head's silhouette width inside the ears at six heights: sheet (head close-up, the face/ear crease) vs model (preview/width_mask.png)
    python measure/width_table.py   -> prints the table, writes scratch/width_table.json"""
import json, os, sys
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZS = (.10, .25, .40, .60, .80, .95)
# the sheet: face/ear crease positions read on the ruled close-up (measure/ruled.py 0 545 320 760 3), sheet px; W 172, chin 737, centre 157.75
SHEET = {.10: (82, 232), .25: (72, 242), .40: (70, 245), .60: (75, 240), .80: (90, 225), .95: (100, 213)}
M = json.load(open(sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'measurements-model.json')))
W = M['W']; CHIN = M['chin_z_m']; HP = 1000 / 1.10
import sys
im = np.array(Image.open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview', 'width_mask.png')).convert('RGBA')).astype(float)
white = (im[..., :3].min(2) > 250)
out = {}
print('z (W)   sheet   model   diff')
for z in ZS:
    sw = (SHEET[z][1] - SHEET[z][0]) / 172.
    y = int(round(500 + (.94 - (CHIN + z * W)) * HP))
    xs = np.where(white[y])[0]
    # the run of white pixels containing the centre column
    c = 500; mw = None
    if white[y, c]:
        l = c
        while l > 0 and white[y, l - 1]: l -= 1
        r = c
        while r < 999 and white[y, r + 1]: r += 1
        mw = (r - l + 1) / HP / W
    out['%.2f' % z] = {'sheet_W': round(sw, 3), 'model_W': round(mw, 3) if mw else None, 'diff_pct': round(100 * (mw - sw) / sw, 1) if mw else None}
    print('%.2f    %.3f   %s   %s' % (z, sw, '%.3f' % mw if mw else '-', '%+.1f%%' % (100 * (mw - sw) / sw) if mw else '-'))
json.dump(out, open(os.path.join(ROOT, 'scratch', 'width_table.json'), 'w'), indent=1)
