"""Usagi (A "Blossom Bounce"), Toybox line villager, phase-1 model (neutral A-pose, no rig). Blender 4.3, no addons.
Deterministic: a full rebuild from an empty scene.

    blender --background --factory-startup --python build_usagi-toy.py [-- --head-only]

Final asset: 1 unit = 1 m, front = -Y, feet on z = 0, character left = +X, ear tips at 1.10 m.
Writes only inside this folder and public/models/usagi-toy.glb (--head-only: scratch/ only).

Technique (the Tanuki / Rosie / Moka toy-line machinery, authored directly in metres):
- The head is ONE smooth convex implicit ball: a rounded skull (an elliptic dome over a round, full jaw, widest 0.26 W above
  the chin), a barely-proud soft muzzle and a tiny button nose. No eye sockets (Rosie round 8): the eyes sit on the ball.
  The skin is the field's zero surface reached by radial projection (CDT in a stereographic domain with edge loops round the
  eyelids, nose and mouth), so every vertex carries its analytic normal; adaptive refinement adds points where the game's
  hard toon band would zigzag. The eyes are separate lens globes following the ball.
- The bunny ears are thick SDF ring stacks (bend loops along their length) with a recessed pink panel on the front.
- The petal sun hat is a soft dome and six thick drooping petals (parametric cushions), tilted back.
- Clothing is lathed / swept / SDF star meshes; limbs are SDF ring stacks; the cotton tail is a lumpy SDF ball.
- One 2048 painted atlas: the face (brows, blush, nose, mouth, lashes) and eyes painted from 3D positions, a 2-D chart for
  the ears' pink panels, 1-D shading ramps (soft painted light) for everything else.
"""
import bpy, bmesh, math, json, os, sys, struct, zlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt
from mathutils.bvhtree import BVHTree

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HEAD_ONLY = '--head-only' in ARGV
RIG = bool(globals().get('RIG_MODE'))
MODELS = 'D:/projects/chewy-life-3d/public/models'
MODEL = os.environ.get('USAGI_MODEL_OUT', MODELS + '/usagi-toy.glb')   # phase 2: the approved GLB stays; previews export to scratch
OUT_MODEL = os.path.join(ROOT, 'scratch', 'usagi-head-test.glb') if HEAD_ONLY else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
S_FINAL = 1.0                               # authored in metres
# sheet front view (refs/sheet.png, measure.md): ground y 515, ear tips y 56 (459 px = 1.10 m, 417 px / m), centre x 234.
# head: W 222 px = 0.532 m between the cheek points (head close-up: 253 px), chin 0.424 m.
W = .532; CHIN = .424; HY = -.010           # head width, chin height, head centre y (metres)
SW = W / .757                               # Tanuki-build millimetre constants (head W 0.757) scale with the head
LOG = {}

PAL = {'fur': '#FBF8F6', 'furlight': '#FFFDF9', 'furdark': '#EAE1DF', 'furdeep': '#DCD0CE',
       'muzzle': '#FFF8F4',
       'pink': '#FFC0D0', 'pinklight': '#FFCAD8', 'pinkdark': '#F29AB0',
       'hat': '#FFB0D0', 'hatlight': '#FFB6D3', 'hatdark': '#EC88B0',
       'shirt': '#FFF0A8', 'shirtlight': '#FFF7CC', 'shirtdark': '#EED486',
       'over': '#8FD0FF', 'overlight': '#A9DCFF', 'overdark': '#6AB0EC',
       'strap': '#5A8AD8', 'straplight': '#6E9CE4', 'strapdark': '#4772C0',
       'handle': '#B88659', 'handlelight': '#CC9C70', 'handledark': '#986A42',
       'blade': '#A6B6BF', 'bladelight': '#C2D0D8', 'bladedark': '#8494A0',
       'nose': '#E88DA4', 'nosehi': '#F6B4C4', 'blush': '#F3A1AC',
       'sclera': '#FFF6EA', 'iris': '#7A4424', 'pupil': '#2A1712',
       'lash': '#2A1A16', 'brow': '#4A2A20', 'mouth': '#4A2420', 'dark': '#2A2230'}
CHARTS = {'head': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'ear': (0, 0, 768, 768), 'spare': (768, 0, 512, 768)}
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'hat': ('hatdark', 'hat', 'hatlight'),
         'hatin': ('#D9789E', '#E88AAE', '#F29CBE'), 'shirt': ('shirtdark', 'shirt', 'shirtlight'),
         'over': ('overdark', 'over', 'overlight'), 'overin': ('#4A86C4', '#5A96D2', '#6AA6DE'),
         'strap': ('strapdark', 'strap', 'straplight'), 'handle': ('handledark', 'handle', 'handlelight'),
         'blade': ('bladedark', 'blade', 'bladelight'), 'hole': ('#3A5A8A', '#44669A', '#5072A6'),
         'pink': ('pinkdark', 'pink', 'pinklight'), 'tail': ('#EDE5E3', '#FCF9F7', '#FFFDFA'),
         'toe': ('#C8BCBB', '#D4C9C8', '#DDD3D2')}
RAMP_ROWS = {k: i for i, k in enumerate(RAMPS)}
if RIG:
    CHARTS.update({'lidU': (1280, 0, 512, 160), 'lidD': (1280, 160, 512, 128), 'cavity': (1280, 288, 128, 128), 'tongue': (1408, 288, 128, 128)})   # the free block x 1280-2048, y 0-1152
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
# Skull: from the front an elliptic dome (exponent NU) over a full, round jaw (exponent NL), widest at the cheek line
# z = ZC (the sheet: widest 0.26 W above the chin; 0.72 / 0.83 / 0.94 W wide at 0.04 / 0.08 / 0.14 W); in depth a
# superellipse (exponent PD; the sheet's side view: depth 0.87 W). The crown (under the hat) is 0.72 W above the chin.
SK = dict(a=.500, zc=.260, cu=.460, cl=.272, nu=2.10, nl=2.60, bf=.430, bb=.470, pd=2.00, face=.030, pdf=2.12)
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

_ym = float(front_local(0, .205, skull)[0])
MUZ = [[0, _ym + .085 - .020, .205], [.150, .085, .082]]; K_MUZ = .050       # the soft bunny muzzle, barely proud
JAW = [[0, -.140, .130], [.340, .230, .140]]; K_JAW = .06                  # the full lower face and chin (side view)
def base_local(q):
    d = smin(skull(q), ell(q, *JAW), K_JAW)
    return smin(d, ell(q, *MUZ), K_MUZ)
# eye layout (W units): opening centres +-0.241 W, 0.336 W above the chin; opening 0.241 W x 0.237 W (sheet close-up)
EXW, EZW, EHWW, EHHW, EN = .241, .336, .1205, .1185, 2.10
NZW = .263                                                  # nose centre 0.263 W above the chin (sheet 0.237-0.289)
NECK = [[0, -.005, -.250], [.150, .140, .270]]; K_NECK = .07
def warped(q): return q                                     # convex face: no eye sockets (Rosie round 8)
_yf = float(front_local(0, NZW, base_local)[0])
NOSE = [[0, _yf + .026 - .014, NZW], [.036, .024, .025]]; K_N = .010       # tiny button, 0.072 W wide
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

_g = np.stack(np.meshgrid(np.zeros(1), np.linspace(-.5, .5, 101), np.linspace(.55, .85, 301), indexing='ij'), -1).reshape(-1, 3)
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
NZ = CHIN + NZW * W; MZW = .200; MZ = CHIN + MZW * W; MHW = .083 * W     # the small 'w' mouth at 0.20 W, 0.166 W wide
BLUSH = (.320 * W, CHIN + .160 * W, .074 * W, .054 * W)

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
for k, (rx, rz, n) in enumerate([(.014, .010, 10), (.024, .016, 14), (.034, .023, 18), (.044, .029, 22)]):
    a = np.linspace(0, 2 * PI, n, endpoint=False) + .3 * k
    add_loop(to_dom(surf_dir(rx * W * np.cos(a), NZ + rz * W * np.sin(a))), 'nose_%d' % k)
