"""Chiku (tk-chiku-toy), Takemori's shopkeeper bunny, Toybox line zone villager, phase-1 model (neutral A-pose, no rig).
Blender 4.3, no addons. Deterministic: a full rebuild from an empty scene.

    blender --background --factory-startup --python build_tk-chiku-toy.py [-- --head-only]

Final asset: 1 unit = 1 m, front = -Y, feet on z = 0, character left = +X, crown 1.05 m, ear tips 1.30 m.
Writes only inside this folder and public/models/tk-chiku-toy.glb (--head-only: scratch/ only).

Technique (the Usagi / Rosie toy-line machinery, authored directly in metres; measure.md has the sheet targets):
- The head is ONE smooth convex implicit ball: a bun-shaped skull (an elliptic dome over a round, full jaw, widest 0.25 W
  above the chin), a soft muzzle and a small button nose. No eye sockets: the eyes sit on the ball. The skin is the field's
  zero surface reached by radial projection (CDT in a stereographic domain with edge loops round the eyelids, nose and
  mouth), so every vertex carries its analytic normal; adaptive refinement adds points where the toon band would zigzag.
- The bunny ears are thick ring stacks (bend loops along their length) with a recessed pink panel on the front.
- The green bandana is a cushioned band laid on the skull (horizontal rays from the head axis), widening at the back into
  the kerchief over the back of the head, with a round knot and two thick leaf-shaped ends (separate, with bend loops).
- Clothing is lathed / swept / SDF star meshes; limbs are SDF ring stacks; the cotton tail is a lumpy SDF ball.
- One 2048 painted atlas: the face and eyes painted from 3D positions, a 2-D chart for the ears' pink panels, 1-D shading
  ramps (soft painted light) for everything else.
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
MODEL = os.environ.get('CHIKU_MODEL_OUT', MODELS + '/tk-chiku-toy.glb')
OUT_MODEL = os.path.join(ROOT, 'scratch', 'chiku-head-test.glb') if HEAD_ONLY else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
S_FINAL = 1.0                               # authored in metres
# sheet (refs/sheet.png, measure.md): front view ground y 521, crown y 148 (373 px = 1.05 m, 355 px / m), centre x 218.5;
# head: W 220 px = 0.620 m between the cheek points (head close-up: 317 px), chin 0.59 m, crown 0.75-0.77 W above the chin.
W = .620; CHIN = .585; HY = -.012           # head width, chin height, head centre y (metres)
SW = W / .757                               # Tanuki-build millimetre constants (head W 0.757) scale with the head
LOG = {}

PAL = {'fur': '#F4EAD8', 'furlight': '#FCF3E3', 'furdark': '#E8DBC5', 'furdeep': '#D9CCB6',    # one hue (38 deg), value only: no hue shift on the crown
       'muzzle': '#FFFAF4',
       'pink': '#FFC4CC', 'pinklight': '#FFCED5', 'pinkdark': '#F4A6B2',
       'band': '#62A574', 'bandlight': '#76B888', 'banddark': '#4C8A5E',
       'shirt': '#7CC0A0', 'shirtlight': '#92CEB2', 'shirtdark': '#62A486',
       'trou': '#577A69', 'troulight': '#668B79', 'troudark': '#466556',
       'apron': '#F6E6C4', 'apronlight': '#FBF0D8', 'aprondark': '#E4D0A8',
       'bag': '#C8A060', 'baglight': '#D6B176', 'bagdark': '#AC844A',
       'nose': '#E88DA4', 'nosehi': '#F6B4C4', 'blush': '#F3A1AC',
       'sclera': '#FFF6EA', 'iris': '#6A4A2A', 'pupil': '#2D201B',
       'lash': '#2D201B', 'brow': '#7A4E2E', 'mouth': '#3A2420', 'dark': '#2A2230'}
CHARTS = {'head': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'ear': (0, 0, 768, 768), 'spare': (768, 0, 512, 768)}
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'band': ('banddark', 'band', 'bandlight'), 'bandin': ('#3E7A50', '#468458', '#508E62'),
         'shirt': ('shirtdark', 'shirt', 'shirtlight'), 'trou': ('troudark', 'trou', 'troulight'),
         'apron': ('aprondark', 'apron', 'apronlight'), 'bag': ('bagdark', 'bag', 'baglight'), 'bagin': ('#8E6A3A', '#9C7644', '#A8824E'),
         'hole': ('#B8A27C', '#C4AE88', '#CEB894'), 'pink': ('pinkdark', 'pink', 'pinklight'), 'tail': ('#EADDC8', '#F6ECDB', '#FCF3E3'),
         'toe': ('#CDBBA0', '#D8C7AC', '#E0D0B6'), 'button': ('#8E6638', '#A07444', '#B08452'),
         'lash': ('#251A16', '#2D201B', '#4C3C36')}
RAMP_ROWS = {k: i for i, k in enumerate(RAMPS)}
if RIG:
    CHARTS.update({'lidU.L': (1280, 0, 384, 192), 'lidU.R': (1664, 0, 384, 192), 'lidD.L': (1280, 192, 384, 128), 'lidD.R': (1664, 192, 384, 128),
                   'cavity': (1280, 320, 128, 128), 'tongue': (1408, 320, 128, 128)})   # the free block x 1280-2048, y 0-1152; one lid chart per eye (rig)
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
# Skull: from the front a bun-shaped dome (exponent NU: 1.6 over the cheeks, the head narrowing almost linearly above them as
# on the sheet, rounding to 2.2 at the crown) over a full, round jaw (exponent NL), widest at the cheek line z = ZC (the sheet:
# widest 0.24-0.27 W above the chin; 0.69 / 0.82 / 0.94 / 0.99 W wide at 0.04 / 0.08 / 0.14 / 0.20 W; 0.98 / 0.95 / 0.90 / 0.85
# at 0.30 / 0.35 / 0.40 / 0.45 W); in depth a superellipse (the sheet's side view: depth 0.76 W). Crown 0.76 W above the chin.
SK = dict(a=.500, zc=.250, cu=.507, cl=.262, nu=1.62, nut=2.30, nl=2.45, bf=.385, bb=.372, pd=2.00, face=.030, pdf=2.12)
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

_ym = float(front_local(0, .170, skull)[0])
# the soft bunny muzzle: the sheet's side view has the lower face 0.40-0.43 W ahead of the head centre at 0.10-0.15 W (the
# eye-level face 0.38 W), so the muzzle is a gentle, low bulge round the mouth
MUZ = [[0, _ym + .090 - .048, .165], [.165, .090, .095]]; K_MUZ = .050
JAW = [[0, -.120, .125], [.285, .215, .135]]; K_JAW = .06                  # the full lower face and chin (side view)
def base_local(q):
    d = smin(skull(q), ell(q, *JAW), K_JAW)
    return smin(d, ell(q, *MUZ), K_MUZ)
# eye layout (W units, sheet close-up): opening centres +-0.237 W, 0.338 W above the chin; opening 0.194 W x 0.195 W
EXW, EZW, EHWW, EHHW, EN = .237, .338, .097, .0975, 2.10
NZW = .246                                                  # nose centre 0.246 W above the chin (sheet 0.221-0.271)
NECK = [[0, -.005, -.250], [.150, .140, .270]]; K_NECK = .07
def warped(q): return q                                     # convex face: no eye sockets (Rosie round 8)
_yf = float(front_local(0, NZW, base_local)[0])
NOSE = [[0, _yf + .030 - .040, NZW], [.046, .030, .027]]; K_N = .010       # a small button, 0.091 W wide, tip 0.45 W ahead
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
NZ = CHIN + NZW * W; MZW = .192; MZ = CHIN + MZW * W; MHW = .083 * W     # the small 'w' mouth at 0.164-0.218 W, 0.167 W wide
BLUSH = (.353 * W, CHIN + .180 * W, .072 * W, .055 * W)

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
for k, (rx, rz, n) in enumerate([(.018, .010, 10), (.030, .017, 14), (.043, .025, 18), (.056, .032, 22)]):
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
keep &= ~(front & ((Pf[:, 0] / (.064 * W)) ** 2 + ((Pf[:, 2] - NZ) / (.038 * W)) ** 2 < 1))
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
REFINE_ADD = int(os.environ.get('REFINE_ADD', '200')); D_LOW, D_T = .12, float(os.environ.get('REFINE_DT', '.45'))
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
NSEG = 28
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


# ============================================================== LASH RIBBONS: the upper lash line and its wing (own objects)
# A flattened tapered tube lying on the skin along the opening's upper rim (its lower edge tucked just over the lens rim),
# thin at the nasal corner, thickest over the top-outer part (0.23 eye radii = 0.022 W, the sheet), carried past the outer
# corner into the sheet's single wing (tip at 1.30, 0.52 eye radii); <= 0.0075 W proud. Separate objects, origin at the eye
# centre, so the rig can hang them on the upper lids (no painted lash is left on the skin: only a faint contact shade).
def lash_th(psi):
    """the upper lash line's full width (eye radii) along the rim angle psi (0 = the outer side, pi/2 = the top)"""
    return (.060 + .190 * np.sin(np.clip(psi, 0, PI)) ** .6 + .090 * np.exp(-((psi - .75) / .45) ** 2)) * smooth(PI + .10, PI - .45, psi)
