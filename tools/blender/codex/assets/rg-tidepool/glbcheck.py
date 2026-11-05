# print, per mesh primitive of a GLB: material, vertex count, uv range and (cloth) uv.y vs height correlation
import json, struct, sys
d = open(sys.argv[1], 'rb').read()
jl = struct.unpack('<I', d[12:16])[0]; J = json.loads(d[20:20 + jl]); bin0 = 20 + jl + 8
def acc(i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    n = {'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'SCALAR': 1}[a['type']]; off = bin0 + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    fmt = {5126: 'f', 5123: 'H', 5125: 'I', 5121: 'B'}[a['componentType']]; sz = struct.calcsize(fmt)
    st = bv.get('byteStride', sz * n)
    return [struct.unpack_from('<' + fmt * n, d, off + k * st) for k in range(a['count'])]
for m in J['meshes']:
    for p in m['primitives']:
        mat = J['materials'][p['material']]['name']; at = p['attributes']
        P = acc(at['POSITION']); s = '%-6s verts %5d attrs %s' % (mat, len(P), sorted(at))
        if 'TEXCOORD_0' in at:
            U = acc(at['TEXCOORD_0']); vs = [u[1] for u in U]; us = [u[0] for u in U]
            s += ' u %.2f..%.2f v %.2f..%.2f' % (min(us), max(us), min(vs), max(vs))
            if mat == 'cloth':
                top = max(P, key=lambda q: q[1]); bot = min(P, key=lambda q: q[1])
                s += ' | v at highest vert %.2f, at lowest %.2f' % (U[P.index(top)][1], U[P.index(bot)][1])
        print(m['name'], s)
