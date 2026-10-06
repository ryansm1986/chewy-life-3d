"""Poe / Bamboo Shinobi (black pug ninja), Toybox line, phase-1 model. Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_poe-toy.py [-- --head-only]

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder and
public/models/poe-toy.glb (--head-only writes scratch/poe-head-test.glb instead).

Technique (the Moka / Rosie / Shadow toy-line machinery):
- The head is ONE smooth implicit ball: a superellipse-squircle skull (front silhouette exponent 2.6, an
  ellipse in depth), a barely-proud bun muzzle, a chin, one soft forehead roll, a short nose-bridge roll and
  a wide nose button, with a set-in socket warp for each eye. The skin is the field's zero surface reached by
  radial projection (CDT in a stereographic domain, with edge loops round the eyelids, nose and mouth), so
  every vertex carries its analytic normal. Adaptive refinement adds points where the game's hard toon band
  would zigzag. The eyes are separate lens globes following the ball.
- Ears are thick offset shells of the skull, folded forward over the top corners (rounded rims, analytic
  normals). The festival mask is one rigid thickened piece on the head's left top corner.
- Clothing is lathed / swept / thickened surfaces and SDF star meshes; limbs are SDF ring stacks.
- One 2048 painted atlas: the face and eyes painted from 3D positions, 2D charts for the top and the mask,
  and 1-D shading ramps (soft painted light) for everything else.
"""
import bpy, bmesh, math, json, os, sys, struct, zlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt
from mathutils.bvhtree import BVHTree

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HEAD_ONLY = '--head-only' in ARGV
RIG = bool(globals().get('RIG_MODE'))      # set by rig_poe-toy.py: part labels + lid / mouth charts; no approved file is written
MODEL = 'D:/projects/chewy-life-3d/public/models/poe-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'poe-head-test.glb') if HEAD_ONLY else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
# sheet (front view, 236.7 px per metre at the 1.20 m crown of chewy-b.glb): head W 172 px, H 121 px (W:H 1.42)
W = .727; CHIN = .689; HY = -.030          # head width, chin height, head centre y (metres)
LOG = {}

PAL = {'fur': '#2E2A30', 'furlight': '#4A4450', 'furdark': '#211D24',
       'mask': '#1E1B20', 'masklight': '#3E3843', 'maskdark': '#151216',
       'nose': '#1E1B20', 'nosehi': '#625B6B',
       'sclera': '#FFF5E8', 'iris': '#C88A3A', 'pupil': '#1A120E',
       'lash': '#0F0D11', 'mouth': '#0F0D11', 'blush': '#7A4650',
       'moss': '#5A8A4A', 'mosslight': '#77A663', 'mossdark': '#456F39',
       'dmoss': '#3D6038', 'dmosslight': '#527A4A', 'dmossdark': '#2D4829',
       'cream': '#F4EAD2', 'creamlight': '#FFF6EA', 'creamdark': '#D8C9AA',
       'mustard': '#D8B040', 'mustardlight': '#EBCB68', 'mustarddark': '#AE8726',
       'brown': '#8A5A34', 'brownlight': '#A8754C', 'browndark': '#664024',
       'orange': '#E8963C', 'pad': '#4A4450', 'dark': '#1A171C'}
CHARTS = {'head': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'top': (0, 0, 1024, 768), 'mask': (1024, 0, 512, 512),
          'spare': (1536, 0, 512, 768)}
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'mask': ('maskdark', 'mask', 'masklight'),
         'moss': ('mossdark', 'moss', 'mosslight'), 'dmoss': ('dmossdark', 'dmoss', 'dmosslight'),
         'cream': ('creamdark', 'cream', 'creamlight'), 'mustard': ('mustarddark', 'mustard', 'mustardlight'),
         'brown': ('browndark', 'brown', 'brownlight'), 'dark': ('#0F0D11', 'dark', '#2E2A32'),
         'pad': ('#3A3540', 'pad', '#5E5868'), 'orange': ('#C8762A', 'orange', '#F4B060'),
         'green': ('mossdark', 'moss', 'mosslight'), 'bone': ('#DCCCAC', 'cream', 'creamlight'),
         'hole': ('#151316', '#211E22', '#2C292E')}
RAMP_ROWS = {k: i for i, k in enumerate(RAMPS)}
if RIG:   # phase-2 charts in unused atlas space (the approved paint is untouched); lid charts are transposed (texel x runs along the arc)
    CHARTS.update({'lidU': (1536, 0, 512, 160), 'lidD': (1536, 160, 512, 128), 'cavity': (1536, 288, 128, 128), 'tongue': (1664, 288, 128, 128)})

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

# ============================================================== the head ball (W units, z above the chin, y from HY)
# Skull: the front silhouette is a superellipse (exponent 2.6: a wide pug squircle, widest at the cheeks), swept to an
# ellipse in depth. Front half-depth BF from the head centre; the back half BB. First-order distance (field / |grad|).
SK = dict(a=.500, c=.403, zc=.300, n=2.6, n_side=2.25, bf=.420, bb=.420, taper=.050, face=.090)
def skull(q):
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    zr = z - SK['zc']; a = SK['a'] * (1 - SK['taper'] * smooth(.20, .72, z)) * (1 - SK['face'] * smooth(-.05, -.40, y)); c = SK['c']
    n = SK['n_side'] + (SK['n'] - SK['n_side']) * (1 - (1 - smooth(-.16, -.34, y)) * smooth(.15, .32, z))   # round 3: rounder upper outline; face and cheeks unchanged
    ax_ = np.abs(x) / a + 1e-9; az_ = np.abs(zr) / c + 1e-9
    s = (ax_ ** n + az_ ** n) ** (1 / n)
    b = np.where(y < 0, SK['bf'], SK['bb']); ay_ = np.abs(y) / b
    r = np.sqrt(s * s + ay_ * ay_) + 1e-12
    kk = s ** (1 - n); gx = kk * ax_ ** (n - 1) / a; gz = kk * az_ ** (n - 1) / c
    gs = s / r; gy = ay_ / (r * b)
    g = np.sqrt(gs * gs * (gx * gx + gz * gz) + gy * gy) + 1e-9
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

MUZ = [[0, -.396, .210], [.172, .090, .100]]; K_MUZ = .055      # the soft bun muzzle: 0.33 W wide, barely proud
CHN = [[0, -.338, .088], [.140, .094, .072]]; K_CHN = .050      # the lower lip and chin under it
JOWL = ([.300, -.020, .125], [.222, .300, .128]); K_JOWL = .070   # round 2: full pug cheeks below the eye line
# the forehead roll: one broad soft clay roll across the brow (0.5 W long, z 0.506-0.569 W), sitting on the skull
ROLL_X = np.linspace(-.27, .27, 13)
ROLL_Z = .545 - .045 * (ROLL_X / .27) ** 2
_ys = front_local(ROLL_X, ROLL_Z, skull)
ROLL_R = .050 * (1 - .30 * (ROLL_X / .27) ** 4)
ROLL_BULGE = .015 * clamp(1 - (ROLL_X / .29) ** 2) ** .8
ROLL_P = np.stack([ROLL_X, _ys + ROLL_R - ROLL_BULGE, ROLL_Z], -1); K_ROLL = .044
def roll_sdf(q):
    p = q.reshape(-1, 3); d = np.full(len(p), 9.)
    for i in range(len(ROLL_P) - 1):
        d = np.minimum(d, sd_capsule(p, ROLL_P[i], ROLL_P[i + 1], (ROLL_R[i], ROLL_R[i + 1])))
    return d.reshape(q.shape[:-1])
_yb = float(front_local(0, .395, skull)[0])
BRIDGE = [[0, _yb + .024 - .006, .392], [.062, .024, .022]]; K_BR = .020     # the hint of a short second roll over the bridge
def jowl_sdf(q):
    qa = np.array(q, float, copy=True); qa[..., 0] = np.abs(qa[..., 0]); return ell(qa, *JOWL)
def base_local(q):
    d = skull(q)
    d = smin(d, jowl_sdf(q), K_JOWL)
    d = smin(d, ell(q, *MUZ), K_MUZ); d = smin(d, ell(q, *CHN), K_CHN)
    d = smin(d, roll_sdf(q), K_ROLL); d = smin(d, ell(q, *BRIDGE), K_BR)
    return d

# eye layout (W units): centres +-0.25 W at 0.56 H below the crown; opening 0.235 W x 0.31 H (0.218 W), round
EXW, EZW, EHWW, EHHW, EN = .250, .309, .1175, .109, 2.10
RECESS = dict(delta=.040, tilt=.15, F_out=.15, F_nas=.062, F_up=.070, F_dn=.065)
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
    return tot * smooth(-.15, -.32, y)
NZW = .267                                                  # nose centre 0.62 H below the crown; top at the eye centre line
NECK = [[0, .040, -.250], [.270, .250, .260]]; K_NECK = .08
def warped(q):
    qw = np.array(q, float, copy=True); qw[..., 1] = q[..., 1] - RECESS['delta'] * eye_recess(q); return qw
_yf = float(front_local(0, NZW, lambda q: base_local(warped(q)))[0])
NOSE = [[0, _yf + .050 - .033, NZW + .002], [.080, .050, .040]]; K_N = .013       # wide rounded button, 0.16 W (round 2)
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
O = np.array([0, HY + .02 * W, CHIN + .34 * W])
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

# crown height check: the skull top must sit at 1.200 m (chewy-b.glb's crown)
_g = np.stack(np.meshgrid(np.zeros(1), np.linspace(-.5, .5, 101), np.linspace(.55, .80, 251), indexing='ij'), -1).reshape(-1, 3)
CROWN_M = float(CHIN + W * _g[head_local(_g) < 0][:, 2].max())
LOG['crown_m'] = round(CROWN_M, 4)

