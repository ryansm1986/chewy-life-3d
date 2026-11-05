"""The Blender townsfolk ducks (Z-D6, task folk-duck-toy), Opus build, phase 1 (the models). Blender 4.3, no addons.
Deterministic. One family script: a shared duck base (head ball, bill, eyes, lash rolls, wing-mittens, webbed feet,
tail) with per-design proportions, plumage and outfits.

    blender --background --factory-startup --python build_folk-duck-toy.py -- --design a|b|all [--fast]

  a: Mugi, the steady gardener (white, sage overalls, wide straw hat)     -> public/models/folk-duck-a-toy.glb
  b: Mochi, the gentle baker's helper (butter yellow, lilac wrap tunic, cream apron, scalp tuft)
                                                                         -> public/models/folk-duck-b-toy.glb
1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus the GLBs.

Technique (Okami Shinju's duck machinery, the folk-cat family structure; measure-<x>.md has the sheet's numbers):
- The head is ONE smooth implicit ball: a superquadric fitted to the sheet's head front outline (half-width per height)
  and the side view's depth. Its skin is the field's zero surface reached by radial projection (CDT in a stereographic
  domain with edge loops round both eyelid holes and round the bill root; a toon-band refinement pass), every vertex on
  the surface with the field's analytic normal: the face stays convex, no sockets.
- The bill is two chunky SDF pieces (the upper bill rides the head, the lower bill is its own piece for the jaw), each
  with its own chart painted from 3D positions (the smile seam, the nostrils).
- Flush lens eyeballs in real lid holes; the upper lash line is its own roll per eye with three wing flicks.
- Body parts are lathes (superellipse sections, front / back depths from the side view) and SDF balls; cloth panels
  (bibs, pockets, apron) are thick slabs laid on those surfaces with rounded rims; straps and collar bands are rounded
  strips. One 2048 atlas: face, eyes, bills and 1-D painted shading ramps.
"""
import bpy, bmesh, math, json, os, sys, struct, zlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt
from mathutils.kdtree import KDTree

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
DESIGN = ARGV[ARGV.index('--design') + 1] if '--design' in ARGV else 'a'
FAST = '--fast' in ARGV
RIG = bool(globals().get('RIG_MODE'))      # reserved for the phase-2 rig script: no approved file is written in rig mode
if RIG: DESIGN = globals().get('RIG_DESIGN', DESIGN); FAST = os.environ.get('RIG_FAST') == '1'
if DESIGN == 'all':
    import subprocess, time
    for d in ('a', 'b'):
        p = subprocess.Popen([bpy.app.binary_path, '--background', '--factory-startup', '--python', os.path.abspath(__file__), '--', '--design', d])
        with open(os.path.join(ROOT, 'pids.log'), 'a', encoding='utf-8') as pl:
            pl.write('%s started %d (child of the all-run): design %s\n' % (time.strftime('%H:%M:%S'), p.pid, d))
        try: p.wait(timeout=900)
        except subprocess.TimeoutExpired:
            p.kill(); p.wait(); print('DESIGN_TIMEOUT', d, p.pid, flush=True)
    raise SystemExit(0)
assert DESIGN in ('a', 'b'), DESIGN
TAG = 'folk-duck-%s-toy' % DESIGN
NM = {'a': 'FolkDuckA', 'b': 'FolkDuckB'}[DESIGN]
MODEL = 'D:/projects/chewy-life-3d/public/models/%s.glb' % TAG
OUT_MODEL = os.path.join(ROOT, 'scratch', TAG + '-fast.glb') if FAST else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True); os.makedirs(os.path.join(ROOT, 'preview', DESIGN), exist_ok=True)
np.random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
LOG = {'design': DESIGN}

# ================================================================ per-design configuration (measure-a.md / measure-b.md)
# head-local units: W = the head width at the cheeks; x lateral (+ = her left), y depth (+ = back) from the head centre,
# z above the chin. The head close-ups give the face fractions; the main front view gives W and the chin height.
CFG = {
    'a': dict(W=.557, CHIN=.540, HY=.020,
              EYE=(.244, .402, .107, .099),           # centre x, z; opening half-width, half-height
              BROW=(.237, .622, .062, .0105),          # centre x, z; half-length, half-thickness
              BLUSH=(.360, .243, .066, .058),
              IRIS=dict(ix=.27, iz=-.04, irx=.66, irz=.94),
              LASH=(.24, .06)),
    'b': dict(W=.600, CHIN=.540, HY=.030,
              EYE=(.229, .404, .104, .102),
              BROW=(.228, .632, .062, .0105),
              BLUSH=(.357, .243, .064, .054),
              IRIS=dict(ix=.27, iz=-.04, irx=.66, irz=.94),
              LASH=(.25, .07)),
}[DESIGN]
W = CFG['W']; CHIN = CFG['CHIN']; HY = CFG['HY']
SW = W / .44                           # Rosie's metric detail sizes (authored at W 0.44) scale by SW

COMMON = {'bill': '#F2A044', 'billdark': '#DC8530', 'billlight': '#F8B866', 'billin': '#C46A26', 'billline': '#C26420',
          'nostril': '#35251E', 'iris': '#8A572D', 'pupil': '#35251E', 'sclera': '#FFF8EC', 'blush': '#EAA095',
          'lash': '#35251E', 'brow': '#35251E'}
if DESIGN == 'a':
    PAL = dict(COMMON, fur='#FFF6EA', furdark='#EAD8C2', furlight='#FFFAF2',
               over='#91B58A', overdark='#789E71', overlight='#A4C69D', overin='#6A8A63',
               hat='#DFC280', hatdark='#C8A964', hatlight='#EAD39A', hatin='#B8995A',
               cream='#FFF6EA', creamdark='#E8D6C0', creamlight='#FFFAF2')
else:
    PAL = dict(COMMON, fur='#FFE8A0', furdark='#F2D082', furlight='#FFF0BE',
               tunic='#B8A3CC', tunicdark='#9F89B5', tuniclight='#C9B7DA', tunicin='#8C76A4',
               cream='#FFF6EA', creamdark='#E9D7C2', creamlight='#FFFAF2')
CHARTS = {'face': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'bill': (768, 0, 768, 768), 'billlo': (1280, 896, 512, 256)}
if RIG:   # phase-2 charts in unused atlas space
    CHARTS.update({'lidU.L': (1536, 0, 256, 192), 'lidU.R': (1792, 0, 256, 192), 'lidD.L': (1536, 192, 256, 128), 'lidD.R': (1792, 192, 256, 128),
                   'cavity': (1536, 320, 128, 128), 'tongue': (1664, 320, 128, 128)})
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'bill': ('billdark', 'bill', 'billlight'),
         'billin': ('#A85A18', 'billin', '#D88032'), 'lash': ('#241812', 'lash', '#4A3A36'),
         'cream': ('creamdark', 'cream', 'creamlight')}
if DESIGN == 'a':
    RAMPS.update({'over': ('overdark', 'over', 'overlight'), 'overin': ('#566F50', 'overin', '#7A9873'),
                  'hat': ('hatdark', 'hat', 'hatlight'), 'hatin': ('#A08448', 'hatin', '#C8AA6C')})
else:
    RAMPS.update({'tunic': ('tunicdark', 'tunic', 'tuniclight'), 'tunicin': ('#76608E', 'tunicin', '#9E88B6')})
if RIG: RAMPS['floor'] = ('#4E1A1C', '#6A2426', '#7E3030')
RAMP_ROWS = {k: i for i, k in enumerate(RAMPS)}
def rgb(c):
    h = PAL.get(c, c).lstrip('#'); return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
def clamp(x): return np.clip(x, 0, 1)
def smooth(a, b, x):
    t = clamp((np.asarray(x, dtype=float) - a) / (b - a)); return t * t * (3 - 2 * t)
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

# ================================================================ SDF primitives
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
def cone_capsule(p, a, b, ra, rb):
    """a round cone (sphere-swept, radius ra at a, rb at b), approximate distance"""
    a = np.asarray(a, float); b = np.asarray(b, float); ab = b - a
    t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(p - (a + t[..., None] * ab), axis=-1) - (ra + (rb - ra) * t)
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

# ================================================================ mesh plumbing
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
def ramp_faces(ob, names, val_fn, dim=None):
    """per-face ramp names, per-vertex shading values from Blender's smooth normals"""
    me = ob.data; me.update(); Nn = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('normal', Nn); Nn = Nn.reshape(-1, 3)
    Vv = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', Vv); Vv = Vv.reshape(-1, 3)
    val = val_fn(Vv, Nn); uvl = me.uv_layers['Atlas']
    for p, nm in zip(me.polygons, names):
        k = (dim or {}).get(nm, 1.)
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index; uvl.data[li].uv = tuple(ramp_uv(nm, val[vi:vi + 1] * k)[0])

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
    """mesh the zero set of f by radial projection of a cube-sphere from centre (analytic normals, ramp UVs)"""
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

def pchip(xk, yk, x):
    """monotone cubic (Fritsch-Carlson) through a profile table"""
    xk = np.asarray(xk, float); yk = np.asarray(yk, float); x = np.asarray(x, float)
    h = np.diff(xk); dl = np.diff(yk) / h; m = np.zeros(len(xk))
    for i in range(1, len(xk) - 1):
        if dl[i - 1] * dl[i] > 0:
            w1 = 2 * h[i] + h[i - 1]; w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / dl[i - 1] + w2 / dl[i])
    m[0] = dl[0]; m[-1] = dl[-1]
    xc = np.clip(x, xk[0], xk[-1]); i = np.clip(np.searchsorted(xk, xc) - 1, 0, len(h) - 1); t = (xc - xk[i]) / h[i]
    return ((2 * t ** 3 - 3 * t ** 2 + 1) * yk[i] + (t ** 3 - 2 * t ** 2 + t) * h[i] * m[i] + (-2 * t ** 3 + 3 * t ** 2) * yk[i + 1]
            + (t ** 3 - t ** 2) * h[i] * m[i + 1])

class Lathe:
    """a ring surface from a profile table of (z, half-width, front depth, back depth[, y centre]); superellipse
    sections (exponent n); phi = 0 is the front (-Y), +pi/2 her left (+X)"""
    def __init__(self, rows, n=2.3, yc=0.):
        rows = sorted(rows, key=lambda r: r[0]); self.rows = rows
        self.Z, self.A, self.BF, self.BB = [np.array(c, float) for c in list(zip(*rows))[:4]]
        self.YC = np.array([r[4] if len(r) > 4 else yc for r in rows], float); self.n = n
        self.z0, self.z1 = float(self.Z[0]), float(self.Z[-1])
    def r(self, phi, z):
        z = np.asarray(z, float); phi = np.asarray(phi, float)
        a = pchip(self.Z, self.A, z); bf = pchip(self.Z, self.BF, z); bb = pchip(self.Z, self.BB, z)
        c = np.cos(phi); s = np.sin(phi); b = np.where(c > 0, bf, bb)
        return 1 / ((np.abs(s) / a) ** self.n + (np.abs(c) / b) ** self.n + 1e-12) ** (1 / self.n)
    def yc(self, z): return np.interp(z, self.Z, self.YC)
    def pt(self, phi, z, dr=0.):
        r = self.r(phi, z) + dr; phi = np.asarray(phi, float) * np.ones_like(r); z = np.asarray(z, float) * np.ones_like(r)
        return np.stack([r * np.sin(phi), self.yc(z) - r * np.cos(phi), z], -1)
    def normal(self, phi, z, e=2e-4):
        Pp = self.pt(phi + e, z) - self.pt(phi - e, z); Pz = self.pt(phi, z + e) - self.pt(phi, z - e)
        return unit(np.cross(Pp, Pz))
    def sdf(self, p):
        p = np.asarray(p, float); z = p[..., 2]; zc = np.clip(z, self.z0, self.z1)
        dy = p[..., 1] - self.yc(zc); phi = np.arctan2(p[..., 0], -dy); rho = np.hypot(p[..., 0], dy)
        return np.maximum(np.maximum((rho - self.r(phi, zc)) * .92, self.z0 - z), z - self.z1)
    def phi_of_x(self, x, z, side=-1):
        """the section angle whose surface point has lateral x at height z (front side -1, back side +1)"""
        x = np.atleast_1d(np.asarray(x, float)); z = np.broadcast_to(np.asarray(z, float), x.shape)
        lo = np.zeros_like(x); hi = np.full_like(x, PI / 2)
        for _ in range(40):
            m = (lo + hi) / 2; X = self.r(m, z) * np.sin(m)
            big = X > np.abs(x); hi = np.where(big, m, hi); lo = np.where(big, lo, m)
        ph = (lo + hi) / 2 * np.where(x < 0, -1., 1.)
        return ph if side < 0 else np.where(x < 0, -PI, PI) - ph
    def surf(self, x, z, side=-1, dr=0.):
        ph = self.phi_of_x(x, z, side); return self.pt(ph, z, dr), self.normal(ph, z)
    def mesh(self, name, group, ramp, zs, nphi=40, caps=(False, False), shade=None, face_ramp=None, rings=None):
        """rings: extra explicit (z_eval, z_put, dr, normal_tilt) rows inserted in order (rolled hems)"""
        phi = np.linspace(0, 2 * PI, nphi, endpoint=False)
        R = rings if rings is not None else [(z, z, 0., 0.) for z in zs]
        V = []; N = []; rows = []; rz = []
        for ze, zp, dr, tilt in R:
            P = self.pt(phi, ze, dr); P[:, 2] = zp; n = self.normal(phi, ze)
            if tilt: n = unit(n * (1 - abs(tilt)) + np.array([0, 0, np.sign(tilt)]) * abs(tilt))
            rows.append(list(range(len(V), len(V) + nphi))); V += list(P); N += list(n); rz.append(ze)
        F = []; FZ = []
        for k in range(len(rows) - 1):
            a_, b_ = rows[k], rows[k + 1]
            for i in range(nphi):
                F.append((a_[i], a_[(i + 1) % nphi], b_[(i + 1) % nphi], b_[i])); FZ.append((rz[k] + rz[k + 1]) / 2)
        for end, k in ((0, 0), (1, len(rows) - 1)):
            if not caps[end]: continue
            c = len(V); zz = R[k][1]; V.append(np.array([0., float(self.yc(R[k][0])), zz])); N.append(np.array([0, 0, 1. if end else -1.]))
            for i in range(nphi):
                F.append((rows[k][(i + 1) % nphi], rows[k][i], c) if end == 0 else (rows[k][i], rows[k][(i + 1) % nphi], c)); FZ.append(R[k][0])
        V = np.array(V); N = np.array(N)
        val = shade(V, N) if shade else sval(N)
        if face_ramp is None: uv = ramp_uv(ramp, val)
        else: uv = [[tuple(ramp_uv(face_ramp(fz), val[i:i + 1])[0]) for i in f] for f, fz in zip(F, FZ)]
        return make_obj(name, V, F, uv, group, N)

