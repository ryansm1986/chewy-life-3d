"""Golden Dragoon (male Golden Retriever dragoon, "Emberleaf Dragon Guard"), Toybox line, phase-1 model.
Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_golden-toy.py [-- --head-only]

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/golden-toy.glb, golden-lance.glb and golden-javelin.glb (--head-only writes scratch/ instead).

Technique (the Poe / Moka toy-line machinery):
- The head is ONE smooth implicit ball: a rounded superellipse skull, full cheeks, a medium bun muzzle, a lower jaw and
  a rounded nose button, with a set-in socket warp for each eye. The skin is the field's zero surface reached by radial
  projection (CDT in a stereographic domain, with edge loops round the eyelids, nose and the open smile), so every vertex
  carries its analytic normal. Adaptive refinement adds points where the game's hard toon band would zigzag.
- The open smile is a hole in the skin ringed by loops, its edge rolled in as a soft lip, continuing into a closed mouth
  sac (the cavity) with a separate tongue lobe. The eyes are separate lens globes following the ball.
- Ears are thick swept drapes (pillow sections, rounded rims, sculpted lock grooves and a scalloped feathered hem).
- The helmet is an offset shell of the skull (the cap and neck guard) with a brass brow band, chunky brass horns, a
  dorsal crest of brass fins and a little emerald dragon on the crown.
- Armour pieces are parametric shells with painted scale charts; fur limbs, ruff and tail are SDF ring stacks / star
  meshes of merged clay lobes with field normals.
- One 2048 painted atlas: face, eyes, helmet, chest, pauldron, tasset and tabard charts painted from 3D positions,
  a 2-D fur <-> light-fur shading chart, and 1-D shading ramps for everything else.
"""
import bpy, bmesh, math, json, os, sys, struct, zlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt
from mathutils.kdtree import KDTree

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HEAD_ONLY = '--head-only' in ARGV
RIG = bool(globals().get('RIG_MODE'))
MODELS = 'D:/projects/chewy-life-3d/public/models'
MODEL = MODELS + '/golden-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'golden-head-test.glb') if HEAD_ONLY else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(11)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
# Sheet (front turnaround: ground y 422, helmet dome top y 77 -> 1.225 m, 281.6 px/m; head close-up W 154 px):
# head W 0.400 m at the cheeks, chin 0.833 m, skull crown 1.200 m (chewy-b.glb's crown), helmet dome ~1.225 m.
# Round 2: the cast's proportions (about 2.4 heads beside Chewy): W 0.600 m, the skull crown kept at 1.200 m, so the chin
# drops to 0.672 m and the body below it is shortened (BZS). The face keeps the sheet's fractions of W.
W = .600; CHIN = .672; HY = .000
WS = W / .400                              # metric details authored at W 0.40 scale by WS
LOG = {}

PAL = {'fur': '#C47A3A', 'furlight': '#DE9A56', 'furdark': '#9A5828',
       'lfur': '#E0A868', 'lfurlight': '#F2C68E', 'lfurdark': '#BE8650',
       'emer': '#3A9A6A', 'emerlight': '#45A676', 'emerdark': '#2A7A54',
       'brass': '#C8A050', 'brasslight': '#D6AE5E', 'brassdark': '#A07A30',
       'cream': '#F4E8D0', 'creamlight': '#FFF6EA', 'creamdark': '#D8C6A4',
       'leather': '#7A4A2E', 'leatherlight': '#9A6642', 'leatherdark': '#56321E',
       'eye': '#603B27', 'nose': '#4A2A1C', 'nosehi': '#9A6A52',
       'sclera': '#FFF6EA', 'pupil': '#1E120C', 'lash': '#2A1A14',
       'blush': '#E88A70', 'mouth': '#D97A68', 'cavity': '#4A1A1E', 'lip': '#5A2620',
       'tongue': '#E0807A', 'brow': '#9A5426', 'ball': '#D6C85C', 'dark': '#2A2230', 'emerdeep': '#2A7A55'}
CHARTS = {'head': (0, 896, 1152, 1152), 'eye.L': (1152, 1728, 320, 320), 'eye.R': (1472, 1728, 320, 320),
          'furmix': (1792, 1792, 256, 256), 'ramp': (1152, 1216, 896, 512), 'cavity': (1280, 384, 128, 128),
          'chest': (0, 0, 1024, 512), 'helm': (0, 512, 1024, 384), 'pauldron': (1024, 0, 384, 384),
          'tasset': (1408, 0, 512, 384), 'tabard': (1024, 384, 256, 512), 'spare': (1408, 384, 640, 832)}
if RIG:   # phase-2 charts in the unused atlas space (the approved paint is untouched)
    CHARTS.update({'lidU': (1408, 384, 512, 224), 'lidD': (1408, 608, 512, 128)})
PAINT_OPTS = {'lash': True, 'blush': True}     # the rig paints its lids with the lash band off (the approved paint uses the defaults)
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'lfur': ('lfurdark', 'lfur', 'lfurlight'),
         'emer': ('emerdark', 'emer', 'emerlight'), 'brass': ('brassdark', 'brass', 'brasslight'),
         'cream': ('creamdark', 'cream', 'creamlight'), 'leather': ('leatherdark', 'leather', 'leatherlight'),
         'tongue': ('#C05E5E', 'tongue', '#F4A69E'), 'cavity': ('#2E1014', 'cavity', '#6A2A2C'),
         'eyedark': ('#1E120C', '#3A2418', '#6A4A38'), 'nose': ('#2E1A12', 'nose', '#7A5240'),
         'rope': ('#C8A878', '#E8D2A8', '#FBEFD6'), 'tan': ('#A87A48', '#C89A62', '#E2BC86'),
         'ball': ('#A89A38', 'ball', '#EEE490'), 'white': ('#D8D2C4', '#F4EEE2', '#FFF8EE'),
         'emerdeep': ('#1C5A3E', '#2A7A55', '#3A9068'), 'ruff': ('#C8925A', '#EBC99A', '#FBE6C4')}
RAMP_ROWS = {k: i for i, k in enumerate(RAMPS)}
assert len(RAMPS) <= 16

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
def fur_uv(shade, light):
    """the 2-D fur chart: u = painted shade (0.5 = base), v = 0 red-gold fur .. 1 light fur"""
    x, y, w, h = CHARTS['furmix']; s_ = clamp(np.asarray(shade, float)); l_ = clamp(np.asarray(light, float)) * np.ones_like(s_)
    return np.stack([(x + 8 + s_ * (w - 16)) / 2048, (y + 8 + l_ * (h - 16)) / 2048], -1)
LIGHT = unit(np.array([-.22, -.35, 1.]))
def sval(n, occ=0., hi=.30, lo=.24):
    """painted soft shading value for the ramps: 0.5 = base colour, lighter toward the key light, darker below"""
    d = np.asarray(n) @ LIGHT
    return clamp(.50 + hi * smooth(.0, .95, d) - lo * smooth(.05, .95, -d) - occ)
def ramp_colour(name, u):
    lo, base, hi = [rgb(c) for c in RAMPS[name]]; u = clamp(u)
    return np.where((np.asarray(u) < .5)[..., None], mix(lo, base, smooth(0, .5, u)), mix(base, hi, smooth(.5, 1, u)))

# ============================================================== mesh plumbing (after the Poe build)
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

def thicken(V, F, N, t, UVo, UVi, UVrim, rim=4, plain=None, No=None, Ni=None):
    """an open surface (outer normals N) -> a closed shell: outer, inner, rounded rim along every boundary.
    No / Ni (optional) override the shading normals of the outer / inner sheets (e.g. measured on relief)."""
    V = np.asarray(V, float); N = unit(np.asarray(N, float)); n = len(V)
    f0 = F[len(F) // 2]; fn = np.cross(V[f0[1]] - V[f0[0]], V[f0[2]] - V[f0[0]])
    if fn @ N[f0[0]] < 0: F = [tuple(f[::-1]) for f in F]
    t = np.broadcast_to(np.asarray(t, float), (n,)).copy()
    Vo = V + N * (t[:, None] / 2); Vi = V - N * (t[:, None] / 2)
    VV = [Vo, Vi]; NN = [N if No is None else unit(No), -N if Ni is None else unit(Ni)]
    UU = [np.broadcast_to(np.asarray(UVo, float), (n, 2)), np.broadcast_to(np.asarray(UVi, float), (n, 2))]
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

def lobe(name, c, r, out, group, ramp='fur', n=5, squash=.10, occ_in=.30, sheen=1.0, base_occ=0., pole=None, uvfn=None):
    """closed clay lobe: cube-sphere on a squashed ellipsoid, analytic normals, ramp shading. r = radii (out, e3, pole)"""
    c = np.asarray(c, float); out = unit(np.asarray(out, float)); r = np.asarray(r, float)
    if pole is None: pole = unit(np.cross(out, [0, 0, 1.]) if abs(out[2]) < .9 else np.cross(out, [1., 0, 0]))
    else: pole = unit(np.asarray(pole, float) - out * (np.asarray(pole, float) @ out))
    e3 = np.cross(pole, out)
    t = np.tan(np.linspace(-PI / 4, PI / 4, n + 1))
    V = []; NV = []; VAL = []; F = []; key = {}; DL = []
    def vid(p):
        k = tuple(np.round(p, 6))
        if k not in key:
            dl = unit(p); kk = 1 - squash * max(0., -dl[0]) ** 2
            P = c + out * dl[0] * r[0] * kk + e3 * dl[1] * r[1] + pole * dl[2] * r[2]
            nn = unit(out * dl[0] / r[0] + e3 * dl[1] / r[1] + pole * dl[2] / r[2])
            key[k] = len(V); V.append(P); NV.append(nn); DL.append(dl)
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
    UV = uvfn(np.array(NV), np.array(V), np.array(DL)) if uvfn else ramp_uv(ramp, np.array(VAL))
    return make_obj(name, np.array(V), F, UV, group, N=np.array(NV))

def vnormals(V, F):
    V = np.asarray(V, float); N = np.zeros_like(V)
    for f in F:
        f = list(f)
        for i in range(1, len(f) - 1):
            a, b, c = f[0], f[i], f[i + 1]; n = np.cross(V[b] - V[a], V[c] - V[a]); N[a] += n; N[b] += n; N[c] += n
    return unit(N)
def tuft(name, root, tipdir, L, R, group, light0=0., light1=.5, n=3, flat=.62, curl=None, curl_k=.18, side_ref=(0, 0, 1.), occ=0.):
    """a soft feathered fur tuft: a cube-sphere stretched along tipdir from root, tapering to a soft rounded point, curling"""
    ax = unit(np.asarray(tipdir, float)); e1 = np.cross(ax, np.asarray(side_ref, float))
    e1 = unit(e1 if np.linalg.norm(e1) > 1e-6 else np.cross(ax, [1., 0, 0])); e2 = np.cross(ax, e1)
    cv = np.asarray(curl, float) if curl is not None else e2; cv = unit(cv - ax * (cv @ ax))
    t = np.tan(np.linspace(-PI / 4, PI / 4, n + 1)); V = []; F = []; key = {}; A = []
    def vid(p):
        k = tuple(np.round(p, 6))
        if k not in key:
            dl = unit(p); s_ = (dl[0] + 1) / 2
            taper = (1 - .42 * s_ ** 2.2) * (1 - .15 * (1 - s_) ** 6)
            P = root + ax * (L * s_) + e1 * (dl[1] * R * taper) + e2 * (dl[2] * R * flat * taper) + cv * (curl_k * L * s_ * s_)
            key[k] = len(V); V.append(P); A.append(s_)
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
    V = np.array(V); A = np.array(A); N = vnormals(V, F)
    if (N * (V - V.mean(0))).sum() < 0: N = -N
    UV = fur_uv(sval(N, hi=.30, occ=occ + .10 * smooth(.35, 0., A)), light0 + (light1 - light0) * smooth(.30, 1., A))
    return make_obj(name, V, F, UV, group, N=N)
def fur_cuff(name, centre, axis, r_ring, n_tuft, group, thick=.022, droop=.030, light=.30, sides=5):
    """a fluffy fur cuff: a closed ring round a limb whose section swells into n_tuft soft tufts drooping toward axis"""
    axis = unit(np.asarray(axis, float)); centre = np.asarray(centre, float)
    e1 = np.cross(axis, [0, 0, 1.]) if abs(axis[2]) < .9 else np.cross(axis, [1., 0, 0]); e1 = unit(e1); e2 = np.cross(axis, e1)
    R = n_tuft * 3; ang = np.linspace(0, 2 * PI, R, endpoint=False)
    path = centre + r_ring * (np.cos(ang)[:, None] * e1 + np.sin(ang)[:, None] * e2); nrm = unit(path - centre)
    T0 = unit(path[1] - path[-1]); sgn = 1. if np.cross(T0, nrm[0]) @ axis > 0 else -1.
    bump = (.5 + .5 * np.cos(n_tuft * ang)) ** 1.5
    pa = np.linspace(0, 2 * PI, sides, endpoint=False)
    def prof(k):
        a_ = thick * (.70 + .55 * bump[k]); b_ = thick * (.85 + .35 * bump[k])
        db = b_ * np.sin(pa) + sgn * droop * bump[k] * np.clip(np.sin(pa) * sgn, 0, 1)
        return np.stack([a_ * np.cos(pa), db], -1)
    def uvf(NN, tt, uu, V):
        dz = ((V - centre) @ axis) / max(droop + thick, 1e-6)
        return fur_uv(sval(NN, hi=.30), clamp(.10 + light * smooth(.0, 1., dz)))
    return ring_tube(name, path, prof, group, uvf, nrm, sides=sides)

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
    """a CLOSED loop tube (no caps): path (R,3) closed, prof(k) -> list of (dn, db) profile points round the section"""
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
def ray_first(sdf, c, D, tmax, steps=120, it=30):
    """the first exit of the surface marching outward from c (for shapes that are not star-shaped from their centres)"""
    n = len(D); ts = np.linspace(0, tmax, steps)
    lo = np.zeros(n); hi = np.full(n, tmax); found = np.zeros(n, bool)
    for k in range(1, steps):
        v = sdf(c + D * ts[k]); new = (~found) & (v > 0); lo[new] = ts[k - 1]; hi[new] = ts[k]; found |= new
        if found.all(): break
    assert found.all(), ('ray without exit', name_hint[0])
    for _ in range(it):
        m = .5 * (lo + hi); ins = sdf(c + D * m[:, None]) < 0; lo = np.where(ins, m, lo); hi = np.where(ins, hi, m)
    return c + D * (.5 * (lo + hi))[:, None]
def grad(f, p, e=1.5e-4):
    g = np.zeros_like(p)
    for k in range(3):
        dp = np.zeros(3); dp[k] = e; g[:, k] = f(p + dp) - f(p - dp)
    return unit(g)
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
def sd_capsule(p, a, b, r):
    a = np.asarray(a, float); b = np.asarray(b, float); pa = p - a; ba = b - a
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1); return np.linalg.norm(pa - h[:, None] * ba, axis=1) - (r if np.ndim(r) == 0 else r[0] + (r[1] - r[0]) * h)
def ell(q, c, r):
    q = (q - np.asarray(c)) / np.asarray(r)
    k0 = np.sqrt((q * q).sum(-1)); k1 = np.sqrt(((q / np.asarray(r)) ** 2).sum(-1))
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)
def sd_ell(p, c, axes, radii):
    q = (p - np.asarray(c)) @ np.asarray(axes).T; return ell(q, [0, 0, 0], radii)
def sd_box(p, c, axes, h, rr):
    q = np.abs((p - np.asarray(c)) @ np.asarray(axes).T) - (np.asarray(h) - rr)
    return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(np.max(q, axis=1), 0) - rr
def ring_stack(name, sdf, centres, axisdirs, group, uvfn, sides=16, tmax=.2, pole_end=True, pole_start=True, ref=None, first=False):
    """rings of outermost roots round each centre, in the plane normal to axisdirs; poles close the ends"""
    C = np.asarray(centres, float); Ax = unit(np.asarray(axisdirs, float)); R = len(C)
    a = np.linspace(0, 2 * PI, sides, endpoint=False); rings = []
    for k in range(R):
        r0 = np.asarray(ref if ref is not None else [0, -1., 0], float); e1 = unit(r0 - Ax[k] * (r0 @ Ax[k])); e2 = np.cross(Ax[k], e1)
        D = np.cos(a)[:, None] * e1 + np.sin(a)[:, None] * e2
        name_hint[0] = name; rings.append((ray_first if first else ray_outer)(sdf, C[k], D, tmax, steps=90, it=26))
    rings = np.array(rings); Nr = grad(sdf, rings.reshape(-1, 3)).reshape(rings.shape)
    p0 = None; p1 = None
    if pole_start:
        q = (ray_first if first else ray_outer)(sdf, C[0], -Ax[0][None], tmax); p0 = (q[0], grad(sdf, q)[0], [0, 0])
    if pole_end:
        q = (ray_first if first else ray_outer)(sdf, C[-1], Ax[-1][None], tmax); p1 = (q[0], grad(sdf, q)[0], [0, 0])
    V, Fq, _, NN = closed_grid(rings, Nr, np.zeros(rings.shape[:2] + (2,)), p0, p1)
    return make_obj(name, V, Fq, uvfn(NN, V), group, N=NN)
def smin(a, b, k):
    h = np.clip(.5 + .5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)
def smax(a, b, k): return -smin(-a, -b, k)
def crease(a, b, k): return clamp((np.minimum(a, b) - smin(a, b, k)) / k)
def rot(axis, ang):
    axis = unit(np.asarray(axis, float)); K = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    return np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * (K @ K)
def in_poly(P, poly):
    x = P[:, 0]; y = P[:, 1]; inside = np.zeros(len(P), bool); n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        inside ^= ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-30) + x1)
    return inside

