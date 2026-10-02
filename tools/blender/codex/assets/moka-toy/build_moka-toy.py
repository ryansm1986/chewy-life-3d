"""Moka / Star Scholar (Toybox line), phase-1 model. Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_moka-toy.py [-- --head-only]

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder and
public/models/moka-toy.glb (--head-only writes scratch/moka-head-test.glb instead).

Technique (after the Rosie / Shadow builds):
- The head is ONE smooth signed-distance ball (cranium + low cheek mass + toy muzzle + chin + a hidden
  fill under the hat + nose button) with a smooth set-in socket warp for each eye. Its skin is the field's
  zero surface reached by radial projection, so every vertex lies on the field and carries its analytic
  normal: no creases or dents. Eyelid holes are ringed by edge loops; the eyes are separate lens globes.
- Ears, topknot, tail and nape curls are merged clay lobes (cube-spheres with analytic normals).
- The hat is a lathed band, a swept cone that bends over to her left, and a drooping "bell" brim
  thickened into a solid with a rolled edge; reading glasses and a moon charm ride on it.
- Robe panels are parametric surfaces thickened into closed shells (gold rim), painted in parameter space.
- Limbs, paws and feet are SDF ring stacks (rings = joint loops) with exact field normals.
- One 2048 painted atlas: the face and eyes painted from 3D positions, 2D charts for the robe, and
  1-D shading ramps for the clay parts.
"""
import bpy, bmesh, math, json, os, sys, struct, zlib
import numpy as np
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HEAD_ONLY = '--head-only' in ARGV
RIG = bool(globals().get('RIG_MODE'))      # set by rig_moka-toy.py: part labels + lid / mouth charts; no approved file is written
MODEL = 'D:/projects/chewy-life-3d/public/models/moka-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'moka-head-test.glb') if HEAD_ONLY else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(5)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
W = .486; CHIN = .688; HY = -.047          # face width (sheet: 154 px at 317 px/m), chin height, head centre y
LOG = {}

PAL = {'fur': '#7a4a34', 'furlight': '#94603f', 'furdark': '#5a3624',
       'curl': '#8c5a40', 'curllight': '#a87252', 'curldark': '#5c3524',
       'muzzle': '#8c5a40', 'nose': '#4a2418', 'nosehi': '#8e5c4a',
       'sclera': '#fff6e8', 'iris': '#e8a93a', 'irisring': '#b8741e', 'iristop': '#c88624', 'pupil': '#211811',
       'lash': '#211811', 'brow': '#4e2c1e', 'mouth': '#3c1f15', 'blush': '#d98d7e',
       'hat': '#3fb0a0', 'hatlight': '#62cbb9', 'hatdark': '#2a8a7e',
       'band': '#8a6ad8', 'bandlight': '#a387ea', 'banddark': '#6a4fb8',
       'gold': '#f4c04a', 'goldlight': '#ffe08c', 'golddark': '#c98f26',
       'stole': '#4fc4b4', 'stolelight': '#78dccb', 'stoledark': '#35a093',
       'robe': '#b8a4e8', 'robelight': '#cdbdf4', 'robedark': '#9783cc',
       'skirt': '#a894dc', 'skirtlight': '#baa8e8', 'skirtdark': '#8a76c0',
       'lining': '#a08cd6',
       'leather': '#603a26', 'leatherlight': '#7c5038', 'leatherdark': '#432617',
       'duck': '#ffd24a', 'ducklight': '#ffe88e', 'duckdark': '#e3a62c',
       'bill': '#e99536', 'billlight': '#f6b25a', 'billdark': '#c87420',
       'lens': '#8f8ee6', 'lenslight': '#e6e6ff', 'lensdark': '#5e5cc0',
       'dark': '#2c1e18'}
# 2048 atlas charts (x, y, w, h) in pixels, y up (Blender UV convention)
CHARTS = {'head': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'lining': (1280, 768, 512, 384),
          'robe': (0, 0, 1024, 768), 'sleeve': (1280, 384, 512, 384), 'ear.L': (1024, 0, 256, 768), 'ear.R': (1792, 384, 256, 768),
          'bodice': (1280, 128, 512, 256), 'band2': (1792, 128, 256, 256), 'spare': (1280, 0, 768, 128)}
RAMPS = {'curl': ('curldark', 'curl', 'curllight'), 'fur': ('furdark', 'fur', 'furlight'), 'hat': ('hatdark', 'hat', 'hatlight'),
         'band': ('banddark', 'band', 'bandlight'), 'gold': ('golddark', 'gold', 'goldlight'), 'lens': ('lensdark', 'lens', 'lenslight'),
         'stole': ('stoledark', 'stole', 'stolelight'), 'leather': ('leatherdark', 'leather', 'leatherlight'),
         'duck': ('duckdark', 'duck', 'ducklight'), 'bill': ('billdark', 'bill', 'billlight'), 'robe': ('robedark', 'robe', 'robelight'),
         'skirt': ('skirtdark', 'skirt', 'skirtlight'), 'dark': ('dark', 'dark', '#4a3428'), 'nose': ('#2e160e', 'nose', 'nosehi'),
         'muzzlefur': ('furdark', 'muzzle', 'curllight'), 'lining': ('#7e6ab4', 'lining', 'robe')}
RAMP_ROWS = {k: i for i, k in enumerate(RAMPS)}
if RIG:   # phase-2 charts in unused atlas space (the approved paint is untouched)
    CHARTS.update({'cavity': (1792, 256, 128, 128), 'tongue': (1920, 256, 128, 128), 'lidU': (1280, 0, 768, 128), 'lidD': (1792, 128, 256, 128)})   # lid charts are transposed: texel x runs along the arc

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
    """painted soft shading value for the ramps: 0.5 = base colour, lighter toward the key-light, darker below"""
    d = np.asarray(n) @ LIGHT
    return clamp(.50 + hi * smooth(.0, .95, d) - lo * smooth(.05, .95, -d) - occ)

# ============================================================== mesh plumbing
parts = {}
def make_obj(name, V, F, UV, group, N=None):
    """V (n,3); F list of index tuples; UV per-vertex atlas uv (n,2) or a per-face list of uv tuples; N (n,3)"""
    V = np.asarray(V, float)
    me = bpy.data.meshes.new(name); me.from_pydata(V.tolist(), [], [tuple(int(i) for i in f) for f in F]); me.update()
    uvl = me.uv_layers.new(name='Atlas')
    lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
    if isinstance(UV, list):
        uvs = np.array([c for f in UV for c in f], float)
    else:
        uvs = np.asarray(UV, float)[lv]
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
    """rings P (R, C, 3) wrapped in u; optional pole vertices (point, normal, uv) at each end"""
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
    """turn an open surface (outer-facing normals N) into a closed shell: outer, inner, rounded rim along every boundary"""
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
    """natural cubic spline through (X, Y); returns f(x) (vectorised, clamped to the ends)"""
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

def lobe(name, c, r, out, group, ramp='curl', n=5, squash=.10, occ_in=.30, sheen=1.0, base_occ=0., pole=None):
    """a closed clay lobe: cube-sphere mapped onto a squashed ellipsoid (no poles), analytic normals, ramp shading.
    r = radii along (out, e3, pole); pole = optional long-axis direction"""
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

def frames(path, up_hint=None, normals=None):
    """tangents and a rotation-minimising frame along a polyline (or given normals)"""
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

def sweep(name, path, prof_r, group, uvfn, sides=16, cap0=True, cap1=True, up_hint=None, normals=None, rr=None, p=1.0):
    """a tube along a path; prof_r(k) -> (rx, ry) radii in the (N, B) frame; rounded caps; uvfn(normals, ring_t, side_u) -> uv"""
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

def star_mesh(name, sdf, centre, group, uvfn, nth=16, nph=24, tmax=.3, axis=(0, 0, 1.), ref=(1., 0, 0)):
    """a closed star-shaped surface: outermost root of sdf along rays from centre on a lat-long grid, field normals"""
    c = np.asarray(centre, float); ax_ = unit(np.asarray(axis, float)); r0 = unit(np.asarray(ref, float) - ax_ * (np.asarray(ref) @ ax_)); b0 = np.cross(ax_, r0)
    th = np.linspace(0, PI, nth + 1)[1:-1]; ph = np.linspace(0, 2 * PI, nph, endpoint=False)
    TT, PP = np.meshgrid(th, ph, indexing='ij')
    D = np.cos(TT)[..., None] * ax_ + np.sin(TT)[..., None] * (np.cos(PP)[..., None] * r0 + np.sin(PP)[..., None] * b0)
    Dall = np.concatenate([D.reshape(-1, 3), [ax_, -ax_]])
    P = ray_outer(sdf, c, Dall, tmax); N = grad(sdf, P)
    R = nth - 1; Pg = P[:-2].reshape(R, nph, 3); Ng = N[:-2].reshape(R, nph, 3)
    V, F, _, NN = closed_grid(Pg, Ng, np.zeros((R, nph, 2)), (P[-2], N[-2], [0, 0]), (P[-1], N[-1], [0, 0]))
    return make_obj(name, V, F, uvfn(NN, V), group, N=NN)

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
name_hint = ['']
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
def ring_stack(name, sdf, centres, axisdirs, group, uvfn, sides=16, tmax=.2, pole_end=True, pole_start=True, ref=None):
    """rings of outermost roots around each centre, in the plane normal to axisdirs; poles close the ends"""
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

# ============================================================== the head ball (SDF, W units, z above chin, y from HY)
def ell(q, c, r):
    q = (q - np.asarray(c)) / np.asarray(r)
    k0 = np.sqrt((q * q).sum(-1)); k1 = np.sqrt(((q / np.asarray(r)) ** 2).sum(-1))
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)
def smin(a, b, k):
    h = np.clip(.5 + .5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)

BLOB = {'C': [[0, .020, .470], [.470, .490, .425]],     # cranium
        'K': [[0, -.030, .250], [.505, .440, .265]],    # low cheek mass: widest (1.0 W) 0.25 W above the chin
        'B': [[0, -.170, .700], [.230, .300, .170]],    # soft brow mass: the forehead stands up over the eyes
        'L': [[0, -.120, .118], [.400, .320, .128]],    # full round lower cheeks (the face is a ball to the jaw)
        'M': [[0, -.459, .205], [.215, .168, .135]],    # short toy muzzle ball
        'J': [[0, -.414, .072], [.170, .150, .098]]}    # soft chin under it
K_CK, K_B, K_L, K_M, K_J = .15, .10, .08, .060, .050
TILT = math.radians(25)                                  # the hat is tipped back
HAT_O = np.array([0, .200, .730])                        # (round 2: +0.03 W so the raised brows and topknot fit under the brim)                        # band base centre (W, head local)
EU = np.array([0, math.sin(TILT), math.cos(TILT)]); EB = np.array([0, math.cos(TILT), -math.sin(TILT)]); EXA = np.array([1., 0, 0])
def to_hat(q): d = np.asarray(q) - HAT_O; return np.stack([d @ EXA, d @ EB, d @ EU], -1)
def from_hat(h):
    h = np.asarray(h, float); return HAT_O + h[..., 0:1] * EXA + h[..., 1:2] * EB + h[..., 2:3] * EU
FILL = [[0, 0, -.075], [.465, .465, .205]]; K_F = .06     # hidden fill: the head reaches up into the hat band
def base_local(q, fill=True):
    d = ell(q, *BLOB['C']); d = smin(d, ell(q, *BLOB['K']), K_CK); d = smin(d, ell(q, *BLOB['B']), K_B); d = smin(d, ell(q, *BLOB['L']), K_L)
    d = smin(d, ell(q, *BLOB['M']), K_M); d = smin(d, ell(q, *BLOB['J']), K_J)
    return smin(d, ell(to_hat(q), *FILL), K_F) if fill else d
_yy, _zz = np.meshgrid(np.linspace(-.8, .8, 641), np.linspace(-.25, .25, 501))
_q = np.stack([np.zeros_like(_yy), _yy, _zz], -1).reshape(-1, 3)
ZMIN = float(_q[base_local(_q) < 0][:, 2].min())
for k in BLOB: BLOB[k][0][2] -= ZMIN
HAT_O[2] -= ZMIN
LOG['skull_zmin_shift_W'] = ZMIN

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

# eye layout (W units)
EXW, EZW, EHWW, EHHW, EN = .265, .460, .150, .156, 2.15
RECESS = dict(delta=.056, F_out=.20, F_nas=.075, F_up=.11, F_dn=.085)
def eye_recess(q):
    """the set-in socket: constant depth over each opening, C2 falloff outside it (wide outward, short on the nose side)"""
    x, y, z = q[..., 0], q[..., 1], q[..., 2]; tot = 0
    for s in (-1, 1):
        X = s * (x - s * EXW) / EHWW; Z = (z - EZW) / EHHW
        sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN) + 1e-9
        c = X / sr; sn = Z / sr
        dout = (sr - 1) * np.sqrt((EHWW * c) ** 2 + (EHHW * sn) ** 2)
        F = np.sqrt((np.where(c > 0, RECESS['F_out'], RECESS['F_nas']) * c) ** 2 + (np.where(sn > 0, RECESS['F_up'], RECESS['F_dn']) * sn) ** 2)
        tot = np.maximum(tot, 1 - smoother(.015, .015 + F, dout))
    return tot * smooth(-.15, -.32, y)
NZW = .270
_yf = float(front_local(0, NZW, base_local)[0])
NOSE = [[0, _yf + .045 - .032, NZW], [.072, .045, .052]]; K_N = .016       # rounded liver button, 0.14 x 0.10 W
NECK = [[0, .060, -.230], [.205, .175, .230]]; K_NECK = .08
def head_local(q, neck=True, fill=True):
    qw = np.array(q, float, copy=True); qw[..., 1] = q[..., 1] - RECESS['delta'] * eye_recess(q)
    d = base_local(qw, fill)
    if neck: d = smin(d, ell(q, *NECK), K_NECK)
    return smin(d, ell(q, *NOSE), K_N)
NOSE_TIP_L = float(front_local(0, NZW, head_local)[0])
def L2M(q): return np.stack([q[..., 0] * W, HY + q[..., 1] * W, CHIN + q[..., 2] * W], -1)
def M2L(p): return np.stack([p[..., 0] / W, (p[..., 1] - HY) / W, (p[..., 2] - CHIN) / W], -1)
def head_sdf(p): return head_local(M2L(p)) * W
def front_hit(x, z, f=head_sdf):
    return HY + W * front_local(np.asarray(x) / W, (np.asarray(z) - CHIN) / W, lambda q: f(L2M(q)) / W)
O = np.array([0, HY + .02 * W, CHIN + .36 * W])
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
def behind(b): return HY + (NOSE_TIP_L + b) * W     # b W behind the nose tip -> y metres
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
def in_hat(P):
    """inside the hat band / cone footprint (hidden skin)"""
    h = to_hat(M2L(P)); return (h[:, 2] > -.02) & (np.hypot(h[:, 0], h[:, 1]) < .47)

