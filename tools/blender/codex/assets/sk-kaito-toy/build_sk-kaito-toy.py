"""Kaito, the deckhand of Shiokaze Port (a zone villager, the fishing port), Toybox line: phase 1, the model in a neutral A-pose
(refs/sheet.png "Kaito - Deckhand", approved by the director). Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_sk-kaito-toy.py [-- --head-only]
    python build_sk-kaito-toy.py --tune          (plain Python: prints the head field's profile / widths, then stops)

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/sk-kaito-toy.glb (--head-only writes scratch/ instead).

Assembled by src/assemble.py from src/p*.py. The machinery is the Kaede / Kazemaru builds' (tools/blender/codex/assets/ak-kaede-toy),
re-measured and re-dressed for Kaito.

Technique (the Toybox machinery of Poe / Moka / Stella / Tamamo / Kitsune / Kazemaru / Kaede):
- The head is ONE smooth implicit field: a broad deep mochi skull, a low wide cream cheek mass with soft pointed cheek tufts sweeping
  out and back, a short rounded fox muzzle, a soft chin and a rounded dark nose. No eye sockets: the face stays convex. The skin is the
  field's zero surface reached by radial projection (CDT in a stereographic domain, with edge loops round the eyelids, nose and mouth),
  so every vertex carries its analytic normal. Adaptive refinement adds points where the game's toon band would zigzag.
- The mouth is SCULPTED (a soft groove along the small "U" smile) with a painted line, and the skin is cut along it (rig-ready).
- The eyes are separate lens globes following the ball, facing 30 deg outward; big teal irises tucked toward the nose.
- The ears are big thick rounded pyramids (a loft of D-shaped rings) on the head's top corners, painted in their own chart (a big pink
  inner triangle, dark plum caps).
- The white sailor shirt is a lofted, thickened shell with a hem rim; the puffy short sleeves end in rolled cuffs; the navy sailor collar
  is a thick shell draped on the shoulders (two lapels meeting in a V at the chest, a square flap on the back); the red scarf is a round
  knot at the V with two broad leaf ends; the navy shorts are two baggy legs sharing a flush seat, with rolled cuffs.
- The tail is a separate big egg-shaped plume rising behind him, with bend rings, painted in its own chart (a cream tip).
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
MODEL = MODELS + '/sk-kaito-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'kaito-head-test.glb') if HEAD_ONLY else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(29)
if not TUNE: bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
# ---- proportions, measured on refs/sheet.png (measure.md): the front turnaround's crown is at sheet y 137, the chin at 307, the feet's
# soles at 511 (374 px = 0.99 m, 2.647 mm / px); the head is 229 px wide at eye level (W = 0.606 m). The turnaround draws the head
# 0.742 W tall, the head close-up 0.776 W (its features sit proportionally higher too): the model takes 0.75 W, and every face height is
# the two views' mean as a fraction of the head height. Normalised that way the two views' outlines agree within 0.01 W.
T_CROWN = 0.990                 # the crown (the sheet's 0.99 m; the ear tips stand at 1.14 m)
W = 0.606                       # head width at eye level (the cheek tufts stand out past it, 0.575 W each side)
CROWN_W = .750                  # skull top above the chin, in W
CHIN = round(T_CROWN - CROWN_W * W, 4); HY = round(.157 * W, 4)
LOG = {'T_CROWN': T_CROWN, 'W': W, 'CHIN': CHIN}

# the data's colours; dark navy painted lighter (the dark-cloth lesson), the plain white shirt kept under #fff6ea, the fur's shading
# value-only (no hue shift)
PAL = {'fur': '#FF9A4A', 'furlight': '#FFAC62', 'furdark': '#E2873E',
       'white': '#FDE9D6', 'whitelight': '#FFF4E8', 'whitedark': '#F0D2B8',
       'shirt': '#F6F0EC', 'shirtlight': '#FFF6EA', 'shirtdark': '#DCCFCF',
       'navy': '#3C5A84', 'navylight': '#4C6C98', 'navydark': '#2E4A6E',
       'scarf': '#E8503A', 'scarflight': '#F4664A', 'scarfdark': '#C63E2E',
       'inner': '#FDAA96', 'innerlight': '#FFBEAC', 'innerdark': '#EC9482',
       'ear': '#FF8A3A', 'earlight': '#FF9C50', 'eardark': '#E27832',
       'tip': '#553846', 'tiplight': '#674656', 'tipdark': '#452E3A',
       'nose': '#493044', 'nosehi': '#7C5C6E', 'nosedark': '#382434',
       'iris': '#3A8AA0', 'irisdark': '#1C4656', 'irisglow': '#6CC0CE', 'pupil': '#1C2026',
       'sclera': '#FFF8F2', 'lash': '#3A2430', 'brow': '#4A2E3A', 'blush': '#FFA3A0', 'mouth': '#493044', 'dark': '#2A2230'}
CHARTS = {'head': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'furmix': (1280, 896, 256, 256), 'shirtmix': (1536, 896, 256, 256),
          'navymix': (1792, 896, 256, 256), 'ear': (0, 0, 768, 768), 'tail': (768, 0, 768, 768)}
if RIG:
    CHARTS.update({'lidU_L': (1536, 0, 256, 192), 'lidU_R': (1792, 0, 256, 192), 'lidD_L': (1536, 192, 256, 128), 'lidD_R': (1792, 192, 256, 128),
                   'cavity': (1536, 320, 128, 128), 'tongue': (1664, 320, 128, 128)})          # (the lids painted per side, never mirrored)
PAINT_OPTS = {'lash': False, 'blush': True, 'eyeband': False}     # (no contact shade under the lash: no grey ring round the shut eye)          # the upper lash is a 3-D roll (Kaito_lash_L/R), never paint on the skin
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'white': ('whitedark', 'white', 'whitelight'),
         'shirt': ('shirtdark', 'shirt', 'shirtlight'), 'navy': ('navydark', 'navy', 'navylight'),
         'scarf': ('scarfdark', 'scarf', 'scarflight'),
         'nose': ('nosedark', 'nose', '#5C4054'), 'eyedark': ('#2A1C24', '#3A2430', '#4E3442'),
         'lining': ('#BEB2B4', '#CEC2C4', '#DCD2D2'), 'tip': ('tipdark', 'tip', 'tiplight'), 'inner': ('innerdark', 'inner', 'innerlight'),
         'ear': ('eardark', 'ear', 'earlight'), 'navylining': ('#243A58', '#2C4466', '#344E72')}
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
# Targets (measure.md; W units; z above the chin with the head 0.738 W tall; y local = from HY, which sits 0.127 W behind the body axis):
#   front half-widths z 0.023: 0.33, 0.045: 0.385, 0.068: 0.43, 0.091: 0.465, 0.114: 0.49, 0.136: 0.51, 0.159: 0.53, 0.182: 0.54,
#   0.205: 0.54, the tufts 0.575 at z 0.25-0.27, 0.318: 0.525, 0.341: 0.515, 0.386: 0.504, 0.43: 0.487 (the ear flanks keep 0.50 above);
#   profile (front, local y) z 0.689: -0.242, 0.603: -0.361, 0.517: -0.414, 0.431: -0.443, 0.344: -0.447, 0.287: -0.457, the nose tip
#   -0.553 at z ~0.245, 0.201: -0.534, 0.144: -0.519, 0.086: -0.481, 0.029: -0.419; (back) 0.603: 0.347, 0.517: 0.399, 0.431: 0.428,
#   0.344: 0.447, 0.258: 0.438, 0.172: 0.38, 0.115: 0.323, 0.086: 0.275. A deep round mochi: 0.89 W deep, 1.0 W wide.
SK = dict(a=.488, zc=.360, cu=.392, cd=.360, n=2.50, n_top=2.45, bf=.428, bb=.436, taper=.0, ta0=.39, ta1=.68, t0=.46, t1=.70, m=2.10, m_top=2.45)
def skull(q):
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    zr = z - SK['zc']; c = np.where(zr > 0, SK['cu'], SK['cd'])
    a = SK['a'] * (1 - SK['taper'] * smooth(SK['ta0'], SK['ta1'], z)); n = SK['n'] + (SK['n_top'] - SK['n']) * smooth(SK['t0'], SK['t1'], z)
    ax_ = np.abs(x) / a + 1e-9; az_ = np.abs(zr) / c + 1e-9
    s = (ax_ ** n + az_ ** n) ** (1 / n)
    b = np.where(y < 0, SK['bf'], SK['bb']); ay_ = np.abs(y) / b + 1e-9
    mm = SK['m'] + (SK['m_top'] - SK['m']) * smooth(SK['t0'], SK['t1'], z)     # a squarer top-back in profile (the sheet's full crown)
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
# the low wide cheek mass (the face is widest at the cheeks, 0.19 W above the chin), soft pointed cheek tufts at its sides sweeping out
# and back, the short rounded fox muzzle (in profile it projects ~0.09 W past the face), a soft chin under it and the neck under the collar
CHEEK = [[0, -.030, .190], [.528, .360, .210]]; K_CHEEK = .140
TUFT_A, TUFT_B, TUFT_R = [.320, -.110, .285], [.522, .130, .262], (.140, .058); K_TUFT = .050
MUZ = [[0, -.395, .200], [.200, .130, .105]]; K_MUZ = .090
CHINB = [[0, -.330, .080], [.200, .110, .070]]; K_CHINB = .065
NECK = [[0, -.120, -.060], [.160, .130, .100]]; K_NECK = .060
def muz_sdf(q): return ell(q, *MUZ)
def tuft_sdf(q):
    qm = mirror(q); a = np.asarray(TUFT_A); b = np.asarray(TUFT_B); pa = qm - a; ba = b - a
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1); r = TUFT_R[0] + (TUFT_R[1] - TUFT_R[0]) * h ** .85
    return np.linalg.norm(pa - h[..., None] * ba, axis=-1) - r
def base_local(q):
    d = skull(q)
    d = smin(d, ell(q, *CHEEK), K_CHEEK)
    d = smin(d, tuft_sdf(q), K_TUFT)
    d = smin(d, muz_sdf(q), K_MUZ); d = smin(d, ell(q, *CHINB), K_CHINB)
    return d + jaw_trim(q)
# a softer chin (the Kitsune lesson): a smooth trim that is exactly zero at and above z 0.07: it pulls the jaw's lower sides in and lifts
# the under-chin where it turns back toward the neck, so the jaw never hangs below the cheek line like a bowl.
JAW = dict(side=.012, under=.025, z1=.110)
def jaw_trim(q):
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    low = 1 - smoother(.005, JAW['z1'], z)
    side = JAW['side'] * low * smooth(.10, .36, np.abs(x))
    under = JAW['under'] * (1 - smoother(-.08, .03, z)) * smooth(-.46, -.26, y)
    return side + under

# eye layout (W units; the head close-up, measure/sheet.json): centres +-0.232 W at 0.320 W above the chin; the opening (inside the lash
# outline) 0.218 x 0.212 W, round (a superellipse a little flatter on top). No socket: the eyes sit on the ball's own curve.
EXW, EZW, EHWW, EHHW, EN = .200, .346, .1075, .1050, 2.30
EYE_SH = 0.; EN_T, EN_B, EYE_TOPK = 2.20, 2.40, 1.0
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
# nose: a dark rounded triangle (wider on top) on the muzzle's front-top, 0.120 W wide, 0.070 W tall, centre 0.210 W above the chin
NZW = .249; NOSE_PW = .0490; NHW, NHH, NHD = .0500, .0310, .030; NOSE_SHEAR = .040; NOSE_WIDEN = .40; NOSE_FLAT = .40
_yf = float(front_local(0, NZW, base_local)[0])
NOSE_C = np.array([0, _yf + NHD - .040, NZW])
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

# ---- the sculpted closed mouth: the sheet's wide gentle "w" smile (head close-up px: corners x 176 / 252 at y 766, the arcs' low points
# at x ~190 / 234, y 782, the cusp under the philtrum at y 776). W units: corners +-0.120 W at 0.177 W, the low points +-0.066 W at
# 0.127 W, the cusp 0.146 W.
MA_X, MA_C, MA_K, MA_P, MA_T0, MA_CUSP, MA_CURL = .085, .139, .029, 1.80, .001, .0, .009
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
    d = _chain(p, MG_C, MG_RG, scale=True)          # (no philtrum on this sheet)
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
O = np.array([0, HY - .03 * W, CHIN + .31 * W])
_g = np.stack(np.meshgrid(np.zeros(1), np.linspace(-.5, .5, 101), np.linspace(.50, .85, 351), indexing='ij'), -1).reshape(-1, 3)
SKULL_TOP_M = float(CHIN + W * _g[head_local(_g) < 0][:, 2].max())
LOG['skull_top_m'] = round(SKULL_TOP_M, 4)

def head_report():
    tip = NOSE_TIP_L
    rows = []
    for z in (.68, .63, .55, .46, .38, .34, .30, .26, .22, .18, .14, .10, .06, .02):
        y = float(front_local(0, z, head_local)[0]); rows.append((z, round(y, 3)))
    back = []
    for z in (.67, .58, .50, .42, .34, .26, .18, .10, .06):
        ys = np.linspace(.8, -.2, 501); P = np.stack([np.zeros_like(ys), ys, np.full_like(ys, z)], -1); inn = head_local(P) < 0
        back.append((z, round(float(ys[inn].max()), 3) if inn.any() else None))
    widths = {}
    for zw in (.0, .02, .03, .04, .055, .07, .10, .133, .165, .196, .23, .259, .29, .323, .355, .386, .42, .45, .50, .55, .60, .65, .68, .70):
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
BLUSH = (.300 * W, CHIN + .183 * W, .073 * W, .047 * W)
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
for k, (rx, rz, n) in enumerate([(.0195, .0088, 14), (.0380, .0165, 18), (.0545, .0232, 22), (.0665, .0285, 24), (.0765, .0326, 26)]):
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
    return ((np.abs(q[:, 0]) < .56) & (q[:, 2] > -.02) & (q[:, 2] < .60)) & (P[:, 1] < HY - .10 * W)
D = np.concatenate([D[~fine_zone(Pf)], D2[fine_zone(P2)]]); Pf = np.concatenate([Pf[~fine_zone(Pf)], P2[fine_zone(P2)]])
# round 2: a denser band along the silhouette (the cheeks and the jaw outline, seen side-on from the front and the 3/4 views), so the
# outline has no straight facets at portrait size
def sil_zone(P, Dd):
    ang = np.degrees(np.arccos(np.clip(-Dd[:, 1], -1, 1))); q = M2L(P)
    return (ang > 70) & (ang < 117) & (q[:, 2] > -.06) & (q[:, 2] < .62)
D3 = fib(3300, math.radians(118.5)); P3 = radial_hit_outer(D3); _s3 = sil_zone(P3, D3) & ~fine_zone(P3)
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
gx, gz = np.meshgrid(np.linspace(-.16, .16, 17) * W, CHIN + np.linspace(.245, .325, 7) * W)
gx = gx.ravel(); gz = gz.ravel(); gy = front_hit(gx, gz); okg = np.isfinite(gy)
Gm_ = np.stack([gx, gy, gz], -1)[okg]; Dm_ = unit(Gm_ - O)
zone = (np.abs(Pf[:, 0]) < .17 * W) & (Pf[:, 2] > CHIN + .240 * W) & (Pf[:, 2] < CHIN + .330 * W) & (Pf[:, 1] < HY - .30 * W)
D = np.concatenate([D[~zone], Dm_]); Pf = np.concatenate([Pf[~zone], radial_hit_outer(Dm_)]); keep = np.ones(len(D), bool)
dom = to_dom(D)
for s in (-1, 1):
    c, base = eye_dom[s]
    outer = np.array([pts[i] for i in tags['eye%d_%d' % (s, len(EYE_SCALES) - 1)]])
    keep &= ~in_poly(c + (dom - c) / 1.06, outer)
front = Pf[:, 1] < HY
keep &= ~(front & ((Pf[:, 0] / (.084 * W)) ** 2 + ((Pf[:, 2] - NZ) / (.036 * W)) ** 2 < 1))
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
REFINE_ADD = int(os.environ.get('REFINE_ADD', '300')); D_LOW, D_T = .12, .45
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
        verts.append(tuple(P - .0045 * n + .0016 * t)); vdir.append(vdir[vi]); vnorm.append(n); rr.append(i0 + k)     # (the skin's own normal: no grey ring)
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
              'note': 'Kaito_head is cut along the parting (upper and lower copies of the interior vertices; the corners are shared). '
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

# ============================================================== the upper lash line as its own object (the Takemori lesson)
# A thick tapered roll lying on the skin where the sheet's lash goes (the opening's superellipse from just inside the rim, k 0.965, out to
# 1 + lash_th(psi)), its face ~4 mm proud of the skin and its back ~8 mm inside it (hidden at rest; the rig weights it 100% to lidU),
# plus the wing flick at the outer corner. Nothing of the lash is painted on the head skin.
def lash_th(psi):
    """the upper lash thickness (sheet, radius units of the opening): thickest over the top (~0.022 W), thinning down the outer side to
    just under mid-height and into the inner corner; no line under the eye. psi: 0 = outer corner, pi/2 = top, pi = inner corner"""
    p = np.where(psi < -PI / 2, psi + 2 * PI, psi)
    top = 1.45 * (.105 * np.sin(np.clip(p, 0, PI)) ** .70 + .040 * np.exp(-((p - .75) / .55) ** 2))
    base = .040 * smooth(.30, .70, p) * smooth(PI + .40, PI - .10, p)
    outer = 0. * p
    return top + base + outer
LASH_OFF, LASH_IN = .0042, .0080
LASH_K_IN = .965                 # the roll's inner edge (opening radius units); the rig lowers it to cover the lid's rest edge
LASH_INFO = {}
def lash_geom(s):
    """the lash roll and its wing (metres): V, F, the wing tip, the top point (shared by the model and the rig)"""
    ps = np.linspace(.10, PI - .10, 28); th = np.maximum(np.asarray(lash_th(ps), float), .035) * (.40 + .60 * smooth(.10, .80, ps))
    FR = np.linspace(0, 1, 5)
    rows = []
    for fr in FR:
        k = LASH_K_IN + (1 + th - LASH_K_IN) * fr
        rows.append(np.array([eye_pts(s, np.array([p_]), float(k_))[0] for p_, k_ in zip(ps, k)]))
    G = np.array(rows).transpose(1, 0, 2)
    tt = np.linspace(0, 1, 8); pw = .30 + .10 * tt; kw = 1.03 + .24 * tt; dw = .11 * (1 - .82 * tt) + .010
    Gw = np.array([[eye_pts(s, np.array([p_ - d_]), float(k_))[0], eye_pts(s, np.array([p_]), float(k_ + .02))[0],
                    eye_pts(s, np.array([p_ + d_]), float(k_))[0]] for p_, k_, d_ in zip(pw, kw, dw)])
    V = []; F = []
    for Gg in (G, Gw):
        nc, nr = Gg.shape[:2]; N_ = grad(head_sdf, Gg.reshape(-1, 3)).reshape(Gg.shape)
        bul = (.55 + .45 * np.sin(PI * np.linspace(0, 1, nr)))[None, :, None]
        Out = Gg + N_ * LASH_OFF * bul; In = Gg - N_ * LASH_IN
        loop = np.concatenate([Out, In[:, ::-1]], 1); m = loop.shape[1]; b0 = len(V)
        V += list(loop.reshape(-1, 3))
        for i in range(nc - 1):
            for j in range(m):
                jj = (j + 1) % m; F.append((b0 + i * m + j, b0 + (i + 1) * m + j, b0 + (i + 1) * m + jj, b0 + i * m + jj))
        for i_end, rev in ((0, True), (nc - 1, False)):
            c = len(V); V.append(loop[i_end].mean(0) + (loop[i_end].mean(0) - loop[min(i_end + 1, nc - 1) if i_end == 0 else i_end - 1].mean(0)) * .35)
            for j in range(m):
                jj = (j + 1) % m; f = (b0 + i_end * m + j, b0 + i_end * m + jj, c); F.append(f[::-1] if rev else f)
    return np.array(V), F, Gw[-1, 1], G[len(ps) // 2, -1]
def lash_roll(s, tag):
    V, F, wt, tp = lash_geom(s)
    uvc = ramp_uv('eyedark', np.array([.40]))[0]
    make_obj('lash.' + tag, V, F, np.tile(uvc, (len(V), 1)), 'lash.' + tag)
    LASH_INFO[tag] = {'wing_tip_m': [round(float(c), 4) for c in wt], 'top_m': [round(float(c), 4) for c in tp]}
for _s, _t in ((1, 'L'), (-1, 'R')):
    if RIG: V_, F_, wt_, tp_ = lash_geom(_s); LASH_INFO[_t] = {'wing_tip_m': [round(float(c), 4) for c in wt_], 'top_m': [round(float(c), 4) for c in tp_]}
    else: lash_roll(_s, _t)          # (the rig builds the same rolls itself, weighted to lidU and pushed to sit on the shut lid)
LOG['lash'] = LASH_INFO

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


print('STEP ears', flush=True)
# ============================================================== EARS: big thick rounded triangular pyramids (W units, z above the chin)
# The Kazemaru construction (a loft of D-shaped rings square to the ear's axis: a soft flat FRONT face turned 15 deg outward, carrying the
# pink dish, and a full superellipse BACK, the widest a third of the way back), re-measured for Kaito's big fox ears (both head views):
# the front triangle's tip at (+-0.345, 0.987), its outer base corner at (+-0.505, 0.60) continuing the head's side line, its inner edge
# running down behind the forehead dome toward x 0.06 (0.26 at z 0.96, 0.16 at 0.895, 0.09 at 0.81); side view: the front edge leans back, the base reaching back over the head's
# upper side. About 0.42 W across and 0.37 W front to back at the base. Root rings sink into the skull.
EAR_FM = np.array([.262, -.160, .652])          # the front face's middle at the base (on the head's top corner)
EAR_T = np.array([.330, -.128, .938])           # the same point at the tip section
EAR_YAW = 12.; EAR_SEC = dict(ax=.238, ay=.262, cy=.140, n=2.4, kr=.080)
EAR_SC_TIP = .320; EAR_Q = 1.25; EAR_REC = .007 / W; EAR_RCAP = .062
EAR_DARK_VV, EAR_DARK_TILT = .640, .190          # the dark cap's lower edge: z 0.72 W at the outer edge .. 0.87 at the inner edge (sheet)
EAR_PINK_TOP_VV = .830
ear_info = {}
def ear_frame(side):
    m = np.array([side, 1, 1.]); FM = EAR_FM * m; T = EAR_T * m; A = unit(T - FM)
    y_ = math.radians(EAR_YAW); Nf = np.array([side * math.sin(y_), -math.cos(y_), 0.]); Nf = unit(Nf - A * (Nf @ A))
    Lt = unit(np.cross(A, Nf))
    if Lt[0] * side < 0: Lt = -Lt
    return FM, T, A, Nf, Lt
def sec_f(xp, yp):
    """the unit section (W units at the base): < 0 inside. A superellipse back, cut by the soft flat front face y' = 0 (y' points back)"""
    S = EAR_SEC
    egg = ((np.abs(xp) / S['ax']) ** S['n'] + (np.abs(yp - S['cy']) / S['ay']) ** S['n']) ** (1 / S['n']) - 1
    return smax(egg * S['ax'], -yp, S['kr'])
def sec_boundary(theta):
    """the unit section's boundary along rays from its centre (0, cy); theta 0 = straight back, pi = the front face's middle"""
    th = np.asarray(theta, float); d = np.stack([np.sin(th), np.cos(th)], -1); c = np.array([0, EAR_SEC['cy']])
    lo = np.zeros(len(th)); hi = np.full(len(th), .40)
    for _ in range(34):
        mid = (lo + hi) / 2; p = c + d * mid[:, None]; ins = sec_f(p[:, 0], p[:, 1]) < 0
        lo = np.where(ins, mid, lo); hi = np.where(ins, hi, mid)
    p = c + d * ((lo + hi) / 2)[:, None]
    e = 1e-4; gx = sec_f(p[:, 0] + e, p[:, 1]) - sec_f(p[:, 0] - e, p[:, 1]); gy = sec_f(p[:, 0], p[:, 1] + e) - sec_f(p[:, 0], p[:, 1] - e)
    n2 = unit(np.stack([gx, gy], -1))
    return p[:, 0], p[:, 1], n2
def ear_dish(xp, n2, VV):
    """the front recess (the inner ear), W units, pushed back into the ear: <= 1.5 cm, a soft rim"""
    wf = smooth(.55, .92, -n2[:, 1]); prof = np.clip(1 - (xp / .135) ** 2, 0, 1) ** 1.4
    win = smooth(.03, .16, VV) * (1 - smooth(EAR_PINK_TOP_VV - .06, EAR_PINK_TOP_VV + .04, VV))
    return EAR_REC * wf * prof * win
def ear_ring_params(VV):
    VV = float(VV)
    if VV < 0: sc = float(np.interp(VV, [-.40, -.27, -.14, 0], [.86, .97, 1.0, 1.0])); return sc, VV, 0.
    if VV <= 1: return 1 - (1 - EAR_SC_TIP) * VV ** EAR_Q, VV, 0.
    a = min((VV - 1) / .072, 1.) * PI / 2
    return EAR_SC_TIP * math.cos(a), 1., EAR_RCAP * math.sin(a)
EAR_VVS = np.concatenate([[-.40, -.27, -.14], np.linspace(0, 1, 32) ** .92, [1.010, 1.022, 1.034, 1.046, 1.056, 1.064, 1.069, 1.072]])
def ears_sdf(p):
    """an approximate signed field of both ears' volumes (metres): the head and the ear roots"""
    q = M2L(np.asarray(p, float)); best = np.full(len(q), 9.)
    for side in (1, -1):
        FM, T, A, Nf, Lt = ear_frame(side); L = np.linalg.norm(T - FM); Bk = -Nf
        VV = ((q - FM) @ A) / L; v = np.clip(VV, 0, 1)
        sc = np.where(VV < 0, np.interp(VV, [-.40, -.27, -.14, 0], [.86, .97, 1.0, 1.0]), 1 - (1 - EAR_SC_TIP) * v ** EAR_Q)
        O = FM + (T - FM) * np.clip(VV, -.40, 1)[:, None]; r = q - O
        val = sec_f((r @ Lt) / sc, (r @ Bk) / sc) * sc
        val = np.where((VV < -.40) | (VV > 1.02), 9., val)
        best = np.minimum(best, val)
    return best * W
