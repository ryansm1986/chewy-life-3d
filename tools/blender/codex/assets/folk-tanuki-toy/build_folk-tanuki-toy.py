"""The Blender townsfolk tanuki (Z-D6 "Blender everything", task folk-tanuki-toy), phase-1 models. One family build:
design A (Momo, the gardener: ivory shirt, green short overalls, a peach flower by her left ear) and design B (Bun, the
baker's helper: a butter-yellow smock bell with a cream pocket, a powder-blue neckerchief). Blender 4.3, no addons.
Deterministic.

    blender --background --factory-startup --python build_folk-tanuki-toy.py -- --design a|b|all [--fast]

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/folk-tanuki-<x>-toy.glb (--fast: no toon refinement, writes scratch/folk-tanuki-<x>-fast.glb instead).

Technique: the folk-panda-toy family build (itself Hokuto's, Funaki's and Takumi's machinery), every part re-measured on
this sheet (measure-a.md, measure-b.md):
- The head is ONE smooth implicit ball: a rounded cranium and a wide superellipsoid cheek mass, smooth-unioned, with a
  soft front muzzle displacement (fitted per design by scratch/fit_head.py). Its skin is the field's zero surface reached
  by radial projection (CDT in a stereographic domain, edge loops round both eyelid holes and the mouth), so every vertex
  carries the field's analytic normal and the face stays convex. The eyes are separate flush lens globes in lid holes;
  the tanuki mask (one band over the bridge, the sheet's outline), the cream muzzle, the blush and the brows are painted
  on the convex skin (no sockets).
- The upper lash lines are their own objects (<Name>_lash_L/R): thick tapered rolls with a wing and a second flick.
- The nose is a glossy rounded button; the ears are thick rounded-triangle volumes, tucked behind the crown.
- A: a chunky flower of five thick peach petal lobes round a domed yellow centre, by the left ear.
- The body is built in Hokuto's units and mapped to metres at the end by diag(BS * SXB, BS * SYB, BS), BS = CHIN / 0.4484
  (so every body constant below is in those units; the head is queried in that space through head_sdf_b). The torso is
  an SDF meshed by horizontal-equator radial projection. A: the overalls cover the torso to one exact colour ring under
  the arms, a rounded rim and a front bib panel, a waist seam, thick straps over the shoulders; short balloon overall legs.
  B: the smock is the torso unioned with a bell drape to a rolled hem, a cream patch pocket; the neckerchief (a thick
  band on the shoulders, a ball knot, two flattened teardrop ends) and the tail are built in metres after the mapping.
- One 2048 painted atlas per design: the face chart painted from 3D positions, two eye charts, the nose chart and 1-D
  shading ramps (soft painted light baked into the colour, never hard shadows).
"""
import bpy, bmesh, math, json, os, sys, struct, zlib, subprocess
import numpy as np
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt
from mathutils.kdtree import KDTree

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
FAST = '--fast' in ARGV
DESIGN = globals().get('DESIGN_OVERRIDE') or (ARGV[ARGV.index('--design') + 1] if '--design' in ARGV else 'a')
if DESIGN == 'all':          # one fresh Blender per design (each build starts from an empty scene)
    rest = [a_ for i_, a_ in enumerate(ARGV) if a_ != '--design' and (i_ == 0 or ARGV[i_ - 1] != '--design')]
    for d_ in ('a', 'b'):
        subprocess.run([bpy.app.binary_path, '--background', '--factory-startup', '--python', os.path.abspath(__file__), '--', '--design', d_] + rest, check=True)
    sys.exit(0)
assert DESIGN in ('a', 'b'), DESIGN
RIG = bool(globals().get('RIG_MODE'))       # set by a later rig script: part labels; no approved file is written
if RIG: FAST = False
# LITE (rig mode, or --lite): fewer triangles on flat and gently curved areas, so the rig with its lids and mouth stays
# <= 22k; the approved phase-1 GLB is the full build
LITE = RIG or '--lite' in ARGV
def lite(full, lt): return lt if LITE else full
TASK = 'folk-tanuki-%s-toy' % DESIGN
NAME = {'a': 'TanukiA', 'b': 'TanukiB'}[DESIGN]
MODEL = 'D:/projects/chewy-life-3d/public/models/%s.glb' % TASK
OUT_MODEL = os.path.join(ROOT, 'scratch', 'folk-tanuki-%s-fast.glb' % DESIGN) if FAST else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(5)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
LOG = {'design': DESIGN}
A_ = DESIGN == 'a'; B_ = DESIGN == 'b'

# ---------------------------------------------------------------- the sheet's measures (measure-a.md, measure-b.md)
# Turnaround (front views): A's ground y 317.5 and skull crown y 83 -> 1.05 m crown-to-sole (223.3 px / m); B's ground
# y 654.5, crown y 418 (225.2 px / m). The front head is 157 / 165 px wide at the cheeks (W 0.703 / 0.733 m); A's chin
# y 185 (0.593 m), B's hidden under the neckerchief, ~0.597 m. The head close-ups draw the head taller than the
# turnaround (crown 0.723 W vs 0.650 W), so their vertical layout is used x 0.90 (measure-a.md, note 1).
W = {'a': .703, 'b': .733}[DESIGN]          # head width at the cheeks
CHIN = {'a': .593, 'b': .597}[DESIGN]       # chin height
HY = {'a': .040, 'b': .030}[DESIGN]         # head centre y (the side views: the head sits a little behind the belly)
SW = W / .44                                # Rosie's metric detail sizes (authored at W 0.44) scale by SW
BS = CHIN / .4484                           # the body is built in Hokuto's units and mapped to metres by BS (x SXB, y SYB)
SXB, SYB = {'a': (1.08, 1.18), 'b': (1.20, 1.25)}[DESIGN]
BSV = np.array([BS * SXB, BS * SYB, BS])

def tone(h, f):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    if f < 1: c = [v * f for v in c]
    else: c = [v + (255 - v) * (f - 1) for v in c]
    return '#%02X%02X%02X' % tuple(int(round(min(255, max(0, v)))) for v in c)
def trio(name, h, dk=.84, lt=1.12):
    return {name: h, name + 'dark': tone(h, dk), name + 'light': tone(h, lt)}
# The sheet's swatches (the notes' hex values are authoritative). The dark mask / limb brown reads near-black in the
# game's grade, so it is painted a touch lighter (same hue); every ramp keeps its hue: light and shade are value changes.
DARK = '#54423B'                                                          # the swatch #4A3A34, lifted a touch
FUR = {'a': '#A08070', 'b': '#8F7466'}[DESIGN]
PAL = {'sclera': '#FFF8EF', 'lash': '#231915', 'mouth': '#3A241C', 'pupil': '#2A1F1A'}
PAL.update(trio('fur', FUR, .86, 1.10)); PAL.update(trio('muz', '#E7D6BD', .88, 1.10)); PAL.update(trio('black', DARK, .80, 1.12))
PAL.update({'iris': '#68432C', 'nose': '#32251F', 'blush': '#E8A093', 'brow': '#3E2E28'})
if A_:
    PAL.update(trio('shirt', '#F4E8D7', .88, 1.06)); PAL.update(trio('cloth', '#8DAA72', .86, 1.10))
    PAL.update(trio('strap', '#86A36C', .86, 1.10)); PAL.update(trio('button', '#E8C77B', .88, 1.20))
    PAL.update(trio('acc', '#EAA382', .86, 1.12))
else:
    PAL.update(trio('shirt', '#E8C77B', .86, 1.10)); PAL.update(trio('cloth', '#E8C77B', .86, 1.10))
    PAL.update(trio('strap', '#E2C073', .86, 1.10)); PAL.update(trio('button', '#F4E8D7', .88, 1.06))
    PAL.update(trio('pocket', '#F4E8D7', .88, 1.06)); PAL.update(trio('acc', '#8FB8CA', .84, 1.12))
CHARTS = {'face': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'nose': (1536, 896, 256, 256)}
if RIG:   # phase-2 charts in unused atlas space (the approved paint is untouched)
    CHARTS.update({'lidU.L': (0, 0, 512, 256), 'lidU.R': (512, 0, 512, 256), 'lidD.L': (1024, 0, 512, 192), 'lidD.R': (1536, 0, 512, 192),
                   'cavity': (0, 256, 128, 128), 'tongue': (128, 256, 128, 128)})
PAINT_OPTS = {'band': True, 'blush': True, 'muzzle': True}
SKIN_LID_LINES = False     # the rig paints its lids from this skin with the lash shade off
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'muz': ('muzdark', 'muz', 'muzlight'), 'black': ('blackdark', 'black', 'blacklight'),
         'shirt': ('shirtdark', 'shirt', 'shirtlight'), 'cloth': ('clothdark', 'cloth', 'clothlight'),
         'strap': ('strapdark', 'strap', 'straplight'), 'button': ('buttondark', 'button', 'buttonlight'),
         'acc': ('accdark', 'acc', 'acclight'),
         'nose': ('#1E1612', 'nose', '#5A4A44'), 'lash': ('#140E0C', 'lash', '#5A4A46')}
