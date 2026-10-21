"""Tanuki Bandit (Option A "Acorn Bandit"), Toybox line, phase-1 model (neutral A-pose, no rig). Blender 4.3, no addons.
Deterministic: a full rebuild from an empty scene.

    blender --background --factory-startup --python build_tanuki-toy.py [-- --head-only]

Final asset: 1 unit = 1 m, front = -Y, feet on z = 0, character left = +X, crown (excluding the ears and the tuft) at 1.00 m.
Writes only inside this folder and public/models/tanuki-toy.glb + tanuki-toy_maroon.glb (--head-only: scratch/ only).

Technique (the Poe / Moka / Rosie toy-line machinery):
- Everything is authored in "build units" where the crown sits at 1.20 m (the Toybox Chewy / Poe scale, so their proven
  millimetre constants carry over); the join step scales every mesh by S = 1/1.2 so the delivered crown is 1.00 m.
- The head is ONE smooth implicit ball: a rounded skull (an elliptic dome over a squarer jaw), two soft fur points on
  each cheek (the tanuki ruff), a barely-proud cream muzzle, a soft chin and a small button nose, with a set-in socket warp
  for each eye. The skin is the field's zero surface reached by radial projection (CDT in a stereographic domain with
  edge loops round the eyelids, nose and mouth), so every vertex carries its analytic normal; adaptive refinement adds
  points where the game's hard toon band would zigzag. The eyes are separate lens globes following the ball.
- Ears are thick cupped rounded triangles (offset shells with rounded rims) rising from the skull; the quiff is three
  swept fur lobes. Clothing is lathed / swept / thickened surfaces and SDF star meshes; limbs are SDF ring stacks; the
  big ringed tail is an SDF ring stack with bend loops.
- One 2048 painted atlas: the face (bandit mask, cream muzzle, brows, blush, mouth) and eyes painted from 3D positions,
  2D charts for the gi top, the ears and the tail rings, 1-D shading ramps (soft painted light) for everything else.
"""
import bpy, bmesh, math, json, os, sys, struct, zlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt
from mathutils.bvhtree import BVHTree

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HEAD_ONLY = '--head-only' in ARGV
RIG = bool(globals().get('RIG_MODE'))      # set by rig_tanuki-toy.py: part labels, lid / cavity charts, build units kept, no approved file written
MODELS = 'D:/projects/chewy-life-3d/public/models'
MODEL = MODELS + '/tanuki-toy.glb'; MODEL_MAROON = MODELS + '/tanuki-toy_maroon.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'tanuki-head-test.glb') if HEAD_ONLY else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
S_FINAL = 1 / 1.2                          # build units (crown 1.20) -> metres (crown 1.00)
# sheet front view (refs/sheet.png): crown y 129, ground y 500 (371 px = 1.00 m = 1.20 build units), centre x 191.
# head: W 234 px (between the cheek points; 247 px over them), crown-to-chin H 162 px (H = 0.692 W), chin y 291.
W = .757; CHIN = .676; HY = .020          # head width, chin height, head centre y (build units)
LOG = {}

GI = {'navy': ('#4A4A6A', '#5E5E84', '#38384F'), 'maroon': ('#6A3A3A', '#82504C', '#512A2B')}
GI_VARIANT = os.environ.get('TANUKI_GI', 'navy')
PAL = {'fur': '#8A6A58', 'furlight': '#A2826C', 'furdark': '#6C5143',
       'cream': '#E0CBB0', 'creamlight': '#F0E0C8', 'creamdark': '#C6AD90',
       'mask': '#3A2C28', 'masklight': '#54423A', 'maskdark': '#2A201E',
       'nose': '#3A2C28', 'nosehi': '#7A6258',
       'sclera': '#FFF6EA', 'iris': '#DDA443', 'pupil': '#2A1A12',
       'lash': '#1E1614', 'mouth': '#2E2220', 'blush': '#EE9484',
       'gi': GI[GI_VARIANT][0], 'gilight': GI[GI_VARIANT][1], 'gidark': GI[GI_VARIANT][2],
       'trousers': '#2A2A3A', 'trouserslight': '#3A3A50', 'trousersdark': '#22222E',
       'scarf': '#E8503A', 'scarflight': '#F47458', 'scarfdark': '#C03A2A',
       'pouch': '#9A7450', 'pouchlight': '#B48C66', 'pouchdark': '#76563A',
       'acorn': '#C08A4E', 'acornlight': '#D8A468', 'acorndark': '#9A6A38',
       'cap': '#6A4A32', 'caplight': '#866246', 'capdark': '#503624',
       'dark': '#2A2230'}
CHARTS = {'head': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'top': (0, 0, 1024, 768), 'ear': (1024, 0, 512, 512),
          'tail': (1536, 0, 512, 768), 'spare': (1024, 512, 512, 256)}
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'mask': ('maskdark', 'mask', 'masklight'),
         'cream': ('creamdark', 'cream', 'creamlight'), 'gi': ('gidark', 'gi', 'gilight'),
         'giin': ('#1E1E2A', '#26263A', '#30304A'), 'trousers': ('trousersdark', 'trousers', 'trouserslight'),
         'scarf': ('scarfdark', 'scarf', 'scarflight'), 'pouch': ('pouchdark', 'pouch', 'pouchlight'),
         'acorn': ('acorndark', 'acorn', 'acornlight'), 'cap': ('capdark', 'cap', 'caplight'),
         'pad': ('#2E2420', '#4A3A34', '#5E4C44'), 'hole': ('#1A1418', '#221A1E', '#2C2226')}
RAMP_ROWS = {k: i for i, k in enumerate(RAMPS)}
if RIG:   # phase-2 charts in the free atlas block x 1280-2048, y 768-1152 (the approved paint is untouched); lid charts are transposed
    CHARTS.update({'lidU': (1280, 768, 512, 160), 'lidD': (1280, 928, 512, 128), 'cavity': (1792, 768, 128, 128), 'tongue': (1920, 768, 128, 128)})
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

def star_mesh(name, sdf, centre, group, uvfn, nth=16, nph=24, tmax=.3, axis=(0, 0, 1.), ref=(1., 0, 0)):
    """closed star-shaped surface: outermost root of sdf along rays from centre on a lat-long grid, field normals"""
    c = np.asarray(centre, float); ax_ = unit(np.asarray(axis, float)); r0 = unit(np.asarray(ref, float) - ax_ * (np.asarray(ref) @ ax_)); b0 = np.cross(ax_, r0)
    th = np.linspace(0, PI, nth + 1)[1:-1]; ph = np.linspace(0, 2 * PI, nph, endpoint=False)
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
# Skull: from the front an elliptic dome (exponent NU) over a squarer, broad jaw (exponent NL), widest at the cheek line
# z = ZC (the sheet: widest 0.20 W above the chin); in depth a superellipse (exponent PD) so the face stays fairly upright
# (the sheet's side view: forehead and muzzle on one near-vertical plane). Distance = field / |grad| (numerical).
SK = dict(a=.500, zc=.200, cu=.492, cl=.214, nu=2.05, nl=2.75, bf=.405, bb=.395, pd=2.00, face=.040, pdf=2.20)
def skull(q):
    """first-order distance (r - 1) / |grad r| with the analytic gradient (n, pd, a vary slowly: their derivatives are ignored)"""
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    zr = z - SK['zc']
    c = np.where(zr > 0, SK['cu'], SK['cl'])
    a = SK['a'] * (1 - SK['face'] * smooth(-.05, -.40, y))
    n = SK['nl'] + (SK['nu'] - SK['nl']) * smooth(-.10, .12, zr)
    ax_ = np.abs(x) / a + 1e-9; az_ = np.abs(zr) / c + 1e-9
    s = (ax_ ** n + az_ ** n) ** (1 / n)
    b = np.where(y < 0, SK['bf'], SK['bb']); ay_ = np.abs(y) / b + 1e-9
    pd = SK['pd'] + (SK['pdf'] - SK['pd']) * smooth(.0, -.30, y) * smooth(-.25, .25, zr)   # the upright face plane
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

# the tanuki cheek ruff (round 2): one soft continuous flare on each cheek at the widest line (sheet z 0.19-0.26 W), out to
# ~0.53 W, set a little behind the face; broad and shallow so it widens the silhouette without reading as a lump
RUFF = [([.440, .075, .224], [.090, .125, .100])]; K_RUFF = .050
def ruff_sdf(q):
    qa = np.array(q, float, copy=True); qa[..., 0] = np.abs(qa[..., 0]); d = None
    for c, r in RUFF:
        dd = ell(qa, c, r); d = dd if d is None else smin(d, dd, .012)
    return d
