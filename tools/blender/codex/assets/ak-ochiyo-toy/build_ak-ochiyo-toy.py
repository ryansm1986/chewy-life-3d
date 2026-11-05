"""Ochiyo / Tea master (Toybox zone villager, VL-2, Akane Hamlet), Opus build, phase 1 (the model). Blender 4.3, no addons.
Deterministic.

    blender --background --factory-startup --python build_ak-ochiyo-toy.py

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/ak-ochiyo-toy.glb.

Technique (the Mochi / Kome toy-line machinery, Kome's build as the base):
- The head is ONE smooth implicit ball: a superquadric fitted to the sheet's front and side outlines (scratch/headfit.py:
  a wide bun, widest 0.27 W above a flat-ish chin, crown 0.691 W), with a gentle muzzle fullness and a nose button
  smooth-unioned in. Its skin is the field's zero surface reached by radial projection (CDT in a stereographic domain with
  edge loops round both eyelid holes, the nose and the mouth), every vertex on the surface with the field's analytic
  normal: the face stays convex, no sockets. The dark calico patch (her right side, over the eye, the crown and the back),
  the white muzzle, brows, nose, mouth and blush are painted on the ball from 3D positions into a 2048 atlas.
- The eyes are separate flush lens globes in real lid holes. The upper lash line is its OWN object per eye (a thick
  tapered ribbon lying on the skin over the upper rim and down the outer side, with two small wing flicks), not paint.
- The ears are big thick rounded-cone volumes (parametric, exact normals) with a shallow pink dish, dark outside.
- The costume: a plum kimono torso, a crossed cream collar, a gold obi with a pillow knot at the back, a cream pinafore
  apron (a bib on the chest, two thick straps over the shoulders and down the back, a thick panel with rounded corners
  hanging from under the obi), an A-line dark plum skirt with soft folds and a rolled hem, short wide kimono sleeves
  with rolled cream cuffs, mitten paws, stubby legs and bean feet, and a thick dark tail curling up behind.
"""
import bpy, bmesh, math, json, os, struct, zlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt

ROOT = os.path.dirname(os.path.abspath(__file__))
RIG = bool(globals().get('RIG_MODE'))      # reserved for the phase-2 rig script: no approved file is written in rig mode
MODEL = 'D:/projects/chewy-life-3d/public/models/ak-ochiyo-toy.glb'
os.makedirs(os.path.join(ROOT, 'preview'), exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
W = .593; CHIN = .543; HY = .036       # face width at the cheeks, chin height, head centre y (metres; measure.md)
SW = W / .44                           # Rosie's metric detail sizes (0.44 m head) scaled to this head
LOG = {}

PAL = {'fur': '#ffefe2', 'furshade': '#efd3c0', 'muzzle': '#fffcf9',
       'patch': '#544a55', 'patchshade': '#463d48', 'patchlight': '#625765',
       'inner': '#ffb8c4', 'innerdeep': '#f6a2b2', 'nose': '#cb7f86', 'blush': '#f5a0ad', 'nosedeep': '#c27078',
       'kimono': '#80465c', 'kimonolight': '#8e5268', 'kimonoshade': '#6e3c50', 'kimonodeep': '#5a3042',
       'cream': '#f6ead8', 'creamlight': '#fbf2e4', 'creamshade': '#e8d6bf', 'creamline': '#dcc7ab',
       'skirt': '#4e3240', 'skirtlight': '#5a3a4a', 'skirtshade': '#432a36', 'skirtdeep': '#36222c',
       'obi': '#e8b04a', 'obilight': '#f2c060', 'obishade': '#d09838', 'obideep': '#b9842c',
       'lash': '#2c2022', 'brow': '#3e333a', 'mouth': '#3a2622'}
# 2048 atlas charts (x, y, w, h) in pixels, y up (Blender UV convention).
CHARTS = {'head': (0, 768, 1280, 1280), 'headback': (1280, 1280, 768, 768),
          'eye.L': (1280, 896, 384, 384), 'eye.R': (1664, 896, 384, 384),
          'ear.L': (1280, 640, 384, 256), 'ear.R': (1664, 640, 384, 256),
          'kimono': (0, 384, 512, 384), 'sleeve': (512, 384, 512, 384), 'collar': (1024, 640, 256, 128), 'strap': (1024, 512, 256, 128),
          'obi': (1024, 256, 256, 256), 'skirt': (0, 0, 512, 384), 'skin': (512, 0, 512, 384),
          'paw': (1024, 0, 256, 256), 'foot': (1280, 384, 384, 256), 'tail': (1664, 384, 384, 256),
          'tab': (1280, 0, 256, 192), 'bib': (1280, 192, 256, 192), 'apron': (1536, 0, 256, 384),
          'nose': (1792, 0, 256, 256), 'lash': (1792, 256, 256, 128)}
if RIG:   # phase 2: room for the lid charts, the mouth cavity and the tongue (the skirt and skin charts give up their top rows)
    CHARTS.update({'skirt': (0, 0, 512, 256), 'skin': (512, 0, 512, 256),
                   'lidU.L': (0, 256, 256, 128), 'lidU.R': (256, 256, 256, 128), 'lidD.L': (512, 256, 128, 128), 'lidD.R': (640, 256, 128, 128),
                   'cavity': (768, 256, 128, 128), 'tongue': (896, 256, 128, 128)})

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
# fitted to the sheet (scratch/headfit.py, rms 0.008 W): a wide bun, widest 0.25-0.30 W above the chin, crown 0.691 W,
# a flat-ish chin, depth 0.83 W, the muzzle zone standing ~0.03 W ahead of the eye zone (the side view)
LOWFACE = dict(m=.065, z=.205, w=.08)
HEAD = dict(A=.500, BF=.415, BB=.403, ZC=.300, HT=.391, HB=.300, nA_t=2.0, nA_b=3.35, nB_t=2.63, nB_b=4.77, n=2.0, nBb_t=2.55, nBb_b=2.89, egg=.35)
def prof(z, m_t, m_b):
    zc = HEAD['ZC']; v = np.where(z >= zc, (z - zc) / HEAD['HT'], (zc - z) / HEAD['HB'])
    m = np.where(z >= zc, m_t, m_b); vv = np.clip(v, 0, 1)
    return np.maximum(np.clip(1 - vv ** m, 0, 1) ** (1 / m), 1e-4), v
def skull_local(q):
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
NZ_L = .254                                          # the painted nose's centre (sheet: top 0.284, tip 0.223 W)
_yn = float(front_local(0, NZ_L, skull_local)[0])
# the button: a rounded inverted triangle (a wide upper lobe smooth-unioned with a narrow lower one), so no unpainted lobe
# sticks out below the painted pink shape
NOSE = [[0, _yn + .022 - .036, .266], [.043, .022, .018]]; NOSE2 = [[0, _yn + .020 - .032, .243], [.017, .019, .020]]; K_N = .016
def nose_local(q): return smin(ell(q, *NOSE), ell(q, *NOSE2), .018)
def head_local(q): return smin(skull_local(q), nose_local(q), K_N)
_zt = np.linspace(.20, .31, 111); _ft = front_local(np.zeros_like(_zt), _zt, head_local)
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
def ray_hit(o, d, f=head_sdf, t0=0., t1=.6, it=34):
    """per-ray origins (inside) and directions -> the first exit point"""
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
EX = .205 * W; EZ = CHIN + .327 * W; EHW = .1085 * W; EHH = .1015 * W; EN = 2.1
def eye_unit(psi):
    c = np.cos(psi); s = np.sin(psi)
    return spow(c, 2 / EN), spow(s, 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
def lid_edge_Z(X): return 1.25 + 0 * np.asarray(X, float)      # open eyes: no rest lid over the lens (the rig adds the lids)
NZ = CHIN + NZ_L * W; MC = CHIN + .190 * W; MHW = .088 * W
BROW_Z = CHIN + .540 * W; BROW_X = .197 * W
BLUSH = (.300 * W, CHIN + .178 * W, .061 * W, .041 * W)

# ============================================================== geometry helpers
GROUPS = ['head', 'eye.L', 'eye.R', 'lash.L', 'lash.R', 'ear.L', 'ear.R', 'body', 'apron', 'arm.L', 'arm.R', 'leg.L', 'leg.R', 'tail']
parts = {k: [] for k in GROUPS}
def mesh(name, verts, faces, uvs, chart, group, raw_uv=False, sharp=None, normals=None, recalc=True):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(map(float, v)) for v in verts], [], [tuple(int(i) for i in f) for f in faces]); me.update()
    uv = me.uv_layers.new(name='Atlas')
    for p, coords in zip(me.polygons, uvs):
        p.use_smooth = True
        for li, co in zip(p.loop_indices, coords): uv.data[li].uv = tuple(co) if raw_uv else au(chart, *co)
    bm = bmesh.new(); bm.from_mesh(me)
    if recalc: bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if sharp:
        sv = set(sharp)
        for e in bm.edges:
            if e.verts[0].index in sv and e.verts[1].index in sv: e.smooth = False
    bm.to_mesh(me); bm.free()
    if normals is not None:
        a = me.attributes.new('cust_n', 'FLOAT_VECTOR', 'POINT')
        nn_ = np.asarray(normals, float); ln_ = np.linalg.norm(nn_, axis=-1, keepdims=True)
        a.data.foreach_set('vector', np.where(ln_ > 1e-9, nn_ / np.maximum(ln_, 1e-9), 0.).astype(np.float32).ravel())
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

