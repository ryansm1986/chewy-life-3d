# Disney-style Chewy, sculpted with signed-distance forms (see sdf.py). Units: metres, Z up, facing -Y, character's
# left = +X. Symmetric features are written for +X and mirrored. ~1.2 m tall, head ~0.3 m: youthful 4-head proportions.
import numpy as np
from sdf import (V, rot, smin, sphere, ellipsoid, capsule, round_cone, round_box, tube, plane, union, subtract, intersect,
                 shell, offset, mirror_x, smoothstep, _len, _dot, _clamp)

def scaled(f, c, s):
    """evaluate f in a space scaled by s around c (anisotropic squash/stretch of a form)"""
    c, s = V(*c), V(*s)
    return lambda P: f(c + (P - c) / s) * s.min()

# ------------------------------------------------------------------ head
H = V(0, 0, 0.98)              # head centre
HEAD_OFS = V(0, 0, -0.185)     # the head is sculpted at H and placed on the body lower down ...
HEAD_SCALE = 1.12              # ... and a size up: ~3.6 heads tall, like a young Disney lead

def to_world(Q):
    """head sculpt space -> world"""
    return H + (np.asarray(Q, float) - H) * HEAD_SCALE + HEAD_OFS

def to_head(P):
    """world -> head sculpt space"""
    return H + (P - HEAD_OFS - H) / HEAD_SCALE

def moved(f, d):
    d = V(*d)
    return lambda P: f(P - d)

EYE_R = 0.044
EYE = V(0.06, -0.09, 0.998)    # +X eye centre
EYE_ROT = rot(0.05, 0, 0.26)   # eye space: -y looks out (15 deg outward, a touch up)

def tapered(f, y0, y1, sx, sz=1.0):
    """narrow a form in x (and z) as it runs from y0 to y1 (a muzzle getting slimmer toward the nose)"""
    def g(P):
        t = _clamp((P[:, 1] - y0) / (y1 - y0))
        kx = 1 + (sx - 1) * t; kz = 1 + (sz - 1) * t
        Q = P.copy(); Q[:, 0] = P[:, 0] / kx; Q[:, 2] = H[2] + (P[:, 2] - H[2]) / kz
        return f(Q) * np.minimum(kx, kz)
    return g

def _leaf2d(u, v, R0, R1, L):
    """2D uneven capsule from (0,0) radius R0 to (L,0) radius R1 in the (u, v) plane"""
    b = (R0 - R1) / L; a = np.sqrt(1 - b * b)
    k = u * a - np.abs(v) * b
    q = np.stack([np.abs(v), u], -1)
    return np.where(k < 0, _len(q) - R0, np.where(k > a * L, _len(q - V(0, L)) - R1, q @ V(a, b) - R0))

def _slab(d2, w, t, r):
    """extrude a 2D distance into a plate of half-thickness t with rounded rims"""
    dz = np.abs(w) - t
    return _len(np.stack([np.maximum(d2, 0), np.maximum(dz, 0)], -1)) + np.minimum(np.maximum(d2, dz), 0) - r

EAR_BASE, EAR_R, EAR_UF = V(0.086, 0.028, 1.078), rot(-0.12, 0.42, 0.38), 0.074  # lean back a little, tilt out, inner face forward-out

EAR_TH = 2.7  # fold angle of the flap

def ear_plates(P):
    """distances to the two plates of Chewy's rose ear: the standing base and the flap folded forward over it"""
    UF, LF, R0, RF, R1, TH = EAR_UF, 0.085, 0.052, 0.044, 0.026, EAR_TH
    c, s_ = np.cos(TH), np.sin(TH)
    q = (P - EAR_BASE) @ EAR_R
    v, w, u = q[:, 0], -q[:, 1], q[:, 2]   # w > 0 out of the inner (front) face
    lower = -smin(-_slab(_leaf2d(u, v, R0, RF, UF), w + 0.3 * v * v / R0, 0.011, 0.005), -(u - UF), 0.006)
    du = u - UF
    uf = du * c + w * s_; wf = -du * s_ + w * c   # flap frame: rotated TH about the fold line toward the front
    flap = -smin(-_slab(_leaf2d(uf, v, RF, R1, LF), wf + 0.3 * v * v / RF, 0.009, 0.005), uf, 0.006)
    return lower, flap

def ear_leaf():
    """Chewy's rose ear (photo): a cupped plate standing up and out from the top of the skull, and a flap hinged at
    the fold line that falls forward and down. Two exact plates joined by a soft crease (no space warping)."""
    def f(P):
        lower, flap = ear_plates(P)
        return smin(lower, flap, 0.026)  # a soft rolled fold, not a paper crease
    return f

