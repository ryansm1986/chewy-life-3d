"""Tanu, the leaf merchant (Toybox villager, VL-1), phase-1 model. Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_tanu-toy.py [-- --fast]

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/tanu-toy.glb (--fast: no toon refinement, writes scratch/tanu-fast.glb instead).

Technique (the Kuma / Rosie toy-line machinery):
- The head is ONE smooth implicit ball: a domed cranium and a wide cheek mass smooth-unioned (fitted to the sheet's front
  widths and profile by scratch/fit_head.py), plus a gentle muzzle displacement. Its skin is the field's zero surface
  reached by radial projection (CDT in a stereographic domain, edge loops round both eyelid holes and the mouth), so
  every vertex carries the field's analytic normal and the face stays convex. The eyes are flush lens globes in lid holes.
- The raccoon mask, the cream muzzle, brows, mouth and blush are painted in a face chart from 3D positions (front
  projection = the sheet's front view), with clean anti-aliased borders.
- The leaf is a thick lens-section blade resting on the crown (a stiff curved sheet lowered onto the dome), with a
  painted centre vein and a curled stem; the ears are thick cupped discs (dark rim, pink inner).
- Torso, feet, satchel, pouch are SDF blobs meshed by radial projection (analytic normals); the satchel wraps the hip in a
  cylindrical frame; the strap is a rounded ribbon projected onto the body; arms, legs and the striped tail are tubes with
  bend loops whose colour blocks (dark forearms / shins, the tail's rings) sit exactly on edge loops.
- One 2048 painted atlas: face, eyes, ears, nose, belly, leaf charts and 1-D shading ramps (soft light baked into the
  colour, never hard shadows).
"""
import bpy, bmesh, math, json, os, sys, struct, zlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt
from mathutils.kdtree import KDTree

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
FAST = '--fast' in ARGV
RIG = bool(globals().get('RIG_MODE'))       # set by rig_tanu-toy.py: part labels, rig charts; no approved file is written
if RIG: FAST = os.environ.get('RIG_FAST') == '1'     # (RIG_FAST: a coarse head for quick rig debugging only)
MODEL = 'D:/projects/chewy-life-3d/public/models/tanu-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'tanu-fast.glb') if FAST else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(5)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
LOG = {}

# ---------------------------------------------------------------- the sheet's measures (measure.md)
# turnaround: ground y 502.5, leaf top y 87 -> 1.08 m (384.7 px / m); the head close-up: W = 302 px at the cheeks.
W = .671; CHIN = .524; HY = .023            # head width at the cheeks, chin height, head centre y
SW = W / .44                                # Rosie's metric detail sizes (authored at W 0.44) scale by SW

PAL = {'fur': '#A08070', 'furdark': '#8A6B5D', 'furlight': '#AE8F80',
       'dark': '#4A3A34', 'darkdark': '#3B2E29', 'darklight': '#5A4740',
       'cream': '#F0E0D0', 'creamdark': '#DECAB8', 'creamlight': '#F8EDE2',
       'leaf': '#55944A', 'leafdark': '#447D3B', 'leaflight': '#66A658',
       'satchel': '#C8A060', 'satcheldark': '#B08A4C', 'satchellight': '#D6B074',
       'pouch': '#A87843', 'pouchdark': '#8F6436', 'pouchlight': '#B88A54',
       'pink': '#D99089', 'pinkdark': '#C67D77', 'pinklight': '#E2A29B',
       'iris': '#C88A38', 'pupil': '#261C19', 'nose': '#302622', 'sclera': '#FFF8EF', 'blush': '#D99089',
       'lash': '#221815', 'brow': '#45352F', 'mouth': '#302622', 'vein': '#3E7436'}
CHARTS = {'face': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'ear': (1280, 896, 256, 256), 'nose': (1536, 896, 256, 256),
          'belly': (0, 0, 576, 768), 'leaf': (576, 0, 960, 384), 'leafB': (576, 384, 960, 384)}
if RIG:   # phase-2 charts in unused atlas space (the approved paint is untouched)
    CHARTS.update({'lidU': (1536, 0, 512, 256), 'lidD': (1536, 256, 512, 192), 'cavity': (1536, 448, 128, 128), 'tongue': (1664, 448, 128, 128)})
