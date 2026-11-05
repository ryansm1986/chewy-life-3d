"""Yuzu, the bathkeeper of Yukimi Spa Village (Toybox zone villager, VL-2), phase-1 model. Blender 4.3, no addons.
Deterministic.

    blender --background --factory-startup --python build_yk-yuzu-toy.py [-- --fast]

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/yk-yuzu-toy.glb (--fast: no toon refinement, writes scratch/yk-yuzu-fast.glb instead).

Technique (Okami Fuku's tanuki machinery, with Kome's lash ribbons and headband; measure.md has the sheet's numbers):
- The head is ONE smooth implicit ball (domed cranium + chubby cheek mass + jaw, smooth-unioned, a gentle muzzle
  displacement and a soft trim; fitted to Yuzu's front widths and side profile by scratch/fit_head.py). Its skin is the
  field's zero surface reached by radial projection (CDT in a stereographic domain, edge loops round both eyelid holes
  and the mouth), so every vertex carries the field's analytic normal and the face stays convex. Flush lens eyeballs.
- The tanuki mask, the cream muzzle, brows, mouth and blush are painted in a face chart from 3D positions (front
  projection = the sheet's front view). The upper lash line is its OWN object per eye (Yuzu_lash_L/R: a thick tapered
  roll + the outer wing); nothing of the lash is painted on the skin.
- The thick white headband hugs the head, tilted (higher in front); the round ears rise from behind it (their roots
  tucked under the band's top edge).
- The yellow kimono top is a lathe-like bell (a superellipse section per height, monotone-cubic profile) ending in a
  rolled hem at the hips; the over panel (her left over her right) is a thin slab with a rounded corner below the obi.
  The white obi is a thick band with a flat rounded knot at the back; the cream collar is a rounded ribbon.
- Short boxy sleeves round the upper arm with a rolled open cuff; fur forearms with mitten paws; the rust trousers are
  two fat tubes (bend rings) meeting at the crotch seam; bun feet; the big round tail hangs from under the obi knot,
  its dark tip on an edge loop.
- One 2048 painted atlas: face, eyes, ears, nose, the collar-V torso chart and 1-D shading ramps (soft light baked into
  the colour, never hard shadows).
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
MODEL = 'D:/projects/chewy-life-3d/public/models/yk-yuzu-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'yk-yuzu-fast.glb') if FAST else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(5)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
LOG = {}

# ---------------------------------------------------------------- the sheet's measures (measure.md)
# turnaround: ground y 513.5, ear tops y 93 -> 1.12 m (375.4 px / m); front-view head 229 px at the cheeks -> W 0.610 m;
# chin y 273 -> 0.641 m; crown 1.063 m (0.692 W). Side view: leg axis x 889, head centre x 910 -> HY +0.056 m.
# Head close-up: W = 284 px (outline centre x 196, features centred on x 201), chin y 794, crown y 584; its face is drawn
# 7 % taller than the turnaround's, so close-up heights are scaled by 0.692 / 0.739 (measure.md).
W = .610; CHIN = .641; HY = .056            # head width at the cheeks, chin height, head centre y (side view)
SW = W / .44                                # Rosie's metric detail sizes (authored at W 0.44) scale by SW
PAL = {'fur': '#B08A70', 'furdark': '#9A765E', 'furlight': '#BD977D',
       'dark': '#524038', 'darkdark': '#42332D', 'darklight': '#634E45',
       'cream': '#F6E6D6', 'creamdark': '#E6D0BC', 'creamlight': '#FBF0E5',
       'kimono': '#F0C040', 'kimonodark': '#DCA42C', 'kimonolight': '#F6D060',
       'pants': '#A85A2A', 'pantsdark': '#924B22', 'pantslight': '#B96A38',
       'obi': '#FFF6EE', 'obidark': '#E9DDD3', 'obilight': '#FFFAF5',
       'collar': '#F8E8D8', 'collardark': '#E8D3C0', 'collarlight': '#FCF1E6',
       'pink': '#D9908A', 'pinkdark': '#C67D77', 'pinklight': '#E2A29B',
       'iris': '#C8A040', 'pupil': '#302622', 'nose': '#302622', 'sclera': '#FEF0E2', 'blush': '#F0A090',
       'lash': '#2A1E1A', 'brow': '#4A3A34', 'mouth': '#302622'}
CHARTS = {'face': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'ear': (1280, 896, 256, 256), 'nose': (1536, 896, 256, 256),
          'torso': (0, 0, 768, 512)}
if RIG:   # phase-2 charts in unused atlas space (the approved paint is untouched)
    CHARTS.update({'lidU.L': (768, 0, 384, 192), 'lidU.R': (1152, 0, 384, 192), 'lidD.L': (1536, 0, 256, 128), 'lidD.R': (1792, 0, 256, 128),
                   'cavity': (1536, 128, 128, 128), 'tongue': (1664, 128, 128, 128)})
# the upper lash is its own object (lash ribbons), never painted on the skin
PAINT_OPTS = {'blush': True, 'muzzle': True}
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'dark': ('darkdark', 'dark', 'darklight'),
         'cream': ('creamdark', 'cream', 'creamlight'), 'kimono': ('kimonodark', 'kimono', 'kimonolight'),
         'kimonoin': ('#B07A1E', '#C48A26', '#D49C34'),
         'pants': ('pantsdark', 'pants', 'pantslight'), 'obi': ('obidark', 'obi', 'obilight'),
         'collar': ('collardark', 'collar', 'collarlight'),
         'nose': ('#2A1E1A', '#3A2A24', '#5C4840'), 'eyedark': ('#1A1210', '#241A16', '#3E302A'),
         'lash': ('#110B09', '#1C1310', '#2A1E1A'),
         'pink': ('pinkdark', 'pink', 'pinklight'), 'tailtip': ('darkdark', 'dark', 'darklight')}
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
# fitted by scratch/fit_head.py (two rounds, rms 0.019 W) to Yuzu's turnaround front widths (1.00 W at z 0.21-0.26, 0.925 at
# 0.36, ~0.86 under the band at 0.44), the side profile (the muzzle 0.49 W ahead of the centre, the back 0.43 W) and the
# crown (0.697 W)
CR = ([0, .000, 0.4209], [0.397, 0.3623, 0.2577], (2.496, 2.0, 2.1112))      # domed cranium
CK = ([0, -0.0119, 0.1805], [0.5237, 0.4389, 0.2024], (3.2272, 2.1, 2.4546))  # wide, chubby cheek mass
K_CK = 0.1949
# the muzzle: a smooth displacement of the ball (no union crease), zero slope at its edge, its lower half fading into the chin
MZ = ([0, -0.36, 0.1488], [0.200, 0.130, 0.1256])
MZ_A = 0.0681
# the jaw: a soft volume smooth-unioned low in front
JW = ([0, -0.224, 0.1137], [0.1856, 0.2217, 0.1153]); K_JW = 0.0611
# a soft ellipsoid trim narrows the upper head (0.84 W at z 0.44, under the band)
TR = ([0, -0.0003, 0.2042], [0.501, 0.4955, 0.4966]); K_TR = 0.0485

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
# the close-up: eye centres +-55 px (0.194 W) at 0.3015 W; the opening 52 x 54 px -> 0.183 x 0.178 W (heights scaled 0.936)
EX = .194 * W; EZ = CHIN + .3015 * W; EHW = .0915 * W; EHH = .089 * W; EN = 2.15
def eye_unit(psi):
    return spow(np.cos(psi), 2 / EN), spow(np.sin(psi), 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
NOSE_Z = CHIN + .233 * W; NOSE_TOP = CHIN + .267 * W; NOSE_BOT = CHIN + .214 * W   # (the button's upward push puts its centre at 0.240)
MZM = CHIN + .166 * W                                                       # the mouth's centre line (corners 0.182, bottom 0.150)
BROW_X = .187 * W; BROW_Z = CHIN + .488 * W; BROW_L = .056 * W
BLUSH = (.313 * W, CHIN + .183 * W, .051 * W, .0295 * W)
def chaikin(P, n=3, closed=True):
    P = np.asarray(P, float)
    for _ in range(n):
        Q = np.roll(P, -1, 0) if closed else P[1:]
        A = P if closed else P[:-1]
        R = np.empty((2 * len(A), 2)); R[0::2] = .75 * A + .25 * Q; R[1::2] = .25 * A + .75 * Q
        P = R if closed else np.concatenate([P[:1], R, P[-1:]])
    return P
def mirror_outline(right):
    """right half (x >= 0) listed from the top centre clockwise to the bottom centre -> a closed polygon"""
    right = np.asarray(right, float); left = right[::-1] * np.array([-1, 1])
    return np.concatenate([right, left[1:-1]])
# the tanuki mask (W, z above the chin), measured per column on the close-up (measure/m5.py): a band over the eyes and the
# nose bridge, wrapping down round the blush at the outer cheeks; its lower edge near the centre runs under the muzzle
MASK_R = [(0, .349), (.021, .351), (.042, .357), (.063, .365), (.085, .381), (.106, .398), (.127, .413), (.148, .423),
          (.169, .428), (.190, .428), (.211, .427), (.232, .420), (.254, .409), (.275, .396), (.296, .386), (.317, .380),
          (.338, .366), (.359, .348), (.378, .322), (.395, .290), (.405, .255), (.405, .222), (.397, .192), (.385, .166),
          (.366, .146), (.345, .134), (.317, .127), (.296, .125), (.275, .125), (.254, .129), (.232, .134), (.211, .142),
          (.190, .154), (.169, .170), (.150, .196), (.120, .220), (.080, .234), (.040, .240), (0, .242)]
MASK_POLY = chaikin(mirror_outline(MASK_R), 2) * W + np.array([0, CHIN])
# the cream muzzle: a round soft oval under the nose, 0.326 W wide at z 0.15-0.17, top 0.250 (under the nose), bottom 0.045
MUZ_R = [(0, .250), (.050, .247), (.090, .236), (.115, .225), (.139, .213), (.150, .204), (.157, .190), (.161, .175),
         (.163, .160), (.161, .140), (.155, .120), (.146, .103), (.132, .087), (.114, .073), (.092, .062), (.065, .053),
         (.035, .047), (0, .045)]
MUZ_POLY = chaikin(mirror_outline(MUZ_R), 2) * W + np.array([0, CHIN])

# ---------------------------------------------------------------- the fur shade (shared by the face chart and the ramps)
EAR_C = {s: np.array([s * .246 * W, HY + .035, CHIN + .619 * W]) for s in (-1, 1)}   # on the head's top corners, a little behind
def head_occ(P, n):
    o = np.zeros(len(P))
    for s in (-1, 1):
        dd = np.linalg.norm(P - EAR_C[s], axis=-1); o = o + .10 * np.exp(-(dd / (.13 * W)) ** 2)
    return o
BAND_ZF, BAND_ZB, BAND_H, BAND_T = 1.010, .915, .068, .022        # the headband (built after the ears)
def band_zc(phi): return BAND_ZF + (BAND_ZB - BAND_ZF) * (1 - np.cos(phi)) / 2
def head_shade(P, n):
    """the fur's soft shade; rig round (director): no lightening on the crown above the band, so the crown keeps the swatch's
    hue (#B08A70) and only darkens (value only) toward the sides and the back"""
    P = np.asarray(P, float); phi = np.arctan2(P[:, 0], -(P[:, 1] - HY))
    hi = .08 * smooth(.010, -.030, P[:, 2] - band_zc(phi))
    d = np.asarray(n) @ LIGHT
    return clamp(.50 + hi * smooth(.0, .95, d) - .24 * smooth(.05, .95, -d) - head_occ(P, n))
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
for k, (hx, hz) in enumerate([(.077, .022), (.090, .029), (.103, .036)]):
    a = np.linspace(0, 2 * PI, 40, endpoint=False)
    add_loop(to_dom(surf_dir(hx * W * spow(np.cos(a), .8), MZM - .002 * W + hz * W * np.sin(a))), 'mouth_%d' % k)
NB = 64; AB = math.radians(150)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
def fib(n):
    ii = np.arange(n) + .5; phi = np.arccos(1 - 2 * ii / n); th = PI * (1 + 5 ** .5) * ii
    return np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
NF = 1500 if FAST else 2300
D = fib(NF); D = D[np.arccos(np.clip(-D[:, 1], -1, 1)) < math.radians(147.)]
D2 = fib(6400 if FAST else 8000); D2 = D2[np.arccos(np.clip(-D2[:, 1], -1, 1)) < math.radians(62)]
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
keep &= ~(front & ((Pf[:, 0] / (.118 * W)) ** 2 + ((Pf[:, 2] - MZM) / (.050 * W)) ** 2 < 1))
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

# ================================================================ LASH RIBBONS: the upper lash line + the outer wing
# The close-up: ~8 px (0.03 W, ~0.30 of the opening's half-height) thick over the top, running from the inner corner over
# the top and down the outer side, with one broad wing flicking up and out at the outer top corner (tip at X 1.5, Z 0.8 in
# eye units). A flattened tapered roll lying on the skin, its inner edge just inside the lid hole (over the lens edge),
# <= 0.009 W proud. Separate objects (origin at the eye centre) so the rig can hang them on the upper lids. Nothing of the
# lash is painted on the skin. (Kome's construction.)
# rig round: the roll ends at the outer corner's middle (psi -14 deg, as on the sheet), not 52 deg down the outer side: on the
# lid's lever that thin tail swung down under the eye like a tear when shut
LASH_PSI = np.radians(np.linspace(158, -14, 26))         # inner top -> over the top -> down to the outer corner
def lash_th(psi):      # thickness in eye-radius units (the opening's superellipse radius)
    d = np.degrees(psi)
    th = .34 + .08 * np.exp(-((d - 35) / 30) ** 2)        # round 1: thicker, so it reads on the dark mask
    th = th * (1 - .70 * smooth(22, -38, d))        # thinner down the outer side (the sheet)
    return th * smooth(160, 128, d) * smooth(-17, 8, d) + .02
LASH_WINGS = [((44, .95), (1.40, .98)), ((30, .95), (1.55, .80))]    # (root psi deg, root k), tip (X outer, Z) eye units
def eye_pt(s, X, Z):
    """eye units (X > 0 outer) -> skin point, its normal"""
    x = s * EX + s * EHW * np.asarray(X, float); z = EZ + EHH * np.asarray(Z, float)
    y = front_hit(x, z); S = np.stack([x, y, z], -1); return S, grad_n(S)
def lash_ribbon(C, n, hw, hp, NLS=8, embed=.0012 * W):
    """flattened lens-section tube along skin points C with skin normals n; returns verts, faces, normals"""
    tg = np.gradient(C, axis=0); tg = unit(tg - n * (tg * n).sum(1, keepdims=True)); sd = unit(np.cross(n, tg))
    V = []; NV = []; NT = len(C)
    for i in range(NT):
        for k in range(NLS):
            a = 2 * PI * k / NLS; ca, sa = math.cos(a), math.sin(a)
            upp = hp[i] * (sa if sa > 0 else .40 * sa)
            V.append(C[i] + sd[i] * hw[i] * ca + n[i] * (upp - embed))
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
lash_info = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    th = lash_th(LASH_PSI); k_in = .965
    ux, uz = eye_unit(LASH_PSI)
    Pin, _ = eye_pt(s, ux * k_in, uz * k_in); Pout, _ = eye_pt(s, ux * (k_in + th), uz * (k_in + th))
    Cm, nm = eye_pt(s, ux * (k_in + th / 2), uz * (k_in + th / 2))
    hw = np.linalg.norm(Pout - Pin, axis=1) / 2
    tt_ = np.linspace(0, 1, len(LASH_PSI))
    hp = (.0085 * W) * (.55 + .45 * smooth(0, .25, tt_)) * (1 - .55 * smooth(.70, 1.0, tt_))
    Vl, Fl, NVl = lash_ribbon(Cm, nm, hw, hp)
    allV = [Vl]; allF = [Fl]; allN = [NVl]; off = len(Vl)
    for (rpsi, rk), (tx, tz) in LASH_WINGS:
        rp = math.radians(rpsi); rux, ruz = eye_unit(np.array([rp]))
        thr = lash_th(np.array([rp]))[0]
        R0 = np.array([rux[0] * (k_in + thr * .45), ruz[0] * (k_in + thr * .45)])
        T0 = np.array([tx, tz])
        mid = R0 + (T0 - R0) * .5 + np.array([-.06, .08])         # a slight upward curl
        ws = np.linspace(0, 1, 11)
        XZ = np.array([(1 - w) ** 2 * R0 + 2 * (1 - w) * w * mid + w * w * T0 for w in ws])
        Cw, nw = eye_pt(s, XZ[:, 0], XZ[:, 1])
        hww = (.0190 * W) * (1 - ws) ** .8 + .0018 * W
        hpw = (.0075 * W) * (1 - .75 * ws)
        Vw, Fw, NVw = lash_ribbon(Cw, nw, hww, hpw, NLS=6)
        allV.append(Vw); allF.append([tuple(i + off for i in f) for f in Fw]); allN.append(NVw); off += len(Vw)
    Vl = np.vstack(allV); NVl = np.vstack(allN); Fl = [f for FF in allF for f in FF]
    fac = clamp(.30 + .35 * (NVl @ eye_axes[tag]))         # the roll's top a touch lighter (no bright sheen)
    make_obj('lash_line.' + tag, Vl, Fl, ramp_uv('lash', fac), 'lash.' + tag, NVl)
    lash_info[tag] = dict(top=[float(v) for v in Cm[np.argmax(Cm[:, 2])]], outer_end=[float(v) for v in Cm[-1]],
                          max_proud_W=round(float(hp.max() / W), 4), thick_top_W=round(float(2 * hw[np.argmax(Cm[:, 2])] / W), 4))
LOG['lash'] = lash_info

# ================================================================ NOSE: a glossy rounded-triangle button on the muzzle
def resample(poly, step):
    seg = np.linalg.norm(np.roll(poly, -1, 0) - poly, axis=1); L = np.concatenate([[0], np.cumsum(seg)])
    n = max(8, int(round(L[-1] / step))); t = np.linspace(0, L[-1], n, endpoint=False)
    P = np.concatenate([poly, poly[:1]]); return np.stack([np.interp(t, L, P[:, 0]), np.interp(t, L, P[:, 1])], -1)
def _nose_outline(n=48):
    # a soft rounded bean, broader on top (the close-up: 0.088 x 0.053 W)
    t = np.linspace(0, 2 * PI, n, endpoint=False); u = np.cos(t); v = np.sin(t)
    y = .0265 * W * spow(v, .85); taper = (.42 + .58 * ((v + 1) / 2) ** .85)     # a rounder bean than Fuku's
    x = .051 * W * spow(u, .80) * taper
    return np.stack([x, y + .002 * W], -1)
NOSE_OUT = _nose_outline()
NOSE_H = .022                                                   # the button stands 22 mm proud (a softer bean than Fuku's)
def build_nose():
    rows = []; V = []; UV = []
    rings = [1.0, .985, .94, .85, .70, .50, .27]
    prof = [v * NOSE_H / .028 for v in (-.003, .010, .0175, .0228, .0257, .0273, .028)]
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

# ================================================================ THE HEADBAND (constants; built after the ears)
# the sheet: the centre line at z 1.010 m in front, 0.915 m at the back (side and back views; tilted ~10 deg), 0.062 m tall,
# standing 0.022 m proud of the head (its outer width at the temples is 0.93 W, the head under it ~0.86 W)
def ray_hit(o, d, f=head_sdf, t0=0., t1=.6, it=34):
    """per-ray origins (inside) and directions -> the first exit point"""
    lo = np.full(len(d), t0); hi = np.full(len(d), t1)
    for _ in range(it):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return o + d * ((lo + hi) / 2)[:, None]
def ear_tuck(V):
    """(Kome's / Kazemaru's tuck) below the band's top edge no ear point stands further out (horizontally, from the head's
    axis) than the head surface + 8 mm, so the band (22 mm proud, hugging the head) covers the root and its top edge stays
    one clean line; the visible ear above the band is untouched"""
    V = np.array(V, float); phi_ = np.arctan2(V[:, 0], -(V[:, 1] - HY))
    ztop = band_zc(phi_) + BAND_H / 2
    wv = smooth(ztop + .014, ztop - .010, V[:, 2]); sel = wv > 0
    if sel.any():
        Dh = np.stack([np.sin(phi_[sel]), -np.cos(phi_[sel]), np.zeros(sel.sum())], -1)
        Ch = np.stack([np.zeros(sel.sum()), np.full(sel.sum(), HY), V[sel, 2]], -1)
        Hh = ray_hit(Ch, Dh, head_sdf, 0., .6); rh = np.linalg.norm(Hh[:, :2] - Ch[:, :2], axis=1)
        rv = np.linalg.norm(V[sel, :2] - Ch[:, :2], axis=1)
        new_r = rv - wv[sel] * np.maximum(rv - (rh + .008), 0)
        dirh = (V[sel, :2] - Ch[:, :2]) / np.maximum(rv, 1e-9)[:, None]
        V[sel, :2] = Ch[:, :2] + dirh * new_r[:, None]
    return V, wv

# ================================================================ EARS: thick round cupped discs (dark rim, pink inner)
# the close-up: circle fits r 0.166 W, centres x +-0.246 W (about the outline's centre), 0.619 W above the chin; the side view
# puts them 0.035 m behind the head centre. Turned 18 deg out (the Takemori lesson: 12-20), roots tucked under the band.
EAR_OUT = 18.                         # degrees the disc faces outward from the front
ear_info = {}
for s in (-1, 1):
    C0 = EAR_C[s]; ne = unit(np.array([s * math.sin(math.radians(EAR_OUT)), -math.cos(math.radians(EAR_OUT)), .10]))
    up = np.array([0, 0, 1.]); up = unit(up - ne * (up @ ne)); tt = np.cross(up, ne)
    at = au_ = .166 * W; an, dish = .050 * W, .026 * W
    seg, rows_ = 32, 12; V = []
    for j in range(rows_ + 1):
        ph = PI * j / rows_
        for i in range(seg):
            th = 2 * PI * i / seg; rho = math.sin(ph); fz = math.cos(ph)
            if fz > 0: off = an * fz ** .55 - dish * (1 - float(smooth(0, .72, rho)))
            else: off = 2.4 * an * fz
            V.append(C0 + tt * (at * rho * math.cos(th)) + up * (au_ * rho * math.sin(th)) + ne * off)
    V = np.array(V); V0 = V.copy(); V, _wt = ear_tuck(V); fs = []
    LOG.setdefault('ear_tuck_mm', []).append(round(float(np.linalg.norm(V - V0, axis=1).max()) * 1000, 1))
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

# ================================================================ THE HEADBAND: a thick soft ring hugging the head, tilted
def band_field(p): return head_sdf(p)            # the band hugs the head alone; the ears rise from behind it
NBP = 64; NBS = 10
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
Fb = []
for i in range(NBP):
    for j in range(NBS):
        i2 = (i + 1) % NBP; j2 = (j + 1) % NBS
        Fb.append((i * NBS + j, i * NBS + j2, i2 * NBS + j2, i2 * NBS + j))
GB = G.reshape(-1, 3); NGB = NG.reshape(-1, 3)
def band_shade(P, N): return sval(N, .30 * ao(lambda q: head_sdf(q) + .004, P, N, .02), hi=.16, lo=.24)
make_obj('headband', GB, Fb, ramp_uv('obi', band_shade(GB, NGB)), 'band', NGB)
LOG['band'] = {'front_top_z': round(float(G[0][:, 2].max()), 4), 'front_bottom_z': round(float(G[0][:, 2].min()), 4),
               'back_z': [round(float(G[NBP // 2][:, 2].min()), 4), round(float(G[NBP // 2][:, 2].max()), 4)],
               'proud_m': BAND_T, 'outer_width_m': round(float(np.ptp(GB[:, 0])), 4)}

# ================================================================ BODY: the kimono top (one lathe bell, a rolled hem)
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
# measured on the turnaround (measure.md): the hem 0.52 m wide at z 0.28 (-0.216 / +0.26 deep), flaring from under the obi
# (0.40 wide), the obi 0.42 wide (front -0.20, back 0.235 + the knot), the chest -0.178 / +0.225, the neck inside the head
BELL = [(.278, .262, .216, .262), (.300, .262, .215, .258), (.334, .250, .212, .252), (.370, .232, .207, .245),
        (.392, .214, .199, .232), (.410, .200, .191, .222), (.435, .196, .188, .218), (.460, .196, .186, .218),
        (.475, .197, .185, .220), (.500, .197, .181, .224), (.530, .193, .175, .224), (.560, .184, .163, .216),
        (.590, .170, .147, .205), (.615, .152, .127, .190), (.635, .128, .104, .170), (.655, .095, .075, .135),
        (.672, .040, .035, .050)]
BZ, BA, BF, BB = [np.array(c, float) for c in zip(*BELL)]
Z_BOT, Z_TOP = float(BZ[0]), float(BZ[-1])
Z_HEM = .278                 # the kimono's hem (rolled inward)
def bell_n(z): return 2.3 + .15 * smooth(.40, .30, z)
def hem_rise(phi):
    """the under panel's rounded front corner: its hem rises toward her left (under the over panel's edge)"""
    phi = np.asarray(phi, float)
    return .028 * smoother(-.36, -.02, np.arctan2(np.sin(phi), np.cos(phi))) * (np.cos(phi) > 0)
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
TORSO_CH = (-.23, .23, .46, .672)          # the collar-V chart: x range, z range (front projection)
def in_torso_chart(P, N):
    return (N[1] < -.30) & (P[2] > .480) & (np.abs(P[0]) < .190)
NPHI = 56
def build_bell():
    # ring list: (z where the section is evaluated, z placed, radial offset, normal kind); the hem roll turns inward
    zs = list(np.linspace(Z_HEM + .012, .392, 9)) + list(np.linspace(.405, .66, 17)) + [Z_TOP - .006]
    zs = sorted(set(round(float(z), 5) for z in zs))
    H = Z_HEM
    rings = [(H, H + .040, -.050, 'in'), (H, H + .016, -.024, 'in'), (H, H + .006, -.016, 'inlo'), (H, H + .0015, -.010, 'down'),
             (H, H + .0012, -.004, 'downout'), (H, H + .0055, -.0006, 'outlo')] + [(z, z, 0., 'out') for z in zs]
    phi = np.linspace(0, 2 * PI, NPHI, endpoint=False)
    V = []; N = []; rows = []; kinds = []
    for ze, zp, dr, kind in rings:
        P = bell_pt(phi, ze, True, dr); n = bell_normal(phi, ze)
        rise = hem_rise(phi) * smooth(H + .065, H + .012, zp); P[:, 2] = zp + rise
        down = np.array([0, 0, -1.])
        n = {'out': n, 'outlo': unit(n + .45 * down), 'downout': unit(n + 1.6 * down), 'down': unit(.25 * n + down),
             'inlo': unit(-.6 * n + down), 'in': unit(-n + .2 * down)}[kind]
        rows.append(list(range(len(V), len(V) + NPHI))); V += list(P); N += list(n); kinds.append(kind)
    bot = len(V); V.append(np.array([0, .02, H + .05])); N.append(np.array([0, 0, -1.]))
    top = len(V); V.append(np.array([0, .0, Z_TOP])); N.append(np.array([0, 0, 1.]))
    F = []; FK = []
    for k in range(len(rows) - 1):
        a_, b_ = rows[k], rows[k + 1]; inside = kinds[k] in ('in', 'inlo') or kinds[k + 1] in ('in', 'inlo')
        for i in range(NPHI):
            F.append((a_[i], a_[(i + 1) % NPHI], b_[(i + 1) % NPHI], b_[i])); FK.append('in' if inside else 'out')
    for i in range(NPHI): F.append((rows[0][(i + 1) % NPHI], rows[0][i], bot)); FK.append('in')
    for i in range(NPHI): F.append((rows[-1][i], rows[-1][(i + 1) % NPHI], top)); FK.append('out')
    V = np.array(V); N = np.array(N); val = torso_shade(V, N)
    uv = []
    for f, fk in zip(F, FK):
        idx = list(f); cP = V[idx].mean(0); cN = unit(N[idx].mean(0))
        if fk == 'in':
            uv.append([tuple(ramp_uv('kimonoin', val[i:i + 1] * .8)[0]) for i in idx])
        elif in_torso_chart(cP, cN):
            x0, x1, z0, z1 = TORSO_CH; uv.append([tuple(au('torso', (V[i, 0] - x0) / (x1 - x0), (V[i, 2] - z0) / (z1 - z0))) for i in idx])
        else:
            uv.append([tuple(ramp_uv('kimono', val[i:i + 1])[0]) for i in idx])
    return make_obj('kimono_bell', V, F, uv, 'body', N)
build_bell()

def ramp_faces(ob, names, val_fn, dim=None):
    """per-face ramp names, per-vertex shading values from Blender's smooth normals"""
    me = ob.data; me.update(); Nn = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('normal', Nn); Nn = Nn.reshape(-1, 3)
    Vv = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', Vv); Vv = Vv.reshape(-1, 3)
    val = val_fn(Vv, Nn); uvl = me.uv_layers['Atlas']
    for p, nm in zip(me.polygons, names):
        k = (dim or {}).get(nm, 1.)
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index; uvl.data[li].uv = tuple(ramp_uv(nm, val[vi:vi + 1] * k)[0])

# ---------------------------------------------------------------- the over panel: her left panel over her right, below the obi
# the sheet's front view: its free edge leaves the obi at x -0.103 and sweeps down and right in a soft convex curve to the hem
# at x +0.02, where it rounds into the hem; it wraps round her left side toward the back seam, thinning to nothing there
FL_TOP, FL_T, FL_GAP, FL_R0 = .405, .009, .0025, .21
FL_PHI_END = math.radians(118)
def fl_t(phi): return FL_T * smooth(FL_PHI_END, FL_PHI_END - .55, np.asarray(phi, float))
def fl_point(s_, z, frac=1.):
    phi = np.asarray(s_, float) / FL_R0; z = np.asarray(z, float)
    # round 1: the top 2.5 cm thins to nothing, so the panel tucks under the obi's lower edge with no ledge (3/4 view)
    r = bell_r(phi, np.maximum(z, Z_HEM), False) + FL_GAP * smooth(FL_TOP + .002, FL_TOP - .02, z) + fl_t(phi) * frac * smooth(FL_TOP + .002, FL_TOP - .025, z)
    return np.stack([r * np.sin(phi), -r * np.cos(phi), z * np.ones_like(r)], -1)
def x_to_s(x, z):
    ss = np.linspace(-.25, .30, 700); out = []
    for xx, zz in zip(np.atleast_1d(x), np.atleast_1d(z)):
        X = fl_point(ss, np.full(len(ss), zz))[:, 0]; out.append(np.interp(xx, X, ss))
    return np.array(out)
FL_EDGE = [(-.103, .405), (-.100, .390), (-.090, .366), (-.074, .340), (-.054, .318), (-.030, .300), (-.006, .287), (.016, .279)]
FL_BOT = Z_HEM - .006
def _flap_outline():
    E = np.array([catmull(FL_EDGE, t) for t in np.linspace(0, 1, 24)])
    S = x_to_s(E[:, 0], E[:, 1]); edge = [(float(a), float(b)) for a, b in zip(S, E[:, 1])]
    rc = .022; s1, z1 = edge[-1]
    corner = [(s1 + rc * (1 - math.cos(a)), FL_BOT + (z1 - FL_BOT) * (1 - math.sin(a))) for a in np.linspace(.15, PI / 2, 7)]
    s_end = FL_PHI_END * FL_R0
    bottom = [(float(s), FL_BOT) for s in np.linspace(corner[-1][0] + .02, s_end, 16)]
    up = [(s_end, float(z)) for z in np.linspace(FL_BOT + .02, FL_TOP - .02, 6)]
    top = [(float(s), FL_TOP) for s in np.linspace(s_end, S[0] + .01, 16)]
    return np.array(edge + corner + bottom + up + top)
def resample(poly, step):
    seg = np.linalg.norm(np.roll(poly, -1, 0) - poly, axis=1); L = np.concatenate([[0], np.cumsum(seg)])
    n = max(8, int(round(L[-1] / step))); t = np.linspace(0, L[-1], n, endpoint=False)
    P = np.concatenate([poly, poly[:1]]); return np.stack([np.interp(t, L, P[:, 0]), np.interp(t, L, P[:, 1])], -1)
def build_flap():
    out = _flap_outline()
    def area(p): return .5 * np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1])
    if area(out) < 0: out = out[::-1]
    out = resample(out, .015)
    gx, gz = np.meshgrid(np.arange(-.30, .45, .028), np.arange(.26, .42, .022))
    G = np.stack([gx.ravel(), gz.ravel()], -1); G[:, 0] += .014 * (np.round((G[:, 1] - .26) / .022) % 2)
    ok = in_poly(G, out); d = np.full(len(G), 9.)
    for i in range(len(out)):
        a = out[i]; b = out[(i + 1) % len(out)]; ab = b - a; t = np.clip(((G - a) @ ab) / (ab @ ab), 0, 1)
        d = np.minimum(d, np.linalg.norm(G - (a + t[:, None] * ab), axis=1))
    G = G[ok & (d > .008)]
    P2 = np.concatenate([out, G]); nO = len(out)
    res = delaunay_2d_cdt([Vector(p) for p in P2], [(i, (i + 1) % nO) for i in range(nO)], [], 0, 1e-9)
    vout = np.array([[v.x, v.y] for v in res[0]]); Fo = np.array([list(f) for f in res[2]])
    assert len(vout) == len(P2), 'flap CDT merged points'
    Fo = Fo[in_poly(vout[Fo].mean(1), out)]; n2 = len(vout)
    Pf = fl_point(vout[:, 0], vout[:, 1], 1.); Pb = fl_point(vout[:, 0], vout[:, 1], 0.)
    V = list(Pf) + list(Pb); F = [tuple(f) for f in Fo] + [tuple(n2 + f[::-1]) for f in Fo]
    L2 = vout[:nO]; tang = np.roll(L2, -1, 0) - np.roll(L2, 1, 0); m = unit(np.stack([tang[:, 1], -tang[:, 0]], -1))
    rows = [list(range(nO))]; R = 4
    for j in range(1, R):
        ph = PI * j / R; q = L2 + m * (FL_T / 2 * .95 * math.sin(ph))
        rows.append(list(range(len(V), len(V) + nO))); V += list(fl_point(q[:, 0], q[:, 1], (1 + math.cos(ph)) / 2))
    rows.append(list(range(n2, n2 + nO)))
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(nO): F.append((a_[i], b_[i], b_[(i + 1) % nO], a_[(i + 1) % nO]))
    V = np.array(V); ob = make_obj('kimono_over_panel', V, F, np.zeros((len(V), 2)), 'flap')
    mesh_normals_uv(ob, lambda Vv, Nn: ramp_uv('kimono', sval(Nn, .22 * ao(bell_sdf_nolip, Vv, Nn, .03)
                                                            + .30 * smooth(FL_TOP - .03, FL_TOP + .004, Vv[:, 2]), hi=.15, lo=.24)))
    return ob, out
flap_ob, FLAP_OUT = build_flap()

# ---------------------------------------------------------------- the obi: a thick plain white band
OBI_ZM = .4335
OBI_PROF = [(.392, .001), (.3935, .009), (.398, .0145), (.405, .0165), (.420, .0172), (.447, .0172), (.462, .0165),
            (.469, .0145), (.4735, .009), (.475, .001)]
def obi_r(phi, z, t): return bell_r(phi, OBI_ZM, False) + t
def build_obi():
    phi = np.linspace(0, 2 * PI, 56, endpoint=False); V = []; rows = []
    for z, t in OBI_PROF:
        r = obi_r(phi, z, t); rows.append(list(range(len(V), len(V) + len(phi))))
        V += list(np.stack([r * np.sin(phi), -r * np.cos(phi), np.full(len(phi), z)], -1))
    F = []; FR = []; n = len(phi)
    for k in range(len(rows) - 1):
        for i in range(n):
            a_, b_ = rows[k], rows[k + 1]; F.append((a_[i], a_[(i + 1) % n], b_[(i + 1) % n], b_[i])); FR.append('obi')
    V = np.array(V); ob = make_obj('obi_band', V, F, np.zeros((len(V), 2)), 'obi')
    ramp_faces(ob, FR, lambda Vv, Nn: sval(Nn, .22 * ao(body_occ, Vv, Nn, .04), hi=.14, lo=.26))
    return ob
build_obi()
# the knot at the back: a flat rounded cushion (the sheet's back view: 0.133 x 0.104 m, standing to y 0.26 in the side view)
KNOT_C = np.array([0, .2445, OBI_ZM + .002]); KNOT_R = [.067, .0165, .052]
def knot_sdf(p): return sell(p, KNOT_C, KNOT_R, (3.4, 2.4, 3.4))
def knot_shade(P, N): return sval(N, .25 * ao(lambda q: bell_sdf(q, False) - .017, P, N, .03), hi=.14, lo=.26)
sdf_ball('obi_knot', knot_sdf, KNOT_C, 6, 'obi', 'obi', shade=knot_shade, t1=.12)

# ---------------------------------------------------------------- the collar: a cream ribbon, her left panel over her right
def ribbon(name, ctrl, offs, width, thick, group, ramp, n=72, cen=(0, 0, .50)):
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
COLLAR_W, COLLAR_T = .036, .012
# from under the obi (her right front), up across the chest over her left shoulder, round the back of the neck, over her
# right shoulder and down to the crossing (x 0, z 0.568), where it tucks under the first band
COLLAR_CTRL = [(-.072, -.20, .460), (-.060, -.19, .490), (-.040, -.185, .518), (-.016, -.178, .545), (.012, -.168, .572),
               (.044, -.152, .598), (.078, -.124, .618), (.108, -.080, .633), (.124, -.02, .642), (.118, .050, .645),
               (.068, .100, .645), (0, .115, .645), (-.068, .100, .645), (-.118, .050, .645), (-.124, -.02, .642),
               (-.108, -.080, .633), (-.078, -.122, .616), (-.050, -.148, .596), (-.026, -.163, .578), (-.008, -.170, .562)]
# round 1: nearly flush (it stood ~2 cm off the chest in the side view); the over band lifts only where it crosses the under one
COLLAR_OFF = [.000, .001, .003, .007, .010, .006, .002, .001, .001, .001, .001, .001, .001, .001, .001, .001, .001, .000,
              -.002, -.006]
COLLAR_PATH = ribbon('collar', COLLAR_CTRL, COLLAR_OFF, COLLAR_W, COLLAR_T, 'collar', 'collar')

# ================================================================ SLEEVES, FOREARMS (A-pose), TROUSERS + FEET
ARM_DEG = 40.                # the sheet's front view: the arms hang ~40 deg out (the paws at x +-0.31, z 0.40)
SLV_L = .125
joint_arms = {}; joint_legs = {}; sleeve_info = {}
SHOULDER = (.163, .012, .566)
def arm_frame(s):
    a = math.radians(ARM_DEG); d = unit(np.array([s * math.sin(a), .0, -math.cos(a)]))
    e1 = unit(np.cross(d, [0, 0, 1.])); e2 = unit(np.cross(e1, d))
    if e2[2] < 0: e2 = -e2
    return d, e1, e2
def sleeve_ring(s, t, a, scale=1.):
    d, e1, e2 = arm_frame(s); S0 = np.array([s * SHOULDER[0], SHOULDER[1], SHOULDER[2]])
    C = S0 + d * (-.045 + (SLV_L + .045) * t)
    rw = .086 + .016 * float(smooth(0, 1, t)); ru = .072 + .004 * t; rd = .074 + .018 * float(smooth(0, .9, t))
    down = unit(.55 * e2 + .45 * np.array([0, 0, 1.]))
    ca, sa = np.cos(a), np.sin(a)
    up_part = np.where(sa >= 0, ru * sa, 0.)[:, None] * e2
    dn_part = np.where(sa < 0, rd * spow(sa, .85), 0.)[:, None] * down
    return C + scale * (e1 * (rw * ca)[:, None] + up_part + dn_part), C
def build_sleeve(s, tag):
    d, e1, e2 = arm_frame(s); NA = 26; a = np.linspace(0, 2 * PI, NA, endpoint=False) + PI / NA
    ts = [0, .10, .22, .36, .50, .64, .78, .90, .97, 1.0]
    rows = []; V = []; RN = []
    for t in ts:
        P, C = sleeve_ring(s, t, a); rows.append(list(range(len(V), len(V) + NA))); V += list(P); RN.append('kimono')
    P1, C1 = sleeve_ring(s, 1.0, a)
    for dd, sc, nm in [(.008, .975, 'kimono'), (.013, .925, 'kimono'), (.013, .86, 'kimonoin'), (.008, .80, 'kimonoin')]:
        P = C1 + (P1 - C1) * sc + d * dd; rows.append(list(range(len(V), len(V) + NA))); V += list(P); RN.append(nm)
    for dd, rr in [(-.004, .068), (-.040, .062)]:
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
    ramp_faces(ob, FR, lambda Vv, Nn: sval(Nn, .25 * ao(body_occ, Vv, Nn, .04), hi=.15, lo=.24), dim={'kimonoin': .75})
    sleeve_info[tag] = {'root': [float(v) for v in sleeve_ring(s, 0., a[:1])[1]], 'cuff': [float(v) for v in C1]}
    return ob
for s, tag in ((-1, 'R'), (1, 'L')):
    build_sleeve(s, tag)
    d, e1, e2 = arm_frame(s); sh = np.array([s * SHOULDER[0], SHOULDER[1], SHOULDER[2]])
    elbow = sh + d * .115; wrist = sh + d * .200
    pts_ = [sh + d * .040, sh + d * .115, sh + d * .180, sh + d * .228]
    rad = lambda t: .056 + .015 * float(smooth(.62, 1., t))
    limb('arm.' + tag, pts_, rad, 'arm.' + tag, rings=14, sides=18, cap_rows=7, cap_len=1.05, occ_f=bell_sdf_nolip, squash=.94,
         occ_k=.20, start_cap=True)
    joint_arms[tag] = {'shoulder': [float(v) for v in sh], 'elbow': [float(v) for v in elbow], 'wrist': [float(v) for v in wrist],
                       'paw_tip': [float(v) for v in sh + d * (.228 + .071 * 1.05)]}
# the trousers: two fat tubes (the sheet: 0.51 m across at z 0.22, the legs touching down to z 0.155, 0.19 m wide at the ankle;
# front -0.176 m in the side view), each with rings every ~2 cm (bend loops at the knee), their tops hidden in the kimono
PANTS_Z = [(.360, .098), (.330, .112), (.300, .121), (.270, .125), (.240, .126), (.190, .124), (.150, .118), (.115, .107), (.090, .098), (.075, .094)]
def pants_r(t):
    z = .360 + (.075 - .360) * t; zz, rr = zip(*PANTS_Z[::-1]); return float(np.interp(z, zz, rr))
FOOT = dict(r=[.104, .138, .050], p=(2.6, 2.7, 2.0), pzlo=4.0, rzlo=.036)       # a domed bun, as Fuku's
def foot_sdf_s(s):
    c = np.array([s * .129, -.006, .036])            # the sole on z = 0 (rzlo 0.036)
    def f(p):
        d = sell(p, c, FOOT['r'], FOOT['p'], FOOT['pzlo'], FOOT['rzlo'])
        for k in (-1, 1):            # two shallow toe grooves on the front of the foot
            g = ell(p, c + np.array([k * .035, -.158, .036]), [.0060, .024, .044])
            d = smax(d, -g, .006)
        return d
    return f, c
for s, tag in ((-1, 'R'), (1, 'L')):
    hip = np.array([s * .110, .000, .300]); knee = np.array([s * .127, -.006, .170]); ankle = np.array([s * .129, -.008, .070])
    leg_pts = [np.array([s * .125, -.006, .360]), np.array([s * .126, -.007, .300]), np.array([s * .127, -.008, .190]),
               np.array([s * .128, -.008, .075])]
    PT = sorted(set([round(float(v), 4) for v in np.linspace(0, 1, 15)]))
    limb('pants.' + tag, leg_pts, pants_r, 'leg.' + tag, sides=24, cap_rows=4, cap_len=.45, squash=1.30, ramp='pants',
         occ_f=bell_sdf_nolip, occ_k=.30, ring_t=PT)
    ff, fc = foot_sdf_s(s)
    def foot_shade(P, N, ff=ff, fc=fc):
        lat = (P[:, 0] - fc[0]) / .104; frontz = smooth(-.09, -.13, P[:, 1] - fc[1]) * smooth(.008, .022, P[:, 2]) * smooth(.080, .06, P[:, 2])
        groove = sum(np.exp(-((lat - k * .337) / .035) ** 2) for k in (-1, 1)) * frontz
        return sval(N, .22 * groove)
    sdf_ball('foot.' + tag, ff, fc + np.array([0, 0, .01]), 8, 'leg.' + tag, 'fur', shade=foot_shade, t1=.4)
    joint_legs[tag] = {'hip': [float(v) for v in hip], 'knee': [float(v) for v in knee], 'ankle': [float(v) for v in ankle],
                       'toe': [float(fc[0]), float(fc[1] - .14), .035]}

# ================================================================ THE TAIL: a big round puff hanging from under the knot
# the sheet: from under the obi knot (z ~0.38) down and back to its round tip (bottom z 0.057), 0.25 m wide at z 0.24, reaching
# y 0.42 in the side view; fur root, the outer ~40 % dark (the back view's dark cap from z ~0.195)
TAIL_PTS = [np.array(p, float) for p in [(0, .175, .385), (0, .232, .345), (0, .282, .275), (0, .298, .200), (0, .292, .160)]]
def tail_r(t): return .072 + .054 * float(smooth(0, .55, t)) - .016 * float(smooth(.80, 1, t))
TAIL_BANDS = [(-9, .76, 'fur'), (.76, 9, 'tailtip')]
def tail_ramp(t):
    for a, b, nm in TAIL_BANDS:
        if a <= t < b: return nm
    return 'tailtip'
TAIL_RT = sorted(set([round(v, 4) for v in np.linspace(0, 1, 21)] + [a for a, _, _ in TAIL_BANDS[1:]]))
tail_ob, TAIL_V = limb('tail', TAIL_PTS, tail_r, 'tail', sides=22, cap_rows=8, cap_len=.95, ring_t=TAIL_RT,
                       face_ramp=tail_ramp, occ_f=bell_sdf_nolip, occ_k=.25)

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
def band_q(P):
    """signed distance (m, along z) from the headband's centre line"""
    phi = np.arctan2(P[:, 0], -(P[:, 1] - HY)); return P[:, 2] - band_zc(phi)
def paint_face(U, V):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = radial_hit(d); n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    fr = smooth(HY + .02, HY - .08, y)
    C = ramp_colour('fur', head_shade(P, n))
    occ = head_occ(P, n)
    # a soft contact shade where the headband sits on the head (value only)
    bq = np.abs(band_q(P)); C = C * (1 - .16 * smooth(BAND_H / 2 + .020, BAND_H / 2 + .001, bq))[:, None]
    near_face = (np.abs(x) < .5 * W) & (z < CHIN + .56 * W) & (z > CHIN - .02 * W) & (fr > 0)
    # the tanuki mask: one soft rounded band across the eyes and the nose bridge, down round the blush
    a = np.zeros(len(x)); a[near_face] = poly_fill(x[near_face], z[near_face], MASK_POLY, .0016) * fr[near_face]
    if PAINT_OPTS.get('maskall'): a = np.ones(len(x))
    C = mix(C, ramp_colour('dark', sval(n, .5 * occ, hi=.16, lo=.20)), a)
    # the cream muzzle, a round soft oval under the nose
    a = np.zeros(len(x)); a[near_face] = poly_fill(x[near_face], z[near_face], MUZ_POLY, .0026) * fr[near_face]   # a 2.5 mm blended border
    rim = np.zeros(len(x)); rim[near_face] = 1 - poly_fill(x[near_face], z[near_face], MUZ_POLY, .030 * W)
    rim *= smooth(CHIN + .20 * W, CHIN + .10 * W, z)
    C = mix(C, ramp_colour('cream', sval(n, .10 * rim, hi=.12, lo=.18)), a * PAINT_OPTS['muzzle'])
    # blush ovals (over the mask's lower edge, as on the sheet)
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .94 * (1 - smooth(.86, 1.05, r)) * fr * PAINT_OPTS['blush'])
    # brows: short soft arcs just under the band, tapering to rounded points, the outer end a touch lower
    t = np.linspace(-1, 1, 15)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * BROW_L * t, BROW_Z + .022 * W * (1 - t * t) - .011 * W - .003 * W * t], -1)
        half = .0098 * W * np.maximum(0, 1 - t * t) ** .55 + .0016 * W
        box = (np.abs(x - s * BROW_X) < .09 * W) & (np.abs(z - BROW_Z) < .05 * W) & (fr > 0)
        a = np.zeros(len(x)); a[box] = stroke(x[box], z[box], Pb, half, .0026 * W)
        C = mix(C, rgb('brow'), .96 * a)
    # the gentle "u" smile (corners 0.065 W out at z 0.182, the bottom 0.150), its ends turned up a little; no philtrum
    lw = .0052 * W
    for s in (-1, 1):
        Pm = np.array([catmull([(s * .069 * W, MZM + .020 * W), (s * .062 * W, MZM + .011 * W), (s * .042 * W, MZM - .006 * W),
                                (s * .020 * W, MZM - .014 * W), (0, MZM - .016 * W)], q) for q in np.linspace(0, 1, 17)])
        half = np.full(len(Pm), lw); half[0] = lw * .60; half[1] = lw * .85
        ib = (np.abs(x) < .11 * W) & (np.abs(z - MZM) < .05 * W) & (fr > 0)
        a = np.zeros(len(x)); a[ib] = stroke(x[ib], z[ib], Pm, half, .0024 * W); C = mix(C, rgb('mouth'), .96 * a)
    # round the eyes: a faint contact shade only (the upper lash is its own object), and a soft line under the lower rim
    for s in (-1, 1):
        sr, psi, X, Z = eye_s(s, x, z); near = fr * (sr < 2.0)
        upw = smooth(-.30, .10, Z)
        cont = 0. * sr                       # (rig lesson) no contact shade under the lash
        low = (1 - smooth(1.025, 1.050, sr)) * (1 - upw) * .55
        C = C * (1 - np.maximum(cont, 0) * near)[:, None]
        C = mix(C, rgb('lash'), low * near)
    return C.reshape(sh + (3,))

