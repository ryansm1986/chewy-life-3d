"""Okami Yae, the innkeeper of Akane Hamlet (Toybox zone villager, VL-2), phase-1 model. Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_ak-yae-toy.py [-- --fast]

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/ak-yae-toy.glb (--fast: no toon refinement, writes scratch/yae-fast.glb instead).

Technique (the Takumi / Kuma bear head and the Fuku kimono machinery, tools/blender/codex/assets/tk-takumi-toy, tk-fuku-toy):
- The head is ONE smooth implicit ball: a rounded cranium and a wide superellipsoid cheek mass, smooth-unioned, with a
  gentle muzzle displacement (fitted to the sheet by scratch/fit_head.py). Its skin is the field's zero surface reached by
  radial projection (CDT in a stereographic domain, edge loops round both eyelid holes and the mouth), so every vertex
  carries the field's analytic normal and the face stays convex. The eyes are separate flush lens globes in lid holes;
  the upper lash lines are their own tapered rolls (Yae_lash_L/R) with the wing.
- The nose is a glossy rounded-triangle button on the muzzle; the ears are thick solid discs on the crown.
- The body is one lathe (the kimono top over the trousers' waist) with a rolled hem; the obi a thick rounded band with a
  flat cushion knot at the back; the apron a thick cloth slab hanging from under the obi, standing off the belly and
  wrapping its front; the collar a cream ribbon crossing left over right. Short wide sleeves with rolled cuffs, stubby fur
  arms with mitten paws, baggy trouser legs gathered into cuffs over round feet, a round stub tail.
- One 2048 painted atlas: the face chart painted from 3D positions, two eye charts, the ear, nose and collar-V charts and
  1-D shading ramps (soft painted light baked into the colour, never hard shadows).
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
MODEL = 'D:/projects/chewy-life-3d/public/models/ak-yae-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'yae-fast.glb') if FAST else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(5)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
LOG = {}
NAME = 'Yae'

# ---------------------------------------------------------------- the sheet's measures (measure.md)
# turnaround: ground y 526, ear tops y 87.5 -> 1.07 m (410 px / m); the front-view head 227 px at the cheeks -> W 0.554 m;
# chin y 278 -> 0.605 m. Head close-up: W = 295 px, chin y 791, the features' midline x 198. Side view: the head's depth
# centre (x 936) is 14.5 px behind the trouser legs' axis (x 921.5) -> HY 0.035 m.
W = .554; CHIN = .605; HY = .035            # head width at the cheeks, chin height, head centre y
SW = W / .44                                # Rosie's metric detail sizes (authored at W 0.44) scale by SW

# dark cloth reads near-black in the game's grade: the trousers are painted lighter than the swatch (same hue).
# Every ramp keeps its hue: light and shade are value changes only.
PAL = {'fur': '#B07A54', 'furdark': '#946647', 'furlight': '#B98058',          # value-only (x0.84 / x1.05 of the swatch; rig round: the crown's light toned down)
       'muz': '#ECC8A0', 'muzdark': '#D6B18A', 'muzlight': '#F2D2AE',
       'paw': '#BC8A62', 'pawdark': '#9F7453', 'pawlight': '#C8956C',          # the feet: a lighter tan (the sheet's feet)
       'kimono': '#C86A3A', 'kimonodark': '#AA5A31', 'kimonolight': '#D4743F',
       'trou': '#6C3F2C', 'troudark': '#5A3424', 'troulight': '#7A4833',      # swatch #5A3424, painted +20% (dark cloth)
       'obi': '#FFE0A0', 'obidark': '#EDC987', 'obilight': '#FFE8B4',
       'apron': '#FFF4E4', 'aprondark': '#EDE0CC', 'apronlight': '#FFF6EA',
       'iris': '#4B2C20', 'pupil': '#2D1B16', 'nose': '#2D1B16', 'sclera': '#FFF8EF', 'blush': '#E2A090',
       'lash': '#2A1A14', 'brow': '#5A3424', 'mouth': '#2D1B16'}
CHARTS = {'face': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'ear': (1280, 896, 256, 256), 'nose': (1536, 896, 256, 256),
          'torso': (0, 256, 768, 512)}
if RIG:   # phase-2 charts in unused atlas space (the approved paint is untouched)
    CHARTS.update({'lidU.L': (0, 0, 512, 256), 'lidU.R': (512, 0, 512, 256), 'lidD.L': (1024, 0, 512, 192), 'lidD.R': (1536, 0, 512, 192),
                   'cavity': (1024, 256, 128, 128), 'tongue': (1152, 256, 128, 128)})
PAINT_OPTS = {'band': True, 'blush': True, 'muzzle': True}
SKIN_LID_LINES = False     # the rig paints its lids from this skin with the lash shade off
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'muz': ('muzdark', 'muz', 'muzlight'), 'paw': ('pawdark', 'paw', 'pawlight'),
         'kimono': ('kimonodark', 'kimono', 'kimonolight'), 'kimonoin': ('#7E3C1E', '#904524', '#9E4E2A'),
         'trou': ('troudark', 'trou', 'troulight'), 'obi': ('obidark', 'obi', 'obilight'),
         'apron': ('aprondark', 'apron', 'apronlight'),
         'nose': ('#1E120E', 'nose', '#5A3C30'), 'eyedark': ('#1E120C', '#2A1A14', '#4A3024'), 'lash': ('#1C120E', 'lash', '#4E3A30')}
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
# (1.00 W at z 0.24-0.25, 0.90 at 0.44, the dome between the ears: 0.73 at 0.566, 0.49 at 0.66), the side profile (the face 0.45 W ahead at z 0.35-0.40, the back 0.46 W behind:
# a deeper, rounder head than Takumi's) and the crown (0.735 W)
CR = ([0, -.0015, .4601], [.3352, .3705, .2557], (1.6015, 2.7004, 1.8188))      # cranium: a dome (round in plan and front)
CK = ([0, -.0034, .2138], [.4911, .4606, .3228], (2.7012, 2.7002, 2.6765), 3.5895, .2418)  # the wide, chubby cheek mass
K_CK = .2104
# round-1 tweak after the fit: the cheek mass moved 0.015 W back so the face above the muzzle sits at the sheet's 0.45-0.46 W
# (the fit had 0.48) and the muzzle reads as a bump in profile; the back of the head gains the same (sheet 0.46 W)
def ball_local(q): return smin(sell(q, *CR), sell(q, *CK), K_CK)
_g = np.stack(np.meshgrid(np.linspace(-.5, .5, 81), np.linspace(-.6, .6, 97), np.linspace(-.25, .15, 401), indexing='ij'), -1).reshape(-1, 3)
ZMIN = float(_g[ball_local(_g) < 0][:, 2].min()); del _g
for blob in (CR, CK): blob[0][2] -= ZMIN
# the muzzle is a smooth displacement of the ball (no union crease), zero slope at its edge, its lower half fading
# into the chin; it carries the nose forward to about 0.53 W ahead of the head centre (the sheet's side view)
MZ = ([0, -.360, .200], [.225, .175, .215])          # final coordinates (W, z above the chin): centre, x / up / down radii
MZ_A = .060
def head_local(q):
    d = ball_local(q)
    dz = q[..., 2] - MZ[0][2]; r = np.sqrt((q[..., 0] / MZ[1][0]) ** 2 + (dz / np.where(dz < 0, MZ[1][2], MZ[1][1])) ** 2)
    return d - MZ_A * (1 - smoother(.22, 1, r)) * smooth(-.12, -.28, q[..., 1])
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
EX = .197 * W; EZ = CHIN + .382 * W; EHW = .0960 * W; EHH = .0970 * W; EN = 2.15     # the lid hole (sheet: the opening 0.193 W inside the dark rim)
EAR_X, EAR_Y, EAR_Z = .268, .070, .656                                            # ear disc centres (W; the sheet's circle fits)
def eye_unit(psi):
    return spow(np.cos(psi), 2 / EN), spow(np.sin(psi), 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
# the painted muzzle: a soft bean, widest below its middle (the sheet: 0.37 W wide at z 0.19, top z 0.338, bottom z 0.077)
MUZ_C = CHIN + .190 * W; MUZ_HW = .185 * W; MUZ_UP = .148 * W; MUZ_DN = .113 * W; MUZ_N = 2.15
NOSE_Z = CHIN + .295 * W; NOSE_TOP = CHIN + .324 * W; NOSE_BOT = CHIN + .266 * W
MZM = CHIN + .204 * W; MHW = .064 * W; MS = .854                          # the smile (0.142 W wide, corners up); mouth loops
MOUTH_DIP = .031 * W                                                      # the smile's centre line: corners 0.222 W, bottom 0.187
BROW_X = .200 * W; BROW_Z = CHIN + .562 * W; BROW_L = .060 * W; BROW_RISE = .028 * W
BLUSH = (.326 * W, CHIN + .247 * W, .076 * W, .043 * W)

# ---------------------------------------------------------------- the fur shade (shared by the face chart and the ramps)
EAR_C = {s: np.array([s * EAR_X * W, HY + EAR_Y * W, CHIN + EAR_Z * W]) for s in (-1, 1)}
def head_occ(P, n):
    o = np.zeros(np.asarray(P).shape[:-1])
    for s in (-1, 1):
        dd = np.linalg.norm(P - EAR_C[s], axis=-1); o = o + .08 * np.exp(-(dd / (.13 * W)) ** 2)
    return o
def head_shade(P, n): return sval(n, head_occ(P, n), hi=.03, lo=.24)        # light is a soft value change only (rig round: the crown stays the even swatch)

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
    add_loop(to_dom(surf_dir(MS * hx * W * spow(np.cos(a), .8), MZM - .004 * W + hz * W * np.sin(a))), 'mouth_%d' % k)
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
keep &= ~(front & ((Pf[:, 0] / (MS * .142 * W)) ** 2 + ((Pf[:, 2] - MZM) / (.062 * W)) ** 2 < 1))
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
def lash_th(psi):      # the lash band's thickness (eye radii): thick on top, swelling to the outer corner (psi 0 = outer side)
    return (.075 + .145 * np.sin(np.clip(psi, 0, PI)) ** .55 + .085 * np.exp(-((psi - .40) / .45) ** 2)) * (.55 + .45 * smooth(-.10, .22, psi))   # full at the outer corner: the wing grows from it
def lash_centreline():
    """(X, Z) eye units (X > 0 outer) and half-widths (eye radii) from the inner end over the top and out into the wing"""
    psi = np.linspace(PI - .02, .22, 32); th = lash_th(psi)
    ux, uz = eye_unit(psi); r = 1 + th / 2 - .025; P = np.stack([ux * r, uz * r], -1); hw = th / 2 + .04
    gam, Lk, w0 = .06, .036 * W, .0100 * W                   # the wing: out from the outer corner, its tip curling up (the sheet)
    bx, bz = P[-1]; tq = np.linspace(0, 1, 9)[1:]
    Wp = np.stack([bx + Lk / EHW * tq * np.cos(gam + .50 * tq ** 1.5), bz + Lk / EHH * tq * np.sin(gam + .50 * tq ** 1.5)], -1)
    whw = np.maximum(hw[-1] * (1 - tq ** 1.4) ** .55, w0 / EHH * .10)   # a short teardrop flick (the sheet)
    return np.concatenate([P, Wp]), np.concatenate([hw, whw])
LASH_C2, LASH_HW = lash_centreline()
def eye_pt(s, X, Z):
    x = s * EX + s * EHW * np.asarray(X, float); z = EZ + EHH * np.asarray(Z, float)
    y = front_hit(x, z); S = np.stack([x, y, z], -1); return S, grad_n(S)
lash_info = {}
NLT, NLS = 32, 8
for s, tag in ((-1, 'R'), (1, 'L')):
    L_ = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(LASH_C2 * [EHW, EHH], axis=0), axis=1))]); tt = np.linspace(0, L_[-1], NLT + 1)
    C2 = np.stack([np.interp(tt, L_, LASH_C2[:, 0]), np.interp(tt, L_, LASH_C2[:, 1])], -1); hw = np.interp(tt, L_, LASH_HW) * EHH
    S, n = eye_pt(s, C2[:, 0], C2[:, 1])
    tg = np.gradient(S, axis=0); tg = unit(tg - n * (tg * n).sum(1, keepdims=True)); sd = unit(np.cross(n, tg))
    u = tt / tt[-1]
    hp = (.0072 * W) * (.55 + .45 * smooth(0, .25, u)) * (1 - .60 * smooth(.75, 1.0, u))
    V = []; NV = []
    for i in range(NLT + 1):
        for k in range(NLS):
            a = 2 * PI * k / NLS; ca, sa = math.cos(a), math.sin(a)
            up = hp[i] * (sa if sa > 0 else .40 * sa)
            V.append(S[i] + sd[i] * hw[i] * ca + n[i] * (up - .0010 * W))
            NV.append(unit(sd[i] * ca / max(hw[i], 1e-4) + n[i] * sa / max(hp[i], 1e-4)))
    V = np.array(V); NV = np.array(NV)
    tip = len(V); V = np.vstack([V, S[-1] + tg[-1] * hw[-1] * .6 + n[-1] * (.25 * hp[-1])]); NV = np.vstack([NV, tg[-1]])
    root = len(V); V = np.vstack([V, S[0] - tg[0] * hw[0] * .8 + n[0] * (.2 * hp[0])]); NV = np.vstack([NV, -tg[0]])
    F = []
    for i in range(NLT):
        for k in range(NLS):
            a_, b_ = i * NLS + k, i * NLS + (k + 1) % NLS; F.append((a_, b_, b_ + NLS, a_ + NLS))
    for k in range(NLS): F.append((NLT * NLS + k, NLT * NLS + (k + 1) % NLS, tip))
    for k in range(NLS): F.append(((k + 1) % NLS, k, root))
    make_obj('lash.' + tag, V, F, ramp_uv('lash', sval(NV, 0., hi=.14, lo=.10)), 'lash.' + tag, NV)
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
    # a soft inverted triangle: broad rounded top, the sides tapering to a round point (0.103 x 0.063 W)
    t = np.linspace(0, 2 * PI, n, endpoint=False); u = np.cos(t); v = np.sin(t)
    y = .0268 * W * spow(v, .80); taper = (.58 + .42 * ((v + 1) / 2) ** .9)
    x = .0505 * W * spow(u, .70) * taper
    return np.stack([x, y + .002 * W], -1)
NOSE_OUT = _nose_outline()
NOSE_H = .014                                                   # the button stands 14 mm proud (a soft bump in profile)
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
            row.append(len(V)); V.append(P[i]); UV.append((.5 + NOSE_OUT[i, 0] * sc / (.13 * W), .5 + NOSE_OUT[i, 1] * sc / (.13 * W)))
        rows.append(row)
    top = len(V); Bc = np.array([0., float(front_hit(0., NOSE_Z)[0]), NOSE_Z]); nc = grad_n(Bc[None])[0]
    V.append(Bc + unit(nc + unit(np.array([0, -1., .20]))) * NOSE_H); UV.append((.5, .5))
    F = []; m = len(NOSE_OUT)
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(m): F.append((a_[i], a_[(i + 1) % m], b_[(i + 1) % m], b_[i]))
    for i in range(m): F.append((rows[-1][i], rows[-1][(i + 1) % m], top))
    return make_obj('nose_button', np.array(V), F, au('nose', *np.array(UV).T), 'head', recalc=False)
build_nose()

# ================================================================ EARS: thick round solid discs on the crown
EAR_OUT = 18.; EAR_R = .172 * W; EAR_AN = .062 * W; EAR_DISH = .022 * W
ear_info = {}
for s in (-1, 1):
    C0 = EAR_C[s]; ne = unit(np.array([s * math.sin(math.radians(EAR_OUT)), -math.cos(math.radians(EAR_OUT)), .10]))
    up = np.array([0, 0, 1.]); up = unit(up - ne * (up @ ne)); tt = np.cross(up, ne)
    at = au_ = EAR_R; an, dish = EAR_AN, EAR_DISH
    seg, rows_ = 26, 12; V = []
    for j in range(rows_ + 1):
        ph = PI * j / rows_
        for i in range(seg):
            th = 2 * PI * i / seg; rho = math.sin(ph); fz = math.cos(ph)
            if fz > 0: off = an * fz ** .55 - dish * (1 - float(smooth(0, .72, rho)))
            else: off = 2.6 * an * fz
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
            if front_face:                   # the ear chart: +u is outward on both ears
                a_ = s * (p @ tt) / at; b_ = p @ up / au_; lp[uvl].uv = tuple(au('ear', .5 + .48 * a_, .5 + .48 * b_))
            else:
                n_ = unit(np.array(lp.vert.normal)); lp[uvl].uv = tuple(ramp_uv('fur', sval(n_[None], .06, hi=.12))[0])
    bm.to_mesh(ob.data); bm.free()
    ear_info[s] = (C0, ne, up, tt)

# ================================================================ BODY: the kimono top (one lathe over the trousers' waist)
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
# the lathe's sections (metres): z, half-width a (front view), front depth bf, back depth bb (side view, from the legs' axis)
# measured on the turnaround (measure.md): the kimono puffs out under the obi (0.434 m wide at z 0.376) to its hem at
# z 0.266 (0.508 wide, +0.228 deep at the back); the obi cinches it (0.38 wide, -0.196 / +0.194 deep with the band); the
# chest under the sleeves; the neck inside the head
BELL = [(.170, .262, .214, .232), (.236, .260, .212, .230), (.266, .254, .204, .228), (.288, .254, .205, .229), (.302, .252, .205, .228),
        (.332, .244, .203, .224), (.361, .228, .198, .214), (.376, .214, .192, .203), (.392, .184, .184, .184),
        (.405, .174, .181, .179), (.440, .172, .180, .178), (.470, .176, .180, .180), (.500, .181, .178, .180),
        (.530, .178, .168, .174), (.555, .166, .150, .160), (.578, .145, .126, .140), (.598, .114, .098, .112),
        (.616, .072, .065, .072), (.632, .025, .025, .025)]
BZ, BA, BF, BB = [np.array(c, float) for c in zip(*BELL)]
Z_TOP = float(BZ[-1])
Z_HEM = .266                 # the kimono's hem (the trousers show below it)
LIP = .009                   # the hem's rolled lip (faded out under the apron)
LIPZ = (np.array([0, .0005, .003, .008, .016, .024, .032]), np.array([0, .55, .88, 1., .85, .35, 0]))
def bell_n(z): return 2.3 + 0 * np.asarray(z, float)
def lip_z(z): return np.interp(np.asarray(z, float) - Z_HEM, *LIPZ, left=0, right=0)
def lip_phi(phi): return smooth(.74, .92, np.abs(np.arctan2(np.sin(phi), np.cos(phi))))
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
    p = np.asarray(p, float); z = p[..., 2]; zc = np.clip(z, Z_HEM, Z_TOP)
    phi = np.arctan2(p[..., 0], -p[..., 1]); rho = np.hypot(p[..., 0], p[..., 1])
    return np.maximum(np.maximum((rho - bell_r(phi, zc, lip)) * .92, Z_HEM - .004 - z), z - Z_TOP)
def bell_sdf_nolip(p): return bell_sdf(p, False)
def body_occ(p): return np.minimum(head_sdf(p), 9.)
def torso_shade(P, N): return sval(N, .30 * ao(body_occ, P, N, .05), hi=.15, lo=.24)
TORSO_CH = (-.24, .24, .45, .645)          # the collar-V chart: x range, z range (front projection)
def in_torso_chart(P, N):
    return (N[1] < -.30) & (P[2] > .462) & (np.abs(P[0]) < .19)
NPHI = 60
def build_bell():
    # rings: (z where the section is evaluated, z placed, radial offset); the hem rolls under and in, then a bottom pole
    zs = [Z_HEM + o for o in LIPZ[0]] + list(np.linspace(.304, .386, 6)) + list(np.linspace(.398, .62, 14)) + [.628]
    zs = sorted(set(round(float(z), 5) for z in zs))
    rings = [(Z_HEM, Z_HEM + .002, -.050), (Z_HEM, Z_HEM - .001, -.022), (Z_HEM, Z_HEM - .0025, -.009), (Z_HEM, Z_HEM - .0015, -.003)] + \
            [(z, z, 0.) for z in zs]
    phi = np.linspace(0, 2 * PI, NPHI, endpoint=False)
    V = []; N = []; rows = []
    for ze, zp, dr in rings:
        P = bell_pt(phi, ze, True, dr); P[:, 2] = zp; n = bell_normal(phi, ze)
        if dr < -.005: n = unit(n * .3 + np.array([0, 0, -1.]))
        rows.append(list(range(len(V), len(V) + NPHI))); V += list(P); N += list(n)
    bot = len(V); V.append(np.array([0, .0, Z_HEM + .03])); N.append(np.array([0, 0, -1.]))
    top = len(V); V.append(np.array([0, .0, Z_TOP])); N.append(np.array([0, 0, 1.]))
    F = []
    for k in range(len(rows) - 1):
        a_, b_ = rows[k], rows[k + 1]
        for i in range(NPHI): F.append((a_[i], a_[(i + 1) % NPHI], b_[(i + 1) % NPHI], b_[i]))
    for i in range(NPHI): F.append((rows[0][(i + 1) % NPHI], rows[0][i], bot))
    for i in range(NPHI): F.append((rows[-1][i], rows[-1][(i + 1) % NPHI], top))
    V = np.array(V); N = np.array(N); val = torso_shade(V, N)
    uv = []
    for f in F:
        idx = list(f); cP = V[idx].mean(0); cN = unit(N[idx].mean(0))
        if in_torso_chart(cP, cN):
            x0, x1, z0, z1 = TORSO_CH; uv.append([tuple(au('torso', (V[i, 0] - x0) / (x1 - x0), (V[i, 2] - z0) / (z1 - z0))) for i in idx])
        else:
            uv.append([tuple(ramp_uv('kimono', val[i:i + 1])[0]) for i in idx])
    return make_obj('kimono', V, F, uv, 'body', N)
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

# ---------------------------------------------------------------- the obi: a thick plain band (the sheet: z 0.388-0.457)
OBI_ZM = .422
OBI_PROF = [(.386, .001), (.3872, .008), (.3905, .0128), (.3965, .0155), (.405, .0163), (.422, .0166), (.439, .0163),
            (.4475, .0155), (.4535, .0128), (.4568, .008), (.458, .001)]
def build_obi():
    phi = np.linspace(0, 2 * PI, 64, endpoint=False); V = []; rows = []
    for z, t in OBI_PROF:
        r = bell_r(phi, OBI_ZM, False) + t; rows.append(list(range(len(V), len(V) + len(phi))))
        V += list(np.stack([r * np.sin(phi), -r * np.cos(phi), np.full(len(phi), z)], -1))
    F = []; n = len(phi)
    for k in range(len(rows) - 1):
        for i in range(n):
            a_, b_ = rows[k], rows[k + 1]; F.append((a_[i], a_[(i + 1) % n], b_[(i + 1) % n], b_[i]))
    V = np.array(V); ob = make_obj('obi_band', V, F, np.zeros((len(V), 2)), 'obi')
    ramp_by_normal(ob, 'obi', lambda Vv, Nn: sval(Nn, .20 * ao(body_occ, Vv, Nn, .04), hi=.16, lo=.24))
    return ob
build_obi()
# the knot at the back: a flat rounded cushion (the sheet's back view: 0.19 m wide, z 0.385-0.478; side: 0.044 m proud)
BOW_C = np.array([0, .213, .4315]); BOW_R = [.095, .029, .0465]
def bow_sdf(p): return sell(p, BOW_C, BOW_R, (3.6, 2.3, 3.4))
def bow_shade(P, N): return sval(N, .25 * ao(lambda q: bell_sdf(q, False) - .016, P, N, .03), hi=.18, lo=.24)
sdf_ball('obi_knot', bow_sdf, BOW_C, 8, 'obi', 'obi', shade=bow_shade, t1=.14, scale=(1., .4, .6))

# ---------------------------------------------------------------- the apron: a thick slab hanging from under the obi
# front view: 0.336 m wide under the obi, widening to 0.41 at z 0.22, rounded bottom corners, hem z 0.181; side view: it
# hangs off the belly (-0.218 m at z 0.375 to -0.243 at the hem) and its sides wrap back to y -0.137
AP_TOP, AP_BOT = .400, .181; AP_T = .011; AP_GAP = .004; AP_R0 = .26; AP_OUT = .026
def ap_r(phi, z, t=AP_T):
    z = np.asarray(z, float)
    rb = bell_r(phi, z, False) + AP_GAP + t
    u = clamp((AP_TOP - z) / (AP_TOP - AP_BOT))
    rh = bell_r(phi, AP_TOP, False) + AP_GAP + t + AP_OUT * (1 - (1 - u) ** 1.0) ** .55
    return smax(rb, rh, .02)
def ap_point(s, z, t=AP_T):
    phi = np.asarray(s, float) / AP_R0; r = ap_r(phi, z, t)
    return np.stack([r * np.sin(phi), -r * np.cos(phi), np.asarray(z, float) * np.ones_like(r)], -1)
def x_to_s(x, z):
    """the arc coordinate s whose apron point projects to front-view x at height z"""
    ss = np.linspace(0, .42, 420); out = []
    for xx, zz in zip(np.atleast_1d(x), np.atleast_1d(z)):
        X = ap_point(ss, np.full(len(ss), zz))[:, 0]; out.append(np.sign(xx) * np.interp(abs(xx), X, ss))
    return np.array(out)
AP_HW = (np.array([.181, .200, .220, .249, .268, .288, .307, .327, .346, .366, .385, .400]),
         np.array([.205, .205, .205, .204, .201, .199, .194, .190, .184, .174, .168, .166]))
AP_RC = .040
def _apron_outline_xz():
    def hw(z): return float(np.interp(z, *AP_HW))
    side = [(hw(z), z) for z in np.linspace(AP_TOP, AP_BOT + AP_RC, 24)]
    xc = hw(AP_BOT + AP_RC) - AP_RC; zc = AP_BOT + AP_RC
    corner = [(xc + AP_RC * math.cos(a), zc + AP_RC * math.sin(a)) for a in np.linspace(0, -PI / 2, 10)[1:]]
    bottom = [(x, AP_BOT) for x in np.linspace(xc, 0, 9)[1:]]
    right = side + corner + bottom                      # top-right corner, down the side, round, along the bottom to x 0
    left = [(-x, z) for x, z in right[::-1]][1:]
    top = [(x, AP_TOP) for x in np.linspace(-hw(AP_TOP), hw(AP_TOP), 16)[1:-1]]
    return np.array(right + left + top)
def build_apron():
    O = _apron_outline_xz(); S = x_to_s(O[:, 0], O[:, 1]); out = np.stack([S, O[:, 1]], -1)
    def area(p): return .5 * np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1])
    if area(out) < 0: out = out[::-1]
    out = resample(out, .014)
    gx, gz = np.meshgrid(np.arange(-.40, .40, .022), np.arange(.17, .41, .019))
    G = np.stack([gx.ravel(), gz.ravel()], -1); G[:, 0] += .011 * (np.round((G[:, 1] - .17) / .019) % 2)
    ok = in_poly(G, out)
    d = np.full(len(G), 9.)
    for i in range(len(out)):
        a = out[i]; b = out[(i + 1) % len(out)]; ab = b - a; t = np.clip(((G - a) @ ab) / (ab @ ab), 0, 1)
        d = np.minimum(d, np.linalg.norm(G - (a + t[:, None] * ab), axis=1))
    G = G[ok & (d > .009)]
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
    ramp_by_normal(ob, 'apron', lambda Vv, Nn: sval(Nn, .20 * ao(bell_sdf_nolip, Vv, Nn, .03)
                                                    + .22 * smooth(AP_TOP - .03, AP_TOP + .004, Vv[:, 2]), hi=.14, lo=.22))
    return ob, out
apron_ob, APRON_OUT = build_apron()

# ---------------------------------------------------------------- the collar: a cream ribbon, the left panel over the right
def ribbon(name, ctrl, offs, width, thick, group, ramp, n=96, cen=(0, 0, .47)):
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
    make_obj(name, V, F, ramp_uv(ramp, sval(NV, .30 * ao(body_occ, V, NV, .03), hi=.12, lo=.22)), group, NV)
    return S
COLLAR_W, COLLAR_T = .046, .013
# from under the obi (her right front), up across the chest over her left shoulder, round the back of the neck, over her
# right shoulder and down to the crossing (z 0.515), where it tucks under the first band
COLLAR_CTRL = [(-.105, -.20, .440), (-.094, -.20, .457), (-.058, -.19, .487), (-.020, -.18, .515), (.022, -.17, .542),
               (.066, -.15, .567), (.105, -.11, .590), (.128, -.05, .604), (.136, .02, .606), (.110, .08, .600),
               (.055, .112, .596), (0, .120, .595), (-.055, .112, .596), (-.110, .08, .600), (-.136, .02, .606),
               (-.128, -.05, .604), (-.105, -.11, .590), (-.072, -.145, .566), (-.042, -.165, .541), (-.016, -.176, .518)]
COLLAR_OFF = [.000, .004, .010, .014, .011, .006, .004, .004, .004, .004, .004, .004, .004, .004, .004, .004, .004, .003,
              .000, -.006]
COLLAR_PATH = ribbon('collar', COLLAR_CTRL, COLLAR_OFF, COLLAR_W, COLLAR_T, 'collar', 'apron')

# ================================================================ SLEEVES, ARMS (A-pose), TROUSER LEGS + FEET, TAIL
ARM_DEG = 50.
SLV_L = .140
SH = .150; SHZ = .525
joint_arms = {}; joint_legs = {}; sleeve_info = {}
def arm_frame(s):
    a = math.radians(ARM_DEG); d = unit(np.array([s * math.sin(a), -.06, -math.cos(a)]))
    e1 = unit(np.cross(d, [0, 0, 1.])); e2 = unit(np.cross(e1, d))
    if e2[2] < 0: e2 = -e2
    return d, e1, e2
def sleeve_ring(s, t, a, scale=1.):
    d, e1, e2 = arm_frame(s); S0 = np.array([s * SH, .000, SHZ])
    C = S0 + d * (-.050 + (SLV_L + .050) * t)
    rw = .080 + .008 * float(smooth(0, 1, t)); ru = .078 + .004 * t; rd = .080 + .016 * float(smooth(0, .9, t))
    down = unit(.55 * e2 + .45 * np.array([0, 0, 1.]))
    ca, sa = np.cos(a), np.sin(a)
    up_part = np.where(sa >= 0, ru * sa, 0.)[:, None] * e2
    dn_part = np.where(sa < 0, rd * spow(sa, .90), 0.)[:, None] * down
    return C + scale * (e1 * (rw * ca)[:, None] + up_part + dn_part), C
def build_sleeve(s, tag):
    d, e1, e2 = arm_frame(s); NA = 30; a = np.linspace(0, 2 * PI, NA, endpoint=False) + PI / NA
    ts = [0, .10, .22, .34, .46, .58, .70, .80, .88, .95, 1.0]
    rows = []; V = []; RN = []
    for t in ts:
        P, C = sleeve_ring(s, t, a); rows.append(list(range(len(V), len(V) + NA))); V += list(P); RN.append('kimono')
    P1, C1 = sleeve_ring(s, 1.0, a)
    for dd, sc, nm in [(.007, .975, 'kimono'), (.011, .925, 'kimono'), (.011, .86, 'kimonoin'), (.007, .80, 'kimonoin')]:
        P = C1 + (P1 - C1) * sc + d * dd; rows.append(list(range(len(V), len(V) + NA))); V += list(P); RN.append(nm)
    for dd, rr in [(-.004, .066), (-.040, .060)]:
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
    d, e1, e2 = arm_frame(s); sh = np.array([s * SH, .000, SHZ])
    elbow = sh + d * .120; wrist = sh + d * .190
    pts_ = [sh + d * .030, sh + d * .100, sh + d * .160, sh + d * .212]
    rows = [(0., .056, 'fur'), (.15, .056, 'fur'), (.30, .056, 'fur'), (.45, .057, 'fur'), (.58, .059, 'fur'), (.70, .062, 'fur'),
            (.80, .064, 'fur'), (.90, .066, 'fur'), (1., .066, 'fur')]
    tube('arm.' + tag, pts_, rows, 'arm.' + tag, sides=22, cap_rows=8, cap_len=1.0, squash=.94, occ_f=bell_sdf_nolip, occ_k=.20)
    joint_arms[tag] = {'shoulder': [float(v) for v in sh], 'elbow': [float(v) for v in elbow], 'wrist': [float(v) for v in wrist],
                       'paw_tip': [float(v) for v in sh + d * (.212 + .066)]}

FOOT = dict(r=[.086, .136, .046], p=(2.6, 2.7, 2.2), pzlo=4.0, rzlo=.034)
FOOT_X = .116; FOOT_Y = -.030
def foot_sdf_s(s):
    c = np.array([s * FOOT_X, FOOT_Y, .034])            # the sole on z = 0 (rzlo 0.034)
    def f(p):
        d = sell(p, c, FOOT['r'], FOOT['p'], FOOT['pzlo'], FOOT['rzlo'])
        for k in (-1, 1):            # two shallow toe grooves on the front of the foot
            g = ell(p, c + np.array([k * .029, -.152, .030]), [.0055, .022, .040])
            d = smax(d, -g, .006)
        return d
    return f, c
LEG_SQ = 1.40
def trou_occ(V, NV):
    # the kimono hem's soft contact shade on the top of the trousers
    return .30 * smooth(Z_HEM - .045, Z_HEM - .004, V[:, 2])
for s, tag in ((-1, 'R'), (1, 'L')):
    hip = np.array([s * .122, .000, .300]); knee = np.array([s * .124, .000, .190]); ankle = np.array([s * .118, -.006, .085])
    # an evenly spaced centreline (z 0.34 -> 0.075), so t maps linearly to height: z = 0.34 - 0.265 t
    pts_ = [np.array([s * .122, 0, .34]), np.array([s * .123, 0, .2517]), np.array([s * .122, -.003, .1633]), np.array([s * .118, -.006, .075])]
    # the balloon leg (widest 0.262 m at z 0.20), a crease into the gathered cuff (z 0.078-0.112), all under the kimono's hem at the top
    ZR = [(.34, .100), (.30, .110), (.27, .121), (.24, .128), (.20, .131), (.17, .130), (.145, .125), (.127, .117), (.118, .111),
          (.112, .103), (.109, .1035), (.105, .1065), (.098, .1085), (.088, .1085), (.082, .1045), (.078, .096), (.075, .086)]
    rows = [(round((.34 - z) / .265, 4), r, 'trou') for z, r in ZR]
    tube('leg.' + tag, pts_, rows, 'leg.' + tag, sides=24, cap_rows=3, cap_len=.4, squash=LEG_SQ, occ_f=bell_sdf_nolip, occ_k=.0,
         extra_occ=trou_occ)
    ff, fc = foot_sdf_s(s)
    def foot_shade(P, N, ff=ff, fc=fc):
        lat = (P[:, 0] - fc[0]) / .086; frontz = smooth(-.10, -.135, P[:, 1] - fc[1]) * smooth(.008, .022, P[:, 2]) * smooth(.072, .055, P[:, 2])
        groove = sum(np.exp(-((lat - k * .337) / .035) ** 2) for k in (-1, 1)) * frontz
        return sval(N, .24 * groove + .18 * smooth(.062, .080, P[:, 2]))
    sdf_ball('foot.' + tag, ff, fc + np.array([0, 0, .01]), 8, 'leg.' + tag, 'paw', shade=foot_shade, t1=.4)
    joint_legs[tag] = {'hip': [float(v) for v in hip], 'knee': [float(v) for v in knee], 'ankle': [float(v) for v in ankle],
                       'toe': [float(fc[0]), float(fc[1] - .13), .035]}
TAIL = ([0, .214, .262], [.050, .044, .046])
def tail_sdf(p): return ell(p, *TAIL)
tail_ob, _, _ = sdf_ball('stub_tail', tail_sdf, np.array(TAIL[0]), 6, 'tail', 'fur', occ_f=bell_sdf_nolip)
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
    # the muzzle: a clean soft bean in the front view (widest below its middle) with a soft 2-3 mm border, its own soft light
    dzm = z - MUZ_C; rm = (np.abs(x / MUZ_HW) ** MUZ_N + np.abs(dzm / np.where(dzm > 0, MUZ_UP, MUZ_DN)) ** MUZ_N) ** (1 / MUZ_N)
    C = mix(C, ramp_colour('muz', sval(n, 0., hi=.14, lo=.17)), (1 - smooth(.975, 1.022, rm)) * fr * PAINT_OPTS['muzzle'])
    # blush ovals (soft)
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .96 * (1 - smooth(.80, 1.05, r)) * fr * PAINT_OPTS['blush'])
    # brows: soft arcs tapering to rounded points
    t = np.linspace(-1, 1, 15)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * BROW_L * t, BROW_Z + BROW_RISE * (1 - t * t)], -1)
        half = .0080 * W * np.maximum(0, 1 - t * t) ** .55 + .0016 * W
        box = (np.abs(x - s * BROW_X) < .10 * W) & (np.abs(z - BROW_Z - .02 * W) < .06 * W) & (fr > 0)
        a = np.zeros(len(x)); a[box] = stroke(x[box], z[box], Pb, half, .0030 * W)
        C = mix(C, rgb('brow'), .95 * a)
    # the smile: one soft U, its corners turned up (the sheet: 0.142 W wide, corners z 0.222, bottom 0.187); no philtrum line
    lw = .0068 * W
    u_ = np.linspace(-1, 1, 41)
    Pm = np.stack([MHW * u_, MZM - .017 * W + MOUTH_DIP * np.abs(u_) ** 2.3 + .004 * W * smooth(.80, 1., np.abs(u_))], -1)
    half = lw * (.62 + .38 * np.sqrt(np.maximum(0, 1 - u_ ** 2)) ** .5)
    ib = (np.abs(x) < .12 * W) & (np.abs(z - MZM) < .05 * W) & (fr > 0)
    a = np.zeros(len(x)); a[ib] = stroke(x[ib], z[ib], Pm, half, .0026 * W); C = mix(C, rgb('mouth'), .96 * a)
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
    ix = -s * .25; iz = -.07; irx = .76; irz = 1.02
    C = mix(rgb('sclera'), rgb('#E9DDD3'), .45 * smooth(.35, .95, Z))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#52301F'), rgb('#3A2016'), smooth(-.95, .10, ez))
    I = mix(I, rgb('#2C1810'), smooth(.80, 1.0, r) * .60)
    I = I * (1 - .025 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 26 + r * 9)))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    pz = iz + .06; R = np.sqrt(((X - ix) / (.62 * irx)) ** 2 + ((Z - pz) / (.64 * irz)) ** 2)
    C = mix(C, rgb('pupil'), .55 * (1 - smooth(.85, 1.15, R)))           # the sheet's pupil is soft, the iris dark
    hx = -s * .45; hz = .43                                # the one big round catchlight: upper, toward the nose (the sheet)
    big = np.sqrt(((X - hx) / .245) ** 2 + ((Z - hz) / .245) ** 2)
    C = mix(C, rgb('#FFFAF4'), 1 - smooth(.92, 1.08, big))
    rim = np.maximum(smooth(.945, .995, sr), smooth(.90, .985, sr) * smooth(.1, .6, -s * X) * smooth(-.5, .2, Z))   # thicker on the nose side (the sheet)
    C = mix(C, rgb('lash'), rim * (.45 + .55 * smooth(-.2, .5, Z)))  # the lid contact rim
    return C

def collar_line(path):
    """the front projection of a collar stretch as z(x) (sorted by x)"""
    P = np.asarray(path); o = np.argsort(P[:, 0]); return P[o, 0], P[o, 2]
_cp = np.asarray(COLLAR_PATH); _nC = len(_cp)
_OVER = collar_line(_cp[int(.05 * _nC):int(.37 * _nC)])          # the chest stretch of the over band (her left shoulder)
_UNDER = collar_line(_cp[int(.79 * _nC):])                         # the under band (her right shoulder to the crossing)
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
        a = (U - .5) / .48; b = (V - .5) / .48; r = np.sqrt(a * a + b * b)
        sh_ = clamp(.5 + .10 * b - .06 * a)
        C = ramp_colour('fur', sh_ - .08 * smooth(.62, .40, r))
        ri = np.sqrt(((a - .02) / .52) ** 2 + ((b - .11) / .46) ** 2)        # the light inner oval sits a little up (the sheet)
        Ci = ramp_colour('muz', clamp(.46 + .16 * b - .12 * smooth(.55, 1.0, ri)))
        return mix(C, Ci, 1 - smooth(.95, 1.05, ri))
    if chart == 'nose':
        a = (U - .5) * .13 * W; b = (V - .5) * .13 * W
        C = ramp_colour('nose', .45 + .10 * smooth(-.02, .02, b))
        hl = np.exp(-(((a + .016 * W) / (.016 * W)) ** 2 + ((b - .012 * W) / (.009 * W)) ** 2))
        return mix(C, rgb('#7A5A4E'), .55 * hl)
    if chart == 'torso':
        x0, x1, z0, z1 = TORSO_CH; x_ = x0 + U * (x1 - x0); z_ = z0 + V * (z1 - z0)
        y_ = front_hit(x_.ravel(), z_.ravel(), bell_sdf, -.5, .2).reshape(U.shape); y_ = np.where(np.isfinite(y_), y_, -.1)
        P = np.stack([x_, y_, z_], -1).reshape(-1, 3); N = grad(bell_sdf, P)
        C = ramp_colour('kimono', torso_shade(P, N)).reshape(U.shape + (3,))
        # the chest fur in the collar's V: above both collar bands' centre lines (the ribbons cover the borders)
        zo = np.interp(x_, *_OVER, left=-9, right=9); zu = np.interp(x_, *_UNDER, left=9, right=-9)
        v = smooth(-.002, .002, z_ - zo) * smooth(-.002, .002, z_ - zu)
        Cf = ramp_colour('fur', sval(N, .40 * ao(body_occ, P, N, .05), hi=.10, lo=.22)).reshape(U.shape + (3,))
        return mix(C, Cf, v)
    raise KeyError(chart)

atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [176, 122, 84, 255]
for name, (x0, y0, w, h) in CHARTS.items():
    U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
    if name in ('face', 'torso'):
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
atlas_path = os.path.join(ROOT, 'scratch' if FAST else '', 'ak-yae-toy_rig_atlas.png' if RIG else 'ak-yae-toy_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Yae_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Yae_toy_atlas'); MAT.use_nodes = True
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
ALL = all_verts([o for g in parts.values() for o in g])
rimL = np.array([verts[i] for i in roll_info[1][0]])
EV = {s: all_verts(parts['ear.' + ('L' if s > 0 else 'R')]) for s in (-1, 1)}
MEAS = {'units': 'W = %.3f m face width at the cheeks; front-view z above the chin, profile y from the head centre (W)' % W,
        'total_height_m': round(float(ALL[:, 2].max()), 4), 'lowest_z_m': round(float(ALL[:, 2].min()), 5), 'chin_m': CHIN,
        'head_width_W_at_z': {str(z): width_at(z) for z in (.02, .062, .097, .131, .166, .20, .234, .269, .303, .338, .372, .407, .441, .476, .50, .55, .60, .65, .70)},
        'profile_front_W_at_z': {str(z): prof_front(z) for z in (.015, .037, .10, .147, .20, .27, .36, .454, .498, .542, .586, .63, .674, .718)},
        'profile_back_W_at_z': {str(z): back_at(z) for z in (.015, .037, .059, .103, .147, .19, .25, .30, .366, .41, .476, .542, .586, .63, .674, .696)},
        'nose_tip_y_m': round(float(nose_tip[:, 1].min()), 4), 'nose_tip_W_ahead': round(float((HY - nose_tip[:, 1].min()) / W), 3),
        'eye_opening_W': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'eye_centre_W': [round(EX / W, 3), round((EZ - CHIN) / W, 3)],
        'muzzle_W': {'width': round(2 * MUZ_HW / W, 3), 'top_z': round((MUZ_C + MUZ_UP - CHIN) / W, 3), 'bottom_z': round((MUZ_C - MUZ_DN - CHIN) / W, 3)},
        'nose_W': [round(float(np.ptp(NOSE_OUT[:, 0])) / W, 3), round(float(np.ptp(NOSE_OUT[:, 1])) / W, 3)],
        'ear_top_m': round(float(max(EV[1][:, 2].max(), EV[-1][:, 2].max())), 4),
        'ear_outer_x_W': round(float(EV[1][:, 0].max() / W), 3),
        'body_width_m': round(float(np.ptp(all_verts(parts['body'])[:, 0])), 3),
        'body_depth_m': [round(float(all_verts(parts['body'])[:, 1].min()), 3), round(float(all_verts(parts['body'])[:, 1].max()), 3)],
        'arm_span_m': round(float(np.ptp(all_verts(parts['arm.L'] + parts['arm.R'])[:, 0])), 3),
        'obi_x_m': [round(float(all_verts(parts['obi'])[:, 0].min()), 3), round(float(all_verts(parts['obi'])[:, 0].max()), 3)], 'obi_y_m': [round(float(all_verts(parts['obi'])[:, 1].min()), 3), round(float(all_verts(parts['obi'])[:, 1].max()), 3)], 'obi_z_m': [round(float(all_verts(parts['obi'])[:, 2].min()), 3), round(float(all_verts(parts['obi'])[:, 2].max()), 3)],
        'apron_x_m': [round(float(all_verts(parts['apron'])[:, 0].min()), 3), round(float(all_verts(parts['apron'])[:, 0].max()), 3)], 'apron_y_m': [round(float(all_verts(parts['apron'])[:, 1].min()), 3), round(float(all_verts(parts['apron'])[:, 1].max()), 3)], 'apron_z_m': [round(float(all_verts(parts['apron'])[:, 2].min()), 3), round(float(all_verts(parts['apron'])[:, 2].max()), 3)],
        'sleeveL_x_m': [round(float(all_verts(parts['sleeve.L'])[:, 0].min()), 3), round(float(all_verts(parts['sleeve.L'])[:, 0].max()), 3)], 'sleeveL_z_m': [round(float(all_verts(parts['sleeve.L'])[:, 2].min()), 3), round(float(all_verts(parts['sleeve.L'])[:, 2].max()), 3)], 'armL_x_m': [round(float(all_verts(parts['arm.L'])[:, 0].min()), 3), round(float(all_verts(parts['arm.L'])[:, 0].max()), 3)], 'armL_z_m': [round(float(all_verts(parts['arm.L'])[:, 2].min()), 3), round(float(all_verts(parts['arm.L'])[:, 2].max()), 3)],
        'legL_x_m': [round(float(all_verts(parts['leg.L'])[:, 0].min()), 3), round(float(all_verts(parts['leg.L'])[:, 0].max()), 3)], 'legL_y_m': [round(float(all_verts(parts['leg.L'])[:, 1].min()), 3), round(float(all_verts(parts['leg.L'])[:, 1].max()), 3)], 'tail_y_m': [round(float(all_verts(parts['tail'])[:, 1].min()), 3), round(float(all_verts(parts['tail'])[:, 1].max()), 3)], 'tail_z_m': [round(float(all_verts(parts['tail'])[:, 2].min()), 3), round(float(all_verts(parts['tail'])[:, 2].max()), 3)],
        'trousers_width_m': round(float(np.ptp(all_verts(parts['leg.L'] + parts['leg.R'])[:, 0])), 3)}
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
    ob = bpy.context.object; ob.name = NAME + '_' + group.replace('.', '_')
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
           'ear.L': tuple(EAR_C[1]), 'ear.R': tuple(EAR_C[-1]), 'tail': tuple(TAIL[0]),
           'arm.L': joint_arms['L']['shoulder'], 'arm.R': joint_arms['R']['shoulder'],
           'leg.L': joint_legs['L']['hip'], 'leg.R': joint_legs['R']['hip'], 'sleeve.L': joint_arms['L']['shoulder'],
           'sleeve.R': joint_arms['R']['shoulder'], 'obi': (0, 0, OBI_ZM), 'apron': (0, 0, AP_TOP), 'collar': (0, 0, .55)}.get(group, (0, 0, 0))
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
joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X',
          'hips': [0, .000, .290], 'spine': [0, .005, .400], 'chest': [0, .010, .500], 'neck': [0, .020, .600],
          'head': [float(v) for v in O], 'jaw_pivot': [0, float(HY - .10 * W), float(CHIN + .10 * W)],
          'eyes': eye_centers, 'ears': ears_j, 'arms': joint_arms, 'legs': joint_legs,
          'tail': [[float(v) for v in np.array(TAIL[0]) - np.array([0, .04, 0])], [float(v) for v in np.array(TAIL[0]) + np.array([0, .05, 0])]],
          'obi_knot': [float(v) for v in BOW_C], 'sleeves': sleeve_info,
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth SDF ball (cranium + cheek mass + muzzle), radially projected, analytic normals.',
                    'Eyelid holes ringed by 5 loops each, rim rolled in behind separate lens eyeballs; 3 loops round the mouth.',
                    'Separate pieces: eyes, lash rolls (origin at the eye centre, for the upper lids), ears, tail, obi + knot, apron, collar, sleeves.',
                    'Sleeves: 11 rings root->cuff + a rolled cuff lip; arms: fur tubes with 9 rings + mitten cap; trouser legs: 17 rings hip->cuff (balloon, crease, gathered cuff) + foot.']}
if RIG:
    pass
elif not FAST:
    with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-fast.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not FAST and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'ak-yae-toy.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG: bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('YAE_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