PAINT_OPTS = {'band': True, 'blush': True, 'muzzle': True}     # the rig paints its lids from this skin with the lash lines, blush and muzzle off
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'dark': ('darkdark', 'dark', 'darklight'),
         'cream': ('creamdark', 'cream', 'creamlight'), 'leaf': ('leafdark', 'leaf', 'leaflight'),
         'stem': ('#3C7034', '#4C8A42', '#5C9C50'),
         'satchel': ('satcheldark', 'satchel', 'satchellight'), 'pouch': ('pouchdark', 'pouch', 'pouchlight'),
         'pouchtie': ('#5E4024', '#72502E', '#86613A'), 'button': ('#6E4C2A', '#86603A', '#A07850'),
         'nose': ('#1E1714', 'nose', '#4A3C36'), 'eyedark': ('#1A1210', '#241A16', '#3E302A'),
         'pink': ('pinkdark', 'pink', 'pinklight')}
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
# fitted by scratch/fit_head2.py (round in plan): 1.00 W at z 0.20-0.24, 0.93 at 0.364, 0.88 at 0.444, 0.835 at 0.497,
# the dome crowning at about 0.69 W, 0.66 at x 0.23 W (the sheet's outline beside the leaf)
CR = ([0, .000, .4022], [.4356, .3984, .2818], (2.4958, 2.0, 2.1101))           # domed cranium
CK = ([0, -.010, .1967], [.4953, .3605, .2159], (2.4621, 2.1, 2.0608), 3.0, .1972)   # wide, chubby cheek mass
K_CK = .1774
# the muzzle: a smooth displacement of the ball (no union crease), zero slope at its edge, its lower half fading into
# the chin; it brings the lower face forward as in the sheet's side view
MZ = ([0, -.360, .1341], [.215, .150, .215])
MZ_A = .0471
# the jaw: a soft volume smooth-unioned low in front, so the profile below the nose comes forward as on the sheet's side
# view (0.43-0.47 W ahead of the centre from z 0.05 to 0.17 W; scratch/fit_jaw.py)
JW = ([0, -.2091, .1299], [.340, .2075, .1024]); K_JW = .0622
# round 2: a soft ellipsoid trim rounds the upper sides in front view and in plan (scratch/fit_round.py): 0.875 / 0.82 W
# at z 0.444 / 0.497, the sections at z 0.45-0.55 elliptical; the widths at z 0.06-0.36 and the crown unchanged
TR = ([0, -.0003, .1000], [.5406, .4739, .6219]); K_TR = .0209
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
O = np.array([0, HY, CHIN + .30 * W])
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
EX = .227 * W; EZ = CHIN + .300 * W; EHW = .097 * W; EHH = .105 * W; EN = 2.15
def eye_unit(psi):
    return spow(np.cos(psi), 2 / EN), spow(np.sin(psi), 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
NOSE_Z = CHIN + .236 * W; NOSE_TOP = CHIN + .272 * W; NOSE_BOT = CHIN + .199 * W
MZM = CHIN + .150 * W                                                       # the mouth's centre line
BROW_X = .186 * W; BROW_Z = CHIN + .522 * W; BROW_L = .050 * W
BLUSH = (.342 * W, CHIN + .159 * W, .058 * W, .040 * W)
def chaikin(P, n=3, closed=True):
    P = np.asarray(P, float)
    for _ in range(n):
        Q = np.roll(P, -1, 0) if closed else P[1:]
        A = P if closed else P[:-1]
        R = np.empty((2 * len(A), 2)); R[0::2] = .75 * A + .25 * Q; R[1::2] = .25 * A + .75 * Q
        P = R if closed else np.concatenate([P[:1], R, P[-1:]])
    return P
def mirror_outline(right):
    """right half (x >= 0) listed from the top centre clockwise to the bottom centre -> a closed CCW-agnostic polygon"""
    right = np.asarray(right, float); left = right[::-1] * np.array([-1, 1])
    return np.concatenate([right, left[1:-1]])
# the raccoon mask (W, z above the chin), measured per column on the sheet (measure/m4.py), the blush overlap smoothed
MASK_R = [(0, .361), (.040, .368), (.066, .384), (.093, .415), (.119, .445), (.146, .463), (.172, .472), (.199, .476),
          (.225, .474), (.252, .467), (.278, .457), (.305, .446), (.331, .428), (.358, .405), (.384, .375), (.411, .335),
          (.430, .295), (.440, .255), (.437, .222), (.425, .196), (.405, .178), (.380, .168), (.350, .163), (.320, .161),
          (.290, .162), (.262, .165), (.235, .169), (.205, .180), (.175, .197), (.150, .217), (.120, .240), (.080, .262),
          (.040, .278), (0, .284)]
MASK_POLY = chaikin(mirror_outline(MASK_R), 2) * W + np.array([0, CHIN])
# the cream muzzle: a bell, narrow at the nose bridge, widest low (0.40 W), its bottom on the chin
MUZ_R = [(0, .288), (.040, .284), (.075, .272), (.103, .252), (.120, .236), (.133, .224), (.147, .211), (.163, .198),
         (.177, .184), (.189, .170), (.195, .155), (.198, .135), (.196, .113), (.191, .093), (.182, .075), (.168, .058),
         (.148, .043), (.120, .031), (.085, .024), (.045, .021), (0, .020)]
MUZ_POLY = chaikin(mirror_outline(MUZ_R), 2) * W + np.array([0, CHIN])

# ---------------------------------------------------------------- the leaf (geometry first: the head paint shades under it)
LEAF_L = .45; LEAF_HW = .130; LEAF_ANG = math.radians(-40)         # length, half-width; plan angle of the axis from -X
LEAF_U = np.array([-math.cos(LEAF_ANG), math.sin(LEAF_ANG), 0])    # toward the tip (his right, front); the stem end is back-left
LEAF_V = np.array([math.sin(LEAF_ANG), math.cos(LEAF_ANG), 0])
LEAF_C = np.array([.015, HY - .030, 0])                             # plan centre (a little forward and to his left)
LEAF_T0 = .45                                                       # where along the length the crown contact sits
LEAF_KS, LEAF_CUP, LEAF_TILT, LEAF_TS = .75, .025, .20, .10        # round 2: curvature along (1/m, half the drape), the edges
                                                                    # cupped 25 mm above the midrib, no tilt, the stem end up
LEAF_TH = .030; LEAF_RIM = .012                                     # thickness at the midrib and at the (rounded) rims
NT_L, NW_L = 30, 19
def leaf_hw(t): return LEAF_HW * np.sin(PI * np.clip(t, 0, 1) ** .68) ** .58
def leaf_plan(t, w):
    s = LEAF_L * (np.asarray(t, float) - LEAF_T0); h = leaf_hw(t) * np.asarray(w, float)
    return LEAF_C[:2] + LEAF_U[:2] * s[..., None] + LEAF_V[:2] * h[..., None], s, h
def leaf_mid_raw(t, w):
    P, s, h = leaf_plan(t, w)
    return -LEAF_KS * s * s + LEAF_CUP * (np.abs(h) / LEAF_HW) ** 1.3 + LEAF_TILT * (P[..., 1] - LEAF_C[1]) - LEAF_TS * s, P
def leaf_thick(t, w):
    t = np.asarray(t, float); w = np.asarray(w, float)
    prof = (LEAF_RIM + (LEAF_TH - LEAF_RIM) * np.clip(1 - w * w, 0, 1)) * np.sqrt(np.clip(1 - np.abs(w) ** 12, 0, 1))
    return np.sin(PI * np.clip(t, 0, 1) ** .75) ** .35 * prof
# the head's top under the leaf, on a (t, w) grid (bilinear lookups later): the leaf drapes onto it
_GT, _GW = np.linspace(0, 1, 121), np.linspace(-1, 1, 61)
_tt, _ww = np.meshgrid(_GT, _GW, indexing='ij'); _z0, _P = leaf_mid_raw(_tt.ravel(), _ww.ravel())
LEAF_ZH = top_hit(_P[:, 0], _P[:, 1]).reshape(_tt.shape)
_mid = ((_tt > .15) & (_tt < .85) & (np.abs(_ww) < .3)).ravel()       # it rests on the crown at the midrib
LEAF_LIFT = float(np.nanmax((LEAF_ZH.ravel() + .004 - _z0)[_mid]))   # the stiff blade's middle clears the head; the ends,
LEAF_DROP = .000                                                  # where they would dip into it, drape onto the head
def leaf_zh(t, w):
    t = np.clip(np.asarray(t, float), 0, 1) * (len(_GT) - 1); w = (np.clip(np.asarray(w, float), -1, 1) + 1) / 2 * (len(_GW) - 1)
    i = np.minimum(t.astype(int), len(_GT) - 2); j = np.minimum(w.astype(int), len(_GW) - 2); ft = t - i; fw = w - j
    Z = np.where(np.isfinite(LEAF_ZH), LEAF_ZH, -9.)
    return (Z[i, j] * (1 - ft) * (1 - fw) + Z[i + 1, j] * ft * (1 - fw) + Z[i, j + 1] * (1 - ft) * fw + Z[i + 1, j + 1] * ft * fw)
def leaf_point(t, w, side):
    """side +1 top, -1 underside; the underside = soft max of the stiff curved blade and the head (+4 mm); a shallow
    groove along the midrib on top"""
    z0, P = leaf_mid_raw(t, w); th = leaf_thick(t, w)
    zq = z0 + LEAF_LIFT + LEAF_DROP; zh = leaf_zh(t, w) + .004
    under = smax(zq, zh, .010)
    groove = .0035 * np.exp(-(np.asarray(w, float) / .10) ** 2) * np.sin(PI * np.clip(t, 0, 1) ** .9) * (side > 0)
    z = under + (side > 0) * th - groove
    return np.stack([P[..., 0], P[..., 1], z], -1)
_lt, _lw = np.meshgrid(np.linspace(.03, .97, 24), np.linspace(-.9, .9, 9))
LEAF_UNDER = leaf_point(_lt.ravel(), _lw.ravel(), -1)                # for contact shading on the head
def leaf_occ(P):
    o = np.zeros(len(P))
    for k in range(0, len(P), 20000):
        d = np.linalg.norm(P[k:k + 20000, None, :] - LEAF_UNDER[None], axis=-1).min(1)
        o[k:k + 20000] = np.exp(-(d / .018) ** 2)
    return o

# ---------------------------------------------------------------- the fur shade (shared by the face chart and the ramps)
EAR_C = {s: np.array([s * .300 * W, HY + .010, CHIN + .615 * W]) for s in (-1, 1)}   # on the head's top corners
def head_occ(P, n):
    o = .08 * leaf_occ(P)
    for s in (-1, 1):
        dd = np.linalg.norm(P - EAR_C[s], axis=-1); o = o + .10 * np.exp(-(dd / (.13 * W)) ** 2)
    return o
def head_shade(P, n): return sval(n, head_occ(P, n), hi=.13, lo=.24)
def band_cover(p): return np.zeros(p.shape[:-1])

# ================================================================ HEAD SKIN: CDT on the ball, eyelid and mouth loops
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
for k, (hx, hz) in enumerate([(.098, .022), (.113, .031), (.128, .040)]):
    a = np.linspace(0, 2 * PI, 40, endpoint=False)
    add_loop(to_dom(surf_dir(hx * W * spow(np.cos(a), .8), MZM - .002 * W + hz * W * np.sin(a))), 'mouth_%d' % k)
NB = 64; AB = math.radians(150)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
def fib(n):
    ii = np.arange(n) + .5; phi = np.arccos(1 - 2 * ii / n); th = PI * (1 + 5 ** .5) * ii
    return np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
NF = 1500 if FAST else 3300
D = fib(NF); D = D[np.arccos(np.clip(-D[:, 1], -1, 1)) < math.radians(147.)]
D2 = fib(6400 if FAST else 8000); D2 = D2[np.arccos(np.clip(-D2[:, 1], -1, 1)) < math.radians(62)]
P2 = radial_hit(D2)
band2 = (np.abs(P2[:, 0]) < .46 * W) & (P2[:, 2] > CHIN + .06 * W) & (P2[:, 2] < CHIN + .56 * W)
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
keep &= ~(front & ((Pf[:, 0] / (.142 * W)) ** 2 + ((Pf[:, 2] - MZM) / (.058 * W)) ** 2 < 1))
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
    REFINE_ADD = 330; D_LOW, D_T = .12, .45
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
        verts.append(tuple(P - .0045 * SW * n + .0016 * SW * t)); vdir.append(vdir[vi]); vnorm.append(unit(.30 * n + t)); rr.append(i0 + k)
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
NSEG = 28
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

# ================================================================ NOSE: a glossy rounded-triangle button on the muzzle
def resample(poly, step):
    seg = np.linalg.norm(np.roll(poly, -1, 0) - poly, axis=1); L = np.concatenate([[0], np.cumsum(seg)])
    n = max(8, int(round(L[-1] / step))); t = np.linspace(0, L[-1], n, endpoint=False)
    P = np.concatenate([poly, poly[:1]]); return np.stack([np.interp(t, L, P[:, 0]), np.interp(t, L, P[:, 1])], -1)
def _nose_outline(n=48):
    # a soft inverted triangle: broad rounded top, the sides tapering to a round point (0.10 x 0.075 W)
    t = np.linspace(0, 2 * PI, n, endpoint=False); u = np.cos(t); v = np.sin(t)
    y = .0380 * W * spow(v, .85); taper = (.30 + .70 * ((v + 1) / 2) ** .85)
    x = .066 * W * spow(u, .80) * taper
    return np.stack([x, y + .002 * W], -1)
NOSE_OUT = _nose_outline()
NOSE_H = .034                                                   # the button stands 34 mm proud
def build_nose():
    rows = []; V = []; UV = []
    rings = [1.0, .985, .94, .85, .70, .50, .27]
    prof = [-.003, .012, .021, .0275, .031, .033, .034]
    up = unit(np.array([0, -1., .35]))
    for k, sc in enumerate(rings):
        x = NOSE_OUT[:, 0] * sc; z = NOSE_Z + NOSE_OUT[:, 1] * sc
        y = front_hit(x, z); B = np.stack([x, y, z], -1); n = grad_n(B)
        P = B + unit(n + up) * prof[k]
        row = []
        for i in range(len(P)):
            row.append(len(V)); V.append(P[i]); UV.append((.5 + NOSE_OUT[i, 0] * sc / (.13 * W), .5 + NOSE_OUT[i, 1] * sc / (.13 * W)))
        rows.append(row)
    top = len(V); Bc = np.array([0., float(front_hit(0., NOSE_Z)[0]), NOSE_Z]); nc = grad_n(Bc[None])[0]
    V.append(Bc + unit(nc + up) * NOSE_H); UV.append((.5, .5))
    F = []; m = len(NOSE_OUT)
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(m): F.append((a_[i], a_[(i + 1) % m], b_[(i + 1) % m], b_[i]))
    for i in range(m): F.append((rows[-1][i], rows[-1][(i + 1) % m], top))
    return make_obj('nose_button', np.array(V), F, au('nose', *np.array(UV).T), 'head', recalc=False)
build_nose()

# ================================================================ EARS: thick round cupped discs (dark rim, pink inner)
EAR_OUT = 28.                         # degrees the disc faces outward from the front
ear_info = {}
for s in (-1, 1):
    C0 = EAR_C[s]; ne = unit(np.array([s * math.sin(math.radians(EAR_OUT)), -math.cos(math.radians(EAR_OUT)), .10]))
    up = np.array([0, 0, 1.]); up = unit(up - ne * (up @ ne)); tt = np.cross(up, ne)
    at = au_ = .160 * W; an, dish = .050 * W, .028 * W
    seg, rows_ = 32, 12; V = []
    for j in range(rows_ + 1):
        ph = PI * j / rows_
        for i in range(seg):
            th = 2 * PI * i / seg; rho = math.sin(ph); fz = math.cos(ph)
            if fz > 0: off = an * fz ** .55 - dish * (1 - float(smooth(0, .72, rho)))
            else: off = 2.4 * an * fz
            V.append(C0 + tt * (at * rho * math.cos(th)) + up * (au_ * rho * math.sin(th)) + ne * off)
    V = np.array(V); fs = []
    for j in range(rows_):
        for i in range(seg):
            a, b = j * seg + i, j * seg + (i + 1) % seg; fs.append((a, b, b + seg, a + seg))
    ob = make_obj('ear.' + ('L' if s > 0 else 'R'), V, fs, np.zeros((len(V), 2)), 'ear.' + ('L' if s > 0 else 'R'))
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-7); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update(); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    uvl = bm.loops.layers.uv['Atlas']
    for f in bm.faces:
        cen = sum((v.co for v in f.verts), Vector()) / len(f.verts); rel = np.array(cen) - C0
        front_face = rel @ ne > -.002
        for lp in f.loops:
            p = np.array(lp.vert.co) - C0
            if front_face:
                a_ = p @ tt / at; b_ = p @ up / au_; lp[uvl].uv = tuple(au('ear', .5 + .48 * a_, .5 + .48 * b_))
            else:
                n_ = unit(np.array(lp.vert.normal)); lp[uvl].uv = tuple(ramp_uv('dark', sval(n_[None], .04))[0])
    bm.to_mesh(ob.data); bm.free()
    ear_info[s] = (C0, ne, up, tt)