# ============================================================== face layout (front projection, metres)
EX = EXW * W; EZ = CHIN + EZW * W; EHW = EHWW * W; EHH = EHHW * W
def eye_unit(psi):
    c = np.cos(psi); s = np.sin(psi); return spow(c, 2 / EN), spow(s, 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
NZ = CHIN + NZW * W; MZW = .155; MZ = CHIN + MZW * W; MHW = .135 * W     # W-shaped closed mouth at 0.78 H, 0.27 W wide
BLUSH = (.315 * W, CHIN + .150 * W, .095 * W, .060 * W)

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
for k, (rx, rz, n) in enumerate([(.034, .020, 12), (.062, .036, 18), (.088, .051, 24), (.102, .059, 28)]):
    a = np.linspace(0, 2 * PI, n, endpoint=False) + .3 * k
    add_loop(to_dom(surf_dir(rx * W * np.cos(a), NZ + .002 * W + rz * W * np.sin(a))), 'nose_%d' % k)
for k, (hx, hz) in enumerate([(.150, .022), (.163, .031), (.177, .040)]):
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
D = fib(1250, math.radians(118.5)); Pf = radial_hit(D)
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
keep &= ~(front & ((Pf[:, 0] / (.112 * W)) ** 2 + ((Pf[:, 2] - NZ - .002 * W) / (.067 * W)) ** 2 < 1))
keep &= ~(front & ((Pf[:, 0] / (.200 * W)) ** 2 + ((Pf[:, 2] - MZ) / (.056 * W)) ** 2 < 1))
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
REFINE_ADD = int(os.environ.get('REFINE_ADD', '820')); D_LOW, D_T = .12, .45
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
NSEG = 34
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
# ============================================================== EARS: thick folded button ears (offset shells of the skull)
# The ear's footprint is a D-shaped patch on the skull's upper side: t runs from the root on the top of the head (buried)
# over the fold and down the side to the rounded tip (about the top of the eye); s runs across from the back edge to the
# front edge. The mid-surface stands off the skull along its normal (the fold stands proud, the tip flops out).
OC = np.array([0, 0, .32])                   # head-local centre for the ear footprint angles
def skull_hit_local(D):
    f = lambda q: base_local(q)
    lo = np.full(len(D), .05); hi = np.full(len(D), .95)
    for _ in range(34):
        m = (lo + hi) / 2; inn = f(OC + D * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return OC + D * ((lo + hi) / 2)[:, None]
def gradL(f, p, e=1e-4):
    g = np.zeros_like(p)
    for k in range(3):
        dp = np.zeros(3); dp[k] = e; g[:, k] = f(p + dp) - f(p - dp)
    return unit(g)
# Round 2: folded button ears. The footprint is a D-shaped patch on the skull's upper side corner: v runs from the root
# (buried on the top corner) over a proud rolled fold, then down the side-front corner to a rounded tip at about the outer
# top of the eye, pointing down and forward; u runs across (u = +1 at the front edge). The mid-surface stands off the skull
# along its normal, so the flap hugs the head's side; the tip curls slightly back under. (W units; x mirrors.)
EAR = dict(th=(46., 37., 9.), phi=(8., 22.), hw=.180, nt=22, ns=14)
ear_info = {}; EAR_GRID = {}
def ear_offset(v):
    return np.interp(v, [0, .07, .17, .32, .55, .82, 1.0], [-.058, -.010, .018, .040, .058, .076, .074])
def ear_thick(v):
    return np.interp(v, [0, .10, .25, .50, .80, 1.0], [.098, .106, .106, .098, .088, .080])
for side, tag in ((1, 'L'), (-1, 'R')):
    nt, ns = EAR['nt'], EAR['ns']
    vv = np.linspace(0, 1, nt); uu = np.linspace(-1, 1, ns)
    VV, UU = np.meshgrid(vv, uu, indexing='ij')
    th = np.radians(np.interp(VV, [0, .17, 1.], EAR['th']) + 5. * (-UU) * smooth(.40, 1., VV))      # the tip lowest at the front
    hwv = EAR['hw'] * (1 - .50 * smooth(.15, 1., VV)) * (np.sqrt(clamp(1 - clamp((VV - .78) / .24) ** 2)) * .40 + .60)   # round 4: a broad, blunt rounded lobe (end radius ~1.5x)
    phic = np.radians(EAR['phi'][0] + (EAR['phi'][1] - EAR['phi'][0]) * smooth(0., 1., VV))
    PHI = phic + UU * hwv / (.47 * np.cos(th))
    Dl = np.stack([side * np.cos(th) * np.cos(PHI), -np.cos(th) * np.sin(PHI), np.sin(th)], -1).reshape(-1, 3)
    Ps = skull_hit_local(Dl); Ns = gradL(base_local, Ps)
    Pm = Ps + Ns * ear_offset(VV).reshape(-1)[:, None]
    G = Pm.reshape(nt, ns, 3)
    # the lower flap leaves the skull's double curvature and hangs as a soft, nearly flat flap (a broad lobe from every side)
    sel = G[(vv > .35) & (vv < .95)].reshape(-1, 3); cpl = sel.mean(0); npl = np.linalg.svd(sel - cpl)[2][2]
    Gf = G - ((G - cpl) @ npl)[..., None] * npl
    wfl = (.70 * smooth(.25, .65, VV))[..., None]
    G = G * (1 - wfl) + Gf * wfl
    for _ in range(4):
        for fac in (.45, -.47):
            L = G.copy(); L[1:-1, 1:-1] = (G[:-2, 1:-1] + G[2:, 1:-1] + G[1:-1, :-2] + G[1:-1, 2:]) / 4
            G = G + fac * (L - G)
    dT = np.gradient(G, axis=0); dS = np.gradient(G, axis=1)
    NG = unit(np.cross(dS, dT))
    if (NG * unit(G - OC)).sum() < 0: NG = -NG
    Vm = L2M(G.reshape(-1, 3)); Nm = NG.reshape(-1, 3)
    Fm = grid_faces(nt, ns)
    thk = (ear_thick(VV) * (1 - .33 * UU ** 2)).reshape(-1)          # a dumpling-like pillow section
    tm = thk * W
    plain = np.zeros(len(Vm), bool); plain[:ns] = True          # the root edge is buried in the skull
    Vt, Ft, UVt, Nt = thicken(Vm, Fm, Nm, tm, ramp_uv('mask', .5), ramp_uv('mask', .3), ramp_uv('mask', .45), rim=3, plain=plain)
    # paint from the shell's own normals: the top of the fold catches the cool sheen, the underside facing the head is dark
    inward = unit(OC - M2L(Vt)); occ = .22 * smooth(.20, .75, (Nt * inward).sum(1))
    UVt = ramp_uv('mask', sval(Nt, hi=.42, occ=occ))
    make_obj('folded_button_ear.' + tag, Vt, Ft, UVt, 'ear.' + tag, N=Nt)
    EAR_GRID[tag] = (L2M(G.reshape(-1, 3)), VV.reshape(-1).copy())          # the mid-surface and its root-to-tip parameter (for the rig)
    Gm = L2M(G)
    ear_info[tag] = {'base': Gm[1, ns // 2].tolist(), 'fold': Gm[int(nt * .17), ns // 2].tolist(), 'tip': Gm[-1, ns // 2 + 2].tolist()}


if HEAD_ONLY:
    BODY_PAINTERS = {}; BODY_PIVOTS = {}; JOINTS_BODY = {}
else:
    # ============================================================== BODY AND COSTUME (runs inside build_poe-toy.py's namespace)
    # metres; body axis x = 0, y = RCY. Heights from the sheet's front view (fractions of the 1.20 m crown).
    RCY = .000
    def crease(a, b, k): return clamp((np.minimum(a, b) - smin(a, b, k)) / k)
    def ramp_fn(name, hi=.28, occ=0.):
        return lambda NN, V, *a: ramp_uv(name, sval(NN, occ=occ, hi=hi))
    def ramp_sw(name, hi=.28, occ=0.):          # for sweep(): uvfn(NV, tt, uu, V)
        return lambda NV, tt, uu, V: ramp_uv(name, sval(NV, occ=occ, hi=hi))

    print('BODY_STEP', "he torso: the moss wrapped top (chart 'top", flush=True)
    # ---------------------------------------------------------------- the torso: the moss wrapped top (chart 'top')
    TZ = np.array([.370, .410, .460, .510, .560, .600, .640, .680, .720])
    TAX = np.array([.276, .288, .298, .310, .318, .310, .282, .236, .180])
    TAY = np.array([.214, .220, .228, .238, .243, .235, .214, .182, .144])
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
        """angle on the torso whose x matches (front half)"""
        s_ = np.clip(np.asarray(x, float) / tax_f(z), -.999, .999); return np.arcsin(spow(s_, TP / 2))
    NA_T, NZ_T = 34, 13
    zt_ = np.linspace(TZ[0], TZ[-1], NZ_T); at_ = np.linspace(0, 2 * PI, NA_T, endpoint=False)
    AA, ZZ = np.meshgrid(at_, zt_)
    Pt_ = torso_raw(AA, ZZ); Nt_ = torso_n(AA, ZZ)
    UVt_ = au('top', (AA / (2 * PI)).ravel(), ((ZZ - TZ[0]) / (TZ[-1] - TZ[0])).ravel())
    # UV seam: wrap the last column to u = 1 by duplicating it
    Pg = np.concatenate([Pt_, Pt_[:, :1]], 1); Ng = np.concatenate([Nt_, Nt_[:, :1]], 1)
    Ug = np.concatenate([(AA / (2 * PI)), np.ones((NZ_T, 1))], 1); Vg = np.concatenate([(ZZ - TZ[0]) / (TZ[-1] - TZ[0])] * 1 + [((zt_ - TZ[0]) / (TZ[-1] - TZ[0]))[:, None]], 1)
    make_obj('moss_wrapped_top', Pg.reshape(-1, 3), grid_faces(NZ_T, NA_T + 1), au('top', Ug.ravel(), Vg.ravel()), 'body', N=Ng.reshape(-1, 3))
    def paint_top(U, V):
        a = U * 2 * PI; z = TZ[0] + V * (TZ[-1] - TZ[0]); x = tax_f(z) * spow(np.sin(a), 2 / TP); front = np.cos(a) > 0
        n = torso_n(a, z); C = ramp_colour('moss', sval(n, hi=.26))
        # the crossed wrap: her left panel over her right, a soft darker overlap seam from her right shoulder to the left waist
        zl = .640 - (x + .150) / .330 * .200           # line through (-0.15, 0.64) and (0.18, 0.44)
        seam = (1 - smooth(.003, .007, np.abs(z - zl))) * front * (z > .43) * (z < .66)
        under = smooth(.0, .02, z - zl) * front * (z > .43) * (z < .66) * smooth(.05, -.10, x)
        C = mix(C, rgb('mossdark'), .22 * under); C = mix(C, rgb('dmossdark'), .75 * seam)
        # soft fold shading under the arms and at the side seams
        C = mix(C, rgb('mossdark'), .30 * np.exp(-((np.abs(np.sin(a)) - 1) / .10) ** 2) * smooth(.62, .52, z) * smooth(.45, .52, z))
        return C
    def ramp_colour(name, u):
        lo, base, hi = [rgb(c) for c in RAMPS[name]]; u = clamp(u)
        return np.where((u < .5)[..., None], mix(lo, base, smooth(0, .5, u)), mix(base, hi, smooth(.5, 1, u)))

    print('BODY_STEP', 'he cream collar (the lowered face mask): a', flush=True)
    # ---------------------------------------------------------------- the cream collar (the lowered face mask): a thick soft cowl roll
    NC = 60; ac = np.linspace(0, 2 * PI, NC, endpoint=False)
    frontc = np.maximum(0, np.cos(ac)) ** 2                   # a = 0 at the front
    zc_c = .648 - .050 * frontc; hc = .036 + .042 * frontc; tc = .040 + .008 * frontc
    rxc = .266 + .010 * frontc; ryc = .238 + .018 * frontc
    Pc = np.stack([rxc * np.sin(ac), RCY - .012 - ryc * np.cos(ac), zc_c], -1)
    Nc = unit(np.stack([np.sin(ac) / rxc, -np.cos(ac) / ryc, np.zeros(NC)], -1))
    ab_ = np.linspace(0, 2 * PI, 9, endpoint=False)
    FOLDS = [(-.62, .010), (-.06, .012), (.52, .011)]          # (angle round the neck from the front, height in m)
    def collar_prof(k):
        f = sum(h * np.exp(-((ac[k] - a0 - .20 * np.sin(ab_)) / .135) ** 2) for a0, h in FOLDS)
        sag = sum(.010 * np.exp(-((ac[k] - a0) / .20) ** 2) for a0, h in FOLDS) * (np.sin(ab_) < 0)
        return np.stack([tc[k] * spow(np.cos(ab_), .80) + .006 * np.sin(ab_) + f * np.maximum(0, np.cos(ab_)) ** .5,
                         hc[k] * spow(np.sin(ab_), .80) - sag * np.abs(np.sin(ab_))], -1)
    ring_tube('cream_collar_roll', Pc, collar_prof, 'body', lambda NN, tt, uu, V: ramp_uv('cream', sval(NN, hi=.22) - .05), Nc, sides=9)

    print('BODY_STEP', "he mustard scarf: a band along the collar'", flush=True)
    # ---------------------------------------------------------------- the mustard scarf: a band along the collar's lower edge, knot at her right chest
    zs_s = zc_c - hc + .010; Ps = np.stack([(rxc + .010) * np.sin(ac), RCY - .012 - (ryc + .012) * np.cos(ac), zs_s], -1)
    ab2 = np.linspace(0, 2 * PI, 6, endpoint=False)
    ring_tube('mustard_scarf_band', Ps[::2], lambda k: np.stack([.016 * np.cos(ab2), .016 * np.sin(ab2)], -1), 'body', ramp_sw('mustard'), Nc[::2], sides=6)
    KN = np.array([-.150, 0, .560]); KN[1] = float(torso_pt(torso_front_a(KN[0], KN[2]), KN[2])[1]) - .032
    lobe('scarf_knot', KN, np.array([.048, .056, .052]), [-.15, -1, .1], 'body', ramp='mustard', n=3, occ_in=.10)
    lobe('scarf_knot_loop', KN + np.array([.050, .006, .018]), np.array([.024, .038, .028]), [.3, -1, .4], 'body', ramp='mustard', n=3, occ_in=.12, pole=[1, 0, .3])
    for k, (dx, dz, w0) in enumerate([(-.045, -.086, .030), (.016, -.076, .027)]):
        p0 = KN + np.array([dx * .15, -.004, -.020]); p1 = KN + np.array([dx * .6, -.016, dz * .55]); p2 = KN + np.array([dx, -.010, dz])
        path = cpath([p0, p1, p2], 9); P_ = path.copy()
        for i in range(len(P_)):        # keep the tail just outside the chest
            zz = P_[i, 2]; aa = torso_front_a(P_[i, 0], zz); ys = float(torso_pt(aa, zz)[1]) - .022
            P_[i, 1] = min(P_[i, 1], ys)
        sweep('scarf_tail.%d' % k, P_, lambda j, w0=w0: (.010, w0 * (1 + .25 * j / 8)), 'body', ramp_sw('mustard'), sides=8, normals=np.tile([0, -1., 0], (len(P_), 1)), p=.55)

    print('BODY_STEP', 'he cream diagonal strap: her left shoulder', flush=True)
    # ---------------------------------------------------------------- the cream diagonal strap: her left shoulder down across the chest to the sash
    SP = []
    for t in np.linspace(0, 1, 14):
        x = .172 - t * .210; z = .655 - t * .215
        a = torso_front_a(x, z); SP.append(torso_pt(a, z, .010))
    SP = np.array(SP)
    SN = torso_n(np.array([torso_front_a(p[0], p[2]) for p in SP]), SP[:, 2])
    sweep('cream_chest_strap', SP, lambda k: (.0075, .024), 'body', ramp_sw('cream', hi=.22), sides=6, normals=SN, p=.45)

    print('BODY_STEP', 'he mustard obi sash, a big knot at the cen', flush=True)
    # ---------------------------------------------------------------- the mustard obi sash, a big knot at the centre, two tails to 0.24 m
    SZ0 = .438; NAS = 34; a_s = np.linspace(0, 2 * PI, NAS, endpoint=False)
    rxs = tax_f(SZ0) + .014; rys = tay_f(SZ0) + .016
    Pss = np.stack([rxs * spow(np.sin(a_s), 2 / TP), RCY - rys * spow(np.cos(a_s), 2 / TP), np.full(NAS, SZ0)], -1)
    Nss = torso_n(a_s, np.full(NAS, SZ0)); Nss[:, 2] = 0; Nss = unit(Nss)
    ab3 = np.linspace(0, 2 * PI, 8, endpoint=False)
    ring_tube('mustard_obi_sash', Pss, lambda k: np.stack([.015 * spow(np.cos(ab3), .6), .031 * spow(np.sin(ab3), .6)], -1), 'body', ramp_sw('mustard', hi=.24), Nss, sides=8)
    SK0 = np.array([0, RCY - rys - .022, SZ0])
    lobe('sash_knot', SK0, np.array([.036, .052, .048]), [0, -1, .05], 'body', ramp='mustard', n=4, occ_in=.06)
    for sx in (-1, 1):
        lobe('sash_loop.%d' % sx, SK0 + np.array([sx * .070, .012, .008]), np.array([.026, .060, .036]), [sx * .15, -1, .1], 'body', ramp='mustard', n=3, occ_in=.14, pole=[sx, 0, .15], squash=.2)
    for sx, tag in ((-1, 'R'), (1, 'L')):
        p0 = SK0 + np.array([sx * .016, .006, -.024]); p1 = SK0 + np.array([sx * .030, -.008, -.090]); p2 = SK0 + np.array([sx * .046, -.006, -.150])
        p3 = SK0 + np.array([sx * .058, .004, -.198])
        path = cpath([p0, p1, p2, p3], 10)
        sweep('sash_tail.' + tag, path, lambda j: (.012, .034 + .012 * j / 9), 'body', ramp_sw('mustard'), sides=6,
              normals=np.tile([0, -1., 0], (len(path), 1)), p=.55)

    print('BODY_STEP', 'rms: short moss sleeves with cream + musta', flush=True)
    # ---------------------------------------------------------------- arms: short moss sleeves with cream + mustard cuffs, dark-moss guards, black mitten paws
    ARM = {}; ARM_DEG = 40.
    for s, tag in ((1, 'L'), (-1, 'R')):
        th = math.radians(ARM_DEG); ad = unit(np.array([s * math.sin(th), -.07, -math.cos(th)]))
        SH = np.array([s * .272, -.005, .600])
        fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
        def along(t0): return SH + ad * t0
        # sleeve: a slightly flaring tube, closed inside the torso, open-looking cuff covered by the bands
        path = np.array([along(t0) for t0 in np.linspace(-.05, .130, 7)])
        sweep('moss_sleeve.' + tag, path, lambda k: (.090 + .010 * k / 6, .088 + .010 * k / 6), 'arm.' + tag, ramp_sw('moss', hi=.26), sides=18, cap0=False, cap1=False, normals=np.tile(fwd, (len(path), 1)))
        for (t0, t1, r0, name, rp) in [(.125, .160, .104, 'cream_cuff', 'cream'), (.158, .181, .099, 'mustard_cuff', 'mustard')]:
            path = np.array([along(t) for t in np.linspace(t0, t1, 3)])
            sweep(name + '.' + tag, path, lambda k, r0=r0: (r0, r0 - .002), 'arm.' + tag, ramp_sw(rp, hi=.24), sides=18, cap0=False, cap1=False, normals=np.tile(fwd, (3, 1)), p=.9)
        path = np.array([along(t) for t in np.linspace(.145, .280, 7)])
        sweep('dmoss_forearm_guard.' + tag, path, lambda k: (.079 - .005 * k / 6, .077 - .005 * k / 6), 'arm.' + tag, ramp_sw('dmoss', hi=.26), sides=16, cap0=False, cap1=False, normals=np.tile(fwd, (len(path), 1)))
        for t0 in (.218,):
            path = np.array([along(t) for t in np.linspace(t0, t0 + .020, 3)])
            sweep('mustard_guard_band.%s.%d' % (tag, int(t0 * 1000)), path, lambda k: (.081, .079), 'arm.' + tag, ramp_sw('mustard', hi=.24), sides=16, cap0=False, cap1=False, normals=np.tile(fwd, (3, 1)), p=.9)
        # mitten paw (SDF ring stack): palm, three soft finger lobes, a thumb; the wrist sits inside the guard
        WR = along(.272); PC = along(.322); lat = np.cross(ad, fwd) * s
        paw_axes = np.array([ad, fwd, lat]); PS = 1.0
        fingers = [PC + ad * .050 + fwd * (o * .028) - lat * .004 for o in (-1, 0, 1)]
        thumb = PC + fwd * .052 + lat * .020 - ad * .010
        def arm_parts(p, WR=WR, PC=PC, paw_axes=paw_axes, fingers=fingers, thumb=thumb):
            d_w = sd_capsule(p, WR - ad * .03, PC, (.062, .066))
            d_paw = sd_ell(p, PC, paw_axes, (.074, .074, .066))
            d_f = [sd_ell(p, f, paw_axes, (.034, .027, .036)) for f in fingers]
            d_t = sd_ell(p, thumb, paw_axes, (.032, .028, .028))
            return d_w, d_paw, d_f, d_t
        def arm_sdf(p, arm_parts=arm_parts):
            d_w, d_paw, d_f, d_t = arm_parts(p)
            d = smin(d_w, d_paw, .030); ff = smin(smin(d_f[0], d_f[1], .007), d_f[2], .007)
            return smin(smin(d, ff, .016), d_t, .012)
        def arm_uv(NN, V, arm_parts=arm_parts):
            d_w, d_paw, d_f, d_t = arm_parts(V)
            cr = crease(d_f[0], d_f[1], .007) * .25 + crease(d_f[1], d_f[2], .007) * .25 + crease(np.minimum(d_paw, d_w), d_t, .012) * .2
            return ramp_uv('fur', sval(NN, occ=1.4 * cr, hi=.30))
        tt_ = np.linspace(0, .14, 281); inside = arm_sdf(PC[None] + ad[None] * tt_[:, None]) < 0
        reach = float(tt_[np.argmin(inside)]) if not inside.all() else .14
        tips = PC + ad * (reach - .008)
        ts = np.concatenate([np.linspace(0, .45, 4)[:-1], np.linspace(.45, 1.0, 13)])
        cen = (WR - ad * .02)[None] + (tips - (WR - ad * .02))[None] * ts[:, None]
        ring_stack('black_mitten_paw.' + tag, arm_sdf, cen, np.tile(ad, (len(ts), 1)), 'arm.' + tag, arm_uv, sides=15, tmax=.16, ref=fwd)
        ARM[tag] = {'shoulder': SH.tolist(), 'elbow': along(.152).tolist(), 'wrist': WR.tolist(), 'palm': (PC + lat * .012).tolist()}

    print('BODY_STEP', 'uffy dark-moss shorts, split per leg, gath', flush=True)
    # ---------------------------------------------------------------- puffy dark-moss shorts, split per leg, gathered hems at 0.162 m
    LEG = {}
    for s, tag in ((1, 'L'), (-1, 'R')):
        XC = s * .168
        def shorts_sdf(p, XC=XC, s=s):
            d = ell(p, [XC, .004, .292], [.182, .238, .118])
            d = smin(d, ell(p, [s * .130, .004, .392], [.168, .222, .060]), .05)                 # the waist under the sash
            hem = ell(p, [s * .200, -.004, .190], [.118, .126, .032])
            d = smin(d, hem, .035)
            ang = np.arctan2(p[:, 1] + .004, p[:, 0] - s * .200)
            d = d + .0065 * np.cos(11 * ang) * smooth(.262, .200, p[:, 2]) * smooth(.164, .184, p[:, 2])       # gathers at the hem
            d = d + .0035 * np.cos(5 * ang + .7) * smooth(.36, .26, p[:, 2]) * smooth(.18, .24, p[:, 2])       # soft puff folds
            return d
        star_mesh('dmoss_puffy_shorts.' + tag, shorts_sdf, np.array([s * .175, .004, .275]), 'body',
                  lambda NN, V: ramp_uv('dmoss', sval(NN, hi=.30, occ=.10 * smooth(.20, .15, V[:, 2]))), nth=16, nph=24, tmax=.40)
        # cream shin wraps 0.096-0.168 m: three soft bandage turns
        zz = np.linspace(.092, .186, 11); rr = .085 + .0030 * np.cos((zz - .100) / .031 * 2 * PI) - .010 * smooth(.165, .186, zz) - .006 * smooth(.104, .092, zz)
        ang = np.linspace(0, 2 * PI, 18, endpoint=False)
        cx_, cy_ = s * .208, -.004
        P_ = np.stack([cx_ + rr[:, None] * np.sin(ang)[None] * 1.0, cy_ - rr[:, None] * np.cos(ang)[None] * 1.04, np.repeat(zz[:, None], 18, 1)], -1)
        dr = np.gradient(rr, zz)
        N_ = unit(np.stack([np.sin(ang)[None] * np.ones((11, 1)), -np.cos(ang)[None] * np.ones((11, 1)), -dr[:, None] * np.ones((1, 18))], -1))
        occ = .12 * smooth(-.4, -1., np.cos((zz - .100) / .031 * 2 * PI))
        make_obj('cream_shin_wrap.' + tag, P_.reshape(-1, 3), grid_faces(11, 18, True), ramp_uv('cream', sval(N_.reshape(-1, 3), hi=.20) - np.repeat(occ, 18)), 'body', N=N_.reshape(-1, 3))
        # moss split-toe tabi boots, mustard soles, a cream instep strap
        FC = np.array([s * .232, -.050, .060]); yaw = s * math.radians(8)
        Ry = rot([0, 0, 1], yaw); FAX = Ry.T
        toe_x = s * .232 - s * .040
        def boot_sdf(p, FC=FC, FAX=FAX, s=s, toe_x=toe_x):
            d = sd_ell(p, FC, FAX, (.096, .150, .064))
            d = smin(d, sd_capsule(p, np.array([s * .210, -.004, .050]), np.array([s * .208, -.004, .150]), .095), .04)
            d = smax(d, p[:, 2] - .112, .012)                                   # a flat-topped cuff (the wrap tucks in)
            g = (np.abs(p[:, 0] - toe_x) - .005)
            cut = np.maximum(g, -(p[:, 1] - (FC[1] - .085)))
            cut = np.maximum(cut, -(p[:, 2] - .030))
            d = smax(d, -cut, .010)
            return smax(d, -(p[:, 2] - .020), .006)
        star_mesh('moss_tabi_boot.' + tag, boot_sdf, FC + np.array([0, .01, .015]), 'body', ramp_fn('moss', hi=.30), nth=14, nph=24, tmax=.30)
        def sole_sdf(p, FC=FC, FAX=FAX):
            q = (p - FC) @ FAX.T; qx = q[:, 0] / .102; qy = q[:, 1] / .156
            d2 = (np.sqrt(qx * qx + qy * qy) - 1) * .102
            dz = np.abs(p[:, 2] - .0115) - .0115
            d2 = d2 + .008; dz = dz + .008
            return np.sqrt(np.maximum(d2, 0) ** 2 + np.maximum(dz, 0) ** 2) + np.minimum(np.maximum(d2, dz), 0) - .008
        star_mesh('mustard_sole.' + tag, sole_sdf, np.array([FC[0], FC[1], .012]), 'body', ramp_fn('mustard', hi=.22), nth=6, nph=24, tmax=.25)
        # instep strap: over the top of the foot from the inner to the outer sole edge
        sp = []
        for u in np.linspace(-1, 1, 9):
            a_ = u * 1.25; dl = np.array([math.sin(a_), 0, math.cos(a_)]) @ np.eye(3)
            c0 = np.array([FC[0], FC[1] + .010, .028])
            sp.append(ray_outer(boot_sdf, c0, dl[None], .2)[0] + dl * .004)
        sp = np.array(sp)
        sweep('cream_tabi_strap.' + tag, sp, lambda k: (.006, .016), 'body', ramp_sw('cream', hi=.22), sides=6, normals=unit(sp - np.array([FC[0], FC[1] + .01, .028])), p=.5)
        LEG[tag] = {'hip': [s * .110, .004, .360], 'knee': [s * .190, -.004, .210], 'ankle': [s * .208, -.004, .100], 'toe': [s * .238, -.180, .040]}

    print('BODY_STEP', 'he moss hood worn back: a soft bunched cow', flush=True)
    # ---------------------------------------------------------------- the moss hood worn back: a soft bunched cowl behind the neck
    def hood_sdf(p):
        d = ell(p, [0, .178, .655], [.250, .118, .086])
        d = smin(d, ell(p, [0, .205, .575], [.205, .088, .085]), .05)
        d = smin(d, ell(p, [0, .120, .700], [.215, .080, .040]), .04)
        rim = ell(p, [0, .150, .735], [.200, .100, .030])                                  # the opening (round the neck) dips in
        d = smax(d, -rim, .025)
        return d + .004 * np.cos(9 * np.arctan2(p[:, 0], p[:, 1] - .10)) * smooth(.62, .54, p[:, 2])
    star_mesh('moss_hood_cowl', hood_sdf, np.array([0, .185, .630]), 'body', lambda NN, V: ramp_uv('moss', sval(NN, hi=.26, occ=.18 * smooth(.68, .74, V[:, 2]))), nth=13, nph=24, tmax=.40)

    print('BODY_STEP', 'he tight black tail curl (a spiral tube wi', flush=True)
    # ---------------------------------------------------------------- the tight black tail curl (a spiral tube with bend loops), above the shorts
    TC = np.array([0, .298, .368])
    tp = []
    for t in np.linspace(0, 1, 24):
        if t < .10:
            q = np.array([0, .200 + .70 * t, .452 - .05 * t])
        else:
            u = (t - .10) / .90; ang_ = PI / 2 - u * 2.45 * PI; r_ = .080 * (1 - .80 * u)
            q = TC + np.array([r_ * math.cos(ang_), .016 * math.sin(PI * u), r_ * math.sin(ang_)])
        tp.append(q)
    tp = np.array(tp)
    for _ in range(3): tp[1:-1] = .25 * tp[:-2] + .5 * tp[1:-1] + .25 * tp[2:]
    TAIL_PATH = tp
    sweep('black_tail_curl', tp, lambda k: (.050 * (1 - .50 * k / 23), .048 * (1 - .50 * k / 23)), 'tail', ramp_sw('fur', hi=.30), sides=10,
          normals=np.tile([0, 1., 0], (len(tp), 1)))

    print('BODY_STEP', 'er right hip: a dark-moss pouch with a sma', flush=True)
    # ---------------------------------------------------------------- her right hip: a dark-moss pouch with a small bone shuriken sticking out
    PCn = np.array([-.318, -.150, .262]); pyaw = math.radians(-26)
    PAX = rot([0, 0, 1], pyaw).T
    def pouch_sdf(p): return sd_box(p, PCn, PAX, (.088, .052, .090), .036)
    star_mesh('dmoss_pouch', pouch_sdf, PCn, 'body', ramp_fn('dmoss', hi=.26), nth=10, nph=18, tmax=.2)
    fl = []
    uu = np.linspace(-1, 1, 7); vv = np.linspace(0, 1, 7)
    for v in vv:
        for u in uu:
            if v < .30: q = np.array([u * .084, .052 * (1 - 2 * v / .30) * .95, .090 + .006])
            else:
                w_ = (v - .30) / .70; q = np.array([u * .084 * (1 - .25 * w_ ** 3 * abs(u) ** 4), -.052 - .006, .090 - w_ * .100 * (1 - .30 * u * u)])
            fl.append(PCn + q @ PAX)
    fl = np.array(fl)
    def on_box(P0, f, it=5):
        P = P0.copy()
        for _ in range(it):
            d = f(P); g = grad(f, P); P = P - g * d[:, None]
        return P, grad(f, P)
    FLp, FLn = on_box(fl, pouch_sdf); FLp = FLp + FLn * .006
    Vt, Ft, UVt, Nt = thicken(FLp, grid_faces(len(vv), len(uu)), FLn, .008, ramp_uv('dmoss', sval(FLn, hi=.30) + .04), ramp_uv('dmoss', .25), ramp_uv('dmoss', .55), rim=3)
    make_obj('dmoss_pouch_flap', Vt, Ft, UVt, 'body', N=Nt)
    lobe('pouch_button', FLp[-4] + FLn[-4] * .010, np.array([.009, .013, .013]), FLn[-4], 'body', ramp='mustard', n=2, occ_in=0)
    # a small bone shuriken half out of the pouch
    def bone_sdf_factory(c0, axis, L, rs, rk, kgap, perp):
        a0 = c0 - axis * L / 2; a1 = c0 + axis * L / 2
        def f(p):
            d = sd_capsule(p, a0, a1, rs)
            for e in (a0 - axis * rk * .3, a1 + axis * rk * .3):
                for sg in (-1, 1): d = smin(d, np.linalg.norm(p - (e + perp * sg * kgap), axis=1) - rk, .012)
            return d
        return f
    SBc = PCn + np.array([.014, .0, .128]) @ PAX
    for k, ang_ in enumerate((math.radians(35), math.radians(125))):
        axis = unit(np.array([math.cos(ang_), 0, math.sin(ang_)]) @ PAX); perp = unit(np.cross(axis, np.array([0, -1., 0]) @ PAX))
        f = bone_sdf_factory(SBc, axis, .100, .013, .018, .014, perp)
        cen = np.array([SBc + axis * t for t in np.linspace(-.062, .062, 10)])
        ring_stack('mini_bone_shuriken.%d' % k, f, cen, np.tile(axis, (10, 1)), 'body', ramp_fn('bone', hi=.22), sides=8, tmax=.08, ref=perp)
    lobe('mini_hub', SBc, np.array([.014, .022, .022]), np.array([0, -1., 0]) @ PAX, 'body', ramp='mustard', n=3, occ_in=0)
    # a short strap from the pouch to the sash
    sweep('pouch_loop', [PCn + np.array([.030, .040, .080]) @ PAX, PCn + np.array([.030, .046, .140]) @ PAX, np.array([-.270, -.190, .425])],
          lambda k: (.006, .016), 'body', ramp_sw('dmoss'), sides=8, normals=np.tile(np.array([0, -1., 0]) @ PAX, (3, 1)), p=.5)

    print('BODY_STEP', 'er left hip: a cream jutsu scroll with bro', flush=True)
    # ---------------------------------------------------------------- her left hip: a cream jutsu scroll with brown caps, tilted (top toward the body)
    SCc = np.array([.300, -.150, .348]); tilt = math.radians(26)
    sax = unit(np.array([-math.sin(tilt), -.10, math.cos(tilt)])); sref = unit(np.cross(sax, [0, 1., 0]))
    SL = .190; SR = .039
    path = np.array([SCc + sax * t for t in np.linspace(-SL / 2 + .010, SL / 2 - .010, 8)])
    sweep('cream_scroll_body', path, lambda k: (SR, SR), 'body', ramp_sw('cream', hi=.22), sides=16, cap0=False, cap1=False, normals=np.tile(sref, (8, 1)))
    for sg, extra in ((1, False), (-1, True)):
        e = SCc + sax * sg * (SL / 2 - .004)
        path = np.array([e - sax * sg * .018, e - sax * sg * .006, e + sax * sg * .006])
        sweep('brown_scroll_cap.%d' % sg, path, lambda k: (.046, .046), 'body', ramp_sw('brown', hi=.26), sides=14, normals=np.tile(sref, (3, 1)), p=.7)
        if extra:
            path = np.array([e + sax * sg * .006, e + sax * sg * .018])
            sweep('mustard_scroll_end', path, lambda k: (.036, .036), 'body', ramp_sw('mustard', hi=.26), sides=14, cap0=False, normals=np.tile(sref, (2, 1)), p=.7)
    sweep('scroll_tie', [np.array([.250, -.190, .418]), SCc + sax * .055 + np.array([0, -.036, 0]), SCc + sax * .015 - np.array([0, .041, 0])],
          lambda k: (.005, .012), 'body', ramp_sw('brown'), sides=8, normals=np.tile([0, -1., 0], (3, 1)), p=.5)

    print('BODY_STEP', 'he giant fuma bone shuriken on the back (s', flush=True)
    # ---------------------------------------------------------------- the giant fuma bone shuriken on the back (separate object: fuma_back)
    FUMA_R = .400                               # hub centre to the bone tip (the sheet's back view: tips behind the shoulders)
    FCt = np.array([0, .350, .628]); fz = unit(np.array([0, 1., -.10]))          # facing: back; the plane's top leans back a little
    fx = np.array([1., 0, 0]); fy = unit(np.cross(fx, fz))                         # in-plane up (+z)
    FUMA_ANG = [20, 160, 220, 320]
    for k, ang_ in enumerate(FUMA_ANG):
        a_ = math.radians(ang_); axis = unit(fx * math.cos(a_) + fy * math.sin(a_)); perp = unit(np.cross(fz, axis))
        L_ = FUMA_R - .085; mid = FCt + axis * (.060 + L_ / 2) + fz * .004
        a0 = FCt + axis * .060; a1 = FCt + axis * (FUMA_R - .060)
        def bone_f(p, a0=a0, a1=a1, axis=axis, perp=perp):
            t_ = np.clip(((p - a0) @ (a1 - a0)) / ((a1 - a0) @ (a1 - a0)), 0, 1)
            rr_ = .048 - .008 * np.sin(PI * t_) ** 2
            d = np.linalg.norm(p - (a0 + t_[:, None] * (a1 - a0)), axis=1) - rr_
            for sg in (-1, 1): d = smin(d, np.linalg.norm(p - (a1 + axis * .006 + perp * sg * .050), axis=1) - .064, .024)
            return d
        Lb = FUMA_R - .120
        cen = np.array([a0 + axis * t for t in np.concatenate([np.linspace(-.02, Lb - .08, 4), np.linspace(Lb - .06, Lb + .052, 9)])])
        ring_stack('fuma_bone.%d' % k, bone_f, cen, np.tile(axis, (len(cen), 1)), 'fuma', ramp_fn('bone', hi=.24), sides=12, tmax=.14, ref=fz)
    # hub: a thick mustard ring with four clamp blocks and dark rivets
    prof = []
    for k in range(8):
        t = 2 * PI * k / 8 + PI / 8; prof.append((.096 + .040 * spow(math.cos(t), .8), .030 * spow(math.sin(t), .8)))
    prof = np.array(prof); NH = 28; th_ = np.linspace(0, 2 * PI, NH, endpoint=False)
    Ph = (FCt[None, None] + prof[:, 0][:, None, None] * (np.cos(th_)[None, :, None] * fx + np.sin(th_)[None, :, None] * fy) + prof[:, 1][:, None, None] * fz)
    dpr = np.roll(prof, -1, 0) - np.roll(prof, 1, 0); pn = unit(np.stack([dpr[:, 1], -dpr[:, 0]], -1))
    Nh = unit(pn[:, 0][:, None, None] * (np.cos(th_)[None, :, None] * fx + np.sin(th_)[None, :, None] * fy) + pn[:, 1][:, None, None] * fz)
    Fh_ = []
    for j in range(8):
        for i in range(NH):
            jj = (j + 1) % 8; ii = (i + 1) % NH; Fh_.append((j * NH + i, j * NH + ii, jj * NH + ii, jj * NH + i))
    make_obj('fuma_hub_ring', Ph.reshape(-1, 3), Fh_, ramp_uv('mustard', sval(Nh.reshape(-1, 3), hi=.30)), 'fuma', N=Nh.reshape(-1, 3))
    for k, ang_ in enumerate(FUMA_ANG):
        a_ = math.radians(ang_); axis = unit(fx * math.cos(a_) + fy * math.sin(a_)); perp = unit(np.cross(fz, axis))
        bc = FCt + axis * .128 + fz * .004; BAX = np.array([axis, perp, fz])
        star_mesh('fuma_clamp.%d' % k, lambda p, bc=bc, BAX=BAX: sd_box(p, bc, BAX, (.040, .060, .040), .016), bc, 'fuma', ramp_fn('mustard', hi=.30), nth=6, nph=12, tmax=.14, axis=fz, ref=axis)
        for sg in (-1, 1):
            lobe('fuma_rivet.%d.%d' % (k, sg), bc + perp * sg * .032 + fz * .039, np.array([.006, .010, .010]), fz, 'fuma', ramp='hole', n=1, occ_in=0)
    FUMA_MOUNT = {'units': 'metres, Blender Z-up, front -Y; game: (x, z, -y)', 'object': 'fuma_back', 'centre': FCt.tolist(), 'facing': fz.tolist(),
                  'up': fy.tolist(), 'right': fx.tolist(), 'tip_radius': FUMA_R, 'across_m': 2 * FUMA_R, 'arm_angles_deg_from_right_in_plane': FUMA_ANG,
                  'note': 'facing = the hub axis (points back, away from her); the pivot of fuma_back is the hub centre'}
    # the mustard strap holding it: a band across the upper back under the hub, into the shoulders
    BP = []
    for a_ in np.linspace(1.55, 2 * PI - 1.55, 11):
        BP.append(torso_pt(np.array([a_]), np.array([.612]), .028)[0])
    BP = np.array(BP)
    sweep('mustard_fuma_strap', BP, lambda k: (.008, .026), 'body', ramp_sw('mustard', hi=.24), sides=6, normals=torso_n(np.linspace(1.55, 2 * PI - 1.55, 11), np.full(11, .612)), p=.5)

    print('BODY_STEP', 'he cream fox festival mask with green / or', flush=True)
    # ---------------------------------------------------------------- the cream fox festival mask with green / orange paint and a mustard tassel (her left top corner)
    # round 2: on her left side corner over the ear root (not a badge on the forehead from 45 deg), facing 40 deg outward
    md = unit(np.array([.80, -.20, .54]))                     # head-local direction from the head centre to the side-top corner
    mh = skull_hit_local(md[None])[0]; mn = gradL(base_local, mh[None])[0]
    MFACE = unit(np.array([math.sin(math.radians(40)), -math.cos(math.radians(40)), .22])); MUP0 = unit(np.array([-.45, 0, 1.]))
    MUP = unit(MUP0 - MFACE * (MUP0 @ MFACE)); MRIGHT = np.cross(MUP, MFACE)
    MASK_C = L2M((mh + mn * .030)[None])[0]
    # rest it on the ear: push it out along its facing until its back clears the skull and the left ear by 6 mm
    _ev = np.array([list(o.matrix_world @ v.co) for o in parts['ear.L'] for v in o.data.vertices])
    _rel = _ev - MASK_C; _pl = _rel - np.outer(_rel @ MFACE, MFACE)
    _foot = np.linalg.norm(_pl, axis=1) < .045
    _need = float((_rel[_foot] @ MFACE).max()) if _foot.any() else -1.
    MASK_R2 = np.array([.357387, -.183719, 1.145632])                    # the approved round-2 placement (absolute)
    _rel = _ev - MASK_R2; _pl = _rel - np.outer(_rel @ MFACE, MFACE); _foot = np.linalg.norm(_pl, axis=1) < .045
    _need = float((_rel[_foot] @ MFACE).max()) if _foot.any() else -1.
    MASK_C = MASK_R2 + MFACE * max(0., _need + .017 + .004)
    LOG['mask_extra_push_m'] = round(max(0., _need + .021), 4)
    MW, MH = .100, .112                                       # face half-width / half-height (m)
    def mask_rmax(al):
        """star-shaped outline in mask units (x right, y up): an oval with two pointed fox ears and a soft chin"""
        al = np.asarray(al, float); c = np.cos(al); s_ = np.sin(al)
        r = 1 / np.sqrt((c / MW) ** 2 + (s_ / (MH * (1 - .12 * (s_ < 0) * s_ * s_))) ** 2)
        for sg in (-1, 1):
            ea = math.atan2(.188, sg * .074); da = np.angle(np.exp(1j * (al - ea)))
            r = np.maximum(r, .212 * (1 - np.abs(da) / .42).clip(0, 1) ** .55)
        return r
    NAL, NRH = 40, 4
    al = np.linspace(0, 2 * PI, NAL, endpoint=False); rh = np.linspace(0, 1, NRH + 1)[1:]
    RM = mask_rmax(al)
    for _ in range(2): RM = .25 * np.roll(RM, 1) + .5 * RM + .25 * np.roll(RM, -1)
    def mask_dome(x, y):
        w = .034 * (1 - (x / .12) ** 2 - (y / .15) ** 2)
        w = w + .026 * np.exp(-((x / .034) ** 2 + ((y + .040) / .036) ** 2))          # the snout
        return w
    MV = [np.zeros(3)]; MUV = [(0., 0.)]
    for r_ in rh:
        for k in range(NAL):
            x = r_ * RM[k] * math.cos(al[k]); y = r_ * RM[k] * math.sin(al[k]); MV.append(np.array([x, y, 0])); MUV.append((x, y))
    MV = np.array(MV); MUV = np.array(MUV)
    MV[:, 2] = mask_dome(MV[:, 0], MV[:, 1])
    e_ = 1e-4
    gx_ = (mask_dome(MV[:, 0] + e_, MV[:, 1]) - mask_dome(MV[:, 0] - e_, MV[:, 1])) / (2 * e_)
    gy_ = (mask_dome(MV[:, 0], MV[:, 1] + e_) - mask_dome(MV[:, 0], MV[:, 1] - e_)) / (2 * e_)
    MN_l = unit(np.stack([-gx_, -gy_, np.ones(len(MV))], -1))
    MF = [(0, 1 + k, 1 + (k + 1) % NAL) for k in range(NAL)]
    for j in range(NRH - 1):
        for k in range(NAL):
            a0 = 1 + j * NAL + k; b0 = 1 + j * NAL + (k + 1) % NAL; MF.append((a0, a0 + NAL, b0 + NAL, b0))
    MBASIS = np.array([MRIGHT, MUP, MFACE])
    def mask_to_world(P): return MASK_C + P @ MBASIS
    MVw = mask_to_world(MV); MNw = MN_l @ MBASIS
    muv = au('mask', .5 + MUV[:, 0] / .44, .5 + MUV[:, 1] / .44)
    Vt, Ft, UVt, Nt = thicken(MVw, MF, MNw, .034, muv, ramp_uv('cream', .80), ramp_uv('cream', .88), rim=4)
    make_obj('fox_festival_mask', Vt, Ft, UVt, 'mask', N=Nt)
    def paint_mask(U, V):
        x = (U - .5) * .44; y = (V - .5) * .44
        C = mix(rgb('cream'), rgb('creamlight'), .45 * smooth(-.06, .10, y))
        C = mix(C, rgb('creamdark'), .30 * smooth(.07, .12, np.sqrt((x / 1.0) ** 2 + (y / 1.12) ** 2)))
        def almond(px, py, cx, cy, ang, a, b, pw=1.6):
            dx = px - cx; dy = py - cy; ca, sa = math.cos(ang), math.sin(ang)
            u = (dx * ca + dy * sa) / a; v = (-dx * sa + dy * ca) / b
            return np.abs(u) ** pw + np.abs(v) ** 2 / np.maximum(1e-3, 1 - .55 * np.abs(u)) ** 2
        for sg in (-1, 1):
            # green inner ears (rounded triangles) with a darker heart
            er = almond(x, y, sg * .066, .132, sg * -.22, .030, .046, 1.4)
            C = mix(C, rgb('moss'), 1 - smooth(.85, 1.05, er))
            C = mix(C, rgb('dmoss'), .6 * (1 - smooth(.5, .8, er)))
            # slanted almond eye openings: dark moss with a green rim
            ea = almond(x, y, sg * .046, .022, sg * .42, .036, .015, 2.0)
            C = mix(C, rgb('moss'), 1 - smooth(1.0, 1.35, ea))
            C = mix(C, rgb('dmossdark'), 1 - smooth(.80, 1.0, ea))
            # orange cheek flames: a soft swoosh under each eye
            fa = almond(x, y, sg * .062, -.016, sg * -.30, .030, .012, 2.0)
            C = mix(C, rgb('orange'), .92 * (1 - smooth(.85, 1.1, fa)))
            # small green dot above each eye
            C = mix(C, rgb('moss'), 1 - smooth(.8, 1.1, np.sqrt(((x - sg * .036) / .010) ** 2 + ((y - .058) / .010) ** 2)))
        # the forehead flame: an orange teardrop with a darker heart
        fl = almond(x, y, .000, .080, PI / 2, .038, .017, 2.0)
        C = mix(C, rgb('orange'), .95 * (1 - smooth(.85, 1.05, fl)))
        C = mix(C, rgb('#C8622A'), .6 * (1 - smooth(.4, .7, fl)))
        nr = np.sqrt((x / .012) ** 2 + ((y + .046) / .009) ** 2); C = mix(C, rgb('dark'), 1 - smooth(.8, 1.1, nr))
        t = np.clip(np.abs(x) / .030, 0, 1); ml = np.abs(y - (-.062 + .010 * t - .006 * np.sin(PI * t))) < .0024
        C = mix(C, rgb('dark'), .9 * ml * (np.abs(x) < .030))
        C = mix(C, rgb('dark'), .9 * (np.abs(x) < .0022) * (y < -.050) * (y > -.062))
        return C
    # tassel: a knot under the mask's chin and a fat fringe; a cord knot at its top corner against the head
    TQ = mask_to_world(np.array([[.006, -MH - .006, .010]]))[0]
    lobe('mask_tassel_knot', TQ, np.array([.016, .020, .020]), MFACE, 'mask', ramp='mustard', n=3, occ_in=.05)
    for k in range(5):
        o = (k - 2) * .009
        p0 = TQ + MRIGHT * o * .6 - MUP * .012; p1 = TQ + MRIGHT * o - MUP * .060 + MFACE * (.004 - abs(o) * .2); p2 = TQ + MRIGHT * o * 1.3 - MUP * .108
        sweep('mask_tassel_strand.%d' % k, [p0, (p0 + p1) / 2, p1, (p1 + p2) / 2, p2], lambda j: (.0095, .0095), 'mask', ramp_sw('mustard', hi=.30), sides=5)
    lobe('mask_tassel_cap', TQ - MUP * .016, np.array([.020, .022, .014]), -MUP, 'mask', ramp='mustard', n=3, occ_in=.05, pole=MRIGHT)
    CK = mask_to_world(np.array([[-.080, .060, -.006]]))[0]
    lobe('mask_cord_knot', CK, np.array([.022, .024, .024]), MFACE, 'mask', ramp='mustard', n=3, occ_in=.08)
    lobe('mask_cord_knot2', CK + MRIGHT * -.022 + MUP * .012, np.array([.016, .018, .018]), MFACE, 'mask', ramp='mustard', n=3, occ_in=.08)

    # ---------------------------------------------------------------- measurements of the authored parts (metres and fractions of the 1.20 m crown)
    def _vs(prefixes, groups=None):
        out = []
        for g, obs in parts.items():
            if groups and g not in groups: continue
            for o in obs:
                if any(o.name.startswith(p) for p in prefixes): out += [list(o.matrix_world @ v.co) for v in o.data.vertices]
        return np.array(out)
    def _ext(v): return {'min': [round(float(c), 3) for c in v.min(0)], 'max': [round(float(c), 3) for c in v.max(0)], 'size': [round(float(c), 3) for c in np.ptp(v, 0)]}
    _T = 1.20
    _tail = _vs(['black_tail_curl']); _mask = _vs(['fox_festival_mask', 'mask_']); _fuma = _vs(['fuma_'])
    _scroll = _vs(['cream_scroll', 'brown_scroll', 'mustard_scroll']); _top = _vs(['moss_wrapped_top'])
    _shorts = _vs(['dmoss_puffy_shorts']); _collar = _vs(['cream_collar_roll']); _sash = _vs(['mustard_obi_sash'])
    _stail = _vs(['sash_tail']); _knot = _vs(['scarf_knot', 'scarf_tail']); _wrap = _vs(['cream_shin_wrap']); _boot = _vs(['moss_tabi_boot', 'mustard_sole'])
    _armL = _vs(['moss_sleeve.L', 'cream_cuff.L', 'mustard_cuff.L', 'dmoss_forearm_guard.L', 'mustard_guard_band.L', 'black_mitten_paw.L'])
    _pawL = _vs(['black_mitten_paw.L'])
    _chest = _top[np.abs(_top[:, 2] - .56) < .02]
    _tip = _pawL[np.argmax(np.linalg.norm(_pawL - np.array(ARM['L']['shoulder']), axis=1))]
    _mask_face = _vs(['fox_festival_mask'])
    BODY_MEAS = {'body_parts_m': {
        'tail_curl': _ext(_tail), 'tail_across_frac_total': round(float(max(np.ptp(_tail[:, 0]), np.ptp(_tail[:, 2]))) / _T, 3),
        'festival_mask_with_tassel': _ext(_mask), 'mask_face_only': _ext(_mask_face),
        'mask_bbox_frac_total(x,z)': [round(float(np.ptp(_mask[:, 0])) / _T, 3), round(float(np.ptp(_mask[:, 2])) / _T, 3)],
        'mask_lowest_z_m': round(float(_mask[:, 2].min()), 3),
        'fuma_back': _ext(_fuma), 'fuma_across_m': round(float(np.ptp(_fuma[:, 0])), 3), 'fuma_across_frac_total': round(float(np.ptp(_fuma[:, 0])) / _T, 3),
        'scroll': _ext(_scroll), 'scroll_bbox_frac_total(x,z)': [round(float(np.ptp(_scroll[:, 0])) / _T, 3), round(float(np.ptp(_scroll[:, 2])) / _T, 3)],
        'torso_width_at_chest_m': round(float(np.ptp(_chest[:, 0])), 3), 'torso_width_at_chest_W': round(float(np.ptp(_chest[:, 0])) / W, 3),
        'shorts_width_m': round(float(np.ptp(_shorts[:, 0])), 3), 'shorts_width_W': round(float(np.ptp(_shorts[:, 0])) / W, 3),
        'shorts_hem_z_frac': round(float(_shorts[:, 2].min()) / _T, 3),
        'collar_z_frac(front low, top)': [round(float(_collar[:, 2].min()) / _T, 3), round(float(_collar[:, 2].max()) / _T, 3)],
        'sash_z_frac': [round(float(_sash[:, 2].min()) / _T, 3), round(float(_sash[:, 2].max()) / _T, 3)],
        'sash_tails_lowest_frac': round(float(_stail[:, 2].min()) / _T, 3),
        'scarf_knot_tails_z_frac': [round(float(_knot[:, 2].min()) / _T, 3), round(float(_knot[:, 2].max()) / _T, 3)],
        'shin_wraps_z_frac': [round(float(_wrap[:, 2].min()) / _T, 3), round(float(_wrap[:, 2].max()) / _T, 3)],
        'boots_top_frac': round(float(_boot[(np.abs(_boot[:, 0]) > .30)][:, 2].max()) / _T, 3) if (np.abs(_boot[:, 0]) > .30).any() else None,
        'arm_L_paw_tip_m': [round(float(c), 3) for c in _tip],
        'arm_L_torso_edge_to_paw_tip_m': round(float(np.linalg.norm(_tip - torso_pt(np.array([PI / 2 - .25]), np.array([.60]))[0])), 3),
        'arm_angle_from_vertical_deg': ARM_DEG}}

    print('BODY_STEP', 'oints and pivots for the rig phase', flush=True)
    # ---------------------------------------------------------------- joints and pivots for the rig phase
    JOINTS_BODY = {'hips': [0, .004, .360], 'spine': [0, .002, .460], 'chest': [0, .000, .580], 'neck': [0, -.004, .660],
                   'arms': {t: {k: v for k, v in ARM[t].items() if k != 'palm'} for t in ARM}, 'legs': LEG,
                   'tail': [TAIL_PATH[i].tolist() for i in (0, 4, 10, 16, 22, len(TAIL_PATH) - 1)],
                   'palm_R': ARM['R']['palm'], 'palm_L': ARM['L']['palm']}
    BODY_PIVOTS = {'arm.L': tuple(ARM['L']['shoulder']), 'arm.R': tuple(ARM['R']['shoulder']), 'tail': tuple(TAIL_PATH[0]),
                   'body': (0, 0, 0), 'fuma': tuple(FCt), 'mask': tuple(MASK_C)}
    BODY_PAINTERS = {'top': paint_top, 'mask': paint_mask}
    def POST_JOIN():
        joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X'}
        joints.update({k: JOINTS_BODY[k] for k in ('hips', 'spine', 'chest', 'neck')})
        joints['head'] = [float(v) for v in O]
        joints['jaw_pivot'] = [0, float(HY - .30 * W), float(CHIN + .150 * W)]
        joints['eyes'] = {'R': eye_centers['R'], 'L': eye_centers['L']}
        joints['ears'] = {t: {'base': [float(v) for v in ear_info[t]['base']], 'fold': [float(v) for v in ear_info[t]['fold']],
                              'tip': [float(v) for v in ear_info[t]['tip']]} for t in ('R', 'L')}
        joints['arms'] = JOINTS_BODY['arms']; joints['legs'] = JOINTS_BODY['legs']; joints['tail'] = JOINTS_BODY['tail']
        joints['palm_R'] = JOINTS_BODY['palm_R']; joints['palm_L'] = JOINTS_BODY['palm_L']
        joints['fuma_back'] = {'centre': FUMA_MOUNT['centre'], 'facing': FUMA_MOUNT['facing']}
        joints['notes'] = ['Phase 1: no rig, weights or animations. Same keys as chewy-b joints-round13.json, plus palm_R / palm_L and fuma_back.',
                           'head = the head centre (the radial origin), not the nod pivot: the rig should put the head bone at the base of the skull.',
                           'Head skin = zero surface of one smooth implicit ball (squircle skull + bun muzzle + chin + forehead roll + bridge roll + nose), analytic normals, adaptive toon-band refinement.',
                           'Eyelid holes ringed by 6 loops each with the rim rolled 4.5 mm in behind separate lens eyeballs; 3 loops round the mouth, 4 round the nose.',
                           'Ears: separate pieces (Poe_ear_L / _R), 26 bend stations from the buried root over the fold to the tip; pivot = ears.base.',
                           'Tail: Poe_tail, a 34-ring spiral tube (bend loops), pivot = tail[0]. Scarf and sash tails are separate swept islands in Poe_body.',
                           'Shorts are split per leg (two closed islands); limbs carry joint loops at the elbow (sleeve cuff) and the wrist (guard end).',
                           'fuma_back: separate object, pivot = the hub centre; mount in fuma_mount.json. The mask (Poe_mask) is one rigid piece for the head bone.']
        with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
        with open(os.path.join(ROOT, 'fuma_mount.json'), 'w', encoding='utf-8') as f: json.dump(FUMA_MOUNT, f, indent=2)

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
    return (.035 + .15 * np.sin(np.clip(psi, 0, PI)) ** .7 + .07 * np.exp(-((psi - .35) / .35) ** 2)) * smooth(-.25, .20, psi)
PAINT_OPTS = {'band': True, 'blush': True}
def crease(a, b, k): return clamp((np.minimum(a, b) - smin(a, b, k)) / k)
def paint_head(U, V):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = radial_hit(d); n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); zr = q[:, 2]
    fr = smooth(HY + .04, HY - .06, y)
    up = n @ LIGHT
    C = mix(rgb('fur'), rgb('furlight'), .50 * smooth(.35, 1.0, up))                  # a cool sheen on the top planes
    C = mix(C, rgb('furdark'), .45 * smooth(.0, .9, -up))
    # soft clay creases where the forehead roll, bridge roll, muzzle and chin meet the skull (fillet shading, never lines)
    qw = warped(q); dsk = skull(qw)
    cr = .9 * crease(dsk, roll_sdf(qw), K_ROLL) + .7 * crease(dsk, ell(qw, *BRIDGE), K_BR) \
       + .55 * crease(dsk, ell(qw, *MUZ), K_MUZ) + .45 * crease(smin(dsk, ell(qw, *MUZ), K_MUZ), ell(qw, *CHN), K_CHN)
    C = mix(C, rgb('furdark'), clamp(cr) * .55 * fr)
    # the mask: a slightly darker tint over the bun muzzle and chin, with no hard edge
    rm = np.sqrt((((q - np.array(MUZ[0])) / (np.array(MUZ[1]) * np.array([1.18, 1.5, 1.28]))) ** 2).sum(1))
    rj = np.sqrt((((q - np.array(CHN[0])) / (np.array(CHN[1]) * np.array([1.05, 1.4, 1.10]))) ** 2).sum(1))
    C = mix(C, mix(rgb('mask'), rgb('masklight'), .35 * smooth(.3, 1, up)), .55 * (1 - smooth(.70, 1.12, np.minimum(rm, rj * 1.08))) * fr)
    # round 2: soft cool sheen highlights (#4A4450 -> #5A5462) so the forms read on black under the game's toon band
    upf = n @ unit(np.array([-.10, -.55, .83]))
    roll_hi = smooth(.022, -.004, roll_sdf(qw)) * smooth(.10, .70, upf)
    rmt = np.sqrt((((q - (np.array(MUZ[0]) + np.array([0, 0, .040]))) / (np.array(MUZ[1]) * np.array([1.0, 1.2, .62]))) ** 2).sum(1))
    muz_hi = (1 - smooth(.55, 1.0, rmt)) * smooth(.05, .65, upf)
    cheek_hi = sum(np.exp(-(((x - sg * .245 * W) / (.085 * W)) ** 2 + ((z - (CHIN + .172 * W)) / (.034 * W)) ** 2)) for sg in (-1, 1)) * smooth(-.1, .5, upf)
    crown_hi = smooth(.50, .95, n[:, 2]) * smooth(.52, .68, zr)
    C = mix(C, rgb('#5A5462'), clamp(.60 * roll_hi + .55 * muz_hi + .50 * cheek_hi + .45 * crown_hi) * np.maximum(fr, crown_hi))
    C = mix(C, rgb('maskdark'), .30 * smooth(-.02, -.10, zr) * smooth(-.2, -.7, n[:, 2]))      # the under-jaw shade
    # nose button: near-black with a soft top highlight and two small nostrils
    rn = np.sqrt((((q - np.array(NOSE[0])) / np.array(NOSE[1])) ** 2).sum(1))
    nose_c = mix(rgb('#151318'), rgb('#3A3540'), smooth(-.45, .85, n @ unit(np.array([-.10, -.45, 1.]))))
    C = mix(C, nose_c, .97 * (1 - smooth(.95, 1.22, rn)))
    rh_ = np.sqrt((((q - (np.array(NOSE[0]) + np.array([-.010, -.034, .022]))) / np.array([.030, .024, .0115])) ** 2).sum(1))
    C = mix(C, rgb('#8A8494'), .92 * (1 - smooth(.55, 1.0, rh_)) * (rn < 1.15))                   # the crisp top highlight
    for sx in (-1, 1):
        dx_ = q[:, 0] - sx * .034; dz_ = q[:, 2] - (NOSE[0][2] - .014)
        ca_, sa_ = math.cos(sx * .45), math.sin(sx * .45)
        rno = np.sqrt(((dx_ * ca_ + dz_ * sa_) / .019) ** 2 + ((-dx_ * sa_ + dz_ * ca_) / .0095) ** 2) + 9 * (q[:, 1] > NOSE[0][1] - .010)
        C = mix(C, rgb('#09080B'), .92 * (1 - smooth(.75, 1.10, rno)))
    # blush: soft warm dabs under the outer eyes
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .55 * (1 - smooth(.20, 1.05, r)) * fr * PAINT_OPTS['blush'])
    # the closed W mouth, with the small cleft up to the nose
    tm = np.linspace(0, 1, 11)
    lobeL = np.stack([-.004 * W - (MHW - .004 * W) * tm, MZ + .008 * W - .030 * W * np.sin(PI * tm) ** 1.05 + .026 * W * tm ** 3.2], -1)
    lobeR = lobeL * np.array([-1, 1])
    Pm = np.concatenate([lobeL[::-1], lobeR[1:]])
    half = np.full(len(Pm), .0058 * W); half[[0, -1]] = .0030 * W
    Pph = np.array([[0, MZ + .010 * W], [0, NZ - .030 * W]]); hph = np.array([.0050 * W, .0045 * W])
    ib = (fr > 0) & (np.abs(x) < .20 * W) & (z > MZ - .07 * W) & (z < NZ)
    a = np.zeros(len(x)); a[ib] = np.maximum(stroke(x[ib], z[ib], Pm, half, .0030 * W), stroke(x[ib], z[ib], Pph, hph, .0030 * W))
    C = mix(C, rgb('mouth'), .95 * a)
    # the thick upper lash line round the eye opening (and a thin soft lower rim)
    for s in (-1, 1):
        sr, psi, X, Z = eye_s(s, x, z)
        near_eye = fr * (sr < 1.8)
        th = lash_th(psi)
        lash = (1 - smooth(1 + th - .015, 1 + th + .015, sr)) * PAINT_OPTS['band']
        low = (1 - smooth(1.03, 1.075, sr)) * smooth(.10, -.40, np.sin(psi))
        C = mix(C, rgb('lash'), np.maximum(lash, .55 * low) * near_eye)
    return C.reshape(sh + (3,))

def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .29; iz = .05; irx = .69; irz = .88          # iris 69 % of the opening, tucked toward the nose
    C = mix(rgb('sclera'), rgb('#E9DCD2'), .50 * smooth(.48, .98, Z))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    g = smooth(.60, -.85, ez)
    I = mix(rgb('#5A3412'), rgb('#9A6024'), smooth(0., .40, g))
    I = mix(I, rgb('iris'), smooth(.30, .72, g))
    I = mix(I, rgb('#EDB65A'), .80 * smooth(.66, 1.0, g) * (1 - smooth(.82, .96, r)))     # the bright lower honey band
    I = mix(I, rgb('#3E220C'), .70 * smooth(.84, 1.0, r))                                  # the darker rim
    I = I * (1 - .035 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 30 + r * 10)) * smooth(.4, .8, r))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    pz = iz + .05 * irz; R = np.sqrt(((X - ix) / (.74 * irx)) ** 2 + ((Z - pz) / (.74 * irz)) ** 2)
    C = mix(C, rgb('pupil'), 1 - smooth(.95, 1.05, R))
    # two catchlights, the same screen side on both eyes (as on the sheet): big upper-right, small lower-left
    hx = ix + .28 * irx; hz = pz + .38 * irz
    big = np.sqrt(((X - hx) / (.22 * irx)) ** 2 + ((Z - hz) / (.20 * irz)) ** 2)
    small = np.sqrt(((X - (ix - .30 * irx)) / (.085 * irx)) ** 2 + ((Z - (pz - .36 * irz)) / (.075 * irz)) ** 2)
    C = mix(C, rgb('#FFFBF4'), np.maximum(1 - smooth(.94, 1.06, big), .85 * (1 - smooth(.90, 1.10, small))))
    C = mix(C, rgb('lash'), smooth(.92, 1.0, sr) * smooth(-.10, .40, Z))
    C = mix(C, rgb('#3A3238'), .55 * smooth(.95, 1.02, sr) * smooth(.0, -.40, Z))
    return C

