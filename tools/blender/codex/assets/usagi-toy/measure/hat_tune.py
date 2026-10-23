"""numeric hat tuner: petal extents in head-local W for HAT params (no Blender). python measure/hat_tune.py key=val ..."""
import sys, math, numpy as np
src = open('D:/projects/chewy-life-3d/tools/blender/work/codex/usagi-toy/build_usagi-toy.py', encoding='utf-8').read()
PI = math.pi
def unit(v): return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)
def clamp(x): return np.clip(x, 0, 1)
def smooth(a, b, x):
    t = clamp((np.asarray(x, dtype=float) - a) / (b - a)); return t * t * (3 - 2 * t)
def rot(axis, ang):
    axis = unit(np.asarray(axis, float)); K = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    return np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * (K @ K)
i0 = src.index('def cube_sphere(n):'); i1 = src.index("print('STEP ears'")
exec(src[i0:i1])
j0 = src.index('HAT = dict('); j1 = src.index("_S, _Fs = cube_sphere")
g = dict(globals()); exec(src[j0:j1], g); HAT = g['HAT']
for kv in sys.argv[1:]:
    k, v = kv.split('='); HAT[k] = float(v)
HAT_R = rot([1, 0, 0], -math.radians(HAT['tilt']))
def hat_to_local(p): return np.asarray(HAT['c'], float) + np.asarray(p, float) @ HAT_R.T
_S8, _F8 = cube_sphere(int(HAT['n']))
k0 = src.index('def petal_pts(k):'); k1 = src.index("for k in range(6):\n    _pp")
g.update(dict(HAT=HAT, _S8=_S8, smooth=smooth, clamp=clamp, PETAL_UNDER={})); exec(src[k0:k1], g)
allp = []
for k in range(6):
    P = hat_to_local(g['petal_pts'](k)); allp.append(P)
    i = np.argmin(P[:, 2])
    print('petal %d (%3d deg): lowest z %.3f at x %.3f y %.3f | y range %.3f..%.3f | x range %.3f..%.3f | max z %.3f' % (k, 60 * k, P[i, 2], P[i, 0], P[i, 1], P[:, 1].min(), P[:, 1].max(), P[:, 0].min(), P[:, 0].max(), P[:, 2].max()))
A = np.concatenate(allp)
for z in (.40, .45, .50, .55, .60):
    m = np.abs(A[:, 2] - z) < .02
    if m.any(): print('z %.2f: x max %.3f' % (z, A[m, 0].max()))
print('front-view lowest z at |x| .5: %.3f, at |x| .6: %.3f' % (A[np.abs(np.abs(A[:, 0]) - .5) < .02, 2].min(), A[np.abs(np.abs(A[:, 0]) - .6) < .02, 2].min()))
print('targets: front edge z .59-.62 at y -.44; back lowest z .29 at y .54-.68; side lowest z .40 (|x| .57); widest |x| .63 at z .45-.52')
