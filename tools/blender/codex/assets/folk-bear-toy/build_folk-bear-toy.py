"""The Toybox townsfolk bears (Z-D6 folk-bear-toy), phase-1 models. Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_folk-bear-toy.py -- --design a|b|all [--fast]

Design A = Hana the gardener (folk_bear_a), design B = Mugi the storyteller (folk_bear_b). `all` runs one Blender per
design in turn (their PIDs go to pids.log). 1 unit = 1 m, front = -Y, feet on z = 0, character left = +X.
Writes only inside this folder plus public/models/folk-bear-<x>-toy.glb (--fast: scratch/folk-bear-<x>-fast.glb).

One family, one shared species base (the Takumi / Kuma toy-line machinery, tools/blender/codex/assets/tk-takumi-toy):
- The head is ONE smooth implicit ball (a cranium and a wide cheek mass, smooth-unioned, plus a gentle muzzle
  displacement), fitted to the sheet's two head close-ups by scratch/fit_head.py; each design scales it by its own W.
  The skin is the field's zero surface by radial projection (CDT in a stereographic domain, edge loops round both eyelid
  holes and the mouth), so every vertex carries the analytic normal and the face stays convex. The eyes are separate flush
  lens globes in lid holes, the upper lash lines separate ribbons; the nose is a glossy button; the ears thick discs.
- Per design: proportions, the face layout, the ears, the palette and the outfit.
  A: shirt chest + pear overalls barrel (torso SDF), bib + pocket slabs, straps, big buttons, shorts with cuffs, and a
     five-petal flower at her left ear.
  B: barrel torso in a lilac wrap jacket with a crossover collar, a thick obi, a flared hem lip, balloon trousers, wide
     kimono sleeves and a tilted mustard beret with its nub.
- One 2048 painted atlas per design: the face chart painted from 3D positions, two eye charts, the ear and nose charts
  and 1-D shading ramps (soft painted light baked into the colour, never hard shadows).
"""
import bpy, bmesh, math, json, os, sys, struct, zlib, subprocess, time
import numpy as np
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt
from mathutils.kdtree import KDTree

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
FAST = '--fast' in ARGV
DESIGN = ARGV[ARGV.index('--design') + 1].lower() if '--design' in ARGV else 'a'
if DESIGN == 'all':
    BL = r'C:\Program Files\Blender Foundation\Blender 4.3\blender.exe'
    for d in ('a', 'b'):
        args = [BL, '--background', '--factory-startup', '--python', os.path.abspath(__file__), '--', '--design', d] + (['--fast'] if FAST else [])
        with open(os.path.join(ROOT, 'scratch', 'build-%s.log' % d), 'w', encoding='utf-8') as lf:
            p = subprocess.Popen(args, stdout=lf, stderr=subprocess.STDOUT, cwd=ROOT)
            with open(os.path.join(ROOT, 'pids.log'), 'a', encoding='utf-8') as pl:
                pl.write('%s started %d: build design %s (child of the all run)\n' % (time.strftime('%H:%M:%S'), p.pid, d))
            try: p.wait(timeout=900)
            except subprocess.TimeoutExpired:
                p.kill(); p.wait()
                with open(os.path.join(ROOT, 'pids.log'), 'a', encoding='utf-8') as pl: pl.write('killed %d\n' % p.pid)
        print('BUILT', d, p.returncode, flush=True)
    sys.exit(0)
assert DESIGN in ('a', 'b'), DESIGN
RIG = bool(globals().get('RIG_MODE'))       # set by a later rig script: part labels; no approved file is written
if RIG: FAST = False
TASK = 'folk-bear-%s-toy' % DESIGN
NAME = {'a': 'Hana', 'b': 'Mugi'}[DESIGN]
MODEL = 'D:/projects/chewy-life-3d/public/models/%s.glb' % TASK
OUT_MODEL = os.path.join(ROOT, 'scratch', 'folk-bear-%s-fast.glb' % DESIGN) if FAST else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(5)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
LOG = {'design': DESIGN}
A_ = DESIGN == 'a'; B_ = DESIGN == 'b'

# ---------------------------------------------------------------- the sheet's measures (measure-a.md / measure-b.md)
# the sheet's common front scale: ground y 491, A's ear tops y 131 -> 1.05 m = 342.9 px / m.
# A: W 195 px at the cheeks (0.569 m), chin y 295 (0.572 m). B: W 207 px (0.604 m), chin y 294 (0.575 m).
W, CHIN, HY = {'a': (.569, .572, .010), 'b': (.604, .575, .010)}[DESIGN]
SW = W / .44                                # Rosie's metric detail sizes (authored at W 0.44) scale by SW

# Every ramp keeps its hue: light and shade are value changes only. Dark cloth reads near-black in the game's grade, so
# B's slate trousers are painted a touch lighter than the swatch (same hue).
PAL = {'iris': '#4B2C20', 'pupil': '#2D1B16', 'nose': '#2D1B16', 'sclera': '#FFF8EF', 'blush': '#EAA095',
       'lash': '#2A1A14', 'mouth': '#2D1B16'}
def vshift(hexc, k):
    h = hexc.lstrip('#'); c = [min(255, int(round(int(h[i:i + 2], 16) * k))) for i in (0, 2, 4)]
    return '#%02X%02X%02X' % tuple(c)
def trio(name, base, lo=.86, hi=1.07):
    PAL[name] = base; PAL[name + 'dark'] = vshift(base, lo); PAL[name + 'light'] = vshift(base, hi)
if A_:
    trio('fur', '#D8A878', .85, 1.05); trio('muz', '#F0D1A5', .90, 1.03)
    trio('shirt', '#FFF1D8', .90, 1.0); trio('over', '#8EAE7B', .84, 1.07); trio('accent', '#658B58', .84, 1.08)
    trio('flower', '#E8A16A', .86, 1.06); trio('fcentre', '#F2C55A', .88, 1.05)
    PAL['brow'] = '#6A3E28'
else:
    trio('fur', '#6A4A3A', .84, 1.10); trio('muz', '#E8C49A', .90, 1.04)
    trio('jacket', '#B4A0C8', .86, 1.07); trio('collar', '#C4B2D6', .88, 1.05); trio('obi', '#9FC6CE', .86, 1.06)
    trio('trousers', '#5A6175', .82, 1.10); trio('beret', '#D9B96D', .85, 1.07)
    PAL['brow'] = '#2D1B16'
CHARTS = {'face': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'ear': (1280, 896, 256, 256), 'nose': (1536, 896, 256, 256)}
if RIG:   # phase-2 charts in unused atlas space (the approved paint is untouched)
    CHARTS.update({'lidU.L': (0, 0, 512, 256), 'lidU.R': (512, 0, 512, 256), 'lidD.L': (1024, 0, 512, 192), 'lidD.R': (1536, 0, 512, 192),
                   'cavity': (0, 256, 128, 128), 'tongue': (128, 256, 128, 128)})
PAINT_OPTS = {'band': True, 'blush': True, 'muzzle': True}
SKIN_LID_LINES = False     # the rig paints its lids from this skin with the lash shade off
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'muz': ('muzdark', 'muz', 'muzlight')}
for k in (('shirt', 'over', 'accent', 'flower', 'fcentre') if A_ else ('jacket', 'collar', 'obi', 'trousers', 'beret')):
    RAMPS[k] = (k + 'dark', k, k + 'light')
RAMPS.update({'nose': ('#1E120E', 'nose', '#5A3C30'), 'eyedark': ('#1E120C', '#2A1A14', '#4A3024'), 'lash': ('#1C120E', 'lash', '#4E3A30')})
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
# fitted by scratch/fit_head.py (plan exponents capped at 2.7, round in plan) to the sheet's front widths (1.00 W at
# z 0.30, 0.88 at 0.51; the chin rounder than Takumi's), the side profile (forehead 0.40 W ahead, the back 0.40 W behind)
# and the crown (0.80 W)
HEAD_FIT = json.load(open(os.path.join(ROOT, 'scratch', 'fit_head_best.json')))
_x = dict(zip(['cr_cy', 'cr_cz', 'cr_rx', 'cr_ry', 'cr_rz', 'cr_px', 'cr_py', 'cr_pz', 'ck_cy', 'ck_cz', 'ck_rx', 'ck_ry', 'ck_rz',
               'ck_px', 'ck_py', 'ck_pz', 'ck_pzlo', 'ck_rzlo', 'k'], HEAD_FIT))
