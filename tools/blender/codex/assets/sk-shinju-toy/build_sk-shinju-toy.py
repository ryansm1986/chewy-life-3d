"""Okami Shinju, the innkeeper of Shiokaze Port, a cream duck (Toybox zone villager, VL-2), phase-1 model.
Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_sk-shinju-toy.py [-- --fast]

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/sk-shinju-toy.glb (--fast: no toon refinement, writes scratch/sk-shinju-fast.glb instead).

Technique (Okami Fuku's machinery, with Kome's lash rolls; measure.md has the sheet's numbers):
- The head is ONE smooth implicit ball (domed cranium + a wide lower cheek mass + jaw, smooth-unioned, a soft trim;
  fitted to the sheet's front widths and side profile by scratch/fit_head.py). Its skin is the field's zero surface reached
  by radial projection (CDT in a stereographic domain, edge loops round both eyelid holes and round the bill root), so
  every vertex carries the field's analytic normal and the face stays convex. Flush lens eyeballs. No ears.
- The bill is two chunky SDF pieces: the upper bill (a broad rounded spatula, its lower lip cut on the smile curve,
  nostrils painted) and the lower bill (a separate piece for the jaw). Each has its own chart, painted from 3D positions.
- The upper lash line is its own object per eye (Shinju_lash_L/R): a thick tapered roll with two wing flicks.
- Blush and brows are painted in a face chart from 3D positions (front projection = the sheet's front view).
- The kimono top and the skirt are ONE lathe-like bell (blue above the obi, navy below, the border hidden under the
  obi). The yellow obi is a thick band; the cream apron waistband wraps round it with a rounded knot at the back; the
  apron is a thick cloth slab hanging from the band; the cream collar is a rounded ribbon (left panel over right).
- Boxy hanging kimono sleeves, cream wing-hands with three feather lobes, short orange legs, webbed orange feet with
  two toe grooves, a cream teardrop tail.
- One 2048 painted atlas: face, eyes, bills, the collar-V torso chart and 1-D shading ramps.
"""
import bpy, bmesh, math, json, os, sys, struct, zlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt
from mathutils.kdtree import KDTree

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
FAST = '--fast' in ARGV
RIG = bool(globals().get('RIG_MODE'))       # set by a later rig script: part labels; no approved file is written
if RIG: FAST = os.environ.get('RIG_FAST') == '1'
MODEL = 'D:/projects/chewy-life-3d/public/models/sk-shinju-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'sk-shinju-fast.glb') if FAST else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(5)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
LOG = {}

# ---------------------------------------------------------------- the sheet's measures (measure.md)
# turnaround: ground y 517, crown y 73.5 -> 1.05 m (422.4 px / m); front-view head 234 px at the cheeks -> W 0.554 m;
# chin y 257 -> 0.616 m. Head close-up: W = 294 px, chin y 781, features centred on x 196.
W = .554; CHIN = .616; HY = .000            # head width at the cheeks, chin height, head centre y (side view)
SW = W / .44                                # Rosie's metric detail sizes (authored at W 0.44) scale by SW

PAL = {'fur': '#FAEEDB', 'furdark': '#E8D3B6', 'furlight': '#FFF4E6',
       'bill': '#F39C20', 'billdark': '#DD8214', 'billlight': '#F7AE40',
       'billin': '#C9701E', 'billline': '#5A3A24',
       'kimono': '#3A7AB0', 'kimonodark': '#30699C', 'kimonolight': '#4A8AC0',
       'skirt': '#34486E', 'skirtdark': '#2C3D5E', 'skirtlight': '#3E537C',
       'obi': '#FFD24A', 'obidark': '#EDBA30', 'obilight': '#FFDC6C',
       'apron': '#FFF6EA', 'aprondark': '#EEDFCA', 'apronlight': '#FFF8EE',
       'iris': '#4A3020', 'pupil': '#24170F', 'sclera': '#FFF8EF', 'blush': '#F5B0A0',
       'lash': '#2A1C16', 'brow': '#7A5236'}
CHARTS = {'face': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'bill': (768, 0, 768, 768), 'billlo': (1280, 896, 512, 256),
          'torso': (0, 0, 768, 512)}
if RIG:   # phase-2 charts in unused atlas space (the approved paint is untouched)
    CHARTS.update({'lidU.L': (1536, 0, 256, 192), 'lidU.R': (1792, 0, 256, 192), 'lidD.L': (1536, 192, 256, 128), 'lidD.R': (1792, 192, 256, 128),
                   'cavity': (1536, 320, 128, 128), 'tongue': (1664, 320, 128, 128)})
PAINT_OPTS = {'blush': True}
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'bill': ('billdark', 'bill', 'billlight'),
         'billin': ('#A85A18', 'billin', '#D88032'), 'kimono': ('kimonodark', 'kimono', 'kimonolight'),
         'kimonoin': ('#204E78', '#275A86', '#2E6492'),
         'skirt': ('skirtdark', 'skirt', 'skirtlight'), 'obi': ('obidark', 'obi', 'obilight'),
         'apron': ('aprondark', 'apron', 'apronlight'), 'lash': ('#1E1410', 'lash', '#4A3A36')}
if RIG: RAMPS['floor'] = ('#4E1A1C', '#6A2426', '#7E3030')      # the mouth floor on the lower bill (rig)
RAMP_ROWS = {k: i for i, k in enumerate(RAMPS)}
def rgb(c):
    h = PAL.get(c, c).lstrip('#'); return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
def clamp(x): return np.clip(x, 0, 1)
def smooth(a, b, x):
    t = clamp((np.asarray(x, dtype=float) - a) / (b - a)); return t * t * (3 - 2 * t)
def smoother(a, b, x):
    t = clamp((np.asarray(x, float) - a) / (b - a)); return t * t * t * (t * (6 * t - 15) + 10)
def mix(a, b, t):
    t = np.asarray(t, dtype=float)
    return np.asarray(a) * (1 - t[..., None]) + np.asarray(b) * t[..., None]
def spow(x, p): return np.sign(x) * np.abs(x) ** p
def unit(v): return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)
def au(chart, u, v):
    x, y, w, h = CHARTS[chart]; g = 6
    return np.stack([(x + g + np.asarray(u, float) * (w - 2 * g)) / 2048, (y + g + np.asarray(v, float) * (h - 2 * g)) / 2048], -1)
def ramp_uv(name, val):
    x, y, w, h = CHARTS['ramp']; val = clamp(np.asarray(val, float))
    return np.stack([(x + 8 + val * (w - 16)) / 2048, np.full(val.shape, (y + RAMP_ROWS[name] * 32 + 16) / 2048)], -1)
def ramp_colour(name, u):
    lo, base, hi = [rgb(c) for c in RAMPS[name]]; u = clamp(np.asarray(u, float))
    return np.where((u < .5)[..., None], mix(lo, base, smooth(0, .5, u)), mix(base, hi, smooth(.5, 1, u)))
LIGHT = unit(np.array([-.22, -.35, 1.]))
def sval(n, occ=0., hi=.26, lo=.26):
    """painted soft shading: 0.5 = base colour, lighter toward the key light, darker below / occluded"""
    d = np.asarray(n) @ LIGHT
    return clamp(.50 + hi * smooth(.0, .95, d) - lo * smooth(.05, .95, -d) - occ)

# ---------------------------------------------------------------- SDF primitives
def ell(q, c, r):
    q = (q - np.asarray(c, float)) / np.asarray(r, float)
    k0 = np.sqrt((q * q).sum(-1)); k1 = np.sqrt(((q / np.asarray(r, float)) ** 2).sum(-1))
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)
def sell(q, c, r, p, pzlo=None, rzlo=None):
    """superellipsoid, first-order distance (value / |gradient|); optional flatter lower half (pzlo, rzlo)"""
    r = np.asarray(r, float); p = np.asarray(p, float); dq = q - np.asarray(c, float)
    rz = r[2] if rzlo is None else np.where(dq[..., 2] < 0, rzlo, r[2])
    pz = p[2] if pzlo is None else np.where(dq[..., 2] < 0, pzlo, p[2])
    a = np.abs(dq[..., 0]) / r[0] + 1e-12; b = np.abs(dq[..., 1]) / r[1] + 1e-12; c_ = np.abs(dq[..., 2]) / rz + 1e-12
    F = a ** p[0] + b ** p[1] + c_ ** pz; pm = (p[0] + p[1] + p[2]) / 3
    g = np.sqrt((p[0] * a ** (p[0] - 1) / r[0]) ** 2 + (p[1] * b ** (p[1] - 1) / r[1]) ** 2 + (pz * c_ ** (pz - 1) / rz) ** 2)
    return (F ** (1 / pm) - 1) / np.maximum((1 / pm) * F ** (1 / pm - 1) * g, 1e-9)
def smin(a, b, k):
    h = np.clip(.5 + .5 * (b - a) / k, 0, 1); return b * (1 - h) + a * h - k * h * (1 - h)
def smax(a, b, k): return -smin(-a, -b, k)
def capsule(p, a, b, r):
    a = np.asarray(a, float); b = np.asarray(b, float); ab = b - a
    t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(p - (a + t[..., None] * ab), axis=-1) - r

def grad(f, p, e=1.5e-4):
    g = np.zeros_like(p)
    for k in range(3):
        dp = np.zeros(3); dp[k] = e; g[:, k] = f(p + dp) - f(p - dp)
    return unit(g)
def ray_outer(f, o, d, t0=.0, t1=.8, steps=96, it=26):
    """outermost zero crossing of f along rays o + t d (o inside); vectorised"""
    o = np.broadcast_to(np.asarray(o, float), d.shape); ts = np.linspace(t1, t0, steps); n = len(d)
    P = o[:, None, :] + d[:, None, :] * ts[None, :, None]
    ins = (f(P.reshape(-1, 3)) < 0).reshape(n, steps); i = np.argmax(ins, 1)
    lo = ts[i]; hi = ts[np.maximum(i - 1, 0)]
    for _ in range(it):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return o + d * ((lo + hi) / 2)[:, None]
def ao(f, P, N, dist=.03):
    """cheap ambient occlusion from the field: 0 open .. 1 buried (other parts within dist along the normal)"""
    v = f(P + N * dist) / dist; return clamp(1 - v)

# ---------------------------------------------------------------- mesh plumbing
parts = {}
def make_obj(name, V, F, UV, group, N=None, recalc=True):
    """UV: per-vertex array (len V) or a list of per-face corner lists"""
    V = np.asarray(V, float)
    me = bpy.data.meshes.new(name); me.from_pydata(V.tolist(), [], [tuple(int(i) for i in f) for f in F]); me.update()
    uvl = me.uv_layers.new(name='Atlas')
    lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
    if isinstance(UV, list): uvs = np.array([c for f in UV for c in f], float)
    else: uvs = np.asarray(UV, float)[lv]
    uvl.data.foreach_set('uv', uvs.astype(np.float32).ravel())
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    if recalc:
        bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    if N is not None:
        a = me.attributes.new('cust_n', 'FLOAT_VECTOR', 'POINT')
        a.data.foreach_set('vector', unit(np.asarray(N, float)).astype(np.float32).ravel())
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    parts.setdefault(group, []).append(ob); return ob
def mesh_normals_uv(ob, fn):
    """per-vertex UVs from fn(V, N) after the mesh exists (Blender's smooth vertex normals)"""
    me = ob.data; me.update()
    Nn = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('normal', Nn); Nn = Nn.reshape(-1, 3)
    Vv = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', Vv); Vv = Vv.reshape(-1, 3)
    uvl = me.uv_layers['Atlas']; lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
    uvl.data.foreach_set('uv', np.asarray(fn(Vv, Nn), float)[lv].astype(np.float32).ravel())

def cube_sphere(n):
    """unit directions of a cube-sphere (equal-angle), shared vertices, outward quads"""
    t = np.tan(np.linspace(-PI / 4, PI / 4, n + 1)); key = {}; V = []; F = []
    def vid(p):
        k = tuple(np.round(p, 6))
        if k not in key: key[k] = len(V); V.append(p)
        return key[k]
    for axis in range(3):
        for sgn in (-1, 1):
            for i in range(n):
                for j in range(n):
                    q = []
                    for (a, b) in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)):
                        p = np.zeros(3); p[axis] = sgn; p[(axis + 1) % 3] = t[a]; p[(axis + 2) % 3] = t[b]
                        q.append(vid(unit(p)))
                    F.append(tuple(q) if sgn > 0 else tuple(q[::-1]))
    return np.array(V), F

