"""Saba / Fishmonger (Toybox zone villager, VL-2, Shiokaze Port), Opus build, phase 1 (the model). Blender 4.3, no addons.
Deterministic.

    blender --background --factory-startup --python build_sk-saba-toy.py

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/sk-saba-toy.glb.

Technique (the Mochi / Kome toy-line machinery, tk-kome-toy's build as the base):
- The head is ONE smooth implicit ball: a superquadric fitted to the sheet's front and side outlines (scratch/headfit.py),
  with a lower-face fullness, a gentle muzzle bump and a nose button smooth-unioned in. Its skin is the field's zero surface
  reached by radial projection (CDT in a stereographic domain with edge loops round both eyelid holes, the nose and the
  mouth), every vertex on the surface with the field's analytic normal: the face stays convex, no sockets. The tabby
  patch, the muzzle, brows, nose, mouth and blush are painted on the ball from 3D positions into a 2048 atlas.
- The eyes are separate flush lens globes in real lid holes. The upper lash line is its OWN object per eye (a thick
  tapered ribbon over the upper rim and down the outer side, with one wing flick), not paint.
- The ears are thick three-arc convex cones (parametric, exact normals) with a big pink dish, rising from behind the
  bandana; the bandana is a thick soft ring swept round the head in a plane tilted back, with a knotted bow at the back.
- The costume: a cream shirt (lathe) with puffy rolled short sleeves, navy trousers with baggy legs and rolled cuffs, a
  blue fishmonger's apron (one thick panel: a bib on the chest, wrapping round the hips below the waist tie) with a big
  patch pocket, a waist tie round the back and two straps over the shoulders straight down the back; mitten paws, bean
  feet, and a thick striped tabby tail curling up behind her left side.
"""
import bpy, bmesh, math, json, os, struct, zlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt

ROOT = os.path.dirname(os.path.abspath(__file__))
RIG = bool(globals().get('RIG_MODE'))      # reserved for the phase-2 rig script: no approved file is written in rig mode
MODEL = 'D:/projects/chewy-life-3d/public/models/sk-saba-toy.glb'
os.makedirs(os.path.join(ROOT, 'preview'), exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
W = .616; CHIN = .517; HY = .000       # face width at the cheeks, chin height, head centre y (metres; measure.md)
SW = W / .44                           # Rosie's metric detail sizes (0.44 m head) scaled to this head
LOG = {}

# the sheet's swatches; the dark cloth (trousers, bandana) painted a touch lighter (the game's grade crushes navies)
PAL = {'fur': '#8e8c9c', 'furshade': '#7c7a8a', 'furlight': '#9a98a8',
       'patch': '#5e5c6c', 'patchshade': '#535161', 'muzzle': '#e0dde5', 'muzzleshade': '#c9c5cf',
       'earout': '#6c6a7a', 'earshade': '#5e5c6c', 'inner': '#ffb0c0', 'innerdeep': '#f498ac',
       'nose': '#b96f79', 'blush': '#f5a0ad', 'stripe': '#5c5a6a',
       'shirt': '#f4f0e8', 'shirtshade': '#e2dacd', 'shirtdeep': '#cfc5b6',
       'apron': '#4a8ab0', 'apronlight': '#5898bc', 'apronshade': '#3e7aa0', 'aprondeep': '#356c90', 'apronline': '#3a7398',
       'navy': '#38688c', 'navylight': '#427498', 'navyshade': '#2f5c7e', 'navydeep': '#284f6e',
       'lash': '#1e1b24', 'brow': '#3c3846', 'mouth': '#2a2430', 'line': '#6e6c7c'}
# 2048 atlas charts (x, y, w, h) in pixels, y up (Blender UV convention).
CHARTS = {'head': (0, 768, 1280, 1280), 'headback': (1280, 1280, 768, 768),
          'eye.L': (1280, 896, 384, 384), 'eye.R': (1664, 896, 384, 384),
          'ear.L': (1280, 640, 384, 256), 'ear.R': (1664, 640, 384, 256),
          'shirt': (0, 384, 512, 384), 'sleeve': (512, 384, 384, 384), 'trousers': (896, 384, 384, 384),
          'foot': (1280, 384, 384, 256), 'tail': (1664, 384, 384, 256),
          'apron': (0, 0, 512, 384), 'skin': (512, 0, 384, 256), 'strap': (512, 256, 384, 128),
          'paw': (896, 0, 256, 256), 'nose': (1152, 0, 256, 256), 'band': (1408, 0, 256, 192), 'lash': (1408, 192, 256, 128),
          'belt': (1664, 0, 384, 192), 'pocket': (1152, 256, 256, 128)}
if RIG:   # phase 2: room for the lid charts, the mouth cavity and the tongue (free atlas space)
    CHARTS.update({'lidU.L': (1664, 192, 192, 96), 'lidU.R': (1856, 192, 192, 96), 'lidD.L': (1664, 288, 96, 96), 'lidD.R': (1760, 288, 96, 96),
                   'cavity': (1856, 288, 96, 96), 'tongue': (1952, 288, 96, 96), 'lash': (1408, 192, 256, 128)})

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
# fitted to the sheet (scratch/headfit.py): widest 0.243 W above the chin, crown 0.73 W, depth 0.84 W at the mouth zone,
# a fuller lower face (the side view's muzzle stands ~0.06 W ahead of the eye zone)
LOWFACE = dict(m=.185, z=.150, w=.105)
HEAD = dict(A=.4904, BF=.3544, BB=.4230, ZC=.243, HT=.487, HB=.243, nA_t=2.370, nA_b=2.786, nB_t=2.000, nB_b=3.118, n=2.0, nBb_t=2.655, nBb_b=2.646, egg=.345)
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
# the muzzle: a gentle soft bump on the lower face (the sheet's side view: the mouth zone 0.06 W ahead of the eyes; the fit
# alone reaches 0.045), its middle under the nose
_ym = float(front_local(0, .175, skull_local)[0])
MUZ = [[0, _ym + .046 - .012, .185], [.215, .046, .120]]; K_M = .055
def face_local(q): return skull_local(q)        # (no separate muzzle bump: it made a ledge; LOWFACE carries the depth)
NZ_L = .236                                          # the painted nose's centre (sheet: top 0.256, tip 0.209 W)
_yn = float(front_local(0, NZ_L, face_local)[0])
NOSE = [[0, _yn + .022 - .030, .232], [.047, .022, .029]]; K_N = .014     # ~0.02 W proud of the muzzle (the side view)
def head_local(q): return smin(face_local(q), ell(q, *NOSE), K_N)
_zt = np.linspace(.18, .29, 111); _ft = front_local(np.zeros_like(_zt), _zt, head_local)
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
EX = .193 * W; EZ = CHIN + .311 * W; EHW = .0965 * W; EHH = .093 * W; EN = 2.1
def eye_unit(psi):
    c = np.cos(psi); s = np.sin(psi)
    return spow(c, 2 / EN), spow(s, 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
def lid_edge_Z(X): return 1.25 + 0 * np.asarray(X, float)      # open eyes: no rest lid over the lens (the rig adds the lids)
NZ = CHIN + NZ_L * W; MC = CHIN + .172 * W; MHW = .076 * W
BROW_Z = CHIN + .508 * W; BROW_X = .198 * W
BLUSH = (.310 * W, CHIN + .184 * W, .049 * W, .037 * W)

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
NOSE_LOOPS = [(.006, 12), (.011, 18), (.017, 26), (.023, 34)]
_nc = np.array(pts[tags['nose_c'][0]])
for k, (rr, n) in enumerate(NOSE_LOOPS):
    a = np.linspace(0, 2 * PI, n, endpoint=False) + .3 * k
    _ref = to_dom(surf_dir(rr * W * np.cos(a), NZ + rr * W * np.sin(a)))
    rd = float(np.median(np.linalg.norm(_ref - _nc, axis=1)))
    if k: rd = max(rd, _rd_prev * 1.3)
    _rd_prev = rd
    add_loop(_nc + rd * np.stack([np.cos(a), np.sin(a)], -1), 'nose_%d' % k)
MOUTH_LOOPS = [(.090, .013, .026), (.101, .016, .031), (.112, .019, .036)]
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
keep &= ~(frontp & ((Pf[:, 0] / W) ** 2 + ((Pf[:, 2] - NZ) / W) ** 2 < .032 ** 2))
mz = (Pf[:, 2] - MC) / W
keep &= ~(frontp & ((Pf[:, 0] / (.122 * W)) ** 2 + (mz / np.where(mz > 0, .025, .044)) ** 2 < 1))
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
skin = mesh('saba_head_skin', verts, faces, face_uvs, 'head', 'head', raw_uv=True, normals=vnorm)
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

# ============================================================== LASH RIBBONS: the upper lash line + one wing flick
# The sheet (measure.md): ~0.025 W thick over the top, running down the outer side to ~0.53 of the half-height below
# the eye's middle, one wing flick at the outer top (tip at eye units (1.36, 0.70)). A flattened tapered tube
# lying on the skin, its inner edge just inside the lid hole (over the lens edge), <= 0.009 W proud. Separate objects
# (origin at the eye centre) so the rig can hang them on the upper lids. Nothing of the lash is painted on the skin.
LASH_PSI = np.radians(np.linspace(166, -52, 38))         # inner top -> over the top -> down the outer side
def lash_th(psi):      # thickness in eye-radius units (the opening's superellipse radius)
    d = np.degrees(psi)
    th = .34 + .07 * np.exp(-((d - 35) / 30) ** 2)
    th = th * (1 - .58 * smooth(22, -38, d))     # round 2: a touch more taper down the outer side
    return th * smooth(168, 132, d) * smooth(-55, -10, d) + .02
LASH_WINGS = [((30, .95), (1.38, .72))]    # (root psi deg, root k), tip (X outer, Z) eye units
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
    th = lash_th(LASH_PSI); k_in = .950
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

BAND_ZF, BAND_ZB, BAND_H, BAND_T = .902, .778, .084, .020      # (the bandana, built after the ears; the ears tuck under it)
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
# Kome's ear (smooth three-arc parametric surface with exact normals), placed on Saba's sheet: tips x +-0.29 W,
# 0.13 W over the crown (z 0.860 W), a broad base on the crown's shoulder, a big pink dish (0.19 x 0.20 W on the sheet)
EAR = dict(r1=.190 * W, r2=.024 * W, sy=.84, flat=.88, hollow=.013 * W, rim=.046 * W, sink=.035 * W, tilt=12., yaw=12., lean=-4., bulge=.018 * W)
EAR_TIP_LOCAL = np.array([.290, .070, .860])          # W units: x, y behind the head centre, z above the chin
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
EAR_RS = .34 * W          # a rounder convex side (the sheet's ears read as soft curves, no straight run into the base)
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
    nrow, seg = 22, 32
    uu = np.linspace(0, 1, nrow + 1)
    tv = np.interp(uu, [0, .16, .84, 1.0], [0, arc2 / tot, (arc2 + line) / tot, 1.0])
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

# ============================================================== THE BANDANA: a thick soft ring tilted back + a knotted bow
# sheet: the centre line at z 0.918 m in front, 0.778 m at the back (the side and back views; ~16 deg), 0.076 m tall,
# ~0.018 m proud; the ears rise from behind it; a bow at the back: a small knot with two teardrop lobes hanging down-out
def band_field(p): return head_sdf(p)            # round 2: the band hugs the head alone; the ears rise from behind it
NBP = 56; NBS = 12
phis = np.linspace(0, 2 * PI, NBP, endpoint=False)
sa_b = np.linspace(0, 2 * PI, NBS, endpoint=False)
# phase-2 director's note: the front read like a visor brim; the front is ~20 % thinner and its lower front edge rounded
# (tied cloth wrapping the head). frontness 1 at the front .. 0 at the back.
FRB = ((1 + np.cos(phis)) / 2) ** 1.5
T_PHI = BAND_T * (1 - .20 * FRB)
def band_sec(j):
    """the section point j at every phi: (dz above the band's centre line, offset along the skin normal)"""
    a = sa_b[j]; sn, cs = math.sin(a), math.cos(a)
    p_v = .38 + (.42 * FRB if sn < 0 else 0.)                 # the lower half rounder toward the front
    q_n = .45 + (.60 * FRB if sn < 0 else 0.)
    db = BAND_H / 2 * spow(np.full_like(phis, sn), p_v)
    dn = (T_PHI + .004) / 2 * spow(np.full_like(phis, cs), q_n) + (T_PHI - .004) / 2
    return db, dn
G = np.zeros((NBP, NBS, 3))
Dh = np.stack([np.sin(phis), -np.cos(phis), np.zeros_like(phis)], -1)
for j in range(NBS):
    db_j, dn_j = band_sec(j)
    Cz = np.stack([np.zeros_like(phis), np.full_like(phis, HY), band_zc(phis) + db_j], -1)
    P = ray_hit(Cz, Dh, band_field, 0., .6); N = grad_n(P, band_field)
    G[:, j] = P + N * dn_j[:, None]
dK = np.roll(G, -1, 0) - np.roll(G, 1, 0); dS = np.roll(G, -1, 1) - np.roll(G, 1, 1)
NG = unit(np.cross(dK, dS)); ctr = np.repeat(G.mean(1, keepdims=True), NBS, 1)
NG = np.where(((NG * (G - ctr)).sum(-1) < 0)[..., None], -NG, NG)
Fb = []; UVb = []
for i in range(NBP):
    for j in range(NBS):
        i2 = (i + 1) % NBP; j2 = (j + 1) % NBS
        Fb.append((i * NBS + j, i * NBS + j2, i2 * NBS + j2, i2 * NBS + j))
        UVb.append(((i / NBP, j / NBS), (i / NBP, (j + 1) / NBS), ((i + 1) / NBP, (j + 1) / NBS), ((i + 1) / NBP, j / NBS)))
mesh('bandana_ring', G.reshape(-1, 3), Fb, UVb, 'band', 'band', normals=NG.reshape(-1, 3))
BACK = G[NBP // 2]; BACK_OUT = float(BACK[:, 1].max()); BACK_Z = float(band_zc(PI))
_up = unit(BACK[np.argmax(BACK[:, 2])] - BACK[np.argmin(BACK[:, 2])]); _out = unit(np.array([0, 1., 0]) - _up * _up[1])
# (no back tab: Kome's flat tab was left in round 1 under the knot; the sheet shows the knot and bow only)
LOG['band'] = {'front_top_z': round(float(G[0][:, 2].max()), 4), 'front_bottom_z': round(float(G[0][:, 2].min()), 4),
               'back_z': [round(float(BACK[:, 2].min()), 4), round(float(BACK[:, 2].max()), 4)]}
def surf_frame(x, z, side=1, f=head_sdf):
    """a point on the head's back (side=+1) or front (side=-1) at (x, z), its outward normal"""
    o = np.array([[x, HY, z]]); d = np.array([[0, float(side), 0]])
    P = ray_hit(o, d, f, 0., .6); return P[0], grad_n(P, f)[0]
def surf_blob(name, x, z, radii, roll, lift, chart, group, vrange=(0., 1.), p=(.8, .8, .8), seg=16, rows=10):
    """a blob lying on the back of the head: local x across, y out along the skin normal, z up the skin, rolled by roll deg"""
    P, n = surf_frame(x, z)
    up = np.array([0, 0, 1.]); up = unit(up - n * (up @ n)); ac = np.cross(n, up)          # ac: across (to her left, +x)
    r = math.radians(roll); up2 = up * math.cos(r) + ac * math.sin(r); ac2 = np.cross(up2, n)
    c = P + n * (radii[1] * .55 + lift)
    blob(name, tuple(c), radii, chart, group, seg, rows, p=p, orient=Matrix([list(-ac2), list(n), list(up2)]).transposed(), vrange=vrange)
    return c
BACK_BAND_OUT = float(BACK[:, 1].max())
KNOT_Z = BACK_Z - .004
KNOT_C = surf_blob('bandana_knot', 0., KNOT_Z, (.020, .015, .028), 0., BAND_T - .003, 'band', 'band', vrange=(.55, .95), p=(.95, .9, .95))
LOBES = {}
for s_ in (-1, 1):       # the lobes hang down and out from the knot (sheet: to z ~0.694, out to +-0.10 m)
    LOBES[s_] = surf_blob('bandana_bow_lobe.' + ('L' if s_ > 0 else 'R'), s_ * .050, BAND_ZB - .040, (.040, .013, .046), -s_ * 40., BAND_T - .006,
                          'band', 'band', vrange=(.55, .95), p=(.82, .85, .9))
LOG['band'] = {'front_top_z': round(float(G[0][:, 2].max()), 4), 'front_bottom_z': round(float(G[0][:, 2].min()), 4),
               'back_z': [round(float(BACK[:, 2].min()), 4), round(float(BACK[:, 2].max()), 4)], 'knot': [round(float(v), 4) for v in KNOT_C]}

# ============================================================== BODY AND COSTUME (metres; measure.md, the full-body views)
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
def lathe2(name, rows, chart, group, N=64, n=2.0, fold=None, cap=(False, False), vrange=(0., 1.), xc=0.):
    """lathe() with an x offset for the ring centre (the trouser legs)"""
    ob = lathe(name, rows, chart, group, N, n, fold, cap, vrange)
    if xc:
        for v in ob.data.vertices: v.co.x += xc
    return ob
def ring_xy(rows, n, a, z):
    """a point on a lathe surface: rows (z, ax, ay[, yc]); a = angle from the BACK (+Y) as in lathe(); vectorised"""
    Z = np.array([r[0] for r in rows]); AX = np.array([r[1] for r in rows]); AY = np.array([r[2] for r in rows])
    ax = np.interp(z, Z, AX); ay = np.interp(z, Z, AY)
    return ax * spow(np.sin(a), 2 / n), ay * spow(np.cos(a), 2 / n)
def ring_front_y(rows, n, x, z):
    """the front (-y) surface of a lathe at (x, z)"""
    Z = np.array([r[0] for r in rows]); ax = np.interp(z, Z, [r[1] for r in rows]); ay = np.interp(z, Z, [r[2] for r in rows])
    return -ay * np.clip(1 - np.abs(x / ax) ** n, 0, 1) ** (1 / n)
def ring_back_y(rows, n, x, z): return -ring_front_y(rows, n, x, z)
def ring_normal(rows, n, x, z, side=-1):
    e = 1e-4; f = ring_front_y if side < 0 else ring_back_y
    dx = (f(rows, n, x + e, z) - f(rows, n, x - e, z)) / (2 * e); dz = (f(rows, n, x, z + e) - f(rows, n, x, z - e)) / (2 * e)
    nn = np.array([dx, -1., dz]) if side < 0 else np.array([-dx, 1., -dz])
    return nn / np.linalg.norm(nn)

# --- the shirt torso (cream; its top tucks up inside the head, its bottom inside the trousers)
SHIRT = [(.240, .170, .142), (.280, .176, .146), (.320, .177, .146), (.360, .174, .142), (.400, .170, .137), (.440, .163, .130),
         (.470, .152, .124), (.495, .137, .116), (.515, .120, .106), (.535, .104, .096), (.560, .090, .086), (.600, .080, .078)]
SH_N = 2.3
lathe('shirt_torso', SHIRT, 'shirt', 'body', 56, SH_N, cap=(False, True))
# --- the trousers: a baggy seat (lathe, a rolled waistband tucked under the shirt's hem line at the back)
TROUS = [(.150, .110, .095), (.165, .168, .140), (.190, .196, .158), (.230, .205, .165), (.260, .203, .164), (.274, .199, .161),
         (.283, .197, .160), (.289, .192, .157), (.291, .184, .152), (.287, .175, .146)]
TR_N = 2.3
lathe('trouser_seat', TROUS, 'trousers', 'body', 56, TR_N, cap=(True, False), vrange=(0., .5))
# --- the waist tie: a soft band round the shirt (the back and sides show; the bib covers its front)
BELT_Z0, BELT_Z1, BELT_T = .342, .388, .013
NBE = 56; bsec = np.linspace(0, 1, 7)
G2 = np.zeros((NBE, len(bsec), 3)); aa = np.linspace(0, 2 * PI, NBE, endpoint=False)
for j, t in enumerate(bsec):
    zz = BELT_Z0 + (BELT_Z1 - BELT_Z0) * t; prf = BELT_T * (1 - (2 * t - 1) ** 6) ** .5 - .002
    x, y = ring_xy(SHIRT, SH_N, aa, zz); nx_, ny_ = unit(np.stack([x, y], -1)).T
    G2[:, j] = np.stack([x + nx_ * prf, y + ny_ * prf, np.full_like(x, zz)], -1)
Fb = []; UVb = []
for i in range(NBE):
    for j in range(len(bsec) - 1):
        i2 = (i + 1) % NBE; Fb.append((i * len(bsec) + j, i2 * len(bsec) + j, i2 * len(bsec) + j + 1, i * len(bsec) + j + 1))
        UVb.append(((i / NBE, bsec[j]), ((i + 1) / NBE, bsec[j]), ((i + 1) / NBE, bsec[j + 1]), (i / NBE, bsec[j + 1])))
mesh('waist_tie', G2.reshape(-1, 3), Fb, UVb, 'belt', 'body')
# --- the apron: ONE thick panel on an A-line surface round the body: a bib on the chest (front only), below the waist tie
# it wraps round the hips to the sides (the back view shows its edges at x +-0.19-0.22 m); rounded hem corners
AP = [(.172, .222, .190), (.210, .220, .189), (.258, .214, .188), (.300, .210, .184), (.350, .198, .174), (.390, .186, .162),
      (.430, .174, .148), (.468, .162, .136)]
AP_N = 2.2; AP_T = .010; AP_TOP = .465; AP_BOT = .172; AP_WRAP = math.radians(100.); AP_RC = .034
BIB_HW = [(.465, .111), (.430, .128), (.390, .145), (.353, .154)]
def ap_point(th, z):
    """th: angle from the front (+ = her right, -x); the A-line surface point and its outward normal (vectorised)"""
    x, y = ring_xy(AP, AP_N, PI + th, z); return x, y
def ap_theta_for_x(hw, z):
    Z = np.array([r[0] for r in AP]); ax = np.interp(z, Z, [r[1] for r in AP])
    return np.arcsin(np.clip(hw / ax, 0, 1) ** (AP_N / 2))
def ap_half_angle(z):
    z = np.asarray(z, float)
    hwb = np.interp(z, [b[0] for b in BIB_HW][::-1], [b[1] for b in BIB_HW][::-1])
    tb = ap_theta_for_x(hwb, z)
    t = tb + (AP_WRAP - tb) * smooth(.372, .318, z)
    # rounded hem corners: the side edge pulls in near the hem (radius AP_RC in arc length)
    Z = np.array([r[0] for r in AP]); rr = .5 * (np.interp(z, Z, [r[1] for r in AP]) + np.interp(z, Z, [r[2] for r in AP]))
    dz = np.clip(AP_RC - (z - AP_BOT), 0, AP_RC)
    return t - (AP_RC - np.sqrt(np.maximum(AP_RC ** 2 - dz ** 2, 0))) / rr
NRA, NCA = 26, 24
zr_ap = np.concatenate([AP_BOT + AP_RC * (1 - np.cos(np.linspace(0, PI / 2, 6))), np.linspace(AP_BOT + AP_RC, AP_TOP, NRA - 5)[1:]])
NRA = len(zr_ap)
cu = np.sin(np.linspace(-PI / 2, PI / 2, NCA))              # denser columns near the side edges
THg = cu[None, :] * ap_half_angle(zr_ap)[:, None]; ZAg = np.repeat(zr_ap[:, None], NCA, 1)
XA, YA = ap_point(-THg, ZAg)
MIDA = np.stack([XA, YA, ZAg], -1)
dzA = np.gradient(MIDA, axis=0); dxA = np.gradient(MIDA, axis=1)
NAp = unit(np.cross(dzA, dxA)); NAp = np.where(((NAp[..., :2] * MIDA[..., :2]).sum(-1) < 0)[..., None], -NAp, NAp)
# a soft rolled hem along the bottom (1.4 cm tall, 5 mm proud) and a soft fold toward the bib top edge
AP_FE = .005 * np.sin(PI * np.clip((ZAg - AP_BOT) / .014, 0, 1)) ** .75 * ((ZAg - AP_BOT) < .014)
AP_FE = AP_FE + .0025 * smooth(AP_TOP - .016, AP_TOP - .004, ZAg)
thick_panel('fish_apron', MIDA, NAp, AP_T, 'apron', 'apron', (cu + 1) / 2, (zr_ap - AP_BOT) / (AP_TOP - AP_BOT), front_extra=AP_FE)
APRON_FRONT = MIDA + NAp * (AP_T / 2 + AP_FE[..., None])
def ap_front_at(x, z):
    """the apron's front surface point and normal at front-view (x, z) (near the middle)"""
    th = ap_theta_for_x(np.abs(x), z) * np.sign(x)
    xx, yy = ap_point(-th, z); P = np.stack([xx, yy, np.broadcast_to(np.asarray(z, float), np.shape(xx))], -1)
    e = 1e-3
    xa, ya = ap_point(-th - e, z); xb, yb = ap_point(-th + e, z); xc_, yc_ = ap_point(-th, z + e); xd, yd = ap_point(-th, z - e)
    tu = np.stack([xb - xa, yb - ya, np.zeros_like(xa)], -1); tv = np.stack([xc_ - xd, yc_ - yd, np.full_like(xa, 2 * e)], -1)
    n = unit(np.cross(tv, tu)); n = np.where((n[..., 1:2] > 0), -n, n)
    return P, n
# --- the patch pocket: a big rounded-U pocket on the apron front (sheet: +-0.11 m, z 0.225-0.358) with a rolled top hem
PK_TOP, PK_BOT, PK_SIDE, PK_HW, PK_T = .358, .225, .292, .110, .007
def pk_hw(z):
    z = np.asarray(z, float); dz = np.clip(PK_SIDE - z, 0, None)
    return PK_HW * np.sqrt(np.clip(1 - (dz / (PK_SIDE - PK_BOT)) ** 2, 0, 1))
NRP, NCP = 13, 13
zr_pk = np.concatenate([PK_BOT + (PK_SIDE - PK_BOT) * (1 - np.cos(np.linspace(0, PI / 2, 8))), np.linspace(PK_SIDE, PK_TOP, NRP - 7)[1:]])
cp = np.sin(np.linspace(-PI / 2, PI / 2, NCP))
XP = cp[None, :] * np.maximum(pk_hw(zr_pk), .006)[:, None]; ZP = np.repeat(zr_pk[:, None], NCP, 1)
Pp, Np_ = ap_front_at(XP.ravel(), ZP.ravel()); Pp = Pp.reshape(NRP, NCP, 3); Np_ = Np_.reshape(NRP, NCP, 3)
MIDP = Pp + Np_ * (PK_T / 2 + .0006)
PK_FE = .004 * smooth(PK_TOP - .016, PK_TOP - .006, ZP) * (1 - smooth(PK_TOP - .002, PK_TOP, ZP))
thick_panel('apron_pocket', MIDP, Np_, PK_T, 'pocket', 'apron', (cp + 1) / 2, (zr_pk - PK_BOT) / (PK_TOP - PK_BOT), front_extra=PK_FE)
# --- the straps: thick rounded bands from the bib's top corners up over the shoulders (under the head) and straight down
# the back into the waist tie (sheet: 0.045 m wide, centres x +-0.089 front, +-0.080 back)
STRAP_W, STRAP_T = .045, .0105
def strap_build(s):
    F2 = [(s * .089, .446), (s * .089, .462), (s * .091, .485), (s * .094, .508), (s * .097, .532), (s * .099, .552)]
    B2 = [(s * .094, .552), (s * .090, .532), (s * .085, .505), (s * .081, .475), (s * .080, .440), (s * .080, .405), (s * .080, .372)]
    pts_ = []
    for x, z in F2:
        y_sh = ring_front_y(SHIRT, SH_N, x, z); n_sh = ring_normal(SHIRT, SH_N, x, z, -1)
        P = np.array([x, y_sh, z]) + n_sh * (STRAP_T / 2 + .0012)
        if z < AP_TOP + .004:          # on the bib: ride on the apron's front face
            Pa, na = ap_front_at(np.array([x]), z); Pa = Pa[0] + na[0] * (STRAP_T / 2 + .0006 + .0025)
            if Pa[1] < P[1]: P = Pa
        pts_.append(P)
    # over the shoulder top (hidden under the head): two points arching over
    pts_.append(np.array([s * .098, .000, .566]))
    for x, z in B2:
        y_sh = ring_back_y(SHIRT, SH_N, x, z); n_sh = ring_normal(SHIRT, SH_N, x, z, 1)
        pts_.append(np.array([x, y_sh, z]) + n_sh * (STRAP_T / 2 + .0008))
    path = [catmull(pts_, t) for t in np.linspace(0, 1, 40)]
    C = np.array([list(p) for p in path])
    # section: a rounded flat band (the frame's normal = the surface outward, approx. horizontal radial)
    T_ = unit(np.gradient(C, axis=0)); R_ = unit(np.stack([C[:, 0], C[:, 1], np.zeros(len(C))], -1))
    Nn = unit(R_ - T_ * (R_ * T_).sum(1, keepdims=True)); B_ = np.cross(T_, Nn)
    SIDES = 8; a = np.linspace(0, 2 * PI, SIDES, endpoint=False); cx = spow(np.cos(a), .45); cy = spow(np.sin(a), .55)
    V = []; rows = []
    for i in range(len(C)):
        rows.append(list(range(len(V), len(V) + SIDES)))
        for k in range(SIDES): V.append(C[i] + B_[i] * (STRAP_W / 2 * cx[k]) + Nn[i] * (STRAP_T / 2 * cy[k]))
    e0 = len(V); V.append(C[0] - T_[0] * .004); e1 = len(V); V.append(C[-1] + T_[-1] * .004)
    F = []; UV = []
    for j, (a_, b_) in enumerate(zip(rows, rows[1:])):
        for k in range(SIDES):
            F.append((a_[k], a_[(k + 1) % SIDES], b_[(k + 1) % SIDES], b_[k]))
            UV.append(((k / SIDES, j / len(rows)), ((k + 1) / SIDES, j / len(rows)), ((k + 1) / SIDES, (j + 1) / len(rows)), (k / SIDES, (j + 1) / len(rows))))
    for k in range(SIDES):
        F.append((rows[0][(k + 1) % SIDES], rows[0][k], e0)); UV.append((((k + 1) / SIDES, 0), (k / SIDES, 0), (.5, 0)))
        F.append((rows[-1][k], rows[-1][(k + 1) % SIDES], e1)); UV.append(((k / SIDES, 1), ((k + 1) / SIDES, 1), (.5, 1)))
    mesh('apron_strap.' + ('L' if s > 0 else 'R'), V, F, UV, 'strap', 'body')
for s_ in (-1, 1): strap_build(s_)
# --- arms: puffy short shirt sleeves with a rolled cuff, short fur arms, mitten paws
ARM_ANG = math.radians(35)
joint_arms = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    grp = 'arm.' + tag
    Sh = np.array([s * .152, .006, .462]); Dv = unit(np.array([s * math.sin(ARM_ANG), -.10, -math.cos(ARM_ANG)]))
    Pv = unit(np.array([s * math.cos(ARM_ANG), 0, math.sin(ARM_ANG)])); Pv = unit(Pv - Dv * (Pv @ Dv)); Yv = -s * np.cross(Dv, Pv)
    T0, T1 = -.050, .098
    prof_s = []
    for t in np.linspace(T0, T1, 9):
        k = (t - T0) / (T1 - T0)
        a_ = .046 + (.072 - .046) * math.sin(min(1., k / .45) * PI / 2) ** .8 - .006 * smooth(.6, 1., k)
        b_ = .044 + (.068 - .044) * math.sin(min(1., k / .45) * PI / 2) ** .8 - .006 * smooth(.6, 1., k)
        prof_s.append((t, a_, b_, -.010 * k))
    tl, al, bl, sg = prof_s[-1]
    lip = [(T1 + .006, .004, .004), (T1 + .012, .002, .002), (T1 + .015, -.006, -.006), (T1 + .013, -.016, -.016), (T1 + .006, -.022, -.022),
           (T1 - .020, -.024, -.024)]
    for (t, da, db) in lip: prof_s.append((t, al + da, bl + db, sg))
    N = 20; verts = []; faces = []; uvs = []; M = len(prof_s)
    for j, (t, a_, b_, sg) in enumerate(prof_s):
        c = Sh + Dv * t - Pv * sg
        for i in range(N):
            ph = 2 * PI * i / N
            verts.append(tuple(c + Pv * (a_ * spow(math.cos(ph), 2 / 2.3)) + Yv * (b_ * spow(math.sin(ph), 2 / 2.3))))
    for j in range(M - 1):
        for i in range(N):
            ni = (i + 1) % N; faces.append((j * N + i, j * N + ni, (j + 1) * N + ni, (j + 1) * N + i))
            uvs.append(((i / N, j / (M - 1)), ((i + 1) / N, j / (M - 1)), ((i + 1) / N, (j + 1) / (M - 1)), (i / N, (j + 1) / (M - 1))))
    for j in (0, M - 1):
        k = len(verts); t, a_, b_, sg = prof_s[j]; verts.append(tuple(Sh + Dv * t - Pv * sg))
        for i in range(N): faces.append((k, j * N + i, j * N + (i + 1) % N)); uvs.append(((.5, j / (M - 1)), (i / N, j / (M - 1)), ((i + 1) / N, j / (M - 1))))
    mesh('shirt_sleeve.' + tag, verts, faces, uvs, 'sleeve', grp)
    sweep('fur_arm.' + tag, [Sh + Dv * t for t in np.linspace(-.02, .205, 8)], lambda s_, L: .042, 'skin', grp, rings=10, sides=16)
    orient = Matrix([list(Pv), list(Yv), list(Dv)]).transposed()
    blob('mitten_paw.' + tag, tuple(Sh + Dv * .228), (.055, .051, .062), 'paw', grp, 18, 10, p=(.92, .92, .92), orient=orient)
    joint_arms[tag] = {'shoulder': [float(v) for v in Sh], 'elbow': [float(v) for v in Sh + Dv * .105],
                       'wrist': [float(v) for v in Sh + Dv * .190], 'hand': [float(v) for v in Sh + Dv * .228]}
    pc = Sh + Dv * .228; Z_ = np.array([r[0] for r in AP])
    LOG['paw_clear_apron_' + tag] = round(float(abs(pc[0]) - .055 - np.interp(pc[2], Z_, [r[1] for r in AP]) - AP_T / 2), 4)
    LOG['paw_centre_' + tag] = [round(float(v), 3) for v in pc]
# --- the trouser legs (baggy, oval, a rolled cuff), short fur ankles and bean feet
LEG_X = .104; LEG_Y = .006
joint_legs = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    grp = 'leg.' + tag
    LEGR = [(.082, .060, .070, LEG_Y), (.086, .080, .095, LEG_Y), (.090, .094, .114, LEG_Y), (.097, .099, .121, LEG_Y), (.108, .100, .122, LEG_Y),
            (.120, .098, .120, LEG_Y), (.126, .092, .114, LEG_Y), (.135, .091, .113, LEG_Y), (.170, .092, .114, LEG_Y), (.210, .092, .113, LEG_Y),
            (.240, .088, .108, LEG_Y)]
    lathe2('trouser_leg.' + tag, LEGR, 'trousers', grp, 32, 2.1, vrange=(.5, 1.), xc=s * LEG_X)
    sweep('fur_ankle.' + tag, [(s * LEG_X, LEG_Y - .004, .105), (s * (LEG_X + .004), LEG_Y - .008, .070), (s * (LEG_X + .008), LEG_Y - .012, .040)],
          lambda s_, L: .060, 'skin', grp, rings=6, sides=16)
    blob('bean_foot.' + tag, (s * .116, -.012, .037), (.088, .118, .037), 'foot', grp, 22, 11, p=(.82, .82, .80))    # 0.176 x 0.236 x 0.074 m
    joint_legs[tag] = {'hip': [s * LEG_X, LEG_Y, .250], 'knee': [s * LEG_X, LEG_Y, .160], 'ankle': [s * (LEG_X + .006), LEG_Y - .010, .060],
                       'toe': [s * .116, -.120, .032]}
# --- the tail: thick, striped, from under the shirt's hem at the back, dipping, then sweeping to her right and curling up
# (back view: root x -0.05 at z 0.26, dip z ~0.17, up her LEFT side (the viewer's left from behind) to x +0.22, top z ~0.47;
# side view: 0.37 m behind)
TAIL_CTRL = [(-.035, .120, .268), (-.020, .190, .232), (.030, .255, .192), (.105, .300, .190), (.175, .318, .232),
             (.215, .318, .300), (.218, .298, .372), (.192, .268, .430), (.150, .236, .458)]
tpath = [catmull(TAIL_CTRL, t) for t in np.linspace(0, 1, 90)]
dl = (tpath[-1] - tpath[-2]).normalized()
TAIL_RB = .048
tpath += [tpath[-1] + dl * (TAIL_RB * k / 6) for k in range(1, 7)]
def tail_r(s, L):
    t = s / L; se = L - TAIL_RB
    r = float(np.interp(t, [0, .12, .5, .85, 1.0], [.050, .052, .053, .051, .048]))
    if s > se: r = min(r, TAIL_RB * math.sqrt(max(0., 1 - ((s - se) / TAIL_RB) ** 2)))
    return max(r, .0015)
def tail_rings(L):
    return L * np.concatenate([np.linspace(0, .88, 36), .88 + .12 * np.sin(np.linspace(0, 1, 10)[1:] * PI / 2)])
tail_ob, TAIL_L = sweep('tabby_tail', tpath, tail_r, 'tail', 'tail', rings=tail_rings, sides=14, caps=(True, True))
TAIL_JOINTS = [[float(v) for v in catmull(TAIL_CTRL, t)] for t in (0, .25, .5, .75, 1.0)]
LOG['tail'] = {'length_m': round(float(TAIL_L), 3), 'top_z': round(float(max(p.z for p in tpath)) + .048, 3)}

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
# the tabby patch over her RIGHT eye (the viewer's left on the sheet's front view, -X here), traced on the HEAD FRONT
# panel (measure/m4_patch.py) in W units about the face's middle, u = outward from the middle (-x): the inner border runs
# up from the eye's upper inner corner to the bandana, the eye sits in the patch (its nasal side and its bottom are
# fur), the lower border runs from the eye's outer lower corner across the cheek to the jaw
_eps = np.radians(np.linspace(125, 330, 22)); _ex, _ez = eye_unit(_eps)
_EYE_RIM = [(.193 + .0965 * 1.04 * a, .311 + .093 * 1.04 * b) for a, b in zip(_ex, _ez)]
PATCH_FACE = ([(.012, 1.20), (.012, .75), (.015, .62), (.020, .575), (.027, .542), (.037, .492), (.050, .442), (.064, .409),
               (.080, .375), (.093, .362)] + _EYE_RIM +
              [(.300, .232), (.330, .214), (.368, .200), (.400, .182), (.448, .167), (.500, .175), (.560, .215), (.90, .30), (.90, 1.20)])
# the muzzle (light): a broad rounded shape from the chin up to an arch between the eyes (measured on the panel)
_MZ = [(0, .276), (.050, .268), (.100, .246), (.128, .224), (.150, .208), (.172, .198), (.192, .190), (.206, .174), (.215, .150),
       (.218, .110), (.214, .078), (.205, .050), (.190, .028), (.168, .008), (.130, -.030), (.080, -.070), (0, -.090)]
MUZ_POLY = _MZ + [(-x, z) for x, z in _MZ[::-1][1:-1]]
def band_q(P):
    """signed distance (m, along z) from the band's centre line; |band_q| < BAND_H/2 is under the band"""
    phi = np.arctan2(P[:, 0], -(P[:, 1] - HY)); return P[:, 2] - band_zc(phi)
def patch_alpha(q, P, aa=.0045):
    u, y, z = -q[:, 0], q[:, 1], q[:, 2]
    dF = poly_sd(u, z, PATCH_FACE)
    dF = smax(dF, (y - .02) * .8, .05)                                    # it fades out at the side (the back view shows none)
    dF = np.maximum(dF, (band_q(P) - BAND_H / 2 + .004) / W)              # nothing above the bandana
    return 1 - smooth(-aa, aa, dF)
def muzzle_alpha(q, aa=.0045):
    x, y, z = q[:, 0], q[:, 1], q[:, 2]
    d = poly_sd(x, z, MUZ_POLY)
    d = np.maximum(d, (y - .06) * .8)                                      # front half only (it wraps under the chin)
    return 1 - smooth(-aa, aa, d)
def paint_head(d): return paint_head_P(radial_hit(d))
def paint_head_P(P):
    n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); zr = q[:, 2]
    fr = smooth(HY + .03, HY - .07, y)
    C = np.broadcast_to(rgb('fur'), (len(x), 3)).copy()
    pa = patch_alpha(q, P); mu = muzzle_alpha(q) * (1 - pa)
    C = mix(C, rgb('patch'), pa); C = mix(C, rgb('muzzle'), mu)
    shade = mix(mix(rgb('furshade'), rgb('patchshade'), pa), rgb('muzzleshade'), mu)
    # soft painted shade (value only): under the jaw toward the neck, the jaw's sides, the far sides of the ball
    under = smooth(-.25, -.85, n[:, 2]) * (1 - smooth(.10, .26, zr))
    C = mix(C, shade, .80 * under)
    jaw = smooth(.40, .85, np.abs(n[:, 0])) * (1 - smooth(.16, .46, zr))
    C = mix(C, shade, .50 * jaw)
    sides = smooth(.35, .95, np.abs(n[:, 0]) + .6 * clamp(n[:, 1])) * (1 - smooth(.55, .85, n[:, 2]))
    C = mix(C, shade, .30 * sides)
    C = mix(C, rgb('furlight'), .35 * smooth(.55, .95, n[:, 2]) * (1 - pa) * (1 - mu))     # the crown catches the light (value only)
    # contact shade at the band's edges and the ear bases
    bq = np.abs(band_q(P)); C = mix(C, shade, .35 * smooth(BAND_H / 2 + .022, BAND_H / 2 + .002, bq))
    for s in (-1, 1):
        ei = ear_info[s]; dd = np.linalg.norm(P - ei['S'], axis=1)
        C = mix(C, shade, .25 * np.exp(-(dd / (.11 * W)) ** 2))
    # nose: a soft rounded inverted triangle (sheet: 0.093 W wide, top z 0.256, tip 0.209) with a small soft highlight
    nx = x / W; nzz = (z - CHIN) / W
    tri = poly_sd(nx, nzz, [(-.0365, .2480), (.0365, .2480), (0, .2200)]) - .0105
    fwd = smooth(-.97, -.80, n[:, 2])
    C = mix(C, rgb('nose'), (1 - smooth(-.0022, .0022, tri)) * fr * (nzz > .19) * fwd)
    hl = np.exp(-(((nx + .010) / .0110) ** 2 + ((nzz - .2500) / .0060) ** 2))
    C = mix(C, rgb('#dca0a8'), .45 * hl * fr * (1 - smooth(-.002, .002, tri)))
    # blush ovals (soft)
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .92 * (1 - smooth(.78, 1.02, r)) * fr)
    # brows: soft short arcs tapering to rounded points (sheet: x +-0.198 W, z 0.508, 0.140 x 0.043 W)
    t = np.linspace(-1, 1, 15)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * .060 * W * t, BROW_Z + .020 * W * (1 - t * t) - .010 * W], -1)
        half = .0128 * W * np.maximum(0, 1 - t * t) ** .6 + .0026 * W
        box = fr * ((np.abs(x - s * BROW_X) < .10 * W) & (np.abs(z - BROW_Z) < .05 * W))
        a = np.zeros(len(x)); ib = box > 0
        a[ib] = stroke(x[ib], z[ib], Pb, half, .0030 * W)
        C = mix(C, rgb('brow'), .92 * a * fr)
    # mouth: the sheet's cat "w" (corners x +-0.076 W at z 0.186, the arcs dipping to 0.155, the middle at 0.166) and
    # the line up to the nose tip
    tl = np.linspace(0, 1, 21)
    ib = (fr > 0) & (np.abs(x) < .11 * W) & (np.abs(z - (CHIN + .180 * W)) < .06 * W)
    a = np.zeros(len(x))
    for s in (-1, 1):
        ax_ = s * MHW * tl; az_ = CHIN + (.166 - .060 * tl + .080 * tl * tl) * W
        Pm = np.stack([ax_, az_], -1); half = (.0058 - .0012 * tl ** 2) * W
        a[ib] = np.maximum(a[ib], stroke(x[ib], z[ib], Pm, half, .0026 * W))
    Pp = np.array([[0, CHIN + .214 * W], [0, CHIN + .168 * W]])
    a2 = np.zeros(len(x)); a2[ib] = stroke(x[ib], z[ib], Pp, np.array([.0050 * W, .0054 * W]), .0026 * W)
    C = mix(C, rgb('mouth'), .95 * np.maximum(a, a2))
    for s in (-1, 1):
        sr, psi, X, Z = eye_s(s, x, z)
        C = mix(C, shade * .80, .55 * (1 - smooth(.98, 1.10, sr)) * smooth(.97, 1.0, sr) * smooth(.1, -.4, np.sin(psi)) * fr)   # (outside the hole only: the lids sample this paint)
    return C