# ============================================================== face layout (front projection, metres)
EX = EXW * W; EZ = CHIN + EZW * W; EHW = EHWW * W; EHH = EHHW * W
def eye_unit(psi):
    c = np.cos(psi); s = np.sin(psi); return spow(c, 2 / EN), spow(s, 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
NZ = CHIN + NZW * W; MZ = CHIN + .160 * W; MHW = .140 * W
BROW_Z = CHIN + .755 * W; BROW_X = .240 * W
BLUSH = (.370 * W, CHIN + .245 * W, .115 * W, .088 * W)

# ============================================================== HEAD SKIN: CDT on the ball, eyelid / nose / mouth loops
pts = []; cons = []; tags = {}
def add_loop(P, tag, closed=True):
    i0 = len(pts); pts.extend([tuple(p) for p in P]); n = len(P)
    for i in range(n if closed else n - 1): cons.append((i0 + i, i0 + (i + 1) % n))
    tags[tag] = list(range(i0, i0 + n)); return tags[tag]
def surf_dir(x, z):
    y = front_hit(x, z); return unit(np.stack([np.asarray(x, float) * np.ones_like(y), y, np.asarray(z, float) * np.ones_like(y)], -1) - O)

NE = 44
EYE_SCALES = [1.0, 1.085, 1.18, 1.29, 1.41, 1.52]
eye_dom = {}
for s in (-1, 1):
    psi = np.linspace(0, 2 * PI, NE, endpoint=False)
    x, z = eye_xz(s, psi); base = to_dom(surf_dir(x, z)); c = to_dom(surf_dir(np.array([s * EX]), np.array([EZ])))[0]
    eye_dom[s] = (c, base)
    wn = (1 - .55 * smooth(-.10, -.80, np.cos(psi))) * (1 - .40 * smooth(-.20, -.90, np.sin(psi)))   # tighter toward the nose and the muzzle
    for k, kk in enumerate(EYE_SCALES): add_loop(c + (base - c) * (1 + (kk - 1) * wn[:, None]), 'eye%d_%d' % (s, k))
pts.append(tuple(to_dom(surf_dir(np.array([0.]), np.array([NZ])))[0])); tags['nose_c'] = [len(pts) - 1]
for k, (rx, rz, n) in enumerate([(.026, .019, 10), (.050, .035, 16), (.074, .051, 22), (.094, .064, 28)]):
    a = np.linspace(0, 2 * PI, n, endpoint=False) + .3 * k
    add_loop(to_dom(surf_dir(rx * W * np.cos(a), NZ + .004 * W + rz * W * np.sin(a))), 'nose_%d' % k)
for k, (hx, hz) in enumerate([(.155, .024), (.170, .033), (.186, .042)]):
    a = np.linspace(0, 2 * PI, 44, endpoint=False)
    add_loop(to_dom(surf_dir(hx * W * spow(np.cos(a), .8), MZ + hz * W * np.sin(a))), 'mouth_%d' % k)
NB = 60; AB = math.radians(122)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
def fib(nf, amax):
    ii = np.arange(nf) + .5; phi = np.arccos(1 - 2 * ii / nf); th = PI * (1 + 5 ** .5) * ii
    D = np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
    return D[np.arccos(np.clip(-D[:, 1], -1, 1)) < amax]
D = fib(1450, math.radians(118.5)); Pf = radial_hit(D)
# a finer fill over the eye / brow / bridge band and the muzzle, where the face bends most
D2 = fib(4150, math.radians(72)); P2 = radial_hit(D2)
def fine_zone(P):
    q = M2L(P)
    return (((np.abs(q[:, 0]) < .48) & (q[:, 2] > .20) & (q[:, 2] < .82)) | ((np.abs(q[:, 0]) < .28) & (q[:, 2] > -.02) & (q[:, 2] < .40))) & (P[:, 1] < HY)
D = np.concatenate([D[~fine_zone(Pf)], D2[fine_zone(P2)]]); Pf = np.concatenate([Pf[~fine_zone(Pf)], P2[fine_zone(P2)]])
# the chin, under-jaw and neck: rays from the head centre graze them, so they get a regular grid sampled from the front
gx, gz = np.meshgrid(np.linspace(-.24, .24, 21) * W, CHIN + np.linspace(-.16, .07, 13) * W)
gx = gx.ravel(); gz = gz.ravel(); gy = front_hit(gx, gz); okg = np.isfinite(gy)
G = np.stack([gx, gy, gz], -1)[okg]; Dg = unit(G - O)
zone = (np.abs(Pf[:, 0]) < .25 * W) & (Pf[:, 2] < CHIN + .075 * W) & (Pf[:, 1] < HY - .02)
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
keep &= ~(front & ((Pf[:, 0] / (.108 * W)) ** 2 + ((Pf[:, 2] - NZ - .004 * W) / (.074 * W)) ** 2 < 1))
keep &= ~(front & ((Pf[:, 0] / (.212 * W)) ** 2 + ((Pf[:, 2] - MZ) / (.060 * W)) ** 2 < 1))
hidden = in_hat(Pf)
keep &= ~hidden | (np.arange(len(D)) % (10 if RIG else 5) == 0)     # a fifth of the density inside the hat (a tenth for the rig's face budget)
pts.extend([tuple(p) for p in dom[keep]])
res = delaunay_2d_cdt([Vector(p) for p in pts], cons, [], 0, 1e-9)
vout, eout, fout, orig_v = res[0], res[1], res[2], res[3]
if len(vout) != len(pts):
    def segs(tag):
        L = np.array([pts[i] for i in tags[tag]]); return L, np.roll(L, -1, 0)
    def xing(A0, A1, B0, B1):
        d1 = A1 - A0; d2 = B1 - B0
        den = d1[:, None, 0] * d2[None, :, 1] - d1[:, None, 1] * d2[None, :, 0]
        w = B0[None, :, :] - A0[:, None, :]
        ta = (w[..., 0] * d2[None, :, 1] - w[..., 1] * d2[None, :, 0]) / (den + 1e-30)
        tb = (w[..., 0] * d1[:, None, 1] - w[..., 1] * d1[:, None, 0]) / (den + 1e-30)
        return ((ta > 0) & (ta < 1) & (tb > 0) & (tb < 1)).sum()
    tl = [t for t in tags if t != 'nose_c']
    for i in range(len(tl)):
        for j in range(i + 1, len(tl)):
            A0, A1 = segs(tl[i]); B0, B1 = segs(tl[j]); k = xing(A0, A1, B0, B1)
            if k: print('LOOP_XING', tl[i], tl[j], k, flush=True)
    # fill points too close to a loop
    allp = np.array(pts); print('NPTS', len(pts), 'NOUT', len(vout), flush=True)
assert len(vout) == len(pts), ('CDT added or merged vertices: constraint loops intersect', len(vout), len(pts))
out_of = {}
for oi, lst in enumerate(orig_v):
    for k in lst: out_of[k] = oi
dom_out = np.array([[v.x, v.y] for v in vout])
def in_poly(P, poly):
    x = P[:, 0]; y = P[:, 1]; inside = np.zeros(len(P), bool); n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        inside ^= ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-30) + x1)
    return inside
Fh = np.array([list(f) for f in fout]); cent = dom_out[Fh].mean(1); hole = np.zeros(len(Fh), bool)
for s in (-1, 1):
    hole |= in_poly(cent, dom_out[[out_of[k] for k in tags['eye%d_0' % s]]])
Fh = Fh[~hole]
if RIG:
    # phase 2 (toon light), as Rosie's rig build: the game's hard light / shade band follows the normal interpolated across
    # each triangle, and its misplacement on the skin is (interpolation error) / (how fast the normal turns there). Coarsen
    # where the band is placed exactly anyway, then insert centroids in the triangles whose band displacement is largest
    # (deterministic). The surface itself is unchanged: every vertex still sits on the SDF with its analytic normal.
    from mathutils.kdtree import KDTree
    fill0 = len(pts) - int(keep.sum())
    def skin_cdt(pts):
        res = delaunay_2d_cdt([Vector(p) for p in pts], cons, [], 0, 1e-9)
        vout, fout, orig_v = res[0], res[2], res[3]
        assert len(vout) == len(pts), ('CDT added or merged vertices', len(vout), len(pts))
        out_of = {}
        for oi, lst in enumerate(orig_v):
            for k in lst: out_of[k] = oi
        dom_out = np.array([[v.x, v.y] for v in vout]); F = np.array([list(f) for f in fout])
        cent = dom_out[F].mean(1); hole = np.zeros(len(F), bool)
        for s in (-1, 1):
            hole |= in_poly(cent, dom_out[[out_of[k] for k in tags['eye%d_0' % s]]])
        return dom_out, F[~hole], out_of
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
        nm = unit(Nt.mean(1)); seen = np.maximum(-nm[:, 1], -.707 * nm[:, 1] + .707 * nm[:, 2]) > .05   # front or the 45 deg game camera
        vis = (Pt[:, :, 1] < HY + .01).all(1) & ~in_hat(Pt.mean(1)) & (Pt[:, :, 2] > CHIN - .14 * W).all(1) & seen
        err = np.zeros(len(F)); disp = np.zeros(len(F)); idx = np.where(vis)[0]
        q = np.einsum('kj,tjc->tkc', BARY, Pt[idx]); nq = np.einsum('kj,tjc->tkc', BARY, Nt[idx])
        nq /= np.linalg.norm(nq, axis=2, keepdims=True); d = unit((q - O).reshape(-1, 3))
        sp = radial_hit_outer(d)
        le = np.max([np.linalg.norm(Pt[idx, i] - Pt[idx, (i + 1) % 3], axis=1) for i in range(3)], 0)
        fold = np.linalg.norm(sp.reshape(q.shape) - q, axis=2).max(1) > np.maximum(.002, .3 * le)   # chords across a fold
        qq = q.reshape(-1, 3).copy()
        for _ in range(3): qq = qq - head_sdf(qq)[:, None] * grad_n(qq)                 # closest point on the skin
        a_ = grad_n(qq).reshape(q.shape)
        e = np.arccos(np.clip((a_ * nq).sum(2), -1, 1)).max(1)
        kap = np.full(len(idx), 2.0)
        for i, j in ((0, 1), (1, 2), (2, 0)):
            ang_ = np.arccos(np.clip((Nt[idx, i] * Nt[idx, j]).sum(1), -1, 1)); ln = np.linalg.norm(Pt[idx, i] - Pt[idx, j], axis=1)
            kap = np.maximum(kap, ang_ / np.maximum(ln, 1e-5))
        err[idx] = np.degrees(e); disp[idx] = e / kap * 1000          # mm the light / shade band can be displaced
        vis[idx[fold]] = False
        return err, disp, vis, Pv
    def stats_(err, disp, vis):
        return {'visible_tris': int(vis.sum()), 'err_mean_deg': round(float(err[vis].mean()), 3), 'err_p90_deg': round(float(np.percentile(err[vis], 90)), 3),
                'band_disp_p90_mm': round(float(np.percentile(disp[vis], 90)), 3), 'band_disp_p99_mm': round(float(np.percentile(disp[vis], 99)), 3),
                'band_disp_max_mm': round(float(disp[vis].max()), 3)}
    REFINE_ADD = int(os.environ.get('REFINE_ADD', globals().get('REFINE_ADD', 2000))); D_LOW, D_T = float(os.environ.get('REFINE_DLOW', '.12')), float(os.environ.get('REFINE_DT', '.45'))
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
    n_add = 0; budget = REFINE_ADD + len(drop); 
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
            # split the longest edge at its middle (constraint loops too: the eye rings, nose and mouth loops gain a point);
            # next to the fixed back boundary, insert the centroid instead
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
    if os.environ.get('REFINE_DUMP'):
        Pc_ = Pv[Fh].mean(1); print('SKIN_TRIS', len(Fh), 'in_hat', int(in_hat(Pc_).sum()), 'back', int((Pv[Fh][:, :, 1] >= HY + .01).any(1).sum()), 'below_chin', int((Pv[Fh][:, :, 2] <= CHIN - .14 * W).any(1).sum()), 'vis', int(vis.sum()), flush=True)
    if os.environ.get('REFINE_DUMP'):
        Pt_ = Pv[Fh].mean(1); ql = M2L(Pt_); bad_ = np.where(vis & (disp > 1.5))[0]
        LEN_ = np.max([np.linalg.norm(Pv[Fh][:, i] - Pv[Fh][:, (i + 1) % 3], axis=1) for i in range(3)], 0)
        json.dump({'bad': [[round(float(v), 4) for v in ql[t]] + [round(float(disp[t]), 2), round(float(err[t]), 2), round(float(eye_ring_rr(dom_out[Fh[t]].mean(0)[None])[0]), 2), round(float(LEN_[t]) * 1000, 1)] for t in bad_],
                   'vis_len_mm': [round(float(LEN_[t]) * 1000, 1) for t in np.where(vis)[0]], 'vis_disp': [round(float(disp[t]), 2) for t in np.where(vis)[0]],
                   'all_vis': int(vis.sum())}, open(os.path.join(ROOT, 'scratch', 'refine_dump.json'), 'w'))
    if os.environ.get('REFINE_ONLY'): sys.exit(0)
skin_d = from_dom(dom_out); skin_p = radial_hit_outer(skin_d); skin_n = grad_n(skin_p)
verts = [tuple(p) for p in skin_p]; vdir = list(skin_d); vnorm = list(skin_n); faces = [tuple(f) for f in Fh]
bound = [out_of[k] for k in tags['bound']]; prev = bound
for a in [140, 160]:
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
huv = head_uv(unit(vdir))
skin = make_obj('ball_head_skin', verts_np, faces, au('head', huv[:, 0], huv[:, 1]), 'head', N=vnorm)
LOG['skin_vertices'] = len(verts); LOG['skin_faces'] = len(faces)

# ============================================================== EYES: flush lens globes following the ball
ES = [0, .15, .30, .45, .60, .73, .84, .92, .98, 1.10]
NSEG = 24
eye_centers = {}
def eye_h(k): return .0018 - .0046 * k * k
for s, tag in ((-1, 'R'), (1, 'L')):
    psi = np.linspace(0, 2 * PI, NSEG, endpoint=False); rows = []
    cx = s * EX; Sc = np.array([cx, float(front_hit(cx, EZ)[0]), EZ]); axis = grad_n(Sc[None])[0]
    for k in ES:
        if k == 0: x = np.array([cx]); z = np.array([EZ])
        else: x, z = eye_xz(s, psi, k)
        y = front_hit(x, z); S = np.stack([x, y, z], -1); n = grad_n(S); rows.append(S + n * eye_h(k))
    rim = rows[-1]
    for depth, sc in [(.010, .86), (.020, .58)]: rows.append(Sc + (rim - Sc) * sc - axis * depth)
    tip = Sc - axis * .026
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
    eye_centers[tag] = [float(v) for v in (Sc - axis * .013)]
    LOG['eye_axis_' + tag] = {'out_deg': round(math.degrees(math.atan2(s * axis[0], -axis[1])), 1),
                              'down_deg': round(math.degrees(math.asin(-axis[2])), 1)}

# ============================================================== HAT (one rigid piece): band, swept cone, drooping brim, glasses, moon
def hat_pt(X, B, U):     # hat-local W -> metres
    return L2M(from_hat(np.stack([np.asarray(X, float), np.asarray(B, float), np.asarray(U, float)], -1)))
def hat_vec(X, B, U):
    v = np.stack([np.asarray(X, float), np.asarray(B, float), np.asarray(U, float)], -1)
    return unit(v[..., 0:1] * EXA + v[..., 1:2] * EB + v[..., 2:3] * EU)
R_BAND = .462
# brim: radial length L(t) and droop beta(t) (relative to the band plane) vary round the hat; t = 0 front, pi/2 = her left
def cosfit(knots):
    tk = np.radians([0, 45, 90, 135, 180]); A = np.cos(np.outer(tk, np.arange(5))); return np.linalg.solve(A, np.asarray(knots, float))
