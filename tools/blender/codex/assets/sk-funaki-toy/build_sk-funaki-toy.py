"""Funaki, Shiokaze Port's boatwright (Toybox zone villager, VL-2), phase-1 model. Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_sk-funaki-toy.py [-- --fast]

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/sk-funaki-toy.glb (--fast: no toon refinement, writes scratch/funaki-fast.glb instead).

Technique (Takumi's machinery, tools/blender/codex/assets/tk-takumi-toy, re-measured for Funaki's sheet):
- The head is ONE smooth implicit ball: a rounded cranium and a wide superellipsoid cheek mass, smooth-unioned, with a
  rounded toy-muzzle displacement (fitted to the sheet by scratch/fit_head2.py). Its skin is the field's zero surface reached
  by radial projection (CDT in a stereographic domain, edge loops round both eyelid holes and the mouth), so every vertex
  carries the field's analytic normal and the face stays convex. The eyes are separate flush lens globes in lid holes.
- The nose is a glossy rounded-triangle button on the muzzle; the ears are thick solid discs rising behind the headband.
- The headband is a thick rounded-section band swept round the skull in a plane tilted 19.5 deg back (the sheet's side view).
- The torso is an SDF (a big overalls barrel, a round belly and a shirt chest) meshed by horizontal-equator radial
  projection, so the shirt / overalls colour edge is one exact ring (z 0.45, the overalls' back top edge, with a rolled hem).
  The bib and its pocket are thick cloth slabs (CDT outlines wrapped on the torso), the straps rounded bands swept on the
  surface (straight down the back), the buttons big gold lens domes. Arms are tubes with puffed sleeves; the full-length
  baggy trouser legs are tubes with rolled cuffs.
- The tool pouch (a rounded box with a curved front flap, a stud and a taller back panel) on his right hip holds a big
  wooden mallet; all SDF blobs meshed by radial projection.
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
MODEL = 'D:/projects/chewy-life-3d/public/models/sk-funaki-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'funaki-fast.glb') if FAST else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(5)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
LOG = {}

# ---------------------------------------------------------------- the sheet's measures (measure.md)
# turnaround (front): ground y 533, ear tops y 84 -> 1.11 m (404.5 px / m); the head close-up: W = 311 px at the cheeks.
W = .6156; CHIN = .582; HY = .024           # head width at the cheeks, chin height, head centre y (behind the leg axis)
SW = W / .44                                # Rosie's metric detail sizes (authored at W 0.44) scale by SW

# dark cloth reads near-black in the game's grade: the overalls, straps and band are painted a touch lighter than the
# swatches (same hue). Every ramp keeps its hue: light and shade are value changes only.
PAL = {'fur': '#8A664D', 'furdark': '#745641', 'furlight': '#956E53',          # value-only (x0.84 / x1.08); the swatch #7A5A44 +13% (the sheet's lit fur)
       'muz': '#D8B890', 'muzdark': '#C2A47E', 'muzlight': '#E2C49E',
       'shirt': '#E8E0D0', 'shirtdark': '#CFC6B5', 'shirtlight': '#F2EBDD',
       'over': '#537789', 'overdark': '#456373', 'overlight': '#5C8296',             # the swatch #4A6A7A x1.12
       'strap': '#374B58', 'strapdark': '#2D3E49', 'straplight': '#3E5462',          # the swatch #2A3A44 x1.3
       'band': '#E8C870', 'banddark': '#CDAF5E', 'bandlight': '#F0D486',
       'pouch': '#A87843', 'pouchdark': '#8C6236', 'pouchlight': '#B6864F',
       'wood': '#D9A66C', 'wooddark': '#BC8C56', 'woodlight': '#E6B87E',
       'gold': '#E8C870', 'golddark': '#C9A957', 'goldlight': '#F6DE96',
       'iris': '#3A2A20', 'pupil': '#22150F', 'nose': '#241A16', 'sclera': '#FFF8EF', 'blush': '#D89A8A',
       'lash': '#24170F', 'brow': '#3A2618', 'mouth': '#241A16'}
CHARTS = {'face': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'ear': (1280, 896, 256, 256), 'nose': (1536, 896, 256, 256)}
if RIG:   # phase-2 charts in unused atlas space (the approved paint is untouched)
    CHARTS.update({'lidU.L': (0, 0, 512, 256), 'lidU.R': (512, 0, 512, 256), 'lidD.L': (1024, 0, 512, 192), 'lidD.R': (1536, 0, 512, 192),
                   'cavity': (0, 256, 128, 128), 'tongue': (128, 256, 128, 128)})
PAINT_OPTS = {'band': True, 'blush': True, 'muzzle': True}
SKIN_LID_LINES = False     # the rig paints its lids from this skin with the lash shade off
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'muz': ('muzdark', 'muz', 'muzlight'),
         'shirt': ('shirtdark', 'shirt', 'shirtlight'), 'over': ('overdark', 'over', 'overlight'),
         'strap': ('strapdark', 'strap', 'straplight'), 'band': ('banddark', 'band', 'bandlight'),
         'pouch': ('pouchdark', 'pouch', 'pouchlight'),
         'wood': ('wooddark', 'wood', 'woodlight'), 'gold': ('golddark', 'gold', 'goldlight'),
         'nose': ('#170F0B', 'nose', '#4E362C'), 'eyedark': ('#1E120C', '#2A1A14', '#4A3024'), 'lash': ('#170F0A', 'lash', '#46342A')}
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
# fitted by scratch/fit_head4.py (fit_head2 + a flat face line under the muzzle, 0.38-0.40 W, and the front profile weighted x2) (plan exponents capped at 2.7, so the head is round in plan) to Funaki's front widths (1.00 W at z 0.269,
# 0.74 at 0.062: a dumpling, widest low), the side profile (forehead 0.40 W ahead, the back 0.41 W behind) and the crown (0.778 W)
CR = ([0, -0.0014, 0.4426], [0.4601, 0.3556, 0.3016], (2.6641, 1.6145, 2.6050))      # cranium
CK = ([0, -0.0195, 0.2446], [0.4720, 0.3903, 0.2151], (1.8702, 2.7021, 1.6029), 4.0500, 0.2671)  # the wide, chubby low cheek mass
K_CK = 0.1793
# the muzzle is a smooth displacement of the ball (no union crease), zero slope at its edge, its lower half fading
# into the chin; Funaki's toy muzzle is a rounder, prouder block than Takumi's: the sheet's side view puts its front
# 0.47 W and the nose tip 0.49 W ahead of the head centre
MZ = ([0, -.360, .238], [.180, .150, .215])
MZ_A = .055; MZ_IN = .40
CORNER_A = .020; CORNER_Z = .50
def head_local(q):
    d = smin(sell(q, *CR), sell(q, *CK), K_CK)
    dz = q[..., 2] - MZ[0][2]; r = np.sqrt((q[..., 0] / MZ[1][0]) ** 2 + (dz / np.where(dz < 0, MZ[1][2], MZ[1][1])) ** 2)
    d = d - MZ_A * (1 - smoother(MZ_IN, 1, r)) * smooth(-.12, -.28, q[..., 1])
    # phase-2 review: the upper cheek corners rounded in by ~0.02 W (front view), toward the sheet's dumpling
    return d + CORNER_A * smooth(.30, .47, np.abs(q[..., 0])) * np.exp(-((q[..., 2] - CORNER_Z) / .11) ** 2)
_g = np.stack(np.meshgrid(np.linspace(-.5, .5, 81), np.linspace(-.6, .6, 97), np.linspace(-.25, .15, 401), indexing='ij'), -1).reshape(-1, 3)
ZMIN = float(_g[head_local(_g) < 0][:, 2].min()); del _g
for blob in (CR, CK, MZ): blob[0][2] -= ZMIN
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
EX = .1875 * W; EZ = CHIN + .412 * W; EHW = .0842 * W; EHH = .0889 * W; EN = 2.15     # the lid hole; the rolled rim and lash add ~0.01 W
def eye_unit(psi):
    return spow(np.cos(psi), 2 / EN), spow(np.sin(psi), 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
MUZ_C = CHIN + .240 * W; MUZ_HW = .167 * W; MUZ_HH = .1335 * W          # painted muzzle oval (0.334 x 0.267 W)
NOSE_Z = CHIN + .316 * W; NOSE_TOP = CHIN + .351 * W; NOSE_BOT = CHIN + .281 * W
MZM = CHIN + .226 * W; MHW = .0826 * W; MS = 1.0                          # the U smile: corners z 0.248, bottom 0.204 (0.165 W wide)
MOUTH_LO = CHIN + .199 * W; MOUTH_HI = CHIN + .248 * W
BROW_X = .193 * W; BROW_Z = CHIN + .580 * W; BROW_L = .058 * W
BLUSH = (.310 * W, CHIN + .286 * W, .074 * W, .048 * W)

# ---------------------------------------------------------------- the headband plane (needed by the head paint)
TAU = math.radians(19.5)                                # the band leans back 19.5 deg (its back is lower)
HEZ = np.array([0, math.sin(TAU), math.cos(TAU)]); HEY = np.array([0, math.cos(TAU), -math.sin(TAU)]); HEX = np.array([1., 0, 0])
BAND_P0 = np.array([0, HY - .25 * W, CHIN + .680 * W])   # the band's centre line at the front (sheet: z 0.64-0.74 W, side 0.60-0.73)
BAND_HB = .057 * W; BAND_T = .023 * W                     # half-height (0.114 W tall in the side view), thickness off the skull
def band_q(p): return (np.asarray(p) - BAND_P0) @ HEZ
def band_cover(p): return np.zeros(np.asarray(p).shape[:-1])     # the head is kept whole under the band

# ---------------------------------------------------------------- the fur shade (shared by the face chart and the ramps)
EAR_C = {s: np.array([s * .276 * W, HY + .035, CHIN + .690 * W]) for s in (-1, 1)}
def head_occ(P, n):
    q = np.abs(band_q(P)); o = .07 * smooth(BAND_HB + .05 * W, BAND_HB + .004 * W, q)          # soft contact shade by the band
    for s in (-1, 1):
        dd = np.linalg.norm(P - EAR_C[s], axis=-1); o = o + .08 * np.exp(-(dd / (.13 * W)) ** 2)
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
for k, (hx, hz) in enumerate([(.096, .028), (.110, .037), (.124, .046)]):
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
# the silhouette belt (72-128 deg from the front): 44% denser, so the head's outline stays smooth at portrait size
def _alpha(d): return np.arccos(np.clip(-d[:, 1], -1, 1))
belt = (_alpha(D) > math.radians(72)) & (_alpha(D) < math.radians(128)) & ~inband
D3 = fib(2100 if FAST else 3600); D3 = D3[(_alpha(D3) > math.radians(72)) & (_alpha(D3) < math.radians(128))]
P3 = radial_hit(D3)
D = np.concatenate([D[~inband & ~belt], D2, D3]); Pf = np.concatenate([Pf0[~inband & ~belt], P2, P3]); keep = np.ones(len(D), bool)
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
keep &= ~(front & ((Pf[:, 0] / (MS * .138 * W)) ** 2 + ((Pf[:, 2] - MZM + .004 * W) / (.060 * W)) ** 2 < 1))
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
    return (.05 + .20 * np.sin(np.clip(psi, 0, PI)) ** .55 + .08 * np.exp(-((psi - .35) / .40) ** 2)) * smooth(-.10, .25, psi)
def lash_centreline():
    """(X, Z) eye units (X > 0 outer) and half-widths (eye radii) from the inner end over the top and out into the wing"""
    psi = np.linspace(PI - .12, .24, 30); th = lash_th(psi)
    ux, uz = eye_unit(psi); r = 1 + th / 2 - .025; P = np.stack([ux * r, uz * r], -1); hw = th / 2 + .04
    gam, Lk, w0 = .42, .034 * W, .0105 * W                   # the wing: out and up from the outer corner, tapering
    bx, bz = P[-1]; tq = np.linspace(0, 1, 9)[1:]
    Wp = np.stack([bx + Lk / EHW * tq * np.cos(gam + .30 * tq), bz + Lk / EHH * tq * np.sin(gam + .30 * tq)], -1)
    whw = np.maximum(hw[-1] * (1 - tq) ** .9, w0 / EHH * .10)
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
    y = .0355 * W * spow(v, .80); taper = (.16 + .84 * ((v + 1) / 2) ** .62)
    x = .0600 * W * spow(u, .55) * taper
    return np.stack([x, y + .002 * W], -1)
NOSE_OUT = _nose_outline()
NOSE_H = .019                                                   # the button stands 20 mm proud (a soft bump in profile)
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
EAR_OUT = 16.; EAR_R = .176 * W; EAR_AN = .064 * W; EAR_DISH = .024 * W
ear_info = {}
for s in (-1, 1):
    C0 = EAR_C[s]; ne = unit(np.array([s * math.sin(math.radians(EAR_OUT)), -math.cos(math.radians(EAR_OUT)), .10]))
    up = np.array([0, 0, 1.]); up = unit(up - ne * (up @ ne)); tt = np.cross(up, ne)
    at = au_ = EAR_R; an, dish = EAR_AN, EAR_DISH
    seg, rows_ = 36, 12; V = []
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

# ================================================================ THE HEADBAND: a rounded band swept round the skull
def build_headband():
    NPH = 72; NPR = 10
    a = np.linspace(0, 2 * PI, NPR, endpoint=False)
    ph_ = spow(np.cos(a), .45); pt_ = spow(np.sin(a), .45)         # a soft rounded-rectangle section
    cz = (BAND_P0 + HEZ * 0.)                                       # the band axis passes through the head centre column
    C_ax = np.array([0, HY, 0.]); C_ax[2] = BAND_P0[2] - (HY - BAND_P0[1]) * math.tan(TAU)
    V = []; rows = []
    phis = np.linspace(0, 2 * PI, NPH, endpoint=False)
    for ph in phis:
        dirv = -HEY * math.cos(ph) + HEX * math.sin(ph)             # 0 = the front
        o = C_ax[None, :] + HEZ[None, :] * (ph_[:, None] * BAND_HB)
        S = ray_outer(head_sdf, o, np.repeat(dirv[None], NPR, 0), t0=.0, t1=.6)
        N = grad_n(S)
        # thickness grows outward along the skull normal; the inner face sits 3 mm inside the skull
        P = S + N * (-.003 + (BAND_T + .003) * (.5 + .5 * pt_)[:, None])
        rows.append(list(range(len(V), len(V) + NPR))); V += list(P)
    F = []
    for i in range(NPH):
        a_, b_ = rows[i], rows[(i + 1) % NPH]
        for k in range(NPR): F.append((a_[k], a_[(k + 1) % NPR], b_[(k + 1) % NPR], b_[k]))
    ob = make_obj('headband', np.array(V), F, np.zeros((len(V), 2)), 'band')
    def bshade(Vv, Nn):
        o = np.zeros(len(Vv))
        for s in (-1, 1): o += .10 * np.exp(-(np.linalg.norm(Vv - EAR_C[s], axis=-1) / (.10 * W)) ** 2)
        return sval(Nn, o, hi=.20, lo=.26)
    ramp_by_normal(ob, 'band', bshade)
    return ob, C_ax
band_ob, BAND_AX = build_headband()

# ================================================================ BODY: the torso (shirt chest + overalls barrel + belly), tail
TB = ([0, .000, .278], [.290, .244, .215], (2.6, 2.4, 2.3), 3.6, .142)      # the overalls barrel (big and chubby)
TC = ([0, .010, .500], [.212, .180, .150])                                  # the shirt chest under the head
TF = ([0, -.034, .335], [.256, .212, .170])                                 # the round belly
def torso_sdf(p): return smin(smin(sell(p, *TB), ell(p, *TC), .07), ell(p, *TF), .06)
Z_EDGE = .450                                   # the shirt / overalls colour edge (the overalls' back top edge)
def body_ray(theta, z, f=torso_sdf):
    theta = np.asarray(theta, float); z = np.asarray(z, float) * np.ones_like(theta)
    d = np.stack([np.sin(theta), -np.cos(theta), np.zeros_like(theta)], -1)
    o = np.stack([np.zeros_like(theta), np.full_like(theta, .005), z], -1)
    lo = np.zeros(len(theta)); hi = np.full(len(theta), .6)
    for _ in range(36):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0; lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    P = o + d * ((lo + hi) / 2)[:, None]; return P, grad(f, P)
def build_torso():
    # rays from a centre ON the colour edge's height: the equator ring is exactly z = Z_EDGE
    OT = np.array([0, .005, Z_EDGE]); NS = 56
    el = np.radians([-87, -78, -69, -60, -52, -44, -37, -30, -24, -18, -12, -6, 0, 6, 12, 19, 27, 36, 46, 57, 70, 84])
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
        zc = P[list(f), 2].mean(); rp = 'over' if zc < Z_EDGE - 1e-6 else 'shirt'
        F.append(f); UV.append([tuple(ramp_uv(rp, val[k:k + 1])[0]) for k in f])
    for i in range(ne - 1):
        for j in range(NS): add((vid(i, j), vid(i, j + 1), vid(i + 1, j + 1), vid(i + 1, j)))
    for j in range(NS): add((vid(0, j + 1), vid(0, j), bot))
    for j in range(NS): add((vid(ne - 1, j), vid(ne - 1, j + 1), top))
    return make_obj('torso', P, F, UV, 'body', N)
build_torso()
TAIL = ([0, .244, .260], [.060, .054, .060])
def tail_sdf(p): return ell(p, *TAIL)
tail_ob, _, _ = sdf_ball('stub_tail', tail_sdf, np.array(TAIL[0]), 5, 'tail', 'fur', occ_f=torso_sdf)

# ================================================================ OVERALLS: the top hem, bib, pocket
def build_band_ring(name, zc, prof, th0, th1, group, ramp, closed):
    th = np.linspace(th0, th1, 60, endpoint=not closed); V = []; rows = []
    for dz, t in prof:
        B, N = body_ray(th, zc + dz); Nh = unit(N * np.array([1, 1, .3])); rows.append(list(range(len(V), len(V) + len(th)))); V += list(B + Nh * t)
    F = []; n = len(th)
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(n if closed else n - 1): F.append((a_[i], a_[(i + 1) % n], b_[(i + 1) % n], b_[i]))
    ob = make_obj(name, np.array(V), F, np.zeros((len(V), 2)), group)
    ramp_by_normal(ob, ramp, lambda Vv, Nn: sval(Nn, .25 * ao(head_sdf, Vv, Nn, .05), hi=.18, lo=.24))
    return ob
# the overalls' top edge: a soft rolled hem round the back and sides (the sheet's back view); the bib covers it in front
WB_Z = Z_EDGE - .004; WB_H = .013; WB_T = .0065
build_band_ring('top_hem', WB_Z, [(-WB_H, -.002), (-WB_H + .002, .0040), (-WB_H + .007, WB_T), (WB_H - .005, WB_T),
                                  (WB_H - .0015, .0042), (WB_H, -.002)], 0, 2 * PI, 'body', 'over', True)

R_REF = .30
def cloth_point(s, z, t):
    s = np.asarray(s, float); z = np.asarray(z, float); B, N = body_ray(s / R_REF, z)
    tt = np.asarray(t, float)[..., None] if np.ndim(t) else t
    return B + N * tt, N
def cloth_slab(name, outline, t_front, t_back, group, ramp, step=.016, grid=(.032, .028), shade_k=(.18, .24)):
    """a thick cloth panel: CDT of its (s, z) outline, front and back faces wrapped on the torso, a rounded rim"""
    out = resample(outline, step)
    def area(p): return .5 * np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1])
    if area(out) < 0: out = out[::-1]
    lo = out.min(0) - .02; hi = out.max(0) + .02
    gx, gz = np.meshgrid(np.arange(lo[0], hi[0], grid[0]), np.arange(lo[1], hi[1], grid[1]))
    G = np.stack([gx.ravel(), gz.ravel()], -1); G[:, 0] += grid[0] / 2 * (np.round((G[:, 1] - lo[1]) / grid[1]) % 2)
    ok = in_poly(G, out)
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
    Fo = Fo[in_poly(vout[Fo].mean(1), out)]; n2 = len(vout)
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
# the bib: from the chest (z 0.541, 0.33 m wide, the buttons just inside its corners) down; below the hem it fades into the trousers
BIB_TOP = .541; BIB_W0 = .262; BIB_W1 = .285; BIB_BOT = .360; BIB_T = .010
def bib_t(s, z):
    z = np.asarray(z, float); return .0004 + (BIB_T - .0004) * smooth(BIB_BOT, Z_EDGE + .012, z) + .0025 * smooth(BIB_TOP - .022, BIB_TOP - .010, z)
def _bib_outline():
    rt = .022; side = [(BIB_W1 + .008 * float(smooth(Z_EDGE, BIB_BOT, z)) - (BIB_W1 - BIB_W0) * float(smooth(.44, BIB_TOP, z)), z)
                       for z in np.linspace(BIB_BOT, BIB_TOP - rt, 30)]
    def arc(c, r, a0, a1, n=8): return [(c[0] + r * math.cos(a), c[1] + r * math.sin(a)) for a in np.linspace(a0, a1, n)]
    pts_ = side + arc((BIB_W0 - rt, BIB_TOP - rt), rt, 0, PI / 2) + arc((-BIB_W0 + rt, BIB_TOP - rt), rt, PI / 2, PI) + [(-w, z) for w, z in side[::-1]]
    return np.array(pts_)
bib_ob, BIB_OUT = cloth_slab('bib', _bib_outline(), bib_t, lambda s, z: np.full(np.shape(s), -.001), 'body', 'over', step=.018, grid=(.038, .034))
# the bib pocket: a big rounded-rectangle patch with a rolled top hem (0.26 m wide, z 0.292-0.459, a little to his left)
PK_X = .030; PK_W = .152; PK_TOP = .459; PK_BOT = .292; PK_T = .0055
def _pocket_outline():
    rt, rb = .022, .055
    def arc(c, r, a0, a1, n=10): return [(c[0] + r * math.cos(a), c[1] + r * math.sin(a)) for a in np.linspace(a0, a1, n)]
    x0, x1 = PK_X - PK_W, PK_X + PK_W
    pts_ = arc((x0 + rb, PK_BOT + rb), rb, PI, 1.5 * PI) + arc((x1 - rb, PK_BOT + rb), rb, 1.5 * PI, 2 * PI) + \
           arc((x1 - rt, PK_TOP - rt), rt, 0, PI / 2, 6) + arc((x0 + rt, PK_TOP - rt), rt, PI / 2, PI, 6)
    return np.array(pts_)
def pk_back(s, z): return bib_t(s, z) * (np.abs(np.asarray(s)) < BIB_W1 + .02) - .0008
def pk_front(s, z): return pk_back(s, z) + PK_T + .0035 * smooth(PK_TOP - .018, PK_TOP - .008, z)
pocket_ob, PK_OUT = cloth_slab('bib_pocket', _pocket_outline(), pk_front, pk_back, 'body', 'over', step=.016, shade_k=(.20, .26))

# ================================================================ STRAPS: thick rounded bands, straight down the back
def snap_torso(P):
    P = np.array(P, float)
    for _ in range(6): P = P - torso_sdf(P)[:, None] * grad(torso_sdf, P)
    return P, grad(torso_sdf, P)
BTN = {s: np.array([s * .140, 0, .502]) for s in (-1, 1)}
STRAP_W = (.066, .070); STRAP_T = .012
def strap_path(s):
    """the strap's guide: from the button up the chest, over the shoulder, then straight down the back to the hem at x +-0.127"""
    def dense(P, k=6):
        out = []
        for a_, b_ in zip(P, P[1:]):
            for t in np.linspace(0, 1, k, endpoint=False): out.append((1 - t) * np.array(a_) + t * np.array(b_))
        out.append(np.array(P[-1])); return np.array(out)
    F2 = dense([(s * .140, .480), (s * .140, .502), (s * .146, .550), (s * .152, .585)])
    Fy = front_hit(F2[:, 0], F2[:, 1], torso_sdf, -.6, .3)
    B2 = dense([(s * .150, .590), (s * .134, .548), (s * .128, .500), (s * .127, .438)])
    By = front_hit(B2[:, 0], B2[:, 1], torso_sdf, .6, -.3)
    SH, _ = snap_torso(np.array([(s * .156, -.10, .612), (s * .160, .0, .628), (s * .156, .10, .612)]))
    G = np.concatenate([np.stack([F2[:, 0], Fy, F2[:, 1]], -1)[np.isfinite(Fy)], SH, np.stack([B2[:, 0], By, B2[:, 1]], -1)[np.isfinite(By)]])
    return G