CR = ([0, _x['cr_cy'], _x['cr_cz']], [_x['cr_rx'], _x['cr_ry'], _x['cr_rz']], (_x['cr_px'], _x['cr_py'], _x['cr_pz']))
CK = ([0, _x['ck_cy'], _x['ck_cz']], [_x['ck_rx'], _x['ck_ry'], _x['ck_rz']], (_x['ck_px'], _x['ck_py'], _x['ck_pz']), _x['ck_pzlo'], _x['ck_rzlo'])
K_CK = _x['k']
# the muzzle is a smooth displacement of the ball (no union crease), zero slope at its edge, its lower half fading into the
# chin; it carries the nose forward to about 0.49 W ahead of the head centre (the sheet's side view)
MZ = ([0, -.360, .205], [.205, .150, .230])
MZ_A = .0330
def head_local(q):
    d = smin(sell(q, *CR), sell(q, *CK), K_CK)
    dz = q[..., 2] - MZ[0][2]; r = np.sqrt((q[..., 0] / MZ[1][0]) ** 2 + (dz / np.where(dz < 0, MZ[1][2], MZ[1][1])) ** 2)
    return d - MZ_A * (1 - smoother(.22, 1, r)) * smooth(-.12, -.28, q[..., 1])
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
O = np.array([0, HY, CHIN + .32 * W])
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
FACE = {'a': dict(ex=.212, ez=.392, ehw=.0865, ehh=.0880, muz=(.206, .1955, .1515), nose=(.314, .0620, .0305),
                  mouth=(.0920, .237, .186), brow=(.208, .628, .0625, .0130), blush=(.315, .245, .066, .050),
                  ear=(.322, .645, .228), iris=(.70, 1.0, .36)),
        'b': dict(ex=.202, ez=.380, ehw=.0855, ehh=.0835, muz=(.200, .190, .1465), nose=(.298, .0585, .0285),
                  mouth=(.0900, .224, .180), brow=(.210, .600, .0635, .0150), blush=(.305, .234, .066, .049),
                  ear=(.320, .630, .183), iris=(.72, 1.06, .33))}[DESIGN]
EX = FACE['ex'] * W; EZ = CHIN + FACE['ez'] * W; EHW = FACE['ehw'] * W; EHH = FACE['ehh'] * W; EN = 2.15
def eye_unit(psi):
    return spow(np.cos(psi), 2 / EN), spow(np.sin(psi), 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
MUZ_C = CHIN + FACE['muz'][0] * W; MUZ_HW = FACE['muz'][1] * W; MUZ_HH = FACE['muz'][2] * W      # painted muzzle oval
NOSE_Z = CHIN + FACE['nose'][0] * W; NOSE_HX = FACE['nose'][1] * W; NOSE_HY = FACE['nose'][2] * W
NOSE_TOP = NOSE_Z + NOSE_HY; NOSE_BOT = NOSE_Z - NOSE_HY
M_HW = FACE['mouth'][0] * W; M_CZ = CHIN + FACE['mouth'][1] * W; M_BZ = CHIN + FACE['mouth'][2] * W  # the U smile
MZM = (M_CZ + M_BZ) / 2
BROW_X = FACE['brow'][0] * W; BROW_Z = CHIN + FACE['brow'][1] * W; BROW_L = FACE['brow'][2] * W; BROW_T = FACE['brow'][3] * W
BLUSH = (FACE['blush'][0] * W, CHIN + FACE['blush'][1] * W, FACE['blush'][2] * W, FACE['blush'][3] * W)

# ---------------------------------------------------------------- the fur shade (shared by the face chart and the ramps)
EAR_CX, EAR_CZ, EAR_RW = FACE['ear']
EAR_C = {s: np.array([s * EAR_CX * W, HY + .060 * W, CHIN + EAR_CZ * W]) for s in (-1, 1)}
def head_occ(P, n):
    o = np.zeros(np.asarray(P).shape[:-1])
    for s in (-1, 1):
        dd = np.linalg.norm(P - EAR_C[s], axis=-1); o = o + .07 * np.exp(-(dd / (.15 * W)) ** 2)
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
NE = 40
EYE_SCALES = [1.0, 1.075, 1.16, 1.25, 1.35]
eye_dom = {}
for s in (-1, 1):
    psi = np.linspace(0, 2 * PI, NE, endpoint=False)
    x, z = eye_xz(s, psi); base = to_dom(surf_dir(x, z)); c = to_dom(surf_dir(np.array([s * EX]), np.array([EZ])))[0]
    eye_dom[s] = (c, base)
    wn = 1 - .50 * smooth(-.10, -.80, np.cos(psi)) - .25 * smooth(-.2, -.9, np.sin(psi))   # tighter toward the nose and the muzzle
    for k, kk in enumerate(EYE_SCALES): add_loop(c + (base - c) * (1 + (kk - 1) * wn[:, None]), 'eye%d_%d' % (s, k))
MS = M_HW / (.098 * W) * .78
for k, (hx, hz) in enumerate([(.098, .026), (.113, .036), (.128, .047)]):
    a = np.linspace(0, 2 * PI, 36, endpoint=False)
    add_loop(to_dom(surf_dir(MS * hx * W * spow(np.cos(a), .8), MZM - .004 * W + hz * W * np.sin(a))), 'mouth_%d' % k)
NB = 56; AB = math.radians(150)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
def fib(n):
    ii = np.arange(n) + .5; phi = np.arccos(1 - 2 * ii / n); th = PI * (1 + 5 ** .5) * ii
    return np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
NF = 1300 if FAST else 1650
D = fib(NF); D = D[np.arccos(np.clip(-D[:, 1], -1, 1)) < math.radians(147.)]
D2 = fib(4200 if FAST else 4500); D2 = D2[np.arccos(np.clip(-D2[:, 1], -1, 1)) < math.radians(62)]
P2 = radial_hit(D2)
FZ0, FZ1 = CHIN + .08 * W, CHIN + .68 * W
band2 = (np.abs(P2[:, 0]) < .44 * W) & (P2[:, 2] > FZ0) & (P2[:, 2] < FZ1)
D2 = D2[band2]; P2 = P2[band2]
Pf0 = radial_hit(D)
inband = (np.abs(Pf0[:, 0]) < .44 * W) & (Pf0[:, 2] > FZ0) & (Pf0[:, 2] < FZ1) & (np.arccos(np.clip(-D[:, 1], -1, 1)) < math.radians(62))
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
keep &= ~(front & ((Pf[:, 0] / (MS * .142 * W)) ** 2 + ((Pf[:, 2] - MZM) / (.064 * W)) ** 2 < 1))
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
    REFINE_ADD = 80; D_LOW, D_T = .12, .45
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
    # round 2: the silhouette. Chord sag (the surface's distance from each edge midpoint and the centroid) over the whole
    # skin, so the outline has no polygon steps at portrait size where the cheek mass curves fast (the jaw, the cheek corners)
    SIL_T = .00028; SIL_ADD = int(os.environ.get('SIL_ADD', '520')); n_sil = 0
    def sil_errors(dom_out, F):
        Pv = radial_hit_outer(from_dom(dom_out)); Pt = Pv[F]
        M = np.concatenate([(Pt[:, 0] + Pt[:, 1]) / 2, (Pt[:, 1] + Pt[:, 2]) / 2, (Pt[:, 2] + Pt[:, 0]) / 2, Pt.mean(1)])
        dev = np.abs(head_sdf(M)).reshape(4, -1).max(0); return dev, Pv
    for it in range(12):
        dom_out, F, out_of = skin_cdt(pts); dev, Pv = sil_errors(dom_out, F)
        bad = np.where(dev > SIL_T)[0]
        if not len(bad) or n_sil >= SIL_ADD: break
        bad = bad[np.argsort(-dev[bad])]
        kd = KDTree(len(Pv))
        for i_, p_ in enumerate(Pv): kd.insert(p_, i_)
        kd.balance(); taken = []; taken_p = []
        for t in bad:
            if len(taken) >= min(120, SIL_ADD - n_sil): break
            c_ = dom_out[F[t]].mean(0)
            if eye_ring_rr(c_[None])[0] <= .72: continue
            cp = Pv[F[t]].mean(0); le = max(np.linalg.norm(Pv[F[t][i]] - Pv[F[t][(i + 1) % 3]]) for i in range(3))
            if kd.find(cp)[2] < .30 * le: continue
            if any(np.linalg.norm(cp - q_) < .45 * le for q_ in taken_p): continue
            taken.append(c_); taken_p.append(cp)
        if not taken: break
        pts.extend([tuple(c_) for c_ in taken]); n_sil += len(taken)
    LOG['head_sil'] = {'added': n_sil, 'sag_p99_mm': round(float(np.percentile(dev, 99)) * 1000, 3), 'sag_max_mm': round(float(dev.max()) * 1000, 3)}
    print('HEAD_SIL', json.dumps(LOG['head_sil']), flush=True)
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
for a, nb in [(156, NB), (163, NB // 2), (170, NB // 2), (176, NB // 4)]:
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
ES = [0, .14, .30, .46, .61, .74, .85, .93, .98, 1.10]
EYE_OUT = 25.      # the eyeballs' outward facing (deg): the toy line's (the round-1 skin normal gave 17)
NSEG = 24
eye_centers = {}; eye_axes = {}
def eye_h(k): return (.0016 - .0042 * k * k) * SW
for s, tag in ((-1, 'R'), (1, 'L')):
    psi = np.linspace(0, 2 * PI, NSEG, endpoint=False); rows = []
    cx = s * EX; Sc = np.array([cx, float(front_hit(cx, EZ)[0]), EZ]); axis = grad_n(Sc[None])[0]
    a0 = math.atan2(s * axis[0], -axis[1]); dl = s * (math.radians(EYE_OUT) - a0)      # turn the eye's axis to EYE_OUT outward
    axis = np.array([axis[0] * math.cos(dl) - axis[1] * math.sin(dl), axis[0] * math.sin(dl) + axis[1] * math.cos(dl), axis[2]])
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

# ================================================================ LASH RIBBONS: the upper lash line and its flicks (own objects)
# a flattened tapered tube lying on the skin along the opening's upper rim (its lower edge just over the lens), thick over
# the top and swelling to the outer corner, carried out into the wing flick; ~0.007 W proud. Separate objects (origin at
# the eye centre) so the rig can hang them on the upper lids; the sheet's two small outer lash flicks are short tapered
# ribbons of the same object.
LASH_K = 1.0 if A_ else 1.12     # B: the relaxed upper lid, a heavier, flatter lash line
def lash_th(psi):      # the lash band's thickness (eye radii): thick on top, swelling to the outer corner (psi 0 = outer side)
    return LASH_K * (.050 + .17 * np.sin(np.clip(psi, 0, PI)) ** .55 + .07 * np.exp(-((psi - .35) / .40) ** 2)) * smooth(-.10, .25, psi)
def lash_centreline(flat=True):
    """(X, Z) eye units (X > 0 outer) and half-widths (eye radii) from the inner end over the top and out into the wing"""
    psi = np.linspace(PI - .12, .24, 30); th = lash_th(psi)
    ux, uz = eye_unit(psi); r = 1 + th / 2 - .025; P = np.stack([ux * r, uz * r], -1); hw = th / 2 + .04
    if B_ and flat: P[:, 1] = np.minimum(P[:, 1], .88 + .35 * (P[:, 1] - .88))     # the flatter top of the relaxed lid
    gam, Lk, w0 = .38, .030 * W, .0100 * W                   # the wing: out and up from the outer corner, tapering
    bx, bz = P[-1]; tq = np.linspace(0, 1, 9)[1:]
    Wp = np.stack([bx + Lk / EHW * tq * np.cos(gam + .30 * tq), bz + Lk / EHH * tq * np.sin(gam + .30 * tq)], -1)
    whw = np.maximum(hw[-1] * (1 - tq) ** .9, w0 / EHH * .10)
    return np.concatenate([P, Wp]), np.concatenate([hw, whw])
LASH_C2, LASH_HW = lash_centreline()
LASH_C2_RAW = lash_centreline(False)[0]      # (the rig: B's lid rest edge follows the unflattened line, hidden under the hole top)
def eye_pt(s, X, Z):
    x = s * EX + s * EHW * np.asarray(X, float); z = EZ + EHH * np.asarray(Z, float)
    y = front_hit(x, z); S = np.stack([x, y, z], -1); return S, grad_n(S)
lash_info = {}
NLT, NLS = 22, 8
def ribbon(s, C2, HW, hp0, NLT, NLS):
    """a tapered flattened ribbon on the skin along eye-unit centreline C2 (X outer, Z up), half-widths HW (eye radii)"""
    L_ = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(C2 * [EHW, EHH], axis=0), axis=1))]); tt = np.linspace(0, L_[-1], NLT + 1)
    C = np.stack([np.interp(tt, L_, C2[:, 0]), np.interp(tt, L_, C2[:, 1])], -1); hw = np.interp(tt, L_, HW) * EHH
    S, n = eye_pt(s, C[:, 0], C[:, 1])
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
def lash_flicks(s):
    """the sheet's two short outer flicks above the wing: rooted on the lash, out and up (V, NV, F)"""
    V = np.zeros((0, 3)); NV = np.zeros((0, 3)); F = []
    for (psi0, ang, ln) in ((.62, 1.05, .030), (.98, 1.35, .024)):
        ux, uz = eye_unit(np.array([psi0])); r0 = 1 + lash_th(np.array([psi0]))[0] * .7
        b0 = np.array([ux[0] * r0, uz[0] * r0]); b0[1] = min(b0[1], .88 + .35 * (b0[1] - .88)) if B_ else b0[1]
        tq = np.linspace(0, 1, 6)
        C2 = np.stack([b0[0] + ln * W / EHW * tq * np.cos(ang - .35 * tq), b0[1] + ln * W / EHH * tq * np.sin(ang - .35 * tq)], -1)
        HW = np.maximum(.060 * (1 - tq) ** .8, .012)
        V2, NV2, F2, _, _ = ribbon(s, C2, HW, .0055 * W, 6, 6)
        F = F + [tuple(i + len(V) for i in f) for f in F2]; V = np.vstack([V, V2]); NV = np.vstack([NV, NV2])
    return V, NV, F