NS_E = 44
EAR_TH = np.linspace(0, 2 * PI, NS_E + 1)            # theta 0 = the back (the UV seam), pi = the front face; the seam column duplicated
EAR_BX, EAR_BY, EAR_BN = sec_boundary(EAR_TH)
for side, tag in ((1, 'L'), (-1, 'R')):
    FM, T, A, Nf, Lt = ear_frame(side); Bk = -Nf
    rings = []
    for VV in EAR_VVS:
        sc, vpos, adv = ear_ring_params(VV)
        Oe = FM + (T - FM) * vpos + A * adv
        dish = ear_dish(EAR_BX, EAR_BN, VV) * math.sqrt(max(sc, 0.)) if 0 <= VV <= 1 else 0.
        rings.append(Oe + np.outer(EAR_BX * sc, Lt) + np.outer(EAR_BY * sc + dish, Bk))
    G = np.array(rings); R = len(EAR_VVS); C_ = NS_E + 1
    Gm = L2M(G.reshape(-1, 3)).reshape(R, C_, 3)
    Pf = Gm.reshape(-1, 3)
    Gm = Pf.reshape(R, C_, 3)
    Gw = np.concatenate([Gm[:, :-1], Gm[:, :1]], 1)            # normals as if closed (the seam column equals the first)
    dS = np.roll(Gm[:, :-1], -1, 1) - np.roll(Gm[:, :-1], 1, 1); dK = np.gradient(Gm[:, :-1], axis=0)
    NG = unit(np.cross(dK, dS)); ctr = Gm[:, :-1].mean(1, keepdims=True)
    NG = np.where(((NG * (Gm[:, :-1] - ctr)).sum(-1) < 0)[..., None], -NG, NG)
    NG = np.concatenate([NG, NG[:, :1]], 1)
    V = list(Gm.reshape(-1, 3)); NN = list(NG.reshape(-1, 3))
    F = grid_faces(R, C_, wrap=False)
    UU, VVg = np.meshgrid(EAR_TH / (2 * PI), EAR_VVS)
    UVl = list(au('ear', UU.reshape(-1), (np.clip(VVg.reshape(-1), -.30, 1.12) + .30) / 1.42))
    sc_, vp_, adv_ = ear_ring_params(1.0)
    pole_q = FM + (T - FM) + A * EAR_RCAP
    pole = len(V); V.append(L2M(pole_q[None])[0]); NN.append(A); UVl.append(au('ear', np.array(.5), np.array((1.12 + .30) / 1.42)))
    last = (R - 1) * C_
    for i in range(NS_E): F.append((last + i, last + i + 1, pole))
    root = len(V); V.append(Gm[0, :-1].mean(0)); NN.append(-A); UVl.append(au('ear', np.array(.5), np.array(0.)))
    for i in range(NS_E): F.append((i + 1, i, root))
    make_obj('ear.' + tag, np.array(V), F, np.array(UVl), 'ear.' + tag, N=np.array(NN))
    cen = FM + Bk * EAR_SEC['cy']
    ear_info[tag] = {'base': L2M(cen[None])[0].tolist(), 'mid': L2M((cen + (T - FM) * .5)[None])[0].tolist(), 'tip': L2M(pole_q[None])[0].tolist(),
                     'facing': Nf.tolist()}
    LOG['ear_%s_tip_m' % tag] = [round(float(c), 3) for c in L2M(pole_q[None])[0]]
