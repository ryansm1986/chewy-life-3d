"""the visible ear width (front view) per height: sheet close-up (ruled readings) vs model (preview/width_mask.png: ears black, head white)
    python measure/ear_width.py [mask.png] [measurements.json]"""
import json, os, sys
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# sheet: her right ear (image left) on the front close-up, ruled crop measure/ruled.py 0 600 140 820 4: (outer x, inner x) sheet px,
# the inner edge = where the ear meets the cheek (z >= 0.1) or the gap to the neck (below the chin). W 172 px, chin y 737, centre x 157.75
SHEET = {.40: (14, 66), .30: (12, 70), .20: (11, 73), .10: (10, 80), .00: (10, 97), -.10: (11, 93), -.20: (14, 82), -.30: (30, 62)}
M = json.load(open(sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'measurements-model.json')))
W = M['W']; CH = M['chin_z_m']; HP = 1000 / 1.10
im = np.array(Image.open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview', 'width_mask.png')).convert('RGB')).astype(int)
black = im.max(2) < 40; white = im.min(2) > 250
out = {}
print(' z (W)   sheet width  outer x |  model width  outer x   (W; x from the face centre)')
for z, (xo, xi) in SHEET.items():
    y = int(round(500 + (.94 - (CH + z * W)) * HP))
    xs = np.where(black[y, :500])[0]
    if len(xs):
        lo = xs.min(); hi = lo
        while hi + 1 < 500 and black[y, hi + 1]: hi += 1
        mw = (hi - lo + 1) / HP / W; mo = (500 - lo) / HP / W
    else: mw = mo = float('nan')
    sw = (xi - xo) / 172.; so = (157.75 - xo) / 172.
    out['%.2f' % z] = {'sheet_W': round(sw, 3), 'sheet_outer_W': round(so, 3), 'model_W': round(float(mw), 3), 'model_outer_W': round(float(mo), 3)}
    print('%5.2f    %.3f      %.3f   |   %.3f      %.3f' % (z, sw, so, mw, mo))
json.dump(out, open(os.path.join(ROOT, 'scratch', 'ear_width.json'), 'w'), indent=1)
