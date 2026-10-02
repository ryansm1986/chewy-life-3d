"""Rosie / Sweetheart (Toybox line), Opus rebuild. Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_rosie-opus.py

The head is ONE smooth ball: a signed-distance field (a smooth union of a cranium, a low cheek mass, a
chubby jaw and a tiny nose button). Its skin mesh is the SDF's zero surface reached by radial projection
from the head centre, so every vertex lies exactly on the smooth field and every normal is the field's
analytic gradient: the skin cannot crease, dent or go flat. Face features are painted onto that ball from
3D positions; the eyes are separate flush lens globes in real eyelid holes ringed by edge loops.
Hair = a closed dark envelope (skull offset + a bob mass behind) carrying sculpted dome pillows (bangs,
crown) and closed ellipsoid curls. The body / costume / bow reuse the approved round-12 construction.
1 unit = 1 m, front = -Y, feet on z = 0. Writes only inside this folder and public/models/rosie-opus.glb.
"""
import bpy, bmesh, math, json, os, sys, struct, zlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt

ROOT = os.path.dirname(os.path.abspath(__file__))
RIG = bool(globals().get('RIG_MODE'))      # set by rig_rosie-opus.py: part labels, rig charts, no approved files touched
GEO = True     # round 7: the phase-2 geometry (neck fix, finer crown, toon tessellation) is part of the approved look too
MODEL = 'D:/projects/chewy-life-3d/public/models/rosie-opus.glb'
os.makedirs(os.path.join(ROOT, 'preview'), exist_ok=True)
np.random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
W = .52; CHIN = .72; HY = -.02          # face width, chin height, head centre y (round 7: 0.44 -> 0.52, a chibi head)
SW = W / .44                            # metric detail sizes from the 0.44 m head scale with it
LOG = {}

PAL = {'skin': '#ffdcc4', 'shade': '#eeb393', 'hair': '#6b3a22', 'hairlight': '#8e5634', 'hairgap': '#4e2a18',
       'dress': '#ff8fb0', 'dresslight': '#ffa8c4', 'white': '#fff6f0', 'bow': '#e8364a', 'shoe': '#d8443a',
       'sole': '#b8302a', 'leaf': '#568d4a', 'nose': '#f4a88a', 'lash': '#2a1a14', 'brow': '#6b3a22',
       'mouth': '#7a3a2a'}
# 2048 atlas charts (x, y, w, h) in pixels, y up (Blender UV convention).
CHARTS = {'head': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'hair': (1280, 1536, 768, 128), 'ear': (1280, 1280, 256, 256), 'bow': (1536, 1280, 512, 256),
          'cuff': (1280, 1024, 384, 256), 'berry': (1664, 1024, 384, 256), 'leaf': (1280, 768, 384, 256),
          'nose': (1664, 768, 384, 256), 'dress': (0, 256, 1024, 512), 'skin': (1024, 512, 512, 256),
          'white': (1536, 512, 512, 256), 'shoe': (1024, 256, 512, 256), 'sole': (1536, 256, 512, 256),
          'lash': (0, 0, 256, 256), 'brow': (256, 0, 256, 256), 'mouth': (512, 0, 256, 256)}
if RIG:   # phase-2 charts in unused atlas space (the approved paint is untouched)
    CHARTS.update({'cavity': (768, 0, 256, 256), 'tongue': (1024, 0, 256, 256), 'lidU': (1280, 0, 384, 256), 'lidD': (1664, 0, 384, 256)})

def rgb(c):
    h = PAL.get(c, c).lstrip('#'); return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
def clamp(x): return np.clip(x, 0, 1)
def smooth(a, b, x):
    t = clamp((np.asarray(x, dtype=float) - a) / (b - a)); return t * t * (3 - 2 * t)
def mix(a, b, t):
    t = np.asarray(t, dtype=float)
    return np.asarray(a) * (1 - t[..., None]) + np.asarray(b) * t[..., None]
def spow(x, p): return np.sign(x) * np.abs(x) ** p
def au(chart, u, v):
    x, y, w, h = CHARTS[chart]; g = 6
    return ((x + g + u * (w - 2 * g)) / 2048, (y + g + v * (h - 2 * g)) / 2048)
def unit(v): return v / np.linalg.norm(v, axis=-1, keepdims=True)

# ============================================================== the head ball (SDF, W units, z above chin)
def ell(q, c, r):
    q = (q - np.asarray(c)) / np.asarray(r)
    k0 = np.sqrt((q * q).sum(-1)); k1 = np.sqrt(((q / np.asarray(r)) ** 2).sum(-1))
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)
def smin(a, b, k):
    h = np.clip(.5 + .5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)

# round 7: a wide, chubby squircle, wider than tall -- a lower, broader cranium (chin to crown 0.86 W, was 1.0) over a
# taller, fuller low cheek mass (widest at z 0.30, 0.78 W wide at z 0.08)
BLOB = {'C': [[0, .005, .445], [.485, .510, .410]],    # cranium (round 2: 0.02 W forward: the brow is part of the ball)
        'K': [[0, -.005, .260], [.500, .505, .300]],   # low chubby cheek mass (widest 0.30 W above the chin)
        'J': [[0, -.284, .140], [.310, .255, .170]]}   # full round jaw / chin front (round 2: 0.014 W fuller)
K_CK, K_J = .15, .075
def base_local(q):
    d = ell(q, *BLOB['C']); d = smin(d, ell(q, *BLOB['K']), K_CK); return smin(d, ell(q, *BLOB['J']), K_J)
# Put the front-view lowest point of the skull exactly on the chin line (z = 0).
_yy, _zz = np.meshgrid(np.linspace(-.7, .7, 561), np.linspace(-.25, .25, 501))
_q = np.stack([np.zeros_like(_yy), _yy, _zz], -1).reshape(-1, 3)
ZMIN = float(_q[base_local(_q) < 0][:, 2].min())
for k in BLOB: BLOB[k][0][2] -= ZMIN + .035          # the under-jaw dips 0.035 W behind the chin, onto the collar
LOG['skull_zmin_shift_W'] = ZMIN

def front_local(x, z, f):
    """first surface hit marching from the front (-y) at (x, z), W units, vectorised"""
    x = np.atleast_1d(np.asarray(x, float)); z = np.atleast_1d(np.asarray(z, float)); n = len(x)
    ys = np.linspace(-.80, .20, 260)
    P = np.stack([np.repeat(x[:, None], len(ys), 1), np.broadcast_to(ys, (n, len(ys))),
                  np.repeat(z[:, None], len(ys), 1)], -1).reshape(-1, 3)
    ins = (f(P) < 0).reshape(n, len(ys)); i = np.argmax(ins, 1); ok = ins[np.arange(n), i]
    lo = ys[np.maximum(i - 1, 0)]; hi = ys[i]
    for _ in range(26):
        m = (lo + hi) / 2; inn = f(np.stack([x, m, z], -1)) < 0
        hi = np.where(inn, m, hi); lo = np.where(inn, lo, m)
    return np.where(ok, (lo + hi) / 2, np.nan)

_yf = float(front_local(0, .26, base_local)[0])
_OLD_NOSE = [[0, _yf - .006, .262], [.046, .031, .038]]
# the round-1 nose tip: the fixed reference for the hair layout and hairline
NOSE_TIP_REF = float(front_local(0, .262, lambda q: smin(base_local(q), ell(q, *_OLD_NOSE), .013))[0])
NOSE_FWD = .020                                                    # the button sits 0.05 W proud of the cheek
NOSE = [[0, _yf - .006 - NOSE_FWD, .262], [.046, .031, .038]]; K_N = .013    # tiny button, 0.09 W wide
# Round 2 face volume, all inside the smooth blend (no mesh pushing):
#  a soft brow band, fuller lower cheeks, and a gentle set-in recess around each eye opening
# the set-in socket: only the socket dips; its falloff stops short of the midline (the bridge stays the ball) and
# above the brows (the forehead stays the ball); the brow and cheek fullness come from the ball's own masses
RECESS = dict(delta=.045, F_out=.20, F_nas=.085, F_up=.13, F_dn=.14)
def smoother(a, b, x):
    t = clamp((np.asarray(x, float) - a) / (b - a)); return t * t * t * (t * (6 * t - 15) + 10)
def eye_recess(q):
    """constant depth over each opening, C2 falloff outside it (wide outward, short on the nose side)"""
    x, y, z = q[..., 0], q[..., 1], q[..., 2]; tot = 0
    for s in (-1, 1):
        X = s * (x - s * .27) / .15; Z = (z - .335) / .13
        sr = (np.abs(X) ** 2.15 + np.abs(Z) ** 2.15) ** (1 / 2.15) + 1e-9
        c = X / sr; sn = Z / sr
        dout = (sr - 1) * np.sqrt((.15 * c) ** 2 + (.13 * sn) ** 2)
        F = np.sqrt((np.where(c > 0, RECESS['F_out'], RECESS['F_nas']) * c) ** 2 + (np.where(sn > 0, RECESS['F_up'], RECESS['F_dn']) * sn) ** 2)
        tot = np.maximum(tot, 1 - smoother(.015, .015 + F, dout))
    return tot * smooth(-.15, -.32, y)
# round 3: the under-jaw is one arc from the chin back into the neck (b 0.37, z -0.04): a smooth compact field
# lowers the rear of the jaw (zero at the chin, no junction), and the neck itself is blended in; the base skull
# (and so the chin height and the front outline) is untouched
UNDERJAW = dict(A=.014, b=.34, z=-.035, rx=.16, ry=.17, rz=.09)
NECK = [[0, NOSE_TIP_REF - NOSE_FWD + .53, -.20], [.19, .15, .20]]; K_NECK = .08
if GEO:   # phase-2 fix 1: the neck tucks further under the chin's shade (no sliver between the collar flaps)
    NECK = [[0, NOSE_TIP_REF - NOSE_FWD + .57, -.20], [.175, .14, .20]]
# round 7: the neck stays the same metric size and place on the unchanged body (its W numbers were for the 0.44 m head)
NECK = [[0, NECK[0][1] / SW, NECK[0][2] / SW], [r / SW for r in NECK[1]]]; K_NECK = K_NECK / SW
def head_local(q, neck=True):
    # the set-in socket is a smooth domain warp: over each opening the ball is translated straight back (+y) by delta,
    # so the eye keeps its front-view position, size and 33 deg facing; outside, a C2 falloff blends it away
    qw = np.array(q, float, copy=True); qw[..., 1] = q[..., 1] - RECESS['delta'] * eye_recess(q)
    d = base_local(qw)
    r = np.sqrt((q[..., 0] / UNDERJAW['rx']) ** 2 + ((q[..., 1] - (NOSE_TIP_REF - NOSE_FWD + UNDERJAW['b'])) / UNDERJAW['ry']) ** 2
                + ((q[..., 2] - UNDERJAW['z']) / UNDERJAW['rz']) ** 2)
    d = d - UNDERJAW['A'] * (1 - smoother(0, 1, r))
    if neck: d = smin(d, ell(q, *NECK), K_NECK)
    return smin(d, ell(q, *NOSE), K_N)
NOSE_TIP_L = float(front_local(0, .262, head_local)[0])            # nose tip y (W, head-local)
def L2M(q): return np.stack([q[..., 0] * W, HY + q[..., 1] * W, CHIN + q[..., 2] * W], -1)
def M2L(p): return np.stack([p[..., 0] / W, (p[..., 1] - HY) / W, (p[..., 2] - CHIN) / W], -1)
def head_sdf(p): return head_local(M2L(p)) * W
def soft_local(q):
    return smin(ell(q, *BLOB['C']), ell(q, *BLOB['K']), .30)
def soft_sdf(p): return soft_local(M2L(p)) * W
def front_hit(x, z, f=head_sdf):
    """metres in, metres out"""
    return HY + W * front_local(np.asarray(x) / W, (np.asarray(z) - CHIN) / W, lambda q: f(L2M(q)) / W)
