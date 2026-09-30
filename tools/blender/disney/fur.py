# Groomed fur: hair strands grown on a mesh from per-point fields (numpy only; build.py turns them into Blender curves).
import numpy as np

def _norm(v): return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)

def sample_roots(Vx, Q, weight, per_m2, rng):
    """area-weighted random points on a quad mesh; weight (per vertex, 0..1) scales the local density"""
    T = np.concatenate([Q[:, [0, 1, 2]], Q[:, [0, 2, 3]]])
    A = 0.5 * np.linalg.norm(np.cross(Vx[T[:, 1]] - Vx[T[:, 0]], Vx[T[:, 2]] - Vx[T[:, 0]]), axis=1)
    w = A * weight[T].mean(1)
    n = int(w.sum() * per_m2)
    if n == 0: return np.zeros((0, 3)), T[:0], np.zeros((0, 3))
    tri = rng.choice(len(T), n, p=w / w.sum())
    r1, r2 = rng.random(n), rng.random(n)
    s = np.sqrt(r1)
    bary = np.stack([1 - s, s * (1 - r2), s * r2], -1)
    P = (Vx[T[tri]] * bary[..., None]).sum(1)
    return P, T[tri], bary

def grow(P, N, L, comb, rng, lift=0.3, pts=6, bend=0.55, frizz=0.12, clump=0.55, curl=None, curl_r=0.16, turns=1.5, flat=0.55):
    """Strands from roots P with normals N, lengths L and comb directions: each leaves the skin at `lift` toward the
    normal, curls over toward the comb direction and the surface, and its tip is pulled toward its clump's mean.
    curl (per strand 0..1, optional): a loose spiral round the strand's path (radius curl_r of its length, `turns`
    turns, flattened by `flat` toward the skin so it reads as waves and ringlets, not springs). Give curly strands more
    points (pts ~10)."""
    n = _norm(N)
    t = comb - n * (comb * n).sum(-1, keepdims=True); t = _norm(t)
    lift = np.broadcast_to(np.asarray(lift, float), L.shape)[:, None]
    d0 = _norm(n * lift + t * (1 - lift))
    s = np.linspace(0, 1, pts)[None, :, None]
    noise = rng.normal(size=(len(P), 3)) * frizz
    curve = (t * bend - n * 0.35 * bend + noise)[:, None, :]
    X = P[:, None, :] + L[:, None, None] * (d0[:, None, :] * s + curve * s * s)
    if curl is not None:
        c = np.broadcast_to(np.asarray(curl, float), L.shape)
        ph = rng.random(len(P)) * 2 * np.pi
        tw = turns * (0.8 + 0.4 * rng.random(len(P)))
        axis = _norm(X[:, -1] - P)
        b1 = _norm(np.cross(axis, n)); b2 = np.cross(axis, b1)   # b1 along the skin, b2 away from it
        ang = ph[:, None] + s[..., 0] * tw[:, None] * 2 * np.pi
        amp = (c * curl_r * L)[:, None] * np.sqrt(s[..., 0])     # the root sits on the skin, the spiral opens up
        X = X + amp[..., None] * (np.cos(ang)[..., None] * b1[:, None, :] + (1 - flat) * np.sin(ang)[..., None] * b2[:, None, :])
    # clumping: strands in the same cell (cell size ~ half their length) lean their tips together
    cs = np.clip(0.5 * L, 0.0025, 0.02)
    b = np.round(np.log2(cs) * 2).astype(np.int64)
    key = np.concatenate([b[:, None], np.floor(P / (2.0 ** (b / 2))[:, None]).astype(np.int64)], 1)
    _, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.ravel()
    cnt = np.bincount(inv).astype(float)
    tips = X[:, -1] - P
    mean = np.stack([np.bincount(inv, tips[:, i]) for i in range(3)], -1) / cnt[:, None]
    pull = (mean[inv] - tips) * clump
    X = X + pull[:, None, :] * (s * s)
    return X

def radii(n, pts, root=0.00042, tip=0.00005):
    s = np.linspace(0, 1, pts)
    return np.tile(root + (tip - root) * s ** 0.8, (n, 1))

def _frames(Vx, tri, bary):
    a, b, c = Vx[tri[:, 0]], Vx[tri[:, 1]], Vx[tri[:, 2]]
    t = _norm(b - a); n = _norm(np.cross(b - a, c - a)); bt = np.cross(n, t)
    root = a * bary[:, :1] + b * bary[:, 1:2] + c * bary[:, 2:]
    return root, np.stack([t, bt, n], -1)  # columns: tangent, bitangent, normal

def deform(V0, V1, tri, bary, X):
    """carry strands grown on the rest mesh V0 onto the posed mesh V1: each strand keeps its shape in the frame of
    the triangle it grows from (what Blender's Deform Curves on Surface does, without the UV bookkeeping)"""
    r0, F0 = _frames(V0, tri, bary)
    r1, F1 = _frames(V1, tri, bary)
    local = np.einsum('nji,npj->npi', F0, X - r0[:, None])
    return r1[:, None] + np.einsum('nij,npj->npi', F1, local)