def sweep(name, path, radius, chart, group, rings=20, sides=16, caps=(True, True), vrange=(0., 1.), ovals=None, ref0=None):
    """a tube along a dense polyline (arc-length rings, parallel-transport frames); radius(s, L) in metres;
    ovals(s, L) -> (kx, ky) stretches the section"""
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
            ref = np.asarray(ref0, float) if ref0 is not None else (np.array([0, 1., 0]) if abs(d[1]) < .95 else np.array([1., 0, 0]))
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

def grid_mesh(name, G, chart, group, wrap_u=False, normals=None, uv_fn=None):
    """a quad grid G[i, j] (i along u, j along v) -> mesh with chart UVs u = i/(nu-1), v = j/(nv-1)"""
    nu, nv = G.shape[:2]; V = G.reshape(-1, 3); F = []; UV = []
    iu = nu if wrap_u else nu - 1
    for i in range(iu):
        for j in range(nv - 1):
            i2 = (i + 1) % nu
            F.append((i * nv + j, i2 * nv + j, i2 * nv + j + 1, i * nv + j + 1))
            den = nu if wrap_u else nu - 1
            u0, u1 = i / den, (i + 1) / den; v0, v1 = j / (nv - 1), (j + 1) / (nv - 1)
            UV.append(((u0, v0), (u1, v0), (u1, v1), (u0, v1)) if uv_fn is None else tuple(uv_fn(a, b) for a, b in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))))
    return mesh(name, V, F, UV, chart, group, normals=normals)

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
NOSE_LOOPS = [(.006, 12), (.012, 18), (.019, 26), (.027, 34)]
_nc = np.array(pts[tags['nose_c'][0]])
for k, (rr, n) in enumerate(NOSE_LOOPS):
    a = np.linspace(0, 2 * PI, n, endpoint=False) + .3 * k
    _ref = to_dom(surf_dir(rr * W * np.cos(a), NZ + rr * W * np.sin(a)))
    rd = float(np.median(np.linalg.norm(_ref - _nc, axis=1)))
    if k: rd = max(rd, _rd_prev * 1.3)
    _rd_prev = rd
    add_loop(_nc + rd * np.stack([np.cos(a), np.sin(a)], -1), 'nose_%d' % k)
MOUTH_LOOPS = [(.100, .015, .024), (.112, .019, .031), (.124, .023, .038)]
for k, (hx, ht, hb) in enumerate(MOUTH_LOOPS):
    a = np.linspace(0, 2 * PI, 36, endpoint=False)
    add_loop(to_dom(surf_dir(hx * W * spow(np.cos(a), .8), MC + np.where(np.sin(a) > 0, ht, hb) * W * np.sin(a))), 'mouth_%d' % k)
NB = 12; AB = math.radians(176)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
# fill: a dense Fibonacci set of directions thinned to a spacing field (fine on the face band, medium on the face and
# crown, coarser on the back), deterministic greedy order
NF = 60000; ii = np.arange(NF) + .5
phi = np.arccos(1 - 2 * ii / NF); th = PI * (1 + 5 ** .5) * ii
D = np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
alpha = np.arccos(np.clip(-D[:, 1], -1, 1)); D = D[alpha < math.radians(173.5)]
Pf = radial_hit(D); q = M2L(Pf)
alpha = np.arccos(np.clip(-D[:, 1], -1, 1))
fband = smooth(.50, .40, np.abs(q[:, 0])) * smooth(.10, .16, q[:, 2]) * smooth(.62, .56, q[:, 2]) * smooth(math.radians(80), math.radians(66), alpha)
hsp = .0180 + (.0330 - .0180) * smooth(math.radians(100), math.radians(125), alpha)
hsp = hsp * (1 - fband) + .0113 * fband
order = np.argsort(-fband * 2 + np.arange(len(D)) / len(D), kind='stable')   # the band first, then Fibonacci order
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
keep &= ~(frontp & ((Pf[:, 0] / W) ** 2 + ((Pf[:, 2] - NZ) / W) ** 2 < .036 ** 2))
mz = (Pf[:, 2] - MC) / W
keep &= ~(frontp & ((Pf[:, 0] / (.134 * W)) ** 2 + (mz / np.where(mz > 0, .029, .046)) ** 2 < 1))
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
NOSE_CH = .078          # the nose button's own front-projected chart (half-size in W)
_VA = np.array(verts); _nose_v = (_VA[:, 1] < HY) & (np.hypot(_VA[:, 0] / W, (_VA[:, 2] - NZ) / W) < .068) & (vnorm[:, 1] < -.10)   # forward-facing only
def nose_uv(i): return au('nose', .5 + _VA[i, 0] / (2 * NOSE_CH * W), .5 + (_VA[i, 2] - NZ) / (2 * NOSE_CH * W))
LOG['nose_chart_faces'] = 0
for f in faces:
    a = math.acos(float(np.clip(-vdir[list(f)].mean(0)[1] / np.linalg.norm(vdir[list(f)].mean(0)), -1, 1)))
    if all(_nose_v[i] for i in f):
        face_uvs.append(tuple(nose_uv(i) for i in f)); LOG['nose_chart_faces'] += 1
    elif a < A_SPLIT: face_uvs.append(tuple(tuple(au('head', *fuv[i])) for i in f))
    else: face_uvs.append(tuple(tuple(au('headback', *buv[i])) for i in f))
skin = mesh('ochiyo_head_skin', verts, faces, face_uvs, 'head', 'head', raw_uv=True, normals=vnorm)
LOG['skin_vertices'] = len(verts); LOG['skin_faces'] = len(faces)

# ============================================================== EYES: flush lens globes following the ball
ES = [0, .12, .25, .38, .51, .63, .74, .84, .92, .98, 1.10]
NSEG = 30
eye_centers = {}; eye_axes = {}
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
    eye_centers[tag] = [float(v) for v in (Sc - axis * .013 * SW)]; eye_axes[tag] = axis
    LOG['eye_axis_' + tag] = {'out_deg': round(math.degrees(math.atan2(s * axis[0], -axis[1])), 1),
                              'down_deg': round(math.degrees(math.asin(-axis[2])), 1)}

# ============================================================== LASH RIBBONS: the upper lash line + two wing flicks
# The sheet (measure.md): 0.028-0.031 W thick over the top, 0.039 W at the outer upper corner, running down the outer
# side to ~0.55 of the half-height below the eye's middle, two small flicks at the outer top. A flattened tapered tube
# lying on the skin, its inner edge just inside the lid hole (over the lens edge), <= 0.009 W proud. Separate objects
# (origin at the eye centre) so the rig can hang them on the upper lids. Nothing of the lash is painted on the skin.
LASH_PSI = np.radians(np.linspace(158, -42, 36))         # inner top -> over the top -> down the outer side
def lash_th(psi):      # thickness in eye-radius units (the opening's superellipse radius)
    d = np.degrees(psi)
    th = .30 + .07 * np.exp(-((d - 35) / 30) ** 2)
    th = th * (1 - .58 * smooth(22, -38, d))     # round 2: a touch more taper down the outer side
    return th * smooth(160, 128, d) * smooth(-45, -5, d) + .02
LASH_WINGS = [((42, .95), (1.38, 1.12), (-.12, .16), .0175), ((14, .95), (1.33, .62), (-.05, .08), .0140)]    # (root psi deg, root k), tip (X outer, Z) eye units, curl, root half-width / W
def eye_pt(s, X, Z):
    """eye units (X > 0 outer) -> skin point, its normal"""
    x = s * EX + s * EHW * np.asarray(X, float); z = EZ + EHH * np.asarray(Z, float)
    y = front_hit(x, z); S = np.stack([x, y, z], -1); return S, grad_n(S)
def ribbon(C, n, hw, hp, NLS=8, embed=.0012 * W):
    """flattened lens-section tube along skin points C with skin normals n; returns verts, faces, normals, uv-v"""
    tg = np.gradient(C, axis=0); tg = unit(tg - n * (tg * n).sum(1, keepdims=True)); sd = unit(np.cross(n, tg))
    V = []; NV = []; NT = len(C)
    for i in range(NT):
        for k in range(NLS):
            a = 2 * PI * k / NLS; ca, sa = math.cos(a), math.sin(a)
            up = hp[i] * (sa if sa > 0 else .40 * sa)
            V.append(C[i] + sd[i] * hw[i] * ca + n[i] * (up - embed))
            NV.append(unit(sd[i] * ca / max(hw[i], 1e-4) + n[i] * sa / max(hp[i], 1e-4)))
    V = np.array(V); NV = np.array(NV)
    tip = len(V); V = np.vstack([V, C[-1] + tg[-1] * hw[-1] * .7 + n[-1] * (.2 * hp[-1] - embed)]); NV = np.vstack([NV, tg[-1]])
    root = len(V); V = np.vstack([V, C[0] - tg[0] * hw[0] * .7 + n[0] * (.2 * hp[0] - embed)]); NV = np.vstack([NV, -tg[0]])
    F = []; UVv = []
    for i in range(NT - 1):
        for k in range(NLS):
            a_, b_ = i * NLS + k, i * NLS + (k + 1) % NLS; F.append((a_, b_, b_ + NLS, a_ + NLS))
    for k in range(NLS): F.append(((NT - 1) * NLS + k, (NT - 1) * NLS + (k + 1) % NLS, tip))
    for k in range(NLS): F.append(((k + 1) % NLS, k, root))
    return V, F, NV, NLS