O = np.array([0, HY, CHIN + .30 * W])                # nose height: every ray meets the skin once
def radial_hit(d, f=head_sdf, o=O, t0=.02, t1=.75, it=34):
    lo = np.full(len(d), t0); hi = np.full(len(d), t1)
    for _ in range(it):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return o + d * ((lo + hi) / 2)[:, None]
def radial_hit_outer(d, f=head_sdf, o=O, t0=.02, t1=.75, steps=90):
    """the outermost crossing along each ray (robust where a ray could graze a bump)"""
    ts = np.linspace(t1, t0, steps); n = len(d)
    P = o + d[:, None, :] * ts[None, :, None]
    ins = (f(P.reshape(-1, 3)) < 0).reshape(n, steps); i = np.argmax(ins, 1)
    lo = ts[i]; hi = ts[np.maximum(i - 1, 0)]
    for _ in range(26):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return o + d * ((lo + hi) / 2)[:, None]
def grad_n(p, f=head_sdf, e=1.5e-4):
    g = np.zeros_like(p)
    for k in range(3):
        dp = np.zeros(3); dp[k] = e; g[:, k] = f(p + dp) - f(p - dp)
    return unit(g)
def behind(b): return HY + (NOSE_TIP_REF + b) * W   # hair layout: b W behind the round-1 nose reference
def behind_tip(b): return HY + (NOSE_TIP_L + b) * W
def to_dom(d):
    den = 1 - d[:, 1]; return np.stack([2 * d[:, 0] / den, 2 * d[:, 2] / den], -1)
def from_dom(uv):
    r2 = (uv * uv).sum(1); den = 4 + r2
    return np.stack([4 * uv[:, 0] / den, -(4 - r2) / den, 4 * uv[:, 1] / den], -1)
AMAX = math.radians(112)
def head_uv(d):
    a = np.arccos(np.clip(-d[:, 1], -1, 1)); psi = np.arctan2(d[:, 2], d[:, 0]); r = np.minimum(a / AMAX, 1) * .5
    return np.stack([.5 + r * np.cos(psi), .5 + r * np.sin(psi)], -1)
def head_uv_dir(U, V):
    du = U - .5; dv = V - .5; a = np.minimum(np.sqrt(du * du + dv * dv) * 2, 1) * AMAX; psi = np.arctan2(dv, du)
    return np.stack([np.sin(a) * np.cos(psi), -np.cos(a), np.sin(a) * np.sin(psi)], -1)

# ============================================================== face layout (front projection, metres)
EX = .27 * W; EZ = CHIN + .335 * W; EHW = .15 * W; EHH = .13 * W; EN = 2.15
def eye_unit(psi):
    c = np.cos(psi); s = np.sin(psi)
    return spow(c, 2 / EN), spow(s, 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
NZ = CHIN + .262 * W; MZ = CHIN + .14 * W; MHW = .085 * W
BROW_Z = CHIN + .572 * W; BROW_X = .265 * W
BLUSH = (.31 * W, CHIN + .18 * W, .085 * W, .05 * W)
EAR_C = {}
for s in (-1, 1):
    EAR_C[s] = np.array([s * .505 * W, behind_tip(.74), CHIN + .25 * W])

# ============================================================== hair fields
CAP = .025 * W
def hairline_mask(q):
    """1 on the bare face (in front of the ears, below the bang line), 0 where the hair grows"""
    b = q[..., 1] - NOSE_TIP_REF; z = q[..., 2]
    bh = np.interp(z, [-.4, .10, .18, .44, .52, .60, .66, .72, .80, 2], [.95, .95, .80, .78, .45, .26, .15, .02, -.10, -.10])
    return smooth(-.035, .035, bh - b)
def cap_local(q):
    m = hairline_mask(q); return head_local(q, neck=False) - (CAP / W) * (1 - m) + (.065) * m    # no hair sheath on the neck
BOB = [[0, .25, .48], [.55, .55, .55]]
BOB = [[0, .26, .40], [.58, .55, .49]]      # round 7: lower (no tall crown), a touch wider
def env_local(q): return smin(cap_local(q), ell(q, *BOB), .09)
def env_sdf(p): return env_local(M2L(p)) * W
def env_soft_sdf(p):          # a rounder seat for the thick crown pillows: no concave junction to fold them
    q = M2L(p); return smin(cap_local(q), ell(q, *BOB), .24) * W

# ============================================================== geometry helpers
parts = {k: [] for k in ['head', 'hair', 'eye.L', 'eye.R', 'dress', 'skirt', 'arm.L', 'arm.R', 'leg.L', 'leg.R']}
MAT = None
def mesh(name, verts, faces, uvs, chart, group, raw_uv=False, sharp=None, normals=None):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(map(float, v)) for v in verts], [], [tuple(f) for f in faces]); me.update()
    uv = me.uv_layers.new(name='Atlas')
    for p, coords in zip(me.polygons, uvs):
        p.use_smooth = True
        for li, co in zip(p.loop_indices, coords): uv.data[li].uv = co if raw_uv else au(chart, *co)
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if sharp:
        bm.verts.ensure_lookup_table()
        sv = set(sharp)
        for e in bm.edges:
            if e.verts[0].index in sv and e.verts[1].index in sv: e.smooth = False
    bm.to_mesh(me); bm.free()
    if normals is not None:
        a = me.attributes.new('cust_n', 'FLOAT_VECTOR', 'POINT')
        a.data.foreach_set('vector', np.asarray(normals, np.float32).ravel())
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    parts[group].append(ob); return ob

# ---- the previous builder's primitives (body, costume, bow), unchanged in behaviour
def sphere(name, center, radii, chart, group, seg=24, rows=14, deform=None, orient=None, exact=False):
    if exact:
        pass
    elif group == 'hair':
        seg = max(12, round(seg * .72)); rows = max(8, round(rows * .72))
    elif group.startswith('eye'):
        seg = 32; rows = 16
    elif group not in ('head',):
        seg = max(10, round(seg * .64)); rows = max(8, round(rows * .60))
    else:
        seg = max(14, round(seg * .80)); rows = max(8, round(rows * .80))
    c = Vector(center); r = Vector(radii)
    def point(u, v):
        a = 2 * PI * u; p = PI * v
        q = Vector(deform(u, v)) if deform else Vector((r.x * math.sin(p) * math.sin(a), r.y * math.sin(p) * math.cos(a), -r.z * math.cos(p)))
        if orient: q = orient @ q
        return tuple(c + q)
    verts = [point(.5, 0)]
    for j in range(1, rows):
        for i in range(seg): verts.append(point(i / seg, j / rows))
    top = len(verts); verts.append(point(.5, 1)); faces = []; uvs = []
    ix = lambda j, i: 1 + (j - 1) * seg + i % seg
    for i in range(seg):
        faces.append((0, ix(1, i + 1), ix(1, i))); uvs.append((((i + .5) / seg, 0), ((i + 1) / seg, 1 / rows), (i / seg, 1 / rows)))
    for j in range(1, rows - 1):
        for i in range(seg):
            faces.append((ix(j, i), ix(j, i + 1), ix(j + 1, i + 1), ix(j + 1, i)))
            uvs.append(((i / seg, j / rows), ((i + 1) / seg, j / rows), ((i + 1) / seg, (j + 1) / rows), (i / seg, (j + 1) / rows)))
    for i in range(seg):
        faces.append((ix(rows - 1, i), ix(rows - 1, i + 1), top)); uvs.append(((i / seg, (rows - 1) / rows), ((i + 1) / seg, (rows - 1) / rows), ((i + .5) / seg, 1)))
    return mesh(name, verts, faces, uvs, chart, group)

def catmull(points, t):
    pts = [Vector(p) for p in points]; n = len(pts) - 1; k = min(int(t * n), n - 1); f = t * n - k
    p0, p1, p2, p3 = pts[max(0, k - 1)], pts[k], pts[k + 1], pts[min(n, k + 2)]
    return .5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f)

def tube(name, points, radius, chart, group, rings=14, sides=12, cap=True):
    rings = max(3, round(rings * .72)); sides = max(6, round(sides * .70))
    mitten = name.startswith('short_chubby_arm.')
    if mitten: rings = 16; sides = 14
    verts = []; faces = []; uvs = []; old = None
    for j in range(rings + 1):
        t = j / rings; p = catmull(points, t); d = (catmull(points, min(1, t + .001)) - catmull(points, max(0, t - .001))).normalized()
        ref = Vector((0, 1, 0)) if abs(d.y) < .95 else Vector((1, 0, 0))
        x = d.cross(ref).normalized() if old is None else (old - d * old.dot(d)).normalized()
        y = d.cross(x).normalized(); old = x; r = radius(t) if callable(radius) else radius
        rx_, ry_ = (r if isinstance(r, (list, tuple)) else (r, r))
        for i in range(sides):
            a = 2 * PI * i / sides; ar, br = rx_, ry_
            if mitten:
                s = 1 if points[0][0] > 0 else -1
                thumb_angle = 3 * PI / 4 if s > 0 else PI / 4
                ad = math.atan2(math.sin(a - thumb_angle), math.cos(a - thumb_angle))
                bump = .006 * math.exp(-(ad / .65) ** 2 - ((p.z - .438) / .055) ** 2)
                ar += bump; br *= 1 - .06 * float(smooth(.65, .9, t))
            verts.append(tuple(p + x * (ar * math.cos(a)) + y * (br * math.sin(a))))
    if mitten:
        s = 1 if points[0][0] > 0 else -1
        d = Vector((s * math.sin(math.radians(18)), 0, -math.cos(math.radians(18))))
        x = Vector((math.cos(math.radians(18)), 0, s * math.sin(math.radians(18))))
        y = Vector((0, -1, 0)); p = Vector(points[-1])
        for j in range(1, 6):
            a0 = j / 6 * PI / 2; c = p + d * (.060 * math.sin(a0))
            for i in range(sides):
                a = i / sides * 2 * PI; thumb_angle = 3 * PI / 4 if s > 0 else PI / 4
                ad = math.atan2(math.sin(a - thumb_angle), math.cos(a - thumb_angle))
                bump = .006 * math.exp(-(ad / .65) ** 2 - ((c.z - .438) / .055) ** 2) * math.cos(a0)
                verts.append(tuple(c + x * ((.050 * math.cos(a0) + bump) * math.cos(a)) + y * (.047 * math.cos(a0) * math.sin(a))))
        rings += 5
    for j in range(rings):
        for i in range(sides):
            n = (i + 1) % sides; faces.append((j * sides + i, j * sides + n, (j + 1) * sides + n, (j + 1) * sides + i))
            uvs.append(((i / sides, j / rings), ((i + 1) / sides, j / rings), ((i + 1) / sides, (j + 1) / rings), (i / sides, (j + 1) / rings)))
    if cap:
        for j in (0, rings):
            k = len(verts)
            verts.append(tuple(p + d * .060) if mitten and j == rings else tuple(catmull(points, j / rings)))
            for i in range(sides):
                faces.append((k, j * sides + i, j * sides + (i + 1) % sides)); uvs.append(((.5, j / rings), (i / sides, j / rings), ((i + 1) / sides, j / rings)))
    if mitten:
        grid = np.array(verts[:(rings + 1) * sides]).reshape(rings + 1, sides, 3); centers = grid.mean(axis=1)
        for _ in range(5):
            old = grid.copy()
            for j in range(1, rings):
                z = centers[j, 2]; w = .45 * float(smooth(.388, .410, z)) * (1 - float(smooth(.474, .495, z)))
                row = old[j] * (1 - w) + (old[j - 1] + old[j + 1]) * .5 * w
                grid[j] = row + (centers[j] - row.mean(axis=0))
        verts[:(rings + 1) * sides] = [tuple(v) for v in grid.reshape(-1, 3)]
    return mesh(name, verts, faces, uvs, chart, group)