# ============================================================== the head ball (W units, z above the chin, y from HY)
# Skull: a rounded superellipse front silhouette (exponent 2.15), an ellipse in depth; the face outline is close to a
# circle of radius 0.5 W centred 0.40 W above the chin (measured on the sheet's head close-up).
SK = dict(a=.485, zc=.420, cu=.460, cd=.430, n=2.15, n_top=2.0, bf=.460, bb=.480, taper=.06)
def skull(q):
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    zr = z - SK['zc']; c = np.where(zr > 0, SK['cu'], SK['cd'])
    a = SK['a'] * (1 - SK['taper'] * smooth(.62, .92, z)); n = SK['n'] + (SK['n_top'] - SK['n']) * smooth(.55, .85, z)
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
    ys = np.linspace(-1.05, .30, 340)
    P = np.stack([np.repeat(x[:, None], len(ys), 1), np.broadcast_to(ys, (n, len(ys))), np.repeat(z[:, None], len(ys), 1)], -1).reshape(-1, 3)
    ins = (f(P) < 0).reshape(n, len(ys)); i = np.argmax(ins, 1); ok = ins[np.arange(n), i]
    lo = ys[np.maximum(i - 1, 0)]; hi = ys[i]
    for _ in range(26):
        m = (lo + hi) / 2; inn = f(np.stack([x, m, z], -1)) < 0
        hi = np.where(inn, m, hi); lo = np.where(inn, lo, m)
    return np.where(ok, (lo + hi) / 2, np.nan)

JOWL = ([.250, -.130, .270], [.245, .300, .215]); K_JOWL = .070     # full cheeks: the widest point (0.5 W) at the mouth line
# the medium toy muzzle: a wide lower bun (the lips and cheeks of the smile) and a narrow bridge carrying the nose, so nothing
# swells under the inner eye corners (round 2: the face follows the sheet and the eyes sit lower)
MUZ = [[0, -.452, .330], [.262, .262, .152]]; K_MUZ = .070
MUZB = [[0, -.468, .425], [.138, .240, .122]]; K_MUZB = .055
def muz_sdf(q): return smin(ell(q, *MUZ), ell(q, *MUZB), K_MUZB)
PADS = ([.098, -.585, .330], [.122, .100, .080]); K_PAD = .040        # the two upper-lip pads (the 'w' over the smile)
def pad_sdf(q):
    qa = np.array(q, float, copy=True); qa[..., 0] = np.abs(qa[..., 0]); return ell(qa, *PADS)
JAW = [[0, -.300, .118], [.285, .245, .125]]; K_JAW = .060           # the lower jaw and lip under the open smile
NECK = [[0, .040, -.150], [.195, .200, .170]]; K_NECK = .070
def jowl_sdf(q):
    qa = np.array(q, float, copy=True); qa[..., 0] = np.abs(qa[..., 0]); return ell(qa, *JOWL)
def base_local(q):
    d = skull(q)
    d = smin(d, jowl_sdf(q), K_JOWL)
    d = smin(d, muz_sdf(q), K_MUZ); d = smin(d, pad_sdf(q), K_PAD); d = smin(d, ell(q, *JAW), K_JAW)
    return d

# eye layout (W units): sheet centres +-0.262 W at 0.543 W above the chin; raised 0.03 W so the iris bottom meets the
# (lowered) nose top, as the brief asks. Opening 0.228 W x 0.264 W, an upright oval.
EXW, EZW, EHWW, EHHW, EN = .262, .543, .114, .132, 2.05
RECESS = dict(delta=.020, tilt=-.06, F_out=.13, F_nas=.075, F_up=.070, F_dn=.060)
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
def warped(q):
    qw = np.array(q, float, copy=True); qw[..., 1] = q[..., 1] - RECESS['delta'] * eye_recess(q); return qw
# nose: a rounded dark button, 0.232 W wide, 0.145 W tall, top at the iris bottom (0.441 W), wider at the top
NZW = .415; NHW, NHH, NHD = .100, .081, .062
_yf = float(front_local(0, NZW, lambda q: base_local(warped(q)))[0])
NOSE_C = np.array([0, _yf + NHD - .046, NZW])
def nose_sdf(q):
    qq = np.array(q, float, copy=True) - NOSE_C
    widen = 1 + .16 * np.clip(qq[..., 2] / NHH, -1, 1)
    qq[..., 0] = qq[..., 0] / widen
    return ell(qq, [0, 0, 0], [NHW, NHD, NHH])
K_N = .014
def head_local(q, neck=True):
    d = base_local(warped(q))
    if neck: d = smin(d, ell(q, *NECK), K_NECK)
    return smin(d, nose_sdf(q), K_N)
NOSE_TIP_L = float(front_local(0, NZW, head_local)[0])
def L2M(q): return np.stack([q[..., 0] * W, HY + q[..., 1] * W, CHIN + q[..., 2] * W], -1)
def M2L(p): return np.stack([p[..., 0] / W, (p[..., 1] - HY) / W, (p[..., 2] - CHIN) / W], -1)
def head_sdf(p): return head_local(M2L(p)) * W
def skull_sdf(p): return base_local(M2L(p)) * W
def front_hit(x, z, f=head_sdf):
    return HY + W * front_local(np.asarray(x) / W, (np.asarray(z) - CHIN) / W, lambda q: f(L2M(q)) / W)
O = np.array([0, HY, CHIN + .40 * W])
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

_g = np.stack(np.meshgrid(np.zeros(1), np.linspace(-.5, .5, 101), np.linspace(.75, 1.0, 251), indexing='ij'), -1).reshape(-1, 3)
CROWN_M = float(CHIN + W * _g[head_local(_g) < 0][:, 2].max())
LOG['crown_m'] = round(CROWN_M, 4)

# ---- the helmet coverage: the lower edge height (W above the chin) by azimuth psi (0 = front, 90 = the side, 180 = back)
# (measured on the head close-up: the V at 0.833 W, 0.877 W beside it, 0.79 W at x 0.30 W, 0.70 W at x 0.41 W; the neck guard
#  sits between the ears at the back, down to 0.27 W)
HELM_PSI = np.array([0, 6, 12, 18, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180.])
HELM_Z = np.array([.833, .858, .877, .872, .845, .795, .750, .705, .655, .628, .612, .545, .410, .310, .270])
def helm_edge(psi_deg): return np.interp(np.abs(psi_deg), HELM_PSI, HELM_Z)
def psi_of(p_local):
    return np.degrees(np.arctan2(p_local[..., 0], -p_local[..., 1]))
def under_helm(P, margin=0.):
    """True where a model-space point is covered by the helmet (above its lower edge by margin, W units)"""
    q = M2L(P); return q[..., 2] > helm_edge(psi_of(q)) + margin

