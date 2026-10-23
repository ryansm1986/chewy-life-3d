"""Kuma, the gentle baker (Toybox villager, VL-1), phase-1 model. Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_kuma-toy.py [-- --fast]

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/kuma-toy.glb (--fast: no toon refinement, writes scratch/kuma-fast.glb instead).

Technique (the Rosie / Golden toy-line machinery):
- The head is ONE smooth implicit ball: a rounded cranium, a wide low superellipsoid cheek mass and a gentle oval
  muzzle, smooth-unioned. Its skin is the field's zero surface reached by radial projection (CDT in a stereographic
  domain, edge loops round both eyelid holes and the mouth), so every vertex carries the field's analytic normal and
  the face stays convex (no sockets). The eyes are separate flush lens globes in real lid holes.
- The nose is a separate glossy rounded-triangle button seated on the muzzle; the ears are thick cupped discs.
- The toque is a tilted band (lathe) under a cloud of five smooth-unioned puffs (an SDF meshed by radial projection).
- Torso, feet, tail, knot and buckle are SDF blobs meshed the same way (analytic normals); arms and legs are tubes with
  bend loops; the apron is one thick cloth slab (CDT of its outline, bib + skirt, the arch cut-out) that follows the
  chest and hangs straight from the belly; the neckerchief is a tube round the neck, a round knot and two leaf ends.
- One 2048 painted atlas: a face chart painted from 3D positions, two eye charts, the apron and belly charts, the ear and
  nose charts and 1-D shading ramps (soft painted light baked into the colour, never hard shadows).
"""
import bpy, bmesh, math, json, os, sys, struct, zlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt
from mathutils.kdtree import KDTree

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
FAST = '--fast' in ARGV
RIG = bool(globals().get('RIG_MODE'))       # set by rig_kuma-toy.py: part labels, rig charts; no approved file is written
if RIG: FAST = False
MODEL = 'D:/projects/chewy-life-3d/public/models/kuma-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'kuma-fast.glb') if FAST else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(5)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
LOG = {}

# ---------------------------------------------------------------- the sheet's measures (measure.md)
# turnaround: ground y 499, hat top y 54 -> 1.40 m (318 px / m); the head close-up: W = 332 px at the cheeks.
W = .676; CHIN = .654; HY = .027            # head width at the cheeks, chin height, head centre y
SW = W / .44                                # Rosie's metric detail sizes (authored at W 0.44) scale by SW

PAL = {'fur': '#A86A44', 'furdark': '#8C5638', 'furlight': '#B0764F',
       'muz': '#E8C49A', 'muzdark': '#D6AB80', 'muzlight': '#F2D5AE',
       'hat': '#F8F5F0', 'hatdark': '#E2DCD6', 'hatlight': '#FFFCF6',
       'apron': '#FFF6E8', 'aprondark': '#EADCC6', 'apronlight': '#FFF9EE', 'flour': '#FFFFFC',
       'green': '#7CC45A', 'greendark': '#62A246', 'greenlight': '#88CA64',
       'iris': '#4B2C20', 'pupil': '#2D1B16', 'nose': '#2D1B16', 'sclera': '#FFF8EF', 'blush': '#EAA095',
       'lash': '#2A1A14', 'brow': '#5A3424', 'mouth': '#2D1B16'}
CHARTS = {'face': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'ear': (1280, 896, 256, 256), 'nose': (1536, 896, 256, 256),
          'apron': (512, 0, 1024, 768), 'belly': (0, 0, 512, 512)}
if RIG:   # phase-2 charts in unused atlas space (the approved paint is untouched)
    CHARTS.update({'lidU': (1536, 0, 512, 256), 'lidD': (1536, 256, 512, 192), 'cavity': (1536, 448, 128, 128), 'tongue': (1664, 448, 128, 128)})
PAINT_OPTS = {'band': True, 'blush': True, 'muzzle': True}     # the rig paints its lids from this skin with the lash band and the blush off
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'muz': ('muzdark', 'muz', 'muzlight'),
         'hat': ('hatdark', 'hat', 'hatlight'), 'apron': ('aprondark', 'apron', 'apronlight'),
         'green': ('greendark', 'green', 'greenlight'), 'nose': ('#1E120E', 'nose', '#5A3C30'),
         'eyedark': ('#1E120C', '#2A1A14', '#4A3024')}
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
def sval(n, occ=0., hi=.30, lo=.26):
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

def sdf_ball(name, f, centre, n, group, ramp, scale=(1, 1, 1), occ_f=None, occ_k=.35, shade=None, t1=.8):
    """mesh the zero set of f by radial projection of a cube-sphere from centre (analytic normals, ramp UVs)"""
    D, F = cube_sphere(n); D = unit(D * np.asarray(scale, float))
    P = ray_outer(f, centre, D, t1=t1); N = grad(f, P)
    occ = occ_k * ao(occ_f, P, N) if occ_f is not None else 0.
    val = shade(P, N) if shade is not None else sval(N, occ)
    return make_obj(name, P, F, ramp_uv(ramp, val), group, N), P, N

def catmull(points, t):
    pts = [np.asarray(p, float) for p in points]; n = len(pts) - 1; k = min(int(t * n), n - 1); f = t * n - k
    p0, p1, p2, p3 = pts[max(0, k - 1)], pts[k], pts[k + 1], pts[min(n, k + 2)]
    return .5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f ** 3)

def limb(name, points, radius, group, rings=14, sides=16, cap_rows=6, cap_len=.9, ramp='fur', occ_f=None, squash=1.0):
    """a tube along a Catmull-Rom centreline with even bend loops; buried start fan; rounded (mitten) end cap"""
    V = []; NV = []; rows = []
    old = None
    def frame(t):
        p = catmull(points, t); d = unit(catmull(points, min(1, t + .002)) - catmull(points, max(0, t - .002)))
        return p, d
    for j in range(rings + 1):
        t = j / rings; p, d = frame(t)
        ref = np.array([0, 1., 0]) if abs(d[1]) < .95 else np.array([1., 0, 0])
        x = unit(np.cross(d, ref)) if old is None else unit(old - d * (old @ d)); y = np.cross(d, x); old = x
        r = radius(t); row = []
        for i in range(sides):
            a = 2 * PI * i / sides; q = p + x * (r * math.cos(a)) + y * (r * squash * math.sin(a))
            row.append(len(V)); V.append(q); NV.append(unit(x * math.cos(a) * squash + y * math.sin(a)))
        rows.append(row)
    p, d = frame(1.0); r = radius(1.0)
    for k in range(1, cap_rows):
        a = k / cap_rows * PI / 2; c = p + d * (r * cap_len * math.sin(a)); row = []
        for i in range(sides):
            b = 2 * PI * i / sides; q = c + (x * math.cos(b) + y * squash * math.sin(b)) * (r * math.cos(a))
            row.append(len(V)); V.append(q)
            NV.append(unit((x * math.cos(b) * squash + y * math.sin(b)) * math.cos(a) / max(squash, .5) + d * math.sin(a) / cap_len))
        rows.append(row)
    tip = len(V); V.append(p + d * r * cap_len); NV.append(d)
    p0, d0 = frame(0.); st = len(V); V.append(p0 - d0 * radius(0.) * .3); NV.append(-d0)
    F = []
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(sides): F.append((a_[i], a_[(i + 1) % sides], b_[(i + 1) % sides], b_[i]))
    for i in range(sides): F.append((rows[-1][i], rows[-1][(i + 1) % sides], tip))
    for i in range(sides): F.append((rows[0][(i + 1) % sides], rows[0][i], st))
    V = np.array(V); NV = np.array(NV)
    occ = .35 * ao(occ_f, V, NV) if occ_f is not None else 0.
    return make_obj(name, V, F, ramp_uv(ramp, sval(NV, occ)), group, NV), V