lash_info = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    th = lash_th(LASH_PSI); k_in = .965
    ux, uz = eye_unit(LASH_PSI)
    Pin, _ = eye_pt(s, ux * k_in, uz * k_in); Pout, _ = eye_pt(s, ux * (k_in + th), uz * (k_in + th))
    Cm, nm = eye_pt(s, ux * (k_in + th / 2), uz * (k_in + th / 2))
    hw = np.linalg.norm(Pout - Pin, axis=1) / 2
    tt = np.linspace(0, 1, len(LASH_PSI))
    hp = (.0085 * W) * (.55 + .45 * smooth(0, .25, tt)) * (1 - .55 * smooth(.70, 1.0, tt))
    obs = []
    V, F, NV, NLS = ribbon(Cm, nm, hw, hp)
    def ribbon_uv(F, V, nls, nt):
        out = []
        for f in F:
            out.append(tuple(((k % nls) / nls if k < nls * nt else .5, .5) for k in f))
        return out
    allV = [V]; allF = [F]; allN = [NV]; off = len(V)
    for (rpsi, rk), (tx, tz), curl, wroot in LASH_WINGS:
        rp = math.radians(rpsi); rux, ruz = eye_unit(np.array([rp]))
        thr = lash_th(np.array([rp]))[0]
        R0 = np.array([rux[0] * (k_in + thr * .45), ruz[0] * (k_in + thr * .45)])
        T0 = np.array([tx, tz])
        mid = R0 + (T0 - R0) * .5 + np.array(curl)                # the sheet's wing curls up and back
        ws = np.linspace(0, 1, 11)
        XZ = np.array([(1 - w) ** 2 * R0 + 2 * (1 - w) * w * mid + w * w * T0 for w in ws])
        Cw, nw = eye_pt(s, XZ[:, 0], XZ[:, 1])
        hww = (wroot * W) * (1 - ws) ** .8 + .0016 * W
        hpw = (.0075 * W) * (1 - .75 * ws)
        Vw, Fw, NVw, _ = ribbon(Cw, nw, hww, hpw, NLS=6)
        allV.append(Vw); allF.append([tuple(i + off for i in f) for f in Fw]); allN.append(NVw); off += len(Vw)
    V = np.vstack(allV); NV = np.vstack(allN); F = [f for FF in allF for f in FF]
    # uv: the lash chart is a vertical ramp (dark, a soft cool sheen on the top), so map each vertex by its normal's
    # facing to the eye axis (top of the ribbon -> lighter)
    ax_ = eye_axes[tag]; fac = clamp(.5 + .5 * (NV @ ax_))
    uvs = [tuple((.5, float(fac[i])) for i in f) for f in F]
    mesh('lash_line.' + tag, V, F, uvs, 'lash', 'lash.' + tag, normals=NV)
    lash_info[tag] = dict(top=[float(v) for v in Cm[np.argmax(Cm[:, 2])]], outer_end=[float(v) for v in Cm[-1]],
                          max_proud_W=round(float(hp.max() / W), 4), thick_top_W=round(float(2 * hw[np.argmax(Cm[:, 2])] / W), 4))
LOG['lash'] = lash_info

# ============================================================== EARS: soft, upright rounded-cone cat ears with a pink dish
# Kome's ear (smooth parametric surface with exact normals), placed on Ochiyo's sheet: tips x +-0.315 W, z 0.854 W
# (0.163 W over the crown), ~2 cm behind the head centre (the side view); apex ~90 deg with the axis leaning 7 deg out
# (the front view's edges: outer 39 deg, inner 51 deg from vertical); base ~0.38 W wide x 0.32 W deep, its outer side
# running down onto the head outline (z ~0.5); turned ~14 deg outward
EAR = dict(r1=.200 * W, r2=.072 * W, sy=.92, flat=.94, hollow=.010 * W, rim=.068 * W, sink=.035 * W, tilt=5., yaw=14., lean=4., bulge=.018 * W)
EAR_TIP_LOCAL = np.array([.312, .025, .856])          # W units: x, y behind the head centre, z above the chin
def ear_frame(s):
    T = L2M(np.array([s * EAR_TIP_LOCAL[0], EAR_TIP_LOCAL[1], EAR_TIP_LOCAL[2]]))
    tr = math.radians(EAR['tilt']); lr = math.radians(EAR['lean']); w = unit(np.array([s * math.sin(tr), math.sin(lr), math.cos(tr)]))
    lo, hi = 0., .60
    for _ in range(40):
        m = (lo + hi) / 2
        if head_sdf((T - w * m)[None])[0] < 0: hi = m
        else: lo = m
    S = T - w * hi
    yr = math.radians(EAR['yaw']); f0 = np.array([s * math.sin(yr), -math.cos(yr), 0.]); f = unit(f0 - w * (f0 @ w))
    t = s * np.cross(f, w); C = S - w * EAR['sink']
    L = float(np.linalg.norm(T - C)) - EAR['r2']
    return dict(T=T, S=S, C=C, w=w, f=f, t=t, L=L)
EAR_RS = .50 * W          # round 2: the convex side arc's radius (a puffy side ~1 cm proud mid-ear, no crease, no knob at the tip)
def ear_profile_fn(L):
    """the ear's meridian (rho, z): a tip circle (r2, centre (0, L)), a convex side arc tangent to it and to the base circle
    (r1, centre (0, 0)), then the base circle round to the buried pole; parameterised by arc length from the tip"""
    r1, r2, Rs = EAR['r1'], EAR['r2'], EAR_RS
    y = (L * L - (r1 - r2) * (2 * Rs - r1 - r2)) / (2 * L); x = -math.sqrt(max((Rs - r1) ** 2 - y * y, 1e-12))
    Cs = np.array([x, y]); c2 = np.array([0., L]); c1 = np.array([0., 0.])
    d2 = (c2 - Cs) / np.linalg.norm(c2 - Cs); d1 = (c1 - Cs) / np.linalg.norm(c1 - Cs)
    a2 = math.atan2(d2[1], d2[0]); a1 = math.atan2(d1[1], d1[0])          # tangent directions (from Cs, = from each circle's centre)
    arc2 = r2 * (PI / 2 - a2); side = Rs * (a2 - a1); arc1 = r1 * (a1 + PI / 2); tot = arc2 + side + arc1
    def prof_at(st):
        st = np.asarray(st, float); out = np.zeros(st.shape + (2,))
        m1 = st <= arc2; ang = PI / 2 - st / r2; out[m1] = np.stack([r2 * np.cos(ang), L + r2 * np.sin(ang)], -1)[m1]
        m2 = (st > arc2) & (st <= arc2 + side); ang = a2 - (st - arc2) / Rs; out[m2] = np.stack([Cs[0] + Rs * np.cos(ang), Cs[1] + Rs * np.sin(ang)], -1)[m2]
        m3 = st > arc2 + side; ang = a1 - (st - arc2 - side) / r1; out[m3] = np.stack([r1 * np.cos(ang), r1 * np.sin(ang)], -1)[m3]
        out[..., 0] = np.maximum(out[..., 0], 0.)
        return out
    return prof_at, (arc2, side, arc1, tot)
def ear_points(E, prof_at, tot, tv, a):
    """tv: arc fraction from the tip (0) to the buried base pole (1); a: angle round the axis (pi/2 = the front middle)"""
    pr = prof_at(tv * tot); rho, zz = pr[..., 0], pr[..., 1]
    ca, sa = np.cos(a), np.sin(a); u = rho * ca
    hz = (zz - EAR['sink']) / (E['L'] + EAR['r2'] - EAR['sink'])
    inner = np.maximum(rho - EAR['rim'], 1e-6); k_ = np.abs(u) / inner
    hfade = smooth(.06, .24, hz) * (1 - smooth(.38, .70, hz)) * smooth(.03 * W, .09 * W, inner)
    dish = EAR['hollow'] * np.clip(1 - k_ * k_, 0, 1) ** 1.5 * hfade
    v = np.where(sa > 0, rho * EAR['sy'] * sa * (1 - (1 - EAR['flat']) * sa * sa) - dish, rho * EAR['sy'] * sa)
    return E['C'] + E['t'] * u[..., None] + E['f'] * v[..., None] + E['w'] * zz[..., None], hz
