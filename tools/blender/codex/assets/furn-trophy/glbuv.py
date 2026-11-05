# glbuv.py <glb>: for each primitive with TEXCOORD_0, the glTF uv.y at its highest and lowest vertex (y up)
import sys, json, struct
d = open(sys.argv[1], 'rb').read()
jl = struct.unpack('<I', d[12:16])[0]; J = json.loads(d[20:20 + jl]); B = d[20 + jl + 8:]
def acc(i):
    a = J['accessors'][i]; v = J['bufferViews'][a['bufferView']]; o = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    n = {'VEC2': 2, 'VEC3': 3}[a['type']]; st = v.get('byteStride', 4 * n)
    return [struct.unpack_from('<%df' % n, B, o + k * st) for k in range(a['count'])]
mats = [m.get('name') for m in J.get('materials', [])]
for m in J['meshes']:
    for p in m['primitives']:
        at = p['attributes']
        if 'TEXCOORD_0' not in at: continue
        P = acc(at['POSITION']); U = acc(at['TEXCOORD_0'])
        hi = max(range(len(P)), key=lambda i: P[i][1]); lo = min(range(len(P)), key=lambda i: P[i][1])
        print(sys.argv[1].split('/')[-1], mats[p.get('material', 0)], 'top y %.3f uv.y %.3f | bottom y %.3f uv.y %.3f' % (P[hi][1], U[hi][1], P[lo][1], U[lo][1]))
