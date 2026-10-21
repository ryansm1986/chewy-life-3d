"""Tamamo, the Nine-Tailed (white kitsune fox queen, final boss of the Burrow), Toybox line: phase 1, the model in a neutral A-pose
(Option A "Moon Fox Queen", refs/sheet.png), plus her ONE tail as its own instanced model. Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_tamamo-toy.py [-- --head-only]
    python build_tamamo-toy.py --tune          (plain Python: prints the head field's profile / widths, then stops)

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/tamamo-toy.glb and public/models/tamamo-tail.glb (--head-only writes scratch/ instead).

Technique (the Toybox machinery of Poe / Moka / Stella):
- The head is ONE smooth implicit field: a wide mochi skull (a superellipse, flat underneath, widest at the cheeks), soft cheek-ruff
  tufts, a small white muzzle pad with whisker pads, a soft chin and a small rounded nose, with a set-in socket for each eye. The skin
  is the field's zero surface reached by radial projection (CDT in a stereographic domain, with edge loops round the eyelids, nose
  and mouth), so every vertex carries its analytic normal. Adaptive refinement adds points where the game's toon band would zigzag.
- The mouth is SCULPTED (a soft groove along the small cat "w"), and the skin is cut along it so the rig's jaw can open it.
- The eyes are separate lens globes following the ball, facing 30 deg outward; the opening is a tilted almond (outer corner up).
- The ears are thick cupped triangular shells with rolled rims (lavender inside), bend rows from the root to the tip.
- The hair crest is two sculpted masses (a swept comma lock and a round lobe). The fox mask is a thick SDF solid with painted
  markings, worn on her left side, turned 45 deg outward; the gold crescent kanzashi is a swept crescent with a pin bead.
- The kimono is lathed and thickened shells (top, skirt), swept bands (lapels, juban collar, hem and front trims, cuffs), the obi
  ring with its cord, the big gold back bow (SDF loops), kimono sleeves lofted from the shoulder to a vertical cuff opening.
- One 2048 painted atlas: face and eyes painted from 3D positions, the mask painted in its own chart, 2-D shade x tone charts and
  1-D shading ramps for everything else.
- The tail (tamamo-tail.glb) is a separate, vertex-coloured plume (one object `body`), root at the origin, pointing +Z.
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
MODEL = MODELS + '/tamamo-toy.glb'
TAIL_MODEL = MODELS + '/tamamo-tail.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'tamamo-head-test.glb') if HEAD_ONLY else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(17)
if not TUNE: bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
# ---- proportions, measured on refs/sheet.png (measure/ruler.py): the front turnaround's crest top is at sheet y 112, the chin at 263,
# the ground at 438 (326 px = 1.05 m); the head is 216 px wide at the cheeks. The sheet DRAWS 2.16 heads (crest to chin 151 px), not
# the 2.4 its caption says: the build follows the drawing (the blueprint). The head close-up: W 280 px, crest 537, chin 728.
T_CROWN = 1.050                 # the crest top (the brief's crown, ears excluded)
W = 0.700                       # head width at the cheek ruff
CREST_W = .691                  # crest top above the chin, in W (the close-up: 191 / 280 = 0.682; a little extra for the lock's height)
CHIN = round(T_CROWN - CREST_W * W, 4); HY = 0.0
LOG = {'T_CROWN': T_CROWN, 'W': W, 'CHIN': CHIN}

PAL = {'fur': '#F6ECE4', 'furlight': '#F8F3EE', 'furdark': '#D6C4C6',
       'white': '#FCF8F5', 'whitelight': '#FFFFFF', 'whitedark': '#E0D4D4',
       'indigo': '#3C2C78', 'indigolight': '#52409A', 'indigodark': '#281C5A',
       'lining': '#281A50', 'gold': '#FFD24A', 'goldlight': '#FFE184', 'golddark': '#D49E2A',
       'obi': '#FFCF3A', 'obilight': '#FFDC6E', 'obidark': '#D69A22',
       'lav': '#C8A8FF', 'lavlight': '#DAC6FF', 'lavdark': '#A586E0',
       'nose': '#281A50', 'nosehi': '#56478C', 'nosedark': '#1C1240',
       'iris': '#FF3A6A', 'irisdark': '#A0163E', 'irisglow': '#FF8FAA', 'pupil': '#4A0E26',
       'sclera': '#FBF2EE', 'lash': '#281A50', 'brow': '#CDBEE6', 'blush': '#FFB0D0', 'mouth': '#6A2036',
       'maskred': '#E8304A', 'maskpink': '#FF6A8A', 'dark': '#2A2230'}
CHARTS = {'head': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'furmix': (1280, 896, 256, 256), 'earmix': (1536, 896, 256, 256),
          'indmix': (1792, 896, 256, 256), 'mask': (0, 0, 512, 512)}
if RIG:
    CHARTS.update({'lidU': (1024, 0, 512, 192), 'lidD': (1024, 192, 512, 128), 'cavity': (1536, 0, 128, 128), 'tongue': (1664, 0, 128, 128)})
PAINT_OPTS = {'lash': True, 'blush': True}
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'white': ('whitedark', 'white', 'whitelight'),
         'indigo': ('indigodark', 'indigo', 'indigolight'), 'lining': ('#1A1040', 'lining', '#3A2A6A'),
         'gold': ('golddark', 'gold', 'goldlight'), 'obi': ('obidark', 'obi', 'obilight'), 'cord': ('#B8801E', '#E4A82E', '#F2C050'),
         'lav': ('lavdark', 'lav', 'lavlight'), 'nose': ('nosedark', 'nose', '#4A3A7A'), 'mask': ('#DCD0D2', '#F8F2EE', '#FBF7F4'),
         'eyedark': ('#1E1A24', '#2A2230', '#4A4256')}
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

# ============================================================== the head field (W units, z above the chin, y from HY)
# Skull: a wide mochi. Front view: a superellipse, widest (0.455 W + the ruff) at z 0.225 W, flat and boxy underneath (n 2.8),
# rounder over the top (n 2.25), the skull top at 0.645 W; depth 0.37 W in front, 0.36 W behind (sheet side view: 0.77 W deep).
SK = dict(a=.482, zc=.225, cu=.420, cd=.225, n=3.2, n_top=2.25, bf=.370, bb=.362, taper=0., t0=.10, t1=.40)
def skull(q):
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    zr = z - SK['zc']; c = np.where(zr > 0, SK['cu'], SK['cd'])
    a = SK['a'] * (1 - SK['taper'] * smooth(SK['t0'], SK['t1'], z)); n = SK['n'] + (SK['n_top'] - SK['n']) * smooth(SK['t0'] + .05, SK['t1'] + .05, z)
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
    ys = np.linspace(-.80, .30, 300)
    P = np.stack([np.repeat(x[:, None], len(ys), 1), np.broadcast_to(ys, (n, len(ys))), np.repeat(z[:, None], len(ys), 1)], -1).reshape(-1, 3)
    ins = (f(P) < 0).reshape(n, len(ys)); i = np.argmax(ins, 1); ok = ins[np.arange(n), i]
    lo = ys[np.maximum(i - 1, 0)]; hi = ys[i]
    for _ in range(26):
        m = (lo + hi) / 2; inn = f(np.stack([x, m, z], -1)) < 0
        hi = np.where(inn, m, hi); lo = np.where(inn, lo, m)
    return np.where(ok, (lo + hi) / 2, np.nan)

def mirror(q):
    qa = np.array(q, float, copy=True); qa[..., 0] = np.abs(qa[..., 0]); return qa
# the cheek ruff: two soft fur tufts each side at the widest (the sheet's slight points at the cheeks), a small white muzzle pad, a
# soft chin under it, a neck reaching under the collar
RUFF1 = ([.445, .020, .222], [.032, .190, .085]); RUFF2 = ([.300, .000, .100], [.010, .010, .010]); K_RUFF = .070
MUZ = [[0, -.322, .128], [.110, .064, .068]]; K_MUZ = .050
CHINB = [[0, -.245, .052], [.100, .075, .050]]; K_CHINB = .045
NECK = [[0, .010, -.070], [.165, .145, .105]]; K_NECK = .060
def muz_sdf(q): return ell(q, *MUZ)
def base_local(q):
    d = skull(q); qm = mirror(q)
    d = smin(d, ell(qm, *RUFF1), K_RUFF); d = smin(d, ell(qm, *RUFF2), K_RUFF)
    d = smin(d, muz_sdf(q), K_MUZ); d = smin(d, ell(q, *CHINB), K_CHINB)
    return d

# eye layout (W units; the close-up): centres +-0.221 W at 0.190 W above the chin; the front-projected opening 0.212 x 0.150 W, a tilted
# almond (the outer corner 0.33 of the half-height up, the inner corner as much down: the regal fox eye)
EXW, EZW, EHWW, EHHW, EN = .221, .198, .104, .078, 2.30
EYE_SH = .26; EN_T, EN_B, EYE_TOPK = 2.60, 2.05, .74
def eye_norm(X, Z):
    """the opening's normalised radius (1 on the rim) and angle, for points (X outward, Z up) in the un-sheared frame"""
    top = Z > 0; Zs = Z / np.where(top, EYE_TOPK, 1.); en = np.where(top, EN_T, EN_B)
    return (np.abs(X) ** en + np.abs(Zs) ** en) ** (1 / en) + 1e-9, np.arctan2(Zs, X), Zs
RECESS = dict(delta=.016, tilt=-.70, F_out=.13, F_nas=.075, F_up=.080, F_dn=.065)
def eye_recess(q):
    """the set-in socket: depth over each opening (deeper on the nose side: the eye turns outward), C2 falloff outside"""
    x, y, z = q[..., 0], q[..., 1], q[..., 2]; tot = 0
    for s in (-1, 1):
        X = s * (x - s * EXW) / EHWW; Z = (z - EZW) / EHHW - EYE_SH * X
        sr, _ps, Zs = eye_norm(X, Z)
        c = X / sr; sn = Zs / sr
        dout = (sr - 1) * np.sqrt((EHWW * c) ** 2 + (EHHW * sn) ** 2)
        F = np.maximum(np.sqrt((np.where(c > 0, RECESS['F_out'], RECESS['F_nas']) * c) ** 2 + (np.where(sn > 0, RECESS['F_up'], RECESS['F_dn']) * sn) ** 2), 1e-4)
        w = (1 - smoother(.010, .010 + F, dout)) * (1 - RECESS['tilt'] * np.tanh(X / 1.3))
        tot = tot + w
    return tot * smooth(-.10, -.24, y)
def warped(q):
    qw = np.array(q, float, copy=True); qw[..., 1] = q[..., 1] - RECESS['delta'] * eye_recess(q); return qw