strap_info = {}
def build_strap(s):
    g = strap_path(s); n = 34
    L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(g, axis=0), axis=1))]); tt = np.linspace(0, L[-1], n)
    C = np.stack([np.interp(tt, L, g[:, k]) for k in range(3)], -1)
    for _ in range(2): C[1:-1] = (C[:-2] + 2 * C[1:-1] + C[2:]) / 4
    C, N = snap_torso(C)
    z = C[:, 2]; frontp = C[:, 1] < 0
    base = np.where(frontp, np.where(z <= BIB_TOP, bib_t(0, z) + .0015, bib_t(0, BIB_TOP) * smooth(BIB_TOP + .055, BIB_TOP, z) + .0025),
                    .0025 + WB_T * smooth(WB_Z + WB_H + .02, WB_Z + WB_H - .002, z))
    wd = np.where(frontp, STRAP_W[0], STRAP_W[0] + (STRAP_W[1] - STRAP_W[0]) * smooth(.60, .52, z)) * np.ones(n)
    T = unit(np.gradient(C, axis=0)); Nn = unit(N - T * (N * T).sum(1)[:, None]); B = np.cross(T, Nn)
    Cc = C + Nn * (base + STRAP_T / 2)[:, None]
    SIDES = 10; a = np.linspace(0, 2 * PI, SIDES, endpoint=False); cx = spow(np.cos(a), .45); cy = spow(np.sin(a), .55)
    V = []; rows = []
    def ring(c, b, nn, w, t):
        rows.append(list(range(len(V), len(V) + SIDES)))
        for i in range(SIDES): V.append(c + b * (w / 2 * cx[i]) + nn * (t / 2 * cy[i]))
    for end in (0, 1):
        if end == 1:
            for i in range(n): ring(Cc[i], B[i], Nn[i], wd[i], STRAP_T)
        else:
            k = 0; T0 = -T[0]
            for j in range(4, 0, -1):
                ang = j / 5 * PI / 2; ring(Cc[k] + T0 * (wd[k] / 2 * math.sin(ang)), B[k], Nn[k], wd[k] * math.cos(ang), STRAP_T * (1 - .25 * (j / 5) ** 2))
    k = n - 1; T1 = T[-1]
    for j in range(1, 5):
        ang = j / 5 * PI / 2; ring(Cc[k] + T1 * (wd[k] / 2 * math.sin(ang)), B[k], Nn[k], wd[k] * math.cos(ang), STRAP_T * (1 - .25 * (j / 5) ** 2))
    e0 = len(V); V.append(Cc[0] - T[0] * wd[0] / 2); e1 = len(V); V.append(Cc[-1] + T[-1] * wd[-1] / 2)
    F = []
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(SIDES): F.append((a_[i], a_[(i + 1) % SIDES], b_[(i + 1) % SIDES], b_[i]))
    for i in range(SIDES): F.append((rows[0][(i + 1) % SIDES], rows[0][i], e0)); F.append((rows[-1][i], rows[-1][(i + 1) % SIDES], e1))
    ob = make_obj('strap.' + ('L' if s > 0 else 'R'), np.array(V), F, np.zeros((len(V), 2)), 'body')
    ramp_by_normal(ob, 'strap', lambda Vv, Nn_: sval(Nn_, .22 * ao(head_sdf, Vv, Nn_, .05), hi=.22, lo=.24))
    kb = int(np.argmin(np.abs(C[:, 2] - BTN[s][2]) + 9 * (C[:, 1] > 0)))
    strap_info[s] = dict(btn=Cc[kb] + Nn[kb] * STRAP_T / 2, frame=(B[kb], T[kb], Nn[kb]), path=Cc)