def sdf_ball(name, f, centre, n, group, ramp, scale=(1, 1, 1), occ_f=None, occ_k=.35, shade=None, t1=.8, face_ramp=None):
    """mesh the zero set of f by radial projection of a cube-sphere from centre (analytic normals, ramp UVs).
    face_ramp(centres) -> list of ramp names per face (crisp colour blocks on face boundaries)"""
    D, F = cube_sphere(n); D = unit(D * np.asarray(scale, float))
    P = ray_outer(f, centre, D, t1=t1); N = grad(f, P)
    occ = occ_k * ao(occ_f, P, N) if occ_f is not None else 0.
    val = shade(P, N) if shade is not None else sval(N, occ)
    if face_ramp is None: uv = ramp_uv(ramp, val)
    else:
        names = face_ramp(np.array([P[list(f_)].mean(0) for f_ in F]))
        uv = [[tuple(ramp_uv(nm, val[i:i + 1])[0]) for i in f_] for f_, nm in zip(F, names)]
    return make_obj(name, P, F, uv, group, N), P, N

def catmull(points, t):
    pts = [np.asarray(p, float) for p in points]; n = len(pts) - 1; k = min(int(t * n), n - 1); f = t * n - k
    p0, p1, p2, p3 = pts[max(0, k - 1)], pts[k], pts[k + 1], pts[min(n, k + 2)]
    return .5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f ** 3)

def limb(name, points, radius, group, rings=14, sides=16, cap_rows=6, cap_len=.9, ramp='fur', occ_f=None, squash=1.0,
         ring_t=None, face_ramp=None, occ_k=.35, start_cap=True):
    """a tube along a Catmull-Rom centreline with bend loops; buried start fan; rounded (mitten) end cap.
    ring_t: explicit ring parameters (so colour borders land on loops); face_ramp(t_face) -> ramp name per face"""
    V = []; NV = []; rows = []; row_t = []
    old = None
    def frame(t):
        p = catmull(points, t); d = unit(catmull(points, min(1, t + .002)) - catmull(points, max(0, t - .002)))
        return p, d
    ts = ring_t if ring_t is not None else [j / rings for j in range(rings + 1)]
    for t in ts:
        p, d = frame(t)
        ref = np.array([0, 1., 0]) if abs(d[1]) < .95 else np.array([1., 0, 0])
        x = unit(np.cross(d, ref)) if old is None else unit(old - d * (old @ d)); y = np.cross(d, x); old = x
        r = radius(t); row = []
        for i in range(sides):
            a = 2 * PI * i / sides; q = p + x * (r * math.cos(a)) + y * (r * squash * math.sin(a))
            row.append(len(V)); V.append(q); NV.append(unit(x * math.cos(a) * squash + y * math.sin(a)))
        rows.append(row); row_t.append(t)
    p, d = frame(1.0); r = radius(1.0)
    for k in range(1, cap_rows):
        a = k / cap_rows * PI / 2; c = p + d * (r * cap_len * math.sin(a)); row = []
        for i in range(sides):
            b = 2 * PI * i / sides; q = c + (x * math.cos(b) + y * squash * math.sin(b)) * (r * math.cos(a))
            row.append(len(V)); V.append(q)
            NV.append(unit((x * math.cos(b) * squash + y * math.sin(b)) * math.cos(a) / max(squash, .5) + d * math.sin(a) / cap_len))
        rows.append(row); row_t.append(1 + k / cap_rows)
    tip = len(V); V.append(p + d * r * cap_len); NV.append(d)
    p0, d0 = frame(0.); st = len(V); V.append(p0 - d0 * radius(0.) * .3); NV.append(-d0)
    F = []; FT = []
    for k_, (a_, b_) in enumerate(zip(rows, rows[1:])):
        for i in range(sides): F.append((a_[i], a_[(i + 1) % sides], b_[(i + 1) % sides], b_[i])); FT.append((row_t[k_] + row_t[k_ + 1]) / 2)
    for i in range(sides): F.append((rows[-1][i], rows[-1][(i + 1) % sides], tip)); FT.append(2.0)
    if start_cap:
        for i in range(sides): F.append((rows[0][(i + 1) % sides], rows[0][i], st)); FT.append(-1.0)
    V = np.array(V); NV = np.array(NV)
    occ = occ_k * ao(occ_f, V, NV) if occ_f is not None else 0.
    val = sval(NV, occ)
    if face_ramp is None: uv = ramp_uv(ramp, val)
    else: uv = [[tuple(ramp_uv(face_ramp(ft), val[i:i + 1])[0]) for i in f_] for f_, ft in zip(F, FT)]
    return make_obj(name, V, F, uv, group, NV), V


# ================================================================ HEAD: the smooth ball (W units, z above the chin)
# fitted by scratch/fit_head.py to the sheet's front widths (1.00 W at z 0.265, 0.94 at 0.41, 0.75 at 0.61), the side
# profile (0.43 W deep in front and behind at the eyes) and the crown (0.784 W)
CR = ([0, .000, 0.4800], [0.4309, 0.4580, 0.3131], (2.0196, 2.0863, 1.8223))    # domed cranium
CK = ([0, -0.000, 0.2402], [0.5448, 0.5792, 0.2284], (2.8288, 2.2, 2.4046))   # the wide lower cheek mass
K_CK = 0.1639
MZ = ([0, -0.36, 0.1341], [0.215, 0.150, 0.215])
MZ_A = 0.0                                   # no muzzle: the bill is its own piece
JW = ([0, -0.1540, 0.0991], [0.4364, 0.3717, 0.0738]); K_JW = 0.05
TR = ([0, -0.0000, 0.3227], [0.5023, 0.4353, 0.4947]); K_TR = 0.0582

def head_local(q):
    d = smin(sell(q, *CR), sell(q, *CK), K_CK); d = smin(d, ell(q, *JW), K_JW)
    dz = q[..., 2] - MZ[0][2]; r = np.sqrt((q[..., 0] / MZ[1][0]) ** 2 + (dz / np.where(dz < 0, MZ[1][2], MZ[1][1])) ** 2)
    d = d - MZ_A * (1 - smoother(.22, 1, r)) * smooth(-.12, -.28, q[..., 1])
    return smax(d, ell(q, *TR), K_TR)
_g = np.stack(np.meshgrid(np.linspace(-.5, .5, 81), np.linspace(-.6, .6, 97), np.linspace(-.12, .12, 241), indexing='ij'), -1).reshape(-1, 3)
ZMIN = float(_g[head_local(_g) < 0][:, 2].min())
for blob in (CR, CK, MZ, JW, TR): blob[0][2] -= ZMIN
LOG['head_zmin_shift_W'] = round(ZMIN, 4)
def L2M(q): return np.stack([q[..., 0] * W, HY + q[..., 1] * W, CHIN + q[..., 2] * W], -1)
def M2L(p): return np.stack([p[..., 0] / W, (p[..., 1] - HY) / W, (p[..., 2] - CHIN) / W], -1)
def head_sdf(p): return head_local(M2L(p)) * W
def front_hit(x, z, f=head_sdf, y0=-.8, y1=.4):
    """first surface hit marching from the front (-y) at (x, z), metres, vectorised"""
    x = np.atleast_1d(np.asarray(x, float)); z = np.atleast_1d(np.asarray(z, float)); n = len(x)
    ys = np.linspace(y0, y1, 300)
    P = np.stack([np.repeat(x[:, None], len(ys), 1), np.broadcast_to(ys, (n, len(ys))), np.repeat(z[:, None], len(ys), 1)], -1).reshape(-1, 3)
    ins = (f(P) < 0).reshape(n, len(ys)); i = np.argmax(ins, 1); ok = ins[np.arange(n), i]
    lo = ys[np.maximum(i - 1, 0)]; hi = ys[i]
    for _ in range(26):
        m = (lo + hi) / 2; inn = f(np.stack([x, m, z], -1)) < 0
        hi = np.where(inn, m, hi); lo = np.where(inn, lo, m)
    return np.where(ok, (lo + hi) / 2, np.nan)
def top_hit(x, y, f=head_sdf, z0=1.3, z1=.6):
    """first surface hit marching down from above at (x, y)"""
    x = np.atleast_1d(np.asarray(x, float)); y = np.atleast_1d(np.asarray(y, float)); n = len(x)
    zs = np.linspace(z0, z1, 240)
    P = np.stack([np.repeat(x[:, None], len(zs), 1), np.repeat(y[:, None], len(zs), 1), np.broadcast_to(zs, (n, len(zs)))], -1).reshape(-1, 3)
    ins = (f(P) < 0).reshape(n, len(zs)); i = np.argmax(ins, 1); ok = ins[np.arange(n), i]
    hi = zs[np.maximum(i - 1, 0)]; lo = zs[i]
    for _ in range(26):
        m = (lo + hi) / 2; inn = f(np.stack([x, y, m], -1)) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return np.where(ok, (lo + hi) / 2, np.nan)
O = np.array([0, HY, CHIN + .36 * W])
def radial_hit(d, f=head_sdf, o=O, t0=.02, t1=.75, it=34):
    lo = np.full(len(d), t0); hi = np.full(len(d), t1)
    for _ in range(it):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return o + d * ((lo + hi) / 2)[:, None]
def radial_hit_outer(d, f=head_sdf, o=O): return ray_outer(f, o, d, t0=.02, t1=.75, steps=90)
def grad_n(p, f=head_sdf): return grad(f, p)
def to_dom(d):
    den = 1 - d[:, 1]; return np.stack([2 * d[:, 0] / den, 2 * d[:, 2] / den], -1)
def from_dom(uv):
    r2 = (uv * uv).sum(1); den = 4 + r2
    return np.stack([4 * uv[:, 0] / den, -(4 - r2) / den, 4 * uv[:, 1] / den], -1)
AMAX = math.radians(118)
def head_uv(d):
    a = np.arccos(np.clip(-d[:, 1], -1, 1)); psi = np.arctan2(d[:, 2], d[:, 0]); r = np.minimum(a / AMAX, 1) * .5
    return np.stack([.5 + r * np.cos(psi), .5 + r * np.sin(psi)], -1)
def head_uv_dir(U, V):
    du = U - .5; dv = V - .5; a = np.minimum(np.sqrt(du * du + dv * dv) * 2, 1) * AMAX; psi = np.arctan2(dv, du)
    return np.stack([np.sin(a) * np.cos(psi), -np.cos(a), np.sin(a) * np.sin(psi)], -1)

# ---------------------------------------------------------------- face layout (front projection, metres; measure.md)
# eyes: opening 0.190 x 0.204 W (tall), centres +-0.211 W at z 0.388 (the head close-up)
EX = .211 * W; EZ = CHIN + .388 * W; EHW = .095 * W; EHH = .102 * W; EN = 2.15
def eye_unit(psi):
    return spow(np.cos(psi), 2 / EN), spow(np.sin(psi), 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
BROW_X = .233 * W; BROW_Z = CHIN + .606 * W; BROW_L = .072 * W
BLUSH = (.335 * W, CHIN + .245 * W, .061 * W, .039 * W)
def chaikin(P, n=3, closed=True):
    P = np.asarray(P, float)
    for _ in range(n):
        Q = np.roll(P, -1, 0) if closed else P[1:]
        A = P if closed else P[:-1]
        R = np.empty((2 * len(A), 2)); R[0::2] = .75 * A + .25 * Q; R[1::2] = .25 * A + .75 * Q
        P = R if closed else np.concatenate([P[:1], R, P[-1:]])
    return P

# ---------------------------------------------------------------- THE BILL (head-local W units; measure.md)
# front view: 0.43 W wide (corners +-0.214 at z 0.20), top 0.330, the smile line 0.150 at the centre rising to 0.20 at
# the corners, the lower bill showing below it to 0.109. Side view: the tip 0.594 W ahead of the head centre at z 0.208.
BU_C = np.array([0, -.448, .215]); BU_R = (.214, .150, .115); BU_P = (2.7, 2.3, 2.2)
BL_C = np.array([0, -.430, .162]); BL_R = (.152, .150, .057); BL_P = (2.1, 2.3, 2.0)
K_LIP = .014
def lip_z(x, y):
    """the smile surface between the bills (z, W): 0.14 at the root, ~0.155 at the front centre, rising to the corners"""
    return .140 + .045 * np.minimum((x / .19) ** 4, 1.3) + .020 * smooth(-.48, -.60, y)
def bill_top(y): return .325 + (y + .43) * .45          # the upper bill's top slopes down from the face to the tip
def bill_up_local(q):
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    sx = 1 - .46 * smooth(.235, .30, z)                  # the front view's arched top (the sheet's half-widths per row)
    d = sell(np.stack([x / sx, y, z], -1), BU_C, BU_R, BU_P)
    d = smax(d, z - bill_top(y), .02)
    return smax(d, lip_z(x, y) - z, K_LIP)
def bill_lo_local(q):
    d = sell(q, BL_C, BL_R, BL_P)
    return smax(d, q[..., 2] - (lip_z(q[..., 0], q[..., 1]) + .012), .010)

def bill_up_sdf(p): return bill_up_local(M2L(p)) * W
def bill_lo_sdf(p): return bill_lo_local(M2L(p)) * W
def bill_sdf(p): return np.minimum(bill_up_sdf(p), bill_lo_sdf(p))

# ---------------------------------------------------------------- the fur shade (shared by the face chart and the ramps)
def head_occ(P, n): return np.zeros(len(P))
def head_shade(P, n): return sval(n, head_occ(P, n), hi=.08, lo=.24)       # the crown lightens at most ~+5% (no hue shift)

# ================================================================ HEAD SKIN: CDT on the ball, eyelid and bill-root loops
def in_poly(P, poly):
    x = P[:, 0]; y = P[:, 1]; inside = np.zeros(len(P), bool); n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        inside ^= ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-30) + x1)
    return inside
