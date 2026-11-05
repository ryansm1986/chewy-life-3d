"""Kome / Cook (Toybox zone villager, VL-2, Takemori Village), Opus build, phase 1 (the model). Blender 4.3, no addons.
Deterministic.

    blender --background --factory-startup --python build_tk-kome-toy.py

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/tk-kome-toy.glb.

Technique (the Mochi / Sasa toy-line machinery, Mochi's build as the base):
- The head is ONE smooth implicit ball: a superquadric fitted to the sheet's front and side outlines (scratch/headfit.py),
  with a gentle lower-face fullness and a nose button smooth-unioned in. Its skin is the field's zero surface reached by
  radial projection (CDT in a stereographic domain with edge loops round both eyelid holes, the nose and the mouth),
  every vertex on the surface with the field's analytic normal: the face stays convex, no sockets. The calico patch,
  brows, nose, mouth and blush are painted on the ball from 3D positions into a 2048 atlas.
- The eyes are separate flush lens globes in real lid holes. The upper lash line is its OWN object per eye (a thick
  tapered ribbon lying on the skin over the upper rim and down the outer side, with two small wing flicks), not paint.
- The ears are thick rounded-cone volumes (parametric, exact normals) with a shallow pink dish; the white headband is a
  thick soft ring swept round the head in a plane tilted 13 deg back, riding over the ear roots, with a tab at the back.
- The costume: a kimono torso (lathe; the back neckline scoops down to show the nape patch), crossed collar bands
  (white at the neck, pink lapel below), a thick two-layer white obi, a thick cream apron panel with rounded corners
  hanging from under the obi, an A-line plum skirt with soft folds and a rolled hem, wide short kimono sleeves, mitten
  paws, stubby legs and bean feet, a thick S tail (cream root, orange club), and the wooden rice paddle at her right hip
  tied to the obi with a white cord.
"""
import bpy, bmesh, math, json, os, struct, zlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt

ROOT = os.path.dirname(os.path.abspath(__file__))
RIG = bool(globals().get('RIG_MODE'))      # reserved for the phase-2 rig script: no approved file is written in rig mode
MODEL = 'D:/projects/chewy-life-3d/public/models/tk-kome-toy.glb'
os.makedirs(os.path.join(ROOT, 'preview'), exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
W = .606; CHIN = .505; HY = .027       # face width at the cheeks, chin height, head centre y (metres; measure.md)
SW = W / .44                           # Rosie's metric detail sizes (0.44 m head) scaled to this head
LOG = {}

PAL = {'fur': '#fff1e2', 'furshade': '#f0d6be', 'orange': '#e89a5a', 'orangeshade': '#d8884a', 'orangelight': '#f2aa6a',
       'inner': '#ffb0c0', 'innerdeep': '#f79aae', 'nose': '#cb7f86', 'blush': '#f5a0ad',
       'kimono': '#f2b8c8', 'kimonolight': '#f8c8d4', 'kimonoshade': '#e09fb2', 'kimonodeep': '#c98498',
       'white': '#fffaf4', 'whiteshade': '#e9e0d8', 'apron': '#fff6ea', 'apronshade': '#efe0cc', 'apronline': '#e6d3bc',
       'skirt': '#7a5767', 'skirtlight': '#8a6576', 'skirtshade': '#664654', 'skirtdeep': '#523845',
       'wood': '#b8834f', 'woodlight': '#c99560', 'wooddark': '#9a6a3c',
       'lash': '#2c2022', 'brow': '#6a4630', 'mouth': '#4a2e2a', 'line': '#e8cdb6'}
# 2048 atlas charts (x, y, w, h) in pixels, y up (Blender UV convention).
CHARTS = {'head': (0, 768, 1280, 1280), 'headback': (1280, 1280, 768, 768),
          'eye.L': (1280, 896, 384, 384), 'eye.R': (1664, 896, 384, 384),
          'ear.L': (1280, 640, 384, 256), 'ear.R': (1664, 640, 384, 256),
          'kimono': (0, 384, 512, 384), 'sleeve': (512, 384, 512, 384), 'collar': (1024, 512, 256, 256),
          'obi': (1024, 256, 256, 256), 'skirt': (0, 0, 512, 384), 'skin': (512, 0, 512, 384),
          'paw': (1024, 0, 256, 256), 'foot': (1280, 384, 384, 256), 'tail': (1664, 384, 384, 256),
          'paddle': (1280, 0, 256, 192), 'band': (1280, 192, 256, 192), 'apron': (1536, 0, 256, 384),
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
# fitted to the sheet (scratch/headfit.py): widest 0.24 W above the chin, crown 0.756 W, depth 0.82-0.86 W, a fuller
# lower face (the side view's mouth zone stands 0.04 W ahead of the eye zone)
LOWFACE = dict(m=.12, z=.20, w=.10)
HEAD = dict(A=.500, BF=.388, BB=.430, ZC=.240, HT=.516, HB=.240, nA_t=1.95, nA_b=2.45, nB_t=2.5, nB_b=3.0, n=2.0, nBb_t=3.1, nBb_b=2.0, egg=.35)
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
NZ_L = .262                                          # the painted nose's centre (sheet: top 0.283, tip 0.237 W)
_yn = float(front_local(0, NZ_L, skull_local)[0])
NOSE = [[0, _yn + .022 - .036, .257], [.037, .022, .025]]; K_N = .016     # ~0.035 W proud (the side view)
def head_local(q): return smin(skull_local(q), ell(q, *NOSE), K_N)
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
EX = .218 * W; EZ = CHIN + .324 * W; EHW = .099 * W; EHH = .088 * W; EN = 2.1
def eye_unit(psi):
    c = np.cos(psi); s = np.sin(psi)
    return spow(c, 2 / EN), spow(s, 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
def lid_edge_Z(X): return 1.25 + 0 * np.asarray(X, float)      # open eyes: no rest lid over the lens (the rig adds the lids)
NZ = CHIN + NZ_L * W; MC = CHIN + .197 * W; MHW = .085 * W
BROW_Z = CHIN + .507 * W; BROW_X = .208 * W
BLUSH = (.313 * W, CHIN + .208 * W, .060 * W, .045 * W)

# ============================================================== geometry helpers
GROUPS = ['head', 'eye.L', 'eye.R', 'lash.L', 'lash.R', 'ear.L', 'ear.R', 'band', 'body', 'apron', 'arm.L', 'arm.R', 'leg.L', 'leg.R', 'tail']
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
NOSE_CH = .066          # the nose button's own front-projected chart (half-size in W)
_VA = np.array(verts); _nose_v = (_VA[:, 1] < HY) & (np.hypot(_VA[:, 0] / W, (_VA[:, 2] - NZ) / W) < .050) & (vnorm[:, 1] < -.55)   # forward-facing only
def nose_uv(i): return au('nose', .5 + _VA[i, 0] / (2 * NOSE_CH * W), .5 + (_VA[i, 2] - NZ) / (2 * NOSE_CH * W))
LOG['nose_chart_faces'] = 0
for f in faces:
    a = math.acos(float(np.clip(-vdir[list(f)].mean(0)[1] / np.linalg.norm(vdir[list(f)].mean(0)), -1, 1)))
    if all(_nose_v[i] for i in f):
        face_uvs.append(tuple(nose_uv(i) for i in f)); LOG['nose_chart_faces'] += 1
    elif a < A_SPLIT: face_uvs.append(tuple(tuple(au('head', *fuv[i])) for i in f))
    else: face_uvs.append(tuple(tuple(au('headback', *buv[i])) for i in f))
skin = mesh('kome_head_skin', verts, faces, face_uvs, 'head', 'head', raw_uv=True, normals=vnorm)
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
LASH_PSI = np.radians(np.linspace(158, -52, 36))         # inner top -> over the top -> down the outer side
def lash_th(psi):      # thickness in eye-radius units (the opening's superellipse radius)
    d = np.degrees(psi)
    th = .30 + .07 * np.exp(-((d - 35) / 30) ** 2)
    th = th * (1 - .58 * smooth(22, -38, d))     # round 2: a touch more taper down the outer side
    return th * smooth(160, 128, d) * smooth(-55, -10, d) + .02
LASH_WINGS = [((52, .95), (1.31, 1.02)), ((30, .95), (1.50, .74))]    # (root psi deg, root k), tip (X outer, Z) eye units
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
    for (rpsi, rk), (tx, tz) in LASH_WINGS:
        rp = math.radians(rpsi); rux, ruz = eye_unit(np.array([rp]))
        thr = lash_th(np.array([rp]))[0]
        R0 = np.array([rux[0] * (k_in + thr * .45), ruz[0] * (k_in + thr * .45)])
        T0 = np.array([tx, tz])
        mid = R0 + (T0 - R0) * .5 + np.array([-.06, .08])         # a slight upward curl
        ws = np.linspace(0, 1, 11)
        XZ = np.array([(1 - w) ** 2 * R0 + 2 * (1 - w) * w * mid + w * w * T0 for w in ws])
        Cw, nw = eye_pt(s, XZ[:, 0], XZ[:, 1])
        hww = (.0135 * W) * (1 - ws) ** .9 + .0012 * W
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

BAND_ZF, BAND_ZB, BAND_H, BAND_T = .900, .782, .065, .0165      # (the headband, built after the ears; the ears tuck under it)
def band_zc(phi): return BAND_ZF + (BAND_ZB - BAND_ZF) * (1 - np.cos(phi)) / 2
def ear_tuck(V):
    """round 2 (Kazemaru's tuck): below the band's top edge no ear point stands further out (horizontally, from the head's
    axis) than the head surface + 6 mm, so the band (16.5 mm thick, hugging the head) covers the root and its top edge
    stays one clean line; returns the new points and the blend weight (0 = untouched)"""
    V = np.array(V, float); phi_ = np.arctan2(V[:, 0], -(V[:, 1] - HY))
    ztop = band_zc(phi_) + BAND_H / 2
    wv = smooth(ztop + .012, ztop - .010, V[:, 2]); sel = wv > 0         # only under the band (the visible ear is untouched)
    if sel.any():
        Dh = np.stack([np.sin(phi_[sel]), -np.cos(phi_[sel]), np.zeros(sel.sum())], -1)
        Ch = np.stack([np.zeros(sel.sum()), np.full(sel.sum(), HY), V[sel, 2]], -1)
        Hh = ray_hit(Ch, Dh, head_sdf, 0., .6); rh = np.linalg.norm(Hh[:, :2] - Ch[:, :2], axis=1)
        rv = np.linalg.norm(V[sel, :2] - Ch[:, :2], axis=1)
        new_r = rv - wv[sel] * np.maximum(rv - (rh + .010), 0)
        dirh = (V[sel, :2] - Ch[:, :2]) / np.maximum(rv, 1e-9)[:, None]
        V[sel, :2] = Ch[:, :2] + dirh * new_r[:, None]
    return V, wv
# ============================================================== EARS: soft, upright rounded-cone cat ears with a pink dish
# Mochi's round-4 ear (smooth parametric surface with exact normals), placed on Kome's sheet: tips x +-0.35 W,
# 0.115 W over the crown (z 0.871 W), axis leaning ~17 deg outward, the base on the crown's shoulder
EAR = dict(r1=.178 * W, r2=.018 * W, sy=.84, flat=.88, hollow=.012 * W, rim=.050 * W, sink=.035 * W, tilt=13., yaw=10., lean=-4., bulge=.018 * W)
EAR_TIP_LOCAL = np.array([.340, .060, .878])          # W units: x, y behind the head centre, z above the chin
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
    nrow, seg = 28, 28
    uu = np.linspace(0, 1, nrow + 1)
    tv = np.interp(uu, [0, .16, .84, 1.0], [0, arc2 / tot, (arc2 + line) / tot, 1.0])
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
    V, wtuck = ear_tuck(V); NV = np.array(NV); NV[wtuck > .02] = 0.          # tucked points: the mesh's own normals
    LOG['ear_tucked_' + tag] = int((wtuck > .02).sum())
    mesh('cat_ear.' + tag, V, fs, uvf, 'ear.' + tag, 'ear.' + tag, normals=NV)
    ear_info[s] = E
    tf = np.linspace(0, 1, 400); pr = prof_at(tf * tot)
    EAR_TABLE[s] = dict(V=(1 - tf)[::-1], rho=pr[::-1, 0], hz=((pr[:, 1] - EAR['sink']) / (E['L'] + EAR['r2'] - EAR['sink']))[::-1])
    LOG['ear_' + tag] = {'tip_m': [round(float(c), 4) for c in E['T']], 'base_on_skin_m': [round(float(c), 4) for c in E['S']],
                         'L_W': round(E['L'] / W, 3)}
def ear_sdf(p):
    """approximate distance to both ears (a squashed round cone per ear), metres; used to lay the band over the roots"""
    out = np.full(p.shape[:-1], 9.)
    for s in (-1, 1):
        E = ear_info[s]; d = p - E['C']
        lx = d @ E['t']; ly = (d @ E['f']) / EAR['sy']; lz = d @ E['w']
        r1, r2, L = EAR['r1'] * .97, EAR['r2'], E['L']
        q = np.stack([np.hypot(lx, ly), lz], -1)
        b = (r1 - r2) / L; a = math.sqrt(1 - b * b); k = q @ np.array([-b, a])
        dd = np.where(k < 0, np.linalg.norm(q, axis=-1) - r1,
                      np.where(k > a * L, np.linalg.norm(q - np.array([0, L]), axis=-1) - r2, q @ np.array([a, b]) - r1))
        dd = np.maximum(dd, EAR['sink'] + .006 - lz)          # only the ear's visible part (no buried base sphere)
        out = np.minimum(out, dd * (.5 + .5 * EAR['sy']))
    return out

# ============================================================== THE HEADBAND: a thick soft ring tilted 13 deg back + a back tab
# sheet: the centre line at z 0.900 m in front, 0.780 m at the back (the side view; 13 deg), 0.065 m tall, ~0.016 m
# thick; it rides over the ears' outer roots (laid on min(head, ears)); a small flat tab on the back's centre
def band_field(p): return head_sdf(p)            # round 2: the band hugs the head alone; the ears rise from behind it
NBP = 64; NBS = 12
phis = np.linspace(0, 2 * PI, NBP, endpoint=False)
sa_b = np.linspace(0, 2 * PI, NBS, endpoint=False)
sec_db = BAND_H / 2 * spow(np.sin(sa_b), .38); sec_dn = (BAND_T + .004) / 2 * spow(np.cos(sa_b), .45) + (BAND_T - .004) / 2
G = np.zeros((NBP, NBS, 3))
Dh = np.stack([np.sin(phis), -np.cos(phis), np.zeros_like(phis)], -1)
for j in range(NBS):
    Cz = np.stack([np.zeros_like(phis), np.full_like(phis, HY), band_zc(phis) + sec_db[j]], -1)
    P = ray_hit(Cz, Dh, band_field, 0., .6); N = grad_n(P, band_field)
    G[:, j] = P + N * sec_dn[j]
dK = np.roll(G, -1, 0) - np.roll(G, 1, 0); dS = np.roll(G, -1, 1) - np.roll(G, 1, 1)
NG = unit(np.cross(dK, dS)); ctr = np.repeat(G.mean(1, keepdims=True), NBS, 1)
NG = np.where(((NG * (G - ctr)).sum(-1) < 0)[..., None], -NG, NG)
Fb = []; UVb = []
for i in range(NBP):
    for j in range(NBS):
        i2 = (i + 1) % NBP; j2 = (j + 1) % NBS
        Fb.append((i * NBS + j, i * NBS + j2, i2 * NBS + j2, i2 * NBS + j))
        UVb.append(((i / NBP, j / NBS), (i / NBP, (j + 1) / NBS), ((i + 1) / NBP, (j + 1) / NBS), ((i + 1) / NBP, j / NBS)))
mesh('cook_headband', G.reshape(-1, 3), Fb, UVb, 'band', 'band', normals=NG.reshape(-1, 3))
BACK = G[NBP // 2]; BACK_OUT = float(BACK[:, 1].max()); BACK_Z = float(band_zc(PI))
_up = unit(BACK[np.argmax(BACK[:, 2])] - BACK[np.argmin(BACK[:, 2])]); _out = unit(np.array([0, 1., 0]) - _up * _up[1])
TAB_C = np.array([0, BACK_OUT - .004, BACK_Z - .002])
blob('headband_back_tab', tuple(TAB_C), (.029, .0085, .044), 'band', 'band', 16, 10, p=(.45, .8, .45),
     orient=Matrix([[1., 0, 0], list(_out), list(_up)]).transposed(), vrange=(.05, .45))
LOG['band'] = {'front_top_z': round(float(G[0][:, 2].max()), 4), 'front_bottom_z': round(float(G[0][:, 2].min()), 4),
               'back_z': [round(float(BACK[:, 2].min()), 4), round(float(BACK[:, 2].max()), 4)]}

# ============================================================== BODY AND COSTUME
# --- kimono torso (hidden under the obi below z .30; the top tucks up inside the head)
TORSO = [(.296, .152, .152), (.330, .160, .160), (.370, .163, .166), (.410, .161, .166), (.440, .155, .161), (.468, .145, .152),
         (.492, .132, .138), (.512, .118, .122), (.535, .102, .104), (.565, .090, .092), (.600, .085, .086)]
TOR_Z = np.array([r[0] for r in TORSO]); TOR_AX = np.array([r[1] for r in TORSO]); TOR_AY = np.array([r[2] for r in TORSO])
TOR_N = 2.3
lathe('kimono_torso', TORSO, 'kimono', 'body', 56, TOR_N, cap=(False, True))
def torso_front(x, z):
    ax = np.interp(z, TOR_Z, TOR_AX); ay = np.interp(z, TOR_Z, TOR_AY)
    return -ay * np.clip(1 - np.abs(x / ax) ** TOR_N, 0, 1) ** (1 / TOR_N)
def torso_normal(x, z):
    e = 1e-4
    dx = (torso_front(x + e, z) - torso_front(x - e, z)) / (2 * e); dz = (torso_front(x, z + e) - torso_front(x, z - e)) / (2 * e)
    n = np.array([dx, -1., dz]); return n / np.linalg.norm(n)
NECK_V = .447            # the collar's V point (sheet: z 0.447 m)
# --- the crossed collar: thick rounded bands on the chest. Her left panel over her right. White at the neck (the
# under-collar) down to the V, then the over band carries on as the pink lapel edge to her right hip, under the obi.
def collar_band(name, s, lift, ctrl, half_w=.0185, thick=.0085):
    P = [catmull(ctrl, t) for t in np.linspace(0, 1, 30)]
    verts = []; faces = []; uvs = []; nsec = 10
    for j, p in enumerate(P):
        x, z = p.x, p.y; y = torso_front(x, z); n = torso_normal(x, z)
        if j < len(P) - 1: d = np.array([P[j + 1].x - x, 0, P[j + 1].y - z])
        else: d = np.array([x - P[j - 1].x, 0, z - P[j - 1].y])
        d = d - n * (d @ n); d /= np.linalg.norm(d); side = np.cross(n, d)
        base = np.array([x, y, z]) + n * lift
        for i in range(nsec):
            a = PI * i / (nsec - 1)
            verts.append(tuple(base + side * (half_w * math.cos(a)) + n * (thick * math.sin(a) ** .7)))
    nr = len(P); zs = [p.y for p in P]
    vv = lambda j: zs[j]          # the chart's v = the band point's height (painted white above the V, pink below)
    for j in range(nr - 1):
        for i in range(nsec - 1):
            faces.append((j * nsec + i, j * nsec + i + 1, (j + 1) * nsec + i + 1, (j + 1) * nsec + i))
            uvs.append(((i / (nsec - 1), vv(j)), ((i + 1) / (nsec - 1), vv(j)), ((i + 1) / (nsec - 1), vv(j + 1)), (i / (nsec - 1), vv(j + 1))))
        faces.append((j * nsec + nsec - 1, j * nsec, (j + 1) * nsec, (j + 1) * nsec + nsec - 1))
        uvs.append(((1, vv(j)), (0, vv(j)), (0, vv(j + 1)), (1, vv(j + 1))))
    for j in (0, nr - 1):
        faces.append(tuple(range(j * nsec, j * nsec + nsec))); uvs.append(tuple((.5, vv(j)) for _ in range(nsec)))
    # v in metres (z) -> chart v: z .30 -> 0, z .56 -> 1
    uvs = [tuple((u, (v - .30) / .26) for u, v in f) for f in uvs]
    return mesh(name, verts, faces, uvs, 'collar', 'body')
collar_band('collar_band_under', -1, -.0015, [(-.088, .552), (-.080, .520), (-.058, .488), (-.030, .465), (.000, NECK_V), (.026, .430)])
collar_band('collar_band_over', 1, .0018, [(.088, .552), (.080, .520), (.058, .488), (.030, .465), (.000, NECK_V), (-.034, .422),
                                            (-.066, .394), (-.088, .372), (-.100, .350)])
# --- obi: a thick white sash in two layers (the lower layer 3 mm prouder; a crease between), no back knot (the sheet)
OBI = [(.294, .158, .163), (.298, .171, .176), (.305, .180, .185), (.318, .185, .190), (.336, .186, .191), (.343, .184, .189),
       (.347, .182, .187), (.356, .183, .188), (.372, .182, .187), (.382, .177, .182), (.388, .168, .173), (.392, .156, .161)]
OBI_Z = np.array([r[0] for r in OBI]); OBI_AX = np.array([r[1] for r in OBI]); OBI_AY = np.array([r[2] for r in OBI])
lathe('obi_sash', OBI, 'obi', 'body', 56, 2.4)
def obi_front(x, z):
    ax = np.interp(z, OBI_Z, OBI_AX); ay = np.interp(z, OBI_Z, OBI_AY)
    return -ay * np.clip(1 - np.abs(x / ax) ** 2.4, 0, 1) ** (1 / 2.4)
# --- the A-line skirt with soft folds and a rolled hem (inner face so the edge is never paper thin)
SK = [(.312, .160, .158), (.300, .170, .166), (.275, .182, .174), (.240, .198, .182), (.200, .216, .190), (.160, .233, .198),
      (.125, .249, .205), (.103, .259, .209), (.094, .263, .210), (.088, .261, .209), (.086, .255, .204),
      (.090, .247, .198), (.110, .241, .192), (.150, .231, .184)]
SK_OUT = 9                    # the outer rows (down to the hem)
def skirt_fold(a, t):
    tt = min(1., t / .55); return 1 + (.020 * math.cos(7 * a + .4) + .006 * math.cos(13 * a + 1.1)) * tt ** 1.4
lathe('a_line_skirt', SK, 'skirt', 'body', 70, 2.2, fold=skirt_fold)
SK_Z = np.array([r[0] for r in SK[:SK_OUT]])[::-1]; SK_AX = np.array([r[1] for r in SK[:SK_OUT]])[::-1]; SK_AY = np.array([r[2] for r in SK[:SK_OUT]])[::-1]
def skirt_front(x, z):
    ax = np.interp(z, SK_Z, SK_AX); ay = np.interp(z, SK_Z, SK_AY)
    return -ay * np.clip(1 - np.abs(x / ax) ** 2.2, 0, 1) ** (1 / 2.2)
# --- the apron: a thick cream panel with rounded lower corners, hung from under the obi (top hidden in the obi)
AP_TOP, AP_BOT, AP_HW0, AP_HW1, AP_R, AP_T = .322, .117, .163, .184, .046, .011
def ap_hw(z):
    hw = AP_HW0 + (AP_HW1 - AP_HW0) * (AP_TOP - z) / (AP_TOP - AP_BOT)
    dz = np.clip(AP_R - (z - AP_BOT), 0, AP_R)
    return hw - AP_R + np.sqrt(np.maximum(AP_R * AP_R - dz * dz, 0))
NRA, NCA = 24, 18
zr = np.concatenate([AP_BOT + AP_R * (1 - np.cos(np.linspace(0, PI / 2, 10))), np.linspace(AP_BOT + AP_R, AP_TOP, NRA - 9)[1:]])
NRA = len(zr)
cr = np.sin(np.linspace(-PI / 2, PI / 2, NCA))          # denser columns near the side edges
AXg = cr[None, :] * ap_hw(zr)[:, None]; AZg = np.repeat(zr[:, None], NCA, 1)
AYg = skirt_front(.90 * AXg, AZg) * 1.034 - .0055 - AP_T / 2       # round 2: wraps a little more round the skirt's front
MID = np.stack([AXg, AYg, AZg], -1)                      # [row (z up), col (x)]
dzA = np.gradient(MID, axis=0); dxA = np.gradient(MID, axis=1)
NA = unit(np.cross(dzA, dxA)); NA = np.where((NA[..., 1:2] > 0), -NA, NA)   # forward (-y)
AP_HEM, AP_ROLL = .016, .0060     # round 2: a soft rolled hem along the lower edge (1.6 cm tall, standing 6 mm proud)
def ap_roll(z):
    dz = np.clip((np.asarray(z) - AP_BOT) / AP_HEM, 0, 1); return AP_ROLL * np.sin(PI * dz) ** .75 * (dz < 1)
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
    # boundary loop (row 0 = bottom): bottom left->right, right side up, top right->left, left side down
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
AP_FE = np.repeat(ap_roll(zr)[:, None], NCA, 1) * (.35 + .65 * np.clip((ap_hw(zr)[:, None] - np.abs(AXg)) / .03, 0, 1))
thick_panel('cook_apron', MID, NA, AP_T, 'apron', 'apron', (cr + 1) / 2, (zr - AP_BOT) / (AP_TOP - AP_BOT), front_extra=AP_FE)
APRON_FRONT = MID + NA * (AP_T / 2 + AP_FE[..., None])
# --- arms: kimono sleeves (wide, short, a rolled opening), short arms, mitten paws
ARM_ANG = math.radians(32)
joint_arms = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    grp = 'arm.' + tag
    Sh = np.array([s * .136, .022, .462]); Dv = unit(np.array([s * math.sin(ARM_ANG), -.18, -math.cos(ARM_ANG)]))   # a slight forward swing (the side view)
    Pv = unit(np.array([s * math.cos(ARM_ANG), 0, math.sin(ARM_ANG)])); Pv = unit(Pv - Dv * (Pv @ Dv)); Yv = -s * np.cross(Dv, Pv)
    T0, T1 = -.050, .205
    prof_s = []
    for t in np.linspace(T0, T1, 10):
        k = (t - T0) / (T1 - T0)
        a_ = .036 + (.106 - .036) * math.sin(min(1., k / .40) * PI / 2) ** .75 + .005 * smooth(.4, 1., k)
        b_ = .031 + (.092 - .031) * math.sin(min(1., k / .40) * PI / 2) ** .75
        prof_s.append((t, a_, b_, -.012 * k))
    lip = [(T1 + .005, -.004, -.004), (T1 + .007, -.0095, -.0095), (T1 + .004, -.015, -.015), (T1 - .004, -.017, -.017),
           (T1 - .030, -.017, -.017), (T1 - .060, -.019, -.019)]
    tl, al, bl, sg = prof_s[-1]
    for (t, da, db) in lip: prof_s.append((t, al + da, bl + db, sg))
    N = 24; verts = []; faces = []; uvs = []; M = len(prof_s)
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
    sweep('short_arm.' + tag, [Sh + Dv * t for t in np.linspace(-.02, .245, 8)], lambda s_, L: .041, 'skin', grp, rings=10, sides=16)
    orient = Matrix([list(Pv), list(Yv), list(Dv)]).transposed()
    blob('mitten_paw.' + tag, tuple(Sh + Dv * .272), (.063, .057, .069), 'paw', grp, 20, 11, p=(.92, .92, .92), orient=orient)
    joint_arms[tag] = {'shoulder': [float(v) for v in Sh], 'elbow': [float(v) for v in Sh + Dv * .125],
                       'wrist': [float(v) for v in Sh + Dv * .236], 'hand': [float(v) for v in Sh + Dv * .272]}
    pc = Sh + Dv * .272
    LOG['paw_clear_skirt_' + tag] = round(float(abs(pc[0]) - .063 - np.interp(pc[2], SK_Z, SK_AX) * 1.026), 4)
# --- legs and rounded bean feet
joint_legs = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    grp = 'leg.' + tag
    sweep('stubby_leg.' + tag, [(s * .124, .004, .300), (s * .125, .000, .200), (s * .127, -.004, .060)], lambda s_, L: .056, 'skin', grp, rings=8, sides=16)
    blob('bean_foot.' + tag, (s * .129, -.024, .042), (.074, .094, .042), 'foot', grp, 24, 12, p=(.82, .82, .80))   # 0.15 x 0.19 x 0.078 m
    joint_legs[tag] = {'hip': [s * .124, .004, .300], 'knee': [s * .125, .000, .175], 'ankle': [s * .127, -.004, .070], 'toe': [s * .129, -.108, .035]}
# --- tail: thick, from the skirt's back below the obi, dipping, then rising in an S to a big round club behind her
# (side view: dip z ~0.14 at 0.27 m behind, club centre ~(0.33 m behind, z 0.30); back view: club 0.065 m to her right)
TAIL_CTRL = [(.000, .150, .262), (.003, .228, .200), (.000, .272, .150), (-.016, .326, .146), (-.036, .370, .186),
             (-.054, .386, .244), (-.064, .372, .292)]
tpath = [catmull(TAIL_CTRL, t) for t in np.linspace(0, 1, 80)]
dl = (tpath[-1] - tpath[-2]).normalized()
TAIL_RB = .080
tpath += [tpath[-1] + dl * (TAIL_RB * k / 6) for k in range(1, 7)]
def tail_r(s, L):
    t = s / L; se = L - TAIL_RB
    r = float(np.interp(t, [0, .35, .55, .68, .78, .86, 1.0], [.046, .042, .044, .056, .072, .079, .080]))
    if s > se: r = min(r, TAIL_RB * math.sqrt(max(0., 1 - ((s - se) / TAIL_RB) ** 2)))
    return max(r, .0015)
def tail_rings(L):
    return L * np.concatenate([np.linspace(0, .80, 26), .80 + .20 * np.sin(np.linspace(0, 1, 17)[1:] * PI / 2)])
tail_ob, TAIL_L = sweep('calico_tail', tpath, tail_r, 'tail', 'tail', rings=tail_rings, sides=15, caps=(True, True))
TAIL_JOINTS = [[float(v) for v in catmull(TAIL_CTRL, t)] for t in (0, .25, .5, .75, 1.0)]
# --- the wooden rice paddle (shamoji) at her right hip: bowl up at chest height, handle down past the obi, a white
# cord tying it to the obi's lower edge (sheet: bowl centre x -0.149 m, z 0.384, 0.086 x 0.116 m; handle end z 0.185)
def body_front_min(x, z, r=.018):
    """the most forward body-surface y near (x, z) over the torso, collar, obi, apron, skirt and the right sleeve"""
    m = (np.abs(BODY_V[None, :, 0] - x[:, None]) < r) & (np.abs(BODY_V[None, :, 2] - z[:, None]) < r)
    yy = np.where(m, BODY_V[None, :, 1], 9.); return yy.min(1)
BODY_V = np.concatenate([np.array([list(v.co) for v in ob.data.vertices]) for ob in parts['body'] + parts['apron'] + parts['arm.R']
                         if ob.name.startswith(('kimono_torso', 'collar_band', 'obi_sash', 'a_line_skirt', 'cook_apron', 'kimono_sleeve'))])
PAD_B = np.array([-.150, 0., .386]); PAD_H = np.array([-.196, 0., .188]); PAD_YAW = math.radians(28)
pax = unit(PAD_H - PAD_B); pf = np.array([-math.sin(PAD_YAW), -math.cos(PAD_YAW), 0.]); pf = unit(pf - pax * (pf @ pax)); pt = np.cross(pf, pax)
tt = np.linspace(-.06, 1.0, 60); Pax = PAD_B[None] + (PAD_H - PAD_B)[None] * tt[:, None]
need = np.full(len(tt), 9.)
for wv in np.linspace(-1, 1, 9):
    hwv = np.where(tt < .42, .043, .018)
    Pw = Pax + pt[None] * (wv * hwv)[:, None]
    yb = body_front_min(Pw[:, 0], Pw[:, 2]) - (Pw[:, 1] - Pax[:, 1])
    thick = np.where(tt < .42, .0125, .0115)
    need = np.minimum(need, yb - thick / abs(pf[1]) - .0035)
ydeep = need.min(); y0 = need[0]; y1 = need[-1]
lin = y0 + (y1 - y0) * (tt - tt[0]) / (tt[-1] - tt[0]); shift = float(np.max(lin - need))
PAD_B[1] = y0 + (y1 - y0) * (0 - tt[0]) / (tt[-1] - tt[0]) - shift; PAD_H[1] = y0 + (y1 - y0) * (1 - tt[0]) / (tt[-1] - tt[0]) - shift
pax = unit(PAD_H - PAD_B); pf = unit(pf - pax * (pf @ pax)); pt = np.cross(pf, pax)
PO = Matrix([list(pt), list(pf), list(-pax)]).transposed()       # local x = across, y = facing out, z = up the paddle
blob('rice_paddle_bowl', tuple(PAD_B), (.043, .0125, .058), 'paddle', 'body', 20, 12, p=(.95, .85, .95), orient=PO, vrange=(0., .5))
hlen = float(np.linalg.norm(PAD_H - PAD_B)); hc = PAD_B + pax * (.040 + (hlen - .040) / 2)
blob('rice_paddle_handle', tuple(hc), (.0175, .0115, (hlen - .040) / 2 + .010), 'paddle', 'body', 14, 12, p=(.75, .80, .85), orient=PO, vrange=(.5, 1.))
# the cord: a small white loop round the handle at the obi's lower edge
tc = (.300 - PAD_B[2]) / (PAD_H[2] - PAD_B[2]); CC = PAD_B + (PAD_H - PAD_B) * tc
ang = np.linspace(0, 2 * PI, 25)
loop_pts = [CC + pt * (.025 * math.cos(a)) + pf * (.018 * math.sin(a)) for a in ang]
sweep('paddle_cord', loop_pts, lambda s_, L: .0058, 'band', 'body', rings=18, sides=6, caps=(False, False), vrange=(.55, .95))
LOG['paddle'] = {'bowl_c': [round(float(v), 4) for v in PAD_B], 'handle_end': [round(float(v), 4) for v in PAD_H], 'yaw_deg': 28}

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
# the calico patch (W units, front projection, her LEFT = +x), traced on the sheet's HEAD FRONT (measure/m4_patch.py):
# the inner border down the bridge (x 0.037-0.07), round the eye's lower rim (the eye sits on the border), then down
# diagonally to the jaw at x 0.43 W, z 0.19; over the crown it runs back past the ear (the side and back views)
_eps = np.radians(np.linspace(196, 330, 15)); _ex, _ez = eye_unit(_eps)
_EYE_LOW = [(.218 + .099 * 1.03 * a, .324 + .088 * 1.03 * b) for a, b in zip(_ex, _ez)]
PATCH_FACE = ([(.077, 1.10), (.077, .72), (.070, .600), (.066, .575), (.058, .556), (.051, .539), (.047, .522), (.043, .506),
               (.040, .489), (.038, .472), (.037, .455), (.037, .438), (.039, .421), (.041, .404), (.044, .388), (.049, .371),
               (.059, .354), (.069, .337), (.081, .320), (.097, .306), (.112, .296)] + _EYE_LOW +
              [(.334, .262), (.352, .246), (.369, .228), (.389, .206), (.412, .194), (.434, .189), (.456, .195), (.479, .222),
               (.505, .262), (.80, .30), (.80, 1.10)])
def patch_alpha(q, aa=.0042):
    x, y, z = q[:, 0], q[:, 1], q[:, 2]
    ylim = .02 + .22 * smooth(.58, .82, z)
    dF = smax(poly_sd(x, z, PATCH_FACE), (y - ylim), .06)
    x_in = .080 + .20 * smooth(-.02, .30, y)            # x 0.08 over the crown's front (the sheet), swinging out to the ear behind
    dF = np.maximum(dF, (x_in - x) - (1 - smooth(.62, .71, z)) * 2.)
    return 1 - smooth(-aa, aa, dF)
def band_q(P):
    """signed distance (m, along z) from the band's centre line; |band_q| < BAND_H/2 is under the band"""
    phi = np.arctan2(P[:, 0], -(P[:, 1] - HY)); return P[:, 2] - band_zc(phi)
def paint_head(d): return paint_head_P(radial_hit(d))
def paint_head_P(P):
    n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); zr = q[:, 2]
    fr = smooth(HY + .03, HY - .07, y)
    C = np.broadcast_to(rgb('fur'), (len(x), 3)).copy()
    pa = patch_alpha(q)
    C = mix(C, rgb('orange'), pa)
    shade = mix(rgb('furshade'), rgb('orangeshade'), pa)
    # soft painted shade: under the jaw toward the neck, the jaw's sides (value only, no hue shift on the crown)
    under = smooth(-.25, -.85, n[:, 2]) * (1 - smooth(.10, .26, zr))
    C = mix(C, shade, .80 * under)
    jaw = smooth(.40, .85, np.abs(n[:, 0])) * (1 - smooth(.16, .46, zr))
    C = mix(C, shade, .55 * jaw)
    sides = smooth(.35, .95, np.abs(n[:, 0]) + .6 * clamp(n[:, 1])) * (1 - smooth(.55, .85, n[:, 2]))
    C = mix(C, shade, .32 * sides)
    C = mix(C, rgb('#ffe8dc'), .20 * fr * (1 - smooth(.10, .30, zr)) * (1 - pa))
    # contact shade at the band's edges and the ear bases
    bq = np.abs(band_q(P)); C = mix(C, shade, .35 * smooth(BAND_H / 2 + .022, BAND_H / 2 + .002, bq))
    for s in (-1, 1):
        ei = ear_info[s]; dd = np.linalg.norm(P - ei['S'], axis=1)
        C = mix(C, shade, .25 * np.exp(-(dd / (.11 * W)) ** 2))
    # nose: a soft rounded inverted triangle with one small soft highlight on its top
    nx = x / W; nzz = (z - CHIN) / W
    tri = poly_sd(nx, nzz, [(-.0310, .2735), (.0310, .2735), (0, .2420)]) - .0090
    fwd = smooth(-.85, -.55, n[:, 2])                    # no painted nose on the button's downward-facing underside
    C = mix(C, rgb('nose'), (1 - smooth(-.0022, .0022, tri)) * fr * (nzz > .20) * fwd)
    hl = np.exp(-(((nx + .007) / .0090) ** 2 + ((nzz - .2755) / .0050) ** 2))
    C = mix(C, rgb('#dc9ea4'), .45 * hl * fr * (1 - smooth(-.002, .002, tri)))
    # blush ovals (soft)
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .80 * (1 - smooth(.45, 1.08, r)) * fr)
    # brows: soft short arcs tapering to rounded points
    t = np.linspace(-1, 1, 15)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * .044 * W * t, BROW_Z + .016 * W * (1 - t * t) - .009 * W], -1)
        half = .0118 * W * np.maximum(0, 1 - t * t) ** .65 + .0022 * W
        box = fr * ((np.abs(x - s * BROW_X) < .09 * W) & (np.abs(z - BROW_Z) < .05 * W))
        a = np.zeros(len(x)); ib = box > 0
        a[ib] = stroke(x[ib], z[ib], Pb, half, .0030 * W)
        C = mix(C, rgb('brow'), .95 * a * fr)
    # mouth: the sheet's cat "w" (two arcs from the centre to the corners, dipping 0.027 W) and the line up to the nose
    tl = np.linspace(0, 1, 21)
    ib = (fr > 0) & (np.abs(x) < .12 * W) & (np.abs(z - (CHIN + .205 * W)) < .06 * W)
    a = np.zeros(len(x))
    for s in (-1, 1):
        ax_ = s * MHW * tl; az_ = CHIN + (.208 - .003 * tl - .108 * tl * (1 - tl)) * W
        Pm = np.stack([ax_, az_], -1); half = (.0056 - .0010 * tl ** 2) * W
        a[ib] = np.maximum(a[ib], stroke(x[ib], z[ib], Pm, half, .0026 * W))
    Pp = np.array([[0, CHIN + .240 * W], [0, CHIN + .208 * W]])
    a2 = np.zeros(len(x)); a2[ib] = stroke(x[ib], z[ib], Pp, np.array([.0048 * W, .0052 * W]), .0026 * W)
    C = mix(C, rgb('mouth'), .95 * np.maximum(a, a2))
    # under the lash ribbon: a faint lid shade only (no painted lash line: the ribbon is its own object)
    for s in (-1, 1):
        sr, psi, X, Z = eye_s(s, x, z)
        lid = (1 - smooth(1.02, 1.30, sr)) * smooth(-.2, .5, np.sin(psi)) * (sr > .95)
        C = mix(C, shade, 0. * lid * fr)          # round 2: off (the shut lid showed it as an outline; the ribbon covers it at rest)
    return C