# nose: a small dark-indigo rounded triangle on the muzzle's front-top, 0.071 W wide, 0.040 W tall, centre 0.150 W above the chin
NZW = .150; NOSE_PW = .0370; NHW, NHH, NHD = .0370, .0185, .024; NOSE_SHEAR = .040; NOSE_WIDEN = .34; NOSE_FLAT = .35
_yf = float(front_local(0, NZW, lambda q: base_local(warped(q)))[0])
NOSE_C = np.array([0, _yf + NHD - .016, NZW])
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
K_N = .012
# the whisker pads: two small soft bulges either side of the philtrum, over the "w"
_pz = np.array([[.033, .112]]); _pyy = front_local(_pz[:, 0], _pz[:, 1], lambda q: base_local(warped(q)))
PAD = ([.036, float(_pyy[0]) + .011, .112], [.036, .020, .026]); K_PAD = .016
def head_local_pre(q, neck=True):
    d = base_local(warped(q)); d = smin(d, ell(mirror(q), *PAD), K_PAD)
    if neck: d = smin(d, ell(q, *NECK), K_NECK)
    return smin(d, nose_sdf(q), K_N)

# ---- the sculpted closed mouth: the sheet's small cat "w" (sheet px: corners x 153 / 188 at y 698, the arcs' low points at x 160 / 180,
# y 703, the cusp under the philtrum at y 700). W units: corners +-0.064 W at 0.107 W, the low points +-0.036 W at 0.089 W, the cusp 0.100.
MA_X, MA_C, MA_K, MA_P, MA_T0, MA_CUSP, MA_CURL = .064, .086, .019, 1.35, .52, .012, .006
def mouth_arch(t, crisp=False):
    t = np.asarray(t, float); a = np.abs(t)
    rise = np.clip((a - MA_T0) / (1 - MA_T0), 0, 1) ** MA_P
    cusp = MA_CUSP * (np.clip(1 - a / MA_T0, 0, 1) ** 1.5 if crisp else 1 - smooth(0., MA_T0, a))     # the loops' arch is rounded at the cusp
    return np.stack([MA_X * t, MA_C + MA_K * rise + cusp + MA_CURL * smooth(.80, 1., a) ** 1.4], -1)
MG_N = 33; _mt = np.linspace(-1, 1, MG_N); _mc = mouth_arch(_mt)
MG_TAPER = 1 - .70 * smooth(.55, .98, np.abs(_mt))
MG_RG = .0052 * MG_TAPER; MG_DL = .0009 * MG_TAPER; MG_SUP, MG_SDN, MG_SMID = 2.6, 1.65, 2.0
MG_YS = front_local(_mc[:, 0], _mc[:, 1], head_local_pre)
MG_C = np.stack([_mc[:, 0], MG_YS - MG_DL, _mc[:, 1]], -1)
_ru = front_local(_mc[:, 0], _mc[:, 1] + .0048, head_local_pre)
MG_R = np.stack([_mc[:, 0], _ru + .0018, _mc[:, 1] + .0040], -1); MG_RR = .0034 * MG_TAPER
PH_Z = np.array([NZW - NHH + .005, MA_C + MA_CUSP + .003]); _py = front_local(np.zeros(2), PH_Z, head_local_pre)
PH_C = np.stack([np.zeros(2), _py - .0004, PH_Z], -1); PH_R = np.array([.0030, .0034])
_dc = mouth_arch(np.array([-1., 1.]), True); _dy = front_local(_dc[:, 0], _dc[:, 1], head_local_pre)
DIMPLE_C = np.stack([_dc[:, 0] * 1.02, _dy - .0036, _dc[:, 1] + .001], -1); DIMPLE_R = .0042
MG_BOX = (.115, .045, .150, -.25)
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
NOSE_TIP_L = float(front_local(0, NZW, head_local)[0])
def L2M(q): return np.stack([q[..., 0] * W, HY + q[..., 1] * W, CHIN + q[..., 2] * W], -1)
def M2L(p): return np.stack([p[..., 0] / W, (p[..., 1] - HY) / W, (p[..., 2] - CHIN) / W], -1)
def head_sdf(p): return head_local(M2L(p)) * W
def skull_sdf(p): return base_local(M2L(p)) * W
def front_hit(x, z, f=head_sdf):
    return HY + W * front_local(np.asarray(x) / W, (np.asarray(z) - CHIN) / W, lambda q: f(L2M(q)) / W)
O = np.array([0, HY - .02 * W, CHIN + .24 * W])
_g = np.stack(np.meshgrid(np.zeros(1), np.linspace(-.5, .5, 101), np.linspace(.50, .80, 301), indexing='ij'), -1).reshape(-1, 3)
SKULL_TOP_M = float(CHIN + W * _g[head_local(_g) < 0][:, 2].max())
LOG['skull_top_m'] = round(SKULL_TOP_M, 4)

def head_report():
    tip = float(np.nanmin(front_local(np.zeros(60), np.linspace(.08, .22, 60), head_local)))
    rows = []
    for z in (.62, .55, .45, .35, .27, .20, .15, .12, .09, .05, .02):
        y = float(front_local(0, z, head_local)[0]); rows.append((z, round(y - tip, 3)))
    widths = {}
    for zw in (.0, .03, .06, .10, .15, .20, .225, .25, .30, .35, .40, .45, .50, .55, .60):
        xs_ = np.linspace(0, .7, 351); ys_ = front_local(xs_, np.full(len(xs_), zw), head_local); ok = np.isfinite(ys_)
        widths['%.3f' % zw] = round(float(2 * xs_[ok].max()), 3) if ok.any() else None
    q = np.array([[EXW, float(front_local(EXW, EZW, head_local)[0]), EZW]])
    g = np.zeros(3)
    for k in range(3):
        dp = np.zeros(3); dp[k] = 1e-4; g[k] = (head_local(q + dp) - head_local(q - dp))[0]
    g = g / np.linalg.norm(g)
    ys = np.linspace(-.6, .6, 601); P = np.stack([np.zeros_like(ys), ys, np.full_like(ys, .25)], -1); inn = head_local(P) < 0
    return {'skull_top_W': round((SKULL_TOP_M - CHIN) / W, 3), 'nose_tip_y_W': round(tip, 3), 'nose_c_y_W': round(float(NOSE_C[1]), 3),
            'depth_at_z.25_W': round(float(ys[inn].max() - ys[inn].min()), 3),
            'profile(z, behind the nose tip)': rows, 'widths(z: model)': widths,
            'eye_axis_out_deg': round(math.degrees(math.atan2(g[0], -g[1])), 1), 'eye_axis_down_deg': round(math.degrees(math.asin(-g[2])), 1),
            'mouth_groove_y_W': [round(float(v), 3) for v in MG_YS[::6]]}
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
    """skin points of the opening's (sheared) superellipse (scale k) laid out in the eye plane, hit along the eye axis"""
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
    """(superellipse radius, angle, X outward, Z up) of points in the eye plane, in the un-sheared opening frame"""
    F_ = EYEF[side]; d = np.asarray(P) - F_['Sc']
    X = (d @ F_['eo']) / F_['hw']; Z = (d @ F_['ev']) / F_['hh'] - EYE_SH * X
    sr, psi, Zs = eye_norm(X, Z)
    return sr, psi, X, Z
NZ = CHIN + NZW * W
BLUSH = (.300 * W, CHIN + .098 * W, .064 * W, .046 * W)

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
for k, (rx, rz, n) in enumerate([(.0125, .0062, 12), (.024, .0112, 14), (.0345, .0160, 18), (.0420, .0195, 20), (.0480, .0222, 22)]):
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
D = fib(1150, math.radians(118.5)); Pf = radial_hit_outer(D)
D2 = fib(3300, math.radians(76)); P2 = radial_hit_outer(D2)
def fine_zone(P):
    q = M2L(P)
    return ((np.abs(q[:, 0]) < .55) & (q[:, 2] > -.02) & (q[:, 2] < .46)) & (P[:, 1] < HY - .10 * W)
D = np.concatenate([D[~fine_zone(Pf)], D2[fine_zone(P2)]]); Pf = np.concatenate([Pf[~fine_zone(Pf)], P2[fine_zone(P2)]])
# the chin and the flat underside's front edge: a regular grid sampled from the front
gx, gz = np.meshgrid(np.linspace(-.26, .26, 21) * W, CHIN + np.linspace(-.03, .075, 8) * W)
gx = gx.ravel(); gz = gz.ravel(); gy = front_hit(gx, gz); okg = np.isfinite(gy)
G = np.stack([gx, gy, gz], -1)[okg]; Dg = unit(G - O)
zone = (np.abs(Pf[:, 0]) < .27 * W) & (Pf[:, 2] < CHIN + .078 * W) & (Pf[:, 2] > CHIN - .035 * W) & (Pf[:, 1] < HY - .15 * W)
D = np.concatenate([D[~zone], Dg]); Pf = np.concatenate([Pf[~zone], radial_hit_outer(Dg)]); keep = np.ones(len(D), bool)
# the muzzle top (it faces up, so rays from the head centre graze it): a regular grid sampled from the front
gx, gz = np.meshgrid(np.linspace(-.13, .13, 15) * W, CHIN + np.linspace(.17, .26, 7) * W)
gx = gx.ravel(); gz = gz.ravel(); gy = front_hit(gx, gz); okg = np.isfinite(gy)
Gm_ = np.stack([gx, gy, gz], -1)[okg]; Dm_ = unit(Gm_ - O)
zone = (np.abs(Pf[:, 0]) < .14 * W) & (Pf[:, 2] > CHIN + .165 * W) & (Pf[:, 2] < CHIN + .265 * W) & (Pf[:, 1] < HY - .28 * W)
D = np.concatenate([D[~zone], Dm_]); Pf = np.concatenate([Pf[~zone], radial_hit_outer(Dm_)]); keep = np.ones(len(D), bool)
dom = to_dom(D)
for s in (-1, 1):
    c, base = eye_dom[s]
    outer = np.array([pts[i] for i in tags['eye%d_%d' % (s, len(EYE_SCALES) - 1)]])
    keep &= ~in_poly(c + (dom - c) / 1.06, outer)
front = Pf[:, 1] < HY
keep &= ~(front & ((Pf[:, 0] / (.054 * W)) ** 2 + ((Pf[:, 2] - NZ) / (.026 * W)) ** 2 < 1))
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
REFINE_ADD = int(os.environ.get('REFINE_ADD', '560')); D_LOW, D_T = .12, .45
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
              'note': 'Tamamo_head is cut along the parting (upper and lower copies of the interior vertices; the corners are shared). '
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

print('STEP ears', flush=True)
# ============================================================== EARS: tall thick cupped fox ears (the sheet's head close-up, W units)
# The left ear: the base centre on the upper side of the skull, the tip at (0.392, 0.832) (front view); the base slopes (its outer corner
# lower, on the head's outline at z ~0.41); the opening faces forward, turned 18 deg outward; a cup 0.07 W deep; 0.072 W thick at the
# root, 0.036 W near the tip, with a rolled rim. The root rows run 0.1 W down into the skull (hidden). Lavender inside (#c8a8ff).
EAR_BC = np.array([.300, .000, .490]); EAR_TIP = np.array([.392, -.035, .832])
EAR_HW = .180; EAR_TILT = .085; EAR_OUT_DEG = 18.; EAR_CUP = .052; EAR_T0, EAR_T1 = .090, .056
ear_info = {}; EAR_GRID = {}
def ear_frame(side):
    m = np.array([side, 1, 1.]); Bc = EAR_BC * m; Tp = EAR_TIP * m
    A = unit(Tp - Bc); f0 = np.array([0, -1., 0]); f0 = unit(f0 - A * (A @ f0))
    Nf = rot(A, side * math.radians(EAR_OUT_DEG)) @ f0
    if Nf[0] * side < 0: Nf = rot(A, -side * math.radians(EAR_OUT_DEG)) @ f0
    E = unit(np.cross(A, Nf))
    if E[0] * side < 0: E = -E
    return Bc, Tp, A, Nf, E