ear_info = {}; EAR_TABLE = {}
for s in (-1, 1):
    tag = 'L' if s > 0 else 'R'
    E = ear_frame(s); prof_at, (arc2, line, arc1, tot) = ear_profile_fn(E['L'])
    nrow, seg = 30, 40          # rig round: denser rings and rows (the director: no straight facets on the rims at portrait size)
    uu = np.linspace(0, 1, nrow + 1)
    tv = np.interp(uu, [0, .14, .55, 1.0], [0, arc2 / tot, (arc2 + line) / tot, 1.0])     # rig round: more rows on the base arc (its visible top is the rim's lower outline)
    V = []; UVs = []; NV = []
    for j, t_ in enumerate(tv):
        if j in (0, nrow):
            p, _ = ear_points(E, prof_at, tot, np.array([t_]), np.array([PI / 2]))
            V.append(tuple(p[0])); UVs.append((.5, 1 - t_)); NV.append(np.zeros(3) if j == 0 else -E['w']); continue
        a = 2 * PI * np.arange(seg) / seg - PI / 2
        p, _ = ear_points(E, prof_at, tot, np.full(seg, t_), a)
        e = 1e-4
        dt = ear_points(E, prof_at, tot, np.full(seg, min(1, t_ + e)), a)[0] - ear_points(E, prof_at, tot, np.full(seg, max(0, t_ - e)), a)[0]
        da = ear_points(E, prof_at, tot, np.full(seg, t_), a + e)[0] - ear_points(E, prof_at, tot, np.full(seg, t_), a - e)[0]
        nn = unit(np.cross(da, dt)); axis_pt = E['C'] + E['w'] * prof_at(np.array([t_ * tot]))[0, 1]
        out = p - axis_pt; nn = np.where(((nn * out).sum(1) < 0)[:, None], -nn, nn)
        for i in range(seg): V.append(tuple(p[i])); UVs.append((i / seg, 1 - t_)); NV.append(nn[i] if j > 3 else np.zeros(3))   # near the tip: the mesh's own smooth normals (no nub)
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
    NV = np.array(NV)
    mesh('cat_ear.' + tag, V, fs, uvf, 'ear.' + tag, 'ear.' + tag, normals=NV)
    ear_info[s] = E
    tf = np.linspace(0, 1, 400); pr = prof_at(tf * tot)
    EAR_TABLE[s] = dict(V=(1 - tf)[::-1], rho=pr[::-1, 0], hz=((pr[:, 1] - EAR['sink']) / (E['L'] + EAR['r2'] - EAR['sink']))[::-1])
    LOG['ear_' + tag] = {'tip_m': [round(float(c), 4) for c in E['T']], 'base_on_skin_m': [round(float(c), 4) for c in E['S']],
                         'L_W': round(E['L'] / W, 3)}
# ============================================================== BODY AND COSTUME
# Body centre (side view): x 902 on the sheet; the head's centre sits 0.036 m behind it (HY). measure.md has the numbers.
# --- kimono torso: a soft box with shoulders (hidden under the obi below z .34; the top tucks up inside the head)
TORSO = [(.330, .135, .128), (.360, .136, .129), (.395, .140, .131), (.420, .146, .134), (.450, .148, .134), (.480, .147, .128),
         (.505, .144, .117), (.530, .136, .104), (.555, .122, .094), (.585, .104, .088), (.630, .088, .082)]
TOR_Z = np.array([r[0] for r in TORSO]); TOR_AX = np.array([r[1] for r in TORSO]); TOR_AY = np.array([r[2] for r in TORSO])
TOR_N = 2.3
lathe('kimono_torso', TORSO, 'kimono', 'body', 56, TOR_N, cap=(False, True))
def torso_front(x, z):
    ax = np.interp(z, TOR_Z, TOR_AX); ay = np.interp(z, TOR_Z, TOR_AY)
    return -ay * np.clip(1 - np.abs(x / ax) ** TOR_N, 0, 1) ** (1 / TOR_N)
def torso_normal(x, z, back=False):
    """outward normal of the torso's front (or back) surface at (x, z)"""
    e = 1e-4
    dx = (torso_front(x + e, z) - torso_front(x - e, z)) / (2 * e); dz = (torso_front(x, z + e) - torso_front(x, z - e)) / (2 * e)
    n = np.array([dx, -1., dz]) if not back else np.array([-dx, 1., -dz])
    return n / np.linalg.norm(n)
NECK_V = .485            # the collar's V point (sheet: the cream bands cross at z ~0.485 m, just above the bib)
def surface_band(name, P, Nn, half_w, thick, chart, group, vv=None, nsec=10):
    """a thick rounded band lying on a surface: centre points P (on the surface), outward normals Nn"""
    P = np.asarray(P, float); Nn = unit(np.asarray(Nn, float)); nr = len(P)
    T = np.gradient(P, axis=0); T = unit(T - Nn * (T * Nn).sum(1, keepdims=True)); Sd = unit(np.cross(Nn, T))
    hw = np.broadcast_to(np.asarray(half_w, float), (nr,)); th = np.broadcast_to(np.asarray(thick, float), (nr,))
    vv = np.linspace(0, 1, nr) if vv is None else np.asarray(vv, float)
    verts = []; faces = []; uvs = []
    for j in range(nr):
        for i in range(nsec):
            a = PI * i / (nsec - 1)
            verts.append(tuple(P[j] + Sd[j] * (hw[j] * math.cos(a)) + Nn[j] * (th[j] * math.sin(a) ** .7)))
    for j in range(nr - 1):
        for i in range(nsec - 1):
            faces.append((j * nsec + i, j * nsec + i + 1, (j + 1) * nsec + i + 1, (j + 1) * nsec + i))
            uvs.append(((i / (nsec - 1), vv[j]), ((i + 1) / (nsec - 1), vv[j]), ((i + 1) / (nsec - 1), vv[j + 1]), (i / (nsec - 1), vv[j + 1])))
        faces.append((j * nsec + nsec - 1, j * nsec, (j + 1) * nsec, (j + 1) * nsec + nsec - 1))
        uvs.append(((1, vv[j]), (0, vv[j]), (0, vv[j + 1]), (1, vv[j + 1])))
    for j in (0, nr - 1):
        faces.append(tuple(range(j * nsec, j * nsec + nsec))); uvs.append(tuple((.5, vv[j]) for _ in range(nsec)))
    return mesh(name, verts, faces, uvs, chart, group)
# --- the crossed cream collar: thick rounded bands on the chest, her left panel over her right (the sheet), from the neck
# under the head down to the V at z 0.485 m; their lower ends tuck under the apron bib
def collar_band(name, lift, ctrl, half_w=.0175, thick=.0085):
    C = [catmull(ctrl, t) for t in np.linspace(0, 1, 28)]
    P = []; Nn = []
    for p in C:
        x, z = p.x, p.y; n = torso_normal(x, z); P.append(np.array([x, torso_front(x, z), z]) + n * lift); Nn.append(n)
    return surface_band(name, P, Nn, half_w, thick, 'collar', 'body')
collar_band('collar_band_under', -.0012, [(-.058, .556), (-.048, .530), (-.030, .506), (.000, NECK_V), (.026, .464), (.038, .452)])
collar_band('collar_band_over', .0020, [(.058, .556), (.048, .530), (.030, .506), (.000, NECK_V), (-.026, .464), (-.038, .452)])
# --- obi: a thick gold sash (sheet: z 0.336-0.397 m, +-0.150 m wide, front -0.152 / back +0.140 m) and its pillow knot
OBI_YC = -.006
OBI = [(.332, .136, .130), (.336, .148, .141), (.342, .153, .146), (.352, .155, .148), (.366, .1555, .1485), (.381, .155, .148),
       (.391, .153, .146), (.397, .147, .140), (.401, .136, .130)]
OBI_Z = np.array([r[0] for r in OBI]); OBI_AX = np.array([r[1] for r in OBI]); OBI_AY = np.array([r[2] for r in OBI])
lathe('obi_sash', [r + (OBI_YC,) for r in OBI], 'obi', 'body', 52, 2.4)
OBI_BACK = OBI_YC + float(OBI_AY.max())
KNOT_C = np.array([.002, OBI_BACK + .004, .378])          # sheet: 0.154 m wide, z 0.324-0.432, standing ~0.026 m off the obi
blob('obi_pillow_knot', tuple(KNOT_C), (.077, .022, .054), 'tab', 'body', 20, 11, p=(.42, .75, .42))
# --- the A-line skirt with soft folds and a rolled hem (inner face so the edge is never paper thin)
SK = [(.350, .137, .129), (.336, .146, .137), (.326, .160, .148), (.305, .182, .160), (.280, .196, .167), (.250, .206, .172),
      (.220, .215, .177), (.190, .224, .182), (.160, .232, .186), (.135, .238, .189), (.120, .241, .190),
      (.112, .240, .189), (.107, .235, .185), (.110, .228, .179), (.125, .222, .174), (.165, .213, .167)]
SK_OUT = 11                   # the outer rows (down to the hem)
def skirt_fold(a, t):
    tt = min(1., t / .62); return 1 + (.017 * math.cos(8 * a + .4) + .005 * math.cos(13 * a + 1.1)) * tt ** 1.4
lathe('a_line_skirt', SK, 'skirt', 'body', 64, 2.2, fold=skirt_fold)
SK_Z = np.array([r[0] for r in SK[:SK_OUT]])[::-1]; SK_AX = np.array([r[1] for r in SK[:SK_OUT]])[::-1]; SK_AY = np.array([r[2] for r in SK[:SK_OUT]])[::-1]
def skirt_front(x, z):
    ax = np.interp(z, SK_Z, SK_AX); ay = np.interp(z, SK_Z, SK_AY)
    return -ay * np.clip(1 - np.abs(x / ax) ** 2.2, 0, 1) ** (1 / 2.2)