def lash_centre():
    psi = np.linspace(2.86, .36, 26); th = np.maximum(lash_th(psi), .045)
    ux, uz = eye_unit(psi); rr = 1 + th / 2 - .045
    A = np.stack([ux * rr, uz * rr], -1)
    tipP = np.array([1.30, .52]); w0 = A[-1]
    wing = np.array([w0 + (tipP - w0) * t_ + np.array([0, .03 * math.sin(PI * t_)]) for t_ in np.linspace(0, 1, 7)[1:]])
    hwing = th[-1] / 2 * (1 - np.linspace(0, 1, 7)[1:] ** 1.4 * .72)
    return np.vstack([A, wing]), np.concatenate([th / 2, hwing])
LASH_C2, LASH_HW = lash_centre()
def eye_pt(s, X, Z):
    """eye units (X > 0 outer) -> skin point, its normal"""
    x = s * EX + s * EHW * np.asarray(X, float); z = EZ + EHH * np.asarray(Z, float)
    y = front_hit(x, z); S_ = np.stack([x, y, z], -1); return S_, grad_n(S_)
lash_info = {}; NLS = 8
for s, tag in ((-1, 'R'), (1, 'L')):
    C2 = LASH_C2; NLT = len(C2) - 1; tt = np.linspace(0, 1, NLT + 1)
    S_, n_ = eye_pt(s, C2[:, 0], C2[:, 1])
    tg = np.gradient(S_, axis=0); tg = unit(tg - n_ * (tg * n_).sum(1, keepdims=True)); sd = unit(np.cross(n_, tg))
    hw = LASH_HW * EHH
    hp = (.0075 * W) * (.55 + .45 * smooth(0, .25, tt)) * (1 - .60 * smooth(.80, 1.0, tt))
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
    make_obj('lash.' + tag, V, F, ramp_uv('lash', sval(NV, 0., hi=.30, lo=.10)), 'lash.' + tag, N=NV)
    lash_info[tag] = dict(tip=[round(float(v), 4) for v in S_[-1]], root=[round(float(v), 4) for v in S_[0]], max_proud_W=round(float(hp.max() / W), 4))
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
# ============================================================== EARS: tall thick bunny ears with a recessed pink panel
# Each ear is a ring stack along its axis U (bend loops), a chunky superellipse cross-section (across A, depth Nf) that
# rounds off into a blunt tip; the front (Nf, turned 30 deg outward) carries a recessed rounded panel painted pink.
# Head-local W units; built for the left ear (+X) and mirrored. The base is buried in the skull, under the hat.
# the sheet (measure.md): each ear 0.34 W wide from the front, 0.33 W from the side (a thick ear turned 32 deg outward),
# centres +-0.223 W at the band rising to +-0.255 W at the top (6.6 deg splay), 0.06 W behind the head centre, upright; tips
# 1.145 W above the chin (1.30 m); the pink panel 0.18 W wide (0.075 W rim), its top 0.14 W below the tip
# round 2 (director): turned only 12 deg outward, 0.17 W deep at the base tapering to 0.09 W near the tip, leaning 6 deg back,
# so both 45 deg cameras see a broad, thick oval paddle (no hook, no stick)
EAR = dict(base=(.200, .060, .500), dir=(.165, .105, 1.0), L=.650, hw=.168, ht=.085, tm=.56, tmT=.80, face_out=12., P=2.3,
           NS=28, depth=.026, rim=.075, tipm=.140, g0=.80)
def ear_frame():
    e = EAR; U = unit(np.array(e['dir'], float)); fo = math.radians(e['face_out'])
    Nf = np.array([math.sin(fo), -math.cos(fo), 0.]); Nf = unit(Nf - U * (U @ Nf)); A = unit(np.cross(U, Nf))
    return np.array(e['base'], float), U, Nf, A
def ear_prof(t):
    e = EAR; t = np.asarray(t, float)
    g = np.where(t < e['tm'], e['g0'] + (1 - e['g0']) * smooth(0, e['tm'], t), np.sqrt(clamp(1 - ((t - e['tm']) / (1 - e['tm'])) ** 2)))
    gT = np.where(t < e['tmT'], 1., np.sqrt(clamp(1 - ((t - e['tmT']) / (1 - e['tmT'])) ** 2)))
    return e['hw'] * g, e['ht'] * (1 - .47 * np.clip(t / .90, 0, 1)) * gT
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
def ear_pan(na, t):
    """signed distance (W) inside the pink panel: the side rim and a deeper margin under the tip, rounded together"""
    e = EAR; t = np.asarray(t, float)
    return smin(ear_dist(na, t) - e['rim'], (1 - t) * e['L'] - e['tipm'], .035)
def build_ear():
    e = EAR; B, U, Nf, A = ear_frame(); P = e['P']; NS = e['NS']
    ts = np.concatenate([np.linspace(0, .80, 23)[:-1], .80 + .20 * np.sin(np.linspace(0, PI / 2, 11))[:-1]])
    th = np.linspace(0, 2 * PI, NS, endpoint=False)
    na = spow(np.sin(th), 2 / P); nb = spow(-np.cos(th), 2 / P)          # th = 0: the back (-Nf); th = pi: the front centre
    rings = []
    for t in ts:
        hw, ht = ear_prof(t)
        rec = e['depth'] * smoother(-.014, .030, ear_pan(na, np.full(len(na), t))) * (nb > 0)
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

print('STEP bandana', flush=True)
# ============================================================== THE GREEN BANDANA: band, kerchief, knot and two thick ends
# A cushioned band laid on the skull: for azimuth phi (0 = the front, 90 deg = the character's left) and across-fraction sv
# (0 = the lower edge), a horizontal ray from the head axis finds the skull; the band's mid-surface sits half its thickness
# off it (the inner face 4 mm inside the skull), thickened with rounded rims. The sheet (measure.md, W above the chin): the
# front band 0.605-0.713, at the sides 0.51-0.66, and behind the ears it widens into the kerchief over the back of the head,
# 0.41-0.70 at the back. The knot sits at the back centre (0.41 W), the two leaf ends hang down and out from it.
BAND = dict(nphi=56, ns=6, t_mid=.036, t_edge=.022, sink=.0065)
_LK = np.radians([0, 45, 90, 135, 180]); _LV = [.605, .574, .512, .446, .410]
_UK = np.radians([0, 50, 90, 115, 145, 180]); _UV = [.713, .692, .662, .660, .692, .702]
def cos_fit(K, Vv, n=4):
    """a smooth, periodic, mirror-symmetric edge height: sum a_k cos(k phi), least squares through the knots"""
    A = np.cos(np.outer(K, np.arange(n))); c = np.linalg.lstsq(A, np.asarray(Vv, float), rcond=None)[0]
    return lambda ph: np.cos(np.multiply.outer(np.asarray(ph, float), np.arange(n))) @ c
