"""Shadow (Toybox Chibi Boston terrier) -- deterministic phase-1 model build.

Blender 4.3:
  blender --background --factory-startup --python build_shadow-toy.py

Builds the whole asset from an empty scene, paints a 2048 atlas, saves shadow-toy.blend,
exports public/models/shadow-toy.glb and writes joints.json. Units: metres, front = -Y,
ground z = 0, character left = +X.

Technique
- Head, body and the four legs are star-shaped implicit surfaces: a smooth union of
  superellipsoids, sampled by a root-find along rays from a centre on a warped lat-long
  grid. Every vertex lies exactly on a smooth C1 surface (no deformers, no dents).
- Eyes are true spheres. The head skin around each eye is blended onto the eyeball
  sphere (+lid offset outside the opening, -depth inside), so the eye is set into a
  socket that follows the head's curve, and the opening outline is exact.
- Ears, collar, tag, nose and tail are parametric quad shells.
- Every chart's UVs are linear in the grid index, so texel density follows vertex
  density (the face gets most of it). Paint is evaluated in 3D: each texel is mapped back
  to its surface point (bilinear on the vertex grid), so markings are continuous across
  parts and seams.
"""
import bpy, bmesh, math, json, os, sys, struct, zlib
import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
MODEL = 'D:/projects/chewy-life-3d/public/models/shadow-toy.glb'
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
np.random.seed(11)

# ------------------------------------------------------------------ palette (sheet hex values)
HEX = {
    'fur': '#34303F', 'fur_sheen': '#403B4E', 'fur_shade': '#2C2836',
    'white': '#F4ECE0', 'white_shade': '#E2D6C6', 'white_hi': '#FAF4EA',
    'eye_white': '#FBF6EE', 'eye_shadow': '#DCD3D0',
    'iris': '#C88732', 'iris_top': '#8A5420', 'iris_bot': '#E0A84A', 'iris_rim': '#6A3E16',
    'pupil': '#1A1418', 'catch': '#FFF8EE',
    'lid': '#1C181E', 'lid_soft': '#5C5462', 'brow': '#4A4452', 'mouth': '#2A2228',
    'nose': '#211D28', 'nose_hi': '#5E586A',
    'blush': '#EEA0A5', 'inner_ear': '#F0A0A8', 'inner_ear_edge': '#DE8A95',
    'collar': '#4AA8F0', 'collar_shade': '#3588D2', 'collar_hi': '#78C2F8',
    'gold': '#FFD24A', 'gold_shade': '#DDA531', 'gold_hi': '#FFF0B4',
    'toe': '#CDBFAE', 'pad': '#E6D9C8',
}
def rgb(h):
    h = HEX.get(h, h).lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float64)
def mix(a, b, t):
    t = np.asarray(t, np.float64)[..., None]
    return np.asarray(a) * (1 - t) + np.asarray(b) * t

# ------------------------------------------------------------------ math helpers
def nrm(v):
    v = np.asarray(v, np.float64); return v / np.linalg.norm(v)
def length(q): return np.sqrt(np.einsum('...i,...i->...', q, q))
def dot(a, b): return np.einsum('...i,...i->...', a, b)
def clamp01(x): return np.clip(x, 0, 1)
def sstep(a, b, x):
    t = clamp01((np.asarray(x, np.float64) - a) / (b - a)); return t * t * (3 - 2 * t)
def smin(a, b, k):
    h = clamp01(.5 + .5 * (b - a) / k); return b * (1 - h) + a * h - k * h * (1 - h)
def smax(a, b, k): return -smin(-a, -b, k)
def spow(x, p): return np.sign(x) * np.abs(x) ** p
def rot(axis, ang):
    axis = nrm(axis); x, y, z = axis; c, s = math.cos(ang), math.sin(ang); C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
                     [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                     [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])

def sd_se(p, c, a, b, cz, n=2., m=2., bf=None, R=None, cu=None):
    """Superellipsoid implicit, scaled to ~metres near the surface. bf: semi-axis for the -Y half.
    R: optional 3x3 rotation (columns = local axes in world)."""
    d = p - np.asarray(c, np.float64)
    if R is not None: d = d @ R
    bb = b if bf is None else np.where(d[..., 1] < 0, bf, b)
    if cu is not None: cz = np.where(d[..., 2] > 0, cu, cz)
    xy = (np.abs(d[..., 0] / a) ** n + np.abs(d[..., 1] / bb) ** n) ** (1 / n)
    r = (xy ** m + np.abs(d[..., 2] / cz) ** m) ** (1 / m)
    L = length(d)
    return (r - 1) * L / np.maximum(r, 1e-9)

def sd_capsule(p, a, b, r):
    a = np.asarray(a, np.float64); b = np.asarray(b, np.float64)
    pa = p - a; ba = b - a; h = clamp01(dot(pa, ba) / dot(ba, ba))
    return length(pa - h[..., None] * ba) - r

def star_roots(sdf, centre, D, tmax, K=220, iters=28):
    """Outermost root of sdf along centre + t*D, t in (0, tmax]."""
    shp = D.shape[:-1]; D = D.reshape(-1, 3); N = len(D); c = np.asarray(centre, np.float64)
    ts = np.linspace(tmax, 0, K)
    v = sdf(c + D * ts[0]); assert (v > 0).all(), 'star_roots: tmax inside surface'
    lo = np.zeros(N); hi = np.full(N, tmax); found = np.zeros(N, bool)
    for k in range(1, K):
        v = sdf(c + D * ts[k]); newly = (~found) & (v < 0)
        lo[newly] = ts[k]; hi[newly] = ts[k - 1]; found |= newly
        if found.all(): break
    assert found.all(), 'star_roots: ray without root'
    for _ in range(iters):
        mid = .5 * (lo + hi); inside = sdf(c + D * mid[:, None]) < 0
        lo = np.where(inside, mid, lo); hi = np.where(inside, hi, mid)
    t = .5 * (lo + hi)
    return (c + D * t[:, None]).reshape(shp + (3,))

def sdf_normals(sdf, P, h=4e-4):
    e = np.eye(3) * h
    g = np.stack([sdf(P + e[i]) - sdf(P - e[i]) for i in range(3)], -1)
    return g / np.maximum(length(g)[..., None], 1e-12)

def frame_dirs(axis, ref, theta, phi):
    """Directions on a lat-long grid around 'axis'; phi=0 points along 'ref' (seam)."""
    a = nrm(axis); r = nrm(np.asarray(ref) - np.dot(ref, a) * a); b = np.cross(a, r)
    T, F = np.meshgrid(theta, phi, indexing='ij')
    return (np.cos(T)[..., None] * a + np.sin(T)[..., None] *
            (np.cos(F)[..., None] * r + np.sin(F)[..., None] * b))

def warp_lin(t, knots_t, knots_v): return np.interp(t, knots_t, knots_v)

# ------------------------------------------------------------------ dimensions (sheet at 605 px/m)
W = 0.42            # head width at the cheeks (see report: brief says 0.36, the sheet at 0.62 m says 0.42)
ZC = 0.31           # chin / jaw bottom
ZTOP = 0.62         # top of the head dome
Y_NOSE = -0.266     # nose tip (frontmost point)

# ================================================================== HEAD
def head_base(p):
    skull = sd_se(p, (0, -0.030, 0.455), 0.186, 0.185, 0.165, 2.10, 2.0, bf=0.158)
    jowl = sd_se(p, (0, -0.045, 0.412), 0.202, 0.150, 0.102, 2.2, 3.2, bf=0.138, cu=0.074)
    muzzle = sd_se(p, (0, -0.160, 0.368), 0.085, 0.080, 0.058, 2.4, 2.4)
    padL = sd_se(p, (0.042, -0.207, 0.362), 0.054, 0.048, 0.043, 2.0, 2.0)
    padR = sd_se(p, (-0.042, -0.207, 0.362), 0.054, 0.048, 0.043, 2.0, 2.0)
    chin = sd_se(p, (0, -0.188, 0.334), 0.068, 0.054, 0.030, 2.2, 2.0)
    brow = sd_se(p, (0, -0.105, 0.488), 0.105, 0.105, 0.085, 2.0, 2.0)
    d = smin(skull, jowl, 0.080)
    d = smin(d, brow, 0.040)
    d = smin(d, muzzle, 0.030)
    d = smin(d, smin(padL, padR, 0.008), 0.022)
    d = smin(d, chin, 0.020)
    return d