for k, (hx, hz) in enumerate([(.094, .014), (.105, .018), (.116, .022)]):
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
D = fib(1500, math.radians(118.5)); Pf = radial_hit(D)
D2 = fib(3700, math.radians(74)); P2 = radial_hit(D2)       # a finer fill over the face, where it bends most
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
keep &= ~(front & ((Pf[:, 0] / (.051 * W)) ** 2 + ((Pf[:, 2] - NZ) / (.035 * W)) ** 2 < 1))
keep &= ~(front & ((Pf[:, 0] / (.124 * W)) ** 2 + ((Pf[:, 2] - MZ) / (.030 * W)) ** 2 < 1))
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
        verts.append(tuple(P - .0045 * SW * n + .0016 * SW * t)); vdir.append(vdir[vi]); vnorm.append(unit(.30 * n + t)); rr.append(i0 + k)
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
# ============================================================== EARS: tall thick bunny ears with a recessed pink panel
# Each ear is a ring stack along its axis U (bend loops), a chunky superellipse cross-section (across A, depth Nf) that
# rounds off into a blunt tip; the front (Nf, turned 30 deg outward) carries a recessed rounded panel painted pink.
# Head-local W units; built for the left ear (+X) and mirrored. The base is buried in the skull, under the hat.
EAR = dict(base=(.210, .130, .520), dir=(.235, .030, 1.0), L=.770, hw=.178, ht=.068, tm=.50, tmT=.80, face_out=30., P=2.4,
           NS=34, pc=.64, pt0=.12, pt1=.86, depth=.026, rim=.060)
def ear_frame():
    e = EAR; U = unit(np.array(e['dir'], float)); fo = math.radians(e['face_out'])
    Nf = np.array([math.sin(fo), -math.cos(fo), 0.]); Nf = unit(Nf - U * (U @ Nf)); A = unit(np.cross(U, Nf))
    return np.array(e['base'], float), U, Nf, A
def ear_prof(t):
    e = EAR; t = np.asarray(t, float)
    g = np.where(t < e['tm'], .70 + .30 * smooth(0, e['tm'], t), np.sqrt(clamp(1 - ((t - e['tm']) / (1 - e['tm'])) ** 2)))
    gT = np.where(t < e['tmT'], 1., np.sqrt(clamp(1 - ((t - e['tmT']) / (1 - e['tmT'])) ** 2)))
    return e['hw'] * g, e['ht'] * (.92 + .08 * (1 - t)) * gT
_EO_T = np.linspace(0, 1, 121)
def _ear_outline():
    hw, _ = ear_prof(_EO_T); a = np.concatenate([hw, -hw[::-1]]); h = np.concatenate([_EO_T, _EO_T[::-1]]) * EAR['L']
    return np.stack([a, h], -1)
def ear_dist(na, t):
    """distance (W) from a front-face point (across a = na hw(t), along h = t L) to the ear's side and tip outline"""
    O = _ear_outline(); A0 = O[:-1]; A1 = O[1:]
    hw, _ = ear_prof(t); P = np.stack([np.ravel(na * hw), np.ravel(t * EAR['L'])], -1); best = np.full(len(P), 9.)
    for i in range(len(A0)):
        d_ = A1[i] - A0[i]; L2 = d_ @ d_ + 1e-12; u_ = np.clip(((P - A0[i]) @ d_) / L2, 0, 1)
        best = np.minimum(best, np.linalg.norm(P - (A0[i] + u_[:, None] * d_), axis=1))
    return best.reshape(np.shape(na))
def build_ear():
    e = EAR; B, U, Nf, A = ear_frame(); P = e['P']; NS = e['NS']
    ts = np.concatenate([np.linspace(0, .80, 23)[:-1], .80 + .20 * np.sin(np.linspace(0, PI / 2, 11))[:-1]])
    th = np.linspace(0, 2 * PI, NS, endpoint=False)
    na = spow(np.sin(th), 2 / P); nb = spow(-np.cos(th), 2 / P)          # th = 0: the back (-Nf); th = pi: the front centre
    rings = []
    for t in ts:
        hw, ht = ear_prof(t)
        rec = e['depth'] * smoother(e['rim'] - .014, e['rim'] + .030, ear_dist(na, np.full(len(na), t))) * (nb > 0)
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
    # orient outward
    c0 = V.mean(0); f0 = F[NS * 6]; n0 = np.cross(V[f0[1]] - V[f0[0]], V[f0[2]] - V[f0[0]])
    if n0 @ (V[f0[0]] - (B + U * (e['L'] * ts[6]))) < 0:
        F = [tuple(f[::-1]) for f in F]; UVc = [tuple(u[::-1]) for u in UVc]
    return V, F, UVc, dict(B=B, U=U, Nf=Nf, A=A)
_Ve, _Fe, _UVe, _ei = build_ear()
ear_info = {}
for side, tag in ((1, 'L'), (-1, 'R')):
    V_ = _Ve.copy(); F_ = _Fe; UV_ = _UVe
    if side < 0:
        V_[:, 0] *= -1; F_ = [tuple(f[::-1]) for f in _Fe]; UV_ = [tuple(u[::-1]) for u in _UVe]
    UVa = [tuple(tuple(au('ear', u, v)) for (u, v) in f) for f in UV_]
    make_obj('bunny_ear.' + tag, L2M(V_), F_, UVa, 'ear.' + tag)
    mir = np.array([side, 1, 1.])
    ear_info[tag] = {'base': L2M(_ei['B'] * mir).tolist(), 'mid': L2M((_ei['B'] + _ei['U'] * EAR['L'] * .5) * mir).tolist(),
                     'tip': L2M((_ei['B'] + _ei['U'] * EAR['L']) * mir).tolist()}

print('STEP hat', flush=True)
# ============================================================== THE PETAL SUN HAT: a soft dome and six thick drooping petals
# Hat frame (head-local W units): centre HAT.c, tilted back by HAT.tilt (the front rises). Petal k points at azimuth 60 k
# (k = 0: the front). Each petal is a cushion (a cube-sphere ellipsoid) mapped onto a radial strip: narrow at the root
# (buried under the dome), widest two-thirds out, rounded at the tip, drooping down with distance, softly domed across;
# alternate petals sit a little higher so their overlaps read as layered petals, not z-fighting.
# the sheet's hat (measure.md): front edge 0.59-0.62 W, back petal down to 0.29 W, side petals to 0.41 W, widest +-0.63 W
# round 2 (director): cushion petals 0.07 W thick in the middle with a rolled rim 0.035 W thick; the lower edge at the front
# 0.626, at x +-0.5 about 0.45 and at the back about 0.40 W; no pink below the petal ring
HAT = dict(c=(0, .110, .620), tilt=12., dome=(.360, .340, .260), dome_p=2.5, r0=.14, r1=.670, zroot=.070, droop=.195,
           rbend=.28, dexp=2.2, w=.270, tm=.035, re=.0175, q0=.45, alt=.022, n=8, pp=2.8, yscale=.76, rise=.030, dfront=.035, dfs=.000,
           dback=.0, dbs=.040, sit=.100, wback=.0, dropback=.090, liftfr=.0, liftfs=.040)
