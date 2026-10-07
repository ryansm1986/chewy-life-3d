"""Validate export/shadow_whelp.* and prove it is the installed shadow_toy plus the costume (public/rigs is read only).

    python validate_export.py   -> export/validation.json

1. Data: finite positions and normals, UVs in 0..1, skin indices < 21, skin weights summing to 255 (= 1), no degenerate
   triangles, indices in range, the quad contract and its 21 bones.
2. Outward winding: every costume triangle (its atlas chart, as outward_check.py) faces away from its part's interior
   (shells: the skin under them or their star centre; tail cover and piping: their centre lines; horns and spikes: their axes).
3. Identity with the installed shadow_toy:
   - the 21 bones: same names, parents and positions;
   - every shadow_toy vertex is in shadow_whelp with the same position, UV pixel (2048 x 2048 -> 2048 x 2304 rows), normal,
     skin bones and weights (compared as multisets per key, like the samurai's verify_face.py);
   - his atlas: shadow_toy.png against the bottom 2048 rows of shadow_whelp.png, pixel by pixel.
"""
import json, os
import numpy as np
from collections import defaultdict, Counter
from PIL import Image
T = os.path.dirname(os.path.abspath(__file__)); E = os.path.join(T, 'export'); RIGS = 'D:/projects/chewy-life-3d/public/rigs'
def load(d, name):
    meta = json.load(open(os.path.join(d, name + '.json')))
    raw = open(os.path.join(d, name + '.bin'), 'rb').read()
    A = {v['name']: np.frombuffer(raw, dtype='<' + v['type'], count=v['count'], offset=v['offset']).reshape(-1, v['itemSize']) for v in meta['layout']}
    return meta, A
mt, TOY = load(RIGS, 'shadow_toy'); mw, WH = load(E, 'shadow_whelp')
out = {}
# ---------------------------------------------------------------- 1. data
P = WH['position'].astype(np.float64); N = WH['normal'].astype(np.float64) / 32767; UV = WH['uv'].astype(np.float64)
I = WH['index'].ravel().astype(np.int64).reshape(-1, 3); SI = WH['skinIndex']; SW = WH['skinWeight'].astype(int)
sums = SW.sum(1)
tri_area = 0.5 * np.linalg.norm(np.cross(P[I[:, 1]] - P[I[:, 0]], P[I[:, 2]] - P[I[:, 0]]), axis=1)
out['data'] = {'contract': mw['contract'], 'bones': len(mw['bones']), 'height': mw['height'], 'vertices': int(len(P)), 'triangles': int(len(I)),
               'finite_positions': bool(np.isfinite(P).all()), 'finite_normals': bool(np.isfinite(N).all()),
               'normals_unit_min_max': [round(float(np.linalg.norm(N, axis=1).min()), 4), round(float(np.linalg.norm(N, axis=1).max()), 4)],
               'uv_in_0_1': bool((UV >= 0).all() and (UV <= 1).all()), 'skin_index_max': int(SI.max()),
               'skin_weight_sum_min_max_of_255': [int(sums.min()), int(sums.max())],
               'skin_weight_sum_off_by_more_than_1': int((np.abs(sums - 255) > 1).sum()),
               'indices_in_range': bool(I.max() < len(P) and I.min() >= 0),
               'degenerate_triangles_area_lt_1e-12': int((tri_area < 1e-12).sum()), 'min_triangle_area_m2': float(tri_area.min())}
# ---------------------------------------------------------------- 2. outward winding of the costume (Blender axes)
B = np.stack([P[:, 0], -P[:, 2], P[:, 1]], -1); NB = np.stack([N[:, 0], -N[:, 2], N[:, 1]], -1)
REF = json.load(open(os.path.join(T, 'costume_ref.json'))); AW, AH = REF['atlas']; CH = REF['charts']
uvc = UV[I].mean(1) * np.array([AW, AH])
def chart_of(u, v):
    for k, (x, y, w, h) in CH.items():
        if x <= u < x + w and y <= v < y + h: return k
    return None
costume_v = UV[:, 1] * AH >= 2048
skin = np.where(~costume_v)[0]; SKP = B[skin]; SKN = NB[skin]
def seg_near(c, line):
    L = np.asarray(line); a, b = L[:-1], L[1:]; ab = b - a
    t = np.clip(np.einsum('ij,ij->i', c - a, ab) / np.maximum(np.einsum('ij,ij->i', ab, ab), 1e-12), 0, 1)
    q = a + t[:, None] * ab; return q[np.argmin(np.linalg.norm(c - q, axis=1))]
def unit(v): n = np.linalg.norm(v); return v / n if n > 1e-12 else v
counts = {}
for k in range(len(I)):
    ch = chart_of(*uvc[k])
    if ch is None: continue
    tp = B[I[k]]; c = tp.mean(0); n = unit(np.cross(tp[1] - tp[0], tp[2] - tp[0]))
    if ch in ('hood', 'coat', 'bib'):
        j = int(np.argmin(((SKP - c) ** 2).sum(1))); o1 = SKN[j]; o2 = unit(c - np.array(REF[ch + '_O']))
        o = o1 if np.dot(n, o1) >= np.dot(n, o2) else o2
    elif ch == 'tail': o = c - seg_near(c[None], REF['tail_line'])
    elif ch == 'cuff':
        o = c - min((seg_near(c[None], np.vstack([l, l[:1]])) for l in map(np.array, REF['cuff_lines'].values())), key=lambda q: np.linalg.norm(c - q))
    else:
        ul = (uvc[k][0] - CH['brass'][0] - 4) / (CH['brass'][2] - 8)
        kk = int(np.clip(np.floor(ul * len(REF['cone_axes'])), 0, len(REF['cone_axes']) - 1)); o = c - seg_near(c[None], REF['cone_axes'][kk])
    r = counts.setdefault(ch, {'triangles': 0, 'inward': 0}); r['triangles'] += 1; r['inward'] += int(np.dot(n, unit(o)) < -0.25)