# ============================================================== face layout (front projection, metres)
EX = EXW * W; EZ = CHIN + EZW * W; EHW = EHWW * W; EHH = EHHW * W
def eye_unit(psi):
    c = np.cos(psi); s = np.sin(psi); return spow(c, 2 / EN), spow(s, 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
EYEF = {}; EYE_LAMBDA = .5
for _s in (-1, 1):
    _Sc = np.array([_s * EX, float(front_hit(_s * EX, EZ)[0]), EZ]); _ax0 = grad_n(_Sc[None])[0]
    _ax = unit(_ax0 * (1 - EYE_LAMBDA) + np.array([0, -1., 0]) * EYE_LAMBDA)        # the layout plane faces halfway between the eye axis and the front
    _ex = unit(np.array([-_ax[1], _ax[0], 0.])); _eo = _s * _ex; _ev = unit(np.cross(_ax, _eo) * _s)
    if _ev[2] < 0: _ev = -_ev
    _ch = math.cos(math.atan2(abs(_ax[0]), -_ax[1])); _cv = math.cos(math.asin(np.clip(_ax[2], -1, 1)))
    EYEF[_s] = dict(Sc=_Sc, ax=_ax, eo=_eo, ev=_ev, hw=EHW / (_ch ** .85) * 1.086, hh=EHH / _cv * 1.028, ax0=_ax0)
def eye_pts(side, psi, k=1.0):
    """skin points of the opening's superellipse (scale k) laid out in the eye plane, hit along the eye axis"""
    F_ = EYEF[side]; ux, uz = eye_unit(np.atleast_1d(psi))
    Q = F_['Sc'] + np.outer(F_['hw'] * k * ux, F_['eo']) + np.outer(F_['hh'] * k * uz, F_['ev'])
    ts = np.linspace(.25 * W, -.30 * W, 160); n = len(Q)
    P = Q[:, None, :] + F_['ax'][None, None, :] * ts[None, :, None]
    ins = (head_sdf(P.reshape(-1, 3)) < 0).reshape(n, len(ts)); i = np.argmax(ins, 1)
    lo = ts[np.maximum(i - 1, 0)]; hi = ts[i]
    for _ in range(26):
        m = (lo + hi) / 2; inn = head_sdf(Q + F_['ax'][None] * m[:, None]) < 0
        hi = np.where(inn, m, hi); lo = np.where(inn, lo, m)
    return Q + F_['ax'][None] * ((lo + hi) / 2)[:, None]
def eye_s3(side, P):
    """(superellipse radius, angle, X outward, Z up) of skin points in the eye plane"""
    F_ = EYEF[side]; d = np.asarray(P) - F_['Sc']
    X = (d @ F_['eo']) / F_['hw']; Z = (d @ F_['ev']) / F_['hh']
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
NZ = CHIN + NZW * W
# the open smile (W units): corners at +-0.265 W, 0.30 W; upper lip edge 0.255 W at the centre; lower edge 0.055 W
MHW_ = .280; MZC = .190
def mouth_top(t): return .279 + .031 * np.abs(t) ** 1.8
def mouth_bot(t): return .310 - .245 * np.sqrt(np.maximum(0, 1 - np.abs(t) ** 2.2))
def mouth_outline(n=72):
    k = 40; t = np.linspace(-1, 1, k)
    top = np.stack([t * MHW_, mouth_top(t)], -1)                     # left corner -> right corner along the upper lip
    bot = np.stack([t[::-1] * MHW_, mouth_bot(t[::-1])], -1)[1:-1]   # back along the lower lip
    L = np.concatenate([top, bot])
    for _ in range(3): L = .25 * np.roll(L, 1, 0) + .5 * L + .25 * np.roll(L, -1, 0)    # round the corners a little
    seg = np.linalg.norm(np.roll(L, -1, 0) - L, axis=1); s_ = np.concatenate([[0], np.cumsum(seg)])
    tt = np.linspace(0, s_[-1], n, endpoint=False)
    Lc = np.concatenate([L, L[:1]])
    return np.stack([np.interp(tt, s_, Lc[:, 0]), np.interp(tt, s_, Lc[:, 1])], -1)
MOUTH_W = mouth_outline()                                            # (x, z) in W units
def loop_normals_2d(L):
    d = np.roll(L, -1, 0) - np.roll(L, 1, 0); n = np.stack([d[:, 1], -d[:, 0]], -1); n = unit(n)
    c = L.mean(0)
    if ((L - c) * n).sum() < 0: n = -n
    return n
MOUTH_N = loop_normals_2d(MOUTH_W)
BLUSH = (.370 * W, CHIN + .390 * W, .100 * W, .062 * W)

# ============================================================== HEAD SKIN: CDT on the ball, eyelid / nose / mouth loops
pts = []; cons = []; tags = {}
def add_loop(P, tag, closed=True):
    i0 = len(pts); pts.extend([tuple(p) for p in P]); n = len(P)
    for i in range(n if closed else n - 1): cons.append((i0 + i, i0 + (i + 1) % n))
    tags[tag] = list(range(i0, i0 + n)); return tags[tag]
def surf_dir(x, z):
    y = front_hit(x, z); return unit(np.stack([np.asarray(x, float) * np.ones_like(y), y, np.asarray(z, float) * np.ones_like(y)], -1) - O)

print('STEP skin', flush=True)
NE = 56
EYE_SCALES = [1.0, 1.06, 1.13, 1.21, 1.30]
eye_dom = {}
for s in (-1, 1):
    psi = np.linspace(0, 2 * PI, NE, endpoint=False)
    base = to_dom(unit(eye_pts(s, psi) - O)); c = to_dom(surf_dir(np.array([s * EX]), np.array([EZ])))[0]
    eye_dom[s] = (c, base)
    wn = (1 - .72 * smooth(-.10, -.80, np.cos(psi))) * (1 - .45 * smooth(-.20, -.90, np.sin(psi)))
    for k, kk in enumerate(EYE_SCALES): add_loop(c + (base - c) * (1 + (kk - 1) * wn[:, None]), 'eye%d_%d' % (s, k))
pts.append(tuple(to_dom(surf_dir(np.array([0.]), np.array([NZ])))[0])); tags['nose_c'] = [len(pts) - 1]
for k, (rx, rz, n) in enumerate([(.036, .025, 12), (.066, .045, 18), (.094, .065, 26), (.112, .078, 30), (.126, .089, 34)]):
    a = np.linspace(0, 2 * PI, n, endpoint=False) + .3 * k
    widen = 1 + .16 * np.clip(np.sin(a) * rz / NHH, -1, 1)
    add_loop(to_dom(surf_dir(rx * W * np.cos(a) * widen, NZ + .002 * W + rz * W * np.sin(a))), 'nose_%d' % k)
# the mouth hole (mouth_0) and three loops round it; the top centre stays tight under the nose
MOUTH_OFF = [0., .010, .022, .040]
for k, d_ in enumerate(MOUTH_OFF):
    top_c = (MOUTH_W[:, 1] > MZC) * np.exp(-(MOUTH_W[:, 0] / .15) ** 2)
    L = MOUTH_W + MOUTH_N * (d_ * (1 - .62 * top_c))[:, None]
    add_loop(to_dom(surf_dir(L[:, 0] * W, CHIN + L[:, 1] * W)), 'mouth_%d' % k)
NB = 64; AB = math.radians(122)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
def fib(nf, amax):
    ii = np.arange(nf) + .5; phi = np.arccos(1 - 2 * ii / nf); th = PI * (1 + 5 ** .5) * ii
    D = np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
    return D[np.arccos(np.clip(-D[:, 1], -1, 1)) < amax]
D = fib(760, math.radians(118.5)); Pf = radial_hit(D)
D2 = fib(2700, math.radians(78)); P2 = radial_hit(D2)
def fine_zone(P):
    q = M2L(P)
    return ((np.abs(q[:, 0]) < .52) & (q[:, 2] > -.02) & (q[:, 2] < .80)) & (P[:, 1] < HY - .10 * W) & ~under_helm(P, .03)
D = np.concatenate([D[~fine_zone(Pf)], D2[fine_zone(P2)]]); Pf = np.concatenate([Pf[~fine_zone(Pf)], P2[fine_zone(P2)]])
# under the helmet the skin is hidden: thin the fill there (the cap is deleted after the CDT)
deep = under_helm(Pf, .10)
keepd = ~deep | (np.arange(len(D)) % 3 == 0)
D = D[keepd]; Pf = Pf[keepd]
# the chin and under-jaw: rays from the head centre graze them, so they get a regular grid sampled from the front
gx, gz = np.meshgrid(np.linspace(-.30, .30, 25) * W, CHIN + np.linspace(-.14, .06, 12) * W)
gx = gx.ravel(); gz = gz.ravel(); gy = front_hit(gx, gz); okg = np.isfinite(gy)
G = np.stack([gx, gy, gz], -1)[okg]; Dg = unit(G - O)
zone = (np.abs(Pf[:, 0]) < .31 * W) & (Pf[:, 2] < CHIN + .065 * W) & (Pf[:, 1] < HY - .02)
D = np.concatenate([D[~zone], Dg]); Pf = np.concatenate([Pf[~zone], radial_hit_outer(Dg)]); keep = np.ones(len(D), bool)
dom = to_dom(D)
for s in (-1, 1):
    outer = np.array([pts[i] for i in tags['eye%d_%d' % (s, len(EYE_SCALES) - 1)]])
    c, base = eye_dom[s]
    keep &= ~in_poly(c + (dom - c) / 1.06, outer)
front = Pf[:, 1] < HY
keep &= ~(front & ((Pf[:, 0] / (.136 * W)) ** 2 + ((Pf[:, 2] - NZ - .002 * W) / (.100 * W)) ** 2 < 1))
mouth_outer_dom = np.array([pts[i] for i in tags['mouth_%d' % (len(MOUTH_OFF) - 1)]])
mc = mouth_outer_dom.mean(0)
keep &= ~in_poly(mc + (dom - mc) / 1.08, mouth_outer_dom)
pts.extend([tuple(p) for p in dom[keep]])
fill0 = len(pts) - int(keep.sum())
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
    hole |= in_poly(cent, dom_out[[out_of[k] for k in tags['mouth_0']]])
    return dom_out, F[~hole], out_of

# ---- adaptive refinement for the game's hard toon band (as Poe / Moka)
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
    vis = (Pt[:, :, 1] < HY + .01).all(1) & (Pt[:, :, 2] > CHIN - .12 * W).all(1) & seen & ~under_helm(Pt.mean(1), .02)
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
REFINE_ADD = int(os.environ.get('REFINE_ADD', '580')); D_LOW, D_T = .12, .45
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
        verts.append(tuple(P - .0045 * WS * n + .0016 * WS * t)); vdir.append(vdir[vi]); vnorm.append(unit(.30 * n + t)); rr.append(i0 + k)
    nr_ = len(rim)
    for k in range(nr_): faces.append((rim[k], rim[(k + 1) % nr_], rr[(k + 1) % nr_], rr[k]))
    roll_info[s] = (rim, rr)
# ---- the open smile: the hole edge rolls in as a soft lip, then a closed mouth sac (the cavity) behind it
mrim = [out_of[k] for k in tags['mouth_0']]; NMR = len(mrim)
MP = np.array([verts[i] for i in mrim]); MN = np.array([vnorm[i] for i in mrim])
MC = np.array([0, float(MP[:, 1].mean()) + .030 * W, CHIN + MZC * W])          # the mouth's inner centre
ROLLD = .0055 * WS
mroll = []; i0 = len(verts)
for k, vi in enumerate(mrim):
    P = MP[k]; n = MN[k]; t = MC - P; t = t - n * (t @ n); t /= np.linalg.norm(t)
    verts.append(tuple(P - ROLLD * n + .0022 * WS * t)); vdir.append(vdir[vi]); vnorm.append(unit(.25 * n + t)); mroll.append(i0 + k)
for k in range(NMR): faces.append((mrim[k], mrim[(k + 1) % NMR], mroll[(k + 1) % NMR], mroll[k]))
R0 = np.array([verts[i] for i in mroll])
BACK = np.array([0, 1., 0])
SAC = [(1.04, .030), (1.00, .075), (.86, .125), (.62, .170), (.32, .200)]      # (scale toward the centre, depth back in W)
sac_rings = []; prev = mroll; sac_faces = []
SAC_V0 = len(verts)
for k, (sc, dp) in enumerate(SAC):
    ring = MC + (R0 - MC) * np.array([sc, 1., sc]) + BACK * dp * W
    ring[:, 1] = MC[1] + (R0[:, 1] - MC[1]) * (1 - .6 * k / len(SAC)) + dp * W
    i0 = len(verts); cur = list(range(i0, i0 + NMR))
    nn = unit((np.array([MC[0], ring[:, 1].mean(), MC[2]]) - ring) * np.array([1, .35, 1]) - BACK * .4)
    verts += [tuple(v) for v in ring]; vdir += [unit(v - O) for v in ring]; vnorm += list(nn)
    for i in range(NMR): sac_faces.append(len(faces)); faces.append((prev[i], prev[(i + 1) % NMR], cur[(i + 1) % NMR], cur[i]))
    sac_rings.append(ring); prev = cur
mpole = len(verts); pp = MC + BACK * (.215 * W) + np.array([0, (R0[:, 1].mean() - MC[1]) * .3, 0])
verts.append(tuple(pp)); vdir.append(unit(pp - O)); vnorm.append(-BACK)
for i in range(NMR): sac_faces.append(len(faces)); faces.append((prev[i], prev[(i + 1) % NMR], mpole))
sacv = np.array(verts[SAC_V0:])
LOG['mouth_sac_inside_margin_mm'] = round(float(-head_sdf(sacv).max() * 1000), 2)

vdir = np.array(vdir); vnorm = np.array(vnorm); verts_np = np.array(verts)
# delete the skin under the helmet (hidden), keeping a margin under its rim
fc = np.array([verts_np[list(f)].mean(0) for f in faces])
hidden = np.array([all(under_helm(verts_np[list(f)], .040)) for f in faces])
hidden[sac_faces] = False
LOG['skin_faces_under_helmet_deleted'] = int(hidden.sum())
faces = [f for f, h in zip(faces, hidden) if not h]
sac_set = set()
huv = au('head', *head_uv(unit(vdir)).T)
sac_first = SAC_V0
UVF = []
def cav_uv(vi):
    if vi < SAC_V0:   # the rolled lip ring
        k = mroll.index(vi) if vi in mroll else 0; ring_k = 0
    else:
        k = (vi - SAC_V0) % NMR if vi != mpole else 0; ring_k = (vi - SAC_V0) // NMR + 1 if vi != mpole else len(SAC) + 1
    P = verts_np[vi]
    return au('cavity', clamp(.5 + (P[0] - MC[0]) / (.62 * W)), clamp(ring_k / (len(SAC) + 1.)))
for f in faces:
    if pole in f:
        o = [v for v in f if v != pole]; dm = unit(vdir[o].mean(0)[None])[0]; dm[1] = 0; dm = unit(dm[None])[0]
        pu = au('head', *head_uv(np.array([[dm[0] * 1e-3, 1., dm[2] * 1e-3]]) / np.linalg.norm([dm[0] * 1e-3, 1., dm[2] * 1e-3])).T)[0]
        UVF.append(tuple(pu if v == pole else huv[v] for v in f))
    elif all((v >= SAC_V0) or (v in mroll) for v in f) and any(v >= SAC_V0 for v in f):
        UVF.append(tuple(cav_uv(v) for v in f))
    else: UVF.append(tuple(huv[v] for v in f))
skin = make_obj('ball_head_skin', verts_np, faces, UVF, 'head', N=vnorm)
LOG['skin_vertices'] = len(verts); LOG['skin_faces'] = len(faces)

print('STEP eyes', flush=True)
# ============================================================== EYES: flush lens globes following the ball
ES = [0, .16, .32, .48, .62, .74, .84, .92, .97, 1.10]
NSEG = 26
eye_centers = {}
def eye_h(k): return (.0024 - .0060 * k * k) * WS
for s, tag in ((-1, 'R'), (1, 'L')):
    psi = np.linspace(0, 2 * PI, NSEG, endpoint=False); rows = []
    cx = s * EX; Sc = EYEF[s]['Sc']; axis = EYEF[s]['ax0']
    for k in ES:
        S = Sc[None] if k == 0 else eye_pts(s, psi, k)
        n = grad_n(S); rows.append(S + n * eye_h(k))
    rim = rows[-1]
    for depth, sc in [(.012, .86), (.024, .58)]: rows.append(Sc + (rim - Sc) * sc - axis * depth * WS)
    tip = Sc - axis * .032 * WS
    ux_, uz_ = eye_unit(psi)
    def euv(kx, kz): return (.5 + s * kx / 2.4, .5 + kz / 2.4)       # the eye plane's own coordinates (X right on screen)
    V = [rows[0][0]]; UVs = [euv(0., 0.)]
    for j, r in enumerate(rows[1:]):
        kk = ES[min(j + 1, len(ES) - 1)]
        for i in range(NSEG): V.append(r[i]); UVs.append(euv(kk * ux_[i], kk * uz_[i]))
    V.append(tip); UVs.append(UVs[-1])
    nr = len(rows) - 1; ix = lambda j, i: 1 + j * NSEG + i % NSEG
    fs = [(0, ix(0, i), ix(0, i + 1)) for i in range(NSEG)]
    for j in range(nr - 1):
        for i in range(NSEG): fs.append((ix(j, i), ix(j + 1, i), ix(j + 1, i + 1), ix(j, i + 1)))
    last = len(V) - 1
    for i in range(NSEG): fs.append((ix(nr - 1, i), last, ix(nr - 1, i + 1)))
    UVa = np.array(UVs); make_obj('eyeball.' + tag, np.array(V), fs, au('eye.' + tag, UVa[:, 0], UVa[:, 1]), 'eye.' + tag)
    eye_centers[tag] = [float(v) for v in (Sc - axis * .016 * WS)]
    LOG['eye_axis_' + tag] = {'out_deg': round(math.degrees(math.atan2(s * axis[0], -axis[1])), 1),
                              'down_deg': round(math.degrees(math.asin(-axis[2])), 1)}

print('STEP tongue', flush=True)
# ============================================================== TONGUE: a soft pink lobe resting on the lower lip
_ylip = float(front_hit(0, CHIN + .070 * W)[0])
TONGUE_C = np.array([0, _ylip + .078 * W, CHIN + .138 * W])
def tongue_sdf(p):
    q = (p - TONGUE_C) @ rot([1, 0, 0], math.radians(14)).T            # tip tilted down over the lip
    d = ell(q, [0, 0, 0], [.175 * W, .180 * W, .056 * W])
    d = smin(d, ell(q, [0, -.135 * W, -.010 * W], [.140 * W, .072 * W, .050 * W]), .02 * W)   # the rounded tip
    g = np.exp(-(q[:, 0] / (.020 * W)) ** 2) * smooth(-.03 * W, .05 * W, q[:, 2]) * smooth(.12 * W, -.10 * W, q[:, 1])
    return d + .012 * W * g                                               # the soft centre groove
def tongue_uv(NN, V):
    q = (V - TONGUE_C) @ rot([1, 0, 0], math.radians(14)).T
    groove = np.exp(-(q[:, 0] / (.022 * W)) ** 2) * smooth(-.02 * W, .05 * W, q[:, 2])
    return ramp_uv('tongue', sval(NN, hi=.32, occ=.14 * groove + .10 * smooth(.04 * W, .12 * W, q[:, 1])))
star_mesh('tongue', tongue_sdf, TONGUE_C, 'tongue', tongue_uv, nth=9, nph=18, tmax=.20 * W, axis=(0, 0, 1.), ref=(0, -1., 0))
LOG['tongue_tip_y_m'] = round(float(TONGUE_C[1] - .2 * W), 4)

print('STEP ears', flush=True)
# ============================================================== EARS: long feathered drapes (thick pillow sections)
# u runs across (-1 = the front edge, +1 = the back edge), v from the root (buried under the helmet) to the scalloped hem.
# The ear is a thick crescent draped over the side of the head: at each height its cross-section wraps the skull round the
# vertical axis from phi_front (toward the face) to phi_back (behind the head); both edges lie near the skull and the
# middle bulges out. (phi = 0 points straight out to the side; negative toward the front.) W units, the left ear.
EAR_V = np.array([0, .15, .35, .60, .85, 1.0])
EAR_Z = np.array([.700, .600, .440, .235, .045, -.095])
EAR_R0 = np.array([.340, .400, .470, .500, .485, .455])
EAR_BULGE = np.array([.020, .040, .120, .290, .335, .310])
EAR_PF = np.array([-2., -9., -14., -16., -14., -10.])
EAR_PB = np.array([38., 50., 56., 58., 56., 52.])
EAR_AX = np.array([0, .050])                     # the vertical axis the ear wraps (x, y)
NLOCK = 5
def ear_dip(u):
    """1 in the grooves between the feather locks, 0 at their centres and at the ear's outer edges"""
    u = np.asarray(u, float); w = (u + 1) / 2 * NLOCK; f = w - np.floor(w)
    return (1 - np.sin(PI * f) ** .9) * smooth(.97, .80, np.abs(u))
def ear_wave(u, v):
    """the locks wave as they hang: the across-parameter is shifted along the length"""
    return np.clip(u + .09 * np.sin(2 * PI * (1.4 * v + .1)) * smooth(.25, .6, v), -1, 1)
def ear_mid(u, v, side):
    sp = lambda A: natspline(EAR_V, A)(v)
    z = sp(EAR_Z); r0 = sp(EAR_R0); bl = sp(EAR_BULGE); pf = np.radians(sp(EAR_PF)); pb = np.radians(sp(EAR_PB))
    ph = (pf + pb) / 2 + u * (pb - pf) / 2
    r = r0 + bl * (1 - u * u) ** .65
    r = r - .072 * ear_dip(ear_wave(u, v)) * smooth(.24, .70, v)          # sculpted wavy grooves between the locks
    r = r + .012 * smooth(.6, 1., v) * np.cos(PI * u)
    P = np.stack([EAR_AX[0] + r * np.cos(ph), EAR_AX[1] + r * np.sin(ph), z - .025 * u * smooth(.4, 1., v)], -1)
    P[..., 0] *= side
    return P
ear_info = {}; EAR_GRID = {}
for side, tag in ((1, 'L'), (-1, 'R')):
    nv, nu = 21, 19
    uu = np.linspace(-1, 1, nu)
    # the scalloped hem: each lock ends in a rounded lobe; the front lock a little shorter (hand-made asymmetry)
    w = (uu + 1) / 2 * NLOCK; f = w - np.floor(np.minimum(w, NLOCK - 1e-6))
    vend = 1 - .13 * (1 - np.sqrt(np.clip(1 - (2 * f - 1) ** 2, 0, 1))) - .050 * smooth(-.4, -.95, uu) - .02 * np.cos(3.3 * uu) ** 2
    VV = np.linspace(0, 1, nv)[:, None] * vend[None, :]
    UU = np.broadcast_to(uu, (nv, nu)).copy()
    G = ear_mid(UU, VV, side)
    # outer normals from the grid
    dV = np.gradient(G, axis=0); dU = np.gradient(G, axis=1)
    NG = unit(np.cross(dV, dU) * side)
    cen = L2M(np.array([[0, 0, .40]]))[0]
    Gm = L2M(G.reshape(-1, 3)).reshape(G.shape)
    if (NG * unit(Gm - cen)).sum() < 0: NG = -NG
    thk = (.120 + .095 * np.sqrt(np.clip(1 - UU ** 2, 0, 1)) * (1 - .15 * VV))      # round, thick sections (about 1.5x round 1)
    thk = thk * (1 - .14 * ear_dip(ear_wave(UU, VV)) * smooth(.35, .9, VV))
    Vm = Gm.reshape(-1, 3); Nm = NG.reshape(-1, 3); tm = (thk * W).reshape(-1)
    plain = np.zeros(len(Vm), bool); plain[:nu] = True                       # the root edge is buried under the helmet
    # paint (the 2-D fur chart): the feather locks lighten toward their tips; grooves and the head-facing side are darker
    Vt, Ft, UVt, Nt = thicken(Vm, grid_faces(nv, nu), Nm, tm, np.zeros((len(Vm), 2)), np.zeros((len(Vm), 2)), np.zeros((len(Vm), 2)), rim=4, plain=plain)
    # under the helmet the root is pressed flat against the skull, so it stays inside the shell (hidden)
    qv = M2L(Vt); wcov = smooth(-.035, .005, qv[:, 2] - helm_edge(psi_of(qv)))
    dsk = skull_sdf(Vt); excess = np.maximum(0, dsk - .040 * W) * wcov
    Vt = Vt - grad(skull_sdf, Vt) * excess[:, None]
    nb = len(Vm)
    vparam = np.concatenate([VV.reshape(-1), VV.reshape(-1)]); uparam = np.concatenate([UU.reshape(-1), UU.reshape(-1)])
    # rim vertices: copy the parameters of their boundary vertex (thicken appends them after the two sheets)
    extra = len(Vt) - 2 * nb
    if extra:
        # recover each rim vertex's source by nearest vertex of the mid-surface
        kd = KDTree(nb)
        for i_, p_ in enumerate(Vm): kd.insert(p_, i_)
        kd.balance()
        src = np.array([kd.find(Vt[2 * nb + i])[1] for i in range(extra)])
        vparam = np.concatenate([vparam, VV.reshape(-1)[src]]); uparam = np.concatenate([uparam, UU.reshape(-1)[src]])
    vrel = vparam / np.maximum(np.interp(uparam, uu, vend), 1e-6)
    inward = unit(cen - Vt); facing_in = smooth(.15, .75, (Nt * inward).sum(1))
    dipv = ear_dip(ear_wave(uparam, vparam)) * smooth(.30, .85, vparam)
    shade = sval(Nt, hi=.30, occ=.20 * facing_in + .30 * dipv + .14 * smooth(.30, .05, vparam))
    light = clamp(.62 * smooth(.62, .98, vrel) * (1 - .55 * dipv) + .22 * (1 - ear_dip(uparam)) * smooth(.4, .9, vrel) - .25 * facing_in)
    UVt = fur_uv(shade, light)
    make_obj('feathered_ear.' + tag, Vt, Ft, UVt, 'ear.' + tag, N=Nt)
    EAR_GRID[tag] = (Gm.reshape(-1, 3), VV.reshape(-1).copy())
    ear_info[tag] = {'base': Gm[2, nu // 2].tolist(), 'fold': Gm[int(nv * .40), nu // 2].tolist(), 'tip': Gm[-1, nu // 2].tolist()}
    # how far the ear pokes out of the skull where the helmet covers it (must stay under the helmet's outer surface)
    q = M2L(Vt); cov = q[:, 2] > helm_edge(psi_of(q)) + .01
    LOG['ear_%s_max_out_of_skull_under_helmet_W' % tag] = round(float((skull_sdf(Vt[cov]) / W).max()) if cov.any() else 0., 4)

print('STEP helmet', flush=True)
# ============================================================== HELMET: the emerald cap and neck guard, brass brow band
OH = np.array([0, HY, CHIN + .42 * W])
NJ, NK = 36, 8
psi_c = np.linspace(-180, 180, NJ, endpoint=False) + 180. / NJ
def hdir(th, ps):
    th = np.asarray(th, float); ps = np.radians(np.asarray(ps, float))
    return np.stack([np.sin(th) * np.sin(ps), -np.sin(th) * np.cos(ps), np.cos(th)], -1)
def skull_hit_dir(D):
    return radial_hit_outer(D, f=skull_sdf, o=OH, t0=.05 * W, t1=1.1 * W, steps=90)
# the polar angle of the lower edge for each azimuth (bisection on the hit height)
lo = np.full(NJ, .2); hi = np.full(NJ, 2.8); zt = CHIN + helm_edge(psi_c) * W
for _ in range(28):
    m = (lo + hi) / 2; P = skull_hit_dir(hdir(m, psi_c)); above = P[:, 2] > zt
    lo = np.where(above, m, lo); hi = np.where(above, hi, m)
TH_E = (lo + hi) / 2
HT = .044                                  # the shell thickness (W units); the gap over the skull grows toward the crown
def HG_s(s_): return .012 + .060 * (1 - np.asarray(s_, float)) ** 2
rows = []; norms = []; svals = []
kk = np.linspace(0, 1, NK + 1)[1:]
for k in kk:
    th = TH_E * (k ** .95); D = hdir(th, psi_c); P = skull_hit_dir(D); N = grad(skull_sdf, P)
    rows.append(P + N * (HG_s(k) + HT / 2) * W); norms.append(N); svals.append(np.full(NJ, k))
rows = np.array(rows); norms = np.array(norms)
ptop = skull_hit_dir(np.array([[0, 0, 1.]])); ntop = grad(skull_sdf, ptop)
Vh = np.concatenate([rows.reshape(-1, 3), ptop + ntop * (HG_s(0.) + HT / 2) * W]); Nh = np.concatenate([norms.reshape(-1, 3), ntop])
Fh_ = grid_faces(NK, NJ, wrap=True)
ip = len(Vh) - 1
for j in range(NJ): Fh_.append((j, (j + 1) % NJ, ip)[::-1])
S_param = np.concatenate([np.array(svals).reshape(-1), [0.]]); PSI_param = np.concatenate([np.tile(psi_c, NK), [0.]])
def helm_uvs(Sp, Pp):
    return au('helm', clamp((Pp + 180) / 360), clamp(Sp))
# thicker at the rim: the brow band reads as a rolled brass edge
th_h = np.full(len(Vh), HT * W) * (1 + .10 * smooth(.85, 1., S_param))
UVh = helm_uvs(S_param, PSI_param)
Vt, Ft, UVt, Nt = thicken(Vh, Fh_, Nh, th_h, UVh, UVh, UVh, rim=4)
make_obj('emerald_helmet', Vt, Ft, UVt, 'helm', N=Nt)
HELM_TOP = float(Vt[:, 2].max()); LOG['helmet_top_m'] = round(HELM_TOP, 4)
def helm_point(psi_deg, s_):
    """a point on the helmet's outer surface and its normal (psi in degrees, s = 0 top .. 1 the lower edge)"""
    th = np.interp(psi_deg, np.concatenate([psi_c - 360, psi_c, psi_c + 360]), np.tile(TH_E, 3)) * s_ ** .95
    D = hdir(np.array([th]), np.array([psi_deg])); P = skull_hit_dir(D); N = grad(skull_sdf, P)
    return (P + N * (HG_s(s_) + HT) * W)[0], N[0]
def paint_helm(U, V):
    psi = U * 360 - 180; s_ = V
    th = np.interp(psi, np.concatenate([psi_c - 360, psi_c, psi_c + 360]), np.tile(TH_E, 3)) * np.maximum(s_, 1e-3) ** .95
    D = hdir(th.ravel(), psi.ravel()); P = skull_hit_dir(D); N = grad(skull_sdf, P)
    q = M2L(P); z = q[:, 2]; ze = helm_edge(psi.ravel())
    C = ramp_colour('emer', sval(N, hi=.30))
    # soft painted panel lines: a central ridge line front to back and two side seams
    ap = np.abs(psi.ravel())
    seam = np.exp(-((ap - 62) / 2.2) ** 2) * smooth(.95, .75, s_.ravel()) + np.exp(-(np.minimum(ap, 360 - ap) / 1.6) ** 2) * smooth(.15, .35, s_.ravel()) * (ap > 120)
    C = mix(C, rgb('emerdark'), .55 * clamp(seam))
    # the brass brow band along the front edge (with the V at the centre) and a thin brass trim round the back
    bw = np.where(ap < 100, .095, .036) * (1 - .30 * smooth(80, 105, ap))
    band = smooth(bw + .006, bw - .004, z - ze)
    bandc = ramp_colour('brass', sval(N, hi=.34) + .04)
    inner_line = np.exp(-((z - ze - bw * .55) / .006) ** 2) * (ap < 100)
    bandc = mix(bandc, rgb('brassdark'), .45 * inner_line)
    C = mix(C, bandc, band)
    C = mix(C, rgb('emerdark'), .35 * smooth(bw + .03, bw + .004, z - ze) * (1 - band))       # a soft shadow above the band
    return C.reshape(U.shape + (3,))

# horns: two chunky brass horns at the front-top corners and two smaller ones behind (blunt rounded tips)
def horn(name, psi_deg, s_, length, r0, lean_out, lean_back, curl=.25):
    P0, N0 = helm_point(psi_deg, s_)
    up = unit(np.array([0, 0, 1.]) + N0 * .55)
    outv = unit(np.array([math.sin(math.radians(psi_deg)), -math.cos(math.radians(psi_deg)), 0]))
    ax = unit(up + outv * lean_out + np.array([0, 1., 0]) * lean_back)
    path = []
    for t in np.linspace(0, 1, 6):
        path.append(P0 - N0 * r0 * .45 + ax * length * t + np.array([0, 1., 0]) * curl * length * t * t + outv * .2 * length * t * t)
    path = np.array(path)
    sweep(name, path, lambda k: (r0 * (1 - .66 * (k / 5) ** 1.25) + .004 * WS, r0 * (1 - .66 * (k / 5) ** 1.25) + .004 * WS), 'helm',
          lambda NV, tt, uu, V: ramp_uv('brass', sval(NV, hi=.30) + .02 * tt), sides=8, normals=np.tile(outv, (6, 1)))
    return path
HORN_FRONT = []
for sg in (-1, 1):
    HORN_FRONT.append(horn('brass_horn.%d' % sg, sg * 36, .78, .074 * WS, .026 * WS, .34, .10).tolist())
    horn('brass_horn_back.%d' % sg, sg * 126, .56, .048 * WS, .020 * WS, .10, .20)
# the dorsal crest: brass fins along the back midline, from the crown down the neck guard (thick, rounded leaves)
CREST = []
for k, (s_, hgt, ln) in enumerate([(.26, .092 * WS, .118 * WS), (.47, .088 * WS, .110 * WS), (.67, .076 * WS, .094 * WS), (.86, .060 * WS, .072 * WS)]):
    P0, N0 = helm_point(180., s_)
    tang = unit(np.cross(N0, [1., 0, 0])); tang = tang if tang[2] < 0 else -tang       # down the back
    up_ = unit(N0 - tang * .55)                                                        # leaning back like a fin
    c0 = P0 + up_ * hgt * .42 - N0 * .006 * WS
    def fin_sdf(p, c0=c0, up_=up_, tang=tang, hgt=hgt, ln=ln):
        q = p - c0; a = q @ up_; b = q @ tang; x = p[:, 0] - c0[0]
        taper = 1 - .30 * smooth(-.25 * hgt, .55 * hgt, a)
        return ell(np.stack([x / np.maximum(.45 + .55 * taper, .2), b / np.maximum(.45 + .55 * taper, .2), a], -1), [0, 0, 0], [.023 * WS, ln * .55, hgt * .60]) * np.minimum(1, taper + .3)
    star_mesh('brass_crest_fin.%d' % k, fin_sdf, c0, 'helm', lambda NN, V: ramp_uv('brass', sval(NN, hi=.36) + .03), nth=7, nph=10, tmax=.14 * WS, axis=up_, ref=tang)
    CREST.append(c0.tolist())

print('STEP dragon', flush=True)
# ============================================================== the little emerald dragon lying on the crown, facing forward
PT, NT_ = helm_point(0., .02)
DS = 1.15 * WS * 1.25; n_helm0 = len(parts['helm'])   # the dragon is authored at W 0.40 scale and scaled up about its seat (round 2: 1.25x more)
DB = PT + np.array([0, .010, .040])          # body centre (metres)
DH = DB + np.array([0, -.075, .022])         # head
def dragon_sdf(p):
    d = ell(p, DB, [.044, .070, .032])
    d = smin(d, ell(p, DH, [.040, .040, .033]), .018)
    d = smin(d, ell(p, DH + np.array([0, -.040, -.008]), [.027, .028, .021]), .012)        # the snout
    for sg in (-1, 1):
        d = smin(d, ell(p, DB + np.array([sg * .040, -.030, -.018]), [.016, .022, .014]), .010)   # front legs gripping the helm
        d = smin(d, ell(p, DB + np.array([sg * .036, .040, -.016]), [.016, .022, .013]), .010)    # back legs
    return d
def dragon_uv(NN, V):
    belly = smooth(-.2, -.75, NN[:, 2])
    return ramp_uv('emer', sval(NN, hi=.20) - .03 - .06 * belly)
star_mesh('little_dragon', dragon_sdf, DB + np.array([0, -.025, 0]), 'helm', dragon_uv, nth=18, nph=28, tmax=.16, axis=(0, -1., 0), ref=(0, 0, 1.))
for sg in (-1, 1):
    ec = DH + np.array([sg * .026, -.022, .012])
    lobe('dragon_eye.%d' % sg, ec, np.array([.009, .010, .010]), unit(np.array([sg * .7, -.7, .15])), 'helm', ramp='eyedark', n=2, occ_in=0)
    lobe('dragon_eye_hi.%d' % sg, ec + unit(np.array([sg * .7, -.7, .15])) * .0075 + np.array([-sg * .002, 0, .003]), np.array([.0022, .0032, .0032]),
         unit(np.array([sg * .7, -.7, .15])), 'helm', ramp='white', n=1, occ_in=0)
    hp = np.array([DH + np.array([sg * .018, .010, .026]) + np.array([sg * .008, .022, .018]) * t for t in np.linspace(0, 1, 5)])
    sweep('dragon_horn.%d' % sg, hp, lambda k: (.0085 * (1 - .65 * k / 4) + .002,) * 2, 'helm', lambda NV, tt, uu, V: ramp_uv('brass', sval(NV, hi=.34) + .04), sides=6, normals=np.tile([1., 0, 0], (5, 1)))
for k, t in enumerate([0, .5, 1.]):           # brass spines down its back
    sp = DB + np.array([0, -.025 + .050 * t, .030 - .004 * t])
    lobe('dragon_spine.%d' % k, sp, np.array([.012, .009, .005]), [0, 0, 1.], 'helm', ramp='brass', n=1, occ_in=0, pole=[0, 1., 0])
# its tail runs back over the crown into the crest
def ramp_sw(name, hi=.28, occ=0.):          # for sweep(): uvfn(NV, tt, uu, V)
    return lambda NV, tt, uu, V: ramp_uv(name, sval(NV, occ=occ, hi=hi))
def ramp_fn(name, hi=.28, occ=0.):          # for star_mesh() / ring_stack(): uvfn(NN, V)
    return lambda NN, V, *a: ramp_uv(name, sval(NN, occ=occ, hi=hi))
for o in parts['helm'][n_helm0:]:
    for v in o.data.vertices: v.co = Vector(PT + (np.array(v.co) - PT) * DS)
_dv = np.array([list(v.co) for o in parts['helm'][n_helm0:] for v in o.data.vertices])
_clear = float((skull_sdf(_dv) - (HG_s(0.) + HT) * W).min())             # its lowest clearance over the helmet's outer surface
DSINK = _clear + .008
for o in parts['helm'][n_helm0:]:
    for v in o.data.vertices: v.co.z -= DSINK
LOG['dragon_lowered_m'] = round(DSINK, 4)
tp = []
for t in np.linspace(0, 1, 9):
    if t > .35: P_, N_ = helm_point(180., max(.02, .05 + .20 * t))
    else: P_, N_ = PT + (DB + np.array([0, .060 + .060 * t, -.002 - .010 * t]) - PT) * DS - np.array([0, 0, DSINK]), np.array([0, 0, 1.])
    tp.append(P_ + N_ * (.010 - .004 * t) * DS)
tp = np.array(tp)
for _ in range(2): tp[1:-1] = .25 * tp[:-2] + .5 * tp[1:-1] + .25 * tp[2:]
sweep('dragon_tail', tp, lambda k: ((.020 * (1 - .6 * k / 8) + .004) * DS, (.016 * (1 - .6 * k / 8) + .004) * DS), 'helm', ramp_sw('emer', hi=.32), sides=8, normals=np.tile([0, 0, 1.], (9, 1)))
LOG['dragon_top_m'] = round(float(max(o.matrix_world.translation[2] + max(v.co[2] for v in o.data.vertices) for o in parts['helm'] if o.name.startswith('little_dragon'))), 4)

HEAD_PAINTERS = {'helm': paint_helm}

BODY_PAINTERS = {}; BODY_PIVOTS = {}; BODY_MEAS = {}; POST_JOIN = None
if not HEAD_ONLY:
    # ============================================================== BODY AND ARMOUR (metres; body axis x = 0)
    # Heights and widths from the sheet's front / side turnaround (281.6 px per metre, ground at y 422).
    RCY = -.015
    print('BODY_STEP chest plate', flush=True)
    # ---------------------------------------------------------------- the torso: the emerald scale chest plate (chart 'chest')
    TZ = np.array([.480, .530, .580, .630, .680, .730, .775, .815, .850])
    TAX = np.array([.192, .186, .179, .174, .173, .168, .150, .122, .095])
    TAY = np.array([.152, .158, .168, .176, .176, .168, .148, .120, .094])
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
    NA_T, NZ_T = 30, 12
    zt_ = np.linspace(TZ[0], TZ[-1], NZ_T); at_ = np.linspace(0, 2 * PI, NA_T, endpoint=False)
    AA, ZZ = np.meshgrid(at_, zt_)
    Pt_ = torso_raw(AA, ZZ); Nt_ = torso_n(AA, ZZ)
    Pg = np.concatenate([Pt_, Pt_[:, :1]], 1); Ng = np.concatenate([Nt_, Nt_[:, :1]], 1)
    Ug = np.concatenate([(AA / (2 * PI)), np.ones((NZ_T, 1))], 1); Vg = np.repeat(((zt_ - TZ[0]) / (TZ[-1] - TZ[0]))[:, None], NA_T + 1, 1)
    make_obj('emerald_chest_plate', Pg.reshape(-1, 3), grid_faces(NZ_T, NA_T + 1), au('chest', Ug.ravel(), Vg.ravel()), 'body', N=Ng.reshape(-1, 3))
    def scale_pattern(s, z, sw, sh, phase=0.):
        """overlapping fish scales: rows of rounded U-plates, each row half-offset. Returns (outline, inner light, row shade)"""
        row = np.floor((z - phase) / sh); zr = (z - phase) / sh - row          # 0 at the bottom edge of a row .. 1 at its top
        off = (row % 2) * .5
        col = np.floor(s / sw + off); u = s / sw + off - col - .5                # -0.5 .. 0.5 across a scale
        # a scale's lower edge is a U: distance from the arc that bounds the scale's bottom
        arc = np.sqrt(u * u * 4 + (1 - zr) ** 2 * 0) if False else None
        rr = np.sqrt((u / .55) ** 2 + ((zr - .95) / 1.05) ** 2)                 # radius from the scale's top centre
        edge = np.exp(-((rr - 1) / .085) ** 2) * (zr < 1.0)
        inner = clamp(1 - rr) ** .8
        return clamp(edge), inner, rr
    def paint_chest(U, V):
        a = U * 2 * PI; z = TZ[0] + V * (TZ[-1] - TZ[0])
        n = torso_n(a, z); C = ramp_colour('emer', sval(n, hi=.28))
        x = tax_f(z) * spow(np.sin(a), 2 / TP)
        s = a * .175                                                             # arc length (m), roughly
        edge, inner, rr = scale_pattern(s, z, .076, .056, .008)
        C = mix(C, ramp_colour('emer', sval(n, hi=.28) + .07), .55 * inner)
        C = mix(C, rgb('#1E6446'), .90 * edge)
        # the brass trim along the V neckline under the ruff and a soft dark side seam
        front = np.cos(a) > 0
        zv = .770 - .085 * clamp(1 - np.abs(x) / .150) ** 1.4
        band = (np.abs(z - zv) < .013) * front + (z > zv + .013) * front * 0
        C = mix(C, ramp_colour('brass', sval(n, hi=.30) + .05), band)
        C = mix(C, rgb('emerdeep'), .55 * (z > zv + .013) * front)
        return C
    BODY_PAINTERS['chest'] = paint_chest

    print('BODY_STEP pauldrons', flush=True)
    # ---------------------------------------------------------------- pauldrons: two layered domed scale plates per shoulder
    PAUL = {}
    def dome_shell(name, side, S, A, rad, th_max, thick, nth, nph, chart_v0=0., chart_v1=1.):
        A = unit(np.asarray(A, float)); e1 = unit(np.cross(A, [0, 1., 0])); e2 = np.cross(A, e1)
        th = np.linspace(0, th_max, nth + 1)[1:]; ph = np.linspace(0, 2 * PI, nph, endpoint=False)
        TT, PP = np.meshgrid(th, ph, indexing='ij')
        Dl = np.cos(TT)[..., None] * A + np.sin(TT)[..., None] * (np.cos(PP)[..., None] * e1 + np.sin(PP)[..., None] * e2)
        # an ellipsoidal dome: rad = (along A, across e1, across e2)
        cA = (Dl @ A); c1 = (Dl @ e1); c2 = (Dl @ e2)
        r = 1 / np.sqrt((cA / rad[0]) ** 2 + (c1 / rad[1]) ** 2 + (c2 / rad[2]) ** 2)
        P = S + Dl * r[..., None]
        g = (cA / rad[0] ** 2)[..., None] * A + (c1 / rad[1] ** 2)[..., None] * e1 + (c2 / rad[2] ** 2)[..., None] * e2
        N = unit(g)
        V = np.concatenate([[S + A * rad[0]], P.reshape(-1, 3)]); NN = np.concatenate([[A], N.reshape(-1, 3)])
        F = [(0, 1 + (j + 1) % nph, 1 + j) for j in range(nph)] + grid_faces(nth, nph, wrap=True, off=1)
        uvp = np.concatenate([[[.5, chart_v0]], np.stack([(PP / (2 * PI)).ravel(), (chart_v0 + (chart_v1 - chart_v0) * TT / th_max).ravel()], -1)])
        UVp = au('pauldron', uvp[:, 0], uvp[:, 1])
        Vt, Ft, UVt, Nt = thicken(V, F, NN, thick, UVp, UVp, UVp, rim=4)
        Vt[:, 0] = Vt[:, 0]
        return make_obj(name, Vt, Ft, UVt, 'body', N=Nt), (S, A, e1, e2, rad, th_max)
    for side, tag in ((1, 'L'), (-1, 'R')):
        S1 = np.array([side * .168, -.012, .690]); A1 = np.array([side * .40, 0, .92])
        _, PAUL[tag] = dome_shell('emerald_pauldron.' + tag, side, S1, A1, np.array([.106, .100, .140]), math.radians(80), .022, 6, 18, 0., .62)
        S2 = S1 + np.array([side * .028, 0, -.046]); A2 = np.array([side * .76, 0, .65])
        dome_shell('emerald_pauldron_lame.' + tag, side, S2, A2, np.array([.090, .096, .120]), math.radians(62), .019, 3, 12, .62, 1.)
    def paint_pauldron(U, V):
        ph = U * 2 * PI
        s = ph * .10; z = V * .20
        edge, inner, rr = scale_pattern(s, z, .055, .040, .0)
        n_ = unit(np.stack([np.cos(ph) * np.sin(V * 1.3), np.sin(ph) * np.sin(V * 1.3) * .3, np.cos(V * 1.3)], -1) @ np.array([[0, 0, 1.], [0, -1., 0], [1., 0, 0]]))
        base = sval(np.stack([np.cos(ph) * .5, -np.sin(ph) * .5, np.cos(V * 1.4)], -1), hi=.26)
        C = ramp_colour('emer', base)
        C = mix(C, ramp_colour('emer', base + .07), .5 * inner)
        C = mix(C, rgb('#1E6446'), .80 * edge * (V < .55))
        # brass rims at the lower edge of each plate (V 0.53-0.62 for the top plate, 0.92-1 for the lame)
        rim = smooth(.515, .535, V) * smooth(.625, .60, V) + smooth(.905, .925, V)
        C = mix(C, ramp_colour('brass', base + .06), rim)
        C = mix(C, ramp_colour('emer', base + .08), (V > .62) * (V < .905) * .25)
        return C
    BODY_PAINTERS['pauldron'] = paint_pauldron

    print('BODY_STEP belt', flush=True)
    # ---------------------------------------------------------------- the brown leather belt, brass edges and the round brass medallion
    BZ0, BZ1 = .495, .548; NAS = 26; a_s = np.linspace(0, 2 * PI, NAS, endpoint=False)
    def belt_ring(z, off):
        P = torso_pt(a_s, np.full(NAS, z), off); N = torso_n(a_s, np.full(NAS, z)); N[:, 2] = 0; return P, unit(N)
    Pb, Nb = belt_ring((BZ0 + BZ1) / 2, .010)
    ab3 = np.linspace(0, 2 * PI, 6, endpoint=False)
    ring_tube('leather_belt', Pb, lambda k: np.stack([.012 * spow(np.cos(ab3), .5), .027 * spow(np.sin(ab3), .5)], -1), 'body', lambda NN, tt, uu, V: ramp_uv('leather', sval(NN, hi=.26)), Nb, sides=6)
    for zz in (BZ0 + .002, BZ1 - .002):
        Pr, Nr = belt_ring(zz, .022)
        ab4 = np.linspace(0, 2 * PI, 4, endpoint=False) + PI / 4
        ring_tube('brass_belt_edge.%d' % int(zz * 1000), Pr, lambda k: np.stack([.0060 * np.cos(ab4), .0065 * np.sin(ab4)], -1), 'body', lambda NN, tt, uu, V: ramp_uv('brass', sval(NN, hi=.30) + .04), Nr, sides=4)
    MED_C = np.array([0, float(torso_pt(np.array([0.]), np.array([(BZ0 + BZ1) / 2]))[0, 1]) - .034, (BZ0 + BZ1) / 2 - .004])
    lobe('brass_medallion', MED_C, np.array([.017, .046, .046]), [0, -1., 0], 'body', ramp='brass', n=3, occ_in=.05, squash=.0, pole=[0, 0, 1.])
    lobe('brass_medallion_boss', MED_C + np.array([0, -.016, .002]), np.array([.012, .027, .027]), [0, -1., 0], 'body', ramp='brass', n=2, occ_in=0, sheen=1.2, pole=[0, 0, 1.])
    ra = np.linspace(0, 2 * PI, 20, endpoint=False)
    Pm = MED_C + np.stack([.040 * np.cos(ra), np.full(20, -.010), .040 * np.sin(ra)], -1)
    ring_tube('brass_medallion_rim', Pm, lambda k: np.stack([.0065 * np.cos(ab4), .0065 * np.sin(ab4)], -1), 'body', lambda NN, tt, uu, V: ramp_uv('brassdark' if False else 'brass', sval(NN, hi=.24) - .06), np.tile([0, -1., 0], (20, 1)), sides=4)

    print('BODY_STEP tabard', flush=True)
    # ---------------------------------------------------------------- the layered tabard: the front panel (emblem) and two scale tassets
    TB_TOP, TB_PT = .505, .230
    def tabard_outline(v):            # half-width at height fraction v (0 top .. 1 the point)
        return np.where(v < .62, .106 + .006 * v, .110 * np.sqrt(np.clip(1 - (np.maximum(v - .62, 0) / .38) ** 1.6, 0, 1)))
    nv_, nu_ = 11, 7
    vv = np.linspace(0, 1, nv_); uu = np.linspace(-1, 1, nu_)
    VV, UU = np.meshgrid(vv, uu, indexing='ij')
    zt = TB_TOP - VV * (TB_TOP - TB_PT); hw = tabard_outline(VV) * np.maximum(1 - .05 * VV, .1)
    xt = UU * np.maximum(hw, .004)
    yfront = RCY - tay_f(np.full_like(zt, TB_TOP)) - .030 - .010 * VV - .030 * (VV ** 1.5)            # hangs a little forward
    yt = yfront + .55 * (xt ** 2)                                                                       # follows the body's curve
    Gt = np.stack([xt, yt, zt], -1)
    dV = np.gradient(Gt, axis=0); dU = np.gradient(Gt, axis=1); Ntb = unit(np.cross(dU, dV))
    if Ntb[nv_ // 2, nu_ // 2, 1] > 0: Ntb = -Ntb
    uvt = au('tabard', (UU * .5 + .5).ravel(), VV.ravel())
    Vt, Ft, UVt, Nt = thicken(Gt.reshape(-1, 3), grid_faces(nv_, nu_), Ntb.reshape(-1, 3), .016, uvt, ramp_uv('emer', .30), uvt, rim=3)
    make_obj('emerald_tabard_front', Vt, Ft, UVt, 'tabard', N=Nt)
    def paint_tabard(U, V):
        x = (U - .5) * 2; v = V
        hw_ = tabard_outline(v) / .110
        ed = 1 - np.abs(x) / np.maximum(hw_, 1e-3)                       # 0 at the side edge .. 1 at the centre
        n_ = unit(np.stack([x * .4, -np.ones_like(x), .1 + 0 * x], -1))
        C = ramp_colour('emer', sval(n_, hi=.24) - .02)
        # the brass border: along the sides and the V point, a little inset
        dist_edge = np.minimum(ed * hw_ * .110, np.where(v > .62, (1 - v) * .275 * 1.2 + 1, 1))
        border = smooth(.013, .009, ed * hw_ * .110) * (v > .03) + smooth(.04, .02, v)
        C = mix(C, ramp_colour('brass', sval(n_, hi=.26) + .05), clamp(border))
        # the leaf-dragon emblem: a brass four-lobed leaf (flame-like) with a centre vein, at about z 0.37 m
        ex_ = x * .110 / .085; ez_ = (v - .50) * .275 / .085
        r_ = np.sqrt(ex_ ** 2 + ez_ ** 2) + 1e-6; th_ = np.arctan2(ez_, ex_)
        petal = .55 + .45 * np.cos(4 * (th_ - PI / 2)) ** 2 * (1 + .35 * np.sin(th_))       # four leaves, the top one longest
        leaf = smooth(petal * .92 + .04, petal * .92 - .04, r_)
        vein = np.exp(-(ex_ / .05) ** 2) * (np.abs(ez_) < .7) + np.exp(-(ez_ / .05) ** 2) * (np.abs(ex_) < .55)
        C = mix(C, ramp_colour('brass', sval(n_, hi=.30) + .08), .95 * leaf)
        C = mix(C, rgb('brassdark'), .55 * leaf * clamp(vein))
        return C
    BODY_PAINTERS['tabard'] = paint_tabard
    # the tassets: curved scale skirts over the hips, from the tabard edge round to the back
    for side, tag in ((1, 'L'), (-1, 'R')):
        na_, nz_ = 11, 5
        aa = np.linspace(math.radians(30), math.radians(168), na_); zz = np.linspace(.512, .325, nz_)
        A2, Z2 = np.meshgrid(aa, zz)
        flare = .018 + .052 * ((.512 - Z2) / .187) ** 1.25
        P = torso_pt(A2, np.full_like(Z2, .50), .022 + flare)
        P[..., 2] = Z2; P[..., 0] *= side
        P[..., 0] = P[..., 0] + side * .004 * np.sin(A2 * 6)
        dA = np.gradient(P, axis=1); dZ = np.gradient(P, axis=0); Nq = unit(np.cross(dZ, dA) * side)
        cen = np.array([0, RCY, .45])
        if (Nq * (P - cen)).sum() < 0: Nq = -Nq
        uvq = au('tasset', ((A2 - aa[0]) / (aa[-1] - aa[0])).ravel(), ((.512 - Z2) / .187).ravel())
        Vt, Ft, UVt, Nt = thicken(P.reshape(-1, 3), grid_faces(nz_, na_), Nq.reshape(-1, 3), .018, uvq, ramp_uv('emer', .28), uvq, rim=3)
        make_obj('emerald_tasset.' + tag, Vt, Ft, UVt, 'tabard', N=Nt)
    def paint_tasset(U, V):
        s = U * .42; z = V * .19
        a_ = math.radians(30) + U * math.radians(138)
        n_ = unit(np.stack([np.sin(a_), -np.cos(a_), .25 + 0 * a_], -1))
        base = sval(n_, hi=.26)
        edge, inner, rr = scale_pattern(s, z, .060, .045, .010)
        C = ramp_colour('emer', base)
        C = mix(C, ramp_colour('emer', base + .07), .5 * inner)
        C = mix(C, rgb('#1E6446'), .80 * edge)
        rim = smooth(.90, .93, V) + smooth(.045, .02, U) + smooth(.955, .98, U) * .0
        C = mix(C, ramp_colour('brass', base + .06), clamp(rim))
        C = mix(C, rgb('emerdeep'), .5 * smooth(.08, .0, V))                 # shaded under the belt
        return C
    BODY_PAINTERS['tasset'] = paint_tasset

    print('BODY_STEP arms', flush=True)
    # ---------------------------------------------------------------- arms: feathered fur arms, emerald bracers, leather wrist straps, light-fur mitten paws
    ARM = {}; ARM_DEG = 42.
    for s, tag in ((1, 'L'), (-1, 'R')):
        th = math.radians(ARM_DEG); ad = unit(np.array([s * math.sin(th), -.06, -math.cos(th)]))
        SH = np.array([s * .205, -.012, .712])
        fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
        back = -fwd; lat = unit(np.cross(ad, fwd)) * s                      # lat points away from the body
        def along(t0, SH=SH, ad=ad): return SH + ad * t0
        EL = along(.182); WR = along(.318); PC = along(.372)
        def arm_fur_sdf(p, SH=SH, EL=EL, WR=WR, back=back, lat=lat, ad=ad):
            d = sd_capsule(p, SH - ad * .05, EL, (.074, .068))
            d = smin(d, sd_capsule(p, EL, WR, (.066, .058)), .03)
            c_ = SH + ad * .09 + back * .040
            d = smin(d, sd_ell(p, c_, np.array([ad, back, lat]), (.060, .050, .042)), .025)                # a soft fullness behind the upper arm
            return d
        def arm_uv(NN, V, SH=SH, ad=ad, back=back):
            t_ = (V - SH) @ ad; behind = clamp((NN @ back))
            return fur_uv(sval(NN, hi=.30), clamp(.45 * behind * smooth(.05, .25, t_)))
        ts = np.linspace(-.03, .322, 14)
        ring_stack('fur_arm.' + tag, arm_fur_sdf, SH[None] + ad[None] * ts[:, None], np.tile(ad, (len(ts), 1)), 'arm.' + tag, arm_uv, sides=14, tmax=.20, ref=fwd, pole_start=True, pole_end=True)
        # the emerald bracer over the forearm (flared at the elbow), a brass rim, and the leather wrist strap
        path = np.array([along(t) for t in np.linspace(.190, .302, 6)])
        sweep('emerald_bracer.' + tag, path, lambda k: (.082 - .010 * k / 5, .080 - .010 * k / 5), 'arm.' + tag,
              lambda NV, tt, uu, V: ramp_uv('emer', sval(NV, hi=.28) - .02), sides=18, cap0=False, cap1=False, normals=np.tile(lat, (6, 1)))
        for t0, r0, nm, rp in ((.190, .087, 'brass_bracer_rim', 'brass'), (.300, .076, 'brass_bracer_rim2', 'brass'), (.320, .067, 'leather_wrist_strap', 'leather')):
            path = np.array([along(t) for t in np.linspace(t0 - .010, t0 + .010, 3)])
            sweep(nm + '.' + tag, path, lambda k, r0=r0: (r0, r0 - .002), 'arm.' + tag, ramp_sw(rp, hi=.28), sides=18, cap0=False, cap1=False, normals=np.tile(lat, (3, 1)), p=.9)
        # the mitten paw (light fur): palm, three soft finger lobes, a thumb
        paw_axes = np.array([ad, fwd, lat])
        fingers = [PC + ad * .052 + fwd * (o * .030) + lat * .002 for o in (-1, 0, 1)]
        thumb = PC + fwd * .056 + lat * -.018 - ad * .006
        def paw_parts(p, WR=WR, PC=PC, paw_axes=paw_axes, fingers=fingers, thumb=thumb, ad=ad):
            d_w = sd_capsule(p, WR - ad * .03, PC, (.060, .068))
            d_paw = sd_ell(p, PC, paw_axes, (.074, .080, .070))
            d_f = [sd_ell(p, f, paw_axes, (.034, .029, .036)) for f in fingers]
            d_t = sd_ell(p, thumb, paw_axes, (.032, .028, .028))
            return d_w, d_paw, d_f, d_t
        def paw_sdf(p, paw_parts=paw_parts):
            d_w, d_paw, d_f, d_t = paw_parts(p)
            d = smin(d_w, d_paw, .030); ff = smin(smin(d_f[0], d_f[1], .007), d_f[2], .007)
            return smin(smin(d, ff, .016), d_t, .012)
        def paw_uv(NN, V, paw_parts=paw_parts):
            d_w, d_paw, d_f, d_t = paw_parts(V)
            cr = crease(d_f[0], d_f[1], .007) * .25 + crease(d_f[1], d_f[2], .007) * .25 + crease(np.minimum(d_paw, d_w), d_t, .012) * .2
            return fur_uv(sval(NN, occ=1.3 * cr, hi=.30), .95)
        tt_ = np.linspace(0, .14, 281); inside = paw_sdf(PC[None] + ad[None] * tt_[:, None]) < 0
        reach = float(tt_[np.argmin(inside)]) if not inside.all() else .14
        tips = PC + ad * (reach - .008)
        tsp = np.concatenate([np.linspace(0, .45, 4)[:-1], np.linspace(.45, 1.0, 12)])
        cen = (WR - ad * .01)[None] + (tips - (WR - ad * .01))[None] * tsp[:, None]
        ring_stack('mitten_paw.' + tag, paw_sdf, cen, np.tile(ad, (len(tsp), 1)), 'arm.' + tag, paw_uv, sides=14, tmax=.16, ref=fwd)
        # feathering: soft tufts on the back of the elbow and forearm (out past the bracer), and a fluffy fur cuff at the wrist
        for k, (t0, ob, ol, L_, R_) in enumerate(((.150, .060, .012, .120, .050), (.232, .080, .006, .118, .046))):
            root = along(t0) + back * ob * .62 + lat * ol
            tuft('arm_feather_tuft.%s.%d' % (tag, k), root, unit(ad * .92 + back * .30), L_, R_, 'arm.' + tag, light0=.05, light1=.45, n=3,
                 side_ref=np.cross(ad, back), curl=back, curl_k=.10)
        fur_cuff('fur_wrist_cuff.' + tag, along(.334), ad, .060, 7, 'arm.' + tag, thick=.020, droop=.026)
        ARM[tag] = {'shoulder': SH.tolist(), 'elbow': EL.tolist(), 'wrist': WR.tolist(), 'palm': (PC + lat * -.012).tolist(),
                    'grip_axis': unit(np.cross(ad, lat) * 0 + fwd).tolist()}

    print('BODY_STEP hips legs feet', flush=True)
    # ---------------------------------------------------------------- the fur hips, fluffy feathered legs and light-fur feet
    def hips_sdf(p):
        d = ell(p, [0, .010, .420], [.205, .165, .110])
        d = smin(d, ell(p, [0, .090, .395], [.165, .110, .095]), .04)              # the rump under the tail root
        return d
    star_mesh('fur_hips', hips_sdf, np.array([0, .02, .41]), 'body', lambda NN, V: fur_uv(sval(NN, hi=.28, occ=.10), .0), nth=8, nph=16, tmax=.35)
    LEG = {}
    for s, tag in ((1, 'L'), (-1, 'R')):
        HP = np.array([s * .120, .000, .400]); KN = np.array([s * .160, -.012, .205]); AN = np.array([s * .178, -.004, .085])
        def leg_sdf(p, HP=HP, KN=KN, AN=AN, s=s):
            d = sd_capsule(p, HP, KN, (.122, .116))
            d = smin(d, sd_capsule(p, KN, AN, (.112, .095)), .05)
            return smax(d, -(p[:, 2] - .030), .012)                              # (the foot covers the leg's end, above the ground)
        def leg_uv(NN, V, s=s):
            behind = clamp(NN[:, 1]); outer = clamp(NN[:, 0] * s)
            return fur_uv(sval(NN, hi=.30, occ=.12 * smooth(.36, .42, V[:, 2])), clamp(.32 * behind + .18 * outer * smooth(.30, .12, V[:, 2])))
        zs = np.linspace(.405, .080, 12)
        cen = np.array([HP + (AN - HP) * ((z_ - HP[2]) / (AN[2] - HP[2])) for z_ in zs])
        ring_stack('fur_leg.' + tag, leg_sdf, cen, np.tile(unit(AN - HP), (len(zs), 1)), 'body', leg_uv, sides=16, tmax=.25, ref=[0, -1., 0])
        FC = np.array([s * .205, -.050, .050]); yaw = s * math.radians(10)
        FAX = rot([0, 0, 1], yaw).T
        toes = [FC + np.array([0, -.110, -.006]) @ FAX * 0 + (np.array([o * .046, -.112, -.004]) @ FAX) for o in (-1, 0, 1)]
        def foot_parts(p, FC=FC, FAX=FAX, toes=toes, s=s):
            d_main = sd_ell(p, FC + np.array([0, .010, 0]), FAX, (.110, .145, .068))
            d_ank = sd_capsule(p, np.array([s * .182, -.004, .080]), np.array([s * .188, -.010, .040]), .086)
            d_t = [sd_ell(p, t, FAX, (.040, .050, .050)) for t in toes]
            return d_main, d_ank, d_t
        def foot_sdf(p, foot_parts=foot_parts):
            d_main, d_ank, d_t = foot_parts(p)
            d = smin(d_main, d_ank, .03); tt = smin(smin(d_t[0], d_t[1], .008), d_t[2], .008)
            d = smin(d, tt, .02)
            return smax(d, -(p[:, 2] - .002), .010)
        def foot_uv(NN, V, foot_parts=foot_parts):
            d_main, d_ank, d_t = foot_parts(V)
            cr = crease(d_t[0], d_t[1], .008) * .30 + crease(d_t[1], d_t[2], .008) * .30
            return fur_uv(sval(NN, occ=1.2 * cr + .10 * smooth(.02, .0, V[:, 2]), hi=.30), .95)
        star_mesh('lightfur_foot.' + tag, foot_sdf, FC + np.array([0, -.010, .020]), 'body', foot_uv, nth=11, nph=20, tmax=.30)
        LEG[tag] = {'hip': HP.tolist(), 'knee': KN.tolist(), 'ankle': AN.tolist(), 'toe': (FC + np.array([0, -.150, .000]) @ FAX).tolist()}

    print('BODY_STEP quiver', flush=True)
    # ---------------------------------------------------------------- the back quiver: an emerald tube, brass bands, javelin tips, leather straps
    QB = np.array([0, .240, .470]); QT = np.array([0, .300, .845]); QR = .068
    qax = unit(QT - QB); qref = unit(np.cross(qax, [1., 0, 0]))
    path = np.array([QB + (QT - QB) * t for t in np.linspace(0, 1, 8)])
    sweep('emerald_quiver', path, lambda k: (QR, QR), 'body', lambda NV, tt, uu, V: ramp_uv('emer', sval(NV, hi=.28) - .02), sides=12, normals=np.tile([1., 0, 0], (8, 1)))
    for t0, t1, r0 in ((.00, .09, .070), (.88, 1.0, .072)):
        path = np.array([QB + (QT - QB) * t for t in np.linspace(t0, t1, 3)])
        sweep('brass_quiver_band.%d' % int(t0 * 100), path, lambda k, r0=r0: (r0, r0), 'body', ramp_sw('brass', hi=.32), sides=18, cap0=(t0 == 0), cap1=False, normals=np.tile([1., 0, 0], (3, 1)), p=.9)
    LEAF = QB + (QT - QB) * .80 + unit(np.array([0, 1., -.15])) * (QR + .004)
    lobe('brass_quiver_leaf', LEAF, np.array([.010, .016, .026]), [0, 1., -.15], 'body', ramp='brass', n=3, occ_in=0, pole=[0, 0, 1.])
    JAV_TIPS = []
    for k, (dx, dz) in enumerate(((0, .135), (-.034, .105), (.034, .108))):
        top = QT + qax * (dz * .95) + np.array([dx, .008 + abs(dx) * .1, 0])
        path = np.array([QT - qax * .05 + np.array([dx * .7, 0, 0]) + (top - QT + qax * .05 - np.array([dx * .7, 0, 0])) * t for t in np.linspace(0, 1, 5)])
        sweep('javelin_shaft.%d' % k, path, lambda j: (.013, .013), 'body', ramp_sw('rope', hi=.26), sides=7, cap0=False, normals=np.tile([1., 0, 0], (5, 1)))
        lobe('javelin_ball_tip.%d' % k, top + qax * .018, np.array([.034, .034, .034]), qax, 'body', ramp='brass', n=3, occ_in=.05, squash=0)
        JAV_TIPS.append((top + qax * .018).tolist())
    for k, dx in enumerate((.020,)):                    # a javelin stored the other way: felt fletching up
        base = QT + np.array([dx, -.012, -.02])
        for j, ang in enumerate((0, 120, 240)):
            vd = unit(np.array([math.cos(math.radians(ang + 30 * k)), math.sin(math.radians(ang + 30 * k)) * .6, 0]))
            c_ = base + qax * .060 + vd * .016
            lobe('felt_fletch.%d.%d' % (k, j), c_, np.array([.034, .010, .022]), qax, 'body', ramp='emer', n=2, occ_in=.05, pole=vd)
    # leather straps: two straps down the back from the shoulders to the belt, a band round the quiver
    for sg in (-1, 1):
        sp = []
        for z_ in np.linspace(.800, .550, 9):
            a_ = PI - math.atan2(sg * .090, 1.) * 1.6
            sp.append(torso_pt(np.array([PI + sg * .52]), np.array([z_]), .010)[0])
        sp = np.array(sp)
        sweep('leather_back_strap.%d' % sg, sp, lambda k: (.006, .019), 'body', ramp_sw('leather', hi=.24), sides=4,
              normals=torso_n(np.full(9, PI + sg * .52), np.linspace(.800, .550, 9)), p=.5)
    qa = np.linspace(0, 2 * PI, 16, endpoint=False); qc = QB + (QT - QB) * .52
    e1q = unit(np.array([1., 0, 0]) - qax * qax[0]); e2q = np.cross(qax, e1q)
    Pq = qc + (QR + .006) * (np.cos(qa)[:, None] * e1q + np.sin(qa)[:, None] * e2q)
    ring_tube('leather_quiver_band', Pq, lambda k: np.stack([.004 * np.cos(ab4), .014 * np.sin(ab4)], -1), 'body', lambda NN, tt, uu, V: ramp_uv('leather', sval(NN, hi=.26)), np.cos(qa)[:, None] * e1q + np.sin(qa)[:, None] * e2q, sides=4)

    print('BODY_STEP shorten the body (round 2: the bigger head)', flush=True)
    # ---------------------------------------------------------------- shorten everything below the chin by BZS (widths kept): squash the shells
    # and fur in z, carry the round ornaments (medallion, ball tips, leaf, fletching) without squashing them, and scale each
    # arm uniformly about its shoulder (round paws) while the shoulder drops with the body. The feet stay as they are.
    BZS = CHIN / .833; ARM_S = .90
    RIGID = ('brass_medallion', 'javelin_ball_tip', 'brass_quiver_leaf', 'felt_fletch')
    def _get(o):
        me = o.data; V = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
        a = me.attributes.get('cust_n'); N = None
        if a is not None:
            N = np.zeros(len(me.vertices) * 3, np.float32); a.data.foreach_get('vector', N); N = N.reshape(-1, 3).astype(float)
        return V, N
    def _set(o, V, N):
        me = o.data; me.vertices.foreach_set('co', V.astype(np.float32).ravel())
        if N is not None: me.attributes.get('cust_n').data.foreach_set('vector', unit(N).astype(np.float32).ravel())
        me.update()
    for g in ('body', 'tabard'):
        for o in parts.get(g, []):
            if o.name.startswith('lightfur_foot'): continue
            V, N = _get(o)
            if o.name.startswith(RIGID):
                V = V + np.array([0, 0, V[:, 2].mean() * (BZS - 1)])
            else:
                V = V * np.array([1, 1, BZS])
                if N is not None: N = N * np.array([1, 1, 1 / BZS])
            _set(o, V, N)
    for tag in ('L', 'R'):
        SH0 = np.array(ARM[tag]['shoulder']); SH1 = SH0 * np.array([1, 1, BZS])
        for o in parts['arm.' + tag]:
            V, N = _get(o); _set(o, SH1 + (V - SH0) * ARM_S, N)
        for k in ('shoulder', 'elbow', 'wrist', 'palm'):
            ARM[tag][k] = (SH1 + (np.array(ARM[tag][k]) - SH0) * ARM_S).tolist()
    for tag in LEG:
        for k in ('hip', 'knee', 'ankle'): LEG[tag][k] = (np.array(LEG[tag][k]) * np.array([1, 1, BZS])).tolist()
    JAV_TIPS = [(np.array(t) * np.array([1, 1, BZS])).tolist() for t in JAV_TIPS]
    LOG['body_shorten_BZS'] = round(BZS, 4)

    print('BODY_STEP ruff', flush=True)
    # ---------------------------------------------------------------- the big fluffy cream ruff: a smooth bib under the chin, a scalloped V of soft
    # rounded tufts at its lower edge, wrapping round under the ears to a collar at the back
    NZ_TOP = float(torso_raw(np.array([0.]), np.array([TZ[-1]]))[0, 2]) * BZS
    RUFF_C = np.array([0, -.035, CHIN - .035])
    RT = []
    for k, x_ in enumerate((-.150, -.075, 0., .075, .150)):                  # the scalloped lower edge of the bib (a V)
        RT.append(([x_ * .92, -.172 + .050 * (x_ / .15) ** 2, CHIN - .108 + .050 * abs(x_ / .15) ** 1.3], [.062, .054, .060], -22))
    for k, x_ in enumerate((-.110, 0., .110)):                                 # the upper row, under the jaw
        RT.append(([x_, -.180 + .040 * (x_ / .11) ** 2, CHIN - .045], [.080, .060, .062], -14))
    for sg in (-1, 1):
        RT.append(([sg * .160, -.085, CHIN - .045], [.062, .068, .060], 0))
        RT.append(([sg * .145, .045, CHIN - .035], [.056, .064, .054], 0))
    RT.append(([0, .120, CHIN - .025], [.140, .060, .046], 0))
    def ruff_sdf(p):
        d = ell(p, RUFF_C + np.array([0, .010, .010]), [.195, .180, .075])
        for c_, r_, tilt in RT:
            q = (p - np.asarray(c_, float)) @ rot([1, 0, 0], math.radians(tilt)).T
            d = smin(d, ell(q, [0, 0, 0], r_), .036)
        return d
    def ruff_uv(NN, V):
        grooves = clamp(1 - np.abs(np.sin(PI * (V[:, 0] / .069 + .5))) * 1.5) * smooth(CHIN - .07, CHIN - .13, V[:, 2])
        return ramp_uv('ruff', sval(NN, hi=.28, occ=.10 * smooth(CHIN - .02, CHIN - .08, V[:, 2]) * 0 + .16 * grooves) + .05)
    star_mesh('cream_chest_ruff', ruff_sdf, RUFF_C + np.array([0, -.015, -.010]), 'ruff', ruff_uv, nth=16, nph=30, tmax=.36)

    print('BODY_STEP tail', flush=True)
    # ---------------------------------------------------------------- the big fluffy plume: raised, round, with layered feathered locks and a light tip
    TAIL_P = np.array([[0, .130, .345], [-.020, .245, .330], [-.052, .360, .372], [-.085, .450, .450], [-.110, .505, .545], [-.122, .520, .640]])
    tpath = cpath(TAIL_P, 20); KT = len(tpath)
    def tail_r(t): return np.interp(t, [0, .12, .40, .70, .90, 1], [.062, .090, .118, .120, .098, .055])
    def tail_hang(t):
        return .050 * np.sin(PI * np.clip(t / .95, 0, 1)) ** .7 * (.70 + .30 * np.cos(2 * PI * (4 * t - .1))) * smooth(.0, .2, t)
    Tt = unit(np.gradient(tpath, axis=0)); Nd_ = unit(np.array([0, 0, -1.]) + Tt * Tt[:, 2:3])
    Nd_ = unit(Nd_ - Tt * (Nd_ * Tt).sum(1, keepdims=True)); Bt = np.cross(Tt, Nd_)
    NTH = 16; th = np.linspace(0, 2 * PI, NTH, endpoint=False)
    GT = np.zeros((KT, NTH, 3)); TPAR = np.zeros((KT, NTH)); DOWN = np.zeros((KT, NTH))
    for k in range(KT):
        t = k / (KT - 1); r = tail_r(t); h = tail_hang(t); c = np.cos(th); sn = np.sin(th)
        a_ = np.where(c > 0, r + h, r * .96); b_ = r * .98 + .40 * h * np.clip(c, 0, 1)
        groove = 1 - .06 * (1 - np.cos(7 * th + 1.3 * t)) / 2 * smooth(.1, .3, t)
        GT[k] = tpath[k] + (Nd_[k] * (a_ * c * groove)[:, None] + Bt[k] * (b_ * sn * groove)[:, None])
        TPAR[k] = t; DOWN[k] = np.clip(c, 0, 1)
    dK = np.gradient(GT, axis=0); dS = np.roll(GT, -1, 1) - np.roll(GT, 1, 1)
    NGt = unit(np.cross(dS, dK)); out_ = GT - tpath[:, None, :]
    NGt = np.where(((NGt * out_).sum(-1) < 0)[..., None], -NGt, NGt)
    p_root = tpath[0] - Tt[0] * tail_r(0) * .8; p_tip = tpath[-1] + Tt[-1] * tail_r(1.) * .9
    Vtl, Ftl, _, Ntl = closed_grid(GT, NGt, np.zeros((KT, NTH, 2)), (p_root, -Tt[0], [0, 0]), (p_tip, Tt[-1], [0, 0]))
    tpar = np.concatenate([TPAR.reshape(-1), [0., 1.]]); down = np.concatenate([DOWN.reshape(-1), [0., 0.]])
    make_obj('plumed_tail', Vtl, Ftl, fur_uv(sval(Ntl, hi=.30, occ=.08 * smooth(.2, 0, tpar)), clamp(.70 * smooth(.62, 1., tpar) + .35 * down * smooth(.2, .6, tpar))), 'tail', N=Ntl)
    # layered feathered locks: long soft tufts hanging back and down along the plume, lighter toward their tips, and a light tip tuft
    for k, (t, ang, L_, R_) in enumerate(((.34, .0, .230, .080), (.50, -.62, .240, .084), (.56, .62, .240, .084), (.72, .0, .220, .078))):
        i = int(round(t * (KT - 1))); tg = Tt[i]
        dn = unit(Nd_[i] * math.cos(ang) + Bt[i] * math.sin(ang))
        root = tpath[i] + dn * tail_r(t) * .40 - tg * .04
        tuft('tail_feather_lock.%d' % k, root, unit(dn * .22 + tg * .97), L_, R_, 'tail', light0=.30, light1=.90, n=3,
             side_ref=np.cross(tg, dn), curl=-dn, curl_k=.06, flat=.46)
    tuft('tail_tip_tuft', tpath[-5], unit(Tt[-1] * .97 + Nd_[-1] * .10), .200, .092, 'tail', light0=.60, light1=.96, n=3, side_ref=Bt[-1], curl=-Nd_[-1], curl_k=.08, flat=.70)
    TAIL_PATH = tpath

    print('BODY_STEP thigh tufts and ankle cuffs', flush=True)
    # ---------------------------------------------------------------- feathering on the thighs (outer side and back, under the tassets) and fur ankle cuffs
    for s, tag in ((1, 'L'), (-1, 'R')):
        HP = np.array(LEG[tag]['hip']); KN = np.array(LEG[tag]['knee']); AN = np.array(LEG[tag]['ankle'])
        def legpt(z_):
            t_ = (z_ - HP[2]) / (KN[2] - HP[2]); return HP + (KN - HP) * t_
        for k, (z_, ang, L_, R_) in enumerate(((.300, 95, .165, .074), (.292, 140, .170, .078), (.286, 182, .160, .072))):
            a_ = math.radians(ang); out = unit(np.array([s * math.sin(a_), -math.cos(a_), 0]))
            root = legpt(z_) + out * .070
            tuft('thigh_feather_tuft.%s.%d' % (tag, k), root, unit(np.array([0, 0, -1.]) + out * .12), L_, R_, 'body', light0=.05, light1=.36, n=3,
                 side_ref=np.cross(out, [0, 0, 1.]), curl=out, curl_k=.07, flat=.52)
        fur_cuff('fur_ankle_cuff.' + tag, np.array([s * .182, -.008, .140]), np.array([0, 0, -1.]), .102, 8, 'body', thick=.026, droop=.032)

    # ---------------------------------------------------------------- measurements of the authored parts (metres; fractions of the 1.20 m crown)
    def _vs(prefixes, groups=None):
        out = []
        for g, obs in parts.items():
            if groups and g not in groups: continue
            for o in obs:
                if any(o.name.startswith(p) for p in prefixes): out += [list(o.matrix_world @ v.co) for v in o.data.vertices]
        return np.array(out)
    def _ext(v): return {'min': [round(float(c), 3) for c in v.min(0)], 'max': [round(float(c), 3) for c in v.max(0)], 'size': [round(float(c), 3) for c in np.ptp(v, 0)]}
    _T = 1.20
    BODY_MEAS = {'body_parts_m': {k: _ext(_vs(v)) for k, v in {
        'ruff': ['cream_chest_ruff'], 'chest_plate': ['emerald_chest_plate'], 'pauldrons': ['emerald_pauldron'], 'belt': ['leather_belt'],
        'medallion': ['brass_medallion'], 'tabard_front': ['emerald_tabard_front'], 'tassets': ['emerald_tasset'], 'arm_L': ['fur_arm.L', 'mitten_paw.L'],
        'paw_L': ['mitten_paw.L'], 'bracer_L': ['emerald_bracer.L'], 'legs': ['fur_leg'], 'feet': ['lightfur_foot'], 'tail': ['plumed_tail'],
        'quiver': ['emerald_quiver', 'brass_quiver', 'javelin_'], 'quiver_tube': ['emerald_quiver', 'brass_quiver'], 'helmet': ['emerald_helmet'], 'horns': ['brass_horn'], 'dragon': ['little_dragon', 'dragon_']}.items()}}
    BODY_MEAS['arm_angle_from_vertical_deg'] = ARM_DEG; BODY_MEAS['body_shorten_BZS'] = round(BZS, 4)
    BODY_PIVOTS = {'arm.L': tuple(ARM['L']['shoulder']), 'arm.R': tuple(ARM['R']['shoulder']), 'tail': tuple(TAIL_PATH[0]),
                   'body': (0, 0, 0), 'ruff': tuple(RUFF_C), 'tabard': (0, RCY, .50 * BZS)}
    def POST_JOIN():
        joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X'}
        joints.update({'hips': [0, .010, round(.410 * BZS, 4)], 'spine': [0, .000, round(.520 * BZS, 4)], 'chest': [0, -.010, round(.640 * BZS, 4)], 'neck': [0, -.012, round(.800 * BZS, 4)]})
        joints['head'] = [float(v) for v in O]
        joints['jaw_pivot'] = [0, float(HY - .20 * W), float(CHIN + .200 * W)]
        joints['eyes'] = {'R': eye_centers['R'], 'L': eye_centers['L']}
        joints['ears'] = {t: {'base': [float(v) for v in ear_info[t]['base']], 'fold': [float(v) for v in ear_info[t]['fold']],
                              'tip': [float(v) for v in ear_info[t]['tip']]} for t in ('R', 'L')}
        joints['arms'] = {t: {k: ARM[t][k] for k in ('shoulder', 'elbow', 'wrist')} for t in ARM}
        joints['legs'] = LEG
        joints['tail'] = [TAIL_PATH[i].tolist() for i in (0, 4, 9, 13, 17, len(TAIL_PATH) - 1)]
        joints['palm_R'] = ARM['R']['palm']; joints['palm_L'] = ARM['L']['palm']
        joints['quiver_javelin_tips'] = JAV_TIPS
        joints['notes'] = ['Phase 1: no rig, weights or animations. Same keys as chewy-b joints-round13.json, plus palm_R / palm_L.',
                           'head = the head centre (the radial origin), not the nod pivot: the rig should put the head bone at the base of the skull.',
                           'Head skin = zero surface of one smooth implicit ball (skull + cheeks + bun muzzle + jaw + nose), analytic normals, adaptive toon-band refinement; the skin under the helmet is deleted.',
                           'The open smile: a hole ringed by 4 loops, the edge rolled 5.5 mm in as a lip, continuing into a closed 5-ring mouth sac; the tongue is a separate piece (Golden_tongue) for the jaw bone.',
                           'Eyelid holes ringed by 5 loops each with the rim rolled 4.5 mm in behind separate lens eyeballs; 5 loops round the nose.',
                           'Ears: separate pieces (Golden_ear_L / _R), 24 bend rows from the root (under the helmet) to the scalloped hem; pivot = ears.base.',
                           'Tail: Golden_tail, a 28-ring plume (bend loops), pivot = tail[0]. The ruff (Golden_ruff) and the tabard panels (Golden_tabard: front panel + two tassets) are separate pieces.',
                           'The helmet, horns, crest fins and little dragon (Golden_helm) are one rigid piece for the head bone.',
                           'Arms: fur ring stacks with joint loops at the elbow (bracer rim) and wrist (strap); legs: 15-ring stacks per leg, the hips a separate fur mass under the tassets.']
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
def poly_dist(x, z, L):
    """distance from points to a closed polyline (W units)"""
    best = np.full(len(x), 9.); n = len(L)
    for i in range(n):
        a = L[i]; b = L[(i + 1) % n]; ab = b - a; L2 = ab @ ab + 1e-12
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        best = np.minimum(best, np.hypot(x - a[0] - t * ab[0], z - a[1] - t * ab[1]))
    return best
def lash_th(psi):      # the upper lash line: thickest over the top-outer part, a short wing at the outer corner, tapering into the
    # lower rim at both corners (no step at the nasal corner, so it reads round at 3/4)
    top = (.13 * np.sin(np.clip(psi, 0, PI)) ** .7 + .06 * np.exp(-((psi - .30) / .35) ** 2)) * smooth(-.30, .15, psi) * smooth(PI + .05, PI - .55, psi)
    return .030 + top
def paint_head(U, V):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = radial_hit(d); n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); qx, qz = q[:, 0], q[:, 2]
    fr = smooth(HY + .04, HY - .08, y)
    C = ramp_colour('fur', sval(n, hi=.30))
    # the light fur: the muzzle, the lower face round the smile and chin, a soft stripe up the bridge
    rl = np.sqrt((qx / .370) ** 2 + ((qz - .235) / .275) ** 2)
    rm = np.minimum(np.sqrt((((q - np.array(MUZ[0])) / (np.array(MUZ[1]) * 1.12)) ** 2).sum(1)),
                    np.sqrt((((q - np.array(MUZB[0])) / (np.array(MUZB[1]) * 1.20)) ** 2).sum(1)))
    rj = np.sqrt((((q - np.array(JAW[0])) / (np.array(JAW[1]) * 1.12)) ** 2).sum(1))
    bridge = (1 - smooth(.055, .095, np.abs(qx) + .10 * smooth(.40, .66, qz))) * smooth(.36, .44, qz) * smooth(.70, .60, qz)
    Lm = np.maximum.reduce([1 - smooth(.88, 1.06, rl), 1 - smooth(.92, 1.10, rm), 1 - smooth(.90, 1.08, rj), .85 * bridge]) * fr
    C = mix(C, ramp_colour('lfur', sval(n, hi=.24)), Lm)
    # soft clay creases where the muzzle and jaw meet the face (fillet shading, never lines)
    qw = warped(q); dsk = smin(skull(qw), jowl_sdf(qw), K_JOWL)
    cr = .55 * crease(dsk, muz_sdf(qw), K_MUZ) + .45 * crease(smin(dsk, muz_sdf(qw), K_MUZ), ell(qw, *JAW), K_JAW)
    C = mix(C, rgb('lfurdark'), clamp(cr) * .45 * fr)
    C = mix(C, rgb('furdark'), .35 * smooth(.04, -.06, qz) * smooth(-.15, -.7, n[:, 2]))      # the under-jaw shade
    # blush: soft warm dabs on the outer cheeks under the eyes
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .62 * (1 - smooth(.15, 1.05, r)) * fr * PAINT_OPTS['blush'])
    # brows: soft darker arcs above the eyes, under the helmet band
    t_ = np.linspace(0, 1, 9)
    for s in (-1, 1):
        Pb = np.stack([s * (.150 + .215 * t_), .768 + .030 * np.sin(PI * t_ ** .8) - .022 * t_], -1)
        hb = .0105 + .010 * np.sin(PI * t_) ** .7
        near = (np.abs(qx - s * .26) < .16) & (qz > .68) & (qz < .86)
        a = np.zeros(len(x)); a[near] = stroke(qx[near], qz[near], Pb, hb, .005)
        C = mix(C, rgb('brow'), .85 * a * fr)
    # nose button: dark brown, a soft top highlight and two small nostrils
    qq = q - NOSE_C; widen = 1 + .16 * np.clip(qq[:, 2] / NHH, -1, 1)
    rn = np.sqrt((qq[:, 0] / (NHW * widen)) ** 2 + (qq[:, 1] / NHD) ** 2 + (qq[:, 2] / NHH) ** 2)
    nose_c = ramp_colour('nose', sval(n, hi=.30))
    C = mix(C, nose_c, .97 * (1 - smooth(.97, 1.18, rn)))
    rh_ = np.sqrt(((qq[:, 0] + .022) / .042) ** 2 + ((qq[:, 2] - .040) / .020) ** 2) + 9 * (qq[:, 1] > .020)
    C = mix(C, rgb('nosehi'), .85 * (1 - smooth(.50, 1.0, rh_)) * (rn < 1.12))
    for sx in (-1, 1):
        dx_ = qx - sx * .042; dz_ = qz - (NZW - .016); ca_, sa_ = math.cos(sx * .5), math.sin(sx * .5)
        rno = np.sqrt(((dx_ * ca_ + dz_ * sa_) / .021) ** 2 + ((-dx_ * sa_ + dz_ * ca_) / .010) ** 2) + 9 * (qq[:, 1] > -.010)
        C = mix(C, rgb('#24140E'), .85 * (1 - smooth(.70, 1.10, rno)))
    # the smile: a dark lip edge just outside the hole, the corner curls and the philtrum
    near_m = (np.abs(qx) < .34) & (qz > -.02) & (qz < .40) & (y < HY)
    a = np.zeros(len(x))
    if near_m.any():
        dm = poly_dist(qx[near_m], qz[near_m], MOUTH_W)
        inside_m = in_poly(np.stack([qx[near_m], qz[near_m]], -1), MOUTH_W)
        a[near_m] = np.maximum(1 - smooth(.007, .013, dm), inside_m)
    C = mix(C, rgb('lip'), .92 * a)
    for s in (-1, 1):
        Pc = np.array([[s * .252, .296], [s * .274, .312], [s * .288, .332], [s * .292, .350]])
        hc = np.array([.0062, .0060, .0050, .0035])
        nb_ = near_m & (np.abs(qx - s * .28) < .05)
        a = np.zeros(len(x))
        if nb_.any(): a[nb_] = stroke(qx[nb_], qz[nb_], Pc, hc, .004)
        C = mix(C, rgb('lip'), .88 * a)
    Pph = np.array([[0, NZW - NHH + .004], [0, .262]]); hph = np.array([.0050, .0055])
    nb_ = near_m & (np.abs(qx) < .03)
    a = np.zeros(len(x))
    if nb_.any(): a[nb_] = stroke(qx[nb_], qz[nb_], Pph, hph, .004)
    C = mix(C, rgb('lip'), .75 * a)
    # the upper lash line round the eye opening (thick, dark), a thinner soft lower rim
    for s in (-1, 1):
        sr, psi, X, Z = eye_s3(s, P)
        near_eye = fr * (sr < 1.8)
        th = lash_th(psi)
        lash = (1 - smooth(1 + th - .015, 1 + th + .015, sr))
        low = (1 - smooth(1.022, 1.050, sr))
        C = mix(C, rgb('lash'), np.maximum(lash, .80 * low) * near_eye * PAINT_OPTS['lash'])
    return C.reshape(sh + (3,))

def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .17; iz = -.10; irx = .74; irz = .86          # iris 74 % of the opening, tucked toward the nose, sitting low
    C = mix(rgb('sclera'), rgb('#EADCCF'), .55 * smooth(.40, .98, Z))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    g = smooth(.65, -.85, ez)
    I = mix(rgb('#3A2216'), rgb('eye'), smooth(0., .45, g))
    I = mix(I, rgb('#8E5A34'), .85 * smooth(.55, 1.0, g) * (1 - smooth(.80, .96, r)))    # the warm lower band
    I = mix(I, rgb('#2E1A10'), .45 * smooth(.88, 1.0, r) * smooth(-.9, .2, ez))            # a soft darker rim, lighter at the bottom
    I = I * (1 - .035 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 30 + r * 10)) * smooth(.4, .8, r))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    pz = iz + .03 * irz; R = np.sqrt(((X - ix) / (.78 * irx)) ** 2 + ((Z - pz) / (.78 * irz)) ** 2)
    C = mix(C, rgb('pupil'), 1 - smooth(.95, 1.05, R))
    # one big catchlight high on the nose side (as on the sheet), a small soft one low on the outer side
    hx = -s * .48; hz = .29
    big = np.sqrt(((X - hx) / .175) ** 2 + ((Z - hz) / .165) ** 2)
    small = np.sqrt(((X - (ix + s * .34 * irx)) / (.075 * irx)) ** 2 + ((Z - (pz - .40 * irz)) / (.070 * irz)) ** 2)
    C = mix(C, rgb('#FFFBF4'), np.maximum(1 - smooth(.92, 1.08, big), .70 * (1 - smooth(.85, 1.10, small))))
    C = mix(C, rgb('lash'), smooth(.92, 1.0, sr) * smooth(-.10, .40, Z))
    C = mix(C, rgb('#4A3028'), .55 * smooth(.95, 1.02, sr) * smooth(.0, -.40, Z))
    skin = mix(ramp_colour('fur', .42), ramp_colour('lfur', .45), smooth(.2, -.6, Z))
    return mix(C, skin, smooth(1.03, 1.07, sr))