pts = []; cons = []; tags = {}
def add_loop(P, tag, closed=True):
    i0 = len(pts); pts.extend([tuple(p) for p in P]); n = len(P)
    for i in range(n if closed else n - 1): cons.append((i0 + i, i0 + (i + 1) % n))
    tags[tag] = list(range(i0, i0 + n)); return tags[tag]
def surf_dir(x, z):
    y = front_hit(x, z); return unit(np.stack([np.asarray(x, float) * np.ones_like(y), y, np.asarray(z, float) * np.ones_like(y)], -1) - O)
NE = 44
EYE_SCALES = [1.0, 1.075, 1.16, 1.25, 1.35]
eye_dom = {}
for s in (-1, 1):
    psi = np.linspace(0, 2 * PI, NE, endpoint=False)
    x, z = eye_xz(s, psi); base = to_dom(surf_dir(x, z)); c = to_dom(surf_dir(np.array([s * EX]), np.array([EZ])))[0]
    eye_dom[s] = (c, base)
    wn = 1 - .50 * smooth(-.10, -.80, np.cos(psi)) - .25 * smooth(-.2, -.9, np.sin(psi))   # tighter toward the nose and the muzzle
    for k, kk in enumerate(EYE_SCALES): add_loop(c + (base - c) * (1 + (kk - 1) * wn[:, None]), 'eye%d_%d' % (s, k))
