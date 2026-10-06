"""Back-face test on an exported hero binary, the way the game draws it (three.js culls by triangle winding):
for every outfit triangle in an outer atlas region, the winding normal must point away from its part's axis.
    python export_outward.py [EXPORT_DIR] [NAME]   -> prints per-region counts; writes EXPORT_DIR/outward.json"""
import json, os, sys
import numpy as np
T = os.path.dirname(os.path.abspath(__file__))
E = sys.argv[1] if len(sys.argv) > 1 else os.path.join(T, 'export'); NAME = sys.argv[2] if len(sys.argv) > 2 else 'chewy_samurai'
meta = json.load(open(os.path.join(E, NAME + '.json'))); raw = open(os.path.join(E, NAME + '.bin'), 'rb').read()
A = {v['name']: np.frombuffer(raw, dtype='<' + v['type'], count=v['count'], offset=v['offset']).reshape(-1, v['itemSize']) for v in meta['layout']}
P = A['position'].astype(np.float64); B = np.stack([P[:, 0], -P[:, 2], P[:, 1]], -1)   # back to Blender axes
I = A['index'].ravel().reshape(-1, 3); UV = A['uv']
RECTS = {'haori body': (1024, 1024, 1024, 512), 'sleeves': (512, 768, 512, 256), 'hakama legs': (0, 640, 512, 384), 'kimono front': (512, 256, 512, 256)}
c = B[I].mean(1); n = np.cross(B[I[:, 1]] - B[I[:, 0]], B[I[:, 2]] - B[I[:, 0]]); n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
uvc = UV[I[:, 0]] * 2048
sh = {s: (np.array([s * .188, .013, .641]), np.array([s * .284, -.002, .510])) for s in (1, -1)}
out = {}
for nm, (x, y, w, h) in RECTS.items():
    m = (uvc[:, 0] >= x + 5) & (uvc[:, 0] <= x + w - 5) & (uvc[:, 1] >= y + 5) & (uvc[:, 1] <= y + h - 5)   # (the gutters hold the rig's skin patch)
    C = c[m]; N = n[m]
    if nm == 'hakama legs':      # which leg: the triangle's winding side doesn't decide it; the nearer leg axis over the hem ring does
        side = np.where(C[:, 0] + .02 * np.sign(N[:, 0]) * 0 > 0, 1., -1.)
        ax = np.stack([side * .14, np.full(len(C), .006), C[:, 2]], -1)
    elif nm == 'sleeves':
        ax = np.zeros_like(C)
        for s in (1, -1):
            a, b = sh[s]; d = (b - a) / np.linalg.norm(b - a); k = (C[:, 0] > 0) == (s > 0)
            ax[k] = a + np.outer((C[k] - a) @ d, d)
    else:
        ax = np.stack([np.zeros(len(C)), np.full(len(C), .01), C[:, 2]], -1)
    r = C - ax; r /= np.maximum(np.linalg.norm(r, axis=1, keepdims=True), 1e-12)
    dots = np.sum(N * r, 1)
    if nm == 'hakama legs':      # the two legs overlap at the centre; judge those few by either leg
        alt = C - np.stack([-np.sign(C[:, 0]) * .14, np.full(len(C), .006), C[:, 2]], -1); alt /= np.maximum(np.linalg.norm(alt, axis=1, keepdims=True), 1e-12)
        dots = np.maximum(dots, np.where(np.abs(C[:, 0]) < .06, np.sum(N * alt, 1), -9))
    bad = dots < -.25
    out[nm] = {'triangles': int(m.sum()), 'inward': int(bad.sum())}
    if bad.any(): out[nm]['inward_z_range'] = [round(float(C[bad, 2].min()), 3), round(float(C[bad, 2].max()), 3)]
print(json.dumps(out))
json.dump(out, open(os.path.join(E, 'outward.json'), 'w'), indent=1)
