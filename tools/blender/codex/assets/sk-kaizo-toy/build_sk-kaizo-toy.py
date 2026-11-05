"""Old Captain Kaizo, Shiokaze Port's elder, a grey dog (Toybox zone villager, VL-2), phase-1 model. Blender 4.3, no addons.
Deterministic.

    blender --background --factory-startup --python build_sk-kaizo-toy.py [-- --fast]

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/sk-kaizo-toy.glb (--fast: no toon refinement, writes scratch/kaizo-fast.glb instead).

Technique (the Takumi / Kuma / Rosie toy-line machinery, tools/blender/codex/assets/tk-takumi-toy):
- The head is ONE smooth implicit ball: a rounded cranium and a wide, bottom-heavy cheek mass (fitted to the sheet by
  scratch/fit_head.py), smooth-unioned with a soft dog snout. Its skin is the field's zero surface reached by radial
  projection (CDT in a stereographic domain, edge loops round both eyelid holes and the mouth), so every vertex carries the
  field's analytic normal. The eyes are separate flush lens globes in lid holes; the upper lash lines are their own rolls.
- The nose is a glossy rounded-triangle button on the snout; the brows are raised cream beans; the ears are thick folded
  wedges (a swept lens section along a spine that bends forward over the ear's pink face), rising from behind the band.
- The bandana is a rounded-section band swept round the skull in a plane tilted 15 deg back, sagging at the sides.
- The torso is an SDF (a shirt barrel flaring to the hem, over a trouser seat) meshed by radial projection; the shirt hem
  is a rolled lip, the placket a thin overlapping slab. The kerchief is a soft band round the neck with a round knot and
  two hanging lobes. Arms are tubes with puffed short sleeves; trouser legs are tubes with rolled cuffs; a hooked tail.
- One 2048 painted atlas: the face chart painted from 3D positions, two eye charts, the ear and nose charts and 1-D
  shading ramps (soft painted light baked into the colour, never hard shadows).
"""
import bpy, bmesh, math, json, os, sys, struct, zlib
import numpy as np
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt
from mathutils.kdtree import KDTree

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
FAST = '--fast' in ARGV
RIG = bool(globals().get('RIG_MODE'))       # set by a later rig script: part labels; no approved file is written
if RIG: FAST = False
MODEL = 'D:/projects/chewy-life-3d/public/models/sk-kaizo-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'kaizo-fast.glb') if FAST else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
LOG = {}

# ---------------------------------------------------------------- the sheet's measures (measure.md)
# turnaround: ground y 500, ear tops y 70 -> 1.03 m (417.5 px / m); front head 243 px at the cheeks; the head close-up:
# W = 337 px at the cheeks, chin y 824, crown y 550, features' midline x 218.5.
W = .582; CHIN = .515; HY = .018            # head width at the cheeks, chin height, head centre y
SW = W / .44                                # Rosie's metric detail sizes (authored at W 0.44) scale by SW

# dark cloth reads near-black in the game's grade: the shirt and trousers are painted a touch lighter than the swatches
# (same hue). Every ramp keeps its hue: light and shade are value changes only.
PAL = {'fur': '#B8B0A8', 'furdark': '#9B948D', 'furlight': '#C6BFB7',          # value-only (x0.84 / x1.08 of the swatch)
       'muz': '#F4F0EA', 'muzdark': '#DCD5CC', 'muzlight': '#FAF6F0',
       'shirt': '#36547A', 'shirtdark': '#2C4565', 'shirtlight': '#3F5F88',
       'trou': '#47475A', 'troudark': '#393949', 'troulight': '#525267',
       'kerch': '#E8E0D0', 'kerchdark': '#D0C6B2', 'kerchlight': '#F3ECDE',
       'band': '#C84A3A', 'banddark': '#A63D30', 'bandlight': '#D45646',
       'brow': '#F0EADF', 'browdark': '#D9D0C2', 'browlight': '#FAF5EC',
       'inner': '#E0A8A0', 'innerdark': '#C99089', 'innerlight': '#EBB8B0',
       'iris': '#3A5A7A', 'pupil': '#2A2A30', 'nose': '#2A2A30', 'sclera': '#FFF8EF', 'blush': '#E0A8A0',
       'lash': '#26232A', 'mouth': '#2A2A30'}
CHARTS = {'face': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'ear': (1280, 896, 256, 256), 'nose': (1536, 896, 256, 256)}
if RIG:   # phase-2 charts in unused atlas space (the approved paint is untouched)
    CHARTS.update({'lidU.L': (0, 0, 512, 256), 'lidU.R': (512, 0, 512, 256), 'lidD.L': (1024, 0, 512, 192), 'lidD.R': (1536, 0, 512, 192),
                   'cavity': (0, 256, 128, 128), 'tongue': (128, 256, 128, 128)})
PAINT_OPTS = {'band': True, 'blush': True, 'muzzle': True}
SKIN_LID_LINES = False     # the rig paints its lids from this skin with the lash shade off
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'muz': ('muzdark', 'muz', 'muzlight'),
         'shirt': ('shirtdark', 'shirt', 'shirtlight'), 'trou': ('troudark', 'trou', 'troulight'),
         'kerch': ('kerchdark', 'kerch', 'kerchlight'), 'band': ('banddark', 'band', 'bandlight'),
         'brow': ('browdark', 'brow', 'browlight'), 'inner': ('innerdark', 'inner', 'innerlight'),
         'nose': ('#1C1C22', 'nose', '#4A4A54'), 'eyedark': ('#1A1A20', '#26232A', '#403C46'), 'lash': ('#1A181E', 'lash', '#46424C')}
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
class Frame:
    """an oriented local frame: columns X (right), Y (depth), Z (up) in world space"""
    def __init__(self, c, x, y, z): self.c = np.asarray(c, float); self.M = np.stack([unit(np.asarray(v, float)) for v in (x, y, z)], 1)
    def local(self, p): return (np.asarray(p, float) - self.c) @ self.M
    def world(self, q): return self.c + np.asarray(q, float) @ self.M.T

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
def mesh_vn(ob):
    me = ob.data; me.update()
    Nn = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('normal', Nn)
    Vv = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', Vv)
    return Vv.reshape(-1, 3), Nn.reshape(-1, 3)
def ramp_by_normal(ob, ramp, fn=None):
    """per-vertex ramp UVs from the mesh's own smooth normals (fn(V, N) -> shade value)"""
    me = ob.data; V, N = mesh_vn(ob); val = fn(V, N) if fn is not None else sval(N)
    uvl = me.uv_layers['Atlas']; lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
    uvl.data.foreach_set('uv', ramp_uv(ramp, val)[lv].astype(np.float32).ravel())

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

def sdf_ball(name, f, centre, n, group, ramp, scale=(1, 1, 1), occ_f=None, occ_k=.35, shade=None, t1=.8, frame=None):
    """mesh the zero set of f by radial projection of a cube-sphere from centre (analytic normals, ramp UVs);
    scale stretches the ray directions (in the frame's axes when a Frame is given)"""
    D, F = cube_sphere(n); D = unit(D * np.asarray(scale, float))
    if frame is not None: D = D @ frame.M.T
    P = ray_outer(f, centre, D, t1=t1); N = grad(f, P)
    occ = occ_k * ao(occ_f, P, N) if occ_f is not None else 0.
    val = shade(P, N) if shade is not None else sval(N, occ)
    return make_obj(name, P, F, ramp_uv(ramp, val), group, N), P, N

def catmull(points, t):
    pts = [np.asarray(p, float) for p in points]; n = len(pts) - 1; k = min(int(t * n), n - 1); f = t * n - k
    p0, p1, p2, p3 = pts[max(0, k - 1)], pts[k], pts[k + 1], pts[min(n, k + 2)]
    return .5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f ** 3)

def tube(name, points, rows, group, sides=18, cap_rows=7, cap_len=1.0, squash=1.0, occ_f=None, occ_k=.35, start_fan=True, extra_occ=None):
    """a tube along a Catmull-Rom centreline: rows = [(t, radius, ramp)], profile normals (rolled hems read as soft lips),
    a buried start fan and a rounded (mitten) end cap with the last row's ramp. Faces take the ramp of their upper row."""
    V = []; NV = []; rings = []; ramps = []; old = None
    def frame(t):
        p = catmull(points, t); d = unit(catmull(points, min(1, t + .002)) - catmull(points, max(0, t - .002))); return p, d
    fr = []
    for (t, r, rp) in rows:
        p, d = frame(t); ref = np.array([0, 1., 0]) if abs(d[1]) < .95 else np.array([1., 0, 0])
        x = unit(np.cross(d, ref)) if old is None else unit(old - d * (old @ d)); y = np.cross(d, x); old = x
        fr.append((p, d, x, y, r, rp))
    # arc-length positions for the profile slope
    S = np.concatenate([[0], np.cumsum([np.linalg.norm(fr[j + 1][0] - fr[j][0]) for j in range(len(fr) - 1)])])
    R = np.array([f_[4] for f_ in fr])
    for j, (p, d, x, y, r, rp) in enumerate(fr):
        a0 = max(0, j - 1); a1 = min(len(fr) - 1, j + 1)
        slope = (R[a1] - R[a0]) / max(S[a1] - S[a0], 1e-6)
        row = []
        for i in range(sides):
            a = 2 * PI * i / sides; rad = x * math.cos(a) + y * squash * math.sin(a)
            row.append(len(V)); V.append(p + rad * r)
            NV.append(unit(unit(x * math.cos(a) * squash + y * math.sin(a)) - d * slope))
        rings.append(row); ramps.append(rp)
    p, d, x, y, r, rp = fr[-1]
    for k in range(1, cap_rows):
        a = k / cap_rows * PI / 2; c = p + d * (r * cap_len * math.sin(a)); row = []
        for i in range(sides):
            b = 2 * PI * i / sides; q = c + (x * math.cos(b) + y * squash * math.sin(b)) * (r * math.cos(a))
            row.append(len(V)); V.append(q)
            NV.append(unit((x * math.cos(b) * squash + y * math.sin(b)) * math.cos(a) / max(squash, .5) + d * math.sin(a) / cap_len))
        rings.append(row); ramps.append(rp)
    tip = len(V); V.append(p + d * r * cap_len); NV.append(d)
    p0, d0 = frame(rows[0][0]); st = len(V); V.append(p0 - d0 * rows[0][1] * .3); NV.append(-d0)
    V = np.array(V); NV = np.array(NV)
    occ = occ_k * ao(occ_f, V, NV) if occ_f is not None else np.zeros(len(V))
    if extra_occ is not None: occ = occ + extra_occ(V, NV)
    shade = sval(NV, occ)
    F = []; UV = []
    def add(face, rp):
        F.append(face); UV.append([tuple(ramp_uv(rp, shade[i:i + 1])[0]) for i in face])
    for j, (a_, b_) in enumerate(zip(rings, rings[1:])):
        for i in range(sides): add((a_[i], a_[(i + 1) % sides], b_[(i + 1) % sides], b_[i]), ramps[j])
    for i in range(sides): add((rings[-1][i], rings[-1][(i + 1) % sides], tip), ramps[-1])
    if start_fan:
        for i in range(sides): add((rings[0][(i + 1) % sides], rings[0][i], st), ramps[0])
    return make_obj(name, V, F, UV, group, NV), V

