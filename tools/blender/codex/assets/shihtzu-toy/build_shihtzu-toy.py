"""Shih Tzu Knight / Gloomhowl Warlock-Knight (male Shih Tzu dark knight), Toybox line, phase-1 model.
Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_shihtzu-toy.py [-- --head-only]

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder,
public/models/shihtzu-toy.glb and public/models/shihtzu-flail.glb (--head-only writes scratch/head-test.glb instead).

Technique (the Poe / Moka / Rosie toy-line machinery):
- The head is ONE smooth implicit ball: a round squircle skull, two moustache lobes, a beard puff, two cheek puffs, a nose
  pad and a small wide nose button, with a set-in socket warp for each eye. The skin is the field's zero surface reached
  by radial projection (CDT in a stereographic domain, with edge loops round the eyelids, nose and mouth), so every vertex
  carries its analytic normal. Adaptive refinement adds points where the game's hard toon band would zigzag. The eyes are
  separate lens globes following the ball (about 30 deg outward).
- The ear locks are fat clay tubes (5 per side) draped over the skull and hanging to the shoulders; the topknot is a
  plum band, a silver paw bead and a cluster of white clay lobes.
- Clothing is lathed / swept / thickened surfaces and SDF star meshes; limbs are SDF ring stacks.
- One 2048 painted atlas: the face and eyes painted from 3D positions, 2D charts for the armour top, cloak, tabard,
  tail, tome, buckle and bead, and 1-D shading ramps (soft painted light) for everything else.
- The flail is its own prop (its own small material plus a *glow* material), exported separately.
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
MODEL = 'D:/projects/chewy-life-3d/public/models/shihtzu-toy.glb'
FLAIL_MODEL = 'D:/projects/chewy-life-3d/public/models/shihtzu-flail.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'head-test.glb') if HEAD_ONLY else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(11)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
# Sheet (refs/sheet.png): front view crown y 100 / ground 466 (366 px = 1.20 m, chewy-b.glb's crown); head close-up
# crown 554 / chin 711 (H 157 px), face width between the ear locks at the cheeks W 154 px (W:H 0.98).
T_CROWN = 1.200
W = .528; CHIN = .662; HY = -.040          # head width unit (the face between the ear locks at the cheeks), chin, head centre y
LOG = {}
# FACE_RULE: the brief asks for the iris bottom at or above the nose top; the sheet has the nose top 0.09 W above the
# iris bottom. 'brief' raises the eyes 0.034 W and lowers the nose 0.060 W so the rule holds; 'sheet' keeps the sheet.
FACE_RULE = 'sheet'      # round 2 (director): flat-faced like Poe, follow the sheet

PAL = {'fur': '#2C2A30', 'furlight': '#4A4450', 'furdark': '#1E1C22', 'sheen': '#5A5462',
       'white': '#F4F0EA', 'whitelight': '#FFF6EA', 'whitedark': '#D9CFC4', 'crease': '#B8ACA2',
       'nose': '#1E1C22', 'nosehi': '#7A7484',
       'sclera': '#FFF5E8', 'iris': '#C88A3A', 'pupil': '#1A120E',
       'lash': '#141216', 'mouth': '#6A5C5A', 'blush': '#E9A4AC',
       'plum': '#4A2A4A', 'plumlight': '#6A3E66', 'plumdark': '#331C33',
       'armour': '#34303E', 'armourlight': '#4C4758', 'armourdark': '#24212C',
       'silver': '#C8CCD8', 'silverlight': '#F2F4FA', 'silverdark': '#8C90A0',
       'teal': '#5CE0C0', 'teallight': '#B4FFF0', 'tealdark': '#2FA88E',
       'belt': '#2A2830', 'beltlight': '#433F4C', 'beltdark': '#1A181E',
       'page': '#EFE4CC', 'dark': '#1A171C'}
CHARTS = {'head': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'torso': (0, 0, 768, 512), 'cloak': (768, 0, 512, 512),
          'tabard': (0, 512, 768, 256), 'tail': (1280, 0, 384, 384), 'tome': (1664, 0, 384, 384),
          'buckle': (1280, 384, 256, 256), 'bead': (1536, 384, 256, 256), 'spare': (768, 512, 512, 256)}
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'white': ('whitedark', 'white', 'whitelight'),
         'plum': ('plumdark', 'plum', 'plumlight'), 'armour': ('armourdark', 'armour', 'armourlight'),
         'silver': ('silverdark', 'silver', 'silverlight'), 'steel': ('#4A4E5C', '#8A8E9C', '#D8DCE6'), 'teal': ('tealdark', 'teal', 'teallight'),
         'belt': ('beltdark', 'belt', 'beltlight'), 'page': ('#D8CCB0', 'page', '#FFF8E8'),
         'dark': ('#0F0D11', 'dark', '#2E2A32'), 'hole': ('#151316', '#211E22', '#2C292E'),
         'pad': ('#3A3540', '#4A4450', '#5E5868'), 'lock': ('#19171C', 'fur', '#555060')}
RAMP_ROWS = {k: i for i, k in enumerate(RAMPS)}
if RIG:
    CHARTS.update({'lidU': (768, 512, 512, 160), 'lidD': (768, 672, 512, 96), 'cavity': (1792, 384, 128, 128), 'tongue': (1920, 384, 128, 128)})


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
# Skull: a round squircle dome in front view (exponent 2.3), a fuller front in depth (exponent 2.2 front, 2.0 back),
# narrowing toward the top. First-order distance (field / |grad|).
SK = dict(a=.530, c=.500, zc=.520, n=2.30, m_f=2.10, m_b=2.00, bf=.430, bb=.500, taper=.10)
def skull(q):
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    zr = z - SK['zc']; c = SK['c']; n = SK['n']
    a = SK['a'] * (1 - SK['taper'] * smooth(.10, .95, zr / c))
    ax_ = np.abs(x) / a + 1e-9; az_ = np.abs(zr) / c + 1e-9
    s = (ax_ ** n + az_ ** n) ** (1 / n)
    fr = y < 0
    b = np.where(fr, SK['bf'], SK['bb']); m = np.where(fr, SK['m_f'], SK['m_b'])
    ay_ = np.abs(y) / b + 1e-9
    r = (s ** m + ay_ ** m) ** (1 / m)
    dsx = s ** (1 - n) * ax_ ** (n - 1) / a; dsz = s ** (1 - n) * az_ ** (n - 1) / c
    drs = r ** (1 - m) * s ** (m - 1); dry = r ** (1 - m) * ay_ ** (m - 1) / b
    g = np.sqrt(drs * drs * (dsx * dsx + dsz * dsz) + dry * dry) + 1e-9
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

# the chrysanthemum muzzle: two moustache lobes, a beard puff below them, full cheek puffs and a pad under the nose
MUS = ([.125, -.492, .205], [.145, .112, .130]); K_MUS = .030      # moustache lobes (mirrored in x), parted at the centre, kept under the eye corners
BRD = ([0, -.462, .128], [.165, .110, .132]); K_BRD = .030         # beard puff (the chin under the mouth line)
CHK = ([.335, -.305, .200], [.192, .150, .140]); K_CHK = .050      # cheek puffs (mirrored), kept below the eye openings
PAD = ([0, -.500, .380], [.084, .090, .074]); K_PAD = .040         # the short muzzle pad the nose sits on (between the eyes)
FIL = ([0, -.500, .262], [.040, .050, .085]); K_FIL = .020        # round 4: fills the crevice between the moustache lobes to a shallow philtrum notch
FHD = ([0, -.262, .800], [.300, .160, .200]); K_FHD = .060        # the domed forehead (fills the brow forward to the sheet profile)
def mirror(q):
    qa = np.array(q, float, copy=True); qa[..., 0] = np.abs(qa[..., 0]); return qa
def base_local(q):
    d = skull(q)
    qm = mirror(q)
    d = smin(d, ell(qm, *CHK), K_CHK)
    d = smin(d, ell(q, *FHD), K_FHD)
    d = smin(d, ell(q, *PAD), K_PAD)
    d = smin(d, mus_sdf(q), K_MUS)
    d = smin(d, ell(q, *FIL), K_FIL)
    d = smin(d, ell(q, *BRD), K_BRD)
    return d
MUS_KC = [.006]          # the parting's blend; the mouth edge loops are projected through a softened parting (no folds)
def mus_sdf(q):
    c = np.array(MUS[0]); cl = c * np.array([-1, 1, 1.])
    return smin(ell(q, c, MUS[1]), ell(q, cl, MUS[1]), MUS_KC[0])

# eye layout (W units): sheet centres +-0.271 W at 0.461 W above the chin (0.548 H below the crown); opening 0.282 x 0.244 W
EXW = .271; EZW = .495 if FACE_RULE == 'brief' else .461; EHWW, EHHW, EN = .141, .122, 2.10
RECESS = dict(delta=.060, tilt=-.50, F_out=.15, F_nas=.065, F_up=.075, F_dn=.060)
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
NZW = .352 if FACE_RULE == 'brief' else .412                 # nose centre; its top at the iris bottom (rule)
NECK = [[0, .060, -.130], [.300, .260, .200]]; K_NECK = .08
def warped(q):
    qw = np.array(q, float, copy=True); qw[..., 1] = q[..., 1] - RECESS['delta'] * eye_recess(q); return qw
_yf = float(front_local(0, NZW, lambda q: base_local(warped(q)))[0])
NOSE = [[0, _yf + .046 - .030, NZW], [.072, .046, .036]]; K_N = .012       # small wide button, 0.144 W x 0.071 W
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
O = np.array([0, HY - .02 * W, CHIN + .42 * W])
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

_g = np.stack(np.meshgrid(np.zeros(1), np.linspace(-.5, .5, 101), np.linspace(.85, 1.10, 251), indexing='ij'), -1).reshape(-1, 3)
CROWN_M = float(CHIN + W * _g[head_local(_g) < 0][:, 2].max())
LOG['crown_m'] = round(CROWN_M, 4)
print('CROWN', CROWN_M, 'NOSE_TIP_L', NOSE_TIP_L, flush=True)

# ============================================================== face layout (front projection, metres)
EX = EXW * W; EZ = CHIN + EZW * W; EHW = EHWW * W; EHH = EHHW * W
def eye_unit(psi):
    c = np.cos(psi); s = np.sin(psi); return spow(c, 2 / EN), spow(s, 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
NZ = CHIN + NZW * W
# the mouth line: a soft arch where the moustache lobes meet the beard puff (W units: x, z above the chin)
MA_X = .125; MA_TOP = .272; MA_DIP = .036; MA_UP = .004      # round 4: two rounder smile lobes, gentle corners
def mouth_arch(t, crisp=False):  # t in [-1, 1]: the omega line (crisp for paint; rounded at the centre for the rig loops)
    t = np.asarray(t, float); at = np.abs(t) if crisp else np.sqrt(t * t + .09)
    at0 = 0. if crisp else math.sqrt(.09); at1 = 1. if crisp else math.sqrt(1.09)
    return np.stack([MA_X * t, MA_TOP - MA_DIP * np.sin(PI * np.clip((at - at0) / (at1 - at0), 0, 1)) + MA_UP * smooth(.70, 1., np.abs(t))], -1)
BLUSH = (.385 * W, CHIN + .262 * W, .112 * W, .070 * W)

# ============================================================== round 4: the sculpted mouth (a real lip parting, no painted line)
# A soft groove along the omega line: an anisotropic tube carved into the field (steep upper wall, gentle lower wall: the
# upper lip rolls slightly over the lower), with a small upper-lip roll just above it; both taper out at the corners.
# Head-local W units. The skin is cut along the groove bottom (the parting) below, so the rig's jaw can open it.
head_local_pre = head_local
MG_N = 25; _mt = np.linspace(-1, 1, MG_N); _mc = mouth_arch(_mt)
MG_TAPER = 1 - .80 * smooth(.50, .97, np.abs(_mt))
MG_RG = .015 * MG_TAPER; MG_DL = .0055 * MG_TAPER; MG_SUP, MG_SDN, MG_SMID = 2.6, 1.75, 2.1
MG_YS = front_local(_mc[:, 0], _mc[:, 1], head_local_pre)                       # the un-grooved surface along the parting
MG_C = np.stack([_mc[:, 0], MG_YS - MG_DL, _mc[:, 1]], -1)                     # tube centres just in front of the surface
_ru = front_local(_mc[:, 0], _mc[:, 1] + .010, head_local_pre)
MG_R = np.stack([_mc[:, 0], _ru + .005, _mc[:, 1] + .010], -1); MG_RR = .009 * MG_TAPER       # the upper-lip roll
MG_BOX = (.17, .19, .34, -.42)                                                # |x| <, z >, z <, y < : outside it the mouth terms are zero
def _chain(p, Cs, Rs, scale=None):
    best = np.full(len(p), 9.)
    for i in range(len(Cs) - 1):
        A = Cs[i]; B = Cs[i + 1]; pa = p - A; ba = B - A
        if scale is None:
            h = np.clip((pa @ ba) / (ba @ ba), 0, 1); r = pa - h[:, None] * ba; dist = np.linalg.norm(r, axis=1)
        else:
            sm = np.array([1, 1, MG_SMID]); h = np.clip(((pa * sm) @ (ba * sm)) / ((ba * sm) @ (ba * sm)), 0, 1)
            r = pa - h[:, None] * ba; s_ = np.where(r[:, 2] > 0, MG_SUP, MG_SDN)
            dist = np.sqrt(r[:, 0] ** 2 + r[:, 1] ** 2 + (s_ * r[:, 2]) ** 2)
        best = np.minimum(best, dist - (Rs[i] + (Rs[i + 1] - Rs[i]) * h))
    return best
def mouth_mask(p):
    return (np.abs(p[:, 0]) < MG_BOX[0]) & (p[:, 2] > MG_BOX[1]) & (p[:, 2] < MG_BOX[2]) & (p[:, 1] < MG_BOX[3])
def groove_sdf(p): return _chain(p, MG_C, MG_RG, scale=True)
def head_local(q, neck=True):
    d = np.array(head_local_pre(q, neck), float, copy=True); p = q.reshape(-1, 3); dv = d.reshape(-1)
    m = mouth_mask(p)
    if m.any():
        pm = p[m]; dd = smin(dv[m], _chain(pm, MG_R, MG_RR), .006)
        dv[m] = smax(dd, -groove_sdf(pm), .003)
    return dv.reshape(np.shape(d))


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
    wn = (1 - .72 * smooth(-.10, -.80, np.cos(psi))) * (1 - .45 * smooth(-.20, -.90, np.sin(psi)))
    for k, kk in enumerate(EYE_SCALES): add_loop(c + (base - c) * (1 + (kk - 1) * wn[:, None]), 'eye%d_%d' % (s, k))
pts.append(tuple(to_dom(surf_dir(np.array([0.]), np.array([NZ])))[0])); tags['nose_c'] = [len(pts) - 1]
for k, (rx, rz, n) in enumerate([(.031, .018, 12), (.056, .032, 18), (.080, .045, 24), (.094, .053, 28)]):
    a = np.linspace(0, 2 * PI, n, endpoint=False) + .3 * k
    add_loop(to_dom(surf_dir(rx * W * np.cos(a), NZ + .002 * W + rz * W * np.sin(a))), 'nose_%d' % k)
def arch_ud(up0, dn0, n=24, ncap=4, taper=False):
    """closed loop round the parting: offset `up` above and `dn` below it (W units), round caps at the corners -> (x, z) metres.
    taper: the loop narrows toward the corners with the groove (the mid-wall and rim loops follow the tapered walls)"""
    t = np.linspace(-1, 1, n); C = mouth_arch(t); T = unit(np.gradient(C, axis=0)); nn = np.stack([-T[:, 1], T[:, 0]], -1)
    if nn[n // 2, 1] < 0: nn = -nn
    f = (1 - .62 * smooth(.50, .97, np.abs(t))) if taper else np.ones(n)
    U = C + nn * (up0 * f)[:, None]; D = C - nn * (dn0 * f)[:, None]; up = up0 * f[-1]; dn = dn0 * f[-1]
    def cap(c, nv, tv, phis):
        return np.array([c + (nv * math.cos(p_) + tv * math.sin(p_)) * ((up + dn) / 2 + (up - dn) / 2 * math.cos(p_)) for p_ in phis])
    ph = np.linspace(0, PI, ncap + 2)[1:-1]
    loop = np.concatenate([U, cap(C[-1], nn[-1], T[-1], ph), D[::-1], cap(C[0], nn[0], -T[0], ph)[::-1]])
    side = ['up'] * n + ['up' if p_ < PI / 2 else 'dn' for p_ in ph] + ['dn'] * n + ['up' if p_ < PI / 2 else 'dn' for p_ in ph][::-1]
    ARCH_SIDE[0] = side
    return loop * W + np.array([0, CHIN])
OPEN_TAGS = {'part'}
ARCH_SIDE = [None]; SIDE_PT = {}
MUS_KC[0] = .045
for k, (up_, dn_) in enumerate([(.0040, .0045), (.0085, .0090), (.0160, .0175), (.0220, .0235), (.0300, .0310)]):
    L = arch_ud(up_, dn_, taper=k < 2)
    _i0 = len(pts); add_loop(to_dom(surf_dir(L[:, 0], L[:, 1])), 'mouth_%d' % k)
    if k == 0: SIDE_PT.update({_i0 + j: sd_ for j, sd_ in enumerate(ARCH_SIDE[0])})
_pp = mouth_arch(np.linspace(-1, 1, MG_N)) * W + np.array([0, CHIN])
add_loop(to_dom(surf_dir(_pp[:, 0], _pp[:, 1])), 'part', closed=False)          # the lip parting (the cut line)
MUS_KC[0] = .006
NB = 72; AB = math.radians(122)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
def fib(nf, amax):
    ii = np.arange(nf) + .5; phi = np.arccos(1 - 2 * ii / nf); th = PI * (1 + 5 ** .5) * ii
    D = np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
    return D[np.arccos(np.clip(-D[:, 1], -1, 1)) < amax]
D = fib(1300, math.radians(118.5)); Pf = radial_hit_outer(D)
D2 = fib(3400, math.radians(76)); P2 = radial_hit_outer(D2)
def fine_zone(P):
    q = M2L(P)
    return ((np.abs(q[:, 0]) < .55) & (q[:, 2] > .02) & (q[:, 2] < .80)) & (P[:, 1] < HY - .10 * W)
D = np.concatenate([D[~fine_zone(Pf)], D2[fine_zone(P2)]]); Pf = np.concatenate([Pf[~fine_zone(Pf)], P2[fine_zone(P2)]])
# the beard underside and the chin: rays from the head centre graze them, so they get a regular grid sampled from the front
gx, gz = np.meshgrid(np.linspace(-.30, .30, 25) * W, CHIN + np.linspace(-.12, .10, 12) * W)
gx = gx.ravel(); gz = gz.ravel(); gy = front_hit(gx, gz); okg = np.isfinite(gy)
G = np.stack([gx, gy, gz], -1)[okg]; Dg = unit(G - O)
zone = (np.abs(Pf[:, 0]) < .31 * W) & (Pf[:, 2] < CHIN + .105 * W) & (Pf[:, 1] < HY - .02)
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
keep &= ~(front & ((Pf[:, 0] / (.104 * W)) ** 2 + ((Pf[:, 2] - NZ - .002 * W) / (.060 * W)) ** 2 < 1))
_ma = mouth_arch(np.linspace(-1.1, 1.1, 60)) * W + np.array([0, CHIN])
_dm = np.min(np.hypot(Pf[:, 0:1] - _ma[None, :, 0], Pf[:, 2:3] - _ma[None, :, 1]), axis=1)
keep &= ~(front & (_dm < .040 * W) & (Pf[:, 1] < HY - .25 * W))
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

# ---- adaptive refinement for the game's hard toon band (as Poe / Rosie / Moka)
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
    _cm = Pt.mean(1); vis &= ~((np.min(np.hypot(_cm[:, 0:1] - _ma[None, :, 0], _cm[:, 2:3] - _ma[None, :, 1]), axis=1) < .050 * W) & (_cm[:, 1] < HY - .25 * W))
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
REFINE_ADD = int(os.environ.get('REFINE_ADD', '140')); D_LOW, D_T = .12, .45
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
def tag_edges(tg, L): return [(L[i], L[(i + 1) % len(L)]) for i in range(len(L) - 1 if tg in OPEN_TAGS else len(L))]
loop_of = {(min(a_, b_), max(a_, b_)): tg for tg, L in tags.items() if len(L) > 1 for a_, b_ in tag_edges(tg, L)}
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
    cons[:] = [e_ for tg, L in tags.items() if len(L) > 1 for e_ in tag_edges(tg, L)]
    loop_of = {(min(a_, b_), max(a_, b_)): tg for tg, L in tags.items() if len(L) > 1 for a_, b_ in tag_edges(tg, L)}
dom_out, Fh, out_of = skin_cdt(pts); err, disp, vis, Pv = tri_errors(dom_out, Fh)
LOG['head_refine'] = {'dropped': len(drop), 'added': n_add, **stats_(err, disp, vis)}
print('HEAD_REFINE', json.dumps(LOG['head_refine_before']), json.dumps(LOG['head_refine']), flush=True)

skin_d = from_dom(dom_out); skin_p = radial_hit_outer(skin_d); skin_n = grad_n(skin_p)
verts = [tuple(p) for p in skin_p]; vdir = list(skin_d); vnorm = list(skin_n); faces = [tuple(f) for f in Fh]
bound = [out_of[k] for k in tags['bound']]; prev = bound
for a in [130, 142, 156, 170]:
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
# ---- round 4: cut the skin along the lip parting (rig-ready: the jaw opens it). The interior parting vertices are split: the
# faces below the parting take a copy (2 microns behind, so nothing welds them); the two corner vertices stay shared, so the
# corners are sealed at every jaw value. At rest the two sides coincide, with identical normals: no visible seam.
_tt = np.linspace(-1, 1, 401); _arc = mouth_arch(_tt) * W + np.array([0, CHIN])
def arch_z_m(x): return np.interp(x, _arc[:, 0], _arc[:, 1])
part_ids = [out_of[k] for k in tags['part']]; inner_ids = set(part_ids[1:-1]); part_set = set(part_ids); dup_of = {}
SIDE_V = {out_of[k]: sd_ for k, sd_ in SIDE_PT.items() if k in out_of}
n_geo = 0
for fi, f in enumerate(faces):
    if not any(v in inner_ids for v in f): continue
    lab = [SIDE_V.get(v) for v in f if v not in part_set]
    if lab and all(l_ == 'dn' for l_ in lab): lower = True
    elif lab and all(l_ == 'up' for l_ in lab): lower = False
    else:
        cen = np.mean([verts[v] for v in f], 0); lower = cen[2] < arch_z_m(cen[0]); n_geo += 1
    if lower:
        nf = []
        for v in f:
            if v in inner_ids:
                if v not in dup_of:
                    dup_of[v] = len(verts); verts.append(tuple(np.array(verts[v]) + np.array([0, 2e-6, 0]))); vdir.append(vdir[v]); vnorm.append(vnorm[v])
                nf.append(dup_of[v])
            else: nf.append(v)
        faces[fi] = tuple(nf)
MOUTH_INFO = {'parting_upper_m': [[round(float(c), 4) for c in verts[v]] for v in part_ids],
              'parting_lower_m': [[round(float(c), 4) for c in verts[dup_of.get(v, v)]] for v in part_ids],
              'corners_m': [[round(float(c), 4) for c in verts[part_ids[0]]], [round(float(c), 4) for c in verts[part_ids[-1]]]],
              'split_vertices': len(dup_of), 'groove_depth_W': round(float(MG_RG.max() - MG_DL.max()), 4),
              'groove_half_width_W(up, down)': [round(float(np.sqrt(MG_RG.max() ** 2 - MG_DL.max() ** 2) / MG_SUP), 4), round(float(np.sqrt(MG_RG.max() ** 2 - MG_DL.max() ** 2) / MG_SDN), 4)],
              'loops_round_the_mouth': 5,
              'note': 'Shihtzu_head is cut along the parting (upper and lower copies of the interior vertices; the corners are shared). '
                      'The head interior behind the mouth is empty: room for the rig-time mouth cavity and tongue, as on Poe and the samurai Chewy.'}
LOG['mouth_cut'] = {'split_vertices': len(dup_of), 'parting_vertices': len(part_ids), 'faces_by_geometry_fallback': n_geo}
print('MOUTH_CUT', json.dumps(LOG['mouth_cut']), flush=True)
vdir = np.array(vdir); vnorm = np.array(vnorm); verts_np = np.array(verts)
huv = au('head', *head_uv(unit(vdir)).T)
UVF = []
for f in faces:
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
print('EYE_AXIS', LOG['eye_axis_L'], LOG['eye_axis_R'], flush=True)


print('STEP ear locks', flush=True)
# ============================================================== EAR LOCKS: one clay mass per side, five fat locks merging at the top
# Each side is ONE implicit field: five lock capsule chains (draped over the skull, hanging to about the chin) smooth-unioned
# with a blend radius that grows toward the top (separate fat lobes below, one smooth black dome above), blended into the
# skull. The skin is the outermost root along rays from a point inside the head (azimuth x elevation grid), so every vertex
# carries the field's analytic normal; rays that land on the bare head are tucked under the head skin. Head-local W units.
def gradL(f, p, e=1e-4):
    g = np.zeros_like(p)
    for k in range(3):
        dp = np.zeros(3); dp[k] = e; g[:, k] = f(p + dp) - f(p - dp)
    return unit(g)
def skull_only(q): return skull(q)
def push_out(P, clear, f=skull_only, it=8):
    """move head-local points along the field gradient until f >= clear (W units)"""
    P = np.array(P, float, copy=True); clear = np.broadcast_to(np.asarray(clear, float), (len(P),))
    for _ in range(it):
        d = f(P); need = np.maximum(clear - d, 0)
        if need.max() < 1e-5: break
        P = P + gradL(f, P) * need[:, None]
    return P
# (root on the top-side of the skull, the hanging axis (x, y) at the widest, the bottom z, max radius)
# Round 2: the locks start close to the skull's top-sides and drape: thin at the top (no flare above the eye line), widest
# at the cheek / jaw line, ending in 3-4 soft wavy lobes at the bottom (a sixth, inner-front lock adds the lobe by the cheek).
LOCKS = [((.245, -.158, .870), (.640, -.025), -.008, .124),
         ((.294, -.008, .898), (.740, .158), .044, .141),
         ((.305, .162, .884), (.772, .386), .007, .151),
         ((.284, .300, .828), (.694, .550), .084, .135),
         ((.226, .395, .746), (.498, .665), .148, .115),
         ((.218, -.188, .810), (.566, -.105), -.035, .102)]
LOCK_FAN = np.array([0, .200])
NLS = 34
LOCK_SEG = []          # per lock: the centre path and radius, head-local, +x side
for k, (root, hang, zb, rmax) in enumerate(LOCKS):
    hx, hy = hang; rx_, ry_, rz_ = root
    kk = min(k, 4)
    ctrl = [np.array([rx_, ry_, rz_]),
            np.array([rx_ + .38 * (hx - rx_), ry_ + .42 * (hy - ry_), .840]),
            np.array([rx_ + .77 * (hx - rx_), ry_ + .80 * (hy - ry_), .660]),
            np.array([.980 * hx, hy + .015 * kk / 4, .470]),
            np.array([1.00 * hx, hy + .035 * kk / 4, .290]),
            np.array([.985 * hx, (1.0 - .03 * kk / 4) * hy, zb + rmax * .95])]
    tt = np.linspace(0, 1, NLS)
    P = np.array([catmull(ctrl, t) for t in tt])
    r = rmax * (.43 + .57 * smooth(.02, .62, tt))
    P = push_out(P, np.where(tt < .05, -1., .70 * r))
    for _ in range(4): P[1:-1] = .25 * P[:-2] + .5 * P[1:-1] + .25 * P[2:]
    P = push_out(P, np.where(tt < .05, -1., .70 * r))
    LOCK_SEG.append((P, r))
def lock_k(z): return np.interp(z, [.05, .30, .45, .58, .72, .90], [.011, .013, .016, .045, .085, .100])
def one_lock(p, P, r):
    """smooth tube distance: capsule segments smooth-unioned (no kinks at the joints)"""
    d = None
    for i in range(len(P) - 1):
        a = P[i]; b = P[i + 1]; pa = p - a; ba = b - a
        h = np.clip((pa @ ba) / (ba @ ba), 0, 1); di = np.linalg.norm(pa - h[:, None] * ba, axis=1) - (r[i] + (r[i + 1] - r[i]) * h)
        d = di if d is None else smin(d, di, .012)
    return d
def locks_each(q):
    p = q.reshape(-1, 3)
    return np.stack([one_lock(p, P, r) for P, r in LOCK_SEG])
def locks_sdf(q, parts_out=False):
    p = q.reshape(-1, 3); D = locks_each(p); kz = lock_k(p[:, 2])
    d = D[0]
    for i in range(1, len(D)): d = smin(d, D[i], kz)
    if parts_out: return d, D.min(0), kz
    return d.reshape(q.shape[:-1])
ear_info = {}
LM_C = LOCK_SEG[2][0][int(NLS * .58)] - np.array([.03, 0, 0])   # a point inside the lock mass (on the middle lock): the rays' origin
assert float(locks_sdf(LM_C[None])[0]) < -.05, ('lock ray origin outside', float(locks_sdf(LM_C[None])[0]))
print('LOCK_ORIGIN', LM_C.tolist(), float(locks_sdf(LM_C[None])[0]), flush=True)
# polar angle from the top (dense near the top and bottom ends), azimuth round +z: dense on the outer (+x) side
TH = np.radians(np.concatenate([np.linspace(4, 30, 9)[:-1], np.linspace(30, 72, 11)[:-1], np.linspace(72, 145, 15)[:-1], np.linspace(145, 176, 10)]))
_g = np.linspace(0, 1, 48, endpoint=False)
AZ = 2 * PI * (_g - .62 * np.sin(2 * PI * _g) / (2 * PI))       # azimuth from +x: about 1.6x denser on the outer side
for side, tag in ((1, 'L'), (-1, 'R')):
    TT_, AA_ = np.meshgrid(TH, AZ, indexing='ij')
    Dl = np.stack([np.sin(TT_) * np.cos(AA_), np.sin(TT_) * np.sin(AA_), np.cos(TT_)], -1).reshape(-1, 3)
    name_hint[0] = 'ear.' + tag
    Pq = ray_outer(locks_sdf, LM_C, Dl, .95, steps=160, it=28)
    Nq = gradL(locks_sdf, Pq, 1.5e-4)
    pt = ray_outer(locks_sdf, LM_C, np.array([[0, 0, 1.]]), .95); pb = ray_outer(locks_sdf, LM_C, np.array([[0, 0, -1.]]), .95)
    d_, hard_, kz_ = locks_sdf(Pq, parts_out=True)
    groove = clamp((hard_ - d_) / kz_) * smooth(.62, .45, Pq[:, 2])
    inward = unit(np.stack([-Pq[:, 0], LOCK_FAN[1] - Pq[:, 1], np.zeros(len(Pq))], -1))
    occ = .24 * smooth(.20, .80, (Nq * inward).sum(1)) + 2.6 * groove + .18 * smooth(.20, -.05, Pq[:, 2])
    R, C = len(TH), len(AZ)
    sx = np.array([side, 1, 1.])
    Pg = (L2M(Pq) * sx).reshape(R, C, 3); Ng = (Nq * sx).reshape(R, C, 3)
    V, Fq, _, NN = closed_grid(Pg, Ng, np.zeros((R, C, 2)), (L2M(pt)[0] * sx, gradL(locks_sdf, pt)[0] * sx, [0, 0]),
                               (L2M(pb)[0] * sx, gradL(locks_sdf, pb)[0] * sx, [0, 0]))
    occ_all = np.concatenate([occ, [.10, .30]])
    make_obj('ear_locks.' + tag, V, Fq, ramp_uv('lock', sval(NN, hi=.40, occ=occ_all)), 'ear.' + tag, N=NN)
    roots = np.array([L2M(P[1][None])[0] for P, r in LOCK_SEG]); folds = np.array([L2M(P[int(NLS * .35)][None])[0] for P, r in LOCK_SEG])
    tips = np.array([L2M(P[-1][None])[0] for P, r in LOCK_SEG])
    ear_info[tag] = {'base': (roots.mean(0) * sx).tolist(), 'fold': (folds.mean(0) * sx).tolist(), 'tip': (tips.mean(0) * sx).tolist()}

print('STEP topknot', flush=True)
# ============================================================== TOPKNOT: plum band, silver paw bead, a white clay chrysanthemum puff
TK_C = L2M(np.array([[0, .030, .985]]))[0]                     # the band seat on the crown (m)
TK_TILT = math.radians(12)
TK_UP = np.array([0, math.sin(TK_TILT), math.cos(TK_TILT)])        # leans back a little (sheet side view)
TK_E1 = np.array([1., 0, 0]); TK_E2 = unit(np.cross(TK_UP, TK_E1))  # e2 points back
def badge(name, centre, normal, upv, R, thick, chart, group, dome=.25, nring=5, nang=28):
    """a domed disc (planar UVs into a chart), thickened with rounded rims"""
    nrm = unit(np.asarray(normal, float)); upv = unit(np.asarray(upv, float) - nrm * (np.asarray(upv, float) @ nrm)); rt = np.cross(upv, nrm)
    V = [np.zeros(3)]; UV = [(.5, .5)]
    for j in range(1, nring + 1):
        r_ = j / nring
        for i in range(nang):
            a_ = 2 * PI * i / nang; V.append(np.array([r_ * math.cos(a_), r_ * math.sin(a_), 0])); UV.append((.5 + .5 * r_ * math.cos(a_), .5 + .5 * r_ * math.sin(a_)))
    V = np.array(V); V[:, 2] = dome * thick * (1 - (V[:, 0] ** 2 + V[:, 1] ** 2))
    Fb = [(0, 1 + i, 1 + (i + 1) % nang) for i in range(nang)]
    for j in range(nring - 1):
        for i in range(nang):
            a0 = 1 + j * nang + i; b0 = 1 + j * nang + (i + 1) % nang; Fb.append((a0, a0 + nang, b0 + nang, b0))
    gx_ = -2 * dome * thick * V[:, 0] / R; gy_ = -2 * dome * thick * V[:, 1] / R
    NL = unit(np.stack([-gx_, -gy_, np.ones(len(V))], -1))
    Vw = np.asarray(centre) + (V[:, 0:1] * R) * rt + (V[:, 1:2] * R) * upv + V[:, 2:3] * nrm
    Nw = NL[:, 0:1] * rt + NL[:, 1:2] * upv + NL[:, 2:3] * nrm
    UVa = au(chart, np.array(UV)[:, 0], np.array(UV)[:, 1])
    Vt, Ft, UVt, Nt = thicken(Vw, Fb, Nw, thick, UVa, au(chart, .5, .02), au(chart, .02, .5), rim=4)
    return make_obj(name, Vt, Ft, UVt, group, N=Nt)
ab_ = np.linspace(0, 2 * PI, 22, endpoint=False)
BAND_R = .084; BAND_H = .046
Pb = TK_C + TK_UP * .010 + BAND_R * (np.cos(ab_)[:, None] * TK_E1 + np.sin(ab_)[:, None] * TK_E2)
Nb = unit(np.cos(ab_)[:, None] * TK_E1 + np.sin(ab_)[:, None] * TK_E2)
ap_ = np.linspace(0, 2 * PI, 8, endpoint=False)
def band_prof(k):
    return np.stack([.013 * spow(np.cos(ap_), .45), BAND_H / 2 * spow(np.sin(ap_), .45)], -1)
ring_tube('topknot_band', Pb, band_prof, 'topknot', lambda NN, tt, uu, V: ramp_uv('plum', sval(NN, hi=.30)), Nb, sides=8)
BEAD_N = unit(np.array([0, -1., .25]) - TK_UP * (np.array([0, -1., .25]) @ TK_UP) * .6)
BEAD_C = TK_C + TK_UP * .012 + unit(-TK_E2) * (BAND_R + .013)
badge('topknot_paw_bead', BEAD_C, BEAD_N, TK_UP, .024, .012, 'bead', 'topknot', dome=.6, nring=3, nang=16)
# round 2: a twisted petal bun (sheet): four broad rolled petals swirl up from the band and curl over toward the centre
for i in range(4):
    a0 = math.radians(45 + 90 * i)
    tt = np.linspace(0, 1, 9)
    az = a0 + math.radians(70) * tt                                    # the swirl: each petal turns 70 deg as it rises
    rr_ = np.interp(tt, [0, .25, .55, .80, 1.], [.052, .074, .070, .040, .012])
    hh_ = np.interp(tt, [0, .25, .55, .80, 1.], [.030, .066, .104, .122, .112])
    P = TK_C + TK_UP[None] * hh_[:, None] + rr_[:, None] * (np.cos(az)[:, None] * TK_E1 + np.sin(az)[:, None] * TK_E2)
    nrm = unit(np.cos(az)[:, None] * TK_E1 + np.sin(az)[:, None] * TK_E2 + TK_UP[None] * np.interp(tt, [0, .5, 1.], [-.2, .6, 1.6])[:, None])
    sweep('topknot_petal.%d' % i, P, lambda j, tt=tt: (.032 * (1 - .35 * tt[j] ** 2), .050 * (1 - .40 * tt[j] ** 2)), 'topknot',
          lambda NV, tt_, uu, V: ramp_uv('white', sval(NV, hi=.34, occ=.30 * smooth(.25, .85, (NV * unit(TK_C + TK_UP * .07 - V)).sum(1)))),
          sides=8, normals=nrm, p=.85)
lobe('topknot_crown', TK_C + TK_UP * .108, np.array([.036, .042, .042]), TK_UP, 'topknot', ramp='white', n=3, occ_in=.20, sheen=1.1, pole=TK_E1)
TOPKNOT_TOP = float(max(np.array(list(o.matrix_world @ v.co for v in o.data.vertices))[:, 2].max() for o in parts['topknot']))
LOG['topknot_top_m'] = round(TOPKNOT_TOP, 4); LOG['topknot_above_crown_m'] = round(TOPKNOT_TOP - CROWN_M, 4)
print('TOPKNOT', LOG['topknot_top_m'], LOG['topknot_above_crown_m'], flush=True)


if HEAD_ONLY:
    BODY_PAINTERS = {}; BODY_PIVOTS = {}; JOINTS_BODY = {}
else:
    # ============================================================== BODY AND COSTUME (metres; body axis x = 0; heights from the sheet's front view)
    RCY = -.040
    def crease(a, b, k): return clamp((np.minimum(a, b) - smin(a, b, k)) / k)
    def ramp_fn(name, hi=.28, occ=0.):
        return lambda NN, V, *a: ramp_uv(name, sval(NN, occ=occ, hi=hi))
    def ramp_sw(name, hi=.28, occ=0.):          # for sweep(): uvfn(NV, tt, uu, V)
        return lambda NV, tt, uu, V: ramp_uv(name, sval(NV, occ=occ, hi=hi))

    print('BODY_STEP torso', flush=True)
    # ---------------------------------------------------------------- the torso: light armour with the upper tabard painted on (chart 'torso')
    TZ = np.array([.330, .380, .430, .480, .530, .580, .620, .660, .700])
    TAX = np.array([.212, .222, .230, .234, .236, .232, .218, .190, .150])
    TAY = np.array([.168, .176, .184, .190, .194, .192, .182, .162, .135])
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
    NA_T, NZ_T = 28, 12
    zt_ = np.linspace(TZ[0], TZ[-1], NZ_T); at_ = np.linspace(0, 2 * PI, NA_T, endpoint=False)
    AA, ZZ = np.meshgrid(at_, zt_)
    Pt_ = torso_raw(AA, ZZ); Nt_ = torso_n(AA, ZZ)
    Pg = np.concatenate([Pt_, Pt_[:, :1]], 1); Ng = np.concatenate([Nt_, Nt_[:, :1]], 1)
    Ug = np.concatenate([(AA / (2 * PI)), np.ones((NZ_T, 1))], 1); Vg = np.concatenate([(ZZ - TZ[0]) / (TZ[-1] - TZ[0]), ((zt_ - TZ[0]) / (TZ[-1] - TZ[0]))[:, None]], 1)
    make_obj('armour_torso', Pg.reshape(-1, 3), grid_faces(NZ_T, NA_T + 1), au('torso', Ug.ravel(), Vg.ravel()), 'body', N=Ng.reshape(-1, 3))
    def ramp_colour(name, u):
        lo, base, hi = [rgb(c) for c in RAMPS[name]]; u = clamp(u)
        return np.where((u < .5)[..., None], mix(lo, base, smooth(0, .5, u)), mix(base, hi, smooth(.5, 1, u)))
    def paint_torso(U, V):
        a = U * 2 * PI; z = TZ[0] + V * (TZ[-1] - TZ[0]); x = tax_f(z) * spow(np.sin(a), 2 / TP); front = np.cos(a) > 0
        n = torso_n(a, z); sv = sval(n, hi=.26)
        C = ramp_colour('armour', sv)
        ax_ = np.abs(x)
        # the upper tabard: two plum panels over the chest (silver-trimmed), the armour centre strip between them
        pan = front * (ax_ > .088) * (ax_ < .214) * (z < .640) * (z > .40)
        C = mix(C, ramp_colour('plum', sv), pan)
        trim = front * (z < .640) * (z > .40) * ((np.abs(ax_ - .094) < .007) | (np.abs(ax_ - .208) < .006))
        C = mix(C, ramp_colour('silver', sv + .05), .95 * trim)
        top_trim = front * (ax_ > .088) * (ax_ < .214) * (np.abs(z - .634) < .006)
        C = mix(C, ramp_colour('silver', sv + .05), .95 * top_trim)
        # silver studs in two pairs and the teal ghostlight gem pendant on the centre strip
        for zz_ in (.548, .508):
            st = np.sqrt(((ax_ - .058) / .011) ** 2 + ((z - zz_) / .011) ** 2)
            C = mix(C, mix(rgb('silverdark'), rgb('silverlight'), smooth(.8, -.6, (z - zz_) / .011)), (1 - smooth(.85, 1.1, st)) * front)
        gem = np.abs(x) / .016 + np.abs(z - .556) / .024
        C = mix(C, mix(rgb('teal'), rgb('teallight'), smooth(.6, .0, gem)), (1 - smooth(.85, 1.05, gem)) * front)
        dot = np.sqrt((x / .007) ** 2 + ((z - .590) / .007) ** 2)
        C = mix(C, rgb('teal'), (1 - smooth(.8, 1.1, dot)) * front)
        # soft fold shading under the arms
        C = mix(C, rgb('armourdark'), .30 * np.exp(-((np.abs(np.sin(a)) - 1) / .10) ** 2) * smooth(.62, .52, z) * smooth(.45, .52, z))
        return C

    print('BODY_STEP ruff', flush=True)
    # ---------------------------------------------------------------- the white chest ruff: a thick soft fur collar dipping to a V on the chest
    NC = 36; ac = np.linspace(0, 2 * PI, NC, endpoint=False)
    frontc = np.maximum(0, np.cos(ac))
    zc_c = .672 - .046 * frontc ** 5 - .008 * frontc
    hc = .036 + .010 * frontc ** 2; tc = .036 + .016 * frontc ** 2
    rxc = .196 - .030 * frontc ** 6; ryc = .168 + .010 * frontc
    Pc = np.stack([rxc * np.sin(ac), RCY - .004 - ryc * np.cos(ac), zc_c], -1)
    Nc = unit(np.stack([np.sin(ac) / rxc, -np.cos(ac) / ryc, np.zeros(NC)], -1))
    ab9 = np.linspace(0, 2 * PI, 8, endpoint=False)
    def ruff_prof(k):
        tuft = 1 + .16 * np.cos(11 * ac[k]) * np.maximum(0, -np.sin(ab9)) ** 1.5        # tufted lower edge
        return np.stack([tc[k] * spow(np.cos(ab9), .75) * tuft + .006 * np.sin(ab9), hc[k] * spow(np.sin(ab9), .75) * (1 + .10 * np.cos(11 * ac[k]) * (np.sin(ab9) < 0))], -1)
    ring_tube('white_chest_ruff', Pc, ruff_prof, 'body', lambda NN, tt, uu, V: ramp_uv('white', sval(NN, hi=.22) - .04), Nc, sides=8)

    print('BODY_STEP hood', flush=True)
    # ---------------------------------------------------------------- the plum hood, down: a thick roll round the back of the neck, lapels on the chest
    hp = cpath([[.150, -.168, .612], [.214, -.070, .650], [.214, .062, .684], [.120, .170, .708], [0, .200, .714],
                [-.120, .170, .708], [-.214, .062, .684], [-.214, -.070, .650], [-.150, -.168, .612]], 25)
    def hood_r(k):
        t = k / 24; back = np.exp(-((t - .5) / .22) ** 2)
        return (.050 + .036 * back, .058 + .040 * back)
    sweep('plum_hood_roll', hp, hood_r, 'body', ramp_sw('plum', hi=.30, occ=.04), sides=10, normals=unit(np.stack([hp[:, 0], hp[:, 1] - .02, np.zeros(len(hp)) + .35], -1)))
    lobe('plum_hood_bag', np.array([0, .206, .640]), np.array([.070, .225, .080]), [0, 1., -.15], 'body', ramp='plum', n=4, occ_in=.15, pole=[1., 0, 0])

    print('BODY_STEP pauldrons', flush=True)
    # ---------------------------------------------------------------- pauldrons: domed armour plates with a silver rim and rivet, two lames
    def dome_shell(name, C, R, tilt_y, th_max, thick, ramp, group, nth=6, nph=22):
        Rm = rot([0, 1., 0], tilt_y)
        th = np.radians(np.linspace(0, th_max, nth + 1))[1:]; ph = np.linspace(0, 2 * PI, nph, endpoint=False)
        TT, PPh = np.meshgrid(th, ph, indexing='ij')
        L = np.stack([np.sin(TT) * np.cos(PPh), np.sin(TT) * np.sin(PPh), np.cos(TT)], -1)
        Pl = L * R; Nl = unit(L / R)
        V = [np.array([0, 0, R[2]])] + list(Pl.reshape(-1, 3)); NN = [np.array([0, 0, 1.])] + list(Nl.reshape(-1, 3))
        Fd = [(0, 1 + i, 1 + (i + 1) % nph) for i in range(nph)]
        for j in range(nth - 1):
            for i in range(nph):
                a0 = 1 + j * nph + i; b0 = 1 + j * nph + (i + 1) % nph; Fd.append((a0, a0 + nph, b0 + nph, b0))
        V = np.array(V) @ Rm.T + C; NN = np.array(NN) @ Rm.T
        Vt, Ft, UVt, Nt = thicken(V, Fd, NN, thick, ramp_uv(ramp, .5), ramp_uv(ramp, .25), ramp_uv(ramp, .5), rim=3)
        UVt = ramp_uv(ramp, sval(Nt, hi=.44 if ramp == 'steel' else .34, lo=.34 if ramp == 'steel' else .24))
        make_obj(name, Vt, Ft, UVt, group, N=Nt)
        rim = (np.stack([np.sin(th[-1]) * np.cos(ph), np.sin(th[-1]) * np.sin(ph), np.full(nph, np.cos(th[-1]))], -1) * R) @ Rm.T + C
        rn = unit((np.stack([np.sin(th[-1]) * np.cos(ph), np.sin(th[-1]) * np.sin(ph), np.zeros(nph)], -1)) @ Rm.T)
        return rim, rn
    PAULD = {}
    ap6 = np.linspace(0, 2 * PI, 6, endpoint=False); ap4 = np.linspace(0, 2 * PI, 4, endpoint=False)
    def plate(name, C_, axis, along, R_, thm, nth=4, nph=16):
        """a steel dome plate round the shoulder: pole on `axis`, radii (along the arm, front-back, along the pole)"""
        ez = unit(np.asarray(axis, float)); ex = unit(np.asarray(along, float) - ez * (np.asarray(along, float) @ ez)); ey = np.cross(ez, ex)
        th = np.radians(np.linspace(0, thm, nth + 1))[1:]; ph = np.linspace(0, 2 * PI, nph, endpoint=False)
        TT, PPh = np.meshgrid(th, ph, indexing='ij')
        L = np.stack([np.sin(TT) * np.cos(PPh), np.sin(TT) * np.sin(PPh), np.cos(TT)], -1)
        Bm = np.array([ex, ey, ez])
        V = np.concatenate([[[0, 0, R_[2]]], (L * R_).reshape(-1, 3)]) @ Bm + C_
        NN = unit(np.concatenate([[[0, 0, 1.]], (L / R_).reshape(-1, 3)]) @ Bm)
        Fd = [(0, 1 + i, 1 + (i + 1) % nph) for i in range(nph)]
        for j in range(nth - 1):
            for i in range(nph):
                a0 = 1 + j * nph + i; b0 = 1 + j * nph + (i + 1) % nph; Fd.append((a0, a0 + nph, b0 + nph, b0))
        Vt, Ft, UVt, Nt = thicken(V, Fd, NN, .014, ramp_uv('steel', .5), ramp_uv('steel', .18), ramp_uv('steel', .4), rim=3)
        make_obj(name, Vt, Ft, ramp_uv('steel', sval(Nt, hi=.28, lo=.26)), 'body', N=Nt)
        def ring(thd, lift):
            t_ = math.radians(thd); Lr = np.stack([np.sin(t_) * np.cos(ph), np.sin(t_) * np.sin(ph), np.full(nph, math.cos(t_))], -1)
            Pn = unit((Lr / R_) @ Bm); return (Lr * R_) @ Bm + C_ + Pn * lift, Pn
        return ring
    for s, tag in ((1, 'L'), (-1, 'R')):
        # round 3: crisp layered steel plates enclosing the sleeve top (no sleeve poking through), lifted 1 cm and outward;
        # a thin dark edge line above each plate's plum trim so the two plates read as separate pieces
        SHo = np.array([s * .232, -.030, .602]); ad_ = unit(np.array([s * math.sin(math.radians(45)), -.06, -math.cos(math.radians(45))]))
        axis = unit(np.array([s * .64, 0, .77]))
        lift = np.array([s * .016, 0, .010])
        # the lower lame nests under the upper plate (same centre, 7% smaller, reaching further down the arm), so it only shows below
        # the upper plate's rim: a clean step, no surfaces crossing
        for k, (off_a, off_n, R_, thm) in enumerate([(.022, -.012, np.array([.118, .124, .104]), 80), (.022, -.012, np.array([.118, .124, .104]) * .93, 106)]):
            C_ = SHo + ad_ * off_a + axis * off_n + lift
            ring = plate('pauldron.%s.%d' % (tag, k), C_, axis, ad_, R_, thm)
            rim, rn = ring(thm, .007)
            ring_tube('pauldron_trim.%s.%d' % (tag, k), rim, lambda j: np.stack([.0100 * np.cos(ap6), .0100 * np.sin(ap6)], -1),
                      'body', lambda NN, tt, uu, V: ramp_uv('plum', sval(NN, hi=.34)), rn, sides=6)
            rim2, rn2 = ring(thm - 9, .0075)
            ring_tube('pauldron_edge.%s.%d' % (tag, k), rim2, lambda j: np.stack([.0045 * np.cos(ap4), .0045 * np.sin(ap4)], -1),
                      'body', lambda NN, tt, uu, V: ramp_uv('dark', .30 + 0 * NN[:, 0]), rn2, sides=4)
        rv = SHo + ad_ * .030 + axis * .095 + lift + np.array([0, -.075, 0])
        lobe('pauldron_rivet.' + tag, rv, np.array([.010, .014, .014]), unit(axis + np.array([0, -.8, 0])), 'body', ramp='dark', n=2, occ_in=0)
        PAULD[tag] = (SHo + lift).tolist()

    print('BODY_STEP belt', flush=True)
    # ---------------------------------------------------------------- the belt and the big silver paw buckle (chart 'buckle')
    BZ = .447; NAS = 24; a_s = np.linspace(0, 2 * PI, NAS, endpoint=False)
    rxs = tax_f(BZ) + .014; rys = tay_f(BZ) + .014
    Pss = np.stack([rxs * spow(np.sin(a_s), 2 / TP), RCY - rys * spow(np.cos(a_s), 2 / TP), np.full(NAS, BZ)], -1)
    Nss = torso_n(a_s, np.full(NAS, BZ)); Nss[:, 2] = 0; Nss = unit(Nss)
    ab8 = np.linspace(0, 2 * PI, 8, endpoint=False)
    ring_tube('dark_belt', Pss, lambda k: np.stack([.012 * spow(np.cos(ab8), .5), .026 * spow(np.sin(ab8), .5)], -1), 'body', lambda NN, tt, uu, V: ramp_uv('belt', sval(NN, hi=.30)), Nss, sides=8)
    BK = np.array([0, RCY - rys - .020, BZ])
    badge('paw_buckle', BK, [0, -1., .06], [0, 0, 1.], .060, .022, 'buckle', 'body', dome=.5, nring=4, nang=24)
    for sx in (-1, 1):
        lobe('buckle_tab.%d' % sx, BK + np.array([sx * .074, .012, 0]), np.array([.014, .024, .030]), [sx * .2, -1, 0], 'body', ramp='silver', n=2, occ_in=.05, pole=[0, 0, 1.])
    def paint_buckle(U, V):
        x = (U - .5) * 2; y = (V - .5) * 2; r = np.sqrt(x * x + y * y)
        C = mix(rgb('silverdark'), rgb('silverlight'), smooth(-.7, .9, y * .75 - x * .30))
        ring = smooth(.66, .70, r) * (1 - smooth(.93, .97, r))
        C = mix(C, mix(rgb('silver'), rgb('silverlight'), .4), .3 * ring)
        C = mix(C, mix(rgb('armourdark'), rgb('armour'), smooth(-.6, .6, y)), 1 - smooth(.62, .67, r))
        C = mix(C, mix(rgb('silver'), rgb('silverlight'), smooth(-.5, .7, y)), .97 * paw_print(x, y, 0, -.02, .46))
        return C

    print('BODY_STEP arms', flush=True)
    # ---------------------------------------------------------------- arms: armour sleeves, silver gauntlet cuffs, white wrist fur, black mitten paws
    ARM = {}; ARM_DEG = 45.
    for s, tag in ((1, 'L'), (-1, 'R')):
        th = math.radians(ARM_DEG); ad = unit(np.array([s * math.sin(th), -.06, -math.cos(th)]))
        SH = np.array([s * .232, -.030, .602])
        fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
        def along(t0, SH=SH, ad=ad): return SH + ad * t0
        path = np.array([along(t0) for t0 in np.linspace(-.06, .150, 8)])
        sweep('armour_sleeve.' + tag, path, lambda k: (.074 - .004 * k / 7, .072 - .004 * k / 7), 'arm.' + tag, ramp_sw('armour', hi=.30), sides=14, cap0=False, cap1=False, normals=np.tile(fwd, (len(path), 1)))
        path = np.array([along(t) for t in np.linspace(.128, .176, 3)])
        sweep('silver_gauntlet_cuff.' + tag, path, lambda k: (.083, .081), 'arm.' + tag, ramp_sw('silver', hi=.34), sides=14, cap0=False, cap1=False, normals=np.tile(fwd, (3, 1)), p=.85)
        # the wrist fur: a puffy white ring of tufts
        WF = along(.196); lat = unit(np.cross(ad, fwd))
        aw = np.linspace(0, 2 * PI, 14, endpoint=False)
        Pw = WF + .060 * (np.cos(aw)[:, None] * fwd + np.sin(aw)[:, None] * lat)
        Nw = unit(np.cos(aw)[:, None] * fwd + np.sin(aw)[:, None] * lat)
        abw = np.linspace(0, 2 * PI, 7, endpoint=False)
        ring_tube('white_wrist_fur.' + tag, Pw, lambda k, aw=aw: np.stack([.028 * (1 + .14 * math.cos(5 * aw[k])) * np.cos(abw), .026 * (1 + .14 * math.cos(5 * aw[k])) * np.sin(abw)], -1),
                  'arm.' + tag, lambda NN, tt, uu, V: ramp_uv('white', sval(NN, hi=.24) - .03), Nw, sides=7)
        WR = along(.215); PC = along(.282); lat2 = np.cross(ad, fwd) * s
        paw_axes = np.array([ad, fwd, lat2])
        fingers = [PC + ad * .054 + fwd * (o * .030) - lat2 * .004 for o in (-1, 0, 1)]
        thumb = PC + fwd * .056 + lat2 * .022 - ad * .010
        def arm_parts(p, WR=WR, PC=PC, paw_axes=paw_axes, fingers=fingers, thumb=thumb, ad=ad):
            d_w = sd_capsule(p, WR - ad * .03, PC, (.058, .068))
            d_paw = sd_ell(p, PC, paw_axes, (.078, .078, .070))
            d_f = [sd_ell(p, f, paw_axes, (.036, .029, .038)) for f in fingers]
            d_t = sd_ell(p, thumb, paw_axes, (.034, .030, .030))
            return d_w, d_paw, d_f, d_t
        def arm_sdf(p, arm_parts=arm_parts):
            d_w, d_paw, d_f, d_t = arm_parts(p)
            d = smin(d_w, d_paw, .030); ff = smin(smin(d_f[0], d_f[1], .007), d_f[2], .007)
            return smin(smin(d, ff, .016), d_t, .012)
        def arm_uv(NN, V, arm_parts=arm_parts):
            d_w, d_paw, d_f, d_t = arm_parts(V)
            cr = crease(d_f[0], d_f[1], .007) * .25 + crease(d_f[1], d_f[2], .007) * .25 + crease(np.minimum(d_paw, d_w), d_t, .012) * .2
            return ramp_uv('fur', sval(NN, occ=1.4 * cr, hi=.34))
        tt_ = np.linspace(0, .16, 321); inside = arm_sdf(PC[None] + ad[None] * tt_[:, None]) < 0
        reach = float(tt_[np.argmin(inside)]) if not inside.all() else .16
        tips = PC + ad * (reach - .008)
        ts = np.concatenate([np.linspace(0, .45, 4)[:-1], np.linspace(.45, 1.0, 13)])
        cen = (WR - ad * .02)[None] + (tips - (WR - ad * .02))[None] * ts[:, None]
        ring_stack('black_mitten_paw.' + tag, arm_sdf, cen, np.tile(ad, (len(ts), 1)), 'arm.' + tag, arm_uv, sides=13, tmax=.17, ref=fwd)
        ARM[tag] = {'shoulder': SH.tolist(), 'elbow': along(.140).tolist(), 'wrist': WR.tolist(), 'palm': (PC + lat2 * .010).tolist(),
                    'grip_axis': unit(np.cross(ad, fwd) * s * 0 + fwd * 0 + lat2).tolist(), 'arm_dir': ad.tolist()}

    print('BODY_STEP legs', flush=True)
    # ---------------------------------------------------------------- legs: black fur shorts with a ragged hem, white leg fluff, black boots with silver caps
    LEG = {}
    for s, tag in ((1, 'L'), (-1, 'R')):
        def shorts_sdf(p, s=s):
            d = ell(p, [s * .125, -.012, .282], [.168, .188, .130])
            d = smin(d, ell(p, [s * .100, -.022, .372], [.165, .192, .072]), .05)
            ang = np.arctan2(p[:, 1] + .012, p[:, 0] - s * .150)
            d = d + .0075 * np.cos(9 * ang + .4 * s) * smooth(.215, .165, p[:, 2]) * smooth(.150, .175, p[:, 2])      # the ragged fur hem
            return d
        star_mesh('black_fur_shorts.' + tag, shorts_sdf, np.array([s * .130, -.012, .290]), 'body',
                  lambda NN, V: ramp_uv('fur', sval(NN, hi=.34, occ=.10 * smooth(.20, .15, V[:, 2]))), nth=9, nph=14, tmax=.40)
        CXl, CYl = s * .208, -.020
        def leg_sdf(p, CXl=CXl, CYl=CYl, s=s):
            return sd_capsule(p, np.array([CXl, CYl, .080]), np.array([s * .175, CYl, .205]), (.074, .084))
        star_mesh('black_fur_leg.' + tag, leg_sdf, np.array([CXl, CYl, .140]), 'body',
                  lambda NN, V: ramp_uv('fur', sval(NN, hi=.34, occ=.06)), nth=8, nph=14, tmax=.22)
        def cuff_sdf(p, CXl=CXl, CYl=CYl):
            ang = np.arctan2(p[:, 1] - CYl, p[:, 0] - CXl)
            rr = np.hypot(p[:, 0] - CXl, p[:, 1] - CYl)
            d = np.hypot(rr - .072, (p[:, 2] - .112) / 1.05) - .030
            return d - .007 * (.5 + .5 * np.cos(8 * ang)) * smooth(.12, .09, p[:, 2])
        star_mesh('white_leg_cuff.' + tag, lambda p, cuff_sdf=cuff_sdf, leg_sdf=leg_sdf: np.minimum(cuff_sdf(p), leg_sdf(p) + .02), np.array([CXl, CYl, .112]), 'body',
                  lambda NN, V: ramp_uv('white', sval(NN, hi=.24) - .04 * smooth(.10, .085, V[:, 2])), nth=7, nph=16, tmax=.20)
        FC = np.array([s * .215, -.058, .050]); FAX = rot([0, 0, 1], s * math.radians(6)).T
        def boot_sdf(p, FC=FC, FAX=FAX, s=s):
            d = sd_ell(p, FC, FAX, (.104, .162, .060))
            d = smin(d, sd_capsule(p, np.array([s * .210, -.020, .040]), np.array([s * .210, -.020, .095]), .090), .04)
            d = smax(d, p[:, 2] - .102, .012)
            return smax(d, -(p[:, 2] - .002), .006)
        star_mesh('black_boot.' + tag, boot_sdf, FC + np.array([0, .01, .015]), 'body', ramp_fn('belt', hi=.34), nth=9, nph=16, tmax=.30)
        def toe_sdf(p, boot_sdf=boot_sdf, FC=FC):
            d = smax(boot_sdf(p) - .006, p[:, 1] - (FC[1] - .070), .012)
            return smax(d, p[:, 2] - .078, .010)
        star_mesh('silver_toe_cap.' + tag, toe_sdf, FC + np.array([0, -.120, -.012]), 'body', ramp_fn('silver', hi=.36), nth=6, nph=14, tmax=.20)
        def heel_sdf(p, boot_sdf=boot_sdf, FC=FC):
            d = smax(boot_sdf(p) - .005, -(p[:, 1] - (FC[1] + .108)), .012)
            return smax(d, p[:, 2] - .062, .010)
        star_mesh('silver_heel_cap.' + tag, heel_sdf, FC + np.array([0, .135, -.016]), 'body', ramp_fn('silver', hi=.36), nth=5, nph=14, tmax=.16)
        LEG[tag] = {'hip': [s * .112, -.010, .352], 'knee': [s * .190, -.016, .210], 'ankle': [s * .210, -.020, .098], 'toe': [s * .228, -.200, .040]}

    print('BODY_STEP tabard', flush=True)
    # ---------------------------------------------------------------- the lower tabard: three plum panels over the hips (chart 'tabard'), separate islands
    def hip_ax(z): return .254 + .16 * (.425 - z)
    def hip_ay(z): return .207 + .085 * (.425 - z)
    HPC = RCY + .010
    def hip_pt(a, z, off=.012):
        a = np.asarray(a, float); z = np.asarray(z, float)
        P = np.stack([hip_ax(z) * spow(np.sin(a), 2 / TP), HPC - hip_ay(z) * spow(np.cos(a), 2 / TP), z + 0 * a], -1)
        return P
    def hip_n(a, z, e=1e-4):
        da = hip_pt(np.asarray(a) + e, z) - hip_pt(np.asarray(a) - e, z); dz = hip_pt(a, np.asarray(z) + e) - hip_pt(a, np.asarray(z) - e)
        n = unit(np.cross(dz, da)); c = hip_pt(a, z) - np.stack([0 * np.asarray(a), HPC + 0 * np.asarray(a), np.asarray(z) + 0 * np.asarray(a)], -1)
        return np.where(((n * c).sum(-1) < 0)[..., None], -n, n)
    PANELS = [('centre', -.36, .36, lambda a: .167 + .040 * (np.abs(a) / .36) ** 1.3, (0, 1 / 3)),
              ('L', .44, 1.20, lambda a: .190 - .010 * (a - .44) / .76, (1 / 3, 2 / 3)),
              ('R', -1.20, -.44, lambda a: .190 - .010 * (-a - .44) / .76, (2 / 3, 1.))]
    TB_TOP = .432
    for name, a0, a1, hem, (u0, u1) in PANELS:
        na, nz = 6, 8
        ua = np.linspace(0, 1, na); vz = np.linspace(0, 1, nz)
        UU, VV = np.meshgrid(ua, vz)
        A = a0 + (a1 - a0) * UU; Zb = hem(A); Z = TB_TOP + (Zb - TB_TOP) * VV
        P = hip_pt(A, Z) + hip_n(A, Z) * .016
        N = hip_n(A, Z)
        flare = (VV ** 1.6) * .020
        P = P + N * flare[..., None]
        uvo = au('tabard', (u0 + (u1 - u0) * UU).ravel(), (1 - VV).ravel())
        Vt, Ft, UVt, Nt = thicken(P.reshape(-1, 3), grid_faces(nz, na), N.reshape(-1, 3), .012, uvo, ramp_uv('plum', .25), ramp_uv('silver', .55), rim=3)
        make_obj('tabard_panel.' + name, Vt, Ft, UVt, 'tabard', N=Nt)
    def paint_tabard(U, V):
        pid = np.clip((U * 3).astype(int), 0, 2); u = U * 3 - pid
        C = mix(rgb('plum'), rgb('plumlight'), .35 * smooth(.2, 1., V)); C = mix(C, rgb('plumdark'), .35 * smooth(.35, .0, V))
        # silver trim on every edge (the hem edge reads thicker), rivets at the lower corners of the side panels
        edge = np.minimum(np.minimum(u, 1 - u) * np.where(pid == 0, 1.0, 1.15), (1 - V) * 2.2)
        hemb = V * 1.0
        trim = np.maximum(1 - smooth(.035, .055, edge), 1 - smooth(.040, .060, hemb))
        C = mix(C, mix(rgb('silverdark'), rgb('silverlight'), smooth(.2, .9, V)), .95 * trim)
        inner = np.maximum(1 - smooth(.075, .085, np.minimum(u, 1 - u)), 1 - smooth(.085, .095, hemb)) * (1 - trim)
        C = mix(C, rgb('plumdark'), .35 * inner)
        # the centre panel: the teal ghostlight 4-point star cluster; the side panels: silver crescent moons
        cx_, cy_ = .5, .42
        def star4(px, py, cx, cy, r):
            dx = np.abs(px - cx) / r; dy = np.abs(py - cy) / (r * 1.25); return dx ** .55 + dy ** .55
        cen = pid == 0
        for (sx_, sy_, sr_) in ((.5, .40, .16), (.30, .40, .07), (.70, .40, .07), (.5, .22, .065), (.5, .60, .07)):
            st = star4(u, V, sx_, sy_, sr_)
            C = mix(C, mix(rgb('teal'), rgb('teallight'), smooth(1., .3, st)), (1 - smooth(.95, 1.05, st)) * cen)
        side = pid > 0
        mx_ = np.where(pid == 1, .45, .55)
        r1 = np.sqrt(((u - mx_) / .21) ** 2 + ((V - .45) / .14) ** 2); r2 = np.sqrt(((u - mx_ - np.where(pid == 1, .09, -.09)) / .19) ** 2 + ((V - .40) / .13) ** 2)
        moon = (1 - smooth(.94, 1.04, r1)) * smooth(.94, 1.04, r2)
        C = mix(C, mix(rgb('silver'), rgb('silverlight'), .4), .96 * moon * side)
        for rx_ in (.18, .82):
            rv_ = np.sqrt(((u - rx_) / .07) ** 2 + ((V - .12) / .05) ** 2)
            C = mix(C, rgb('silverlight'), (1 - smooth(.85, 1.1, rv_)) * side)
        # the teal rune stitches along the hem (small dashes)
        st_ = (np.abs(V - .16) < .016) * (np.mod(u * 9, 1.) < .5) * (np.minimum(u, 1 - u) > .12) * (pid > 0)
        C = mix(C, rgb('teal'), .9 * st_)
        return C

    print('BODY_STEP cloak', flush=True)
    # ---------------------------------------------------------------- the plum cloak: hangs from under the hood round the back, flaring (chart 'cloak')
    CA0, CA1 = math.radians(110), math.radians(250)
    CZT = .636
    def cl_X(z): return 1.10 * np.interp(z, [.20, .35, .50, CZT], [.410, .370, .318, .262])
    def cl_Y(z): return np.interp(z, [.20, .35, .50, CZT], [.330, .292, .248, .206])
    CLC = RCY + .050
    def cl_hem(a): return .205 + .028 * smooth(PI * .80, PI * .60, np.abs(a - PI) + PI * .5) * 0 + .030 * (np.abs(a - PI) / (PI - CA0)) ** 2
    def cl_pt(a, z):
        f = 1 + .040 * smooth(.56, .22, z) * np.cos(7 * (a - PI)) + .010 * np.cos(13 * (a - PI) + .7) * smooth(.45, .22, z)
        return np.stack([cl_X(z) * f * np.sin(a), CLC - cl_Y(z) * f * np.cos(a), z + 0 * a], -1)
    na, nz = 22, 9
    ua = np.linspace(0, 1, na); vz = np.linspace(0, 1, nz)
    UU, VV = np.meshgrid(ua, vz)
    A = CA0 + (CA1 - CA0) * UU; Zh = cl_hem(A); Z = CZT + (Zh - CZT) * VV
    P = cl_pt(A, Z)
    dA = cl_pt(A + 1e-4, Z) - cl_pt(A - 1e-4, Z); dZ = cl_pt(A, Z + 1e-4) - cl_pt(A, Z - 1e-4)
    N = unit(np.cross(dZ, dA))
    cc = P - np.stack([0 * A, CLC + 0 * A, Z], -1); N = np.where(((N * cc).sum(-1) < 0)[..., None], -N, N)
    uvo = au('cloak', UU.ravel(), (1 - VV).ravel())
    Vt, Ft, UVt, Nt = thicken(P.reshape(-1, 3), grid_faces(nz, na), N.reshape(-1, 3), .016, uvo, ramp_uv('plum', .20), ramp_uv('plum', .40), rim=3)
    make_obj('plum_cloak', Vt, Ft, UVt, 'cloak', N=Nt)
    def paint_cloak(U, V):
        a = CA0 + (CA1 - CA0) * U; z = CZT + (cl_hem(a) - CZT) * (1 - V)
        P_ = cl_pt(a, z); dA_ = cl_pt(a + 1e-4, z) - cl_pt(a - 1e-4, z); dZ_ = cl_pt(a, z + 1e-4) - cl_pt(a, z - 1e-4)
        n = unit(np.cross(dZ_, dA_)); cc_ = P_ - np.stack([0 * a, CLC + 0 * a, z], -1); n = np.where(((n * cc_).sum(-1) < 0)[..., None], -n, n)
        C = ramp_colour('plum', sval(n, hi=.30, occ=.10 * smooth(.40, .62, z)))
        # the big silver paw on the back, the crescent moon under it (sheet back view)
        x = (U - .5) * (CA1 - CA0) * .30; y = z
        C = mix(C, mix(rgb('silver'), rgb('silverlight'), .35), .96 * paw_print(x, y, 0, .488, .092))
        r1 = np.sqrt((x / .120) ** 2 + ((y - .430) / .074) ** 2); r2 = np.sqrt((x / .113) ** 2 + ((y - .456) / .072) ** 2)
        moon = (1 - smooth(.95, 1.04, r1)) * smooth(.95, 1.04, r2) * (y < .45)
        tip = (np.abs(x) / .016 + np.maximum(0, .372 - y) / .028 < 1) * (y < .374) * (y > .344)
        C = mix(C, mix(rgb('silver'), rgb('silverlight'), .3), .96 * np.maximum(moon, tip))
        C = mix(C, rgb('plumdark'), .30 * smooth(.08, .02, V))                       # a darker hem band
        return C

    print('BODY_STEP tail', flush=True)
    # ---------------------------------------------------------------- the big plumed tail: out from under the cloak hem, curling up behind it (chart 'tail')
    TB_C = np.array([-.180, .440, .262])                                  # the ball-curl centre: hip height, behind his right leg
    TB_AX = unit(np.array([-.45, .89, 0.]))                               # the curl's axis points back and a little outward
    TB_E1 = np.array([0, 0, 1.]); TB_E2 = unit(np.cross(TB_AX, TB_E1))
    NTL = 36
    stem = cpath([[-.045, .225, .262], [-.085, .315, .190], [-.130, .380, .165]], 6)[:-1]
    th_ = np.linspace(-PI * .55, PI * 2.05, NTL - len(stem))                 # about 1.45 turns, spiralling inward
    rs_ = np.interp(th_, [th_[0], th_[0] + 1.6, th_[-1]], [.085, .058, .010])
    ax_off = np.interp(th_, [th_[0], th_[-1]], [-.020, .030])
    spiral = TB_C + rs_[:, None] * (np.cos(th_)[:, None] * TB_E2 + np.sin(th_)[:, None] * TB_E1) + ax_off[:, None] * TB_AX
    tp = np.concatenate([stem, spiral])
    for _ in range(2): tp[1:-1] = .25 * tp[:-2] + .5 * tp[1:-1] + .25 * tp[2:]
    TAIL_PATH = tp
    def tail_r(k):
        t = k / (NTL - 1)
        r = np.interp(t, [0, .14, .30, .55, .80, 1.], [.060, .080, .086, .080, .066, .048])
        r = r * (1 + .10 * math.cos(2 * PI * 5.0 * t) * smooth(.20, .34, t))
        return (r, r * .96)
    sweep('plumed_tail', tp, tail_r, 'tail', lambda NV, tt, uu, V: au('tail', uu, tt), sides=10, normals=np.tile(TB_AX, (len(tp), 1)))
    def paint_tail(U, V):
        t = V; a = U * 2 * PI
        k = np.clip(np.round(t * (NTL - 1)).astype(int), 0, NTL - 1)
        Tn = unit(np.gradient(TAIL_PATH, axis=0))[k]; Nn = unit(np.tile(TB_AX, (len(k.ravel()), 1)).reshape(k.shape + (3,)) - Tn * (Tn @ TB_AX)[..., None])
        Bn = np.cross(Tn, Nn); n = unit(Nn * np.cos(a)[..., None] + Bn * np.sin(a)[..., None])
        sv = sval(n, hi=.36)
        edge = .40 + .030 * np.sin(a * 3 + 1.) + .018 * np.sin(a * 7 + .4)     # round 3: black at the root wrapping into a white curl
        w = smooth(edge - .070, edge + .070, t)
        C = mix(ramp_colour('lock', sv), ramp_colour('white', sv - .02), w)
        C = mix(C, rgb('#18161B'), .25 * (1 - w) * (.5 + .5 * np.cos(2 * PI * 5.0 * t)) * smooth(.20, .34, t))   # creases between the lobes
        C = mix(C, rgb('whitedark'), .22 * w * (.5 + .5 * np.cos(2 * PI * 5.0 * t)))
        return C

    print('BODY_STEP tome', flush=True)
    # ---------------------------------------------------------------- the spell tome on his left hip (separate object 'tome'): plum covers, a silver frame, a paw
    TOME_C = np.array([.262, -.168, .380])
    tn = unit(np.array([math.sin(math.radians(46)), -math.cos(math.radians(46)), 0.]))
    tup = unit(np.array([0, 0, 1.]) @ rot(tn, math.radians(-8)).T)
    trt = np.cross(tup, tn)
    TAXES = np.array([trt, tup, tn])
    THW, THH, TTH = .094, .106, .030
    for k, off in enumerate((TTH - .0055, -(TTH - .0055))):
        cc_ = TOME_C + tn * off
        f = lambda p, cc_=cc_: sd_box(p, cc_, TAXES, (THW, THH, .0055), .0045)
        def tuv(NN, V, cc_=cc_, k=k):
            q = (V - cc_) @ TAXES.T; u = .5 + q[:, 0] / (2 * THW) * (1 if k == 0 else -1); v = .5 + q[:, 1] / (2 * THH)
            return au('tome', np.clip(u, .01, .99), np.clip(v, .01, .99))
        star_mesh('tome_cover.%d' % k, f, cc_, 'tome', tuv, nth=6, nph=14, tmax=.2, axis=tn, ref=trt)
    fpg = lambda p: sd_box(p, TOME_C + trt * .004, TAXES, (THW - .010, THH - .008, TTH - .009), .004)
    star_mesh('tome_pages', fpg, TOME_C, 'tome', lambda NN, V: ramp_uv('page', sval(NN, hi=.20) - .05), nth=5, nph=12, tmax=.2, axis=tn, ref=trt)
    spine = [TOME_C + trt * (THW - .004) + tup * t for t in np.linspace(-THH + .006, THH - .006, 6)]
    sweep('tome_spine', spine, lambda k: (TTH * .95, .016), 'tome', ramp_sw('plum', hi=.30), sides=10, normals=np.tile(tn, (6, 1)))
    lobe('tome_clasp', TOME_C - trt * (THW + .002) + tn * .002, np.array([.012, .018, .026]), -trt, 'tome', ramp='silver', n=2, occ_in=0, pole=tup)
    sweep('tome_strap', [np.array([.215, -.210, .440]), TOME_C + tup * (THH + .010) + trt * .030 + tn * .004, TOME_C + tup * (THH - .012) + trt * .030 + tn * .034],
          lambda k: (.005, .014), 'tome', ramp_sw('belt'), sides=8, normals=np.tile(tn, (3, 1)), p=.5)
    def paint_tome(U, V):
        x = (U - .5) * 2; y = (V - .5) * 2
        C = mix(rgb('plum'), rgb('plumlight'), .30 * smooth(-.3, 1., y - x * .3))
        fr = np.maximum(np.abs(x), np.abs(y) * .97)
        C = mix(C, mix(rgb('silverdark'), rgb('silverlight'), smooth(-.8, .9, y)), .96 * smooth(.80, .83, fr))
        C = mix(C, rgb('plumdark'), .5 * smooth(.70, .73, fr) * (1 - smooth(.80, .83, fr)))
        for cx_, cy_ in ((-.88, -.88), (.88, -.88), (-.88, .88), (.88, .88)):
            C = mix(C, rgb('silverlight'), 1 - smooth(.06, .10, np.hypot(x - cx_, y - cy_)))
        C = mix(C, mix(rgb('silver'), rgb('whitelight'), .45), .97 * paw_print(x, y, 0, -.02, .40))
        return C

    # ---------------------------------------------------------------- measurements of the authored parts (metres and fractions of the 1.20 m crown)
    def _vs(prefixes):
        out = []
        for g, obs in parts.items():
            for o in obs:
                if any(o.name.startswith(p) for p in prefixes): out += [list(o.matrix_world @ v.co) for v in o.data.vertices]
        return np.array(out)
    def _ext(v): return {'min': [round(float(c), 3) for c in v.min(0)], 'max': [round(float(c), 3) for c in v.max(0)], 'size': [round(float(c), 3) for c in np.ptp(v, 0)]}
    _T = T_CROWN
    def _zf(v): return [round(float(v[:, 2].min()) / _T, 3), round(float(v[:, 2].max()) / _T, 3)]
    def _wf(v): return round(float(np.ptp(v[:, 0])) / _T, 3)
    _p = {k: _vs(v) for k, v in {'pauldrons': ['pauldron'], 'belt': ['dark_belt'], 'buckle': ['paw_buckle'], 'tabard': ['tabard_panel'],
                                  'cloak': ['plum_cloak'], 'tome': ['tome'], 'shorts': ['black_fur_shorts'], 'leg_fluff': ['white_leg_cuff'],
                                  'boots': ['black_boot', 'silver_toe', 'silver_heel'], 'tail': ['plumed_tail'], 'ruff': ['white_chest_ruff'],
                                  'hood': ['plum_hood'], 'paws': ['black_mitten_paw']}.items()}
    SHEET_BODY = {'pauldrons_z': [.459, .541], 'pauldrons_width': .634, 'belt_band_z': [.352, .393], 'buckle_diameter': .105,
                  'tabard_hem_centre_z': .139, 'tabard_side_hem_z': .153, 'tabard_width': .505, 'cloak_hem_side_z': .194, 'cloak_width': .71,
                  'tome_z': [.229, .421], 'tome_width_front': .164, 'shorts_hem_z': .12, 'leg_cuff_z': [.057, .139], 'boots_top_z': .071,
                  'boots_width': .574, 'tail_z': [.117, .552], 'tail_depth': .34, 'paws_width': .885, 'chest_V_z': .481}
    BODY_MEAS = {'body_sheet_frac_of_crown': SHEET_BODY, 'body_model_frac_of_crown': {
        'pauldrons_z': _zf(_p['pauldrons']), 'pauldrons_width': _wf(_p['pauldrons']), 'belt_band_z': _zf(_p['belt']),
        'buckle_diameter': round(float(np.ptp(_p['buckle'][:, 0])) / _T, 3), 'tabard_hem_centre_z': round(float(_vs(['tabard_panel.centre'])[:, 2].min()) / _T, 3),
        'tabard_side_hem_z': round(float(_vs(['tabard_panel.L'])[:, 2].min()) / _T, 3), 'tabard_width': _wf(_p['tabard']),
        'cloak_hem_side_z': round(float(_p['cloak'][np.abs(_p['cloak'][:, 0]) > .30][:, 2].min()) / _T, 3), 'cloak_width': _wf(_p['cloak']),
        'tome_z': _zf(_p['tome']), 'tome_width_front': _wf(_p['tome']), 'shorts_hem_z': round(float(_p['shorts'][:, 2].min()) / _T, 3),
        'leg_cuff_z': _zf(_p['leg_fluff']), 'boots_top_z': round(float(_p['boots'][:, 2].max()) / _T, 3), 'boots_width': _wf(_p['boots']),
        'tail_z': _zf(_p['tail']), 'tail_depth': round(float(np.ptp(_p['tail'][:, 1])) / _T, 3), 'paws_width': _wf(_p['paws']),
        'chest_V_z': round(float(_p['ruff'][np.abs(_p['ruff'][:, 0]) < .02][:, 2].min()) / _T, 3)}, 'arm_angle_from_vertical_deg': ARM_DEG}

    print('BODY_STEP joints', flush=True)
    JOINTS_BODY = {'hips': [0, -.010, .352], 'spine': [0, -.020, .460], 'chest': [0, -.030, .580], 'neck': [0, -.032, .668],
                   'arms': {t: {k: v for k, v in ARM[t].items() if k in ('shoulder', 'elbow', 'wrist')} for t in ARM}, 'legs': LEG,
                   'tail': [TAIL_PATH[i].tolist() for i in (0, 4, 9, 16, 25, len(TAIL_PATH) - 1)],
                   'palm_R': ARM['R']['palm'], 'palm_L': ARM['L']['palm']}
    BODY_PIVOTS = {'arm.L': tuple(ARM['L']['shoulder']), 'arm.R': tuple(ARM['R']['shoulder']), 'tail': tuple(TAIL_PATH[0]),
                   'body': (0, 0, 0), 'cloak': (0, CLC, CZT), 'tabard': (0, HPC, TB_TOP), 'tome': tuple(TOME_C)}
    BODY_PAINTERS = {'torso': paint_torso, 'cloak': paint_cloak, 'tabard': paint_tabard, 'tail': paint_tail, 'tome': paint_tome, 'buckle': paint_buckle}
    def POST_JOIN():
        joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X'}
        joints.update({k: JOINTS_BODY[k] for k in ('hips', 'spine', 'chest', 'neck')})
        joints['head'] = [float(v) for v in O]
        joints['jaw_pivot'] = [0, float(HY - .30 * W), float(CHIN + .200 * W)]
        joints['eyes'] = {'R': eye_centers['R'], 'L': eye_centers['L']}
        joints['ears'] = {t: {'base': [float(v) for v in ear_info[t]['base']], 'fold': [float(v) for v in ear_info[t]['fold']],
                              'tip': [float(v) for v in ear_info[t]['tip']]} for t in ('R', 'L')}
        joints['arms'] = JOINTS_BODY['arms']; joints['legs'] = JOINTS_BODY['legs']; joints['tail'] = JOINTS_BODY['tail']
        joints['palm_R'] = JOINTS_BODY['palm_R']; joints['palm_L'] = JOINTS_BODY['palm_L']
        joints['topknot'] = {'base': [float(v) for v in TK_C], 'up': [float(v) for v in TK_UP]}
        joints['tome'] = [float(v) for v in TOME_C]
        joints['mouth'] = MOUTH_INFO
        joints['cloak_top'] = [0, float(CLC), float(CZT)]; joints['tabard_top'] = [0, float(HPC), float(TB_TOP)]
        joints['notes'] = ['Phase 1: no rig, weights or animations. Same keys as chewy-b joints-round13.json, plus palm_R / palm_L, topknot, tome, cloak_top, tabard_top.',
                           'head = the head centre (the radial origin), not the nod pivot: the rig should put the head bone at the base of the skull.',
                           'Head skin = zero surface of one smooth implicit ball (round skull + forehead dome + cheek puffs + nose pad + moustache lobes + beard puff + nose), analytic normals, adaptive toon-band refinement.',
                           'Eyelid holes ringed by 6 loops each with the rim rolled 4.5 mm in behind separate lens eyeballs; 4 round the nose. Mouth: a sculpted lip-parting groove with 5 loops round it (round caps at the corners); the skin is cut along the parting (see mouth).',
                           'Ear locks: separate pieces (Shihtzu_ear_L / _R), one closed clay mass per side (five locks merging at the top), 31 latitude rings from the root to the lock bottoms; ears.base / fold / tip are the mean of the five locks.',
                           'Topknot: separate piece (Shihtzu_topknot), rigid on the head. Tail: Shihtzu_tail, a 36-ring spiral ball-curl (bend loops), pivot = tail[0].',
                           'Legs: black fur legs with a white cuff above the boots. Cloak (Shihtzu_cloak) and the three tabard panels (Shihtzu_tabard, separate islands) are separate pieces with 11 / 9 bend rows. tome is its own object, rigid on the hips.',
                           'No body skin under the armour torso, sleeves, shorts or boots.']
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
    return (.035 + .17 * np.sin(np.clip(psi, 0, PI)) ** .7 + .08 * np.exp(-((psi - .35) / .35) ** 2)) * smooth(-.25, .20, psi)
PAINT_OPTS = {'band': True, 'blush': True}
def crease(a, b, k): return clamp((np.minimum(a, b) - smin(a, b, k)) / k)
def ramp_colour(name, u):
    lo, base, hi = [rgb(c) for c in RAMPS[name]]; u = clamp(u)
    return np.where((u < .5)[..., None], mix(lo, base, smooth(0, .5, u)), mix(base, hi, smooth(.5, 1, u)))
def blaze_hw(z): return np.interp(z, [.60, .68, .76, .84, .92, 1.05], [.150, .132, .120, .126, .140, .136])
def face_white(q):
    """1 = white fur, 0 = black fur (W units, head-local q): the white chrysanthemum face round and under the eyes, the black
    forehead sides above-outside the eyes (a roughly level edge merging into the ear locks), the white blaze up the centre"""
    x, y, z = q[:, 0], q[:, 1], q[:, 2]; ax_ = np.abs(x)
    # the black edge: level above the eyes (0.05 W over the opening top), dropping round the outer corner into the side fur
    edge = EZW + EHHW + .052 + .010 * smooth(.14, .40, ax_) - (EHHW + .030) * smooth(.385, .505, ax_)
    above = smooth(edge - .010, edge + .010, z)
    blaze = 1 - smooth(blaze_hw(z) - .006, blaze_hw(z) + .006, ax_)
    cap = above * (1 - blaze)
    # the head sides and back (under the ear locks) are black; the beard, cheeks and muzzle are white
    side = np.maximum(smooth(.540, .600, ax_), smooth(-.06, .02, y) * smooth(-.02, .06, z))
    blk = np.maximum(cap, side)
    tuft = (y > -.05) * (z > .74) * (1 - smooth(.135 * smooth(.74, .97, z) ** .8 - .006, .135 * smooth(.74, .97, z) ** .8 + .006, ax_))
    blaze_top = (z > .90) * (1 - smooth(.13, .15, ax_)) * (y < .10)
    return clamp(1 - blk + tuft + blaze_top)
def paint_hit(d):
    """the head surface along each paint direction: bisection, then the outermost root where bisection found an inner one"""
    P = radial_hit(d); t = np.linalg.norm(P - O, axis=1)
    bad = np.zeros(len(d), bool)
    for k in range(1, 9):
        tk = np.minimum(t + .012 * k, .80); bad |= head_sdf(O + d * tk[:, None]) < 0
    if bad.any(): P[bad] = radial_hit_outer(d[bad])
    return P
def paint_head(U, V):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = paint_hit(d); n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); zr = q[:, 2]
    fr = smooth(HY + .04, HY - .06, y)
    up = n @ LIGHT
    # black fur with a cool sheen on the top planes; white fur with warm cream shading
    Cb = mix(rgb('fur'), rgb('furlight'), .55 * smooth(.30, 1.0, up)); Cb = mix(Cb, rgb('furdark'), .45 * smooth(.0, .9, -up))
    Cw = mix(rgb('white'), rgb('whitelight'), .60 * smooth(.20, 1.0, up)); Cw = mix(Cw, rgb('whitedark'), .55 * smooth(.0, .9, -up))
    qw = warped(q); dsk = skull(qw); qm = mirror(qw)
    dch = ell(qm, *CHK); dmu = mus_sdf(qw); dbr = ell(qw, *BRD); dpd = ell(qw, *PAD)
    a0 = smin(dsk, dch, K_CHK); a1 = smin(a0, dpd, K_PAD); a2 = smin(a1, dmu, K_MUS)
    cr = .55 * crease(dsk, dch, K_CHK) + .45 * crease(a0, dpd, K_PAD) + .95 * crease(a1, dmu, K_MUS) + 1.0 * crease(a2, dbr, K_BRD)
    c = np.array(MUS[0]); cl = c * np.array([-1, 1, 1.])
    cr = cr + 1.3 * crease(ell(qw, c, MUS[1]), ell(qw, cl, MUS[1]), .006) * smooth(.40, .33, zr) * smooth(MA_TOP - .004, MA_TOP + .020, zr)      # the cleft between the moustache lobes
    Cw = mix(Cw, rgb('crease'), clamp(cr) * .70 * fr)
    # soft fur strands on the white puffs: a few gentle radial shading lines (painted, never geometry)
    ang = np.arctan2(q[:, 2] - .20, q[:, 0])
    Cw = mix(Cw, rgb('whitedark'), .10 * (.5 + .5 * np.sin(ang * 18 + 3 * np.sin(ang * 5))) * smooth(.30, .60, np.hypot(q[:, 0], q[:, 2] - .20)) * smooth(.62, .40, zr) * fr)
    wmask = face_white(q)
    C = mix(Cb, Cw, wmask)
    # cool sheen highlights on the black (cap, patch tops, back of the head) so the forms read under the toon band
    upf = n @ unit(np.array([-.10, -.55, .83]))
    crown_hi = smooth(.45, .95, n[:, 2]) * smooth(.70, .92, zr)
    pe = np.sqrt(((np.abs(q[:, 0]) - .330) / .170) ** 2 + ((zr - EZW - .260) / .120) ** 2)
    patch_hi = (1 - smooth(.55, 1.0, pe)) * smooth(.05, .60, upf)
    C = mix(C, rgb('sheen'), clamp(.45 * crown_hi + .40 * patch_hi) * (1 - wmask))
    C = mix(C, rgb('whitedark'), .35 * smooth(.04, -.04, zr) * smooth(-.2, -.7, n[:, 2]) * wmask)      # under the beard
    # nose button: near-black with a soft top highlight and two small nostrils
    rn = np.sqrt((((q - np.array(NOSE[0])) / np.array(NOSE[1])) ** 2).sum(1))
    nose_c = mix(rgb('#141216'), rgb('#3A3540'), smooth(-.45, .85, n @ unit(np.array([-.10, -.45, 1.]))))
    C = mix(C, nose_c, .97 * (1 - smooth(.95, 1.20, rn)))
    rh_ = np.sqrt((((q - (np.array(NOSE[0]) + np.array([-.012, -.030, .018]))) / np.array([.026, .022, .011])) ** 2).sum(1))
    C = mix(C, rgb('nosehi'), .90 * (1 - smooth(.55, 1.0, rh_)) * (rn < 1.15))
    for sx in (-1, 1):
        dx_ = q[:, 0] - sx * .030; dz_ = q[:, 2] - (NOSE[0][2] - .012)
        ca_, sa_ = math.cos(sx * .45), math.sin(sx * .45)
        rno = np.sqrt(((dx_ * ca_ + dz_ * sa_) / .016) ** 2 + ((-dx_ * sa_ + dz_ * ca_) / .008) ** 2) + 9 * (q[:, 1] > NOSE[0][1] - .010)
        C = mix(C, rgb('#09080B'), .90 * (1 - smooth(.75, 1.10, rno)))
    # blush: soft pink dabs on the outer cheek puffs
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .90 * (1 - smooth(.30, 1.10, r)) * fr * PAINT_OPTS['blush'])
    # the philtrum and the small soft mouth line under the moustache (the arch top), the arch sides as a soft crease
    # round 4: the sculpted mouth. No painted line: a small dark inner shade only on the groove walls, by depth behind the
    # un-grooved surface (the light and the toon band draw the rest)
    mb = (fr > 0) & mouth_mask(q)
    if mb.any():
        dep = -head_local_pre(q[mb])
        C[mb] = mix(C[mb], mix(rgb('#6E5C5A'), rgb('#3E3034'), smooth(.0065, .0105, dep)), .92 * smooth(.0040, .0100, dep))
    # the thick upper lash line round each eye opening (and a thin soft lower rim)
    for s in (-1, 1):
        sr, psi, X, Z = eye_s(s, x, z)
        near_eye = fr * (sr < 1.8)
        th = lash_th(psi)
        lash = (1 - smooth(1 + th - .015, 1 + th + .015, sr)) * PAINT_OPTS['band']
        low = (1 - smooth(1.025, 1.055, sr)) * smooth(.10, -.40, np.sin(psi))
        C = mix(C, rgb('lash'), np.maximum(lash, .42 * low) * near_eye)
    return C.reshape(sh + (3,))

def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .09; irx = .70; irz = .90; iz = (1 - .05) - irz          # iris 70 % of the opening, top tucked under the lash
    C = mix(rgb('sclera'), rgb('#E9DCD2'), .50 * smooth(.48, .98, Z))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    g = smooth(.55, -.85, ez)
    I = mix(rgb('#4A2810'), rgb('#8A5420'), smooth(0., .40, g))
    I = mix(I, rgb('iris'), smooth(.30, .72, g))
    I = mix(I, rgb('#E8A850'), .80 * smooth(.66, 1.0, g) * (1 - smooth(.82, .96, r)))     # the bright lower amber band
    I = mix(I, rgb('#3A1E0A'), .72 * smooth(.84, 1.0, r))                                  # the darker rim
    I = I * (1 - .035 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 30 + r * 10)) * smooth(.4, .8, r))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    pz = iz + .07 * irz; R = np.sqrt(((X - ix) / (.68 * irx)) ** 2 + ((Z - pz) / (.68 * irz)) ** 2)
    C = mix(C, rgb('pupil'), 1 - smooth(.95, 1.05, R))
    # two catchlights, on the same screen side on both eyes (as on the sheet): a big upper-right one, a smaller dimmer one to its left
    hx = ix + .30 * irx; hz = pz + .30 * irz
    big = np.sqrt(((X - hx) / (.21 * irx)) ** 2 + ((Z - hz) / (.19 * irz)) ** 2)
    small = np.sqrt(((X - (ix - .26 * irx)) / (.11 * irx)) ** 2 + ((Z - (pz + .28 * irz)) / (.10 * irz)) ** 2)
    C = mix(C, rgb('#FFFBF4'), np.maximum(1 - smooth(.94, 1.06, big), .62 * (1 - smooth(.90, 1.10, small))))
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
def paw_print(x, y, cx, cy, sc, ang=0.):
    """1 inside a paw print (a big heart-ish pad and four toes), coords in chart units"""
    ca, sa = math.cos(ang), math.sin(ang); dx = (x - cx) / sc; dy = (y - cy) / sc
    u = dx * ca + dy * sa; v = -dx * sa + dy * ca
    pad = np.sqrt((u / .40) ** 2 + ((v + .18) / (.30 + .06 * np.clip(-v - .18, 0, 1))) ** 2)
    m = 1 - smooth(.92, 1.06, pad)
    for tx, ty, tr in ((-.42, .22, .15), (-.15, .44, .16), (.15, .44, .16), (.42, .22, .15)):
        m = np.maximum(m, 1 - smooth(.90, 1.08, np.sqrt(((u - tx) / tr) ** 2 + ((v - ty) / (tr * 1.18)) ** 2)))
    return m
def paint_bead(U, V):
    x = (U - .5) * 2; y = (V - .5) * 2; r = np.sqrt(x * x + y * y)
    C = mix(rgb('silverdark'), rgb('silverlight'), smooth(-.6, .9, y * .7 - x * .3))
    C = mix(C, rgb('plumdark'), 1 - smooth(.58, .66, r))
    C = mix(C, rgb('silver'), .95 * paw_print(x, y, 0, -.02, .44))
    return C
PAINTERS = {'head': paint_head, 'eye.L': lambda U, V: paint_eye(U, V, 1), 'eye.R': lambda U, V: paint_eye(U, V, -1), 'ramp': paint_ramp,
            'bead': paint_bead}
PAINTERS.update(globals().get('BODY_PAINTERS', {}))
if RIG:
    PAINTERS['cavity'] = lambda U, V: mix(rgb('#3a1418'), rgb('#2a0e12'), .5 * smooth(.3, 1, V))
    PAINTERS['tongue'] = lambda U, V: mix(rgb('#e07a86'), rgb('#ec96a0'), .5 * smooth(.2, .9, V))
atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [44, 42, 48, 255]
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
def write_png(path, arr):
    hh, ww = arr.shape[:2]
    raw = b''.join(b'\x00' + r.tobytes() for r in arr[::-1])
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', ww, hh, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
atlas_path = os.path.join(ROOT, 'scratch', 'head_atlas.png') if HEAD_ONLY else (os.path.join(ROOT, 'scratch', 'rig_base_atlas.png') if RIG else os.path.join(ROOT, 'shihtzu-toy_atlas.png'))
write_png(atlas_path, atlas)
del atlas
img = bpy.data.images.load(atlas_path); img.name = 'Shihtzu_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Shihtzu_toy_atlas'); MAT.use_nodes = True
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
for zw in (.0, .05, .10, .15, .20, .262, .32, .40, .50, .60, .70, .80, .90):
    xs_ = np.linspace(0, .7, 351)
    ys_ = front_local(xs_, np.full(len(xs_), zw), head_local); ok = np.isfinite(ys_)
    cheek_rows['%.3f' % zw] = round(float(2 * xs_[ok].max()), 3) if ok.any() else None
# sheet targets (measured on refs/sheet.png with measure/ruled.py and measure/probe.py; see the report)
SHEET = {'scale': 'front view crown y 100, ground 466: 366 px = 1.20 m (305 px/m); head close-up crown 554, chin 711',
         'W_px_closeup': 154, 'H_px_closeup': 157, 'W_px_body': 159, 'H_px_body': 164, 'W_over_H': .98,
         'head_H_over_total': .448, 'heads_tall': 2.23, 'topknot_above_crown_frac_total': .11,
         'eye_centre_x_W': .271, 'eye_centre_z_above_chin_W': .461, 'eye_opening_W': [.282, .244],
         'iris_width_frac_opening': .70, 'pupil_frac_iris': .68, 'iris_bottom_z_W': .354,
         'nose_width_W': .144, 'nose_top_z_W': .448, 'nose_centre_z_W': .412,
         'mouth_arch_top_z_W': .279, 'beard_width_W': .32, 'blush_centre_W': [.39, .27],
         'ear_locks_span_W': 1.89, 'ear_lock_bottom_z_W': .01, 'nose_tip_ahead_of_eye_front_W': .21,
         'moustache_ahead_of_nose_tip_W': .05, 'lock_back_behind_nose_tip_W': 1.36}
MEAS = {'units': 'W = %.3f m (the face width between the ear locks at the cheeks); z = above the chin in W; profile b = behind the nose tip in W' % W,
        'face_rule': FACE_RULE, 'sheet': SHEET,
        'chin_z_m': CHIN, 'crown_m': LOG['crown_m'], 'head_height_W': round((LOG['crown_m'] - CHIN) / W, 3),
        'head_H_over_total': round((LOG['crown_m'] - CHIN) / LOG['crown_m'], 3),
        'face_width_rows_W(z: skin width, locks excluded)': cheek_rows,
        'nose_tip_y_m': round(float(nose_tip_y), 4),
        'profile_b(z)': {'%.3f' % zw: prof_at(zw) for zw in (.02, .06, .10, .15, .20, .25, .30, .352, .40, .45, .50, .55, .60, .66, .72, .78, .85, .91, .97)},
        'eye_white_front_edge_b': round(float((rimL[:, 1].min() - nose_tip_y) / W), 3),
        'eye_opening_W': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'eye_centre_W': [EXW, EZW], 'iris_bottom_z_W': round(EZW - .85 * EHHW, 3), 'nose_z_W': NZW,
        'nose_top_z_W': round(NOSE[0][2] + NOSE[1][2], 3), 'nose_width_W': round(2 * NOSE[1][0], 3),
        'mouth_arch_top_z_W': MA_TOP, 'beard_width_W': round(2 * BRD[1][0], 3)}
for tag in ('L', 'R'):
    if 'ear.' + tag in parts:
        ev = all_verts(parts['ear.' + tag])
        MEAS['ear_locks_' + tag] = {'x_min_W': round(float(ev[:, 0].min() / W), 3), 'x_max_W': round(float(ev[:, 0].max() / W), 3),
                                    'b_min': round(float((ev[:, 1].min() - nose_tip_y) / W), 3), 'b_max': round(float((ev[:, 1].max() - nose_tip_y) / W), 3),
                                    'z_min_W': round(float((ev[:, 2].min() - CHIN) / W), 3), 'z_max_W': round(float((ev[:, 2].max() - CHIN) / W), 3)}
if 'ear.L' in parts and 'ear.R' in parts:
    MEAS['ear_locks_span_W'] = round(float((all_verts(parts['ear.L'])[:, 0].max() - all_verts(parts['ear.R'])[:, 0].min()) / W), 3)
MEAS.update(LOG)
MEAS.update(globals().get('BODY_MEAS', {}))

# ============================================================== JOIN, CLEAN, NORMALS
objects = []; part_tri = {}
PIVOTS = {'head': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'],
          'ear.L': tuple(ear_info['L']['base']), 'ear.R': tuple(ear_info['R']['base']), 'topknot': tuple(TK_C)}
PIVOTS.update(globals().get('BODY_PIVOTS', {}))
OBJ_TRIS = {}
for group, obs in parts.items():
    for ob in obs: ob.data.calc_loop_triangles(); OBJ_TRIS[ob.name] = len(ob.data.loop_triangles)
print('OBJ_TRIS', json.dumps(dict(sorted(OBJ_TRIS.items(), key=lambda kv: -kv[1])[:60])), flush=True)
OBJ_NAMES = {'tome': 'tome'}
for group, obs in parts.items():
    for ob in obs:
        ob.data.materials.clear(); ob.data.materials.append(MAT)
        if RIG:
            vg = ob.vertex_groups.new(name='_part_' + ob.name); vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs: ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1: bpy.ops.object.join()
    ob = bpy.context.object; ob.name = OBJ_NAMES.get(group, 'Shihtzu_' + group.replace('.', '_')); ob.data.name = ob.name
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
HEADSET = sum(v for k, v in part_tri.items() if k in ('Shihtzu_head', 'Shihtzu_eye_L', 'Shihtzu_eye_R', 'Shihtzu_ear_L', 'Shihtzu_ear_R', 'Shihtzu_topknot'))
MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count; MEAS['head_face_eyes_locks_topknot_triangles'] = HEADSET
if RIG:
    pass
elif not HEAD_ONLY:
    if not os.environ.get('SHIHTZU_NO_BUDGET'): assert tri_count <= 30000, ('Triangle budget', tri_count)
    POST_JOIN = globals().get('POST_JOIN')
    if POST_JOIN: POST_JOIN()
    with open(os.path.join(ROOT, 'measurements.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-head.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
if not RIG: print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not HEAD_ONLY and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'shihtzu-toy.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG:
    bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                              export_animations=False)
print('SHIHTZU_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)


# ============================================================== THE FLAIL (separate prop: public/models/shihtzu-flail.glb)
# Prop space (metres): the grip at the origin, the handle along +Z (Blender; game +Y), the braided rope continuing up
# (straightened) to the squeaky spiky ball. flail_handle -> flail_link_0 .. flail_link_5 -> flail_head, each object's
# origin at its joint, parented in a chain so the game can swing it.
if not HEAD_ONLY and not RIG:
    print('STEP flail', flush=True)
    FL_CH = {'bone': (0, 0, 256, 256), 'ramp': (256, 0, 256, 256)}
    FL_RAMPS = {'bone': ('#D8C8A8', '#F2E8D6', '#FFF8EC'), 'rope': ('#2E182E', '#5A2E58', '#7C4A78'),
                'ball': ('#121014', '#26232A', '#4A4552'), 'nub': ('#18161B', '#302C36', '#5A5462')}
    FL_ROWS = {k: i for i, k in enumerate(FL_RAMPS)}
    def fl_au(u, v):
        x, y, w, h = FL_CH['bone']; g = 4
        return np.stack([(x + g + np.asarray(u) * (w - 2 * g)) / 512, (y + g + np.asarray(v) * (h - 2 * g)) / 512], -1)
    def fl_ramp(name, val):
        x, y, w, h = FL_CH['ramp']; val = clamp(np.asarray(val, float))
        return np.stack([(x + 6 + val * (w - 12)) / 512, np.full(val.shape, (y + FL_ROWS[name] * 32 + 16) / 512)], -1)
    flail_objs = {}
    def fl_obj(name, V, F, UV, N, mat_ids=None):
        ob = make_obj(name, V, F, UV, '_flail_' + name, N=N); flail_objs.setdefault(name, []).append(ob); return ob
    # ---- the chew-bone handle: a shaft with two knobs at each end, a brown paw mark on the front
    HL = .090; HR = .026; KR = .034; KO = .025
    def bone_sdf(p):
        d = sd_capsule(p, np.array([0, 0, -HL]), np.array([0, 0, HL]), HR)
        for zz in (-HL - .012, HL + .012):
            for sx in (-1, 1): d = smin(d, np.linalg.norm(p - np.array([sx * KO, 0, zz]), axis=1) - KR, .016)
        return d
    zs = np.concatenate([[-.118, -.114], np.linspace(-.108, .108, 21), [.114, .118]])
    zs = np.clip(zs, -.118, .118)
    cen = np.stack([np.zeros(len(zs)), np.zeros(len(zs)), zs], -1)
    def bone_uv(NN, V):
        a = np.arctan2(V[:, 0], -V[:, 1]); return fl_au(.5 + a / (2 * PI), .5 + V[:, 2] / .32)
    name_hint[0] = 'flail_handle'
    ring_stack('flail_handle', bone_sdf, cen, np.tile([0, 0, 1.], (len(zs), 1)), '_flail_flail_handle', bone_uv, sides=16, tmax=.12, ref=[0, -1., 0])
    flail_objs['flail_handle'] = parts.pop('_flail_flail_handle')
    # ---- the braided plum rope: six chunky links of three twisted strands
    NLINK = 6; LINK_L = .095; ROPE_Z0 = HL + .030
    LINK_JOINTS = [ROPE_Z0 + i * LINK_L for i in range(NLINK + 1)]
    for i in range(NLINK):
        z0, z1 = LINK_JOINTS[i], LINK_JOINTS[i + 1]
        obs = []
        for k in range(3):
            t = np.linspace(0, 1, 11); ph = 2 * PI * (t * 1.0 + k / 3) + i * 2 * PI
            P = np.stack([.0105 * np.cos(ph), .0105 * np.sin(ph), z0 - .006 + (z1 - z0 + .012) * t], -1)
            nm = 'flail_link_%d.s%d' % (i, k)
            sweep(nm, P, lambda j: (.0125, .0125), '_flail_link_%d' % i, lambda NV, tt, uu, V: fl_ramp('rope', sval(NV, hi=.34)), sides=6,
                  normals=unit(np.stack([np.cos(ph), np.sin(ph), np.zeros(len(t))], -1)))
        flail_objs['flail_link_%d' % i] = parts.pop('_flail_link_%d' % i)
    # ---- the squeaky spiky ball: black, soft rounded nubs, teal glowing paw marks
    BALL_R = .110; BALL_C = np.array([0, 0, LINK_JOINTS[-1] + BALL_R - .010])
    nth, nph = 12, 20
    th = np.linspace(0, PI, nth + 1)[1:-1]; ph = np.linspace(0, 2 * PI, nph, endpoint=False)
    TT, PPh = np.meshgrid(th, ph, indexing='ij')
    Dd = np.stack([np.sin(TT) * np.cos(PPh), np.sin(TT) * np.sin(PPh), np.cos(TT)], -1)
    Vg_ = BALL_C + Dd * BALL_R
    V, Fq, _, NN = closed_grid(Vg_, Dd, np.zeros(Dd.shape[:2] + (2,)), (BALL_C + np.array([0, 0, BALL_R]), np.array([0, 0, 1.]), [0, 0]),
                              (BALL_C - np.array([0, 0, BALL_R]), np.array([0, 0, -1.]), [0, 0]))
    make_obj('flail_ball', V, Fq, fl_ramp('ball', sval(NN, hi=.36)), '_flail_head', N=NN)
    ii = np.arange(14) + .5; phi_ = np.arccos(1 - 2 * ii / 14); thf = PI * (1 + 5 ** .5) * ii
    NUBS = np.stack([np.sin(phi_) * np.cos(thf), np.sin(phi_) * np.sin(thf), np.cos(phi_)], -1)
    NUBS = NUBS[NUBS[:, 2] < .80]                     # leave the rope's attachment clear
    for k, nd in enumerate(NUBS):
        ob_ = lobe('flail_nub.%d' % k, BALL_C + nd * (BALL_R + .008), np.array([.024, .030, .030]), nd, '_flail_head', ramp='hole', n=2, occ_in=.05, sheen=1.2)
        me_ = ob_.data; cn_ = np.zeros(len(me_.vertices) * 3, np.float32); me_.attributes['cust_n'].data.foreach_get('vector', cn_); cn_ = cn_.reshape(-1, 3)
        lv_ = np.zeros(len(me_.loops), np.int64); me_.loops.foreach_get('vertex_index', lv_)
        me_.uv_layers['Atlas'].data.foreach_set('uv', fl_ramp('nub', sval(cn_, hi=.40))[lv_].astype(np.float32).ravel())
    # paw marks between the nubs (glow material)
    PAW_DIRS = [unit(np.array(v)) for v in ((0, -1., .05), (0, 1., .05), (1., 0, -.15), (-1., 0, -.15))]
    glow_objs = []
    for k, pd_ in enumerate(PAW_DIRS):
        upv = unit(np.array([0, 0, 1.]) - pd_ * pd_[2]); rt = np.cross(upv, pd_)
        def on_ball(off): return BALL_C + unit(pd_ * BALL_R + off) * (BALL_R + .0015)
        pad = on_ball(-upv * .010)
        lobe('flail_glow_pad.%d' % k, pad, np.array([.0045, .028, .023]), unit(pad - BALL_C), '_flail_glow', ramp='teal', n=2, occ_in=0, pole=rt)
        for j, (tx_, ty_) in enumerate(((-.030, .017), (-.011, .033), (.011, .033), (.030, .017))):
            tq = on_ball(rt * tx_ + upv * ty_)
            lobe('flail_glow_toe.%d.%d' % (k, j), tq, np.array([.004, .010, .012]), unit(tq - BALL_C), '_flail_glow', ramp='teal', n=1, occ_in=0, pole=upv)
    flail_objs['flail_head'] = parts.pop('_flail_head'); glow_list = parts.pop('_flail_glow')
    # ---- the flail's own small texture (bone chart with the paw mark + shading ramps) and the glow material
    fl = np.zeros((512, 512, 4), np.uint8); fl[..., 3] = 255
    U, Vv = np.meshgrid(np.linspace(0, 1, 256), np.linspace(0, 1, 256))
    zb_ = (Vv - .5) * .32; ab_ = (U - .5) * 2 * PI
    Cb = mix(rgb('#F2E8D6'), rgb('#FFF8EC'), .5 * smooth(-.4, .9, np.cos(ab_ + .6)))
    Cb = mix(Cb, rgb('#D8C8A8'), .35 * smooth(.2, -.9, np.cos(ab_ + .6)))
    pm = paw_print(ab_ * HR, zb_, 0, 0, .030)
    Cb = mix(Cb, rgb('#A0704C'), .92 * pm)
    fl[0:256, 0:256, :3] = np.round(clamp(Cb) * 255).astype(np.uint8)
    for name, k in FL_ROWS.items():
        lo, base, hi = [rgb(c) for c in FL_RAMPS[name]]; u = np.linspace(0, 1, 256)
        row = np.where((u < .5)[:, None], mix(lo, base, smooth(0, .5, u)), mix(base, hi, smooth(.5, 1, u)))
        fl[k * 32:(k + 1) * 32, 256:512, :3] = np.round(clamp(row) * 255).astype(np.uint8)[None]
    fl_path = os.path.join(ROOT, 'shihtzu-flail_tex.png'); write_png(fl_path, fl)
    fimg = bpy.data.images.load(fl_path); fimg.name = 'Shihtzu_flail_tex_512'; fimg.pack()
    FMAT = bpy.data.materials.new('Shihtzu_flail'); FMAT.use_nodes = True
    b_ = FMAT.node_tree.nodes.get('Principled BSDF'); b_.inputs['Roughness'].default_value = .75; b_.inputs['Specular IOR Level'].default_value = .25
    ft = FMAT.node_tree.nodes.new('ShaderNodeTexImage'); ft.image = fimg; FMAT.node_tree.links.new(ft.outputs['Color'], b_.inputs['Base Color'])
    GMAT = bpy.data.materials.new('Shihtzu_flail_glow'); GMAT.use_nodes = True
    g_ = GMAT.node_tree.nodes.get('Principled BSDF'); g_.inputs['Base Color'].default_value = (.10, .75, .55, 1)
    g_.inputs['Emission Color'].default_value = (.10, .75, .55, 1); g_.inputs['Emission Strength'].default_value = 3.0; g_.inputs['Roughness'].default_value = .5
    # ---- join, normals, pivots, the parent chain
    def finalize(obs, name, pivot, mats):
        bpy.ops.object.select_all(action='DESELECT')
        for ob in obs: ob.select_set(True)
        bpy.context.view_layer.objects.active = obs[0]
        if len(obs) > 1: bpy.ops.object.join()
        ob = bpy.context.object; ob.name = name; ob.data.name = name
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        me = ob.data; me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
        if me.attributes.get('cust_n') is not None:
            a = me.attributes.get('cust_n')
            sn = np.zeros(len(me.vertices) * 3, np.float32); a.data.foreach_get('vector', sn); sn = sn.reshape(-1, 3)
            cn = np.zeros(len(me.loops) * 3, np.float32); me.corner_normals.foreach_get('vector', cn); cn = cn.reshape(-1, 3)
            lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
            use = np.linalg.norm(sn[lv], axis=1) > .5; cn[use] = sn[lv][use]
            me.normals_split_custom_set([tuple(v) for v in cn]); me.attributes.remove(me.attributes['cust_n'])
        bpy.context.scene.cursor.location = pivot; bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        return ob
    for o in glow_list:
        o.data.materials.clear(); o.data.materials.append(GMAT)
    for nm, obs in flail_objs.items():
        for o in obs:
            o.data.materials.clear(); o.data.materials.append(FMAT)
    head_obs = flail_objs['flail_head'] + glow_list
    fobj = {'flail_handle': finalize(flail_objs['flail_handle'], 'flail_handle', (0, 0, 0), None)}
    for i in range(NLINK): fobj['flail_link_%d' % i] = finalize(flail_objs['flail_link_%d' % i], 'flail_link_%d' % i, (0, 0, LINK_JOINTS[i]), None)
    fobj['flail_head'] = finalize(head_obs, 'flail_head', (0, 0, LINK_JOINTS[-1]), None)
    chain = ['flail_handle'] + ['flail_link_%d' % i for i in range(NLINK)] + ['flail_head']
    for a_, b_n in zip(chain[:-1], chain[1:]):
        child = fobj[b_n]; mw = child.matrix_world.copy(); child.parent = fobj[a_]; child.matrix_world = mw
    ftris = 0
    for o in fobj.values(): o.data.calc_loop_triangles(); ftris += len(o.data.loop_triangles)
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.select_all(action='DESELECT')
    for o in fobj.values(): o.select_set(True)
    bpy.context.view_layer.objects.active = fobj['flail_handle']
    bpy.ops.export_scene.gltf(filepath=FLAIL_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False, export_animations=False)
    def g(v): return [round(float(v[0]), 4), round(float(v[2]), 4), round(float(-v[1]), 4)]
    palm_R = np.array(JOINTS_BODY['palm_R']); armR = ARM['R']
    grip_axis = unit(np.array([0, -1., 0]) - np.array(armR['arm_dir']) * (np.array(armR['arm_dir']) @ np.array([0, -1., 0])))
    mount = {'units': 'metres; blender = Z-up, front -Y; game = Y-up, front +Z: game (x, y, z) = blender (x, z, -y)',
             'prop': '/models/shihtzu-flail.glb', 'prop_pivot': {'object': 'flail_handle', 'blender': [0, 0, 0], 'note': 'the grip centre on the bone shaft'},
             'prop_axis': {'blender': [0, 0, 1], 'game': [0, 1, 0], 'note': 'handle -> rope -> ball, straightened'},
             'grip_hand': 'R', 'hero_palm_R': {'blender': [round(float(v), 4) for v in palm_R], 'game': g(palm_R)},
             'hero_hand_R_wrist': {'blender': [round(float(v), 4) for v in armR['wrist']], 'game': g(np.array(armR['wrist']))},
             'hero_grip_axis_R': {'blender': [round(float(v), 4) for v in grip_axis], 'game': g(grip_axis),
                                  'note': 'the direction the handle passes through the closed right mitten (across the fingers, forward); put prop +Z along it'},
             'arm_dir_R': {'blender': [round(float(v), 4) for v in armR['arm_dir']], 'game': g(np.array(armR['arm_dir']))},
             'chain': [{'object': n, 'pivot_blender': [0, 0, round(float(z), 4)], 'parent': p} for n, z, p in
                       zip(chain, [0.] + LINK_JOINTS, [None] + chain[:-1])],
             'head_centre_blender': [round(float(v), 4) for v in BALL_C], 'ball_diameter_m': round(2 * BALL_R, 3),
             'ball_with_nubs_m': round(2 * (BALL_R + .008 + .024), 3), 'rope_length_m': round(NLINK * LINK_L, 3),
             'handle_length_m': round(2 * (HL + .012 + KR), 3), 'straightened_reach_m': round(float(BALL_C[2] + BALL_R + HL + .012 + KR), 3),
             'glow_material': 'Shihtzu_flail_glow', 'triangles': ftris}
    with open(os.path.join(ROOT, 'prop_mount.json'), 'w', encoding='utf-8') as f: json.dump(mount, f, indent=2)
    print('FLAIL_DONE', json.dumps({'triangles': ftris, 'reach': mount['straightened_reach_m']}), flush=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'shihtzu-toy.blend'))
