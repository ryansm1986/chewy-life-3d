"""Dust bunny shape definitions shared by build_dust-bunny.py and the quick checks in work/ (no bpy here).
Units: metres, front = -Y, ground z = 0."""
import math
import numpy as np
PI, TAU = math.pi, 2 * math.pi
def nz(v, axis=-1):
    return v / np.maximum(np.linalg.norm(v, axis=axis, keepdims=True), 1e-12)

# ------------------------------------------------------------------ the fur: big round puffs (measured on the sheet's views)
# (centre, radius); x > 0 entries are mirrored to -x
PUFFS = [
    ((0.0, -0.152, 0.366), (0.092, 0.072, 0.072)),   # fringe: a small soft forelock (round 2), kept above the eyes
    ((0.128, -0.022, 0.362), 0.118),                 # top side (the pair meet in a crease over the crown)
    ((0.0, 0.140, 0.338), 0.122),                    # top back
    ((0.214, -0.098, 0.262), 0.092),                 # upper flank (frames the eye)
    ((0.198, 0.072, 0.190), 0.126),                  # side (big)
    ((0.0, 0.152, 0.150), 0.135),                    # rear (the big one the side and back views show)
    ((0.168, 0.010, 0.082), 0.082),                  # low side
    ((0.182, -0.140, 0.118), 0.084),                 # cheek (round, separate)
    ((0.0, -0.150, 0.074), (0.092, 0.076, 0.062)),   # chin (under the face, between the cheeks)
    ((0.128, -0.140, 0.0315), (0.050, 0.062, 0.031)),# front paw
    ((0.128, 0.115, 0.0315), (0.052, 0.062, 0.031)), # back paw
]
CORE = (np.array([0.0, 0.020, 0.225]), np.array([0.150, 0.145, 0.135]))
def puff_list():
    out = [CORE]
    for c, r in PUFFS:
        c = np.array(c, float); r = np.broadcast_to(np.array(r, float), (3,)).copy()
        out.append((c, r))
        if c[0] > 1e-6: out.append((c * np.array([-1, 1, 1]), r))
    return out
K_SMIN = 0.016
def ell_sdf(P, c, r):
    q = (P - c) / r; k0 = np.linalg.norm(q, axis=1); k1 = np.linalg.norm(q / r, axis=1)
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)
def smin(a, b, k):
    h = np.clip(k - np.abs(a - b), 0, None) / k; return np.minimum(a, b) - h * h * k * 0.25
def fur_sdf(P, puffs, want_all=False):
    D = np.stack([ell_sdf(P, c, r) for c, r in puffs], 1)
    f = D[:, 0]
    for i in range(1, D.shape[1]): f = smin(f, D[:, i], K_SMIN)
    return (f, D) if want_all else f

# ------------------------------------------------------------------ the face: a muzzle ball, tilted up a little
FA, FB, FCz = 0.190, 0.200, 0.150           # half sizes x, depth, z (in the face's own frame)
FCEN = np.array([0.0, -0.070, 0.205])
TILT = math.radians(12)                     # the face looks up a little, toward the 45-deg game camera
_ct, _st = math.cos(TILT), math.sin(TILT)
def face_rot(L):
    L = np.atleast_2d(L); return np.stack([L[:, 0], L[:, 1] * _ct + L[:, 2] * _st, -L[:, 1] * _st + L[:, 2] * _ct], -1)
def face_unrot(Wv):
    Wv = np.atleast_2d(Wv); return np.stack([Wv[:, 0], Wv[:, 1] * _ct - Wv[:, 2] * _st, Wv[:, 1] * _st + Wv[:, 2] * _ct], -1)
def face_point(x, z):
    """front-view design coords (x, z) -> world point on the face ellipsoid (z measured in the face frame)"""
    u = (x / FA) ** 2 + ((z - FCEN[2]) / FCz) ** 2
    L = np.stack([x, -FB * np.sqrt(np.clip(1 - u, 0, 1)), z - FCEN[2]], -1)
    return FCEN + face_rot(L), L
def face_n_local(L):
    return nz(np.stack([L[:, 0] / FA ** 2, L[:, 1] / FB ** 2, L[:, 2] / FCz ** 2], -1))
def face_d(P):
    L = face_unrot(P - FCEN); R = np.array([FA, FB, FCz])
    q = L / R; k0 = np.linalg.norm(q, axis=1); k1 = np.linalg.norm(q / R, axis=1)
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)

EYE_X, EYE_Z, EYE_A, EYE_B = 0.100, 0.223, 0.051, 0.047
NOSE_C = (0.0, 0.187)