def strip(name, C, N, half_w, thick, group, ramp, nsec=9, embed=.0015, shade=None):
    """a rounded band lying on a surface: centre points C on the surface, surface normals N, a half-lens section"""
    C = np.asarray(C, float); N = unit(np.asarray(N, float)); M = len(C)
    T = np.gradient(C, axis=0); T = unit(T - N * (T * N).sum(1, keepdims=True)); S = unit(np.cross(N, T))
    hw = np.broadcast_to(np.asarray(half_w, float), (M,)); th = np.broadcast_to(np.asarray(thick, float), (M,))
    V = []; NV = []; F = []
    for j in range(M):
        for i in range(nsec):
            a = PI * i / (nsec - 1)
            V.append(C[j] + S[j] * (hw[j] * math.cos(a)) + N[j] * (th[j] * math.sin(a) ** .7 - embed))
            NV.append(unit(S[j] * math.cos(a) / max(hw[j], 1e-4) * .02 + N[j] * math.sin(a) / max(th[j], 1e-4) * .02 + N[j] * .2))
    for j in range(M - 1):
        for i in range(nsec - 1): F.append((j * nsec + i, j * nsec + i + 1, (j + 1) * nsec + i + 1, (j + 1) * nsec + i))
        F.append((j * nsec + nsec - 1, j * nsec, (j + 1) * nsec, (j + 1) * nsec + nsec - 1))
    for j in (0, M - 1): F.append(tuple(range(j * nsec, j * nsec + nsec)))
    V = np.array(V); NV = np.array(NV)
    ob = make_obj(name, V, F, np.zeros((len(V), 2)), group)
    mesh_normals_uv(ob, shade or (lambda Vv, Nn: ramp_uv(ramp, sval(Nn, 0., hi=.18, lo=.22))))
    return ob

def in_poly(P, poly):
    x = P[:, 0]; y = P[:, 1]; inside = np.zeros(len(P), bool); n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        inside ^= ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-30) + x1)
    return inside
def resample(poly, step):
    seg = np.linalg.norm(np.roll(poly, -1, 0) - poly, axis=1); L = np.concatenate([[0], np.cumsum(seg)])
    n = max(8, int(round(L[-1] / step))); t = np.linspace(0, L[-1], n, endpoint=False)
    P = np.concatenate([poly, poly[:1]]); return np.stack([np.interp(t, L, P[:, 0]), np.interp(t, L, P[:, 1])], -1)
def rrect(hw0, hw1, z0, z1, rc, top_r=None, n=7):
    """a rounded rectangle outline (x, z), half-width hw1 at the bottom z0, hw0 at the top z1, corner radius rc
    (top corners top_r)"""
    tr = rc if top_r is None else top_r; out = []
    def hw(z): return hw1 + (hw0 - hw1) * (z - z0) / (z1 - z0)
    for (cx, cz, a0, a1, r) in ((hw(z0 + rc) - rc, z0 + rc, -PI / 2, 0, rc), (hw(z1 - tr) - tr, z1 - tr, 0, PI / 2, tr),
                                (-(hw(z1 - tr) - tr), z1 - tr, PI / 2, PI, tr), (-(hw(z0 + rc) - rc), z0 + rc, PI, 1.5 * PI, rc)):
        for a in np.linspace(a0, a1, n): out.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return np.array(out)
def panel(name, outline, surf_fn, T, group, ramp, gap=.003, step=.016, grid=.022, rim=4, bulge=0., shade_occ=None, face_lift=None):
    """a thick cloth slab: outline (u, v) in a surface parameter plane, surf_fn(u, v) -> (points, normals) on the base
    surface; the slab's back sits gap off the surface, its front T further (+ a soft bulge in the middle), rounded rim"""
    def area(p): return .5 * np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1])
    out = np.asarray(outline, float)
    if area(out) < 0: out = out[::-1]
    out = resample(out, step); nO = len(out)
    u0, v0 = out.min(0); u1, v1 = out.max(0)
    gx, gz = np.meshgrid(np.arange(u0, u1, grid), np.arange(v0, v1, grid * .866))
    G = np.stack([gx.ravel(), gz.ravel()], -1); G[:, 0] += grid * .5 * (np.round((G[:, 1] - v0) / (grid * .866)) % 2)
    ok = in_poly(G, out); d = np.full(len(G), 9.)
    for i in range(nO):
        a = out[i]; b = out[(i + 1) % nO]; ab = b - a; t = np.clip(((G - a) @ ab) / (ab @ ab), 0, 1)
        d = np.minimum(d, np.linalg.norm(G - (a + t[:, None] * ab), axis=1))
    G = G[ok & (d > grid * .45)]; dG = d[ok & (d > grid * .45)]
    P2 = np.concatenate([out, G]); dist = np.concatenate([np.zeros(nO), dG])
    res = delaunay_2d_cdt([Vector(p) for p in P2], [(i, (i + 1) % nO) for i in range(nO)], [], 0, 1e-9)
    vout = np.array([[v.x, v.y] for v in res[0]]); Fo = np.array([list(f) for f in res[2]])
    assert len(vout) == len(P2), 'panel CDT merged points'
    Fo = Fo[in_poly(vout[Fo].mean(1), out)]; n2 = len(vout)
    S, Nn = surf_fn(vout[:, 0], vout[:, 1])
    bl = bulge * smooth(0, .05, dist)
    if face_lift is not None: bl = bl + face_lift(vout[:, 0], vout[:, 1])
    Pf = S + Nn * (gap + T + bl)[:, None]; Pb = S + Nn * gap
    V = list(Pf) + list(Pb); F = [tuple(f) for f in Fo] + [tuple(n2 + f[::-1]) for f in Fo]
    L2 = vout[:nO]; tang = np.roll(L2, -1, 0) - np.roll(L2, 1, 0); m = unit(np.stack([tang[:, 1], -tang[:, 0]], -1))
    rows = [list(range(nO))]
    for j in range(1, rim):
        ph = PI * j / rim; q = L2 + m * (T / 2 * .9 * math.sin(ph))
        Sq, Nq = surf_fn(q[:, 0], q[:, 1]); rows.append(list(range(len(V), len(V) + nO)))
        V += list(Sq + Nq * (gap + T / 2 * (1 + math.cos(ph))))
    rows.append(list(range(n2, n2 + nO)))
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(nO): F.append((a_[i], b_[i], b_[(i + 1) % nO], a_[(i + 1) % nO]))
    V = np.array(V); ob = make_obj(name, V, F, np.zeros((len(V), 2)), group)
    mesh_normals_uv(ob, lambda Vv, Nv: ramp_uv(ramp, sval(Nv, (shade_occ(Vv, Nv) if shade_occ else 0.), hi=.16, lo=.22)))
    return ob

# ================================================================ HEAD: the smooth ball (W units, z above the chin)
# a superquadric fitted to the head close-ups' outlines (measure-<x>.md): half-width 0.22 W at z 0.02, 0.32 at 0.05,
# 0.43 at 0.12, 0.49 at 0.22, 0.50 at 0.27-0.37, 0.47 at 0.52, 0.43 at 0.62, 0.36 at 0.72, 0.22 at 0.82; the crown at
# 0.85 W (the close-up 0.875, the front view 0.79: the middle); depth 0.82 W (the side view)
HEAD = dict(A=.500, BF=.410, BB=.415, ZC=.31, HT=.54, HB=.31, nA_t=2.3, nA_b=2.5, nB_t=2.2, nB_b=2.6, nBb_t=2.2, nBb_b=2.4,
            n=2.0, egg=.22)
def prof(z, m_t, m_b):
    zc = HEAD['ZC']; v = np.where(z >= zc, (z - zc) / HEAD['HT'], (zc - z) / HEAD['HB'])
    m = np.where(z >= zc, m_t, m_b); vv = np.clip(v, 0, 1)
    return np.maximum(np.clip(1 - vv ** m, 0, 1) ** (1 / m), 1e-4), v
def skull_local(q):
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    gA, v = prof(z, HEAD['nA_t'], HEAD['nA_b']); gB, _ = prof(z, HEAD['nB_t'], HEAD['nB_b']); gBb, _ = prof(z, HEAD['nBb_t'], HEAD['nBb_b'])
    a = HEAD['A'] * gA; b = np.where(y < 0, HEAD['BF'] * gB, HEAD['BB'] * gBb); n = HEAD['n']
    vv = np.clip(y / b, -1, 0); a = a * (1 - HEAD['egg'] * vv * vv)
    s = (np.abs(x / a) ** n + np.abs(y / b) ** n) ** (1 / n)
    d = (s - 1) * np.minimum(a, b)
    return np.where(v > 1, np.maximum(d, (v - 1) * np.where(z >= HEAD['ZC'], HEAD['HT'], HEAD['HB'])), d)