if B_: RAMPS['pocket'] = ('pocketdark', 'pocket', 'pocketlight')
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
# fitted per design by scratch/fit_head.py (Nelder-Mead, 24 parameters incl. a soft muzzle displacement held to <= 0.08 W;
# plan exponents capped at 2.7, the cheek mass's lower exponent held near its upper one so no crease shows) to the measured front widths (a broad squircle, widest at z 0.22-0.30, B fuller and lower),
# the side profiles (the cream muzzle ~0.48 W ahead of the head centre, the back ~0.41 W) and the crown (0.65 / 0.62 W)
HEAD_FIT = {
    'a': [0.0015, 0.4419, 0.4168, 0.3491, 0.2581, 1.6529, 2.5345, 2.207, -0.0051, 0.3056, 0.5134, 0.4302, 0.2033, 2.7049, 2.67, 1.9889, 2.5787, 0.2616, 0.1355, 0.044, 0.1687, 0.2055, 0.1705, 0.1816],
    'b': [0.0017, 0.4078, 0.4139, 0.3586, 0.2386, 2.2177, 2.1236, 2.1468, -0.0051, 0.2569, 0.5031, 0.4045, 0.1929, 2.705, 2.7003, 2.0565, 2.6008, 0.2117, 0.1619, 0.0622, 0.1854, 0.2197, 0.1743, 0.1839]}
_hf = os.path.join(ROOT, 'scratch', 'fit_head_best_%s.json' % DESIGN)
if os.environ.get('USE_FIT_JSON') and os.path.exists(_hf): HEAD_FIT[DESIGN] = json.load(open(_hf))
_x = HEAD_FIT[DESIGN]
CR = ([0, _x[0], _x[1]], [_x[2], _x[3], _x[4]], (_x[5], _x[6], _x[7]))                       # cranium
CK = ([0, _x[8], _x[9]], [_x[10], _x[11], _x[12]], (_x[13], _x[14], _x[15]), _x[16], _x[17])  # the wide, chubby low cheek mass
K_CK = _x[18]
# the muzzle is a smooth displacement of the ball (no union crease), zero slope at its edge, its lower half fading into the chin
MZ = ([0, -.400, _x[20]], [_x[21], _x[22], _x[23]])
MZ_A = _x[19]; MZ_IN = .40
EYE_MASK = float(os.environ.get('EYE_MASK', '0')); EYE_MASK_R = (float(os.environ.get('EYE_MASK_R0', '1.10')), float(os.environ.get('EYE_MASK_R1', '1.90')))
FACE = {'a': dict(ex=.180, ez=.310, ehw=.075, ehh=.081), 'b': dict(ex=.180, ez=.305, ehw=.075, ehh=.081)}[DESIGN]
def head_local(q):
    d = smin(sell(q, *CR), sell(q, *CK), K_CK)
    dz = q[..., 2] - MZ[0][2]; r = np.sqrt((q[..., 0] / MZ[1][0]) ** 2 + (dz / np.where(dz < 0, MZ[1][2], MZ[1][1])) ** 2)
    disp = MZ_A * (1 - smoother(MZ_IN, 1, r)) * smooth(-.10, -.30, q[..., 1])
    if EYE_MASK:          # (rig test) the muzzle's swell kept out of the eye openings, so the face stays convex under the eyes
        em = 0.
        for s_ in (-1, 1):
            sr_ = ((np.abs(q[..., 0] - s_ * FACE['ex']) / FACE['ehw']) ** 2.1 + (np.abs(dz - (FACE['ez'] - MZ[0][2] - ZMIN_)) / FACE['ehh']) ** 2.1) ** (1 / 2.1)
            em = np.maximum(em, 1 - smoother(EYE_MASK_R[0], EYE_MASK_R[1], sr_))
        disp = disp * (1 - em)
    return d - disp
ZMIN_ = 0.
_g = np.stack(np.meshgrid(np.linspace(-.5, .5, 81), np.linspace(-.6, .6, 97), np.linspace(-.25, .15, 401), indexing='ij'), -1).reshape(-1, 3)
ZMIN = float(_g[head_local(_g) < 0][:, 2].min()); del _g
for blob in (CR, CK, MZ): blob[0][2] -= ZMIN
LOG['head_zmin_shift_W'] = round(ZMIN, 4)
def L2M(q): return np.stack([q[..., 0] * W, HY + q[..., 1] * W, CHIN + q[..., 2] * W], -1)
def M2L(p): return np.stack([p[..., 0] / W, (p[..., 1] - HY) / W, (p[..., 2] - CHIN) / W], -1)
def head_sdf(p): return head_local(M2L(p)) * W
def head_sdf_b(p): return head_sdf(np.asarray(p) * BSV) / BS         # the head seen from the body's (Hokuto) units
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

# ---------------------------------------------------------------- face layout (front projection, metres; measure-<x>.md)
# the close-up's numbers, z x 0.90 (note 1): the eye opening (sclera + iris inside the mask) 0.150 x 0.162 W
EX = FACE['ex'] * W; EZ = CHIN + FACE['ez'] * W; EHW = FACE['ehw'] * W; EHH = FACE['ehh'] * W; EN = 2.05
def eye_unit(psi):
    return spow(np.cos(psi), 2 / EN), spow(np.sin(psi), 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
DZ = {'a': 0., 'b': -.010}[DESIGN]                                       # B's features sit a touch lower on her fuller head
MUZ_C = CHIN + (.177 + DZ) * W; MUZ_HW = .166 * W; MUZ_HH = .124 * W; MUZ_TAPER = .20   # the crisp cream muzzle, narrower on top
NOSE_Z = CHIN + (.275 + DZ) * W; NOSE_TOP = NOSE_Z + .018 * W; NOSE_BOT = NOSE_Z - .018 * W
MZM = CHIN + (.212 + DZ) * W; MHW = .066 * W; MS = .90                   # the smile: 0.13 W wide, corners z 0.225, bottom 0.194
MOUTH_LO = CHIN + (.194 + DZ) * W; MOUTH_HI = CHIN + (.226 + DZ) * W
BROW_X = .170 * W; BROW_Z = CHIN + (.522 + 2.5 * DZ) * W; BROW_L = .060 * W
BLUSH = (.300 * W, CHIN + (.211 + DZ) * W, .050 * W, .033 * W)
# the tanuki mask (x, z in W, his left half from the bridge's top over the eye, round the outer cheek lobe and back in under
# the muzzle; measure-a.md, the close-up traced on measure/grid_a.png, z x 0.90): one band joined over the bridge, a thin
# rim over each eye, broad cheek lobes carrying the blush; its lower inner part lies under the painted muzzle
_MASK_HALF = [(0, .398), (.05, .410), (.10, .437), (.15, .455), (.20, .461), (.25, .453), (.285, .432), (.32, .405), (.355, .375),
              (.385, .343), (.408, .307), (.420, .272), (.414, .240), (.396, .210), (.360, .184), (.305, .166), (.250, .163),
              (.200, .171), (.160, .190), (.100, .222), (0, .240)]
MASK_PTS = [(x, z * .90 + DZ) for x, z in _MASK_HALF] + [(-x, z * .90 + DZ) for x, z in _MASK_HALF[-2:0:-1]]
def poly_sd(x, z, poly):
    """signed distance to a closed polygon (negative inside), vectorised"""
    P = np.asarray(poly, float); n = len(P); best = np.full(len(x), 9.)
    inside = np.zeros(len(x), bool)
    for i in range(n):
        a = P[i]; b = P[(i + 1) % n]; ab = b - a; L2 = ab @ ab
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        best = np.minimum(best, np.hypot(x - (a[0] + t * ab[0]), z - (a[1] + t * ab[1])))
        inside ^= ((a[1] > z) != (b[1] > z)) & (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1] + 1e-30) + a[0])
    return np.where(inside, -best, best)