def thick_panel(name, MID, N, T, chart, group, uarr, varr, rim_n=3, front_extra=None):
    """a thick panel: back face T/2 behind the mid surface, front face T/2 (+ front_extra per vertex) in front, rounded rim"""
    nr, nc = MID.shape[:2]; FE = np.zeros((nr, nc)) if front_extra is None else front_extra
    Fr = MID + N * (T / 2 + FE[..., None]); Bk = MID - N * T / 2
    verts = []; faces = []; uvs = []
    def vid(arr_i, i, j): return arr_i * nr * nc + i * nc + j
    for arr in (Fr, Bk):
        for i in range(nr):
            for j in range(nc): verts.append(tuple(arr[i, j]))
    for side, arr_i in ((0, 0), (1, 1)):
        for i in range(nr - 1):
            for j in range(nc - 1):
                f = (vid(arr_i, i, j), vid(arr_i, i, j + 1), vid(arr_i, i + 1, j + 1), vid(arr_i, i + 1, j))
                faces.append(f if side == 0 else f[::-1])
                uu = lambda jj: uarr[jj]; vv = lambda ii: varr[ii]
                q = ((uu(j), vv(i)), (uu(j + 1), vv(i)), (uu(j + 1), vv(i + 1)), (uu(j), vv(i + 1)))
                q = tuple((.04 + .92 * a, .30 + .70 * b) if side == 0 else (.04 + .92 * a, .02 + .20 * b) for a, b in q)
                uvs.append(q if side == 0 else q[::-1])
    loop = [(0, j) for j in range(nc)] + [(i, nc - 1) for i in range(1, nr)] + [(nr - 1, j) for j in range(nc - 2, -1, -1)] + [(i, 0) for i in range(nr - 2, 0, -1)]
    L = len(loop); rings = []
    for (i, j) in loop:
        n = N[i, j]; c = MID[i, j]
        ii_ = min(max(i, 1), nr - 2); jj_ = min(max(j, 1), nc - 2)
        e = c - MID[ii_, jj_]
        if i == 0 or i == nr - 1: e = e + (MID[i, j] - MID[1 if i == 0 else nr - 2, j]) * 2
        if j == 0 or j == nc - 1: e = e + (MID[i, j] - MID[i, 1 if j == 0 else nc - 2]) * 2
        e = e - n * (e @ n); e = e / (np.linalg.norm(e) + 1e-12)
        ring = []
        for k in range(1, rim_n):
            th_ = PI * k / rim_n
            hT = (T + FE[i, j]) / 2; cc = c + n * (FE[i, j] / 2)
            ring.append(len(verts)); verts.append(tuple(cc + n * hT * math.cos(th_) + e * hT * .9 * math.sin(th_)))
        rings.append(ring)
    for a in range(L):
        b = (a + 1) % L; (ia, ja), (ib, jb) = loop[a], loop[b]
        colA = [vid(0, ia, ja)] + rings[a] + [vid(1, ia, ja)]; colB = [vid(0, ib, jb)] + rings[b] + [vid(1, ib, jb)]
        for k in range(len(colA) - 1):
            faces.append((colA[k], colB[k], colB[k + 1], colA[k + 1])); uvs.append(((.5, .26), (.5, .26), (.5, .26), (.5, .26)))
    return mesh(name, verts, faces, uvs, chart, group)
# --- the apron panel: thick cream, rounded lower corners, hung from under the obi (top hidden in the obi)
AP_TOP, AP_BOT, AP_HW0, AP_HW1, AP_R, AP_T = .345, .145, .150, .158, .030, .011
def ap_hw(z):
    hw = AP_HW0 + (AP_HW1 - AP_HW0) * (AP_TOP - z) / (AP_TOP - AP_BOT)
    dz = np.clip(AP_R - (z - AP_BOT), 0, AP_R)
    return hw - AP_R + np.sqrt(np.maximum(AP_R * AP_R - dz * dz, 0))
NRA, NCA = 22, 18
zr = np.concatenate([AP_BOT + AP_R * (1 - np.cos(np.linspace(0, PI / 2, 8))), np.linspace(AP_BOT + AP_R, AP_TOP, NRA - 7)[1:]])
NRA = len(zr)
cr = np.sin(np.linspace(-PI / 2, PI / 2, NCA))          # denser columns near the side edges
AXg = cr[None, :] * ap_hw(zr)[:, None]; AZg = np.repeat(zr[:, None], NCA, 1)
AYg = skirt_front(.90 * AXg, AZg) * 1.005 - .0035 - AP_T / 2
MID = np.stack([AXg, AYg, AZg], -1)                      # [row (z up), col (x)]
dzA = np.gradient(MID, axis=0); dxA = np.gradient(MID, axis=1)
NA = unit(np.cross(dzA, dxA)); NA = np.where((NA[..., 1:2] > 0), -NA, NA)   # forward (-y)
AP_HEM, AP_ROLL = .015, .0055     # a soft rolled hem along the lower edge
def ap_roll(z):
    dz = np.clip((np.asarray(z) - AP_BOT) / AP_HEM, 0, 1); return AP_ROLL * np.sin(PI * dz) ** .75 * (dz < 1)
AP_FE = np.repeat(ap_roll(zr)[:, None], NCA, 1) * (.35 + .65 * np.clip((ap_hw(zr)[:, None] - np.abs(AXg)) / .03, 0, 1))
thick_panel('pinafore_apron', MID, NA, AP_T, 'apron', 'apron', (cr + 1) / 2, (zr - AP_BOT) / (AP_TOP - AP_BOT), front_extra=AP_FE)
APRON_FRONT = MID + NA * (AP_T / 2 + AP_FE[..., None])
# --- the bib: a thick cream panel on the chest (sheet: +-0.117 m, top edge z 0.471 m), its bottom hidden behind the obi
BIB_TOP, BIB_BOT, BIB_HW, BIB_R, BIB_T = .471, .388, .116, .012, .009
def bib_hw(z):
    dz = np.clip((np.asarray(z) - (BIB_TOP - BIB_R)), 0, BIB_R)
    return BIB_HW - BIB_R + np.sqrt(np.maximum(BIB_R * BIB_R - dz * dz, 0))
zb = np.concatenate([np.linspace(BIB_BOT, BIB_TOP - BIB_R, 9)[:-1], BIB_TOP - BIB_R + BIB_R * np.sin(np.linspace(0, PI / 2, 6))])
crb = np.sin(np.linspace(-PI / 2, PI / 2, 16))
BXg = crb[None, :] * bib_hw(zb)[:, None]; BZg = np.repeat(zb[:, None], len(crb), 1)
BYg = torso_front(.95 * BXg, BZg) - .0012 - BIB_T / 2 - .0115 * smooth(.405, .455, BZg)     # its top stands off the chest over the collar
BMID = np.stack([BXg, BYg, BZg], -1)
NB_ = unit(np.cross(np.gradient(BMID, axis=0), np.gradient(BMID, axis=1))); NB_ = np.where((NB_[..., 1:2] > 0), -NB_, NB_)
thick_panel('apron_bib', BMID, NB_, BIB_T, 'bib', 'body', (crb + 1) / 2, (zb - BIB_BOT) / (BIB_TOP - BIB_BOT))
# --- the straps: thick rounded cream bands from the bib's top corners up over the shoulders (under the head) and straight
# down the back into the obi (back view: centres +-0.098 m, 0.05 m wide)
STRAP_HW, STRAP_T = .0235, .0075
for s in (-1, 1):
    P = []; Nn = []
    for z in np.linspace(BIB_TOP - .016, .548, 9):
        x = s * (.100 + .006 * (z - BIB_TOP) / (.548 - BIB_TOP)); n = torso_normal(x, z)
        P.append(np.array([x, torso_front(x, z), z]) + n * (BIB_T + .0015 + .0115 * smooth(.405, .455, z) * smooth(.50, .47, z))); Nn.append(n)
    P.append(np.array([s * .106, -.030, .585])); Nn.append(unit(np.array([s * .2, -.6, 1.])))
    P.append(np.array([s * .104, .030, .585])); Nn.append(unit(np.array([s * .2, .6, 1.])))
    for z in np.linspace(.548, .384, 12):
        x = s * .098; n = torso_normal(x, z, back=True)
        P.append(np.array([x, -torso_front(x, z), z]) + n * .0015); Nn.append(n)
    surface_band('apron_strap.' + ('L' if s > 0 else 'R'), P, Nn, STRAP_HW, STRAP_T, 'strap', 'body')
# --- arms: short wide kimono sleeves with a rolled cream cuff, short arms, mitten paws
ARM_ANG = math.radians(37)
joint_arms = {}
SLV = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    grp = 'arm.' + tag
    Sh = np.array([s * .130, .012, .478]); Dv = unit(np.array([s * math.sin(ARM_ANG), .10, -math.cos(ARM_ANG)]))   # hanging a touch back (side view)
    Pv = unit(np.array([s * math.cos(ARM_ANG), 0, math.sin(ARM_ANG)])); Pv = unit(Pv - Dv * (Pv @ Dv)); Yv = -s * np.cross(Dv, Pv)
    T0, T1 = -.045, .150
    prof_s = []
    for t in np.linspace(T0, T1, 11):
        k = (t - T0) / (T1 - T0)
        bell = math.sin(min(1., k / .45) * PI / 2) ** .75
        cuff = .0045 * math.sin(PI * min(1., max(0., (t - (T1 - .024)) / .024)) ** .6) if t > T1 - .024 else 0.
        a_ = .036 + (.072 - .036) * bell + .004 * smooth(.4, 1., k) + cuff
        b_ = .032 + (.066 - .032) * bell + cuff
        prof_s.append((t, a_, b_, -.010 * k))
    lip = [(T1 + .004, -.004, -.004), (T1 + .006, -.0095, -.0095), (T1 + .004, -.015, -.015), (T1 - .004, -.017, -.017),
           (T1 - .028, -.017, -.017), (T1 - .055, -.019, -.019)]
    tl, al, bl, sg = prof_s[-1]
    for (t, da, db) in lip: prof_s.append((t, al + da, bl + db, sg))
    N = 22; verts = []; faces = []; uvs = []; M = len(prof_s)
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
    # the chart's v per profile row (for the paint): the cuff is cream from 0.024 m before the opening, over the roll and
    # 0.02 m inside; deeper inside is the shaded lining
    SLV = dict(M=M, c0=(10 - 1.25) / (M - 1), c1=(10 + 4.5) / (M - 1))
    sweep('short_arm.' + tag, [Sh + Dv * t for t in np.linspace(-.02, .200, 8)], lambda s_, L: .034, 'skin', grp, rings=10, sides=16)
    orient = Matrix([list(Pv), list(Yv), list(Dv)]).transposed()
    PAW_C = Sh + Dv * .212
    blob('mitten_paw.' + tag, tuple(PAW_C), (.060, .054, .064), 'paw', grp, 20, 11, p=(.92, .92, .92), orient=orient)
    joint_arms[tag] = {'shoulder': [float(v) for v in Sh], 'elbow': [float(v) for v in Sh + Dv * .095],
                       'wrist': [float(v) for v in Sh + Dv * .172], 'hand': [float(v) for v in PAW_C]}
    LOG['paw_clear_skirt_' + tag] = round(float(abs(PAW_C[0]) - .060 - np.interp(PAW_C[2], SK_Z, SK_AX) * 1.02), 4)
    LOG['paw_centre_' + tag] = [round(float(v), 3) for v in PAW_C]