def paint_ramp(U, V):
    rows = np.clip((V * CHARTS['ramp'][3] / 32).astype(int), 0, 15); C = np.zeros(U.shape + (3,))
    for name, k in RAMP_ROWS.items():
        m = rows == k
        if not m.any(): continue
        lo, base, hi = [rgb(c) for c in RAMPS[name]]
        u = U[m]; C[m] = np.where((u < .5)[:, None], mix(lo, base, smooth(0, .5, u)), mix(base, hi, smooth(.5, 1, u)))
    return C
PAINTERS = {'head': paint_head, 'eye.L': lambda U, V: paint_eye(U, V, 1), 'eye.R': lambda U, V: paint_eye(U, V, -1), 'ramp': paint_ramp}
PAINTERS.update(BODY_PAINTERS)
if RIG:
    PAINTERS['cavity'] = lambda U, V: mix(rgb('#3a1418'), rgb('#2a0e12'), .5 * smooth(.3, 1, V))
    PAINTERS['tongue'] = lambda U, V: mix(rgb('#e07a86'), rgb('#ec96a0'), .5 * smooth(.2, .9, V))
atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [46, 42, 48, 255]
for name, (x0, y0, w, h) in CHARTS.items():
    if name not in PAINTERS: continue
    print('PAINT', name, flush=True)
    if name == 'ramp':
        U, V = np.meshgrid(clamp((np.arange(w) - 8) / (w - 16)), (np.arange(h) + .5) / h)
    else:
        U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
    block = np.empty((h, w, 3))
    for r0 in range(0, h, 128):
        block[r0:r0 + 128] = PAINTERS[name](U[r0:r0 + 128], V[r0:r0 + 128])
    atlas[y0:y0 + h, x0:x0 + w, :3] = np.round(clamp(block) * 255).astype(np.uint8)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