HEAD_C = np.array([0, -0.050, 0.445])

def ray_y(sdf, x, z, y0=-0.6, y1=0.3):
    """First surface hit from the front along +Y at (x, z)."""
    ys = np.linspace(y0, y1, 600); P = np.stack([np.full_like(ys, x), ys, np.full_like(ys, z)], -1)
    v = sdf(P); k = int(np.argmax(v < 0)); assert v[k] < 0
    lo, hi = ys[k - 1], ys[k]
    for _ in range(40):
        m = .5 * (lo + hi)
        if sdf(np.array([[x, m, z]]))[0] < 0: hi = m
        else: lo = m
    return .5 * (lo + hi)

# ---------------- eyes: spheres set into sockets
EYE = {}
EYE_R = 0.092
EYE_BULGE = 0.0065
EYE_YAW = math.radians(37)
EYE_PITCH = math.radians(4)
EYE_X = 0.280 * W
EYE_Z = ZC + 0.320 * W
EYE_DEPTH = 0.0040
EYE_LID = 0.0040
IRIS_TURN = math.radians(21)

def make_eye(s, A, B):
    x = s * EYE_X; y = ray_y(head_base, x, EYE_Z); o = np.array([x, y, EYE_Z])
    n = nrm([s * math.sin(EYE_YAW) * math.cos(EYE_PITCH), -math.cos(EYE_YAW) * math.cos(EYE_PITCH), math.sin(EYE_PITCH)])
    e2 = nrm(np.array([0, 0, 1.]) - n[2] * n)
    e1 = nrm(np.cross(e2, n));
    if e1[0] * s < 0: e1 = -e1          # e1 points outward (temple side) on both eyes
    c = o + (EYE_BULGE - EYE_R) * n
    # iris direction: rotate the opening axis toward the nose and a touch down
    ni = rot([0, 0, 1], s * -IRIS_TURN) @ n
    ni = nrm(ni + np.array([0, 0, 0.035]))
    return dict(s=s, o=o, n=n, e1=e1, e2=e2, c=c, r=EYE_R, A=A, B=B, ni=ni)

def eye_coords(p, E):
    q = p - E['c']; qn = dot(q, E['n'])
    qn_s = np.maximum(qn, 1e-4)
    X = E['r'] * dot(q, E['e1']) / qn_s; Y = E['r'] * dot(q, E['e2']) / qn_s
    # egg: slightly rounder/fuller at the top, a little flatter on the nose side
    Bv = np.where(Y > 0, E['B'] * 1.04, E['B'] * 0.96)
    Av = np.where(X < 0, E['A'] * 0.97, E['A'] * 1.03)
    rho = np.sqrt((X / Av) ** 2 + (Y / Bv) ** 2)
    rho = np.where(qn > 0, rho, 9.0)
    s_m = (rho - 1) * min(E['A'], E['B'])
    return s_m, X, Y, q

def socket_terms(p, E):
    s_m, X, Y, q = eye_coords(p, E)
    dsph = length(q) - E['r']
    delta = -EYE_DEPTH + (EYE_DEPTH + EYE_LID) * sstep(-0.0090, 0.0090, s_m)
    f_sock = dsph - delta
    w = 1 - sstep(0.010, 0.042, s_m)
    return f_sock, w, s_m

def head_full(p):
    f = head_base(p)
    for E in EYE.values():
        f_sock, w, s_m = socket_terms(p, E)
        f = (1 - w) * f + w * f_sock
        # the skin always covers the eyeball outside the opening
        cover = np.where(s_m > 0, f_sock, 1.0)
        f = smin(f, cover, 0.003)
    return f

# calibrate the opening (A, B) so the front-projected opening is 0.24 W x 0.25 W
def opening_extent(E, n=180):
    """Approximate front-projected extents of the opening (rho = 1 on the sphere)."""
    pts = []
    for a in np.linspace(0, 2 * PI, n, endpoint=False):
        lo, hi = 0.0, 1.2
        d0 = E['n'] + 1e-9
        for _ in range(40):
            m = .5 * (lo + hi)
            tx = m * math.cos(a); ty = m * math.sin(a)
            dvec = nrm(E['n'] + tx * E['A'] / E['r'] * E['e1'] + ty * E['B'] / E['r'] * E['e2'])
            P = E['c'] + E['r'] * dvec
            s_m = eye_coords(P[None], E)[0][0]
            if s_m < 0: lo = m
            else: hi = m
        tx = lo * math.cos(a); ty = lo * math.sin(a)
        dvec = nrm(E['n'] + tx * E['A'] / E['r'] * E['e1'] + ty * E['B'] / E['r'] * E['e2'])
        pts.append(E['c'] + E['r'] * dvec)
    return np.array(pts)

A0, B0 = 0.062, 0.053
for _ in range(6):
    E = make_eye(1, A0, B0); pts = opening_extent(E)
    wx = np.ptp(pts[:, 0]); hz = np.ptp(pts[:, 2])
    A0 *= (0.242 * W) / wx; B0 *= (0.258 * W) / hz
EYE['L'] = make_eye(1, A0, B0); EYE['R'] = make_eye(-1, A0, B0)
open_pts = {k: opening_extent(E) for k, E in EYE.items()}

# head grid
HC, HR = 100, 52
uu = np.arange(HC) / HC
phi = PI * warp_lin(2 * uu - 1, [-1, -.50, 0, .50, 1], [-1, -.40, 0, .40, 1])
phi = np.where(np.arange(HC) == 0, -PI, phi)
vv = np.arange(HR + 1) / HR
theta = np.radians(warp_lin(vv, [0, .18, .30, .80, .92, 1], [0, 38, 58, 128, 150, 180]))
# directions: phi = 0 is the front (-Y), seam at the back (+Y)
HEAD_D = frame_dirs([0, 0, 1], [0, -1, 0], theta, phi + 0.0)
HEAD_D[0] = [0, 0, 1]; HEAD_D[-1] = [0, 0, -1]
HEAD_P = star_roots(head_full, HEAD_C, HEAD_D, 0.34)

# ================================================================== NOSE
NOSE_Z = ZC + 0.224 * W
NOSE_W = 0.178 * W; NOSE_H = 0.118 * W
def nose_point(T, F):
    # polar axis +Y (buried back), front pole at -Y
    st, ct = np.sin(T), np.cos(T)
    dx = st * np.sin(F); dz = st * np.cos(F); dy = -ct
    zn = dz
    x = (NOSE_W / 2) * spow(dx, .80) * (0.52 + 0.48 * (zn + 1) / 2)
    z = (NOSE_H / 2) * spow(dz, .85) + 0.0025 * (1 - dx * dx)
    yfront = 0.030 * (0.80 + 0.20 * zn)
    y = np.where(dy < 0, dy * yfront, dy * 0.030)
    return np.stack([x, y, z], -1)
NC, NR = 24, 14
nT = np.radians(warp_lin(np.arange(NR + 1) / NR, [0, .6, 1], [0, 95, 180]))
nF = 2 * PI * np.arange(NC) / NC
TT, FF = np.meshgrid(nT, nF, indexing='ij')
NOSE_LOCAL = nose_point(TT, FF)
NOSE_LOCAL[0] = NOSE_LOCAL[0, 0]; NOSE_LOCAL[-1] = NOSE_LOCAL[-1, 0]
nose_face_y = ray_y(head_full, 0, NOSE_Z)
NOSE_C = np.array([0, nose_face_y + 0.006, NOSE_Z])
NOSE_LOCAL[..., 0] *= NOSE_W / np.ptp(NOSE_LOCAL[..., 0]); NOSE_LOCAL[..., 2] *= NOSE_H / np.ptp(NOSE_LOCAL[..., 2])
NOSE_P = NOSE_LOCAL + NOSE_C
# slight forward tilt of the top
NOSE_P = (NOSE_P - NOSE_C) @ rot([1, 0, 0], math.radians(-8)).T + NOSE_C
NOSE_P[..., 1] += Y_NOSE - NOSE_P[..., 1].min(); NOSE_C = NOSE_C + np.array([0, Y_NOSE - (NOSE_C[1] - 0.030), 0])