out['costume_outward'] = counts; out['costume_inward_total'] = sum(v['inward'] for v in counts.values())
# ---------------------------------------------------------------- 3. identity with the installed shadow_toy
tb = [(b['name'], b['parent']) for b in mt['bones']]; wb = [(b['name'], b['parent']) for b in mw['bones']]
out['bones_same_names_parents_order'] = tb == wb
out['bone_max_delta_m'] = float(max(np.abs(np.array(a['pos']) - np.array(b['pos'])).max() for a, b in zip(mt['bones'], mw['bones'])))
names = [b['name'] for b in mt['bones']]
def keys(A, vscale):
    pos = np.round(A['position'].astype(np.float64), 6); uvp = np.round(A['uv'].astype(np.float64) * np.array([2048.0, vscale]), 2)
    return [tuple(pos[i]) + tuple(uvp[i]) + tuple(A['normal'][i]) for i in range(len(pos))]
def skins(A):
    return [tuple(sorted((names[int(b)], int(w)) for b, w in zip(A['skinIndex'][i], A['skinWeight'][i]) if w)) for i in range(len(A['position']))]
kt, kw = keys(TOY, 2048.0), keys(WH, 2304.0); st, sw_ = skins(TOY), skins(WH)
gt, gw = defaultdict(list), defaultdict(list)
for k, s in zip(kt, st): gt[k].append(s)
for k, s in zip(kw, sw_): gw[k].append(s)
missing = [k for k in gt if k not in gw]
diff = [k for k in gt if k in gw and Counter(gt[k]) - Counter(gw[k])]
out['shadow_toy_vertices'] = int(len(kt)); out['shadow_toy_vertex_keys'] = len(gt)
out['keys_found_in_whelp'] = len(gt) - len(missing); out['keys_missing'] = len(missing)
out['keys_with_different_skin'] = len(diff)
out['whelp_extra_vertices_all_costume'] = bool(all(UV[i, 1] * AH >= 2048 for i in range(len(kw)) if kw[i] not in gt))
out['whelp_vertices_not_in_toy'] = int(sum(1 for k in kw if k not in gt))
# triangle equivalence: every shadow_toy triangle (as a multiset of vertex keys: coincident lip-seam twins share a key) is in shadow_whelp
TI = TOY['index'].ravel().astype(np.int64).reshape(-1, 3)
wt = Counter(tuple(sorted(kw[a] for a in t)) for t in I.tolist()); tt = Counter(tuple(sorted(kt[a] for a in t)) for t in TI.tolist())
out['shadow_toy_triangles'] = int(len(TI)); out['shadow_toy_triangles_found_in_whelp'] = int(sum(min(c, wt[k]) for k, c in tt.items()))
# degenerate triangles: split into the costume's and those inherited from the installed shadow_toy (its locked lid shells)
TP = TOY['position'].astype(np.float64)
toy_area = 0.5 * np.linalg.norm(np.cross(TP[TI[:, 1]] - TP[TI[:, 0]], TP[TI[:, 2]] - TP[TI[:, 0]]), axis=1)
deg = np.where(tri_area < 1e-12)[0]
deg_keys = Counter(tuple(sorted(kw[a] for a in I[k])) for k in deg)
toy_deg_keys = Counter(tuple(sorted(kt[a] for a in TI[k])) for k in np.where(toy_area < 1e-12)[0])
out['degenerate'] = {'total': int(len(deg)), 'in_costume': int(sum(1 for k in deg if (UV[I[k], 1] * 2304 >= 2048).any())),
                     'inherited_from_installed_shadow_toy': int(sum(min(c, toy_deg_keys[k]) for k, c in deg_keys.items())),
                     'installed_shadow_toy_has': int((toy_area < 1e-12).sum()),
                     'where': 'the locked lid shells (Shadow_lid* charts in the eye atlas rows), zero-area grid ends, as shipped'}
ta = np.array(Image.open(os.path.join(RIGS, 'shadow_toy.png')).convert('RGB')).astype(int)
wa = np.array(Image.open(os.path.join(E, 'shadow_whelp.png')).convert('RGB')).astype(int)
out['atlas_sizes'] = {'shadow_toy': list(ta.shape[:2][::-1]), 'shadow_whelp': list(wa.shape[:2][::-1])}
out['atlas_his_rows_max_diff_8bit'] = int(np.abs(ta - wa[wa.shape[0] - 2048:]).max())
ok = (out['data']['finite_positions'] and out['data']['finite_normals'] and out['data']['uv_in_0_1'] and out['data']['indices_in_range']
      and out['data']['skin_weight_sum_off_by_more_than_1'] == 0 and out['degenerate']['in_costume'] == 0
      and out['degenerate']['total'] == out['degenerate']['inherited_from_installed_shadow_toy']
      and out['costume_inward_total'] == 0 and out['bones_same_names_parents_order'] and out['bone_max_delta_m'] == 0
      and out['keys_missing'] == 0 and out['keys_with_different_skin'] == 0 and out['atlas_his_rows_max_diff_8bit'] == 0
      and out['shadow_toy_triangles_found_in_whelp'] == out['shadow_toy_triangles'])
out['ALL_OK'] = bool(ok)
json.dump(out, open(os.path.join(E, 'validation.json'), 'w'), indent=1)
print(json.dumps(out, indent=1))
