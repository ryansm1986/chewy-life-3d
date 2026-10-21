"""the dress flare: the hem widths over the skirt's width just below the sleeve cuffs (the visible waist; the obi's own ends are hidden
behind the cuffs on the sheet). Sheet: ruled front-view readings (sheet px); model: the GLB's skirt meshes (metres).   python measure/flare2.py"""
import sys, os, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from glbread import load
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# sheet front turnaround (measure/ruled.py 30 260 330 440 2.6): robe just below the cuffs (row 340) x 104-255; the periwinkle hem (lobes,
# row 378) x 75-282; the pink hem (row 410) x 68-290; the obi's visible front x 125-232 (its ends behind the cuffs)
S = {'waist_below_cuffs': 255 - 104, 'periwinkle_hem': 282 - 75, 'pink_hem': 290 - 68, 'obi_visible': 232 - 125}
G = load('D:/projects/chewy-life-3d/public/models/stella-toy.glb')
def bl(P): return np.stack([P[:, 0], -P[:, 2], P[:, 1]], -1)
peri = bl(G['Stella_skirt_outer']); pink = bl(G['Stella_skirt_mid']); slv = bl(G['Stella_sleeve_L']); body = bl(G['Stella_body'])
zc = slv[:, 2].min() - .012
band = np.abs(peri[:, 2] - zc) < .006
Mw = {'waist_below_cuffs': float(np.ptp(peri[band, 0])), 'periwinkle_hem': float(np.ptp(peri[:, 0])), 'pink_hem': float(np.ptp(pink[:, 0]))}
ob = body[(body[:, 2] > .46) & (body[:, 2] < .54) & (body[:, 1] < -.05)]
Mw['obi_front_visible'] = float(np.ptp(ob[:, 0]))
out = {'sheet_px': S, 'model_m': {k: round(v, 3) for k, v in Mw.items()}, 'model_cuff_z_m': round(float(zc), 3),
       'ratios(periwinkle/waist, pink/waist)': {'sheet': [round(S['periwinkle_hem'] / S['waist_below_cuffs'], 3), round(S['pink_hem'] / S['waist_below_cuffs'], 3)],
                                               'model': [round(Mw['periwinkle_hem'] / Mw['waist_below_cuffs'], 3), round(Mw['pink_hem'] / Mw['waist_below_cuffs'], 3)]},
       'ratios(periwinkle/obi, pink/obi) [obi = its visible front]': {'sheet': [round(S['periwinkle_hem'] / S['obi_visible'], 3), round(S['pink_hem'] / S['obi_visible'], 3)]}}
json.dump(out, open(os.path.join(ROOT, 'scratch', 'flare.json'), 'w'), indent=1); print(json.dumps(out, indent=1))