# ================================================================ HEAD: the smooth ball (W units, z above the chin)
# round 2: the upper head is a soft squircle (0.86 W wide at 0.60 W) with a flat top the toque band sits on
# round 3: a chubby squircle, round in plan (fitted by scratch/opt_head.py: 1.00 / 0.94 / 0.84 W at z 0.25 / 0.45 / 0.60)
CR = ([0, .020, .3992], [.4717, .3949, .3179], (2.5, 2.0, 2.625))   # cranium: oval in plan, rounding onto the top
CK = ([0, -.020, .1751], [.4891, .372, .2309], (2.364, 2.1, 2.4), 3.2, .1801)   # the wide, chubby cheek mass (fuller jaw below)
# round 3: the muzzle is a smooth displacement of the ball (no union crease): 0.028 W at its centre, zero slope at its
# edge, its lower half fading into the chin over 0.22 W
MZ = ([0, -.360, .190], [.200, .150, .235])                     # centre; half-width, upper and lower fall-off (W)
MZ_A = .046                                     # round 4: the muzzle comes forward with the nose (flat-topped fall-off)
K_CK, K_MZ = .1472, .050
# round 4: the back of the head rounds into the sheet's ball in profile: a large rear ellipsoid trims only the upper- and
# lower-back corners (about 0.08 W); the mid-height depth, the front widths and the corners under the band are untouched
BK = ([0, .000, .385], [.700, .430, .310], (2., 2., 2.), 2., .380); K_BK = .035
# ... and a second one softens the upper back-side by the ears (about 0.03 W in plan, scratch/fit_side.py)
BK2 = ([0, .100, .400], [.490, .500, .340], (2., 2., 2.), 2., .420); K_BK2 = .100
def head_local(q, cut=True):
    d = smin(sell(q, *CR), sell(q, *CK), K_CK)
    if cut:                                                    # both act on the back half only
        back = .5 * smooth(.04, -.16, q[..., 1])
        d = smax(d, sell(q, *BK) - back, K_BK); d = smax(d, sell(q, *BK2) - .5 * smooth(.12, -.30, q[..., 1]), K_BK2)
    dz = q[..., 2] - MZ[0][2]; r = np.sqrt((q[..., 0] / MZ[1][0]) ** 2 + (dz / np.where(dz < 0, MZ[1][2], MZ[1][1])) ** 2)
    return d - MZ_A * (1 - smoother(.22, 1, r)) * smooth(-.12, -.28, q[..., 1])
# the lowest point of the ball sits on the chin line (z = 0)
_g = np.stack(np.meshgrid(np.linspace(-.5, .5, 81), np.linspace(-.6, .6, 97), np.linspace(-.12, .12, 241), indexing='ij'), -1).reshape(-1, 3)
ZMIN = float(_g[head_local(_g, cut=False) < 0][:, 2].min())        # the chin line comes from the front (the uncut ball)
for blob in (CR, CK, MZ, BK, BK2): blob[0][2] -= ZMIN
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

