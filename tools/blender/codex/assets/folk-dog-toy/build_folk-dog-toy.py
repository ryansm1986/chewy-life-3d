"""The Blender townsfolk dogs (folk-dog-toy), Toybox line, phase-1 models (neutral A-pose, no rig).
Blender 4.3, no addons. Deterministic: a full rebuild from an empty scene, one design per run.

    blender --background --factory-startup --python build_folk-dog-toy.py -- --design a|c|all [--head-only]

(--design all re-launches Blender once per design.)  Design A = Mugi the patient gardener (tan, long brown floppy ears,
sage bib overalls with a big pocket, one leaf by the left ear); design C = Sora the curious schoolkid (black-and-tan shiba,
upright ears, butter-yellow shirt, blue shorts, a terracotta satchel on the left hip on a crossbody band).

Final asset: 1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. A: crown 1.05 m; C: crown 0.96 m (ears ~1.06).
Writes only inside this folder and public/models/folk-dog-<x>-toy.glb (--head-only: scratch/ only).

Technique (the folk-bunny / Usagi / Chiku toy-line machinery, authored directly in metres; measure-<x>.md has the targets):
- The head is ONE smooth convex implicit ball: a squircle skull, a full jaw, two shallow muzzle cushions and a button nose.
  No eye sockets. The skin is the field's zero surface reached by radial projection (CDT in a stereographic domain with
  edge loops round the eyelids, nose and mouth), so every vertex carries its analytic normal; adaptive refinement adds
  points where the toon band would zigzag.
- A: long drooping ears as thick paddles swept along a curved centreline (bend loops), rooted in the skull's top corners;
  a thick leaf (SDF star mesh) with a shallow groove. C: thick rounded-triangle ears as ring stacks (bend loops) growing out
  of the skull's upper corners, a recessed tan panel on the front.
- Clothing is lathed / swept / SDF star meshes; limbs are SDF ring stacks; the tails are thick swept beans (a 2-D chart
  paints the tip).
- One 2048 painted atlas per design: the face and eyes painted from 3D positions, 2-D ear and tail charts, 1-D ramps.
"""
import bpy, bmesh, math, json, os, sys, struct, zlib, subprocess
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt
from mathutils.bvhtree import BVHTree

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
DESIGN = ARGV[ARGV.index('--design') + 1].lower() if '--design' in ARGV else 'a'
if DESIGN == 'all':
    for d_ in ('a', 'c'):
        r_ = subprocess.run([bpy.app.binary_path, '--background', '--factory-startup', '--python', os.path.abspath(__file__), '--', '--design', d_] +
                            [a for a in ARGV if a == '--head-only'])
        assert r_.returncode == 0, ('design build failed', d_)
    raise SystemExit(0)
assert DESIGN in ('a', 'c'), DESIGN
HEAD_ONLY = '--head-only' in ARGV
RIG = bool(globals().get('RIG_MODE'))
MODELS = 'D:/projects/chewy-life-3d/public/models'
TASK = 'folk-dog-%s-toy' % DESIGN
NAME = {'a': 'DogA', 'c': 'DogC'}[DESIGN]
MODEL = os.environ.get('FOLK_MODEL_OUT', MODELS + '/' + TASK + '.glb')
OUT_MODEL = os.path.join(ROOT, 'scratch', TASK + '-head-test.glb') if HEAD_ONLY else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
S_FINAL = 1.0                               # authored in metres
# sheet (refs/sheet.png, measure-<x>.md): A's upper-row front view: ground y 307, crown y 75 = 1.05 m (221 px / m), head W 125 px
# = 0.566 m between the cheek points, chin y 185.5 = 0.55 m, head height 0.89 W. C's lower-row front view: ground y 955, skull
# crown y 730 = 0.96 m (234 px / m), W 150 px = 0.641 m, chin y 832.5 = 0.523 m, head height 0.68 W (ear tips 0.86 W).
if DESIGN == 'a':
    W = .566; CHIN = .550; HY = .000
else:
    W = .641; CHIN = .523; HY = .025
SW = W / .757                               # Tanuki-build millimetre constants (head W 0.757) scale with the head
LOG = {'design': DESIGN}

PAL = {'cream': '#FFF4EA', 'creamdark': '#F2E2D2', 'creamlight': '#FFF8F0', 'blush': '#E9A095',
       'sclera': '#FFF6EC', 'lash': '#2E2428', 'dark': '#2A2230'}
if DESIGN == 'a':
    PAL.update({'fur': '#E8C89A', 'furlight': '#F2D6AE', 'furdark': '#D8B482', 'furdeep': '#C9A272',
                'ear': '#9A6A4A', 'earlight': '#A87A58', 'eardark': '#8A5C3E',
                'iris': '#8B582B', 'pupil': '#3A2622', 'brow': '#5A3E30', 'mouth': '#3A3036', 'nose': '#3A3036', 'nosehi': '#6A5A60',
                'over': '#8DAA78', 'overlight': '#9CB888', 'overdark': '#7C9868',
                'leaf': '#6F8C58', 'leaflight': '#82A068', 'leafdark': '#5E7A4A', 'muzzle': '#FFF4EA'})
else:
    PAL.update({'fur': '#3A3036', 'furlight': '#4A3E44', 'furdark': '#30282D', 'furdeep': '#2A2230',
                'tan': '#E8C89A', 'tanlight': '#F2D6AE', 'tandark': '#D8B482', 'tandeep': '#C9A272',
                'iris': '#A86C32', 'pupil': '#3A2418', 'brow': '#E8C89A', 'mouth': '#282126', 'nose': '#282126', 'nosehi': '#544850',
                'shirt': '#EBCB77', 'shirtlight': '#F2D88E', 'shirtdark': '#DDBB66',
                'shorts': '#88AFC5', 'shortslight': '#98BDD2', 'shortsdark': '#789FB5',
                'bag': '#C88268', 'baglight': '#D49278', 'bagdark': '#B67258', 'muzzle': '#FFF4EA'})
CHARTS = {'head': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'ear': (0, 0, 768, 768), 'tail': (768, 0, 512, 384), 'spare': (768, 384, 512, 384)}
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'cream': ('creamdark', 'cream', 'creamlight'),
         'lash': ('#241C20', '#2E2428', '#4A3E42')}
if DESIGN == 'a':
    RAMPS.update({'limb': ('furdark', 'fur', 'furlight'), 'toe': ('furdeep', 'furdark', 'fur'),
                  'ear': ('eardark', 'ear', 'earlight'),
                  'over': ('overdark', 'over', 'overlight'), 'button': ('#EADCC8', 'cream', 'creamlight'),
                  'leaf': ('leafdark', 'leaf', 'leaflight'),
                  'hole': ('#6A8656', '#728E5E', '#7A9666')})
else:
    RAMPS.update({'limb': ('tandark', 'tan', 'tanlight'), 'toe': ('tandeep', 'tandark', 'tan'), 'tan': ('tandark', 'tan', 'tanlight'),
                  'shirt': ('shirtdark', 'shirt', 'shirtlight'), 'shorts': ('shortsdark', 'shorts', 'shortslight'),
                  'bag': ('bagdark', 'bag', 'baglight'), 'seam': ('#6E92A8', '#7698AE', '#7E9EB4'),
                  'hole': ('#A86650', '#B06E58', '#B87660')})
RAMP_ROWS = {k: i for i, k in enumerate(RAMPS)}
if RIG:
    CHARTS.update({'lidU.L': (1280, 0, 384, 192), 'lidU.R': (1664, 0, 384, 192), 'lidD.L': (1280, 192, 384, 128), 'lidD.R': (1664, 192, 384, 128),
                   'cavity': (1280, 320, 128, 128), 'tongue': (1408, 320, 128, 128)})
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
    return np.stack([(x + g + np.asarray(u) * (w - 2 * g)) / 2048, (y + g + np.asarray(v) * (h - 2 * g)) / 2048], -1)
def ramp_uv(name, val):
    x, y, w, h = CHARTS['ramp']; val = clamp(np.asarray(val, float))
    return np.stack([(x + 8 + val * (w - 16)) / 2048, np.full(val.shape, (y + RAMP_ROWS[name] * 32 + 16) / 2048)], -1)
LIGHT = unit(np.array([-.22, -.35, 1.]))
def sval(n, occ=0., hi=.30, lo=.24):
    """painted soft shading value for the ramps: 0.5 = base colour, lighter toward the key light, darker below"""
    d = np.asarray(n) @ LIGHT
    return clamp(.50 + hi * smooth(.0, .95, d) - lo * smooth(.05, .95, -d) - occ)

# ============================================================== mesh plumbing (after the Moka build)
parts = {}
def make_obj(name, V, F, UV, group, N=None):
    V = np.asarray(V, float)
    me = bpy.data.meshes.new(name); me.from_pydata(V.tolist(), [], [tuple(int(i) for i in f) for f in F]); me.update()
    uvl = me.uv_layers.new(name='Atlas')
    lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
    if isinstance(UV, list): uvs = np.array([c for f in UV for c in f], float)
    else: uvs = np.asarray(UV, float)[lv]
    uvl.data.foreach_set('uv', uvs.astype(np.float32).ravel())
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    if N is not None:
        a = me.attributes.new('cust_n', 'FLOAT_VECTOR', 'POINT')
        a.data.foreach_set('vector', unit(np.asarray(N, float)).astype(np.float32).ravel())
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    parts.setdefault(group, []).append(ob); return ob

def grid_faces(R, C, wrap=False, off=0):
    F = []
    for j in range(R - 1):
        for i in range(C if wrap else C - 1):
            a = off + j * C + i; b = off + j * C + (i + 1) % C; F.append((a, b, b + C, a + C))
    return F

def closed_grid(P, N, UV, pole0=None, pole1=None):
    R, C = P.shape[:2]
    V = list(P.reshape(-1, 3)); NN = list(N.reshape(-1, 3)); UU = list(UV.reshape(-1, 2)); F = grid_faces(R, C, True)
    for pole, ring, rev in ((pole0, 0, True), (pole1, R - 1, False)):
        if pole is None: continue
        k = len(V); V.append(pole[0]); NN.append(pole[1]); UU.append(pole[2])
        for i in range(C):
            a = ring * C + i; b = ring * C + (i + 1) % C
            F.append((a, b, k) if not rev else (b, a, k))
    return np.array(V), F, np.array(UU), np.array(NN)

def thicken(V, F, N, t, UVo, UVi, UVrim, rim=4, plain=None):
    """an open surface (outer normals N) -> a closed shell: outer, inner, rounded rim along every boundary"""
    V = np.asarray(V, float); N = unit(np.asarray(N, float)); n = len(V)
    f0 = F[len(F) // 2]; fn = np.cross(V[f0[1]] - V[f0[0]], V[f0[2]] - V[f0[0]])
    if fn @ N[f0[0]] < 0: F = [tuple(f[::-1]) for f in F]
    t = np.broadcast_to(np.asarray(t, float), (n,)).copy()
    Vo = V + N * (t[:, None] / 2); Vi = V - N * (t[:, None] / 2)
    VV = [Vo, Vi]; NN = [N, -N]; UU = [np.broadcast_to(np.asarray(UVo, float), (n, 2)), np.broadcast_to(np.asarray(UVi, float), (n, 2))]
    FF = [tuple(f) for f in F] + [tuple(n + i for i in f[::-1]) for f in F]
    cnt = {}
    for f in F:
        for k in range(len(f)):
            e = (f[k], f[(k + 1) % len(f)]); key = (min(e), max(e)); cnt[key] = cnt.get(key, 0) + 1
    bedges = []
    for f in F:
        for k in range(len(f)):
            a, b = f[k], f[(k + 1) % len(f)]
            if cnt[(min(a, b), max(a, b))] == 1: bedges.append((a, b))
    out = np.zeros((n, 3))
    for a, b in bedges:
        o = np.cross(V[b] - V[a], (N[a] + N[b]) / 2); out[a] += o; out[b] += o
    bv = sorted(set([a for a, b in bedges] + [b for a, b in bedges]))
    out[bv] = unit(out[bv]); out[bv] = unit(out[bv] - N[bv] * (out[bv] * N[bv]).sum(1, keepdims=True))
    ringidx = {}; base = 2 * n; extra = []; extra_n = []; extra_uv = []
    for v in bv:
        ids = [v]
        for k in range(1, rim):
            th = PI * k / rim; nn = math.cos(th) * N[v] + math.sin(th) * out[v]
            extra.append(V[v] + nn * t[v] / 2); extra_n.append(nn); extra_uv.append(UVrim[v] if np.ndim(UVrim) > 1 else UVrim)
            ids.append(base + len(extra) - 1)
        ids.append(n + v); ringidx[v] = ids
    for a, b in bedges:
        ra, rb = ringidx[a], ringidx[b]
        if plain is not None and plain[a] and plain[b]:
            FF.append((rb[0], ra[0], ra[-1], rb[-1])); continue
        for k in range(rim):
            FF.append((rb[k], ra[k], ra[k + 1], rb[k + 1]))
    if extra:
        VV.append(np.array(extra)); NN.append(np.array(extra_n)); UU.append(np.array(extra_uv))
    return np.concatenate(VV), FF, np.concatenate(UU), np.concatenate(NN)

def natspline(X, Y):
    X = np.asarray(X, float); Y = np.asarray(Y, float); n = len(X); h = np.diff(X)
    A = np.zeros((n, n)); r = np.zeros(n); A[0, 0] = A[-1, -1] = 1
    for i in range(1, n - 1):
        A[i, i - 1] = h[i - 1]; A[i, i] = 2 * (h[i - 1] + h[i]); A[i, i + 1] = h[i]
        r[i] = 3 * ((Y[i + 1] - Y[i]) / h[i] - (Y[i] - Y[i - 1]) / h[i - 1])
    c = np.linalg.solve(A, r); b = (np.diff(Y) / h) - h * (2 * c[:-1] + c[1:]) / 3; d = np.diff(c) / (3 * h)
    def f(x):
        x = np.clip(np.asarray(x, float), X[0], X[-1]); k = np.clip(np.searchsorted(X, x) - 1, 0, n - 2); dx = x - X[k]
        return Y[k] + b[k] * dx + c[k] * dx * dx + d[k] * dx ** 3
    return f

def lobe(name, c, r, out, group, ramp='fur', n=5, squash=.10, occ_in=.30, sheen=1.0, base_occ=0., pole=None):
    """closed clay lobe: cube-sphere on a squashed ellipsoid, analytic normals, ramp shading. r = radii (out, e3, pole)"""
    c = np.asarray(c, float); out = unit(np.asarray(out, float)); r = np.asarray(r, float)
    if pole is None: pole = unit(np.cross(out, [0, 0, 1.]) if abs(out[2]) < .9 else np.cross(out, [1., 0, 0]))
    else: pole = unit(np.asarray(pole, float) - out * (np.asarray(pole, float) @ out))
    e3 = np.cross(pole, out)
    t = np.tan(np.linspace(-PI / 4, PI / 4, n + 1))
    V = []; NV = []; VAL = []; F = []; key = {}
    def vid(p):
        k = tuple(np.round(p, 6))
        if k not in key:
            dl = unit(p); kk = 1 - squash * max(0., -dl[0]) ** 2
            P = c + out * dl[0] * r[0] * kk + e3 * dl[1] * r[1] + pole * dl[2] * r[2]
            nn = unit(out * dl[0] / r[0] + e3 * dl[1] / r[1] + pole * dl[2] / r[2])
            key[k] = len(V); V.append(P); NV.append(nn)
            VAL.append(float(sval(nn, occ=base_occ + occ_in * float(smooth(.30, -.60, dl[0])), hi=.30 * sheen)))
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
    return make_obj(name, np.array(V), F, ramp_uv(ramp, np.array(VAL)), group, N=np.array(NV))

def catmull(points, t):
    pts = [np.asarray(p, float) for p in points]; n = len(pts) - 1; k = min(int(t * n), n - 1); f = t * n - k
    p0, p1, p2, p3 = pts[max(0, k - 1)], pts[k], pts[k + 1], pts[min(n, k + 2)]
    return .5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f)
def cpath(points, n): return np.array([catmull(points, t) for t in np.linspace(0, 1, n)])

def frames(path, up_hint=None, normals=None):
    P = np.asarray(path, float); T = np.gradient(P, axis=0); T = unit(T)
    if normals is not None:
        Nn = np.asarray(normals, float); Nn = unit(Nn - T * (Nn * T).sum(1, keepdims=True))
    else:
        Nn = np.zeros_like(P); ref = np.asarray(up_hint if up_hint is not None else [0, 0, 1.])
        x = np.cross(T[0], ref); x = x if np.linalg.norm(x) > 1e-6 else np.cross(T[0], [1., 0, 0]); Nn[0] = unit(x)
        for k in range(1, len(P)):
            v = Nn[k - 1] - T[k] * (Nn[k - 1] @ T[k]); Nn[k] = unit(v)
    B = np.cross(T, Nn)
    return T, Nn, B