def paint_ramp(U, V):
    rows = np.clip((V * CHARTS['ramp'][3] / 32).astype(int), 0, 15); C = np.zeros(U.shape + (3,))
    for name, k in RAMP_ROWS.items():
        m = rows == k
        if not m.any(): continue
        lo, base, hi = [rgb(c) for c in RAMPS[name]]
        u = U[m]; C[m] = np.where((u < .5)[:, None], mix(lo, base, smooth(0, .5, u)), mix(base, hi, smooth(.5, 1, u)))
    return C
def paint_furmix(U, V):
    return mix(ramp_colour('fur', U), ramp_colour('lfur', U), V)
def paint_cavity(U, V):
    C = mix(rgb('#8A3C3E'), rgb('#5E2226'), smooth(.0, .40, V))
    return mix(C, rgb('#3A1418'), smooth(.55, 1., V))
PAINTERS = {'head': paint_head, 'eye.L': lambda U, V: paint_eye(U, V, 1), 'eye.R': lambda U, V: paint_eye(U, V, -1),
            'ramp': paint_ramp, 'furmix': paint_furmix, 'cavity': paint_cavity}
PAINTERS.update(HEAD_PAINTERS); PAINTERS.update(BODY_PAINTERS)
atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [196, 122, 58, 255]
for name, (x0, y0, w, h) in CHARTS.items():
    if name not in PAINTERS: continue
    print('PAINT', name, flush=True)
    if name == 'ramp':
        U, V = np.meshgrid(clamp((np.arange(w) - 8) / (w - 16)), (np.arange(h) + .5) / h)
    elif name == 'furmix':
        U, V = np.meshgrid(clamp((np.arange(w) - 8) / (w - 16)), clamp((np.arange(h) - 8) / (h - 16)))
    else:
        U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
    block = np.empty((h, w, 3))
    for r0 in range(0, h, 64):
        block[r0:r0 + 64] = PAINTERS[name](U[r0:r0 + 64], V[r0:r0 + 64])
    atlas[y0:y0 + h, x0:x0 + w, :3] = np.round(clamp(block) * 255).astype(np.uint8)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
