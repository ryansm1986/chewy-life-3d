"""Mochi / Sunrise Dreamer (Toybox villager), Opus build. Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_mochi-toy.py

The head is ONE smooth implicit ball: a "mochi" superquadric (wide, flat-ish top, broad cheeks, widest 0.30 W above
the chin) smooth-unioned with a gentle muzzle and a tiny nose button. Its skin mesh is the zero surface reached by
radial projection from the head centre (every vertex exactly on the surface, every normal the field's analytic
gradient), triangulated by a constrained Delaunay in the stereographic domain with edge loops around the eyelids,
the nose and the mouth. Face paint and calico patches are painted onto the ball from 3D positions into a 2048 atlas
(front and back head charts). Eyes = separate lens globes in real eyelid holes. Ears = thick rounded-cone volumes with
a pink hollow; tail = a thick bend-looped tube with a club tip. 1 unit = 1 m, front = -Y, feet on z = 0.
Writes only inside this folder and public/models/mochi-toy.glb.
"""
import bpy, bmesh, math, json, os, struct, zlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt

ROOT = os.path.dirname(os.path.abspath(__file__))
RIG = bool(globals().get('RIG_MODE'))      # set by rig_mochi-toy.py: part labels, rig charts, no approved files touched
MODEL = 'D:/projects/chewy-life-3d/public/models/mochi-toy.glb'
os.makedirs(os.path.join(ROOT, 'preview'), exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
W = .64; CHIN = .513; HY = .027        # face width at the cheeks, chin height, head centre y (metres)
SW = W / .44                           # Rosie's metric detail sizes (0.44 m head) scaled to this head
LOG = {}

PAL = {'fur': '#fff4ea', 'furshade': '#f2dcc8', 'orange': '#f4a860', 'orangeshade': '#e3934d', 'inner': '#ffb0c0',
       'innerdeep': '#f799ae', 'iris': '#71b86b', 'nose': '#cb7f86', 'blush': '#f5a0ad', 'kimono': '#ff9ec0',
       'kimonolight': '#ffb4cf', 'kimonoshade': '#ec86a8', 'collar': '#fff6ea', 'obi': '#ffd24a', 'obishade': '#f0b636',
       'skirt': '#6a4a6a', 'skirtlight': '#7c5a7b', 'skirtshade': '#563a57', 'handle': '#a87550', 'bristle': '#6b4a38',
       'ferrule': '#f2c96a', 'lash': '#33232a', 'brow': '#5a3a30', 'mouth': '#4a2e2e', 'line': '#e9cdb8'}
# 2048 atlas charts (x, y, w, h) in pixels, y up (Blender UV convention).
CHARTS = {'head': (0, 768, 1280, 1280), 'headback': (1280, 1280, 768, 768),
          'eye.L': (1280, 896, 384, 384), 'eye.R': (1664, 896, 384, 384),
          'ear.L': (1280, 640, 384, 256), 'ear.R': (1664, 640, 384, 256),
          'kimono': (0, 384, 512, 384), 'sleeve': (512, 384, 512, 384), 'collar': (1024, 512, 256, 256),
          'obi': (1024, 256, 256, 256), 'skirt': (0, 0, 512, 384), 'skin': (512, 0, 512, 384),
          'paw': (1024, 0, 256, 256), 'foot': (1280, 384, 384, 256), 'tail': (1664, 384, 384, 256),
          'brush': (1280, 0, 256, 384), 'bow': (1536, 0, 256, 384), 'nose': (1792, 0, 256, 256)}
if RIG:   # phase 2: room for the per-side lid charts, the mouth cavity and the tongue (the small flat charts shrink)
    CHARTS.update({'brush': (1280, 0, 256, 192), 'bow': (1536, 0, 256, 192), 'nose': (1792, 0, 256, 128), 'collar': (1024, 512, 256, 128),
                   'lidU.L': (1280, 192, 256, 192), 'lidU.R': (1536, 192, 256, 192), 'lidD.L': (1792, 128, 256, 128), 'lidD.R': (1792, 256, 256, 128),
                   'cavity': (1024, 640, 128, 128), 'tongue': (1152, 640, 128, 128)})
PAINT_OPTS = {'lash': True}     # the rig paints its eyelids from this face paint with the lash lines off

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

# ============================================================== the head ball (implicit, W units, z above the chin)
# round 2: the lower face's fullness is a smooth swelling of the front half's depth, centred low (no muzzle ellipsoid,
# so no outline under the mouth); it spans the whole face width
LOWFACE = dict(m=.16, z=.10, w=.08)
HEAD = dict(A=.500, BF=.400, BB=.440, ZC=.300, HT=.455, HB=.300, nA_t=2.2, nA_b=2.9, nB_t=2.7, nB_b=4.0, n=2.0, nBb_t=2.3, nBb_b=2.6, egg=.35)
def prof(z, m_t, m_b):
    zc = HEAD['ZC']; v = np.where(z >= zc, (z - zc) / HEAD['HT'], (zc - z) / HEAD['HB'])
    m = np.where(z >= zc, m_t, m_b); vv = np.clip(v, 0, 1)
    return np.maximum(np.clip(1 - vv ** m, 0, 1) ** (1 / m), 1e-4), v
def skull_local(q):
    """the mochi superquadric: horizontal superellipse sections whose half-width and half-depth follow their own
    vertical superellipse profiles (broad flat-ish bottom, rounder top); approximately a distance"""
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    gA, v = prof(z, HEAD['nA_t'], HEAD['nA_b']); gB, _ = prof(z, HEAD['nB_t'], HEAD['nB_b']); gBb, _ = prof(z, HEAD['nBb_t'], HEAD['nBb_b'])
    a = HEAD['A'] * gA; b = np.where(y < 0, HEAD['BF'] * gB * (1 + LOWFACE['m'] * np.exp(-((z - LOWFACE['z']) / LOWFACE['w']) ** 2)), HEAD['BB'] * gBb); n = HEAD['n']
    vv = np.clip(y / b, -1, 0); a = a * (1 - HEAD['egg'] * vv * vv)     # egg-shaped front: the face wraps round, eyes face ~30 deg out
    s = (np.abs(x / a) ** n + np.abs(y / b) ** n) ** (1 / n)
    d = (s - 1) * np.minimum(a, b)
    return np.where(v > 1, np.maximum(d, (v - 1) * np.where(z >= HEAD['ZC'], HEAD['HT'], HEAD['HB'])), d)
def ell(q, c, r):
    q = (q - np.asarray(c)) / np.asarray(r)
    k0 = np.sqrt((q * q).sum(-1)); k1 = np.sqrt(((q / np.asarray(r)) ** 2).sum(-1))
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)
def smin(a, b, k):
    h = np.clip(.5 + .5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)
def front_local(x, z, f):
    """first surface hit marching from the front (-y) at (x, z), W units, vectorised"""
    x = np.atleast_1d(np.asarray(x, float)); z = np.atleast_1d(np.asarray(z, float)); n = len(x)
    ys = np.linspace(-.80, .30, 280)
    P = np.stack([np.repeat(x[:, None], len(ys), 1), np.broadcast_to(ys, (n, len(ys))),
                  np.repeat(z[:, None], len(ys), 1)], -1).reshape(-1, 3)
    ins = (f(P) < 0).reshape(n, len(ys)); i = np.argmax(ins, 1); ok = ins[np.arange(n), i]
    lo = ys[np.maximum(i - 1, 0)]; hi = ys[i]
    for _ in range(26):
        m = (lo + hi) / 2; inn = f(np.stack([x, m, z], -1)) < 0
        hi = np.where(inn, m, hi); lo = np.where(inn, lo, m)
    return np.where(ok, (lo + hi) / 2, np.nan)
# a gentle muzzle under the nose (the sheet's profile: the upper lip 0.012 W behind the nose tip) and the nose button
_yf = float(front_local(0, .14, skull_local)[0])
MUZ = [[0, _yf + .080 - .038, .140], [.170, .080, .080]]; K_M = .085
def f_muz(q): return skull_local(q)
_yn = float(front_local(0, .24, skull_local)[0])
NOSE = [[0, _yn + .022 - .049 + .001, .205], [.032, .022, .018]]; K_N = .016     # round 4: a softer button under the painted triangle
def head_local(q): return smin(f_muz(q), ell(q, *NOSE), K_N)
_zt = np.linspace(.15, .25, 101); _ft = front_local(np.zeros_like(_zt), _zt, head_local)
NOSE_TIP_L = float(np.nanmin(_ft)); NOSE_TIP_Z = float(_zt[np.nanargmin(_ft)])
def L2M(q): return np.stack([q[..., 0] * W, HY + q[..., 1] * W, CHIN + q[..., 2] * W], -1)
def M2L(p): return np.stack([p[..., 0] / W, (p[..., 1] - HY) / W, (p[..., 2] - CHIN) / W], -1)
def head_sdf(p): return head_local(M2L(p)) * W
def front_hit(x, z, f=head_sdf):
    """metres in, metres out"""
    return HY + W * front_local(np.asarray(x) / W, (np.asarray(z) - CHIN) / W, lambda q: f(L2M(q)) / W)
O = np.array([0, HY, CHIN + .33 * W])                 # every ray from here meets the skin once
def radial_hit(d, f=head_sdf, o=O, t0=.02, t1=.75, it=34):
    lo = np.full(len(d), t0); hi = np.full(len(d), t1)
    for _ in range(it):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return o + d * ((lo + hi) / 2)[:, None]
def grad_n(p, f=head_sdf, e=1.5e-4):
    g = np.zeros_like(p)
    for k in range(3):
        dp = np.zeros(3); dp[k] = e; g[:, k] = f(p + dp) - f(p - dp)
    return unit(g)