def sweep(name, path, prof_r, group, uvfn, sides=16, cap0=True, cap1=True, up_hint=None, normals=None, p=1.0):
    """a tube along a path; prof_r(k) -> (rx, ry) radii in the (N, B) frame; rounded caps; uvfn(normals, ring_t, side_u, V) -> uv"""
    P = np.asarray(path, float); T, Nn, B = frames(P, up_hint, normals); R = len(P)
    a = np.linspace(0, 2 * PI, sides, endpoint=False)
    rings = []; norms = []
    for k in range(R):
        rx, ry = prof_r(k)
        ring = P[k] + Nn[k] * (rx * spow(np.cos(a), p))[:, None] + B[k] * (ry * spow(np.sin(a), p))[:, None]
        nn = unit(Nn[k] * (spow(np.cos(a), 2 - p) / rx)[:, None] + B[k] * (spow(np.sin(a), 2 - p) / ry)[:, None])
        rings.append(ring); norms.append(nn)
    rings = np.array(rings); norms = np.array(norms)
    V = list(rings.reshape(-1, 3)); NV = list(norms.reshape(-1, 3)); F = grid_faces(R, sides, True)
    tt = np.repeat(np.linspace(0, 1, R), sides); uu = np.tile(np.arange(sides) / sides, R)
    for end, use, sgn in ((0, cap0, -1), (R - 1, cap1, 1)):
        if not use: continue
        rx, ry = prof_r(end); prev = list(range(end * sides, end * sides + sides))
        for kk in (1, 2):
            th = PI / 2 * kk / 3
            ring = P[end] + sgn * T[end] * (min(rx, ry) * math.sin(th) * .9) + (Nn[end] * (rx * math.cos(th) * spow(np.cos(a), p))[:, None] + B[end] * (ry * math.cos(th) * spow(np.sin(a), p))[:, None])
            nn = unit(Nn[end] * (spow(np.cos(a), 2 - p) / rx * math.cos(th))[:, None] + B[end] * (spow(np.sin(a), 2 - p) / ry * math.cos(th))[:, None] + sgn * T[end] * math.sin(th) / min(rx, ry))
            i0 = len(V); V += list(ring); NV += list(nn); cur = list(range(i0, i0 + sides))
            tt = np.concatenate([tt, np.full(sides, end / max(R - 1, 1))]); uu = np.concatenate([uu, np.arange(sides) / sides])
            for i in range(sides):
                j = (i + 1) % sides; F.append((prev[i], prev[j], cur[j], cur[i]) if sgn > 0 else (prev[j], prev[i], cur[i], cur[j]))
            prev = cur
        k0 = len(V); V.append(P[end] + sgn * T[end] * min(rx, ry) * .9); NV.append(sgn * T[end])
        tt = np.concatenate([tt, [end / max(R - 1, 1)]]); uu = np.concatenate([uu, [0.]])
        for i in range(sides):
            j = (i + 1) % sides; F.append((prev[i], prev[j], k0) if sgn > 0 else (prev[j], prev[i], k0))
    V = np.array(V); NV = np.array(NV)
    return make_obj(name, V, F, uvfn(NV, tt, uu, V), group, N=NV)

def ring_tube(name, path, prof, group, uvfn, normals, sides=12):
    """a CLOSED loop tube (no caps): path (R,3) closed, prof(k) -> list of (dn, db) profile points round the section,
    normals (R,3) give the frame's N axis (B = T x N)"""
    P = np.asarray(path, float); R = len(P)
    T = unit(np.roll(P, -1, 0) - np.roll(P, 1, 0)); Nn = unit(np.asarray(normals, float)); Nn = unit(Nn - T * (Nn * T).sum(1, keepdims=True)); B = np.cross(T, Nn)
    rings = []
    for k in range(R):
        pr = np.asarray(prof(k), float)
        rings.append(P[k] + Nn[k] * pr[:, 0:1] + B[k] * pr[:, 1:2])
    G = np.array(rings); m = G.shape[1]
    dS = np.roll(G, -1, 1) - np.roll(G, 1, 1); dK = np.roll(G, -1, 0) - np.roll(G, 1, 0)
    NG = unit(np.cross(dK, dS)); ctr = np.repeat(P[:, None, :], m, 1)
    flip = ((NG * (G - ctr)).sum(-1) < 0)[..., None]; NG = np.where(flip, -NG, NG)
    V = G.reshape(-1, 3); NV = NG.reshape(-1, 3)
    F = []
    for j in range(R):
        for i in range(m):
            jj = (j + 1) % R; F.append((j * m + i, j * m + (i + 1) % m, jj * m + (i + 1) % m, jj * m + i))
    tt = np.repeat(np.arange(R) / R, m); uu = np.tile(np.arange(m) / m, R)
    return make_obj(name, V, F, uvfn(NV, tt, uu, V), group, N=NV)

def star_mesh(name, sdf, centre, group, uvfn, nth=16, nph=24, tmax=.3, axis=(0, 0, 1.), ref=(1., 0, 0), thetas=None):
    """closed star-shaped surface: outermost root of sdf along rays from centre on a lat-long grid, field normals"""
    c = np.asarray(centre, float); ax_ = unit(np.asarray(axis, float)); r0 = unit(np.asarray(ref, float) - ax_ * (np.asarray(ref) @ ax_)); b0 = np.cross(ax_, r0)
    th = np.linspace(0, PI, nth + 1)[1:-1] if thetas is None else np.asarray(thetas, float); nth = len(th) + 1
    ph = np.linspace(0, 2 * PI, nph, endpoint=False)
    TT, PP = np.meshgrid(th, ph, indexing='ij')
    D = np.cos(TT)[..., None] * ax_ + np.sin(TT)[..., None] * (np.cos(PP)[..., None] * r0 + np.sin(PP)[..., None] * b0)
    Dall = np.concatenate([D.reshape(-1, 3), [ax_, -ax_]])
    name_hint[0] = name
    P = ray_outer(sdf, c, Dall, tmax); N = grad(sdf, P)
    R = nth - 1; Pg = P[:-2].reshape(R, nph, 3); Ng = N[:-2].reshape(R, nph, 3)
    V, F, _, NN = closed_grid(Pg, Ng, np.zeros((R, nph, 2)), (P[-2], N[-2], [0, 0]), (P[-1], N[-1], [0, 0]))
    return make_obj(name, V, F, uvfn(NN, V), group, N=NN)

name_hint = ['']
def ray_outer(sdf, c, D, tmax, steps=120, it=30):
    n = len(D); ts = np.linspace(tmax, 0, steps)
    lo = np.zeros(n); hi = np.full(n, tmax); found = np.zeros(n, bool)
    for k in range(1, steps):
        v = sdf(c + D * ts[k]); new = (~found) & (v < 0); lo[new] = ts[k]; hi[new] = ts[k - 1]; found |= new
        if found.all(): break
    assert found.all(), ('ray without root', name_hint[0])
    for _ in range(it):
        m = .5 * (lo + hi); ins = sdf(c + D * m[:, None]) < 0; lo = np.where(ins, m, lo); hi = np.where(ins, hi, m)
    return c + D * (.5 * (lo + hi))[:, None]
def grad(f, p, e=1.5e-4):
    g = np.zeros_like(p)
    for k in range(3):
        dp = np.zeros(3); dp[k] = e; g[:, k] = f(p + dp) - f(p - dp)
    return unit(g)
def sd_capsule(p, a, b, r):
    a = np.asarray(a, float); b = np.asarray(b, float); pa = p - a; ba = b - a
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1); return np.linalg.norm(pa - h[:, None] * ba, axis=1) - (r if np.ndim(r) == 0 else r[0] + (r[1] - r[0]) * h)
def sd_ell(p, c, axes, radii):
    q = (p - np.asarray(c)) @ np.asarray(axes).T; return ell(q, [0, 0, 0], radii)
def sd_box(p, c, axes, h, rr):
    q = np.abs((p - np.asarray(c)) @ np.asarray(axes).T) - (np.asarray(h) - rr)
    return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(np.max(q, axis=1), 0) - rr
def ring_stack(name, sdf, centres, axisdirs, group, uvfn, sides=16, tmax=.2, pole_end=True, pole_start=True, ref=None):
    """rings of outermost roots round each centre, in the plane normal to axisdirs; poles close the ends"""
    C = np.asarray(centres, float); Ax = unit(np.asarray(axisdirs, float)); R = len(C)
    a = np.linspace(0, 2 * PI, sides, endpoint=False); rings = []
    for k in range(R):
        r0 = np.asarray(ref if ref is not None else [0, -1., 0], float); e1 = unit(r0 - Ax[k] * (r0 @ Ax[k])); e2 = np.cross(Ax[k], e1)
        D = np.cos(a)[:, None] * e1 + np.sin(a)[:, None] * e2
        name_hint[0] = name; rings.append(ray_outer(sdf, C[k], D, tmax, steps=90, it=26))
    rings = np.array(rings); Nr = grad(sdf, rings.reshape(-1, 3)).reshape(rings.shape)
    p0 = None; p1 = None
    if pole_start:
        q = ray_outer(sdf, C[0], -Ax[0][None], tmax); p0 = (q[0], grad(sdf, q)[0], [0, 0])
    if pole_end:
        q = ray_outer(sdf, C[-1], Ax[-1][None], tmax); p1 = (q[0], grad(sdf, q)[0], [0, 0])
    V, Fq, _, NN = closed_grid(rings, Nr, np.zeros(rings.shape[:2] + (2,)), p0, p1)
    return make_obj(name, V, Fq, uvfn(NN, V), group, N=NN)
def ell(q, c, r):
    q = (q - np.asarray(c)) / np.asarray(r)
    k0 = np.sqrt((q * q).sum(-1)); k1 = np.sqrt(((q / np.asarray(r)) ** 2).sum(-1))
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)
def smin(a, b, k):
    h = np.clip(.5 + .5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)
def smax(a, b, k): return -smin(-a, -b, k)
def rot(axis, ang):
    axis = unit(np.asarray(axis, float)); K = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    return np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * (K @ K)


def ramp_colour(name, u):
    lo, base, hi = [rgb(c) for c in RAMPS[name]]; u = clamp(u)
    return np.where((np.asarray(u) < .5)[..., None], mix(lo, base, smooth(0, .5, u)), mix(base, hi, smooth(.5, 1, u)))
def crease(a, b, k): return clamp((np.minimum(a, b) - smin(a, b, k)) / k)
def chart_uv(chart, u, v):
    """a 2-D chart addressed by (u, v) in [0, 1] (tail: u = along the tail, v = painted shade)"""
    x, y, w, h = CHARTS[chart]; u = clamp(np.asarray(u, float)); v = clamp(np.asarray(v, float)) * np.ones_like(u)
    return np.stack([(x + 8 + u * (w - 16)) / 2048, (y + 8 + v * (h - 16)) / 2048], -1)
def gradL(f, p, e=1e-4):
    g = np.zeros_like(p)
    for k in range(3):
        dp = np.zeros(3); dp[k] = e; g[:, k] = f(p + dp) - f(p - dp)
    return unit(g)

# ============================================================== the head ball (W units, z above the chin, y from HY)
# Skull: from the front a soft squircle (exponent NU over the cheeks rounding to NUT at the crown) over a round jaw
# (exponent NL), widest at the cheek line z = ZC; in depth a superellipse. A (measure-a.md, head close-up): 0.63 / 0.80 / 0.91 /
# 0.97 / 0.995 W wide at 0.04 / 0.08 / 0.14 / 0.20 / 0.26 W, widest 1.00 at 0.31, 0.98 / 0.96 / 0.92 / 0.87 / 0.81 at 0.40 / 0.45
# / 0.50 / 0.55 / 0.60; crown 0.775 W. B: the same family, a broader, fuller jaw (the sheet's broadest cheeks), crown 0.75 W.
if DESIGN == 'a':
    # A (measure-a.md): a wide softened box, widest over the cheeks at 0.21 W above the chin, crown 0.89 W; deep (side view ~1.0 W)
    SK = dict(a=.500, zc=.215, cu=.675, cl=.215, nu=2.30, nut=2.55, nl=2.55, bf=.445, bb=.505, pd=2.05, face=.030, pdf=2.20)
else:
    # C: a rounded box, broad low cheeks (widest at 0.22 W), a lower flatter crown (0.68 W), squarer jaw corners
    SK = dict(a=.500, zc=.220, cu=.460, cl=.220, nu=2.25, nut=2.10, nl=2.90, bf=.405, bb=.440, pd=2.05, face=.030, pdf=2.20)
def skull(q):
    """first-order distance (r - 1) / |grad r| with the analytic gradient (n, pd, a vary slowly: their derivatives are ignored)"""
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    zr = z - SK['zc']
    c = np.where(zr > 0, SK['cu'], SK['cl'])
    a = SK['a'] * (1 - SK['face'] * smooth(-.05, -.40, y))
    nup = SK['nu'] + (SK['nut'] - SK['nu']) * smooth(.22, .46, zr)
    n = SK['nl'] + (nup - SK['nl']) * smooth(-.10, .12, zr)
    ax_ = np.abs(x) / a + 1e-9; az_ = np.abs(zr) / c + 1e-9
    s = (ax_ ** n + az_ ** n) ** (1 / n)
    b = np.where(y < 0, SK['bf'], SK['bb']); ay_ = np.abs(y) / b + 1e-9
    pd = SK['pd'] + (SK['pdf'] - SK['pd']) * smooth(.0, -.30, y) * smooth(-.25, .25, zr)
    r = (s ** pd + ay_ ** pd) ** (1 / pd)
    kk = s ** (1 - n); gx = kk * ax_ ** (n - 1) / a; gz = kk * az_ ** (n - 1) / c
    rs = r ** (1 - pd) * s ** (pd - 1); gy = r ** (1 - pd) * ay_ ** (pd - 1) / b
    g = np.sqrt(rs * rs * (gx * gx + gz * gz) + gy * gy) + 1e-9
    return (r - 1) / g

def front_local(x, z, f):
    """first surface hit marching from the front (-y) at (x, z), W units, vectorised"""
    x = np.atleast_1d(np.asarray(x, float)); z = np.atleast_1d(np.asarray(z, float)); n = len(x)
    ys = np.linspace(-.95, .30, 320)
    P = np.stack([np.repeat(x[:, None], len(ys), 1), np.broadcast_to(ys, (n, len(ys))), np.repeat(z[:, None], len(ys), 1)], -1).reshape(-1, 3)
    ins = (f(P) < 0).reshape(n, len(ys)); i = np.argmax(ins, 1); ok = ins[np.arange(n), i]
    lo = ys[np.maximum(i - 1, 0)]; hi = ys[i]
    for _ in range(26):
        m = (lo + hi) / 2; inn = f(np.stack([x, m, z], -1)) < 0
        hi = np.where(inn, m, hi); lo = np.where(inn, lo, m)
    return np.where(ok, (lo + hi) / 2, np.nan)

_MZC = .205 if DESIGN == 'a' else .145                        # the muzzle cushions' height above the chin (W)
_ym = float(front_local(0, _MZC, skull)[0])
# two shallow muzzle cushions either side of the philtrum (the sheet: a low, short pad; A ~0.065 W proud, C ~0.05 W)
if DESIGN == 'a':
    MUZ_L = [[.074, _ym + .060 - .032, _MZC], [.128, .060, .112]]; K_MUZ = .060
    MUZ_C = [[0, _ym + .060 - .030, _MZC - .005], [.150, .060, .110]]       # a centre pad: one smooth oval (no dip under the philtrum)
    JAW = [[0, -.100, .160], [.300, .220, .160]]; K_JAW = .06                 # the full lower face and chin (side view)
else:
    MUZ_L = [[.064, _ym + .056 - .034, _MZC], [.112, .056, .094]]; K_MUZ = .060
    MUZ_C = [[0, _ym + .056 - .030, _MZC - .010], [.130, .056, .095]]
    JAW = [[0, -.090, .135], [.340, .215, .145]]; K_JAW = .06                 # broad low cheeks
MUZ_R = [[-MUZ_L[0][0]] + MUZ_L[0][1:], MUZ_L[1]]
def base_local(q):
    d = smin(skull(q), ell(q, *JAW), K_JAW)
    m_ = np.minimum(ell(q, *MUZ_L), ell(q, *MUZ_R))
    if MUZ_C is not None: m_ = smin(m_, ell(q, *MUZ_C), .04)
    return smin(d, m_, K_MUZ)
MUZ = MUZ_L
# eye layout (W units; x from the head close-up, z = the close-up's fraction of the head height x the body view's head height):
# A opening centres +-0.250 W, 0.415 W above the chin, opening 0.226 x 0.240 W; C +-0.210, 0.325, 0.200 x 0.210 W.
# Nose: A 0.130 x 0.080 W at 0.325 W; C 0.114 x 0.064 W at 0.245 W.
if DESIGN == 'a':
    EXW, EZW, EHWW, EHHW, EN = .250, .415, .113, .120, 2.10
    NZW = .325; NOSE_R = [.066, .042, .041]; NOSE_P = .050
else:
    EXW, EZW, EHWW, EHHW, EN = .210, .325, .100, .105, 2.10
    NZW = .245; NOSE_R = [.057, .036, .033]; NOSE_P = .044
NECK = [[0, -.005, -.250], [.150, .140, .270]]; K_NECK = .07
def warped(q): return q                                     # convex face: no eye sockets (Rosie round 8)
_yf = float(front_local(0, NZW, base_local)[0])
NOSE = [[0, _yf + NOSE_R[1] - NOSE_P, NZW], NOSE_R]; K_N = .012       # a dark button nose
def head_local(q, neck=True):
    d = base_local(q)
    if neck: d = smin(d, ell(q, *NECK), K_NECK)
    return smin(d, ell(q, *NOSE), K_N)
NOSE_TIP_L = float(front_local(0, NZW, head_local)[0])
def L2M(q): return np.stack([q[..., 0] * W, HY + q[..., 1] * W, CHIN + q[..., 2] * W], -1)
def M2L(p): return np.stack([p[..., 0] / W, (p[..., 1] - HY) / W, (p[..., 2] - CHIN) / W], -1)
def head_sdf(p): return head_local(M2L(p)) * W
def front_hit(x, z, f=head_sdf):
    return HY + W * front_local(np.asarray(x) / W, (np.asarray(z) - CHIN) / W, lambda q: f(L2M(q)) / W)
O = np.array([0, HY + .02 * W, CHIN + .32 * W])
def radial_hit(d, f=head_sdf, o=O, t0=.02, t1=.80, it=34):
    lo = np.full(len(d), t0); hi = np.full(len(d), t1)
    for _ in range(it):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return o + d * ((lo + hi) / 2)[:, None]
def radial_hit_outer(d, f=head_sdf, o=O, t0=.02, t1=.80, steps=110):
    ts = np.linspace(t1, t0, steps); n = len(d)
    P = o + d[:, None, :] * ts[None, :, None]
    ins = (f(P.reshape(-1, 3)) < 0).reshape(n, steps); i = np.argmax(ins, 1)
    lo = ts[i]; hi = ts[np.maximum(i - 1, 0)]
    for _ in range(26):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return o + d * ((lo + hi) / 2)[:, None]
def grad_n(p, f=head_sdf, e=1.5e-4): return grad(f, p, e)
def to_dom(d):
    den = 1 - d[:, 1]; return np.stack([2 * d[:, 0] / den, 2 * d[:, 2] / den], -1)