def ring_surface(name, profiles, chart, group, N=72, scallop=False):
    N = 144 if scallop == 'trim' else (108 if N == 144 else max(24, round(N * .75)))
    verts = []; faces = []; uvs = []; M = len(profiles)
    for j, (z, ax, ay) in enumerate(profiles):
        t = j / (M - 1)
        for i in range(N):
            a = i / N * 2 * PI; fold = 1 + .021 * math.cos(6 * a + .3) * (1 - t) + .008 * math.cos(11 * a); zz = z
            if scallop:
                local = ((i / N * 18 + .5) % 1) * 2 - 1; round_edge = math.sqrt(max(0, 1 - local * local))
                zz -= round_edge * (.024 * (1 - smooth(.55, 1, t)) if scallop == 'trim' else .013 * (1 - smooth(.05, .70, t)))
            verts.append((ax * math.sin(a) * fold, .014 + ay * math.cos(a) * fold, float(zz)))
    for j in range(M - 1):
        for i in range(N):
            ni = (i + 1) % N; faces.append((j * N + i, j * N + ni, (j + 1) * N + ni, (j + 1) * N + i))
            uvs.append(((i / N, j / (M - 1)), ((i + 1) / N, j / (M - 1)), ((i + 1) / N, (j + 1) / (M - 1)), (i / N, (j + 1) / (M - 1))))
    return mesh(name, verts, faces, uvs, chart, group)

# ============================================================== HEAD SKIN: CDT on the ball, eyelid / nose / mouth loops
def rings_in_dom(cdom, base, scales):
    return [cdom + (base - cdom) * k for k in scales]
pts = []; cons = []; tags = {}
def add_loop(P, tag, closed=True):
    i0 = len(pts); pts.extend([tuple(p) for p in P]); n = len(P)
    for i in range(n if closed else n - 1): cons.append((i0 + i, i0 + (i + 1) % n))
    tags[tag] = list(range(i0, i0 + n)); return tags[tag]
def surf_dir(x, z):
    """direction from O to the front-projected skin point (x, z) in metres"""
    y = front_hit(x, z); return unit(np.stack([np.asarray(x, float) * np.ones_like(y), y, np.asarray(z, float) * np.ones_like(y)], -1) - O)

NE = 44
EYE_SCALES = [1.0, 1.085, 1.18, 1.29, 1.41, 1.52]
eye_dom = {}
for s in (-1, 1):
    psi = np.linspace(0, 2 * PI, NE, endpoint=False)
    x, z = eye_xz(s, psi); base = to_dom(surf_dir(x, z)); c = to_dom(surf_dir(np.array([s * EX]), np.array([EZ])))[0]
    eye_dom[s] = (c, base)
    wn = 1 - .55 * smooth(-.10, -.80, np.cos(psi))      # tighter loops on the nasal side (room for the nose)
    for k, kk in enumerate(EYE_SCALES): add_loop(c + (base - c) * (1 + (kk - 1) * wn[:, None]), 'eye%d_%d' % (s, k))
# nose: centre vertex + circles (front projection)
pts.append(tuple(to_dom(surf_dir(np.array([0.]), np.array([NZ])))[0])); tags['nose_c'] = [len(pts) - 1]
NOSE_LOOPS = [(.013, 8), (.026, 12), (.039, 18), (.053, 22)]
if GEO: NOSE_LOOPS = [(.011, 8), (.021, 12), (.030, 16), (.038, 20), (.046, 24), (.054, 28), (.062, 30)]
for k, (rr, n) in enumerate(NOSE_LOOPS):
    a = np.linspace(0, 2 * PI, n, endpoint=False) + .3 * k
    add_loop(to_dom(surf_dir(rr * W * np.cos(a), NZ + rr * W * np.sin(a))), 'nose_%d' % k)
# mouth: concentric loops around the smile (corner loops)
for k, (hx, hz) in enumerate([(.098, .024), (.114, .034), (.130, .046)]):
    a = np.linspace(0, 2 * PI, 36, endpoint=False)
    add_loop(to_dom(surf_dir(hx * W * spow(np.cos(a), .8), MZ + .006 * W + hz * W * np.sin(a))), 'mouth_%d' % k)
# outer boundary at alpha = 120 deg
NB = 56; AB = math.radians(120)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
# fill: a Fibonacci set on the sphere of directions, cleared around the loops
NF = 2000; ii = np.arange(NF) + .5
phi = np.arccos(1 - 2 * ii / NF); th = PI * (1 + 5 ** .5) * ii
D = np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
alpha = np.arccos(np.clip(-D[:, 1], -1, 1)); D = D[alpha < math.radians(116.5)]
# a finer fill across the eye / brow / bridge band, where the set-in socket bends the ball most
NF2 = 7200; ii2 = np.arange(NF2) + .5
phi2 = np.arccos(1 - 2 * ii2 / NF2); th2 = PI * (1 + 5 ** .5) * ii2
D2 = np.stack([np.sin(phi2) * np.cos(th2), np.sin(phi2) * np.sin(th2), np.cos(phi2)], -1)
D2 = D2[np.arccos(np.clip(-D2[:, 1], -1, 1)) < math.radians(70)]
P2 = radial_hit(D2)
band2 = (np.abs(P2[:, 0]) < .46 * W) & (P2[:, 2] > CHIN + .28 * W) & (P2[:, 2] < CHIN + .64 * W)
D2 = D2[band2]; P2 = P2[band2]
Pf0 = radial_hit(D)
inband = (np.abs(Pf0[:, 0]) < .46 * W) & (Pf0[:, 2] > CHIN + .28 * W) & (Pf0[:, 2] < CHIN + .64 * W) & (np.arccos(np.clip(-D[:, 1], -1, 1)) < math.radians(70))
D = np.concatenate([D[~inband], D2]); Pf = np.concatenate([Pf0[~inband], P2])
# the chin, under-jaw and neck: rays from the head centre graze them, so they get a regular grid sampled from the front
gx, gz = np.meshgrid(np.linspace(-.22, .22, 19) * W, CHIN + np.linspace(-.15, .045, 11) * W)
gx = gx.ravel(); gz = gz.ravel(); gy = front_hit(gx, gz); okg = np.isfinite(gy)
G = np.stack([gx, gy, gz], -1)[okg]; Dg = unit(G - O)
zone = (np.abs(Pf[:, 0]) < .235 * W) & (Pf[:, 2] < CHIN + .055 * W) & (Pf[:, 1] < HY + .06)
D = np.concatenate([D[~zone], Dg]); Pf = np.concatenate([Pf[~zone], radial_hit_outer(Dg)]); keep = np.ones(len(D), bool)
dom = to_dom(D)
def eye_ring_rr(dp):
    '''domain points -> radius relative to the outermost eye ring (the nearer eye)'''
    best = np.full(len(dp), 9.)
    for s in (-1, 1):
        c, base = eye_dom[s]
        outer = np.array([pts[i] for i in tags['eye%d_%d' % (s, len(EYE_SCALES) - 1)]])
        ang_b = np.arctan2(outer[:, 1] - c[1], outer[:, 0] - c[0]); rad_b = np.linalg.norm(outer - c, axis=1)
        order = np.argsort(ang_b); ab = np.concatenate([ang_b[order] - 2 * PI, ang_b[order], ang_b[order] + 2 * PI]); rb = np.tile(rad_b[order], 3)
        v = dp - c; best = np.minimum(best, np.linalg.norm(v, axis=1) / np.interp(np.arctan2(v[:, 1], v[:, 0]), ab, rb))
    return best
keep &= eye_ring_rr(dom) > 1.07
front = Pf[:, 1] < HY
keep &= ~(front & ((Pf[:, 0] / W) ** 2 + ((Pf[:, 2] - NZ) / W) ** 2 < .066 ** 2))
keep &= ~(front & ((Pf[:, 0] / (.148 * W)) ** 2 + ((Pf[:, 2] - MZ) / (.066 * W)) ** 2 < 1))
hidden = hairline_mask(M2L(Pf)) < .15
keep &= ~hidden | (np.arange(len(D)) % (8 if GEO else 4) == 0)     # a quarter of the density where the hair covers the skull
fill0 = len(pts); pts.extend([tuple(p) for p in dom[keep]])
def in_poly(P, poly):
    x = P[:, 0]; y = P[:, 1]; inside = np.zeros(len(P), bool); n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        inside ^= ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-30) + x1)
    return inside
def skin_cdt(pts):
    res = delaunay_2d_cdt([Vector(p) for p in pts], cons, [], 0, 1e-9)
    vout, fout, orig_v = res[0], res[2], res[3]
    assert len(vout) == len(pts), ('CDT added or merged vertices: constraint loops intersect', len(vout), len(pts))
    out_of = {}
    for oi, lst in enumerate(orig_v):
        for k in lst: out_of[k] = oi
    dom_out = np.array([[v.x, v.y] for v in vout]); F = np.array([list(f) for f in fout])
    cent = dom_out[F].mean(1); hole = np.zeros(len(F), bool)
    for s in (-1, 1):
        hole |= in_poly(cent, dom_out[[out_of[k] for k in tags['eye%d_0' % s]]])
    return dom_out, F[~hole], out_of