BRIM_LK = cosfit([.325, .298, .325, .365, .385]); BRIM_BK = cosfit([19., 16., 29., 28., 24.])
def brim_L(t): return np.cos(np.multiply.outer(np.asarray(t, float), np.arange(5))) @ BRIM_LK
def brim_beta(t): return np.radians(np.cos(np.multiply.outer(np.asarray(t, float), np.arange(5))) @ BRIM_BK)
NT_B, NS_B = 60, 6
tB = np.linspace(0, 2 * PI, NT_B, endpoint=False); sB = np.linspace(0, 1, NS_B + 1)
def brim_mid(t, s):
    """mid-surface of the brim in hat-local (X, B, U) W; t, s broadcast"""
    t = np.asarray(t, float); s = np.asarray(s, float); L = brim_L(t); beta = brim_beta(t)
    # the droop steepens toward the edge (a soft bell): angle(s) = beta * (0.55 + 0.9 s); integrate along s
    k = np.linspace(0, 1, 41)
    ang = beta[..., None] * (.55 + .9 * k)
    cr = np.concatenate([np.zeros(ang.shape[:-1] + (1,)), np.cumsum((np.cos(ang[..., 1:]) + np.cos(ang[..., :-1])) / 2 * np.diff(k), -1)], -1)
    cz = np.concatenate([np.zeros(ang.shape[:-1] + (1,)), np.cumsum((np.sin(ang[..., 1:]) + np.sin(ang[..., :-1])) / 2 * np.diff(k), -1)], -1)
    ri = np.array([np.interp(si, k, c) for si, c in zip(np.broadcast_to(s, t.shape).ravel(), cr.reshape(-1, len(k)))]).reshape(t.shape)
    zi = np.array([np.interp(si, k, c) for si, c in zip(np.broadcast_to(s, t.shape).ravel(), cz.reshape(-1, len(k)))]).reshape(t.shape)
    rho = R_BAND - .045 + (L + .033) * ri; U = -(L + .033) * zi + .005      # the root starts inside the head fill: no gap under the band
    # the front lip lifts a touch and the side tips curl a hair (soft felt)
    U = U + .008 * np.cos(t) ** 2 * (np.cos(t) > 0) * smooth(.6, 1, s)
    return np.stack([rho * np.sin(t), -rho * np.cos(t), U], -1)
TT_, SS_ = np.meshgrid(tB, sB, indexing='ij')
BM = brim_mid(TT_, SS_)                                  # (NT, NS+1, 3) hat-local
BMm = hat_pt(BM[..., 0], BM[..., 1], BM[..., 2])         # metres
# normals by finite differences (wrapped in t)
d_t = np.roll(BMm, -1, 0) - np.roll(BMm, 1, 0)
d_s = np.zeros_like(BMm); d_s[:, 1:-1] = BMm[:, 2:] - BMm[:, :-2]; d_s[:, 0] = BMm[:, 1] - BMm[:, 0]; d_s[:, -1] = BMm[:, -1] - BMm[:, -2]
BN = unit(np.cross(d_s, d_t))
upw = hat_vec(0, 0, 1)
BN = np.where(((BN * upw).sum(-1) < 0)[..., None], -BN, BN)
Vb = BMm.transpose(1, 0, 2).reshape(-1, 3); Nb = BN.transpose(1, 0, 2).reshape(-1, 3)      # rows = s, cols = t
Fb = grid_faces(NS_B + 1, NT_B, True)
thick = (.042 + .042 * smooth(.62, 1., np.repeat(sB, NT_B)) ** 1.5) * W
valo = sval(Nb, hi=.32); vali = sval(-Nb, occ=.10)
Vt, Ft, UVt, Nt = thicken(Vb, Fb, Nb, thick, ramp_uv('hat', valo), ramp_uv('hat', vali), ramp_uv('hat', .55), rim=3,
                          plain=np.arange(len(Vb)) < NT_B)          # the inner edge hides inside the band
# rim normals/colour: recompute the ramp value from the rim's own normal
UVt = ramp_uv('hat', sval(Nt, hi=.32))
make_obj('drooping_bell_brim', Vt, Ft, UVt, 'hat', N=Nt)
# band: a lathed rounded ring, violet
def lathe(name, prof, nseg, ramp, group, X0=0., B0=0., occ=0.):
    """prof: list of (rho, U) hat-local W, closed profile loop; revolved round the hat axis"""
    prof = np.asarray(prof, float); m = len(prof); t = np.linspace(0, 2 * PI, nseg, endpoint=False)
    rho = prof[:, 0][:, None]; U = prof[:, 1][:, None]
    P = hat_pt(X0 + rho * np.sin(t), B0 - rho * np.cos(t), np.broadcast_to(U, (m, nseg)))
    dpr = np.roll(prof, -1, 0) - np.roll(prof, 1, 0); pn = unit(np.stack([dpr[:, 1], -dpr[:, 0]], -1))   # outward in (rho, U)
    N = hat_vec(pn[:, 0:1] * np.sin(t), -pn[:, 0:1] * np.cos(t), np.broadcast_to(pn[:, 1:2], (m, nseg)))
    V = P.reshape(-1, 3); NN = N.reshape(-1, 3)
    F = []
    for j in range(m):
        for i in range(nseg):
            a = j * nseg + i; b = j * nseg + (i + 1) % nseg; c_ = ((j + 1) % m) * nseg + (i + 1) % nseg; d = ((j + 1) % m) * nseg + i
            F.append((a, b, c_, d))
    return make_obj(name, V, F, ramp_uv(ramp, sval(NN, occ=occ)), group, N=NN)
def rrect_prof(r0, r1, u0, u1, rc, n=4):
    """rounded rectangle loop in (rho, U)"""
    out = []
    for (cx, cu, a0) in ((r1 - rc, u0 + rc, -PI / 2), (r1 - rc, u1 - rc, 0), (r0 + rc, u1 - rc, PI / 2), (r0 + rc, u0 + rc, PI)):
        for k in range(n + 1):
            a = a0 + PI / 2 * k / n; out.append((cx + rc * math.cos(a), cu + rc * math.sin(a)))
    return out
lathe('violet_hat_band', [(.430, .006), (.455, .006), (.468, .010), (.472, .020), (.472, .100), (.466, .118), (.450, .127), (.430, .127)], 36, 'band', 'hat')   # starts inside the brim
# cone: a tapered tube along a spine that rises, bends over toward her left (+X) and back, then droops
SPINE = [(0, 0, .06, .448), (0, 0, .27, .340), (.010, .01, .45, .228), (.050, .03, .585, .150), (.150, .08, .668, .100),
         (.290, .15, .655, .076), (.410, .22, .575, .059), (.490, .27, .480, .047), (.525, .30, .405, .039)]
NSP = 21
sp = np.array([catmull([p[:3] for p in SPINE], t) for t in np.linspace(0, 1, NSP)])
spr = np.array([catmull([[p[3], 0, 0] for p in SPINE], t)[0] for t in np.linspace(0, 1, NSP)])
spm = hat_pt(sp[:, 0], sp[:, 1], sp[:, 2])
def cone_uv(NV, tt, uu, V): return ramp_uv('hat', sval(NV, hi=.32))
_upm = hat_vec(0, 0, 1)
cone = sweep('soft_cone', spm, lambda k: (spr[k] * W, spr[k] * W), 'hat', cone_uv, sides=20, cap0=False, cap1=True, up_hint=hat_vec(0, -1, 0))
TIP_M = spm[-1] + unit(spm[-1] - spm[-2]) * spr[-1] * W * .9
# reading glasses on the band's front: two round lenses, thick gold frames, a bridge, short arms tucked into the band
GL = {}
for s in (-1, 1):
    tl = s * math.radians(21.5); rho = .530; Ul = .150
    c = hat_pt(rho * math.sin(tl), -rho * math.cos(tl), Ul)
    nrm = hat_vec(math.sin(tl), -math.cos(tl), -.09)             # leaning on the band: ~20 deg above horizontal in the world
    GL[s] = (c, nrm)
LENS_R = .125 * W; FR_T = .040 * W
for s, (c, nrm) in GL.items():
    e1 = unit(np.cross(hat_vec(0, 0, 1), nrm)); e2 = np.cross(nrm, e1)
    a = np.linspace(0, 2 * PI, 22, endpoint=False)
    path = c + LENS_R * (np.cos(a)[:, None] * e1 + np.sin(a)[:, None] * e2)
    # frame ring: sweep a circle round the closed path (wrap by repeating)
    P = np.concatenate([path, path[:1]]); T = unit(np.roll(path, -1, 0) - np.roll(path, 1, 0)); T = np.concatenate([T, T[:1]])
    radial = unit(P - c); b = np.linspace(0, 2 * PI, 7, endpoint=False)
    rings = P[:, None, :] + FR_T * (np.cos(b)[None, :, None] * radial[:, None, :] + np.sin(b)[None, :, None] * nrm[None, None, :])
    nn = unit(np.cos(b)[None, :, None] * radial[:, None, :] + np.sin(b)[None, :, None] * nrm[None, None, :])
    R_ = len(P) - 1
    V = rings[:R_].reshape(-1, 3); NN = nn[:R_].reshape(-1, 3)
    F = []
    for j in range(R_):
        for i in range(7):
            jj = (j + 1) % R_; F.append((j * 7 + i, j * 7 + (i + 1) % 7, jj * 7 + (i + 1) % 7, jj * 7 + i))
    make_obj('gold_glasses_frame.' + ('L' if s > 0 else 'R'), V, F, ramp_uv('gold', sval(NN, hi=.36) - .10), 'hat', N=NN)
    # lens: a gently domed disc, lavender tint
    rr = np.linspace(0, 1, 5)[1:]; V = [c + nrm * .010 * W]; NN = [nrm]
    for r_ in rr:
        h = .010 * W * (1 - r_ * r_) - .004 * W * r_
        ring = c + LENS_R * 1.02 * r_ * (np.cos(a)[:, None] * e1 + np.sin(a)[:, None] * e2) + nrm * h
        V += list(ring); NN += list(unit(nrm * 1. + (np.cos(a)[:, None] * e1 + np.sin(a)[:, None] * e2) * (.35 * r_)))
    back = c - nrm * .012 * W; V.append(back); NN.append(-nrm)
    V = np.array(V); NN = np.array(NN); F = [(0, 1 + i, 1 + (i + 1) % 22) for i in range(22)]
    for j in range(len(rr) - 1):
        for i in range(22):
            a0 = 1 + j * 22 + i; b0 = 1 + j * 22 + (i + 1) % 22; F.append((a0, a0 + 22, b0 + 22, b0))
    lastr = 1 + (len(rr) - 1) * 22; bk = len(V) - 1
    for i in range(22): F.append((lastr + i, bk, lastr + (i + 1) % 22))
    lu = (V - c) @ e1 / LENS_R; lw = (V - c) @ e2 / LENS_R
    lv = .46 + .06 * (NN @ LIGHT) + .42 * (1 - smooth(.10, .34, np.hypot(lu + .34, lw - .36))) - .10 * smooth(.75, 1.0, np.hypot(lu, lw))
    make_obj('lavender_lens.' + ('L' if s > 0 else 'R'), V, F, ramp_uv('lens', lv), 'hat', N=NN)
# bridge between the frames, and the short arms into the band
cL, nL = GL[1]; cR, nR = GL[-1]
pA = cR + unit(cL - cR) * (LENS_R + FR_T * .5); pB = cL + unit(cR - cL) * (LENS_R + FR_T * .5)
mid = (pA + pB) / 2 + hat_vec(0, 0, 1) * .020 * W + (nL + nR) / 2 * .012 * W
sweep('glasses_bridge', [pA, (pA + mid) / 2 + hat_vec(0, 0, 1) * .006 * W, mid, (pB + mid) / 2 + hat_vec(0, 0, 1) * .006 * W, pB],
      lambda k: (.022 * W, .022 * W), 'hat', lambda NV, tt, uu, V: ramp_uv('gold', sval(NV, hi=.40)), sides=7)
for s in (-1, 1):     # short side arms: they run back along the band and tuck into it
    tl = s * math.radians(21.5); path = []
    for k, (da, rho, U) in enumerate([(18, .522, .140), (25, .502, .122), (32, .488, .105), (39, .477, .090), (46, .464, .080)]):
        a_ = tl + s * math.radians(da); path.append(hat_pt(rho * math.sin(a_), -rho * math.cos(a_), U))
    sweep('glasses_arm.' + str(s), path, lambda k: (.021 * W, .021 * W), 'hat', lambda NV, tt, uu, V: ramp_uv('gold', sval(NV, hi=.40)), sides=7)
# moon charm: a chunky crescent on a short loop under the bent tip
mface = unit(np.array([.42, -.90, 0.]))                 # the crescent faces the front and a little to her left
m_up = np.array([0, 0, 1.]); m_side = unit(np.cross(m_up, mface))
LOOP_R = .036 * W; LOOP_T = .014 * W
loop_c = TIP_M + np.array([0, 0, -LOOP_R * .55])
a = np.linspace(0, 2 * PI, 13, endpoint=False)
path = loop_c + LOOP_R * (np.cos(a)[:, None] * m_side + np.sin(a)[:, None] * m_up)
P = np.concatenate([path, path[:1]]); b = np.linspace(0, 2 * PI, 7, endpoint=False); radial = unit(P - loop_c)
rings = P[:, None, :] + LOOP_T * (np.cos(b)[None, :, None] * radial[:, None, :] + np.sin(b)[None, :, None] * mface[None, None, :])
nn = unit(np.cos(b)[None, :, None] * radial[:, None, :] + np.sin(b)[None, :, None] * mface[None, None, :])
V = rings[:13].reshape(-1, 3); NN = nn[:13].reshape(-1, 3)
F = [(j * 7 + i, j * 7 + (i + 1) % 7, ((j + 1) % 13) * 7 + (i + 1) % 7, ((j + 1) % 13) * 7 + i) for j in range(13) for i in range(7)]
make_obj('moon_loop', V, F, ramp_uv('gold', sval(NN, hi=.4)), 'hat', N=NN)
RM = .074 * W
MOON_C = loop_c + m_up * (-LOOP_R - RM - .010 * W) + m_side * (-.012 * W)
ang = np.radians(np.linspace(58, 322, 15))             # the opening faces her left and a little up, like the sheet
path = [MOON_C + RM * (math.cos(t) * m_side + math.sin(t) * m_up) for t in ang]
def moon_r(k):
    u = k / (len(path) - 1); w_ = (.014 + .036 * math.sin(PI * u) ** .9) * W; return (min(.027 * W, w_ * .85), w_)
sweep('crescent_moon_charm', path, moon_r, 'hat', lambda NV, tt, uu, V: ramp_uv('gold', sval(NV, hi=.45)), sides=9, normals=[mface] * len(path))

# ============================================================== TOPKNOT: one big sculpted C-curl on the forehead
def forehead_pt(xw, zw, lift):
    x = np.atleast_1d(np.asarray(xw, float)) * W; z = CHIN + np.atleast_1d(np.asarray(zw, float)) * W
    y = front_hit(x, z, lambda p: head_local(M2L(p), fill=True) * W)
    P = np.stack([x, y, z], -1); n = grad_n(P); return P + n * lift[:, None], n
TK = [(.030, .889, -.015), (-.030, .884, .020), (-.085, .870, .045), (-.110, .852, .058), (-.090, .838, .064), (-.035, .834, .066),
      (.030, .837, .064), (.080, .846, .058), (.100, .860, .050), (.085, .873, .040), (.050, .876, .030), (.030, .868, .020)]   # x, z, lift (W)