band_lo = cos_fit(_LK, _LV); band_hi = cos_fit(_UK, _UV)
def head_nn(q): return head_local(q, neck=False)
def band_pts(phi, sv):
    """skull points (head-local W units) under the band at azimuth phi and across-fraction sv"""
    phi = np.asarray(phi, float); sv = np.asarray(sv, float) * np.ones_like(phi)
    ap = np.abs(np.arctan2(np.sin(phi), np.cos(phi)))
    z = band_lo(ap) + (band_hi(ap) - band_lo(ap)) * sv
    D = np.stack([np.sin(phi), -np.cos(phi), 0 * phi], -1); C0 = np.stack([0 * phi, 0 * phi, z], -1)
    name_hint[0] = 'bandana'
    P = ray_outer(head_nn, C0, D, .8); return P, grad(head_nn, P)
_phi = np.linspace(-PI, PI, BAND['nphi'], endpoint=False); _sv = np.linspace(0, 1, BAND['ns'])
_PP, _SS = np.meshgrid(_phi, _sv)                                     # rows = across the band, columns = round the head
_Pb, _Nb = band_pts(_PP.ravel(), _SS.ravel())
_tb = BAND['t_edge'] + (BAND['t_mid'] - BAND['t_edge']) * np.sin(PI * _SS.ravel()) ** .8
_Vb = _Pb + _Nb * (_tb / 2 - BAND['sink'])[:, None]
_Fb = grid_faces(BAND['ns'], BAND['nphi'], True)
_Vt, _Ft, _, _Nt = thicken(_Vb, _Fb, _Nb, _tb, [0, 0], [0, 0], [0, 0], rim=3)
make_obj('bandana_band', L2M(_Vt), _Ft, ramp_uv('band', sval(_Nt, hi=.24)), 'band', N=_Nt)
# the knot: a soft round lobe at the back centre, a little below the band's lower edge
_kz = .405; _kb = ray_outer(head_nn, np.array([[0, 0, _kz]]), np.array([[0, 1., 0]]), .8)[0]
KNOT_L = np.array([0, _kb[1] + .040, _kz])
lobe('bandana_knot', L2M(KNOT_L), np.array([.062, .078, .068]) * W, [0, 1., 0], 'band', ramp='band', n=5, occ_in=.12, squash=.18, pole=[0, 0, 1.])
BAND_ANCHOR = L2M(KNOT_L)
# the two ends: thick leaf cushions from the knot, down and out (the back view: tips at about +-0.17 W, 0.20 W above the
# chin) and a little back (the side view); they lie flat over the back of the head, never inside it
BAND_TAIL = {}
for s_, tag in ((1, 'L'), (-1, 'R')):
    d_ = unit(np.array([s_ * .55, .25, -.80])); Lt = .290; R_ = 15
    u_ = np.linspace(0, 1, R_)
    path = KNOT_L[None] + d_[None] * (Lt * u_)[:, None] + np.array([0, 1., 0])[None] * (.030 * np.sin(PI * u_))[:, None]
    ry_ = .030 - .010 * u_
    for _ in range(4):
        dd = head_nn(path); g_ = grad(head_nn, path); need = ry_ + .010
        path = path + g_ * np.maximum(need - dd, 0)[:, None]
        path[1:-1] = .5 * path[1:-1] + .25 * (path[:-2] + path[2:])
    # the leaf's flat face turns half-way between the back and the side, so it reads as a leaf from the back, the side and
    # both 45 deg game yaws (never edge-on as a strand)
    fn = unit(np.array([s_ * .62, .78, 0.])); T_ = unit(np.gradient(path, axis=0)); wdir = unit(np.cross(fn[None] - T_ * (T_ @ fn)[:, None], T_))
    hw_ = .030 + .050 * np.sin(PI * np.clip(u_, 0, 1) ** .85) ** .9
    sweep('bandana_tail.' + tag, L2M(path), lambda k, hw_=hw_, ry_=ry_: (hw_[k] * W, ry_[k] * W), 'band_tail.' + tag,
          lambda NV, tt, uu, V: ramp_uv('band', sval(NV, hi=.24)), sides=14, normals=wdir, p=.80)
    BAND_TAIL[tag] = {'root': L2M(path[0]).tolist(), 'mid': L2M(path[R_ // 2]).tolist(), 'tip': L2M(path[-1]).tolist()}

if HEAD_ONLY:
    BODY_PAINTERS = {}; BODY_PIVOTS = {}; JOINTS_BODY = {}
else:
    # ============================================================== BODY AND COSTUME (metres; body axis x = 0, y = 0)
    # the sheet (measure.md, metres): shirt sleeves z 0.42-0.60 out to +-0.29; apron bib z 0.40-0.58 (+-0.12-0.135), the
    # skirt z 0.18-0.40 (+-0.20-0.225) with the pocket 0.27 x 0.17 at z 0.21-0.38; bloomer trousers +-0.265 wide, 0.38 deep,
    # z 0.087-0.40; feet 0.24 wide, 0.33 long, 0.10 high; the bag on the right hip z 0.18-0.40; tail 0.14 across at z 0.30
    RCY = .000
    def ramp_fn(name, hi=.28, occ=0., add=0.):
        return lambda NN, V, *a: ramp_uv(name, sval(NN, occ=occ, hi=hi) + add)
    def ramp_sw(name, hi=.28, occ=0., add=0.):
        return lambda NV, tt, uu, V: ramp_uv(name, sval(NV, occ=occ, hi=hi) + add)
    BODY_OBS = {}

    print('BODY_STEP shirt torso', flush=True)
    # ---------------------------------------------------------------- the shirt torso: one lathed superellipse (z 0.30-0.65)
    TZ = np.array([.300, .350, .400, .450, .500, .540, .575, .605, .630, .650])
    TAX = np.array([.212, .218, .220, .216, .205, .190, .170, .146, .118, .088])
    TAY = np.array([.160, .164, .164, .160, .152, .142, .128, .112, .092, .070])
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
    NA_T = 30; zt_ = np.linspace(TZ[0], TZ[-1], 9); at_ = np.linspace(0, 2 * PI, NA_T, endpoint=False)
    AA, ZZ = np.meshgrid(at_, zt_)
    Pt_ = torso_raw(AA, ZZ); Nt_ = torso_n(AA, ZZ)
    BODY_OBS['shirt'] = make_obj('shirt_torso', Pt_.reshape(-1, 3), grid_faces(len(zt_), NA_T, True), ramp_uv('shirt', sval(Nt_.reshape(-1, 3), hi=.26)), 'body', N=Nt_.reshape(-1, 3))
    def surf_y(f, x, z, front=True, y0=0., y1=.45):
        """y of the surface of field f at (x, z) along -y (front) or +y (back), by bisection"""
        sgn = -1. if front else 1.; x = np.atleast_1d(np.asarray(x, float)); z = np.atleast_1d(np.asarray(z, float))
        lo = np.full(len(x), y0); hi = np.full(len(x), y1)
        for _ in range(40):
            m = (lo + hi) / 2; ins = f(np.stack([x, sgn * m, z], -1)) < 0
            lo = np.where(ins, m, lo); hi = np.where(ins, hi, m)
        return sgn * (lo + hi) / 2

    print('BODY_STEP trousers', flush=True)
    # ---------------------------------------------------------------- round bloomer trousers (one SDF star mesh)
    PZ0, PZ1 = .087, .425
    def pants_sdf(p):
        d = ell(p, [0, .010, .255], [.258, .192, .176])
        # the waist: a near-vertical wall just outside the shirt, rolling over into it (hidden under the apron's waist tie)
        e_ = np.sqrt((p[:, 0] / .228) ** 2 + ((p[:, 1] - .004) / .171) ** 2); dr_ = (e_ - 1) * .20; dz_ = np.abs(p[:, 2] - .360) - .062; re_ = .018
        d = smin(d, np.sqrt(np.maximum(dr_ + re_, 0) ** 2 + np.maximum(dz_ + re_, 0) ** 2) + np.minimum(np.maximum(dr_ + re_, dz_ + re_), 0) - re_, .05)
        for s in (-1, 1):
            d = smin(d, sd_capsule(p, np.array([s * .128, -.006, .125]), np.array([s * .130, .000, .215]), .112), .05)
        d = smax(d, -(p[:, 2] - PZ0), .016)                                     # the hems, softly rounded
        d = smax(d, -sd_capsule(p, np.array([0, -.40, .092]), np.array([0, .40, .092]), .044), .028)      # the leg split
        return d
    PANTS_TH = np.concatenate([np.linspace(.12, .70, 4), np.linspace(.70, 1.10, 7)[1:], np.linspace(1.10, 1.95, 8)[1:], np.linspace(1.95, 2.50, 11)[1:], np.linspace(2.50, PI - .12, 5)[1:]])
    BODY_OBS['pants'] = star_mesh('bloomer_trousers', pants_sdf, np.array([0, .006, .240]), 'body', lambda NN, V: ramp_uv('trou', sval(NN, hi=.32)), nph=32, tmax=.45, thetas=PANTS_TH)
    def outer_sdf(p): return np.minimum(pants_sdf(p), np.where(p[:, 2] > .30, torso_f(p) * .12, 1.))

    print('BODY_STEP apron', flush=True)
    # ---------------------------------------------------------------- the apron: bib, skirt (hanging straight below the belly), pocket
    def plate(name, P, nu, nv, ramp, thick, group='body', hi=.28, add=0.):
        F = grid_faces(nv, nu); Nv = vnormals(P, F)
        if Nv[:, 1].mean() > 0: Nv = -Nv
        Vt, Ft, UVt, Nt = thicken(P, F, Nv, thick, ramp_uv(ramp, .5), ramp_uv(ramp, .3), ramp_uv(ramp, .45), rim=4)
        return make_obj(name, Vt, Ft, ramp_uv(ramp, sval(Nt, hi=hi) + add), group, N=Nt)
    # bib: laid on the shirt front
    NU_B, NV_B = 11, 9; BIB_Z0, BIB_Z1 = .395, .578; T_AP = .016
    Pb = []
    for v in np.linspace(0, 1, NV_B):
        z = BIB_Z0 + (BIB_Z1 - BIB_Z0) * v; hw = .136 + (.118 - .136) * v
        for u in np.linspace(-1, 1, NU_B): Pb.append([u * hw, 0., z])
    Pb = np.array(Pb); Pb[:, 1] = surf_y(torso_f, Pb[:, 0], Pb[:, 2]) - .006 - T_AP / 2
    BODY_OBS['bib'] = plate('apron_bib', Pb, NU_B, NV_B, 'apron', T_AP)
    # skirt: on the trousers; below the belly's widest row it hangs straight down (the side view's apron stands off at the hem)
    NU_S, NV_S = 15, 12; SK_Z0, SK_Z1 = .175, .405
    zz_s = np.linspace(SK_Z0, SK_Z1, NV_S); Ps = np.zeros((NV_S, NU_S, 3))
    for i, u in enumerate(np.linspace(-1, 1, NU_S)):
        for j, z in enumerate(zz_s):
            hw = .226 + (.204 - .226) * (z - SK_Z0) / (SK_Z1 - SK_Z0); Ps[j, i, 0] = u * hw; Ps[j, i, 2] = z
        zf = np.linspace(SK_Z0, SK_Z1 + .02, 60)
        yf = surf_y(outer_sdf, np.full(60, Ps[:, i, 0].mean()), zf)
        ys = np.array([yf[zf >= z].min() for z in zz_s])
        Ps[:, i, 1] = ys - .007 - T_AP / 2
    for _ in range(3): Ps[1:-1, :, 1] = .5 * Ps[1:-1, :, 1] + .25 * (Ps[:-2, :, 1] + Ps[2:, :, 1])
    for j in range(NV_S):                                               # each row follows the surface across, at that row's x
        Ps[j, :, 1] = np.minimum(Ps[j, :, 1], surf_y(outer_sdf, Ps[j, :, 0], np.full(NU_S, zz_s[j])) - .007 - T_AP / 2)
    BODY_OBS['skirt'] = plate('apron_skirt', Ps.reshape(-1, 3), NU_S, NV_S, 'apron', T_AP)
    # the pocket: a rounded plate on the skirt (0.264 x 0.164 m, corner radii 0.03 top / 0.055 bottom), with its mouth line
    PKZ = .298; PKX = .012
    _gx, _gz = np.meshgrid(np.linspace(-.15, .17, 11), np.linspace(PKZ - .10, PKZ + .10, 11)); _gx = _gx.ravel(); _gz = _gz.ravel()
    from mathutils.bvhtree import BVHTree as _BVH
    def bvh_of(obs):
        V = []; Pp = []
        for ob in obs:
            o = len(V); V += [tuple(v.co) for v in ob.data.vertices]; Pp += [tuple(o + i for i in p.vertices) for p in ob.data.polygons]
        return _BVH.FromPolygons(V, Pp)
    _bv = bvh_of([BODY_OBS['skirt']])
    def skirt_y(x, z):
        out = []
        for xx, zz in zip(np.ravel(x), np.ravel(z)):
            hit = _bv.ray_cast(Vector((float(xx), -1.0, float(zz))), Vector((0, 1., 0)))
            out.append(hit[0].y if hit[0] is not None else np.nan)
        return np.array(out)
    _gy = skirt_y(_gx, _gz); ok_ = np.isfinite(_gy)
    _A = lambda x, z: np.stack([np.ones_like(x), x, x * x, z - PKZ, (z - PKZ) ** 2, x * (z - PKZ), x * x * (z - PKZ)], -1)
    _cf = np.linalg.lstsq(_A(_gx[ok_], _gz[ok_]), _gy[ok_], rcond=None)[0]
    def apr_y(x, z): return _A(np.asarray(x, float), np.asarray(z, float)) @ _cf
    LOG['pocket_fit_rms_mm'] = round(float(np.sqrt(((apr_y(_gx[ok_], _gz[ok_]) - _gy[ok_]) ** 2).mean())) * 1000, 2)
    T_PK = .020; R_PK = T_PK / 2
    def pk_outline(n=56):
        hx, hz = .132 - R_PK, .082 - R_PK; P2 = []
        for k in range(n):
            a_ = 2 * PI * k / n; d_ = np.array([math.cos(a_), math.sin(a_)]); rc_ = (.030 if d_[1] > 0 else .055) - R_PK
            lo, hi = 0., .3
            for _ in range(40):
                m = (lo + hi) / 2; q_ = np.abs(d_ * m) - np.array([hx - rc_, hz - rc_])
                inside = np.linalg.norm(np.maximum(q_, 0)) + min(max(q_[0], q_[1]), 0) - rc_ < 0
                lo, hi = (m, hi) if inside else (lo, m)
            P2.append(d_ * lo)
        return np.array(P2)
    _O = pk_outline(720); _D = np.diff(np.vstack([_O, _O[:1]]), axis=0); _sl = np.linalg.norm(_D, axis=1)
    _ta = np.arctan2(_D[:, 1], _D[:, 0]); _dt = np.abs(np.angle(np.exp(1j * (np.roll(_ta, -1) - _ta))))
    _L = np.concatenate([[0], np.cumsum(_sl / _sl.sum() + .55 * _dt / _dt.sum())])
    _t = np.linspace(0, _L[-1], 40, endpoint=False)
    O2 = np.stack([np.interp(_t, _L, np.append(_O[:, 0], _O[0, 0])), np.interp(_t, _L, np.append(_O[:, 1], _O[0, 1]))], -1); NR = 3; NP = len(O2)
    G2 = np.array([np.zeros(2)] + [O2[k] * (j / NR) ** .8 for j in range(1, NR + 1) for k in range(NP)])
    Fp = [(0, 1 + k, 1 + (k + 1) % NP) for k in range(NP)]
    for j in range(NR - 1):
        for k in range(NP):
            a0 = 1 + j * NP + k; b0 = 1 + j * NP + (k + 1) % NP; Fp.append((a0, a0 + NP, b0 + NP, b0))
    Vp = np.stack([PKX + G2[:, 0], apr_y(PKX + G2[:, 0], PKZ + G2[:, 1]) - T_PK / 2 + .002, PKZ + G2[:, 1]], -1)
    Np = vnormals(Vp, Fp)
    if Np[:, 1].mean() > 0: Np = -Np
    Vt, Ft, UVt, Nt = thicken(Vp, Fp, Np, T_PK, ramp_uv('apron', .5), ramp_uv('apron', .3), ramp_uv('apron', .45), rim=4)
    BODY_OBS['pocket'] = make_obj('apron_pocket', Vt, Ft, ramp_uv('apron', sval(Nt, hi=.30) + .03), 'body', N=Nt)
    _pm_y = float(apr_y(PKX, PKZ + .060)) - T_PK + .002 - .0004
    lobe('apron_pocket_mouth', np.array([PKX, _pm_y, PKZ + .060]), np.array([.0026, .112, .0042]), [0, -1., 0], 'body', ramp='hole', n=3, occ_in=0, pole=[0, 0, 1.])

    print('BODY_STEP waist tie + straps', flush=True)
    # ---------------------------------------------------------------- the apron's waist tie (a soft band all round, z 0.378-0.423)
    WZ = .401; _wa = np.linspace(0, 2 * PI, 48, endpoint=False)
    _wd = np.stack([np.sin(_wa), -np.cos(_wa), 0 * _wa], -1)
    name_hint[0] = 'waist'; _wp = ray_outer(outer_sdf, np.array([0, .004, WZ]), _wd, .40)
    _wn = grad(outer_sdf, _wp); _wn[:, 2] = 0; _wn = unit(_wn)
    # it rides over the bib's and skirt's top edges at the front
    _wpath = _wp + _wn * (.010 + (T_AP + .004) * smooth(.0, .3, -_wd[:, 1]))[:, None]
    _wprof = lambda k: np.stack([.0090 * spow(np.cos(np.linspace(0, 2 * PI, 8, endpoint=False)), .55), .0225 * spow(np.sin(np.linspace(0, 2 * PI, 8, endpoint=False)), .55)], -1)
    BODY_OBS['waist'] = ring_tube('apron_waist_tie', _wpath, _wprof, 'body', ramp_sw('apron', hi=.26), _wn, sides=8)
    _wb = float(_wpath[np.argmin(np.abs(_wa - PI))][1])
    def bow_sdf(p): return sd_box(p, np.array([0, _wb + .012, WZ]), np.eye(3), np.array([.052, .016, .034]), .014)
    star_mesh('apron_tie_knot', bow_sdf, np.array([0, _wb + .012, WZ]), 'body', lambda NN, V: ramp_uv('apron', sval(NN, hi=.30)), nth=12, nph=20, tmax=.12, axis=(0, 1., 0), ref=(1., 0, 0),
              thetas=np.concatenate([np.linspace(.14, 1.25, 3), np.linspace(1.25, 1.89, 6)[1:], np.linspace(1.89, PI - .14, 3)[1:]]))
    # the apron's neck straps: from the bib's top corners up over the shoulders and straight down the back to the waist tie
    STRAPS = {}
    for s in (-1, 1):
        o = np.array([s * .132, 0, .450]); path = []; norms = []
        for ph in np.linspace(math.radians(42), math.radians(192), 21):
            d = np.array([0, -math.cos(ph), math.sin(ph)])
            lo, hi = 0., .35
            for _ in range(40):
                m = (lo + hi) / 2; ins = torso_f((o + d * m)[None])[0] < 0
                lo, hi = (m, hi) if ins else (lo, m)
            q = o + d * lo; g = grad(torso_f, q[None], 1e-4)[0]
            path.append(q + g * .016); norms.append(g)
        path = np.array(path); norms = np.array(norms)
        STRAPS[s] = sweep('apron_strap.%d' % (s > 0), path, lambda k: (.0075, .0185), 'body', ramp_sw('apron', hi=.26), sides=8, normals=norms, p=.55)

    print('BODY_STEP arms', flush=True)
    # ---------------------------------------------------------------- arms: puffy short sleeves, cream arms, mitten paws (38 deg)
    ARM = {}; ARM_DEG = 38.
    for s, tag in ((1, 'L'), (-1, 'R')):
        th = math.radians(ARM_DEG); ad = unit(np.array([s * math.sin(th), -.05, -math.cos(th)]))
        SH = np.array([s * .178, -.004, .538])
        fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
        def along(t0, SH=SH, ad=ad): return SH + ad * t0
        TS0, TS1 = -.055, .104
        path = np.array([along(t0) for t0 in np.linspace(TS0, TS1, 10)])
        sweep('puff_sleeve.' + tag, path, lambda k: ((.072 + .024 * math.sin(PI * min(1, (k / 9) * 1.12)) ** .8) * (1 - .05 * (k / 9) ** 4),) * 2,
              'arm.' + tag, ramp_sw('shirt', hi=.26), sides=24, cap0=False, cap1=False, normals=np.tile(fwd, (len(path), 1)))
        abr = np.linspace(0, 2 * PI, 24, endpoint=False); e1 = fwd; e2 = np.cross(ad, fwd)
        HC_ = along(TS1 - .003); rh = .072 * .95
        Phr = HC_ + np.outer(np.cos(abr), e1) * rh + np.outer(np.sin(abr), e2) * rh
        Nhr = unit(np.outer(np.cos(abr), e1) + np.outer(np.sin(abr), e2))
        ring_tube('puff_sleeve_hem.' + tag, Phr, lambda k: np.stack([.0115 * np.cos(np.linspace(0, 2 * PI, 6, endpoint=False)), .0125 * np.sin(np.linspace(0, 2 * PI, 6, endpoint=False))], -1),
                  'arm.' + tag, ramp_sw('shirt', hi=.24, add=-.03), Nhr, sides=6)
        WR = along(.205); PC = along(.272); lat = np.cross(ad, fwd) * s
        paw_axes = np.array([ad, fwd, lat])
        thumb = PC + fwd * .046 + lat * .020 - ad * .014
        def arm_parts(p, WR=WR, PC=PC, paw_axes=paw_axes, thumb=thumb, SH=SH, ad=ad):
            d_fa = sd_capsule(p, SH + ad * .050, WR, (.057, .060))
            d_paw = sd_ell(p, PC, paw_axes, (.080, .074, .068))
            d_t = sd_ell(p, thumb, paw_axes, (.032, .027, .027))
            return d_fa, d_paw, d_t
        def arm_sdf(p, arm_parts=arm_parts):
            d_fa, d_paw, d_t = arm_parts(p)
            return smin(smin(d_fa, d_paw, .034), d_t, .013)
        def arm_uv(NN, V, arm_parts=arm_parts):
            d_fa, d_paw, d_t = arm_parts(V)
            cr = crease(np.minimum(d_paw, d_fa), d_t, .013) * .35
            return ramp_uv('fur', sval(NN, occ=cr, hi=.34))
        tt_ = np.linspace(0, .18, 361); inside = arm_sdf(PC[None] + ad[None] * tt_[:, None]) < 0
        reach = float(tt_[np.argmin(inside)]) if not inside.all() else .18
        tips = PC + ad * (reach - .006); st = SH + ad * .055
        ts = np.concatenate([np.linspace(0, .40, 6)[:-1], np.linspace(.40, 1.0, 15)])
        cen = st[None] + (tips - st)[None] * ts[:, None]
        ring_stack('fur_mitten_arm.' + tag, arm_sdf, cen, np.tile(ad, (len(ts), 1)), 'arm.' + tag, arm_uv, sides=18, tmax=.18, ref=fwd)
        ARM[tag] = {'shoulder': SH.tolist(), 'elbow': along(.125).tolist(), 'wrist': WR.tolist(), 'palm': (PC + lat * .010).tolist()}

    print('BODY_STEP bag', flush=True)
    # ---------------------------------------------------------------- the tan shoulder bag on the right hip, its flap and button
    BAG_YAW = math.radians(70); BAG_H = np.array([.044, .108, .104]); BAG_R = .036
    nb_ = np.array([-math.cos(BAG_YAW), -math.sin(BAG_YAW), 0.]); a2_ = np.array([math.sin(BAG_YAW), -math.cos(BAG_YAW), 0.]); a3_ = np.array([0, 0, 1.])
    BAG_AX = np.array([nb_, a2_, a3_])
    BAG_C = np.array([-.238, -.040, .290])      # round 2: 5 cm further in, slid forward until it clears the hip
    _uu, _vv = np.meshgrid(np.linspace(-.85, .85, 9), np.linspace(-.85, .85, 9))
    _inner = lambda c: c[None] - nb_[None] * BAG_H[0] + a2_[None] * (_uu.ravel() * BAG_H[1])[:, None] + a3_[None] * (_vv.ravel() * BAG_H[2])[:, None]
    for _ in range(80):                                                   # slide it out along its face normal until it clears the hip
        if (outer_sdf(_inner(BAG_C)) - .020).min() > .003: break
        BAG_C = BAG_C + np.array([0, -.003, 0])
    def bag_sdf(p):
        d = sd_box(p, BAG_C, BAG_AX, BAG_H, BAG_R)
        q = (p - BAG_C) @ BAG_AX.T
        return d - .006 * clamp(1 - (q[:, 1] / BAG_H[1]) ** 2) * clamp(1 - (q[:, 2] / BAG_H[2]) ** 2) * (q[:, 0] > 0)     # a soft pillow bulge outside
    BAG_TH = np.concatenate([np.linspace(.14, .62, 3), np.linspace(.62, 1.0, 4)[1:], np.linspace(1.0, 2.14, 7)[1:], np.linspace(2.14, 2.52, 4)[1:], np.linspace(2.52, PI - .14, 3)[1:]])
    BODY_OBS['bag'] = star_mesh('shoulder_bag', bag_sdf, BAG_C, 'bag', lambda NN, V: ramp_uv('bag', sval(NN, hi=.30)), nph=28, tmax=.25, thetas=BAG_TH)
    # the flap: a thick rounded slab over the outer face's upper 58 %, a U-shaped lower edge
    FL_T = .016; FL_H = np.array([FL_T / 2, BAG_H[1] + .006, BAG_H[2] * .58])
    FL_C = BAG_C + nb_ * (BAG_H[0] + .003 + FL_T / 2) + a3_ * (BAG_H[2] - .010 - FL_H[2])
    def flap_sdf(p):
        d = sd_box(p, FL_C, BAG_AX, FL_H, FL_T / 2 - .0005)
        q = (p - FL_C) @ BAG_AX.T
        e_ = np.sqrt((q[:, 1] / (FL_H[1] * 1.04)) ** 2 + (np.minimum(q[:, 2] - FL_H[2] * .35, 0) / (FL_H[2] * 1.32)) ** 2) - 1
        return smax(d, e_ * FL_H[1] * .6, .008)
    FL_TH = np.concatenate([np.linspace(.12, 1.30, 5), np.linspace(1.30, 1.84, 7)[1:], np.linspace(1.84, PI - .12, 4)[1:]])
    star_mesh('bag_flap', flap_sdf, FL_C, 'bag', lambda NN, V: ramp_uv('bag', sval(NN, hi=.30) + .03), nth=12, nph=28, tmax=.20, axis=nb_, ref=a3_, thetas=FL_TH)
    BTN = FL_C + nb_ * (FL_T / 2 + .004) - a3_ * (FL_H[2] * .70)
    lobe('bag_button', BTN, np.array([.008, .016, .016]), nb_, 'bag', ramp='button', n=3, occ_in=0., squash=.2, pole=[0, 0, 1.])
    BAG_TOP_F = BAG_C + a2_ * (BAG_H[1] - .018) + a3_ * (BAG_H[2] - .004) - nb_ * .010
    BAG_TOP_B = BAG_C - a2_ * (BAG_H[1] - .018) + a3_ * (BAG_H[2] - .004) - nb_ * .010

    print('BODY_STEP bag strap', flush=True)
    # ---------------------------------------------------------------- the bag strap: a thick rounded band (4 cm x 1.5 cm) across the
    # body, from the bag's front top over the chest to the left shoulder and down the back to the bag's back top; it hugs the
    # clothes (nearest-surface projection on the costume meshes, smoothed)
    _bv2 = bvh_of([BODY_OBS[k] for k in ('shirt', 'pants', 'bib', 'skirt', 'pocket', 'waist')] + [STRAPS[1], STRAPS[-1]] +
                  [o for o in parts['arm.L'] if o.name.startswith('puff_sleeve')])
    # straight diagonals as the sheet draws them: front from the bag to the left shoulder, back from the shoulder to the bag
    SHF = np.array([.128, -.10, .615]); SHB = np.array([.134, .12, .612])
    CTRL = [BAG_TOP_F + a3_ * .02, BAG_TOP_F + np.array([0, -.014, .080])] + [BAG_TOP_F + (SHF - BAG_TOP_F) * t_ + np.array([0, -.08 * math.sin(PI * t_), 0]) for t_ in (.22, .45, .70)] +            [SHF, np.array([.140, .02, .655]), SHB] + [SHB + (BAG_TOP_B - SHB) * t_ + np.array([0, .08 * math.sin(PI * t_), 0]) for t_ in (.30, .55, .80)] + [BAG_TOP_B + a3_ * .02]
    SPATH = cpath(CTRL, 40); OFF = .0075 + .0035
    def hug(P, it=6):
        P = P.copy()
        for k in range(it):
            NN = np.zeros_like(P)
            for i in range(len(P)):
                loc, nrm, idx, dist = _bv2.find_nearest(Vector(P[i]))
                n_ = np.array(nrm); v_ = P[i] - np.array(loc)
                if v_ @ n_ < 0 and dist > .03: n_ = -n_
                P[i] = np.array(loc) + n_ * OFF; NN[i] = n_
            P[0] = SPATH[0]; P[-1] = SPATH[-1]
            P[1:-1] = .5 * P[1:-1] + .25 * (P[:-2] + P[2:])
        return P, NN
    SPATH2, SN = hug(SPATH)
    SPATH2, SN = hug(SPATH2, 2)
    _Tm = unit(np.gradient(SPATH2, axis=0)); SN = unit(SN - _Tm * (SN * _Tm).sum(1, keepdims=True))
    for _ in range(3): SN[1:-1] = unit(SN[1:-1] * .5 + .25 * (SN[:-2] + SN[2:]))
    SN[0] = SN[1]; SN[-1] = SN[-2]
    BODY_OBS['strap'] = sweep('bag_strap', SPATH2, lambda k: (.0075, .0200), 'body', ramp_sw('bag', hi=.26), sides=8, normals=SN, p=.55)
    BAG_PIVOT = (BAG_TOP_F + BAG_TOP_B) / 2

    print('BODY_STEP feet', flush=True)
    # ---------------------------------------------------------------- big rounded bunny feet with two toe lines each
    LEG = {}
    for s, tag in ((1, 'L'), (-1, 'R')):
        FC = np.array([s * .150, -.034, .058]); yaw = s * math.radians(7)
        FAX = rot([0, 0, 1], yaw).T
        toes = [FC + FAX[0] * (o * .041) for o in (-1, 1)]
        def foot_parts(p, FC=FC, FAX=FAX, s=s):
            d = sd_ell(p, FC, FAX, (.120, .165, .078))
            d = smin(d, sd_capsule(p, np.array([s * .140, .004, .070]), np.array([s * .134, .004, .160]), .088), .040)
            d = smax(d, -(p[:, 2] - .000), .018)
            return d
        foot_sdf = foot_parts
        def foot_uv(NN, V):
            return ramp_uv('fur', sval(NN, hi=.34, occ=.05 * smooth(.03, .0, V[:, 2])))
        star_mesh('bunny_foot.' + tag, foot_sdf, FC + np.array([0, .012, .018]), 'body', foot_uv, nth=15, nph=24, tmax=.34)
        for t_ in toes:
            tl = np.array([t_ - FAX[1] * (.168 - .052 * u_) + np.array([0, 0, .050 * math.sin(u_ * PI / 2) - .002]) for u_ in np.linspace(0, 1, 7)])
            for _ in range(6): tl = tl - foot_sdf(tl)[:, None] * grad(foot_sdf, tl, 1e-4)
            tn = grad(foot_sdf, tl, 1e-4)
            sweep('bunny_toe_line.%s.%d' % (tag, len(LEG)), tl + tn * .0009, lambda k: (.0018, .0058 * (1 - .45 * abs(k - 3) / 3)), 'body', ramp_sw('toe', hi=.20), sides=6, normals=tn, p=.6)
        LEG[tag] = {'hip': [s * .128, .004, .255], 'knee': [s * .132, -.004, .165], 'ankle': [s * .138, .000, .080],
                    'toe': (FC - FAX[1] * .168 + np.array([0, 0, -.022])).tolist()}

    print('BODY_STEP tail', flush=True)
    # ---------------------------------------------------------------- the round cotton tail (a soft lumpy ball)
    TLZ = .300; TLY = float(surf_y(pants_sdf, np.array([0.]), np.array([TLZ]), front=False)[0])
    TLC = np.array([0, TLY + .022, TLZ])
    def tail_sdf(p):
        q = p - TLC; r = np.linalg.norm(q, axis=1) + 1e-9
        u_ = q / r[:, None]
        bump = .0014 * (np.cos(5 * np.arctan2(u_[:, 2], u_[:, 0]) + .4) * (1 - u_[:, 1] ** 2) + .5 * np.cos(4 * np.arccos(np.clip(u_[:, 1], -1, 1))))
        return ell(p, TLC, [.074, .058, .071]) - bump * smooth(.0, .5, r / .07)
    star_mesh('cotton_tail', tail_sdf, TLC, 'tail', lambda NN, V: ramp_uv('tail', sval(NN, hi=.30)), nth=12, nph=22, tmax=.14)

    _vs = lambda pre: np.array([list(o.matrix_world @ v.co) for g, obs in parts.items() for o in obs if any(o.name.startswith(x) for x in pre) for v in o.data.vertices])
    def _ext(v): return {'min': [round(float(c), 3) for c in v.min(0)], 'max': [round(float(c), 3) for c in v.max(0)], 'size': [round(float(c), 3) for c in np.ptp(v, 0)]}
    BODY_MEAS = {'body_parts_m': {k: _ext(_vs(p)) for k, p in (('trousers', ['bloomer_trousers']), ('bib', ['apron_bib']), ('skirt', ['apron_skirt']), ('feet', ['bunny_foot']),
                 ('foot_L', ['bunny_foot.L']), ('tail', ['cotton_tail']), ('pocket', ['apron_pocket']), ('bag', ['shoulder_bag', 'bag_flap']), ('strap', ['bag_strap']),
                 ('sleeve_L', ['puff_sleeve.L', 'puff_sleeve_hem.L']), ('arm_L', ['fur_mitten_arm.L']), ('shirt', ['shirt_torso']), ('waist_tie', ['apron_waist_tie']),
                 ('ears', ['bunny_ear']), ('band', ['bandana_band']), ('band_tails', ['bandana_tail']))},
                 'arm_angle_from_vertical_deg': ARM_DEG, 'bag_centre_m': [round(float(c), 3) for c in BAG_C]}

    print('BODY_STEP joints', flush=True)
    JOINTS_BODY = {'hips': [0, .004, .255], 'spine': [0, .002, .360], 'chest': [0, .000, .470], 'neck': [0, .000, .580],
                   'arms': {t: {k: v for k, v in ARM[t].items() if k != 'palm'} for t in ARM}, 'legs': LEG,
                   'tail': [TLC.tolist()], 'palm_R': ARM['R']['palm'], 'palm_L': ARM['L']['palm']}
    BODY_PIVOTS = {'arm.L': tuple(ARM['L']['shoulder']), 'arm.R': tuple(ARM['R']['shoulder']), 'tail': tuple(TLC), 'body': (0, 0, 0),
                   'bag': tuple(BAG_PIVOT)}
    BODY_PAINTERS = {}
    def POST_JOIN():
        def sc(v): return [round(float(c), 5) for c in v]
        joints = {'units': 'metres (final, crown 1.05 m, ear tips 1.30 m)', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X'}
        joints.update({k: sc(JOINTS_BODY[k]) for k in ('hips', 'spine', 'chest', 'neck')})
        joints['head'] = sc(O)
        joints['head_nod_pivot_suggested'] = sc([0, HY + .10 * W, CHIN + .03 * W])
        joints['jaw_pivot'] = sc([0, float(HY - .22 * W), float(CHIN + .135 * W)])
        joints['eyes'] = {'R': sc(eye_centers['R']), 'L': sc(eye_centers['L'])}
        joints['eye_axes'] = {k: LOG['eye_axis_' + k] for k in ('R', 'L')}
        joints['lash'] = LOG['lash']
        joints['ears'] = {t: {k: sc(v) for k, v in ear_info[t].items()} for t in ('R', 'L')}
        joints['bandana_knot'] = sc(BAND_ANCHOR)
        joints['bandana_tails'] = {t: {k: sc(v) for k, v in BAND_TAIL[t].items()} for t in ('R', 'L')}
        joints['bag'] = {'pivot': sc(BAG_PIVOT), 'centre': sc(BAG_C)}
        joints['arms'] = {t: {k: sc(v) for k, v in JOINTS_BODY['arms'][t].items()} for t in ('L', 'R')}
        joints['legs'] = {t: {k: sc(v) for k, v in JOINTS_BODY['legs'][t].items()} for t in ('L', 'R')}
        joints['tail'] = [sc(v) for v in JOINTS_BODY['tail']]
        joints['palm_R'] = sc(JOINTS_BODY['palm_R']); joints['palm_L'] = sc(JOINTS_BODY['palm_L'])
        joints['notes'] = ['Phase 1: no rig, weights or animations. Same keys as the Usagi / Tanuki joints.json (final metres).',
                           'head = the head centre (the radial origin); head_nod_pivot_suggested = base of the skull, for the rig.',
                           'Head skin = zero surface of one convex implicit ball (bun skull + full jaw + soft muzzle + nose), analytic normals, toon-band refinement; no eye sockets.',
                           'Upper lash lines: separate ribbons (Chiku_lash_L / _R), origin at the eye centre, for the upper lids; lash tip / root in lash.',
                           'Eyelid holes ringed by 6 loops each with the rim rolled in behind separate lens eyeballs; 3 loops round the mouth, 4 round the nose.',
                           'Ears: separate pieces (Chiku_ear_L / _R), 27 rings along the axis (bend loops), pivot = ears.base (buried in the skull, under the bandana).',
                           'Bandana: Chiku_band (band + knot) rides the head bone, pivot = bandana_knot; the two ends are separate (Chiku_band_tail_L / _R), 15 rings each, pivot = their root.',
                           'Bag: Chiku_bag (bag, flap, button), pivot = bag.pivot (between the strap ends); the strap is part of Chiku_body (it follows the torso).',
                           'Tail: Chiku_tail, a small closed ball, pivot = tail[0].',
                           'The trousers are one closed piece with a split between the legs; the sleeves are open tubes; arms carry rings along the forearm and wrist.']
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
PAINT_OPTS = {'band': True, 'blush': True}
# the face layout (W units, front projection: x across, z above the chin), measured on the sheet's head close-up
BROW_P = np.array([[.181, .513], [.199, .535], [.228, .547], [.256, .540], [.277, .516]]); BROW_H = np.array([.0058, .0090, .0098, .0082, .0042])
MOUTH_P = np.array([[-.082, .213], [-.076, .196], [-.061, .178], [-.040, .167], [-.018, .174], [0, .191], [.018, .174], [.040, .167],
                    [.061, .178], [.076, .196], [.082, .213]])
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
    # the muzzle #FFFAF4: two soft cheek puffs round the mouth and a cap round the nose (front projection, W units), a clean
    # rounded shape with a soft 3-4 mm border
    mt = (np.abs(qx / .165) ** 2.4 + np.abs((qz - .190) / .118) ** 2.4) ** (1 / 2.4)
    C = mix(C, rgb('muzzle'), .80 * (1 - smooth(.86, 1.08, mt)) * fr)
    cr = .45 * crease(skull(q), ell(q, *MUZ), K_MUZ)
    C = mix(C, rgb('furdark'), clamp(cr) * .35 * fr)
    # brows: soft dark arches
    for s in (-1, 1):
        Pb = cpath(BROW_P * np.array([s, 1.]), 17)
        ib = (fr > 0) & (np.abs(qx - s * .229) < .08) & (np.abs(qz - .530) < .05)
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
    half = np.full(len(Pm), .0058 * W); half[:4] = np.linspace(.0030, .0058, 4) * W; half[-4:] = np.linspace(.0058, .0030, 4) * W
    Pph = np.array([[0, CHIN + .190 * W], [0, CHIN + (NOSE[0][2] - NOSE[1][2] + .006) * W]]); hph = np.array([.0056 * W, .0050 * W])
    ib = (fr > 0) & (np.abs(x) < .12 * W) & (z > CHIN + .14 * W) & (z < NZ)
    a = np.zeros(len(x)); a[ib] = np.maximum(stroke(x[ib], z[ib], Pm, half, .0026 * W), stroke(x[ib], z[ib], Pph, hph, .0026 * W))
    C = mix(C, rgb('mouth'), .95 * a)
    # the lash itself is a separate ribbon (LASH RIBBONS); only a faint soft contact shade lies on the skin under it (off for
    # the rig's lid paint, so a shut lid carries no trace of it)
    for s_ in ((-1, 1) if PAINT_OPTS.get('band', True) else ()):
        Pl = np.stack([s_ * EX + s_ * EHW * LASH_C2[:, 0], EZ + EHH * LASH_C2[:, 1]], -1)
        box = (fr > 0) & (np.abs(x - s_ * (EX + .45 * EHW)) < .14 * W) & (np.abs(z - (EZ + .8 * EHH)) < .08 * W)
        a = np.zeros(len(x)); a[box] = stroke(x[box], z[box], Pl, 1.15 * LASH_HW * EHH, .0040 * W)
        C = mix(C, rgb('furdeep'), .30 * a * fr)
    return C.reshape(sh + (3,))

def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .32; iz = -.11; irx = .68; irz = .89            # iris 68 % of the opening width, tucked to the nose and the bottom (sheet)
    C = mix(rgb('sclera'), rgb('#E6DEDC'), .55 * smooth(.40, .98, Z))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    g = smooth(.70, -.90, ez)
    I = mix(rgb('#36200E'), rgb('#5E3A1C'), smooth(.05, .45, g))
    I = mix(I, rgb('iris'), smooth(.45, .80, g))
    I = mix(I, rgb('#9A6230'), .80 * smooth(.62, .95, g) * (1 - smooth(.82, .97, r)))     # the warm lower glow
    I = mix(I, rgb('#3A2410'), .75 * smooth(.86, 1.0, r))                                   # the darker rim
    I = I * (1 - .03 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 30 + r * 10)) * smooth(.4, .8, r))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    px_ = ix - s * .14; pz = iz; R = np.sqrt(((X - px_) / .39) ** 2 + ((Z - pz) / .51) ** 2)
    C = mix(C, rgb('pupil'), 1 - smooth(.95, 1.05, R))
    # two catchlights: a big round one upper-nasal, a small one lower-outer
    big = np.sqrt(((X - (-s * .55)) / .18) ** 2 + ((Z - .42) / .18) ** 2)
    small = np.sqrt(((X - (ix + s * .30)) / .065) ** 2 + ((Z - (iz - .50)) / .056) ** 2)
    C = mix(C, rgb('#FFFBF4'), np.maximum(1 - smooth(.92, 1.06, big), .85 * (1 - smooth(.88, 1.10, small))))
    C = mix(C, rgb('lash'), np.maximum(smooth(.93, 1.0, sr) * smooth(-.10, .40, Z), smooth(.86, .97, sr) * smooth(.20, .60, s * X) * smooth(-.80, -.30, Z)))
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
    dpan = ear_pan(na, t); front = (nb > 0).astype(float)
    pink = ramp_colour('pink', .5 + .5 * (sval(n.reshape(-1, 3), hi=.06, lo=.08).reshape(t.shape) - .5))   # an even #FFC0D0
    C = mix(C, pink, smooth(-.0025, .0025, dpan) * front)
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
atlas_path = os.path.join(ROOT, 'scratch', 'head_atlas.png') if HEAD_ONLY else (os.path.join(ROOT, 'scratch', 'rig_base_atlas.png') if RIG else os.path.join(ROOT, 'tk-chiku-toy_atlas.png'))
ATLAS = paint_atlas(atlas_path)
img = bpy.data.images.load(atlas_path); img.name = 'Chiku_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Chiku_toy_atlas'); MAT.use_nodes = True
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
        'band_knot_m': [round(float(c), 4) for c in BAND_ANCHOR],
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
          'ear.L': tuple(ear_info['L']['base']), 'ear.R': tuple(ear_info['R']['base']), 'band': tuple(BAND_ANCHOR),
          'band_tail.L': tuple(BAND_TAIL['L']['root']), 'band_tail.R': tuple(BAND_TAIL['R']['root']),
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
    ob = bpy.context.object; ob.name = 'Chiku_' + group.replace('.', '_'); ob.data.name = ob.name
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
HEADSET = sum(v for k, v in part_tri.items() if k in ('Chiku_head', 'Chiku_eye_L', 'Chiku_eye_R', 'Chiku_lash_L', 'Chiku_lash_R', 'Chiku_ear_L', 'Chiku_ear_R', 'Chiku_band', 'Chiku_band_tail_L', 'Chiku_band_tail_R'))
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
if not HEAD_ONLY and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'tk-chiku-toy.blend'))
def export(path):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects: ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                              export_animations=False)
if not RIG: export(OUT_MODEL)
print('CHIKU_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