def closed_cr(P, k=6):
    P = np.asarray(P, float); n = len(P); out = []
    for i in range(n):
        p0, p1, p2, p3 = P[(i - 1) % n], P[i], P[(i + 1) % n], P[(i + 2) % n]
        for t in np.linspace(0, 1, k, endpoint=False):
            out.append(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return np.array(out)
def _smooth_loop(P, it=2):
    P = np.asarray(P, float)
    for _ in range(it): P = (np.roll(P, 1, 0) + 2 * P + np.roll(P, -1, 0)) / 4
    return P
MASK_POLY = closed_cr(_smooth_loop(MASK_PTS, 1) * W + np.array([0, CHIN]), 4)     # metres (x, z)
def patch_alpha(x, z, fr, aa=.0016):
    """the mask in front projection, soft 2-3 mm borders, front half only"""
    return (1 - smooth(-aa, aa, poly_sd(x, z, MASK_POLY))) * fr
def muzzle_r(x, z):
    """the cream muzzle's normalised radius (1 on its outline): an oval, its upper half narrowing"""
    dz = (z - MUZ_C) / MUZ_HH; hw = MUZ_HW * (1 - MUZ_TAPER * smooth(0, 1, dz))
    return np.sqrt((x / hw) ** 2 + dz ** 2)

# ---------------------------------------------------------------- the ears and the head accessory (needed by the head paint)
# the rounded-triangle ears (front: x 0.14-0.41 W, apex ~(0.29, 0.72) W, the lower half tucked behind the crown; side:
# ~0.08 W behind the head centre, broad); local half-sizes in W: base half-width r, half-height h, half-thickness t
EAR = {'a': dict(c=(.290, .085, .578), r=.160, h=.150, t=.135, yaw=25., up=4., roll=10.),
       'b': dict(c=(.292, .080, .548), r=.164, h=.150, t=.138, yaw=25., up=4., roll=10.)}[DESIGN]
EAR_C = {s: np.array([s * EAR['c'][0] * W, HY + EAR['c'][1] * W, CHIN + EAR['c'][2] * W]) for s in (-1, 1)}
if A_:
    # the flower by her left ear (the close-up: centre (0.33, 0.62) W -> z 0.56 W, 0.25 W across, facing the viewer and out)
    _fx, _fz = .275 * W, CHIN + .515 * W
    _o = np.array([0, HY, _fz]); _lo, _hi = 0., PI / 2          # the head's surface point at height _fz whose x is _fx (horizontal rays)
    for _ in range(40):
        _th = (_lo + _hi) / 2; _S = ray_outer(head_sdf, _o, np.array([[math.sin(_th), -math.cos(_th), 0.]]), t1=.6)[0]
        if _S[0] > _fx: _hi = _th
        else: _lo = _th
    _n = grad_n(_S[None])[0]; LOG['flower_base'] = {'x_W': round(float(_S[0] / W), 3), 'azimuth_deg': round(math.degrees(_th), 1)}
    # the flower faces between the skin's normal there and the viewer (the sheet draws it face-on from the front and the
    # side alike), lifted off the skin so no petal sinks into the head or the ear
    FL_N = unit(.55 * _n + .45 * unit(np.array([math.sin(math.radians(30)), -math.cos(math.radians(30)), .20])))
    FL_C = _S + _n * .024 + FL_N * .004
    LOG['flower_normal_out_deg'] = round(math.degrees(math.atan2(FL_N[0], -FL_N[1])), 1)
    _up = unit(np.array([0, 0, 1.]) - FL_N * FL_N[2]); FL_FR = Frame(FL_C, np.cross(_up, FL_N), FL_N, _up)   # local x across, y = normal, z up
    ACC_C = FL_C
else:
    ACC_C = None

# ---------------------------------------------------------------- the fur shade (shared by the face chart and the ramps)
def head_occ(P, n):
    o = np.zeros(np.asarray(P).shape[:-1])
    for s in (-1, 1):
        dd = np.linalg.norm(P - EAR_C[s], axis=-1); o = o + .08 * np.exp(-(dd / (.12 * W)) ** 2)
    if A_:
        dd = np.linalg.norm(P - FL_C, axis=-1); o = o + .05 * np.exp(-(dd / (.10 * W)) ** 2)
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
for k, (hx, hz) in enumerate([(.112, .040), (.126, .049), (.140, .058)]):
    a = np.linspace(0, 2 * PI, 40, endpoint=False)
    add_loop(to_dom(surf_dir(MS * hx * W * spow(np.cos(a), .8), MZM - .002 * W + hz * W * np.sin(a))), 'mouth_%d' % k)
# (rig round) points inside the mouth loops along the painted smile, so the rig's cut along it has a dense seam (rows a little
# above and below the line; kept inside the innermost loop shrunk 15 % toward its centre)
_ml = np.array([pts[i] for i in tags['mouth_0']]); _mc = _ml.mean(0); _ms = _mc + (_ml - _mc) * .85
def _in_loop(q, poly):
    x_, y_ = q[:, 0], q[:, 1]; ins = np.zeros(len(q), bool)
    for i_ in range(len(poly)):
        x1, y1 = poly[i_]; x2, y2 = poly[(i_ + 1) % len(poly)]
        ins ^= ((y1 > y_) != (y2 > y_)) & (x_ < (x2 - x1) * (y_ - y1) / (y2 - y1 + 1e-30) + x1)
    return ins
_mx = np.linspace(-.095, .095, 22) * W
_mz0 = MOUTH_LO + (MOUTH_HI - MOUTH_LO) * np.clip(np.abs(_mx) / MHW, 0, 1) ** 2.1
_mq = np.concatenate([to_dom(surf_dir(_mx, _mz0 + dz_ * W)) for dz_ in (-.020, -.0085, .0085, .020)])
_mq = _mq[_in_loop(_mq, _ms)]; pts.extend([tuple(p) for p in _mq]); LOG['mouth_inner_points'] = len(_mq)
NB = 64; AB = math.radians(150)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
def fib(n):
    ii = np.arange(n) + .5; phi = np.arccos(1 - 2 * ii / n); th = PI * (1 + 5 ** .5) * ii
    return np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
NF = 1300 if FAST else lite(1500, 1300)
D = fib(NF); D = D[np.arccos(np.clip(-D[:, 1], -1, 1)) < math.radians(147.)]
D2 = fib(4400 if FAST else lite(4700, 4300)); D2 = D2[np.arccos(np.clip(-D2[:, 1], -1, 1)) < math.radians(62)]
P2 = radial_hit(D2)
band2 = (np.abs(P2[:, 0]) < .44 * W) & (P2[:, 2] > CHIN + .10 * W) & (P2[:, 2] < CHIN + .58 * W)
D2 = D2[band2]; P2 = P2[band2]
Pf0 = radial_hit(D)
inband = (np.abs(Pf0[:, 0]) < .44 * W) & (Pf0[:, 2] > CHIN + .10 * W) & (Pf0[:, 2] < CHIN + .58 * W) & (np.arccos(np.clip(-D[:, 1], -1, 1)) < math.radians(62))
# the silhouette belt (72-128 deg from the front): 44% denser, so the head's outline stays smooth at portrait size
def _alpha(d): return np.arccos(np.clip(-d[:, 1], -1, 1))
belt = (_alpha(D) > math.radians(72)) & (_alpha(D) < math.radians(128)) & ~inband
D3 = fib(1600 if FAST else lite(2200, 2000)); D3 = D3[(_alpha(D3) > math.radians(72)) & (_alpha(D3) < math.radians(128))]
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
keep &= ~(front & ((Pf[:, 0] / (MS * .154 * W)) ** 2 + ((Pf[:, 2] - MZM + .002 * W) / (.072 * W)) ** 2 < 1))
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
    REFINE_ADD = int(os.environ.get('REFINE_ADD', '240')); D_LOW, D_T = .12, .45
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
NSEG = lite(24, 20)
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
def lash_th(psi):      # the lash band's thickness (eye radii): medium on top, swelling to the outer corner (psi 0 = outer side)
    return (.035 + .085 * np.sin(np.clip(psi, 0, PI)) ** .55 + .085 * np.exp(-((psi - .35) / .40) ** 2)) * smooth(-.10, .25, psi)
def lash_centreline():
    """(X, Z) eye units (X > 0 outer) and half-widths (eye radii) from the inner end over the top and out into the wing
    (the sheet's upper flick: out and a little up from the outer corner, 0.034 W long)"""
    psi = np.linspace(PI - .14, .26, 30); th = lash_th(psi)
    ux, uz = eye_unit(psi); r = 1 + th / 2 - .025; P = np.stack([ux * r, uz * r], -1); hw = th / 2 + .028
    gam, Lk, w0 = .30, .042 * W, .0105 * W                   # the wing: out and up from the outer corner, tapering, tip curling up
    bx, bz = P[-1]; tq = np.linspace(0, 1, 9)[1:]
    Wp = np.stack([bx + Lk / EHW * tq * np.cos(gam + .35 * tq), bz + Lk / EHH * tq * np.sin(gam + .35 * tq)], -1)
    whw = np.maximum(hw[-1] * (1 - tq) ** .9, w0 / EHH * .10)
    return np.concatenate([P, Wp]), np.concatenate([hw, whw])
LASH_C2, LASH_HW = lash_centreline()
def flick_centreline():
    """the sheet's second, smaller flick just under the wing: from the outer rim at psi 0.02, out and level, 0.024 W long"""
    ux, uz = eye_unit(np.array([.04])); bx, bz = ux[0] * 1.03, uz[0] * 1.03; tq = np.linspace(0, 1, 9)
    gam, Lk = -.02, .025 * W
    P = np.stack([bx + Lk / EHW * tq * np.cos(gam + .30 * tq), bz + Lk / EHH * tq * np.sin(gam + .30 * tq)], -1)
    hw = np.maximum(.085 * (1 - tq) ** .9, .010)
    return P, hw
FLICK_C2, FLICK_HW = flick_centreline()
def eye_pt(s, X, Z):
    x = s * EX + s * EHW * np.asarray(X, float); z = EZ + EHH * np.asarray(Z, float)
    y = front_hit(x, z); S = np.stack([x, y, z], -1); return S, grad_n(S)
lash_info = {}
NLS = 8
def lash_roll(s, C2in, HWin, NLT, hp0):
    L_ = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(C2in * [EHW, EHH], axis=0), axis=1))]); tt = np.linspace(0, L_[-1], NLT + 1)
    C2 = np.stack([np.interp(tt, L_, C2in[:, 0]), np.interp(tt, L_, C2in[:, 1])], -1); hw = np.interp(tt, L_, HWin) * EHH
    S, n = eye_pt(s, C2[:, 0], C2[:, 1])
    tg = np.gradient(S, axis=0); tg = unit(tg - n * (tg * n).sum(1, keepdims=True)); sd = unit(np.cross(n, tg))
    u = tt / tt[-1]
    hp = hp0 * (.55 + .45 * smooth(0, .25, u)) * (1 - .60 * smooth(.75, 1.0, u))
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
    return V, NV, F, S, hp
for s, tag in ((-1, 'R'), (1, 'L')):
    V1, N1, F1, S1, hp1 = lash_roll(s, LASH_C2, LASH_HW, 26, .0075 * W)
    V2, N2, F2, S2, hp2 = lash_roll(s, FLICK_C2, FLICK_HW, 8, .0060 * W)      # the sheet's second, smaller flick
    V = np.vstack([V1, V2]); NV = np.vstack([N1, N2]); F = F1 + [tuple(int(i) + len(V1) for i in f_) for f_ in F2]
    make_obj('lash.' + tag, V, F, ramp_uv('lash', sval(NV, 0., hi=.30, lo=.10)), 'lash.' + tag, NV)
    lash_info[tag] = dict(tip=[float(v) for v in S1[-1]], root=[float(v) for v in S1[0]], max_proud_W=round(float(hp1.max() / W), 4))
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
    # a broad rounded oval-triangle, the top a touch wider (the sheet: 0.080 x 0.034 W)
    t = np.linspace(0, 2 * PI, n, endpoint=False); u = np.cos(t); v = np.sin(t)
    y = .0195 * W * spow(v, .85); taper = (.68 + .32 * ((v + 1) / 2) ** .60)
    x = .0470 * W * spow(u, .70) * taper
    return np.stack([x, y + .001 * W], -1)