head_local = skull_local
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
O = np.array([0, HY, CHIN + .36 * W])
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
_ex, _ez, _ehw, _ehh = CFG['EYE']
EX = _ex * W; EZ = CHIN + _ez * W; EHW = _ehw * W; EHH = _ehh * W; EN = 2.15
def eye_unit(psi): return spow(np.cos(psi), 2 / EN), spow(np.sin(psi), 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
BROW_X = CFG['BROW'][0] * W; BROW_Z = CHIN + CFG['BROW'][1] * W; BROW_L = CFG['BROW'][2] * W; BROW_T = CFG['BROW'][3] * W
BLUSH = (CFG['BLUSH'][0] * W, CHIN + CFG['BLUSH'][1] * W, CFG['BLUSH'][2] * W, CFG['BLUSH'][3] * W)

# the hat's frame (A): defined here so the skin under its dome can be dropped
if DESIGN == 'a':
    HAT_TILT = math.radians(29.); HAT_C = np.array([0, HY + .030, CHIN + .680 * W])     # the brim's centre (on the dome's axis)
    HAT_R0, HAT_R1, HAT_DOME_H, HAT_DOME_R = .212, .335, .200, .205
    Rm = Matrix.Rotation(-HAT_TILT, 3, 'X')            # the front edge up, the back down
    RM = np.array(Rm)
    def hat_dome_r(z):
        t = np.clip(z / HAT_DOME_H, 0, 1); return HAT_DOME_R * (1 - t ** 2.6) ** (1 / 2.6) * (1 + .03 * (1 - t))
# ---------------------------------------------------------------- THE BILL (head-local W units; measure-<x>.md)
# front view: 0.48 W wide (half-width 0.24 at z 0.23-0.25), the arched top to 0.36 (half-widths 0.18 at 0.28, 0.14 at
# 0.30, 0.115 at 0.316, 0.08 at 0.34), the smile seam 0.168 across the middle rising to ~0.20 at x +-0.20 and ~0.24 at
# the corners, the lower bill below it to 0.105. Side view: the tip ~0.56 W ahead of the head centre.
BU_C = np.array([0, -.432, .247]); BU_R = (.248, .130, .118); BU_P = (2.8, 2.3, 2.2)
BL_C = np.array([0, -.412, .162]); BL_R = (.172, .118, .050); BL_P = (2.3, 2.3, 2.0)
K_LIP = .013
def lip_z(x, y):
    """the smile surface between the bills (z, W)"""
    return .162 + .052 * np.minimum((np.abs(x) / .205) ** 3.2, 1.6) + .018 * smooth(-.46, -.58, y)
def bill_top(y): return .372 + (y + .40) * .52            # the upper bill's top slopes down from the face to the tip
def bill_up_local(q):
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    sx = 1 - .60 * smooth(.255, .350, z)                 # the front view's arched top
    d = sell(np.stack([x / sx, y, z], -1), BU_C, BU_R, BU_P)
    d = smax(d, z - bill_top(y), .02)
    return smax(d, lip_z(x, y) - z, K_LIP)
def bill_lo_local(q):
    d = sell(q, BL_C, BL_R, BL_P)
    return smax(d, q[..., 2] - (lip_z(q[..., 0], q[..., 1]) + .012), .010)
def bill_up_sdf(p): return bill_up_local(M2L(p)) * W
def bill_lo_sdf(p): return bill_lo_local(M2L(p)) * W
def bill_sdf(p): return np.minimum(bill_up_sdf(p), bill_lo_sdf(p))

# ================================================================ B: the scalp tuft (two blunt lobes on the crown)
# the close-up: a big lobe at x -0.11 W (her right) rising to z 1.00 W, a smaller one at x +0.07 W to 0.94 W; the side
# view shows the big one a little forward, the small one behind it
def crown_z(xw, yw):
    zs = np.linspace(.95, .4, 400); q = np.stack([np.full(400, xw), np.full(400, yw), zs], -1)
    return float(zs[np.argmax(head_local(q) < 0)])
TUFT = []
if DESIGN == 'b':
    for (xw, yw, top, rx, ry, lean) in ((-.058, -.030, .985, .098, .088, -9.), (.068, .036, .940, .084, .076, 11.)):
        zc_ = crown_z(xw, yw); rz = (top - zc_) * .58 + .02
        TUFT.append((np.array([xw, yw, top - rz]), np.array([rx, ry, rz]), lean))
def tuft_sdf(p):
    q = M2L(p); d = None
    for c, r, lean in TUFT:
        a = math.radians(lean); qq = q - c
        qr = np.stack([qq[..., 0] * math.cos(a) - qq[..., 2] * math.sin(a), qq[..., 1], qq[..., 0] * math.sin(a) + qq[..., 2] * math.cos(a)], -1)
        e = sell(qr, [0, 0, 0], r, (2.0, 2.0, 2.0), pzlo=2.0, rzlo=r[2] * 1.6)
        d = e if d is None else smin(d, e, .02)
    return d * W

# ================================================================ HEAD SKIN: CDT on the ball, eyelid and bill-root loops
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
    wn = np.maximum(.08, 1 - .50 * smooth(-.10, -.80, np.cos(psi)) - .42 * smooth(-.2, -.9, np.sin(psi)))   # tighter toward the bill
    for k, kk in enumerate(EYE_SCALES): add_loop(c + (base - c) * (1 + (kk - 1) * wn[:, None]), 'eye%d_%d' % (s, k))
# the bill root: where the bill (both pieces) leaves the head skin, marched outward per angle in the front projection;
# three loops inside it (hidden under the bill; the rig can cut the mouth on them), no fill points inside
ROOT_ZC = .235; NRT = 44
_th = np.linspace(0, 2 * PI, NRT, endpoint=False); _t = np.linspace(0, .32, 257)
_x = (_t[None, :] * np.cos(_th)[:, None]) * W; _z = CHIN + (ROOT_ZC + .8 * _t[None, :] * np.sin(_th)[:, None]) * W
_y = front_hit(_x.ravel(), _z.ravel()).reshape(_x.shape); _P = np.stack([_x, _y, _z], -1).reshape(-1, 3)
_in = (bill_sdf(_P) < 0).reshape(_x.shape); _in[:, 0] = True
ROOT_R = _t[np.argmin(_in, 1)]
def root_xz(k, th=_th): return np.cos(th) * ROOT_R * k * W, CHIN + (ROOT_ZC + .8 * np.sin(th) * ROOT_R * k) * W
ROOT_SCALES = [.80, .89, .96]
for k, kk in enumerate(ROOT_SCALES): add_loop(to_dom(surf_dir(*root_xz(kk))), 'mouth_%d' % k)
LOG['bill_root_W'] = {'top_z': round(float(ROOT_ZC + .8 * ROOT_R[NRT // 4]), 3), 'bottom_z': round(float(ROOT_ZC - .8 * ROOT_R[3 * NRT // 4]), 3),
                      'half_width': round(float(ROOT_R[0]), 3)}
ROOT_POLY = np.stack(root_xz(1.03), -1)
NB = 56; AB = math.radians(150)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
def fib(n):
    ii = np.arange(n) + .5; phi = np.arccos(1 - 2 * ii / n); th = PI * (1 + 5 ** .5) * ii
    return np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
NF = 1250
SIL_N = 2200
D = fib(NF); D = D[np.arccos(np.clip(-D[:, 1], -1, 1)) < math.radians(147.)]
D2 = fib(5000); D2 = D2[np.arccos(np.clip(-D2[:, 1], -1, 1)) < math.radians(62)]
P2 = radial_hit(D2)
band2 = (np.abs(P2[:, 0]) < .46 * W) & (P2[:, 2] > CHIN + .06 * W) & (P2[:, 2] < CHIN + .60 * W)
D2 = D2[band2]; P2 = P2[band2]
Pf0 = radial_hit(D)
inband = (np.abs(Pf0[:, 0]) < .46 * W) & (Pf0[:, 2] > CHIN + .08 * W) & (Pf0[:, 2] < CHIN + .58 * W) & (np.arccos(np.clip(-D[:, 1], -1, 1)) < math.radians(62))
# the silhouette ring (front and 3/4 views see the cheeks and the dome edge-on): denser so the outline stays a curve
def sil_zone(D_, P_):
    al = np.degrees(np.arccos(np.clip(-D_[:, 1], -1, 1)))
    return (al > 62) & (al < 120) & (P_[:, 2] > CHIN + .015 * W) & (P_[:, 2] < CHIN + (.70 if DESIGN == 'a' else .86) * W)
D3 = fib(SIL_N); P3 = radial_hit(D3); s3 = sil_zone(D3, P3); D3 = D3[s3]; P3 = P3[s3]
s0 = sil_zone(D, Pf0) & ~inband
D = np.concatenate([D[~inband & ~s0], D2, D3]); Pf = np.concatenate([Pf0[~inband & ~s0], P2, P3]); keep = np.ones(len(D), bool)
if DESIGN == 'a':      # under the hat's dome (hidden): thin the crown's points
    hid = (Pf[:, 2] > CHIN + .72 * W) & (np.arange(len(Pf)) % 4 != 0)
    keep &= ~hid
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
keep &= ~(front & in_poly(Pf[:, [0, 2]], ROOT_POLY))
fill0 = len(pts); pts.extend([tuple(p) for p in dom[keep]])
def loop_clash():
    """names of constraint loops whose segments cross (diagnostic)"""
    P = np.array(pts); segs = []; owner = []
    for tg, ids in tags.items():
        if len(ids) < 3: continue
        for i in range(len(ids)): segs.append((ids[i], ids[(i + 1) % len(ids)])); owner.append(tg)
    A_ = P[[a for a, b in segs]]; B_ = P[[b for a, b in segs]]; out = set()
    def cr(o, a, b): return (a[..., 0] - o[..., 0]) * (b[..., 1] - o[..., 1]) - (a[..., 1] - o[..., 1]) * (b[..., 0] - o[..., 0])
    for i in range(len(segs)):
        d1 = cr(A_[i], B_[i], A_); d2 = cr(A_[i], B_[i], B_); d3 = cr(A_, B_, A_[i][None]); d4 = cr(A_, B_, B_[i][None])
        for j in np.where((d1 * d2 < 0) & (d3 * d4 < 0))[0]:
            if owner[j] != owner[i]: out.add(tuple(sorted((owner[i], owner[j]))))
            if owner[j] != owner[i] and owner[i].startswith('eye'): print('CLASH_AT', owner[i], segs[i][0] - tags[owner[i]][0], owner[j], segs[j][0] - tags[owner[j]][0])
    return sorted(out)
_cl = loop_clash()
if _cl: print('LOOP_CLASH', _cl, flush=True)
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
        if DESIGN == 'a': vis &= (Pt[:, :, 2] < CHIN + .70 * W).all(1)       # under the hat: not seen
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
    REFINE_ADD = 80; D_LOW, D_T = .14, .50
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
            if in_poly(Pv[F[t]].mean(0)[None][:, [0, 2]], ROOT_POLY)[0] and Pv[F[t]].mean(0)[1] < HY: continue
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
        verts.append(tuple(P - .0045 * SW * n + .0016 * SW * t)); vdir.append(vdir[vi]); vnorm.append(n); rr.append(i0 + k)   # the skin's normal (no grey ring)
    for k in range(NE):
        faces.append((rim[k], rim[(k + 1) % NE], rr[(k + 1) % NE], rr[k]))
    roll_info[s] = (rim, rr)
vdir = np.array(vdir); vnorm = np.array(vnorm); VP = np.array(verts)
if DESIGN == 'a':      # the skin inside the hat's dome (above the brim) is never seen: drop those faces
    _loc = (VP - HAT_C) @ RM; _r = np.hypot(_loc[:, 0], _loc[:, 1])
    _hid = (_loc[:, 2] > .035) & (_r < hat_dome_r(_loc[:, 2]) - .012)
    _nf = len(faces); faces = [f for f in faces if not all(_hid[i] for i in f)]
    LOG['skin_faces_dropped_under_hat'] = _nf - len(faces)
alpha_v = np.arccos(np.clip(-unit(vdir)[:, 1], -1, 1))
huv = au('face', *head_uv(unit(vdir)).T)
def head_shade(P, n): return sval(n, 0., hi=.08, lo=.20)       # the crown lightens at most ~+5% (no hue shift)
ruv = ramp_uv('fur', head_shade(VP, vnorm))
uvs = []
for f in faces:
    if max(alpha_v[i] for i in f) < math.radians(116): uvs.append([tuple(huv[i]) for i in f])
    else: uvs.append([tuple(ruv[i]) for i in f])
skin = make_obj('head_skin', VP, faces, uvs, 'head', vnorm)
LOG['skin_vertices'] = len(verts); LOG['skin_faces'] = len(faces)

# ================================================================ EYES: flush lens globes following the ball
ES = [0, .12, .25, .38, .51, .63, .74, .84, .92, .98, 1.10]
NSEG = 24
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

# ================================================================ THE BILL: two chunky SDF pieces with their own charts
BILL_PIECES = {'bill': (bill_up_sdf, L2M(np.array([0, -.455, .255])), 'bill', 9),
               'billlo': (bill_lo_sdf, L2M(np.array([0, -.440, .148])), 'jaw', 7)}
BAMAX = math.radians(165)
BILL_REFINE = {'bill': (17., 2), 'billlo': (22., 2)}
def bill_uv(d):
    a = np.arccos(np.clip(-d[:, 1], -1, 1)); psi = np.arctan2(d[:, 2], d[:, 0]); r = np.minimum(a / BAMAX, 1) * .5
    return np.stack([.5 + r * np.cos(psi), .5 + r * np.sin(psi)], -1)
def bill_uv_dir(U, V):
    du = U - .5; dv = V - .5; a = np.minimum(np.sqrt(du * du + dv * dv) * 2, 1) * BAMAX; psi = np.arctan2(dv, du)
    return np.stack([np.sin(a) * np.cos(psi), -np.cos(a), np.sin(a) * np.sin(psi)], -1)
def bill_occ(P, N): return .30 * ao(head_sdf, P, N, .018)
def refine_star(f, c, D, F, P, N, thr_deg, rounds, t1):
    """adaptive conforming refinement of a star-shaped SDF mesh (triangles): split every edge whose end normals turn
    more than thr_deg (1, 2 or 3 split edges per triangle -> 2, 3 or 4 children); new points are re-projected along
    their direction from c, so the chart mapping (direction -> surface) stays exact"""
    T = []
    for f_ in F:
        T += [(f_[0], f_[1], f_[2])] if len(f_) == 3 else [(f_[0], f_[1], f_[2]), (f_[0], f_[2], f_[3])]
    D = list(D); P = list(P); N = list(N); thr = math.cos(math.radians(thr_deg))
    for _ in range(rounds):
        vis = list(head_sdf(np.array(P)) > -.004)
        mids = {}; newd = []
        def mid(a, b):
            k = (min(a, b), max(a, b))
            if k not in mids: mids[k] = len(D) + len(newd); newd.append(unit(D[a] + D[b]))
            return mids[k]
        split = set()
        for (a, b, c_) in T:
            for (u, v) in ((a, b), (b, c_), (c_, a)):
                if float(np.dot(N[u], N[v])) < thr and vis[u] and vis[v]: split.add((min(u, v), max(u, v)))
        if not split: break
        T2 = []
        for (a, b, c_) in T:
            e = [(a, b), (b, c_), (c_, a)]; m = [(min(u, v), max(u, v)) in split for u, v in e]; k = sum(m)
            if k == 0: T2.append((a, b, c_)); continue
            if k == 3:
                ab, bc, ca = mid(a, b), mid(b, c_), mid(c_, a); T2 += [(a, ab, ca), (ab, b, bc), (ca, bc, c_), (ab, bc, ca)]; continue
            r = m.index(True) if k == 1 else m.index(False)       # rotate so the pattern starts at edge 0 / the unsplit edge
            v_ = [a, b, c_]; v_ = v_[r:] + v_[:r]; a1, b1, c1 = v_
            if k == 1:
                m1 = mid(a1, b1); T2 += [(a1, m1, c1), (m1, b1, c1)]
            else:                                                  # edge a1-b1 unsplit, b1-c1 and c1-a1 split
                mb, mc = mid(b1, c1), mid(c1, a1); T2 += [(mc, mb, c1), (a1, b1, mb), (a1, mb, mc)]
        nd = np.array(newd); nP = ray_outer(f, c, nd, t1=t1, steps=120); nN = grad(f, nP)
        D += list(nd); P += list(nP); N += list(nN); T = T2
    return np.array(D), T, np.array(P), np.array(N)
def build_bill(key):
    f, c, group, n = BILL_PIECES[key]
    D, F = cube_sphere(n); D = unit(D * np.array([1., .75, .55]))
    P = ray_outer(f, c, D, t1=.24, steps=120); N = grad(f, P)
    D, F, P, N = refine_star(f, c, D, F, P, N, BILL_REFINE[key][0], BILL_REFINE[key][1], .24)
    a_v = np.arccos(np.clip(-D[:, 1], -1, 1))
    cuv = au(key, *bill_uv(D).T); ruv = ramp_uv('billin', sval(N, .2))
    uvs = []
    for f_ in F:
        if max(a_v[i] for i in f_) < BAMAX - .02: uvs.append([tuple(cuv[i]) for i in f_])
        else: uvs.append([tuple(ruv[i]) for i in f_])          # buried in the head
    ob = make_obj('bill_upper' if key == 'bill' else 'bill_lower', P, F, uvs, group, N)
    return ob, P
_, BILL_UP_V = build_bill('bill')
_, BILL_LO_V = build_bill('billlo')

def paint_bill(key, U, V):
    f, c, group, n = BILL_PIECES[key]
    d = bill_uv_dir(U.ravel(), V.ravel()); P = ray_outer(f, c, d, t1=.24, steps=120); N = grad(f, P)
    q = M2L(P); x, y, z = q[:, 0], q[:, 1], q[:, 2]; lz = lip_z(x, y)
    C = ramp_colour('bill', sval(N, bill_occ(P, N), hi=.14, lo=.22))
    if key == 'bill':
        inner = smooth(-.30, -.60, N[:, 2]) * smooth(.016, .006, z - lz)
        C = mix(C, ramp_colour('billin', sval(N, .1)), inner)
        if RIG: C = mix(C, rgb('#6e2828'), inner * smooth(-.0005, -.0030, bill_lo_sdf(P)))
        # the smile seam: a thin darker-orange band on the rounded lower lip, facing forward / down
        band = (1 - smooth(.0040, .0065, np.abs(z - lz - .0062))) * smooth(-.36, -.42, y) * smooth(-.75, -.45, N[:, 2])
        C = mix(C, rgb('billline'), .90 * band * (1 - inner))
        # the nostrils: two small dark ovals on the top (the close-ups' x +-0.06 W, z 0.295 W)
        for s in (-1, 1):
            r = np.sqrt(((x - s * .060) / .0115) ** 2 + ((z - .296) / .0085) ** 2)
            C = mix(C, rgb('nostril'), .92 * (1 - smooth(.80, 1.15, r)) * smooth(-.10, -.35, N[:, 1]))
    else:
        top = smooth(-.004, .006, z - lz)
        C = mix(C, ramp_colour('billin', sval(N, .1)), top)
        if RIG:
            fl = smooth(.002, .007, z - lz) * smooth(-.0008, -.0035, bill_up_sdf(P))
            C = mix(C, ramp_colour('floor', sval(N, .1, hi=.10, lo=.18)), fl)
        C = mix(C, C * .86, smooth(-.020, -.004, z - lz - .012) * (1 - top))
    return C.reshape(U.shape + (3,))

# ================================================================ LASH ROLLS: the upper lash line + three wing flicks
# The close-ups: ~0.030 W thick over the top, thicker at the outer upper corner, running down the outer side to ~0.4 of
# the half-height below the eye's middle; three short flicks fanning out from the outer upper corner.
LASH_PSI = np.radians(np.linspace(152, -40, 25))
LTH0, LTH1 = CFG['LASH']
def lash_th(psi):
    d = np.degrees(psi)
    th = LTH0 + LTH1 * np.exp(-((d - 35) / 30) ** 2)
    th = th * (1 - .62 * smooth(18, -36, d))
    return th * smooth(154, 120, d) * smooth(-43, -5, d) + .02
LASH_WINGS = [((56, .95), (.94, 1.30)), ((37, .95), (1.30, 1.00)), ((18, .95), (1.47, .58))]
def eye_pt(s, X, Z):
    x = s * EX + s * EHW * np.asarray(X, float); z = EZ + EHH * np.asarray(Z, float)
    y = front_hit(x, z); S = np.stack([x, y, z], -1); return S, grad_n(S)
def lash_ribbon(C, n, hw, hp, NLS=6, embed=.0012 * W):
    tg = np.gradient(C, axis=0); tg = unit(tg - n * (tg * n).sum(1, keepdims=True)); sd = unit(np.cross(n, tg))
    V = []; NV = []; NT = len(C)
    for i in range(NT):
        for k in range(NLS):
            a = 2 * PI * k / NLS; ca, sa = math.cos(a), math.sin(a)
            up = hp[i] * (sa if sa > 0 else (1.8 if RIG else .40) * sa)
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
lash_info = {}; LASH_FLICK_PTS = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    th = lash_th(LASH_PSI); k_in = .965
    ux, uz = eye_unit(LASH_PSI)
    Pin, _ = eye_pt(s, ux * k_in, uz * k_in); Pout, _ = eye_pt(s, ux * (k_in + th), uz * (k_in + th))
    Cm, nm = eye_pt(s, ux * (k_in + th / 2), uz * (k_in + th / 2))
    hw = np.linalg.norm(Pout - Pin, axis=1) / 2
    tt = np.linspace(0, 1, len(LASH_PSI))
    hp = (.0090 * W) * (.55 + .45 * smooth(0, .25, tt)) * (1 - .55 * smooth(.70, 1.0, tt))
    V, F, NV = lash_ribbon(Cm, nm, hw, hp)
    allV = [V]; allF = [F]; allN = [NV]; off = len(V); flick_pts = []
    for (rpsi, rk), (tx, tz) in LASH_WINGS:
        rp = math.radians(rpsi); rux, ruz = eye_unit(np.array([rp]))
        thr = lash_th(np.array([rp]))[0]
        R0 = np.array([rux[0] * (k_in + thr * .45), ruz[0] * (k_in + thr * .45)])
        T0 = np.array([tx, tz])
        mid = R0 + (T0 - R0) * .5 + np.array([-.04, .05])
        ws = np.linspace(0, 1, 7)
        XZ = np.array([(1 - w) ** 2 * R0 + 2 * (1 - w) * w * mid + w * w * T0 for w in ws])
        Cw, nw = eye_pt(s, XZ[:, 0], XZ[:, 1])
        hww = (.0100 * W) * (1 - ws) ** .9 + .0012 * W
        hpw = (.0060 * W) * (1 - .75 * ws)
        Vw, Fw, NVw = lash_ribbon(Cw, nw, hww, hpw, NLS=5)
        allV.append(Vw); allF.append([tuple(i + off for i in f) for f in Fw]); allN.append(NVw); off += len(Vw)
        flick_pts += [(Vw[i], float(t_)) for i, t_ in enumerate(list(np.repeat(ws, 5)) + [1., 0.])]
    V = np.vstack(allV); NV = np.vstack(allN); F = [f for FF in allF for f in FF]
    ax_ = eye_axes[tag]; fac = clamp(.5 + .5 * (NV @ ax_))
    luv = ramp_uv('lash', .25 + .5 * fac)
    make_obj('lash_line.' + tag, V, F, [[tuple(luv[i]) for i in f] for f in F], 'lash.' + tag, NV)
    LASH_FLICK_PTS[tag] = flick_pts
    lash_info[tag] = dict(top=[float(v) for v in Cm[np.argmax(Cm[:, 2])]], outer_end=[float(v) for v in Cm[-1]],
                          max_proud_W=round(float(hp.max() / W), 4), thick_top_W=round(float(2 * hw[np.argmax(Cm[:, 2])] / W), 4))
LOG['lash'] = lash_info

if TUFT:
    def tuft_shade(P, N): return sval(N, .30 * ao(head_sdf, P, N, .03), hi=.10, lo=.22)
    for k, (c, r, lean) in enumerate(TUFT):        # each lobe its own star-shaped piece, its foot sunk in the skull
        def lobe(p, c=c, r=r, lean=lean):
            q = M2L(p) - c; a = math.radians(lean)
            qr = np.stack([q[..., 0] * math.cos(a) - q[..., 2] * math.sin(a), q[..., 1], q[..., 0] * math.sin(a) + q[..., 2] * math.cos(a)], -1)
            return sell(qr, [0, 0, 0], r, (2.0, 2.0, 2.0), pzlo=2.0, rzlo=r[2] * 1.6) * W
        sdf_ball('scalp_tuft_%d' % k, lobe, L2M(c - np.array([0, 0, r[2] * .3])), 6, 'tuft', 'fur', shade=tuft_shade, t1=.16)

# ================================================================ BODY AND OUTFIT (metres; measure-<x>.md)
def head_occ(p): return np.minimum(head_sdf(p), 9.)
joint_arms = {}; joint_legs = {}; info = {}
ARM = {}
def wing_arm(s, tag, sh, ang, fwd, L_arm, r_sh, r_wr, hand_r, ramp, occ_f, lobes=True):
    """a thick tapered capsule arm flowing into a puffy wing-mitten (one SDF piece, cube-sphere meshed)"""
    a = math.radians(ang); d = unit(np.array([s * math.sin(a), -fwd, -math.cos(a)]))
    e1 = unit(np.cross(d, [0, 0, 1.])); e2 = unit(np.cross(e1, d))
    if e2[2] < 0: e2 = -e2
    hc = sh + d * L_arm
    def f(p):
        q = p - hc; u = q @ d; v = q @ e1; w = q @ e2
        dd = sell(np.stack([u, v, w], -1), [0, 0, 0], hand_r, (2.2, 2.2, 2.0))
        if lobes:
            for ev in (-.034, .034):
                lob = ell(np.stack([u, v, w], -1), [hand_r[0] * .62, ev, 0], [hand_r[0] * .48, hand_r[1] * .48, hand_r[2] * .92])
                dd = smin(dd, lob, .014)
        arm = cone_capsule(p, sh - d * .03, hc - d * hand_r[0] * .45, r_sh, r_wr)
        return smin(dd, arm, .035)
    def shade(P, N): return sval(N, .22 * ao(occ_f, P, N, .04), hi=.14, lo=.22)
    sdf_ball('wing_arm.' + tag, f, sh + d * (L_arm * .55), 9 if not FAST else 8, 'arm.' + tag, ramp, scale=(1., 1., 1.), shade=shade, t1=.32)
    joint_arms[tag] = {'shoulder': [float(v) for v in sh], 'elbow': [float(v) for v in sh + d * L_arm * .48],
                       'wrist': [float(v) for v in hc - d * hand_r[0] * .55], 'hand': [float(v) for v in hc],
                       'paw_tip': [float(v) for v in hc + d * hand_r[0]]}
    ARM[tag] = (d, e1, e2, sh, hc)
    return d, hc
def webbed_foot(s, tag, c, r, occ_f):
    def f(p):
        d = sell(p, c, r, (2.6, 2.7, 2.0), 4.0, c[2] - .0)
        d = smin(d, capsule(p, [c[0] - s * .004, c[1] + .030, c[2] + .02], [c[0] - s * .004, c[1] + .030, c[2] + .085], .048), .035)
        for k in (-1, 1):            # two shallow toe grooves on the front (three webbed toes)
            g = ell(p, c + np.array([k * r[0] * .32, -r[1] * 1.10, r[2] * .65]), [.0070, .034, .052])
            d = smax(d, -g, .006)
        return smax(d, -p[..., 2], .004)
    def shade(P, N):
        lat = (P[:, 0] - c[0]) / r[0]; frontz = smooth(-.09, -.13, P[:, 1] - c[1]) * smooth(.008, .022, P[:, 2]) * smooth(.080, .06, P[:, 2])
        groove = sum(np.exp(-((lat - k * .32) / .035) ** 2) for k in (-1, 1)) * frontz
        return sval(N, .22 * groove + .25 * ao(occ_f, P, N, .03))
    sdf_ball('webbed_foot.' + tag, f, c + np.array([0, 0, .010]), 8, 'leg.' + tag, 'bill', shade=shade, t1=.4)

if DESIGN == 'a':
    # --- the cream chest (the overalls cover it below the bib top; the top tucks up inside the head)
    TORSO = Lathe([(.300, .190, .165, .160), (.360, .180, .162, .158), (.410, .170, .158, .152), (.450, .160, .150, .142),
                   (.485, .146, .138, .130), (.515, .128, .124, .116), (.545, .108, .106, .100), (.580, .090, .090, .086),
                   (.630, .082, .082, .080)], n=2.3, yc=.0)
    def body_shade(P, N): return sval(N, .30 * ao(head_occ, P, N, .05), hi=.15, lo=.24)
    TORSO.mesh('chest', 'body', 'fur', list(np.linspace(.30, .63, 8)), nphi=26, caps=(False, True), shade=body_shade)
    # --- the overall trousers: a rounded bean from the waist (z 0.40, hidden under the bib front / back panel) to the
    # crotch, two short legs with rolled cuffs to the hems at z 0.12 (the front view: 0.45 m wide at z 0.22, 0.42 at
    # 0.29, 0.35 at 0.38; the side view: 0.39 m deep)
    PANTS = Lathe([(.150, .150, .120, .120), (.165, .196, .160, .160), (.185, .218, .180, .180), (.220, .226, .190, .190),
                   (.270, .220, .195, .194), (.320, .205, .193, .190), (.360, .190, .188, .184), (.395, .178, .175, .170),
                   (.410, .175, .170, .166)], n=2.4)
    def pants_occ(P): return np.minimum(TORSO.sdf(P), 9.)
    def over_shade(P, N): return sval(N, .25 * ao(pants_occ, P, N, .04), hi=.16, lo=.24)
    PANTS.mesh('overall_trousers', 'body', 'over', None, nphi=36, shade=over_shade, face_ramp=lambda fz: 'overin' if fz > .412 else 'over',
               rings=[(.150, .150, -.004, 0.)] + [(z, z, 0., 0.) for z in np.linspace(.165, .395, 12)] +
                     [(.410, .410, 0., 0.), (.410, .418, -.002, .3), (.410, .418, -.010, .6), (.410, .405, -.012, 0.)])
    LEG_X = .118; LEG_HW = .104
    CUFF = Lathe([(.118, .088, .088, .088), (.124, .102, .102, .102), (.134, .107, .107, .107), (.150, .106, .106, .106),
                  (.175, .104, .104, .104), (.205, .098, .098, .098)], n=2.2)
    for s, tg in ((-1, 'R'), (1, 'L')):
        ob = CUFF.mesh('overall_leg.' + tg, 'body', 'over', None, nphi=18, shade=over_shade, face_ramp=lambda fz: 'overin' if fz < .121 else 'over',
                       rings=[(.140, .135, -.020, -.6), (.124, .122, -.012, -.5), (.118, .119, 0., 0.)] + [(z, z, 0., 0.) for z in (.124, .134, .150, .175, .205)])
        for v in ob.data.vertices: v.co.x += s * LEG_X; v.co.y -= .004
    # --- the bib: a broad square front panel on the chest (top z 0.449, 0.31 m wide, rounded top corners), down over
    # the trousers' waist to z 0.37
    BIB_T, GAP = .011, .003
    def chest_surf(u, v, side=-1):
        P, N = TORSO.surf(u, v, side); return P, N
    def front_surf(u, v):
        """the chest above z 0.405, the trousers below (blended), front side"""
        Pt, Nt = TORSO.surf(u, np.maximum(v, .30), -1); Pp, Np_ = PANTS.surf(u, np.clip(v, .15, .41), -1)
        w = smooth(.385, .425, v)[:, None]
        P = Pp * (1 - w) + Pt * w; N = unit(Np_ * (1 - w) + Nt * w)
        lift = np.maximum(0, (Pp[:, 1] - Pt[:, 1]))[:, None] * 0.
        return P, N
    def bib_hw(z): return .155 + .036 * smooth(.420, .372, z) + .008 * smooth(.36, .30, z)
    _zs = np.linspace(.449 - .026, .262, 14)
    BIB_OUT = np.array([(bib_hw(z), z) for z in _zs] + [(bib_hw(.262) * math.cos(a), .262 - .004 * math.sin(a)) for a in np.linspace(0, PI, 15)[1:-1]] +
                       [(-bib_hw(z), z) for z in _zs[::-1]] +
                       [(-.155 + .026 - .026 * math.cos(a), .449 - .026 + .026 * math.sin(a)) for a in np.linspace(0, PI / 2, 6)] +
                       [(.155 - .026 + .026 * math.sin(a), .449 - .026 + .026 * math.cos(a)) for a in np.linspace(0, PI / 2, 6)])
    def bib_fadef(u, v):         # 0 .. 1: the slab thins to nothing along its lower and lower-side edges (melts into the trousers)
        side = smooth(.72, 1.0, np.abs(u) / bib_hw(v)) * smooth(.40, .36, v)
        return np.maximum(smooth(.31, .268, v), side)
    def bib_surf(u, v):
        P, N = front_surf(u, v); return P + N * (.0015 + (GAP + .006 - .0015) * (1 - bib_fadef(u, v)))[:, None], N
    def bib_fade(u, v): return -BIB_T * .92 * bib_fadef(u, v)
    panel('overall_bib', BIB_OUT, bib_surf, BIB_T, 'body', 'over', gap=0., bulge=.002, face_lift=bib_fade,
          shade_occ=lambda P, N: .15 * ao(head_occ, P, N, .05))
    def bib_front(u, v):
        P, N = bib_surf(u, v); return P + N * (BIB_T + bib_fade(u, v))[:, None], N
    POCKET_OUT = rrect(.124, .124, .243, .382, .030, top_r=.012)
    panel('overall_pocket', POCKET_OUT, bib_front, .009, 'body', 'over', gap=.004, bulge=.003, step=.016, grid=.030)
    # --- the back panel (the back view: x +-0.115, z 0.26-0.40, rounded corners) on the trousers' back
    def pants_back(u, v):
        P, N = PANTS.surf(u, v, 1); return P, N
    BACK_OUT = rrect(.118, .112, .262, .418, .028, top_r=.016)
    panel('overall_back_panel', BACK_OUT, pants_back, .009, 'body', 'over', gap=.004, bulge=.002, step=.016, grid=.030)
    # --- the straps: two broad bands from the front buttons up over the shoulders, down the back to the back buttons
    STRAP_X, STRAP_HW, STRAP_T = .103, .029, .010
    BTN_ZF, BTN_ZB = .446, .440
    for s, tg in ((-1, 'R'), (1, 'L')):
        x = s * STRAP_X
        zt = float(np.interp(abs(x) / .97, TORSO.A[::-1], TORSO.Z[::-1]))
        zf = np.linspace(BTN_ZF - .004, zt - .004, 12); zb = np.linspace(zt - .004, BTN_ZB - .004, 12)[1:]
        Pf, Nf = TORSO.surf(np.full_like(zf, x), zf, -1); Pb, Nb = TORSO.surf(np.full_like(zb, x), zb, 1)
        C = np.vstack([Pf, Pb]); Nn = np.vstack([Nf, Nb])
        onbib = np.where(C[:, 1] < 0, smooth(.455, .445, C[:, 2]), 0.)
        C = C + Nn * (GAP + .006 + BIB_T * onbib + .001)[:, None]
        strip('overall_strap.' + tg, C, Nn, STRAP_HW, STRAP_T, 'body', 'over', nsec=6, embed=.002)
        info['strap_top_z_' + tg] = round(zt, 4)
    # --- the buttons: cream domes at the straps' ends, front (d 0.062 m at z 0.446) and back (z 0.440)
    for side, zb_, nmb in ((-1, BTN_ZF, 'front'), (1, BTN_ZB, 'back')):
        for s, tg in ((-1, 'R'), (1, 'L')):
            P, N = TORSO.surf(np.array([s * STRAP_X]), np.array([zb_]), side); P = P[0]; N = N[0]
            c = P + N * (GAP + .006 + (BIB_T if side < 0 else 0.) + STRAP_T + .004)
            tx = unit(np.cross(np.array([0, 0, 1.]), N)); ty = np.cross(N, tx)
            br_, bh_ = .031, .011; nb_ = 16 if side < 0 else 12
            prof_ = [(.0, bh_), (.45, .96 * bh_), (.75, .82 * bh_), (.92, .56 * bh_), (1., .22 * bh_), (.97, -.12 * bh_), (.86, -.40 * bh_)]
            Vb = []; NBb = []
            for (rr_, hh_) in prof_[1:]:
                for k_ in range(nb_):
                    a_ = 2 * PI * k_ / nb_; Vb.append(c + (tx * math.cos(a_) + ty * math.sin(a_)) * rr_ * br_ + N * (hh_ - .002))
            top_ = len(Vb); Vb.append(c + N * (bh_ - .002))
            Fb = [(top_, (k_ + 1) % nb_, k_) for k_ in range(nb_)]
            for j_ in range(len(prof_) - 2):
                for k_ in range(nb_): Fb.append((j_ * nb_ + k_, j_ * nb_ + (k_ + 1) % nb_, (j_ + 1) * nb_ + (k_ + 1) % nb_, (j_ + 1) * nb_ + k_))
            ob_ = make_obj('overall_button_%s.%s' % (nmb, tg), np.array(Vb), Fb, np.zeros((len(Vb), 2)), 'body')
            mesh_normals_uv(ob_, lambda Vv, Nn: ramp_uv('cream', sval(Nn, 0., hi=.18, lo=.24)))
    # --- arms: thick white wing-arms (36 deg out: at 30 the mittens sink into the trousers' sides), cream mittens
    for s, tg in ((-1, 'R'), (1, 'L')):
        wing_arm(s, tg, np.array([s * .146, .005, .462]), 36., .06, .232, .062, .056, (.076, .070, .064), 'fur',
                 lambda p: np.minimum(TORSO.sdf(p), PANTS.sdf(p)))
    # --- legs (short orange stubs inside the cuffs) and the big webbed feet
    for s, tg in ((-1, 'R'), (1, 'L')):
        hip = np.array([s * .110, -.004, .215]); knee = np.array([s * .114, -.006, .150]); ankle = np.array([s * .118, -.010, .072])
        sdf_ball('leg.' + tg, lambda p, a=hip, b=ankle: capsule(p, a, b, .050), (hip + ankle) / 2, 3, 'leg.' + tg, 'bill', scale=(1, 1, 2.2), t1=.25)
        webbed_foot(s, tg, np.array([s * .140, -.040, .052]), np.array([.114, .142, .055]), lambda p: PANTS.sdf(p))
        joint_legs[tg] = {'hip': [float(v) for v in hip], 'knee': [float(v) for v in knee], 'ankle': [float(v) for v in ankle],
                          'toe': [s * .140, -.180, .035]}
    # --- the tail: a white teardrop wedge poking up out of the back panel's lower edge (the back view: 0.12 m wide,
    # 0.11 tall, centre z 0.27; the side view: standing ~0.06 m proud, its tip up and back)
    Pt_, Nt_ = PANTS.surf(np.array([0.]), np.array([.275]), 1)
    TAIL_C = Pt_[0] + np.array([0, .030, .02]); TAIL_TILT = math.radians(30.)
    TAIL_HIDE = lambda p: PANTS.sdf(p)
    HIPS = [0, .0, .230]; SPINE = [0, .0, .330]; CHEST = [0, .005, .440]; NECK = [0, .010, .530]
else:
    # --- the butter-yellow pear body: visible below the tunic hem (to z 0.12) and in the collar's V
    BODY = Lathe([(.105, .120, .110, .110), (.125, .205, .170, .190), (.150, .255, .200, .225), (.185, .284, .215, .245),
                  (.230, .292, .218, .252), (.300, .285, .214, .240), (.380, .262, .200, .215), (.450, .228, .182, .182),
                  (.500, .190, .160, .155), (.540, .148, .132, .124), (.580, .110, .104, .098), (.630, .090, .090, .088)], n=2.3, yc=.02)
    def body_shade(P, N): return sval(N, .30 * ao(head_occ, P, N, .05), hi=.15, lo=.24)
    BODY.mesh('pear_body', 'body', 'fur', None, nphi=32, caps=(True, True), shade=body_shade,
              rings=[(z, z, 0., 0.) for z in (.105, .118, .135, .155, .180, .210, .300, .450, .51, .56, .63)])
    # --- the lilac wrap tunic: a short rounded shell, flared at the rolled hem (z 0.20; 0.63 m wide), the shoulders
    # rounding into the neck; the side view: 0.41 m deep at the chest, the back bulging at the hem
    TUNIC = Lathe([(.200, .316, .238, .272), (.240, .310, .232, .266), (.300, .300, .224, .252), (.360, .288, .218, .236),
                   (.420, .270, .212, .214), (.470, .246, .200, .192), (.510, .216, .186, .168), (.540, .182, .166, .144),
                   (.565, .140, .138, .116), (.590, .100, .104, .092)], n=2.3, yc=.02)
    def tunic_occ(P): return np.minimum(head_occ(P), 9.)
    def tunic_shade(P, N): return sval(N, .25 * ao(tunic_occ, P, N, .05), hi=.16, lo=.24)
    TUNIC.mesh('wrap_tunic', 'body', 'tunic', None, nphi=40, shade=tunic_shade, face_ramp=lambda fz: 'tunicin' if fz < .2 else 'tunic',
               rings=[(.200, .214, -.026, -.3), (.200, .196, -.016, -.6), (.200, .190, -.004, -.4), (.200, .194, .003, 0.), (.200, .203, .006, 0.)] +
                     [(z, z, 0., 0.) for z in (.215, .245, .285, .330, .380, .430, .465, .495, .520, .540, .558, .575, .590)])
    NECK_V = .505
    _tob = parts['body'][-1]; _me = _tob.data
    _names = []
    for p_ in _me.polygons:
        c_ = np.array(p_.center)
        _names.append('fur' if False and (c_[1] < 0 and c_[2] > NECK_V - .004 and abs(c_[0]) < 2.4 * (c_[2] - NECK_V) + .006) else ('tunicin' if c_[2] < .199 and p_.normal[2] < .2 and False else None))
    _fz = None
    if any(n_ == 'fur' for n_ in _names):
        _old = [n_ for n_ in _names]
        uvl_ = _me.uv_layers['Atlas']; Nn_ = np.zeros(len(_me.vertices) * 3); _me.vertices.foreach_get('normal', Nn_); Nn_ = Nn_.reshape(-1, 3)
        for p_, n_ in zip(_me.polygons, _names):
            if n_ != 'fur': continue
            for li in p_.loop_indices:
                vi = _me.loops[li].vertex_index; uvl_.data[li].uv = tuple(ramp_uv('fur', sval(Nn_[vi:vi + 1], .25, hi=.12, lo=.22))[0])
    # --- the crossed collar bands: her right panel's edge from the neck to the V, then her left panel over it, from the
    # left side of the neck down across the chest to her right side under the waistband (the sheet's wrap)
    def collar(name, ctrl, half_w=.020, thick=.008, lift=.0):
        P = np.array([catmull(ctrl, t) for t in np.linspace(0, 1, 20)])
        C, Nn = TUNIC.surf(P[:, 0], P[:, 1], -1); C = C + Nn * lift
        return strip(name, C, Nn, half_w, thick, 'body', 'tunic', nsec=8, embed=.0015,
                     shade=lambda Vv, Nv: ramp_uv('tunic', sval(Nv, 0., hi=.24, lo=.18) * .92 + .06))
    collar('collar_under', [(-.112, .565), (-.090, .548), (-.060, .528), (-.028, .512), (.000, NECK_V), (.026, .492)])
    collar('collar_over', [(.112, .565), (.090, .548), (.060, .528), (.028, .512), (.000, NECK_V), (-.040, .478), (-.085, .448),
                           (-.130, .422), (-.168, .395), (-.195, .370)], lift=.0022)
    # --- the cream waistband: one broad band round the tunic (z 0.388-0.424), closed by a flat rounded patch at the back
    WB_Z0, WB_Z1, WB_T = .386, .426, .014
    WB = Lathe([(z, float(TUNIC.r(PI / 2, z)), float(TUNIC.r(0, z)), float(TUNIC.r(PI, z))) for z in np.linspace(.37, .44, 8)], n=2.3, yc=.02)
    def wb_shade(P, N): return sval(N, .20 * ao(lambda q: TUNIC.sdf(q) + .03, P, N, .02), hi=.18, lo=.24)
    WB.mesh('waistband', 'body', 'cream', None, nphi=36, shade=wb_shade,
            rings=[(WB_Z0, WB_Z0, -.002, 0.), (WB_Z0, WB_Z0 + .0015, WB_T * .55, -.5), (WB_Z0, WB_Z0 + .006, WB_T, 0.),
                   (.406, .406, WB_T + .001, 0.), (WB_Z1, WB_Z1 - .006, WB_T, 0.), (WB_Z1, WB_Z1 - .0015, WB_T * .55, .5), (WB_Z1, WB_Z1, -.002, 0.)])
    PATCH_C = np.array([0, float(TUNIC.pt(PI, .406)[1]) + WB_T + .010, .406])
    def patch_sdf(p): return sell(p, PATCH_C, (.088, .016, .054), (4.0, 2.3, 4.0))
    sdf_ball('waistband_patch', patch_sdf, PATCH_C, 5, 'body', 'cream', shade=lambda P, N: sval(N, .25 * ao(lambda q: TUNIC.sdf(q) + .02, P, N, .02), hi=.20, lo=.24), t1=.12)
    # --- the apron: a softly curved thick panel hanging from the waistband (top z 0.414, hem z 0.167, 0.46 m wide,
    # rounded lower corners) clear of the belly, and one big rounded pocket on it (x +-0.139, z 0.227-0.375)
    AP_TOP, AP_BOT, AP_T, AP_GAP = .414, .167, .019, .004
    def ap_r(phi, z, t=0.):
        rb = TUNIC.r(phi, z) + AP_GAP + t
        rh = TUNIC.r(phi, AP_TOP) + AP_GAP + t + .07 * (AP_TOP - np.asarray(z, float))
        return smax(rb, rh, .02)
    AP_R0 = float(TUNIC.r(0, AP_TOP))
    def ap_surf(u, v):
        """u = arc length across the front, v = z"""
        phi = np.asarray(u, float) / AP_R0; r = ap_r(phi, v)
        P = np.stack([r * np.sin(phi), TUNIC.yc(v) - r * np.cos(phi), np.asarray(v, float) * np.ones_like(r)], -1)
        e = 2e-4; r1 = ap_r(phi + e / AP_R0, v); r2 = ap_r(phi, v + e)
        Pu = np.stack([r1 * np.sin(phi + e / AP_R0), TUNIC.yc(v) - r1 * np.cos(phi + e / AP_R0), v * np.ones_like(r)], -1) - P
        Pv = np.stack([r2 * np.sin(phi), TUNIC.yc(v + e) - r2 * np.cos(phi), (v + e) * np.ones_like(r)], -1) - P
        return P, unit(np.cross(Pv, Pu))
    def x_to_u(x, z):
        ss = np.linspace(0, .45, 450); out = []
        for xx, zz in zip(np.atleast_1d(x), np.atleast_1d(z)):
            X = ap_surf(ss, np.full(len(ss), zz))[0][:, 0]; out.append(np.sign(xx) * np.interp(abs(xx), X, ss))
        return np.array(out)
    AO_ = rrect(.226, .232, AP_BOT, AP_TOP, .042, top_r=.004)
    AO_[:, 0] = x_to_u(AO_[:, 0], AO_[:, 1])
    panel('apron', AO_, ap_surf, AP_T, 'body', 'cream', gap=0., bulge=.0, step=.018, grid=.030,
          shade_occ=lambda P, N: .20 * ao(lambda q: TUNIC.sdf(q), P, N, .03) + .25 * smooth(AP_TOP - .03, AP_TOP + .004, P[:, 2]))
    PO_ = rrect(.139, .136, .227, .375, .036, top_r=.014); PO_[:, 0] = x_to_u(PO_[:, 0], PO_[:, 1])
    panel('apron_pocket', PO_, lambda u, v: (lambda P, N: (P + N[:, :] * AP_T, N))(*ap_surf(u, v)), .014, 'body', 'cream', gap=.001, bulge=.004, step=.014, grid=.024,
          shade_occ=lambda P, N: .10 * smooth(.6, .2, -N[:, 1]))
    # --- short thick sleeves (open cuffs) on yellow wing-arms (38 deg out)
    ARM_ANG = 38.
    for s, tg in ((-1, 'R'), (1, 'L')):
        sh = np.array([s * .190, .025, .478])
        d, hc = wing_arm(s, tg, sh, ARM_ANG, .06, .236, .060, .052, (.074, .068, .062), 'fur',
                         lambda p: np.minimum(TUNIC.sdf(p), BODY.sdf(p)))
        d, e1, e2, _, _ = ARM[tg]
        NA = 20; aa = np.linspace(0, 2 * PI, NA, endpoint=False)
        ts = [-.06, -.03, 0., .03, .06, .085, .102]
        rows = []; V = []; RN = []
        for t in ts:
            k = (t + .06) / .162; rr = .084 + .010 * k
            C = sh + d * t
            P = C + (np.outer(np.cos(aa), e1) * rr + np.outer(np.sin(aa), e2) * rr * (1.0 + .10 * k)); rows.append(list(range(len(V), len(V) + NA))); V += list(P); RN.append('tunic')
        C1 = sh + d * ts[-1]
        for dd, sc in [(.008, .97), (.012, .90), (.008, .80), (-.010, .72)]:
            k = 1.; rr = .094 * sc
            P = C1 + d * dd + (np.outer(np.cos(aa), e1) * rr + np.outer(np.sin(aa), e2) * rr * 1.1); rows.append(list(range(len(V), len(V) + NA))); V += list(P)
            RN.append('tunic' if sc > .85 else 'tunicin')
        c_in = len(V); V.append(C1 - d * .02); c_out = len(V); V.append(sh + d * (ts[0] - .02))
        F = []; FR = []
        for k in range(len(rows) - 1):
            nm_ = 'tunicin' if RN[k + 1] == 'tunicin' else 'tunic'
            for i in range(NA): F.append((rows[k][i], rows[k][(i + 1) % NA], rows[k + 1][(i + 1) % NA], rows[k + 1][i])); FR.append(nm_)
        for i in range(NA): F.append((rows[-1][i], rows[-1][(i + 1) % NA], c_in)); FR.append('tunicin')
        for i in range(NA): F.append((rows[0][(i + 1) % NA], rows[0][i], c_out)); FR.append('tunic')
        ob = make_obj('sleeve.' + tg, np.array(V), F, np.zeros((len(V), 2)), 'sleeve.' + tg)
        ramp_faces(ob, FR, lambda Vv, Nn: sval(Nn, .25 * ao(head_occ, Vv, Nn, .04), hi=.16, lo=.24), dim={'tunicin': .75})
        info['sleeve_' + tg] = {'root': [float(v) for v in sh + d * ts[0]], 'cuff': [float(v) for v in C1]}
    # --- short thick orange legs and webbed feet
    for s, tg in ((-1, 'R'), (1, 'L')):
        hip = np.array([s * .128, .010, .190]); knee = np.array([s * .132, .000, .130]); ankle = np.array([s * .136, -.010, .072])
        sdf_ball('leg.' + tg, lambda p, a=hip, b=ankle: capsule(p, a, b, .056), (hip + ankle) / 2, 3, 'leg.' + tg, 'bill', scale=(1, 1, 2.0), t1=.25)
        webbed_foot(s, tg, np.array([s * .152, -.035, .052]), np.array([.118, .145, .055]), lambda p: BODY.sdf(p))
        joint_legs[tg] = {'hip': [float(v) for v in hip], 'knee': [float(v) for v in knee], 'ankle': [float(v) for v in ankle],
                          'toe': [s * .152, -.180, .035]}
    # --- the tail: a small yellow wedge tucked under the tunic's back hem (the sheet's back view shows none: only its tip
    # peeks below the hem)
    Pt_, Nt_ = BODY.surf(np.array([0.]), np.array([.205]), 1)
    TAIL_C = Pt_[0] + np.array([0, -.010, .052]); TAIL_TILT = math.radians(40.)
    TAIL_HIDE = lambda p: BODY.sdf(p)
    HIPS = [0, .015, .210]; SPINE = [0, .015, .320]; CHEST = [0, .018, .430]; NECK = [0, .022, .530]

# --- the tail (shared): a plump teardrop wedge, its point up and back
TAIL_V_AX = np.array([0, math.sin(TAIL_TILT), math.cos(TAIL_TILT)])
TAIL_W_AX = np.array([0, math.cos(TAIL_TILT), -math.sin(TAIL_TILT)])
TAIL_R = (.064, .042, .070) if DESIGN == 'a' else (.050, .030, .052)
def tail_local(p):
    q = np.asarray(p, float) - TAIL_C
    return np.stack([q[..., 0], q @ TAIL_W_AX, q @ TAIL_V_AX], -1)
def tail_sdf(p):
    L = tail_local(p)
    taper = 1 - .62 * smooth(-.2, 1.0, L[..., 2] / TAIL_R[2])           # narrows to a soft point at the top
    q = np.stack([L[..., 0] / taper, L[..., 1] / (.55 + .45 * taper), L[..., 2]], -1)
    return sell(q, [0, 0, 0], TAIL_R, (2.0, 2.0, 2.0), pzlo=2.4, rzlo=TAIL_R[2] * .75) * .8
def tail_shade(P, N): return sval(N, .30 * ao(TAIL_HIDE, P, N, .04), hi=.14, lo=.22)
tail_ob, TAIL_V, _ = sdf_ball('tail', tail_sdf, TAIL_C, 6, 'tail', 'fur', scale=(1., .7, 1.), shade=tail_shade, t1=.16)
TAIL_JOINTS = [TAIL_C - TAIL_V_AX * .045 - TAIL_W_AX * .015, TAIL_C - TAIL_V_AX * .005, TAIL_C + TAIL_V_AX * .030, TAIL_C + TAIL_V_AX * .058]

# ================================================================ A: THE STRAW HAT (a low dome, a thick rounded brim, a broad sage band)
# the front view: brim 0.70-0.75 m across (the back view 0.64: 0.70), its sides drooping below its front; the side view
# tilts it back ~16 deg; the dome 0.42 m wide at the band, its top z 1.105 m; the band 0.05 m tall on the dome's foot
HAT = {}
if DESIGN == 'a':
    def hat_world(P): return (np.asarray(P) @ RM.T) + HAT_C
    def hat_shade(P, N): return sval(N, 0., hi=.18, lo=.24)
    hat_parts = []
    # the dome: a low rounded crown (lathe in the hat's frame), its foot inside the brim
    dz = np.concatenate([np.linspace(-.010, HAT_DOME_H * .78, 7), HAT_DOME_H * np.array([.86, .93, .975, 1.])])
    dome_rows = []
    for z in dz:
        t = np.clip(z / HAT_DOME_H, 0, 1); r = HAT_DOME_R * (1 - t ** 2.6) ** (1 / 2.6) * (1 + .03 * (1 - t))
        dome_rows.append((z, max(r, .002)))
    NPH = 36; ph = np.linspace(0, 2 * PI, NPH, endpoint=False)
    def lathe_xy(rows, nph=NPH, close_top=False, flip=False):
        V = []; R_ = []
        for (z, r) in rows:
            R_.append(list(range(len(V), len(V) + nph)))
            V += [(r * math.sin(a), -r * math.cos(a), z) for a in np.linspace(0, 2 * PI, nph, endpoint=False)]
        F = []
        for k in range(len(R_) - 1):
            for i in range(nph):
                q = (R_[k][i], R_[k][(i + 1) % nph], R_[k + 1][(i + 1) % nph], R_[k + 1][i]); F.append(q[::-1] if flip else q)
        if close_top:
            c = len(V); V.append((0, 0, rows[-1][0]))
            for i in range(nph): F.append((R_[-1][i], R_[-1][(i + 1) % nph], c))
        return np.array(V), F
    def lathe_n(rows, nph=NPH, sign=1., close_top=False, closed=False):
        """analytic smooth normals of a lathe_xy surface (profile normals swept round the axis), world frame"""
        R_ = np.array([r for z, r in rows]); Z_ = np.array([z for z, r in rows]); n_ = len(rows)
        if closed: dr = np.roll(R_, -1) - np.roll(R_, 1); dz = np.roll(Z_, -1) - np.roll(Z_, 1)
        else: dr = np.gradient(R_); dz = np.gradient(Z_)
        nr = sign * dz; nz = -sign * dr; L_ = np.hypot(nr, nz) + 1e-12; nr /= L_; nz /= L_
        out = []
        for k in range(n_):
            for a in np.linspace(0, 2 * PI, nph, endpoint=False): out.append((nr[k] * math.sin(a), -nr[k] * math.cos(a), nz[k]))
        if close_top: out.append((0, 0, 1.))
        return np.asarray(out) @ RM.T
    V, F = lathe_xy(dome_rows, close_top=True); Vw = hat_world(V)
    ob = make_obj('hat_dome', Vw, F, np.zeros((len(Vw), 2)), 'hat', N=lathe_n(dome_rows, close_top=True)); mesh_normals_uv(ob, lambda Vv, Nn: ramp_uv('hat', hat_shade(Vv, Nn)))
    # the band: a broad soft sage ring on the dome's foot (0.05 m tall, 0.007 proud)
    br = []
    for (z, dr) in ((.008, -.002), (.012, .0062), (.034, .0080), (.056, .0058), (.060, -.002)):
        t = np.clip(z / HAT_DOME_H, 0, 1); r = HAT_DOME_R * (1 - t ** 2.6) ** (1 / 2.6) * (1 + .03 * (1 - t))
        br.append((z, r + dr))
    V, F = lathe_xy(br); Vw = hat_world(V)
    ob = make_obj('hat_band', Vw, F, np.zeros((len(Vw), 2)), 'hat', N=lathe_n(br)); mesh_normals_uv(ob, lambda Vv, Nn: ramp_uv('over', sval(Nn, 0., hi=.16, lo=.24)))
    # the brim: a thick rounded disk (0.034 m), its outer half drooping 0.045 m, the rim rolled round
    BT = .034
    def brim_mid(r):
        t = np.clip((r - HAT_R0) / (HAT_R1 - HAT_R0), 0, 1); return -.110 * smooth(.05, 1.0, t) * (.45 + .55 * t)
    rs = np.linspace(HAT_R0 - .02, HAT_R1 - BT / 2, 6)
    top = [(brim_mid(r) + BT / 2, r) for r in rs]
    rim = []
    for k in range(1, 6):
        a = PI / 2 - PI * k / 6; rc = HAT_R1 - BT / 2; zc = brim_mid(rc)
        rim.append((zc + BT / 2 * math.sin(a), rc + BT / 2 * math.cos(a) * 1.0))
    bot = [(brim_mid(r) - BT / 2, r) for r in rs[::-1]]
    brim_rows = top + rim + bot
    NPB = 40
    V, F = lathe_xy(brim_rows, nph=NPB); Vw = hat_world(V)
    names = []
    for f_ in F:
        names.append('hat')
    _bn = lathe_n(brim_rows, nph=NPB, sign=-1.)
    if (_bn[:NPB] @ (RM @ np.array([0, 0, 1.]))).mean() < 0: _bn = -_bn
    ob = make_obj('hat_brim', Vw, F, np.zeros((len(Vw), 2)), 'hat', N=_bn)
    def brim_uv(Vv, Nn):
        loc = (Vv - HAT_C) @ RM
        under = smooth(.2, -.4, Nn @ (RM @ np.array([0, 0, 1.])))
        return ramp_uv('hat', hat_shade(Vv, Nn) * (1 - .22 * under))
    mesh_normals_uv(ob, brim_uv)
    HAT = {'centre': [float(v) for v in HAT_C], 'tilt_deg': 29., 'brim_radius': HAT_R1, 'dome_radius': HAT_DOME_R,
           'top_z': float(hat_world(np.array([[0, 0, HAT_DOME_H]]))[0, 2])}
    # the head must stay inside the hat: the deepest skin point outside the dome + brim volume (diagnostic)
    def hat_inside(P):
        loc = (P - HAT_C) @ RM; r = np.hypot(loc[:, 0], loc[:, 1]); z = loc[:, 2]
        t = np.clip(z / HAT_DOME_H, 0, 1); rd = HAT_DOME_R * (1 - t ** 2.6) ** (1 / 2.6) * (1 + .03 * (1 - t))
        return (z > -.017) & (r < rd)
    _sk = VP[(VP[:, 2] > CHIN + .55 * W)]
    loc_ = (_sk - HAT_C) @ RM
    LOG['hat_skin_poke'] = int(((loc_[:, 2] > .017) & ~hat_inside(_sk)).sum())

# ================================================================ PAINTED ATLAS (2048, deterministic PNG)
def stroke(x, z, P, half, aa):
    best = np.full(len(x), 9.)
    for i in range(len(P) - 1):
        a = P[i]; b = P[i + 1]; ab = b - a; L2 = ab @ ab
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        dx = x - (a[0] + t * ab[0]); dz = z - (a[1] + t * ab[1])
        best = np.minimum(best, np.sqrt(dx * dx + dz * dz) - (half[i] * (1 - t) + half[i + 1] * t))
    return 1 - smooth(-aa, aa, best)
def bill_contact(P): return clamp(1 - bill_sdf(P) / (.020 * W))
def lid_edge_Z(X): return 1.25 + 0 * np.asarray(X, float)      # open eyes: no rest lid over the lens (the rig adds the lids)
CAVITY = {'cav': '#5a1e22', 'cavdeep': '#3e1418'}
def paint_face(U, V):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = radial_hit(d)
    C = paint_head_P(P)
    if RIG:
        ib = np.where((P[:, 1] < HY - .15 * W) & (P[:, 2] < CHIN + .40 * W))[0]
        if len(ib):
            a = smooth(-.0012, -.0030, bill_sdf(P[ib]))
            C[ib] = mix(C[ib], mix(rgb(CAVITY['cav']), rgb(CAVITY['cavdeep']), .5), a)
    return C.reshape(sh + (3,))
def paint_head_P(P):
    """the head's paint (plumage shade, blush, brows) at skin points P (n x 3)"""
    P = np.asarray(P, float).reshape(-1, 3); n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    fr = smooth(HY + .02, HY - .08, y)
    near = fr * (z < CHIN + .42 * W)
    occ = np.zeros(len(x)); ib = near > 0
    occ[ib] = .08 * bill_contact(P[ib])
    if DESIGN == 'a':          # the hat's soft contact shade on the forehead under the brim
        loc = (P - HAT_C) @ RM; occ = occ + .10 * smooth(-.05, -.005, loc[:, 2]) * smooth(-.11, -.05, -loc[:, 2]) * 0.
    if TUFT:
        occ = occ + .12 * clamp(1 - tuft_sdf(P) / .02)
    C = ramp_colour('fur', sval(n, occ, hi=.08, lo=.20))
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .78 * (1 - smooth(.70, 1.06, r)) * fr)
    # brows: soft arcs, the peak a little toward the inner end, tapering to rounded points (the close-ups)
    t = np.linspace(-1, 1, 15)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * BROW_L * t, BROW_Z + .026 * W * (1 - ((t + .1) / 1.1) ** 2) - .012 * W - .006 * W * t], -1)
        half = BROW_T * np.maximum(0, 1 - t * t) ** .55 + .0022 * W
        box = (np.abs(x - s * BROW_X) < .10 * W) & (np.abs(z - BROW_Z) < .06 * W) & (fr > 0)
        a = np.zeros(len(x)); a[box] = stroke(x[box], z[box], Pb, half, .0026 * W)
        C = mix(C, rgb('brow'), .96 * a)
    return C

def paint_eye(U, V, s):
    """X, Z in eye-opening units (X along world x). The close-ups: a big brown iris tucked toward the bill side, the
    white crescent on the outer side, a soft dark pupil, one big catchlight high on the nose side and a tiny low one."""
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    IR = CFG['IRIS']; ix = -s * IR['ix']; iz = IR['iz']; irx = IR['irx']; irz = IR['irz']
    C = mix(rgb('sclera'), rgb('#ECE0D2'), .45 * smooth(.35, .95, Z))
    C = mix(C, rgb('#F2E8DC'), .25 * smooth(.3, 1., s * X))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#9A6434'), rgb('iris'), smooth(-.90, -.40, ez))
    I = mix(I, rgb('#4E2C14'), smooth(-.20, .60, ez))
    I = mix(I, rgb('#3A2214'), smooth(.80, 1.0, r) * .65)
    I = I * (1 - .025 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 26 + r * 9)))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    px_ = ix - s * .02; pz = .03; R = np.sqrt(((X - px_) / (.52 * irx)) ** 2 + ((Z - pz) / (.62 * irz)) ** 2)
    C = mix(C, rgb('pupil'), .80 * (1 - smooth(.80, 1.08, R)))
    big = np.sqrt(((X - (-s * .40)) / .205) ** 2 + ((Z - .42) / .195) ** 2)
    small = np.sqrt(((X - (s * .02)) / .075) ** 2 + ((Z + .42) / .080) ** 2)
    C = mix(C, rgb('#FFFBF6'), np.maximum(1 - smooth(.90, 1.06, big), .55 * (1 - smooth(.86, 1.10, small))))
    if not RIG:
        C = mix(C, rgb('lash'), .85 * smooth(.92, 1.0, sr) * smooth(-.30, .30, Z))
        C = mix(C, rgb('#B49A88'), .45 * smooth(.93, 1.0, sr) * (1 - smooth(-.30, .30, Z)))
    return C