if GEO:
    # phase 2 (toon light): the game's hard light / shade band follows the normal interpolated across each triangle. Its
    # misplacement on the skin is (interpolation error) / (how fast the normal turns there), so in the broad, gently
    # curved areas (bridge, cheeks, under the eyes) even ~1 deg moves the band by millimetres, while in the tight fillets it
    # moves it by a fraction of one. Coarsen where the band is placed exactly anyway, then refine the triangles whose band
    # displacement is largest (centroid insertion, deterministic).
    from mathutils.kdtree import KDTree
    BARY = np.array([[1 / 3, 1 / 3, 1 / 3], [.6, .2, .2], [.2, .6, .2], [.2, .2, .6], [.5, .5, 0], [.5, 0, .5], [0, .5, .5],
                     [.45, .45, .1], [.45, .1, .45], [.1, .45, .45]])
    def tri_errors(dom_out, F):
        Pv = radial_hit_outer(from_dom(dom_out)); Nv = grad_n(Pv); Pt = Pv[F]; Nt = Nv[F]
        nm = unit(Nt.mean(1)); seen = np.maximum(-nm[:, 1], -.707 * nm[:, 1] + .707 * nm[:, 2]) > .05   # front or the 45 deg game camera
        vis = (Pt[:, :, 1] < HY + .01).all(1) & (hairline_mask(M2L(Pt.mean(1))) > .15) & (Pt[:, :, 2] > CHIN - .14 * W).all(1) & seen
        err = np.zeros(len(F)); disp = np.zeros(len(F)); idx = np.where(vis)[0]
        q = np.einsum('kj,tjc->tkc', BARY, Pt[idx]); nq = np.einsum('kj,tjc->tkc', BARY, Nt[idx])
        nq /= np.linalg.norm(nq, axis=2, keepdims=True); d = unit((q - O).reshape(-1, 3))
        sp = radial_hit_outer(d)
        le = np.max([np.linalg.norm(Pt[idx, i] - Pt[idx, (i + 1) % 3], axis=1) for i in range(3)], 0)
        fold = np.linalg.norm(sp.reshape(q.shape) - q, axis=2).max(1) > np.maximum(.002, .3 * le)   # chords across the fold under the nose
        qq = q.reshape(-1, 3).copy()
        for _ in range(3): qq = qq - head_sdf(qq)[:, None] * grad_n(qq)                 # closest point on the skin
        a = grad_n(qq).reshape(q.shape)
        e = np.arccos(np.clip((a * nq).sum(2), -1, 1)).max(1)
        kap = np.full(len(idx), 2.0)
        for i, j in ((0, 1), (1, 2), (2, 0)):
            ang_ = np.arccos(np.clip((Nt[idx, i] * Nt[idx, j]).sum(1), -1, 1)); ln = np.linalg.norm(Pt[idx, i] - Pt[idx, j], axis=1)
            kap = np.maximum(kap, ang_ / np.maximum(ln, 1e-5))
        err[idx] = np.degrees(e); disp[idx] = e / kap * 1000          # mm the light / shade band can be displaced
        vis[idx[fold]] = False
        return err, disp, vis, Pv
    def stats_(err, disp, vis):
        return {'visible_tris': int(vis.sum()), 'err_mean_deg': round(float(err[vis].mean()), 3), 'err_p90_deg': round(float(np.percentile(err[vis], 90)), 3),
                'band_disp_p90_mm': round(float(np.percentile(disp[vis], 90)), 3), 'band_disp_p99_mm': round(float(np.percentile(disp[vis], 99)), 3),
                'band_disp_max_mm': round(float(disp[vis].max()), 3)}
    REFINE_ADD = int(globals().get('REFINE_ADD', 1300)); D_LOW, D_T = .12, .45
    dom_out, F, out_of = skin_cdt(pts); err, disp, vis, Pv = tri_errors(dom_out, F)
    LOG['head_refine_before'] = stats_(err, disp, vis)
    # coarsen: drop fill points whose every incident triangle is visible and places the band within D_LOW (independent set)
    worst = {}; vis_all = {}; nbr = {}
    for t, f in enumerate(F):
        for a_ in f:
            worst[a_] = max(worst.get(a_, 0.), disp[t]); vis_all[a_] = vis_all.get(a_, True) and bool(vis[t])
            nbr.setdefault(a_, set()).update(int(b_) for b_ in f if b_ != a_)
    drop = set(); blocked = set()
    for k in range(fill0, len(pts)):
        oi = out_of[k]
        if oi in blocked or not vis_all.get(oi, False) or worst.get(oi, 9.) > D_LOW: continue
        drop.add(k); blocked.add(oi); blocked.update(nbr.get(oi, ()))
    pts = [p for k, p in enumerate(pts) if k not in drop]
    n_add = 0; budget = REFINE_ADD + len(drop)
    for it in range(40):
        dom_out, F, out_of = skin_cdt(pts); err, disp, vis, Pv = tri_errors(dom_out, F)
        bad = np.where(vis & (disp > D_T))[0]
        if not len(bad) or n_add >= budget: break
        bad = bad[np.argsort(-disp[bad])]
        kd = KDTree(len(Pv))
        for i_, p_ in enumerate(Pv): kd.insert(p_, i_)
        kd.balance()
        taken = []; taken_p = []
        for t in bad:
            if len(taken) >= min(max(60, budget // 8), budget - n_add): break
            c_ = dom_out[F[t]].mean(0)
            if eye_ring_rr(c_[None])[0] <= .72: continue
            cp = Pv[F[t]].mean(0); le = max(np.linalg.norm(Pv[F[t][i]] - Pv[F[t][(i + 1) % 3]]) for i in range(3))
            if kd.find(cp)[2] < .30 * le: continue                   # no slivers next to an existing vertex
            if any(np.linalg.norm(cp - q_) < .45 * le for q_ in taken_p): continue
            taken.append(c_); taken_p.append(cp)
        if not taken: break
        pts.extend([tuple(c_) for c_ in taken]); n_add += len(taken)
    dom_out, F, out_of = skin_cdt(pts); err, disp, vis, Pv = tri_errors(dom_out, F)
    LOG['head_refine'] = {'dropped': len(drop), 'added': n_add, **stats_(err, disp, vis)}
    print('HEAD_REFINE', json.dumps(LOG['head_refine_before']), json.dumps(LOG['head_refine']), flush=True)
else:
    dom_out, F, out_of = skin_cdt(pts)
skin_d = from_dom(dom_out); skin_p = radial_hit_outer(skin_d); skin_n = grad_n(skin_p)
verts = [tuple(p) for p in skin_p]; vdir = list(skin_d); vnorm = list(skin_n)
faces = [tuple(f) for f in F]
# back of the skull (hidden under the hair): structured rings to the back pole
bound = [out_of[k] for k in tags['bound']]
prev = bound
if GEO:     # phase 2: the hidden back of the skull at half the ring density (budget for the face)
    for a, nb in [(138, NB // 2), (160, NB // 2)]:
        A = math.radians(a); ps = np.linspace(0, 2 * PI, nb, endpoint=False)
        d = np.stack([np.sin(A) * np.cos(ps), -np.cos(A) * np.ones(nb), np.sin(A) * np.sin(ps)], -1)
        p = radial_hit_outer(d); nn = grad_n(p); i0 = len(verts)
        verts += [tuple(v) for v in p]; vdir += list(d); vnorm += list(nn)
        cur = list(range(i0, i0 + nb))
        if len(prev) == 2 * nb:
            for i in range(nb):
                faces.append((prev[2 * i], prev[2 * i + 1], cur[i])); faces.append((prev[2 * i + 1], prev[(2 * i + 2) % len(prev)], cur[i]))
                faces.append((prev[(2 * i + 2) % len(prev)], cur[(i + 1) % nb], cur[i]))
        else:
            for i in range(nb): faces.append((prev[i], prev[(i + 1) % nb], cur[(i + 1) % nb], cur[i]))
        prev = cur
else:
    for a in [130, 143, 158, 171]:
        A = math.radians(a)
        d = np.stack([np.sin(A) * np.cos(psiB), -np.cos(A) * np.ones(NB), np.sin(A) * np.sin(psiB)], -1)
        p = radial_hit_outer(d); nn = grad_n(p); i0 = len(verts)
        verts += [tuple(v) for v in p]; vdir += list(d); vnorm += list(nn)
        cur = list(range(i0, i0 + NB))
        for i in range(NB): faces.append((prev[i], prev[(i + 1) % NB], cur[(i + 1) % NB], cur[i]))
        prev = cur
pd = np.array([[0, 1., 0]]); pp = radial_hit_outer(pd); pole = len(verts)
verts.append(tuple(pp[0])); vdir.append(pd[0]); vnorm.append(grad_n(pp)[0])
for i in range(len(prev)): faces.append((prev[i], prev[(i + 1) % len(prev)], pole))
# eyelid roll: the hole edge tucks 4.5 mm into the head behind the lens globe (no visible gap)
roll_info = {}
for s in (-1, 1):
    rim = [out_of[k] for k in tags['eye%d_0' % s]]
    E = np.array([s * EX, float(front_hit(s * EX, EZ)[0]), EZ]); i0 = len(verts); rr = []
    for k, vi in enumerate(rim):
        P = np.array(verts[vi]); n = np.array(vnorm[vi]); t = E - P; t = t - n * (t @ n); t /= np.linalg.norm(t)
        verts.append(tuple(P - .0045 * SW * n + .0016 * SW * t)); vdir.append(vdir[vi]); vnorm.append(unit(.30 * n + t)); rr.append(i0 + k)
    for k in range(NE):
        faces.append((rim[k], rim[(k + 1) % NE], rr[(k + 1) % NE], rr[k]))
    roll_info[s] = (rim, rr)
vdir = np.array(vdir); vnorm = np.array(vnorm)
huv = head_uv(unit(vdir))
skin = mesh('ball_head_skin', verts, faces, [tuple(tuple(au('head', *huv[i])) for i in f) for f in faces], 'head', 'head', raw_uv=True,
            normals=vnorm)
LOG['skin_vertices'] = len(verts); LOG['skin_faces'] = len(faces)

# ============================================================== EYES: flush lens globes following the ball
ES = [0, .12, .25, .38, .51, .63, .74, .84, .92, .98, 1.10]
NSEG = 28
eye_centers = {}
def eye_h(k): return (.0016 - .0042 * k * k) * SW
for s, tag in ((-1, 'R'), (1, 'L')):
    psi = np.linspace(0, 2 * PI, NSEG, endpoint=False)
    rows = []
    cx = s * EX; Sc = np.array([cx, float(front_hit(cx, EZ)[0]), EZ]); axis = grad_n(Sc[None])[0]
    for k in ES:
        if k == 0:
            x = np.array([cx]); z = np.array([EZ])
        else:
            x, z = eye_xz(s, psi, k)
        y = front_hit(x, z); S = np.stack([x, y, z], -1); n = grad_n(S)
        rows.append(S + n * eye_h(k))
    rim = rows[-1]
    for depth, sc in [(.010 * SW, .86), (.020 * SW, .58)]:
        rows.append(Sc + (rim - Sc) * sc - axis * depth)
    tip = Sc - axis * .026 * SW
    def euv(px, pz):
        return (.5 + (px - cx) / (2.4 * EHW), .5 + (pz - EZ) / (2.4 * EHH))
    V = [tuple(rows[0][0])]; UVs = [euv(cx, EZ)]
    for j, r in enumerate(rows[1:]):
        kk = min(j + 1, len(ES) - 1); x, z = eye_xz(s, psi, ES[kk])
        for i in range(NSEG): V.append(tuple(r[i])); UVs.append(euv(x[i], z[i]))
    V.append(tuple(tip)); UVs.append(UVs[-1])
    nr = len(rows) - 1; ix = lambda j, i: 1 + j * NSEG + i % NSEG
    fs = [(0, ix(0, i), ix(0, i + 1)) for i in range(NSEG)]
    for j in range(nr - 1):
        for i in range(NSEG): fs.append((ix(j, i), ix(j + 1, i), ix(j + 1, i + 1), ix(j, i + 1)))
    last = len(V) - 1
    for i in range(NSEG): fs.append((ix(nr - 1, i), last, ix(nr - 1, i + 1)))
    sharp_ring = [ix(len(ES) - 2, i) for i in range(NSEG)]
    globe = mesh('eyeball.' + tag, V, fs, [tuple(UVs[k] for k in f) for f in fs], 'eye.' + tag, 'eye.' + tag, sharp=sharp_ring)
    eye_centers[tag] = [float(v) for v in (Sc - axis * .013 * SW)]
    LOG['eye_axis_' + tag] = {'out_deg': round(math.degrees(math.atan2(s * axis[0], -axis[1])), 1),
                              'down_deg': round(math.degrees(math.asin(-axis[2])), 1)}

# ============================================================== EARS: small round cupped skin ears
ear_info = {}
for s in (-1, 1):
    yc = behind_tip(.74); zc = CHIN + .25 * W
    S = radial_hit(unit(np.array([[s * 1.0, 0, 0]])), o=np.array([0, yc, zc]))[0]
    ne = unit(np.array([s * .88, -.46, .04])); up = np.array([0, 0, 1.]); up = unit(up - ne * (up @ ne)); tt = np.cross(up, ne)
    C0 = S + np.array([s * .050 * W, 0, 0])
    at, au_, an, dish = .056 * W, .070 * W, .034 * W, .020 * W
    seg, rows = 18, 10
    V = []; UVs = []; EN_ = []
    for j in range(rows + 1):
        ph = PI * j / rows                         # 0 = front pole (facing ne)
        for i in range(seg):
            th = 2 * PI * i / seg; rho = math.sin(ph); fz = math.cos(ph)
            facefront = -math.cos(th) * float(np.sign(tt @ np.array([0, 1., 0])) or 1)   # +1 on the face side of the ear
            rim = 1 - .55 * float(smooth(.15, .95, facefront)) * float(smooth(.30, .90, rho))   # the C opens toward the face
            if fz > 0:
                off = an * rim * fz ** .55 - dish * (1 - float(smooth(0, .70, rho)))     # thick rolled rim, shallow hollow
            else:
                off = 3.2 * an * fz                                                     # deep base into the head
            p = C0 + tt * (at * rho * math.cos(th)) + up * (au_ * rho * math.sin(th)) + ne * off
            V.append(tuple(p)); UVs.append((.5 + .48 * rho * math.cos(th), .5 + .48 * rho * math.sin(th)) if fz >= 0 else (.5, .97))
    fs = []
    for j in range(rows):
        for i in range(seg):
            a, b = j * seg + i, j * seg + (i + 1) % seg; fs.append((a, b, b + seg, a + seg))
    ob = mesh('small_round_ear.' + ('L' if s > 0 else 'R'), V, fs, [tuple(UVs[k] for k in f) for f in fs], 'ear', 'head')
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(ob.data); bm.free()
    ear_info[s] = (C0, ne, up, tt)

# ============================================================== HAIR
LIGHT = unit(np.array([0, -.25, 1.]))
def hair_val(n, rimf, extra=0.):
    sheen = smooth(.62, 1.0, n @ LIGHT) * (1 - smooth(.55, .95, rimf))      # a soft gradient on the top quarter only
    return clamp(.46 - .30 * smooth(.76, 1.0, rimf) + .30 * sheen + extra)
def hair_uv(vals): return [au('hair', float(v), .5) for v in vals]
hair_records = []
def finish_hair(name, V, fs, vals, sharp=None, normals=None):
    uvl = hair_uv(vals)
    ob = mesh(name, V, fs, [tuple(uvl[k] for k in f) for f in fs], 'hair', 'hair', raw_uv=True, sharp=sharp, normals=normals)
    hair_records.append(name); return ob

def pillow(name, target_dir, up, A_up, A_dn, B, H, f=env_sdf, base=-.004, taper=.45, rot=0., rings=8, seg=30, lean=0., narrow=0., exact_normals=True):
    d0 = unit(np.asarray(target_dir, float)); up = np.asarray(up, float); t1 = unit(up - d0 * (up @ d0)); t2 = np.cross(d0, t1)
    if rot:
        c, s_ = math.cos(rot), math.sin(rot); t1, t2 = c * t1 + s_ * t2, -s_ * t1 + c * t2
    rs = [0] + list(1 - (1 - np.linspace(0, 1, rings + 1)[1:]) ** 2.1)
    def surf(r, th):
        an = r * np.cos(th); bn = r * np.sin(th)
        a = an * np.where(an > 0, A_up, A_dn); b = bn * B * (1 - narrow * smooth(0, 1, -an))    # teardrop toward the lower end
        ang = np.sqrt(a * a + b * b) + 1e-12; tv = (a[:, None] * t1 + b[:, None] * t2) / ang[:, None]
        d = np.cos(ang)[:, None] * d0 + np.sin(ang)[:, None] * tv
        S = radial_hit(d, f); n = grad_n(S, f)
        Hl = H * (1 - taper * smooth(-.30, 1., an)) * (1 + lean * bn)
        prof = np.sqrt(np.maximum(0, 1 - np.minimum(r, 1) ** 2))
        return S + n * (base + (Hl - base) * prof)[:, None], S, n, an
    grid = []; NRM = []
    for r in rs:
        th = np.linspace(0, 2 * PI, seg, endpoint=False) if r > 0 else np.array([0.])
        rr = np.full(len(th), r)
        top, S, n, an = surf(rr, th)
        if r > 0:      # exact surface normal from the parametric derivatives
            e = 1e-3; r0 = np.maximum(rr - e, 0); r1 = np.minimum(rr + e, 1)
            dr = surf(r1, th)[0] - surf(r0, th)[0]; dt = surf(rr, th + e)[0] - surf(rr, th - e)[0]
            nn = unit(np.cross(dr, dt)); nn = np.where(((nn * n).sum(1) < 0)[:, None], -nn, nn)
            if r >= 1: nn = unit(nn + n * .25)
        else:
            nn = n
        grid.append((top, S, n, rr, an)); NRM.append(nn)
    V = []; vals = []; fs = []; NV = []
    V.append(tuple(grid[0][0][0])); vals.append(float(hair_val(NRM[0], np.array([0.]))[0])); NV.append(NRM[0][0])
    for (top, S, n, r, an), nn in zip(grid[1:], NRM[1:]):
        V += [tuple(p) for p in top]; vals += list(hair_val(n, r)); NV += list(nn)   # colour from the smooth seat normal
    ix = lambda j, i: 1 + j * seg + i % seg
    for i in range(seg): fs.append((0, ix(0, i), ix(0, i + 1)))
    for j in range(rings - 1):
        for i in range(seg): fs.append((ix(j, i), ix(j + 1, i), ix(j + 1, i + 1), ix(j, i + 1)))
    rimS = grid[-1][1]; under = rimS.mean(0) - unit(grid[-1][2].mean(0)) * .08     # deep apex: the buried fan never surfaces
    ui = len(V); V.append(tuple(under)); vals.append(.46); NV.append(-grid[-1][2].mean(0))
    for i in range(seg): fs.append((ix(rings - 1, i + 1), ix(rings - 1, i), ui))
    ob = finish_hair(name, V, fs, vals, sharp=[ix(rings - 1, i) for i in range(seg)], normals=np.array(NV) if exact_normals else None)
    return ob, grid

def curl(name, c, r, out, seg=22, rows=12, squash=.10):
    c = np.asarray(c, float); out = unit(np.asarray(out, float)); r = np.asarray(r, float) * W
    pole = unit(np.cross(out, [0, 0, 1.]) if abs(out[2]) < .9 else np.cross(out, [1., 0, 0]))
    e3 = np.cross(pole, out)
    V = []; vals = []; NV = []
    for j in range(rows + 1):
        ph = PI * j / rows
        for i in range(seg if 0 < j < rows else 1):
            u = i / seg; th = 2 * PI * u - .50 * math.sin(2 * PI * u)           # dense outward, sparse inward
            dl = np.array([math.sin(ph) * math.cos(th), math.sin(ph) * math.sin(th), math.cos(ph)])  # (out, e3, pole)
            k = 1 - squash * max(0., -dl[0]) ** 2                 # flatter toward the head
            p = c + (out * dl[0] * r[0] * k + e3 * dl[1] * r[1] + pole * dl[2] * r[2])
            nn = unit(out * dl[0] / r[0] + e3 * dl[1] / r[1] + pole * dl[2] / r[2])
            V.append(tuple(p)); NV.append(nn); vals.append(float(hair_val(nn[None], np.array([float(smooth(.35, -.55, dl[0]))]))[0]))
    fs = []
    for i in range(seg): fs.append((0, 1 + (i + 1) % seg, 1 + i))
    for j in range(rows - 2):
        for i in range(seg):
            a = 1 + j * seg + i; b = 1 + j * seg + (i + 1) % seg; fs.append((a, b, b + seg, a + seg))
    last = len(V) - 1; base_ = 1 + (rows - 2) * seg
    for i in range(seg): fs.append((base_ + i, base_ + (i + 1) % seg, last))
    return finish_hair(name, V, fs, vals, normals=np.array(NV))

def curl_qs(name, c, r, out, n=6, squash=.10):
    """a curl as a cube-sphere (uniform quads, no poles to pinch), mapped onto a squashed ellipsoid"""
    c = np.asarray(c, float); out = unit(np.asarray(out, float)); r = np.asarray(r, float) * W
    pole = unit(np.cross(out, [0, 0, 1.]) if abs(out[2]) < .9 else np.cross(out, [1., 0, 0])); e3 = np.cross(pole, out)
    t = np.tan(np.linspace(-PI / 4, PI / 4, n + 1))           # equal-angle spacing on each cube face
    V = []; vals = []; NV = []; fs = []; key = {}
    def vid(p):
        k = tuple(np.round(p, 6))
        if k not in key:
            dl = unit(p); kk = 1 - squash * max(0., -dl[0]) ** 2
            P = c + out * dl[0] * r[0] * kk + e3 * dl[1] * r[1] + pole * dl[2] * r[2]
            nn = unit(out * dl[0] / r[0] + e3 * dl[1] / r[1] + pole * dl[2] / r[2])
            key[k] = len(V); V.append(tuple(P)); NV.append(nn)
            vals.append(float(hair_val(nn[None], np.array([float(smooth(.35, -.55, dl[0]))]))[0]))
        return key[k]
    for axis in range(3):
        for sgn in (-1, 1):
            for i in range(n):
                for j in range(n):
                    q = []
                    for (a, b) in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)):
                        p = np.zeros(3); p[axis] = sgn; p[(axis + 1) % 3] = t[a]; p[(axis + 2) % 3] = t[b]
                        q.append(vid(unit(p)))
                    fs.append(tuple(q) if sgn > 0 else tuple(q[::-1]))
    return finish_hair(name, V, fs, vals, normals=np.array(NV))

def loc(x, b, z):   # W units: lateral, behind the nose tip, above the chin -> metres
    return np.array([x * W, behind(b), CHIN + z * W])

# --- the envelope: closed dark base under every lobe (buried beneath the face skin)
seg, rows = 34, 22
V = []
for j in range(rows + 1):
    ph = PI * j / rows
    for i in range(seg if 0 < j < rows else 1):
        th = 2 * PI * i / seg; V.append([math.sin(ph) * math.cos(th), math.sin(ph) * math.sin(th), math.cos(ph)])
Dn = np.array(V); Pn = radial_hit(Dn, env_sdf); Nn = grad_n(Pn, env_sdf)
Pn = Pn - Nn * .006      # 6 mm under the true surface: its chords never reach through a pillow's thin edge
vals = list(clamp(.20 + .25 * smooth(.2, .9, Nn @ LIGHT)))
fs = []
for i in range(seg): fs.append((0, 1 + i, 1 + (i + 1) % seg))
for j in range(rows - 2):
    for i in range(seg):
        a = 1 + j * seg + i; b = 1 + j * seg + (i + 1) % seg; fs.append((a, a + seg, b + seg, b))
last = len(Pn) - 1; base_ = 1 + (rows - 2) * seg
for i in range(seg): fs.append((base_ + i, last, base_ + (i + 1) % seg))
finish_hair('hair_envelope_base', [tuple(p) for p in Pn], fs, vals, normals=Nn)

# --- bangs: three rolled lobes resting on the forehead (on the skin field)
bang_grids = []
def skin_dir(xw, zw):
    """direction to the skin at front-projected (xw, zw) W; steps inward if that point is past the silhouette"""
    for _ in range(40):
        d = surf_dir(np.array([xw * W]), np.array([CHIN + zw * W]))[0]
        if np.all(np.isfinite(d)): return d
        xw -= np.sign(xw) * .005
    raise ValueError('no skin at %s' % zw)
def angle(a, b): return math.acos(float(np.clip(a @ b, -1, 1)))
dC = skin_dir(-.03, .800)
ob, g = pillow('bang_centre_lobe', dC, [0, .25, 1], .95, angle(dC, skin_dir(-.03, .600)), angle(dC, skin_dir(.28, .800)),
               .036 * W, f=head_sdf, base=-.0015, taper=-.85, rot=math.radians(-8), rings=9, seg=44)
bang_grids.append(g)
for s in (-1, 1):
    dS = skin_dir(s * .370, .720); dT = skin_dir(s * .50, .515)
    up = dS - dT
    ob, g = pillow('bang_temple_lobe.' + ('L' if s > 0 else 'R'), dS, up, .72, angle(dS, dT),
                   .165 / .50, .075 * W, f=soft_sdf, base=-.030, taper=.20, rot=0., rings=10, seg=50, narrow=.50)
    bang_grids.append(g)

# --- crown: big smooth pillow sections radiating from a soft part (slightly to her left) to the back
PART = unit(np.array([.05, -.10, 1.]))
def crown_dir(az, down):
    h = np.array([math.cos(math.radians(az)), math.sin(math.radians(az)), 0.])
    return unit(PART * math.cos(math.radians(down)) + h * math.sin(math.radians(down)))
CROWN = [('crown_back_centre', 90, 64, .62, .70, .40, .120), ('crown_back.L', 40, 66, .60, .66, .37, .110),
         ('crown_back.R', 140, 66, .60, .66, .37, .110), ('crown_side.L', 10, 56, .58, .44, .44, .127),
         ('crown_side.R', 170, 56, .58, .44, .44, .127), ('crown_top_front', -90, 24, .32, .34, .58, .125)]
for name, az, down, Aup, Adn, B, H in CROWN:
    d0 = crown_dir(az, down)
    pillow(name, d0, PART, Aup, Adn, B, H * W * 1.30, f=env_soft_sdf, base=-.014, taper=.25 if 'back' not in name else .05, rings=(11 if 'side' in name else 9) if 'back' not in name else 7,
           seg=(42 if 'top' in name else 38) if 'back' not in name else (30 if GEO else 28))   # phase-2 fix 2: finer rear crown

# --- side and back curls: closed clay volumes (W units: lateral, behind nose tip, above chin; radii)
CURLS = []
for s in (-1, 1):                                       # 10 big lobes, each overlapping its neighbours by ~25%
    CURLS += [(s * .540, .84, .620, (.205, .210, .205)),    # upper side: fills the temple pinch (round 7: lower, a touch out)
              (s * .595, .96, .330, (.210, .215, .210)),    # eye level, widest, behind the ear
              (s * .550, 1.00, .040, (.205, .210, .200)),   # jaw level, behind the ear
              (s * .460, 1.26, .240, (.225, .225, .220))]   # back-side
CURLS += [(-.190, 1.31, .080, (.240, .235, .230)), (.190, 1.31, .080, (.240, .235, .230))]   # two big nape curls
HC = loc(0, .95, .40)
for k, (x, b, z, r) in enumerate(CURLS):
    c = loc(x, b, z)
    curl_qs('curl_%02d' % k, c, r, c - HC + np.array([0, 0, -.05]), n=6)
LOG['curls'] = len(CURLS)

# ============================================================== BOW (approved round-12 shape), seated on the new crown
def all_verts(obs): return np.array([list(o.matrix_world @ v.co) for o in obs for v in o.data.vertices])
HV = all_verts(parts['hair'])
near = HV[(np.abs(HV[:, 0]) < .07) & (np.abs(HV[:, 1] + .01) < .06)]
HAIR_TOP_AT_BOW = float(near[:, 2].max())
BOW_Y = HY + (-.018 - HY) * SW
for s in (-1, 1):
    def bowshape(u, v, s=s):
        a = 2 * PI * u; p = PI * v; xn = spow(math.sin(p) * math.sin(a), .8)
        outward = (s * xn + 1) / 2
        x = .089 * xn; z = .080 * spow(-math.cos(p), .76) * (.50 + .50 * outward) + .009 * outward
        y = .050 * math.sin(p) * math.cos(a) * (.80 + .20 * outward)
        return x * SW, y * SW, z * SW
    yaw = Matrix.Rotation(s * math.radians(25), 3, 'Z') @ Matrix.Rotation(math.radians(-12), 3, 'X')
    cpos = Vector((0, BOW_Y, 0)) + yaw @ Vector((s * .100 * SW, .006 * SW, -.003 * SW))
    sphere('padded_bow_loop.' + str(s), tuple(cpos), (1, 1, 1), 'bow', 'hair', 26, 14, deform=bowshape, orient=yaw)
sphere('bow_centre_knot', (0, BOW_Y, 0), (.031 * SW, .045 * SW, .035 * SW), 'bow', 'hair', 20, 14)
# seat: the knot centre sits BOW_SEAT above the crown's top under it (round 2 kept the bow's lower third in the hair)
BOW_SEAT = .012 * SW
_bow = [o for o in parts['hair'] if 'bow' in o.name]; _dz = HAIR_TOP_AT_BOW + BOW_SEAT
for o in _bow:
    for v in o.data.vertices: v.co.z += _dz
BOW_TOP = float(all_verts(_bow)[:, 2].max()); LOG['bow_top_m'] = round(BOW_TOP, 4); LOG['hair_top_at_bow_m'] = round(HAIR_TOP_AT_BOW, 4)

# ============================================================== BODY AND COSTUME (approved round-12 construction)
ring_surface('rounded_pink_bodice', [(.510, .177, .117), (.516, .179, .119), (.535, .187, .124), (.565, .196, .128),
    (.595, .196, .126), (.620, .186, .119), (.644, .168, .108), (.666, .128, .090), (.679, .090, .065)], 'dress', 'dress', 72)
profiles = []
for t in np.linspace(0, 1, 10):
    z = .334 + .178 * t; ax = .299 * (1 - t) + .177 * t; ay = .199 * (1 - t) + .117 * t
    profiles.append((float(z), float(ax), float(ay)))
ring_surface('a_line_skirt_soft_folds', profiles, 'dress', 'skirt', 144, True)
ring_surface('continuous_white_scalloped_hem', [(.308, .289, .192), (.305, .297, .198),
    (.311, .304, .204), (.323, .301, .202), (.340, .281, .188), (.349, .264, .173)], 'white', 'skirt', 144, 'trim')
BOD_Z = np.array([.510, .516, .535, .565, .595, .620, .644, .666, .679])
BOD_AX = np.array([.177, .179, .187, .196, .196, .186, .168, .128, .090])
BOD_AY = np.array([.117, .119, .124, .128, .126, .119, .108, .090, .065])
def body_inside(P):
    """inside the approved bodice ring surface (with its folds) or the hidden neck seat"""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ax = np.interp(z, BOD_Z, BOD_AX); ay = np.interp(z, BOD_Z, BOD_AY); t = np.clip((z - .510) / (.679 - .510), 0, 1)
    a = np.arctan2(x / ax, (y - .014) / ay)
    fold = 1 + .021 * np.cos(6 * a + .3) * (1 - t) + .008 * np.cos(11 * a)
    ins = (np.sqrt((x / ax) ** 2 + ((y - .014) / ay) ** 2) < fold) & (z >= .510) & (z <= .679)
    return ins
def onto_body(P, d):
    """march each point inward along -d onto the body surface (1 mm steps, then bisection)"""
    t = np.zeros(len(P)); hit = np.zeros(len(P), bool)
    for k in range(260):
        q = P - d * t[:, None]; inn = body_inside(q); hit |= inn
        t = np.where(hit, t, t + .001)
    lo = np.maximum(t - .001, 0); hi = t
    for _ in range(20):
        m = (lo + hi) / 2; inn = body_inside(P - d * m[:, None]); hi = np.where(inn, m, hi); lo = np.where(inn, lo, m)
    return P - d * hi[:, None]
def body_dir(z):
    kz = np.interp(z, [.62, .66, .70], [.25, .75, 1.6]); return unit(np.stack([np.zeros_like(z), -np.ones_like(z), kz], -1))
def collar_flap(s):
    outline = [(.018, .705), (.080, .702), (.139, .680), (.146, .655), (.118, .635), (.065, .626), (.008, .638), (.012, .662)]
    pts_ = [Vector(p) for p in outline]; cnt = 32; center = Vector((.072, .661)); perimeter = []
    for i in range(cnt):
        k = i * len(pts_) / cnt; j = int(k); t = k - j
        p0, p1, p2, p3 = pts_[(j - 1) % len(pts_)], pts_[j], pts_[(j + 1) % len(pts_)], pts_[(j + 2) % len(pts_)]
        perimeter.append(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    vv = []; ff = []; uv = []; rings = []
    for scale, offset in [(.05, -.0075), (.40, -.0075), (.78, -.0075), (.94, -.0065), (1, 0), (.94, .0065), (.60, .0075), (.05, .0075)]:
        X = []; Z = []
        for p in perimeter:
            q = center + (p - center) * scale; X.append(s * q.x); Z.append(q.y)
        X = np.array(X); Zd = np.array(Z)
        y_plane = -.111 + (Zd - .661) * 1.15 + .08 * np.abs(X)
        zc = np.minimum(Zd, .676); ax = np.interp(zc, BOD_Z, BOD_AX)
        yb = onto_body(np.stack([X, np.full(len(X), -.30), zc], -1), np.tile([[0, -1., 0]], (len(X), 1)))[:, 1]
        fade = (1 - smooth(.62, .86, np.abs(X) / ax)) * (1 - smooth(.664, .690, Zd))
        ymid = y_plane * (1 - fade) + np.maximum(y_plane, yb - .0085) * fade     # never in front of the chest
        P = np.stack([X, ymid + offset, Zd], -1)          # the approved outline, 15 mm thick, lying on the chest
        row = []
        for q in P: row.append(len(vv)); vv.append(tuple(q))
        rings.append(row)
    for a, b in zip(rings, rings[1:]):
        for i in range(cnt):
            j = (i + 1) % cnt; f = (a[i], a[j], b[j], b[i]); ff.append(f)
            uv.append(tuple((.5 + (vv[v][0] - s * .072) / .15, (vv[v][2] - .62) / .08) for v in f))
    for row in (rings[0], rings[-1]):
        ff.append(tuple(row)); uv.append(tuple((.5, .5) for _ in row))
    return mesh('flat_peter_pan_flap.' + str(s), vv, ff, uv, 'white', 'dress')
for s in (-1, 1): collar_flap(s)
ring_surface('thin_flat_collar_back_band', [(.678, .118, .098), (.684, .119, .099), (.716, .074, .082), (.710, .073, .081)], 'white', 'dress', 64)
def berryshape(u, v):
    a = 2 * PI * u; p = PI * v; z = -math.cos(p); f = .80 + .32 * z
    return .026 * math.sin(p) * math.sin(a) * f, .018 * math.sin(p) * math.cos(a), .033 * z
def body_front_y(x, z):
    return float(onto_body(np.array([[x, -.30, z]]), np.array([[0, -1., 0]]))[0, 1])
BROOCH_Y = body_front_y(0, .588) - .013               # seated flush: its back 5 mm into the dress front
sphere('strawberry_brooch', (0, BROOCH_Y, .588), (1, 1, 1), 'berry', 'dress', 28, 18, deform=berryshape)
for k, (x, z, ang) in enumerate([(-.015, .618, -52), (.016, .618, 52), (-.006, .629, -16), (.007, .629, 16)]):
    sphere('brooch_leaf_' + str(k), (x, body_front_y(x, z) - .011, z), (.011, .009, .017), 'leaf', 'dress', 8, 5,
           orient=Matrix.Rotation(math.radians(ang), 3, 'Y'), exact=True)
joint_arms = {}; joint_legs = {}
for s, tag in [(-1, 'R'), (1, 'L')]:
    group = 'arm.' + tag
    sphere('puffy_sleeve.' + tag, (s * .246, .014, .631), (.071, .075, .072), 'dress', group, 32, 20, orient=Matrix.Rotation(s * math.radians(-20), 3, 'Y'))
    points = [(s * .260, .008, .607), (s * .282, -.006, .557), (s * .303, -.014, .505), (s * .336, -.023, .458), (s * .343, -.024, .431)]
    tube('short_chubby_arm.' + tag, points, lambda t: .055 - .005 * float(smooth(.32, .68, t)), 'skin', group, 18, 18)
    tube('gathered_sleeve_cuff.' + tag, [(s * .260, .008, .598), (s * .265, .006, .585)], .050, 'dress', group, 4, 20)
    joint_arms[tag] = {'shoulder': [s * .235, .014, .632], 'elbow': [s * .292, -.010, .533], 'wrist': [s * .336, -.023, .459]}
    group = 'leg.' + tag
    tube('visible_chubby_leg.' + tag, [(s * .106, .016, .319), (s * .106, .012, .278), (s * .109, .009, .239), (s * .108, .006, .193)],
         lambda t: .0635 + .0015 * math.sin(PI * t) ** 2 - .0045 * float(smooth(.80, 1, t)), 'skin', group, 18, 22)
    tube('white_sock.' + tag, [(s * .108, .006, .112), (s * .108, .007, .142), (s * .108, .008, .185)], .057, 'white', group, 10, 24)
    tube('folded_sock_cuff.' + tag, [(s * .108, .008, .181), (s * .108, .008, .193), (s * .108, .008, .201)], lambda t: .060 + .003 * math.sin(PI * t), 'cuff', group, 6, 24)
    def shoeshape(u, v):
        a = 2 * PI * u; p = PI * v
        return .095 * spow(math.sin(p) * math.sin(a), .75), .110 * spow(math.sin(p) * math.cos(a), .75), .057 * spow(-math.cos(p), .73)
    sphere('rounded_mary_jane.' + tag, (s * .108, -.028, .066), (1, 1, 1), 'shoe', group, 32, 18, deform=shoeshape)
    def soleshape(u, v):
        a = 2 * PI * u; p = PI * v
        return .094 * spow(math.sin(p) * math.sin(a), .60), .107 * spow(math.sin(p) * math.cos(a), .60), .010 * spow(-math.cos(p), .5)
    sphere('darker_rounded_sole.' + tag, (s * .108, -.026, .010), (1, 1, 1), 'sole', group, 28, 12, deform=soleshape)
    sphere('warm_white_instep.' + tag, (s * .108, -.045, .120), (.054, .039, .012), 'white', group, 24, 12)
    strap = []
    for t in np.linspace(0, 1, 13):
        x = s * .108 + (t - .5) * .140; z = .104 + .027 * math.sin(PI * t); strap.append((float(x), -.052, float(z)))
    tube('mary_jane_instep_strap.' + tag, strap, (.008, .010), 'shoe', group, 14, 8)
    sphere('strap_button.' + tag, (s * .177, -.056, .104), (.011, .009, .011), 'bow', group, 12, 10)
    joint_legs[tag] = {'hip': [s * .104, .015, .353], 'knee': [s * .107, .010, .254], 'ankle': [s * .108, .007, .125], 'toe': [s * .108, -.123, .062]}

# ============================================================== PAINTED ATLAS (2048, deterministic PNG)
# the visible lower edge of the bangs in front projection, for the soft contact shadow on the forehead
BX = np.linspace(-.25, .25, 126); BZ = np.full(len(BX), 9.)
for g in bang_grids:
    for (top, S, n, r, an) in g[1:]:
        off = ((top - S) * n).sum(1)
        k = np.linspace(0, 1, 12, endpoint=False)          # densify along each ring before binning
        nxt = np.roll(np.arange(len(top)), -1)
        dense = (top[:, None, :] * (1 - k[None, :, None]) + top[nxt][:, None, :] * k[None, :, None]).reshape(-1, 3)
        doff = (off[:, None] * (1 - k[None, :]) + off[nxt][:, None] * k[None, :]).ravel()
        dense = dense[(doff > .0012) & (dense[:, 1] < HY)]
        idx = np.round((dense[:, 0] + .25) / .004).astype(int); okb = (idx >= 0) & (idx < len(BX))
        np.minimum.at(BZ, idx[okb], dense[okb, 2])
good = BZ < 5
BZ = np.interp(BX, BX[good], BZ[good]); BZ = np.convolve(np.pad(BZ, 5, mode='edge'), np.ones(11) / 11, 'valid')
for gi, g in enumerate(bang_grids):
    allp = np.concatenate([t[0] for t in g]); allo = np.concatenate([((t[0] - t[1]) * t[2]).sum(1) for t in g])
    print('BANG', gi, 'zmin_all_W', round(float((allp[:, 2].min() - CHIN) / W), 3), 'zmin_pos_W', round(float((allp[allo > .0012][:, 2].min() - CHIN) / W), 3), flush=True)
LOG['bang_edge_centre_W'] = round(float((np.interp(0, BX, BZ) - CHIN) / W), 3)
LOG['bang_edge_at_brow_W'] = round(float((np.interp(BROW_X, BX, BZ) - CHIN) / W), 3)

def stroke(x, z, P, half, aa):
    best = np.full(len(x), 9.)
    for i in range(len(P) - 1):
        a = P[i]; b = P[i + 1]; ab = b - a; L2 = ab @ ab
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        dx = x - (a[0] + t * ab[0]); dz = z - (a[1] + t * ab[1])
        best = np.minimum(best, np.sqrt(dx * dx + dz * dz) - (half[i] * (1 - t) + half[i + 1] * t))
    return 1 - smooth(-aa, aa, best)

def lash_th(psi):      # thick on top, a pointed wing at the outer corner (no grey fade below it)
    return (.05 + .20 * np.sin(np.clip(psi, 0, PI)) ** .6 + .09 * np.exp(-((psi - .30) / .35) ** 2)) * smooth(-.08, .30, psi)

PAINT_OPTS = {'band': True, 'blush': True}   # the rig paints its eyelids from this skin with the upper lash band and blush off
def paint_head(U, V):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = radial_hit(d); n = grad_n(P)
    alpha = np.arccos(np.clip(-d[:, 1], -1, 1))
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); zr = q[:, 2]
    fr = smooth(HY + .04, HY - .06, y)
    C = np.broadcast_to(rgb('skin'), (len(x), 3)).copy()
    C = mix(C, rgb('#f9c1ad'), .55 * (1 - smooth(.08, .30, zr)) * fr)                # warm pink-peach lower cheeks and chin
    C = mix(C, rgb('#f0b2a2'), .50 * smooth(-.30, -.80, n[:, 2]) * (1 - smooth(.04, .14, zr)))   # under the jaw only
    m = hairline_mask(q)
    C = mix(C, rgb('#efb9a5'), .50 * smooth(.95, .62, m) * smooth(.30, .62, m))      # hairline contact
    for s in (-1, 1):
        C0, ne, up, tt = ear_info[s]
        dd = np.linalg.norm(P - C0, axis=1); C = mix(C, rgb('#eeb2a2'), .40 * np.exp(-(dd / (.075 * W)) ** 2))
    zb = np.interp(x, BX, BZ, left=9, right=9); dist = zb - z
    C = mix(C, rgb('#efb9a5'), .60 * smooth(-.004, .004, dist) * (1 - smooth(.012 * W, .070 * W, dist)) * fr)
    # nose button colour and a soft highlight
    rn = np.sqrt((((q - np.array(NOSE[0])) / np.array(NOSE[1])) ** 2).sum(1))
    C = mix(C, rgb('nose'), .95 * (1 - smooth(.90, 1.30, rn)))
    hl = np.exp(-(((q - (np.array(NOSE[0]) + np.array([-.012, -.026, .013]))) / .011) ** 2).sum(1))
    C = mix(C, rgb('#ffc4a6'), .55 * hl)
    # blush ovals
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('#ff94a8'), .80 * (1 - smooth(.42, 1.05, r)) * fr * PAINT_OPTS['blush'])
    # brows
    t = np.linspace(-1, 1, 15)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * .08 * W * t, BROW_Z + .015 * W * (1 - t * t) - .009 * W - .002 * W * t], -1)
        half = .0170 * W * np.maximum(0, 1 - t * t) ** .75 + .0012 * W              # soft arc tapering to rounded points
        box = fr * ((np.abs(x - s * BROW_X) < .13 * W) & (np.abs(z - BROW_Z) < .07 * W))
        a = np.zeros(len(x)); ib = box > 0
        a[ib] = stroke(x[ib], z[ib], Pb, half, .0035 * W)
        C = mix(C, rgb('brow'), .95 * a * fr)
    # mouth: a small closed smile with curled-up corners
    t = np.linspace(-1, 1, 21)
    Pm = np.stack([MHW * t, MZ + .020 * W * np.abs(t) ** 2.2 - .004 * W], -1)
    Pm = np.concatenate([[[-MHW - .010 * W, MZ + .030 * W]], Pm, [[MHW + .010 * W, MZ + .030 * W]]])
    half = np.concatenate([[.0022 * W], .0058 * W - .0026 * W * np.abs(t) ** 2, [.0022 * W]])
    ib = (fr > 0) & (np.abs(x) < .14 * W) & (np.abs(z - MZ) < .07 * W)
    a = np.zeros(len(x)); a[ib] = stroke(x[ib], z[ib], Pm, half, .0030 * W)
    C = mix(C, rgb('mouth'), .95 * a)
    # upper lash band, 3 outer flicks, soft lower outer lid
    for s in (-1, 1):
        sr, psi, X, Z = eye_s(s, x, z)
        near_eye = fr * (sr < 1.9)
        th = lash_th(psi)
        up_w = smooth(-.10, -.04, psi) * (psi > -1.2)
        lash = (1 - smooth(1 + th - .012, 1 + th + .012, sr)) * up_w * PAINT_OPTS['band']
        low_w = smooth(-1.75, -1.15, psi) * (1 - smooth(-.40, -.08, psi))
        lid = .55 * (1 - smooth(1.035, 1.065, sr)) * low_w
        a = np.zeros(len(x))
        for pk, L, gam in [(.26, .052, .30), (.50, .058, .50), (.76, .048, .72)]:
            bxk, bzk = eye_xz(s, np.array([pk]), 1 + float(lash_th(np.array([pk]))[0]) * .55)
            tt_ = np.linspace(0, 1, 6)
            dirx = np.cos(gam + .35 * tt_); dirz = np.sin(gam + .35 * tt_)
            Pf = np.stack([bxk[0] + s * L * W * tt_ * dirx, bzk[0] + L * W * tt_ * dirz], -1)
            hf = .0072 * W * (1 - tt_) ** .9 + .0012 * W
            ib = (near_eye > 0) & (np.abs(x - Pf[:, 0].mean()) < .07 * W) & (np.abs(z - Pf[:, 1].mean()) < .07 * W)
            aa = np.zeros(len(x)); aa[ib] = stroke(x[ib], z[ib], Pf, hf, .0028 * W); a = np.maximum(a, aa)
        C = mix(C, rgb('lash'), np.maximum(lash, a) * near_eye)
    C = mix(C, rgb('skin'), np.maximum(smooth(math.radians(98), math.radians(108), alpha), smooth(-.02, -.07, zr)))
    C = mix(C, rgb('#f0b2a2'), (.62 if GEO else .38) * smooth(-.03, -.08, zr) * (1 - smooth(math.radians(98), math.radians(108), alpha)))   # neck in the chin's shade
    return C.reshape(sh + (3,))