atlas_path = os.path.join(ROOT, 'scratch', 'head_atlas.png') if HEAD_ONLY else (os.path.join(ROOT, 'scratch', 'rig_base_atlas.png') if RIG else os.path.join(ROOT, 'poe-toy_atlas.png'))
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Poe_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Poe_toy_atlas'); MAT.use_nodes = True
bs = MAT.node_tree.nodes.get('Principled BSDF'); bs.inputs['Roughness'].default_value = .8
bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .25
tx = MAT.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
MAT.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])

# ============================================================== MEASURE (before joining)
def all_verts(obs): return np.array([list(o.matrix_world @ v.co) for o in obs for v in o.data.vertices])
nose_tip_y = HY + NOSE_TIP_L * W
def prof_at(zw, xw=0.): return round(float((front_hit(xw * W, CHIN + zw * W)[0] - nose_tip_y) / W), 3)
rimL = np.array([verts[i] for i in roll_info[1][0]])
cheek_rows = {}
for zw in (.0, .04, .09, .13, .20, .25, .32, .40, .50, .60, .66):
    xs_ = np.linspace(0, .7, 351)
    ys_ = front_local(xs_, np.full(len(xs_), zw), head_local); ok = np.isfinite(ys_)
    cheek_rows['%.2f' % zw] = round(float(2 * xs_[ok].max()), 3) if ok.any() else None
