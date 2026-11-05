# Reads the exported GLBs back (plain glTF parse, the uv as three.js reads it: no flip) and checks the card UVs against
# the kit's (task bushes-village: both card parts, cards_round and cards_sakura): every card's corners land exactly on the atlas rects (C1 / C2 clusters, S1 / S2 sprays, 2 px inset), a
# spray runs v0 at its attachment (its highest point) to v1 at its tip, and the set of uv values equals the kit OBJ's.
#   python uv_check.py [keys...]
import json, struct, sys, os
from collections import defaultdict

MODELS = 'D:/projects/chewy-life-3d/public/models'
KIT = 'D:/projects/chewy-life-3d/tools/blender/work/codex/bushes-village/kit'
AT = 512
RECTS = {'C1': (0, 0, 256, 256), 'C2': (0, 256, 256, 512), 'S1': (256, 0, 384, 512), 'S2': (384, 0, 512, 512)}
UVR = {k: ((x0 + 2) / AT, (y0 + 2) / AT, (x1 - 2) / AT, (y1 - 2) / AT) for k, (x0, y0, x1, y1) in RECTS.items()}
CT = {5126: ('f', 4), 5125: ('I', 4), 5123: ('H', 2), 5121: ('B', 1)}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

def read_glb(path):
    b = open(path, 'rb').read()
    jl = struct.unpack_from('<I', b, 12)[0]; js = json.loads(b[20:20 + jl]); off = 20 + jl
    bl = struct.unpack_from('<I', b, off)[0]; bin_ = b[off + 8: off + 8 + bl]
    def acc(i):
        a = js['accessors'][i]; bv = js['bufferViews'][a['bufferView']]; f, sz = CT[a['componentType']]; n = NC[a['type']]
        st = bv.get('byteStride', sz * n); base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        return [struct.unpack_from('<' + f * n, bin_, base + st * k) for k in range(a['count'])]
    out = defaultdict(list)
    for node in js['nodes']:
        if 'mesh' not in node: continue
        for pr in js['meshes'][node['mesh']]['primitives']:
            mat = js['materials'][pr['material']]['name'] if 'material' in pr else 'none'
            P = acc(pr['attributes']['POSITION']); U = acc(pr['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in pr['attributes'] else None
            I = [i[0] for i in acc(pr['indices'])] if 'indices' in pr else list(range(len(P)))
            out[mat].append((P, U, I, 'COLOR_0' in pr['attributes'], 'NORMAL' in pr['attributes']))
    return out

def components(n, I):
    par = list(range(n))
    def f(x):
        while par[x] != x: par[x] = par[par[x]]; x = par[x]
        return x
    for t in range(0, len(I), 3):
        a, b, c = f(I[t]), f(I[t + 1]), f(I[t + 2]); par[b] = a; par[f(c)] = a
    g = defaultdict(list)
    for i in range(n): g[f(i)].append(i)
    return list(g.values())

def which(u, v=None):
    for k, (u0, v0, u1, v1) in UVR.items():
        if u0 - 1e-4 <= u <= u1 + 1e-4 and (v is None or k[0] == 'S' or v0 - 1e-4 <= v <= v1 + 1e-4): return k
    return None

def check(path, key, atl):
    parts = read_glb(path); res = {'part': 'cards_' + atl, 'clusters': 0, 'sprays': 0, 'bad': 0, 'flipped_sprays': 0}
    vals = set()
    for P, U, I, hc, hn in parts.get('cards_' + atl, []):
        res['color'] = hc; res['normal'] = hn
        for comp in components(len(P), I):
            us = [U[i] for i in comp]; k = which(*us[0])
            if k is None or any(which(*u) != k for u in us): res['bad'] += 1; continue
            u0, v0, u1, v1 = UVR[k]
            for u, v in us: vals.add((round(u, 4), round(v, 4)) if k[0] == 'C' else round(u, 4))
            if k[0] == 'C':
                ok = len(comp) == 4 and all(min(abs(u - u0), abs(u - u1)) < 1e-4 and min(abs(v - v0), abs(v - v1)) < 1e-4 for u, v in us)
                res['clusters'] += 1; res['bad'] += 0 if ok else 1
            else:
                res['sprays'] += 1
                if any(not (u0 - 1e-4 <= u <= u1 + 1e-4 and v0 - 1e-4 <= v <= v1 + 1e-4) for u, v in us): res['bad'] += 1; continue
                top = [i for i in comp if abs(U[i][1] - v0) < 1e-4]; tip = [i for i in comp if abs(U[i][1] - v1) < 1e-4]
                if not top or not tip: res['bad'] += 1; continue
                ty = sum(P[i][1] for i in top) / len(top); py = sum(P[i][1] for i in tip) / len(tip)
                if ty < py: res['flipped_sprays'] += 1
    # the kit's own uv values for the same species
    kv = set()
    lines = open(os.path.join(KIT, 'village-bush-%s-0.obj' % key)).read().split('\n'); cur = None
    for l in lines:
        if l.startswith('o '): cur = l[2:].strip()
        elif l.startswith('vt ') and cur == 'cards_' + atl:
            u, v = map(float, l.split()[1:3]); k = which(u, v)
            kv.add((round(u, 4), round(v, 4)) if k and k[0] == 'C' else round(u, 4))
    res['cluster_uv_corners_match_kit'] = {x for x in vals if isinstance(x, tuple)} <= {x for x in kv if isinstance(x, tuple)}
    res['spray_u_match_kit'] = {x for x in vals if not isinstance(x, tuple)} <= {x for x in kv if not isinstance(x, tuple)}
    return res

keys = sys.argv[1:] or ['hydrangea', 'azalea', 'box']
for key in keys:
    for k in range(3):
        p = os.path.join(MODELS, 'tree-village-bush-%s-v%d.glb' % (key, k))
        if not os.path.exists(p): continue
        print('UVC', os.path.basename(p), os.path.getsize(p) // 1024, 'KB', 'parts', sorted(read_glb(p)))
        for atl in (('round',) if key == 'box' else ('round', 'sakura')): print('UVC   ', check(p, key, atl))