def to_dom(d):
    den = 1 - d[:, 1]; return np.stack([2 * d[:, 0] / den, 2 * d[:, 2] / den], -1)
def from_dom(uv):
    r2 = (uv * uv).sum(1); den = 4 + r2
    return np.stack([4 * uv[:, 0] / den, -(4 - r2) / den, 4 * uv[:, 1] / den], -1)
AMAX = math.radians(122); BMAX = math.radians(72); A_SPLIT = math.radians(116)
def head_uv(d):
    a = np.arccos(np.clip(-d[:, 1], -1, 1)); psi = np.arctan2(d[:, 2], d[:, 0]); r = np.minimum(a / AMAX, 1) * .5
    return np.stack([.5 + r * np.cos(psi), .5 + r * np.sin(psi)], -1)
def head_uv_dir(U, V):
    du = U - .5; dv = V - .5; a = np.minimum(np.sqrt(du * du + dv * dv) * 2, 1) * AMAX; psi = np.arctan2(dv, du)
    return np.stack([np.sin(a) * np.cos(psi), -np.cos(a), np.sin(a) * np.sin(psi)], -1)
def headback_uv(d):
    b = np.arccos(np.clip(d[:, 1], -1, 1)); psi = np.arctan2(d[:, 2], -d[:, 0]); r = np.minimum(b / BMAX, 1) * .5
    return np.stack([.5 + r * np.cos(psi), .5 + r * np.sin(psi)], -1)
def headback_uv_dir(U, V):
    du = U - .5; dv = V - .5; b = np.minimum(np.sqrt(du * du + dv * dv) * 2, 1) * BMAX; psi = np.arctan2(dv, du)
    return np.stack([-np.sin(b) * np.cos(psi), np.cos(b), np.sin(b) * np.sin(psi)], -1)

# ============================================================== face layout (front projection, metres; sheet-measured)
EX = .238 * W; EZ = CHIN + .285 * W; EHW = .110 * W; EHH = .106 * W; EN = 2.1
def eye_unit(psi):
    c = np.cos(psi); s = np.sin(psi)
    return spow(c, 2 / EN), spow(s, 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
NZ = CHIN + .205 * W; MC = CHIN + .146 * W; MHW = .074 * W
BROW_Z = CHIN + .530 * W; BROW_X = .216 * W
BLUSH = (.320 * W, CHIN + .167 * W, .064 * W, .040 * W)

# ============================================================== geometry helpers
parts = {k: [] for k in ['head', 'eye.L', 'eye.R', 'ear.L', 'ear.R', 'body', 'arm.L', 'arm.R', 'leg.L', 'leg.R', 'tail']}
def mesh(name, verts, faces, uvs, chart, group, raw_uv=False, sharp=None, normals=None, recalc=True):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(map(float, v)) for v in verts], [], [tuple(f) for f in faces]); me.update()
    uv = me.uv_layers.new(name='Atlas')
    for p, coords in zip(me.polygons, uvs):
        p.use_smooth = True
        for li, co in zip(p.loop_indices, coords): uv.data[li].uv = co if raw_uv else au(chart, *co)
    bm = bmesh.new(); bm.from_mesh(me)
    if recalc: bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if sharp:
        sv = set(sharp)
        for e in bm.edges:
            if e.verts[0].index in sv and e.verts[1].index in sv: e.smooth = False
    bm.to_mesh(me); bm.free()
    if normals is not None:
        a = me.attributes.new('cust_n', 'FLOAT_VECTOR', 'POINT')
        a.data.foreach_set('vector', np.asarray(normals, np.float32).ravel())
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    parts[group].append(ob); return ob

def blob(name, center, radii, chart, group, seg=24, rows=14, p=(1., 1., 1.), orient=None, vrange=(0., 1.)):
    """superellipsoid (exponents p on sin/cos), UV u = azimuth (front -Y at u = .5), v = bottom -> top"""
    c = Vector(center); rx, ry, rz = radii
    def point(u, v):
        a = 2 * PI * u; ph = PI * v
        q = Vector((rx * spow(math.sin(ph), p[0]) * spow(math.sin(a), p[0]), ry * spow(math.sin(ph), p[1]) * spow(math.cos(a), p[1]),
                    -rz * spow(math.cos(ph), p[2])))
        if orient: q = orient @ q
        return tuple(c + q)
    verts = [point(.5, 0)]
    for j in range(1, rows):
        for i in range(seg): verts.append(point(i / seg, j / rows))
    top = len(verts); verts.append(point(.5, 1)); faces = []; uvs = []
    ix = lambda j, i: 1 + (j - 1) * seg + i % seg
    V = lambda t: vrange[0] + (vrange[1] - vrange[0]) * t
    for i in range(seg):
        faces.append((0, ix(1, i + 1), ix(1, i))); uvs.append((((i + .5) / seg, V(0)), ((i + 1) / seg, V(1 / rows)), (i / seg, V(1 / rows))))
    for j in range(1, rows - 1):
        for i in range(seg):
            faces.append((ix(j, i), ix(j, i + 1), ix(j + 1, i + 1), ix(j + 1, i)))
            uvs.append(((i / seg, V(j / rows)), ((i + 1) / seg, V(j / rows)), ((i + 1) / seg, V((j + 1) / rows)), (i / seg, V((j + 1) / rows))))
    for i in range(seg):
        faces.append((ix(rows - 1, i), ix(rows - 1, i + 1), top)); uvs.append(((i / seg, V((rows - 1) / rows)), ((i + 1) / seg, V((rows - 1) / rows)), ((i + .5) / seg, V(1))))
    return mesh(name, verts, faces, uvs, chart, group)

def catmull(points, t):
    pts = [Vector(p) for p in points]; n = len(pts) - 1; k = min(int(t * n), n - 1); f = t * n - k
    p0, p1, p2, p3 = pts[max(0, k - 1)], pts[k], pts[k + 1], pts[min(n, k + 2)]
    return .5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f)

def sweep(name, path, radius, chart, group, rings=20, sides=16, caps=(True, True), vrange=(0., 1.), ovals=None):
    """a tube along a dense polyline (arc-length rings, parallel-transport frames); radius(s, L) in metres;
    ovals(s, L) -> (kx, ky) stretches the section; closes with a fan where the radius reaches ~0"""
    P = np.array([list(p) for p in path], float); seglen = np.linalg.norm(np.diff(P, axis=0), axis=1)
    S = np.concatenate([[0], np.cumsum(seglen)]); L = S[-1]
    ss = np.linspace(0, L, rings + 1) if not callable(rings) else rings(L)
    verts = []; faces = []; uvs = []; old = None; centres = []
    for j, s in enumerate(ss):
        p = np.array([np.interp(s, S, P[:, k]) for k in range(3)])
        s0, s1 = max(0, s - .004), min(L, s + .004)
        d = np.array([np.interp(s1, S, P[:, k]) for k in range(3)]) - np.array([np.interp(s0, S, P[:, k]) for k in range(3)])
        d = d / np.linalg.norm(d)
        if old is None:
            ref = np.array([0, 1., 0]) if abs(d[1]) < .95 else np.array([1., 0, 0])
            x = np.cross(d, ref); x /= np.linalg.norm(x)
        else:
            x = old - d * (old @ d); x /= np.linalg.norm(x)
        y = np.cross(d, x); old = x; r = radius(s, L); kx, ky = ovals(s, L) if ovals else (1, 1)
        centres.append(p)
        for i in range(sides):
            a = 2 * PI * i / sides; verts.append(tuple(p + x * (r * kx * math.cos(a)) + y * (r * ky * math.sin(a))))
    nr = len(ss) - 1
    V = lambda t: vrange[0] + (vrange[1] - vrange[0]) * t
    for j in range(nr):
        for i in range(sides):
            n = (i + 1) % sides; faces.append((j * sides + i, j * sides + n, (j + 1) * sides + n, (j + 1) * sides + i))
            uvs.append(((i / sides, V(ss[j] / L)), ((i + 1) / sides, V(ss[j] / L)), ((i + 1) / sides, V(ss[j + 1] / L)), (i / sides, V(ss[j + 1] / L))))
    for end, j in ((0, 0), (1, nr)):
        if not caps[end]: continue
        k = len(verts); verts.append(tuple(centres[j]))
        for i in range(sides):
            a, b = j * sides + i, j * sides + (i + 1) % sides
            faces.append((k, b, a) if end == 0 else (k, a, b)); uvs.append(((.5, V(ss[j] / L)), (i / sides, V(ss[j] / L)), ((i + 1) / sides, V(ss[j] / L))))
    return mesh(name, verts, faces, uvs, chart, group), L

def lathe(name, rows, chart, group, N=64, n=2.0, fold=None, cap=(False, False), vrange=(0., 1.)):
    """ring surface: rows of (z, ax, ay[, yc]); superellipse sections (exponent n); front (-Y) at u = .5"""
    verts = []; faces = []; uvs = []; M = len(rows)
    for j, row in enumerate(rows):
        z, ax, ay = row[:3]; yc = row[3] if len(row) > 3 else 0.; t = j / (M - 1)
        for i in range(N):
            a = 2 * PI * i / N; f = fold(a, t) if fold else 1.
            verts.append((ax * spow(math.sin(a), 2 / n) * f, yc + ay * spow(math.cos(a), 2 / n) * f, z))
    V = lambda t: vrange[0] + (vrange[1] - vrange[0]) * t
    for j in range(M - 1):
        for i in range(N):
            ni = (i + 1) % N; faces.append((j * N + i, j * N + ni, (j + 1) * N + ni, (j + 1) * N + i))
            uvs.append(((i / N, V(j / (M - 1))), ((i + 1) / N, V(j / (M - 1))), ((i + 1) / N, V((j + 1) / (M - 1))), (i / N, V((j + 1) / (M - 1)))))
    for end, j in ((0, 0), (1, M - 1)):
        if not cap[end]: continue
        k = len(verts); z = rows[j][0]; yc = rows[j][3] if len(rows[j]) > 3 else 0.; verts.append((0, yc, z))
        for i in range(N):
            faces.append((k, j * N + i, j * N + (i + 1) % N)); uvs.append(((.5, V(j / (M - 1))), (i / N, V(j / (M - 1))), ((i + 1) / N, V(j / (M - 1)))))
    return mesh(name, verts, faces, uvs, chart, group)