def from_dom(uv):
    r2 = (uv * uv).sum(1); den = 4 + r2
    return np.stack([4 * uv[:, 0] / den, -(4 - r2) / den, 4 * uv[:, 1] / den], -1)
AMAX = math.radians(118); UVR0 = .46
def head_uv(d):
    a = np.arccos(np.clip(-d[:, 1], -1, 1)); psi = np.arctan2(d[:, 2], d[:, 0])
    r = np.where(a <= AMAX, UVR0 * a / AMAX, UVR0 + (.5 - UVR0) * (a - AMAX) / (PI - AMAX))
    return np.stack([.5 + r * np.cos(psi), .5 + r * np.sin(psi)], -1)
def head_uv_dir(U, V):
    du = U - .5; dv = V - .5; r = np.sqrt(du * du + dv * dv); psi = np.arctan2(dv, du)
    a = np.where(r <= UVR0, AMAX * r / UVR0, np.minimum(AMAX + (PI - AMAX) * (r - UVR0) / (.5 - UVR0), PI - 1e-3))
    return np.stack([np.sin(a) * np.cos(psi), -np.cos(a), np.sin(a) * np.sin(psi)], -1)

_g = np.stack(np.meshgrid(np.zeros(1), np.linspace(-.5, .5, 101), np.linspace(.55, .90, 351), indexing='ij'), -1).reshape(-1, 3)
CROWN_M = float(CHIN + W * _g[skull(_g) < 0][:, 2].max())
LOG['crown_m'] = round(CROWN_M, 4)
print('HEAD_FIELD crown', CROWN_M, 'nose_tip', NOSE_TIP_L, flush=True)
# ============================================================== face layout (front projection, metres)
EX = EXW * W; EZ = CHIN + EZW * W; EHW = EHWW * W; EHH = EHHW * W
def eye_unit(psi):
    c = np.cos(psi); s = np.sin(psi); return spow(c, 2 / EN), spow(s, 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
# the omega smile: A 0.240 W wide at z 0.199-0.254 W (centre 0.228); C 0.200 W at 0.132-0.189 (centre 0.160);
# blush dabs A (+-0.366, 0.262) 0.155 x 0.10 W; C (+-0.30, 0.195) 0.13 x 0.08 W
if DESIGN == 'a':
    MZW = .228; MHW = .120 * W; BLUSH = (.366 * W, CHIN + .262 * W, .078 * W, .052 * W)
    MOUTH_LOOPS = [(.132, .030), (.146, .034), (.160, .038)]
else:
    MZW = .162; MHW = .100 * W; BLUSH = (.300 * W, CHIN + .195 * W, .066 * W, .042 * W)
    MOUTH_LOOPS = [(.112, .026), (.125, .030), (.138, .034)]
NZ = CHIN + NZW * W; MZ = CHIN + MZW * W

# ============================================================== HEAD SKIN: CDT on the ball, eyelid / nose / mouth loops
pts = []; cons = []; tags = {}
def add_loop(P, tag, closed=True):
    i0 = len(pts); pts.extend([tuple(p) for p in P]); n = len(P)
    for i in range(n if closed else n - 1): cons.append((i0 + i, i0 + (i + 1) % n))
    tags[tag] = list(range(i0, i0 + n)); return tags[tag]
def surf_dir(x, z):
    y = front_hit(x, z); return unit(np.stack([np.asarray(x, float) * np.ones_like(y), y, np.asarray(z, float) * np.ones_like(y)], -1) - O)

NE = 48
EYE_SCALES = [1.0, 1.06, 1.13, 1.21, 1.30, 1.40]
eye_dom = {}
for s in (-1, 1):
    psi = np.linspace(0, 2 * PI, NE, endpoint=False)
    x, z = eye_xz(s, psi); base = to_dom(surf_dir(x, z)); c = to_dom(surf_dir(np.array([s * EX]), np.array([EZ])))[0]
    eye_dom[s] = (c, base)
    wn = (1 - .72 * smooth(-.10, -.80, np.cos(psi))) * (1 - .45 * smooth(-.20, -.90, np.sin(psi)))   # tighter toward the nose and the muzzle
    for k, kk in enumerate(EYE_SCALES): add_loop(c + (base - c) * (1 + (kk - 1) * wn[:, None]), 'eye%d_%d' % (s, k))
pts.append(tuple(to_dom(surf_dir(np.array([0.]), np.array([NZ])))[0])); tags['nose_c'] = [len(pts) - 1]
_NSX, _NSZ = NOSE_R[0] / .044, NOSE_R[2] / .030
for k, (rx, rz, n) in enumerate([(.018, .010, 10), (.030, .017, 14), (.043, .025, 18), (.056, .032, 22)]):
    a = np.linspace(0, 2 * PI, n, endpoint=False) + .3 * k
    add_loop(to_dom(surf_dir(rx * _NSX * W * np.cos(a), NZ + rz * _NSZ * W * np.sin(a))), 'nose_%d' % k)
for k, (hx, hz) in enumerate(MOUTH_LOOPS):
    a = np.linspace(0, 2 * PI, 48, endpoint=False)
    add_loop(to_dom(surf_dir(hx * W * spow(np.cos(a), .8), MZ + hz * W * np.sin(a))), 'mouth_%d' % k)
NB = 72; AB = math.radians(122)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
def fib(nf, amax):
    ii = np.arange(nf) + .5; phi = np.arccos(1 - 2 * ii / nf); th = PI * (1 + 5 ** .5) * ii
    D = np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
    return D[np.arccos(np.clip(-D[:, 1], -1, 1)) < amax]
D = fib(1150, math.radians(118.5)); Pf = radial_hit(D)
D2 = fib(2700, math.radians(74)); P2 = radial_hit(D2)       # a finer fill over the face, where it bends most
def fine_zone(P):
    q = M2L(P)
    return ((np.abs(q[:, 0]) < .50) & (q[:, 2] > .06) & (q[:, 2] < .66)) & (P[:, 1] < HY - .05 * W)
D = np.concatenate([D[~fine_zone(Pf)], D2[fine_zone(P2)]]); Pf = np.concatenate([Pf[~fine_zone(Pf)], P2[fine_zone(P2)]])
# the chin and under-jaw: rays from the head centre graze them, so they get a regular grid sampled from the front
gx, gz = np.meshgrid(np.linspace(-.30, .30, 25) * W, CHIN + np.linspace(-.14, .08, 13) * W)
gx = gx.ravel(); gz = gz.ravel(); gy = front_hit(gx, gz); okg = np.isfinite(gy)
G = np.stack([gx, gy, gz], -1)[okg]; Dg = unit(G - O)
zone = (np.abs(Pf[:, 0]) < .31 * W) & (Pf[:, 2] < CHIN + .085 * W) & (Pf[:, 1] < HY - .02)
D = np.concatenate([D[~zone], Dg]); Pf = np.concatenate([Pf[~zone], radial_hit_outer(Dg)]); keep = np.ones(len(D), bool)
dom = to_dom(D)
for s in (-1, 1):
    c, base = eye_dom[s]
    outer = np.array([pts[i] for i in tags['eye%d_%d' % (s, len(EYE_SCALES) - 1)]])
    ang_b = np.arctan2(outer[:, 1] - c[1], outer[:, 0] - c[0]); rad_b = np.linalg.norm(outer - c, axis=1)
    order = np.argsort(ang_b); ab = np.concatenate([ang_b[order] - 2 * PI, ang_b[order], ang_b[order] + 2 * PI]); rb = np.tile(rad_b[order], 3)
    v = dom - c; rr = np.linalg.norm(v, axis=1) / np.interp(np.arctan2(v[:, 1], v[:, 0]), ab, rb)
    keep &= rr > 1.07
front = Pf[:, 1] < HY
keep &= ~(front & ((Pf[:, 0] / (.064 * _NSX * W)) ** 2 + ((Pf[:, 2] - NZ) / (.038 * _NSZ * W)) ** 2 < 1))
keep &= ~(front & ((Pf[:, 0] / ((MOUTH_LOOPS[-1][0] + .008) * W)) ** 2 + ((Pf[:, 2] - MZ) / ((MOUTH_LOOPS[-1][1] + .008) * W)) ** 2 < 1))
pts.extend([tuple(p) for p in dom[keep]])
fill0 = len(pts) - int(keep.sum())
def in_poly(P, poly):
    x = P[:, 0]; y = P[:, 1]; inside = np.zeros(len(P), bool); n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        inside ^= ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-30) + x1)
    return inside
def skin_cdt(pts):
    res = delaunay_2d_cdt([Vector(p) for p in pts], cons, [], 0, 1e-9)
    vout, fout, orig_v = res[0], res[2], res[3]
    if len(vout) != len(pts):
        def segs(tag):
            L = np.array([pts[i] for i in tags[tag]]); return L, np.roll(L, -1, 0)
        tl = [t for t in tags if t != 'nose_c']
        for i in range(len(tl)):
            for j in range(i + 1, len(tl)):
                A0, A1 = segs(tl[i]); B0, B1 = segs(tl[j]); d1 = A1 - A0; d2 = B1 - B0
                den = d1[:, None, 0] * d2[None, :, 1] - d1[:, None, 1] * d2[None, :, 0]; w_ = B0[None, :, :] - A0[:, None, :]
                ta = (w_[..., 0] * d2[None, :, 1] - w_[..., 1] * d2[None, :, 0]) / (den + 1e-30)
                tb = (w_[..., 0] * d1[:, None, 1] - w_[..., 1] * d1[:, None, 0]) / (den + 1e-30)
                k_ = ((ta > 0) & (ta < 1) & (tb > 0) & (tb < 1)).sum()
                if k_: print('LOOP_XING', tl[i], tl[j], k_, flush=True)
    assert len(vout) == len(pts), ('CDT added or merged vertices: constraint loops intersect', len(vout), len(pts))
    out_of = {}
    for oi, lst in enumerate(orig_v):
        for k in lst: out_of[k] = oi
    dom_out = np.array([[v.x, v.y] for v in vout]); F = np.array([list(f) for f in fout])
    cent = dom_out[F].mean(1); hole = np.zeros(len(F), bool)
    for s in (-1, 1):
        hole |= in_poly(cent, dom_out[[out_of[k] for k in tags['eye%d_0' % s]]])
    return dom_out, F[~hole], out_of

# ---- adaptive refinement for the game's hard toon band (as Rosie / Moka): the band follows the normal interpolated across
# each triangle, so its misplacement on the skin is (interpolation error) / (how fast the normal turns there). Points are
# inserted where that band displacement is largest; the surface itself is unchanged (every vertex sits on the field).
from mathutils.kdtree import KDTree
def eye_ring_rr(dp):
    best = np.full(len(dp), 9.)
    for s in (-1, 1):
        c, base = eye_dom[s]
        outer = np.array([pts[i] for i in tags['eye%d_%d' % (s, len(EYE_SCALES) - 1)]])
        ang_b = np.arctan2(outer[:, 1] - c[1], outer[:, 0] - c[0]); rad_b = np.linalg.norm(outer - c, axis=1)
        order = np.argsort(ang_b); ab = np.concatenate([ang_b[order] - 2 * PI, ang_b[order], ang_b[order] + 2 * PI]); rb = np.tile(rad_b[order], 3)
        v = dp - c; best = np.minimum(best, np.linalg.norm(v, axis=1) / np.interp(np.arctan2(v[:, 1], v[:, 0]), ab, rb))
    return best
BARY = np.array([[1 / 3, 1 / 3, 1 / 3], [.6, .2, .2], [.2, .6, .2], [.2, .2, .6], [.5, .5, 0], [.5, 0, .5], [0, .5, .5],
                 [.45, .45, .1], [.45, .1, .45], [.1, .45, .45]])
def tri_errors(dom_out, F):
    Pv = radial_hit_outer(from_dom(dom_out)); Nv = grad_n(Pv); Pt = Pv[F]; Nt = Nv[F]
    nm = unit(Nt.mean(1)); seen = np.maximum(-nm[:, 1], -.707 * nm[:, 1] + .707 * nm[:, 2]) > .05
    vis = (Pt[:, :, 1] < HY + .01).all(1) & (Pt[:, :, 2] > CHIN - .12 * W).all(1) & seen
    err = np.zeros(len(F)); disp = np.zeros(len(F)); idx = np.where(vis)[0]
    q = np.einsum('kj,tjc->tkc', BARY, Pt[idx]); nq = np.einsum('kj,tjc->tkc', BARY, Nt[idx])
    nq /= np.linalg.norm(nq, axis=2, keepdims=True); d = unit((q - O).reshape(-1, 3))
    sp = radial_hit_outer(d)
    le = np.max([np.linalg.norm(Pt[idx, i] - Pt[idx, (i + 1) % 3], axis=1) for i in range(3)], 0)
    fold = np.linalg.norm(sp.reshape(q.shape) - q, axis=2).max(1) > np.maximum(.002, .3 * le)
    qq = q.reshape(-1, 3).copy()
    for _ in range(3): qq = qq - head_sdf(qq)[:, None] * grad_n(qq)
    a_ = grad_n(qq).reshape(q.shape)
    e = np.arccos(np.clip((a_ * nq).sum(2), -1, 1)).max(1)
    kap = np.full(len(idx), 2.0)
    for i, j in ((0, 1), (1, 2), (2, 0)):
        ang_ = np.arccos(np.clip((Nt[idx, i] * Nt[idx, j]).sum(1), -1, 1)); ln = np.linalg.norm(Pt[idx, i] - Pt[idx, j], axis=1)
        kap = np.maximum(kap, ang_ / np.maximum(ln, 1e-5))
    err[idx] = np.degrees(e); disp[idx] = e / kap * 1000
    vis[idx[fold]] = False
    return err, disp, vis, Pv
def stats_(err, disp, vis):
    return {'visible_tris': int(vis.sum()), 'err_mean_deg': round(float(err[vis].mean()), 3), 'err_p90_deg': round(float(np.percentile(err[vis], 90)), 3),
            'band_disp_p90_mm': round(float(np.percentile(disp[vis], 90)), 3), 'band_disp_p99_mm': round(float(np.percentile(disp[vis], 99)), 3),
            'band_disp_max_mm': round(float(disp[vis].max()), 3)}
