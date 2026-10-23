"""All Step-0 measurements on refs/sheet.png from the HSV classes (measure/classes.py).

    python measure/measure_all.py      (run from the task folder) -> measure/sheet.json
"""
import numpy as np, json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classes import C, IM, H, S, V
from scipy import ndimage as ndi
BG = np.array([246, 242, 233]) / 255
sil_all = np.abs(IM - BG).sum(-1) > 18 / 255
lum = IM.mean(-1) * 255
YY = np.arange(IM.shape[0])[:, None]; XX = np.arange(IM.shape[1])[None, :]


def comp_in(mask, box, k=1, fill=False):
    x0, y0, x1, y1 = box; m = np.zeros_like(mask); m[y0:y1, x0:x1] = mask[y0:y1, x0:x1]
    if fill: m = ndi.binary_fill_holes(ndi.binary_closing(m, iterations=2))
    lab, n = ndi.label(m); s = np.bincount(lab.ravel()); s[0] = 0
    order = np.argsort(s)[::-1][:k]; return [lab == o for o in order if s[o] > 0]


def largest(m):
    lab, n = ndi.label(m); s = np.bincount(lab.ravel()); s[0] = 0; return lab == np.argmax(s)


def bb(m):
    ys, xs = np.nonzero(m); return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]


def cen(m):
    ys, xs = np.nonzero(m); return [float(xs.mean()), float(ys.mean())]


OUT = {}
# ------------------------------------------------ HEAD FRONT (the blueprint for the face)
P = (20, 525, 410, 868)
head = comp_in(sil_all, P, fill=True)[0]
rows = {y: np.nonzero(head[y])[0] for y in range(700, 815)}
yc = max(rows, key=lambda y: rows[y].max() - rows[y].min()); xl, xr = int(rows[yc].min()), int(rows[yc].max())
W = xr - xl; CX = (xl + xr) / 2; CROWN = int(np.nonzero(head[:, int(CX)])[0].min())
colm = lum[790:850, int(CX) - 3:int(CX) + 4].mean(1); CHIN = 790 + int(np.argmin(colm))
def fx(x): return round((x - CX) / W, 3)
def fz(y): return round((CHIN - y) / W, 3)
def fw(p): return round(p / W, 3)
hf = {'W_px': W, 'cheek_row_y': yc, 'centre_x': CX, 'crown_y': CROWN, 'chin_y(the chin/collar shade line)': CHIN, 'head_height_W': fw(CHIN - CROWN)}
eyes = []
for box in ((95, 675, 205, 765), (220, 675, 335, 765)):
    e = comp_in(C['dark'] | C['bell'] | ((S < .10) & (V > .955)), box, fill=True)[0]
    e = largest(ndi.binary_opening(e, iterations=2))
    iris = ndi.binary_fill_holes(e & (C['bell'] | C['dark'])) & ndi.binary_erosion(e, iterations=4)
    iris = ndi.binary_fill_holes(largest(iris))
    b = bb(e); bi = bb(iris)
    pupil = ndi.binary_fill_holes(largest(ndi.binary_opening(iris & (V < .25), iterations=1))); bp = bb(pupil)
    eyes.append({'opening_box_px(lash outline incl.)': b, 'centre_W': [fx((b[0] + b[2]) / 2), fz((b[1] + b[3]) / 2)],
                 'size_W': [fw(b[2] - b[0]), fw(b[3] - b[1])],
                 'iris_box_px': bi, 'iris_size_W': [fw(bi[2] - bi[0]), fw(bi[3] - bi[1])], 'iris_centre_W': [fx((bi[0] + bi[2]) / 2), fz((bi[1] + bi[3]) / 2)],
                 'iris_over_opening_w': round((bi[2] - bi[0]) / (b[2] - b[0]), 3), 'pupil_box_px': bp, 'pupil_size_W': [fw(bp[2] - bp[0]), fw(bp[3] - bp[1])]})
hf['eyes(0 = screen left = her right)'] = eyes
n_ = comp_in(C['dark'], (185, 738, 240, 767))[0]; b = bb(n_)
hf['nose'] = {'box_px': b, 'size_W': [fw(b[2] - b[0] + 1), fw(b[3] - b[1] + 1)], 'centre_z_W': fz((b[1] + b[3]) / 2), 'top_z_W': fz(b[1])}
mo = np.zeros(C['dark'].shape, bool); sel = (V < .62) & ((H < 30) | (H > 300)); mo[766:792, 160:265] = sel[766:792, 160:265]
b = bb(mo); hf['mouth'] = {'box_px': b, 'width_W': fw(b[2] - b[0]), 'corner_z_W': fz(b[1]), 'low_z_W': fz(b[3]), 'centre_x_W': fx((b[0] + b[2]) / 2)}
brows = []
for box in ((115, 640, 185, 678), (245, 640, 315, 678)):
    m = comp_in(C['dark'], box)[0]; b = bb(m)
    brows.append({'box_px': b, 'centre_W': [fx((b[0] + b[2]) / 2), fz((b[1] + b[3]) / 2)], 'size_W': [fw(b[2] - b[0]), fw(b[3] - b[1])]})
