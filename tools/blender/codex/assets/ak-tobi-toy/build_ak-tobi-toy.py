"""Tobi, Ochiyo's apprentice in Akane Hamlet (a zone villager, VL-2), a young dog, Toybox line: phase 1, the model in a neutral A-pose
(refs/sheet.png "Tobi - Apprentice", approved by the director). Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_ak-tobi-toy.py [-- --head-only]
    python build_ak-tobi-toy.py --tune          (plain Python: prints the head field's profile / widths, then stops)

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/ak-tobi-toy.glb (--head-only writes scratch/ instead).

Assembled by src/assemble.py from src/p*.py. The machinery is Master Kazemaru's (tools/blender/codex/assets/tk-kazemaru-toy, itself the
Kitsune build's), re-measured and re-dressed for Tobi.

Technique:
- The head is ONE smooth implicit field: a round mochi skull, a rounded dog snout (the cream muzzle), a soft chin and a rounded dark nose.
  No eye sockets: the face stays convex. The skin is the field's zero surface reached by radial projection (CDT in a stereographic
  domain, with edge loops round the eyelids, nose and mouth), so every vertex carries its analytic normal.
- The mouth is SCULPTED (a soft groove along the small "w" smile) with a painted line, and the skin is cut along it (rig-ready).
- The eyes are separate lens globes following the ball, facing 30 deg outward; brown irises tucked toward the nose.
- The ears are big floppy dog ears: thick rounded paddles lofted from a root on the crown (above the headband) down over the band and the
  head's sides to a fat round lobe at cheek level, with bend rings, painted in their own chart.
- The white headband is a thick soft ring hugging the head (higher at the front), with a soft square knot pad at the back.
- The blue gi top, its skirt below the obi and the short wide sleeves are lofted and thickened shells; the lapels are sweeps (his left
  over his right) over a cream chest V; the red obi is a soft ring with a rounded knot pad at the back; the dark trousers are two puffy
  thickened legs gathered over the feet.
- The tail is a short thick curl, a separate piece with bend rings.
- One 2048 painted atlas: face, eyes, ears and tail painted from their own coordinates, 2-D shade x tone charts and 1-D ramps.
"""
import math, json, os, sys, struct, zlib
import numpy as np
TUNE = '--tune' in sys.argv and 'bpy' not in sys.modules
if not TUNE:
    import bpy, bmesh
    from mathutils import Vector, Matrix
    from mathutils.geometry import delaunay_2d_cdt
    from mathutils.kdtree import KDTree

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HEAD_ONLY = '--head-only' in ARGV
RIG = bool(globals().get('RIG_MODE'))
MODELS = 'D:/projects/chewy-life-3d/public/models'
MODEL = MODELS + '/ak-tobi-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'tobi-head-test.glb') if HEAD_ONLY else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(29)
if not TUNE: bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
# ---- proportions, measured on refs/sheet.png (measure.md): the front turnaround's crown is at sheet y 87, the chin at 266, the ground
# at 496.5 (409.5 px = 0.97 m, 2.369 mm / px); the head is 213 px wide at the cheeks (W = 0.505 m). The turnaround draws the head 0.84 W
# tall, the close-up 0.855 W: the model takes 0.85 W. The face features come from the close-up (W = 275 px, chin y 784, centre x 216).
T_CROWN = 0.970                 # the crown (the sheet's 0.97 m)
W = 0.505                       # head width at the cheeks
CROWN_W = .850                  # skull top above the chin, in W
CHIN = round(T_CROWN - CROWN_W * W, 4); HY = .039          # the head centre sits 3.9 cm behind the body axis (side view)
LOG = {'T_CROWN': T_CROWN, 'W': W, 'CHIN': CHIN}

PAL = {'fur': '#E6BC88', 'furlight': '#F2CEA0', 'furdark': '#C8965E',
       'white': '#FCEBD8', 'whitelight': '#FFF4E8', 'whitedark': '#E8CCAE',
       'gi': '#4A6A8A', 'gilight': '#5C7EA0', 'gidark': '#3A5472',
       'hakama': '#34465A', 'hakamalight': '#44586E', 'hakamadark': '#27364A',
       'belt': '#D8503A', 'beltlight': '#EA6A52', 'beltdark': '#B43E2C',
       'band': '#FFF8F2', 'bandlight': '#FFFBF7', 'banddark': '#E4DAD2',
       'ear': '#E2B680', 'earlight': '#F0CA98', 'eardark': '#C08E58',
       'nose': '#3A2A26', 'nosehi': '#6E5650', 'nosedark': '#2C201C',
       'iris': '#5A3A2A', 'irisdark': '#2E1A12', 'irisglow': '#8A5A3E', 'pupil': '#2A1A16',
       'sclera': '#FFF8F2', 'lash': '#2E2220', 'brow': '#5A3A2A', 'blush': '#F0A8A0', 'mouth': '#3A2A26', 'dark': '#2A2230'}
CHARTS = {'head': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'furmix': (1280, 896, 256, 256), 'kimmix': (1536, 896, 256, 256),
          'skmix': (1792, 896, 256, 256), 'ear': (0, 0, 768, 768)}
if RIG:
    CHARTS.update({'lidU': (1536, 0, 512, 192), 'lidD': (1536, 192, 512, 128), 'cavity': (1536, 320, 128, 128), 'tongue': (1664, 320, 128, 128),
                   'lidUR': (768, 0, 512, 192), 'lidDR': (768, 192, 512, 128)})          # (the R lids get their own charts: the lid paint per side)
PAINT_OPTS = {'lash': False, 'blush': True}          # (the upper lash is a 3-D roll, Tobi_lash_L/R, never paint on the skin)
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'white': ('whitedark', 'white', 'whitelight'),
         'gi': ('gidark', 'gi', 'gilight'), 'hakama': ('hakamadark', 'hakama', 'hakamalight'),
         'belt': ('beltdark', 'belt', 'beltlight'), 'band': ('banddark', 'band', 'bandlight'),
         'nose': ('nosedark', 'nose', '#4E3A34'), 'eyedark': ('#1C1210', '#2A1C18', '#463028'),
         'lining': ('#2C4058', '#34496A', '#3E5574'), 'ear': ('eardark', 'ear', 'earlight'), 'hklining': ('#1E2A3A', '#26344A', '#2E3E54')}
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

def thicken(V, F, N, t, UVo, UVi, UVrim, rim=4, plain=None, No=None, Ni=None, split_front=False):
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
        if split_front:      # the rim starts on its own copy of the front edge vertex (its own UV: no chart smear across the rim)
            extra.append(V[v] + N[v] * t[v] / 2); extra_n.append(N[v]); extra_uv.append(UVrim[v] if np.ndim(UVrim) > 1 else UVrim)
            ids = [base + len(extra) - 1]
        for k in range(1, rim):
            th = PI * k / rim; nn = math.cos(th) * N[v] + math.sin(th) * out[v]
            extra.append(V[v] + nn * t[v] / 2); extra_n.append(nn); extra_uv.append(UVrim[v] if np.ndim(UVrim) > 1 else UVrim)
            ids.append(base + len(extra) - 1)
        if split_front:      # ... and ends on its own copy of the back edge vertex (the rim never samples across the atlas)
            extra.append(V[v] - N[v] * t[v] / 2); extra_n.append(-N[v]); extra_uv.append(UVrim[v] if np.ndim(UVrim) > 1 else UVrim)
            ids.append(base + len(extra) - 1)
        else:
            ids.append(n + v)
        ringidx[v] = ids
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


# ============================================================== the head field (W units, z above the chin, y from HY)
# Targets (measure.md; W units; z above the chin with the head 0.85 W tall; y from the head centre, which sits 0.039 m behind the body axis):
#   front half-widths z 0.015: 0.389, 0.051: 0.442, 0.088: 0.475, 0.124: 0.50 (higher up the ears hide the sides); the dome to 0.85;
#   profile (front) z 0.69: ~-0.35 (under the band), 0.60: -0.40, 0.554: -0.42, 0.507: -0.434, 0.46: -0.448, 0.37..0.41: -0.455;
#   the snout: the nose tip -0.589 at z ~0.28, the muzzle -0.575 at 0.20, -0.56 at 0.155, -0.549 at 0.108, -0.535 at 0.085, -0.516 at 0.061,
#   -0.488 at 0.038, -0.446 at 0.014; (back) +0.455 at z 0.3..0.5, 0.425 at 0.178, 0.387 at 0.108, 0.345 at 0.061, 0.26 at 0.014.
SK = dict(a=.506, zc=.290, cu=.560, cd=.330, n=2.45, n_bot=3.1, n_top=2.25, bf=.462, bb=.455, t0=.46, t1=.72, m=2.10, m_top=2.20)
def skull(q):
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    zr = z - SK['zc']; c = np.where(zr > 0, SK['cu'], SK['cd'])
    a = SK['a']
    n = np.where(zr > 0, SK['n'] + (SK['n_top'] - SK['n']) * smooth(SK['t0'], SK['t1'], z), SK['n'] + (SK['n_bot'] - SK['n']) * smooth(0, -.25, zr))
    ax_ = np.abs(x) / a + 1e-9; az_ = np.abs(zr) / c + 1e-9
    s = (ax_ ** n + az_ ** n) ** (1 / n)
    b = np.where(y < 0, SK['bf'], SK['bb']); ay_ = np.abs(y) / b + 1e-9
    mm = SK['m'] + (SK['m_top'] - SK['m']) * smooth(SK['t0'], SK['t1'], z)
    r = (s ** mm + ay_ ** mm) ** (1 / mm) + 1e-12
    kk = s ** (1 - n); gx = kk * ax_ ** (n - 1) / a; gz = kk * az_ ** (n - 1) / c
    gs = (s / r) ** (mm - 1); gy = (ay_ / r) ** (mm - 1) / b
    g = np.sqrt(gs * gs * (gx * gx + gz * gz) + gy * gy) + 1e-9
    return (r - 1) / g

def front_local(x, z, f):
    """first surface hit marching from the front (-y) at (x, z), W units, vectorised"""
    x = np.atleast_1d(np.asarray(x, float)); z = np.atleast_1d(np.asarray(z, float)); n = len(x)
    ys = np.linspace(-.85, .30, 320)
    P = np.stack([np.repeat(x[:, None], len(ys), 1), np.broadcast_to(ys, (n, len(ys))), np.repeat(z[:, None], len(ys), 1)], -1).reshape(-1, 3)
    ins = (f(P) < 0).reshape(n, len(ys)); i = np.argmax(ins, 1); ok = ins[np.arange(n), i]
    lo = ys[np.maximum(i - 1, 0)]; hi = ys[i]
    for _ in range(26):
        m = (lo + hi) / 2; inn = f(np.stack([x, m, z], -1)) < 0
        hi = np.where(inn, m, hi); lo = np.where(inn, lo, m)
    return np.where(ok, (lo + hi) / 2, np.nan)

def mirror(q):
    qa = np.array(q, float, copy=True); qa[..., 0] = np.abs(qa[..., 0]); return qa
# the rounded dog snout (the cream muzzle: in profile it projects 0.13 W past the face), a soft chin under it and the neck under the collar
CHEEK = [[0, -.040, .200], [.470, .380, .200]]; K_CHEEK = .100
MUZ = [[0, -.395, .178], [.212, .180, .165]]; K_MUZ = .070
CHINB = [[0, -.300, .075], [.205, .150, .085]]; K_CHINB = .060
NECK = [[0, -.020, -.080], [.180, .155, .120]]; K_NECK = .060
def muz_sdf(q): return ell(q, *MUZ)
def base_local(q):
    d = skull(q)
    d = smin(d, ell(q, *CHEEK), K_CHEEK)
    d = smin(d, muz_sdf(q), K_MUZ); d = smin(d, ell(q, *CHINB), K_CHINB)
    return d + jaw_trim(q)
JAW = dict(side=.000, under=.020, z1=.060)
def jaw_trim(q):
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    low = 1 - smoother(.005, JAW['z1'], z)
    side = JAW['side'] * low * smooth(.10, .36, np.abs(x))
    under = JAW['under'] * (1 - smoother(-.08, .03, z)) * smooth(-.36, -.16, y)
    return side + under

# eye layout (W units; the head close-up): centres +-0.238 W at 0.349 W above the chin; the opening (inside the lash) 0.214 x 0.207 W, round
# (a superellipse a little flatter on top). No socket: the eyes sit on the ball's own curve.
EXW, EZW, EHWW, EHHW, EN = .238, .349, .107, .1035, 2.25
EYE_SH = 0.; EN_T, EN_B, EYE_TOPK = 2.15, 2.35, 1.0
def eye_norm(X, Z):
    """the opening's normalised radius (1 on the rim) and angle, for points (X outward, Z up) in the un-sheared frame"""
    top = Z > 0; Zs = Z / np.where(top, EYE_TOPK, 1.); en = np.where(top, EN_T, EN_B)
    return (np.abs(X) ** en + np.abs(Zs) ** en) ** (1 / en) + 1e-9, np.arctan2(Zs, X), Zs
RECESS = dict(delta=0., tilt=0., F_out=.13, F_nas=.075, F_up=.080, F_dn=.065)
def eye_recess(q):
    x, y, z = q[..., 0], q[..., 1], q[..., 2]; tot = 0
    for s in (-1, 1):
        X = s * (x - s * EXW) / EHWW; Z = (z - EZW) / EHHW - EYE_SH * X
        sr, _ps, Zs = eye_norm(X, Z)
        c = X / sr; sn = Zs / sr
        dout = (sr - 1) * np.sqrt((EHWW * c) ** 2 + (EHHW * sn) ** 2)
        F = np.maximum(np.sqrt((np.where(c > 0, RECESS['F_out'], RECESS['F_nas']) * c) ** 2 + (np.where(sn > 0, RECESS['F_up'], RECESS['F_dn']) * sn) ** 2), 1e-4)
        tot = tot + (1 - smoother(.010, .010 + F, dout))
    return tot * smooth(-.10, -.24, y)
def warped(q):
    if RECESS['delta'] == 0: return np.asarray(q, float)
    qw = np.array(q, float, copy=True); qw[..., 1] = q[..., 1] - RECESS['delta'] * eye_recess(q); return qw