# ================================================================ THE LEAF: a thick blade resting on the crown, a curled stem
def build_leaf():
    tl = np.linspace(0, 1, NT_L); lin = np.linspace(-1, 1, NW_L); wl = np.sin(lin * PI / 2)
    T, Wg = np.meshgrid(tl, wl, indexing='ij')
    top = leaf_point(T, Wg, 1); bot = leaf_point(T, Wg, -1)
    V = list(top.reshape(-1, 3)) + list(bot.reshape(-1, 3)); n1 = NT_L * NW_L
    idx = lambda side, i, j: side * n1 + i * NW_L + j
    F = []; UV = []
    uv_top = au('leaf', T.ravel(), (Wg.ravel() + 1) / 2); uv_bot = au('leafB', T.ravel(), (Wg.ravel() + 1) / 2)
    for i in range(NT_L - 1):
        for j in range(NW_L - 1):
            F.append((idx(0, i, j), idx(0, i + 1, j), idx(0, i + 1, j + 1), idx(0, i, j + 1)))
            F.append((idx(1, i, j + 1), idx(1, i + 1, j + 1), idx(1, i + 1, j), idx(1, i, j)))
    UVv = np.concatenate([uv_top, uv_bot])
    ob = make_obj('leaf_blade', np.array(V), F, UVv, 'leaf')
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=2e-5)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-7); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data); bm.free()
    # the stem: from the blade's base, out and curling up (his front-left)
    B = leaf_point(np.array([0.0]), np.array([0.0]), 1)[0] - np.array([0, 0, .010])
    out = -LEAF_U; up = np.array([0, 0, 1.])
    path = [B + LEAF_U * .035, B + LEAF_U * .010, B + out * .020 + up * .016, B + out * .034 + up * .040, B + out * .034 + up * .060]
    limb('leaf_stem', path, lambda t: .0175 - .0035 * t, 'leaf', rings=10, sides=14, cap_rows=4, cap_len=.8, ramp='stem')
    return B, path