for s, tag in ((-1, 'R'), (1, 'L')):
    V, NV, F, S, hp = ribbon(s, LASH_C2, LASH_HW, .0072 * W, NLT, NLS)
    V2, NV2, F2 = lash_flicks(s)
    F = F + [tuple(i + len(V) for i in f) for f in F2]; V = np.vstack([V, V2]); NV = np.vstack([NV, NV2])
    make_obj('lash.' + tag, V, F, ramp_uv('lash', sval(NV, 0., hi=.14, lo=.10)), 'lash.' + tag, NV)
    lash_info[tag] = dict(tip=[float(v) for v in S[-1]], root=[float(v) for v in S[0]], max_proud_W=round(float(hp.max() / W), 4))
LOG['lash'] = lash_info

# ================================================================ NOSE: a glossy rounded oval button on the muzzle
def resample(poly, step):
    seg = np.linalg.norm(np.roll(poly, -1, 0) - poly, axis=1); L = np.concatenate([[0], np.cumsum(seg)])
    n = max(8, int(round(L[-1] / step))); t = np.linspace(0, L[-1], n, endpoint=False)
    P = np.concatenate([poly, poly[:1]]); return np.stack([np.interp(t, L, P[:, 0]), np.interp(t, L, P[:, 1])], -1)
def _nose_outline(n=40):
    # the sheet's nose: a soft wide oval, a little fuller on top (0.113 x 0.061 W for A)
    t = np.linspace(0, 2 * PI, n, endpoint=False); u = np.cos(t); v = np.sin(t)
    y = NOSE_HY * spow(v, .85); taper = (.80 + .20 * ((v + 1) / 2) ** .9)
    x = NOSE_HX * spow(u, .78) * taper
    return np.stack([x, y], -1)
NOSE_OUT = _nose_outline()
NOSE_H = .030 * W                                                # the button stands ~17 mm proud (a soft bump in profile)
def build_nose():
    rows = []; V = []; UV = []
    rings = [1.0, .985, .94, .85, .70, .50, .27]
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

# ================================================================ EARS: thick round solid discs on the crown corners
EAR_OUT = 26.; EAR_R = EAR_RW * W; EAR_AN = .062 * W * (EAR_RW / .2) ** .5; EAR_DISH = .024 * W
ear_info = {}
for s in (-1, 1):
    C0 = EAR_C[s]; ne = unit(np.array([s * math.sin(math.radians(EAR_OUT)), -math.cos(math.radians(EAR_OUT)), .12]))
    up = np.array([0, 0, 1.]); up = unit(up - ne * (up @ ne)); tt = np.cross(up, ne)
    at = au_ = EAR_R; an, dish = EAR_AN, EAR_DISH
    seg, rows_ = 24, 11; V = []
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
            if front_face:                   # the ear chart: +u is outward on both ears
                a_ = s * (p @ tt) / at; b_ = p @ up / au_; lp[uvl].uv = tuple(au('ear', .5 + .48 * a_, .5 + .48 * b_))
            else:
                n_ = unit(np.array(lp.vert.normal)); lp[uvl].uv = tuple(ramp_uv('fur', sval(n_[None], .06, hi=.12))[0])
    bm.to_mesh(ob.data); bm.free()
    ear_info[s] = (C0, ne, up, tt)

# ================================================================ BODY (per design)
joint_arms = {}; joint_legs = {}; anchors = {}
def body_ray_f(f):
    def body_ray(theta, z):
        theta = np.asarray(theta, float); z = np.asarray(z, float) * np.ones_like(theta)
        d = np.stack([np.sin(theta), -np.cos(theta), np.zeros_like(theta)], -1)
        o = np.stack([np.zeros_like(theta), np.full_like(theta, .005), z], -1)
        lo = np.zeros(len(theta)); hi = np.full(len(theta), .6)
        for _ in range(36):
            m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0; lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
        P = o + d * ((lo + hi) / 2)[:, None]; return P, grad(f, P)
    return body_ray