for side, tag in ((1, 'L'), (-1, 'R')):
    Bc, Tp, A, Nf, E = ear_frame(side); Lr = float(np.linalg.norm(Tp - Bc))
    nv, nu = 22, 15
    vv = np.concatenate([np.linspace(-.30, 0, 4)[:-1], np.linspace(0, .965, nv - 3)]); uu = np.linspace(-1, 1, nu)
    VV, UU = np.meshgrid(vv, uu, indexing='ij'); vc = np.clip(VV, 0, 1)
    wv = (1 - vc) ** .74 * (1 + .50 * vc * (1 - vc))
    cup = EAR_CUP * (1 - UU ** 2) * (.35 + .65 * wv)
    G = (Bc[None, None] + A * (Lr * VV)[..., None] + E * (UU * EAR_HW * wv)[..., None] - A * (UU * EAR_TILT * (1 - vc))[..., None]
         - Nf * cup[..., None] + Nf * (.018 * smooth(.5, 1., vc) * (1 - UU ** 2))[..., None])
    dV = np.gradient(G, axis=0); dU = np.gradient(G, axis=1); NG = unit(np.cross(dU, dV))
    if (NG * Nf).sum() < 0: NG = -NG
    rimw = smooth(.70, .98, np.abs(UU))
    thk = (EAR_T0 + (EAR_T1 - EAR_T0) * vc) * (1 + .50 * rimw) * W
    Gm = L2M(G.reshape(-1, 3)); Nm = NG.reshape(-1, 3)
    VVf = VV.reshape(-1); UUf = UU.reshape(-1)
    # the front (opening) sheet: lavender inside the rim, a soft white puff at the bottom, deeper (darker) in the cup
    lavv = (1 - smooth(.70 - .10 * VVf, .86 - .08 * VVf, np.abs(UUf))) * smooth(.02, .14, VVf) * (1 - smooth(.80, .93, VVf))
    lavv = lavv * (1 - .60 * smooth(.22, .04, VVf) * smooth(.2, -.6, UUf))
    sh_o = sval(Nm, hi=.16, lo=.14) - .10 * (1 - UUf ** 2) * smooth(.0, .3, VVf) * (1 - smooth(.6, .95, VVf)) + .06
    sh_i = sval(-Nm, hi=.18, lo=.18) + .02
    UVo = mix_uv('earmix', sh_o, lavv); UVi = mix_uv('earmix', sh_i, np.zeros(len(Gm))); UVr = mix_uv('earmix', sh_i + .06, np.zeros(len(Gm)))
    plain = np.zeros(len(Gm), bool); plain[:nu] = True
    Vt, Ft, UVt, Nt = thicken(Gm, grid_faces(nv, nu), Nm, thk.reshape(-1), UVo, UVi, UVr, rim=4, plain=plain)
    nb = len(Gm); extra = len(Vt) - 2 * nb
    if extra:   # the rim: shade from its own normals
        UVt = np.array(UVt, float); UVt[2 * nb:] = mix_uv('earmix', sval(Nt[2 * nb:], hi=.18, lo=.16) + .04, np.zeros(extra))
    make_obj('ear.' + tag, Vt, Ft, UVt, 'ear.' + tag, N=Nt)
    EAR_GRID[tag] = (Gm.reshape(-1, 3).copy(), VV.reshape(-1).copy())        # the mid-surface rows (for the rig's ear bones and weights)
    ear_info[tag] = {'base': L2M(Bc[None])[0].tolist(), 'mid': L2M((Bc + (Tp - Bc) * .5)[None])[0].tolist(), 'tip': L2M(Tp[None])[0].tolist(),
                     'facing': Nf.tolist()}
    LOG['ear_%s_tip_m' % tag] = [round(float(c), 3) for c in L2M(Tp[None])[0]]

print('STEP hair', flush=True)
# ============================================================== HAIR: the forelock crest (one smooth implicit mass, metres)
# The sheet's swirl: a comma lock from the top of the head sweeping down over her right forehead and curling right into a tip
# (W units in front view: the outline x -0.09 .. 0.25, z 0.33 .. 0.70), a rounded fill inside the curl, and a round lobe behind it on
# her left (x 0.12 .. 0.36, z 0.41 .. 0.65). Each part is a chain of ellipsoids lying on the head (thin along the head's normal).
CREST_PATH = [(.150, .660), (.075, .655), (.005, .625), (-.045, .565), (-.060, .495), (-.040, .430), (.010, .385), (.075, .358), (.150, .346), (.218, .350), (.262, .356)]
CREST_RX = np.array([.050, .058, .064, .066, .064, .060, .054, .046, .036, .026, .015])       # thickness (out of the head)
CREST_RY = np.array([.085, .095, .100, .100, .096, .088, .076, .062, .046, .032, .018])       # width (across the lock)
def chain_pts(path, n):
    P = np.array(path, float); t0 = np.linspace(0, 1, len(P)); t1 = np.linspace(0, 1, n)
    return np.stack([np.interp(t1, t0, P[:, 0]), np.interp(t1, t0, P[:, 1])], -1), t1
_cp, _ct = chain_pts(CREST_PATH, 26)
_crx = np.interp(_ct, np.linspace(0, 1, len(CREST_RX)), CREST_RX) * W; _cry = np.interp(_ct, np.linspace(0, 1, len(CREST_RY)), CREST_RY) * W
CREST_E = []
for k, (x_, z_) in enumerate(_cp):
    P_, n_ = head_point(x_, z_, yref=-.20, f=skull_sdf)
    tng = (L2M(np.array([[_cp[min(k + 1, len(_cp) - 1)][0], 0, _cp[min(k + 1, len(_cp) - 1)][1]]])) - L2M(np.array([[_cp[max(k - 1, 0)][0], 0, _cp[max(k - 1, 0)][1]]])))[0]
    tng = unit(tng - n_ * (tng @ n_)); acr = np.cross(n_, tng)
    CREST_E.append((P_ + n_ * _crx[k] * .30, np.array([n_, acr, tng]), np.array([_crx[k], _cry[k], max(_cry[k], _crx[k]) * 1.05])))
_fp, _fn = head_point(.085, .505, yref=-.20, f=skull_sdf)
FILL = (_fp + _fn * .018 * W, np.array([_fn, unit(np.cross(_fn, [0, 0, 1.])), unit(np.cross(np.cross(_fn, [0, 0, 1.]), _fn))]), np.array([.050, .120, .110]) * W)
_bp, _bn = head_point(.245, .535, yref=-.15, f=skull_sdf)
LOBE_B = (_bp + _bn * .012 * W, np.array([_bn, unit(np.cross(_bn, [0, 0, 1.])), unit(np.cross(np.cross(_bn, [0, 0, 1.]), _bn))]), np.array([.058, .112, .102]) * W)
def lock_sdf(p):
    d = np.full(len(p), 9.)
    for c_, ax_, r_ in CREST_E: d = smin(d, sd_ell(p, c_, ax_, r_), .010 * W)
    return d
def fill_sdf(p): return smin(sd_ell(p, *FILL), sd_ell(p, *LOBE_B), .030 * W)
def crest_sdf(p): return smin(lock_sdf(p), fill_sdf(p), .012 * W)
_cc = FILL[0] - FILL[1][0] * .02 * W
def crest_uv(NN, V):
    cr = crease(lock_sdf(V), fill_sdf(V), .012 * W)            # the soft shadow where the lock lies over the fill and the lobe
    return fur_uv(sval(NN, hi=.14, lo=.20, occ=.55 * cr), .10)
star_mesh('hair_crest', crest_sdf, _cc, 'hair', crest_uv, nth=22, nph=40, tmax=.42 * W, axis=FILL[1][0], ref=(0, 0, 1.))
CREST_TOP_M = float(max(v.co.z for v in parts['hair'][-1].data.vertices))
LOG['crest_top_m'] = round(CREST_TOP_M, 4)

print('STEP regalia', flush=True)
# ============================================================== THE FOX MASK (worn on her left side, turned 45 deg outward)
# A thick white kitsune mask: an oval face 0.21 x 0.30 W with two pointed ears and a short snout; its back follows the head (it is the
# part of the mask's shape outside the head), so it rests on her skull with no gap. Painted: dark indigo eye slits, red brow flames
# and cheek strokes, red-pink inner ears, a dark nose.
MK_YAW, MK_PITCH, MK_ROLL = 45., 6., 18.
_ey = rot([0, 0, 1.], math.radians(MK_YAW)) @ np.array([0, -1., 0]); _ey = unit(_ey + np.array([0, 0, math.sin(math.radians(MK_PITCH))]))
_ez0 = unit(np.array([0, 0, 1.]) - _ey * _ey[2]); _ez = rot(_ey, math.radians(MK_ROLL)) @ _ez0
if _ez[0] > 0: _ez = rot(_ey, -math.radians(MK_ROLL)) @ _ez0
_ex = unit(np.cross(_ey, _ez))
MK_AX = np.array([_ex, _ey, _ez])
MK_C = L2M(np.array([[.448, -.128, .438]]))[0]; MK_S = 1.15
def mask_shape(p):
    q = (p - MK_C) @ MK_AX.T / (W * MK_S)              # mask-local (a across, b out, c up), W units (unscaled)
    d = ell(q, [0, 0, 0], [.105, .060, .150])
    d = smin(d, ell(q, [0, .046, -.055], [.036, .040, .052]), .020)
    for sx in (-1, 1):
        qe = q - np.array([sx * .064, -.004, .128]); ca, sa = math.cos(sx * .32), math.sin(sx * .32)
        qe = np.stack([qe[:, 0] * ca + qe[:, 2] * sa, qe[:, 1], -qe[:, 0] * sa + qe[:, 2] * ca], -1)
        d = smin(d, ell(qe, [0, 0, 0], [.030, .030, .066]), .016)
    return d * W * MK_S
def mask_sdf(p): return smax(mask_shape(p), -(head_sdf(p) - .0010), .004)
# push the mask in until its back reaches the head (its shape must overlap the skull)
_g_ = (MK_C + (np.stack(np.meshgrid(np.linspace(-.08, .08, 9), np.linspace(-.12, .12, 11), indexing='ij'), -1).reshape(-1, 2) * W) @ MK_AX[[0, 2]])
LOG['mask_gap_mm'] = round(float(np.min(head_sdf(_g_ - MK_AX[1] * .030 * W)) * 1000), 1)
MASK_FRONT = MK_C + MK_AX[1] * .060 * W
MK_UV = (.20 * W * MK_S, .24 * W * MK_S)
def mask_uv(NN, V):
    q = (V - MK_C) @ MK_AX.T; front = (NN @ MK_AX[1]) > .05
    u = .5 + q[:, 0] / (2 * MK_UV[0]); v = .5 + q[:, 2] / (2 * MK_UV[1])
    u = np.where(front, u, .03); v = np.where(front, v, .03)
    return au('mask', clamp(u), clamp(v))