LEAF_BASE, LEAF_STEM = build_leaf()

# ================================================================ BODY: torso (the belly chart), the striped tail
TB = ([0, -.018, .305], [.240, .226, .205]); TC = ([0, .000, .455], [.196, .168, .118]); TH = ([0, .000, .205], [.250, .200, .095])
def torso_sdf(p):
    d = smin(ell(p, *TB), ell(p, *TC), .07); return smin(d, ell(p, *TH), .06)
def torso_shade(P, N): return sval(N, .30 * ao(head_sdf, P, N, .05), hi=.13, lo=.24)
TORSO_O = np.array([0, .000, .330])
def body_ray(theta, z, f=torso_sdf):
    theta = np.asarray(theta, float); z = np.asarray(z, float) * np.ones_like(theta)
    d = np.stack([np.sin(theta), -np.cos(theta), np.zeros_like(theta)], -1)
    o = np.stack([np.zeros_like(theta), np.zeros_like(theta), z], -1)
    lo = np.zeros(len(theta)); hi = np.full(len(theta), .6)
    for _ in range(36):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0; lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    P = o + d * ((lo + hi) / 2)[:, None]; return P, grad(f, P)
BELLY = (0., .333, .172, .188)                 # centre x, z; half-width, half-height (the cream oval, front view)
def build_torso():
    D, F = cube_sphere(9 if FAST else 14); D = unit(D * np.array([1., 1., 1.2]))
    P = ray_outer(torso_sdf, TORSO_O, D); N = grad(torso_sdf, P)
    val = torso_shade(P, N)
    uvF = []
    for f in F:
        c = P[list(f)].mean(0); nm = unit(N[list(f)].mean(0))
        if nm[1] < -.22 and .08 < c[2] < .60 and abs(c[0]) < .235:
            uvF.append([tuple(au('belly', .5 + P[i, 0] / .52, (P[i, 2] - .07) / .55)) for i in f])
        else:
            uvF.append([tuple(ramp_uv('fur', val[i:i + 1])[0]) for i in f])
    return make_obj('torso', P, F, uvF, 'body', N)
build_torso()
# the tail: a big bushy tube sweeping back and to his left, curling up, 5 colour blocks ending in a dark tip
def _tail_path(n=7, L=.43, turn=math.radians(50), a0=math.radians(14)):
    """round 2: an even circular arc in plan (bend radius L / turn = 0.49 m, far above the 0.15 m tube radius, so the
    inner side never folds), starting back and a little to his left, turning out to his left, rising at the end"""
    R = L / turn; out = []
    for k in range(n):
        t = k / (n - 1); ang = a0 + turn * t
        x = .015 + R * (math.cos(a0) - math.cos(ang)); y = .100 + R * (math.sin(ang) - math.sin(a0))
        out.append(np.array([x, y, .245 - .045 * t + .100 * t * t]))
    return out
TAIL_PTS = _tail_path()
def tail_r(t): return .085 + .066 * float(smooth(0, .60, t)) - .045 * float(smooth(.72, 1, t))
TAIL_BANDS = [(-9, .10, 'fur'), (.10, .29, 'dark'), (.29, .45, 'fur'), (.45, .62, 'dark'), (.62, 1.10, 'fur'), (1.10, 9, 'dark')]    # round 2: the dark tip is a small rounded cap (the end dome)
def tail_ramp(t):
    for a, b, nm in TAIL_BANDS:
        if a <= t < b: return nm
    return 'dark'
TAIL_RT = sorted(set([round(v, 4) for v in np.linspace(0, 1, 31)] + [a for a, _, _ in TAIL_BANDS[1:]]))
tail_ob, TAIL_V = limb('tail', TAIL_PTS, tail_r, 'tail', sides=22, cap_rows=7, cap_len=.95, ring_t=TAIL_RT,
                       face_ramp=tail_ramp, occ_f=torso_sdf, occ_k=.25)

# ================================================================ ARMS (A-pose) and LEGS + FEET
joint_arms = {}; joint_legs = {}
ARM_DEG = 45.
T_ELBOW = .46
for s, tag in ((-1, 'R'), (1, 'L')):
    sh = np.array([s * .178, .005, .468]); a = math.radians(ARM_DEG)
    dvec = np.array([s * math.sin(a), -.16, -math.cos(a)]); dvec = unit(dvec)
    root = sh - dvec * .07; elbow = sh + dvec * .120; wrist = sh + dvec * .215
    pts_ = [root, sh, elbow, wrist]
    rad = lambda t: .066 - .008 * float(smooth(.15, .75, t)) + .006 * float(smooth(.80, 1., t))
    rt = sorted(set([round(v, 4) for v in np.linspace(0, 1, 17)] + [T_ELBOW]))
    limb('arm.' + tag, pts_, rad, 'arm.' + tag, sides=18, cap_rows=7, cap_len=1.05, occ_f=torso_sdf, squash=.94,
         ring_t=rt, face_ramp=lambda t: 'dark' if t >= T_ELBOW else 'fur')
    joint_arms[tag] = {'shoulder': [float(v) for v in sh], 'elbow': [float(v) for v in elbow], 'wrist': [float(v) for v in wrist],
                       'paw_tip': [float(v) for v in wrist + dvec * .062 * 1.05]}
FOOT = dict(r=[.100, .132, .044], p=(2.8, 3.0, 2.4), pzlo=4.0, rzlo=.040)
def foot_sdf_s(s):
    c = np.array([s * .162, -.030, .040])
    def f(p):
        d = sell(p, c, FOOT['r'], FOOT['p'], FOOT['pzlo'], FOOT['rzlo'])
        for k in (-1, 1):            # two shallow toe grooves on the front of the foot
            g = ell(p, c + np.array([k * .033, -.158, .036]), [.0058, .020, .040])
            d = smax(d, -g, .006)
        return d
    return f, c