NOSE_OUT = _nose_outline(lite(48, 34))
NOSE_H = .0095                                                  # the button stands 8.5 mm proud (the side view: a small bump on the muzzle)
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

# ================================================================ EARS: thick rounded triangles, tucked behind the crown
# the sheet: the front shows x 0.14-0.41 W, the rounded apex at z ~0.72 W, the lower half behind the crown; from the side
# a broad thick lobe ~0.08 W behind the head centre; faces turned ~24 deg outward, the tops leaning out a little
EAR['p'] = (2.0, 2.0, 2.0)
ear_info = {}
for s in (-1, 1):
    C0 = EAR_C[s]; yw = math.radians(EAR['yaw'])
    ne = unit(np.array([s * math.sin(yw), -math.cos(yw), math.tan(math.radians(EAR['up']))]))
    up = np.array([0, 0, 1.]); up = unit(up - ne * (up @ ne)); tt = np.cross(up, ne)
    rl = math.radians(EAR['roll']) * s
    up, tt = unit(up * math.cos(rl) + tt * math.sin(rl)), unit(tt * math.cos(rl) - up * math.sin(rl))
    fr_e = Frame(C0, tt, ne, up)                         # local x lateral, y thickness (front), z up
    rad = np.array([EAR['r'], EAR['t'], EAR['h']]) * W
    def ear_sdf(p, fr_e=fr_e, rad=rad):
        # round thick cups (round. 2): barely narrower toward the round apex, full thickness to the top, a shallow dish in
        # the front face behind a round rim, so no edge-on view reads as a thin horn
        q = fr_e.local(p); u = smooth(-1., 1., q[..., 2] / rad[2]); k = 1 - .12 * u
        q2 = np.stack([q[..., 0] / k, q[..., 1], q[..., 2]], -1)
        d = sell(q2, [0, 0, 0], rad, EAR['p']) * (.6 + .4 * k)
        dish = ell(q, [0, rad[1] * 1.05, -.06 * rad[2]], [.60 * rad[0], .42 * rad[1], .62 * rad[2]])
        return smax(d, -dish, .010)
    def ear_shade(P, N, C0=C0):
        o = .30 * ao(head_sdf, P, N, .03)
        return sval(N, o, hi=.30, lo=.20)
    sdf_ball('ear.' + ('L' if s > 0 else 'R'), ear_sdf, C0, lite(7, 6), 'ear.' + ('L' if s > 0 else 'R'), 'black',
             shade=ear_shade, t1=.25, scale=(1, .55, 1), frame=fr_e)
    ear_info[s] = (C0, ne, up, tt)

# ================================================================ THE HEAD ACCESSORY: A's flower, B's beret (rigid head followers)
if A_:
    # five thick, rounded peach petal lobes round a core (star-shaped from the centre, so one radial mesh), the yellow
    # centre a domed button (the sheet's close-up: 0.25 W across, petals ~0.12 W each); no leaf on this sheet
    FS = 1.22
    PET_R0, PET_R = .046 * FS, (.034 * FS, .020 * FS, .027 * FS)   # petal centre radius; petal radii (radial, thickness, across)
    PET_A0 = math.radians(90 + 8)                             # the first petal points up (a touch toward the face)
    def flower_sdf(p):
        q = FL_FR.local(p); d = ell(q, [0, 0, 0], [.036, .017, .036])
        for k in range(5):
            a = PET_A0 + 2 * PI * k / 5; ca, sa = math.cos(a), math.sin(a)
            # the petal's local frame: u radial (in the flower plane: local x / z), v across, y thickness
            u = q[..., 0] * ca + q[..., 2] * sa - PET_R0; v = -q[..., 0] * sa + q[..., 2] * ca
            e = sell(np.stack([v, q[..., 1] + .002 * (u / .040) ** 2, u], -1), [0, 0, 0], [PET_R[2], PET_R[1], PET_R[0]], (2.0, 2.0, 2.2))
            d = smin(d, e, .0045)
        return d
    def flower_shade(P, N):
        q = FL_FR.local(P); rr = np.sqrt(q[:, 0] ** 2 + q[:, 2] ** 2)
        a = np.arctan2(q[:, 2], q[:, 0]); seam = np.cos(5 * (a - PET_A0)) ; gap = smooth(.6, -1.0, seam) * smooth(.022, .050, rr)
        o = .30 * ao(head_sdf, P, N, .02) + .12 * gap + .10 * smooth(.038, .011, rr)
        return sval(N, o, hi=.24, lo=.24)
    sdf_ball('flower', flower_sdf, FL_C, lite(9, 8) if not FAST else 7, 'acc', 'acc', shade=flower_shade, t1=.13, scale=(1, .40, 1), frame=FL_FR)
    FC_C = FL_C + FL_N * .016
    def fcentre_sdf(p): return sell(FL_FR.local(p) - np.array([0, .016, 0]), [0, 0, 0], [.033, .0155, .033], (2.0, 2.0, 2.0))
    def fcentre_shade(P, N): return sval(N, .10 * ao(flower_sdf, P, N, .006), hi=.30, lo=.20)
    sdf_ball('flower_centre', fcentre_sdf, FC_C, 5, 'acc', 'button', shade=fcentre_shade, t1=.05, scale=(1, .55, 1), frame=FL_FR)
    acc_info = dict(flower_centre=[float(v) for v in FL_C], flower_normal=[float(v) for v in FL_N])
else:
    acc_info = {}

# ================================================================ BODY (in Hokuto's units: mapped to metres by BSV at the join)
# A: Hokuto's fitted torso (an overalls barrel, a shirt chest, a round belly), mapped wider and deeper (SXB, SYB) to the
# sheet's pear: the shorts +-0.298 m at z 0.275 m, 0.50 m deep. B: the smock bell: a wide barrel with a flat bottom at the
# hem (z 0.167 m), +-0.37 m at z 0.19-0.28 m, ~0.60 m deep, a fuller belly.
if A_:
    TB = ([0, .0029, .2039], [.2120, .1480, .1540], (3.40, 3.40, 2.00), 3.00, .1000)   # the overalls barrel: a pear, wide low hips, flat seat
    TC = ([0, .0087, .3516], [.1858, .1167, .1312])                                    # the shirt chest under the head
    TF = ([0, -.0350, .2628], [.1561, .1089, .1235])                                   # the round belly (the bib adds its thickness)
    Z_EDGE = .363                                   # the shirt / overalls colour edge, all round (z 0.48 m: under the arms)
else:
    TB = ([0, .0040, .2150], [.2300, .1760, .1650], (2.60, 2.60, 2.20), 4.0, .0950)    # the smock bell: flat bottom at the hem
    TC = ([0, .0087, .3516], [.1900, .1250, .1312])
    TF = ([0, -.0400, .2500], [.2000, .1400, .1350])
    Z_EDGE = .335                                   # (the mesh's equator ring; the smock is one colour)
HEM_DIP = .0225 if B_ else 0.                      # B: the smock's hem curves ~3 cm down at the front centre (the sheet)
def hem_dip(x, y):
    return HEM_DIP * smooth(0., .16, -np.asarray(y)) * np.cos(np.clip(np.asarray(x) / .26, -1, 1) * PI / 2) ** 2
def torso_sdf(p):
    p = np.asarray(p, float); pb = p
    if HEM_DIP:
        pb = p + np.stack([np.zeros(p.shape[:-1]), np.zeros(p.shape[:-1]), hem_dip(p[..., 0], p[..., 1]) * smooth(.21, .14, p[..., 2])], -1)
    return smin(smin(sell(pb, *TB), ell(p, *TC), .080), ell(p, *TF), .0513)
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
    OT = np.array([0, .005, Z_EDGE]); NS = lite(44, 38)
    el = np.radians([-88, -83, -78, -73, -68, -63, -57, -51, -45, -39, -33, -27, -21, -15, -10, -5, 0, 6, 13, 21, 30, 40, 52, 66, 80])
    az = np.linspace(0, 2 * PI, NS, endpoint=False)
    D = np.stack([np.cos(el)[:, None] * np.sin(az)[None], -np.cos(el)[:, None] * np.cos(az)[None], np.sin(el)[:, None] * np.ones(NS)[None]], -1).reshape(-1, 3)
    D = np.concatenate([D, [[0, 0, -1.], [0, 0, 1.]]])
    P = ray_outer(torso_sdf, OT, D, t1=.6); P[:-2][np.abs(np.repeat(el, NS)) < 1e-9, 2] = Z_EDGE
    N = grad(torso_sdf, P)
    occ = .30 * ao(head_sdf_b, P, N, .05)
    val = sval(N, occ, hi=.20, lo=.24)
    ne = len(el); F = []; UV = []
    def vid(i, j): return i * NS + j % NS
    bot, top = len(P) - 2, len(P) - 1
    def add(f):
        zc = P[list(f), 2].mean(); rp = 'cloth' if (A_ and zc < Z_EDGE - 1e-6) else 'shirt'
        F.append(f); UV.append([tuple(ramp_uv(rp, val[k:k + 1])[0]) for k in f])
    for i in range(ne - 1):
        for j in range(NS): add((vid(i, j), vid(i, j + 1), vid(i + 1, j + 1), vid(i + 1, j)))
    for j in range(NS): add((vid(0, j + 1), vid(0, j), bot))
    for j in range(NS): add((vid(ne - 1, j), vid(ne - 1, j + 1), top))
    return make_obj('torso', P, F, UV, 'body', N)