TKd = np.array([catmull(TK, t) for t in np.linspace(0, 1, 26)])
uk = np.linspace(0, 1, len(TKd))
Ptk, ntk = forehead_pt(TKd[:, 0] * .74, .800 + (TKd[:, 1] - .834) * 1.45, TKd[:, 2] * 1.15 * W)
tk_rw = (.044 - .016 * smooth(.70, 1., uk)) * W; tk_rd = (.046 - .014 * smooth(.70, 1., uk)) * W
def sweep_grooved(name, P, N, rw, rd, group, sides=16, groove=.20, gw=.34):
    """a tube with a soft groove running along its outward face (the curl line), finite-difference normals, rounded caps"""
    P = np.asarray(P, float); T = unit(np.gradient(P, axis=0)); Nn = unit(N - T * (N * T).sum(1, keepdims=True)); B = np.cross(T, Nn)
    a = np.linspace(0, 2 * PI, sides, endpoint=False); ra = 1 - groove * np.exp(-((np.mod(a + PI, 2 * PI) - PI) / gw) ** 2)
    def ring(k, sc=1., push=0.):
        return P[k] + T[k] * push + (Nn[k] * (rd[k] * np.cos(a) * ra * sc)[:, None] + B[k] * (rw[k] * np.sin(a) * ra * sc)[:, None])
    rings = [ring(k) for k in range(len(P))]
    caps0 = [ring(0, math.cos(t), -math.sin(t) * min(rw[0], rd[0])) for t in (PI / 5, 2 * PI / 5)]
    caps1 = [ring(len(P) - 1, math.cos(t), math.sin(t) * min(rw[-1], rd[-1])) for t in (PI / 5, 2 * PI / 5)]
    G = np.array(caps0[::-1] + rings + caps1)
    dS = np.roll(G, -1, 1) - np.roll(G, 1, 1); dK = np.gradient(G, axis=0)
    NG = unit(np.cross(dS, dK)); ctr = np.concatenate([np.repeat(P[:1], 2, 0), P, np.repeat(P[-1:], 2, 0)])
    flip = ((NG * (G - ctr[:, None])).sum(-1) < 0)[..., None]; NG = np.where(flip, -NG, NG)
    V = list(G.reshape(-1, 3)); NV = list(NG.reshape(-1, 3)); R_ = len(G)
    F = grid_faces(R_, sides, True)
    for end, sg in ((0, -1), (R_ - 1, 1)):
        k0 = len(V); tip = P[0] - T[0] * min(rw[0], rd[0]) * .98 if sg < 0 else P[-1] + T[-1] * min(rw[-1], rd[-1]) * .98
        V.append(tip); NV.append(-T[0] if sg < 0 else T[-1])
        for i in range(sides):
            j = (i + 1) % sides; F.append((end * sides + j, end * sides + i, k0) if sg < 0 else (end * sides + i, end * sides + j, k0))
    V = np.array(V); NV = np.array(NV)
    gv = np.concatenate([np.tile(np.exp(-((np.mod(a + PI, 2 * PI) - PI) / gw) ** 2), R_), [0, 0]])
    return V, F, NV, gv
Vt_, Ft_, Nt_, gv_ = sweep_grooved('topknot_curl', Ptk, ntk, tk_rw, tk_rd, 'head', sides=14, groove=.24)
cc_ = np.array([.0, 0, CHIN + .852 * W]); inward_ = unit(np.stack([cc_[0] - Vt_[:, 0], np.zeros(len(Vt_)), cc_[2] - Vt_[:, 2]], -1))
make_obj('topknot_curl', Vt_, Ft_, ramp_uv('curl', sval(Nt_, occ=.55 * gv_ + .22 * smooth(.2, .9, (Nt_ * inward_).sum(1)), hi=.34)), 'head', N=Nt_)

# ============================================================== EARS: long pendant spaniel ears of big merged curl lobes
def all_verts_of(obs): return np.array([list(o.matrix_world @ v.co) for o in obs for v in o.data.vertices])
def loc(x, b, z):   # W units: lateral, behind the nose tip, above the chin -> metres
    return np.array([x * W, behind(b), CHIN + z * W])
def ear_axis_x(z):
    """the column axis x (W) measured and approved in round 2"""
    z = np.asarray(z, float); u = np.clip((.465 - z) / .530, 0, 1)
    return np.where(z > -.07, .478 + .298 * u ** .85, np.interp(z, [-.47, -.35, -.30, -.07], [.784, .784, .787, .785]))
def rot_yx(t, l):
    ct, st, cl, sl = math.cos(t), math.sin(t), math.cos(l), math.sin(l)
    Ry = np.array([[ct, 0, st], [0, 1, 0], [-st, 0, ct]]); Rx = np.array([[1, 0, 0], [0, cl, -sl], [0, sl, cl]])
    return Ry @ Rx                                     # columns = the lump's local axes in world
# rows of lumps above the ribbon: (z, [(x offset in column half-widths, depth offset, radius, tilt deg, lean deg, groove, groove turn)])
EAR_ROWS = [
    (.472, [(-.45, .020, .082, 20, 6, 'C', .3), (.40, -.020, .078, -15, -8, 'S', 1.2)]),
    (.375, [(-.62, -.030, .080, -25, 9, 'S', 2.0), (.02, .030, .092, 10, -5, 'C', 4.0), (.62, -.020, .084, 30, 7, 'C', .8)]),
    (.270, [(-.42, .020, .100, 15, -7, 'C', 3.0), (.46, -.030, .102, -20, 10, 'S', 5.0)]),
    (.160, [(-.64, -.020, .096, -10, 8, 'S', 1.5), (.00, .035, .106, 25, -6, 'C', 2.5), (.56, -.030, .100, -30, 5, 'C', .2)]),
    (.045, [(-.40, .020, .116, 20, -9, 'C', 3.5), (.60, -.020, .120, -15, 6, 'S', .6)]),
    (-.065, [(-.56, -.030, .104, -20, 7, 'S', 4.2), (.04, .035, .112, 15, -8, 'C', 1.1), (.58, -.020, .106, 25, 5, 'C', 2.8)]),
]
EAR_TUFT_ROWS = [(-.285, [(-.36, .00, .098, 15, -6, 'C', .9), (.42, .020, .094, -20, 8, 'S', 3.3)]), (-.375, [(.02, -.010, .082, 0, 4, 'C', 5.1)])]
def ear_hw(z): return np.interp(z, [-.40, -.07, .045, .16, .27, .375, .472], [.20, .22, .22, .19, .19, .19, .15])
K_LUMP = .018 * W
BOW_Z = -.195
ear_info = {}
EAR_FIELDS = {}; EAR_PAINT = {}
def ring_stack_uv(name, sdf, centres, group, chart, sides=24, tmax=.16, ref=(0, -1., 0)):
    """horizontal rings round the column axis (outermost roots), a seam column so the chart can be painted, pole fans"""
    C = np.asarray(centres, float); R = len(C); a = np.linspace(0, 2 * PI, sides, endpoint=False)
    e1 = np.asarray(ref, float); e2 = np.cross(np.array([0, 0, -1.]), e1)
    D = np.cos(a)[:, None] * e1 + np.sin(a)[:, None] * e2
    name_hint[0] = name
    rings = np.array([ray_outer(sdf, C[k], D, tmax, steps=90, it=26) for k in range(R)])
    Nr = grad(sdf, rings.reshape(-1, 3)).reshape(rings.shape)
    pt = ray_outer(sdf, C[0], np.array([[0, 0, 1.]]), tmax); pb = ray_outer(sdf, C[-1], np.array([[0, 0, -1.]]), tmax)
    G = np.concatenate([rings, rings[:, :1]], 1); GN = np.concatenate([Nr, Nr[:, :1]], 1); S1 = sides + 1
    vs = np.linspace(.015, .985, R)
    V = list(G.reshape(-1, 3)) + [pt[0], pb[0]]; NV = list(GN.reshape(-1, 3)) + [grad(sdf, pt)[0], grad(sdf, pb)[0]]
    UVv = [au(chart, i / sides, vs[j]) for j in range(R) for i in range(S1)] + [au(chart, .5, 0.), au(chart, .5, 1.)]
    F = []
    for j in range(R - 1):
        for i in range(sides):
            F.append((j * S1 + i, j * S1 + i + 1, (j + 1) * S1 + i + 1, (j + 1) * S1 + i))
    top, bot = R * S1, R * S1 + 1
    for i in range(sides):
        F.append((top, i + 1, i)); F.append((bot, (R - 1) * S1 + i, (R - 1) * S1 + i + 1))
    make_obj(name, np.array(V), F, np.array(UVv), group, N=np.array(NV))
    return G, GN, vs
for s, tag in ((1, 'L'), (-1, 'R')):
    grp = 'ear.' + tag
    LUMPS = []
    for z, items in EAR_ROWS + EAR_TUFT_ROWS:
        xc = float(ear_axis_x(z)); hw = float(ear_hw(z))
        for (xo, bo, r, tilt, lean, gt, grot) in items:
            c = loc(s * (xc + xo * hw), .880 + bo, z)
            Rm = rot_yx(math.radians(tilt) * s, math.radians(lean))
            rad = np.array([r, 1.28 * r, 1.08 * r]) * W
            axis_pt = loc(s * xc, .880, z)
            out = unit((c - axis_pt) * np.array([1, 1, 0]) + np.array([s * .03, -.05, 0]) * W)
            LUMPS.append((c, Rm, rad, out, gt, grot))
    CA, CB = loc(s * .478, .880, .480), loc(s * .780, .880, -.070)
    WA, WB = loc(s * .783, .880, -.095), loc(s * .784, .880, -.300)
    def ear_parts(p, LUMPS=LUMPS, CA=CA, CB=CB, WA=WA, WB=WB):
        D = np.stack([ell((p - c) @ Rm, [0, 0, 0], rad) for (c, Rm, rad, out, gt, grot) in LUMPS])
        return D, sd_capsule(p, CA, CB, (.090 * W, .112 * W)), sd_capsule(p, WA, WB, .097 * W)
    def ear_sdf(p, ear_parts=ear_parts):
        D, dc, dw = ear_parts(p); d = dc
        for k in range(len(D)): d = smin(d, D[k], K_LUMP)
        return smin(d, dw, .030 * W)
    zr_ = np.concatenate([np.linspace(.555, .470, 4)[:-1], np.linspace(.470, -.300, 40), np.linspace(-.300, -.430, 6)[1:], np.array([-.440, -.448])])
    cen = np.stack([s * ear_axis_x(zr_) * W, np.full(len(zr_), behind(.880)), CHIN + zr_ * W], -1)
    G, GN, vs = ring_stack_uv('curl_cluster_ear.' + tag, ear_sdf, cen, grp, 'ear.' + tag, sides=24)
    EAR_FIELDS[tag] = ear_sdf; EAR_PAINT[tag] = (G, GN, vs, LUMPS, ear_parts, s)
    # ribbon tie: a soft band nearly flush in the curls, a small bow on the front-outer side (two loops, a knot, two tails)
    tie_c = loc(s * float(ear_axis_x(BOW_Z)), .880, BOW_Z)
    ab = np.linspace(0, 2 * PI, 20, endpoint=False); dirs_h = np.stack([np.cos(ab), np.sin(ab), np.zeros_like(ab)], -1)
    rr_b = np.linalg.norm(ray_outer(ear_sdf, tie_c, dirs_h, .16) - tie_c, axis=1)
    for _ in range(3): rr_b = .25 * np.roll(rr_b, 1) + .5 * rr_b + .25 * np.roll(rr_b, -1)
    prof_b = [(-.010, -.026), (.000, -.030), (.008, -.026), (.011, -.012), (.011, .012), (.008, .026), (.000, .030), (-.010, .026)]
    VB = []; NB = []
    for dr, dz in prof_b:
        VB.append(tie_c + dirs_h * (rr_b + dr * W + .004 * W)[:, None] + np.array([0, 0, dz * W]));
    VB = np.array(VB); m_ = len(prof_b)
    dpr = np.roll(np.array(prof_b), -1, 0) - np.roll(np.array(prof_b), 1, 0); pn = unit(np.stack([dpr[:, 1], -dpr[:, 0]], -1))
    NB = unit(dirs_h[None] * pn[:, 0:1, None] + np.array([0, 0, 1.])[None, None] * pn[:, 1:2, None])
    FB = [(j * 20 + i, j * 20 + (i + 1) % 20, ((j + 1) % m_) * 20 + (i + 1) % 20, ((j + 1) % m_) * 20 + i) for j in range(m_) for i in range(20)]
    make_obj('ribbon_tie_band.' + tag, VB.reshape(-1, 3), FB, ramp_uv('stole', sval(NB.reshape(-1, 3), hi=.30)), grp, N=NB.reshape(-1, 3))
    face = unit(np.array([s * math.sin(math.radians(40)), -math.cos(math.radians(40)), 0.]))
    up = np.array([0, 0, 1.]); side = unit(np.cross(up, face))
    rf = float(np.interp(math.atan2(face[1], face[0]) % (2 * PI), np.concatenate([ab, [2 * PI]]), np.concatenate([rr_b, rr_b[:1]])))
    knot_c = tie_c + face * (rf + .020 * W)
    lobe('ribbon_knot.' + tag, knot_c, np.array([.030, .038, .036]) * W, face, grp, ramp='stole', n=3, occ_in=.05)
    for k, dd in enumerate((-1, 1)):            # two rounded loops (~0.12 W each) lying close on the curls
        ld = unit(side * dd + up * .22)
        lc = knot_c + ld * .076 * W - face * .014 * W
        lobe('ribbon_loop_%d.%s' % (k, tag), lc, np.array([.024, .054, .072]) * W, face, grp, ramp='stole', n=3, occ_in=.12, squash=.25, pole=ld)
        td = unit(-up + side * dd * .38)       # two short tails hanging down
        lobe('ribbon_tail_%d.%s' % (k, tag), knot_c + td * .055 * W + side * dd * .006 * W - face * .010 * W, np.array([.014, .020, .050]) * W,
             face, grp, ramp='stole', n=2, occ_in=.05, pole=td)
    ear_info[tag] = {'base': loc(s * .47, .88, .50), 'tie': tie_c, 'tip': loc(s * .79, .88, -.46)}

# ============================================================== NAPE CURLS (back of the head under the brim)
for k, (x, b, z, r) in enumerate([(-.16, 1.09, .17, (.165, .150, .160)), (.16, 1.09, .17, (.165, .150, .160))]):
    c = loc(x, b, z); lobe('nape_curl_%d' % k, c, np.array(r) * W, c - loc(0, .75, .30), 'head', n=3, pole=[0, 0, 1.])

if HEAD_ONLY:
    JOINTS_BODY = {}