# ================================================================ HEAD: the smooth ball (W units, z above the chin)
# fitted by scratch/fit_head.py (plan exponents capped at 2.7, so the head is round in plan) to the sheet's front widths
# (1.00 W at z 0.234-0.269, 0.917 at 0.441, 0.78 at 0.062), the side profile (the face 0.41 W ahead, the back 0.41 W behind)
# and the crown (0.816 W)
CR = ([0, 0.0028, 0.4927], [0.3876, 0.3113, 0.2553], (1.6382, 2.6922, 1.6349))      # cranium (round in plan)
CK = ([0, -0.0183, 0.2046], [0.4957, 0.4073, 0.1939], (2.5728, 2.3101, 2.1309), 2.9974, 0.2786)  # the wide, bottom-heavy cheek mass
K_CK = 0.3224
# the dog snout: a soft superellipsoid smooth-unioned into the cheeks (the sheet's side view: the snout front 0.52 W ahead
# of the head centre at z 0.22 W, the nose tip 0.54 W); its front view matches the painted cream muzzle (0.35 W wide)
SN = ([0, -.295, .145], [.175, .225, .145], (2.4, 2.4, 3.0), 1.9, .175)
K_SN = .05
def head_local(q):
    return smin(smin(sell(q, *CR), sell(q, *CK), K_CK), sell(q, *SN), K_SN)
_g = np.stack(np.meshgrid(np.linspace(-.5, .5, 81), np.linspace(-.7, .6, 105), np.linspace(-.25, .15, 401), indexing='ij'), -1).reshape(-1, 3)
ZMIN = float(_g[head_local(_g) < 0][:, 2].min()); del _g
for blob in (CR, CK, SN): blob[0][2] -= ZMIN
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

# ---------------------------------------------------------------- face layout (front projection, metres; measure.md)
EX = .209 * W; EZ = CHIN + .377 * W; EHW = .1040 * W; EHH = .1040 * W; EN = 2.15     # the lid hole: the rim measures 0.208 W (the sheet's opening)
def eye_unit(psi):
    return spow(np.cos(psi), 2 / EN), spow(np.sin(psi), 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
MUZ_C = CHIN + .217 * W; MUZ_HW = .176 * W; MUZ_HH = .130 * W           # painted muzzle oval (0.352 x 0.26 W)
NOSE_Z = CHIN + .286 * W; NOSE_TOP = CHIN + .330 * W; NOSE_BOT = CHIN + .2425 * W
MZM = CHIN + .205 * W; MHW = .089 * W; MS = 1.0                           # the "w" mouth (0.178 W wide)
BLUSH = (.316 * W, CHIN + .223 * W, .082 * W, .058 * W)

# ---------------------------------------------------------------- the bandana plane (needed by the head paint)
TAU = math.radians(15)                                  # the band leans back 15 deg (its back is lower; the side view)
HEZ = np.array([0, math.sin(TAU), math.cos(TAU)]); HEY = np.array([0, math.cos(TAU), -math.sin(TAU)]); HEX = np.array([1., 0, 0])
BAND_P0 = np.array([0, HY - .29 * W, CHIN + .697 * W])   # the band's centre line at the front (sheet: z 0.650-0.745 W)
BAND_HB = .048 * W; BAND_HB_BACK = .062 * W; BAND_T = .028 * W     # half-height front / back, thickness off the skull
BAND_SAG = .030 * W                                      # the sides sag (the front view: the band reaches z 0.47 W at the outline)
def band_sag(p):
    p = np.asarray(p, float); lat = np.abs(p[..., 0]) / np.maximum(np.hypot(p[..., 0], p[..., 1] - HY), 1e-9)
    return BAND_SAG * lat ** 2.2
def band_q(p): return (np.asarray(p) - BAND_P0) @ HEZ + band_sag(p) * HEZ[2]
def band_cover(p): return np.zeros(np.asarray(p).shape[:-1])     # the head is kept whole under the band

# ---------------------------------------------------------------- the fur shade (shared by the face chart and the ramps)
EAR_C = {s: np.array([s * .31 * W, HY - .03 * W, CHIN + .72 * W]) for s in (-1, 1)}
def head_occ(P, n):
    q = np.abs(band_q(P)); o = .07 * smooth(BAND_HB + .05 * W, BAND_HB + .004 * W, q)          # soft contact shade by the band
    for s in (-1, 1):
        dd = np.linalg.norm(P - EAR_C[s], axis=-1); o = o + .08 * np.exp(-(dd / (.12 * W)) ** 2)
    return o
def head_shade(P, n): return sval(n, head_occ(P, n), hi=.06, lo=.24)        # light is a soft value change only

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
for k, (hx, hz) in enumerate([(.108, .028), (.123, .036), (.138, .045)]):
    a = np.linspace(0, 2 * PI, 40, endpoint=False)
    add_loop(to_dom(surf_dir(MS * hx * W * spow(np.cos(a), .8), MZM - .002 * W + hz * W * np.sin(a))), 'mouth_%d' % k)
NB = 64; AB = math.radians(150)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
def fib(n):
    ii = np.arange(n) + .5; phi = np.arccos(1 - 2 * ii / n); th = PI * (1 + 5 ** .5) * ii
    return np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
NF = 1500 if FAST else 2500
D = fib(NF); D = D[np.arccos(np.clip(-D[:, 1], -1, 1)) < math.radians(147.)]
D2 = fib(6400 if FAST else 6800); D2 = D2[np.arccos(np.clip(-D2[:, 1], -1, 1)) < math.radians(62)]
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
keep &= ~(front & ((Pf[:, 0] / (MS * .152 * W)) ** 2 + ((Pf[:, 2] - MZM) / (.062 * W)) ** 2 < 1))
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

# ================================================================ LASH RIBBONS: the upper lash line and its wing (own objects)
# a flattened tapered tube lying on the skin along the opening's upper rim (its lower edge just over the lens), thick over
# the top and swelling to the outer corner, carried out into the wing flick; ~0.007 W proud. Separate objects (origin at
# the eye centre) so the rig can hang them on the upper lids; the skin under them gets only a thin painted contact shade.
def lash_th(psi):      # the lash band's thickness (eye radii): thick over the top (0.028 W), thinning down the nose side
    return ((.06 + .20 * np.sin(np.clip(psi, 0, PI)) ** .5 + .06 * np.exp(-((psi - .40) / .40) ** 2))
            * smooth(-.10, .25, psi) * (1 - .62 * smooth(2.30, 3.20, psi)))
def lash_centreline():
    """(X, Z) eye units (X > 0 outer) and half-widths (eye radii) from the inner end over the top and out into the wing"""
    psi = np.linspace(PI + .02, .22, 34); th = lash_th(psi)
    ux, uz = eye_unit(psi); r = 1 + th / 2 - .03; P = np.stack([ux * r, uz * r], -1); hw = th / 2 + .035
    gam, Lk, w0 = .22, .031 * W, .0100 * W                   # the wing: out and a little up from the outer corner, tapering
    bx, bz = P[-1]; tq = np.linspace(0, 1, 9)[1:]
    Wp = np.stack([bx + Lk / EHW * tq * np.cos(gam + .25 * tq), bz + Lk / EHH * tq * np.sin(gam + .25 * tq)], -1)
    whw = np.maximum(hw[-1] * (1 - tq) ** .85, w0 / EHH * .10)
    return np.concatenate([P, Wp]), np.concatenate([hw, whw])
def tick_centreline():
    """the small lower flick under the wing (the sheet's fishtail): from the outer corner, out and down"""
    psi0 = .05; ux, uz = eye_unit(np.array([psi0])); b = np.array([ux[0] * 1.06, uz[0] * 1.06])
    tq = np.linspace(0, 1, 8); L = .017 * W; g = -.55 - .25 * tq
    P = np.stack([b[0] + L / EHW * tq * np.cos(g), b[1] + L / EHH * tq * np.sin(g)], -1)
    return P, np.maximum(.075 * (1 - tq) ** .8, .012)
LASH_C2, LASH_HW = lash_centreline()
TICK_C2, TICK_HW = tick_centreline()
def eye_pt(s, X, Z):
    x = s * EX + s * EHW * np.asarray(X, float); z = EZ + EHH * np.asarray(Z, float)
    y = front_hit(x, z); S = np.stack([x, y, z], -1); return S, grad_n(S)
lash_info = {}
NLS = 8
def lash_ribbon(s, tag, C2in, HWin, nlt, hp0, name):
    L_ = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(C2in * [EHW, EHH], axis=0), axis=1))]); tt = np.linspace(0, L_[-1], nlt + 1)
    C2 = np.stack([np.interp(tt, L_, C2in[:, 0]), np.interp(tt, L_, C2in[:, 1])], -1); hw = np.interp(tt, L_, HWin) * EHH
    S, n = eye_pt(s, C2[:, 0], C2[:, 1])
    tg = np.gradient(S, axis=0); tg = unit(tg - n * (tg * n).sum(1, keepdims=True)); sd = unit(np.cross(n, tg))
    u = tt / tt[-1]
    hp = hp0 * (.55 + .45 * smooth(0, .25, u)) * (1 - .60 * smooth(.75, 1.0, u))
    V = []; NV = []
    for i in range(nlt + 1):
        for k in range(NLS):
            a = 2 * PI * k / NLS; ca, sa = math.cos(a), math.sin(a)
            up = hp[i] * (sa if sa > 0 else .40 * sa)
            V.append(S[i] + sd[i] * hw[i] * ca + n[i] * (up - .0010 * W))
            NV.append(unit(sd[i] * ca / max(hw[i], 1e-4) + n[i] * sa / max(hp[i], 1e-4)))
    V = np.array(V); NV = np.array(NV)
    tip = len(V); V = np.vstack([V, S[-1] + tg[-1] * hw[-1] * .6 + n[-1] * (.25 * hp[-1])]); NV = np.vstack([NV, tg[-1]])
    root = len(V); V = np.vstack([V, S[0] - tg[0] * hw[0] * .8 + n[0] * (.2 * hp[0])]); NV = np.vstack([NV, -tg[0]])
    F = []
    for i in range(nlt):
        for k in range(NLS):
            a_, b_ = i * NLS + k, i * NLS + (k + 1) % NLS; F.append((a_, b_, b_ + NLS, a_ + NLS))
    for k in range(NLS): F.append((nlt * NLS + k, nlt * NLS + (k + 1) % NLS, tip))
    for k in range(NLS): F.append(((k + 1) % NLS, k, root))
    make_obj(name, V, F, ramp_uv('lash', sval(NV, 0., hi=.14, lo=.10)), 'lash.' + tag, NV)
    return S, hp