# ================================================================== EARS
EAR_BASE = (0.114, 0.036, 0.528)     # buried inside the skull
EAR_TIP = (0.151, 0.006, 0.700)      # sheet: tip 0.21 W above the crown at x = 0.37 W
EAR_YAW = math.radians(18)           # broad faces turned outward
EAR_IN = 0.20                        # fraction of the length buried in the head
def ear_frame(s):
    base = np.array([s * EAR_BASE[0], EAR_BASE[1], EAR_BASE[2]])
    tip = np.array([s * EAR_TIP[0], EAR_TIP[1], EAR_TIP[2]])
    up = nrm(tip - base)
    fwd = nrm([s * math.sin(EAR_YAW), -math.cos(EAR_YAW), 0])
    fwd = nrm(fwd - dot(fwd, up) * up)         # front face direction (inner ear)
    side = np.cross(up, fwd)
    if side[0] * s < 0: side = -side           # width axis points outward
    return base, up, fwd, side, float(length(tip - base))

def ear_tip(s):
    base, up, fwd, side, L = ear_frame(s); return base + L * up
def ear_root(s):
    base, up, fwd, side, L = ear_frame(s); return base + EAR_IN * L * up

EAR_W0 = 0.104
EAR_SHEAR = math.radians(4)        # outer base corner lower than the inner (diagonal base)
EAR_TIP_R = 0.025                    # rounded tip cap radius
EAR_TH0, EAR_TH1 = 0.066, 0.040      # wedge depth at the skull / near the tip (edge-on >= ~45% of face-on)
def ear_outline(h, L):
    """Half-width along the ear axis: a triangle offset by a disk (straight sides, round cap, C1)."""
    h0 = EAR_IN * L; R = EAR_TIP_R; hc = L - R
    lo, hi = 0.05, 1.2
    for _ in range(60):                               # half-angle so that w(h0) = EAR_W0
        m = .5 * (lo + hi); f = (hc - h0) * math.tan(m) + R / math.cos(m)
        lo, hi = (m, hi) if f < EAR_W0 else (lo, m)
    al = .5 * (lo + hi); ht = hc + R * math.sin(al)
    side_w = (hc - h) * math.tan(al) + R / math.cos(al)
    cap_w = np.sqrt(np.maximum(0, R * R - (h - hc) ** 2))
    w = np.where(h < ht, side_w, cap_w)
    return np.where(h < h0, EAR_W0 * (0.86 + 0.14 * h / h0), w)
def ear_ring_angle(u):
    """Ring angle from the uniform parameter, a little denser at the two rims (a = 0, pi)."""
    ph = 2 * PI * np.asarray(u)
    return ph - 0.10 * np.sin(2 * ph)
EAR_RIM = 0.013                      # rolled rim width (lateral), ~0.03 W including its soft lip
EAR_CUP = 0.0172                     # bowl depth (measured 0.03 W below the rim crest)
def ear_shell(s, ER=30, EC=36):
    base, up, fwd, side, L = ear_frame(s)
    t = warp_lin(np.arange(ER + 1) / ER, [0, .10, .25, .72, 1], [0, .14, .30, .80, 1])
    a = ear_ring_angle(np.arange(EC) / EC)
    T, Aa = np.meshgrid(t, a, indexing='ij')
    h = T * L
    tau = clamp01((T - EAR_IN) / (1 - EAR_IN))          # 0 at the skull, 1 at the tip
    w = ear_outline(h, L) * (1 + 0.10 * np.sin(PI * clamp01(tau / 0.92)))
    th = EAR_TH0 + (EAR_TH1 - EAR_TH0) * clamp01(tau / 0.80)
    th = np.minimum(th, 1.5 * w)                          # the tip closes as a rounded ball
    ca, sa = np.cos(Aa), np.sin(Aa)
    u = spow(ca, 0.55)                                    # lateral position -1..1, fat rolled rims
    # outer half narrows toward the base so the base edge enters the head inside its outline (no wing)
    w_side = w * np.where(u > 0, 0.56 + 0.44 * sstep(0.0, 0.55, tau), 1.0)
    xw = w_side * u
    env = 0.5 * th * sa                                   # convex envelope: back, rim bead, front lip
    u_in = clamp01(1 - EAR_RIM / np.maximum(w_side, 1e-4))
    q = clamp01(np.abs(u) / np.maximum(u_in, 1e-3))
    bowl = (1 - q * q) ** 2 * (np.abs(u) < u_in)          # C1 at the lip: a soft rounded rim edge
    depth = EAR_CUP * sstep(0.02, 0.20, tau) * (1 - sstep(0.70, 0.93, tau))
    nn = env - depth * bowl * sstep(0.0, 0.25, sa)        # recess only on the front face
    nn = nn - 0.005 * (1 - np.abs(ca) ** 2)              # slight crescent bend (edge-on volume)
    bow = -0.010 * np.sin(PI * tau) ** 1.2                # convex back along the length
    side_s = math.cos(EAR_SHEAR) * side - math.sin(EAR_SHEAR) * up
    P = (base + h[..., None] * up + xw[..., None] * side_s + (nn + bow)[..., None] * fwd)
    P[0] = base; P[-1] = base + L * up
    xr = np.where(u_in > 1e-3, u / np.maximum(u_in, 1e-3), 9.0)
    return P, tau, Aa, np.clip(xr, -9, 9)

EAR = {}
for s, tag in ((1, 'L'), (-1, 'R')):
    EAR[tag] = ear_shell(s)

# ================================================================== BODY
FRONT_LEG = (0.094, -0.060)
HIND_LEG = (0.100, 0.192)
THIGH = (0.094, 0.166, 0.165, 0.064, 0.084, 0.072)   # x, y, z, semi-axes (body haunch mass)
def body_sdf(p):
    fore = sd_se(p, (0, -0.010, 0.222), 0.114, 0.120, 0.084, 2.0, 2.0)     # shoulders: the back's high point
    barrel = sd_se(p, (0, 0.075, 0.212), 0.112, 0.110, 0.080, 2.0, 2.0)
    rump = sd_se(p, (0, 0.165, 0.200), 0.118, 0.100, 0.074, 2.0, 2.0)     # round rump
    chest = sd_se(p, (0, -0.064, 0.222), 0.098, 0.088, 0.088, 2.0, 2.0)
    neck = sd_se(p, (0, -0.040, 0.300), 0.104, 0.094, 0.090, 2.2, 2.0)
    d = smin(fore, barrel, 0.06)
    d = smin(d, rump, 0.06)
    d = smin(d, chest, 0.05)
    d = smin(d, neck, 0.05)
    for sx in (-1, 1):
        sh = sd_se(p, (sx * FRONT_LEG[0], FRONT_LEG[1], 0.200), 0.056, 0.055, 0.070, 2.0, 2.0)
        th = sd_se(p, (sx * THIGH[0], THIGH[1], THIGH[2]), THIGH[3], THIGH[4], THIGH[5], 2.0, 2.0)
        d = smin(d, sh, 0.030)
        d = smin(d, th, 0.060)
    return d
BODY_C = np.array([0, 0.040, 0.192])
BODY_AXIS = nrm([0, 0.90, 0.44])
BC, BR = 60, 34
bT = np.radians(warp_lin(np.arange(BR + 1) / BR, [0, .15, .85, 1], [0, 25, 155, 180]))
bF = 2 * PI * np.arange(BC) / BC
BODY_D = frame_dirs(BODY_AXIS, [0, 0.44, -0.90], bT, bF)
BODY_D[0] = BODY_AXIS; BODY_D[-1] = -BODY_AXIS
BODY_P = star_roots(body_sdf, BODY_C, BODY_D, 0.34)

# ================================================================== LEGS
LEGS = {'FL': (FRONT_LEG[0], FRONT_LEG[1], 0.245, 0.049), 'FR': (-FRONT_LEG[0], FRONT_LEG[1], 0.245, 0.049),
        'BL': (HIND_LEG[0], HIND_LEG[1], 0.150, 0.051), 'BR': (-HIND_LEG[0], HIND_LEG[1], 0.150, 0.051)}
