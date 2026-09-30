# Signed-distance sculpting kit (numpy) + surface-nets mesher, used to build characters from smoothly blended forms.
# Every shape is a function f(P) -> distance for points P (N, 3); negative inside. Compose with smooth unions etc.
import numpy as np

def _len(v): return np.sqrt(np.einsum('...i,...i->...', v, v))
def _dot(a, b): return np.einsum('...i,...i->...', a, b)
def _clamp(x, a=0.0, b=1.0): return np.minimum(np.maximum(x, a), b)
V = lambda *a: np.array(a, np.float64)

def rot(rx=0, ry=0, rz=0):
    """rotation matrix (XYZ euler, radians): local = (P - c) @ R  maps world into the shape's frame"""
    cx, sx, cy, sy, cz, sz = np.cos(rx), np.sin(rx), np.cos(ry), np.sin(ry), np.cos(rz), np.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]); Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx

# ------------------------------------------------------------------ primitives
def sphere(c, r):
    c = V(*c)
    return lambda P: _len(P - c) - r

def ellipsoid(c, r, R=None):
    """IQ's bound approximation (exact on the surface, good enough near it)"""
    c, r = V(*c), V(*r)
    def f(P):
        q = P - c
        if R is not None: q = q @ R
        k0 = _len(q / r); k1 = _len(q / (r * r))
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-12)
    return f

def capsule(a, b, r):
    a, b = V(*a), V(*b); ba = b - a; bb = _dot(ba, ba)
    def f(P):
        pa = P - a; h = _clamp(_dot(pa, ba) / bb)
        return _len(pa - ba * h[..., None]) - r
    return f

def round_cone(a, b, r1, r2):
    """capsule whose radius goes r1 (at a) -> r2 (at b), IQ sdRoundCone"""
    a, b = V(*a), V(*b); ba = b - a; l2 = _dot(ba, ba); rr = r1 - r2; a2 = l2 - rr * rr; il2 = 1.0 / l2
    def f(P):
        pa = P - a; y = _dot(pa, ba); z = y - l2
        x2 = _dot(pa * l2 - ba * y[..., None], pa * l2 - ba * y[..., None]); y2 = y * y * l2; z2 = z * z * l2
        k = np.sign(rr) * rr * rr * x2
        d = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - r1
        d = np.where(np.sign(y) * a2 * y2 < k, np.sqrt(x2 + y2) * il2 - r1, d)
        d = np.where(np.sign(z) * a2 * z2 > k, np.sqrt(x2 + z2) * il2 - r2, d)
        return d
    return f

def round_box(c, b, r, R=None):
    c, b = V(*c), V(*b)
    def f(P):
        q = P - c
        if R is not None: q = q @ R
        q = np.abs(q) - b
        return _len(np.maximum(q, 0)) + np.minimum(q.max(-1), 0) - r
    return f

def tube(pts, radii, closed=False):
    """chain of round cones through control points (a limb, a tail, a groove)"""
    fs = [round_cone(pts[i], pts[i + 1], radii[i], radii[i + 1]) for i in range(len(pts) - 1)]
    return lambda P: np.minimum.reduce([f(P) for f in fs])

def plane(n, d):
    n = V(*n); n = n / np.linalg.norm(n)
    return lambda P: P @ n - d

# ------------------------------------------------------------------ operators
def smin(a, b, k):
    if k <= 0: return np.minimum(a, b)
    h = np.maximum(k - np.abs(a - b), 0.0) / k
    return np.minimum(a, b) - h * h * k * 0.25

def union(*fs, k=0.0):
    def f(P):
        d = fs[0](P)
        for g in fs[1:]: d = smin(d, g(P), k)
        return d
    return f

def subtract(a, b, k=0.0):
    """a minus b, smooth edge of radius ~k"""
    return lambda P: -smin(-a(P), b(P), k)

def intersect(a, b, k=0.0):
    return lambda P: -smin(-a(P), -b(P), k)

def shell(f, t):
    return lambda P: np.abs(f(P)) - t

def offset(f, d):
    return lambda P: f(P) - d

def displace(f, g):
    """add a displacement field g(P) (positive = push surface inward)"""
    return lambda P: f(P) + g(P)

def mirror_x(f):
    return lambda P: f(np.concatenate([np.abs(P[..., :1]), P[..., 1:]], -1))

def smoothstep(a, b, x):
    t = _clamp((x - a) / (b - a)); return t * t * (3 - 2 * t)

# ------------------------------------------------------------------ meshing
def evaluate(f, P, chunk=1 << 21):
    out = np.empty(len(P), np.float32)
    for i in range(0, len(P), chunk): out[i:i + chunk] = f(P[i:i + chunk])
    return out

