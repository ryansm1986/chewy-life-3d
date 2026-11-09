# glb info: per mesh/material: tris, bbox (game frame), uv range.  python glbinfo.py file.glb
import sys, json, struct
d = open(sys.argv[1], 'rb').read()
jl = struct.unpack('<I', d[12:16])[0]; js = json.loads(d[20:20 + jl]); bin0 = 20 + jl + 8
def acc(i):
    a = js['accessors'][i]; bv = js['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    fmt = {5126: 'f', 5123: 'H', 5125: 'I', 5121: 'B'}[a['componentType']]
    sz = struct.calcsize(fmt); st = bv.get('byteStride', sz * n); off = bin0 + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [struct.unpack_from('<' + fmt * n, d, off + k * st) for k in range(a['count'])]
tot = 0
for m in js['meshes']:
    for p in m['primitives']:
        mat = js['materials'][p['material']]['name'] if 'material' in p else '-'
        P = acc(p['attributes']['POSITION']); nt = (len(acc(p['indices'])) if 'indices' in p else len(P)) // 3; tot += nt
        lo = [min(v[i] for v in P) for i in range(3)]; hi = [max(v[i] for v in P) for i in range(3)]
        s = '%-6s tris %5d  x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f' % (mat, nt, lo[0], hi[0], lo[1], hi[1], lo[2], hi[2])
        if 'TEXCOORD_0' in p['attributes']:
            U = acc(p['attributes']['TEXCOORD_0']); s += '  uv u %.2f..%.2f v %.2f..%.2f' % (min(u[0] for u in U), max(u[0] for u in U), min(u[1] for u in U), max(u[1] for u in U))
        print(s)
print('total tris', tot)