star_mesh('fox_mask', mask_sdf, MK_C + MK_AX[1] * .010 * W, 'regalia', mask_uv, nth=18, nph=32, tmax=.36 * W, axis=MK_AX[1], ref=MK_AX[2])

# ============================================================== THE GOLD CRESCENT KANZASHI (in front of her left ear, behind the mask)
def crest_or_head(p): return np.minimum(crest_sdf(p), head_sdf(p))
_kx, _kz = .300, .566
_ky = float(front_local(np.array([_kx]), np.array([_kz]), lambda q: crest_or_head(L2M(q)) / W)[0])
_kp = L2M(np.array([[_kx, _ky, _kz]]))[0]; _kn = gradL(crest_or_head, _kp[None])[0]
KN = unit(_kn + np.array([0, -.35, 0])); K2 = unit(np.array([0, 0, 1.]) - KN * KN[2]); K1 = unit(np.cross(K2, KN))
if K1[0] < 0: K1 = -K1
KR = .080 * W; KC = _kp + KN * .030 * W - K1 * .010 * W
_th = np.radians(np.linspace(62, 298, 21)); _tt = np.linspace(0, 1, 21)
kpath = KC + KR * (np.cos(_th)[:, None] * K1 + np.sin(_th)[:, None] * K2)
_kw = .030 * W * np.sin(PI * _tt) ** .75 + .004 * W; _kt = .012 * W * (.55 + .45 * np.sin(PI * _tt)) + .002 * W
sweep('kanzashi_moon', kpath, lambda k: (_kt[k], _kw[k]), 'regalia', ramp_sw('gold', hi=.30, add=.04), sides=12, normals=np.tile(KN, (21, 1)), p=.85)
lobe('kanzashi_bead', KC + K1 * KR * .92 + KN * .004 * W, np.array([.019, .019, .019]) * W, KN, 'regalia', ramp='gold', n=3, squash=0)
LOG['kanzashi_centre_m'] = [round(float(c), 4) for c in KC]