def paint(chart, U, V):
    if chart == 'cavity': return mix(rgb('#5a1e22'), rgb('#3e1418'), .5 * smooth(.3, 1, V))
    if chart == 'tongue':
        C = mix(rgb('#e88a96'), rgb('#f2a2ac'), .5 * smooth(.2, .9, V)); return mix(C, rgb('#d07080'), .35 * np.exp(-((U - .5) / .05) ** 2))
    if chart.startswith('lidU') or chart.startswith('lidD'): return np.broadcast_to(rgb('fur'), U.shape + (3,)).copy()
    if chart == 'face': return paint_face(U, V)
    if chart == 'eye.L': return paint_eye(U, V, 1)
    if chart == 'eye.R': return paint_eye(U, V, -1)
    if chart in ('bill', 'billlo'): return paint_bill(chart, U, V)
    raise KeyError(chart)

atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = list(np.round(rgb('fur') * 255).astype(int)) + [255]
for name, (x0, y0, w, h) in CHARTS.items():
    if name == 'ramp':
        Uc, Vc = np.meshgrid((np.arange(w) - 8) / (w - 16), (np.arange(h)) / 1.)
        block = np.zeros((h, w, 3))
        for nm_, k in RAMP_ROWS.items(): block[k * 32:(k + 1) * 32] = ramp_colour(nm_, clamp(Uc[k * 32:(k + 1) * 32]))
    else:
        U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
        if name in ('face', 'bill', 'billlo'):
            block = np.empty((h, w, 3))
            for r0 in range(0, h, 128): block[r0:r0 + 128] = paint(name, U[r0:r0 + 128], V[r0:r0 + 128])
        else:
            block = paint(name, U, V)
    atlas[y0:y0 + h, x0:x0 + w, :3] = np.round(clamp(block) * 255).astype(np.uint8)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