REFINE_ADD = int(os.environ.get('REFINE_ADD', '160')); D_LOW, D_T = .12, float(os.environ.get('REFINE_DT', '.45'))
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
loop_of = {(min(L[i], L[(i + 1) % len(L)]), max(L[i], L[(i + 1) % len(L)])): tg for tg, L in tags.items() if len(L) > 1 for i in range(len(L))}
fixed_pts = set(k for tg in ('bound',) for k in tags[tg])
for it in range(60):
    dom_out, F, out_of = skin_cdt(pts); err, disp, vis, Pv = tri_errors(dom_out, F)
    bad = np.where(vis & (disp > D_T))[0]
    if not len(bad) or n_add >= budget: break
    bad = bad[np.argsort(-disp[bad])]
    kd = KDTree(len(Pv))
    for i_, p_ in enumerate(Pv): kd.insert(p_, i_)
    kd.balance()
    taken = []; taken_p = []; splits = {}
    in_of = {oi: k for k, oi in out_of.items()}
    for t in bad:
        if len(taken) + len(splits) >= min(max(60, budget // 8), budget - n_add): break
        f = F[t]; le_ = [np.linalg.norm(Pv[f[i]] - Pv[f[(i + 1) % 3]]) for i in range(3)]; le = max(le_)
        c_ = dom_out[f].mean(0); cp = Pv[f].mean(0)
        i = int(np.argmax(le_)); ka, kb = in_of[f[i]], in_of[f[(i + 1) % 3]]; key = (min(ka, kb), max(ka, kb))
        mp = (dom_out[f[i]] + dom_out[f[(i + 1) % 3]]) / 2; mq = (Pv[f[i]] + Pv[f[(i + 1) % 3]]) / 2
        if key in splits or any(np.linalg.norm(mq - q_) < .45 * le for q_ in taken_p): continue
        lp = loop_of.get(key)
        if (lp is None and (ka in fixed_pts or kb in fixed_pts)) or (lp is not None and lp == 'bound'):
            if eye_ring_rr(c_[None])[0] > .72 and kd.find(cp)[2] >= .30 * le and not any(np.linalg.norm(cp - q_) < .45 * le for q_ in taken_p):
                taken.append(c_); taken_p.append(cp)
            continue
        splits[key] = (mp, lp); taken_p.append(mq)
    if not taken and not splits: break
    pts.extend([tuple(c_) for c_ in taken]); n_add += len(taken)
    for (ka, kb), (mp, lp) in splits.items():
        km = len(pts); pts.append(tuple(mp)); n_add += 1
        if lp is not None:
            L = tags[lp]; ia, ib = L.index(ka), L.index(kb)
            if (ia + 1) % len(L) == ib: L.insert(ia + 1, km)
            else: L.insert(ib + 1, km)
    cons[:] = [(L[i], L[(i + 1) % len(L)]) for tg, L in tags.items() if len(L) > 1 for i in range(len(L))]
    loop_of = {(min(L[i], L[(i + 1) % len(L)]), max(L[i], L[(i + 1) % len(L)])): tg for tg, L in tags.items() if len(L) > 1 for i in range(len(L))}
dom_out, Fh, out_of = skin_cdt(pts); err, disp, vis, Pv = tri_errors(dom_out, Fh)
LOG['head_refine'] = {'dropped': len(drop), 'added': n_add, **stats_(err, disp, vis)}
print('HEAD_REFINE', json.dumps(LOG['head_refine_before']), json.dumps(LOG['head_refine']), flush=True)

skin_d = from_dom(dom_out); skin_p = radial_hit_outer(skin_d); skin_n = grad_n(skin_p)
verts = [tuple(p) for p in skin_p]; vdir = list(skin_d); vnorm = list(skin_n); faces = [tuple(f) for f in Fh]
bound = [out_of[k] for k in tags['bound']]; prev = bound
for a in [128, 136, 145, 155, 165, 174]:
    A = math.radians(a)
    d = np.stack([np.sin(A) * np.cos(psiB), -np.cos(A) * np.ones(NB), np.sin(A) * np.sin(psiB)], -1)
    p = radial_hit_outer(d); nn = grad_n(p); i0 = len(verts)
    verts += [tuple(v) for v in p]; vdir += list(d); vnorm += list(nn)
    cur = list(range(i0, i0 + NB))
    for i in range(NB): faces.append((prev[i], prev[(i + 1) % NB], cur[(i + 1) % NB], cur[i]))
    prev = cur
pd = np.array([[0, 1., 0]]); pp = radial_hit_outer(pd); pole = len(verts)
verts.append(tuple(pp[0])); vdir.append(pd[0]); vnorm.append(grad_n(pp)[0])
for i in range(NB): faces.append((prev[i], prev[(i + 1) % NB], pole))
roll_info = {}
for s in (-1, 1):       # eyelid roll: the hole edge tucks 4.5 mm into the head behind the lens globe
    rim = [out_of[k] for k in tags['eye%d_0' % s]]
    E = np.array([s * EX, float(front_hit(s * EX, EZ)[0]), EZ]); i0 = len(verts)
    rr = []
    for k, vi in enumerate(rim):
        P = np.array(verts[vi]); n = np.array(vnorm[vi]); t = E - P; t = t - n * (t @ n); t /= np.linalg.norm(t)
        verts.append(tuple(P - .0045 * SW * n + .0016 * SW * t)); vdir.append(vdir[vi]); vnorm.append(n.copy() if RIG else unit(.30 * n + t)); rr.append(i0 + k)      # rig: the rim roll shades as the skin (no grey ring on white fur)
    nr_ = len(rim)
    for k in range(nr_): faces.append((rim[k], rim[(k + 1) % nr_], rr[(k + 1) % nr_], rr[k]))
    roll_info[s] = (rim, rr)
vdir = np.array(vdir); vnorm = np.array(vnorm); verts_np = np.array(verts)
huv = au('head', *head_uv(unit(vdir)).T)
UVF = []
for f in faces:      # per-corner UVs: the back pole takes the angle of its own fan triangle (no chord across the chart)
    if pole in f:
        o = [v for v in f if v != pole]; dm = unit(vdir[o].mean(0)[None])[0]; dm[1] = 0; dm = unit(dm[None])[0]
        pu = au('head', *head_uv(np.array([[dm[0] * 1e-3, 1., dm[2] * 1e-3]]) / np.linalg.norm([dm[0] * 1e-3, 1., dm[2] * 1e-3])).T)[0]
        UVF.append(tuple(pu if v == pole else huv[v] for v in f))
    else: UVF.append(tuple(huv[v] for v in f))
skin = make_obj('ball_head_skin', verts_np, faces, UVF, 'head', N=vnorm)
LOG['skin_vertices'] = len(verts); LOG['skin_faces'] = len(faces)

print('STEP eyes', flush=True)
# ============================================================== EYES: flush lens globes following the ball
ES = [0, .16, .32, .48, .62, .74, .84, .92, .97, 1.10]
NSEG = 26
eye_centers = {}
def eye_h(k): return (.0024 - .0060 * k * k) * SW
for s, tag in ((-1, 'R'), (1, 'L')):
    psi = np.linspace(0, 2 * PI, NSEG, endpoint=False); rows = []
    cx = s * EX; Sc = np.array([cx, float(front_hit(cx, EZ)[0]), EZ]); axis = grad_n(Sc[None])[0]
    for k in ES:
        if k == 0: x = np.array([cx]); z = np.array([EZ])
        else: x, z = eye_xz(s, psi, k)
        y = front_hit(x, z); S = np.stack([x, y, z], -1); n = grad_n(S); rows.append(S + n * eye_h(k))
    rim = rows[-1]
    for depth, sc in [(.012 * SW, .86), (.024 * SW, .58)]: rows.append(Sc + (rim - Sc) * sc - axis * depth)
    tip = Sc - axis * .032 * SW
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
    UVa = np.array(UVs); make_obj('eyeball.' + tag, np.array(V), fs, au('eye.' + tag, UVa[:, 0], UVa[:, 1]), 'eye.' + tag)
    eye_centers[tag] = [float(v) for v in (Sc - axis * .016 * SW)]
    LOG['eye_axis_' + tag] = {'out_deg': round(math.degrees(math.atan2(s * axis[0], -axis[1])), 1),
                              'down_deg': round(math.degrees(math.asin(-axis[2])), 1)}


# ============================================================== LASH RIBBONS: the upper lash line, its wing and a flick (own objects)
# A flattened tapered tube lying on the skin along the opening's upper rim (its lower edge tucked just over the lens rim),
# thin at the nasal corner, thickest over the top-outer part, carried past the outer corner into the sheet's wing (A: tip at
# (1.45, 0.52) eye radii; B (1.40, 0.50)), plus the sheet's second, shorter flick standing up off the top-outer rim (tip at about
# (1.05, 0.98)). <= 0.0075 W proud. Separate objects, origin at the eye centre, so the rig can hang them on the upper lids.
def lash_th(psi):
    """the upper lash line's full width (eye radii) along the rim angle psi (0 = the outer side, pi/2 = the top)"""
    return (.055 + .160 * np.sin(np.clip(psi, 0, PI)) ** .6 + .080 * np.exp(-((psi - .75) / .45) ** 2)) * smooth(PI + .10, PI - .45, psi)
WING_TIP = np.array([1.45, .52]) if DESIGN == 'a' else np.array([1.40, .50])
def lash_centre():
    psi = np.linspace(2.86, .36, 26); th = np.maximum(lash_th(psi), .045)
    ux, uz = eye_unit(psi); rr = 1 + th / 2 - .045
    A = np.stack([ux * rr, uz * rr], -1)
    w0 = A[-1]
    wing = np.array([w0 + (WING_TIP - w0) * t_ + np.array([0, .03 * math.sin(PI * t_)]) for t_ in np.linspace(0, 1, 7)[1:]])
    hwing = th[-1] / 2 * (1 - np.linspace(0, 1, 7)[1:] ** 1.4 * .72)
    return np.vstack([A, wing]), np.concatenate([th / 2, hwing])
def flick_centre():
    p0 = .95; ux, uz = eye_unit(np.array([p0])); r0 = 1 + lash_th(np.array([p0]))[0] * .35
    a = np.array([ux[0] * r0, uz[0] * r0]); b = np.array([1.06, .99])
    t_ = np.linspace(0, 1, 6); C = a[None] + (b - a)[None] * t_[:, None] + np.array([.03, -.02])[None] * np.sin(PI * t_)[:, None]
    return C, .060 * (1 - .70 * t_ ** 1.3) + .012
LASH_C2, LASH_HW = lash_centre()
FLICK_C2, FLICK_HW = flick_centre()
def eye_pt(s, X, Z):
    """eye units (X > 0 outer) -> skin point, its normal"""
    x = s * EX + s * EHW * np.asarray(X, float); z = EZ + EHH * np.asarray(Z, float)
    y = front_hit(x, z); S_ = np.stack([x, y, z], -1); return S_, grad_n(S_)
lash_info = {}; NLS = 6
def lash_tube(s, C2, HWr, hp_max):
    NLT = len(C2) - 1; tt = np.linspace(0, 1, NLT + 1)
    S_, n_ = eye_pt(s, C2[:, 0], C2[:, 1])
    tg = np.gradient(S_, axis=0); tg = unit(tg - n_ * (tg * n_).sum(1, keepdims=True)); sd = unit(np.cross(n_, tg))
    hw = HWr * EHH
    hp = hp_max * (.55 + .45 * smooth(0, .25, tt)) * (1 - .60 * smooth(.80, 1.0, tt))
    V = []; NV = []
    for i in range(NLT + 1):
        for k in range(NLS):
            a = 2 * PI * k / NLS; ca, sa = math.cos(a), math.sin(a)
            up = hp[i] * (sa if sa > 0 else .40 * sa)
            V.append(S_[i] + sd[i] * hw[i] * ca + n_[i] * (up - .0010 * W))
            NV.append(unit(sd[i] * ca / max(hw[i], 1e-4) + n_[i] * sa / max(hp[i], 1e-4)))
    V = np.array(V); NV = np.array(NV)
    tip = len(V); V = np.vstack([V, S_[-1] + tg[-1] * hw[-1] * .7 + n_[-1] * (.25 * hp[-1])]); NV = np.vstack([NV, tg[-1]])
    root = len(V); V = np.vstack([V, S_[0] - tg[0] * hw[0] * .8 + n_[0] * (.2 * hp[0])]); NV = np.vstack([NV, -tg[0]])
    F = []
    for i in range(NLT):
        for k in range(NLS):
            a_, b_ = i * NLS + k, i * NLS + (k + 1) % NLS; F.append((a_, b_, b_ + NLS, a_ + NLS))
    for k in range(NLS): F.append((NLT * NLS + k, NLT * NLS + (k + 1) % NLS, tip))
    for k in range(NLS): F.append(((k + 1) % NLS, k, root))
    return V, F, NV, S_, hp
for s, tag in ((-1, 'R'), (1, 'L')):
    V1, F1, N1, S1, hp1 = lash_tube(s, LASH_C2, LASH_HW, .0070 * W)
    V2, F2, N2, S2, hp2 = lash_tube(s, FLICK_C2, FLICK_HW, .0050 * W)
    V = np.vstack([V1, V2]); NV = np.vstack([N1, N2]); F = F1 + [tuple(i + len(V1) for i in f) for f in F2]
    make_obj('lash.' + tag, V, F, ramp_uv('lash', sval(NV, 0., hi=.30, lo=.10)), 'lash.' + tag, N=NV)
    lash_info[tag] = dict(tip=[round(float(v), 4) for v in S1[-1]], root=[round(float(v), 4) for v in S1[0]], flick_tip=[round(float(v), 4) for v in S2[-1]],
                          max_proud_W=round(float(hp1.max() / W), 4))
LOG['lash'] = lash_info


def vnormals(V, F):
    """area-weighted vertex normals of a polygon mesh (numpy), for ramp shading of parametric parts"""
    V = np.asarray(V, float); N = np.zeros_like(V)
    for f in F:
        f = list(f)
        for k in range(1, len(f) - 1):
            n_ = np.cross(V[f[k]] - V[f[0]], V[f[k + 1]] - V[f[0]])
            for i in (f[0], f[k], f[k + 1]): N[i] += n_
    return unit(N)

def cube_sphere(n):
    """unit-sphere points and quads from a subdivided cube (even triangles, no poles)"""
    t = np.tan(np.linspace(-PI / 4, PI / 4, n + 1)); V = []; F = []; key = {}
    def vid(p):
        k = tuple(np.round(p, 6))
        if k not in key: key[k] = len(V); V.append(unit(np.asarray(p, float)))
        return key[k]
    for axis in range(3):
        for sgn in (-1, 1):
            for i in range(n):
                for j in range(n):
                    q = []
                    for (a, b) in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)):
                        p = np.zeros(3); p[axis] = sgn; p[(axis + 1) % 3] = t[a]; p[(axis + 2) % 3] = t[b]
                        q.append(vid(p))
                    F.append(tuple(q) if sgn > 0 else tuple(q[::-1]))
    return np.array(V), F