# ---------------------------------------------------------------- face layout (front projection, metres)
EX = .224 * W; EZ = CHIN + .316 * W; EHW = .095 * W; EHH = .097 * W; EN = 2.15
def eye_unit(psi):
    return spow(np.cos(psi), 2 / EN), spow(np.sin(psi), 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
MUZ_C = CHIN + .166 * W; MUZ_HW = .1835 * W; MUZ_HH = .1325 * W          # painted muzzle oval
NOSE_Z = CHIN + .252 * W; NOSE_HW = .054 * W; NOSE_TOP = CHIN + .281 * W; NOSE_BOT = CHIN + .221 * W
MZM = CHIN + .181 * W; MHW = .083 * W                                     # the "w" mouth
BROW_X = .204 * W; BROW_Z = CHIN + .503 * W; BROW_L = .048 * W
BLUSH = (.340 * W, CHIN + .203 * W, .062 * W, .0435 * W)

# ---------------------------------------------------------------- the toque (needed by the head paint and fill)
TAU = math.radians(9)                                   # the hat leans back 9 deg (the band's back is lower)
HEZ = np.array([0, math.sin(TAU), math.cos(TAU)]); HEY = np.array([0, math.cos(TAU), -math.sin(TAU)]); HEX = np.array([1., 0, 0])
HT0 = np.array([0, .044, 1.161])                        # the band's top ring centre
BAND_R = (.172, .186)
def hat_local(p):
    d = p - HT0; return np.stack([d @ HEX, d @ HEY, d @ HEZ], -1)
def hat_world(q): return HT0 + q[..., 0:1] * HEX + q[..., 1:2] * HEY + q[..., 2:3] * HEZ
def band_inside(p, grow=0.):
    q = hat_local(p); return ((q[..., 0] / (BAND_R[0] + grow)) ** 2 + (q[..., 1] / (BAND_R[1] + grow)) ** 2 < 1) & (q[..., 2] > -.30)
def band_cover(p):
    """1 where the band hides the head (inside its cylinder, above its lowest edge)"""
    q = hat_local(p); r = np.sqrt((q[..., 0] / BAND_R[0]) ** 2 + (q[..., 1] / BAND_R[1]) ** 2)
    return (1 - smooth(.97, 1.03, r)) * smooth(-.20, -.16, q[..., 2])

# ---------------------------------------------------------------- the fur shade (shared by the face chart and the ramps)
def head_occ(P, n):
    q = hat_local(P); r = np.sqrt((q[..., 0] / BAND_R[0]) ** 2 + (q[..., 1] / BAND_R[1]) ** 2)
    o = .16 * smooth(1.18, .98, r) * smooth(-.24, -.12, q[..., 2])           # contact shade under the band
    for s in (-1, 1):
        dd = np.linalg.norm(P - EAR_C[s], axis=-1); o = o + .10 * np.exp(-(dd / (.12 * W)) ** 2)
    return o
def head_shade(P, n): return sval(n, head_occ(P, n), hi=.18, lo=.24)        # round 2: the light is a soft value change only
EAR_C = {s: np.array([s * .402 * W, HY + .030, CHIN + .632 * W]) for s in (-1, 1)}   # on the squircle's corners

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
for k, (hx, hz) in enumerate([(.098, .024), (.113, .034), (.128, .045)]):
    a = np.linspace(0, 2 * PI, 40, endpoint=False)
    add_loop(to_dom(surf_dir(hx * W * spow(np.cos(a), .8), MZM - .004 * W + hz * W * np.sin(a))), 'mouth_%d' % k)
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
band2 = (np.abs(P2[:, 0]) < .44 * W) & (P2[:, 2] > CHIN + .10 * W) & (P2[:, 2] < CHIN + .58 * W)
D2 = D2[band2]; P2 = P2[band2]
Pf0 = radial_hit(D)
inband = (np.abs(Pf0[:, 0]) < .44 * W) & (Pf0[:, 2] > CHIN + .10 * W) & (Pf0[:, 2] < CHIN + .58 * W) & (np.arccos(np.clip(-D[:, 1], -1, 1)) < math.radians(62))
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
keep &= ~(front & ((Pf[:, 0] / (.142 * W)) ** 2 + ((Pf[:, 2] - MZM) / (.062 * W)) ** 2 < 1))
hidden = band_cover(Pf) > .5
keep &= ~hidden | (np.arange(len(D)) % 4 == 0)
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
        vis = (Pt[:, :, 1] < HY + .02).all(1) & (band_cover(Pt.mean(1)) < .5) & seen
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
def rounded_poly(corners, radii, n_arc=8):
    """closed outline through filleted corners (convex or concave), CCW in, CCW out"""
    out = []; m = len(corners)
    for i in range(m):
        P = np.asarray(corners[i], float); A = np.asarray(corners[i - 1], float); B = np.asarray(corners[(i + 1) % m], float)
        u1 = unit(A - P); u2 = unit(B - P); ang = math.acos(float(np.clip(u1 @ u2, -1, 1))); r = radii[i]
        if r <= 0 or ang > PI - 1e-3: out.append(P); continue
        dist = r / math.tan(ang / 2); bis = unit(u1 + u2); C = P + bis * (r / math.sin(ang / 2))
        T1 = P + u1 * dist; T2 = P + u2 * dist
        a1 = math.atan2(T1[1] - C[1], T1[0] - C[0]); a2 = math.atan2(T2[1] - C[1], T2[0] - C[0])
        da = (a2 - a1 + PI) % (2 * PI) - PI
        for k in range(n_arc + 1):
            a = a1 + da * k / n_arc; out.append(C + r * np.array([math.cos(a), math.sin(a)]))
    return np.array(out)
def resample(poly, step):
    seg = np.linalg.norm(np.roll(poly, -1, 0) - poly, axis=1); L = np.concatenate([[0], np.cumsum(seg)])
    n = max(8, int(round(L[-1] / step))); t = np.linspace(0, L[-1], n, endpoint=False)
    P = np.concatenate([poly, poly[:1]]); return np.stack([np.interp(t, L, P[:, 0]), np.interp(t, L, P[:, 1])], -1)
def _nose_outline(n=48):
    # a soft inverted triangle: broad rounded top, the sides tapering to a round point (0.108 x 0.060 W)
    t = np.linspace(0, 2 * PI, n, endpoint=False); u = np.cos(t); v = np.sin(t)
    y = .030 * W * spow(v, .85); taper = (.40 + .60 * ((v + 1) / 2) ** .9)
    x = .066 * W * spow(u, .80) * taper
    return np.stack([x, y + .002 * W], -1)
NOSE_OUT = _nose_outline()
NOSE_H = .038                                                   # the button stands 38 mm proud
def build_nose():
    cen = np.array([0., NOSE_Z]); rows = []; V = []; UV = []; NN = []
    rings = [1.0, .985, .94, .85, .70, .50, .27]                   # inset rings toward the dome top
    prof = [-.003, .013, .0235, .0307, .035, .0371, .038]          # height above the muzzle (m): rolled edge, round dome
    for k, sc in enumerate(rings):
        x = NOSE_OUT[:, 0] * sc; z = NOSE_Z + NOSE_OUT[:, 1] * sc
        y = front_hit(x, z); B = np.stack([x, y, z], -1); n = grad_n(B)
        up = unit(np.array([0, -1., .35]))                           # the button faces forward and a touch up
        P = B + unit(n + up) * prof[k]
        row = []
        for i in range(len(P)):
            row.append(len(V)); V.append(P[i]); UV.append((.5 + NOSE_OUT[i, 0] * sc / (.13 * W), .5 + NOSE_OUT[i, 1] * sc / (.13 * W)))
        rows.append(row)
    top = len(V); Bc = np.array([0., float(front_hit(0., NOSE_Z)[0]), NOSE_Z]); nc = grad_n(Bc[None])[0]
    V.append(Bc + unit(nc + unit(np.array([0, -1., .35]))) * NOSE_H); UV.append((.5, .5))
    F = []; m = len(NOSE_OUT)
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(m): F.append((a_[i], a_[(i + 1) % m], b_[(i + 1) % m], b_[i]))
    for i in range(m): F.append((rows[-1][i], rows[-1][(i + 1) % m], top))
    return make_obj('nose_button', np.array(V), F, au('nose', *np.array(UV).T), 'head', recalc=False)
build_nose()

# ================================================================ EARS: thick round cupped discs
ear_info = {}
for s in (-1, 1):
    C0 = EAR_C[s]; ne = unit(np.array([s * math.sin(math.radians(40)), -math.cos(math.radians(40)), .14]))
    up = np.array([0, 0, 1.]); up = unit(up - ne * (up @ ne)); tt = np.cross(up, ne)
    at = au_ = .131 * W; an, dish = .048 * W, .025 * W
    seg, rows_ = 30, 12; V = []; UV = []; front_rows = []
    for j in range(rows_ + 1):
        ph = PI * j / rows_
        for i in range(seg):
            th = 2 * PI * i / seg; rho = math.sin(ph); fz = math.cos(ph)
            if fz > 0: off = an * fz ** .55 - dish * (1 - float(smooth(0, .72, rho)))
            else: off = 3.0 * an * fz
            V.append(C0 + tt * (at * rho * math.cos(th)) + up * (au_ * rho * math.sin(th)) + ne * off)
    V = np.array(V); fs = []; uvs_e = []
    ruv_e = None
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
                n_ = unit(np.array(lp.vert.normal)); lp[uvl].uv = tuple(ramp_uv('fur', sval(n_[None], .06))[0])
    bm.to_mesh(ob.data); bm.free()
    ear_info[s] = (C0, ne, up, tt)

# ================================================================ THE TOQUE: tilted band + cloud of puffs
BAND_PROF = [(-.175, 1.0), (-.11, 1.0), (-.06, 1.006), (-.025, 1.006), (-.010, 1.0), (-.003, .985), (0., .955), (.004, .90)]
def build_band():
    N = 80; V = []; rows = []
    for h, sc in BAND_PROF:
        row = []
        for i in range(N):
            a = 2 * PI * i / N; q = np.array([BAND_R[0] * sc * math.sin(a), -BAND_R[1] * sc * math.cos(a), h])
            row.append(len(V)); V.append(hat_world(q[None])[0])
        rows.append(row)
    F = []
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(N): F.append((a_[i], a_[(i + 1) % N], b_[(i + 1) % N], b_[i]))
    V = np.array(V); ob = make_obj('toque_band', V, F, np.zeros((len(V), 2)), 'hat', recalc=False)
    me = ob.data; me.update()
    Nn = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('normal', Nn); Nn = Nn.reshape(-1, 3)
    val = sval(Nn, .30 * ao(cloud_sdf, V, Nn, .04))
    uvl = me.uv_layers['Atlas']; lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
    uvl.data.foreach_set('uv', ramp_uv('hat', val)[lv].astype(np.float32).ravel())
    return ob
LOBES = [([0, .005, .040], [.185, .180, .050]),          # the cloud's body, wider than the band
         ([0, -.095, .102], [.158, .150, .130]),          # front puff (the tallest, 1.40 m)
         ([0, .130, .140], [.168, .158, .100]),           # back puff (its bottom clears the band: the band shows from behind)
         ([-.175, .010, .098], [.135, .158, .102]),       # side puffs
         ([.175, .010, .098], [.135, .158, .102])]
def cloud_local(q):
    d = ell(q, *LOBES[0])
    for c, r in LOBES[1:]: d = smin(d, ell(q, c, r), .020)
    return d
def cloud_sdf(p): return cloud_local(hat_local(p))
def hat_shade(P, N):
    return sval(N, .55 * ao(cloud_sdf, P, N, .05), hi=.26, lo=.30)
band_ob = build_band()
cloud_ob, CLP, CLN = sdf_ball('toque_cloud', cloud_sdf, hat_world(np.array([[0, .01, .08]]))[0], 9 if FAST else 14, 'hat', 'hat', shade=hat_shade, t1=.6)

# ================================================================ BODY: torso, tail
TB = ([0, -.005, .330], [.320, .275, .280]); TC = ([0, .030, .535], [.278, .205, .160]); TH = ([0, .040, .200], [.280, .240, .160])
def torso_sdf(p):
    d = smin(ell(p, *TB), ell(p, *TC), .08); return smin(d, ell(p, *TH), .06)
def body_occ(p):
    return np.minimum(head_sdf(p), np.minimum(scarf_sdf_approx(p), 9.))
def scarf_sdf_approx(p):
    return ell(p, [0, .02, .625], [.25, .23, .045])
def torso_shade(P, N): return sval(N, .30 * ao(body_occ, P, N, .05), hi=.18, lo=.24)
TORSO_O = np.array([0, .010, .380])
def body_ray(theta, z, f=torso_sdf):
    theta = np.asarray(theta, float); z = np.asarray(z, float) * np.ones_like(theta)
    d = np.stack([np.sin(theta), -np.cos(theta), np.zeros_like(theta)], -1)
    o = np.stack([np.zeros_like(theta), np.full_like(theta, .010), z], -1)
    lo = np.zeros(len(theta)); hi = np.full(len(theta), .6)
    for _ in range(36):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0; lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    P = o + d * ((lo + hi) / 2)[:, None]; return P, grad(f, P)
def build_torso():
    D, F = cube_sphere(9 if FAST else 13); D = unit(D * np.array([1., 1., 1.25]))
    P = ray_outer(torso_sdf, TORSO_O, D); N = grad(torso_sdf, P)
    val = torso_shade(P, N)
    # the belly chart (front projection) for front-facing faces: the tan belly oval shows through the bib's arch
    uvF = []
    for f in F:
        c = P[list(f)].mean(0); nm = unit(N[list(f)].mean(0))
        if nm[1] < -.25 and .12 < c[2] < .64 and abs(c[0]) < .34:
            uvF.append([tuple(au('belly', .5 + P[i, 0] / .76, (P[i, 2] - .10) / .56)) for i in f])
        else:
            uvF.append([tuple(ramp_uv('fur', val[i:i + 1])[0]) for i in f])
    return make_obj('torso', P, F, uvF, 'body', N)
build_torso()
TAIL = ([0, .294, .272], [.072, .062, .070])
def tail_sdf(p): return ell(p, *TAIL)
tail_ob, _, _ = sdf_ball('stub_tail', tail_sdf, np.array(TAIL[0]), 6 if FAST else 7, 'tail', 'fur', occ_f=torso_sdf)

# ================================================================ ARMS (A-pose 35 deg) and LEGS + FEET
joint_arms = {}; joint_legs = {}
ARM_DEG = 38.
for s, tag in ((-1, 'R'), (1, 'L')):
    sh = np.array([s * .258, .000, .572]); a = math.radians(ARM_DEG)
    dvec = np.array([s * math.sin(a), -.06, -math.cos(a)]); dvec = unit(dvec)
    root = sh - dvec * .07; elbow = sh + dvec * .135; wrist = sh + dvec * .245
    pts_ = [root, sh, elbow + np.array([0, -.004, 0]), wrist]
    rad = lambda t: .095 - .014 * float(smooth(.15, .75, t)) + .009 * float(smooth(.80, 1., t))
    limb('arm.' + tag, pts_, rad, 'arm.' + tag, rings=16, sides=18, cap_rows=7, cap_len=1.05, occ_f=torso_sdf, squash=.92)
    joint_arms[tag] = {'shoulder': [float(v) for v in sh], 'elbow': [float(v) for v in elbow], 'wrist': [float(v) for v in wrist],
                       'paw_tip': [float(v) for v in wrist + dvec * .086 * 1.05]}
FOOT = dict(r=[.132, .172, .052], p=(3.0, 3.1, 2.4), pzlo=4.0, rzlo=.046)
def foot_sdf_s(s):
    c = np.array([s * .172, -.030, .046])
    def f(p):
        d = sell(p, c, FOOT['r'], FOOT['p'], FOOT['pzlo'], FOOT['rzlo'])
        for k in (-1, 1):            # two shallow toe grooves on the front of the foot
            g = ell(p, c + np.array([k * .044, -.207, .040]), [.0070, .022, .046])
            d = smax(d, -g, .007)
        return d
    return f, c
for s, tag in ((-1, 'R'), (1, 'L')):
    hip = np.array([s * .165, .020, .300]); knee = np.array([s * .170, .010, .190]); ankle = np.array([s * .172, .000, .085])
    limb('leg.' + tag, [hip + np.array([0, 0, .03]), hip, knee, ankle], lambda t: .118 - .004 * float(smooth(.5, 1, t)), 'leg.' + tag,
         rings=8, sides=18, cap_rows=3, cap_len=.5, occ_f=torso_sdf)
    ff, fc = foot_sdf_s(s)
    def foot_shade(P, N, ff=ff, fc=fc):
        lat = (P[:, 0] - fc[0]) / .132; frontz = smooth(-.11, -.16, P[:, 1] - fc[1]) * smooth(.008, .025, P[:, 2]) * smooth(.095, .07, P[:, 2])
        groove = sum(np.exp(-((lat - k * .333) / .035) ** 2) for k in (-1, 1)) * frontz
        return sval(N, .24 * groove)
    sdf_ball('foot.' + tag, ff, fc + np.array([0, 0, .01]), 8 if FAST else 11, 'leg.' + tag, 'fur', shade=foot_shade, t1=.4)
    joint_legs[tag] = {'hip': [float(v) for v in hip], 'knee': [float(v) for v in knee], 'ankle': [float(v) for v in ankle],
                       'toe': [float(fc[0]), float(fc[1] - .17), .040]}

# ================================================================ APRON: one thick slab (bib + skirt, the arch), waist tie, buckle
R_REF = .30; Z_BM = .330                    # lateral arc scale; the belly's widest height (the skirt hangs straight below it)
T_BACK = .003
def t_front(s, z): return .018 + 0 * z                                         # 15 mm cloth, one continuous panel (round 3: no ledge)
def apron_point(s, z, t):
    # round 2: the cloth wraps the round belly. It follows the fur (offset t along the normal); below the belly's widest
    # point it hangs a little free (up to 25 mm at the hem, horizontally), and the hem curves up toward the sides.
    s = np.asarray(s, float); z = np.asarray(z, float); th = s / R_REF
    zz = z + .034 * (s / SK_W) ** 2 * smooth(SK_BOT + .11, SK_BOT, z)
    B, N = body_ray(th, zz); Nh = unit(N * np.array([1., 1., 0.]))
    hang = .025 * smooth(Z_BM, SK_BOT, zz)
    tt = np.asarray(t, float)[..., None] if np.ndim(t) else t
    return B + N * tt + Nh * hang[..., None], N
SK_W = .360; SK_TOP = .474; SK_BOT = .165; BIB_W0 = .214; BIB_W1 = .238; BIB_TOP = .628
def _apron_outline():
    # round 3: the bib widens smoothly into the skirt: each side is one curve from the bib's top corner down to the skirt's
    # widest point (z 0.31), then straight to rounded bottom corners (r 0.06 m); CCW in (s, z)
    rb, rt, ZW = .060, .016, .310
    side = []
    for z in np.linspace(SK_BOT + rb, BIB_TOP - rt, 60):
        t = clamp((z - ZW) / (BIB_TOP - rt - ZW)); w = SK_W - (SK_W - BIB_W0) * float(smoother(0, 1, t ** .85))
        side.append((w, z))
    side = np.array(side)
    def arc(c, r, a0, a1, n=10): return [(c[0] + r * math.cos(a), c[1] + r * math.sin(a)) for a in np.linspace(a0, a1, n)]
    pts = arc((SK_W - rb, SK_BOT + rb), rb, -PI / 2, 0) + list(map(tuple, side)) + arc((BIB_W0 - rt, BIB_TOP - rt), rt, 0, PI / 2)
    pts += arc((-BIB_W0 + rt, BIB_TOP - rt), rt, PI / 2, PI) + [(-w, z) for w, z in side[::-1]] + arc((-SK_W + rb, SK_BOT + rb), rb, PI, 1.5 * PI)
    return np.array(pts)
OUTLINE = _apron_outline()
ARCH = [(-.118, .470)] + [(.118 * math.cos(a), .470 + .104 * math.sin(a)) for a in np.linspace(PI, 0, 15)[1:-1]] + [(.118, .470)]
ARCH = rounded_poly(ARCH[::-1], [0.] * len(ARCH), 2)    # hole loop
def build_apron():
    out = resample(OUTLINE, .017); hole = resample(np.array(ARCH), .015)
    # CCW checks
    def area(p): return .5 * np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1])
    if area(out) < 0: out = out[::-1]
    if area(hole) > 0: hole = hole[::-1]                  # the hole runs clockwise
    gx, gz = np.meshgrid(np.arange(-.40, .40, .034), np.arange(.14, .66, .030))
    G = np.stack([gx.ravel(), gz.ravel()], -1); G[:, 0] += .017 * (np.round((G[:, 1] - .14) / .030) % 2)
    ok = in_poly(G, out) & ~in_poly(G, hole)
    def dist_to(Pp, loop):
        d = np.full(len(Pp), 9.)
        for i in range(len(loop)):
            a = loop[i]; b = loop[(i + 1) % len(loop)]; ab = b - a; t = np.clip(((Pp - a) @ ab) / (ab @ ab), 0, 1)
            d = np.minimum(d, np.linalg.norm(Pp - (a + t[:, None] * ab), axis=1))
        return d
    ok &= (dist_to(G, out) > .013) & (dist_to(G, hole) > .012)
    G = G[ok]
    P2 = np.concatenate([out, hole, G]); nO = len(out); nH = len(hole)
    cons_ = [(i, (i + 1) % nO) for i in range(nO)] + [(nO + i, nO + (i + 1) % nH) for i in range(nH)]
    res = delaunay_2d_cdt([Vector(p) for p in P2], cons_, [], 0, 1e-9)
    vout = np.array([[v.x, v.y] for v in res[0]]); Fo = np.array([list(f) for f in res[2]])
    assert len(vout) == len(P2), 'apron CDT merged points'
    cen = vout[Fo].mean(1); keepf = in_poly(cen, out) & ~in_poly(cen, hole); Fo = Fo[keepf]
    n2 = len(vout)
    tf = t_front(vout[:, 0], vout[:, 1])
    Pf, Nf = apron_point(vout[:, 0], vout[:, 1], tf); Pb, Nb = apron_point(vout[:, 0], vout[:, 1], np.full(n2, T_BACK))
    V = list(Pf) + list(Pb); UV = [(s_, z_) for s_, z_ in vout] * 2
    F = [tuple(f) for f in Fo] + [tuple(n2 + f[::-1]) for f in Fo]
    # rounded rim on the outline and round the arch
    R = 3
    for loop0, nL, sgn in ((0, nO, 1), (nO, nH, -1)):
        L2 = vout[loop0:loop0 + nL]
        tang = np.roll(L2, -1, 0) - np.roll(L2, 1, 0); m = unit(np.stack([tang[:, 1], -tang[:, 0]], -1))   # outward for CCW
        # (the hole runs clockwise, so the same right-hand normal points out of the cloth, into the hole)
        rows = [list(range(loop0, loop0 + nL))]
        tmid = (t_front(L2[:, 0], L2[:, 1]) + T_BACK) / 2; hh = (t_front(L2[:, 0], L2[:, 1]) - T_BACK) / 2
        for j in range(1, R):
            ph = PI * j / R; q = L2 + m * (hh * .9 * math.sin(ph))[:, None]
            Pj, _ = apron_point(q[:, 0], q[:, 1], tmid + hh * math.cos(ph))
            rows.append(list(range(len(V), len(V) + nL))); V += list(Pj); UV += [tuple(v) for v in q]
        rows.append(list(range(n2 + loop0, n2 + loop0 + nL)))
        for a_, b_ in zip(rows, rows[1:]):
            for i in range(nL):
                F.append((a_[i], b_[i], b_[(i + 1) % nL], a_[(i + 1) % nL]))
    UV = np.array(UV); uv = au('apron', (UV[:, 0] + .40) / .80, (UV[:, 1] - .14) / .52)
    ob = make_obj('apron_panel', np.array(V), F, uv, 'apron')
    return ob, out, hole