hf['brows'] = brows
bl = []
for box in ((50, 745, 165, 800), (262, 745, 375, 800)):
    m = comp_in(C['pink'], box)[0]; b = bb(m); c = cen(m)
    bl.append({'box_px': b, 'centroid_W': [fx(c[0]), fz(c[1])], 'size_W': [fw(b[2] - b[0]), fw(b[3] - b[1])]})
hf['blush'] = bl
ears = []
for box in ((40, 525, 212, 720), (212, 525, 390, 720)):
    dk = comp_in(C['dark'], box)[0]; pk = comp_in(C['pink'], box)[0]
    ys, xs = np.nonzero(dk); ti = np.argmin(ys); bp_ = bb(pk)
    # the ear's outer edge (the head outline) and its inner edge meeting the crown dome
    ears.append({'dark_tip_box_px': bb(dk), 'tip_px': [int(xs[ti]), int(ys[ti])], 'tip_W': [fx(xs[ti]), fz(ys[ti])], 'tip_above_crown_W': fw(CROWN - ys[ti]),
                 'dark_lowest_z_W': fz(bb(dk)[3]), 'inner_pink_box_px': bp_,
                 'inner_pink_x_W': [fx(bp_[0]), fx(bp_[2])], 'inner_pink_z_W': [fz(bp_[3]), fz(bp_[1])]})
hf['ears'] = ears
hf['outline_width_W(z: w)'] = {str(fz(y)): fw(np.ptp(np.nonzero(head[y])[0])) for y in range(560, 820, 20)}
wf = C['white'] & head
hf['white_top_z_W(x: z)'] = {}
for x in (0, .05, .10, .15, .20, .25, .30, .35, .40, .45):
    col = np.nonzero(wf[650:822, int(CX + x * W)])[0]
    hf['white_top_z_W(x: z)'][str(x)] = fz(650 + col.min()) if len(col) else None
OUT['head_front'] = hf
# ------------------------------------------------ FULL BODY FRONT (the text "Chewy Life 3D" masked out)
P = (25, 45, 400, 503)
body = comp_in(sil_all & ~((YY < 64) & (XX < 170)), P, fill=True)[0]
ys, xs = np.nonzero(body); GROUND = int(ys.max())
r = {y: np.nonzero(body[y])[0] for y in range(150, 280)}; yy = max(r, key=lambda y: np.ptp(r[y])); bW = int(np.ptp(r[yy])); bcx = (r[yy].max() + r[yy].min()) / 2
crown = int(np.nonzero(body[:, int(bcx)])[0].min())
colm = lum[265:300, int(bcx) - 3:int(bcx) + 4].mean(1); chin = 265 + int(np.argmin(colm))
mpp = 1.10 / (GROUND - crown)
def m(y): return round((GROUND - y) * mpp, 3)
def mx(x): return round((x - bcx) * mpp, 3)
bf = {'ground_y': GROUND, 'crown_y': crown, 'chin_y': chin, 'centre_x': bcx, 'W_px': bW, 'cheek_row_y': yy, 'mm_per_px(1.10 m to the crown)': round(mpp * 1000, 3),
      'W_m': round(bW * mpp, 3), 'chin_z_m': m(chin), 'head_height_m': round((chin - crown) * mpp, 3),
      'heads(crown-ground / crown-chin)': round((GROUND - crown) / (chin - crown), 2)}
dk = C['dark'] & body; yd, xd = np.nonzero(dk[:120]); bf['ear_tip_z_m'] = m(yd.min())
for k in ('kimono', 'sash', 'bell', 'skirt'):
    mm_ = largest(C[k] & body) if k != 'kimono' else (C[k] & body)
    b = bb(mm_); bf[k] = {'x_m': [mx(b[0]), mx(b[2])], 'z_m': [m(b[3]), m(b[1])], 'width_m': round((b[2] - b[0]) * mpp, 3)}
for nm, box in (('paw_screenL', (25, 330, 110, 420)), ('paw_screenR', (290, 330, 400, 420))):
    mm_ = comp_in(C['fur'] & body, box)[0]; b = bb(mm_); bf[nm] = {'x_m': [mx(b[0]), mx(b[2])], 'z_m': [m(b[3]), m(b[1])]}
for nm, box in (('foot_screenL', (60, 445, 200, 503)), ('foot_screenR', (200, 445, 340, 503))):
    mm_ = comp_in(C['fur'] & body, box)[0]; b = bb(mm_); bf[nm] = {'x_m': [mx(b[0]), mx(b[2])], 'z_m': [m(b[3]), m(b[1])], 'w_m': round((b[2] - b[0]) * mpp, 3)}