for s in (-1, 1): build_strap(s)
def build_button(s):
    c, (b, t, nn) = strap_info[s]['btn'], strap_info[s]['frame']
    fr = Frame(c, b, nn, t)                         # local x across the strap, y along the normal, z along the strap
    def f(p):
        q = fr.local(p); return sell(q, [0, .0, 0], [.0310, .0115, .0310], (2.3, 2.0, 2.3))
    def shade(P, N):
        q = fr.local(P); rim = np.exp(-((np.sqrt(q[:, 0] ** 2 + q[:, 2] ** 2) - .023) / .004) ** 2) * .10
        return sval(N, rim, hi=.30, lo=.26)
    sdf_ball('button.' + ('L' if s > 0 else 'R'), f, c, 6, 'body', 'gold', shade=shade, t1=.06, scale=(1., .35, 1.), frame=fr)
for s in (-1, 1): build_button(s)

# ================================================================ ARMS (sleeves + fur) and LEGS (full trousers + cuffs) + FEET
joint_arms = {}; joint_legs = {}
ARM_DEG = 39.
for s, tag in ((-1, 'R'), (1, 'L')):
    sh = np.array([s * .238, .025, .525]); a = math.radians(ARM_DEG)
    dvec = unit(np.array([s * math.sin(a), -.06, -math.cos(a)]))
    root = sh - dvec * .065; elbow = sh + dvec * .105; wrist = sh + dvec * .190
    pts_ = [root, sh, elbow + np.array([0, -.004, 0]), wrist]
    # t runs over the root -> wrist spline (0.255 m): the puffed sleeve to its rolled hem ~0.07 m below the shoulder
    rows = [(0., .088, 'shirt'), (.12, .096, 'shirt'), (.24, .102, 'shirt'), (.34, .103, 'shirt'), (.42, .100, 'shirt'),
            (.465, .096, 'shirt'), (.485, .098, 'shirt'), (.505, .097, 'shirt'), (.522, .092, 'shirt'), (.532, .085, 'shirt'),
            (.540, .078, 'fur'), (.57, .074, 'fur'), (.66, .073, 'fur'), (.78, .076, 'fur'), (.88, .080, 'fur'), (.95, .083, 'fur'), (1., .084, 'fur')]
    def paw_grooves(V, NV, wrist=wrist, dvec=dvec):
        v = V - wrist; ax = v @ dvec; rad = v - np.outer(ax, dvec)
        f0 = np.array([0, -1., 0]); f0 = unit(f0 - dvec * (f0 @ dvec)); f1 = np.cross(dvec, f0)
        ang = np.arctan2(rad @ f1, rad @ f0)
        g = sum(np.exp(-((ang - a_) / .16) ** 2) for a_ in (-.42, .42))
        return .16 * g * smooth(.030, .068, ax)
    tube('arm.' + tag, pts_, rows, 'arm.' + tag, sides=22, cap_rows=8, cap_len=1.0, squash=1.08, occ_f=torso_sdf, extra_occ=paw_grooves)
    joint_arms[tag] = {'shoulder': [float(v) for v in sh], 'elbow': [float(v) for v in elbow], 'wrist': [float(v) for v in wrist],
                       'paw_tip': [float(v) for v in wrist + dvec * .084]}