def eye_opening(P):
    """<0 inside the almond window between the lids (eye space: -y looks out)"""
    q = (P - EYE) @ EYE_ROT
    x, y, z = q[:, 0], q[:, 1], q[:, 2]
    upper = z - (0.55 * EYE_R + 0.02 * x - 0.55 * x * x / EYE_R)
    lower = -(z + 0.7 * EYE_R - 0.04 * x - 0.5 * x * x / EYE_R)
    front = -y - 0.15 * EYE_R
    return -np.minimum(np.minimum(-upper, -lower), front)

def eye_lids():
    """lids: a shell round the eyeball cut open by an almond window; the upper lid rests on the top of the iris"""
    lid = shell(sphere(EYE, EYE_R + 0.0065), 0.0048)
    return lambda P: -smin(-lid(P), eye_opening(P), 0.006)  # rounded lid rims

NOSE = union(ellipsoid((0, -0.226, 0.967), (0.03, 0.021, 0.018), rot(-0.25, 0, 0)), ellipsoid((0, -0.227, 0.953), (0.018, 0.017, 0.013)), k=0.014)
MOUTH = tube([(0, -0.227, 0.918), (0.02, -0.215, 0.921), (0.037, -0.197, 0.928), (0.05, -0.175, 0.941), (0.056, -0.158, 0.953), (0.055, -0.148, 0.96)],  # the smile line
             [0.0034, 0.0034, 0.0032, 0.0028, 0.002, 0.001])
LIP_X, LIP_Z = [0, 0.02, 0.037, 0.05, 0.056], [0.918, 0.921, 0.928, 0.941, 0.953]
def lip_z(ax):
    """height of the parting between the lips across the muzzle (the smile line, extruded back into the head)"""
    return np.interp(ax, LIP_X, LIP_Z)
MOUTH_GAP = 0.0018  # half the parting: the lips meet with a 3.6 mm dark line, and open cleanly when the jaw drops
CAVITY = ellipsoid((0, -0.172, 0.921), (0.036, 0.048, 0.013))

def mouth_slit(P):
    """the parting between the lips: a thin sheet at lip_z from the lips back to the cavity, closing at the corners"""
    ax, y, z = np.abs(P[:, 0]), P[:, 1], P[:, 2]
    d = np.abs(z - lip_z(ax)) - MOUTH_GAP * (1 - 0.35 * smoothstep(0.045, 0.058, ax))
    # a small rounded pocket at each corner (a parting that tapered to nothing left a skin web that tore into spikes)
    return -smin(-np.maximum(d, y + 0.128), -(ax - 0.058), 0.004)

def mouth_space(P):
    """<0 inside the mouth (parting + cavity): no fur there, and the lining is painted"""
    return np.minimum(mouth_slit(P), CAVITY(P))

TONGUE = ellipsoid((0, -0.176, 0.9112), (0.022, 0.032, 0.0036))  # lies in the floor of the mouth, below the parting
JAW_PIVOT = V(0, -0.045, 0.93)          # sculpt space: the lower jaw swings round this (behind the mouth corners)
LIP_CORNER = V(0.056, -0.158, 0.953)
BROW = V(0.06, -0.093, 1.048)

def head_sdf():
    cranium = ellipsoid((0, 0.02, 1.01), (0.12, 0.122, 0.118))
    face = ellipsoid((0, -0.056, 0.99), (0.084, 0.08, 0.085))  # stays inside the skull at the sides: only the front projects
    cheek = ellipsoid((0.06, -0.068, 0.935), (0.043, 0.04, 0.037))
    orbit = ellipsoid((0.054, -0.072, 0.998), (0.05, 0.043, 0.047))  # seats the eye and its lids in the face
    brow = ellipsoid((0.06, -0.093, 1.048), (0.038, 0.02, 0.011), rot(0, 0.22, 0.3))
    bridge = round_cone((0, -0.08, 1.0), (0, -0.205, 0.968), 0.036, 0.024)
    muzzle = scaled(round_cone((0, -0.085, 0.955), (0, -0.2, 0.947), 0.05, 0.031), (0, -0.14, 0.952), (1.0, 1.0, 0.85))
    flew = ellipsoid((0.025, -0.175, 0.926), (0.027, 0.045, 0.021), rot(0.12, 0, 0.12))
    chin = ellipsoid((0, -0.142, 0.905), (0.029, 0.048, 0.019), rot(0.15, 0, 0))
    socket = sphere(EYE, EYE_R + 0.003)
    nose = NOSE
    nostril = tube([(0.007, -0.246, 0.961), (0.017, -0.243, 0.962), (0.025, -0.233, 0.956)], [0.0034, 0.0038, 0.0022])
    philtrum = capsule((0, -0.244, 0.949), (0, -0.228, 0.919), 0.0026)
    s = union(cranium, face, k=0.03)  # a wide blend of two near-coincident surfaces bulges into a ridge
    s = union(s, mirror_x(cheek), k=0.065)
    s = union(s, mirror_x(orbit), k=0.04)
    s = union(s, bridge, muzzle, k=0.045)
    s = union(s, mirror_x(flew), chin, k=0.028)
    s = subtract(s, mirror_x(socket), k=0.008)
    s = union(s, mirror_x(eye_lids()), k=0.005)
    s = union(s, nose, k=0.004)
    s = subtract(s, mirror_x(nostril), k=0.002)
    s = subtract(s, philtrum, k=0.004)
    s = subtract(s, mouth_space, k=0.002)  # a real mouth: lips that part, a cavity behind
    s = union(s, mirror_x(ear_leaf()), k=0.028)
    return s