# ============================================================== HEAD SKIN: CDT on the ball, eyelid / nose / mouth loops
pts = []; cons = []; tags = {}
def add_loop(P, tag, closed=True):
    i0 = len(pts); pts.extend([tuple(p) for p in P]); n = len(P)
    for i in range(n if closed else n - 1): cons.append((i0 + i, i0 + (i + 1) % n))
    tags[tag] = list(range(i0, i0 + n)); return tags[tag]
def surf_dir(x, z):
    y = front_hit(x, z); return unit(np.stack([np.asarray(x, float) * np.ones_like(y), y, np.asarray(z, float) * np.ones_like(y)], -1) - O)

NE = 44
EYE_SCALES = [1.0, 1.07, 1.15, 1.24, 1.34, 1.45]
eye_dom = {}
for s in (-1, 1):
    psi = np.linspace(0, 2 * PI, NE, endpoint=False)
    x, z = eye_xz(s, psi); base = to_dom(surf_dir(x, z)); c = to_dom(surf_dir(np.array([s * EX]), np.array([EZ])))[0]
    eye_dom[s] = (c, base)
    wn = (1 - .45 * smooth(-.10, -.80, np.cos(psi))) * (1 - .30 * smooth(-.2, -.9, np.sin(psi)))   # tighter toward the nose / mouth
    for k, kk in enumerate(EYE_SCALES): add_loop(c + (base - c) * (1 + (kk - 1) * wn[:, None]), 'eye%d_%d' % (s, k))
pts.append(tuple(to_dom(surf_dir(np.array([0.]), np.array([NZ])))[0])); tags['nose_c'] = [len(pts) - 1]
NOSE_LOOPS = [(.006, 12), (.012, 18), (.019, 26), (.026, 34)]   # round 4: fine rings (no 'flower' shading)
# concentric circles in the domain (the steep nose flank folds front-projected rings), sized by the front radius
_nc = np.array(pts[tags['nose_c'][0]])
for k, (rr, n) in enumerate(NOSE_LOOPS):
    a = np.linspace(0, 2 * PI, n, endpoint=False) + .3 * k
    _ref = to_dom(surf_dir(rr * W * np.cos(a), NZ + rr * W * np.sin(a)))
    rd = float(np.median(np.linalg.norm(_ref - _nc, axis=1)))
    if k: rd = max(rd, _rd_prev * 1.3)
    _rd_prev = rd; print('NOSE_LOOP', k, rd, flush=True)
    add_loop(_nc + rd * np.stack([np.cos(a), np.sin(a)], -1), 'nose_%d' % k)
MOUTH_LOOPS = [(.090, .018, .026), (.102, .022, .034), (.114, .026, .042)]
for k, (hx, ht, hb) in enumerate(MOUTH_LOOPS):
    a = np.linspace(0, 2 * PI, 36, endpoint=False)
    add_loop(to_dom(surf_dir(hx * W * spow(np.cos(a), .8), MC + np.where(np.sin(a) > 0, ht, hb) * W * np.sin(a))), 'mouth_%d' % k)
NB = 12; AB = math.radians(176)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
# fill: a dense Fibonacci set of directions thinned to a spacing field (fine on the eyes / brows / nose / mouth band,
# medium on the face and crown, coarser on the back), deterministic greedy order
NF = 60000; ii = np.arange(NF) + .5
phi = np.arccos(1 - 2 * ii / NF); th = PI * (1 + 5 ** .5) * ii
D = np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
alpha = np.arccos(np.clip(-D[:, 1], -1, 1)); D = D[alpha < math.radians(173.5)]
Pf = radial_hit(D); q = M2L(Pf)
alpha = np.arccos(np.clip(-D[:, 1], -1, 1))
band = smooth(.50, .40, np.abs(q[:, 0])) * smooth(.04, .12, q[:, 2]) * smooth(.66, .58, q[:, 2]) * smooth(math.radians(80), math.radians(66), alpha)
hsp = .0180 + (.0295 - .0180) * smooth(math.radians(100), math.radians(125), alpha)
hsp = hsp * (1 - band) + .0096 * band
order = np.argsort(-band * 2 + np.arange(len(D)) / len(D), kind='stable')   # the band first, then Fibonacci order
cell = float(hsp.max()); grid = {}; keepi = []
for i in order:
    p = Pf[i]; key = tuple(np.floor(p / cell).astype(int)); ok = True
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                for j in grid.get((key[0] + dx, key[1] + dy, key[2] + dz), ()):
                    if np.sum((Pf[j] - p) ** 2) < (.40 * (hsp[i] + hsp[j])) ** 2:
                        ok = False; break
                if not ok: break
            if not ok: break
    if ok:
        grid.setdefault(key, []).append(i); keepi.append(i)
keepi = np.array(sorted(keepi)); D = D[keepi]; Pf = Pf[keepi]
dom = to_dom(D)
def eye_ring_rr(dp):
    best = np.full(len(dp), 9.)
    for s in (-1, 1):
        c, base = eye_dom[s]
        outer = np.array([pts[i] for i in tags['eye%d_%d' % (s, len(EYE_SCALES) - 1)]])
        ang_b = np.arctan2(outer[:, 1] - c[1], outer[:, 0] - c[0]); rad_b = np.linalg.norm(outer - c, axis=1)
        order_ = np.argsort(ang_b); ab = np.concatenate([ang_b[order_] - 2 * PI, ang_b[order_], ang_b[order_] + 2 * PI]); rb = np.tile(rad_b[order_], 3)
        v = dp - c; best = np.minimum(best, np.linalg.norm(v, axis=1) / np.interp(np.arctan2(v[:, 1], v[:, 0]), ab, rb))
    return best
keep = eye_ring_rr(dom) > 1.06
frontp = Pf[:, 1] < HY
keep &= ~(frontp & ((Pf[:, 0] / W) ** 2 + ((Pf[:, 2] - NZ) / W) ** 2 < .033 ** 2))
mz = (Pf[:, 2] - MC) / W
keep &= ~(frontp & ((Pf[:, 0] / (.124 * W)) ** 2 + (mz / np.where(mz > 0, .032, .050)) ** 2 < 1))
keep &= np.arccos(np.clip(-D[:, 1], -1, 1)) < math.radians(173.0)
fill0 = len(pts); pts.extend([tuple(p) for p in dom[keep]])
LOG['skin_fill_points'] = int(keep.sum())
def in_poly(P, poly):
    x = P[:, 0]; y = P[:, 1]; inside = np.zeros(len(P), bool); n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        inside ^= ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-30) + x1)
    return inside
def loop_clash():
    """names of constraint loops whose segments cross (diagnostic)"""
    P = np.array(pts); segs = []; owner = []
    for tg, ids in tags.items():
        if len(ids) < 3: continue
        for i in range(len(ids)): segs.append((ids[i], ids[(i + 1) % len(ids)])); owner.append(tg)
    A = P[[a for a, b in segs]]; B = P[[b for a, b in segs]]; out = set()
    def cr(o, a, b): return (a[..., 0] - o[..., 0]) * (b[..., 1] - o[..., 1]) - (a[..., 1] - o[..., 1]) * (b[..., 0] - o[..., 0])
    for i in range(len(segs)):
        d1 = cr(A[i], B[i], A); d2 = cr(A[i], B[i], B); d3 = cr(A, B, A[i][None]); d4 = cr(A, B, B[i][None])
        hit = (d1 * d2 < 0) & (d3 * d4 < 0)
        for j in np.where(hit)[0]:
            if owner[j] != owner[i]: out.add(tuple(sorted((owner[i], owner[j]))))
    return sorted(out)
_cl = loop_clash()
if _cl: print('LOOP_CLASH', _cl, flush=True)
fill_xy = np.array(pts[fill0:])
res = delaunay_2d_cdt([Vector(p) for p in pts], cons, [], 0, 1e-9)
vout, fout, orig_v = res[0], res[2], res[3]
assert len(vout) == len(pts), ('CDT added or merged vertices: constraint loops intersect', len(vout), len(pts))
out_of = {}
for oi, lst in enumerate(orig_v):
    for k in lst: out_of[k] = oi