FOOT = dict(r=[.116, .150, .055], p=(2.8, 2.9, 2.2), pzlo=4.0, rzlo=.044)
def foot_sdf_s(s):
    c = np.array([s * .148, -.010, .044])
    def f(p):
        d = sell(p, c, FOOT['r'], FOOT['p'], FOOT['pzlo'], FOOT['rzlo'])
        for k in (-1, 1):            # two shallow toe grooves on the front of the foot
            g = ell(p, c + np.array([k * .039, -.170, .042]), [.0065, .022, .048])
            d = smax(d, -g, .007)
        return d
    return f, c
LEG_SQ = 1.28
for s, tag in ((-1, 'R'), (1, 'L')):
    hip = np.array([s * .132, -.005, .262]); knee = np.array([s * .132, -.005, .160]); ankle = np.array([s * .142, -.008, .066])
    pts_ = [hip + np.array([0, 0, .03]), hip, knee, ankle]
    # t over the spline (z 0.29 -> 0.066): the baggy trouser leg, the rolled cuff (z 0.089-0.156), then the fur ankle into the foot
    rows = [(0., .108, 'over'), (.25, .110, 'over'), (.42, .109, 'over'), (.56, .106, 'over'), (.585, .104, 'over'),
            (.600, .109, 'over'), (.620, .114, 'over'), (.68, .1165, 'over'), (.78, .116, 'over'), (.84, .115, 'over'),
            (.870, .116, 'over'), (.882, .106, 'over'), (.890, .094, 'over'), (.896, .086, 'fur'), (.94, .082, 'fur'), (1., .082, 'fur')]
    tube('leg.' + tag, pts_, rows, 'leg.' + tag, sides=18, cap_rows=3, cap_len=.5, squash=LEG_SQ, occ_f=torso_sdf, occ_k=.25)
    ff, fc = foot_sdf_s(s)
    def foot_shade(P, N, ff=ff, fc=fc):
        lat = (P[:, 0] - fc[0]) / .114; frontz = smooth(-.10, -.14, P[:, 1] - fc[1]) * smooth(.008, .025, P[:, 2]) * smooth(.082, .062, P[:, 2])
        groove = sum(np.exp(-((lat - k * .336) / .036) ** 2) for k in (-1, 1)) * frontz
        return sval(N, .24 * groove)
    sdf_ball('foot.' + tag, ff, fc + np.array([0, 0, .01]), 8, 'leg.' + tag, 'fur', shade=foot_shade, t1=.4)
    joint_legs[tag] = {'hip': [float(v) for v in hip], 'knee': [float(v) for v in knee], 'ankle': [float(v) for v in ankle],
                       'toe': [float(fc[0]), float(fc[1] - .15), .040]}