apron_ob, APRON_OUT, APRON_HOLE = build_apron()
def build_belt():
    th = np.linspace(1.02, 2 * PI - 1.02, 70); prof = [(-.026, .0045), (-.023, .010), (-.017, .0132), (.017, .0132), (.023, .010), (.026, .0045)]
    V = []; rows = []
    for dz, t in prof:
        B, N = body_ray(th, .400 + dz); P = B + N * t; rows.append(list(range(len(V), len(V) + len(th)))); V += list(P)
    F = []
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(len(th) - 1): F.append((a_[i], a_[i + 1], b_[i + 1], b_[i]))
    for r_ in (0, len(th) - 1):        # end caps (tucked under the skirt)
        F.append(tuple(rows[k][r_] for k in range(len(prof)))[::(1 if r_ else -1)])
    V = np.array(V); ob = make_obj('waist_tie', V, F, np.zeros((len(V), 2)), 'apron', recalc=False); me = ob.data; me.update()
    Nn = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('normal', Nn); Nn = Nn.reshape(-1, 3)
    uvl = me.uv_layers['Atlas']; lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
    uvl.data.foreach_set('uv', ramp_uv('apron', sval(Nn))[lv].astype(np.float32).ravel())
build_belt()
_Bb, _Nb = body_ray(np.array([PI]), .400)
BUCKLE_C = _Bb[0] + _Nb[0] * .018
def buckle_sdf(p): return sell(p, BUCKLE_C, [.056, .013, .047], (4.0, 2.2, 4.0))
sdf_ball('tie_buckle', buckle_sdf, BUCKLE_C, 6 if FAST else 7, 'apron', 'apron', t1=.12)