BODY_PIVOTS = {}; BODY_MEAS = {}; POST_JOIN = None; TAIL_ROOT = np.array([0, .085, .360])
if not HEAD_ONLY:
    # ============================================================== BODY AND KIMONO (metres; body axis x = 0; sheet front: 3.22 mm / px)
    RCY = 0.0
    def ind_uv(N, tone=0., occ=0., hi=.26, lo=.20): return mix_uv('indmix', sval(N, hi=hi, lo=lo, occ=occ), tone)
    print('BODY_STEP kimono top', flush=True)
    # ---------------------------------------------------------------- the kimono top: from inside the obi up under the head
    TZ = np.array([.405, .440, .475, .505, .530, .548, .563])
    TAX = np.array([.150, .152, .158, .162, .157, .140, .108])
    TAY = np.array([.124, .126, .130, .130, .124, .110, .088])
    tax_f = natspline(TZ, TAX); tay_f = natspline(TZ, TAY); TP = 2.3
    def torso_raw(a, z):
        a = np.asarray(a, float); z = np.asarray(z, float)
        return np.stack([tax_f(z) * spow(np.sin(a), 2 / TP), RCY - tay_f(z) * spow(np.cos(a), 2 / TP), z + 0 * a], -1)
    def torso_n(a, z, e=1e-4):
        da = torso_raw(np.asarray(a) + e, z) - torso_raw(np.asarray(a) - e, z)
        dz = torso_raw(a, np.asarray(z) + e) - torso_raw(a, np.asarray(z) - e)
        n = unit(np.cross(dz, da)); c = torso_raw(a, z) - np.stack([0 * np.asarray(a), RCY + 0 * np.asarray(a), np.asarray(z) * 0 + .48], -1)
        return np.where(((n * c).sum(-1) < 0)[..., None], -n, n)
    def torso_pt(a, z, off=0.): return torso_raw(a, z) + torso_n(a, z) * np.asarray(off, float)[..., None]
    def torso_a_of_x(x, z):
        s_ = np.clip(np.asarray(x, float) / tax_f(z), -.999, .999); return np.arcsin(spow(s_, TP / 2))
    NA_T, NZ_T = 32, 9
    zt_ = np.linspace(TZ[0], TZ[-1], NZ_T); at_ = np.linspace(0, 2 * PI, NA_T, endpoint=False)
    AA, ZZ = np.meshgrid(at_, zt_); Pt_ = torso_raw(AA, ZZ); Nt_ = torso_n(AA, ZZ)
    make_obj('robe_top', Pt_.reshape(-1, 3), grid_faces(NZ_T, NA_T, wrap=True), ind_uv(Nt_.reshape(-1, 3), .10), 'body', N=Nt_.reshape(-1, 3))
    # the lapels: gold bands from behind the neck over the shoulders down to the V at the obi top (her left panel over her right)
    ZX = .432; ZN = .552
    def band_x(z, s): return s * .100 * np.clip((z - ZX) / (ZN - ZX), 0, 1)
    for s, tag in ((1, 'L'), (-1, 'R')):
        zs = np.linspace(ZN, ZX + .004, 9)
        front_pts = [torso_pt(np.array([torso_a_of_x(band_x(z_, s), z_)]), np.array([z_]), .009 + .004 * (s > 0))[0] for z_ in zs]
        back_pts = [torso_pt(np.array([s * a_]), np.array([.552]), .008)[0] for a_ in (PI * .92, PI * .70, PI * .50, PI * .30)]
        path = cpath(back_pts + front_pts, 24)
        nrm = torso_n(np.array([math.atan2(p_[0], -(p_[1] - RCY)) for p_ in path]), np.clip(path[:, 2], TZ[0], TZ[-1]))
        sweep('lapel.' + tag, path, lambda k: (.0080, .0165), 'body', ramp_sw('gold', hi=.26, add=.02 + .02 * (s > 0)), sides=8,
              normals=nrm, p=.75, cap0=False, cap1=True)
        # the white juban collar just inside the gold band, at the top of the V
        zj = np.linspace(ZN, .492, 6)
        jpts = [torso_pt(np.array([torso_a_of_x(band_x(z_, s) - s * .026, z_)]), np.array([z_]), .006)[0] for z_ in zj]
        jback = [torso_pt(np.array([s * a_]), np.array([.552]), .006)[0] for a_ in (PI * .80, PI * .55, PI * .35)]
        jp = cpath(jback + jpts, 14)
        jn = torso_n(np.array([math.atan2(p_[0], -(p_[1] - RCY)) for p_ in jp]), np.clip(jp[:, 2], TZ[0], TZ[-1]))
        sweep('juban.' + tag, jp, lambda k: (.0060, .0120), 'body', ramp_sw('white', hi=.20, add=-.06), sides=8, normals=jn, p=.75, cap0=False, cap1=True)

    print('BODY_STEP obi', flush=True)
    # ---------------------------------------------------------------- the gold obi (sheet y 305..342: z 0.309..0.428) and its cord
    OBI_Z0, OBI_Z1 = .309, .428; OBI_ZC = (OBI_Z0 + OBI_Z1) / 2; OBI_H = OBI_Z1 - OBI_Z0
    NAS = 32; a_s = np.linspace(0, 2 * PI, NAS, endpoint=False)
    def waist(a, off):
        return np.stack([(.150 + off) * spow(np.sin(a), 2 / TP), RCY - (.124 + off) * spow(np.cos(a), 2 / TP), np.full(len(a), OBI_ZC)], -1)
    Pb = waist(a_s, .014); Nb = unit(np.stack([Pb[:, 0] / .164 ** 2, (Pb[:, 1] - RCY) / .138 ** 2, np.zeros(NAS)], -1))
    ab8 = np.linspace(0, 2 * PI, 10, endpoint=False)
    ring_tube('obi', Pb, lambda k: np.stack([.016 * spow(np.cos(ab8), .45), OBI_H / 2 * spow(np.sin(ab8), .35)], -1), 'body',
              lambda NN, tt, uu, V: ramp_uv('obi', sval(NN, hi=.26, lo=.20)), Nb, sides=10)
    Pc = waist(a_s, .014 + .0175); ac6 = np.linspace(0, 2 * PI, 6, endpoint=False)
    ring_tube('obi_cord', Pc + np.array([0, 0, -.004]), lambda k: np.stack([.0065 * np.cos(ac6), .0085 * np.sin(ac6)], -1), 'body',
              lambda NN, tt, uu, V: ramp_uv('cord', sval(NN, hi=.26, lo=.20)), Nb, sides=6)

    print('BODY_STEP skirt', flush=True)
    # ---------------------------------------------------------------- the kimono skirt: obi to the hem (z 0.098), flaring to 0.52 m wide
    SKZ0, SKZ1 = .432, .098; SKT = (.150, .124); SKH = (.246, .236, .214); SKF = 1.05; SKP = 2.2
    def skirt_g(t): return np.clip((np.asarray(t, float) - .30) / .70, 0, 1) ** SKF      # straight under the obi (no poke-through at its lower edge), then the flare
    def skirt_geom(a, t):
        g = skirt_g(t); ax_ = SKT[0] + (SKH[0] - SKT[0]) * g
        ay_ = np.where(np.cos(a) > 0, SKT[1] + (SKH[1] - SKT[1]) * g, SKT[1] + (SKH[2] - SKT[1]) * g)
        return np.stack([ax_ * spow(np.sin(a), 2 / SKP), RCY - ay_ * spow(np.cos(a), 2 / SKP), SKZ0 + (SKZ1 - SKZ0) * t + 0 * a], -1)
    def skirt_n(a, t, e=1e-4):
        P0 = skirt_geom(a, t); Pa = skirt_geom(a + e, t); Ptt = skirt_geom(a, np.minimum(t + e, 1.)) - skirt_geom(a, np.maximum(t - e, 0.))
        n = unit(np.cross(Pa - P0, Ptt)); ctr = np.stack([0 * P0[..., 0], RCY + 0 * P0[..., 0], P0[..., 2]], -1)
        return np.where(((n * (P0 - ctr)).sum(-1) < 0)[..., None], -n, n)
    NA_S, NZ_S = 48, 10
    a_k = np.linspace(0, 2 * PI, NA_S, endpoint=False); t_k = np.linspace(0, 1, NZ_S)
    AK, TK = np.meshgrid(a_k, t_k); Gs = skirt_geom(AK, TK); Ns = skirt_n(AK, TK)
    Vs = Gs.reshape(-1, 3); NNs = Ns.reshape(-1, 3); Fs = grid_faces(NZ_S, NA_S, wrap=True)
    fold = (.30 * np.exp(-(np.sin(AK * 3 + 1.0) / .55) ** 2) + .18 * np.exp(-(np.sin(AK * 5 - .4) / .45) ** 2)) * smooth(.15, .85, TK)
    UVo = ind_uv(NNs, fold.reshape(-1) + .04); UVi = ramp_uv('lining', sval(-NNs, hi=.10, lo=.10) - .10)
    plain = np.zeros(len(Vs), bool); plain[:NA_S] = True
    Vt, Ft, UVt, Nt = thicken(Vs, Fs, NNs, .018, UVo, UVi, UVo, rim=3, plain=plain)
    make_obj('skirt', Vt, Ft, UVt, 'skirt', N=Nt)
    # the gold hem trim (sheet y 398..410: z 0.09..0.13) and the front edge of her left panel (sheet x 178: x -0.087)
    Ph = skirt_geom(a_k, np.ones(NA_S)); Nh = skirt_n(a_k, np.full(NA_S, .999)); Nh[:, 2] = 0; Nh = unit(Nh)
    ah8 = np.linspace(0, 2 * PI, 8, endpoint=False)
    ring_tube('hem_trim', Ph + Nh * .008 + np.array([0, 0, .018]), lambda k: np.stack([.0105 * spow(np.cos(ah8), .6), .0205 * spow(np.sin(ah8), .5)], -1), 'skirt',
              lambda NN, tt, uu, V: ramp_uv('gold', sval(NN, hi=.26, lo=.20)), Nh, sides=8)
    zs_ = np.linspace(.318, .128, 11); fp_ = []; fn_ = []
    for z_ in zs_:
        t_ = (SKZ0 - z_) / (SKZ0 - SKZ1); g_ = skirt_g(t_); ax_ = SKT[0] + (SKH[0] - SKT[0]) * g_
        x_ = -.080 - .012 * t_; a_ = -np.arcsin(spow(np.clip(-x_ / ax_, 0, .999), SKP / 2))
        fp_.append(skirt_geom(np.array([a_]), np.array([t_]))[0]); fn_.append(skirt_n(np.array([a_]), np.array([t_]))[0])
    fp_ = np.array(fp_); fn_ = np.array(fn_)
    sweep('front_trim', fp_ + fn_ * .010, lambda k: (.0070, .0165), 'skirt', ramp_sw('gold', hi=.26, add=.03), sides=8, normals=fn_, p=.75)

    print('BODY_STEP back bow', flush=True)
    # ---------------------------------------------------------------- the big gold bow at the back of the obi (sheet back view: 0.27 m across)
    BOW_Y = RCY + .124 + .014 + .016
    BOW_C = np.array([0, BOW_Y + .020, OBI_ZC + .006])
    BW, BH = .104, .054
    for sg in (-1, 1):
        lc = BOW_C + np.array([sg * BW * .58, .014, .006])
        def loop_sdf(p, lc=lc, sg=sg):
            q = p - lc; xr = q[:, 0] * sg
            taper = .55 + .45 * smooth(-BW * .55, BW * .25, xr)
            d = ell(np.stack([q[:, 0], q[:, 1], q[:, 2] / taper], -1), [0, 0, 0], [BW * .62, .050, BH * 1.60])
            dim = np.exp(-((xr + BW * .05) / (BW * .22)) ** 2 - (q[:, 2] / (BH * .35)) ** 2) * smooth(-.01, .03, q[:, 1])
            return d + .010 * dim
        def loop_uv(NN, V, lc=lc, sg=sg):
            xr = (V[:, 0] - lc[0]) * sg
            return ramp_uv('obi', sval(NN, hi=.26, lo=.20, occ=.18 * smooth(-.02, -.10, xr)) + .03)
        star_mesh('bow_loop.%d' % sg, loop_sdf, lc, 'bow', loop_uv, nth=12, nph=22, tmax=.24, axis=(sg, 0, 0), ref=(0, 1., 0))
    lobe('bow_knot', BOW_C + np.array([0, .034, 0]), np.array([.030, .036, .042]), [0, 1., 0], 'bow', ramp='obi', n=3, occ_in=.05, squash=.05, pole=[0, 0, 1.])
    BOW_TAIL_Z = .232
    for sg in (-1, 1):
        n_ = 8; pts_ = []
        for j in range(n_):
            u = j / (n_ - 1); z_ = BOW_C[2] - .022 - (BOW_C[2] - .022 - BOW_TAIL_Z) * u
            P_ = np.array([sg * (.012 + .060 * u ** 1.1), 0, z_])
            tt_ = np.clip((SKZ0 - z_) / (SKZ0 - SKZ1), 0, 1)
            ay_back = SKT[1] + (SKH[2] - SKT[1]) * skirt_g(tt_)
            P_[1] = max(RCY + ay_back + .022, BOW_C[1] + .016 if u < .2 else -1)
            pts_.append(P_)
        pts_ = np.array(pts_)
        sweep('bow_tail.%d' % sg, pts_, lambda j: (.0095, .030 + .006 * j / 7), 'bow', ramp_sw('obi', hi=.26, add=.01), sides=10,
              normals=np.tile([0, 1., 0], (n_, 1)), p=.70)

    print('BODY_STEP sleeves and arms', flush=True)
    # ---------------------------------------------------------------- boxy hanging furisode sleeves (round 2)
    # Rings in vertical planes (normal +-X) from inside the shoulder out to the opening: a boxy superellipse section whose top follows
    # the arm and whose bottom hangs as a broad, nearly level bag (sheet front: the outer edge from z 0.385 down to 0.16, at x 0.318);
    # the bottom-outer corner is rounded; the gold band wraps the opening's edge; the indigo lining shows inside.
    ARM = {}; ARM_DEG = 36.; L_SL = .250; PAWK = 1.0
    SL_X0, SL_X1, SL_P = .118, .340, 3.0
    def sleeve_dims(t):
        t = np.asarray(t, float)
        zt = .565 - .180 * t ** .95 - .018 * smooth(.88, 1., t) ** 2
        zb = .168 + .232 * (1 - t) ** 2.2 + .048 * (1 - np.sqrt(np.clip(1 - ((t - .80) / .20) ** 2, 0, 1))) * (t > .80)
        hd = .070 + .058 * t ** .8
        return zt, zb, hd
    for s, tag in ((1, 'L'), (-1, 'R')):
        th = math.radians(ARM_DEG); ad = unit(np.array([s * math.sin(th), -.04, -math.cos(th)]))
        SH = np.array([s * .148, RCY, .505])
        NR = 12; ts = np.linspace(0, 1, NR) ** .85; NS = 24; sa = np.linspace(0, 2 * PI, NS, endpoint=False)
        rings = []
        for t in ts:
            zt, zb, hd = sleeve_dims(t); zc = (zt + zb) / 2; hh = (zt - zb) / 2
            x_ = s * (SL_X0 + (SL_X1 - SL_X0) * t); yc = RCY - .012 - .010 * t
            Y = yc + hd * spow(np.cos(sa), 2 / SL_P); Zr = zc + hh * spow(np.sin(sa), 2 / SL_P)
            rings.append(np.stack([np.full(NS, x_), Y, Zr], -1))
        G = np.array(rings)
        dS = np.roll(G, -1, 1) - np.roll(G, 1, 1); dK = np.gradient(G, axis=0)
        NG = unit(np.cross(dK, dS)); ctr = G.mean(1, keepdims=True)
        NG = np.where(((NG * (G - ctr)).sum(-1) < 0)[..., None], -NG, NG)
        V = G.reshape(-1, 3); NN = NG.reshape(-1, 3); nr_, ns_ = G.shape[:2]
        low = np.tile(np.clip(-np.sin(sa), 0, 1), nr_)
        tone = np.repeat(np.linspace(.02, .20, nr_), ns_) * (1 - .6 * low) + .16 * np.exp(-((np.tile(np.cos(sa), nr_) - .2) / .35) ** 2) * np.repeat(smooth(.2, .9, ts), ns_)
        UVo = ind_uv(NN, tone); UVi = ramp_uv('lining', sval(-NN, hi=.10, lo=.10) - .06)
        plain = np.zeros(len(V), bool); plain[:ns_] = True
        Vt, Ft, UVt, Nt = thicken(V, grid_faces(nr_, ns_, wrap=True), NN, .016, UVo, UVi, UVo, rim=3, plain=plain)
        make_obj('sleeve.' + tag, Vt, Ft, UVt, 'sleeve.' + tag, N=Nt)
        cu = G[-1]; cn_ = unit(NG[-1] + np.array([s * .25, 0, 0]))       # the band rides on the shell at the opening (its own normal there)
        ap6 = np.linspace(0, 2 * PI, 8, endpoint=False)
        ring_tube('sleeve_cuff.' + tag, cu + cn_ * .010, lambda k: np.stack([.0110 * spow(np.cos(ap6), .8), .0230 * spow(np.sin(ap6), .7)], -1), 'sleeve.' + tag,
                  lambda NN, tt, uu, V: ramp_uv('gold', sval(NN, hi=.26, lo=.20) + .02), cn_, sides=8)
        frs = [(cu.mean(0), np.array([s, 0, 0.]), None, None)]
        def along(t0, SH=SH, ad=ad): return SH + ad * t0
        EL = along(.130); WR = along(.285); PC = along(.322)
        fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
        def arm_sdf(p, SH=SH, WR=WR, ad=ad): return sd_capsule(p, SH + ad * .05, WR, (.040, .034))
        tsa = np.linspace(.06, .278, 7)
        ring_stack('fur_arm.' + tag, arm_sdf, SH[None] + ad[None] * tsa[:, None], np.tile(ad, (len(tsa), 1)), 'arm.' + tag,
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20), .10), sides=12, tmax=.12, ref=fwd, pole_start=False, pole_end=False)
        lat = unit(np.cross(ad, fwd)) * s
        paw_axes = np.array([ad, fwd, lat])
        thumb = PC + fwd * .029 - lat * .006 - ad * .010
        def paw_parts(p, WR=WR, PC=PC, paw_axes=paw_axes, thumb=thumb, ad=ad):
            d_w = sd_capsule(p, WR - ad * .02, PC - ad * .010, (.028, .032))
            d_paw = sd_ell(p, PC, paw_axes, (.041, .040, .037))
            d_t = sd_ell(p, thumb, paw_axes, (.017, .0145, .0145))
            return d_w, d_paw, d_t
        def paw_sdf(p, paw_parts=paw_parts):
            d_w, d_paw, d_t = paw_parts(p)
            return smin(smin(d_w, d_paw, .016), d_t, .008)
        def paw_uv(NN, V, paw_parts=paw_parts):
            d_w, d_paw, d_t = paw_parts(V)
            cr = crease(smin(d_w, d_paw, .016), d_t, .008) * .35
            return fur_uv(sval(NN, occ=1.0 * cr, hi=.22, lo=.18), .60)
        tt_ = np.linspace(0, .10, 201); inside = paw_sdf(PC[None] + ad[None] * tt_[:, None]) < 0
        reach = float(tt_[np.argmin(inside)]) if not inside.all() else .10
        tips = PC + ad * (reach - .005)
        tsp = np.concatenate([np.linspace(0, .45, 4)[:-1], np.linspace(.45, 1.0, 10)])
        cen = (WR - ad * .02)[None] + (tips - (WR - ad * .02))[None] * tsp[:, None]
        ring_stack('mitten_paw.' + tag, paw_sdf, cen, np.tile(ad, (len(tsp), 1)), 'arm.' + tag, paw_uv, sides=12, tmax=.10, ref=fwd)
        ARM[tag] = {'shoulder': SH.tolist(), 'elbow': EL.tolist(), 'wrist': WR.tolist(), 'palm': (PC - lat * .007).tolist(),
                    'grip_axis': fwd.tolist(), 'arm_dir': ad.tolist(), 'cuff_centre': frs[-1][0].tolist()}

    print('BODY_STEP legs feet', flush=True)
    # ---------------------------------------------------------------- short legs and small white feet (sheet: x +-0.135, 0.135 m wide, 0.09 m tall)
    LEG = {}
    for s, tag in ((1, 'L'), (-1, 'R')):
        HP = np.array([s * .070, RCY, .300]); AN = np.array([s * .120, RCY - .010, .068])
        def leg_sdf(p, HP=HP, AN=AN): return sd_capsule(p, HP, AN, (.050, .043))
        zs = np.linspace(.295, .078, 8)
        cen = np.array([HP + (AN - HP) * ((z_ - HP[2]) / (AN[2] - HP[2])) for z_ in zs])
        ring_stack('fur_leg.' + tag, leg_sdf, cen, np.tile(unit(AN - HP), (len(zs), 1)), 'body',
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20, occ=.10 * smooth(.16, .26, V[:, 2])), .10), sides=12, tmax=.16, ref=[0, -1., 0],
                   pole_start=False)
        FC = np.array([s * .128, -.030, .036]); FAX = rot([0, 0, 1], s * math.radians(8)).T
        toes = [FC + (np.array([o * .027, -.068, -.002]) @ FAX) for o in (-1, 0, 1)]
        def foot_parts(p, FC=FC, FAX=FAX, toes=toes, AN=AN):
            d_main = sd_ell(p, FC + np.array([0, .008, 0]), FAX, (.066, .086, .044))
            d_ank = sd_capsule(p, AN + np.array([0, 0, .012]), AN + np.array([0, -.008, -.022]), .043)
            d_t = [sd_ell(p, t, FAX, (.025, .029, .030)) for t in toes]
            return d_main, d_ank, d_t
        def foot_sdf(p, foot_parts=foot_parts):
            d_main, d_ank, d_t = foot_parts(p)
            d = smin(d_main, d_ank, .019); tt = smin(smin(d_t[0], d_t[1], .005), d_t[2], .005)
            d = smin(d, tt, .012)
            return smax(d, -(p[:, 2] - .002), .007)
        def foot_uv(NN, V, foot_parts=foot_parts):
            d_main, d_ank, d_t = foot_parts(V)
            cr = crease(d_t[0], d_t[1], .005) * .30 + crease(d_t[1], d_t[2], .005) * .30
            return fur_uv(sval(NN, occ=1.1 * cr + .10 * smooth(.015, .0, V[:, 2]), hi=.20, lo=.18), .60)
        star_mesh('fur_foot.' + tag, foot_sdf, FC + np.array([0, -.007, .016]), 'body', foot_uv, nth=10, nph=18, tmax=.20)
        LEG[tag] = {'hip': HP.tolist(), 'knee': (HP + (AN - HP) * .55).tolist(), 'ankle': AN.tolist(), 'toe': (FC + np.array([0, -.090, -.010]) @ FAX).tolist()}
    star_mesh('hips', lambda p: ell(p, [0, RCY, .315], [.140, .118, .080]), np.array([0, RCY, .315]), 'body', ramp_fn('lining', hi=.10, add=-.08), nth=6, nph=12, tmax=.30)

    def _vs(prefixes):
        out = []
        for g, obs in parts.items():
            for o in obs:
                if any(o.name.startswith(p) for p in prefixes): out += [list(o.matrix_world @ v.co) for v in o.data.vertices]
        return np.array(out)
    def _ext(v): return {'min': [round(float(c), 3) for c in v.min(0)], 'max': [round(float(c), 3) for c in v.max(0)], 'size': [round(float(c), 3) for c in np.ptp(v, 0)]}
    BODY_MEAS = {'body_parts_m': {k: _ext(_vs(v)) for k, v in {
        'robe_top': ['robe_top'], 'lapels': ['lapel'], 'obi': ['obi'], 'skirt': ['skirt'], 'hem_trim': ['hem_trim'], 'bow': ['bow_'],
        'sleeve_L': ['sleeve.L', 'sleeve_cuff.L'], 'paw_L': ['mitten_paw.L'], 'legs': ['fur_leg'], 'feet': ['fur_foot']}.items()}}
    BODY_MEAS['arm_angle_from_vertical_deg'] = ARM_DEG
    BODY_PIVOTS = {'arm.L': tuple(ARM['L']['shoulder']), 'arm.R': tuple(ARM['R']['shoulder']), 'sleeve.L': tuple(ARM['L']['shoulder']),
                   'sleeve.R': tuple(ARM['R']['shoulder']), 'body': (0, 0, 0), 'bow': tuple(BOW_C), 'skirt': (0, RCY, OBI_Z0)}
    def POST_JOIN():
        joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X'}
        joints.update({'hips': [0, RCY, .330], 'spine': [0, RCY, .400], 'chest': [0, RCY - .004, .480], 'neck': [0, RCY - .004, .545]})
        joints['head'] = [float(v) for v in O]
        joints['head_base'] = [0, float(HY + .05 * W), float(CHIN + .02 * W)]
        joints['jaw_pivot'] = [0, float(HY + NOSE_TIP_L * W + .16 * W), float(CHIN + .10 * W)]
        joints['eyes'] = {'R': eye_centers['R'], 'L': eye_centers['L']}
        joints['ears'] = {t: {k: [float(v) for v in ear_info[t][k]] for k in ('base', 'mid', 'tip')} for t in ('R', 'L')}
        joints['arms'] = {t: {k: ARM[t][k] for k in ('shoulder', 'elbow', 'wrist')} for t in ARM}
        joints['legs'] = LEG
        joints['palm_R'] = ARM['R']['palm']; joints['palm_L'] = ARM['L']['palm']
        joints['tailRoot'] = [float(v) for v in TAIL_ROOT]
        joints['tail_fan'] = {'model': '/models/tamamo-tail.glb', 'copies': 9, 'note': 'nine instances of the one tail, their roots at tailRoot (as BUILD.tamamo fans them)'}
        joints['mouth'] = MOUTH_INFO
        joints['bow'] = {'knot': BOW_C.tolist()}
        joints['mask'] = {'centre': MK_C.tolist(), 'facing': MK_AX[1].tolist(), 'up': MK_AX[2].tolist()}
        joints['kanzashi'] = KC.tolist()
        joints['notes'] = ['Phase 1: no rig, weights or animations. Same keys as the Toybox heroes (chewy-b / stella-toy joints.json), plus tailRoot.',
                           'head = the head-ball centre (the radial origin), not the nod pivot; head_base = a suggested nod pivot at the base of the skull.',
                           'Head skin = zero surface of one smooth implicit field (skull + ruff + muzzle + chin + nose), analytic normals.',
                           'Mouth: a sculpted "w" groove (closed) with 5 loops round it; the skin is cut along the parting (see mouth).',
                           'Eyelid holes ringed by 6 loops each, the rim rolled 4.5 mm in behind separate lens eyeballs; 5 loops round the nose.',
                           'Ears: separate pieces (Tamamo_ear_L / _R), 22 bend rows from the root (in the skull) to the tip; pivot = ears.base.',
                           'Sleeves (Tamamo_sleeve_L/_R): separate shells with 12 bend rings; the skirt (Tamamo_skirt) has 10 rings; the bow is separate.',
                           'Hair crest (Tamamo_hair) and regalia (Tamamo_regalia: mask + kanzashi) are rigid on the head.']
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
def lash_th(psi):      # the thick upper lash: thickest over the top-outer part, tapering into the inner corner; a thinner outer-lower line
    top = (.22 * np.sin(np.clip(psi, 0, PI)) ** .55 + .15 * np.exp(-((psi - .50) / .45) ** 2)) * smooth(-.10, .20, psi) * smooth(PI + .02, PI - .70, psi)
    outer = .10 * smooth(-1.05, -.45, psi) * smooth(.22, -.06, psi)
    return (.040 + 1.25 * top) * smooth(-.35, .05, psi) * smooth(PI + .35, PI - .05, psi) + outer