def torus_y(c, R, r, sx=1.0, sy=1.0):
    """horizontal ring (a cuff, a waistband) round the vertical axis through c, optionally elliptical"""
    c = V(*c)
    def f(P):
        q = P - c
        rho = np.sqrt((q[:, 0] / sx) ** 2 + (q[:, 1] / sy) ** 2)
        return np.sqrt((rho - R) ** 2 + q[:, 2] ** 2) - r
    return f

def ring_path(c, rx, ry, z_front, z_back, n=24):
    """points round the neck, lower at the front than at the back"""
    t = np.linspace(0, 2 * np.pi, n + 1)
    return [(c[0] + rx * np.sin(a), c[1] - ry * np.cos(a), z_back + (z_front - z_back) * (0.5 + 0.5 * np.cos(a))) for a in t]

# ------------------------------------------------------------------ body
NECK = capsule((0, 0.012, 0.56), (0, -0.01, 0.68), 0.05)
CHEST = ellipsoid((0, 0.0, 0.53), (0.116, 0.088, 0.104))
BELLY = ellipsoid((0, -0.004, 0.4), (0.104, 0.086, 0.092))  # a waist, not a belly
ARM_P, ARM_R = [V(0.106, 0.0, 0.59), V(0.15, 0.014, 0.47), V(0.172, -0.008, 0.37)], [0.04, 0.033, 0.029]
LEG_P, LEG_R = [(0.062, 0.0, 0.35), (0.067, -0.012, 0.2), (0.071, 0.004, 0.08)], [0.058, 0.044, 0.036]
TORSO = union(union(CHEST, BELLY, k=0.08), NECK, k=0.045)

def body_sdf():
    arm = tube(ARM_P, ARM_R)
    palm = ellipsoid((0.178, -0.02, 0.33), (0.033, 0.031, 0.04), rot(0, 0.12, 0))
    fingers = union(*[round_cone((0.174 + dx * 0.9, -0.033 + dy * 0.9, 0.308), (0.176 + dx * 1.04, -0.038 + dy * 1.12, 0.279), 0.013, 0.011)
                      for dx, dy in ((-0.022, -0.004), (-0.0072, -0.012), (0.0082, -0.012), (0.023, -0.004))], k=0.004)
    thumb = round_cone((0.163, -0.044, 0.338), (0.155, -0.058, 0.316), 0.012, 0.0098)
    hand = union(palm, fingers, thumb, k=0.01)
    leg = tube(LEG_P, LEG_R)
    foot = ellipsoid((0.073, -0.03, 0.037), (0.05, 0.078, 0.037))
    toes = union(*[ellipsoid((0.073 + dx, -0.098 + abs(dx) * 0.4, 0.023), (0.016, 0.02, 0.021)) for dx in (-0.03, -0.0102, 0.0102, 0.03)], k=0.004)
    paw = union(foot, toes, k=0.012)
    tail = tube([(0, 0.09, 0.36), (0, 0.17, 0.33), (0.0, 0.24, 0.38), (0.012, 0.28, 0.47), (0.03, 0.27, 0.55)], [0.032, 0.04, 0.038, 0.027, 0.008])
    s = union(TORSO, mirror_x(arm), k=0.035)
    s = union(s, mirror_x(hand), k=0.018)
    s = union(s, mirror_x(leg), k=0.05)
    s = union(s, mirror_x(paw), k=0.025)
    s = union(s, tail, k=0.035)
    return s

# ------------------------------------------------------------------ costume (concept art): navy gi, red sash + scarf,
# charcoal pants gathered at the calf, bandaged forearms
def _axis_t(P, a, b):
    ba = b - a
    return ((P - a) @ ba) / (ba @ ba)

def _trapezoid(px, py, r1, r2, he):
    """2D isosceles trapezoid (IQ): half-width r1 at py = -he, r2 at py = +he"""
    px = np.abs(px)
    cax = px - np.minimum(px, np.where(py < 0, r1, r2)); cay = np.abs(py) - he
    k1x, k1y, k2x, k2y = r2, he, r2 - r1, 2 * he
    h = _clamp(((k1x - px) * k2x + (k1y - py) * k2y) / (k2x * k2x + k2y * k2y))
    cbx = px - k1x + k2x * h; cby = py - k1y + k2y * h
    sgn = np.where((cbx < 0) & (cay < 0), -1.0, 1.0)
    return sgn * np.sqrt(np.minimum(cax * cax + cay * cay, cbx * cbx + cby * cby))