PAW = dict(w=0.066, l=0.068, h=0.040)
def sd_cone_capsule(p, a, b, ra, rb):
    a = np.asarray(a, np.float64); b = np.asarray(b, np.float64)
    pa = p - a; ba = b - a; h = clamp01(dot(pa, ba) / dot(ba, ba))
    return length(pa - h[..., None] * ba) - (ra + (rb - ra) * h)
def leg_sdf_factory(x0, y0, ztop, r):
    sx = 1 if x0 > 0 else -1
    hind = y0 > 0
    def f(p):
        col = sd_capsule(p, (x0, y0, 0.065), (x0, y0, ztop), r)
        if hind:
            # the leg carries its own haunch-to-column fillet: a copy of the body's thigh mass, 5 mm smaller,
            # so the leg surface leaves the body tangentially (no hock ledge)
            th = sd_se(p, (sx * THIGH[0], THIGH[1], THIGH[2]), THIGH[3] - 0.005, THIGH[4] - 0.005, THIGH[5] - 0.005)
            col = smin(col, th, 0.035)
        heel = sd_se(p, (x0, y0 + 0.014, 0.040), 0.067, 0.054, 0.042, 2.2, 2.4)
        d = smin(col, heel, 0.03)
        toes = None
        for k, ox in enumerate((-0.0335, 0.0, 0.0335)):
            toe = sd_se(p, (x0 + ox + sx * 0.002, y0 - 0.026 + 0.005 * abs(ox) / 0.0335, 0.038),
                        0.0230 if ox == 0 else 0.0245, 0.050, 0.038, 2.0, 2.1)
            toes = toe if toes is None else smin(toes, toe, 0.0035)
        d = smin(d, toes, 0.018)
        d = smax(d, -(p[..., 2] + 0.0026), 0.010)   # flat sole on z = 0
        return d
    return f
LEG_SDF = {k: leg_sdf_factory(*v) for k, v in LEGS.items()}
LC, LR = 22, 22
# cylindrical parameterisation: horizontal rays from the leg axis, one ring per height (dense over the paw)
LEG_Z = warp_lin(np.arange(1, LR) / LR, [0, .22, .55, .80, 1], [0.236, 0.150, 0.075, 0.030, 0.0012])
lF = 2 * PI * np.arange(LC) / LC
LEG_P = {}
LEG_TOP = {}
D_RING = np.stack([np.sin(lF), np.cos(lF), np.zeros_like(lF)], -1)   # phi = 0 at the back (+Y) = seam
for k, (x0, y0, ztop, r) in LEGS.items():
    # the highest ring must sit >= 4 mm inside the body everywhere (no leg cap poking out of the haunch)
    z_hi = 0.236
    while z_hi > 0.15:
        if LEG_SDF[k](np.array([[x0, y0, z_hi]]))[0] < -0.01:          # the slice exists at this height
            ring = star_roots(LEG_SDF[k], (x0, y0, z_hi), D_RING, 0.13, K=140)
            if (body_sdf(ring) < -0.003).all(): break
        z_hi -= 0.004
    LEG_TOP[k] = z_hi
    zs = warp_lin(np.arange(1, LR) / LR, [0, .22, .55, .80, 1], [z_hi, 0.150, 0.075, 0.030, 0.0012])
    P = np.zeros((LR + 1, LC, 3))
    P[0] = (x0, y0, z_hi + 0.02)                       # top pole, buried in the body
    for j, zj in enumerate(zs, start=1):
        cy = y0 - 0.006 * sstep(0.10, 0.04, zj)        # slice centre follows the paw
        P[j] = star_roots(LEG_SDF[k], (x0, cy, zj), D_RING, 0.13, K=140)
    P[LR] = (x0, y0 - 0.006, 0.0)                      # sole centre
    assert (body_sdf(P[0][None]) < 0).all()
    LEG_P[k] = P
print('LEG_TOP', {k: round(v, 3) for k, v in LEG_TOP.items()}, flush=True)

# ================================================================== TAIL
TAIL_C = np.array([0, 0.250, 0.234])
TAIL_AX = nrm([0, 0.75, 0.66])
def tail_sdf(p):
    R = np.stack([[1, 0, 0], np.cross(TAIL_AX, [1, 0, 0]), TAIL_AX], 1)
    return sd_se(p, TAIL_C, 0.036, 0.034, 0.039, 2.0, 2.0, R=R)
TC, TR = 18, 12
tT = np.radians(np.linspace(0, 180, TR + 1)); tF = 2 * PI * np.arange(TC) / TC
TAIL_D = frame_dirs(TAIL_AX, [1, 0, 0], tT, tF); TAIL_D[0] = TAIL_AX; TAIL_D[-1] = -TAIL_AX
TAIL_P = star_roots(tail_sdf, TAIL_C - 0.012 * TAIL_AX, TAIL_D, 0.10)

# ================================================================== COLLAR
COLLAR_C = np.array([0, -0.030, 0.303])
COLLAR_TILT = math.radians(8.5)                  # front lower than back
COLLAR_N = rot([1, 0, 0], COLLAR_TILT) @ np.array([0, 0, 1.])
COLLAR_FWD = rot([1, 0, 0], COLLAR_TILT) @ np.array([0, -1., 0])
COLLAR_HH, COLLAR_HT = 0.0175, 0.0062            # half height, half thickness
CC, CRS = 48, 8
cphi = 2 * PI * np.arange(CC) / CC
def collar_ring_radius():
    rad = np.zeros(CC)
    for i, ph in enumerate(cphi):
        dvec = math.cos(ph) * COLLAR_FWD + math.sin(ph) * np.array([1., 0, 0])
        best = 0
        for hh in (-COLLAR_HH, 0, COLLAR_HH):
            c = COLLAR_C + hh * COLLAR_N
            P = star_roots(body_sdf, c, dvec[None], 0.25, K=160)[0]
            best = max(best, length(P - c))
        rad[i] = best
    # smooth the ring radius
    for _ in range(3): rad = .25 * np.roll(rad, 1) + .5 * rad + .25 * np.roll(rad, -1)
    return rad
COLLAR_RAD = collar_ring_radius()
ca = 2 * PI * np.arange(CRS) / CRS
PH, AA = np.meshgrid(cphi, ca, indexing='xy')         # (CRS, CC)
radial = (COLLAR_RAD[None, :] + 0.0022) + COLLAR_HT * spow(np.cos(AA), 0.55)
height = COLLAR_HH * spow(np.sin(AA), 0.45)
dirs = (np.cos(PH)[..., None] * COLLAR_FWD + np.sin(PH)[..., None] * np.array([1., 0, 0]))
COLLAR_P = COLLAR_C + radial[..., None] * dirs + height[..., None] * COLLAR_N
COLLAR_AA = AA

# ================================================================== TAG + RING
COLLAR_FRONT = COLLAR_P[:, 0].mean(0)
TAG_R, TAG_T = 0.0275, 0.0070
TAG_C = COLLAR_FRONT + np.array([0, -0.010, -0.0175 - 0.010 - TAG_R])
# hang it just in front of the chest bib
TAG_C[1] = min(TAG_C[1], ray_y(body_sdf, 0.0, TAG_C[2]) - TAG_T - TAG_R * math.sin(math.radians(20)) - 0.003)
# tag faces forward, hanging slightly tilted to follow the chest
TAG_N = rot([0, 0, 1], math.radians(20)) @ nrm([0, -1, 0.18])
def tag_points(TR_=8, TC_=24):
    T = np.radians(np.linspace(0, 180, TR_ + 1)); F = 2 * PI * np.arange(TC_) / TC_
    TT, FF = np.meshgrid(T, F, indexing='ij')
    dz = np.cos(TT); st = np.sin(TT)
    # local: thickness axis = -TAG_N (pole = front face centre)
    rr = TAG_R * spow(st, 0.30)
    hh = TAG_T * spow(dz, 0.60)
    ex = nrm(np.cross([0, 0, 1.], TAG_N)); ey = nrm(np.cross(TAG_N, ex))
    P = TAG_C + (hh[..., None] * TAG_N + rr[..., None] * (np.cos(FF)[..., None] * ex + np.sin(FF)[..., None] * ey))
    return P