Z_KNEE = .112
for s, tag in ((-1, 'R'), (1, 'L')):
    hip = np.array([s * .135, .005, .205]); knee = np.array([s * .140, -.002, .120]); ankle = np.array([s * .150, -.010, .060])
    rt = sorted(set([round(v, 4) for v in np.linspace(0, 1, 11)]))
    leg_pts = [hip + np.array([0, 0, .03]), hip, knee, ankle]
    # the colour border (dark from the knee down) on the ring nearest Z_KNEE
    zs = [catmull(leg_pts, t)[2] for t in rt]; t_k = rt[int(np.argmin(np.abs(np.array(zs) - Z_KNEE)))]
    limb('leg.' + tag, leg_pts, lambda t: .102 - .004 * float(smooth(.5, 1, t)), 'leg.' + tag,
         sides=18, cap_rows=3, cap_len=.5, occ_f=torso_sdf, ring_t=rt, face_ramp=lambda t, t_k=t_k: 'dark' if t >= t_k else 'fur')
    ff, fc = foot_sdf_s(s)
    def foot_shade(P, N, ff=ff, fc=fc):
        lat = (P[:, 0] - fc[0]) / .100; frontz = smooth(-.08, -.12, P[:, 1] - fc[1]) * smooth(.008, .022, P[:, 2]) * smooth(.080, .06, P[:, 2])
        groove = sum(np.exp(-((lat - k * .333) / .035) ** 2) for k in (-1, 1)) * frontz
        return sval(N, .22 * groove)
    sdf_ball('foot.' + tag, ff, fc + np.array([0, 0, .01]), 8 if FAST else 10, 'leg.' + tag, 'dark', shade=foot_shade, t1=.4)
    joint_legs[tag] = {'hip': [float(v) for v in hip], 'knee': [float(v) for v in knee], 'ankle': [float(v) for v in ankle],
                       'toe': [float(fc[0]), float(fc[1] - .13), .035]}

# ================================================================ THE SATCHEL (his right hip), its strap, the tied pouch (his left hip)
BAG_TH = math.radians(-50); BAG_Z = .262; BAG_W, BAG_D, BAG_H = .196, .078, .200
# rig round 1 (director): in the rig the bag sits 3 cm higher and slid 9 deg forward round the hip (its back stays on the body),
# so at the walk peaks the right foot clears it (0.62 forward: 0 mm) and the forward-swinging mitten nearly does (-0.55: 9 mm;
# it was 37 mm); sliding it outward instead met the hanging mitten (scratch/bag_true2.py). The approved model (not RIG) is
# unchanged. (BAG_OUT pushes it radially off the body, leaving a gap behind it; not used.)
BAG_DZ, BAG_OUT, BAG_DTH = ((float(os.environ.get('BAG_DZ', '.030')), float(os.environ.get('BAG_OUT', '0')), math.radians(float(os.environ.get('BAG_DTH', '9'))))
                            if RIG else (0., 0., 0.))
BAG_TH += BAG_DTH; BAG_Z += BAG_DZ
_Sb, _Nb = body_ray(np.array([BAG_TH]), BAG_Z); BAG_R = float(np.hypot(_Sb[0, 0], _Sb[0, 1]))
def bag_local(p):
    """cylindrical frame round the body axis: u along the hip (arc length, + toward the front centre), n outward, z up"""
    th = np.arctan2(p[..., 0], -p[..., 1]); r = np.hypot(p[..., 0], p[..., 1])
    return np.stack([(th - BAG_TH) * BAG_R, r - BAG_R, p[..., 2] - BAG_Z], -1)
BAG_NC = BAG_D / 2 + .004 + BAG_OUT
FLAP_Z0 = .010                                                  # the flap's lower edge, above the bag's centre
def bag_body_sdf(p):
    return sell(bag_local(p), [0, BAG_NC, 0], [BAG_W / 2, BAG_D / 2, BAG_H / 2], (4.2, 3.0, 4.2))
FLAP_C = [0, BAG_NC + .003, (BAG_H / 2 + FLAP_Z0) / 2 + .004]
def flap_sdf(p):
    return sell(bag_local(p), FLAP_C, [BAG_W / 2 + .007, BAG_D / 2 + .008, (BAG_H / 2 - FLAP_Z0) / 2 + .006], (4.6, 3.0, 4.6))
def bag_sdf(p): return np.minimum(bag_body_sdf(p), flap_sdf(p))
def bag_world(u, n, z):
    th = BAG_TH + u / BAG_R; r = BAG_R + n; return np.array([r * math.sin(th), -r * math.cos(th), BAG_Z + z])
BAG_C = bag_world(0, BAG_NC, 0)
def bag_shade(P, N): return sval(N, .25 * ao(torso_sdf, P, N, .03), hi=.20, lo=.26)       # (a self-AO term on this frame was grainy)
sdf_ball('satchel_bag', bag_body_sdf, BAG_C, 7 if FAST else 10, 'satchel', 'satchel', shade=bag_shade, t1=.3)
sdf_ball('satchel_flap', flap_sdf, bag_world(*FLAP_C), 7 if FAST else 10, 'satchel', 'satchel', shade=bag_shade, t1=.3)
BTN_C = bag_world(0, BAG_D + .010 + BAG_OUT, FLAP_Z0 + .022)
def button_sdf(p): return ell(bag_local(p), [0, BAG_D + .010 + BAG_OUT, FLAP_Z0 + .022], [.017, .009, .015])
sdf_ball('satchel_button', button_sdf, BTN_C, 4 if FAST else 5, 'satchel', 'button', t1=.08)
# the strap: control points on the body, projected radially onto torso + shoulders, a rounded ribbon riding on it
def strap_body(p):
    d = torso_sdf(p)
    for s in (-1, 1): d = smin(d, capsule(p, [s * .12, .005, .50], [s * .20, .005, .455], .062), .03)
    return d
STRAP_W, STRAP_T = .036, .011
def build_strap():
    u_in = BAG_W / 2 - .020; u_out = -(BAG_W / 2 - .020)
    A = bag_world(u_in, BAG_NC - .005, BAG_H / 2 - .010); Bp = bag_world(u_out, BAG_NC - .005, BAG_H / 2 - .010)
    ctrl = [A, bag_world(u_in + .012, BAG_NC, BAG_H / 2 + .014), (-.10, -.24, .385), (-.02, -.245, .425), (.065, -.215, .465), (.130, -.155, .495),
            (.172, -.070, .512), (.185, .010, .515), (.170, .085, .505), (.120, .150, .482), (.040, .185, .445),
            (-.050, .190, .405), (-.140, .160, .370), (-.215, .080, .345), bag_world(u_out - .012, BAG_NC, BAG_H / 2 + .014), Bp]
    ctrl = [np.asarray(c, float) for c in ctrl]
    n = 104; C = np.array([catmull(ctrl, t) for t in np.linspace(0, 1, n)])
    cen = np.array([0, 0, .33]); d = unit(C - cen)
    S = ray_outer(strap_body, cen, d, t1=.5); Nn = grad(strap_body, S)
    # the two ends stay on their control points (into the bag top)
    for k in range(n):
        t = k / (n - 1); w_end = float(1 - smooth(.0, .06, t) * smooth(1., .94, t))
        S[k] = S[k] * (1 - w_end) + C[k] * w_end
    S = S + Nn * (.004 + STRAP_T / 2)
    tang = unit(np.gradient(S, axis=0)); side = unit(np.cross(Nn, tang)); nrm = unit(np.cross(tang, side))
    prof = [(1, .55), (.82, 1), (-.82, 1), (-1, .55), (-1, -.55), (-.82, -1), (.82, -1), (1, -.55)]
    V = []; NV = []
    for k in range(n):
        for a_, b_ in prof:
            V.append(S[k] + side[k] * (a_ * STRAP_W / 2) + nrm[k] * (b_ * STRAP_T / 2)); NV.append(unit(side[k] * a_ + nrm[k] * b_ * 1.6))
    m = len(prof); F = []
    for k in range(n - 1):
        for i in range(m): F.append((k * m + i, k * m + (i + 1) % m, (k + 1) * m + (i + 1) % m, (k + 1) * m + i))
    F.append(tuple(range(m))[::-1]); F.append(tuple((n - 1) * m + i for i in range(m)))
    V = np.array(V); NV = np.array(NV)
    return make_obj('satchel_strap', V, F, ramp_uv('satchel', sval(NV, .30 * ao(torso_sdf, V, NV, .025))), 'satchel'), S