else:
    # ============================================================== BODY AND COSTUME (runs inside build_moka-toy.py's namespace)
    # metres; the body axis is x = 0, y = 0 (legs / arms); the robe is centred at y = RCY
    RCY = -.025
    RZ = np.array([.125, .150, .190, .240, .290, .340, .390, .430, .470, .500, .530, .570, .605, .635, .660, .680, .695, .705])
    RAX = np.array([.332, .324, .310, .292, .272, .250, .228, .212, .200, .197, .198, .200, .198, .188, .168, .140, .110, .088])
    RAY = np.array([.274, .266, .254, .238, .220, .202, .184, .170, .160, .158, .159, .159, .156, .148, .134, .114, .094, .080])
    ax_f = natspline(RZ, RAX); ay_f = natspline(RZ, RAY)
    ZT, ZH = .705, .130
    def fold(a, z):
        return 1 + .022 * smooth(.45, .13, z) * np.cos(7 * a + .5) + .007 * smooth(.40, .13, z) * np.cos(13 * a + 1.1)
    def robe_mid(a, z):
        a = np.asarray(a, float); z = np.asarray(z, float); f = fold(a, z)
        return np.stack([ax_f(z) * f * np.sin(a), RCY - ay_f(z) * f * np.cos(a), z + 0 * a], -1)
    def robe_n(a, z, e=1e-4):
        da = robe_mid(np.asarray(a) + e, z) - robe_mid(np.asarray(a) - e, z)
        dz = robe_mid(a, np.asarray(z) + e) - robe_mid(a, np.asarray(z) - e)
        return unit(np.cross(da, dz))
    def robe_env(a, z, off):
        return robe_mid(a, z) + robe_n(a, z) * np.asarray(off, float)[..., None]
    def x_front(z): return np.interp(z, [.13, .30, .48, .60, .705], [.180, .158, .132, .105, .062])
    def gap(z): return .054 * smooth(.47, .41, z) * (1 - .76 * smooth(.29, .20, z))
    def a_front(z): return np.arcsin(np.clip(x_front(z) / ax_f(z), 0, .97))
    def a_back(z): return np.arcsin(np.clip(gap(z) / ax_f(z), 0, .5))
    def rbar(z): return np.sqrt((ax_f(z) ** 2 + ay_f(z) ** 2) / 2)
    T_ROBE = .011

    # ---------------------------------------------------------------- outer robe: open front, back split, thick gold-rimmed shell
    NR, NCs = 18, 22
    zr = np.linspace(ZT, ZH, NR)
    Vm = []; UVo = []; UVi = []; idx = {}
    for j, z in enumerate(zr):
        af = float(a_front(z)); ab = float(a_back(z)); shared = ab < 1e-6
        for side in ('L', 'R'):
            for i in range(NCs + 1):
                if side == 'L': a = af + (PI - ab - af) * i / NCs
                else:
                    if i == 0 and shared: idx[(j, 'R', 0)] = idx[(j, 'L', NCs)]; continue
                    a = PI + ab + (PI - af - ab) * i / NCs
                idx[(j, side, i)] = len(Vm); Vm.append((a, z))
                u = (a - af) / (2 * PI - 2 * af); v = (z - ZH) / (ZT - ZH)
                UVo.append((u, v)); UVi.append((u, v))
    A_ = np.array([p[0] for p in Vm]); Z_ = np.array([p[1] for p in Vm])
    Pm = robe_mid(A_, Z_); Nm = robe_n(A_, Z_)
    F = []
    for j in range(NR - 1):
        for side in ('L', 'R'):
            for i in range(NCs):
                F.append((idx[(j, side, i)], idx[(j, side, i + 1)], idx[(j + 1, side, i + 1)], idx[(j + 1, side, i)]))
    UVo = np.array(UVo); UVi = np.array(UVi)
    Vt, Ft, UVt, Nt = thicken(Pm, F, Nm, T_ROBE, au('robe', UVo[:, 0], UVo[:, 1]), au('lining', UVi[:, 0], UVi[:, 1]), ramp_uv('gold', .62), rim=3)
    make_obj('outer_scholar_robe', Vt, Ft, UVt, 'body', N=Nt)

    # ---------------------------------------------------------------- inner kimono: bodice (painted crossed V) and darker skirt
    def bod_ax(z): return ax_f(z) - .017
    def bod_ay(z): return ay_f(z) - .017
    zb = np.linspace(.465, .712, 9); NAB = 30
    ab_ = np.concatenate([np.linspace(-PI, -1.3, 5)[:-1], np.linspace(-1.3, 1.3, 23)[:-1], np.linspace(1.3, PI, 5)])   # dense in front
    P = np.zeros((len(zb), len(ab_), 3)); N = np.zeros_like(P); UV = np.zeros((len(zb), len(ab_), 2))
    for j, z in enumerate(zb):
        ax_, ay_ = bod_ax(z), bod_ay(z)
        P[j] = np.stack([ax_ * np.sin(ab_), RCY - ay_ * np.cos(ab_), np.full(len(ab_), z)], -1)
        N[j] = unit(np.stack([np.sin(ab_) / ax_, -np.cos(ab_) / ay_, np.zeros(len(ab_))], -1))
        UV[j] = np.stack([(ab_ + PI) / (2 * PI), np.full(len(ab_), (z - .465) / (.712 - .465))], -1)
    Vb_ = P.reshape(-1, 3); Nb_ = N.reshape(-1, 3); UVb_ = UV.reshape(-1, 2)
    make_obj('inner_kimono_bodice', Vb_, grid_faces(len(zb), len(ab_)), au('bodice', UVb_[:, 0], UVb_[:, 1]), 'body', N=Nb_)
    zs_ = np.linspace(.488, .215, 6); NAS = 22; as_ = np.linspace(0, 2 * PI, NAS, endpoint=False)
    P = []; N = []
    for z in zs_:
        t = (.488 - z) / (.488 - .215); ax_ = bod_ax(.49) * (1 - t) + .262 * t; ay_ = bod_ay(.49) * (1 - t) + .214 * t
        ax2 = ax_ * (1 + .02 * t * np.cos(6 * as_ + .4)); ay2 = ay_ * (1 + .02 * t * np.cos(6 * as_ + .4))
        P.append(np.stack([ax2 * np.sin(as_), RCY - ay2 * np.cos(as_), np.full(NAS, z)], -1))
        N.append(unit(np.stack([np.sin(as_) / ax_, -np.cos(as_) / ay_, np.full(NAS, .25 * t)], -1)))
    P = np.array(P).reshape(-1, 3); N = np.array(N).reshape(-1, 3)
    sv_ = sval(N, hi=.20) - .10 * np.repeat(np.linspace(0, 1, len(zs_)), NAS)
    Vt, Ft, UVt, Nt = thicken(P, grid_faces(len(zs_), NAS, True), N, .009, ramp_uv('skirt', sv_), ramp_uv('skirt', .25), ramp_uv('gold', .6), rim=3,
                              plain=np.arange(len(P)) < NAS)
    make_obj('inner_kimono_skirt', Vt, Ft, UVt, 'body', N=Nt)

    # ---------------------------------------------------------------- sash: a violet band over everything at the waist
    NAs_ = 44; a_s = np.linspace(0, 2 * PI, NAs_, endpoint=False); zc_s = .500
    af_s = float(a_front(zc_s)); wrobe = smooth(af_s - .22, af_s + .04, np.minimum(np.abs(np.mod(a_s + PI, 2 * PI) - PI), 9))
    rx_s = (bod_ax(zc_s) + .006) * (1 - wrobe) + (ax_f(zc_s) + T_ROBE / 2 + .004) * wrobe
    ry_s = (bod_ay(zc_s) + .006) * (1 - wrobe) + (ay_f(zc_s) + T_ROBE / 2 + .004) * wrobe
    for _ in range(3): rx_s = .25 * np.roll(rx_s, 1) + .5 * rx_s + .25 * np.roll(rx_s, -1); ry_s = .25 * np.roll(ry_s, 1) + .5 * ry_s + .25 * np.roll(ry_s, -1)
    prof = [(0, -.028), (.007, -.025), (.010, -.010), (.010, .010), (.007, .025), (0, .028)]
    P = []; N = []
    for (dr, dz), pn in zip(prof, [(-.3, -1), (.6, -1), (1, -.2), (1, .2), (.6, 1), (-.3, 1)]):
        rx = rx_s + dr; ry = ry_s + dr
        P.append(np.stack([rx * np.sin(a_s), RCY - ry * np.cos(a_s), np.full(NAs_, zc_s + dz)], -1))
        nh = unit(np.stack([np.sin(a_s) / rx, -np.cos(a_s) / ry, np.zeros(NAs_)], -1))
        N.append(unit(nh * pn[0] + np.array([0, 0, 1.]) * pn[1]))
    P = np.array(P).reshape(-1, 3); N = np.array(N).reshape(-1, 3)
    make_obj('violet_sash', P, grid_faces(len(prof), NAs_, True), ramp_uv('band', sval(N, hi=.25)), 'body', N=N)

    # ---------------------------------------------------------------- stole: one seafoam band from the left front panel, round the back of the neck, to the right
    STOLE = [(.690, .462), (.695, .500), (.700, .540), (.712, .578), (.745, .612), (.820, .640), (.960, .660), (1.15, .668),
             (1.45, .668), (1.80, .660), (2.20, .652), (2.65, .646), (PI, .644)]
    sa = [p[0] for p in STOLE]; sz = [p[1] for p in STOLE]
    sa = np.array(sa + [2 * PI - a for a in sa[::-1][1:]]); sz = np.array(sz + sz[::-1][1:])
    sa = np.where(sa > PI, sa - 2 * PI, sa)                       # -pi..pi, continuous through the back
    sa = np.unwrap(sa)
    k = np.linspace(0, len(sa) - 1, 44); sa_d = np.interp(k, np.arange(len(sa)), sa); sz_d = np.interp(k, np.arange(len(sz)), sz)
    for _ in range(2): sa_d[1:-1] = .25 * sa_d[:-2] + .5 * sa_d[1:-1] + .25 * sa_d[2:]; sz_d[1:-1] = .25 * sz_d[:-2] + .5 * sz_d[1:-1] + .25 * sz_d[2:]
    ST_T = .008
    spath = robe_env(sa_d, sz_d, T_ROBE / 2 + ST_T + .002); snorm = robe_n(sa_d, sz_d)
    backness = smooth(1.0, 2.2, np.abs(np.mod(sa_d + PI, 2 * PI) - PI))
    s_hw = .041 + .012 * backness
    def stole_prof(k): return (ST_T, s_hw[k])
    sweep('seafoam_stole', spath, stole_prof, 'body', lambda NV, tt, uu, V: ramp_uv('stole', sval(NV, hi=.30)), sides=10, normals=snorm, p=.32)
    # chunky gold tassels at both ends: a bead and three fat merged strands
    for end in (0, -1):
        top = spath[end]; nrm_ = snorm[end]; wdir = unit(np.cross(nrm_, [0, 0, 1.])) if end == 0 else -unit(np.cross(nrm_, [0, 0, 1.]))
        bead = top + np.array([0, 0, -.010]) + nrm_ * .004
        lobe('tassel_bead.%d' % end, bead, np.array([.012, .019, .015]), nrm_, 'body', ramp='gold', n=3, occ_in=.0, pole=[0, 0, 1.])
        for kx in (-1, 0, 1):
            p0 = bead + wdir * (.011 * kx) + np.array([0, 0, -.008])
            p1 = bead + wdir * (.019 * kx) + nrm_ * .004 + np.array([0, 0, -.092 + .008 * abs(kx)])
            sweep('tassel_strand.%d.%d' % (end, kx), [p0, (p0 + p1) / 2, p1], lambda k: (.0105, .0105), 'body',
                  lambda NV, tt, uu, V: ramp_uv('gold', sval(NV, hi=.35) - .10 * tt), sides=7)

    # ---------------------------------------------------------------- sleeves: wide bell kimono sleeves with a gold cuff (thick, open)
    SLEEVE = {}
    for s, tag in ((1, 'L'), (-1, 'R')):
        path = np.array([(s * .112, -.020, .626), (s * .170, -.024, .600), (s * .208, -.028, .556), (s * .238, -.032, .512), (s * .260, -.036, .476)])
        pts_ = np.array([catmull(path, t) for t in np.linspace(0, 1, 10)])
        T_, N_, B_ = frames(pts_, normals=np.tile([0, -1., 0], (len(pts_), 1)))
        a = np.linspace(0, 2 * PI, 17, endpoint=False); tt = np.linspace(0, 1, len(pts_))
        rN = .074 + .026 * tt ** 1.3; rB = .070 + .046 * tt ** 1.2
        rings = pts_[:, None, :] + N_[:, None, :] * (rN[:, None] * np.cos(a))[..., None] + B_[:, None, :] * (rB[:, None] * np.sin(a))[..., None]
        sag = (np.minimum(0, np.sin(a)) ** 2)[None, :] * (.018 * tt ** 2)[:, None]            # the hanging lower edge of the sleeve
        rings = rings + np.array([0, 0, -1.])[None, None, :] * sag[..., None]
        nn = unit(N_[:, None, :] * (np.cos(a) / rN[:, None])[..., None] + B_[:, None, :] * (np.sin(a) / rB[:, None])[..., None])
        V = rings.reshape(-1, 3); NN = nn.reshape(-1, 3); vv = np.repeat(tt, len(a)); uu = np.tile(.5 + .5 * np.cos(a), len(tt))
        Vt, Ft, UVt, Nt = thicken(V, grid_faces(len(tt), len(a), True), NN, .010, au('sleeve', uu, vv), ramp_uv('lining', .35), ramp_uv('gold', .62), rim=3,
                                  plain=np.arange(len(V)) < len(a))
        make_obj('bell_sleeve.' + tag, Vt, Ft, UVt, 'arm.' + tag, N=Nt)
        SLEEVE[tag] = (pts_, T_)

    # ---------------------------------------------------------------- arms and mitten paws (SDF ring stacks: rings = elbow / wrist loops)
    ARM = {}
    for s, tag in ((1, 'L'), (-1, 'R')):
        SH = np.array([s * .150, -.020, .600]); EL = np.array([s * .210, -.028, .528]); WR = np.array([s * .260, -.036, .456])
        PS = 1.15
        dirv = unit(WR - SH); PC = WR + dirv * .050 * PS + np.array([0, -.004, 0])
        fwd = unit(np.array([0, -1., 0]) - dirv * (dirv @ np.array([0, -1., 0]))); lat = np.cross(dirv, fwd) * s   # lat points in, toward the body
        closed = tag == 'R'
        paw_axes = np.array([dirv, fwd, lat]); paw_r = tuple(PS * np.array((.078, .066, .054) if not closed else (.070, .066, .058)))
        fingers = [PC + PS * (dirv * (.048 if not closed else .030) + fwd * (o * .022) + lat * (-.003 if not closed else .020)) for o in (-1, 0, 1)]
        thumb = PC + PS * (fwd * (.040 if not closed else .042) + lat * (.012 if not closed else .022) - dirv * (.006 if not closed else -.004))
        def arm_parts(p, SH=SH, WR=WR, PC=PC, paw_axes=paw_axes, paw_r=paw_r, fingers=fingers, thumb=thumb, closed=closed, PS=PS):
            d_arm = sd_capsule(p, SH, WR, (.047, .043))
            d_paw = sd_ell(p, PC, paw_axes, paw_r)
            d_f = [sd_ell(p, f, paw_axes, PS * np.array((.030, .021, .030) if not closed else (.026, .021, .030))) for f in fingers]
            d_t = sd_ell(p, thumb, paw_axes, PS * np.array((.028, .024, .022)))
            return d_arm, d_paw, d_f, d_t
        def arm_sdf(p, arm_parts=arm_parts):
            d_arm, d_paw, d_f, d_t = arm_parts(p)
            d = smin(d_arm, d_paw, .030)
            ff = smin(smin(d_f[0], d_f[1], .006), d_f[2], .006)
            return smin(smin(d, ff, .014), d_t, .010)
        def arm_uv(NN, V, arm_parts=arm_parts, arm_sdf=arm_sdf):
            d_arm, d_paw, d_f, d_t = arm_parts(V)
            crease = np.clip((np.minimum(d_f[0], d_f[1]) - smin(d_f[0], d_f[1], .006)) / .006, 0, .25) + np.clip((np.minimum(d_f[1], d_f[2]) - smin(d_f[1], d_f[2], .006)) / .006, 0, .25)
            crease = crease + np.clip((np.minimum(np.minimum(d_paw, d_arm), d_t) - smin(np.minimum(d_paw, d_arm), d_t, .010)) / .010, 0, .25) * .8
            return ramp_uv('fur', sval(NN, occ=1.2 * crease, hi=.28))
        tt_ = np.linspace(0, .12, 241); inside = arm_sdf(PC[None] + dirv[None] * tt_[:, None]) < 0
        reach = float(tt_[np.argmin(inside)]) if not inside.all() else .12
        tips = PC + dirv * (reach - .009)
        ts = np.concatenate([np.linspace(0, .70, 6)[:-1], np.linspace(.70, 1.0, 13)])      # dense over the forearm end and the paw
        cen = SH[None] + (tips - SH)[None] * ts[:, None]; axd = np.tile(dirv, (len(ts), 1))
        ring_stack('fur_arm_mitten.' + tag, arm_sdf, cen, axd, 'arm.' + tag, arm_uv, sides=16, tmax=.16, ref=fwd)
        ARM[tag] = {'shoulder': SH.tolist(), 'elbow': EL.tolist(), 'wrist': WR.tolist(), 'palm': (PC + lat * .014).tolist()}

    # ---------------------------------------------------------------- legs and broad toy feet with toe lobes (horizontal rings, flat sole)
    LEG = {}
    for s, tag in ((1, 'L'), (-1, 'R')):
        HIP = np.array([s * .102, .006, .365]); ANK = np.array([s * .118, -.004, .105]); FC = np.array([s * .135, -.040, .046])
        toes = [np.array([s * .135 + o * .046 + s * .006, -.128 + .010 * abs(o), .040]) for o in (-1, 0, 1)]
        def leg_parts(p, HIP=HIP, ANK=ANK, FC=FC, toes=toes):
            d_leg = sd_capsule(p, HIP, ANK, (.070, .074))
            d_foot = ell(p, FC, (.098, .118, .052))
            d_t = [ell(p, t, (.034, .048, .036)) for t in toes]
            return d_leg, d_foot, d_t
        def leg_sdf(p, leg_parts=leg_parts):
            d_leg, d_foot, d_t = leg_parts(p)
            d = smin(d_leg, d_foot, .045); tt_ = smin(smin(d_t[0], d_t[1], .008), d_t[2], .008)
            d = smin(d, tt_, .016)
            return -smin(-d, p[:, 2], .010)                              # flat sole on z = 0 (smooth intersection with z > 0)
        def leg_uv(NN, V, leg_parts=leg_parts):
            d_leg, d_foot, d_t = leg_parts(V)
            cr = np.clip((np.minimum(d_t[0], d_t[1]) - smin(d_t[0], d_t[1], .008)) / .008, 0, .25) + np.clip((np.minimum(d_t[1], d_t[2]) - smin(d_t[1], d_t[2], .008)) / .008, 0, .25)
            sole = smooth(.012, .002, V[:, 2])
            return ramp_uv('fur', sval(NN, occ=1.3 * cr + .25 * sole, hi=.28))
        zs = np.array([.372, .320, .265, .215, .175, .145, .121, .101, .085, .071, .058, .046, .035, .025, .016, .008, .003])
        w_ = smooth(.13, .06, zs)
        cen = np.stack([HIP[0] + (FC[0] - HIP[0]) * w_, HIP[1] + (FC[1] - HIP[1]) * w_ - .012 * smooth(.10, .05, zs) * 0, zs], -1)
        cen[:, 0] = np.where(zs > .13, HIP[0] + (ANK[0] - HIP[0]) * (HIP[2] - zs) / (HIP[2] - ANK[2]), cen[:, 0])
        axd = np.tile([0, 0, -1.], (len(zs), 1))
        ring_stack('fur_leg_foot.' + tag, leg_sdf, cen, axd, 'leg.' + tag, leg_uv, sides=20, tmax=.20, ref=[0, -1., 0])
        LEG[tag] = {'hip': HIP.tolist(), 'knee': [s * .110, .001, .235], 'ankle': ANK.tolist(), 'toe': [s * .135, -.150, .040]}

    # ---------------------------------------------------------------- tail: a curly tuft poking out of the back split
    TAIL_BASE = np.array([0, .150, .318])
    for k, (c, r, o) in enumerate([((0, .208, .310), (.056, .052, .056), (0, 1, -.2)), ((.012, .240, .346), (.046, .044, .046), (.2, 1, .5)),
                                   ((-.010, .230, .384), (.036, .034, .036), (-.2, .6, 1))]):
        lobe('tail_curl_%d' % k, np.array(c), np.array(r), np.array(o, float), 'tail', n=4 if k < 2 else 3, occ_in=.30)

    # ---------------------------------------------------------------- satchel at her left hip: rounded leather bag, flap with a gold star, wide strap
    def sd_box(p, c, axes, h, rr):
        q = np.abs((p - np.asarray(c)) @ np.asarray(axes).T) - (np.asarray(h) - rr)
        return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(np.max(q, axis=1), 0) - rr
    SAT_A, SAT_Z = .900, .335
    Pr0 = robe_env(SAT_A, SAT_Z, T_ROBE / 2)[None][0]; nr0 = robe_n(SAT_A, SAT_Z)
    e_d = unit(np.array([nr0[0], nr0[1], 0]) + np.array([0, -.45, 0])); e_w = unit(np.cross([0, 0, 1.], e_d)); e_h = np.array([0, 0, 1.])
    SAT_H = np.array([.095, .029, .080]); SAT_C = Pr0 + e_d * (SAT_H[1] + .012) + np.array([0, 0, 0])
    SAT_AX = np.array([e_w, e_d, e_h])
    def sat_sdf(p): return sd_box(p, SAT_C, SAT_AX, SAT_H, .026)
    star_mesh('leather_satchel', sat_sdf, SAT_C, 'body', lambda NN, V: ramp_uv('leather', sval(NN, hi=.24)), nth=10, nph=18, tmax=.2, axis=e_h, ref=e_d)
    # flap: over the top and down 62% of the front, rounded lower corners
    def on_box(P0, it=4):
        P = P0.copy()
        for _ in range(it):
            d = sat_sdf(P); g = grad(sat_sdf, P); P = P - g * d[:, None]
        return P, grad(sat_sdf, P)
    uu = np.linspace(-1, 1, 11); vv = np.linspace(0, 1, 10)
    FL = []
    for v in vv:
        for u in uu:
            drop = .64 * (1 - .22 * abs(u) ** 6)
            if v < .30: q = np.array([u * .97 * SAT_H[0], -SAT_H[1] * (1 - 2 * v / .30) * .95, SAT_H[2] + .01])
            else:
                w_ = (v - .30) / .70; q = np.array([u * .97 * SAT_H[0], SAT_H[1] + .01, SAT_H[2] - w_ * drop * 2 * SAT_H[2]])
            FL.append(SAT_C + q @ SAT_AX)
    FL = np.array(FL); FLp, FLn = on_box(FL); FLp = FLp + FLn * .0065
    Vt, Ft, UVt, Nt = thicken(FLp, grid_faces(len(vv), len(uu)), FLn, .008, ramp_uv('leather', sval(FLn, hi=.30) + .06), ramp_uv('leather', .2), ramp_uv('leather', .62), rim=3)
    make_obj('satchel_flap', Vt, Ft, UVt, 'body', N=Nt)
    # gold star: a soft pillow star on the flap
    def sd_star5(px, py, r, rf):
        k1x, k1y = .809016994375, -.587785252292; k2x, k2y = -k1x, k1y
        px = np.abs(px); d1 = np.maximum(k1x * px + k1y * py, 0); px = px - 2 * d1 * k1x; py = py - 2 * d1 * k1y
        d2 = np.maximum(k2x * px + k2y * py, 0); px = px - 2 * d2 * k2x; py = py - 2 * d2 * k2y
        px = np.abs(px); py = py - r
        bax, bay = rf * -k1y - 0, rf * k1x - 1
        h = np.clip((px * bax + py * bay) / (bax * bax + bay * bay), 0, r)
        return np.hypot(px - bax * h, py - bay * h) * np.sign(py * bax - px * bay)
    star_c_v = .30 + .70 * .52
    row = int(round(star_c_v * (len(vv) - 1))); STC = FLp.reshape(len(vv), len(uu), 3)[row, len(uu) // 2] + FLn.reshape(len(vv), len(uu), 3)[row, len(uu) // 2] * .004
    stn = FLn.reshape(len(vv), len(uu), 3)[row, len(uu) // 2]; sx_ = unit(e_w - stn * (e_w @ stn)); sy_ = np.cross(stn, sx_)
    ang = np.linspace(0, 2 * PI, 40, endpoint=False); R_out = []
    for a_ in ang:
        lo, hi = 0., .06
        for _ in range(30):
            m = (lo + hi) / 2; dd = sd_star5(np.array([m * math.sin(a_)]), np.array([m * math.cos(a_)]), .036, .46)[0] - .0035
            lo, hi = (m, hi) if dd < 0 else (lo, m)
        R_out.append(lo)
    R_out = np.array(R_out)
    V = []; NN = []; F = []
    scales = [1.0, .90, .66, .30]; heights = [0, .0050, .0090, .0110]
    for k, (sc, h) in enumerate(zip(scales, heights)):
        ring = STC + (R_out * sc * np.sin(ang))[:, None] * sx_ + (R_out * sc * np.cos(ang))[:, None] * sy_ + stn * h
        V += list(ring)
        tilt = [.0, .55, .40, .18][k]
        radial = unit(np.sin(ang)[:, None] * sx_ + np.cos(ang)[:, None] * sy_)
        NN += list(unit(stn * (1 - tilt) + radial * tilt) if k else unit(radial * .8 + stn * .2))
    c0 = len(V); V.append(STC + stn * .0115); NN.append(stn)
    back_ring = STC + (R_out * .95 * np.sin(ang))[:, None] * sx_ + (R_out * .95 * np.cos(ang))[:, None] * sy_ - stn * .004
    b0 = len(V); V += list(back_ring); NN += list(unit(np.sin(ang)[:, None] * sx_ + np.cos(ang)[:, None] * sy_))
    na = len(ang)
    for k in range(len(scales) - 1):
        for i in range(na): F.append((k * na + i, k * na + (i + 1) % na, (k + 1) * na + (i + 1) % na, (k + 1) * na + i))
    for i in range(na): F.append(((len(scales) - 1) * na + i, (len(scales) - 1) * na + (i + 1) % na, c0))
    for i in range(na): F.append((b0 + i, b0 + (i + 1) % na, (i + 1) % na, i))
    F.append(tuple(range(b0 + na - 1, b0 - 1, -1)))
    V = np.array(V); NN = np.array(NN)
    make_obj('gold_star_on_flap', V, F, ramp_uv('gold', sval(NN, hi=.42)), 'body', N=NN)
    # strap: wide leather band from the satchel up across the chest to her right shoulder, down her back to the satchel
    STRAP = [(.590, .416), (.300, .490), (.000, .560), (-.300, .612), (-.560, .648), (-.820, .676), (-1.10, .690), (-1.45, .694),
             (-1.80, .684), (-2.15, .650), (-2.55, .596), (-2.95, .540), (-3.30, .490), (-3.75, .450), (-4.20, .424), (-4.55, .418), (-4.98, .420)]
    ta = np.array([p[0] for p in STRAP]); tz = np.array([p[1] for p in STRAP])
    k = np.linspace(0, len(ta) - 1, 42); ta_d = np.interp(k, np.arange(len(ta)), ta); tz_d = np.interp(k, np.arange(len(tz)), tz)
    for _ in range(3): ta_d[1:-1] = .25 * ta_d[:-2] + .5 * ta_d[1:-1] + .25 * ta_d[2:]; tz_d[1:-1] = .25 * tz_d[:-2] + .5 * tz_d[1:-1] + .25 * tz_d[2:]
    amod = np.mod(ta_d + PI, 2 * PI) - PI
    in_front = np.abs(amod) < a_front(tz_d)
    near_stole = np.abs(np.abs(amod) - .70) * rbar(tz_d) < .05
    on_collar = (np.abs(amod) > .85) & (tz_d > .595)
    on_sash = np.abs(tz_d - .50) < .032
    lift = np.where(in_front, -.017 + .006, T_ROBE / 2)
    lift = np.maximum(lift, np.where(near_stole & (tz_d > .455) | on_collar, T_ROBE / 2 + 2 * ST_T + .002, -1))
    lift = np.maximum(lift, np.where(on_sash, T_ROBE / 2 + .016, -1))
    for _ in range(6): lift[1:-1] = np.maximum(lift[1:-1], .5 * (lift[:-2] + lift[2:]))         # a taut strap: no dips
    for _ in range(4): lift[1:-1] = .25 * lift[:-2] + .5 * lift[1:-1] + .25 * lift[2:]
    ST_TH = .0045
    tpath = robe_env(ta_d, tz_d, lift + ST_TH + .002); tnorm = robe_n(ta_d, tz_d)
    sweep('leather_strap', tpath, lambda k: (ST_TH, .0148), 'body', lambda NV, tt, uu, V: ramp_uv('leather', sval(NV, hi=.26)), sides=8, normals=tnorm, p=.30)

    # ---------------------------------------------------------------- rubber-duck charm on a short gold loop from the sash
    DX = .040; DZ = .404
    ad = math.asin(DX / bod_ax(DZ)); dfront = RCY - bod_ay(DZ) * math.cos(ad) - .006
    DUCK = np.array([DX, dfront - .033, DZ])
    DS = 1.22                                                    # duck scale (sheet: about 8 cm)
    lobe('duck_body', DUCK + DS * np.array([0, .004, 0]), DS * np.array([.024, .030, .021]), [0, 0, 1.], 'body', ramp='duck', n=3, occ_in=.08, pole=[1., 0, 0])
    lobe('duck_head', DUCK + DS * np.array([0, -.006, .030]), DS * np.array([.018, .018, .018]), [0, -1., .3], 'body', ramp='duck', n=3, occ_in=.05)
    lobe('duck_bill', DUCK + DS * np.array([0, -.026, .027]), DS * np.array([.006, .010, .011]), [0, -1., 0], 'body', ramp='bill', n=2, occ_in=.0, pole=[1., 0, 0])
    for sx in (-1, 1):
        lobe('duck_eye.%d' % sx, DUCK + DS * np.array([sx * .0085, -.020, .036]), DS * np.array([.0035, .0035, .0035]), [sx, -1., 0], 'body', ramp='dark', n=2, occ_in=0)
    lobe('duck_tail', DUCK + DS * np.array([0, .032, .012]), DS * np.array([.010, .012, .009]), [0, 1., .6], 'body', ramp='duck', n=2, occ_in=.05)
    ring_c = DUCK + DS * np.array([0, -.004, .056]); a = np.linspace(0, 2 * PI, 12, endpoint=False)
    path = ring_c + .012 * (np.cos(a)[:, None] * np.array([1., 0, 0]) + np.sin(a)[:, None] * np.array([0, 0, 1.]))
    sweep('duck_loop', list(path) + [path[0]], lambda k: (.0042, .0042), 'body', lambda NV, tt, uu, V: ramp_uv('gold', sval(NV, hi=.4)), sides=7, cap0=False, cap1=False)

    # ---------------------------------------------------------------- joints and pivots for the rig phase
    NECK_J = [0, .005, .672]
    JOINTS_BODY = {'hips': [0, .006, .365], 'spine': [0, .000, .470], 'chest': [0, -.006, .590], 'neck': NECK_J,
                   'arms': {t: {k: v for k, v in ARM[t].items() if k != 'palm'} for t in ARM}, 'legs': LEG,
                   'tail': [TAIL_BASE.tolist(), [0, .208, .310], [.012, .240, .346], [-.010, .230, .384]],
                   'palm_R': ARM['R']['palm'], 'palm_L': ARM['L']['palm'],
                   'palm_R_grip_axis': [0, 0, 1.], 'satchel': SAT_C.tolist(), 'duck': DUCK.tolist()}
    BODY_PIVOTS = {'arm.L': tuple(ARM['L']['shoulder']), 'arm.R': tuple(ARM['R']['shoulder']), 'leg.L': tuple(LEG['L']['hip']),
                   'leg.R': tuple(LEG['R']['hip']), 'tail': tuple(TAIL_BASE), 'body': (0, 0, 0)}

    # ---------------------------------------------------------------- 2-D chart painters (parameter space)
    def star_mask(px, pz, cx, cz, R, kind, rot=0.):
        dx = px - cx; dz = pz - cz
        if rot: c_, s_ = math.cos(rot), math.sin(rot); dx, dz = c_ * dx - s_ * dz, s_ * dx + c_ * dz
        if kind == 5: d = sd_star5(dx, dz, R, .45) - .0025
        else:
            d = (np.abs(dx) ** .55 + np.abs(dz) ** .55) ** (1 / .55) - R
        return 1 - smooth(-.0012, .0012, d)
    ROBE_STARS_FRONT = [(.055, .205, .028, 5, .2), (.125, .262, .012, 4, 0), (.185, .180, .021, 5, -.3), (.040, .300, .011, 4, 0), (.245, .236, .012, 4, 0),
                        (.110, .150, .010, 4, 0)]
    ROBE_STARS_BACK = [(.30, .205, .028, 5, .1), (.62, .262, .014, 4, 0), (.88, .170, .021, 5, -.2), (.18, .318, .011, 4, 0), (1.10, .238, .012, 4, 0)]
    def paint_robe(U, V, lining=False):
        z = ZH + V * (ZT - ZH); af = a_front(z); a = af + U * (2 * PI - 2 * af); rb = rbar(z)
        ab = a_back(z)
        d_front = np.minimum(a - af, 2 * PI - af - a) * rb
        d_hem = z - ZH; d_top = ZT - z
        d_slit = np.where(gap(z) > 1e-5, (np.abs(a - PI) - ab) * rb, 9.)
        d = np.minimum(np.minimum(d_front, d_hem), np.minimum(d_top, d_slit))
        if lining:
            C = mix(rgb('lining'), rgb('#8a76c2'), .45 * smooth(.40, .13, z))
            return mix(C, rgb('gold'), 1 - smooth(.006, .008, d))
        fl = np.cos(7 * a + .5) * smooth(.45, .13, z)
        C = mix(rgb('robe'), rgb('robelight'), .35 * smooth(.45, .70, z))
        C = mix(C, rgb('robedark'), .22 * smooth(.40, .13, z) + .10 * np.maximum(0, -fl))
        C = mix(C, rgb('robelight'), .10 * np.maximum(0, fl))
        gold = 1 - smooth(.0175, .0195, d)
        s_left = (a - af) * rb; s_right = (2 * PI - af - a) * rb
        st = np.zeros_like(z)
        for (sx, sz_, R, kind, rot) in ROBE_STARS_FRONT:
            for sarc, sg in ((s_left, 1), (s_right, -1)):
                m = (np.abs(sarc - sx) < .05) & (np.abs(z - sz_) < .05)
                if m.any(): st[m] = np.maximum(st[m], star_mask(sarc[m], z[m], sx, sz_, R, kind, rot * sg))
        s_back = (a - PI) * rb
        for (sx, sz_, R, kind, rot) in ROBE_STARS_BACK:
            for sg in (1, -1):
                cx = sg * (sx * rb.mean() / rb.mean()) * .26 / .26
                m = (np.abs(s_back - sg * sx * .26) < .05) & (np.abs(z - sz_) < .05)
                if m.any(): st[m] = np.maximum(st[m], star_mask(s_back[m], z[m], sg * sx * .26, sz_, R, kind, rot * sg))
        # thin gold seam lines down the back panels
        for sg in (1, -1):
            t = clamp((.46 - z) / (.46 - .14)); line_s = sg * (.105 + .085 * t)
            st = np.maximum(st, (1 - smooth(.0028, .0042, np.abs(s_back - line_s))) * (z < .46) * (z > .14))
        gcol = mix(rgb('gold'), rgb('goldlight'), .25 * smooth(.3, .7, V))
        return mix(C, gcol, np.maximum(gold, st))
    def paint_sleeve(U, V):
        L_ = .21
        C = mix(rgb('robe'), rgb('robelight'), .30 * (1 - V))
        C = mix(C, rgb('robedark'), .12 * smooth(.4, 1, V))
        dcuff = (1 - V) * L_
        g = (1 - smooth(.016, .019, dcuff)) * smooth(.002, .004, dcuff)
        return mix(C, rgb('gold'), g)
    def paint_bodice(U, V):
        a = (U - .5) * 2 * PI; z = .465 + V * (.712 - .465); x = bod_ax(z) * np.sin(a); front = np.cos(a) > 0
        C = mix(rgb('robe'), rgb('robelight'), .25 * smooth(.50, .70, z))
        zv = .552
        def lap(sg):     # distance to one lapel line, from the neck side down to the crossing
            x0, z0, x1, z1 = sg * .072, .712, -sg * .012, zv - .004
            tx, tz = x1 - x0, z1 - z0; L2 = tx * tx + tz * tz; t = np.clip(((x - x0) * tx + (z - z0) * tz) / L2, 0, 1)
            return np.hypot(x - (x0 + t * tx), z - (z0 + t * tz)), (x - x0) * tz - (z - z0) * tx
        dl, sl = lap(1); dr, sr = lap(-1)
        inside_v = (z > zv) & (np.abs(x) < (z - zv) * .52) & front
        C = mix(C, rgb('robelight'), .55 * inside_v)
        band = (np.minimum(dl, dr) < .013) & front & (z > zv - .012)
        C = mix(C, rgb('#c4b2f0'), .8 * band)
        gl = ((1 - smooth(.0022, .0036, np.abs(np.minimum(dl, dr) - .0005))) + (1 - smooth(.0022, .0036, np.abs(np.minimum(dl, dr) - .013)))) * front * (z > zv - .012)
        return mix(C, rgb('gold'), clamp(gl))
    BODY_PAINTERS = {'robe': lambda U, V: paint_robe(U, V), 'lining': lambda U, V: paint_robe(U, V, True), 'sleeve': paint_sleeve, 'bodice': paint_bodice}


# ============================================================== PAINTED ATLAS
def stroke(x, z, P, half, aa):
    best = np.full(len(x), 9.)
    for i in range(len(P) - 1):
        a = P[i]; b = P[i + 1]; ab = b - a; L2 = ab @ ab
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        dx = x - (a[0] + t * ab[0]); dz = z - (a[1] + t * ab[1])
        best = np.minimum(best, np.sqrt(dx * dx + dz * dz) - (half[i] * (1 - t) + half[i + 1] * t))
    return 1 - smooth(-aa, aa, best)
def lash_th(psi):      # thick on top, a pointed wing at the outer corner
    return (.05 + .22 * np.sin(np.clip(psi, 0, PI)) ** .6 + .11 * np.exp(-((psi - .28) / .33) ** 2)) * smooth(-.10, .28, psi)

PAINT_OPTS = {'band': True, 'blush': True}   # the rig paints its eyelids from this skin with the lash band / blush switched off
def paint_head(U, V):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = radial_hit(d); n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); zr = q[:, 2]
    fr = smooth(HY + .04, HY - .06, y)
    up = n @ LIGHT
    C = mix(rgb('fur'), rgb('furlight'), .62 * smooth(.25, 1.0, up))
    rc = np.sqrt((x / (.50 * W)) ** 2 + ((z - (CHIN + .24 * W)) / (.36 * W)) ** 2)
    C = mix(C, rgb('muzzle'), .88 * (1 - smooth(.25, 1.0, rc)) * fr)                    # warm #8c5a40 cheeks and muzzle
    C = mix(C, rgb('furdark'), .45 * smooth(.0, .9, -up))
    # soft muzzle: slightly lighter, rounded
    rm = np.sqrt((((q - np.array(BLOB['M'][0])) / (np.array(BLOB['M'][1]) * np.array([1.10, 1.25, 1.18]))) ** 2).sum(1))
    rj = np.sqrt((((q - np.array(BLOB['J'][0])) / (np.array(BLOB['J'][1]) * 1.15)) ** 2).sum(1))
    C = mix(C, mix(rgb('muzzle'), rgb('curllight'), .25 * smooth(.3, 1, up)), .80 * (1 - smooth(.80, 1.05, np.minimum(rm, rj))) * fr)
    # the under-jaw in the chin's shade
    C = mix(C, rgb('furdark'), .35 * smooth(-.02, -.10, zr) * smooth(-.2, -.7, n[:, 2]))
    # nose button and its highlight
    rn = np.sqrt((((q - np.array(NOSE[0])) / np.array(NOSE[1])) ** 2).sum(1))
    C = mix(C, rgb('nose'), .97 * (1 - smooth(.92, 1.25, rn)))
    hl = np.exp(-(((q - (np.array(NOSE[0]) + np.array([-.020, -.032, .022]))) / np.array([.024, .02, .014])) ** 2).sum(1))
    C = mix(C, rgb('nosehi'), .75 * hl)
    # blush ovals
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .75 * (1 - smooth(.30, 1.05, r)) * fr * PAINT_OPTS['blush'])
    # brows: soft tapering arcs
    t = np.linspace(-1, 1, 15)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * .090 * W * t, BROW_Z + .018 * W * (1 - t * t) - .006 * W * t], -1)
        half = .0200 * W * np.maximum(0, 1 - t * t) ** .75 + .0014 * W
        ib = (fr > 0) & (np.abs(x - s * BROW_X) < .14 * W) & (np.abs(z - BROW_Z) < .07 * W)
        a = np.zeros(len(x)); a[ib] = stroke(x[ib], z[ib], Pb, half, .0035 * W)
        C = mix(C, rgb('brow'), .92 * a * fr)
    # mouth: a small closed "w" smile, with a short line up to the nose
    tm = np.linspace(0, 1, 9)
    lobeL = np.stack([-.006 * W - (MHW - .006 * W) * tm, MZ + .006 * W - .026 * W * np.sin(PI * tm) ** 1.1 + .020 * W * tm ** 3], -1)
    lobeR = lobeL * np.array([-1, 1]) + np.array([0, 0])
    Pm = np.concatenate([lobeL[::-1], lobeR[1:]])
    half = np.full(len(Pm), .0062 * W); half[[0, -1]] = .0030 * W
    Pph = np.array([[0, MZ + .010 * W], [0, NZ - .040 * W]]); hph = np.array([.0052 * W, .0048 * W])
    ib = (fr > 0) & (np.abs(x) < .18 * W) & (z > MZ - .06 * W) & (z < NZ)
    a = np.zeros(len(x)); a[ib] = np.maximum(stroke(x[ib], z[ib], Pm, half, .0030 * W), stroke(x[ib], z[ib], Pph, hph, .0030 * W))
    C = mix(C, rgb('mouth'), .92 * a)
    # upper lash band with a small outer wing and 3 short lashes at the outer corner
    for s in (-1, 1):
        sr, psi, X, Z = eye_s(s, x, z)
        near_eye = fr * (sr < 1.9)
        th = lash_th(psi); up_w = smooth(-.12, -.04, psi) * (psi > -1.2)
        lash = (1 - smooth(1 + th - .012, 1 + th + .012, sr)) * up_w * PAINT_OPTS['band']
        a = np.zeros(len(x))
        for pk, L, gam in [(.20, .060, .18), (.42, .062, .46), (.66, .050, .74)]:
            bxk, bzk = eye_xz(s, np.array([pk]), 1 + float(lash_th(np.array([pk]))[0]) * .55)
            tt_ = np.linspace(0, 1, 6); dirx = np.cos(gam + .35 * tt_); dirz = np.sin(gam + .35 * tt_)
            Pf_ = np.stack([bxk[0] + s * L * W * tt_ * dirx, bzk[0] + L * W * tt_ * dirz], -1)
            hf = .0078 * W * (1 - tt_) ** .9 + .0012 * W
            ib = (near_eye > 0) & (np.abs(x - Pf_[:, 0].mean()) < .08 * W) & (np.abs(z - Pf_[:, 1].mean()) < .08 * W)
            aa = np.zeros(len(x)); aa[ib] = stroke(x[ib], z[ib], Pf_, hf, .0028 * W); a = np.maximum(a, aa)
        C = mix(C, rgb('lash'), np.maximum(lash, a) * near_eye)
    return C.reshape(sh + (3,))