# the bill root: where the bill (both pieces) leaves the head skin, marched outward per angle in the front projection;
# three loops inside it (hidden under the bill; the rig can cut the mouth on them), no fill points inside
ROOT_ZC = .215; NRT = 48
_th = np.linspace(0, 2 * PI, NRT, endpoint=False); _t = np.linspace(0, .30, 241)
_x = (_t[None, :] * np.cos(_th)[:, None]) * W; _z = CHIN + (ROOT_ZC + .8 * _t[None, :] * np.sin(_th)[:, None]) * W
_y = front_hit(_x.ravel(), _z.ravel()).reshape(_x.shape); _P = np.stack([_x, _y, _z], -1).reshape(-1, 3)
_in = (bill_sdf(_P) < 0).reshape(_x.shape); _in[:, 0] = True
ROOT_R = _t[np.argmin(_in, 1)]                       # first t outside the bill, per angle (W)
def root_xz(k, th=_th): return np.cos(th) * ROOT_R * k * W, CHIN + (ROOT_ZC + .8 * np.sin(th) * ROOT_R * k) * W
ROOT_SCALES = [.80, .89, .96]
for k, kk in enumerate(ROOT_SCALES): add_loop(to_dom(surf_dir(*root_xz(kk))), 'mouth_%d' % k)
LOG['bill_root_W'] = {'top_z': round(float(ROOT_ZC + .8 * ROOT_R[NRT // 4]), 3), 'bottom_z': round(float(ROOT_ZC - .8 * ROOT_R[3 * NRT // 4]), 3),
                      'half_width': round(float(ROOT_R[0]), 3)}
ROOT_POLY = np.stack(root_xz(1.03), -1)
NB = 64; AB = math.radians(150)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
def fib(n):
    ii = np.arange(n) + .5; phi = np.arccos(1 - 2 * ii / n); th = PI * (1 + 5 ** .5) * ii
    return np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
NF = 1500 if FAST else 1800
D = fib(NF); D = D[np.arccos(np.clip(-D[:, 1], -1, 1)) < math.radians(147.)]
D2 = fib(6400 if FAST else 6600); D2 = D2[np.arccos(np.clip(-D2[:, 1], -1, 1)) < math.radians(62)]
P2 = radial_hit(D2)
band2 = (np.abs(P2[:, 0]) < .46 * W) & (P2[:, 2] > CHIN + .04 * W) & (P2[:, 2] < CHIN + .58 * W)
D2 = D2[band2]; P2 = P2[band2]
Pf0 = radial_hit(D)
inband = (np.abs(Pf0[:, 0]) < .46 * W) & (Pf0[:, 2] > CHIN + .06 * W) & (Pf0[:, 2] < CHIN + .56 * W) & (np.arccos(np.clip(-D[:, 1], -1, 1)) < math.radians(62))
D = np.concatenate([D[~inband], D2]); Pf = np.concatenate([Pf0[~inband], P2]); keep = np.ones(len(D), bool)
dom = to_dom(D)
def eye_ring_rr(dp):
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
keep &= ~(front & in_poly(Pf[:, [0, 2]], ROOT_POLY))
fill0 = len(pts); pts.extend([tuple(p) for p in dom[keep]])
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
    bnd = dom_out[[out_of[k] for k in tags['bound']]]
    hole |= ~in_poly(cent, bnd)
    return dom_out, F[~hole], out_of

if not FAST:
    # toon light: the game's hard light / shade band follows the interpolated normal; refine where its misplacement
    # (interpolation error / normal turning rate) is largest, after coarsening where the band is exact anyway.
    BARY = np.array([[1 / 3, 1 / 3, 1 / 3], [.6, .2, .2], [.2, .6, .2], [.2, .2, .6], [.5, .5, 0], [.5, 0, .5], [0, .5, .5]])
    def tri_errors(dom_out, F):
        Pv = radial_hit_outer(from_dom(dom_out)); Nv = grad_n(Pv); Pt = Pv[F]; Nt = Nv[F]
        nm = unit(Nt.mean(1)); seen = np.maximum(-nm[:, 1], -.707 * nm[:, 1] + .707 * nm[:, 2]) > .05
        vis = (Pt[:, :, 1] < HY + .02).all(1) & seen
        err = np.zeros(len(F)); disp = np.zeros(len(F)); idx = np.where(vis)[0]
        q = np.einsum('kj,tjc->tkc', BARY, Pt[idx]); nq = np.einsum('kj,tjc->tkc', BARY, Nt[idx])
        nq /= np.linalg.norm(nq, axis=2, keepdims=True)
        qq = q.reshape(-1, 3).copy()
        for _ in range(3): qq = qq - head_sdf(qq)[:, None] * grad_n(qq)
        a = grad_n(qq).reshape(q.shape)
        e = np.arccos(np.clip((a * nq).sum(2), -1, 1)).max(1)
        kap = np.full(len(idx), 2.0)
        for i, j in ((0, 1), (1, 2), (2, 0)):
            ang_ = np.arccos(np.clip((Nt[idx, i] * Nt[idx, j]).sum(1), -1, 1)); ln = np.linalg.norm(Pt[idx, i] - Pt[idx, j], axis=1)
            kap = np.maximum(kap, ang_ / np.maximum(ln, 1e-5))
        err[idx] = np.degrees(e); disp[idx] = e / kap * 1000
        return err, disp, vis, Pv
    def stats_(err, disp, vis):
        return {'visible_tris': int(vis.sum()), 'err_mean_deg': round(float(err[vis].mean()), 3), 'err_p90_deg': round(float(np.percentile(err[vis], 90)), 3),
                'band_disp_p90_mm': round(float(np.percentile(disp[vis], 90)), 3), 'band_disp_max_mm': round(float(disp[vis].max()), 3)}
    REFINE_ADD = 260; D_LOW, D_T = .12, .45
    dom_out, F, out_of = skin_cdt(pts); err, disp, vis, Pv = tri_errors(dom_out, F)
    LOG['head_refine_before'] = stats_(err, disp, vis)
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
    for it in range(14):
        dom_out, F, out_of = skin_cdt(pts); err, disp, vis, Pv = tri_errors(dom_out, F)
        bad = np.where(vis & (disp > D_T))[0]
        if not len(bad) or n_add >= budget: break
        bad = bad[np.argsort(-disp[bad])]
        kd = KDTree(len(Pv))
        for i_, p_ in enumerate(Pv): kd.insert(p_, i_)
        kd.balance()
        taken = []; taken_p = []
        for t in bad:
            if len(taken) >= min(max(60, budget // 6), budget - n_add): break
            c_ = dom_out[F[t]].mean(0)
            if eye_ring_rr(c_[None])[0] <= .72: continue
            if in_poly(Pv[F[t]].mean(0)[None][:, [0, 2]], ROOT_POLY)[0] and Pv[F[t]].mean(0)[1] < HY: continue
            cp = Pv[F[t]].mean(0); le = max(np.linalg.norm(Pv[F[t][i]] - Pv[F[t][(i + 1) % 3]]) for i in range(3))
            if kd.find(cp)[2] < .30 * le: continue
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
# the back cap (beyond the CDT boundary at 150 deg): structured rings to the back pole
prev = [out_of[k] for k in tags['bound']]
for a, nb in [(155, NB), (160, NB), (165, NB), (170, NB // 2), (175, NB // 2)]:
    A = math.radians(a); ps = np.linspace(0, 2 * PI, nb, endpoint=False)
    d = np.stack([np.sin(A) * np.cos(ps), -np.cos(A) * np.ones(nb), np.sin(A) * np.sin(ps)], -1)
    p = radial_hit_outer(d); nn = grad_n(p); i0 = len(verts)
    verts += [tuple(v) for v in p]; vdir += list(d); vnorm += list(nn); cur = list(range(i0, i0 + nb))
    if len(prev) == 2 * nb:
        for i in range(nb):
            faces.append((prev[2 * i], prev[2 * i + 1], cur[i])); faces.append((prev[2 * i + 1], prev[(2 * i + 2) % len(prev)], cur[i]))
            faces.append((prev[(2 * i + 2) % len(prev)], cur[(i + 1) % nb], cur[i]))
    else:
        for i in range(nb): faces.append((prev[i], prev[(i + 1) % nb], cur[(i + 1) % nb], cur[i]))
    prev = cur
pd = np.array([[0, 1., 0]]); pp = radial_hit_outer(pd); pole = len(verts)
verts.append(tuple(pp[0])); vdir.append(pd[0]); vnorm.append(grad_n(pp)[0])
for i in range(len(prev)): faces.append((prev[i], prev[(i + 1) % len(prev)], pole))
# eyelid roll: the hole edge tucks into the head behind the lens globe (no visible gap)
roll_info = {}
for s in (-1, 1):
    rim = [out_of[k] for k in tags['eye%d_0' % s]]
    E = np.array([s * EX, float(front_hit(s * EX, EZ)[0]), EZ]); i0 = len(verts); rr = []
    for k, vi in enumerate(rim):
        P = np.array(verts[vi]); n = np.array(vnorm[vi]); t = E - P; t = t - n * (t @ n); t /= np.linalg.norm(t)
        verts.append(tuple(P - .0045 * SW * n + .0016 * SW * t)); vdir.append(vdir[vi]); vnorm.append(n if RIG else unit(.30 * n + t)); rr.append(i0 + k)   # rig: the skin's normal (no grey ring round a shut eye)
    for k in range(NE):
        faces.append((rim[k], rim[(k + 1) % NE], rr[(k + 1) % NE], rr[k]))
    roll_info[s] = (rim, rr)
vdir = np.array(vdir); vnorm = np.array(vnorm); VP = np.array(verts)
alpha_v = np.arccos(np.clip(-unit(vdir)[:, 1], -1, 1))
huv = au('face', *head_uv(unit(vdir)).T)
ruv = ramp_uv('fur', head_shade(VP, vnorm))
uvs = []
for f in faces:
    if max(alpha_v[i] for i in f) < math.radians(116): uvs.append([tuple(huv[i]) for i in f])
    else: uvs.append([tuple(ruv[i]) for i in f])
skin = make_obj('head_skin', VP, faces, uvs, 'head', vnorm)
LOG['skin_vertices'] = len(verts); LOG['skin_faces'] = len(faces)

# ================================================================ EYES: flush lens globes following the ball
ES = [0, .12, .25, .38, .51, .63, .74, .84, .92, .98, 1.10]
NSEG = 24
eye_centers = {}; eye_axes = {}
def eye_h(k): return (.0016 - .0042 * k * k) * SW
for s, tag in ((-1, 'R'), (1, 'L')):
    psi = np.linspace(0, 2 * PI, NSEG, endpoint=False); rows = []
    cx = s * EX; Sc = np.array([cx, float(front_hit(cx, EZ)[0]), EZ]); axis = grad_n(Sc[None])[0]
    for k in ES:
        if k == 0: x = np.array([cx]); z = np.array([EZ])
        else: x, z = eye_xz(s, psi, k)
        y = front_hit(x, z); S = np.stack([x, y, z], -1); n = grad_n(S); rows.append(S + n * eye_h(k))
    rim = rows[-1]
    for depth, sc in [(.010 * SW, .86), (.020 * SW, .58)]: rows.append(Sc + (rim - Sc) * sc - axis * depth)
    tip = Sc - axis * .026 * SW
    def euv(px, pz): return (.5 + (px - cx) / (2.4 * EHW), .5 + (pz - EZ) / (2.4 * EHH))
    V = [rows[0][0]]; UVs = [euv(cx, EZ)]
    for j, r in enumerate(rows[1:]):
        kk = min(j + 1, len(ES) - 1); x, z = eye_xz(s, psi, ES[kk])
        for i in range(NSEG): V.append(r[i]); UVs.append(euv(x[i], z[i]))
    V.append(tip); UVs.append(UVs[-1])
    nr = len(rows) - 1; ix = lambda j, i: 1 + j * NSEG + i % NSEG
    fs = [(0, ix(0, i), ix(0, i + 1)) for i in range(NSEG)]
    for j in range(nr - 1):
        for i in range(NSEG): fs.append((ix(j, i), ix(j + 1, i), ix(j + 1, i + 1), ix(j, i + 1)))
    last = len(V) - 1
    for i in range(NSEG): fs.append((ix(nr - 1, i), last, ix(nr - 1, i + 1)))
    UVa = au('eye.' + tag, *np.array(UVs).T)
    make_obj('eyeball.' + tag, np.array(V), fs, UVa, 'eye.' + tag)
    eye_centers[tag] = [float(v) for v in (Sc - axis * .013 * SW)]; eye_axes[tag] = axis
    LOG['eye_axis_' + tag] = {'out_deg': round(math.degrees(math.atan2(s * axis[0], -axis[1])), 1),
                              'down_deg': round(math.degrees(math.asin(-axis[2])), 1)}

# ================================================================ THE BILL: two chunky SDF pieces with their own charts
# (the upper bill rides the head; the lower bill is its own piece for the jaw). UVs: an azimuthal map of the direction
# from the piece's centre (around -y), painted per texel from the 3D surface point (the lip line, the nostrils).
BILL_PIECES = {'bill': (bill_up_sdf, L2M(np.array([0, -.470, .225])), 'bill', 16 if not FAST else 14),
               'billlo': (bill_lo_sdf, L2M(np.array([0, -.455, .135])), 'jaw', 10 if not FAST else 10)}
BAMAX = math.radians(165)
def bill_uv(d):
    a = np.arccos(np.clip(-d[:, 1], -1, 1)); psi = np.arctan2(d[:, 2], d[:, 0]); r = np.minimum(a / BAMAX, 1) * .5
    return np.stack([.5 + r * np.cos(psi), .5 + r * np.sin(psi)], -1)
def bill_uv_dir(U, V):
    du = U - .5; dv = V - .5; a = np.minimum(np.sqrt(du * du + dv * dv) * 2, 1) * BAMAX; psi = np.arctan2(dv, du)
    return np.stack([np.sin(a) * np.cos(psi), -np.cos(a), np.sin(a) * np.sin(psi)], -1)
def bill_occ(P, N): return .30 * ao(head_sdf, P, N, .018)
def build_bill(key):
    f, c, group, n = BILL_PIECES[key]
    D, F = cube_sphere(n); D = unit(D * np.array([1., .75, .55]))
    P = ray_outer(f, c, D, t1=.22, steps=120); N = grad(f, P)
    a_v = np.arccos(np.clip(-D[:, 1], -1, 1))
    cuv = au(key, *bill_uv(D).T); ruv = ramp_uv('billin', sval(N, .2))
    uvs = []
    for f_ in F:
        if max(a_v[i] for i in f_) < BAMAX - .02: uvs.append([tuple(cuv[i]) for i in f_])
        else: uvs.append([tuple(ruv[i]) for i in f_])          # buried in the head
    if False and RIG and key == 'billlo':   # (unused: face-level blocks read jagged) the lower bill's top (inside the mouth): crisp ramp blocks, the floor dark, the rim orange
        q = M2L(P); dzl = q[:, 2] - lip_z(q[:, 0], q[:, 1]); val = sval(N, .1, hi=.10, lo=.18); sdu = bill_up_sdf(P)
        for fi, f_ in enumerate(F):
            f_ = list(f_)
            if dzl[f_].mean() > -.003:
                nm = 'floor' if (N[f_, 2].mean() > .55 and sdu[f_].mean() < -.0015) else 'bill'
                uvs[fi] = [tuple(ramp_uv(nm, val[i:i + 1])[0]) for i in f_]
    ob = make_obj('bill_upper' if key == 'bill' else 'bill_lower', P, F, uvs, group, N)
    return ob, P
_, BILL_UP_V = build_bill('bill')
_, BILL_LO_V = build_bill('billlo')

def paint_bill(key, U, V):
    f, c, group, n = BILL_PIECES[key]
    d = bill_uv_dir(U.ravel(), V.ravel()); P = ray_outer(f, c, d, t1=.22, steps=120); N = grad(f, P)
    q = M2L(P); x, y, z = q[:, 0], q[:, 1], q[:, 2]; lz = lip_z(x, y)
    C = ramp_colour('bill', sval(N, bill_occ(P, N), hi=.14, lo=.22))
    if key == 'bill':
        # the mouth roof (the underside, inside the lip): seen only when the jaw opens
        inner = smooth(-.30, -.60, N[:, 2]) * smooth(.016, .006, z - lz)
        C = mix(C, ramp_colour('billin', sval(N, .1)), inner)
        if RIG: C = mix(C, rgb('#6e2828'), inner * smooth(-.0005, -.0030, bill_lo_sdf(P)))     # the palate: only where the lower bill hides it at rest
        # the smile line: a thin dark band on the rounded lower lip, facing forward / down, fading into the face
        band = (1 - smooth(.0042, .0068, np.abs(z - lz - .0065))) * smooth(-.36, -.42, y) * smooth(-.75, -.45, N[:, 2])
        C = mix(C, rgb('billline'), .95 * band * (1 - inner))
        # the nostrils: two small dark ovals on the top (the front view's x +-0.052 W, z 0.266 W)
        for s in (-1, 1):
            r = np.sqrt(((x - s * .052) / .0105) ** 2 + ((z - .266) / .0085) ** 2)
            C = mix(C, rgb('billline'), .92 * (1 - smooth(.80, 1.15, r)) * smooth(-.10, -.35, N[:, 1]))
    else:
        top = smooth(-.004, .006, z - lz)                  # the hidden top (inside the mouth)
        C = mix(C, ramp_colour('billin', sval(N, .1)), top)
        if RIG:   # the mouth floor (hidden inside the upper bill at rest); the rounded rim stays bill orange
            fl = smooth(.002, .007, z - lz) * smooth(-.0008, -.0035, bill_up_sdf(P))
            C = mix(C, ramp_colour('floor', sval(N, .1, hi=.10, lo=.18)), fl)
        C = mix(C, C * .82, smooth(-.020, -.004, z - lz - .012) * (1 - top))      # a soft contact shade under the lip
    return C.reshape(U.shape + (3,))

# ============================================================== LASH ROLLS: the upper lash line + two wing flicks (as Kome)
# The sheet (measure.md): ~0.032 W thick over the top, swelling at the outer upper corner, running down the outer side to
# ~0.5 of the half-height below the eye's middle, two flicks at the outer top. A flattened tapered roll lying on the skin,
# its inner edge just inside the lid hole (over the lens edge). Separate objects (origin at the eye centre) so the rig can
# hang them on the upper lids. Nothing of the lash is painted on the skin.
LASH_PSI = np.radians(np.linspace(150, -42, 36))         # inner top -> over the top -> down the outer side
def lash_th(psi):      # thickness in eye-radius units (the opening's superellipse radius)
    d = np.degrees(psi)
    th = .30 + .08 * np.exp(-((d - 35) / 30) ** 2)
    th = th * (1 - .62 * smooth(18, -36, d))
    return th * smooth(152, 118, d) * smooth(-45, -5, d) + .02
LASH_WINGS = [((50, .95), (1.45, .96)), ((24, .95), (1.60, .44))]    # (root psi deg, root k), tip (X outer, Z) eye units
def eye_pt(s, X, Z):
    """eye units (X > 0 outer) -> skin point, its normal"""
    x = s * EX + s * EHW * np.asarray(X, float); z = EZ + EHH * np.asarray(Z, float)
    y = front_hit(x, z); S = np.stack([x, y, z], -1); return S, grad_n(S)
def lash_ribbon(C, n, hw, hp, NLS=6, embed=.0012 * W):
    """flattened lens-section tube along skin points C with skin normals n; returns verts, faces, normals"""
    tg = np.gradient(C, axis=0); tg = unit(tg - n * (tg * n).sum(1, keepdims=True)); sd = unit(np.cross(n, tg))
    V = []; NV = []; NT = len(C)
    for i in range(NT):
        for k in range(NLS):
            a = 2 * PI * k / NLS; ca, sa = math.cos(a), math.sin(a)
            up = hp[i] * (sa if sa > 0 else (1.8 if RIG else .40) * sa)      # rig: a deep roll (its back inside the skin at rest) reads thick when shut
            V.append(C[i] + sd[i] * hw[i] * ca + n[i] * (up - embed))
            NV.append(unit(sd[i] * ca / max(hw[i], 1e-4) + n[i] * sa / max(hp[i], 1e-4)))
    V = np.array(V); NV = np.array(NV)
    tip = len(V); V = np.vstack([V, C[-1] + tg[-1] * hw[-1] * .7 + n[-1] * (.2 * hp[-1] - embed)]); NV = np.vstack([NV, tg[-1]])
    root = len(V); V = np.vstack([V, C[0] - tg[0] * hw[0] * .7 + n[0] * (.2 * hp[0] - embed)]); NV = np.vstack([NV, -tg[0]])
    F = []
    for i in range(NT - 1):
        for k in range(NLS):
            a_, b_ = i * NLS + k, i * NLS + (k + 1) % NLS; F.append((a_, b_, b_ + NLS, a_ + NLS))
    for k in range(NLS): F.append(((NT - 1) * NLS + k, (NT - 1) * NLS + (k + 1) % NLS, tip))
    for k in range(NLS): F.append(((k + 1) % NLS, k, root))
    return V, F, NV
lash_info = {}; LASH_FLICK_PTS = {}      # (rig) the flick vertices and their root-to-tip parameter
for s, tag in ((-1, 'R'), (1, 'L')):
    th = lash_th(LASH_PSI); k_in = .965
    ux, uz = eye_unit(LASH_PSI)
    Pin, _ = eye_pt(s, ux * k_in, uz * k_in); Pout, _ = eye_pt(s, ux * (k_in + th), uz * (k_in + th))
    Cm, nm = eye_pt(s, ux * (k_in + th / 2), uz * (k_in + th / 2))
    hw = np.linalg.norm(Pout - Pin, axis=1) / 2
    tt = np.linspace(0, 1, len(LASH_PSI))
    hp = (.0090 * W) * (.55 + .45 * smooth(0, .25, tt)) * (1 - .55 * smooth(.70, 1.0, tt))
    V, F, NV = lash_ribbon(Cm, nm, hw, hp)
    allV = [V]; allF = [F]; allN = [NV]; off = len(V); flick_pts = []
    for (rpsi, rk), (tx, tz) in LASH_WINGS:
        rp = math.radians(rpsi); rux, ruz = eye_unit(np.array([rp]))
        thr = lash_th(np.array([rp]))[0]
        R0 = np.array([rux[0] * (k_in + thr * .45), ruz[0] * (k_in + thr * .45)])
        T0 = np.array([tx, tz])
        mid = R0 + (T0 - R0) * .5 + np.array([-.06, .08])         # a slight upward curl
        ws = np.linspace(0, 1, 11)
        XZ = np.array([(1 - w) ** 2 * R0 + 2 * (1 - w) * w * mid + w * w * T0 for w in ws])
        Cw, nw = eye_pt(s, XZ[:, 0], XZ[:, 1])
        hww = (.0155 * W) * (1 - ws) ** .9 + .0013 * W
        hpw = (.0078 * W) * (1 - .75 * ws)
        Vw, Fw, NVw = lash_ribbon(Cw, nw, hww, hpw, NLS=6)
        allV.append(Vw); allF.append([tuple(i + off for i in f) for f in Fw]); allN.append(NVw); off += len(Vw)
        flick_pts += [(Vw[i], float(t_)) for i, t_ in enumerate(list(np.repeat(ws, 6)) + [1., 0.])]
    V = np.vstack(allV); NV = np.vstack(allN); F = [f for FF in allF for f in FF]
    ax_ = eye_axes[tag]; fac = clamp(.5 + .5 * (NV @ ax_))
    luv = ramp_uv('lash', .25 + .5 * fac)
    make_obj('lash_line.' + tag, V, F, [[tuple(luv[i]) for i in f] for f in F], 'lash.' + tag, NV)
    LASH_FLICK_PTS[tag] = flick_pts
    lash_info[tag] = dict(top=[float(v) for v in Cm[np.argmax(Cm[:, 2])]], outer_end=[float(v) for v in Cm[-1]],
                          max_proud_W=round(float(hp.max() / W), 4), thick_top_W=round(float(2 * hw[np.argmax(Cm[:, 2])] / W), 4))
LOG['lash'] = lash_info


# ================================================================ BODY: the kimono + skirt bell (one lathe)
def pchip(xk, yk, x):
    """monotone cubic (Fritsch-Carlson) through the profile table"""
    xk = np.asarray(xk, float); yk = np.asarray(yk, float); x = np.asarray(x, float)
    h = np.diff(xk); dl = np.diff(yk) / h; m = np.zeros(len(xk))
    for i in range(1, len(xk) - 1):
        if dl[i - 1] * dl[i] > 0:
            w1 = 2 * h[i] + h[i - 1]; w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / dl[i - 1] + w2 / dl[i])
    m[0] = dl[0]; m[-1] = dl[-1]
    xc = np.clip(x, xk[0], xk[-1]); i = np.clip(np.searchsorted(xk, xc) - 1, 0, len(h) - 1); t = (xc - xk[i]) / h[i]
    return ((2 * t ** 3 - 3 * t ** 2 + 1) * yk[i] + (t ** 3 - 2 * t ** 2 + t) * h[i] * m[i] + (-2 * t ** 3 + 3 * t ** 2) * yk[i + 1]
            + (t ** 3 - t ** 2) * h[i] * m[i + 1])
# the bell's sections (metres): z, half-width a (front view), front depth bf, back depth bb (side view, from the leg axis)
# measured on the turnaround (measure.md): the navy skirt 0.57 m wide at the hem (z 0.125; -0.25 / +0.20 deep), gathered
# in under the obi (0.33 wide), the blue kimono chest under the sleeves, the neck in the head. The body sits a little
# forward of the legs (the obi spans y -0.206 .. +0.12 in the side view).
BELL = [(.125, .286, .250, .198), (.160, .283, .247, .196), (.200, .273, .242, .190), (.250, .259, .235, .182),
        (.300, .240, .225, .166), (.320, .224, .217, .152), (.335, .200, .207, .134), (.347, .172, .198, .118),
        (.360, .155, .192, .109), (.400, .148, .189, .105), (.440, .146, .188, .103), (.480, .148, .188, .104),
        (.505, .156, .190, .104), (.530, .161, .188, .106), (.560, .160, .180, .106), (.585, .150, .166, .102),
        (.605, .130, .142, .092), (.625, .092, .102, .070), (.645, .025, .030, .022)]
BZ, BA, BF, BB = [np.array(c, float) for c in zip(*BELL)]
Z_BOT, Z_TOP = float(BZ[0]), float(BZ[-1])
Z_HEM = .420                 # the colour border (navy skirt below, blue kimono above), hidden under the obi (an edge loop)
def bell_n(z): return 2.3 + 0 * np.asarray(z, float)
def bell_r(phi, z, lip=True):
    z = np.asarray(z, float); phi = np.asarray(phi, float)
    a = pchip(BZ, BA, z); bf = pchip(BZ, BF, z); bb = pchip(BZ, BB, z); n = bell_n(z)
    c = np.cos(phi); s = np.sin(phi); b = np.where(c > 0, bf, bb)
    return 1 / ((np.abs(s) / a) ** n + (np.abs(c) / b) ** n + 1e-12) ** (1 / n)
def bell_pt(phi, z, lip=True, dr=0.):
    r = bell_r(phi, z, lip) + dr; phi = np.asarray(phi, float) * np.ones_like(r)
    return np.stack([r * np.sin(phi), -r * np.cos(phi), np.asarray(z, float) * np.ones_like(r)], -1)
def bell_normal(phi, z, lip=True, e=2e-4):
    Pp = bell_pt(phi + e, z, lip) - bell_pt(phi - e, z, lip); Pz = bell_pt(phi, z + e, lip) - bell_pt(phi, z - e, lip)
    return unit(np.cross(Pp, Pz))
def bell_sdf(p, lip=True):
    p = np.asarray(p, float); z = p[..., 2]; zc = np.clip(z, Z_BOT, Z_TOP)
    phi = np.arctan2(p[..., 0], -p[..., 1]); rho = np.hypot(p[..., 0], p[..., 1])
    return np.maximum(np.maximum((rho - bell_r(phi, zc, lip)) * .92, Z_BOT - z), z - Z_TOP)
def bell_sdf_nolip(p): return bell_sdf(p, False)
def body_occ(p): return np.minimum(head_sdf(p), 9.)
def torso_shade(P, N): return sval(N, .30 * ao(body_occ, P, N, .05), hi=.15, lo=.24)
TORSO_CH = (-.20, .20, .47, .645)          # the collar-V chart: x range, z range (front projection)
def in_torso_chart(P, N):
    return (N[1] < -.30) & (P[2] > .492) & (np.abs(P[0]) < .165)
NPHI = 48
def build_bell():
    zs = list(np.linspace(Z_BOT, .347, 12)) + list(np.linspace(.360, .62, 17)) + [.634, Z_HEM]
    zs = sorted(set(round(float(z), 5) for z in zs))
    rings = [(Z_BOT, Z_BOT, -.050), (Z_BOT, Z_BOT - .004, -.022), (Z_BOT, Z_BOT - .0055, -.010), (Z_BOT, Z_BOT - .0035, -.003)] + \
            [(z, z, 0.) for z in zs]
    phi = np.linspace(0, 2 * PI, NPHI, endpoint=False)
    V = []; N = []; rows = []; rz = []
    for ze, zp, dr in rings:
        P = bell_pt(phi, ze, True, dr); P[:, 2] = zp; n = bell_normal(phi, ze)
        if dr < -.005: n = unit(n * .3 + np.array([0, 0, -1.]))
        rows.append(list(range(len(V), len(V) + NPHI))); V += list(P); N += list(n); rz.append(zp if dr == 0 else Z_BOT - .01)
    bot = len(V); V.append(np.array([0, .0, Z_BOT + .008])); N.append(np.array([0, 0, -1.]))
    top = len(V); V.append(np.array([0, .0, Z_TOP])); N.append(np.array([0, 0, 1.]))
    F = []; FZ = []
    for k in range(len(rows) - 1):
        a_, b_ = rows[k], rows[k + 1]
        for i in range(NPHI):
            F.append((a_[i], a_[(i + 1) % NPHI], b_[(i + 1) % NPHI], b_[i])); FZ.append((rz[k] + rz[k + 1]) / 2)
    for i in range(NPHI): F.append((rows[0][(i + 1) % NPHI], rows[0][i], bot)); FZ.append(Z_BOT - .01)
    for i in range(NPHI): F.append((rows[-1][i], rows[-1][(i + 1) % NPHI], top)); FZ.append(Z_TOP)
    V = np.array(V); N = np.array(N); val = torso_shade(V, N)
    uv = []
    for f, fz in zip(F, FZ):
        idx = list(f); cP = V[idx].mean(0); cN = unit(N[idx].mean(0))
        if fz < Z_HEM + 1e-4:
            uv.append([tuple(ramp_uv('skirt', val[i:i + 1])[0]) for i in idx])
        elif in_torso_chart(cP, cN):
            x0, x1, z0, z1 = TORSO_CH; uv.append([tuple(au('torso', (V[i, 0] - x0) / (x1 - x0), (V[i, 2] - z0) / (z1 - z0))) for i in idx])
        else:
            uv.append([tuple(ramp_uv('kimono', val[i:i + 1])[0]) for i in idx])
    return make_obj('kimono_bell', V, F, uv, 'body', N)
build_bell()

# ---------------------------------------------------------------- the obi (yellow) and the apron's waistband (cream) round it
OBI_ZM = .430
OBI_PROF = [(.349, .001), (.3492, .010), (.3525, .0160), (.359, .0185), (.452, .0185), (.476, .0180), (.483, .0145),
            (.4865, .0085), (.488, .001)]
BAND_PROF = [(.374, .016), (.3748, .0235), (.3775, .0290), (.383, .0315), (.430, .0315), (.4355, .0290), (.4385, .0235),
             (.4398, .016)]
def obi_r(phi, z, t): return bell_r(phi, OBI_ZM, False) + t
def ramp_faces(ob, names, val_fn, dim=None):
    """per-face ramp names, per-vertex shading values from Blender's smooth normals"""
    me = ob.data; me.update(); Nn = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('normal', Nn); Nn = Nn.reshape(-1, 3)
    Vv = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', Vv); Vv = Vv.reshape(-1, 3)
    val = val_fn(Vv, Nn); uvl = me.uv_layers['Atlas']
    for p, nm in zip(me.polygons, names):
        k = (dim or {}).get(nm, 1.)
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index; uvl.data[li].uv = tuple(ramp_uv(nm, val[vi:vi + 1] * k)[0])
def build_band(name, prof, ramp, group):
    phi = np.linspace(0, 2 * PI, 48, endpoint=False); V = []; rows = []
    for z, t in prof:
        r = obi_r(phi, z, t); rows.append(list(range(len(V), len(V) + len(phi))))
        V += list(np.stack([r * np.sin(phi), -r * np.cos(phi), np.full(len(phi), z)], -1))
    F = []; n = len(phi)
    for k in range(len(rows) - 1):
        for i in range(n):
            a_, b_ = rows[k], rows[k + 1]; F.append((a_[i], a_[(i + 1) % n], b_[(i + 1) % n], b_[i]))
    V = np.array(V); ob = make_obj(name, V, F, np.zeros((len(V), 2)), group)
    ramp_faces(ob, [ramp] * len(F), lambda Vv, Nn: sval(Nn, .20 * ao(body_occ, Vv, Nn, .04), hi=.18, lo=.24))
    return ob
build_band('obi_band', OBI_PROF, 'obi', 'obi')
build_band('apron_waistband', BAND_PROF, 'apron', 'obi')
# the knot at the back: a flat rounded-rectangle cushion on the waistband (the sheet's back view, 0.10 x 0.07 m)
KNOT_C = np.array([0, float(obi_r(PI, .406, .0315)) + .006, .406]); KNOT_R = [.050, .016, .035]
def knot_sdf(p): return sell(p, KNOT_C, KNOT_R, (4.0, 2.3, 4.0))
def knot_shade(P, N): return sval(N, .25 * ao(lambda q: bell_sdf(q, False) - .03, P, N, .02), hi=.20, lo=.24)
sdf_ball('apron_knot', knot_sdf, KNOT_C, 6, 'obi', 'apron', shade=knot_shade, t1=.10)

# ---------------------------------------------------------------- the apron: a thick slab hanging from the waistband
AP_TOP, AP_BOT = .395, .163; AP_T = .012; AP_GAP = .004; AP_R0 = .26
def ap_r(phi, z, t=AP_T):
    rb = bell_r(phi, z, False) + AP_GAP + t
    rh = bell_r(phi, AP_TOP, False) + AP_GAP + t + .21 * (AP_TOP - np.asarray(z, float))
    return smax(rb, rh, .02)
def ap_point(s, z, t=AP_T):
    phi = np.asarray(s, float) / AP_R0; r = ap_r(phi, z, t)
    return np.stack([r * np.sin(phi), -r * np.cos(phi), np.asarray(z, float) * np.ones_like(r)], -1)
def x_to_s(x, z):
    """the arc coordinate s whose apron point projects to front-view x at height z"""
    ss = np.linspace(0, .40, 400); out = []
    for xx, zz in zip(np.atleast_1d(x), np.atleast_1d(z)):
        X = ap_point(ss, np.full(len(ss), zz))[:, 0]; out.append(np.sign(xx) * np.interp(abs(xx), X, ss))
    return np.array(out)
AP_HW0, AP_HW1, AP_RC = .198, .205, .036         # half-widths at the top / bottom (front view), corner radius
def _apron_outline_xz():
    def hw(z): return AP_HW0 + (AP_HW1 - AP_HW0) * float(smooth(AP_TOP, .24, z))
    def zb(x): return AP_BOT + .008 * (x / AP_HW1) ** 2
    side = [(hw(z), z) for z in np.linspace(AP_TOP, AP_BOT + AP_RC, 20)]
    xc = hw(AP_BOT + AP_RC) - AP_RC; zc = zb(xc) + AP_RC
    corner = [(xc + AP_RC * math.cos(a), zc + AP_RC * math.sin(a)) for a in np.linspace(0, -PI / 2, 9)[1:]]
    bottom = [(x, zb(x)) for x in np.linspace(xc, 0, 9)[1:]]
    right = side + corner + bottom                      # top-right corner, down the side, round, along the bottom to x 0
    left = [(-x, z) for x, z in right[::-1]][1:]
    top = [(x, AP_TOP) for x in np.linspace(-AP_HW0, AP_HW0, 18)[1:-1]]
    return np.array(right + left + top)
def resample(poly, step):
    seg = np.linalg.norm(np.roll(poly, -1, 0) - poly, axis=1); L = np.concatenate([[0], np.cumsum(seg)])
    n = max(8, int(round(L[-1] / step))); t = np.linspace(0, L[-1], n, endpoint=False)
    P = np.concatenate([poly, poly[:1]]); return np.stack([np.interp(t, L, P[:, 0]), np.interp(t, L, P[:, 1])], -1)
def build_apron():
    O = _apron_outline_xz(); S = x_to_s(O[:, 0], O[:, 1]); out = np.stack([S, O[:, 1]], -1)
    def area(p): return .5 * np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1])
    if area(out) < 0: out = out[::-1]
    out = resample(out, .016)
    gx, gz = np.meshgrid(np.arange(-.40, .40, .025), np.arange(.15, .41, .0215))
    G = np.stack([gx.ravel(), gz.ravel()], -1); G[:, 0] += .0125 * (np.round((G[:, 1] - .15) / .0215) % 2)
    ok = in_poly(G, out)
    d = np.full(len(G), 9.)
    for i in range(len(out)):
        a = out[i]; b = out[(i + 1) % len(out)]; ab = b - a; t = np.clip(((G - a) @ ab) / (ab @ ab), 0, 1)
        d = np.minimum(d, np.linalg.norm(G - (a + t[:, None] * ab), axis=1))
    G = G[ok & (d > .010)]
    P2 = np.concatenate([out, G]); nO = len(out)
    res = delaunay_2d_cdt([Vector(p) for p in P2], [(i, (i + 1) % nO) for i in range(nO)], [], 0, 1e-9)
    vout = np.array([[v.x, v.y] for v in res[0]]); Fo = np.array([list(f) for f in res[2]])
    assert len(vout) == len(P2), 'apron CDT merged points'
    Fo = Fo[in_poly(vout[Fo].mean(1), out)]; n2 = len(vout)
    Pf = ap_point(vout[:, 0], vout[:, 1]); Pb = ap_point(vout[:, 0], vout[:, 1], 0.)
    V = list(Pf) + list(Pb); F = [tuple(f) for f in Fo] + [tuple(n2 + f[::-1]) for f in Fo]
    L2 = vout[:nO]; tang = np.roll(L2, -1, 0) - np.roll(L2, 1, 0); m = unit(np.stack([tang[:, 1], -tang[:, 0]], -1))
    rows = [list(range(nO))]; R = 4
    for j in range(1, R):
        ph = PI * j / R; q = L2 + m * (AP_T / 2 * .95 * math.sin(ph))
        rows.append(list(range(len(V), len(V) + nO))); V += list(ap_point(q[:, 0], q[:, 1], AP_T / 2 * (1 + math.cos(ph))))
    rows.append(list(range(n2, n2 + nO)))
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(nO): F.append((a_[i], b_[i], b_[(i + 1) % nO], a_[(i + 1) % nO]))
    V = np.array(V); ob = make_obj('apron_panel', V, F, np.zeros((len(V), 2)), 'apron')
    mesh_normals_uv(ob, lambda Vv, Nn: ramp_uv('apron', sval(Nn, .22 * ao(bell_sdf_nolip, Vv, Nn, .03)
                                                           + .25 * smooth(AP_TOP - .03, AP_TOP + .004, Vv[:, 2]), hi=.16, lo=.22)))
    return ob, out
apron_ob, APRON_OUT = build_apron()

# ---------------------------------------------------------------- the collar: a cream ribbon, the left panel over the right
def ribbon(name, ctrl, offs, width, thick, group, ramp, n=64, cen=(0, 0, .47)):
    ctrl = [np.asarray(c, float) for c in ctrl]; cen = np.asarray(cen, float)
    C = np.array([catmull(ctrl, t) for t in np.linspace(0, 1, n)])
    off = np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(offs)), offs)
    d = unit(C - cen); S = ray_outer(bell_sdf_nolip, cen, d, t1=.45); Nn = grad(bell_sdf_nolip, S)
    S = S + Nn * (off + thick / 2)[:, None]
    tang = unit(np.gradient(S, axis=0)); side = unit(np.cross(Nn, tang)); nrm = unit(np.cross(tang, side))
    prof = [(1, .55), (.82, 1), (-.82, 1), (-1, .55), (-1, -.55), (-.82, -1), (.82, -1), (1, -.55)]
    V = []; NV = []
    for k in range(n):
        for a_, b_ in prof:
            V.append(S[k] + side[k] * (a_ * width / 2) + nrm[k] * (b_ * thick / 2)); NV.append(unit(side[k] * a_ + nrm[k] * b_ * 1.6))
    m = len(prof); F = []
    for k in range(n - 1):
        for i in range(m): F.append((k * m + i, k * m + (i + 1) % m, (k + 1) * m + (i + 1) % m, (k + 1) * m + i))
    F.append(tuple(range(m))[::-1]); F.append(tuple((n - 1) * m + i for i in range(m)))
    V = np.array(V); NV = np.array(NV)
    make_obj(name, V, F, ramp_uv(ramp, sval(NV, .30 * ao(body_occ, V, NV, .03), hi=.14, lo=.22)), group)
    return S
COLLAR_W, COLLAR_T = .044, .018
# from under the obi (her right front), up across the chest over her left shoulder, round the back of the neck, over her
# right shoulder and down to the crossing, where it tucks under the first band (Fuku's path, fitted to Shinju's torso)
_FUKU_COLLAR = [(-.092, -.21, .430), (-.078, -.21, .462), (-.052, -.20, .490), (-.022, -.19, .514), (.010, -.18, .538),
                (.050, -.16, .563), (.092, -.12, .584), (.124, -.06, .596), (.134, .00, .600), (.116, .060, .600),
                (.062, .102, .598), (0, .114, .597), (-.062, .102, .598), (-.116, .060, .600), (-.134, .00, .600),
                (-.124, -.06, .596), (-.092, -.12, .582), (-.062, -.150, .560), (-.036, -.170, .538), (-.016, -.180, .516)]
COLLAR_CTRL = [(x * .80, (y if y < 0 else y * .62) - .005, .462 + (z - .43) * .835 - (.014 if y > .03 else 0.)) for x, y, z in _FUKU_COLLAR]
COLLAR_OFF = [.000, .006, .014, .016, .012, .006, .004, .004, .004, .004, .004, .004, .004, .004, .004, .004, .004, .003,
              .000, -.006]
COLLAR_PATH = ribbon('collar', COLLAR_CTRL, COLLAR_OFF, COLLAR_W, COLLAR_T, 'collar', 'apron', cen=(0, -.02, .53))

# ================================================================ SLEEVES, ARMS + WING-HANDS (A-pose), LEGS + FEET
ARM_DEG = 43.
SLV_L = .150
SH_Y = -.030; SH_Z = .545; SH_X = .140
joint_arms = {}; joint_legs = {}; sleeve_info = {}
def arm_frame(s):
    a = math.radians(ARM_DEG); d = unit(np.array([s * math.sin(a), -.06, -math.cos(a)]))
    e1 = unit(np.cross(d, [0, 0, 1.])); e2 = unit(np.cross(e1, d))
    if e2[2] < 0: e2 = -e2
    return d, e1, e2
def sleeve_ring(s, t, a, scale=1.):
    d, e1, e2 = arm_frame(s); S0 = np.array([s * SH_X, SH_Y, SH_Z])
    C = S0 + d * (-.040 + (SLV_L + .040) * t)
    rw = .076 + .024 * float(smooth(0, 1, t)); ru = .070 + .012 * t; rd = .078 + .062 * float(smooth(0, .9, t))
    down = unit(.40 * e2 + .60 * np.array([0, 0, 1.]))
    ca, sa = np.cos(a), np.sin(a)
    up_part = np.where(sa >= 0, ru * sa, 0.)[:, None] * e2
    dn_part = np.where(sa < 0, rd * spow(sa, .80), 0.)[:, None] * down
    return C + scale * (e1 * (rw * ca)[:, None] + up_part + dn_part), C
def build_sleeve(s, tag):
    d, e1, e2 = arm_frame(s); NA = 30; a = np.linspace(0, 2 * PI, NA, endpoint=False) + PI / NA
    ts = [0, .08, .18, .30, .42, .54, .66, .78, .88, .96, 1.0]
    rows = []; V = []; RN = []
    for t in ts:
        P, C = sleeve_ring(s, t, a); rows.append(list(range(len(V), len(V) + NA))); V += list(P); RN.append('kimono')
    P1, C1 = sleeve_ring(s, 1.0, a)
    for dd, sc, nm in [(.008, .975, 'kimono'), (.013, .925, 'kimono'), (.013, .86, 'kimonoin'), (.008, .80, 'kimonoin')]:
        P = C1 + (P1 - C1) * sc + d * dd; rows.append(list(range(len(V), len(V) + NA))); V += list(P); RN.append(nm)
    for dd, rr in [(-.004, .062), (-.040, .056)]:
        P = C1 + d * dd + (np.outer(np.cos(a), e1) + np.outer(np.sin(a), e2)) * rr; rows.append(list(range(len(V), len(V) + NA)))
        V += list(P); RN.append('kimonoin')
    c_in = len(V); V.append(C1 - d * .05); c_out = len(V); V.append(sleeve_ring(s, 0., a)[1] - d * .02)
    F = []; FR = []
    for k in range(len(rows) - 1):
        nm = 'kimonoin' if RN[k + 1] == 'kimonoin' else 'kimono'
        for i in range(NA):
            F.append((rows[k][i], rows[k][(i + 1) % NA], rows[k + 1][(i + 1) % NA], rows[k + 1][i])); FR.append(nm)
    for i in range(NA): F.append((rows[-1][i], rows[-1][(i + 1) % NA], c_in)); FR.append('kimonoin')
    for i in range(NA): F.append((rows[0][(i + 1) % NA], rows[0][i], c_out)); FR.append('kimono')
    V = np.array(V); ob = make_obj('sleeve.' + tag, V, F, np.zeros((len(V), 2)), 'sleeve.' + tag)
    ramp_faces(ob, FR, lambda Vv, Nn: sval(Nn, .25 * ao(body_occ, Vv, Nn, .04), hi=.16, lo=.24), dim={'kimonoin': .75})
    sleeve_info[tag] = {'root': [float(v) for v in sleeve_ring(s, 0., a[:1])[1]], 'cuff': [float(v) for v in C1]}
    return ob
# the wing-hand: a puffy mitten paddle (broad front-to-back, as the sheet's side view) with three feather lobes at the tip
HAND_L = .238; HAND_R = (.096, .090, .046)       # along the arm / front-back (e1) / across (e2)
HAND_LOBES = [(-.036, .000, .042), (.040, .000, .040)]   # (e1 offset, e2 offset, radius)
def hand_sdf_s(s):
    d, e1, e2 = arm_frame(s); sh = np.array([s * SH_X, SH_Y, SH_Z]); c = sh + d * HAND_L
    def f(p):
        q = p - c; u = q @ d; v = q @ e1; w = q @ e2
        dd = sell(np.stack([u, v, w], -1), [0, 0, 0], HAND_R, (2.2, 2.2, 2.0))
        for ev, ew, r in HAND_LOBES:
            lob = ell(np.stack([u, v, w], -1), [.064, ev, ew], [r * 1.15, r, r * .95])
            dd = smin(dd, lob, .016)
        wr = capsule(p, sh + d * .10, c, .040)                   # the wrist into the sleeve
        return smin(dd, wr, .03)
    return f, c
for s, tag in ((-1, 'R'), (1, 'L')):
    build_sleeve(s, tag)
    d, e1, e2 = arm_frame(s); sh = np.array([s * SH_X, SH_Y, SH_Z])
    elbow = sh + d * .120; wrist = sh + d * .195
    pts_ = [sh + d * .030, sh + d * .120, sh + d * .195]
    limb('arm.' + tag, pts_, lambda t: .046, 'arm.' + tag, rings=8, sides=12, cap_rows=3, cap_len=.6, occ_f=bell_sdf_nolip,
         occ_k=.20, start_cap=True)
    hf, hc = hand_sdf_s(s)
    def hand_shade(P, N): return sval(N, .20 * ao(lambda q: bell_sdf(q, False), P, N, .04), hi=.14, lo=.22)
    sdf_ball('hand.' + tag, hf, hc, 10 if not FAST else 9, 'arm.' + tag, 'fur', scale=(1.1, 1.0, .9), shade=hand_shade, t1=.25)
    tipP = hc + d * (.070 + .042)
    joint_arms[tag] = {'shoulder': [float(v) for v in sh], 'elbow': [float(v) for v in elbow], 'wrist': [float(v) for v in wrist],
                       'hand': [float(v) for v in hc], 'paw_tip': [float(v) for v in tipP]}
FOOT = dict(r=[.112, .148, .056], p=(2.6, 2.7, 2.0), pzlo=4.0, rzlo=.038)       # webbed, a low domed paddle (the sheet)
def foot_sdf_s(s):
    c = np.array([s * .142, -.048, .038])            # the sole on z = 0 (rzlo 0.038)
    def f(p):
        d = sell(p, c, FOOT['r'], FOOT['p'], FOOT['pzlo'], FOOT['rzlo'])
        d = smin(d, capsule(p, [s * .137, -.030, .060], [s * .137, -.030, .120], .050), .035)   # the ankle flaring into the foot
        for k in (-1, 1):            # two shallow toe grooves on the front of the foot (three webbed toes)
            g = ell(p, c + np.array([k * .037, -.165, .036]), [.0068, .030, .050])
            d = smax(d, -g, .006)
        return smax(d, -p[..., 2], .004)              # the sole stays on the ground (the ankle blend bulges)
    return f, c
for s, tag in ((-1, 'R'), (1, 'L')):
    hip = np.array([s * .130, -.020, .250]); knee = np.array([s * .133, -.025, .160]); ankle = np.array([s * .137, -.030, .062])
    leg_pts = [hip + np.array([0, 0, .03]), hip, knee, ankle]
    limb('leg.' + tag, leg_pts, lambda t: .050, 'leg.' + tag, rings=5, sides=16, cap_rows=3,
         cap_len=.5, ramp='bill', occ_f=bell_sdf_nolip, occ_k=.30)
    ff, fc = foot_sdf_s(s)
    def foot_shade(P, N, ff=ff, fc=fc):
        lat = (P[:, 0] - fc[0]) / .111; frontz = smooth(-.09, -.13, P[:, 1] - fc[1]) * smooth(.008, .022, P[:, 2]) * smooth(.080, .06, P[:, 2])
        groove = sum(np.exp(-((lat - k * .333) / .035) ** 2) for k in (-1, 1)) * frontz
        return sval(N, .22 * groove)
    sdf_ball('foot.' + tag, ff, fc + np.array([0, 0, .012]), 8 if FAST else 9, 'leg.' + tag, 'bill', shade=foot_shade, t1=.4)
    joint_legs[tag] = {'hip': [float(v) for v in hip], 'knee': [float(v) for v in knee], 'ankle': [float(v) for v in ankle],
                       'toe': [float(fc[0]), float(fc[1] - .14), .036]}

# ================================================================ THE TAIL: a plump cream fan (rig round: the director)
# the sheet's back view: wide at the base, a soft rounded top edge with feather scallops, flat-ish front to back, ~0.13 m
# wide; the side view: it leans back (its top up and back), its base set into the skirt below the obi
TAIL_C = np.array([0, .168, .290]); TAIL_TILT = math.radians(26.)
TAIL_V_AX = np.array([0, math.sin(TAIL_TILT), math.cos(TAIL_TILT)])          # up the fan (leaning back)
TAIL_W_AX = np.array([0, math.cos(TAIL_TILT), -math.sin(TAIL_TILT)])         # through its thickness (facing back)
TAIL_R = (.065, .036, .072); TAIL_RLO = .056                                 # half-width, half-thickness, top / base reach
TAIL_NOTCH = [(-.024, .075), (.024, .075)]                                   # two soft notches in the top edge: three feather scallops
def tail_local(p):
    q = np.asarray(p, float) - TAIL_C
    return np.stack([q[..., 0], q @ TAIL_W_AX, q @ TAIL_V_AX], -1)
def tail_sdf(p):
    L = tail_local(p)
    d = sell(L, [0, 0, 0], TAIL_R, (2.0, 2.0, 2.1), pzlo=3.0, rzlo=TAIL_RLO)   # a plump dome, wide flat-ish base
    for la, lc in TAIL_NOTCH:
        d = smax(d, -ell(L, [la, 0, lc], [.0088, .08, .015]), .004)
    return d
def tail_shade(P, N): return sval(N, .30 * ao(bell_sdf_nolip, P, N, .04), hi=.14, lo=.22)
tail_ob, TAIL_V, _ = sdf_ball('tail', tail_sdf, TAIL_C, 12, 'tail', 'fur', scale=(1., .55, 1.), shade=tail_shade, t1=.16)
# the tail chain (rig): the base inside the skirt, the fan's middle, its upper half, the top edge
TAIL_JOINTS = [TAIL_C - TAIL_V_AX * .050 - TAIL_W_AX * .012, TAIL_C - TAIL_V_AX * .005, TAIL_C + TAIL_V_AX * .040, TAIL_C + TAIL_V_AX * .075]
TAIL_PTS = TAIL_JOINTS

# ================================================================ PAINTED ATLAS (2048, deterministic PNG)
def stroke(x, z, P, half, aa):
    best = np.full(len(x), 9.)
    for i in range(len(P) - 1):
        a = P[i]; b = P[i + 1]; ab = b - a; L2 = ab @ ab
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        dx = x - (a[0] + t * ab[0]); dz = z - (a[1] + t * ab[1])
        best = np.minimum(best, np.sqrt(dx * dx + dz * dz) - (half[i] * (1 - t) + half[i + 1] * t))
    return 1 - smooth(-aa, aa, best)
def bill_contact(P):
    """a soft contact shade on the skin round the bill root (value 0..1)"""
    return clamp(1 - bill_sdf(P) / (.020 * W))
def lid_edge_Z(X): return 1.25 + 0 * np.asarray(X, float)      # open eyes: no rest lid over the lens (the rig adds the lids)
CAVITY = {'cav': '#5a1e22', 'cavdeep': '#3e1418'}
def paint_face(U, V):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = radial_hit(d)
    C = paint_head_P(P)
    if RIG:   # rig: the skin hidden under the bill is the mouth's back wall (seen only when the jaw opens)
        ib = np.where((P[:, 1] < HY - .15 * W) & (P[:, 2] < CHIN + .40 * W))[0]
        if len(ib):
            a = smooth(-.0012, -.0030, bill_sdf(P[ib]))
            C[ib] = mix(C[ib], mix(rgb(CAVITY['cav']), rgb(CAVITY['cavdeep']), .5), a)
    return C.reshape(sh + (3,))
def paint_head_P(P):
    """the head's paint (fur shade, blush, brows) at skin points P (n x 3)"""
    P = np.asarray(P, float).reshape(-1, 3); n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    fr = smooth(HY + .02, HY - .08, y)
    near = fr * (z < CHIN + .40 * W)
    occ = np.zeros(len(x)); ib = near > 0
    occ[ib] = .08 * bill_contact(P[ib])
    C = ramp_colour('fur', sval(n, occ, hi=.08, lo=.24))
    # blush ovals
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .92 * (1 - smooth(.86, 1.05, r)) * fr * PAINT_OPTS['blush'])
    # brows: soft arcs, the peak toward the inner end, the outer end lower, tapering to rounded points (the sheet)
    t = np.linspace(-1, 1, 15)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * BROW_L * t, BROW_Z + .030 * W * (1 - ((t + .1) / 1.1) ** 2) - .012 * W - .010 * W * t], -1)
        half = .0128 * W * np.maximum(0, 1 - t * t) ** .55 + .0020 * W
        box = (np.abs(x - s * BROW_X) < .10 * W) & (np.abs(z - BROW_Z) < .06 * W) & (fr > 0)
        a = np.zeros(len(x)); a[box] = stroke(x[box], z[box], Pb, half, .0026 * W)
        C = mix(C, rgb('brow'), .96 * a)
    return C