# nose: a dark rounded triangle (wider on top) on the snout's front-top, 0.12 W wide, 0.08 W tall, centre 0.264 W above the chin
NZW = .266; NOSE_PW = .0600; NHW, NHH, NHD = .0600, .0380, .040; NOSE_SHEAR = .040; NOSE_WIDEN = .55; NOSE_FLAT = .40
_yf = float(front_local(0, NZW, base_local)[0])
NOSE_C = np.array([0, _yf + NHD - .050, NZW])
def nose_recede(qz): return NOSE_SHEAR * smooth(-.30, 1.20, qz / NHH)
def nose_widen(qz): return 1 + NOSE_WIDEN * (2 * smooth(-1.4, 1.4, qz / NHH) - 1)
def nose_flat(qz): return 1 + NOSE_FLAT * smooth(0., 1., qz / NHH)
def nose_sdf(q):
    qq = np.array(q, float, copy=True) - NOSE_C
    qq[..., 1] = qq[..., 1] - nose_recede(qq[..., 2])
    widen = nose_widen(qq[..., 2])
    qq[..., 0] = qq[..., 0] / widen
    qq[..., 2] = qq[..., 2] * nose_flat(qq[..., 2])
    return ell(qq, [0, 0, 0], [NHW, NHD, NHH])
K_N = .016
def head_local_pre(q, neck=True):
    d = base_local(warped(q))
    if neck: d = smin(d, ell(q, *NECK), K_NECK)
    return smin(d, nose_sdf(q), K_N)

# ---- the sculpted closed mouth: the sheet's small "w" smile (head close-up: corners +-0.10 W at 0.193 W, the arcs' low points +-0.05 W at
# 0.160 W, the cusp under the philtrum at 0.175 W; the philtrum runs up to the nose's bottom at 0.225 W)
MA_X, MA_C, MA_K, MA_P, MA_T0, MA_CUSP, MA_CURL = .100, .160, .026, 1.55, .50, .015, .007
def mouth_arch(t, crisp=False):
    t = np.asarray(t, float); a = np.abs(t)
    rise = np.clip((a - MA_T0) / (1 - MA_T0), 0, 1) ** MA_P
    cusp = MA_CUSP * (np.clip(1 - a / MA_T0, 0, 1) ** 1.5 if crisp else 1 - smooth(0., MA_T0, a))
    return np.stack([MA_X * t, MA_C + MA_K * rise + cusp + MA_CURL * smooth(.80, 1., a) ** 1.4], -1)
MG_N = 41; _mt = np.linspace(-1, 1, MG_N); _mc = mouth_arch(_mt)
MG_TAPER = 1 - .70 * smooth(.55, .98, np.abs(_mt))
MG_RG = .0056 * MG_TAPER; MG_DL = .0010 * MG_TAPER; MG_SUP, MG_SDN, MG_SMID = 2.6, 1.65, 2.0
MG_YS = front_local(_mc[:, 0], _mc[:, 1], head_local_pre)
MG_C = np.stack([_mc[:, 0], MG_YS - MG_DL, _mc[:, 1]], -1)
_ru = front_local(_mc[:, 0], _mc[:, 1] + .0048, head_local_pre)
MG_R = np.stack([_mc[:, 0], _ru + .0018, _mc[:, 1] + .0040], -1); MG_RR = .0034 * MG_TAPER
PH_Z = np.array([NZW - NHH + .006, MA_C + MA_CUSP + .003]); _py = front_local(np.zeros(2), PH_Z, head_local_pre)
PH_C = np.stack([np.zeros(2), _py - .0004, PH_Z], -1); PH_R = np.array([.0032, .0036])
_dc = mouth_arch(np.array([-1., 1.]), True); _dy = front_local(_dc[:, 0], _dc[:, 1], head_local_pre)
DIMPLE_C = np.stack([_dc[:, 0] * 1.02, _dy - .0036, _dc[:, 1] + .001], -1); DIMPLE_R = .0044
MG_BOX = (.130, .080, NZW - .6 * NHH, -.25)
def _chain(p, Cs, Rs, scale=None):
    best = np.full(len(p), 9.)
    for i in range(len(Cs) - 1):
        A = Cs[i]; B_ = Cs[i + 1]; pa = p - A; ba = B_ - A
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
def groove_sdf(p):
    d = smin(_chain(p, MG_C, MG_RG, scale=True), _chain(p, PH_C, PH_R), .003)
    for c_ in DIMPLE_C: d = smin(d, np.linalg.norm(p - c_, axis=1) - DIMPLE_R, .003)
    return d
def head_local(q, neck=True):
    d = np.array(head_local_pre(q, neck), float, copy=True); p = np.asarray(q, float).reshape(-1, 3); dv = d.reshape(-1)
    m = mouth_mask(p)
    if m.any():
        pm = p[m]; dd = smin(dv[m], _chain(pm, MG_R, MG_RR), .003)
        dv[m] = smax(dd, -groove_sdf(pm), .0015)
    return dv.reshape(np.shape(d))
NOSE_TIP_L = float(np.nanmin(front_local(np.zeros(40), np.linspace(NZW - NHH, NZW + NHH, 40), head_local)))
def L2M(q): return np.stack([q[..., 0] * W, HY + q[..., 1] * W, CHIN + q[..., 2] * W], -1)
def M2L(p): return np.stack([p[..., 0] / W, (p[..., 1] - HY) / W, (p[..., 2] - CHIN) / W], -1)
def head_sdf(p): return head_local(M2L(p)) * W
def skull_sdf(p): return base_local(M2L(p)) * W
def front_hit(x, z, f=head_sdf):
    return HY + W * front_local(np.asarray(x) / W, (np.asarray(z) - CHIN) / W, lambda q: f(L2M(q)) / W)
O = np.array([0, HY - .05 * W, CHIN + .38 * W])
_g = np.stack(np.meshgrid(np.zeros(1), np.linspace(-.5, .5, 101), np.linspace(.60, 1.00, 401), indexing='ij'), -1).reshape(-1, 3)
SKULL_TOP_M = float(CHIN + W * _g[head_local(_g) < 0][:, 2].max())
LOG['skull_top_m'] = round(SKULL_TOP_M, 4)

def head_report():
    tip = NOSE_TIP_L
    rows = []
    for z in (.80, .75, .69, .60, .554, .507, .46, .41, .37, .32, .28, .24, .20, .155, .108, .085, .061, .038, .014):
        y = float(front_local(0, z, head_local)[0]); rows.append((z, round(y, 3)))
    back = []
    for z in (.80, .70, .60, .50, .40, .30, .178, .108, .061, .014):
        ys = np.linspace(.8, -.2, 501); P = np.stack([np.zeros_like(ys), ys, np.full_like(ys, z)], -1); inn = head_local(P) < 0
        back.append((z, round(float(ys[inn].max()), 3) if inn.any() else None))
    widths = {}
    for zw in (.0, .015, .051, .088, .124, .16, .20, .25, .30, .35, .40, .45, .50, .55, .60, .65, .70, .75, .80, .84):
        xs_ = np.linspace(0, .7, 351); ys_ = front_local(xs_, np.full(len(xs_), zw), head_local); ok = np.isfinite(ys_)
        widths['%.3f' % zw] = round(float(xs_[ok].max()), 3) if ok.any() else None
    under = {}
    for yv in (-.40, -.34, -.28, -.22, -.16, -.10, -.04):
        zs = np.linspace(-.25, .2, 451); P = np.stack([np.zeros_like(zs), np.full_like(zs, yv), zs], -1); inn = head_local(P, neck=False) < 0
        under['%.2f' % yv] = round(float(zs[inn].min()), 3) if inn.any() else None
    sil = {}
    for zw in (.02, .06, .10, .14, .18, .22, .26, .30, .34, .42, .50, .58, .63):
        xs_ = np.linspace(-.6, .6, 241); ys_ = front_local(xs_, np.full(len(xs_), zw), head_local); sil['%.2f' % zw] = round(float(np.nanmin(ys_)), 3)
    q = np.array([[EXW, float(front_local(EXW, EZW, head_local)[0]), EZW]])
    g = np.zeros(3)
    for k in range(3):
        dp = np.zeros(3); dp[k] = 1e-4; g[k] = (head_local(q + dp) - head_local(q - dp))[0]
    g = g / np.linalg.norm(g)
    ys = np.linspace(-.7, .7, 701); P = np.stack([np.zeros_like(ys), ys, np.full_like(ys, .34)], -1); inn = head_local(P) < 0
    return {'skull_top_W': round((SKULL_TOP_M - CHIN) / W, 3), 'nose_tip_y_W': round(tip, 3), 'nose_c_y_W': round(float(NOSE_C[1]), 3),
            'depth_at_z.34_W': round(float(ys[inn].max() - ys[inn].min()), 3),
            'profile_front(z, y)': rows, 'underside_z(y: z, no neck)': under, 'profile_back(z, y)': back, 'silhouette_front(z: y)': sil, 'half_widths(z: x)': widths,
            'eye_surface_normal_out_deg': round(math.degrees(math.atan2(g[0], -g[1])), 1), 'eye_surface_normal_down_deg': round(math.degrees(math.asin(-g[2])), 1),
            'eye_front_y_W': round(float(q[0, 1]), 3), 'mouth_groove_y_W': [round(float(v), 3) for v in MG_YS[::8]]}
if TUNE:
    print(json.dumps(head_report(), indent=1)); sys.exit(0)

def radial_hit(d, f=head_sdf, o=O, t0=.02, t1=.52, it=32):
    lo = np.full(len(d), t0); hi = np.full(len(d), t1)
    for _ in range(it):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return o + d * ((lo + hi) / 2)[:, None]
def radial_hit_outer(d, f=head_sdf, o=O, t0=.02, t1=.52, steps=128, fine=0):
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

# ============================================================== face layout (front projection, metres)
EX = EXW * W; EZ = CHIN + EZW * W; EHW = EHWW * W; EHH = EHHW * W
def eye_unit(psi):
    c = np.cos(psi); s = np.sin(psi); en = np.where(s > 0, EN_T, EN_B)
    return spow(c, 2 / en), spow(s, 2 / en) * np.where(s > 0, EYE_TOPK, 1.)
EYEF = {}; EYE_LAMBDA = .5; EYE_AXIS_LOCK = (30.0, -6.0)
for _s in (-1, 1):
    _Sc = np.array([_s * EX, float(front_hit(_s * EX, EZ)[0]), EZ]); _ax0 = grad_n(_Sc[None])[0]
    if EYE_AXIS_LOCK:
        _o, _d = map(math.radians, EYE_AXIS_LOCK); _ax0 = np.array([_s * math.sin(_o) * math.cos(_d), -math.cos(_o) * math.cos(_d), -math.sin(_d)])
    _ax = unit(_ax0 * (1 - EYE_LAMBDA) + np.array([0, -1., 0]) * EYE_LAMBDA)
    _ex = unit(np.array([-_ax[1], _ax[0], 0.])); _eo = _s * _ex; _ev = unit(np.cross(_ax, _eo) * _s)
    if _ev[2] < 0: _ev = -_ev
    _ch = math.cos(math.atan2(abs(_ax[0]), -_ax[1])); _cv = math.cos(math.asin(np.clip(_ax[2], -1, 1)))
    EYEF[_s] = dict(Sc=_Sc, ax=_ax, eo=_eo, ev=_ev, hw=EHW / (_ch ** .85) * 1.086, hh=EHH / _cv * 1.028, ax0=_ax0)
def eye_pts(side, psi, k=1.0):
    """skin points of the opening's superellipse (scale k) laid out in the eye plane, hit along the eye axis"""
    F_ = EYEF[side]; ux, uz = eye_unit(np.atleast_1d(psi))
    Q = F_['Sc'] + np.outer(F_['hw'] * k * ux, F_['eo']) + np.outer(F_['hh'] * k * (uz + EYE_SH * ux), F_['ev'])
    ts = np.linspace(.25 * W, -.30 * W, 160); n = len(Q)
    P = Q[:, None, :] + F_['ax'][None, None, :] * ts[None, :, None]
    ins = (head_sdf(P.reshape(-1, 3)) < 0).reshape(n, len(ts)); i = np.argmax(ins, 1)
    lo = ts[np.maximum(i - 1, 0)]; hi = ts[i]
    for _ in range(26):
        m = (lo + hi) / 2; inn = head_sdf(Q + F_['ax'][None] * m[:, None]) < 0
        hi = np.where(inn, m, hi); lo = np.where(inn, lo, m)
    return Q + F_['ax'][None] * ((lo + hi) / 2)[:, None]
def eye_s3(side, P):
    """(superellipse radius, angle, X outward, Z up) of points in the eye plane"""
    F_ = EYEF[side]; d = np.asarray(P) - F_['Sc']
    X = (d @ F_['eo']) / F_['hw']; Z = (d @ F_['ev']) / F_['hh'] - EYE_SH * X
    sr, psi, Zs = eye_norm(X, Z)
    return sr, psi, X, Z
NZ = CHIN + NZW * W
BLUSH = (.350 * W, CHIN + .210 * W, .066 * W, .042 * W)
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
EYE_SCALES = [1.0, 1.06, 1.13, 1.21, 1.30, 1.40]
eye_dom = {}
for s in (-1, 1):
    psi = np.linspace(0, 2 * PI, NE, endpoint=False)
    base = to_dom(unit(eye_pts(s, psi) - O)); c = to_dom(surf_dir(np.array([s * EX]), np.array([EZ])))[0]
    eye_dom[s] = (c, base)
    wn = (1 - .72 * smooth(-.10, -.80, np.cos(psi))) * (1 - .50 * smooth(-.20, -.90, np.sin(psi)))
    for k, kk in enumerate(EYE_SCALES): add_loop(c + (base - c) * (1 + (kk - 1) * wn[:, None]), 'eye%d_%d' % (s, k))
pts.append(tuple(to_dom(surf_dir(np.array([0.]), np.array([NZ])))[0])); tags['nose_c'] = [len(pts) - 1]
for k, (rx, rz, n) in enumerate([(.0205, .0125, 12), (.0400, .0235, 16), (.0570, .0330, 20), (.0695, .0400, 24), (.0800, .0460, 26)]):
    a = np.linspace(0, 2 * PI, n, endpoint=False) + .3 * k
    widen = nose_widen(np.sin(a) * rz)
    add_loop(to_dom(surf_dir(rx * W * np.cos(a) * widen, NZ + rz * W * np.sin(a) * np.where(np.sin(a) > 0, .82, 1.))), 'nose_%d' % k)