HAT_R = rot([1, 0, 0], -math.radians(HAT['tilt']))
def hat_to_local(p): return np.asarray(HAT['c'], float) + np.asarray(p, float) @ HAT_R.T
def hat_obj(name, Vh, F, ramp, hi=.26, occ=0., under=None):
    Vl = hat_to_local(Vh); Vm = L2M(Vl)
    if under is not None:
        # round 3: where a petal's underside hovers within HAT.sit of the skull, it comes down to sit on it (2 mm off), so no
        # pink underside strip shows between the brim and the white head; the top surface and the free overhang are unchanged
        d0 = HAT['sit'] * W; m_ = under.copy()
        d = head_sdf(Vm); g_ = grad_n(Vm)
        nd = d - (d - .002) * (1 - smooth(.45 * d0, d0, d))               # seated 2 mm off the skull: no ragged intersection line
        mv = m_ & (d > .002) & (d < d0)
        Dv = np.zeros_like(Vm); Dv[mv] = -g_[mv] * (d[mv] - nd[mv])[:, None]
        nb_ = [set() for _ in range(len(Vm))]
        for f in F:
            for i in f: nb_[i].update(f)
        nb_ = [np.array(sorted(x)) for x in nb_]
        for _ in range(6):                                                  # a smooth displacement field: no crumpling
            Dv = np.where(m_[:, None], .5 * Dv + .5 * np.array([Dv[x].mean(0) for x in nb_]), 0.)
        Vm = Vm + Dv
        d = head_sdf(Vm); g_ = grad_n(Vm); lo_ = m_ & (d < .002)
        Vm[lo_] = Vm[lo_] + g_[lo_] * (.002 - d[lo_])[:, None]
        LOG.setdefault('petal_sit_moved', {})[name] = int(m_.sum() and (head_sdf(Vm)[m_] < 0).sum())
    N = vnormals(Vm, F)
    return make_obj(name, Vm, F, ramp_uv(ramp, sval(N, hi=hi, occ=occ)), 'hat')
# dome: a superellipsoid cushion
_S, _Fs = cube_sphere(8)
_den = (np.abs(_S) ** HAT['dome_p']).sum(1) ** (1 / HAT['dome_p'])
_D = _S / _den[:, None] * np.array(HAT['dome'])
_lo = smooth(0, 1, -_D[:, 2] / HAT['dome'][2])
# below the petal ring (hat z < 0.11) the dome pulls in inside the skull, so the white head shows directly under the brim
_D[:, :2] *= (1 - .48 * smooth(.08, -.04, _D[:, 2]))[:, None]; _D[:, 2] = np.where(_D[:, 2] < 0, _D[:, 2] * .35, _D[:, 2])
hat_obj('hat_dome', _D, _Fs, 'hat', hi=.10)
_S8, _F8 = cube_sphere(HAT['n']); PETAL_UNDER = {}
def petal_pts(k):
    h = HAT; phi = math.radians(60 * k)
    Rd = np.array([math.sin(phi), -math.cos(phi), 0.]); Td = np.array([math.cos(phi), math.sin(phi), 0.]); Z = np.array([0, 0, 1.])
    # a rounded slab: a softly domed top and bottom (half-thickness tm in the middle) and a rolled rim of radius re all round
    # the outline; cube-sphere latitude q: 1 at the top / bottom centre, 0 on the rim's equator (q < q0: the rim roll)
    rho0, om0, ze0 = _S8[:, 0], _S8[:, 1], _S8[:, 2]
    al = np.arctan2(om0, rho0); mm = np.sqrt(rho0 * rho0 + om0 * om0)
    q = np.arctan2(np.abs(ze0), mm) / (PI / 2); sg = np.where(ze0 >= 0, 1., -1.)
    kq = 1 / (np.abs(np.cos(al)) ** h['pp'] + np.abs(np.sin(al)) ** h['pp']) ** (1 / h['pp'])   # a rounded-square outline
    on_r = np.cos(al) * kq; on_w = np.sin(al) * kq
    rc = (h['r0'] + h['r1']) / 2; Lr = (h['r1'] - h['r0']) / 2
    wf_o = .58 + .42 * clamp(1 - ((on_r - .30) / 1.30) ** 2)
    bk = 1. if Td[1] > 0 else -1.                                  # +1: the +Td half is the petal's back-facing half
    wb = h['wback'] if k in (1, 5) else 0.                         # round 3: the front-side petals widen toward the back (cover the temples)
    X = Lr * on_r; Y = h['w'] * wf_o * on_w * (1 + wb * (on_w * bk > 0)); R = np.hypot(X, Y) + 1e-9
    re = h['re']; tm = h['tm']; q0 = h['q0']; beta = clamp(q / q0) * PI / 2
    s_top = (R - re) * clamp((1 - q) / (1 - q0))
    hs = re + (tm - re) * clamp(1 - (s_top / (R - re)) ** 2) ** .7
    sd = np.where(q > q0, s_top, R - re + re * np.cos(beta))
    ze = np.where(q > q0, hs, re * np.sin(beta)) * sg
    f_ = sd / R; rho = on_r * f_; om = on_w * f_
    PETAL_UNDER[k] = sg < 0
    r = rc + X * f_
    wf = np.ones_like(rho); Lt = 1.
    dred = (h['dfront'] + h['dfs'] * math.sin(phi) ** 2) * (1 - float(smooth(math.radians(70), math.radians(110), abs(math.atan2(math.sin(phi), math.cos(phi))))))
    aphi = abs(math.atan2(math.sin(phi), math.cos(phi)))
    dred = dred + h['dback'] * float(smooth(math.radians(90), math.radians(180), aphi))
    dred = dred + h['dbs'] * math.exp(-((aphi - math.radians(120)) / math.radians(28)) ** 2)   # round 3: the back-side petals lift
    dr = (h['droop'] - dred) * clamp((r - h['rbend']) / (h['r1'] - h['rbend'])) ** h['dexp']   # the front and front-side petals stay above the eyes
    zz = ze * Lt + h['zroot'] + h['alt'] * (k % 2) - dr - .024 * om ** 2 * smooth(-.5, .6, rho) + h['rise'] * (1 - smooth(.14, .40, r))
    if k in (1, 5):     # round 3: the front-side petals' back halves come down over the temples (hide the back petals there)
        zz = zz - h['dropback'] * clamp(on_w * f_ * bk) ** 1.1 * smooth(-1.1, .1, on_r * f_)
    if k in (1, 5):     # phase 2 (director): the front-side petals' outer parts lift 0.04 W (less framing from the game camera)
        zz = zz + h['liftfs'] * clamp((r - h['rbend']) / (h['r1'] - h['rbend'])) ** 1.5 * (1 - clamp(1.6 * on_w * f_ * bk))   # not the back half (the temples stay closed)
    if k in (2, 4):     # round 3: the back-side petals' front halves sit higher, behind the front-side petals at the temples
        zz = zz + h['liftfr'] * clamp(-on_w * f_ * bk) ** 1.1 * smooth(1.1, -.3, on_r * f_)
    Pp = Rd[None] * r[:, None] + Td[None] * (Y * f_)[:, None] + Z[None] * zz[:, None]
    return Pp * np.array([1, h['yscale'], 1.])
for k in range(6):
    _pp = petal_pts(k); hat_obj('hat_petal.%d' % k, _pp, _F8, 'hat', hi=.10, under=PETAL_UNDER[k] if k in (1, 2, 4, 5) else None)   # the front / back petals: no seating (the forehead was clean)
HAT_TOP = L2M(hat_to_local(np.array([[0, 0, HAT['dome'][2]]])))[0]
HAT_ANCHOR = L2M(hat_to_local(np.array([[0, 0, 0.]])))[0]

if HEAD_ONLY:
    BODY_PAINTERS = {}; BODY_PIVOTS = {}; JOINTS_BODY = {}