def paint_eye(U, V, s):
    """X, Z in eye-opening units (X along world x). The sheet: a big dark-brown iris tucked toward the bill side, the
    white crescent on the outer side, one big catchlight high on the nose side (mirrored between the eyes)."""
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .29; iz = -.06; irx = .67; irz = .93
    C = mix(rgb('sclera'), rgb('#EDE2D8'), .45 * smooth(.35, .95, Z))
    C = mix(C, rgb('#F1E8E0'), .25 * smooth(.3, 1., s * X))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#6A4428'), rgb('iris'), smooth(-.85, -.20, ez))                # warm brown, lighter at the bottom
    I = mix(I, rgb('#3A2418'), smooth(-.10, .70, ez))
    I = mix(I, rgb('#241710'), smooth(.80, 1.0, r) * .65)
    I = I * (1 - .025 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 26 + r * 9)))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    # a soft darker pupil (the sheet shows only a hint of one)
    px_ = ix - s * .02; pz = .02; R = np.sqrt(((X - px_) / (.50 * irx)) ** 2 + ((Z - pz) / (.58 * irz)) ** 2)
    C = mix(C, rgb('pupil'), .55 * (1 - smooth(.80, 1.10, R)))
    big = np.sqrt(((X - (-s * .42)) / .215) ** 2 + ((Z - .45) / .205) ** 2)
    small = np.sqrt(((X - (-s * .02)) / .075) ** 2 + ((Z + .40) / .080) ** 2)
    C = mix(C, rgb('#FFFBF6'), np.maximum(1 - smooth(.90, 1.06, big), .55 * (1 - smooth(.86, 1.10, small))))
    if not RIG:   # (rig: dropped, so no grey ring shows round the shut eye; the lash roll covers the rim at rest)
        C = mix(C, rgb('lash'), .85 * smooth(.92, 1.0, sr) * smooth(-.30, .30, Z))      # lid contact under the lash roll
        C = mix(C, rgb('#B49A88'), .55 * smooth(.93, 1.0, sr) * (1 - smooth(-.30, .30, Z)))   # a faint warm lower rim
    return C