_, STRAP_PATH = build_strap()
# the tied pouch: a soft sack, a cinched neck with a cord, a little cloth tuft
POUCH_TH = math.radians(64); POUCH_Z = .245
_Sp, _Np = body_ray(np.array([POUCH_TH]), POUCH_Z)
PN = unit(np.array([_Np[0, 0], _Np[0, 1], 0.])); PT = np.cross(np.array([0, 0, 1.]), PN); PZ = np.array([0, 0, 1.])
POUCH_C = _Sp[0] + PN * .046
def pouch_local(p):
    d = p - POUCH_C; return np.stack([d @ PT, d @ PN, d @ PZ], -1)
def pouch_sdf(p):
    q = pouch_local(p)
    d = smin(ell(q, [0, 0, -.004], [.056, .046, .056]), ell(q, [0, .002, -.030], [.050, .041, .034]), .02)
    d = smin(d, ell(q, [0, 0, .060], [.024, .021, .020]), .022)
    for k, (cx, cz, rr) in enumerate([(-.020, .084, (.021, .017, .024)), (.020, .083, (.021, .017, .024)), (0, .090, (.016, .014, .020))]):
        d = smin(d, ell(q, [cx, 0, cz], rr), .017)
    return d
def pouch_ramp(cents):
    q = pouch_local(cents); return ['pouchtie' if abs(z - .061) < .0085 else 'pouch' for z in q[:, 2]]
def pouch_shade(P, N): return sval(N, .30 * ao(torso_sdf, P, N, .03), hi=.20, lo=.26)
sdf_ball('pouch', pouch_sdf, POUCH_C + PZ * .020, 7 if FAST else 10, 'pouch', 'pouch', shade=pouch_shade, t1=.2, face_ramp=pouch_ramp)

# ================================================================ PAINTED ATLAS (2048, deterministic PNG)
def stroke(x, z, P, half, aa):
    best = np.full(len(x), 9.)
    for i in range(len(P) - 1):
        a = P[i]; b = P[i + 1]; ab = b - a; L2 = ab @ ab
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        dx = x - (a[0] + t * ab[0]); dz = z - (a[1] + t * ab[1])
        best = np.minimum(best, np.sqrt(dx * dx + dz * dz) - (half[i] * (1 - t) + half[i + 1] * t))
    return 1 - smooth(-aa, aa, best)
def poly_fill(x, z, poly, aa):
    """anti-aliased coverage of a closed polygon (signed distance to its edges)"""
    Q = np.stack([x, z], -1); best = np.full(len(x), 9.)
    for i in range(len(poly)):
        a = poly[i]; b = poly[(i + 1) % len(poly)]; ab = b - a
        t = np.clip(((Q - a) @ ab) / (ab @ ab), 0, 1); best = np.minimum(best, np.linalg.norm(Q - (a + t[:, None] * ab), axis=1))
    sd = np.where(in_poly(Q, poly), -best, best); return 1 - smooth(-aa, aa, sd)
def lash_th(psi):      # the upper lash line: thick on top, swelling to the outer corner (psi 0 = outer side)
    return (.040 + .15 * np.sin(np.clip(psi, 0, PI)) ** .55 + .07 * np.exp(-((psi - .35) / .40) ** 2)) * smooth(-.10, .25, psi)
def paint_face(U, V):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = radial_hit(d); n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    fr = smooth(HY + .02, HY - .08, y)
    C = ramp_colour('fur', head_shade(P, n))
    occ = head_occ(P, n)
    near_face = (np.abs(x) < .5 * W) & (z < CHIN + .52 * W) & (z > CHIN - .02 * W) & (fr > 0)
    # the raccoon mask: one soft rounded band across the eyes and the nose bridge
    a = np.zeros(len(x)); a[near_face] = poly_fill(x[near_face], z[near_face], MASK_POLY, .0016) * fr[near_face]
    if PAINT_OPTS.get('maskall'): a = np.ones(len(x))          # (rig only: the eyelids are the mask all over)
    C = mix(C, ramp_colour('dark', sval(n, .5 * occ, hi=.16, lo=.20)), a)
    # the cream muzzle (the cheeks under the mask), a bell over the lower face
    a = np.zeros(len(x)); a[near_face] = poly_fill(x[near_face], z[near_face], MUZ_POLY, .0016) * fr[near_face]
    C = mix(C, ramp_colour('cream', sval(n, 0., hi=.14, lo=.18)), a * PAINT_OPTS['muzzle'])
    # blush ovals
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .92 * (1 - smooth(.86, 1.05, r)) * fr * PAINT_OPTS['blush'])
    # brows: soft arcs tapering to rounded points
    t = np.linspace(-1, 1, 15)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * BROW_L * t, BROW_Z + .020 * W * (1 - t * t) - .010 * W - .006 * W * t], -1)
        half = .0135 * W * np.maximum(0, 1 - t * t) ** .65 + .0015 * W
        box = (np.abs(x - s * BROW_X) < .09 * W) & (np.abs(z - BROW_Z) < .05 * W) & (fr > 0)
        a = np.zeros(len(x)); a[box] = stroke(x[box], z[box], Pb, half, .0026 * W)
        C = mix(C, rgb('brow'), .96 * a)
    # the sly little "w" smile and the philtrum line
    lw = .0040 * W
    for s in (-1, 1):
        Pm = np.array([catmull([(s * .0835 * W, MZM + .019 * W), (s * .076 * W, MZM + .008 * W), (s * .046 * W, MZM - .009 * W),
                                (s * .012 * W, MZM - .004 * W), (0, MZM + .001 * W)], q) for q in np.linspace(0, 1, 17)])
        half = np.full(len(Pm), lw); half[0] = lw * .55; half[1] = lw * .8
        ib = (np.abs(x) < .12 * W) & (np.abs(z - MZM) < .05 * W) & (fr > 0)
        a = np.zeros(len(x)); a[ib] = stroke(x[ib], z[ib], Pm, half, .0024 * W); C = mix(C, rgb('mouth'), .96 * a)
    Pp = np.array([(0, NOSE_BOT + .004 * W), (0, MZM + .002 * W)]); ib = (np.abs(x) < .03 * W) & (np.abs(z - MZM) < .07 * W) & (fr > 0)
    a = np.zeros(len(x)); a[ib] = stroke(x[ib], z[ib], Pp, np.array([lw * .9, lw]), .0024 * W); C = mix(C, rgb('mouth'), .96 * a)
    # the upper lash line with its outer wing, and the thin lower lid line
    for s in (-1, 1):
        sr, psi, X, Z = eye_s(s, x, z); near = fr * (sr < 1.9)
        th = lash_th(psi)
        upw = smooth(-.14, -.05, psi) * (psi > -1.2)
        lash = (1 - smooth(1 + th - .010, 1 + th + .010, sr)) * upw
        low = (1 - smooth(1.030, 1.050, sr)) * (1 - upw)
        a = np.zeros(len(x))
        for pk, Lk, gam, w0 in [(.20, .030, .40, .0100)]:                               # the outer wing
            bxk, bzk = eye_xz(s, np.array([pk]), 1 + float(lash_th(np.array([pk]))[0]) * .45)
            tq = np.linspace(0, 1, 7); dx_ = np.cos(gam + .30 * tq); dz_ = np.sin(gam + .30 * tq)
            Pf = np.stack([bxk[0] + s * Lk * W * tq * dx_, bzk[0] + Lk * W * tq * dz_], -1)
            hf = w0 * W * (1 - tq) ** .9 + .0010 * W
            ib = (near > 0) & (np.abs(x - Pf[:, 0].mean()) < .06 * W) & (np.abs(z - Pf[:, 1].mean()) < .06 * W)
            aa = np.zeros(len(x)); aa[ib] = stroke(x[ib], z[ib], Pf, hf, .0024 * W); a = np.maximum(a, aa)
        C = mix(C, rgb('lash'), np.maximum(np.maximum(lash, low * .92), a) * near * PAINT_OPTS['band'])
    return C.reshape(sh + (3,))