def paint_hit(d):
    P = radial_hit(d); t = np.linalg.norm(P - O, axis=1)
    bad = np.zeros(len(d), bool)
    for k in range(1, 9):
        tk = np.minimum(t + .012 * k, .52); bad |= head_sdf(O + d * tk[:, None]) < 0
    if bad.any(): P[bad] = radial_hit_outer(d[bad])
    return P
def ell_r(q, c, r): return np.sqrt((((q - np.array(c)) / np.array(r)) ** 2).sum(1))
def paint_head(U, V, P=None):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = paint_hit(d) if P is None else P; n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); qx, qz = q[:, 0], q[:, 2]; ax_ = np.abs(qx)
    fr = smooth(HY + .04, HY - .08, y)
    C = ramp_colour('fur', sval(n, hi=.12, lo=.20))
    # the white muzzle pad, the whisker pads and the chin
    qm_ = mirror(q)
    rm = np.minimum.reduce([ell_r(q, MUZ[0], np.array(MUZ[1]) * 1.18), ell_r(q, CHINB[0], np.array(CHINB[1]) * 1.12), ell_r(qm_, PAD[0], np.array(PAD[1]) * 1.6)])
    Lm = (1 - smooth(.78, 1.06, rm)) * fr
    C = mix(C, ramp_colour('white', sval(n, hi=.12, lo=.16)), Lm)
    # soft clay creases: the muzzle into the cheeks, the chin, the ruff tufts (fillet shading, never lines)
    qw = warped(q); dsk = skull(qw)
    druff = smin(ell(mirror(qw), *RUFF1), ell(mirror(qw), *RUFF2), K_RUFF)
    cr = .30 * crease(smin(dsk, druff, K_RUFF), muz_sdf(qw), K_MUZ) + .22 * crease(smin(dsk, muz_sdf(qw), K_MUZ), ell(qw, *CHINB), K_CHINB) + .45 * crease(dsk, druff, K_RUFF)
    C = mix(C, rgb('furdark'), clamp(cr) * .30)
    C = mix(C, rgb('furdark'), .35 * smooth(.06, -.02, qz) * smooth(-.15, -.75, n[:, 2]))      # the flat underside
    # blush
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .90 * (1 - smooth(.78, 1.02, r)) * fr * PAINT_OPTS['blush'])
    # brows: soft lavender arcs above the eyes
    t_ = np.linspace(0, 1, 9)
    for s in (-1, 1):
        Pb = np.stack([s * (.128 + .090 * t_), .305 + .022 * np.sin(PI * t_ ** .9) + .010 * t_], -1)
        hb = .0060 + .0090 * np.sin(PI * (.15 + .85 * t_)) ** .7
        near = (np.abs(qx - s * .17) < .12) & (qz > .27) & (qz < .40)
        a = np.zeros(len(x)); a[near] = stroke(qx[near], qz[near], Pb, hb, .006)
        C = mix(C, rgb('brow'), .85 * a * fr)
    # nose: dark indigo, a soft top highlight
    qq = q - NOSE_C; qq[:, 1] = qq[:, 1] - nose_recede(qq[:, 2]); widen = nose_widen(qq[:, 2]); qq[:, 2] = qq[:, 2] * nose_flat(qq[:, 2])
    rn = np.sqrt((qq[:, 0] / (NHW * widen)) ** 2 + (qq[:, 1] / NHD) ** 2 + (qq[:, 2] / NHH) ** 2)
    zr_ = (qz - NZW) / NHH; hw_ = NOSE_PW * (.55 + .45 * smooth(-1.0, .55, zr_)) * np.sqrt(np.clip(1 - np.clip(zr_ - .55, 0, 1) ** 2 / .45 ** 2 * .35, 0, 1))
    r2d = np.sqrt((qx / np.maximum(hw_, 1e-4)) ** 2 + ((zr_ - .03) / 1.03) ** 2)
    deep = (q[:, 1] - NOSE_TIP_L)
    nose_m = (1 - smooth(.94, 1.02, r2d)) * smooth(.06, .04, deep) * (n[:, 1] < .2)
    nose_c = ramp_colour('nose', sval(n, hi=.10, lo=.22) - .02)
    C = mix(C, nose_c, .98 * np.maximum(nose_m, 1 - smooth(1.05, 1.12, rn)))
    rh_ = np.sqrt(((qq[:, 0] + .006) / .016) ** 2 + ((qq[:, 2] - .009) / .0075) ** 2) + 9 * (qq[:, 1] > .012)
    C = mix(C, rgb('nosehi'), .70 * (1 - smooth(.40, 1.0, rh_)) * np.maximum(rn < 1.10, nose_m > .5))
    # the sculpted mouth: no painted line; only a darker shade on the groove walls, by depth behind the un-grooved surface
    mb = (fr > 0) & mouth_mask(q) & (q[:, 2] < NZW - .80 * NHH)
    if mb.any():
        dep = -head_local_pre(q[mb])
        C[mb] = mix(C[mb], mix(rgb('#9A5A6C'), rgb('mouth'), smooth(.0012, .0032, dep)), .97 * smooth(.0004, .0016, dep))
    # the eyes: the thick dark-indigo upper lash with its wing (two flicks), the outer-lower line, a soft lower rim
    for s in (-1, 1):
        sr, psi, X, Z = eye_s3(s, P)
        near_eye = fr * (sr < 2.4)
        th = lash_th(psi)
        lash = (1 - smooth(1 + th - .018, 1 + th + .018, sr)) * smooth(.005, .03, th)
        low = (1 - smooth(1.020, 1.060, sr)) * smooth(.10, -.40, np.sin(psi)) * smooth(.0, .6, X)
        Zp = Z + EYE_SH * X
        wing = np.zeros(len(x)); nw = near_eye > 0
        for (p0, p1, w0) in (((.86, .44), (1.42, .90), .150), ((.66, .70), (1.02, 1.10), .085)):
            tt_ = np.linspace(0, 1, 7)
            Pw = np.stack([p0[0] + (p1[0] - p0[0]) * tt_, p0[1] + (p1[1] - p0[1]) * tt_ ** 1.25], -1)
            hw_w = w0 * (1 - .88 * tt_)
            wv = np.zeros(len(x)); wv[nw] = stroke(X[nw], Zp[nw], Pw, hw_w, .014)
            wing = np.maximum(wing, wv)
        C = mix(C, rgb('lash'), np.maximum(np.maximum(lash, wing) * PAINT_OPTS['lash'], .40 * low) * near_eye)
    return C.reshape(sh + (3,))

