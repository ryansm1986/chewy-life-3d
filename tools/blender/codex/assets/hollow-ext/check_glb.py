# Reads a GLB directly (no Blender): per material, the uv range and its correlation with height (cloth: uv.y = 1 at the top)
import json, struct, sys
for path in sys.argv[1:]:
    b = open(path, 'rb').read()
    jl = struct.unpack_from('<I', b, 12)[0]; J = json.loads(b[20:20 + jl]); bin0 = 20 + jl + 8
    def acc(i):
        a = J['accessors'][i]; v = J['bufferViews'][a['bufferView']]
        n = {'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'SCALAR': 1}[a['type']]
        fmt = {5126: 'f', 5123: 'H', 5125: 'I', 5121: 'B'}[a['componentType']]
        off = bin0 + v.get('byteOffset', 0) + a.get('byteOffset', 0); sz = struct.calcsize(fmt)
        st = v.get('byteStride', sz * n)
        return [struct.unpack_from('<' + fmt * n, b, off + k * st) for k in range(a['count'])]
    for m in J['meshes']:
        for pr in m['primitives']:
            name = J['materials'][pr['material']]['name']; at = pr['attributes']
            P = acc(at['POSITION']); U = acc(at['TEXCOORD_0']) if 'TEXCOORD_0' in at else None
            msg = '%s %s verts %d attrs %s' % (path.split('/')[-1], name, len(P), sorted(at))
            if U:
                us = [u[0] for u in U]; vs = [u[1] for u in U]
                msg += ' u %.2f..%.2f v %.2f..%.2f' % (min(us), max(us), min(vs), max(vs))
                if name == 'cloth':
                    hi = [U[i][1] for i in range(len(P)) if P[i][1] > 1.9]; lo = [U[i][1] for i in range(len(P)) if 1.0 < P[i][1] < 1.9]
                    msg += ' | valance mean v (y>1.9) %.2f' % (sum(hi) / max(1, len(hi)))
            print(msg)