def build_torso(torso_sdf, z_edges, ramps_, el_deg, NS=46, name='torso'):
    """the torso SDF meshed by rays from a centre on the colour edge z_edges[0]; extra edges (z) get exact rings when the
    elevation list hits them; ramps_[i] colours the band between z_edges[i-1] and z_edges[i] (bottom to top)"""
    OT = np.array([0, .005, z_edges[0]])
    el = np.radians(el_deg); az = np.linspace(0, 2 * PI, NS, endpoint=False)
    D = np.stack([np.cos(el)[:, None] * np.sin(az)[None], -np.cos(el)[:, None] * np.cos(az)[None], np.sin(el)[:, None] * np.ones(NS)[None]], -1).reshape(-1, 3)
    D = np.concatenate([D, [[0, 0, -1.], [0, 0, 1.]]])
    P = ray_outer(torso_sdf, OT, D, t1=.6); P[:-2][np.abs(np.repeat(el, NS)) < 1e-9, 2] = z_edges[0]
    N = grad(torso_sdf, P)
    occ = .30 * ao(lambda q: head_sdf(q), P, N, .05)
    val = sval(N, occ, hi=.20, lo=.24)
    ne = len(el); F = []; UV = []
    def vid(i, j): return i * NS + j % NS
    bot, top = len(P) - 2, len(P) - 1
    def add(f):
        zc = P[list(f), 2].mean(); rp = ramps_(P[list(f)])
        F.append(f); UV.append([tuple(ramp_uv(rp, val[k:k + 1])[0]) for k in f])
    for i in range(ne - 1):
        for j in range(NS): add((vid(i, j), vid(i, j + 1), vid(i + 1, j + 1), vid(i + 1, j)))
    for j in range(NS): add((vid(0, j + 1), vid(0, j), bot))
    for j in range(NS): add((vid(ne - 1, j), vid(ne - 1, j + 1), top))
    return make_obj(name, P, F, UV, 'body', N)
def build_band_ring(name, body_ray, zc, prof, th0, th1, group, ramp, closed, n=64, shade_k=(.18, .24), zfun=None):
    th = np.linspace(th0, th1, n, endpoint=not closed); V = []; rows = []
    for dz, t in prof:
        zz = zc + dz + (zfun(th) if zfun is not None else 0.)
        B, N = body_ray(th, zz); Nh = unit(N * np.array([1, 1, .3])); rows.append(list(range(len(V), len(V) + len(th)))); V += list(B + Nh * t)
    F = []; n = len(th)
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(n if closed else n - 1): F.append((a_[i], a_[(i + 1) % n], b_[(i + 1) % n], b_[i]))
    ob = make_obj(name, np.array(V), F, np.zeros((len(V), 2)), group)
    ramp_by_normal(ob, ramp, lambda Vv, Nn: sval(Nn, .25 * ao(head_sdf, Vv, Nn, .05), hi=shade_k[0], lo=shade_k[1]))
    return ob
def cloth_point_f(body_ray):
    def cloth_point(x, z, t):
        """a point at front-projected x (metres) and height z on the torso, offset t along its normal"""
        x = np.asarray(x, float); z = np.asarray(z, float) * np.ones_like(x)
        P0, _ = body_ray(np.zeros_like(x), z); r0 = np.maximum(-P0[:, 1], .05)
        th = np.arcsin(np.clip(x / r0, -.99, .99))
        for _ in range(4):
            P, N = body_ray(th, z); rr = np.maximum(np.hypot(P[:, 0], P[:, 1] - .005), .05)
            th = th + (np.arcsin(np.clip(x / rr, -.99, .99)) - np.arcsin(np.clip(P[:, 0] / rr, -.99, .99)))
        P, N = body_ray(th, z)
        tt = np.asarray(t, float)[..., None] if np.ndim(t) else t
        return P + N * tt, N
    return cloth_point
def cloth_slab(name, cloth_point, outline, t_front, t_back, group, ramp, step=.014, grid=(.026, .024), shade_k=(.18, .24)):
    """a thick cloth panel: CDT of its (x, z) outline, front and back faces wrapped on the torso, a rounded rim"""
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
def surface_band(name, torso_sdf, C, wd, th, base, ramp, group, ends=('round', 'round'), shade_k=(.22, .24), SIDES=10):
    """a thick rounded band swept along a guide C (points near the torso), snapped on the surface"""
    def snap(P):
        P = np.array(P, float)
        for _ in range(6): P = P - torso_sdf(P)[:, None] * grad(torso_sdf, P)
        return P, grad(torso_sdf, P)
    C, N = snap(C); n = len(C)
    wd = np.broadcast_to(np.asarray(wd, float), (n,)); base = np.broadcast_to(np.asarray(base, float), (n,))
    T = unit(np.gradient(C, axis=0)); Nn = unit(N - T * (N * T).sum(1)[:, None]); B = np.cross(T, Nn)
    Cc = C + Nn * (base + th / 2)[:, None]
    a = np.linspace(0, 2 * PI, SIDES, endpoint=False); cx = spow(np.cos(a), .45); cy = spow(np.sin(a), .55)
    V = []; rows = []
    def ring(c, b, nn, w, t):
        rows.append(list(range(len(V), len(V) + SIDES)))
        for i in range(SIDES): V.append(c + b * (w / 2 * cx[i]) + nn * (t / 2 * cy[i]))
    if ends[0] == 'round':
        for j in range(4, 0, -1):
            ang = j / 5 * PI / 2; ring(Cc[0] - T[0] * (wd[0] / 2 * math.sin(ang)), B[0], Nn[0], wd[0] * math.cos(ang), th * (1 - .25 * (j / 5) ** 2))
    for i in range(n): ring(Cc[i], B[i], Nn[i], wd[i], th)
    if ends[1] == 'round':
        for j in range(1, 5):
            ang = j / 5 * PI / 2; ring(Cc[-1] + T[-1] * (wd[-1] / 2 * math.sin(ang)), B[-1], Nn[-1], wd[-1] * math.cos(ang), th * (1 - .25 * (j / 5) ** 2))
    e0 = len(V); V.append(Cc[0] - T[0] * (wd[0] / 2 if ends[0] == 'round' else 0)); e1 = len(V); V.append(Cc[-1] + T[-1] * (wd[-1] / 2 if ends[1] == 'round' else 0))
    F = []
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(SIDES): F.append((a_[i], a_[(i + 1) % SIDES], b_[(i + 1) % SIDES], b_[i]))
    for i in range(SIDES): F.append((rows[0][(i + 1) % SIDES], rows[0][i], e0)); F.append((rows[-1][i], rows[-1][(i + 1) % SIDES], e1))
    ob = make_obj(name, np.array(V), F, np.zeros((len(V), 2)), group)
    ramp_by_normal(ob, ramp, lambda Vv, Nn_: sval(Nn_, .08 * ao(head_sdf, Vv, Nn_, .04), hi=shade_k[0], lo=shade_k[1] * .8))
    return ob, Cc, Nn, T, B
def dense(P, k=6):
    out = []
    for a_, b_ in zip(P, P[1:]):
        for t in np.linspace(0, 1, k, endpoint=False): out.append((1 - t) * np.array(a_, float) + t * np.array(b_, float))
    out.append(np.array(P[-1], float)); return np.array(out)
def resample3(g, n):
    L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(g, axis=0), axis=1))]); tt = np.linspace(0, L[-1], n)
    return np.stack([np.interp(tt, L, g[:, k]) for k in range(3)], -1)
def arms(sh_x, sh_z, ARM_DEG, L_wrist, paw_len, rows_fn, sides=18):
    for s, tag in ((-1, 'R'), (1, 'L')):
        sh = np.array([s * sh_x, .005, sh_z]); a = math.radians(ARM_DEG)
        dvec = unit(np.array([s * math.sin(a), -.05, -math.cos(a)]))
        root = sh - dvec * .09; elbow = sh + dvec * (L_wrist * .55); wrist = sh + dvec * L_wrist
        pts_ = [root, sh, elbow + np.array([0, -.004, 0]), wrist]
        def paw_grooves(V, NV, wrist=wrist, dvec=dvec):
            v = V - wrist; ax = v @ dvec; rad = v - np.outer(ax, dvec)
            f0 = np.array([0, -1., 0]); f0 = unit(f0 - dvec * (f0 @ dvec)); f1 = np.cross(dvec, f0)
            ang = np.arctan2(rad @ f1, rad @ f0)
            g = sum(np.exp(-((ang - a_) / .16) ** 2) for a_ in (-.42, .42))
            return .14 * g * smooth(.03, .065, ax)
        tube('arm.' + tag, pts_, rows_fn(), 'arm.' + tag, sides=sides, cap_rows=7, cap_len=1.0, squash=.92, occ_f=TORSO, extra_occ=paw_grooves)
        joint_arms[tag] = {'shoulder': [float(v) for v in sh], 'elbow': [float(v) for v in elbow], 'wrist': [float(v) for v in wrist],
                           'paw_tip': [float(v) for v in wrist + dvec * paw_len]}
def foot_sdf_s(s, FOOT):
    c = np.array([s * FOOT['x'], FOOT['y'], FOOT['rzlo']])
    def f(p):
        d = sell(p, c, FOOT['r'], FOOT['p'], FOOT['pzlo'], FOOT['rzlo'])
        for k in (-1, 1):            # two shallow toe grooves on the front of the foot
            g = ell(p, c + np.array([k * FOOT['r'][0] * .34, -FOOT['r'][1] * 1.12, FOOT['rzlo'] * .95]), [.0062, .020, .042])
            d = smax(d, -g, .006)
        return d
    return f, c