def arch_ud(up0, dn0, n=MG_N, ncap=4, taper=False):
    t = np.linspace(-1, 1, n); C = mouth_arch(t); T = unit(np.gradient(C, axis=0)); nn = np.stack([-T[:, 1], T[:, 0]], -1)
    if nn[n // 2, 1] < 0: nn = -nn
    f = (1 - .60 * smooth(.55, .98, np.abs(t))) if taper else np.ones(n)
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
for k, (up_, dn_) in enumerate([(.0019, .0021), (.0040, .0043), (.0068, .0075), (.0097, .0108), (.0132, .0150)]):
    L = arch_ud(up_, dn_, taper=k < 2)
    _i0 = len(pts); add_loop(to_dom(surf_dir(L[:, 0], L[:, 1])), 'mouth_%d' % k)
    if k == 0: SIDE_PT.update({_i0 + j: sd_ for j, sd_ in enumerate(ARCH_SIDE[0])})
_pp = mouth_arch(np.linspace(-1, 1, MG_N)) * W + np.array([0, CHIN])
add_loop(to_dom(surf_dir(_pp[:, 0], _pp[:, 1])), 'part', closed=False)
NB = 72; AB = math.radians(122)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
def fib(nf, amax):
    ii = np.arange(nf) + .5; phi = np.arccos(1 - 2 * ii / nf); th = PI * (1 + 5 ** .5) * ii
    D = np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
    return D[np.arccos(np.clip(-D[:, 1], -1, 1)) < amax]
D = fib(1700, math.radians(118.5)); Pf = radial_hit_outer(D)
D2 = fib(3300, math.radians(76)); P2 = radial_hit_outer(D2)
def fine_zone(P):
    q = M2L(P)
    return ((np.abs(q[:, 0]) < .56) & (q[:, 2] > -.02) & (q[:, 2] < .66)) & (P[:, 1] < HY - .10 * W)
D = np.concatenate([D[~fine_zone(Pf)], D2[fine_zone(P2)]]); Pf = np.concatenate([Pf[~fine_zone(Pf)], P2[fine_zone(P2)]])
# round 2: a denser band along the silhouette (the cheeks and the jaw outline, seen side-on from the front and the 3/4 views), so the
# outline has no straight facets at portrait size
def sil_zone(P, Dd):
    ang = np.degrees(np.arccos(np.clip(-Dd[:, 1], -1, 1))); q = M2L(P)
    return (ang > 70) & (ang < 117) & (q[:, 2] > -.06) & (q[:, 2] < .62)
D3 = fib(4000, math.radians(118.5)); P3 = radial_hit_outer(D3); _s3 = sil_zone(P3, D3) & ~fine_zone(P3)
_sf = sil_zone(Pf, D) & ~fine_zone(Pf)
D = np.concatenate([D[~_sf], D3[_s3]]); Pf = np.concatenate([Pf[~_sf], P3[_s3]])
# the chin and the flat underside's front edge: a regular grid sampled from the front
# (rig mode, the director's round-4 fix: a denser front grid over the chin and the jaw corners, so the lower outline has no facets;
#  the plain build uses the lighter sampling)
CHIN_GRID = ((-.30, .30, 25), (-.03, .075, 8))          # (the rig build keeps the approved sampling: the look at rest is unchanged)
gx, gz = np.meshgrid(np.linspace(*CHIN_GRID[0]) * W, CHIN + np.linspace(*CHIN_GRID[1]) * W)
gx = gx.ravel(); gz = gz.ravel(); gy = front_hit(gx, gz); okg = np.isfinite(gy)
G = np.stack([gx, gy, gz], -1)[okg]; Dg = unit(G - O)
zone = (np.abs(Pf[:, 0]) < CHIN_GRID[0][1] * W + .01 * W) & (Pf[:, 2] < CHIN + (CHIN_GRID[1][1] + .003) * W) & (Pf[:, 2] > CHIN + (CHIN_GRID[1][0] - .005) * W) & (Pf[:, 1] < HY - .15 * W)
D = np.concatenate([D[~zone], Dg]); Pf = np.concatenate([Pf[~zone], radial_hit_outer(Dg)]); keep = np.ones(len(D), bool)
# the muzzle top (it faces up, so rays from the head centre graze it): a regular grid sampled from the front
gx, gz = np.meshgrid(np.linspace(-.20, .20, 21) * W, CHIN + np.linspace(.295, .375, 7) * W)
gx = gx.ravel(); gz = gz.ravel(); gy = front_hit(gx, gz); okg = np.isfinite(gy)
Gm_ = np.stack([gx, gy, gz], -1)[okg]; Dm_ = unit(Gm_ - O)
zone = (np.abs(Pf[:, 0]) < .21 * W) & (Pf[:, 2] > CHIN + .290 * W) & (Pf[:, 2] < CHIN + .380 * W) & (Pf[:, 1] < HY - .30 * W)
D = np.concatenate([D[~zone], Dm_]); Pf = np.concatenate([Pf[~zone], radial_hit_outer(Dm_)]); keep = np.ones(len(D), bool)
dom = to_dom(D)
for s in (-1, 1):
    c, base = eye_dom[s]
    outer = np.array([pts[i] for i in tags['eye%d_%d' % (s, len(EYE_SCALES) - 1)]])
    keep &= ~in_poly(c + (dom - c) / 1.06, outer)
front = Pf[:, 1] < HY
keep &= ~(front & ((Pf[:, 0] / (.088 * W)) ** 2 + ((Pf[:, 2] - NZ) / (.050 * W)) ** 2 < 1))
_ma = mouth_arch(np.linspace(-1.12, 1.12, 64)) * W + np.array([0, CHIN])
_dm = np.min(np.hypot(Pf[:, 0:1] - _ma[None, :, 0], Pf[:, 2:3] - _ma[None, :, 1]), axis=1)
keep &= ~(front & (_dm < .019 * W) & (Pf[:, 1] < HY - .25 * W))
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
    return dom_out, F[~hole], out_of

# ---- adaptive refinement for the game's hard toon band
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
    vis = (Pt[:, :, 1] < HY + .01).all(1) & (Pt[:, :, 2] > CHIN - .05 * W).all(1) & seen
    _cm = Pt.mean(1); vis &= ~((np.min(np.hypot(_cm[:, 0:1] - _ma[None, :, 0], _cm[:, 2:3] - _ma[None, :, 1]), axis=1) < .022 * W) & (_cm[:, 1] < HY - .25 * W))
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
REFINE_ADD = int(os.environ.get('REFINE_ADD', '150')); D_LOW, D_T = .12, .45
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
        if (lp is None and (ka in fixed_pts or kb in fixed_pts)) or (lp is not None and lp in ('bound', 'part')):
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
for a in [130, 140, 151, 162, 172]:
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
# ---- cut the skin along the lip parting (rig-ready: the jaw opens it); the corners stay shared, so they are sealed at every jaw value
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
              'loops_round_the_mouth': 5,
              'note': 'Tobi_head is cut along the parting (upper and lower copies of the interior vertices; the corners are shared). '
                      'The head interior behind the mouth is empty: room for the rig-time mouth cavity and tongue.'}
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
NSEG = 32
eye_centers = {}
def eye_h(k): return .0024 - .0060 * k * k
for s, tag in ((-1, 'R'), (1, 'L')):
    psi = np.linspace(0, 2 * PI, NSEG, endpoint=False); rows = []
    Sc = EYEF[s]['Sc']; axis = EYEF[s]['ax0']
    for k in ES:
        S = Sc[None] if k == 0 else eye_pts(s, psi, k)
        n = grad_n(S); rows.append(S + n * eye_h(k))
    rim = rows[-1]
    for depth, sc in [(.012, .86), (.024, .58)]: rows.append(Sc + (rim - Sc) * sc - axis * depth)
    tip = Sc - axis * .032
    ux_, uz_ = eye_unit(psi)
    def euv(kx, kz): return (.5 + s * kx / 2.4, .5 + kz / 2.4)       # the un-sheared opening frame (X right on screen)
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
    eye_centers[tag] = [float(v) for v in (Sc - axis * .016)]
    LOG['eye_axis_' + tag] = {'out_deg': round(math.degrees(math.atan2(s * axis[0], -axis[1])), 1),
                              'down_deg': round(math.degrees(math.asin(-axis[2])), 1)}
print('EYE_AXIS', LOG['eye_axis_L'], LOG['eye_axis_R'], flush=True)

def ramp_sw(name, hi=.28, occ=0., add=0.):          # for sweep(): uvfn(NV, tt, uu, V)
    return lambda NV, tt, uu, V: ramp_uv(name, sval(NV, occ=occ, hi=hi) + add)
def ramp_fn(name, hi=.28, occ=0., add=0.):          # for star_mesh() / ring_stack(): uvfn(NN, V)
    return lambda NN, V, *a: ramp_uv(name, sval(NN, occ=occ, hi=hi) + add)
def mix_uv(chart, shade, tone):
    x, y, w, h = CHARTS[chart]; s_ = clamp(np.asarray(shade, float)); l_ = clamp(np.asarray(tone, float)) * np.ones_like(s_)
    return np.stack([(x + 8 + s_ * (w - 16)) / 2048, (y + 8 + l_ * (h - 16)) / 2048], -1)
def gradL(f, p, e=1e-4):
    g = np.zeros_like(p)
    for k in range(3):
        dp = np.zeros(3); dp[k] = e; g[:, k] = f(p + dp) - f(p - dp)
    return unit(g)
def push_out(P, clear, f, it=8):
    P = np.array(P, float, copy=True); clear = np.broadcast_to(np.asarray(clear, float), (len(P),))
    for _ in range(it):
        d = f(P); need = np.maximum(clear - d, 0)
        if need.max() < 1e-6: break
        P = P + gradL(f, P) * need[:, None]
    return P
def head_point(x, z, yref=-.30, f=head_sdf):
    """the head surface (metres) seen from O toward the W-unit point (x, yref, z), and its normal"""
    d = unit(L2M(np.array([[x, yref, z]], float)) - O); P = radial_hit_outer(d, f=f); return P[0], grad_n(P, f=f)[0]


CHARTS['torso'] = (1536, 448, 512, 448)
BODY_PIVOTS = {}; BODY_MEAS = {}; POST_JOIN = None; TAIL = {}; BAND = {}
print('STEP headband', flush=True)
# ============================================================== THE WHITE HEADBAND (metres): a thick soft ring hugging the head, tilted
# (sheet: the centre line 0.727 W above the chin at the front, ~0.565 W at the back; 0.078 m tall, about 0.024 m thick), with a soft
# square knot pad at the back (0.118 m square). Under the ears (hidden) it thins to 1 cm, so the ears can lie close over it.
BAND_ZF, BAND_ZB, BAND_H, BAND_T, BAND_T_SIDE = CHIN + .727 * W, CHIN + .565 * W, .078, .024, .010
def band_zc(phi): return BAND_ZF + (BAND_ZB - BAND_ZF) * (1 - np.cos(phi)) / 2
def band_t(phi):
    """the band's thickness: full at the front and the back, 1 cm under the ears (|phi| ~ 50..140 deg)"""
    a = np.abs(np.arctan2(np.sin(phi), np.cos(phi)))
    return BAND_T - (BAND_T - BAND_T_SIDE) * smooth(1.25, 1.48, a) * smooth(2.12, 1.95, a)
def head_ring_pt(phi, z, f=None):
    phi = np.atleast_1d(np.asarray(phi, float)); z = np.broadcast_to(np.asarray(z, float), phi.shape)
    D = np.stack([np.sin(phi), -np.cos(phi), np.zeros_like(phi)], -1)
    C = np.stack([np.zeros_like(phi), np.full_like(phi, HY), z], -1)
    name_hint[0] = 'band'
    return ray_outer(f or head_sdf, C, D, .60, steps=120, it=28)
NBP = 60; NBS = 12
phis = np.linspace(0, 2 * PI, NBP, endpoint=False)
sa_b = np.linspace(0, 2 * PI, NBS, endpoint=False)
G = np.zeros((NBP, NBS, 3))
tb_ = band_t(phis)
for j in range(NBS):
    db = BAND_H / 2 * spow(np.sin(sa_b[j]), .38)
    dn = (tb_ + .004) / 2 * spow(np.cos(sa_b[j]), .45) + (tb_ - .004) / 2
    P = head_ring_pt(phis, band_zc(phis) + db); N = grad(head_sdf, P)
    G[:, j] = P + N * dn[:, None]
dK = np.roll(G, -1, 0) - np.roll(G, 1, 0); dS = np.roll(G, -1, 1) - np.roll(G, 1, 1)
NG = unit(np.cross(dK, dS)); ctr = np.repeat(G.mean(1, keepdims=True), NBS, 1)
NG = np.where(((NG * (G - ctr)).sum(-1) < 0)[..., None], -NG, NG)
Fb = []
for i in range(NBP):
    for j in range(NBS):
        ii = (i + 1) % NBP; jj = (j + 1) % NBS; Fb.append((i * NBS + j, i * NBS + jj, ii * NBS + jj, ii * NBS + j))