CHARTS['torso'] = (1536, 448, 512, 448)
BODY_PIVOTS = {}; BODY_MEAS = {}; POST_JOIN = None; TAIL = {}

if not HEAD_ONLY:
    # ============================================================== BODY AND SAILOR SUIT (metres; body axis x = 0, y = 0; sheet front 2.647 mm / px)
    RCY = .015
    def shirt_uv(N, tone=0., occ=0., hi=.22, lo=.20): return mix_uv('shirtmix', sval(N, hi=hi, lo=lo, occ=occ), tone)
    print('BODY_STEP shirt', flush=True)
    # ---------------------------------------------------------------- the white sailor shirt: one lofted shell from its hem (sheet front: z 0.31,
    # +-0.175, a little flared and loose over the shorts) up under the collar to the neck; side: front -0.12, back +0.15 at the chest
    TZ = np.array([.305, .330, .360, .400, .440, .480, .510, .540, .565])
    TAX = np.array([.178, .170, .160, .158, .161, .157, .146, .120, .090])
    TAY = np.array([.140, .137, .135, .134, .128, .118, .106, .090, .072])
    tax_f = natspline(TZ, TAX); tay_f = natspline(TZ, TAY); TP = 2.3
    def torso_raw(a, z):
        a = np.asarray(a, float); z = np.asarray(z, float)
        return np.stack([tax_f(z) * spow(np.sin(a), 2 / TP), RCY - tay_f(z) * spow(np.cos(a), 2 / TP), z + 0 * a], -1)
    def torso_n(a, z, e=1e-4):
        da = torso_raw(np.asarray(a) + e, z) - torso_raw(np.asarray(a) - e, z)
        dz = torso_raw(a, np.asarray(z) + e) - torso_raw(a, np.asarray(z) - e)
        n = unit(np.cross(dz, da)); c = torso_raw(a, z) - np.stack([0 * np.asarray(a), RCY + 0 * np.asarray(a), np.asarray(z) * 0 + .45], -1)
        return np.where(((n * c).sum(-1) < 0)[..., None], -n, n)
    def torso_pt(a, z, off=0.): return torso_raw(a, z) + torso_n(a, z) * np.asarray(off, float)[..., None]
    def torso_a_of_x(x, z):
        s_ = np.clip(np.asarray(x, float) / tax_f(z), -.999, .999); return np.arcsin(spow(s_, TP / 2))
    def torso_uv_of(a, z):
        x0, y0, w, h = CHARTS['torso']; u = (np.asarray(a) + PI) / (2 * PI)
        v = (np.asarray(z) - TZ[0]) / (TZ[-1] - TZ[0])
        return np.stack([(x0 + 6 + u * (w - 12)) / 2048, (y0 + 6 + v * (h - 12)) / 2048], -1)
    SHIRT_T = .012
    NA_T, NZ_T = 40, 10
    zt_ = TZ[0] + (TZ[-1] - TZ[0]) * np.linspace(0, 1, NZ_T) ** 1.1
    # (the torso chart's u wraps at the back centre, so the shell is built open at the back seam with a duplicated column)
    at2 = np.linspace(0, 2 * PI, NA_T + 1) + PI; AA2, ZZ2 = np.meshgrid(at2, zt_)
    Pt2 = torso_raw(AA2, ZZ2); Nt2 = torso_n(AA2, ZZ2); Vt2 = Pt2.reshape(-1, 3); Nv2 = Nt2.reshape(-1, 3)
    Ft2 = grid_faces(NZ_T, NA_T + 1, wrap=False)
    UVo = torso_uv_of(AA2.reshape(-1) - 2 * PI, ZZ2.reshape(-1))
    UVi = ramp_uv('lining', sval(-Nv2, hi=.10, lo=.10) - .05)
    plain = np.zeros(len(Vt2), bool); plain[-(NA_T + 1):] = True
    seam = np.zeros(len(Vt2), bool); seam[::NA_T + 1] = True; seam[NA_T::NA_T + 1] = True
    plain |= seam                                          # (the back seam's two coincident columns get no rim)
    Vt, Ft, UVt, Nt = thicken(Vt2, Ft2, Nv2, SHIRT_T, UVo, UVi, UVo, rim=4, plain=plain, split_front=True)
    make_obj('shirt', Vt, Ft, UVt, 'body', N=Nt)

    print('BODY_STEP shorts', flush=True)
    # ---------------------------------------------------------------- the navy shorts: two baggy legs whose inner sides are flat (a D section)
    # high up, so they meet flush in one seat under the shirt, and part into two round barrels from z 0.23 down (sheet front: +-0.157 at
    # z 0.30, +-0.188 at 0.22, +-0.20 at the cuffs; side -0.106 .. +0.135); each ends in a thick rolled cuff (z 0.08 .. 0.136, +-0.204)
    SZ = np.array([.350, .320, .290, .262, .240, .220, .195, .170, .150, .130, .118])
    SXO = np.array([.144, .150, .157, .166, .178, .188, .194, .197, .197, .192, .186])
    SXI = np.array([.000, .000, .000, .000, .001, .004, .006, .007, .008, .010, .012])
    SHY = np.array([.104, .110, .113, .116, .118, .119, .119, .118, .117, .113, .110])
    SNIN = np.array([9., 9., 9., 8., 6., 4.2, 3.2, 2.8, 2.6, 2.6, 2.6])
    SYC = RCY - .001
    def shorts_ring(s, k, ah):
        xo, xi, hy, nin = SXO[k], SXI[k], SHY[k], SNIN[k]; xc = (xo + xi) / 2; hx = (xo - xi) / 2
        sn = np.sin(ah); cs = np.cos(ah); nn_ = np.where(sn > 0, 2.5, nin)          # sin > 0: the outer side; < 0: the inner side
        X = xc + hx * spow(sn, 2 / nn_); Y = SYC - hy * spow(cs, 2 / nn_)
        pl = .0020 * smooth(.20, .14, SZ[k]) * np.sin(ah * 6 + .6) * smooth(.2, .6, np.abs(cs))         # soft gathers over the cuff
        return np.stack([s * X, Y - np.sign(cs) * pl, np.full(len(ah), SZ[k])], -1)
    SHORTS = {}
    for s, tag in ((-1, 'R'), (1, 'L')):
        NAH = 22; ah = np.linspace(0, 2 * PI, NAH, endpoint=False)
        Gh = np.array([shorts_ring(s, k, ah) for k in range(len(SZ))]); NZH = len(SZ)
        dS = np.roll(Gh, -1, 1) - np.roll(Gh, 1, 1); dK = np.gradient(Gh, axis=0)
        NGh = unit(np.cross(dK, dS)); ctr = Gh.mean(1, keepdims=True)
        NGh = np.where(((NGh * (Gh - ctr)).sum(-1) < 0)[..., None], -NGh, NGh)
        Vh = Gh.reshape(-1, 3); NNh = NGh.reshape(-1, 3)
        tz = np.repeat(np.linspace(0, 1, NZH), NAH)
        inner = np.tile(np.exp(-((np.sin(ah) + 1) / .35) ** 2), NZH) * smooth(.30, .80, tz)
        UVo = mix_uv('navymix', sval(NNh, hi=.20, lo=.18, occ=.20 * inner + .14 * (1 - smooth(.0, .25, tz))).reshape(-1), .10 + .10 * smooth(.3, 1., tz))
        UVi = ramp_uv('navylining', sval(-NNh, hi=.10, lo=.10) - .10)
        plain = np.zeros(len(Vh), bool); plain[:NAH] = True
        # (single-sided: the top sits inside the shirt and the hem under the rolled cuff, so no inner shell is ever seen)
        make_obj('shorts_leg.' + tag, Vh + NNh * .007, grid_faces(NZH, NAH, wrap=True), UVo, 'shorts', N=NNh)
        # the rolled cuff: a thick soft band round the hem
        NCF = 26; ac = np.linspace(0, 2 * PI, NCF, endpoint=False)
        kz = .108; xo, xi, hy = .192, .010, .114; xc = (xo + xi) / 2; hx = (xo - xi) / 2
        path = np.stack([s * (xc + hx * spow(np.sin(ac), 2 / 2.6)), SYC - hy * spow(np.cos(ac), 2 / 2.6), np.full(NCF, kz)], -1)
        nrm = unit(np.stack([s * spow(np.sin(ac), 2 / 2.6) / hx, -spow(np.cos(ac), 2 / 2.6) / hy, np.zeros(NCF)], -1))
        sak = np.linspace(0, 2 * PI, 10, endpoint=False)
        def cprof(k, sak=sak):
            return np.stack([.004 + .013 * spow(np.cos(sak), .55), .028 * spow(np.sin(sak), .65)], -1)
        ring_tube('shorts_cuff.' + tag, path, cprof, 'shorts',
                  lambda NN, tt, uu, V: mix_uv('navymix', sval(NN, hi=.24, lo=.20), .22 + 0 * NN[:, 0]), nrm, sides=10)
        SHORTS[tag] = {'cuff_z_m': [kz - .028, kz + .028], 'outer_x_m': float(xo + .017)}

    print('BODY_STEP sleeves and arms', flush=True)
    # ---------------------------------------------------------------- puffy short sleeves (sheet front: from the shoulder under the collar out to
    # +-0.246 at z 0.435; the opening runs from (0.25, 0.415) to the armpit (0.175, 0.375), square to the arm, which hangs 30 deg out),
    # each ending in a rolled white cuff. The sleeve is a loft of rings from inside the torso to that opening.
    ARM = {}; ARM_DEG = 30.
    for s, tag in ((1, 'L'), (-1, 'R')):
        th = math.radians(ARM_DEG); ad = unit(np.array([s * math.sin(th), .02, -math.cos(th)]))
        u_open = unit(np.array([s * math.cos(th), 0, math.sin(th)]))
        OC = np.array([s * .213, RCY + .006, .396]); OHU, OHY = .052, .058
        RC = np.array([s * .080, RCY + .004, .468]); RHU, RHY = .070, .098
        NR = 10; ts = np.linspace(0, 1, NR); NS = 18; sa = np.linspace(0, 2 * PI, NS, endpoint=False)
        rings = []
        for t in ts:
            n0 = np.array([s * 1., 0, 0]); n = unit(n0 * (1 - smooth(.10, 1., t)) + ad * smooth(.10, 1., t))
            uu = unit(np.cross(n, [0, 1., 0]) * s); uu = uu if uu[2] > 0 else -uu
            vv = np.array([0, 1., 0])
            c = RC + (OC - RC) * t + np.array([0, 0, .030]) * math.sin(PI * t) * (1 - t) + u_open * .012 * math.sin(PI * t)
            hu = RHU + (OHU - RHU) * t + .022 * math.sin(PI * t ** .8); hy = RHY + (OHY - RHY) * t + .014 * math.sin(PI * t ** .8)
            g = .10 * smooth(.85, 1., t)
            ring = c + np.outer(hu * (1 - g) * spow(np.sin(sa), 2 / 2.3), uu) + np.outer(hy * (1 - g * .6) * spow(np.cos(sa), 2 / 2.3), vv)
            rings.append(ring)
        Gq = np.array(rings)
        dS = np.roll(Gq, -1, 1) - np.roll(Gq, 1, 1); dK = np.gradient(Gq, axis=0)
        NGq = unit(np.cross(dK, dS)); ctr = Gq.mean(1, keepdims=True)
        NGq = np.where(((NGq * (Gq - ctr)).sum(-1) < 0)[..., None], -NGq, NGq)
        V = Gq.reshape(-1, 3); NN = NGq.reshape(-1, 3); nr_, ns_ = Gq.shape[:2]
        tone = np.repeat(np.linspace(.04, .10, nr_), ns_)
        UVo = shirt_uv(NN, tone); UVi = ramp_uv('lining', sval(-NN, hi=.10, lo=.10) - .06)
        plain = np.zeros(len(V), bool); plain[:ns_] = True
        # (single-sided: the root sits inside the shirt and the opening under the rolled cuff)
        make_obj('sleeve.' + tag, V + NN * .006, grid_faces(nr_, ns_, wrap=True), UVo, 'sleeve.' + tag, N=NN)
        # the rolled cuff on the opening (a thick soft band, ~0.03 m tall, standing ~0.014 m proud)
        last = Gq[-1]; cen_ = last.mean(0); nrm = unit(last - cen_)
        path = last - ad[None] * .004 + nrm * .006
        sak = np.linspace(0, 2 * PI, 10, endpoint=False)
        def cprof(k, sak=sak):
            return np.stack([.002 + .011 * spow(np.cos(sak), .55), .0150 * spow(np.sin(sak), .65)], -1)
        ring_tube('sleeve_cuff.' + tag, path, cprof, 'sleeve.' + tag, lambda NN_, tt, uu, V_: shirt_uv(NN_, .14 + 0 * NN_[:, 0]), nrm, sides=10)
        SH = np.array([s * .135, RCY + .010, .468])
        def along(t0, OC=OC, ad=ad): return OC + ad * t0
        EL = along(-.010); WR = along(.030); PC = along(.082)
        fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
        def arm_sdf(p, OC=OC, WR=WR, ad=ad): return sd_capsule(p, OC - ad * .080, WR, (.045, .042))
        tsa = np.linspace(-.070, .040, 6)
        ring_stack('fur_arm.' + tag, arm_sdf, OC[None] + ad[None] * tsa[:, None], np.tile(ad, (len(tsa), 1)), 'arm.' + tag,
                   lambda NN, V: fur_uv(sval(NN, hi=.18, lo=.20), .0), sides=14, tmax=.12, ref=fwd, pole_start=False, pole_end=False)
        lat = unit(np.cross(ad, fwd)) * s
        paw_axes = np.array([ad, fwd, lat])
        thumb = PC + fwd * .046 - lat * .008 - ad * .014
        def paw_parts(p, WR=WR, PC=PC, paw_axes=paw_axes, thumb=thumb, ad=ad):
            d_w = sd_capsule(p, WR - ad * .026, PC - ad * .010, (.042, .048))
            d_paw = sd_ell(p, PC, paw_axes, (.070, .064, .058))
            d_t = sd_ell(p, thumb, paw_axes, (.028, .024, .024))
            return d_w, d_paw, d_t
        def paw_sdf(p, paw_parts=paw_parts):
            d_w, d_paw, d_t = paw_parts(p)
            return smin(smin(d_w, d_paw, .016), d_t, .008)
        def paw_uv(NN, V, paw_parts=paw_parts):
            d_w, d_paw, d_t = paw_parts(V)
            cr = crease(smin(d_w, d_paw, .016), d_t, .008) * .40
            return fur_uv(sval(NN, occ=1.0 * cr, hi=.20, lo=.18), .0)
        tt_ = np.linspace(0, .12, 241); inside = paw_sdf(PC[None] + ad[None] * tt_[:, None]) < 0
        reach = float(tt_[np.argmin(inside)]) if not inside.all() else .12
        tips = PC + ad * (reach - .005)
        tsp = np.concatenate([np.linspace(0, .45, 5)[:-1], np.linspace(.45, 1.0, 12)])
        cen = (WR - ad * .025)[None] + (tips - (WR - ad * .025))[None] * tsp[:, None]
        ring_stack('mitten_paw.' + tag, paw_sdf, cen, np.tile(ad, (len(tsp), 1)), 'arm.' + tag, paw_uv, sides=18, tmax=.10, ref=fwd)
        ARM[tag] = {'shoulder': SH.tolist(), 'elbow': EL.tolist(), 'wrist': WR.tolist(), 'palm': (PC - lat * .006).tolist(),
                    'grip_axis': fwd.tolist(), 'arm_dir': ad.tolist(), 'paw_centre': PC.tolist()}

    print('BODY_STEP legs feet', flush=True)
    # ---------------------------------------------------------------- short legs (hidden by the shorts) and big round feet (sheet front: 0.172 m
    # wide, centres x +-0.123, 0.085 m tall; side: 0.225 m long, the toes 0.11 m in front of the axis), two toe creases each
    LEG = {}
    for s, tag in ((1, 'L'), (-1, 'R')):
        HP = np.array([s * .090, RCY - .010, .262]); AN = np.array([s * .118, -.004, .080])
        def leg_sdf(p, HP=HP, AN=AN): return sd_capsule(p, HP, AN, (.056, .046))
        zs = np.linspace(.200, .075, 5)
        cen = np.array([HP + (AN - HP) * ((z_ - HP[2]) / (AN[2] - HP[2])) for z_ in zs])
        ring_stack('fur_leg.' + tag, leg_sdf, cen, np.tile(unit(AN - HP), (len(zs), 1)), 'body',
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20, occ=.18 * smooth(.09, .14, V[:, 2])), .0), sides=14, tmax=.14, ref=[0, -1., 0],
                   pole_start=False)
        FC = np.array([s * .123, -.002, .040]); FAX = rot([0, 0, 1], s * math.radians(4)).T
        toes = [FC + (np.array([o * .048, -.080, .002]) @ FAX) for o in (-1, 0, 1)]
        def foot_parts(p, FC=FC, FAX=FAX, toes=toes, AN=AN):
            d_main = sd_ell(p, FC + np.array([0, .010, 0]), FAX, (.084, .104, .046))
            d_ank = sd_capsule(p, AN + np.array([0, 0, .016]), AN + np.array([0, -.008, -.022]), .048)
            d_t = [sd_ell(p, t, FAX, (.035, .034, .036)) for t in toes]
            return d_main, d_ank, d_t
        def foot_sdf(p, foot_parts=foot_parts):
            d_main, d_ank, d_t = foot_parts(p)
            d = smin(d_main, d_ank, .018); tt = smin(smin(d_t[0], d_t[1], .005), d_t[2], .005)
            d = smin(d, tt, .013)
            return smax(d, -(p[:, 2] - .002), .007)
        def foot_uv(NN, V, foot_parts=foot_parts):
            d_main, d_ank, d_t = foot_parts(V)
            cr = crease(d_t[0], d_t[1], .005) * .45 + crease(d_t[1], d_t[2], .005) * .45
            return fur_uv(sval(NN, occ=1.1 * cr + .10 * smooth(.012, .0, V[:, 2]), hi=.20, lo=.18), .0)
        star_mesh('fur_foot.' + tag, foot_sdf, FC + np.array([0, -.004, .014]), 'body', foot_uv, nth=11, nph=20, tmax=.20)
        LEG[tag] = {'hip': HP.tolist(), 'knee': (HP + (AN - HP) * .55).tolist(), 'ankle': AN.tolist(), 'toe': (FC + np.array([0, -.100, -.010]) @ FAX).tolist()}

    print('BODY_STEP collar', flush=True)
    # ---------------------------------------------------------------- the navy sailor collar: a thick shell draped on the shirt. Two lapels run
    # from the shoulders (+-0.15, 0.512) down to a V at the chest (0, 0.452) under the scarf knot; over the shoulders its edge sits at
    # z ~0.50; on the back a square flap hangs to z 0.43 (+-0.135, soft corners). Parameterised round the torso (a = 0 at the front centre)
    # and from the neckline (t = 0) to the outer edge (t = 1).
    COL_OFF, COL_T = .0145, .010
    LAP_IN = ((.012, .461), (.078, .536))            # the lapel's inner edge (x, z): from the V up to the neck
    LAP_OUT = ((.018, .450), (.150, .513))           # its outer edge: from the V out to the shoulder
    def lin(x, P0, P1): return P0[1] + (P1[1] - P0[1]) * np.clip((x - P0[0]) / (P1[0] - P0[0]), 0, 1)
    def col_edges(a):
        a = np.asarray(a, float); xx = np.abs(.158 * spow(np.sin(a), 2 / TP)); front = np.cos(a) > 0
        zin_f = np.where(xx < LAP_IN[1][0], lin(xx, *LAP_IN), .536 + .002 * smooth(LAP_IN[1][0], .15, xx))
        zout_f = np.where(xx < LAP_OUT[1][0], lin(xx, *LAP_OUT), .513 - .010 * smooth(LAP_OUT[1][0], .158, xx))
        # the back: the neckline under the head; the flap's lower edge at 0.43 for |x| < 0.12, rounding up its corners to the shoulder line
        zin_b = np.full_like(a, .538) - .004 * smooth(.16, .0, xx)
        corner = smooth(.112, .150, xx)
        zout_b = .430 + (.503 - .430) * corner
        return np.where(front, zin_f, zin_b), np.where(front, zout_f, zout_b)
    A0 = .055
    a_c = np.concatenate([np.linspace(A0, PI / 2, 16), np.linspace(PI / 2, PI - 1.25, 4)[1:], np.linspace(PI - 1.25, PI - .68, 11)[1:],
                          np.linspace(PI - .68, PI, 8)[1:]])
    a_c = np.concatenate([a_c, (2 * PI - a_c[::-1])[1:]])
    NTC = 5; t_c = np.linspace(0, 1, NTC)
    zin_, zout_ = col_edges(a_c)
    AC, TC = np.meshgrid(a_c, t_c)
    ZC = zin_[None, :] + (zout_ - zin_)[None, :] * TC
    PC_ = torso_raw(AC, ZC); NC_ = torso_n(AC, ZC)
    lift = COL_OFF + .003 * np.sin(PI * TC)                 # a soft roll across the collar's width
    PC_ = PC_ + NC_ * lift[..., None]
    Vc = PC_.reshape(-1, 3); Nc = NC_.reshape(-1, 3)
    Fc = grid_faces(NTC, len(a_c), wrap=False)
    UVo = ramp_uv('navy', sval(Nc, hi=.24, lo=.18) + .02); UVi = ramp_uv('navylining', sval(-Nc, hi=.10, lo=.10))
    Vt, Ft, UVt, Nt = thicken(Vc, Fc, Nc, COL_T, UVo, UVi, UVo, rim=3, split_front=True)
    make_obj('collar', Vt, Ft, UVt, 'collar', N=Nt)
    LOG['collar'] = {'v_point_z_m': LAP_OUT[0][1], 'flap_bottom_z_m': .430, 'shoulder_edge_z_m': .503}

    print('BODY_STEP scarf', flush=True)
    # ---------------------------------------------------------------- the red scarf: a round knot on the collar's V (sheet: 0.055 m wide,
    # z 0.445 .. 0.484) and two broad leaf ends hanging down and out to (+-0.075, 0.35), ~0.07 m wide under the knot
    KN_Z = .466
    KN_C = np.array([0, RCY - float(tay_f(KN_Z)) - SHIRT_T / 2 - .022, KN_Z])
    lobe('scarf_knot', KN_C, np.array([.022, .029, .022]), [0, -1., 0], 'scarf', ramp='scarf', n=4, squash=.05)
    def front_y(z, clear): return RCY - float(tay_f(z)) - SHIRT_T / 2 - clear
    for s, tag in ((-1, 'R'), (1, 'L')):
        zs_ = [KN_Z - .012, KN_Z - .044, KN_Z - .082, KN_Z - .110]
        xs_ = [s * .012, s * .034, s * .058, s * .072]
        cp = [np.array([x_, front_y(z_, c_), z_]) for x_, z_, c_ in zip(xs_, zs_, (.026, .016, .012, .012))]
        path = cpath(cp, 14)
        nrm = np.tile(np.array([0, -1., .08]), (len(path), 1))
        prof = lambda k: (.0085 + .0035 * math.sin(PI * min(k / 13, 1.)) ** .8,
                          .0060 + .0300 * math.sin(PI * (.10 + .80 * min(k / 13, 1.))) ** .65)
        sweep('scarf_end.' + tag, path, prof, 'scarf', ramp_sw('scarf', hi=.24, add=.02), sides=10, normals=nrm, p=.70, cap0=True, cap1=True)
    LOG['scarf'] = {'knot_m': [round(float(c), 3) for c in KN_C]}

    print('BODY_STEP tail', flush=True)
    # ---------------------------------------------------------------- the big fluffy tail: an egg-shaped plume rising behind him from the low back
    # (sheet side: 0.155 .. 0.405 m behind the axis, z 0.145 .. 0.515, the cream tip on top; back: +-0.13 m, z 0.095 .. 0.453: the model
    # takes z 0.13 .. 0.48 so the back view's collar flap stays clear). A separate piece with bend
    # rings, painted in its own chart.
    TAIL_CP = np.array([[0, .095, .262], [0, .165, .238], [0, .228, .240], [0, .266, .288], [0, .280, .350], [0, .277, .392], [0, .272, .412]])
    TAIL_RT = np.array([0, .06, .16, .30, .45, .60, .74, .86, .94, 1.0]); TAIL_RR = np.array([.075, .100, .118, .128, .131, .131, .128, .122, .112, .100])
    def build_tail():
        path = cpath(TAIL_CP, 200); seg = np.linalg.norm(np.diff(path, axis=0), axis=1); s_ = np.concatenate([[0], np.cumsum(seg)]); s_ /= s_[-1]
        NRT, NST = 28, 20
        tk = np.linspace(0, 1, NRT) ** .95
        P = np.stack([np.interp(tk, s_, path[:, i]) for i in range(3)], -1); R = np.interp(tk, TAIL_RT, TAIL_RR)
        T = unit(np.gradient(P, axis=0))
        X = np.zeros_like(P); x0 = np.cross(T[0], [0, 0, 1.]); X[0] = unit(x0)
        for k in range(1, NRT):
            v = X[k - 1] - T[k] * (X[k - 1] @ T[k]); X[k] = unit(v)
        B = unit(np.cross(T, X))
        if (B[NRT // 2] @ np.array([0, .6, -.4])) < 0: X = -X; B = -B
        ph = np.linspace(0, 2 * PI, NST + 1)
        rings = []; norms = []
        for k in range(NRT):
            rx, rb = R[k] * 1.04, R[k] * 1.0
            pts = P[k] + X[k] * (rx * np.sin(ph))[:, None] - B[k] * (rb * np.cos(ph))[:, None]
            nn = unit(X[k] * (np.sin(ph) / rx)[:, None] - B[k] * (np.cos(ph) / rb)[:, None])
            rings.append(pts); norms.append(nn)
        CAP = [.40, .78, 1.12, 1.38]                   # the egg's top: rings of a hemisphere on the last ring (round, not pointed)
        for th in CAP:
            rx, rb = R[-1] * 1.04 * math.cos(th), R[-1] * math.cos(th); c_ = P[-1] + T[-1] * R[-1] * math.sin(th)
            pts = c_ + X[-1] * (rx * np.sin(ph))[:, None] - B[-1] * (rb * np.cos(ph))[:, None]
            nn = unit((X[-1] * (np.sin(ph) / 1.04)[:, None] - B[-1] * np.cos(ph)[:, None]) * math.cos(th) + T[-1] * math.sin(th))
            rings.append(pts); norms.append(nn)
        NRC = NRT + len(CAP)
        G = np.array(rings); NG = np.array(norms)
        dK = np.gradient(G, axis=0); dS = np.gradient(G, axis=1); NT = unit(np.cross(dS, dK))
        NT = np.where(((NT * NG).sum(-1) < 0)[..., None], -NT, NT); NT[0] = NG[0]; NT[NRT - 1:] = NG[NRT - 1:]
        V = list(G.reshape(-1, 3)); NN = list(NT.reshape(-1, 3))
        UU, VV = np.meshgrid(ph / (2 * PI), np.concatenate([tk, np.ones(len(CAP))])); UVl = list(np.stack([UU.reshape(-1), VV.reshape(-1)], -1))
        F = grid_faces(NRC, NST + 1, wrap=False)
        tip = P[-1] + T[-1] * R[-1]; it = len(V); V.append(tip); NN.append(T[-1]); UVl.append(np.array([.5, 1.]))
        last = (NRC - 1) * (NST + 1)
        for i in range(NST): F.append((last + i, last + i + 1, it))
        root = P[0] - T[0] * .01; ir = len(V); V.append(root); NN.append(-T[0]); UVl.append(np.array([.5, 0.]))
        for i in range(NST): F.append((i + 1, i, ir))
        V = np.array(V); NN = np.array(NN); UVl = np.array(UVl)
        UV = au('tail', UVl[:, 0], UVl[:, 1])
        make_obj('tail', V, F, UV, 'tail', N=NN)
        TAIL.update({'P': P, 'R': R, 'T': T, 'B': B, 'X': X, 'tk': tk, 'rings': NRT, 'sides': NST})
        return P
    TP_ = build_tail()
    TAIL_ROOT = TAIL_CP[0]

    def _vs(prefixes):
        out = []
        for g, obs in parts.items():
            for o in obs:
                if any(o.name.startswith(p) for p in prefixes): out += [list(o.matrix_world @ v.co) for v in o.data.vertices]
        return np.array(out)
    def _ext(v): return {'min': [round(float(c), 3) for c in v.min(0)], 'max': [round(float(c), 3) for c in v.max(0)], 'size': [round(float(c), 3) for c in np.ptp(v, 0)]}
    BODY_MEAS = {'body_parts_m': {k: _ext(_vs(v)) for k, v in {
        'shirt': ['shirt'], 'collar': ['collar'], 'scarf': ['scarf'], 'shorts': ['shorts'], 'sleeve_L': ['sleeve.L', 'sleeve_cuff.L'],
        'paw_L': ['mitten_paw.L'], 'paw_R': ['mitten_paw.R'], 'legs': ['fur_leg'],
        'foot_L': ['fur_foot.L'], 'tail': ['tail'], 'lash_L': ['lash.L']}.items() if len(_vs(v))}}
    BODY_MEAS['arm_angle_from_vertical_deg'] = ARM_DEG
    BODY_PIVOTS = {'arm.L': tuple(ARM['L']['shoulder']), 'arm.R': tuple(ARM['R']['shoulder']), 'sleeve.L': tuple(ARM['L']['shoulder']),
                   'sleeve.R': tuple(ARM['R']['shoulder']), 'body': (0, 0, 0), 'shorts': (0, RCY, SZ[0]), 'collar': (0, RCY, .50),
                   'tail': tuple(TAIL_ROOT), 'scarf': tuple(KN_C)}
    def POST_JOIN():
        joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X'}
        joints.update({'hips': [0, RCY, .272], 'spine': [0, RCY, .370], 'chest': [0, RCY - .004, .450], 'neck': [0, RCY - .004, .528]})
        joints['head'] = [float(v) for v in O]
        joints['head_base'] = [0, float(HY + .02 * W), float(CHIN + .02 * W)]
        joints['jaw_pivot'] = [0, float(HY + NOSE_TIP_L * W + .20 * W), float(CHIN + .10 * W)]
        joints['eyes'] = {'R': eye_centers['R'], 'L': eye_centers['L']}
        joints['lashes'] = LASH_INFO
        joints['ears'] = {t: {k: [float(v) for v in ear_info[t][k]] for k in ('base', 'mid', 'tip')} for t in ('R', 'L')}
        joints['arms'] = {t: {k: ARM[t][k] for k in ('shoulder', 'elbow', 'wrist')} for t in ARM}
        joints['legs'] = LEG
        joints['palm_R'] = ARM['R']['palm']; joints['palm_L'] = ARM['L']['palm']
        P = TAIL['P']; n_ = len(P); idx = [0, n_ // 4, n_ // 2, (3 * n_) // 4, n_ - 3, n_ - 1]
        joints['tail'] = [[round(float(c), 4) for c in P[i]] for i in idx]
        joints['tailRoot'] = [float(v) for v in TAIL_ROOT]
        joints['mouth'] = MOUTH_INFO
        joints['scarf'] = LOG['scarf']
        joints['collar'] = LOG['collar']
        joints['shorts'] = SHORTS
        joints['notes'] = ['Phase 1: no rig, weights or animations. Same keys as the Toybox heroes / Kitsune / Kazemaru / Kaede joints.json.',
                           'head = the head-ball centre (the radial origin), not the nod pivot; head_base = a suggested nod pivot at the base of the skull.',
                           'Head skin = zero surface of one smooth implicit field (skull + cheek mass + cheek tufts + muzzle + chin + nose), analytic normals; no eye sockets.',
                           'Mouth: a sculpted "U" smile groove (closed) with 5 loops round it; the skin is cut along the parting (see mouth).',
                           'Eyelid holes ringed by 6 loops each, the rim rolled in behind separate lens eyeballs; 5 loops round the nose.',
                           'Lashes: Kaito_lash_L / _R, thick rolls on the skin over each opening with the wing (origin = the eye centre): weight 100% to lidU.',
                           'Ears: separate pieces (Kaito_ear_L / _R), 35 bend rows from the root (in the skull) to the tip; pivot = ears.base.',
                           'Collar (Kaito_collar) and scarf (Kaito_scarf: the knot and two ends, 14 rings each): weight to chest / neck.',
                           'Tail: a separate piece (Kaito_tail), 28 bend rings from the root (in the shorts) to the tip; pivot = tailRoot; chain = tail.',
                           'Sleeves (Kaito_sleeve_L/_R, with their cuffs): separate shells with 11 rings; the shorts (Kaito_shorts) 11 rings a leg.']
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
def paint_hit(d):
    P = radial_hit(d); t = np.linalg.norm(P - O, axis=1)
    bad = np.zeros(len(d), bool)
    for k in range(1, 9):
        tk = np.minimum(t + .012 * k, .52); bad |= head_sdf(O + d * tk[:, None]) < 0
    if bad.any(): P[bad] = radial_hit_outer(d[bad])
    return P
def ell_r(q, c, r): return np.sqrt((((q - np.array(c)) / np.array(r)) ** 2).sum(1))
def white_face(q, n):
    """the cream lower face (front projection, W units; both head views): the muzzle, the cheeks and the whole cheek tufts under a soft
    edge (0.29 W at the centre over the nose, 0.24 under the eyes, rising to 0.33 at |x| 0.50 over the tufts); seen from the side the
    cream runs back level to the tuft tips (0.22 W behind the head centre) and the back of the jaw under them is orange; the chin's
    underside and the neck are cream."""
    qx, qy, qz = q[:, 0], q[:, 1], q[:, 2]; ax_ = np.abs(qx)
    top = np.interp(ax_, [0, .05, .09, .16, .25, .35, .42, .50, .56, .62], [.290, .285, .265, .242, .246, .276, .310, .330, .318, .300])
    aa = .010
    m = 1 - smooth(-aa, aa, qz - top)
    yb = np.interp(qz, [-.05, .03, .10, .18, .24, .30, .36], [-.02, .02, .09, .16, .22, .24, .22])     # how far back the cream reaches
    m = m * smooth(yb + .030, yb - .030, qy)
    under = smooth(-.25, -.60, n[:, 2]) * (ax_ < .34) * smooth(.14, .00, qy) * (qz < .08)
    neck = smooth(.0, -.04, qz) * smooth(.00, -.10, qy) * (ax_ < .26)
    return clamp(np.maximum.reduce([m, under, neck]))
def paint_head(U, V, P=None):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = paint_hit(d) if P is None else P; n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); qx, qz = q[:, 0], q[:, 2]; ax_ = np.abs(qx)
    fr = smooth(HY + .04, HY - .08, y)
    C = ramp_colour('fur', sval(n, hi=.12, lo=.20))
    # soft clay creases where the muzzle, the chin and the tufts meet the skull (fillet shading, never lines)
    dsk = skull(q); dch = smin(dsk, ell(q, *CHEEK), K_CHEEK)
    cr = .22 * crease(dch, muz_sdf(q), K_MUZ) + .18 * crease(smin(dch, muz_sdf(q), K_MUZ), ell(q, *CHINB), K_CHINB) \

    C = mix(C, rgb('furdark'), clamp(cr) * .12)
    # the ears' contact shade on the head round each ear root
    for s in (-1, 1):
        Bc, Tp, A, Nf, E = ear_frame(s); Pm = L2M(Bc[None] + A[None] * .06)[0]
        dd = np.linalg.norm(P - Pm, axis=1) / W
        C = mix(C, rgb('furdark'), .28 * np.exp(-(dd / .16) ** 2))
    # the white lower face
    wm = white_face(q, n)
    C = mix(C, ramp_colour('white', sval(n, hi=.10, lo=.16) - .06 * smooth(.10, -.05, qz)), wm)
    # blush, over the white / fur border on the cheeks
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .82 * (1 - smooth(.55, 1.08, r)) * fr * PAINT_OPTS['blush'])
    # brows: soft dark arcs (sheet: centres +-0.204 W at 0.576 W, 0.146 W long, 0.026 W thick at the middle), the outer end lower and
    # tapering to a point, the inner end blunter
    t_ = np.linspace(-1, 1, 15)
    for s in (-1, 1):
        Pb = np.stack([s * (.204 + .066 * t_), .564 + .032 * (1 - t_ ** 2) - .019 * t_], -1)
        hb = .0028 + .0128 * (1 - t_ ** 2) ** .60 * (1 - .14 * t_)
        near = (np.abs(qx - s * .204) < .10) & (qz > .50) & (qz < .66)
        a = np.zeros(len(x)); a[near] = stroke(qx[near], qz[near], Pb, hb, .0045)
        C = mix(C, rgb('brow'), .95 * a * fr)
    # nose: dark, a soft top highlight
    qq = q - NOSE_C; qq[:, 1] = qq[:, 1] - nose_recede(qq[:, 2]); widen = nose_widen(qq[:, 2]); qq[:, 2] = qq[:, 2] * nose_flat(qq[:, 2])
    rn = np.sqrt((qq[:, 0] / (NHW * widen)) ** 2 + (qq[:, 1] / NHD) ** 2 + (qq[:, 2] / NHH) ** 2)
    zr_ = (qz - NZW) / NHH; hw_ = NOSE_PW * (.55 + .45 * smooth(-1.0, .55, zr_)) * np.sqrt(np.clip(1 - np.clip(zr_ - .55, 0, 1) ** 2 / .45 ** 2 * .35, 0, 1))
    r2d = np.sqrt((qx / np.maximum(hw_, 1e-4)) ** 2 + ((zr_ - .03) / 1.03) ** 2)
    deep = (q[:, 1] - NOSE_TIP_L)
    nose_m = (1 - smooth(.94, 1.02, r2d)) * smooth(.050, .036, deep) * (n[:, 1] < .2)
    nose_c = ramp_colour('nose', sval(n, hi=.10, lo=.22) - .02)
    C = mix(C, nose_c, .98 * np.maximum(nose_m, 1 - smooth(1.05, 1.12, rn)))
    rh_ = np.sqrt(((qq[:, 0] + .007) / .017) ** 2 + ((qq[:, 2] - .012) / .007) ** 2) + 9 * (qq[:, 1] > .014)
    C = mix(C, rgb('nosehi'), .65 * (1 - smooth(.40, 1.0, rh_)) * np.maximum(rn < 1.10, nose_m > .5))
    # the sculpted mouth: no painted line; a darker shade on the groove walls only, by depth behind the un-grooved surface
    mb = (fr > 0) & mouth_mask(q) & (q[:, 2] < NZW - .80 * NHH)
    if mb.any():
        dep = -head_local_pre(q[mb])
        C[mb] = mix(C[mb], rgb('#C89A8C'), .35 * smooth(.0004, .0020, dep))      # only a whisper of the sculpted groove
    # the painted smile line (0.011 W): the sheet's small "U" smile, one clean curve out to gently curled corners
    t_m = np.linspace(-1.03, 1.03, 61); Pm = mouth_arch(t_m)
    hm = .0050 * (1 - .40 * smooth(.80, 1.03, np.abs(t_m))) + .0012
    Pp = np.array([[0, NZW - NHH + .004], [0, MA_C + MA_CUSP]]); hp = np.array([.0044, .0050])
    nm = (fr > 0) & (np.abs(qx) < .13) & (qz > .10) & (qz < NZW)
    if nm.any():
        a = stroke(qx[nm], qz[nm], Pm, hm, .0026)
        C[nm] = mix(C[nm], rgb('brow'), .96 * a)
    # the eyes: no painted lash (it is the 3-D roll Kaito_lash_L/R); a faint warm contact shade under the roll only
    for s in (-1, 1):
        sr, psi, X, Z = eye_s3(s, P)
        near_eye = fr * (sr < 2.2)
        th = lash_th(psi)
        band = (1 - smooth(1 + th + .02, 1 + th + .10, sr)) * smooth(.004, .02, th) * (sr > .95)
        C = mix(C, rgb('furdark'), .30 * band * near_eye * PAINT_OPTS.get('eyeband', True))
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
        hw_ = NOSE_PW * (.55 + .45 * smooth(-1.0, .55, zr_)) * np.sqrt(np.clip(1 - np.clip(zr_ - .55, 0, 1) ** 2 / .45 ** 2 * .35, 0, 1))
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

IRIS_RX_W, IRIS_RZ_W = .0705, .093                   # the iris (both head views): 0.141 x 0.186 W, a tall oval filling the height
def paint_eye(U, V, s):
    Xs = (U - .5) * 2.4; Z = (V - .5) * 2.4         # Xs: screen right (the chart's u runs to screen right for both eyes)
    Xo = s * Xs                                      # outward
    sr = eye_norm(Xo, Z)[0]
    hw = EYEF[s]['hw'] / W; hh = EYEF[s]['hh'] / W
    Xm = Xo * hw; Zm = Z * hh                        # metric eye-plane coordinates (W units), outward / up
    ixm = -.030; izm = -.0085                        # the iris tucked toward the nose (sheet 0.030 W); white crescents on the outer side
    C = mix(rgb('sclera'), rgb('#EADFDA'), .55 * smooth(.25, .95, Z))
    ex = (Xm - ixm) / IRIS_RX_W; ez = (Zm - izm) / IRIS_RZ_W; r = np.sqrt(ex * ex + ez * ez)
    g = smooth(.65, -.80, ez)                        # 0 at the top .. 1 at the bottom
    I = mix(rgb('irisdark'), rgb('#2C7488'), smooth(.10, .50, g))
    I = mix(I, rgb('iris'), smooth(.40, .78, g))
    I = mix(I, rgb('irisglow'), .65 * smooth(.70, 1.0, g) * (1 - smooth(.62, .92, r)))
    I = mix(I, rgb('#1A4252'), .75 * smooth(.84, .99, r))
    I = I * (1 - .040 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 22 + r * 8)) * smooth(.45, .80, r))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    pxm = ixm - .030; pzm = izm + .000                # (sheet eye zoom: the pupil 0.081 x 0.10 W, 0.032 W toward the nose in the iris)
    Rp = np.sqrt(((Xm - pxm) / .0410) ** 2 + ((Zm - pzm) / .0520) ** 2)
    C = mix(C, rgb('pupil'), 1 - smooth(.96, 1.04, Rp))
    # catchlights, the same light for both eyes (upper left on screen): a big round one and a small one lower right
    sl = -s                                          # screen-left in outward units
    big = np.sqrt(((Xm - (pxm + sl * .004)) / .0190) ** 2 + ((Zm - (pzm + .040)) / .0200) ** 2)
    small = np.sqrt(((Xm - (pxm - sl * .030)) / .0070) ** 2 + ((Zm - (pzm - .040)) / .0085) ** 2)
    C = mix(C, rgb('#FFFBF6'), np.maximum(1 - smooth(.90, 1.08, big), .85 * (1 - smooth(.86, 1.12, small))))
    C = mix(C, rgb('lash'), smooth(.90, 1.0, sr) * smooth(.15, .55, Z))
    skin = ramp_colour('fur', .45)
    return mix(C, skin, smooth(1.03, 1.07, sr))