def collar_line(path):
    """the front projection of a collar stretch as z(x) (sorted by x)"""
    P = np.asarray(path); o = np.argsort(P[:, 0]); return P[o, 0], P[o, 2]
_cp = np.asarray(COLLAR_PATH); _nC = len(_cp)
_OVER = collar_line(_cp[int(.10 * _nC):int(.42 * _nC)])          # chest stretch of the over band (her left shoulder)
_UNDER = collar_line(_cp[int(.79 * _nC):])                         # the under band (her right shoulder to the crossing)
def paint(chart, U, V):
    if chart == 'cavity':
        return mix(rgb('#5a1e22'), rgb('#3e1418'), .5 * smooth(.3, 1, V))
    if chart == 'tongue':
        C = mix(rgb('#e88a96'), rgb('#f2a2ac'), .5 * smooth(.2, .9, V)); return mix(C, rgb('#d07080'), .35 * np.exp(-((U - .5) / .05) ** 2))
    if chart.startswith('lidU') or chart.startswith('lidD'): return np.broadcast_to(rgb('fur'), U.shape + (3,)).copy()     # repainted by the rig
    if chart == 'face': return paint_face(U, V)
    if chart == 'eye.L': return paint_eye(U, V, 1)
    if chart == 'eye.R': return paint_eye(U, V, -1)
    if chart in ('bill', 'billlo'): return paint_bill(chart, U, V)
    if chart == 'ramp':
        C = np.zeros(U.shape + (3,)); row = np.clip((V * (CHARTS['ramp'][3] - 12) + 6) // 32, 0, 15).astype(int)
        for name, k in RAMP_ROWS.items():
            m = row == k; C[m] = ramp_colour(name, (U[m] * (CHARTS['ramp'][2] - 12) + 6 - 8) / (CHARTS['ramp'][2] - 16))
        return C
    if chart == 'torso':
        x0, x1, z0, z1 = TORSO_CH; x_ = x0 + U * (x1 - x0); z_ = z0 + V * (z1 - z0)
        y_ = front_hit(x_.ravel(), z_.ravel(), bell_sdf, -.5, .2).reshape(U.shape); y_ = np.where(np.isfinite(y_), y_, -.1)
        P = np.stack([x_, y_, z_], -1).reshape(-1, 3); N = grad(bell_sdf, P)
        C = ramp_colour('kimono', torso_shade(P, N)).reshape(U.shape + (3,))
        # the chest feathers in the collar's V: above both collar bands' centre lines (the ribbons cover the borders)
        zo = np.interp(x_, *_OVER, left=-9, right=9); zu = np.interp(x_, *_UNDER, left=9, right=-9)
        v = smooth(-.002, .002, z_ - zo) * smooth(-.002, .002, z_ - zu)
        Cf = ramp_colour('fur', sval(N, .40 * ao(body_occ, P, N, .05), hi=.12, lo=.22)).reshape(U.shape + (3,))
        return mix(C, Cf, v)
    raise KeyError(chart)

atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [252, 242, 226, 255]
for name, (x0, y0, w, h) in CHARTS.items():
    U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
    if name in ('face', 'torso', 'bill', 'billlo'):
        block = np.empty((h, w, 3))
        for r0 in range(0, h, 128): block[r0:r0 + 128] = paint(name, U[r0:r0 + 128], V[r0:r0 + 128])
    elif name == 'ramp':
        Uc, Vc = np.meshgrid((np.arange(w) - 8) / (w - 16), (np.arange(h)) / 1.)
        block = np.zeros((h, w, 3))
        for nm_, k in RAMP_ROWS.items(): block[k * 32:(k + 1) * 32] = ramp_colour(nm_, clamp(Uc[k * 32:(k + 1) * 32]))
    else:
        block = paint(name, U, V)
    atlas[y0:y0 + h, x0:x0 + w, :3] = np.round(clamp(block) * 255).astype(np.uint8)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
atlas_path = os.path.join(ROOT, 'scratch' if FAST else '', 'sk-shinju-toy_rig_atlas.png' if RIG else 'sk-shinju-toy_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Shinju_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Shinju_toy_atlas'); MAT.use_nodes = True
bs = next(n for n in MAT.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
bs.inputs['Roughness'].default_value = .8; bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .12
tx = MAT.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
MAT.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])