VB = G.reshape(-1, 3); NB_ = NG.reshape(-1, 3)
make_obj('headband', VB, Fb, ramp_uv('band', sval(NB_, hi=.22, lo=.26) - .02), 'band', N=NB_)
BACK = G[NBP // 2]; BACK_OUT = float(BACK[:, 1].max()); BACK_Z = float(band_zc(PI))
# the knot pad: a soft rounded square block on the band's back (sheet back view: 0.118 x 0.116 m), standing about 2.5 cm proud
KNOT_C = np.array([0, BACK_OUT - .006, BACK_Z + .002])
_ca, _sa = math.cos(.25), math.sin(.25)
_kax = np.array([[1., 0, 0], [0, _ca, _sa], [0, -_sa, _ca]])        # tilted back with the head's curve
def bandknot_sdf(p): return sd_box(p, KNOT_C, _kax, (.056, .017, .052), .016)
star_mesh('band_knot', bandknot_sdf, KNOT_C, 'band', lambda NN, V: ramp_uv('band', sval(NN, hi=.22, lo=.26) + .02), nth=14, nph=24, tmax=.12)
BAND.update({'front_z_m': BAND_ZF, 'back_z_m': BAND_ZB, 'knot_m': KNOT_C.tolist()})
LOG['band'] = {'front_centre_z_m': round(BAND_ZF, 3), 'back_centre_z_m': round(BAND_ZB, 3), 'height_m': BAND_H, 'thickness_m': BAND_T,
               'thickness_under_ears_m': BAND_T_SIDE, 'knot_m': [round(float(c), 3) for c in KNOT_C]}
def band_outer_sdf(p):
    """the head grown by the band where the band is (an approximate field of the band's outer face, metres)"""
    p = np.asarray(p, float); phi = np.arctan2(p[:, 0], -(p[:, 1] - HY))
    w = smooth(BAND_H / 2 + .004, BAND_H / 2 - .004, np.abs(p[:, 2] - band_zc(phi)))
    return head_sdf(p) - (band_t(phi) + .002) * w

print('STEP ears', flush=True)
# ============================================================== EARS: big floppy dog ears (W units, z above the chin, y from HY)
# The sheet: each ear is a thick soft paddle, an egg in the side view (z 0.085 .. 0.88, y -0.14 .. +0.40 at its widest, narrower at the
# top), folding over from a root on the dome above the headband, lying over the band and down the head's side, and flaring out a little
# at the fat round bottom lobe (front view: the outer edge at x 0.685 W at z 0.23, the bottom at z ~0.09; the tops level with the crown).
# Construction: a loft along a SPINE (root inside the dome -> over the fold -> down the side -> the lobe) with lens sections square to it.
# Each section point's inner face lies on the HULL (the head, the band's outer face, and below the widest level a straight curtain, so
# the ear hangs instead of following the head inward), a few mm off it (sunk into the dome at the root, flared out at the lobe); the outer
# face is a thickness T further out along the spine's outward normal. Thickness 0.11 W at the fold .. 0.17 W at the lobe; rounded edges.
# Rings square to the spine = the ear's bend rings.
EAR_SP = np.array([[.100, .065, .790], [.190, .068, .878], [.300, .075, .905], [.410, .090, .862], [.490, .105, .762],
                   [.545, .118, .622], [.580, .126, .470], [.598, .130, .320], [.606, .132, .200], [.610, .132, .100]])
EAR_S = [0., .06, .14, .28, .45, .62, .80, .90, 1.]
EAR_WH = [.070, .120, .150, .185, .240, .268, .272, .236, .0]           # half-width along y (the side-view egg)
EAR_TT = [.070, .100, .115, .135, .160, .185, .200, .205, .0]          # thickness
EAR_GP = [-.095, -.045, -.014, .008, .012, .018, .028, .040, .050]       # the inner face's offset from the hull (- = sunk; + flares the lobe)
EAR_NS = 2.3; EAR_RELAX = 6; EAR_FWD = .035; EAR_FTHIN = .32
def _cum(P): d = np.linalg.norm(np.diff(P, axis=0), axis=1); s = np.concatenate([[0], np.cumsum(d)]); return s / s[-1]
_sp = cpath(EAR_SP, 300); _ss = _cum(_sp)
def ear_spine(s):
    s = np.atleast_1d(np.asarray(s, float)); return np.stack([np.interp(s, _ss, _sp[:, i]) for i in range(3)], -1)
def ear_dims(s):
    s = np.asarray(s, float)
    end = np.sqrt(np.clip(1 - ((s - .86) / .14) ** 2, 0, 1)) * (s > .86) + (s <= .86)      # the round lobe closes the bottom
    wh = np.interp(s, EAR_S[:-1], EAR_WH[:-1]) * end; tt = np.interp(s, EAR_S[:-1], EAR_TT[:-1]) * end ** .6
    return wh, tt, np.interp(s, EAR_S, EAR_GP)
# the hull: the head, the band's outer face, and the curtain below the widest level (W units in, metres out)
DT_Y = np.linspace(-.40, .60, 61); DT_Z = np.linspace(1.00, -.05, 161)
_YY, _ZZ = np.meshgrid(DT_Y, DT_Z)
def _hb(p): return np.minimum(head_sdf(p), band_outer_sdf(p))
_C = L2M(np.stack([np.zeros(_YY.size), _YY.ravel(), _ZZ.ravel()], -1)); _ins = _hb(_C) < 0
_hx = np.zeros(_YY.size)
if _ins.any():
    name_hint[0] = 'ear drape'
    _Ph = ray_outer(_hb, _C[_ins], np.tile([1., 0, 0], (int(_ins.sum()), 1)), .45, steps=110, it=26)
    _hx[_ins] = _Ph[:, 0] / W
DRAPE = np.maximum.accumulate(_hx.reshape(_YY.shape), axis=0)       # z runs downward along axis 0: a curtain from the widest point
def drape(y, z):
    """bilinear lookup of the curtain's half-width (W units)"""
    y = np.asarray(y, float); z = np.asarray(z, float) * np.ones_like(y)
    fz = np.clip((DT_Z[0] - z) / (DT_Z[0] - DT_Z[-1]) * (len(DT_Z) - 1), 0, len(DT_Z) - 1.001); iz = fz.astype(int); tz = fz - iz
    fy = np.clip((y - DT_Y[0]) / (DT_Y[-1] - DT_Y[0]) * (len(DT_Y) - 1), 0, len(DT_Y) - 1.001); iy = fy.astype(int); ty = fy - iy
    a = DRAPE[iz, iy] * (1 - ty) + DRAPE[iz, iy + 1] * ty; b = DRAPE[iz + 1, iy] * (1 - ty) + DRAPE[iz + 1, iy + 1] * ty
    return a * (1 - tz) + b * tz
def hull_sdf(p):
    q = M2L(np.asarray(p, float)); cur = (np.abs(q[:, 0]) - drape(q[:, 1], q[:, 2])) * W
    return np.minimum(_hb(p), cur)
def hull_out(P0, N, tmax=.40):
    """the outermost hull crossing along +N through the base points P0 (metres); misses keep P0"""
    n = len(P0); ts = np.linspace(tmax, -.25, 140); found = np.zeros(n, bool); lo = np.zeros(n); hi = np.zeros(n)
    for k in range(1, len(ts)):
        v = hull_sdf(P0 + N * ts[k]); new = (~found) & (v < 0); lo[new] = ts[k]; hi[new] = ts[k - 1]; found |= new
        if found.all(): break
    for _ in range(26):
        m = .5 * (lo + hi); ins = hull_sdf(P0 + N * m[:, None]) < 0; lo = np.where(ins, m, lo); hi = np.where(ins, hi, m)
    t = np.where(found, .5 * (lo + hi), 0.)
    return P0 + N * t[:, None], found
NS_E = 40; NK_E = 32
EAR_TH = np.linspace(0, 2 * PI, NS_E + 1)          # theta 0 = the back edge, pi/2 = the outer face, pi = the front edge
EAR_SK = (1 - np.cos(PI * np.linspace(0, 1, NK_E + 2)[1:-1])) / 2 * .995          # root .. lobe, dense at both ends
ear_info = {}; EAR_GRID = {}
def ear_frames(s):
    """the LEFT ear's spine points, tangents and outward normals (x-z plane, square to the tangent)"""
    P = ear_spine(s); Tg = unit(np.gradient(P, axis=0))
    Nn = unit(np.cross(Tg, np.array([0, 1., 0])[None]))
    return P, Tg, Nn
def build_ear(side, tag):
    s = EAR_SK; P, Tg, Nn = ear_frames(np.concatenate([[0.], s, [1.]])); P, Tg, Nn = P[1:-1], Tg[1:-1], Nn[1:-1]
    mir = np.array([side, 1, 1]); Pm = L2M(P * mir); Nm = Nn * mir
    wh, tt, gp = ear_dims(s)
    a = spow(np.cos(EAR_TH), 2 / EAR_NS); b = spow(np.sin(EAR_TH), 2 / EAR_NS)
    R = len(s); C_ = len(EAR_TH)
    # (phase-2 tweak, the director: the ears' inner edges 0.04 W toward the face) the hanging part's front edge reaches a little further
    # forward, where the head is narrower, and thins toward that edge, so it wraps the cheek like the sheet's ears
    fwd = smooth(.25, .45, s)[:, None] * np.maximum(-a, 0)[None, :]
    base = Pm[:, None, :] + np.array([0, 1., 0])[None, None, :] * ((wh[:, None] * a[None, :] - EAR_FWD * fwd * wh[:, None] / .27) * W)[..., None]
    Nb = np.repeat(Nm[:, None, :], C_, 1)
    H, ok = hull_out(base.reshape(-1, 3), Nb.reshape(-1, 3))
    H = H.reshape(R, C_, 3); ok = ok.reshape(R, C_)
    # a miss (an edge point past the head's outline) takes the row's mean offset along N
    off = ((H - base) * Nb).sum(-1)
    for k in range(R):
        if (~ok[k]).any(): off[k, ~ok[k]] = off[k, ok[k]].min() if ok[k].any() else 0.
    inner = base + Nb * (off + gp[:, None] * W)[..., None]
    G = inner + Nb * ((tt[:, None] * W * (1 - EAR_FTHIN * fwd ** 1.5)) * (1 + b[None, :]) / 2)[..., None]
    # relax the loft along the spine (rounds the fold and the elbow above the lobe), then keep it off the head and the band
    for _ in range(EAR_RELAX):
        G[1:-1] = .25 * G[:-2] + .5 * G[1:-1] + .25 * G[2:]
        G[:, :-1] = .5 * G[:, :-1] + .25 * np.roll(G[:, :-1], 1, 1) + .25 * np.roll(G[:, :-1], -1, 1); G[:, -1] = G[:, 0]
    keep = s > .10                                                      # (the sunk root may stay inside the dome)
    Gk = G[keep].reshape(-1, 3); Gk = push_out(Gk, .004, _hb, it=10); G[keep] = Gk.reshape(G[keep].shape)
    dS = np.roll(G[:, :-1], -1, 1) - np.roll(G[:, :-1], 1, 1); dK = np.gradient(G[:, :-1], axis=0)
    NG = unit(np.cross(dK, dS)); ctr = G[:, :-1].mean(1, keepdims=True)
    NG = np.where(((NG * (G[:, :-1] - ctr)).sum(-1) < 0)[..., None], -NG, NG)
    NG = np.concatenate([NG, NG[:, :1]], 1)
    V = list(G.reshape(-1, 3)); NN = list(NG.reshape(-1, 3)); F = grid_faces(R, C_, wrap=False)
    UU, VVg = np.meshgrid(EAR_TH / (2 * PI), s)
    UVl = list(au('ear', UU.reshape(-1), VVg.reshape(-1)))
    for end, sgn in ((0, -1.), (R - 1, 1.)):
        q = G[end, :-1].mean(0).copy(); tg = Tg[end] * mir
        q = q + unit(tg) * sgn * float(np.linalg.norm(G[end, 0] - G[end, NS_E // 2])) * .12
        pole = len(V); V.append(q); NN.append(unit(tg) * sgn); UVl.append(au('ear', np.array(.5), np.array(0. if sgn < 0 else 1.)))
        b0 = end * C_
        for i in range(NS_E):
            F.append((b0 + i + 1, b0 + i, pole) if sgn < 0 else (b0 + i, b0 + i + 1, pole))
    make_obj('ear.' + tag, np.array(V), F, np.array(UVl), 'ear.' + tag, N=np.array(NN))
    EAR_GRID[tag] = (s, NG)
    root = L2M((ear_spine(np.array([.10]))[0] * np.array([side, 1, 1]))[None])[0]
    ear_info[tag] = {'base': root.tolist(), 'top': G[np.searchsorted(s, .14)].mean(0).tolist(), 'mid': G[R // 2].mean(0).tolist(),
                     'tip': G[-2].mean(0).tolist()}
    LOG['ear_%s_bottom_m' % tag] = [round(float(c), 3) for c in G[-1].mean(0)]
for side, tag in ((1, 'L'), (-1, 'R')): build_ear(side, tag)
if not HEAD_ONLY:
    # ============================================================== BODY AND GI (metres; body axis x = 0, y = 0; sheet front 2.369 mm / px)
    RCY = .000
    def gi_uv(N, tone=0., occ=0., hi=.26, lo=.20): return mix_uv('kimmix', sval(N, hi=hi, lo=lo, occ=occ), tone)
    print('BODY_STEP gi top', flush=True)
    # ---------------------------------------------------------------- the gi top: from inside the belt up under the head
    # (sheet front: 0.35 m across at the obi; side: chest -0.18 .. back +0.175 at the obi, -0.147 / +0.154 at z 0.456; the collar at z 0.53)
    TZ = np.array([.300, .340, .380, .420, .460, .490, .515, .535, .552, .570])
    TAX = np.array([.163, .165, .167, .168, .163, .150, .134, .120, .100, .082])
    TAY = np.array([.160, .162, .163, .160, .148, .132, .118, .106, .090, .074])
    TCY = np.array([0, 0, 0, 0, .002, .008, .016, .024, .034, .046])          # the collar sits back under the head (it hides the neck from behind)
    tax_f = natspline(TZ, TAX); tay_f = natspline(TZ, TAY); tcy_f = natspline(TZ, TCY); TP = 2.3
    def torso_raw(a, z):
        a = np.asarray(a, float); z = np.asarray(z, float)
        return np.stack([tax_f(z) * spow(np.sin(a), 2 / TP), RCY + tcy_f(z) - tay_f(z) * spow(np.cos(a), 2 / TP), z + 0 * a], -1)
    def torso_n(a, z, e=1e-4):
        da = torso_raw(np.asarray(a) + e, z) - torso_raw(np.asarray(a) - e, z)
        dz = torso_raw(a, np.asarray(z) + e) - torso_raw(a, np.asarray(z) - e)
        n = unit(np.cross(dz, da)); c = torso_raw(a, z) - np.stack([0 * np.asarray(a), RCY + tcy_f(z) + 0 * np.asarray(a), np.asarray(z) * 0 + .45], -1)
        return np.where(((n * c).sum(-1) < 0)[..., None], -n, n)
    def torso_pt(a, z, off=0.): return torso_raw(a, z) + torso_n(a, z) * np.asarray(off, float)[..., None]
    def torso_a_of_x(x, z):
        s_ = np.clip(np.asarray(x, float) / tax_f(z), -.999, .999); return np.arcsin(spow(s_, TP / 2))
    # the cream chest V between the lapels: from the neck (half-width 0.052 m at z 0.53) down to its point at z 0.482; the blue lapel
    # bands (0.036 m wide) run from behind the neck down to their crossing at z 0.395, just above the obi (his left over his right)
    ZX = .482; ZN = .530; VHW = .052; LAP_W = .036; ZCROSS = .395
    def white_hw(z): return VHW * np.clip((z - ZX) / (ZN - ZX), 0, 1)
    def torso_uv_of(a, z):
        x0, y0, w, h = CHARTS['torso']; u = (np.asarray(a) + PI) / (2 * PI)
        v = (np.asarray(z) - TZ[0]) / (TZ[-1] - TZ[0])
        return np.stack([(x0 + 6 + u * (w - 12)) / 2048, (y0 + 6 + v * (h - 12)) / 2048], -1)
    NA_T, NZ_T = 40, 10
    zt_ = np.linspace(TZ[0], TZ[-1], NZ_T); at_ = np.linspace(0, 2 * PI, NA_T + 1) + PI
    AA, ZZ = np.meshgrid(at_, zt_); Pt_ = torso_raw(AA, ZZ); Nt_ = torso_n(AA, ZZ)
    make_obj('gi_top', Pt_.reshape(-1, 3), grid_faces(NZ_T, NA_T + 1, wrap=False), torso_uv_of(AA.reshape(-1) - 2 * PI, ZZ.reshape(-1)), 'body',
             N=Nt_.reshape(-1, 3))
    for s, tag in ((-1, 'R'), (1, 'L')):       # his left lapel lies over his right one (the sheet)
        zs = np.linspace(ZN + .010, ZCROSS if s > 0 else ZX - .012, 12)          # (the under lapel ends under the top one)
        def lap_x(z, s=s):                     # the band's centre: its inner edge on the V's edge; the top lapel (his left) runs on across
            zz = np.asarray(z, float)            # the chest to x -0.075 at the obi, the under one to +0.02
            top = s * (white_hw(zz) + LAP_W / 2)
            low = np.interp(zz, [ZCROSS, ZX], [-.075, .018]) if s > 0 else np.interp(zz, [ZCROSS, ZX], [.020, -.018])
            return np.where(zz >= ZX, top, low)
        front_pts = [torso_pt(np.array([torso_a_of_x(lap_x(z_), z_)]), np.array([z_]), .007 + .004 * (s > 0))[0] for z_ in zs]
        back_pts = [torso_pt(np.array([s * a_]), np.array([.548]), .009)[0] + np.array([0, 0, .006]) for a_ in (PI * .99, PI * .78, PI * .55, PI * .34)]
        path = cpath(back_pts + front_pts, 24)
        nrm = torso_n(np.array([math.atan2(p_[0], -(p_[1] - RCY)) for p_ in path]), np.clip(path[:, 2], TZ[0], TZ[-1]))
        sweep('lapel.' + tag, path, lambda k: (.0085, LAP_W / 2), 'body', ramp_sw("gi", hi=.24, add=.06 + .03 * (s > 0)), sides=8,
              normals=nrm, p=.70, cap0=False, cap1=True)

    print('BODY_STEP obi', flush=True)
    # ---------------------------------------------------------------- the red obi (sheet z 0.31 .. 0.387, 0.35 m wide + its thickness), a plain
    # soft band at the front and a rounded square knot pad at the back (back view: 0.11 x 0.097 m, z 0.313 .. 0.411)
    OBI_Z0, OBI_Z1 = .310, .388; OBI_ZC = (OBI_Z0 + OBI_Z1) / 2; OBI_H = OBI_Z1 - OBI_Z0
    NAS = 34; a_s = np.linspace(0, 2 * PI, NAS, endpoint=False)
    def waist(a, off):
        return np.stack([(tax_f(OBI_ZC) + off) * spow(np.sin(a), 2 / TP), RCY - (tay_f(OBI_ZC) + off) * spow(np.cos(a), 2 / TP), np.full(len(a), OBI_ZC)], -1)
    BELT_OFF = .006
    Pb = waist(a_s, BELT_OFF)
    Nb = unit(np.stack([Pb[:, 0] / (tax_f(OBI_ZC) + BELT_OFF) ** 2, (Pb[:, 1] - RCY) / (tay_f(OBI_ZC) + BELT_OFF) ** 2, np.zeros(NAS)], -1))
    ab8 = np.linspace(0, 2 * PI, 14, endpoint=False)
    ring_tube('belt', Pb, lambda k: np.stack([.0210 * spow(np.cos(ab8), .45), OBI_H / 2 * spow(np.sin(ab8), .32)], -1), 'body',
              lambda NN, tt, uu, V: ramp_uv('belt', sval(NN, hi=.26, lo=.20)), Nb, sides=14)
    BELT_BACK_Y = float(Pb[NAS // 2][1] + .0210)
    KN_C = np.array([0, BELT_BACK_Y + .004, OBI_ZC + .012])
    def knot_sdf(p): return sd_box(p, KN_C, np.eye(3), (.055, .019, .049), .018)
    def knot_uv(NN, V): return ramp_uv('belt', sval(NN, hi=.26, lo=.20) + .04)
    star_mesh("belt_knot", knot_sdf, KN_C, "body", knot_uv, nth=14, nph=24, tmax=.12)
    LOG['obi'] = {'z_m': [OBI_Z0, OBI_Z1], 'knot_centre_m': [round(float(c), 3) for c in KN_C]}

    print('BODY_STEP gi skirt', flush=True)
    # ---------------------------------------------------------------- the gi below the belt: a flared skirt to the hem (sheet: z 0.205 at the sides,
    # 0.18 at the front; 0.50 m wide under the belt, 0.56 m at the hem; side 0.41 m deep). His right panel lies over his left: its edge
    # runs down at x +0.08 (a soft step) and its hem hangs a little lower.
    # (Tobi: the hem at z 0.235 at the sides, 0.225 at the front; 0.41 m wide at the hem; side -0.177 .. +0.192. His left panel lies over
    # his right: its edge runs down at x -0.057 (a soft step).)
    GZ0, GZ1 = .336, .238; GT = (tax_f(.336) + .002, tay_f(.336) + .002); GH = (.206, .178, .192); GP = 2.4
    EDGE_X = -.057
    def gskirt_geom(a, t):
        g = np.clip(np.asarray(t, float), 0, 1) ** .9; ax_ = GT[0] + (GH[0] - GT[0]) * g
        ay_ = np.where(np.cos(a) > 0, GT[1] + (GH[1] - GT[1]) * g, GT[1] + (GH[2] - GT[1]) * g)
        x = ax_ * spow(np.sin(a), 2 / GP); front = np.cos(a) > 0
        over = front * smooth(EDGE_X - .004, EDGE_X + .010, x) * (1 - smooth(.55, .90, np.sin(a)))     # the top panel (his left)
        hem = GZ0 + (GZ1 - GZ0) * t - .012 * front * smooth(.35, .9, np.cos(a)) * t ** 3 - .005 * over * t ** 3
        P = np.stack([x, RCY - ay_ * spow(np.cos(a), 2 / GP), hem + 0 * a], -1)
        n2 = unit(np.stack([P[..., 0] / ax_ ** 2, (P[..., 1] - RCY) / ay_ ** 2, 0 * P[..., 0]], -1))
        return P + n2 * (.006 * over * smooth(.0, .25, t))[..., None]
    def gskirt_n(a, t, e=1e-4):
        P0 = gskirt_geom(a, t); Pa = gskirt_geom(a + e, t) - gskirt_geom(a - e, t); Ptt = gskirt_geom(a, np.minimum(t + e, 1.)) - gskirt_geom(a, np.maximum(t - e, 0.))
        n = unit(np.cross(Pa, Ptt)); ctr = np.stack([0 * P0[..., 0], RCY + 0 * P0[..., 0], P0[..., 2]], -1)
        return np.where(((n * (P0 - ctr)).sum(-1) < 0)[..., None], -n, n)
    NA_G, NZ_G = 48, 6
    a_k = np.linspace(0, 2 * PI, NA_G, endpoint=False); t_k = np.linspace(0, 1, NZ_G)
    AK, TK = np.meshgrid(a_k, t_k); Gs = gskirt_geom(AK, TK); Ns = gskirt_n(AK, TK)
    Vs = Gs.reshape(-1, 3); NNs = Ns.reshape(-1, 3); Fs = grid_faces(NZ_G, NA_G, wrap=True)
    xk = Gs[..., 0]; edge_sh = np.exp(-((xk - EDGE_X + .012) / .010) ** 2) * (np.cos(AK) > 0)          # the shade just past the panel edge
    UVo = gi_uv(NNs, (.04 + .06 * smooth(.0, 1., TK)).reshape(-1), occ=.20 * edge_sh.reshape(-1) + .10 * (1 - smooth(.0, .35, TK)).reshape(-1))
    UVi = ramp_uv('lining', sval(-NNs, hi=.10, lo=.10) - .10)
    plain = np.zeros(len(Vs), bool); plain[:NA_G] = True
    Vt, Ft, UVt, Nt = thicken(Vs, Fs, NNs, .014, UVo, UVi, UVo, rim=3, plain=plain, split_front=True)
    make_obj('gi_skirt', Vt, Ft, UVt, 'gi_skirt', N=Nt)

    print('BODY_STEP trousers', flush=True)
    # ---------------------------------------------------------------- the puffy trousers: two balloon legs under the gi (sheet front: 0.436 m
    # across at z 0.18, the gap between the legs from z 0.157, gathered to cuffs over the feet at z 0.105: each cuff 0.152 m wide at
    # x +-0.10; side -0.154 .. +0.178 at z 0.23, -0.097 .. +0.128 at the cuff), a few soft pleats
    HK_Z0, HK_Z1 = .268, .098
    def hk_dims(z):
        z = np.asarray(z, float)
        xo = .190 + .028 * smooth(.268, .190, z) - .042 * smooth(.165, .098, z) ** 1.3
        xi = .004 + .022 * smooth(.165, .110, z) ** 1.2
        hy = .150 + .016 * smooth(.268, .19, z) - .046 * smooth(.165, .098, z) ** 1.3
        yc = .012 - .002 * smooth(.20, .10, z)
        return xo, xi, hy, yc
    N_HP = 3
    for s, tag in ((-1, 'R'), (1, 'L')):
        NZH, NAH = 9, 30
        zh = HK_Z0 + (HK_Z1 - HK_Z0) * np.linspace(0, 1, NZH)
        ah = np.linspace(0, 2 * PI, NAH, endpoint=False)
        rings = []
        for z_ in zh:
            xo, xi, hy, yc = hk_dims(z_); xc = (xo + xi) / 2; hx = (xo - xi) / 2
            X = xc + hx * spow(np.sin(ah), 2 / 2.5); Y = RCY + yc - hy * spow(np.cos(ah), 2 / 2.5)
            pl = (.0030 * smooth(.20, .12, z_) + .0010) * np.sin(ah * 2 * N_HP) * smooth(.30, .70, np.abs(np.cos(ah)))
            rings.append(np.stack([s * X, Y + np.sign(np.cos(ah)) * -pl, np.full(NAH, z_)], -1))
        Gh = np.array(rings)
        # the cuff: the last ring tucks in and under (the gathered hem over the foot)
        cen = Gh[-1].mean(0); Gh = np.concatenate([Gh, (cen + (Gh[-1] - cen) * .86 + np.array([0, 0, .006]))[None]], 0); NZH += 1
        dS = np.roll(Gh, -1, 1) - np.roll(Gh, 1, 1); dK = np.gradient(Gh, axis=0)
        NGh = unit(np.cross(dK, dS)); ctr = Gh.mean(1, keepdims=True)
        NGh = np.where(((NGh * (Gh - ctr)).sum(-1) < 0)[..., None], -NGh, NGh)
        Vh = Gh.reshape(-1, 3); NNh = NGh.reshape(-1, 3)
        crs_ = np.tile(np.exp(-((np.sin(ah) + 1) / .30) ** 2), NZH)
        tz = np.repeat(np.linspace(0, 1, NZH), NAH)
        UVo = mix_uv('skmix', sval(NNh, hi=.22, lo=.20, occ=.20 * crs_ + .12 * (1 - smooth(.0, .30, tz)) + .10 * smooth(.85, 1., tz)).reshape(-1), .12 + .10 * smooth(.3, 1., tz))
        UVi = ramp_uv('hklining', sval(-NNh, hi=.10, lo=.10) - .10)
        plain = np.zeros(len(Vh), bool); plain[:NAH] = True
        Vt, Ft, UVt, Nt = thicken(Vh, grid_faces(NZH, NAH, wrap=True), NNh, .016, UVo, UVi, UVo, rim=4, plain=plain, split_front=True)
        make_obj('hakama.' + tag, Vt, Ft, UVt, 'hakama', N=Nt)

    print('BODY_STEP sleeves and arms', flush=True)
    # ---------------------------------------------------------------- short wide gi sleeves (sheet front: the top runs from the shoulder at
    # z 0.585 out to the corner at (0.346, 0.478); the opening is the slanted edge from that corner to the armpit at (0.208, 0.377), square
    # to the arm, which hangs 31 deg out from vertical). The sleeve is a loft of rings from inside the torso to that opening, slightly gathered.
    ARM = {}; ARM_DEG = 38.          # (the sheet draws ~45 deg stubby arms; 38 keeps an A-pose for the rig)
    for s, tag in ((1, 'L'), (-1, 'R')):
        th = math.radians(ARM_DEG); ad = unit(np.array([s * math.sin(th), .02, -math.cos(th)]))
        u_open = unit(np.array([s * math.cos(th), 0, math.sin(th)]))         # the opening's long axis (up and out)
        OC = np.array([s * .218, RCY + .010, .424]); OHU, OHY = .066, .080   # the opening ring: centre, half-length, half-depth
        RC = np.array([s * .090, RCY + .004, .470]); RHU, RHY = .066, .110   # the root ring inside the torso (in the plane x = const)
        NR = 11; ts = np.linspace(0, 1, NR); NS = 22; sa = np.linspace(0, 2 * PI, NS, endpoint=False)
        rings = []
        for t in ts:
            n0 = np.array([s * 1., 0, 0]); n = unit(n0 * (1 - smooth(.15, 1., t)) + ad * smooth(.15, 1., t))
            uu = unit(np.cross(n, [0, 1., 0]) * s); uu = uu if uu[2] > 0 else -uu
            vv = np.array([0, 1., 0])
            c = RC + (OC - RC) * t + np.array([0, 0, .030]) * math.sin(PI * t) * (1 - t) + u_open * .008 * math.sin(PI * t)
            hu = RHU + (OHU - RHU) * t + .010 * math.sin(PI * t); hy = RHY + (OHY - RHY) * t + .008 * math.sin(PI * t)
            g = .28 * smooth(.80, 1., t)                                     # a light gather at the end (it still reads as an open sleeve)
            ring = c + np.outer(hu * (1 - g) * spow(np.sin(sa), 2 / 2.4), uu) + np.outer(hy * (1 - g * .6) * spow(np.cos(sa), 2 / 2.4), vv)
            rings.append(ring)
        Gq = np.array(rings)
        dS = np.roll(Gq, -1, 1) - np.roll(Gq, 1, 1); dK = np.gradient(Gq, axis=0)
        NGq = unit(np.cross(dK, dS)); ctr = Gq.mean(1, keepdims=True)
        NGq = np.where(((NGq * (Gq - ctr)).sum(-1) < 0)[..., None], -NGq, NGq)
        V = Gq.reshape(-1, 3); NN = NGq.reshape(-1, 3); nr_, ns_ = Gq.shape[:2]
        tone = np.repeat(np.linspace(.04, .14, nr_), ns_)
        UVo = gi_uv(NN, tone); UVi = ramp_uv('lining', sval(-NN, hi=.10, lo=.10) - .06)
        plain = np.zeros(len(V), bool); plain[:ns_] = True
        Vt, Ft, UVt, Nt = thicken(V, grid_faces(nr_, ns_, wrap=True), NN, .015, UVo, UVi, UVo, rim=3, plain=plain, split_front=True)
        make_obj('sleeve.' + tag, Vt, Ft, UVt, 'sleeve.' + tag, N=Nt)
        SH = np.array([s * .125, RCY + .006, .460])
        def along(t0, OC=OC, ad=ad): return OC + ad * t0
        EL = along(-.020); WR = along(.030); PC = along(.082)
        fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
        def arm_sdf(p, OC=OC, WR=WR, ad=ad): return sd_capsule(p, OC - ad * .080, WR, (.054, .052))
        tsa = np.linspace(-.070, .040, 6)
        ring_stack('fur_arm.' + tag, arm_sdf, OC[None] + ad[None] * tsa[:, None], np.tile(ad, (len(tsa), 1)), 'arm.' + tag,
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20), .0), sides=14, tmax=.14, ref=fwd, pole_start=False, pole_end=False)
        lat = unit(np.cross(ad, fwd)) * s
        paw_axes = np.array([ad, fwd, lat])
        thumb = PC + fwd * .044 - lat * .022 - ad * .010
        def paw_parts(p, WR=WR, PC=PC, paw_axes=paw_axes, thumb=thumb, ad=ad):
            d_w = sd_capsule(p, WR - ad * .030, PC - ad * .012, (.052, .056))
            d_paw = sd_ell(p, PC, paw_axes, (.068, .064, .060))
            d_t = sd_ell(p, thumb, paw_axes, (.030, .026, .026))
            return d_w, d_paw, d_t
        def paw_sdf(p, paw_parts=paw_parts):
            d_w, d_paw, d_t = paw_parts(p)
            return smin(smin(d_w, d_paw, .020), d_t, .010)
        def paw_uv(NN, V, paw_parts=paw_parts):
            d_w, d_paw, d_t = paw_parts(V)
            cr = crease(smin(d_w, d_paw, .020), d_t, .010) * .40
            return fur_uv(sval(NN, occ=1.0 * cr, hi=.22, lo=.18), .0)
        tt_ = np.linspace(0, .14, 281); inside = paw_sdf(PC[None] + ad[None] * tt_[:, None]) < 0
        reach = float(tt_[np.argmin(inside)]) if not inside.all() else .14
        tips = PC + ad * (reach - .006)
        tsp = np.concatenate([np.linspace(0, .45, 5)[:-1], np.linspace(.45, 1.0, 12)])
        cen = (WR - ad * .03)[None] + (tips - (WR - ad * .03))[None] * tsp[:, None]
        ring_stack('mitten_paw.' + tag, paw_sdf, cen, np.tile(ad, (len(tsp), 1)), 'arm.' + tag, paw_uv, sides=18, tmax=.12, ref=fwd)
        ARM[tag] = {'shoulder': SH.tolist(), 'elbow': EL.tolist(), 'wrist': WR.tolist(), 'palm': (PC - lat * .008).tolist(),
                    'grip_axis': fwd.tolist(), 'arm_dir': ad.tolist(), 'paw_centre': PC.tolist()}

    print('BODY_STEP legs feet', flush=True)
    # ---------------------------------------------------------------- short legs (hidden by the hakama) and big round feet (sheet front: 0.25 m
    # wide, centres x +-0.173, 0.085 m tall; side: 0.33 m long, the toes 0.20 m in front of the axis), two toe creases each
    LEG = {}
    for s, tag in ((1, 'L'), (-1, 'R')):
        HP = np.array([s * .085, RCY + .010, .260]); AN = np.array([s * .120, RCY - .004, .085])
        def leg_sdf(p, HP=HP, AN=AN): return sd_capsule(p, HP, AN, (.060, .054))
        zs = np.linspace(.200, .085, 5)
        cen = np.array([HP + (AN - HP) * ((z_ - HP[2]) / (AN[2] - HP[2])) for z_ in zs])
        ring_stack('fur_leg.' + tag, leg_sdf, cen, np.tile(unit(AN - HP), (len(zs), 1)), 'body',
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20, occ=.12 * smooth(.14, .24, V[:, 2])), .0), sides=14, tmax=.16, ref=[0, -1., 0],
                   pole_start=False)
        FC = np.array([s * .128, -.012, .048]); FAX = rot([0, 0, 1], s * math.radians(4)).T
        toes = [FC + (np.array([o * .050, -.088, .002]) @ FAX) for o in (-1, 0, 1)]
        def foot_parts(p, FC=FC, FAX=FAX, toes=toes, AN=AN):
            d_main = sd_ell(p, FC + np.array([0, .014, 0]), FAX, (.094, .124, .052))
            d_ank = sd_capsule(p, AN + np.array([0, 0, .020]), AN + np.array([0, -.008, -.024]), .054)
            d_t = [sd_ell(p, t, FAX, (.037, .036, .040)) for t in toes]
            return d_main, d_ank, d_t
        def foot_sdf(p, foot_parts=foot_parts):
            d_main, d_ank, d_t = foot_parts(p)
            d = smin(d_main, d_ank, .022); tt = smin(smin(d_t[0], d_t[1], .006), d_t[2], .006)
            d = smin(d, tt, .016)
            return smax(d, -(p[:, 2] - .002), .008)
        def foot_uv(NN, V, foot_parts=foot_parts):
            d_main, d_ank, d_t = foot_parts(V)
            cr = crease(d_t[0], d_t[1], .006) * .45 + crease(d_t[1], d_t[2], .006) * .45
            return fur_uv(sval(NN, occ=1.1 * cr + .10 * smooth(.015, .0, V[:, 2]), hi=.20, lo=.18), .0)
        star_mesh('fur_foot.' + tag, foot_sdf, FC + np.array([0, -.006, .014]), 'body', foot_uv, nth=12, nph=22, tmax=.20)
        LEG[tag] = {'hip': HP.tolist(), 'knee': (HP + (AN - HP) * .55).tolist(), 'ankle': AN.tolist(), 'toe': (FC + np.array([0, -.110, -.010]) @ FAX).tolist()}

    print('BODY_STEP tail', flush=True)
    # ---------------------------------------------------------------- the short curled tail (sheet back view: from under the obi knot, a thick
    # comma curling out to his right and down, x 0 .. -0.085, z ~0.22 .. 0.33; side view: up to ~0.12 m behind the gi). A separate piece:
    # a round tube with bend rings, a fat rounded tip.
    TAIL_CP = np.array([[0, .150, .292], [-.002, .205, .284], [-.012, .248, .296], [-.032, .270, .322], [-.058, .262, .342],
                        [-.080, .240, .332], [-.090, .222, .304]])
    TAIL_RT = np.array([0, .15, .35, .55, .75, .90, 1.]); TAIL_RR = np.array([.040, .045, .048, .048, .045, .040, .034])
    path = cpath(TAIL_CP, 26); seg = np.linalg.norm(np.diff(path, axis=0), axis=1); s_ = np.concatenate([[0], np.cumsum(seg)]); s_ /= s_[-1]
    tr = np.interp(s_, TAIL_RT, TAIL_RR)
    sweep('tail', path, lambda k: (tr[k], tr[k] * .96), 'tail', lambda NN, tt, uu, V: fur_uv(sval(NN, hi=.24, lo=.22), .0),
          sides=14, cap0=True, cap1=True, up_hint=[0, 0, 1.])
    TAIL.update({'P': path}); TAIL_ROOT = TAIL_CP[0]

    def _vs(prefixes):
        out = []
        for g, obs in parts.items():
            for o in obs:
                if any(o.name.startswith(p) for p in prefixes): out += [list(o.matrix_world @ v.co) for v in o.data.vertices]
        return np.array(out)
    def _ext(v): return {'min': [round(float(c), 3) for c in v.min(0)], 'max': [round(float(c), 3) for c in v.max(0)], 'size': [round(float(c), 3) for c in np.ptp(v, 0)]}
    BODY_MEAS = {'body_parts_m': {k: _ext(_vs(v)) for k, v in {
        'gi_top': ['gi_top'], 'lapels': ['lapel'], 'obi': ['belt'], 'obi_knot': ['belt_knot'], 'gi_skirt': ['gi_skirt'],
        'hakama': ['hakama'], 'sleeve_L': ['sleeve.L'], 'paw_L': ['mitten_paw.L'], 'paw_R': ['mitten_paw.R'], 'legs': ['fur_leg'],
        'foot_L': ['fur_foot.L'], 'tail': ['tail'], 'headband': ['headband'], 'band_knot': ['band_knot'], 'ear_L': ['ear.L']}.items()}}
    BODY_MEAS['arm_angle_from_vertical_deg'] = ARM_DEG
    BODY_PIVOTS = {'arm.L': tuple(ARM['L']['shoulder']), 'arm.R': tuple(ARM['R']['shoulder']), 'sleeve.L': tuple(ARM['L']['shoulder']),
                   'sleeve.R': tuple(ARM['R']['shoulder']), 'body': (0, 0, 0), 'gi_skirt': (0, RCY, OBI_Z0), 'hakama': (0, RCY, HK_Z0),
                   'tail': tuple(TAIL_ROOT), 'band': tuple(O)}
    def POST_JOIN():
        joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X'}
        joints.update({'hips': [0, RCY, .280], 'spine': [0, RCY, .360], 'chest': [0, RCY - .004, .440], 'neck': [0, RCY + .010, .520]})
        joints['head'] = [float(v) for v in O]
        joints['head_base'] = [0, float(HY + .02 * W), float(CHIN + .02 * W)]
        joints['jaw_pivot'] = [0, float(HY + NOSE_TIP_L * W + .20 * W), float(CHIN + .10 * W)]
        joints['eyes'] = {'R': eye_centers['R'], 'L': eye_centers['L']}
        joints['ears'] = {t: {k: [float(v) for v in ear_info[t][k]] for k in ('base', 'mid', 'tip')} for t in ('R', 'L')}
        joints['arms'] = {t: {k: ARM[t][k] for k in ('shoulder', 'elbow', 'wrist')} for t in ARM}
        joints['legs'] = LEG
        joints['palm_R'] = ARM['R']['palm']; joints['palm_L'] = ARM['L']['palm']
        P = TAIL['P']; n_ = len(P); idx = [0, n_ // 4, n_ // 2, (3 * n_) // 4, n_ - 3, n_ - 1]
        joints['tail'] = [[round(float(c), 4) for c in P[i]] for i in idx]
        joints['tailRoot'] = [float(v) for v in TAIL_ROOT]
        joints['mouth'] = MOUTH_INFO
        joints['headband'] = LOG['band']
        joints['obi'] = LOG['obi']
        joints['ears'] = {t: {k: [float(v) for v in ear_info[t][k]] for k in ('base', 'top', 'mid', 'tip')} for t in ('R', 'L')}
        joints['notes'] = ['Phase 1: no rig, weights or animations. Same keys as the Toybox heroes / Kazemaru joints.json.',
                           'head = the head-ball centre (the radial origin), not the nod pivot; head_base = a suggested nod pivot at the base of the skull.',
                           'Head skin = zero surface of one smooth implicit field (skull + cheek mass + snout + chin + nose), analytic normals; no eye sockets.',
                           'Mouth: a sculpted "w" smile groove (closed) with 5 loops round it; the skin is cut along the parting (see mouth).',
                           'Eyelid holes ringed by 6 loops each, the rim rolled 4.5 mm in behind separate lens eyeballs; 5 loops round the nose.',
                           'Upper lashes: separate rolls Tobi_lash_L / _R (no lash paint on the skin): weight them 100% to lidU_L / _R.',
                           'Ears: separate floppy pieces (Tobi_ear_L / _R), 34 bend rings along the spine from the root (sunk in the dome) over the fold to the lobe; ears.base = root (pivot), top = the fold, mid, tip = the lobe.',
                           'Headband (Tobi_band): the ring and the square knot pad at the back (rigid with the head).',
                           'Tail: a separate piece (Tobi_tail), 26 bend rings from the root (inside the gi skirt) to the tip; pivot = tailRoot; chain = tail.',
                           'Sleeves (Tobi_sleeve_L/_R): separate shells with 11 rings; the gi skirt (Tobi_gi_skirt) 6 rings; the trouser legs (Tobi_hakama) 10 rings each.']
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
    """the upper lash outline (sheet): thickest over the top (0.019 W), thinning down the outer side to below the outer corner and into
    the inner corner; no line under the eye. psi: 0 = outer corner, pi/2 = top, pi = inner corner (radius units of the opening)"""
    p = np.where(psi < -PI / 2, psi + 2 * PI, psi)              # -pi/2 .. 3 pi/2, continuous over the top
    top = 1.50 * (.105 * np.sin(np.clip(p, 0, PI)) ** .70 + .040 * np.exp(-((p - .75) / .55) ** 2))
    base = .045 * smooth(-.70, -.10, p) * smooth(PI + .40, PI - .10, p)
    outer = .090 * smooth(-.70, -.10, p) * (1 - smooth(.30, .80, p))
    return top + base + outer
def paint_hit(d):
    P = radial_hit(d); t = np.linalg.norm(P - O, axis=1)
    bad = np.zeros(len(d), bool)
    for k in range(1, 9):
        tk = np.minimum(t + .012 * k, .52); bad |= head_sdf(O + d * tk[:, None]) < 0
    if bad.any(): P[bad] = radial_hit_outer(d[bad])
    return P
def ell_r(q, c, r): return np.sqrt((((q - np.array(c)) / np.array(r)) ** 2).sum(1))
def white_face(q, n):
    """the cream muzzle patch (front projection, W units): a soft egg round the snout (centre z 0.19, 0.212 W half-wide, its top at
    z 0.335, its bottom 0.065), plus the chin's underside and the neck (cream, like the chest V)."""
    qx, qy, qz = q[:, 0], q[:, 1], q[:, 2]; ax_ = np.abs(qx)
    hz = np.where(qz > .19, .145, .158)
    r = (np.abs(qx / .212) ** 2.2 + np.abs((qz - .19) / hz) ** 2.2) ** (1 / 2.2)
    aa = .045
    m = (1 - smooth(1 - aa, 1 + aa, r)) * smooth(-.20, -.32, qy)                  # front only (the snout)
    under = smooth(-.55, -.85, n[:, 2]) * smooth(.20, .12, ax_) * smooth(-.10, -.25, qy) * (qz < .05)
    neck = smooth(.0, -.04, qz) * smooth(.02, -.08, qy) * smooth(.26, .18, ax_)
    return clamp(np.maximum.reduce([m, under, neck]))
def paint_head(U, V, P=None):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = paint_hit(d) if P is None else P; n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); qx, qz = q[:, 0], q[:, 2]; ax_ = np.abs(qx)
    fr = smooth(HY + .04, HY - .08, y)
    C = ramp_colour('fur', sval(n, hi=.12, lo=.20))
    # soft clay creases where the muzzle, the chin and the tufts meet the skull (fillet shading, never lines)
    dsk = skull(q); dch = smin(dsk, ell(q, *CHEEK), K_CHEEK)
    cr = .22 * crease(dch, muz_sdf(q), K_MUZ) + .18 * crease(smin(dch, muz_sdf(q), K_MUZ), ell(q, *CHINB), K_CHINB)
    C = mix(C, rgb('furdark'), clamp(cr) * .35)
    # the ears' contact shade on the head where the ears lie over it (a soft value-only shade, no hue shift)
    dear = np.abs(qx) - (drape(q[:, 1], qz) - .03)
    C = mix(C, rgb('furdark'), .30 * smooth(-.10, .0, dear) * smooth(-.18, .0, q[:, 1]) * smooth(.84, .76, qz) * smooth(.06, .14, qz))
    # the white lower face
    wm = white_face(q, n)
    C = mix(C, ramp_colour('white', sval(n, hi=.10, lo=.16) - .06 * smooth(.10, -.05, qz)), wm)
    # blush, over the white / fur border on the cheeks
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .92 * (1 - smooth(.55, 1.08, r)) * fr * PAINT_OPTS['blush'])
    # brows: soft dark arcs (sheet: centres +-0.205 W at 0.519 W, 0.111 W long, 0.044 W tall with the arc), rounded ends
    t_ = np.linspace(-1, 1, 13)
    for s in (-1, 1):
        Pb = np.stack([s * (.239 + .058 * t_), .546 + .016 * (1 - t_ ** 2) - .008 * t_], -1)
        hb = .0030 + .0118 * (1 - t_ ** 2) ** .65
        near = (np.abs(qx - s * .239) < .10) & (qz > .49) & (qz < .62)
        a = np.zeros(len(x)); a[near] = stroke(qx[near], qz[near], Pb, hb, .0045)
        C = mix(C, rgb('brow'), .95 * a * fr)
    # nose: dark, a soft top highlight
    qq = q - NOSE_C; qq[:, 1] = qq[:, 1] - nose_recede(qq[:, 2]); widen = nose_widen(qq[:, 2]); qq[:, 2] = qq[:, 2] * nose_flat(qq[:, 2])
    rn = np.sqrt((qq[:, 0] / (NHW * widen)) ** 2 + (qq[:, 1] / NHD) ** 2 + (qq[:, 2] / NHH) ** 2)
    zr_ = (qz - NZW) / NHH; hw_ = NOSE_PW * (.28 + .72 * smooth(-1.0, .65, zr_)) * np.sqrt(np.clip(1 - np.clip(zr_ - .55, 0, 1) ** 2 / .45 ** 2 * .35, 0, 1))
    r2d = np.sqrt((qx / np.maximum(hw_, 1e-4)) ** 2 + ((zr_ - .03) / 1.03) ** 2)
    deep = (q[:, 1] - NOSE_TIP_L)
    nose_m = (1 - smooth(.94, 1.02, r2d)) * smooth(.07, .05, deep) * (n[:, 1] < .2)
    nose_c = ramp_colour('nose', sval(n, hi=.10, lo=.22) - .02)
    C = mix(C, nose_c, .98 * np.maximum(nose_m, 1 - smooth(1.05, 1.12, rn)))
    rh_ = np.sqrt(((qq[:, 0] + .007) / .017) ** 2 + ((qq[:, 2] - .012) / .007) ** 2) + 9 * (qq[:, 1] > .014)
    C = mix(C, rgb('nosehi'), .65 * (1 - smooth(.40, 1.0, rh_)) * np.maximum(rn < 1.10, nose_m > .5))
    # the sculpted mouth: no painted line; a darker shade on the groove walls only, by depth behind the un-grooved surface
    mb = (fr > 0) & mouth_mask(q) & (q[:, 2] < NZW - .80 * NHH)
    if mb.any():
        dep = -head_local_pre(q[mb])
        C[mb] = mix(C[mb], rgb('#D8B49A'), .35 * smooth(.0004, .0020, dep))      # only a whisper of the sculpted groove
    # round 2: the painted smile line (#493044, 0.012 W): one clean curve each side from the philtrum out to gently curled corners
    t_m = np.linspace(-1.03, 1.03, 61); Pm = mouth_arch(t_m)
    hm = .0056 * (1 - .40 * smooth(.80, 1.03, np.abs(t_m))) + .0012
    Pp = np.array([[0, NZW - NHH + .004], [0, MA_C + MA_CUSP]]); hp = np.array([.0050, .0056])
    nm = (fr > 0) & (np.abs(qx) < .15) & (qz > .10) & (qz < NZW)
    if nm.any():
        a = np.maximum(stroke(qx[nm], qz[nm], Pm, hm, .0026), stroke(qx[nm], qz[nm], Pp, hp, .0026))
        C[nm] = mix(C[nm], rgb('brow'), .96 * a)
    # the eyes: the thick dark upper lash with a small outer wing; a soft warm line under the outer half only
    for s in (-1, 1):
        sr, psi, X, Z = eye_s3(s, P)
        near_eye = fr * (sr < 2.2)
        th = lash_th(psi)
        lash = (1 - smooth(1 + th - .016, 1 + th + .016, sr)) * smooth(.004, .02, th)
        wing = np.zeros(len(x)); nw = near_eye > 0
        tt_ = np.linspace(0, 1, 7)
        Pw = np.stack([1.00 + .24 * tt_, .36 + .20 * tt_ ** 1.2], -1)
        hw_w = .120 * (1 - .80 * tt_) + .010
        wv = np.zeros(len(x)); wv[nw] = stroke(X[nw], Z[nw], Pw, hw_w, .014); wing = np.maximum(wing, wv)
        C = mix(C, rgb('lash'), np.maximum(lash, wing) * PAINT_OPTS['lash'] * near_eye)
    return C.reshape(sh + (3,))

AA_COUNT = [0]
def paint_head_aa(U, V):
    """the head chart, with 3x3 supersampling where the thin painted lines live (the mouth groove shade, the nose edge)"""
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P0 = paint_hit(d); q = M2L(P0); C = paint_head(U, V, P0)
    front = (np.abs(q[:, 0]) < .18) & (q[:, 2] > .08) & (q[:, 2] < .27) & (q[:, 1] < -.30)
    near = np.zeros(len(q), bool)
    if front.any():
        qf = q[front]; _ma2 = mouth_arch(np.linspace(-1.05, 1.05, 90), True)
        dm = np.min(np.hypot(qf[:, 0:1] - _ma2[None, :, 0], qf[:, 2:3] - _ma2[None, :, 1]), axis=1)
        dph = np.where((qf[:, 2] < NZW) & (qf[:, 2] > MA_C - .005), np.abs(qf[:, 0]), 9.)
        zr_ = (qf[:, 2] - NZW) / NHH
        hw_ = NOSE_PW * (.28 + .72 * smooth(-1.0, .65, zr_)) * np.sqrt(np.clip(1 - np.clip(zr_ - .55, 0, 1) ** 2 / .45 ** 2 * .35, 0, 1))
        r2d = np.sqrt((qf[:, 0] / np.maximum(hw_, 1e-4)) ** 2 + ((zr_ - .03) / 1.03) ** 2)
        near[np.where(front)[0]] = (dm < .014) | (dph < .008) | ((r2d > .80) & (r2d < 1.20))
    if near.any():
        x0, y0, w, h = CHARTS['head']; du = 1. / (w - 12); dv = 1. / (h - 12)
        Uf = U.ravel()[near]; Vf = V.ravel()[near]; acc = np.zeros((len(Uf), 3))
        for a in (-1 / 3, 0., 1 / 3):
            for b in (-1 / 3, 0., 1 / 3):
                acc += paint_head(Uf + a * du, Vf + b * dv)
        Cf = C.reshape(-1, 3); Cf[near] = acc / 9; C = Cf.reshape(sh + (3,))
    AA_COUNT[0] += int(near.sum())
    return C

IRIS_RX_W, IRIS_RZ_W = .0715, .0915                  # the iris (sheet close-up): 0.143 x 0.183 W, a tall oval
def paint_eye(U, V, s):
    Xs = (U - .5) * 2.4; Z = (V - .5) * 2.4         # Xs: screen right (the chart's u runs to screen right for both eyes)
    Xo = s * Xs                                      # outward
    sr = eye_norm(Xo, Z)[0]
    hw = EYEF[s]['hw'] / W; hh = EYEF[s]['hh'] / W
    Xm = Xo * hw; Zm = Z * hh                        # metric eye-plane coordinates (W units), outward / up
    ixm = -.033; izm = -.010                         # the iris tucked toward the nose; white crescents on the outer side
    C = mix(rgb('sclera'), rgb('#EADCD4'), .55 * smooth(.25, .95, Z))
    ex = (Xm - ixm) / IRIS_RX_W; ez = (Zm - izm) / IRIS_RZ_W; r = np.sqrt(ex * ex + ez * ez)
    g = smooth(.70, -.85, ez)                        # 0 at the top .. 1 at the bottom
    I = mix(rgb('#24140E'), rgb('#4A2C1E'), smooth(.15, .55, g))
    I = mix(I, rgb('iris'), smooth(.45, .80, g))
    I = mix(I, rgb('irisglow'), .55 * smooth(.72, 1.0, g) * (1 - smooth(.60, .92, r)))
    I = mix(I, rgb('#2A1810'), .70 * smooth(.86, .99, r))
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    pxm = ixm; pzm = izm + .012
    Rp = np.sqrt(((Xm - pxm) / .046) ** 2 + ((Zm - pzm) / .062) ** 2)
    C = mix(C, rgb('#1E120E'), .55 * (1 - smooth(.90, 1.10, Rp)))
    # catchlights (sheet): a big round one high on the iris's centre line, a small one low on the outer side
    big = np.sqrt(((Xm - (ixm + .002)) / .0175) ** 2 + ((Zm - (izm + .052)) / .0185) ** 2)
    small = np.sqrt(((Xm - (ixm + .036)) / .0075) ** 2 + ((Zm - (izm - .060)) / .0060) ** 2)
    C = mix(C, rgb('#FFFBF6'), np.maximum(1 - smooth(.90, 1.08, big), .85 * (1 - smooth(.86, 1.12, small))))
    C = mix(C, rgb('lash'), smooth(.90, 1.0, sr) * smooth(-.30, .30, Z))
    skin = ramp_colour('fur', .45)
    return mix(C, skin, smooth(1.03, 1.07, sr))

LIGHT_SYM = unit(np.array([0., -.35, 1.]))
def sval_sym(n, hi=.26, lo=.22, occ=0.):
    d = np.asarray(n) @ LIGHT_SYM
    return clamp(.50 + hi * smooth(.0, .95, d) - lo * smooth(.05, .95, -d) - occ)
def paint_ear(U, V):
    """the floppy ears: u = around the section (theta), v = root .. lobe; tan fur shaded by the ear's own normals (value only, a
    symmetric light, so both ears share the chart), a soft shade on the face toward the head and toward the lobe's underside"""
    sh = U.shape; u = U.ravel(); v = V.ravel()
    s_, NG = EAR_GRID['L']; R, C_ = NG.shape[:2]
    fk = np.interp(v, s_, np.arange(R)); k0 = np.clip(fk.astype(int), 0, R - 2); tk = fk - k0
    fj = np.clip(u * (C_ - 1), 0, C_ - 1.001); j0 = fj.astype(int); tj = fj - j0
    n = (NG[k0, j0] * ((1 - tk) * (1 - tj))[:, None] + NG[k0 + 1, j0] * (tk * (1 - tj))[:, None] + NG[k0, j0 + 1] * ((1 - tk) * tj)[:, None]
         + NG[k0 + 1, j0 + 1] * (tk * tj)[:, None])
    n = unit(n); n[:, 0] = np.abs(n[:, 0])
    th = u * 2 * PI; inner = smooth(-.2, -.8, np.sin(th))
    sv = sval_sym(n, hi=.22, lo=.22) - .12 * inner
    return ramp_colour('ear', sv).reshape(sh + (3,))
def paint_tail(U, V):
    sh = U.shape; U = U.ravel(); V = V.ravel()
    ph = U * 2 * PI; k = V * (TAIL['rings'] - 1)
    tk = TAIL['tk']; idx = np.clip(np.searchsorted(tk, V) - 1, 0, len(tk) - 2); f = clamp((V - tk[idx]) / (tk[idx + 1] - tk[idx]))
    Bv = unit(TAIL['B'][idx] * (1 - f[:, None]) + TAIL['B'][idx + 1] * f[:, None]); Xv = TAIL['X'][idx]
    n = unit(Xv * np.sin(ph)[:, None] - Bv * np.cos(ph)[:, None])
    sv = sval(n, hi=.24, lo=.24, occ=.12 * smooth(.20, .0, V))
    # the white tip (sheet): lower on the outer / back side of the curve (phi = pi) than on the inner side, with a soft flame edge
    tw = .700 + .060 * np.cos(ph) + .028 * np.sin(3 * ph + .6) + .030 * np.abs(np.sin(5 * ph + 1.9)) + .010 * np.sin(11 * ph + .3)
    wht = smooth(-.012, .012, V - tw)
    C = ramp_colour('fur', sv)
    C = mix(C, mix(ramp_colour('white', sv + .04), rgb('#F8F6FA'), .65), wht)          # a cool white tip (the face white is warmer)
    C = mix(C, rgb('furdark'), .25 * smooth(.10, .0, V))
    return C.reshape(sh + (3,))
def paint_torso(U, V):
    sh = U.shape; U = U.ravel(); V = V.ravel()
    a = U * 2 * PI - PI; z = TZ[0] + V * (TZ[-1] - TZ[0])
    P = torso_raw(a, z); n = torso_n(a, z); x = P[:, 0]
    sv = sval(n, hi=.24, lo=.20)
    hw = np.where(z > ZN, VHW, white_hw(z))
    white = (1 - smooth(-.002, .002, np.abs(x) - hw)) * (np.cos(a) > 0) * smooth(ZX - .004, ZX + .004, z)
    C = ramp_colour('gi', sv + .04)
    C = mix(C, ramp_colour('white', sv - .02), white)
    C = mix(C, rgb('gidark'), .35 * smooth(.42, .34, z))               # a soft shade into the belt
    C = mix(C, rgb('#D8CCD0'), .45 * white * smooth(ZX + .06, ZX, z))  # the V's point in the lapels' shade
    return C.reshape(sh + (3,))
def paint_ramp(U, V):
    rows = np.clip((V * CHARTS['ramp'][3] / 32).astype(int), 0, 15); C = np.zeros(U.shape + (3,))
    for name, k in RAMP_ROWS.items():
        m = rows == k
        if not m.any(): continue
        C[m] = ramp_colour(name, U[m])
    return C
def paint_furmix(U, V): return mix(ramp_colour('fur', U), ramp_colour('white', U), V)          # v: 0 orange fur .. 1 white fur
def paint_kimmix(U, V): return mix(ramp_colour('gi', U), mix(ramp_colour('gi', U + .20), rgb('#6C88A8'), .30), V)          # v: tone (lighter)
def paint_skmix(U, V): return mix(ramp_colour('hakama', U), mix(ramp_colour('hakama', U + .16), rgb('#4E6278'), .30), V)
PAINTERS = {'head': paint_head_aa, 'eye.L': lambda U, V: paint_eye(U, V, 1), 'eye.R': lambda U, V: paint_eye(U, V, -1),
            'ramp': paint_ramp, 'furmix': paint_furmix, 'kimmix': paint_kimmix, 'skmix': paint_skmix, 'ear': paint_ear}
if not HEAD_ONLY: PAINTERS.update({'torso': paint_torso})
if RIG:
    PAINTERS['cavity'] = lambda U, V: mix(rgb('#4a1c2c'), rgb('#341220'), .55 * smooth(.25, 1., V))
    PAINTERS['tongue'] = lambda U, V: mix(rgb('#e07a8e'), rgb('#ee9aac'), .45 * smooth(.15, .9, V))
atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [232, 194, 146, 255]
MIX_CHARTS = ('furmix', 'kimmix', 'skmix')
FAST_PAINT = os.environ.get('FASTPAINT') == '1'
for name, (x0, y0, w, h) in CHARTS.items():
    if name not in PAINTERS: continue
    print('PAINT', name, flush=True)
    if name == 'ramp':
        U, V = np.meshgrid(clamp((np.arange(w) - 8) / (w - 16)), (np.arange(h) + .5) / h)
    elif name in MIX_CHARTS:
        U, V = np.meshgrid(clamp((np.arange(w) - 8) / (w - 16)), clamp((np.arange(h) - 8) / (h - 16)))
    else:
        U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
    block = np.empty((h, w, 3))
    if FAST_PAINT and name in ('head',):      # FASTPAINT=1: geometry iterations only (a quarter-resolution head chart)
        Us, Vs = U[::4, ::4], V[::4, ::4]; bs_ = np.empty(Us.shape + (3,))
        for r0 in range(0, Us.shape[0], 64): bs_[r0:r0 + 64] = PAINTERS[name](Us[r0:r0 + 64], Vs[r0:r0 + 64])
        block[:] = np.repeat(np.repeat(bs_, 4, 0), 4, 1)[:h, :w]
    else:
        for r0 in range(0, h, 64):
            block[r0:r0 + 64] = PAINTERS[name](U[r0:r0 + 64], V[r0:r0 + 64])
    atlas[y0:y0 + h, x0:x0 + w, :3] = np.round(clamp(block) * 255).astype(np.uint8)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
def write_png(path, arr):
    h_, w_ = arr.shape[:2]; raw = b''.join(b'\x00' + r.tobytes() for r in arr[::-1])
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w_, h_, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
atlas_path = os.path.join(ROOT, 'scratch', 'head_atlas.png') if HEAD_ONLY else (os.path.join(ROOT, 'scratch', 'rig_base_atlas.png') if RIG else os.path.join(ROOT, 'ak-tobi-toy_atlas.png'))
write_png(atlas_path, atlas)
del atlas
img = bpy.data.images.load(atlas_path); img.name = 'Tobi_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Tobi_toy_atlas'); MAT.use_nodes = True
bs = next(n_ for n_ in MAT.node_tree.nodes if n_.type == 'BSDF_PRINCIPLED'); bs.inputs['Roughness'].default_value = .8
bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .25
tx = MAT.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
MAT.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])