def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .27; iz = -.01; irx = .70; irz = .84
    C = mix(rgb('sclera'), rgb('#ECDFD4'), .45 * smooth(.35, .95, Z))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#8A5420'), rgb('iris'), smooth(-.2, -.85, ez))                # amber, brightest at the bottom
    I = mix(I, rgb('#E0A858'), .55 * smooth(-.55, -.95, ez) * smooth(.95, .55, np.abs(ex)))
    I = mix(I, rgb('#5A3412'), smooth(.80, 1.0, r) * .60)
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    # the big pupil: nearly the whole iris, the amber showing as a crescent below (thickest at the outer bottom)
    px_ = ix - s * .06; pz = iz + .15; R = np.sqrt(((X - px_) / (.88 * irx)) ** 2 + ((Z - pz) / (.86 * irz)) ** 2)
    C = mix(C, rgb('pupil'), 1 - smooth(.975, 1.025, R))
    hx = ix + s * .18 * -1; hz = iz + .40
    big = np.sqrt(((X - (ix - s * .30)) / (.215)) ** 2 + ((Z - (iz + .36)) / (.200)) ** 2)
    small = np.sqrt(((X - (ix + s * .12)) / (.105)) ** 2 + ((Z - (iz + .02)) / (.098)) ** 2)
    C = mix(C, rgb('#FFFAF4'), np.maximum(1 - smooth(.92, 1.08, big), .92 * (1 - smooth(.88, 1.12, small))))
    C = mix(C, rgb('lash'), smooth(.945, .995, sr) * (.45 + .55 * smooth(-.2, .5, Z)))  # the lid contact rim
    return C

def leaf_surface_normal(T, Wg, side):
    e = 1e-3
    P = leaf_point(T, Wg, side)
    Pt = leaf_point(np.clip(T + e, 0, 1), Wg, side) - leaf_point(np.clip(T - e, 0, 1), Wg, side)
    Pw = leaf_point(T, np.clip(Wg + e, -1, 1), side) - leaf_point(T, np.clip(Wg - e, -1, 1), side)
    n = unit(np.cross(Pt, Pw)); n = np.where((n[..., 2:3] * side) < 0, -n, n); return P, n
def paint(chart, U, V):
    if chart == 'cavity':
        return mix(rgb('#5a1e22'), rgb('#3e1418'), .5 * smooth(.3, 1, V))
    if chart == 'tongue':
        C = mix(rgb('#e88a96'), rgb('#f2a2ac'), .5 * smooth(.2, .9, V)); return mix(C, rgb('#d07080'), .35 * np.exp(-((U - .5) / .05) ** 2))
    if chart in ('lidU', 'lidD'): return np.broadcast_to(rgb('dark'), U.shape + (3,)).copy()     # repainted by the rig
    if chart == 'face': return paint_face(U, V)
    if chart == 'eye.L': return paint_eye(U, V, 1)
    if chart == 'eye.R': return paint_eye(U, V, -1)
    if chart == 'ramp':
        C = np.zeros(U.shape + (3,)); row = np.clip((V * (CHARTS['ramp'][3] - 12) + 6) // 32, 0, 15).astype(int)
        for name, k in RAMP_ROWS.items():
            m = row == k; C[m] = ramp_colour(name, (U[m] * (CHARTS['ramp'][2] - 12) + 6 - 8) / (CHARTS['ramp'][2] - 16))
        return C
    if chart == 'ear':
        a = (U - .5) / .48; b = (V - .5) / .48; r = np.sqrt(a * a + b * b)
        sh_ = clamp(.5 + .16 * b - .10 * a)
        C = ramp_colour('dark', sh_ - .06 * smooth(.66, .44, r))
        Ci = ramp_colour('pink', clamp(.46 + .20 * b - .14 * smooth(.30, .52, r)))
        return mix(C, Ci, 1 - smooth(.50, .54, r))
    if chart == 'nose':
        a = (U - .5) * .13 * W; b = (V - .5) * .13 * W
        C = ramp_colour('nose', .45 + .10 * smooth(-.02, .02, b))
        hl = np.exp(-(((a + .014 * W) / (.015 * W)) ** 2 + ((b - .013 * W) / (.009 * W)) ** 2))
        return mix(C, rgb('#6E5A52'), .55 * hl)
    if chart in ('leaf', 'leafB'):
        T = clamp(U); Wg = clamp(V) * 2 - 1; side = 1 if chart == 'leaf' else -1
        P, n = leaf_surface_normal(T.ravel(), Wg.ravel(), side)
        if side > 0:
            C = ramp_colour('leaf', sval(n, 0., hi=.20, lo=.24))
            # the centre vein: a darker line with a light edge, tapering toward the tip
            hv = .11 * (1 - .70 * T.ravel()) * smooth(.0, .06, T.ravel()) * smooth(.94, .78, T.ravel())
            wv = np.abs(Wg.ravel()) * leaf_hw(T.ravel()) / LEAF_HW
            C = mix(C, rgb('vein'), .85 * (1 - smooth(hv * .6, hv * .6 + .014, wv)))
            C = mix(C, rgb('#7DB86C'), .45 * np.exp(-((wv - hv * .6 - .05) / .03) ** 2) * smooth(.0, .1, T.ravel()) * smooth(.9, .7, T.ravel()))
        else:
            C = ramp_colour('leaf', sval(n, .10, hi=.10, lo=.20) * .8)
        return C.reshape(U.shape + (3,))
    if chart == 'belly':
        x_ = (U - .5) * .52; z_ = V * .55 + .07
        y_ = front_hit(x_.ravel(), z_.ravel(), torso_sdf, -.6, .3).reshape(U.shape)
        y_ = np.where(np.isfinite(y_), y_, -.1)
        P = np.stack([x_, y_, z_], -1).reshape(-1, 3); N = grad(torso_sdf, P)
        C = ramp_colour('fur', torso_shade(P, N)).reshape(U.shape + (3,))
        zn = (z_ - BELLY[1]) / BELLY[3]; r = np.sqrt(((x_ - BELLY[0]) / (BELLY[2] * (1 - .09 * zn))) ** 2 + zn ** 2)   # an egg, fuller low
        Cb = ramp_colour('cream', sval(N, .30 * ao(head_sdf, P, N, .05), .14, .20)).reshape(U.shape + (3,))
        return mix(C, Cb, 1 - smooth(.988, 1.012, r))
    raise KeyError(chart)

atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [160, 128, 112, 255]
for name, (x0, y0, w, h) in CHARTS.items():
    U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
    if name in ('face', 'belly', 'leaf', 'leafB'):
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
atlas_path = os.path.join(ROOT, 'scratch' if FAST else '', 'tanu-toy_rig_atlas.png' if RIG else 'tanu-toy_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Tanu_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Tanu_toy_atlas'); MAT.use_nodes = True
bs = next(n for n in MAT.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
bs.inputs['Roughness'].default_value = .8; bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .25
tx = MAT.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
MAT.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])