else:
    # ============================================================== BODY AND COSTUME (metres; body axis x = 0, y = 0)
    RCY = .000
    def ramp_fn(name, hi=.28, occ=0., add=0.):
        return lambda NN, V, *a: ramp_uv(name, sval(NN, occ=occ, hi=hi) + add)
    def ramp_sw(name, hi=.28, occ=0., add=0.):
        return lambda NV, tt, uu, V: ramp_uv(name, sval(NV, occ=occ, hi=hi) + add)

    print('BODY_STEP shirt torso', flush=True)
    # ---------------------------------------------------------------- the shirt torso: one lathed superellipse (z 0.20-0.45)
    TZ = np.array([.200, .240, .280, .320, .360, .390, .415, .440, .460])
    TAX = np.array([.160, .163, .162, .156, .146, .132, .112, .090, .068])
    TAY = np.array([.146, .149, .148, .143, .135, .124, .106, .086, .064])
    tax_f = natspline(TZ, TAX); tay_f = natspline(TZ, TAY); TP = 2.3
    def torso_raw(a, z):
        a = np.asarray(a, float); z = np.asarray(z, float)
        return np.stack([tax_f(z) * spow(np.sin(a), 2 / TP), RCY - tay_f(z) * spow(np.cos(a), 2 / TP), z + 0 * a], -1)
    def torso_n(a, z, e=1e-4):
        da = torso_raw(np.asarray(a) + e, z) - torso_raw(np.asarray(a) - e, z)
        dz = torso_raw(a, np.asarray(z) + e) - torso_raw(a, np.asarray(z) - e)
        n = unit(np.cross(dz, da)); c = torso_raw(a, z) - np.stack([0 * np.asarray(a), RCY + 0 * np.asarray(a), np.asarray(z) + 0 * np.asarray(a)], -1)
        return np.where(((n * c).sum(-1) < 0)[..., None], -n, n)
    def torso_f(p):
        z = np.clip(p[:, 2], TZ[0], TZ[-1])
        f = (np.abs(p[:, 0]) / tax_f(z)) ** TP + (np.abs(p[:, 1] - RCY) / tay_f(z)) ** TP - 1
        return np.where((p[:, 2] > TZ[-1]) | (p[:, 2] < TZ[0]), 1., f)
    NA_T = 32; zt_ = np.linspace(TZ[0], TZ[-1], 13); at_ = np.linspace(0, 2 * PI, NA_T, endpoint=False)
    AA, ZZ = np.meshgrid(at_, zt_)
    Pt_ = torso_raw(AA, ZZ); Nt_ = torso_n(AA, ZZ)
    make_obj('shirt_torso', Pt_.reshape(-1, 3), grid_faces(len(zt_), NA_T, True), ramp_uv('shirt', sval(Nt_.reshape(-1, 3), hi=.26)), 'body', N=Nt_.reshape(-1, 3))
    def surf_y(f, x, z, front=True, y0=0., y1=.40):
        """y of the surface of field f at (x, z) along -y (front) or +y (back), by bisection"""
        sgn = -1. if front else 1.; x = np.atleast_1d(np.asarray(x, float)); z = np.atleast_1d(np.asarray(z, float))
        lo = np.full(len(x), y0); hi = np.full(len(x), y1)
        for _ in range(40):
            m = (lo + hi) / 2; ins = f(np.stack([x, sgn * m, z], -1)) < 0
            lo = np.where(ins, m, lo); hi = np.where(ins, hi, m)
        return sgn * (lo + hi) / 2

    print('BODY_STEP overalls', flush=True)
    # ---------------------------------------------------------------- the overalls: round bloomer shorts (one SDF star mesh)
    PZ0, PZ1 = .080, .330
    def pants_sdf(p):
        d = ell(p, [0, .006, .200], [.180, .164, .128])
        # the waist: a near-vertical wall just outside the shirt, rolling over into it (a clean, steep seam, not a grazing one)
        e_ = np.sqrt((p[:, 0] / .171) ** 2 + ((p[:, 1] - .004) / .157) ** 2); dr_ = (e_ - 1) * .162; dz_ = np.abs(p[:, 2] - .262) - .052; re_ = .016
        d = smin(d, np.sqrt(np.maximum(dr_ + re_, 0) ** 2 + np.maximum(dz_ + re_, 0) ** 2) + np.minimum(np.maximum(dr_ + re_, dz_ + re_), 0) - re_, .04)
        for s in (-1, 1):
            d = smin(d, sd_capsule(p, np.array([s * .095, -.004, .100]), np.array([s * .097, .000, .170]), .085), .045)
        d = smax(d, -(p[:, 2] - .086), .014)                                   # the hems, softly rounded
        d = smax(d, -sd_capsule(p, np.array([0, -.30, .084]), np.array([0, .30, .084]), .022), .022)      # the leg split
        return d
    def pants_uv(NN, V): return chart_uv('spare', sval(NN, hi=.30), (V[:, 2] - PZ0) / (PZ1 - PZ0))
    PANTS_TH = np.concatenate([np.linspace(.10, .80, 5), np.linspace(.80, 1.24, 15)[1:], np.linspace(1.24, 1.95, 6)[1:], np.linspace(1.95, 2.45, 12)[1:], np.linspace(2.45, PI - .10, 5)[1:]])   # dense rows at the waist seam (polar ~1.0 rad) and the hems (~2.2 rad)
    star_mesh('overall_shorts', pants_sdf, np.array([0, .004, .205]), 'body', pants_uv, nph=38, tmax=.40, thetas=PANTS_TH)
    def paint_pants(U, V):
        z = PZ0 + V * (PZ1 - PZ0); C = ramp_colour('over', U)
        C = mix(C, rgb('overdark'), .55 * (1 - smooth(.0016, .0040, np.abs(z - .1035))))          # the turned-up cuff line
        C = mix(C, ramp_colour('over', U + .06), smooth(.103, .099, z) * smooth(.086, .090, z) * .6)   # the cuff band, a touch lighter
        return C
    def panel(name, front, zb, zt, hw_b, hw_t, clear, thick, nu=9, nv=7):
        """the bib (front) / back panel: a thick rounded plate laid on the torso and shorts"""
        P = []
        for v in np.linspace(0, 1, nv):
            z = zb + (zt - zb) * v; hw = hw_b + (hw_t - hw_b) * v
            for u in np.linspace(-1, 1, nu):
                x = u * hw; P.append([x, 0., z])
        P = np.array(P)
        yt = surf_y(lambda q: torso_f(q), P[:, 0], P[:, 2], front=front)
        yp = surf_y(pants_sdf, P[:, 0], P[:, 2], front=front)
        P[:, 1] = np.where(front, np.minimum(yt, yp), np.maximum(yt, yp)) + (-1 if front else 1) * clear
        F = grid_faces(nv, nu); Nv = vnormals(P, F)
        if (Nv[:, 1].mean() > 0) == front: Nv = -Nv
        Vt, Ft, UVt, Nt = thicken(P, F, Nv, thick, ramp_uv('over', .5), ramp_uv('over', .3), ramp_uv('over', .45), rim=3)
        return make_obj(name, Vt, Ft, ramp_uv('over', sval(Nt, hi=.28)), 'body', N=Nt)
    panel('overall_bib', True, .196, .372, .124, .098, .008, .014)   # round 3: lower, under the pocket
    panel('overall_back_panel', False, .250, .362, .120, .104, .008, .014)
    BIB_TOP = .372

    print('BODY_STEP straps', flush=True)
    # ---------------------------------------------------------------- straps over the shoulders, buttons at the bib
    STRAPS = {}
    for s in (-1, 1):
        o = np.array([s * .088, 0, .318]); path = []; norms = []
        for ph in np.linspace(math.radians(24), math.radians(158), 17):
            d = np.array([0, -math.cos(ph), math.sin(ph)])
            lo, hi = 0., .30
            for _ in range(40):
                m = (lo + hi) / 2; ins = torso_f((o + d * m)[None])[0] < 0
                lo, hi = (m, hi) if ins else (lo, m)
            q = o + d * lo
            g = grad(torso_f, q[None], 1e-4)[0]
            path.append(q + g * .017); norms.append(g)
        path = np.array(path); norms = np.array(norms)
        sweep('overall_strap.%d' % (s > 0), path, lambda k: (.0068, .0235), 'body', ramp_sw('strap', hi=.26), sides=12, normals=norms, p=.55)
        STRAPS[s] = (path, norms)
        bc = path[0] + norms[0] * .010 + np.array([0, 0, -.004])
        lobe('overall_button.%d' % (s > 0), bc, np.array([.010, .019, .019]), norms[0], 'body', ramp='strap', n=3, occ_in=.0, squash=.2, pole=[0, 0, 1.])

    print('BODY_STEP pocket + trowel', flush=True)
    # ---------------------------------------------------------------- the bib pocket and the trowel standing in it
    PKZ = .260   # round 3: on the bib's lower half (top edge level with the sleeve bottoms)
    _gx, _gz = np.meshgrid(np.linspace(-.11, .11, 9), np.linspace(PKZ - .07, PKZ + .07, 9)); _gx = _gx.ravel(); _gz = _gz.ravel()
    _gy = np.minimum(surf_y(lambda q: torso_f(q), _gx, _gz), surf_y(pants_sdf, _gx, _gz)) - .008 - .007       # the bib's outer face
    _A = lambda x, z: np.stack([np.ones_like(x), x * x, z - PKZ, (z - PKZ) ** 2, x * x * (z - PKZ), x ** 4], -1)
    _cf = np.linalg.lstsq(_A(_gx, _gz), _gy, rcond=None)[0]
    def bib_y(x, z): return _A(np.asarray(x, float), np.asarray(z, float)) @ _cf
    LOG['pocket_fit_rms_mm'] = round(float(np.sqrt(((bib_y(_gx, _gz) - _gy) ** 2).mean())) * 1000, 2)
    PKC = np.array([0, float(bib_y(0., PKZ)) - .012, PKZ])
    # the pocket (rig polish): a parametric rounded-rectangle plate on the bib's curved front, thickened with one rolled rim all round
    # (the old thin SDF slab crumpled along its lower edge); visible size 0.168 x 0.098 m, corner radii 0.020 (top) / 0.032 (bottom)
    T_PK = .028; R_PK = T_PK / 2
    def pk_outline(n=56):
        hx, hz = .084 - R_PK, .049 - R_PK; P2 = []
        for k in range(n):
            a_ = 2 * PI * k / n; d_ = np.array([math.cos(a_), math.sin(a_)]); rc_ = (.020 if d_[1] > 0 else .032) - R_PK
            lo, hi = 0., .2                                                   # ray to the rounded rectangle (rounded-box SDF)
            for _ in range(40):
                m = (lo + hi) / 2; q_ = np.abs(d_ * m) - np.array([hx - rc_, hz - rc_])
                inside = np.linalg.norm(np.maximum(q_, 0)) + min(max(q_[0], q_[1]), 0) - rc_ < 0
                lo, hi = (m, hi) if inside else (lo, m)
            P2.append(d_ * lo)
        return np.array(P2)
    _O = pk_outline(720); _D = np.diff(np.vstack([_O, _O[:1]]), axis=0); _sl = np.linalg.norm(_D, axis=1)
    _ta = np.arctan2(_D[:, 1], _D[:, 0]); _dt = np.abs(np.angle(np.exp(1j * (np.roll(_ta, -1) - _ta))))
    _L = np.concatenate([[0], np.cumsum(_sl / _sl.sum() + .55 * _dt / _dt.sum())])   # 48 points by arc length + turning: dense round corners
    _t = np.linspace(0, _L[-1], 48, endpoint=False)
    O2 = np.stack([np.interp(_t, _L, np.append(_O[:, 0], _O[0, 0])), np.interp(_t, _L, np.append(_O[:, 1], _O[0, 1]))], -1); NR = 4; NP = len(O2)
    G2 = [np.zeros(2)] + [O2[k] * (j / NR) ** .8 for j in range(1, NR + 1) for k in range(NP)]
    G2 = np.array(G2); Fp = [(0, 1 + k, 1 + (k + 1) % NP) for k in range(NP)]
    for j in range(NR - 1):
        for k in range(NP):
            a0 = 1 + j * NP + k; b0 = 1 + j * NP + (k + 1) % NP; Fp.append((a0, a0 + NP, b0 + NP, b0))
    Vp = np.stack([G2[:, 0], bib_y(G2[:, 0], PKZ + G2[:, 1]) - .012, PKZ + G2[:, 1]], -1)
    Np = vnormals(Vp, Fp)
    if Np[:, 1].mean() > 0: Np = -Np
    Vt, Ft, UVt, Nt = thicken(Vp, Fp, Np, T_PK, ramp_uv('over', .5), ramp_uv('over', .3), ramp_uv('over', .45), rim=6)
    make_obj('bib_pocket', Vt, Ft, ramp_uv('over', sval(Nt, hi=.30) + .04), 'body', N=Nt)
    lobe('bib_pocket_mouth', np.array([0, float(bib_y(0., PKZ + .040)) - .012 - .0118, PKZ + .040]), np.array([.0030, .072, .0048]), [0, -1., 0], 'body', ramp='hole', n=3, occ_in=0, pole=[0, 0, 1.])
    TRC = np.array([.008, float(bib_y(.008, PKZ)) - .014, PKZ])
    lobe('trowel_blade_top', TRC + np.array([0, 0, .040]), np.array([.008, .027, .016]), [0, -1., 0], 'body', ramp='blade', n=4, occ_in=.0, squash=.1, pole=[0, 0, 1.])
    sweep('trowel_ferrule', [TRC + np.array([0, 0, .044]), TRC + np.array([0, 0, .055])], lambda k: (.0170, .0170), 'body', ramp_sw('blade', hi=.30), sides=14)
    sweep('trowel_handle', [TRC + np.array([0, 0, .055]), TRC + np.array([.001, -.001, .074]), TRC + np.array([.002, -.002, .092])],
          lambda k: (.0145 + .0012 * k / 2, .0145 + .0012 * k / 2), 'body', ramp_sw('handle', hi=.32), sides=14)
    TROWEL_TOP = float((TRC + np.array([0, 0, .092 + .0157 * .9]))[2])

    print('BODY_STEP arms', flush=True)
    # ---------------------------------------------------------------- arms: puffy short sleeves, white arms, mitten paws
    ARM = {}; ARM_DEG = 38.
    for s, tag in ((1, 'L'), (-1, 'R')):
        th = math.radians(ARM_DEG); ad = unit(np.array([s * math.sin(th), -.05, -math.cos(th)]))
        SH = np.array([s * .120, -.004, .362])
        fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
        def along(t0, SH=SH, ad=ad): return SH + ad * t0
        TS0, TS1 = -.040, .092
        path = np.array([along(t0) for t0 in np.linspace(TS0, TS1, 9)])
        sweep('puff_sleeve.' + tag, path, lambda k: ((.060 + .024 * math.sin(PI * min(1, (k / 8) * 1.15)) ** .8) * (1 - .06 * (k / 8) ** 4),) * 2,
              'arm.' + tag, ramp_sw('shirt', hi=.26), sides=22, cap0=False, cap1=False, normals=np.tile(fwd, (len(path), 1)))
        abr = np.linspace(0, 2 * PI, 22, endpoint=False); e1 = fwd; e2 = np.cross(ad, fwd)
        HC = along(TS1 - .003); rh = .060 * .94
        Phr = HC + np.outer(np.cos(abr), e1) * rh + np.outer(np.sin(abr), e2) * rh
        Nhr = unit(np.outer(np.cos(abr), e1) + np.outer(np.sin(abr), e2))
        ring_tube('puff_sleeve_hem.' + tag, Phr, lambda k: np.stack([.0105 * np.cos(np.linspace(0, 2 * PI, 8, endpoint=False)), .0115 * np.sin(np.linspace(0, 2 * PI, 8, endpoint=False))], -1),
                  'arm.' + tag, ramp_sw('shirt', hi=.24, add=-.03), Nhr, sides=8)
        WR = along(.166); PC = along(.218); lat = np.cross(ad, fwd) * s
        paw_axes = np.array([ad, fwd, lat])
        thumb = PC + fwd * .040 + lat * .018 - ad * .012
        def arm_parts(p, WR=WR, PC=PC, paw_axes=paw_axes, thumb=thumb, SH=SH, ad=ad):
            d_fa = sd_capsule(p, SH + ad * .050, WR, (.043, .046))
            d_paw = sd_ell(p, PC, paw_axes, (.064, .058, .054))
            d_t = sd_ell(p, thumb, paw_axes, (.028, .024, .024))
            return d_fa, d_paw, d_t
        def arm_sdf(p, arm_parts=arm_parts):
            d_fa, d_paw, d_t = arm_parts(p)
            return smin(smin(d_fa, d_paw, .030), d_t, .012)
        def arm_uv(NN, V, arm_parts=arm_parts):
            d_fa, d_paw, d_t = arm_parts(V)
            cr = crease(np.minimum(d_paw, d_fa), d_t, .012) * .35
            return ramp_uv('fur', sval(NN, occ=cr, hi=.34))
        tt_ = np.linspace(0, .15, 301); inside = arm_sdf(PC[None] + ad[None] * tt_[:, None]) < 0
        reach = float(tt_[np.argmin(inside)]) if not inside.all() else .15
        tips = PC + ad * (reach - .006); st = SH + ad * .055
        ts = np.concatenate([np.linspace(0, .40, 6)[:-1], np.linspace(.40, 1.0, 14)])
        cen = st[None] + (tips - st)[None] * ts[:, None]
        ring_stack('white_mitten_arm.' + tag, arm_sdf, cen, np.tile(ad, (len(ts), 1)), 'arm.' + tag, arm_uv, sides=18, tmax=.15, ref=fwd)
        ARM[tag] = {'shoulder': SH.tolist(), 'elbow': along(.110).tolist(), 'wrist': WR.tolist(), 'palm': (PC + lat * .010).tolist()}

    print('BODY_STEP feet', flush=True)
    # ---------------------------------------------------------------- big rounded bunny feet with two toe lines each
    LEG = {}
    for s, tag in ((1, 'L'), (-1, 'R')):
        FC = np.array([s * .118, -.042, .050]); yaw = s * math.radians(7)
        FAX = rot([0, 0, 1], yaw).T
        toes = [FC + FAX[0] * (o * .036) for o in (-1, 1)]
        def foot_parts(p, FC=FC, FAX=FAX, s=s, toes=toes):
            cap = lambda p_, a_, b_: sd_capsule(p_, a_, b_, .0075)
            d = sd_ell(p, FC, FAX, (.112, .146, .068))
            d = smin(d, sd_capsule(p, np.array([s * .108, .000, .064]), np.array([s * .104, .000, .120]), .075), .035)
            d = smax(d, -(p[:, 2] - .000), .016)
            g = [smin(cap(p, t_ - FAX[1] * .149, t_ - FAX[1] * .132 + np.array([0, 0, .026])), cap(p, t_ - FAX[1] * .132 + np.array([0, 0, .026]), t_ - FAX[1] * .098 + np.array([0, 0, .046])), .004) for t_ in toes]
            return d, g
        def foot_sdf(p, foot_parts=foot_parts):
            return foot_parts(p)[0]
        def foot_uv(NN, V, foot_parts=foot_parts):
            return ramp_uv('fur', sval(NN, hi=.34, occ=.05 * smooth(.03, .0, V[:, 2])))
        star_mesh('bunny_foot.' + tag, foot_sdf, FC + np.array([0, .01, .016]), 'body', foot_uv, nth=18, nph=28, tmax=.30)
        # two toe lines per foot: thin soft-grey strips laid on the surface, from the front face up over the toe
        for t_ in toes:
            tl = np.array([t_ - FAX[1] * (.150 - .046 * u_) + np.array([0, 0, .044 * math.sin(u_ * PI / 2) - .002]) for u_ in np.linspace(0, 1, 7)])
            for _ in range(6): tl = tl - foot_sdf(tl)[:, None] * grad(foot_sdf, tl, 1e-4)
            tn = grad(foot_sdf, tl, 1e-4)
            sweep('bunny_toe_line.%s.%d' % (tag, len(LEG)), tl + tn * .0009, lambda k: (.0016, .0052 * (1 - .45 * abs(k - 3) / 3)), 'body', ramp_sw('toe', hi=.20), sides=8, normals=tn, p=.6)
        LEG[tag] = {'hip': [s * .092, .004, .200], 'knee': [s * .100, -.004, .130], 'ankle': [s * .104, .000, .070],
                    'toe': (FC - FAX[1] * .150 + np.array([0, 0, -.020])).tolist()}

    print('BODY_STEP tail', flush=True)
    # ---------------------------------------------------------------- the round cotton tail (a soft lumpy ball)
    TLZ = .225; TLY = float(surf_y(pants_sdf, np.array([0.]), np.array([TLZ]), front=False)[0])
    TLC = np.array([0, TLY + .014, TLZ])
    def tail_sdf(p):
        q = p - TLC; r = np.linalg.norm(q, axis=1) + 1e-9
        u_ = q / r[:, None]
        bump = .0012 * (np.cos(5 * np.arctan2(u_[:, 2], u_[:, 0]) + .4) * (1 - u_[:, 1] ** 2) + .5 * np.cos(4 * np.arccos(np.clip(u_[:, 1], -1, 1))))
        return ell(p, TLC, [.062, .048, .060]) - bump * smooth(.0, .5, r / .058)
    star_mesh('cotton_tail', tail_sdf, TLC, 'tail', lambda NN, V: ramp_uv('tail', sval(NN, hi=.30)), nth=12, nph=22, tmax=.12)

    _vs = lambda pre: np.array([list(o.matrix_world @ v.co) for g, obs in parts.items() for o in obs if any(o.name.startswith(x) for x in pre) for v in o.data.vertices])
    def _ext(v): return {'min': [round(float(c), 3) for c in v.min(0)], 'max': [round(float(c), 3) for c in v.max(0)], 'size': [round(float(c), 3) for c in np.ptp(v, 0)]}
    BODY_MEAS = {'body_parts_m': {k: _ext(_vs(p)) for k, p in (('shorts', ['overall_shorts']), ('bib', ['overall_bib']), ('feet', ['bunny_foot']),
                 ('foot_L', ['bunny_foot.L']), ('tail', ['cotton_tail']), ('pocket', ['bib_pocket']), ('trowel', ['trowel_']), ('sleeve_L', ['puff_sleeve.L', 'puff_sleeve_hem.L']),
                 ('arm_L', ['white_mitten_arm.L']), ('shirt', ['shirt_torso']), ('straps', ['overall_strap']), ('ears', ['bunny_ear']))},
                 'arm_angle_from_vertical_deg': ARM_DEG, 'trowel_top_z': round(TROWEL_TOP, 3)}

    print('BODY_STEP joints', flush=True)
    JOINTS_BODY = {'hips': [0, .004, .200], 'spine': [0, .002, .280], 'chest': [0, .000, .360], 'neck': [0, .000, .425],
                   'arms': {t: {k: v for k, v in ARM[t].items() if k != 'palm'} for t in ARM}, 'legs': LEG,
                   'tail': [TLC.tolist()], 'palm_R': ARM['R']['palm'], 'palm_L': ARM['L']['palm']}
    BODY_PIVOTS = {'arm.L': tuple(ARM['L']['shoulder']), 'arm.R': tuple(ARM['R']['shoulder']), 'tail': tuple(TLC), 'body': (0, 0, 0),
                   'hat': tuple(HAT_ANCHOR)}
    BODY_PAINTERS = {'spare': paint_pants}
    def POST_JOIN():
        def sc(v): return [round(float(c), 5) for c in v]
        joints = {'units': 'metres (final, ear tips 1.10 m)', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X'}
        joints.update({k: sc(JOINTS_BODY[k]) for k in ('hips', 'spine', 'chest', 'neck')})
        joints['head'] = sc(O)
        joints['head_nod_pivot_suggested'] = sc([0, HY + .10 * W, CHIN + .03 * W])
        joints['jaw_pivot'] = sc([0, float(HY - .22 * W), float(CHIN + .135 * W)])
        joints['eyes'] = {'R': sc(eye_centers['R']), 'L': sc(eye_centers['L'])}
        joints['eye_axes'] = {k: LOG['eye_axis_' + k] for k in ('R', 'L')}
        joints['ears'] = {t: {k: sc(v) for k, v in ear_info[t].items()} for t in ('R', 'L')}
        joints['hat_anchor'] = sc(HAT_ANCHOR); joints['hat_tilt_back_deg'] = HAT['tilt']
        joints['arms'] = {t: {k: sc(v) for k, v in JOINTS_BODY['arms'][t].items()} for t in ('L', 'R')}
        joints['legs'] = {t: {k: sc(v) for k, v in JOINTS_BODY['legs'][t].items()} for t in ('L', 'R')}
        joints['tail'] = [sc(v) for v in JOINTS_BODY['tail']]
        joints['palm_R'] = sc(JOINTS_BODY['palm_R']); joints['palm_L'] = sc(JOINTS_BODY['palm_L'])
        joints['notes'] = ['Phase 1: no rig, weights or animations. Same keys as the Tanuki / Poe joints.json (final metres).',
                           'head = the head centre (the radial origin); head_nod_pivot_suggested = base of the skull, for the rig.',
                           'Head skin = zero surface of one convex implicit ball (dome skull + full jaw + soft muzzle + nose), analytic normals, toon-band refinement; no eye sockets.',
                           'Eyelid holes ringed by 6 loops each with the rim rolled in behind separate lens eyeballs; 3 loops round the mouth, 4 round the nose.',
                           'Ears: separate pieces (Usagi_ear_L / _R), 27 rings along the axis (bend loops), pivot = ears.base (buried in the skull, under the hat).',
                           'Hat: a separate piece (Usagi_hat: dome + 6 petals), pivot = hat_anchor; it rides the head bone.',
                           'Tail: Usagi_tail, a small closed ball, pivot = tail[0].',
                           'The shorts are one closed piece with a split between the legs; the sleeves are open tubes; arms carry rings along the forearm and wrist.']
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
def lash_th(psi):
    """the thick upper lash line (in eye radii): thin at the nasal corner, thickest over the top-outer part, then down the
    outer side as a thinning line (the sheet's lash hugs the outer white crescent)"""
    top = (.045 + .125 * np.sin(np.clip(psi, 0, PI)) ** .6 + .055 * np.exp(-((psi - .75) / .45) ** 2)) * smooth(PI + .05, PI - .40, psi)
    side = (.045 + .045 * smooth(-1.0, 0., psi)) * smooth(-1.05, -.55, psi)
    return np.where(psi >= 0, top, side)
PAINT_OPTS = {'band': True, 'blush': True}
# the face layout (W units, front projection: x across, z above the chin), measured on the sheet's head close-up
BROW_P = np.array([[.185, .528], [.205, .542], [.231, .547], [.257, .537], [.279, .508]]); BROW_H = np.array([.0080, .0088, .0082, .0062, .0030])
MOUTH_P = np.array([[-.088, .214], [-.081, .198], [-.064, .180], [-.040, .170], [-.018, .177], [0, .195], [.018, .177], [.040, .170],
                    [.064, .180], [.081, .198], [.088, .214]])
FLICKS = [((.80, 1.12), (1.16, 1.02)), ((.40, 1.10), (1.22, .64))]          # (root psi, root sr) -> tip (X, Z), eye radii
def paint_head(U, V):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = radial_hit(d); n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); qx, qy, qz = q[:, 0], q[:, 1], q[:, 2]; ax = np.abs(qx)
    fr = smooth(HY + .04, HY - .06, y)
    up = n @ LIGHT
    # white fur with the sheet's soft warm-grey modelling: light on the top planes, a cool-warm grey turning away
    C = mix(rgb('fur'), rgb('furlight'), .70 * smooth(.30, 1.0, up))
    C = mix(C, rgb('furdark'), .35 * smooth(.0, .85, -up))
    C = mix(C, rgb('furdark'), .30 * smooth(.55, .05, -n[:, 1]) * smooth(-.2, .4, n[:, 1] * 0 + 1) * smooth(.2, -.3, up))
    C = mix(C, rgb('furdeep'), .22 * smooth(.02, -.10, qz) * smooth(-.2, -.7, n[:, 2]))           # the under-jaw shade
    # the muzzle: barely warmer white round the nose and mouth
    mt = np.sqrt((((q - np.array(MUZ[0])) / np.array([.17, .12, .10])) ** 2).sum(1))
    C = mix(C, mix(rgb('muzzle'), rgb('furlight'), .3), .65 * (1 - smooth(.5, 1.0, mt)) * fr)
    cr = .45 * crease(skull(q), ell(q, *MUZ), K_MUZ)
    C = mix(C, rgb('furdark'), clamp(cr) * .35 * fr)
    # brows: soft dark arches
    for s in (-1, 1):
        Pb = cpath(BROW_P * np.array([s, 1.]), 17)
        ib = (fr > 0) & (np.abs(qx - s * .232) < .08) & (np.abs(qz - .527) < .05)
        a = np.zeros(len(qx)); a[ib] = stroke(qx[ib], qz[ib], Pb, np.interp(np.linspace(0, 1, 17), np.linspace(0, 1, 5), BROW_H), .0028)
        C = mix(C, rgb('brow'), .95 * a)
    # blush: soft round dabs on the cheeks, level with the mouth
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .92 * (1 - smooth(.72, 1.04, r)) * fr * PAINT_OPTS['blush'])
    # the tiny pink nose: a soft rounded inverted triangle, a lighter top
    nq = (q - np.array(NOSE[0])) / np.array(NOSE[1]); tri = (1 + .45 * clamp(-nq[:, 2] - .1)) * (1 - .08 * clamp(nq[:, 2]))
    rn = np.sqrt((nq[:, 0] * tri) ** 2 + nq[:, 1] ** 2 + (nq[:, 2] * 1.05) ** 2)
    nose_c = mix(rgb('#D8748E'), rgb('nose'), smooth(-.45, .85, n @ unit(np.array([-.10, -.45, 1.]))))
    C = mix(C, nose_c, .98 * (1 - smooth(1.00, 1.22, rn)))
    rh_ = np.sqrt((((q - (np.array(NOSE[0]) + np.array([-.008, -.018, .012]))) / np.array([.016, .014, .008])) ** 2).sum(1))
    C = mix(C, rgb('nosehi'), .80 * (1 - smooth(.45, 1.0, rh_)) * (rn < 1.1))
    # the 'w' mouth and the short philtrum from the nose
    Pm = cpath(MOUTH_P, 44); Pm = np.stack([Pm[:, 0] * W, CHIN + Pm[:, 1] * W], -1)
    half = np.full(len(Pm), .0062 * W); half[:4] = np.linspace(.0030, .0062, 4) * W; half[-4:] = np.linspace(.0062, .0030, 4) * W
    Pph = np.array([[0, CHIN + .197 * W], [0, CHIN + (NOSE[0][2] - NOSE[1][2] + .006) * W]]); hph = np.array([.0058 * W, .0050 * W])
    ib = (fr > 0) & (np.abs(x) < .12 * W) & (z > CHIN + .14 * W) & (z < NZ)
    a = np.zeros(len(x)); a[ib] = np.maximum(stroke(x[ib], z[ib], Pm, half, .0026 * W), stroke(x[ib], z[ib], Pph, hph, .0026 * W))
    C = mix(C, rgb('mouth'), .95 * a)
    # the thick upper lash line round the eye opening with two wing flicks, and a faint soft lower rim
    for s in (-1, 1):
        sr, psi, X, Z = eye_s(s, x, z)
        near_eye = fr * (sr < 1.9)
        th = lash_th(psi)
        lash = (1 - smooth(1 + th - .015, 1 + th + .015, sr)) * PAINT_OPTS['band']
        for (rp, rs), (tx, tz) in FLICKS:
            P0 = np.array([[rs * math.cos(rp), rs * math.sin(rp)], [tx, tz]])
            ii = near_eye > 0
            fl = np.zeros(len(x)); fl[ii] = stroke(X[ii], Z[ii], P0, np.array([PAINT_OPTS.get('flick_root', .085), .016]), .018)
            lash = np.maximum(lash, fl)
        low = .30 * (1 - smooth(1.02, 1.07, sr)) * smooth(.0, -.50, np.sin(psi)) * smooth(-.2, .5, -np.cos(psi) * 0 + 1)
        C = mix(C, rgb('lash'), np.maximum(lash, low * PAINT_OPTS['band']) * near_eye)   # (the lid paint turns the band off)
    return C.reshape(sh + (3,))