dom_out = np.array([[v.x, v.y] for v in vout]); F = np.array([list(f) for f in fout])
cent = dom_out[F].mean(1); hole = np.zeros(len(F), bool)
for s in (-1, 1): hole |= in_poly(cent, dom_out[[out_of[k] for k in tags['eye%d_0' % s]]])
F = F[~hole]
skin_d = from_dom(dom_out); skin_p = radial_hit(skin_d); skin_n = grad_n(skin_p)
verts = [tuple(p) for p in skin_p]; vdir = list(skin_d); vnorm = list(skin_n)
faces = [tuple(f) for f in F]
# the back pole cap
bound = [out_of[k] for k in tags['bound']]
pd = np.array([[0, 1., 0]]); pp = radial_hit(pd); pole = len(verts)
verts.append(tuple(pp[0])); vdir.append(pd[0]); vnorm.append(grad_n(pp)[0])
for i in range(NB): faces.append((bound[i], bound[(i + 1) % NB], pole))
# eyelid roll: the hole edge tucks into the head behind the lens globe (no visible gap)
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
RIM_L = np.array([verts[i] for i in roll_info[1][0]])
vdir = unit(np.array(vdir)); vnorm = np.array(vnorm)
fuv = head_uv(vdir); buv = headback_uv(vdir)
face_uvs = []
NOSE_CH = .060          # round 4: the nose button gets its own front-projected chart (half-size in W)
_VA = np.array(verts); _nose_v = (_VA[:, 1] < HY) & (np.hypot(_VA[:, 0] / W, (_VA[:, 2] - NZ) / W) < .046)
def nose_uv(i): return au('nose', .5 + _VA[i, 0] / (2 * NOSE_CH * W), .5 + (_VA[i, 2] - NZ) / (2 * NOSE_CH * W))
LOG['nose_chart_faces'] = 0
for f in faces:
    a = math.acos(float(np.clip(-vdir[list(f)].mean(0)[1] / np.linalg.norm(vdir[list(f)].mean(0)), -1, 1)))
    if all(_nose_v[i] for i in f):
        face_uvs.append(tuple(nose_uv(i) for i in f)); LOG['nose_chart_faces'] += 1
    elif a < A_SPLIT: face_uvs.append(tuple(tuple(au('head', *fuv[i])) for i in f))
    else: face_uvs.append(tuple(tuple(au('headback', *buv[i])) for i in f))
skin = mesh('mochi_head_skin', verts, faces, face_uvs, 'head', 'head', raw_uv=True, normals=vnorm)
LOG['skin_vertices'] = len(verts); LOG['skin_faces'] = len(faces)

# ============================================================== EYES: flush lens globes following the ball
ES = [0, .12, .25, .38, .51, .63, .74, .84, .92, .98, 1.10]
NSEG = 30
eye_centers = {}
def eye_h(k): return (.0016 - .0042 * k * k) * SW
for s, tag in ((-1, 'R'), (1, 'L')):
    psi = np.linspace(0, 2 * PI, NSEG, endpoint=False)
    rows = []
    cx = s * EX; Sc = np.array([cx, float(front_hit(cx, EZ)[0]), EZ]); axis = grad_n(Sc[None])[0]
    for k in ES:
        if k == 0: x = np.array([cx]); z = np.array([EZ])
        else: x, z = eye_xz(s, psi, k)
        y = front_hit(x, z); S = np.stack([x, y, z], -1); n = grad_n(S)
        rows.append(S + n * eye_h(k))
    rim = rows[-1]
    for depth, sc in [(.010 * SW, .86), (.020 * SW, .58)]:
        rows.append(Sc + (rim - Sc) * sc - axis * depth)
    tip = Sc - axis * .026 * SW
    def euv(px, pz): return (.5 + (px - cx) / (2.4 * EHW), .5 + (pz - EZ) / (2.4 * EHH))
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
    mesh('eyeball.' + tag, V, fs, [tuple(UVs[k] for k in f) for f in fs], 'eye.' + tag, 'eye.' + tag, sharp=sharp_ring)
    eye_centers[tag] = [float(v) for v in (Sc - axis * .013 * SW)]
    LOG['eye_axis_' + tag] = {'out_deg': round(math.degrees(math.atan2(s * axis[0], -axis[1])), 1),
                              'down_deg': round(math.degrees(math.asin(-axis[2])), 1)}

# ============================================================== EARS: soft, upright rounded-cone cat ears with a pink dish
# round 2: a smooth parametric surface (rounded cone, puffy rim, shallow dish) with exact normals from its parametric
# derivatives; the axis leans 17 deg outward; the tip lands exactly at the sheet's tip (x 0.39 W, 0.14 W over the crown)
EAR = dict(r1=.182 * W, r2=.042 * W, sy=.72, flat=.88, hollow=.012 * W, rim=.050 * W, sink=.035 * W, tilt=17., yaw=12., lean=-6., bulge=.018 * W)
EAR_TIP_LOCAL = np.array([.370, .070, .935])          # W units: x, y behind the head centre, z above the chin
def ear_frame(s):
    T = L2M(np.array([s * EAR_TIP_LOCAL[0], EAR_TIP_LOCAL[1], EAR_TIP_LOCAL[2]]))
    tr = math.radians(EAR['tilt']); lr = math.radians(EAR['lean']); w = unit(np.array([s * math.sin(tr), math.sin(lr), math.cos(tr)]))
    lo, hi = 0., .60                                   # walk down the axis from the tip to the skin
    for _ in range(40):
        m = (lo + hi) / 2
        if head_sdf((T - w * m)[None])[0] < 0: hi = m
        else: lo = m
    S = T - w * hi
    yr = math.radians(EAR['yaw']); f0 = np.array([s * math.sin(yr), -math.cos(yr), 0.]); f = unit(f0 - w * (f0 @ w))
    t = s * np.cross(f, w); C = S - w * EAR['sink']
    L = float(np.linalg.norm(T - C)) - EAR['r2']
    return dict(T=T, S=S, C=C, w=w, f=f, t=t, L=L)
def ear_profile_fn(L):
    r1, r2 = EAR['r1'], EAR['r2']; b = math.asin((r1 - r2) / L)
    arc2 = r2 * (PI / 2 - b); line = math.sqrt(L * L - (r1 - r2) ** 2); arc1 = r1 * (PI / 2 + b); tot = arc2 + line + arc1
    P2 = np.array([r2 * math.cos(b), L + r2 * math.sin(b)]); P1 = np.array([r1 * math.cos(b), r1 * math.sin(b)])
    def prof_at(st):
        st = np.asarray(st, float); out = np.zeros(st.shape + (2,))
        m1 = st <= arc2; ang = PI / 2 - st / r2; out[m1] = np.stack([r2 * np.cos(ang), L + r2 * np.sin(ang)], -1)[m1]
        m2 = (st > arc2) & (st <= arc2 + line); tt = ((st - arc2) / line)[..., None]
        nrm = np.array([P2[1] - P1[1], P1[0] - P2[0]]); nrm = nrm / np.linalg.norm(nrm)    # outward normal of the cone side
        out[m2] = (P2 + (P1 - P2) * tt + nrm * (EAR['bulge'] * np.sin(PI * tt)))[m2]          # convex, soft sides
        m3 = st > arc2 + line; ang = b - (st - arc2 - line) / r1; out[m3] = np.stack([r1 * np.cos(ang), r1 * np.sin(ang)], -1)[m3]
        return out
    return prof_at, (arc2, line, arc1, tot)
def ear_points(E, prof_at, tot, tv, a):
    """tv: arc fraction from the tip (0) to the buried base pole (1); a: angle round the axis (pi/2 = the front middle)"""
    pr = prof_at(tv * tot); rho, zz = pr[..., 0], pr[..., 1]
    ca, sa = np.cos(a), np.sin(a); u = rho * ca
    hz = (zz - EAR['sink']) / (E['L'] + EAR['r2'] - EAR['sink'])
    inner = np.maximum(rho - EAR['rim'], 1e-6); k_ = np.abs(u) / inner
    hfade = smooth(.06, .24, hz) * (1 - smooth(.38, .70, hz)) * smooth(.03 * W, .09 * W, inner)   # ends ~0.07 W before the tip, softly
    dish = EAR['hollow'] * np.clip(1 - k_ * k_, 0, 1) ** 1.5 * hfade      # a shallow, gentle dish (no shaded pocket)
    v = np.where(sa > 0, rho * EAR['sy'] * sa * (1 - (1 - EAR['flat']) * sa * sa) - dish, rho * EAR['sy'] * sa)   # C1 across the rim edge
    return E['C'] + E['t'] * u[..., None] + E['f'] * v[..., None] + E['w'] * zz[..., None], hz