MEAS = {'units': 'W = %.3f m head width; z = above the chin in W; profile b = behind the nose tip in W' % W,
        'chin_z_m': CHIN, 'crown_m': LOG['crown_m'], 'head_height_W': round((LOG['crown_m'] - CHIN) / W, 3),
        'face_width_rows_W(z: width)': cheek_rows,
        'nose_tip_y_m': round(float(nose_tip_y), 4),
        'profile_b(z)': {'%.3f' % zw: prof_at(zw) for zw in (.011, .032, .054, .076, .097, .119, .141, .162, .20, .267, .30, .336, .40, .44, .487, .53, .552, .574, .595, .617, .64, .66, .682)},
        'eye_white_front_edge_b': round(float((rimL[:, 1].min() - nose_tip_y) / W), 3),
        'eye_opening_W': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'eye_centre_W': [EXW, EZW], 'nose_z_W': NZW, 'nose_top_z_W': round(NOSE[0][2] + NOSE[1][2], 3), 'nose_width_W': round(2 * NOSE[1][0], 3),
        'mouth_z_W': MZW, 'mouth_width_W': round(2 * MHW / W, 3)}
for tag in ('L', 'R'):
    if 'ear.' + tag in parts:
        ev = all_verts(parts['ear.' + tag])
        MEAS['ear_' + tag] = {'x_min_W': round(float(ev[:, 0].min() / W), 3), 'x_max_W': round(float(ev[:, 0].max() / W), 3),
                              'b_min': round(float((ev[:, 1].min() - nose_tip_y) / W), 3), 'b_max': round(float((ev[:, 1].max() - nose_tip_y) / W), 3),
                              'z_min_W': round(float((ev[:, 2].min() - CHIN) / W), 3), 'z_max_W': round(float((ev[:, 2].max() - CHIN) / W), 3)}