TAG_P = tag_points()
RING_C = TAG_C + np.array([0, 0.002, TAG_R + 0.0065])
def ring_points(RC=12, RS=6, R0=0.0085, r0=0.0032):
    a = 2 * PI * np.arange(RC) / RC; b = 2 * PI * np.arange(RS) / RS
    B_, A_ = np.meshgrid(b, a, indexing='ij')
    ex = np.array([0, 1., 0.]); ez = np.array([0, 0, 1.])
    # ring in the YZ plane (hangs through the collar edge)
    P = RING_C + ((R0 + r0 * np.cos(B_))[..., None] * (np.cos(A_)[..., None] * ez + np.sin(A_)[..., None] * ex)
                  + (r0 * np.sin(B_))[..., None] * np.array([1., 0, 0]))
    return P
RING_P = ring_points()

# ================================================================== ATLAS
CHARTS = {
    'head': (0, 0, 2048, 1024),
    'body': (0, 1024, 1024, 512),
    'eye.L': (1024, 1024, 512, 512), 'eye.R': (1536, 1024, 512, 512),
    'leg.FL': (0, 1536, 256, 512), 'leg.FR': (256, 1536, 256, 512),
    'leg.BL': (512, 1536, 256, 512), 'leg.BR': (768, 1536, 256, 512),
    'ear.L': (1024, 1536, 256, 512), 'ear.R': (1280, 1536, 256, 512),
    'nose': (1536, 1536, 256, 256), 'tail': (1792, 1536, 256, 256),
    'collar': (1536, 1792, 256, 256), 'gold': (1792, 1792, 256, 256),
}
G = 4  # gutter px
def atlas_uv(chart, u, v):
    x, y, w, h = CHARTS[chart]
    return ((x + G + u * (w - 2 * G)) / 2048, (y + G + v * (h - 2 * G)) / 2048)

def grid_lookup(Gd, U, V, kind):
    if kind == 'torus': Gd = np.concatenate([Gd, Gd[:1]], 0)
    Gd = np.concatenate([Gd, Gd[:, :1]], 1)
    R = Gd.shape[0] - 1; C = Gd.shape[1] - 1
    fi = np.clip(U * C, 0, C - 1e-6); fj = np.clip(V * R, 0, R - 1e-6)
    i0 = fi.astype(int); j0 = fj.astype(int)
    ti = (fi - i0)[..., None]; tj = (fj - j0)[..., None]
    a = Gd[j0, i0] * (1 - ti) + Gd[j0, i0 + 1] * ti
    b = Gd[j0 + 1, i0] * (1 - ti) + Gd[j0 + 1, i0 + 1] * ti
    return a * (1 - tj) + b * tj

def fd_normals(P, kind, centre):
    if kind == 'torus':
        du = np.roll(P, -1, 1) - np.roll(P, 1, 1); dv = np.roll(P, -1, 0) - np.roll(P, 1, 0)
    else:
        du = np.roll(P, -1, 1) - np.roll(P, 1, 1)
        dv = np.zeros_like(P); dv[1:-1] = P[2:] - P[:-2]; dv[0] = P[1] - P[0]; dv[-1] = P[-1] - P[-2]
    n = np.cross(du, dv)
    n /= np.maximum(length(n)[..., None], 1e-12)
    flip = dot(n, P - centre) < 0; n[flip] *= -1
    if kind != 'torus':
        n[0] = nrm(P[1].mean(0) * 0 + (P[0, 0] - centre)); n[-1] = nrm(P[-1, 0] - centre)
    return n

PARTS = []   # dict(name, P, kind, chart, group, normals, paint)
def add_part(name, P, kind, chart, group, normals, extra=None):
    PARTS.append(dict(name=name, P=np.asarray(P, np.float64), kind=kind, chart=chart, group=group,
                      N=normals, extra=extra or {}))

add_part('head', HEAD_P, 'sphere', 'head', 'head', sdf_normals(head_full, HEAD_P))
add_part('nose', NOSE_P, 'sphere', 'nose', 'head', fd_normals(NOSE_P, 'sphere', NOSE_C))
for tag in ('L', 'R'):
    P, T, Aa, xr = EAR[tag]
    base, up, fwd, side, L = ear_frame(1 if tag == 'L' else -1)
    add_part('ear.' + tag, P, 'sphere', 'ear.' + tag, 'ear.' + tag,
             fd_normals(P, 'sphere', base + 0.09 * up), dict(T=T, A=Aa, xr=xr))
    EC_ = P.shape[1]; a_cols = ear_ring_angle(np.arange(EC_ + 1) / EC_)
    wgt = 0.35 + 3.0 * np.maximum(0, np.sin(.5 * (a_cols[:-1] + a_cols[1:]))) ** 1.5
    PARTS[-1]['ucols'] = np.concatenate([[0], np.cumsum(wgt) / wgt.sum()])
add_part('body', BODY_P, 'sphere', 'body', 'body', sdf_normals(body_sdf, BODY_P))
for k in LEGS:
    add_part('leg.' + k, LEG_P[k], 'sphere', 'leg.' + k, 'body', sdf_normals(LEG_SDF[k], LEG_P[k]))
add_part('tail', TAIL_P, 'sphere', 'tail', 'tail', sdf_normals(tail_sdf, TAIL_P))
add_part('collar', COLLAR_P, 'torus', 'collar', 'body', fd_normals(COLLAR_P, 'torus', COLLAR_C), dict(A=COLLAR_AA))
add_part('tag', TAG_P, 'sphere', 'gold', 'body', fd_normals(TAG_P, 'sphere', TAG_C))
add_part('tag_ring', RING_P, 'torus', 'gold', 'body', None)

# eyeballs: true spheres, pole on the iris axis
ER_, EC_ = 16, 28
eT = np.radians(warp_lin(np.arange(ER_ + 1) / ER_, [0, .62, 1], [0, 62, 180]))
eF = 2 * PI * np.arange(EC_) / EC_
for tag, E in EYE.items():
    D = frame_dirs(E['ni'], -E['e2'], eT, eF); D[0] = E['ni']; D[-1] = -E['ni']
    P = E['c'] + E['r'] * D
    add_part('eye.' + tag, P, 'sphere', 'eye.' + tag, 'eye.' + tag, D.copy())

# ------------------------------------------------------------------ paint
def fur_colour(n, base='fur'):
    up = clamp01(n[..., 2])
    C = mix(rgb(base), rgb('fur_sheen'), 0.75 * sstep(0.35, 0.95, up))
    C = mix(C, rgb('fur_shade'), 0.55 * sstep(0.2, 0.9, -n[..., 2]))
    return C
def white_colour(n, hi=0.12):
    C = mix(rgb('white'), rgb('white_hi'), hi * sstep(0.4, 0.95, n[..., 2]))
    C = mix(C, rgb('white_shade'), 0.75 * sstep(0.15, 0.9, -n[..., 2]))
    return C
def soft_mask(d, e=0.0011): return 1 - sstep(-e, e, d)

def polyline_dist(px, pz, pts):
    """Distance from points (px,pz) to a 2D polyline (pts: Mx2)."""
    best = np.full(px.shape, 1e9)
    for a, b in zip(pts[:-1], pts[1:]):
        ab = b - a; L2 = ab @ ab
        t = clamp01(((px - a[0]) * ab[0] + (pz - a[1]) * ab[1]) / L2)
        dx = px - (a[0] + t * ab[0]); dz = pz - (a[1] + t * ab[1])
        best = np.minimum(best, np.sqrt(dx * dx + dz * dz))
    return best
def catmull_chain(pts, n=12):
    pts = np.asarray(pts, float); out = []
    P = np.vstack([pts[0], pts, pts[-1]])
    for k in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[k - 1], P[k], P[k + 1], P[k + 2]
        for t in np.linspace(0, 1, n, endpoint=False):
            out.append(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1]); return np.array(out)

# smile ("w"), in W units from the midline / chin
_sm = [(-0.176, 0.146), (-0.160, 0.122), (-0.132, 0.102), (-0.097, 0.092), (-0.052, 0.101),
       (-0.016, 0.121), (0.0, 0.130), (0.016, 0.121), (0.052, 0.101), (0.097, 0.092),
       (0.132, 0.102), (0.160, 0.122), (0.176, 0.146)]