ear_info = {}; EAR_TABLE = {}
for s in (-1, 1):
    tag = 'L' if s > 0 else 'R'
    E = ear_frame(s); prof_at, (arc2, line, arc1, tot) = ear_profile_fn(E['L'])
    nrow, seg = 34, 36
    uu = np.linspace(0, 1, nrow + 1)
    tv = np.interp(uu, [0, .20, .84, 1.0], [0, arc2 / tot, (arc2 + line) / tot, 1.0])   # dense rows round the tip
    V = []; UVs = []; NV = []
    for j, t_ in enumerate(tv):
        if j in (0, nrow):
            p, _ = ear_points(E, prof_at, tot, np.array([t_]), np.array([PI / 2]))
            V.append(tuple(p[0])); UVs.append((.5, 1 - t_)); NV.append(E['w'] if j == 0 else -E['w']); continue
        a = 2 * PI * np.arange(seg) / seg - PI / 2
        p, _ = ear_points(E, prof_at, tot, np.full(seg, t_), a)
        e = 1e-4
        dt = ear_points(E, prof_at, tot, np.full(seg, min(1, t_ + e)), a)[0] - ear_points(E, prof_at, tot, np.full(seg, max(0, t_ - e)), a)[0]
        da = ear_points(E, prof_at, tot, np.full(seg, t_), a + e)[0] - ear_points(E, prof_at, tot, np.full(seg, t_), a - e)[0]
        nn = unit(np.cross(da, dt)); axis_pt = E['C'] + E['w'] * prof_at(np.array([t_ * tot]))[0, 1]
        out = p - axis_pt; nn = np.where(((nn * out).sum(1) < 0)[:, None], -nn, nn)
        for i in range(seg): V.append(tuple(p[i])); UVs.append((i / seg, 1 - t_)); NV.append(nn[i])
    fs = []; uvf = []
    ix = lambda j, i: 1 + (j - 1) * seg + i % seg
    for i in range(seg):
        fs.append((0, ix(1, i), ix(1, i + 1))); uvf.append(((.5, 1.), (i / seg, UVs[ix(1, i)][1]), ((i + 1) / seg, UVs[ix(1, i)][1])))
    for j in range(1, nrow - 1):
        for i in range(seg):
            fs.append((ix(j, i), ix(j + 1, i), ix(j + 1, i + 1), ix(j, i + 1)))
            v0 = UVs[ix(j, 0)][1]; v1 = UVs[ix(j + 1, 0)][1]
            uvf.append(((i / seg, v0), (i / seg, v1), ((i + 1) / seg, v1), ((i + 1) / seg, v0)))
    last = len(V) - 1
    for i in range(seg):
        v0 = UVs[ix(nrow - 1, 0)][1]; fs.append((ix(nrow - 1, i), last, ix(nrow - 1, i + 1))); uvf.append(((i / seg, v0), (.5, 0.), ((i + 1) / seg, v0)))
    mesh('cat_ear.' + tag, V, fs, uvf, 'ear.' + tag, 'ear.' + tag, normals=np.array(NV))
    ear_info[s] = E
    tf = np.linspace(0, 1, 400); pr = prof_at(tf * tot)
    EAR_TABLE[s] = dict(V=(1 - tf)[::-1], rho=pr[::-1, 0], hz=((pr[:, 1] - EAR['sink']) / (E['L'] + EAR['r2'] - EAR['sink']))[::-1])
    LOG['ear_' + tag] = {'tip_m': [round(float(c), 4) for c in E['T']], 'base_on_skin_m': [round(float(c), 4) for c in E['S']],
                         'L_W': round(E['L'] / W, 3), 'half_angle_deg': round(math.degrees(math.asin((EAR['r1'] - EAR['r2']) / E['L'])), 1)}

# ============================================================== BODY AND COSTUME
# --- kimono torso (hidden under the obi below z .375; the top tucks up inside the head)
TORSO = [(.372, .150, .133), (.400, .157, .139), (.430, .158, .137), (.455, .152, .131), (.475, .140, .122),
         (.495, .121, .106), (.515, .100, .090), (.540, .088, .080), (.570, .082, .075)]
TOR_Z = np.array([r[0] for r in TORSO]); TOR_AX = np.array([r[1] for r in TORSO]); TOR_AY = np.array([r[2] for r in TORSO])
TOR_N = 2.3
lathe('kimono_torso', TORSO, 'kimono', 'body', 60, TOR_N, cap=(False, True))
def torso_front(x, z):
    ax = np.interp(z, TOR_Z, TOR_AX); ay = np.interp(z, TOR_Z, TOR_AY)
    return -ay * np.clip(1 - np.abs(x / ax) ** TOR_N, 0, 1) ** (1 / TOR_N)
def torso_normal(x, z):
    e = 1e-4; y = torso_front(x, z)
    dx = (torso_front(x + e, z) - torso_front(x - e, z)) / (2 * e); dz = (torso_front(x, z + e) - torso_front(x, z - e)) / (2 * e)
    n = np.array([dx, -1., dz]); return n / np.linalg.norm(n)
# --- the crossed white collar: two thick rounded bands lying on the chest (her left panel on top)
def collar_band(name, s, lift):
    # from her s-side neck down across the chest to the opposite hip, under the obi
    ctrl = [(s * .080, .532), (s * .072, .505), (s * .050, .466), (s * .018, .414), (-s * .026, .376), (-s * .050, .352)]
    P = [catmull(ctrl, t) for t in np.linspace(0, 1, 40)]
    verts = []; faces = []; uvs = []; nsec = 10; half_w = .019; thick = .0085
    for j, p in enumerate(P):
        x, z = p.x, p.y; y = torso_front(x, z); n = torso_normal(x, z)
        if j < len(P) - 1: d = np.array([P[j + 1].x - x, 0, P[j + 1].y - z])
        else: d = np.array([x - P[j - 1].x, 0, z - P[j - 1].y])
        d = d - n * (d @ n); d /= np.linalg.norm(d); side = np.cross(n, d)
        base = np.array([x, y, z]) + n * lift
        for i in range(nsec):
            a = PI * i / (nsec - 1)                       # a half-round section, flat back on the chest
            verts.append(tuple(base + side * (half_w * math.cos(a)) + n * (thick * math.sin(a) ** .7)))
        # the flat underside
    nr = len(P)
    for j in range(nr - 1):
        for i in range(nsec - 1):
            faces.append((j * nsec + i, j * nsec + i + 1, (j + 1) * nsec + i + 1, (j + 1) * nsec + i))
            uvs.append(((i / (nsec - 1), j / (nr - 1)), ((i + 1) / (nsec - 1), j / (nr - 1)), ((i + 1) / (nsec - 1), (j + 1) / (nr - 1)), (i / (nsec - 1), (j + 1) / (nr - 1))))
        faces.append((j * nsec + nsec - 1, j * nsec, (j + 1) * nsec, (j + 1) * nsec + nsec - 1))
        uvs.append(((1, j / (nr - 1)), (0, j / (nr - 1)), (0, (j + 1) / (nr - 1)), (1, (j + 1) / (nr - 1))))
    for j in (0, nr - 1):
        faces.append(tuple(range(j * nsec, j * nsec + nsec))); uvs.append(tuple((.5, j / (nr - 1)) for _ in range(nsec)))
    return mesh(name, verts, faces, uvs, 'collar', 'body')
collar_band('collar_band_under', -1, -.002)
collar_band('collar_band_over', 1, .0015)
# --- obi: a thick rounded band, and the flat pillow knot at the back
OBI = [(.268, .150, .134), (.272, .162, .145), (.280, .170, .153), (.298, .174, .157), (.335, .175, .158),
       (.372, .174, .157), (.388, .170, .153), (.395, .162, .145), (.399, .150, .134)]
OBI_Z = np.array([r[0] for r in OBI]); OBI_AX = np.array([r[1] for r in OBI]); OBI_AY = np.array([r[2] for r in OBI])
lathe('obi_sash', OBI, 'obi', 'body', 64, 2.4)
blob('obi_back_knot', (0, .181, .334), (.090, .040, .060), 'bow', 'body', 24, 12, p=(.62, .75, .62))
# --- the paintbrush tucked in the obi at her left front (thick and simple)
def obi_front(x, z):
    ax = np.interp(z, OBI_Z, OBI_AX); ay = np.interp(z, OBI_Z, OBI_AY)
    return -ay * np.clip(1 - np.abs(x / ax) ** 2.4, 0, 1) ** (1 / 2.4)
BR0 = np.array([.111, float(obi_front(.112, .335)) - .016 - .002, .226]); BR1 = np.array([.124, float(obi_front(.112, .335)) - .016 + .030, .446])
def brush_pt(t): return BR0 + (BR1 - BR0) * t
sweep('brush_handle', [brush_pt(t) for t in np.linspace(0, .62, 12)], lambda s, L: .0125 if s > .006 else .0125 * math.sqrt(max(0, 1 - ((.006 - s) / .006) ** 2)) + .004,
      'brush', 'body', rings=14, sides=14, vrange=(0., .45))
sweep('brush_ferrule', [brush_pt(t) for t in np.linspace(.60, .73, 5)], lambda s, L: .0142, 'brush', 'body', rings=4, sides=14, vrange=(.50, .60))
def bristle_r(s, L):
    t = s / L; return .0165 * (math.sin(min(1, t / .30) * PI / 2) ** .6 if t < .30 else (1 - ((t - .30) / .70) ** 1.6) ** .75) + .0006
sweep('brush_bristles', [brush_pt(t) for t in np.linspace(.71, 1.0, 14)], bristle_r, 'brush', 'body', rings=16, sides=14, vrange=(.65, 1.0))
# --- the A-line skirt with soft folds and a rolled hem (inner face so the edge is never paper thin)
SK = [(.300, .150, .134), (.282, .161, .144), (.255, .172, .153), (.220, .186, .164), (.185, .199, .174),
      (.150, .212, .184), (.120, .225, .192), (.103, .234, .197), (.096, .234, .197), (.092, .229, .193),
      (.094, .223, .188), (.110, .218, .183), (.150, .208, .175)]
def skirt_fold(a, t):
    tt = min(1., t / .55); return 1 + (.020 * math.cos(7 * a + .4) + .006 * math.cos(13 * a + 1.1)) * tt ** 1.4