# --- legs and rounded bean feet (sheet: feet 0.175 m wide, ~0.21 m long, ~0.085 m tall, centres +-0.11 m)
joint_legs = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    grp = 'leg.' + tag
    sweep('stubby_leg.' + tag, [(s * .108, .004, .300), (s * .109, .000, .200), (s * .110, -.004, .060)], lambda s_, L: .051, 'skin', grp, rings=8, sides=16)
    blob('bean_foot.' + tag, (s * .110, -.006, .043), (.088, .107, .043), 'foot', grp, 24, 12, p=(.80, .80, .78))
    joint_legs[tag] = {'hip': [s * .108, .004, .300], 'knee': [s * .109, .000, .180], 'ankle': [s * .110, -.004, .066], 'toe': [s * .110, -.094, .032]}
# --- tail: thick and dark, from the skirt's back under the obi knot, out and up into a hook curling forward over the
# top (side view: out to 0.32 m behind, top ~0.47 m, tip back near the knot); it drifts a little to her right (the back
# view puts it further right, the 3/4 view to her left: a compromise near the middle)
TAIL_CTRL = [(.000, .150, .300), (-.006, .196, .258), (-.026, .238, .238), (-.050, .274, .266), (-.066, .292, .330),
             (-.068, .282, .400), (-.058, .244, .440), (-.045, .206, .418)]
tpath = [catmull(TAIL_CTRL, t) for t in np.linspace(0, 1, 90)]
dl = (tpath[-1] - tpath[-2]).normalized()
TAIL_RB = .037
tpath += [tpath[-1] + dl * (TAIL_RB * k / 6) for k in range(1, 7)]
def tail_r(s, L):
    t = s / L; se = L - TAIL_RB
    r = float(np.interp(t, [0, .25, .6, 1.0], [.034, .036, .038, .037]))
    if s > se: r = min(r, TAIL_RB * math.sqrt(max(0., 1 - ((s - se) / TAIL_RB) ** 2)))
    return max(r, .0015)
def tail_rings(L):
    return L * np.concatenate([np.linspace(0, .88, 34), .88 + .12 * np.sin(np.linspace(0, 1, 9)[1:] * PI / 2)])
tail_ob, TAIL_L = sweep('calico_tail', tpath, tail_r, 'tail', 'tail', rings=tail_rings, sides=14, caps=(True, True))
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
def smax(a, b, k): return -smin(-a, -b, k)
# the calico patch (W units, head-local; her RIGHT = -x), traced on the sheet (measure/m4_patch.py, the back view):
# front: the inner border runs down the bridge (x -0.05 at the crown, -0.074 between the brows, -0.068 between the eyes),
# round the eye's lower rim (the eye sits on the border), then diagonally down to the cheek outline at z 0.167; the back:
# from the crown's centre (x -0.06 at z 0.69) curving down to the side outline at z 0.18. The whole right side between.
_eps = np.radians(np.linspace(196, 330, 15)); _ex, _ez = eye_unit(_eps)
_EYE_LOW = [(-(.205 + .1085 * 1.04 * a), .327 + .1015 * 1.04 * b) for a, b in zip(_ex, _ez)]
PATCH_FRONT = ([(-.050, 1.20), (-.050, .700), (-.057, .660), (-.065, .620), (-.071, .580), (-.074, .540), (-.074, .460), (-.071, .420),
                (-.068, .380), (-.069, .350), (-.073, .330), (-.080, .315)] + _EYE_LOW +
               [(-.334, .260), (-.354, .248), (-.373, .241), (-.392, .235), (-.412, .228), (-.431, .220), (-.450, .205), (-.469, .186),
                (-.489, .167), (-.520, .152), (-.90, .152), (-.90, 1.20)])
PATCH_BACK = [(-.060, 1.20), (-.075, .720), (-.085, .680), (-.090, .650), (-.102, .619), (-.114, .588), (-.126, .556), (-.138, .525),
              (-.150, .493), (-.161, .462), (-.177, .430), (-.193, .399), (-.213, .367), (-.232, .336), (-.260, .304), (-.291, .273),
              (-.331, .241), (-.386, .210), (-.440, .190), (-.500, .175), (-.90, .170), (-.90, 1.20)]
def patch_alpha(q, aa=.0042):
    x, y, z = q[:, 0], q[:, 1], q[:, 2]
    wb = smooth(-.10, .22, y)
    dF = poly_sd(x, z, PATCH_FRONT); dB = poly_sd(x, z, PATCH_BACK)
    return 1 - smooth(-aa, aa, dF * (1 - wb) + dB * wb)
def paint_head(d): return paint_head_P(radial_hit(d))
def paint_head_P(P):
    n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); zr = q[:, 2]
    fr = smooth(HY + .03, HY - .07, y)
    C = np.broadcast_to(rgb('fur'), (len(x), 3)).copy()
    pa = patch_alpha(q)
    C = mix(C, rgb('patch'), pa)
    C = mix(C, rgb('patchlight'), .30 * pa * smooth(.2, .8, n[:, 2]) * smooth(.3, -.3, n[:, 1]))     # the forehead / crown catches light
    shade = mix(rgb('furshade'), rgb('patchshade'), pa)
    # soft painted shade: under the jaw toward the neck, the jaw's sides (value only, no hue shift on the crown)
    nb = fr * np.exp(-((x / (.062 * W)) ** 2 + ((z - NZ) / (.050 * W)) ** 2) ** 2)          # the nose button: no face shading on it
    under = smooth(-.25, -.85, n[:, 2]) * (1 - smooth(.10, .26, zr)) * (1 - nb)
    C = mix(C, shade, .80 * under)
    jaw = smooth(.40, .85, np.abs(n[:, 0])) * (1 - smooth(.16, .46, zr)) * (1 - nb)
    C = mix(C, shade, .60 * jaw)
    sides = smooth(.35, .95, np.abs(n[:, 0]) + .6 * clamp(n[:, 1])) * (1 - smooth(.55, .85, n[:, 2])) * (1 - nb)
    C = mix(C, shade, .42 * sides)
    # the white muzzle: a soft two-lobed puff round the mouth, reaching up round the nose (the sheet's lighter #ffffff)
    mx = x / W; mz = (z - CHIN) / W
    rr = np.minimum(np.sqrt((mx / .150) ** 2 + ((mz - .178) / .102) ** 2), np.sqrt((mx / .072) ** 2 + ((mz - .248) / .050) ** 2))
    lobe = np.minimum(np.sqrt(((np.abs(mx) - .060) / .095) ** 2 + ((mz - .170) / .090) ** 2), rr)
    mu = (1 - smooth(.82, 1.08, lobe)) * fr * (1 - pa)
    C = mix(C, rgb('muzzle'), mu * (1 - .20 * under))
    # contact shade at the ear bases
    for s in (-1, 1):
        ei = ear_info[s]; dd = np.linalg.norm(P - ei['S'], axis=1)
        C = mix(C, shade, .20 * np.exp(-(dd / (.12 * W)) ** 2))
    # nose: a soft rounded inverted triangle (sheet: 0.086 W wide, top z 0.284, tip 0.223) with a small soft highlight
    nx = mx; nzz = mz
    tri = poly_sd(nx, nzz, [(-.0320, .2740), (.0320, .2740), (0, .2370)]) - .0150      # a well rounded inverted triangle
    fwd = smooth(-.97, -.85, n[:, 2])                    # (the button's underside stays pink too)
    C = mix(C, rgb('nose'), (1 - smooth(-.0022, .0022, tri)) * fr * (nzz > .20) * fwd)
    hl = np.exp(-(((nx + .008) / .0100) ** 2 + ((nzz - .2700) / .0055) ** 2))
    C = mix(C, rgb('#dc9ea4'), .45 * hl * fr * (1 - smooth(-.002, .002, tri)))
    # blush ovals (soft)
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .80 * (1 - smooth(.45, 1.08, r)) * fr)
    # brows: thick soft arches (sheet: inner end (0.132, 0.537), top (0.19, 0.565), outer end (0.264, 0.513) W), tapering
    t = np.linspace(-1, 1, 17)
    for s in (-1, 1):
        Pb = np.stack([s * (.198 + .066 * t) * W, CHIN + (.5641 - .012 * t - .0391 * t * t) * W], -1)
        half = .0140 * W * np.maximum(0, 1 - t * t) ** .55 + .0028 * W
        box = fr * ((np.abs(x - s * .198 * W) < .10 * W) & (np.abs(z - (CHIN + .54 * W)) < .06 * W))
        a = np.zeros(len(x)); ib = box > 0
        a[ib] = stroke(x[ib], z[ib], Pb, half, .0030 * W)
        C = mix(C, rgb('brow'), .95 * a * fr)
    # mouth: the sheet's cat "w" (two arcs from the centre to the corners, dipping to z 0.171 W) and the line to the nose
    tl = np.linspace(0, 1, 21)
    ib = (fr > 0) & (np.abs(x) < .12 * W) & (np.abs(z - (CHIN + .195 * W)) < .06 * W)
    a = np.zeros(len(x))
    for s in (-1, 1):
        ax_ = s * MHW * tl; az_ = CHIN + (.191 + .002 * tl - .094 * tl * (1 - tl) + .006 * smooth(.80, 1., tl)) * W
        Pm = np.stack([ax_, az_], -1); half = (.0056 - .0010 * tl ** 2) * W
        a[ib] = np.maximum(a[ib], stroke(x[ib], z[ib], Pm, half, .0026 * W))
    Pp = np.array([[0, CHIN + .226 * W], [0, CHIN + .191 * W]])
    a2 = np.zeros(len(x)); a2[ib] = stroke(x[ib], z[ib], Pp, np.array([.0048 * W, .0052 * W]), .0026 * W)
    C = mix(C, rgb('mouth'), .95 * np.maximum(a, a2))
    return C

