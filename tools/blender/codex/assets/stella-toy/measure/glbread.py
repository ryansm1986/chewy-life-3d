import json, struct, numpy as np, sys
def load(path):
    d = open(path, 'rb').read(); n = struct.unpack('<I', d[12:16])[0]; j = json.loads(d[20:20 + n])
    off = 20 + n; bl = struct.unpack('<I', d[off:off + 4])[0]; binb = d[off + 8:off + 8 + bl]
    out = {}
    for nd in j['nodes']:
        if 'mesh' not in nd: continue
        t = np.array(nd.get('translation', [0, 0, 0])); s = np.array(nd.get('scale', [1, 1, 1]))
        for p in j['meshes'][nd['mesh']]['primitives']:
            a = j['accessors'][p['attributes']['POSITION']]; bv = j['bufferViews'][a['bufferView']]
            o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
            P = np.frombuffer(binb[o:o + a['count'] * 12], np.float32).reshape(-1, 3) * s + t
            out.setdefault(nd.get('name', '?'), []).append(P)
    return {k: np.concatenate(v) for k, v in out.items()}
if __name__ == '__main__':
    M = load(sys.argv[1])
    for k, P in M.items():
        # game axes: x, y up, z front. -> blender: x, -z, y
        print(k, len(P), 'x', P[:, 0].min().round(3), P[:, 0].max().round(3), 'up', P[:, 1].min().round(3), P[:, 1].max().round(3), 'front', P[:, 2].min().round(3), P[:, 2].max().round(3))