def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .22; iz = .00; irx = .78; irz = .90
    C = mix(rgb('sclera'), rgb('#ead8cc'), .40 * smooth(.45, .98, Z))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    g = smooth(.55, -.80, ez)                                   # 0 at the top (under the lash) .. 1 at the bottom
    I = mix(rgb('#5a3416'), rgb('#9a5a22'), smooth(0., .45, g))
    I = mix(I, rgb('iris'), smooth(.35, .80, g))
    I = mix(I, rgb('#f4c25c'), .70 * smooth(.72, 1.0, g) * (1 - smooth(.86, .98, r)))      # the bright lower amber band
    I = mix(I, rgb('#3a2010'), .55 * smooth(.84, 1.0, r))                                  # soft darker rim
    I = I * (1 - .03 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 30 + r * 10)) * smooth(.4, .8, r))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    pz = iz + .07 * irz; R = np.sqrt(((X - ix) / (.72 * irx)) ** 2 + ((Z - pz) / (.72 * irz)) ** 2)
    C = mix(C, rgb('pupil'), 1 - smooth(.93, 1.05, R))
    hx = ix - .30 * irx; hz = pz + .40 * irz
    big = np.sqrt(((X - hx) / (.24 * irx)) ** 2 + ((Z - hz) / (.21 * irz)) ** 2)
    small = np.sqrt(((X - (ix + .32 * irx)) / (.085 * irx)) ** 2 + ((Z - (pz - .34 * irz)) / (.075 * irz)) ** 2)
    C = mix(C, rgb('#fffaf2'), np.maximum(1 - smooth(.94, 1.06, big), 1 - smooth(.90, 1.10, small)))
    C = mix(C, rgb('lash'), smooth(.93, 1.0, sr) * smooth(.0, .45, Z))
    C = mix(C, rgb('#b88a74'), .55 * smooth(.95, 1.02, sr) * smooth(.05, -.40, Z))   # the lower lid contact: no pale seam
    return C