# ============================================================== THE UPPER LASH: its own object per eye (the Takemori lesson)
# A thick tapered roll lying on the skin where the lash goes (the opening's superellipse from just inside the rim, k 0.965, out to
# 1 + lash_th(psi)), its face 6 mm proud of the skin and its back 1 cm inside it (hidden at rest; the rig weights it 100% to lidU), with
# the small wing flick at the outer corner (sheet: out to 1.2 x the half-width at +0.28 of the half-height). No lash paint on the skin.
LASH_OFF, LASH_IN = .0060, .0100
def lash_roll(tag):
    s = 1 if tag == 'L' else -1
    ps = np.linspace(.12, PI + .14, 26); th = np.maximum(np.asarray(lash_th(ps), float), .035)
    rows = []
    for fr in (0., .50, 1.):
        k = .965 + (1 + th - .965) * fr
        rows.append(np.array([eye_pts(s, np.array([p_]), float(k_))[0] for p_, k_ in zip(ps, k)]))
    G = np.array(rows).transpose(1, 0, 2)
    tt = np.linspace(0, 1, 7); pw = .30 + .06 * tt; kw = 1.00 + .24 * tt; dw = .11 * (1 - .80 * tt) + .012
    Gw = np.array([[eye_pts(s, np.array([p_ - d_]), float(k_))[0], eye_pts(s, np.array([p_ + d_]), float(k_))[0]] for p_, k_, d_ in zip(pw, kw, dw)])
    V = []; F = []
    for Gg in (G, Gw):
        nc, nr = Gg.shape[:2]; N_ = grad(head_sdf, Gg.reshape(-1, 3)).reshape(Gg.shape)
        Out = Gg + N_ * LASH_OFF; In = Gg - N_ * LASH_IN
        loop = np.concatenate([Out, In[:, ::-1]], 1); m = loop.shape[1]; b0 = len(V)
        V += list(loop.reshape(-1, 3))
        for i in range(nc - 1):
            for j in range(m):
                jj = (j + 1) % m; F.append((b0 + i * m + j, b0 + (i + 1) * m + j, b0 + (i + 1) * m + jj, b0 + i * m + jj))
        for i_end, rev in ((0, True), (nc - 1, False)):
            c = len(V); V.append(loop[i_end].mean(0))
            for j in range(m):
                jj = (j + 1) % m; f = (b0 + i_end * m + j, b0 + i_end * m + jj, c); F.append(f[::-1] if rev else f)
    V = np.array(V); uvc = ramp_uv('eyedark', np.array([.40]))[0]
    return make_obj('lash.' + tag, V, F, np.tile(uvc, (len(V), 1)), 'lash.' + tag)