atlas_path = os.path.join(ROOT, 'scratch' if FAST else '', TAG + ('_rig_atlas.png' if RIG else '_atlas.png'))
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = NM + '_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new(NM + '_toy_atlas'); MAT.use_nodes = True
bs = next(n for n in MAT.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
bs.inputs['Roughness'].default_value = .8; bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .12
tx = MAT.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
MAT.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])

# ================================================================ MEASURE (before joining)
def all_verts(obs): return np.array([list(o.matrix_world @ v.co) for o in obs for v in o.data.vertices])
def width_at(zw):
    xs = np.linspace(-.6, .6, 481) * W; zz = np.full(len(xs), CHIN + zw * W)
    q = np.stack([xs, np.zeros_like(xs), zz], -1); ins = np.zeros(len(xs), bool)
    for yy in np.linspace(-.6, .6, 121) * W:
        q[:, 1] = HY + yy; ins |= head_sdf(q) < 0
    return round(float(np.ptp(xs[ins]) / W), 3) if ins.any() else 0.
def ext(obs):
    A = all_verts(obs); return {k: [round(float(A[:, i].min()), 3), round(float(A[:, i].max()), 3)] for i, k in enumerate('xyz')}
ALL = all_verts([o for g in parts.values() for o in g])
NOHAT = all_verts([o for g, obs in parts.items() if g != 'hat' for o in obs])
rimL = np.array([verts[i] for i in roll_info[1][0]])
BV = np.concatenate([BILL_UP_V, BILL_LO_V])
def bill_hw_at(zw, V_=BV, band=.006):
    m = np.abs((V_[:, 2] - CHIN) / W - zw) < band
    return round(float(np.abs(V_[m, 0]).max() / W), 3) if m.any() else 0.
