# reads the GLBs back: per GLB triangles, size, origin (game frame) beside the kit; materials; NaN and zero-area checks. python report.py
import json, os, struct, math
HERE = os.path.dirname(os.path.abspath(__file__)); M = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..', 'public', 'models'))
K = json.load(open(os.path.join(HERE, 'kitdump', 'stats.json')))
def read(path):
    d = open(path, 'rb').read(); jl = struct.unpack('<I', d[12:16])[0]; js = json.loads(d[20:20 + jl]); b0 = 20 + jl + 8
    def acc(i):
        a = js['accessors'][i]; bv = js['bufferViews'][a['bufferView']]; n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]; f = {5126: 'f', 5123: 'H', 5125: 'I', 5121: 'B'}[a['componentType']]
        sz = struct.calcsize(f); st = bv.get('byteStride', sz * n); off = b0 + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        return [struct.unpack_from('<' + f * n, d, off + k * st) for k in range(a['count'])]
    out = dict(mats=[m['name'] for m in js.get('materials', [])], tris=0, P=[], attrs=set(), zero=0, nan=0)
    for m in js['meshes']:
        for p in m['primitives']:
            P = acc(p['attributes']['POSITION']); idx = [i[0] for i in acc(p['indices'])] if 'indices' in p else list(range(len(P)))
            out['attrs'] |= set(p['attributes']); out['tris'] += len(idx) // 3; out['P'] += P
            N = acc(p['attributes']['NORMAL']); out['nan'] += sum(1 for v in P + N if any(math.isnan(c) for c in v))
            for t in range(0, len(idx), 3):
                a, b, c = P[idx[t]], P[idx[t + 1]], P[idx[t + 2]]
                u = [b[i] - a[i] for i in range(3)]; v = [c[i] - a[i] for i in range(3)]
                cr = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
                if math.sqrt(sum(x * x for x in cr)) < 1e-7: out['zero'] += 1
    return out
print('| GLB | tris (kit) | size x y z (kit) | centre x z (kit) | y min | mats | attrs | zero/NaN |'); print('|---|---|---|---|---|---|---|---|')
for m in K:
    for look in ('full', 'taken'):
        r = read(os.path.join(M, 'prop-scav-%s-%s.glb' % (m, look))); P = r['P']; lo = [min(v[i] for v in P) for i in range(3)]; hi = [max(v[i] for v in P) for i in range(3)]; k = K[m][look]
        print('| %s-%s | %d (%d) | %.2f %.2f %.2f (%.2f %.2f %.2f) | %.2f %.2f (%.2f %.2f) | %.2f | %s | %s | %d/%d |' % (m, look, r['tris'], k['tris'], hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], k['max'][0] - k['min'][0], k['max'][1] - k['min'][1], k['max'][2] - k['min'][2], (hi[0] + lo[0]) / 2, (hi[2] + lo[2]) / 2, (k['max'][0] + k['min'][0]) / 2, (k['max'][2] + k['min'][2]) / 2, lo[1], ','.join(r['mats']), ','.join(sorted(r['attrs'])), r['zero'], r['nan']))