for s, tag in ((-1, 'R'), (1, 'L')):
    S, hp = lash_ribbon(s, tag, LASH_C2, LASH_HW, 36, .0085 * W, 'lash.' + tag)
    lash_ribbon(s, tag, TICK_C2, TICK_HW, 8, .0060 * W, 'lash_tick.' + tag)
    lash_info[tag] = dict(tip=[float(v) for v in S[-1]], root=[float(v) for v in S[0]], max_proud_W=round(float(hp.max() / W), 4))
LOG['lash'] = lash_info

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
    # a soft inverted triangle: broad rounded top, the sides tapering to a round point (0.131 x 0.089 W)
    t = np.linspace(0, 2 * PI, n, endpoint=False); u = np.cos(t); v = np.sin(t)
    y = .0445 * W * spow(v, .80); taper = (.60 + .40 * ((v + 1) / 2) ** .9)
    x = .0675 * W * spow(u, .70) * taper
    return np.stack([x, y + .002 * W], -1)
NOSE_OUT = _nose_outline()
NOSE_H = .018                                                   # the button stands 18 mm proud (a soft bump in profile)
def build_nose():
    rows = []; V = []; UV = []
    rings = [1.0, .985, .94, .85, .70, .50, .27]                   # inset rings toward the dome top
    prof = np.array([-.003, .013, .0235, .0307, .035, .0371, .038]) * NOSE_H / .038
    for k, sc in enumerate(rings):
        x = NOSE_OUT[:, 0] * sc; z = NOSE_Z + NOSE_OUT[:, 1] * sc
        y = front_hit(x, z); B = np.stack([x, y, z], -1); n = grad_n(B)
        up = unit(np.array([0, -1., .20]))
        P = B + unit(n + up) * prof[k]
        row = []
        for i in range(len(P)):
            row.append(len(V)); V.append(P[i]); UV.append((.5 + NOSE_OUT[i, 0] * sc / (.16 * W), .5 + NOSE_OUT[i, 1] * sc / (.16 * W)))
        rows.append(row)
    top = len(V); Bc = np.array([0., float(front_hit(0., NOSE_Z)[0]), NOSE_Z]); nc = grad_n(Bc[None])[0]
    V.append(Bc + unit(nc + unit(np.array([0, -1., .20]))) * NOSE_H); UV.append((.5, .5))
    F = []; m = len(NOSE_OUT)
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(m): F.append((a_[i], a_[(i + 1) % m], b_[(i + 1) % m], b_[i]))
    for i in range(m): F.append((rows[-1][i], rows[-1][(i + 1) % m], top))
    return make_obj('nose_button', np.array(V), F, au('nose', *np.array(UV).T), 'head', recalc=False)
build_nose()