_ym = float(front_local(0, .165, skull)[0])
MUZ = [[0, _ym + .090 - .052, .168], [.145, .090, .085]]; K_MUZ = .046       # the cream muzzle, 0.30 W wide, 0.04 W proud
CHN = [[0, _ym + .080 - .012, .082], [.130, .080, .060]]; K_CHN = .060       # a soft chin under it
def _skull_hit(D, c=np.array([0, 0, .30])):
    lo = np.full(len(D), .05); hi = np.full(len(D), .95)
    for _ in range(36):
        m = (lo + hi) / 2; inn = skull(c + D * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return c + D * ((lo + hi) / 2)[:, None]
# (root dir, mid dir, tip dir from the head centre; root / tip radius; tip lift off the skull) -- each lobe starts on the
# front of the crown and sweeps back over the top, curling sideways (a swirl), its tip lifting a little at the back
QUIFF = [((.000, -.66, .75), (.090, -.42, .90), (.210, -.22, .95), .060, .027, .030),     # all three curl the same way: a swirl
         ((-.130, -.60, .79), (-.090, -.36, .93), (.030, -.14, .99), .052, .024, .020),
         ((.140, -.58, .80), (.250, -.38, .88), (.320, -.18, .93), .046, .021, .016)]
QLOBES = []
for _r, _m, _t, _r0, _r1, _lift in QUIFF:
    _P = _skull_hit(unit(np.array([_r, _m, _t], float)))
    _N = np.array([unit(p_ - np.array([0, 0, .30])) for p_ in _P])
    QLOBES.append((_P[0] - _N[0] * .020, _P[1] + _N[1] * .010, _P[2] + _N[2] * _lift, _r0, _r1))
def quiff_lobe_sdf(q, k):
    a, m, b, r0, r1 = QLOBES[k]; p_ = q.reshape(-1, 3); rm = .55 * r0 + .45 * r1
    return smin(sd_capsule(p_, a, m, (r0, rm)), sd_capsule(p_, m, b, (rm, r1)), .02).reshape(q.shape[:-1])
def quiff_sdf(q):
    d = quiff_lobe_sdf(q, 0)
    for k in range(1, len(QLOBES)): d = smin(d, quiff_lobe_sdf(q, k), .032)
    return d
K_QUIFF = .026
def base_local(q):
    d = skull(q)
    d = smin(d, ruff_sdf(q), K_RUFF)
    d = smin(d, quiff_sdf(q), K_QUIFF)
    d = smin(d, ell(q, *MUZ), K_MUZ)                 # round 1: no separate chin bulge (it read as a jowl crease)
    return d

# eye layout (W units): centres +-0.195 W, 0.245 W above the chin; opening 0.21 W x 0.18 W (sheet close-up), round-ish
EXW, EZW, EHWW, EHHW, EN = .195, .245, .101, .087, 2.05
RECESS = dict(delta=.050, tilt=-.60, F_out=.15, F_nas=.060, F_up=.070, F_dn=.060)
def eye_recess(q):
    """the set-in socket: depth over each opening (deeper on the nose side: the eye turns outward), C2 falloff outside"""
    x, y, z = q[..., 0], q[..., 1], q[..., 2]; tot = 0
    for s in (-1, 1):
        X = s * (x - s * EXW) / EHWW; Z = (z - EZW) / EHHW
        sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN) + 1e-9
        c = X / sr; sn = Z / sr
        dout = (sr - 1) * np.sqrt((EHWW * c) ** 2 + (EHHW * sn) ** 2)
        F = np.sqrt((np.where(c > 0, RECESS['F_out'], RECESS['F_nas']) * c) ** 2 + (np.where(sn > 0, RECESS['F_up'], RECESS['F_dn']) * sn) ** 2)
        w = (1 - smoother(.012, .012 + F, dout)) * (1 - RECESS['tilt'] * np.clip(X, -1.3, 1.3) / 1.3)
        tot = np.maximum(tot, w)
    return tot * smooth(-.12, -.30, y)
NZW = .197                                                  # nose centre 0.197 W above the chin (sheet 0.184-0.204)
NECK = [[0, -.005, -.250], [.150, .140, .270]]; K_NECK = .07
def warped(q):
    qw = np.array(q, float, copy=True); qw[..., 1] = q[..., 1] - RECESS['delta'] * eye_recess(q); return qw
_yf = float(front_local(0, NZW, lambda q: base_local(warped(q)))[0])
NOSE = [[0, _yf + .032 - .021, NZW + .002], [.045, .031, .031]]; K_N = .012       # small button, 0.09 W wide
def head_local(q, neck=True):
    d = base_local(warped(q))
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

# crown height check: the skull top must sit at 1.200 build units (1.00 m)
_g = np.stack(np.meshgrid(np.zeros(1), np.linspace(-.5, .5, 101), np.linspace(.55, .80, 251), indexing='ij'), -1).reshape(-1, 3)
CROWN_M = float(CHIN + W * _g[skull(_g) < 0][:, 2].max())            # the skull's crown (the quiff is not counted)
QUIFF_TOP_W = float(_g[head_local(_g) < 0][:, 2].max())
LOG['crown_build'] = round(CROWN_M, 4)
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
NZ = CHIN + NZW * W; MZW = .150; MZ = CHIN + MZW * W; MHW = .084 * W     # the small omega mouth at 0.14 W, 0.17 W wide
BLUSH = (.300 * W, CHIN + .112 * W, .088 * W, .060 * W)

# ============================================================== HEAD SKIN: CDT on the ball, eyelid / nose / mouth loops
pts = []; cons = []; tags = {}
def add_loop(P, tag, closed=True):
    i0 = len(pts); pts.extend([tuple(p) for p in P]); n = len(P)
    for i in range(n if closed else n - 1): cons.append((i0 + i, i0 + (i + 1) % n))
    tags[tag] = list(range(i0, i0 + n)); return tags[tag]
def surf_dir(x, z):
    y = front_hit(x, z); return unit(np.stack([np.asarray(x, float) * np.ones_like(y), y, np.asarray(z, float) * np.ones_like(y)], -1) - O)

NE = 56
EYE_SCALES = [1.0, 1.06, 1.13, 1.21, 1.30, 1.40]
eye_dom = {}
for s in (-1, 1):
    psi = np.linspace(0, 2 * PI, NE, endpoint=False)
    x, z = eye_xz(s, psi); base = to_dom(surf_dir(x, z)); c = to_dom(surf_dir(np.array([s * EX]), np.array([EZ])))[0]
    eye_dom[s] = (c, base)
    wn = (1 - .72 * smooth(-.10, -.80, np.cos(psi))) * (1 - .45 * smooth(-.20, -.90, np.sin(psi)))   # tighter toward the nose and the muzzle
    for k, kk in enumerate(EYE_SCALES): add_loop(c + (base - c) * (1 + (kk - 1) * wn[:, None]), 'eye%d_%d' % (s, k))
pts.append(tuple(to_dom(surf_dir(np.array([0.]), np.array([NZ])))[0])); tags['nose_c'] = [len(pts) - 1]
for k, (rx, rz, n) in enumerate([(.020, .013, 10), (.034, .022, 14), (.046, .030, 18), (.056, .036, 22)]):
    a = np.linspace(0, 2 * PI, n, endpoint=False) + .3 * k
    add_loop(to_dom(surf_dir(rx * W * np.cos(a), NZ + .002 * W + rz * W * np.sin(a))), 'nose_%d' % k)
for k, (hx, hz) in enumerate([(.092, .012), (.103, .016), (.114, .020)]):
    a = np.linspace(0, 2 * PI, 48, endpoint=False)
    add_loop(to_dom(surf_dir(hx * W * spow(np.cos(a), .8), MZ - .012 * W + hz * W * np.sin(a))), 'mouth_%d' % k)
NB = 72; AB = math.radians(122)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
def fib(nf, amax):
    ii = np.arange(nf) + .5; phi = np.arccos(1 - 2 * ii / nf); th = PI * (1 + 5 ** .5) * ii
    D = np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
    return D[np.arccos(np.clip(-D[:, 1], -1, 1)) < amax]
D = fib(1500, math.radians(118.5)); Pf = radial_hit(D)
D2 = fib(3700, math.radians(74)); P2 = radial_hit(D2)       # a finer fill over the face, where it bends most
def fine_zone(P):
    q = M2L(P)
    return ((np.abs(q[:, 0]) < .50) & (q[:, 2] > .06) & (q[:, 2] < .66)) & (P[:, 1] < HY - .05 * W)
D = np.concatenate([D[~fine_zone(Pf)], D2[fine_zone(P2)]]); Pf = np.concatenate([Pf[~fine_zone(Pf)], P2[fine_zone(P2)]])
D3 = fib(3400, math.radians(112)); P3 = radial_hit(D3)       # the cheek ruff points: a finer fill so their silhouette stays round
def ruff_zone(P):
    q = M2L(P); return (np.abs(q[:, 0]) > .40) & (q[:, 2] > .11) & (q[:, 2] < .34) & (q[:, 1] > -.20) & (q[:, 1] < .20)
D = np.concatenate([D[~ruff_zone(Pf)], D3[ruff_zone(P3)]]); Pf = np.concatenate([Pf[~ruff_zone(Pf)], P3[ruff_zone(P3)]])
D4 = fib(6000, math.radians(110)); P4 = radial_hit(D4)       # the quiff on the crown: fine enough to carry its lobes and creases
def quiff_zone(P):
    q = M2L(P); return (np.abs(q[:, 0]) < .25) & (q[:, 2] > .52) & (q[:, 1] > -.44) & (q[:, 1] < .04)
D = np.concatenate([D[~quiff_zone(Pf)], D4[quiff_zone(P4)]]); Pf = np.concatenate([Pf[~quiff_zone(Pf)], P4[quiff_zone(P4)]])
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
keep &= ~(front & ((Pf[:, 0] / (.072 * W)) ** 2 + ((Pf[:, 2] - NZ - .002 * W) / (.050 * W)) ** 2 < 1))
keep &= ~(front & ((Pf[:, 0] / (.135 * W)) ** 2 + ((Pf[:, 2] - MZ) / (.050 * W)) ** 2 < 1))
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
REFINE_ADD = int(os.environ.get('REFINE_ADD', '300')); D_LOW, D_T = .12, float(os.environ.get('REFINE_DT', '.45'))
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
        verts.append(tuple(P - .0045 * n + .0016 * t)); vdir.append(vdir[vi]); vnorm.append(unit(.30 * n + t)); rr.append(i0 + k)
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
NSEG = 30
eye_centers = {}
def eye_h(k): return .0024 - .0060 * k * k
for s, tag in ((-1, 'R'), (1, 'L')):
    psi = np.linspace(0, 2 * PI, NSEG, endpoint=False); rows = []
    cx = s * EX; Sc = np.array([cx, float(front_hit(cx, EZ)[0]), EZ]); axis = grad_n(Sc[None])[0]
    for k in ES:
        if k == 0: x = np.array([cx]); z = np.array([EZ])
        else: x, z = eye_xz(s, psi, k)
        y = front_hit(x, z); S = np.stack([x, y, z], -1); n = grad_n(S); rows.append(S + n * eye_h(k))
    rim = rows[-1]
    for depth, sc in [(.012, .86), (.024, .58)]: rows.append(Sc + (rim - Sc) * sc - axis * depth)
    tip = Sc - axis * .032
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
    eye_centers[tag] = [float(v) for v in (Sc - axis * .016)]
    LOG['eye_axis_' + tag] = {'out_deg': round(math.degrees(math.atan2(s * axis[0], -axis[1])), 1),
                              'down_deg': round(math.degrees(math.asin(-axis[2])), 1)}