build_torso()

# ================================================================ CLOTH helpers: bands, slabs wrapped on a body surface
def build_band_ring(name, zc, prof, th0, th1, group, ramp, closed):
    th = np.linspace(th0, th1, lite(60, 44), endpoint=not closed); V = []; rows = []
    if callable(zc): zc = zc(th)                    # a ring whose height follows the azimuth (B's dipping hem)
    for dz, t in prof:
        B, N = body_ray(th, zc + dz); Nh = unit(N * np.array([1, 1, .3])); rows.append(list(range(len(V), len(V) + len(th)))); V += list(B + Nh * t)
    F = []; n = len(th)
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(n if closed else n - 1): F.append((a_[i], a_[(i + 1) % n], b_[(i + 1) % n], b_[i]))
    ob = make_obj(name, np.array(V), F, np.zeros((len(V), 2)), group)
    ramp_by_normal(ob, ramp, lambda Vv, Nn: sval(Nn, .25 * ao(head_sdf_b, Vv, Nn, .05), hi=.20, lo=.24))
    return ob
R_REF = .19
def az_for_x(x, z, f=torso_sdf):
    """the azimuth on the body where the front surface has world x (bisection), for outlines given in front projection"""
    x = np.asarray(x, float); z = np.asarray(z, float); lo = np.zeros(len(x)); hi = np.full(len(x), 1.45)
    sg = np.sign(x); ax = np.abs(x)
    for _ in range(30):
        m = (lo + hi) / 2; P, _ = body_ray(m, z, f); big = P[:, 0] > ax; hi = np.where(big, m, hi); lo = np.where(big, lo, m)
    return sg * (lo + hi) / 2
def xz_to_s(P, f=torso_sdf):
    P = np.asarray(P, float); return np.stack([az_for_x(P[:, 0], P[:, 1], f) * R_REF, P[:, 1]], -1)
def cloth_point(s, z, t, f=torso_sdf):
    s = np.asarray(s, float); z = np.asarray(z, float); B, N = body_ray(s / R_REF, z, f)
    tt = np.asarray(t, float)[..., None] if np.ndim(t) else t
    return B + N * tt, N
def dist_to(Pp, loop):
    d = np.full(len(Pp), 9.)
    for i in range(len(loop)):
        a = loop[i]; b = loop[(i + 1) % len(loop)]; ab = b - a; t = np.clip(((Pp - a) @ ab) / (ab @ ab), 0, 1)
        d = np.minimum(d, np.linalg.norm(Pp - (a + t[:, None] * ab), axis=1))
    return d
def cloth_slab(name, outline, t_front, t_back, group, ramp, step=.012, grid=(.022, .020), shade_k=(.18, .24), f=torso_sdf, extra_occ=None):
    """a thick cloth panel: CDT of its (s, z) outline, front and back faces wrapped on the body, a rounded rim"""
    out = resample(outline, step)
    def area(p): return .5 * np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1])
    if area(out) < 0: out = out[::-1]
    lo = out.min(0) - .02; hi = out.max(0) + .02
    gx, gz = np.meshgrid(np.arange(lo[0], hi[0], grid[0]), np.arange(lo[1], hi[1], grid[1]))
    G = np.stack([gx.ravel(), gz.ravel()], -1); G[:, 0] += grid[0] / 2 * (np.round((G[:, 1] - lo[1]) / grid[1]) % 2)
    ok = in_poly(G, out)
    ok &= dist_to(G, out) > step * .8
    G = G[ok]; P2 = np.concatenate([out, G]); nO = len(out)
    res = delaunay_2d_cdt([Vector(p) for p in P2], [(i, (i + 1) % nO) for i in range(nO)], [], 0, 1e-9)
    vout = np.array([[v.x, v.y] for v in res[0]]); Fo = np.array([list(f_) for f_ in res[2]])
    assert len(vout) == len(P2), name + ' CDT merged points'
    Fo = Fo[in_poly(vout[Fo].mean(1), out)]; n2 = len(vout)
    tf = t_front(vout[:, 0], vout[:, 1]); tb = t_back(vout[:, 0], vout[:, 1])
    Pf, _ = cloth_point(vout[:, 0], vout[:, 1], tf, f); Pb, _ = cloth_point(vout[:, 0], vout[:, 1], tb, f)
    V = list(Pf) + list(Pb)
    F = [tuple(f_) for f_ in Fo] + [tuple(n2 + f_[::-1]) for f_ in Fo]
    L2 = vout[:nO]; tang = np.roll(L2, -1, 0) - np.roll(L2, 1, 0); m = unit(np.stack([tang[:, 1], -tang[:, 0]], -1))
    rows = [list(range(0, nO))]; Rr = 4
    tF = t_front(L2[:, 0], L2[:, 1]); tB = t_back(L2[:, 0], L2[:, 1]); tmid = (tF + tB) / 2; hh = (tF - tB) / 2
    for j in range(1, Rr):
        ph = PI * j / Rr; q = L2 + m * (hh * .9 * math.sin(ph))[:, None]
        Pj, _ = cloth_point(q[:, 0], q[:, 1], tmid + hh * math.cos(ph), f)
        rows.append(list(range(len(V), len(V) + nO))); V += list(Pj)
    rows.append(list(range(n2, n2 + nO)))
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(nO): F.append((a_[i], b_[i], b_[(i + 1) % nO], a_[(i + 1) % nO]))
    ob = make_obj(name, np.array(V), F, np.zeros((len(V), 2)), group)
    def sh(Vv, Nn):
        o = .22 * ao(head_sdf_b, Vv, Nn, .05)
        if extra_occ is not None: o = o + extra_occ(Vv, Nn)
        return sval(Nn, o, hi=shade_k[0], lo=shade_k[1])
    ramp_by_normal(ob, ramp, sh)
    return ob, out
def snap_torso(P):
    P = np.array(P, float)
    for _ in range(6): P = P - torso_sdf(P)[:, None] * grad(torso_sdf, P)
    return P, grad(torso_sdf, P)
def arc(c, r, a0, a1, n=7): return [(c[0] + r * math.cos(a), c[1] + r * math.sin(a)) for a in np.linspace(a0, a1, n)]

if A_:
    # ============================================================ A's OVERALLS: the top rim, the waist seam, the straps
    # the overalls cover the torso to the colour ring (z 0.48 m) all round, front and back (the sheet's front, side and back
    # views); a soft rolled rim along that edge, and a thin raised seam at the waist (z 0.374 m)
    WB_Z = Z_EDGE - .007; WB_H = .010; WB_T = .0055
    build_band_ring('overall_rim', WB_Z, [(-WB_H, -.002), (-WB_H + .0025, .0035), (-WB_H + .006, WB_T), (WB_H - .005, WB_T),
                                          (WB_H - .0015, .0035), (WB_H, -.0005)], 0, 2 * PI, 'body', 'strap', True)
    SEAM_Z = .283
    build_band_ring('waist_seam', SEAM_Z, [(-.0045, -.0015), (-.002, .0018), (.002, .0018), (.0045, -.0015)], 0, 2 * PI, 'body', 'strap', True)
    def bib_t(s, z): return np.full(np.shape(s), .0010)
    BIB_LINE = Z_EDGE
    BTN = None
    STRAP_W = (.054, .054); STRAP_T = .0105
    STRAP_FRONT = lambda s: [(s * .087, Z_EDGE - .012), (s * .087, Z_EDGE + .010), (s * .092, .410), (s * .098, .445)]
    STRAP_SH = lambda s: [(s * .104, -.07, .472), (s * .106, .005, .488), (s * .102, .08, .472)]
    STRAP_BACK = lambda s: [(s * .096, .450), (s * .090, .405), (s * .087, Z_EDGE + .010), (s * .087, Z_EDGE - .012)]
else:
    # ============================================================ B's SMOCK: a rolled hem, the cream patch pocket
    HEM_Z = TB[0][2] - TB[4] + .009
    def hem_z(th): return HEM_Z - hem_dip(np.sin(th) * .20, -np.cos(th) * .17)
    build_band_ring('smock_hem', hem_z, [(-.009, -.003), (-.0065, .0040), (-.002, .0068), (.003, .0068), (.008, .0035), (.011, -.002)],
                    0, 2 * PI, 'body', 'strap', True)
    # the big cream pocket: x +-0.113 Hu, z 0.138-0.275 Hu (the sheet: +-0.18 m, z 0.184-0.366 m), straight top, round bottom corners
    PK_W = .113; PK_TOP = .275; PK_BOT = .140; PK_T = .0060
    def _pocket_outline():
        rt, rb = .012, .042
        x0, x1 = -PK_W, PK_W
        pts_ = arc((x0 + rb, PK_BOT + rb), rb, PI, 1.5 * PI, 9) + arc((x1 - rb, PK_BOT + rb), rb, 1.5 * PI, 2 * PI, 9) +                arc((x1 - rt, PK_TOP - rt), rt, 0, PI / 2, 5) + arc((x0 + rt, PK_TOP - rt), rt, PI / 2, PI, 5)
        return xz_to_s(np.array(pts_))
    def pk_back(s, z): return np.full(np.shape(s), -.0006)
    def pk_front(s, z): return pk_back(s, z) + PK_T + .0016 * smooth(PK_TOP - .008, PK_TOP - .002, np.asarray(z, float))
    pocket_ob, PK_OUT = cloth_slab('smock_pocket', _pocket_outline(), pk_front, pk_back, 'body', 'pocket', step=.011, grid=(.024, .022),
                                   shade_k=(.22, .26))
    BTN = None