# ================================================================ hidden surface
def cull_buried(ob, f, margin):
    """delete the faces whose every vertex is buried deeper than margin inside f (hidden surface)"""
    me = ob.data; co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    mw = np.array(ob.matrix_world); co = co @ mw[:3, :3].T + mw[:3, 3]
    deep = f(co) < -margin
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    kill = [fc for fc in bm.faces if all(deep[v.index] for v in fc.verts)]
    if kill: bmesh.ops.delete(bm, geom=kill, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(me); bm.free(); me.update()
    return len(kill)

# ================================================================ EARS: folded triangular dog ears (model round 2)
# Each ear is ONE thick triangular flap swept along a spine: it rises from the crown corner (0.30 W wide at the base,
# 0.08 W thick), then its top third folds forward and down through a soft 140 deg bend into a rounded triangular tip that
# hangs just above the band. The section is a broad rounded lens (flat faces, soft edges), so the fold reads as a crease in a
# flap, not a cylinder. The front (inner) face is pink with a grey rim; after the fold that face turns under, so the grey
# back of the flap is what shows on top (the sheet). The base turns 28 deg outward so both 45 deg game yaws see a broad face.
EAR_YAW = math.radians(28); EAR_ROLL = math.radians(8)
EAR_L1 = .170; EAR_RB = .042; EAR_PHI = math.radians(140); EAR_L2 = .105; EAR_BASE = -.07     # W: rise, bend radius, fold, tip run
def ear_width(sf):      # full width (W) along the spine fraction sf (0 base .. 1 tip): a triangle narrowing to a soft point
    return .300 - .080 * smooth(0., .55, sf) - .100 * smooth(.62, 1., sf)
def ear_thick(sf): return .080 - .018 * smooth(.3, 1., sf)
def ear_spine(s):
    """centre, tangent and thickness direction (local u = up, n = front) at arc length s (W) from the buried base"""
    s = np.asarray(s, float); L0 = EAR_L1 - EAR_BASE; La = EAR_RB * EAR_PHI
    P = np.zeros(s.shape + (2,)); T = np.zeros_like(P); M = np.zeros_like(P)          # (u, n) components
    st = s <= L0; P[st] = np.stack([EAR_BASE + s[st], np.zeros(st.sum())], -1); T[st] = [1., 0]; M[st] = [0, 1.]
    ar = (s > L0) & (s <= L0 + La); ph = (s[ar] - L0) / EAR_RB
    P[ar] = np.stack([EAR_L1 + EAR_RB * np.sin(ph), EAR_RB * (1 - np.cos(ph))], -1)
    T[ar] = np.stack([np.cos(ph), np.sin(ph)], -1); M[ar] = np.stack([-np.sin(ph), np.cos(ph)], -1)
    tl = s > L0 + La; r = s[tl] - L0 - La; ph = EAR_PHI
    end = np.array([EAR_L1 + EAR_RB * math.sin(ph), EAR_RB * (1 - math.cos(ph))]); d = np.array([math.cos(ph), math.sin(ph)])
    P[tl] = end + r[:, None] * d; T[tl] = d; M[tl] = [-math.sin(ph), math.cos(ph)]
    return P, T, M
EAR_LEN = EAR_L1 - EAR_BASE + EAR_RB * EAR_PHI + EAR_L2
EAR_SHEAR = .34
ear_frames = {}
for s in (-1, 1):
    nv = np.array([s * math.sin(EAR_YAW), -math.cos(EAR_YAW), 0.]); t0 = np.array([s * math.cos(EAR_YAW), math.sin(EAR_YAW), 0.])
    up = math.cos(EAR_ROLL) * np.array([0, 0, 1.]) + math.sin(EAR_ROLL) * t0
    tt_ = math.cos(EAR_ROLL) * t0 - math.sin(EAR_ROLL) * np.array([0, 0, 1.])
    B = np.array([s * .300 * W, HY - .035 * W, CHIN + .622 * W])
    ear_frames[s] = Frame(B, tt_, nv, up)                  # local x = out (a), y = front (n), z = up (u)
ear_info = {}
NE_S, NE_R = 34, 28
ER_TH = np.linspace(0, 2 * PI, NE_R, endpoint=False)
EX_ = spow(np.cos(ER_TH), .42); EY_ = spow(np.sin(ER_TH), .80)          # a broad rounded lens: flat faces, soft edges
for s, tag in ((-1, 'R'), (1, 'L')):
    fr = ear_frames[s]
    ss = EAR_LEN * (1 - (1 - np.linspace(0, 1, NE_S)) ** 1.0)
    sf = ss / EAR_LEN
    P2, T2, M2 = ear_spine(ss)
    V = []; UVc = []; front = []
    def to_w(u_, n_, a_): return fr.world(np.stack([a_, n_, u_], -1) * W)
    for i in range(NE_S):
        w = ear_width(sf[i]); th = ear_thick(sf[i])
        a_ = w / 2 * EX_ + EAR_SHEAR * max(0., ss[i] - (EAR_L1 - EAR_BASE)) ** 1.15   # the folded tip drifts outward (the sheet)
        u_ = P2[i, 0] + M2[i, 0] * th / 2 * EY_; n_ = P2[i, 1] + M2[i, 1] * th / 2 * EY_
        V += list(to_w(u_, n_, a_)); UVc += [(.5 + .5 * x_, sf[i]) for x_ in EX_]; front += list(np.sin(ER_TH) > .25)
    # the rounded tip: rings shrinking along the tangent to a point
    i = NE_S - 1; w = ear_width(1.); th = ear_thick(1.); cap = []
    for k, f_ in enumerate((.35, .65, .88)):
        ang = f_ * PI / 2; adv = w / 2 * .75 * math.sin(ang)
        a_ = w / 2 * math.cos(ang) * EX_ + EAR_SHEAR * max(0., ss[i] - (EAR_L1 - EAR_BASE)) ** 1.15; u_ = P2[i, 0] + T2[i, 0] * adv + M2[i, 0] * th / 2 * math.cos(ang) * EY_
        n_ = P2[i, 1] + T2[i, 1] * adv + M2[i, 1] * th / 2 * math.cos(ang) * EY_
        V += list(to_w(u_, n_, a_)); UVc += [(.5 + .5 * x_ * math.cos(ang), 1.) for x_ in EX_]; front += [False] * NE_R
    tipi = len(V); V.append(to_w(np.array([P2[i, 0] + T2[i, 0] * w / 2 * .75]), np.array([P2[i, 1] + T2[i, 1] * w / 2 * .75]),
                                 np.array([EAR_SHEAR * max(0., ss[i] - (EAR_L1 - EAR_BASE)) ** 1.15]))[0])
    UVc.append((.5, 1.)); front.append(False)
    basei = len(V); V.append(to_w(np.array([P2[0, 0] - .01]), np.array([P2[0, 1]]), np.array([0.]))[0]); UVc.append((.5, 0.)); front.append(False)
    nrow = NE_S + 3; F = []
    for r_ in range(nrow - 1):
        for k in range(NE_R):
            a0 = r_ * NE_R + k; b0 = r_ * NE_R + (k + 1) % NE_R; F.append((a0, b0, b0 + NE_R, a0 + NE_R))
    for k in range(NE_R): F.append(((nrow - 1) * NE_R + k, (nrow - 1) * NE_R + (k + 1) % NE_R, tipi))
    for k in range(NE_R): F.append(((k + 1) % NE_R, k, basei))
    V = np.array(V); UVc = np.array(UVc); front = np.array(front)
    ob = make_obj('ear.' + tag, V, F, np.zeros((len(V), 2)), 'ear.' + tag)
    # smooth geometric normals, then UVs: the front (inner) face reads the ear chart, the rest the fur ramp
    me = ob.data; me.update(); Vv, Nn = mesh_vn(ob)
    occ = .12 * ao(head_sdf, Vv, Nn, .03)
    ruv = ramp_uv('fur', sval(Nn, occ, hi=.14, lo=.24)); cuv = au('ear', UVc[:, 0], UVc[:, 1])
    lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
    uvs = np.zeros((len(me.loops), 2), np.float32)
    for poly in me.polygons:
        vids = list(poly.vertices); use_c = front[vids].all()
        for li in poly.loop_indices: uvs[li] = cuv[lv[li]] if use_c else ruv[lv[li]]
    me.uv_layers['Atlas'].data.foreach_set('uv', uvs.ravel())
    Pf, _, _ = ear_spine(np.array([EAR_L1 - EAR_BASE + EAR_RB * EAR_PHI / 2, EAR_LEN]))
    ear_info[s] = dict(base=fr.world(np.array([0, 0, EAR_BASE]) * W), fold=fr.world(np.array([0, Pf[0, 1], Pf[0, 0]]) * W),
                       tip=fr.world(np.array([0, Pf[1, 1], Pf[1, 0]]) * W))
    LOG['ear_tip_z_W_' + tag] = round(float((ear_info[s]['tip'][2] - CHIN) / W), 3)

# ================================================================ BROWS: raised cream beans just under the band
# the sheet: the inner end (0.12 W from the midline, z 0.55) round and thick, arching over (top z 0.644 at x 0.22) to a
# tapered outer end (x 0.32, z 0.53); about 0.05 W thick, standing ~0.02 W proud
BROW_C2 = np.array([(.136, .572), (.164, .601), (.198, .616), (.234, .619), (.268, .609), (.296, .591), (.316, .568)])
brow_info = {}
def skin_ribbon(name, group, S, n, hw, hp, ramp, sink=.0, nls=12, shade=(.20, .22), occ=None):
    """a rounded bean lying on a skin curve: S (n,3) skin points, n normals, half-width hw, proud height hp (arrays)"""
    tg = np.gradient(S, axis=0); tg = unit(tg - n * (tg * n).sum(1, keepdims=True)); sd = unit(np.cross(n, tg))
    V = []; NV = []; m = len(S)
    for i in range(m):
        for k in range(nls):
            a = 2 * PI * k / nls; ca, sa = math.cos(a), math.sin(a)
            up = hp[i] * (sa if sa > 0 else .35 * sa)
            V.append(S[i] + sd[i] * hw[i] * spow(np.array(ca), .85) + n[i] * (up - sink))
            NV.append(unit(sd[i] * ca / max(hw[i], 1e-4) + n[i] * sa / max(hp[i], 1e-4)))
    V = np.array(V); NV = np.array(NV)
    caps = []
    for end, j, dirn in ((0, 0, -1), (1, m - 1, 1)):
        rr = []
        for kk in (1, 2):
            f_ = kk / 3; c_ = S[j] + dirn * tg[j] * hw[j] * .55 * math.sin(f_ * PI / 2) + n[j] * (.15 * hp[j] - sink)
            ring = []
            for k in range(nls):
                a = 2 * PI * k / nls; ca, sa = math.cos(a), math.sin(a); up = hp[j] * (sa if sa > 0 else .35 * sa)
                ring.append(len(V)); V = np.vstack([V, c_ + (sd[j] * hw[j] * ca + n[j] * up) * math.cos(f_ * PI / 2)])
                NV = np.vstack([NV, unit(dirn * tg[j] * math.sin(f_ * PI / 2) + (sd[j] * ca + n[j] * sa) * math.cos(f_ * PI / 2))])
            rr.append(ring)
        tip = len(V); V = np.vstack([V, S[j] + dirn * tg[j] * hw[j] * .55 + n[j] * (.15 * hp[j] - sink)]); NV = np.vstack([NV, dirn * tg[j]])
        caps.append((rr, tip))
    F = []
    for i in range(m - 1):
        for k in range(nls):
            a_, b_ = i * nls + k, i * nls + (k + 1) % nls; F.append((a_, b_, b_ + nls, a_ + nls))
    for (rr, tip), base_row in zip(caps, (0, m - 1)):
        rows = [list(range(base_row * nls, base_row * nls + nls))] + rr
        for r0, r1 in zip(rows, rows[1:]):
            for k in range(nls): F.append((r0[k], r0[(k + 1) % nls], r1[(k + 1) % nls], r1[k]))
        for k in range(nls): F.append((rows[-1][k], rows[-1][(k + 1) % nls], tip))
    o = occ(V, NV) if occ is not None else 0.
    return make_obj(name, V, F, ramp_uv(ramp, sval(NV, o, hi=shade[0], lo=shade[1])), group, NV)
for s, tag in ((-1, 'R'), (1, 'L')):
    L_ = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(BROW_C2, axis=0), axis=1))]); tt = np.linspace(0, L_[-1], 22)
    x = s * np.interp(tt, L_, BROW_C2[:, 0]) * W; z = CHIN + np.interp(tt, L_, BROW_C2[:, 1]) * W
    y = front_hit(x, z); S = np.stack([x, y, z], -1); n = grad_n(S); u = tt / tt[-1]
    hw = W * (.037 - .014 * smooth(.25, 1., u))
    hp = W * (.023 - .008 * smooth(.3, 1., u))
    bob = skin_ribbon('brow.' + tag, 'head', S, n, hw, hp, 'brow', sink=.004 * W, shade=(.16, .26))
    LOG['brow_crest_sdf_mm_' + tag] = [round(float(v) * 1000, 2) for v in head_sdf(S + n * (hp - .004 * W)[:, None])[::5]]
    LOG['brow_n_dot_out_' + tag] = round(float(((S - O) * n).sum(1).min()), 4)
    brow_info[tag] = [float(v) for v in S[len(S) // 2]]

# ================================================================ THE BANDANA: a rounded band swept round the skull
def build_headband():
    NPH = 80; NPR = 10
    a = np.linspace(0, 2 * PI, NPR, endpoint=False)
    ph_ = spow(np.cos(a), .45); pt_ = spow(np.sin(a), .45)         # a soft rounded-rectangle section
    C_ax = np.array([0, HY, 0.]); C_ax[2] = BAND_P0[2] - (HY - BAND_P0[1]) * math.tan(TAU)
    V = []; rows = []
    phis = np.linspace(0, 2 * PI, NPH, endpoint=False)
    for ph in phis:
        dirv = -HEY * math.cos(ph) + HEX * math.sin(ph)             # 0 = the front
        hb = BAND_HB + (BAND_HB_BACK - BAND_HB) * (1 - math.cos(ph)) / 2
        sag = BAND_SAG * abs(math.sin(ph)) ** 2.2
        o = C_ax[None, :] + HEZ[None, :] * (ph_[:, None] * hb) - np.array([0, 0, 1.]) * sag
        S = ray_outer(head_sdf, o, np.repeat(dirv[None], NPR, 0), t0=.0, t1=.6)
        N = grad_n(S)
        P = S + N * (-.003 + (BAND_T + .003) * (.5 + .5 * pt_)[:, None])
        rows.append(list(range(len(V), len(V) + NPR))); V += list(P)
    F = []
    for i in range(NPH):
        a_, b_ = rows[i], rows[(i + 1) % NPH]
        for k in range(NPR): F.append((a_[k], a_[(k + 1) % NPR], b_[(k + 1) % NPR], b_[k]))
    ob = make_obj('bandana', np.array(V), F, np.zeros((len(V), 2)), 'band')
    def bshade(Vv, Nn):
        o = np.zeros(len(Vv))
        for s in (-1, 1): o += .08 * np.exp(-(np.linalg.norm(Vv - EAR_C[s], axis=-1) / (.10 * W)) ** 2)
        return sval(Nn, o, hi=.18, lo=.26)
    ramp_by_normal(ob, 'band', bshade)
    return ob, C_ax
band_ob, BAND_AX = build_headband()

# ================================================================ BODY: the torso (shirt over a trouser seat)
TR = ([0, .000, .190], [.228, .188, .105], (2.8, 2.4, 2.2))     # the trousers' seat (z 0.085-0.295)
TS = ([0, .005, .345], [.203, .205, .160], (2.6, 2.4, 2.2))     # the shirt barrel
TH = ([0, .006, .262], [.226, .214, .055])                       # the shirt's flared hem
TC = ([0, .012, .450], [.170, .165, .075])                       # the chest and shoulders under the kerchief
def torso_sdf(p): return smin(smin(smin(sell(p, *TR), sell(p, *TS), .05), ell(p, *TH), .04), ell(p, *TC), .06)
Z_EDGE = .241                                   # the shirt / trousers colour edge (under the rolled hem)
def body_ray(theta, z, f=torso_sdf):
    theta = np.asarray(theta, float); z = np.asarray(z, float) * np.ones_like(theta)
    d = np.stack([np.sin(theta), -np.cos(theta), np.zeros_like(theta)], -1)
    o = np.stack([np.zeros_like(theta), np.full_like(theta, .005), z], -1)
    lo = np.zeros(len(theta)); hi = np.full(len(theta), .6)
    for _ in range(36):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0; lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    P = o + d * ((lo + hi) / 2)[:, None]; return P, grad(f, P)
def build_torso():
    OT = np.array([0, .005, Z_EDGE]); NS = 64
    el = np.radians([-86, -74, -62, -51, -41, -32, -24, -17, -11, -5, 0, 5, 11, 17, 24, 31, 39, 48, 58, 69, 80])
    az = np.linspace(0, 2 * PI, NS, endpoint=False)
    D = np.stack([np.cos(el)[:, None] * np.sin(az)[None], -np.cos(el)[:, None] * np.cos(az)[None], np.sin(el)[:, None] * np.ones(NS)[None]], -1).reshape(-1, 3)
    D = np.concatenate([D, [[0, 0, -1.], [0, 0, 1.]]])
    P = ray_outer(torso_sdf, OT, D, t1=.6); P[:-2][np.abs(np.repeat(el, NS)) < 1e-9, 2] = Z_EDGE
    N = grad(torso_sdf, P)
    occ = .30 * ao(lambda q: head_sdf(q), P, N, .05)
    val = sval(N, occ, hi=.20, lo=.24)
    ne = len(el); F = []; UV = []
    def vid(i, j): return i * NS + j % NS
    bot, top = len(P) - 2, len(P) - 1
    def add(f):
        zc = P[list(f), 2].mean(); rp = 'trou' if zc < Z_EDGE - 1e-6 else 'shirt'
        F.append(f); UV.append([tuple(ramp_uv(rp, val[k:k + 1])[0]) for k in f])
    for i in range(ne - 1):
        for j in range(NS): add((vid(i, j), vid(i, j + 1), vid(i + 1, j + 1), vid(i + 1, j)))
    for j in range(NS): add((vid(0, j + 1), vid(0, j), bot))
    for j in range(NS): add((vid(ne - 1, j), vid(ne - 1, j + 1), top))
    return make_obj('torso', P, F, UV, 'body', N)
torso_ob = build_torso()

def build_band_ring(name, zc, prof, th0, th1, group, ramp, closed):
    th = np.linspace(th0, th1, 72, endpoint=not closed); V = []; rows = []
    for dz, t in prof:
        B, N = body_ray(th, zc + dz); Nh = unit(N * np.array([1, 1, .3])); rows.append(list(range(len(V), len(V) + len(th)))); V += list(B + Nh * t)
    F = []; n = len(th)
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(n if closed else n - 1): F.append((a_[i], a_[(i + 1) % n], b_[(i + 1) % n], b_[i]))
    ob = make_obj(name, np.array(V), F, np.zeros((len(V), 2)), group)
    ramp_by_normal(ob, ramp, lambda Vv, Nn: sval(Nn, .25 * ao(head_sdf, Vv, Nn, .05), hi=.18, lo=.24))
    return ob
# the shirt's rolled hem: a soft lip standing 10 mm off the trousers at z 0.241 (the sheet's shirt edge)
build_band_ring('shirt_hem', Z_EDGE, [(-.006, -.002), (-.005, .004), (-.002, .008), (.003, .010), (.009, .010), (.015, .008),
                                      (.020, .005), (.025, .002), (.030, -.001)], 0, 2 * PI, 'body', 'shirt', True)

R_REF = .21
def cloth_point(s, z, t):
    s = np.asarray(s, float); z = np.asarray(z, float); B, N = body_ray(s / R_REF, z)
    tt = np.asarray(t, float)[..., None] if np.ndim(t) else t
    return B + N * tt, N
def resample(poly, step):
    seg = np.linalg.norm(np.roll(poly, -1, 0) - poly, axis=1); L = np.concatenate([[0], np.cumsum(seg)])
    n = max(8, int(round(L[-1] / step))); t = np.linspace(0, L[-1], n, endpoint=False)
    P = np.concatenate([poly, poly[:1]]); return np.stack([np.interp(t, L, P[:, 0]), np.interp(t, L, P[:, 1])], -1)
def in_poly2(P, poly):
    x = P[:, 0]; y = P[:, 1]; inside = np.zeros(len(P), bool); n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        inside ^= ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-30) + x1)
    return inside