LIGHT_SYM = unit(np.array([0., -.35, 1.]))
def sval_sym(n, hi=.26, lo=.22, occ=0.):
    d = np.asarray(n) @ LIGHT_SYM
    return clamp(.50 + hi * smooth(.0, .95, d) - lo * smooth(.05, .95, -d) - occ)
def paint_ear(U, V):
    """the pyramid ears (round 3): u = around the section (0 = back, 0.5 = the front face), v = VV along the ear (root < 0 .. tip 1)"""
    sh = U.shape; U = U.ravel(); V = V.ravel()
    th = U * 2 * PI; VV = np.clip(V * 1.42 - .30, -.30, 1.12)
    bx, by, n2 = sec_boundary(th)
    FM, T, A, Nf, Lt = ear_frame(1); Bk = -Nf
    n = unit(Lt[None] * n2[:, 0:1] + Bk[None] * n2[:, 1:2] + A[None] * .28)
    sv = sval(n, hi=.18, lo=.18)
    C = ramp_colour('ear', sv + .02)
    # the dark cap all round (front and back), its lower edge tilted: low down the outer rim, higher on the inner edge (sheet)
    vd = EAR_DARK_VV - EAR_DARK_TILT * np.clip(bx / EAR_SEC['ax'], -1, 1)
    C = mix(C, ramp_colour('tip', sv), smooth(-.020, .020, VV - vd))
    # the pink inner ear on the front face: a broad triangle inside a soft rim (dark on the outer top, fur on the inner side)
    hwp = .205 * np.clip(1 - .94 * VV / EAR_PINK_TOP_VV, .03, 1) ** .80 / np.maximum(1 - (1 - EAR_SC_TIP) * np.clip(VV, 0, 1) ** EAR_Q, .2)
    front = smooth(.55, .85, -n2[:, 1]); lat = 1 - smooth(hwp - .022, hwp + .004, np.abs(bx + .012))
    pinkm = front * lat * smooth(-.02, .04, VV) * (1 - smooth(EAR_PINK_TOP_VV - .04, EAR_PINK_TOP_VV + .01, VV))
    deep = np.clip(1 - (bx / .145) ** 2, 0, 1) * smooth(.10, .30, VV)
    C = mix(C, ramp_colour('inner', .46 - .12 * deep), pinkm)
    return C.reshape(sh + (3,))