def strip(a, b, w0, w1, t, face=(0, -1, 0), r=0.0018):
    """a flat cloth panel from a to b, tapering from width w0 to w1, thickness t, facing roughly `face`"""
    a, b = V(*a), V(*b); u = b - a; L = np.linalg.norm(u); u = u / L
    n = V(*face); n = n - u * (n @ u); n = n / np.linalg.norm(n); v = np.cross(n, u)
    def f(P):
        q = P - a
        return _slab(_trapezoid(q @ v, q @ u - L / 2, w0 / 2, w1 / 2, L / 2), q @ n, t / 2, r)
    return f

def trace(f, starts, dirs, lo=0.0, hi=0.25, it=30):
    """where the rays start + s * dir first leave the solid f (bisection on s): points on a garment's surface"""
    starts, dirs = np.asarray(starts, float), np.asarray(dirs, float)
    a, b = np.full(len(starts), lo), np.full(len(starts), hi)
    for _ in range(it):
        m = 0.5 * (a + b); inside = f(starts + dirs * m[:, None]) < 0
        a = np.where(inside, m, a); b = np.where(inside, b, m)
    return starts + dirs * (0.5 * (a + b))[:, None]

def gi_sdf():
    upper_arm = mirror_x(round_cone(ARM_P[0], ARM_P[0] + (ARM_P[1] - ARM_P[0]) * 1.1, ARM_R[0], ARM_R[1]))
    trunk = union(union(CHEST, BELLY, k=0.08), ellipsoid((0, 0.004, 0.36), (0.128, 0.104, 0.088)), k=0.05)  # hips: the skirt hangs over the pants
    core = union(trunk, upper_arm, k=0.05)
    def f(P):
        z = P[:, 2]
        # cinched at the waist under the sash, flaring out into a skirt below it, snug round the neckline
        loose = 0.02 + 0.018 * smoothstep(0.37, 0.29, z) - 0.006 * smoothstep(0.46, 0.42, z) * smoothstep(0.35, 0.38, z) - 0.012 * smoothstep(0.57, 0.64, z)
        ang = np.arctan2(P[:, 0], -P[:, 1])
        Pm = np.abs(P[:, 0]); y = P[:, 1]
        Q = np.concatenate([Pm[:, None], P[:, 1:]], -1)
        t = _axis_t(Q, ARM_P[0], ARM_P[1])
        on_sleeve = smoothstep(0.004, -0.004, upper_arm(P) - trunk(P)) * smoothstep(0.43, 0.47, z)
        front = smoothstep(-0.04, -0.08, y)
        folds = 0.0022 * np.sin(ang * 11 + 3 * z) * smoothstep(0.37, 0.33, z) * smoothstep(0.292, 0.315, z)  # skirt folds, a clean hem
        folds += 0.0019 * np.sin((Pm * 0.9 - (z - 0.43)) * 70) * front * smoothstep(0.43, 0.46, z) * smoothstep(0.58, 0.53, z) \
            * smoothstep(0.015, 0.035, Pm) * smoothstep(0.13, 0.1, Pm)                      # drape folds fanning from the belt
        folds += 0.0013 * np.sin(ang * 23) * (smoothstep(0.425, 0.435, z) * smoothstep(0.465, 0.445, z)
                                              + smoothstep(0.35, 0.36, z) * smoothstep(0.38, 0.372, z))   # bunched at the sash
        arm_ang = np.arctan2(Q[:, 1] - ARM_P[0][1], Q[:, 0] - ARM_P[0][0])
        folds += 0.0018 * np.sin(arm_ang * 5 + t * 14) * on_sleeve * smoothstep(0.1, 0.3, t) * smoothstep(0.7, 0.6, t)  # sleeve folds
        c = core(P) + folds  # displace the surface the cloth hangs from, so both faces of the cloth move together
        bead = 0.0018 * (smoothstep(0.305, 0.294, z) + on_sleeve * smoothstep(0.66, 0.715, t))   # rolled hems
        stitch = 0.0007 * np.exp(-((z - 0.311) / 0.0011) ** 2)                                   # stitch line above the hem
        under = 0.0016 * front * smoothstep(0.003, -0.003, P[:, 0] - (-0.004 - 0.32 * (0.47 - z))) * smoothstep(0.48, 0.46, z)  # overlap step
        cloth = np.maximum(c - loose - 0.0075 - bead + stitch + under, -(c - loose))  # a 7.5 mm layer standing off the body
        # openings: neckline (a V at the front), hem, sleeves ending above the elbow
        v_cut = np.minimum(0.004 + 0.52 * (z - 0.47) - Pm, -y - 0.03)        # >0 inside the V opening
        top = z - (0.655 - 0.03 * smoothstep(-0.02, -0.09, y))                 # neckline, lower at the front
        hem = 0.292 - z
        sleeve = np.where((upper_arm(P) < trunk(P)) & (z > 0.4), t - 0.72, -1.0)  # only the sleeve (not the skirt beside the arm)
        cut = np.maximum.reduce([v_cut, top, hem, sleeve])
        return -smin(-cloth, -cut, 0.004)  # smooth max: cloth minus the openings
    # collar band along the real V edge and round the neckline, traced onto the cloth's outer surface
    def outer(P):
        z = P[:, 2]
        loose = 0.02 - 0.012 * smoothstep(0.57, 0.64, z)
        return core(P) - loose - 0.0075
    zs = np.linspace(0.472, 0.64, 12)
    xs = 0.004 + 0.52 * (zs - 0.47) + 0.006
    v_pts = trace(outer, np.stack([xs, np.zeros_like(zs), zs], -1), np.tile(V(0, -1, 0), (len(zs), 1)))
    ang = np.linspace(0.5, np.pi, 10)
    n_dirs = np.stack([np.sin(ang), -np.cos(ang), np.zeros_like(ang)], -1)
    n_pts = trace(outer, np.tile(V(0, 0, 0.65), (len(ang), 1)), n_dirs)
    path = np.concatenate([v_pts, n_pts]) - np.concatenate([v_pts * 0 + V(0, -1, 0), n_dirs]) * 0.004  # half sunk into the cloth
    collar = mirror_x(tube([tuple(p) for p in path], [0.012] * len(path)))
    return union(f, collar, k=0.006)