def cloth_slab(name, outline, t_front, t_back, group, ramp, step=.012, grid=(.020, .020), shade_k=(.18, .24)):
    """a thick cloth panel: CDT of its (s, z) outline, front and back faces wrapped on the torso, a rounded rim"""
    out = resample(outline, step)
    def area(p): return .5 * np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1])
    if area(out) < 0: out = out[::-1]
    lo = out.min(0) - .02; hi = out.max(0) + .02
    gx, gz = np.meshgrid(np.arange(lo[0], hi[0], grid[0]), np.arange(lo[1], hi[1], grid[1]))
    G = np.stack([gx.ravel(), gz.ravel()], -1); G[:, 0] += grid[0] / 2 * (np.round((G[:, 1] - lo[1]) / grid[1]) % 2)
    ok = in_poly2(G, out)
    def dist_to(Pp, loop):
        d = np.full(len(Pp), 9.)
        for i in range(len(loop)):
            a = loop[i]; b = loop[(i + 1) % len(loop)]; ab = b - a; t = np.clip(((Pp - a) @ ab) / (ab @ ab), 0, 1)
            d = np.minimum(d, np.linalg.norm(Pp - (a + t[:, None] * ab), axis=1))
        return d
    ok &= dist_to(G, out) > step * .8
    G = G[ok]; P2 = np.concatenate([out, G]); nO = len(out)
    res = delaunay_2d_cdt([Vector(p) for p in P2], [(i, (i + 1) % nO) for i in range(nO)], [], 0, 1e-9)
    vout = np.array([[v.x, v.y] for v in res[0]]); Fo = np.array([list(f) for f in res[2]])
    assert len(vout) == len(P2), name + ' CDT merged points'
    Fo = Fo[in_poly2(vout[Fo].mean(1), out)]; n2 = len(vout)
    tf = t_front(vout[:, 0], vout[:, 1]); tb = t_back(vout[:, 0], vout[:, 1])
    Pf, _ = cloth_point(vout[:, 0], vout[:, 1], tf); Pb, _ = cloth_point(vout[:, 0], vout[:, 1], tb)
    V = list(Pf) + list(Pb)
    F = [tuple(f) for f in Fo] + [tuple(n2 + f[::-1]) for f in Fo]
    L2 = vout[:nO]; tang = np.roll(L2, -1, 0) - np.roll(L2, 1, 0); m = unit(np.stack([tang[:, 1], -tang[:, 0]], -1))
    rows = [list(range(0, nO))]; Rr = 4
    tF = t_front(L2[:, 0], L2[:, 1]); tB = t_back(L2[:, 0], L2[:, 1]); tmid = (tF + tB) / 2; hh = (tF - tB) / 2
    for j in range(1, Rr):
        ph = PI * j / Rr; q = L2 + m * (hh * .9 * math.sin(ph))[:, None]
        Pj, _ = cloth_point(q[:, 0], q[:, 1], tmid + hh * math.cos(ph))
        rows.append(list(range(len(V), len(V) + nO))); V += list(Pj)
    rows.append(list(range(n2, n2 + nO)))
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(nO): F.append((a_[i], b_[i], b_[(i + 1) % nO], a_[(i + 1) % nO]))
    ob = make_obj(name, np.array(V), F, np.zeros((len(V), 2)), group)
    ramp_by_normal(ob, ramp, lambda Vv, Nn: sval(Nn, .22 * ao(head_sdf, Vv, Nn, .05), hi=shade_k[0], lo=shade_k[1]))
    return ob, out