for _t in 'LR': lash_roll(_t)
# ============================================================== MEASURE (before joining)
def all_verts(obs): return np.array([list(o.matrix_world @ v.co) for o in obs for v in o.data.vertices])
nose_tip_y = HY + NOSE_TIP_L * W
rimL = np.array([verts[i] for i in roll_info[1][0]])
HR = head_report()
MEAS = {'units': 'W = %.3f m head width; z = above the chin in W' % W,
        'chin_z_m': CHIN, 'skull_top_m': LOG['skull_top_m'], 'crest_top_m': LOG['skull_top_m'],
        'heads_crown_to_chin': round(LOG['skull_top_m'] / (LOG['skull_top_m'] - CHIN), 3),
        'face_half_widths_W(z: x)': HR['half_widths(z: x)'], 'profile_front_W(z, y from HY)': HR['profile_front(z, y)'],
        'profile_back_W(z, y from HY)': HR['profile_back(z, y)'], 'silhouette_front_W(z: y from HY)': HR['silhouette_front(z: y)'],
        'nose_tip_y_m': round(float(nose_tip_y), 4), 'head_depth_W(z 0.34)': HR['depth_at_z.34_W'],
        'eye_opening_W(front projection)': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'eye_centre_W': [EXW, EZW], 'iris_width_over_opening_width(front)': round(2 * IRIS_RX_W * math.cos(math.radians(15)) / float(np.ptp(rimL[:, 0]) / W), 3),
        'nose_centre_z_W': NZW, 'nose_width_W(painted)': round(2 * NOSE_PW, 3), 'nose_height_W': round(2 * NHH, 3),
        'mouth_corner_W': [MA_X, round(float(mouth_arch(np.array([1.]), True)[0, 1]), 3)], 'mouth_low_z_W': MA_C,
        'mouth': {k: v for k, v in MOUTH_INFO.items() if k not in ('parting_upper_m', 'parting_lower_m')}}