AA_COUNT = [0]
def paint_head_aa(U, V):
    """the head chart, with 3x3 supersampling where the thin painted lines live (the mouth groove shade, the nose edge)"""
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P0 = paint_hit(d); q = M2L(P0); C = paint_head(U, V, P0)
    front = (np.abs(q[:, 0]) < .16) & (q[:, 2] > .05) & (q[:, 2] < .20) & (q[:, 1] < -.25)
    near = np.zeros(len(q), bool)
    if front.any():
        qf = q[front]; _ma2 = mouth_arch(np.linspace(-1.05, 1.05, 90), True)
        dm = np.min(np.hypot(qf[:, 0:1] - _ma2[None, :, 0], qf[:, 2:3] - _ma2[None, :, 1]), axis=1)
        dph = np.where((qf[:, 2] < NZW) & (qf[:, 2] > MA_C - .005), np.abs(qf[:, 0]), 9.)
        zr_ = (qf[:, 2] - NZW) / NHH
        hw_ = NOSE_PW * (.55 + .45 * smooth(-1.0, .55, zr_)) * np.sqrt(np.clip(1 - np.clip(zr_ - .55, 0, 1) ** 2 / .45 ** 2 * .35, 0, 1))
        r2d = np.sqrt((qf[:, 0] / np.maximum(hw_, 1e-4)) ** 2 + ((zr_ - .03) / 1.03) ** 2)
        near[np.where(front)[0]] = (dm < .014) | (dph < .007) | ((r2d > .80) & (r2d < 1.20))
    if near.any():
        x0, y0, w, h = CHARTS['head']; du = 1. / (w - 12); dv = 1. / (h - 12)
        Uf = U.ravel()[near]; Vf = V.ravel()[near]; acc = np.zeros((len(Uf), 3))
        for a in (-1 / 3, 0., 1 / 3):
            for b in (-1 / 3, 0., 1 / 3):
                acc += paint_head(Uf + a * du, Vf + b * dv)
        Cf = C.reshape(-1, 3); Cf[near] = acc / 9; C = Cf.reshape(sh + (3,))
    AA_COUNT[0] += int(near.sum())
    return C

IRIS_R_W = .073                     # the iris radius in the eye plane (W units): it nearly fills the opening's height, as on the sheet
def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = eye_norm(X, Z)[0]
    hw = EYEF[s]['hw'] / W; hh = EYEF[s]['hh'] / W
    Xm = X * hw; Zm = (Z + EYE_SH * X) * hh                       # metric eye-plane coordinates (W units), outward / up
    R = IRIS_R_W; ixm = -.18 * hw; izm = .00 * hh                 # the iris tucked toward the nose (sheet close-up)
    C = mix(rgb('sclera'), rgb('#E9D7DC'), .65 * smooth(.20, .95, Z))
    ex = (Xm - ixm) / R; ez = (Zm - izm) / R; r = np.sqrt(ex * ex + ez * ez)
    g = smooth(.75, -.85, ez)
    I = mix(rgb('irisdark'), rgb('iris'), smooth(.10, .62, g))
    I = mix(I, rgb('irisglow'), .70 * smooth(.58, 1.0, g) * (1 - smooth(.70, .94, r)))
    I = mix(I, rgb('#8E1236'), .90 * smooth(.80, .98, r))
    I = I * (1 - .045 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 24 + r * 9)) * smooth(.40, .78, r))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    pxm = ixm - .10 * R; pzm = izm + .14 * R
    Rp = np.sqrt(((Xm - pxm) / (.50 * R)) ** 2 + ((Zm - pzm) / (.60 * R)) ** 2)
    C = mix(C, mix(rgb('pupil'), rgb('#6A1430'), .45 * smooth(.2, -1., (Zm - pzm) / (.60 * R))), 1 - smooth(.94, 1.06, Rp))
    # two catchlights, the same light for both eyes (upper left on screen): a big round one and a small one
    ox = -s                                                       # +1 = toward screen right in outward units
    big = np.sqrt(((Xm - (ixm - ox * .42 * R)) / (.21 * R)) ** 2 + ((Zm - (izm + .42 * R)) / (.19 * R)) ** 2)
    small = np.sqrt(((Xm - (ixm + ox * .30 * R)) / (.10 * R)) ** 2 + ((Zm - (izm + .28 * R)) / (.095 * R)) ** 2)
    C = mix(C, rgb('#FFFBF6'), np.maximum(1 - smooth(.90, 1.08, big), .90 * (1 - smooth(.86, 1.10, small))))
    C = mix(C, rgb('lash'), smooth(.90, 1.0, sr) * smooth(-.20, .35, Z))
    C = mix(C, rgb('#C9AEB8'), .25 * smooth(.94, 1.02, sr) * smooth(.0, -.40, Z))
    skin = ramp_colour('fur', .45)
    return mix(C, skin, smooth(1.03, 1.07, sr))

def paint_mask(U, V):
    sh = U.shape; U = U.ravel(); V = V.ravel()
    a = (U - .5) * 2 * MK_UV[0] / W; c = (V - .5) * 2 * MK_UV[1] / W          # mask-local, W units
    k = np.clip(1 - (a / .105) ** 2 - (c / .150) ** 2, 0, 1); b = .060 * np.sqrt(k)
    nl = np.stack([a / .105 ** 2, b / .060 ** 2, c / .150 ** 2], -1); nl = unit(nl + np.array([0, 1e-3, 0]))
    nw = nl @ MK_AX
    C = ramp_colour('mask', sval(nw, hi=.16, lo=.14))
    aa = .006; A = np.abs(a)
    # the red-pink inner ears
    for sx in (-1, 1):
        dx = a - sx * .062; dz = c - .128
        tri = np.maximum(np.abs(dx) * 1.9 + (dz - .040) * .55, -(dz + .010))
        C = mix(C, rgb('maskpink'), .92 * (1 - smooth(-aa, aa, tri)))
    # the dark eye slits (outer end up), a red flame over each, red cheek strokes
    tt_ = np.linspace(0, 1, 7)
    eye_p = np.stack([.016 + .056 * tt_, .018 + .026 * tt_ ** 1.2], -1); eye_h = .013 * np.sin(PI * (.10 + .80 * tt_)) ** .8 + .002
    brow_p = np.stack([.010 + .070 * tt_, .058 + .036 * np.sin(PI * tt_ * .7) + .010 * tt_], -1); brow_h = .0055 * np.sin(PI * (.08 + .84 * tt_)) ** .6 + .0015
    chk_p = np.stack([.044 + .028 * tt_, -.004 - .052 * tt_ ** .9], -1); chk_h = .0060 * (1 - .75 * tt_) + .0012
    chk2_p = np.stack([.062 + .022 * tt_, .002 - .032 * tt_], -1); chk2_h = .0045 * (1 - .7 * tt_) + .0010
    C = mix(C, rgb('maskred'), .95 * np.maximum.reduce([stroke(A, c, brow_p, brow_h, aa * .6), stroke(A, c, chk_p, chk_h, aa * .6), stroke(A, c, chk2_p, chk2_h, aa * .6)]))
    C = mix(C, rgb('lash'), .97 * stroke(A, c, eye_p, eye_h, aa * .6))
    # the nose at the snout tip and a small red mouth
    C = mix(C, rgb('lash'), .95 * (1 - smooth(.008, .012, np.hypot(a, (c + .068) * 1.2))))
    C = mix(C, rgb('maskred'), .80 * stroke(a, c, np.array([[-.020, -.090], [0., -.096], [.020, -.090]]), np.array([.0025, .003, .0025]), aa * .5))
    C = np.where(((U < .06) & (V < .06))[..., None], ramp_colour('mask', .45 + 0 * U), C)
    return C.reshape(sh + (3,))