def paint_head_P(P):
    """(rig) the head's own paint at skin points P (n x 3): the face chart sampled along the radial direction"""
    d = unit(np.asarray(P, float) - O); uv = head_uv(d); return paint_face(uv[:, 0], uv[:, 1]).reshape(-1, 3)
def lid_edge_Z(X): return 1.25 + 0 * np.asarray(X, float)      # (rig) open eyes: no rest lid over the lens

def paint_eye(U, V, s):
    """X, Z in eye-opening units (X along world x). The close-up: the iris 0.65 of the opening wide, tucked against the
    nose-side corner (centre 0.40 of the half-width toward the nose, 0.05 below the middle), fully open with a white
    crescent above it and on the outer side; a big dark pupil high in the iris (the gold ring shows below and on the nose
    side); ONE big catchlight up on the nose side of the pupil, mirrored in the two eyes (as on the sheet)"""
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .40; iz = -.05; irx = .65; irz = .78
    C = mix(rgb('sclera'), rgb('#EBD9C6'), .55 * smooth(.30, .95, Z))
    C = mix(C, rgb('#F2E2D2'), .35 * smooth(.45, .95, sr))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#8A5A16'), rgb('iris'), smooth(-.05, -.75, ez))                  # gold, brightest at the bottom
    I = mix(I, rgb('#E6B43A'), .60 * smooth(-.45, -.95, ez) * smooth(.95, .45, np.abs(ex)))
    I = mix(I, rgb('#5A3A12'), smooth(.82, 1.0, r) * .55)
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    # the pupil: big (0.77 of the iris wide), high in it, a touch toward the outer side of the iris centre
    px_ = -s * .33; pz = .11; R = np.sqrt(((X - px_) / .50) ** 2 + ((Z - pz) / .65) ** 2)
    C = mix(C, mix(rgb('pupil'), rgb('#4A382C'), .35 * smooth(.2, -.6, Z - pz)), 1 - smooth(.975, 1.025, R))
    big = np.sqrt(((X - (-s * .60)) / .215) ** 2 + ((Z - .46) / .205) ** 2)
    C = mix(C, rgb('#FFFAF4'), 1 - smooth(.90, 1.08, big))
    C = mix(C, rgb('lash'), smooth(.955, .998, sr) * (.40 + .45 * smooth(-.2, .5, Z)))  # the lid contact rim
    return C