# ================================================================ THE TOOL POUCH (his right hip, the sheet's front view) + the mallet
PCH_AZ = math.radians(-45); PCH_Z = .262
_Pp, _Np = body_ray(np.array([PCH_AZ]), PCH_Z)
PCH_N = np.array([math.sin(math.radians(-18)), -math.cos(math.radians(-18)), 0.])   # its face turns 18 deg from the front (phase-2 review: 20 deg toward the front)
PCH_T = np.cross(np.array([0, 0, 1.]), PCH_N)
PCH_HW, PCH_HD, PCH_HH = .079, .040, .074            # 0.16 wide, 0.15 tall (z 0.19-0.335); the back panel to 0.348
PCH_C = _Pp[0] + PCH_N * (PCH_HD - .004)
PFR = Frame(PCH_C, -PCH_T, -PCH_N, np.array([0, 0, 1.]))       # local x across the face, y into the body, z up
def pouch_sdf(p):
    q = PFR.local(p)
    d = sell(q, [0, 0, 0], [PCH_HW, PCH_HD, PCH_HH], (3.4, 2.6, 3.0), 2.6, PCH_HH)
    back = sell(q, [0, PCH_HD * .45, PCH_HH * .55], [PCH_HW * .97, PCH_HD * .55, PCH_HH * .68], (3.4, 2.6, 3.0))   # the taller back panel
    return smin(d, back, .008)