SMILE = catmull_chain([(x * W, ZC + z * W) for x, z in _sm], 10)
PHILTRUM = np.array([(0.0, ZC + 0.130 * W), (0.0, ZC + 0.178 * W)])
def on_face(x, z, lift=0.0006): return np.array([x, ray_y(head_full, x, z) - lift, z])
def smile3():
    """The "w" smile as a 3D curve on the skin; each corner wraps onto the muzzle side and curls up."""
    cx, cz = SMILE[-1]
    wrap = [(cx + 0.013 * t, cz + 0.015 * t ** 2.2) for t in np.linspace(0, 1, 14)[1:]]
    pts2 = [(-x, z) for x, z in wrap[::-1]] + [tuple(q) for q in SMILE] + wrap
    return np.array([on_face(x, z) for x, z in pts2])
SMILE3_W = smile3()
PHIL3 = np.array([on_face(0.0, z) for z in np.linspace(PHILTRUM[0, 1], PHILTRUM[1, 1], 8)])
SMILE3 = SMILE3_W
def brow_pts(s):
    return catmull_chain([(s * (0.195 * W), ZC + 0.522 * W), (s * 0.235 * W, ZC + 0.545 * W),
                          (s * 0.280 * W, ZC + 0.546 * W), (s * 0.318 * W, ZC + 0.526 * W)], 10)
BROWS = {s: brow_pts(s) for s in (-1, 1)}
BLAZE_X = -0.008 * W
def polyline3_dist(P, pts):
    best = np.full(P.shape[:-1], 1e9)
    for a, b in zip(pts[:-1], pts[1:]):
        ab = b - a; t = clamp01(dot(P - a, ab) / max(ab @ ab, 1e-12))
        best = np.minimum(best, length(P - (a + t[..., None] * ab)))
    return best
MUZ_C = (0, -0.170, 0.310); MUZ_A, MUZ_B, MUZ_Cz = 0.200, 0.170, 0.095

def head_white_mask(p):
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    d_muzzle = sd_se(p, MUZ_C, MUZ_A, MUZ_B, MUZ_Cz, 2.0, 2.0)
    d_mid = sd_se(p, (0, -0.215, ZC + 0.24 * W), 0.060, 0.08, 0.040, 2.2, 2.0)
    d_muzzle = smin(d_muzzle, d_mid, 0.02)
    zz = (z - ZC) / W
    hw = W * (0.050 + 0.025 * sstep(0.68, 0.42, zz))
    d_blaze = smax(np.abs(x - BLAZE_X) - hw, y + 0.060, 0.020)
    d_blaze = np.where(z > ZC + 0.10 * W, d_blaze, 1.0)
    w_muz = soft_mask(d_muzzle, 0.0013)
    w_bl = soft_mask(d_blaze + 0.0012, 0.0034)
    return 1 - (1 - w_muz) * (1 - w_bl)

def paint_head(p, n):
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    C = fur_colour(n)
    front = clamp01(-n[..., 1])
    # --- white muzzle (rounded volume), feathered tapered blaze: see head_white_mask
    white = head_white_mask(p)
    C = mix(C, white_colour(n, hi=0.0), white)
    # soft crease shading (painted, no hard light): under the chin and around the muzzle
    chin_shade = sstep(ZC + 0.030, ZC - 0.005, z) * 0.35
    C = mix(C, rgb('white_shade'), chin_shade * white)
    # --- blush on the white jowls (3D blobs)
    for s in (-1, 1):
        bc = np.array([s * 0.315 * W, ray_y(head_full, s * 0.315 * W, ZC + 0.130 * W), ZC + 0.130 * W])
        dd = (((x - bc[0]) / 0.044) ** 2 + ((y - bc[1]) / 0.050) ** 2 + ((z - bc[2]) / 0.026) ** 2)
        facing = sstep(0.0, 0.35, front) * sstep(-0.80, -0.40, n[..., 2])
        C = mix(C, rgb('blush'), 0.92 * (1 - sstep(0.35, 1.0, dd)) * white * facing)
    # --- upper lids: thickness defined in the front view (distance to the projected opening outline)
    for tag, E in EYE.items():
        s_m = eye_coords(p, E)[0]
        ol = open_pts[tag]; ocx = 0.5 * (ol[:, 0].min() + ol[:, 0].max()); ocz = 0.5 * (ol[:, 2].min() + ol[:, 2].max())
        reg = (s_m > -0.003) & (np.abs(x - ocx) < 0.085) & (np.abs(z - ocz) < 0.085) & (front > 0.05)
        if not reg.any(): continue
        d2 = np.full(x.shape, 1.0)
        d2[reg] = polyline_dist(x[reg], z[reg], np.vstack([ol[:, [0, 2]], ol[:1, [0, 2]]]))
        ang = np.arctan2(z - ocz, E['s'] * (x - ocx))     # 0 = outer corner, +pi/2 = top
        top = sstep(-0.05, 0.50, np.sin(ang))
        flick = np.exp(-((ang - 0.12) / 0.15) ** 2) * sstep(0.02, 0.10, E['s'] * (x - ocx))
        lw = 0.0004 + 0.0080 * top ** 1.6 + 0.0045 * flick  # 0.025 W at the top centre, tapering, outer flick
        lid = (1 - sstep(lw - 0.0006, lw + 0.0006, d2)) * reg * np.maximum(sstep(0.0, 0.20, top), flick)
        C = mix(C, rgb('lid'), lid)
    # --- brows, smile, philtrum (front projection), only on front-facing skin
    fz = front > 0.25
    for s, pts in BROWS.items():
        reg = fz & (np.abs(x - pts[:, 0].mean()) < 0.05) & (np.abs(z - pts[:, 1].mean()) < 0.03)
        if reg.any():
            d = np.full(x.shape, 1.0); d[reg] = polyline_dist(x[reg], z[reg], pts)
            t = np.zeros(x.shape); t[reg] = clamp01((x[reg] - pts[0, 0]) / (pts[-1, 0] - pts[0, 0]))
            hwid = 0.0008 + 0.0018 * np.sin(PI * t) ** 0.7
            C = mix(C, rgb('brow'), 0.95 * soft_mask(d - hwid, 0.0008) * reg)
    reg = (np.abs(x) < 0.125) & (z > ZC + 0.02) & (z < ZC + 0.11) & (y < -0.14) & (front > 0.05)
    if reg.any():
        d = np.full(x.shape, 1.0); d[reg] = np.minimum(polyline3_dist(p[reg], SMILE3), polyline3_dist(p[reg], PHIL3))
        C = mix(C, rgb('mouth'), soft_mask(d - 0.0021, 0.0008) * reg)
    return C

def paint_eye(p, E):
    q = p - E['c']; d = q / np.maximum(length(q)[..., None], 1e-12)
    C = np.broadcast_to(rgb('eye_white'), p.shape).copy()
    # lid shadow on the upper white (relative to the opening)
    s_m, X, Y, _ = eye_coords(E['c'] + d * E['r'], E)
    ytop = Y / E['B']
    ang = np.arctan2(Y / E['B'], X / E['A']); top = sstep(-0.35, 0.35, np.sin(ang))
    top = sstep(-0.10, 0.45, np.sin(ang))
    rim_w = 0.0045 * top
    lash = sstep(-rim_w - 0.0006, -rim_w + 0.0006, s_m) * sstep(0.0, 0.3, top)
    C = mix(C, rgb('eye_shadow'), 0.75 * sstep(0.50, 0.95, ytop))
    # iris frame
    ni = E['ni']; e2 = nrm(E['e2'] - dot(E['e2'], ni) * ni); e1 = np.cross(e2, ni)
    if e1[0] * E['s'] < 0: e1 = -e1
    a = np.arctan2(dot(d, e1), dot(d, ni)); b = np.arctan2(dot(d, e2), dot(d, ni))
    IA, IB = math.radians(26.5), math.radians(31.5)
    r = np.sqrt((a / IA) ** 2 + (b / IB) ** 2)
    zt = b / IB
    iris = mix(rgb('iris'), rgb('iris_bot'), sstep(0.0, -0.9, zt))
    iris = mix(iris, rgb('iris_top'), sstep(0.05, 0.85, zt))
    iris = mix(iris, rgb('iris_rim'), 0.85 * sstep(0.86, 1.0, r))
    rays = (np.sin(np.arctan2(b, a) * 30 + r * 9) * .5 + .5) * 0.035 * sstep(0.45, 0.8, r)
    iris = iris * (1 - rays[..., None])
    C = mix(C, iris, 1 - sstep(0.985, 1.015, r))
    pr = np.sqrt((a / (0.70 * IA)) ** 2 + ((b - 0.03 * IB) / (0.84 * IB)) ** 2)
    C = mix(C, rgb('pupil'), 1 - sstep(0.975, 1.025, pr))
    # catchlights in screen space on both eyes: big upper-left, small lower-right
    a_sl = -1.0 if e1[0] > 0 else 1.0           # the 'a' sign of screen-left
    big = ((a - a_sl * 0.30 * IA) / (0.27 * IA)) ** 2 + ((b - 0.52 * IB) / (0.23 * IB)) ** 2
    small = ((a + a_sl * 0.36 * IA) / (0.105 * IA)) ** 2 + ((b + 0.40 * IB) / (0.09 * IB)) ** 2
    C = mix(C, rgb('catch'), np.maximum(1 - sstep(0.85, 1.15, big), 0.92 * (1 - sstep(0.8, 1.2, small))))
    rim = sstep(-0.0024, -0.0012, s_m)
    skin = mix(rgb('fur'), rgb('white'), head_white_mask(E['c'] + d * E['r']))
    C = mix(C, skin, rim * (1 - lash))
    C = mix(C, rgb('lid'), lash)
    return C