print('STEP ears', flush=True)
# ============================================================== EARS
def head_nn(q): return head_local(q, neck=False)
ear_info = {}
if DESIGN == 'a':
    # ---- A: long drooping ears. Each is a thick paddle swept along a curved centreline (bend loops), rooted inside the skull's
    # top corner, leaving it there and hanging out and down beside the cheeks to the chin line. The section is a fat
    # superellipse: thin across (the front view, ~0.15 W thick) and broad fore-aft (the side view, up to 0.55 W), widening
    # down the ear into a round blunt bottom; the broad face turns 18 deg toward the front, so the front view shows ~0.30 W.
    # the sheet (measure-a.md): roots at the head's top corners (x 0.29-0.40 W, z 0.82 W), outer edges +-0.79 W at z 0.21,
    # bottoms at (+-0.61 W, 0.05 W); the side view: the ear 0.32 m fore-aft over the back half of the head's side.
    def _onskull(x, y, z, off):
        """a point off W out from the skull along the ray from (0, y, 0.40) through (x, y, z)"""
        c0 = np.array([0, y, .40]); d = unit(np.array([x, y, z]) - c0); name_hint[0] = 'ear root'
        return ray_outer(head_nn, c0[None], d[None], 1.2)[0] + d * off
    # the root leaves the skull's top corner almost radially from deep inside (round 1: a centreline arcing over the corner stood
    # up as a knob; one running along it grazed out of the skin in slivers the game's outline picked up), then hangs beside the cheek
    LOP = dict(pts=[_onskull(.150, .095, .560, -.140), _onskull(.300, .100, .750, -.050), _onskull(.400, .110, .790, .016),
                    (.505, .126, .680), (.552, .138, .590), (.592, .155, .440), (.604, .175, .265), (.592, .190, .110), (.568, .196, .030)],
               hw=.074, ht=.270, ht0=.125, NS=24, P=2.25, turn=-31.)
    _cp = cpath(LOP['pts'], 200); _sl = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(_cp, axis=0), axis=1))])
    LOP_L = float(_sl[-1])
    def lop_path(t):
        s_ = np.asarray(t, float) * LOP_L; return np.stack([np.interp(s_, _sl, _cp[:, k]) for k in range(3)], -1)
    def lop_prof(t):
        e = LOP; t = np.asarray(t, float)
        tip = np.where(t > .80, np.sqrt(clamp(1 - ((t - .80) / .20) ** 2)), 1.)          # a round, blunt bottom
        hw = e['hw'] * (.50 + .50 * smooth(.0, .32, t)) * np.maximum(tip, 1e-3) ** .55          # a slimmer buried root (round 2: no grazing slivers)
        ht = (e['ht0'] * (.55 + .45 * smooth(.0, .24, t)) + (e['ht'] - e['ht0']) * smooth(.05, .72, t)) * np.maximum(tip, 1e-3)
        return hw, ht
    def lop_frames(ts):
        P = lop_path(ts); T = unit(np.gradient(P, axis=0))
        out0 = np.array([1., 0, 0])
        Ax = unit(out0[None] - T * (T @ out0)[:, None])                     # across (outward from the head)
        Fd = unit(np.cross(T, Ax))                                          # fore-aft
        if Fd[len(ts) // 2, 1] > 0: Fd = -Fd                                 # Fd points to the front (-y)
        ang = np.radians(LOP['turn']) * smooth(.10, .45, ts)                 # the broad outer face turns toward the front
        A2 = Ax * np.cos(ang)[:, None] - Fd * np.sin(ang)[:, None]; F2 = Ax * np.sin(ang)[:, None] + Fd * np.cos(ang)[:, None]
        return P, T, A2, F2
    LOP_TS = np.concatenate([np.linspace(0, .80, 21)[:-1], .80 + .20 * np.sin(np.linspace(0, PI / 2, 9))[:-1]])
    def build_lop():
        e = LOP; NS = e['NS']; P = e['P']; ts = LOP_TS
        Pc, T, A2, F2 = lop_frames(ts)
        th = np.linspace(0, 2 * PI, NS, endpoint=False)                     # th = 0: the outer face (+A2); pi: the inner face
        ca = spow(np.cos(th), 2 / P); sa = spow(np.sin(th), 2 / P)
        rings = []
        for j, t in enumerate(ts):
            hw, ht = lop_prof(t)
            rings.append(Pc[j][None] + (ca * hw)[:, None] * A2[j][None] + (sa * ht)[:, None] * F2[j][None])
        rings = np.array(rings); R = len(ts)
        V = list(rings.reshape(-1, 3)); F = []; UVc = []
        for j in range(R - 1):
            for i in range(NS):
                a = j * NS + i; b = j * NS + (i + 1) % NS
                F.append((a, b, b + NS, a + NS)); UVc.append(((i / NS, ts[j]), ((i + 1) / NS, ts[j]), ((i + 1) / NS, ts[j + 1]), (i / NS, ts[j + 1])))
        endp = lop_path(np.array([1.]))[0]
        tip = len(V); V.append(endp)
        for i in range(NS):
            a = (R - 1) * NS + i; b = (R - 1) * NS + (i + 1) % NS
            F.append((a, b, tip)); UVc.append(((i / NS, ts[-1]), ((i + 1) / NS, ts[-1]), ((i + .5) / NS, 1.)))
        bot = len(V); V.append(Pc[0] - T[0] * .03)
        for i in range(NS):
            a = i; b = (i + 1) % NS
            F.append((b, a, bot)); UVc.append((((i + 1) / NS, 0.), (i / NS, 0.), ((i + .5) / NS, 0.)))
        V = np.array(V)
        f0 = F[NS * 8]; n0 = np.cross(V[f0[1]] - V[f0[0]], V[f0[2]] - V[f0[0]])
        if n0 @ (V[f0[0]] - Pc[8]) < 0:
            F = [tuple(f[::-1]) for f in F]; UVc = [tuple(u[::-1]) for u in UVc]
        return V, F, UVc
    _Ve, _Fe, _UVe = build_lop()
    for side, tag in ((1, 'L'), (-1, 'R')):
        V_ = _Ve.copy(); F_ = _Fe; UV_ = _UVe
        if side < 0:
            V_[:, 0] *= -1; F_ = [tuple(f[::-1]) for f in _Fe]; UV_ = [tuple(u[::-1]) for u in _UVe]
        UVa = [tuple(tuple(au('ear', u, v)) for (u, v) in f) for f in UV_]
        make_obj('lop_ear.' + tag, L2M(V_), F_, UVa, 'ear.' + tag)
        mir = np.array([side, 1, 1.])
        ear_info[tag] = {'base': L2M(lop_path(np.array([.10]))[0] * mir).tolist(), 'mid': L2M(lop_path(np.array([.50]))[0] * mir).tolist(),
                         'tip': L2M(lop_path(np.array([1.]))[0] * mir).tolist()}

    print('STEP leaf', flush=True)
    # ============================================================== A: THE LEAF on the head's top corner by her left ear (+X)
    # one thick flattened oval leaf (0.40 x 0.20 W, 0.06 W thick) with a shallow central groove, lying on the skull's top-side over
    # the ear's root, its tip pointing out and down (the sheet's front view: centre (+0.39 W, 0.79 W), long axis ~40 deg down);
    # it faces up, out and a little forward, so it reads from 45 deg above
    _ld = unit(np.array([.50, -.28, .80]))
    _lo = M2L(O[None])[0]
    name_hint[0] = 'leaf base'
    _lp = ray_outer(head_nn, _lo[None], _ld[None], 1.2)[0]; _ln = grad(head_nn, _lp[None])[0]
    LF_N = unit(_ln + np.array([.05, -.22, .05]))
    _ax = np.array([.70, -.12, -.70]); LF_U = unit(_ax - LF_N * (_ax @ LF_N)); LF_V = np.cross(LF_N, LF_U)
    LF_A, LF_B, LF_C = .210, .125, .032
    LF_C0 = _lp + LF_N * (LF_C * .70) + LF_U * .040
    def leaf_sdf(p):
        q = (M2L(p) - LF_C0) @ np.array([LF_U, LF_V, LF_N]).T
        u_, v_, w_ = q[:, 0], q[:, 1], q[:, 2]
        tb = 1 - .30 * smooth(-.05, .22, u_)                                  # narrower toward the tip
        tw = 1 - .45 * smooth(-.05, .22, u_)
        r = np.sqrt((u_ / LF_A) ** 2 + (v_ / (LF_B * tb)) ** 2 + (w_ / (LF_C * tw)) ** 2)
        d = (r - 1) * LF_C * .9
        groove = .0070 * np.exp(-(v_ / .016) ** 2) * smooth(-.004, .012, w_) * (1 - smooth(.10, .19, np.abs(u_)))
        return (d + groove) * W
    def leaf_uv(NN, V):
        q = (M2L(V) - LF_C0) @ np.array([LF_U, LF_V, LF_N]).T
        vein = np.exp(-(q[:, 1] / .012) ** 2) * (q[:, 2] > 0) * .10
        return ramp_uv('leaf', sval(NN, hi=.30, occ=vein))
    star_mesh('leaf', leaf_sdf, L2M(LF_C0), 'leaf', leaf_uv, nth=18, nph=30, tmax=.25 * W, axis=LF_U, ref=LF_N)
    HAT_ANCHOR = L2M(LF_C0)
    HAT_GROUP = 'leaf'
    LOG['leaf'] = {'centre_W': [round(float(c), 3) for c in LF_C0], 'normal': [round(float(c), 3) for c in LF_N]}
else:
    # ---- C: thick rounded-triangle ears, each a ring stack along its axis U (bend loops), a chunky superellipse cross-section
    # (across A, depth Nf) tapering from a broad base to a rounded tip; the base is buried in the skull's upper corner and the
    # outer edge carries on the head's side line; the front (Nf, turned 10 deg outward) has a recessed tan panel.
    # the sheet (measure-c.md): tips at (+-0.33 W, 0.86 W), the base from x 0.12 (inner, z 0.69) to 0.46 W (outer, z 0.47);
    # the tan panel x 0.19-0.38 W, z 0.56-0.79 W; the side view: ~0.25 W fore-aft at the base, a little behind the head centre.
    EAR = dict(base=(.250, .070, .545), dir=(.100, -.010, .300), L=.325, hw=.195, ht=.090, tm=.60, face_out=14., P=2.4,
               NS=24, depth=.020, rim=.048, tipm=.075)
    def ear_frame():
        e = EAR; U = unit(np.array(e['dir'], float)); fo = math.radians(e['face_out'])
        Nf = np.array([math.sin(fo), -math.cos(fo), 0.]); Nf = unit(Nf - U * (U @ Nf)); A = unit(np.cross(U, Nf))
        return np.array(e['base'], float), U, Nf, A
    def ear_prof(t):
        e = EAR; t = np.asarray(t, float)
        g = (1 - .74 * t) * np.where(t < e['tm'], 1., np.sqrt(clamp(1 - ((t - e['tm']) / (1 - e['tm'])) ** 2)) ** .8)
        return e['hw'] * np.maximum(g, 1e-3), e['ht'] * (1 - .32 * t) * np.maximum(np.where(t < .88, 1., np.sqrt(clamp(1 - ((t - .88) / .12) ** 2))), 1e-3) ** .5
    _EO_T = np.linspace(0, 1, 121)
    def _ear_outline():
        hw, _ = ear_prof(_EO_T); a = np.concatenate([hw, -hw[::-1]]); h = np.concatenate([_EO_T, _EO_T[::-1]]) * EAR['L']
        return np.stack([a, h], -1)
    def ear_dist(na, t):
        """distance (W) from a front-face point (across a = na hw(t), along h = t L) to the ear's side and tip outline"""
        O_ = _ear_outline(); A0 = O_[:-1]; A1 = O_[1:]
        hw, _ = ear_prof(t); P = np.stack([np.ravel(na * hw), np.ravel(t * EAR['L'])], -1); best = np.full(len(P), 9.)
        for i in range(len(A0)):
            d_ = A1[i] - A0[i]; L2 = d_ @ d_ + 1e-12; u_ = np.clip(((P - A0[i]) @ d_) / L2, 0, 1)
            best = np.minimum(best, np.linalg.norm(P - (A0[i] + u_[:, None] * d_), axis=1))
        return best.reshape(np.shape(na))
    def ear_pan(na, t):
        """signed distance (W) inside the tan panel: the side rim and a deeper margin under the tip, rounded together"""
        e = EAR; t = np.asarray(t, float)
        return smin(ear_dist(na, t) - e['rim'], (1 - t) * e['L'] - e['tipm'], .030)
    def build_ear():
        e = EAR; B, U, Nf, A = ear_frame(); P = e['P']; NS = e['NS']
        ts = np.concatenate([np.linspace(0, .80, 19)[:-1], .80 + .20 * np.sin(np.linspace(0, PI / 2, 9))[:-1]])
        th = np.linspace(0, 2 * PI, NS, endpoint=False)
        na = spow(np.sin(th), 2 / P); nb = spow(-np.cos(th), 2 / P)          # th = 0: the back (-Nf); th = pi: the front centre
        rings = []
        for t in ts:
            hw, ht = ear_prof(t)
            rec = e['depth'] * smoother(-.012, .026, ear_pan(na, np.full(len(na), t))) * (nb > 0)
            rings.append(B + U * (e['L'] * t) + np.outer(na * hw, A) + np.outer(nb * ht - rec, Nf))
        rings = np.array(rings); R = len(ts)
        V = list(rings.reshape(-1, 3)); F = []; UVc = []
        for j in range(R - 1):
            for i in range(NS):
                a = j * NS + i; b = j * NS + (i + 1) % NS
                F.append((a, b, b + NS, a + NS)); UVc.append(((i / NS, ts[j]), ((i + 1) / NS, ts[j]), ((i + 1) / NS, ts[j + 1]), (i / NS, ts[j + 1])))
        tip = len(V); V.append(B + U * e['L'])
        for i in range(NS):
            a = (R - 1) * NS + i; b = (R - 1) * NS + (i + 1) % NS
            F.append((a, b, tip)); UVc.append(((i / NS, ts[-1]), ((i + 1) / NS, ts[-1]), ((i + .5) / NS, 1.)))
        bot = len(V); V.append(B - U * .02)
        for i in range(NS):
            a = i; b = (i + 1) % NS
            F.append((b, a, bot)); UVc.append((((i + 1) / NS, 0.), (i / NS, 0.), ((i + .5) / NS, 0.)))
        V = np.array(V)
        f0 = F[NS * 6]; n0 = np.cross(V[f0[1]] - V[f0[0]], V[f0[2]] - V[f0[0]])
        if n0 @ (V[f0[0]] - (B + U * (e['L'] * ts[6]))) < 0:
            F = [tuple(f[::-1]) for f in F]; UVc = [tuple(u[::-1]) for u in UVc]
        return V, F, UVc, dict(B=B, U=U, Nf=Nf, A=A)
    _Ve, _Fe, _UVe, _ei = build_ear()
    for side, tag in ((1, 'L'), (-1, 'R')):
        V_ = _Ve.copy(); F_ = _Fe; UV_ = _UVe
        if side < 0:
            V_[:, 0] *= -1; F_ = [tuple(f[::-1]) for f in _Fe]; UV_ = [tuple(u[::-1]) for u in _UVe]
        UVa = [tuple(tuple(au('ear', u, v)) for (u, v) in f) for f in UV_]
        make_obj('shiba_ear.' + tag, L2M(V_), F_, UVa, 'ear.' + tag)
        mir = np.array([side, 1, 1.])
        ear_info[tag] = {'base': L2M(_ei['B'] * mir).tolist(), 'mid': L2M((_ei['B'] + _ei['U'] * EAR['L'] * .5) * mir).tolist(),
                         'tip': L2M((_ei['B'] + _ei['U'] * EAR['L']) * mir).tolist()}
    HAT_ANCHOR = L2M(np.array([0, 0, SK['zc'] + SK['cu']]))
    HAT_GROUP = 'nohat'                       # no head accessory (no part is in this group)

if HEAD_ONLY:
    BODY_PAINTERS = {}; BODY_PIVOTS = {}; JOINTS_BODY = {}
else:
    # ============================================================== BODY AND COSTUME (metres; body axis x = 0, y = 0)
    # the sheet (measure-<x>.md, metres from the upper-row front views at 327.6 px / m):
    # A: shirt sleeves z 0.43-0.58 out to +-0.273; overalls bib top 0.485 (+-0.153), trousers +-0.232 at z 0.25-0.30, rolled cuffs
    #    +-0.244 at z 0.153-0.235; straps 0.05 wide at x +-0.123, buttons 0.067 at (+-0.116, 0.47); pocket 0.269 x 0.15 at z 0.259-
    #    0.409; feet 0.27 wide, 0.14 high; tail 0.15 across at z 0.33.
    # B: smock sleeves z 0.43-0.52 out to +-0.293, the bell's hem +-0.293 at z 0.128; apron bib band z 0.406-0.479 (+-0.198), skirt
    #    z 0.177-0.406 (+-0.19-0.215), U pocket 0.253 x 0.137 at z 0.229-0.366, straps 0.07 wide at x +-0.113, a broad rear
    #    fastening panel z 0.37-0.48; feet 0.25 wide, 0.12 high; tail 0.15 across at z 0.22.
    def ramp_fn(name, hi=.28, occ=0., add=0.):
        return lambda NN, V, *a: ramp_uv(name, sval(NN, occ=occ, hi=hi) + add)
    def ramp_sw(name, hi=.28, occ=0., add=0.):
        return lambda NV, tt, uu, V: ramp_uv(name, sval(NV, occ=occ, hi=hi) + add)
    BODY_OBS = {}
    def surf_y(f, x, z, front=True, y0=0., y1=.45):
        """y of the surface of field f at (x, z) along -y (front) or +y (back), by bisection"""
        sgn = -1. if front else 1.; x = np.atleast_1d(np.asarray(x, float)); z = np.atleast_1d(np.asarray(z, float))
        lo = np.full(len(x), y0); hi = np.full(len(x), y1)
        for _ in range(40):
            m = (lo + hi) / 2; ins = f(np.stack([x, sgn * m, z], -1)) < 0
            lo = np.where(ins, m, lo); hi = np.where(ins, hi, m)
        return sgn * (lo + hi) / 2
    from mathutils.bvhtree import BVHTree as _BVH
    def bvh_of(obs):
        V = []; Pp = []
        for ob in obs:
            o = len(V); V += [tuple(v.co) for v in ob.data.vertices]; Pp += [tuple(o + i for i in p.vertices) for p in ob.data.polygons]
        return _BVH.FromPolygons(V, Pp)
    def plate(name, P, nu, nv, ramp, thick, group='body', hi=.28, add=0., back=False):
        F = grid_faces(nv, nu); Nv = vnormals(P, F)
        if (Nv[:, 1].mean() > 0) != back: Nv = -Nv
        Vt, Ft, UVt, Nt = thicken(P, F, Nv, thick, ramp_uv(ramp, .5), ramp_uv(ramp, .3), ramp_uv(ramp, .45), rim=3)
        return make_obj(name, Vt, Ft, ramp_uv(ramp, sval(Nt, hi=hi) + add), group, N=Nt)
    def rounded_outline(hx, hz, rtop, rbot, n=40):
        """a rounded rectangle (half sizes hx, hz; corner radii top / bottom), resampled by arc length + turning"""
        P2 = []
        for k in range(720):
            a_ = 2 * PI * k / 720; d_ = np.array([math.cos(a_), math.sin(a_)]); rc_ = rtop if d_[1] > 0 else rbot
            lo, hi = 0., .5
            for _ in range(40):
                m = (lo + hi) / 2; q_ = np.abs(d_ * m) - np.array([hx - rc_, hz - rc_])
                inside = np.linalg.norm(np.maximum(q_, 0)) + min(max(q_[0], q_[1]), 0) - rc_ < 0
                lo, hi = (m, hi) if inside else (lo, m)
            P2.append(d_ * lo)
        _O = np.array(P2); _D = np.diff(np.vstack([_O, _O[:1]]), axis=0); _sl = np.linalg.norm(_D, axis=1)
        _ta = np.arctan2(_D[:, 1], _D[:, 0]); _dt = np.abs(np.angle(np.exp(1j * (np.roll(_ta, -1) - _ta))))
        _L = np.concatenate([[0], np.cumsum(_sl / _sl.sum() + .55 * _dt / _dt.sum())])
        _t = np.linspace(0, _L[-1], n, endpoint=False)
        return np.stack([np.interp(_t, _L, np.append(_O[:, 0], _O[0, 0])), np.interp(_t, _L, np.append(_O[:, 1], _O[0, 1]))], -1)
    def pocket(name, obs, cx, cz, hx, hz, rtop, rbot, ramp, T=.020, mouth=True):
        """a padded pocket fitted (least squares) to the front of obs: a rounded plate with its mouth line along the top"""
        bv = bvh_of(obs)
        gx, gz = np.meshgrid(np.linspace(cx - hx - .02, cx + hx + .02, 11), np.linspace(cz - hz - .02, cz + hz + .02, 11)); gx = gx.ravel(); gz = gz.ravel()
        gy = []
        for xx, zz in zip(gx, gz):
            hit = bv.ray_cast(Vector((float(xx), -1.0, float(zz))), Vector((0, 1., 0)))
            gy.append(hit[0].y if hit[0] is not None else np.nan)
        gy = np.array(gy); ok = np.isfinite(gy)
        A_ = lambda x, z: np.stack([np.ones_like(x), x, x * x, z - cz, (z - cz) ** 2, x * (z - cz), x * x * (z - cz)], -1)
        cf = np.linalg.lstsq(A_(gx[ok], gz[ok]), gy[ok], rcond=None)[0]
        fy = lambda x, z: A_(np.asarray(x, float), np.asarray(z, float)) @ cf
        LOG[name + '_fit_rms_mm'] = round(float(np.sqrt(((fy(gx[ok], gz[ok]) - gy[ok]) ** 2).mean())) * 1000, 2)
        O2 = rounded_outline(hx - T / 2, hz - T / 2, rtop - T / 2, rbot - T / 2, 40); NR = 3; NP = len(O2)
        G2 = np.array([np.zeros(2)] + [O2[k] * (j / NR) ** .8 for j in range(1, NR + 1) for k in range(NP)])
        Fp = [(0, 1 + k, 1 + (k + 1) % NP) for k in range(NP)]
        for j in range(NR - 1):
            for k in range(NP):
                a0 = 1 + j * NP + k; b0 = 1 + j * NP + (k + 1) % NP; Fp.append((a0, a0 + NP, b0 + NP, b0))
        Vp = np.stack([cx + G2[:, 0], fy(cx + G2[:, 0], cz + G2[:, 1]) - T / 2 + .002 - .004 * (1 - (G2 ** 2).sum(1) / max((O2 ** 2).sum(1).max(), 1e-9)), cz + G2[:, 1]], -1)
        Np = vnormals(Vp, Fp)
        if Np[:, 1].mean() > 0: Np = -Np
        Vt, Ft, UVt, Nt = thicken(Vp, Fp, Np, T, ramp_uv(ramp, .5), ramp_uv(ramp, .3), ramp_uv(ramp, .45), rim=4)
        ob = make_obj(name, Vt, Ft, ramp_uv(ramp, sval(Nt, hi=.30) + .03), 'body', N=Nt)
        if mouth:
            my = float(fy(cx, cz + hz - .022)) - T + .002 - .0004
            lobe(name + '_mouth', np.array([cx, my, cz + hz - .022]), np.array([.0026, hx - .022, .0042]), [0, -1., 0], 'body', ramp='hole', n=3, occ_in=0, pole=[0, 0, 1.])
        return ob, fy
    def lathe(name, TZ, TAX, TAY, ramp, TP=2.3, rcy=None, na=30, nz=None, hi=.26, group='body', bottom=None):
        """a lathed superellipse body: rings at z (spline through TZ), optional rolled-under bottom closed by a pole"""
        tax_f = natspline(TZ, TAX); tay_f = natspline(TZ, TAY); rcy = rcy or (lambda z: 0. * np.asarray(z))
        def raw(a, z):
            a = np.asarray(a, float); z = np.asarray(z, float)
            return np.stack([tax_f(z) * spow(np.sin(a), 2 / TP), rcy(z) - tay_f(z) * spow(np.cos(a), 2 / TP), z + 0 * a], -1)
        def nrm(a, z, e=1e-4):
            da = raw(np.asarray(a) + e, z) - raw(np.asarray(a) - e, z)
            dz = raw(a, np.asarray(z) + e) - raw(a, np.asarray(z) - e)
            n = unit(np.cross(dz, da)); c = raw(a, z) - np.stack([0 * np.asarray(a), rcy(z) + 0 * np.asarray(a), np.asarray(z) + 0 * np.asarray(a)], -1)
            return np.where(((n * c).sum(-1) < 0)[..., None], -n, n)
        def field(p):
            z = np.clip(p[:, 2], TZ[0], TZ[-1])
            f = (np.abs(p[:, 0]) / tax_f(z)) ** TP + (np.abs(p[:, 1] - rcy(z)) / tay_f(z)) ** TP - 1
            return np.where((p[:, 2] > TZ[-1]) | (p[:, 2] < TZ[0]), 1., f)
        zt = np.linspace(TZ[0], TZ[-1], nz or len(TZ)) if not isinstance(nz, np.ndarray) else nz
        at = np.linspace(0, 2 * PI, na, endpoint=False)
        AA, ZZ = np.meshgrid(at, zt); P = raw(AA, ZZ); N = nrm(AA, ZZ)
        V = list(P.reshape(-1, 3)); NN = list(N.reshape(-1, 3)); F = grid_faces(len(zt), na, True)
        if bottom is not None:                                                  # roll the hem under and close it
            prev = list(range(na)); z0 = zt[0]
            for k, (dz, sc, tilt) in enumerate(bottom):
                ring = raw(at, np.full(na, z0)); c = np.array([0, float(rcy(z0)), z0])
                ring = c + (ring - c) * sc; ring[:, 2] = z0 + dz
                nn = unit(N[0] * math.cos(tilt) + np.array([0, 0, -1.]) * math.sin(tilt))
                i0 = len(V); V += list(ring); NN += list(nn); cur = list(range(i0, i0 + na))
                for i in range(na): F.append((cur[i], cur[(i + 1) % na], prev[(i + 1) % na], prev[i]))
                prev = cur
            k0 = len(V); V.append(np.array([0, float(rcy(z0)), z0 + bottom[-1][0] + .004])); NN.append(np.array([0, 0, -1.]))
            for i in range(na): F.append((prev[(i + 1) % na], prev[i], k0))
        V = np.array(V); NN = np.array(NN)
        ob = make_obj(name, V, F, ramp_uv(ramp, sval(NN, hi=hi)), group, N=NN)
        return ob, field, tax_f, tay_f
    def straps_over(xs, z_o, ph0, ph1, f, off, prof, ramp, name, n=21):
        """straps from the front over the shoulder to the back: rays in the y-z plane at x from (x, 0, z_o) onto field f"""
        out = {}
        for s in (-1, 1):
            o = np.array([s * xs, 0, z_o]); path = []; norms = []
            for ph in np.linspace(math.radians(ph0), math.radians(ph1), n):
                d = np.array([0, -math.cos(ph), math.sin(ph)])
                lo, hi = 0., .40
                for _ in range(40):
                    m = (lo + hi) / 2; ins = f((o + d * m)[None])[0] < 0
                    lo, hi = (m, hi) if ins else (lo, m)
                q = o + d * lo; g = grad(f, q[None], 1e-4)[0]
                path.append(q + g * off); norms.append(g)
            path = np.array(path); norms = np.array(norms)
            out[s] = (sweep('%s.%d' % (name, s > 0), path, lambda k: prof, 'body', ramp_sw(ramp, hi=.26), sides=8, normals=norms, p=.55), path, norms)
        return out
    def arms(SH0, ARM_DEG, k=1.0, sleeve=None, band=False, fa_r=(.058, .060), paw_r=(.070, .066, .060)):
        """mitten arms at ARM_DEG from vertical (k scales the lengths); sleeve = (ramp, r0, r1): a puffy short sleeve with a
        rolled hem; band: a black fur band round the upper arm just under the sleeve (C, the sheet)"""
        ARM = {}
        for s, tag in ((1, 'L'), (-1, 'R')):
            th = math.radians(ARM_DEG); ad = unit(np.array([s * math.sin(th), -.05, -math.cos(th)]))
            SH = np.array([s * SH0[0], SH0[1], SH0[2]])
            fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
            def along(t0, SH=SH, ad=ad): return SH + ad * t0 * k
            if sleeve is not None:
                ramp_sleeve, r0, r1 = sleeve
                TS0, TS1 = -.055, .100
                path = np.array([along(t0) for t0 in np.linspace(TS0, TS1, 9)])
                sweep('puff_sleeve.' + tag, path, lambda kk: ((r0 + r1 * math.sin(PI * min(1, (kk / 8) * 1.12)) ** .8) * (1 - .05 * (kk / 8) ** 4),) * 2,
                      'arm.' + tag, ramp_sw(ramp_sleeve, hi=.26), sides=22, cap0=False, cap1=False, normals=np.tile(fwd, (len(path), 1)))
                abr = np.linspace(0, 2 * PI, 22, endpoint=False); e1 = fwd; e2 = np.cross(ad, fwd)
                HC_ = along(TS1 - .003); rh = r0 * .95
                Phr = HC_ + np.outer(np.cos(abr), e1) * rh + np.outer(np.sin(abr), e2) * rh
                Nhr = unit(np.outer(np.cos(abr), e1) + np.outer(np.sin(abr), e2))
                ring_tube('puff_sleeve_hem.' + tag, Phr, lambda kk: np.stack([.0115 * np.cos(np.linspace(0, 2 * PI, 5, endpoint=False)), .0125 * np.sin(np.linspace(0, 2 * PI, 5, endpoint=False))], -1),
                          'arm.' + tag, ramp_sw(ramp_sleeve, hi=.24, add=-.03), Nhr, sides=5)
            WR = along(.200); PC = along(.266); lat = np.cross(ad, fwd) * s
            paw_axes = np.array([ad, fwd, lat])
            thumb = PC + fwd * .040 * k + lat * .018 * k - ad * .014 * k
            a0 = .050 if sleeve is not None else -.030
            def arm_parts(p, WR=WR, PC=PC, paw_axes=paw_axes, thumb=thumb, SH=SH, ad=ad, a0=a0):
                d_fa = sd_capsule(p, SH + ad * a0 * k, WR, fa_r)
                d_paw = sd_ell(p, PC, paw_axes, paw_r)
                d_t = sd_ell(p, thumb, paw_axes, (.030, .025, .025))
                return d_fa, d_paw, d_t
            def arm_sdf(p, arm_parts=arm_parts):
                d_fa, d_paw, d_t = arm_parts(p)
                return smin(smin(d_fa, d_paw, .034), d_t, .013)
            def arm_uv(NN, V, arm_parts=arm_parts):
                d_fa, d_paw, d_t = arm_parts(V)
                cr = crease(np.minimum(d_paw, d_fa), d_t, .013) * .35
                return ramp_uv('limb', sval(NN, occ=cr, hi=.34))
            tt_ = np.linspace(0, .18, 361); inside = arm_sdf(PC[None] + ad[None] * tt_[:, None]) < 0
            reach = float(tt_[np.argmin(inside)]) if not inside.all() else .18
            tips = PC + ad * (reach - .006); st = SH + ad * (.055 if sleeve is not None else -.022) * k
            ts = np.concatenate([np.linspace(0, .40, 5)[:-1], np.linspace(.40, 1.0, 13)])
            cen = st[None] + (tips - st)[None] * ts[:, None]
            ring_stack('fur_mitten_arm.' + tag, arm_sdf, cen, np.tile(ad, (len(ts), 1)), 'arm.' + tag, arm_uv, sides=16, tmax=.18, ref=fwd)
            if band:
                # the black fur band under the sleeve: a soft thick ring hugging the arm (z ~4 cm wide on the sheet)
                BC_ = along(.118); e1 = fwd; e2 = np.cross(ad, fwd); abr = np.linspace(0, 2 * PI, 20, endpoint=False)
                rr_ = []
                for a_ in abr:
                    dd = np.cos(a_) * e1 + np.sin(a_) * e2; name_hint[0] = 'arm band'
                    rr_.append(np.linalg.norm(ray_outer(arm_sdf, BC_[None], dd[None], .15)[0] - BC_))
                rr_ = np.array(rr_)
                Pbr = BC_ + (np.outer(np.cos(abr), e1) + np.outer(np.sin(abr), e2)) * (rr_ - .004)[:, None]
                Nbr = unit(np.outer(np.cos(abr), e1) + np.outer(np.sin(abr), e2))
                pa = np.linspace(0, 2 * PI, 8, endpoint=False)
                ring_tube('arm_band.' + tag, Pbr, lambda kk: np.stack([.0105 * spow(np.cos(pa), .5), .0185 * spow(np.sin(pa), .5)], -1),
                          'arm.' + tag, ramp_sw('fur', hi=.30), Nbr, sides=8)
            ARM[tag] = {'shoulder': SH.tolist(), 'elbow': along(.125).tolist(), 'wrist': WR.tolist(), 'palm': (PC + lat * .010).tolist()}
        return ARM, ARM_DEG
    def feet(FX, FY, R_, hip, toe_lines=True):
        """big rounded dog feet with two toe lines each"""
        LEG = {}
        for s, tag in ((1, 'L'), (-1, 'R')):
            FC = np.array([s * FX, FY, R_[2] - .016]); yaw = s * math.radians(6)
            FAX = rot([0, 0, 1], yaw).T
            toes = [FC + FAX[0] * (o * .040) for o in (-1, 1)]
            def foot_sdf(p, FC=FC, FAX=FAX, s=s):
                d = sd_ell(p, FC, FAX, R_)
                d = smin(d, sd_capsule(p, np.array([s * (FX - .004), FY + .040, .070]), np.array([s * (FX - .008), FY + .040, hip]), .078), .040)
                return smax(d, -(p[:, 2] - .000), .018)
            def foot_uv(NN, V):
                return ramp_uv('limb', sval(NN, hi=.34, occ=.05 * smooth(.03, .0, V[:, 2])))
            star_mesh('dog_foot.' + tag, foot_sdf, FC + np.array([0, .012, .018]), 'body', foot_uv, nth=12, nph=20, tmax=.34)
            if toe_lines:
                for t_ in toes:
                    tl = np.array([t_ - FAX[1] * (R_[1] - .002 - .050 * u_) + np.array([0, 0, .048 * math.sin(u_ * PI / 2) - .002]) for u_ in np.linspace(0, 1, 6)])
                    for _ in range(6): tl = tl - foot_sdf(tl)[:, None] * grad(foot_sdf, tl, 1e-4)
                    tn = grad(foot_sdf, tl, 1e-4)
                    sweep('dog_toe_line.%s.%d' % (tag, len(LEG)), tl + tn * .0009, lambda k: (.0018, .0058 * (1 - .45 * abs(k - 2.5) / 2.5)), 'body', ramp_sw('toe', hi=.20), sides=6, normals=tn, p=.6)
            LEG[tag] = {'hip': [s * (FX - .008), .004, hip + .06], 'knee': [s * (FX - .006), .000, (hip + .10) / 2], 'ankle': [s * FX, FY + .03, .080],
                        'toe': (FC - FAX[1] * R_[1] + np.array([0, 0, -.022])).tolist()}
        return LEG
    def box_mesh(name, sdf, centre, axes, half, group, uvfn, n=6):
        """a rounded box: cube-sphere directions stretched by the box's half sizes, cast onto the sdf (even quads on the flat faces)"""
        V0, F = cube_sphere(n); cuv = V0 / np.abs(V0).max(1, keepdims=True)
        cuv = np.sign(cuv) * np.abs(cuv) ** 1.25                              # a little denser toward the rounded edges
        D = unit((cuv * np.asarray(half)) @ np.asarray(axes)); name_hint[0] = name
        P = ray_outer(sdf, np.repeat(np.asarray(centre, float)[None], len(D), 0), D, 2.5 * max(half)); N = grad(sdf, P)
        return make_obj(name, P, F, uvfn(N, P), group, N=N)
    def tail(pts, r_prof, tip_u):
        """a thick swept bean (A: rising and curving back; C: a short upward hook). UV: u = along the tail plus a three-point
        zigzag offset round it (the painter thresholds u, so the tip colour ends in a crisp zigzag), v = the painted shade"""
        global TAIL_PATH
        path = cpath(pts, 22); TAIL_PATH = path.copy()
        nrm = np.tile(np.array([1., 0, 0]), (len(path), 1))
        T_ = unit(np.gradient(path, axis=0)); Nn = unit(np.cross(nrm, T_))           # Nn: the curve's outer (back / up) side
        def uvfn(NV, tt, uu, V):
            zig = np.abs(((uu * 3 + .25) % 1.0) - .5) * 2
            u_ = (tt + .085 * (1 - zig)) / 1.1
            return chart_uv('tail', u_, sval(NV, hi=.30))
        ob = sweep('dog_tail', path, lambda kk: (r_prof(kk / (len(path) - 1)),) * 2, 'tail', uvfn, sides=16, normals=Nn)
        return np.array(pts[0], float)

    if DESIGN == 'a':
        print('BODY_STEP fur torso', flush=True)
        # ------------------------------------------------------------ the tan fur torso (no shirt: z 0.30-0.60, under the head)
        _tor, torso_f, _, _ = lathe('fur_torso', np.array([.300, .360, .420, .470, .510, .545, .575, .600]),
                                    np.array([.205, .214, .212, .200, .184, .162, .132, .100]), np.array([.160, .167, .166, .158, .147, .130, .107, .082]),
                                    'fur', na=28, nz=8)
        BODY_OBS['torso'] = _tor
        print('BODY_STEP overalls', flush=True)
        # ------------------------------------------------------------ the sage overalls: one SDF shell from the hems (z 0.125) up to
        # a straight top edge at the bib line (z 0.446) all round (the sheet's side and back views), two short leg lobes
        LEGX = .125
        def over_sdf(p):
            d = ell(p, [0, .010, .255], [.258, .205, .190])
            e_ = np.sqrt((p[:, 0] / .230) ** 2 + ((p[:, 1] - .004) / .186) ** 2); dr_ = (e_ - 1) * .20; dz_ = np.abs(p[:, 2] - .375) - .075; re_ = .018
            d = smin(d, np.sqrt(np.maximum(dr_ + re_, 0) ** 2 + np.maximum(dz_ + re_, 0) ** 2) + np.minimum(np.maximum(dr_ + re_, dz_ + re_), 0) - re_, .05)
            for s in (-1, 1):
                d = smin(d, ell(p, [s * LEGX, .006, .180], [.118, .150, .100]), .05)
            d = smax(d, -(p[:, 2] - .125), .014)                                       # the hems
            d = smax(d, p[:, 2] - .446, .014)                                          # the bib line, all round
            d = smax(d, -sd_capsule(p, np.array([0, -.40, .112]), np.array([0, .40, .112]), .040), .012)      # the short leg split
            return d
        OVER_TH = np.concatenate([np.linspace(.10, .55, 5), np.linspace(.55, 1.10, 7)[1:], np.linspace(1.10, 1.95, 7)[1:], np.linspace(1.95, 2.60, 9)[1:], np.linspace(2.60, PI - .10, 5)[1:]])
        BODY_OBS['pants'] = star_mesh('overall_shell', over_sdf, np.array([0, .006, .280]), 'body', lambda NN, V: ramp_uv('over', sval(NN, hi=.32)), nph=34, tmax=.45, thetas=OVER_TH)
        def outer_sdf(p): return np.minimum(over_sdf(p), np.where(p[:, 2] > .40, torso_f(p) * .12, 1.))
        # a soft rolled hem round each leg
        for s, tag in ((1, 'L'), (-1, 'R')):
            a_ = np.linspace(0, 2 * PI, 30, endpoint=False); cz_ = .134
            d_ = np.stack([np.sin(a_), -np.cos(a_), 0 * a_], -1); name_hint[0] = 'hem'
            own = lambda p, s=s: np.where(s * p[:, 0] > 0, over_sdf(p), 1.)
            P_ = ray_outer(own, np.array([s * LEGX, .006, cz_]), d_, .30); N_ = grad(over_sdf, P_); N_[:, 2] = 0; N_ = unit(N_)
            P_ = P_ + N_ * .002
            ring_tube('overall_hem.' + tag, P_, lambda k: np.stack([.0085 * spow(np.cos(np.linspace(0, 2 * PI, 8, endpoint=False)), .55), .016 * spow(np.sin(np.linspace(0, 2 * PI, 8, endpoint=False)), .55)], -1),
                      'body', ramp_sw('over', hi=.30, add=-.02), N_, sides=8)
        print('BODY_STEP pocket', flush=True)
        BODY_OBS['pocket'], _ = pocket('overall_pocket', [BODY_OBS['pants']], 0., .2725, .1350, .0760, .022, .062, 'over', mouth=True)
        print('BODY_STEP straps + buttons', flush=True)
        # ------------------------------------------------------------ two broad straps (0.077 m) from the bib's top corners over the
        # shoulders, straight down the back to the back's top edge; two big cream buttons where they meet the bib
        STR = straps_over(.128, .405, 8, 190, torso_f, .013, (.0085, .0360), 'over', 'overall_strap')
        for s in (-1, 1):
            bz = .412; by = float(surf_y(outer_sdf, np.array([s * .133]), np.array([bz]))[0]) - .022
            lobe('overall_button.%d' % (s > 0), np.array([s * .133, by - .004, bz]), np.array([.015, .043, .043]), [0, -1., 0], 'body', ramp='button', n=4, occ_in=.15, squash=.30, pole=[0, 0, 1.])
        print('BODY_STEP arms', flush=True)
        ARM, ARM_DEG = arms((.168, -.004, .505), 36., k=.88, fa_r=(.064, .066), paw_r=(.074, .068, .062))
        print('BODY_STEP feet', flush=True)
        LEG = feet(.133, -.012, (.116, .160, .078), .20)
        print('BODY_STEP tail', flush=True)
        _yb = float(surf_y(over_sdf, np.array([0.]), np.array([.250]), front=False)[0])
        TLC = tail([(0, _yb - .040, .228), (0, _yb + .035, .245), (0, _yb + .080, .290), (0, _yb + .098, .345), (0, _yb + .088, .392)],
                   lambda t: (.046 + .020 * math.sin(PI * min(1, t * 1.15))) * math.sqrt(max(.16, 1 - (max(0, t - .70) / .30) ** 2)), None)
        JOINTS_BODY = {'hips': [0, .005, .240], 'spine': [0, .003, .340], 'chest': [0, .000, .440], 'neck': [0, .000, .545]}
        BODY_PARTS = (('overalls', ['overall_shell']), ('hems', ['overall_hem']), ('pocket', ['overall_pocket']),
                      ('straps', ['overall_strap']), ('buttons', ['overall_button.']), ('torso', ['fur_torso']))
    else:
        print('BODY_STEP shirt', flush=True)
        # ------------------------------------------------------------ the butter-yellow T-shirt: a lathe from the neck to the hem
        # (z 0.265), the hem rolled under and closed
        SZ = np.array([.265, .300, .350, .400, .440, .480, .510, .535, .555])
        SX = np.array([.240, .240, .232, .222, .212, .197, .177, .150, .114])
        SY = np.array([.196, .196, .190, .182, .172, .160, .144, .122, .094])
        _sh, shirt_f, _, _ = lathe('shirt_body', SZ, SX, SY, 'shirt', TP=2.4, na=28, nz=np.concatenate([np.linspace(.265, .30, 2), np.linspace(.30, .555, 8)[1:]]),
                                   bottom=[(-.008, .985, .6), (-.012, .93, 1.1), (-.013, .82, 1.45)])
        BODY_OBS['shirt'] = _sh
        _cy = float(surf_y(lambda p: shirt_f(p), np.array([0.]), np.array([.536]))[0])
        _cy = float(surf_y(lambda p: shirt_f(p), np.array([0.]), np.array([.520]))[0])
        lobe('chest_patch', np.array([0, _cy + .004, .522]), np.array([.010, .060, .022]), [0, -1., .30], 'body', ramp='tan', n=4, occ_in=.10, squash=.20, pole=[0, 0, 1.])
        print('BODY_STEP shorts', flush=True)
        # ------------------------------------------------------------ the blue shorts: one SDF (z 0.124-0.31, under the shirt), two
        # soft leg lobes and a short split
        LEGX = .118
        def shorts_sdf(p):
            d = ell(p, [0, .008, .215], [.230, .190, .120])
            e_ = np.sqrt((p[:, 0] / .214) ** 2 + ((p[:, 1] - .004) / .176) ** 2); dr_ = (e_ - 1) * .20; dz_ = np.abs(p[:, 2] - .265) - .050; re_ = .016
            d = smin(d, np.sqrt(np.maximum(dr_ + re_, 0) ** 2 + np.maximum(dz_ + re_, 0) ** 2) + np.minimum(np.maximum(dr_ + re_, dz_ + re_), 0) - re_, .04)
            for s in (-1, 1):
                d = smin(d, ell(p, [s * LEGX, .006, .168], [.112, .146, .080]), .045)
            d = smax(d, -(p[:, 2] - .124), .013)
            d = smax(d, p[:, 2] - .310, .012)
            d = smax(d, -sd_capsule(p, np.array([0, -.40, .118]), np.array([0, .40, .118]), .026), .013)
            return d
        SH_TH = np.concatenate([np.linspace(.10, .70, 5), np.linspace(.70, 1.20, 6)[1:], np.linspace(1.20, 1.95, 6)[1:], np.linspace(1.95, 2.60, 9)[1:], np.linspace(2.60, PI - .10, 5)[1:]])
        BODY_OBS['shorts'] = star_mesh('shorts', shorts_sdf, np.array([0, .006, .215]), 'body', lambda NN, V: ramp_uv('shorts', sval(NN, hi=.32)), nph=32, tmax=.40, thetas=SH_TH)
        def outer_sdf(p): return np.minimum(shorts_sdf(p), shirt_f(p) * .12)
        # the fly seam: a short soft groove line down the front
        _fz = np.linspace(.250, .170, 6); _fy = surf_y(shorts_sdf, np.zeros(6), _fz)
        _fp = np.stack([np.zeros(6) + .010, _fy - .0012, _fz], -1); _fn = grad(shorts_sdf, _fp)
        sweep('shorts_seam', _fp, lambda k: (.0022, .0040), 'body', ramp_sw('seam', hi=.10), sides=6, normals=_fn, p=.7)
        print('BODY_STEP satchel', flush=True)
        # ------------------------------------------------------------ the terracotta satchel on her left hip (+X), toward the front:
        # a rounded box (0.17 x 0.155 x 0.07 m) facing front-left, a rounded flap over its top 60 %
        BG_C = np.array([.160, -.118, .275]); _yaw = math.radians(28)
        BG_N = np.array([math.sin(_yaw), -math.cos(_yaw), 0.]); BG_X = np.array([math.cos(_yaw), math.sin(_yaw), 0.]); BG_Z = np.array([0, 0, 1.])
        BG_AX = np.array([BG_X, BG_N, BG_Z])
        def bag_sdf(p): return sd_box(p, BG_C, BG_AX, (.085, .044, .078), .032)
        box_mesh('satchel_box', bag_sdf, BG_C, BG_AX, (.085, .044, .078), 'body', lambda NN, V: ramp_uv('bag', sval(NN, hi=.30, occ=.08 * smooth(.0, -.6, NN @ BG_Z))), n=7)
        FL_C = BG_C + BG_N * .040 + BG_Z * .030
        def flap_sdf(p): return sd_box(p, FL_C, BG_AX, (.089, .012, .056), .011)
        box_mesh('satchel_flap', flap_sdf, FL_C, BG_AX, (.089, .012, .056), 'body', lambda NN, V: ramp_uv('bag', sval(NN, hi=.32) + .03), n=7)
        print('BODY_STEP band', flush=True)
        # ------------------------------------------------------------ the crossbody band: a closed loop lying on the shirt in a tilted
        # plane, high over her right shoulder, low at her left hip (behind the satchel), 0.04 m wide
        _bu = unit(np.array([-.80, 0, .60])); _bc = np.array([0, .000, .405]); _ph = np.linspace(0, 2 * PI, 56, endpoint=False)
        _bd = np.outer(np.cos(_ph), _bu) + np.outer(np.sin(_ph), np.array([0, 1., 0]))
        name_hint[0] = 'band'; _bp = ray_outer(outer_sdf, np.repeat(_bc[None], len(_ph), 0), _bd, .45)
        _bn = grad(outer_sdf, _bp)
        _bpn = np.cross(_bu, np.array([0, 1., 0])); _bn = unit(_bn - np.outer(_bn @ _bpn, _bpn))
        _bpath = _bp + _bn * .009
        for _ in range(2): _bpath = .5 * _bpath + .25 * (np.roll(_bpath, 1, 0) + np.roll(_bpath, -1, 0))
        pa = np.linspace(0, 2 * PI, 8, endpoint=False)
        ring_tube('satchel_band', _bpath, lambda kk: np.stack([.0060 * spow(np.cos(pa), .5), .0200 * spow(np.sin(pa), .5)], -1), 'body', ramp_sw('bag', hi=.26), _bn, sides=8)
        print('BODY_STEP arms', flush=True)
        ARM, ARM_DEG = arms((.152, -.004, .468), 32., k=.80, sleeve=('shirt', .062, .024), band=True, fa_r=(.058, .060), paw_r=(.068, .064, .059))
        print('BODY_STEP feet', flush=True)
        LEG = feet(.122, -.012, (.110, .165, .076), .18)
        print('BODY_STEP tail', flush=True)
        _yb = float(surf_y(shorts_sdf, np.array([0.]), np.array([.255]), front=False)[0])
        TLC = tail([(0, _yb - .030, .250), (0, _yb + .040, .268), (0, _yb + .085, .312), (0, _yb + .098, .368), (0, _yb + .072, .410)],
                   lambda t: (.044 + .018 * math.sin(PI * min(1, t * 1.15))) * math.sqrt(max(.16, 1 - (max(0, t - .70) / .30) ** 2)), None)
        JOINTS_BODY = {'hips': [0, .006, .220], 'spine': [0, .004, .320], 'chest': [0, .000, .410], 'neck': [0, .000, .515]}
        BODY_PARTS = (('shirt', ['shirt_body']), ('shorts', ['shorts']), ('satchel', ['satchel_box', 'satchel_flap']), ('band', ['satchel_band']),
                      ('chest_patch', ['chest_patch']))

    _vs = lambda pre: np.array([list(o.matrix_world @ v.co) for g, obs in parts.items() for o in obs if any(o.name.startswith(x) for x in pre) for v in o.data.vertices])
    def _ext(v): return None if len(v) == 0 else {'min': [round(float(c), 3) for c in v.min(0)], 'max': [round(float(c), 3) for c in v.max(0)], 'size': [round(float(c), 3) for c in np.ptp(v, 0)]}
    BODY_MEAS = {'body_parts_m': {k: _ext(_vs(p)) for k, p in BODY_PARTS + (('feet', ['dog_foot']), ('foot_L', ['dog_foot.L']), ('tail', ['dog_tail']),
                 ('arm_L', ['fur_mitten_arm.L']), ('ears', ['lop_ear', 'shiba_ear']), ('leaf', ['leaf']))},
                 'arm_angle_from_vertical_deg': ARM_DEG}
    print('BODY_STEP joints', flush=True)
    JOINTS_BODY.update({'arms': {t: {k: v for k, v in ARM[t].items() if k != 'palm'} for t in ARM}, 'legs': LEG,
                        'tail': [TLC.tolist()], 'palm_R': ARM['R']['palm'], 'palm_L': ARM['L']['palm']})
    BODY_PIVOTS = {'arm.L': tuple(ARM['L']['shoulder']), 'arm.R': tuple(ARM['R']['shoulder']), 'tail': tuple(TLC), 'body': (0, 0, 0)}
    BODY_PAINTERS = {}
    def POST_JOIN():
        def sc(v): return [round(float(c), 5) for c in v]
        joints = {'design': DESIGN, 'units': 'metres (final, crown 1.05 m)', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X'}
        joints.update({k: sc(JOINTS_BODY[k]) for k in ('hips', 'spine', 'chest', 'neck')})
        joints['head'] = sc(O)
        joints['head_nod_pivot_suggested'] = sc([0, HY + .10 * W, CHIN + .03 * W])
        joints['jaw_pivot'] = sc([0, float(HY - .22 * W), float(CHIN + .135 * W)])
        joints['eyes'] = {'R': sc(eye_centers['R']), 'L': sc(eye_centers['L'])}
        joints['eye_axes'] = {k: LOG['eye_axis_' + k] for k in ('R', 'L')}
        joints['lash'] = LOG['lash']
        joints['ears'] = {t: {k: sc(v) for k, v in ear_info[t].items()} for t in ('R', 'L')}
        joints[HAT_GROUP] = sc(HAT_ANCHOR)
        joints['arms'] = {t: {k: sc(v) for k, v in JOINTS_BODY['arms'][t].items()} for t in ('L', 'R')}
        joints['legs'] = {t: {k: sc(v) for k, v in JOINTS_BODY['legs'][t].items()} for t in ('L', 'R')}
        joints['tail'] = [sc(v) for v in JOINTS_BODY['tail']]
        joints['palm_R'] = sc(JOINTS_BODY['palm_R']); joints['palm_L'] = sc(JOINTS_BODY['palm_L'])
        joints['notes'] = ['Phase 1: no rig, weights or animations. Same keys as the folk-bunny / Usagi joints.json (final metres).',
                           'head = the head centre (the radial origin); head_nod_pivot_suggested = base of the skull, for the rig.',
                           'Head skin = zero surface of one convex implicit ball (squircle skull + jaw + muzzle cushions + nose), analytic normals, toon-band refinement; no eye sockets.',
                           'Upper lash lines: separate ribbons (%s_lash_L / _R: the line, its wing and a flick), origin at the eye centre, for the upper lids.' % NAME,
                           'Eyelid holes ringed by 6 loops each with the rim rolled in behind separate lens eyeballs; 3 loops round the mouth, 4 round the nose.',
                           ('Ears: separate drooping paddles (%s_ear_L / _R), 28 rings along a curved centreline (bend loops), pivot = ears.base (where the root runs along the skull corner).' % NAME) if DESIGN == 'a' else
                           ('Ears: separate upright wedges (%s_ear_L / _R), 26 rings along the axis (bend loops), pivot = ears.base (buried in the skull).' % NAME),
                           ('Leaf: %s_leaf rides the head bone, pivot = leaf.' % NAME) if DESIGN == 'a' else 'No head accessory.',
                           'Tail: %s_tail, a thick swept bean (22 rings, bend loops), root = tail[0].' % NAME]
        if HAT_GROUP == 'nohat': joints.pop('nohat', None)
        with open(os.path.join(ROOT, 'joints-%s.json' % DESIGN), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)

# ============================================================== PAINTED ATLAS
def stroke(x, z, P, half, aa):
    best = np.full(len(x), 9.)
    for i in range(len(P) - 1):
        a = P[i]; b = P[i + 1]; ab = b - a; L2 = ab @ ab
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        dx = x - (a[0] + t * ab[0]); dz = z - (a[1] + t * ab[1])
        best = np.minimum(best, np.sqrt(dx * dx + dz * dz) - (half[i] * (1 - t) + half[i + 1] * t))
    return 1 - smooth(-aa, aa, best)
PAINT_OPTS = {'band': not RIG, 'blush': True}      # rig: no lash contact shade on the skin (it showed as a grey arc above the shut eye)
# the face layout (W units, front projection: x across, z above the chin), measured on the sheet's head close-ups (measure-<x>.md):
# A's brows inner -> outer, a soft arch thickest in the middle; the omega smile (two U's meeting under a dark philtrum).
# C has no drawn brows: two tan eyebrow spots (BROW_P only places the rig's brow bones).
if DESIGN == 'a':
    BROW_P = np.array([[.168, .655], [.196, .680], [.228, .690], [.262, .681], [.292, .658]])
    BROW_H = np.array([.0085, .0165, .0190, .0160, .0080])
    MOUTH_P = np.array([[-.120, .254], [-.112, .234], [-.097, .214], [-.075, .201], [-.050, .202], [-.026, .214], [0, .232], [.026, .214],
                        [.050, .202], [.075, .201], [.097, .214], [.112, .234], [.120, .254]])
    MUZ_PAINT = (0., .195, .245, .140, 2.4)            # the cream muzzle pad: centre x, z, half w, half h, exponent
else:
    BROW_P = np.array([[.125, .545], [.152, .550], [.180, .552], [.208, .550], [.235, .545]])
    BROW_H = np.array([.01, .01, .01, .01, .01])
    MOUTH_P = np.array([[-.100, .189], [-.094, .170], [-.080, .150], [-.062, .136], [-.042, .134], [-.021, .143], [0, .158], [.021, .143],
                        [.042, .134], [.062, .136], [.080, .150], [.094, .170], [.100, .189]])
    MUZ_PAINT = (0., .108, .200, .128, 2.3)            # the cream central chin
    MASK = (0., .105, .470, .200, 3.2)                 # the tan lower-face mask (top edge ~0.29 W)
    SPOT = (.180, .546, .068, .041)                    # the tan eyebrow spots: x, z, half w, half h
BROW_C = (float(BROW_P[:, 0].mean()), float(BROW_P[:, 1].mean()))
def sellipse(qx, qz, spec):
    cx, cz, hx, hz, p = spec
    return (np.abs((qx - cx) / hx) ** p + np.abs((qz - cz) / hz) ** p) ** (1 / p)
def paint_head(U, V):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = radial_hit(d); n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); qx, qy, qz = q[:, 0], q[:, 1], q[:, 2]; ax = np.abs(qx)
    fr = smooth(HY + .04, HY - .06, y)
    up = n @ LIGHT
    # the fur with the sheet's soft modelling: light on the top planes, a little darker turning away and under the jaw
    C = mix(rgb('fur'), rgb('furlight'), .70 * smooth(.30, 1.0, up))
    C = mix(C, rgb('furdark'), .35 * smooth(.0, .85, -up))
    C = mix(C, rgb('furdark'), .30 * smooth(.55, .05, -n[:, 1]) * smooth(.2, -.3, up))
    C = mix(C, rgb('furdeep'), .22 * smooth(.02, -.10, qz) * smooth(-.2, -.7, n[:, 2]))           # the under-jaw shade
    if DESIGN == 'c':
        # the tan lower-face mask (a rounded box, clean border) and the two tan eyebrow spots, with the same soft modelling
        T = mix(rgb('tan'), rgb('tanlight'), .55 * smooth(.30, 1.0, up))
        T = mix(T, rgb('tandark'), .40 * smooth(.0, .85, -up))
        T = mix(T, rgb('tandeep'), .25 * smooth(.02, -.10, qz) * smooth(-.2, -.7, n[:, 2]))
        mk = sellipse(qx, qz, MASK)
        frm = smooth(HY + .005, HY - .025, y)                              # a crisp border where it turns round the cheek
        C = mix(C, T, (1 - smooth(.975, 1.025, mk)) * frm * smooth(-.07, -.02, qz))      # the neck stays black
        for s in (-1, 1):
            sx, sz, shx, shz = SPOT
            rs = np.sqrt(((qx - s * sx) / shx) ** 2 + ((qz - sz) / shz) ** 2 * (1 + .25 * clamp((sz - qz) / shz)))
            C = mix(C, T, (1 - smooth(.94, 1.06, rs)) * fr)
    # the cream muzzle (A: the pad round the mouth; C: the central chin), a clean rounded shape, crisp border
    mt = sellipse(qx, qz, MUZ_PAINT)
    Cm = mix(mix(rgb('muzzle'), rgb('fur' if DESIGN == 'a' else 'tan'), .20 if DESIGN == 'a' else .12), rgb('creamdark'), .35 * smooth(.0, .85, -up) + .30 * smooth(.02, -.10, qz) * smooth(-.2, -.7, n[:, 2]))
    C = mix(C, Cm, (1 - smooth(.96, 1.04, mt)) * fr * smooth(-.07, -.02, qz))
    if DESIGN == 'a':
        # brows: soft dark arches, thickest in the middle
        for s in (-1, 1):
            Pb = cpath(BROW_P * np.array([s, 1.]), 17)
            ib = (fr > 0) & (np.abs(qx - s * BROW_C[0]) < .10) & (np.abs(qz - BROW_C[1]) < .06)
            a = np.zeros(len(qx)); a[ib] = stroke(qx[ib], qz[ib], Pb, np.interp(np.linspace(0, 1, 17), np.linspace(0, 1, 5), BROW_H), .0028)
            C = mix(C, rgb('brow'), .96 * a)
    # blush: soft round dabs on the cheeks
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .88 * (1 - smooth(.62, 1.04, r)) * fr * PAINT_OPTS['blush'])
    # the dark button nose: a soft rounded inverted triangle with a small lighter top highlight
    nq = (q - np.array(NOSE[0])) / np.array(NOSE[1]); tri = (1 + .45 * clamp(-nq[:, 2] - .1)) * (1 - .08 * clamp(nq[:, 2]))
    rn = np.sqrt((nq[:, 0] * tri) ** 2 + nq[:, 1] ** 2 + (nq[:, 2] * 1.05) ** 2)
    nose_c = mix(rgb('dark'), rgb('nose'), smooth(-.45, .85, n @ unit(np.array([-.10, -.45, 1.]))))
    C = mix(C, nose_c, .98 * (1 - smooth(1.00, 1.20, rn)))
    rh_ = np.sqrt((((q - (np.array(NOSE[0]) + np.array([-.012, -.022, .015]) * NOSE_R[0] / .044)) / (np.array([.017, .014, .008]) * NOSE_R[0] / .044)) ** 2).sum(1))
    C = mix(C, rgb('nosehi'), .70 * (1 - smooth(.45, 1.0, rh_)) * (rn < 1.1))
    # the omega smile and the dark philtrum from the nose
    Pm = cpath(MOUTH_P, 44); Pm = np.stack([Pm[:, 0] * W, CHIN + Pm[:, 1] * W], -1)
    half = np.full(len(Pm), .0064 * W); half[:5] = np.linspace(.0036, .0064, 5) * W; half[-5:] = np.linspace(.0064, .0036, 5) * W
    Pph = np.array([[0, CHIN + (MOUTH_P[6, 1] + .002) * W], [0, CHIN + (NOSE[0][2] - NOSE[1][2] + .006) * W]]); hph = np.array([.0058 * W, .0052 * W])
    ib = (fr > 0) & (np.abs(x) < .16 * W) & (z > CHIN + .08 * W) & (z < NZ)
    a = np.zeros(len(x)); a[ib] = stroke(x[ib], z[ib], Pm, half, .0024 * W)
    b = np.zeros(len(x)); b[ib] = stroke(x[ib], z[ib], Pph, hph, .0024 * W)
    C = mix(C, rgb('mouth'), .96 * np.maximum(a, b))
    # the lash itself is a separate ribbon (LASH RIBBONS); only a faint soft contact shade lies on the skin under it
    for s_ in ((-1, 1) if PAINT_OPTS.get('band', True) else ()):
        Pl = np.stack([s_ * EX + s_ * EHW * LASH_C2[:, 0], EZ + EHH * LASH_C2[:, 1]], -1)
        box = (fr > 0) & (np.abs(x - s_ * (EX + .45 * EHW)) < .14 * W) & (np.abs(z - (EZ + .8 * EHH)) < .08 * W)
        a = np.zeros(len(x)); a[box] = stroke(x[box], z[box], Pl, 1.15 * LASH_HW * EHH, .0040 * W)
        C = mix(C, rgb('furdeep'), (.22 if DESIGN == 'a' else .10) * a * fr)
    return C.reshape(sh + (3,))