# the big wooden mallet (the sheet: a 0.126 m head, 0.092 across, lying across the pouch; a 0.043 m handle into it)
MAL_C = PFR.world(np.array([.024, -.004, .400 - PCH_Z]))
MAL_AX = unit(PFR.world(np.array([1., -.28, .06])) - PFR.c)
MFR = Frame(MAL_C, MAL_AX, np.cross(np.array([0, 0, 1.]), MAL_AX), np.array([0, 0, 1.]))
HDL_C = PFR.world(np.array([.012, .002, .300 - PCH_Z]))
HFR = Frame(HDL_C, PFR.M[:, 0], PFR.M[:, 1], np.array([0, 0, 1.]))
def mallet_head_sdf(p):
    q = MFR.local(p); return sell(q, [0, 0, 0], [.063, .046, .046], (6., 2., 2.))
def mallet_handle_sdf(p):
    q = HFR.local(p); return sell(q, [0, 0, 0], [.0215, .0215, .085], (2., 2., 3.))
def wood_sdf(p): return np.minimum(mallet_handle_sdf(p), mallet_head_sdf(p))
def pouch_shade(P, N):
    return sval(N, .30 * ao(lambda r: np.minimum(torso_sdf(r), wood_sdf(r)), P, N, .03), hi=.22, lo=.26)