def paint_tail(U, V):
    sh = U.shape; U = U.ravel(); V = V.ravel()
    ph = U * 2 * PI; k = V * (TAIL['rings'] - 1)
    tk = TAIL['tk']; idx = np.clip(np.searchsorted(tk, V) - 1, 0, len(tk) - 2); f = clamp((V - tk[idx]) / (tk[idx + 1] - tk[idx]))
    Bv = unit(TAIL['B'][idx] * (1 - f[:, None]) + TAIL['B'][idx + 1] * f[:, None]); Xv = TAIL['X'][idx]
    n = unit(Xv * np.sin(ph)[:, None] - Bv * np.cos(ph)[:, None])
    sv = sval(n, hi=.24, lo=.24, occ=.12 * smooth(.20, .0, V))
    # the cream tip (sheet: the upper ~45 %, a clean soft curved border)
    tw = .535 + .030 * np.cos(ph) + .010 * np.sin(3 * ph + .6)
    wht = smooth(-.010, .010, V - tw)
    C = ramp_colour('fur', sv)
    C = mix(C, ramp_colour('white', sv + .02), wht)
    C = mix(C, rgb('furdark'), .25 * smooth(.10, .0, V))
    return C.reshape(sh + (3,))
def paint_torso(U, V):
    sh = U.shape; U = U.ravel(); V = V.ravel()
    a = U * 2 * PI - PI; z = TZ[0] + V * (TZ[-1] - TZ[0])
    P = torso_raw(a, z); n = torso_n(a, z); x = P[:, 0]
    sv = sval(n, hi=.20, lo=.20)
    C = ramp_colour('shirt', sv + .02)
    zo = col_edges(a)[1]
    C = mix(C, rgb('shirtdark'), .38 * smooth(zo - .028, zo - .004, z))          # the collar's soft contact shade on the shirt
    C = mix(C, rgb('shirtdark'), .22 * smooth(.335, .305, z))                   # a soft shade toward the hem
    # inside the V above the scarf knot: the fox's cream chest
    xin = LAP_IN[0][0] + (LAP_IN[1][0] - LAP_IN[0][0]) * np.clip((z - LAP_IN[0][1]) / (LAP_IN[1][1] - LAP_IN[0][1]), 0, 1.3)
    vm = (np.cos(a) > 0) * smooth(xin + .008, xin + .002, np.abs(x)) * smooth(.440, .452, z)
    C = mix(C, ramp_colour('white', sval(n, hi=.10, lo=.16) - .06 - .10 * smooth(.50, .54, z)), vm)
    return C.reshape(sh + (3,))
