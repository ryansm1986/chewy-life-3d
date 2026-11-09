# cloth uv read back: the v of the attached top against the free end, as the game reads it. python uvcheck.py file.glb
import sys, json, struct
d = open(sys.argv[1], 'rb').read(); jl = struct.unpack('<I', d[12:16])[0]; js = json.loads(d[20:20 + jl]); b0 = 20 + jl + 8
def acc(i):
    a = js['accessors'][i]; bv = js['bufferViews'][a['bufferView']]; n = {'VEC2': 2, 'VEC3': 3}[a['type']]
    st = bv.get('byteStride', 4 * n); off = b0 + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [struct.unpack_from('<' + 'f' * n, d, off + k * st) for k in range(a['count'])]
for m in js['meshes']:
    for p in m['primitives']:
        if js['materials'][p['material']]['name'] != 'cloth': continue
        P, U = acc(p['attributes']['POSITION']), acc(p['attributes']['TEXCOORD_0'])
        hi = max(range(len(P)), key=lambda i: P[i][1]); lo = min(range(len(P)), key=lambda i: P[i][1])
        print('top y %.2f v %.2f | bottom y %.2f v %.2f' % (P[hi][1], U[hi][1], P[lo][1], U[lo][1]))