def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    # the sheet: a big round iris (0.70 x 0.86 of the opening) tucked toward the nose and a little down, a white crescent on the
    # outer side, a big dark pupil, one big round catchlight upper-nasal and a small one low
    ix = -s * .24; iz = -.12; irx = .70; irz = .86
    C = mix(rgb('sclera'), rgb('#E8E0DA'), .50 * smooth(.40, .98, Z))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    g = smooth(.70, -.90, ez); ir = rgb('iris')
    I = mix(ir * .36, ir * .56, smooth(.05, .45, g))
    I = mix(I, ir * .74, smooth(.45, .85, g))
    I = mix(I, ir, .70 * smooth(.62, .97, g) * (1 - smooth(.80, .96, r)))     # the warm lower glow
    I = mix(I, ir * .36, .80 * smooth(.84, 1.0, r))                           # the darker rim
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    px_ = ix - s * .05; pz = iz + .04; R = np.sqrt(((X - px_) / .44) ** 2 + ((Z - pz) / .56) ** 2)
    C = mix(C, rgb('pupil'), .82 * (1 - smooth(.92, 1.06, R)))
    big = np.sqrt(((X - (-s * .17)) / .180) ** 2 + ((Z - .34) / .180) ** 2)
    small = np.sqrt(((X - (ix + s * .26)) / .050) ** 2 + ((Z - (iz - .46)) / .045) ** 2)
    C = mix(C, rgb('#FFFBF4'), np.maximum(1 - smooth(.92, 1.06, big), .55 * (1 - smooth(.85, 1.10, small))))
    C = mix(C, rgb('lash'), np.maximum(smooth(.93, 1.0, sr) * smooth(-.10, .40, Z), smooth(.86, .97, sr) * smooth(.20, .60, s * X) * smooth(-.80, -.30, Z)))
    C = mix(C, rgb('#6A4A44'), .35 * smooth(.95, 1.02, sr) * smooth(.0, -.40, Z))
    return C