def paint_ramp(U, V):
    rows = np.clip((V * CHARTS['ramp'][3] / 32).astype(int), 0, 15); C = np.zeros(U.shape + (3,))
    for name, k in RAMP_ROWS.items():
        m = rows == k
        if not m.any(): continue
        C[m] = ramp_colour(name, U[m])
    return C
def paint_furmix(U, V): return mix(ramp_colour('fur', U), ramp_colour('white', U), V)          # v: 0 orange fur .. 1 white fur
def paint_shirtmix(U, V): return mix(ramp_colour('shirt', U), mix(ramp_colour('shirt', U + .10), rgb('#FFF4EA'), .20), V)          # v: tone (lighter)
def paint_navymix(U, V): return mix(ramp_colour('navy', U), mix(ramp_colour('navy', U + .16), rgb('#506E98'), .30), V)
PAINTERS = {'head': paint_head_aa, 'eye.L': lambda U, V: paint_eye(U, V, 1), 'eye.R': lambda U, V: paint_eye(U, V, -1),
            'ramp': paint_ramp, 'furmix': paint_furmix, 'shirtmix': paint_shirtmix, 'navymix': paint_navymix, 'ear': paint_ear}
if not HEAD_ONLY: PAINTERS.update({'tail': paint_tail, 'torso': paint_torso})
if RIG:
    PAINTERS['cavity'] = lambda U, V: mix(rgb('#4a1c2c'), rgb('#341220'), .55 * smooth(.25, 1., V))
    PAINTERS['tongue'] = lambda U, V: mix(rgb('#e07a8e'), rgb('#ee9aac'), .45 * smooth(.15, .9, V))
atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [255, 154, 74, 255]
MIX_CHARTS = ('furmix', 'shirtmix', 'navymix')
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
atlas_path = os.path.join(ROOT, 'scratch', 'head_atlas.png') if HEAD_ONLY else (os.path.join(ROOT, 'scratch', 'rig_base_atlas.png') if RIG else os.path.join(ROOT, 'sk-kaito-toy_atlas.png'))
write_png(atlas_path, atlas)
del atlas
img = bpy.data.images.load(atlas_path); img.name = 'Kaito_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Kaito_toy_atlas'); MAT.use_nodes = True
bs = next(n_ for n_ in MAT.node_tree.nodes if n_.type == 'BSDF_PRINCIPLED'); bs.inputs['Roughness'].default_value = .8
bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .25
tx = MAT.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
MAT.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])
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
        MEAS['ear_' + tag] = {'tip_z_W': round(float(q_[:, 2].max()), 3), 'tip_z_m': round(float(ev[:, 2].max()), 3),
                              'x_range_W': [round(float(np.abs(q_[:, 0]).min()), 3), round(float(np.abs(q_[:, 0]).max()), 3)],
                              'y_range_W': [round(float(q_[:, 1].min()), 3), round(float(q_[:, 1].max()), 3)]}
MEAS.update(LOG)
MEAS.update(BODY_MEAS)