def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .24; iz = -.03; irx = .755; irz = .886          # iris 75 % of the opening width, tucked toward the nose (sheet)
    C = mix(rgb('sclera'), rgb('#E6DEDC'), .55 * smooth(.40, .98, Z))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    g = smooth(.70, -.90, ez)
    I = mix(rgb('#3C1E0E'), rgb('iris'), smooth(.05, .45, g))
    I = mix(I, rgb('#A65E2E'), smooth(.50, .85, g))
    I = mix(I, rgb('#D08848'), .85 * smooth(.60, .95, g) * (1 - smooth(.82, .97, r)))     # the warm lower glow
    I = mix(I, rgb('#3A1C0E'), .75 * smooth(.86, 1.0, r))                                   # the darker rim
    I = I * (1 - .03 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 30 + r * 10)) * smooth(.4, .8, r))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    px_ = ix - s * .10; pz = iz + .03; R = np.sqrt(((X - px_) / .50) ** 2 + ((Z - pz) / .66) ** 2)
    C = mix(C, rgb('pupil'), 1 - smooth(.95, 1.05, R))
    # two catchlights: a big round one upper-nasal, a small one lower-outer
    big = np.sqrt(((X - (-s * .47)) / .175) ** 2 + ((Z - .31) / .175) ** 2)
    small = np.sqrt(((X - (ix + s * .34)) / .075) ** 2 + ((Z - (iz - .48)) / .065) ** 2)
    C = mix(C, rgb('#FFFBF4'), np.maximum(1 - smooth(.92, 1.06, big), .85 * (1 - smooth(.88, 1.10, small))))
    C = mix(C, rgb('lash'), smooth(.93, 1.0, sr) * smooth(-.10, .40, Z))
    C = mix(C, rgb('#6A4A44'), .35 * smooth(.95, 1.02, sr) * smooth(.0, -.40, Z))
    return C