# the placket: a thin overlapping front panel, its left edge the sheet's centre line (below the knot to the hem)
def _placket_outline():
    x0, x1, z0, z1, rb = -.006, .040, Z_EDGE + .006, .425, .010
    pts_ = [(x0, z1), (x0, z0 + rb)] + [(x0 + rb - rb * math.cos(a), z0 + rb - rb * math.sin(a)) for a in np.linspace(0, PI / 2, 5)[1:]]
    pts_ += [(x1 - rb + rb * math.sin(a), z0 + rb - rb * math.cos(a)) for a in np.linspace(0, PI / 2, 5)] + [(x1, z1)]
    return np.array(pts_)
placket_ob, _ = cloth_slab('placket', _placket_outline(), lambda s, z: np.full(np.shape(s), .0042), lambda s, z: np.full(np.shape(s), -.001),
                           'body', 'shirt', step=.008, grid=(.014, .016), shade_k=(.18, .22))

# ================================================================ THE KERCHIEF: a soft band round the neck, a knot, two lobes
KC = dict(rx=.163, ryf=.200, ryb=.160, yc=.012, zs=.508, zf=.474, zb=.500, hh=.026, ht=.014)
def kerchief_centre(t):
    c = math.cos(t); y = KC['yc'] - (KC['ryf'] if c > 0 else KC['ryb']) * c
    fa = min(1., abs(math.atan2(math.sin(t), c)) / (PI / 2)) if c > 0 else 1.        # 0 at the front centre, 1 at the sides
    zc = KC['zf'] + (KC['zs'] - KC['zf']) * smooth(0, 1, fa ** .85) * (fa ** .15) + (KC['zb'] - KC['zs']) * max(-c, 0) ** 1.5
    return np.array([KC['rx'] * math.sin(t), y, zc])
def build_kerchief():
    NT, NS = 60 if not FAST else 48, 12
    th = np.linspace(0, 2 * PI, NT, endpoint=False); G = np.zeros((NT, NS, 3))
    for i, t in enumerate(th):
        c = kerchief_centre(t); tg = unit(kerchief_centre(t + 1e-3) - kerchief_centre(t - 1e-3))
        out = unit(np.cross(tg, np.array([0, 0, 1.])))
        if out @ (c - np.array([0, KC['yc'], c[2]])) < 0: out = -out
        upv = unit(np.cross(out, tg))
        if upv[2] < 0: upv = -upv
        front = max(math.cos(t), 0)
        hh = KC['hh'] * (1 - .30 * front ** 2.5) * (1 + .04 * math.sin(3 * t + .4)); ht = KC['ht'] * (1 + .25 * front)
        upv = unit(upv - out * .35)                             # lies on the sloping shoulders (top edge tucked in)
        for k in range(NS):
            a = 2 * PI * k / NS; ca, sa = math.cos(a), math.sin(a)
            G[i, k] = c + out * (ht * float(spow(np.array(ca), .85))) + upv * (hh * float(spow(np.array(sa), .9)))
    du = np.roll(G, -1, 0) - np.roll(G, 1, 0); dv = np.roll(G, -1, 1) - np.roll(G, 1, 1); Nn = unit(np.cross(du, dv))
    cen = np.array([0, KC['yc'], KC['zs']])
    if ((Nn * (G - cen)).sum(-1) < 0).mean() > .5: Nn = -Nn
    V = G.reshape(-1, 3); NV = Nn.reshape(-1, 3); F = []
    for i in range(NT):
        for k in range(NS):
            a_ = i * NS + k; b_ = ((i + 1) % NT) * NS + k; c_ = ((i + 1) % NT) * NS + (k + 1) % NS; d_ = i * NS + (k + 1) % NS
            F.append((a_, b_, c_, d_))
    val = sval(NV, .35 * ao(head_sdf, V, NV, .035), hi=.18, lo=.24)
    return make_obj('kerchief_band', V, F, ramp_uv('kerch', val), 'kerchief', NV)
kerchief_ob = build_kerchief()
KNOT_C = np.array([0, -.214, .470]); KNOT_R = [.037, .030, .035]
def knot_sdf(p): return sell(p, KNOT_C, KNOT_R, (2.1, 2.0, 2.1))
sdf_ball('kerchief_knot', knot_sdf, KNOT_C, 7 if not FAST else 6, 'kerchief', 'kerch', occ_f=head_sdf, t1=.10)
kerchief_end_info = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    Ce = np.array([s * .050, -.211, .400]); rl = math.radians(30) * s; tl = math.radians(-14)
    Rz = np.array([[math.cos(rl), 0, -math.sin(rl)], [0, 1, 0], [math.sin(rl), 0, math.cos(rl)]])   # roll about y
    Rx = np.array([[1, 0, 0], [0, math.cos(tl), -math.sin(tl)], [0, math.sin(tl), math.cos(tl)]])   # the lobe hangs forward
    R = Rx @ Rz
    rad = np.array([.041, .015, .054])
    def end_sdf(p, Ce=Ce, R=R, rad=rad):
        q = (p - Ce) @ R; v = np.clip(-q[..., 2] / rad[2], -1, 1)
        taper = 1 - .50 * np.clip(v, 0, 1) ** 1.6 - .18 * np.clip(-v, 0, 1) ** 2               # a leaf: round shoulder, soft point below
        q = np.stack([q[..., 0] / np.maximum(taper, .2), q[..., 1] / (1 - .35 * np.clip(np.abs(v), 0, 1) ** 2), q[..., 2]], -1)
        return sell(q, [0, 0, 0], rad, (2.2, 2.0, 2.2)) * np.minimum(taper, 1)
    sdf_ball('kerchief_end.' + tag, end_sdf, Ce, 7 if not FAST else 6, 'kerchief_end.' + tag, 'kerch',
             scale=(.8, .3, 1.1), frame=Frame(Ce, R[:, 0], R[:, 1], R[:, 2]), occ_f=knot_sdf, occ_k=.25, t1=.12)
    kerchief_end_info[tag] = dict(top=[float(v) for v in Ce + R @ np.array([0, 0, rad[2]])], tip=[float(v) for v in Ce - R @ np.array([0, 0, rad[2]])])

# ================================================================ THE TAIL: a thick hook curling up from the seat
TAIL_PTS = [np.array([0, .150, .200]), np.array([0, .205, .212]), np.array([-.006, .244, .236]), np.array([-.018, .262, .266]),
            np.array([-.030, .266, .288])]
tail_ob, _ = tube('tail', TAIL_PTS, [(0., .050, 'fur'), (.30, .050, 'fur'), (.55, .049, 'fur'), (.80, .046, 'fur'), (1., .044, 'fur')],
                  'tail', sides=18, cap_rows=7, cap_len=1.0, occ_f=torso_sdf, occ_k=.30)

# ================================================================ ARMS (puffed short sleeves + fur) and LEGS (trousers + cuffs) + FEET
joint_arms = {}; joint_legs = {}
ARM_DEG = 36.
for s, tag in ((-1, 'R'), (1, 'L')):
    sh = np.array([s * .180, .018, .445]); a = math.radians(ARM_DEG)
    dvec = unit(np.array([s * math.sin(a), -.04, -math.cos(a)]))
    root = sh - dvec * .06; elbow = sh + dvec * .118; wrist = sh + dvec * .215
    pts_ = [root, sh, elbow + np.array([0, -.004, 0]), wrist]
    # t runs over the root -> wrist spline (0.295 m): the puffed sleeve to its rolled hem ~0.07 m below the shoulder
    rows = [(0., .084, 'shirt'), (.10, .094, 'shirt'), (.20, .099, 'shirt'), (.30, .099, 'shirt'), (.37, .095, 'shirt'),
            (.405, .089, 'shirt'), (.425, .092, 'shirt'), (.445, .091, 'shirt'), (.462, .086, 'shirt'), (.470, .078, 'shirt'),
            (.477, .070, 'fur'), (.50, .066, 'fur'), (.60, .063, 'fur'), (.75, .064, 'fur'), (.86, .067, 'fur'), (.95, .069, 'fur'), (1., .070, 'fur')]
    def paw_grooves(V, NV, wrist=wrist, dvec=dvec):
        v = V - wrist; ax = v @ dvec; rad = v - np.outer(ax, dvec)
        f0 = np.array([0, -1., 0]); f0 = unit(f0 - dvec * (f0 @ dvec)); f1 = np.cross(dvec, f0)
        ang = np.arctan2(rad @ f1, rad @ f0)
        g = sum(np.exp(-((ang - a_) / .16) ** 2) for a_ in (-.42, .42))
        return .16 * g * smooth(.030, .065, ax)
    tube('arm.' + tag, pts_, rows, 'arm.' + tag, sides=24, cap_rows=8, cap_len=1.0, squash=.94, occ_f=torso_sdf, extra_occ=paw_grooves)
    joint_arms[tag] = {'shoulder': [float(v) for v in sh], 'elbow': [float(v) for v in elbow], 'wrist': [float(v) for v in wrist],
                       'paw_tip': [float(v) for v in wrist + dvec * .070]}
FOOT = dict(r=[.097, .137, .052], p=(2.8, 2.9, 2.2), pzlo=4.0, rzlo=.044)
def foot_sdf_s(s):
    c = np.array([s * .125, -.022, .044])
    def f(p):
        d = sell(p, c, FOOT['r'], FOOT['p'], FOOT['pzlo'], FOOT['rzlo'])
        for k in (-1, 1):            # two shallow toe grooves on the front of the foot (three toes)
            g = ell(p, c + np.array([k * .032, -.152, .042]), [.0062, .022, .046])
            d = smax(d, -g, .006)
        return d
    return f, c