def paint_body(p, n):
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    C = fur_colour(n)
    # chest bib: front of the chest, under the collar, rounded U between the front legs
    hw = 0.046 + 0.030 * sstep(0.13, 0.27, z)
    d_bib = smax(np.abs(x) - hw, y - (-0.095 + 0.035 * sstep(0.22, 0.30, z)), 0.03)
    d_bib = smax(d_bib, 0.118 - z, 0.045)
    # belly strip underneath
    d_belly = smax(np.abs(x) - 0.052, z - 0.150, 0.03)
    d_belly = smax(d_belly, y - 0.215, 0.04)
    d_w = smin(d_bib, d_belly, 0.04)
    white = soft_mask(d_w, 0.0014)
    C = mix(C, white_colour(n), white)
    # soft shade where the head and collar overhang the chest
    C = mix(C, rgb('white_shade'), 0.45 * white * sstep(0.235, 0.27, z) * clamp01(-n[..., 1]))
    return C

def paint_leg(p, n, tagk):
    x0, y0 = LEGS[tagk][0], LEGS[tagk][1]
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    C = fur_colour(n)
    ang = np.arctan2(x - x0, -(y - y0))
    zs = 0.094 + 0.005 * np.cos(2 * ang) + 0.003 * np.cos(3 * ang + 0.6)
    sock = soft_mask(z - zs, 0.0013)
    W_ = white_colour(n)
    # toe grooves (painted soft lines between the toe lobes, on the front of the paw)
    sx = 1 if x0 > 0 else -1
    g = 0.0
    for gx in (-0.0168, 0.0168):
        dx = x - (x0 + gx + sx * 0.002)
        g = np.maximum(g, np.exp(-(dx / 0.0028) ** 2) * sstep(-0.005, -0.03, y - y0) * sstep(0.072, 0.050, z))
    W_ = mix(W_, rgb('toe'), 0.70 * g)
    W_ = mix(W_, rgb('pad'), sstep(0.006, 0.0, z) * 0.7)
    C = mix(C, W_, sock)
    return C

def paint_ear(p, n, T, Aa, xr, front_dir):
    C = fur_colour(n)
    frontface = sstep(0.10, 0.30, np.sin(Aa))
    # pink fills the recessed bowl (xr = 1 at the bowl's lip), rounded at both ends
    d = np.abs(xr) - 0.90
    d = smax(d, (T - 0.80) * 3.0, 0.20)
    d = smax(d, (0.05 - T) * 3.0, 0.15)
    ink = (1 - sstep(-0.05, 0.05, d)) * frontface
    pink = mix(rgb('inner_ear'), rgb('inner_ear_edge'), sstep(-0.35, -0.02, d))
    pink = mix(pink, rgb('#F6B6BC'), 0.35 * np.exp(-((xr / 0.45) ** 2 + ((T - 0.40) / 0.25) ** 2)))
    C = mix(C, pink, ink)
    return C

def paint_simple(base, n, light, shade):
    C = mix(rgb(base), rgb(light), 0.6 * sstep(0.3, 0.95, n[..., 2]))
    return mix(C, rgb(shade), 0.6 * sstep(0.1, 0.9, -n[..., 2]))

def paint_collar(p, n, Aa):
    C = mix(rgb('collar'), rgb('collar_hi'), 0.55 * sstep(0.4, 0.95, n[..., 2]))
    C = mix(C, rgb('collar_shade'), 0.55 * sstep(0.1, 0.9, -n[..., 2]))
    return C

def paint_gold(p, n):
    C = mix(rgb('gold'), rgb('gold_hi'), 0.65 * sstep(0.5, 0.98, dot(n, nrm([-0.3, -0.7, 0.65]))))
    C = mix(C, rgb('gold_shade'), 0.6 * sstep(0.2, 0.9, -n[..., 2]))
    return C

def paint_nose(p, n):
    C = np.broadcast_to(rgb('nose'), p.shape).copy()
    hl = sstep(0.55, 0.95, dot(n, nrm([-0.25, -0.55, 0.80])))
    C = mix(C, rgb('nose_hi'), 0.75 * hl)
    return C

atlas = np.zeros((2048, 2048, 3), np.float64); atlas[:] = rgb('fur')
def paint_part(part, U, V):
    if 'ucols' in part:   # texel u -> index-uniform u (the mesh UVs are linear in u between columns)
        n = len(part['ucols']) - 1
        U = np.interp(U, part['ucols'], np.arange(n + 1) / n)
    P = grid_lookup(part['P'], U, V, part['kind'])
    Nn = grid_lookup(part['N'], U, V, part['kind']); Nn /= np.maximum(length(Nn)[..., None], 1e-12)
    nm = part['name']
    if nm == 'head': return paint_head(P, Nn)
    if nm.startswith('eye.'): return paint_eye(P, EYE[nm[-1]])
    if nm == 'body': return paint_body(P, Nn)
    if nm.startswith('leg.'): return paint_leg(P, Nn, nm[4:])
    if nm.startswith('ear.'):
        T = grid_lookup(part['extra']['T'][..., None], U, V, 'sphere')[..., 0]
        xr = grid_lookup(part['extra']['xr'][..., None], U, V, 'sphere')[..., 0]
        return paint_ear(P, Nn, T, ear_ring_angle(U), xr, None)
    if nm == 'collar': return paint_collar(P, Nn, None)
    if nm == 'tag': return paint_gold(P, Nn)
    if nm == 'nose': return paint_nose(P, Nn)
    return fur_colour(Nn)
for part in PARTS:
    if part['name'] == 'tag_ring': continue
    x0, y0, w, h = CHARTS[part['chart']]
    u = np.clip((np.arange(w) + .5 - G) / (w - 2 * G), 0, 1)
    vall = np.clip((np.arange(h) + .5 - G) / (h - 2 * G), 0, 1)
    for r0 in range(0, h, 128):
        U, V = np.meshgrid(u, vall[r0:r0 + 128])
        atlas[y0 + r0:y0 + r0 + U.shape[0], x0:x0 + w] = paint_part(part, U, V)
# the ring uses the gold chart's average
atlas_u8 = np.round(clamp01(atlas) * 255).astype(np.uint8)
def png_chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
atlas_path = os.path.join(ROOT, 'shadow-toy_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas_u8[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 2, 0, 0, 0)) +
            png_chunk(b'IDAT', zlib.compress(raw, 9)) + png_chunk(b'IEND', b''))
img = bpy.data.images.load(atlas_path); img.name = 'Shadow_toy_atlas_2048'; img.pack()
mat = bpy.data.materials.new('Shadow_toy_atlas'); mat.use_nodes = True
bs = mat.node_tree.nodes.get('Principled BSDF')
bs.inputs['Roughness'].default_value = 0.80; bs.inputs['Metallic'].default_value = 0.0
bs.inputs['Specular IOR Level'].default_value = 0.30
tx = mat.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
mat.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])