def gi_sleeve_mask(P):
    """points of the gi that belong to a sleeve (closer to the upper arm than to the trunk, above the waist)"""
    upper_arm = mirror_x(round_cone(ARM_P[0], ARM_P[0] + (ARM_P[1] - ARM_P[0]) * 1.1, ARM_R[0], ARM_R[1]))
    trunk = union(union(CHEST, BELLY, k=0.08), ellipsoid((0, 0.004, 0.36), (0.128, 0.104, 0.088)), k=0.05)
    return (upper_arm(P) < trunk(P)) & (P[:, 2] > 0.45)

def sash_sdf():
    trunk = union(union(CHEST, BELLY, k=0.08), ellipsoid((0, 0.004, 0.36), (0.128, 0.104, 0.088)), k=0.05)
    def ribs(P):  # two soft folds running round the wrapped band
        z = P[:, 2]
        return 0.0012 * (np.exp(-((z - 0.392) / 0.0025) ** 2) + np.exp(-((z - 0.411) / 0.0025) ** 2))
    band = intersect(lambda P: np.abs(trunk(P) - 0.034) - 0.0095 + ribs(P), lambda P: np.abs(P[:, 2] - 0.401) - 0.027, k=0.006)
    knot = round_box((0.058, -0.137, 0.402), (0.016, 0.009, 0.017), 0.007, rot(0, 0.25, 0.1))
    tails = union(strip((0.053, -0.142, 0.392), (0.036, -0.152, 0.282), 0.03, 0.038, 0.006, (0, -1, 0)),
                  strip((0.064, -0.14, 0.392), (0.091, -0.146, 0.296), 0.028, 0.035, 0.006, (0.15, -1, 0)), k=0.004)
    return union(band, knot, tails, k=0.006)

def scarf_sdf():
    # a folded neckerchief: a flat cloth band standing off the neck, sloping down to a knot at the front
    def band(P):
        zc = 0.646 + 0.034 * smoothstep(-0.09, 0.07, P[:, 1])
        a = np.arctan2(P[:, 0], -P[:, 1])
        cloth = np.abs(NECK(P) - 0.021 - 0.0016 * np.sin(a * 9 + P[:, 2] * 90)) - 0.0062  # twisted cloth
        return -smin(-cloth, -(np.abs(P[:, 2] - zc) - 0.021), 0.006)
    knot = round_box((0, -0.1, 0.621), (0.015, 0.009, 0.014), 0.008)
    tails = mirror_x(strip((0.008, -0.106, 0.61), (0.036, -0.118, 0.54), 0.034, 0.008, 0.005, (0, -1, 0.15)))  # bandana points
    return union(band, knot, tails, k=0.008)