def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .24; iz = .0; irx = .707; irz = .97
    C = mix(rgb('#fffaf4'), rgb('#e6dfe2'), .45 * smooth(.35, .98, Z))
    C = mix(C, rgb('#ede7ea'), .25 * smooth(.3, 1., s * X))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#6fb878'), rgb('#4f9a5e'), smooth(-.85, -.30, ez))      # #5AA86A family: light at the bottom, deep forest at the top
    I = mix(I, rgb('#347548'), smooth(-.30, .25, ez))
    I = mix(I, rgb('#1c4228'), smooth(.20, .80, ez))
    I = mix(I, rgb('#24452e'), smooth(.80, 1.0, r) * .65)
    I = I * (1 - .025 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 26 + r * 9)))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    px_ = ix - s * .03; pz = .02; R = np.sqrt(((X - px_) / (.60 * irx)) ** 2 + ((Z - pz) / (.655 * irz)) ** 2)
    C = mix(C, rgb('#16221a'), 1 - smooth(.985, 1.015, R))
    big = np.sqrt(((X - (-s * .47)) / .175) ** 2 + ((Z - .49) / .19) ** 2)
    small = np.sqrt(((X - (-s * .06)) / .090) ** 2 + ((Z + .32) / .097) ** 2)
    C = mix(C, rgb('#fffbf6'), np.maximum(1 - smooth(.90, 1.06, big), 1 - smooth(.86, 1.10, small)))
    C = mix(C, rgb('lash'), .85 * smooth(.92, 1.0, sr) * smooth(-.30, .30, Z))      # lid contact under the lash ribbon
    return C