SKULL_CROWN = float(CHIN + W * max(z for z in np.linspace(.5, .95, 901) if head_local(np.array([[0, 0, z]]))[0] < 0))
MEAS = {'units': 'W = %.3f m face width at the cheeks; front-view z above the chin (W)' % W,
        'total_height_m': round(float(ALL[:, 2].max()), 4), 'height_without_hat_m': round(float(NOHAT[:, 2].max()), 4),
        'skull_crown_m': round(SKULL_CROWN, 4), 'lowest_z_m': round(float(ALL[:, 2].min()), 5), 'chin_m': CHIN,
        'head_height_W': round((SKULL_CROWN - CHIN) / W, 3),
        'head_half_width_W_at_z': {str(z): round(width_at(z) / 2, 3) for z in (.02, .05, .08, .12, .17, .22, .27, .32, .37, .42, .47, .52, .57, .62, .67, .72, .77, .82)},
        'head_depth_W': round(float(np.ptp(VP[:, 1]) / W), 3),
        'eye_opening_W': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'eye_centre_W': [round(EX / W, 3), round((EZ - CHIN) / W, 3)],
        'bill_W': {'tip_ahead_of_head_centre': round(float((HY - BV[:, 1].min()) / W), 3),
                   'tip_z': round(float((BV[np.argmin(BV[:, 1]), 2] - CHIN) / W), 3),
                   'top_z': round(float((BILL_UP_V[:, 2].max() - CHIN) / W), 3), 'bottom_z': round(float((BILL_LO_V[:, 2].min() - CHIN) / W), 3),
                   'half_width_at_z': {str(z): bill_hw_at(z) for z in (.12, .14, .16, .18, .20, .22, .24, .26, .28, .30, .32, .34, .36)}},
        'arm_span_m': round(float(np.ptp(all_verts(parts['arm.L'] + parts['arm.R'])[:, 0])), 3),
        'arm_L_extent_m': ext(parts['arm.L']), 'leg_L_extent_m': ext(parts['leg.L']), 'body_extent_m': ext(parts['body']),
        'tail_extent_m': {k: [round(float(TAIL_V[:, i].min()), 3), round(float(TAIL_V[:, i].max()), 3)] for i, k in enumerate('xyz')},
        'width_m': round(float(np.ptp(ALL[:, 0])), 3), 'depth_m': round(float(np.ptp(ALL[:, 1])), 3)}