if DESIGN == 'a':
    def paint_ear(U, V):
        """the lop ear's chart: u = angle round the centreline (0 = the outer face), v = along the ear; brown with soft modelling"""
        th = U * 2 * PI; t = V; P = LOP['P']
        tu = np.unique(t); Pc, T, A2, F2 = lop_frames(tu); k = np.searchsorted(tu, t)
        hw, ht = lop_prof(t)
        n = unit(A2[k] * (spow(np.cos(th), 2 - 2 / P) / hw)[..., None] + F2[k] * (spow(np.sin(th), 2 - 2 / P) / ht)[..., None]
                 + T[k] * (.7 * smooth(.88, 1., t))[..., None])
        return ramp_colour('ear', sval(n.reshape(-1, 3), hi=.30, occ=.10 * smooth(.25, .0, t).ravel()).reshape(t.shape))
else:
    def paint_ear(U, V):
        """the ear's chart: u = angle round the ear axis (0 = the back), v = along the ear; black fur with soft modelling and the
        recessed tan panel on the front (a crisp rounded border)"""
        e = EAR; B, Ua, Nf, A = ear_frame(); th = U * 2 * PI; t = V; P = e['P']
        na = spow(np.sin(th), 2 / P); nb = spow(-np.cos(th), 2 / P)
        hw, ht = ear_prof(t)
        n = unit(A[None] * (spow(np.sin(th), 2 - 2 / P) / np.maximum(hw, 1e-3))[..., None] + Nf[None] * (spow(-np.cos(th), 2 - 2 / P) / np.maximum(ht, 1e-3))[..., None]
                 + Ua[None] * (.6 * smooth(.85, 1., t))[..., None])
        C = ramp_colour('fur', sval(n.reshape(-1, 3), hi=.30).reshape(t.shape))
        dpan = ear_pan(na, t); front = (nb > 0).astype(float)
        # the panel only where the ear stands clear of the skull (round 2: slivers of it showed where the ear passes the skin)
        Pe = B[None] + np.outer(t.ravel() * e['L'], Ua) + np.outer((na * hw).ravel(), A) + np.outer((nb * ht).ravel(), Nf)
        front = front * smooth(.008, .030, head_nn(Pe)).reshape(t.shape)
        tan = ramp_colour('tan', .5 + .6 * (sval(n.reshape(-1, 3), hi=.10, lo=.12).reshape(t.shape) - .5) - .06 * smooth(.6, .2, t))
        C = mix(C, tan, smooth(-.0025, .0025, dpan) * front)
        return C