# ================================================================ STRAPS: thick rounded bands, straight down the back
def strap_path(s):
    """the strap's guide: from the bib straight up the chest, over the shoulder under the head, then straight down the back"""
    def dense(P, k=6):
        out = []
        for a_, b_ in zip(P, P[1:]):
            for t in np.linspace(0, 1, k, endpoint=False): out.append((1 - t) * np.array(a_) + t * np.array(b_))
        out.append(np.array(P[-1])); return np.array(out)
    F2 = dense(STRAP_FRONT(s))
    Fy = front_hit(F2[:, 0], F2[:, 1], torso_sdf, -.6, .3)
    B2 = dense(STRAP_BACK(s))
    By = front_hit(B2[:, 0], B2[:, 1], torso_sdf, .6, -.3)
    SH, _ = snap_torso(np.array(STRAP_SH(s)))
    G = np.concatenate([np.stack([F2[:, 0], Fy, F2[:, 1]], -1)[np.isfinite(Fy)], SH, np.stack([B2[:, 0], By, B2[:, 1]], -1)[np.isfinite(By)]])
    return G
strap_info = {}
def build_strap(s):
    g = strap_path(s); n = lite(28, 22)
    L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(g, axis=0), axis=1))]); tt = np.linspace(0, L[-1], n)
    C = np.stack([np.interp(tt, L, g[:, k]) for k in range(3)], -1)
    for _ in range(2): C[1:-1] = (C[:-2] + 2 * C[1:-1] + C[2:]) / 4
    C, N = snap_torso(C)
    z = C[:, 2]; frontp = C[:, 1] < 0
    base = np.where(frontp, np.where(z <= BIB_LINE, bib_t(0, z) + .0015, bib_t(0, BIB_LINE) * smooth(BIB_LINE + .040, BIB_LINE, z) + .0025),
                    .0025 + WB_T * smooth(WB_Z + WB_H + .02, WB_Z + WB_H - .002, z))
    wd = np.where(frontp, STRAP_W[0], STRAP_W[0] + (STRAP_W[1] - STRAP_W[0]) * smooth(.45, .40, z)) * np.ones(n)
    T = unit(np.gradient(C, axis=0)); Nn = unit(N - T * (N * T).sum(1)[:, None]); B = np.cross(T, Nn)
    Cc = C + Nn * (base + STRAP_T / 2)[:, None]
    SIDES = 8; a = np.linspace(0, 2 * PI, SIDES, endpoint=False); cx = spow(np.cos(a), .45); cy = spow(np.sin(a), .55)
    V = []; rows = []
    def ring(c, b, nn, w, t):
        rows.append(list(range(len(V), len(V) + SIDES)))
        for i in range(SIDES): V.append(c + b * (w / 2 * cx[i]) + nn * (t / 2 * cy[i]))
    k = 0; T0 = -T[0]
    for j in range(3, 0, -1):
        ang = j / 4 * PI / 2; ring(Cc[k] + T0 * (wd[k] / 2 * math.sin(ang)), B[k], Nn[k], wd[k] * math.cos(ang), STRAP_T * (1 - .25 * (j / 4) ** 2))
    for i in range(n): ring(Cc[i], B[i], Nn[i], wd[i], STRAP_T)
    k = n - 1; T1 = T[-1]
    for j in range(1, 4):
        ang = j / 4 * PI / 2; ring(Cc[k] + T1 * (wd[k] / 2 * math.sin(ang)), B[k], Nn[k], wd[k] * math.cos(ang), STRAP_T * (1 - .25 * (j / 4) ** 2))
    e0 = len(V); V.append(Cc[0] - T[0] * wd[0] / 2); e1 = len(V); V.append(Cc[-1] + T[-1] * wd[-1] / 2)
    F = []
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(SIDES): F.append((a_[i], a_[(i + 1) % SIDES], b_[(i + 1) % SIDES], b_[i]))
    for i in range(SIDES): F.append((rows[0][(i + 1) % SIDES], rows[0][i], e0)); F.append((rows[-1][i], rows[-1][(i + 1) % SIDES], e1))
    ob = make_obj('strap.' + ('L' if s > 0 else 'R'), np.array(V), F, np.zeros((len(V), 2)), 'body')
    ramp_by_normal(ob, 'strap', lambda Vv, Nn_: sval(Nn_, .22 * ao(head_sdf_b, Vv, Nn_, .05), hi=.22, lo=.24))
    if BTN is not None:
        kb = int(np.argmin(np.abs(C[:, 2] - BTN[s][2]) + 9 * (C[:, 1] > 0)))
        fi = np.where(frontp & (np.arange(n) < np.argmax(z)))[0]
        bc = np.array([np.interp(BTN[s][2], Cc[fi, 2], Cc[fi, k_]) for k_ in range(3)])
        strap_info[s] = dict(btn=bc + Nn[kb] * STRAP_T / 2, frame=(B[kb], T[kb], Nn[kb]), path=Cc)
    else: strap_info[s] = dict(path=Cc)
if A_:
    for s in (-1, 1): build_strap(s)
def build_button(s):
    """A's round cream button (0.067 m across) on the strap's end at the bib's top corner: a soft dome with a rolled rim"""
    c, (b, t, nn) = strap_info[s]['btn'], strap_info[s]['frame']
    fr = Frame(c, b, nn, t)
    def f(p):
        q = fr.local(p); return sell(q, [0, .0012, 0], [.0285, .0080, .0285], (2.2, 2.0, 2.2))
    def shade(P, N):
        q = fr.local(P); rr = np.sqrt(q[:, 0] ** 2 + q[:, 2] ** 2) / .0285
        return sval(N, .10 * smooth(.62, .80, rr) * smooth(.98, .85, rr) * (q[:, 1] > 0), hi=.28, lo=.24)
    sdf_ball('button.' + ('L' if s > 0 else 'R'), f, c, 6, 'body', 'button', shade=shade, t1=.05, scale=(1., .35, 1.), frame=fr)

# ================================================================ ARMS (short sleeves + dark fur) and LEGS + FEET
joint_arms = {}; joint_legs = {}
ARM_DEG = 27. if A_ else 32.
SH_X = .165 if A_ else .170
ARM_LEN = .175 if A_ else .158
SH_Z = .405 if A_ else .395
for s, tag in ((-1, 'R'), (1, 'L')):
    sh = np.array([s * SH_X, .010, SH_Z]); a = math.radians(ARM_DEG)
    dvec = unit(np.array([s * math.sin(a), -.05, -math.cos(a)]))
    root = sh - dvec * .050; elbow = sh + dvec * .085; wrist = sh + dvec * ARM_LEN
    pts_ = [root, sh, elbow + np.array([0, -.003, 0]), wrist]
    # t runs over the root -> wrist spline: the puffed short sleeve to its rolled hem, then the dark arm swelling into the mitten paw
    k_ = 1.0 if A_ else 1.04
    rows = [(0., .064 * k_, 'shirt'), (.12, .069 * k_, 'shirt'), (.25, .073 * k_, 'shirt'), (.35, .075 * k_, 'shirt'), (.45, .074 * k_, 'shirt'),
            (.50, .071 * k_, 'shirt'), (.530, .0725 * k_, 'shirt'), (.552, .0715 * k_, 'shirt'), (.572, .067 * k_, 'shirt'), (.584, .060, 'shirt'),
            (.594, .054, 'black'), (.63, .0520, 'black'), (.72, .0535, 'black'), (.82, .0575, 'black'), (.92, .0610, 'black'), (1., .0620, 'black')]
    def paw_grooves(V, NV, wrist=wrist, dvec=dvec):
        v = V - wrist; ax = v @ dvec; rad = v - np.outer(ax, dvec)
        f0 = np.array([0, -1., 0]); f0 = unit(f0 - dvec * (f0 @ dvec)); f1 = np.cross(dvec, f0)
        ang = np.arctan2(rad @ f1, rad @ f0)
        g = sum(np.exp(-((ang - a_) / .16) ** 2) for a_ in (-.42, .42))
        return .10 * g * smooth(.022, .050, ax)
    tube('arm.' + tag, pts_, rows, 'arm.' + tag, sides=lite(18, 16), cap_rows=7, cap_len=1.0, squash=1.06, occ_f=torso_sdf, extra_occ=paw_grooves)
    joint_arms[tag] = {'shoulder': [float(v) for v in sh], 'elbow': [float(v) for v in elbow], 'wrist': [float(v) for v in wrist],
                       'paw_tip': [float(v) for v in wrist + dvec * .062]}
FOOT = dict(r=[.088, .104, .040] if A_ else [.094, .114, .041], p=(2.8, 2.9, 2.2), pzlo=4.0, rzlo=.036)
LEG_X = .095 if A_ else .104
def foot_sdf_s(s):
    c = np.array([s * LEG_X, -.030, .036])
    def f(p):
        d = sell(p, c, FOOT['r'], FOOT['p'], FOOT['pzlo'], FOOT['rzlo'])
        for k in (-1, 1):            # two shallow toe grooves on the front of the foot
            g = ell(p, c + np.array([k * .026, -.108, .026]), [.0045, .015, .032])
            d = smax(d, -g, .005)
        return d
    return f, c