# ================================================================ MEASURE (before joining)
def all_verts(obs): return np.array([list(o.matrix_world @ v.co) for o in obs for v in o.data.vertices])
nose_tip = all_verts([o for o in parts['head'] if o.name == 'nose_button'])
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
def top_at_x(xw):
    zs = np.linspace(.9, .3, 601)
    for zz in zs:
        q = np.stack([np.full(61, xw * W), HY + np.linspace(-.5, .5, 61) * W, np.full(61, CHIN + zz * W)], -1)
        if (head_sdf(q) < 0).any(): return round(float(zz), 3)
    return None
LV = all_verts(parts['leaf']); ALL = all_verts([o for g in parts.values() for o in g])
rimL = np.array([verts[i] for i in roll_info[1][0]])
EV = {s: all_verts(parts['ear.' + ('L' if s > 0 else 'R')]) for s in (-1, 1)}
MEAS = {'units': 'W = %.3f m face width at the cheeks; front-view z above the chin, profile y from the head centre (W)' % W,
        'total_height_m': round(float(ALL[:, 2].max()), 4), 'lowest_z_m': round(float(ALL[:, 2].min()), 5),
        'leaf_top_m': round(float(LV[:, 2].max()), 4), 'chin_m': CHIN,
        'leaf_extent_m': {'x': [round(float(LV[:, 0].min()), 3), round(float(LV[:, 0].max()), 3)], 'y': [round(float(LV[:, 1].min()), 3), round(float(LV[:, 1].max()), 3)],
                          'z': [round(float(LV[:, 2].min()), 3), round(float(LV[:, 2].max()), 3)]},
        'leaf_lift_m': round(LEAF_LIFT, 4),
        'head_width_W_at_z': {str(z): width_at(z) for z in (.02, .06, .113, .152, .20, .235, .30, .364, .444, .497, .55, .60, .65)},
        'head_top_W_at_x': {str(xw): top_at_x(xw) for xw in (0., .10, .20, .23, .30, .35)},
        'profile_front_W_at_z': {str(z): prof_front(z) for z in (.031, .078, .124, .171, .217, .264, .357, .45, .543)},
        'profile_back_W_at_z': {str(z): back_at(z) for z in (.031, .078, .124, .217, .264, .357, .45, .543, .60)},
        'nose_tip_y_m': round(float(nose_tip[:, 1].min()), 4), 'nose_tip_W_ahead': round(float((HY - nose_tip[:, 1].min()) / W), 3),
        'eye_opening_W': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'eye_centre_W': [round(EX / W, 3), round((EZ - CHIN) / W, 3)],
        'ear_extent_W': {'x_outer': round(float(EV[1][:, 0].max() / W), 3), 'top_z': round(float((EV[1][:, 2].max() - CHIN) / W), 3),
                         'top_m': round(float(EV[1][:, 2].max()), 3)},
        'nose_W': [round(float(np.ptp(NOSE_OUT[:, 0])) / W, 3), round(float(np.ptp(NOSE_OUT[:, 1])) / W, 3)],
        'body_width_m': round(float(np.ptp(all_verts(parts['body'])[:, 0])), 3),
        'body_depth_m': [round(float(all_verts(parts['body'])[:, 1].min()), 3), round(float(all_verts(parts['body'])[:, 1].max()), 3)],
        'arm_span_m': round(float(np.ptp(all_verts(parts['arm.L'] + parts['arm.R'])[:, 0])), 3),
        'tail_extent_m': {k: [round(float(TAIL_V[:, i].min()), 3), round(float(TAIL_V[:, i].max()), 3)] for i, k in enumerate('xyz')},
        'satchel_extent_m': {k: [round(float(all_verts(parts['satchel'][:1])[:, i].min()), 3), round(float(all_verts(parts['satchel'][:1])[:, i].max()), 3)] for i, k in enumerate('xyz')},
        'pouch_extent_m': {k: [round(float(all_verts(parts['pouch'])[:, i].min()), 3), round(float(all_verts(parts['pouch'])[:, i].max()), 3)] for i, k in enumerate('xyz')},
        'strap_min_head_clearance_m': round(float(head_sdf(STRAP_PATH).min()), 4)}
MEAS['skull_crown_m'] = round(float(CHIN + W * max(z for z in np.linspace(.5, .9, 801) if head_local(np.array([[0, 0, z]]))[0] < 0)), 4)
MEAS.update(LOG)

# ================================================================ JOIN, CLEAN, NORMALS
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
    ob = bpy.context.object; ob.name = 'Tanu_' + group.replace('.', '_')
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
    piv = {'head': tuple(O), 'leaf': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'],
           'ear.L': tuple(EAR_C[1]), 'ear.R': tuple(EAR_C[-1]), 'tail': tuple(TAIL_PTS[1]),
           'arm.L': joint_arms['L']['shoulder'], 'arm.R': joint_arms['R']['shoulder'],
           'leg.L': joint_legs['L']['hip'], 'leg.R': joint_legs['R']['hip'], 'satchel': tuple(BAG_C), 'pouch': tuple(POUCH_C)}.get(group, (0, 0, 0))
    bpy.context.scene.cursor.location = piv; bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    for v in ob.data.vertices: assert all(math.isfinite(c) for c in v.co), 'Nonfinite position'
    for p in ob.data.polygons: assert all(math.isfinite(c) for c in p.normal) and p.normal.length > .5, ('Bad normal', ob.name, p.index)
    ob['phase'] = '1: neutral A-pose, no armature'; ob['front_axis'] = '-Y'; ob['units'] = 'metres'
    ob.data.calc_loop_triangles(); part_tri[group] = len(ob.data.loop_triangles); objects.append(ob)
tri_count = sum(part_tri.values()); print('PART_TRIANGLES', json.dumps(part_tri), tri_count, flush=True)
MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count

ears_j = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    C0, ne, up, tt = ear_info[s]
    ears_j[tag] = {'base': [float(v) for v in C0 - ne * .03 - up * .05], 'fold': [float(v) for v in C0], 'tip': [float(v) for v in C0 + up * .10]}
tail_chain = [[float(v) for v in catmull(TAIL_PTS, t)] for t in (0., .25, .5, .75, 1.)]
joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X',
          'hips': [0, .005, .205], 'spine': [0, .000, .320], 'chest': [0, .000, .430], 'neck': [0, .010, .525],
          'head': [float(v) for v in O], 'jaw_pivot': [0, float(HY - .10 * W), float(CHIN + .10 * W)],
          'eyes': eye_centers, 'ears': ears_j, 'arms': joint_arms, 'legs': joint_legs, 'tail': tail_chain,
          'leaf_anchor': [float(v) for v in LEAF_C[:2]] + [float(top_hit(LEAF_C[0], LEAF_C[1])[0])],
          'leaf_stem_tip': [float(v) for v in LEAF_STEM[-1]],
          'satchel': [float(v) for v in BAG_C], 'pouch': [float(v) for v in POUCH_C],
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth SDF ball (cranium + cheek mass + muzzle displacement), radially projected, analytic normals.',
                    'Eyelid holes ringed by 5 loops each, rim rolled in behind separate lens eyeballs; 3 loops round the mouth.',
                    'Separate pieces: eyes, ears, tail (bend rings), leaf (rigid head follower), satchel + strap, pouch (body followers).']}
if RIG:
    pass
elif not FAST:
    with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-fast.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not FAST and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'tanu-toy.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG: bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('TANU_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