MEAS.update(LOG)
MEAS.update(globals().get('BODY_MEAS', {}))

# ============================================================== JOIN, CLEAN, NORMALS
objects = []; part_tri = {}
PIVOTS = {'head': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'],
          'ear.L': tuple(ear_info['L']['base']), 'ear.R': tuple(ear_info['R']['base'])}
PIVOTS.update(BODY_PIVOTS)
OBJ_TRIS = {}
for group, obs in parts.items():
    for ob in obs: ob.data.calc_loop_triangles(); OBJ_TRIS[ob.name] = len(ob.data.loop_triangles)
print('OBJ_TRIS', json.dumps(dict(sorted(OBJ_TRIS.items(), key=lambda kv: -kv[1])[:50])), flush=True)
OBJ_NAMES = {'fuma': 'fuma_back'}
for group, obs in parts.items():
    for ob in obs:
        ob.data.materials.clear(); ob.data.materials.append(MAT)
        if RIG:
            vg = ob.vertex_groups.new(name='_part_' + ob.name); vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs: ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1: bpy.ops.object.join()
    ob = bpy.context.object; ob.name = OBJ_NAMES.get(group, 'Poe_' + group.replace('.', '_')); ob.data.name = ob.name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-8)
    bad = [f for f in bm.faces if f.calc_area() < 1e-12]
    if bad: bmesh.ops.delete(bm, geom=bad, context='FACES')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(ob.data); bm.free()
    me = ob.data
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    if me.attributes.get('cust_n') is not None:
        a = me.attributes.get('cust_n')
        sn = np.zeros(len(me.vertices) * 3, np.float32); a.data.foreach_get('vector', sn); sn = sn.reshape(-1, 3)
        cn = np.zeros(len(me.loops) * 3, np.float32); me.corner_normals.foreach_get('vector', cn); cn = cn.reshape(-1, 3)
        lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
        use = np.linalg.norm(sn[lv], axis=1) > .5; cn[use] = sn[lv][use]
        me.normals_split_custom_set([tuple(v) for v in cn]); me.attributes.remove(me.attributes['cust_n'])
    bpy.context.scene.cursor.location = PIVOTS.get(group, (0, 0, 0)); bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); assert np.isfinite(co).all(), 'Nonfinite position'
    for p in me.polygons: assert all(math.isfinite(c) for c in p.normal) and p.normal.length > .5, ('Bad normal', ob.name, p.index)
    ob['phase'] = '1: neutral A-pose, no armature'; ob['front_axis'] = '-Y'; ob['units'] = 'metres'
    me.calc_loop_triangles(); part_tri[ob.name] = len(me.loop_triangles); objects.append(ob)
tri_count = sum(part_tri.values()); print('PART_TRIANGLES', json.dumps(part_tri), flush=True)
HEADSET = sum(v for k, v in part_tri.items() if k in ('Poe_head', 'Poe_eye_L', 'Poe_eye_R', 'Poe_ear_L', 'Poe_ear_R', 'Poe_mask'))
MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count; MEAS['head_face_eyes_ears_mask_triangles'] = HEADSET
if RIG:
    pass
elif not HEAD_ONLY:
    if not os.environ.get('POE_NO_BUDGET'): assert tri_count <= 30000, ('Triangle budget', tri_count)
    POST_JOIN = globals().get('POST_JOIN')
    if POST_JOIN: POST_JOIN()
    with open(os.path.join(ROOT, 'measurements.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-head.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
if not RIG: print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not HEAD_ONLY and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'poe-toy.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG:
    bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                              export_animations=False)
print('POE_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