def paint_eye(U, V, s):
    """the sheet's eye: a big dark pupil (77 x 81 % of the iris) merging with the top, a teal crescent below and outside it,
    the white on the outer side, a big catchlight and a small one"""
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .29; iz = -.03; irx = .70; irz = .96
    C = mix(rgb('#fff8ef'), rgb('#e4dde2'), .45 * smooth(.35, .98, Z))
    C = mix(C, rgb('#ece6ea'), .25 * smooth(.3, 1., s * X))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#52b8c6'), rgb('#3a9cb0'), smooth(-.90, -.30, ez))      # #5AB0C0 family: bright teal at the bottom, deep at the top
    I = mix(I, rgb('#2a7a90'), smooth(-.30, .30, ez))
    I = mix(I, rgb('#1c4c5c'), smooth(.25, .80, ez))
    I = mix(I, rgb('#1e5466'), smooth(.82, 1.0, r) * .6)
    I = I * (1 - .025 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 26 + r * 9)))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    px_ = ix - s * .19; pz = iz + .17; R = np.sqrt(((X - px_) / (.83 * irx)) ** 2 + ((Z - pz) / (.85 * irz)) ** 2)
    C = mix(C, rgb('#1d1d26'), 1 - smooth(.985, 1.015, R))
    # catchlights: both sit up-left (viewer) of the iris centre, as on the sheet
    cbx = ix + (-.08 if s < 0 else -.29); csx = cbx + .13
    big = np.sqrt(((X - cbx) / .22) ** 2 + ((Z - (iz + .60)) / .23) ** 2)
    small = np.sqrt(((X - csx) / .085) ** 2 + ((Z - (iz + .83)) / .085) ** 2)
    C = mix(C, rgb('#fffbf6'), np.maximum(1 - smooth(.90, 1.06, big), 1 - smooth(.84, 1.12, small)))
    C = mix(C, rgb('lash'), .85 * smooth(.92, 1.0, sr) * smooth(-.30, .30, Z))      # lid contact under the lash ribbon
    return C