def paint_ramp(U, V):
    rows = np.clip((V * CHARTS['ramp'][3] / 32).astype(int), 0, len(RAMPS) - 1); C = np.zeros(U.shape + (3,))
    for name, k in RAMP_ROWS.items():
        m = rows == k
        if not m.any(): continue
        lo, base, hi = [rgb(c) for c in RAMPS[name]]
        u = U[m]; C[m] = np.where((u < .5)[:, None], mix(lo, base, smooth(0, .5, u)), mix(base, hi, smooth(.5, 1, u)))
    return C

def ramp_colour(name, u):
    lo, base, hi = [rgb(c) for c in RAMPS[name]]; u = clamp(u)
    return np.where((u < .5)[..., None], mix(lo, base, smooth(0, .5, u)), mix(base, hi, smooth(.5, 1, u)))
def paint_ear(U, V, tag):
    G, GN, vs, LUMPS, ear_parts, s_ = EAR_PAINT[tag]; R, C1 = G.shape[:2]; sh = U.shape
    u = U.ravel(); v = V.ravel()
    fi = np.clip(u * (C1 - 1), 0, C1 - 1 - 1e-6); fj = np.clip(np.interp(v, vs, np.arange(R)), 0, R - 1 - 1e-6)
    i0 = fi.astype(int); j0 = fj.astype(int); ti = (fi - i0)[:, None]; tj = (fj - j0)[:, None]
    def bil(A): return (A[j0, i0] * (1 - ti) + A[j0, i0 + 1] * ti) * (1 - tj) + (A[j0 + 1, i0] * (1 - ti) + A[j0 + 1, i0 + 1] * ti) * tj
    Pp = bil(G); Nn = unit(bil(GN))
    D, dc, dw = ear_parts(Pp)
    order = np.argsort(D, 0); k1 = order[0]; k2 = order[1]; n_ = np.arange(len(Pp))
    d1 = D[k1, n_]; d2 = D[k2, n_]
    dsm = dc.copy()
    for k in range(len(D)): dsm = smin(dsm, D[k], K_LUMP)
    crease = np.clip((np.minimum(np.minimum(d1, dc), dw) - dsm) / K_LUMP, 0, .25)
    g = np.zeros(len(Pp))
    for k, (c, Rm, rad, out, gt, grot) in enumerate(LUMPS):
        m = k1 == k
        if not m.any(): continue
        q = unit(((Pp[m] - c) @ Rm) / rad); o = unit(out @ Rm / rad)
        t1 = unit(np.cross(o, [0, 0, 1.]) if abs(o[2]) < .9 else np.cross(o, [1., 0, 0])); t2 = np.cross(o, t1)
        cth = q @ o; rho = np.sqrt(np.maximum(0, 1 - cth * cth)); phi = np.mod(np.arctan2(q @ t2, q @ t1) + grot, 2 * PI)
        if gt == 'C':
            gg = np.exp(-((rho - .56) / .085) ** 2) * smooth(.15, .55, phi) * (1 - smooth(3.7, 4.3, phi))
        else:
            rs = .12 + .62 * phi / (2 * PI)
            gg = np.maximum(np.exp(-((rho - rs) / .075) ** 2), np.exp(-((rho - rs + .62) / .075) ** 2) * (phi > 5.0)) * smooth(.05, .30, phi)
        g[m] = gg * smooth(.0, .35, cth) * smooth(0, .010 * W, d2[m] - d1[m])
    inner = smooth(.15, .90, -Nn[:, 0] * s_)
    val = sval(Nn, occ=2.2 * crease + .16 * inner + .40 * g, hi=.34)
    return ramp_colour('curl', val).reshape(sh + (3,))