def paint_tail(U, V):
    """the tail chart: u = along the tail (0 root .. 1 tip), v = round it (0 = its upper side); the base colour with a soft
    light / shade round the section and the tip colour past a three-point zigzag border (the sheet's flame-shaped tip)"""
    base, tipc = ('fur', 'cream') if DESIGN == 'a' else ('fur', 'tan')
    sh_ = .50 + .22 * np.cos(2 * PI * V) - .05 * smooth(.3, .0, U)
    Cb = ramp_colour(base, sh_); Ct = ramp_colour(tipc, .5 + .7 * (sh_ - .5))
    zig = np.abs(((V * 3 + .5) % 1.0) - .5) * 2                          # 0 at the points .. 1 between them
    ub = TAIL_TIP_U - .085 * (1 - zig)
    return mix(Cb, Ct, smooth(ub - .010, ub + .010, U))
TAIL_TIP_U = .60 if DESIGN == 'a' else .62

def paint_ramp(U, V):
    rows = np.clip((V * CHARTS['ramp'][3] / 32).astype(int), 0, 15); C = np.zeros(U.shape + (3,))
    for name, k in RAMP_ROWS.items():
        m = rows == k
        if not m.any(): continue
        lo, base, hi = [rgb(c) for c in RAMPS[name]]
        u = U[m]; C[m] = np.where((u < .5)[:, None], mix(lo, base, smooth(0, .5, u)), mix(base, hi, smooth(.5, 1, u)))
    return C
PAINTERS = {'head': paint_head, 'eye.L': lambda U, V: paint_eye(U, V, 1), 'eye.R': lambda U, V: paint_eye(U, V, -1), 'ramp': paint_ramp, 'ear': paint_ear, 'tail': paint_tail}
PAINTERS.update(BODY_PAINTERS)
if RIG:
    PAINTERS['cavity'] = lambda U, V: mix(rgb('#4a1c1c'), rgb('#3a1414'), .5 * smooth(.3, 1, V))
    PAINTERS['tongue'] = lambda U, V: mix(rgb('#e07a86'), rgb('#ec96a0'), .5 * smooth(.2, .9, V))
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
def paint_atlas(path, base=None, only=None):
    if base is None:
        atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [246, 242, 240, 255]
    else: atlas = base.copy()
    for name, (x0, y0, w, h) in CHARTS.items():
        if name not in PAINTERS or (only is not None and name not in only): continue
        print('PAINT', name, flush=True)
        if name == 'ramp':
            U, V = np.meshgrid(clamp((np.arange(w) - 8) / (w - 16)), (np.arange(h) + .5) / h)
        elif name in ('spare', 'tail'):
            U, V = np.meshgrid(clamp((np.arange(w) - 8) / (w - 16)), clamp((np.arange(h) - 8) / (h - 16)))
        else:
            U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
        block = np.empty((h, w, 3))
        for r0 in range(0, h, 128):
            block[r0:r0 + 128] = PAINTERS[name](U[r0:r0 + 128], V[r0:r0 + 128])
        atlas[y0:y0 + h, x0:x0 + w, :3] = np.round(clamp(block) * 255).astype(np.uint8)
    raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    return atlas
atlas_path = os.path.join(ROOT, 'scratch', 'head_atlas.png') if HEAD_ONLY else (os.path.join(ROOT, 'scratch', 'rig_base_atlas_%s.png' % DESIGN) if RIG else os.path.join(ROOT, TASK + '_atlas.png'))
ATLAS = paint_atlas(atlas_path)
img = bpy.data.images.load(atlas_path); img.name = NAME + '_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new(NAME + '_toy_atlas'); MAT.use_nodes = True
bs = next(n_ for n_ in MAT.node_tree.nodes if n_.type == 'BSDF_PRINCIPLED'); bs.inputs['Roughness'].default_value = .8
bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .12
TEX = MAT.node_tree.nodes.new('ShaderNodeTexImage'); TEX.image = img; TEX.interpolation = 'Linear'
MAT.node_tree.links.new(TEX.outputs['Color'], bs.inputs['Base Color'])

# ============================================================== MEASURE (before joining; build units unless marked)
def all_verts(obs): return np.array([list(o.matrix_world @ v.co) for o in obs for v in o.data.vertices])
nose_tip_y = HY + NOSE_TIP_L * W
def prof_at(zw, xw=0.): return round(float((front_hit(xw * W, CHIN + zw * W)[0] - nose_tip_y) / W), 3)
rimL = np.array([verts[i] for i in roll_info[1][0]])
cheek_rows = {}
for zw in (.0, .02, .04, .08, .14, .20, .26, .32, .36, .40, .45, .50, .55, .60, .65):
    xs_ = np.linspace(0, .7, 351)
    ys_ = front_local(xs_, np.full(len(xs_), zw), head_local); ok = np.isfinite(ys_)
    cheek_rows['%.2f' % zw] = round(float(2 * xs_[ok].max()), 3) if ok.any() else None
MEAS = {'units': 'W = %.3f m head width between the cheek points; z = above the chin in W; profile b = behind the nose tip in W' % W,
        'chin_z_m': round(CHIN, 4), 'skull_crown_m': round(CROWN_M, 4), 'head_height_W (skull, under the hat)': round((CROWN_M - CHIN) / W, 3),
        'hat_anchor_m': [round(float(c), 4) for c in HAT_ANCHOR],
        'face_width_rows_W(z: width)': cheek_rows,
        'nose_tip_y_m': round(float(nose_tip_y) * S_FINAL, 4),
        'profile_b(z)': {'%.3f' % zw: prof_at(zw) for zw in (.02, .05, .09, .12, .16, .20, .263, .30, .336, .40, .45, .50, .55, .60, .65)},
        'eye_white_front_edge_b': round(float((rimL[:, 1].min() - nose_tip_y) / W), 3),
        'eye_opening_W': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'eye_centre_W': [EXW, EZW], 'nose_z_W': NZW, 'nose_width_W': round(2 * NOSE[1][0], 3),
        'mouth_z_W': MZW, 'mouth_width_W': round(2 * MHW / W, 3)}
for tag in ('L', 'R'):
    if 'ear.' + tag in parts:
        ev = all_verts(parts['ear.' + tag])
        MEAS['ear_' + tag] = {'x_min_W': round(float(ev[:, 0].min() / W), 3), 'x_max_W': round(float(ev[:, 0].max() / W), 3),
                              'b_min': round(float((ev[:, 1].min() - nose_tip_y) / W), 3), 'b_max': round(float((ev[:, 1].max() - nose_tip_y) / W), 3),
                              'z_min_W': round(float((ev[:, 2].min() - CHIN) / W), 3), 'z_max_W': round(float((ev[:, 2].max() - CHIN) / W), 3)}
MEAS.update(LOG)
MEAS.update(globals().get('BODY_MEAS', {}))

# ============================================================== JOIN, CLEAN, NORMALS, FINAL SCALE (S_FINAL)
objects = []; part_tri = {}
PIVOTS = {'head': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'],
          'ear.L': tuple(ear_info['L']['base']), 'ear.R': tuple(ear_info['R']['base']), HAT_GROUP: tuple(HAT_ANCHOR),
          'lash.L': eye_centers['L'], 'lash.R': eye_centers['R']}
PIVOTS.update(BODY_PIVOTS)
OBJ_TRIS = {}
for group, obs in parts.items():
    for ob in obs: ob.data.calc_loop_triangles(); OBJ_TRIS[ob.name] = len(ob.data.loop_triangles)
print('OBJ_TRIS', json.dumps(dict(sorted(OBJ_TRIS.items(), key=lambda kv: -kv[1])[:50])), flush=True)
for group, obs in parts.items():
    for ob in obs:
        ob.data.materials.clear(); ob.data.materials.append(MAT)
        if RIG:
            vg = ob.vertex_groups.new(name='_part_' + ob.name); vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs: ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1: bpy.ops.object.join()
    ob = bpy.context.object; ob.name = NAME + '_' + group.replace('.', '_'); ob.data.name = ob.name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-8)
    bad = [f for f in bm.faces if f.calc_area() < 1e-12]
    if bad: bmesh.ops.delete(bm, geom=bad, context='FACES')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if not RIG:
        for v in bm.verts: v.co = v.co * S_FINAL                 # build units -> metres (crown 1.00 m); the rig scales at its end
    bm.to_mesh(ob.data); bm.free()
    me = ob.data
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    if me.attributes.get('cust_n') is not None:
        a = me.attributes.get('cust_n')
        sn = np.zeros(len(me.vertices) * 3, np.float32); a.data.foreach_get('vector', sn); sn = sn.reshape(-1, 3)
        cn = np.zeros(len(me.loops) * 3, np.float32); me.corner_normals.foreach_get('vector', cn); cn = cn.reshape(-1, 3)
        lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
        use = np.linalg.norm(sn[lv], axis=1) > .5; cn[use] = sn[lv][use]
        me.normals_split_custom_set([tuple(v) for v in cn]); me.attributes.remove(me.attributes['cust_n'])
    bpy.context.scene.cursor.location = tuple(np.array(PIVOTS.get(group, (0, 0, 0))) * (1. if RIG else S_FINAL)); bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); assert np.isfinite(co).all(), ('Nonfinite position', ob.name)
    for p in me.polygons: assert all(math.isfinite(c) for c in p.normal) and p.normal.length > .5, ('Bad normal', ob.name, p.index)
    ob['phase'] = '1: neutral A-pose, no armature'; ob['front_axis'] = '-Y'; ob['units'] = 'metres'
    me.calc_loop_triangles(); part_tri[ob.name] = len(me.loop_triangles); objects.append(ob)
tri_count = sum(part_tri.values()); print('PART_TRIANGLES', json.dumps(part_tri), flush=True)
HEADSET = sum(v for k, v in part_tri.items() if k in [NAME + '_' + g for g in ('head', 'eye_L', 'eye_R', 'lash_L', 'lash_R', 'ear_L', 'ear_R', HAT_GROUP)])
MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count; MEAS['head_face_eyes_ears_hat_triangles'] = HEADSET
allv = np.concatenate([np.array([list(o.matrix_world @ v.co) for v in o.data.vertices]) for o in objects])
MEAS['bounds_final_m'] = {'min': [round(float(c), 4) for c in allv.min(0)], 'max': [round(float(c), 4) for c in allv.max(0)]}
if RIG:
    assert tri_count <= 32000, ('Triangle budget (rig: the denser toon-refined head; the rig total is checked against 34k)', tri_count)
elif not HEAD_ONLY:
    assert tri_count <= 22000, ('Triangle budget', tri_count)
    POST_JOIN = globals().get('POST_JOIN')
    if POST_JOIN: POST_JOIN()
    with open(os.path.join(ROOT, 'measurements-%s.json' % DESIGN), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-head-%s.json' % DESIGN), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
if not RIG: print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not HEAD_ONLY and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, TASK + '.blend'))
def export(path):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects: ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                              export_animations=False)
if not RIG: export(OUT_MODEL)
print('FOLK_BUILD_DONE', DESIGN, json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