def write_png(path, arr):
    h_, w_ = arr.shape[:2]; raw = b''.join(b'\x00' + r.tobytes() for r in arr[::-1])
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w_, h_, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
atlas_path = os.path.join(ROOT, 'scratch', 'head_atlas.png') if HEAD_ONLY else (os.path.join(ROOT, 'scratch', 'rig_base_atlas.png') if RIG else os.path.join(ROOT, 'golden-toy_atlas.png'))
write_png(atlas_path, atlas)
del atlas
img = bpy.data.images.load(atlas_path); img.name = 'Golden_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Golden_toy_atlas'); MAT.use_nodes = True
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
for zw in (.0, .05, .10, .20, .29, .40, .54, .65):
    xs_ = np.linspace(0, .7, 351)
    ys_ = front_local(xs_, np.full(len(xs_), zw), head_local); ok = np.isfinite(ys_)
    cheek_rows['%.2f' % zw] = round(float(2 * xs_[ok].max()), 3) if ok.any() else None
MEAS = {'units': 'W = %.3f m head width; z = above the chin in W; profile b = behind the nose tip in W' % W,
        'chin_z_m': CHIN, 'crown_m': LOG['crown_m'], 'skull_height_W': round((LOG['crown_m'] - CHIN) / W, 3),
        'face_width_rows_W(z: width)': cheek_rows,
        'nose_tip_y_m': round(float(nose_tip_y), 4),
        'profile_b(z)': {'%.3f' % zw: prof_at(zw) for zw in (.05, .10, .20, .30, .37, .45, .55, .65, .75)},
        'eye_opening_W': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'eye_centre_W': [EXW, EZW], 'iris_bottom_W': round(EZW - EHHW, 3),
        'nose_centre_z_W': NZW, 'nose_top_z_W': round(NZW + NHH, 3), 'nose_width_W(top)': round(2 * NHW * 1.16, 3), 'nose_height_W': 2 * NHH,
        'mouth_top_centre_W': round(float(MOUTH_W[np.abs(MOUTH_W[:, 0]) < .03][:, 1].max()), 3),
        'mouth_width_W': round(float(np.ptp(MOUTH_W[:, 0])), 3), 'mouth_z_range_W': [round(float(MOUTH_W[:, 1].min()), 3), round(float(MOUTH_W[:, 1].max()), 3)]}