def legs(hip_x, hip_z, rows, FOOT, LEG_SQ=1.22, sides=16, z_ank=.050):
    for s, tag in ((-1, 'R'), (1, 'L')):
        hip = np.array([s * hip_x, -.005, hip_z]); ankle = np.array([s * (hip_x + .006), -.005, z_ank]); knee = (hip + ankle) / 2
        pts_ = [hip + np.array([0, 0, .03]), hip, knee, ankle]
        tube('leg.' + tag, pts_, rows, 'leg.' + tag, sides=sides, cap_rows=3, cap_len=.5, squash=LEG_SQ, occ_f=TORSO, occ_k=.25)
        ff, fc = foot_sdf_s(s, FOOT)
        def foot_shade(P, N, fc=fc):
            lat = (P[:, 0] - fc[0]) / FOOT['r'][0]; frontz = smooth(-.07, -.12, P[:, 1] - fc[1]) * smooth(.006, .02, P[:, 2]) * smooth(.07, .05, P[:, 2])
            groove = sum(np.exp(-((lat - k * .34) / .045) ** 2) for k in (-1, 1)) * frontz
            return sval(N, .22 * groove)
        sdf_ball('foot.' + tag, ff, fc + np.array([0, 0, .008]), 7, 'leg.' + tag, 'fur', shade=foot_shade, t1=.35)
        joint_legs[tag] = {'hip': [float(v) for v in hip], 'knee': [float(v) for v in knee], 'ankle': [float(v) for v in ankle],
                           'toe': [float(fc[0]), float(fc[1] - FOOT['r'][1]), .035]}

if A_:
    # ------------------------------------------------------------ A: Hana's pear overalls over an ivory shirt
    TB = ([0, -.005, .262], [.240, .190, .172], (2.5, 2.3, 2.2), 2.4, .112)     # the overalls barrel: widest at z 0.25, broad hips
    TC = ([0, .004, .470], [.190, .158, .135])                                   # the shirt chest under the head
    TF = ([0, -.030, .310], [.215, .180, .140])                                  # the round belly
    def TORSO(p): return smin(smin(sell(p, *TB), ell(p, *TC), .07), ell(p, *TF), .06)
    Z_EDGE = .452                                   # the shirt / overalls colour edge (the overalls' back and sides top)
    build_torso(TORSO, [Z_EDGE], lambda P: 'over' if P[:, 2].mean() < Z_EDGE - 1e-6 else 'shirt',
                [-86, -70, -55, -42, -31, -22, -14, -7, 0, 7, 14, 22, 31, 42, 55, 70, 84])
    body_ray = body_ray_f(TORSO); cloth_point = cloth_point_f(body_ray)
    TAIL = ([0, .196, .288], [.062, .054, .060])
    def tail_sdf(p): return ell(p, *TAIL)
    sdf_ball('stub_tail', tail_sdf, np.array(TAIL[0]), 5, 'tail', 'fur', occ_f=TORSO)
    # the overalls' top hem round the back and sides (under the bib in front): a soft rolled edge
    WB_Z = Z_EDGE
    build_band_ring('over_hem', body_ray, WB_Z, [(-.012, -.002), (-.010, .003), (-.006, .0055), (0, .0065), (.006, .0055), (.010, .003), (.012, -.002)],
                    0, 2 * PI, 'body', 'over', True, n=56)
    # the bib: from the chest (z 0.50, 0.277 m wide at the top) widening into the barrel under the arms
    BIB_TOP = .500; BIB_W0 = .139; BIB_BOT = .360; BIB_T = .009
    def bib_t(x, z):
        z = np.asarray(z, float); return .0004 + (BIB_T - .0004) * smooth(BIB_BOT, .43, z) + .0020 * smooth(BIB_TOP - .020, BIB_TOP - .008, z)
    def _bib_outline():
        rt = .022
        def hw(z): return BIB_W0 + .085 * float(smooth(.47, .37, z)) ** 1.3
        side = [(hw(z), z) for z in np.linspace(BIB_BOT, BIB_TOP - rt, 26)]
        def arc(c, r, a0, a1, n=8): return [(c[0] + r * math.cos(a), c[1] + r * math.sin(a)) for a in np.linspace(a0, a1, n)]
        pts_ = side + arc((BIB_W0 - rt, BIB_TOP - rt), rt, 0, PI / 2) + arc((-BIB_W0 + rt, BIB_TOP - rt), rt, PI / 2, PI) + [(-w, z) for w, z in side[::-1]]
        return np.array(pts_)
    bib_ob, BIB_OUT = cloth_slab('bib', cloth_point, _bib_outline(), bib_t, lambda x, z: np.full(np.shape(x), -.001), 'body', 'over')
    # the bib pocket: a broad rounded box in the accent green, a rolled top hem (0.213 m wide, z 0.295-0.414)
    PK_TOP = .414; PK_W = .1065; PK_BOT = .295; PK_T = .0060
    def _pocket_outline():
        rb, rt = .036, .010
        def arc(c, r, a0, a1, n=8): return [(c[0] + r * math.cos(a), c[1] + r * math.sin(a)) for a in np.linspace(a0, a1, n)]
        return np.array(arc((-PK_W + rb, PK_BOT + rb), rb, PI, 1.5 * PI) + arc((PK_W - rb, PK_BOT + rb), rb, 1.5 * PI, 2 * PI)
                        + arc((PK_W - rt, PK_TOP - rt), rt, 0, PI / 2) + arc((-PK_W + rt, PK_TOP - rt), rt, PI / 2, PI))
    def pk_back(x, z): return bib_t(x, z) - .0008
    def pk_front(x, z): return pk_back(x, z) + PK_T + .0035 * smooth(PK_TOP - .020, PK_TOP - .009, z)
    cloth_slab('bib_pocket', cloth_point, _pocket_outline(), pk_front, pk_back, 'body', 'accent', step=.012, shade_k=(.20, .26))
    # straps: thick rounded bands from the buttons straight up over the shoulders and straight down the back
    STRAP_W = .064; STRAP_T = .011; BTN_Z = .470; STRAP_X = .107
    strap_info = {}
    for s in (-1, 1):
        F2 = dense([(s * STRAP_X, .446), (s * STRAP_X, .50), (s * (STRAP_X + .004), .55), (s * (STRAP_X + .008), .585)])
        Fy = front_hit(F2[:, 0], F2[:, 1], TORSO, -.6, .3)
        B2 = dense([(s * (STRAP_X + .008), .585), (s * (STRAP_X - .002), .52), (s * (STRAP_X - .006), .44)])
        By = front_hit(B2[:, 0], B2[:, 1], TORSO, .6, -.3)
        SHP = np.array([(s * (STRAP_X + .010), -.075, .596), (s * (STRAP_X + .012), .0, .606), (s * (STRAP_X + .010), .075, .596)])
        G = np.concatenate([np.stack([F2[:, 0], Fy, F2[:, 1]], -1)[np.isfinite(Fy)], SHP, np.stack([B2[:, 0], By, B2[:, 1]], -1)[np.isfinite(By)]])
        C = resample3(G, 40)
        for _ in range(4): C[1:-1] = (C[:-2] + 2 * C[1:-1] + C[2:]) / 4
        z = C[:, 2]; frontp = C[:, 1] < 0
        base = np.where(frontp, np.where(z <= BIB_TOP, bib_t(0, z) + .0012, bib_t(0, BIB_TOP) * smooth(BIB_TOP + .05, BIB_TOP, z) + .002),
                        .0020 + .0060 * smooth(WB_Z + .016, WB_Z + .004, z))
        ob, Cc, Nn, T, Bv = surface_band('strap.' + ('L' if s > 0 else 'R'), TORSO, C, STRAP_W, STRAP_T, base, 'over', 'body')
        kb = int(np.argmin(np.abs(Cc[:, 2] - BTN_Z) + 9 * (Cc[:, 1] > 0)))
        strap_info[s] = dict(btn=Cc[kb] + Nn[kb] * STRAP_T / 2, frame=(Bv[kb], T[kb], Nn[kb]))
    # the two big buttons on the strap ends at the bib corners (0.067 m), a raised rim round a dished centre
    for s in (-1, 1):
        c, (b, t, nn) = strap_info[s]['btn'], strap_info[s]['frame']
        fr = Frame(c, b, nn, t)
        def f(p, fr=fr):
            q = fr.local(p); r = np.sqrt(q[:, 0] ** 2 + q[:, 2] ** 2)
            d = sell(q, [0, .0, 0], [.0335, .0105, .0335], (2.4, 2.0, 2.4))
            return d
        def shade(P, N, fr=fr):
            q = fr.local(P); rim = np.exp(-((np.sqrt(q[:, 0] ** 2 + q[:, 2] ** 2) - .0200) / .0035) ** 2) * .16   # the painted ring groove
            return sval(N, rim, hi=.28, lo=.26)
        sdf_ball('button.' + ('L' if s > 0 else 'R'), f, c, 7, 'body', 'accent', shade=shade, t1=.06, frame=fr, scale=(1., .30, 1.))
    # arms: the short puffed ivory sleeve with a rolled hem, then the fur arm and mitten paw
    def arm_rows():
        return [(0., .062, 'shirt'), (.12, .078, 'shirt'), (.26, .085, 'shirt'), (.38, .084, 'shirt'), (.44, .080, 'shirt'),
                (.475, .081, 'shirt'), (.495, .079, 'shirt'), (.510, .073, 'shirt'), (.518, .066, 'fur'), (.54, .062, 'fur'),
                (.64, .059, 'fur'), (.76, .061, 'fur'), (.86, .064, 'fur'), (.94, .066, 'fur'), (1., .067, 'fur')]
    arms(.178, .505, 34., .190, .070, arm_rows, sides=16)
    # legs: the shorts (wide, a turned-up cuff z 0.114-0.157), then the short fur leg into the foot
    FOOT = dict(x=.120, y=-.028, r=[.100, .132, .042], p=(2.6, 2.8, 2.2), pzlo=4.0, rzlo=.036)
    # spline z 0.25 -> 0.050 (0.20 long): t = (0.25 - z) / 0.20
    tz = lambda z: (.25 - z) / .20
    LEG_ROWS = [(0., .104, 'over'), (tz(.20), .112, 'over'), (tz(.17), .112, 'over'), (tz(.160), .109, 'over'),
                (tz(.157), .110, 'over'), (tz(.152), .113, 'over'), (tz(.135), .1135, 'over'), (tz(.122), .1125, 'over'),
                (tz(.116), .108, 'over'), (tz(.113), .100, 'over'), (tz(.111), .090, 'fur'), (tz(.10), .080, 'fur'),
                (tz(.07), .081, 'fur'), (1., .082, 'fur')]
    legs(.110, .25, LEG_ROWS, FOOT, LEG_SQ=1.18, sides=14)
    # ------------------------------------------------------------ the flower at her left ear (+X): five flattened
    # oval petals round a domed centre, facing out, forward and up
    FL_C = L2M(np.array([.270, -.10, .770]))
    FL_N = unit(np.array([.30, -.82, .48])); FL_U = unit(np.array([0, 0, 1.]) - FL_N * FL_N[2]); FL_T = np.cross(FL_U, FL_N)
    # sit the flower on the skin / ear: push it out until its back clears the head by 4 mm
    for _ in range(30):
        if head_sdf(FL_C[None])[0] < .004 * 0 + .012: FL_C = FL_C + FL_N * .003
    FFR = Frame(FL_C, FL_T, -FL_N, FL_U)        # local x across, y into the head, z up the flower face
    PET_L, PET_W, PET_T = .104 * W, .112 * W, .028 * W
    def petal_sdf_k(k):
        a = math.radians(90 + 72 * k + 8)
        c = np.array([math.cos(a) * PET_L * .78, .004, math.sin(a) * PET_L * .78])
        def f(p):
            q = FFR.local(p) - c; ca, sa = math.cos(a), math.sin(a)
            qr = np.stack([q[:, 0] * ca + q[:, 2] * sa, q[:, 1], -q[:, 0] * sa + q[:, 2] * ca], -1)
            d = ell(qr, [0, 0, 0], [PET_L * .62, PET_T, PET_W * .5])
            return d
        return f, FFR.world(c)
    pet_fs = [petal_sdf_k(k) for k in range(5)]
    def petals_sdf(p): return np.min([f(p) for f, _ in pet_fs], axis=0)
    FC_C = FFR.world(np.array([0, -.006, 0]))
    def fcentre_sdf(p): q = FFR.local(p); return ell(q, [0, -.016, 0], [.054 * W, .028 * W, .054 * W])
    for k, (f, c) in enumerate(pet_fs):
        def pshade(P, N, c=c):
            q = FFR.local(P); rr = np.sqrt(q[:, 0] ** 2 + q[:, 2] ** 2)
            return sval(N, .18 * ao(lambda r: np.minimum(fcentre_sdf(r), head_sdf(r)), P, N, .015) + .05 * smooth(.04 * W, .0, rr), hi=.20, lo=.24)
        sdf_ball('petal_%d' % k, f, c, 4, 'flower', 'flower', shade=pshade, t1=.08, frame=FFR, scale=(1., .45, 1.))
    sdf_ball('flower_centre', fcentre_sdf, FFR.world(np.array([0, -.016, 0])), 4, 'flower', 'fcentre', t1=.06, frame=FFR, scale=(1., .5, 1.),
             shade=lambda P, N: sval(N, 0., hi=.22, lo=.22))
    anchors['flower'] = [float(v) for v in FL_C]