print('STEP ears', flush=True)
# ============================================================== EARS: thick cupped rounded triangles (tanuki ears)
# Each ear is a polar-gridded rounded triangle in its own plane (A across, U up, Nf = the cupped front, turned 38 deg out),
# rising from the skull's upper side; the part buried in the skull is deleted. The mid-surface is cupped (the front is
# concave, the back convex) and the top leans back a little; thicken() gives it a rounded rim and analytic-ish normals.
# Built for the left ear (+X) and mirrored. Head-local W units throughout.
OC = np.array([0, 0, .30])
def skull_hit_local(D, f=None):
    f = f or (lambda q: base_local(q))
    lo = np.full(len(D), .05); hi = np.full(len(D), .95)
    for _ in range(34):
        m = (lo + hi) / 2; inn = f(OC + D * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return OC + D * ((lo + hi) / 2)[:, None]
EAR = dict(dir=(.680, .070, .730), face_out=22., face_up=.10, up=(.16, .10, .98), hb=.182, Lh=.178, bury=.150,
           apex_a=.030, r_apex=.092, r_base=.050, T=.100, cup=.028, lean=.034, nal=60, nrh=7)
def tri2d_sdf(p, A_, B_, C_):
    """signed distance to a 2-D triangle (p: (n, 2)), negative inside"""
    def seg(p, a, b):
        pa = p - a; ba = b - a; h = np.clip((pa @ ba) / (ba @ ba), 0, 1); return np.linalg.norm(pa - h[:, None] * ba, axis=1)
    d = np.minimum(np.minimum(seg(p, A_, B_), seg(p, B_, C_)), seg(p, C_, A_))
    def side(a, b): return (b[0] - a[0]) * (p[:, 1] - a[1]) - (b[1] - a[1]) * (p[:, 0] - a[0])
    s1, s2, s3 = side(A_, B_), side(B_, C_), side(C_, A_)
    inside = ((s1 >= 0) & (s2 >= 0) & (s3 >= 0)) | ((s1 <= 0) & (s2 <= 0) & (s3 <= 0))
    return np.where(inside, -d, d)
def ear_outline_sdf(p):
    e = EAR; r = e['r_apex']
    A_ = np.array([-e['hb'] + r, -e['bury'] + r]); B_ = np.array([e['hb'] - r, -e['bury'] + r]); C_ = np.array([e['apex_a'], e['Lh'] - r])
    return tri2d_sdf(p, A_, B_, C_) - r
ear_info = {}; EAR_GRID = {}
def build_ear():
    e = EAR
    d0 = unit(np.array(e['dir'])); B = skull_hit_local(d0[None])[0]
    fo = math.radians(e['face_out'])
    Nf = unit(np.array([math.sin(fo), -math.cos(fo), e['face_up']]))
    U = np.array(e['up'], float); U = unit(U - Nf * (U @ Nf)); A = unit(np.cross(U, Nf))
    # polar grid round the outline centre
    c2 = np.array([e['apex_a'] * .4, .060])
    al = np.linspace(0, 2 * PI, e['nal'], endpoint=False); rh = np.linspace(0, 1, e['nrh'] + 1)[1:]
    D2 = np.stack([np.cos(al), np.sin(al)], -1)
    lo = np.zeros(len(al)); hi = np.full(len(al), .8)
    for _ in range(40):
        m = (lo + hi) / 2; ins = ear_outline_sdf(c2 + D2 * m[:, None]) < 0
        lo = np.where(ins, m, lo); hi = np.where(ins, hi, m)
    RM = (lo + hi) / 2
    P2 = [c2]; RHO = [0.]
    for r_ in rh:
        rr = r_ ** .85                                       # a little denser toward the rim
        for k in range(len(al)): P2.append(c2 + D2[k] * RM[k] * rr); RHO.append(rr)
    P2 = np.array(P2); RHO = np.array(RHO)
    a_, h_ = P2[:, 0], P2[:, 1]
    hn = clamp((h_ + .02) / e['Lh'])
    wrel = clamp(1 - (np.abs(a_ - e['apex_a'] * hn) / (e['hb'] * (1 - .78 * hn) + 1e-3)) ** 2)
    cup = -e['cup'] * wrel * smooth(-.04, .08, h_) * (1 - .55 * smooth(.55, 1., hn))
    lean = -e['lean'] * hn ** 2
    G = B + A[None] * a_[:, None] + U[None] * h_[:, None] + Nf[None] * (cup + lean)[:, None]
    NAL = len(al)
    F = [(0, 1 + k, 1 + (k + 1) % NAL) for k in range(NAL)]
    for j in range(len(rh) - 1):
        for k in range(NAL):
            a0 = 1 + j * NAL + k; b0 = 1 + j * NAL + (k + 1) % NAL; F.append((a0, a0 + NAL, b0 + NAL, b0))
    # normals of the mid-surface (front = +Nf side)
    Nv = np.zeros_like(G)
    for f in F:
        n_ = np.cross(G[f[1]] - G[f[0]], G[f[2]] - G[f[0]])
        for i in f: Nv[i] += n_
    Nv = unit(Nv)
    if (Nv @ Nf).mean() < 0: Nv = -Nv
    thk = e['T'] * (1 - .18 * RHO ** 2) * (1 - .18 * hn)
    uvo = au('ear', .5 + a_ / (2.2 * e['hb']), clamp((h_ + e['bury']) / (e['Lh'] + e['bury'])))
    Vt, Ft, UVt, Nt = thicken(G, F, Nv, thk, uvo, ramp_uv('mask', .45), ramp_uv('mask', .58), rim=4)
    # the back and rim: soft painted light from their own normals (the front keeps its chart)
    n_front = len(G)
    back = np.arange(len(Vt)) >= n_front
    UVt = np.array(UVt, float); UVt[back] = ramp_uv('mask', sval(Nt[back], hi=.12, lo=.16))
    # delete what is buried in the skull (more than 1 cm inside)
    dsk = base_local(Vt)
    Fk = [f for f in Ft if not all(dsk[i] < -.012 for i in f)]
    used = sorted(set(i for f in Fk for i in f)); remap = {o: n for n, o in enumerate(used)}
    Vt = Vt[used]; UVt = UVt[used]; Nt = Nt[used]; Fk = [tuple(remap[i] for i in f) for f in Fk]
    return Vt, Fk, UVt, Nt, dict(B=B, U=U, A=A, Nf=Nf, apex=B + U * e['Lh'] + A * e['apex_a'], G=G, hn=hn)
_Ve, _Fe, _UVe, _Ne, _ei = build_ear()
for side, tag in ((1, 'L'), (-1, 'R')):
    V_ = _Ve.copy(); N_ = _Ne.copy(); F_ = _Fe
    if side < 0:
        V_[:, 0] *= -1; N_[:, 0] *= -1; F_ = [tuple(f[::-1]) for f in _Fe]
    make_obj('tanuki_ear.' + tag, L2M(V_), F_, _UVe, 'ear.' + tag, N=N_)
    mir = np.array([side, 1, 1.])
    ear_info[tag] = {'base': L2M(_ei['B'] * mir).tolist(), 'mid': L2M((_ei['B'] + _ei['U'] * EAR['Lh'] * .5) * mir).tolist(),
                     'tip': L2M(_ei['apex'] * mir).tolist()}
    EAR_GRID[tag] = (L2M(_ei['G'] * mir), _ei['hn'])

# round 2: the quiff is part of the head field (QUIFF above); its lobe tips are recorded for the rig
tuft_info = [L2M(l[2][None])[0].tolist() for l in QLOBES]

if HEAD_ONLY:
    BODY_PAINTERS = {}; BODY_PIVOTS = {}; JOINTS_BODY = {}
else:
    # ============================================================== BODY AND COSTUME (build units: crown 1.20)
    # body axis x = 0, y = RCY. Heights from the sheet's front view: z = (500 - sheet y) / 309.2.
    RCY = .000
    def crease(a, b, k): return clamp((np.minimum(a, b) - smin(a, b, k)) / k)
    def ramp_fn(name, hi=.28, occ=0., add=0.):
        return lambda NN, V, *a: ramp_uv(name, sval(NN, occ=occ, hi=hi) + add)
    def ramp_sw(name, hi=.28, occ=0., add=0.):          # for sweep(): uvfn(NV, tt, uu, V)
        return lambda NV, tt, uu, V: ramp_uv(name, sval(NV, occ=occ, hi=hi) + add)

    print('BODY_STEP gi top', flush=True)
    # ---------------------------------------------------------------- the gi: one lathed superellipse body, hem flaring over the trousers
    TZ = np.array([.226, .258, .296, .336, .376, .420, .466, .512, .552, .590, .626, .660])
    TAX = np.array([.296, .290, .276, .262, .254, .251, .249, .245, .236, .214, .178, .128])
    TAY = np.array([.244, .238, .228, .219, .212, .210, .207, .203, .196, .182, .158, .118])
    tax_f = natspline(TZ, TAX); tay_f = natspline(TZ, TAY); TP = 2.3
    def torso_raw(a, z):
        a = np.asarray(a, float); z = np.asarray(z, float)
        return np.stack([tax_f(z) * spow(np.sin(a), 2 / TP), RCY - tay_f(z) * spow(np.cos(a), 2 / TP), z + 0 * a], -1)
    def torso_n(a, z, e=1e-4):
        da = torso_raw(np.asarray(a) + e, z) - torso_raw(np.asarray(a) - e, z)
        dz = torso_raw(a, np.asarray(z) + e) - torso_raw(a, np.asarray(z) - e)
        n = unit(np.cross(dz, da)); c = torso_raw(a, z) - np.stack([0 * np.asarray(a), RCY + 0 * np.asarray(a), np.asarray(z) + 0 * np.asarray(a)], -1)
        return np.where(((n * c).sum(-1) < 0)[..., None], -n, n)
    def torso_pt(a, z, off=0.):
        return torso_raw(a, z) + torso_n(a, z) * np.asarray(off, float)[..., None]
    def torso_front_a(x, z):
        s_ = np.clip(np.asarray(x, float) / tax_f(z), -.999, .999); return np.arcsin(spow(s_, TP / 2))
    def torso_front_y(x, z): return torso_raw(torso_front_a(x, z), z)[..., 1]
    NA_T, NZ_T = 32, 16
    zt_ = np.concatenate([np.linspace(TZ[0], .30, 4)[:-1], np.linspace(.30, TZ[-1], NZ_T - 3)]); at_ = np.linspace(0, 2 * PI, NA_T, endpoint=False)
    AA, ZZ = np.meshgrid(at_, zt_)
    Pt_ = torso_raw(AA, ZZ); Nt_ = torso_n(AA, ZZ)
    Pg = np.concatenate([Pt_, Pt_[:, :1]], 1); Ng = np.concatenate([Nt_, Nt_[:, :1]], 1)
    Ug = np.concatenate([(AA / (2 * PI)), np.ones((len(zt_), 1))], 1)
    Vg = np.repeat(((zt_ - TZ[0]) / (TZ[-1] - TZ[0]))[:, None], NA_T + 1, 1)
    make_obj('gi_body', Pg.reshape(-1, 3), grid_faces(len(zt_), NA_T + 1), au('top', Ug.ravel(), Vg.ravel()), 'body', N=Ng.reshape(-1, 3))
    V_APEX = .382; V_TOP = .600; V_HW = .108            # the crossed collar's V: apex just over the sash, 0.22 wide under the scarf
    def vneck_hw(z): return V_HW * clamp((np.asarray(z) - V_APEX) / (V_TOP - V_APEX)) ** .95
    def paint_top(U, V):
        a = U * 2 * PI; z = TZ[0] + V * (TZ[-1] - TZ[0]); x = tax_f(z) * spow(np.sin(a), 2 / TP); front = (np.cos(a) > 0).astype(float)
        n = torso_n(a, z); C = ramp_colour('gi', sval(n, hi=.26))
        hw = vneck_hw(z); ax = np.abs(x)
        # the crossed collar: a slightly lighter lapel band beside each edge of the V, her right lapel over her left
        lap = (1 - smooth(.026, .032, ax - hw)) * (ax > hw - .002) * front * (z > V_APEX - .01)
        C = mix(C, ramp_colour('gi', sval(n, hi=.30) + .12), .65 * lap)
        edge = (1 - smooth(.0016, .0048, np.abs(ax - hw - .030))) * front * (z > V_APEX + .01)      # the lapel's outer fold line
        C = mix(C, rgb('gidark'), .55 * edge)
        # the chest fur in the V (cream), with a soft shadow under each lapel edge
        vin = (1 - smooth(-.003, .002, ax - hw)) * front * (z > V_APEX)
        fur = mix(ramp_colour('cream', sval(n, hi=.18) + .02), rgb('creamdark'), .45 * smooth(-.030, -.002, ax - hw))
        C = mix(C, fur, vin)
        # below the sash: the skirt's front overlap (her right panel over her left) and soft fold shading
        zl = .312 - (x - .000) * 1.10
        ov = (1 - smooth(.0018, .0050, np.abs(z - zl))) * front * (z < .318) * (x > -.005) * (x < .12)
        C = mix(C, rgb('gidark'), .70 * ov)
        C = mix(C, rgb('gidark'), .25 * smooth(.0, .02, zl - z) * front * (z < .318) * (x > 0) * (x < .13))
        C = mix(C, rgb('gidark'), .30 * np.exp(-((np.abs(np.sin(a)) - 1) / .12) ** 2) * smooth(.58, .50, z) * smooth(.40, .48, z))
        C = mix(C, rgb('gidark'), .35 * smooth(.255, .228, z))                     # the hem's turned edge
        return C

    # gi hem roll: a soft rolled edge round the flared hem (gives the skirt thickness from below)
    NH = 36; ah = np.linspace(0, 2 * PI, NH, endpoint=False); zh = TZ[0] + .004
    Ph = torso_raw(ah, np.full(NH, zh)); Nh_ = torso_n(ah, np.full(NH, zh)); Nh_[:, 2] = 0; Nh_ = unit(Nh_)
    abh = np.linspace(0, 2 * PI, 6, endpoint=False)
    ring_tube('gi_hem_roll', Ph - Nh_ * .004, lambda k: np.stack([.010 * np.cos(abh), .011 * np.sin(abh)], -1), 'body', ramp_sw('gi', hi=.22, add=-.06), Nh_, sides=6)

    print('BODY_STEP sash', flush=True)
    # ---------------------------------------------------------------- the red sash (z 0.314-0.411), a fat soft band
    SZ0 = .362; NAS = 36; a_s = np.linspace(0, 2 * PI, NAS, endpoint=False)
    rxs = tax_f(SZ0) + .012; rys = tay_f(SZ0) + .014
    Pss = np.stack([rxs * spow(np.sin(a_s), 2 / TP), RCY - rys * spow(np.cos(a_s), 2 / TP), np.full(NAS, SZ0)], -1)
    Nss = torso_n(a_s, np.full(NAS, SZ0)); Nss[:, 2] = 0; Nss = unit(Nss)
    ab3 = np.linspace(0, 2 * PI, 10, endpoint=False)
    ring_tube('scarlet_sash', Pss, lambda k: np.stack([.017 * spow(np.cos(ab3), .55) + .004 * np.cos(ab3) ** 2, .049 * spow(np.sin(ab3), .55)], -1), 'body',
              lambda NN, tt, uu, V: ramp_uv('scarf', sval(NN, hi=.24) - .10 * np.exp(-((V[:, 2] - SZ0) / .010) ** 2) * 0), Nss, sides=10)
    # two soft wrap folds on the band (a second, thinner turn)
    ring_tube('scarlet_sash_turn', (Pss + Nss * .012 + np.array([0, 0, -.012]))[::2], lambda k: np.stack([.006 * np.cos(np.linspace(0, 2 * PI, 6, endpoint=False)), .016 * np.sin(np.linspace(0, 2 * PI, 6, endpoint=False))], -1),
              'body', ramp_sw('scarf', hi=.22, add=-.04), Nss[::2], sides=6)

    print('BODY_STEP scarf', flush=True)
    # ---------------------------------------------------------------- the red bandit scarf: a chunky band round the neck, a knot, two triangle tails
    NC = 44; ac = np.linspace(0, 2 * PI, NC, endpoint=False)
    frontc = np.maximum(0, np.cos(ac)) ** 2
    zc_c = .646 - .010 * frontc; rxc = .214 + .008 * frontc; ryc = .168 + .020 * frontc
    Pc = np.stack([rxc * np.sin(ac), RCY + .004 - ryc * np.cos(ac), zc_c], -1)
    Nc = unit(np.stack([np.sin(ac) / rxc, -np.cos(ac) / ryc, np.zeros(NC)], -1))
    abc = np.linspace(0, 2 * PI, 10, endpoint=False)
    def scarf_prof(k):
        ripple = .004 * np.cos(3 * ac[k] + .5)
        return np.stack([(.030 + ripple) * spow(np.cos(abc), .70) + .006, (.036 + .010 * frontc[k]) * spow(np.sin(abc), .70)], -1)
    ring_tube('scarf_band', Pc, scarf_prof, 'body', lambda NN, tt, uu, V: ramp_uv('scarf', sval(NN, hi=.26)), Nc, sides=10)
    def flap(name, root, down, across, L, w0, thick, ramp_, bow=.0, tipw=.14, nu=6, nv=8, clear=.016):
        """a soft triangular cloth flap hanging from root (thickened, rounded rim), kept in front of the chest"""
        down = unit(np.asarray(down, float)); across = unit(np.asarray(across, float)); nrm = unit(np.cross(across, down))
        if nrm[1] > 0: nrm = -nrm
        P = []
        for v in np.linspace(0, 1, nv):
            w = w0 * ((1 - v) * (1 - tipw) + tipw) * np.sqrt(clamp(1 - clamp((v - .82) / .22) ** 2) * .7 + .3)
            for u in np.linspace(-1, 1, nu):
                q = root + down * (L * v) + across * (u * w / 2) + nrm * (bow * (1 - u * u) * np.sin(PI * v))
                P.append(q)
        P = np.array(P)
        for i in range(len(P)):
            if P[i, 2] < .62 and P[i, 2] > .30:
                ys = float(torso_front_y(P[i, 0], P[i, 2])) - clear
                P[i, 1] = min(P[i, 1], ys)
        F = grid_faces(nv, nu)
        Nv = np.zeros_like(P)
        for f in F:
            n_ = np.cross(P[f[1]] - P[f[0]], P[f[3]] - P[f[0]])
            for i in f: Nv[i] += n_
        Nv = unit(Nv)
        if Nv[:, 1].mean() > 0: Nv = -Nv
        Vt, Ft, UVt, Nt = thicken(P, F, Nv, thick, ramp_uv(ramp_, .5), ramp_uv(ramp_, .3), ramp_uv(ramp_, .45), rim=3)
        UVt = ramp_uv(ramp_, sval(Nt, hi=.26))
        return make_obj(name, Vt, Ft, UVt, 'body', N=Nt)
    # round 2: the bandit neckerchief -- a triangle of red cloth hanging from the band over the chest, its point at the sash's top,
    # and the knot at the side of her neck (her right, -X) tied with two short ends
    def band_pt(a, dz=0., dr=0.):
        fr_ = max(0., math.cos(a)) ** 2; rx_ = .214 + .008 * fr_ + dr; ry_ = .168 + .020 * fr_ + dr
        return np.array([rx_ * math.sin(a), RCY + .004 - ry_ * math.cos(a), .646 - .010 * fr_ + dz])
    NU_B, NV_B = 9, 9; A_B = .92; BIB_TIP = np.array([-.012, 0, .420]); BIB_TIP[1] = float(torso_front_y(BIB_TIP[0], BIB_TIP[2])) - .020
    Pb = []
    for v in np.linspace(0, 1, NV_B):
        for u in np.linspace(-1, 1, NU_B):
            top = band_pt(u * A_B, dz=-.022, dr=-.004)
            q = top * (1 - v) + BIB_TIP * v
            q = q + np.array([0, -1., 0]) * (.010 * np.sin(PI * v) * (1 - u * u) + .004 * np.sin(3.2 * PI * (u + 1) / 2) * v * (1 - v) * 2)
            Pb.append(q)
    Pb = np.array(Pb)
    for i in range(len(Pb)):
        if .30 < Pb[i, 2] < .64:
            Pb[i, 1] = min(Pb[i, 1], float(torso_front_y(Pb[i, 0], Pb[i, 2])) - .013)
    Fb = grid_faces(NV_B, NU_B)
    Nb = np.zeros_like(Pb)
    for f in Fb:
        n_ = np.cross(Pb[f[1]] - Pb[f[0]], Pb[f[3]] - Pb[f[0]])
        for i in f: Nb[i] += n_
    Nb = unit(Nb)
    if Nb[:, 1].mean() > 0: Nb = -Nb
    Vt, Ft, UVt, Nt = thicken(Pb, Fb, Nb, .013, ramp_uv('scarf', .5), ramp_uv('scarf', .3), ramp_uv('scarf', .45), rim=3)
    make_obj('neckerchief_bib', Vt, Ft, ramp_uv('scarf', sval(Nt, hi=.26) - .06 * smooth(.60, .45, Vt[:, 2]) * 0), 'body', N=Nt)
    A_K = -1.22; KN = band_pt(A_K, dz=-.006, dr=.040); KOUT = unit(band_pt(A_K, dr=.1) - band_pt(A_K))
    lobe('scarf_knot', KN, np.array([.034, .046, .040]), KOUT, 'body', ramp='scarf', n=3, occ_in=.10, squash=.15, pole=[0, 0, 1.])
    def end_flap(name, root, down, across, L, w0, thick):
        down = unit(np.asarray(down, float)); across = unit(np.asarray(across, float)); nrm = unit(np.cross(down, across))
        if nrm @ unit(KOUT + np.array([0, -1., 0])) < 0: nrm = -nrm
        P = []
        for v in np.linspace(0, 1, 6):
            w = w0 * (1 - .55 * v) * np.sqrt(clamp(1 - clamp((v - .75) / .28) ** 2) * .6 + .4)
            for u in np.linspace(-1, 1, 5): P.append(root + down * (L * v) + across * (u * w / 2) + nrm * (.006 * (1 - u * u) * np.sin(PI * v)))
        P = np.array(P); F = grid_faces(6, 5); N_ = np.tile(nrm, (len(P), 1))
        Vt, Ft, UVt, Nt = thicken(P, F, N_, thick, ramp_uv('scarf', .5), ramp_uv('scarf', .3), ramp_uv('scarf', .45), rim=3)
        return make_obj(name, Vt, Ft, ramp_uv('scarf', sval(Nt, hi=.26)), 'body', N=Nt)
    tang = unit(band_pt(A_K + .05) - band_pt(A_K - .05))
    for k, (dd, aa, L_) in enumerate([((-.30, -.25, -1.), .35, .095), ((.25, -.45, -1.), -.40, .080)]):
        dn = unit(np.array(dd) + KOUT * .35); nd = unit(KOUT * .55 + np.array([0, -1., 0]) * .85 + np.array([0, 0, aa * .2])); nd = unit(nd - dn * (nd @ dn)); ac_ = unit(np.cross(nd, dn))
        end_flap('scarf_knot_end.%d' % k, KN + KOUT * .006 - np.array([0, 0, .016]), dn, ac_, L_, .056, .013)
    print('BODY_STEP arms', flush=True)
    # ---------------------------------------------------------------- arms: short wide gi sleeves, dark fur forearms, dark mitten paws
    ARM = {}; ARM_DEG = 40.
    for s, tag in ((1, 'L'), (-1, 'R')):
        th = math.radians(ARM_DEG); ad = unit(np.array([s * math.sin(th), -.06, -math.cos(th)]))
        SH = np.array([s * .192, -.004, .585])
        fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
        def along(t0, SH=SH, ad=ad): return SH + ad * t0
        TS0, TS1 = -.070, .190
        path = np.array([along(t0) for t0 in np.linspace(TS0, TS1, 9)])
        sweep('gi_sleeve.' + tag, path, lambda k: (.086 + .022 * (k / 8) ** 1.4, .081 + .020 * (k / 8) ** 1.4), 'arm.' + tag, ramp_sw('gi', hi=.26),
              sides=20, cap0=False, cap1=False, normals=np.tile(fwd, (len(path), 1)))
        # the hem: a rolled cuff edge, and the dark sleeve opening (lining) round the forearm
        abr = np.linspace(0, 2 * PI, 18, endpoint=False); e1 = fwd; e2 = np.cross(ad, fwd)
        HC = along(TS1 - .004)
        Phr = HC + np.outer(np.cos(abr), e1) * .107 + np.outer(np.sin(abr), e2) * .100
        Nhr = unit(np.outer(np.cos(abr), e1) / .107 + np.outer(np.sin(abr), e2) / .100)
        ring_tube('gi_sleeve_hem.' + tag, Phr, lambda k: np.stack([.011 * np.cos(np.linspace(0, 2 * PI, 7, endpoint=False)), .012 * np.sin(np.linspace(0, 2 * PI, 7, endpoint=False))], -1),
                  'arm.' + tag, ramp_sw('gi', hi=.24, add=-.03), Nhr, sides=7)
        # the lining: an annulus from the hem down into the sleeve, facing out of the opening
        LR = []; LN = []; LUV = []
        for j, (rr, dd) in enumerate([(.102, .000), (.080, -.022), (.060, -.040)]):
            ring = HC + ad * dd + np.outer(np.cos(abr), e1) * rr + np.outer(np.sin(abr), e2) * rr * .94
            LR.append(ring); LN.append(np.tile(ad, (18, 1)))
        LR = np.array(LR).reshape(-1, 3); LN = np.array(LN).reshape(-1, 3)
        Vt, Ft, UVt, Nt = thicken(LR, grid_faces(3, 18, True), LN, .005, ramp_uv('giin', .45), ramp_uv('giin', .3), ramp_uv('giin', .40), rim=2)
        make_obj('gi_sleeve_lining.' + tag, Vt, Ft, UVt, 'arm.' + tag, N=Nt)
        # forearm (dark fur) from inside the sleeve to the wrist, and the mitten paw (palm, three soft finger lobes, a thumb)
        WR = along(.240); PC = along(.292); lat = np.cross(ad, fwd) * s
        paw_axes = np.array([ad, fwd, lat])
        fingers = [PC + ad * .060 + fwd * (o * .033) - lat * .004 for o in (-1, 0, 1)]
        thumb = PC + fwd * .064 + lat * .020 - ad * .006
        def arm_parts(p, WR=WR, PC=PC, paw_axes=paw_axes, fingers=fingers, thumb=thumb, SH=SH, ad=ad):
            d_fa = sd_capsule(p, SH + ad * .120, WR, (.058, .062))
            d_paw = sd_ell(p, PC, paw_axes, (.089, .089, .078))
            d_f = [sd_ell(p, f, paw_axes, (.040, .032, .043)) for f in fingers]
            d_t = sd_ell(p, thumb, paw_axes, (.037, .033, .033))
            return d_fa, d_paw, d_f, d_t
        def arm_sdf(p, arm_parts=arm_parts):
            d_fa, d_paw, d_f, d_t = arm_parts(p)
            d = smin(d_fa, d_paw, .034); ff = smin(smin(d_f[0], d_f[1], .007), d_f[2], .007)
            return smin(smin(d, ff, .016), d_t, .012)
        def arm_uv(NN, V, arm_parts=arm_parts):
            d_fa, d_paw, d_f, d_t = arm_parts(V)
            cr = crease(d_f[0], d_f[1], .007) * .25 + crease(d_f[1], d_f[2], .007) * .25 + crease(np.minimum(d_paw, d_fa), d_t, .012) * .2
            return ramp_uv('mask', sval(NN, occ=1.2 * cr, hi=.36))
        tt_ = np.linspace(0, .16, 321); inside = arm_sdf(PC[None] + ad[None] * tt_[:, None]) < 0
        reach = float(tt_[np.argmin(inside)]) if not inside.all() else .16
        tips = PC + ad * (reach - .008); st = SH + ad * .125
        ts = np.concatenate([np.linspace(0, .40, 5)[:-1], np.linspace(.40, 1.0, 14)])
        cen = st[None] + (tips - st)[None] * ts[:, None]
        ring_stack('dark_mitten_arm.' + tag, arm_sdf, cen, np.tile(ad, (len(ts), 1)), 'arm.' + tag, arm_uv, sides=16, tmax=.17, ref=fwd)
        ARM[tag] = {'shoulder': SH.tolist(), 'elbow': along(.150).tolist(), 'wrist': WR.tolist(), 'palm': (PC + lat * .012).tolist()}

    print('BODY_STEP trousers + feet', flush=True)
    # ---------------------------------------------------------------- dark puffy trousers (split per leg), gathered cuffs; broad dark feet
    LEG = {}
    for s, tag in ((1, 'L'), (-1, 'R')):
        XC = s * .146
        def trouser_sdf(p, XC=XC, s=s):
            d = ell(p, [XC, .004, .200], [.134, .166, .112])
            d = smin(d, ell(p, [s * .118, .004, .292], [.150, .196, .055]), .05)                 # the waist under the gi
            cuff = ell(p, [s * .170, -.004, .118], [.104, .118, .026])
            d = smin(d, cuff, .032)
            ang = np.arctan2(p[:, 1] + .004, p[:, 0] - s * .170)
            d = d + .0055 * np.cos(11 * ang) * smooth(.175, .130, p[:, 2]) * smooth(.098, .118, p[:, 2])       # gathers at the cuff
            d = d + .0030 * np.cos(5 * ang + .7) * smooth(.29, .21, p[:, 2]) * smooth(.12, .18, p[:, 2])       # soft puff folds
            return d
        star_mesh('dark_trousers.' + tag, trouser_sdf, np.array([s * .150, .004, .200]), 'body',
                  lambda NN, V: ramp_uv('trousers', sval(NN, hi=.32, occ=.10 * smooth(.14, .10, V[:, 2]))), nth=15, nph=22, tmax=.40)
        # broad rounded dark feet (pointing a little outward), two soft toe grooves on top
        FC = np.array([s * .198, -.022, .058]); yaw = s * math.radians(9)
        FAX = rot([0, 0, 1], yaw).T
        fwd_f = FAX[1] * -1                                        # the foot's forward (toward -y, turned out)
        toes = [FC + FAX[0] * (o * .046) - FAX[1] * .140 + np.array([0, 0, .040]) for o in (-1, 1)]
        def foot_parts(p, FC=FC, FAX=FAX, s=s, toes=toes):
            d = sd_ell(p, FC, FAX, (.134, .166, .070))
            d = smin(d, sd_capsule(p, np.array([s * .176, .000, .050]), np.array([s * .172, .000, .130]), .082), .040)       # the ankle into the cuff
            d = smax(d, -(p[:, 2] - .000), .018)                                                                     # flat, softly rounded sole
            g = [sd_capsule(p, t_, t_ + FAX[1] * .085 + np.array([0, 0, .020]), .0085) for t_ in toes]
            return d, g
        def foot_sdf(p, foot_parts=foot_parts):
            d, g = foot_parts(p)
            for gg in g: d = smax(d, -gg, .010)
            return d
        def foot_uv(NN, V, foot_parts=foot_parts):
            d, g = foot_parts(V); cr = sum(clamp(1 - np.abs(gg) / .016) for gg in g) * .5
            return ramp_uv('mask', sval(NN, hi=.34, occ=.45 * cr))
        star_mesh('dark_foot.' + tag, foot_sdf, FC + np.array([0, .01, .022]), 'body', foot_uv, nth=15, nph=22, tmax=.32)
        LEG[tag] = {'hip': [s * .110, .004, .300], 'knee': [s * .160, -.004, .190], 'ankle': [s * .176, .000, .090],
                    'toe': (FC - FAX[1] * .170 + np.array([0, 0, -.020])).tolist()}

    print('BODY_STEP pouch', flush=True)
    # ---------------------------------------------------------------- the acorn pouch on her left hip (brown sack, rolled rim, an acorn peeking out)
    PCn = np.array([.262, -.176, .275]); pyaw = math.radians(28)
    PAX = rot([0, 0, 1], pyaw).T
    def pouch_sdf(p):
        q = (p - PCn) @ PAX.T
        d = ell(q, [0, 0, -.010], [.094, .072, .082])
        d = smax(d, q[:, 2] - .052, .030)                                                  # the open top under the rolled rim
        return d + .0030 * np.cos(9 * np.arctan2(q[:, 1], q[:, 0])) * smooth(.000, .045, q[:, 2])
    star_mesh('acorn_pouch', pouch_sdf, PCn, 'body', lambda NN, V: ramp_uv('pouch', sval(NN, hi=.30, occ=.12 * smooth(.04, .08, ((V - PCn) @ PAX.T)[:, 2]))), nth=14, nph=24, tmax=.2)
    RIM_C = PCn + np.array([0, 0, .050]) @ PAX
    abr = np.linspace(0, 2 * PI, 22, endpoint=False)
    Prim = RIM_C + np.outer(np.cos(abr), PAX[0]) * .078 + np.outer(np.sin(abr), PAX[1]) * .060
    Nrim = unit(np.outer(np.cos(abr), PAX[0]) / .078 + np.outer(np.sin(abr), PAX[1]) / .060)
    ring_tube('acorn_pouch_rim', Prim, lambda k: np.stack([.020 * np.cos(np.linspace(0, 2 * PI, 8, endpoint=False)), .018 * np.sin(np.linspace(0, 2 * PI, 8, endpoint=False))], -1),
              'body', ramp_sw('pouch', hi=.28, add=.04), Nrim, sides=8)
    lobe('acorn_pouch_hole', RIM_C + PAX[2] * -.004, np.array([.012, .066, .050]), PAX[2], 'body', ramp='hole', n=3, occ_in=0, pole=PAX[1])
    AXA = unit(PAX[2] * math.cos(math.radians(48)) + PAX[0] * math.sin(math.radians(48)) - PAX[1] * .25)     # the acorn tips out of the pouch
    AC = RIM_C + PAX[2] * .010 + PAX[0] * .016 - PAX[1] * .006
    lobe('acorn_nut', AC, np.array([.054, .046, .044]), -AXA, 'body', ramp='acorn', n=4, occ_in=.0, pole=PAX[1], squash=-.35)
    lobe('acorn_cap', AC + AXA * .030, np.array([.026, .054, .051]), AXA, 'body', ramp='cap', n=4, occ_in=.10, pole=PAX[1], squash=.3)
    sweep('acorn_stem', [AC + AXA * .050, AC + AXA * .066 + PAX[2] * .004, AC + AXA * .076 + PAX[2] * .012], lambda k: (.0105, .0105), 'body', ramp_sw('cap', hi=.30), sides=8)
    # the strap: a short loop from the sash down to the pouch neck
    sp0 = np.array([.232, float(torso_front_y(.232, .392)) - .018, .392])
    sweep('acorn_pouch_strap', [sp0, (sp0 + RIM_C) / 2 + np.array([.004, -.012, .010]), RIM_C + PAX[1] * .040 + PAX[2] * .008],
          lambda k: (.007, .019), 'body', ramp_sw('pouch', hi=.26, add=-.06), sides=8, normals=np.tile(np.array([0, -1., 0]) @ PAX, (3, 1)), p=.5)

    print('BODY_STEP tail', flush=True)
    # ---------------------------------------------------------------- the big ringed tail: an SDF chain of round cones, rings of bend loops
    TPTS = np.array([[-.004, .150, .300], [-.012, .290, .300], [-.026, .420, .312], [-.044, .525, .323], [-.055, .580, .330]])
    TAIL_PATH = cpath(TPTS, 33)
    _seg = np.linalg.norm(np.diff(TAIL_PATH, axis=0), axis=1); _arc = np.concatenate([[0], np.cumsum(_seg)]); TAIL_LEN = float(_arc[-1])
    TR_T = [0, .10, .25, .45, .65, .82, 1.0]; TR_R = [.070, .094, .148, .198, .228, .236, .220]
    def tail_r(t): return np.interp(t, TR_T, TR_R)
    _tn = _arc / TAIL_LEN; _rr = tail_r(_tn)
    def tail_sdf(p):
        d = np.full(len(p), 9.)
        for i in range(0, len(TAIL_PATH) - 1, 2):
            j = min(i + 2, len(TAIL_PATH) - 1)
            d = smin(d, sd_capsule(p, TAIL_PATH[i], TAIL_PATH[j], (_rr[i], _rr[j])), .012)
        return d
    R_END = float(_rr[-1]); TIP_REACH = TAIL_LEN + R_END
    def tail_t(V):
        """normalised position along the tail (0 root .. 1 the tip of the rounded end), by nearest path point + overshoot"""
        dd = np.linalg.norm(V[:, None, :] - TAIL_PATH[None], axis=2); k = np.argmin(dd, 1)
        tang = unit(np.gradient(TAIL_PATH, axis=0))[k]
        a = _arc[k] + ((V - TAIL_PATH[k]) * tang).sum(1)
        return clamp(a / TIP_REACH)
    tdir = unit(np.gradient(TAIL_PATH, axis=0))
    tc_t = np.concatenate([np.linspace(0, .80, 16), np.linspace(.80, 1., 6)[1:]])
    cen = np.array([TAIL_PATH[min(int(round(t * (len(TAIL_PATH) - 1))), len(TAIL_PATH) - 1)] for t in tc_t])
    axs = np.array([tdir[min(int(round(t * (len(TAIL_PATH) - 1))), len(TAIL_PATH) - 1)] for t in tc_t])
    # densify the rounded end: centres beyond the path end along the end tangent
    endc = [TAIL_PATH[-1] + tdir[-1] * R_END * f for f in (.25, .46, .63, .76, .86, .93)]
    cen = np.concatenate([cen, endc]); axs = np.concatenate([axs, np.tile(tdir[-1], (len(endc), 1))])
    ring_stack('ringed_tail', tail_sdf, cen, axs, 'tail', lambda NN, V: chart_uv('tail', tail_t(V), sval(NN, hi=.32)), sides=32, tmax=.40, pole_start=False,
               ref=np.array([0, 0, 1.]))
    TAIL_BANDS = [(0., 'fur'), (.280, 'mask'), (.370, 'fur'), (.495, 'mask'), (.585, 'fur'), (.660, 'mask'), (.765, 'fur'), (.845, 'cream')]
    def paint_tail(U, V):
        t = U; band = np.zeros(t.shape, int)
        C = ramp_colour(TAIL_BANDS[0][1], V)
        for k in range(1, len(TAIL_BANDS)):
            t0, nm = TAIL_BANDS[k]
            C = mix(C, ramp_colour(nm, V + (.04 if nm == 'cream' else 0)), smooth(t0 - .006, t0 + .006, t))
        return C

    # ---------------------------------------------------------------- measurements of the authored parts (build units and fractions of the 1.20 crown)
    def _vs(prefixes, groups=None):
        out = []
        for g, obs in parts.items():
            if groups and g not in groups: continue
            for o in obs:
                if any(o.name.startswith(p) for p in prefixes): out += [list(o.matrix_world @ v.co) for v in o.data.vertices]
        return np.array(out)
    def _ext(v): return {'min': [round(float(c) * S_FINAL, 3) for c in v.min(0)], 'max': [round(float(c) * S_FINAL, 3) for c in v.max(0)], 'size': [round(float(c) * S_FINAL, 3) for c in np.ptp(v, 0)]}
    _tail = _vs(['ringed_tail']); _pouch = _vs(['acorn_']); _gi = _vs(['gi_body']); _tr = _vs(['dark_trousers']); _ft = _vs(['dark_foot'])
    _sash = _vs(['scarlet_sash']); _scarf = _vs(['scarf_', 'neckerchief']); _pawL = _vs(['dark_mitten_arm.L']); _slL = _vs(['gi_sleeve.L', 'gi_sleeve_hem.L'])
    BODY_MEAS = {'body_parts_m (final metres)': {
        'tail': _ext(_tail), 'tail_max_diameter_m': round(2 * max(TR_R) * S_FINAL, 3), 'pouch': _ext(_pouch), 'gi': _ext(_gi), 'trousers': _ext(_tr), 'feet': _ext(_ft),
        'sash_z_m': [round(float(_sash[:, 2].min()) * S_FINAL, 3), round(float(_sash[:, 2].max()) * S_FINAL, 3)],
        'scarf': _ext(_scarf), 'paw_L': _ext(_pawL), 'sleeve_L': _ext(_slL), 'arm_angle_from_vertical_deg': ARM_DEG}}

    print('BODY_STEP joints', flush=True)
    JOINTS_BODY = {'hips': [0, .004, .300], 'spine': [0, .002, .400], 'chest': [0, .000, .520], 'neck': [0, .004, .640],
                   'arms': {t: {k: v for k, v in ARM[t].items() if k != 'palm'} for t in ARM}, 'legs': LEG,
                   'tail': [TAIL_PATH[i].tolist() for i in (0, 8, 16, 24, 32)] + [(TAIL_PATH[-1] + tdir[-1] * R_END).tolist()],
                   'palm_R': ARM['R']['palm'], 'palm_L': ARM['L']['palm']}
    BODY_PIVOTS = {'arm.L': tuple(ARM['L']['shoulder']), 'arm.R': tuple(ARM['R']['shoulder']), 'tail': tuple(TAIL_PATH[0]), 'body': (0, 0, 0)}
    BODY_PAINTERS = {'top': paint_top, 'tail': paint_tail}
    def POST_JOIN():
        def sc(v): return [round(float(c) * S_FINAL, 5) for c in v]
        joints = {'units': 'metres (final, crown 1.00 m)', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X'}
        joints.update({k: sc(JOINTS_BODY[k]) for k in ('hips', 'spine', 'chest', 'neck')})
        joints['head'] = sc(O)
        joints['head_nod_pivot_suggested'] = sc([0, HY + .10 * W, CHIN + .03 * W])
        joints['jaw_pivot'] = sc([0, float(HY - .22 * W), float(CHIN + .135 * W)])
        joints['eyes'] = {'R': sc(eye_centers['R']), 'L': sc(eye_centers['L'])}
        joints['eye_axes'] = {k: LOG['eye_axis_' + k] for k in ('R', 'L')}
        joints['ears'] = {t: {k: sc(v) for k, v in ear_info[t].items()} for t in ('R', 'L')}
        joints['quiff_tips'] = [sc(v) for v in tuft_info]
        joints['arms'] = {t: {k: sc(v) for k, v in JOINTS_BODY['arms'][t].items()} for t in ('L', 'R')}
        joints['legs'] = {t: {k: sc(v) for k, v in JOINTS_BODY['legs'][t].items()} for t in ('L', 'R')}
        joints['tail'] = [sc(v) for v in JOINTS_BODY['tail']]
        joints['palm_R'] = sc(JOINTS_BODY['palm_R']); joints['palm_L'] = sc(JOINTS_BODY['palm_L'])
        joints['notes'] = ['Phase 1: no rig, weights or animations. Same keys as poe-toy joints.json (all values in final metres).',
                           'head = the head centre (the radial origin); head_nod_pivot_suggested = base of the skull, for the rig.',
                           'Head skin = zero surface of one implicit ball (dome skull + jaw + cheek ruff + muzzle + chin + nose), analytic normals, adaptive toon-band refinement.',
                           'Eyelid holes ringed by 6 loops each with the rim rolled 4.5 mm (build) in behind separate lens eyeballs; 3 loops round the mouth, 4 round the nose.',
                           'Ears: separate pieces (Tanuki_ear_L / _R), polar-gridded with 9 rings (bend loops) and a rounded rim; the buried part is deleted; pivot = ears.base.',
                           'Tail: Tanuki_tail, a 27-ring x 32-side SDF ring stack (bend loops), pivot = tail[0]; tail[-1] is the end of the rounded tip.',
                           'Trousers are split per leg (two closed islands); the sleeves are open tubes with a lining; arms carry rings along the forearm and wrist.']
        with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)

# ============================================================== PAINTED ATLAS
def stroke(x, z, P, half, aa):
    best = np.full(len(x), 9.)
    for i in range(len(P) - 1):
        a = P[i]; b = P[i + 1]; ab = b - a; L2 = ab @ ab
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        dx = x - (a[0] + t * ab[0]); dz = z - (a[1] + t * ab[1])
        best = np.minimum(best, np.sqrt(dx * dx + dz * dz) - (half[i] * (1 - t) + half[i + 1] * t))
    return 1 - smooth(-aa, aa, best)
def lash_th(psi):      # the thick upper lash line: thickest over the top-outer part, a short wing at the outer corner
    return (.040 + .17 * np.sin(np.clip(psi, 0, PI)) ** .7 + .08 * np.exp(-((psi - .35) / .35) ** 2)) * smooth(-.25, .20, psi)
PAINT_OPTS = {'band': True, 'blush': True}
# the face layout (W units, front projection: x across, z above the chin), measured on the sheet's head close-up
MASK = dict(cx=.250, cz=.272, rx=.175, rz=.140, tilt=15., n=2.25)       # the dark bandit patch round each eye
HALO = dict(cx=.200, cz=.405, rx=.150, rz=.078)                         # the cream brow patch hugging the mask's top
BROW = dict(outer=(.200, .446), inner=(.143, .414), half=(.013, .017, .014))
def mask_field(q, s):
    m = MASK; th = math.radians(m['tilt']) * -s
    dx = q[:, 0] - s * m['cx']; dz = q[:, 2] - m['cz']
    u = dx * math.cos(th) + dz * math.sin(th); v = -dx * math.sin(th) + dz * math.cos(th)
    # a touch fuller at the outer-lower end (the bandit teardrop)
    rx = m['rx'] * (1 + .10 * smooth(-.2, 1., s * u / m['rx']) * smooth(.3, -1., v / m['rz']))
    return (np.abs(u / rx) ** m['n'] + np.abs(v / m['rz']) ** m['n']) ** (1 / m['n'])
def paint_head(U, V):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = radial_hit(d); n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); qx, qy, qz = q[:, 0], q[:, 1], q[:, 2]; ax = np.abs(qx)
    fr = smooth(HY + .04, HY - .06, y)
    up = n @ LIGHT
    C = mix(rgb('fur'), rgb('furlight'), .50 * smooth(.35, 1.0, up))                 # a warm sheen on the top planes
    C = mix(C, rgb('furdark'), .40 * smooth(.0, .9, -up))
    # the cheek ruff points: a touch lighter at their tips
    qd = [quiff_lobe_sdf(q, k) for k in range(len(QLOBES))]
    qcr = .45 * crease(qd[0], qd[1], .032) + .45 * crease(qd[0], qd[2], .032) + .35 * crease(skull(q), quiff_sdf(q), K_QUIFF)
    qtop = clamp(1 - np.minimum(np.minimum(qd[0], qd[1]), qd[2]) / .012) * smooth(.3, .9, n[:, 2])
    C = mix(C, rgb('furlight'), .35 * qtop)
    C = mix(C, rgb('furdark'), .45 * clamp(qcr))
    # the cream lower face: under a soft arc from the nose bridge out to the jaw, front-facing only
    zt = .262 - 1.10 * ax ** 2
    cream_lo = (1 - smooth(-.014, .014, qz - zt)) * np.maximum(smooth(-.02, -.20, qy), smooth(.10, .03, qz) * smooth(.12, -.05, qy))
    cr_col = mix(rgb('cream'), rgb('creamlight'), .30 + .40 * smooth(.30, 1.0, up))     # kept bright: the lower face faces down
    cr_col = mix(cr_col, rgb('cream'), .30 * smooth(.30, .9, -up))
    C = mix(C, cr_col, cream_lo)
    # muzzle softness: a fillet shade where the muzzle meets the cheeks, very light
    qw = warped(q); dsk = skull(qw)
    cr = .45 * crease(dsk, ell(qw, *MUZ), K_MUZ)
    C = mix(C, rgb('creamdark'), clamp(cr) * .30 * fr)
    mt = np.sqrt((((q - (np.array(MUZ[0]) + np.array([0, -.04, .035]))) / np.array([.11, .09, .05])) ** 2).sum(1))
    C = mix(C, rgb('creamlight'), .55 * (1 - smooth(.4, 1.0, mt)) * fr)       # the muzzle's soft top highlight
    # the cream brow patches above the masks, and the light tan nose bridge between them
    for s in (-1, 1):
        hr = np.sqrt(((qx - s * HALO['cx']) / HALO['rx']) ** 2 + ((qz - HALO['cz']) / HALO['rz']) ** 2)
        C = mix(C, cr_col, (1 - smooth(.82, 1.06, hr)) * fr)
    br = np.sqrt((qx / .070) ** 2 + ((qz - .300) / .100) ** 2)
    C = mix(C, mix(rgb('furlight'), rgb('cream'), .35), .55 * (1 - smooth(.5, 1.1, br)) * fr)
    # the bandit masks
    for s in (-1, 1):
        mr = mask_field(q, s)
        mk = (1 - smooth(.972, 1.022, mr)) * fr
        mcol = mix(rgb('mask'), rgb('masklight'), .25 * smooth(.30, 1.0, up))
        C = mix(C, mcol, mk)
    # brows: short rounded dark dashes sloping down toward the nose (the cheeky look)
    for s in (-1, 1):
        Pb = np.array([[s * BROW['outer'][0], BROW['outer'][1]], [s * (BROW['outer'][0] + BROW['inner'][0]) / 2, (BROW['outer'][1] + BROW['inner'][1]) / 2 + .004], [s * BROW['inner'][0], BROW['inner'][1]]])
        ib = (fr > 0) & (np.abs(qx - s * .17) < .08) & (np.abs(qz - .43) < .06)
        a = np.zeros(len(qx)); a[ib] = stroke(qx[ib], qz[ib], Pb, np.array(BROW['half']), .0030)
        C = mix(C, rgb('mask'), .96 * a)
    C = mix(C, rgb('creamdark'), .25 * smooth(.02, -.08, qz) * smooth(-.2, -.7, n[:, 2]))      # the under-jaw shade
    # blush: soft warm dabs on the cream cheeks under the outer eyes
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .78 * (1 - smooth(.20, 1.05, r)) * fr * PAINT_OPTS['blush'])
    # nose button: dark brown, a rounded inverted triangle with a soft top highlight
    nq = (q - np.array(NOSE[0])) / np.array(NOSE[1]); tri = (1 + .55 * clamp(-nq[:, 2] - .1)) * (1 - .10 * clamp(nq[:, 2]))
    rn = np.sqrt((nq[:, 0] * tri) ** 2 + nq[:, 1] ** 2 + nq[:, 2] ** 2)
    nose_c = mix(rgb('#2E221F'), rgb('nose'), smooth(-.45, .85, n @ unit(np.array([-.10, -.45, 1.]))))
    C = mix(C, nose_c, .97 * (1 - smooth(.97, 1.20, rn)))
    rh_ = np.sqrt((((q - (np.array(NOSE[0]) + np.array([-.006, -.022, .014]))) / np.array([.018, .016, .008])) ** 2).sum(1))
    C = mix(C, rgb('nosehi'), .85 * (1 - smooth(.50, 1.0, rh_)) * (rn < 1.1))
    # the omega mouth with the cheeky smirk curl on her left (+x) end, and the short philtrum from the nose
    Pm = np.array([[-.084, .004], [-.068, -.007], [-.042, -.014], [-.018, -.009], [0, .000], [.020, -.010], [.046, -.015], [.072, -.005], [.088, .009], [.094, .017]])
    Pm = cpath(Pm * np.array([.90, 1.]), 40)                 # smooth lobes (a Catmull-Rom through the control points)
    Pm = np.stack([Pm[:, 0] * W, MZ + Pm[:, 1] * W], -1)
    half = np.full(len(Pm), .0055 * W); half[:3] = np.linspace(.0030, .0055, 3) * W; half[-3:] = np.linspace(.0055, .0028, 3) * W
    Pph = np.array([[0, MZ + .004 * W], [0, CHIN + (NOSE[0][2] - NOSE[1][2] + .004) * W]]); hph = np.array([.0048 * W, .0044 * W])
    ib = (fr > 0) & (np.abs(x) < .14 * W) & (z > MZ - .06 * W) & (z < NZ)
    a = np.zeros(len(x)); a[ib] = np.maximum(stroke(x[ib], z[ib], Pm, half, .0028 * W), stroke(x[ib], z[ib], Pph, hph, .0028 * W))
    C = mix(C, rgb('mouth'), .95 * a)
    # the thick upper lash line round the eye opening (and a thin soft lower rim), on the dark mask
    for s in (-1, 1):
        sr, psi, X, Z = eye_s(s, x, z)
        near_eye = fr * (sr < 1.8)
        th = lash_th(psi)
        lash = (1 - smooth(1 + th - .015, 1 + th + .015, sr)) * PAINT_OPTS['band']
        low = (1 - smooth(1.03, 1.08, sr)) * smooth(.10, -.40, np.sin(psi))
        C = mix(C, rgb('lash'), np.maximum(lash, .75 * low) * near_eye)
    return C.reshape(sh + (3,))