for tag in ('L', 'R'):
    if 'ear.' + tag in parts:
        ev = all_verts(parts['ear.' + tag])
        MEAS['ear_' + tag] = {'x_min_W': round(float(ev[:, 0].min() / W), 3), 'x_max_W': round(float(ev[:, 0].max() / W), 3),
                              'y_min_W': round(float((ev[:, 1].min() - HY) / W), 3), 'y_max_W': round(float((ev[:, 1].max() - HY) / W), 3),
                              'z_min_W': round(float((ev[:, 2].min() - CHIN) / W), 3), 'z_min_m': round(float(ev[:, 2].min()), 3)}
        sel = {zz: np.abs((ev[:, 2] - CHIN) / W - zz) < .03 for zz in (.6, .45, .3, .12, -.05)}
        MEAS['ear_' + tag]['outer_x_W_at_z'] = {('%.2f' % zz): round(float(np.abs(ev[m][:, 0]).max() / W), 3) for zz, m in sel.items() if m.any()}
MEAS.update(LOG)
MEAS.update(BODY_MEAS)

# ============================================================== JOIN, CLEAN, NORMALS
objects = []; part_tri = {}
PIVOTS = {'head': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'], 'helm': tuple(O), 'tongue': tuple(TONGUE_C),
          'ear.L': tuple(ear_info['L']['base']), 'ear.R': tuple(ear_info['R']['base'])}
