# poi-west: read poi-wishtree-1.glb back (the uv as three.js reads it: no flip): every cards_round card's four corners on the C1 or C2 rect, 2 px inset, the same way up.
#   python check_cards.py
import json, struct, os
HERE = os.path.dirname(os.path.abspath(__file__))
d = open(os.path.join(HERE, '..', '..', '..', '..', '..', 'public', 'models', 'poi-wishtree-1.glb'), 'rb').read()
jl = struct.unpack('<I', d[12:16])[0]; js = json.loads(d[20:20 + jl]); bin0 = 20 + jl + 8
def acc(i):
    a = js['accessors'][i]; bv = js['bufferViews'][a['bufferView']]; n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    fmt = {5126: 'f', 5123: 'H', 5125: 'I', 5121: 'B'}[a['componentType']]; sz = struct.calcsize(fmt); st = bv.get('byteStride', sz * n); off = bin0 + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [struct.unpack_from('<' + fmt * n, d, off + k * st) for k in range(a['count'])]
R = {'C1': (2, 2, 254, 254), 'C2': (2, 258, 254, 510)}
for m in js['meshes']:
    for p in m['primitives']:
        name = js['materials'][p['material']]['name']; P = acc(p['attributes']['POSITION']); I = [i[0] for i in acc(p['indices'])]
        print(name, 'tris', len(I) // 3, 'colour', 'COLOR_0' in p['attributes'])
        if name != 'cards_round': continue
        U = acc(p['attributes']['TEXCOORD_0']); bad = 0; cnt = {'C1': 0, 'C2': 0}; flipped = 0
        for t in range(0, len(I), 6):          # (each card: two triangles, four corners)
            ids = list(dict.fromkeys(I[t:t + 6])); uv = [(round(U[i][0] * 512, 2), round(U[i][1] * 512, 2)) for i in ids]
            hit = None
            for k, (u0, v0, u1, v1) in R.items():
                if len(uv) == 4 and set(uv) == {(u0, v0), (u1, v0), (u1, v1), (u0, v1)}: hit = k
            if not hit: bad += 1; continue
            cnt[hit] += 1
            # (the corner order the build wrote: (u0, v0) → (u1, v0) along one edge: its signed uv area must be the same on every card)
            a, b, c = uv[0], uv[1], uv[2]; s = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            flipped += s < 0
        print('cards', len(I) // 6, cnt, 'off the rects', bad, 'mirrored', flipped, 'uv range', min(u[0] for u in U), max(u[0] for u in U), min(u[1] for u in U), max(u[1] for u in U))