# ================================================================ NECKERCHIEF: tube round the neck, knot, two leaf ends
def build_scarf():
    th = np.linspace(0, 2 * PI, 52, endpoint=False); zc = .622 - .016 * np.cos(th)
    B, N = body_ray(th, zc); Nh = unit(N * np.array([1, 1, .25])); C = B + Nh * .021
    back = smooth(.2, 1., -np.cos(th)); fr_ = 1 - back
    hh = .032 + .005 * back; htv = (.011 + .006 * fr_) * (1 + .14 * np.sin(4 * th + .5))   # a soft folded cloth: 34 mm thick at the front, thinner behind
    C = B + Nh * (.012 + htv[:, None] * .9)
    sides = 12; V = []; NV = []; rows = []
    for i in range(len(th)):
        up = np.array([0, 0, 1.]); up = unit(up - Nh[i] * (up @ Nh[i])); row = []
        for k in range(sides):
            a = 2 * PI * k / sides; ca, sa = math.cos(a), math.sin(a)
            u = spow(np.array(ca), .70); v = spow(np.array(sa), .85); ht = htv[i]
            P = C[i] + Nh[i] * (ht * float(u)) + up * (hh[i] * float(v)) - up * .006 * back[i] * (1 - abs(sa)) + up * min(sa, 0.) * .024 * back[i] ** 2
            row.append(len(V)); V.append(P); NV.append(unit(Nh[i] * ca / ht + up * sa / hh[i]))
        rows.append(row)
    F = []; n = len(th)
    for i in range(n):
        a_, b_ = rows[i], rows[(i + 1) % n]
        for k in range(sides): F.append((a_[k], b_[k], b_[(k + 1) % sides], a_[(k + 1) % sides]))
    V = np.array(V); NV = np.array(NV)
    return make_obj('neckerchief_band', V, F, ramp_uv('green', sval(NV, .25 * ao(head_sdf, V, NV, .04))), 'scarf', NV), B, N