if 'hat' in parts: MEAS['hat_extent_m'] = ext(parts['hat']); MEAS['hat'] = HAT
if 'tuft' in parts: MEAS['tuft_extent_m'] = ext(parts['tuft'])
MEAS.update(LOG); MEAS['info'] = info

# ================================================================ JOIN, CLEAN, NORMALS
objects = []; part_tri = {}
NAMES = {'head': '_head', 'bill': '_bill', 'jaw': '_bill_lower', 'eye.L': '_eye_L', 'eye.R': '_eye_R', 'lash.L': '_lash_L', 'lash.R': '_lash_R',
         'tuft': '_tuft', 'hat': '_hat', 'body': '_body', 'sleeve.L': '_sleeve_L', 'sleeve.R': '_sleeve_R', 'arm.L': '_arm_L', 'arm.R': '_arm_R',
         'leg.L': '_leg_L', 'leg.R': '_leg_R', 'tail': '_tail'}
JAW_PIVOT = L2M(np.array([0, -.22, .17]))
for group, obs in parts.items():
    for ob in obs:
        ob.data.materials.clear(); ob.data.materials.append(MAT)
        if RIG:
            vg = ob.vertex_groups.new(name='_part_' + ob.name); vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs: ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = NM + NAMES[group]; ob.data.name = NM + NAMES[group]
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
    piv = {'head': tuple(O), 'bill': tuple(O), 'jaw': tuple(JAW_PIVOT), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'],
           'lash.L': eye_centers['L'], 'lash.R': eye_centers['R'], 'tuft': tuple(O), 'hat': tuple(O), 'tail': tuple(TAIL_JOINTS[0]),
           'arm.L': joint_arms['L']['shoulder'], 'arm.R': joint_arms['R']['shoulder'],
           'sleeve.L': joint_arms['L']['shoulder'], 'sleeve.R': joint_arms['R']['shoulder'],
           'leg.L': joint_legs['L']['hip'], 'leg.R': joint_legs['R']['hip'], 'body': tuple(SPINE)}.get(group, (0, 0, 0))
    bpy.context.scene.cursor.location = piv; bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    for v in ob.data.vertices: assert all(math.isfinite(c) for c in v.co), 'Nonfinite position'
    for p in ob.data.polygons: assert all(math.isfinite(c) for c in p.normal) and p.normal.length > .5, ('Bad normal', ob.name, p.index)
    ob['phase'] = '1: neutral A-pose, no armature'; ob['front_axis'] = '-Y'; ob['units'] = 'metres'
    ob.data.calc_loop_triangles(); part_tri[group] = len(ob.data.loop_triangles); objects.append(ob)