def pants_sdf():
    hips = ellipsoid((0, 0.004, 0.362), (0.122, 0.098, 0.084))
    leg = tube([(0.064, 0.0, 0.34), (0.072, -0.01, 0.23), (0.076, 0.0, 0.165), (0.074, 0.004, 0.13)], [0.072, 0.07, 0.064, 0.043])
    s = union(hips, mirror_x(leg), k=0.05)
    cuff = mirror_x(torus_y((0.074, 0.004, 0.128), 0.04, 0.01))
    def f(P):
        z = P[:, 2]
        ang = np.arctan2(P[:, 0] - np.sign(P[:, 0]) * 0.08, -P[:, 1])
        d = s(P) + 0.003 * np.sin(ang * 7 + 18 * z) * smoothstep(0.34, 0.2, z) * smoothstep(0.13, 0.17, z)  # baggy folds
        d += 0.0019 * np.sin(ang * 17) * smoothstep(0.13, 0.14, z) * smoothstep(0.185, 0.155, z)            # gathered into the cuff
        d += 0.0017 * np.sin((z - 0.2) * 150 + 2.5 * ang) * smoothstep(0.17, 0.2, z) * smoothstep(0.27, 0.23, z) \
            * smoothstep(0.9, 0.2, np.abs(ang))                                                              # knee wrinkles
        side = np.sign(P[:, 0]) * ang
        d += 0.0008 * np.exp(-((side - np.pi / 2) / 0.05) ** 2) * smoothstep(0.14, 0.17, z)                 # side seams
        d += 0.0008 * np.exp(-(P[:, 0] / 0.0035) ** 2) * smoothstep(-0.07, -0.1, P[:, 1]) * smoothstep(0.3, 0.33, z)  # front crease
        d = np.maximum(d, z - 0.415)
        return np.maximum(d, 0.118 - z)
    return union(f, cuff, k=0.008)

def wraps_sdf():
    a, b = ARM_P[1], ARM_P[2]
    L = np.linalg.norm(b - a)
    e1 = np.cross(b - a, V(0, 0, 1)); e1 /= np.linalg.norm(e1); e2 = np.cross((b - a) / L, e1)
    def f(P):
        Q = np.concatenate([np.abs(P[:, :1]), P[:, 1:]], -1)
        t = _axis_t(Q, a, b)
        axis = a + (b - a) * _clamp(t)[:, None]
        d = _len(Q - axis) - (ARM_R[1] + (ARM_R[2] - ARM_R[1]) * _clamp(t) + 0.0045)
        r = Q - axis; ang = np.arctan2(r @ e2, r @ e1)
        d = d + 0.0016 * np.abs(np.sin(ang / 2 + t * L / 0.014 * np.pi))  # spiral bandage turns
        return np.maximum(d, np.maximum(0.12 - t, t - 1.02))
    return f

# ------------------------------------------------------------------ colour (linear RGB) and roughness per vertex
def _lin(h):
    c = np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
FUR, FUR_LIGHT, CREAM = _lin('#46271a'), _lin('#6a3f29'), _lin('#efe4d6')
NOSE_C, LID_C, EAR_IN, PAD = _lin('#3a1d1a'), _lin('#26140f'), _lin('#6d3a30'), _lin('#3a2320')
MOUTH_IN, TONGUE_C = _lin('#4a1a1e'), _lin('#d8707a')

def _mix(c, col, k):
    return c + (col - c) * k[:, None]

def head_color(Q):
    """colour of the head surface at sculpt-space points Q"""
    P = np.concatenate([np.abs(Q[:, :1]), Q[:, 1:]], -1); y, z = P[:, 1], P[:, 2]
    c = np.tile(FUR, (len(P), 1)); rough = np.full(len(P), 0.6)
    c = _mix(c, FUR_LIGHT, 0.8 * smoothstep(-0.105, -0.15, y) * smoothstep(0.99, 0.972, z))   # tan muzzle
    c = _mix(c, FUR_LIGHT, 0.5 * smoothstep(0.02, 0.0, ellipsoid((0.064, -0.075, 0.935), (0.05, 0.047, 0.038))(P)))  # cheeks
    c = _mix(c, CREAM, smoothstep(0.93, 0.912, z) * smoothstep(-0.08, -0.115, y))               # white chin
    q = (P - EAR_BASE) @ EAR_R
    inner = smoothstep(0.004, 0.0, ear_leaf()(P)) * (q[:, 2] < EAR_UF - 0.004) * smoothstep(0.0, -0.004, q[:, 1])
    c = _mix(c, EAR_IN, 0.9 * inner)
    rim = smoothstep(0.0035, 0.0012, np.abs(eye_opening(P))) * (_len(P - EYE) < EYE_R + 0.014)
    c = _mix(c, LID_C, rim)
    c = _mix(c, MOUTH_IN, smoothstep(0.0025, 0.0005, mouth_space(P)))  # lining and the lip edges
    nose = smoothstep(0.0022, 0.0006, NOSE(P))
    c = _mix(c, NOSE_C, nose); rough = rough + (0.28 - rough) * nose
    return c, rough