# ------------------------------------------------------------------ meshes
groups = {}
def build_mesh(part):
    P = part['P']; kind = part['kind']; ch = part['chart']
    if kind == 'sphere':
        R = P.shape[0] - 1; C = P.shape[1]
        verts = [tuple(P[0, 0])] + [tuple(P[j, i]) for j in range(1, R) for i in range(C)] + [tuple(P[R, 0])]
        top = 0; bot = 1 + (R - 1) * C
        vid = lambda j, i: top if j == 0 else (bot if j == R else 1 + (j - 1) * C + (i % C))
        faces = []; uvs = []
        for j in range(R):
            for i in range(C):
                u0, u1, v0, v1 = i / C, (i + 1) / C, j / R, (j + 1) / R
                if 'ucols' in part: u0, u1 = part['ucols'][i], part['ucols'][i + 1]
                if j == 0:
                    faces.append((vid(0, 0), vid(1, i), vid(1, i + 1))); uvs.append((((u0 + u1) / 2, v0), (u0, v1), (u1, v1)))
                elif j == R - 1:
                    faces.append((vid(j, i), vid(R, 0), vid(j, i + 1))); uvs.append(((u0, v0), ((u0 + u1) / 2, v1), (u1, v0)))
                else:
                    faces.append((vid(j, i), vid(j + 1, i), vid(j + 1, i + 1), vid(j, i + 1)))
                    uvs.append(((u0, v0), (u0, v1), (u1, v1), (u1, v0)))
    else:
        R, C = P.shape[0], P.shape[1]
        verts = [tuple(P[j, i]) for j in range(R) for i in range(C)]
        vid = lambda j, i: (j % R) * C + (i % C)
        faces = []; uvs = []
        for j in range(R):
            for i in range(C):
                u0, u1, v0, v1 = i / C, (i + 1) / C, j / R, (j + 1) / R
                faces.append((vid(j, i), vid(j + 1, i), vid(j + 1, i + 1), vid(j, i + 1)))
                uvs.append(((u0, v0), (u0, v1), (u1, v1), (u1, v0)))
    me = bpy.data.meshes.new(part['name']); me.from_pydata(verts, [], faces); me.update()
    uvl = me.uv_layers.new(name='Atlas')
    if part['name'] == 'tag_ring':
        for poly in me.polygons:
            for li in poly.loop_indices: uvl.data[li].uv = atlas_uv('gold', .45, .80)
    else:
        for poly, pts in zip(me.polygons, uvs):
            for li, pt in zip(poly.loop_indices, pts): uvl.data[li].uv = atlas_uv(ch, *pt)
    for poly in me.polygons: poly.use_smooth = True
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(part['name'], me); bpy.context.collection.objects.link(ob)
    me.materials.append(mat)
    groups.setdefault(part['group'], []).append(ob)
    return ob
for part in PARTS: build_mesh(part)

GROUP_NAMES = {'head': 'Shadow_head', 'body': 'Shadow_body', 'ear.L': 'Shadow_ear_L', 'ear.R': 'Shadow_ear_R',
               'eye.L': 'Shadow_eye_L', 'eye.R': 'Shadow_eye_R', 'tail': 'Shadow_tail'}
PIVOTS = {'head': (0, -0.02, 0.335), 'body': (0, 0, 0), 'ear.L': tuple(ear_root(1)), 'ear.R': tuple(ear_root(-1)),
          'eye.L': tuple(EYE['L']['c']), 'eye.R': tuple(EYE['R']['c']), 'tail': tuple(TAIL_C - 0.02 * TAIL_AX)}
objects = []
for g, obs in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs: ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1: bpy.ops.object.join()
    ob = bpy.context.object; ob.name = GROUP_NAMES[g]; ob.data.name = GROUP_NAMES[g]
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    bad = [f for f in bm.faces if f.calc_area() < 1e-12]
    if bad: bmesh.ops.delete(bm, geom=bad, context='FACES')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(ob.data); bm.free()
    bpy.context.scene.cursor.location = PIVOTS[g]
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    for v in ob.data.vertices: assert all(math.isfinite(c) for c in v.co)
    for p in ob.data.polygons: assert all(math.isfinite(c) for c in p.normal)
    ob['phase'] = 'Phase 1; unrigged'; ob['front_axis'] = '-Y'
    objects.append(ob)

# ------------------------------------------------------------------ joints
joints = {
    'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y, character left = +X',
    'root': [0, 0, 0], 'body': [0, 0.055, 0.195], 'neck': COLLAR_C.round(4).tolist(),
    'head': [0, -0.020, 0.335], 'jaw': [0, -0.150, 0.352],
    'eye_L': EYE['L']['c'].round(4).tolist(), 'eye_R': EYE['R']['c'].round(4).tolist(),
    'ear_L': ear_root(1).round(4).tolist(), 'ear_R': ear_root(-1).round(4).tolist(),
    'earTip_L': ear_tip(1).round(4).tolist(), 'earTip_R': ear_tip(-1).round(4).tolist(),
    'legFL': [FRONT_LEG[0], FRONT_LEG[1], 0.215], 'legFR': [-FRONT_LEG[0], FRONT_LEG[1], 0.215],
    'elbowFL': [FRONT_LEG[0], FRONT_LEG[1], 0.125], 'elbowFR': [-FRONT_LEG[0], FRONT_LEG[1], 0.125],
    'pawFL': [FRONT_LEG[0], FRONT_LEG[1] - 0.010, 0.035], 'pawFR': [-FRONT_LEG[0], FRONT_LEG[1] - 0.010, 0.035],
    'legBL': [HIND_LEG[0], HIND_LEG[1], 0.215], 'legBR': [-HIND_LEG[0], HIND_LEG[1], 0.215],
    'kneeBL': [HIND_LEG[0], HIND_LEG[1], 0.120], 'kneeBR': [-HIND_LEG[0], HIND_LEG[1], 0.120],
    'pawBL': [HIND_LEG[0], HIND_LEG[1] - 0.010, 0.035], 'pawBR': [-HIND_LEG[0], HIND_LEG[1] - 0.010, 0.035],
    'tail': (TAIL_C - 0.02 * TAIL_AX).round(4).tolist(),
    'notes': ['Phase 1: no armature or weights.',
              'Eyeballs are true spheres (radius %.3f m) centred at eye_L/R; the iris is painted on the sphere\'s own pole, '
              'turned %.0f deg toward the nose, so eye bones can aim.' % (EYE_R, math.degrees(IRIS_TURN)),
              'Legs are separate closed shells (horizontal rings: elbow/knee loops); the body barrel has rings along the spine.',
              'Ears are separate closed cupped shells with dense rings near the base (bend loop).'],
}
with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)

measure = {
    'eye_opening_front_m': {k: [float(np.ptp(v[:, 0])), float(np.ptp(v[:, 2]))] for k, v in open_pts.items()},
    'eye_opening_side_m': {k: [float(np.ptp(v[:, 1])), float(np.ptp(v[:, 2]))] for k, v in open_pts.items()},
    'eye_opening_y_range': {k: [float(v[:, 1].min()), float(v[:, 1].max())] for k, v in open_pts.items()},
    'eye_A_B': [A0, B0],
}
tri = 0
for ob in objects:
    ob.data.calc_loop_triangles(); n = len(ob.data.loop_triangles); tri += n
    measure['tris_' + ob.name] = n
    print('PART_TRIANGLES', ob.name, n, flush=True)
allv = np.array([ob.matrix_world @ v.co for ob in objects for v in ob.data.vertices])
measure['bounds_min'] = allv.min(0).round(4).tolist(); measure['bounds_max'] = allv.max(0).round(4).tolist()
measure['triangles'] = tri
with open(os.path.join(ROOT, 'measure.json'), 'w', encoding='utf-8') as f: json.dump(measure, f, indent=2)
print('SHADOW_TRIANGLES', tri, flush=True)
assert tri <= 26000, 'triangle budget exceeded: %d' % tri

bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'shadow-toy.blend'))
bpy.ops.export_scene.gltf(filepath=MODEL, export_format='GLB', use_selection=True, export_apply=True,
                          export_yup=True, export_attributes=True, export_vertex_color='ACTIVE',
                          export_lights=False, export_cameras=False, export_animations=False)
print('SHADOW_BUILD_DONE', MODEL, flush=True)