sdf_ball('pouch', pouch_sdf, PCH_C, 8, 'pouch', 'pouch', shade=pouch_shade, t1=.25, scale=(1.1, .6, 1.2), frame=PFR)
def tool_shade(lo_z, fr):
    return lambda P, N: sval(N, .40 * ao(pouch_sdf, P, N, .03) * smooth(lo_z + .04, lo_z, fr.local(P)[:, 2]), hi=.22, lo=.24)
sdf_ball('tool_mallet_handle', mallet_handle_sdf, HDL_C, 5, 'pouch', 'wood', shade=tool_shade(.03, HFR), t1=.2, scale=(.25, .25, 1.), frame=HFR)
def mallet_shade(P, N):
    q = MFR.local(P); endf = smooth(.80, .97, np.abs(q[:, 0]) / .063)       # the end faces a touch darker (end grain)
    return sval(N, .10 * endf + .25 * ao(lambda r: np.minimum(pouch_sdf(r), torso_sdf(r)), P, N, .03), hi=.24, lo=.24)
sdf_ball('tool_mallet_head', mallet_head_sdf, MAL_C, 6, 'pouch', 'wood', shade=mallet_shade, t1=.12, scale=(1.3, 1., 1.), frame=MFR)
# the front flap: a thick rounded panel over the top of the face with a curved lower edge, and its stud
FLAP_C = PFR.world(np.array([0., -PCH_HD - .004, PCH_HH * .42]))
def flap_sdf(p):
    q = PFR.local(p) - PFR.local(FLAP_C[None])[0]
    return sell(q, [0, 0, 0], [PCH_HW * 1.03, .0075, PCH_HH * .50], (3.6, 2., 2.4), 3.6, PCH_HH * .52)
sdf_ball('pouch_flap', flap_sdf, FLAP_C, 6, 'pouch', 'pouch', t1=.12, scale=(1., .25, .6), frame=PFR,
         shade=lambda P, N: sval(N, .16 * ao(pouch_sdf, P, N, .02), hi=.24, lo=.30))
STUD_C = PFR.world(np.array([.0, -PCH_HD - .012, PCH_HH * .10]))
def stud_sdf(p): return ell(p, STUD_C, [.0090, .0070, .0090])
sdf_ball('pouch_stud', stud_sdf, STUD_C, 3, 'pouch', 'pouch', t1=.03, shade=lambda P, N: sval(N, .22, hi=.20, lo=.30))
LOOP_C = PFR.world(np.array([0., PCH_HD - .004, PCH_HH + .030]))
def loop_sdf(p):
    q = PFR.local(p) - PFR.local(LOOP_C[None])[0]; return sell(q, [0, 0, 0], [.020, .0055, .048], (3., 2., 3.))