def eye_color(Q):
    P = np.concatenate([np.abs(Q[:, :1]), Q[:, 1:]], -1)
    q = (P - EYE) @ EYE_ROT
    q = q / _len(q)[:, None]
    ang = np.arccos(np.clip(-q[:, 1] * np.cos(0.1) + q[:, 2] * np.sin(0.1), -1, 1))  # angle from the gaze (a hair down)
    phi = np.arctan2(q[:, 2], q[:, 0])
    iris_r, pupil_r = 0.86, 0.4  # a dog shows almost no white: the iris fills the opening
    t = _clamp(ang / iris_r)
    iris = _lin('#f0b040') + (_lin('#9a4e10') - _lin('#f0b040')) * (t ** 1.4)[:, None]   # warm amber, darker to the rim
    iris = iris * (0.88 + 0.12 * np.sin(phi * 23 + 3 * np.sin(phi * 7)))[:, None]       # radial fibres
    c = np.tile(_lin('#f3eee6'), (len(P), 1))
    c = _mix(c, iris, smoothstep(iris_r + 0.03, iris_r - 0.01, ang))
    c = _mix(c, _lin('#2a1206'), smoothstep(iris_r - 0.1, iris_r, ang) * (ang < iris_r + 0.02))  # limbal ring
    c = _mix(c, _lin('#070504'), smoothstep(pupil_r + 0.02, pupil_r - 0.01, ang))
    return c, np.full(len(P), 0.05)

def body_color(P):
    x, y, z = np.abs(P[:, 0]), P[:, 1], P[:, 2]
    c = np.tile(FUR, (len(P), 1)); rough = np.full(len(P), 0.6)
    w = 0.015 + 0.06 * smoothstep(0.5, 0.7, z)
    blaze = smoothstep(w + 0.01, w, x) * smoothstep(-0.03, -0.06, y) * smoothstep(0.4, 0.46, z)
    c = _mix(c, CREAM, blaze)                                                    # white chest blaze + throat
    c = _mix(c, PAD, smoothstep(0.012, 0.004, z))                                # paw pads
    return c, rough

def flat(hexcol, rough=0.8):
    col = _lin(hexcol)
    return lambda P: (np.tile(col, (len(P), 1)), np.full(len(P), rough))

# ------------------------------------------------------------------ parts
def parts():
    """dicts: name, sdf, box (lo, hi), cell size h, material kind, colour(P) -> (rgb, roughness)"""
    o, k = HEAD_OFS, HEAD_SCALE
    place = lambda f: moved(scaled(f, H, (k, k, k)), o)       # sculpted round H, grown by k, moved onto the neck
    unplace = lambda P: H + (P - o - H) / k                     # world -> sculpt space (for the colour masks)
    box = lambda lo, hi: (tuple(H + (V(*lo) - H) * k + o), tuple(H + (V(*hi) - H) * k + o))
    return [
        dict(name='head', f=place(head_sdf()), box=box((-0.27, -0.28, 0.8), (0.27, 0.2, 1.32)), h=0.0016, mat='fur', color=lambda P: head_color(unplace(P))),
        dict(name='tongue', f=place(TONGUE), box=box((-0.04, -0.23, 0.89), (0.04, -0.13, 0.93)), h=0.0009, mat='skin', color=flat('#d8707a', 0.35)),
        dict(name='eyes', f=place(mirror_x(sphere(EYE, EYE_R))), box=box((-0.11, -0.14, 0.94), (0.11, -0.04, 1.05)), h=0.0011, mat='eye', color=lambda P: eye_color(unplace(P))),
        dict(name='body', f=body_sdf(), box=((-0.27, -0.17, -0.01), (0.27, 0.33, 0.75)), h=0.0035, mat='fur', color=body_color),
        dict(name='gi', f=gi_sdf(), box=((-0.29, -0.2, 0.25), (0.29, 0.19, 0.7)), h=0.0028, mat='cloth', color=flat('#243056'), skin=gi_sleeve_mask),
        dict(name='sash', f=sash_sdf(), box=((-0.23, -0.2, 0.26), (0.23, 0.2, 0.45)), h=0.0024, mat='cloth', color=flat('#b8322a', 0.7)),
        dict(name='scarf', f=scarf_sdf(), box=((-0.13, -0.16, 0.5), (0.13, 0.12, 0.73)), h=0.0022, mat='cloth', color=flat('#c63d2e', 0.7)),
        dict(name='pants', f=pants_sdf(), box=((-0.2, -0.14, 0.09), (0.2, 0.14, 0.43)), h=0.003, mat='cloth', color=flat('#35313b')),
        dict(name='wraps', f=wraps_sdf(), box=((-0.24, -0.07, 0.34), (0.24, 0.06, 0.5)), h=0.0016, mat='cloth', color=flat('#eae1d2', 0.85), skin='arm'),
    ]

# ------------------------------------------------------------------ fur fields: where fur grows (weight), how long, which way
NOSE_TIP = V(0, -0.245, 0.965)
TAIL_P = [V(0, 0.09, 0.36), V(0, 0.17, 0.33), V(0.0, 0.24, 0.38), V(0.012, 0.28, 0.47), V(0.03, 0.27, 0.55)]
_CLOTH = []

def cloth_sdf():
    if not _CLOTH: _CLOTH.append(union(gi_sdf(), pants_sdf(), wraps_sdf(), sash_sdf(), scarf_sdf()))
    return _CLOTH[0]