SK = [(.300 - (.300 - z) * (.300 - .130) / (.300 - .096), ax, ay) for z, ax, ay in SK]   # round 2: the hem up 3.4 cm, same shape
lathe('a_line_skirt', SK, 'skirt', 'body', 84, 2.2, fold=skirt_fold)
# --- arms: kimono sleeves (wide, short, a rolled opening), short arms, mitten paws
ARM_ANG = math.radians(30)
joint_arms = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    grp = 'arm.' + tag
    Sh = np.array([s * .128, .025, .452]); Dv = np.array([s * math.sin(ARM_ANG), 0, -math.cos(ARM_ANG)])
    Pv = np.array([s * math.cos(ARM_ANG), 0, math.sin(ARM_ANG)]); Yv = np.array([0, 1., 0])
    # sleeve: outer surface, rolled lip, inner surface back into the sleeve, closed (hidden) inner end
    T0, T1 = -.050, .193
    prof_s = []
    for t in np.linspace(T0, T1, 9):
        k = (t - T0) / (T1 - T0)
        a_ = .032 + (.097 - .032) * math.sin(min(1., k / .40) * PI / 2) ** .75 + .005 * smooth(.4, 1., k)
        b_ = .028 + (.083 - .028) * math.sin(min(1., k / .40) * PI / 2) ** .75
        prof_s.append((t, a_, b_, -.010 * k))
    lip = [(T1 + .005, -.004, -.004), (T1 + .007, -.0095, -.0095), (T1 + .004, -.015, -.015), (T1 - .004, -.017, -.017),
           (T1 - .030, -.017, -.017), (T1 - .060, -.019, -.019)]
    tl, al, bl, sg = prof_s[-1]
    for (t, da, db) in lip: prof_s.append((t, al + da, bl + db, sg))
    N = 32; verts = []; faces = []; uvs = []; M = len(prof_s)
    for j, (t, a_, b_, sg) in enumerate(prof_s):
        c = Sh + Dv * t - Pv * sg
        for i in range(N):
            ph = 2 * PI * i / N
            verts.append(tuple(c + Pv * (a_ * spow(math.cos(ph), 2 / 2.6)) + Yv * (b_ * spow(math.sin(ph), 2 / 2.6))))
    for j in range(M - 1):
        for i in range(N):
            ni = (i + 1) % N; faces.append((j * N + i, j * N + ni, (j + 1) * N + ni, (j + 1) * N + i))
            uvs.append(((i / N, j / (M - 1)), ((i + 1) / N, j / (M - 1)), ((i + 1) / N, (j + 1) / (M - 1)), (i / N, (j + 1) / (M - 1))))
    for j in (0, M - 1):
        k = len(verts); t, a_, b_, sg = prof_s[j]; verts.append(tuple(Sh + Dv * t - Pv * sg))
        for i in range(N): faces.append((k, j * N + i, j * N + (i + 1) % N)); uvs.append(((.5, j / (M - 1)), (i / N, j / (M - 1)), ((i + 1) / N, j / (M - 1))))
    mesh('kimono_sleeve.' + tag, verts, faces, uvs, 'sleeve', grp)
    sweep('short_arm.' + tag, [Sh + Dv * t for t in np.linspace(-.02, .240, 8)], lambda s_, L: .040, 'skin', grp, rings=10, sides=16)
    orient = Matrix([list(Pv), list(Yv), list(Dv)]).transposed()
    blob('mitten_paw.' + tag, tuple(Sh + Dv * .264), (.058, .053, .066), 'paw', grp, 22, 12, p=(.92, .92, .92), orient=orient)
    joint_arms[tag] = {'shoulder': [float(v) for v in Sh], 'elbow': [float(v) for v in Sh + Dv * .12],
                       'wrist': [float(v) for v in Sh + Dv * .230], 'hand': [float(v) for v in Sh + Dv * .264]}
# --- legs and rounded feet
joint_legs = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    grp = 'leg.' + tag
    sweep('stubby_leg.' + tag, [(s * .104, .004, .305), (s * .104, .000, .200), (s * .104, -.004, .060)], lambda s_, L: .055, 'skin', grp, rings=8, sides=16)
    blob('rounded_foot.' + tag, (s * .104, -.022, .040), (.065, .085, .040), 'foot', grp, 28, 14, p=(.82, .82, .80))   # 0.13 x 0.17 x 0.08 m
    joint_legs[tag] = {'hip': [s * .104, .004, .300], 'knee': [s * .104, .000, .175], 'ankle': [s * .104, -.004, .070], 'toe': [s * .104, -.100, .035]}
# --- tail: long, thick, curving down then up and out behind her right side; a club tip (bend loops all along)
TAIL_CTRL = [(.000, .100, .300), (-.004, .182, .268), (-.014, .250, .205), (-.032, .318, .165), (-.056, .388, .170),
             (-.072, .428, .200), (-.078, .446, .235)]   # round 4: the club behind her (0.08 m to her right)
tpath = [catmull(TAIL_CTRL, t) for t in np.linspace(0, 1, 80)]
dl = (tpath[-1] - tpath[-2]).normalized()
TAIL_RB = .090
tpath += [tpath[-1] + dl * (TAIL_RB * k / 6) for k in range(1, 7)]
def tail_r(s, L):
    t = s / L; se = L - TAIL_RB
    r = float(np.interp(t, [0, .40, .58, .70, .80, .88, 1.0], [.048, .042, .043, .056, .078, .089, .090]))
    if s > se: r = min(r, TAIL_RB * math.sqrt(max(0., 1 - ((s - se) / TAIL_RB) ** 2)))
    return max(r, .0015)
def tail_rings(L):
    return L * np.concatenate([np.linspace(0, .80, 24), .80 + .20 * np.sin(np.linspace(0, 1, 17)[1:] * PI / 2)])
tail_ob, TAIL_L = sweep('long_calico_tail', tpath, tail_r, 'tail', 'tail', rings=tail_rings, sides=16, caps=(True, True))
TAIL_JOINTS = [[float(v) for v in catmull(TAIL_CTRL, t)] for t in (0, .25, .5, .75, 1.0)]

# ============================================================== PAINTED ATLAS (2048, deterministic PNG)
def stroke(x, z, P, half, aa):
    best = np.full(len(x), 9.)
    for i in range(len(P) - 1):
        a = P[i]; b = P[i + 1]; ab = b - a; L2 = ab @ ab
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        dx = x - (a[0] + t * ab[0]); dz = z - (a[1] + t * ab[1])
        best = np.minimum(best, np.sqrt(dx * dx + dz * dz) - (half[i] * (1 - t) + half[i + 1] * t))
    return 1 - smooth(-aa, aa, best)
def poly_sd(x, z, poly):
    """signed distance to a closed polygon (negative inside), vectorised"""
    P = np.asarray(poly, float); n = len(P); best = np.full(len(x), 9.)
    inside = np.zeros(len(x), bool)
    for i in range(n):
        a = P[i]; b = P[(i + 1) % n]; ab = b - a; L2 = ab @ ab
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        best = np.minimum(best, np.hypot(x - (a[0] + t * ab[0]), z - (a[1] + t * ab[1])))
        inside ^= ((a[1] > z) != (b[1] > z)) & (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1] + 1e-30) + a[0])
    return np.where(inside, -best, best)
def smax(a, b, k):
    return -smin(-a, -b, k)
# calico patches (W units), measured on the sheet: the face patch in front projection (her right, -X), the back
# patch in back projection; both have rounded borders where they wrap round the head
PATCH_FACE = [(-.115, .86), (-.082, .745), (-.077, .690), (-.057, .637), (-.037, .583), (-.023, .530), (-.017, .477),
              (-.017, .450), (-.021, .423), (-.031, .370), (-.047, .318), (-.061, .290), (-.079, .262), (-.102, .238),
              (-.124, .222), (-.150, .209), (-.200, .200), (-.260, .198), (-.320, .204), (-.365, .214), (-.405, .222),
              (-.440, .228), (-.462, .236), (-.482, .254), (-.505, .300), (-.75, .32), (-.75, .86)]
PATCH_BACK = [(-.098, .615), (-.012, .578), (.020, .544), (.041, .511), (.049, .479), (.049, .446), (.041, .414),
              (.033, .381), (.020, .348), (.004, .316), (-.004, .283), (-.012, .251), (-.016, .218), (-.020, .186),
              (-.033, .153), (-.057, .121), (-.102, .090), (-.180, .072), (-.260, .078), (-.305, .088), (-.366, .121),
              (-.398, .153), (-.423, .186), (-.439, .218), (-.451, .251), (-.459, .283), (-.463, .316), (-.463, .348),
              (-.459, .381), (-.451, .414), (-.439, .446), (-.419, .479), (-.386, .511), (-.313, .544), (-.244, .576),
              (-.170, .604)]
# the patches follow the eye's lower rim (the eye sits on the cream / orange edge, as on the sheet)
def patch_alpha(q, aa=.0035):
    x, y, z = q[:, 0], q[:, 1], q[:, 2]
    ylim = .06 + .12 * smooth(.45, .75, z)
    dF = smax(poly_sd(x, z, PATCH_FACE), (y - ylim), .07)
    dB = smax(poly_sd(x, z, PATCH_BACK), (-.02 - y), .07)
    return 1 - smooth(-aa, aa, np.minimum(dF, dB))
def lash_th(psi):      # thick on top, down the outer side to ~45 deg below, tapering to the inner corner
    S = np.sin(np.clip(psi, 0, PI))
    return (.15 + .16 * S ** .8) * (1 - smooth(2.40, 2.95, psi)) * smooth(-.88, -.30, psi)
