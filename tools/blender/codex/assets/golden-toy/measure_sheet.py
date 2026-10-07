"""Sheet measurements (refs/sheet.png) and the model comparison -> measurements.json, preview/measure-*.png

    python measure_sheet.py

Landmarks were read on ruled crops (scratch/ruled.py: 5 px grid, 3-7x zoom) and colour extents of the sheet, scripted
below. The ruled crops are re-rendered into preview/measure-*.png as the evidence. Conventions:
- W = the head width at the cheeks (the close-up: x 159 -> 313 = 154 px), H = crown to chin excluding the crest; the crown
  on the sheet is the helmet dome top (the skull is under it), so H_helm = 152 px = 0.987 W on the close-up.
- Heights are metres from the front turnaround: ground y 422, helmet dome top y 77 -> 1.225 m (the skull crown 1.200 m,
  chewy-b.glb's), 281.6 px per metre, body centre x 220. The side view: ground y 424, body centre x 915.
- The face follows the head close-up, the body the turnaround (as the brief says). The turnaround's face is drawn shorter
  (eyes 0.50 W, the band V 0.73 W above the chin) than the close-up (0.543 W, 0.833 W).
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.abspath(__file__))
SHEET = os.path.join(ROOT, 'refs', 'sheet.png'); PV = os.path.join(ROOT, 'preview'); os.makedirs(PV, exist_ok=True)
im = np.asarray(Image.open(SHEET).convert('RGB')).astype(float) / 255

def ruled(out, x0, y0, x1, y1, s, step, marks=()):
    src = Image.open(SHEET).convert('RGB').crop((x0, y0, x1, y1)); src = src.resize((src.width * s, src.height * s), Image.LANCZOS)
    d = ImageDraw.Draw(src)
    for x in range((x0 // step + 1) * step, x1, step):
        X = (x - x0) * s; maj = x % (step * 5) == 0
        d.line([(X, 0), (X, src.height)], fill=(255, 0, 0) if maj else (255, 175, 175), width=1)
        if maj: d.text((X + 2, 2), str(x), fill=(200, 0, 0))
    for y in range((y0 // step + 1) * step, y1, step):
        Y = (y - y0) * s; maj = y % (step * 5) == 0
        d.line([(0, Y), (src.width, Y)], fill=(0, 0, 255) if maj else (175, 175, 255), width=1)
        if maj: d.text((2, Y + 2), str(y), fill=(0, 0, 200))
    for (mx, my, lab) in marks:
        X, Y = (mx - x0) * s, (my - y0) * s; d.ellipse([X - 4, Y - 4, X + 4, Y + 4], outline=(0, 160, 0), width=2); d.text((X + 6, Y - 6), lab, fill=(0, 120, 0))
    src.save(os.path.join(PV, out))

# ---------------------------------------------------------------- landmarks (sheet px)
CU = dict(cx=236, chin=645, W=154, helm_top=493)          # the head close-up (front)
EYE = dict(xR=195.6, xL=276.4, y=561.3, w=35.0, h=40.7, iris_w=25.7, iris_h=34.6, iris_bottom=581.7, pupil_frac=.78)
NOSE = dict(w=35.7, h=25.0, top=568.6, bottom=593.6)
MOUTH = dict(w=82.0, corner_y=597, top_y=602, bottom_y=635)
BAND = dict(V=516.7, beside=510.0, x30=523.0, x41=533.0, top_centre=502.0)
BROW_Y = 523; BLUSH = dict(x=.37, y=.39)
EAR_OUT = {'0.62': 151.7, '0.45': 123.0, '0.29': 105.0, '0.12': 92.0, '-0.05': 100.0}   # outer edge x (sheet px) at z (W)
FT = dict(ground=422, cx=220, ppm=281.6, chin=187.5, helm_top=77, horn_tip=67.5, crest_top=47, face_w=114)
def zf(y): return (FT['ground'] - y) / FT['ppm']
def xf(x): return (x - FT['cx']) / FT['ppm']
BODY = {'chin_m': zf(FT['chin']), 'helmet_dome_top_m': zf(FT['helm_top']), 'horn_tip_m': zf(FT['horn_tip']), 'crest_top_m': zf(FT['crest_top']),
        'ear_bottom_m': zf(210), 'ear_outer_halfspan_m': 106 / FT['ppm'], 'ruff_V_bottom_m': zf(232), 'ruff_width_m': 104 / FT['ppm'],
        'pauldrons_across_m': (303 - 139) / FT['ppm'], 'pauldron_top_m': zf(200), 'chest_width_m': 90 / FT['ppm'],
        'belt_z_m': [zf(283), zf(270)], 'medallion_d_m': 26 / FT['ppm'], 'tabard_point_m': zf(357), 'tabard_top_width_m': 60 / FT['ppm'],
        'tassets_z_m': [zf(330), zf(285)], 'tassets_across_m': (302 - 138) / FT['ppm'], 'feet_width_each_m': 85 / FT['ppm'],
        'foot_centre_x_m': (285.5 - 157.5) / 2 / FT['ppm'], 'paw_centre_m': [xf(91), zf(300)], 'bracer_z_m': [zf(280), zf(255)],
        'side_nose_tip_y_m': (826 - 915) / FT['ppm'], 'side_head_back_y_m': (980 - 915) / FT['ppm'],
        'side_tail_y_m': [(975 - 915) / FT['ppm'], (1105 - 915) / FT['ppm']], 'side_tail_z_m': [(424 - 390) / FT['ppm'], (424 - 265) / FT['ppm']],
        'side_quiver_y_m': [(967 - 915) / FT['ppm'], (1005 - 915) / FT['ppm']], 'side_quiver_z_m': [(424 - 290) / FT['ppm'], (424 - 187) / FT['ppm']],
        'side_javelin_tips_top_m': (424 - 132) / FT['ppm'], 'side_ear_y_m': [(900 - 915) / FT['ppm'], (985 - 915) / FT['ppm']]}
# colour-extent checks on the front turnaround (emerald rows)
mx = im.max(-1); mn = im.min(-1); d = np.maximum(mx - mn, 1e-6); r, g, b = im[..., 0], im[..., 1], im[..., 2]
h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
s = (mx - mn) / np.maximum(mx, 1e-6)
emer = (h > 120) & (h < 180) & (s > .25) & (mx > .2)
def ext(y):
    c = np.where(emer[y, 60:395])[0] + 60; return (int(c.min()), int(c.max())) if len(c) else None
COLOUR = {'emerald_rows(front): y -> x range': {y: ext(y) for y in (100, 210, 240, 270, 300, 330, 350)},
          'emerald_lowest_row(front tabard point)': int(max(y for y in range(300, 420) if emer[y, 200:240].any()))}
CU_F = {'eye_centre_x_W': (EYE['xL'] - EYE['xR']) / 2 / CU['W'], 'eye_centre_z_W': (CU['chin'] - EYE['y']) / CU['W'],
        'eye_opening_W': [EYE['w'] / CU['W'], EYE['h'] / CU['W']], 'iris_frac_of_opening': [EYE['iris_w'] / EYE['w'], EYE['iris_h'] / EYE['h']],
        'pupil_frac_of_iris': EYE['pupil_frac'], 'iris_bottom_z_W': (CU['chin'] - EYE['iris_bottom']) / CU['W'],
        'nose_W': [NOSE['w'] / CU['W'], NOSE['h'] / CU['W']], 'nose_top_z_W': (CU['chin'] - NOSE['top']) / CU['W'], 'nose_bottom_z_W': (CU['chin'] - NOSE['bottom']) / CU['W'],
        'mouth_width_W': MOUTH['w'] / CU['W'], 'mouth_corner_z_W': (CU['chin'] - MOUTH['corner_y']) / CU['W'], 'mouth_top_z_W': (CU['chin'] - MOUTH['top_y']) / CU['W'],
        'mouth_bottom_z_W': (CU['chin'] - MOUTH['bottom_y']) / CU['W'], 'brow_z_W': (CU['chin'] - BROW_Y) / CU['W'],
        'band_V_z_W': (CU['chin'] - BAND['V']) / CU['W'], 'band_beside_V_z_W': (CU['chin'] - BAND['beside']) / CU['W'],
        'band_lower_edge_at_x0.30W_z_W': (CU['chin'] - BAND['x30']) / CU['W'], 'H_helm_over_W': (CU['chin'] - CU['helm_top']) / CU['W'],
        'ear_outer_x_W(z)': {k: (CU['cx'] - v) / CU['W'] for k, v in EAR_OUT.items()}, 'blush_W': BLUSH}
SHEET_T = {'close_up_face_W_units': CU_F, 'body_m': BODY, 'colour_extents': COLOUR,
           'turnaround_face': {'W_m': FT['face_w'] / FT['ppm'], 'H_helm_over_W': (FT['chin'] - FT['helm_top']) / FT['face_w'],
                               'head_H_helm_over_total': (FT['chin'] - FT['helm_top']) / (FT['ground'] - FT['helm_top']),
                               'heads_tall(crown to ground / H)': (FT['ground'] - FT['helm_top']) / (FT['chin'] - FT['helm_top'])}}

# evidence crops
ruled('measure-head-front.png', 80, 470, 390, 670, 3, 5, [(EYE['xR'], EYE['y'], 'eye'), (EYE['xL'], EYE['y'], 'eye'), (CU['cx'], NOSE['top'], 'nose top'),
      (CU['cx'], CU['chin'], 'chin'), (CU['cx'], BAND['V'], 'V'), (159, 600, 'W'), (313, 600, 'W')])
ruled('measure-front.png', 60, 40, 390, 430, 2, 5, [(220, FT['chin'], 'chin'), (220, FT['helm_top'], 'dome'), (220, 357, 'tabard pt'), (91, 300, 'paw')])
ruled('measure-side.png', 800, 30, 1110, 430, 2, 5, [(826, 132, 'nose tip'), (980, 120, 'head back'), (1105, 265, 'tail tip')])

# ---------------------------------------------------------------- compare with the model (measurements-model.json from the build)
M = json.load(open(os.path.join(ROOT, 'measurements-model.json'))) if os.path.exists(os.path.join(ROOT, 'measurements-model.json')) else {}
rows = []
def row(name, target, model, tol=.05, unit=''):
    if model is None: rows.append({'target': name, 'sheet': round(target, 3), 'model': None}); return
    dev = (model - target) / abs(target) if target else 0
    rows.append({'target': name, 'sheet': round(float(target), 3), 'model': round(float(model), 3), 'dev_pct': round(100 * dev, 1), 'unit': unit})
if M:
    bp = M.get('body_parts_m', {})
    def bx(k, i, j): return bp[k][i][j] if k in bp else None
    # Round 2: the cast's proportions. The head is the sheet's head scaled by HS (W 0.600 m against the sheet's 0.405 m) about the
    # 1.20 m skull crown; the body below the chin is the sheet's shortened by BZS in z (widths kept). Targets are the sheet's
    # numbers mapped the same way: head parts z' = 1.20 + (z - 1.20) * HS, y' = y * HS; body parts z' = z * BZS.
    W = float(M['units'].split('W = ')[1].split(' m')[0]); BZS = float(M.get('body_shorten_BZS', 1.)); W_SHEET = FT['face_w'] / FT['ppm']
    HS = W / W_SHEET
    def hz(z): return 1.2 + (z - 1.2) * HS
    row('head W (m) [cast: ~0.60]', .600, M['face_width_rows_W(z: width)']['0.29'] * W, unit='m')
    row('crown (skull, m)', 1.200, M['crown_m'], unit='m')
    row('helmet dome top (m) [head-scaled]', hz(BODY['helmet_dome_top_m']), M.get('helmet_top_m'), unit='m')
    row('H_helm / W', CU_F['H_helm_over_W'], (M.get('helmet_top_m') - M['chin_z_m']) / W)
    row('eye centre x (W)', CU_F['eye_centre_x_W'], M['eye_centre_W'][0])
    row('eye centre z (W)', CU_F['eye_centre_z_W'], M['eye_centre_W'][1])
    row('eye opening w (W)', CU_F['eye_opening_W'][0], M['eye_opening_W'][0])
    row('eye opening h (W)', CU_F['eye_opening_W'][1], M['eye_opening_W'][1])
    row('eye facing (deg out)', 30., M['eye_axis_L']['out_deg'])
    row('iris bottom z (W)', CU_F['iris_bottom_z_W'], M['iris_bottom_W'])
    row('nose top z (W)', CU_F['nose_top_z_W'], M['nose_top_z_W'])
    row('nose width (W)', CU_F['nose_W'][0], M['nose_width_W(top)'])
    row('nose height (W)', CU_F['nose_W'][1], M['nose_height_W'])
    row('mouth width (W)', CU_F['mouth_width_W'], M['mouth_width_W'])
    row('mouth top z at the centre (W)', CU_F['mouth_top_z_W'], M.get('mouth_top_centre_W'))
    row('mouth bottom z (W)', CU_F['mouth_bottom_z_W'], M['mouth_z_range_W'][0])
    row('band V z (W)', CU_F['band_V_z_W'], .833)
    for k, v in CU_F['ear_outer_x_W(z)'].items():
        mk = {'0.62': '0.60', '0.45': '0.45', '0.29': '0.30', '0.12': '0.12', '-0.05': '-0.05'}[k]
        row('ear outer x (W) at z %s' % k, v, M.get('ear_L', {}).get('outer_x_W_at_z', {}).get(mk))
    row('ear bottom (W below the chin)', (BODY['ear_bottom_m'] - BODY['chin_m']) / W_SHEET, M.get('ear_L', {}).get('z_min_W'))
    row('side: nose tip y (m) [head-scaled]', BODY['side_nose_tip_y_m'] * HS, M.get('nose_tip_y_m'), unit='m')
    if bp:
        row('ruff V bottom below the chin (W)', (BODY['ruff_V_bottom_m'] - BODY['chin_m']) / W_SHEET, (bx('ruff', 'min', 2) - M['chin_z_m']) / W)
        row('pauldrons across (m)', BODY['pauldrons_across_m'], bx('pauldrons', 'size', 0), unit='m')
        row('pauldron top (m) [x BZS]', BODY['pauldron_top_m'] * BZS, bx('pauldrons', 'max', 2), unit='m')
        row('belt bottom (m) [x BZS]', BODY['belt_z_m'][0] * BZS, bx('belt', 'min', 2), unit='m')
        row('belt top (m) [x BZS]', BODY['belt_z_m'][1] * BZS, bx('belt', 'max', 2), unit='m')
        row('medallion diameter (m)', BODY['medallion_d_m'], bx('medallion', 'size', 0), unit='m')
        row('tabard point (m) [x BZS]', BODY['tabard_point_m'] * BZS, bx('tabard_front', 'min', 2), unit='m')
        row('tabard top width (m)', BODY['tabard_top_width_m'], bx('tabard_front', 'size', 0), unit='m')
        row('tassets across (m)', BODY['tassets_across_m'], bx('tassets', 'size', 0), unit='m')
        row('tassets bottom (m) [x BZS]', BODY['tassets_z_m'][0] * BZS, bx('tassets', 'min', 2), unit='m')
        row('paw centre x (m)', abs(BODY['paw_centre_m'][0]), (bx('paw_L', 'min', 0) + bx('paw_L', 'max', 0)) / 2, unit='m')
        row('paw centre z (m) [x BZS]', BODY['paw_centre_m'][1] * BZS, (bx('paw_L', 'min', 2) + bx('paw_L', 'max', 2)) / 2, unit='m')
        row('feet: one foot width (m)', BODY['feet_width_each_m'], bx('feet', 'size', 0) / 2 - .01, unit='m')
        row('feet: lowest point (m)', 0., bx('feet', 'min', 2), unit='m')
        row('tail back reach y (m)', BODY['side_tail_y_m'][1], bx('tail', 'max', 1), unit='m')
        row('tail top z (m) [x BZS; raised per round 2]', BODY['side_tail_z_m'][1] * BZS, bx('tail', 'max', 2), unit='m')
        row('quiver top z (m) [x BZS]', BODY['side_quiver_z_m'][1] * BZS, bx('quiver_tube', 'max', 2), unit='m')
        row('javelin tips top (m) [x BZS]', BODY['side_javelin_tips_top_m'] * BZS, bx('quiver', 'max', 2), unit='m')
        row('dragon top (m) [head-scaled]', hz(BODY['crest_top_m']), M.get('dragon_top_m'), unit='m')
OUT = {'sheet_targets': SHEET_T, 'compare': rows,
       'notes': ['Round 2 (the director): the face follows the sheet exactly (EZW, NZW, NHH back; the iris bottom 0.085 W under the nose top).',
                 'Round 2: the cast proportions. W 0.600 m (the sheet 0.405 m: head scale HS 1.48) with the skull crown kept at 1.200 m; the '
                 'body below the chin is the sheet body shortened by BZS = chin / 0.833 in z, widths kept, the arms scaled 0.9 about the shoulder.',
                 'Head-part targets are the sheet numbers mapped by HS about the crown; body heights by BZS. The tail is raised on purpose.',
                 'The face follows the head close-up (as the brief says); the turnaround draws the face shorter.']}
json.dump(OUT, open(os.path.join(ROOT, 'measurements.json'), 'w', encoding='utf-8'), indent=1, default=float)
w = max(len(r['target']) for r in rows) if rows else 10
for r in rows:
    print(('%-' + str(w) + 's  sheet %8s  model %8s  %s') % (r['target'], r['sheet'], r['model'], ('%+.1f%%' % r['dev_pct']) if r.get('dev_pct') is not None else ''))
print('measurements.json written')