scarf_ob, SCB, SCN = build_scarf()
_Bk, _Nk = body_ray(np.array([0.]), .598)
KNOT_C = _Bk[0] + _Nk[0] * .050
def knot_sdf(p):                     # round 2: one smooth round knot (no crease)
    return ell(p, KNOT_C, [.054, .036, .047])
sdf_ball('neckerchief_knot', knot_sdf, KNOT_C, 6 if FAST else 7, 'scarf', 'green', occ_f=head_sdf, t1=.12)
def torso_front(x, z):
    y = front_hit(x, z, torso_sdf, -.6, .3); P = np.stack([x, y, z], -1); return P, grad(torso_sdf, P)
def build_leaf(s):
    base = np.array([s * .016, .575]); dirv = unit(np.array([s * math.sin(math.radians(38)), -math.cos(math.radians(38))]))
    perp = np.array([-dirv[1], dirv[0]]); L = .122; hw = .030
    NT, NW = 15, 11; tg = np.linspace(0, 1, NT); wg = np.linspace(-1, 1, NW)
    halfw = hw * np.sin(PI * tg ** .78) ** .75
    V = []; UV = []
    grid = {}
    for side in (0, 1):
        for i, t in enumerate(tg):
            for j, w in enumerate(wg):
                q = base + dirv * (L * t) + perp * (halfw[i] * w)
                P, N = torso_front(np.array([q[0]]), np.array([q[1]]))
                thick = .024 * (1 - abs(w) ** 2.2) ** .45 * (.75 + .25 * math.sin(PI * min(1, t * 1.3))) * (1 - .55 * t ** 3)
                crease = .0035 * math.exp(-(w / .16) ** 2) * math.sin(PI * t)
                off = .025 + (thick - crease if side == 0 else 0.)
                grid[(side, i, j)] = len(V); V.append(P[0] + N[0] * off); UV.append(w)
    F = []
    for i in range(NT - 1):
        for j in range(NW - 1):
            a, b, c, d = grid[(0, i, j)], grid[(0, i, j + 1)], grid[(0, i + 1, j + 1)], grid[(0, i + 1, j)]
            F.append((a, b, c, d))
            a, b, c, d = grid[(1, i, j)], grid[(1, i, j + 1)], grid[(1, i + 1, j + 1)], grid[(1, i + 1, j)]
            F.append((d, c, b, a))
    for i in range(NT - 1):
        for j in (0, NW - 1):
            F.append((grid[(0, i, j)], grid[(0, i + 1, j)], grid[(1, i + 1, j)], grid[(1, i, j)])[::(1 if j == 0 else -1)])
    V = np.array(V); ob = make_obj('neckerchief_end.' + ('L' if s > 0 else 'R'), V, F, np.zeros((len(V), 2)), 'scarf_end.' + ('L' if s > 0 else 'R'))
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-7); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data); bm.free(); me = ob.data; me.update()
    Nn = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('normal', Nn); Nn = Nn.reshape(-1, 3)
    Vv = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', Vv); Vv = Vv.reshape(-1, 3)
    uvl = me.uv_layers['Atlas']; lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
    uvl.data.foreach_set('uv', ramp_uv('green', sval(Nn, .22 * ao(knot_sdf, Vv, Nn, .03)))[lv].astype(np.float32).ravel())
    return base, dirv, L
LEAVES = {s: build_leaf(s) for s in (-1, 1)}

# ================================================================ PAINTED ATLAS (2048, deterministic PNG)
def stroke(x, z, P, half, aa):
    best = np.full(len(x), 9.)
    for i in range(len(P) - 1):
        a = P[i]; b = P[i + 1]; ab = b - a; L2 = ab @ ab
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        dx = x - (a[0] + t * ab[0]); dz = z - (a[1] + t * ab[1])
        best = np.minimum(best, np.sqrt(dx * dx + dz * dz) - (half[i] * (1 - t) + half[i + 1] * t))
    return 1 - smooth(-aa, aa, best)
def lash_th(psi):      # the upper lash line: thick on top, swelling to the outer corner (psi 0 = outer side)
    return (.045 + .17 * np.sin(np.clip(psi, 0, PI)) ** .55 + .07 * np.exp(-((psi - .35) / .40) ** 2)) * smooth(-.10, .25, psi)