def paint_ramp(U, V):
    rows = np.clip((V * CHARTS['ramp'][3] / 32).astype(int), 0, 15); C = np.zeros(U.shape + (3,))
    for name, k in RAMP_ROWS.items():
        m = rows == k
        if not m.any(): continue
        C[m] = ramp_colour(name, U[m])
    return C
def paint_furmix(U, V): return mix(ramp_colour('fur', U), ramp_colour('white', U), V)          # v: 0 fur .. 1 the white of the paws and muzzle
def paint_earmix(U, V): return mix(ramp_colour('fur', U), ramp_colour('lav', U), V)            # v: 0 fur .. 1 the lavender inner ear
def paint_indmix(U, V): return mix(ramp_colour('indigo', U), mix(ramp_colour('indigo', U + .20), rgb('#5A48A4'), .35), V)   # v: 0 indigo .. 1 a soft fold highlight
PAINTERS = {'head': paint_head_aa, 'eye.L': lambda U, V: paint_eye(U, V, 1), 'eye.R': lambda U, V: paint_eye(U, V, -1),
            'ramp': paint_ramp, 'furmix': paint_furmix, 'earmix': paint_earmix, 'indmix': paint_indmix, 'mask': paint_mask}
if RIG:
    PAINTERS['cavity'] = lambda U, V: mix(rgb('#4a1c2c'), rgb('#341220'), .55 * smooth(.25, 1., V))
    PAINTERS['tongue'] = lambda U, V: mix(rgb('#e07a8e'), rgb('#ee9aac'), .45 * smooth(.15, .9, V))
atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [246, 236, 228, 255]
MIX_CHARTS = ('furmix', 'earmix', 'indmix')
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
    if FAST_PAINT and name in ('head', 'mask'):      # FASTPAINT=1: geometry iterations only (a quarter-resolution head chart)
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
atlas_path = os.path.join(ROOT, 'scratch', 'head_atlas.png') if HEAD_ONLY else (os.path.join(ROOT, 'scratch', 'rig_base_atlas.png') if RIG else os.path.join(ROOT, 'tamamo-toy_atlas.png'))
write_png(atlas_path, atlas)
del atlas
img = bpy.data.images.load(atlas_path); img.name = 'Tamamo_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Tamamo_toy_atlas'); MAT.use_nodes = True
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
        'chin_z_m': CHIN, 'skull_top_m': LOG['skull_top_m'], 'crest_top_m': LOG.get('crest_top_m'),
        'heads_crest_to_chin': round(LOG.get('crest_top_m', 1.05) / (LOG.get('crest_top_m', 1.05) - CHIN), 3),
        'face_width_rows_W(z: width)': HR['widths(z: model)'], 'profile(z, behind the nose tip)': HR['profile(z, behind the nose tip)'],
        'nose_tip_y_m': round(float(nose_tip_y), 4), 'head_depth_W': HR['depth_at_z.25_W'],
        'eye_opening_W(front projection)': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'eye_centre_W': [EXW, EZW], 'iris_diameter_over_opening_width(front)': round(2 * IRIS_R_W * math.cos(math.radians(15)) / float(np.ptp(rimL[:, 0]) / W), 3),
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
PIVOTS = {'head': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'], 'hair': tuple(O), 'regalia': tuple(O),
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
    if group == 'tail': continue
    ob = finish_group(obs, OBJ_NAMES.get(group, 'Tamamo_' + group.replace('.', '_')), PIVOTS.get(group, (0, 0, 0)), MAT)
    ob['phase'] = '1: neutral A-pose, no armature'
    part_tri[ob.name] = len(ob.data.loop_triangles); objects.append(ob)
tri_count = sum(part_tri.values()); print('PART_TRIANGLES', json.dumps(part_tri), flush=True)
HEADSET = sum(v for k, v in part_tri.items() if k in ('Tamamo_head', 'Tamamo_eye_L', 'Tamamo_eye_R', 'Tamamo_ear_L', 'Tamamo_ear_R', 'Tamamo_hair', 'Tamamo_regalia'))
MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count; MEAS['head_eyes_ears_hair_regalia_triangles'] = HEADSET
_allv = np.concatenate([all_verts([o]) for o in objects])
MEAS['bounds_m'] = {'min': [round(float(c), 3) for c in _allv.min(0)], 'max': [round(float(c), 3) for c in _allv.max(0)]}
if RIG:
    pass
elif not HEAD_ONLY:
    if not os.environ.get('TAMAMO_NO_BUDGET'): assert tri_count <= 28000, ('Triangle budget', tri_count)
    if POST_JOIN: POST_JOIN()
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-head.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
if not RIG: print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not HEAD_ONLY and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'tamamo-toy.blend'))
def export_sel(obs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs: ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                              export_animations=False)
if not RIG: export_sel(objects, OUT_MODEL)
print('TAMAMO_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)


# ============================================================== THE ONE TAIL (tamamo-tail.glb: vertex colours only, instanced x9 by the game)
# The sheet's "ONE TAIL x9" callout: a big smooth plume, a narrow root, fat in the middle (0.30 m across at 0.8 m long: the sheet's back
# view draws each tail 0.38 of its length wide), tapering to a soft point; white #f8eee6 at the root, through lavender #d8c8ff to the
# pale-blue foxfire tip #9ad0ff, with a soft feathered boundary. Root at the origin, pointing up +Z; the plume bulges a little forward
# (-Y) through its middle and curls back (+Y) toward the tip. One object `body`, <= 1,500 triangles.
TAIL_L = .85                       # the sheet's side view: the top tail is 0.88 m long; the brief: about 0.8 m
def srgb2lin(c): c = np.asarray(c, float); return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)
TAIL_CP = np.array([[0, 0, 0], [0, -.012, .080], [0, -.030, .200], [0, -.036, .340], [0, -.022, .480], [0, .012, .600], [0, .056, .700], [0, .100, .772]]) * np.array([1, 1, TAIL_L / .80])
TAIL_R_T = np.array([0, .05, .15, .30, .42, .55, .67, .80, .90, .96, 1.0]); TAIL_R = np.array([.026, .034, .070, .112, .128, .124, .104, .072, .042, .022, .005])
TAIL_INFO = {}
def build_tail():
    path = cpath(TAIL_CP, 160); seg = np.linalg.norm(np.diff(path, axis=0), axis=1); s_ = np.concatenate([[0], np.cumsum(seg)]); s_ /= s_[-1]
    tk = np.linspace(0, 1, 36); tk = tk ** 1.0
    P = np.stack([np.interp(tk, s_, path[:, i]) for i in range(3)], -1)
    R = np.interp(tk, TAIL_R_T, TAIL_R)
    cols = {}
    def tail_uv(NV, tt, uu, V):
        tt = np.asarray(tt, float); ph = np.asarray(uu, float) * 2 * PI
        t1 = .50 + .030 * np.sin(4 * ph + .5) + .014 * np.sin(9 * ph + 1.3)
        t2 = .745 + .026 * np.sin(5 * ph + 2.0) + .012 * np.sin(11 * ph)
        lav = smooth(t1 - .065, t1 + .065, tt); blu = smooth(t2 - .075, t2 + .075, tt)
        base = mix(mix(rgb('#F8EEE6'), rgb('#D8C8FF'), lav), rgb('#9AD0FF'), blu)
        dark = mix(mix(rgb('#DCCDCF'), rgb('#B8A4EA'), lav), rgb('#76AEEA'), blu)
        light = mix(mix(rgb('#F8F3EE'), rgb('#E6DAFF'), lav), rgb('#B4DEFF'), blu)
        sv = sval(NV, hi=.26, lo=.24, occ=.10 * smooth(.12, .0, tt)) + .08 * blu
        C = np.where((sv < .5)[:, None], mix(dark, base, smooth(0, .5, sv)), mix(base, light, smooth(.5, 1, sv)))
        cols['c'] = C
        return np.zeros((len(V), 2))
    ob = sweep('tail_body', P, lambda k: (R[k], R[k] * .80), 'tail', tail_uv, sides=18, up_hint=[0, 1., 0])
    me = ob.data
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    lin = srgb2lin(clamp(cols['c'])); rgba = np.concatenate([lin, np.ones((len(lin), 1))], 1).astype(np.float32)
    ca.data.foreach_set('color', rgba.ravel()); me.color_attributes.active_color = ca
    if me.uv_layers: me.uv_layers.remove(me.uv_layers[0])
    m = bpy.data.materials.new('Tamamo_tail'); m.use_nodes = True
    b_ = next(n_ for n_ in m.node_tree.nodes if n_.type == 'BSDF_PRINCIPLED'); b_.inputs['Roughness'].default_value = .8
    b_.inputs['Metallic'].default_value = 0; b_.inputs['Specular IOR Level'].default_value = .25
    vc = m.node_tree.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; m.node_tree.links.new(vc.outputs['Color'], b_.inputs['Base Color'])
    parts['tail'] = [ob]
    tob = finish_group([ob], 'body', (0, 0, 0), m)
    tob.data.calc_loop_triangles()
    TAIL_INFO.update({'triangles': len(tob.data.loop_triangles), 'length_m': round(float(np.linalg.norm(np.diff(P, axis=0), axis=1).sum()), 3),
                      'max_width_m': round(float(2 * R.max()), 3), 'height_m': round(float(max(v.co.z for v in tob.data.vertices)), 3)})
    return tob
if not HEAD_ONLY and not RIG:
    for ob in objects: ob.hide_set(True)
    tail_ob = build_tail()
    assert TAIL_INFO['triangles'] <= 1500, ('Tail budget', TAIL_INFO)
    export_sel([tail_ob], TAIL_MODEL)
    print('TAIL', json.dumps(TAIL_INFO), flush=True)
    # a preview-only scene: her with the nine-tail fan laid out as the sheet draws it (back view: the tails at 0, +-33, +-58, +-80, +-100 deg
    # from vertical; side view: the top tail leans ~25 deg back). Same construction as BUILD.tamamo (game Euler ZXY: x = lean, z = fan
    # angle; in Blender: about -Y by the fan angle, after about +X by the lean), roots at tailRoot. The game's own rest pose (z = 3.3 u,
    # x = -0.5 - (0.5 - |u|) * 0.5) leans the tails further back.
    fan = []
    FAN_A = [-100, -80, -58, -33, 0, 33, 58, 80, 100]
    for i in range(9):
        u = i / 8 - .5; a_ = math.radians(FAN_A[i]); rx_ = -.42 - .06 * (1 - 2 * abs(u))
        c_ = tail_ob.copy(); c_.name = 'fan_tail_%d' % i; bpy.context.collection.objects.link(c_)
        Rm = Matrix.Rotation(a_, 4, Vector((0, -1, 0))) @ Matrix.Rotation(rx_, 4, Vector((1, 0, 0)))
        c_.matrix_world = Matrix.Translation(Vector(TAIL_ROOT.tolist())) @ Rm; fan.append(c_)
    for ob in objects: ob.hide_set(False)
    export_sel(objects + fan, os.path.join(ROOT, 'scratch', 'tamamo-fan-preview.glb'))
    MEAS['tail'] = TAIL_INFO
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
    print('FAN_PREVIEW_DONE', flush=True)