LEG_SQ = 1.10
for s, tag in ((-1, 'R'), (1, 'L')):
    hip = np.array([s * .104, .000, .160]); knee = np.array([s * .106, -.002, .105]); ankle = np.array([s * .112, -.006, .055])
    pts_ = [hip + np.array([0, 0, .045]), hip, knee, ankle]
    # t over the spline (z 0.205 -> 0.055): baggy trouser leg, the rolled cuff (z 0.077-0.100), then the fur ankle in the foot
    rows = [(0., .092, 'trou'), (.25, .096, 'trou'), (.50, .096, 'trou'), (.62, .094, 'trou'), (.66, .093, 'trou'),
            (.675, .097, 'trou'), (.69, .100, 'trou'), (.75, .101, 'trou'), (.81, .100, 'trou'), (.835, .096, 'trou'),
            (.845, .089, 'trou'), (.852, .080, 'fur'), (.90, .074, 'fur'), (1., .074, 'fur')]
    tube('leg.' + tag, pts_, rows, 'leg.' + tag, sides=20, cap_rows=3, cap_len=.5, squash=LEG_SQ, occ_f=torso_sdf, occ_k=.25)
    ff, fc = foot_sdf_s(s)
    def foot_shade(P, N, ff=ff, fc=fc):
        lat = (P[:, 0] - fc[0]) / .097; frontz = smooth(-.09, -.13, P[:, 1] - fc[1]) * smooth(.008, .025, P[:, 2]) * smooth(.080, .060, P[:, 2])
        groove = sum(np.exp(-((lat - k * .33) / .05) ** 2) for k in (-1, 1)) * frontz
        return sval(N, .24 * groove)
    sdf_ball('foot.' + tag, ff, fc + np.array([0, 0, .01]), 8, 'leg.' + tag, 'fur', shade=foot_shade, t1=.3)
    joint_legs[tag] = {'hip': [float(v) for v in hip], 'knee': [float(v) for v in knee], 'ankle': [float(v) for v in ankle],
                       'toe': [float(fc[0]), float(fc[1] - .13), .040]}

# hidden surface: the parts buried in the head / torso
LOG['culled_faces'] = {}
def _mn(*fs): return lambda p: np.minimum.reduce([f(p) for f in fs])
CULL = {'ear.': (head_sdf, .008), 'kerchief_band': (_mn(head_sdf, torso_sdf), .004), 'tail': (torso_sdf, .008),
        'arm.': (torso_sdf, .012), 'leg.': (torso_sdf, .012), 'torso': (head_sdf, .010)}
for g, obs in parts.items():
    for ob in obs:
        for key, (f_, m_) in CULL.items():
            if ob.name.startswith(key): LOG['culled_faces'][ob.name] = cull_buried(ob, f_, m_); break

# ================================================================ PAINTED ATLAS (2048, deterministic PNG)
def stroke(x, z, P, half, aa):
    best = np.full(len(x), 9.)
    for i in range(len(P) - 1):
        a = P[i]; b = P[i + 1]; ab = b - a; L2 = ab @ ab
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        dx = x - (a[0] + t * ab[0]); dz = z - (a[1] + t * ab[1])
        best = np.minimum(best, np.sqrt(dx * dx + dz * dz) - (half[i] * (1 - t) + half[i + 1] * t))
    return 1 - smooth(-aa, aa, best)
def lash_shade_alpha(x, z, fr):
    """a thin soft contact shade on the skin along the ribbon's centre line (front projection)"""
    a = np.zeros(len(x))
    for s in (-1, 1):
        X = s * (x - s * EX); near = (np.abs(X) < EHW * 1.9) & (np.abs(z - EZ) < EHH * 1.7) & (fr > 0)
        if not near.any(): continue
        P = np.stack([s * EX + s * EHW * LASH_C2[:, 0], EZ + EHH * LASH_C2[:, 1]], -1)
        P[:, 0] *= 1; Pl = P.copy(); Pl[:, 0] = s * (P[:, 0] - s * EX)       # in mirrored local x
        a[near] = np.maximum(a[near], stroke(X[near], z[near], np.stack([Pl[:, 0], P[:, 1]], -1), LASH_HW * EHH * .55, .0030 * W))
    return a
def paint_face(U, V):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = radial_hit(d); n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    fr = smooth(HY + .02, HY - .08, y)
    C = ramp_colour('fur', head_shade(P, n))
    # the muzzle: a clean oval in the front view with a soft 2-3 mm border, its own soft light
    rm = np.sqrt((x / MUZ_HW) ** 2 + ((z - MUZ_C) / MUZ_HH) ** 2)
    C = mix(C, ramp_colour('muz', sval(n, 0., hi=.16, lo=.17)), (1 - smooth(.975, 1.022, rm)) * fr * PAINT_OPTS['muzzle'])
    # blush ovals (soft)
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .96 * (1 - smooth(.62, 1.12, r)) * fr * PAINT_OPTS['blush'])
    # the "w" smile (0.178 W wide: the corners curl up to z 0.228 W, the lobes dip to 0.184, the cusp at 0.214) and the philtrum
    lw = .0046 * W
    for s_ in (-1, 1):
        u_ = np.linspace(0, 1, 31)
        Pm = np.stack([s_ * MHW * u_, CHIN + W * (.214 - .030 * np.sin(PI * u_) ** .8 + .014 * u_ ** 4)], -1)
        half = np.full(len(Pm), lw); half[-1] = lw * .55; half[-2] = lw * .8
        ib = (np.abs(x) < .12 * W) & (np.abs(z - MZM) < .05 * W) & (fr > 0)
        a = np.zeros(len(x)); a[ib] = stroke(x[ib], z[ib], Pm, half, .0026 * W); C = mix(C, rgb('mouth'), .96 * a)
    Pp = np.array([(0, NOSE_BOT + .004 * W), (0, CHIN + .214 * W)]); ib = (np.abs(x) < .03 * W) & (np.abs(z - MZM) < .07 * W) & (fr > 0)
    a = np.zeros(len(x)); a[ib] = stroke(x[ib], z[ib], Pp, np.array([lw * .9, lw]), .0026 * W); C = mix(C, rgb('mouth'), .96 * a)
    # the lash itself is the ribbon object: only a thin contact shade under it, and the thin lower lid line
    # round 2 (rig): no lash shade and no lower lid line on the skin: when a lid closes they would leave a dark ring round the
    # shut eye (the coordinator's lesson); the eyeball's own dark contact rim draws the open eye's outline
    for s in (-1, 1) if SKIN_LID_LINES else ():
        sr, psi, X, Z = eye_s(s, x, z); near = fr * (sr < 1.9)
        upw = smooth(-.14, -.05, psi) * (psi > -1.2)
        low = (1 - smooth(1.022, 1.040, sr)) * (1 - upw)
        C = mix(C, rgb('lash'), low * .80 * near * PAINT_OPTS['band'])
    return C.reshape(sh + (3,))

def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .245; iz = .03; irx = .73; irz = .89          # the sheet: the iris 0.73 x 0.89 of the opening, against the nose side
    C = mix(rgb('sclera'), rgb('#E9DDD3'), .45 * smooth(.35, .95, Z))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#4E7398'), rgb('#2E4A6A'), smooth(-.85, .25, ez))           # lighter blue low, deeper under the lid
    I = mix(I, rgb('#22344C'), smooth(.80, 1.0, r) * .60)
    I = I * (1 - .025 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 26 + r * 9)))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    pz = iz + .10; px_ = ix - s * .10; R = np.sqrt(((X - px_) / (.59 * irx)) ** 2 + ((Z - pz) / (.72 * irz)) ** 2)
    C = mix(C, rgb('pupil'), .85 * (1 - smooth(.90, 1.10, R)))
    hx = ix - s * .05; hz = iz + .39                     # the big round catchlight high in the iris (the sheet: 0.30 eye radii)
    big = np.sqrt(((X - hx) / .29) ** 2 + ((Z - hz) / .31) ** 2)
    small = np.sqrt(((X - (ix + s * .32 * irx)) / (.07 * irx)) ** 2 + ((Z - (iz - .48 * irz)) / (.06 * irz)) ** 2)
    C = mix(C, rgb('#FFFAF4'), np.maximum(1 - smooth(.92, 1.08, big), .85 * (1 - smooth(.88, 1.12, small))))
    C = mix(C, rgb('lash'), smooth(.945, .995, sr) * (.45 + .55 * smooth(-.2, .5, Z)))  # the lid contact rim
    return C

def paint(chart, U, V):
    if chart == 'cavity':
        return mix(rgb('#5a1e22'), rgb('#3e1418'), .5 * smooth(.3, 1, V))
    if chart == 'tongue':
        C = mix(rgb('#e88a96'), rgb('#f2a2ac'), .5 * smooth(.2, .9, V)); return mix(C, rgb('#d07080'), .35 * np.exp(-((U - .5) / .05) ** 2))
    if chart.startswith('lid'): return np.broadcast_to(rgb('fur'), U.shape + (3,)).copy()     # repainted by the rig
    if chart == 'face': return paint_face(U, V)
    if chart == 'eye.L': return paint_eye(U, V, 1)
    if chart == 'eye.R': return paint_eye(U, V, -1)
    if chart == 'ear':
        # u across the flap (0.5 = the spine), v along it (0 buried base .. 1 tip): pink inside a grey rim, the tip grey
        xn = np.abs(2 * U - 1)
        C = ramp_colour('fur', clamp(.50 + .04 * V))
        Ci = ramp_colour('inner', clamp(.53 - .14 * smooth(.40, .75, V) - .05 * smooth(.30, .70, xn)))
        m = (1 - smooth(.58, .70, xn)) * smooth(.08, .14, V) * (1 - smooth(.84, .92, V))
        return mix(C, Ci, m)
    if chart == 'nose':
        a = (U - .5) * .16 * W; b = (V - .5) * .16 * W
        C = ramp_colour('nose', .45 + .10 * smooth(-.02, .02, b))
        hl = np.exp(-(((a + .016 * W) / (.016 * W)) ** 2 + ((b - .012 * W) / (.009 * W)) ** 2))
        return mix(C, rgb('#6A6872'), .55 * hl)
    raise KeyError(chart)

atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [184, 176, 168, 255]
for name, (x0, y0, w, h) in CHARTS.items():
    U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
    if name == 'face':
        block = np.empty((h, w, 3))
        for r0 in range(0, h, 128): block[r0:r0 + 128] = paint(name, U[r0:r0 + 128], V[r0:r0 + 128])
    elif name == 'ramp':
        Uc, Vc = np.meshgrid((np.arange(w) - 8) / (w - 16), (np.arange(h)) / 1.)
        block = np.zeros((h, w, 3)); block[:] = rgb('fur')
        for nm_, k in RAMP_ROWS.items(): block[k * 32:(k + 1) * 32] = ramp_colour(nm_, clamp(Uc[k * 32:(k + 1) * 32]))
    else:
        block = paint(name, U, V)
    atlas[y0:y0 + h, x0:x0 + w, :3] = np.round(clamp(block) * 255).astype(np.uint8)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
atlas_path = os.path.join(ROOT, 'scratch' if FAST else '', 'sk-kaizo-toy_rig_atlas.png' if RIG else 'sk-kaizo-toy_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Kaizo_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Kaizo_toy_atlas'); MAT.use_nodes = True
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
ALL = all_verts([o for g in parts.values() for o in g]); BV = all_verts(parts['band'])
rimL = np.array([verts[i] for i in roll_info[1][0]])
EV = {s: all_verts(parts['ear.' + ('L' if s > 0 else 'R')]) for s in (-1, 1)}
def band_front_edges():
    zs = np.linspace(CHIN + .45 * W, CHIN + .80 * W, 700); fr_ = front_hit(np.zeros_like(zs), zs)
    P = np.stack([np.zeros_like(zs), fr_, zs], -1); q = band_q(P); ins = np.abs(q) < BAND_HB
    return [round(float((zs[ins].min() - CHIN) / W), 3), round(float((zs[ins].max() - CHIN) / W), 3)] if ins.any() else None
MEAS = {'units': 'W = %.3f m face width at the cheeks; front-view z above the chin, profile y from the head centre (W)' % W,
        'total_height_m': round(float(ALL[:, 2].max()), 4), 'lowest_z_m': round(float(ALL[:, 2].min()), 5), 'chin_m': CHIN,
        'head_width_W_at_z': {str(z): width_at(z) for z in (.02, .062, .097, .131, .166, .20, .234, .269, .303, .338, .372, .407, .441, .476, .50, .55, .60, .65, .70)},
        'profile_front_W_at_z': {str(z): prof_front(z) for z in (.02, .04, .06, .10, .13, .16, .19, .22, .25, .28, .31, .34, .37, .40, .45, .50, .55, .60, .65, .70, .75, .80)},
        'profile_back_W_at_z': {str(z): back_at(z) for z in (.04, .06, .08, .10, .13, .16, .19, .22, .25, .28, .31, .34, .37, .40, .45, .50, .55, .60, .65, .70, .75, .80)},
        'nose_tip_y_m': round(float(nose_tip[:, 1].min()), 4), 'nose_tip_W_ahead': round(float((HY - nose_tip[:, 1].min()) / W), 3),
        'eye_opening_W': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'eye_centre_W': [round(EX / W, 3), round((EZ - CHIN) / W, 3)],
        'muzzle_oval_W': [round(2 * MUZ_HW / W, 3), round(2 * MUZ_HH / W, 3), round((MUZ_C - CHIN) / W, 3)],
        'nose_W': [round(float(np.ptp(NOSE_OUT[:, 0])) / W, 3), round(float(np.ptp(NOSE_OUT[:, 1])) / W, 3)],
        'band_front_z_W': band_front_edges(), 'band_width_W': round(float(np.ptp(BV[:, 0]) / W), 3),
        'ear_top_m': round(float(max(EV[1][:, 2].max(), EV[-1][:, 2].max())), 4),
        'ear_outer_x_W': round(float(EV[1][:, 0].max() / W), 3),
        'body_width_m': round(float(np.ptp(all_verts(parts['body'])[:, 0])), 3),
        'body_depth_m': [round(float(all_verts(parts['body'])[:, 1].min()), 3), round(float(all_verts(parts['body'])[:, 1].max()), 3)],
        'arm_span_m': round(float(np.ptp(all_verts(parts['arm.L'] + parts['arm.R'])[:, 0])), 3),
        'ear_extent_x_W': [round(float(np.abs(EV[1][:, 0]).min() / W), 3), round(float(np.abs(EV[1][:, 0]).max() / W), 3)],
        'ear_extent_y_W': [round(float((EV[1][:, 1].min() - HY) / W), 3), round(float((EV[1][:, 1].max() - HY) / W), 3)],
        'kerchief_xyz_m': [[round(float(v), 3) for v in all_verts(parts['kerchief']).min(0)], [round(float(v), 3) for v in all_verts(parts['kerchief']).max(0)]],
        'lobe_L_xyz_m': [[round(float(v), 3) for v in all_verts(parts['kerchief_end.L']).min(0)], [round(float(v), 3) for v in all_verts(parts['kerchief_end.L']).max(0)]],
        'tail_xyz_m': [[round(float(v), 3) for v in all_verts(parts['tail']).min(0)], [round(float(v), 3) for v in all_verts(parts['tail']).max(0)]],
        'paw_bottom_z_m': round(float(all_verts(parts['arm.L'])[:, 2].min()), 3),
        'arm_outer_x_m': round(float(all_verts(parts['arm.L'])[:, 0].max()), 3),
        'foot_xyz_m': [[round(float(v), 3) for v in all_verts(parts['leg.L'])[all_verts(parts['leg.L'])[:, 2] < .06].min(0)], [round(float(v), 3) for v in all_verts(parts['leg.L'])[all_verts(parts['leg.L'])[:, 2] < .06].max(0)]],
        'leg_width_m': round(float(np.ptp(all_verts(parts['leg.L'])[:, 0])), 3)}
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
    ob = bpy.context.object; ob.name = 'Kaizo_' + group.replace('.', '_')
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
    piv = {'head': tuple(O), 'band': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'], 'lash.L': eye_centers['L'], 'lash.R': eye_centers['R'],
           'ear.L': tuple(ear_info[1]['base']), 'ear.R': tuple(ear_info[-1]['base']), 'tail': tuple(TAIL_PTS[1]),
           'arm.L': joint_arms['L']['shoulder'], 'arm.R': joint_arms['R']['shoulder'],
           'leg.L': joint_legs['L']['hip'], 'leg.R': joint_legs['R']['hip'], 'kerchief': tuple(KNOT_C),
           'kerchief_end.L': kerchief_end_info['L']['top'], 'kerchief_end.R': kerchief_end_info['R']['top']}.get(group, (0, 0, 0))
    bpy.context.scene.cursor.location = piv; bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    for v in ob.data.vertices: assert all(math.isfinite(c) for c in v.co), 'Nonfinite position'
    for p in ob.data.polygons: assert all(math.isfinite(c) for c in p.normal) and p.normal.length > .5, ('Bad normal', ob.name, p.index)
    ob['phase'] = '1: neutral A-pose, no armature'; ob['front_axis'] = '-Y'; ob['units'] = 'metres'
    ob.data.calc_loop_triangles(); part_tri[group] = len(ob.data.loop_triangles); objects.append(ob)
tri_count = sum(part_tri.values()); print('PART_TRIANGLES', json.dumps(part_tri), tri_count, flush=True)
MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count

ears_j = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    ears_j[tag] = {k: [float(v) for v in ear_info[s][k]] for k in ('base', 'fold', 'tip')}
joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X',
          'hips': [0, .000, .200], 'spine': [0, .005, .300], 'chest': [0, .010, .400], 'neck': [0, .012, .490],
          'head': [float(v) for v in O], 'jaw_pivot': [0, float(HY - .10 * W), float(CHIN + .10 * W)],
          'eyes': eye_centers, 'ears': ears_j, 'arms': joint_arms, 'legs': joint_legs,
          'tail': [[float(v) for v in p_] for p_ in TAIL_PTS[1:]],
          'bandana_anchor': [float(v) for v in BAND_P0], 'brows': brow_info,
          'kerchief_knot': [float(v) for v in KNOT_C], 'kerchief_ends': kerchief_end_info,
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth SDF ball (cranium + cheek mass + dog snout), radially projected, analytic normals.',
                    'Eyelid holes ringed by 5 loops each, rim rolled in behind separate lens eyeballs; 3 loops round the mouth.',
                    'Separate pieces: eyes, lash rolls + wing ticks (origin at the eye centre, for the upper lids), folded ears, hooked tail, bandana (rigid head follower), kerchief band + knot (chest follower), two kerchief lobes (hanging cloth).',
                    'Arms: 17 rings shoulder->wrist (puffed sleeve, rolled hem, fur) + mitten cap; legs: 14 rings hip->ankle (trousers, rolled cuff, fur).',
                    'Hidden surface culled: ears / torso inside the head, arms / legs / tail inside the torso, the kerchief band inside head and torso.']}
if RIG:
    pass
elif not FAST:
    with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-fast.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not FAST and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'sk-kaizo-toy.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG: bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('KAIZO_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