LEG_SQ = 1.20
for s, tag in ((-1, 'R'), (1, 'L')):
    hip = np.array([s * LEG_X, -.004, .170]); knee = np.array([s * (LEG_X + .002), -.004, .125]); ankle = np.array([s * (LEG_X + .001), -.010, .060])
    pts_ = [hip + np.array([0, 0, .04]), hip, knee, ankle]
    if A_:
        # t over the spline (z 0.21 -> 0.06 Hu): the overall leg stays inside the shorts' flat-bottomed bulb (the torso's seat,
        # z 0.10 Hu = the sheet's 0.132 m hem), then the dark leg into the foot, emerging square through the flat seat
        rows = [(0., .070, 'cloth'), (.30, .072, 'cloth'), (.55, .072, 'cloth'), (.64, .074, 'cloth'), (.665, .076, 'black'),
                (.80, .075, 'black'), (.90, .074, 'black'), (1., .074, 'black')]
    else:
        # the smock covers the hips (the leg's top is inside the bell), then the stocky dark leg from the hem (z 0.125 Hu)
        rows = [(0., .090, 'black'), (.30, .093, 'black'), (.55, .095, 'black'), (.70, .094, 'black'), (.80, .092, 'black'),
                (.90, .090, 'black'), (1., .088, 'black')]
    tube('leg.' + tag, pts_, rows, 'leg.' + tag, sides=lite(16, 14), cap_rows=3, cap_len=.5, squash=LEG_SQ, occ_f=torso_sdf, occ_k=.25)
    ff, fc = foot_sdf_s(s)
    def foot_shade(P, N, ff=ff, fc=fc):
        lat = (P[:, 0] - fc[0]) / .074; frontz = smooth(-.065, -.090, P[:, 1] - fc[1]) * smooth(.005, .016, P[:, 2]) * smooth(.052, .040, P[:, 2])
        groove = sum(np.exp(-((lat - k * .345) / .040) ** 2) for k in (-1, 1)) * frontz
        return sval(N, .20 * groove, hi=.30, lo=.20)
    sdf_ball('foot.' + tag, ff, fc + np.array([0, 0, .008]), lite(6, 5), 'leg.' + tag, 'black', shade=foot_shade, t1=.3)
    joint_legs[tag] = {'hip': [float(v) for v in hip], 'knee': [float(v) for v in knee], 'ankle': [float(v) for v in ankle],
                       'toe': [float(fc[0]), float(fc[1] - .09), .026]}
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
    # the tanuki mask (one band over the bridge, the sheet's outline, symmetrised): the dark brown with a soft light on top
    pbox = (np.abs(x) < .47 * W) & (z > CHIN + .10 * W) & (z < CHIN + .46 * W) & (fr > 0)
    pa = np.zeros(len(x)); pa[pbox] = patch_alpha(x[pbox], z[pbox], fr[pbox])
    Cb = ramp_colour('black', sval(n, 0., hi=.22, lo=.14))
    Cb = mix(Cb, rgb('blacklight'), .30 * smooth(CHIN + .36 * W, CHIN + .42 * W, z) * smooth(.0, .5, n[:, 2] + .3))
    C = mix(C, Cb, pa)
    # the cream muzzle on top (crisp border; its upper edge meets the mask's bridge, its lower half covers the mask's tail)
    rm = muzzle_r(x, z)
    C = mix(C, ramp_colour('muz', sval(n, 0., hi=.10, lo=.16)), (1 - smooth(.985, 1.015, rm)) * fr * PAINT_OPTS['muzzle'])
    # blush ovals (soft) on the mask's cheek lobes
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .94 * (1 - smooth(.78, 1.0, r)) * fr * PAINT_OPTS['blush'])
    # brows: soft arcs over the mask (the sheet: x 0.11-0.23 W, rising 0.02 W to the middle, the outer end a touch lower)
    t = np.linspace(-1, 1, 17)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * BROW_L * t, BROW_Z + .020 * W * (1 - t * t) - .004 * W * t], -1)
        half = (.0118 * W * np.maximum(0, 1 - ((t + .10) / 1.10) ** 2) ** .55 + .0034 * W) * (1 - .30 * smooth(.3, 1., t))
        box = (np.abs(x - s * BROW_X) < .10 * W) & (np.abs(z - BROW_Z) < .06 * W) & (fr > 0)
        a = np.zeros(len(x)); a[box] = stroke(x[box], z[box], Pb, half, .0026 * W)
        C = mix(C, rgb('brow'), .96 * a)
    # the U smile (the sheet: a simple even curve, corners turned up a touch, no philtrum line)
    lw = .0088 * W
    u_ = np.linspace(-1, 1, 41)
    Pm = np.stack([MHW * u_, MOUTH_LO + (MOUTH_HI - MOUTH_LO) * np.abs(u_) ** 2.1], -1)
    half = np.full(len(Pm), lw) * (1 - .30 * smooth(.75, 1.0, np.abs(u_)))
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
    """eye chart: X along world x (not mirrored), eye units. The sheet: the warm brown iris 0.73 of the opening's width and
    0.86 of its height, tucked 0.27 toward the nose (touching the nasal rim, a white crescent on the outer side); a big dark
    pupil (0.70 x 0.72 of the iris) a touch nasal and high; the big catchlight up and toward the nose in each eye (the sheet
    mirrors it), plus a small faint low one on the outer side."""
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .27; iz = 0.; irx = .73; irz = .86
    C = mix(rgb('sclera'), rgb('#E6DEDC'), .50 * smooth(.25, .95, Z))
    C = mix(C, rgb('#EEE7E4'), .25 * smooth(.3, 1., s * X))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#86553A'), rgb('iris'), smooth(-.95, -.45, ez))          # a warm lighter bottom, the swatch brown, darker on top
    I = mix(I, rgb('#4E2E1C'), smooth(-.10, .55, ez))
    I = mix(I, rgb('#382013'), smooth(.55, .95, ez) * .8)
    I = mix(I, rgb('#3E2618'), smooth(.80, 1.0, r) * .75)                  # a darker limbal ring
    I = I * (1 - .03 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 24 + r * 8)))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    px_ = ix - s * .10; pz = .08
    R = np.sqrt(((X - px_) / (.70 * irx)) ** 2 + ((Z - pz) / (.72 * irz)) ** 2)
    C = mix(C, rgb('pupil'), 1 - smooth(.97, 1.03, R))
    big = np.sqrt(((X - (ix - s * .30)) / .200) ** 2 + ((Z - .52) / .200) ** 2)    # 0.03 W across, up and toward the nose
    small = np.sqrt(((X - (ix + s * .30)) / .070) ** 2 + ((Z + .42) / .060) ** 2)
    C = mix(C, rgb('#FFFBF8'), np.maximum(1 - smooth(.90, 1.08, big), .70 * (1 - smooth(.85, 1.12, small))))
    C = mix(C, rgb('#2A1E1A'), smooth(.965, 1.0, sr))           # the lid contact at the rim (narrow: the white reaches the mask)
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
        hl = np.exp(-(((a + .012 * W) / (.013 * W)) ** 2 + ((b - .010 * W) / (.007 * W)) ** 2))
        return mix(C, rgb('#6E6878'), .55 * hl)
    raise KeyError(chart)

atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [250, 245, 239, 255]
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
atlas_path = os.path.join(ROOT, 'scratch' if FAST else '', TASK + ('_rig_atlas.png' if RIG else '_atlas.png'))
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = NAME + '_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new(NAME + '_toy_atlas'); MAT.use_nodes = True
bs = next(n for n in MAT.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
bs.inputs['Roughness'].default_value = .8; bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .25
tx = MAT.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
MAT.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])

# ================================================================ THE BODY TO METRES: everything built in Hokuto's units maps by BSV
from mathutils import Matrix
BODY_GROUPS = ('body', 'arm.L', 'arm.R', 'leg.L', 'leg.R')
for g_ in BODY_GROUPS:
    for ob_ in parts[g_]:
        ob_.data.transform(Matrix.Diagonal((BSV[0], BSV[1], BSV[2], 1.))); ob_.data.update()
        a_ = ob_.data.attributes.get('cust_n')
        if a_ is not None:          # normals map by the inverse transpose
            nn_ = np.zeros(len(ob_.data.vertices) * 3, np.float32); a_.data.foreach_get('vector', nn_)
            a_.data.foreach_set('vector', unit(nn_.reshape(-1, 3) / BSV).astype(np.float32).ravel())
def _sc(v): return [float(c) for c in np.asarray(v, float) * BSV]
for tag in ('L', 'R'):
    joint_arms[tag] = {k: _sc(v) for k, v in joint_arms[tag].items()}; joint_legs[tag] = {k: _sc(v) for k, v in joint_legs[tag].items()}
def torso_m(p): return torso_sdf(np.asarray(p) / BSV) * BS                  # the torso in metres (first-order distance)
def body_ray_m(theta, z): return body_ray(theta, z, torso_m)

# ================================================================ THE TAIL (metres): a thick capsule, fur base, one broad dark end
# the sheet's side views: the tail fills y 0.25-0.43 m behind the body centre, z 0.11-0.365 m, pointing down and back; the
# back view: ~0.27 m across, the dark end the lower two thirds; built as a ring tube so the colour edge is one clean ring
TAIL_PTS = {'a': [(0, .12, .30), (0, .215, .272), (0, .268, .240), (0, .298, .212)],
            'b': [(0, .14, .30), (0, .238, .270), (0, .290, .234), (0, .320, .206)]}[DESIGN]