tri_count = sum(part_tri.values()); print('PART_TRIANGLES', json.dumps(part_tri), tri_count, flush=True)
MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count

ears_j = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    base = np.array([s * .30 * W, HY, CHIN + .66 * W]); ears_j[tag] = {'base': [float(v) for v in base], 'tip': [float(v) for v in base + np.array([s * .015, 0, .045])]}
tail_chain = [[float(v) for v in catmull(TAIL_JOINTS, t)] for t in (0., .25, .5, .75, 1.)] + [[float(v) for v in TAIL_V[np.argmax(TAIL_V @ TAIL_V_AX)]]]
bill_tip = BV[np.argmin(BV[:, 1])]
joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X', 'design': DESIGN,
          'root': [0, 0, 0], 'hips': HIPS, 'spine': SPINE, 'chest': CHEST, 'neck': NECK,
          'head_base': [0, HY - .01, CHIN + .02], 'head': [float(v) for v in O], 'jaw_pivot': [float(v) for v in JAW_PIVOT],
          'bill': {'tip': [float(v) for v in bill_tip], 'upper_top': [0, float(L2M(np.array([0, -.40, .37]))[1]), float(CHIN + .37 * W)],
                   'lower_bottom': [0, float(BILL_LO_V[np.argmin(BILL_LO_V[:, 2]), 1]), float(BILL_LO_V[:, 2].min())],
                   'mouth_corners': {t_: [float(sg * .21 * W), float(L2M(np.array([0, -.48, 0]))[1]), float(CHIN + .20 * W)] for t_, sg in (('L', 1), ('R', -1))}},
          'eyes': eye_centers, 'brows': {'L': [BROW_X, float(front_hit(BROW_X, BROW_Z)[0]), BROW_Z], 'R': [-BROW_X, float(front_hit(-BROW_X, BROW_Z)[0]), BROW_Z]},
          'lashes': lash_info, 'ears_unweighted': ears_j, 'arms': joint_arms, 'legs': joint_legs, 'tail': tail_chain,
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth superquadric ball, radially projected, analytic normals.',
                    'Eyelid holes ringed by %d loops each, rim rolled in behind separate lens eyeballs; 3 loops round the bill root (hidden under the bill).' % len(EYE_SCALES),
                    'No ears: ear bones go unweighted (like Kero / Shinju). _bill (upper) rides the head; _bill_lower is the jaw piece (origin at jaw_pivot).',
                    'Separate pieces: eyes, lash rolls (origin at the eye centre, for the upper lids), bills, tail, arms + wing-mittens, legs + feet' +
                    (', the hat (rigid head follower, origin at the head centre).' if DESIGN == 'a' else ', sleeves (open cuffs), the scalp tuft (rigid on the head).')]}
if DESIGN == 'a': joints['hat'] = HAT
else: joints['sleeves'] = {k[7:]: v for k, v in info.items() if k.startswith('sleeve_')}
if not RIG and not FAST:
    with open(os.path.join(ROOT, 'joints-%s.json' % DESIGN), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model-%s.json' % DESIGN), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not RIG:
    if not FAST: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, TAG + '.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects: ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                              export_animations=False)
print('FOLKDUCK_BUILD_DONE', json.dumps({'design': DESIGN, 'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