def collar_line(path):
    """the front projection of a collar stretch as z(x) (sorted by x)"""
    P = np.asarray(path); o = np.argsort(P[:, 0]); return P[o, 0], P[o, 2]
_cp = np.asarray(COLLAR_PATH); _nC = len(_cp)
_OVER = collar_line(_cp[int(.10 * _nC):int(.42 * _nC)])          # chest stretch of the over band (his left shoulder)
_UNDER = collar_line(_cp[int(.79 * _nC):])                         # the under band (his right shoulder to the crossing)
def paint(chart, U, V):
    if chart == 'cavity':
        return mix(rgb('#5a1e22'), rgb('#3e1418'), .5 * smooth(.3, 1, V))
    if chart == 'tongue':
        C = mix(rgb('#e88a96'), rgb('#f2a2ac'), .5 * smooth(.2, .9, V)); return mix(C, rgb('#d07080'), .35 * np.exp(-((U - .5) / .05) ** 2))
    if chart.startswith(('lidU', 'lidD')): return np.broadcast_to(rgb('fur'), U.shape + (3,)).copy()     # repainted by the rig
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
        ri = np.sqrt(a * a + (b - .06) ** 2)               # the pink inner: 0.43 of the disc, a touch high (the close-up)
        Ci = ramp_colour('pink', clamp(.46 + .20 * b - .14 * smooth(.26, .46, ri)))
        return mix(C, Ci, 1 - smooth(.415, .45, ri))
    if chart == 'nose':
        a = (U - .5) * .13 * W; b = (V - .5) * .13 * W
        C = ramp_colour('nose', .45 + .10 * smooth(-.02, .02, b))
        hl = np.exp(-(((a + .012 * W) / (.013 * W)) ** 2 + ((b - .010 * W) / (.007 * W)) ** 2))
        return mix(C, rgb('#6E5A52'), .55 * hl)
    if chart == 'torso':
        x0, x1, z0, z1 = TORSO_CH; x_ = x0 + U * (x1 - x0); z_ = z0 + V * (z1 - z0)
        y_ = front_hit(x_.ravel(), z_.ravel(), bell_sdf, -.5, .2).reshape(U.shape); y_ = np.where(np.isfinite(y_), y_, -.1)
        P = np.stack([x_, y_, z_], -1).reshape(-1, 3); N = grad(bell_sdf, P)
        C = ramp_colour('kimono', torso_shade(P, N)).reshape(U.shape + (3,))
        # the chest fur in the collar's V: above both collar bands' centre lines (the ribbons cover the borders)
        zo = np.interp(x_, *_OVER, left=-9, right=9); zu = np.interp(x_, *_UNDER, left=9, right=-9)
        v = smooth(-.002, .002, z_ - zo) * smooth(-.002, .002, z_ - zu)
        Cf = ramp_colour('fur', sval(N, .40 * ao(body_occ, P, N, .05), hi=.12, lo=.22)).reshape(U.shape + (3,))
        return mix(C, Cf, v)
    raise KeyError(chart)

atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [168, 132, 110, 255]
for name, (x0, y0, w, h) in CHARTS.items():
    U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
    if name in ('face', 'torso'):
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
atlas_path = os.path.join(ROOT, 'scratch' if FAST else '', 'yk-yuzu-toy_rig_atlas.png' if RIG else 'yk-yuzu-toy_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Yuzu_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Yuzu_toy_atlas'); MAT.use_nodes = True
bs = next(n for n in MAT.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
bs.inputs['Roughness'].default_value = .8; bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .12
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
def ext(obs):
    A = all_verts(obs); return {k: [round(float(A[:, i].min()), 3), round(float(A[:, i].max()), 3)] for i, k in enumerate('xyz')}
ALL = all_verts([o for g in parts.values() for o in g])
rimL = np.array([verts[i] for i in roll_info[1][0]])
EV = {s: all_verts(parts['ear.' + ('L' if s > 0 else 'R')]) for s in (-1, 1)}
MEAS = {'units': 'W = %.3f m face width at the cheeks; front-view z above the chin, profile y from the head centre (W)' % W,
        'total_height_m': round(float(ALL[:, 2].max()), 4), 'lowest_z_m': round(float(ALL[:, 2].min()), 5), 'chin_m': CHIN,
        'head_width_W_at_z': {str(z): width_at(z) for z in (.022, .048, .074, .100, .127, .153, .179, .205, .231, .258, .284,
                                                              .310, .336, .362, .44, .50, .55, .60, .65)},
        'head_top_W_at_x': {str(xw): top_at_x(xw) for xw in (0., .105, .20, .30)},
        'profile_front_W_at_z': {str(z): prof_front(z) for z in (.021, .047, .073, .099, .126, .152, .178, .204, .282, .308, .334, .361,
                                                                 .387, .413, .439, .466, .648)},
        'profile_back_W_at_z': {str(z): back_at(z) for z in (.021, .047, .073, .099, .126, .152, .178, .204, .230, .256, .282, .308,
                                                             .334, .648)},
        'nose_tip_y_m': round(float(nose_tip[:, 1].min()), 4), 'nose_tip_W_ahead': round(float((HY - nose_tip[:, 1].min()) / W), 3),
        'eye_opening_W': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'eye_centre_W': [round(EX / W, 3), round((EZ - CHIN) / W, 3)],
        'ear_extent_W': {'x_outer': round(float(EV[1][:, 0].max() / W), 3), 'top_z': round(float((EV[1][:, 2].max() - CHIN) / W), 3),
                         'top_m': round(float(EV[1][:, 2].max()), 3)},
        'nose_W': [round(float(np.ptp(NOSE_OUT[:, 0])) / W, 3), round(float(np.ptp(NOSE_OUT[:, 1])) / W, 3)],
        'bell_extent_m': ext(parts['body']), 'obi_extent_m': ext(parts['obi']), 'flap_extent_m': ext(parts['flap']),
        'band_extent_m': ext(parts['band']), 'lash_L_extent_m': ext(parts['lash.L']),
        'collar_extent_m': ext(parts['collar']), 'sleeve_L_extent_m': ext(parts['sleeve.L']),
        'arm_span_m': round(float(np.ptp(all_verts(parts['arm.L'] + parts['arm.R'])[:, 0])), 3),
        'arm_L_extent_m': ext(parts['arm.L']), 'leg_L_extent_m': ext(parts['leg.L']),
        'tail_extent_m': {k: [round(float(TAIL_V[:, i].min()), 3), round(float(TAIL_V[:, i].max()), 3)] for i, k in enumerate('xyz')},
        'collar_min_head_clearance_m': round(float(head_sdf(COLLAR_PATH).min()), 4)}
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
    ob = bpy.context.object; ob.name = 'Yuzu_' + group.replace('.', '_')
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
           'ear.L': tuple(EAR_C[1]), 'ear.R': tuple(EAR_C[-1]), 'tail': tuple(TAIL_PTS[1]),
           'arm.L': joint_arms['L']['shoulder'], 'arm.R': joint_arms['R']['shoulder'],
           'sleeve.L': joint_arms['L']['shoulder'], 'sleeve.R': joint_arms['R']['shoulder'],
           'leg.L': joint_legs['L']['hip'], 'leg.R': joint_legs['R']['hip'], 'obi': (0, 0, OBI_ZM),
           'lash.L': eye_centers['L'], 'lash.R': eye_centers['R'], 'band': tuple(O),
           'flap': (0, 0, FL_TOP), 'collar': (0, 0, .55), 'body': (0, 0, .40)}.get(group, (0, 0, 0))
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
tail_chain = [[float(v) for v in catmull(TAIL_PTS, t)] for t in (0., .25, .5, .75, 1.)] + \
             [[float(v) for v in TAIL_V[np.argmax(TAIL_V[:, 1])]]]
joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X',
          'hips': [0, .010, .310], 'spine': [0, .012, .400], 'chest': [0, .015, .500], 'neck': [0, .020, .610],
          'head': [float(v) for v in O], 'jaw_pivot': [0, float(HY - .10 * W), float(CHIN + .10 * W)],
          'eyes': eye_centers, 'ears': ears_j, 'arms': joint_arms, 'sleeves': sleeve_info, 'legs': joint_legs, 'tail': tail_chain,
          'lashes': lash_info, 'headband': {'front_z': BAND_ZF, 'back_z': BAND_ZB, 'height': BAND_H, 'proud': BAND_T},
          'obi_knot': [float(v) for v in KNOT_C], 'kimono_hem_z': Z_HEM, 'over_panel_top_z': FL_TOP,
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth SDF ball (cranium + cheek mass + jaw + muzzle displacement + trim), radially projected, analytic normals.',
                    'Eyelid holes ringed by 5 loops each, rim rolled in behind separate lens eyeballs; 3 loops round the mouth.',
                    'Separate pieces: eyes, lash ribbons (origin at the eye centre, for the upper lids), ears, headband (rigid head follower),',
                    'tail (bend rings), sleeves (rings along the upper arm, open cuff), forearms, trouser legs (rings every ~2 cm) + feet,',
                    'the kimono bell (rings every 1.5-2 cm, rolled hem), the over panel (below the obi), obi + knot, collar ribbon.']}
if RIG:
    pass
elif not FAST:
    with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-fast.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not FAST and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'yk-yuzu-toy.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG: bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('YUZU_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