def paint_head(d): return paint_head_P(radial_hit(d))
def paint_head_P(P):
    n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); zr = q[:, 2]
    fr = smooth(HY + .03, HY - .07, y)
    C = np.broadcast_to(rgb('fur'), (len(x), 3)).copy()
    pa = patch_alpha(q)
    C = mix(C, rgb('orange'), pa)
    # soft painted shade: under the jaw and toward the neck; a little warmth low on the cheeks
    under = smooth(-.25, -.85, n[:, 2]) * (1 - smooth(.10, .26, zr))
    C = mix(C, mix(rgb('furshade'), rgb('orangeshade'), pa), .80 * under)
    jaw = smooth(.40, .85, np.abs(n[:, 0])) * (1 - smooth(.16, .46, zr))           # round 2: warm shade at the jaw's sides
    C = mix(C, mix(rgb('furshade'), rgb('orangeshade'), pa), .60 * jaw)
    C = mix(C, rgb('#ffe6dc'), .22 * fr * (1 - smooth(.10, .30, zr)) * (1 - pa))
    for s in (-1, 1):   # contact shade at the ear bases
        ei = ear_info[s]; dd = np.linalg.norm(P - ei['S'], axis=1)
        C = mix(C, mix(rgb('furshade'), rgb('orangeshade'), pa), .30 * np.exp(-(dd / (.11 * W)) ** 2))
    # nose: a rounded inverted triangle and a soft highlight
    nx = x / W; nzz = (z - CHIN) / W
    tri = poly_sd(nx, nzz, [(-.0245, .2195), (.0245, .2195), (0, .1925)]) - .0090
    C = mix(C, rgb('nose'), (1 - smooth(-.0020, .0020, tri)) * fr * (nzz > .15))
    hl = np.exp(-(((nx + .006) / .0075) ** 2 + ((nzz - .2205) / .0045) ** 2))      # one small soft highlight on its top
    C = mix(C, rgb('#dea2a8'), .45 * hl * fr * (1 - smooth(-.002, .002, tri)))
    # blush ovals
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .82 * (1 - smooth(.45, 1.08, r)) * fr)
    # brows: soft arcs tapering to rounded points
    t = np.linspace(-1, 1, 15)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * .054 * W * t, BROW_Z + .019 * W * (1 - t * t) - .009 * W], -1)
        half = .0105 * W * np.maximum(0, 1 - t * t) ** .65 + .0018 * W
        box = fr * ((np.abs(x - s * BROW_X) < .10 * W) & (np.abs(z - BROW_Z) < .06 * W))
        a = np.zeros(len(x)); ib = box > 0
        a[ib] = stroke(x[ib], z[ib], Pb, half, .0030 * W)
        C = mix(C, rgb('brow'), .96 * a * fr)
    # mouth: a small cat "w" with curled corners, and a short line up to the nose
    t = np.linspace(-1, 1, 41)
    Pm = np.stack([MHW * t, CHIN + (.130 + .027 * ((np.abs(t) - .5) / .5) ** 2) * W], -1)
    Pm = np.concatenate([[[-MHW - .008 * W, CHIN + .165 * W]], Pm, [[MHW + .008 * W, CHIN + .165 * W]]])
    half = np.concatenate([[.0028 * W], .0062 * W - .0012 * W * np.abs(t), [.0028 * W]])
    ib = (fr > 0) & (np.abs(x) < .12 * W) & (np.abs(z - (CHIN + .15 * W)) < .07 * W)
    a = np.zeros(len(x)); a[ib] = stroke(x[ib], z[ib], Pm, half, .0026 * W)
    Pp = np.array([[0, CHIN + .188 * W], [0, CHIN + .158 * W]])
    a2 = np.zeros(len(x)); a2[ib] = stroke(x[ib], z[ib], Pp, np.array([.0050 * W, .0055 * W]), .0026 * W)
    C = mix(C, rgb('mouth'), .95 * np.maximum(a, a2))
    # lashes: a thick upper lash line down the outer side, and one outward wing
    for s in (-1, 1):
        sr, psi, X, Z = eye_s(s, x, z)
        near_eye = fr * (sr < 2.0)
        th = lash_th(psi)
        lash = (1 - smooth(1 + th - .016, 1 + th + .016, sr)) * (th > .004) * (sr > .90)
        bxk, bzk = eye_xz(s, np.array([.62]), 1.12)
        tt_ = np.linspace(0, 1, 7)
        Pf_ = np.stack([bxk[0] + s * .050 * W * tt_, bzk[0] + .012 * W * tt_ + .010 * W * tt_ ** 2], -1)
        hf = .0105 * W * (1 - tt_) ** .85 + .0012 * W
        ib = (near_eye > 0) & (np.abs(x - Pf_[:, 0].mean()) < .07 * W) & (np.abs(z - Pf_[:, 1].mean()) < .06 * W)
        aw = np.zeros(len(x)); aw[ib] = stroke(x[ib], z[ib], Pf_, hf, .0026 * W)
        C = mix(C, rgb('lash'), np.maximum(lash, aw) * near_eye * PAINT_OPTS['lash'])
    return C

def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .29; iz = .0; irx = .71; irz = .98
    C = mix(rgb('#fffaf4'), rgb('#e4dde2'), .45 * smooth(.35, .98, Z))
    C = mix(C, rgb('#ece6ea'), .25 * smooth(.3, 1., s * X))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#9ccc5e'), rgb('#71b86b'), smooth(-.85, -.20, ez))
    I = mix(I, rgb('#3c7a3c'), smooth(-.25, .35, ez))
    I = mix(I, rgb('#1e3a26'), smooth(.25, .85, ez))
    I = mix(I, rgb('#24452a'), smooth(.80, 1.0, r) * .65)
    I = I * (1 - .025 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 26 + r * 9)))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    px_ = ix - s * .04; pz = .02; R = np.sqrt(((X - px_) / (.64 * irx)) ** 2 + ((Z - pz) / (.66 * irz)) ** 2)
    C = mix(C, rgb('#15201a'), 1 - smooth(.985, 1.015, R))
    big = np.sqrt(((X - (-s * .50)) / .235) ** 2 + ((Z - .45) / .225) ** 2)
    small = np.sqrt(((X - (-s * .30)) / .105) ** 2 + ((Z + .36) / .100) ** 2)
    C = mix(C, rgb('#fffbf6'), np.maximum(1 - smooth(.92, 1.06, big), 1 - smooth(.88, 1.10, small)))
    C = mix(C, rgb('lash'), smooth(.93, 1.0, sr) * smooth(-.30, .30, Z))      # lid contact under the lash band
    return C

def paint_ear(U, V, s):
    a = U * 2 * PI - PI / 2; ca = np.cos(a); sa = np.sin(a)
    tb = EAR_TABLE[s]; rho = np.interp(V, tb['V'], tb['rho']); hz = np.interp(V, tb['V'], tb['hz'])
    inner = rho - EAR['rim']
    dd = np.abs(ca) * rho - inner                                    # < 0 inside the hollow (metres)
    m = (1 - smooth(-.0022, .0022, dd)) * (sa > 0) * smooth(.035, .075, hz) * (1 - smooth(.84, .90, hz)) * (inner > .004)
    C = mix(rgb('orange'), rgb('orangeshade'), .35 * (1 - smooth(.05, .30, hz)))
    deep = (1 - np.clip(np.abs(ca) * rho / np.maximum(inner, 1e-4), 0, 1)) * (1 - smooth(.25, .75, hz))
    P_ = mix(rgb('inner'), rgb('innerdeep'), .55 * deep)
    return mix(C, P_, m)

