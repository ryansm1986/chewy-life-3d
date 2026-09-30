# Disney-style Moka: a Boykin Spaniel mage, sculpted with the same signed-distance kit as Chewy (see chewy.py, sdf.py).
# Units: metres, Z up, facing -Y, character's left = +X. She shares Chewy's skeleton (same body landmarks, so the
# game's Animator drives both alike) but not his look: a rounder spaniel head with a shorter, broader muzzle, big golden
# eyes with lashes, long pendant wavy ears (a base and a tip bone each), a curly coat and a stubby tail; a lavender
# knee-length robe with bell sleeves and star embroidery, a seafoam capelet (hood down) with gold trim and a star
# clasp, a violet sash with a rubber-duck charm, and a floppy seafoam wizard hat with a paw-print patch and a bent tip.
# Her staff (driftwood crook, glowing orb, ribbon, duck charm) is built for the film renders only; the game makes its
# own staffs (src/actors/heroGear.js).
import numpy as np
from sdf import (V, rot, smin, sphere, ellipsoid, capsule, round_cone, round_box, tube, union, subtract, intersect,
                 shell, mirror_x, smoothstep, _len, _clamp)
from chewy import (scaled, moved, _leaf2d, _slab, torus_y, _axis_t, strip, trace, _lin, _mix, flat, H, HEAD_OFS,
                   HEAD_SCALE, to_world, to_head)

def _n(v):
    v = np.asarray(v, float); return v / np.linalg.norm(v)

def _m(p, s):
    p = np.array(p, float).copy(); p[..., 0] *= s; return p

def smax(a, b, k):
    return -smin(-a, -b, k)