PIVOTS.update(BODY_PIVOTS)
OBJ_TRIS = {}
for group, obs in parts.items():
    for ob in obs: ob.data.calc_loop_triangles(); OBJ_TRIS[ob.name] = len(ob.data.loop_triangles)
print('OBJ_TRIS', json.dumps(dict(sorted(OBJ_TRIS.items(), key=lambda kv: -kv[1])[:60])), flush=True)
OBJ_NAMES = {}
def finish_group(obs, name, pivot, mat):
    for ob in obs:
        ob.data.materials.clear(); ob.data.materials.append(mat)
        if RIG:
            vg = ob.vertex_groups.new(name='_part_' + ob.name); vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs: ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1: bpy.ops.object.join()
    ob = bpy.context.object; ob.name = name; ob.data.name = ob.name
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
    bpy.context.scene.cursor.location = pivot; bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); assert np.isfinite(co).all(), 'Nonfinite position'
    for p in me.polygons: assert all(math.isfinite(c) for c in p.normal) and p.normal.length > .5, ('Bad normal', ob.name, p.index)
    ob['front_axis'] = '-Y'; ob['units'] = 'metres'
    me.calc_loop_triangles()
    return ob
for group, obs in parts.items():
    if group.startswith('prop_'): continue
    ob = finish_group(obs, OBJ_NAMES.get(group, 'Golden_' + group.replace('.', '_')), PIVOTS.get(group, (0, 0, 0)), MAT)
    ob['phase'] = '1: neutral A-pose, no armature'
    part_tri[ob.name] = len(ob.data.loop_triangles); objects.append(ob)
tri_count = sum(part_tri.values()); print('PART_TRIANGLES', json.dumps(part_tri), flush=True)
HEADSET = sum(v for k, v in part_tri.items() if k in ('Golden_head', 'Golden_eye_L', 'Golden_eye_R', 'Golden_ear_L', 'Golden_ear_R', 'Golden_helm', 'Golden_tongue'))
MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count; MEAS['head_eyes_ears_helm_tongue_triangles'] = HEADSET
if RIG:
    pass
elif not HEAD_ONLY:
    if not os.environ.get('GOLDEN_NO_BUDGET'): assert tri_count <= 30000, ('Triangle budget', tri_count)
    if POST_JOIN: POST_JOIN()
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-head.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
if not RIG: print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not HEAD_ONLY and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'golden-toy.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG:
    bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                              export_animations=False)