def paint(chart, U, V):
    if chart == 'head': return paint_head(head_uv_dir(U.ravel(), V.ravel())).reshape(U.shape + (3,))
    if chart == 'headback': return paint_head(headback_uv_dir(U.ravel(), V.ravel())).reshape(U.shape + (3,))
    if chart == 'eye.L': return paint_eye(U, V, 1)
    if chart == 'eye.R': return paint_eye(U, V, -1)
    if chart == 'ear.L': return paint_ear(U, V, 1)
    if chart == 'ear.R': return paint_ear(U, V, -1)
    if chart == 'kimono':
        z = np.interp(V, np.linspace(0, 1, len(TOR_Z)), TOR_Z); a = U * 2 * PI
        ax = np.interp(z, TOR_Z, TOR_AX); x = ax * spow(np.sin(a), 2 / TOR_N); front = np.cos(a) < 0
        C = mix(rgb('kimono'), rgb('kimonolight'), .55 * smooth(.42, .50, z))
        C = mix(C, rgb('kimonoshade'), .35 * (1 - smooth(.38, .43, z)))
        vneck = front & (np.abs(x) < .62 * (z - .395)) & (z > .40)
        C = mix(C, rgb('#ffe7ea'), .85 * vneck)
        return C
    if chart == 'sleeve':
        C = mix(rgb('kimono'), rgb('kimonolight'), .45 * smooth(.15, .60, V) * smooth(-.2, .8, np.sin(U * 2 * PI)))
        C = mix(C, rgb('kimonoshade'), .30 * smooth(.2, .9, -np.sin(U * 2 * PI)))
        C = mix(C, rgb('#c9688a'), smooth(.80, .86, V))                 # the inside of the sleeve
        return C
    if chart == 'collar':
        return mix(rgb('#efe2d4'), rgb('collar'), smooth(.0, .45, np.abs(np.sin(U * PI))) * .9 + .1)
    if chart == 'obi':
        C = mix(rgb('obishade'), rgb('obi'), smooth(.05, .30, V) * (1 - .55 * smooth(.85, 1., V)))
        C = mix(C, rgb('#ffe27a'), .45 * smooth(.62, .75, V) * (1 - smooth(.80, .92, V)))
        C = mix(C, rgb('#e5a52e'), .75 * np.exp(-((V - .56) / .022) ** 2))     # the crease between the two bands
        return C
    if chart == 'bow':
        C = mix(rgb('obishade'), rgb('obi'), smooth(.0, .35, V))
        C = mix(C, rgb('#ffe27a'), .40 * smooth(.55, .85, V))
        return C
    if chart == 'skirt':
        a = U * 2 * PI; fold = np.cos(7 * a + .4)
        C = mix(rgb('skirt'), rgb('skirtlight'), .35 * clamp(fold) * smooth(.15, .60, V))
        C = mix(C, rgb('skirtshade'), .45 * clamp(-fold) * smooth(.15, .60, V))
        C = mix(C, rgb('skirtshade'), .55 * smooth(.62, .70, V))                       # hem roll underside / inside
        C = mix(C, rgb('#4a3049'), .55 * smooth(.80, .95, V))
        return C
    if chart in ('skin', 'paw', 'foot', 'tail'):
        C = np.broadcast_to(rgb('fur'), U.shape + (3,)).copy()
        if chart == 'skin':     # arms and legs: warm shade on their backs (+Y is u = .75 on these tubes) and at the roots
            back = np.exp(-((U - .75) / .17) ** 2)
            C = mix(C, rgb('furshade'), np.clip(.65 * back + .35 * (1 - smooth(.0, .35, V)), 0, 1))
        if chart == 'paw':
            back = np.exp(-(np.minimum(U, 1 - U) / .16) ** 2)
            C = mix(C, rgb('furshade'), .55 * back)
        if chart == 'paw':      # two soft finger lines on the front of the mitten tip
            for du in (-.045, .045):
                C = mix(C, rgb('line'), .85 * np.exp(-((U - (.5 + du)) / .010) ** 2) * smooth(.66, .76, V) * (1 - smooth(.93, .985, V)))
            C = mix(rgb('furshade'), C, .55 + .45 * smooth(.0, .30, V))
        if chart == 'foot':     # two toe lines over the front of the foot
            for du in (-.040, .040):
                C = mix(C, rgb('line'), .90 * np.exp(-((U - (.5 + du)) / .0085) ** 2) * smooth(.30, .40, V) * (1 - smooth(.66, .78, V)))
            C = mix(C, rgb('furshade'), .85 * (1 - smooth(.04, .20, V)))          # the sole's underside only
        if chart == 'tail':
            C = mix(C, rgb('furshade'), .40 * (1 - smooth(.0, .30, V)))
            s_ = V * TAIL_L; sb = TAIL_L - .190 + .026 * np.cos(U * 2 * PI - .6)
            C = mix(C, rgb('orange'), smooth(sb - .003, sb + .003, s_))
        return C
    if chart == 'brush':
        C = mix(rgb('#8d5f3e'), rgb('handle'), smooth(.0, .45, np.abs(np.sin(U * PI))))
        C = np.where((V > .49)[..., None], mix(rgb('#d9a94e'), rgb('ferrule'), smooth(.0, .6, np.abs(np.sin(U * PI)))), C)
        C = np.where((V > .63)[..., None], mix(rgb('bristle'), rgb('#4e3428'), smooth(.80, 1.0, V)), C)
        return C
    if chart == 'cavity': return mix(rgb('#5a1e22'), rgb('#3e1418'), .5 * smooth(.3, 1, V))
    if chart == 'tongue': return mix(rgb('#e88a96'), rgb('#f2a2ac'), .5 * smooth(.2, .9, V))
    if chart.startswith('lid'): return np.broadcast_to(rgb('fur'), U.shape + (3,)).copy()      # painted by the rig
    if chart == 'nose':     # front-projected: each texel painted at its true surface point (linear across the button)
        x = (U.ravel() - .5) * 2 * NOSE_CH * W; z = NZ + (V.ravel() - .5) * 2 * NOSE_CH * W
        P = np.stack([x, front_hit(x, z), z], -1); return paint_head_P(P).reshape(U.shape + (3,))
    raise KeyError(chart)

atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [255, 244, 234, 255]
for name, (x0, y0, w, h) in CHARTS.items():
    U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
    if name in ('head', 'headback'):
        block = np.empty((h, w, 3))
        for r0 in range(0, h, 128): block[r0:r0 + 128] = paint(name, U[r0:r0 + 128], V[r0:r0 + 128])
    else:
        block = paint(name, U, V)
    atlas[y0:y0 + h, x0:x0 + w, :3] = np.round(clamp(block) * 255).astype(np.uint8)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
atlas_path = os.path.join(ROOT, 'mochi-toy_rig_atlas.png' if RIG else 'mochi-toy_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Mochi_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Mochi_toy_atlas'); MAT.use_nodes = True
bs = MAT.node_tree.nodes.get('Principled BSDF'); bs.inputs['Roughness'].default_value = .8
bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .25
tx = MAT.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
MAT.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])

# ============================================================== MEASURE (before joining)
def all_verts(obs): return np.array([list(o.matrix_world @ v.co) for o in obs for v in o.data.vertices])
sk = np.array([list(v.co) for v in skin.data.vertices])
nose_tip_y = HY + NOSE_TIP_L * W
earv = all_verts(parts['ear.L'] + parts['ear.R'])
rimL = RIM_L
MEAS = {'W_m': W, 'chin_z_m': CHIN,
        'head_width_W': round(float(np.ptp(sk[:, 0]) / W), 3),
        'crown_above_chin_W': round(float((sk[:, 2].max() - CHIN) / W), 3),
        'head_depth_W': round(float(np.ptp(sk[:, 1]) / W), 3),
        'ear_tip_z_m': round(float(earv[:, 2].max()), 4), 'ear_tip_above_crown_W': round(float((earv[:, 2].max() - sk[:, 2].max()) / W), 3),
        'ear_tip_x_W': round(float(abs(earv[np.argmax(earv[:, 2]), 0]) / W), 3),
        'eye_centre_W': [round(EX / W, 3), round((EZ - CHIN) / W, 3)],
        'eye_opening_W': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'nose_tip_z_W': round(NOSE_TIP_Z, 3), 'nose_tip_y_m': round(nose_tip_y, 4),
        'nose_proud_of_face_W': round(float(front_local(0, .30, head_local)[0] - NOSE_TIP_L), 3)}
MEAS.update(LOG)

# ============================================================== JOIN, CLEAN, NORMALS
objects = []; part_tri = {}
NAMES = {'head': 'Mochi_head', 'eye.L': 'Mochi_eye_L', 'eye.R': 'Mochi_eye_R', 'ear.L': 'Mochi_ear_L', 'ear.R': 'Mochi_ear_R',
         'body': 'Mochi_body', 'arm.L': 'Mochi_arm_L', 'arm.R': 'Mochi_arm_R', 'leg.L': 'Mochi_leg_L', 'leg.R': 'Mochi_leg_R',
         'tail': 'Mochi_tail'}
for group, obs in parts.items():
    for ob in obs:
        ob.data.materials.clear(); ob.data.materials.append(MAT)
        if RIG:
            vg = ob.vertex_groups.new(name='_part_' + ob.name); vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs: ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = NAMES[group]; ob.data.name = NAMES[group]
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
    piv = {'head': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'],
           'ear.L': tuple(ear_info[1]['S']), 'ear.R': tuple(ear_info[-1]['S']),
           'arm.L': joint_arms['L']['shoulder'], 'arm.R': joint_arms['R']['shoulder'],
           'leg.L': joint_legs['L']['hip'], 'leg.R': joint_legs['R']['hip'], 'tail': TAIL_JOINTS[0]}.get(group, (0, 0, 0))
    bpy.context.scene.cursor.location = piv; bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    for v in ob.data.vertices: assert all(math.isfinite(c) for c in v.co), 'Nonfinite position'
    for p in ob.data.polygons: assert all(math.isfinite(c) for c in p.normal) and p.normal.length > .5, ('Bad normal', ob.name, p.index)
    ob['phase'] = '1: neutral A-pose, no armature'; ob['front_axis'] = '-Y'; ob['units'] = 'metres'
    ob.data.calc_loop_triangles(); part_tri[group] = len(ob.data.loop_triangles); objects.append(ob)
tri_count = sum(part_tri.values()); print('PART_TRIANGLES', json.dumps(part_tri), flush=True)
MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count

ears_j = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    ei = ear_info[s]
    ears_j[tag] = {'base': [float(v) for v in ei['S']], 'mid': [float(v) for v in ei['S'] + ei['w'] * .14 * W],
                   'tip': [float(v) for v in ei['T']]}
joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X',
          'root': [0, 0, 0], 'hips': [0, .004, .300], 'spine': [0, .006, .360], 'chest': [0, .010, .430], 'neck': [0, .015, .505],
          'head_base': [0, .040, CHIN + .02], 'head': [float(v) for v in O],
          'jaw_pivot': [0, float(HY - .16 * W), float(CHIN + .13 * W)],
          'mouth_corners': {'L': [float(MHW + .008 * W), float(front_hit(MHW, MC)[0]), float(CHIN + .16 * W)],
                            'R': [float(-MHW - .008 * W), float(front_hit(-MHW, MC)[0]), float(CHIN + .16 * W)]},
          'eyes': eye_centers, 'brows': {'L': [BROW_X, float(front_hit(BROW_X, BROW_Z)[0]), BROW_Z], 'R': [-BROW_X, float(front_hit(-BROW_X, BROW_Z)[0]), BROW_Z]},
          'ears': ears_j, 'arms': joint_arms, 'legs': joint_legs, 'tail': TAIL_JOINTS,
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth implicit ball (mochi superquadric + muzzle + nose button), radially projected, analytic normals.',
                    'Eyelid holes ringed by %d concentric loops each, rim rolled in behind separate lens eyeballs; 3 loops round the mouth, 3 round the nose.' % len(EYE_SCALES),
                    'Ears (Mochi_ear_L/R) and tail (Mochi_tail) are separate objects with bend rings; eyes are separate objects.']}
if not RIG:
    with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if RIG: raise_done = True
else:
  bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'mochi-toy.blend'))
  bpy.ops.object.select_all(action='DESELECT')
  for ob in objects: ob.select_set(True)
  bpy.context.view_layer.objects.active = objects[0]
  bpy.ops.export_scene.gltf(filepath=MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('MOCHI_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': MODEL}), flush=True)