sdf_ball('pouch_loop', loop_sdf, LOOP_C, 5, 'pouch', 'pouch', t1=.08, scale=(.4, .2, 1.), frame=PFR)
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
    C = mix(C, ramp_colour('muz', sval(n, 0., hi=.08, lo=.17)), (1 - smooth(.975, 1.022, rm)) * fr * PAINT_OPTS['muzzle'])
    # blush ovals (soft)
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .96 * (1 - smooth(.62, 1.12, r)) * fr * PAINT_OPTS['blush'])
    # brows: soft arcs tapering to rounded points
    t = np.linspace(-1, 1, 15)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * BROW_L * t, BROW_Z + .020 * W * (1 - t * t) - .008 * W - .012 * W * t], -1)   # outer end lower
        half = .0098 * W * np.maximum(0, 1 - t * t) ** .65 + .0014 * W
        box = (np.abs(x - s * BROW_X) < .09 * W) & (np.abs(z - BROW_Z) < .05 * W) & (fr > 0)
        a = np.zeros(len(x)); a[box] = stroke(x[box], z[box], Pb, half, .0030 * W)
        C = mix(C, rgb('brow'), .95 * a)
    # the U smile (the sheet: a simple even curve, corners turned up a touch, no philtrum line)
    lw = .0052 * W
    u_ = np.linspace(-1, 1, 41)
    Pm = np.stack([MHW * u_, MOUTH_LO + (MOUTH_HI - MOUTH_LO) * np.abs(u_) ** 1.8], -1)
    half = np.full(len(Pm), lw) * (1 - .35 * smooth(.80, 1.0, np.abs(u_)))
    ib = (np.abs(x) < .12 * W) & (np.abs(z - MZM) < .06 * W) & (fr > 0)
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
    ix = -s * .36; iz = -.19; irx = .76; irz = .82
    C = mix(rgb('sclera'), rgb('#E9DDD3'), .45 * smooth(.35, .95, Z))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#3E2A1F'), rgb('#2A1C14'), smooth(-.95, .10, ez))
    I = mix(I, rgb('#22150F'), smooth(.80, 1.0, r) * .60)
    I = I * (1 - .025 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 26 + r * 9)))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    pz = iz + .05; R = np.sqrt(((X - ix) / (.66 * irx)) ** 2 + ((Z - pz) / (.68 * irz)) ** 2)
    C = mix(C, rgb('pupil'), .85 * (1 - smooth(.90, 1.10, R)))
    hx = ix - s * .30 * irx; hz = iz + .50 * irz          # the big catchlight: upper, toward the nose (the sheet: 0.3 of the iris)
    big = np.sqrt(((X - hx) / (.31 * irx)) ** 2 + ((Z - hz) / (.29 * irz)) ** 2)
    small = np.sqrt(((X - (ix + s * .34 * irx)) / (.065 * irx)) ** 2 + ((Z - (iz - .46 * irz)) / (.055 * irz)) ** 2)
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
        a = (U - .5) / .48; b = (V - .5) / .48; r = np.sqrt(a * a + b * b)
        sh_ = clamp(.5 + .10 * b - .06 * a)
        C = ramp_colour('fur', sh_ - .08 * smooth(.62, .40, r))
        ri = np.sqrt(((a - .08) / .46) ** 2 + ((b - .30) / .46) ** 2)        # the light inner disc sits up (above the band) and a little out
        Ci = mix(ramp_colour('muz', clamp(.34 + .14 * b - .12 * smooth(.55, 1.0, ri))), C, .22)     # a muted tan, a touch of fur
        return mix(C, Ci, 1 - smooth(.95, 1.05, ri))
    if chart == 'nose':
        a = (U - .5) * .13 * W; b = (V - .5) * .13 * W
        C = ramp_colour('nose', .45 + .10 * smooth(-.02, .02, b))
        hl = np.exp(-(((a + .016 * W) / (.016 * W)) ** 2 + ((b - .012 * W) / (.009 * W)) ** 2))
        return mix(C, rgb('#7A5A4E'), .55 * hl)
    raise KeyError(chart)

atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [130, 96, 74, 255]
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
atlas_path = os.path.join(ROOT, 'scratch' if FAST else '', 'sk-funaki-toy_rig_atlas.png' if RIG else 'sk-funaki-toy_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Funaki_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Funaki_toy_atlas'); MAT.use_nodes = True
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
        'profile_front_W_at_z': {str(z): prof_front(z) for z in (.015, .037, .10, .147, .20, .27, .36, .454, .498, .542, .586, .63, .674, .718)},
        'profile_back_W_at_z': {str(z): back_at(z) for z in (.015, .037, .059, .103, .147, .19, .25, .30, .366, .41, .476, .542, .586, .63, .674, .696)},
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
        'pouch_x_m': [round(float(all_verts(parts['pouch'])[:, 0].min()), 3), round(float(all_verts(parts['pouch'])[:, 0].max()), 3)],
        'pouch_y_m': [round(float(all_verts(parts['pouch'])[:, 1].min()), 3), round(float(all_verts(parts['pouch'])[:, 1].max()), 3)],
        'pouch_z_m': [round(float(all_verts(parts['pouch'])[:, 2].min()), 3), round(float(all_verts(parts['pouch'])[:, 2].max()), 3)],
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
    ob = bpy.context.object; ob.name = 'Funaki_' + group.replace('.', '_')
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
           'ear.L': tuple(EAR_C[1]), 'ear.R': tuple(EAR_C[-1]), 'tail': tuple(TAIL[0]),
           'arm.L': joint_arms['L']['shoulder'], 'arm.R': joint_arms['R']['shoulder'],
           'leg.L': joint_legs['L']['hip'], 'leg.R': joint_legs['R']['hip'], 'pouch': tuple(PCH_C)}.get(group, (0, 0, 0))
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
          'hips': [0, .000, .262], 'spine': [0, .005, .380], 'chest': [0, .012, .480], 'neck': [0, .015, .570],
          'head': [float(v) for v in O], 'jaw_pivot': [0, float(HY - .10 * W), float(CHIN + .10 * W)],
          'eyes': eye_centers, 'ears': ears_j, 'arms': joint_arms, 'legs': joint_legs,
          'tail': [[float(v) for v in np.array(TAIL[0]) - np.array([0, .04, 0])], [float(v) for v in np.array(TAIL[0]) + np.array([0, .05, 0])]],
          'headband_anchor': [float(v) for v in BAND_P0], 'pouch_anchor': [float(v) for v in PCH_C],
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth SDF ball (cranium + cheek mass + muzzle), radially projected, analytic normals.',
                    'Eyelid holes ringed by 5 loops each, rim rolled in behind separate lens eyeballs; 3 loops round the mouth.',
                    'Separate pieces: eyes, lash ribbons (origin at the eye centre, for the upper lids), ears, tail, headband (rigid head follower), tool pouch + mallet (rigid hip follower, his right hip).',
                    'Arms: 17 rings shoulder->wrist (sleeve, rolled hem, fur) + mitten cap; legs: 16 rings hip->ankle (full trousers, rolled cuff, fur).']}
if RIG:
    pass
elif not FAST:
    with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-fast.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not FAST and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'sk-funaki-toy.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG: bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('FUNAKI_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