def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .15; iz = .02; irx = .68; irz = .93          # iris 66 % of the opening width, tucked toward the nose (sheet)
    C = mix(rgb('sclera'), rgb('#E9DCD2'), .50 * smooth(.48, .98, Z))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    g = smooth(.60, -.85, ez)
    I = mix(rgb('#6A3A10'), rgb('#B07220'), smooth(0., .40, g))
    I = mix(I, rgb('iris'), smooth(.30, .72, g))
    I = mix(I, rgb('#F2C46A'), .80 * smooth(.66, 1.0, g) * (1 - smooth(.82, .96, r)))     # the bright lower honey band
    I = mix(I, rgb('#4A2A0E'), .70 * smooth(.84, 1.0, r))                                  # the darker rim
    I = I * (1 - .035 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 30 + r * 10)) * smooth(.4, .8, r))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    pz = iz + .04 * irz; R = np.sqrt(((X - ix) / (.60 * irx)) ** 2 + ((Z - pz) / (.66 * irz)) ** 2)
    C = mix(C, rgb('pupil'), 1 - smooth(.95, 1.05, R))
    # two catchlights, mirrored on the two eyes (as on the sheet): a big one upper-nasal, a small one lower-outer
    hx = ix - s * .36 * irx; hz = pz + .50 * irz
    big = np.sqrt(((X - hx) / (.27 * irx)) ** 2 + ((Z - hz) / (.22 * irz)) ** 2)
    small = np.sqrt(((X - (ix + s * .34 * irx)) / (.10 * irx)) ** 2 + ((Z - (pz - .40 * irz)) / (.085 * irz)) ** 2)
    C = mix(C, rgb('#FFFBF4'), np.maximum(1 - smooth(.94, 1.06, big), .85 * (1 - smooth(.90, 1.10, small))))
    C = mix(C, rgb('lash'), smooth(.92, 1.0, sr) * smooth(-.10, .40, Z))
    C = mix(C, rgb('#3A2C28'), .55 * smooth(.95, 1.02, sr) * smooth(.0, -.40, Z))
    return C