def paint_ear(U, V, s):
    a = U * 2 * PI - PI / 2; ca = np.cos(a); sa = np.sin(a)
    tb = EAR_TABLE[s]; rho = np.interp(V, tb['V'], tb['rho']); hz = np.interp(V, tb['V'], tb['hz'])
    inner = rho - EAR['rim']
    dd = np.abs(ca) * rho - inner
    m = (1 - smooth(-.0022, .0022, dd)) * (sa > 0) * smooth(.030, .065, hz) * (1 - smooth(.86, .92, hz)) * (inner > .004)
    C = mix(rgb('earout'), rgb('earshade'), .40 * (1 - smooth(.05, .35, hz)))
    deep = (1 - np.clip(np.abs(ca) * rho / np.maximum(inner, 1e-4), 0, 1)) * (1 - smooth(.25, .75, hz))
    P_ = mix(rgb('inner'), rgb('innerdeep'), .50 * deep)
    return mix(C, P_, m)

def lathe_z(V, rows): return np.interp(V, np.linspace(0, 1, len(rows)), [r[0] for r in rows])
def panel_paint(U, V, base, light, shade, deep, line, H, Wd, hem=0., stitch=True):
    """thick_panel charts: front face v .30-1 (u .04-.96), back face v .02-.22, rim at (.5, .26)"""
    C = np.broadcast_to(rgb(base), U.shape + (3,)).copy()
    fr = V >= .29
    uu = (U - .04) / .92; vv = (V - .30) / .70
    side_e = np.minimum(uu, 1 - uu) * Wd; bot_e = vv * H; top_e = (1 - vv) * H
    if stitch:
        ln = np.maximum(np.exp(-((side_e - .011) / .0020) ** 2) * (bot_e > hem + .006) * (top_e > .010),
                        np.exp(-((bot_e - hem - .004) / .0020) ** 2) * (side_e > .008))
        C = mix(C, rgb(line), .50 * ln * fr)
    if hem: C = mix(C, rgb(shade), .40 * np.exp(-((bot_e - hem - .0005) / .0028) ** 2) * fr)
    C = mix(C, rgb(light), .22 * smooth(.55, 1., vv) * fr)
    C = mix(C, rgb(shade), .25 * (1 - smooth(.0, .30, vv)) * fr + .55 * (~fr))
    C = mix(C, rgb(deep), .45 * (~fr) * (V < .225))
    return C

