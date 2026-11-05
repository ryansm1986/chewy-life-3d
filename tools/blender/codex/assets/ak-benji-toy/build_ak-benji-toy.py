"""Benji, the shopkeeper of Akane Hamlet (Toybox zone villager, VL-2), phase-1 model. Blender 4.3, no addons.
Deterministic.

    blender --background --factory-startup --python build_ak-benji-toy.py [-- --fast]

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/ak-benji-toy.glb (--fast: no toon refinement, writes scratch/ak-benji-fast.glb instead).

Technique (Fuku's / Tanu's toy-line machinery; measure.md has the sheet's numbers):
- The head is ONE smooth implicit ball (domed cranium + chubby cheek mass + jaw, smooth-unioned, a gentle muzzle
  displacement and a soft trim; fitted to the sheet's front widths and side profile by scratch/fit_head.py). Its skin is the
  field's zero surface reached by radial projection (CDT in a stereographic domain, edge loops round both eyelid holes
  and the mouth), so every vertex carries the field's analytic normal and the face stays convex. Flush lens eyeballs.
- The upper lash lines are their OWN objects (Benji_lash_L/R: a thick tapered roll with the outer wing, lying on the
  skin); nothing of the lash is painted on the skin.
- The tanuki mask, the cream muzzle, brows, the smile and blush are painted in a face chart from 3D positions (front
  projection = the sheet's front view), with soft 2-3 mm borders.
- The big maple leaf on the head is a thick rounded slab draped over the crown (it follows the head where it touches,
  stands free above it), painted veins, a short stem.
- The body is ONE lathe-like bell (a superellipse section per height): the orange shirt above, the fur hips below (a colour
  border on an edge loop, as the sheet's back and side views). The apron is a bib + a skirt (thick cloth slabs riding the
  bell), a waist band round the whole body, two thick straps over the shoulders straight down the back, a patch pocket.
- Short T-shirt sleeves (lofted tubes with a rolled hem) round the upper arms; fur forearms with mitten paws; dark
  trouser legs and fur bun feet; the big round tail (fur root, dark cap) with bend loops.
- The shoulder bag on his left hip (a rounded box, a flap with the chestnut emblem) on a thick strap from his right
  shoulder across the chest and the back.
- One 2048 painted atlas: face, eyes, ears, nose, leaf, the shirt's neck chart, the bag flap and 1-D shading ramps (soft
  light baked into the colour, never hard shadows).
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
MODEL = 'D:/projects/chewy-life-3d/public/models/ak-benji-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'ak-benji-fast.glb') if FAST else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(5)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
LOG = {}

# ---------------------------------------------------------------- the sheet's measures (measure.md)
# turnaround: ground y 521, leaf stem tip y 68 -> 1.105 m (the sheet's TOTAL 1.10), 410 px / m; front-view head 236 px at
# the cheeks -> W 0.5756 m; chin 0.574 m (the close-up's widest row z 0.253 W). Head close-up: W = 320 px, chin y 836,
# features centred on x 186.7 (the outline on 182.5).
W = .5756; CHIN = .574; HY = .035           # head width at the cheeks, chin height, head centre y (side view, behind the leg axis)
SW = W / .44                                # Rosie's metric detail sizes (authored at W 0.44) scale by SW

PAL = {'fur': '#9A7864', 'furdark': '#866652', 'furlight': '#A88673',
       'dark': '#4A3A34', 'darkdark': '#3C2F2A', 'darklight': '#5A4740',
       'cream': '#F0E0D0', 'creamdark': '#DFCAB6', 'creamlight': '#F7EDE2',
       'shirt': '#D8803A', 'shirtdark': '#C26C2C', 'shirtlight': '#E3914C',
       'trousers': '#665443', 'trousersdark': '#584737', 'trouserslight': '#746150',   # the sheet's #5A4A3A a touch lighter (game grade)
       'apron': '#F4E4C4', 'aprondark': '#E4D0AC', 'apronlight': '#F8ECD4',
       'leaf': '#D8542E', 'leafdark': '#C04424', 'leaflight': '#E4673E',
       'bag': '#A87843', 'bagdark': '#946535', 'baglight': '#B78750',
       'pink': '#D9908A', 'pinkdark': '#C67D77', 'pinklight': '#E2A29B',
       'iris': '#C88A38', 'pupil': '#2A1C16', 'nose': '#302622', 'sclera': '#FFF8EF', 'blush': '#D99089',
       'lash': '#221815', 'brow': '#45352F', 'mouth': '#302622', 'emblem': '#5A3A2A'}
CHARTS = {'face': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'ear': (1280, 896, 256, 256), 'nose': (1536, 896, 256, 256),
          'torso': (0, 0, 768, 512), 'leaf': (768, 0, 512, 512), 'flap': (1280, 0, 256, 256)}
if RIG:   # phase-2 charts in unused atlas space (the approved paint is untouched)
    CHARTS.update({'lidU': (1536, 0, 512, 256), 'lidD': (1536, 256, 512, 192), 'cavity': (1536, 448, 128, 128), 'tongue': (1664, 448, 128, 128)})
# the upper lash is its own object (no lash painted on the skin); maskall: (rig lids) the mask everywhere
PAINT_OPTS = {'blush': True, 'muzzle': True}
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'dark': ('darkdark', 'dark', 'darklight'),
         'cream': ('creamdark', 'cream', 'creamlight'), 'shirt': ('shirtdark', 'shirt', 'shirtlight'),
         'shirtin': ('#94501E', '#A85C26', '#B8692E'), 'trousers': ('trousersdark', 'trousers', 'trouserslight'),
         'apron': ('aprondark', 'apron', 'apronlight'), 'nose': ('#1E1714', 'nose', '#4A3C36'),
         'eyedark': ('#1A1210', '#241A16', '#3E302A'), 'pink': ('pinkdark', 'pink', 'pinklight'),
         'tailtip': ('darkdark', 'dark', 'darklight'), 'leaf': ('leafdark', 'leaf', 'leaflight'),
         'stem': ('#B4401E', '#C64C26', '#D45A30'), 'bag': ('bagdark', 'bag', 'baglight'),
         'bagin': ('#6E4A26', '#7C552E', '#8A6036'), 'lash': ('#120C0E', '#1A1214', '#4A3E42')}
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
# fitted by scratch/fit_head.py to the sheet's front widths (1.00 W at z 0.25, 0.95 at 0.37, 0.90 at 0.43, 0.87 at 0.46),
# the side profile (front 0.44 W at the eyes, the muzzle 0.505 W, back 0.44 W: a deep round head) and the crown (0.725 W)
CR = ([0, .000, 0.4036], [0.3857, 0.3936, 0.2444], (1.6595, 2.0, 3.0689))    # domed cranium
CK = ([0, 0.0021, 0.1368], [0.4779, 0.3894, 0.2087], (3.8583, 2.1, 2.7493))   # wide, chubby cheek mass
K_CK = 0.2754
# the muzzle: a smooth displacement of the ball (no union crease), zero slope at its edge, its lower half fading into the chin
MZ = ([0, -0.36, 0.1718], [0.3136, 0.1358, 0.185])
MZ_A = 0.0554                               # the sheet's side view: the cream muzzle bulges ~4 cm ahead of the eyes
# the jaw: a soft volume smooth-unioned low in front
JW = ([0, -0.2291, 0.0452], [0.2617, 0.2277, 0.1064]); K_JW = 0.0622
# a soft ellipsoid trim rounds the upper head
TR = ([0, -0.0003, 0.2918], [0.5485, 0.5716, 0.4578]); K_TR = 0.0336

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
EX = .195 * W; EZ = CHIN + .348 * W; EHW = .092 * W; EHH = .097 * W; EN = 2.1   # the sheet: 0.184 x 0.194 W, centres (+-0.195, 0.348)
def eye_unit(psi):
    return spow(np.cos(psi), 2 / EN), spow(np.sin(psi), 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
NOSE_Z = CHIN + .258 * W; NOSE_TOP = CHIN + .294 * W; NOSE_BOT = CHIN + .234 * W   # (the button's upward push puts its centre at 0.265)
MZM = CHIN + .183 * W                                                       # the smile's centre line (ends 0.200, bottom 0.167)
BROW_X = .210 * W; BROW_Z = CHIN + .569 * W; BROW_L = .064 * W
BLUSH = (.314 * W, CHIN + .220 * W, .053 * W, .035 * W)
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
# the tanuki mask (W, z above the chin), measured per column on the sheet (measure/m5.py, the cheek crop): a broad rounded band
# round both eyes, its top dipping over the bridge, its outer tip at x 0.42, its lower edge under the blush; it runs on under
# the muzzle (the cream covers it there)
MASK_R = [(0, .416), (.025, .419), (.050, .430), (.075, .447), (.100, .469), (.125, .483), (.150, .493), (.175, .497),
          (.200, .497), (.225, .493), (.250, .486), (.275, .472), (.300, .457), (.325, .440), (.350, .415), (.375, .385),
          (.395, .350), (.410, .315), (.418, .285), (.415, .255), (.400, .225), (.375, .200), (.345, .187), (.310, .183),
          (.275, .185), (.250, .189), (.225, .195), (.200, .205), (.175, .222), (.150, .245), (.120, .270), (.090, .290),
          (.060, .305), (.030, .313), (0, .316)]
MASK_POLY = chaikin(mirror_outline(MASK_R), 2) * W + np.array([0, CHIN])
# the cream muzzle: a big soft bell from just over the nose (0.31) to near the chin (0.03), widest 0.37 W at z 0.17
MUZ_R = [(0, .310), (.050, .305), (.080, .293), (.105, .279), (.125, .266), (.142, .253), (.156, .240), (.167, .227),
         (.176, .214), (.182, .200), (.186, .184), (.187, .166), (.185, .150), (.180, .133), (.173, .117), (.163, .103),
         (.150, .091), (.132, .080), (.110, .069), (.082, .055), (.052, .042), (.025, .034), (0, .031)]
MUZ_POLY = chaikin(mirror_outline(MUZ_R), 2) * W + np.array([0, CHIN])

# ---------------------------------------------------------------- the fur shade (shared by the face chart and the ramps)
EAR_C = {s: np.array([s * .300 * W, HY + .040, CHIN + .608 * W]) for s in (-1, 1)}   # on the head's top corners (the side view: a little behind the centre)
def head_occ(P, n):
    o = np.zeros(len(P))
    for s in (-1, 1):
        dd = np.linalg.norm(P - EAR_C[s], axis=-1); o = o + .10 * np.exp(-(dd / (.13 * W)) ** 2)
    return o
def head_shade(P, n): return sval(n, head_occ(P, n), hi=.08, lo=.24)       # rig round: the crown lightens at most ~+5% (director: <= +8%, no hue shift)
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
for k, (hx, hz) in enumerate([(.088, .024), (.101, .031), (.114, .038)]):
    a = np.linspace(0, 2 * PI, 40, endpoint=False)
    add_loop(to_dom(surf_dir(hx * W * spow(np.cos(a), .8), MZM - .002 * W + hz * W * np.sin(a))), 'mouth_%d' % k)
NB = 64; AB = math.radians(150)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
def fib(n):
    ii = np.arange(n) + .5; phi = np.arccos(1 - 2 * ii / n); th = PI * (1 + 5 ** .5) * ii
    return np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
NF = 1500 if FAST else 2200
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
keep &= ~(front & ((Pf[:, 0] / (.126 * W)) ** 2 + ((Pf[:, 2] - MZM) / (.054 * W)) ** 2 < 1))
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

# ================================================================ LASH ROLLS: the upper lash line + the outer wing (own objects)
# The sheet (measure/m11.py): ~0.027-0.03 W thick over the top of the opening, thickening to the outer upper corner, one
# thick wing flicking out to (1.40, 0.74) eye units. A flattened tapered roll lying on the skin, its inner edge just inside
# the lid hole (over the lens edge). Separate objects (origin at the eye centre) so the rig can hang them on the upper lids.
# Nothing of the lash is painted on the skin.
LASH_PSI = np.radians(np.linspace(162, -40, 29))         # inner top -> over the top -> down the outer side
def lash_th(psi):      # thickness in eye-radius units
    d = np.degrees(psi)
    th = .36 + .12 * np.exp(-((d - 28) / 30) ** 2)
    th = th * (1 - .55 * smooth(15, -38, d))
    return th * smooth(164, 132, d) * smooth(-42, -8, d) + .02
LASH_WING = ((26, .97), (1.42, .76))           # (root psi deg, root k), tip (X outer, Z) eye units
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
            up = hp[i] * (sa if sa > 0 else .40 * sa)
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
lash_info = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    th = lash_th(LASH_PSI); k_in = .965
    ux, uz = eye_unit(LASH_PSI)
    Pin, _ = eye_pt(s, ux * k_in, uz * k_in); Pout, _ = eye_pt(s, ux * (k_in + th), uz * (k_in + th))
    Cm, nm = eye_pt(s, ux * (k_in + th / 2), uz * (k_in + th / 2))
    hw = np.linalg.norm(Pout - Pin, axis=1) / 2
    tt_ = np.linspace(0, 1, len(LASH_PSI))
    hp = (.0100 * W) * (.55 + .45 * smooth(0, .25, tt_)) * (1 - .55 * smooth(.72, 1.0, tt_))
    V, F, NV = lash_ribbon(Cm, nm, hw, hp)
    allV = [V]; allF = [F]; allN = [NV]; off = len(V)
    (rpsi, rk), (tx, tz) = LASH_WING
    rp = math.radians(rpsi); rux, ruz = eye_unit(np.array([rp])); thr = lash_th(np.array([rp]))[0]
    R0 = np.array([rux[0] * (k_in + thr * .45), ruz[0] * (k_in + thr * .45)]); T0 = np.array([tx, tz])
    mid = R0 + (T0 - R0) * .5 + np.array([-.04, .07])         # a slight upward curl
    ws = np.linspace(0, 1, 12)
    XZ = np.array([(1 - w) ** 2 * R0 + 2 * (1 - w) * w * mid + w * w * T0 for w in ws])
    Cw, nw = eye_pt(s, XZ[:, 0], XZ[:, 1])
    hww = (.0200 * W) * (1 - ws) ** .85 + .0016 * W
    hpw = (.0080 * W) * (1 - .70 * ws)
    Vw, Fw, NVw = lash_ribbon(Cw, nw, hww, hpw, NLS=6)
    allV.append(Vw); allF.append([tuple(i + off for i in f) for f in Fw]); allN.append(NVw)
    V = np.vstack(allV); NV = np.vstack(allN); F = [f for FF in allF for f in FF]
    ax_ = eye_axes[tag]; fac = clamp(.42 + .30 * (NV @ ax_) ** 3)      # true black (#1a1214), a faint highlight on the top only
    uv = [[tuple(ramp_uv('lash', fac[i:i + 1])[0]) for i in f] for f in F]
    make_obj('lash_line.' + tag, V, F, uv, 'lash.' + tag, NV)
    lash_info[tag] = dict(top=[float(v) for v in Cm[np.argmax(Cm[:, 2])]], outer_end=[float(v) for v in Cm[-1]],
                          wing_tip=[float(v) for v in Cw[-1]], max_proud_W=round(float(hp.max() / W), 4),
                          thick_top_W=round(float(2 * hw[np.argmax(Cm[:, 2])] / W), 4))
LOG['lash'] = lash_info

# ================================================================ NOSE: a glossy rounded-triangle button on the muzzle
def resample(poly, step):
    seg = np.linalg.norm(np.roll(poly, -1, 0) - poly, axis=1); L = np.concatenate([[0], np.cumsum(seg)])
    n = max(8, int(round(L[-1] / step))); t = np.linspace(0, L[-1], n, endpoint=False)
    P = np.concatenate([poly, poly[:1]]); return np.stack([np.interp(t, L, P[:, 0]), np.interp(t, L, P[:, 1])], -1)
def _nose_outline(n=48):
    # a soft rounded oval, a little broader on top (the sheet: 0.097 x 0.060 W)
    t = np.linspace(0, 2 * PI, n, endpoint=False); u = np.cos(t); v = np.sin(t)
    y = .0300 * W * spow(v, .90); taper = (.66 + .34 * ((v + 1) / 2) ** .9)
    x = .0565 * W * spow(u, .82) * taper
    return np.stack([x, y + .001 * W], -1)
NOSE_OUT = _nose_outline()
NOSE_H = .022                                                   # the button stands 22 mm proud (the sheet's side view: a low button)
def build_nose():
    rows = []; V = []; UV = []
    rings = [1.0, .985, .94, .85, .70, .50, .27]
    prof = [-.003, .0080, .0138, .0179, .0202, .0215, .0220]
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
EAR_OUT = 20.                         # degrees the disc faces outward from the front (12-20 reads thick from both game yaws)
ear_info = {}
for s in (-1, 1):
    C0 = EAR_C[s]; ne = unit(np.array([s * math.sin(math.radians(EAR_OUT)), -math.cos(math.radians(EAR_OUT)), .10]))
    up = np.array([0, 0, 1.]); up = unit(up - ne * (up @ ne)); tt = np.cross(up, ne)
    at = au_ = .194 * W; an, dish = .052 * W, .020 * W        # the sheet: a 0.388 W disc
    seg, rows_ = 28, 12; V = []
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
                a_ = s * (p @ tt) / at; b_ = p @ up / au_; lp[uvl].uv = tuple(au('ear', .5 + .48 * a_, .5 + .48 * b_))   # a_ > 0: outward
            else:
                n_ = unit(np.array(lp.vert.normal)); lp[uvl].uv = tuple(ramp_uv('dark', sval(n_[None], .04))[0])
    bm.to_mesh(ob.data); bm.free()
    ear_info[s] = (C0, ne, up, tt)


# ================================================================ THE LEAF: a big maple leaf draped over the crown
# The sheet (measure/m9.py): seen from the front it spans x -0.26..+0.28 W, its main lobe tip on the forehead at z 0.58 W, its
# top lobes 0.87 W, the stem tip at (0.15, 0.92); the side view tilts it ~38 deg (front low, back high: z 0.94 -> 1.08 m).
# A 5-lobed leaf (2D: a smooth union of tapered lobe capsules round a centre disc), a thick rounded slab whose mid-surface is
# a tilted plane softly pushed out of the head (it rests on the forehead and the front of the crown, stands free behind),
# painted veins, a short curling stem.
LEAF_TILT = math.radians(40.)        # the face tilted forward (a compromise of the front view, which sees its face, and the side view)
LEAF_N = np.array([0, -math.sin(LEAF_TILT), math.cos(LEAF_TILT)])        # the leaf's top-face normal (forward-up)
LEAF_V = np.array([0, math.cos(LEAF_TILT), math.sin(LEAF_TILT)])         # in-plane "up" (toward the stem, back-up)
LEAF_U = np.array([1., 0, 0])
LEAF_C = np.array([0.006 * W, HY - .255 * W, CHIN + .770 * W])            # the leaf's centre (the vein junction)
# lobe tips (u, v in W; v toward the stem) and their base / tip half-widths
LEAF_LOBES = [((0.000, -.228), .150, .022), ((.244, -.047), .142, .021), ((-.240, -.108), .142, .021),
              ((.214, .132), .124, .020), ((-.189, .158), .122, .020)]          # rig round: a touch more pointed
LEAF_T = .030                                                           # slab thickness (m)
def leaf_sdf2(P):
    d = np.linalg.norm(P, axis=-1) - .170 * W
    for (tx, ty), w0, w1 in LEAF_LOBES:
        T = np.array([tx, ty]) * W; t = np.clip((P @ T) / (T @ T), 0, 1)
        q = np.linalg.norm(P - t[..., None] * T, axis=-1) - (w0 + (w1 - w0) * t ** .8) * W
        d = smin(d, q, .022 * W)
    # the stem notch: a soft dent at the top between the basal lobes
    d = smax(d, -(np.linalg.norm(P - np.array([.02, .175]) * W, axis=-1) - .045 * W), .02 * W)
    return d
def leaf_outline(n=150):
    th = np.linspace(0, 2 * PI, n, endpoint=False); D = np.stack([np.cos(th), np.sin(th)], -1)
    lo = np.zeros(n); hi = np.full(n, .4 * W)
    for _ in range(40):
        m = (lo + hi) / 2; inn = leaf_sdf2(D * m[:, None]) < 0; lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return D * ((lo + hi) / 2)[:, None]
def leaf_mid(u, v):
    """the draped mid-surface point for leaf-plane coords (metres)"""
    u = np.asarray(u, float); v = np.asarray(v, float); r2 = (u * u + v * v) / (.27 * W) ** 2
    # a cap-like curl: the leaf bends down round the crown (both ways along v, gently across u), then rests on the head
    bend = v * v / (2 * .26) + u * u / (2 * .30)       # rig round: cupped
    B = LEAF_C + u[..., None] * LEAF_U + v[..., None] * LEAF_V - bend[..., None] * LEAF_N
    clr = LEAF_T / 2 + .0025
    for _ in range(4):
        d = head_sdf(B); g = grad(head_sdf, B.reshape(-1, 3)).reshape(B.shape)
        push = smax(d, np.full_like(d, clr), .016) - d
        B = B + g * push[..., None] * .8
    return B
def leaf_frame(u, v, e=.0015):
    M = leaf_mid(u, v); Mu = leaf_mid(u + e, v) - leaf_mid(u - e, v); Mv = leaf_mid(u, v + e) - leaf_mid(u, v - e)
    return M, unit(np.cross(Mu, Mv))
def leaf_uv(u, v): return au('leaf', .5 + np.asarray(u) / (.64 * W), .5 + np.asarray(v) / (.64 * W))
def build_leaf():
    out = leaf_outline()
    def area(p): return .5 * np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1])
    if area(out) < 0: out = out[::-1]
    out = resample(out, .0100)
    step = .0175; gx, gy = np.meshgrid(np.arange(-.36 * W, .36 * W, step), np.arange(-.36 * W, .36 * W, step * .866))
    G = np.stack([gx.ravel(), gy.ravel()], -1); G[:, 0] += step / 2 * (np.round((G[:, 1] + .36 * W) / (step * .866)) % 2)
    G = G[leaf_sdf2(G) < -.0065]
    P2 = np.concatenate([out, G]); nO = len(out)
    res = delaunay_2d_cdt([Vector(p) for p in P2], [(i, (i + 1) % nO) for i in range(nO)], [], 0, 1e-9)
    vout = np.array([[v.x, v.y] for v in res[0]]); Fo = np.array([list(f) for f in res[2]])
    assert len(vout) == len(P2), 'leaf CDT merged points'
    Fo = Fo[in_poly(vout[Fo].mean(1), out)]; n2 = len(vout)
    # the thickness thins toward the rim (a soft pillowy slab)
    dd = -leaf_sdf2(vout); tk = LEAF_T * (.70 + .30 * smooth(0, .05, dd))
    M, N = leaf_frame(vout[:, 0], vout[:, 1])
    Pt = M + N * (tk / 2)[:, None]; Pb = M - N * (tk / 2)[:, None]
    V = list(Pt) + list(Pb); F = [tuple(f) for f in Fo] + [tuple(n2 + f[::-1]) for f in Fo]
    UV = list(leaf_uv(vout[:, 0], vout[:, 1])) + [None] * n2
    L2 = vout[:nO]; tang = np.roll(L2, -1, 0) - np.roll(L2, 1, 0); m = unit(np.stack([tang[:, 1], -tang[:, 0]], -1))
    Mo, No = M[:nO], N[:nO]; t0 = tk[:nO]
    rows = [list(range(nO))]; Rr = 4
    for j in range(1, Rr):
        ph = PI * j / Rr; q = L2 + m * (t0[:, None] / 2 * .95 * math.sin(ph))
        Mq, Nq = leaf_frame(q[:, 0], q[:, 1])
        rows.append(list(range(len(V), len(V) + nO))); V += list(Mq + Nq * (t0 / 2 * math.cos(ph))[:, None]); UV += [None] * nO
    rows.append(list(range(n2, n2 + nO)))
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(nO): F.append((a_[i], b_[i], b_[(i + 1) % nO], a_[(i + 1) % nO]))
    V = np.array(V); ob = make_obj('leaf', V, F, np.zeros((len(V), 2)), 'leaf')
    # uv: the top face samples the painted leaf chart; the underside and the rim the leaf ramp (a touch darker)
    me = ob.data; me.update(); Nn = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('normal', Nn); Nn = Nn.reshape(-1, 3)
    uvl = me.uv_layers['Atlas']; top = set(range(n2))
    val = sval(Nn, .18 * ao(head_sdf, V, Nn, .03), hi=.16, lo=.24)
    for poly in me.polygons:
        is_top = all(me.loops[li].vertex_index in top for li in poly.loop_indices)
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            uvl.data[li].uv = tuple(UV[vi]) if is_top else tuple(ramp_uv('leaf', val[vi:vi + 1] * .80)[0])
    return ob, vout, out
leaf_ob, LEAF_PTS2, LEAF_OUT2 = build_leaf()
# the stem: a short tapered curl rising from the notch, up and to his left (the sheet's front view: the tip at x +0.15 W)
_sb = np.array([.030, .140]) * W; _Ms, _Ns = leaf_frame(np.array([_sb[0]]), np.array([_sb[1]]))
STEM_PTS = [_Ms[0] + _Ns[0] * .002, _Ms[0] + _Ns[0] * .012 + LEAF_V * .012 + LEAF_U * .008,
            _Ms[0] + _Ns[0] * .022 + LEAF_V * .026 + LEAF_U * .026, _Ms[0] + _Ns[0] * .028 + LEAF_V * .036 + LEAF_U * .048]
limb('leaf_stem', STEM_PTS, lambda t: .0105 - .0030 * t, 'leaf', rings=8, sides=10, cap_rows=4, cap_len=1.0, ramp='stem')
LOG['leaf'] = {'centre_m': [round(float(v), 4) for v in LEAF_C], 'tilt_deg': round(math.degrees(LEAF_TILT), 1),
               'stem_tip_m': [round(float(v), 4) for v in STEM_PTS[-1]]}

# ================================================================ BODY: the shirt + fur-hips bell (one lathe)
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
# the bell's sections (metres): z, half-width a (front / back view), front depth bf, back depth bb (side view, from the leg axis)
# measured on the turnaround (measure.md): the fur hips 0.47 wide at z 0.20-0.30 over the trouser legs, cinched under the
# apron band (0.37 wide at z 0.37-0.42), the shirt 0.36 wide under the sleeves, the neck in the head
BELL = [(.165, .222, .172, .182), (.185, .230, .180, .192), (.220, .235, .185, .197), (.260, .236, .186, .198),
        (.300, .231, .182, .192), (.340, .214, .172, .176), (.375, .190, .160, .156), (.410, .180, .156, .150),
        (.450, .182, .156, .148), (.490, .180, .152, .146), (.520, .168, .142, .138), (.550, .145, .126, .124),
        (.575, .112, .102, .100), (.600, .068, .066, .066), (.620, .025, .025, .025)]
BZ, BA, BF, BB = [np.array(c, float) for c in zip(*BELL)]
Z_BOT, Z_TOP = float(BZ[0]), float(BZ[-1])
Z_SHIRT = .392               # the shirt's hem (fur hips below, orange shirt above): an edge loop under the apron band
HIPS_RAMP = 'fur'            # the sheet's back and side views: fur-coloured hips under the shirt ('trousers' if it should be cloth)
def bell_n(z): return 2.3 + 0 * np.asarray(z, float)
def bell_r(phi, z, lip=True):
    z = np.asarray(z, float); phi = np.asarray(phi, float)
    a = pchip(BZ, BA, z); bf = pchip(BZ, BF, z); bb = pchip(BZ, BB, z); n = bell_n(z)
    c = np.cos(phi); s = np.sin(phi); b = np.where(c > 0, bf, bb)
    return 1 / ((np.abs(s) / a) ** n + (np.abs(c) / b) ** n + 1e-12) ** (1 / n)
def bell_pt(phi, z, lip=True, dr=0.):
    r = bell_r(phi, z) + dr; phi = np.asarray(phi, float) * np.ones_like(r)
    return np.stack([r * np.sin(phi), -r * np.cos(phi), np.asarray(z, float) * np.ones_like(r)], -1)
def bell_normal(phi, z, lip=True, e=2e-4):
    Pp = bell_pt(phi + e, z) - bell_pt(phi - e, z); Pz = bell_pt(phi, z + e) - bell_pt(phi, z - e)
    return unit(np.cross(Pp, Pz))
def bell_sdf(p, lip=True):
    p = np.asarray(p, float); z = p[..., 2]; zc = np.clip(z, Z_BOT, Z_TOP)
    phi = np.arctan2(p[..., 0], -p[..., 1]); rho = np.hypot(p[..., 0], p[..., 1])
    return np.maximum(np.maximum((rho - bell_r(phi, zc)) * .92, Z_BOT - z), z - Z_TOP)
def bell_sdf_nolip(p): return bell_sdf(p, False)
def body_occ(p): return np.minimum(head_sdf(p), 9.)
def torso_shade(P, N): return sval(N, .30 * ao(body_occ, P, N, .05), hi=.15, lo=.24)
TORSO_CH = (-.20, .20, .44, .625)          # the neck chart: x range, z range (front projection)
def in_torso_chart(P, N):
    return (N[1] < -.30) & (P[2] > .452) & (np.abs(P[0]) < .19)
NPHI = 48
def build_bell():
    zs = list(np.linspace(Z_BOT, Z_SHIRT, 10)) + list(np.linspace(Z_SHIRT, .60, 14)) + [.612]
    zs = sorted(set(round(float(z), 5) for z in zs))
    rings = [(Z_BOT, Z_BOT, -.075), (Z_BOT, Z_BOT - .005, -.030), (Z_BOT, Z_BOT - .0065, -.013), (Z_BOT, Z_BOT - .0045, -.004)] + \
            [(z, z, 0.) for z in zs]
    phi = np.linspace(0, 2 * PI, NPHI, endpoint=False)
    V = []; N = []; rows = []; rz = []
    for ze, zp, dr in rings:
        P = bell_pt(phi, ze, True, dr); P[:, 2] = zp; n = bell_normal(phi, ze)
        if dr < -.005: n = unit(n * .3 + np.array([0, 0, -1.]))
        rows.append(list(range(len(V), len(V) + NPHI))); V += list(P); N += list(n); rz.append(zp if dr == 0 else Z_BOT - .01)
    bot = len(V); V.append(np.array([0, .0, Z_BOT + .02])); N.append(np.array([0, 0, -1.]))
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
        if fz < Z_SHIRT - 1e-4:
            uv.append([tuple(ramp_uv(HIPS_RAMP, val[i:i + 1])[0]) for i in idx])
        elif in_torso_chart(cP, cN):
            x0, x1, z0, z1 = TORSO_CH; uv.append([tuple(au('torso', (V[i, 0] - x0) / (x1 - x0), (V[i, 2] - z0) / (z1 - z0))) for i in idx])
        else:
            uv.append([tuple(ramp_uv('shirt', val[i:i + 1])[0]) for i in idx])
    return make_obj('body_bell', V, F, uv, 'body', N)
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

# ---------------------------------------------------------------- the apron's waist band: round the whole body (back view)
BAND_PROF = [(.372, .001), (.3735, .011), (.377, .019), (.384, .0245), (.398, .026), (.412, .0245), (.419, .019),
             (.4225, .011), (.424, .001)]
BAND_Z = (.372, .424)
def build_band():
    phi = np.linspace(0, 2 * PI, 56, endpoint=False); V = []; rows = []
    for z, t in BAND_PROF:
        r = bell_r(phi, z) + t; rows.append(list(range(len(V), len(V) + len(phi))))
        V += list(np.stack([r * np.sin(phi), -r * np.cos(phi), np.full(len(phi), z)], -1))
    F = []; n = len(phi)
    for k in range(len(rows) - 1):
        for i in range(n):
            a_, b_ = rows[k], rows[k + 1]; F.append((a_[i], a_[(i + 1) % n], b_[(i + 1) % n], b_[i]))
    V = np.array(V); ob = make_obj('apron_band', V, F, np.zeros((len(V), 2)), 'apron')
    mesh_normals_uv(ob, lambda Vv, Nn: ramp_uv('apron', sval(Nn, .20 * ao(body_occ, Vv, Nn, .04), hi=.16, lo=.24)))
    return ob
build_band()

# ---------------------------------------------------------------- the apron skirt, bib and pocket: thick cloth slabs riding the bell
AP_T = .012; AP_GAP = .004; AP_R0 = .22
def wrap_point(s, z, t, flare_top=None, flare_k=0.):
    phi = np.asarray(s, float) / AP_R0; z = np.asarray(z, float)
    r = bell_r(phi, z) + AP_GAP + t
    if flare_top is not None:
        rh = bell_r(phi, flare_top) + AP_GAP + t + flare_k * (flare_top - z); r = smax(r, rh, .02)
    return np.stack([r * np.sin(phi), -r * np.cos(phi), z * np.ones_like(r)], -1)
def x_to_s(x, z, pt):
    ss = np.linspace(0, .45, 450); out = []
    for xx, zz in zip(np.atleast_1d(x), np.atleast_1d(z)):
        X = pt(ss, np.full(len(ss), zz), AP_T)[:, 0]; out.append(np.sign(xx) * np.interp(abs(xx), X, ss))
    return np.array(out)
def rounded_panel_xz(hw_top, hw_bot, z_top, z_bot, rc_bot, rc_top=0., n_side=20, bow=0.):
    """a front-view outline: straight top (optionally rounded corners), sides from hw_top to hw_bot, rounded bottom corners"""
    def hw(z): return hw_top + (hw_bot - hw_top) * (z_top - z) / (z_top - z_bot)
    def zb(x): return z_bot + bow * (x / hw_bot) ** 2
    zs0 = z_top - rc_top
    side = [(hw(z), z) for z in np.linspace(zs0, z_bot + rc_bot, n_side)]
    xc = hw(z_bot + rc_bot) - rc_bot; zc = zb(xc) + rc_bot
    corner = [(xc + rc_bot * math.cos(a), zc + rc_bot * math.sin(a)) for a in np.linspace(0, -PI / 2, 9)[1:]]
    bottom = [(x, zb(x)) for x in np.linspace(xc, 0, 9)[1:]]
    right = side + corner + bottom
    if rc_top > 0:
        xt = hw(z_top) - rc_top
        tc = [(xt + rc_top * math.cos(a), zs0 + rc_top * math.sin(a)) for a in np.linspace(PI / 2, 0, 7)[:-1]]
        right = tc + right
    else: xt = hw(z_top)
    left = [(-x, z) for x, z in right[::-1]][1:]
    top = [(x, z_top) for x in np.linspace(-xt, xt, 16)[1:-1]]
    return np.array(right + left + top)
def build_panel(name, outline_xz, pt, t_out, t_in, group, ramp, step=.016, grid=.024, shade_extra=None):
    """a thick slab: outline (front-view x, z) mapped to the arc coordinate s, CDT inside, rounded rim"""
    S = x_to_s(outline_xz[:, 0], outline_xz[:, 1], pt); out = np.stack([S, outline_xz[:, 1]], -1)
    def area(p): return .5 * np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1])
    if area(out) < 0: out = out[::-1]
    out = resample(out, step)
    gx, gz = np.meshgrid(np.arange(-.45, .45, grid), np.arange(.10, .62, grid * .86))
    G = np.stack([gx.ravel(), gz.ravel()], -1); G[:, 0] += grid / 2 * (np.round((G[:, 1] - .10) / (grid * .86)) % 2)
    ok = in_poly(G, out)
    d = np.full(len(G), 9.)
    for i in range(len(out)):
        a = out[i]; b = out[(i + 1) % len(out)]; ab = b - a; t = np.clip(((G - a) @ ab) / (ab @ ab), 0, 1)
        d = np.minimum(d, np.linalg.norm(G - (a + t[:, None] * ab), axis=1))
    G = G[ok & (d > step * .6)]
    P2 = np.concatenate([out, G]); nO = len(out)
    res = delaunay_2d_cdt([Vector(p) for p in P2], [(i, (i + 1) % nO) for i in range(nO)], [], 0, 1e-9)
    vout = np.array([[v.x, v.y] for v in res[0]]); Fo = np.array([list(f) for f in res[2]])
    assert len(vout) == len(P2), name + ' CDT merged points'
    Fo = Fo[in_poly(vout[Fo].mean(1), out)]; n2 = len(vout)
    Pf = pt(vout[:, 0], vout[:, 1], t_out); Pb = pt(vout[:, 0], vout[:, 1], t_in)
    V = list(Pf) + list(Pb); F = [tuple(f) for f in Fo] + [tuple(n2 + f[::-1]) for f in Fo]
    L2 = vout[:nO]; tang = np.roll(L2, -1, 0) - np.roll(L2, 1, 0); m = unit(np.stack([tang[:, 1], -tang[:, 0]], -1))
    rows = [list(range(nO))]; Rr = 4; th = t_out - t_in
    for j in range(1, Rr):
        ph = PI * j / Rr; q = L2 + m * (th / 2 * .95 * math.sin(ph))
        rows.append(list(range(len(V), len(V) + nO))); V += list(pt(q[:, 0], q[:, 1], t_in + th / 2 * (1 + math.cos(ph))))
    rows.append(list(range(n2, n2 + nO)))
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(nO): F.append((a_[i], b_[i], b_[(i + 1) % nO], a_[(i + 1) % nO]))
    V = np.array(V); ob = make_obj(name, V, F, np.zeros((len(V), 2)), group)
    def shade(Vv, Nn):
        o = .22 * ao(bell_sdf_nolip, Vv, Nn, .03)
        if shade_extra is not None: o = o + shade_extra(Vv)
        return ramp_uv(ramp, sval(Nn, o, hi=.16, lo=.22))
    mesh_normals_uv(ob, shade)
    return ob, out
AP_TOP, AP_BOT = .410, .170
def skirt_pt(s, z, t): return wrap_point(s, z, t, AP_TOP, .12)
build_panel('apron_skirt', rounded_panel_xz(.175, .205, AP_TOP, AP_BOT, .048, bow=.008), skirt_pt, AP_T, 0., 'apron', 'apron',
            step=.020, grid=.032, shade_extra=lambda Vv: .25 * smooth(AP_TOP - .03, AP_TOP + .004, Vv[:, 2]))
BIB_TOP, BIB_BOT = .500, .405
def bib_pt(s, z, t): return wrap_point(s, z, t)
build_panel('apron_bib', rounded_panel_xz(.126, .150, BIB_TOP, BIB_BOT, .004, rc_top=.020), bib_pt, AP_T, 0., 'apron', 'apron',
            step=.014, grid=.024, shade_extra=lambda Vv: .20 * smooth(BIB_BOT + .03, BIB_BOT - .004, Vv[:, 2]))
POCKET = (.094, .232, .348, .026)          # half-width, bottom, top, corner radius (the sheet: 0.187 x 0.118 m)
def pocket_pt(s, z, t): return wrap_point(s, z, t + AP_T - .003, AP_TOP, .12)
build_panel('apron_pocket', rounded_panel_xz(POCKET[0], POCKET[0], POCKET[2], POCKET[1], POCKET[3], rc_top=.012), pocket_pt,
            .0085, 0., 'apron', 'apron', step=.013, grid=.024, shade_extra=lambda Vv: .10)

# ---------------------------------------------------------------- ribbons: the apron straps (and, layered, the bag strap)
def ribbon(name, ctrl, offs, width, thick, group, ramp, n=34, cen=(0, 0, .44), S_override=None, N_override=None):
    cen = np.asarray(cen, float)
    if S_override is None:
        ctrl = [np.asarray(c, float) for c in ctrl]
        C = np.array([catmull(ctrl, t) for t in np.linspace(0, 1, n)])
        off = np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(offs)), offs)
        d = unit(C - cen); S = ray_outer(bell_sdf_nolip, cen, d, t1=.45); Nn = grad(bell_sdf_nolip, S)
        S = S + Nn * (off + thick / 2)[:, None]
    else:
        S = S_override; Nn = N_override; n = len(S)
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
STRAP_W, STRAP_T = .050, .012
for s, tag in ((-1, 'R'), (1, 'L')):
    x0 = s * .094
    ctrl = [(x0, -.20, .488), (x0 * 1.02, -.18, .530), (x0 * 1.05, -.12, .574), (x0 * 1.05, -.03, .600), (x0 * 1.05, .06, .585),
            (x0 * 1.03, .12, .545), (x0, .15, .490), (x0, .155, .430), (x0, .155, .405)]
    offs = [.0175, .010, .004, .003, .003, .004, .004, .004, .003]
    ribbon('apron_strap.' + tag, ctrl, offs, STRAP_W, STRAP_T, 'apron', 'apron')

# ================================================================ SLEEVES (short T-shirt), FOREARMS (A-pose), LEGS + FEET
ARM_DEG = 50.
SLV_L = .105
joint_arms = {}; joint_legs = {}; sleeve_info = {}
SH0 = {s: np.array([s * .166, .000, .470]) for s in (-1, 1)}
def arm_frame(s):
    a = math.radians(ARM_DEG); d = unit(np.array([s * math.sin(a), -.10, -math.cos(a)]))
    e1 = unit(np.cross(d, [0, 0, 1.])); e2 = unit(np.cross(e1, d))
    if e2[2] < 0: e2 = -e2
    return d, e1, e2
def sleeve_ring(s, t, a, scale=1.):
    d, e1, e2 = arm_frame(s); C = SH0[s] + d * (-.050 + (SLV_L + .050) * t)
    rw = .071 + .006 * float(smooth(0, 1, t)); ru = .068 + .004 * t; rd = .070 + .010 * float(smooth(0, .9, t))
    ca, sa = np.cos(a), np.sin(a)
    up_part = np.where(sa >= 0, ru * sa, 0.)[:, None] * e2
    dn_part = np.where(sa < 0, rd * sa, 0.)[:, None] * e2
    return C + scale * (e1 * (rw * ca)[:, None] + up_part + dn_part), C
def build_sleeve(s, tag):
    d, e1, e2 = arm_frame(s); NA = 26; a = np.linspace(0, 2 * PI, NA, endpoint=False) + PI / NA
    ts = [0, .10, .22, .36, .50, .64, .78, .88, .95, 1.0]
    rows = []; V = []; RN = []
    for t in ts:
        P, C = sleeve_ring(s, t, a); rows.append(list(range(len(V), len(V) + NA))); V += list(P); RN.append('shirt')
    P1, C1 = sleeve_ring(s, 1.0, a)
    for dd, sc, nm in [(.007, .985, 'shirt'), (.012, .935, 'shirt'), (.012, .87, 'shirtin'), (.007, .82, 'shirtin')]:
        P = C1 + (P1 - C1) * sc + d * dd; rows.append(list(range(len(V), len(V) + NA))); V += list(P); RN.append(nm)
    for dd, rr in [(-.004, .058), (-.040, .052)]:
        P = C1 + d * dd + (np.outer(np.cos(a), e1) + np.outer(np.sin(a), e2)) * rr; rows.append(list(range(len(V), len(V) + NA)))
        V += list(P); RN.append('shirtin')
    c_in = len(V); V.append(C1 - d * .05); c_out = len(V); V.append(sleeve_ring(s, 0., a)[1] - d * .02)
    F = []; FR = []
    for k in range(len(rows) - 1):
        nm = 'shirtin' if RN[k + 1] == 'shirtin' else 'shirt'
        for i in range(NA):
            F.append((rows[k][i], rows[k][(i + 1) % NA], rows[k + 1][(i + 1) % NA], rows[k + 1][i])); FR.append(nm)
    for i in range(NA): F.append((rows[-1][i], rows[-1][(i + 1) % NA], c_in)); FR.append('shirtin')
    for i in range(NA): F.append((rows[0][(i + 1) % NA], rows[0][i], c_out)); FR.append('shirt')
    V = np.array(V); ob = make_obj('sleeve.' + tag, V, F, np.zeros((len(V), 2)), 'sleeve.' + tag)
    ramp_faces(ob, FR, lambda Vv, Nn: sval(Nn, .25 * ao(body_occ, Vv, Nn, .04), hi=.16, lo=.24), dim={'shirtin': .75})
    sleeve_info[tag] = {'root': [float(v) for v in sleeve_ring(s, 0., a[:1])[1]], 'cuff': [float(v) for v in C1]}
    return ob
ARM_REACH = .200
for s, tag in ((-1, 'R'), (1, 'L')):
    build_sleeve(s, tag)
    d, e1, e2 = arm_frame(s); sh = SH0[s]
    elbow = sh + d * .110; wrist = sh + d * .180
    pts_ = [sh + d * .030, sh + d * .110, sh + d * .165, sh + d * ARM_REACH]
    rad = lambda t: .050 + .011 * float(smooth(.60, 1., t))
    limb('arm.' + tag, pts_, rad, 'arm.' + tag, rings=14, sides=18, cap_rows=7, cap_len=1.05, occ_f=bell_sdf_nolip, squash=.94,
         occ_k=.20, start_cap=True)
    joint_arms[tag] = {'shoulder': [float(v) for v in sh], 'elbow': [float(v) for v in elbow], 'wrist': [float(v) for v in wrist],
                       'paw_tip': [float(v) for v in sh + d * (ARM_REACH + .061 * 1.05)]}
FOOT = dict(r=[.092, .128, .046], p=(2.6, 2.7, 2.0), pzlo=4.0, rzlo=.033)       # a domed bun (the sheet: 0.18 x 0.256 x 0.076)
LEG_X = .113; FOOT_X = .122
def foot_sdf_s(s):
    c = np.array([s * FOOT_X, -.020, .033])            # the sole on z = 0 (rzlo 0.033)
    def f(p):
        d = sell(p, c, FOOT['r'], FOOT['p'], FOOT['pzlo'], FOOT['rzlo'])
        for k in (-1, 1):            # two shallow toe grooves on the front of the foot
            g = ell(p, c + np.array([k * .031, -.145, .033]), [.0058, .022, .040])
            d = smax(d, -g, .006)
        return d
    return f, c
for s, tag in ((-1, 'R'), (1, 'L')):
    hip = np.array([s * LEG_X, .000, .235]); knee = np.array([s * LEG_X, -.004, .150]); ankle = np.array([s * FOOT_X, -.010, .060])
    leg_pts = [hip + np.array([0, 0, .03]), hip, knee, np.array([s * (LEG_X + .004), -.008, .082])]
    # the dark trouser leg: a wide soft tube, its cuff flaring a touch over the foot
    limb('leg.' + tag, leg_pts, lambda t: .103 + .004 * float(smooth(.75, 1, t)), 'leg.' + tag, rings=7, sides=18, cap_rows=2,
         cap_len=.35, occ_f=bell_sdf_nolip, occ_k=.30, ramp='trousers', squash=1.08)
    ff, fc = foot_sdf_s(s)
    def foot_shade(P, N, ff=ff, fc=fc):
        lat = (P[:, 0] - fc[0]) / .092; frontz = smooth(-.08, -.12, P[:, 1] - fc[1]) * smooth(.008, .022, P[:, 2]) * smooth(.072, .055, P[:, 2])
        groove = sum(np.exp(-((lat - k * .337) / .035) ** 2) for k in (-1, 1)) * frontz
        return sval(N, .22 * groove)
    sdf_ball('foot.' + tag, ff, fc + np.array([0, 0, .01]), 8, 'leg.' + tag, 'fur', shade=foot_shade, t1=.4)
    joint_legs[tag] = {'hip': [float(v) for v in hip], 'knee': [float(v) for v in knee], 'ankle': [float(v) for v in ankle],
                       'toe': [float(fc[0]), float(fc[1] - .13), .033]}

# ================================================================ THE TAIL: a big round puff, fur root, dark cap
TAIL_PTS = [np.array(p, float) for p in [(0, .075, .318), (0, .140, .312), (0, .205, .295), (0, .250, .266), (0, .272, .228)]]   # rig round: it curls back and down, so the dark cap sits on the outer tip, under the brown (back view), the reach ~0.38
def tail_r(t): return .074 + .046 * float(smooth(0, .55, t)) - .010 * float(smooth(.80, 1, t))
TAIL_BANDS = [(-9, .80, 'fur'), (.80, 9, 'tailtip')]     # rig round: the dark cap on the outer tip (from behind the brown covers the upper part)
def tail_ramp(t):
    for a, b, nm in TAIL_BANDS:
        if a <= t < b: return nm
    return 'tailtip'
TAIL_RT = sorted(set([round(v, 4) for v in np.linspace(0, 1, 21)] + [a for a, _, _ in TAIL_BANDS[1:]]))
tail_ob, TAIL_V = limb('tail', TAIL_PTS, tail_r, 'tail', sides=20, cap_rows=8, cap_len=.95, ring_t=TAIL_RT,
                       face_ramp=tail_ramp, occ_f=bell_sdf_nolip, occ_k=.25)

# ================================================================ THE SHOULDER BAG on his left hip, its strap from his right shoulder
from mathutils.bvhtree import BVHTree
BAG_PHI = math.radians(50.); BAG_Z = .290
_bs = bell_pt(np.array([BAG_PHI]), np.array([BAG_Z]))[0]; _bn = bell_normal(np.array([BAG_PHI]), np.array([BAG_Z]))[0]
BAG_N = unit(np.array([_bn[0], _bn[1], 0.]))                 # the bag's face normal (outward-front), horizontal
BAG_W = unit(np.cross([0, 0, 1.], BAG_N))                    # along the face
if BAG_W[1] < 0: BAG_W = -BAG_W                              # toward his back
BAG_UP = np.array([0, 0, 1.])
BAG_HALF = np.array([.110, .047, .097])                     # half width (along BAG_W), half depth (BAG_N), half height
BAG_C = _bs + BAG_N * (BAG_HALF[1] + AP_T + AP_GAP + .004); BAG_C[2] = BAG_Z
BAG_R = np.stack([BAG_W, BAG_N, BAG_UP], -1)                  # columns: local (w, n, up) axes in world
BAG_BEND_R = .26                                             # the bag curves round the hip (its ends follow the body)
def bag_local(p):
    q = (np.asarray(p, float) - BAG_C) @ BAG_R
    return np.concatenate([q[..., :1], q[..., 1:2] + q[..., :1] ** 2 / (2 * BAG_BEND_R), q[..., 2:]], -1)
def bag_world(w, n, z): return BAG_C + BAG_W * w + BAG_N * (n - w * w / (2 * BAG_BEND_R)) + BAG_UP * z
def bag_sdf(p): return sell(bag_local(p), [0, 0, 0], BAG_HALF, (3.4, 2.6, 3.4))
FLAP_C = np.array([0, .006, .022]); FLAP_HALF = np.array([.116, .052, .086])
def flap_sdf(p):
    # a closed lid volume a little larger than the box over its top 3/4: its lower edge is the crisp line where it meets the box
    return sell(bag_local(p), FLAP_C, FLAP_HALF, (3.6, 2.4, 3.6))
def bag_shade(P, N): return sval(N, .18 * ao(lambda q: bell_sdf(q) - .02, P, N, .04), hi=.20, lo=.24)
sdf_ball('shoulder_bag', bag_sdf, BAG_C, 7 if FAST else 8, 'bag', 'bag', shade=bag_shade, t1=.2)
flap_ob, FLAP_P, FLAP_N = sdf_ball('bag_flap', flap_sdf, BAG_C + BAG_N * .006 + BAG_UP * .022, 7 if FAST else 8, 'bag', 'bag',
                                   shade=bag_shade, t1=.2)
def flap_uv(Vv, Nn):
    # one planar projection along the face normal for the whole flap (no chart / ramp seams); the chart is plain bag colour
    # round the emblem, so the stretched side texels read as the bag's colour
    q = bag_local(Vv)
    return au('flap', .5 + q[:, 0] / (2.4 * FLAP_HALF[0]), .5 + (q[:, 2] - FLAP_C[2]) / (2.4 * FLAP_HALF[0]))
mesh_normals_uv(flap_ob, flap_uv)
LOG['bag'] = {'centre_m': [round(float(v), 4) for v in BAG_C], 'face_yaw_deg': round(math.degrees(math.atan2(BAG_N[0], -BAG_N[1])), 1)}

def bvh_of(groups):
    Vs = []; Fs = []; off = 0
    for g in groups:
        for ob in parts.get(g, []):
            me = ob.data; v = np.array([list(x.co) for x in me.vertices]); Vs.append(v)
            Fs += [[i + off for i in p.vertices] for p in me.polygons]; off += len(v)
    return BVHTree.FromPolygons([tuple(x) for x in np.concatenate(Vs)], Fs)
LAYERS = bvh_of(['body', 'apron'])
def layered(S, Nn, thick, extra=.003):
    """lift ribbon centre points so they ride over the outermost layer (bell, apron, band, straps) along the normal"""
    out = S.copy()
    for k in range(len(S)):
        o = Vector(S[k] + Nn[k] * .20); hit = LAYERS.ray_cast(o, Vector(-Nn[k]), .40)
        if hit[0] is not None:
            h = np.array(hit[0]); out[k] = h + Nn[k] * (thick / 2 + extra)
    lift = ((out - S) * Nn).sum(1)
    lift = np.maximum.reduce([np.roll(lift, k) for k in range(-3, 4)])        # no dips between neighbours
    lift = np.convolve(np.pad(lift, 4, mode='edge'), np.ones(9) / 9, mode='valid')
    return S + Nn * lift[:, None]
BSTRAP_W, BSTRAP_T = .042, .013
_bag_top_f = bag_world(-(BAG_HALF[0] - .022), 0., BAG_HALF[2] - .012)
_bag_top_b = bag_world(BAG_HALF[0] - .022, 0., BAG_HALF[2] - .012)
BSTRAP_CTRL = [(.065, -.19, .395), (.010, -.185, .440), (-.045, -.175, .490), (-.090, -.150, .540), (-.115, -.085, .580),
               (-.122, .000, .598), (-.112, .080, .575), (-.070, .135, .525), (.010, .158, .460), (.090, .160, .405),
               (.160, .140, .370)]
def bag_strap():
    n = 50; cen = np.array([0, 0, .44])
    C = np.array([catmull([np.asarray(c, float) for c in BSTRAP_CTRL], t) for t in np.linspace(0, 1, n)])
    d = unit(C - cen); S = ray_outer(bell_sdf_nolip, cen, d, t1=.45); Nn = grad(bell_sdf_nolip, S)
    S = layered(S + Nn * .001, Nn, BSTRAP_T, .004)
    # the ends leave the body for the bag's top ends
    head_ = [_bag_top_f + (S[0] - _bag_top_f) * w for w in (0., .35, .7)]
    tail_ = [S[-1] + (_bag_top_b - S[-1]) * w for w in (.3, .65, 1.)]
    S = np.concatenate([np.array(head_), S, np.array(tail_)])
    Nh = [unit(Nn[0] * .5 + BAG_UP * .5)] * 3; Nt = [unit(Nn[-1] * .5 + BAG_UP * .5)] * 3
    Nn = np.concatenate([np.array(Nh), Nn, np.array(Nt)])
    return ribbon('bag_strap', None, None, BSTRAP_W, BSTRAP_T, 'strap', 'bag', S_override=S, N_override=Nn)
BSTRAP_PATH = bag_strap()

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
def paint_face(U, V):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = radial_hit(d); n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    fr = smooth(HY + .02, HY - .08, y)
    C = ramp_colour('fur', head_shade(P, n))
    occ = head_occ(P, n)
    near_face = (np.abs(x) < .5 * W) & (z < CHIN + .56 * W) & (z > CHIN - .04 * W) & (fr > 0)
    # the tanuki mask: one soft rounded band round both eyes and over the bridge (a 2-3 mm blended border)
    a = np.zeros(len(x)); a[near_face] = poly_fill(x[near_face], z[near_face], MASK_POLY, .0020) * fr[near_face]
    if PAINT_OPTS.get('maskall'): a = np.ones(len(x))
    C = mix(C, ramp_colour('dark', sval(n, .5 * occ, hi=.16, lo=.20)), a)
    # the cream muzzle: a big soft bell from over the nose to the chin
    a = np.zeros(len(x)); a[near_face] = poly_fill(x[near_face], z[near_face], MUZ_POLY, .0026) * fr[near_face]
    rim = np.zeros(len(x)); rim[near_face] = 1 - poly_fill(x[near_face], z[near_face], MUZ_POLY, .030 * W)
    rim *= smooth(CHIN + .16 * W, CHIN + .06 * W, z)
    C = mix(C, ramp_colour('cream', sval(n, .07 * rim, hi=.12, lo=.18)), a * PAINT_OPTS['muzzle'])
    # blush ovals, over the mask's lower edge
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .92 * (1 - smooth(.86, 1.05, r)) * fr * PAINT_OPTS['blush'])
    # brows: soft arcs, the peak a little inside the middle, the outer end lower, tapering to rounded points
    t = np.linspace(-1, 1, 15)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * BROW_L * t, BROW_Z + .016 * W * (1 - t * t) - .006 * W - .014 * W * t], -1)
        half = .0105 * W * np.maximum(0, 1 - t * t) ** .60 + .0018 * W
        box = (np.abs(x - s * BROW_X) < .10 * W) & (np.abs(z - BROW_Z) < .06 * W) & (fr > 0)
        a = np.zeros(len(x)); a[box] = stroke(x[box], z[box], Pb, half, .0026 * W)
        C = mix(C, rgb('brow'), .96 * a)
    # the smile: one soft arc (the sheet: 0.15 W wide, its ends at z 0.200, its bottom at 0.167), no philtrum
    xs_ = np.linspace(-.074, .074, 25)
    Pm = np.stack([xs_ * W, CHIN + (.167 + .033 * (xs_ / .072) ** 2) * W], -1)
    half = .0064 * W * (1 - .45 * smooth(.70, 1.0, np.abs(xs_) / .074))
    ib = (np.abs(x) < .11 * W) & (np.abs(z - MZM) < .06 * W) & (fr > 0)
    a = np.zeros(len(x)); a[ib] = stroke(x[ib], z[ib], Pm, half, .0024 * W); C = mix(C, rgb('mouth'), .96 * a)
    return C.reshape(sh + (3,))

def paint_eye(U, V, s):
    """X, Z in eye-opening units (X along world x). The sheet: the iris 0.73 of the opening, tucked toward the nose (white
    crescent on the outer side), a tall pupil 0.64 x 0.8 of the iris, one big catchlight toward the nose (mirrored)"""
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .27; iz = .0; irx = .73; irz = .98
    C = mix(rgb('sclera'), rgb('#ECDFD4'), .45 * smooth(.35, .95, Z))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#6A3E18'), rgb('iris'), smooth(-.05, -.75, ez))                 # deep brown on top, amber below
    I = mix(I, rgb('#E6A452'), .55 * smooth(-.50, -.95, ez) * smooth(.95, .55, np.abs(ex)))
    I = mix(I, rgb('#4A2A10'), smooth(.80, 1.0, r) * .60)
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    px_ = -s * .48; pz = .09; R = np.sqrt(((X - px_) / .466) ** 2 + ((Z - pz) / .78) ** 2)
    C = mix(C, rgb('pupil'), 1 - smooth(.975, 1.025, R))
    big = np.sqrt(((X - (-s * .46)) / .20) ** 2 + ((Z - .435) / .19) ** 2)
    C = mix(C, rgb('#FFFAF4'), 1 - smooth(.90, 1.08, big))
    C = mix(C, rgb('lash'), smooth(.945, .995, sr) * (.45 + .55 * smooth(-.2, .5, Z)))  # the lid contact rim
    return C

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
        a = (U - .5) / .48; b = (V - .5) / .48; r = np.sqrt(a * a + b * b)      # a > 0: outward
        sh_ = clamp(.5 + .16 * b - .10 * a)
        C = ramp_colour('dark', sh_ - .06 * smooth(.66, .44, r))
        ri = np.sqrt(((a - .14) / .44) ** 2 + ((b - .08) / .47) ** 2)            # the pink inner, set a little out and up (the sheet)
        Ci = ramp_colour('pink', clamp(.46 + .20 * b - .14 * smooth(.40, 1.0, ri)))
        return mix(C, Ci, 1 - smooth(.95, 1.03, ri))
    if chart == 'nose':
        a = (U - .5) * .13 * W; b = (V - .5) * .13 * W
        C = ramp_colour('nose', .45 + .10 * smooth(-.02, .02, b))
        hl = np.exp(-(((a + .012 * W) / (.013 * W)) ** 2 + ((b - .010 * W) / (.007 * W)) ** 2))
        return mix(C, rgb('#6E5A52'), .55 * hl)
    if chart == 'torso':
        x0, x1, z0, z1 = TORSO_CH; x_ = x0 + U * (x1 - x0); z_ = z0 + V * (z1 - z0)
        y_ = front_hit(x_.ravel(), z_.ravel(), bell_sdf, -.5, .2).reshape(U.shape); y_ = np.where(np.isfinite(y_), y_, -.1)
        P = np.stack([x_, y_, z_], -1).reshape(-1, 3); N = grad(bell_sdf, P)
        C = ramp_colour('shirt', torso_shade(P, N)).reshape(U.shape + (3,))
        # the cream chest in the shirt's round U-neck (the sheet: 0.15 m across, its bottom at z 0.523)
        zu = .523 + .040 * (np.abs(x_) / .074) ** 2.2
        v = smooth(-.002, .002, z_ - zu)
        Cf = ramp_colour('cream', sval(N, .40 * ao(body_occ, P, N, .05), hi=.12, lo=.22)).reshape(U.shape + (3,))
        return mix(C, Cf, v)
    if chart == 'leaf':
        u_ = (U - .5) * .64 * W; v_ = (V - .5) * .64 * W; Q = np.stack([u_, v_], -1).reshape(-1, 2)
        dd = leaf_sdf2(Q).reshape(U.shape)
        val = .52 + .10 * (v_ / (.3 * W)) + .06 * smooth(-.004, -.03, dd)      # lighter toward the back-up, the rim a touch darker
        C = ramp_colour('leaf', clamp(val))
        # the veins: soft grooves from the junction toward each lobe tip, a light edge on the upper side
        vein = np.zeros(U.shape); lite = np.zeros(U.shape)
        for (tx, ty), w0, w1 in LEAF_LOBES:
            T = np.array([tx, ty]) * W * .86; Pv = np.array([[0, 0], T])
            hw_ = np.array([.0042, .0016]) * W
            vein = np.maximum(vein, stroke(u_.ravel(), v_.ravel(), Pv, hw_, .0016 * W).reshape(U.shape))
            Pl = Pv + np.array([0, .006 * W])
            lite = np.maximum(lite, stroke(u_.ravel(), v_.ravel(), Pl, hw_ * .7, .0018 * W).reshape(U.shape))
        C = mix(C, rgb('leaflight') * 1.04, .40 * lite * (1 - vein))
        C = mix(C, rgb('leafdark') * .92, .65 * vein)
        return C
    if chart == 'flap':
        a = (U - .5) * 2.4 * FLAP_HALF[0]; b = (V - .5) * 2.4 * FLAP_HALF[0]          # metres on the flap face (b from the flap centre)
        C = ramp_colour('bag', clamp(.56 + 1.2 * b))
        # the chestnut emblem (the sheet: a dark rounded drop with a little point on top, ~6 cm)
        bc = b + .018
        d1 = np.sqrt(a * a + (bc + .004) ** 2) - .026
        t_ = clamp((bc + .004) / .040); d2 = np.sqrt(a * a + (bc + .004 - t_ * .040) ** 2) - (.026 * (1 - t_) ** 1.2 + .003)
        de = smin(d1, d2, .006)
        C = mix(C, rgb('emblem'), 1 - smooth(-.0012, .0012, de))
        hl = np.exp(-(((a + .010) / .006) ** 2 + ((bc + .002) / .008) ** 2))
        return mix(C, rgb('#7A5440'), .55 * hl * (de < 0))
    raise KeyError(chart)

atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [168, 132, 110, 255]
for name, (x0, y0, w, h) in CHARTS.items():
    U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
    if name in ('face', 'torso', 'leaf'):
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
atlas_path = os.path.join(ROOT, 'scratch' if FAST else '', 'ak-benji-toy_rig_atlas.png' if RIG else 'ak-benji-toy_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Benji_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Benji_toy_atlas'); MAT.use_nodes = True
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
        'head_width_W_at_z': {str(z): width_at(z) for z in (.015, .045, .06, .104, .134, .164, .193, .223, .253, .283, .313,
                                                              .342, .372, .402, .432, .461, .491, .55, .60, .65)},
        'head_top_W_at_x': {str(xw): top_at_x(xw) for xw in (0., .105, .20, .30)},
        'profile_front_W_at_z': {str(z): prof_front(z) for z in (.037, .086, .135, .184, .209, .258, .307, .357, .406, .455, .504, .553, .602)},
        'profile_back_W_at_z': {str(z): back_at(z) for z in (.037, .086, .135, .184, .233, .283, .332, .381, .43, .48, .529, .578, .602)},
        'nose_tip_y_m': round(float(nose_tip[:, 1].min()), 4), 'nose_tip_W_ahead': round(float((HY - nose_tip[:, 1].min()) / W), 3),
        'eye_opening_W': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'eye_centre_W': [round(EX / W, 3), round((EZ - CHIN) / W, 3)],
        'ear_extent_W': {'x_outer': round(float(EV[1][:, 0].max() / W), 3), 'top_z': round(float((EV[1][:, 2].max() - CHIN) / W), 3),
                         'top_m': round(float(EV[1][:, 2].max()), 3)},
        'nose_W': [round(float(np.ptp(NOSE_OUT[:, 0])) / W, 3), round(float(np.ptp(NOSE_OUT[:, 1])) / W, 3)],
        'bell_extent_m': ext(parts['body']), 'apron_extent_m': ext(parts['apron']), 'leaf_extent_m': ext(parts['leaf']),
        'bag_extent_m': ext(parts['bag']), 'strap_extent_m': ext(parts['strap']), 'sleeve_L_extent_m': ext(parts['sleeve.L']),
        'lash_L_extent_m': ext(parts['lash.L']),
        'arm_span_m': round(float(np.ptp(all_verts(parts['arm.L'] + parts['arm.R'])[:, 0])), 3),
        'arm_L_extent_m': ext(parts['arm.L']), 'leg_L_extent_m': ext(parts['leg.L']),
        'tail_extent_m': {k: [round(float(TAIL_V[:, i].min()), 3), round(float(TAIL_V[:, i].max()), 3)] for i, k in enumerate('xyz')},
        'leaf_min_head_clearance_m': round(float(head_sdf(all_verts(parts['leaf'])).min()), 4),
        'bag_strap_min_body_clearance_m': round(float(bell_sdf(BSTRAP_PATH).min()), 4)}
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
    ob = bpy.context.object; ob.name = 'Benji_' + group.replace('.', '_')
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
           'leg.L': joint_legs['L']['hip'], 'leg.R': joint_legs['R']['hip'], 'lash.L': eye_centers['L'], 'lash.R': eye_centers['R'],
           'leaf': tuple(LEAF_C), 'bag': tuple(BAG_C + BAG_UP * BAG_HALF[2]), 'strap': (0, 0, .45),
           'apron': (0, 0, AP_TOP), 'body': (0, 0, .30)}.get(group, (0, 0, 0))
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
          'hips': [0, .000, .250], 'spine': [0, .000, .360], 'chest': [0, .000, .470], 'neck': [0, .015, .585],
          'head': [float(v) for v in O], 'jaw_pivot': [0, float(HY - .10 * W), float(CHIN + .10 * W)],
          'eyes': eye_centers, 'ears': ears_j, 'arms': joint_arms, 'sleeves': sleeve_info, 'legs': joint_legs, 'tail': tail_chain,
          'lashes': lash_info, 'leaf': {'centre': [float(v) for v in LEAF_C], 'stem_tip': [float(v) for v in STEM_PTS[-1]]},
          'bag': {'pivot': [float(v) for v in BAG_C + BAG_UP * BAG_HALF[2]], 'centre': [float(v) for v in BAG_C],
                  'strap_front_end': [float(v) for v in _bag_top_f], 'strap_back_end': [float(v) for v in _bag_top_b]},
          'apron_top': [0, -.18, AP_TOP], 'apron_hem': [0, -.22, AP_BOT], 'apron_band_z': list(BAND_Z), 'shirt_hem_z': Z_SHIRT,
          'hips_hem_z': Z_BOT,
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth SDF ball (cranium + cheek mass + jaw + muzzle displacement + trim), radially projected, analytic normals.',
                    'Eyelid holes ringed by 5 loops each, rim rolled in behind separate lens eyeballs; 3 loops round the mouth.',
                    'Separate pieces: eyes, lash rolls (origin at the eye centre, for the upper lids), ears, the leaf (a rigid head follower),',
                    'the tail (bend rings), sleeves (rings along the upper arm, open cuff), forearms, trouser legs + feet,',
                    'the shirt+hips bell (rings every 2 cm, the shirt hem colour border on a loop under the apron band), the apron',
                    '(band, bib, skirt hanging from the band, pocket, straps), the bag (box + flap, pivot at its top) and its strap (Benji_strap).']}
if RIG:
    pass
elif not FAST:
    with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-fast.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not FAST and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'ak-benji-toy.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG: bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('BENJI_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