def paint_ear(U, V):
    """the ear's front face: dark rim, cream inner ear (a rounded triangle), shaded deeper toward the base"""
    a = (U - .5) * 2.2 * EAR['hb']; h = V * (EAR['Lh'] + EAR['bury']) - EAR['bury']
    hn = clamp((h + .02) / EAR['Lh'])
    C = mix(rgb('mask'), rgb('masklight'), .45 * smooth(.2, 1., hn))
    od = ear_outline_sdf(np.stack([a.ravel(), h.ravel()], -1)).reshape(a.shape)
    inner = 1 - smooth(-.046, -.034, od)
    inner = inner * smooth(-.060, -.020, h)
    cc = mix(rgb('creamdark'), rgb('cream'), smooth(-.02, .14, h))
    cc = mix(cc, rgb('creamlight'), .35 * smooth(.08, .20, h))
    C = mix(C, cc, inner)
    return C

def paint_ramp(U, V):
    rows = np.clip((V * CHARTS['ramp'][3] / 32).astype(int), 0, 15); C = np.zeros(U.shape + (3,))
    for name, k in RAMP_ROWS.items():
        m = rows == k
        if not m.any(): continue
        lo, base, hi = [rgb(c) for c in RAMPS[name]]
        u = U[m]; C[m] = np.where((u < .5)[:, None], mix(lo, base, smooth(0, .5, u)), mix(base, hi, smooth(.5, 1, u)))
    return C
