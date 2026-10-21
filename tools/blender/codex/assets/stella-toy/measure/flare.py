"""the dress flare on the front views: visible widths (colour masks) of the obi, the periwinkle skirt and the pink petticoat, sheet vs model
    python measure/flare.py [body_front.png] [measurements-model.json]"""
import json, os, sys
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def masks(path):
    im = np.array(Image.open(path).convert('RGB')).astype(float); R, G, B = im[..., 0], im[..., 1], im[..., 2]
    peri = (B > R + 12) & (B > G + 30) & (B > 140)
    pink = (R > 185) & (R - G > 18) & (B - G > 2) & ~peri
    return peri, pink
def run_width(m, y, cx, gap=6):
    """the width of the mask run through the centre column (bridging gaps up to `gap` px)"""
    row = m[y]; xs = np.where(row)[0]
    if not len(xs): return 0, None, None
    # take the widest extent of mask pixels connected (with small gaps) to the run nearest the centre
    near = xs[np.argmin(np.abs(xs - cx))]; lo = hi = near
    while True:
        cand = xs[(xs < lo) & (xs >= lo - gap)]
        if not len(cand): break
        lo = cand.min()
    while True:
        cand = xs[(xs > hi) & (xs <= hi + gap)]
        if not len(cand): break
        hi = cand.max()
    return hi - lo + 1, lo, hi
def widest(m, y0, y1, cx):
    best = (0, None)
    for y in range(int(y0), int(y1)):
        w, lo, hi = run_width(m, y, cx)
        if w > best[0]: best = (w, y)
    return best
out = {}
# sheet front turnaround: centre x 179.5, ground 460.5, crown 88; obi rows 271-298; periwinkle hem 360-384; pink 395-421
sp, sk = masks(os.path.join(ROOT, 'refs', 'sheet.png'))
T = 460.5 - 88
obi_s = max(run_width(sk, y, 179.5)[0] for y in range(276, 296))
skirt_top_s = run_width(sp, 305, 179.5, gap=3)[0]
peri_s = widest(sp, 355, 386, 179.5); pink_s = widest(sk, 392, 424, 179.5)
out['sheet'] = {'obi_px': int(obi_s), 'skirt_top_px(just under the obi)': int(skirt_top_s), 'periwinkle_hem_px': int(peri_s[0]), 'pink_hem_px': int(pink_s[0]),
                'peri/obi': round(peri_s[0] / obi_s, 3), 'pink/obi': round(pink_s[0] / obi_s, 3), 'peri/skirt_top': round(peri_s[0] / max(skirt_top_s, 1), 3),
                'pink/skirt_top': round(pink_s[0] / max(skirt_top_s, 1), 3), 'peri/T': round(peri_s[0] / T, 3), 'pink/T': round(pink_s[0] / T, 3), 'obi/T': round(obi_s / T, 3)}
# model body_front: ortho 1.50 m over 1000 px, centre z 0.66 m
M = json.load(open(sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'measurements-model.json'))); BP = 1000 / 1.50
def by(z): return 500 - (z - .66) * BP
mp, mk = masks(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'preview', 'body_front.png'))
crown = M['crown_m']; Tm = crown * BP
ob = M['body_parts_m']['obi']; z_obi = (ob['min'][2] + ob['max'][2]) / 2
obi_m = max(run_width(mk, int(by(z_obi)) + d, 500)[0] for d in range(-6, 7))
peri = M['body_parts_m']['skirt_periwinkle']; pnk = M['body_parts_m']['skirt_pink']
skirt_top_m = run_width(mp, int(by(z_obi - .045)), 500, gap=3)[0]
peri_m = widest(mp, by(peri['min'][2] + .06), by(peri['min'][2]) + 2, 500); pink_m = widest(mk, by(pnk['min'][2] + .07), by(pnk['min'][2]) + 2, 500)
out['model'] = {'obi_px': int(obi_m), 'skirt_top_px(just under the obi)': int(skirt_top_m), 'periwinkle_hem_px': int(peri_m[0]), 'pink_hem_px': int(pink_m[0]),
                'peri/obi': round(peri_m[0] / obi_m, 3), 'pink/obi': round(pink_m[0] / obi_m, 3), 'peri/skirt_top': round(peri_m[0] / max(skirt_top_m, 1), 3),
                'pink/skirt_top': round(pink_m[0] / max(skirt_top_m, 1), 3), 'peri/T': round(peri_m[0] / Tm, 3), 'pink/T': round(pink_m[0] / Tm, 3), 'obi/T': round(obi_m / Tm, 3)}
json.dump(out, open(os.path.join(ROOT, 'scratch', 'flare.json'), 'w'), indent=1)
for k in ('obi/T', 'peri/T', 'pink/T', 'peri/obi', 'pink/obi', 'peri/skirt_top', 'pink/skirt_top'):
    print('%-16s sheet %.3f   model %.3f' % (k, out['sheet'][k], out['model'][k]))
print(out)