def paint_face(U, V):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = radial_hit(d); n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    fr = smooth(HY + .02, HY - .08, y)
    C = ramp_colour('fur', head_shade(P, n))
    # the muzzle: a clean oval in the front view, its own soft light
    rm = np.sqrt((x / MUZ_HW) ** 2 + ((z - MUZ_C) / MUZ_HH) ** 2)
    C = mix(C, ramp_colour('muz', sval(n, 0., hi=.20, lo=.17)), (1 - smooth(.985, 1.015, rm)) * fr * PAINT_OPTS['muzzle'])
    # blush ovals
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .93 * (1 - smooth(.86, 1.05, r)) * fr * PAINT_OPTS['blush'])
    # brows: soft arcs tapering to rounded points
    t = np.linspace(-1, 1, 15)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * BROW_L * t, BROW_Z + .016 * W * (1 - t * t) - .006 * W], -1)
        half = .0128 * W * np.maximum(0, 1 - t * t) ** .70 + .0012 * W
        box = (np.abs(x - s * BROW_X) < .09 * W) & (np.abs(z - BROW_Z) < .05 * W) & (fr > 0)
        a = np.zeros(len(x)); a[box] = stroke(x[box], z[box], Pb, half, .0030 * W)
        C = mix(C, rgb('brow'), .95 * a)
    # the "w" smile and the philtrum line
    tt_ = np.linspace(0, 1, 9)
    lw = .0042 * W
    for s in (-1, 1):
        # corner tick -> low point -> centre (under the philtrum)
        Pm = np.array([catmull([(s * .090 * W, MZM + .020 * W), (s * .079 * W, MZM + .006 * W), (s * .043 * W, MZM - .015 * W),
                                (s * .008 * W, MZM - .002 * W), (0, MZM + .004 * W)], q) for q in np.linspace(0, 1, 17)])
        half = np.full(len(Pm), lw); half[0] = lw * .55; half[1] = lw * .8
        ib = (np.abs(x) < .12 * W) & (np.abs(z - MZM) < .05 * W) & (fr > 0)
        a = np.zeros(len(x)); a[ib] = stroke(x[ib], z[ib], Pm, half, .0026 * W); C = mix(C, rgb('mouth'), .96 * a)
    Pp = np.array([(0, NOSE_BOT + .004 * W), (0, MZM + .003 * W)]); ib = (np.abs(x) < .03 * W) & (np.abs(z - MZM) < .07 * W) & (fr > 0)
    a = np.zeros(len(x)); a[ib] = stroke(x[ib], z[ib], Pp, np.array([lw * .9, lw]), .0026 * W); C = mix(C, rgb('mouth'), .96 * a)
    # the upper lash line with its outer wing, and the thin lower lid line
    for s in (-1, 1):
        sr, psi, X, Z = eye_s(s, x, z); near = fr * (sr < 1.9)
        th = lash_th(psi)
        upw = smooth(-.14, -.05, psi) * (psi > -1.2)
        lash = (1 - smooth(1 + th - .010, 1 + th + .010, sr)) * upw
        low = (1 - smooth(1.022, 1.040, sr)) * (1 - upw)                       # a thin dark rim under the eye
        a = np.zeros(len(x))
        for pk, Lk, gam, w0 in [(.20, .028, .38, .0100)]:                               # the outer wing
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
    ix = -s * .31; iz = -.03; irx = .71; irz = .93
    C = mix(rgb('sclera'), rgb('#E9DDD3'), .45 * smooth(.35, .95, Z))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#5E3826'), rgb('iris'), smooth(-.95, .05, ez))
    I = mix(I, rgb('#301A12'), smooth(.78, 1.0, r) * .70)
    I = I * (1 - .025 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 26 + r * 9)))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    pz = iz + .04; R = np.sqrt(((X - ix) / (.66 * irx)) ** 2 + ((Z - pz) / (.70 * irz)) ** 2)
    C = mix(C, rgb('pupil'), 1 - smooth(.97, 1.03, R))
    hx = ix - s * .10 * irx; hz = iz + .46 * irz
    big = np.sqrt(((X - hx) / (.165 * irx)) ** 2 + ((Z - hz) / (.140 * irz)) ** 2)
    small = np.sqrt(((X - (ix + s * .34 * irx)) / (.065 * irx)) ** 2 + ((Z - (iz - .46 * irz)) / (.055 * irz)) ** 2)
    C = mix(C, rgb('#FFFAF4'), np.maximum(1 - smooth(.92, 1.08, big), .85 * (1 - smooth(.88, 1.12, small))))
    C = mix(C, rgb('lash'), smooth(.945, .995, sr) * (.45 + .55 * smooth(-.2, .5, Z)))  # the lid contact rim
    return C

def paint(chart, U, V):
    if chart == 'cavity':
        return mix(rgb('#5a1e22'), rgb('#3e1418'), .5 * smooth(.3, 1, V))
    if chart == 'tongue':
        C = mix(rgb('#e88a96'), rgb('#f2a2ac'), .5 * smooth(.2, .9, V)); return mix(C, rgb('#d07080'), .35 * np.exp(-((U - .5) / .05) ** 2))
    if chart in ('lidU', 'lidD'): return np.broadcast_to(rgb('fur'), U.shape + (3,)).copy()     # repainted by the rig
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
        C = ramp_colour('fur', sh_ - .10 * smooth(.62, .40, r))
        Ci = ramp_colour('muz', clamp(.46 + .20 * b - .12 * smooth(.30, .50, r)))
        return mix(C, Ci, 1 - smooth(.47, .51, r))
    if chart == 'nose':
        a = (U - .5) * .13 * W; b = (V - .5) * .13 * W
        C = ramp_colour('nose', .45 + .10 * smooth(-.02, .02, b))
        hl = np.exp(-(((a + .016 * W) / (.016 * W)) ** 2 + ((b - .012 * W) / (.009 * W)) ** 2))
        return mix(C, rgb('#7A5A4E'), .55 * hl)
    if chart == 'apron':
        s_ = U * .80 - .40; z_ = V * .52 + .14
        th = s_ / R_REF; zc = np.maximum(z_, Z_BM)
        n_ = unit(np.stack([np.sin(th), -np.cos(th), .9 * (zc - .40) * (z_ > Z_BM) + 0 * th], -1))
        C = ramp_colour('apron', sval(n_, .05, hi=.18, lo=.22))
        # the skirt's folded top hem and a soft line where it meets the bib
        # flour dabs: soft clustered speckle patches, deterministic
        rs = np.random.RandomState(31); A = np.zeros(U.shape)
        for (cx_, cz_, rx_, rz_) in [(-.24, .24, .085, .055), (.22, .26, .075, .060), (-.10, .20, .05, .03), (.08, .35, .045, .03),
                                     (-.30, .40, .04, .05), (.15, .56, .045, .035), (-.14, .58, .035, .03)]:
            blob = np.exp(-(((s_ - cx_) / rx_) ** 2 + ((z_ - cz_) / rz_) ** 2) * 1.6)
            A = np.maximum(A, blob)
        sp = rs.rand(*U.shape) ** 6
        C = mix(C, rgb('flour'), clamp(.95 * smooth(.20, .70, A) * (.55 + .45 * rs.rand(*U.shape)) + .6 * sp * smooth(.05, .4, A)))
        return C
    if chart == 'belly':
        x_ = (U - .5) * .76; z_ = V * .56 + .10
        y_ = front_hit(x_.ravel(), z_.ravel(), torso_sdf, -.6, .3).reshape(U.shape)
        y_ = np.where(np.isfinite(y_), y_, -.1)
        P = np.stack([x_, y_, z_], -1).reshape(-1, 3); N = grad(torso_sdf, P)
        C = ramp_colour('fur', torso_shade(P, N)).reshape(U.shape + (3,))
        r = np.sqrt((x_ / .160) ** 2 + ((z_ - .400) / .112) ** 2)
        Cb = ramp_colour('muz', sval(N, 0., .2, .25)).reshape(U.shape + (3,))
        return mix(C, Cb, 1 - smooth(.985, 1.015, r))
    raise KeyError(chart)

atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [168, 106, 68, 255]
for name, (x0, y0, w, h) in CHARTS.items():
    U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
    if name in ('face', 'belly'):
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
atlas_path = os.path.join(ROOT, 'scratch' if FAST else '', 'kuma-toy_rig_atlas.png' if RIG else 'kuma-toy_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Kuma_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Kuma_toy_atlas'); MAT.use_nodes = True
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
def prof_front(zw, xw=0.): return round(float((front_hit(xw * W, CHIN + zw * W)[0] - HY) / W), 3)
def back_at(zw):
    ys = np.linspace(.6, -.2, 400) * W; q = np.stack([np.zeros_like(ys), HY + ys, np.full(len(ys), CHIN + zw * W)], -1)
    ins = head_sdf(q) < 0; return round(float(ys[np.argmax(ins)] / W), 3) if ins.any() else None
HV = all_verts(parts['hat']); ALL = all_verts([o for g in parts.values() for o in g])
rimL = np.array([verts[i] for i in roll_info[1][0]])
def band_edge_front():
    zs = np.linspace(.95, 1.15, 401); best = None
    for z in zs:
        yb = front_hit(np.array([0.]), np.array([z]), lambda p: band_sdf_approx(p), -.6, .3)[0]
        ys = front_hit(np.array([0.]), np.array([z]))[0]
        if np.isfinite(yb) and (not np.isfinite(ys) or yb < ys - 1e-4): best = z; break
    return best
def band_sdf_approx(p):
    q = hat_local(p); r = np.sqrt((q[..., 0] / BAND_R[0]) ** 2 + (q[..., 1] / BAND_R[1]) ** 2)
    return np.maximum((r - 1) * BAND_R[0], np.maximum(q[..., 2] - 0., -.175 - q[..., 2]))
MEAS = {'units': 'W = %.3f m face width at the cheeks; front-view z above the chin, profile y behind the head centre (W)' % W,
        'total_height_m': round(float(ALL[:, 2].max()), 4), 'lowest_z_m': round(float(ALL[:, 2].min()), 5),
        'hat_top_m': round(float(HV[:, 2].max()), 4), 'chin_m': CHIN,
        'head_width_W_at_z': {str(z): width_at(z) for z in (.02, .057, .093, .13, .20, .24, .27, .31, .35, .38, .42, .45, .455, .50, .55, .60, .63, .65, .70, .75)},
        'profile_front_W_at_z': {str(z): prof_front(z) for z in (.05, .10, .17, .25, .32, .40, .50, .60)},
        'profile_back_W_at_z': {str(z): back_at(z) for z in (.05, .10, .20, .30, .40, .50, .60, .65, .70)},
        'nose_tip_y_m': round(float(nose_tip[:, 1].min()), 4), 'nose_tip_W_ahead': round(float((HY - nose_tip[:, 1].min()) / W), 3),
        'eye_opening_W': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'eye_centre_W': [round(EX / W, 3), round((EZ - CHIN) / W, 3)],
        'muzzle_oval_W': [round(2 * MUZ_HW / W, 3), round(2 * MUZ_HH / W, 3), round((MUZ_C - CHIN) / W, 3)],
        'nose_W': [round(float(np.ptp(NOSE_OUT[:, 0])) / W, 3), round(float(np.ptp(NOSE_OUT[:, 1])) / W, 3)],
        'band_visible_edge_front_z_m': band_edge_front(),
        'hat_width_m': round(float(np.ptp(HV[:, 0])), 3), 'hat_depth_m': round(float(np.ptp(HV[:, 1])), 3),
        'body_width_m': round(float(np.ptp(all_verts(parts['body'])[:, 0])), 3),
        'arm_span_m': round(float(np.ptp(all_verts(parts['arm.L'] + parts['arm.R'])[:, 0])), 3)}
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
    ob = bpy.context.object; ob.name = 'Kuma_' + group.replace('.', '_')
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
    piv = {'head': tuple(O), 'hat': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'],
           'ear.L': tuple(EAR_C[1]), 'ear.R': tuple(EAR_C[-1]), 'tail': tuple(TAIL[0]),
           'arm.L': joint_arms['L']['shoulder'], 'arm.R': joint_arms['R']['shoulder'],
           'leg.L': joint_legs['L']['hip'], 'leg.R': joint_legs['R']['hip']}.get(group, (0, 0, 0))
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
    ears_j[tag] = {'base': [float(v) for v in C0 - ne * .03], 'fold': [float(v) for v in C0], 'tip': [float(v) for v in C0 + up * .07]}
leaves_j = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    base, dirv, L = LEAVES[s]
    P0, _ = torso_front(np.array([base[0]]), np.array([base[1]])); P1, _ = torso_front(np.array([base[0] + dirv[0] * L]), np.array([base[1] + dirv[1] * L]))
    leaves_j[tag] = {'root': [float(v) for v in P0[0]], 'tip': [float(v) for v in P1[0]]}
joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X',
          'hips': [0, .020, .300], 'spine': [0, .012, .420], 'chest': [0, .020, .530], 'neck': [0, .022, .640],
          'head': [float(v) for v in O], 'jaw_pivot': [0, float(HY - .10 * W), float(CHIN + .10 * W)],
          'eyes': eye_centers, 'ears': ears_j, 'arms': joint_arms, 'legs': joint_legs,
          'tail': [[float(v) for v in np.array(TAIL[0]) - np.array([0, .04, 0])], [float(v) for v in np.array(TAIL[0]) + np.array([0, .06, 0])]],
          'hat_anchor': [float(v) for v in HT0], 'scarf_ends': leaves_j,
          'apron_tie_buckle': [float(v) for v in BUCKLE_C],
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth SDF ball (cranium + cheek mass + muzzle), radially projected, analytic normals.',
                    'Eyelid holes ringed by 5 loops each, rim rolled in behind separate lens eyeballs; 3 loops round the mouth.',
                    'Separate pieces: eyes, ears, tail, neckerchief ends (bend rows along their length), hat (rigid head follower).']}
if RIG:
    pass
elif not FAST:
    with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-fast.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not FAST and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'kuma-toy.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG: bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('KUMA_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