def surface_nets(f, lo, hi, h, clamp=None):
    """Mesh the zero level set of f inside the box [lo, hi] with cell size h (naive surface nets: one vertex per
    sign-changing cell at the mean of its edge crossings, one quad per sign-changing grid edge), then pull the
    vertices onto the true surface with two Newton steps (clamp: limit each step to clamp * h, so a vertex never
    shoots off where the numerical gradient vanishes, e.g. on the crease of a cloth shell). Returns (V, F) with quads."""
    lo, hi = V(*lo), V(*hi)
    n = np.ceil((hi - lo) / h).astype(int) + 1
    ax = [lo[i] + np.arange(n[i]) * h for i in range(3)]
    G = np.stack(np.meshgrid(*ax, indexing='ij'), -1).reshape(-1, 3)
    F = evaluate(f, G).reshape(n)
    del G
    edge = min(F[0].min(), F[-1].min(), F[:, 0].min(), F[:, -1].min(), F[:, :, 0].min(), F[:, :, -1].min())
    if edge < 0: print(f'[sdf] WARNING: shape pokes out of its box {lo} .. {hi}: the mesh is cut open there', flush=True)
    off = [(i, j, k) for i in (0, 1) for j in (0, 1) for k in (0, 1)]
    C = [F[i:n[0] - 1 + i, j:n[1] - 1 + j, k:n[2] - 1 + k] for i, j, k in off]
    mn = np.minimum.reduce(C); mx = np.maximum.reduce(C)
    act = (mn < 0) & (mx >= 0)
    cid = np.full(act.shape, -1, np.int64); ia = np.nonzero(act); nv = len(ia[0]); cid[ia] = np.arange(nv)
    acc = np.zeros((nv, 3)); cnt = np.zeros(nv)
    base = np.stack(ia, -1).astype(np.float64)
    for a in range(8):
        for b in range(a + 1, 8):
            d = np.subtract(off[b], off[a])
            if np.abs(d).sum() != 1: continue  # cube edges only
            va, vb = C[a][ia], C[b][ia]
            m = (va < 0) != (vb < 0)
            t = va[m] / (va[m] - vb[m])
            acc[m] += base[m] + np.array(off[a]) + t[:, None] * d
            cnt[m] += 1
    Vx = lo + acc / np.maximum(cnt, 1)[:, None] * h
    quads = []
    for axis in range(3):
        sl0 = [slice(None)] * 3; sl1 = [slice(None)] * 3
        sl0[axis] = slice(0, n[axis] - 1); sl1[axis] = slice(1, n[axis])
        a, b = F[tuple(sl0)], F[tuple(sl1)]
        m = (a < 0) != (b < 0)
        o1, o2 = [i for i in range(3) if i != axis]
        # the four cells around a grid edge need the other two indices >= 1
        mm = np.zeros_like(m); inner = [slice(None)] * 3; inner[o1] = slice(1, n[o1] - 1); inner[o2] = slice(1, n[o2] - 1)
        mm[tuple(inner)] = m[tuple(inner)]
        e = np.stack(np.nonzero(mm), -1)
        if not len(e): continue
        def cell(d1, d2):
            c = e.copy(); c[:, o1] -= d1; c[:, o2] -= d2
            return cid[c[:, 0], c[:, 1], c[:, 2]]
        q = np.stack([cell(1, 1), cell(0, 1), cell(0, 0), cell(1, 0)], -1)
        flip = a[mm] < 0  # inside at the lower end: outward is +axis
        q[flip] = q[flip][:, ::-1]
        if axis == 1: q = q[:, ::-1]  # (o1, o2) = (x, z) is a left-handed pair for the y axis
        quads.append(q)
    Q = np.concatenate(quads)[:, ::-1]  # counter-clockwise seen from outside
    Q = Q[(Q >= 0).all(1)]
    Vx = project(f, Vx, h, clamp=clamp)
    return Vx, Q

def gradient(f, P, e):
    g = np.empty_like(P)
    for i in range(3):
        d = np.zeros(3); d[i] = e
        g[:, i] = (evaluate(f, P + d) - evaluate(f, P - d)) / (2 * e)
    return g

def project(f, P, h, steps=2, clamp=None):
    for _ in range(steps):
        d = evaluate(f, P); g = gradient(f, P, h * 0.25)
        step = (d / np.maximum(_dot(g, g), 1e-9))[:, None] * g
        if clamp is not None:
            n = _len(step); step = step * (np.minimum(n, clamp * h) / np.maximum(n, 1e-12))[:, None]
        P = P - step
    return P