for tag in ('L', 'R'):
    if 'ear.' + tag in parts:
        ev = all_verts(parts['ear.' + tag]); q_ = M2L(ev)
        MEAS['ear_' + tag] = {'top_z_W': round(float(q_[:, 2].max()), 3), 'bottom_z_W': round(float(q_[:, 2].min()), 3), 'top_z_m': round(float(ev[:, 2].max()), 3),
                              'x_range_W': [round(float(np.abs(q_[:, 0]).min()), 3), round(float(np.abs(q_[:, 0]).max()), 3)],
                              'y_range_W': [round(float(q_[:, 1].min()), 3), round(float(q_[:, 1].max()), 3)]}
MEAS.update(LOG)
MEAS.update(BODY_MEAS)

# ============================================================== JOIN, CLEAN, NORMALS
objects = []; part_tri = {}
PIVOTS = {'head': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'], 
          'ear.L': tuple(ear_info['L']['base']), 'ear.R': tuple(ear_info['R']['base']), 'lash.L': eye_centers['L'], 'lash.R': eye_centers['R']}
PIVOTS.update(BODY_PIVOTS)
OBJ_TRIS = {}
for group, obs in parts.items():
    for ob in obs: ob.data.calc_loop_triangles(); OBJ_TRIS[ob.name] = len(ob.data.loop_triangles)
