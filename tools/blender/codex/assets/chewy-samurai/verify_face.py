"""Compare the samurai export with the installed chewy_b (public/rigs, read only):
the 37 bone pivots, and every non-body vertex (head, face lids, mouth pocket, tongue, eyes, ears, tail): position, uv,
normal, skin bones and weights. Also checks the locked body parts' skinning vertex by vertex.
    python verify_face.py   -> export/face-identity.json
"""
import json, os
import numpy as np
T = os.path.dirname(os.path.abspath(__file__))
def load(d, name):
    meta = json.load(open(os.path.join(d, name + '.json')))
    raw = open(os.path.join(d, name + '.bin'), 'rb').read()
    A = {v['name']: np.frombuffer(raw, dtype='<' + v['type'], count=v['count'], offset=v['offset']).reshape(-1, v['itemSize']) for v in meta['layout']}
    return meta, A
mb, B = load('D:/projects/chewy-life-3d/public/rigs', 'chewy_b')
ms, S = load(os.path.join(T, 'export'), 'chewy_samurai')
out = {}
bp = {b['name']: b['pos'] for b in mb['bones']}; sp = {b['name']: b['pos'] for b in ms['bones']}
out['bones_same_names_and_parents'] = [(b['name'], b['parent']) for b in mb['bones']] == [(b['name'], b['parent']) for b in ms['bones']]
out['bone_max_delta_m'] = float(max(np.abs(np.array(bp[k]) - np.array(sp[k])).max() for k in bp))
def key(A, i):
    return tuple(np.round(A['position'][i], 6)) + tuple(np.round(A['uv'][i], 6)) + tuple(A['normal'][i])
names = [b['name'] for b in mb['bones']]
def skin(A, i):
    return {names[int(b)]: int(w) for b, w in zip(A['skinIndex'][i], A['skinWeight'][i]) if w}
# index the samurai's vertices by (position, uv, normal)
idx = {}
for i in range(len(S['position'])): idx.setdefault(key(S, i), i)
# chewy_b's vertices: decide body vs the rest from the samurai's skin set: non-body = any vertex whose position is above the
# collar (head, ears, face shells) or lies on the eye, lid, mouth or tail meshes; we test every chewy_b vertex instead and
# report matches and mismatches by group
miss = 0; wdiff = 0; ndone = 0; by_bone = {}
body_like = 0
for i in range(len(B['position'])):
    k = key(B, i); j = idx.get(k)
    sk = skin(B, i)
    if j is None:
        miss += 1; continue
    ndone += 1
    if skin(S, j) != sk:
        wdiff += 1
        b = max(sk, key=sk.get); by_bone[b] = by_bone.get(b, 0) + 1
out['chewy_b_vertices'] = int(len(B['position']))
out['found_in_samurai_with_same_position_uv_normal'] = ndone
out['not_found'] = miss
out['found_but_different_skin'] = wdiff
out['different_skin_by_dominant_bone'] = by_bone
# which chewy_b vertices are missing: they should all be the old costume (gi, pants, sash, kerchief)
mpos = np.array([B['position'][i] for i in range(len(B['position'])) if key(B, i) not in idx])
if len(mpos):
    out['missing_y_range_game_m'] = [float(mpos[:, 1].min()), float(mpos[:, 1].max())]
json.dump(out, open(os.path.join(T, 'export', 'face-identity.json'), 'w'), indent=1)
print(json.dumps(out, indent=1))

# ---- refine: compare multisets of skins per (position, uv, normal) key (the lip seam has coincident twins)
from collections import defaultdict
gb, gs = defaultdict(list), defaultdict(list)
for i in range(len(B['position'])): gb[key(B, i)].append(tuple(sorted(skin(B, i).items())))
for i in range(len(S['position'])): gs[key(S, i)].append(tuple(sorted(skin(S, i).items())))
shared = [k for k in gb if k in gs]
diff = [k for k in shared if sorted(gb[k]) != sorted(gs[k])]
out['keys_shared'] = len(shared); out['keys_with_different_skin_multiset'] = len(diff)
out['twin_keys_in_chewy_b'] = sum(1 for k in gb if len(gb[k]) > 1)
# the chewy_b vertices not in the samurai: is the position present at all (normal/uv change) or gone (old costume)?
pos_s = set(tuple(np.round(p, 6)) for p in S['position'])
gone = [i for i in range(len(B['position'])) if key(B, i) not in gs]
same_pos = [i for i in gone if tuple(np.round(B['position'][i], 6)) in pos_s]
out['missing_but_position_present'] = len(same_pos)
if same_pos:
    P_ = np.array([B['position'][i] for i in same_pos]); out['missing_but_position_present_y_range'] = [float(P_[:, 1].min()), float(P_[:, 1].max())]
json.dump(out, open(os.path.join(T, 'export', 'face-identity.json'), 'w'), indent=1)
print('REFINED', json.dumps({k: out[k] for k in ('keys_shared', 'keys_with_different_skin_multiset', 'twin_keys_in_chewy_b', 'missing_but_position_present')}))
if same_pos: print('present-y', out['missing_but_position_present_y_range'])