def paint(chart, U, V):
    if chart == 'head': return paint_head(head_uv_dir(U.ravel(), V.ravel())).reshape(U.shape + (3,))
    if chart == 'headback': return paint_head(headback_uv_dir(U.ravel(), V.ravel())).reshape(U.shape + (3,))
    if chart == 'eye.L': return paint_eye(U, V, 1)
    if chart == 'eye.R': return paint_eye(U, V, -1)
    if chart == 'ear.L': return paint_ear(U, V, 1)
    if chart == 'ear.R': return paint_ear(U, V, -1)
    if chart == 'shirt':
        z = lathe_z(V, SHIRT); a = U * 2 * PI
        ax = np.interp(z, [r[0] for r in SHIRT], [r[1] for r in SHIRT]); x = ax * spow(np.sin(a), 2 / SH_N); front = np.cos(a) < 0
        C = mix(rgb('shirt'), rgb('shirtshade'), .45 * (1 - smooth(.27, .34, z)))           # tucked into the trousers
        C = mix(C, rgb('shirtshade'), .35 * smooth(.6, .95, np.abs(np.sin(a))) * (1 - smooth(.40, .47, z)))   # under the arms
        C = mix(C, rgb('shirtdeep'), .30 * np.exp(-((z - .336) / .006) ** 2))                # the waist tie's contact shade
        # a small V neckline showing fur under the chin
        vneck = front & (np.abs(x) < .80 * (z - .500) + .003) & (z > .497)
        return mix(C, rgb('fur'), vneck * 1.)
    if chart == 'sleeve':
        C = mix(rgb('shirt'), rgb('#fbf8f2'), .40 * smooth(.15, .55, V) * smooth(-.2, .8, np.sin(U * 2 * PI)))
        C = mix(C, rgb('shirtshade'), .30 * smooth(.2, .9, -np.sin(U * 2 * PI)))
        C = mix(C, rgb('shirtshade'), .50 * np.exp(-((V - .585) / .022) ** 2))            # the crease before the rolled cuff
        C = mix(C, rgb('shirtdeep'), smooth(.80, .86, V))                                 # the inside of the sleeve
        return C
    if chart == 'trousers':
        a = U * 2 * PI; fold = np.cos(6 * a + .5)
        C = mix(rgb('navy'), rgb('navylight'), .30 * clamp(fold))
        C = mix(C, rgb('navyshade'), .30 * clamp(-fold))
        seat = V < .5; vs = V / .5; vl = (V - .5) / .5
        zs = lathe_z(vs, TROUS)
        C = np.where(seat[..., None], mix(C, rgb('navydeep'), .55 * (1 - smooth(.155, .185, zs))), C)       # the crotch
        C = np.where(seat[..., None], mix(C, rgb('navyshade'), .55 * np.exp(-((zs - .272) / .003) ** 2)), C)  # the waistband's crease
        C = np.where(seat[..., None], mix(C, rgb('navylight'), .35 * smooth(.276, .286, zs)), C)            # the waistband
        zl = np.interp(vl, np.linspace(0, 1, 11), [.082, .086, .090, .097, .108, .120, .126, .135, .170, .210, .240])
        lg = ~seat
        C = np.where(lg[..., None], mix(C, rgb('navylight'), .30 * smooth(.094, .104, zl) * (1 - smooth(.112, .120, zl))), C)  # the cuff roll
        C = np.where(lg[..., None], mix(C, rgb('navyshade'), .60 * np.exp(-((zl - .1235) / .003) ** 2)), C)   # the crease above it
        C = np.where(lg[..., None], mix(C, rgb('navydeep'), .70 * (1 - smooth(.084, .090, zl))), C)          # the cuff's underside
        return C
    if chart == 'apron': return panel_paint(U, V, 'apron', 'apronlight', 'apronshade', 'aprondeep', 'apronline', AP_TOP - AP_BOT, .40, hem=.014, stitch=False)
    if chart == 'pocket':
        C = panel_paint(U, V, 'apron', 'apronlight', 'apronshade', 'aprondeep', 'apronline', PK_TOP - PK_BOT, 2 * PK_HW, stitch=False)
        vv = (V - .30) / .70; fr = V >= .29
        C = mix(C, rgb('apronshade'), .55 * np.exp(-((vv - .885) / .012) ** 2) * fr)      # the rolled top hem's crease
        C = mix(C, rgb('apronlight'), .30 * smooth(.90, .96, vv) * fr)
        return C
    if chart == 'strap':
        across = np.abs(np.cos(U * 2 * PI))
        return mix(rgb('apron'), rgb('apronshade'), .45 * smooth(.75, 1., across))
    if chart == 'belt':
        C = mix(rgb('apronshade'), rgb('apron'), .55 * np.sin(np.clip(V, 0, 1) * PI) ** 2)
        return mix(C, rgb('aprondeep'), .40 * (1 - smooth(.0, .18, V)) + .30 * smooth(.85, 1., V))
    if chart == 'band':
        a = V * 2 * PI                       # round the section: cos > 0 = the outer face, sin = up / down
        C = mix(rgb('navyshade'), rgb('navy'), .85 * smooth(-.4, .6, np.cos(a)) * (1 - .25 * smooth(.3, 1., -np.sin(a))) + .1)
        C = mix(C, rgb('navylight'), .45 * smooth(.2, .9, np.sin(a)) * smooth(-.2, .6, np.cos(a)))
        knot = (V > .52) & (V < .98)                                           # the knot and the bow lobes (blob charts)
        vb = (V - .55) / .40
        Kc = mix(rgb('navyshade'), rgb('navylight'), .55 * smooth(.15, .85, vb))
        Kc = mix(Kc, rgb('navy'), .5 * smooth(-.2, .8, np.cos(U * 2 * PI - PI)))
        return np.where(knot[..., None], Kc, C)
    if chart in ('skin', 'paw', 'foot', 'tail'):
        C = np.broadcast_to(rgb('fur'), U.shape + (3,)).copy()
        if chart == 'skin':     # arms and legs: a soft shade on their backs (+Y is u = .75 on these tubes) and at the roots
            back = np.exp(-((U - .75) / .17) ** 2)
            C = mix(C, rgb('furshade'), np.clip(.55 * back + .35 * (1 - smooth(.0, .35, V)), 0, 1))
        if chart == 'paw':
            back = np.exp(-(np.minimum(U, 1 - U) / .16) ** 2)
            C = mix(C, rgb('furshade'), .45 * back)
            C = mix(rgb('furshade'), C, .55 + .45 * smooth(.0, .30, V))
        if chart == 'foot':     # two toe lines over the front of the foot
            for du in (-.040, .040):
                C = mix(C, rgb('line'), .80 * np.exp(-((U - (.5 + du)) / .0085) ** 2) * smooth(.30, .40, V) * (1 - smooth(.66, .78, V)))
            C = mix(C, rgb('furshade'), .60 * (1 - smooth(.02, .10, V)))
        if chart == 'tail':     # tabby rings: dark bands from the tip back toward the root (soft, slightly wavy borders)
            s_ = V * TAIL_L; wv = .006 * np.cos(U * 2 * PI - .6)
            ring = np.zeros_like(V)
            for c in np.arange(TAIL_L - .018, .16, -.094):
                ring = np.maximum(ring, 1 - smooth(.019, .025, np.abs(s_ - c + wv)))
            ring = np.maximum(ring, smooth(TAIL_L - .040, TAIL_L - .034, s_ + wv))        # a dark tip
            C = mix(C, rgb('furlight'), .25 * smooth(-.3, .8, np.cos(U * 2 * PI)))
            C = mix(C, rgb('stripe'), ring)
            C = mix(C, rgb('furshade'), .30 * (1 - smooth(.0, .22, V)) * (1 - ring))
        return C
    if chart == 'lash':
        return mix(rgb('lash'), rgb('#44404e'), .40 * smooth(.60, .95, V))
    if chart == 'cavity': return mix(rgb('#5a1e26'), rgb('#3e141c'), .5 * smooth(.3, 1, V))
    if chart == 'tongue': return mix(rgb('#e88a96'), rgb('#f2a2ac'), .5 * smooth(.2, .9, V))
    if chart.startswith('lid'): return np.broadcast_to(rgb('fur'), U.shape + (3,)).copy()      # painted by the rig
    if chart == 'nose':     # front-projected: each texel painted at its true surface point
        x = (U.ravel() - .5) * 2 * NOSE_CH * W; z = NZ + (V.ravel() - .5) * 2 * NOSE_CH * W
        P = np.stack([x, front_hit(x, z), z], -1); return paint_head_P(P).reshape(U.shape + (3,))
    raise KeyError(chart)

atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [142, 140, 156, 255]
for name, (x0, y0, w, h) in CHARTS.items():
    U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
    if name in ('head', 'headback'):
        block = np.empty((h, w, 3))
        for r0 in range(0, h, 128): block[r0:r0 + 128] = paint(name, U[r0:r0 + 128], V[r0:r0 + 128])
    else:
        block = paint(name, U, V)
    atlas[y0:y0 + h, x0:x0 + w, :3] = np.round(clamp(block) * 255).astype(np.uint8)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
atlas_path = os.path.join(ROOT, 'sk-saba-toy_rig_atlas.png' if RIG else 'sk-saba-toy_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Saba_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Saba_toy_atlas'); MAT.use_nodes = True
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
def width_at(zw):
    m = np.abs((sk[:, 2] - CHIN) / W - zw) < .006; return round(float(np.ptp(sk[m, 0]) / 2 / W), 3) if m.any() else None
MEAS = {'W_m': W, 'chin_z_m': CHIN, 'total_height_m': round(float(allv[:, 2].max()), 4), 'min_z_m': round(float(allv[:, 2].min()), 4),
        'head_width_W': round(float(np.ptp(sk[:, 0]) / W), 3),
        'crown_above_chin_W': round(float((sk[:, 2].max() - CHIN) / W), 3),
        'head_depth_W': round(float(np.ptp(sk[:, 1]) / W), 3),
        'half_width_W': {str(zw): width_at(zw) for zw in (.037, .09, .143, .196, .249, .302, .355, .435, .515)},
        'ear_tip_z_m': round(float(earv[:, 2].max()), 4), 'ear_tip_above_crown_W': round(float((earv[:, 2].max() - sk[:, 2].max()) / W), 3),
        'ear_tip_z_W': round(float((earv[:, 2].max() - CHIN) / W), 3),
        'ear_tip_x_W': round(float(abs(earv[np.argmax(earv[:, 2]), 0]) / W), 3),
        'eye_centre_W': [round(EX / W, 3), round((EZ - CHIN) / W, 3)],
        'eye_opening_W': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'nose_tip_z_W': round(NOSE_TIP_Z, 3), 'nose_tip_y_m': round(nose_tip_y, 4),
        'nose_proud_of_eye_zone_W': round(float(front_local(0, .33, head_local)[0] - NOSE_TIP_L), 3),
        'muzzle_proud_of_eye_zone_W': round(float(front_local(0, .33, head_local)[0] - front_local(0, .19, head_local)[0]), 3)}