print('OBJ_TRIS', json.dumps(dict(sorted(OBJ_TRIS.items(), key=lambda kv: -kv[1])[:70])), flush=True)
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
    ob = finish_group(obs, OBJ_NAMES.get(group, 'Tobi_' + group.replace('.', '_')), PIVOTS.get(group, (0, 0, 0)), MAT)
    ob['phase'] = '1: neutral A-pose, no armature'
    part_tri[ob.name] = len(ob.data.loop_triangles); objects.append(ob)
tri_count = sum(part_tri.values()); print('PART_TRIANGLES', json.dumps(part_tri), flush=True)
HEADSET = sum(v for k, v in part_tri.items() if k in ('Tobi_head', 'Tobi_eye_L', 'Tobi_eye_R', 'Tobi_ear_L', 'Tobi_ear_R', 'Tobi_lash_L', 'Tobi_lash_R'))
MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count; MEAS['head_eyes_ears_triangles'] = HEADSET
_allv = np.concatenate([all_verts([o]) for o in objects])
MEAS['bounds_m'] = {'min': [round(float(c), 3) for c in _allv.min(0)], 'max': [round(float(c), 3) for c in _allv.max(0)]}
if RIG:
    pass
elif not HEAD_ONLY:
    if not os.environ.get('TOBI_NO_BUDGET'): assert tri_count <= 30000, ('Triangle budget', tri_count)
    if POST_JOIN: POST_JOIN()
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-head.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
if not RIG: print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not HEAD_ONLY and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'ak-tobi-toy.blend'))
def export_sel(obs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs: ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                              export_animations=False)
if not RIG: export_sel(objects, OUT_MODEL)
print('TOBI_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