# ================================================================ MEASURE (before joining)
def all_verts(obs): return np.array([list(o.matrix_world @ v.co) for o in obs for v in o.data.vertices])
def width_at(zw):
    xs = np.linspace(-.6, .6, 481) * W; zz = np.full(len(xs), CHIN + zw * W)
    q = np.stack([xs, np.zeros_like(xs), zz], -1)
    ins = np.zeros(len(xs), bool)
    for yy in np.linspace(-.6, .6, 121) * W:
        q[:, 1] = HY + yy; ins |= head_sdf(q) < 0
    return round(float(np.ptp(xs[ins]) / W), 3) if ins.any() else 0.
def prof_front(zw, xw=0.): return round(float((HY - front_hit(xw * W, CHIN + zw * W)[0]) / W), 3)
def back_at(zw):
    ys = np.linspace(.6, -.2, 400) * W; q = np.stack([np.zeros_like(ys), HY + ys, np.full(len(ys), CHIN + zw * W)], -1)
    ins = head_sdf(q) < 0; return round(float(ys[np.argmax(ins)] / W), 3) if ins.any() else None
def ext(obs):
    A = all_verts(obs); return {k: [round(float(A[:, i].min()), 3), round(float(A[:, i].max()), 3)] for i, k in enumerate('xyz')}