PAINTERS = {'head': paint_head, 'eye.L': lambda U, V: paint_eye(U, V, 1), 'eye.R': lambda U, V: paint_eye(U, V, -1), 'ramp': paint_ramp, 'ear': paint_ear}
PAINTERS.update(BODY_PAINTERS)
if RIG:
    PAINTERS['cavity'] = lambda U, V: mix(rgb('#4a1c1c'), rgb('#3a1414'), .5 * smooth(.3, 1, V))
    PAINTERS['tongue'] = lambda U, V: mix(rgb('#e07a86'), rgb('#ec96a0'), .5 * smooth(.2, .9, V))
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
def paint_atlas(path, base=None, only=None):
    if base is None:
        atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [138, 106, 88, 255]
    else: atlas = base.copy()
    for name, (x0, y0, w, h) in CHARTS.items():
        if name not in PAINTERS or (only is not None and name not in only): continue
        print('PAINT', name, flush=True)
        if name == 'ramp':
            U, V = np.meshgrid(clamp((np.arange(w) - 8) / (w - 16)), (np.arange(h) + .5) / h)
        elif name == 'tail':
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
atlas_path = os.path.join(ROOT, 'scratch', 'head_atlas.png') if HEAD_ONLY else (os.path.join(ROOT, 'scratch', 'rig_base_atlas.png') if RIG else os.path.join(ROOT, 'tanuki-toy_atlas.png'))
ATLAS_NAVY = paint_atlas(atlas_path)
img = bpy.data.images.load(atlas_path); img.name = 'Tanuki_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Tanuki_toy_atlas'); MAT.use_nodes = True
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
for zw in (.0, .02, .05, .09, .13, .19, .22, .26, .30, .35, .40, .45, .50, .55, .60, .65):
    xs_ = np.linspace(0, .7, 351)
    ys_ = front_local(xs_, np.full(len(xs_), zw), head_local); ok = np.isfinite(ys_)
    cheek_rows['%.2f' % zw] = round(float(2 * xs_[ok].max()), 3) if ok.any() else None