bf['outline_width_m(z: w)'] = {str(m(y)): round(float(np.ptp(np.nonzero(body[y])[0])) * mpp, 3) for y in range(290, 500, 10)}
bf['skirt_width_m(z: w)'] = {}
for y in range(380, 460, 10):
    xx = np.nonzero((C['skirt'] & body)[y])[0]
    if len(xx): bf['skirt_width_m(z: w)'][str(m(y))] = round(float(np.ptp(xx)) * mpp, 3)
OUT['body_front'] = bf
# ------------------------------------------------ SIDE (her left; the nose to screen left)
P = (765, 30, 1110, 503)
sd = comp_in(sil_all, P, fill=True)[0]; ys, xs = np.nonzero(sd); g = int(ys.max()); dg = GROUND - g
def ms(y): return m(y + dg)
r = {y: np.nonzero(sd[y])[0] for y in range(130, 280)}
nose_x = int(min(v.min() for v in r.values())); headback = int(max(r[y].max() for y in range(130, 250)))
sp = {'ground_y': g, 'nose_tip_x': nose_x, 'head_back_x': headback, 'head_depth_m(nose to back of head)': round((headback - nose_x) * mpp, 3),
      'head_depth_over_W': round((headback - nose_x) / bW, 3)}
yd, xd = np.nonzero(C['dark'] & sd & (YY < 200)); sp['ear_tip_px'] = [int(xd[np.argmin(yd)]), int(yd.min())]; sp['ear_tip_z_m'] = ms(yd.min())
sp['ear_tip_behind_nose_m'] = round((xd[np.argmin(yd)] - nose_x) * mpp, 3)
tail = (C['fur'] | C['white']) & sd; tail[:, :965] = 0; tail[:230] = 0
tl = largest(tail); b = bb(tl); sp['tail_box_px'] = b
sp['tail_x_m_behind_nose'] = [round((b[0] - nose_x) * mpp, 3), round((b[2] - nose_x) * mpp, 3)]; sp['tail_z_m'] = [ms(b[3]), ms(b[1])]
sp['tail_w_h_m'] = [round((b[2] - b[0]) * mpp, 3), round((b[3] - b[1]) * mpp, 3)]
wt = C['white'] & tl; b2 = bb(wt); sp['tail_white_box_px'] = b2; sp['tail_white_z_m'] = [ms(b2[3]), ms(b2[1])]
be = largest(C['bell'] & sd); b = bb(be); sp['bell_box_px'] = b; sp['bell_front_behind_nose_m'] = round((b[0] - nose_x) * mpp, 3); sp['bell_d_m'] = round((b[3] - b[1]) * mpp, 3)
sk = largest(C['skirt'] & sd); b = bb(sk); sp['skirt_box_px'] = b; sp['skirt_depth_m'] = round((b[2] - b[0]) * mpp, 3); sp['skirt_z_m'] = [ms(b[3]), ms(b[1])]
ft = C['fur'] & sd; ft[:448] = 0; ft[:, 985:] = 0; b = bb(ft); sp['feet_box_px'] = b; sp['feet_length_m'] = round((b[2] - b[0]) * mpp, 3); sp['feet_top_z_m'] = ms(b[1])
sp['outline_x_px(y: front, back)'] = {y: [int(np.nonzero(sd[y])[0].min()), int(np.nonzero(sd[y])[0].max())] for y in range(110, 300, 10)}
OUT['side'] = sp
# ------------------------------------------------ BACK
P = (1110, 40, 1430, 503)
bk = comp_in(sil_all, P, fill=True)[0]; ys, xs = np.nonzero(bk); gb = int(ys.max()); dgb = GROUND - gb
r = {y: np.nonzero(bk[y])[0] for y in range(130, 260)}; yy = max(r, key=lambda y: np.ptp(r[y])); bcx2 = (r[yy].max() + r[yy].min()) / 2
tb = (C['fur'] | C['white']) & bk & (np.abs(XX - bcx2) < 85); tb[:298] = 0; tb[472:] = 0
tb2 = largest(tb); b = bb(tb2)
OUT['back'] = {'ground_y': gb, 'centre_x': bcx2, 'W_px': int(np.ptp(r[yy])), 'tail_box_px': b, 'tail_x_m': [round((b[0] - bcx2) * mpp, 3), round((b[2] - bcx2) * mpp, 3)],
               'tail_z_m': [m(b[3] + dgb), m(b[1] + dgb)], 'tail_w_m': round((b[2] - b[0]) * mpp, 3)}
wb = C['white'] & tb2; b = bb(wb); OUT['back']['tail_white_z_m'] = [m(b[3] + dgb), m(b[1] + dgb)]; OUT['back']['tail_white_w_m'] = round((b[2] - b[0]) * mpp, 3)
json.dump(OUT, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sheet.json'), 'w'), indent=1, default=int)
print(json.dumps(OUT, indent=1, default=int))