ALL = all_verts([o for g in parts.values() for o in g])
rimL = np.array([verts[i] for i in roll_info[1][0]])
BV = np.concatenate([BILL_UP_V, BILL_LO_V])
def bill_hw_at(zw, V_=BV, band=.006):
    m = np.abs((V_[:, 2] - CHIN) / W - zw) < band
    return round(float(np.abs(V_[m, 0]).max() / W), 3) if m.any() else 0.
MEAS = {'units': 'W = %.3f m face width at the cheeks; front-view z above the chin, profile y from the head centre (W)' % W,
        'total_height_m': round(float(ALL[:, 2].max()), 4), 'lowest_z_m': round(float(ALL[:, 2].min()), 5), 'chin_m': CHIN,
        'head_width_W_at_z': {str(z): width_at(z) for z in (.021, .047, .073, .124, .175, .226, .265, .303, .355, .406, .457,
                                                              .509, .560, .611, .662, .714, .765)},
        'profile_front_W_at_z': {str(z): prof_front(z) for z in (.021, .047, .073, .355, .406, .457, .509, .560, .611, .662, .714)},
        'profile_back_W_at_z': {str(z): back_at(z) for z in (.021, .047, .098, .150, .201, .252, .303, .355, .406, .457, .509, .560, .611, .662, .714)},
        'eye_opening_W': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'eye_centre_W': [round(EX / W, 3), round((EZ - CHIN) / W, 3)],
        'bill_W': {'tip_ahead_of_head_centre': round(float((HY - BV[:, 1].min()) / W), 3),
                   'tip_z': round(float((BV[np.argmin(BV[:, 1]), 2] - CHIN) / W), 3),
                   'top_z': round(float((BILL_UP_V[:, 2].max() - CHIN) / W), 3), 'bottom_z': round(float((BILL_LO_V[:, 2].min() - CHIN) / W), 3),
                   'half_width_at_z': {str(z): bill_hw_at(z) for z in (.119, .133, .146, .160, .173, .187, .201, .214, .228, .241, .255, .269, .282, .296, .310)}},
        'body_extent_m': ext(parts['body']), 'obi_extent_m': ext(parts['obi']), 'apron_extent_m': ext(parts['apron']),
        'collar_extent_m': ext(parts['collar']), 'sleeve_L_extent_m': ext(parts['sleeve.L']),
        'arm_span_m': round(float(np.ptp(all_verts(parts['arm.L'] + parts['arm.R'])[:, 0])), 3),
        'arm_L_extent_m': ext(parts['arm.L']), 'leg_L_extent_m': ext(parts['leg.L']),
        'tail_extent_m': {k: [round(float(TAIL_V[:, i].min()), 3), round(float(TAIL_V[:, i].max()), 3)] for i, k in enumerate('xyz')},
        'tail_width_m': round(float(np.ptp(TAIL_V[:, 0])), 3),
        'collar_min_head_clearance_m': round(float(head_sdf(COLLAR_PATH).min()), 4)}
MEAS['skull_crown_m'] = round(float(CHIN + W * max(z for z in np.linspace(.5, .9, 801) if head_local(np.array([[0, 0, z]]))[0] < 0)), 4)
MEAS.update(LOG)

# ================================================================ JOIN, CLEAN, NORMALS
objects = []; part_tri = {}
NAMES = {'head': 'Shinju_head', 'bill': 'Shinju_bill', 'jaw': 'Shinju_bill_lower', 'eye.L': 'Shinju_eye_L', 'eye.R': 'Shinju_eye_R',
         'lash.L': 'Shinju_lash_L', 'lash.R': 'Shinju_lash_R', 'body': 'Shinju_body', 'obi': 'Shinju_obi', 'apron': 'Shinju_apron',
         'collar': 'Shinju_collar', 'sleeve.L': 'Shinju_sleeve_L', 'sleeve.R': 'Shinju_sleeve_R', 'arm.L': 'Shinju_arm_L',
         'arm.R': 'Shinju_arm_R', 'leg.L': 'Shinju_leg_L', 'leg.R': 'Shinju_leg_R', 'tail': 'Shinju_tail'}
JAW_PIVOT = L2M(np.array([0, -.22, .16]))
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
    piv = {'head': tuple(O), 'bill': tuple(O), 'jaw': tuple(JAW_PIVOT), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'],
           'lash.L': eye_centers['L'], 'lash.R': eye_centers['R'], 'tail': tuple(TAIL_PTS[0]),
           'arm.L': joint_arms['L']['shoulder'], 'arm.R': joint_arms['R']['shoulder'],
           'sleeve.L': joint_arms['L']['shoulder'], 'sleeve.R': joint_arms['R']['shoulder'],
           'leg.L': joint_legs['L']['hip'], 'leg.R': joint_legs['R']['hip'], 'obi': (0, 0, OBI_ZM),
           'apron': (0, 0, AP_TOP), 'collar': (0, 0, .52), 'body': (0, 0, .30)}.get(group, (0, 0, 0))
    bpy.context.scene.cursor.location = piv; bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    for v in ob.data.vertices: assert all(math.isfinite(c) for c in v.co), 'Nonfinite position'
    for p in ob.data.polygons: assert all(math.isfinite(c) for c in p.normal) and p.normal.length > .5, ('Bad normal', ob.name, p.index)
    ob['phase'] = '1: neutral A-pose, no armature'; ob['front_axis'] = '-Y'; ob['units'] = 'metres'
    ob.data.calc_loop_triangles(); part_tri[group] = len(ob.data.loop_triangles); objects.append(ob)
tri_count = sum(part_tri.values()); print('PART_TRIANGLES', json.dumps(part_tri), tri_count, flush=True)
MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count

# no ears: the ear bones (unweighted in the rig, like Kero's) sit on the crown's upper corners, earTip a little up and out
ears_j = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    base = np.array([s * .30 * W, HY, CHIN + .66 * W]); ears_j[tag] = {'base': [float(v) for v in base],
                                                                     'tip': [float(v) for v in base + np.array([s * .015, 0, .045])]}
tail_chain = [[float(v) for v in catmull(TAIL_PTS, t)] for t in (0., .25, .5, .75, 1.)] + \
             [[float(v) for v in TAIL_V[np.argmax(TAIL_V[:, 2])]]]
bill_tip = BV[np.argmin(BV[:, 1])]
joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X',
          'root': [0, 0, 0], 'hips': [0, -.020, .250], 'spine': [0, -.025, .360], 'chest': [0, -.030, .470], 'neck': [0, -.020, .585],
          'head_base': [0, -.010, CHIN + .02], 'head': [float(v) for v in O], 'jaw_pivot': [float(v) for v in JAW_PIVOT],
          'bill': {'tip': [float(v) for v in bill_tip], 'upper_top': [0, float(L2M(np.array([0, -.43, .325]))[1]), float(CHIN + .325 * W)],
                   'lower_bottom': [0, float(BILL_LO_V[np.argmin(BILL_LO_V[:, 2]), 1]), float(BILL_LO_V[:, 2].min())],
                   'mouth_corners': {t_: [float(sg * .19 * W), float(L2M(np.array([0, -.50, 0]))[1]), float(CHIN + .185 * W)] for t_, sg in (('L', 1), ('R', -1))}},
          'eyes': eye_centers, 'brows': {'L': [BROW_X, float(front_hit(BROW_X, BROW_Z)[0]), BROW_Z], 'R': [-BROW_X, float(front_hit(-BROW_X, BROW_Z)[0]), BROW_Z]},
          'lashes': lash_info, 'ears_unweighted': ears_j, 'arms': joint_arms, 'sleeves': sleeve_info, 'legs': joint_legs, 'tail': tail_chain,
          'apron_knot': [float(v) for v in KNOT_C], 'apron_top': [0, -.215, AP_TOP], 'apron_hem': [0, -.265, AP_BOT],
          'skirt_hem_z': Z_BOT,
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth SDF ball (cranium + cheek mass + jaw + trim), radially projected, analytic normals.',
                    'Eyelid holes ringed by 5 loops each, rim rolled in behind separate lens eyeballs; 3 loops round the bill root (hidden under the bill).',
                    'No ears: ear bones go unweighted (like Kero). Shinju_bill (upper) rides the head; Shinju_bill_lower is the jaw piece (origin at jaw_pivot).',
                    'Separate pieces: eyes, lash rolls (origin at the eye centre, for the upper lids), bills, tail, sleeves (open cuff), arms + wing-hands, legs + feet,',
                    'the kimono+skirt bell (the colour border on a loop under the obi), obi + waistband + knot, apron (hangs from the band), collar ribbon.']}
if RIG:
    pass
elif not FAST:
    with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-fast.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not FAST and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'sk-shinju-toy.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG: bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('SHINJU_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