def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .30; iz = .08; irx = .70; irz = .92
    C = mix(rgb('#fff9f2'), rgb('#e6d8d0'), .38 * smooth(.50, .98, Z))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#b0703a'), rgb('#7a4424'), smooth(-.70, .65, ez))
    I = mix(I, rgb('#5a321e'), smooth(.86, 1.0, r) * .55)
    I = I * (1 - .02 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 30 + r * 10)))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    pz = iz + .03; R = np.sqrt(((X - ix) / (.68 * irx)) ** 2 + ((Z - pz) / (.76 * irz)) ** 2)
    C = mix(C, rgb('#24140c'), 1 - smooth(.985, 1.015, R))
    hx = ix - .34 * irx; hz = pz + .48 * irz
    big = np.sqrt(((X - hx) / (.25 * irx)) ** 2 + ((Z - hz) / (.18 * irz)) ** 2)
    small = np.sqrt(((X - (hx - .10 * irx)) / (.080 * irx)) ** 2 + ((Z - (hz - .32 * irz)) / (.065 * irz)) ** 2)
    C = mix(C, rgb('#fffaf4'), np.maximum(1 - smooth(.94, 1.06, big), 1 - smooth(.90, 1.10, small)))
    # the lid contact: dark under the upper lash, so the rim never shows a light seam
    C = mix(C, rgb('lash'), smooth(.93, 1.0, sr) * smooth(.0, .45, Z))
    return C