def sweep(pts, radii, radial=10, closed=False, ref=None):
    """a tube mesh (vertices, quads) along points: rings of `radial` vertices (even), parallel-transported frames
    (closed loops: frames from a fixed reference axis, so the seam never twists), rounded quad caps on open ends.
    Much faster than meshing a long thin SDF tube on a fine grid (trims, lashes, the staff)."""
    P = np.asarray(pts, float); r = np.broadcast_to(np.asarray(radii, float), (len(P),)).copy()
    if not closed:  # round the ends: two shrinking rings past each end
        t0 = _n(P[0] - P[1]); t1 = _n(P[-1] - P[-2])
        P = np.concatenate([[P[0] + t0 * r[0] * 0.8, P[0] + t0 * r[0] * 0.45], P, [P[-1] + t1 * r[-1] * 0.45, P[-1] + t1 * r[-1] * 0.8]])
        r = np.concatenate([[r[0] * 0.45, r[0] * 0.85], r, [r[-1] * 0.85, r[-1] * 0.45]])
    n = len(P)
    T = (np.roll(P, -1, 0) - np.roll(P, 1, 0)) if closed else np.gradient(P, axis=0)
    T = T / np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-12)
    if closed:
        ref = _n(ref if ref is not None else np.linalg.svd(P - P.mean(0))[2][2])
        N = ref[None] - T * (T @ ref)[:, None]
        N = N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
    else:
        a = V(0, 0, 1) if abs(T[0][2]) < 0.9 else V(1, 0, 0)
        N = [_n(np.cross(T[0], a))]
        for i in range(1, n):
            v = N[-1] - T[i] * (N[-1] @ T[i]); N.append(_n(v) if np.linalg.norm(v) > 1e-9 else N[-1])
        N = np.array(N)
    B = np.cross(T, N)
    ang = np.linspace(0, 2 * np.pi, radial, endpoint=False)
    ring = P[:, None, :] + r[:, None, None] * (np.cos(ang)[None, :, None] * N[:, None, :] + np.sin(ang)[None, :, None] * B[:, None, :])
    Vx = ring.reshape(-1, 3)
    idx = np.arange(n * radial).reshape(n, radial)
    Q = []
    for i in range(n if closed else n - 1):
        a_, b_ = idx[i], idx[(i + 1) % n]
        Q.append(np.stack([a_, np.roll(a_, -1), np.roll(b_, -1), b_], 1))
    if not closed:
        for e in (idx[0], idx[-1][::-1]):
            Q.append(np.array([[e[0], e[2 * k + 1], e[2 * k + 2], e[2 * k + 3]] for k in range((radial - 2) // 2)]))
    return Vx, np.concatenate(Q)

def join_meshes(meshes):
    Vs, Qs, off = [], [], 0
    for Vx, Q in meshes:
        Vs.append(Vx); Qs.append(Q + off); off += len(Vx)
    return np.concatenate(Vs), np.concatenate(Qs)

# ------------------------------------------------------------------ head (sculpted round H like Chewy's, same scale)
EYE_R = 0.0465
EYE = V(0.0595, -0.087, 1.001)   # +X eye centre
EYE_ROT = rot(0.05, 0, 0.23)     # eye space: -y looks out (a touch more frontal than Chewy: a softer, sweeter gaze)

def eye_opening(P):
    """<0 inside the window between the lids: rounder and taller than Chewy's almond (big, bright, bookish eyes)"""
    q = (P - EYE) @ EYE_ROT
    x, y, z = q[:, 0], q[:, 1], q[:, 2]
    upper = z - (0.78 * EYE_R + 0.03 * x - 0.52 * x * x / EYE_R)   # the upper lid rests above the iris: bright, alert
    lower = -(z + 0.6 * EYE_R - 0.03 * x - 0.42 * x * x / EYE_R)   # (the lower lid sits a touch higher: the blink still closes)
    front = -y - 0.15 * EYE_R
    return -np.minimum(np.minimum(-upper, -lower), front)

def eye_lids():
    lid = shell(sphere(EYE, EYE_R + 0.0065), 0.0048)
    return lambda P: -smin(-lid(P), eye_opening(P), 0.006)

NOSE_C0 = V(0, -0.207, 0.966)
NOSE = union(ellipsoid(NOSE_C0, (0.031, 0.021, 0.0185), rot(-0.25, 0, 0)), ellipsoid((0, -0.209, 0.952), (0.0185, 0.0165, 0.013)), k=0.014)
LIP_X, LIP_Z = [0, 0.016, 0.029, 0.039, 0.045], [0.918, 0.92, 0.925, 0.933, 0.944]   # a short smile, upturned at the corners
def lip_z(ax):
    return np.interp(ax, LIP_X, LIP_Z)
MOUTH_GAP = 0.0017
CAVITY = ellipsoid((0, -0.172, 0.92), (0.03, 0.036, 0.012))

def mouth_slit(P):
    ax, y, z = np.abs(P[:, 0]), P[:, 1], P[:, 2]
    d = np.abs(z - lip_z(ax)) - MOUTH_GAP * (1 - 0.35 * smoothstep(0.036, 0.046, ax))
    return -smin(-np.maximum(d, y + 0.15), -(ax - 0.047), 0.004)   # the parting stops at the corners (no long grin)

def mouth_space(P):
    return np.minimum(mouth_slit(P), CAVITY(P))

TONGUE = ellipsoid((0, -0.176, 0.9105), (0.018, 0.025, 0.0034))
JAW_PIVOT = V(0, -0.045, 0.93)
LIP_CORNER = V(0.044, -0.158, 0.943)
BROW = V(0.06, -0.094, 1.054)
FACE_W = dict(corner_x=(0.036, 0.054), jaw_y=(-0.09, -0.155), jaw_z=(0.85, 0.885), corner_r=0.016, brow_r=0.024)

# ---- pendant ears: a long, thick, wavy leaf hanging from the side of the skull (set a little above the eyes), draping
# in toward the cheek and ending around the jaw in curly locks
EAR_BASE = V(0.104, 0.004, 1.052)
_U = _n((0.3, 0.05, -1.0))                              # down the ear: out and back a little
_W = _n((1.0, -0.08, 0.2)); _W = _n(_W - _U * (_W @ _U))  # out of the ear's outer face
_Vx = np.cross(_W, _U)                                  # across the ear (toward the back)
EAR_R = np.stack([_Vx, -_W, _U], 1)                     # rig.ear_frame convention: columns (across, -outer, along)
EAR_UF, EAR_TH = 0.05, 0.0                              # (Chewy's fold landmarks; unused by Moka's own ear hooks)
EAR_L, EAR_R0, EAR_R1 = 0.138, 0.033, 0.058              # leaf: narrow at the set, widest and round at the bottom
EAR_FOLD = 0.055                                        # the tip bone starts here (the lower two thirds swing)

def ear_local(P):
    q = (P - EAR_BASE) @ EAR_R
    return q[:, 2], q[:, 0], -q[:, 1]   # u (down the ear), v (across), w (outward)

def _ear_centre(u):
    """the ear's mid-surface offset (outward) at u: hugs the skull at the top, drapes in toward the cheek below"""
    uu = np.maximum(u, 0)
    return 0.006 - 0.55 * uu * uu + 0.9 * uu ** 3

def ear_sdf(P):
    u, v, w = ear_local(P)
    t = _clamp(u / (EAR_L + EAR_R1))
    d2 = _leaf2d(u, v, EAR_R0, EAR_R1, EAR_L)
    phi = np.arctan2(v, u - 0.62 * EAR_L)
    d2 = d2 + 0.0066 * np.cos(phi * 8 + 0.6) * smoothstep(0.35 * EAR_L, 0.95 * EAR_L, u)          # curly locks round the hem
    wave = 0.003 * np.sin(u * 110 + 2.6 * np.sin(v * 52)) * smoothstep(0.015, 0.05, u)             # marcel waves across
    lumps = 0.0014 * np.sin(u * 95 + v * 70) * np.sin(v * 120 - u * 45)                             # curl clumps
    th = 0.0058 + 0.0098 * t * t + lumps
    return _slab(d2, w - _ear_centre(u) + wave + 0.22 * v * v / EAR_R1, th, 0.006)

def ear_weights(P):
    """(ear, tip): the whole pendant ear below the set follows ear_*, its lower two thirds earTip_*"""
    u, v, w = ear_local(P)
    ear = smoothstep(0.007, 0.0, ear_sdf(P)) * smoothstep(-0.018, 0.012, u)
    tip = ear * smoothstep(EAR_FOLD - 0.015, EAR_FOLD + 0.03, u)
    return ear, tip

def ear_point(u, s=1):
    """sculpt-space point on the ear's mid-surface, u down the ear"""
    p = EAR_BASE + _U * u + _W * _ear_centre(np.array([u]))[0]
    return _m(p, s)

def ear_bones(s):
    base = to_world(_m(EAR_BASE, s)); fold = to_world(ear_point(EAR_FOLD, s)); end = to_world(ear_point(EAR_L + 0.03, s))
    return base, fold, end, _m(_W, s)

def ear_leaf():
    return ear_sdf

def ear_plates(P):  # (compatibility with rig.py's default path; Moka's hooks replace it)
    d = ear_sdf(P); return d, d + 1.0

def head_sdf():
    cranium = ellipsoid((0, 0.016, 1.013), (0.122, 0.12, 0.124))   # round, domed spaniel skull
    face = ellipsoid((0, -0.054, 0.99), (0.086, 0.08, 0.086))
    cheek = ellipsoid((0.062, -0.07, 0.936), (0.046, 0.042, 0.04))  # full, soft cheeks
    orbit = ellipsoid((0.055, -0.07, 1.001), (0.052, 0.045, 0.049))
    brow = ellipsoid((0.06, -0.094, 1.054), (0.039, 0.02, 0.011), rot(0, 0.22, 0.3))
    bridge = round_cone((0, -0.08, 1.006), (0, -0.188, 0.969), 0.037, 0.026)   # a clear stop, a short bridge
    muzzle = scaled(round_cone((0, -0.085, 0.953), (0, -0.172, 0.944), 0.056, 0.04), (0, -0.13, 0.95), (1.05, 1.0, 0.93))
    dome = ellipsoid((0, -0.056, 1.046), (0.078, 0.06, 0.056))                       # a domed forehead over a clear stop
    flew = ellipsoid((0.026, -0.168, 0.925), (0.03, 0.04, 0.024), rot(0.12, 0, 0.12))   # soft spaniel lips
    chin = ellipsoid((0, -0.131, 0.905), (0.027, 0.043, 0.018), rot(0.15, 0, 0))
    socket = sphere(EYE, EYE_R + 0.003)
    nostril = tube([(0.007, -0.227, 0.96), (0.016, -0.2245, 0.961), (0.024, -0.2145, 0.955)], [0.0032, 0.0036, 0.0021])
    philtrum = capsule((0, -0.225, 0.948), (0, -0.212, 0.926), 0.0022)
    s = union(cranium, face, k=0.03)
    s = union(s, dome, k=0.04)
    s = union(s, mirror_x(cheek), k=0.065)
    s = union(s, mirror_x(orbit), k=0.04)
    s = union(s, bridge, muzzle, k=0.045)
    s = union(s, mirror_x(flew), chin, k=0.028)
    s = subtract(s, mirror_x(socket), k=0.008)
    s = union(s, mirror_x(eye_lids()), k=0.005)
    s = union(s, NOSE, k=0.004)
    s = subtract(s, mirror_x(nostril), k=0.002)
    s = subtract(s, philtrum, k=0.004)
    s = subtract(s, mouth_space, k=0.002)
    s = union(s, mirror_x(ear_sdf), k=0.012)
    return s

def lashes_mesh():
    """three curled lashes at the outer end of each upper lid (a girl's eyes at the game camera); world space"""
    out = []
    for xr, ln in ((0.5, 0.015), (0.7, 0.019), (0.88, 0.017)):
        x = xr * EYE_R
        z = 0.78 * EYE_R + 0.03 * x - 0.52 * x * x / EYE_R         # on the upper lid rim
        rr = EYE_R + 0.0103
        y = -np.sqrt(max(rr * rr - x * x - z * z, 1e-6))
        a = V(x, y, z)
        out_d = _n(V(0.55 + 0.5 * xr, -0.35, 0.75))                  # out, forward and up, curling up
        b = a + out_d * ln * 0.5; c = b + _n(out_d + V(0.3, 0.1, 0.9)) * ln * 0.3; d = c + _n(out_d + V(0.2, 0.3, 1.6)) * ln * 0.25
        for s in (1, -1):
            pts = [to_world(_m(EYE + EYE_ROT @ p, s)) for p in (a, b, c, d)]
            out.append(sweep(pts, [0.0024, 0.002, 0.0013, 0.0006], radial=6))
    return join_meshes(out)

# ---- the floppy wizard hat (sculpt space; it rides the head bone)
HAT_O = V(0.0, 0.02, 1.088)
HAT_R = rot(-0.27, 0.09, 0.05)  # tipped back, a little to her left
HAT_S = 0.88                    # (the design's numbers are for a hat a size bigger)
def hat_local(P):
    return ((P - HAT_O) @ HAT_R) / HAT_S

_HAT_PTS = [V(0, 0, -0.012), V(0, 0.003, 0.058), V(0.002, 0.012, 0.112), V(0.008, 0.03, 0.158), V(0.018, 0.062, 0.186),
            V(0.03, 0.097, 0.184), V(0.04, 0.12, 0.163)]
_HAT_RAD = [0.107, 0.086, 0.062, 0.041, 0.027, 0.018, 0.011]

def hat_crown(q):
    fs = [round_cone(_HAT_PTS[i], _HAT_PTS[i + 1], _HAT_RAD[i], _HAT_RAD[i + 1]) for i in range(len(_HAT_PTS) - 1)]
    d = fs[0](q)
    for f in fs[1:]: d = smin(d, f(q), 0.012)
    # a few soft creases where the tip bends over
    ang = np.arctan2(q[:, 0], -q[:, 1])
    d = d + 0.0016 * np.sin(ang * 5 + q[:, 2] * 60) * smoothstep(0.1, 0.15, q[:, 2])
    return d

def hat_brim(q):
    x, y, z = q[:, 0], q[:, 1], q[:, 2]
    r = np.sqrt(x * x + y * y); ang = np.arctan2(x, -y)
    R_out = 0.188 + 0.007 * np.sin(ang * 3 + 0.6) + 0.004 * np.sin(ang * 7 + 2.0)
    zc = -0.006 - 0.22 * np.maximum(r - 0.1, 0) + 0.009 * np.sin(ang * 2 + 1.1) * smoothstep(0.12, 0.19, r)  # floppy
    return _slab(r - R_out, z - zc, 0.0042, 0.003)

def hat_band(q):
    band = hat_crown(q) - 0.0035
    return intersect(lambda Q: band, lambda Q: np.abs(Q[:, 2] - 0.017) - 0.013, k=0.003)(q)

PATCH_C = V(0.0, -0.082, 0.07)   # (hat space) the paw-print patch on the front of the crown
def hat_sdf():
    def f(P):
        q = hat_local(P)
        d = smin(hat_crown(q), hat_brim(q), 0.014)
        d = np.minimum(d, hat_band(q))
        pd = _len((q - PATCH_C) * V(1, 0.35, 1)) - 0.027          # the sewn-on patch stands off the felt a hair
        d = d - 0.0014 * smoothstep(0.002, -0.002, pd) * smoothstep(-0.02, 0.0, -q[:, 1] - 0.05)
        return d * HAT_S
    return f

HAT = hat_sdf()

# ------------------------------------------------------------------ body (Chewy's skeleton, a slimmer build)
NECK = capsule((0, 0.012, 0.56), (0, -0.01, 0.68), 0.052)
CHEST = ellipsoid((0, 0.0, 0.53), (0.11, 0.086, 0.1))
BELLY = ellipsoid((0, -0.004, 0.4), (0.1, 0.084, 0.09))
ARM_P, ARM_R = [V(0.106, 0.0, 0.59), V(0.15, 0.014, 0.47), V(0.172, -0.008, 0.37)], [0.037, 0.031, 0.027]
LEG_P, LEG_R = [(0.062, 0.0, 0.35), (0.067, -0.012, 0.2), (0.071, 0.004, 0.08)], [0.052, 0.037, 0.03]
TORSO = union(union(CHEST, BELLY, k=0.08), NECK, k=0.045)
TAIL_P = [V(0, 0.08, 0.36), V(0, 0.112, 0.366), V(0, 0.137, 0.384), V(0, 0.153, 0.408), V(0, 0.159, 0.432)]
TAIL_RAD = [0.03, 0.034, 0.032, 0.026, 0.014]
BODY_BONES = {'hips': 0.1, 'spine': 0.1, 'chest': 0.1, 'neck': 0.048, 'head': 0.07,
              'upperarm': 0.037, 'forearm': 0.031, 'hand': 0.03, 'thigh': 0.052, 'shin': 0.037, 'foot': 0.038,
              'tail1': 0.03, 'tail2': 0.034, 'tail3': 0.03, 'tail4': 0.018}

def body_sdf():
    arm = tube(ARM_P, ARM_R)
    palm = ellipsoid((0.178, -0.02, 0.33), (0.031, 0.03, 0.038), rot(0, 0.12, 0))
    fingers = union(*[round_cone((0.174 + dx * 0.9, -0.033 + dy * 0.9, 0.308), (0.176 + dx * 1.04, -0.038 + dy * 1.12, 0.28), 0.0125, 0.0105)
                      for dx, dy in ((-0.021, -0.004), (-0.007, -0.012), (0.008, -0.012), (0.022, -0.004))], k=0.004)
    thumb = round_cone((0.163, -0.044, 0.338), (0.155, -0.058, 0.316), 0.0115, 0.0094)
    hand = union(palm, fingers, thumb, k=0.01)
    leg = tube(LEG_P, LEG_R)
    foot = ellipsoid((0.073, -0.028, 0.034), (0.044, 0.07, 0.034))
    toes = union(*[ellipsoid((0.073 + dx, -0.089 + abs(dx) * 0.4, 0.021), (0.0145, 0.0185, 0.0195)) for dx in (-0.027, -0.009, 0.009, 0.027)], k=0.004)
    paw = union(foot, toes, k=0.012)
    tail = tube(TAIL_P, TAIL_RAD)
    s = union(TORSO, mirror_x(arm), k=0.035)
    s = union(s, mirror_x(hand), k=0.018)
    s = union(s, mirror_x(leg), k=0.05)
    s = union(s, mirror_x(paw), k=0.025)
    s = union(s, tail, k=0.03)
    return s

# ------------------------------------------------------------------ costume
TRUNK = union(union(CHEST, BELLY, k=0.08), ellipsoid((0, 0.004, 0.36), (0.12, 0.1, 0.086)), k=0.05)
SLEEVE_END = 0.68   # the bell sleeve ends this far down the forearm
SLEEVE_R = (0.04, 0.049, 0.06)   # at the shoulder, the elbow and the open end
def _sleeve_axis():
    e = ARM_P[1] + (ARM_P[2] - ARM_P[1]) * SLEEVE_END
    return ARM_P[0], ARM_P[1], e

def sleeve_core():
    a, b, e = _sleeve_axis()
    r0, r1, r2 = SLEEVE_R
    return mirror_x(union(round_cone(a, b, r0, r1), round_cone(b, e + (e - b) * 0.08, r1, r2 + (r2 - r1) * 0.08), k=0.02))

def sleeve_mask(P):
    """robe points that belong to a sleeve: round the sleeve core (not the bodice beside it), past the shoulder root"""
    a, b, e = _sleeve_axis()
    Q = np.concatenate([np.abs(P[:, :1]), P[:, 1:]], -1)
    along = _axis_t(Q, a, b)
    return (sleeve_core()(P) < 0.012) & (sleeve_core()(P) < TRUNK(P) - 0.02) & ((along > 0.22) | (Q[:, 2] < a[2] - 0.05)) & (P[:, 2] > 0.36)

def skirt_core(P):
    """an A-line cone round the hips and legs (the robe hangs from the waist to just below the knee)"""
    z = P[:, 2]
    t = _clamp((0.42 - z) / (0.42 - 0.17))
    ang = np.arctan2(P[:, 0], -P[:, 1])
    rx = 0.1 + 0.056 * t ** 0.8 + 0.0055 * np.sin(ang * 9 + 0.8) * t        # flared folds (godets) opening to the hem
    ry = 0.082 + 0.046 * t ** 0.8 + 0.0055 * np.sin(ang * 9 + 0.8) * t
    x, y = P[:, 0], P[:, 1] - 0.006
    k = np.sqrt((x / rx) ** 2 + (y / ry) ** 2)
    d = (k - 1) * np.minimum(rx, ry)
    return np.maximum(d, z - 0.44)

HEM_Z = 0.192
def robe_sdf():
    core = union(TRUNK, skirt_core, k=0.03)
    def f(P):
        z = P[:, 2]; Pm = np.abs(P[:, 0]); y = P[:, 1]
        Q = np.concatenate([Pm[:, None], P[:, 1:]], -1)
        loose = 0.019 - 0.007 * smoothstep(0.43, 0.41, z) * smoothstep(0.36, 0.385, z) - 0.011 * smoothstep(0.57, 0.64, z)  # cinched under the sash
        front = smoothstep(-0.04, -0.08, y)
        folds = 0.0017 * np.sin((Pm * 0.9 - (z - 0.43)) * 70) * front * smoothstep(0.43, 0.46, z) * smoothstep(0.58, 0.53, z) \
            * smoothstep(0.015, 0.035, Pm) * smoothstep(0.12, 0.09, Pm)
        c = core(P) + folds
        body_cloth = np.maximum(c - loose - 0.0065, -(c - loose))
        # the kimono overlap: her right panel over the left, a step running from the neck down to the sash
        under = 0.0015 * front * smoothstep(0.003, -0.003, P[:, 0] - (-0.006 - 0.3 * (0.6 - z))) * smoothstep(0.62, 0.6, z) * smoothstep(0.41, 0.43, z)
        cloth = body_cloth + under
        # openings: neckline, hem (a soft wave). The sleeves are their own part (sleeves_sdf): meshed with the bodice
        # as one surface, the whole sleeve-bodice junction stretched into a bat wing whenever an arm went up.
        top = z - (0.648 - 0.022 * smoothstep(-0.02, -0.09, y))
        hem = HEM_Z + 0.004 * np.sin(np.arctan2(P[:, 0], -P[:, 1]) * 9 + 0.8) - z
        return np.maximum.reduce([cloth, top, hem])
    return f

def sleeves_sdf():
    """bell sleeves: a shell round the arm from the shoulder, flaring past the elbow, open at the end"""
    sleeves = sleeve_core()
    a, b, e = _sleeve_axis()
    def f(P):
        Q = np.concatenate([np.abs(P[:, :1]), P[:, 1:]], -1)
        sc = sleeves(P)
        t = _axis_t(Q, b, e)
        sl_fold = 0.0024 * np.sin(np.arctan2(Q[:, 1] - b[1], Q[:, 0] - b[0]) * 7 + t * 5) * smoothstep(-0.2, 0.5, t)  # soft drape folds
        sl = np.maximum(sc + sl_fold - 0.0055, -(sc + sl_fold))
        return np.maximum(sl, t - 1.0)                                    # open cuff
    return f

def star2d(px, py, r, rf=0.45):
    """IQ's 5-point star (point up), r outer radius, rf inner ratio"""
    k1 = V(0.809016994375, -0.587785252292); k2 = V(-k1[0], k1[1])
    p = np.stack([np.abs(px), py], -1)
    p = p - 2.0 * np.maximum(p @ k1, 0)[:, None] * k1
    p = p - 2.0 * np.maximum(p @ k2, 0)[:, None] * k2
    p[:, 0] = np.abs(p[:, 0]); p[:, 1] = p[:, 1] - r
    ba = rf * V(-k1[1], k1[0]) - V(0, 1)
    h = np.clip((p @ ba) / (ba @ ba), 0, r)
    q = p - ba[None] * h[:, None]
    return _len(q) * np.sign(p[:, 1] * ba[0] - p[:, 0] * ba[1])

CAPE_Z = 0.495
def cape_core():
    a, b, e = _sleeve_axis()
    up = union(ellipsoid((0, 0.0, 0.535), (0.112, 0.088, 0.103)), capsule((0, 0.012, 0.56), (0, -0.005, 0.66), 0.05), k=0.05)
    arms = mirror_x(capsule(a + V(-0.008, 0, 0.01), a + (b - a) * 0.75, 0.063))   # room for the sleeve underneath
    return union(lambda P: up(P) - 0.04 + 0.015 * smoothstep(0.6, 0.665, P[:, 2]), arms, k=0.06)   # the cowl hugs the neck

def _cape_hem(ang):
    return CAPE_Z + 0.022 * np.cos(ang) + 0.005 * np.cos(ang * 6)   # longer at the back, gentle scallops

def _cape_open(z):
    return 0.006 + 0.62 * np.maximum(0.632 - z, 0)                    # the inverted V under the clasp

def capelet_sdf():
    core = cape_core()
    def f(P):
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        ang = np.arctan2(x, -y)
        c = core(P) + 0.0014 * np.sin(ang * 13 + z * 20) * smoothstep(0.58, 0.52, z)   # soft drape folds
        cloth = np.maximum(c - 0.0058, -c)
        top = z - (0.684 - 0.036 * smoothstep(-0.02, -0.09, y))   # a cowl collar, lower at the front
        hem = _cape_hem(ang) - z
        opening = np.minimum(_cape_open(z) - np.abs(x), -y - 0.02)
        return -smin(-np.maximum.reduce([cloth, top, hem]), -opening, 0.004)
    # the hood, down: a soft pouch lying on the upper back, rolled open at the neck
    pouch = union(ellipsoid((0, 0.118, 0.575), (0.078, 0.04, 0.066)), round_cone((0, 0.12, 0.57), (0, 0.142, 0.49), 0.046, 0.014), k=0.03)
    roll = tube(HOOD_ROLL, [0.018] * len(HOOD_ROLL))
    return union(f, pouch, roll, k=0.012)

def _ring(rx, ry, z_front, z_back, angs):
    return [tuple(V(rx * np.sin(a), 0.004 - ry * np.cos(a), z_back + (z_front - z_back) * (0.5 + 0.5 * np.cos(a)))) for a in angs]
HOOD_ROLL = _ring(0.1, 0.097, 0.664, 0.66, np.linspace(-1.55, 1.55, 17) + np.pi)   # round the back only

def _cape_outer(P):
    return cape_core()(P) - 0.0058

def trim_mesh():
    """gold piping (swept tubes): the capelet's hem and front edges, the sleeve cuffs, the robe's hem; the star clasp"""
    import sdf as _sdf
    core = cape_core()
    outer = lambda P: core(P) - 0.0058
    meshes = []
    # capelet hem: trace the outer surface at the hem height from the front-left edge round the back to the front-right
    lo = np.arcsin(np.clip(0.02, 0, 1)) + 0.12
    angs = np.linspace(lo, 2 * np.pi - lo, 80)
    dirs = np.stack([np.sin(angs), -np.cos(angs), np.zeros_like(angs)], -1)
    starts = np.stack([np.zeros_like(angs), np.full_like(angs, 0.012), _cape_hem(angs)], -1)
    hem_pts = trace(outer, starts, dirs, 0.0, 0.3) - dirs * 0.0015
    keep = ~((np.abs(hem_pts[:, 0]) < _cape_open(hem_pts[:, 2]) + 0.002) & (hem_pts[:, 1] < -0.02))
    hem_pts = hem_pts[keep]
    # front edges from the hem up to the clasp, joined to the hem ends
    zs = np.linspace(hem_pts[0][2] + 0.003, 0.626, 14)
    for sgn, end in ((1, hem_pts[0]), (-1, hem_pts[-1])):
        st = np.stack([sgn * (_cape_open(zs) - 0.001), np.full_like(zs, 0.0), zs], -1)
        edge = trace(outer, st, np.tile(V(0, -1, 0), (len(zs), 1)), 0.0, 0.2) + V(0, 0.0015, 0)
        meshes.append(sweep(np.concatenate([[end], edge]), 0.0036, radial=8))
    meshes.append(sweep(hem_pts, 0.0036, radial=8))
    # sleeve cuffs
    a, b, e = _sleeve_axis()
    ax = _n(e - b); e1 = _n(np.cross(ax, V(0, 0, 1))); e2 = np.cross(ax, e1)
    for s_ in (1, -1):
        cuff = [_m(e + (np.cos(t) * e1 + np.sin(t) * e2) * (SLEEVE_R[2] + 0.0028), s_) for t in np.linspace(0, 2 * np.pi, 40, endpoint=False)]
        meshes.append(sweep(cuff, 0.0038, radial=8, closed=True, ref=_m(ax, s_)))
    # robe hem
    rh = []
    for t in np.linspace(-np.pi, np.pi, 120, endpoint=False):
        z = HEM_Z + 0.004 * np.sin(t * 9 + 0.8) + 0.0035
        P0 = V(0, 0.006, z)[None]; d = V(np.sin(t), -np.cos(t), 0)[None]
        rh.append(trace(lambda P: skirt_core(P) - 0.024, P0, d, 0.0, 0.3)[0])
    meshes.append(sweep(rh, 0.0036, radial=8, closed=True, ref=V(0, 0, 1)))
    # the star clasp at the throat, with a round boss in the middle
    sc = V(0, -0.1045, 0.622)
    def star(P):
        q = P - sc
        d2 = star2d(q[:, 0], q[:, 2], 0.024, 0.48)
        return np.minimum(_slab(d2, q[:, 1], 0.0028, 0.0026), sphere(sc + V(0, -0.003, 0.0), 0.0068)(P))
    meshes.append(_sdf.surface_nets(star, sc - 0.035, sc + 0.035, 0.0008))
    return join_meshes(meshes)

def sash_sdf():
    def ribs(P):
        z = P[:, 2]
        return 0.001 * (np.exp(-((z - 0.393) / 0.0025) ** 2) + np.exp(-((z - 0.409) / 0.0025) ** 2))
    band = intersect(lambda P: np.abs(TRUNK(P) - 0.03) - 0.0085 + ribs(P), lambda P: np.abs(P[:, 2] - 0.401) - 0.022, k=0.006)
    knot = round_box((0.07, -0.124, 0.402), (0.014, 0.008, 0.014), 0.007, rot(0, 0.25, 0.45))
    loops = union(ellipsoid((0.047, -0.13, 0.41), (0.02, 0.009, 0.012), rot(0, -0.3, 0.2)),
                  ellipsoid((0.094, -0.108, 0.413), (0.02, 0.009, 0.012), rot(0, 0.35, 0.75)), k=0.004)
    tails = union(strip((0.066, -0.13, 0.392), (0.056, -0.142, 0.3), 0.024, 0.03, 0.005, (0.1, -1, 0)),
                  strip((0.078, -0.124, 0.392), (0.104, -0.122, 0.31), 0.022, 0.028, 0.005, (0.5, -1, 0)), k=0.004)
    return union(band, knot, loops, tails, k=0.005)

def duck_sdf(c, s=1.0, facing=(0, -1, 0)):
    """a little rubber duck (c: centre of its body, s: scale; faces `facing` in the horizontal plane)"""
    c = V(*c); f = _n(V(facing[0], facing[1], 0)); side = np.cross(V(0, 0, 1), f)
    R = np.stack([side, f, V(0, 0, 1)], 1)
    body = ellipsoid((0, 0, 0), (0.013 * s, 0.017 * s, 0.011 * s))
    head = sphere((0, 0.009 * s, 0.013 * s), 0.0085 * s)
    tail = round_cone((0, -0.012 * s, 0.002 * s), (0, -0.019 * s, 0.009 * s), 0.006 * s, 0.002 * s)
    beak = ellipsoid((0, 0.0175 * s, 0.0115 * s), (0.0048 * s, 0.0055 * s, 0.0022 * s))
    f_ = union(body, head, tail, k=0.005 * s)
    f_ = union(f_, beak, k=0.001 * s)
    return lambda P: f_((P - c) @ R), (c, R, s)

CHARM_C = V(0.052, -0.14, 0.338)
def charm_sdf():
    duck, _ = duck_sdf(CHARM_C, 1.0, (0.35, -1, 0))
    cord = tube([(0.066, -0.134, 0.39), (0.06, -0.14, 0.37), (0.054, -0.141, 0.356)], [0.0013] * 3)
    return union(duck, cord, k=0.002)

def duck_color(P, c, R, s):
    q = (P - c) @ R
    col = np.tile(_lin('#ffd23a'), (len(P), 1))
    beak = smoothstep(0.012 * s, 0.0142 * s, q[:, 1]) * smoothstep(0.004 * s, 0.009 * s, q[:, 2]) * (q[:, 2] < 0.016 * s)
    col = _mix(col, _lin('#ff8a26'), beak)
    eye = smoothstep(0.0024 * s, 0.0012 * s, _len(np.stack([np.abs(q[:, 0]) - 0.0062 * s, q[:, 1] - 0.0135 * s, q[:, 2] - 0.0165 * s], -1)))
    col = _mix(col, _lin('#1a120e'), eye)
    return col

# ---- the staff (film renders): driftwood crook with a glowing orb, a blue ribbon and a duck charm, in the right paw
STAFF_G = V(-0.178, -0.05, 0.305)   # grip (world, A-pose): through the right paw
def _staff_frame(p):
    """staff space (z up the staff from the grip, -y forward) -> world"""
    return STAFF_G + np.asarray(p, float)

def staff_path():
    zs = np.linspace(-0.3, 0.63, 40)
    pts = [(0.006 * np.sin(z * 7 + 0.5) - 0.002, 0.004 * np.sin(z * 5 + 1.3), z) for z in zs]
    rad = [0.0125 + 0.0018 * np.sin(z * 31) + 0.0012 * np.sin(z * 71 + 1) + 0.002 * smoothstep(0.45, 0.62, z) for z in zs]
    # the crook: up the back, over the top, down the front and a small curl inward round the orb
    C = V(0, -0.036, 0.688); R = 0.058
    angs = np.linspace(-2.55, 2.6, 40)
    arc = [C + R * V(0, -np.sin(a), np.cos(a)) * (1 - 0.18 * smoothstep(1.8, 2.6, a)) for a in angs]
    arad = [0.0135 - 0.0055 * smoothstep(-2.0, 2.6, a) for a in angs]
    return [_staff_frame(p) for p in pts] + [_staff_frame(a) for a in arc[1:]], rad + arad[1:], _staff_frame(C)

def staff_mesh():
    pts, rad, C = staff_path()
    ms = [sweep(pts, rad, radial=12)]
    g = _staff_frame
    ms.append(sweep([g((0.0, -0.008, 0.595)), g((0.01, -0.024, 0.628)), g((0.017, -0.04, 0.645)), g((0.02, -0.05, 0.652))], [0.006, 0.0045, 0.003, 0.002], radial=8))
    for p, r in (((0.011, 0.0, 0.12), 0.0085), ((-0.01, 0.004, -0.08), 0.0075), ((0.0, 0.011, 0.36), 0.008)):  # knots
        c = g(p); d = _n(c - g((0, 0, p[2])))
        ms.append(sweep([c - d * r * 0.6, c + d * r * 0.2], [r, r * 0.8], radial=8))
    return join_meshes(ms)

def staff_orb_sdf():
    _, _, C = staff_path()
    return sphere(C, 0.037)

def staff_deco_sdf():
    """blue ribbon bow below the crook + a duck charm on a cord"""
    g = lambda p: _staff_frame(p)
    band = lambda P: torus_y(g((0, 0, 0.57)), 0.0155, 0.0042)(P)
    loops = union(ellipsoid(g((0.021, -0.012, 0.582)), (0.017, 0.006, 0.011), rot(0, 0.5, 0.3)),
                  ellipsoid(g((-0.021, -0.012, 0.582)), (0.017, 0.006, 0.011), rot(0, -0.5, -0.3)), k=0.003)
    knot = sphere(g((0, -0.017, 0.572)), 0.0065)
    tails = union(strip(g((0.004, -0.018, 0.566)), g((0.02, -0.024, 0.49)), 0.012, 0.014, 0.0035, (0.2, -1, 0)),
                  strip(g((-0.004, -0.018, 0.566)), g((-0.016, -0.03, 0.5)), 0.012, 0.014, 0.0035, (-0.2, -1, 0)), k=0.002)
    cord = tube([tuple(g(p)) for p in ((0.0, -0.02, 0.566), (0.004, -0.028, 0.53), (0.006, -0.03, 0.505))], [0.0012] * 3)
    duck, _ = duck_sdf(g((0.006, -0.032, 0.49)), 0.85, (0.3, -1, 0))
    return union(band, loops, knot, tails, cord, duck, k=0.002)

# ------------------------------------------------------------------ colour (linear RGB) and roughness per vertex
FUR, FUR_LIGHT, FUR_DEEP = _lin('#5c301f'), _lin('#7f4a31'), _lin('#44220f')
NOSE_C, LID_C, PAD = _lin('#4f271f'), _lin('#241109'), _lin('#3a2320')
MOUTH_IN = _lin('#4a1a1e')
IRIS_IN, IRIS_OUT = _lin('#ffd068'), _lin('#b86a12')
ROBE, ROBE_DEEP, STAR = _lin('#b9a4ea'), _lin('#9c86d6'), _lin('#ffd45c')
CAPE, CAPE_LINING = _lin('#3dbfa9'), _lin('#b6f0e2')
HAT_C, HAT_BAND, PATCH, PAW = _lin('#48c6b0'), _lin('#7a50c8'), _lin('#fff0d8'), _lin('#7a50c8')
SASH_C, GOLD = _lin('#7a50c8'), _lin('#f0bf4a')

def head_color(Q):
    P = np.concatenate([np.abs(Q[:, :1]), Q[:, 1:]], -1); y, z = P[:, 1], P[:, 2]
    c = np.tile(FUR, (len(P), 1)); rough = np.full(len(P), 0.6)
    c = _mix(c, FUR_LIGHT, 0.45 * smoothstep(-0.1, -0.15, y) * smoothstep(0.99, 0.965, z))       # warm muzzle
    c = _mix(c, FUR_LIGHT, 0.35 * smoothstep(0.02, 0.0, ellipsoid((0.064, -0.075, 0.935), (0.05, 0.047, 0.038))(P)))  # cheeks
    c = _mix(c, FUR_LIGHT, 0.3 * smoothstep(0.93, 0.91, z) * smoothstep(-0.08, -0.11, y))        # chin
    u, v, w = ear_local(P)
    ear = smoothstep(0.004, 0.0, ear_sdf(P)) * smoothstep(0.0, 0.02, u)
    wave = 0.5 + 0.5 * np.sin(u * 110 + 2.6 * np.sin(v * 52))
    c = _mix(c, FUR_DEEP, ear * 0.45 * (1 - wave))                                                 # waves: deep troughs ...
    c = _mix(c, FUR_LIGHT, ear * 0.35 * wave * smoothstep(0.02, 0.1, u))                           # ... sunlit crests
    rim = smoothstep(0.0035, 0.0012, np.abs(eye_opening(P))) * (_len(P - EYE) < EYE_R + 0.014)
    c = _mix(c, LID_C, rim)
    c = _mix(c, MOUTH_IN, smoothstep(0.0025, 0.0005, mouth_space(P)))
    nose = smoothstep(0.0022, 0.0006, NOSE(P))
    c = _mix(c, NOSE_C, nose); rough = rough + (0.3 - rough) * nose
    return c, rough

def eye_color(Q):
    P = np.concatenate([np.abs(Q[:, :1]), Q[:, 1:]], -1)
    q = (P - EYE) @ EYE_ROT
    q = q / _len(q)[:, None]
    ang = np.arccos(np.clip(-q[:, 1] * np.cos(0.1) + q[:, 2] * np.sin(0.1), -1, 1))
    phi = np.arctan2(q[:, 2], q[:, 0])
    iris_r, pupil_r = 0.87, 0.42
    t = _clamp(ang / iris_r)
    iris = IRIS_IN + (IRIS_OUT - IRIS_IN) * (t ** 1.3)[:, None]                                 # golden, deeper at the rim
    iris = iris * (0.88 + 0.12 * np.sin(phi * 23 + 3 * np.sin(phi * 7)))[:, None]
    iris = _mix(iris, _lin('#fff0a0'), 0.35 * smoothstep(pupil_r + 0.12, pupil_r + 0.02, ang))   # a bright ring round the pupil
    c = np.tile(_lin('#f3eee6'), (len(P), 1))
    c = _mix(c, iris, smoothstep(iris_r + 0.03, iris_r - 0.01, ang))
    c = _mix(c, _lin('#3a1a06'), smoothstep(iris_r - 0.1, iris_r, ang) * (ang < iris_r + 0.02))
    c = _mix(c, _lin('#070504'), smoothstep(pupil_r + 0.02, pupil_r - 0.01, ang))
    return c, np.full(len(P), 0.05)

def body_color(P):
    z = P[:, 2]
    c = np.tile(FUR, (len(P), 1)); rough = np.full(len(P), 0.6)
    c = _mix(c, PAD, smoothstep(0.012, 0.004, z))
    return c, rough

def _stars(s, z, cell, r, density, seed):
    """a scatter of little stars in the (s, z) plane: returns 0..1 coverage"""
    i = np.floor(s / cell); j = np.floor(z / cell)
    h = np.sin(i * 127.1 + j * 311.7 + seed) * 43758.5453; h = h - np.floor(h)
    h2 = np.sin(i * 269.5 + j * 183.3 + seed) * 23421.631; h2 = h2 - np.floor(h2)
    cx = (i + 0.25 + 0.5 * h) * cell; cz = (j + 0.25 + 0.5 * h2) * cell
    rr = r * (0.7 + 0.6 * h2)
    d = star2d(s - cx, z - cz, rr, 0.45)
    return smoothstep(0.0008, -0.0006, d) * (h < density)

def robe_color(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ang = np.arctan2(x, -y)
    c = np.tile(ROBE, (len(P), 1)); rough = np.full(len(P), 0.8)
    s = ang * 0.13
    field = _stars(s, z, 0.042, 0.0085, 0.55, 1.7) * smoothstep(0.43, 0.39, z)                 # stars scattered on the skirt ...
    row = star2d((np.mod(s + 0.02, 0.04) - 0.02), z - 0.222, 0.0095, 0.45)                     # ... and a row above the hem
    field = np.maximum(field, smoothstep(0.0008, -0.0006, row))
    c = _mix(c, ROBE_DEEP, 0.35 * smoothstep(0.3, 0.2, z))                                     # deeper toward the hem
    c = _mix(c, STAR, field); rough = rough + (0.45 - rough) * field
    return c, rough

def capelet_color(P, lining=True):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    c = np.tile(CAPE, (len(P), 1)); rough = np.full(len(P), 0.78)
    if lining:  # the inside of the cloth: pale lining (not in the game bake: its rays catch the thin shell's inside)
        c = _mix(c, CAPE_LINING, 0.75 * smoothstep(0.0032, 0.0012, cape_core()(P)))
    # the hood's lining shows where it rolls open round the neck, and inside the pouch's upper lip
    roll = smoothstep(0.004, 0.0, tube(HOOD_ROLL, [0.018] * len(HOOD_ROLL))(P))
    lining = roll * smoothstep(0.66, 0.676, z)
    c = _mix(c, CAPE_LINING, 0.8 * lining)
    return c, rough

def hat_color(Q):
    q = hat_local(Q)
    c = np.tile(HAT_C, (len(Q), 1)); rough = np.full(len(Q), 0.85)
    band = smoothstep(0.0025, 0.0, hat_band(q) + 0.0005)
    c = _mix(c, HAT_BAND, band)
    bs = np.arctan2(q[:, 0], -q[:, 1]) * 0.104
    pin = smoothstep(0.0008, -0.0006, star2d(bs - 0.052, q[:, 2] - 0.018, 0.0125, 0.47)) * band * (q[:, 1] < 0)
    c = _mix(c, GOLD, pin)
    # the paw-print patch: cream felt, a violet paw, dashed stitches round the rim
    pq = q - PATCH_C
    front = smoothstep(-0.02, 0.0, -q[:, 1] - 0.05)
    pr = _len(np.stack([pq[:, 0], pq[:, 2]], -1))
    patch = smoothstep(0.0275, 0.0265, pr) * front
    c = _mix(c, PATCH, patch)
    stitch = smoothstep(0.0012, 0.0005, np.abs(pr - 0.0232)) * (np.sin(np.arctan2(pq[:, 2], pq[:, 0]) * 14) > 0.1) * front
    c = _mix(c, PAW, 0.85 * stitch)
    px, pz = pq[:, 0], pq[:, 2]
    pad = _len(np.stack([px / 1.15, pz + 0.004], -1)) - 0.0085
    toes = np.minimum.reduce([_len(np.stack([px - tx, pz - tz], -1)) - 0.0042 for tx, tz in ((-0.0105, 0.0055), (-0.0038, 0.0112), (0.0038, 0.0112), (0.0105, 0.0055))])
    paw = smoothstep(0.0007, -0.0005, np.minimum(pad, toes)) * front * patch
    c = _mix(c, PAW, paw)
    return c, rough

def trim_color(P):
    return np.tile(GOLD, (len(P), 1)), np.full(len(P), 0.35)

def charm_color(P):
    _, (c, R, s) = duck_sdf(CHARM_C, 1.0, (0.35, -1, 0))
    col = duck_color(P, c, R, s)
    cord = P[:, 2] > CHARM_C[2] + 0.018
    col[cord] = _lin('#7a50c8')
    return col, np.full(len(P), 0.3)

def staff_color(P):
    q = P - STAFF_G
    c = np.tile(_lin('#b89b7a'), (len(P), 1))                                  # sun-bleached driftwood
    c = _mix(c, _lin('#8a6a4e'), 0.5 * (0.5 + 0.5 * np.sin(q[:, 2] * 90 + 4 * np.sin(q[:, 0] * 200))))
    c = _mix(c, _lin('#e3d2b6'), 0.35 * smoothstep(0.5, 0.7, q[:, 2]))           # the crook paler, polished by her paw
    return c, np.full(len(P), 0.7)

def orb_color(P):
    return np.tile(_lin('#3ff0d8'), (len(P), 1)), np.full(len(P), 0.05)

def deco_color(P):
    g = lambda p: _staff_frame(p)
    _, (c, R, s) = duck_sdf(g((0.006, -0.032, 0.49)), 0.85, (0.3, -1, 0))
    col = np.tile(_lin('#3f7fe8'), (len(P), 1))
    duck = _len(P - c) < 0.03
    col[duck] = duck_color(P[duck], c, R, s)
    return col, np.full(len(P), 0.6)

# ------------------------------------------------------------------ skinning rules for the clothes (see build.py)
def robe_weights(Vx, near_W):
    """bodice and sleeves copy the skin under them; the skirt hangs from the hips and follows each thigh half-way,
    with weights that vary smoothly across the front and back (the cloth between the legs never tears)"""
    W = near_W(Vx, np.zeros(len(Vx), bool))
    x, z = Vx[:, 0], Vx[:, 2]
    k = smoothstep(0.37, 0.3, z)
    tl = 0.5 * smoothstep(-0.05, 0.08, x) * smoothstep(0.35, 0.24, z)
    tr = 0.5 * smoothstep(0.05, -0.08, x) * smoothstep(0.35, 0.24, z)
    skirt = {'hips': 1 - tl - tr, 'thigh_L': tl, 'thigh_R': tr}
    for b in W: W[b] = W[b] * (1 - k)
    for b, w in skirt.items(): W[b] = W.get(b, 0) + w * k
    return W

def cloth_smooth(Vx, near_W):
    """loose cloth over the shoulders and arms: a broad average of the skin nearby (may follow an arm, but the
    stretch spreads over the whole shoulder instead of tearing at the armpit)"""
    return near_W(Vx, np.ones(len(Vx), bool), n=48, r=0.02)

def sleeve_weights(Vx, near_W):
    """the sleeve follows its arm (its root at the shoulder keeps the skin's own blend with the chest)"""
    return near_W(Vx, np.ones(len(Vx), bool), n=12, r=0.008, arm_only=True)

def trim_weights(Vx, near_W):
    z = Vx[:, 2]
    W = cloth_smooth(Vx, near_W)
    _, _, e = _sleeve_axis()
    Q = np.concatenate([np.abs(Vx[:, :1]), Vx[:, 1:]], -1)
    cuff = _len(Q - e) < SLEEVE_R[2] + 0.014          # the piping round each sleeve's open end
    Wa = sleeve_weights(Vx, near_W)
    Wr = robe_weights(Vx, near_W)
    hem = z < 0.3
    for b in set(W) | set(Wa) | set(Wr):
        W[b] = np.where(cuff, Wa.get(b, 0), np.where(hem, Wr.get(b, 0), W.get(b, np.zeros(len(Vx)))))
    return W

def lash_weights(Vx, near_W):
    return {'lidU_L': (Vx[:, 0] > 0).astype(float), 'lidU_R': (Vx[:, 0] <= 0).astype(float)}

# ------------------------------------------------------------------ parts
def parts():
    o, k = HEAD_OFS, HEAD_SCALE
    place = lambda f: moved(scaled(f, H, (k, k, k)), o)
    unplace = lambda P: H + (P - o - H) / k
    box = lambda lo, hi: (tuple(H + (V(*lo) - H) * k + o), tuple(H + (V(*hi) - H) * k + o))
    return [dict(p, clamp=1.0) for p in [
        dict(name='head', f=place(head_sdf()), box=box((-0.27, -0.26, 0.8), (0.27, 0.2, 1.3)), h=0.0016, mat='fur', color=lambda P: head_color(unplace(P))),
        dict(name='tongue', f=place(TONGUE), box=box((-0.04, -0.22, 0.89), (0.04, -0.12, 0.93)), h=0.0009, mat='skin', color=flat('#d8707a', 0.35)),
        dict(name='eyes', f=place(mirror_x(sphere(EYE, EYE_R))), box=box((-0.12, -0.15, 0.94), (0.12, -0.03, 1.06)), h=0.0011, mat='eye', color=lambda P: eye_color(unplace(P))),
        dict(name='lashes', mesh=lashes_mesh, mat='cloth', color=flat('#1e0e08', 0.6), skin=('fn', lash_weights)),
        dict(name='hat', f=place(HAT), box=box((-0.23, -0.23, 0.98), (0.25, 0.26, 1.42)), h=0.002, mat='cloth', color=lambda P: hat_color(unplace(P)), skin=('bone', 'head')),
        dict(name='body', f=body_sdf(), box=((-0.26, -0.17, -0.01), (0.26, 0.24, 0.75)), h=0.0035, mat='fur', color=body_color),
        dict(name='robe', f=robe_sdf(), box=((-0.23, -0.22, 0.15), (0.23, 0.22, 0.68)), h=0.0028, mat='cloth', color=robe_color, skin=('fn', robe_weights)),
        dict(name='sleeves', f=sleeves_sdf(), box=((-0.27, -0.1, 0.33), (0.27, 0.1, 0.66)), h=0.0024, mat='cloth', color=robe_color, skin=('fn', sleeve_weights)),
        dict(name='capelet', f=capelet_sdf(), box=((-0.26, -0.18, 0.42), (0.26, 0.2, 0.71)), h=0.0024, mat='cloth', color=capelet_color, skin=('fn', cloth_smooth)),
        dict(name='trim', mesh=trim_mesh, mat='gold', color=trim_color, skin=('fn', trim_weights)),
        dict(name='sash', f=sash_sdf(), box=((-0.2, -0.18, 0.28), (0.2, 0.16, 0.44)), h=0.0022, mat='cloth', color=flat('#7a50c8', 0.7)),
        dict(name='charm', f=charm_sdf(), box=((0.02, -0.18, 0.31), (0.09, -0.11, 0.4)), h=0.0007, mat='skin', color=charm_color, skin=('bone', 'hips')),
        dict(name='staff', mesh=staff_mesh, mat='wood', color=staff_color, skin=('bone', 'hand_R'), film_only=True),
        dict(name='staff_orb', f=staff_orb_sdf(), box=((-0.24, -0.15, 0.92), (-0.12, -0.02, 1.05)), h=0.0014, mat='glow', color=orb_color, skin=('bone', 'hand_R'), film_only=True),
        dict(name='staff_deco', f=staff_deco_sdf(), box=((-0.24, -0.13, 0.76), (-0.12, 0.0, 0.93)), h=0.001, mat='cloth', color=deco_color, skin=('bone', 'hand_R'), film_only=True),
    ]]

# ------------------------------------------------------------------ fur fields
NOSE_TIP = V(0, -0.226, 0.965)
_CLOTH = []
def cloth_sdf():
    if not _CLOTH: _CLOTH.append(union(robe_sdf(), sleeves_sdf(), capelet_sdf(), sash_sdf()))
    return _CLOTH[0]

FUR_DENSITY = (('head', 1.8e6), ('body', 1.3e6))
CURL = dict(curl_r=0.2, turns=1.4, flat=0.5)

def head_fur(Q):
    """sculpt-space fields -> (weight, length, comb, lift, curl): a sleek face, soft cheeks, long curly ears"""
    sx = np.sign(Q[:, 0]); P = np.concatenate([np.abs(Q[:, :1]), Q[:, 1:]], -1); x, y, z = P[:, 0], P[:, 1], P[:, 2]
    near_eye = _len(P - EYE) < EYE_R + 0.022
    mouth = mouth_space(P)
    w = smoothstep(0.002, 0.006, NOSE(P)) * smoothstep(0.003, 0.007, mouth)
    w = w * np.where(near_eye, smoothstep(0.0015, 0.006, eye_opening(P)), 1.0)
    w = w * smoothstep(0.0, 0.005, HAT(Q))                                            # nothing grows under the hat
    L = np.full(len(P), 0.0095)
    L = L + (0.0042 - L) * smoothstep(-0.11, -0.155, y)
    L = np.where(near_eye, np.minimum(L, 0.005), L)
    cheek = smoothstep(0.07, 0.1, x) * smoothstep(0.985, 0.93, z)
    L = L + (0.02 - L) * cheek
    L = L + (0.013 - L) * smoothstep(0.915, 0.89, z) * smoothstep(-0.05, -0.09, y)
    L = np.minimum(L, 0.004 + 0.8 * np.maximum(mouth, 0))
    u, v, wo = ear_local(P)
    ear = smoothstep(0.006, 0.0, ear_sdf(P)) * smoothstep(-0.01, 0.015, u)
    L = L + (0.022 + 0.018 * _clamp(u / 0.15) - L) * ear                               # long feathering, longest at the hem
    comb = P - NOSE_TIP
    comb = comb / _len(comb)[:, None] + V(0, 0.3, -1.0) * (smoothstep(0.06, 0.11, x) * smoothstep(1.0, 0.95, z))[:, None]
    comb = comb + V(1.0, 0.4, -0.8) * cheek[:, None]
    comb = comb * (1 - ear)[:, None] + (_U + _W * 0.25)[None, :] * ear[:, None]           # ear locks fall down the ear
    comb[:, 0] *= sx
    lift = 0.22 + 0.25 * cheek + 0.2 * ear
    curl = 0.25 * cheek + 1.25 * ear
    return w, L, comb, lift, curl

def body_fur(P, head_f):
    x, y, z = np.abs(P[:, 0]), P[:, 1], P[:, 2]
    w = smoothstep(0.004, 0.009, cloth_sdf()(P)) * smoothstep(0.0, 0.004, head_f(P)) * smoothstep(0.004, 0.014, z)
    tail = smoothstep(0.02, 0.0, tube(TAIL_P, TAIL_RAD)(P))
    along = np.clip(((P - TAIL_P[0]) @ (TAIL_P[-1] - TAIL_P[0])) / np.sum((TAIL_P[-1] - TAIL_P[0]) ** 2), 0, 1)
    L = np.full(len(P), 0.009)
    L = L + (0.034 + 0.012 * along - L) * tail                                     # a fluffy, curly pom-pom of a tail
    feather = smoothstep(0.03, -0.01, y) * smoothstep(0.085, 0.13, z) * smoothstep(0.26, 0.21, z)
    L = L + (0.022 - L) * feather                                                    # feathering down the backs of the legs
    L = L + (0.013 - L) * smoothstep(0.1, 0.14, z) * smoothstep(0.26, 0.21, z) * (1 - feather)  # wavy shins
    L = np.where(z < 0.1, np.minimum(L, 0.0045), L)
    comb = np.tile(V(0, 0.15, -1.0), (len(P), 1))
    comb = comb + (V(0, -0.8, -0.6) - comb) * (z < 0.1)[:, None]
    t_dir = (TAIL_P[-1] - TAIL_P[0]) / np.linalg.norm(TAIL_P[-1] - TAIL_P[0])
    axis_pt = TAIL_P[0] + np.outer(along, TAIL_P[-1] - TAIL_P[0])
    radial = P - axis_pt
    comb = comb * (1 - tail)[:, None] + (t_dir * 0.8 + radial / np.maximum(_len(radial), 1e-6)[:, None] * 0.9) * tail[:, None]
    lift = 0.25 + 0.35 * tail
    curl = 0.35 + 0.9 * tail + 0.4 * feather
    curl = np.where(z < 0.1, 0.0, curl)
    return w * (1 + 0.8 * tail), L, comb, lift, curl

# ------------------------------------------------------------------ rig: poses, expressions, shots, game export
def _R(axis, deg):
    return (np.asarray(axis, float), float(deg))
X_, Y_, Z_ = V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)

POSES = {
    'hold': {  # standing with the staff: right forearm up a little, the staff upright at her side
        'upperarm_R': [_R(Y_, 6), _R(X_, -8)], 'forearm_R': [_R(X_, -38)], 'hand_R': [_R(X_, 34)],
        'upperarm_L': [_R(Y_, -6)],
    },
    'hero': {  # weight on one hip, paw on the hip, staff planted, chin up, a bright look
        'hips': [_R(Y_, -3)], 'spine': [_R(Y_, 3), _R(X_, -2)], 'chest': [_R(X_, -3), _R(Z_, -6)],
        'head': [_R(X_, -5), _R(Y_, -7), _R(Z_, 12)],
        'upperarm_L': [_R(Y_, -42), _R(X_, 12)], 'forearm_L': [_R(Y_, 88)],
        'upperarm_R': [_R(Y_, 17), _R(X_, -4)], 'forearm_R': [_R(Y_, 4)], 'hand_R': [_R(Y_, -21), _R(X_, 4)],
        'thigh_L': [_R(Y_, -5)], 'thigh_R': [_R(Y_, 4), _R(X_, -6)], 'shin_R': [_R(X_, 8)],
        'tail1': [_R(X_, -18)], 'tail2': [_R(Z_, 14)], 'tail3': [_R(Z_, 14)],
    },
    'armsup': {  # skinning check: both arms up and out (the Animator's 'happy' / 'spin')
        'upperarm_L': [_R(Y_, -135)], 'upperarm_R': [_R(Y_, 135)],
    },
    'reach': {  # skinning check: both arms swung forward overhead (the Animator's jump / cast swings)
        'upperarm_L': [_R(X_, -150)], 'upperarm_R': [_R(X_, -150)], 'forearm_L': [_R(X_, -20)], 'forearm_R': [_R(X_, -20)],
    },
    'cast': {  # the spell: staff raised high, the other paw thrown open toward the target, leaning in
        'hips': [_R(Z_, 8)], 'spine': [_R(X_, 4), _R(Z_, 6)], 'chest': [_R(X_, -4), _R(Z_, 8)],
        'head': [_R(X_, -12), _R(Z_, -10), _R(Y_, -6)],
        'upperarm_R': [_R(Y_, 78), _R(X_, -22)], 'forearm_R': [_R(Y_, 56)], 'hand_R': [_R(Y_, -132), _R(X_, -6)],
        'upperarm_L': [_R(Y_, -40), _R(X_, -42)], 'forearm_L': [_R(Y_, -14), _R(X_, -24)], 'hand_L': [_R(Y_, -18), _R(X_, -20)],
        'thigh_L': [_R(X_, -14), _R(Y_, -6)], 'shin_L': [_R(X_, 12)], 'thigh_R': [_R(X_, 10), _R(Y_, 5)],
        'tail1': [_R(X_, -25)], 'tail2': [_R(X_, -15)],
    },
}

def tweak_expression(name, E, h):
    """Moka's face: a soft closed smile at rest; her pendant ears lift and swing instead of perking"""
    R = E['rot']
    def ears(fwd=0.0, out=0.0, tip_out=0.0, tip_fwd=0.0):
        for side, s in (('L', 1), ('R', -1)):
            R[f'ear_{side}'] = [_R(X_, -fwd), _R(Y_, -out * s)]
            R[f'earTip_{side}'] = [_R(X_, -tip_fwd), _R(Y_, -tip_out * s)]
    if name == 'neutral':
        h['lips'](2, 2)
    elif name == 'happy':
        h['jaw'](8); h['lips'](9, 5); h['brows'](3); h['lids'](0, 13); ears(4, 8, 6)
    elif name == 'laugh':
        ears(6, 12, 10)
    elif name == 'surprised':
        h['jaw'](15); h['lips'](-1, -2); h['brows'](7); h['lids'](-10, 0); ears(-6, 18, 12, -4)
    elif name == 'sad':
        ears(-4, -3, -2)
    elif name == 'determined':
        h['jaw'](0); h['lips'](0, 2); h['brows'](-3, -5); h['lids'](13, 9); ears(-10, 4, 0, -6)
    elif name == 'blink':  # her taller lid opening closes with a shorter sweep (70 deg overshot the lower lid)
        h['lids'](60, 12); ears(0, 0)
    elif name == 'bark':
        ears(-6, 10, 8)

# (yaw, pitch, focal, target, distance): she stands taller than Chewy with her hat
SHOTS = {
    'front': (0, 3, 85, (0, 0, 0.56), 4.7),
    '34': (-35, 6, 85, (0, 0, 0.56), 4.7),
    'side': (-90, 3, 85, (0, 0.02, 0.56), 4.7),
    'back': (160, 6, 85, (0, 0, 0.56), 4.7),
    'head': (-28, 4, 100, (0, -0.06, 0.86), 2.6),
    'headfront': (0, 2, 100, (0, -0.05, 0.86), 2.6),
    'headside': (-90, 2, 100, (0, -0.05, 0.86), 2.6),
    'face': (-24, 3, 100, (0, -0.07, 0.83), 1.9),
    'hero': (-30, -3, 55, (0, -0.02, 0.58), 3.0),
    'cast': (-22, -4, 55, (0, -0.02, 0.62), 3.3),
}

GAME = dict(
    name='moka_disney', scale=1.15, height=1.1,
    budget=dict(head=35600, hat=3400, body=5000, robe=5600, sleeves=1800, capelet=5000, trim=2400, sash=1400, charm=500, eyes=2400, lashes=500, tongue=300),
    texel=dict(eyes=6.0, head=2.2, tongue=1.5, lashes=1.0, hat=1.3),
    no_outline=('eyes', 'tongue', 'lashes'),
    fur=('head', 'body'),
    cloth=('robe', 'sleeves', 'capelet', 'sash', 'hat'),
    # calibrated in game: the toon light's warm key and saturated shadows push liver toward maroon, and the AO and
    # streaks darken the bake, so the game coat is lighter and much less saturated than the film's
    coat={'FUR': '#8c6450', 'FUR_LIGHT': '#a88068', 'FUR_DEEP': '#6c4a3a', 'CAPE': '#4ccab6', 'HAT_C': '#58d0bc'},
    repaint={'capelet': lambda P: capelet_color(P, lining=False), 'hat': None},
)