MEAS.update(LOG)

# ============================================================== JOIN, CLEAN, NORMALS
objects = []; part_tri = {}
NAMES = {'head': 'Saba_head', 'eye.L': 'Saba_eye_L', 'eye.R': 'Saba_eye_R', 'lash.L': 'Saba_lash_L', 'lash.R': 'Saba_lash_R',
         'ear.L': 'Saba_ear_L', 'ear.R': 'Saba_ear_R', 'band': 'Saba_bandana', 'body': 'Saba_body', 'apron': 'Saba_apron',
         'arm.L': 'Saba_arm_L', 'arm.R': 'Saba_arm_R', 'leg.L': 'Saba_leg_L', 'leg.R': 'Saba_leg_R', 'tail': 'Saba_tail'}
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
           'ear.L': tuple(ear_info[1]['S']), 'ear.R': tuple(ear_info[-1]['S']), 'band': tuple(O), 'apron': (0, -.17, AP_TOP),
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
          'root': [0, 0, 0], 'hips': [0, .006, .270], 'spine': [0, .006, .340], 'chest': [0, .006, .420], 'neck': [0, .010, .500],
          'head_base': [0, .020, CHIN + .02], 'head': [float(v) for v in O],
          'jaw_pivot': [0, float(HY - .16 * W), float(CHIN + .15 * W)],
          'mouth_corners': {'L': [float(MHW + .006 * W), float(front_hit(MHW, CHIN + .186 * W)[0]), float(CHIN + .186 * W)],
                            'R': [float(-MHW - .006 * W), float(front_hit(-MHW, CHIN + .186 * W)[0]), float(CHIN + .186 * W)]},
          'eyes': eye_centers, 'brows': {'L': [BROW_X, float(front_hit(BROW_X, BROW_Z)[0]), BROW_Z], 'R': [-BROW_X, float(front_hit(-BROW_X, BROW_Z)[0]), BROW_Z]},
          'lashes': lash_info, 'ears': ears_j, 'arms': joint_arms, 'legs': joint_legs, 'tail': TAIL_JOINTS,
          'bandana': {'front_z': BAND_ZF, 'back_z': BAND_ZB, 'knot': [float(v) for v in KNOT_C],
                      'lobes': {'L': [float(v) for v in LOBES[1]], 'R': [float(v) for v in LOBES[-1]]}},
          'apron': {'top': [0, float(APRON_FRONT[-1, NCA // 2, 1]), AP_TOP], 'hem': [0, float(APRON_FRONT[0, NCA // 2, 1]), AP_BOT],
                    'pocket_top': [0, float(MIDP[-1, NCP // 2, 1]), PK_TOP]},
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth implicit ball (fitted superquadric + lower-face fullness + muzzle bump + nose button), radially projected, analytic normals.',
                    'Eyelid holes ringed by %d concentric loops each, rim rolled in behind separate lens eyeballs; 3 loops round the mouth, 4 round the nose.' % len(EYE_SCALES),
                    'Separate pieces: eyes, lash ribbons (origin at the eye centre, for the upper lids), ears, bandana + bow (rigid head follower), apron (hanging cloth + pocket, rows every ~1 cm), tail.',
                    'The shirt, trousers seat, waist tie and straps are Saba_body (chest / hips followers); trouser legs, ankles and feet are Saba_leg_L/R.']}
if not RIG:
    with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if RIG: raise_done = True
else:
  bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'sk-saba-toy.blend'))
  bpy.ops.object.select_all(action='DESELECT')
  for ob in objects: ob.select_set(True)
  bpy.context.view_layer.objects.active = objects[0]
  bpy.ops.export_scene.gltf(filepath=MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('SABA_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': MODEL}), flush=True)