TAIL_PTS = [np.array(p_, float) for p_ in TAIL_PTS]
_tr = [(0., .075, 'fur'), (.18, .095, 'fur'), (.34, .112, 'fur'), (.50, .122, 'fur'), (.60, .126, 'fur'), (.635, .127, 'black'),
       (.74, .129, 'black'), (.86, .128, 'black'), (1., .124, 'black')]
tube('tail', TAIL_PTS, _tr, 'tail', sides=lite(20, 16), cap_rows=lite(7, 6), cap_len=.95, squash=1.0, occ_f=torso_m, occ_k=.30)
TAIL_M = [float(v) for v in TAIL_PTS[1]]
TAIL_J = [[float(v) for v in TAIL_PTS[1]], [float(v) for v in TAIL_PTS[3]]]

if B_:
    # ============================================================ B's NECKERCHIEF (metres): a thick rolled band on the shoulders
    # under the chin (the back view: z 0.52-0.61 m, +-0.30 m), a ball knot in front, two flattened teardrop ends hanging in a V
    NB_ = lite(56, 44); SB_ = lite(12, 10); RB_H, RB_T = .043, .034                 # the band's half-height and half-thickness
    th_ = np.linspace(0, 2 * PI, NB_, endpoint=False)
    zb_ = .548 + .018 * (1 - np.cos(th_)) / 2
    Pb_, Nb_ = body_ray_m(th_, zb_)
    Nh_ = unit(Nb_ * np.array([1, 1, .25]))
    Cb_ = Pb_ + Nh_ * (RB_T * .80)
    V_ = []; NV_ = []
    for i in range(NB_):
        tg = unit(Cb_[(i + 1) % NB_] - Cb_[i - 1]); out = unit(Nh_[i] - tg * (Nh_[i] @ tg)); upv = np.cross(out, tg)
        if upv[2] < 0: upv = -upv
        for k in range(SB_):
            a = 2 * PI * k / SB_; ca, sa = math.cos(a), math.sin(a)
            V_.append(Cb_[i] + out * RB_T * ca + upv * RB_H * sa); NV_.append(unit(out * ca / RB_T + upv * sa / RB_H))
    V_ = np.array(V_); NV_ = np.array(NV_); F_ = []
    for i in range(NB_):
        for k in range(SB_):
            a0, a1 = i * SB_ + k, i * SB_ + (k + 1) % SB_; b0, b1 = ((i + 1) % NB_) * SB_ + k, ((i + 1) % NB_) * SB_ + (k + 1) % SB_
            F_.append((a0, b0, b1, a1))
    occ_ = .30 * ao(head_sdf, V_, NV_, .04)
    make_obj('scarf_band', V_, F_, ramp_uv('acc', sval(NV_, occ_, hi=.22, lo=.24)), 'scarf', NV_)
    KN_C = Cb_[0] + Nh_[0] * .020 + np.array([0, 0, -.014])
    def knot_sdf(p): return sell(np.asarray(p) - KN_C, [0, 0, 0], [.048, .033, .043], (2.2, 2.2, 2.2))
    sdf_ball('scarf_knot', knot_sdf, KN_C, 6, 'scarf', 'acc', shade=lambda P, N: sval(N, .30 * ao(head_sdf, P, N, .03), hi=.24, lo=.24), t1=.10)
    end_info = {}
    for s, tag, ang, L in ((-1, 'R', 24., .132), (1, 'L', 30., .126)):
        # a flattened teardrop lofted as a ring tube: from under the knot down and out over the smock, broad in the middle,
        # its tip a soft point; the middle snapped just proud of the torso
        ax = unit(np.array([s * math.sin(math.radians(ang)), -.25, -math.cos(math.radians(ang))]))
        root = KN_C + np.array([s * .008, .006, -.010])
        pts_e = [root + ax * L * t_ for t_ in (0., .35, .70, 1.)]
        for j in (1, 2, 3):
            q_ = pts_e[j]
            for _ in range(4): q_ = q_ - (torso_m(q_[None])[0] - (.016 + .004 * j)) * grad(torso_m, q_[None])[0]
            pts_e[j] = q_
        rows_e = [(0., .020, 'acc'), (.12, .030, 'acc'), (.30, .040, 'acc'), (.50, .044, 'acc'), (.68, .040, 'acc'), (.84, .029, 'acc'), (1., .017, 'acc')]
        ob_e, Ve = tube('scarf_end.' + tag, pts_e, rows_e, 'scarf_end.' + tag, sides=14, cap_rows=4, cap_len=.9, squash=.40,
                        occ_f=torso_m, occ_k=.25)
        end_info[tag] = dict(root=[float(v) for v in root], tip=[float(v) for v in pts_e[-1]])
    acc_info = dict(knot_centre=[float(v) for v in KN_C], scarf_ends=end_info)

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
ALL = all_verts([o for g in parts.values() for o in g]); AV = all_verts(parts['acc'] if A_ else parts['scarf'])
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
        'muzzle_oval_W': [round(2 * MUZ_HW / W, 3), round(2 * MUZ_HH / W, 3), round((MUZ_C - CHIN) / W, 3)],
        'nose_W': [round(float(np.ptp(NOSE_OUT[:, 0])) / W, 3), round(float(np.ptp(NOSE_OUT[:, 1])) / W, 3)],
        'accessory_W': {'x': [round(float(AV[:, 0].min() / W), 3), round(float(AV[:, 0].max() / W), 3)], 'z_above_chin': [round(float((AV[:, 2].min() - CHIN) / W), 3), round(float((AV[:, 2].max() - CHIN) / W), 3)]},
        'accessory_top_m': round(float(AV[:, 2].max()), 4),
        'ear_top_m': round(float(max(EV[1][:, 2].max(), EV[-1][:, 2].max())), 4),
        'ear_outer_x_W': round(float(EV[1][:, 0].max() / W), 3),
        'body_width_m': round(float(np.ptp(all_verts(parts['body'])[:, 0])), 3),
        'body_depth_m': [round(float(all_verts(parts['body'])[:, 1].min()), 3), round(float(all_verts(parts['body'])[:, 1].max()), 3)],
        'arm_span_m': round(float(np.ptp(all_verts(parts['arm.L'] + parts['arm.R'])[:, 0])), 3),
        'tail_m': [round(v, 3) for v in TAIL_M],
        'outfit_m': ({'overalls_top_z': round(Z_EDGE * BS, 3), 'waist_seam_z': round(SEAM_Z * BS, 3)} if A_ else
                     {'hem_z': round(HEM_Z * BS, 3), 'pocket_z': [round(PK_BOT * BS, 3), round(PK_TOP * BS, 3)], 'pocket_w': round(2 * PK_W * BSV[0], 3)}),
        'feet_m': {'x_outer': round(float(all_verts(parts['leg.L'])[:, 0].max()), 3), 'y': [round(float(all_verts(parts['leg.L'])[:, 1].min()), 3), round(float(all_verts(parts['leg.L'])[:, 1].max()), 3)]},
        'tail_extent_m': {'y_back': round(float(all_verts(parts['tail'])[:, 1].max()), 3), 'z': [round(float(all_verts(parts['tail'])[:, 2].min()), 3), round(float(all_verts(parts['tail'])[:, 2].max()), 3)]},
        'body_scale_BS': round(BS, 4),
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
    piv = {'head': tuple(O), 'acc': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'], 'lash.L': eye_centers['L'], 'lash.R': eye_centers['R'],
           'ear.L': tuple(EAR_C[1]), 'ear.R': tuple(EAR_C[-1]), 'tail': tuple(TAIL_M),
           'arm.L': joint_arms['L']['shoulder'], 'arm.R': joint_arms['R']['shoulder'],
           'leg.L': joint_legs['L']['hip'], 'leg.R': joint_legs['R']['hip'],
           'scarf': _sc([0, .012, .430]),
           'scarf_end.L': acc_info.get('scarf_ends', {}).get('L', {}).get('root', (0, 0, 0)),
           'scarf_end.R': acc_info.get('scarf_ends', {}).get('R', {}).get('root', (0, 0, 0))}.get(group, (0, 0, 0))
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
          'hips': _sc([0, .000, .170]), 'spine': _sc([0, .003, .255]), 'chest': _sc([0, .008, .340]), 'neck': _sc([0, .012, .430]),
          'head': [float(v) for v in O], 'jaw_pivot': [0, float(HY - .10 * W), float(CHIN + .10 * W)],
          'eyes': eye_centers, 'ears': ears_j, 'arms': joint_arms, 'legs': joint_legs,
          'tail': TAIL_J,
          'accessory': acc_info,
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth SDF ball (cranium + cheek mass + muzzle), radially projected, analytic normals.',
                    'Eyelid holes ringed by 5 loops each, rim rolled in behind separate lens eyeballs; 3 loops round the mouth.',
                    ('Separate pieces: eyes, lash rolls (%s_lash_L/R, origin at the eye centre, for the upper lids), ears, tail (a ring tube, 9 rings + cap), ' % NAME) +
                    ('the flower (%s_acc, a rigid head follower).' % NAME if A_ else 'the neckerchief band + knot (%s_scarf, chest/neck) and its two ends (%s_scarf_end_L/R, root at the knot).' % (NAME, NAME)),
                    'Arms: 16 rings shoulder->wrist (short sleeve, rolled hem, dark fur) + mitten cap; legs: rings hip->ankle + feet.']}
if RIG:
    pass
elif not FAST:
    with open(os.path.join(ROOT, 'joints-%s.json' % DESIGN), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model-%s.json' % DESIGN), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-fast-%s.json' % DESIGN), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not FAST and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, TASK + '.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG: bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('TANUKI_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