# ============================================================== JOIN, CLEAN, NORMALS
objects = []; part_tri = {}
PIVOTS = {'head': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'], 'lash.L': eye_centers['L'], 'lash.R': eye_centers['R'],
          'ear.L': tuple(ear_info['L']['base']), 'ear.R': tuple(ear_info['R']['base'])}
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
    ob = finish_group(obs, OBJ_NAMES.get(group, 'Kaito_' + group.replace('.', '_')), PIVOTS.get(group, (0, 0, 0)), MAT)
    ob['phase'] = '1: neutral A-pose, no armature'
    part_tri[ob.name] = len(ob.data.loop_triangles); objects.append(ob)
tri_count = sum(part_tri.values()); print('PART_TRIANGLES', json.dumps(part_tri), flush=True)
HEADSET = sum(v for k, v in part_tri.items() if k in ('Kaito_head', 'Kaito_eye_L', 'Kaito_eye_R', 'Kaito_ear_L', 'Kaito_ear_R', 'Kaito_lash_L', 'Kaito_lash_R'))
MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count; MEAS['head_eyes_ears_triangles'] = HEADSET
_allv = np.concatenate([all_verts([o]) for o in objects])
MEAS['bounds_m'] = {'min': [round(float(c), 3) for c in _allv.min(0)], 'max': [round(float(c), 3) for c in _allv.max(0)]}
if RIG:
    pass
elif not HEAD_ONLY:
    if not os.environ.get('KAITO_NO_BUDGET'): assert tri_count <= 30000, ('Triangle budget', tri_count)
    if POST_JOIN: POST_JOIN()
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-head.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
if not RIG: print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not HEAD_ONLY and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'sk-kaito-toy.blend'))
def export_sel(obs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs: ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                              export_animations=False)
if not RIG: export_sel(objects, OUT_MODEL)
print('KAITO_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