else:
    # ------------------------------------------------------------ B: Mugi's barrel in a lilac wrap jacket and a sky-blue obi
    TB = ([0, -.008, .340], [.262, .228, .240], (2.4, 2.2, 2.2), 2.4, .160)     # the barrel belly (jacket)
    TC = ([0, .004, .480], [.205, .170, .125])                                   # the chest under the head
    TS = ([0, .006, .200], [.258, .214, .082])                                   # the trousers' seat under the hem
    def TORSO(p): return smin(smin(sell(p, *TB), ell(p, *TC), .07), ell(p, *TS), .05)
    Z_HEM = .214; OBI_Z0, OBI_Z1 = .318, .424
    def b_ramp(P):
        z = P[:, 2].mean()
        if z < Z_HEM - 1e-6: return 'trousers'
        return 'jacket'
    build_torso(TORSO, [Z_HEM], b_ramp, [-86, -68, -50, -34, -20, -10, 0, 6, 13, 20, 26, 32, 38, 45, 53, 62, 72, 84])
    body_ray = body_ray_f(TORSO); cloth_point = cloth_point_f(body_ray)
    TAIL = ([0, .222, .168], [.058, .052, .056])
    def tail_sdf(p): return ell(p, *TAIL)
    # the obi: a thick rounded band (0.106 m tall, 16 mm proud)
    oh = (OBI_Z1 - OBI_Z0) / 2; ozc = (OBI_Z0 + OBI_Z1) / 2
    build_band_ring('obi', body_ray, ozc, [(-oh, -.002), (-oh + .002, .007), (-oh + .006, .0130), (-oh + .014, .0160), (oh - .014, .0160),
                                           (oh - .006, .0130), (oh - .002, .007), (oh, -.002)], 0, 2 * PI, 'body', 'obi', True, n=48, shade_k=(.20, .22))
    # the jacket's flared hem: a soft rolled lip standing out over the trousers
    build_band_ring('jacket_hem', body_ray, Z_HEM, [(-.006, .010), (-.005, .019), (-.001, .025), (.006, .026), (.016, .020), (.028, .010), (.040, .002), (.050, -.002)],
                    0, 2 * PI, 'body', 'jacket', True, n=64, shade_k=(.18, .26))
    # the crossover collar: a lighter rolled band from her left shoulder by the neck down across to her right side at the obi,
    # then the overlapping panel's edge from under the obi down to the hem; and the under panel's collar to the V point
    def front_pts(xz, ysgn=-1):
        xz = np.asarray(xz, float); y = front_hit(xz[:, 0], xz[:, 1], TORSO, -.6 * -ysgn, .3 * -ysgn) if ysgn < 0 else None
        return np.stack([xz[:, 0], y, xz[:, 1]], -1)
    g1 = front_pts(dense([(.105, .585), (.070, .548), (.000, .496), (-.070, .452), (-.135, .420)], 8))
    g1 = np.concatenate([np.array([[.118, .02, .600]]), g1]); g1 = resample3(g1[np.all(np.isfinite(g1), 1)], 36)
    surface_band('collar_over', TORSO, g1, np.linspace(.040, .044, 36), .0085, .0012 + .0035 * smooth(.40, .60, g1[:, 2]), 'collar', 'body', ends=('round', 'flat'))
    g2 = front_pts(dense([(-.105, .585), (-.065, .556), (-.012, .530)], 8))
    g2 = np.concatenate([np.array([[-.118, .02, .600]]), g2]); g2 = resample3(g2[np.all(np.isfinite(g2), 1)], 18)
    surface_band('collar_under', TORSO, g2, .036, .0075, .0010, 'collar', 'body', ends=('round', 'round'))
    g3 = front_pts(dense([(-.150, .312), (-.168, .262), (-.182, .225)], 6)); g3 = resample3(g3[np.all(np.isfinite(g3), 1)], 12)
    surface_band('panel_edge', TORSO, g3, .030, .0060, .0008, 'collar', 'body', ends=('flat', 'flat'))
    # the V neck shows fur: a small painted fur V (on the torso's own chart: a fur-coloured patch slab)
    def _v_outline(): return np.array([(-.060, .600), (-.050, .566), (-.012, .528), (.000, .522), (.040, .546), (.075, .575), (.085, .600)])
    cloth_slab('neck_fur', cloth_point, _v_outline(), lambda x, z: np.full(np.shape(x), .0006), lambda x, z: np.full(np.shape(x), -.002), 'body', 'fur', step=.012)
    sdf_ball('stub_tail', tail_sdf, np.array(TAIL[0]), 5, 'tail', 'fur', occ_f=TORSO)
    # arms: the wide short kimono sleeve with a broad open hem, then the thick fur arm and mitten paw
    def arm_rows():
        return [(0., .070, 'jacket'), (.12, .094, 'jacket'), (.26, .104, 'jacket'), (.38, .108, 'jacket'), (.44, .109, 'jacket'),
                (.470, .108, 'jacket'), (.485, .102, 'jacket'), (.492, .090, 'jacket'), (.497, .076, 'fur'), (.52, .068, 'fur'),
                (.62, .065, 'fur'), (.74, .067, 'fur'), (.85, .070, 'fur'), (.93, .072, 'fur'), (1., .073, 'fur')]
    arms(.205, .505, 38., .200, .074, arm_rows)
    # legs: the balloon trouser legs (inflated, pinched at the cropped cuff, z 0.09), the short thick fur leg, broad feet
    FOOT = dict(x=.133, y=-.026, r=[.104, .136, .044], p=(2.6, 2.8, 2.2), pzlo=4.0, rzlo=.037)
    tz = lambda z: (.25 - z) / .20
    LEG_ROWS = [(0., .080, 'trousers'), (tz(.23), .098, 'trousers'), (tz(.20), .128, 'trousers'), (tz(.17), .145, 'trousers'), (tz(.135), .141, 'trousers'),
                (tz(.112), .126, 'trousers'), (tz(.099), .106, 'trousers'), (tz(.093), .096, 'trousers'), (tz(.090), .088, 'fur'),
                (tz(.08), .086, 'fur'), (tz(.06), .087, 'fur'), (1., .088, 'fur')]
    legs(.126, .22, LEG_ROWS, FOOT, LEG_SQ=1.04, sides=14)
    # ------------------------------------------------------------ the mustard beret (round 2): a soft rolled band on the
    # crown between the ears, a puffy dome on it that droops forward over her left side, and the nub. Neither ear is cut:
    # the band ring stays inside the ears' inner edges and the dome's underside clears the ear tops (checked below).
    BR_P = dict(band_c=(.000, .040, .788), band_r=(.172, .170), band_t=(.031, .029),
                dome_c=(.045, .010, .868), dome_r=(.290, .300, .150), dome_lo=.070, back_deg=6.,
                lobe_c=(.215, -.175, .795), lobe_r=(.135, .105, .088), nub=(.090, -.020))
    BR_C = L2M(np.array(BR_P['dome_c']))
    rx_ = math.radians(BR_P['back_deg'])                       # the dome leans back a little (front up), the sheet's side view
    Rx = np.array([[1, 0, 0], [0, math.cos(rx_), -math.sin(rx_)], [0, math.sin(rx_), math.cos(rx_)]])
    BFR = Frame(BR_C, Rx[:, 0], Rx[:, 1], Rx[:, 2])
    DOME_R = np.array(BR_P['dome_r']) * W; LOBE_C = L2M(np.array(BR_P['lobe_c'])); LOBE_R = np.array(BR_P['lobe_r']) * W
    def dome_sdf(p):
        q = BFR.local(p); return sell(q, [0, 0, 0], DOME_R, (2.2, 2.2, 2.0), 3.2, BR_P['dome_lo'] * W)    # a flat underside resting on the band
    def lobe_sdf(p): return ell(p, LOBE_C, LOBE_R)
    def beret_sdf(p): return smin(dome_sdf(p), lobe_sdf(p), .060 * W)
    def bshade(P, N):
        return sval(N, .26 * ao(lambda r: np.minimum(head_sdf(r), band_sdf(r)), P, N, .03), hi=.20, lo=.26)
    # the band: a soft rounded-rectangle tube on a ring round the crown (an analytic torus, partly inside the head)
    BC = L2M(np.array(BR_P['band_c'])); BRx, BRy = BR_P['band_r'][0] * W, BR_P['band_r'][1] * W; BTz, BTr = BR_P['band_t'][0] * W, BR_P['band_t'][1] * W
    def band_sdf(p):
        q = np.asarray(p) - BC; rr = np.sqrt((q[..., 0] / BRx) ** 2 + (q[..., 1] / BRy) ** 2); R0 = (BRx + BRy) / 2
        return np.sqrt((((rr - 1) * R0) / BTr) ** 2 + (q[..., 2] / BTz) ** 2) * min(BTr, BTz) - min(BTr, BTz)
    sdf_ball('beret', beret_sdf, BR_C + np.array([.03 * W, -.02 * W, -.01 * W]), 11, 'beret', 'beret', shade=bshade, t1=.45, frame=BFR, scale=(1., 1., .50))
    NPH, NPR = 40, 10; V = []; Nn = []
    a_ = np.linspace(0, 2 * PI, NPR, endpoint=False); cs = spow(np.cos(a_), .70); sn = spow(np.sin(a_), .70)
    for ph in np.linspace(0, 2 * PI, NPH, endpoint=False):
        rad = np.array([BRx * math.cos(ph), BRy * math.sin(ph), 0.]); out = unit(np.array([math.cos(ph) / BRx, math.sin(ph) / BRy, 0.]))
        for k in range(NPR):
            V.append(BC + rad + out * BTr * cs[k] + np.array([0, 0, BTz * sn[k]]))
            Nn.append(unit(out * math.cos(a_[k]) / BTr + np.array([0, 0, math.sin(a_[k]) / BTz])))
    V = np.array(V); Nn = np.array(Nn); F = []
    for i in range(NPH):
        for k in range(NPR):
            a0, a1 = i * NPR + k, i * NPR + (k + 1) % NPR; b0, b1 = ((i + 1) % NPH) * NPR + k, ((i + 1) % NPH) * NPR + (k + 1) % NPR
            F.append((a0, b0, b1, a1))
    occ = .30 * ao(lambda r: np.minimum(head_sdf(r), beret_sdf(r)), V, Nn, .02)
    make_obj('beret_band', V, F, ramp_uv('beret', sval(Nn, occ, hi=.18, lo=.26) - .05), 'beret', Nn)
    NUB_C = BFR.world(np.array([BR_P['nub'][0] * W, BR_P['nub'][1] * W, DOME_R[2] * .93]))
    def nub_sdf(p):
        q = BFR.local(p) - BFR.local(NUB_C[None])[0]; return ell(q, [0, 0, .014 * W], [.052 * W, .044 * W, .048 * W])
    sdf_ball('beret_nub', nub_sdf, NUB_C + BFR.M[:, 2] * .012 * W, 5, 'beret', 'beret', t1=.08, frame=BFR,
             shade=lambda P, N: sval(N, .25 * ao(beret_sdf, P, N, .02), hi=.20, lo=.26))
    anchors['beret'] = [float(v) for v in BR_C]