def paint(chart, U, V):
    if chart == 'cavity':
        return mix(rgb('#5a1e22'), rgb('#3e1418'), .5 * smooth(.3, 1, V))
    if chart == 'tongue':
        C = mix(rgb('#e88a96'), rgb('#f2a2ac'), .5 * smooth(.2, .9, V)); return mix(C, rgb('#d07080'), .35 * np.exp(-((U - .5) / .05) ** 2))
    if chart == 'lidU':        # V = 0 at the lash edge: the thick dark lash line, then her skin
        return mix(rgb('lash'), rgb('skin'), smooth(.09, .13, V))
    if chart == 'lidD':
        return mix(rgb('#f6c8b4'), rgb('skin'), smooth(.0, .25, V))
    if chart == 'head': return paint_head(U, V)
    if chart == 'eye.L': return paint_eye(U, V, 1)
    if chart == 'eye.R': return paint_eye(U, V, -1)
    if chart == 'hair':
        C = mix(rgb('hairgap'), rgb('hair'), smooth(0, .46, U)); return mix(C, rgb('hairlight'), smooth(.56, 1, U))
    if chart == 'ear':
        r = np.sqrt(((U - .5) / .48) ** 2 + ((V - .5) / .48) ** 2)
        return mix(rgb('skin'), rgb('#f2aa9a'), .45 * (1 - smooth(.30, .72, r)))   # skin rim, shallow pinker hollow
    if chart == 'skin':
        return mix(rgb('shade'), rgb('skin'), .90 + .10 * smooth(.10, .72, V))
    base = {'dress': 'dress', 'white': 'white', 'cuff': 'white', 'bow': 'bow', 'shoe': 'shoe', 'nose': 'nose', 'lash': 'lash',
            'brow': 'brow', 'mouth': 'mouth', 'berry': 'bow', 'leaf': 'leaf', 'sole': 'sole'}[chart]
    lighter = {'dress': 'dresslight', 'white': '#fff9f2', 'cuff': '#fff9f2', 'bow': '#fa5866', 'shoe': '#eb6352', 'nose': '#ffc4a6',
               'lash': 'lash', 'brow': 'brow', 'mouth': 'mouth', 'berry': '#f65a61', 'leaf': '#7aab57', 'sole': '#c73c33'}[chart]
    C = mix(rgb(base), rgb(lighter), .08 + .24 * smooth(.1, .95, V))
    if chart == 'dress': C = mix(C, rgb('#e97096'), .12 * (1 - smooth(.0, .5, V)) * (.5 + .5 * np.cos(U * 2 * PI * 6)) ** 2)
    if chart == 'cuff': C = mix(C, rgb('#ecd7ca'), .20 * np.exp(-((V - .38) / .045) ** 2))
    if chart == 'bow':
        fold = np.exp(-((V - (.47 + .20 * np.sin(U * PI))) / .11) ** 2) * np.exp(-((U - .25) / .3) ** 2) * .16
        C = mix(C, rgb('#bc263e'), fold)
    if chart == 'berry':
        for u, v in [(.36, .38), (.52, .46), (.65, .30), (.43, .64), (.61, .68), (.54, .19)]:
            r = np.sqrt(((U - u) / .014) ** 2 + ((V - v) / .034) ** 2); C = mix(C, rgb('white'), 1 - smooth(.85, 1.1, r))
    return C

atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [255, 220, 196, 255]
for name, (x0, y0, w, h) in CHARTS.items():
    U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
    if name == 'head':
        block = np.empty((h, w, 3))
        for r0 in range(0, h, 160):
            block[r0:r0 + 160] = paint(name, U[r0:r0 + 160], V[r0:r0 + 160])
    else:
        block = paint(name, U, V)
    atlas[y0:y0 + h, x0:x0 + w, :3] = np.round(clamp(block) * 255).astype(np.uint8)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
atlas_path = os.path.join(ROOT, 'rosie-opus_rig_atlas.png' if RIG else 'rosie-opus_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Rosie_opus_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Rosie_opus_atlas'); MAT.use_nodes = True
bs = MAT.node_tree.nodes.get('Principled BSDF'); bs.inputs['Roughness'].default_value = .8
bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .25
tx = MAT.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
MAT.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])

# ============================================================== MEASURE (before joining)
def bounds(obs):
    vv = all_verts(obs); return vv.min(0), vv.max(0), vv
sk = np.array([list(v.co) for v in skin.data.vertices])
front_sk = sk[sk[:, 1] < HY + .02]
hair_lo, hair_hi, hv = bounds([o for o in parts['hair'] if 'bow' not in o.name])
bow_lo, bow_hi, _ = bounds([o for o in parts['hair'] if 'bow' in o.name])
eye_band = hv[np.abs(hv[:, 2] - EZ) < .02]
nose_tip_y = HY + NOSE_TIP_L * W
def prof_at(zw, xw=0.):
    return round(float((front_hit(xw * W, CHIN + zw * W)[0] - nose_tip_y) / W), 3)
