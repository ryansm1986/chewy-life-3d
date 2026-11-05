"""Tetsu, Yukimi Spa Village's smith (Toybox zone villager, VL-2), phase-1 model. Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_yk-tetsu-toy.py [-- --fast]

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/yk-tetsu-toy.glb (--fast: no toon refinement, writes scratch/tetsu-fast.glb instead).

Technique (Funaki's / Takumi's machinery, tools/blender/codex/assets/sk-funaki-toy, re-measured for Tetsu's sheet):
- The head is ONE smooth implicit ball: a rounded cranium and a wide superellipsoid cheek mass, smooth-unioned, with a
  rounded toy-muzzle displacement (fitted to the sheet by scratch/fit_head.py). Its skin is the field's zero surface reached
  by radial projection (CDT in a stereographic domain, edge loops round both eyelid holes and the mouth), so every vertex
  carries the field's analytic normal and the face stays convex. The eyes are separate flush lens globes in lid holes.
- The nose is a glossy rounded-triangle button on the muzzle; the ears are thick solid discs rising behind the headband.
- The headband is a thick rounded-section band swept round the skull in a plane tilted 16.5 deg back (the sheet's side view).
- The torso is a bare-fur SDF (a chubby barrel, a round belly, the chest and the neck) meshed by radial projection.
  The leather apron is two thick cloth slabs (CDT outlines wrapped on the torso): the bib on the chest and the wide skirt,
  which hangs straight down below the belly. The belt is a thick rounded band round the waist (under the skirt in front)
  with a square leather keeper at the back. The scarf is a soft roll swept round the neck with a round knot and two
  leaf-shaped tails (separate pieces, for the rig). Arms are fur tubes with mitten paws; legs short fur tubes; big feet.
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
MODEL = 'D:/projects/chewy-life-3d/public/models/yk-tetsu-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'tetsu-fast.glb') if FAST else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(5)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
LOG = {}

# ---------------------------------------------------------------- the sheet's measures (measure.md)
# turnaround (front): ground y 484, ear tops y 77 -> 1.13 m (360.2 px / m); the head close-up: W = 345 px at the cheeks.
W = .636; CHIN = .634; HY = .005            # head width at the cheeks, chin height, head centre y (behind the leg axis)
SW = W / .44                                # Rosie's metric detail sizes (authored at W 0.44) scale by SW

# Tetsu's fur is dark: it is painted lighter than the swatch #4A3A36 (toward the sheet's lit fur #604139) and the game adds a
# darkGrade. Dark cloth reads near-black in the game's grade: the apron and belt are a touch lighter than the swatch.
# Every ramp keeps its hue: light and shade are value changes only.
PAL = {'fur': '#5E4239', 'furdark': '#4E372F', 'furlight': '#68493F',          # value-only (x0.83 / x1.10)
       'muz': '#B88F6E', 'muzdark': '#A38063', 'muzlight': '#C49A78',          # the swatch #A88A70, toward the sheet's lit #BE926E
       'apron': '#7C5240', 'aprondark': '#684536', 'apronlight': '#885A46',    # the swatch #6A4A3A x1.17 (the sheet's lit apron #804F3A)
       'belt': '#6C4533', 'beltdark': '#5A3A2B', 'beltlight': '#784D39',
       'buckle': '#98624A', 'buckledark': '#82543F', 'bucklelight': '#A66B51',
       'scarf': '#D4C6B2', 'scarfdark': '#BFB19E', 'scarflight': '#E0D3C0',    # the swatch #C8C0B0, a touch warmer (the sheet)
       'band': '#EA543C', 'banddark': '#CF4934', 'bandlight': '#F26147',
       'iris': '#E09A3A', 'pupil': '#1E120C', 'nose': '#221816', 'sclera': '#FFF8EF', 'blush': '#CC8676',
       'lash': '#1E140F', 'brow': '#24160F', 'mouth': '#221614'}
CHARTS = {'face': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'ear': (1280, 896, 256, 256), 'nose': (1536, 896, 256, 256)}
if RIG:   # phase-2 charts in unused atlas space (the approved paint is untouched)
    CHARTS.update({'lidU.L': (0, 0, 512, 256), 'lidU.R': (512, 0, 512, 256), 'lidD.L': (1024, 0, 512, 192), 'lidD.R': (1536, 0, 512, 192),
                   'cavity': (0, 256, 128, 128), 'tongue': (128, 256, 128, 128)})
PAINT_OPTS = {'band': True, 'blush': True, 'muzzle': True}
SKIN_LID_LINES = False     # the rig paints its lids from this skin with the lash shade off
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'muz': ('muzdark', 'muz', 'muzlight'),
         'apron': ('aprondark', 'apron', 'apronlight'), 'belt': ('beltdark', 'belt', 'beltlight'),
         'buckle': ('buckledark', 'buckle', 'bucklelight'), 'scarf': ('scarfdark', 'scarf', 'scarflight'),
         'band': ('banddark', 'band', 'bandlight'),
         'nose': ('#150E0C', 'nose', '#4A3430'), 'eyedark': ('#1E120C', '#2A1A14', '#4A3024'), 'lash': ('#140D0A', 'lash', '#42302A')}
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
# fitted by scratch/fit_head.py (Funaki's fit_head4: plan exponents capped at 2.7, the front profile weighted x2, a face line
# 0.39-0.41 W under the muzzle) to Tetsu's front widths (1.00 W at z 0.23-0.27, 0.82 at 0.05: a dumpling, widest low), the
# side profile (forehead 0.40 W ahead, the back 0.42 W behind) and the crown (0.736 W); then moved 0.012 W back, which
# splits the fit's front / back residuals (it sat 0.015 W forward)
FIT_Z0 = -.007
CR = ([0, -0.0015 + .022, 0.4411], [0.4185, 0.3416, 0.2888], (2.05, 2.1533, 1.8039))      # cranium (round review: deeper at the back, rounder dome corners)
CK = ([0, -0.0150 + .012, 0.2466], [0.4925, 0.4070, 0.2619], (2.2496, 2.7007, 1.8190), 3.6, 0.2545)  # the wide, chubby low cheek mass
K_CK = 0.1757
# the muzzle is a smooth displacement of the ball (no union crease), zero slope at its edge, its lower half fading
# into the chin; the sheet's side view puts its front 0.47-0.48 W ahead of the head centre at z 0.10-0.20 (the face line
# ~0.41) and the nose tip 0.51 W. Its painted oval is a little bigger (the paint reaches over the bump's soft edge).
MZ = ([0, -.360, .160 + FIT_Z0], [.180, .135, .265])     # rig round: a gentler lower slope (stays out of the toon shade)
MZ_A = .078; MZ_IN = .40
CORNER_A = .016; CORNER_Z = .60
def head_local(q):
    d = smin(sell(q, *CR), sell(q, *CK), K_CK)
    dz = q[..., 2] - MZ[0][2]; r = np.sqrt((q[..., 0] / MZ[1][0]) ** 2 + (dz / np.where(dz < 0, MZ[1][2], MZ[1][1])) ** 2)
    d = d - MZ_A * (1 - smoother(MZ_IN, 1, r)) * smooth(-.12, -.28, q[..., 1])
    # phase-2 review: the upper cheek corners rounded in by ~0.02 W (front view), toward the sheet's dumpling
    return d + CORNER_A * smooth(.24, .42, np.abs(q[..., 0])) * np.exp(-((q[..., 2] - CORNER_Z) / .10) ** 2)
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
EX = .236 * W; EZ = CHIN + .330 * W; EHW = .101 * W; EHH = .106 * W; EN = 2.15     # the lid hole; the rolled rim and lash add ~0.01 W
def eye_unit(psi):
    return spow(np.cos(psi), 2 / EN), spow(np.sin(psi), 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
MUZ_C = CHIN + .166 * W; MUZ_HW = .196 * W; MUZ_HT = .147 * W; MUZ_HB = .138 * W; MUZ_N = 3.2   # painted muzzle: a soft
                                                          # superellipse (0.39 x 0.30 W), squarer on top, widest a little low
NOSE_Z = CHIN + .252 * W; NOSE_TOP = CHIN + .291 * W; NOSE_BOT = CHIN + .213 * W
MZM = CHIN + .168 * W; MHW = .093 * W; MS = 1.0                           # the 'w' mouth: corners z 0.183, bottoms 0.154 (0.186 W wide)
MOUTH_LO = CHIN + .154 * W; MOUTH_HI = CHIN + .183 * W; MOUTH_MID = CHIN + .171 * W
BROW_X = .220 * W; BROW_Z = CHIN + .498 * W; BROW_L = .0725 * W
BLUSH = (.330 * W, CHIN + .200 * W, .070 * W, .046 * W)

# ---------------------------------------------------------------- the headband plane (needed by the head paint)
TAU = math.radians(18.0)                                # the band leans back 16.5 deg (its back is lower; the side view)
HEZ = np.array([0, math.sin(TAU), math.cos(TAU)]); HEY = np.array([0, math.cos(TAU), -math.sin(TAU)]); HEX = np.array([1., 0, 0])
BAND_P0 = np.array([0, HY - .25 * W, CHIN + .614 * W])   # the band's centre line at the front (sheet: z 0.554-0.664 W front, side 0.54-0.645)
BAND_HB = .056 * W; BAND_T = .026 * W                     # half-height, thickness off the skull
BAND_SAG = .025 * W                                       # the sheet's front view: the band dips at the sides (a saddle, not a plane)
BAND_AX = np.array([0, HY, BAND_P0[2] - (HY - BAND_P0[1]) * math.tan(TAU)])
def band_q(p):
    r = np.asarray(p) - BAND_AX; sx = r @ HEX; sy = -(r @ HEY)
    s2 = sx * sx / np.maximum(sx * sx + sy * sy, 1e-12)
    return (np.asarray(p) - BAND_P0) @ HEZ + BAND_SAG * math.cos(TAU) * s2
def band_cover(p): return np.zeros(np.asarray(p).shape[:-1])     # the head is kept whole under the band

# ---------------------------------------------------------------- the fur shade (shared by the face chart and the ramps)
EAR_C = {s: np.array([s * .295 * W, HY + .13 * W, CHIN + .625 * W]) for s in (-1, 1)}   # the side view: well back on the crown
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
def lash_th(psi):      # the lash band's thickness (eye radii): thick over the top, thinning down the outer side (psi 0 = outer side)
    return (.05 + .19 * np.sin(np.clip(psi + .15, 0, PI)) ** .55 + .05 * np.exp(-((psi - .30) / .40) ** 2)) * smooth(-.25, .15, psi)
def lash_centreline():
    """(X, Z) eye units (X > 0 outer) and half-widths (eye radii) from the inner top over the top and down the outer side to
    about mid-height, then the small outward flick (the sheet: a short tick out from the outer rim, at mid-height)"""
    psi = np.linspace(PI - .62, .04, 30); th = lash_th(psi)
    ux, uz = eye_unit(psi); r = 1 + th / 2 - .025; P = np.stack([ux * r, uz * r], -1); hw = th / 2 + .04
    Lk, w0 = .026 * W, .0095 * W                               # the flick: out and a touch down, tapering
    bx, bz = P[-1]; tq = np.linspace(0, 1, 9)[1:]; gam = .05 - .30 * tq
    Wp = np.stack([bx + Lk / EHW * tq * np.cos(gam), bz + Lk / EHH * tq * np.sin(gam)], -1)
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
    # a broad soft inverted triangle: a wide rounded top, the sides tapering to a round lower point (0.119 x 0.078 W)
    t = np.linspace(0, 2 * PI, n, endpoint=False); u = np.cos(t); v = np.sin(t)
    y = .036 * W * spow(v, .80); taper = (.24 + .76 * ((v + 1) / 2) ** .50)
    x = .071 * W * spow(u, .50) * taper
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
EAR_OUT = 18.; EAR_R = .158 * W; EAR_AN = .062 * W; EAR_DISH = .022 * W     # the sheet: disc 0.325 W, turned ~18 deg out
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
        o = C_ax[None, :] + HEZ[None, :] * (ph_[:, None] * BAND_HB) - np.array([0, 0, BAND_SAG * math.sin(ph) ** 2])[None, :]
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

# ================================================================ BODY: the bare-fur torso (barrel + belly + chest + neck), tail
TB = ([0, .000, .250], [.289, .245, .205], (2.6, 2.4, 2.0), 2.7, .125)      # the chubby barrel (widest z 0.22-0.28), rounder above
TF = ([0, -.040, .300], [.235, .240, .160])                                 # the round belly (front 0.28 m ahead)
TC = ([0, -.010, .470], [.240, .212, .170])                                 # the chest under the scarf
TN = ([0, .010, .600], [.180, .160, .090])                                  # the neck, under the scarf and the chin
def torso_sdf(p): return smin(smin(smin(sell(p, *TB), ell(p, *TC), .07), ell(p, *TF), .06), ell(p, *TN), .05)
def body_ray(theta, z, f=torso_sdf):
    theta = np.asarray(theta, float); z = np.asarray(z, float) * np.ones_like(theta)
    d = np.stack([np.sin(theta), -np.cos(theta), np.zeros_like(theta)], -1)
    o = np.stack([np.zeros_like(theta), np.full_like(theta, .005), z], -1)
    lo = np.zeros(len(theta)); hi = np.full(len(theta), .6)
    for _ in range(36):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0; lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    P = o + d * ((lo + hi) / 2)[:, None]; return P, grad(f, P)
def build_torso():
    OT = np.array([0, .005, .400]); NS = 56
    el = np.radians([-87, -78, -69, -60, -52, -44, -37, -30, -24, -18, -12, -6, 0, 6, 12, 19, 27, 36, 46, 57, 70, 84])
    az = np.linspace(0, 2 * PI, NS, endpoint=False)
    D = np.stack([np.cos(el)[:, None] * np.sin(az)[None], -np.cos(el)[:, None] * np.cos(az)[None], np.sin(el)[:, None] * np.ones(NS)[None]], -1).reshape(-1, 3)
    D = np.concatenate([D, [[0, 0, -1.], [0, 0, 1.]]])
    P = ray_outer(torso_sdf, OT, D, t1=.6); N = grad(torso_sdf, P)
    occ = .30 * ao(lambda q: head_sdf(q), P, N, .05)
    val = sval(N, occ, hi=.20, lo=.24)
    ne = len(el); F = []
    def vid(i, j): return i * NS + j % NS
    bot, top = len(P) - 2, len(P) - 1
    for i in range(ne - 1):
        for j in range(NS): F.append((vid(i, j), vid(i, j + 1), vid(i + 1, j + 1), vid(i + 1, j)))
    for j in range(NS): F.append((vid(0, j + 1), vid(0, j), bot))
    for j in range(NS): F.append((vid(ne - 1, j), vid(ne - 1, j + 1), top))
    return make_obj('torso', P, F, ramp_uv('fur', val), 'body', N)
build_torso()
TAIL = ([0, .236, .228], [.066, .060, .066])     # under the belt (the back view)
def tail_sdf(p): return ell(p, *TAIL)
tail_ob, _, _ = sdf_ball('stub_tail', tail_sdf, np.array(TAIL[0]), 5, 'tail', 'fur', occ_f=torso_sdf)

# ================================================================ THE BELT: a thick rounded leather band round the waist + its back keeper
def build_band_ring(name, zc, prof, th0, th1, group, ramp, closed, shade_k=(.18, .24)):
    th = np.linspace(th0, th1, 72, endpoint=not closed); V = []; rows = []
    for dz, t in prof:
        B, N = body_ray(th, zc + dz); Nh = unit(N * np.array([1, 1, .3])); rows.append(list(range(len(V), len(V) + len(th)))); V += list(B + Nh * t)
    F = []; n = len(th)
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(n if closed else n - 1): F.append((a_[i], a_[(i + 1) % n], b_[(i + 1) % n], b_[i]))
    ob = make_obj(name, np.array(V), F, np.zeros((len(V), 2)), group)
    ramp_by_normal(ob, ramp, lambda Vv, Nn: sval(Nn, .25 * ao(head_sdf, Vv, Nn, .05), hi=shade_k[0], lo=shade_k[1]))
    return ob
BELT_Z = .385; BELT_H = .034; BELT_T = .013                  # the sheet: z 0.35-0.42 (front sides, side and back views)
build_band_ring('belt', BELT_Z, [(-BELT_H, -.002), (-BELT_H + .0025, .0075), (-BELT_H + .009, BELT_T), (BELT_H - .009, BELT_T),
                                 (BELT_H - .0025, .0075), (BELT_H, -.002)], 0, 2 * PI, 'body', 'belt', True, (.20, .24))
_Bk, _Nk = body_ray(np.array([PI]), BELT_Z)
KEEP_R = float(np.hypot(_Bk[0, 0], _Bk[0, 1] - .005))
KFR = Frame(_Bk[0] + np.array([0, BELT_T + .006, 0]), [-1., 0, 0], [0, 1., 0], [0, 0, 1.])   # local y points out of his back
def keeper_sdf(p):
    q = KFR.local(p).copy(); q[..., 1] = q[..., 1] + q[..., 0] ** 2 / (2 * KEEP_R)     # curved round the back
    return sell(q, [0, 0, 0], [.066, .0135, .050], (4.2, 2.2, 4.2))
def keeper_shade(P, N):
    q = KFR.local(P); edge = smooth(.80, 1.0, np.maximum(np.abs(q[:, 0]) / .066, np.abs(q[:, 2]) / .050)) * .10
    return sval(N, edge, hi=.22, lo=.26)
sdf_ball('belt_keeper', keeper_sdf, KFR.c, 7, 'body', 'buckle', shade=keeper_shade, t1=.12, scale=(1., .35, .8), frame=KFR)

# ================================================================ THE APRON: the bib and the wide skirt (thick leather slabs)
R_REF = .30; Z_HANG = .300                                   # below Z_HANG the skirt hangs straight down (the side view)
def cloth_point(s, z, t, hang=False):
    s = np.asarray(s, float); z = np.asarray(z, float)
    zz = np.maximum(z, Z_HANG) if hang else z
    B, N = body_ray(s / R_REF, zz)
    if hang:
        k = 1 - .45 * np.clip(Z_HANG - z, 0, None)            # the hem tucks in a little toward the legs
        B = B * np.stack([k, k, np.ones_like(k)], -1) + np.stack([0 * k, .005 * (1 - k), 0 * k], -1); B[..., 2] = z
        N = unit(N * np.array([1, 1, 0.]) + np.array([0, 0, .02]))
    tt = np.asarray(t, float)[..., None] if np.ndim(t) else t
    return B + N * tt, N
def cloth_slab(name, outline, t_front, t_back, group, ramp, step=.016, grid=(.032, .028), shade_k=(.18, .24), hang=False):
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
    Pf, _ = cloth_point(vout[:, 0], vout[:, 1], tf, hang); Pb, _ = cloth_point(vout[:, 0], vout[:, 1], tb, hang)
    V = list(Pf) + list(Pb)
    F = [tuple(f) for f in Fo] + [tuple(n2 + f[::-1]) for f in Fo]
    L2 = vout[:nO]; tang = np.roll(L2, -1, 0) - np.roll(L2, 1, 0); m = unit(np.stack([tang[:, 1], -tang[:, 0]], -1))
    rows = [list(range(0, nO))]; Rr = 4
    tF = t_front(L2[:, 0], L2[:, 1]); tB = t_back(L2[:, 0], L2[:, 1]); tmid = (tF + tB) / 2; hh = (tF - tB) / 2
    for j in range(1, Rr):
        ph = PI * j / Rr; q = L2 + m * (hh * .9 * math.sin(ph))[:, None]
        Pj, _ = cloth_point(q[:, 0], q[:, 1], tmid + hh * math.cos(ph), hang)
        rows.append(list(range(len(V), len(V) + nO))); V += list(Pj)
    rows.append(list(range(n2, n2 + nO)))
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(nO): F.append((a_[i], b_[i], b_[(i + 1) % nO], a_[(i + 1) % nO]))
    ob = make_obj(name, np.array(V), F, np.zeros((len(V), 2)), group)
    ramp_by_normal(ob, ramp, lambda Vv, Nn: sval(Nn, .22 * ao(head_sdf, Vv, Nn, .05), hi=shade_k[0], lo=shade_k[1]))
    return ob, out
def arc(c, r, a0, a1, n=8): return [(c[0] + r * math.cos(a), c[1] + r * math.sin(a)) for a in np.linspace(a0, a1, n)]
# the bib: on the chest from under the scarf roll (z 0.59) down under the skirt's top hem (z 0.435); the sheet's front view:
# 0.316 m across at the top, 0.378 at z 0.45 (s = arc length on a 0.30 m reference radius)
BIB_TOP = .590; BIB_BOT = .435; BIB_S0 = .228; BIB_S1 = .250
def _bib_outline():
    rt = .036; side = [(BIB_S1 - (BIB_S1 - BIB_S0) * float(smooth(BIB_BOT, BIB_TOP, z)), z) for z in np.linspace(BIB_BOT, BIB_TOP - rt, 30)]
    pts_ = side + arc((BIB_S0 - rt, BIB_TOP - rt), rt, 0, PI / 2, 14) + arc((-BIB_S0 + rt, BIB_TOP - rt), rt, PI / 2, PI, 14) + [(-w, z) for w, z in side[::-1]]
    return np.array(pts_)
BIB_T = .009
bib_ob, BIB_OUT = cloth_slab('apron_bib', _bib_outline(), lambda s, z: np.full(np.shape(s), BIB_T), lambda s, z: np.full(np.shape(s), -.001),
                             'apron', 'apron', step=.011, grid=(.030, .027))     # rig round: a finer, clean leather edge
# the skirt: z 0.175-0.45, 0.48 m across at the top, 0.53 at z 0.33, 0.49 at the hem (front view); it wraps the belly's
# sides to about y -0.09 (side view), rides over the belt (BELT_T) and hangs straight down below the belly
SK_TOP = .450; SK_BOT = .175
def sk_half(z):
    return float(np.interp(z, [SK_BOT, .26, .33, .40, SK_TOP], [.300, .318, .325, .328, .330]))
def _skirt_outline():
    rt, rb = .024, .050
    right = [(sk_half(z), z) for z in np.linspace(SK_BOT + rb, SK_TOP - rt, 22)]
    pts_ = arc((-sk_half(SK_BOT + rb) + rb, SK_BOT + rb), rb, PI, 1.5 * PI, 10) + arc((sk_half(SK_BOT + rb) - rb, SK_BOT + rb), rb, 1.5 * PI, 2 * PI, 10) + \
           right + arc((sk_half(SK_TOP - rt) - rt, SK_TOP - rt), rt, 0, PI / 2, 6) + arc((-sk_half(SK_TOP - rt) + rt, SK_TOP - rt), rt, PI / 2, PI, 6) + \
           [(-w, z) for w, z in right[::-1]]
    return np.array(pts_)
SK_TB = BELT_T + .004; SK_T = .011
def sk_back(s, z):      # rides over the belt, then its top hem lies down on the bib (no open slit seen from the game camera)
    return SK_TB - (SK_TB - .0045) * smooth(BELT_Z + BELT_H - .004, SK_TOP - .008, np.asarray(z, float)) + 0 * np.asarray(s, float)
skirt_ob, SK_OUT = cloth_slab('apron_skirt', _skirt_outline(), lambda s, z: sk_back(s, z) + SK_T + .0025 * smooth(SK_TOP - .03, SK_TOP - .012, z),
                              sk_back, 'apron', 'apron', step=.017, grid=(.034, .030), shade_k=(.18, .26), hang=True)

# ================================================================ THE SCARF: a soft roll round the neck, a round knot and two leaf tails
SC_RX = .200; SC_RYF = .205; SC_RYB = .190; SC_ZF = .625; SC_ZB = .598
def scarf_centre(ph):
    c = np.cos(ph); ry = np.where(c > 0, SC_RYF, SC_RYB)
    return np.stack([SC_RX * np.sin(ph), .002 - ry * c, SC_ZB + (SC_ZF - SC_ZB) * (1 + c) / 2], -1)
def build_scarf_roll():
    NP, NSs = 72, 14
    ph = np.linspace(0, 2 * PI, NP, endpoint=False); C = scarf_centre(ph)
    T = unit(scarf_centre(ph + 1e-3) - scarf_centre(ph - 1e-3)); up = np.array([0, 0, 1.])
    R = unit(np.cross(T, up)); R = R * np.sign((R * (C - np.array([0, .002, 0]))).sum(1))[:, None]   # outward
    U = unit(np.cross(R, T)); U = U * np.sign(U[:, 2])[:, None]
    back = (1 - np.cos(ph)) / 2
    av = .032 + .009 * back; br = .030 - .006 * back                      # flatter and taller at the back (the back view's collar)
    a = np.linspace(0, 2 * PI, NSs, endpoint=False); V = []; NV = []
    for i in range(NP):
        for k in range(NSs):
            ca, sa = math.cos(a[k]), math.sin(a[k])
            V.append(C[i] + R[i] * br[i] * ca + U[i] * av[i] * sa); NV.append(unit(R[i] * ca / br[i] + U[i] * sa / av[i]))
    F = []
    for i in range(NP):
        for k in range(NSs):
            a_, b_ = i * NSs + k, i * NSs + (k + 1) % NSs; c_, d_ = ((i + 1) % NP) * NSs + (k + 1) % NSs, ((i + 1) % NP) * NSs + k
            F.append((a_, b_, c_, d_))
    V = np.array(V); NV = np.array(NV)
    occ = .30 * ao(lambda q: np.minimum(head_sdf(q), torso_sdf(q)), V, NV, .025)
    return make_obj('scarf_roll', V, F, ramp_uv('scarf', sval(NV, occ, hi=.18, lo=.24)), 'scarf', NV)
build_scarf_roll()
KNOT_C = np.array([0, -.236, .598])
def knot_sdf(p): return ell(p, KNOT_C, [.053, .028, .036])          # rig round: the sheet's wider, flatter knot
sdf_ball('scarf_knot', knot_sdf, KNOT_C, 6, 'scarf', 'scarf', t1=.1,
         shade=lambda P, N: sval(N, .25 * ao(lambda q: np.minimum(head_sdf(q), torso_sdf(q)), P, N, .02), hi=.18, lo=.26))
tail_frames = {}
for s in (-1, 1):
    S0 = np.array([s * .010, 0, .578]); E0 = np.array([s * .066, 0, .488])     # the leaf's narrow top at the knot, its round end out and down
    for P_ in (S0, E0):
        P_[1] = front_hit(P_[0], P_[2], torso_sdf, -.6, .3)[0] - BIB_T - .017
    ax = unit(E0 - S0); n_ = grad(torso_sdf, np.array([(S0 + E0) / 2 + np.array([0, .03, 0])]))[0]
    n_ = unit(n_ - ax * (n_ @ ax)); cr = np.cross(n_, ax)
    fr = Frame(S0, cr, -n_, ax)                              # local x across the leaf, y into the body, z down the leaf
    L = float(np.linalg.norm(E0 - S0)); tail_frames[s] = (fr, L)
    def leaf_sdf(p, fr=fr, L=L):
        q = fr.local(p)
        return smin(ell(q, [0, 0, .60 * L], [.039, .016, .054]), ell(q, [0, 0, .16 * L], [.019, .012, .032]), .016)
    sdf_ball('scarf_tail.' + ('L' if s > 0 else 'R'), leaf_sdf, fr.world(np.array([0, 0, .5 * L])), 7, 'scarf_tails', 'scarf', t1=.12,
             shade=lambda P, N: sval(N, .22 * ao(lambda q: np.minimum(knot_sdf(q), torso_sdf(q)), P, N, .02), hi=.20, lo=.26),
             scale=(.8, .45, 1.2), frame=fr)

# ================================================================ ARMS (bare fur, mitten paws) and LEGS (short fur) + FEET
joint_arms = {}; joint_legs = {}
ARM_DEG = 40.
for s, tag in ((-1, 'R'), (1, 'L')):
    sh = np.array([s * .235, .025, .550]); a = math.radians(ARM_DEG)
    dvec = unit(np.array([s * math.sin(a), -.04, -math.cos(a)]))
    root = sh - dvec * .060; elbow = sh + dvec * .118; wrist = sh + dvec * .218
    pts_ = [root, sh, elbow + np.array([0, -.004, 0]), wrist]
    rows = [(0., .092, 'fur'), (.12, .096, 'fur'), (.25, .095, 'fur'), (.40, .089, 'fur'), (.55, .084, 'fur'), (.70, .082, 'fur'),
            (.82, .083, 'fur'), (.92, .086, 'fur'), (1., .087, 'fur')]
    def paw_grooves(V, NV, wrist=wrist, dvec=dvec):
        v = V - wrist; ax = v @ dvec; rad = v - np.outer(ax, dvec)
        f0 = np.array([0, -1., 0]); f0 = unit(f0 - dvec * (f0 @ dvec)); f1 = np.cross(dvec, f0)
        ang = np.arctan2(rad @ f1, rad @ f0)
        g = sum(np.exp(-((ang - a_) / .16) ** 2) for a_ in (-.42, .42))
        return .16 * g * smooth(.030, .068, ax)
    tube('arm.' + tag, pts_, rows, 'arm.' + tag, sides=22, cap_rows=8, cap_len=1.0, squash=1.12, occ_f=torso_sdf, extra_occ=paw_grooves)
    joint_arms[tag] = {'shoulder': [float(v) for v in sh], 'elbow': [float(v) for v in elbow], 'wrist': [float(v) for v in wrist],
                       'paw_tip': [float(v) for v in wrist + dvec * .087]}
FOOT = dict(r=[.127, .165, .058], p=(2.8, 2.9, 2.2), pzlo=4.0, rzlo=.046)
def foot_sdf_s(s):
    c = np.array([s * .163, -.030, .046])
    def f(p):
        d = sell(p, c, FOOT['r'], FOOT['p'], FOOT['pzlo'], FOOT['rzlo'])
        for k in (-1, 1):            # two shallow toe grooves on the front of the foot (three toes)
            g = ell(p, c + np.array([k * .042, -.186, .044]), [.0068, .024, .050])
            d = smax(d, -g, .007)
        return d
    return f, c
LEG_SQ = 1.28
for s, tag in ((-1, 'R'), (1, 'L')):
    hip = np.array([s * .142, -.010, .250]); knee = np.array([s * .145, -.015, .160]); ankle = np.array([s * .155, -.025, .075])
    pts_ = [hip + np.array([0, 0, .03]), hip, knee, ankle]
    rows = [(0., .122, 'fur'), (.25, .124, 'fur'), (.45, .121, 'fur'), (.65, .116, 'fur'), (.82, .111, 'fur'), (.92, .107, 'fur'), (1., .105, 'fur')]
    tube('leg.' + tag, pts_, rows, 'leg.' + tag, sides=18, cap_rows=3, cap_len=.5, squash=LEG_SQ, occ_f=torso_sdf, occ_k=.25)
    ff, fc = foot_sdf_s(s)
    def foot_shade(P, N, ff=ff, fc=fc):
        lat = (P[:, 0] - fc[0]) / .125; frontz = smooth(-.11, -.155, P[:, 1] - fc[1]) * smooth(.008, .025, P[:, 2]) * smooth(.086, .064, P[:, 2])
        groove = sum(np.exp(-((lat - k * .336) / .036) ** 2) for k in (-1, 1)) * frontz
        return sval(N, .24 * groove)
    sdf_ball('foot.' + tag, ff, fc + np.array([0, 0, .01]), 8, 'leg.' + tag, 'fur', shade=foot_shade, t1=.4)
    joint_legs[tag] = {'hip': [float(v) for v in hip], 'knee': [float(v) for v in knee], 'ankle': [float(v) for v in ankle],
                       'toe': [float(fc[0]), float(fc[1] - .16), .040]}

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
    dzm = z - MUZ_C; nn_ = np.where(dzm > 0, MUZ_N, 2.3)                 # squarer on top, a round jaw below
    rm = (np.abs(x / MUZ_HW) ** nn_ + np.abs(dzm / np.where(dzm > 0, MUZ_HT, MUZ_HB)) ** nn_) ** (1 / nn_)
    Cm = ramp_colour('muz', sval(n, 0., hi=.05, lo=.06)) * (1 + .10 * smooth(MUZ_C + .02 * W, MUZ_C - MUZ_HB, z))[:, None]   # rig round: the lower half lifted ~10%
    C = mix(C, np.clip(Cm, 0, 1), (1 - smooth(.985, 1.012, rm)) * fr * PAINT_OPTS['muzzle'])
    # blush ovals (soft)
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .96 * (1 - smooth(.62, 1.12, r)) * fr * PAINT_OPTS['blush'])
    # brows: soft arcs tapering to rounded points
    t = np.linspace(-1, 1, 15)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * BROW_L * t, BROW_Z + .024 * W * (1 - ((t + .2) / 1.2) ** 2) - .010 * W - .011 * W * t], -1)   # outer end lower
        half = .0128 * W * np.maximum(0, 1 - t * t) ** .55 + .0018 * W
        box = (np.abs(x - s * BROW_X) < .09 * W) & (np.abs(z - BROW_Z) < .05 * W) & (fr > 0)
        a = np.zeros(len(x)); a[box] = stroke(x[box], z[box], Pb, half, .0030 * W)
        C = mix(C, rgb('brow'), .95 * a)
    # the 'w' mouth (the sheet): two small bowls meeting under a short philtrum from the nose, the corners turned up
    lw = .0048 * W
    u_ = np.linspace(-1, 1, 61); v_ = np.abs(u_); q_ = np.abs(2 * v_ - 1)
    zc_ = np.where(v_ > .5, MOUTH_LO + (MOUTH_HI - MOUTH_LO) * q_ ** 1.7, MOUTH_LO + (MOUTH_MID - MOUTH_LO) * q_ ** 1.6)
    ib = (np.abs(x) < .12 * W) & (np.abs(z - MZM) < .07 * W) & (fr > 0)
    a = np.zeros(len(x))
    for side in (-1, 1):
        k = (u_ * side >= 0); Pm = np.stack([MHW * u_[k], zc_[k]], -1)
        half = np.full(len(Pm), lw) * (1 - .35 * smooth(.80, 1.0, v_[k]))
        a[ib] = np.maximum(a[ib], stroke(x[ib], z[ib], Pm, half, .0026 * W))
    Pp = np.array([[0, NOSE_BOT + .004 * W], [0, MOUTH_MID]])
    a[ib] = np.maximum(a[ib], stroke(x[ib], z[ib], Pp, np.array([lw * .92, lw * .92]), .0026 * W))
    C = mix(C, rgb('mouth'), .96 * a)
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
    ix = -s * .345; iz = -.03; irx = .66; irz = .90            # the sheet: the iris 0.66 of the opening, touching the nose-side rim
    C = mix(rgb('sclera'), rgb('#EADCCF'), .50 * smooth(.30, .95, Z))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#EFA840'), rgb('#D88A24'), smooth(-.85, -.10, ez))                 # amber #E0A040: bright below, shaded under the lid
    I = mix(I, rgb('#9C5418'), smooth(-.05, .80, ez) * .85)
    I = mix(I, rgb('#6E3C14'), smooth(.78, 1.0, r) * .80)                         # the dark outer ring
    I = I * (1 - .035 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 26 + r * 9)) * smooth(.45, .75, r))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    px = ix - s * .22; pz = iz + .10; R = np.sqrt(((X - px) / (.70 * irx)) ** 2 + ((Z - pz) / (.75 * irz)) ** 2)   # the sheet's big pupil, on the nose side
    C = mix(C, rgb('pupil'), .97 * (1 - smooth(.94, 1.06, R)))
    hx = ix - s * .32; hz = iz + .44                         # the big catchlight: upper, toward the nose (the sheet: 0.32 of the iris)
    big = np.sqrt(((X - hx) / .215) ** 2 + ((Z - hz) / .205) ** 2)
    small = np.sqrt(((X - (ix + s * .30)) / .065) ** 2 + ((Z - (iz - .55)) / .058) ** 2)
    C = mix(C, rgb('#FFFAF4'), np.maximum(1 - smooth(.92, 1.08, big), .85 * (1 - smooth(.88, 1.12, small))))
    C = mix(C, rgb('lash'), smooth(.925, .99, sr) * (.80 + .20 * smooth(-.2, .5, Z)))  # the lid contact rim (the sheet's dark outline all round)
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
        ri = np.sqrt(((a - .13) / .45) ** 2 + ((b - .24) / .45) ** 2)        # the light inner disc sits up (above the band) and a little out
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
atlas_path = os.path.join(ROOT, 'scratch' if FAST else '', 'yk-tetsu-toy_rig_atlas.png' if RIG else 'yk-tetsu-toy_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Tetsu_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Tetsu_toy_atlas'); MAT.use_nodes = True
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
def silhouette():
    out = {}
    BODY = all_verts([o for g in ('body', 'apron', 'tail', 'leg.L', 'leg.R', 'scarf', 'scarf_tails') for o in parts[g]])
    for z in (.02, .06, .10, .14, .16, .20, .24, .28, .30, .34, .38, .40, .44, .48, .52, .56, .60):
        k = np.abs(BODY[:, 2] - z) < .006; A = all_verts([o for g in ('arm.L', 'arm.R') for o in parts[g]]); ka = np.abs(A[:, 2] - z) < .006
        out[str(z)] = {'half_w': round(float(np.abs(BODY[k, 0]).max()), 3) if k.any() else None,
                       'front_y': round(float(BODY[k, 1].min()), 3) if k.any() else None, 'back_y': round(float(BODY[k, 1].max()), 3) if k.any() else None,
                       'arm_outer_x': round(float(np.abs(A[ka, 0]).max()), 3) if ka.any() else None}
    return out
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
        'muzzle_oval_W': [round(2 * MUZ_HW / W, 3), round((MUZ_HT + MUZ_HB) / W, 3), round((MUZ_C - CHIN) / W, 3)],
        'nose_W': [round(float(np.ptp(NOSE_OUT[:, 0])) / W, 3), round(float(np.ptp(NOSE_OUT[:, 1])) / W, 3)],
        'band_front_z_W': band_front_edges(), 'band_width_W': round(float(np.ptp(BV[:, 0]) / W), 3),
        'ear_top_m': round(float(max(EV[1][:, 2].max(), EV[-1][:, 2].max())), 4),
        'ear_outer_x_W': round(float(EV[1][:, 0].max() / W), 3),
        'body_width_m': round(float(np.ptp(all_verts(parts['body'])[:, 0])), 3),
        'body_depth_m': [round(float(all_verts(parts['body'])[:, 1].min()), 3), round(float(all_verts(parts['body'])[:, 1].max()), 3)],
        'arm_span_m': round(float(np.ptp(all_verts(parts['arm.L'] + parts['arm.R'])[:, 0])), 3),
        'apron_bbox_m': [[round(float(v), 3) for v in all_verts(parts['apron']).min(0)], [round(float(v), 3) for v in all_verts(parts['apron']).max(0)]],
        'scarf_bbox_m': [[round(float(v), 3) for v in all_verts(parts['scarf']).min(0)], [round(float(v), 3) for v in all_verts(parts['scarf']).max(0)]],
        'scarf_tails_bbox_m': [[round(float(v), 3) for v in all_verts(parts['scarf_tails']).min(0)], [round(float(v), 3) for v in all_verts(parts['scarf_tails']).max(0)]],
        'silhouette_m_at_z': silhouette(),
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
    ob = bpy.context.object; ob.name = 'Tetsu_' + group.replace('.', '_')
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
           'leg.L': joint_legs['L']['hip'], 'leg.R': joint_legs['R']['hip'], 'scarf': tuple(KNOT_C), 'scarf_tails': tuple(KNOT_C),
           'apron': (0, -.20, SK_TOP)}.get(group, (0, 0, 0))
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
          'hips': [0, .000, .250], 'spine': [0, .005, .370], 'chest': [0, .010, .480], 'neck': [0, .010, .600],
          'head': [float(v) for v in O], 'jaw_pivot': [0, float(HY - .10 * W), float(CHIN + .10 * W)],
          'eyes': eye_centers, 'ears': ears_j, 'arms': joint_arms, 'legs': joint_legs,
          'tail': [[float(v) for v in np.array(TAIL[0]) - np.array([0, .04, 0])], [float(v) for v in np.array(TAIL[0]) + np.array([0, .05, 0])]],
          'headband_anchor': [float(v) for v in BAND_P0], 'scarf_knot': [float(v) for v in KNOT_C],
          'scarf_tails': {('L' if s > 0 else 'R'): {'root': [float(v) for v in tail_frames[s][0].c], 'tip': [float(v) for v in tail_frames[s][0].world(np.array([0, 0, tail_frames[s][1] + .03]))]} for s in (-1, 1)},
          'apron_skirt_top': [0, -.29, SK_TOP], 'belt_keeper': [float(v) for v in KFR.c],
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth SDF ball (cranium + cheek mass + muzzle), radially projected, analytic normals.',
                    'Eyelid holes ringed by 5 loops each, rim rolled in behind separate lens eyeballs; 3 loops round the mouth.',
                    'Separate pieces: eyes, lash ribbons (origin at the eye centre, for the upper lids), ears, tail, headband (rigid head follower), scarf roll + knot (chest/neck), scarf tails (hanging cloth), apron bib + skirt (hanging cloth), belt + keeper in the body.',
                    'Arms: 9 rings shoulder->wrist (bare fur) + mitten cap; legs: 7 rings hip->ankle (bare fur) + feet.']}
if RIG:
    pass
elif not FAST:
    with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-fast.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not FAST and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'yk-tetsu-toy.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG: bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('TETSU_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