print('GOLDEN_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)

# ============================================================== THE WEAPON PROPS (separate GLBs, a small 512 prop atlas)
# Both lie along Blender +Z (the tip up; the game's +Y), pivot (origin) at the main grip.
if not HEAD_ONLY and not RIG:
    print('STEP props', flush=True)
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)
    parts.clear()
    PCH = {'pramp': (0, 0, 512, 256), 'rope': (0, 256, 256, 256), 'ball': (256, 256, 256, 256)}
    PRAMPS = ['rope', 'tan', 'brass', 'emer', 'ball', 'white', 'leather', 'emerdeep']
    def pramp_uv(name, val):
        x, y, w, h = PCH['pramp']; val = clamp(np.asarray(val, float)); k = PRAMPS.index(name)
        return np.stack([(x + 8 + val * (w - 16)) / 512, np.full(val.shape, (y + k * 32 + 16) / 512)], -1)
    def pau(chart, u, v):
        x, y, w, h = PCH[chart]; g = 4
        return np.stack([(x + g + np.asarray(u) * (w - 2 * g)) / 512, (y + g + np.asarray(v) * (h - 2 * g)) / 512], -1)
    def p_sw(name, hi=.30, add=0.):
        return lambda NV, tt, uu, V: pramp_uv(name, sval(NV, hi=hi) + add)
    def rope_shaft(name, s0, s1, r, group, twist=.075, nside=10, per_m=56):
        """a 3-strand braided rope tube along +Z: helical strand bulges, analytic-ish normals from the grid"""
        nr = max(8, int((s1 - s0) * per_m)); zz = np.linspace(s0, s1, nr); th = np.linspace(0, 2 * PI, nside, endpoint=False)
        Z_, T_ = np.meshgrid(zz, th, indexing='ij')
        ph = 3 * T_ - 2 * PI * Z_ / twist
        rr = r * (1 + .13 * np.cos(ph) - .06 * np.cos(2 * ph))
        P = np.stack([rr * np.cos(T_), rr * np.sin(T_), Z_], -1)
        Pw = np.concatenate([P, P[:, :1]], 1)
        dT = np.roll(P, -1, 1) - np.roll(P, 1, 1); dZ = np.gradient(P, axis=0)
        N = unit(np.cross(dT, dZ)); N = np.where(((N * np.stack([np.cos(T_), np.sin(T_), 0 * T_], -1)).sum(-1) < 0)[..., None], -N, N)
        Nw = np.concatenate([N, N[:, :1]], 1)
        U_ = np.concatenate([T_ / (2 * PI), np.ones((nr, 1))], 1); V_ = np.repeat(((Z_[:, 0] - s0) / .25 % 1.0)[:, None], nside + 1, 1)
        # rope UVs: u round, v along with the twist phase so the strands paint as cream / tan helices
        phase = (3 * np.concatenate([T_, np.full((nr, 1), 2 * PI)], 1) - 2 * PI * np.repeat(Z_[:, :1], nside + 1, 1) / twist) / (2 * PI)
        shade = sval(Nw.reshape(-1, 3), hi=.28)
        uv = pau('rope', clamp(shade.reshape(nr, nside + 1)), (phase % 1.0))
        return make_obj(name, Pw.reshape(-1, 3), grid_faces(nr, nside + 1), uv.reshape(-1, 2), group, N=Nw.reshape(-1, 3))
    def paint_rope(U, V):
        # U = painted shade, V = strand phase: three strands (cream, tan, cream) with a soft groove between
        f = (V * 3) % 1.0; strand = np.floor(V * 3) % 3
        C = np.where((strand == 1)[..., None], ramp_colour('tan', U), ramp_colour('rope', U))
        groove = np.exp(-(((f - .5) * 2) ** 2 - 1) ** 2 / .02) * 0 + smooth(.12, .0, np.minimum(f, 1 - f))
        return mix(C, ramp_colour('tan', U - .25), .65 * groove)
    def paint_ball(U, V):
        # a tennis ball: U, V = the octahedral-ish lat-long of the ball; the classic seam = a white curve
        lon = (U - .5) * 2 * PI; lat = (V - .5) * PI
        d = np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], -1)
        n = unit(d); C = ramp_colour('ball', sval(n, hi=.30))
        # seam: points where z = 0.45 sin(2 lon) on the sphere (a baseball-like curve)
        seam = np.abs(d[..., 2] - .62 * np.sin(2 * lon) * np.cos(lat) ** 1.0 * .75)
        fuzz = .03 * np.sin(lon * 40) * np.sin(lat * 40)
        C = C * (1 + fuzz[..., None])
        return mix(C, rgb('#F2EEDC'), 1 - smooth(.035, .060, seam))
    def ball(name, c, r, group, n=7):
        def uvf(NV, V, DL):
            q = unit(V - c); lon = np.arctan2(q[:, 1], q[:, 0]); lat = np.arcsin(np.clip(q[:, 2], -1, 1))
            return pau('ball', lon / (2 * PI) + .5, lat / PI + .5)
        return lobe(name, c, np.array([r, r, r]), [0, 0, 1.], group, n=n, squash=0, uvfn=uvf, pole=[1., 0, 0])

    # ---------------------------------------------------------------- the Toy Lance (1.60 m)
    LANCE_L = 1.60; S_MAIN = .360; S_OFF = .800
    def Ls(s): return s - S_MAIN                                    # lance station -> z (the pivot at the main grip)
    ball('tennis_ball_pommel', np.array([0, 0, Ls(.058)]), .058, 'prop_lance')
    sweep('brass_pommel_ferrule', np.array([[0, 0, Ls(s)] for s in np.linspace(.108, .150, 4)]), lambda k: (.031 - .003 * (k == 0), .031 - .003 * (k == 0)),
          'prop_lance', p_sw('brass', add=.02), sides=16, normals=np.tile([1., 0, 0], (4, 1)))
    rope_shaft('braided_rope_shaft', Ls(.140), Ls(1.130), .022, 'prop_lance')
    for k, s in enumerate((.36, .62, .88)):
        sweep('tan_rope_wrap.%d' % k, np.array([[0, 0, Ls(s + d)] for d in np.linspace(-.024, .024, 4)]), lambda j: (.0275, .0275), 'prop_lance', p_sw('tan', hi=.26),
              sides=16, normals=np.tile([1., 0, 0], (4, 1)), p=.85)
    sweep('brass_lance_collar', np.array([[0, 0, Ls(s)] for s in np.linspace(1.115, 1.215, 6)]), lambda k: (.032 + .006 * math.sin(PI * k / 5), .032 + .006 * math.sin(PI * k / 5)),
          'prop_lance', p_sw('brass', add=.03), sides=18, normals=np.tile([1., 0, 0], (6, 1)))
    ra = np.linspace(0, 2 * PI, 28, endpoint=False)
    for k, (s, r0) in enumerate(((1.150, .052), (1.212, .046))):
        lobe('brass_guard_disc.%d' % k, np.array([0, 0, Ls(s)]), np.array([.010, r0, r0]), [0, 0, 1.], 'prop_lance', ramp='brass', n=4, occ_in=0, squash=0, pole=[1., 0, 0],
             uvfn=lambda NV, V, DL: pramp_uv('brass', sval(NV, hi=.32) + .03))
    # the plush felt dragon-wing guard: four rounded felt wings fanning back from the collar
    for k in range(4):
        ang = PI / 4 + k * PI / 2; out = np.array([math.cos(ang), math.sin(ang), 0])
        c_ = np.array([0, 0, Ls(1.175)]) + out * .060 + np.array([0, 0, -.022])
        ax_ = unit(out * .80 + np.array([0, 0, -.60]))
        def wing_sdf(p, c_=c_, ax_=ax_, out=out):
            side_ = unit(np.cross(ax_, [0, 0, 1.]))
            q = p - c_; a = q @ ax_; b = q @ side_; t = q @ unit(np.cross(side_, ax_))
            taper = 1 - .55 * smooth(-.02, .07, a)
            scallop = 1 + .10 * np.cos(np.arctan2(b, a + .05) * 6)
            return ell(np.stack([a, b / np.maximum(taper * scallop, .2), t], -1), [0, 0, 0], [.068, .040, .013])
        star_mesh('felt_wing_guard.%d' % k, wing_sdf, c_, 'prop_lance', lambda NN, V: pramp_uv('emer', sval(NN, hi=.32) + .02), nth=9, nph=16, tmax=.12, axis=ax_, ref=[0, 0, 1.])
    # the rubber dragon-flame spearhead: a pillowed flame blade with two flame licks per side
    HALF = [(0, .340), (.018, .300), (.036, .252), (.050, .205), (.058, .178), (.084, .160), (.104, .125), (.084, .128), (.062, .118),
            (.066, .098), (.090, .072), (.100, .036), (.076, .048), (.052, .040), (.032, .020), (.024, .000)]
    Ln = np.array(HALF + [(-x, z) for x, z in HALF[::-1][1:-1]])
    seg = np.linalg.norm(np.roll(Ln, -1, 0) - Ln, axis=1); s_ = np.concatenate([[0], np.cumsum(seg)])
    tt_ = np.linspace(0, s_[-1], 84, endpoint=False); Lc = np.concatenate([Ln, Ln[:1]])
    OUT2 = np.stack([np.interp(tt_, s_, Lc[:, 0]), np.interp(tt_, s_, Lc[:, 1])], -1)
    for _ in range(2): OUT2 = .25 * np.roll(OUT2, 1, 0) + .5 * OUT2 + .25 * np.roll(OUT2, -1, 0)
    gx_, gz_ = np.meshgrid(np.linspace(-.11, .11, 15), np.linspace(.0, .34, 23)); G2 = np.stack([gx_.ravel(), gz_.ravel()], -1)
    def pdist(P2):
        best = np.full(len(P2), 9.)
        for i in range(len(OUT2)):
            a = OUT2[i]; b = OUT2[(i + 1) % len(OUT2)]; ab = b - a; t = np.clip(((P2 - a) @ ab) / (ab @ ab), 0, 1)
            best = np.minimum(best, np.linalg.norm(P2 - a - t[:, None] * ab, axis=1))
        return best
    inside = in_poly(G2, OUT2) & (pdist(G2) > .006)
    pts2 = np.concatenate([OUT2, G2[inside]])
    cons2 = [(i, (i + 1) % len(OUT2)) for i in range(len(OUT2))]
    res = delaunay_2d_cdt([Vector(p) for p in pts2], cons2, [], 0, 1e-9)
    V2 = np.array([[v.x, v.y] for v in res[0]]); F2 = [list(f) for f in res[2]]
    cent = V2[np.array(F2)].mean(1); F2 = [f for f, c in zip(F2, cent) if in_poly(c[None], OUT2)[0]]
    dd = pdist(V2)
    def h_of(P2):
        dist = pdist(P2); ridge = np.exp(-(P2[:, 0] / .016) ** 2) * smooth(.30, .10, P2[:, 1]) * .004
        return .004 + .013 * clamp(dist / .030) ** .6 + ridge
    H = h_of(V2)
    e = 1e-3
    hx = (h_of(V2 + [e, 0]) - h_of(V2 - [e, 0])) / (2 * e); hz = (h_of(V2 + [0, e]) - h_of(V2 - [0, e])) / (2 * e)
    BASE_S = 1.255
    Vb = np.stack([V2[:, 0], np.zeros(len(V2)), Ls(BASE_S) + V2[:, 1]], -1)
    Nb = np.tile([0, -1., 0], (len(V2), 1))
    No = unit(np.stack([hx, -np.ones(len(V2)), hz], -1)); Ni = unit(np.stack([hx, np.ones(len(V2)), hz], -1))
    ridge = np.exp(-(V2[:, 0] / .020) ** 2) * smooth(.32, .05, V2[:, 1])
    uvb = pramp_uv('emer', sval(No, hi=.30) + .22 * ridge)
    Vt, Ft, UVt, Nt = thicken(Vb, [tuple(f) for f in F2], Nb, 2 * H, uvb, pramp_uv('emer', sval(Ni, hi=.30) + .22 * ridge), uvb, rim=4, No=No, Ni=Ni)
    make_obj('rubber_flame_spearhead', Vt, Ft, UVt, 'prop_lance', N=Nt)
    sweep('brass_spear_socket', np.array([[0, 0, Ls(s)] for s in np.linspace(1.210, 1.275, 4)]), lambda k: (.026 - .004 * k / 3, .026 - .004 * k / 3), 'prop_lance',
          p_sw('brass', add=.03), sides=14, normals=np.tile([1., 0, 0], (4, 1)))

    # ---------------------------------------------------------------- the javelin (a chunky squeaky toy dart, 0.72 m)
    JAV_L = .72; J_GRIP = .330
    def Js(s): return s - J_GRIP
    ball('brass_rubber_tip', np.array([0, 0, Js(.680)]), .034, 'prop_jav') if False else \
        lobe('brass_rubber_tip', np.array([0, 0, Js(.684)]), np.array([.036, .036, .036]), [0, 0, 1.], 'prop_jav', ramp='brass', n=6, squash=0, occ_in=0,
             uvfn=lambda NV, V, DL: pramp_uv('brass', sval(NV, hi=.34) + .04))
    sweep('brass_tip_ferrule', np.array([[0, 0, Js(s)] for s in np.linspace(.615, .655, 4)]), lambda k: (.022 + .004 * k / 3, .022 + .004 * k / 3), 'prop_jav',
          p_sw('brass', add=.02), sides=14, normals=np.tile([1., 0, 0], (4, 1)))
    rope_shaft('chunky_rope_shaft', Js(.050), Js(.625), .018, 'prop_jav', twist=.065)
    sweep('tan_end_cap', np.array([[0, 0, Js(s)] for s in np.linspace(.020, .060, 4)]), lambda k: (.022, .022), 'prop_jav', p_sw('tan'), sides=14,
          normals=np.tile([1., 0, 0], (4, 1)))
    for k in range(3):
        ang = PI / 2 + k * 2 * PI / 3; out = np.array([math.cos(ang), math.sin(ang), 0])
        c_ = np.array([0, 0, Js(.150)]) + out * .040
        def vane_sdf(p, c_=c_, out=out):
            side_ = unit(np.cross(out, [0, 0, 1.])); q = p - c_; a = q[:, 2]; b = q @ out; t = q @ side_
            # an arrow-fletching felt vane: tall at the back, sweeping down to the shaft at the front
            top = .040 * smooth(.085, -.07, a) + .008
            return np.maximum(ell(np.stack([a, b - top * .1, t], -1), [0, 0, 0], [.085, .046, .012]), b - top - .004)
        star_mesh('felt_fletching.%d' % k, vane_sdf, c_ + np.array([0, 0, 0]) + out * -.010, 'prop_jav', lambda NN, V: pramp_uv('emer', sval(NN, hi=.32) + .02), nth=10, nph=18, tmax=.12, axis=[0, 0, 1.], ref=out)

    # ---------------------------------------------------------------- paint, materials, export
    patlas = np.empty((512, 512, 4), np.uint8); patlas[:] = [232, 210, 168, 255]
    for nm, (x0, y0, w, h) in PCH.items():
        if nm == 'pramp':
            Uu, Vv = np.meshgrid(clamp((np.arange(w) - 8) / (w - 16)), (np.arange(h) + .5) / h)
            rows_ = np.clip((Vv * h / 32).astype(int), 0, len(PRAMPS) - 1); C = np.zeros((h, w, 3))
            for k, nm2 in enumerate(PRAMPS):
                m = rows_ == k; C[m] = ramp_colour(nm2, Uu[m])
        else:
            Uu, Vv = np.meshgrid(clamp((np.arange(w) - 4) / (w - 8)), clamp((np.arange(h) - 4) / (h - 8)))
            C = paint_rope(Uu, Vv) if nm == 'rope' else paint_ball(Uu, Vv)
        patlas[y0:y0 + h, x0:x0 + w, :3] = np.round(clamp(C) * 255).astype(np.uint8)
    ppath = os.path.join(ROOT, 'golden-props_atlas.png'); write_png(ppath, patlas)
    pimg = bpy.data.images.load(ppath); pimg.name = 'Golden_props_atlas_512'; pimg.pack()
    PMAT = bpy.data.materials.new('Golden_props'); PMAT.use_nodes = True
    pb = PMAT.node_tree.nodes.get('Principled BSDF'); pb.inputs['Roughness'].default_value = .8; pb.inputs['Metallic'].default_value = 0
    pb.inputs['Specular IOR Level'].default_value = .25
    ptx = PMAT.node_tree.nodes.new('ShaderNodeTexImage'); ptx.image = pimg; ptx.interpolation = 'Linear'
    PMAT.node_tree.links.new(ptx.outputs['Color'], pb.inputs['Base Color'])
    PROP_STATS = {}
    for grp, nm, out_path in (('prop_lance', 'golden_lance', MODELS + '/golden-lance.glb'), ('prop_jav', 'golden_javelin', MODELS + '/golden-javelin.glb')):
        obp = finish_group(parts[grp], nm, (0, 0, 0), PMAT)
        PROP_STATS[nm] = {'triangles': len(obp.data.loop_triangles),
                          'z_range_m': [round(min(v.co.z for v in obp.data.vertices), 4), round(max(v.co.z for v in obp.data.vertices), 4)],
                          'max_radius_m': round(max(math.hypot(v.co.x, v.co.y) for v in obp.data.vertices), 4)}
        bpy.ops.object.select_all(action='DESELECT'); obp.select_set(True); bpy.context.view_layer.objects.active = obp
        bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                                  export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False, export_animations=False)
    def gm(v): return [round(float(v[0]), 4), round(float(v[2]), 4), round(float(-v[1]), 4)]     # Blender -> game axes
    MOUNT = {'units': 'metres. Blender Z-up / front -Y; game axes = (x, z, -y). Each prop lies along its local +Z (game +Y), the tip at +Z.',
             'golden-lance.glb': {'pivot': 'the main (rear) grip, the origin', 'length_m': LANCE_L, 'axis_blender': [0, 0, 1], 'axis_game': [0, 1, 0],
                                  'main_grip': [0, 0, 0], 'off_hand_grip_blender': [0, 0, round(S_OFF - S_MAIN, 4)], 'off_hand_grip_game': gm([0, 0, S_OFF - S_MAIN]),
                                  'tip_blender': [0, 0, round(LANCE_L - S_MAIN, 4)], 'pommel_end_blender': [0, 0, round(-S_MAIN, 4)],
                                  'grip_radius_m': .022, 'note': 'shaft = braided rope r 0.022 m; the main grip sits 0.36 m above the pommel end, the off-hand grip 0.44 m further up'},
             'golden-javelin.glb': {'pivot': 'the throwing grip, the origin', 'length_m': JAV_L, 'axis_blender': [0, 0, 1], 'axis_game': [0, 1, 0],
                                    'grip': [0, 0, 0], 'tip_blender': [0, 0, round(.72 - J_GRIP, 4)], 'tail_end_blender': [0, 0, round(.020 - J_GRIP, 4)], 'grip_radius_m': .018},
             'stats': PROP_STATS}
    with open(os.path.join(ROOT, 'prop_mount.json'), 'w', encoding='utf-8') as f: json.dump(MOUNT, f, indent=2)
    print('PROPS_DONE', json.dumps(PROP_STATS), flush=True)