MEAS = {'units': 'W = %.3f build units (%.3f m) head width between the cheek points; z = above the chin in W; profile b = behind the nose tip in W' % (W, W * S_FINAL),
        'chin_z_m': round(CHIN * S_FINAL, 4), 'crown_m': round(LOG['crown_build'] * S_FINAL, 4), 'head_height_W': round((LOG['crown_build'] - CHIN) / W, 3),
        'head_height_frac_total': round((LOG['crown_build'] - CHIN) / LOG['crown_build'], 3),
        'face_width_rows_W(z: width)': cheek_rows,
        'nose_tip_y_m': round(float(nose_tip_y) * S_FINAL, 4),
        'profile_b(z)': {'%.3f' % zw: prof_at(zw) for zw in (.02, .05, .09, .12, .14, .16, .197, .245, .30, .35, .40, .45, .50, .55, .60, .65, .68)},
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
MEAS['quiff_top_z_W'] = round(QUIFF_TOP_W, 3); MEAS['crown_z_W'] = round((CROWN_M - CHIN) / W, 3)
MEAS.update(LOG)
MEAS.update(globals().get('BODY_MEAS', {}))

# ============================================================== JOIN, CLEAN, NORMALS, FINAL SCALE (S_FINAL)
objects = []; part_tri = {}
PIVOTS = {'head': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'],
          'ear.L': tuple(ear_info['L']['base']), 'ear.R': tuple(ear_info['R']['base'])}
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
    ob = bpy.context.object; ob.name = 'Tanuki_' + group.replace('.', '_'); ob.data.name = ob.name
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
    co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); assert np.isfinite(co).all(), 'Nonfinite position'
    for p in me.polygons: assert all(math.isfinite(c) for c in p.normal) and p.normal.length > .5, ('Bad normal', ob.name, p.index)
    ob['phase'] = '1: neutral A-pose, no armature'; ob['front_axis'] = '-Y'; ob['units'] = 'metres'
    me.calc_loop_triangles(); part_tri[ob.name] = len(me.loop_triangles); objects.append(ob)
