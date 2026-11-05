"""Okami Fuku, the innkeeper of the Sasanoha Inn (Toybox zone villager, VL-2), phase-1 model. Blender 4.3, no addons.
Deterministic.

    blender --background --factory-startup --python build_tk-fuku-toy.py [-- --fast]

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/tk-fuku-toy.glb (--fast: no toon refinement, writes scratch/tk-fuku-fast.glb instead).

Technique (the Tanu / Kuma / Rosie toy-line machinery, measure.md has the sheet's numbers):
- The head is ONE smooth implicit ball (domed cranium + chubby cheek mass + jaw, smooth-unioned, a gentle muzzle
  displacement and a soft trim; fitted to the sheet's front widths and side profile by scratch/fit_head.py). Its skin is the
  field's zero surface reached by radial projection (CDT in a stereographic domain, edge loops round both eyelid holes
  and the mouth), so every vertex carries the field's analytic normal and the face stays convex. Flush lens eyeballs.
- The tanuki mask, the cream muzzle, brows, lashes, mouth and blush are painted in a face chart from 3D positions (front
  projection = the sheet's front view), with clean anti-aliased borders.
- The kimono and the skirt are ONE lathe-like bell (a superellipse section per height, monotone-cubic profile), its colour
  border (coral kimono / plum skirt) on an edge loop, with a rolled kimono hem lip. The obi is a thick band riding on the
  bell with a centre cord groove and a flat rounded cushion bow at the back; the cream collar is a rounded ribbon
  projected onto the bell (left panel over right); the apron is a thick cloth slab wrapping the front of the bell below
  the obi and hanging free toward the knees (rounded rim, rounded bottom corners).
- The kimono sleeves are lofted hanging-pocket tubes round the upper arm with a rolled open cuff; the forearms with the
  mitten paws, the legs and the feet are tubes / SDF blobs; the big round tail is a fat tube with bend loops whose colour
  blocks (fur root, dark tip) sit exactly on edge loops.
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
MODEL = 'D:/projects/chewy-life-3d/public/models/tk-fuku-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'tk-fuku-fast.glb') if FAST else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(5)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
LOG = {}

# ---------------------------------------------------------------- the sheet's measures (measure.md)
# turnaround: ground y 495.5, ear tops y 70 -> 1.08 m (394.0 px / m); front-view head 244 px at the cheeks -> W 0.619 m;
# chin y 257 -> 0.605 m. Head close-up: W = 336 px, chin y 785, features centred on x 191.
W = .619; CHIN = .605; HY = .025            # head width at the cheeks, chin height, head centre y (side view)
SW = W / .44                                # Rosie's metric detail sizes (authored at W 0.44) scale by SW

PAL = {'fur': '#A8846E', 'furdark': '#93705C', 'furlight': '#B58F77',
       'dark': '#4A3A34', 'darkdark': '#3B2E29', 'darklight': '#5A4740',
       'cream': '#F2E2D2', 'creamdark': '#E0CCBA', 'creamlight': '#F9EEE3',
       'kimono': '#D8705E', 'kimonodark': '#C05C4C', 'kimonolight': '#E4836F',
       'skirt': '#6A3A3A', 'skirtdark': '#5A2F30', 'skirtlight': '#7A4645',
       'obi': '#F4D27A', 'obidark': '#E2B95E', 'obilight': '#F8DE94',
       'apron': '#FFF6E8', 'aprondark': '#EEDFCB', 'apronlight': '#FFF8EE',
       'pink': '#D9908A', 'pinkdark': '#C67D77', 'pinklight': '#E2A29B',
       'iris': '#B8803A', 'pupil': '#261C19', 'nose': '#302622', 'sclera': '#FFF8EF', 'blush': '#E2948E',
       'lash': '#221815', 'brow': '#45352F', 'mouth': '#302622'}
CHARTS = {'face': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'ear': (1280, 896, 256, 256), 'nose': (1536, 896, 256, 256),
          'torso': (0, 0, 768, 512)}
if RIG:   # phase-2 charts in unused atlas space (the approved paint is untouched)
    CHARTS.update({'lidU': (1536, 0, 512, 256), 'lidD': (1536, 256, 512, 192), 'cavity': (1536, 448, 128, 128), 'tongue': (1664, 448, 128, 128)})
# band: the upper lash line; ride: (rig) the part of it the moving upper lid carries is left off the skin (the lid's lash stripe
# lies on it at rest, so the rest look is unchanged); maskall: (rig lids) the mask everywhere
PAINT_OPTS = {'band': True, 'blush': True, 'muzzle': True, 'ride': RIG and os.environ.get('FUKU_RIDE', '0') == '1'}
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'dark': ('darkdark', 'dark', 'darklight'),
         'cream': ('creamdark', 'cream', 'creamlight'), 'kimono': ('kimonodark', 'kimono', 'kimonolight'),
         'kimonoin': ('#8E4236', '#A44E40', '#B85A4A'),
         'skirt': ('skirtdark', 'skirt', 'skirtlight'), 'obi': ('obidark', 'obi', 'obilight'),
         'obicord': ('#C99A44', '#D6A852', '#E2B862'), 'apron': ('aprondark', 'apron', 'apronlight'),
         'nose': ('#1E1714', 'nose', '#4A3C36'), 'eyedark': ('#1A1210', '#241A16', '#3E302A'),
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
# fitted by scratch/fit_head.py to the sheet's front widths (1.00 W at z 0.22, 0.91 at 0.37, 0.845 at 0.43, 0.786 at 0.49),
# the side profile (front 0.40 W at the eyes, the muzzle 0.48 W, back 0.406 W) and the crown (0.693 W)
CR = ([0, .000, 0.407], [0.3894, 0.3405, 0.254], (2.4958, 2.0, 2.1101))    # domed cranium
CK = ([0, -0.01, 0.1811], [0.5094, 0.4181, 0.2125], (3.2134, 2.1, 2.4297))   # wide, chubby cheek mass
K_CK = 0.1889
# the muzzle: a smooth displacement of the ball (no union crease), zero slope at its edge, its lower half fading into the chin
MZ = ([0, -0.36, 0.150], [0.200, 0.130, 0.125])
MZ_A = 0.068                                 # round 1: raised so the muzzle reads as a bump (sheet 3/4, side)
# the jaw: a soft volume smooth-unioned low in front (the profile below the nose, 0.43-0.48 W ahead of the centre)
JW = ([0, -0.1844, 0.1178], [0.1856, 0.2075, 0.1199]); K_JW = 0.0622
# a soft ellipsoid trim narrows the upper head (Fuku's head is pear-shaped: 0.845 W at z 0.43)
TR = ([0, -0.0003, 0.1933], [0.501, 0.4846, 0.4923]); K_TR = 0.0488

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
EX = .200 * W; EZ = CHIN + .317 * W; EHW = .0965 * W; EHH = .079 * W; EN = 2.15
def eye_unit(psi):
    return spow(np.cos(psi), 2 / EN), spow(np.sin(psi), 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
NOSE_Z = CHIN + .231 * W; NOSE_TOP = CHIN + .265 * W; NOSE_BOT = CHIN + .211 * W   # (the button's upward push puts its centre at 0.238)
MZM = CHIN + .170 * W                                                       # the mouth's centre line
BROW_X = .183 * W; BROW_Z = CHIN + .540 * W; BROW_L = .055 * W
BLUSH = (.307 * W, CHIN + .192 * W, .055 * W, .035 * W)
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
# the tanuki mask (W, z above the chin), measured per column on the sheet (measure/m5.py); its lower edge under the blush
# (x 0.25-0.36) carried on smoothly; it meets the muzzle's top over the nose bridge
MASK_R = [(0, .418), (.030, .424), (.060, .441), (.089, .464), (.119, .485), (.149, .497), (.179, .503), (.208, .503),
          (.238, .494), (.268, .481), (.298, .460), (.327, .432), (.350, .400), (.368, .368), (.382, .335), (.389, .305),
          (.386, .280), (.374, .262), (.355, .250), (.330, .238), (.300, .230), (.268, .222), (.238, .212), (.208, .212),
          (.179, .218), (.149, .229), (.119, .248), (.089, .264), (.060, .273), (.030, .279), (0, .281)]
MASK_POLY = chaikin(mirror_outline(MASK_R), 2) * W + np.array([0, CHIN])
# the cream muzzle: a broad soft oval, flatter on top (0.34 W wide at z 0.13-0.18, top 0.277, bottom 0.051)
# rig round (director): the lower half is a round elliptical arc (a soft bean following the jaw), not a flat-bottomed box
_MZ_LOW = [(.169 * math.sqrt(max(0., 1 - ((.172 - z) / .121) ** 2)), z) for z in np.linspace(.170, .051, 12)]
MUZ_R = [(0, .279), (.045, .277), (.090, .272), (.120, .263), (.143, .251), (.158, .233), (.166, .210), (.169, .185)] +         [(round(x, 4), round(float(z), 4)) for x, z in _MZ_LOW[1:-1]] + [(0, .051)]
MUZ_POLY = chaikin(mirror_outline(MUZ_R), 2) * W + np.array([0, CHIN])

# ---------------------------------------------------------------- the fur shade (shared by the face chart and the ramps)
EAR_C = {s: np.array([s * .283 * W, HY + .010, CHIN + .608 * W]) for s in (-1, 1)}   # on the head's top corners
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
for k, (hx, hz) in enumerate([(.081, .020), (.094, .027), (.106, .034)]):
    a = np.linspace(0, 2 * PI, 40, endpoint=False)
    add_loop(to_dom(surf_dir(hx * W * spow(np.cos(a), .8), MZM - .002 * W + hz * W * np.sin(a))), 'mouth_%d' % k)
NB = 64; AB = math.radians(150)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
def fib(n):
    ii = np.arange(n) + .5; phi = np.arccos(1 - 2 * ii / n); th = PI * (1 + 5 ** .5) * ii
    return np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
NF = 1500 if FAST else 2900
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

# ================================================================ NOSE: a glossy rounded-triangle button on the muzzle
def resample(poly, step):
    seg = np.linalg.norm(np.roll(poly, -1, 0) - poly, axis=1); L = np.concatenate([[0], np.cumsum(seg)])
    n = max(8, int(round(L[-1] / step))); t = np.linspace(0, L[-1], n, endpoint=False)
    P = np.concatenate([poly, poly[:1]]); return np.stack([np.interp(t, L, P[:, 0]), np.interp(t, L, P[:, 1])], -1)
def _nose_outline(n=48):
    # a soft inverted triangle: broad rounded top, the sides tapering to a round point (0.086 x 0.054 W)
    t = np.linspace(0, 2 * PI, n, endpoint=False); u = np.cos(t); v = np.sin(t)
    y = .0280 * W * spow(v, .85); taper = (.30 + .70 * ((v + 1) / 2) ** .85)
    x = .058 * W * spow(u, .80) * taper
    return np.stack([x, y + .002 * W], -1)
NOSE_OUT = _nose_outline()
NOSE_H = .028                                                   # the button stands 28 mm proud
def build_nose():
    rows = []; V = []; UV = []
    rings = [1.0, .985, .94, .85, .70, .50, .27]
    prof = [-.003, .010, .0175, .0228, .0257, .0273, .028]
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
# measured on the turnaround (measure.md): the skirt hem 0.66 m wide at z 0.10 (-0.26 / +0.28 deep), the coral kimono
# flaring from the obi (0.41 wide) to its hem at z 0.24 (0.63 wide), the chest under the sleeves, the neck in the head
BELL = [(.100, .329, .262, .277), (.140, .326, .258, .262), (.190, .320, .252, .244), (.238, .314, .246, .226),
        (.262, .314, .246, .214), (.300, .290, .240, .204), (.340, .257, .228, .193), (.362, .234, .217, .183),
        (.380, .212, .207, .172), (.400, .205, .205, .170), (.440, .205, .204, .170), (.465, .207, .200, .171),
        (.500, .212, .190, .173), (.530, .214, .180, .170), (.560, .208, .163, .160), (.585, .186, .142, .142),
        (.605, .150, .120, .120), (.625, .104, .092, .092), (.645, .030, .030, .030)]
BZ, BA, BF, BB = [np.array(c, float) for c in zip(*BELL)]
Z_BOT, Z_TOP = float(BZ[0]), float(BZ[-1])
Z_HEM = .238                 # the kimono's hem: plum skirt below, coral kimono above (an edge loop)
LIP = .011                   # the kimono hem's rolled lip (faded out under the apron)
LIPZ = (np.array([0, .0005, .003, .008, .016, .024, .032]), np.array([0, .55, .88, 1., .85, .35, 0]))
def bell_n(z): return 2.3 + .2 * smooth(Z_HEM - .01, Z_HEM + .03, z)
def lip_z(z): return np.interp(np.asarray(z, float) - Z_HEM, *LIPZ, left=0, right=0)
def lip_phi(phi): return smooth(.95, 1.25, np.abs(np.arctan2(np.sin(phi), np.cos(phi))))
def bell_r(phi, z, lip=True):
    z = np.asarray(z, float); phi = np.asarray(phi, float)
    a = pchip(BZ, BA, z); bf = pchip(BZ, BF, z); bb = pchip(BZ, BB, z); n = bell_n(z)
    c = np.cos(phi); s = np.sin(phi); b = np.where(c > 0, bf, bb)
    r = 1 / ((np.abs(s) / a) ** n + (np.abs(c) / b) ** n + 1e-12) ** (1 / n)
    return r + LIP * lip_z(z) * lip_phi(phi) if lip else r
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
TORSO_CH = (-.24, .24, .44, .645)          # the collar-V chart: x range, z range (front projection)
def in_torso_chart(P, N):
    return (N[1] < -.30) & (P[2] > .452) & (np.abs(P[0]) < .205)
NPHI = 56
def build_bell():
    # ring list: (z where the section is evaluated, z placed, radial offset); the hem roll and the top pole are extra
    zs = list(np.linspace(.100, Z_HEM, 8)) + [Z_HEM + o for o in LIPZ[0][1:]] + list(np.linspace(.282, .380, 6)) + \
         list(np.linspace(.392, .62, 13)) + [.634]
    zs = sorted(set(round(float(z), 5) for z in zs))
    rings = [(.100, .100, -.060), (.100, .095, -.026), (.100, .0935, -.012), (.100, .0955, -.004)] + [(z, z, 0.) for z in zs]
    phi = np.linspace(0, 2 * PI, NPHI, endpoint=False)
    V = []; N = []; rows = []; rz = []
    for ze, zp, dr in rings:
        P = bell_pt(phi, ze, True, dr); P[:, 2] = zp; n = bell_normal(phi, ze)
        if dr < -.005: n = unit(n * .3 + np.array([0, 0, -1.]))
        rows.append(list(range(len(V), len(V) + NPHI))); V += list(P); N += list(n); rz.append(zp if dr == 0 else .09)
    bot = len(V); V.append(np.array([0, .0, .108])); N.append(np.array([0, 0, -1.]))
    top = len(V); V.append(np.array([0, .0, Z_TOP])); N.append(np.array([0, 0, 1.]))
    F = []; FZ = []
    for k in range(len(rows) - 1):
        a_, b_ = rows[k], rows[k + 1]
        for i in range(NPHI):
            F.append((a_[i], a_[(i + 1) % NPHI], b_[(i + 1) % NPHI], b_[i])); FZ.append((rz[k] + rz[k + 1]) / 2)
    for i in range(NPHI): F.append((rows[0][(i + 1) % NPHI], rows[0][i], bot)); FZ.append(.09)
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

# ---------------------------------------------------------------- the obi: a thick band with a centre cord groove
OBI_ZM = .4225
OBI_PROF = [(.381, .001), (.3825, .011), (.387, .019), (.395, .0235), (.413, .0245), (.4185, .021), (.4215, .0195),
            (.4245, .0195), (.4275, .021), (.433, .0245), (.452, .0235), (.459, .019), (.4625, .011), (.464, .001)]
OBI_GROOVE = (.4180, .4280)
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
def build_obi():
    phi = np.linspace(0, 2 * PI, 60, endpoint=False); V = []; rows = []
    for z, t in OBI_PROF:
        r = obi_r(phi, z, t); rows.append(list(range(len(V), len(V) + len(phi))))
        V += list(np.stack([r * np.sin(phi), -r * np.cos(phi), np.full(len(phi), z)], -1))
    F = []; FR = []; n = len(phi)
    for k in range(len(rows) - 1):
        zc = (OBI_PROF[k][0] + OBI_PROF[k + 1][0]) / 2; nm = 'obicord' if OBI_GROOVE[0] < zc < OBI_GROOVE[1] else 'obi'
        for i in range(n):
            a_, b_ = rows[k], rows[k + 1]; F.append((a_[i], a_[(i + 1) % n], b_[(i + 1) % n], b_[i])); FR.append(nm)
    V = np.array(V); ob = make_obj('obi_band', V, F, np.zeros((len(V), 2)), 'obi')
    ramp_faces(ob, FR, lambda Vv, Nn: sval(Nn, .20 * ao(body_occ, Vv, Nn, .04), hi=.18, lo=.24))
    return ob
build_obi()
# the bow at the back: a flat rounded cushion (the sheet's back and side views)
BOW_C = np.array([0, .222, .432]); BOW_R = [.070, .034, .064]
def bow_sdf(p): return sell(p, BOW_C, BOW_R, (3.2, 2.3, 3.2))
def bow_shade(P, N): return sval(N, .25 * ao(lambda q: bell_sdf(q, False) - .024, P, N, .03), hi=.20, lo=.24)
sdf_ball('obi_bow', bow_sdf, BOW_C, 7 if FAST else 7, 'obi', 'obi', shade=bow_shade, t1=.12)

# ---------------------------------------------------------------- the apron: a thick slab wrapping the front below the obi
AP_TOP, AP_BOT = .398, .146; AP_T = .012; AP_GAP = .004; AP_R0 = .26
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
AP_HW0, AP_HW1, AP_RC = .196, .250, .046         # half-widths at the top / bottom (front view), corner radius
def _apron_outline_xz():
    def hw(z): return AP_HW0 + (AP_HW1 - AP_HW0) * float(smooth(AP_TOP, .24, z))
    def zb(x): return AP_BOT + .010 * (x / AP_HW1) ** 2
    side = [(hw(z), z) for z in np.linspace(AP_TOP, AP_BOT + AP_RC, 22)]
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
def in_poly(P, poly):
    x = P[:, 0]; y = P[:, 1]; inside = np.zeros(len(P), bool); n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        inside ^= ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-30) + x1)
    return inside
def build_apron():
    O = _apron_outline_xz(); S = x_to_s(O[:, 0], O[:, 1]); out = np.stack([S, O[:, 1]], -1)
    def area(p): return .5 * np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1])
    if area(out) < 0: out = out[::-1]
    out = resample(out, .016)
    gx, gz = np.meshgrid(np.arange(-.40, .40, .025), np.arange(.13, .41, .0215))
    G = np.stack([gx.ravel(), gz.ravel()], -1); G[:, 0] += .0125 * (np.round((G[:, 1] - .13) / .0215) % 2)
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
def ribbon(name, ctrl, offs, width, thick, group, ramp, n=92, cen=(0, 0, .47)):
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
COLLAR_W, COLLAR_T = .042, .013
# from under the obi (his right front), up across the chest over his left shoulder, round the back of the neck, over his
# right shoulder and down to the crossing, where it tucks under the first band
COLLAR_CTRL = [(-.092, -.21, .430), (-.078, -.21, .462), (-.052, -.20, .490), (-.022, -.19, .514), (.010, -.18, .538),
               (.050, -.16, .563), (.092, -.12, .584), (.124, -.06, .596), (.134, .00, .600), (.116, .060, .600),
               (.062, .102, .598), (0, .114, .597), (-.062, .102, .598), (-.116, .060, .600), (-.134, .00, .600),
               (-.124, -.06, .596), (-.092, -.12, .582), (-.062, -.150, .560), (-.036, -.170, .538), (-.016, -.180, .516)]
COLLAR_OFF = [.000, .006, .014, .016, .012, .006, .004, .004, .004, .004, .004, .004, .004, .004, .004, .004, .004, .003,
              .000, -.006]
COLLAR_PATH = ribbon('collar', COLLAR_CTRL, COLLAR_OFF, COLLAR_W, COLLAR_T, 'collar', 'apron')

# ================================================================ SLEEVES, FOREARMS (A-pose), LEGS + FEET
ARM_DEG = 50.
SLV_L = .172
joint_arms = {}; joint_legs = {}; sleeve_info = {}
def arm_frame(s):
    a = math.radians(ARM_DEG); d = unit(np.array([s * math.sin(a), -.10, -math.cos(a)]))
    e1 = unit(np.cross(d, [0, 0, 1.])); e2 = unit(np.cross(e1, d))
    if e2[2] < 0: e2 = -e2
    return d, e1, e2
def sleeve_ring(s, t, a, scale=1.):
    d, e1, e2 = arm_frame(s); S0 = np.array([s * .170, .000, .525])
    C = S0 + d * (-.045 + (SLV_L + .045) * t)
    rw = .082 + .026 * float(smooth(0, 1, t)); ru = .076 + .012 * t; rd = .084 + .078 * float(smooth(0, .9, t))
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
    for dd, rr in [(-.004, .076), (-.040, .068)]:
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
for s, tag in ((-1, 'R'), (1, 'L')):
    build_sleeve(s, tag)
    d, e1, e2 = arm_frame(s); sh = np.array([s * .170, .000, .525])
    elbow = sh + d * .130; wrist = sh + d * .232
    pts_ = [sh + d * .040, sh + d * .130, sh + d * .205, sh + d * .252]
    rad = lambda t: .054 + .013 * float(smooth(.62, 1., t))
    limb('arm.' + tag, pts_, rad, 'arm.' + tag, rings=14, sides=18, cap_rows=7, cap_len=1.05, occ_f=bell_sdf_nolip, squash=.94,
         occ_k=.20, start_cap=True)
    joint_arms[tag] = {'shoulder': [float(v) for v in sh], 'elbow': [float(v) for v in elbow], 'wrist': [float(v) for v in wrist],
                       'paw_tip': [float(v) for v in sh + d * (.252 + .067 * 1.05)]}
FOOT = dict(r=[.108, .140, .050], p=(2.6, 2.7, 2.0), pzlo=4.0, rzlo=.036)       # round 1: a domed bun (the sheet's side view)
def foot_sdf_s(s):
    c = np.array([s * .154, -.012, .036])            # the sole on z = 0 (rzlo 0.036)
    def f(p):
        d = sell(p, c, FOOT['r'], FOOT['p'], FOOT['pzlo'], FOOT['rzlo'])
        for k in (-1, 1):            # two shallow toe grooves on the front of the foot
            g = ell(p, c + np.array([k * .036, -.160, .036]), [.0062, .024, .044])
            d = smax(d, -g, .006)
        return d
    return f, c
for s, tag in ((-1, 'R'), (1, 'L')):
    hip = np.array([s * .135, .000, .250]); knee = np.array([s * .140, -.004, .155]); ankle = np.array([s * .150, -.010, .062])
    leg_pts = [hip + np.array([0, 0, .03]), hip, knee, ankle]
    limb('leg.' + tag, leg_pts, lambda t: .086 - .006 * float(smooth(.5, 1, t)), 'leg.' + tag, rings=5, sides=16, cap_rows=3,
         cap_len=.5, occ_f=bell_sdf_nolip, occ_k=.30)
    ff, fc = foot_sdf_s(s)
    def foot_shade(P, N, ff=ff, fc=fc):
        lat = (P[:, 0] - fc[0]) / .108; frontz = smooth(-.09, -.13, P[:, 1] - fc[1]) * smooth(.008, .022, P[:, 2]) * smooth(.080, .06, P[:, 2])
        groove = sum(np.exp(-((lat - k * .333) / .035) ** 2) for k in (-1, 1)) * frontz
        return sval(N, .22 * groove)
    sdf_ball('foot.' + tag, ff, fc + np.array([0, 0, .01]), 8 if FAST else 9, 'leg.' + tag, 'fur', shade=foot_shade, t1=.4)
    joint_legs[tag] = {'hip': [float(v) for v in hip], 'knee': [float(v) for v in knee], 'ankle': [float(v) for v in ankle],
                       'toe': [float(fc[0]), float(fc[1] - .14), .035]}

# ================================================================ THE TAIL: a big round puff, fur root, dark tip
TAIL_PTS = [np.array(p, float) for p in [(0, .110, .350), (0, .190, .330), (0, .262, .300), (0, .318, .268), (0, .352, .240)]]   # points back and a little down
def tail_r(t): return .085 + .052 * float(smooth(0, .55, t)) - .010 * float(smooth(.80, 1, t))
TAIL_BANDS = [(-9, .74, 'fur'), (.74, 9, 'tailtip')]     # the sheet: the outer ~45 % dark (the band and the tip as one)
def tail_ramp(t):
    for a, b, nm in TAIL_BANDS:
        if a <= t < b: return nm
    return 'tailtip'
TAIL_RT = sorted(set([round(v, 4) for v in np.linspace(0, 1, 21)] + [a for a, _, _ in TAIL_BANDS[1:]]))
tail_ob, TAIL_V = limb('tail', TAIL_PTS, tail_r, 'tail', sides=24, cap_rows=8, cap_len=.95, ring_t=TAIL_RT,
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
def lash_th(psi):      # the upper lash line: thick on top, swelling to the outer corner (psi 0 = outer side)
    return (.060 + .22 * np.sin(np.clip(psi, 0, PI)) ** .55 + .08 * np.exp(-((psi - .35) / .40) ** 2)) * smooth(-.10, .25, psi)
# the three lash flicks at the outer corner (the sheet's head close-up): (where on the lid, length W, direction, root width W)
LASH_FLICKS = [(.78, .030, 1.12, .0085), (.46, .036, .70, .0095), (.16, .030, .30, .0085)]
def paint_face(U, V):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = radial_hit(d); n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    fr = smooth(HY + .02, HY - .08, y)
    C = ramp_colour('fur', head_shade(P, n))
    occ = head_occ(P, n)
    near_face = (np.abs(x) < .5 * W) & (z < CHIN + .56 * W) & (z > CHIN - .02 * W) & (fr > 0)
    # the tanuki mask: one soft rounded band across the eyes and the nose bridge
    a = np.zeros(len(x)); a[near_face] = poly_fill(x[near_face], z[near_face], MASK_POLY, .0016) * fr[near_face]
    if PAINT_OPTS.get('maskall'): a = np.ones(len(x))
    C = mix(C, ramp_colour('dark', sval(n, .5 * occ, hi=.16, lo=.20)), a)
    # the cream muzzle, a broad oval over the lower face
    a = np.zeros(len(x)); a[near_face] = poly_fill(x[near_face], z[near_face], MUZ_POLY, .0026) * fr[near_face]   # a 2.5 mm blended border
    # round 1: a soft inner rim shade round the lower muzzle, so it reads as a rounded bump (the sheet's 3/4)
    rim = np.zeros(len(x)); rim[near_face] = 1 - poly_fill(x[near_face], z[near_face], MUZ_POLY, .030 * W)
    rim *= smooth(CHIN + .20 * W, CHIN + .10 * W, z)
    C = mix(C, ramp_colour('cream', sval(n, .10 * rim, hi=.12, lo=.18)), a * PAINT_OPTS['muzzle'])
    # blush ovals
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .92 * (1 - smooth(.86, 1.05, r)) * fr * PAINT_OPTS['blush'])
    # brows: soft arcs, the peak a little inside the middle, the outer end lower, tapering to rounded points
    t = np.linspace(-1, 1, 15)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * BROW_L * t, BROW_Z + .018 * W * (1 - t * t) - .008 * W - .007 * W * t], -1)
        half = .0090 * W * np.maximum(0, 1 - t * t) ** .65 + .0015 * W
        box = (np.abs(x - s * BROW_X) < .09 * W) & (np.abs(z - BROW_Z) < .05 * W) & (fr > 0)
        a = np.zeros(len(x)); a[box] = stroke(x[box], z[box], Pb, half, .0026 * W)
        C = mix(C, rgb('brow'), .96 * a)
    # the little "w" smile, its cusp under the philtrum line
    lw = .0040 * W
    for s in (-1, 1):
        Pm = np.array([catmull([(s * .068 * W, MZM + .006 * W), (s * .060 * W, MZM - .001 * W), (s * .036 * W, MZM - .009 * W),
                                (s * .014 * W, MZM - .005 * W), (0, MZM + .008 * W)], q) for q in np.linspace(0, 1, 17)])
        half = np.full(len(Pm), lw); half[0] = lw * .55; half[1] = lw * .8
        ib = (np.abs(x) < .11 * W) & (np.abs(z - MZM) < .05 * W) & (fr > 0)
        a = np.zeros(len(x)); a[ib] = stroke(x[ib], z[ib], Pm, half, .0024 * W); C = mix(C, rgb('mouth'), .96 * a)
    Pp = np.array([(0, NOSE_BOT + .004 * W), (0, MZM + .008 * W)]); ib = (np.abs(x) < .03 * W) & (np.abs(z - MZM) < .07 * W) & (fr > 0)
    a = np.zeros(len(x)); a[ib] = stroke(x[ib], z[ib], Pp, np.array([lw * .9, lw]), .0024 * W); C = mix(C, rgb('mouth'), .96 * a)
    # the upper lash line with its three outer flicks, and the thin lower lid line
    for s in (-1, 1):
        sr, psi, X, Z = eye_s(s, x, z); near = fr * (sr < 2.1)
        th = lash_th(psi)
        upw = smooth(-.14, -.05, psi) * (psi > -1.2)
        lash = (1 - smooth(1 + th - .010, 1 + th + .010, sr)) * upw
        low = (1 - smooth(1.030, 1.050, sr)) * (1 - upw)
        a = np.zeros(len(x))
        for pk, Lk, gam, w0 in LASH_FLICKS:
            bxk, bzk = eye_xz(s, np.array([pk]), 1 + float(lash_th(np.array([pk]))[0]) * .55)
            tq = np.linspace(0, 1, 8); dx_ = np.cos(gam + .30 * tq); dz_ = np.sin(gam + .30 * tq)
            Pf = np.stack([bxk[0] + s * Lk * W * tq * dx_, bzk[0] + Lk * W * tq * dz_], -1)
            hf = w0 * W * (1 - tq) ** .9 + .0010 * W
            ib = (near > 0) & (np.abs(x - Pf[:, 0].mean()) < .06 * W) & (np.abs(z - Pf[:, 1].mean()) < .06 * W)
            aa = np.zeros(len(x)); aa[ib] = stroke(x[ib], z[ib], Pf, hf, .0024 * W); a = np.maximum(a, aa)
        up_on = 0. if PAINT_OPTS.get('ride') else 1.      # rig: the moving upper lid carries the whole upper lash (band, corners, flicks)
        C = mix(C, rgb('lash'), np.maximum(np.maximum(lash * up_on, low * .92), a * up_on) * near * PAINT_OPTS['band'])
    return C.reshape(sh + (3,))

def paint_eye(U, V, s):
    """X, Z in eye-opening units (X along world x, so the catchlights sit on the same side in both eyes, as on the sheet)"""
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .33; iz = .07; irx = .62; irz = 1.03
    C = mix(rgb('sclera'), rgb('#ECDFD4'), .45 * smooth(.35, .95, Z))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#7A4818'), rgb('iris'), smooth(-.1, -.80, ez))                 # amber, brightest at the bottom
    I = mix(I, rgb('#E3A85A'), .55 * smooth(-.50, -.95, ez) * smooth(.95, .55, np.abs(ex)))
    I = mix(I, rgb('#4E2C10'), smooth(.80, 1.0, r) * .60)
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    # the pupil: about 0.62 of the iris, a little toward the nose, the amber showing as a ring (widest below)
    px_ = ix - s * .08; pz = .12; R = np.sqrt(((X - px_) / .44) ** 2 + ((Z - pz) / .64) ** 2)
    C = mix(C, rgb('pupil'), 1 - smooth(.975, 1.025, R))
    big = np.sqrt(((X - (ix + .20)) / .145) ** 2 + ((Z - .42) / .175) ** 2)
    small = np.sqrt(((X - (ix + .36)) / .062) ** 2 + ((Z - .64) / .072) ** 2)
    C = mix(C, rgb('#FFFAF4'), np.maximum(1 - smooth(.92, 1.08, big), .85 * (1 - smooth(.88, 1.12, small))))
    C = mix(C, rgb('lash'), smooth(.945, .995, sr) * (.45 + .55 * smooth(-.2, .5, Z)))  # the lid contact rim
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
        return mix(C, Ci, 1 - smooth(.47, .51, r))
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
atlas_path = os.path.join(ROOT, 'scratch' if FAST else '', 'tk-fuku-toy_rig_atlas.png' if RIG else 'tk-fuku-toy_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Fuku_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Fuku_toy_atlas'); MAT.use_nodes = True
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
        'bell_extent_m': ext(parts['body']), 'obi_extent_m': ext(parts['obi']), 'apron_extent_m': ext(parts['apron']),
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
    ob = bpy.context.object; ob.name = 'Fuku_' + group.replace('.', '_')
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
           'apron': (0, 0, AP_TOP), 'collar': (0, 0, .52), 'body': (0, 0, .30)}.get(group, (0, 0, 0))
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
          'hips': [0, .000, .250], 'spine': [0, .000, .360], 'chest': [0, .000, .470], 'neck': [0, .010, .585],
          'head': [float(v) for v in O], 'jaw_pivot': [0, float(HY - .10 * W), float(CHIN + .10 * W)],
          'eyes': eye_centers, 'ears': ears_j, 'arms': joint_arms, 'sleeves': sleeve_info, 'legs': joint_legs, 'tail': tail_chain,
          'obi_bow': [float(v) for v in BOW_C], 'apron_top': [0, -.215, AP_TOP], 'apron_hem': [0, -.275, AP_BOT],
          'skirt_hem_z': .094, 'kimono_hem_z': Z_HEM,
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth SDF ball (cranium + cheek mass + jaw + muzzle displacement + trim), radially projected, analytic normals.',
                    'Eyelid holes ringed by 5 loops each, rim rolled in behind separate lens eyeballs; 3 loops round the mouth.',
                    'Separate pieces: eyes, ears, tail (bend rings), sleeves (rings along the upper arm, open cuff), forearms, legs,',
                    'the kimono+skirt bell (rings every 1-2 cm, the hem colour border on a loop), obi + bow, apron (hangs from the obi), collar ribbon.']}
if RIG:
    pass
elif not FAST:
    with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-fast.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not FAST and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'tk-fuku-toy.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG: bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('FUKU_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