if B_:
    EVb = np.concatenate([np.array([list(v.co) for v in o.data.vertices]) for g in ('ear.L', 'ear.R') for o in parts[g]])
    LOG['ear_beret_clear_mm'] = {'dome+lobe': round(float(beret_sdf(EVb).min()) * 1000, 1), 'band': round(float(band_sdf(EVb).min()) * 1000, 1)}
    print('EAR_CLEAR', LOG['ear_beret_clear_mm'], flush=True)
# ================================================================ PAINTED ATLAS (2048, deterministic PNG)
def stroke(x, z, P, half, aa):
    best = np.full(len(x), 9.)
    for i in range(len(P) - 1):
        a = P[i]; b = P[i + 1]; ab = b - a; L2 = ab @ ab
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        dx = x - (a[0] + t * ab[0]); dz = z - (a[1] + t * ab[1])
        best = np.minimum(best, np.sqrt(dx * dx + dz * dz) - (half[i] * (1 - t) + half[i + 1] * t))
    return 1 - smooth(-aa, aa, best)
def paint_face(U, V):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = radial_hit(d); n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    fr = smooth(HY + .02, HY - .08, y)
    C = ramp_colour('fur', head_shade(P, n))
    # the muzzle: a clean oval in the front view with a soft 2-3 mm border, its own soft light
    rm = np.sqrt((x / MUZ_HW) ** 2 + ((z - MUZ_C) / MUZ_HH) ** 2)
    C = mix(C, ramp_colour('muz', sval(n, 0., hi=.14, lo=.16)), (1 - smooth(.975, 1.022, rm)) * fr * PAINT_OPTS['muzzle'])
    # blush ovals (soft)
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), (.92 if A_ else .88) * (1 - smooth(.70, 1.12, r)) * fr * PAINT_OPTS['blush'])
    # brows: soft arcs tapering to rounded points
    t = np.linspace(-1, 1, 15)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * BROW_L * t, BROW_Z + .018 * W * (1 - t * t) - .007 * W + .004 * W * t], -1)
        half = BROW_T * np.maximum(0, 1 - t * t) ** .65 + .0014 * W
        box = (np.abs(x - s * BROW_X) < .10 * W) & (np.abs(z - BROW_Z) < .05 * W) & (fr > 0)
        a = np.zeros(len(x)); a[box] = stroke(x[box], z[box], Pb, half, .0030 * W)
        C = mix(C, rgb('brow'), .95 * a)
    # the smile: one U arc from corner to corner, the ends curling up into small hooks (the sheet: no philtrum line)
    lw = .0052 * W
    u_ = np.linspace(-1, 1, 41)
    Pm = np.stack([M_HW * .90 * u_, M_BZ + (M_CZ - M_BZ - .010 * W) * np.abs(u_) ** 2.2], -1)
    hook = [np.array([[sg * M_HW * .90, Pm[0, 1] if sg < 0 else Pm[-1, 1]], [sg * M_HW * 1.02, M_CZ + .006 * W]]) for sg in (-1, 1)]
    half = np.full(len(Pm), lw); half[[0, -1]] = lw * .8
    ib = (np.abs(x) < .14 * W) & (np.abs(z - MZM) < .06 * W) & (fr > 0)
    a = np.zeros(len(x)); a[ib] = stroke(x[ib], z[ib], Pm, half, .0026 * W)
    for hk in hook: a[ib] = np.maximum(a[ib], stroke(x[ib], z[ib], hk, np.array([lw * .85, lw * .55]), .0026 * W))
    C = mix(C, rgb('mouth'), .96 * a)
    return C.reshape(sh + (3,))

