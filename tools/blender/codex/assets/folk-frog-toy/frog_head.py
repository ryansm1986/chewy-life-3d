"""The frog head implicit (pure numpy), shared by build_folk-frog-toy.py and scratch/fit_head.py.
Head-local units: W = the head width at the jowls; x lateral (+ = his left), y depth (+ = back) from the head centre, z above the chin.
The skull is Kero's superquadric (the jowls widest at ZC, a broad low snout swelling MUZ, the forehead set back between the
domes), the two eye domes forward-leaning superellipsoids smooth-unioned in (one surface, a fillet, no crease)."""
import math
import numpy as np

def clamp(x): return np.clip(x, 0, 1)
def smooth(a, b, x):
    t = clamp((np.asarray(x, dtype=float) - a) / (b - a)); return t * t * (3 - 2 * t)
def smin(a, b, k):
    h = np.clip(.5 + .5 * (b - a) / k, 0, 1); return b * (1 - h) + a * h - k * h * (1 - h)
def sell(q, c, r, p):
    r = np.asarray(r, float); p = np.asarray(p, float); dq = q - np.asarray(c, float)
    a = np.abs(dq[..., 0]) / r[0] + 1e-12; b = np.abs(dq[..., 1]) / r[1] + 1e-12; c_ = np.abs(dq[..., 2]) / r[2] + 1e-12
    F = a ** p[0] + b ** p[1] + c_ ** p[2]; pm = (p[0] + p[1] + p[2]) / 3
    g = np.sqrt((p[0] * a ** (p[0] - 1) / r[0]) ** 2 + (p[1] * b ** (p[1] - 1) / r[1]) ** 2 + (p[2] * c_ ** (p[2] - 1) / r[2]) ** 2)
    return (F ** (1 / pm) - 1) / np.maximum((1 / pm) * F ** (1 / pm - 1) * g, 1e-9)

KEYS = ['A', 'BF', 'BB', 'ZC', 'HT', 'nA_t', 'nA_b', 'nB_t', 'nB_b', 'nBb_t', 'nBb_b',
        'm', 'mz', 'wz', 'wx', 'brow', 'bw', 'dx', 'dy', 'dz', 'rx', 'ry', 'rz', 'tilt', 'k']

def make_head(P):
    """P: dict of KEYS -> head_local(q), skull_local(q), dome_local(q)"""
    P = dict(P)
    def skull_local(q):
        x, y, z = q[..., 0], q[..., 1], q[..., 2]
        sw = 1 + P['m'] * np.exp(-((z - P['mz']) / P['wz']) ** 2) * np.exp(-(x / P['wx']) ** 2)
        sw = sw * (1 - P['brow'] * smooth(.30, .62, z) * np.exp(-(x / P['bw']) ** 2))
        front = y < 0
        a0 = P['A'] * np.ones_like(x); b0 = np.where(front, P['BF'] * sw, P['BB'])
        tx = np.abs(x / a0) ** 2; ty = np.abs(y / b0) ** 2
        s0 = np.sqrt(tx + ty); wx = tx / np.maximum(tx + ty, 1e-12)
        top = z >= P['ZC']
        m = np.where(top, wx * P['nA_t'] + (1 - wx) * np.where(front, P['nB_t'], P['nBb_t']),
                          wx * P['nA_b'] + (1 - wx) * np.where(front, P['nB_b'], P['nBb_b']))
        H = np.where(top, P['HT'], P['ZC']); vz = np.abs(z - P['ZC']) / H
        Pm = s0 ** m + vz ** m; F = Pm ** (1 / m) - 1
        r = np.sqrt(x * x + y * y); R0 = np.where(s0 > 1e-6, r / np.maximum(s0, 1e-6), (a0 ** -4 + b0 ** -4) ** -.25)
        wt = vz ** m / np.maximum(Pm, 1e-12)
        return F * (wt * H + (1 - wt) * R0)
    t = math.radians(P['tilt']); c, s = math.cos(t), math.sin(t)
    def dome_local(q):
        out = None
        for sx in (-1, 1):
            dq = q - np.array([sx * P['dx'], P['dy'], P['dz']])
            dy = c * dq[..., 1] + s * dq[..., 2]; dz = -s * dq[..., 1] + c * dq[..., 2]
            d = sell(np.stack([dq[..., 0], dy, dz], -1), [0, 0, 0], [P['rx'], P['ry'], P['rz']], (2., 2., 2.))
            out = d if out is None else np.minimum(out, d)
        return out
    def head_local(q): return smin(skull_local(q), dome_local(q), P['k'])
    return head_local, skull_local, dome_local

# ---------------------------------------------------------------- silhouettes (for the fit and the measure tables)
def _march(f, O, D, t0, t1, steps=90, it=22):
    """first inside crossing along O + t D from t0 toward t1 (O, D: (n, 3)); nan if none"""
    ts = np.linspace(t0, t1, steps); n = len(O)
    P = O[:, None, :] + D[:, None, :] * ts[None, :, None]
    ins = (f(P.reshape(-1, 3)) < 0).reshape(n, steps); i = np.argmax(ins, 1); ok = ins[np.arange(n), i]
    lo = ts[np.maximum(i - 1, 0)]; hi = ts[i]
    for _ in range(it):
        m = (lo + hi) / 2; inn = f(O + D * m[:, None]) < 0
        hi = np.where(inn, m, hi); lo = np.where(inn, lo, m)
    return np.where(ok & (i > 0), (lo + hi) / 2, np.nan)
def front_halfwidth(f, zs, ny=41):
    ys = np.linspace(-.6, .6, ny); Z, Y = np.meshgrid(zs, ys, indexing='ij')
    O = np.stack([np.full(Z.size, .75), Y.ravel(), Z.ravel()], -1); D = np.tile([-1., 0, 0], (Z.size, 1))
    t = _march(f, O, D, 0, .75).reshape(Z.shape); return np.nanmax(.75 - t, 1)
def top_outline(f, xs, ny=41):
    ys = np.linspace(-.6, .6, ny); X, Y = np.meshgrid(xs, ys, indexing='ij')
    O = np.stack([X.ravel(), Y.ravel(), np.full(X.size, 1.05)], -1); D = np.tile([0, 0, -1.], (X.size, 1))
    t = _march(f, O, D, 0, 1.1).reshape(X.shape); return np.nanmax(1.05 - t, 1)
def side_profile(f, zs, nx=26):
    xs = np.linspace(0, .55, nx); Z, X = np.meshgrid(zs, xs, indexing='ij')
    O = np.stack([X.ravel(), np.full(Z.size, -.8), Z.ravel()], -1); D = np.tile([0, 1., 0], (Z.size, 1))
    tf = _march(f, O, D, 0, 1.6).reshape(Z.shape)
    O2 = O.copy(); O2[:, 1] = .8; tb = _march(f, O2, -D, 0, 1.6).reshape(Z.shape)
    return np.nanmin(-.8 + tf, 1), np.nanmax(.8 - tb, 1)