PAINTERS = {'head': paint_head, 'eye.L': lambda U, V: paint_eye(U, V, 1), 'eye.R': lambda U, V: paint_eye(U, V, -1), 'ramp': paint_ramp,
            'ear.L': lambda U, V: paint_ear(U, V, 'L'), 'ear.R': lambda U, V: paint_ear(U, V, 'R'),
            'cavity': lambda U, V: mix(rgb('#4a1c1c'), rgb('#3a1414'), .5 * smooth(.3, 1, V)),
            'tongue': lambda U, V: mix(rgb('#e07a86'), rgb('#ec96a0'), .5 * smooth(.2, .9, V))}
PAINTERS.update(globals().get('BODY_PAINTERS', {}))
atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [122, 74, 52, 255]
for name, (x0, y0, w, h) in CHARTS.items():
    if name not in PAINTERS: continue
    if name == 'ramp':
        U, V = np.meshgrid(clamp((np.arange(w) - 8) / (w - 16)), (np.arange(h) + .5) / h)
    else:
        U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
    block = np.empty((h, w, 3))
    for r0 in range(0, h, 160):
        block[r0:r0 + 160] = PAINTERS[name](U[r0:r0 + 160], V[r0:r0 + 160])
    atlas[y0:y0 + h, x0:x0 + w, :3] = np.round(clamp(block) * 255).astype(np.uint8)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
atlas_path = os.path.join(ROOT, 'scratch', 'head_atlas.png') if HEAD_ONLY else os.path.join(ROOT, 'scratch' if RIG else '', 'rig_base_atlas.png' if RIG else 'moka-toy_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Moka_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Moka_toy_atlas'); MAT.use_nodes = True
bs = MAT.node_tree.nodes.get('Principled BSDF'); bs.inputs['Roughness'].default_value = .8
bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .25
tx = MAT.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
MAT.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])

# ============================================================== MEASURE (before joining)
def all_verts(obs): return np.array([list(o.matrix_world @ v.co) for o in obs for v in o.data.vertices])
sk = np.array([list(v.co) for v in skin.data.vertices])
front_sk = sk[(sk[:, 1] < HY + .02) & ~in_hat(sk)]
nose_tip_y = HY + NOSE_TIP_L * W
def prof_at(zw, xw=0.): return round(float((front_hit(xw * W, CHIN + zw * W)[0] - nose_tip_y) / W), 3)
_xs = np.linspace(-.52, .52, 209) * W
def sil_at(zw): return float((np.nanmin(front_hit(_xs, np.full(len(_xs), CHIN + zw * W))) - nose_tip_y) / W)
def eye_margin():
    worst = 9.; psi = np.linspace(0, 2 * PI, 90, endpoint=False)
    for s in (-1, 1):
        for k in (1.0, 1.12, 1.25, 1.35):
            x, z = eye_xz(s, psi, k); y = front_hit(x, z)
            for xi, yi, zi, pi in zip(x, y, z, psi):
                if k > 1 and math.sin(pi) < -.2: continue
                worst = min(worst, (yi - np.nanmin(front_hit(_xs, np.full(len(_xs), zi)))) / W)
    return round(float(worst), 3)
rimL = np.array([verts[i] for i in roll_info[1][0]])
hatv = all_verts(parts['hat']); earL = all_verts(parts['ear.L']); earR = all_verts(parts['ear.R'])
brim_v = all_verts([o for o in parts['hat'] if 'brim' in o.name])
def width_at(vs, z0, z1): sel = vs[(vs[:, 2] > z0) & (vs[:, 2] < z1)]; return float(np.ptp(sel[:, 0])) if len(sel) else 0.
cheek_rows = {}
for zw in (.05, .11, .175, .25, .31):
    xs_ = np.linspace(0, .7, 351) * W; ys_ = front_hit(xs_, np.full(len(xs_), CHIN + zw * W)); ok = np.isfinite(ys_)
    cheek_rows['%.3f' % zw] = round(float(2 * xs_[ok].max() / W), 3) if ok.any() else None
brim_front_low = brim_v[(np.abs(brim_v[:, 0]) < .02)]; brim_front_low = brim_front_low[brim_front_low[:, 1] < HY]
_g = np.stack(np.meshgrid(np.zeros(1), np.linspace(-.4, .4, 81), np.linspace(.5, 1.1, 241), indexing='ij'), -1).reshape(-1, 3)
SKULL_TOP_W = round(float(_g[base_local(_g, fill=False) < 0][:, 2].max()), 3)
MEAS = {'units': 'W = %.3f m face width; z = above the chin in W; profile b = behind the nose tip in W' % W,
        'chin_z_m': CHIN, 'face_width_rows_W(z: width)': cheek_rows,
        'skull_top_above_chin_W_x0': SKULL_TOP_W,
        'nose_tip_y_m': round(float(nose_tip_y), 4),
        'profile': {'nose_tip': [0, NZW], 'muzzle_z0.20': prof_at(.20), 'mouth_z0.16': prof_at(.16), 'chin_z0.10': prof_at(.10),
                    'chin_z0.04': prof_at(.04), 'face_plane_x0_z0.37': prof_at(.37), 'forehead_z0.58': prof_at(.58),
                    'brow_z0.67': prof_at(.67), 'eye_white_front_edge': round(float((rimL[:, 1].min() - nose_tip_y) / W), 3),
                    'eye_white_back_edge': round(float((rimL[:, 1].max() - nose_tip_y) / W), 3),
                    'eye_and_lash_margin_inside_silhouette': eye_margin(),
                    'muzzle_proud_of_face_plane': round(prof_at(.37) - prof_at(.20), 3)},
        'eye_opening_W': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'eye_centre_W': [EXW, EZW], 'nose_z_W': NZW, 'mouth_z_W': .16, 'brow_z_W': round((BROW_Z - CHIN) / W, 3), 'brow_x_W': round(BROW_X / W, 3), 'blush_xz_W': [round(BLUSH[0] / W, 3), round((BLUSH[1] - CHIN) / W, 3)],
        'iris_bottom_z_W': round(EZW - .90 * EHHW, 3), 'nose_top_z_W': round(NOSE[0][2] + NOSE[1][2], 3),
        'topknot_bottom_z_W': round(float((all_verts([o for o in parts['head'] if 'topknot' in o.name])[:, 2].min() - CHIN) / W), 3),
        'topknot_width_W': round(float(np.ptp(all_verts([o for o in parts['head'] if 'topknot' in o.name])[:, 0]) / W), 3),
        'hat_top_z_m': round(float(hatv[:, 2].max()), 3), 'hat_tip_bend_x_W': round(float(TIP_M[0] / W), 3),
        'brim_width_W': round(float(np.ptp(brim_v[:, 0]) / W), 3),
        'brim_front_lower_edge_z_W': round(float((brim_front_low[:, 2].min() - CHIN) / W), 3) if len(brim_front_low) else None,
        'brim_side_lowest_z_W': round(float((brim_v[np.abs(brim_v[:, 0]) > .60 * W][:, 2].min() - CHIN) / W), 3),
        'brim_back_lowest_z_W': round(float((brim_v[brim_v[:, 1] > HY + .5 * W][:, 2].min() - CHIN) / W), 3),
        'ears_outer_width_W_at_shoulder': round(float((earL[:, 0].max() - earR[:, 0].min()) / W), 3),
        'ear_bottom_below_chin_m': round(float(CHIN - min(earL[:, 2].min(), earR[:, 2].min())), 3),
        'ear_depth_front_back_W': round(float(np.ptp(earL[:, 1]) / W), 3),
        'ear_front_edge_behind_nose_W': round(float((earL[:, 1].min() - nose_tip_y) / W), 3)}
def ear_profile(vs, s):
    out = {}
    for zw in (.5, .4, .3, .2, .1, .0, -.1, -.2, -.3, -.4):
        sel = vs[np.abs((vs[:, 2] - CHIN) / W - zw) < .015]
        if len(sel):
            xo = (sel[:, 0] * s).max() / W; xi = (sel[:, 0] * s).min() / W
            out['%.1f' % zw] = {'outer_x': round(float(xo), 3), 'inner_x': round(float(xi), 3), 'width': round(float(xo - xi), 3),
                                'depth': round(float(np.ptp(sel[:, 1]) / W), 3)}
    return out
MEAS['ear_profile_L'] = ear_profile(earL, 1); MEAS['ear_profile_R'] = ear_profile(earR, -1)
MEAS.update(LOG)
# iris visibility from the 45-degree game cameras (yaw +45 / -45, pitch 45 and 42), ray-cast against every other part
from mathutils.bvhtree import BVHTree
occ_v = []; occ_f = []; occ_name = []
for g, obs in parts.items():
    if g.startswith('eye'): continue
    for o in obs:
        o0 = len(occ_v); occ_v += [tuple(o.matrix_world @ v.co) for v in o.data.vertices]; occ_f += [tuple(o0 + i for i in p.vertices) for p in o.data.polygons]
        occ_name += [o.name] * len(o.data.polygons)
BLOCKERS = {}; HITS = []
BVH = BVHTree.FromPolygons(occ_v, occ_f)
def iris_vis(s, cam):
    cx = s * EX; vis = 0; tot = 0
    for rr_ in (0., .35, .7, .95):
        for th_ in np.linspace(0, 2 * PI, 12 if rr_ > 0 else 1, endpoint=False):
            px = cx + (-s * .22 + .78 * rr_ * math.cos(th_)) * EHW; pz = EZ + (.90 * rr_ * math.sin(th_)) * EHH
            py = float(front_hit(np.array([px]), np.array([pz]))[0]) - .002
            p = Vector((px, py, pz)); d = (Vector(cam) - p).normalized()
            hit = BVH.ray_cast(p + d * .004, d, 20.); tot += 1; vis += hit[0] is None
            if hit[0] is not None:
                BLOCKERS[occ_name[hit[2]]] = BLOCKERS.get(occ_name[hit[2]], 0) + 1
                HITS.append((occ_name[hit[2]], [round(float(v), 3) for v in M2L(np.array(hit[0]))]))
    return round(vis / tot, 3)
VIS = {}
for pitch in (45, 42):
    for yaw in (45, -45):
        e = math.radians(pitch); y_ = math.radians(yaw)
        cam = np.array([0, 0, .72]) + 7 * np.array([math.sin(y_) * math.cos(e), -math.cos(y_) * math.cos(e), math.sin(e)])
        VIS['pitch%d_yaw%+d' % (pitch, yaw)] = {'eye_L': iris_vis(1, cam), 'eye_R': iris_vis(-1, cam)}
MEAS['iris_visible_fraction_game_camera'] = VIS
_bo = [o for o in parts['hat'] if 'brim' in o.name][0]
BBVH = BVHTree.FromPolygons([tuple(_bo.matrix_world @ v.co) for v in _bo.data.vertices], [tuple(p.vertices) for p in _bo.data.polygons])
POKE = {}; POKE_PTS = []
for g in ('head', 'ear.L', 'ear.R'):
    for o in parts[g]:
        n_ = 0
        for v in o.data.vertices:
            p = o.matrix_world @ v.co
            if p.z < CHIN + .30 * W or in_hat(np.array([list(p)]))[0]: continue
            if BBVH.ray_cast(p, Vector((0, 0, -1)), 1.0)[0] is not None:
                n_ += 1; POKE_PTS.append([round(float(c), 3) for c in M2L(np.array(list(p)))])
        if n_: POKE[o.name] = n_
MEAS['vertices_poking_above_brim'] = POKE
print('POKE', json.dumps(POKE), json.dumps(POKE_PTS[:12]), flush=True)
print('IRIS_VIS', json.dumps(VIS), 'BLOCKERS', json.dumps(BLOCKERS), flush=True)
print('HITS', json.dumps(HITS[:60]), flush=True)

# ============================================================== JOIN, CLEAN, NORMALS
GROUP_NAMES = {}
objects = []; part_tri = {}
PIVOTS = {'head': tuple(O), 'hat': tuple(L2M(HAT_O)), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'],
          'ear.L': tuple(ear_info['L']['base']), 'ear.R': tuple(ear_info['R']['base'])}
PIVOTS.update(globals().get('BODY_PIVOTS', {}))
OBJ_TRIS = {}
for group, obs in parts.items():
    for ob in obs: ob.data.calc_loop_triangles(); OBJ_TRIS[ob.name] = len(ob.data.loop_triangles)
print('OBJ_TRIS', json.dumps(dict(sorted(OBJ_TRIS.items(), key=lambda kv: -kv[1])[:40])), flush=True)
for group, obs in parts.items():
    for ob in obs:
        ob.data.materials.clear(); ob.data.materials.append(MAT)
        if RIG:
            vg = ob.vertex_groups.new(name='_part_' + ob.name); vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs: ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1: bpy.ops.object.join()
    ob = bpy.context.object; ob.name = 'Moka_' + group.replace('.', '_'); ob.data.name = ob.name
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
    me.calc_loop_triangles(); part_tri[group] = len(me.loop_triangles); objects.append(ob)
tri_count = sum(part_tri.values()); print('PART_TRIANGLES', json.dumps(part_tri), flush=True)
HEADSET = sum(v for k, v in part_tri.items() if k in ('head', 'hat', 'eye.L', 'eye.R', 'ear.L', 'ear.R'))
MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count; MEAS['head_ears_hat_eyes_triangles'] = HEADSET
MEAS['head_share'] = round(HEADSET / max(tri_count, 1), 3)
if RIG:
    pass
elif not HEAD_ONLY:
    assert tri_count <= 32000, ('Triangle budget', tri_count)
    joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X'}
    joints.update(JOINTS_BODY)
    joints['head'] = [float(v) for v in O]
    joints['jaw_pivot'] = [0, float(HY - .10 * W), float(CHIN + .10 * W)]
    joints['eyes'] = eye_centers
    joints['ears'] = {t: {'base': [float(v) for v in ear_info[t]['base']], 'fold': [float(v) for v in ear_info[t]['tie']],
                          'tip': [float(v) for v in ear_info[t]['tip']]} for t in ('L', 'R')}
    joints['hat'] = {'pivot': [float(v) for v in L2M(HAT_O)], 'tip': [float(v) for v in TIP_M], 'moon': [float(v) for v in MOON_C]}
    joints['notes'] = ['Phase 1: no rig, weights or animations. Same keys as rosie-opus joints.json plus palm_R / palm_L (and hat, satchel, duck).',
                       'head = the head centre (radial origin), not the nod pivot; the rig should put the head bone at the base of the skull.',
                       'Head skin = zero surface of a smooth SDF ball (cranium + cheek + brow + lower-cheek + muzzle + chin + hidden hat fill + nose), analytic normals.',
                       'Eyelid holes ringed by 6 loops each with the rim rolled 4.5 mm in behind separate lens eyeballs; 3 loops round the mouth, 4 round the nose.',
                       'Ears: separate pieces (Moka_ear_L / _R), 11 curl lobes stacked along the length + ribbon tie; pivot = ears.base, fold = the tie.',
                       'Hat: one rigid piece (Moka_hat), pivot = hat.pivot (band base centre). Tail: Moka_tail, pivot = tail[0].',
                       'palm_R: centre of the softly closed right fist (a staff passes through it along palm_R_grip_axis); palm_L: relaxed mitten palm.',
                       'Outer robe: open front, back split from z 0.47 m (wider round the tail), 18 rings x 44 columns; sleeves 10 rings; limbs are ring stacks (joint loops).']
    with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
elif HEAD_ONLY:
    with open(os.path.join(ROOT, 'scratch', 'measurements-head.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not HEAD_ONLY and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'moka-toy.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG:
    bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                              export_animations=False)
print('MOKA_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