def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    irx, irz, ixo = FACE['iris']
    ix = -s * ixo; iz = -.05
    C = mix(rgb('sclera'), rgb('#E9DDD3'), .45 * smooth(.35, .95, Z))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#5A3422'), rgb('#3A2016'), smooth(-.95, .10, ez))
    I = mix(I, rgb('#2C1810'), smooth(.80, 1.0, r) * .60)
    I = I * (1 - .025 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 26 + r * 9)))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    pz = iz + .06; R = np.sqrt(((X - ix) / (.62 * irx)) ** 2 + ((Z - pz) / (.64 * irz)) ** 2)
    C = mix(C, rgb('pupil'), .85 * (1 - smooth(.90, 1.10, R)))
    hx = ix - s * .28 * irx; hz = iz + .44 * irz          # the big catchlight: upper, toward the nose (the sheet)
    big = np.sqrt(((X - hx) / (.20 * irx)) ** 2 + ((Z - hz) / (.17 * irz)) ** 2)
    small = np.sqrt(((X - (ix + s * .34 * irx)) / (.07 * irx)) ** 2 + ((Z - (iz - .46 * irz)) / (.06 * irz)) ** 2)
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
        ri = np.sqrt(((a - .14) / .46) ** 2 + ((b - .12) / .46) ** 2)        # the light inner disc sits up and out (the sheet)
        Ci = ramp_colour('muz', clamp(.46 + .16 * b - .12 * smooth(.55, 1.0, ri)))
        return mix(C, Ci, 1 - smooth(.95, 1.05, ri))
    if chart == 'nose':
        a = (U - .5) * .13 * W; b = (V - .5) * .13 * W
        C = ramp_colour('nose', .45 + .10 * smooth(-.02, .02, b))
        hl = np.exp(-(((a + .014 * W) / (.016 * W)) ** 2 + ((b - .011 * W) / (.009 * W)) ** 2))
        return mix(C, rgb('#7A5A4E'), .55 * hl)
    raise KeyError(chart)

atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = list((rgb('fur') * 255).astype(int)) + [255]
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
img = bpy.data.images.load(atlas_path); img.name = '%s_toy_painted_atlas_2048' % NAME; img.pack()
MAT = bpy.data.materials.new('%s_toy_atlas' % NAME); MAT.use_nodes = True
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
NOACC = all_verts([o for g, obs in parts.items() if g not in ('beret', 'flower') for o in obs])
rimL = np.array([verts[i] for i in roll_info[1][0]])
EV = {s: all_verts(parts['ear.' + ('L' if s > 0 else 'R')]) for s in (-1, 1)}
BODYV = all_verts(parts['body'])
def bounds(g): v = all_verts(parts[g]); return [[round(float(v[:, k].min()), 3), round(float(v[:, k].max()), 3)] for k in range(3)]
MEAS = {'units': 'W = %.3f m face width at the cheeks; front-view z above the chin, profile y from the head centre (W)' % W,
        'total_height_m': round(float(ALL[:, 2].max()), 4), 'height_without_hat_or_flower_m': round(float(NOACC[:, 2].max()), 4),
        'lowest_z_m': round(float(ALL[:, 2].min()), 5), 'chin_m': CHIN,
        'head_width_W_at_z': {str(z): width_at(z) for z in (.02, .04, .06, .08, .10, .12, .14, .16, .18, .20, .24, .30, .36, .42, .48, .51, .60, .70, .76)},
        'profile_front_W_at_z': {str(z): prof_front(z) for z in (.05, .10, .15, .20, .25, .30, .40, .48, .53, .58, .63, .68, .73)},
        'profile_back_W_at_z': {str(z): back_at(z) for z in (.025, .05, .10, .151, .20, .30, .40, .50, .60, .70)},
        'nose_tip_y_m': round(float(nose_tip[:, 1].min()), 4), 'nose_tip_W_ahead': round(float((HY - nose_tip[:, 1].min()) / W), 3),
        'eye_opening_W': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'eye_centre_W': [round(EX / W, 3), round((EZ - CHIN) / W, 3)],
        'muzzle_oval_W': [round(2 * MUZ_HW / W, 3), round(2 * MUZ_HH / W, 3), round((MUZ_C - CHIN) / W, 3)],
        'nose_W': [round(float(np.ptp(NOSE_OUT[:, 0])) / W, 3), round(float(np.ptp(NOSE_OUT[:, 1])) / W, 3), round((NOSE_Z - CHIN) / W, 3)],
        'ear_top_m': round(float(max(EV[1][:, 2].max(), EV[-1][:, 2].max())), 4),
        'ear_outer_x_W': round(float(EV[1][:, 0].max() / W), 3),
        'body_width_m': round(float(np.ptp(BODYV[:, 0])), 3),
        'body_depth_m': [round(float(BODYV[:, 1].min()), 3), round(float(BODYV[:, 1].max()), 3)],
        'arm_span_m': round(float(np.ptp(all_verts(parts['arm.L'] + parts['arm.R'])[:, 0])), 3),
        'leg_bounds_m': bounds('leg.L'),
        'foot_span_m': round(float(np.ptp(all_verts(parts['leg.L'] + parts['leg.R'])[:, 0])), 3)}
for g in ('flower', 'beret'):
    if g in parts: MEAS[g + '_bounds_m'] = bounds(g)
def torso_width(z):
    th = np.array([PI / 2, -PI / 2]); P, _ = body_ray(th, z); return round(float(P[0, 0] - P[1, 0]), 3)
MEAS['torso_width_m_at_z'] = {str(z): torso_width(z) for z in (.15, .20, .25, .30, .35, .40, .45, .50)}
MEAS['skull_crown_m'] = round(float(CHIN + W * max(z for z in np.linspace(.5, .95, 901) if head_local(np.array([[0, 0, z]]))[0] < 0)), 4)
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
    piv = {'head': tuple(O), 'flower': tuple(O), 'beret': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'],
           'lash.L': eye_centers['L'], 'lash.R': eye_centers['R'], 'ear.L': tuple(EAR_C[1]), 'ear.R': tuple(EAR_C[-1]), 'tail': tuple(TAIL[0]),
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
    ears_j[tag] = {'base': [float(v) for v in C0 - ne * .03], 'fold': [float(v) for v in C0], 'tip': [float(v) for v in C0 + up * EAR_R * .5]}
hip_z = joint_legs['L']['hip'][2]
joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X', 'design': DESIGN, 'game_id': 'folk_bear_' + DESIGN,
          'hips': [0, .000, round(hip_z, 3)], 'spine': [0, .005, round(hip_z + .12, 3)], 'chest': [0, .010, round(CHIN - .09, 3)],
          'neck': [0, .010, round(CHIN - .005, 3)],
          'head': [float(v) for v in O], 'jaw_pivot': [0, float(HY - .10 * W), float(CHIN + .10 * W)],
          'eyes': eye_centers, 'ears': ears_j, 'arms': joint_arms, 'legs': joint_legs,
          'tail': [[float(v) for v in np.array(TAIL[0]) - np.array([0, .04, 0])], [float(v) for v in np.array(TAIL[0]) + np.array([0, .05, 0])]],
          'anchors': anchors,
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth SDF ball (cranium + cheek mass + muzzle), radially projected, analytic normals.',
                    'Eyelid holes ringed by 5 loops each, rim rolled in behind separate lens eyeballs; 3 loops round the mouth.',
                    'Separate pieces: eyes, lash ribbons (origin at the eye centre, for the upper lids), ears, tail, ' +
                    ('the flower (rigid head follower).' if A_ else 'the beret + nub (rigid head follower).'),
                    'Arms: sleeve rows, rolled hem, fur rows + mitten cap; legs: ' + ('shorts + cuff' if A_ else 'balloon trousers') + ' rows, fur leg, foot.']}
if RIG:
    pass
elif not FAST:
    with open(os.path.join(ROOT, 'joints-%s.json' % DESIGN), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-%s.json' % DESIGN), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-%s-fast.json' % DESIGN), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not FAST and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, TASK + '.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG: bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('FOLK_BEAR_BUILD_DONE', json.dumps({'design': DESIGN, 'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