def head_fur(Q):
    """sculpt-space fields for roots on the head -> (weight, length, comb, lift)"""
    sx = np.sign(Q[:, 0]); P = np.concatenate([np.abs(Q[:, :1]), Q[:, 1:]], -1); x, y, z = P[:, 0], P[:, 1], P[:, 2]
    near_eye = _len(P - EYE) < EYE_R + 0.022
    mouth = mouth_space(P)
    w = smoothstep(0.002, 0.006, NOSE(P)) * smoothstep(0.003, 0.007, mouth)  # bare lip edges (no strands across the corners)
    w = w * np.where(near_eye, smoothstep(0.0015, 0.006, eye_opening(P)), 1.0)       # lid rims and the eye stay bare
    L = np.full(len(P), 0.011)
    L = L + (0.0045 - L) * smoothstep(-0.115, -0.16, y)                                # velvety muzzle
    L = np.where(near_eye, np.minimum(L, 0.0052), L)
    cheek = smoothstep(0.07, 0.105, x) * smoothstep(0.985, 0.93, z)
    L = L + (0.032 - L) * cheek                                                        # cheek fluff
    L = L + (0.016 - L) * smoothstep(0.915, 0.89, z) * smoothstep(-0.05, -0.09, y)      # chin / jowl
    L = np.minimum(L, 0.004 + 0.8 * np.maximum(mouth, 0))                             # short round the lips
    crown = np.zeros(len(P))  # (a cowlick read as a spiky patch)
    L = L + (0.032 - L) * crown                                                        # a cowlick on top
    ear = smoothstep(0.005, 0.0, ear_leaf()(P))
    q = (P - EAR_BASE) @ EAR_R
    inner = ear * (q[:, 2] < EAR_UF - 0.004) * smoothstep(0.0, -0.004, q[:, 1])
    L = L + (0.0065 - L) * ear
    w = w * (1 - 0.6 * inner)
    comb = P - NOSE_TIP                                                                # flows back from the nose ...
    comb = comb / _len(comb)[:, None] + V(0, 0.3, -1.0) * (smoothstep(0.06, 0.11, x) * smoothstep(1.0, 0.95, z))[:, None]  # ... down the lower sides
    comb = comb + (V(1.4, 0.3, -0.6) * cheek[:, None])                                  # cheek tufts sweep out and back
    comb = comb * (1 - ear)[:, None] + EAR_R[:, 2][None, :] * ear[:, None]             # ear fur runs to the tip
    comb = comb * (1 - crown)[:, None] + V(0, -0.5, 1.0) * crown[:, None]               # cowlick stands up, forward
    comb[:, 0] *= sx
    lift = 0.22 + 0.4 * cheek + 0.35 * crown
    return w, L, comb, lift

def body_fur(P, head_f):
    """world-space fields for roots on the body -> (weight, length, comb, lift)"""
    x, y, z = np.abs(P[:, 0]), P[:, 1], P[:, 2]
    w = smoothstep(0.004, 0.009, cloth_sdf()(P)) * smoothstep(0.0, 0.004, head_f(P)) * smoothstep(0.004, 0.014, z)
    tail = smoothstep(0.02, 0.0, tube(TAIL_P, [0.032, 0.04, 0.038, 0.027, 0.008])(P))
    along = np.clip(((P - TAIL_P[0]) @ (TAIL_P[-1] - TAIL_P[0])) / np.sum((TAIL_P[-1] - TAIL_P[0]) ** 2), 0, 1)
    L = np.full(len(P), 0.008)
    L = L + (0.045 + 0.03 * along - L) * tail                                         # bushy tail, fullest at the tip
    ruff = smoothstep(0.075, 0.03, x) * smoothstep(-0.03, -0.07, y) * smoothstep(0.44, 0.5, z) * smoothstep(0.7, 0.64, z)
    L = L + (0.022 - L) * ruff                                                         # white chest ruff in the V
    L = np.where(z < 0.1, np.minimum(L, 0.0045), L)                                    # neat paws
    comb = np.tile(V(0, 0.15, -1.0), (len(P), 1))
    comb = comb + (V(0, -0.8, -0.6) - comb) * (z < 0.1)[:, None]                       # paw fur runs to the toes
    t_dir = (TAIL_P[-1] - TAIL_P[0]) / np.linalg.norm(TAIL_P[-1] - TAIL_P[0])
    axis_pt = TAIL_P[0] + np.outer(along, TAIL_P[-1] - TAIL_P[0])
    radial = P - axis_pt
    comb = comb * (1 - tail)[:, None] + (t_dir * 1.2 + radial / np.maximum(_len(radial), 1e-6)[:, None] * 0.6) * tail[:, None]
    lift = 0.25 + 0.3 * tail + 0.2 * ruff
    return w * (1 + 0.8 * tail), L, comb, lift