_xs = np.linspace(-.52, .52, 209) * W
def sil_at(zw):        # the exact-profile silhouette: the most forward skin point at that height
    return float((np.nanmin(front_hit(_xs, np.full(len(_xs), CHIN + zw * W))) - nose_tip_y) / W)
def under_jaw():
    zs = np.linspace(-.12, .30, 841); out = []
    for b in (.15, .20, .25, .30, .37):
        q = np.stack([np.zeros_like(zs), np.full_like(zs, NOSE_TIP_L + b), zs], -1); ins = head_local(q) < 0
        out.append(round(float(zs[ins].min()), 3) if ins.any() else None)
    return out
def eye_margin():
    worst = 9.
    psi = np.linspace(0, 2 * PI, 90, endpoint=False)
    for s in (-1, 1):
        for k in (1.0, 1.12, 1.25, 1.35):
            x, z = eye_xz(s, psi, k); y = front_hit(x, z)
            for xi, yi, zi, pi in zip(x, y, z, psi):
                if k > 1 and math.sin(pi) < -.2: continue
                worst = min(worst, (yi - np.nanmin(front_hit(_xs, np.full(len(_xs), zi)))) / W)
    return round(float(worst), 3)
def hair_front_at(z0, z1):
    sel = hv[(hv[:, 2] > CHIN + z0 * W) & (hv[:, 2] < CHIN + z1 * W) & (np.abs(hv[:, 0]) < .30)]
    return round(float((sel[:, 1].min() - nose_tip_y) / W), 3)
rimL = np.array([verts[i] for i in roll_info[1][0]])
MEAS = {'units': 'W = %.2f m face width; profile x = behind the nose tip, z = above the chin' % W,
        'cheek_width_W': round(float(np.ptp(front_sk[:, 0]) / W), 3),
        'widest_face_z_W': round(float((front_sk[np.argmax(np.abs(front_sk[:, 0])), 2] - CHIN) / W), 3),
        'chin_bottom_front_z_m': round(float(sk[(sk[:, 1] < nose_tip_y + .20 * W) & (np.abs(sk[:, 0]) < .10 * W)][:, 2].min()), 4),
        'skull_top_above_chin_W': round(float((sk[:, 2].max() - CHIN) / W), 3),
        'hair_top_z_m': round(float(hair_hi[2]), 3), 'bow_top_z_m': round(float(bow_hi[2]), 3),
        'hair_width_at_eye_level_W': round(float(np.ptp(eye_band[:, 0]) / W), 3),
        'back_of_hair_behind_nose_W': round(float((hair_hi[1] - nose_tip_y) / W), 3),
        'hair_lowest_above_chin_W': round(float((hair_lo[2] - CHIN) / W), 3),
        'profile': {'nose_tip': [0, .262], 'forehead_z0.60': prof_at(.60), 'mouth_z0.12': prof_at(.12),
                    'chin_front_z0.03': prof_at(.03), 'nose_base_z0.20': prof_at(.20),
                    'silhouette_lower_cheek_z0.12_0.24': [round(sil_at(z), 3) for z in (.12, .16, .20, .24)],
                    'silhouette_brow_z0.50_0.58': [round(sil_at(z), 3) for z in (.50, .54, .58)],
                    'nose_proud_of_cheek': round(sil_at(.20), 3),
                    'eye_and_lash_margin_inside_silhouette': eye_margin(),
                    'chin_silhouette_z0.08_0.05_0.03_0.0_-0.02': [round(sil_at(z), 3) for z in (.08, .05, .03, .0, -.02)],
                    'under_jaw_low_z_at_b0.15_0.20_0.25_0.30_0.37': under_jaw(),
                    'hair_front_z0.60_0.75': hair_front_at(.60, .75), 'hair_front_z0.75_0.95': hair_front_at(.75, .95),
                    'eye_white_front_edge': round(float((rimL[:, 1].min() - nose_tip_y) / W), 3),
                    'eye_white_back_edge': round(float((rimL[:, 1].max() - nose_tip_y) / W), 3),
                    'ear_centre': round(float((ear_info[1][0][1] - nose_tip_y) / W), 3)},
        'nose_tip_y_m': round(float(nose_tip_y), 5),
        'eye_opening_W': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'eye_centre_W': [EX / W, (EZ - CHIN) / W], 'nose_z_W': .262, 'mouth_z_W': .14, 'brow_z_W': .572,
        'blush_W': [BLUSH[0] / W, (BLUSH[1] - CHIN) / W, 2 * BLUSH[2] / W, 2 * BLUSH[3] / W],
        'nose_tip_proud_W': round(float(front_local(0, .262, base_local)[0] - NOSE_TIP_L), 3)}
MEAS.update(LOG)

# ============================================================== JOIN, CLEAN, NORMALS
objects = []; part_tri = {}
for group, obs in parts.items():
    for ob in obs:
        ob.data.materials.clear(); ob.data.materials.append(MAT)
        if RIG:
            vg = ob.vertex_groups.new(name='_part_' + ob.name); vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs: ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1: bpy.ops.object.join()
    ob = bpy.context.object; ob.name = 'Rosie_' + group.replace('.', '_')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-8)
    bad = [f for f in bm.faces if f.calc_area() < 1e-12]
    if bad: bmesh.ops.delete(bm, geom=bad, context='FACES')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(ob.data); bm.free()
    for p in ob.data.polygons: p.material_index = 0; p.use_smooth = True
    if ob.data.attributes.get('cust_n') is not None:
        me = ob.data; a = me.attributes.get('cust_n')
        sn = np.zeros(len(me.vertices) * 3, np.float32); a.data.foreach_get('vector', sn); sn = sn.reshape(-1, 3)
        cn = np.zeros(len(me.loops) * 3, np.float32); me.corner_normals.foreach_get('vector', cn); cn = cn.reshape(-1, 3)
        lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
        use = np.linalg.norm(sn[lv], axis=1) > .5
        cn[use] = sn[lv][use]
        me.normals_split_custom_set([tuple(v) for v in cn]); me.attributes.remove(me.attributes['cust_n'])
    piv = {'head': tuple(O), 'hair': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'],
           'arm.L': joint_arms['L']['shoulder'], 'arm.R': joint_arms['R']['shoulder'],
           'leg.L': joint_legs['L']['hip'], 'leg.R': joint_legs['R']['hip']}.get(group, (0, 0, 0))
    bpy.context.scene.cursor.location = piv; bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    for v in ob.data.vertices: assert all(math.isfinite(c) for c in v.co), 'Nonfinite position'
    for p in ob.data.polygons: assert all(math.isfinite(c) for c in p.normal) and p.normal.length > .5, ('Bad normal', ob.name, p.index)
    ob['phase'] = '1: neutral A-pose, no armature'; ob['front_axis'] = '-Y'; ob['units'] = 'metres'
    ob.data.calc_loop_triangles(); part_tri[group] = len(ob.data.loop_triangles); objects.append(ob)
tri_count = sum(part_tri.values()); print('PART_TRIANGLES', json.dumps(part_tri), flush=True)
# (round 7: the game asset's 34k budget is checked by the rig, after its hidden-geometry cull)
HEAD_HAIR_TRIS = part_tri['head'] + part_tri['hair'] + part_tri['eye.L'] + part_tri['eye.R']

MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count

ears_j = {}
for s, tag in [(-1, 'R'), (1, 'L')]:
    C0, ne, up, tt = ear_info[s]
    ears_j[tag] = {'base': [float(v) for v in C0 - ne * .02], 'fold': [float(v) for v in C0], 'tip': [float(v) for v in C0 + ne * .015]}
joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X',
          'hips': [0, .015, .353], 'spine': [0, .015, .469], 'chest': [0, .014, .600], 'neck': [0, .012, .675],
          'head': [float(v) for v in O], 'jaw_pivot': [0, float(HY - .05 * W), float(CHIN + .07 * W)],
          'eyes': eye_centers, 'ears': ears_j, 'arms': joint_arms, 'legs': joint_legs, 'tail': [],
          'notes': ['Phase 1: no rig, weights or animations. Tail key kept for the Chewy schema; Rosie has no tail.',
                    'Head skin = zero surface of a smooth SDF ball (cranium + cheek mass + jaw + nose button), radially projected, analytic normals.',
                    'Eyelid holes ringed by 6 concentric loops each, rim rolled 4.5 mm in behind separate lens eyeballs; 3 loops around the mouth; 5 around the nose.',
                    'Hair: closed envelope base, 3 bang pillows, 6 crown pillows, %d closed curls, bow; joined as Rosie_hair (rigid head follower).' % len(CURLS)]}
if not RIG:
    with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not RIG:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'rosie-opus.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects: ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                              export_animations=False)
print('ROSIE_OPUS_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': MODEL, 'rig_mode': RIG}), flush=True)