def paint_ear(U, V, s):
    a = U * 2 * PI - PI / 2; ca = np.cos(a); sa = np.sin(a)
    tb = EAR_TABLE[s]; rho = np.interp(V, tb['V'], tb['rho']); hz = np.interp(V, tb['V'], tb['hz'])
    inner = rho - EAR['rim']
    dd = np.abs(ca) * rho - inner
    m = (1 - smooth(-.0022, .0022, dd)) * (sa > 0) * smooth(.035, .075, hz) * (1 - smooth(.84, .90, hz)) * (inner > .004)
    C = mix(rgb('orange'), rgb('orangeshade'), .35 * (1 - smooth(.05, .30, hz)))
    deep = (1 - np.clip(np.abs(ca) * rho / np.maximum(inner, 1e-4), 0, 1)) * (1 - smooth(.25, .75, hz))
    P_ = mix(rgb('inner'), rgb('innerdeep'), .50 * deep)
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
        ax = np.interp(z, TOR_Z, TOR_AX); x = ax * spow(np.sin(a), 2 / TOR_N); back = np.cos(a) > 0; front = ~back
        C = mix(rgb('kimono'), rgb('kimonolight'), .50 * smooth(.42, .50, z))
        C = mix(C, rgb('kimonoshade'), .35 * (1 - smooth(.37, .42, z)))
        # front: fur inside the collar's V (the bands cover its edges)
        vneck = front & (np.abs(x) < .95 * (z - NECK_V) + .004) & (z > NECK_V - .004)
        C = mix(C, rgb('fur'), vneck * 1.)
        # back: the neckline scoops to z 0.447 at the centre; above it the nape fur with the orange patch
        zN = .447 + .085 * (np.abs(x) / .16) ** 2.2
        nape = back * smooth(zN - .002, zN + .002, z)
        rim = back * smooth(zN - .012, zN - .002, z) * (1 - nape)
        C = mix(C, rgb('kimonodeep'), .45 * rim)
        pat = 1 - smooth(.92, 1.08, np.sqrt((x / .100) ** 2 + ((z - .505) / .058) ** 2))
        F_ = mix(rgb('fur'), rgb('orange'), pat)
        F_ = mix(F_, mix(rgb('furshade'), rgb('orangeshade'), pat), .35 * (1 - smooth(zN + .002, zN + .030, z)))
        return mix(C, F_, nape)
    if chart == 'sleeve':
        C = mix(rgb('kimono'), rgb('kimonolight'), .45 * smooth(.15, .60, V) * smooth(-.2, .8, np.sin(U * 2 * PI)))
        C = mix(C, rgb('kimonoshade'), .30 * smooth(.2, .9, -np.sin(U * 2 * PI)))
        C = mix(C, rgb('kimonodeep'), smooth(.74, .80, V))                  # the inside of the sleeve
        return C
    if chart == 'collar':
        z = .30 + V * .26; across = smooth(.0, .45, np.abs(np.sin(U * PI)))
        Wt = mix(rgb('whiteshade'), rgb('white'), across * .9 + .1)
        Pk = mix(rgb('kimonoshade'), rgb('kimonolight'), across * .9 + .1)
        return mix(Pk, Wt, smooth(NECK_V - .006, NECK_V + .004, z))
    if chart == 'obi':
        z = np.interp(V, np.linspace(0, 1, len(OBI_Z)), OBI_Z)
        C = mix(rgb('whiteshade'), rgb('white'), smooth(.294, .312, z) * (1 - .45 * smooth(.384, .392, z)))
        C = mix(C, rgb('#d9cec6'), .70 * np.exp(-((z - .3445) / .0028) ** 2))     # the crease between the layers
        C = mix(C, rgb('#efe6de'), .35 * smooth(.346, .356, z) * (1 - smooth(.36, .372, z)))
        return C
    if chart == 'band':
        a = V * 2 * PI                       # round the section: cos > 0 = the outer face, sin = up / down
        C = mix(rgb('whiteshade'), rgb('white'), .85 * smooth(-.4, .6, np.cos(a)) * (1 - .25 * smooth(.3, 1., -np.sin(a))) + .1)
        return C
    if chart == 'apron':
        C = np.broadcast_to(rgb('apron'), U.shape + (3,)).copy()
        fr = V >= .29
        uu = (U - .04) / .92; vv = (V - .30) / .70
        # a soft stitched hem line 0.012 m inside the edge (sides and bottom), and soft shade toward the bottom
        side_e = np.minimum(uu, 1 - uu) * (AP_HW0 + AP_HW1); bot_e = vv * (AP_TOP - AP_BOT)
        line = np.maximum(np.exp(-((side_e - .013) / .0022) ** 2) * (bot_e > AP_HEM + .004), np.exp(-((bot_e - AP_HEM - .002) / .0022) ** 2) * (side_e > .010)) * (vv < .93)
        C = mix(C, rgb('apronshade'), .45 * np.exp(-((bot_e - AP_HEM - .0005) / .0030) ** 2) * fr)      # the crease above the rolled hem
        C = mix(C, rgb('apronline'), .55 * line * fr)
        C = mix(C, rgb('apronshade'), .30 * (1 - smooth(.0, .35, vv)) * fr + .45 * (~fr))
        return C
    if chart == 'skirt':
        a = U * 2 * PI; fold = np.cos(7 * a + .4)
        C = mix(rgb('skirt'), rgb('skirtlight'), .40 * clamp(fold) * smooth(.15, .60, V))
        C = mix(C, rgb('skirtshade'), .40 * clamp(-fold) * smooth(.15, .60, V))
        C = mix(C, rgb('skirtshade'), .45 * (1 - smooth(.0, .12, V)))                  # under the obi
        C = mix(C, rgb('skirtshade'), .50 * smooth(.60, .66, V))                       # hem roll underside / inside
        C = mix(C, rgb('skirtdeep'), .55 * smooth(.78, .95, V))
        return C
    if chart in ('skin', 'paw', 'foot', 'tail'):
        C = np.broadcast_to(rgb('fur'), U.shape + (3,)).copy()
        if chart == 'skin':     # arms and legs: warm shade on their backs (+Y is u = .75 on these tubes) and at the roots
            back = np.exp(-((U - .75) / .17) ** 2)
            C = mix(C, rgb('furshade'), np.clip(.60 * back + .35 * (1 - smooth(.0, .35, V)), 0, 1))
        if chart == 'paw':
            back = np.exp(-(np.minimum(U, 1 - U) / .16) ** 2)
            C = mix(C, rgb('furshade'), .50 * back)
            for du in (-.045, .045):
                C = mix(C, rgb('line'), .85 * np.exp(-((U - (.5 + du)) / .010) ** 2) * smooth(.66, .76, V) * (1 - smooth(.93, .985, V)))
            C = mix(rgb('furshade'), C, .55 + .45 * smooth(.0, .30, V))
        if chart == 'foot':     # two toe lines over the front of the foot
            for du in (-.040, .040):
                C = mix(C, rgb('line'), .90 * np.exp(-((U - (.5 + du)) / .0085) ** 2) * smooth(.30, .40, V) * (1 - smooth(.66, .78, V)))
            C = mix(C, rgb('furshade'), .60 * (1 - smooth(.02, .10, V)))          # the sole's underside only
        if chart == 'tail':     # the sheet: a cream root and dip, the rising part and the club orange (soft wavy border)
            C = mix(C, rgb('furshade'), .35 * (1 - smooth(.0, .25, V)))
            s_ = V * TAIL_L; sb = TAIL_L * .56 + .022 * np.cos(U * 2 * PI - .6)
            C = mix(C, rgb('orange'), smooth(sb - .004, sb + .004, s_))
            C = mix(C, rgb('orangelight'), .25 * smooth(sb + .02, TAIL_L, s_) * smooth(-.3, .8, np.cos(U * 2 * PI)))
        return C
    if chart == 'paddle':
        across = smooth(.0, .5, np.abs(np.sin(U * PI)))
        C = mix(rgb('wooddark'), rgb('wood'), across)
        C = mix(C, rgb('woodlight'), .35 * smooth(.5, .9, np.abs(np.sin(U * PI))) * smooth(.4, .8, V))
        grain = .03 * np.sin(V * 90 + np.sin(U * 13) * 2.0)
        return clamp(C * (1 + grain[..., None]))
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
atlas_path = os.path.join(ROOT, 'tk-kome-toy_rig_atlas.png' if RIG else 'tk-kome-toy_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Kome_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Kome_toy_atlas'); MAT.use_nodes = True
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
NAMES = {'head': 'Kome_head', 'eye.L': 'Kome_eye_L', 'eye.R': 'Kome_eye_R', 'lash.L': 'Kome_lash_L', 'lash.R': 'Kome_lash_R',
         'ear.L': 'Kome_ear_L', 'ear.R': 'Kome_ear_R', 'band': 'Kome_headband', 'body': 'Kome_body', 'apron': 'Kome_apron',
         'arm.L': 'Kome_arm_L', 'arm.R': 'Kome_arm_R', 'leg.L': 'Kome_leg_L', 'leg.R': 'Kome_leg_R', 'tail': 'Kome_tail'}
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
           'ear.L': tuple(ear_info[1]['S']), 'ear.R': tuple(ear_info[-1]['S']), 'band': tuple(O), 'apron': (0, -.20, AP_TOP),
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
          'root': [0, 0, 0], 'hips': [0, .004, .300], 'spine': [0, .006, .360], 'chest': [0, .010, .430], 'neck': [0, .015, .500],
          'head_base': [0, .040, CHIN + .02], 'head': [float(v) for v in O],
          'jaw_pivot': [0, float(HY - .16 * W), float(CHIN + .15 * W)],
          'mouth_corners': {'L': [float(MHW + .006 * W), float(front_hit(MHW, MC)[0]), float(CHIN + .206 * W)],
                            'R': [float(-MHW - .006 * W), float(front_hit(-MHW, MC)[0]), float(CHIN + .206 * W)]},
          'eyes': eye_centers, 'brows': {'L': [BROW_X, float(front_hit(BROW_X, BROW_Z)[0]), BROW_Z], 'R': [-BROW_X, float(front_hit(-BROW_X, BROW_Z)[0]), BROW_Z]},
          'lashes': lash_info, 'ears': ears_j, 'arms': joint_arms, 'legs': joint_legs, 'tail': TAIL_JOINTS,
          'headband': {'front_z': BAND_ZF, 'back_z': BAND_ZB, 'tab': [float(v) for v in TAB_C]},
          'apron': {'top': [0, float(APRON_FRONT[-1, NCA // 2, 1]), AP_TOP], 'hem': [0, float(APRON_FRONT[0, NCA // 2, 1]), AP_BOT]},
          'paddle': {'bowl': [float(v) for v in PAD_B], 'handle_end': [float(v) for v in PAD_H]},
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth implicit ball (fitted superquadric + lower-face fullness + nose button), radially projected, analytic normals.',
                    'Eyelid holes ringed by %d concentric loops each, rim rolled in behind separate lens eyeballs; 3 loops round the mouth, 4 round the nose.' % len(EYE_SCALES),
                    'Separate pieces: eyes, lash ribbons (origin at the eye centre, for the upper lids), ears, headband (rigid head follower), apron (hanging cloth, bend rows every ~1 cm), tail.',
                    'The rice paddle and its cord are in Kome_body (a rigid hip follower).']}
if not RIG:
    with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if RIG: raise_done = True
else:
  bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'tk-kome-toy.blend'))
  bpy.ops.object.select_all(action='DESELECT')
  for ob in objects: ob.select_set(True)
  bpy.context.view_layer.objects.active = objects[0]
  bpy.ops.export_scene.gltf(filepath=MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('KOME_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': MODEL}), flush=True)