tri_count = sum(part_tri.values()); print('PART_TRIANGLES', json.dumps(part_tri), flush=True)
HEADSET = sum(v for k, v in part_tri.items() if k in ('Tanuki_head', 'Tanuki_eye_L', 'Tanuki_eye_R', 'Tanuki_ear_L', 'Tanuki_ear_R'))
MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count; MEAS['head_face_eyes_ears_triangles'] = HEADSET
allv = np.concatenate([np.array([list(o.matrix_world @ v.co) for v in o.data.vertices]) for o in objects])
MEAS['bounds_final_m'] = {'min': [round(float(c), 4) for c in allv.min(0)], 'max': [round(float(c), 4) for c in allv.max(0)]}
if RIG:
    assert tri_count <= 31500, ('Triangle budget (rig: the denser toon-refined head; the rig total is checked against 34k)', tri_count)
elif not HEAD_ONLY:
    assert tri_count <= 25000, ('Triangle budget', tri_count)
    POST_JOIN = globals().get('POST_JOIN')
    if POST_JOIN: POST_JOIN()
    with open(os.path.join(ROOT, 'measurements.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-head.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
if not RIG: print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not HEAD_ONLY and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'tanuki-toy.blend'))
def export(path):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects: ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                              export_animations=False)
if RIG:
    for k_, v_ in zip(('gi', 'gilight', 'gidark'), GI['maroon']): PAL[k_] = v_
    paint_atlas(os.path.join(ROOT, 'scratch', 'rig_base_atlas_maroon.png'), base=ATLAS_NAVY, only=('top', 'ramp'))
    for k_, v_ in zip(('gi', 'gilight', 'gidark'), GI['navy']): PAL[k_] = v_
else: export(OUT_MODEL)
if not HEAD_ONLY and not RIG:
    # the maroon colourway: the same meshes and UVs; only the gi's colours change (the 'top' chart and the gi ramp rows)
    for k_, v_ in zip(('gi', 'gilight', 'gidark'), GI['maroon']): PAL[k_] = v_
    mpath = os.path.join(ROOT, 'tanuki-toy_maroon_atlas.png')
    paint_atlas(mpath, base=ATLAS_NAVY, only=('top', 'ramp'))
    img2 = bpy.data.images.load(mpath); img2.name = 'Tanuki_toy_painted_atlas_2048_maroon'; img2.pack()
    TEX.image = img2
    export(MODEL_MAROON)
    TEX.image = img
print('TANUKI_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