def paint_ear(U, V):
    """the ear's chart: u = angle round the ear axis (0 = the back), v = along the ear; white fur with soft modelling,
    and the recessed pink panel on the front (a crisp rounded border, deeper pink toward its rim and its base)"""
    e = EAR; B, Ua, Nf, A = ear_frame(); th = U * 2 * PI; t = V; P = e['P']
    na = spow(np.sin(th), 2 / P); nb = spow(-np.cos(th), 2 / P)
    hw, ht = ear_prof(t)
    n = unit(A[None] * (spow(np.sin(th), 2 - 2 / P) / np.maximum(hw, 1e-3))[..., None] + Nf[None] * (spow(-np.cos(th), 2 - 2 / P) / np.maximum(ht, 1e-3))[..., None]
             + Ua[None] * (.6 * smooth(.85, 1., t))[..., None])
    C = ramp_colour('fur', sval(n.reshape(-1, 3), hi=.30).reshape(t.shape))
    dpan = ear_dist(na, t); front = (nb > 0).astype(float)
    pink = ramp_colour('pink', .5 + .5 * (sval(n.reshape(-1, 3), hi=.06, lo=.08).reshape(t.shape) - .5))   # an even #FFC0D0
    C = mix(C, pink, smooth(e['rim'] - .0025, e['rim'] + .0025, dpan) * front)
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
        atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [246, 242, 240, 255]
    else: atlas = base.copy()
    for name, (x0, y0, w, h) in CHARTS.items():
        if name not in PAINTERS or (only is not None and name not in only): continue
        print('PAINT', name, flush=True)
        if name == 'ramp':
            U, V = np.meshgrid(clamp((np.arange(w) - 8) / (w - 16)), (np.arange(h) + .5) / h)
        elif name == 'spare':
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
atlas_path = os.path.join(ROOT, 'scratch', 'head_atlas.png') if HEAD_ONLY else (os.path.join(ROOT, 'scratch', 'rig_base_atlas.png') if RIG else os.path.join(ROOT, 'usagi-toy_atlas.png'))
ATLAS = paint_atlas(atlas_path)
img = bpy.data.images.load(atlas_path); img.name = 'Usagi_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Usagi_toy_atlas'); MAT.use_nodes = True
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
        'hat_top_m': round(float(HAT_TOP[2]), 4), 'hat_top_W': round(float((HAT_TOP[2] - CHIN) / W), 3),
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
    ob = bpy.context.object; ob.name = 'Usagi_' + group.replace('.', '_'); ob.data.name = ob.name
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
HEADSET = sum(v for k, v in part_tri.items() if k in ('Usagi_head', 'Usagi_eye_L', 'Usagi_eye_R', 'Usagi_ear_L', 'Usagi_ear_R', 'Usagi_hat'))
MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count; MEAS['head_face_eyes_ears_hat_triangles'] = HEADSET
allv = np.concatenate([np.array([list(o.matrix_world @ v.co) for v in o.data.vertices]) for o in objects])
MEAS['bounds_final_m'] = {'min': [round(float(c), 4) for c in allv.min(0)], 'max': [round(float(c), 4) for c in allv.max(0)]}
if RIG:
    assert tri_count <= 32000, ('Triangle budget (rig: the denser toon-refined head; the rig total is checked against 34k)', tri_count)
elif not HEAD_ONLY:
    assert tri_count <= 30000, ('Triangle budget', tri_count)
    POST_JOIN = globals().get('POST_JOIN')
    if POST_JOIN: POST_JOIN()
    with open(os.path.join(ROOT, 'measurements.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-head.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
if not RIG: print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not HEAD_ONLY and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'usagi-toy.blend'))
def export(path):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects: ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                              export_animations=False)
if not RIG: export(OUT_MODEL)
print('USAGI_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