def paint_eye(U, V, s):
    """amber eyes (sheet): the iris 0.70 of the opening, tucked to the nose; a big dark pupil nudged nasal; one big catchlight"""
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .28; iz = .0; irx = .705; irz = .96
    C = mix(rgb('#fffaf4'), rgb('#e6dfe2'), .45 * smooth(.35, .98, Z))
    C = mix(C, rgb('#ede7ea'), .25 * smooth(.3, 1., s * X))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#e0ae4c'), rgb('#cc9a3c'), smooth(-.85, -.35, ez))      # #C8A040 family: golden at the bottom, deep amber at the top
    I = mix(I, rgb('#a87228'), smooth(-.30, .25, ez))
    I = mix(I, rgb('#6e4618'), smooth(.25, .85, ez))
    I = mix(I, rgb('#58381a'), smooth(.80, 1.0, r) * .65)
    I = I * (1 - .025 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 26 + r * 9)))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    px_ = ix - s * .150; pz = .05; R = np.sqrt(((X - px_) / (.70 * irx)) ** 2 + ((Z - pz) / (.70 * irz)) ** 2)
    C = mix(C, rgb('#2e2018'), 1 - smooth(.985, 1.015, R))
    big = np.sqrt(((X - (-s * .46)) / .245) ** 2 + ((Z - .52) / .26) ** 2)
    C = mix(C, rgb('#fffbf6'), 1 - smooth(.90, 1.06, big))
    C = mix(C, rgb('lash'), .85 * smooth(.92, 1.0, sr) * smooth(-.30, .30, Z))      # lid contact under the lash ribbon
    return C

def paint_ear(U, V, s):
    a = U * 2 * PI - PI / 2; ca = np.cos(a); sa = np.sin(a)
    tb = EAR_TABLE[s]; rho = np.interp(V, tb['V'], tb['rho']); hz = np.interp(V, tb['V'], tb['hz'])
    inner = (rho - EAR['rim']) * np.sqrt(np.clip(1 - np.clip((hz - .05) / .63, 0, 1) ** 3, 0, 1))     # a rounded top (the sheet)
    dd = np.abs(ca * rho - .020 * W) - inner          # the pink sits a little toward the head's middle (the sheet)
    m = (1 - smooth(-.0022, .0022, dd)) * (sa > 0) * (inner > .002)
    C = mix(rgb('patch'), rgb('patchshade'), .45 * (1 - smooth(.05, .35, hz)))
    C = mix(C, rgb('patchlight'), .30 * smooth(.45, .95, hz))
    C = mix(C, rgb('patchshade'), .35 * smooth(.5, .95, np.abs(ca)) * (sa < .3))          # the ear's sides a value darker (reads round)
    C = mix(C, rgb('patchlight'), .30 * smooth(.25, .9, -sa))                              # the back of the ear catches the light
    deep = (1 - np.clip(np.abs(ca) * rho / np.maximum(inner, 1e-4), 0, 1)) * (1 - smooth(.25, .75, hz))
    P_ = mix(rgb('inner'), rgb('innerdeep'), .50 * deep)
    return mix(C, P_, m)

def cream_across(U, base='cream'):
    across = smooth(.0, .45, np.abs(np.sin(U * PI)))
    return mix(rgb('creamshade'), rgb(base), across * .9 + .1)

def paint(chart, U, V):
    if chart == 'head': return paint_head(head_uv_dir(U.ravel(), V.ravel())).reshape(U.shape + (3,))
    if chart == 'headback': return paint_head(headback_uv_dir(U.ravel(), V.ravel())).reshape(U.shape + (3,))
    if chart == 'eye.L': return paint_eye(U, V, 1)
    if chart == 'eye.R': return paint_eye(U, V, -1)
    if chart == 'ear.L': return paint_ear(U, V, 1)
    if chart == 'ear.R': return paint_ear(U, V, -1)
    if chart == 'kimono':
        z = np.interp(V, np.linspace(0, 1, len(TOR_Z)), TOR_Z); a = U * 2 * PI
        ax = np.interp(z, TOR_Z, TOR_AX); x = ax * spow(np.sin(a), 2 / TOR_N); front = np.cos(a) <= 0
        C = mix(rgb('kimono'), rgb('kimonolight'), .45 * smooth(.42, .50, z))
        C = mix(C, rgb('kimonoshade'), .35 * (1 - smooth(.37, .42, z)))
        # front: fur inside the collar's V (the bands cover its edges)
        vneck = front & (np.abs(x) < .85 * (z - NECK_V) + .004) & (z > NECK_V - .004)
        F_ = mix(rgb('fur'), rgb('furshade'), .55)
        return mix(C, F_, vneck * 1.)
    if chart == 'sleeve':
        C = mix(rgb('kimono'), rgb('kimonolight'), .45 * smooth(.15, .60, V) * smooth(-.2, .8, np.sin(U * 2 * PI)))
        C = mix(C, rgb('kimonoshade'), .30 * smooth(.2, .9, -np.sin(U * 2 * PI)))
        cuff = smooth(SLV['c0'] - .012, SLV['c0'] + .004, V) * (1 - smooth(SLV['c1'] - .004, SLV['c1'] + .012, V))
        CU = mix(rgb('creamshade'), rgb('cream'), .55 + .45 * smooth(-.4, .8, np.sin(U * 2 * PI)))
        C = mix(C, CU, cuff)
        C = mix(C, rgb('kimonodeep'), smooth(SLV['c1'], SLV['c1'] + .02, V))         # the lining deeper inside
        return C
    if chart == 'collar': return cream_across(U)
    if chart == 'strap':
        C = cream_across(U)
        return mix(C, rgb('creamshade'), .25 * np.exp(-((V - .5) / .08) ** 2))     # a soft shade where it passes under the head
    if chart == 'bib':
        C = np.broadcast_to(rgb('cream'), U.shape + (3,)).copy()
        fr = V >= .29; vv = (V - .30) / .70
        C = mix(C, rgb('creamshade'), .45 * (1 - smooth(.0, .40, vv)) * fr + .45 * (~fr))      # shade toward the obi
        C = mix(C, rgb('creamline'), .45 * np.exp(-((vv - .80) / .025) ** 2) * fr)              # a stitched hem under the top edge
        return C
    if chart == 'obi':
        z = np.interp(V, np.linspace(0, 1, len(OBI_Z)), OBI_Z)
        C = mix(rgb('obishade'), rgb('obi'), smooth(.333, .346, z) * (1 - .55 * smooth(.388, .400, z)))
        C = mix(C, rgb('obilight'), .30 * np.exp(-((z - .372) / .010) ** 2))
        return C
    if chart == 'tab':          # the pillow knot: u = azimuth (its back-facing middle at u = 0 / 1), v bottom -> top
        face = clamp(np.cos(U * 2 * PI)); mid = 1 - np.abs(V - .5) * 2
        C = mix(rgb('obishade'), rgb('obi'), smooth(.0, .55, face) * smooth(.0, .30, mid))
        C = mix(C, rgb('obilight'), .35 * smooth(.6, 1., face) * smooth(.4, .9, mid))
        return mix(C, rgb('obideep'), .35 * (1 - smooth(.05, .25, mid)))
    if chart == 'apron':
        C = np.broadcast_to(rgb('cream'), U.shape + (3,)).copy()
        fr = V >= .29
        uu = (U - .04) / .92; vv = (V - .30) / .70
        side_e = np.minimum(uu, 1 - uu) * (AP_HW0 + AP_HW1); bot_e = vv * (AP_TOP - AP_BOT)
        line = np.maximum(np.exp(-((side_e - .013) / .0022) ** 2) * (bot_e > AP_HEM + .004), np.exp(-((bot_e - AP_HEM - .002) / .0022) ** 2) * (side_e > .010)) * (vv < .90)
        C = mix(C, rgb('creamshade'), .45 * np.exp(-((bot_e - AP_HEM - .0005) / .0030) ** 2) * fr)      # the crease above the rolled hem
        C = mix(C, rgb('creamline'), .55 * line * fr)
        C = mix(C, rgb('creamshade'), .30 * (1 - smooth(.0, .35, vv)) * fr + .30 * smooth(.88, 1., vv) * fr + .45 * (~fr))
        return C
    if chart == 'skirt':
        a = U * 2 * PI; fold = np.cos(8 * a + .4)
        C = mix(rgb('skirt'), rgb('skirtlight'), .40 * clamp(fold) * smooth(.15, .60, V))
        C = mix(C, rgb('skirtshade'), .40 * clamp(-fold) * smooth(.15, .60, V))
        C = mix(C, rgb('skirtshade'), .45 * (1 - smooth(.0, .12, V)))                  # under the obi
        C = mix(C, rgb('skirtshade'), .50 * smooth(.66, .72, V))                       # hem roll underside / inside
        C = mix(C, rgb('skirtdeep'), .55 * smooth(.80, .95, V))
        return C
    if chart in ('skin', 'paw', 'foot'):
        C = np.broadcast_to(rgb('fur'), U.shape + (3,)).copy()
        if chart == 'skin':     # arms and legs: warm shade on their backs (+Y is u = .75 on these tubes) and at the roots
            back = np.exp(-((U - .75) / .17) ** 2)
            C = mix(C, rgb('furshade'), np.clip(.60 * back + .35 * (1 - smooth(.0, .35, V)), 0, 1))
        if chart == 'paw':
            back = np.exp(-(np.minimum(U, 1 - U) / .16) ** 2)
            C = mix(C, rgb('furshade'), .45 * back)
            C = mix(rgb('furshade'), C, .55 + .45 * smooth(.0, .30, V))
        if chart == 'foot':
            C = mix(C, rgb('furshade'), .60 * (1 - smooth(.02, .10, V)))          # the sole's underside only
        return C
    if chart == 'tail':
        C = mix(rgb('patchshade'), rgb('patch'), .55 + .45 * smooth(-.6, .6, np.cos(U * 2 * PI)))
        return mix(C, rgb('patchlight'), .25 * smooth(.3, 1., np.cos(U * 2 * PI)) * smooth(.4, 1., V))
    if chart == 'lash':
        return mix(rgb('lash'), rgb('#4a3d42'), .40 * smooth(.60, .95, V))
    if chart == 'cavity': return mix(rgb('#5a1e22'), rgb('#3e1418'), .5 * smooth(.3, 1, V))
    if chart == 'tongue': return mix(rgb('#e88a96'), rgb('#f2a2ac'), .5 * smooth(.2, .9, V))
    if chart.startswith('lid'): return np.broadcast_to(rgb('fur'), U.shape + (3,)).copy()      # painted by the rig
    if chart == 'nose':     # front-projected: each texel painted at its true surface point
        x = (U.ravel() - .5) * 2 * NOSE_CH * W; z = NZ + (V.ravel() - .5) * 2 * NOSE_CH * W
        P = np.stack([x, front_hit(x, z), z], -1); return paint_head_P(P).reshape(U.shape + (3,))
    raise KeyError(chart)

atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [255, 242, 228, 255]
for name, (x0, y0, w, h) in CHARTS.items():
    U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
    if name in ('head', 'headback'):
        block = np.empty((h, w, 3))
        for r0 in range(0, h, 128): block[r0:r0 + 128] = paint(name, U[r0:r0 + 128], V[r0:r0 + 128])
    else:
        block = paint(name, U, V)
    atlas[y0:y0 + h, x0:x0 + w, :3] = np.round(clamp(block) * 255).astype(np.uint8)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
atlas_path = os.path.join(ROOT, 'ak-ochiyo-toy_rig_atlas.png' if RIG else 'ak-ochiyo-toy_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Ochiyo_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Ochiyo_toy_atlas'); MAT.use_nodes = True
bs = MAT.node_tree.nodes.get('Principled BSDF'); bs.inputs['Roughness'].default_value = .8
bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .25
tx = MAT.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
MAT.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])

# ============================================================== MEASURE (before joining)
def all_verts(obs): return np.array([list(o.matrix_world @ v.co) for o in obs for v in o.data.vertices])
sk = np.array([list(v.co) for v in skin.data.vertices])
nose_tip_y = HY + NOSE_TIP_L * W
earv = all_verts(parts['ear.L'] + parts['ear.R'])
allv = all_verts([o for g in GROUPS for o in parts[g]])
rimL = RIM_L
MEAS = {'W_m': W, 'chin_z_m': CHIN, 'total_height_m': round(float(allv[:, 2].max()), 4), 'min_z_m': round(float(allv[:, 2].min()), 4),
        'head_width_W': round(float(np.ptp(sk[:, 0]) / W), 3),
        'crown_above_chin_W': round(float((sk[:, 2].max() - CHIN) / W), 3),
        'head_depth_W': round(float(np.ptp(sk[:, 1]) / W), 3),
        'ear_tip_z_m': round(float(earv[:, 2].max()), 4), 'ear_tip_above_crown_W': round(float((earv[:, 2].max() - sk[:, 2].max()) / W), 3),
        'ear_tip_x_W': round(float(abs(earv[np.argmax(earv[:, 2]), 0]) / W), 3),
        'eye_centre_W': [round(EX / W, 3), round((EZ - CHIN) / W, 3)],
        'eye_opening_W': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'nose_tip_z_W': round(NOSE_TIP_Z, 3), 'nose_tip_y_m': round(nose_tip_y, 4),
        'nose_proud_of_face_W': round(float(front_local(0, .36, head_local)[0] - NOSE_TIP_L), 3)}
MEAS.update(LOG)

# ============================================================== JOIN, CLEAN, NORMALS
objects = []; part_tri = {}
NAMES = {'head': 'Ochiyo_head', 'eye.L': 'Ochiyo_eye_L', 'eye.R': 'Ochiyo_eye_R', 'lash.L': 'Ochiyo_lash_L', 'lash.R': 'Ochiyo_lash_R',
         'ear.L': 'Ochiyo_ear_L', 'ear.R': 'Ochiyo_ear_R', 'body': 'Ochiyo_body', 'apron': 'Ochiyo_apron',
         'arm.L': 'Ochiyo_arm_L', 'arm.R': 'Ochiyo_arm_R', 'leg.L': 'Ochiyo_leg_L', 'leg.R': 'Ochiyo_leg_R', 'tail': 'Ochiyo_tail'}
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
    piv = {'head': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'], 'lash.L': eye_centers['L'], 'lash.R': eye_centers['R'],
           'ear.L': tuple(ear_info[1]['S']), 'ear.R': tuple(ear_info[-1]['S']), 'apron': (0, -.20, AP_TOP),
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
    ears_j[tag] = {'base': [float(v) for v in ei['S']], 'mid': [float(v) for v in ei['S'] + ei['w'] * .13 * W],
                   'tip': [float(v) for v in ei['T']]}
joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X',
          'root': [0, 0, 0], 'hips': [0, .004, .300], 'spine': [0, .006, .370], 'chest': [0, .010, .450], 'neck': [0, .015, .525],
          'head_base': [0, .040, CHIN + .02], 'head': [float(v) for v in O],
          'jaw_pivot': [0, float(HY - .16 * W), float(CHIN + .15 * W)],
          'mouth_corners': {'L': [float(MHW + .006 * W), float(front_hit(MHW, MC)[0]), float(CHIN + .196 * W)],
                            'R': [float(-MHW - .006 * W), float(front_hit(-MHW, MC)[0]), float(CHIN + .196 * W)]},
          'eyes': eye_centers, 'brows': {'L': [BROW_X, float(front_hit(BROW_X, BROW_Z)[0]), BROW_Z], 'R': [-BROW_X, float(front_hit(-BROW_X, BROW_Z)[0]), BROW_Z]},
          'lashes': lash_info, 'ears': ears_j, 'arms': joint_arms, 'legs': joint_legs, 'tail': TAIL_JOINTS,
          'apron': {'top': [0, float(APRON_FRONT[-1, NCA // 2, 1]), AP_TOP], 'hem': [0, float(APRON_FRONT[0, NCA // 2, 1]), AP_BOT]},
          'obi_knot': [float(v) for v in KNOT_C],
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth implicit ball (fitted superquadric + lower-face fullness + nose button), radially projected, analytic normals.',
                    'Eyelid holes ringed by %d concentric loops each, rim rolled in behind separate lens eyeballs; 3 loops round the mouth, 4 round the nose.' % len(EYE_SCALES),
                    'Separate pieces: eyes, lash ribbons (origin at the eye centre, for the upper lids), ears, apron panel (hanging cloth, bend rows every ~1 cm), tail.',
                    'The bib, straps, collar, obi and its pillow knot are in Ochiyo_body (torso followers).']}
if not RIG:
    with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if RIG: raise_done = True
else:
  bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'ak-ochiyo-toy.blend'))
  bpy.ops.object.select_all(action='DESELECT')
  for ob in objects: ob.select_set(True)
  bpy.context.view_layer.objects.active = objects[0]
  bpy.ops.export_scene.gltf(filepath=MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('OCHIYO_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': MODEL}), flush=True)
